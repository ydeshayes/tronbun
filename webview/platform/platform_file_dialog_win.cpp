/**
 * Windows file dialog implementation using IFileDialog API
 */

#ifdef _WIN32

#include "platform_file_dialog.h"
#include <windows.h>
#include <shobjidl.h>
#include <shlwapi.h>
#include <stdlib.h>
#include <string.h>
#include <vector>
#include <string>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")

// Convert UTF-8 to wide string
static std::wstring utf8_to_wide(const char* str) {
    if (!str || strlen(str) == 0) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, str, -1, NULL, 0);
    std::wstring result(size, 0);
    MultiByteToWideChar(CP_UTF8, 0, str, -1, &result[0], size);
    if (!result.empty() && result.back() == 0) result.pop_back();
    return result;
}

// Convert wide string to UTF-8
static std::string wide_to_utf8(const wchar_t* str) {
    if (!str || wcslen(str) == 0) return "";
    int size = WideCharToMultiByte(CP_UTF8, 0, str, -1, NULL, 0, NULL, NULL);
    std::string result(size, 0);
    WideCharToMultiByte(CP_UTF8, 0, str, -1, &result[0], size, NULL, NULL);
    if (!result.empty() && result.back() == 0) result.pop_back();
    return result;
}

// Convert paths vector to JSON array string
static char* paths_to_json(const std::vector<std::string>& paths) {
    if (paths.empty()) return NULL;

    std::string json = "[";
    for (size_t i = 0; i < paths.size(); i++) {
        if (i > 0) json += ",";
        json += "\"";
        // Escape backslashes and quotes
        for (char c : paths[i]) {
            if (c == '\\') json += "\\\\";
            else if (c == '"') json += "\\\"";
            else json += c;
        }
        json += "\"";
    }
    json += "]";

    return _strdup(json.c_str());
}

// Simple JSON parser for filter array
// Expected format: [{"name":"Images","extensions":["png","jpg"]}]
struct FilterSpec {
    std::wstring name;
    std::wstring spec;  // e.g., "*.png;*.jpg"
};

static std::vector<FilterSpec> parse_filters_json(const char* json) {
    std::vector<FilterSpec> result;
    if (!json) return result;

    // Very simple parser - look for name and extensions
    const char* p = json;
    while (*p) {
        // Find "name"
        const char* nameKey = strstr(p, "\"name\"");
        if (!nameKey) break;

        // Find the value after colon
        const char* nameStart = strchr(nameKey + 6, '"');
        if (!nameStart) break;
        nameStart++;
        const char* nameEnd = strchr(nameStart, '"');
        if (!nameEnd) break;

        std::string name(nameStart, nameEnd - nameStart);

        // Find extensions array
        const char* extKey = strstr(nameEnd, "\"extensions\"");
        if (!extKey) break;

        const char* extStart = strchr(extKey, '[');
        if (!extStart) break;
        const char* extEnd = strchr(extStart, ']');
        if (!extEnd) break;

        // Parse extensions
        std::wstring spec;
        const char* ext = extStart + 1;
        while (ext < extEnd) {
            const char* qs = strchr(ext, '"');
            if (!qs || qs >= extEnd) break;
            qs++;
            const char* qe = strchr(qs, '"');
            if (!qe || qe >= extEnd) break;

            if (!spec.empty()) spec += L";";
            spec += L"*.";
            spec += utf8_to_wide(std::string(qs, qe - qs).c_str());

            ext = qe + 1;
        }

        if (!spec.empty()) {
            FilterSpec fs;
            fs.name = utf8_to_wide(name.c_str());
            fs.spec = spec;
            result.push_back(fs);
        }

        p = extEnd + 1;
    }

    return result;
}

