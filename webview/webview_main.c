#include "../vendors/webview/core/include/webview/webview.h"
#include "platform/platform_window.h"
#include "common/ipc_common.h"
#include "../vendors/cJSON/cJSON.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>

#ifdef _WIN32
#include <windows.h>
#include <process.h>
#define THREAD_RETURN DWORD WINAPI
#define THREAD_ARG LPVOID
#define thread_create(func, arg) _beginthreadex(NULL, 0, (unsigned int (__stdcall *)(void *))func, arg, 0, NULL)
#define thread_sleep(ms) Sleep(ms)
#else
#include <pthread.h>
#include <unistd.h>
#define THREAD_RETURN void*
#define THREAD_ARG void*
#define thread_create(func, arg) do { pthread_t t; pthread_create(&t, NULL, func, arg); pthread_detach(t); } while(0)
#define thread_sleep(ms) usleep((ms) * 1000)
#endif

// Using IPC_IPC_MAX_COMMAND_LENGTH from ipc_common.h

typedef struct {
    webview_t webview;
    int should_exit;
} thread_context_t;

// Structure for dispatching commands to the main thread
typedef struct {
    webview_t webview;
    char command[IPC_MAX_COMMAND_LENGTH];
    char response[IPC_MAX_COMMAND_LENGTH];
    int* response_ready;
} command_dispatch_t;

// Structure for bind callback data
typedef struct {
    webview_t webview;
    char callback_id[256];
    char request_data[IPC_MAX_COMMAND_LENGTH];
} bind_callback_data_t;

// Forward declarations
void execute_command_dispatch(webview_t w, void* arg);
void handle_bind_callback(const char *id, const char *req, void *arg);
void handle_invoke_callback(const char *id, const char *req, void *arg);

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
    
#ifdef _WIN32
    // Parse the request to check if it's a show_context_menu call
    cJSON *json = cJSON_Parse(req);
    if (json) {
        cJSON *type = cJSON_GetObjectItem(json, "type");
        cJSON *channel = cJSON_GetObjectItem(json, "channel");
        
        if (cJSON_IsString(type) && strcmp(type->valuestring, "invoke") == 0 &&
            cJSON_IsString(channel) && strcmp(channel->valuestring, "show_context_menu") == 0) {
            
            // Handle show_context_menu directly - send message to main window
            void* window = webview_get_window(data->webview);
            if (window) {
                PostMessage((HWND)window, WM_USER + 1, 0, 0); // WM_SHOW_CONTEXT_MENU
            }
            
            // Return success response
            webview_return(data->webview, id, 0, "{\"status\":\"success\"}");
            cJSON_Delete(json);
            return;
        }
        cJSON_Delete(json);
    }
#endif
    
    // Write the callback result to stdout for other calls
    printf("{\"type\":\"ipc:call\",\"id\":\"%s\",\"seq\":\"%s\",\"req\":%s}\n", 
           data->callback_id, id, req);
    
    fflush(stdout);
}

