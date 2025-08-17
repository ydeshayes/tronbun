#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#include <commctrl.h>
#include "platform_tray.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WM_TRAY_MESSAGE (WM_USER + 1)
#define TRAY_ID 1001

typedef struct menu_item_info {
    char id[256];
    UINT menu_id;
    struct menu_item_info* next;
} menu_item_info_t;

struct platform_tray {
    HWND hwnd;
    NOTIFYICONDATA nid;
    HMENU menu;
    platform_tray_click_callback_t click_callback;
    platform_menu_click_callback_t menu_callback;
    void* userdata;
    menu_item_info_t* menu_items;
    UINT next_menu_id;
};

static platform_tray_t* g_tray = NULL; // Global tray instance for window procedure

LRESULT CALLBACK TrayWindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (msg == WM_TRAY_MESSAGE) {
        // Both left-click and right-click now show the menu
        if ((lParam == WM_LBUTTONUP || lParam == WM_RBUTTONUP) && g_tray && g_tray->menu) {
            POINT pt;
            GetCursorPos(&pt);
            SetForegroundWindow(hwnd);
            
            UINT cmd = TrackPopupMenu(g_tray->menu, TPM_RETURNCMD | TPM_NONOTIFY,
                                    pt.x, pt.y, 0, hwnd, NULL);
            
            if (cmd > 0 && g_tray && g_tray->menu_callback) {
                // Find menu item by ID
                menu_item_info_t* item = g_tray->menu_items;
                while (item) {
                    if (item->menu_id == cmd) {
                        g_tray->menu_callback(item->id, g_tray->userdata);
                        break;
                    }
                    item = item->next;
                }
            }
            
            PostMessage(hwnd, WM_NULL, 0, 0);
        }
        return 0;
    }
    
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

platform_tray_t* platform_tray_create(const char* icon_path, const char* tooltip) {
    platform_tray_t* tray = (platform_tray_t*)calloc(1, sizeof(platform_tray_t));
    if (!tray) return NULL;
    
    // Register window class
    WNDCLASS wc = {0};
    wc.lpfnWndProc = TrayWindowProc;
    wc.hInstance = GetModuleHandle(NULL);
    wc.lpszClassName = L"TronbunTrayWindow";
    RegisterClass(&wc);
    
    // Create hidden window for message handling
    tray->hwnd = CreateWindow(L"TronbunTrayWindow", L"", 0, 0, 0, 0, 0, 
                             HWND_MESSAGE, NULL, GetModuleHandle(NULL), NULL);
    
    if (!tray->hwnd) {
        free(tray);
        return NULL;
    }
    
    // Initialize tray icon data
    tray->nid.cbSize = sizeof(NOTIFYICONDATA);
    tray->nid.hWnd = tray->hwnd;
    tray->nid.uID = TRAY_ID;
    tray->nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    tray->nid.uCallbackMessage = WM_TRAY_MESSAGE;
    
    // Load icon
    if (icon_path) {
        WCHAR icon_path_w[MAX_PATH];
        MultiByteToWideChar(CP_UTF8, 0, icon_path, -1, icon_path_w, MAX_PATH);
        tray->nid.hIcon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
        
        if (!tray->nid.hIcon) {
            // Fallback to default icon
            tray->nid.hIcon = LoadIcon(NULL, IDI_APPLICATION);
        }
    } else {
        tray->nid.hIcon = LoadIcon(NULL, IDI_APPLICATION);
    }
    
    // Set tooltip
    if (tooltip) {
        MultiByteToWideChar(CP_UTF8, 0, tooltip, -1, tray->nid.szTip, sizeof(tray->nid.szTip) / sizeof(WCHAR));
    }
    
    // Add tray icon
    if (!Shell_NotifyIcon(NIM_ADD, &tray->nid)) {
        DestroyWindow(tray->hwnd);
        free(tray);
        return NULL;
    }
    
    tray->next_menu_id = 2000;
    g_tray = tray; // Set global reference
    
    return tray;
}

void platform_tray_destroy(platform_tray_t* tray) {
    if (!tray) return;
    
    // Remove tray icon
    Shell_NotifyIcon(NIM_DELETE, &tray->nid);
    
    // Destroy menu
    if (tray->menu) {
        DestroyMenu(tray->menu);
    }
    
    // Free menu items list
    menu_item_info_t* item = tray->menu_items;
    while (item) {
        menu_item_info_t* next = item->next;
        free(item);
        item = next;
    }
    
    // Destroy window
    if (tray->hwnd) {
        DestroyWindow(tray->hwnd);
    }
    
    if (g_tray == tray) {
        g_tray = NULL;
    }
    
    free(tray);
}

