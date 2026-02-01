# Simple Makefile for webview threading test
CC = gcc
CXX = g++

# Use MSYS2/MinGW64 on Windows if available
ifeq ($(OS),Windows_NT)
    # Try to detect MinGW/MSYS2 automatically first
    ifeq ($(shell which x86_64-w64-mingw32-gcc 2>/dev/null && echo "exists"),exists)
        CC = x86_64-w64-mingw32-gcc
        CXX = x86_64-w64-mingw32-g++
    else ifeq ($(shell which mingw32-gcc 2>/dev/null && echo "exists"),exists)
        CC = mingw32-gcc
        CXX = mingw32-g++
    # Check for MSYS2 MinGW64
    else ifeq ($(shell test -f "C:/msys64/mingw64/bin/g++.exe" && echo "exists"),exists)
        CC = C:/msys64/mingw64/bin/gcc.exe
        CXX = C:/msys64/mingw64/bin/g++.exe
    # Check for MSYS2 MinGW32
    else ifeq ($(shell test -f "C:/msys64/mingw32/bin/g++.exe" && echo "exists"),exists)
        CC = C:/msys64/mingw32/bin/gcc.exe
        CXX = C:/msys64/mingw32/bin/g++.exe
    # Check for standalone MinGW
    else ifeq ($(shell test -f "C:/mingw64/bin/g++.exe" && echo "exists"),exists)
        CC = C:/mingw64/bin/gcc.exe
        CXX = C:/mingw64/bin/g++.exe
    # Check for standalone MinGW32
    else ifeq ($(shell test -f "C:/mingw32/bin/g++.exe" && echo "exists"),exists)
        CC = C:/mingw32/bin/gcc.exe
        CXX = C:/mingw32/bin/g++.exe
    # Fallback to default system compilers
    else
        CC = gcc
        CXX = g++
    endif
endif

CFLAGS = -std=c99 -Wall -Wextra -Iwebview_adapter/include -I../vendors/cJSON -I.
CXXFLAGS = -std=c++11 -Wall -Wextra -Iwebview_adapter/include -I../vendors/cJSON -I.

# Build directory
BUILD_DIR = build

# Common IPC utilities
IPC_COMMON = common/ipc_common.c ../vendors/cJSON/cJSON.c

# Test files
TEST_DIR = tests
TEST_IPC_COMMON = $(TEST_DIR)/test_ipc_common.c


# Platform-specific settings
UNAME_S := $(shell uname -s)

ifeq ($(UNAME_S),Linux)
    # Linux with GTK/WebKitGTK
    CFLAGS += $(shell pkg-config --cflags gtk+-3.0 webkit2gtk-4.0 libnotify)
    LDFLAGS += $(shell pkg-config --libs gtk+-3.0 webkit2gtk-4.0 libnotify) -lpthread
    WEBVIEW_IMPL = webview_adapter/src/webview.cc
    PLATFORM_IMPL = platform/platform_window_linux.c
    TRAY_PLATFORM_IMPL = platform/platform_tray_linux.c
    TARGET_EXT = 
endif

ifeq ($(UNAME_S),Darwin)
    # macOS with Cocoa/WebKit
    CFLAGS += -DWEBVIEW_COCOA=1 -DTRONBUN_CUSTOM_SCHEME=1
    CXXFLAGS += -DTRONBUN_CUSTOM_SCHEME=1
    LDFLAGS += -framework Cocoa -framework WebKit -framework UserNotifications -framework UniformTypeIdentifiers
    WEBVIEW_IMPL = webview_adapter/src/webview.cc
    PLATFORM_IMPL = platform/platform_window_macos.mm
    CHILD_VIEW_IMPL = platform/platform_child_view_macos.mm
    SCREENSHOT_IMPL = platform/platform_screenshot_macos.mm
    CDP_IMPL = platform/platform_cdp_macos.mm
    FILE_DIALOG_IMPL = platform/platform_file_dialog_macos.mm
    MENU_IMPL = platform/platform_menu_macos.mm
    TRAY_PLATFORM_IMPL = platform/platform_tray_macos.mm
    VIRTUAL_FS_IMPL = platform/virtual_fs.c platform/url_scheme_handler_macos.mm
    TARGET_EXT =
endif

