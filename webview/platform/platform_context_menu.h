/**
 * Platform-specific context menu (right-click menu) implementation
 *
 * Provides a cross-platform API for native right-click context menus in the webview.
 * - macOS: NSMenu shown as context menu
 * - Windows: Win32 HMENU shown via TrackPopupMenu on right-click
 *
 * The context menu intercepts the webview's default right-click behavior and
 * shows a developer-defined native context menu instead.
 */

#ifndef PLATFORM_CONTEXT_MENU_H
#define PLATFORM_CONTEXT_MENU_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Context Menu Item Types
// ============================================================================

/**
 * Context menu item type
 */
typedef enum {
    CONTEXT_MENU_ITEM_NORMAL = 0,      // Regular clickable item
    CONTEXT_MENU_ITEM_SEPARATOR = 1,   // Horizontal separator line
    CONTEXT_MENU_ITEM_CHECKBOX = 2,    // Checkable item (toggle)
    CONTEXT_MENU_ITEM_SUBMENU = 3,     // Item that opens a submenu
    CONTEXT_MENU_ITEM_RADIO = 4        // Radio button item
} ContextMenuItemType;

/**
 * Context menu item definition
 */
typedef struct {
    char id[256];              // Unique identifier for callbacks
    char label[256];           // Display label
    ContextMenuItemType type;  // Item type
    int enabled;               // Whether item is enabled (1) or grayed out (0)
    int checked;               // Whether item is checked (for checkbox/radio)
    char accelerator[64];      // Keyboard shortcut hint text (display only)
    int submenu_count;         // Number of submenu items (if type is SUBMENU)
    void* submenu_items;       // Pointer to array of submenu items
} platform_context_menu_item_t;

/**
 * Callback for context menu item clicks
 * @param menu_id The ID of the clicked menu item
 * @param user_data User-provided context
 */
typedef void (*platform_context_menu_callback_t)(const char* menu_id, void* user_data);

// ============================================================================
// Context Menu API
// ============================================================================

/**
 * Set the context menu for the webview window.
 * This replaces the default right-click menu with a custom native menu.
 * When set, right-clicking in the webview will show this menu.
 *
 * @param window The window handle (HWND on Windows, NSWindow on macOS)
 * @param webview The webview handle (for intercepting right-click events)
 * @param items_json JSON string defining the menu items
 * @param callback Callback for menu item clicks
 * @param user_data User data passed to callback
 * @return 0 on success, -1 on failure
 */
int platform_context_menu_set(void* window, void* webview,
                              const char* items_json,
                              platform_context_menu_callback_t callback,
                              void* user_data);

/**
 * Remove the custom context menu and restore default webview behavior.
 *
 * @param window The window handle
 * @param webview The webview handle
 * @return 0 on success, -1 on failure
 */
int platform_context_menu_remove(void* window, void* webview);

/**
 * Update a specific context menu item
 *
 * @param item_id The ID of the item to update
 * @param label New label (NULL to keep current)
 * @param enabled New enabled state (-1 to keep current)
 * @param checked New checked state (-1 to keep current)
 * @return 0 on success, -1 on failure
 */
int platform_context_menu_update_item(const char* item_id,
                                      const char* label,
                                      int enabled, int checked);

/**
 * Show the context menu programmatically at a specific position
 * (used when the webview sends a contextmenu event with coordinates)
 *
 * @param window The window handle
 * @param x X position in client coordinates
 * @param y Y position in client coordinates
 * @return 0 on success, -1 on failure
 */
int platform_context_menu_show(void* window, int x, int y);

#ifdef __cplusplus
}
#endif

#endif // PLATFORM_CONTEXT_MENU_H
