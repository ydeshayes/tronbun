#ifndef WEBVIEW2_UTILS_H
#define WEBVIEW2_UTILS_H

#include <webview2.h>
#include <windows.h>
#include <eventtoken.h>
#include <atomic>
#include <functional>
#include <string>

// Helper GUIDs are defined in webview2.h
// static const IID IID_ICoreWebView2CapturePreviewCompletedHandler = ...;
// static const IID IID_ICoreWebView2CallDevToolsProtocolMethodCompletedHandler = ...;
// static const IID IID_ICoreWebView2DevToolsProtocolEventReceivedEventHandler = ...;

// Base class for COM handlers without QueryInterface implementation
template <typename T>
class CallbackHandlerBase : public T {
public:
    CallbackHandlerBase() : m_refCount(1) {}
    virtual ~CallbackHandlerBase() = default;

    ULONG STDMETHODCALLTYPE AddRef() override {
        return ++m_refCount;
    }

    ULONG STDMETHODCALLTYPE Release() override {
        ULONG count = --m_refCount;
        if (count == 0) {
            delete this;
        }
        return count;
    }

protected:
    std::atomic<ULONG> m_refCount;
};

// Handler for CapturePreview
class CapturePreviewHandler : public CallbackHandlerBase<ICoreWebView2CapturePreviewCompletedHandler> {
public:
    using CallbackFunc = std::function<HRESULT(HRESULT)>;

    CapturePreviewHandler(CallbackFunc callback) : m_callback(callback) {}

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2CapturePreviewCompletedHandler) {
            *ppv = static_cast<ICoreWebView2CapturePreviewCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }

    HRESULT STDMETHODCALLTYPE Invoke(HRESULT errorCode) override {
        return m_callback(errorCode);
    }

private:
    CallbackFunc m_callback;
};

// Handler for CallDevToolsProtocolMethod
class CallDevToolsProtocolMethodHandler : public CallbackHandlerBase<ICoreWebView2CallDevToolsProtocolMethodCompletedHandler> {
public:
    using CallbackFunc = std::function<HRESULT(HRESULT, LPCWSTR)>;

    CallDevToolsProtocolMethodHandler(CallbackFunc callback) : m_callback(callback) {}

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2CallDevToolsProtocolMethodCompletedHandler) {
            *ppv = static_cast<ICoreWebView2CallDevToolsProtocolMethodCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }

    HRESULT STDMETHODCALLTYPE Invoke(HRESULT errorCode, LPCWSTR returnObjectAsJson) override {
        return m_callback(errorCode, returnObjectAsJson);
    }

private:
    CallbackFunc m_callback;
};

// Handler for DevToolsProtocolEventReceived
class DevToolsProtocolEventReceivedHandler : public CallbackHandlerBase<ICoreWebView2DevToolsProtocolEventReceivedEventHandler> {
public:
    using CallbackFunc = std::function<HRESULT(ICoreWebView2*, ICoreWebView2DevToolsProtocolEventReceivedEventArgs*)>;

    DevToolsProtocolEventReceivedHandler(CallbackFunc callback) : m_callback(callback) {}

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2DevToolsProtocolEventReceivedEventHandler) {
            *ppv = static_cast<ICoreWebView2DevToolsProtocolEventReceivedEventHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }

    HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2* sender, ICoreWebView2DevToolsProtocolEventReceivedEventArgs* args) override {
        return m_callback(sender, args);
    }

private:
    CallbackFunc m_callback;
};

// Helper to convert wstring to string
static inline std::string wstring_to_string_util(const std::wstring& wstr) {
    if (wstr.empty()) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, nullptr, 0, nullptr, nullptr);
    std::string str(size - 1, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &str[0], size, nullptr, nullptr);
    return str;
}

// Helper to convert string to wstring
static inline std::wstring string_to_wstring_util(const std::string& str) {
    if (str.empty()) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, nullptr, 0);
    std::wstring wstr(size - 1, 0);
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, &wstr[0], size);
    return wstr;
}

#endif // WEBVIEW2_UTILS_H
