/*
 * Unit tests for native menu functionality
 *
 * These tests verify the menu enum values, JSON parsing, and IPC command handling.
 * Actual menu display requires a running window and is tested via the manual test app.
 */

#include "../common/ipc_common.h"
#include "../platform/platform_menu.h"
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
// Test MenuItemType Enum Values
// ============================================================================

int test_menu_item_type_enum() {
    TEST_START("MenuItemType enum values");

    // Verify enum values match TypeScript mapping
    TEST_ASSERT(MENU_ITEM_NORMAL == 0, "MENU_ITEM_NORMAL should be 0");
    TEST_ASSERT(MENU_ITEM_SEPARATOR == 1, "MENU_ITEM_SEPARATOR should be 1");
    TEST_ASSERT(MENU_ITEM_CHECKBOX == 2, "MENU_ITEM_CHECKBOX should be 2");
    TEST_ASSERT(MENU_ITEM_SUBMENU == 3, "MENU_ITEM_SUBMENU should be 3");
    TEST_ASSERT(MENU_ITEM_RADIO == 4, "MENU_ITEM_RADIO should be 4");

    TEST_PASS();
}

// ============================================================================
// Test MenuItemRole Enum Values
// ============================================================================

int test_menu_item_role_enum() {
    TEST_START("MenuItemRole enum values");

    // Application roles
    TEST_ASSERT(MENU_ROLE_NONE == 0, "MENU_ROLE_NONE should be 0");
    TEST_ASSERT(MENU_ROLE_ABOUT == 1, "MENU_ROLE_ABOUT should be 1");
    TEST_ASSERT(MENU_ROLE_SERVICES == 2, "MENU_ROLE_SERVICES should be 2");
    TEST_ASSERT(MENU_ROLE_HIDE == 3, "MENU_ROLE_HIDE should be 3");
    TEST_ASSERT(MENU_ROLE_HIDE_OTHERS == 4, "MENU_ROLE_HIDE_OTHERS should be 4");
    TEST_ASSERT(MENU_ROLE_UNHIDE == 5, "MENU_ROLE_UNHIDE should be 5");
    TEST_ASSERT(MENU_ROLE_QUIT == 6, "MENU_ROLE_QUIT should be 6");

    // Edit roles
    TEST_ASSERT(MENU_ROLE_UNDO == 10, "MENU_ROLE_UNDO should be 10");
    TEST_ASSERT(MENU_ROLE_REDO == 11, "MENU_ROLE_REDO should be 11");
    TEST_ASSERT(MENU_ROLE_CUT == 12, "MENU_ROLE_CUT should be 12");
    TEST_ASSERT(MENU_ROLE_COPY == 13, "MENU_ROLE_COPY should be 13");
    TEST_ASSERT(MENU_ROLE_PASTE == 14, "MENU_ROLE_PASTE should be 14");
    TEST_ASSERT(MENU_ROLE_PASTE_AND_MATCH == 15, "MENU_ROLE_PASTE_AND_MATCH should be 15");
    TEST_ASSERT(MENU_ROLE_DELETE == 16, "MENU_ROLE_DELETE should be 16");
    TEST_ASSERT(MENU_ROLE_SELECT_ALL == 17, "MENU_ROLE_SELECT_ALL should be 17");

    // View roles
    TEST_ASSERT(MENU_ROLE_RELOAD == 20, "MENU_ROLE_RELOAD should be 20");
    TEST_ASSERT(MENU_ROLE_FORCE_RELOAD == 21, "MENU_ROLE_FORCE_RELOAD should be 21");
    TEST_ASSERT(MENU_ROLE_DEV_TOOLS == 22, "MENU_ROLE_DEV_TOOLS should be 22");
    TEST_ASSERT(MENU_ROLE_ZOOM_IN == 23, "MENU_ROLE_ZOOM_IN should be 23");
    TEST_ASSERT(MENU_ROLE_ZOOM_OUT == 24, "MENU_ROLE_ZOOM_OUT should be 24");
    TEST_ASSERT(MENU_ROLE_RESET_ZOOM == 25, "MENU_ROLE_RESET_ZOOM should be 25");
    TEST_ASSERT(MENU_ROLE_FULLSCREEN == 26, "MENU_ROLE_FULLSCREEN should be 26");

    // Window roles
    TEST_ASSERT(MENU_ROLE_MINIMIZE == 30, "MENU_ROLE_MINIMIZE should be 30");
    TEST_ASSERT(MENU_ROLE_CLOSE == 31, "MENU_ROLE_CLOSE should be 31");
    TEST_ASSERT(MENU_ROLE_ZOOM == 32, "MENU_ROLE_ZOOM should be 32");
    TEST_ASSERT(MENU_ROLE_FRONT == 33, "MENU_ROLE_FRONT should be 33");

    // Help role
    TEST_ASSERT(MENU_ROLE_HELP == 40, "MENU_ROLE_HELP should be 40");

    TEST_PASS();
}

