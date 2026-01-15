/**
 * Virtual File System Implementation
 *
 * Uses a simple hash map to store files in memory.
 */

#include "virtual_fs.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// Simple hash map implementation for storing files
#define VIRTUAL_FS_BUCKET_COUNT 256

typedef struct virtual_file {
    char* path;
    char* content;
    size_t content_length;
    struct virtual_file* next;
} virtual_file_t;

static virtual_file_t* g_buckets[VIRTUAL_FS_BUCKET_COUNT] = {0};
static int g_initialized = 0;

// Simple hash function for strings
static unsigned int hash_string(const char* str) {
    unsigned int hash = 5381;
    int c;
    while ((c = *str++)) {
        hash = ((hash << 5) + hash) + c;
    }
    return hash % VIRTUAL_FS_BUCKET_COUNT;
}

void virtual_fs_init(void) {
    if (g_initialized) return;
    memset(g_buckets, 0, sizeof(g_buckets));
    g_initialized = 1;
}

void virtual_fs_cleanup(void) {
    if (!g_initialized) return;
    virtual_fs_clear();
    g_initialized = 0;
}

int virtual_fs_register_file(const char* path, const char* content, size_t content_length) {
    if (!g_initialized || !path || !content) return -1;

    // Remove leading slash if present
    if (path[0] == '/') path++;

    unsigned int bucket = hash_string(path);

    // Check if file already exists, update if so
    virtual_file_t* file = g_buckets[bucket];
    while (file) {
        if (strcmp(file->path, path) == 0) {
            // Update existing file
            free(file->content);
            file->content = (char*)malloc(content_length + 1);
            if (!file->content) return -1;
            memcpy(file->content, content, content_length);
            file->content[content_length] = '\0';
            file->content_length = content_length;
            return 0;
        }
        file = file->next;
    }

    // Create new file entry
    file = (virtual_file_t*)malloc(sizeof(virtual_file_t));
    if (!file) return -1;

    file->path = strdup(path);
    if (!file->path) {
        free(file);
        return -1;
    }

    file->content = (char*)malloc(content_length + 1);
    if (!file->content) {
        free(file->path);
        free(file);
        return -1;
    }
    memcpy(file->content, content, content_length);
    file->content[content_length] = '\0';
    file->content_length = content_length;

    // Insert at head of bucket
    file->next = g_buckets[bucket];
    g_buckets[bucket] = file;

    fprintf(stderr, "[VirtualFS] Registered: %s (%zu bytes)\n", path, content_length);
    return 0;
}

int virtual_fs_get_file(const char* path, const char** content_out, size_t* content_length_out) {
    if (!g_initialized || !path) return -1;

    // Remove leading slash if present
    if (path[0] == '/') path++;

    // Handle empty path as index.html
    if (path[0] == '\0') path = "index.html";

    unsigned int bucket = hash_string(path);
    virtual_file_t* file = g_buckets[bucket];

    while (file) {
        if (strcmp(file->path, path) == 0) {
            if (content_out) *content_out = file->content;
            if (content_length_out) *content_length_out = file->content_length;
            return 0;
        }
        file = file->next;
    }

    return -1;  // Not found
}

void virtual_fs_clear(void) {
    if (!g_initialized) return;

    for (int i = 0; i < VIRTUAL_FS_BUCKET_COUNT; i++) {
        virtual_file_t* file = g_buckets[i];
        while (file) {
            virtual_file_t* next = file->next;
            free(file->path);
            free(file->content);
            free(file);
            file = next;
        }
        g_buckets[i] = NULL;
    }
    fprintf(stderr, "[VirtualFS] Cleared all files\n");
}

const char* virtual_fs_get_mime_type(const char* path) {
    if (!path) return "application/octet-stream";

    // Find the file extension
    const char* ext = strrchr(path, '.');
    if (!ext) return "application/octet-stream";

    // Convert extension to lowercase for comparison
    char ext_lower[16];
    size_t i;
    for (i = 0; ext[i] && i < sizeof(ext_lower) - 1; i++) {
        ext_lower[i] = (ext[i] >= 'A' && ext[i] <= 'Z') ? ext[i] + 32 : ext[i];
    }
    ext_lower[i] = '\0';

    // Common MIME types
    if (strcmp(ext_lower, ".html") == 0 || strcmp(ext_lower, ".htm") == 0)
        return "text/html; charset=utf-8";
    if (strcmp(ext_lower, ".js") == 0 || strcmp(ext_lower, ".mjs") == 0)
        return "application/javascript; charset=utf-8";
    if (strcmp(ext_lower, ".css") == 0)
        return "text/css; charset=utf-8";
    if (strcmp(ext_lower, ".json") == 0)
        return "application/json; charset=utf-8";
    if (strcmp(ext_lower, ".svg") == 0)
        return "image/svg+xml";
    if (strcmp(ext_lower, ".png") == 0)
        return "image/png";
    if (strcmp(ext_lower, ".jpg") == 0 || strcmp(ext_lower, ".jpeg") == 0)
        return "image/jpeg";
    if (strcmp(ext_lower, ".gif") == 0)
        return "image/gif";
    if (strcmp(ext_lower, ".ico") == 0)
        return "image/x-icon";
    if (strcmp(ext_lower, ".woff") == 0)
        return "font/woff";
    if (strcmp(ext_lower, ".woff2") == 0)
        return "font/woff2";
    if (strcmp(ext_lower, ".ttf") == 0)
        return "font/ttf";
    if (strcmp(ext_lower, ".txt") == 0)
        return "text/plain; charset=utf-8";
    if (strcmp(ext_lower, ".xml") == 0)
        return "application/xml";
    if (strcmp(ext_lower, ".wasm") == 0)
        return "application/wasm";

    return "application/octet-stream";
}