extern "C" {

void platform_open_file_dialog(void* window, const char* title, const char* filters_json,
                               int allow_multiple, file_dialog_callback_t callback, void* user_data) {
    if (!callback) return;

    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    bool needUninit = SUCCEEDED(hr);

    IFileOpenDialog* pFileOpen = NULL;
    hr = CoCreateInstance(CLSID_FileOpenDialog, NULL, CLSCTX_ALL,
                          IID_IFileOpenDialog, (void**)&pFileOpen);

    if (FAILED(hr)) {
        if (needUninit) CoUninitialize();
        callback(NULL, user_data);
        return;
    }

    // Set options
    DWORD dwFlags;
    pFileOpen->GetOptions(&dwFlags);
    dwFlags |= FOS_FORCEFILESYSTEM;
    if (allow_multiple) {
        dwFlags |= FOS_ALLOWMULTISELECT;
    }
    pFileOpen->SetOptions(dwFlags);

    // Set title
    if (title) {
        pFileOpen->SetTitle(utf8_to_wide(title).c_str());
    }

    // Set filters
    std::vector<FilterSpec> filters = parse_filters_json(filters_json);
    std::vector<COMDLG_FILTERSPEC> comFilters;

    if (!filters.empty()) {
        for (const auto& f : filters) {
            COMDLG_FILTERSPEC spec;
            spec.pszName = f.name.c_str();
            spec.pszSpec = f.spec.c_str();
            comFilters.push_back(spec);
        }
        // Add "All Files"
        static const wchar_t* allName = L"All Files";
        static const wchar_t* allSpec = L"*.*";
        COMDLG_FILTERSPEC allFiles = { allName, allSpec };
        comFilters.push_back(allFiles);

        pFileOpen->SetFileTypes((UINT)comFilters.size(), comFilters.data());
    }

    // Show dialog
    hr = pFileOpen->Show((HWND)window);

    std::vector<std::string> paths;
    if (SUCCEEDED(hr)) {
        IShellItemArray* pItems = NULL;
        hr = pFileOpen->GetResults(&pItems);
        if (SUCCEEDED(hr)) {
            DWORD count = 0;
            pItems->GetCount(&count);

            for (DWORD i = 0; i < count; i++) {
                IShellItem* pItem = NULL;
                if (SUCCEEDED(pItems->GetItemAt(i, &pItem))) {
                    PWSTR pszPath = NULL;
                    if (SUCCEEDED(pItem->GetDisplayName(SIGDN_FILESYSPATH, &pszPath))) {
                        paths.push_back(wide_to_utf8(pszPath));
                        CoTaskMemFree(pszPath);
                    }
                    pItem->Release();
                }
            }
            pItems->Release();
        }
    }

    pFileOpen->Release();
    if (needUninit) CoUninitialize();

    char* json = paths_to_json(paths);
    callback(json, user_data);
    free(json);
}

void platform_save_file_dialog(void* window, const char* title, const char* default_name,
                               const char* filters_json, file_dialog_callback_t callback, void* user_data) {
    if (!callback) return;

    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    bool needUninit = SUCCEEDED(hr);

    IFileSaveDialog* pFileSave = NULL;
    hr = CoCreateInstance(CLSID_FileSaveDialog, NULL, CLSCTX_ALL,
                          IID_IFileSaveDialog, (void**)&pFileSave);

    if (FAILED(hr)) {
        if (needUninit) CoUninitialize();
        callback(NULL, user_data);
        return;
    }

    // Set options
    DWORD dwFlags;
    pFileSave->GetOptions(&dwFlags);
    dwFlags |= FOS_FORCEFILESYSTEM | FOS_OVERWRITEPROMPT;
    pFileSave->SetOptions(dwFlags);

    // Set title
    if (title) {
        pFileSave->SetTitle(utf8_to_wide(title).c_str());
    }

    // Set default filename
    if (default_name) {
        pFileSave->SetFileName(utf8_to_wide(default_name).c_str());
    }

    // Set filters
    std::vector<FilterSpec> filters = parse_filters_json(filters_json);
    std::vector<COMDLG_FILTERSPEC> comFilters;

    if (!filters.empty()) {
        for (const auto& f : filters) {
            COMDLG_FILTERSPEC spec;
            spec.pszName = f.name.c_str();
            spec.pszSpec = f.spec.c_str();
            comFilters.push_back(spec);
        }
        static const wchar_t* allName = L"All Files";
        static const wchar_t* allSpec = L"*.*";
        COMDLG_FILTERSPEC allFiles = { allName, allSpec };
        comFilters.push_back(allFiles);

        pFileSave->SetFileTypes((UINT)comFilters.size(), comFilters.data());
    }

    // Show dialog
    hr = pFileSave->Show((HWND)window);

    std::vector<std::string> paths;
    if (SUCCEEDED(hr)) {
        IShellItem* pItem = NULL;
        if (SUCCEEDED(pFileSave->GetResult(&pItem))) {
            PWSTR pszPath = NULL;
            if (SUCCEEDED(pItem->GetDisplayName(SIGDN_FILESYSPATH, &pszPath))) {
                paths.push_back(wide_to_utf8(pszPath));
                CoTaskMemFree(pszPath);
            }
            pItem->Release();
        }
    }

    pFileSave->Release();
    if (needUninit) CoUninitialize();

    char* json = paths_to_json(paths);
    callback(json, user_data);
    free(json);
}

void platform_open_folder_dialog(void* window, const char* title,
                                 file_dialog_callback_t callback, void* user_data) {
    if (!callback) return;

    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    bool needUninit = SUCCEEDED(hr);

    IFileOpenDialog* pFileOpen = NULL;
    hr = CoCreateInstance(CLSID_FileOpenDialog, NULL, CLSCTX_ALL,
                          IID_IFileOpenDialog, (void**)&pFileOpen);

    if (FAILED(hr)) {
        if (needUninit) CoUninitialize();
        callback(NULL, user_data);
        return;
    }

    // Set options for folder picker
    DWORD dwFlags;
    pFileOpen->GetOptions(&dwFlags);
    dwFlags |= FOS_FORCEFILESYSTEM | FOS_PICKFOLDERS;
    pFileOpen->SetOptions(dwFlags);

    // Set title
    if (title) {
        pFileOpen->SetTitle(utf8_to_wide(title).c_str());
    }

    // Show dialog
    hr = pFileOpen->Show((HWND)window);

    std::vector<std::string> paths;
    if (SUCCEEDED(hr)) {
        IShellItemArray* pItems = NULL;
        hr = pFileOpen->GetResults(&pItems);
        if (SUCCEEDED(hr)) {
            DWORD count = 0;
            pItems->GetCount(&count);

            for (DWORD i = 0; i < count; i++) {
                IShellItem* pItem = NULL;
                if (SUCCEEDED(pItems->GetItemAt(i, &pItem))) {
                    PWSTR pszPath = NULL;
                    if (SUCCEEDED(pItem->GetDisplayName(SIGDN_FILESYSPATH, &pszPath))) {
                        paths.push_back(wide_to_utf8(pszPath));
                        CoTaskMemFree(pszPath);
                    }
                    pItem->Release();
                }
            }
            pItems->Release();
        }
    }

    pFileOpen->Release();
    if (needUninit) CoUninitialize();

    char* json = paths_to_json(paths);
    callback(json, user_data);
    free(json);
}

MessageBoxResult platform_message_box(void* window, MessageBoxType type, MessageBoxButtons buttons,
                                      const char* title, const char* message, const char* detail) {
    // Build message text (combine message and detail)
    std::wstring text;
    if (message) {
        text = utf8_to_wide(message);
    }
    if (detail) {
        if (!text.empty()) {
            text += L"\n\n";
        }
        text += utf8_to_wide(detail);
    }

    std::wstring titleW = title ? utf8_to_wide(title) : L"";

    // Set icon based on type
    UINT uType = 0;
    switch (type) {
        case MSG_BOX_INFO:
            uType = MB_ICONINFORMATION;
            break;
        case MSG_BOX_WARNING:
            uType = MB_ICONWARNING;
            break;
        case MSG_BOX_ERROR:
            uType = MB_ICONERROR;
            break;
        case MSG_BOX_QUESTION:
            uType = MB_ICONQUESTION;
            break;
    }

    // Set buttons
    switch (buttons) {
        case MSG_BUTTONS_OK:
            uType |= MB_OK;
            break;
        case MSG_BUTTONS_OK_CANCEL:
            uType |= MB_OKCANCEL;
            break;
        case MSG_BUTTONS_YES_NO:
            uType |= MB_YESNO;
            break;
        case MSG_BUTTONS_YES_NO_CANCEL:
            uType |= MB_YESNOCANCEL;
            break;
    }

    int result = MessageBoxW((HWND)window, text.c_str(), titleW.c_str(), uType);

    // Map result
    switch (result) {
        case IDOK:
            return MSG_RESULT_OK;
        case IDCANCEL:
            return MSG_RESULT_CANCEL;
        case IDYES:
            return MSG_RESULT_YES;
        case IDNO:
            return MSG_RESULT_NO;
        default:
            return MSG_RESULT_CANCEL;
    }
}

} // extern "C"

#endif // _WIN32
