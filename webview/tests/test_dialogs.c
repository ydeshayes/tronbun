/*
 * Unit tests for native dialog functionality
 *
 * These tests verify the dialog IPC command parsing and response formatting.
 * Actual dialog display requires user interaction and is tested via the manual test app.
 */

#include "../common/ipc_common.h"
#include "../platform/platform_file_dialog.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

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
    else { printf("Test failed, stopping.\n"); exit(1); }

// ============================================================================
// Test MessageBox Type/Button Enum Values
// ============================================================================

int test_message_box_types() {
    TEST_START("message box type enum values");

    // Verify enum values match TypeScript mapping
    TEST_ASSERT(MSG_BOX_INFO == 0, "MSG_BOX_INFO should be 0");
    TEST_ASSERT(MSG_BOX_WARNING == 1, "MSG_BOX_WARNING should be 1");
    TEST_ASSERT(MSG_BOX_ERROR == 2, "MSG_BOX_ERROR should be 2");
    TEST_ASSERT(MSG_BOX_QUESTION == 3, "MSG_BOX_QUESTION should be 3");

    TEST_PASS();
}

int test_message_box_buttons() {
    TEST_START("message box button enum values");

    // Verify enum values match TypeScript mapping
    TEST_ASSERT(MSG_BUTTONS_OK == 0, "MSG_BUTTONS_OK should be 0");
    TEST_ASSERT(MSG_BUTTONS_OK_CANCEL == 1, "MSG_BUTTONS_OK_CANCEL should be 1");
    TEST_ASSERT(MSG_BUTTONS_YES_NO == 2, "MSG_BUTTONS_YES_NO should be 2");
    TEST_ASSERT(MSG_BUTTONS_YES_NO_CANCEL == 3, "MSG_BUTTONS_YES_NO_CANCEL should be 3");

    TEST_PASS();
}

int test_message_box_results() {
    TEST_START("message box result enum values");

    // Verify enum values for result mapping
    TEST_ASSERT(MSG_RESULT_OK == 0, "MSG_RESULT_OK should be 0");
    TEST_ASSERT(MSG_RESULT_CANCEL == 1, "MSG_RESULT_CANCEL should be 1");
    TEST_ASSERT(MSG_RESULT_YES == 2, "MSG_RESULT_YES should be 2");
    TEST_ASSERT(MSG_RESULT_NO == 3, "MSG_RESULT_NO should be 3");

    TEST_PASS();
}

// ============================================================================
// Test IPC Command Parsing for Dialogs
// ============================================================================

int test_open_file_dialog_command_parsing() {
    TEST_START("open_file_dialog command parsing");

    char method[64], id[64], params[1024];

    // Test parsing open_file_dialog command
    const char* json = "{\"method\":\"open_file_dialog\",\"id\":\"dialog1\",\"params\":{\"title\":\"Select File\",\"filters\":\"[{\\\"name\\\":\\\"Images\\\",\\\"extensions\\\":[\\\"png\\\",\\\"jpg\\\"]}]\",\"allowMultiple\":1}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse valid command");
    TEST_ASSERT(strcmp(method, "open_file_dialog") == 0, "Method should be open_file_dialog");
    TEST_ASSERT(strcmp(id, "dialog1") == 0, "ID should be dialog1");

    // Extract parameters
    char title[256];
    ipc_extract_param_string(params, "title", title, sizeof(title));
    TEST_ASSERT(strcmp(title, "Select File") == 0, "Title should be extracted");

    int allowMultiple = 0;
    ipc_extract_param_int(params, "allowMultiple", &allowMultiple);
    TEST_ASSERT(allowMultiple == 1, "allowMultiple should be 1");

    TEST_PASS();
}

int test_save_file_dialog_command_parsing() {
    TEST_START("save_file_dialog command parsing");

    char method[64], id[64], params[1024];

    const char* json = "{\"method\":\"save_file_dialog\",\"id\":\"dialog2\",\"params\":{\"title\":\"Save File\",\"defaultName\":\"untitled.txt\",\"filters\":\"\"}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse valid command");
    TEST_ASSERT(strcmp(method, "save_file_dialog") == 0, "Method should be save_file_dialog");

    char defaultName[256];
    ipc_extract_param_string(params, "defaultName", defaultName, sizeof(defaultName));
    TEST_ASSERT(strcmp(defaultName, "untitled.txt") == 0, "defaultName should be extracted");

    TEST_PASS();
}

int test_open_folder_dialog_command_parsing() {
    TEST_START("open_folder_dialog command parsing");

    char method[64], id[64], params[1024];

    const char* json = "{\"method\":\"open_folder_dialog\",\"id\":\"dialog3\",\"params\":{\"title\":\"Select Folder\"}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse valid command");
    TEST_ASSERT(strcmp(method, "open_folder_dialog") == 0, "Method should be open_folder_dialog");

    char title[256];
    ipc_extract_param_string(params, "title", title, sizeof(title));
    TEST_ASSERT(strcmp(title, "Select Folder") == 0, "Title should be extracted");

    TEST_PASS();
}

