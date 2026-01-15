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
#include <objbase.h>
#include <shlwapi.h>
#include <string>
#include <cstring>

// Forward declarations of WebView2 interfaces we need
// These are from the WebView2 SDK but declared here to avoid dependency issues

typedef interface ICoreWebView2 ICoreWebView2;
typedef interface ICoreWebView2Environment ICoreWebView2Environment;
typedef interface ICoreWebView2WebResourceRequest ICoreWebView2WebResourceRequest;
typedef interface ICoreWebView2WebResourceResponse ICoreWebView2WebResourceResponse;
typedef interface ICoreWebView2WebResourceRequestedEventArgs ICoreWebView2WebResourceRequestedEventArgs;
typedef interface ICoreWebView2WebResourceRequestedEventHandler ICoreWebView2WebResourceRequestedEventHandler;

typedef enum COREWEBVIEW2_WEB_RESOURCE_CONTEXT {
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL = 0,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT = 1,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET = 2,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE = 3,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA = 4,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT = 5,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT = 6,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST = 7,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH = 8,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_TEXT_TRACK = 9,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_EVENT_SOURCE = 10,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET = 11,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MANIFEST = 12,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SIGNED_EXCHANGE = 13,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_PING = 14,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_CSP_VIOLATION_REPORT = 15,
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_OTHER = 16
} COREWEBVIEW2_WEB_RESOURCE_CONTEXT;

// GUIDs
static const IID IID_ICoreWebView2WebResourceRequestedEventHandler = {
    0xAB00B74C, 0x15F1, 0x4646, {0x80, 0xE6, 0x85, 0x28, 0xE2, 0xCB, 0xA8, 0xEC}
};

// ICoreWebView2WebResourceRequest interface
MIDL_INTERFACE("97055cd4-512c-4e31-9de3-a04e4dee3fd6")
ICoreWebView2WebResourceRequest : public IUnknown {
public:
    virtual HRESULT STDMETHODCALLTYPE get_Uri(LPWSTR* uri) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Uri(LPCWSTR uri) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Method(LPWSTR* method) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Method(LPCWSTR method) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Content(IStream** content) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Content(IStream* content) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Headers(IUnknown** headers) = 0;
};

// ICoreWebView2WebResourceResponse interface
MIDL_INTERFACE("aafcc94f-fa27-48fd-97df-830ef75aaec9")
ICoreWebView2WebResourceResponse : public IUnknown {
public:
    virtual HRESULT STDMETHODCALLTYPE get_Content(IStream** content) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Content(IStream* content) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Headers(IUnknown** headers) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_StatusCode(int* statusCode) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_StatusCode(int statusCode) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_ReasonPhrase(LPWSTR* reasonPhrase) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_ReasonPhrase(LPCWSTR reasonPhrase) = 0;
};

// ICoreWebView2WebResourceRequestedEventArgs interface
MIDL_INTERFACE("453e667f-12c7-49d4-be6d-ddbe7956f57a")
ICoreWebView2WebResourceRequestedEventArgs : public IUnknown {
public:
    virtual HRESULT STDMETHODCALLTYPE get_Request(ICoreWebView2WebResourceRequest** request) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Response(ICoreWebView2WebResourceResponse** response) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Response(ICoreWebView2WebResourceResponse* response) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetDeferral(IUnknown** deferral) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_ResourceContext(COREWEBVIEW2_WEB_RESOURCE_CONTEXT* context) = 0;
};

// ICoreWebView2WebResourceRequestedEventHandler interface
MIDL_INTERFACE("ab00b74c-15f1-4646-80e6-8528e2cba8ec")
ICoreWebView2WebResourceRequestedEventHandler : public IUnknown {
public:
    virtual HRESULT STDMETHODCALLTYPE Invoke(
        ICoreWebView2* sender,
        ICoreWebView2WebResourceRequestedEventArgs* args) = 0;
};

