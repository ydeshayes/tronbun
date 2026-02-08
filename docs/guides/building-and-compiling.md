# Building & Compiling Guide

This guide covers the build pipeline, development workflow, and compilation process for creating distributable applications.

## Development Workflow

### `tronbun dev`

The fastest way to develop. Starts your app with hot reload:

```bash
npx tronbun dev
```

**What happens:**

1. Full build (backend + types + frontend)
2. App launches with `TRONBUN_DEV_MODE=true`
3. File watchers start monitoring:

| Watch Target | Extensions | On Change |
|-------------|------------|-----------|
| Backend (`src/`) | `.ts`, `.js` | Rebuild backend + types, restart app |
| Frontend (`src/web/`) | `.ts`, `.tsx`, `.js`, `.jsx`, `.html`, `.css` | Rebuild frontend, hot reload (no restart) |
| Public (`public/`) | All files | Rebuild frontend |

**Hot reload** works via a `.dev-reload` timestamp file. When the frontend detects the file has changed, it reloads content without restarting the native process.

**Detecting dev mode** in your code:

```typescript
if (process.env.TRONBUN_DEV_MODE === "true") {
  // Enable dev tools, verbose logging, etc.
}
```

## Build Process

### `tronbun build`

Compiles your TypeScript source into runnable JavaScript:

```bash
npx tronbun build
npx tronbun build --watch    # Rebuild on changes
npx tronbun build --dev      # Skip minification
```

**Build steps:**

1. **Backend build** — Compiles `backend.entry` to `backend.outDir` using `bun build`
   - Target: `bun` runtime
   - Minification: respects `build.minify` (skipped in `--dev` mode)
   - Sourcemaps: respects `build.sourcemap`

2. **Type generation** — Scans for `@windowName` and `@mainHandler` decorators, generates `src/ipc-types.ts`

3. **Frontend build** — Compiles `web.entry` to `web.outDir` using `bun build`
   - Target: `browser`
   - Format: ESM (ES Modules)
   - Clears output directory before building

4. **Public assets** — Copies contents of `web.publicDir` to `web.outDir`

### `tronbun run`

Runs the previously built application:

```bash
npx tronbun build && npx tronbun run
```

Executes `bun dist/main.js` (or whatever your built entry is).

### `tronbun clean`

Removes build artifacts:

```bash
npx tronbun clean
```

Deletes `backend.outDir` and `web.outDir`.

## Compilation

### `tronbun compile`

Creates a standalone native executable with all assets embedded:

```bash
npx tronbun compile
npx tronbun compile -o my-app
npx tronbun compile --platform macos
npx tronbun compile --platform windows
```

### How Compilation Works

```
Source files
    │
    ▼
Build (backend + frontend)
    │
    ▼
Collect web assets from dist/web/
    │  ├── Skip .map files
    │  ├── Remove sourcemap references
    │  └── Optionally obfuscate JS
    │
    ▼
Compress (gzip) + base64 encode
    │
    ▼
Generate embedded-assets.ts
    │  (registers __TRONBUN_EMBEDDED_FILES_COMPRESSED__)
    │
    ▼
bun build --compile
    │
    ▼
Copy native helpers (webview_main, tray_main, libnotification)
    │
    ▼
Platform packaging (Info.plist, code signing, etc.)
    │
    ▼
Clean up temporary files
```

### macOS App Bundle

Output structure:

```
MyApp.app/
├── Contents/
│   ├── MacOS/
│   │   ├── MyApp                     # Main Bun executable
│   │   ├── webview_main              # Native webview process
│   │   ├── tray_main                 # Native tray process
│   │   └── libnotification.dylib     # Notification FFI library
│   ├── Resources/
│   │   ├── icon.icns                 # App icon
│   │   └── assets/                   # Copied from project assets/
│   └── Info.plist                    # Bundle metadata
```

**Info.plist** is generated with:
- `CFBundleIdentifier` from `app.identifier` config
- `CFBundleIconFile` pointing to icon.icns
- `LSUIElement = true` (no dock icon by default)
- `NSHighResolutionCapable = true` (Retina support)
- Minimum macOS version: 10.15
- Optional `LSApplicationCategoryType` from `app.category`

The bundle is **ad-hoc code signed** with `codesign --force --deep -s -`.

### Windows Executable

Output structure:

```
build/
├── MyApp.exe                         # Main Bun executable
├── webview_main_win.exe              # Native webview process
├── tray_main_win.exe                 # Native tray process
└── libnotification.dll               # Notification FFI library
```

All files in `build/` must be distributed together.

### Asset Embedding

All web assets are embedded into the executable:

- **No external `dist/` folder** needed in distribution
- Assets are gzip-compressed and base64-encoded (40-80% size reduction)
- Available at runtime as `globalThis.__TRONBUN_EMBEDDED_FILES_COMPRESSED__`
- `Window.navigate()` auto-detects compiled mode and uses `setHtml()` with embedded content

### Code Obfuscation

Enable in `tronbun.config.json` to protect frontend code:

```json
{
  "build": {
    "obfuscation": {
      "enabled": true,
      "compact": true,
      "stringArray": true,
      "stringArrayEncoding": ["base64"]
    }
  }
}
```

Obfuscation is applied only during compilation, not during `build` or `dev`.

**Warnings:**
- `renameGlobals: true` breaks `window.*` IPC APIs
- `selfDefending: true` may cause issues with React
- `unicodeEscapeSequence: true` impacts performance

See [Configuration](../configuration.md#buildobfuscation--code-protection) for all options.

## Native Prerequisites

Before compiling, you need the native webview components built:

```bash
cd webview && make all
```

This compiles platform-specific binaries:
- **macOS**: `webview_main`, `tray_main`, `TronbunNotifier.app`, `libnotification.dylib`
- **Windows**: `webview_main_win.exe`, `tray_main_win.exe`, `libnotification.dll`

These are required by the compile step and are copied into the app bundle.

## Cross-Compilation

Use `--platform` to target a specific platform:

```bash
# On macOS, target macOS explicitly
npx tronbun compile --platform macos

# Target Windows (requires Windows native binaries)
npx tronbun compile --platform windows
```

The default (`auto`) detects the current platform.

Note: Cross-compilation requires having the target platform's native binaries available. Building Windows binaries on macOS (or vice versa) requires cross-compilation of the native C/C++ components.

## Customizing Output

### Custom executable name

```bash
npx tronbun compile -o "My Cool App"
```

### App icon

Set in `tronbun.config.json`:

```json
{
  "app": {
    "icon": "assets/icon.icns",
    "iconWin": "assets/icon.ico"
  }
}
```

### Bundle identifier

```json
{
  "app": {
    "identifier": "com.mycompany.myapp",
    "category": "public.app-category.productivity"
  }
}
```

## See Also

- [CLI Reference](../cli.md) — Full command documentation
- [Configuration](../configuration.md) — All config options
- [Cross-Platform Guide](cross-platform.md) — Platform-specific considerations
