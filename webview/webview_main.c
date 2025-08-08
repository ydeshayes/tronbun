#include "../vendors/webview/core/include/webview/webview.h"
#include "platform/platform_window.h"
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

#define MAX_COMMAND_LENGTH 32768

typedef struct {
    webview_t webview;
    int should_exit;
} thread_context_t;

// Structure for dispatching commands to the main thread
typedef struct {
    webview_t webview;
    char command[MAX_COMMAND_LENGTH];
    char response[MAX_COMMAND_LENGTH];
    int* response_ready;
} command_dispatch_t;

// Structure for bind callback data
typedef struct {
    webview_t webview;
    char callback_id[256];
    char request_data[MAX_COMMAND_LENGTH];
} bind_callback_data_t;

// Forward declarations
void execute_command_dispatch(webview_t w, void* arg);
void handle_bind_callback(const char *id, const char *req, void *arg);
void handle_invoke_callback(const char *id, const char *req, void *arg);
void write_json_response(const char* id, const char* json_result, const char* error);

// Parse JSON-like command (simple parser for basic commands)
int parse_command(const char* json, char* method, char* id, char* params) {
    const char* method_start = strstr(json, "\"method\":\"");
    const char* id_start = strstr(json, "\"id\":\"");
    const char* params_start = strstr(json, "\"params\":");
    
    if (!method_start || !id_start) return 0;
    
    // Extract method
    method_start += 10; // Skip "method":"
    const char* method_end = strchr(method_start, '"');
    if (!method_end) return 0;
    strncpy(method, method_start, method_end - method_start);
    method[method_end - method_start] = '\0';
    
    // Extract id
    id_start += 6; // Skip "id":"
    const char* id_end = strchr(id_start, '"');
    if (!id_end) return 0;
    strncpy(id, id_start, id_end - id_start);
    id[id_end - id_start] = '\0';
    
    // Extract params if present
    if (params_start) {
        params_start += 9; // Skip "params":
        
        // Handle string params
        if (*params_start == '"') {
            params_start++;
            const char* params_end = strchr(params_start, '"');
            if (params_end) {
                strncpy(params, params_start, params_end - params_start);
                params[params_end - params_start] = '\0';
            }
        }
        // Handle object params (simple case)
        else if (*params_start == '{') {
            const char* params_end = strrchr(json, '}');
            if (params_end && params_end > params_start) {
                strncpy(params, params_start, params_end - params_start + 1);
                params[params_end - params_start + 1] = '\0';
            }
        }
        // Handle array or other params
        else {
            strcpy(params, params_start);
            // Remove trailing }
            char* end = strrchr(params, '}');
            if (end) *end = '\0';
        }
    } else {
        params[0] = '\0';
    }
    
    return 1;
}

// Extract parameters from JSON object with proper unescaping
void extract_param_string(const char* params, const char* key, char* value, size_t max_len) {
    char search_key[256];
    snprintf(search_key, sizeof(search_key), "\"%s\":\"", key);
    
    const char* start = strstr(params, search_key);
    if (start) {
        start += strlen(search_key);
        
        // Find the end quote, handling escaped quotes
        const char* end = start;
        while (*end && *end != '"') {
            if (*end == '\\' && *(end + 1)) {
                end += 2; // Skip escaped character
            } else {
                end++;
            }
        }
        
        if (*end == '"') {
            // Copy and unescape the string
            size_t out_pos = 0;
            const char* in = start;
            
            while (in < end && out_pos < max_len - 1) {
                if (*in == '\\' && in + 1 < end) {
                    // Handle escape sequences
                    switch (*(in + 1)) {
                        case 'n': value[out_pos++] = '\n'; break;
                        case 't': value[out_pos++] = '\t'; break;
                        case 'r': value[out_pos++] = '\r'; break;
                        case '\\': value[out_pos++] = '\\'; break;
                        case '"': value[out_pos++] = '"'; break;
                        case '/': value[out_pos++] = '/'; break;
                        default:
                            // Unknown escape, keep both characters
                            value[out_pos++] = *in;
                            if (out_pos < max_len - 1) {
                                value[out_pos++] = *(in + 1);
                            }
                            break;
                    }
                    in += 2;
                } else {
                    value[out_pos++] = *in++;
                }
            }
            
            value[out_pos] = '\0';
            return;
        }
    }
    value[0] = '\0';
}

void extract_param_int(const char* params, const char* key, int* value) {
    char search_key[256];
    snprintf(search_key, sizeof(search_key), "\"%s\":", key);
    
    const char* start = strstr(params, search_key);
    if (start) {
        start += strlen(search_key);
        *value = atoi(start);
    }
}

