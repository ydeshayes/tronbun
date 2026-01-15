/**
 * Custom URL Scheme Handler for macOS
 *
 * Implements WKURLSchemeHandler to intercept tronbun:// requests
 * and serve content from the virtual file system.
 */

#ifndef URL_SCHEME_HANDLER_MACOS_H
#define URL_SCHEME_HANDLER_MACOS_H

#ifdef __APPLE__

#import <WebKit/WebKit.h>

/**
 * URL scheme handler that serves content from the virtual file system.
 * Handles tronbun:// URLs and resolves them to in-memory files.
 */
@interface TronbunURLSchemeHandler : NSObject <WKURLSchemeHandler>
@end

/**
 * Configure a WKWebViewConfiguration with the Tronbun URL scheme handler.
 * Must be called before creating the WKWebView.
 *
 * @param config The WKWebViewConfiguration to configure (void* for C compatibility)
 */
#ifdef __cplusplus
extern "C"
#endif
void tronbun_register_url_scheme(void* config);

#endif // __APPLE__

#endif // URL_SCHEME_HANDLER_MACOS_H