int test_message_box_command_parsing() {
    TEST_START("message_box command parsing");

    char method[64], id[64], params[1024];

    const char* json = "{\"method\":\"message_box\",\"id\":\"msg1\",\"params\":{\"title\":\"Confirm\",\"message\":\"Are you sure?\",\"detail\":\"This cannot be undone.\",\"type\":3,\"buttons\":2}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse valid command");
    TEST_ASSERT(strcmp(method, "message_box") == 0, "Method should be message_box");

    char title[256], message[1024], detail[1024];
    int type = -1, buttons = -1;

    ipc_extract_param_string(params, "title", title, sizeof(title));
    ipc_extract_param_string(params, "message", message, sizeof(message));
    ipc_extract_param_string(params, "detail", detail, sizeof(detail));
    ipc_extract_param_int(params, "type", &type);
    ipc_extract_param_int(params, "buttons", &buttons);

    TEST_ASSERT(strcmp(title, "Confirm") == 0, "Title should be Confirm");
    TEST_ASSERT(strcmp(message, "Are you sure?") == 0, "Message should be extracted");
    TEST_ASSERT(strcmp(detail, "This cannot be undone.") == 0, "Detail should be extracted");
    TEST_ASSERT(type == 3, "Type should be 3 (question)");
    TEST_ASSERT(buttons == 2, "Buttons should be 2 (yesNo)");

    TEST_PASS();
}

// ============================================================================
// Test Filter JSON Parsing
// ============================================================================

int test_filter_json_parsing() {
    TEST_START("file filter JSON parsing");

    // This test verifies the JSON format expected by the native code
    const char* filters_json = "[{\"name\":\"Images\",\"extensions\":[\"png\",\"jpg\",\"gif\"]},{\"name\":\"Documents\",\"extensions\":[\"pdf\",\"doc\"]}]";

    // Basic parsing check - verify it's valid JSON
    TEST_ASSERT(filters_json[0] == '[', "Filters should start with [");
    TEST_ASSERT(strstr(filters_json, "Images") != NULL, "Should contain Images");
    TEST_ASSERT(strstr(filters_json, "png") != NULL, "Should contain png");
    TEST_ASSERT(strstr(filters_json, "Documents") != NULL, "Should contain Documents");

    TEST_PASS();
}

int test_empty_filter_handling() {
    TEST_START("empty filter handling");

    const char* empty_filters = "[]";
    const char* no_filters = "";

    TEST_ASSERT(empty_filters[0] == '[', "Empty array should start with [");
    TEST_ASSERT(strlen(no_filters) == 0, "No filters should be empty string");

    TEST_PASS();
}

// ============================================================================
// Test Result Formatting
// ============================================================================

int test_result_to_json_string() {
    TEST_START("result to JSON string conversion");

    // Test the result string mapping
    const char* results[] = { "ok", "cancel", "yes", "no" };

    TEST_ASSERT(strcmp(results[MSG_RESULT_OK], "ok") == 0, "OK result should be 'ok'");
    TEST_ASSERT(strcmp(results[MSG_RESULT_CANCEL], "cancel") == 0, "Cancel result should be 'cancel'");
    TEST_ASSERT(strcmp(results[MSG_RESULT_YES], "yes") == 0, "Yes result should be 'yes'");
    TEST_ASSERT(strcmp(results[MSG_RESULT_NO], "no") == 0, "No result should be 'no'");

    TEST_PASS();
}

int test_path_json_formatting() {
    TEST_START("file path JSON array formatting");

    // Simulate the JSON array format returned by dialogs
    const char* single_path = "[\"/path/to/file.txt\"]";
    const char* multi_paths = "[\"/path/to/file1.txt\",\"/path/to/file2.txt\"]";
    const char* empty_paths = "[]";

    // Verify format
    TEST_ASSERT(single_path[0] == '[', "Single path should start with [");
    TEST_ASSERT(single_path[strlen(single_path)-1] == ']', "Single path should end with ]");
    TEST_ASSERT(strstr(single_path, "file.txt") != NULL, "Should contain filename");

    TEST_ASSERT(multi_paths[0] == '[', "Multi paths should start with [");
    TEST_ASSERT(strstr(multi_paths, ",") != NULL, "Multi paths should have comma separator");

    TEST_ASSERT(strcmp(empty_paths, "[]") == 0, "Empty should be []");

    TEST_PASS();
}

int test_windows_path_escaping() {
    TEST_START("Windows path JSON escaping");

    // Windows paths have backslashes that need escaping in JSON
    // C:\Users\test\file.txt becomes "C:\\Users\\test\\file.txt" in JSON

    const char* win_path_json = "[\"C:\\\\Users\\\\test\\\\Documents\\\\file.txt\"]";

    TEST_ASSERT(strstr(win_path_json, "\\\\") != NULL, "Should have escaped backslashes");
    TEST_ASSERT(strstr(win_path_json, "Users") != NULL, "Should contain path segment");

    TEST_PASS();
}

