#import <Cocoa/Cocoa.h>
#include "platform/platform_tray.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>

// Maximum command length
#define MAX_COMMAND_LENGTH 8192
#define MAX_MENU_ITEMS 32

// Use the platform_menu_item_t from the header

// Global context
typedef struct {
    platform_tray_t* tray;
    int should_exit;
    NSFileHandle* stdinHandle;
    NSMutableString* inputBuffer;
} tray_context_t;

static tray_context_t* g_context = NULL;

// Function prototypes
void tray_click_callback(void* userdata);
void menu_click_callback(const char* menu_id, void* userdata);
void write_tray_response(const char* id, const char* result, const char* error);
int parse_tray_command(const char* command, char* method, char* id, char* params);
void extract_tray_param_string(const char* params, const char* key, char* value, size_t max_len);
int parse_menu_items(const char* params, platform_menu_item_t* items, int max_items);
void process_tray_command(const char* command);

// Write JSON response to stdout
void write_tray_response(const char* id, const char* result, const char* error) {
    if (error) {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"error\":\"%s\"}\n", id, error);
    } else {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":%s}\n", id, result ? result : "null");
    }
    fflush(stdout);
}

// Parse tray command JSON
int parse_tray_command(const char* command, char* method, char* id, char* params) {
    // Simple JSON parsing - find method, id, and params
    const char* method_start = strstr(command, "\"method\":\"");
    const char* id_start = strstr(command, "\"id\":\"");
    const char* params_start = strstr(command, "\"params\":");
    
    if (!method_start || !id_start) return 0;
    
    // Extract method
    method_start += 10; // Skip "method":"
    const char* method_end = strchr(method_start, '"');
    if (!method_end) return 0;
    size_t method_len = method_end - method_start;
    strncpy(method, method_start, method_len);
    method[method_len] = '\0';
    
    // Extract id
    id_start += 6; // Skip "id":"
    const char* id_end = strchr(id_start, '"');
    if (!id_end) return 0;
    size_t id_len = id_end - id_start;
    strncpy(id, id_start, id_len);
    id[id_len] = '\0';
    
    // Extract params if present
    if (params_start) {
        params_start += 9; // Skip "params":
        // Find the matching closing brace for params
        int brace_count = 0;
        const char* params_end = params_start;
        while (*params_end) {
            if (*params_end == '{') brace_count++;
            else if (*params_end == '}') {
                brace_count--;
                if (brace_count == 0) break;
            }
            params_end++;
        }
        if (*params_end == '}') params_end++;
        
        size_t params_len = params_end - params_start;
        strncpy(params, params_start, params_len);
        params[params_len] = '\0';
    } else {
        params[0] = '\0';
    }
    
    return 1;
}

// Extract string parameter from params JSON
void extract_tray_param_string(const char* params, const char* key, char* value, size_t max_len) {
    value[0] = '\0';
    
    char search_pattern[128];
    snprintf(search_pattern, sizeof(search_pattern), "\"%s\":\"", key);
    
    const char* start = strstr(params, search_pattern);
    if (!start) return;
    
    start += strlen(search_pattern);
    const char* end = strchr(start, '"');
    if (!end) return;
    
    size_t len = end - start;
    if (len >= max_len) len = max_len - 1;
    
    strncpy(value, start, len);
    value[len] = '\0';
}