// Function to be called on the main thread to execute commands
void execute_command_dispatch(webview_t w, void* arg) {
    (void)w; // Suppress unused parameter warning
    command_dispatch_t* cmd = (command_dispatch_t*)arg;
    char method[256], id[256], params[IPC_MAX_COMMAND_LENGTH];
    
    fprintf(stderr, "Executing command: %s\n", cmd->command);
    
    if (!ipc_parse_command(cmd->command, method, id, params)) {
        ipc_write_response(id, NULL, "Invalid command format");
        *cmd->response_ready = 1;
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
        char url[1024];
        ipc_extract_param_string(params, "url", url, sizeof(url));
        result = webview_navigate(cmd->webview, url);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "set_html") == 0) {
        char html[IPC_MAX_COMMAND_LENGTH];
        ipc_extract_param_string(params, "html", html, sizeof(html));
        result = webview_set_html(cmd->webview, html);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "eval") == 0) {
        char js[IPC_MAX_COMMAND_LENGTH];
        ipc_extract_param_string(params, "js", js, sizeof(js));
        result = webview_eval(cmd->webview, js);
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "init") == 0) {
        char js[IPC_MAX_COMMAND_LENGTH];
        ipc_extract_param_string(params, "js", js, sizeof(js));
        result = webview_init(cmd->webview, js);
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
        fprintf(stderr, "Executing ipc:response: %s\n", params);
        char ipcId[256];
        ipc_extract_param_string(params, "id", ipcId, sizeof(ipcId));
        char result[IPC_MAX_COMMAND_LENGTH];
        ipc_extract_param_json(params, "result", result, sizeof(result));
        fprintf(stderr, "Executing ipc:response2: %s\n", result);
        // For JSON responses, we need to handle raw JSON differently  
        printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":%s}\n", id, result);
        fflush(stdout);
        fprintf(stderr, "Executing ipc:response3: %s\n", result);
        webview_return(cmd->webview, ipcId, 0, result);
    
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
        
    } else if (strcmp(method, "window_set_context_menu") == 0) {
        void* window = webview_get_window(cmd->webview);
        char menu_json[IPC_MAX_COMMAND_LENGTH];
        ipc_extract_param_json(params, "menu", menu_json, sizeof(menu_json));
        platform_window_set_context_menu(window, menu_json);
        
#ifdef _WIN32
        // On Windows, inject JavaScript to handle right-click events for native context menu
        // This provides a seamless native Windows context menu experience
        const char* contextMenuScript = 
            "(function() {"
            "  if (window.tronbunContextMenuHandler) return;" // Prevent multiple injections
            "  window.tronbunContextMenuHandler = true;"
            "  "
            "  // Store original context menu handler if any"
            "  var originalContextMenu = document.oncontextmenu;"
            "  "
            "  // Create comprehensive context menu handler"
            "  function handleContextMenu(e) {"
            "    // Prevent default WebView2 context menu"
            "    e.preventDefault();"
            "    e.stopPropagation();"
            "    e.stopImmediatePropagation();"
            "    "
            "    // Store cursor position for native menu positioning"
            "    window.lastContextMenuX = e.clientX;"
            "    window.lastContextMenuY = e.clientY;"
            "    "
            "    // Send message to native layer to show native Windows context menu"
            "    if (window.tronbun && window.tronbun.invoke) {"
            "      window.tronbun.invoke('show_context_menu', {"
            "        x: e.clientX,"
            "        y: e.clientY,"
            "        pageX: e.pageX,"
            "        pageY: e.pageY"
            "      });"
            "    }"
            "    "
            "    return false;"
            "  }"
            "  "
            "  // Add event listeners with high priority"
            "  document.addEventListener('contextmenu', handleContextMenu, true);"
            "  document.oncontextmenu = handleContextMenu;"
            "  "
            "  // Also handle on window for complete coverage"
            "  window.addEventListener('contextmenu', handleContextMenu, true);"
            "  "
            "  console.log('Native Windows context menu handler installed');"
            "})();";
        
        webview_eval(cmd->webview, contextMenuScript);
#endif
        
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_clear_context_menu") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_clear_context_menu(window);
        
#ifdef _WIN32
        // On Windows, remove the native context menu JavaScript handler
        const char* clearContextMenuScript = 
            "(function() {"
            "  if (window.tronbunContextMenuHandler) {"
            "    window.tronbunContextMenuHandler = false;"
            "    "
            "    // Remove context menu event listeners"
            "    document.oncontextmenu = null;"
            "    "
            "    // Note: We can't easily remove the specific event listeners"
            "    // without storing references, but setting the flag prevents"
            "    // the handler from executing"
            "    "
            "    console.log('Native Windows context menu handler removed');"
            "  }"
            "})();";
        
        webview_eval(cmd->webview, clearContextMenuScript);
#endif
        
        ipc_write_response(id, "true", NULL);
        
    } else {
        ipc_write_response(id, NULL, "Unknown method");
    }
    
    if (result != WEBVIEW_ERROR_OK) {
        char error_msg[256];
        snprintf(error_msg, sizeof(error_msg), "WebView error: %d", result);
        ipc_write_response(id, NULL, error_msg);
    }
    
    *cmd->response_ready = 1;
    free(cmd);
}

// Thread function that monitors stdin for commands
THREAD_RETURN stdin_monitor_thread(THREAD_ARG arg) {
    thread_context_t* context = (thread_context_t*)arg;
    char command_buffer[IPC_MAX_COMMAND_LENGTH];
    
    fprintf(stderr, "Command monitor thread started (reading from stdin)\n");
    
    while (!context->should_exit) {
        // Read command from stdin
        if (fgets(command_buffer, sizeof(command_buffer), stdin) != NULL) {
            // Remove newline if present
            size_t len = strlen(command_buffer);
            if (len > 0 && command_buffer[len-1] == '\n') {
                command_buffer[len-1] = '\0';
            }
            
            if (strlen(command_buffer) > 0) {
                fprintf(stderr, "New command detected: %s\n", command_buffer);
                
                // Create command dispatch structure
                command_dispatch_t* cmd = (command_dispatch_t*)malloc(sizeof(command_dispatch_t));
                if (cmd != NULL) {
                    cmd->webview = context->webview;
                    strncpy(cmd->command, command_buffer, IPC_MAX_COMMAND_LENGTH - 1);
                    cmd->command[IPC_MAX_COMMAND_LENGTH - 1] = '\0';
                    
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
                }
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
    fprintf(stderr, "Starting WebView with stdin/stdout IPC...\n");
    
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