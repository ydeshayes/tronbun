/**
 * macOS CDP Emulation Layer
 *
 * Emulates CDP functionality using WKWebView APIs.
 * Note: Some CDP features are not fully available on macOS.
 */

#ifdef __APPLE__

#import "platform_cdp.h"
#import <WebKit/WebKit.h>
#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <map>
#include <vector>
#include <mutex>
#include <atomic>
#include <string>

// Forward declaration
static WKWebView* get_wkwebview_from_window(void* window);

// CDP event subscription
struct CDPSubscription {
    std::string event_name;
    cdp_event_callback_t callback;
    void* user_data;
};

// Global state for macOS CDP emulation
struct MacOSCDPState {
    WKWebView* webview = nil;
    std::map<int, CDPSubscription> subscriptions;
    std::atomic<int> nextSubscriptionId{1};
    std::mutex mutex;
    bool networkEnabled = false;
};

static std::map<void*, MacOSCDPState*> g_cdp_states;
static std::mutex g_states_mutex;

// Helper to get or create CDP state
static MacOSCDPState* get_cdp_state(void* webview_window, bool create = true) {
    std::lock_guard<std::mutex> lock(g_states_mutex);
    auto it = g_cdp_states.find(webview_window);
    if (it != g_cdp_states.end()) {
        return it->second;
    }
    if (create) {
        auto state = new MacOSCDPState();
        state->webview = get_wkwebview_from_window(webview_window);
        g_cdp_states[webview_window] = state;
        return state;
    }
    return nullptr;
}

// Helper to get WKWebView from window
static WKWebView* get_wkwebview_from_window(void* window) {
    if (!window) return nil;
    NSWindow* nsWindow = (__bridge NSWindow*)window;
    NSView* contentView = [nsWindow contentView];

    // Find WKWebView in view hierarchy
    for (NSView* subview in [contentView subviews]) {
        if ([subview isKindOfClass:[WKWebView class]]) {
            return (WKWebView*)subview;
        }
        for (NSView* subsubview in [subview subviews]) {
            if ([subsubview isKindOfClass:[WKWebView class]]) {
                return (WKWebView*)subsubview;
            }
        }
    }
    return nil;
}

// Helper to escape JSON string
static NSString* jsonEscapeString(NSString* str) {
    if (!str) return @"";
    NSMutableString* escaped = [NSMutableString stringWithCapacity:str.length];
    for (NSUInteger i = 0; i < str.length; i++) {
        unichar c = [str characterAtIndex:i];
        switch (c) {
            case '\\': [escaped appendString:@"\\\\"]; break;
            case '"': [escaped appendString:@"\\\""]; break;
            case '\n': [escaped appendString:@"\\n"]; break;
            case '\r': [escaped appendString:@"\\r"]; break;
            case '\t': [escaped appendString:@"\\t"]; break;
            default:
                if (c < 0x20) {
                    [escaped appendFormat:@"\\u%04x", c];
                } else {
                    [escaped appendFormat:@"%C", c];
                }
        }
    }
    return escaped;
}

