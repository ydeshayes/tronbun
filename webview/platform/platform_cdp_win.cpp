/**
 * Windows CDP Implementation using WebView2's native CDP support
 */

#ifdef _WIN32

#include "platform_cdp.h"
#include <windows.h>
#include <webview2.h>
// #include <wrl.h>
// #include <wrl/event.h>
#include <string>
#include <map>
#include <vector>
#include <mutex>
#include <atomic>
#include <cstdio>

#include "webview2_utils.h"

// using namespace Microsoft::WRL;

// Global state for CDP
struct CDPState {
    ICoreWebView2* webview = nullptr;
    // std::map<int, ComPtr<ICoreWebView2DevToolsProtocolEventReceiver>> eventReceivers;
    std::map<int, ICoreWebView2DevToolsProtocolEventReceiver*> eventReceivers;
    std::map<int, EventRegistrationToken> eventTokens;
    std::atomic<int> nextSubscriptionId{1};
    std::mutex mutex;
};

static std::map<void*, CDPState*> g_cdp_states;
static std::mutex g_states_mutex;

// Helper to get or create CDP state for a window
static CDPState* get_cdp_state(void* webview_window, bool create = true) {
    std::lock_guard<std::mutex> lock(g_states_mutex);
    auto it = g_cdp_states.find(webview_window);
    if (it != g_cdp_states.end()) {
        return it->second;
    }
    if (create) {
        auto state = new CDPState();
        g_cdp_states[webview_window] = state;
        return state;
    }
    return nullptr;
}

// Helper to convert wstring to string
static std::string wstring_to_string(const std::wstring& wstr) {
    if (wstr.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string str(size - 1, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &str[0], size, nullptr, nullptr);
    return str;
}

// Helper to convert string to wstring
static std::wstring string_to_wstring(const std::string& str) {
    if (str.empty()) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, nullptr, 0);
    std::wstring wstr(size - 1, 0);
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, &wstr[0], size);
    return wstr;
}

extern "C" {

int platform_cdp_init(void* webview_window) {
    // State is created lazily when needed
    return 0;
}

void platform_cdp_cleanup(void* webview_window) {
    std::lock_guard<std::mutex> lock(g_states_mutex);
    auto it = g_cdp_states.find(webview_window);
    if (it != g_cdp_states.end()) {
        // Release receivers
        for (auto& pair : it->second->eventReceivers) {
            if (pair.second) pair.second->Release();
        }
        delete it->second;
        g_cdp_states.erase(it);
    }
}

void platform_cdp_call(void* webview_window, const char* method, const char* params,
                       cdp_result_callback_t callback, void* user_data) {
    if (!callback) return;

    CDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) {
        callback(nullptr, "WebView2 not initialized for CDP", user_data);
        return;
    }

    std::wstring wmethod = string_to_wstring(method ? method : "");
    std::wstring wparams = string_to_wstring(params ? params : "{}");

    // Create copies for the lambda
    cdp_result_callback_t cb = callback;
    void* ud = user_data;

    HRESULT hr = state->webview->CallDevToolsProtocolMethod(
        wmethod.c_str(),
        wparams.c_str(),
        new CallDevToolsProtocolMethodHandler(
            [cb, ud](HRESULT errorCode, LPCWSTR returnObjectAsJson) -> HRESULT {
                if (FAILED(errorCode)) {
                    std::string resultJson = wstring_to_string(returnObjectAsJson ? returnObjectAsJson : L"");
                    char errMsg[512];
                    if (resultJson.empty()) {
                        snprintf(errMsg, sizeof(errMsg), "CDP call failed (0x%08lX)", (unsigned long)errorCode);
                    } else {
                        snprintf(errMsg, sizeof(errMsg), "CDP call failed (0x%08lX): %.400s", (unsigned long)errorCode, resultJson.c_str());
                    }
                    cb(nullptr, errMsg, ud);
                } else {
                    std::string result = wstring_to_string(returnObjectAsJson ? returnObjectAsJson : L"{}");
                    cb(result.c_str(), nullptr, ud);
                }
                return S_OK;
            }
        )
    );

    if (FAILED(hr)) {
        callback(nullptr, "Failed to call CDP method", user_data);
    }
}