ifeq ($(OS),Windows_NT)
    # Windows with WebView2
    CFLAGS += -DWEBVIEW_EDGE=1 -DUNICODE -D_UNICODE -DTRONBUN_CUSTOM_SCHEME=1
    CXXFLAGS += -DUNICODE -D_UNICODE -DTRONBUN_CUSTOM_SCHEME=1
    LDFLAGS += -ladvapi32 -lole32 -lshell32 -lshlwapi -luser32 -lversion -ldwmapi -lcomctl32 -luuid
    WEBVIEW_IMPL = webview_adapter/src/webview.cc
    PLATFORM_IMPL = platform/platform_window_win.c
    CHILD_VIEW_IMPL = platform/platform_child_view_win.cpp
    SCREENSHOT_IMPL = platform/platform_screenshot_win.cpp
    FILE_DIALOG_IMPL = platform/platform_file_dialog_win.cpp
    MENU_IMPL = platform/platform_menu_win.cpp
    TRAY_PLATFORM_IMPL = platform/platform_tray_win.c
    VIRTUAL_FS_IMPL = platform/virtual_fs.c platform/url_scheme_handler_win.cpp
    CDP_IMPL = platform/platform_cdp_win.cpp
    TARGET_EXT = _win.exe

    # Static linking flags for Windows
    LDFLAGS += -lwinpthread
    STATIC_CXXFLAGS = $(CXXFLAGS) -static-libgcc -static-libstdc++
    STATIC_LDFLAGS = $(LDFLAGS) -static-libgcc -static-libstdc++

    # Full static linking (if available)
    FULL_STATIC_CXXFLAGS = $(CXXFLAGS) -static
    FULL_STATIC_LDFLAGS = -static -ladvapi32 -lole32 -lshell32 -lshlwapi -luser32 -lversion -ldwmapi -lcomctl32 -lwinpthread
endif

TARGETS = $(BUILD_DIR)/webview_main$(TARGET_EXT) $(BUILD_DIR)/tray_main$(TARGET_EXT)
STATIC_TARGETS = $(BUILD_DIR)/webview_main_static$(TARGET_EXT) $(BUILD_DIR)/tray_main_static$(TARGET_EXT)
FULL_STATIC_TARGETS = $(BUILD_DIR)/webview_main_full_static$(TARGET_EXT) $(BUILD_DIR)/tray_main_full_static$(TARGET_EXT)

.PHONY: all clean help test test-clean test-all test-app test-resize static full-static

all: $(TARGETS)


static: $(STATIC_TARGETS)

full-static: $(FULL_STATIC_TARGETS)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/webview_main$(TARGET_EXT): webview_main.c $(WEBVIEW_IMPL) $(PLATFORM_IMPL) $(CHILD_VIEW_IMPL) $(SCREENSHOT_IMPL) $(CDP_IMPL) $(FILE_DIALOG_IMPL) $(MENU_IMPL) $(IPC_COMMON) $(VIRTUAL_FS_IMPL) | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -o $@ $< $(WEBVIEW_IMPL) $(PLATFORM_IMPL) $(CHILD_VIEW_IMPL) $(SCREENSHOT_IMPL) $(CDP_IMPL) $(FILE_DIALOG_IMPL) $(MENU_IMPL) $(IPC_COMMON) $(VIRTUAL_FS_IMPL) $(LDFLAGS)

$(BUILD_DIR)/tray_main$(TARGET_EXT): tray_main.c $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) | $(BUILD_DIR)
ifeq ($(UNAME_S),Darwin)
	$(CXX) $(CXXFLAGS) -o $@ $< $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) $(LDFLAGS)
else
	$(CC) $(CFLAGS) -o $@ $< $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) $(LDFLAGS)
endif

$(BUILD_DIR)/webview_main_static$(TARGET_EXT): webview_main.c $(WEBVIEW_IMPL) $(PLATFORM_IMPL) $(CHILD_VIEW_IMPL) $(SCREENSHOT_IMPL) $(CDP_IMPL) $(FILE_DIALOG_IMPL) $(MENU_IMPL) $(IPC_COMMON) $(VIRTUAL_FS_IMPL) | $(BUILD_DIR)
ifeq ($(OS),Windows_NT)
	$(CXX) $(STATIC_CXXFLAGS) -o $@ $< $(WEBVIEW_IMPL) $(PLATFORM_IMPL) $(CHILD_VIEW_IMPL) $(SCREENSHOT_IMPL) $(CDP_IMPL) $(FILE_DIALOG_IMPL) $(MENU_IMPL) $(IPC_COMMON) $(VIRTUAL_FS_IMPL) $(STATIC_LDFLAGS)
