/**
 * Custom URL Scheme Handler Header for Windows
 *
 * Declares the function to register the tronbun:// URL scheme handler
 * using WebView2's WebResourceRequested event.
 */

#ifndef URL_SCHEME_HANDLER_WIN_H
#define URL_SCHEME_HANDLER_WIN_H

#ifdef _WIN32

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Register the tronbun:// URL scheme handler with a WebView2 instance.
 * This must be called after the WebView2 is fully initialized.
 *
 * @param webview Pointer to ICoreWebView2 instance
 * @param environment Pointer to ICoreWebView2Environment instance (for creating responses)
 * @return 0 on success, non-zero on failure
 */
int tronbun_register_url_scheme_win(void* webview, void* environment);

#ifdef __cplusplus
}
#endif

#endif // _WIN32

#endif // URL_SCHEME_HANDLER_WIN_H
