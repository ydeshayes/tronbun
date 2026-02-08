# Cross-Platform Development Guide

Tronbun supports macOS and Windows. This guide covers platform differences, best practices, and common pitfalls.

## Supported Platforms

| Platform | Webview Engine | Min Version | Status |
|----------|---------------|-------------|--------|
| macOS | WebKit (WKWebView) | 10.15 (Catalina) | Full support |
| Windows | WebView2 (Chromium) | Windows 10 | Full support |
| Linux | WebKitGTK | — | Experimental |

## Architecture Overview

Tronbun's native layer uses platform-specific implementations behind a common C interface:

```
webview/
├── platform/
│   ├── platform_window_macos.mm    # macOS window (Objective-C++)
│   ├── platform_window_win.c       # Windows window
│   ├── platform_window_linux.c     # Linux window
│   ├── platform_tray_macos.mm      # macOS tray
│   ├── platform_tray_win.c         # Windows tray
│   └── ...
├── webview_main.c                  # Cross-platform entry point
├── tray_main.c                     # Cross-platform tray entry
└── common/
    └── ipc_common.c                # Shared IPC protocol
```

Your TypeScript code is fully cross-platform. Platform differences are handled in the native layer.

## Platform Differences

### Webview Engine

| Feature | macOS (WebKit) | Windows (WebView2) |
|---------|---------------|-------------------|
| JavaScript ES2022+ | Yes | Yes |
| CSS Grid/Flexbox | Yes | Yes |
| Web Workers | Yes | Yes |
| WebRTC | Yes | Yes |
| Custom protocol (`tronbun://`) | WKURLSchemeHandler | WebResourceRequested |
| DevTools | Safari-style | Chrome-style |

Both engines support modern web standards. Differences are rare but can occur with bleeding-edge CSS features or experimental Web APIs.

### Window Behavior

| Feature | macOS | Windows |
|---------|-------|---------|
| Title bar | Unified style | Classic/Windows 11 |
| Transparency | Full support | Limited (DWM-dependent) |
| Background blur | `NSVisualEffectView` | Acrylic/Mica |
| Frameless mode | Works | Works |
| Always on top | Works | Works |
| Window opacity | 0.0-1.0 | 0.0-1.0 |

### Menus

| Feature | macOS | Windows |
|---------|-------|---------|
| Application menu bar | Native (top of screen) | Native (in window) |
| Menu roles | Full support (about, services, etc.) | Partial (no macOS-specific roles) |
| Context menus | Native | Native |
| Keyboard accelerators | `Cmd+` shortcuts | `Ctrl+` shortcuts |

Use `CmdOrCtrl` in accelerator strings for cross-platform shortcuts:

```typescript
{ accelerator: "CmdOrCtrl+S" }  // Cmd+S on macOS, Ctrl+S on Windows
```

macOS-specific roles (`"services"`, `"hide"`, `"hideOthers"`, `"unhide"`, `"startSpeaking"`, `"stopSpeaking"`) are ignored on Windows.

### Notifications

| Feature | macOS | Windows |
|---------|-------|---------|
| Permission model | `UNUserNotificationCenter` | Toast notifications |
| Action buttons | Supported | Supported |
| Dev mode | TronbunNotifier.app helper | Direct |
| Compiled mode | libnotification.dylib (FFI) | libnotification.dll (FFI) |

**macOS quirk:** On macOS 15 (Sequoia) with ad-hoc signed apps, the native permission dialog may not appear. Tronbun handles this by showing a fallback dialog directing users to System Settings.

### System Tray

| Feature | macOS | Windows |
|---------|-------|---------|
| Icon size | 22x22 (template images) | 16x16 or 32x32 |
| Icon format | PNG, template images | ICO preferred, PNG |
| Tooltip | Supported | Supported |
| Menu | Dropdown | Context menu |

### File Dialogs

Both platforms use native file dialogs with the same API. Platform-specific behaviors:

- **macOS**: Uses `NSOpenPanel` / `NSSavePanel`
- **Windows**: Uses `IFileOpenDialog` / `IFileSaveDialog`

File filter extensions work the same on both platforms.

### Compilation Output

| | macOS | Windows |
|---|-------|---------|
| Format | `.app` bundle | `.exe` + companion files |
| Code signing | Ad-hoc (`codesign`) | Not automated |
| Icon | `.icns` in Resources | `.ico` (requires external tool) |
| Distribution | Zip or DMG | Zip or installer |

## Best Practices

### 1. Use Cross-Platform Paths

Bun's `path` module handles platform differences:

```typescript
import { join } from "path";

// Good — works on both platforms
const configPath = join(process.cwd(), "config", "settings.json");

// Bad — macOS-only
const configPath = `${process.cwd()}/config/settings.json`;
```

### 2. Use CmdOrCtrl for Shortcuts

```typescript
// Good
{ accelerator: "CmdOrCtrl+S" }

// Bad — only works on macOS
{ accelerator: "Cmd+S" }
```

### 3. Handle Platform-Specific Icons

```json
{
  "app": {
    "icon": "assets/icon.icns",
    "iconWin": "assets/icon.ico"
  },
  "tray": {
    "icon": "assets/tray-icon.png"
  }
}
```

Provide icons in the correct format for each platform.

### 4. Detect Platform When Needed

```typescript
if (process.platform === "darwin") {
  // macOS-specific behavior
  await win.menu.setMenu([
    { label: "MyApp", items: [{ role: "about" }, { role: "quit" }] },
    ...otherMenus,
  ]);
} else {
  // Windows: no app-name menu needed
  await win.menu.setMenu(otherMenus);
}
```

### 5. Test Both Platforms

The same TypeScript code runs on both platforms, but always verify:
- Window appearance and layout
- Menu behavior
- Notification permissions
- File path handling
- Native dialog appearance

### 6. Use CSS for Platform-Specific Styling

```css
/* Detect platform via JavaScript and set a class on <body> */
body.platform-darwin {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}

body.platform-win32 {
  font-family: "Segoe UI", sans-serif;
}
```

Set the class from your init script:

```typescript
this.init(`
  document.body.classList.add("platform-" + "${process.platform}");
`);
```

## Common Pitfalls

### Dock Icon on macOS

Compiled apps set `LSUIElement = true` by default (no dock icon). To show a dock icon, you'll need to modify the generated `Info.plist` or handle it programmatically.

### Windows WebView2 Runtime

Windows users need the WebView2 runtime installed. It's included with Windows 11 and recent Windows 10 updates. For older systems, bundle the Evergreen WebView2 Runtime bootstrapper.

### File Path Separators

While Bun handles `/` on Windows, native file dialogs may return `\` paths. Normalize paths when needed:

```typescript
const normalizedPath = filePath.replace(/\\/g, "/");
```

### macOS Notification Permissions

Ad-hoc signed apps on macOS 15+ may not trigger the system permission dialog. Always handle the `"denied"` and `"unavailable"` states from `requestPermission()`.

## See Also

- [Configuration](../configuration.md) — Platform-specific config options
- [Building & Compiling](building-and-compiling.md) — Compilation for each platform
- [Notification API](../api/notification.md) — Platform notification details