int platform_cdp_subscribe(void* webview_window, const char* event_name,
                           cdp_event_callback_t callback, void* user_data) {
    if (!callback || !event_name) return -1;

    CDPState* state = get_cdp_state(webview_window);
    if (!state || !state->webview) return -1;

    std::wstring wevent = string_to_wstring(event_name);
    std::string event_copy = event_name;

    ICoreWebView2DevToolsProtocolEventReceiver* receiver = nullptr;
    HRESULT hr = state->webview->GetDevToolsProtocolEventReceiver(wevent.c_str(), &receiver);
    if (FAILED(hr) || !receiver) return -1;

    int subscriptionId = state->nextSubscriptionId++;
    cdp_event_callback_t cb = callback;
    void* ud = user_data;

    EventRegistrationToken token;
    hr = receiver->add_DevToolsProtocolEventReceived(
        new DevToolsProtocolEventReceivedHandler(
            [cb, ud, event_copy](ICoreWebView2* sender, ICoreWebView2DevToolsProtocolEventReceivedEventArgs* args) -> HRESULT {
                LPWSTR paramsJson = nullptr;
                args->get_ParameterObjectAsJson(&paramsJson);
                std::string params = wstring_to_string(paramsJson ? paramsJson : L"{}");
                CoTaskMemFree(paramsJson);
                cb(event_copy.c_str(), params.c_str(), ud);
                return S_OK;
            }
        ),
        &token
    );

    if (FAILED(hr)) {
        receiver->Release();
        return -1;
    }

    std::lock_guard<std::mutex> lock(state->mutex);
    state->eventReceivers[subscriptionId] = receiver;
    state->eventTokens[subscriptionId] = token;

    return subscriptionId;
}

void platform_cdp_unsubscribe(void* webview_window, int subscription_id) {
    CDPState* state = get_cdp_state(webview_window, false);
    if (!state) return;

    std::lock_guard<std::mutex> lock(state->mutex);
    auto receiverIt = state->eventReceivers.find(subscription_id);
    auto tokenIt = state->eventTokens.find(subscription_id);

    if (receiverIt != state->eventReceivers.end() && tokenIt != state->eventTokens.end()) {
        receiverIt->second->remove_DevToolsProtocolEventReceived(tokenIt->second);
        receiverIt->second->Release();
        state->eventReceivers.erase(receiverIt);
        state->eventTokens.erase(tokenIt);
    }
}

// Convenience functions - these use CDP methods directly on Windows

void platform_cdp_get_cookies(void* webview_window, const char* url,
                              cdp_result_callback_t callback, void* user_data) {
    std::string params = "{}";
    if (url && url[0]) {
        params = "{\"urls\":[\"" + std::string(url) + "\"]}";
    }
    platform_cdp_call(webview_window, "Network.getCookies", params.c_str(), callback, user_data);
}

void platform_cdp_set_cookie(void* webview_window, const char* cookie_json,
                             cdp_result_callback_t callback, void* user_data) {
    platform_cdp_call(webview_window, "Network.setCookie", cookie_json, callback, user_data);
}

void platform_cdp_delete_cookies(void* webview_window, const char* name,
                                 const char* url, const char* domain,
                                 cdp_result_callback_t callback, void* user_data) {
    std::string params = "{\"name\":\"" + std::string(name ? name : "") + "\"";
    if (url && url[0]) params += ",\"url\":\"" + std::string(url) + "\"";
    if (domain && domain[0]) params += ",\"domain\":\"" + std::string(domain) + "\"";
    params += "}";
    platform_cdp_call(webview_window, "Network.deleteCookies", params.c_str(), callback, user_data);
}

void platform_cdp_print_to_pdf(void* webview_window, const char* options_json,
                               cdp_result_callback_t callback, void* user_data) {
    platform_cdp_call(webview_window, "Page.printToPDF", options_json ? options_json : "{}", callback, user_data);
}

void platform_cdp_dispatch_mouse_event(void* webview_window, const char* type,
                                       int x, int y, const char* button, int click_count,
                                       cdp_result_callback_t callback, void* user_data) {
    char params[512];
    snprintf(params, sizeof(params),
        "{\"type\":\"%s\",\"x\":%d,\"y\":%d,\"button\":\"%s\",\"clickCount\":%d}",
        type ? type : "mouseMoved", x, y, button ? button : "left", click_count);
    platform_cdp_call(webview_window, "Input.dispatchMouseEvent", params, callback, user_data);
}

