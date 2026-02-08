# Getting Started

This guide walks you through installing Tronbun, creating your first project, and understanding the project structure.

## Prerequisites

- [Bun](https://bun.sh) v1.2.19 or later
- macOS 10.15+ or Windows 10+ (with WebView2 runtime)

## Installation

```bash
npm install -g tronbun
```

Or use it directly with `npx`:

```bash
npx tronbun init my-app
```

## Create a New Project

```bash
npx tronbun init my-app
cd my-app
bun install
```

This scaffolds a complete project with the following structure:

```
my-app/
├── src/
│   ├── main.ts           # Backend entry point (Bun)
│   └── web/
│       └── index.ts      # Frontend entry point (webview)
├── public/
│   └── index.html        # HTML template
├── assets/
│   └── icon.icns         # App icon
├── tronbun.config.json   # Project configuration
├── tsconfig.json         # TypeScript config (decorators enabled)
├── package.json
└── README.md
```

## Project Structure

### Backend (`src/main.ts`)

Your backend code runs in Bun. The generated template uses the decorator-based `WindowIPC` pattern:

```typescript
import { WindowIPC, windowName, mainHandler } from "tronbun";

@windowName("MyApp")
class MainWindow extends WindowIPC {
  constructor() {
    super({
      title: "My App",
      width: 800,
      height: 600,
    });
    this.navigate("public/index.html");
  }

  @mainHandler("greet")
  async handleGreet(name: string) {
    return `Hello, ${name}!`;
  }

  @mainHandler("calculate")
  async handleCalculate(data: { a: number; b: number; operation: string }) {
    switch (data.operation) {
      case "add": return data.a + data.b;
      case "subtract": return data.a - data.b;
      case "multiply": return data.a * data.b;
      case "divide": return data.a / data.b;
      default: throw new Error(`Unknown operation: ${data.operation}`);
    }
  }

  @mainHandler("getSystemInfo")
  async handleGetSystemInfo() {
    return {
      platform: process.platform,
      version: process.version,
    };
  }
}

new MainWindow();
```

### Frontend (`src/web/index.ts`)

Your frontend code runs in the native webview. Backend handlers are available as typed methods on the `window` object:

```typescript
// window.MyApp is auto-generated from @windowName("MyApp")
const greeting = await window.MyApp.greet("World");
document.getElementById("result").textContent = greeting;

const sum = await window.MyApp.calculate({ a: 2, b: 3, operation: "add" });
console.log(sum); // 5

const info = await window.MyApp.getSystemInfo();
console.log(info.platform); // "darwin" or "win32"
```

### HTML (`public/index.html`)

A standard HTML file that loads your frontend bundle:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <h1>Welcome to Tronbun</h1>
  <p id="result"></p>
  <script type="module" src="index.js"></script>
</body>
</html>
```

### Configuration (`tronbun.config.json`)

Controls build settings, window defaults, and app metadata:

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
    "minify": false,
    "sourcemap": true
  },
  "app": {
    "identifier": "com.tronbun.my-app"
  },
  "window": {
    "title": "My App",
    "width": 800,
    "height": 600,
    "resizable": true
  },
  "tray": {
    "enabled": false
  },
  "notifications": {
    "enabled": true
  }
}
```

See the full [Configuration Reference](configuration.md) for all options.

## Development

Start development mode with hot reload:

```bash
npx tronbun dev
```

This will:
1. Build both backend and frontend
2. Launch your application with `TRONBUN_DEV_MODE=true`
3. Watch for file changes:
   - **Backend changes** (`.ts`, `.js`) trigger a full rebuild and app restart
   - **Frontend changes** (`.ts`, `.tsx`, `.js`, `.jsx`, `.html`, `.css`) trigger hot reload without restart
   - **Public asset changes** trigger a frontend rebuild

## Build and Run

Build the application without starting it:

```bash
npx tronbun build
```

Then run the built output:

```bash
npx tronbun run
```

## Compile to Executable

Create a standalone native executable:

```bash
npx tronbun compile
```

This produces:
- **macOS**: `MyApp.app` bundle with embedded webview and assets
- **Windows**: `MyApp.exe` with bundled helper executables

See [Building & Compiling](guides/building-and-compiling.md) for details on the compilation process.

## Using the Basic Window API

If you prefer a simpler approach without decorators, use the `Window` class directly:

```typescript
import { Window } from "tronbun";

const win = new Window({
  title: "Simple App",
  width: 800,
  height: 600,
});

win.navigate("public/index.html");

win.handle("greet", async (name: string) => {
  return `Hello, ${name}!`;
});
```

See the [Window API](api/window.md) and [WindowIPC API](api/window-ipc.md) for full details on both approaches.

## Next Steps

- [Configuration Reference](configuration.md) — All config options
- [CLI Commands](cli.md) — Full CLI reference
- [IPC Communication Guide](guides/ipc-communication.md) — Patterns and best practices
- [API Reference](api/window.md) — Complete API documentation
