#include "platform/platform_tray.h"
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

#ifdef __linux__
#include <gtk/gtk.h>
#endif

#ifdef __APPLE__
#import <Cocoa/Cocoa.h>
#endif

#define MAX_COMMAND_LENGTH 32768
#define MAX_MENU_ITEMS 100

typedef struct {
    platform_tray_t* tray;
    int should_exit;
} tray_context_t;

// Structure for dispatching commands to the main thread
typedef struct {
    platform_tray_t* tray;
    char command[MAX_COMMAND_LENGTH];
    char response[MAX_COMMAND_LENGTH];
    int* response_ready;
} tray_command_dispatch_t;

// Global context for callbacks
static tray_context_t* g_context = NULL;

// Forward declarations
void execute_tray_command_dispatch(void* arg);
void tray_click_callback(void* userdata);
void menu_click_callback(const char* menu_id, void* userdata);

// Parse JSON-like command (simple parser for basic commands)
int parse_tray_command(const char* json, char* method, char* id, char* params) {
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
        
        // Handle object params
        if (*params_start == '{') {
            const char* params_end = strrchr(json, '}');
            if (params_end && params_end > params_start) {
                strncpy(params, params_start, params_end - params_start + 1);
                params[params_end - params_start + 1] = '\0';
            }
        }
    } else {
        params[0] = '\0';
    }
    
    return 1;
}

// Extract parameters from JSON object with proper unescaping
void extract_tray_param_string(const char* params, const char* key, char* value, size_t max_len) {
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

// Parse menu items from JSON array
int parse_menu_items(const char* params, platform_menu_item_t* menu_items, int max_items) {
    const char* menu_start = strstr(params, "\"menu\":[");
    if (!menu_start) return 0;
    
    menu_start += 8; // Skip "menu":[
    
    int count = 0;
    const char* current = menu_start;
    
    while (*current && *current != ']' && count < max_items) {
        // Skip whitespace and commas
        while (*current == ' ' || *current == '\t' || *current == '\n' || *current == ',') {
            current++;
        }
        
        if (*current == '{') {
            // Parse menu item object
            const char* obj_end = current;
            int brace_count = 1;
            obj_end++;
            
            // Find end of object
            while (*obj_end && brace_count > 0) {
                if (*obj_end == '{') brace_count++;
                else if (*obj_end == '}') brace_count--;
                obj_end++;
            }
            
            if (brace_count == 0) {
                // Extract item properties
                char item_json[1024];
                size_t item_len = obj_end - current;
                if (item_len < sizeof(item_json)) {
                    strncpy(item_json, current, item_len);
                    item_json[item_len] = '\0';
                    
                    // Parse individual fields
                    extract_tray_param_string(item_json, "id", menu_items[count].id, sizeof(menu_items[count].id));
                    extract_tray_param_string(item_json, "label", menu_items[count].label, sizeof(menu_items[count].label));
                    
                    // Parse type
                    if (strstr(item_json, "\"type\":\"separator\"")) {
                        menu_items[count].type = 1;
                    } else if (strstr(item_json, "\"type\":\"checkbox\"")) {
                        menu_items[count].type = 2;
                    } else {
                        menu_items[count].type = 0; // normal
                    }
                    
                    // Parse enabled (default true)
                    menu_items[count].enabled = strstr(item_json, "\"enabled\":false") ? 0 : 1;
                    
                    // Parse checked (default false)
                    menu_items[count].checked = strstr(item_json, "\"checked\":true") ? 1 : 0;
                    
                    // Parse accelerator
                    extract_tray_param_string(item_json, "accelerator", menu_items[count].accelerator, sizeof(menu_items[count].accelerator));
                    
                    count++;
                }
                
                current = obj_end;
            } else {
                break; // Malformed JSON
            }
        } else {
            break;
        }
    }
    
    return count;
}

// Write response to stdout
void write_tray_response(const char* id, const char* result, const char* error) {
    if (error) {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"error\":\"%s\"}\n", id, error);
    } else {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":\"%s\"}\n", id, result ? result : "null");
    }
    fflush(stdout);
}

