#ifdef _WIN32
#include <windows.h>
#include <dwmapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "platform_window.h"
#include "../../vendors/cJSON/cJSON.h"

// Global storage for context menu data
static char* contextMenuJson = NULL;

// Forward declaration for context menu hook function
static void installContextMenuHook(HWND hwnd);

void platform_window_set_transparent(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        LONG style = GetWindowLong(hwnd, GWL_EXSTYLE);
        SetWindowLong(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED);
        SetLayeredWindowAttributes(hwnd, 0, 200, LWA_ALPHA);  // 200/255 transparency
    }
}

void platform_window_set_opaque(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        // Remove the WS_EX_LAYERED style to disable transparency
        LONG style = GetWindowLong(hwnd, GWL_EXSTYLE);
        SetWindowLong(hwnd, GWL_EXSTYLE, style & ~WS_EX_LAYERED);
        
        // Disable DWM blur behind effect
        DWM_BLURBEHIND bb = {0};
        bb.dwFlags = DWM_BB_ENABLE;
        bb.fEnable = FALSE;
        bb.hRgnBlur = NULL;
        DwmEnableBlurBehindWindow(hwnd, &bb);
        
        // Force window to redraw with new style
        SetWindowPos(hwnd, NULL, 0, 0, 0, 0, 
            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER);
    }
}

void platform_window_enable_blur(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        // Enable blur behind window using DWM (Windows Vista+)
        DWM_BLURBEHIND bb = {0};
        bb.dwFlags = DWM_BB_ENABLE;
        bb.fEnable = TRUE;
        bb.hRgnBlur = NULL;
        DwmEnableBlurBehindWindow(hwnd, &bb);
        
        // For Windows 10+ acrylic effect, we could also try:
        // ACCENT_POLICY accent = { ACCENT_ENABLE_BLURBEHIND, 0, 0, 0 };
        // WINCOMPATTRDATA data = { WCA_ACCENT_POLICY, &accent, sizeof(accent) };
        // SetWindowCompositionAttribute(hwnd, &data);
    }
}

void platform_window_remove_decorations(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        SetWindowLong(hwnd, GWL_STYLE, WS_POPUP | WS_VISIBLE);
        // Force window to redraw with new style
        SetWindowPos(hwnd, NULL, 0, 0, 0, 0, 
            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER);
    }
}

void platform_window_add_decorations(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        // Restore standard window style with title bar, borders, and system menu
        LONG style = WS_OVERLAPPEDWINDOW | WS_VISIBLE;
        SetWindowLong(hwnd, GWL_STYLE, style);
        
        // Force window to redraw with new style
        SetWindowPos(hwnd, NULL, 0, 0, 0, 0, 
            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER);
    }
}

void platform_window_set_always_on_top(void *native_window, int on_top) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        SetWindowPos(hwnd, on_top ? HWND_TOPMOST : HWND_NOTOPMOST, 
            0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
    }
}

void platform_window_set_opacity(void *native_window, float opacity) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        // Clamp opacity between 0.0 and 1.0
        if (opacity < 0.0f) opacity = 0.0f;
        if (opacity > 1.0f) opacity = 1.0f;
        
        LONG style = GetWindowLong(hwnd, GWL_EXSTYLE);
        SetWindowLong(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED);
        SetLayeredWindowAttributes(hwnd, 0, (BYTE)(opacity * 255), LWA_ALPHA);
    }
}

void platform_window_set_resizable(void *native_window, int resizable) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        LONG style = GetWindowLong(hwnd, GWL_STYLE);
        if (resizable) {
            style |= WS_THICKFRAME | WS_MAXIMIZEBOX;
        } else {
            style &= ~(WS_THICKFRAME | WS_MAXIMIZEBOX);
        }
        SetWindowLong(hwnd, GWL_STYLE, style);
        // Force redraw
        SetWindowPos(hwnd, NULL, 0, 0, 0, 0, 
            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER);
    }
}

void platform_window_set_position(void *native_window, int x, int y) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        SetWindowPos(hwnd, NULL, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
    }
}

void platform_window_center(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        RECT windowRect, desktopRect;
        GetWindowRect(hwnd, &windowRect);
        GetWindowRect(GetDesktopWindow(), &desktopRect);
        
        int windowWidth = windowRect.right - windowRect.left;
        int windowHeight = windowRect.bottom - windowRect.top;
        int desktopWidth = desktopRect.right - desktopRect.left;
        int desktopHeight = desktopRect.bottom - desktopRect.top;
        
        int x = (desktopWidth - windowWidth) / 2;
        int y = (desktopHeight - windowHeight) / 2;
        
        SetWindowPos(hwnd, NULL, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
    }
}

void platform_window_minimize(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        ShowWindow(hwnd, SW_MINIMIZE);
    }
}

void platform_window_maximize(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        ShowWindow(hwnd, SW_MAXIMIZE);
    }
}

void platform_window_restore(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        ShowWindow(hwnd, SW_RESTORE);
    }
}

void platform_window_hide(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        ShowWindow(hwnd, SW_HIDE);
    }
}

void platform_window_show(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        ShowWindow(hwnd, SW_SHOW);
        SetForegroundWindow(hwnd);
    }
}

// Menu item data structure
typedef struct {
    char id[256];
    char label[256];
    char type[64];
    int enabled;
} MenuItemData;

