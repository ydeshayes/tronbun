# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tronbun is a desktop application framework that combines Bun's performance with native webviews. It enables building desktop apps using TypeScript for both backend (Bun) and frontend (webview) with seamless IPC communication.

## Build Commands

```bash
# Build the native webview component (required for development)
cd webview && make all

# Run the CLI during development
bun run cli/index.ts <command>

# CLI commands for consumer projects using tronbun:
# npx tronbun init my-app    # Create new project
# npx tronbun build          # Build backend and frontend
# npx tronbun dev            # Development mode with hot reload
# npx tronbun compile        # Create executable
```

## Architecture

### Native Layer (`webview/`)
The native webview is built in C/C++ with platform-specific implementations:
- `webview_main.c` - Main webview process, uses webview library from `webview_adapter/`
- `tray_main.c` - System tray functionality
- `platform/platform_window_*.c/.mm` - Platform-specific window implementations (Linux/macOS/Windows)
- `platform/platform_tray_*.c/.mm` - Platform-specific tray implementations
- `common/ipc_common.c` - JSON-based IPC protocol shared between processes

Build output goes to `webview/build/` as executables (`webview_main`, `tray_main`).

### TypeScript Layer (`src/`)
- `BaseProcess.ts` - Abstract base class managing native process lifecycle. Spawns executables, handles stdin/stdout JSON-line communication, manages pending commands with timeouts.
- `Webview.ts` - Extends BaseProcess for webview control
- `Window.ts` - High-level window API with IPC handler registration. Wraps Webview, manages hot reload.
- `WindowIPC.ts` - Decorator-based approach extending Window. Auto-registers methods decorated with `@mainHandler`, injects typed client-side APIs.
- `decorators.ts` - `@windowName` and `@mainHandler` decorators with global metadata registry
- `Tray.ts` - System tray API with menu support
- `utils.ts` - Helper functions including `findWebAssetPath`, `setupHotReload`

### CLI (`cli/`)
- `cli.ts` - Main CLI class orchestrating commands
- `commands/` - Individual command implementations (build, dev, compile, init, clean, run, generate-types)
- `config.ts` - Loads `tronbun.config.json`

### IPC Communication Pattern
Bun spawns native processes and communicates via JSON lines over stdin/stdout:
1. TypeScript sends: `{"method": "...", "id": "...", "params": {...}}\n`
2. Native process responds: `{"type": "response", "id": "...", "result": ...}\n`
3. For frontend→backend IPC, webview sends: `{"type": "ipc_call", "channel": "...", "data": ...}\n`

The IPC system uses dynamic memory allocation for large payloads (up to 256MB). Key functions:
- `ipc_read_line()` - dynamically reads arbitrarily large lines from stdin
- `ipc_extract_param_string_alloc()` - extracts large string params with dynamic allocation
- `ipc_parse_command_alloc()` - parses commands with dynamically allocated params

## Testing

```bash
# Run native IPC unit tests
cd webview && make test

# Manual webview testing
cd webview && make test-app
```

## Key Patterns

- Debug logging enabled via `TRONBUN_DEBUG=1` environment variable
- Development mode uses `TRONBUN_DEV_MODE` for hot reload features
- The decorator system (`@windowName`, `@mainHandler`) automatically generates typed frontend APIs matching backend handlers

## Production Build & Asset Embedding

When compiling (`npx tronbun compile`):
1. Web assets (HTML, JS, CSS) are bundled and inlined into a single HTML string
2. This is embedded into the executable via a generated `embedded-assets.ts`
3. `Window.navigate()` auto-detects compiled mode and uses `setHtml()` with embedded content
4. No external `dist/` folder is created in the app bundle
5. Source maps (`.map` files) are excluded from production builds

In dev mode, `navigate()` uses file:// URLs for hot reload support.

## Cross-Platform Requirements

**All implementations must work on both macOS and Windows.** When adding new features:

1. **Native code** - Implement platform-specific versions in `platform/` folder:
   - macOS: `*_macos.mm` (Objective-C++)
   - Windows: `*_win.c` or `*_win.cpp`
   - Linux: `*_linux.c` (if supported)

2. **Makefile** - Update `webview/Makefile` to include new files for each platform section (`Darwin`, `Windows_NT`, `Linux`)

3. **WebView specifics**:
   - macOS uses WebKit (`WKWebView`, `WKURLSchemeHandler`)
   - Windows uses WebView2 (`ICoreWebView2`, `WebResourceRequested`)

4. **Test on both platforms** before considering a feature complete
