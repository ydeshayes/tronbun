/**
 * Windows screenshot implementation using WebView2
 */

#ifdef _WIN32

#include "platform_screenshot.h"
#include <windows.h>
#include <webview2.h>
#include <wrl.h>
#include <shlwapi.h>
#include <string>
#include <vector>

#pragma comment(lib, "shlwapi.lib")

using namespace Microsoft::WRL;

// Base64 encoding table
static const char base64_chars[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Base64 encode function
static std::string base64_encode(const unsigned char* data, size_t length) {
    std::string result;
    result.reserve(((length + 2) / 3) * 4);

    for (size_t i = 0; i < length; i += 3) {
        unsigned int n = data[i] << 16;
        if (i + 1 < length) n |= data[i + 1] << 8;
        if (i + 2 < length) n |= data[i + 2];

        result.push_back(base64_chars[(n >> 18) & 0x3F]);
        result.push_back(base64_chars[(n >> 12) & 0x3F]);
        result.push_back((i + 1 < length) ? base64_chars[(n >> 6) & 0x3F] : '=');
        result.push_back((i + 2 < length) ? base64_chars[n & 0x3F] : '=');
    }

    return result;
}

// Context for screenshot callback
struct ScreenshotContext {
    screenshot_callback_t callback;
    void* user_data;
};

// Helper to get ICoreWebView2 from window (WebView2 stores it in window user data)
static ICoreWebView2* get_webview2_from_hwnd(HWND hwnd) {
    // The webview library stores controller in GWLP_USERDATA
    // We need to navigate through the window hierarchy to find the WebView2 widget
    HWND child = FindWindowExW(hwnd, NULL, L"Chrome_WidgetWin_0", NULL);
    if (!child) {
        child = FindWindowExW(hwnd, NULL, L"Chrome_WidgetWin_1", NULL);
    }

    // For now, return NULL - we'll need to pass the webview2 handle directly
    return nullptr;
}

extern "C" void platform_take_screenshot(void* webview_hwnd, screenshot_callback_t callback, void* user_data) {
    if (!callback) return;

    // Note: For Windows, we need the ICoreWebView2 interface directly
    // The webview library doesn't expose a clean way to get this from HWND
    // This implementation assumes the caller passes the webview handle that can be cast

    // For now, we'll document that this needs the WebView2 controller passed
    // A proper implementation would require changes to how webview stores its handles

    OutputDebugStringA("[Screenshot] Windows screenshot not yet fully implemented\n");
    callback(NULL, 0, user_data);
}

// This version takes the ICoreWebView2 directly
extern "C" void platform_take_screenshot_webview2(ICoreWebView2* webview, screenshot_callback_t callback, void* user_data) {
    if (!callback || !webview) {
        if (callback) callback(NULL, 0, user_data);
        return;
    }

    // Create a stream to capture the image
    IStream* stream = nullptr;
    HRESULT hr = CreateStreamOnHGlobal(NULL, TRUE, &stream);
    if (FAILED(hr) || !stream) {
        OutputDebugStringA("[Screenshot] Failed to create stream\n");
        callback(NULL, 0, user_data);
        return;
    }

    // Create context for the async callback
    ScreenshotContext* ctx = new ScreenshotContext{ callback, user_data };

    // Capture the preview as PNG
    hr = webview->CapturePreview(
        COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
        stream,
        Callback<ICoreWebView2CapturePreviewCompletedHandler>(
            [stream, ctx](HRESULT errorCode) -> HRESULT {
                if (FAILED(errorCode)) {
                    OutputDebugStringA("[Screenshot] CapturePreview failed\n");
                    ctx->callback(NULL, 0, ctx->user_data);
                    stream->Release();
                    delete ctx;
                    return S_OK;
                }

                // Get the stream size
                STATSTG stat;
                if (FAILED(stream->Stat(&stat, STATFLAG_NONAME))) {
                    ctx->callback(NULL, 0, ctx->user_data);
                    stream->Release();
                    delete ctx;
                    return S_OK;
                }

                // Read the stream data
                LARGE_INTEGER zero = {};
                stream->Seek(zero, STREAM_SEEK_SET, NULL);

                std::vector<unsigned char> buffer(stat.cbSize.LowPart);
                ULONG bytesRead = 0;
                if (FAILED(stream->Read(buffer.data(), stat.cbSize.LowPart, &bytesRead))) {
                    ctx->callback(NULL, 0, ctx->user_data);
                    stream->Release();
                    delete ctx;
                    return S_OK;
                }

                // Encode as base64
                std::string base64 = base64_encode(buffer.data(), bytesRead);

                // Call the callback
                ctx->callback(base64.c_str(), base64.length(), ctx->user_data);

                stream->Release();
                delete ctx;
                return S_OK;
            }
        ).Get()
    );

    if (FAILED(hr)) {
        OutputDebugStringA("[Screenshot] Failed to initiate CapturePreview\n");
        callback(NULL, 0, user_data);
        stream->Release();
        delete ctx;
    }
}

extern "C" void platform_child_take_screenshot(void* child_view, screenshot_callback_t callback, void* user_data) {
    // Similar implementation for child views
    // Would need the ICoreWebView2 from the child view's controller
    if (callback) callback(NULL, 0, user_data);
}

#endif // _WIN32
