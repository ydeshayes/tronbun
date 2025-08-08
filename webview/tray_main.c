#include "platform/platform_tray.h"
#include "common/ipc_common.h"

#define MAX_MENU_ITEMS 100

// Unified context structure that works for all platforms  
typedef struct {
    ipc_base_context_t base;
    platform_tray_t* tray;
} tray_context_t;

// Global context for callbacks
static tray_context_t* g_tray_context = NULL;

// Forward declarations
void tray_command_processor(const char* command, void* context);
void tray_click_callback(void* userdata);
void menu_click_callback(const char* menu_id, void* userdata);
void execute_tray_command(const char* command);

// Parse menu items from JSON array
int parse_menu_items(const char* params, platform_menu_item_t* menu_items, int max_items) {
    // Parse the params as JSON using cJSON - much more robust
    cJSON *json = cJSON_Parse(params);
    if (!json) return 0;
    
    // Get the menu array
    cJSON *menu_array = cJSON_GetObjectItem(json, "menu");
    if (!menu_array || !cJSON_IsArray(menu_array)) {
        cJSON_Delete(json);
        return 0;
    }
    
    int count = 0;
    int array_size = cJSON_GetArraySize(menu_array);
    
    for (int i = 0; i < array_size && count < max_items; i++) {
        cJSON *menu_item = cJSON_GetArrayItem(menu_array, i);
        if (!menu_item || !cJSON_IsObject(menu_item)) continue;
        
        // Initialize item
        memset(&menu_items[count], 0, sizeof(platform_menu_item_t));
        
        // Extract id (required)
        cJSON *id = cJSON_GetObjectItem(menu_item, "id");
        if (id && cJSON_IsString(id)) {
            strncpy(menu_items[count].id, cJSON_GetStringValue(id), sizeof(menu_items[count].id) - 1);
            menu_items[count].id[sizeof(menu_items[count].id) - 1] = '\0';
        }
        
        // Extract label (required)
        cJSON *label = cJSON_GetObjectItem(menu_item, "label");
        if (label && cJSON_IsString(label)) {
            strncpy(menu_items[count].label, cJSON_GetStringValue(label), sizeof(menu_items[count].label) - 1);
            menu_items[count].label[sizeof(menu_items[count].label) - 1] = '\0';
        }
        
        // Extract type (default: normal)
        cJSON *type = cJSON_GetObjectItem(menu_item, "type");
        if (type && cJSON_IsString(type)) {
            const char* type_str = cJSON_GetStringValue(type);
            if (strcmp(type_str, "separator") == 0) {
                menu_items[count].type = 1;
            } else if (strcmp(type_str, "checkbox") == 0) {
                menu_items[count].type = 2;
            } else {
                menu_items[count].type = 0; // normal
            }
        } else {
            menu_items[count].type = 0; // normal
        }
        
        // Extract enabled (default: true)
        cJSON *enabled = cJSON_GetObjectItem(menu_item, "enabled");
        if (enabled && cJSON_IsBool(enabled)) {
            menu_items[count].enabled = cJSON_IsTrue(enabled) ? 1 : 0;
        } else {
            menu_items[count].enabled = 1; // default true
        }
        
        // Extract checked (default: false)
        cJSON *checked = cJSON_GetObjectItem(menu_item, "checked");
        if (checked && cJSON_IsBool(checked)) {
            menu_items[count].checked = cJSON_IsTrue(checked) ? 1 : 0;
        } else {
            menu_items[count].checked = 0; // default false
        }
        
        // Extract accelerator (optional)
        cJSON *accelerator = cJSON_GetObjectItem(menu_item, "accelerator");
        if (accelerator && cJSON_IsString(accelerator)) {
            strncpy(menu_items[count].accelerator, cJSON_GetStringValue(accelerator), sizeof(menu_items[count].accelerator) - 1);
            menu_items[count].accelerator[sizeof(menu_items[count].accelerator) - 1] = '\0';
        }
        
        count++;
    }
    
    cJSON_Delete(json);
    return count;
}

// Tray click callback
void tray_click_callback(void* userdata) {
    (void)userdata; // Suppress unused parameter warning
    fprintf(stderr, "[Tray] Tray icon clicked\n");
    
    // Note: Left-click now directly shows the menu in platform-specific code
    // No need to send events to TypeScript since users can't add click handlers
}

// Menu click callback
void menu_click_callback(const char* menu_id, void* userdata) {
    (void)userdata; // Suppress unused parameter warning
    fprintf(stderr, "[Tray] Menu item clicked: %s\n", menu_id);
    
    // Send menu click event to TypeScript
    char event_data[512];
    snprintf(event_data, sizeof(event_data), "{\"menuId\":\"%s\"}", menu_id);
    ipc_write_event("menu_click", event_data);
}

