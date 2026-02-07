/**
 * Windows context menu (right-click menu) implementation using Win32 API + WebView2
 *
 * Uses ICoreWebView2_11::add_ContextMenuRequested to intercept right-click events
 * in the webview and display a native Win32 popup menu instead of the default
 * browser context menu.
 */

#ifdef _WIN32

#include "platform_context_menu.h"
#include <windows.h>
#include <webview2.h>
#include <string>
#include <vector>
#include <map>
#include <cstdio>
#include <atomic>
#include <functional>

#include "webview2_utils.h"

// ============================================================================
// Internal State
// ============================================================================

// Context menu item ID counter (separate from app menu IDs to avoid collisions)
static UINT g_ctxNextMenuId = 5000;

// Map context menu IDs to string IDs
static std::map<UINT, std::string> g_ctxMenuIdToStringId;
static std::map<std::string, UINT> g_ctxStringIdToMenuId;

// Store menu item data for updates
struct ContextMenuItemData {
    std::string id;
    std::string label;
    std::string accelerator;
    ContextMenuItemType type;
    bool enabled;
    bool checked;
    int submenu_count;
    std::vector<ContextMenuItemData> submenu_items;
};

static std::vector<ContextMenuItemData> g_ctxMenuItems;

// Callback storage
static platform_context_menu_callback_t g_ctxCallback = NULL;
static void* g_ctxUserData = NULL;

// WebView2 event registration token
static EventRegistrationToken g_ctxMenuToken = {0};
static ICoreWebView2_11* g_webview11 = NULL;
static HWND g_ctxWindow = NULL;

// Current popup menu handle (rebuilt each time context menu is set)
static HMENU g_ctxPopupMenu = NULL;

// ============================================================================
// Helper Functions
// ============================================================================

// Convert UTF-8 to wide string
static std::wstring ctx_utf8_to_wide(const char* str) {
    if (!str || strlen(str) == 0) return L"";
    int size = MultiByteToWideChar(CP_UTF8, 0, str, -1, NULL, 0);
    std::wstring result(size, 0);
    MultiByteToWideChar(CP_UTF8, 0, str, -1, &result[0], size);
    if (!result.empty() && result.back() == 0) result.pop_back();
    return result;
}

// Build accelerator text for display
static std::wstring ctx_buildAcceleratorText(const std::string& accelerator) {
    if (accelerator.empty()) return L"";
    std::wstring text = L"\t";
    std::string accel = accelerator;
    size_t pos;
    while ((pos = accel.find("CmdOrCtrl")) != std::string::npos) {
        accel.replace(pos, 9, "Ctrl");
    }
    return text + ctx_utf8_to_wide(accel.c_str());
}

// Register a context menu item ID
static UINT ctx_registerMenuItemId(const std::string& stringId) {
    auto it = g_ctxStringIdToMenuId.find(stringId);
    if (it != g_ctxStringIdToMenuId.end()) {
        return it->second;
    }
    UINT menuId = g_ctxNextMenuId++;
    g_ctxMenuIdToStringId[menuId] = stringId;
    g_ctxStringIdToMenuId[stringId] = menuId;
    return menuId;
}

// Build the Win32 popup menu from item data
static void ctx_addMenuItem(HMENU menu, const ContextMenuItemData& item) {
    if (item.type == CONTEXT_MENU_ITEM_SEPARATOR) {
        AppendMenuW(menu, MF_SEPARATOR, 0, NULL);
        return;
    }

    UINT menuId = ctx_registerMenuItemId(item.id);
    UINT flags = MF_STRING;

    // Build label with accelerator hint
    std::wstring label = ctx_utf8_to_wide(item.label.c_str());
    if (!item.accelerator.empty()) {
        label += ctx_buildAcceleratorText(item.accelerator);
    }

    if (!item.enabled) {
        flags |= MF_GRAYED;
    }

    if (item.type == CONTEXT_MENU_ITEM_CHECKBOX || item.type == CONTEXT_MENU_ITEM_RADIO) {
        if (item.checked) {
            flags |= MF_CHECKED;
        }
    }

    if (item.type == CONTEXT_MENU_ITEM_SUBMENU && !item.submenu_items.empty()) {
        HMENU submenu = CreatePopupMenu();
        for (const auto& subItem : item.submenu_items) {
            ctx_addMenuItem(submenu, subItem);
        }
        AppendMenuW(menu, MF_POPUP | flags, (UINT_PTR)submenu, label.c_str());
    } else {
        AppendMenuW(menu, flags, menuId, label.c_str());
    }
}

