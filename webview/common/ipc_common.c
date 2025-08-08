/*
 * Common IPC utilities for Tronbun executables
 * 
 * Implementation of shared JSON-based stdin/stdout IPC communication
 * utilities used by webview, tray, and other native executables.
 * 
 * Uses cJSON library (MIT License) for robust JSON parsing.
 * cJSON: https://github.com/DaveGamble/cJSON
 */

#include "ipc_common.h"

// Global command processor callback
static void (*g_command_processor)(const char* command, void* context) = NULL;

int ipc_parse_command(const char* json_string, char* method, char* id, char* params) {
    if (!json_string) return 0;
    
    cJSON *json = cJSON_Parse(json_string);
    if (!json) return 0;
    
    cJSON *method_item = cJSON_GetObjectItem(json, "method");
    if (!method_item || !cJSON_IsString(method_item)) {
        cJSON_Delete(json);
        return 0;
    }
    
    cJSON *id_item = cJSON_GetObjectItem(json, "id");
    if (!id_item || !cJSON_IsString(id_item)) {
        cJSON_Delete(json);
        return 0;
    }
    
    cJSON *params_item = cJSON_GetObjectItem(json, "params");
    
    const char* method_str = cJSON_GetStringValue(method_item);
    if (strlen(method_str) >= IPC_MAX_METHOD_LENGTH) {
        cJSON_Delete(json);
        return 0;
    }
    strcpy(method, method_str);
    
    const char* id_str = cJSON_GetStringValue(id_item);
    if (strlen(id_str) >= IPC_MAX_ID_LENGTH) {
        cJSON_Delete(json);
        return 0;
    }
    strcpy(id, id_str);
    
    if (params_item) {
        char* params_str = cJSON_Print(params_item);
        if (params_str) {
            if (strlen(params_str) >= IPC_MAX_COMMAND_LENGTH) {
                free(params_str);
                cJSON_Delete(json);
                return 0;
            }
            strcpy(params, params_str);
            free(params_str);
        } else {
            params[0] = '\0';
        }
    } else {
        params[0] = '\0';
    }
    
    cJSON_Delete(json);
    return 1;
}

void ipc_extract_param_string(const char* params, const char* key, char* value, size_t max_len) {
    cJSON *json = cJSON_Parse(params);
    if (!json) {
        value[0] = '\0';
        return;
    }
    
    cJSON *item = cJSON_GetObjectItem(json, key);
    if (!item || !cJSON_IsString(item)) {
        cJSON_Delete(json);
        value[0] = '\0';
        return;
    }
    
    const char* str_value = cJSON_GetStringValue(item);
    if (str_value) {
       size_t len = strlen(str_value);
        if (len >= max_len) len = max_len - 1;
        strncpy(value, str_value, len);
        value[len] = '\0';
    } else {
        value[0] = '\0';
    }
    
    cJSON_Delete(json);
}

void ipc_extract_param_int(const char* params, const char* key, int* value) {
    cJSON *json = cJSON_Parse(params);
    if (!json) return;
    
    cJSON *item = cJSON_GetObjectItem(json, key);
    if (!item || !cJSON_IsNumber(item)) {
        cJSON_Delete(json);
        return;
    }
    
    *value = cJSON_GetNumberValue(item);
    cJSON_Delete(json);
}

void ipc_extract_param_float(const char* params, const char* key, float* value) {
    cJSON *json = cJSON_Parse(params);
    if (!json) return;
    
    cJSON *item = cJSON_GetObjectItem(json, key);
    if (!item || !cJSON_IsNumber(item)) {
        cJSON_Delete(json);
        return;
    }
    
    *value = (float)cJSON_GetNumberValue(item);
    cJSON_Delete(json);
}