else
	@echo "Static linking is currently only supported on Windows"
	@echo "Building regular version instead..."
	$(CXX) $(CXXFLAGS) -o $@ $< $(WEBVIEW_IMPL) $(PLATFORM_IMPL) $(CHILD_VIEW_IMPL) $(SCREENSHOT_IMPL) $(CDP_IMPL) $(FILE_DIALOG_IMPL) $(MENU_IMPL) $(IPC_COMMON) $(VIRTUAL_FS_IMPL) $(LDFLAGS)
endif

$(BUILD_DIR)/tray_main_static$(TARGET_EXT): tray_main.c $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) | $(BUILD_DIR)
ifeq ($(OS),Windows_NT)
	$(CC) $(CFLAGS) -static-libgcc -static-libstdc++ -o $@ $< $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) $(STATIC_LDFLAGS)
else
	@echo "Static linking is currently only supported on Windows"
	@echo "Building regular version instead..."
ifeq ($(UNAME_S),Darwin)
	$(CXX) $(CXXFLAGS) -o $@ $< $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) $(LDFLAGS)
else
	$(CC) $(CFLAGS) -o $@ $< $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) $(LDFLAGS)
endif
endif

$(BUILD_DIR)/webview_main_full_static$(TARGET_EXT): webview_main.c $(WEBVIEW_IMPL) $(PLATFORM_IMPL) $(CHILD_VIEW_IMPL) $(SCREENSHOT_IMPL) $(CDP_IMPL) $(FILE_DIALOG_IMPL) $(MENU_IMPL) $(IPC_COMMON) $(VIRTUAL_FS_IMPL) | $(BUILD_DIR)
ifeq ($(OS),Windows_NT)
	$(CXX) $(FULL_STATIC_CXXFLAGS) -o $@ $< $(WEBVIEW_IMPL) $(PLATFORM_IMPL) $(CHILD_VIEW_IMPL) $(SCREENSHOT_IMPL) $(CDP_IMPL) $(FILE_DIALOG_IMPL) $(MENU_IMPL) $(IPC_COMMON) $(VIRTUAL_FS_IMPL) $(FULL_STATIC_LDFLAGS)
else
	@echo "Full static linking is currently only supported on Windows"
	@echo "Building regular version instead..."
	$(CXX) $(CXXFLAGS) -o $@ $< $(WEBVIEW_IMPL) $(PLATFORM_IMPL) $(CHILD_VIEW_IMPL) $(SCREENSHOT_IMPL) $(CDP_IMPL) $(FILE_DIALOG_IMPL) $(MENU_IMPL) $(IPC_COMMON) $(VIRTUAL_FS_IMPL) $(LDFLAGS)
endif

$(BUILD_DIR)/tray_main_full_static$(TARGET_EXT): tray_main.c $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) | $(BUILD_DIR)
ifeq ($(OS),Windows_NT)
	$(CC) $(CFLAGS) -static -o $@ $< $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) $(FULL_STATIC_LDFLAGS)
else
	@echo "Full static linking is currently only supported on Windows"
	@echo "Building regular version instead..."
ifeq ($(UNAME_S),Darwin)
	$(CXX) $(CXXFLAGS) -o $@ $< $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) $(LDFLAGS)
else
	$(CC) $(CFLAGS) -o $@ $< $(TRAY_PLATFORM_IMPL) $(IPC_COMMON) $(LDFLAGS)
endif
endif


# Convenience targets
webview_main: $(BUILD_DIR)/webview_main$(TARGET_EXT)
webview_main_static: $(BUILD_DIR)/webview_main_static$(TARGET_EXT)
webview_main_full_static: $(BUILD_DIR)/webview_main_full_static$(TARGET_EXT)


clean:
	rm -rf $(BUILD_DIR)
	rm -f webview_title.txt webview_commands.txt webview_responses.txt

