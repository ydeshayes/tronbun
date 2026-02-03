/**
 * WebView2 Environment Options with Custom Scheme Registration
 * 
 * Creates environment options that register the tronbun:// custom scheme
 * so that WebView2 can navigate to tronbun:// URLs.
 */

#ifdef _WIN32

#include "webview2_env_options.h"
#include <windows.h>
#include <string>
#include <cstdio>

// Include WebView2 header
#include "../webview_adapter/include/WebView2.h"

/**
 * Simple implementation of ICoreWebView2CustomSchemeRegistration
 */
class TronbunSchemeRegistration : public ICoreWebView2CustomSchemeRegistration {
public:
    TronbunSchemeRegistration() : m_refCount(1), m_treatAsSecure(TRUE), m_hasAuthority(TRUE) {
        fprintf(stderr, "[TronbunScheme] Created scheme registration for 'tronbun'\n");
    }

    virtual ~TronbunSchemeRegistration() {
        fprintf(stderr, "[TronbunScheme] Destroyed scheme registration\n");
    }

    // IUnknown methods
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2CustomSchemeRegistration) {
            *ppv = static_cast<ICoreWebView2CustomSchemeRegistration*>(this);
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

    // ICoreWebView2CustomSchemeRegistration methods
    HRESULT STDMETHODCALLTYPE get_SchemeName(LPWSTR* schemeName) override {
        fprintf(stderr, "[TronbunScheme] get_SchemeName called\n");
        if (!schemeName) return E_POINTER;
        const wchar_t* name = L"tronbun";
        size_t len = wcslen(name) + 1;
        *schemeName = (LPWSTR)CoTaskMemAlloc(len * sizeof(wchar_t));
        if (!*schemeName) return E_OUTOFMEMORY;
        wcscpy_s(*schemeName, len, name);
        fprintf(stderr, "[TronbunScheme] -> returning 'tronbun'\n");
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE get_TreatAsSecure(BOOL* treatAsSecure) override {
        fprintf(stderr, "[TronbunScheme] get_TreatAsSecure called\n");
        if (!treatAsSecure) return E_POINTER;
        *treatAsSecure = m_treatAsSecure;
        fprintf(stderr, "[TronbunScheme] -> returning %d\n", m_treatAsSecure);
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE put_TreatAsSecure(BOOL value) override {
        fprintf(stderr, "[TronbunScheme] put_TreatAsSecure(%d)\n", value);
        m_treatAsSecure = value;
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE GetAllowedOrigins(UINT32* allowedOriginsCount, LPWSTR** allowedOrigins) override {
        fprintf(stderr, "[TronbunScheme] GetAllowedOrigins called\n");
        if (!allowedOriginsCount || !allowedOrigins) return E_POINTER;
        // Return empty array - scheme will be accessible from any origin by default
        *allowedOriginsCount = 0;
        *allowedOrigins = nullptr;
        fprintf(stderr, "[TronbunScheme] -> returning 0 origins\n");
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE SetAllowedOrigins(UINT32 allowedOriginsCount, LPCWSTR* allowedOrigins) override {
        fprintf(stderr, "[TronbunScheme] SetAllowedOrigins(%u)\n", allowedOriginsCount);
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE get_HasAuthorityComponent(BOOL* hasAuthorityComponent) override {
        fprintf(stderr, "[TronbunScheme] get_HasAuthorityComponent called\n");
        if (!hasAuthorityComponent) return E_POINTER;
        *hasAuthorityComponent = m_hasAuthority;
        fprintf(stderr, "[TronbunScheme] -> returning %d\n", m_hasAuthority);
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE put_HasAuthorityComponent(BOOL hasAuthorityComponent) override {
        fprintf(stderr, "[TronbunScheme] put_HasAuthorityComponent(%d)\n", hasAuthorityComponent);
        m_hasAuthority = hasAuthorityComponent;
        return S_OK;
    }

private:
    LONG m_refCount;
    BOOL m_treatAsSecure;
    BOOL m_hasAuthority;
};

/**
 * Implementation of ICoreWebView2EnvironmentOptions that supports
 * Options and Options4 (for custom scheme registration).
 */
class TronbunEnvironmentOptions 
    : public ICoreWebView2EnvironmentOptions,
      public ICoreWebView2EnvironmentOptions4 {
public:
    TronbunEnvironmentOptions() : m_refCount(1), m_schemeRegistration(nullptr) {
        m_schemeRegistration = new TronbunSchemeRegistration();
        fprintf(stderr, "[TronbunEnvOptions] Created environment options\n");
    }

    virtual ~TronbunEnvironmentOptions() {
        if (m_schemeRegistration) {
            m_schemeRegistration->Release();
        }
        fprintf(stderr, "[TronbunEnvOptions] Destroyed environment options\n");
    }

    // IUnknown methods
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        
        if (riid == IID_IUnknown) {
            *ppv = static_cast<IUnknown*>(static_cast<ICoreWebView2EnvironmentOptions*>(this));
            AddRef();
            fprintf(stderr, "[TronbunEnvOptions] QueryInterface: IUnknown -> OK\n");
            return S_OK;
        }
        if (riid == IID_ICoreWebView2EnvironmentOptions) {
            *ppv = static_cast<ICoreWebView2EnvironmentOptions*>(this);
            AddRef();
            fprintf(stderr, "[TronbunEnvOptions] QueryInterface: Options -> OK\n");
            return S_OK;
        }
        if (riid == IID_ICoreWebView2EnvironmentOptions4) {
            *ppv = static_cast<ICoreWebView2EnvironmentOptions4*>(this);
            AddRef();
            fprintf(stderr, "[TronbunEnvOptions] QueryInterface: Options4 -> OK\n");
            return S_OK;
        }
        
        *ppv = nullptr;
        // Print the unknown IID for debugging
        fprintf(stderr, "[TronbunEnvOptions] QueryInterface: Unknown IID {%08lX-%04X-%04X-%02X%02X-%02X%02X%02X%02X%02X%02X} -> E_NOINTERFACE\n",
            riid.Data1, riid.Data2, riid.Data3,
            riid.Data4[0], riid.Data4[1], riid.Data4[2], riid.Data4[3],
            riid.Data4[4], riid.Data4[5], riid.Data4[6], riid.Data4[7]);
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

    // ICoreWebView2EnvironmentOptions methods
    HRESULT STDMETHODCALLTYPE get_AdditionalBrowserArguments(LPWSTR* value) override {
        fprintf(stderr, "[TronbunEnvOptions] get_AdditionalBrowserArguments called\n");
        if (!value) return E_POINTER;
        // Return empty string
        *value = (LPWSTR)CoTaskMemAlloc(sizeof(wchar_t));
        if (!*value) return E_OUTOFMEMORY;
        (*value)[0] = L'\0';
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE put_AdditionalBrowserArguments(LPCWSTR value) override {
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE get_Language(LPWSTR* value) override {
        fprintf(stderr, "[TronbunEnvOptions] get_Language called\n");
        if (!value) return E_POINTER;
        // Return empty string - use system default language
        *value = (LPWSTR)CoTaskMemAlloc(sizeof(wchar_t));
        if (!*value) return E_OUTOFMEMORY;
        (*value)[0] = L'\0';
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE put_Language(LPCWSTR value) override {
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE get_TargetCompatibleBrowserVersion(LPWSTR* value) override {
        fprintf(stderr, "[TronbunEnvOptions] get_TargetCompatibleBrowserVersion called\n");
        if (!value) return E_POINTER;
        // Return a very old minimum version to ensure compatibility with any installed WebView2
        const wchar_t* version = L"86.0.616.0";
        size_t len = wcslen(version) + 1;
        *value = (LPWSTR)CoTaskMemAlloc(len * sizeof(wchar_t));
        if (!*value) return E_OUTOFMEMORY;
        wcscpy_s(*value, len, version);
        fprintf(stderr, "[TronbunEnvOptions] -> returning '%ls'\n", version);
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE put_TargetCompatibleBrowserVersion(LPCWSTR value) override {
        fprintf(stderr, "[TronbunEnvOptions] put_TargetCompatibleBrowserVersion called\n");
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE get_AllowSingleSignOnUsingOSPrimaryAccount(BOOL* allow) override {
        if (!allow) return E_POINTER;
        *allow = FALSE;
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE put_AllowSingleSignOnUsingOSPrimaryAccount(BOOL allow) override {
        return S_OK;
    }

    // ICoreWebView2EnvironmentOptions4 methods
    HRESULT STDMETHODCALLTYPE GetCustomSchemeRegistrations(
        UINT32* count,
        ICoreWebView2CustomSchemeRegistration*** schemeRegistrations) override {
        fprintf(stderr, "[TronbunEnvOptions] GetCustomSchemeRegistrations called\n");
        if (!count || !schemeRegistrations) return E_POINTER;
        
        // Return the tronbun scheme registration
        *count = 1;
        *schemeRegistrations = (ICoreWebView2CustomSchemeRegistration**)CoTaskMemAlloc(
            sizeof(ICoreWebView2CustomSchemeRegistration*));
        if (!*schemeRegistrations) {
            fprintf(stderr, "[TronbunEnvOptions] Failed to allocate scheme array\n");
            return E_OUTOFMEMORY;
        }
        
        m_schemeRegistration->AddRef();
        (*schemeRegistrations)[0] = m_schemeRegistration;
        
        fprintf(stderr, "[TronbunEnvOptions] Returning 1 scheme: tronbun\n");
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE SetCustomSchemeRegistrations(
        UINT32 count,
        ICoreWebView2CustomSchemeRegistration** schemeRegistrations) override {
        fprintf(stderr, "[TronbunEnvOptions] SetCustomSchemeRegistrations called with %u schemes\n", count);
        return S_OK;
    }

private:
    LONG m_refCount;
    TronbunSchemeRegistration* m_schemeRegistration;
};

// Factory function to create the environment options
extern "C" ICoreWebView2EnvironmentOptions* tronbun_create_environment_options() {
    fprintf(stderr, "[TronbunEnvOptions] Creating environment options with tronbun:// scheme\n");
    return new TronbunEnvironmentOptions();
}

#endif // _WIN32
