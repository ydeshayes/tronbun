#include "webview/webview.h"
#include "platform/platform_window.h"
#include "platform/platform_child_view.h"
#include "platform/platform_screenshot.h"
#include "platform/platform_cdp.h"
#include "platform/platform_file_dialog.h"
#include "platform/platform_menu.h"
#include "common/ipc_common.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>

#ifdef TRONBUN_CUSTOM_SCHEME
#include "platform/virtual_fs.h"
#endif

// ============================================================================
// Child View Registry
// ============================================================================

#define MAX_CHILD_VIEWS 64
#define MAIN_VIEW_ID "main"

typedef struct {
    char id[256];
    void* platform_view;  // Platform-specific view handle
    int x, y, width, height;
    int visible;
} child_view_entry_t;

static child_view_entry_t g_child_views[MAX_CHILD_VIEWS];
static int g_child_view_count = 0;
static void* g_main_window = NULL;  // Cached main window handle

// Find child view by ID
static child_view_entry_t* find_child_view(const char* id) {
    for (int i = 0; i < g_child_view_count; i++) {
        if (strcmp(g_child_views[i].id, id) == 0) {
            return &g_child_views[i];
        }
    }
    return NULL;
}

// Add a child view to the registry
static child_view_entry_t* add_child_view(const char* id, void* platform_view,
                                          int x, int y, int width, int height) {
    if (g_child_view_count >= MAX_CHILD_VIEWS) {
        fprintf(stderr, "Maximum child views reached (%d)\n", MAX_CHILD_VIEWS);
        return NULL;
    }

    child_view_entry_t* entry = &g_child_views[g_child_view_count++];
    strncpy(entry->id, id, sizeof(entry->id) - 1);
    entry->id[sizeof(entry->id) - 1] = '\0';
    entry->platform_view = platform_view;
    entry->x = x;
    entry->y = y;
    entry->width = width;
    entry->height = height;
    entry->visible = 1;

    return entry;
}

// Remove a child view from the registry
static void remove_child_view(const char* id) {
    for (int i = 0; i < g_child_view_count; i++) {
        if (strcmp(g_child_views[i].id, id) == 0) {
            // Shift remaining entries
            for (int j = i; j < g_child_view_count - 1; j++) {
                g_child_views[j] = g_child_views[j + 1];
            }
            g_child_view_count--;
            return;
        }
    }
}

// Check if viewId refers to main view
static int is_main_view(const char* view_id) {
    return view_id == NULL || view_id[0] == '\0' || strcmp(view_id, MAIN_VIEW_ID) == 0;
}

#ifdef _WIN32
#include <windows.h>
#include <process.h>
#define THREAD_RETURN DWORD WINAPI
#define THREAD_ARG LPVOID
#define thread_create(func, arg) _beginthreadex(NULL, 0, (unsigned int (__stdcall *)(void *))func, arg, 0, NULL)
#define thread_sleep(ms) Sleep(ms)
// On Windows, pump the message loop
static void run_loop_step(int timeout_ms) {
    MSG msg;
    DWORD end_time = GetTickCount() + timeout_ms;
    while (GetTickCount() < end_time) {
        if (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        } else {
            Sleep(1);
        }
    }
}
#else
#include <pthread.h>
#include <unistd.h>
#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#endif
#define THREAD_RETURN void*
#define THREAD_ARG void*
#define thread_create(func, arg) do { pthread_t t; pthread_create(&t, NULL, func, arg); pthread_detach(t); } while(0)
#define thread_sleep(ms) usleep((ms) * 1000)
// On macOS, pump the run loop to allow async callbacks to execute
// This is implemented in Objective-C to properly handle GCD main queue blocks
#ifdef __APPLE__
#ifdef __cplusplus
extern "C" void macos_run_loop_step(int timeout_ms);
#else
extern void macos_run_loop_step(int timeout_ms);
#endif
#endif
static void run_loop_step(int timeout_ms) {
#ifdef __APPLE__
    macos_run_loop_step(timeout_ms);
#else
    // On Linux, just sleep (async callbacks may work differently)
    usleep(timeout_ms * 1000);
#endif
}
#endif

// Using IPC_IPC_MAX_COMMAND_LENGTH from ipc_common.h

typedef struct {
    webview_t webview;
    int should_exit;
} thread_context_t;

// Structure for dispatching commands to the main thread
typedef struct {
    webview_t webview;
    char* command;  // Dynamically allocated for large payloads
    int* response_ready;
} command_dispatch_t;

// Structure for bind callback data
typedef struct {
    webview_t webview;
    char callback_id[256];
    char request_data[IPC_MAX_COMMAND_LENGTH];
} bind_callback_data_t;

// Structure for screenshot callback context
typedef struct {
    char response_id[256];
    volatile int completed;
    char* base64_data;
    size_t data_length;
} screenshot_context_t;

// Structure for CDP callback context
typedef struct {
    char response_id[256];
    volatile int completed;
    char* result_json;
    char* error_msg;
} cdp_context_t;

// Structure for file dialog callback context
typedef struct {
    char response_id[256];
    volatile int completed;
    char* result_json;  // JSON array of paths, or NULL if cancelled
} file_dialog_context_t;

// Forward declarations
void execute_command_dispatch(webview_t w, void* arg);
void handle_bind_callback(const char *id, const char *req, void *arg);
void handle_invoke_callback(const char *id, const char *req, void *arg);
void screenshot_callback(const char* base64_data, size_t data_length, void* user_data);
void file_dialog_callback(const char* paths_json, void* user_data);
void cdp_result_callback(const char* result, const char* error, void* user_data);
void menu_click_callback(const char* menu_id, void* user_data);
void window_resize_callback(int width, int height, void* user_data);

// Screenshot callback implementation
void screenshot_callback(const char* base64_data, size_t data_length, void* user_data) {
    screenshot_context_t* ctx = (screenshot_context_t*)user_data;
    if (!ctx) return;

    if (base64_data && data_length > 0) {
        // Allocate and copy the data
        ctx->base64_data = (char*)malloc(data_length + 1);
        if (ctx->base64_data) {
            memcpy(ctx->base64_data, base64_data, data_length);
            ctx->base64_data[data_length] = '\0';
            ctx->data_length = data_length;
        }
    } else {
        ctx->base64_data = NULL;
        ctx->data_length = 0;
    }

    ctx->completed = 1;
}

// CDP result callback implementation
void cdp_result_callback(const char* result, const char* error, void* user_data) {
    cdp_context_t* ctx = (cdp_context_t*)user_data;
    if (!ctx) return;

    if (result) {
        ctx->result_json = strdup(result);
    } else {
        ctx->result_json = NULL;
    }

    if (error) {
        ctx->error_msg = strdup(error);
    } else {
        ctx->error_msg = NULL;
    }

    ctx->completed = 1;
}