extern "C" {

int platform_cdp_init(void* webview_window) {
    MacOSCDPState* state = get_cdp_state(webview_window);
    return state ? 0 : -1;
}

void platform_cdp_cleanup(void* webview_window) {
    std::lock_guard<std::mutex> lock(g_states_mutex);
    auto it = g_cdp_states.find(webview_window);
    if (it != g_cdp_states.end()) {
        delete it->second;
        g_cdp_states.erase(it);
    }
}

void platform_cdp_call(void* webview_window, const char* method, const char* params,
                       cdp_result_callback_t callback, void* user_data) {
    if (!callback) return;

    MacOSCDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) {
        callback(nullptr, "WKWebView not available", user_data);
        return;
    }

    NSString* methodStr = method ? [NSString stringWithUTF8String:method] : @"";
    NSString* paramsStr = params ? [NSString stringWithUTF8String:params] : @"{}";

    // Route to appropriate emulation handler
    if ([methodStr hasPrefix:@"Runtime.evaluate"]) {
        // Parse expression from params
        NSData* paramsData = [paramsStr dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary* paramsDict = [NSJSONSerialization JSONObjectWithData:paramsData options:0 error:nil];
        NSString* expression = paramsDict[@"expression"];

        if (expression) {
            [state->webview evaluateJavaScript:expression completionHandler:^(id result, NSError* error) {
                if (error) {
                    callback(nullptr, [[error localizedDescription] UTF8String], user_data);
                } else {
                    NSString* resultJson;
                    if (result) {
                        if ([NSJSONSerialization isValidJSONObject:@{@"result": @{@"value": result}}]) {
                            NSData* data = [NSJSONSerialization dataWithJSONObject:@{@"result": @{@"value": result}} options:0 error:nil];
                            resultJson = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
                        } else {
                            resultJson = [NSString stringWithFormat:@"{\"result\":{\"value\":\"%@\"}}", jsonEscapeString([result description])];
                        }
                    } else {
                        resultJson = @"{\"result\":{\"value\":null}}";
                    }
                    callback([resultJson UTF8String], nullptr, user_data);
                }
            }];
            return;
        }
    }

    // For unsupported methods, return empty result or error
    NSLog(@"[CDP macOS] Unsupported method: %@", methodStr);
    callback("{}", nullptr, user_data);
}

int platform_cdp_subscribe(void* webview_window, const char* event_name,
                           cdp_event_callback_t callback, void* user_data) {
    if (!callback || !event_name) return -1;

    MacOSCDPState* state = get_cdp_state(webview_window);
    if (!state) return -1;

    int subscriptionId = state->nextSubscriptionId++;

    std::lock_guard<std::mutex> lock(state->mutex);
    state->subscriptions[subscriptionId] = {event_name, callback, user_data};

    // Note: Most CDP events can't be properly emulated on macOS
    NSLog(@"[CDP macOS] Subscribed to event: %s (limited support)", event_name);

    return subscriptionId;
}

void platform_cdp_unsubscribe(void* webview_window, int subscription_id) {
    MacOSCDPState* state = get_cdp_state(webview_window, false);
    if (!state) return;

    std::lock_guard<std::mutex> lock(state->mutex);
    state->subscriptions.erase(subscription_id);
}

// ============================================================================
// Cookie operations using WKHTTPCookieStore
// ============================================================================

void platform_cdp_get_cookies(void* webview_window, const char* url,
                              cdp_result_callback_t callback, void* user_data) {
    if (!callback) return;

    MacOSCDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) {
        callback(nullptr, "WKWebView not available", user_data);
        return;
    }

    WKHTTPCookieStore* cookieStore = state->webview.configuration.websiteDataStore.httpCookieStore;
    NSURL* filterUrl = url ? [NSURL URLWithString:[NSString stringWithUTF8String:url]] : nil;

    [cookieStore getAllCookies:^(NSArray<NSHTTPCookie*>* cookies) {
        NSMutableArray* cookieArray = [NSMutableArray array];

        for (NSHTTPCookie* cookie in cookies) {
            // Filter by URL if provided
            if (filterUrl) {
                if (![cookie.domain hasSuffix:filterUrl.host] &&
                    ![filterUrl.host hasSuffix:cookie.domain]) {
                    continue;
                }
            }

            NSDictionary* cookieDict = @{
                @"name": cookie.name ?: @"",
                @"value": cookie.value ?: @"",
                @"domain": cookie.domain ?: @"",
                @"path": cookie.path ?: @"/",
                @"secure": @(cookie.isSecure),
                @"httpOnly": @(cookie.isHTTPOnly),
                @"session": @(cookie.isSessionOnly),
                @"expires": cookie.expiresDate ? @([cookie.expiresDate timeIntervalSince1970]) : [NSNull null]
            };
            [cookieArray addObject:cookieDict];
        }

        NSDictionary* result = @{@"cookies": cookieArray};
        NSData* jsonData = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        NSString* jsonStr = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];

        callback([jsonStr UTF8String], nullptr, user_data);
    }];
}

