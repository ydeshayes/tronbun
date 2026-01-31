/**
 * Chrome DevTools Protocol (CDP) Interface
 *
 * Provides a unified CDP-like interface for browser automation.
 * - Windows: Uses native WebView2 CDP support
 * - macOS: Emulates CDP using WKWebView APIs
 */

#ifndef PLATFORM_CDP_H
#define PLATFORM_CDP_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * CDP method result callback
 * @param result JSON string with the result (NULL on error)
 * @param error Error message (NULL on success)
 * @param user_data User-provided context
 */
typedef void (*cdp_result_callback_t)(const char* result, const char* error, void* user_data);

/**
 * CDP event callback
 * @param method The event method name (e.g., "Network.requestWillBeSent")
 * @param params JSON string with event parameters
 * @param user_data User-provided context
 */
typedef void (*cdp_event_callback_t)(const char* method, const char* params, void* user_data);

/**
 * Initialize CDP support for a webview
 * Must be called after webview creation
 *
 * @param webview_window Platform window handle
 * @return 0 on success, -1 on error
 */
int platform_cdp_init(void* webview_window);

/**
 * Cleanup CDP resources
 * @param webview_window Platform window handle
 */
void platform_cdp_cleanup(void* webview_window);

/**
 * Call a CDP method
 *
 * @param webview_window Platform window handle
 * @param method CDP method name (e.g., "Page.navigate", "Network.getCookies")
 * @param params JSON string with method parameters (can be NULL or "{}")
 * @param callback Function to call with the result
 * @param user_data Context to pass to callback
 */
void platform_cdp_call(void* webview_window, const char* method, const char* params,
                       cdp_result_callback_t callback, void* user_data);

/**
 * Subscribe to a CDP event
 *
 * @param webview_window Platform window handle
 * @param event_name CDP event name (e.g., "Network.requestWillBeSent")
 * @param callback Function to call when event fires
 * @param user_data Context to pass to callback
 * @return Subscription ID (use for unsubscribe), -1 on error
 */
int platform_cdp_subscribe(void* webview_window, const char* event_name,
                           cdp_event_callback_t callback, void* user_data);

/**
 * Unsubscribe from a CDP event
 *
 * @param webview_window Platform window handle
 * @param subscription_id ID returned from platform_cdp_subscribe
 */
void platform_cdp_unsubscribe(void* webview_window, int subscription_id);

// ============================================================================
// Convenience functions for common operations
// These provide cross-platform implementations where native CDP isn't available
// ============================================================================

/**
 * Get all cookies for a URL
 * @param webview_window Platform window handle
 * @param url URL to get cookies for (NULL for all cookies)
 * @param callback Result callback with JSON array of cookies
 * @param user_data Context
 */
void platform_cdp_get_cookies(void* webview_window, const char* url,
                              cdp_result_callback_t callback, void* user_data);

/**
 * Set a cookie
 * @param webview_window Platform window handle
 * @param cookie_json JSON object with cookie properties (name, value, domain, path, etc.)
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_set_cookie(void* webview_window, const char* cookie_json,
                             cdp_result_callback_t callback, void* user_data);

/**
 * Delete cookies
 * @param webview_window Platform window handle
 * @param name Cookie name
 * @param url URL scope (optional)
 * @param domain Domain scope (optional)
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_delete_cookies(void* webview_window, const char* name,
                                 const char* url, const char* domain,
                                 cdp_result_callback_t callback, void* user_data);

/**
 * Generate PDF of the page
 * @param webview_window Platform window handle
 * @param options_json JSON with PDF options (paperWidth, paperHeight, margins, etc.)
 * @param callback Result callback with base64-encoded PDF data
 * @param user_data Context
 */
void platform_cdp_print_to_pdf(void* webview_window, const char* options_json,
                               cdp_result_callback_t callback, void* user_data);

/**
 * Dispatch a mouse event
 * @param webview_window Platform window handle
 * @param type Event type: "mousePressed", "mouseReleased", "mouseMoved"
 * @param x X coordinate
 * @param y Y coordinate
 * @param button Mouse button: "left", "right", "middle"
 * @param click_count Click count (1 for single, 2 for double)
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_dispatch_mouse_event(void* webview_window, const char* type,
                                       int x, int y, const char* button, int click_count,
                                       cdp_result_callback_t callback, void* user_data);

/**
 * Dispatch a key event
 * @param webview_window Platform window handle
 * @param type Event type: "keyDown", "keyUp", "char"
 * @param key Key identifier (e.g., "Enter", "Tab", "a")
 * @param modifiers Modifier flags (1=Alt, 2=Ctrl, 4=Meta, 8=Shift)
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_dispatch_key_event(void* webview_window, const char* type,
                                     const char* key, int modifiers,
                                     cdp_result_callback_t callback, void* user_data);

/**
 * Insert text (simulates typing)
 * @param webview_window Platform window handle
 * @param text Text to insert
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_insert_text(void* webview_window, const char* text,
                              cdp_result_callback_t callback, void* user_data);

/**
 * Enable network monitoring
 * @param webview_window Platform window handle
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_network_enable(void* webview_window,
                                 cdp_result_callback_t callback, void* user_data);

/**
 * Disable network monitoring
 * @param webview_window Platform window handle
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_network_disable(void* webview_window,
                                  cdp_result_callback_t callback, void* user_data);

/**
 * Enable request interception
 * @param webview_window Platform window handle
 * @param patterns JSON array of URL patterns to intercept
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_set_request_interception(void* webview_window, const char* patterns_json,
                                           cdp_result_callback_t callback, void* user_data);

/**
 * Continue an intercepted request
 * @param webview_window Platform window handle
 * @param request_id ID of the intercepted request
 * @param url Override URL (NULL to keep original)
 * @param method Override method (NULL to keep original)
 * @param headers_json Override headers JSON (NULL to keep original)
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_continue_request(void* webview_window, const char* request_id,
                                   const char* url, const char* method, const char* headers_json,
                                   cdp_result_callback_t callback, void* user_data);

/**
 * Fulfill an intercepted request with custom response
 * @param webview_window Platform window handle
 * @param request_id ID of the intercepted request
 * @param status HTTP status code
 * @param headers_json Response headers JSON
 * @param body_base64 Base64-encoded response body
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_fulfill_request(void* webview_window, const char* request_id,
                                  int status, const char* headers_json, const char* body_base64,
                                  cdp_result_callback_t callback, void* user_data);

/**
 * Fail an intercepted request
 * @param webview_window Platform window handle
 * @param request_id ID of the intercepted request
 * @param reason Failure reason (e.g., "Failed", "Aborted", "TimedOut")
 * @param callback Result callback
 * @param user_data Context
 */
void platform_cdp_fail_request(void* webview_window, const char* request_id,
                               const char* reason,
                               cdp_result_callback_t callback, void* user_data);

#ifdef __cplusplus
}
#endif

#endif // PLATFORM_CDP_H