static int parseMenuItems(const char* json, MenuItemData* items, int maxItems) {
    if (!json || !items) return 0;
    
    cJSON* root = cJSON_Parse(json);
    if (!root) {
        fprintf(stderr, "Failed to parse JSON: %s\n", cJSON_GetErrorPtr());
        return 0;
    }
    
    if (!cJSON_IsArray(root)) {
        fprintf(stderr, "JSON root is not an array\n");
        cJSON_Delete(root);
        return 0;
    }
    
    int count = 0;
    int arraySize = cJSON_GetArraySize(root);
    int maxCount = (arraySize < maxItems) ? arraySize : maxItems;
    
    for (int i = 0; i < maxCount; i++) {
        cJSON* item = cJSON_GetArrayItem(root, i);
        if (!cJSON_IsObject(item)) {
            continue;
        }
        
        // Initialize item
        memset(&items[count], 0, sizeof(MenuItemData));
        items[count].enabled = 1; // Default to enabled
        
        // Extract id
        cJSON* id = cJSON_GetObjectItem(item, "id");
        if (cJSON_IsString(id) && id->valuestring) {
            strncpy(items[count].id, id->valuestring, 255);
            items[count].id[255] = '\0';
        }
        
        // Extract label
        cJSON* label = cJSON_GetObjectItem(item, "label");
        if (cJSON_IsString(label) && label->valuestring) {
            strncpy(items[count].label, label->valuestring, 255);
            items[count].label[255] = '\0';
        }
        
        // Extract type
        cJSON* type = cJSON_GetObjectItem(item, "type");
        if (cJSON_IsString(type) && type->valuestring) {
            strncpy(items[count].type, type->valuestring, 63);
            items[count].type[63] = '\0';
        }
        
        // Extract enabled
        cJSON* enabled = cJSON_GetObjectItem(item, "enabled");
        if (cJSON_IsBool(enabled)) {
            items[count].enabled = cJSON_IsTrue(enabled) ? 1 : 0;
        }
        
        count++;
    }
    
    cJSON_Delete(root);
    return count;
}

void platform_window_set_context_menu(void *native_window, const char *menu_json) {
    HWND hwnd = (HWND)native_window;
    if (!hwnd || !menu_json) {
        fprintf(stderr, "platform_window_set_context_menu: Invalid parameters\n");
        return;
    }
    
    fprintf(stderr, "platform_window_set_context_menu: Setting native context menu with JSON: %s\n", menu_json);
    
    // Clear existing menu data
    if (contextMenuJson) {
        free(contextMenuJson);
        contextMenuJson = NULL;
    }
    
    // Store JSON for later use (similar to macOS approach)
    contextMenuJson = _strdup(menu_json);
    
    // Parse menu items to validate JSON
    MenuItemData items[32]; // Support up to 32 menu items
    int itemCount = parseMenuItems(menu_json, items, 32);
    
    if (itemCount > 0) {
        // Install the context menu hook (similar to macOS method swizzling)
        installContextMenuHook(hwnd);
        
        fprintf(stderr, "Native context menu items set for window with %d items\n", itemCount);
    }
}

void platform_window_clear_context_menu(void *native_window) {
    HWND hwnd = (HWND)native_window;
    if (!hwnd) {
        fprintf(stderr, "platform_window_clear_context_menu: Invalid window parameter\n");
        return;
    }
    
    // Clear stored JSON data
    if (contextMenuJson) {
        free(contextMenuJson);
        contextMenuJson = NULL;
    }
    
    fprintf(stderr, "platform_window_clear_context_menu: Native context menu cleared for window\n");
}

// Window procedure hook for handling context menu
static WNDPROC originalWndProc = NULL;

static LRESULT CALLBACK ContextMenuWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
        case WM_CONTEXTMENU:
            if (contextMenuJson) {
                // Parse menu items and create menu dynamically (like macOS approach)
                MenuItemData items[32];
                int itemCount = parseMenuItems(contextMenuJson, items, 32);
                
                if (itemCount == 0) {
                    // No custom menu, use default behavior
                    break;
                }
                
                // Create custom context menu dynamically
                HMENU customMenu = CreatePopupMenu();
                
                for (int i = 0; i < itemCount; i++) {
                    if (strcmp(items[i].type, "separator") == 0) {
                        AppendMenuA(customMenu, MF_SEPARATOR, 0, NULL);
                    } else {
                        UINT flags = MF_STRING;
                        if (!items[i].enabled) {
                            flags |= MF_GRAYED;
                        }
                        AppendMenuA(customMenu, flags, 1000 + i, items[i].label);
                    }
                }
                
                POINT pt;
                pt.x = LOWORD(lParam);
                pt.y = HIWORD(lParam);
                
                // If coordinates are -1, -1, use current cursor position
                if (pt.x == -1 && pt.y == -1) {
                    GetCursorPos(&pt);
                }
                
                int result = TrackPopupMenu(customMenu, TPM_RETURNCMD | TPM_RIGHTBUTTON, 
                                          pt.x, pt.y, 0, hwnd, NULL);
                
                if (result >= 1000) {
                    int itemIndex = result - 1000;
                    if (itemIndex < itemCount) {
                        // Send context menu click event to stdout for IPC
                        printf("{\"type\":\"context_menu_click\",\"id\":\"%s\"}\n", items[itemIndex].id);
                        fflush(stdout);
                    }
                }
                
                // Clean up the dynamically created menu
                DestroyMenu(customMenu);
                return 0;
            }
            break;
    }
    
    return CallWindowProc(originalWndProc, hwnd, msg, wParam, lParam);
}

// Function to install context menu hook (called when setting context menu)
static void installContextMenuHook(HWND hwnd) {
    if (!originalWndProc) {
        originalWndProc = (WNDPROC)SetWindowLongPtr(hwnd, GWLP_WNDPROC, (LONG_PTR)ContextMenuWndProc);
    }
}

#endif // _WIN32