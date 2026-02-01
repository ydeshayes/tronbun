/**
 * Platform Child View Implementation for Windows
 *
 * Creates embedded WebView2 instances within a parent HWND.
 * Each child view is wrapped in a child HWND container for positioning.
 */

#ifdef _WIN32

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <shlwapi.h>
#include <shlobj.h>
#include <stdio.h>
#include <string.h>
#include <wrl.h>
#include <WebView2.h>

#include <atomic>

#include "platform_child_view.h"
#include <webview/detail/platform/windows/webview2/loader.hh>
#include "common/ipc_common.h"
#include "cJSON.h"

using namespace Microsoft::WRL;

// Helper GUIDs for ChildWebView2ComHandler are defined in webview2.h
// static const IID IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler = ...;
// static const IID IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler = ...;

// Window class name for child view containers
static const wchar_t* CHILD_VIEW_CLASS = L"TronbunChildView";
static bool g_child_class_registered = false;

/**
 * Container structure for child view data
 */
typedef struct {
    HWND hwnd;                              // Child window handle
    ComPtr<ICoreWebView2Controller> controller;
    ComPtr<ICoreWebView2> webview;
    ComPtr<ICoreWebView2Environment> environment;
    char view_id[256];                      // View ID for IPC routing
    int ready;                              // 1 when WebView2 is ready
    int debug;                              // Debug mode flag
} child_view_data_t;

/**
 * Window procedure for child view windows
 */
static LRESULT CALLBACK ChildViewWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    child_view_data_t* data = (child_view_data_t*)GetWindowLongPtr(hwnd, GWLP_USERDATA);

    switch (msg) {
        case WM_SIZE:
            if (data && data->controller) {
                RECT bounds;
                GetClientRect(hwnd, &bounds);
                data->controller->put_Bounds(bounds);
            }
            break;

        case WM_DESTROY:
            if (data && data->controller) {
                data->controller->Close();
            }
            break;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

/**
 * Register the child view window class (called once)
 */
static void register_child_view_class() {
    if (g_child_class_registered) return;

    WNDCLASSEXW wc = {0};
    wc.cbSize = sizeof(WNDCLASSEXW);
    wc.lpfnWndProc = ChildViewWndProc;
    wc.hInstance = GetModuleHandle(NULL);
    wc.lpszClassName = CHILD_VIEW_CLASS;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);

    if (RegisterClassExW(&wc)) {
        g_child_class_registered = true;
        fprintf(stderr, "[ChildView] Registered window class\n");
    } else {
        fprintf(stderr, "[ChildView] Failed to register window class: %lu\n", GetLastError());
    }
}

/**
 * COM handler for WebView2 environment and controller creation
 */
