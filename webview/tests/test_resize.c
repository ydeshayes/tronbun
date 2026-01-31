/*
 * Unit tests for window resize callback functionality
 *
 * Tests cover:
 * 1. Resize callback type definitions
 * 2. Callback invocation logic
 * 3. Event formatting for IPC
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "../platform/platform_window.h"
#include "../common/ipc_common.h"

// Test counter
static int tests_run = 0;
static int tests_passed = 0;

// Test macros
#define TEST_START(name) \
    printf("Testing %s... ", name); \
    tests_run++;

#define TEST_ASSERT(condition, message) \
    if (!(condition)) { \
        printf("FAILED: %s\n", message); \
        return 0; \
    }

#define TEST_PASS() \
    printf("PASSED\n"); \
    tests_passed++; \
    return 1;

#define RUN_TEST(test_func) \
    if (test_func()) { /* test passed */ } \
    else { printf("❌ Test failed, stopping.\n"); exit(1); }

// ============================================================================
// Callback Tracking for Tests
// ============================================================================

static int callback_invoked = 0;
static int callback_width = 0;
static int callback_height = 0;
static void* callback_user_data = NULL;

void reset_callback_state() {
    callback_invoked = 0;
    callback_width = 0;
    callback_height = 0;
    callback_user_data = NULL;
}

void test_resize_callback(int width, int height, void* user_data) {
    callback_invoked = 1;
    callback_width = width;
    callback_height = height;
    callback_user_data = user_data;
}

// ============================================================================
// Tests for Callback Function Type
// ============================================================================

int test_callback_type_signature() {
    TEST_START("callback type signature");

    // Verify the callback function type matches expected signature
    platform_window_resize_callback_t callback = test_resize_callback;

    TEST_ASSERT(callback != NULL, "Callback should be assignable");

    // Verify the callback can be invoked with correct parameters
    reset_callback_state();
    callback(1920, 1080, (void*)0x12345678);

    TEST_ASSERT(callback_invoked == 1, "Callback should have been invoked");
    TEST_ASSERT(callback_width == 1920, "Width should be 1920");
    TEST_ASSERT(callback_height == 1080, "Height should be 1080");
    TEST_ASSERT(callback_user_data == (void*)0x12345678, "User data should be passed through");

    TEST_PASS();
}

int test_callback_with_null_user_data() {
    TEST_START("callback with null user data");

    platform_window_resize_callback_t callback = test_resize_callback;

    reset_callback_state();
    callback(800, 600, NULL);

    TEST_ASSERT(callback_invoked == 1, "Callback should have been invoked");
    TEST_ASSERT(callback_width == 800, "Width should be 800");
    TEST_ASSERT(callback_height == 600, "Height should be 600");
    TEST_ASSERT(callback_user_data == NULL, "User data should be NULL");

    TEST_PASS();
}

int test_callback_with_various_sizes() {
    TEST_START("callback with various window sizes");

    platform_window_resize_callback_t callback = test_resize_callback;

    // Test minimum size
    reset_callback_state();
    callback(1, 1, NULL);
    TEST_ASSERT(callback_width == 1 && callback_height == 1, "Should handle minimum size");

    // Test small size
    reset_callback_state();
    callback(320, 240, NULL);
    TEST_ASSERT(callback_width == 320 && callback_height == 240, "Should handle small size");

    // Test typical size
    reset_callback_state();
    callback(1280, 720, NULL);
    TEST_ASSERT(callback_width == 1280 && callback_height == 720, "Should handle typical size");

    // Test large size
    reset_callback_state();
    callback(3840, 2160, NULL);
    TEST_ASSERT(callback_width == 3840 && callback_height == 2160, "Should handle 4K size");

    // Test very large size
    reset_callback_state();
    callback(7680, 4320, NULL);
    TEST_ASSERT(callback_width == 7680 && callback_height == 4320, "Should handle 8K size");

    TEST_PASS();
}

// ============================================================================
// Tests for IPC Event Formatting
// ============================================================================

int test_ipc_event_format() {
    TEST_START("IPC event format");

    // Test that the event format matches expected structure
    char event_data[256];
    int width = 1200, height = 800;

    snprintf(event_data, sizeof(event_data), "{\"width\":%d,\"height\":%d}", width, height);

    // Verify the format is valid JSON
    TEST_ASSERT(event_data[0] == '{', "Should start with {");
    TEST_ASSERT(strstr(event_data, "\"width\"") != NULL, "Should contain width field");
    TEST_ASSERT(strstr(event_data, "\"height\"") != NULL, "Should contain height field");
    TEST_ASSERT(strstr(event_data, "1200") != NULL, "Should contain width value");
    TEST_ASSERT(strstr(event_data, "800") != NULL, "Should contain height value");

    // Verify it matches exactly what we expect
    const char* expected = "{\"width\":1200,\"height\":800}";
    TEST_ASSERT(strcmp(event_data, expected) == 0, "Should match expected format exactly");

    TEST_PASS();
}

int test_ipc_event_with_various_sizes() {
    TEST_START("IPC event with various sizes");

    char event_data[256];

    // Test small size
    snprintf(event_data, sizeof(event_data), "{\"width\":%d,\"height\":%d}", 100, 100);
    TEST_ASSERT(strcmp(event_data, "{\"width\":100,\"height\":100}") == 0, "Small size format");

    // Test typical size
    snprintf(event_data, sizeof(event_data), "{\"width\":%d,\"height\":%d}", 1920, 1080);
    TEST_ASSERT(strcmp(event_data, "{\"width\":1920,\"height\":1080}") == 0, "Typical size format");

    // Test large size
    snprintf(event_data, sizeof(event_data), "{\"width\":%d,\"height\":%d}", 7680, 4320);
    TEST_ASSERT(strcmp(event_data, "{\"width\":7680,\"height\":4320}") == 0, "Large size format");

    TEST_PASS();
}

