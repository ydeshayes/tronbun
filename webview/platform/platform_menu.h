/**
 * Platform-specific application menu implementation
 *
 * Provides a cross-platform API for native application menus (menu bar).
 * - macOS: NSMenu in the system menu bar
 * - Windows: Win32 HMENU attached to window
 */

#ifndef PLATFORM_MENU_H
#define PLATFORM_MENU_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Menu Item Types
// ============================================================================

/**
 * Menu item type
 */
typedef enum {
    MENU_ITEM_NORMAL = 0,      // Regular clickable item
    MENU_ITEM_SEPARATOR = 1,   // Horizontal separator line
    MENU_ITEM_CHECKBOX = 2,    // Checkable item (toggle)
    MENU_ITEM_SUBMENU = 3,     // Item that opens a submenu
    MENU_ITEM_RADIO = 4        // Radio button item (mutually exclusive in group)
} MenuItemType;

/**
 * Standard menu roles for automatic behavior
 */
typedef enum {
    MENU_ROLE_NONE = 0,        // No special role
    // Application menu (macOS)
    MENU_ROLE_ABOUT = 1,       // About [App Name]
    MENU_ROLE_SERVICES = 2,    // Services submenu (macOS)
    MENU_ROLE_HIDE = 3,        // Hide [App Name]
    MENU_ROLE_HIDE_OTHERS = 4, // Hide Others
    MENU_ROLE_UNHIDE = 5,      // Show All
    MENU_ROLE_QUIT = 6,        // Quit [App Name] / Exit
    // Edit menu
    MENU_ROLE_UNDO = 10,       // Undo
    MENU_ROLE_REDO = 11,       // Redo
    MENU_ROLE_CUT = 12,        // Cut
    MENU_ROLE_COPY = 13,       // Copy
    MENU_ROLE_PASTE = 14,      // Paste
    MENU_ROLE_PASTE_AND_MATCH = 15, // Paste and Match Style
    MENU_ROLE_DELETE = 16,     // Delete
    MENU_ROLE_SELECT_ALL = 17, // Select All
    // View menu
    MENU_ROLE_RELOAD = 20,     // Reload
    MENU_ROLE_FORCE_RELOAD = 21, // Force Reload
    MENU_ROLE_DEV_TOOLS = 22,  // Toggle Developer Tools
    MENU_ROLE_ZOOM_IN = 23,    // Zoom In
    MENU_ROLE_ZOOM_OUT = 24,   // Zoom Out
    MENU_ROLE_RESET_ZOOM = 25, // Actual Size / Reset Zoom
    MENU_ROLE_FULLSCREEN = 26, // Toggle Full Screen
    // Window menu
    MENU_ROLE_MINIMIZE = 30,   // Minimize
    MENU_ROLE_CLOSE = 31,      // Close Window
    MENU_ROLE_ZOOM = 32,       // Zoom (macOS) / Maximize
    MENU_ROLE_FRONT = 33,      // Bring All to Front (macOS)
    // Help menu
    MENU_ROLE_HELP = 40        // [App Name] Help
} MenuItemRole;

/**
 * Menu item definition
 */
typedef struct {
    char id[256];              // Unique identifier for callbacks
    char label[256];           // Display label (use & for accelerator key on Windows)
    MenuItemType type;         // Item type
    MenuItemRole role;         // Standard role (0 for custom items)
    int enabled;               // Whether item is enabled (1) or grayed out (0)
    int checked;               // Whether item is checked (for checkbox/radio)
    char accelerator[64];      // Keyboard shortcut (e.g., "CmdOrCtrl+S", "Alt+F4")
    int submenu_count;         // Number of submenu items (if type is SUBMENU)
    void* submenu_items;       // Pointer to array of submenu items
} platform_menu_item_t;

/**
 * Menu definition (top-level menu in menu bar)
 */
typedef struct {
    char id[256];              // Unique identifier
    char label[256];           // Menu label (e.g., "File", "Edit")
    MenuItemRole role;         // Standard role for entire menu (for special menus)
    int item_count;            // Number of items in this menu
    platform_menu_item_t* items; // Array of menu items
} platform_menu_t;

/**
 * Callback for menu item clicks
 * @param menu_id The ID of the clicked menu item
 * @param user_data User-provided context
 */
typedef void (*platform_menu_callback_t)(const char* menu_id, void* user_data);

// ============================================================================
// Menu Bar API
// ============================================================================

/**
 * Set the application menu bar
 * @param window The window handle (platform-specific)
 * @param menus Array of top-level menus
 * @param menu_count Number of menus
 * @param callback Callback for menu item clicks
 * @param user_data User data passed to callback
 * @return 0 on success, -1 on failure
 */
int platform_menu_set(void* window, const platform_menu_t* menus, int menu_count,
                      platform_menu_callback_t callback, void* user_data);

/**
 * Set the application menu bar from JSON
 * @param window The window handle
 * @param menu_json JSON string defining the menu structure
 * @param callback Callback for menu item clicks
 * @param user_data User data passed to callback
 * @return 0 on success, -1 on failure
 */
int platform_menu_set_from_json(void* window, const char* menu_json,
                                platform_menu_callback_t callback, void* user_data);

/**
 * Update a specific menu item
 * @param window The window handle
 * @param item_id The ID of the item to update
 * @param label New label (NULL to keep current)
 * @param enabled New enabled state (-1 to keep current)
 * @param checked New checked state (-1 to keep current)
 * @return 0 on success, -1 on failure
 */
int platform_menu_update_item(void* window, const char* item_id,
                              const char* label, int enabled, int checked);

/**
 * Enable or disable a menu item
 * @param window The window handle
 * @param item_id The ID of the item
 * @param enabled 1 to enable, 0 to disable
 * @return 0 on success, -1 on failure
 */
int platform_menu_set_item_enabled(void* window, const char* item_id, int enabled);

/**
 * Set the checked state of a menu item
 * @param window The window handle
 * @param item_id The ID of the item
 * @param checked 1 to check, 0 to uncheck
 * @return 0 on success, -1 on failure
 */
int platform_menu_set_item_checked(void* window, const char* item_id, int checked);

/**
 * Remove the application menu bar
 * @param window The window handle
 * @return 0 on success, -1 on failure
 */
int platform_menu_remove(void* window);

/**
 * Create a default application menu with standard items
 * @param window The window handle
 * @param app_name Application name for menu labels
 * @param callback Callback for menu item clicks
 * @param user_data User data passed to callback
 * @return 0 on success, -1 on failure
 */
int platform_menu_set_default(void* window, const char* app_name,
                              platform_menu_callback_t callback, void* user_data);

/**
 * Popup a context menu at the specified position
 * @param window The window handle
 * @param items Array of menu items
 * @param item_count Number of items
 * @param x X position (screen coordinates)
 * @param y Y position (screen coordinates)
 * @param callback Callback for menu item clicks
 * @param user_data User data passed to callback
 * @return 0 on success, -1 on failure
 */
int platform_menu_popup(void* window, const platform_menu_item_t* items, int item_count,
                        int x, int y, platform_menu_callback_t callback, void* user_data);

#ifdef __cplusplus
}
#endif

#endif // PLATFORM_MENU_H