// Rebuild the popup menu from current item data
static void ctx_rebuildMenu() {
    if (g_ctxPopupMenu) {
        DestroyMenu(g_ctxPopupMenu);
    }
    g_ctxPopupMenu = CreatePopupMenu();
    for (const auto& item : g_ctxMenuItems) {
        ctx_addMenuItem(g_ctxPopupMenu, item);
    }
}

// ============================================================================
// JSON Parsing for Context Menu Items
// ============================================================================

// Simple JSON string extractor
static std::string ctx_extractJsonString(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\"";
    size_t keyPos = json.find(searchKey);
    if (keyPos == std::string::npos) return "";

    size_t colonPos = json.find(':', keyPos + searchKey.length());
    if (colonPos == std::string::npos) return "";

    // Skip whitespace
    size_t pos = colonPos + 1;
    while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\t')) pos++;

    if (pos >= json.length() || json[pos] != '"') return "";

    size_t start = pos + 1;
    size_t end = start;
    while (end < json.length() && json[end] != '"') {
        if (json[end] == '\\') end++; // Skip escaped characters
        end++;
    }

    return json.substr(start, end - start);
}

// Check if a JSON bool field is true
static bool ctx_extractJsonBool(const std::string& json, const std::string& key, bool defaultVal) {
    std::string searchKey = "\"" + key + "\"";
    size_t keyPos = json.find(searchKey);
    if (keyPos == std::string::npos) return defaultVal;

    size_t colonPos = json.find(':', keyPos + searchKey.length());
    if (colonPos == std::string::npos) return defaultVal;

    size_t pos = colonPos + 1;
    while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\t')) pos++;

    if (pos + 4 <= json.length() && json.substr(pos, 4) == "true") return true;
    if (pos + 5 <= json.length() && json.substr(pos, 5) == "false") return false;
    return defaultVal;
}

// Forward declaration
static std::vector<ContextMenuItemData> ctx_parseItemsArray(const std::string& json, size_t arrayStart);

// Parse a single menu item object
static ContextMenuItemData ctx_parseItemObject(const std::string& itemObj) {
    ContextMenuItemData data;

    data.id = ctx_extractJsonString(itemObj, "id");
    if (data.id.empty()) {
        data.id = "ctx_item_" + std::to_string(g_ctxNextMenuId + 1);
    }

    data.label = ctx_extractJsonString(itemObj, "label");
    data.accelerator = ctx_extractJsonString(itemObj, "accelerator");

    std::string typeStr = ctx_extractJsonString(itemObj, "type");
    if (typeStr == "separator") {
        data.type = CONTEXT_MENU_ITEM_SEPARATOR;
    } else if (typeStr == "checkbox") {
        data.type = CONTEXT_MENU_ITEM_CHECKBOX;
    } else if (typeStr == "radio") {
        data.type = CONTEXT_MENU_ITEM_RADIO;
    } else if (typeStr == "submenu") {
        data.type = CONTEXT_MENU_ITEM_SUBMENU;
    } else {
        data.type = CONTEXT_MENU_ITEM_NORMAL;
    }

    data.enabled = ctx_extractJsonBool(itemObj, "enabled", true);
    data.checked = ctx_extractJsonBool(itemObj, "checked", false);

    // Parse submenu if present
    size_t submenuPos = itemObj.find("\"submenu\"");
    if (submenuPos != std::string::npos) {
        size_t arrayStart = itemObj.find('[', submenuPos);
        if (arrayStart != std::string::npos) {
            data.submenu_items = ctx_parseItemsArray(itemObj, arrayStart);
            data.submenu_count = (int)data.submenu_items.size();
            if (data.submenu_count > 0) {
                data.type = CONTEXT_MENU_ITEM_SUBMENU;
            }
        }
    }

    return data;
}