class ChildWebView2ComHandler
    : public ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler,
      public ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,
      public ICoreWebView2WebMessageReceivedEventHandler {
public:
    ChildWebView2ComHandler(child_view_data_t* data) : m_data(data), m_ref_count(1) {}

    ULONG STDMETHODCALLTYPE AddRef() { return ++m_ref_count; }

    ULONG STDMETHODCALLTYPE Release() {
        if (m_ref_count > 1) {
            return --m_ref_count;
        }
        delete this;
        return 0;
    }

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, LPVOID* ppv) {
        if (!ppv) return E_POINTER;

        if (riid == IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler) {
            *ppv = static_cast<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        if (riid == IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler) {
            *ppv = static_cast<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        if (riid == IID_ICoreWebView2WebMessageReceivedEventHandler) {
            *ppv = static_cast<ICoreWebView2WebMessageReceivedEventHandler*>(this);
            AddRef();
            return S_OK;
        }
        if (riid == IID_IUnknown) {
            *ppv = static_cast<IUnknown*>(static_cast<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*>(this));
            AddRef();
            return S_OK;
        }

        *ppv = nullptr;
        return E_NOINTERFACE;
    }

    // Environment created callback
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT res, ICoreWebView2Environment* env) override {
        if (FAILED(res) || !env) {
            fprintf(stderr, "[ChildView] Failed to create environment: 0x%lx\n", res);
            m_data->ready = -1;  // Error
            return S_OK;
        }

        m_data->environment = env;
        env->CreateCoreWebView2Controller(m_data->hwnd, this);
        return S_OK;
    }

    // Controller created callback
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT res, ICoreWebView2Controller* controller) override {
        if (FAILED(res) || !controller) {
            fprintf(stderr, "[ChildView] Failed to create controller: 0x%lx\n", res);
            m_data->ready = -1;  // Error
            return S_OK;
        }

        m_data->controller = controller;
        controller->get_CoreWebView2(&m_data->webview);

        // Configure settings
        ComPtr<ICoreWebView2Settings> settings;
        m_data->webview->get_Settings(&settings);
        settings->put_AreDevToolsEnabled(m_data->debug ? TRUE : FALSE);
        settings->put_IsStatusBarEnabled(FALSE);
        settings->put_AreDefaultContextMenusEnabled(TRUE);

        EventRegistrationToken token;
        m_data->webview->add_WebMessageReceived(this, &token);

        // Resize to fill container
        RECT bounds;
        GetClientRect(m_data->hwnd, &bounds);
        controller->put_Bounds(bounds);
        controller->put_IsVisible(TRUE);

        fprintf(stderr, "[ChildView] WebView2 ready\n");
        m_data->ready = 1;  // Ready
        return S_OK;
    }

    // Message received callback
    HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2* sender, ICoreWebView2WebMessageReceivedEventArgs* args) override {
        (void)sender;
        LPWSTR message = nullptr;
        args->TryGetWebMessageAsString(&message);
        if (message) {
            // Convert to UTF-8
            int len = WideCharToMultiByte(CP_UTF8, 0, message, -1, NULL, 0, NULL, NULL);
            char* json = new char[len + 1];
            WideCharToMultiByte(CP_UTF8, 0, message, -1, json, len, NULL, NULL);
            json[len] = '\0';

            // Escape JSON for inclusion in "req" array
            cJSON* json_str = cJSON_CreateString(json);
            char* escaped_json = cJSON_Print(json_str);
            
            // Format as ipc:call event for Webview.ts
            // Webview.ts expects: ipc:call [channel, json_string_payload]
            // We follow the output format of handle_invoke_callback in webview_main.c
            // printf("{\"type\":\"ipc:call\",\"id\":\"%s\",\"seq\":\"%s\",\"req\":%s}\n", data->callback_id, id, req);
            
            // But we don't have a callback ID or sequence here in the native wrapper logic easily accessible 
            // without parsing the JSON first.
            // However, Webview.ts handleSpecificResponse parses the "req" field.
            // const payload = JSON.parse(response.req[1]);
            
            // So we need to construct a response where "req" is an array: ["", payload_string]
            // The payload_string is what we received (which contains type, channel, data from JS)
            
            printf("{\"type\":\"ipc:call\",\"req\":[\"\", %s]}\n", escaped_json);
            fflush(stdout);

            free(escaped_json); // cJSON_Print allocates
            cJSON_Delete(json_str);
            
            delete[] json;
            CoTaskMemFree(message);
        }
        return S_OK;
    }

private:
    child_view_data_t* m_data;
    std::atomic<ULONG> m_ref_count;
};