// ============================================================================
// Test IPC Command Parsing for Menus
// ============================================================================

int test_set_menu_command_parsing() {
    TEST_START("set_menu command parsing");

    char method[64], id[64], params[4096];

    // Test parsing set_menu command with JSON menus
    const char* json = "{\"method\":\"set_menu\",\"id\":\"menu1\",\"params\":{\"menus\":\"[{\\\"id\\\":\\\"file\\\",\\\"label\\\":\\\"File\\\",\\\"items\\\":[{\\\"id\\\":\\\"new\\\",\\\"label\\\":\\\"New\\\"}]}]\"}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse valid command");
    TEST_ASSERT(strcmp(method, "set_menu") == 0, "Method should be set_menu");
    TEST_ASSERT(strcmp(id, "menu1") == 0, "ID should be menu1");

    // Extract menus parameter
    char menus[2048];
    ipc_extract_param_string(params, "menus", menus, sizeof(menus));
    TEST_ASSERT(strlen(menus) > 0, "Menus should be extracted");
    TEST_ASSERT(strstr(menus, "File") != NULL, "Menus should contain File label");

    TEST_PASS();
}

int test_set_default_menu_command_parsing() {
    TEST_START("set_default_menu command parsing");

    char method[64], id[64], params[1024];

    // Test parsing set_default_menu command
    const char* json = "{\"method\":\"set_default_menu\",\"id\":\"menu2\",\"params\":{\"appName\":\"MyApp\"}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse valid command");
    TEST_ASSERT(strcmp(method, "set_default_menu") == 0, "Method should be set_default_menu");

    // Extract appName parameter
    char appName[256];
    ipc_extract_param_string(params, "appName", appName, sizeof(appName));
    TEST_ASSERT(strcmp(appName, "MyApp") == 0, "AppName should be MyApp");

    TEST_PASS();
}

int test_remove_menu_command_parsing() {
    TEST_START("remove_menu command parsing");

    char method[64], id[64], params[1024];

    // Test parsing remove_menu command
    const char* json = "{\"method\":\"remove_menu\",\"id\":\"menu3\",\"params\":{}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse valid command");
    TEST_ASSERT(strcmp(method, "remove_menu") == 0, "Method should be remove_menu");

    TEST_PASS();
}

int test_update_menu_item_command_parsing() {
    TEST_START("update_menu_item command parsing");

    char method[64], id[64], params[1024];

    // Test parsing update_menu_item command
    const char* json = "{\"method\":\"update_menu_item\",\"id\":\"menu4\",\"params\":{\"itemId\":\"file-save\",\"label\":\"Save Now\",\"enabled\":1,\"checked\":-1}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse valid command");
    TEST_ASSERT(strcmp(method, "update_menu_item") == 0, "Method should be update_menu_item");

    // Extract parameters
    char itemId[256];
    char label[256];
    int enabled = 0, checked = 0;
    ipc_extract_param_string(params, "itemId", itemId, sizeof(itemId));
    ipc_extract_param_string(params, "label", label, sizeof(label));
    ipc_extract_param_int(params, "enabled", &enabled);
    ipc_extract_param_int(params, "checked", &checked);

    TEST_ASSERT(strcmp(itemId, "file-save") == 0, "itemId should be file-save");
    TEST_ASSERT(strcmp(label, "Save Now") == 0, "label should be Save Now");
    TEST_ASSERT(enabled == 1, "enabled should be 1");
    TEST_ASSERT(checked == -1, "checked should be -1");

    TEST_PASS();
}