// Parse a JSON array of menu items starting at arrayStart
static std::vector<ContextMenuItemData> ctx_parseItemsArray(const std::string& json, size_t arrayStart) {
    std::vector<ContextMenuItemData> items;

    size_t pos = arrayStart + 1; // Skip '['
    while (pos < json.length()) {
        // Skip whitespace and commas
        while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\n' ||
               json[pos] == '\r' || json[pos] == '\t' || json[pos] == ',')) pos++;

        if (pos >= json.length() || json[pos] == ']') break;

        if (json[pos] == '{') {
            // Find matching closing brace
            int braceCount = 1;
            size_t itemStart = pos;
            pos++;
            while (pos < json.length() && braceCount > 0) {
                if (json[pos] == '{') braceCount++;
                else if (json[pos] == '}') braceCount--;
                pos++;
            }

            std::string itemObj = json.substr(itemStart, pos - itemStart);
            items.push_back(ctx_parseItemObject(itemObj));
        } else {
            pos++;
        }
    }

    return items;
}

// ============================================================================
// WebView2 ContextMenuRequested Event Handler
// ============================================================================

class ContextMenuRequestedHandler : public CallbackHandlerBase<ICoreWebView2ContextMenuRequestedEventHandler> {
public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2ContextMenuRequestedEventHandler) {
            *ppv = static_cast<ICoreWebView2ContextMenuRequestedEventHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }

    HRESULT STDMETHODCALLTYPE Invoke(
        ICoreWebView2* sender,
        ICoreWebView2ContextMenuRequestedEventArgs* args) override
    {
        (void)sender;

        if (!g_ctxWindow || !g_ctxPopupMenu) return S_OK;

        // Suppress the default WebView2 context menu
        args->put_Handled(TRUE);

        // Get the location where the right-click occurred (in webview client coordinates)
        POINT location;
        args->get_Location(&location);

        // Convert client coordinates to screen coordinates
        POINT screenPt = location;
        ClientToScreen(g_ctxWindow, &screenPt);

        // Show our native popup menu
        // TPM_RETURNCMD makes TrackPopupMenu return the selected command ID
        SetForegroundWindow(g_ctxWindow);
        UINT result = TrackPopupMenu(g_ctxPopupMenu,
            TPM_LEFTALIGN | TPM_TOPALIGN | TPM_RETURNCMD | TPM_RIGHTBUTTON,
            screenPt.x, screenPt.y, 0, g_ctxWindow, NULL);

        if (result != 0) {
            auto it = g_ctxMenuIdToStringId.find(result);
            if (it != g_ctxMenuIdToStringId.end() && g_ctxCallback) {
                g_ctxCallback(it->second.c_str(), g_ctxUserData);
            }
        }

        // Required to dismiss the menu properly
        PostMessage(g_ctxWindow, WM_NULL, 0, 0);

        return S_OK;
    }
};

// ============================================================================
// Public API Implementation
// ============================================================================

// Helper to get ICoreWebView2* from the CDP state (avoids duplicating webview2 tracking)
extern "C" void* platform_cdp_get_webview2(void* webview_window);

