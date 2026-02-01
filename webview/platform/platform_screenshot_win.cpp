/**
 * Windows screenshot implementation using WebView2
 */

#ifdef _WIN32

#include "platform_screenshot.h"
#include "platform_cdp.h"
#include <windows.h>
#include <webview2.h>
#include <shlwapi.h>
#include <string>
#include <vector>

#include "webview2_utils.h"

#pragma comment(lib, "shlwapi.lib")

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

// Forward declaration (defined below)
extern "C" void platform_take_screenshot_webview2(ICoreWebView2* webview, screenshot_callback_t callback, void* user_data);

extern "C" void platform_take_screenshot(void* webview_window, screenshot_callback_t callback, void* user_data) {
    if (!callback) return;

    // Get ICoreWebView2 from the same window->webview map used by CDP (set when WebView2 is created).
    void* webview2 = platform_cdp_get_webview2(webview_window);
    if (webview2) {
        platform_take_screenshot_webview2(static_cast<ICoreWebView2*>(webview2), callback, user_data);
    } else {
        OutputDebugStringA("[Screenshot] No WebView2 for window (capture not ready or window not initialized)\n");
        callback(NULL, 0, user_data);
    }
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
        new CapturePreviewHandler(
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
        )
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