// Parse menu items from JSON
int parse_menu_items(const char* params, platform_menu_item_t* items, int max_items) {
    // This is a simplified parser - in production you'd want a proper JSON parser
    const char* menu_start = strstr(params, "\"menu\":[");
    if (!menu_start) return 0;
    
    menu_start += 8; // Skip "menu":[
    
    int count = 0;
    const char* current = menu_start;
    
    while (count < max_items && *current && *current != ']') {
        // Skip whitespace and commas
        while (*current && (*current == ' ' || *current == '\t' || *current == '\n' || *current == ',')) {
            current++;
        }
        
        if (*current != '{') break;
        
        // Parse menu item object
        const char* obj_end = current;
        int brace_count = 0;
        while (*obj_end) {
            if (*obj_end == '{') brace_count++;
            else if (*obj_end == '}') {
                brace_count--;
                if (brace_count == 0) break;
            }
            obj_end++;
        }
        
        if (*obj_end != '}') break;
        
        // Extract item properties
        size_t obj_len = obj_end - current + 1;
        char item_json[1024];
        if (obj_len < sizeof(item_json)) {
            strncpy(item_json, current, obj_len);
            item_json[obj_len] = '\0';
            
            // Initialize item
            memset(&items[count], 0, sizeof(platform_menu_item_t));
            items[count].enabled = 1; // Default enabled
            
            // Extract properties
            extract_tray_param_string(item_json, "id", items[count].id, sizeof(items[count].id));
            extract_tray_param_string(item_json, "label", items[count].label, sizeof(items[count].label));
            extract_tray_param_string(item_json, "accelerator", items[count].accelerator, sizeof(items[count].accelerator));
            
            // Parse type
            const char* type_str = strstr(item_json, "\"type\":\"");
            if (type_str) {
                type_str += 8;
                if (strncmp(type_str, "separator", 9) == 0) {
                    items[count].type = 1;
                } else if (strncmp(type_str, "checkbox", 8) == 0) {
                    items[count].type = 2;
                } else {
                    items[count].type = 0; // normal
                }
            }
            
            // Parse enabled
            const char* enabled_str = strstr(item_json, "\"enabled\":");
            if (enabled_str) {
                enabled_str += 10;
                items[count].enabled = (strncmp(enabled_str, "true", 4) == 0) ? 1 : 0;
            }
            
            // Parse checked
            const char* checked_str = strstr(item_json, "\"checked\":");
            if (checked_str) {
                checked_str += 10;
                items[count].checked = (strncmp(checked_str, "true", 4) == 0) ? 1 : 0;
            }
            
            count++;
        }
        
        current = obj_end + 1;
    }
    
    return count;
}

// Callback functions
void tray_click_callback(void* userdata) {
    (void)userdata; // Suppress unused parameter warning
    printf("{\"type\":\"click\"}\n");
    fflush(stdout);
}

void menu_click_callback(const char* menu_id, void* userdata) {
    (void)userdata; // Suppress unused parameter warning
    printf("{\"type\":\"menu_click\",\"menuId\":\"%s\"}\n", menu_id);
    fflush(stdout);
}

// Process a single tray command on main thread
void process_tray_command(const char* command) {
    char method[256], id[256], params[MAX_COMMAND_LENGTH];
    
    fprintf(stderr, "[Tray] Processing command: %s\n", command);
    
    if (!parse_tray_command(command, method, id, params)) {
        write_tray_response(id, NULL, "Invalid command format");
        return;
    }
    
    // Handle different tray methods - all on main thread now
    if (strcmp(method, "tray_set_icon") == 0) {
        char icon_path[1024];
        extract_tray_param_string(params, "icon", icon_path, sizeof(icon_path));
        int result = platform_tray_set_icon(g_context->tray, icon_path);
        write_tray_response(id, result == 0 ? "true" : "false", NULL);
        
    } else if (strcmp(method, "tray_set_tooltip") == 0) {
        char tooltip[512];
        extract_tray_param_string(params, "tooltip", tooltip, sizeof(tooltip));
        int result = platform_tray_set_tooltip(g_context->tray, tooltip);
        write_tray_response(id, result == 0 ? "true" : "false", NULL);
        
    } else if (strcmp(method, "tray_set_menu") == 0) {
        platform_menu_item_t menu_items[MAX_MENU_ITEMS];
        int count = parse_menu_items(params, menu_items, MAX_MENU_ITEMS);
        if (count > 0) {
            int result = platform_tray_set_menu(g_context->tray, menu_items, count);
            write_tray_response(id, result == 0 ? "true" : "false", NULL);
        } else {
            write_tray_response(id, NULL, "Invalid menu format");
        }
        
    } else if (strcmp(method, "tray_show_notification") == 0) {
        char title[256], body[1024];
        extract_tray_param_string(params, "title", title, sizeof(title));
        extract_tray_param_string(params, "body", body, sizeof(body));
        int result = platform_tray_show_notification(g_context->tray, title, body);
        write_tray_response(id, result == 0 ? "true" : "false", NULL);
        
    } else if (strcmp(method, "tray_destroy") == 0) {
        platform_tray_destroy(g_context->tray);
        g_context->tray = NULL;
        g_context->should_exit = 1;
        write_tray_response(id, "true", NULL);
        
    } else {
        write_tray_response(id, NULL, "Unknown tray method");
    }
}

