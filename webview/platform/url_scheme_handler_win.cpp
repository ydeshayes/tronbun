/**
 * Custom URL Scheme Handler Implementation for Windows
 *
 * Implements WebView2's WebResourceRequested event handler to intercept
 * tronbun:// requests and serve content from the virtual file system.
 */

#ifdef _WIN32

#include "url_scheme_handler_win.h"
#include "virtual_fs.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <roapi.h> 
#include <winstring.h>
#include <objbase.h>
#include <shlwapi.h>
#include "webview2_utils.h"
#include <string>
#include <cstring>

// Manual WebView2 definitions removed as they are now provided by webview2.h via webview2_utils.h

/**
 * Handler class that implements ICoreWebView2WebResourceRequestedEventHandler
 */
class TronbunWebResourceHandler : public ICoreWebView2WebResourceRequestedEventHandler {
public:
    TronbunWebResourceHandler(ICoreWebView2Environment* env) : m_env(env), m_refCount(1) {
        if (m_env) {
            m_env->AddRef();
        }
    }

    virtual ~TronbunWebResourceHandler() {
        if (m_env) {
            m_env->Release();
        }
    }

    // IUnknown methods
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;

        if (riid == IID_IUnknown || riid == IID_ICoreWebView2WebResourceRequestedEventHandler) {
            *ppv = static_cast<ICoreWebView2WebResourceRequestedEventHandler*>(this);
            AddRef();
            return S_OK;
        }

        *ppv = nullptr;
        return E_NOINTERFACE;
    }

    ULONG STDMETHODCALLTYPE AddRef() override {
        return InterlockedIncrement(&m_refCount);
    }

    ULONG STDMETHODCALLTYPE Release() override {
        ULONG count = InterlockedDecrement(&m_refCount);
        if (count == 0) {
            delete this;
        }
        return count;
    }

    // ICoreWebView2WebResourceRequestedEventHandler method
    HRESULT STDMETHODCALLTYPE Invoke(
        ICoreWebView2* sender,
        ICoreWebView2WebResourceRequestedEventArgs* args) override {

        fprintf(stderr, "[TronbunScheme] WebResourceRequested handler invoked\n");

        ICoreWebView2WebResourceRequest* request = nullptr;
        HRESULT hr = args->get_Request(&request);
        if (FAILED(hr) || !request) {
            fprintf(stderr, "[TronbunScheme] Failed to get request\n");
            return hr;
        }

        LPWSTR uriWide = nullptr;
        hr = request->get_Uri(&uriWide);
        request->Release();

        if (FAILED(hr) || !uriWide) {
            fprintf(stderr, "[TronbunScheme] Failed to get URI\n");
            return hr;
        }

        // Convert wide string to UTF-8
        int len = WideCharToMultiByte(CP_UTF8, 0, uriWide, -1, nullptr, 0, nullptr, nullptr);
        std::string uri(len - 1, '\0');
        WideCharToMultiByte(CP_UTF8, 0, uriWide, -1, &uri[0], len, nullptr, nullptr);
        CoTaskMemFree(uriWide);

        fprintf(stderr, "[TronbunScheme] Request URI: %s\n", uri.c_str());

        // Check if this is a tronbun URL (either tronbun:// or http://tronbun.localhost/)
        const char* prefix1 = "tronbun://app/";
        const char* prefix1_alt = "tronbun://app";
        const char* prefix2 = "http://tronbun.localhost/";
        const char* prefix2_alt = "http://tronbun.localhost";

        std::string path;
        if (uri.find(prefix1) == 0) {
            path = uri.substr(strlen(prefix1));
        } else if (uri == prefix1_alt || uri == "tronbun://app") {
            path = "";
        } else if (uri.find("tronbun://") == 0) {
            // Handle other tronbun:// URLs
            path = uri.substr(strlen("tronbun://"));
            // Remove "app" prefix if present
            if (path.find("app/") == 0) {
                path = path.substr(4);
            } else if (path == "app") {
                path = "";
            }
        } else if (uri.find(prefix2) == 0) {
            path = uri.substr(strlen(prefix2));
        } else if (uri == prefix2_alt) {
            path = "";
        } else {
            // Not a tronbun URL, let it pass through
            return S_OK;
        }

        // Handle empty path as index.html
        if (path.empty()) {
            path = "index.html";
        }

        fprintf(stderr, "[TronbunScheme] Looking up path: %s\n", path.c_str());

        // Look up file in virtual file system
        const char* content = nullptr;
        size_t contentLength = 0;

        if (virtual_fs_get_file(path.c_str(), &content, &contentLength) == 0) {
            fprintf(stderr, "[TronbunScheme] Found file: %s (%zu bytes)\n", path.c_str(), contentLength);
            // File found - create response
            const char* mimeType = virtual_fs_get_mime_type(path.c_str());

            // Create IStream from content
            IStream* stream = SHCreateMemStream(
                reinterpret_cast<const BYTE*>(content),
                static_cast<UINT>(contentLength));

            if (stream) {
                // Convert MIME type to wide string
                int mimeLen = MultiByteToWideChar(CP_UTF8, 0, mimeType, -1, nullptr, 0);
                std::wstring mimeTypeWide(mimeLen - 1, L'\0');
                MultiByteToWideChar(CP_UTF8, 0, mimeType, -1, &mimeTypeWide[0], mimeLen);

                // Create response
                ICoreWebView2WebResourceResponse* response = nullptr;
                hr = m_env->CreateWebResourceResponse(
                    stream,
                    200,  // HTTP status code
                    L"OK",
                    (L"Content-Type: " + mimeTypeWide + L"\r\nCache-Control: no-cache").c_str(),
                    &response);

                stream->Release();

                if (SUCCEEDED(hr) && response) {
                    args->put_Response(response);
                    response->Release();

                    OutputDebugStringA("[TronbunScheme] Served: ");
                    OutputDebugStringA(path.c_str());
                    OutputDebugStringA("\n");
                }
            }
        } else {
            // File not found - return 404
            std::string errorBody = "File not found: " + path;
            IStream* stream = SHCreateMemStream(
                reinterpret_cast<const BYTE*>(errorBody.c_str()),
                static_cast<UINT>(errorBody.length()));

            if (stream) {
                ICoreWebView2WebResourceResponse* response = nullptr;
                hr = m_env->CreateWebResourceResponse(
                    stream,
                    404,
                    L"Not Found",
                    L"Content-Type: text/plain; charset=utf-8",
                    &response);

                stream->Release();

                if (SUCCEEDED(hr) && response) {
                    args->put_Response(response);
                    response->Release();

                    OutputDebugStringA("[TronbunScheme] Not found: ");
                    OutputDebugStringA(path.c_str());
                    OutputDebugStringA("\n");
                }
            }
        }

        return S_OK;
    }