int test_popup_menu_command_parsing() {
    TEST_START("popup_menu command parsing");

    char method[64], id[64], params[4096];

    // Test parsing popup_menu command
    const char* json = "{\"method\":\"popup_menu\",\"id\":\"popup1\",\"params\":{\"items\":\"[{\\\"id\\\":\\\"cut\\\",\\\"label\\\":\\\"Cut\\\"},{\\\"id\\\":\\\"copy\\\",\\\"label\\\":\\\"Copy\\\"}]\",\"x\":100,\"y\":200}}";

    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse valid command");
    TEST_ASSERT(strcmp(method, "popup_menu") == 0, "Method should be popup_menu");

    // Extract parameters
    char items[2048];
    int x = 0, y = 0;
    ipc_extract_param_string(params, "items", items, sizeof(items));
    ipc_extract_param_int(params, "x", &x);
    ipc_extract_param_int(params, "y", &y);

    TEST_ASSERT(strstr(items, "Cut") != NULL, "Items should contain Cut");
    TEST_ASSERT(x == 100, "x should be 100");
    TEST_ASSERT(y == 200, "y should be 200");

    TEST_PASS();
}

// ============================================================================
// Test Menu Item Structure
// ============================================================================

int test_menu_item_struct() {
    TEST_START("platform_menu_item_t structure");

    platform_menu_item_t item;
    memset(&item, 0, sizeof(item));

    // Set values
    strcpy(item.id, "test-item");
    strcpy(item.label, "Test Item");
    item.type = MENU_ITEM_NORMAL;
    item.role = MENU_ROLE_NONE;
    item.enabled = 1;
    item.checked = 0;
    strcpy(item.accelerator, "CmdOrCtrl+T");
    item.submenu_count = 0;
    item.submenu_items = NULL;

    // Verify
    TEST_ASSERT(strcmp(item.id, "test-item") == 0, "ID should be set");
    TEST_ASSERT(strcmp(item.label, "Test Item") == 0, "Label should be set");
    TEST_ASSERT(item.type == MENU_ITEM_NORMAL, "Type should be NORMAL");
    TEST_ASSERT(item.role == MENU_ROLE_NONE, "Role should be NONE");
    TEST_ASSERT(item.enabled == 1, "Enabled should be 1");
    TEST_ASSERT(item.checked == 0, "Checked should be 0");
    TEST_ASSERT(strcmp(item.accelerator, "CmdOrCtrl+T") == 0, "Accelerator should be set");

    TEST_PASS();
}

int test_menu_struct() {
    TEST_START("platform_menu_t structure");

    platform_menu_item_t items[2];
    memset(items, 0, sizeof(items));

    strcpy(items[0].id, "item1");
    strcpy(items[0].label, "Item 1");
    items[0].type = MENU_ITEM_NORMAL;
    items[0].enabled = 1;

    strcpy(items[1].id, "item2");
    items[1].type = MENU_ITEM_SEPARATOR;

    platform_menu_t menu;
    memset(&menu, 0, sizeof(menu));
    strcpy(menu.id, "file-menu");
    strcpy(menu.label, "File");
    menu.role = MENU_ROLE_NONE;
    menu.item_count = 2;
    menu.items = items;

    // Verify
    TEST_ASSERT(strcmp(menu.id, "file-menu") == 0, "Menu ID should be set");
    TEST_ASSERT(strcmp(menu.label, "File") == 0, "Menu label should be set");
    TEST_ASSERT(menu.item_count == 2, "Menu should have 2 items");
    TEST_ASSERT(menu.items != NULL, "Menu items should be set");
    TEST_ASSERT(strcmp(menu.items[0].label, "Item 1") == 0, "First item label should match");
    TEST_ASSERT(menu.items[1].type == MENU_ITEM_SEPARATOR, "Second item should be separator");

    TEST_PASS();
}

