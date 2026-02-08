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
    g_nid.hIcon = LoadIconW(NULL, IDI_APPLICATION);
    wcscpy_s(g_nid.szTip, 128, L"Tronbun");

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

    // Cleanup tray icon
    Shell_NotifyIconW(NIM_DELETE, &g_nid);
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

    DeleteCriticalSection(&g_cs);
    g_callback = NULL;
    g_initialized = 0;
    g_current_notification_id[0] = '\0';
}

} // extern "C"

#endif // _WIN32