// Partial ICoreWebView2 interface - only methods we need
MIDL_INTERFACE("76eceacb-0462-4d94-ac83-423a6793775e")
ICoreWebView2 : public IUnknown {
public:
    // Placeholder methods to get correct vtable offsets
    virtual HRESULT STDMETHODCALLTYPE get_Settings(IUnknown** settings) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Source(LPWSTR* uri) = 0;
    virtual HRESULT STDMETHODCALLTYPE Navigate(LPCWSTR uri) = 0;
    virtual HRESULT STDMETHODCALLTYPE NavigateToString(LPCWSTR htmlContent) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_NavigationStarting(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_NavigationStarting(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_ContentLoading(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_ContentLoading(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_SourceChanged(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_SourceChanged(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_HistoryChanged(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_HistoryChanged(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_NavigationCompleted(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_NavigationCompleted(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_FrameNavigationStarting(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_FrameNavigationStarting(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_FrameNavigationCompleted(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_FrameNavigationCompleted(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_ScriptDialogOpening(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_ScriptDialogOpening(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_PermissionRequested(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_PermissionRequested(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_ProcessFailed(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_ProcessFailed(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE AddScriptToExecuteOnDocumentCreated(LPCWSTR javaScript, IUnknown* handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE RemoveScriptToExecuteOnDocumentCreated(LPCWSTR id) = 0;
    virtual HRESULT STDMETHODCALLTYPE ExecuteScript(LPCWSTR javaScript, IUnknown* handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE CapturePreview(int imageFormat, IStream* imageStream, IUnknown* handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE Reload() = 0;
    virtual HRESULT STDMETHODCALLTYPE PostWebMessageAsJson(LPCWSTR webMessageAsJson) = 0;
    virtual HRESULT STDMETHODCALLTYPE PostWebMessageAsString(LPCWSTR webMessageAsString) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_WebMessageReceived(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_WebMessageReceived(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE CallDevToolsProtocolMethod(LPCWSTR methodName, LPCWSTR parametersAsJson, IUnknown* handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_BrowserProcessId(UINT32* value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_CanGoBack(BOOL* canGoBack) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_CanGoForward(BOOL* canGoForward) = 0;
    virtual HRESULT STDMETHODCALLTYPE GoBack() = 0;
    virtual HRESULT STDMETHODCALLTYPE GoForward() = 0;
    virtual HRESULT STDMETHODCALLTYPE GetDevToolsProtocolEventReceiver(LPCWSTR eventName, IUnknown** receiver) = 0;
    virtual HRESULT STDMETHODCALLTYPE Stop() = 0;
    virtual HRESULT STDMETHODCALLTYPE add_NewWindowRequested(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_NewWindowRequested(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_DocumentTitleChanged(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_DocumentTitleChanged(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_DocumentTitle(LPWSTR* title) = 0;
    virtual HRESULT STDMETHODCALLTYPE AddHostObjectToScript(LPCWSTR name, VARIANT* object) = 0;
    virtual HRESULT STDMETHODCALLTYPE RemoveHostObjectFromScript(LPCWSTR name) = 0;
    virtual HRESULT STDMETHODCALLTYPE OpenDevToolsWindow() = 0;
    virtual HRESULT STDMETHODCALLTYPE add_ContainsFullScreenElementChanged(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_ContainsFullScreenElementChanged(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_ContainsFullScreenElement(BOOL* containsFullScreenElement) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_WebResourceRequested(ICoreWebView2WebResourceRequestedEventHandler* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_WebResourceRequested(EventRegistrationToken token) = 0;
    virtual HRESULT STDMETHODCALLTYPE AddWebResourceRequestedFilter(LPCWSTR uri, COREWEBVIEW2_WEB_RESOURCE_CONTEXT resourceContext) = 0;
    virtual HRESULT STDMETHODCALLTYPE RemoveWebResourceRequestedFilter(LPCWSTR uri, COREWEBVIEW2_WEB_RESOURCE_CONTEXT resourceContext) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_WindowCloseRequested(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_WindowCloseRequested(EventRegistrationToken token) = 0;
};

// Partial ICoreWebView2Environment interface - only methods we need
MIDL_INTERFACE("b96d755e-0319-4e92-a296-23436f46a1fc")
ICoreWebView2Environment : public IUnknown {
public:
    virtual HRESULT STDMETHODCALLTYPE CreateCoreWebView2Controller(HWND parentWindow, IUnknown* handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE CreateWebResourceResponse(
        IStream* content,
        int statusCode,
        LPCWSTR reasonPhrase,
        LPCWSTR headers,
        ICoreWebView2WebResourceResponse** response) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_BrowserVersionString(LPWSTR* versionInfo) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_NewBrowserVersionAvailable(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_NewBrowserVersionAvailable(EventRegistrationToken token) = 0;
};

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

        ICoreWebView2WebResourceRequest* request = nullptr;
        HRESULT hr = args->get_Request(&request);
        if (FAILED(hr) || !request) {
            return hr;
        }

        LPWSTR uriWide = nullptr;
        hr = request->get_Uri(&uriWide);
        request->Release();

        if (FAILED(hr) || !uriWide) {
            return hr;
        }

        // Convert wide string to UTF-8
        int len = WideCharToMultiByte(CP_UTF8, 0, uriWide, -1, nullptr, 0, nullptr, nullptr);
        std::string uri(len - 1, '\0');
        WideCharToMultiByte(CP_UTF8, 0, uriWide, -1, &uri[0], len, nullptr, nullptr);
        CoTaskMemFree(uriWide);

        // Check if this is a tronbun:// URL
        const char* prefix = "tronbun://app/";
        const char* prefix_alt = "tronbun://app";

        std::string path;
        if (uri.find(prefix) == 0) {
            path = uri.substr(strlen(prefix));
        } else if (uri == prefix_alt || uri == "tronbun://app") {
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
        } else {
            // Not a tronbun URL, let it pass through
            return S_OK;
        }

        // Handle empty path as index.html
        if (path.empty()) {
            path = "index.html";
        }

        // Look up file in virtual file system
        const char* content = nullptr;
        size_t contentLength = 0;

        if (virtual_fs_get_file(path.c_str(), &content, &contentLength) == 0) {
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
    ICoreWebView2* webview = static_cast<ICoreWebView2*>(webviewPtr);
    ICoreWebView2Environment* environment = static_cast<ICoreWebView2Environment*>(environmentPtr);

    if (!webview || !environment) {
        OutputDebugStringA("[TronbunScheme] Error: webview or environment is null\n");
        return -1;
    }

    // Initialize virtual file system
    virtual_fs_init();

    // Add filter for tronbun:// URLs
    HRESULT hr = webview->AddWebResourceRequestedFilter(
        L"tronbun://*",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);

    if (FAILED(hr)) {
        OutputDebugStringA("[TronbunScheme] Error: Failed to add WebResourceRequested filter\n");
        return -2;
    }

    // Create and register the handler
    g_handler = new TronbunWebResourceHandler(environment);

    EventRegistrationToken token;
    hr = webview->add_WebResourceRequested(g_handler, &token);

    if (FAILED(hr)) {
        OutputDebugStringA("[TronbunScheme] Error: Failed to register WebResourceRequested handler\n");
        g_handler->Release();
        g_handler = nullptr;
        return -3;
    }

    OutputDebugStringA("[TronbunScheme] Registered tronbun:// URL scheme handler for Windows\n");
    return 0;
}

#endif // _WIN32
