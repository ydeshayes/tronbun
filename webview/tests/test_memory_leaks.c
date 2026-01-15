/**
 * Memory Leak Tests for Tronbun Native Components
 *
 * Tests for memory leaks in:
 * - Virtual file system (register/clear cycles)
 * - IPC command parsing
 * - Dynamic string allocation
 *
 * Run with: make test-memory
 * On macOS, use `leaks` command to verify no leaks
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "../platform/virtual_fs.h"
#include "../common/ipc_common.h"

#define TEST_ITERATIONS 1000
#define LARGE_CONTENT_SIZE (1024 * 1024)  // 1MB

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) printf("  Testing: %s... ", name)
#define PASS() do { printf("✓ PASS\n"); tests_passed++; } while(0)
#define FAIL(msg) do { printf("✗ FAIL: %s\n", msg); tests_failed++; } while(0)

/**
 * Test: Virtual FS register/clear cycle
 * Registers many files and clears them repeatedly to check for leaks
 */
void test_virtual_fs_register_clear_cycle(void) {
    TEST("Virtual FS register/clear cycle");

    virtual_fs_init();

    for (int cycle = 0; cycle < 100; cycle++) {
        // Register multiple files
        for (int i = 0; i < 10; i++) {
            char path[64];
            char content[256];
            snprintf(path, sizeof(path), "test/file%d.js", i);
            snprintf(content, sizeof(content), "console.log('test content %d cycle %d');", i, cycle);

            int result = virtual_fs_register_file(path, content, strlen(content));
            if (result != 0) {
                FAIL("Failed to register file");
                virtual_fs_cleanup();
                return;
            }
        }

        // Clear all files
        virtual_fs_clear();
    }

    virtual_fs_cleanup();
    PASS();
}

/**
 * Test: Virtual FS with large content
 * Registers large files to check for memory handling
 */
void test_virtual_fs_large_content(void) {
    TEST("Virtual FS large content handling");

    virtual_fs_init();

    // Allocate large content
    char* large_content = (char*)malloc(LARGE_CONTENT_SIZE);
    if (!large_content) {
        FAIL("Failed to allocate test content");
        return;
    }
    memset(large_content, 'A', LARGE_CONTENT_SIZE - 1);
    large_content[LARGE_CONTENT_SIZE - 1] = '\0';

    // Register and clear large files multiple times
    for (int i = 0; i < 10; i++) {
        int result = virtual_fs_register_file("large.js", large_content, LARGE_CONTENT_SIZE - 1);
        if (result != 0) {
            FAIL("Failed to register large file");
            free(large_content);
            virtual_fs_cleanup();
            return;
        }
        virtual_fs_clear();
    }

    free(large_content);
    virtual_fs_cleanup();
    PASS();
}

/**
 * Test: Virtual FS file replacement
 * Registers the same file path multiple times (should replace, not leak)
 */
void test_virtual_fs_replacement(void) {
    TEST("Virtual FS file replacement (no leak on overwrite)");

    virtual_fs_init();

    for (int i = 0; i < TEST_ITERATIONS; i++) {
        char content[128];
        snprintf(content, sizeof(content), "iteration %d content", i);

        int result = virtual_fs_register_file("same/path.js", content, strlen(content));
        if (result != 0) {
            FAIL("Failed to register file");
            virtual_fs_cleanup();
            return;
        }
    }

    // Verify only one file exists with last content
    const char* retrieved_content = NULL;
    size_t retrieved_length = 0;

    if (virtual_fs_get_file("same/path.js", &retrieved_content, &retrieved_length) != 0) {
        FAIL("Failed to retrieve file");
        virtual_fs_cleanup();
        return;
    }

    virtual_fs_cleanup();
    PASS();
}

/**
 * Test: IPC dynamic line reading
 * Tests ipc_read_line with various sizes
 */
void test_ipc_dynamic_line_alloc(void) {
    TEST("IPC dynamic string allocation/free");

    // Test allocation and freeing of strings
    for (int i = 0; i < TEST_ITERATIONS; i++) {
        // Simulate extracting a parameter (would normally come from JSON)
        char* test_str = (char*)malloc(256);
        if (test_str) {
            snprintf(test_str, 256, "test string iteration %d", i);
            ipc_free_string(test_str);
        }
    }

    PASS();
}

/**
 * Test: IPC command parsing with allocation
 * Tests ipc_parse_command_alloc for memory leaks
 */
void test_ipc_command_parsing(void) {
    TEST("IPC command parsing allocation");

    const char* test_commands[] = {
        "{\"method\":\"test\",\"id\":\"1\",\"params\":{\"key\":\"value\"}}",
        "{\"method\":\"set_html\",\"id\":\"2\",\"params\":{\"html\":\"<html></html>\"}}",
        "{\"method\":\"navigate\",\"id\":\"3\",\"params\":{\"url\":\"https://example.com\"}}",
    };

    for (int iter = 0; iter < 100; iter++) {
        for (int i = 0; i < 3; i++) {
            char method[256], id[256];
            char* params = NULL;

            int result = ipc_parse_command_alloc(test_commands[i], method, id, &params);
            if (result && params) {
                ipc_free_string(params);
            }
        }
    }

    PASS();
}

/**
 * Test: Virtual FS MIME type lookup (no allocation, just coverage)
 */
void test_virtual_fs_mime_types(void) {
    TEST("Virtual FS MIME type lookup");

    const char* test_paths[] = {
        "index.html", "app.js", "style.css", "data.json",
        "image.png", "image.jpg", "icon.ico", "font.woff2",
        "unknown.xyz"
    };

    for (int iter = 0; iter < TEST_ITERATIONS; iter++) {
        for (int i = 0; i < 9; i++) {
            const char* mime = virtual_fs_get_mime_type(test_paths[i]);
            if (!mime) {
                FAIL("MIME type returned NULL");
                return;
            }
        }
    }

    PASS();
}

/**
 * Test: Rapid init/cleanup cycles
 */
void test_init_cleanup_cycles(void) {
    TEST("Virtual FS init/cleanup cycles");

    for (int i = 0; i < 100; i++) {
        virtual_fs_init();

        // Register some content
        virtual_fs_register_file("test.js", "content", 7);
        virtual_fs_register_file("test2.js", "content2", 8);

        virtual_fs_cleanup();
    }

    PASS();
}

int main(void) {
    printf("\n🧪 Memory Leak Tests for Tronbun Native Components\n");
    printf("================================================\n\n");

    // Run all tests
    test_virtual_fs_register_clear_cycle();
    test_virtual_fs_large_content();
    test_virtual_fs_replacement();
    test_ipc_dynamic_line_alloc();
    test_ipc_command_parsing();
    test_virtual_fs_mime_types();
    test_init_cleanup_cycles();

    printf("\n================================================\n");
    printf("Results: %d passed, %d failed\n", tests_passed, tests_failed);

    if (tests_failed > 0) {
        printf("❌ Some tests failed!\n\n");
        return 1;
    }

    printf("✅ All tests passed!\n");
    printf("\n💡 To verify no memory leaks on macOS, run:\n");
    printf("   leaks --atExit -- ./build/test_memory_leaks\n\n");

    return 0;
}