extern "C" {

int platform_context_menu_set(void* window, void* webview_handle,
                              const char* items_json,
                              platform_context_menu_callback_t callback,
                              void* user_data) {
    if (!window || !items_json) return -1;

    HWND hwnd = (HWND)window;

    // Store callback and window
    g_ctxCallback = callback;
    g_ctxUserData = user_data;
    g_ctxWindow = hwnd;

    // Clear previous state
    g_ctxMenuIdToStringId.clear();
    g_ctxStringIdToMenuId.clear();
    g_ctxNextMenuId = 5000;
    g_ctxMenuItems.clear();

    // Parse the JSON items
    std::string json(items_json);

    // Find the array start
    size_t arrayStart = json.find('[');
    if (arrayStart == std::string::npos) return -1;

    g_ctxMenuItems = ctx_parseItemsArray(json, arrayStart);

    // Build the popup menu
    ctx_rebuildMenu();

    // Register WebView2 ContextMenuRequested handler if not already registered
    if (!g_webview11) {
        // Get the ICoreWebView2* from CDP state
        void* wv2 = platform_cdp_get_webview2(window);
        if (!wv2) {
            fprintf(stderr, "Context menu: Could not get ICoreWebView2 pointer\n");
            return -1;
        }

        ICoreWebView2* webview2 = (ICoreWebView2*)wv2;

        // Query for ICoreWebView2_11 which has ContextMenuRequested
        HRESULT hr = webview2->QueryInterface(IID_ICoreWebView2_11, (void**)&g_webview11);
        if (FAILED(hr) || !g_webview11) {
            fprintf(stderr, "Context menu: ICoreWebView2_11 not available (WebView2 version too old)\n");
            return -1;
        }

        // Register the ContextMenuRequested event handler
        auto handler = new ContextMenuRequestedHandler();
        hr = g_webview11->add_ContextMenuRequested(handler, &g_ctxMenuToken);
        handler->Release();

        if (FAILED(hr)) {
            fprintf(stderr, "Context menu: Failed to register ContextMenuRequested handler (hr=0x%lx)\n", hr);
            g_webview11->Release();
            g_webview11 = NULL;
            return -1;
        }

        fprintf(stderr, "Context menu: Registered WebView2 ContextMenuRequested handler\n");
    }

    fprintf(stderr, "Context menu: Set %zu items\n", g_ctxMenuItems.size());
    return 0;
}

int platform_context_menu_remove(void* window, void* webview_handle) {
    (void)webview_handle;

    // Remove the WebView2 event handler
    if (g_webview11) {
        g_webview11->remove_ContextMenuRequested(g_ctxMenuToken);
        g_webview11->Release();
        g_webview11 = NULL;
        g_ctxMenuToken = {0};
        fprintf(stderr, "Context menu: Removed WebView2 ContextMenuRequested handler\n");
    }

    // Clean up the popup menu
    if (g_ctxPopupMenu) {
        DestroyMenu(g_ctxPopupMenu);
        g_ctxPopupMenu = NULL;
    }

    // Clear state
    g_ctxMenuIdToStringId.clear();
    g_ctxStringIdToMenuId.clear();
    g_ctxMenuItems.clear();
    g_ctxNextMenuId = 5000;
    g_ctxCallback = NULL;
    g_ctxUserData = NULL;
    g_ctxWindow = NULL;

    return 0;
}

int platform_context_menu_update_item(const char* item_id,
                                      const char* label,
                                      int enabled, int checked) {
    if (!item_id) return -1;

    std::string targetId(item_id);

    // Recursive lambda to find and update item in the data structure
    std::function<bool(std::vector<ContextMenuItemData>&)> updateItem;
    updateItem = [&](std::vector<ContextMenuItemData>& items) -> bool {
        for (auto& item : items) {
            if (item.id == targetId) {
                if (label) item.label = label;
                if (enabled >= 0) item.enabled = (enabled != 0);
                if (checked >= 0) item.checked = (checked != 0);
                return true;
            }
            if (!item.submenu_items.empty()) {
                if (updateItem(item.submenu_items)) return true;
            }
        }
        return false;
    };

    if (!updateItem(g_ctxMenuItems)) return -1;

    // Rebuild the popup menu to reflect the changes
    g_ctxMenuIdToStringId.clear();
    g_ctxStringIdToMenuId.clear();
    g_ctxNextMenuId = 5000;
    ctx_rebuildMenu();

    return 0;
}

int platform_context_menu_show(void* window, int x, int y) {
    if (!window || !g_ctxPopupMenu) return -1;

    HWND hwnd = (HWND)window;

    // Convert client coordinates to screen coordinates
    POINT screenPt = {x, y};
    ClientToScreen(hwnd, &screenPt);

    SetForegroundWindow(hwnd);
    UINT result = TrackPopupMenu(g_ctxPopupMenu,
        TPM_LEFTALIGN | TPM_TOPALIGN | TPM_RETURNCMD | TPM_RIGHTBUTTON,
        screenPt.x, screenPt.y, 0, hwnd, NULL);

    if (result != 0) {
        auto it = g_ctxMenuIdToStringId.find(result);
        if (it != g_ctxMenuIdToStringId.end() && g_ctxCallback) {
            g_ctxCallback(it->second.c_str(), g_ctxUserData);
        }
    }

    PostMessage(hwnd, WM_NULL, 0, 0);
    return 0;
}

} // extern "C"

#endif // _WIN32