// File dialog callback implementation
void file_dialog_callback(const char* paths_json, void* user_data) {
    file_dialog_context_t* ctx = (file_dialog_context_t*)user_data;
    if (!ctx) return;

    if (paths_json) {
        ctx->result_json = strdup(paths_json);
    } else {
        ctx->result_json = NULL;
    }

    ctx->completed = 1;
}

// Menu click callback implementation
void menu_click_callback(const char* menu_id, void* user_data) {
    (void)user_data;  // Unused
    if (!menu_id) return;

    // Emit menu click event to the TypeScript layer
    char event_data[512];
    snprintf(event_data, sizeof(event_data), "{\"menuId\":\"%s\"}", menu_id);
    ipc_write_event("menu_click", event_data);
}

// Window resize callback implementation
void window_resize_callback(int width, int height, void* user_data) {
    (void)user_data;  // Unused

    // Emit window resize event to the TypeScript layer
    char event_data[256];
    snprintf(event_data, sizeof(event_data), "{\"width\":%d,\"height\":%d}", width, height);
    ipc_write_event("window_resize", event_data);
}

// Bind callback handler
void handle_bind_callback(const char *id, const char *req, void *arg) {
    bind_callback_data_t* data = (bind_callback_data_t*)arg;
    
    // Write the callback result to stdout
    printf("{\"type\":\"bind_callback\",\"id\":\"%s\",\"seq\":\"%s\",\"req\":%s}\n", 
           data->callback_id, id, req);
    fflush(stdout);
    
    webview_return(data->webview, id, 0, "{\"status\":\"success\"}");
}

void handle_invoke_callback(const char *id, const char *req, void *arg) {
    fprintf(stderr, "Executing invoke callback: %s\n", req);
    
    bind_callback_data_t* data = (bind_callback_data_t*)arg;
    
    if (data == NULL) {
        fprintf(stderr, "Error: callback data is NULL\n");
        return;
    }
    
    
    // Write the callback result to stdout
    printf("{\"type\":\"ipc:call\",\"id\":\"%s\",\"seq\":\"%s\",\"req\":%s}\n", 
           data->callback_id, id, req);
    
    fflush(stdout);
}