void platform_cdp_set_cookie(void* webview_window, const char* cookie_json,
                             cdp_result_callback_t callback, void* user_data) {
    if (!callback) return;

    MacOSCDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) {
        callback(nullptr, "WKWebView not available", user_data);
        return;
    }

    NSData* jsonData = [[NSString stringWithUTF8String:cookie_json ?: "{}"] dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary* cookieDict = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:nil];

    NSMutableDictionary* properties = [NSMutableDictionary dictionary];
    properties[NSHTTPCookieName] = cookieDict[@"name"];
    properties[NSHTTPCookieValue] = cookieDict[@"value"];
    properties[NSHTTPCookieDomain] = cookieDict[@"domain"];
    properties[NSHTTPCookiePath] = cookieDict[@"path"] ?: @"/";

    if ([cookieDict[@"secure"] boolValue]) {
        properties[NSHTTPCookieSecure] = @"TRUE";
    }

    if (cookieDict[@"expires"]) {
        NSNumber* expires = cookieDict[@"expires"];
        properties[NSHTTPCookieExpires] = [NSDate dateWithTimeIntervalSince1970:[expires doubleValue]];
    }

    NSHTTPCookie* cookie = [NSHTTPCookie cookieWithProperties:properties];
    if (cookie) {
        WKHTTPCookieStore* cookieStore = state->webview.configuration.websiteDataStore.httpCookieStore;
        [cookieStore setCookie:cookie completionHandler:^{
            callback("{\"success\":true}", nullptr, user_data);
        }];
    } else {
        callback(nullptr, "Invalid cookie properties", user_data);
    }
}

void platform_cdp_delete_cookies(void* webview_window, const char* name,
                                 const char* url, const char* domain,
                                 cdp_result_callback_t callback, void* user_data) {
    if (!callback) return;

    MacOSCDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) {
        callback(nullptr, "WKWebView not available", user_data);
        return;
    }

    NSString* cookieName = name ? [NSString stringWithUTF8String:name] : nil;
    NSString* cookieDomain = domain ? [NSString stringWithUTF8String:domain] : nil;

    WKHTTPCookieStore* cookieStore = state->webview.configuration.websiteDataStore.httpCookieStore;

    [cookieStore getAllCookies:^(NSArray<NSHTTPCookie*>* cookies) {
        dispatch_group_t group = dispatch_group_create();

        for (NSHTTPCookie* cookie in cookies) {
            BOOL shouldDelete = YES;

            if (cookieName && ![cookie.name isEqualToString:cookieName]) {
                shouldDelete = NO;
            }
            if (cookieDomain && ![cookie.domain isEqualToString:cookieDomain]) {
                shouldDelete = NO;
            }

            if (shouldDelete) {
                dispatch_group_enter(group);
                [cookieStore deleteCookie:cookie completionHandler:^{
                    dispatch_group_leave(group);
                }];
            }
        }

        dispatch_group_notify(group, dispatch_get_main_queue(), ^{
            callback("{\"success\":true}", nullptr, user_data);
        });
    }];
}

// ============================================================================
// PDF Generation
// ============================================================================

void platform_cdp_print_to_pdf(void* webview_window, const char* options_json,
                               cdp_result_callback_t callback, void* user_data) {
    if (!callback) return;

    MacOSCDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) {
        callback(nullptr, "WKWebView not available", user_data);
        return;
    }

    // Parse options
    NSDictionary* options = nil;
    if (options_json) {
        NSData* data = [[NSString stringWithUTF8String:options_json] dataUsingEncoding:NSUTF8StringEncoding];
        options = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    }

    // Use createPDFWithConfiguration which is async and works properly with the run loop
    // Available on macOS 11.0+
    if (@available(macOS 11.0, *)) {
        WKPDFConfiguration* pdfConfig = [[WKPDFConfiguration alloc] init];

        // Set page size (default A4 in points: 595.28 x 841.89)
        CGFloat paperWidth = [options[@"paperWidth"] doubleValue] ?: 8.27;   // inches
        CGFloat paperHeight = [options[@"paperHeight"] doubleValue] ?: 11.69;
        CGRect pageRect = CGRectMake(0, 0, paperWidth * 72.0, paperHeight * 72.0);
        pdfConfig.rect = pageRect;

        [state->webview createPDFWithConfiguration:pdfConfig completionHandler:^(NSData* pdfData, NSError* error) {
            if (error) {
                callback(nullptr, [[error localizedDescription] UTF8String], user_data);
                return;
            }

            if (pdfData && [pdfData length] > 0) {
                NSString* base64 = [pdfData base64EncodedStringWithOptions:0];
                NSString* result = [NSString stringWithFormat:@"{\"data\":\"%@\"}", base64];
                callback([result UTF8String], nullptr, user_data);
            } else {
                callback(nullptr, "No PDF data generated", user_data);
            }
        }];
    } else {
        // Fallback for older macOS - this may have limitations
        callback(nullptr, "PDF generation requires macOS 11.0 or later", user_data);
    }
}