// ============================================================================
// Test Menu JSON Parsing Helper
// ============================================================================

int test_menu_json_with_accelerator() {
    TEST_START("menu JSON with accelerator");

    // Test that accelerator field is properly parsed
    const char* json = "{\"method\":\"set_menu\",\"id\":\"m1\",\"params\":{\"menus\":\"[{\\\"id\\\":\\\"edit\\\",\\\"label\\\":\\\"Edit\\\",\\\"items\\\":[{\\\"id\\\":\\\"undo\\\",\\\"label\\\":\\\"Undo\\\",\\\"accelerator\\\":\\\"CmdOrCtrl+Z\\\"}]}]\"}}";

    char method[64], id[64], params[4096];
    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse command");

    char menus[2048];
    ipc_extract_param_string(params, "menus", menus, sizeof(menus));
    TEST_ASSERT(strstr(menus, "CmdOrCtrl+Z") != NULL, "Should contain accelerator");

    TEST_PASS();
}

int test_menu_json_with_checkbox() {
    TEST_START("menu JSON with checkbox");

    const char* json = "{\"method\":\"set_menu\",\"id\":\"m2\",\"params\":{\"menus\":\"[{\\\"label\\\":\\\"View\\\",\\\"items\\\":[{\\\"id\\\":\\\"sidebar\\\",\\\"label\\\":\\\"Sidebar\\\",\\\"type\\\":\\\"checkbox\\\",\\\"checked\\\":true}]}]\"}}";

    char method[64], id[64], params[4096];
    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse command");

    char menus[2048];
    ipc_extract_param_string(params, "menus", menus, sizeof(menus));
    TEST_ASSERT(strstr(menus, "checkbox") != NULL, "Should contain checkbox type");
    TEST_ASSERT(strstr(menus, "true") != NULL, "Should contain checked:true");

    TEST_PASS();
}

int test_menu_json_with_submenu() {
    TEST_START("menu JSON with submenu");

    const char* json = "{\"method\":\"set_menu\",\"id\":\"m3\",\"params\":{\"menus\":\"[{\\\"label\\\":\\\"File\\\",\\\"items\\\":[{\\\"id\\\":\\\"recent\\\",\\\"label\\\":\\\"Recent\\\",\\\"type\\\":\\\"submenu\\\",\\\"submenu\\\":[{\\\"id\\\":\\\"doc1\\\",\\\"label\\\":\\\"doc1.txt\\\"}]}]}]\"}}";

    char method[64], id[64], params[4096];
    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse command");

    char menus[2048];
    ipc_extract_param_string(params, "menus", menus, sizeof(menus));
    TEST_ASSERT(strstr(menus, "submenu") != NULL, "Should contain submenu type");
    TEST_ASSERT(strstr(menus, "doc1.txt") != NULL, "Should contain nested item");

    TEST_PASS();
}

int test_menu_json_with_role() {
    TEST_START("menu JSON with role");

    const char* json = "{\"method\":\"set_menu\",\"id\":\"m4\",\"params\":{\"menus\":\"[{\\\"label\\\":\\\"Edit\\\",\\\"items\\\":[{\\\"role\\\":\\\"undo\\\"},{\\\"role\\\":\\\"redo\\\"}]}]\"}}";

    char method[64], id[64], params[4096];
    int result = ipc_parse_command(json, method, id, params);
    TEST_ASSERT(result == 1, "Should parse command");

    char menus[2048];
    ipc_extract_param_string(params, "menus", menus, sizeof(menus));
    TEST_ASSERT(strstr(menus, "undo") != NULL, "Should contain undo role");
    TEST_ASSERT(strstr(menus, "redo") != NULL, "Should contain redo role");

    TEST_PASS();
}

