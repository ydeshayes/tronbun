/**
 * Windows desktop notification implementation using Shell_NotifyIconW
 * Uses balloon tips for notifications (compatible with Windows 7+).
 * Action buttons are not supported in balloon tips - a future version
 * could use WinRT Toast Notifications for richer features.
 */

#ifdef _WIN32

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <objbase.h>
#include <propsys.h>
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

// App icon for balloon notifications (loaded from set_icon, separate from tray icon)
static HICON g_balloon_icon = NULL;

// Icon path stored before init so it can be used during NIM_ADD
static char g_pending_icon_path[MAX_PATH] = {0};

// ============================================================================
// Toast Notification Identity (AUMID + Start Menu shortcut)
// On Windows 10+, toast notification headers show the app icon from the
// Start Menu shortcut associated with the process's AppUserModelID.
// Without this, the header shows the default executable icon.
// ============================================================================

// COM GUIDs defined locally to avoid linker dependency issues
namespace {
    const CLSID kCLSID_ShellLink =
        {0x00021401, 0x0000, 0x0000, {0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
    const IID kIID_IShellLinkW =
        {0x000214F9, 0x0000, 0x0000, {0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
    const IID kIID_IPersistFile =
        {0x0000010B, 0x0000, 0x0000, {0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
    const IID kIID_IPropertyStore =
        {0x886D8EEB, 0x8CF2, 0x4446, {0x8D, 0x02, 0xCD, 0xBA, 0x1D, 0xBD, 0xCF, 0x99}};
    const PROPERTYKEY kPKEY_AppUserModel_ID = {
        {0x9F4C2855, 0x9F79, 0x4B39, {0xA8, 0xD0, 0xE1, 0xD4, 0x2D, 0xE1, 0xD5, 0xF3}}, 5
    };
}

static WCHAR g_toast_shortcut_path[MAX_PATH] = {0};

/**
 * Set up Windows toast notification identity so the toast header shows the
 * correct app icon. Creates an AUMID for the process and a temporary Start
 * Menu shortcut (.lnk) with the icon. Must be called BEFORE NIM_ADD.
 */
static void setup_toast_identity(const char* icon_path) {
    if (!icon_path || icon_path[0] == '\0') return;

    WCHAR exePath[MAX_PATH];
    GetModuleFileNameW(NULL, exePath, MAX_PATH);

    // Extract exe base name for unique AUMID
    WCHAR* fileName = wcsrchr(exePath, L'\\');
    fileName = fileName ? fileName + 1 : exePath;
    WCHAR baseName[MAX_PATH];
    wcsncpy(baseName, fileName, MAX_PATH - 1);
    baseName[MAX_PATH - 1] = L'\0';
    WCHAR* dot = wcsrchr(baseName, L'.');
    if (dot) *dot = L'\0';

    // Build AUMID: "Tronbun.<exeName>"
    WCHAR aumid[256] = {0};
    wcsncpy(aumid, L"Tronbun.", 255);
    wcsncat(aumid, baseName, 255 - wcslen(aumid));

    // Set AUMID BEFORE Shell_NotifyIconW(NIM_ADD)
    SetCurrentProcessExplicitAppUserModelID(aumid);

    // Initialize COM for IShellLink
    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (hr == RPC_E_CHANGED_MODE) {
        hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    }
    if (FAILED(hr) && hr != S_FALSE) {
        fprintf(stderr, "[Notification] COM init failed: 0x%08lX\n", (unsigned long)hr);
        return;
    }

    // Create IShellLink for the Start Menu shortcut
    IShellLinkW* psl = NULL;
    hr = CoCreateInstance(kCLSID_ShellLink, NULL, CLSCTX_INPROC_SERVER,
                          kIID_IShellLinkW, (void**)&psl);
    if (FAILED(hr) || !psl) {
        fprintf(stderr, "[Notification] Failed to create ShellLink: 0x%08lX\n", (unsigned long)hr);
        return;
    }

    psl->SetPath(exePath);
    psl->SetArguments(L"");

    // Set the app icon on the shortcut
    WCHAR iconPathW[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, icon_path, -1, iconPathW, MAX_PATH);
    psl->SetIconLocation(iconPathW, 0);

    // Set AUMID property on the shortcut so Windows matches it to this process
    IPropertyStore* pps = NULL;
    hr = psl->QueryInterface(kIID_IPropertyStore, (void**)&pps);
    if (SUCCEEDED(hr) && pps) {
        PROPVARIANT pv;
        memset(&pv, 0, sizeof(pv));
        pv.vt = VT_LPWSTR;
        size_t len = wcslen(aumid) + 1;
        pv.pwszVal = (LPWSTR)CoTaskMemAlloc(len * sizeof(WCHAR));
        if (pv.pwszVal) {
            memcpy(pv.pwszVal, aumid, len * sizeof(WCHAR));
            pps->SetValue(kPKEY_AppUserModel_ID, pv);
            CoTaskMemFree(pv.pwszVal);
        }
        pps->Commit();
        pps->Release();
    }

    // Save shortcut to user's Start Menu Programs folder
    IPersistFile* ppf = NULL;
    hr = psl->QueryInterface(kIID_IPersistFile, (void**)&ppf);
    if (SUCCEEDED(hr) && ppf) {
        WCHAR startMenu[MAX_PATH];
        if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_PROGRAMS, NULL, 0, startMenu))) {
            // Name the shortcut after the app so toast attribution shows the app name
            _snwprintf(g_toast_shortcut_path, MAX_PATH - 1, L"%ls\\%ls.lnk", startMenu, baseName);
            g_toast_shortcut_path[MAX_PATH - 1] = L'\0';
            ppf->Save(g_toast_shortcut_path, TRUE);
            fprintf(stderr, "[Notification] Toast identity shortcut created for AUMID: Tronbun.%ls\n", baseName);
        }
        ppf->Release();
    }

    psl->Release();
}

/**
 * Clean up the temporary Start Menu shortcut created for toast identity.
 */
static void cleanup_toast_identity(void) {
    if (g_toast_shortcut_path[0] != L'\0') {
        DeleteFileW(g_toast_shortcut_path);
        g_toast_shortcut_path[0] = L'\0';
    }
}

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

    // Use the app icon if it was set before init, otherwise fall back to default
    if (g_pending_icon_path[0] != '\0') {
        WCHAR icon_path_w[MAX_PATH];
        MultiByteToWideChar(CP_UTF8, 0, g_pending_icon_path, -1, icon_path_w, MAX_PATH);
        HICON custom_icon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON,
            GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON),
            LR_LOADFROMFILE);
        g_nid.hIcon = custom_icon ? custom_icon : LoadIconW(NULL, IDI_APPLICATION);
        // Also load the large balloon icon if not already loaded
        if (!g_balloon_icon) {
            g_balloon_icon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON,
                0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
        }
    } else {
        g_nid.hIcon = LoadIconW(NULL, IDI_APPLICATION);
    }

