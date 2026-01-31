/**
 * Platform-specific file dialog and message box implementations
 */

#ifndef PLATFORM_FILE_DIALOG_H
#define PLATFORM_FILE_DIALOG_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Message Box Types
// ============================================================================

/**
 * Message box type (icon)
 */
typedef enum {
    MSG_BOX_INFO = 0,
    MSG_BOX_WARNING = 1,
    MSG_BOX_ERROR = 2,
    MSG_BOX_QUESTION = 3
} MessageBoxType;

/**
 * Message box button configuration
 */
typedef enum {
    MSG_BUTTONS_OK = 0,
    MSG_BUTTONS_OK_CANCEL = 1,
    MSG_BUTTONS_YES_NO = 2,
    MSG_BUTTONS_YES_NO_CANCEL = 3
} MessageBoxButtons;

/**
 * Message box result
 */
typedef enum {
    MSG_RESULT_OK = 0,
    MSG_RESULT_CANCEL = 1,
    MSG_RESULT_YES = 2,
    MSG_RESULT_NO = 3
} MessageBoxResult;

// ============================================================================
// File Dialog API
// ============================================================================

/**
 * Callback for file dialog result
 * @param paths JSON array of selected file paths (e.g., '["path1","path2"]'), or NULL if cancelled
 * @param user_data User-provided context
 */
typedef void (*file_dialog_callback_t)(const char* paths_json, void* user_data);

/**
 * Open a file picker dialog
 * @param window The parent window handle
 * @param title Dialog title (can be NULL for default)
 * @param filters_json JSON array of filter objects: [{"name":"Images","extensions":["png","jpg"]}]
 * @param allow_multiple Whether to allow selecting multiple files
 * @param callback Result callback
 * @param user_data User-provided context passed to callback
 */
void platform_open_file_dialog(void* window, const char* title, const char* filters_json,
                               int allow_multiple, file_dialog_callback_t callback, void* user_data);

/**
 * Open a save file dialog
 * @param window The parent window handle
 * @param title Dialog title (can be NULL for default)
 * @param default_name Default filename (can be NULL)
 * @param filters_json JSON array of filter objects
 * @param callback Result callback
 * @param user_data User-provided context passed to callback
 */
void platform_save_file_dialog(void* window, const char* title, const char* default_name,
                               const char* filters_json, file_dialog_callback_t callback, void* user_data);

/**
 * Open a folder picker dialog
 * @param window The parent window handle
 * @param title Dialog title (can be NULL for default)
 * @param callback Result callback
 * @param user_data User-provided context passed to callback
 */
void platform_open_folder_dialog(void* window, const char* title,
                                 file_dialog_callback_t callback, void* user_data);

// ============================================================================
// Message Box API
// ============================================================================

/**
 * Show a message box dialog
 * @param window The parent window handle (can be NULL)
 * @param type Message type (affects icon displayed)
 * @param buttons Button configuration
 * @param title Dialog title
 * @param message Main message text
 * @param detail Optional detail text (can be NULL)
 * @return User's button selection
 */
MessageBoxResult platform_message_box(void* window, MessageBoxType type, MessageBoxButtons buttons,
                                      const char* title, const char* message, const char* detail);

#ifdef __cplusplus
}
#endif

#endif // PLATFORM_FILE_DIALOG_H
