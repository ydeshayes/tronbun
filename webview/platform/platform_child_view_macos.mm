/**
 * Platform Child View Implementation for macOS
 *
 * Creates embedded WKWebView instances within a parent NSWindow.
 * Each child view is wrapped in an NSView container for positioning.
 *
 * Note: This file is compiled without ARC, using manual retain/release.
 */

#ifdef __APPLE__

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include "platform_child_view.h"
#include "../common/ipc_common.h"
#include <string.h>

#ifdef TRONBUN_CUSTOM_SCHEME
extern "C" void tronbun_register_url_scheme(void* configPtr);
#endif

// Forward declaration of struct
typedef struct child_view_data_macos_s child_view_data_macos_t;

/**
 * Message handler for child webview IPC
 * Receives messages from JavaScript and forwards them to the main IPC pipeline
 */
@interface TronbunChildMessageHandler : NSObject <WKScriptMessageHandler>
{
    child_view_data_macos_t* _viewData;
}
- (instancetype)initWithViewData:(child_view_data_macos_t*)viewData;
@end

/**
 * Container structure for child view data (C struct for manual memory management)
 */
struct child_view_data_macos_s {
    NSView* containerView;
    WKWebView* webView;
    WKWebViewConfiguration* config;
    TronbunChildMessageHandler* messageHandler;
    char viewId[256];
};

/**
 * Implementation of TronbunChildMessageHandler
 * Forwards IPC messages from child webviews to stdout for the main process
 */
@implementation TronbunChildMessageHandler

- (instancetype)initWithViewData:(child_view_data_macos_t*)viewData {
    self = [super init];
    if (self) {
        _viewData = viewData;
    }
    return self;
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    (void)userContentController;  // Suppress unused parameter warning

    if (![message.body isKindOfClass:[NSDictionary class]]) {
        NSLog(@"[ChildView IPC] Received non-dictionary message");
        return;
    }

    NSDictionary *body = (NSDictionary *)message.body;
    NSString *requestId = body[@"id"] ?: @"";
    NSString *requestJson = body[@"request"] ?: @"";

    // Output as ipc:call response that the TypeScript layer expects
    // Format: {"type":"ipc:call","seq":"<id>","req":["<id>","<json>"],"viewId":"<viewId>"}
    NSString *output = [NSString stringWithFormat:
        @"{\"type\":\"ipc:call\",\"seq\":\"%@\",\"req\":[\"%@\",%@],\"viewId\":\"%s\"}\n",
        requestId,
        requestId,
        [self jsonEscapeString:requestJson],
        _viewData->viewId];

    // Write to stdout
    const char *outputCStr = [output UTF8String];
    fwrite(outputCStr, 1, strlen(outputCStr), stdout);
    fflush(stdout);

    NSLog(@"[ChildView IPC] Forwarded message from viewId: %s", _viewData->viewId);
}

- (NSString *)jsonEscapeString:(NSString *)str {
    // Manually escape the string for JSON embedding
    // We need to escape: backslash, double quote, and control characters
    if (!str || str.length == 0) return @"\"\"";

    NSMutableString *escaped = [NSMutableString stringWithCapacity:str.length + 10];
    [escaped appendString:@"\""];

    for (NSUInteger i = 0; i < str.length; i++) {
        unichar c = [str characterAtIndex:i];
        switch (c) {
            case '\\': [escaped appendString:@"\\\\"]; break;
            case '"':  [escaped appendString:@"\\\""]; break;
            case '\n': [escaped appendString:@"\\n"]; break;
            case '\r': [escaped appendString:@"\\r"]; break;
            case '\t': [escaped appendString:@"\\t"]; break;
            default:
                if (c < 0x20) {
                    [escaped appendFormat:@"\\u%04x", c];
                } else {
                    [escaped appendFormat:@"%C", c];
                }
                break;
        }
    }

    [escaped appendString:@"\""];
    return escaped;
}

- (void)dealloc {
    _viewData = NULL;
    [super dealloc];
}

@end