// Function to be called on the main thread to execute commands
void execute_command_dispatch(webview_t w, void* arg) {
    (void)w; // Suppress unused parameter warning
    command_dispatch_t* cmd = (command_dispatch_t*)arg;
    char method[256], id[256];
    char* params = NULL;

    fprintf(stderr, "Executing command (%zu bytes)\n", strlen(cmd->command));

    if (!ipc_parse_command_alloc(cmd->command, method, id, &params)) {
        ipc_write_response("unknown", NULL, "Invalid command format");
        ipc_free_line(cmd->command);
        *cmd->response_ready = 1;
        free(cmd);
        return;
    }

    webview_error_t result = WEBVIEW_ERROR_OK;

    // Handle different webview methods
    if (strcmp(method, "set_title") == 0) {
        char title[512];
        ipc_extract_param_string(params, "title", title, sizeof(title));
        result = webview_set_title(cmd->webview, title);
        ipc_write_response(id, "true", NULL);

    } else if (strcmp(method, "set_size") == 0) {
        int width = 800, height = 600, hints = 0;
        ipc_extract_param_int(params, "width", &width);
        ipc_extract_param_int(params, "height", &height);
        ipc_extract_param_int(params, "hints", &hints);
        result = webview_set_size(cmd->webview, width, height, (webview_hint_t)hints);
        ipc_write_response(id, "true", NULL);

    } else if (strcmp(method, "navigate") == 0) {
        char url[4096];  // URLs can be long
        ipc_extract_param_string(params, "url", url, sizeof(url));
        fprintf(stderr, "[WebView] Navigate command received: %s\n", url);
        result = webview_navigate(cmd->webview, url);
        fprintf(stderr, "[WebView] Navigate result: %d\n", result);
        ipc_write_response(id, "true", NULL);

    } else if (strcmp(method, "set_html") == 0) {
        // Use dynamic allocation for potentially large HTML content
        char* html = ipc_extract_param_string_alloc(params, "html");
        if (html) {
            result = webview_set_html(cmd->webview, html);
            ipc_free_string(html);
        } else {
            result = webview_set_html(cmd->webview, "");
        }
        ipc_write_response(id, "true", NULL);

    } else if (strcmp(method, "eval") == 0) {
        // Use dynamic allocation for potentially large JavaScript
        char* js = ipc_extract_param_string_alloc(params, "js");
        if (js) {
            // Wrap the JavaScript to capture the result and send it back via __bunwebview_invoke
            // This uses the existing invoke mechanism with a special channel '__eval_result__'
            size_t wrapped_len = strlen(js) + 4096 + strlen(id) * 4;
            char* wrapped_js = (char*)malloc(wrapped_len);
            if (wrapped_js) {
                // Note: __bunwebview_invoke expects two arguments: (id, request)
                // We pass empty string for id since this is a send-style call (no response expected)
                // The request is a JSON string with channel and data
                snprintf(wrapped_js, wrapped_len,
                    "(function() {"
                    "  try {"
                    "    var __r__ = (function() { return (%s); })();"
                    "    if (__r__ && typeof __r__.then === 'function') {"
                    "      __r__.then(function(v) {"
                    "        window.__bunwebview_invoke('', JSON.stringify({channel:'__eval_result__',data:{id:'%s',result:v}}));"
                    "      }).catch(function(e) {"
                    "        window.__bunwebview_invoke('', JSON.stringify({channel:'__eval_result__',data:{id:'%s',error:e.message||String(e)}}));"
                    "      });"
                    "    } else {"
                    "      window.__bunwebview_invoke('', JSON.stringify({channel:'__eval_result__',data:{id:'%s',result:__r__}}));"
                    "    }"
                    "  } catch(e) {"
                    "    window.__bunwebview_invoke('', JSON.stringify({channel:'__eval_result__',data:{id:'%s',error:e.message||String(e)}}));"
                    "  }"
                    "})();",
                    js, id, id, id, id);
                result = webview_eval(cmd->webview, wrapped_js);
                free(wrapped_js);
            } else {
                result = webview_eval(cmd->webview, js);
                ipc_write_response(id, "null", NULL);
            }
            ipc_free_string(js);
        } else {
            result = WEBVIEW_ERROR_OK;
            ipc_write_response(id, "null", NULL);
        }
        // Note: Response is sent via __bunwebview_invoke callback mechanism

    } else if (strcmp(method, "init") == 0) {
        // Use dynamic allocation for potentially large init scripts
        char* js = ipc_extract_param_string_alloc(params, "js");
        if (js) {
            result = webview_init(cmd->webview, js);
            ipc_free_string(js);
        } else {
            result = WEBVIEW_ERROR_OK;
        }
        ipc_write_response(id, "true", NULL);

    } else if (strcmp(method, "bind") == 0) {
        char name[256];
        ipc_extract_param_string(params, "name", name, sizeof(name));
        
        // Create callback data
        bind_callback_data_t* callback_data = (bind_callback_data_t*)malloc(sizeof(bind_callback_data_t));
        callback_data->webview = cmd->webview;  
        strncpy(callback_data->callback_id, name, sizeof(callback_data->callback_id) - 1);
        callback_data->callback_id[sizeof(callback_data->callback_id) - 1] = '\0';
        
        result = webview_bind(cmd->webview, name, handle_bind_callback, callback_data);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "unbind") == 0) {
        char name[256];
        ipc_extract_param_string(params, "name", name, sizeof(name));
        result = webview_unbind(cmd->webview, name);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "terminate") == 0) {
        result = webview_terminate(cmd->webview);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "get_window") == 0) {
        void* window = webview_get_window(cmd->webview);
        char window_ptr[64];
        snprintf(window_ptr, sizeof(window_ptr), "%p", window);
        ipc_write_response(id, window_ptr, NULL);
        
    } else if (strcmp(method, "get_version") == 0) {
        const webview_version_info_t* version = webview_version();
        char version_str[256];
        snprintf(version_str, sizeof(version_str), 
                "{\"major\":%u,\"minor\":%u,\"patch\":%u,\"number\":\"%s\"}",
                version->version.major, version->version.minor, 
                version->version.patch, version->version_number);
        // For JSON responses, we need to handle raw JSON differently
        printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":%s}\n", id, version_str);
        fflush(stdout);
    } else if (strcmp(method, "ipc:response") == 0) {
        fprintf(stderr, "Executing ipc:response\n");
        char ipcId[256];
        ipc_extract_param_string(params, "id", ipcId, sizeof(ipcId));
        // Use dynamic allocation for potentially large results
        char* ipc_result = ipc_extract_param_json_alloc(params, "result");
        if (ipc_result) {
            fprintf(stderr, "Executing ipc:response with result\n");
            // For JSON responses, we need to handle raw JSON differently
            printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":%s}\n", id, ipc_result);
            fflush(stdout);
            webview_return(cmd->webview, ipcId, 0, ipc_result);
            ipc_free_string(ipc_result);
        } else {
            printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":null}\n", id);
            fflush(stdout);
            webview_return(cmd->webview, ipcId, 0, "null");
        }
    
    // Platform window control commands
    } else if (strcmp(method, "window_set_transparent") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_set_transparent(window);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_set_opaque") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_set_opaque(window);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_enable_blur") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_enable_blur(window);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_remove_decorations") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_remove_decorations(window);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_add_decorations") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_add_decorations(window);
        ipc_write_response(id, "true", NULL);
    } else if (strcmp(method, "window_set_always_on_top") == 0) {
        void* window = webview_get_window(cmd->webview);
        int on_top = 1;
        ipc_extract_param_int(params, "on_top", &on_top);
        platform_window_set_always_on_top(window, on_top);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_set_opacity") == 0) {
        void* window = webview_get_window(cmd->webview);
        float opacity = 1.0f;
        // Extract float parameter (using string first, then convert)
        char opacity_str[32];
        ipc_extract_param_string(params, "opacity", opacity_str, sizeof(opacity_str));
        if (strlen(opacity_str) > 0) {
            opacity = (float)atof(opacity_str);
        }
        platform_window_set_opacity(window, opacity);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_set_resizable") == 0) {
        void* window = webview_get_window(cmd->webview);
        int resizable = 1;
        ipc_extract_param_int(params, "resizable", &resizable);
        platform_window_set_resizable(window, resizable);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_set_position") == 0) {
        void* window = webview_get_window(cmd->webview);
        int x = 0, y = 0;
        ipc_extract_param_int(params, "x", &x);
        ipc_extract_param_int(params, "y", &y);
        platform_window_set_position(window, x, y);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_center") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_center(window);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_minimize") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_minimize(window);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_maximize") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_maximize(window);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_restore") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_restore(window);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_hide") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_hide(window);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_show") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_show(window);
        ipc_write_response(id, "true", NULL);

    } else if (strcmp(method, "window_get_size") == 0) {
        void* window = webview_get_window(cmd->webview);
        int width = 0, height = 0;
        platform_window_get_size(window, &width, &height);
        char result_json[128];
        snprintf(result_json, sizeof(result_json), "{\"width\":%d,\"height\":%d}", width, height);
        ipc_write_json_response(id, result_json, NULL);

    // ========================================================================
    // Child View Commands
    // ========================================================================

    } else if (strcmp(method, "create_child_view") == 0) {
        // Create a new child view embedded in the main window
        char child_id[256] = "";
        int x = 0, y = 0, width = 400, height = 300;
        int debug = 1;

        ipc_extract_param_string(params, "id", child_id, sizeof(child_id));
        ipc_extract_param_int(params, "x", &x);
        ipc_extract_param_int(params, "y", &y);
        ipc_extract_param_int(params, "width", &width);
        ipc_extract_param_int(params, "height", &height);
        ipc_extract_param_int(params, "debug", &debug);

        if (child_id[0] == '\0') {
            ipc_write_response(id, NULL, "Missing 'id' parameter");
        } else if (find_child_view(child_id) != NULL) {
            ipc_write_response(id, NULL, "Child view with this ID already exists");
        } else {
            // Cache main window handle if not already done
            if (g_main_window == NULL) {
                g_main_window = webview_get_window(cmd->webview);
            }

            child_view_bounds_t bounds = { x, y, width, height };
            void* platform_view = platform_create_child_view(g_main_window, debug, bounds);

            if (platform_view) {
                add_child_view(child_id, platform_view, x, y, width, height);
                platform_init_child_ipc(platform_view, child_id);
                ipc_write_response(id, "true", NULL);
                fprintf(stderr, "Created child view: %s\n", child_id);
            } else {
                ipc_write_response(id, NULL, "Failed to create child view");
            }
        }

    } else if (strcmp(method, "destroy_child_view") == 0) {
        // Destroy a child view
        char view_id[256] = "";
        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry) {
            platform_destroy_child_view(entry->platform_view);
            remove_child_view(view_id);
            ipc_write_response(id, "true", NULL);
            fprintf(stderr, "Destroyed child view: %s\n", view_id);
        } else {
            ipc_write_response(id, NULL, "Child view not found");
        }

    } else if (strcmp(method, "set_child_bounds") == 0) {
        // Update child view bounds
        char view_id[256] = "";
        int x = 0, y = 0, width = 400, height = 300;

        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));
        ipc_extract_param_int(params, "x", &x);
        ipc_extract_param_int(params, "y", &y);
        ipc_extract_param_int(params, "width", &width);
        ipc_extract_param_int(params, "height", &height);

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry) {
            entry->x = x;
            entry->y = y;
            entry->width = width;
            entry->height = height;

            child_view_bounds_t bounds = { x, y, width, height };
            platform_set_child_bounds(entry->platform_view, bounds);
            ipc_write_response(id, "true", NULL);
        } else {
            ipc_write_response(id, NULL, "Child view not found");
        }

    } else if (strcmp(method, "set_child_visible") == 0) {
        // Set child view visibility
        char view_id[256] = "";
        int visible = 1;

        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));
        ipc_extract_param_int(params, "visible", &visible);

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry) {
            entry->visible = visible;
            platform_set_child_visible(entry->platform_view, visible);
            ipc_write_response(id, "true", NULL);
        } else {
            ipc_write_response(id, NULL, "Child view not found");
        }

    } else if (strcmp(method, "bring_child_to_front") == 0) {
        // Bring child view to front
        char view_id[256] = "";
        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry) {
            if (g_main_window == NULL) {
                g_main_window = webview_get_window(cmd->webview);
            }
            platform_bring_child_to_front(g_main_window, entry->platform_view);
            ipc_write_response(id, "true", NULL);
        } else {
            ipc_write_response(id, NULL, "Child view not found");
        }

    } else if (strcmp(method, "send_child_to_back") == 0) {
        // Send child view to back
        char view_id[256] = "";
        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry) {
            if (g_main_window == NULL) {
                g_main_window = webview_get_window(cmd->webview);
            }
            platform_send_child_to_back(g_main_window, entry->platform_view);
            ipc_write_response(id, "true", NULL);
        } else {
            ipc_write_response(id, NULL, "Child view not found");
        }

    } else if (strcmp(method, "child_navigate") == 0) {
        // Navigate child view to URL
        char view_id[256] = "";
        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));
        char* url = ipc_extract_param_string_alloc(params, "url");

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry && url) {
            platform_child_navigate(entry->platform_view, url);
            ipc_write_response(id, "true", NULL);
        } else if (!entry) {
            ipc_write_response(id, NULL, "Child view not found");
        } else {
            ipc_write_response(id, NULL, "Missing URL parameter");
        }
        if (url) ipc_free_string(url);

    } else if (strcmp(method, "child_set_html") == 0) {
        // Set HTML content in child view
        char view_id[256] = "";
        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));
        char* html = ipc_extract_param_string_alloc(params, "html");

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry && html) {
            platform_child_set_html(entry->platform_view, html);
            ipc_write_response(id, "true", NULL);
        } else if (!entry) {
            ipc_write_response(id, NULL, "Child view not found");
        } else {
            ipc_write_response(id, NULL, "Missing HTML parameter");
        }
        if (html) ipc_free_string(html);

    } else if (strcmp(method, "child_eval") == 0) {
        // Execute JavaScript in child view
        char view_id[256] = "";
        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));
        char* js = ipc_extract_param_string_alloc(params, "js");

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry && js) {
            platform_child_eval(entry->platform_view, js);
            ipc_write_response(id, "true", NULL);
        } else if (!entry) {
            ipc_write_response(id, NULL, "Child view not found");
        } else {
            ipc_write_response(id, NULL, "Missing JS parameter");
        }
        if (js) ipc_free_string(js);

    } else if (strcmp(method, "child_init") == 0) {
        // Add initialization script to child view
        char view_id[256] = "";
        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));
        char* js = ipc_extract_param_string_alloc(params, "js");

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry && js) {
            platform_child_init(entry->platform_view, js);
            ipc_write_response(id, "true", NULL);
        } else if (!entry) {
            ipc_write_response(id, NULL, "Child view not found");
        } else {
            ipc_write_response(id, NULL, "Missing JS parameter");
        }
        if (js) ipc_free_string(js);

