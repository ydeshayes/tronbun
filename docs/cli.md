# CLI Reference

The Tronbun CLI provides commands for creating, building, developing, and compiling desktop applications.

## Usage

```bash
tronbun <command> [options]
```

Or with npx:

```bash
npx tronbun <command> [options]
```

## Global Options

| Option | Short | Description |
|--------|-------|-------------|
| `--help` | `-h` | Show help message. |
| `--version` | `-v` | Show CLI version. |

## Commands

### `init [name]`

Create a new Tronbun project with complete scaffolding.

```bash
tronbun init my-app
```

**What it creates:**

| File | Purpose |
|------|---------|
| `tronbun.config.json` | Project configuration |
| `package.json` | NPM package with build scripts |
| `tsconfig.json` | TypeScript config (decorators enabled) |
| `src/main.ts` | Backend entry with example handlers |
| `src/web/index.ts` | Frontend entry |
| `public/index.html` | HTML template |
| `assets/icon.icns` | macOS app icon (copied from tronbun) |
| `.gitignore` | Standard ignores |
| `README.md` | Getting started guide |

The generated `src/main.ts` uses the decorator-based `WindowIPC` pattern with example `greet`, `calculate`, and `getSystemInfo` handlers.

---

### `build`

Build both backend and frontend code.

```bash
tronbun build
tronbun build --watch
tronbun build --dev
```

| Option | Short | Description |
|--------|-------|-------------|
| `--watch` | `-w` | Rebuild on file changes. |
| `--dev` | `-d` | Development mode (disables minification). |

**Build steps:**
1. Compile backend TypeScript to `dist/` using `bun build`
2. Run `generate-types` to create typed IPC interfaces
3. Compile frontend to `dist/web/` targeting the browser (ESM format)
4. Copy static assets from `public/` to `dist/web/`

**Returns** exit code 0 on success, 1 on failure.

---

### `dev`

Start development mode with hot reload and automatic restart.

```bash
tronbun dev
```

**What it does:**
1. Runs an initial full build
2. Starts your application with `TRONBUN_DEV_MODE=true`
3. Watches for file changes:
   - **Backend** (`.ts`, `.js`): Rebuilds backend, regenerates types, restarts the app
   - **Frontend** (`.ts`, `.tsx`, `.js`, `.jsx`, `.html`, `.css`): Rebuilds frontend, triggers hot reload (no restart)
   - **Public assets**: Rebuilds frontend

Hot reload uses a `.dev-reload` timestamp file that the frontend detects to refresh content.

Press `Ctrl+C` to stop.

---

### `run`

Run the previously built application.

```bash
tronbun run
```

Executes the built backend from `<backend.outDir>/<entry-name>.js` with Bun. You must run `build` first.

---

### `compile`

Create a platform-native standalone executable.

```bash
tronbun compile
tronbun compile -o my-app
tronbun compile --platform macos
tronbun compile --platform windows
```

| Option | Short | Description |
|--------|-------|-------------|
| `--output` | `-o` | Output filename (without extension). |
| `--platform` | — | Target: `windows`, `macos`, or `auto` (default: auto-detect). |

#### macOS Output

Creates an `.app` bundle:

```
MyApp.app/
  Contents/
    MacOS/
      MyApp                     # Main executable
      webview_main              # Webview subprocess
      tray_main                 # Tray subprocess
      libnotification.dylib     # Native notifications
    Resources/
      icon.icns                 # App icon
      assets/                   # Static assets
    Info.plist                  # Bundle metadata
```

The bundle is ad-hoc code signed automatically.

#### Windows Output

Creates an executable with companion files:

```
build/
  MyApp.exe                     # Main executable
  webview_main_win.exe          # Webview subprocess
  tray_main_win.exe             # Tray subprocess
  libnotification.dll           # Native notifications
```

#### Compilation Process

1. Build the application (sourcemaps disabled for production)
2. Collect all web assets from `dist/web/`, excluding `.map` files
3. Optionally obfuscate JavaScript (if `build.obfuscation.enabled`)
4. Compress and base64-encode assets
5. Generate `embedded-assets.ts` registering assets as `__TRONBUN_EMBEDDED_FILES_COMPRESSED__`
6. Compile to native executable with `bun build --compile`
7. Copy native helper executables and libraries
8. Generate `Info.plist` (macOS) and code sign
9. Clean up temporary build artifacts

---

### `clean`

Remove build artifacts.

```bash
tronbun clean
```

Deletes `backend.outDir` (default: `dist/`) and `web.outDir` (default: `dist/web/`).

---

### `generate-types`

Auto-generate TypeScript types for IPC communication.

```bash
tronbun generate-types
```

Scans your source files for `@windowName` and `@mainHandler` decorators, then generates `src/ipc-types.ts` with:

- Typed handler interfaces for each window
- `Window` interface augmentation for frontend type safety

**Example output** (`src/ipc-types.ts`):

```typescript
export interface MainWindowHandlers {
  greet: (data: string) => Promise<string>;
  calculate: (data: { a: number; b: number; operation: string }) => Promise<number>;
  getSystemInfo: (data: void) => Promise<{ platform: string; version: string }>;
}

declare global {
  interface Window {
    MyApp: MainWindowHandlers;
  }
}
```

This command runs automatically as part of `build` and `dev`.

## Environment Variables

| Variable | Set By | Description |
|----------|--------|-------------|
| `TRONBUN_DEV_MODE` | `dev` command | Set to `"true"` during development. Enables hot reload. |
| `TRONBUN_DEBUG` | User | Set to `"1"` to enable debug logging in native processes. |

## NPM Scripts

Projects created with `init` include these scripts in `package.json`:

```json
{
  "scripts": {
    "build": "tronbun build",
    "dev": "tronbun dev",
    "start": "tronbun run",
    "compile": "tronbun compile"
  }
}
```
