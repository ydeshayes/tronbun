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
 * Set custom context menu items for the webview
 * @param native_window Platform-specific window handle
 * @param menu_json JSON string containing menu items array
 */
void platform_window_set_context_menu(void *native_window, const char *menu_json);

/**
 * Clear/disable custom context menu for the webview
 * @param native_window Platform-specific window handle
 */
void platform_window_clear_context_menu(void *native_window);

#ifdef __cplusplus
}
#endif