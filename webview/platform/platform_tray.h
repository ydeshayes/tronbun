/*
 * Platform Tray Icon API
 * 
 * Cross-platform abstraction layer for system tray icons
 * with menu support and click handling.
 */

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef struct platform_tray platform_tray_t;

typedef struct {
    char id[256];
    char label[256];
    int type; // 0=normal, 1=separator, 2=checkbox, 3=submenu
    int enabled;
    int checked;
    char accelerator[64];
} platform_menu_item_t;

typedef void (*platform_tray_click_callback_t)(void* userdata);
typedef void (*platform_menu_click_callback_t)(const char* menu_id, void* userdata);

/**
 * Create a new tray icon
 * @param icon_path Path to the icon file
 * @param tooltip Initial tooltip text (can be NULL)
 * @return Tray handle or NULL on failure
 */
platform_tray_t* platform_tray_create(const char* icon_path, const char* tooltip);

/**
 * Destroy a tray icon and free resources
 * @param tray Tray handle
 */
void platform_tray_destroy(platform_tray_t* tray);

/**
 * Set the tray icon
 * @param tray Tray handle
 * @param icon_path Path to the icon file
 * @return 0 on success, -1 on failure
 */
int platform_tray_set_icon(platform_tray_t* tray, const char* icon_path);

/**
 * Set the tray tooltip
 * @param tray Tray handle
 * @param tooltip Tooltip text
 * @return 0 on success, -1 on failure
 */
int platform_tray_set_tooltip(platform_tray_t* tray, const char* tooltip);

/**
 * Set the tray menu
 * @param tray Tray handle
 * @param menu_items Array of menu items
 * @param count Number of menu items
 * @return 0 on success, -1 on failure
 */
int platform_tray_set_menu(platform_tray_t* tray, const platform_menu_item_t* menu_items, int count);

/**
 * Set click callback for tray icon
 * @param tray Tray handle
 * @param callback Callback function
 * @param userdata User data passed to callback
 */
void platform_tray_set_click_callback(platform_tray_t* tray, platform_tray_click_callback_t callback, void* userdata);

/**
 * Set menu click callback
 * @param tray Tray handle
 * @param callback Callback function
 * @param userdata User data passed to callback
 */
void platform_tray_set_menu_callback(platform_tray_t* tray, platform_menu_click_callback_t callback, void* userdata);

/**
 * Show a notification from the tray
 * @param tray Tray handle
 * @param title Notification title
 * @param body Notification body
 * @return 0 on success, -1 on failure
 */
int platform_tray_show_notification(platform_tray_t* tray, const char* title, const char* body);

/**
 * Run the platform-specific event loop for the tray
 * @param context IPC context for exit condition
 */
void platform_tray_run_event_loop(void* context);

/**
 * Check if tray icons are supported on this platform
 * @return 1 if supported, 0 if not
 */
int platform_tray_is_supported(void);

#ifdef __cplusplus
}
#endif
