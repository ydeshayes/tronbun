# WindowIPC API

`WindowIPC` extends `Window` with a decorator-based IPC system. Use `@windowName` and `@mainHandler` decorators to automatically register backend handlers and generate typed frontend APIs.

```typescript
import { WindowIPC, windowName, mainHandler } from "tronbun";
```

## Overview

Instead of manually calling `registerIPCHandler`, you decorate methods and the system:

1. Registers each `@mainHandler` method as an IPC handler
2. Generates a typed `window.<WindowName>.<handlerName>()` API on the frontend
3. Creates `src/ipc-types.ts` with full TypeScript definitions

## Decorators

### `@windowName(name: string)`

Class decorator that sets the frontend API namespace.

```typescript
@windowName("MyApp")
class MainWindow extends WindowIPC { ... }
// Frontend: window.MyApp
```

The name should be a valid JavaScript identifier (camelCase recommended).

### `@mainHandler(name: string)`

Method decorator that registers a method as an IPC handler.

```typescript
@mainHandler("greet")
async handleGreet(name: string) {
  return `Hello, ${name}!`;
}
// Frontend: window.MyApp.greet("World")
```

The handler name is the IPC channel name and becomes the frontend method name.

## Class: WindowIPC

### Constructor

```typescript
@windowName("MyApp")
class MainWindow extends WindowIPC {
  constructor() {
    super(options?: WindowOptions);
  }
}
```

Accepts the same [`WindowOptions`](window.md#windowoptions) as `Window`. On construction, automatically:
1. Scans the class for `@mainHandler` decorators
2. Registers each as an IPC handler
3. Calls `initialize()` to inject the frontend API script

### Methods

#### `getWindowName(): string`

Returns the name set by `@windowName`.

```typescript
const win = new MainWindow();
console.log(win.getWindowName()); // "MyApp"
```

#### `getHandlerNames(): string[]`

Returns an array of all registered handler names.

```typescript
console.log(win.getHandlerNames()); // ["greet", "calculate", "getSystemInfo"]
```

#### `initialize(): Promise<void>`

Sets up the frontend API scripts. Called automatically by the constructor. You typically don't need to call this manually.

## Complete Example

### Backend (`src/main.ts`)

```typescript
import { WindowIPC, windowName, mainHandler } from "tronbun";

interface CalculateInput {
  a: number;
  b: number;
  operation: "add" | "subtract" | "multiply" | "divide";
}

interface SystemInfo {
  platform: string;
  version: string;
  uptime: number;
}

@windowName("MyApp")
class MainWindow extends WindowIPC {
  constructor() {
    super({
      title: "Calculator",
      width: 400,
      height: 300,
      center: true,
    });
    this.navigate("public/index.html");
  }

  @mainHandler("greet")
  async handleGreet(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }

  @mainHandler("calculate")
  async handleCalculate(data: CalculateInput): Promise<number> {
    switch (data.operation) {
      case "add": return data.a + data.b;
      case "subtract": return data.a - data.b;
      case "multiply": return data.a * data.b;
      case "divide": return data.a / data.b;
    }
  }

  @mainHandler("getSystemInfo")
  async handleGetSystemInfo(): Promise<SystemInfo> {
    return {
      platform: process.platform,
      version: process.version,
      uptime: process.uptime(),
    };
  }
}

new MainWindow();
```

### Frontend (`src/web/index.ts`)

```typescript
// Types are auto-generated in src/ipc-types.ts
// window.MyApp is fully typed

async function init() {
  // Simple string parameter
  const greeting = await window.MyApp.greet("World");
  document.getElementById("greeting")!.textContent = greeting;

  // Object parameter
  const result = await window.MyApp.calculate({
    a: 10,
    b: 5,
    operation: "multiply",
  });
  document.getElementById("result")!.textContent = `Result: ${result}`;

  // No parameter (void)
  const info = await window.MyApp.getSystemInfo();
  document.getElementById("platform")!.textContent = info.platform;
}

init();
```

### Generated Types (`src/ipc-types.ts`)

Running `tronbun build` or `tronbun generate-types` produces:

```typescript
interface CalculateInput {
  a: number;
  b: number;
  operation: "add" | "subtract" | "multiply" | "divide";
}

interface SystemInfo {
  platform: string;
  version: string;
  uptime: number;
}

export interface MyAppHandlers {
  greet: (data: string) => Promise<string>;
  calculate: (data: CalculateInput) => Promise<number>;
  getSystemInfo: (data: void) => Promise<SystemInfo>;
}

declare global {
  interface Window {
    MyApp: MyAppHandlers;
  }
}
```

## Multiple Windows

You can have multiple `WindowIPC` classes, each with their own namespace:

```typescript
@windowName("Editor")
class EditorWindow extends WindowIPC {
  @mainHandler("save")
  async handleSave(content: string) { ... }

  @mainHandler("load")
  async handleLoad(path: string) { ... }
}

@windowName("Settings")
class SettingsWindow extends WindowIPC {
  @mainHandler("getPreferences")
  async handleGetPreferences() { ... }

  @mainHandler("setPreference")
  async handleSetPreference(data: { key: string; value: any }) { ... }
}

new EditorWindow();
new SettingsWindow();
```

Frontend for each window gets its own typed API:
- `window.Editor.save(content)` / `window.Editor.load(path)`
- `window.Settings.getPreferences()` / `window.Settings.setPreference({ key, value })`

## Handler Metadata

The decorator system stores metadata that can be inspected:

```typescript
import { getWindowMetadata, getAllWindowMetadata } from "tronbun";

// Get metadata for a specific class
const meta = getWindowMetadata(MainWindow);
// { name: "MyApp", handlers: [{ name: "greet", method: "handleGreet" }, ...] }

// Get all registered window metadata
const allMeta = getAllWindowMetadata();
```

## Mixing Approaches

You can use both decorators and manual `handle()` calls:

```typescript
@windowName("MyApp")
class MainWindow extends WindowIPC {
  constructor() {
    super({ title: "My App" });

    // Manual handler alongside decorators
    this.handle("legacyEndpoint", async (data) => {
      return processLegacy(data);
    });
  }

  @mainHandler("newEndpoint")
  async handleNew(data: any) {
    return processNew(data);
  }
}
```

Note that manually registered handlers won't appear in generated types.

## See Also

- [Window](window.md) — Base Window API
- [IPC Communication Guide](../guides/ipc-communication.md) — Patterns and best practices
