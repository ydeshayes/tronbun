/*
 * Platform Window Control API
 * 
 * Cross-platform abstraction layer for window-specific functionality
 * like transparency, blur effects, and frameless mode.
 */

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Set window transparency
 * @param native_window Platform-specific window handle
 */
void platform_window_set_transparent(void *native_window);

/**
 * Set window to be fully opaque (removes transparency)
 * @param native_window Platform-specific window handle
 */
void platform_window_set_opaque(void *native_window);

/**
 * Enable blur/backdrop effects behind the window
 * @param native_window Platform-specific window handle
 */
void platform_window_enable_blur(void *native_window);

/**
 * Remove window decorations (title bar, borders)
 * @param native_window Platform-specific window handle
 */
void platform_window_remove_decorations(void *native_window);

/**
 * Add window decorations (title bar, borders) back to the window
 * @param native_window Platform-specific window handle
 */
void platform_window_add_decorations(void *native_window);

/**
 * Set window to always stay on top
 * @param native_window Platform-specific window handle
 * @param on_top 1 to enable always on top, 0 to disable
 */
void platform_window_set_always_on_top(void *native_window, int on_top);

/**
 * Set window opacity level
 * @param native_window Platform-specific window handle
 * @param opacity Opacity value from 0.0 (transparent) to 1.0 (opaque)
 */
void platform_window_set_opacity(void *native_window, float opacity);

/**
 * Set window to be resizable or fixed size
 * @param native_window Platform-specific window handle
 * @param resizable 1 to enable resizing, 0 to disable
 */
void platform_window_set_resizable(void *native_window, int resizable);

/**
 * Set window position
 * @param native_window Platform-specific window handle
 * @param x X coordinate
 * @param y Y coordinate
 */
void platform_window_set_position(void *native_window, int x, int y);

/**
 * Center window on screen
 * @param native_window Platform-specific window handle
 */
void platform_window_center(void *native_window);

/**
 * Minimize window
 * @param native_window Platform-specific window handle
 */
void platform_window_minimize(void *native_window);

/**
 * Maximize window
 * @param native_window Platform-specific window handle
 */
void platform_window_maximize(void *native_window);

/**
 * Restore window from minimized/maximized state
 * @param native_window Platform-specific window handle
 */
void platform_window_restore(void *native_window);

/**
 * Hide window
 * @param native_window Platform-specific window handle
 */
void platform_window_hide(void *native_window);

/**
 * Show window
 * @param native_window Platform-specific window handle
 */
void platform_window_show(void *native_window);

/**
 * Callback function type for window resize events
 * @param width New window width
 * @param height New window height
 * @param user_data User-provided context data
 */
typedef void (*platform_window_resize_callback_t)(int width, int height, void *user_data);

/**
 * Register a callback for window resize events
 * @param native_window Platform-specific window handle
 * @param callback Function to call when window is resized
 * @param user_data User-provided context data passed to callback
 */
void platform_window_register_resize_callback(void *native_window, platform_window_resize_callback_t callback, void *user_data);

/**
 * Get window size
 * @param native_window Platform-specific window handle
 * @param width Pointer to receive width
 * @param height Pointer to receive height
 */
void platform_window_get_size(void *native_window, int *width, int *height);

/**
 * Activate the application and bring window to front.
 * On macOS, this ensures the app is activated even when webview_main
 * runs as a subprocess inside a .app bundle (where automatic activation
 * is skipped by the webview library).
 * No-op on other platforms.
 */
void platform_window_activate_app(void);

#ifdef __cplusplus
}
#endif