int platform_tray_set_icon(platform_tray_t* tray, const char* icon_path) {
    if (!tray || !icon_path) return -1;
    
    WCHAR icon_path_w[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, icon_path, -1, icon_path_w, MAX_PATH);
    
    HICON new_icon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
    if (!new_icon) return -1;
    
    HICON old_icon = tray->nid.hIcon;
    tray->nid.hIcon = new_icon;
    
    BOOL result = Shell_NotifyIcon(NIM_MODIFY, &tray->nid);
    
    if (old_icon && old_icon != LoadIcon(NULL, IDI_APPLICATION)) {
        DestroyIcon(old_icon);
    }
    
    return result ? 0 : -1;
}

int platform_tray_set_tooltip(platform_tray_t* tray, const char* tooltip) {
    if (!tray || !tooltip) return -1;
    
    MultiByteToWideChar(CP_UTF8, 0, tooltip, -1, tray->nid.szTip, sizeof(tray->nid.szTip) / sizeof(WCHAR));
    
    return Shell_NotifyIcon(NIM_MODIFY, &tray->nid) ? 0 : -1;
}

int platform_tray_set_menu(platform_tray_t* tray, const platform_menu_item_t* menu_items, int count) {
    if (!tray || !menu_items || count <= 0) return -1;
    
    // Destroy existing menu
    if (tray->menu) {
        DestroyMenu(tray->menu);
    }
    
    // Free existing menu items list
    menu_item_info_t* item = tray->menu_items;
    while (item) {
        menu_item_info_t* next = item->next;
        free(item);
        item = next;
    }
    tray->menu_items = NULL;
    
    // Create new menu
    tray->menu = CreatePopupMenu();
    if (!tray->menu) return -1;
    
    for (int i = 0; i < count; i++) {
        const platform_menu_item_t* menu_item = &menu_items[i];
        
        if (menu_item->type == 1) { // separator
            AppendMenu(tray->menu, MF_SEPARATOR, 0, NULL);
        } else {
            WCHAR label_w[256];
            MultiByteToWideChar(CP_UTF8, 0, menu_item->label, -1, label_w, 256);
            
            UINT flags = MF_STRING;
            if (!menu_item->enabled) flags |= MF_GRAYED;
            if (menu_item->type == 2 && menu_item->checked) flags |= MF_CHECKED;
            
            UINT menu_id = tray->next_menu_id++;
            AppendMenuW(tray->menu, flags, menu_id, label_w);
            
            // Store menu item info
            menu_item_info_t* info = (menu_item_info_t*)malloc(sizeof(menu_item_info_t));
            strncpy(info->id, menu_item->id, sizeof(info->id) - 1);
            info->id[sizeof(info->id) - 1] = '\0';
            info->menu_id = menu_id;
            info->next = tray->menu_items;
            tray->menu_items = info;
        }
    }
    
    return 0;
}

void platform_tray_set_click_callback(platform_tray_t* tray, platform_tray_click_callback_t callback, void* userdata) {
    if (!tray) return;
    
    tray->click_callback = callback;
    tray->userdata = userdata;
}

void platform_tray_set_menu_callback(platform_tray_t* tray, platform_menu_click_callback_t callback, void* userdata) {
    if (!tray) return;
    
    tray->menu_callback = callback;
    tray->userdata = userdata;
}

int platform_tray_show_notification(platform_tray_t* tray, const char* title, const char* body) {
    if (!tray || !title || !body) return -1;
    
    // Use balloon tooltip for notification
    tray->nid.uFlags |= NIF_INFO;
    tray->nid.dwInfoFlags = NIIF_INFO;
    
    MultiByteToWideChar(CP_UTF8, 0, title, -1, tray->nid.szInfoTitle, sizeof(tray->nid.szInfoTitle) / sizeof(WCHAR));
    MultiByteToWideChar(CP_UTF8, 0, body, -1, tray->nid.szInfo, sizeof(tray->nid.szInfo) / sizeof(WCHAR));
    
    BOOL result = Shell_NotifyIcon(NIM_MODIFY, &tray->nid);
    
    // Reset flags
    tray->nid.uFlags &= ~NIF_INFO;
    
    return result ? 0 : -1;
}

void platform_tray_run_event_loop(void* context) {
    // Import the IPC context structure
    typedef struct {
        int should_exit;
        void* application_data;
    } ipc_base_context_t;
    
    ipc_base_context_t* ipc_context = (ipc_base_context_t*)context;
    
    // Windows message loop
    MSG msg;
    while (!ipc_context->should_exit) {
        if (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        Sleep(10); // 10ms
    }
}

int platform_tray_is_supported(void) {
    return 1; // Windows always supports tray icons
}

#endif // _WIN32