// ============================================================================
// Input Events (using JavaScript)
// ============================================================================

void platform_cdp_dispatch_mouse_event(void* webview_window, const char* type,
                                       int x, int y, const char* button, int click_count,
                                       cdp_result_callback_t callback, void* user_data) {
    if (!callback) return;

    MacOSCDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) {
        callback(nullptr, "WKWebView not available", user_data);
        return;
    }

    // Convert CDP event type to JS event type
    NSString* jsEventType;
    NSString* typeStr = [NSString stringWithUTF8String:type ?: ""];

    if ([typeStr isEqualToString:@"mousePressed"]) {
        jsEventType = @"mousedown";
    } else if ([typeStr isEqualToString:@"mouseReleased"]) {
        jsEventType = @"mouseup";
    } else if ([typeStr isEqualToString:@"mouseMoved"]) {
        jsEventType = @"mousemove";
    } else {
        jsEventType = @"mousemove";
    }

    // Determine button number
    int buttonNum = 0;
    NSString* buttonStr = [NSString stringWithUTF8String:button ?: "left"];
    if ([buttonStr isEqualToString:@"right"]) buttonNum = 2;
    else if ([buttonStr isEqualToString:@"middle"]) buttonNum = 1;

    NSString* js = [NSString stringWithFormat:@
        "(function() {"
        "  var el = document.elementFromPoint(%d, %d);"
        "  if (el) {"
        "    var evt = new MouseEvent('%@', {"
        "      bubbles: true,"
        "      cancelable: true,"
        "      view: window,"
        "      clientX: %d,"
        "      clientY: %d,"
        "      button: %d,"
        "      detail: %d"
        "    });"
        "    el.dispatchEvent(evt);"
        "    if ('%@' === 'mouseup' && %d === 1) {"
        "      el.click();"
        "    }"
        "  }"
        "  return true;"
        "})()",
        x, y, jsEventType, x, y, buttonNum, click_count, jsEventType, click_count];

    [state->webview evaluateJavaScript:js completionHandler:^(id result, NSError* error) {
        if (error) {
            callback(nullptr, [[error localizedDescription] UTF8String], user_data);
        } else {
            callback("{}", nullptr, user_data);
        }
    }];
}

void platform_cdp_dispatch_key_event(void* webview_window, const char* type,
                                     const char* key, int modifiers,
                                     cdp_result_callback_t callback, void* user_data) {
    if (!callback) return;

    MacOSCDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) {
        callback(nullptr, "WKWebView not available", user_data);
        return;
    }

    NSString* typeStr = [NSString stringWithUTF8String:type ?: "keyDown"];
    NSString* keyStr = [NSString stringWithUTF8String:key ?: ""];

    NSString* jsEventType;
    if ([typeStr isEqualToString:@"keyDown"]) {
        jsEventType = @"keydown";
    } else if ([typeStr isEqualToString:@"keyUp"]) {
        jsEventType = @"keyup";
    } else {
        jsEventType = @"keypress";
    }

    NSString* js = [NSString stringWithFormat:@
        "(function() {"
        "  var evt = new KeyboardEvent('%@', {"
        "    bubbles: true,"
        "    cancelable: true,"
        "    key: '%@',"
        "    altKey: %@,"
        "    ctrlKey: %@,"
        "    metaKey: %@,"
        "    shiftKey: %@"
        "  });"
        "  document.activeElement.dispatchEvent(evt);"
        "  return true;"
        "})()",
        jsEventType, jsonEscapeString(keyStr),
        (modifiers & 1) ? @"true" : @"false",  // Alt
        (modifiers & 2) ? @"true" : @"false",  // Ctrl
        (modifiers & 4) ? @"true" : @"false",  // Meta
        (modifiers & 8) ? @"true" : @"false"]; // Shift

    [state->webview evaluateJavaScript:js completionHandler:^(id result, NSError* error) {
        if (error) {
            callback(nullptr, [[error localizedDescription] UTF8String], user_data);
        } else {
            callback("{}", nullptr, user_data);
        }
    }];
}