// Tray click callback
void tray_click_callback(void* userdata) {
    printf("{\"type\":\"tray_click\"}\n");
    fflush(stdout);
}

// Menu click callback
void menu_click_callback(const char* menu_id, void* userdata) {
    printf("{\"type\":\"menu_click\",\"menuId\":\"%s\"}\n", menu_id);
    fflush(stdout);
}

// Function to be called on the main thread to execute tray commands
void execute_tray_command_dispatch(void* arg) {
    tray_command_dispatch_t* cmd = (tray_command_dispatch_t*)arg;
    char method[256], id[256], params[MAX_COMMAND_LENGTH];
    
    fprintf(stderr, "Executing tray command: %s\n", cmd->command);
    
    if (!parse_tray_command(cmd->command, method, id, params)) {
        write_tray_response(id, NULL, "Invalid command format");
        *cmd->response_ready = 1;
        return;
    }
    
    // Handle different tray methods
    if (strcmp(method, "tray_set_icon") == 0) {
        char icon_path[1024];
        extract_tray_param_string(params, "icon", icon_path, sizeof(icon_path));
        int result = platform_tray_set_icon(cmd->tray, icon_path);
        write_tray_response(id, result == 0 ? "true" : "false", NULL);
        
    } else if (strcmp(method, "tray_set_tooltip") == 0) {
        char tooltip[512];
        extract_tray_param_string(params, "tooltip", tooltip, sizeof(tooltip));
        int result = platform_tray_set_tooltip(cmd->tray, tooltip);
        write_tray_response(id, result == 0 ? "true" : "false", NULL);
        
    } else if (strcmp(method, "tray_set_menu") == 0) {
        platform_menu_item_t menu_items[MAX_MENU_ITEMS];
        int count = parse_menu_items(params, menu_items, MAX_MENU_ITEMS);
        if (count > 0) {
            int result = platform_tray_set_menu(cmd->tray, menu_items, count);
            write_tray_response(id, result == 0 ? "true" : "false", NULL);
        } else {
            write_tray_response(id, NULL, "Invalid menu format");
        }
        
    } else if (strcmp(method, "tray_show_notification") == 0) {
        char title[256], body[1024];
        extract_tray_param_string(params, "title", title, sizeof(title));
        extract_tray_param_string(params, "body", body, sizeof(body));
        int result = platform_tray_show_notification(cmd->tray, title, body);
        write_tray_response(id, result == 0 ? "true" : "false", NULL);
        
    } else if (strcmp(method, "tray_destroy") == 0) {
        platform_tray_destroy(cmd->tray);
        cmd->tray = NULL;
        if (g_context) {
            g_context->should_exit = 1;
        }
        write_tray_response(id, "true", NULL);
        
    } else {
        write_tray_response(id, NULL, "Unknown tray method");
    }
    
    *cmd->response_ready = 1;
    free(cmd);
}

