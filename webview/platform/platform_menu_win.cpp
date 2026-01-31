/**
 * Windows application menu implementation using Win32 API
 */

#ifdef _WIN32

#include "platform_menu.h"
#include <windows.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <vector>
#include <map>

// ============================================================================
// Internal State
// ============================================================================

// Menu item ID counter (Windows uses integers for menu IDs)
static UINT g_nextMenuId = 1000;

// Map menu IDs to string IDs
static std::map<UINT, std::string> g_menuIdToStringId;
static std::map<std::string, UINT> g_stringIdToMenuId;
static std::map<std::string, HMENU> g_stringIdToSubmenu;

// Callback storage
static platform_menu_callback_t g_menuCallback = NULL;
static void* g_menuUserData = NULL;
static HWND g_menuWindow = NULL;

// Original window procedure for subclassing
static WNDPROC g_originalWndProc = NULL;

// ============================================================================
// Helper Functions
// ============================================================================

// Convert UTF-8 to wide string
static std::wstring utf8_to_wide(const char* str) {
    if (!str || strlen(str) == 0) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, str, -1, NULL, 0);
    std::wstring result(size, 0);
    MultiByteToWideChar(CP_UTF8, 0, str, -1, &result[0], size);
    if (!result.empty() && result.back() == 0) result.pop_back();
    return result;
}

// Convert wide string to UTF-8
static std::string wide_to_utf8(const wchar_t* str) {
    if (!str || wcslen(str) == 0) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, str, -1, NULL, 0, NULL, NULL);
    std::string result(size, 0);
    WideCharToMultiByte(CP_UTF8, 0, str, -1, &result[0], size, NULL, NULL);
    if (!result.empty() && result.back() == 0) result.pop_back();
    return result;
}

// Parse accelerator string and return virtual key info
static void parseAccelerator(const char* accelerator, UINT* modifiers, UINT* vkey) {
    *modifiers = 0;
    *vkey = 0;

    if (!accelerator || strlen(accelerator) == 0) return;

    std::string accel(accelerator);

    // Parse modifiers
    if (accel.find("CmdOrCtrl+") != std::string::npos || accel.find("Ctrl+") != std::string::npos) {
        *modifiers |= MOD_CONTROL;
        size_t pos = accel.find("CmdOrCtrl+");
        if (pos != std::string::npos) accel.replace(pos, 10, "");
        pos = accel.find("Ctrl+");
        if (pos != std::string::npos) accel.replace(pos, 5, "");
    }
    if (accel.find("Alt+") != std::string::npos) {
        *modifiers |= MOD_ALT;
        size_t pos = accel.find("Alt+");
        if (pos != std::string::npos) accel.replace(pos, 4, "");
    }
    if (accel.find("Shift+") != std::string::npos) {
        *modifiers |= MOD_SHIFT;
        size_t pos = accel.find("Shift+");
        if (pos != std::string::npos) accel.replace(pos, 6, "");
    }

    // Parse key
    if (accel.length() == 1) {
        char c = toupper(accel[0]);
        if (c >= 'A' && c <= 'Z') {
            *vkey = c;
        } else if (c >= '0' && c <= '9') {
            *vkey = c;
        }
    } else {
        // Handle special keys
        if (_stricmp(accel.c_str(), "Enter") == 0 || _stricmp(accel.c_str(), "Return") == 0) {
            *vkey = VK_RETURN;
        } else if (_stricmp(accel.c_str(), "Tab") == 0) {
            *vkey = VK_TAB;
        } else if (_stricmp(accel.c_str(), "Backspace") == 0 || _stricmp(accel.c_str(), "Delete") == 0) {
            *vkey = VK_BACK;
        } else if (_stricmp(accel.c_str(), "Escape") == 0 || _stricmp(accel.c_str(), "Esc") == 0) {
            *vkey = VK_ESCAPE;
        } else if (_stricmp(accel.c_str(), "Up") == 0) {
            *vkey = VK_UP;
        } else if (_stricmp(accel.c_str(), "Down") == 0) {
            *vkey = VK_DOWN;
        } else if (_stricmp(accel.c_str(), "Left") == 0) {
            *vkey = VK_LEFT;
        } else if (_stricmp(accel.c_str(), "Right") == 0) {
            *vkey = VK_RIGHT;
        } else if (accel[0] == 'F' || accel[0] == 'f') {
            int fNum = atoi(accel.c_str() + 1);
            if (fNum >= 1 && fNum <= 12) {
                *vkey = VK_F1 + fNum - 1;
            }
        }
    }
}