void ipc_extract_param_json(const char* params, const char* key, char* value, size_t max_len) {
    cJSON *json = cJSON_Parse(params);
    if (!json) {
        value[0] = '\0';
        return;
    }
    
    cJSON *item = cJSON_GetObjectItem(json, key);
    if (!item) {
        cJSON_Delete(json);
        value[0] = '\0';
        return;
    }
    
    // Convert the JSON item to string representation
    char* json_str = cJSON_Print(item);
    if (json_str) {
        size_t len = strlen(json_str);
        if (len >= max_len) len = max_len - 1;
        strncpy(value, json_str, len);
        value[len] = '\0';
        free(json_str);
    } else {
        value[0] = '\0';
    }
    
    cJSON_Delete(json);
}

void ipc_write_response(const char* id, const char* result, const char* error) {
    if (error) {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"error\":\"%s\"}\n", id, error);
    } else {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":\"%s\"}\n", id, result ? result : "null");
    }
    fflush(stdout);
}

void ipc_write_json_response(const char* id, const char* json_result, const char* error) {
    if (error) {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"error\":\"%s\"}\n", id, error);
    } else {
        printf("{\"type\":\"response\",\"id\":\"%s\",\"result\":%s}\n", id, json_result ? json_result : "null");
    }
    fflush(stdout);
}

void ipc_write_event(const char* event_type, const char* data) {
    if (data) {
        printf("{\"type\":\"%s\",\"data\":%s}\n", event_type, data);
    } else {
        printf("{\"type\":\"%s\"}\n", event_type);
    }
    fflush(stdout);
}

ipc_command_dispatch_t* ipc_create_command_dispatch(void* target, const char* command, ipc_command_executor_t executor) {
    ipc_command_dispatch_t* dispatch = (ipc_command_dispatch_t*)malloc(sizeof(ipc_command_dispatch_t));
    if (!dispatch) return NULL;
    
    dispatch->target = target;
    strncpy(dispatch->command, command, IPC_MAX_COMMAND_LENGTH - 1);
    dispatch->command[IPC_MAX_COMMAND_LENGTH - 1] = '\0';
    dispatch->response[0] = '\0';
    dispatch->execute_callback = executor;
    
    int* response_ready = (int*)malloc(sizeof(int));
    *response_ready = 0;
    dispatch->response_ready = response_ready;
    
    return dispatch;
}

int ipc_execute_dispatch_sync(ipc_command_dispatch_t* dispatch, int timeout_ms) {
    if (!dispatch || !dispatch->execute_callback) return 0;
    
    dispatch->execute_callback(dispatch->target, dispatch);
    
    int timeout_count = 0;
    int sleep_interval = 10; // 10ms intervals
    int max_iterations = timeout_ms / sleep_interval;
    
    while (!(*dispatch->response_ready) && timeout_count < max_iterations) {
        thread_sleep(sleep_interval);
        timeout_count++;
    }
    
    int completed = *dispatch->response_ready;
    
    // Clean up
    free(dispatch->response_ready);
    free(dispatch);
    
    return completed;
}

// stdin monitoring
void ipc_set_command_processor(void (*processor)(const char* command, void* context)) {
    g_command_processor = processor;
}

THREAD_RETURN ipc_stdin_monitor_thread(THREAD_ARG arg) {
    ipc_base_context_t* context = (ipc_base_context_t*)arg;
    char command_buffer[IPC_MAX_COMMAND_LENGTH];
    
    fprintf(stderr, "[IPC] Command monitor thread started (reading from stdin)\n");
    
    while (!context->should_exit) {
        // Read command from stdin
        if (fgets(command_buffer, sizeof(command_buffer), stdin) != NULL) {
            // Remove newline if present
            size_t len = strlen(command_buffer);
            if (len > 0 && command_buffer[len-1] == '\n') {
                command_buffer[len-1] = '\0';
            }
            
            if (strlen(command_buffer) > 0) {
                fprintf(stderr, "[IPC] New command detected: %s\n", command_buffer);
                
                if (g_command_processor) {
                    g_command_processor(command_buffer, context);
                }
            }
        } else {
            // EOF or error on stdin
            fprintf(stderr, "[IPC] stdin closed, exiting command monitor\n");
            context->should_exit = 1;
            break;
        }
    }
    
    fprintf(stderr, "[IPC] Command monitor thread exiting\n");
    return 0;
}
