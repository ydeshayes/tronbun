/**
 * Platform-specific screenshot functionality
 */

#ifndef PLATFORM_SCREENSHOT_H
#define PLATFORM_SCREENSHOT_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Callback function type for screenshot completion
 * @param base64_data The base64-encoded PNG data (NULL on error)
 * @param data_length Length of the base64 string
 * @param user_data User-provided context
 */
typedef void (*screenshot_callback_t)(const char* base64_data, size_t data_length, void* user_data);

/**
 * Take a screenshot of the webview content
 * This is an async operation - results are delivered via callback
 *
 * @param webview The webview handle (platform-specific)
 * @param callback Function to call with the result
 * @param user_data Context to pass to the callback
 */
void platform_take_screenshot(void* webview, screenshot_callback_t callback, void* user_data);

/**
 * Take a screenshot of a child view content
 *
 * @param child_view The child view handle (platform-specific)
 * @param callback Function to call with the result
 * @param user_data Context to pass to the callback
 */
void platform_child_take_screenshot(void* child_view, screenshot_callback_t callback, void* user_data);

#ifdef __cplusplus
}
#endif

#endif // PLATFORM_SCREENSHOT_H