// ============================================================================
// Tests for Window Size Retrieval Format
// ============================================================================

int test_get_size_response_format() {
    TEST_START("get_size response format");

    char result_json[128];
    int width = 1000, height = 700;

    snprintf(result_json, sizeof(result_json), "{\"width\":%d,\"height\":%d}", width, height);

    TEST_ASSERT(strstr(result_json, "\"width\":1000") != NULL, "Should contain width");
    TEST_ASSERT(strstr(result_json, "\"height\":700") != NULL, "Should contain height");

    TEST_PASS();
}

// ============================================================================
// Tests for Boundary Conditions
// ============================================================================

int test_zero_dimensions() {
    TEST_START("zero dimensions handling");

    platform_window_resize_callback_t callback = test_resize_callback;

    reset_callback_state();
    callback(0, 0, NULL);

    TEST_ASSERT(callback_invoked == 1, "Callback should be invoked even with zero dimensions");
    TEST_ASSERT(callback_width == 0, "Width should be 0");
    TEST_ASSERT(callback_height == 0, "Height should be 0");

    TEST_PASS();
}

int test_max_int_dimensions() {
    TEST_START("max int dimensions handling");

    platform_window_resize_callback_t callback = test_resize_callback;

    // Test with INT_MAX (unrealistic but tests type handling)
    int max_val = 2147483647;  // INT_MAX

    reset_callback_state();
    callback(max_val, max_val, NULL);

    TEST_ASSERT(callback_invoked == 1, "Callback should be invoked");
    TEST_ASSERT(callback_width == max_val, "Width should handle max int");
    TEST_ASSERT(callback_height == max_val, "Height should handle max int");

    TEST_PASS();
}

int test_event_buffer_safety() {
    TEST_START("event buffer safety");

    char event_data[256];
    int width = 2147483647;  // INT_MAX
    int height = 2147483647;

    // This should not overflow the buffer
    int written = snprintf(event_data, sizeof(event_data),
                          "{\"width\":%d,\"height\":%d}", width, height);

    TEST_ASSERT(written > 0, "snprintf should return positive count");
    TEST_ASSERT(written < (int)sizeof(event_data), "Should not exceed buffer size");
    TEST_ASSERT(event_data[written] == '\0', "Should be null-terminated");

    TEST_PASS();
}

// ============================================================================
// Tests for Multiple Callbacks (Rapid Fire)
// ============================================================================

int test_rapid_callback_invocations() {
    TEST_START("rapid callback invocations");

    platform_window_resize_callback_t callback = test_resize_callback;

    // Simulate rapid resize events (like during window dragging)
    int sizes[][2] = {
        {1000, 700}, {1001, 700}, {1003, 701}, {1006, 702},
        {1010, 704}, {1015, 706}, {1021, 709}, {1028, 712},
        {1036, 716}, {1045, 720}
    };
    int num_events = sizeof(sizes) / sizeof(sizes[0]);

    for (int i = 0; i < num_events; i++) {
        reset_callback_state();
        callback(sizes[i][0], sizes[i][1], NULL);

        TEST_ASSERT(callback_width == sizes[i][0], "Width should match for each event");
        TEST_ASSERT(callback_height == sizes[i][1], "Height should match for each event");
    }

    TEST_PASS();
}

// ============================================================================
// Tests for User Data Passing
// ============================================================================

typedef struct {
    int window_id;
    char name[32];
} test_context_t;

int test_user_data_struct() {
    TEST_START("user data struct passing");

    platform_window_resize_callback_t callback = test_resize_callback;

    test_context_t context = {
        .window_id = 42,
        .name = "test_window"
    };

    reset_callback_state();
    callback(1920, 1080, &context);

    TEST_ASSERT(callback_user_data == &context, "User data pointer should be preserved");

    // Verify we can access the struct through the callback
    test_context_t* received = (test_context_t*)callback_user_data;
    TEST_ASSERT(received->window_id == 42, "Struct data should be accessible");
    TEST_ASSERT(strcmp(received->name, "test_window") == 0, "Struct string should be accessible");

    TEST_PASS();
}

// ============================================================================
// Main
// ============================================================================

int main(int argc, char** argv) {
    (void)argc;
    (void)argv;

    printf("\n========================================\n");
    printf("Window Resize Callback Tests\n");
    printf("========================================\n\n");

    // Callback type tests
    printf("--- Callback Type Tests ---\n");
    RUN_TEST(test_callback_type_signature);
    RUN_TEST(test_callback_with_null_user_data);
    RUN_TEST(test_callback_with_various_sizes);

    // IPC event format tests
    printf("\n--- IPC Event Format Tests ---\n");
    RUN_TEST(test_ipc_event_format);
    RUN_TEST(test_ipc_event_with_various_sizes);
    RUN_TEST(test_get_size_response_format);

    // Boundary condition tests
    printf("\n--- Boundary Condition Tests ---\n");
    RUN_TEST(test_zero_dimensions);
    RUN_TEST(test_max_int_dimensions);
    RUN_TEST(test_event_buffer_safety);

    // Performance/stress tests
    printf("\n--- Performance Tests ---\n");
    RUN_TEST(test_rapid_callback_invocations);

    // User data tests
    printf("\n--- User Data Tests ---\n");
    RUN_TEST(test_user_data_struct);

    printf("\n========================================\n");
    printf("Results: %d/%d tests passed\n", tests_passed, tests_run);
    printf("========================================\n");

    return tests_passed == tests_run ? 0 : 1;
}