void extract_param_json(const char* params, const char* key, char* value, size_t max_len) {
    char search_key[256];
    snprintf(search_key, sizeof(search_key), "\"%s\":", key);
    
    const char* start = strstr(params, search_key);
    if (!start) {
        value[0] = '\0';
        return;
    }
    
    start += strlen(search_key);
    
    // Skip whitespace
    while (*start == ' ' || *start == '\t' || *start == '\n' || *start == '\r') {
        start++;
    }
    
    const char* end = start;
    
    // Determine the end of the JSON value based on its type
    if (*start == '{') {
        // JSON object - find matching closing brace
        int brace_count = 1;
        end++;
        while (*end && brace_count > 0) {
            if (*end == '{') {
                brace_count++;
            } else if (*end == '}') {
                brace_count--;
            } else if (*end == '"') {
                // Skip string content (handle escaped quotes)
                end++;
                while (*end && *end != '"') {
                    if (*end == '\\' && *(end + 1)) {
                        end += 2; // Skip escaped character
                    } else {
                        end++;
                    }
                }
                if (*end == '"') end++; // Skip closing quote
                continue;
            }
            end++;
        }
    } else if (*start == '[') {
        // JSON array - find matching closing bracket
        int bracket_count = 1;
        end++;
        while (*end && bracket_count > 0) {
            if (*end == '[') {
                bracket_count++;
            } else if (*end == ']') {
                bracket_count--;
            } else if (*end == '"') {
                // Skip string content (handle escaped quotes)
                end++;
                while (*end && *end != '"') {
                    if (*end == '\\' && *(end + 1)) {
                        end += 2; // Skip escaped character
                    } else {
                        end++;
                    }
                }
                if (*end == '"') end++; // Skip closing quote
                continue;
            }
            end++;
        }
    } else if (*start == '"') {
        // JSON string - find closing quote
        end++;
        while (*end && *end != '"') {
            if (*end == '\\' && *(end + 1)) {
                end += 2; // Skip escaped character
            } else {
                end++;
            }
        }
        if (*end == '"') end++; // Include closing quote
    } else {
        // JSON number, boolean, or null - find end (comma, brace, bracket, or end of string)
        while (*end && *end != ',' && *end != '}' && *end != ']' && 
               *end != ' ' && *end != '\t' && *end != '\n' && *end != '\r') {
            end++;
        }
    }
    
    // Copy the extracted value
    size_t length = end - start;
    if (length >= max_len) {
        length = max_len - 1;
    }
    
    strncpy(value, start, length);
    value[length] = '\0';
}

// Write response to stdout
void write_response(const char* id, const char* result, const char* error) {
    if (error) {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"error\":\"%s\"}\n", id, error);
    } else {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":\"%s\"}\n", id, result ? result : "null");
    }
    fflush(stdout);
}