help:
	@echo "Available targets:"
	@echo "  all              - Build regular webview executable"

	@echo "  static           - Build webview with static linking (Windows only)"
	@echo "  full-static      - Build webview with full static linking (Windows only)"
	@echo "  webview_main     - Build the main webview program"
	@echo "  webview_main_static - Build the main webview program with static linking"
	@echo "  webview_main_full_static - Build the main webview program with full static linking"

	@echo "  test             - Run unit tests for IPC common utilities"
	@echo "  test-all         - Run all unit tests"
	@echo "  test-app         - Run webview application for manual testing"
	@echo "  test-clean       - Remove test binaries"
	@echo "  clean            - Remove built executables and temp files"
	@echo "  help             - Show this help message"
	@echo ""
	@echo "Usage:"
	@echo "  1. make all          # Regular build"
	@echo "  2. make static       # Static build (Windows)"
	@echo "  3. make full-static  # Full static build (Windows)"
	@echo "  4. ./$(BUILD_DIR)/webview_main$(TARGET_EXT)"
	@echo "  5. ./$(BUILD_DIR)/webview_main_static$(TARGET_EXT)"
	@echo "  6. ./$(BUILD_DIR)/webview_main_full_static$(TARGET_EXT)"
	@echo ""
	@echo "Compiler detection:"
	@echo "  CC=$(CC)"
	@echo "  CXX=$(CXX)"

# Unit test targets
test: $(BUILD_DIR)/test_ipc_common
	@echo "🧪 Running IPC Common unit tests..."
	@$(BUILD_DIR)/test_ipc_common

test-memory: $(BUILD_DIR)/test_memory_leaks
	@echo "🧪 Running Memory Leak tests..."
	@$(BUILD_DIR)/test_memory_leaks
ifeq ($(UNAME_S),Darwin)
	@echo ""
	@echo "🔍 Running macOS leaks check..."
	@leaks --atExit -- $(BUILD_DIR)/test_memory_leaks 2>&1 | tail -5
endif

$(BUILD_DIR)/test_ipc_common: $(TEST_IPC_COMMON) $(IPC_COMMON) | $(BUILD_DIR)
	$(CC) $(CFLAGS) -DTEST_BUILD -o $@ $< $(IPC_COMMON)

$(BUILD_DIR)/test_memory_leaks: $(TEST_DIR)/test_memory_leaks.c $(IPC_COMMON) platform/virtual_fs.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -DTEST_BUILD -o $@ $< $(IPC_COMMON) platform/virtual_fs.c

$(BUILD_DIR)/test_dialogs: $(TEST_DIR)/test_dialogs.c $(IPC_COMMON) | $(BUILD_DIR)
	$(CC) $(CFLAGS) -DTEST_BUILD -o $@ $< $(IPC_COMMON)

$(BUILD_DIR)/test_menu: $(TEST_DIR)/test_menu.c $(IPC_COMMON) | $(BUILD_DIR)
	$(CC) $(CFLAGS) -DTEST_BUILD -o $@ $< $(IPC_COMMON)

$(BUILD_DIR)/test_resize: $(TEST_DIR)/test_resize.c $(IPC_COMMON) | $(BUILD_DIR)
	$(CC) $(CFLAGS) -DTEST_BUILD -o $@ $< $(IPC_COMMON)

test-clean:
	rm -f $(BUILD_DIR)/test_*
	@echo "Test binaries cleaned"

test-dialogs: $(BUILD_DIR)/test_dialogs
	@echo "🧪 Running Dialog unit tests..."
	@$(BUILD_DIR)/test_dialogs

test-menu: $(BUILD_DIR)/test_menu
	@echo "🧪 Running Menu unit tests..."
	@$(BUILD_DIR)/test_menu

test-resize: $(BUILD_DIR)/test_resize
	@echo "🧪 Running Window Resize Callback unit tests..."
	@$(BUILD_DIR)/test_resize

test-all: test test-memory test-dialogs test-menu test-resize
	@echo "✅ All native tests completed successfully!"

# Application test target (run the actual webview)
test-app: all
	@echo "Starting webview_main for manual testing..."
	@echo "Press Ctrl+C to stop the webview when done."
	@./$(BUILD_DIR)/webview_main$(TARGET_EXT)

# Debug target to show build information
debug:
	@echo "Build Configuration:"
	@echo "  OS: $(OS)"
	@echo "  UNAME_S: $(UNAME_S)"
	@echo "  CC: $(CC)"
	@echo "  CXX: $(CXX)"
	@echo "  CFLAGS: $(CFLAGS)"
	@echo "  CXXFLAGS: $(CXXFLAGS)"
	@echo "  LDFLAGS: $(LDFLAGS)"
	@echo "  WEBVIEW_IMPL: $(WEBVIEW_IMPL)"
	@echo "  TARGET_EXT: $(TARGET_EXT)"