// Build accelerator text for menu display
static std::wstring buildAcceleratorText(const char* accelerator) {
    if (!accelerator || strlen(accelerator) == 0) return L"";

    std::wstring text = L"\t";
    std::string accel(accelerator);

    // Replace platform-neutral names with Windows names
    size_t pos;
    while ((pos = accel.find("CmdOrCtrl")) != std::string::npos) {
        accel.replace(pos, 9, "Ctrl");
    }

    return text + utf8_to_wide(accel.c_str());
}

// Window procedure to handle menu commands
static LRESULT CALLBACK MenuWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (msg == WM_COMMAND) {
        UINT menuId = LOWORD(wParam);

        // Check if this is a menu command
        auto it = g_menuIdToStringId.find(menuId);
        if (it != g_menuIdToStringId.end()) {
            if (g_menuCallback) {
                g_menuCallback(it->second.c_str(), g_menuUserData);
            }
            return 0;
        }
    }

    // Call original window procedure
    if (g_originalWndProc) {
        return CallWindowProc(g_originalWndProc, hwnd, msg, wParam, lParam);
    }
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

// Register a menu item ID
static UINT registerMenuItemId(const char* stringId) {
    std::string id(stringId);

    // Check if already registered
    auto it = g_stringIdToMenuId.find(id);
    if (it != g_stringIdToMenuId.end()) {
        return it->second;
    }

    // Assign new ID
    UINT menuId = g_nextMenuId++;
    g_menuIdToStringId[menuId] = id;
    g_stringIdToMenuId[id] = menuId;

    return menuId;
}

// Create menu item from platform_menu_item_t
static void addMenuItem(HMENU menu, const platform_menu_item_t* item) {
    if (item->type == MENU_ITEM_SEPARATOR) {
        AppendMenuW(menu, MF_SEPARATOR, 0, NULL);
        return;
    }

    UINT menuId = registerMenuItemId(item->id);
    UINT flags = MF_STRING;

    // Build label with accelerator
    std::wstring label = utf8_to_wide(item->label);
    if (strlen(item->accelerator) > 0) {
        label += buildAcceleratorText(item->accelerator);
    }

    // Set enabled/disabled
    if (!item->enabled) {
        flags |= MF_GRAYED;
    }

    // Handle checkbox/radio
    if (item->type == MENU_ITEM_CHECKBOX || item->type == MENU_ITEM_RADIO) {
        if (item->checked) {
            flags |= MF_CHECKED;
        }
    }

    // Handle submenu
    if (item->type == MENU_ITEM_SUBMENU && item->submenu_items && item->submenu_count > 0) {
        HMENU submenu = CreatePopupMenu();

        platform_menu_item_t* subItems = (platform_menu_item_t*)item->submenu_items;
        for (int i = 0; i < item->submenu_count; i++) {
            addMenuItem(submenu, &subItems[i]);
        }

        AppendMenuW(menu, MF_POPUP | flags, (UINT_PTR)submenu, label.c_str());

        // Store submenu handle for later updates
        g_stringIdToSubmenu[item->id] = submenu;
    } else {
        AppendMenuW(menu, flags, menuId, label.c_str());
    }
}

// ============================================================================
// Public API Implementation
// ============================================================================