// Execute tray command
void execute_tray_command(const char* command) {
    char method[256], id[256], params[IPC_MAX_COMMAND_LENGTH];
    
    if (!ipc_parse_command(command, method, id, params)) {
        ipc_write_response("unknown", NULL, "Invalid command format");
        return;
    }
    
    fprintf(stderr, "[Tray] Processing command: %s\n", command);
    
    if (strcmp(method, "tray_set_icon") == 0) {
        char icon_path[1024];
        ipc_extract_param_string(params, "icon", icon_path, sizeof(icon_path));
        int result = platform_tray_set_icon(g_tray_context->tray, icon_path);
        if (result != 0) {
            fprintf(stderr, "[Tray] Failed to load icon from path: %s, using default\n", icon_path);
        }
        ipc_write_response(id, "true", NULL);
        
    } else if (strcmp(method, "tray_set_tooltip") == 0) {
        char tooltip[512];
        ipc_extract_param_string(params, "tooltip", tooltip, sizeof(tooltip));
        int result = platform_tray_set_tooltip(g_tray_context->tray, tooltip);
        ipc_write_response(id, result == 0 ? "true" : "false", NULL);
        
    } else if (strcmp(method, "tray_set_menu") == 0) {
        platform_menu_item_t menu_items[MAX_MENU_ITEMS];
        int menu_count = parse_menu_items(params, menu_items, MAX_MENU_ITEMS);
        
        if (menu_count > 0) {
            int result = platform_tray_set_menu(g_tray_context->tray, menu_items, menu_count);
            ipc_write_response(id, result == 0 ? "true" : "false", NULL);
        } else {
            ipc_write_response(id, NULL, "Invalid menu format");
        }
        
    } else if (strcmp(method, "tray_show_notification") == 0) {
        char title[256], body[1024];
        ipc_extract_param_string(params, "title", title, sizeof(title));
        ipc_extract_param_string(params, "body", body, sizeof(body));
        int result = platform_tray_show_notification(g_tray_context->tray, title, body);
        ipc_write_response(id, result == 0 ? "true" : "false", NULL);
        
    } else if (strcmp(method, "tray_destroy") == 0) {
        platform_tray_destroy(g_tray_context->tray);
        g_tray_context->tray = NULL;
        g_tray_context->base.should_exit = 1;
        ipc_write_response(id, "true", NULL);
        
    } else {
        ipc_write_response(id, NULL, "Unknown tray method");
    }
}

// Command processor for IPC
void tray_command_processor(const char* command, void* context) {
    (void)context; // Suppress unused parameter warning
    execute_tray_command(command);
}

int main(int argc, char* argv[]) {
    (void)argc; // Suppress unused parameter warning
    (void)argv; // Suppress unused parameter warning
    fprintf(stderr, "[Tray] Starting Tronbun Tray with main thread IPC...\n");
    
    // Initialize global context
    g_tray_context = (tray_context_t*)malloc(sizeof(tray_context_t));
    memset(g_tray_context, 0, sizeof(tray_context_t));
    g_tray_context->base.should_exit = 0;
    g_tray_context->base.application_data = NULL;
    
    // Create tray with default icon
    g_tray_context->tray = platform_tray_create(NULL, "Tronbun Tray");
    if (!g_tray_context->tray) {
        fprintf(stderr, "[Tray] Failed to create tray\n");
        free(g_tray_context);
        return 1;
    }
    
    // Set up callbacks
    platform_tray_set_click_callback(g_tray_context->tray, tray_click_callback, g_tray_context);
    platform_tray_set_menu_callback(g_tray_context->tray, menu_click_callback, g_tray_context);
    
    fprintf(stderr, "[Tray] Tray created successfully, setting up stdin monitoring...\n");
    
    // Use the unified IPC command processor for all platforms
    ipc_set_command_processor(tray_command_processor);
    ipc_thread_create(ipc_stdin_monitor_thread, &g_tray_context->base);
    
    fprintf(stderr, "[Tray] Entering main event loop...\n");
    
    // Use platform-specific event loop from platform implementation
    platform_tray_run_event_loop(&g_tray_context->base);
    
    fprintf(stderr, "[Tray] Tray event loop ended, cleaning up...\n");
    
    // Clean up
    if (g_tray_context->tray) {
        platform_tray_destroy(g_tray_context->tray);
    }
    free(g_tray_context);
    
    fprintf(stderr, "[Tray] Tray cleanup complete.\n");
    
    return 0;
}