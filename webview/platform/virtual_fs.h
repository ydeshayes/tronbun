/**
 * Virtual File System for Tronbun
 *
 * This module provides an in-memory file system that can be accessed
 * via a custom URL scheme (tronbun://) from the webview.
 *
 * Usage:
 * 1. Register files with virtual_fs_register_file()
 * 2. Navigate to tronbun://app/index.html
 * 3. All relative paths will be resolved within the virtual FS
 */

#ifndef VIRTUAL_FS_H
#define VIRTUAL_FS_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Initialize the virtual file system.
 * Must be called before any other virtual_fs functions.
 */
void virtual_fs_init(void);

/**
 * Cleanup the virtual file system and free all resources.
 */
void virtual_fs_cleanup(void);

/**
 * Register a file in the virtual file system.
 *
 * @param path The virtual path (e.g., "index.html" or "js/app.js")
 * @param content The file content (will be copied)
 * @param content_length Length of the content in bytes
 * @return 0 on success, -1 on failure
 */
int virtual_fs_register_file(const char* path, const char* content, size_t content_length);

/**
 * Get a file from the virtual file system.
 *
 * @param path The virtual path to look up
 * @param content_out Pointer to receive the content (do not free)
 * @param content_length_out Pointer to receive the content length
 * @return 0 on success, -1 if file not found
 */
int virtual_fs_get_file(const char* path, const char** content_out, size_t* content_length_out);

/**
 * Clear all files from the virtual file system.
 */
void virtual_fs_clear(void);

/**
 * Get the MIME type for a file based on its extension.
 *
 * @param path The file path
 * @return The MIME type string (do not free)
 */
const char* virtual_fs_get_mime_type(const char* path);

#ifdef __cplusplus
}
#endif

#endif // VIRTUAL_FS_H