// ============================================================================
// Test Event Formatting
// ============================================================================

int test_menu_click_event_format() {
    TEST_START("menu click event format");

    // Simulate the event JSON that would be emitted on menu click
    char event_json[512];
    const char* menu_id = "file-save";

    snprintf(event_json, sizeof(event_json),
             "{\"type\":\"event\",\"event\":\"menu_click\",\"data\":{\"menuId\":\"%s\"}}",
             menu_id);

    TEST_ASSERT(strstr(event_json, "menu_click") != NULL, "Should contain event type");
    TEST_ASSERT(strstr(event_json, "file-save") != NULL, "Should contain menu ID");

    TEST_PASS();
}

// ============================================================================
// Edge Cases
// ============================================================================

int test_empty_menu_label() {
    TEST_START("empty menu label handling");

    platform_menu_item_t item;
    memset(&item, 0, sizeof(item));

    item.type = MENU_ITEM_SEPARATOR;
    // Separator doesn't need a label

    TEST_ASSERT(strlen(item.label) == 0, "Separator can have empty label");
    TEST_ASSERT(item.type == MENU_ITEM_SEPARATOR, "Type should be separator");

    TEST_PASS();
}

int test_long_menu_label() {
    TEST_START("long menu label handling");

    platform_menu_item_t item;
    memset(&item, 0, sizeof(item));

    // Fill with 255 characters (max for label buffer)
    for (int i = 0; i < 255; i++) {
        item.label[i] = 'A';
    }
    item.label[255] = '\0';

    TEST_ASSERT(strlen(item.label) == 255, "Label should be 255 chars");

    TEST_PASS();
}

int test_special_characters_in_label() {
    TEST_START("special characters in label");

    platform_menu_item_t item;
    memset(&item, 0, sizeof(item));

    strcpy(item.label, "Save & Close (Ctrl+S)...");

    TEST_ASSERT(strstr(item.label, "&") != NULL, "Should contain ampersand");
    TEST_ASSERT(strstr(item.label, "(") != NULL, "Should contain parenthesis");
    TEST_ASSERT(strstr(item.label, "...") != NULL, "Should contain ellipsis");

    TEST_PASS();
}

// ============================================================================
// Main Test Runner
// ============================================================================

int main() {
    printf("\n=== Native Menu Unit Tests ===\n\n");

    // Enum tests
    RUN_TEST(test_menu_item_type_enum);
    RUN_TEST(test_menu_item_role_enum);

    // IPC command parsing tests
    RUN_TEST(test_set_menu_command_parsing);
    RUN_TEST(test_set_default_menu_command_parsing);
    RUN_TEST(test_remove_menu_command_parsing);
    RUN_TEST(test_update_menu_item_command_parsing);
    RUN_TEST(test_popup_menu_command_parsing);

    // Structure tests
    RUN_TEST(test_menu_item_struct);
    RUN_TEST(test_menu_struct);

    // JSON parsing tests
    RUN_TEST(test_menu_json_with_accelerator);
    RUN_TEST(test_menu_json_with_checkbox);
    RUN_TEST(test_menu_json_with_submenu);
    RUN_TEST(test_menu_json_with_role);

    // Event format test
    RUN_TEST(test_menu_click_event_format);

    // Edge case tests
    RUN_TEST(test_empty_menu_label);
    RUN_TEST(test_long_menu_label);
    RUN_TEST(test_special_characters_in_label);

    printf("\n=================================\n");
    printf("Tests passed: %d/%d\n", tests_passed, tests_run);

    if (tests_passed == tests_run) {
        printf("\n*** All tests passed! ***\n\n");
        return 0;
    } else {
        printf("\n*** Some tests failed! ***\n\n");
        return 1;
    }
}
