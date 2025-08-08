/*
 * Common IPC utilities for Tronbun executables
 * 
 * Shared constants, data structures, and function declarations
 * for JSON-based stdin/stdout IPC communication between
 * TypeScript and native executables.
 */

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
#include "cJSON.h"

// Platform-specific threading
#ifdef _WIN32
#include <windows.h>
#include <process.h>
#define THREAD_RETURN DWORD WINAPI
#define THREAD_ARG LPVOID
#define ipc_thread_create(func, arg) _beginthreadex(NULL, 0, (unsigned int (__stdcall *)(void *))func, arg, 0, NULL)
#define thread_sleep(ms) Sleep(ms)
#else
#include <pthread.h>
#include <unistd.h>
#define THREAD_RETURN void*
#define THREAD_ARG void*
#define ipc_thread_create(func, arg) do { pthread_t t; pthread_create(&t, NULL, func, arg); pthread_detach(t); } while(0)
#define thread_sleep(ms) usleep((ms) * 1000)
#endif

// Common constants
#define IPC_MAX_COMMAND_LENGTH 32768
#define IPC_MAX_METHOD_LENGTH 256
#define IPC_MAX_ID_LENGTH 256
#define IPC_MAX_KEY_LENGTH 256

// IPC response types
typedef enum {
    IPC_RESPONSE_TYPE_RESPONSE,
    IPC_RESPONSE_TYPE_ERROR,
    IPC_RESPONSE_TYPE_EVENT
} ipc_response_type_t;

// Base context structure for IPC-enabled applications
typedef struct {
    int should_exit;
    void* application_data;  // Pointer to app-specific data (webview, tray, etc.)
} ipc_base_context_t;

// Command dispatch structure for cross-thread communication
typedef struct {
    void* target;  // Target object (webview, tray, etc.)
    char command[IPC_MAX_COMMAND_LENGTH];
    char response[IPC_MAX_COMMAND_LENGTH];
    int* response_ready;
    void (*execute_callback)(void* target, void* dispatch_data);
} ipc_command_dispatch_t;

// Callback function types
typedef void (*ipc_command_executor_t)(void* target, void* dispatch_data);
typedef THREAD_RETURN (*ipc_stdin_monitor_t)(THREAD_ARG arg);

// JSON parsing functions
/**
 * Parse a JSON command into method, id, and params
 * @param json JSON command string
 * @param method Output buffer for method name
 * @param id Output buffer for command ID
 * @param params Output buffer for parameters JSON
 * @return 1 on success, 0 on failure
 */
int ipc_parse_command(const char* json, char* method, char* id, char* params);

/**
 * Extract a string parameter from JSON params
 * @param params JSON parameters string
 * @param key Parameter key to extract
 * @param value Output buffer for parameter value
 * @param max_len Maximum length of output buffer
 */
void ipc_extract_param_string(const char* params, const char* key, char* value, size_t max_len);

/**
 * Extract an integer parameter from JSON params
 * @param params JSON parameters string
 * @param key Parameter key to extract
 * @param value Output pointer for parameter value
 */
void ipc_extract_param_int(const char* params, const char* key, int* value);

/**
 * Extract a float parameter from JSON params
 * @param params JSON parameters string
 * @param key Parameter key to extract
 * @param value Output pointer for parameter value
 */
void ipc_extract_param_float(const char* params, const char* key, float* value);

/**
 * Extract a JSON object/array parameter from JSON params
 * @param params JSON parameters string
 * @param key Parameter key to extract
 * @param value Output buffer for JSON value
 * @param max_len Maximum length of output buffer
 */
void ipc_extract_param_json(const char* params, const char* key, char* value, size_t max_len);

// Response writing functions
/**
 * Write a JSON response to stdout
 * @param id Command ID
 * @param result Result string (or NULL)
 * @param error Error string (or NULL)
 */
void ipc_write_response(const char* id, const char* result, const char* error);

/**
 * Write a JSON response with JSON result to stdout
 * @param id Command ID
 * @param json_result JSON result string (or NULL)
 * @param error Error string (or NULL)
 */
void ipc_write_json_response(const char* id, const char* json_result, const char* error);

/**
 * Write an event message to stdout
 * @param event_type Event type string
 * @param data Event data (JSON string, or NULL)
 */
void ipc_write_event(const char* event_type, const char* data);

// Command dispatching utilities
/**
 * Create a command dispatch structure for cross-thread execution
 * @param target Target object (webview, tray, etc.)
 * @param command JSON command string
 * @param executor Callback function to execute the command
 * @return Allocated dispatch structure (must be freed by executor)
 */
ipc_command_dispatch_t* ipc_create_command_dispatch(void* target, const char* command, ipc_command_executor_t executor);

/**
 * Execute a command dispatch synchronously with timeout
 * @param dispatch Command dispatch structure
 * @param timeout_ms Timeout in milliseconds
 * @return 1 if completed, 0 if timed out
 */
int ipc_execute_dispatch_sync(ipc_command_dispatch_t* dispatch, int timeout_ms);

// stdin monitoring utilities
/**
 * Generic stdin monitor thread function
 * @param arg Pointer to context structure containing should_exit and application_data
 * @return Thread return value
 */
THREAD_RETURN ipc_stdin_monitor_thread(THREAD_ARG arg);

/**
 * Set the command processor callback for stdin monitoring
 * @param processor Function to call when a command is received
 */
void ipc_set_command_processor(void (*processor)(const char* command, void* context));

#ifdef __cplusplus
}
#endif