#ifdef TRONBUN_CUSTOM_SCHEME
    // Virtual file system commands for custom URL scheme
    } else if (strcmp(method, "virtual_fs_register") == 0) {
        // Register a file in the virtual file system
        char* path = ipc_extract_param_string_alloc(params, "path");
        char* content = ipc_extract_param_string_alloc(params, "content");

        fprintf(stderr, "[WebView] virtual_fs_register: path=%s, content_len=%zu\n", 
                path ? path : "(null)", content ? strlen(content) : 0);

        if (path && content) {
            int vfs_result = virtual_fs_register_file(path, content, strlen(content));
            fprintf(stderr, "[WebView] virtual_fs_register result: %d\n", vfs_result);
            if (vfs_result == 0) {
                ipc_write_response(id, "true", NULL);
            } else {
                ipc_write_response(id, NULL, "Failed to register file");
            }
        } else {
            fprintf(stderr, "[WebView] virtual_fs_register: missing params!\n");
            ipc_write_response(id, NULL, "Missing path or content parameter");
        }

        if (path) ipc_free_string(path);
        if (content) ipc_free_string(content);

    } else if (strcmp(method, "virtual_fs_clear") == 0) {
        // Clear all files from the virtual file system
        virtual_fs_clear();
        ipc_write_response(id, "true", NULL);
#endif

    // ========================================================================
    // Screenshot Command
    // ========================================================================

    } else if (strcmp(method, "screenshot") == 0) {
        // Take a screenshot of the main webview
        void* window = webview_get_window(cmd->webview);

        screenshot_context_t* screenshot_ctx = (screenshot_context_t*)malloc(sizeof(screenshot_context_t));
        if (screenshot_ctx) {
            strncpy(screenshot_ctx->response_id, id, sizeof(screenshot_ctx->response_id) - 1);
            screenshot_ctx->response_id[sizeof(screenshot_ctx->response_id) - 1] = '\0';
            screenshot_ctx->completed = 0;
            screenshot_ctx->base64_data = NULL;
            screenshot_ctx->data_length = 0;

            platform_take_screenshot(window, screenshot_callback, screenshot_ctx);

            // Wait for screenshot to complete (with timeout)
            // Use run_loop_step to pump the run loop, allowing async callbacks to execute
            int timeout_count = 0;
            while (!screenshot_ctx->completed && timeout_count < 500) {  // 5 second timeout
                run_loop_step(10);
                timeout_count++;
            }

            if (screenshot_ctx->completed && screenshot_ctx->base64_data) {
                // Send the base64 data as a quoted JSON string
                size_t response_size = screenshot_ctx->data_length + 3;  // quotes + null
                char* quoted_response = (char*)malloc(response_size);
                if (quoted_response) {
                    snprintf(quoted_response, response_size, "\"%s\"", screenshot_ctx->base64_data);
                    ipc_write_json_response(id, quoted_response, NULL);
                    free(quoted_response);
                } else {
                    ipc_write_response(id, NULL, "Failed to allocate response buffer");
                }
                free(screenshot_ctx->base64_data);
            } else {
                ipc_write_response(id, NULL, "Screenshot capture failed or timed out");
            }
            free(screenshot_ctx);
        } else {
            ipc_write_response(id, NULL, "Failed to allocate screenshot context");
        }

    } else if (strcmp(method, "child_screenshot") == 0) {
        // Take a screenshot of a child view
        char view_id[256] = "";
        ipc_extract_param_string(params, "viewId", view_id, sizeof(view_id));

        child_view_entry_t* entry = find_child_view(view_id);
        if (entry) {
            screenshot_context_t* screenshot_ctx = (screenshot_context_t*)malloc(sizeof(screenshot_context_t));
            if (screenshot_ctx) {
                strncpy(screenshot_ctx->response_id, id, sizeof(screenshot_ctx->response_id) - 1);
                screenshot_ctx->response_id[sizeof(screenshot_ctx->response_id) - 1] = '\0';
                screenshot_ctx->completed = 0;
                screenshot_ctx->base64_data = NULL;
                screenshot_ctx->data_length = 0;

                platform_child_take_screenshot(entry->platform_view, screenshot_callback, screenshot_ctx);

                // Wait for screenshot to complete (pump run loop for async callbacks)
                int timeout_count = 0;
                while (!screenshot_ctx->completed && timeout_count < 500) {
                    run_loop_step(10);
                    timeout_count++;
                }

                if (screenshot_ctx->completed && screenshot_ctx->base64_data) {
                    size_t response_size = screenshot_ctx->data_length + 3;
                    char* quoted_response = (char*)malloc(response_size);
                    if (quoted_response) {
                        snprintf(quoted_response, response_size, "\"%s\"", screenshot_ctx->base64_data);
                        ipc_write_json_response(id, quoted_response, NULL);
                        free(quoted_response);
                    } else {
                        ipc_write_response(id, NULL, "Failed to allocate response buffer");
                    }
                    free(screenshot_ctx->base64_data);
                } else {
                    ipc_write_response(id, NULL, "Screenshot capture failed or timed out");
                }
                free(screenshot_ctx);
            } else {
                ipc_write_response(id, NULL, "Failed to allocate screenshot context");
            }
        } else {
            ipc_write_response(id, NULL, "Child view not found");
        }

    // ========================================================================
    // CDP (Chrome DevTools Protocol) Commands
    // ========================================================================

    } else if (strcmp(method, "cdp_call") == 0) {
        // Call a CDP method
        char cdp_method[256] = "";
        char* cdp_params = NULL;

        ipc_extract_param_string(params, "method", cdp_method, sizeof(cdp_method));
        cdp_params = ipc_extract_param_json_alloc(params, "params");

        void* window = webview_get_window(cmd->webview);

        cdp_context_t* cdp_ctx = (cdp_context_t*)malloc(sizeof(cdp_context_t));
        if (cdp_ctx) {
            strncpy(cdp_ctx->response_id, id, sizeof(cdp_ctx->response_id) - 1);
            cdp_ctx->response_id[sizeof(cdp_ctx->response_id) - 1] = '\0';
            cdp_ctx->completed = 0;
            cdp_ctx->result_json = NULL;
            cdp_ctx->error_msg = NULL;

            platform_cdp_call(window, cdp_method, cdp_params ? cdp_params : "{}", cdp_result_callback, cdp_ctx);

            // Wait for CDP call to complete
            int timeout_count = 0;
            while (!cdp_ctx->completed && timeout_count < 1000) {  // 10 second timeout
                run_loop_step(10);
                timeout_count++;
            }

            if (cdp_ctx->completed) {
                if (cdp_ctx->result_json) {
                    // Result is already JSON, send it raw
                    printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":%s}\n", id, cdp_ctx->result_json);
                    fflush(stdout);
                    free(cdp_ctx->result_json);
                } else if (cdp_ctx->error_msg) {
                    ipc_write_response(id, NULL, cdp_ctx->error_msg);
                    free(cdp_ctx->error_msg);
                } else {
                    ipc_write_response(id, "{}", NULL);
                }
            } else {
                ipc_write_response(id, NULL, "CDP call timed out");
            }
            free(cdp_ctx);
        } else {
            ipc_write_response(id, NULL, "Failed to allocate CDP context");
        }

        if (cdp_params) ipc_free_string(cdp_params);

    } else if (strcmp(method, "cdp_get_cookies") == 0) {
        // Get cookies
        char url[4096] = "";
        ipc_extract_param_string(params, "url", url, sizeof(url));

        void* window = webview_get_window(cmd->webview);

        cdp_context_t* cdp_ctx = (cdp_context_t*)malloc(sizeof(cdp_context_t));
        if (cdp_ctx) {
            cdp_ctx->completed = 0;
            cdp_ctx->result_json = NULL;
            cdp_ctx->error_msg = NULL;

            platform_cdp_get_cookies(window, url[0] ? url : NULL, cdp_result_callback, cdp_ctx);

            int timeout_count = 0;
            while (!cdp_ctx->completed && timeout_count < 500) {
                run_loop_step(10);
                timeout_count++;
            }

            if (cdp_ctx->completed && cdp_ctx->result_json) {
                printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":%s}\n", id, cdp_ctx->result_json);
                fflush(stdout);
                free(cdp_ctx->result_json);
            } else {
                ipc_write_response(id, NULL, cdp_ctx->error_msg ? cdp_ctx->error_msg : "Failed to get cookies");
            }
            if (cdp_ctx->error_msg) free(cdp_ctx->error_msg);
            free(cdp_ctx);
        }

    } else if (strcmp(method, "cdp_set_cookie") == 0) {
        // Set a cookie
        char* cookie_json = ipc_extract_param_json_alloc(params, "cookie");
        void* window = webview_get_window(cmd->webview);

        cdp_context_t* cdp_ctx = (cdp_context_t*)malloc(sizeof(cdp_context_t));
        if (cdp_ctx && cookie_json) {
            cdp_ctx->completed = 0;
            cdp_ctx->result_json = NULL;
            cdp_ctx->error_msg = NULL;

            platform_cdp_set_cookie(window, cookie_json, cdp_result_callback, cdp_ctx);

            int timeout_count = 0;
            while (!cdp_ctx->completed && timeout_count < 500) {
                run_loop_step(10);
                timeout_count++;
            }

            if (cdp_ctx->completed) {
                ipc_write_response(id, "true", NULL);
            } else {
                ipc_write_response(id, NULL, "Failed to set cookie");
            }
            free(cdp_ctx);
        } else {
            ipc_write_response(id, NULL, "Missing cookie parameter");
        }
        if (cookie_json) ipc_free_string(cookie_json);

    } else if (strcmp(method, "cdp_delete_cookies") == 0) {
        // Delete cookies
        char name[256] = "";
        char url[4096] = "";
        char domain[256] = "";

        ipc_extract_param_string(params, "name", name, sizeof(name));
        ipc_extract_param_string(params, "url", url, sizeof(url));
        ipc_extract_param_string(params, "domain", domain, sizeof(domain));

        void* window = webview_get_window(cmd->webview);

        cdp_context_t* cdp_ctx = (cdp_context_t*)malloc(sizeof(cdp_context_t));
        if (cdp_ctx) {
            cdp_ctx->completed = 0;
            cdp_ctx->result_json = NULL;
            cdp_ctx->error_msg = NULL;

            platform_cdp_delete_cookies(window, name, url[0] ? url : NULL, domain[0] ? domain : NULL,
                                        cdp_result_callback, cdp_ctx);

            int timeout_count = 0;
            while (!cdp_ctx->completed && timeout_count < 500) {
                run_loop_step(10);
                timeout_count++;
            }

            ipc_write_response(id, "true", NULL);
            free(cdp_ctx);
        }

    } else if (strcmp(method, "cdp_print_to_pdf") == 0) {
        // Print page to PDF
        char* options_json = ipc_extract_param_json_alloc(params, "options");
        void* window = webview_get_window(cmd->webview);

        cdp_context_t* cdp_ctx = (cdp_context_t*)malloc(sizeof(cdp_context_t));
        if (cdp_ctx) {
            cdp_ctx->completed = 0;
            cdp_ctx->result_json = NULL;
            cdp_ctx->error_msg = NULL;

            platform_cdp_print_to_pdf(window, options_json, cdp_result_callback, cdp_ctx);

            int timeout_count = 0;
            while (!cdp_ctx->completed && timeout_count < 3000) {  // 30 second timeout for PDF
                run_loop_step(10);
                timeout_count++;
            }

            if (cdp_ctx->completed && cdp_ctx->result_json) {
                printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":%s}\n", id, cdp_ctx->result_json);
                fflush(stdout);
                free(cdp_ctx->result_json);
            } else {
                ipc_write_response(id, NULL, cdp_ctx->error_msg ? cdp_ctx->error_msg : "PDF generation failed");
            }
            if (cdp_ctx->error_msg) free(cdp_ctx->error_msg);
            free(cdp_ctx);
        }
        if (options_json) ipc_free_string(options_json);

    } else if (strcmp(method, "cdp_mouse_event") == 0) {
        // Dispatch mouse event
        char type[32] = "mouseMoved";
        char button[16] = "left";
        int x = 0, y = 0, click_count = 1;

        ipc_extract_param_string(params, "type", type, sizeof(type));
        ipc_extract_param_string(params, "button", button, sizeof(button));
        ipc_extract_param_int(params, "x", &x);
        ipc_extract_param_int(params, "y", &y);
        ipc_extract_param_int(params, "clickCount", &click_count);

        void* window = webview_get_window(cmd->webview);

        cdp_context_t* cdp_ctx = (cdp_context_t*)malloc(sizeof(cdp_context_t));
        if (cdp_ctx) {
            cdp_ctx->completed = 0;
            cdp_ctx->result_json = NULL;
            cdp_ctx->error_msg = NULL;

            platform_cdp_dispatch_mouse_event(window, type, x, y, button, click_count,
                                              cdp_result_callback, cdp_ctx);

            int timeout_count = 0;
            while (!cdp_ctx->completed && timeout_count < 100) {
                run_loop_step(10);
                timeout_count++;
            }

            ipc_write_response(id, "true", NULL);
            free(cdp_ctx);
        }

    } else if (strcmp(method, "cdp_key_event") == 0) {
        // Dispatch key event
        char type[32] = "keyDown";
        char key[64] = "";
        int modifiers = 0;

        ipc_extract_param_string(params, "type", type, sizeof(type));
        ipc_extract_param_string(params, "key", key, sizeof(key));
        ipc_extract_param_int(params, "modifiers", &modifiers);

        void* window = webview_get_window(cmd->webview);

        cdp_context_t* cdp_ctx = (cdp_context_t*)malloc(sizeof(cdp_context_t));
        if (cdp_ctx) {
            cdp_ctx->completed = 0;
            cdp_ctx->result_json = NULL;
            cdp_ctx->error_msg = NULL;

            platform_cdp_dispatch_key_event(window, type, key, modifiers, cdp_result_callback, cdp_ctx);

            int timeout_count = 0;
            while (!cdp_ctx->completed && timeout_count < 100) {
                run_loop_step(10);
                timeout_count++;
            }

            ipc_write_response(id, "true", NULL);
            free(cdp_ctx);
        }

    } else if (strcmp(method, "cdp_insert_text") == 0) {
        // Insert text
        char* text = ipc_extract_param_string_alloc(params, "text");
        void* window = webview_get_window(cmd->webview);

        cdp_context_t* cdp_ctx = (cdp_context_t*)malloc(sizeof(cdp_context_t));
        if (cdp_ctx && text) {
            cdp_ctx->completed = 0;
            cdp_ctx->result_json = NULL;
            cdp_ctx->error_msg = NULL;

            platform_cdp_insert_text(window, text, cdp_result_callback, cdp_ctx);

            int timeout_count = 0;
            while (!cdp_ctx->completed && timeout_count < 100) {
                run_loop_step(10);
                timeout_count++;
            }

            ipc_write_response(id, "true", NULL);
            free(cdp_ctx);
        }
        if (text) ipc_free_string(text);

    // ========================================================================
    // File Dialog Commands
    // ========================================================================

    } else if (strcmp(method, "open_file_dialog") == 0) {
        // Open a file picker dialog
        char title[256] = "";
        char* filters_json = NULL;
        int allow_multiple = 0;

        ipc_extract_param_string(params, "title", title, sizeof(title));
        filters_json = ipc_extract_param_json_alloc(params, "filters");
        ipc_extract_param_int(params, "allowMultiple", &allow_multiple);

        void* window = webview_get_window(cmd->webview);

        file_dialog_context_t* dialog_ctx = (file_dialog_context_t*)malloc(sizeof(file_dialog_context_t));
        if (dialog_ctx) {
            dialog_ctx->completed = 0;
            dialog_ctx->result_json = NULL;

            platform_open_file_dialog(window, title[0] ? title : NULL, filters_json,
                                      allow_multiple, file_dialog_callback, dialog_ctx);

            // Wait for dialog to complete (with timeout)
            int timeout_count = 0;
            while (!dialog_ctx->completed && timeout_count < 30000) {  // 5 minute timeout for user interaction
                run_loop_step(10);
                timeout_count++;
            }

            if (dialog_ctx->completed && dialog_ctx->result_json) {
                // Return the array of paths
                ipc_write_json_response(id, dialog_ctx->result_json, NULL);
                free(dialog_ctx->result_json);
            } else {
                // User cancelled or timeout - return null
                ipc_write_json_response(id, "null", NULL);
            }
            free(dialog_ctx);
        } else {
            ipc_write_response(id, NULL, "Failed to allocate dialog context");
        }
        if (filters_json) ipc_free_string(filters_json);

    } else if (strcmp(method, "save_file_dialog") == 0) {
        // Open a save file dialog
        char title[256] = "";
        char default_name[256] = "";
        char* filters_json = NULL;

        ipc_extract_param_string(params, "title", title, sizeof(title));
        ipc_extract_param_string(params, "defaultName", default_name, sizeof(default_name));
        filters_json = ipc_extract_param_json_alloc(params, "filters");

        void* window = webview_get_window(cmd->webview);

        file_dialog_context_t* dialog_ctx = (file_dialog_context_t*)malloc(sizeof(file_dialog_context_t));
        if (dialog_ctx) {
            dialog_ctx->completed = 0;
            dialog_ctx->result_json = NULL;

            platform_save_file_dialog(window, title[0] ? title : NULL,
                                      default_name[0] ? default_name : NULL,
                                      filters_json, file_dialog_callback, dialog_ctx);

            int timeout_count = 0;
            while (!dialog_ctx->completed && timeout_count < 30000) {
                run_loop_step(10);
                timeout_count++;
            }

            if (dialog_ctx->completed && dialog_ctx->result_json) {
                ipc_write_json_response(id, dialog_ctx->result_json, NULL);
                free(dialog_ctx->result_json);
            } else {
                ipc_write_json_response(id, "null", NULL);
            }
            free(dialog_ctx);
        } else {
            ipc_write_response(id, NULL, "Failed to allocate dialog context");
        }
        if (filters_json) ipc_free_string(filters_json);

    } else if (strcmp(method, "open_folder_dialog") == 0) {
        // Open a folder picker dialog
        char title[256] = "";
        ipc_extract_param_string(params, "title", title, sizeof(title));

        void* window = webview_get_window(cmd->webview);

        file_dialog_context_t* dialog_ctx = (file_dialog_context_t*)malloc(sizeof(file_dialog_context_t));
        if (dialog_ctx) {
            dialog_ctx->completed = 0;
            dialog_ctx->result_json = NULL;

            platform_open_folder_dialog(window, title[0] ? title : NULL,
                                        file_dialog_callback, dialog_ctx);

            int timeout_count = 0;
            while (!dialog_ctx->completed && timeout_count < 30000) {
                run_loop_step(10);
                timeout_count++;
            }

            if (dialog_ctx->completed && dialog_ctx->result_json) {
                ipc_write_json_response(id, dialog_ctx->result_json, NULL);
                free(dialog_ctx->result_json);
            } else {
                ipc_write_json_response(id, "null", NULL);
            }
            free(dialog_ctx);
        } else {
            ipc_write_response(id, NULL, "Failed to allocate dialog context");
        }

    } else if (strcmp(method, "message_box") == 0) {
        // Show a message box dialog
        char title[256] = "";
        char message[1024] = "";
        char detail[1024] = "";
        int type = 0;  // MSG_BOX_INFO
        int buttons = 0;  // MSG_BUTTONS_OK

        ipc_extract_param_string(params, "title", title, sizeof(title));
        ipc_extract_param_string(params, "message", message, sizeof(message));
        ipc_extract_param_string(params, "detail", detail, sizeof(detail));
        ipc_extract_param_int(params, "type", &type);
        ipc_extract_param_int(params, "buttons", &buttons);

        void* window = webview_get_window(cmd->webview);

        MessageBoxResult msgResult = platform_message_box(
            window,
            (MessageBoxType)type,
            (MessageBoxButtons)buttons,
            title[0] ? title : NULL,
            message[0] ? message : NULL,
            detail[0] ? detail : NULL
        );

        // Return result as JSON object
        char result_json[64];
        const char* result_str;
        switch (msgResult) {
            case MSG_RESULT_OK: result_str = "ok"; break;
            case MSG_RESULT_CANCEL: result_str = "cancel"; break;
            case MSG_RESULT_YES: result_str = "yes"; break;
            case MSG_RESULT_NO: result_str = "no"; break;
            default: result_str = "cancel"; break;
        }
        snprintf(result_json, sizeof(result_json), "{\"result\":\"%s\"}", result_str);
        ipc_write_json_response(id, result_json, NULL);

    // ========================================================================
    // Application Menu Commands
    // ========================================================================

    } else if (strcmp(method, "set_menu") == 0) {
        // Set application menu from JSON
        char* menu_json = ipc_extract_param_json_alloc(params, "menus");

        void* window = webview_get_window(cmd->webview);

        if (menu_json && strlen(menu_json) > 0) {
            int menu_result = platform_menu_set_from_json(window, menu_json, menu_click_callback, NULL);
            if (menu_result == 0) {
                ipc_write_response(id, "true", NULL);
            } else {
                ipc_write_response(id, NULL, "Failed to set menu");
            }
        } else {
            ipc_write_response(id, NULL, "Missing or invalid menu JSON");
        }

        if (menu_json) ipc_free_string(menu_json);

    } else if (strcmp(method, "set_default_menu") == 0) {
        // Set default application menu
        char app_name[256] = "";
        ipc_extract_param_string(params, "appName", app_name, sizeof(app_name));

        void* window = webview_get_window(cmd->webview);

        int menu_result = platform_menu_set_default(window,
            app_name[0] ? app_name : "Application",
            menu_click_callback, NULL);

        if (menu_result == 0) {
            ipc_write_response(id, "true", NULL);
        } else {
            ipc_write_response(id, NULL, "Failed to set default menu");
        }

    } else if (strcmp(method, "remove_menu") == 0) {
        // Remove application menu
        void* window = webview_get_window(cmd->webview);

        int menu_result = platform_menu_remove(window);

        if (menu_result == 0) {
            ipc_write_response(id, "true", NULL);
        } else {
            ipc_write_response(id, NULL, "Failed to remove menu");
        }

    } else if (strcmp(method, "update_menu_item") == 0) {
        // Update a specific menu item
        char item_id[256] = "";
        char label[256] = "";
        int enabled = -1;
        int checked = -1;

        ipc_extract_param_string(params, "itemId", item_id, sizeof(item_id));
        ipc_extract_param_string(params, "label", label, sizeof(label));
        ipc_extract_param_int(params, "enabled", &enabled);
        ipc_extract_param_int(params, "checked", &checked);

        void* window = webview_get_window(cmd->webview);

        int menu_result = platform_menu_update_item(window, item_id,
            label[0] ? label : NULL, enabled, checked);

        if (menu_result == 0) {
            ipc_write_response(id, "true", NULL);
        } else {
            ipc_write_response(id, NULL, "Failed to update menu item");
        }

    } else if (strcmp(method, "popup_menu") == 0) {
        // Show context menu at position
        char* items_json = ipc_extract_param_json_alloc(params, "items");
        int x = 0, y = 0;
        ipc_extract_param_int(params, "x", &x);
        ipc_extract_param_int(params, "y", &y);

        void* window = webview_get_window(cmd->webview);

        // For now, we use the JSON API for popup menus
        // The native function expects platform_menu_item_t array, but we can parse JSON
        if (items_json && strlen(items_json) > 0) {
            // Simplified: create a temporary menu and show it
            // In production, we'd parse the JSON to platform_menu_item_t
            // For now, return success and emit click events via callback
            ipc_write_response(id, "true", NULL);
        } else {
            ipc_write_response(id, NULL, "Missing or invalid items JSON");
        }

        if (items_json) ipc_free_string(items_json);

    } else {
        ipc_write_response(id, NULL, "Unknown method");
    }

    if (result != WEBVIEW_ERROR_OK) {
        char error_msg[256];
        snprintf(error_msg, sizeof(error_msg), "WebView error: %d", result);
        ipc_write_response(id, NULL, error_msg);
    }

    // Free dynamically allocated memory
    ipc_free_string(params);
    ipc_free_line(cmd->command);
    *cmd->response_ready = 1;
    free(cmd);
}

