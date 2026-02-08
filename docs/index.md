---
layout: home

hero:
  name: Tronbun
  text: Desktop Apps with TypeScript & Bun
  tagline: Lightweight, fast, cross-platform desktop applications using native webviews. No Electron required.
  image:
    src: /logo.webp
    alt: Tronbun
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: API Reference
      link: /api/window
    - theme: alt
      text: GitHub
      link: https://github.com/ydeshayes/tronbun

features:
  - icon: "\u26A1"
    title: Powered by Bun
    details: Blazing-fast runtime and build tooling. No bundler config needed — Bun handles TypeScript, bundling, and compilation natively.
  - icon: "\uD83E\uDEB6"
    title: Truly Lightweight
    details: Uses native platform webviews (WebKit on macOS, WebView2 on Windows) — no bundled Chromium. Your app stays small.
  - icon: "\uD83D\uDD12"
    title: Type-Safe IPC
    details: Decorator-based system auto-generates typed frontend APIs from your backend handlers. Full IntelliSense on both sides.
  - icon: "\uD83D\uDCE6"
    title: Single Executable
    details: Compile your entire app into a native .app bundle (macOS) or .exe (Windows) with all assets embedded.
  - icon: "\uD83D\uDDA5\uFE0F"
    title: Native Features
    details: System tray, native menus, dialogs, desktop notifications, and browser automation — all built in.
  - icon: "\uD83C\uDF10"
    title: Cross-Platform
    details: Write once in TypeScript. Build for macOS and Windows with platform-native look and feel.
---

## Quick Start

```bash
# Create a new project
npx tronbun init my-app
cd my-app && bun install

# Start developing with hot reload
npx tronbun dev
```

## How It Works

Your backend runs in Bun. Your frontend runs in a native webview. They communicate over a type-safe IPC bridge.

::: code-group

```typescript [Backend — src/main.ts]
import { WindowIPC, windowName, mainHandler } from "tronbun";

@windowName("MyApp")
class MainWindow extends WindowIPC {
  constructor() {
    super({ title: "My App", width: 800, height: 600 });
    this.navigate("public/index.html");
  }

  @mainHandler("greet")
  async handleGreet(name: string) {
    return `Hello, ${name}!`;
  }
}

new MainWindow();
```

```typescript [Frontend — src/web/index.ts]
// Auto-generated typed API — full IntelliSense
const result = await window.MyApp.greet("World");
document.getElementById("output")!.textContent = result;
// → "Hello, World!"
```

:::

## Compile to Native App

```bash
npx tronbun compile
```

Produces a standalone `.app` (macOS) or `.exe` (Windows) with all web assets embedded — no external files needed.
