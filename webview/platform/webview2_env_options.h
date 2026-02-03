/**
 * WebView2 Environment Options with Custom Scheme Registration
 */

#ifndef WEBVIEW2_ENV_OPTIONS_H
#define WEBVIEW2_ENV_OPTIONS_H

#ifdef _WIN32

#ifdef __cplusplus
extern "C" {
#endif

// Forward declaration
struct ICoreWebView2EnvironmentOptions;

/**
 * Create WebView2 environment options with tronbun:// custom scheme registered.
 * The caller is responsible for releasing the returned object.
 * 
 * @return ICoreWebView2EnvironmentOptions* that can be passed to CreateCoreWebView2EnvironmentWithOptions
 */
ICoreWebView2EnvironmentOptions* tronbun_create_environment_options(void);

#ifdef __cplusplus
}
#endif

#endif // _WIN32

#endif // WEBVIEW2_ENV_OPTIONS_H
