/**
 * Notification FFI Library for Bun (Windows)
 *
 * Compiled as libnotification.dll, loaded by the Bun process via bun:ffi.
 * Uses Shell_NotifyIconW balloon tips for notifications.
 *
 * A background thread runs a Windows message pump so balloon events
 * (click, timeout, hide) are received and forwarded to the JS callback.
 *
 * All exported functions are synchronous — show/close post a message to
 * the background thread and wait for completion via a Win32 Event.
 */

#ifdef _WIN32

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <objbase.h>
#include <propsys.h>
#include <process.h>
#include <stdio.h>
#include <string.h>

// ============================================================================
// Types
// ============================================================================

typedef void (*notification_ffi_callback_t)(const char* id, const char* event, int action_idx);

// ============================================================================
// Constants
// ============================================================================

#define WM_NOTIFICATION_MESSAGE  (WM_USER + 100)
#define WM_FFI_SHOW              (WM_APP + 1)
#define WM_FFI_CLOSE             (WM_APP + 2)
#define WM_FFI_QUIT              (WM_APP + 3)
#define WM_FFI_SET_ICON          (WM_APP + 4)
#define NOTIFICATION_ICON_ID     2001

// ============================================================================
// Shared State (protected by g_cs)
// ============================================================================

static notification_ffi_callback_t g_callback = NULL;
static volatile int g_initialized = 0;
static HWND g_notify_hwnd = NULL;
static HANDLE g_thread = NULL;
static HANDLE g_init_event = NULL;     // Signaled when background thread is ready
static HANDLE g_complete_event = NULL; // Signaled when show/close operation completes
static CRITICAL_SECTION g_cs;

static NOTIFYICONDATAW g_nid = {};
static char g_current_notification_id[256] = {0};

// Icon path set before or after init (used by background thread)
static char g_icon_path[MAX_PATH] = {0};
static WCHAR g_pending_icon_path[MAX_PATH] = {0};

