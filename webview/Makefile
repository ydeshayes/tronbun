# Simple Makefile for webview threading test
CC = gcc
CXX = g++
CFLAGS = -std=c99 -Wall -Wextra -I../vendors/webview/core/include
CXXFLAGS = -std=c++11 -Wall -Wextra -I../vendors/webview/core/include

# Build directory
BUILD_DIR = build

# Platform-specific settings
UNAME_S := $(shell uname -s)

ifeq ($(UNAME_S),Linux)
    # Linux with GTK/WebKitGTK
    CFLAGS += $(shell pkg-config --cflags gtk+-3.0 webkit2gtk-4.0)
    LDFLAGS += $(shell pkg-config --libs gtk+-3.0 webkit2gtk-4.0) -lpthread
    WEBVIEW_IMPL = ../vendors/webview/core/src/webview.cc
endif

ifeq ($(UNAME_S),Darwin)
    # macOS with Cocoa/WebKit
    CFLAGS += -DWEBVIEW_COCOA=1
    LDFLAGS += -framework Cocoa -framework WebKit
    WEBVIEW_IMPL = ../vendors/webview/core/src/webview.cc
endif

ifeq ($(OS),Windows_NT)
    # Windows with WebView2
    CFLAGS += -DWEBVIEW_EDGE=1
    LDFLAGS += -ladvapi32 -lole32 -lshell32 -lshlwapi -luser32 -lversion
    WEBVIEW_IMPL = ../vendors/webview/core/src/webview.cc
endif

TARGETS = $(BUILD_DIR)/webview_main

.PHONY: all clean help test

all: $(TARGETS)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/webview_main: webview_main.c $(WEBVIEW_IMPL) | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -o $@ $< $(WEBVIEW_IMPL) $(LDFLAGS)

# Convenience target for just 'webview_main'
webview_main: $(BUILD_DIR)/webview_main

clean:
	rm -rf $(BUILD_DIR)
	rm -f webview_title.txt webview_commands.txt webview_responses.txt

help:
	@echo "Available targets:"
	@echo "  all          - Build both programs"
	@echo "  webview_main - Build the main webview program with threading"
	@echo "  clean        - Remove built executables and temp files"
	@echo "  help         - Show this help message"
	@echo ""
	@echo "Usage:"
	@echo "  1. make all"
	@echo "  2. ./$(BUILD_DIR)/webview_main"

# Simple test target
test: all
	@echo "Starting webview_main in the background..."
	@echo "Press Ctrl+C to stop the webview when done."
	@./$(BUILD_DIR)/webview_main