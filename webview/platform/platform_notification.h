/**
 * Platform-specific desktop notification implementations
 */

#ifndef PLATFORM_NOTIFICATION_H
#define PLATFORM_NOTIFICATION_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Notification Types
// ============================================================================

typedef enum {
    NOTIFICATION_URGENCY_LOW = 0,
    NOTIFICATION_URGENCY_NORMAL = 1,
    NOTIFICATION_URGENCY_CRITICAL = 2
} NotificationUrgency;

/**
 * Notification action button
 */
typedef struct {
    char id[256];
    char text[256];
} notification_action_t;

/**
 * Notification options
 */
typedef struct {
    char id[256];                     // Unique notification identifier
    char title[512];                  // Notification title
    char body[2048];                  // Notification body text
    char icon[4096];                  // Path to icon file (empty if none)
    int silent;                       // 1 = no sound, 0 = play default sound
    NotificationUrgency urgency;      // Urgency level
    notification_action_t actions[8]; // Up to 8 action buttons
    int action_count;                 // Number of actions
} notification_options_t;

/**
 * Callback for notification events
 * @param notification_id The ID of the notification
 * @param event_type "click", "close", or "action"
 * @param action_index For "action" events, the index of the clicked action (-1 otherwise)
 * @param user_data User-provided context
 */
typedef void (*notification_event_callback_t)(const char* notification_id,
                                              const char* event_type,
                                              int action_index,
                                              void* user_data);

// ============================================================================
// Notification API
// ============================================================================

/**
 * Initialize the notification system. Must be called once before showing notifications.
 * On macOS, this requests user authorization for notifications.
 * @param callback Event callback for all notification events
 * @param user_data User data passed to callback
 * @return 0 on success, -1 on failure, -2 if permission denied
 */
int platform_notification_init(notification_event_callback_t callback, void* user_data);

/**
 * Show a desktop notification
 * @param options Notification options
 * @return 0 on success, -1 on failure
 */
int platform_notification_show(const notification_options_t* options);

/**
 * Close/dismiss a notification
 * @param notification_id The ID of the notification to close
 * @return 0 on success, -1 on failure
 */
int platform_notification_close(const char* notification_id);

/**
 * Check if notifications are supported and permitted
 * @return 1 if available, 0 if not supported, -1 if permission denied
 */
int platform_notification_is_available(void);

/**
 * Set the icon used by the notification system's tray icon.
 * Should be called after platform_notification_init().
 * @param icon_path Path to the icon file (.ico on Windows)
 * @return 0 on success, -1 on failure
 */
int platform_notification_set_icon(const char* icon_path);

/**
 * Clean up notification system resources
 */
void platform_notification_cleanup(void);

#ifdef __cplusplus
}
#endif

#endif // PLATFORM_NOTIFICATION_H
