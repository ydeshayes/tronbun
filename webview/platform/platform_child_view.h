/*
 * Platform Child View API
 *
 * Cross-platform abstraction layer for embedded child webviews
 * within a parent window (similar to Electron's BrowserView).
 */

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Bounds structure for child view positioning
 */
typedef struct {
    int x;
    int y;
    int width;
    int height;
} child_view_bounds_t;

/**
 * Create a child webview embedded within a parent window
 * @param parent_window Platform-specific parent window handle (NSWindow* or HWND)
 * @param debug Enable developer tools
 * @param bounds Initial position and size within parent
 * @return Platform-specific child view handle, or NULL on failure
 */
void* platform_create_child_view(void* parent_window, int debug, child_view_bounds_t bounds);

/**
 * Destroy a child webview and release resources
 * @param child_view Platform-specific child view handle
 */
void platform_destroy_child_view(void* child_view);

/**
 * Update child view position and size
 * @param child_view Platform-specific child view handle
 * @param bounds New position and size
 */
void platform_set_child_bounds(void* child_view, child_view_bounds_t bounds);

/**
 * Set child view visibility
 * @param child_view Platform-specific child view handle
 * @param visible 1 to show, 0 to hide
 */
void platform_set_child_visible(void* child_view, int visible);

/**
 * Get the underlying webview from a child view container
 * This is needed to perform webview operations (navigate, eval, etc.)
 * @param child_view Platform-specific child view handle
 * @return webview_t compatible pointer, or NULL
 */
void* platform_get_child_webview(void* child_view);

/**
 * Bring child view to front (top of z-order within parent)
 * @param parent_window Platform-specific parent window handle
 * @param child_view Platform-specific child view handle
 */
void platform_bring_child_to_front(void* parent_window, void* child_view);

/**
 * Send child view to back (bottom of z-order within parent)
 * @param parent_window Platform-specific parent window handle
 * @param child_view Platform-specific child view handle
 */
void platform_send_child_to_back(void* parent_window, void* child_view);

/**
 * Initialize IPC bindings for a child webview
 * Sets up the JavaScript bridge for invoke/send calls
 * @param child_view Platform-specific child view handle
 * @param view_id The unique ID for this child view (for IPC routing)
 */
void platform_init_child_ipc(void* child_view, const char* view_id);

/**
 * Navigate child webview to a URL
 * @param child_view Platform-specific child view handle
 * @param url The URL to navigate to
 */
void platform_child_navigate(void* child_view, const char* url);

/**
 * Set HTML content in child webview
 * @param child_view Platform-specific child view handle
 * @param html The HTML content to display
 */
void platform_child_set_html(void* child_view, const char* html);

/**
 * Execute JavaScript in child webview
 * @param child_view Platform-specific child view handle
 * @param js The JavaScript code to execute
 */
void platform_child_eval(void* child_view, const char* js);

/**
 * Add initialization script to child webview
 * Script will run on every page load
 * @param child_view Platform-specific child view handle
 * @param js The JavaScript code to add
 */
void platform_child_init(void* child_view, const char* js);

#ifdef __cplusplus
}
#endif