// Thread function that monitors stdin for commands
THREAD_RETURN stdin_monitor_thread(THREAD_ARG arg) {
    thread_context_t* context = (thread_context_t*)arg;

    fprintf(stderr, "Command monitor thread started (reading from stdin with dynamic buffers)\n");

    while (!context->should_exit) {
        // Read command from stdin with dynamic allocation
        size_t command_length = 0;
        char* command_buffer = ipc_read_line(stdin, &command_length);

        if (command_buffer != NULL) {
            if (command_length > 0) {
                fprintf(stderr, "New command detected (%zu bytes)\n", command_length);

                // Create command dispatch structure
                command_dispatch_t* cmd = (command_dispatch_t*)malloc(sizeof(command_dispatch_t));
                if (cmd != NULL) {
                    cmd->webview = context->webview;
                    cmd->command = command_buffer;  // Transfer ownership

                    int response_ready = 0;
                    cmd->response_ready = &response_ready;

                    // Dispatch the command to the main thread
                    webview_dispatch(context->webview, execute_command_dispatch, cmd);

                    // Wait for response (with timeout)
                    int timeout_count = 0;
                    while (!response_ready && timeout_count < 100) {
                        thread_sleep(10);
                        timeout_count++;
                    }

                    if (!response_ready) {
                        ipc_write_response("unknown", NULL, "Command timeout");
                    }
                } else {
                    ipc_free_line(command_buffer);
                }
            } else {
                ipc_free_line(command_buffer);
            }
        } else {
            // EOF or error on stdin
            fprintf(stderr, "stdin closed, exiting command monitor\n");
            context->should_exit = 1;
            webview_terminate(context->webview);
            break;
        }
    }

    fprintf(stderr, "Command monitor thread exiting\n");
    return 0;
}

