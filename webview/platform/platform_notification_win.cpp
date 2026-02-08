/**
 * Windows desktop notification implementation using Shell_NotifyIconW
 * Uses balloon tips for notifications (compatible with Windows 7+).
 * Action buttons are not supported in balloon tips - a future version
 * could use WinRT Toast Notifications for richer features.
 */

#ifdef _WIN32

#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <string.h>

extern "C" {
#include "platform_notification.h"
}

// ============================================================================
// Constants
// ============================================================================

#define WM_NOTIFICATION_MESSAGE (WM_USER + 100)
#define NOTIFICATION_ICON_ID 2001

// ============================================================================
// Global State
// ============================================================================

static notification_event_callback_t g_event_callback = NULL;
static void* g_event_userdata = NULL;
static volatile int g_initialized = 0;
static HWND g_notify_hwnd = NULL;
static NOTIFYICONDATAW g_nid = {};
static char g_current_notification_id[256] = {0};

// ============================================================================
// Window Procedure for Balloon Events
// ============================================================================

static LRESULT CALLBACK NotificationWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (msg == WM_NOTIFICATION_MESSAGE) {
        UINT event = LOWORD(lParam);

        if (event == NIN_BALLOONUSERCLICK) {
            // User clicked the balloon notification
            if (g_event_callback && g_current_notification_id[0] != '\0') {
                g_event_callback(g_current_notification_id, "click", -1, g_event_userdata);
            }
        } else if (event == NIN_BALLOONTIMEOUT) {
            // Balloon timed out (auto-dismissed)
            if (g_event_callback && g_current_notification_id[0] != '\0') {
                g_event_callback(g_current_notification_id, "close", -1, g_event_userdata);
            }
        } else if (event == NIN_BALLOONHIDE) {
            // Balloon was hidden (e.g., user closed it)
            if (g_event_callback && g_current_notification_id[0] != '\0') {
                g_event_callback(g_current_notification_id, "close", -1, g_event_userdata);
            }
        }
        return 0;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

// ============================================================================
// Platform API Implementation
// ============================================================================

int platform_notification_init(notification_event_callback_t callback, void* user_data) {
    if (g_initialized) {
        g_event_callback = callback;
        g_event_userdata = user_data;
        return 0;
    }

    g_event_callback = callback;
    g_event_userdata = user_data;

    // Register window class for notification messages
    WNDCLASSW wc = {};
    wc.lpfnWndProc = NotificationWndProc;
    wc.hInstance = GetModuleHandleW(NULL);
    wc.lpszClassName = L"TronbunNotificationWindow";
    RegisterClassW(&wc);

    // Create hidden message-only window
    g_notify_hwnd = CreateWindowW(L"TronbunNotificationWindow", L"", 0,
                                  0, 0, 0, 0, HWND_MESSAGE, NULL,
                                  GetModuleHandleW(NULL), NULL);

    if (!g_notify_hwnd) {
        fprintf(stderr, "[Notification] Failed to create message window\n");
        return -1;
    }

    // Initialize notification icon data
    memset(&g_nid, 0, sizeof(g_nid));
    g_nid.cbSize = sizeof(NOTIFYICONDATAW);
    g_nid.hWnd = g_notify_hwnd;
    g_nid.uID = NOTIFICATION_ICON_ID;
    g_nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    g_nid.uCallbackMessage = WM_NOTIFICATION_MESSAGE;
    g_nid.hIcon = LoadIconW(NULL, IDI_APPLICATION);
    wcscpy_s(g_nid.szTip, 128, L"Tronbun");

    // Add the notification icon (hidden in tray)
    if (!Shell_NotifyIconW(NIM_ADD, &g_nid)) {
        fprintf(stderr, "[Notification] Failed to create notification icon\n");
        DestroyWindow(g_notify_hwnd);
        g_notify_hwnd = NULL;
        return -1;
    }

    // Set version for modern balloon behavior
    g_nid.uVersion = NOTIFYICON_VERSION_4;
    Shell_NotifyIconW(NIM_SETVERSION, &g_nid);

    g_initialized = 1;
    return 0;
}

int platform_notification_show(const notification_options_t* options) {
    if (!options || !g_initialized || !g_notify_hwnd) return -1;

    // Store the current notification ID for event callbacks
    strncpy(g_current_notification_id, options->id, sizeof(g_current_notification_id) - 1);
    g_current_notification_id[sizeof(g_current_notification_id) - 1] = '\0';

    // Convert title and body to wide strings
    WCHAR title_w[256] = {0};
    WCHAR body_w[256] = {0};

    MultiByteToWideChar(CP_UTF8, 0, options->title, -1, title_w, 256);
    if (options->body[0] != '\0') {
        MultiByteToWideChar(CP_UTF8, 0, options->body, -1, body_w, 256);
    }

    // Set balloon notification flags
    g_nid.uFlags |= NIF_INFO;

    // Copy title and body
    wcsncpy(g_nid.szInfoTitle, title_w, 63);
    g_nid.szInfoTitle[63] = L'\0';
    wcsncpy(g_nid.szInfo, body_w, 255);
    g_nid.szInfo[255] = L'\0';

    // Set icon/urgency style
    switch (options->urgency) {
        case NOTIFICATION_URGENCY_LOW:
            g_nid.dwInfoFlags = NIIF_INFO;
            break;
        case NOTIFICATION_URGENCY_NORMAL:
            g_nid.dwInfoFlags = NIIF_INFO;
            break;
        case NOTIFICATION_URGENCY_CRITICAL:
            g_nid.dwInfoFlags = NIIF_WARNING;
            break;
        default:
            g_nid.dwInfoFlags = NIIF_INFO;
            break;
    }

    // Use custom icon if provided
    if (options->icon[0] != '\0') {
        WCHAR icon_path_w[MAX_PATH] = {0};
        MultiByteToWideChar(CP_UTF8, 0, options->icon, -1, icon_path_w, MAX_PATH);
        HICON hIcon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON,
                                        0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
        if (hIcon) {
            g_nid.dwInfoFlags = NIIF_USER;
            g_nid.hBalloonIcon = hIcon;
        }
    }

    // Suppress sound if silent
    if (options->silent) {
        g_nid.dwInfoFlags |= NIIF_NOSOUND;
    }

    // Show the balloon notification
    if (!Shell_NotifyIconW(NIM_MODIFY, &g_nid)) {
        fprintf(stderr, "[Notification] Failed to show balloon notification\n");
        return -1;
    }

    return 0;
}

int platform_notification_close(const char* notification_id) {
    if (!notification_id || !g_initialized || !g_notify_hwnd) return -1;

    // Clear the balloon by setting empty info text
    g_nid.uFlags |= NIF_INFO;
    g_nid.szInfo[0] = L'\0';
    g_nid.szInfoTitle[0] = L'\0';
    Shell_NotifyIconW(NIM_MODIFY, &g_nid);

    g_current_notification_id[0] = '\0';
    return 0;
}

int platform_notification_is_available(void) {
    // Balloon notifications are always available on Windows
    return 1;
}

void platform_notification_cleanup(void) {
    if (g_notify_hwnd) {
        Shell_NotifyIconW(NIM_DELETE, &g_nid);
        DestroyWindow(g_notify_hwnd);
        g_notify_hwnd = NULL;
    }

    g_event_callback = NULL;
    g_event_userdata = NULL;
    g_initialized = 0;
    g_current_notification_id[0] = '\0';
}

#endif // _WIN32