extern "C" {

void* platform_create_child_view(void* parent_window, int debug, child_view_bounds_t bounds) {
    HWND parentHwnd = (HWND)parent_window;
    if (!IsWindow(parentHwnd)) {
        fprintf(stderr, "[ChildView] Invalid parent window\n");
        return NULL;
    }

    // Register window class if needed
    register_child_view_class();

    // Allocate child view data
    child_view_data_t* data = new child_view_data_t();
    //memset(data, 0, sizeof(child_view_data_t)); // Unsafe for ComPtr
    data->hwnd = NULL;
    data->ready = 0;
    data->view_id[0] = '\0';

    data->debug = debug;

    // Create child window
    data->hwnd = CreateWindowExW(
        0,
        CHILD_VIEW_CLASS,
        NULL,
        WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
        bounds.x, bounds.y, bounds.width, bounds.height,
        parentHwnd,
        NULL,
        GetModuleHandle(NULL),
        NULL
    );

    if (!data->hwnd) {
        fprintf(stderr, "[ChildView] Failed to create child window: %lu\n", GetLastError());
        delete data;
        return NULL;
    }

    SetWindowPos(data->hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);

    // Store data pointer in window
    SetWindowLongPtr(data->hwnd, GWLP_USERDATA, (LONG_PTR)data);

    // Get user data folder path
    wchar_t dataPath[MAX_PATH];
    SHGetFolderPathW(NULL, CSIDL_APPDATA, NULL, 0, dataPath);
    wchar_t userDataFolder[MAX_PATH];
    PathCombineW(userDataFolder, dataPath, L"Tronbun\\ChildViews");

    // Create WebView2 environment using loader
    ChildWebView2ComHandler* handler = new ChildWebView2ComHandler(data);

    HRESULT hr = webview::detail::mswebview2::loader().create_environment_with_options(
        nullptr,
        userDataFolder,
        nullptr,
        handler
    );

    if (FAILED(hr)) {
        fprintf(stderr, "[ChildView] Failed to initiate environment creation: 0x%lx\n", hr);
        handler->Release();
        DestroyWindow(data->hwnd);
        delete data;
        return NULL;
    }

    // Pump message loop until WebView2 is ready (with timeout)
    MSG msg;
    int timeout = 0;
    const int MAX_TIMEOUT = 5000;  // 5 seconds

    while (data->ready == 0 && timeout < MAX_TIMEOUT) {
        if (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        } else {
            Sleep(10);
            timeout += 10;
        }
    }

    if (data->ready != 1) {
        fprintf(stderr, "[ChildView] WebView2 initialization timeout or error\n");
        if (data->hwnd) DestroyWindow(data->hwnd);
        delete data;
        return NULL;
    }

    fprintf(stderr, "[ChildView] Created at (%d, %d, %d, %d)\n",
            bounds.x, bounds.y, bounds.width, bounds.height);

    return data;
}

void platform_destroy_child_view(void* child_view) {
    if (!child_view) return;

    child_view_data_t* data = (child_view_data_t*)child_view;

    if (data->controller) {
        data->controller->Close();
        data->controller.Reset();
    }
    data->webview.Reset();
    data->environment.Reset();

    if (data->hwnd && IsWindow(data->hwnd)) {
        DestroyWindow(data->hwnd);
    }

    delete data;
    fprintf(stderr, "[ChildView] Destroyed\n");
}

void platform_set_child_bounds(void* child_view, child_view_bounds_t bounds) {
    if (!child_view) return;

    child_view_data_t* data = (child_view_data_t*)child_view;

    if (data->hwnd) {
        SetWindowPos(data->hwnd, NULL,
            bounds.x, bounds.y, bounds.width, bounds.height,
            SWP_NOZORDER);

        // Controller bounds are updated automatically via WM_SIZE
    }

    fprintf(stderr, "[ChildView] Bounds updated to (%d, %d, %d, %d)\n",
            bounds.x, bounds.y, bounds.width, bounds.height);
}

void platform_set_child_visible(void* child_view, int visible) {
    if (!child_view) return;

    child_view_data_t* data = (child_view_data_t*)child_view;

    if (data->hwnd) {
        ShowWindow(data->hwnd, visible ? SW_SHOW : SW_HIDE);
    }
    if (data->controller) {
        data->controller->put_IsVisible(visible ? TRUE : FALSE);
    }

    fprintf(stderr, "[ChildView] Visibility set to %s\n", visible ? "visible" : "hidden");
}

void* platform_get_child_webview(void* child_view) {
    if (!child_view) return NULL;

    child_view_data_t* data = (child_view_data_t*)child_view;
    return data->webview.Get();
}

void platform_bring_child_to_front(void* parent_window, void* child_view) {
    if (!child_view) return;
    (void)parent_window;

    child_view_data_t* data = (child_view_data_t*)child_view;

    if (data->hwnd) {
        SetWindowPos(data->hwnd, HWND_TOP, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE);
    }

    fprintf(stderr, "[ChildView] Brought to front\n");
}

void platform_send_child_to_back(void* parent_window, void* child_view) {
    if (!child_view) return;
    (void)parent_window;

    child_view_data_t* data = (child_view_data_t*)child_view;

    if (data->hwnd) {
        SetWindowPos(data->hwnd, HWND_BOTTOM, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE);
    }

    fprintf(stderr, "[ChildView] Sent to back\n");
}

void platform_init_child_ipc(void* child_view, const char* view_id) {
    if (!child_view || !view_id) return;

    child_view_data_t* data = (child_view_data_t*)child_view;
    strncpy(data->view_id, view_id, sizeof(data->view_id) - 1);
    data->view_id[sizeof(data->view_id) - 1] = '\0';

    if (!data->webview) {
        fprintf(stderr, "[ChildView] Cannot init IPC: webview not ready\n");
        return;
    }

    // Inject the tronbun IPC bridge JavaScript with viewId
    // Build the script with the viewId embedded
    char script[4096];
    snprintf(script, sizeof(script),
        "(function() {"
        "  window.tronbun = {"
        "    viewId: '%s',"
        "    invoke: function(channel, data) {"
        "      return new Promise(function(resolve, reject) {"
        "        var id = Math.random().toString(36).substring(2);"
        "        window._bunwebview_pending = window._bunwebview_pending || {};"
        "        window._bunwebview_pending[id] = { resolve: resolve, reject: reject };"
        "        var request = JSON.stringify({"
        "          type: 'invoke',"
        "          channel: channel,"
        "          data: data,"
        "          id: id,"
        "          viewId: '%s'"
        "        });"
        "        console.log('Child invoke:', request);"
        "        window.chrome.webview.postMessage(request);"
        "        console.log('Child invoke:', request);"
        "        window.chrome.webview.postMessage(request);"
        //"        resolve();" // Do not resolve immediately, wait for response via bunwebview_receive
        "      });"
        "    },"
        "    send: function(channel, data) {"
        "      var request = JSON.stringify({"
        "        type: 'send',"
        "        channel: channel,"
        "        data: data,"
        "        viewId: '%s'"
        "      });"
        "      window.chrome.webview.postMessage(request);"
        "    }"
        "  };"
        "  window.bunwebview_receive = function(message) {"
        "    try {"
        "      var data = JSON.parse(message);"
        "      if (data.type === 'ipc:response' && data.id) {"
        "        var pending = window._bunwebview_pending && window._bunwebview_pending[data.id];"
        "        if (pending) {"
        "          delete window._bunwebview_pending[data.id];"
        "          pending.resolve(data.result);"
        "        }"
        "      } else if (data.type === 'ipc:error' && data.id) {"
        "        var pending = window._bunwebview_pending && window._bunwebview_pending[data.id];"
        "        if (pending) {"
        "          delete window._bunwebview_pending[data.id];"
        "          pending.reject(new Error(data.error));"
        "        }"
        "      }"
        "    } catch (e) {"
        "      console.error('Failed to process IPC message:', e);"
        "    }"
        "  };"
        "  console.log('Child IPC bridge initialized for viewId: %s');"
        "})();",
        view_id, view_id, view_id, view_id);

    // Convert to wide string
    int wlen = MultiByteToWideChar(CP_UTF8, 0, script, -1, NULL, 0);
    wchar_t* wscript = new wchar_t[wlen];
    MultiByteToWideChar(CP_UTF8, 0, script, -1, wscript, wlen);

    data->webview->AddScriptToExecuteOnDocumentCreated(wscript, nullptr);

    delete[] wscript;

    fprintf(stderr, "[ChildView] IPC initialized for viewId: %s\n", view_id);
}

void platform_child_navigate(void* child_view, const char* url) {
    if (!child_view || !url) return;

    child_view_data_t* data = (child_view_data_t*)child_view;
    if (!data->webview) return;

    // Convert to wide string
    int wlen = MultiByteToWideChar(CP_UTF8, 0, url, -1, NULL, 0);
    wchar_t* wurl = new wchar_t[wlen];
    MultiByteToWideChar(CP_UTF8, 0, url, -1, wurl, wlen);

    data->webview->Navigate(wurl);

    delete[] wurl;
    fprintf(stderr, "[ChildView] Navigating to: %s\n", url);
}

void platform_child_set_html(void* child_view, const char* html) {
    if (!child_view || !html) return;

    child_view_data_t* data = (child_view_data_t*)child_view;
    if (!data->webview) return;

    // Convert to wide string
    int wlen = MultiByteToWideChar(CP_UTF8, 0, html, -1, NULL, 0);
    wchar_t* whtml = new wchar_t[wlen];
    MultiByteToWideChar(CP_UTF8, 0, html, -1, whtml, wlen);

    data->webview->NavigateToString(whtml);

    delete[] whtml;
    fprintf(stderr, "[ChildView] Set HTML (%zu bytes)\n", strlen(html));
}

void platform_child_eval(void* child_view, const char* js) {
    if (!child_view || !js) return;

    child_view_data_t* data = (child_view_data_t*)child_view;
    if (!data->webview) return;

    // Convert to wide string
    int wlen = MultiByteToWideChar(CP_UTF8, 0, js, -1, NULL, 0);
    wchar_t* wjs = new wchar_t[wlen];
    MultiByteToWideChar(CP_UTF8, 0, js, -1, wjs, wlen);

    data->webview->ExecuteScript(wjs, nullptr);

    delete[] wjs;
    fprintf(stderr, "[ChildView] Evaluated JS\n");
}

void platform_child_init(void* child_view, const char* js) {
    if (!child_view || !js) return;

    child_view_data_t* data = (child_view_data_t*)child_view;
    if (!data->webview) return;

    // Convert to wide string
    int wlen = MultiByteToWideChar(CP_UTF8, 0, js, -1, NULL, 0);
    wchar_t* wjs = new wchar_t[wlen];
    MultiByteToWideChar(CP_UTF8, 0, js, -1, wjs, wlen);

    data->webview->AddScriptToExecuteOnDocumentCreated(wjs, nullptr);

    delete[] wjs;
    fprintf(stderr, "[ChildView] Added init script\n");
}

} // extern "C"

#endif // _WIN32