void write_json_response(const char* id, const char* json_result, const char* error) {
    if (error) {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"error\":\"%s\"}\n", id, error);
    } else {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":%s}\n", id, json_result ? json_result : "null");
    }
    fflush(stdout);
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
    char method[256], id[256], params[MAX_COMMAND_LENGTH];
    
    fprintf(stderr, "Executing command: %s\n", cmd->command);
    
    if (!parse_command(cmd->command, method, id, params)) {
        write_response(id, NULL, "Invalid command format");
        *cmd->response_ready = 1;
        return;
    }
    
    webview_error_t result = WEBVIEW_ERROR_OK;
    
    // Handle different webview methods
    if (strcmp(method, "set_title") == 0) {
        char title[512];
        extract_param_string(params, "title", title, sizeof(title));
        result = webview_set_title(cmd->webview, title);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "set_size") == 0) {
        int width = 800, height = 600, hints = 0;
        extract_param_int(params, "width", &width);
        extract_param_int(params, "height", &height);
        extract_param_int(params, "hints", &hints);
        result = webview_set_size(cmd->webview, width, height, (webview_hint_t)hints);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "navigate") == 0) {
        char url[1024];
        extract_param_string(params, "url", url, sizeof(url));
        result = webview_navigate(cmd->webview, url);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "set_html") == 0) {
        char html[MAX_COMMAND_LENGTH];
        extract_param_string(params, "html", html, sizeof(html));
        result = webview_set_html(cmd->webview, html);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "eval") == 0) {
        char js[MAX_COMMAND_LENGTH];
        extract_param_string(params, "js", js, sizeof(js));
        result = webview_eval(cmd->webview, js);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "init") == 0) {
        char js[MAX_COMMAND_LENGTH];
        extract_param_string(params, "js", js, sizeof(js));
        result = webview_init(cmd->webview, js);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "bind") == 0) {
        char name[256];
        extract_param_string(params, "name", name, sizeof(name));
        
        // Create callback data
        bind_callback_data_t* callback_data = (bind_callback_data_t*)malloc(sizeof(bind_callback_data_t));
        callback_data->webview = cmd->webview;  
        strncpy(callback_data->callback_id, name, sizeof(callback_data->callback_id) - 1);
        callback_data->callback_id[sizeof(callback_data->callback_id) - 1] = '\0';
        
        result = webview_bind(cmd->webview, name, handle_bind_callback, callback_data);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "unbind") == 0) {
        char name[256];
        extract_param_string(params, "name", name, sizeof(name));
        result = webview_unbind(cmd->webview, name);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "terminate") == 0) {
        result = webview_terminate(cmd->webview);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "get_window") == 0) {
        void* window = webview_get_window(cmd->webview);
        char window_ptr[64];
        snprintf(window_ptr, sizeof(window_ptr), "%p", window);
        write_response(id, window_ptr, NULL);
        
    } else if (strcmp(method, "get_version") == 0) {
        const webview_version_info_t* version = webview_version();
        char version_str[256];
        snprintf(version_str, sizeof(version_str), 
                "{\"major\":%u,\"minor\":%u,\"patch\":%u,\"number\":\"%s\"}",
                version->version.major, version->version.minor, 
                version->version.patch, version->version_number);
        write_json_response(id, version_str, NULL);
    } else if (strcmp(method, "ipc:response") == 0) {
        fprintf(stderr, "Executing ipc:response: %s\n", params);
        char ipcId[256];
        extract_param_string(params, "id", ipcId, sizeof(ipcId));
        char result[MAX_COMMAND_LENGTH];
        extract_param_json(params, "result", result, sizeof(result));
        fprintf(stderr, "Executing ipc:response2: %s\n", result);
        write_json_response(id, result, NULL);
        fprintf(stderr, "Executing ipc:response3: %s\n", result);
        webview_return(cmd->webview, ipcId, 0, result);
    
    // Platform window control commands
    } else if (strcmp(method, "window_set_transparent") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_set_transparent(window);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_set_opaque") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_set_opaque(window);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_enable_blur") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_enable_blur(window);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_remove_decorations") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_remove_decorations(window);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_add_decorations") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_add_decorations(window);
        write_response(id, "true", NULL);
    } else if (strcmp(method, "window_set_always_on_top") == 0) {
        void* window = webview_get_window(cmd->webview);
        int on_top = 1;
        extract_param_int(params, "on_top", &on_top);
        platform_window_set_always_on_top(window, on_top);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_set_opacity") == 0) {
        void* window = webview_get_window(cmd->webview);
        float opacity = 1.0f;
        // Extract float parameter (using string first, then convert)
        char opacity_str[32];
        extract_param_string(params, "opacity", opacity_str, sizeof(opacity_str));
        if (strlen(opacity_str) > 0) {
            opacity = (float)atof(opacity_str);
        }
        platform_window_set_opacity(window, opacity);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_set_resizable") == 0) {
        void* window = webview_get_window(cmd->webview);
        int resizable = 1;
        extract_param_int(params, "resizable", &resizable);
        platform_window_set_resizable(window, resizable);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_set_position") == 0) {
        void* window = webview_get_window(cmd->webview);
        int x = 0, y = 0;
        extract_param_int(params, "x", &x);
        extract_param_int(params, "y", &y);
        platform_window_set_position(window, x, y);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_center") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_center(window);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_minimize") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_minimize(window);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_maximize") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_maximize(window);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_restore") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_restore(window);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_hide") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_hide(window);
        write_response(id, "true", NULL);
        
    } else if (strcmp(method, "window_show") == 0) {
        void* window = webview_get_window(cmd->webview);
        platform_window_show(window);
        write_response(id, "true", NULL);
        
    } else {
        write_response(id, NULL, "Unknown method");
    }
    
    if (result != WEBVIEW_ERROR_OK) {
        char error_msg[256];
        snprintf(error_msg, sizeof(error_msg), "WebView error: %d", result);
        write_response(id, NULL, error_msg);
    }
    
    *cmd->response_ready = 1;
    free(cmd);
}

// Thread function that monitors stdin for commands
THREAD_RETURN stdin_monitor_thread(THREAD_ARG arg) {
    thread_context_t* context = (thread_context_t*)arg;
    char command_buffer[MAX_COMMAND_LENGTH];
    
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
                    strncpy(cmd->command, command_buffer, MAX_COMMAND_LENGTH - 1);
                    cmd->command[MAX_COMMAND_LENGTH - 1] = '\0';
                    
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
                        write_response("unknown", NULL, "Command timeout");
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