private:
    ICoreWebView2Environment* m_env;
    LONG m_refCount;
};

// Global handler instance (we need to keep it alive)
static TronbunWebResourceHandler* g_handler = nullptr;

extern "C" int tronbun_register_url_scheme_win(void* webviewPtr, void* environmentPtr) {
    fprintf(stderr, "[TronbunScheme] Registering URL scheme handler...\n");
    
    ICoreWebView2* webview = static_cast<ICoreWebView2*>(webviewPtr);
    ICoreWebView2Environment* environment = static_cast<ICoreWebView2Environment*>(environmentPtr);

    if (!webview || !environment) {
        fprintf(stderr, "[TronbunScheme] Error: webview or environment is null\n");
        return -1;
    }

    // Initialize virtual file system
    virtual_fs_init();
    fprintf(stderr, "[TronbunScheme] Virtual FS initialized\n");

    // Add filter for tronbun:// URLs (for legacy support)
    HRESULT hr = webview->AddWebResourceRequestedFilter(
        L"tronbun://*",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);

    if (FAILED(hr)) {
        fprintf(stderr, "[TronbunScheme] Warning: Failed to add filter for tronbun://* (hr=0x%lx)\n", hr);
        // Continue anyway - the http filter is more important
    } else {
        fprintf(stderr, "[TronbunScheme] Added filter for tronbun://*\n");
    }

    // Add filter for http://tronbun.localhost/* (this works for navigation)
    hr = webview->AddWebResourceRequestedFilter(
        L"http://tronbun.localhost/*",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);

    if (FAILED(hr)) {
        fprintf(stderr, "[TronbunScheme] Error: Failed to add filter for http://tronbun.localhost/* (hr=0x%lx)\n", hr);
        return -2;
    }
    fprintf(stderr, "[TronbunScheme] Added filter for http://tronbun.localhost/*\n");

    // Create and register the handler
    g_handler = new TronbunWebResourceHandler(environment);

    EventRegistrationToken token;
    hr = webview->add_WebResourceRequested(g_handler, &token);

    if (FAILED(hr)) {
        fprintf(stderr, "[TronbunScheme] Error: Failed to register WebResourceRequested handler (hr=0x%lx)\n", hr);
        g_handler->Release();
        g_handler = nullptr;
        return -3;
    }

    fprintf(stderr, "[TronbunScheme] Registered tronbun:// URL scheme handler for Windows\n");
    return 0;
}

#endif // _WIN32