#ifdef _WIN32
int WINAPI WinMain(HINSTANCE hInst, HINSTANCE hPrevInst, LPSTR lpCmdLine, int nCmdShow) {
    (void)hInst; (void)hPrevInst; (void)lpCmdLine; (void)nCmdShow;
#else
int main(void) {
#endif
    // Disable buffering for stderr to ensure immediate output
    setvbuf(stderr, NULL, _IONBF, 0);
    
    fprintf(stderr, "[WebView] BUILD VERSION: 2026-02-03-DEBUG\n");
    fprintf(stderr, "[WebView] Starting WebView with stdin/stdout IPC...\n");
#ifdef TRONBUN_CUSTOM_SCHEME
    fprintf(stderr, "[WebView] Custom scheme support: ENABLED\n");
#else
    fprintf(stderr, "[WebView] Custom scheme support: DISABLED\n");
#endif
    
    // Create webview
    webview_t w = webview_create(1, NULL); // debug=1 for development
    if (w == NULL) {
        fprintf(stderr, "Failed to create webview\n");
        return 1;
    }
    
    // Set initial properties
    webview_set_title(w, "Tronbun default title");
    webview_set_size(w, 800, 600, WEBVIEW_HINT_NONE);
    
    webview_init(w,
      "(function() {"
        // Create the BunWebView IPC API
        "window.tronbun = {"
          "invoke: function(channel, data) {"
            "return new Promise(function(resolve, reject) {"
              "var id = Math.random().toString(36).substring(2);"
              "window._bunwebview_pending = window._bunwebview_pending || {};"
              "window._bunwebview_pending[id] = { resolve: resolve, reject: reject };"
              
              // Use the bound native function
              "var request = JSON.stringify({"
                "type: 'invoke',"
                "channel: channel,"
                "data: data,"
                "id: id"
              "});"

              "console.log('Sending invoke request:', request);"
              
              "resolve(__bunwebview_invoke(id, request));"
            "});"
          "},"
          "send: function(channel, data) {"
            "var request = JSON.stringify({"
              "type: 'send',"
              "channel: channel,"
              "data: data"
            "});"
            
            "__bunwebview_invoke('', request);"
          "}"
        "};"
        
        // Function to receive messages from native
        "window.bunwebview_receive = function(message) {"
          "try {"
            "var data = JSON.parse(message);"
            "if (data.type === 'ipc:response' && data.id) {"
              "var pending = window._bunwebview_pending && window._bunwebview_pending[data.id];"
              "if (pending) {"
                "delete window._bunwebview_pending[data.id];"
                "pending.resolve(data.result);"
              "}"
            "} else if (data.type === 'ipc:error' && data.id) {"
              "var pending = window._bunwebview_pending && window._bunwebview_pending[data.id];"
              "if (pending) {"
                "delete window._bunwebview_pending[data.id];"
                "pending.reject(new Error(data.error));"
              "}"
            "}"
          "} catch (e) {"
            "console.error('Failed to process IPC message:', e);"
          "}"
        "};"
        
        "console.log('BunWebView IPC bridge initialized (thread-safe)');"
      "})();"
    );

    // Create callback data for the invoke handler
    bind_callback_data_t* invoke_callback_data = (bind_callback_data_t*)malloc(sizeof(bind_callback_data_t));
    invoke_callback_data->webview = w;
    strncpy(invoke_callback_data->callback_id, "__bunwebview_invoke", sizeof(invoke_callback_data->callback_id) - 1);
    invoke_callback_data->callback_id[sizeof(invoke_callback_data->callback_id) - 1] = '\0';
    
    webview_bind(w, "__bunwebview_invoke", handle_invoke_callback, invoke_callback_data);

    // Register resize callback to emit events when window is resized
    void* main_window = webview_get_window(w);
    if (main_window) {
        platform_window_register_resize_callback(main_window, window_resize_callback, NULL);
        fprintf(stderr, "Window resize callback registered\n");
    }

    // Set up thread context
    thread_context_t context;
    context.webview = w;
    context.should_exit = 0;
    
    // Start the stdin monitoring thread
    thread_create(stdin_monitor_thread, &context);
    
    fprintf(stderr, "WebView created with stdin/stdout IPC, starting main loop...\n");
    fprintf(stderr, "Send JSON commands to stdin to control the webview.\n");
    fprintf(stderr, "Example: {\"method\":\"set_title\",\"id\":\"1\",\"params\":{\"title\":\"New Title\"}}\n");
    
    // Run the webview (this blocks until the window is closed)
    webview_error_t result = webview_run(w);
    
    fprintf(stderr, "Webview closed, cleaning up...\n");
    
    // Signal the thread to exit
    context.should_exit = 1;
    
    // Give the thread time to exit gracefully
    thread_sleep(200);
    
    // Clean up
    webview_destroy(w);
    
    fprintf(stderr, "Cleanup complete. Exit code: %d\n", result);
    return result;
} 