void platform_cdp_dispatch_key_event(void* webview_window, const char* type,
                                     const char* key, int modifiers,
                                     cdp_result_callback_t callback, void* user_data) {
    char params[512];
    snprintf(params, sizeof(params),
        "{\"type\":\"%s\",\"key\":\"%s\",\"modifiers\":%d}",
        type ? type : "keyDown", key ? key : "", modifiers);
    platform_cdp_call(webview_window, "Input.dispatchKeyEvent", params, callback, user_data);
}

void platform_cdp_insert_text(void* webview_window, const char* text,
                              cdp_result_callback_t callback, void* user_data) {
    std::string params = "{\"text\":\"" + std::string(text ? text : "") + "\"}";
    platform_cdp_call(webview_window, "Input.insertText", params.c_str(), callback, user_data);
}

void platform_cdp_network_enable(void* webview_window,
                                 cdp_result_callback_t callback, void* user_data) {
    platform_cdp_call(webview_window, "Network.enable", "{}", callback, user_data);
}

void platform_cdp_network_disable(void* webview_window,
                                  cdp_result_callback_t callback, void* user_data) {
    platform_cdp_call(webview_window, "Network.disable", "{}", callback, user_data);
}

void platform_cdp_set_request_interception(void* webview_window, const char* patterns_json,
                                           cdp_result_callback_t callback, void* user_data) {
    std::string params = "{\"patterns\":" + std::string(patterns_json ? patterns_json : "[]") + "}";
    platform_cdp_call(webview_window, "Fetch.enable", params.c_str(), callback, user_data);
}

void platform_cdp_continue_request(void* webview_window, const char* request_id,
                                   const char* url, const char* method, const char* headers_json,
                                   cdp_result_callback_t callback, void* user_data) {
    std::string params = "{\"requestId\":\"" + std::string(request_id ? request_id : "") + "\"";
    if (url && url[0]) params += ",\"url\":\"" + std::string(url) + "\"";
    if (method && method[0]) params += ",\"method\":\"" + std::string(method) + "\"";
    if (headers_json && headers_json[0]) params += ",\"headers\":" + std::string(headers_json);
    params += "}";
    platform_cdp_call(webview_window, "Fetch.continueRequest", params.c_str(), callback, user_data);
}

void platform_cdp_fulfill_request(void* webview_window, const char* request_id,
                                  int status, const char* headers_json, const char* body_base64,
                                  cdp_result_callback_t callback, void* user_data) {
    char params[8192];
    snprintf(params, sizeof(params),
        "{\"requestId\":\"%s\",\"responseCode\":%d,\"responseHeaders\":%s,\"body\":\"%s\"}",
        request_id ? request_id : "", status,
        headers_json ? headers_json : "[]",
        body_base64 ? body_base64 : "");
    platform_cdp_call(webview_window, "Fetch.fulfillRequest", params, callback, user_data);
}

void platform_cdp_fail_request(void* webview_window, const char* request_id,
                               const char* reason,
                               cdp_result_callback_t callback, void* user_data) {
    char params[512];
    snprintf(params, sizeof(params),
        "{\"requestId\":\"%s\",\"errorReason\":\"%s\"}",
        request_id ? request_id : "", reason ? reason : "Failed");
    platform_cdp_call(webview_window, "Fetch.failRequest", params, callback, user_data);
}

/** Return the ICoreWebView2* for a window (for screenshot etc.). Caller casts to ICoreWebView2*. */
void* platform_cdp_get_webview2(void* webview_window) {
    CDPState* state = get_cdp_state(webview_window, false);
    return (state && state->webview) ? (void*)state->webview : nullptr;
}

} // extern "C"

// Function to set the WebView2 instance for CDP
// This needs to be called from the webview initialization code
extern "C" void platform_cdp_set_webview2(void* webview_window, ICoreWebView2* webview) {
    CDPState* state = get_cdp_state(webview_window);
    if (state) {
        state->webview = webview;
    }
}

#endif // _WIN32