// Large icon for balloon notification popups (separate from the small tray icon)
static HICON g_balloon_icon = NULL;

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

    // Initialize COM for IShellLink (STA for message pump thread)
    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (hr == RPC_E_CHANGED_MODE) {
        hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    }
    if (FAILED(hr) && hr != S_FALSE) {
        fprintf(stderr, "[NotifFFI] COM init failed: 0x%08lX\n", (unsigned long)hr);
        return;
    }

    // Create IShellLink for the Start Menu shortcut
    IShellLinkW* psl = NULL;
    hr = CoCreateInstance(kCLSID_ShellLink, NULL, CLSCTX_INPROC_SERVER,
                          kIID_IShellLinkW, (void**)&psl);
    if (FAILED(hr) || !psl) {
        fprintf(stderr, "[NotifFFI] Failed to create ShellLink: 0x%08lX\n", (unsigned long)hr);
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
            _snwprintf(g_toast_shortcut_path, MAX_PATH - 1, L"%ls\\%ls.lnk", startMenu, baseName);
            g_toast_shortcut_path[MAX_PATH - 1] = L'\0';
            ppf->Save(g_toast_shortcut_path, TRUE);
            fprintf(stderr, "[NotifFFI] Toast identity shortcut created for AUMID: Tronbun.%ls\n", baseName);
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

// Pending show parameters (written by FFI thread, read by HWND thread)
static char g_pending_id[256] = {0};
static WCHAR g_pending_title[256] = {0};
static WCHAR g_pending_body[256] = {0};
static DWORD g_pending_flags = NIIF_INFO;
static int g_pending_result = -1;

// ============================================================================
// Window Procedure (runs on background thread)
// ============================================================================

static LRESULT CALLBACK NotificationWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (msg == WM_NOTIFICATION_MESSAGE) {
        UINT event = LOWORD(lParam);

        EnterCriticalSection(&g_cs);
        char id_copy[256] = {0};
        strncpy(id_copy, g_current_notification_id, sizeof(id_copy) - 1);
        notification_ffi_callback_t cb = g_callback;
        LeaveCriticalSection(&g_cs);

        if (cb && id_copy[0] != '\0') {
            if (event == NIN_BALLOONUSERCLICK) {
                cb(id_copy, "click", -1);
            } else if (event == NIN_BALLOONTIMEOUT || event == NIN_BALLOONHIDE) {
                cb(id_copy, "close", -1);
            }
        }
        return 0;
    }

    if (msg == WM_FFI_SHOW) {
        EnterCriticalSection(&g_cs);

        // Copy pending notification ID
        strncpy(g_current_notification_id, g_pending_id, sizeof(g_current_notification_id) - 1);
        g_current_notification_id[sizeof(g_current_notification_id) - 1] = '\0';

        // Set balloon notification fields
        g_nid.uFlags |= NIF_INFO;
        wcsncpy(g_nid.szInfoTitle, g_pending_title, 63);
        g_nid.szInfoTitle[63] = L'\0';
        wcsncpy(g_nid.szInfo, g_pending_body, 255);
        g_nid.szInfo[255] = L'\0';
        g_nid.dwInfoFlags = g_pending_flags;

        // Use the app icon for the balloon popup if available
        if (g_balloon_icon) {
            // Preserve NIIF_NOSOUND if the caller set it
            DWORD silent_flag = g_nid.dwInfoFlags & NIIF_NOSOUND;
            g_nid.dwInfoFlags = NIIF_USER | NIIF_LARGE_ICON | silent_flag;
            g_nid.hBalloonIcon = g_balloon_icon;
        }

        BOOL ok = Shell_NotifyIconW(NIM_MODIFY, &g_nid);
        g_pending_result = ok ? 0 : -1;

        if (!ok) {
            fprintf(stderr, "[NotifFFI] Failed to show balloon notification\n");
        } else {
            fprintf(stderr, "[NotifFFI] Notification posted: %s\n", g_current_notification_id);
        }

        LeaveCriticalSection(&g_cs);
        SetEvent(g_complete_event);
        return 0;
    }

    if (msg == WM_FFI_CLOSE) {
        EnterCriticalSection(&g_cs);

        g_nid.uFlags |= NIF_INFO;
        g_nid.szInfo[0] = L'\0';
        g_nid.szInfoTitle[0] = L'\0';
        Shell_NotifyIconW(NIM_MODIFY, &g_nid);
        g_current_notification_id[0] = '\0';
        g_pending_result = 0;

        LeaveCriticalSection(&g_cs);
        SetEvent(g_complete_event);
        return 0;
    }

    if (msg == WM_FFI_SET_ICON) {
        EnterCriticalSection(&g_cs);
        // Load small icon for the tray area
        HICON new_icon = (HICON)LoadImageW(NULL, g_pending_icon_path, IMAGE_ICON,
            GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON),
            LR_LOADFROMFILE);
        // Load large icon for balloon popups
        HICON new_balloon = (HICON)LoadImageW(NULL, g_pending_icon_path, IMAGE_ICON,
            0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
        if (new_icon || new_balloon) {
            if (new_icon) {
                HICON old_icon = g_nid.hIcon;
                g_nid.hIcon = new_icon;
                Shell_NotifyIconW(NIM_MODIFY, &g_nid);
                if (old_icon && old_icon != LoadIconW(NULL, IDI_APPLICATION)) {
                    DestroyIcon(old_icon);
                }
            }
            if (new_balloon) {
                if (g_balloon_icon) DestroyIcon(g_balloon_icon);
                g_balloon_icon = new_balloon;
            }
            g_pending_result = 0;
            fprintf(stderr, "[NotifFFI] Icon updated\n");
        } else {
            g_pending_result = -1;
            fprintf(stderr, "[NotifFFI] Failed to load icon\n");
        }
        LeaveCriticalSection(&g_cs);
        SetEvent(g_complete_event);
        return 0;
    }

    if (msg == WM_FFI_QUIT) {
        PostQuitMessage(0);
        return 0;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

// ============================================================================
// Background Message Pump Thread
// ============================================================================

static unsigned __stdcall notification_thread_proc(void* arg) {
    (void)arg;

    // Register window class
    WNDCLASSW wc = {};
    wc.lpfnWndProc = NotificationWndProc;
    wc.hInstance = GetModuleHandleW(NULL);
    wc.lpszClassName = L"TronbunNotifFFIWindow";
    RegisterClassW(&wc);

    // Create hidden message-only window
    g_notify_hwnd = CreateWindowW(L"TronbunNotifFFIWindow", L"", 0,
                                   0, 0, 0, 0, HWND_MESSAGE, NULL,
                                   GetModuleHandleW(NULL), NULL);

    if (!g_notify_hwnd) {
        fprintf(stderr, "[NotifFFI] Failed to create message window\n");
        SetEvent(g_init_event);
        return 1;
    }

    // Initialize notification icon data
    memset(&g_nid, 0, sizeof(g_nid));
    g_nid.cbSize = sizeof(NOTIFYICONDATAW);
    g_nid.hWnd = g_notify_hwnd;
    g_nid.uID = NOTIFICATION_ICON_ID;
    g_nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    g_nid.uCallbackMessage = WM_NOTIFICATION_MESSAGE;

    // Use custom icon if set before init, otherwise fall back to default
    if (g_icon_path[0] != '\0') {
        WCHAR icon_path_w[MAX_PATH];
        MultiByteToWideChar(CP_UTF8, 0, g_icon_path, -1, icon_path_w, MAX_PATH);
        // Small icon for the tray area
        HICON custom_icon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON,
            GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON),
            LR_LOADFROMFILE);
        g_nid.hIcon = custom_icon ? custom_icon : LoadIconW(NULL, IDI_APPLICATION);
        // Large icon for balloon popups
        g_balloon_icon = (HICON)LoadImageW(NULL, icon_path_w, IMAGE_ICON,
            0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
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
    if (g_icon_path[0] != '\0') {
        setup_toast_identity(g_icon_path);
    }

    if (!Shell_NotifyIconW(NIM_ADD, &g_nid)) {
        fprintf(stderr, "[NotifFFI] Failed to create notification icon\n");
        DestroyWindow(g_notify_hwnd);
        g_notify_hwnd = NULL;
        SetEvent(g_init_event);
        return 1;
    }

    // Set version for modern balloon behavior
    g_nid.uVersion = NOTIFYICON_VERSION_4;
    Shell_NotifyIconW(NIM_SETVERSION, &g_nid);

    fprintf(stderr, "[NotifFFI] Initialized. Message pump thread running.\n");

    // Signal that init is complete
    SetEvent(g_init_event);

    // Message pump loop
    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    // Cleanup tray icon and toast identity
    Shell_NotifyIconW(NIM_DELETE, &g_nid);
    cleanup_toast_identity();
    DestroyWindow(g_notify_hwnd);
    g_notify_hwnd = NULL;

    return 0;
}

// ============================================================================
// Exported Functions
// ============================================================================

extern "C" {

__declspec(dllexport)
int notification_ffi_init(notification_ffi_callback_t callback) {
    if (g_initialized) {
        EnterCriticalSection(&g_cs);
        g_callback = callback;
        LeaveCriticalSection(&g_cs);
        return 0;
    }

    InitializeCriticalSection(&g_cs);
    g_callback = callback;

    g_init_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    g_complete_event = CreateEventW(NULL, FALSE, FALSE, NULL);

    if (!g_init_event || !g_complete_event) {
        fprintf(stderr, "[NotifFFI] Failed to create events\n");
        return -1;
    }

    // Start background thread with message pump
    g_thread = (HANDLE)_beginthreadex(NULL, 0, notification_thread_proc, NULL, 0, NULL);
    if (!g_thread) {
        fprintf(stderr, "[NotifFFI] Failed to create message pump thread\n");
        return -1;
    }

    // Wait for the background thread to finish initialization
    WaitForSingleObject(g_init_event, 5000);

    if (!g_notify_hwnd) {
        fprintf(stderr, "[NotifFFI] Background thread failed to create HWND\n");
        return -1;
    }

    g_initialized = 1;
    return 0;
}

__declspec(dllexport)
int notification_ffi_request_permission(void) {
    // Balloon notifications are always available on Windows
    return 0;
}

__declspec(dllexport)
int notification_ffi_show(const char* id, const char* title, const char* body,
                          int silent, int urgency, const char* actions_json) {
    (void)actions_json; // Not supported by balloon tips

    if (!g_initialized) notification_ffi_init(NULL);
    if (!id || !title || !g_notify_hwnd) return -1;

    EnterCriticalSection(&g_cs);

    // Store pending notification parameters
    strncpy(g_pending_id, id, sizeof(g_pending_id) - 1);
    g_pending_id[sizeof(g_pending_id) - 1] = '\0';

    MultiByteToWideChar(CP_UTF8, 0, title, -1, g_pending_title, 256);

    if (body && body[0] != '\0') {
        MultiByteToWideChar(CP_UTF8, 0, body, -1, g_pending_body, 256);
    } else {
        g_pending_body[0] = L'\0';
    }

    // Set urgency/style flags
    switch (urgency) {
        case 2:  g_pending_flags = NIIF_WARNING; break;
        default: g_pending_flags = NIIF_INFO;    break;
    }

    if (silent) {
        g_pending_flags |= NIIF_NOSOUND;
    }

    g_pending_result = -1;
    LeaveCriticalSection(&g_cs);

    // Post show message to the HWND thread and wait for completion
    PostMessageW(g_notify_hwnd, WM_FFI_SHOW, 0, 0);
    WaitForSingleObject(g_complete_event, 5000);

    return g_pending_result;
}

__declspec(dllexport)
int notification_ffi_close(const char* id) {
    (void)id;
    if (!g_initialized || !g_notify_hwnd) return -1;

    g_pending_result = -1;
    PostMessageW(g_notify_hwnd, WM_FFI_CLOSE, 0, 0);
    WaitForSingleObject(g_complete_event, 5000);

    return g_pending_result;
}

__declspec(dllexport)
int notification_ffi_check_permission(void) {
    // Balloon notifications are always available on Windows
    return 1;
}

__declspec(dllexport)
int notification_ffi_set_icon(const char* icon_path) {
    if (!icon_path || icon_path[0] == '\0') return -1;

    // Store for use during init if not yet initialized
    strncpy(g_icon_path, icon_path, MAX_PATH - 1);
    g_icon_path[MAX_PATH - 1] = '\0';

    // If already initialized, update live via the HWND thread
    if (g_initialized && g_notify_hwnd) {
        EnterCriticalSection(&g_cs);
        MultiByteToWideChar(CP_UTF8, 0, icon_path, -1, g_pending_icon_path, MAX_PATH);
        g_pending_result = -1;
        LeaveCriticalSection(&g_cs);

        PostMessageW(g_notify_hwnd, WM_FFI_SET_ICON, 0, 0);
        WaitForSingleObject(g_complete_event, 5000);
        return g_pending_result;
    }

    return 0;
}

__declspec(dllexport)
void notification_ffi_cleanup(void) {
    if (!g_initialized) return;

    if (g_notify_hwnd) {
        PostMessageW(g_notify_hwnd, WM_FFI_QUIT, 0, 0);
    }

    if (g_thread) {
        WaitForSingleObject(g_thread, 3000);
        CloseHandle(g_thread);
        g_thread = NULL;
    }

    if (g_init_event) {
        CloseHandle(g_init_event);
        g_init_event = NULL;
    }
    if (g_complete_event) {
        CloseHandle(g_complete_event);
        g_complete_event = NULL;
    }

    // Ensure toast identity shortcut is cleaned up even if thread didn't exit cleanly
    cleanup_toast_identity();

    DeleteCriticalSection(&g_cs);
    g_callback = NULL;
    g_initialized = 0;
    g_current_notification_id[0] = '\0';
}

} // extern "C"

#endif // _WIN32
