# Configuration Reference

Tronbun projects are configured via `tronbun.config.json` in the project root.

## Full Schema

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "src/main.ts",
  "web": { ... },
  "backend": { ... },
  "build": { ... },
  "app": { ... },
  "window": { ... },
  "tray": { ... },
  "notifications": { ... }
}
```

## Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | `"tronbun-app"` | Project name. Used for bundle ID, app name, and display. |
| `version` | `string` | `"1.0.0"` | Semantic version string. |
| `main` | `string` | `"src/main.ts"` | Main entry point (legacy alias for `backend.entry`). |

## `web` — Frontend Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `entry` | `string` | `"src/web/index.ts"` | Frontend entry file. |
| `outDir` | `string` | `"dist/web"` | Frontend build output directory. |
| `publicDir` | `string` | `"public"` | Static assets directory. Contents are copied to `outDir` during build. |

## `backend` — Backend Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `entry` | `string` | `"src/main.ts"` | Backend entry file. |
| `outDir` | `string` | `"dist"` | Backend build output directory. |

## `build` — Build Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `target` | `string` | `"bun"` | Build target runtime. |
| `minify` | `boolean` | `false` | Minify output during build. |
| `sourcemap` | `boolean` | `true` | Generate source maps. Disabled automatically during compilation. |
| `obfuscation` | `object` | — | JavaScript obfuscation options (see below). |

### `build.obfuscation` — Code Protection

Obfuscation is applied to frontend code during compilation only. Powered by [javascript-obfuscator](https://github.com/nicolo-ribaudo/javascript-obfuscator).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable code obfuscation. |
| `compact` | `boolean` | `true` | Remove line breaks and whitespace. |
| `controlFlowFlattening` | `boolean` | `false` | Flatten control flow (increases code size). |
| `controlFlowFlatteningThreshold` | `number` | `0.75` | Probability (0-1) of applying to each node. |
| `deadCodeInjection` | `boolean` | `false` | Inject unreachable code blocks. |
| `deadCodeInjectionThreshold` | `number` | `0.4` | Probability (0-1) of injection. |
| `identifierNamesGenerator` | `string` | — | Generator type: `"hexadecimal"`, `"mangled"`, or `"mangled-shuffled"`. |
| `renameGlobals` | `boolean` | `false` | Rename global declarations. **Warning:** breaks `window.*` APIs. |
| `selfDefending` | `boolean` | `false` | Anti-tampering protection. **Warning:** may cause issues with React. |
| `stringArray` | `boolean` | `true` | Move strings to a shared array. |
| `stringArrayEncoding` | `string[]` | `["base64"]` | Encoding: `"none"`, `"base64"`, or `"rc4"`. |
| `stringArrayThreshold` | `number` | `0.75` | Probability (0-1) of moving each string. |
| `splitStrings` | `boolean` | `false` | Split strings into chunks. |
| `splitStringsChunkLength` | `number` | `10` | Maximum chunk length. |
| `transformObjectKeys` | `boolean` | `false` | Obfuscate object keys. |
| `unicodeEscapeSequence` | `boolean` | `false` | Use unicode escapes. **Warning:** performance impact. |

## `app` — Application Metadata

Used during compilation to configure the native app bundle.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `identifier` | `string` | `"com.tronbun.<name>"` | Bundle identifier (macOS) / app ID. |
| `icon` | `string` | `"assets/icon.icns"` | macOS app icon path (`.icns`). |
| `iconWin` | `string` | `"assets/icon.ico"` | Windows app icon path (`.ico`). |
| `category` | `string` | — | macOS app category (e.g., `"public.app-category.developer-tools"`). |

## `window` — Default Window Settings

These values are used as defaults when creating `Window` or `WindowIPC` instances.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | `string` | — | Window title bar text. |
| `width` | `number` | `800` | Window width in pixels. |
| `height` | `number` | `600` | Window height in pixels. |
| `minWidth` | `number` | — | Minimum window width. |
| `minHeight` | `number` | — | Minimum window height. |
| `maxWidth` | `number` | — | Maximum window width. |
| `maxHeight` | `number` | — | Maximum window height. |
| `resizable` | `boolean` | `true` | Allow window resizing. |
| `center` | `boolean` | — | Center window on screen at startup. |
| `alwaysOnTop` | `boolean` | — | Keep window above other windows. |
| `fullscreen` | `boolean` | — | Start in fullscreen mode. |
| `frameless` | `boolean` | — | Remove window decorations (title bar, borders). |
| `opacity` | `number` | `1.0` | Window opacity (0.0 to 1.0). |

## `tray` — System Tray Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable the system tray icon. |
| `icon` | `string` | — | Tray icon path (relative to project root). |
| `tooltip` | `string` | — | Tooltip text shown on hover. |

## `notifications` — Notification Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable desktop notification support. |

## Default Configuration

If no `tronbun.config.json` exists, these defaults are used:

```json
{
  "name": "tronbun-app",
  "version": "1.0.0",
  "main": "src/main.ts",
  "web": {
    "entry": "src/web/index.ts",
    "outDir": "dist/web",
    "publicDir": "public"
  },
  "backend": {
    "entry": "src/main.ts",
    "outDir": "dist"
  },
  "build": {
    "target": "bun",
    "minify": false,
    "sourcemap": true
  }
}
```

## Example: Full Configuration

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "src/main.ts",
  "web": {
    "entry": "src/web/index.ts",
    "outDir": "dist/web",
    "publicDir": "public"
  },
  "backend": {
    "entry": "src/main.ts",
    "outDir": "dist"
  },
  "build": {
    "target": "bun",
    "minify": true,
    "sourcemap": false,
    "obfuscation": {
      "enabled": true,
      "compact": true,
      "stringArray": true,
      "stringArrayEncoding": ["base64"]
    }
  },
  "app": {
    "identifier": "com.example.myapp",
    "icon": "assets/icon.icns",
    "iconWin": "assets/icon.ico",
    "category": "public.app-category.productivity"
  },
  "window": {
    "title": "My Application",
    "width": 1024,
    "height": 768,
    "minWidth": 400,
    "minHeight": 300,
    "resizable": true,
    "center": true
  },
  "tray": {
    "enabled": true,
    "icon": "assets/tray-icon.png",
    "tooltip": "My App"
  },
  "notifications": {
    "enabled": true
  }
}
```