// Thread function that monitors stdin for commands
THREAD_RETURN tray_stdin_monitor_thread(THREAD_ARG arg) {
    tray_context_t* context = (tray_context_t*)arg;
    char command_buffer[MAX_COMMAND_LENGTH];
    
    fprintf(stderr, "Tray command monitor thread started (reading from stdin)\n");
    
    while (!context->should_exit) {
        // Read command from stdin
        if (fgets(command_buffer, sizeof(command_buffer), stdin) != NULL) {
            // Remove newline if present
            size_t len = strlen(command_buffer);
            if (len > 0 && command_buffer[len-1] == '\n') {
                command_buffer[len-1] = '\0';
            }
            
            if (strlen(command_buffer) > 0) {
                fprintf(stderr, "New tray command detected: %s\n", command_buffer);
                
                // Create command dispatch structure
                tray_command_dispatch_t* cmd = (tray_command_dispatch_t*)malloc(sizeof(tray_command_dispatch_t));
                if (cmd != NULL) {
                    cmd->tray = context->tray;
                    strncpy(cmd->command, command_buffer, MAX_COMMAND_LENGTH - 1);
                    cmd->command[MAX_COMMAND_LENGTH - 1] = '\0';
                    
                    int response_ready = 0;
                    cmd->response_ready = &response_ready;
                    
                    // Execute command directly (no webview dispatch needed)
                    execute_tray_command_dispatch(cmd);
                }
            }
        } else {
            // EOF or error on stdin
            fprintf(stderr, "stdin closed, exiting tray command monitor\n");
            context->should_exit = 1;
            break;
        }
    }
    
    fprintf(stderr, "Tray command monitor thread exiting\n");
    return 0;
}

#ifdef _WIN32
int WINAPI WinMain(HINSTANCE hInst, HINSTANCE hPrevInst, LPSTR lpCmdLine, int nCmdShow) {
    (void)hInst; (void)hPrevInst; (void)lpCmdLine; (void)nCmdShow;
#else
int main(int argc, char* argv[]) {
#endif
    fprintf(stderr, "Starting Tronbun Tray with stdin/stdout IPC...\n");
    
    // Check if tray is supported
    if (!platform_tray_is_supported()) {
        fprintf(stderr, "Tray icons are not supported on this platform\n");
        return 1;
    }
    
#ifdef __linux__
    // Initialize GTK for Linux
    if (!gtk_init_check(&argc, &argv)) {
        fprintf(stderr, "Failed to initialize GTK\n");
        return 1;
    }
#endif

#ifdef __APPLE__
    // Initialize NSApplication for macOS
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    }
#endif
    
    // Create tray with default icon (will be updated via commands)
    platform_tray_t* tray = platform_tray_create(NULL, "Tronbun App");
    if (!tray) {
        fprintf(stderr, "Failed to create tray icon\n");
        return 1;
    }
    
    // Set up callbacks
    platform_tray_set_click_callback(tray, tray_click_callback, NULL);
    platform_tray_set_menu_callback(tray, menu_click_callback, NULL);
    
    // Set up context
    tray_context_t context;
    context.tray = tray;
    context.should_exit = 0;
    g_context = &context;
    
    // Start the stdin monitoring thread
    thread_create(tray_stdin_monitor_thread, &context);
    
    fprintf(stderr, "Tray created with stdin/stdout IPC, starting event loop...\n");
    fprintf(stderr, "Send JSON commands to stdin to control the tray.\n");
    fprintf(stderr, "Example: {\"method\":\"tray_set_tooltip\",\"id\":\"1\",\"params\":{\"tooltip\":\"My App\"}}\n");
    
    // Run the event loop
#ifdef __linux__
    // GTK main loop
    while (!context.should_exit) {
        gtk_main_iteration_do(FALSE);
        thread_sleep(10);
    }
#elif defined(_WIN32)
    // Windows message loop
    MSG msg;
    while (!context.should_exit) {
        if (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        thread_sleep(10);
    }
#else
    // macOS run loop
    @autoreleasepool {
        while (!context.should_exit) {
            NSEvent* event = [NSApp nextEventMatchingMask:NSEventMaskAny
                                                untilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]
                                                   inMode:NSDefaultRunLoopMode
                                                  dequeue:YES];
            if (event) {
                [NSApp sendEvent:event];
            }
        }
    }
#endif
    
    fprintf(stderr, "Tray event loop ended, cleaning up...\n");
    
    // Signal the thread to exit
    context.should_exit = 1;
    
    // Give the thread time to exit gracefully
    thread_sleep(200);
    
    // Clean up
    if (tray) {
        platform_tray_destroy(tray);
    }
    
    fprintf(stderr, "Tray cleanup complete.\n");
    return 0;
}