extern "C" {

void* platform_create_child_view(void* parent_window, int debug, child_view_bounds_t bounds) {
    NSWindow *window = (NSWindow*)parent_window;
    if (!window) {
        NSLog(@"[ChildView] Error: parent_window is NULL");
        return NULL;
    }

    NSView *contentView = [window contentView];
    if (!contentView) {
        NSLog(@"[ChildView] Error: contentView is NULL");
        return NULL;
    }

    // Allocate container structure
    child_view_data_macos_t* data = (child_view_data_macos_t*)malloc(sizeof(child_view_data_macos_t));
    if (!data) {
        NSLog(@"[ChildView] Error: failed to allocate memory");
        return NULL;
    }
    memset(data, 0, sizeof(child_view_data_macos_t));

    // Get content view height for coordinate conversion
    // NSView uses bottom-left origin, but our API uses top-left
    CGFloat contentHeight = contentView.bounds.size.height;
    CGFloat flippedY = contentHeight - bounds.y - bounds.height;

    // Create container view at specified bounds
    NSRect frame = NSMakeRect(bounds.x, flippedY, bounds.width, bounds.height);
    data->containerView = [[NSView alloc] initWithFrame:frame];
    [data->containerView setAutoresizingMask:NSViewNotSizable];

    // Create WKWebView configuration
    data->config = [[WKWebViewConfiguration alloc] init];

#ifdef TRONBUN_CUSTOM_SCHEME
    // Register tronbun:// URL scheme handler (shares virtual FS with main webview)
    tronbun_register_url_scheme((void*)data->config);
#endif

    // Configure preferences
    WKPreferences *prefs = data->config.preferences;
    if (debug) {
        [prefs setValue:@YES forKey:@"developerExtrasEnabled"];
    }
    [prefs setValue:@YES forKey:@"fullScreenEnabled"];
    [prefs setValue:@YES forKey:@"javaScriptCanAccessClipboard"];
    [prefs setValue:@YES forKey:@"DOMPasteAllowed"];

    // Create WKWebView filling the container
    NSRect webViewFrame = NSMakeRect(0, 0, bounds.width, bounds.height);
    data->webView = [[WKWebView alloc] initWithFrame:webViewFrame configuration:data->config];
    [data->webView setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];

    // Enable inspector for debug builds (macOS 13.3+)
    if (debug) {
        if (@available(macOS 13.3, *)) {
            [data->webView setValue:@YES forKey:@"inspectable"];
        }
    }

    // Add webview to container
    [data->containerView addSubview:data->webView];

    // Add container to parent's content view
    [contentView addSubview:data->containerView];

    NSLog(@"[ChildView] Created at (%d, %d, %d, %d) flippedY=%.0f",
          bounds.x, bounds.y, bounds.width, bounds.height, flippedY);

    return data;
}

void platform_destroy_child_view(void* child_view) {
    if (!child_view) return;

    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;

    // Remove message handler first
    if (data->messageHandler && data->config) {
        [data->config.userContentController removeScriptMessageHandlerForName:@"tronbunChild"];
        [data->messageHandler release];
        data->messageHandler = nil;
    }

    // Remove views from hierarchy
    if (data->webView) {
        [data->webView removeFromSuperview];
        [data->webView release];
        data->webView = nil;
    }

    if (data->containerView) {
        [data->containerView removeFromSuperview];
        [data->containerView release];
        data->containerView = nil;
    }

    if (data->config) {
        [data->config release];
        data->config = nil;
    }

    free(data);
    NSLog(@"[ChildView] Destroyed");
}

void platform_set_child_bounds(void* child_view, child_view_bounds_t bounds) {
    if (!child_view) return;

    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    if (!data->containerView) return;

    // Get parent content view for coordinate conversion
    NSView *superview = [data->containerView superview];
    if (!superview) return;

    CGFloat contentHeight = superview.bounds.size.height;
    CGFloat flippedY = contentHeight - bounds.y - bounds.height;

    NSRect frame = NSMakeRect(bounds.x, flippedY, bounds.width, bounds.height);
    [data->containerView setFrame:frame];

    // Webview auto-resizes to fill container

    NSLog(@"[ChildView] Bounds updated to (%d, %d, %d, %d)",
          bounds.x, bounds.y, bounds.width, bounds.height);
}

void platform_set_child_visible(void* child_view, int visible) {
    if (!child_view) return;

    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    if (!data->containerView) return;

    [data->containerView setHidden:!visible];

    NSLog(@"[ChildView] Visibility set to %s", visible ? "visible" : "hidden");
}

void* platform_get_child_webview(void* child_view) {
    if (!child_view) return NULL;

    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    return (void*)data->webView;
}

void platform_bring_child_to_front(void* parent_window, void* child_view) {
    if (!parent_window || !child_view) return;

    NSWindow *window = (NSWindow*)parent_window;
    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    NSView *contentView = [window contentView];

    if (data->containerView && contentView) {
        // Remove and re-add at top of subview stack
        [data->containerView retain];
        [data->containerView removeFromSuperview];
        [contentView addSubview:data->containerView positioned:NSWindowAbove relativeTo:nil];
        [data->containerView release];

        NSLog(@"[ChildView] Brought to front");
    }
}

void platform_send_child_to_back(void* parent_window, void* child_view) {
    if (!parent_window || !child_view) return;

    NSWindow *window = (NSWindow*)parent_window;
    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    NSView *contentView = [window contentView];

    if (data->containerView && contentView) {
        // Remove and re-add at bottom of subview stack
        [data->containerView retain];
        [data->containerView removeFromSuperview];
        [contentView addSubview:data->containerView positioned:NSWindowBelow relativeTo:nil];
        [data->containerView release];

        NSLog(@"[ChildView] Sent to back");
    }
}

void platform_init_child_ipc(void* child_view, const char* view_id) {
    if (!child_view || !view_id) return;

    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    strncpy(data->viewId, view_id, sizeof(data->viewId) - 1);
    data->viewId[sizeof(data->viewId) - 1] = '\0';

    if (!data->webView || !data->config) {
        NSLog(@"[ChildView] Cannot init IPC: webView or config is NULL");
        return;
    }

    // Create and register the message handler for receiving JS calls
    data->messageHandler = [[TronbunChildMessageHandler alloc] initWithViewData:data];
    [data->config.userContentController addScriptMessageHandler:data->messageHandler
                                                           name:@"tronbunChild"];

    // Inject the tronbun IPC bridge JavaScript
    // Uses window.webkit.messageHandlers.tronbunChild.postMessage() for native calls
    NSString *ipcScript = [NSString stringWithFormat:@
        "(function() {"
        "  window.tronbun = {"
        "    viewId: '%s',"
        "    invoke: function(channel, data) {"
        "      return new Promise(function(resolve, reject) {"
        "        var id = Math.random().toString(36).substring(2);"
        "        window._bunwebview_pending = window._bunwebview_pending || {};"
        "        window._bunwebview_pending[id] = { resolve: resolve, reject: reject };"
        "        var request = JSON.stringify({"
        "          type: 'invoke',"
        "          channel: channel,"
        "          data: data,"
        "          id: id,"
        "          viewId: '%s'"
        "        });"
        "        console.log('Child invoke:', request);"
        "        window.webkit.messageHandlers.tronbunChild.postMessage({id: id, request: request});"
        "        resolve();"
        "      });"
        "    },"
        "    send: function(channel, data) {"
        "      var request = JSON.stringify({"
        "        type: 'send',"
        "        channel: channel,"
        "        data: data,"
        "        viewId: '%s'"
        "      });"
        "      window.webkit.messageHandlers.tronbunChild.postMessage({id: '', request: request});"
        "    }"
        "  };"
        "  window.bunwebview_receive = function(message) {"
        "    try {"
        "      var data = JSON.parse(message);"
        "      if (data.type === 'ipc:response' && data.id) {"
        "        var pending = window._bunwebview_pending && window._bunwebview_pending[data.id];"
        "        if (pending) {"
        "          delete window._bunwebview_pending[data.id];"
        "          pending.resolve(data.result);"
        "        }"
        "      } else if (data.type === 'ipc:error' && data.id) {"
        "        var pending = window._bunwebview_pending && window._bunwebview_pending[data.id];"
        "        if (pending) {"
        "          delete window._bunwebview_pending[data.id];"
        "          pending.reject(new Error(data.error));"
        "        }"
        "      }"
        "    } catch (e) {"
        "      console.error('Failed to process IPC message:', e);"
        "    }"
        "  };"
        "  console.log('Child IPC bridge initialized for viewId: %s');"
        "})();",
        data->viewId, data->viewId, data->viewId, data->viewId];

    WKUserScript *userScript = [[WKUserScript alloc]
        initWithSource:ipcScript
        injectionTime:WKUserScriptInjectionTimeAtDocumentStart
        forMainFrameOnly:YES];

    [data->config.userContentController addUserScript:userScript];
    [userScript release];

    NSLog(@"[ChildView] IPC initialized for viewId: %s", view_id);
}

void platform_child_navigate(void* child_view, const char* url) {
    if (!child_view || !url) return;

    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    if (!data->webView) return;

    NSString *urlString = [NSString stringWithUTF8String:url];
    NSURL *nsUrl = [NSURL URLWithString:urlString];

    if (nsUrl) {
        NSURLRequest *request = [NSURLRequest requestWithURL:nsUrl];
        [data->webView loadRequest:request];
        NSLog(@"[ChildView] Navigating to: %s", url);
    } else {
        NSLog(@"[ChildView] Invalid URL: %s", url);
    }
}

void platform_child_set_html(void* child_view, const char* html) {
    if (!child_view || !html) return;

    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    if (!data->webView) return;

    NSString *htmlString = [NSString stringWithUTF8String:html];
    [data->webView loadHTMLString:htmlString baseURL:nil];
    NSLog(@"[ChildView] Set HTML (%zu bytes)", strlen(html));
}

void platform_child_eval(void* child_view, const char* js) {
    if (!child_view || !js) return;

    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    if (!data->webView) return;

    NSString *jsString = [NSString stringWithUTF8String:js];
    [data->webView evaluateJavaScript:jsString completionHandler:^(id _result, NSError *error) {
        (void)_result;  // Suppress unused parameter warning
        if (error) {
            NSLog(@"[ChildView] Eval error: %@", error.localizedDescription);
        }
    }];
    NSLog(@"[ChildView] Evaluated JS");
}

void platform_child_init(void* child_view, const char* js) {
    if (!child_view || !js) return;

    child_view_data_macos_t* data = (child_view_data_macos_t*)child_view;
    if (!data->webView) return;

    NSString *jsString = [NSString stringWithUTF8String:js];
    WKUserScript *userScript = [[WKUserScript alloc]
        initWithSource:jsString
        injectionTime:WKUserScriptInjectionTimeAtDocumentStart
        forMainFrameOnly:YES];

    [data->webView.configuration.userContentController addUserScript:userScript];
    [userScript release];
    NSLog(@"[ChildView] Added init script");
}

} // extern "C"

#endif // __APPLE__