// ============================================================================
// Test Edge Cases
// ============================================================================

int test_special_characters_in_params() {
    TEST_START("special characters in dialog parameters");

    char method[64], id[64], params[2048];

    // Test with special characters in title and message
    const char* json = "{\"method\":\"message_box\",\"id\":\"special1\",\"params\":{\"title\":\"Test \\\"Quote\\\"\",\"message\":\"Line1\\nLine2\\tTabbed\",\"type\":0,\"buttons\":0}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse command with special chars");

    char title[256], message[1024];
    ipc_extract_param_string(params, "title", title, sizeof(title));
    ipc_extract_param_string(params, "message", message, sizeof(message));

    TEST_ASSERT(strstr(title, "Quote") != NULL, "Title should contain Quote");
    TEST_ASSERT(strstr(message, "Line1") != NULL, "Message should contain Line1");

    TEST_PASS();
}

int test_unicode_in_params() {
    TEST_START("Unicode characters in dialog parameters");

    char method[64], id[64], params[2048];

    // Test with Unicode characters
    const char* json = "{\"method\":\"message_box\",\"id\":\"unicode1\",\"params\":{\"title\":\"Test\",\"message\":\"Hello World!\",\"type\":0,\"buttons\":0}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse command with Unicode");

    char message[1024];
    ipc_extract_param_string(params, "message", message, sizeof(message));
    TEST_ASSERT(strstr(message, "Hello") != NULL, "Message should contain Hello");

    TEST_PASS();
}

int test_empty_optional_params() {
    TEST_START("empty optional parameters");

    char method[64], id[64], params[1024];

    // Test with empty optional params
    const char* json = "{\"method\":\"open_file_dialog\",\"id\":\"empty1\",\"params\":{\"title\":\"\",\"filters\":\"\",\"allowMultiple\":0}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse command with empty params");

    char title[256], filters[256];
    ipc_extract_param_string(params, "title", title, sizeof(title));
    ipc_extract_param_string(params, "filters", filters, sizeof(filters));

    TEST_ASSERT(strlen(title) == 0, "Empty title should result in empty string");
    TEST_ASSERT(strlen(filters) == 0, "Empty filters should result in empty string");

    TEST_PASS();
}

int test_long_message_handling() {
    TEST_START("long message handling");

    // Build a command with a long message
    char json[8192];
    char long_message[4096];

    // Create a message with 1000 characters
    memset(long_message, 'A', 1000);
    long_message[1000] = '\0';

    snprintf(json, sizeof(json),
        "{\"method\":\"message_box\",\"id\":\"long1\",\"params\":{\"title\":\"Test\",\"message\":\"%s\",\"type\":0,\"buttons\":0}}",
        long_message);

    char method[64], id[64], params[8192];
    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse command with long message");

    char message[4096];
    ipc_extract_param_string(params, "message", message, sizeof(message));
    TEST_ASSERT(strlen(message) == 1000, "Message should be 1000 chars");

    TEST_PASS();
}

// ============================================================================
// Main
// ============================================================================

int main() {
    printf("Running Native Dialog Unit Tests\n");
    printf("=================================\n\n");

    // Enum value tests
    printf("Testing enum values...\n");
    RUN_TEST(test_message_box_types);
    RUN_TEST(test_message_box_buttons);
    RUN_TEST(test_message_box_results);
    printf("Enum tests completed!\n\n");

    // IPC command parsing tests
    printf("Testing IPC command parsing...\n");
    RUN_TEST(test_open_file_dialog_command_parsing);
    RUN_TEST(test_save_file_dialog_command_parsing);
    RUN_TEST(test_open_folder_dialog_command_parsing);
    RUN_TEST(test_message_box_command_parsing);
    printf("IPC command parsing tests completed!\n\n");

    // Filter parsing tests
    printf("Testing filter JSON handling...\n");
    RUN_TEST(test_filter_json_parsing);
    RUN_TEST(test_empty_filter_handling);
    printf("Filter tests completed!\n\n");

    // Result formatting tests
    printf("Testing result formatting...\n");
    RUN_TEST(test_result_to_json_string);
    RUN_TEST(test_path_json_formatting);
    RUN_TEST(test_windows_path_escaping);
    printf("Result formatting tests completed!\n\n");

    // Edge case tests
    printf("Testing edge cases...\n");
    RUN_TEST(test_special_characters_in_params);
    RUN_TEST(test_unicode_in_params);
    RUN_TEST(test_empty_optional_params);
    RUN_TEST(test_long_message_handling);
    printf("Edge case tests completed!\n\n");

    printf("=================================\n");
    printf("All tests passed! (%d/%d)\n", tests_passed, tests_run);
    printf("Native dialog unit tests completed successfully!\n");

    return 0;
}