void platform_cdp_insert_text(void* webview_window, const char* text,
                              cdp_result_callback_t callback, void* user_data) {
    if (!callback) return;

    MacOSCDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) {
        callback(nullptr, "WKWebView not available", user_data);
        return;
    }

    NSString* textStr = [NSString stringWithUTF8String:text ?: ""];
    NSString* escapedText = jsonEscapeString(textStr);

    NSString* js = [NSString stringWithFormat:@
        "(function() {"
        "  var el = document.activeElement;"
        "  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {"
        "    if (el.isContentEditable) {"
        "      document.execCommand('insertText', false, '%@');"
        "    } else {"
        "      var start = el.selectionStart;"
        "      var end = el.selectionEnd;"
        "      el.value = el.value.substring(0, start) + '%@' + el.value.substring(end);"
        "      el.selectionStart = el.selectionEnd = start + %lu;"
        "      el.dispatchEvent(new Event('input', {bubbles: true}));"
        "    }"
        "  }"
        "  return true;"
        "})()",
        escapedText, escapedText, (unsigned long)[textStr length]];

    [state->webview evaluateJavaScript:js completionHandler:^(id result, NSError* error) {
        if (error) {
            callback(nullptr, [[error localizedDescription] UTF8String], user_data);
        } else {
            callback("{}", nullptr, user_data);
        }
    }];
}

// ============================================================================
// Network (limited support on macOS)
// ============================================================================

void platform_cdp_network_enable(void* webview_window,
                                 cdp_result_callback_t callback, void* user_data) {
    MacOSCDPState* state = get_cdp_state(webview_window);
    if (state) {
        state->networkEnabled = true;
        NSLog(@"[CDP macOS] Network monitoring enabled (limited support)");
    }
    if (callback) callback("{}", nullptr, user_data);
}

void platform_cdp_network_disable(void* webview_window,
                                  cdp_result_callback_t callback, void* user_data) {
    MacOSCDPState* state = get_cdp_state(webview_window);
    if (state) {
        state->networkEnabled = false;
    }
    if (callback) callback("{}", nullptr, user_data);
}

void platform_cdp_set_request_interception(void* webview_window, const char* patterns_json,
                                           cdp_result_callback_t callback, void* user_data) {
    // Request interception is very limited on macOS
    // Would need to use WKURLSchemeHandler which only works for custom schemes
    NSLog(@"[CDP macOS] Request interception not fully supported on macOS");
    if (callback) callback("{}", nullptr, user_data);
}

void platform_cdp_continue_request(void* webview_window, const char* request_id,
                                   const char* url, const char* method, const char* headers_json,
                                   cdp_result_callback_t callback, void* user_data) {
    NSLog(@"[CDP macOS] Request interception not fully supported on macOS");
    if (callback) callback("{}", nullptr, user_data);
}

void platform_cdp_fulfill_request(void* webview_window, const char* request_id,
                                  int status, const char* headers_json, const char* body_base64,
                                  cdp_result_callback_t callback, void* user_data) {
    NSLog(@"[CDP macOS] Request interception not fully supported on macOS");
    if (callback) callback("{}", nullptr, user_data);
}

void platform_cdp_fail_request(void* webview_window, const char* request_id,
                               const char* reason,
                               cdp_result_callback_t callback, void* user_data) {
    NSLog(@"[CDP macOS] Request interception not fully supported on macOS");
    if (callback) callback("{}", nullptr, user_data);
}

} // extern "C"

#endif // __APPLE__