    wcscpy_s(g_nid.szTip, 128, L"Tronbun");

    // Hide this icon from the tray area — notifications use the app's
    // existing tray icon (from Tray class). We only need the HWND for
    // balloon/toast delivery, not a visible tray entry.
    g_nid.uFlags |= NIF_STATE;
    g_nid.dwState = NIS_HIDDEN;
    g_nid.dwStateMask = NIS_HIDDEN;

    // Set up toast identity (AUMID + Start Menu shortcut) BEFORE NIM_ADD
    // so Windows associates the correct icon with this notification source
    if (g_pending_icon_path[0] != '\0') {
        setup_toast_identity(g_pending_icon_path);
    }

    // Add the notification icon (hidden in tray, used only for toast delivery)
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

    // Use custom per-notification icon, or fall back to the app icon for the balloon
    if (options->icon[0] != '\0') {
        WCHAR icon_path_w[MAX_PATH] = {0};
        MultiByteToWideChar(CP_UTF8, 0, options->icon, -1, icon_path_w, MAX_PATH);
        HICON hIcon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON,
                                        0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
        if (hIcon) {
            g_nid.dwInfoFlags = NIIF_USER | NIIF_LARGE_ICON;
            g_nid.hBalloonIcon = hIcon;
        }
    } else if (g_balloon_icon) {
        // Use the app icon for balloon notifications
        g_nid.dwInfoFlags = NIIF_USER | NIIF_LARGE_ICON;
        g_nid.hBalloonIcon = g_balloon_icon;
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

int platform_notification_set_icon(const char* icon_path) {
    if (!icon_path || icon_path[0] == '\0') return -1;

    // Always store the path so init can use it if called later
    strncpy(g_pending_icon_path, icon_path, MAX_PATH - 1);
    g_pending_icon_path[MAX_PATH - 1] = '\0';

    WCHAR icon_path_w[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, icon_path, -1, icon_path_w, MAX_PATH);

    // Load large icon for balloon notification popups
    HICON new_balloon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON,
        0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
    if (new_balloon) {
        if (g_balloon_icon) DestroyIcon(g_balloon_icon);
        g_balloon_icon = new_balloon;
    }

    // Load small icon for the tray area
    HICON new_icon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON,
        GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON),
        LR_LOADFROMFILE);

    if (!new_icon && !new_balloon) {
        fprintf(stderr, "[Notification] Failed to load icon from: %s\n", icon_path);
        return -1;
    }

    // Update tray icon if notification system is already initialized
    if (new_icon && g_notify_hwnd && g_initialized) {
        HICON old_icon = g_nid.hIcon;
        g_nid.hIcon = new_icon;
        Shell_NotifyIconW(NIM_MODIFY, &g_nid);
        if (old_icon && old_icon != LoadIconW(NULL, IDI_APPLICATION)) {
            DestroyIcon(old_icon);
        }
    } else if (new_icon) {
        // Not yet initialized — icon will be used when init calls NIM_ADD
        DestroyIcon(new_icon);
    }

    fprintf(stderr, "[Notification] Icon set from: %s\n", icon_path);
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

    // Remove temporary Start Menu shortcut
    cleanup_toast_identity();

    g_event_callback = NULL;
    g_event_userdata = NULL;
    g_initialized = 0;
    g_current_notification_id[0] = '\0';
}

#endif // _WIN32