// NSFileHandle callback for stdin data
@interface StdinHandler : NSObject
@end

@implementation StdinHandler
- (void)handleStdinData:(NSNotification*)notification {
    NSFileHandle* fileHandle = [notification object];
    NSData* data = [notification userInfo][NSFileHandleNotificationDataItem];
    
    if ([data length] == 0) {
        // EOF - stdin closed
        fprintf(stderr, "[Tray] stdin closed, exiting\n");
        g_context->should_exit = 1;
        return;
    }
    
    // Convert data to string and add to buffer
    NSString* input = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (input) {
        [g_context->inputBuffer appendString:input];
        
        // Process complete lines
        NSRange range = [g_context->inputBuffer rangeOfString:@"\n"];
        while (range.location != NSNotFound) {
            NSString* line = [g_context->inputBuffer substringToIndex:range.location];
            [g_context->inputBuffer deleteCharactersInRange:NSMakeRange(0, range.location + 1)];
            
            // Process the command
            const char* command = [line UTF8String];
            if (command && strlen(command) > 0) {
                process_tray_command(command);
            }
            
            range = [g_context->inputBuffer rangeOfString:@"\n"];
        }
    }
    
    // Continue reading
    if (!g_context->should_exit) {
        [fileHandle readInBackgroundAndNotify];
    }
}
@end

int main(int argc, char* argv[]) {
    (void)argc; // Suppress unused parameter warning
    (void)argv; // Suppress unused parameter warning
    fprintf(stderr, "[Tray] Starting Tronbun Tray with main thread IPC...\n");
    
    @autoreleasepool {
        // Initialize NSApplication
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        
        // Initialize global context
        g_context = (tray_context_t*)malloc(sizeof(tray_context_t));
        memset(g_context, 0, sizeof(tray_context_t));
        g_context->inputBuffer = [[NSMutableString alloc] init];
        
        // Create tray with default icon
        g_context->tray = platform_tray_create(NULL, "Tronbun Tray");
        if (!g_context->tray) {
            fprintf(stderr, "[Tray] Failed to create tray\n");
            return 1;
        }
        
        // Set up callbacks
        platform_tray_set_click_callback(g_context->tray, tray_click_callback, g_context);
        platform_tray_set_menu_callback(g_context->tray, menu_click_callback, g_context);
        
        fprintf(stderr, "[Tray] Tray created successfully, setting up stdin monitoring...\n");
        
        // Set up stdin monitoring using NSFileHandle
        g_context->stdinHandle = [[NSFileHandle alloc] initWithFileDescriptor:STDIN_FILENO];
        StdinHandler* stdinHandler = [[StdinHandler alloc] init];
        
        [[NSNotificationCenter defaultCenter] 
            addObserver:stdinHandler 
            selector:@selector(handleStdinData:) 
            name:NSFileHandleReadCompletionNotification 
            object:g_context->stdinHandle];
        
        [g_context->stdinHandle readInBackgroundAndNotify];
        
        fprintf(stderr, "[Tray] Entering main event loop...\n");
        
        // Main event loop
        while (!g_context->should_exit) {
            @autoreleasepool {
                NSEvent* event = [NSApp nextEventMatchingMask:NSEventMaskAny
                                                    untilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]
                                                       inMode:NSDefaultRunLoopMode
                                                      dequeue:YES];
                if (event) {
                    [NSApp sendEvent:event];
                }
                
                // Process any pending runloop sources
                [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.01]];
            }
        }
        
        fprintf(stderr, "[Tray] Exiting main loop, cleaning up...\n");
        
        // Cleanup
        [[NSNotificationCenter defaultCenter] removeObserver:stdinHandler];
        
        if (g_context->tray) {
            platform_tray_destroy(g_context->tray);
        }
        
        free(g_context);
    }
    
    fprintf(stderr, "[Tray] Tray cleanup complete.\n");
    return 0;
}