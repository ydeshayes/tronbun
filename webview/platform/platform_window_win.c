#ifdef _WIN32
#include <windows.h>
#include <dwmapi.h>
#include <stdio.h>
#include "platform_window.h"

// ============================================================================
// Window Resize Callback Support
// ============================================================================

// Property names for storing callback info on window
static const char* PROP_RESIZE_CALLBACK = "TronbunResizeCallback";
static const char* PROP_RESIZE_USERDATA = "TronbunResizeUserData";
static const char* PROP_ORIGINAL_WNDPROC = "TronbunOriginalWndProc";

// Custom window procedure to intercept resize messages
static LRESULT CALLBACK ResizeWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    // Get the original window procedure
    WNDPROC originalWndProc = (WNDPROC)GetPropA(hwnd, PROP_ORIGINAL_WNDPROC);

    if (msg == WM_SIZE && wParam != SIZE_MINIMIZED) {
        // Get the callback and user data
        platform_window_resize_callback_t callback =
            (platform_window_resize_callback_t)GetPropA(hwnd, PROP_RESIZE_CALLBACK);
        void* userData = GetPropA(hwnd, PROP_RESIZE_USERDATA);

        if (callback) {
            // LOWORD/HIWORD of lParam contain client area dimensions
            int width = LOWORD(lParam);
            int height = HIWORD(lParam);
            callback(width, height, userData);
        }
    }

    // Call the original window procedure
    if (originalWndProc) {
        return CallWindowProc(originalWndProc, hwnd, msg, wParam, lParam);
    }
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

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

void platform_window_register_resize_callback(void *native_window,
                                              platform_window_resize_callback_t callback,
                                              void *user_data) {
    HWND hwnd = (HWND)native_window;
    if (hwnd && callback) {
        // Check if we've already subclassed this window
        WNDPROC currentProc = (WNDPROC)GetWindowLongPtr(hwnd, GWLP_WNDPROC);
        if (currentProc != ResizeWndProc) {
            // Store the original window procedure
            SetPropA(hwnd, PROP_ORIGINAL_WNDPROC, (HANDLE)currentProc);

            // Subclass the window
            SetWindowLongPtr(hwnd, GWLP_WNDPROC, (LONG_PTR)ResizeWndProc);
        }

        // Store the callback and user data
        SetPropA(hwnd, PROP_RESIZE_CALLBACK, (HANDLE)callback);
        SetPropA(hwnd, PROP_RESIZE_USERDATA, (HANDLE)user_data);

        fprintf(stderr, "Registered resize callback for window %p\n", native_window);
    }
}

void platform_window_get_size(void *native_window, int *width, int *height) {
    HWND hwnd = (HWND)native_window;
    if (hwnd) {
        RECT rect;
        if (GetClientRect(hwnd, &rect)) {
            if (width) *width = rect.right - rect.left;
            if (height) *height = rect.bottom - rect.top;
        } else {
            if (width) *width = 0;
            if (height) *height = 0;
        }
    } else {
        if (width) *width = 0;
        if (height) *height = 0;
    }
}

#endif // _WIN32