extern "C" {

int platform_menu_set(void* window, const platform_menu_t* menus, int menu_count,
                      platform_menu_callback_t callback, void* user_data) {
    if (!window || !menus || menu_count <= 0) return -1;

    HWND hwnd = (HWND)window;

    // Clear previous state
    g_menuIdToStringId.clear();
    g_stringIdToMenuId.clear();
    g_stringIdToSubmenu.clear();
    g_nextMenuId = 1000;

    // Store callback
    g_menuCallback = callback;
    g_menuUserData = user_data;

    // Subclass window to handle menu commands
    if (g_menuWindow != hwnd) {
        if (g_menuWindow && g_originalWndProc) {
            SetWindowLongPtr(g_menuWindow, GWLP_WNDPROC, (LONG_PTR)g_originalWndProc);
        }
        g_menuWindow = hwnd;
        g_originalWndProc = (WNDPROC)SetWindowLongPtr(hwnd, GWLP_WNDPROC, (LONG_PTR)MenuWndProc);
    }

    // Create main menu bar
    HMENU menuBar = CreateMenu();

    for (int i = 0; i < menu_count; i++) {
        const platform_menu_t* menu = &menus[i];

        // Create popup menu for this top-level item
        HMENU popup = CreatePopupMenu();

        // Add items
        for (int j = 0; j < menu->item_count; j++) {
            addMenuItem(popup, &menu->items[j]);
        }

        // Add to menu bar
        std::wstring label = utf8_to_wide(menu->label);
        AppendMenuW(menuBar, MF_POPUP, (UINT_PTR)popup, label.c_str());
    }

    // Set menu bar
    SetMenu(hwnd, menuBar);
    DrawMenuBar(hwnd);

    return 0;
}

int platform_menu_set_from_json(void* window, const char* menu_json,
                                platform_menu_callback_t callback, void* user_data) {
    if (!window || !menu_json) return -1;

    HWND hwnd = (HWND)window;

    // Clear previous state
    g_menuIdToStringId.clear();
    g_stringIdToMenuId.clear();
    g_stringIdToSubmenu.clear();
    g_nextMenuId = 1000;

    // Store callback
    g_menuCallback = callback;
    g_menuUserData = user_data;

    // Subclass window
    if (g_menuWindow != hwnd) {
        if (g_menuWindow && g_originalWndProc) {
            SetWindowLongPtr(g_menuWindow, GWLP_WNDPROC, (LONG_PTR)g_originalWndProc);
        }
        g_menuWindow = hwnd;
        g_originalWndProc = (WNDPROC)SetWindowLongPtr(hwnd, GWLP_WNDPROC, (LONG_PTR)MenuWndProc);
    }

    // Simple JSON parsing (basic implementation)
    // For production, use a proper JSON library

    HMENU menuBar = CreateMenu();

    // Parse JSON array of menus
    const char* p = menu_json;
    while (*p && *p != '[') p++;
    if (!*p) return -1;
    p++; // Skip '['

    while (*p) {
        // Skip whitespace
        while (*p && (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t' || *p == ',')) p++;
        if (*p == ']') break;
        if (*p != '{') break;

        // Find this menu object
        int braceCount = 1;
        const char* objStart = p;
        p++;
        while (*p && braceCount > 0) {
            if (*p == '{') braceCount++;
            else if (*p == '}') braceCount--;
            p++;
        }
        const char* objEnd = p;

        // Parse menu object (simplified)
        std::string menuObj(objStart, objEnd - objStart);

        // Extract label
        std::string label = "Menu";
        size_t labelPos = menuObj.find("\"label\"");
        if (labelPos != std::string::npos) {
            size_t colonPos = menuObj.find(':', labelPos);
            size_t quoteStart = menuObj.find('"', colonPos + 1);
            size_t quoteEnd = menuObj.find('"', quoteStart + 1);
            if (quoteStart != std::string::npos && quoteEnd != std::string::npos) {
                label = menuObj.substr(quoteStart + 1, quoteEnd - quoteStart - 1);
            }
        }

        // Create popup menu
        HMENU popup = CreatePopupMenu();

        // Find items array
        size_t itemsPos = menuObj.find("\"items\"");
        if (itemsPos != std::string::npos) {
            size_t arrayStart = menuObj.find('[', itemsPos);
            if (arrayStart != std::string::npos) {
                // Parse items in array
                size_t pos = arrayStart + 1;
                while (pos < menuObj.length()) {
                    while (pos < menuObj.length() && (menuObj[pos] == ' ' || menuObj[pos] == '\n' ||
                           menuObj[pos] == '\r' || menuObj[pos] == '\t' || menuObj[pos] == ',')) pos++;

                    if (pos >= menuObj.length() || menuObj[pos] == ']') break;

                    if (menuObj[pos] == '{') {
                        // Find item object
                        int itemBrace = 1;
                        size_t itemStart = pos;
                        pos++;
                        while (pos < menuObj.length() && itemBrace > 0) {
                            if (menuObj[pos] == '{') itemBrace++;
                            else if (menuObj[pos] == '}') itemBrace--;
                            pos++;
                        }
                        std::string itemObj = menuObj.substr(itemStart, pos - itemStart);

                        // Check if separator
                        if (itemObj.find("\"separator\"") != std::string::npos ||
                            itemObj.find("\"type\":\"separator\"") != std::string::npos) {
                            AppendMenuW(popup, MF_SEPARATOR, 0, NULL);
                            continue;
                        }

                        // Extract item properties
                        std::string itemId, itemLabel, accel;
                        bool enabled = true, checked = false;

                        // ID
                        size_t idPos = itemObj.find("\"id\"");
                        if (idPos != std::string::npos) {
                            size_t qs = itemObj.find('"', itemObj.find(':', idPos) + 1);
                            size_t qe = itemObj.find('"', qs + 1);
                            if (qs != std::string::npos && qe != std::string::npos) {
                                itemId = itemObj.substr(qs + 1, qe - qs - 1);
                            }
                        }
                        if (itemId.empty()) {
                            itemId = "item_" + std::to_string(g_nextMenuId);
                        }

                        // Label
                        size_t lblPos = itemObj.find("\"label\"");
                        if (lblPos != std::string::npos) {
                            size_t qs = itemObj.find('"', itemObj.find(':', lblPos) + 1);
                            size_t qe = itemObj.find('"', qs + 1);
                            if (qs != std::string::npos && qe != std::string::npos) {
                                itemLabel = itemObj.substr(qs + 1, qe - qs - 1);
                            }
                        }

                        // Accelerator
                        size_t accelPos = itemObj.find("\"accelerator\"");
                        if (accelPos != std::string::npos) {
                            size_t qs = itemObj.find('"', itemObj.find(':', accelPos) + 1);
                            size_t qe = itemObj.find('"', qs + 1);
                            if (qs != std::string::npos && qe != std::string::npos) {
                                accel = itemObj.substr(qs + 1, qe - qs - 1);
                            }
                        }

                        // Enabled
                        if (itemObj.find("\"enabled\":false") != std::string::npos) {
                            enabled = false;
                        }

                        // Checked
                        if (itemObj.find("\"checked\":true") != std::string::npos) {
                            checked = true;
                        }

                        // Add item
                        UINT menuId = registerMenuItemId(itemId.c_str());
                        UINT flags = MF_STRING;
                        if (!enabled) flags |= MF_GRAYED;
                        if (checked) flags |= MF_CHECKED;

                        std::wstring wLabel = utf8_to_wide(itemLabel.c_str());
                        if (!accel.empty()) {
                            wLabel += buildAcceleratorText(accel.c_str());
                        }

                        AppendMenuW(popup, flags, menuId, wLabel.c_str());
                    }
                }
            }
        }

        // Add menu to bar
        std::wstring wLabel = utf8_to_wide(label.c_str());
        AppendMenuW(menuBar, MF_POPUP, (UINT_PTR)popup, wLabel.c_str());
    }

    SetMenu(hwnd, menuBar);
    DrawMenuBar(hwnd);

    return 0;
}

int platform_menu_update_item(void* window, const char* item_id,
                              const char* label, int enabled, int checked) {
    if (!window || !item_id) return -1;

    HWND hwnd = (HWND)window;
    HMENU menu = GetMenu(hwnd);
    if (!menu) return -1;

    // Find the menu ID
    auto it = g_stringIdToMenuId.find(item_id);
    if (it == g_stringIdToMenuId.end()) return -1;

    UINT menuId = it->second;

    // Get current menu item info
    MENUITEMINFOW mii = { sizeof(MENUITEMINFOW) };
    mii.fMask = MIIM_STATE | MIIM_STRING;

    wchar_t currentLabel[256] = {0};
    mii.dwTypeData = currentLabel;
    mii.cch = 255;

    // We need to find the item in the menu structure
    // This is simplified - in production you'd traverse all submenus

    if (label) {
        std::wstring newLabel = utf8_to_wide(label);
        mii.fMask |= MIIM_STRING;
        mii.dwTypeData = (LPWSTR)newLabel.c_str();
    }

    if (enabled >= 0) {
        mii.fMask |= MIIM_STATE;
        if (enabled) {
            mii.fState &= ~MFS_GRAYED;
            mii.fState |= MFS_ENABLED;
        } else {
            mii.fState |= MFS_GRAYED;
        }
    }

    if (checked >= 0) {
        mii.fMask |= MIIM_STATE;
        if (checked) {
            mii.fState |= MFS_CHECKED;
        } else {
            mii.fState &= ~MFS_CHECKED;
        }
    }

    // Try to set item in main menu and all submenus
    // Simplified: only handling first-level items
    int menuCount = GetMenuItemCount(menu);
    for (int i = 0; i < menuCount; i++) {
        HMENU submenu = GetSubMenu(menu, i);
        if (submenu) {
            int subCount = GetMenuItemCount(submenu);
            for (int j = 0; j < subCount; j++) {
                if (GetMenuItemID(submenu, j) == menuId) {
                    SetMenuItemInfoW(submenu, j, TRUE, &mii);
                    DrawMenuBar(hwnd);
                    return 0;
                }
            }
        }
    }

    return -1;
}

int platform_menu_set_item_enabled(void* window, const char* item_id, int enabled) {
    return platform_menu_update_item(window, item_id, NULL, enabled, -1);
}

int platform_menu_set_item_checked(void* window, const char* item_id, int checked) {
    return platform_menu_update_item(window, item_id, NULL, -1, checked);
}

int platform_menu_remove(void* window) {
    if (!window) return -1;

    HWND hwnd = (HWND)window;
    HMENU menu = GetMenu(hwnd);

    if (menu) {
        SetMenu(hwnd, NULL);
        DestroyMenu(menu);
    }

    // Clear state
    g_menuIdToStringId.clear();
    g_stringIdToMenuId.clear();
    g_stringIdToSubmenu.clear();

    // Remove subclass
    if (g_menuWindow == hwnd && g_originalWndProc) {
        SetWindowLongPtr(hwnd, GWLP_WNDPROC, (LONG_PTR)g_originalWndProc);
        g_originalWndProc = NULL;
        g_menuWindow = NULL;
    }

    return 0;
}

int platform_menu_set_default(void* window, const char* app_name,
                              platform_menu_callback_t callback, void* user_data) {
    if (!window || !app_name) return -1;

    HWND hwnd = (HWND)window;

    // Clear previous state
    g_menuIdToStringId.clear();
    g_stringIdToMenuId.clear();
    g_stringIdToSubmenu.clear();
    g_nextMenuId = 1000;

    g_menuCallback = callback;
    g_menuUserData = user_data;

    // Subclass window
    if (g_menuWindow != hwnd) {
        if (g_menuWindow && g_originalWndProc) {
            SetWindowLongPtr(g_menuWindow, GWLP_WNDPROC, (LONG_PTR)g_originalWndProc);
        }
        g_menuWindow = hwnd;
        g_originalWndProc = (WNDPROC)SetWindowLongPtr(hwnd, GWLP_WNDPROC, (LONG_PTR)MenuWndProc);
    }

    HMENU menuBar = CreateMenu();

    // ===== File Menu =====
    HMENU fileMenu = CreatePopupMenu();
    AppendMenuW(fileMenu, MF_STRING, registerMenuItemId("file_close"), L"Close\tCtrl+W");
    AppendMenuW(fileMenu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(fileMenu, MF_STRING, registerMenuItemId("file_exit"), L"Exit\tAlt+F4");
    AppendMenuW(menuBar, MF_POPUP, (UINT_PTR)fileMenu, L"&File");

    // ===== Edit Menu =====
    HMENU editMenu = CreatePopupMenu();
    AppendMenuW(editMenu, MF_STRING, registerMenuItemId("edit_undo"), L"Undo\tCtrl+Z");
    AppendMenuW(editMenu, MF_STRING, registerMenuItemId("edit_redo"), L"Redo\tCtrl+Y");
    AppendMenuW(editMenu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(editMenu, MF_STRING, registerMenuItemId("edit_cut"), L"Cut\tCtrl+X");
    AppendMenuW(editMenu, MF_STRING, registerMenuItemId("edit_copy"), L"Copy\tCtrl+C");
    AppendMenuW(editMenu, MF_STRING, registerMenuItemId("edit_paste"), L"Paste\tCtrl+V");
    AppendMenuW(editMenu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(editMenu, MF_STRING, registerMenuItemId("edit_selectall"), L"Select All\tCtrl+A");
    AppendMenuW(menuBar, MF_POPUP, (UINT_PTR)editMenu, L"&Edit");

    // ===== View Menu =====
    HMENU viewMenu = CreatePopupMenu();
    AppendMenuW(viewMenu, MF_STRING, registerMenuItemId("view_fullscreen"), L"Toggle Full Screen\tF11");
    AppendMenuW(menuBar, MF_POPUP, (UINT_PTR)viewMenu, L"&View");

    // ===== Window Menu =====
    HMENU windowMenu = CreatePopupMenu();
    AppendMenuW(windowMenu, MF_STRING, registerMenuItemId("window_minimize"), L"Minimize");
    AppendMenuW(windowMenu, MF_STRING, registerMenuItemId("window_maximize"), L"Maximize");
    AppendMenuW(menuBar, MF_POPUP, (UINT_PTR)windowMenu, L"&Window");

    // ===== Help Menu =====
    HMENU helpMenu = CreatePopupMenu();
    std::wstring aboutLabel = L"About " + utf8_to_wide(app_name);
    AppendMenuW(helpMenu, MF_STRING, registerMenuItemId("help_about"), aboutLabel.c_str());
    AppendMenuW(menuBar, MF_POPUP, (UINT_PTR)helpMenu, L"&Help");

    SetMenu(hwnd, menuBar);
    DrawMenuBar(hwnd);

    return 0;
}

int platform_menu_popup(void* window, const platform_menu_item_t* items, int item_count,
                        int x, int y, platform_menu_callback_t callback, void* user_data) {
    if (!window || !items || item_count <= 0) return -1;

    HWND hwnd = (HWND)window;

    // Store callback temporarily
    platform_menu_callback_t prevCallback = g_menuCallback;
    void* prevUserData = g_menuUserData;
    g_menuCallback = callback;
    g_menuUserData = user_data;

    // Create popup menu
    HMENU popup = CreatePopupMenu();

    for (int i = 0; i < item_count; i++) {
        addMenuItem(popup, &items[i]);
    }

    // Show popup menu
    UINT flags = TPM_LEFTALIGN | TPM_TOPALIGN | TPM_RETURNCMD;
    UINT result = TrackPopupMenu(popup, flags, x, y, 0, hwnd, NULL);

    if (result != 0) {
        // Find and call callback
        auto it = g_menuIdToStringId.find(result);
        if (it != g_menuIdToStringId.end() && callback) {
            callback(it->second.c_str(), user_data);
        }
    }

    DestroyMenu(popup);

    // Restore callback
    g_menuCallback = prevCallback;
    g_menuUserData = prevUserData;

    return 0;
}

} // extern "C"

#endif // _WIN32
