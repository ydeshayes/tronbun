# IPC Communication Guide

This guide covers how IPC (Inter-Process Communication) works in Tronbun and best practices for building your frontend-to-backend communication layer.

## How IPC Works

Tronbun uses a JSON-line protocol over stdin/stdout between the Bun process and the native webview:

```
Frontend (webview)  →  JSON message  →  webview_main  →  stdin  →  Bun process
Bun process         →  stdout        →  webview_main  →  JSON   →  Frontend
```

Each IPC call:
1. The frontend calls `window.<WindowName>.<handler>(data)`
2. The webview sends `{"type": "ipc_call", "channel": "<handler>", "data": ...}` to Bun
3. Bun's registered handler processes the request and returns a result
4. The result is sent back to the frontend as a resolved Promise

## Two Approaches

### 1. Decorator-Based (Recommended)

Use `@windowName` and `@mainHandler` for type-safe, auto-generated APIs:

```typescript
// Backend
import { WindowIPC, windowName, mainHandler } from "tronbun";

@windowName("App")
class MainWindow extends WindowIPC {
  @mainHandler("getUser")
  async handleGetUser(userId: string) {
    return await db.findUser(userId);
  }
}

// Frontend — auto-typed
const user = await window.App.getUser("user-123");
```

**Advantages:**
- Auto-generated TypeScript types (`src/ipc-types.ts`)
- Full type safety on both backend and frontend
- Self-documenting: decorators make the API surface clear
- Types regenerated on every build

### 2. Manual Registration

Use `handle()` for simple cases or dynamic handlers:

```typescript
// Backend
const win = new Window({ title: "My App" });

win.handle("getUser", async (userId: string) => {
  return await db.findUser(userId);
});

// Frontend — no auto-generated types
const user = await window.__ipc.invoke("getUser", "user-123");
```

**Use when:**
- You need to register handlers dynamically at runtime
- You're prototyping and don't need type safety yet
- You're mixing with the decorator approach

## Handler Patterns

### Simple Value Parameters

```typescript
@mainHandler("greet")
async handleGreet(name: string) {
  return `Hello, ${name}!`;
}
```

### Object Parameters

```typescript
interface CreateUserInput {
  name: string;
  email: string;
  role: "admin" | "user";
}

@mainHandler("createUser")
async handleCreateUser(data: CreateUserInput) {
  return await db.createUser(data);
}
```

### No Parameters

```typescript
@mainHandler("getSystemInfo")
async handleGetSystemInfo() {
  return {
    platform: process.platform,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  };
}
```

### Void Return

```typescript
@mainHandler("logEvent")
async handleLogEvent(event: { type: string; data: any }) {
  await logger.write(event);
  // No return value — frontend gets undefined
}
```

### Error Handling

Thrown errors in handlers are caught and returned to the frontend:

```typescript
@mainHandler("deleteFile")
async handleDeleteFile(path: string) {
  const exists = await Bun.file(path).exists();
  if (!exists) {
    throw new Error(`File not found: ${path}`);
  }
  await fs.unlink(path);
  return { deleted: true };
}
```

On the frontend:

```typescript
try {
  await window.App.deleteFile("/nonexistent");
} catch (err) {
  console.error(err.message); // "File not found: /nonexistent"
}
```

## Frontend API

When using `WindowIPC` with `@windowName("App")`, the frontend gets:

```typescript
// Each @mainHandler("name") becomes:
window.App.name(data) → Promise<ReturnType>
```

The generated API handles:
- Serializing parameters to JSON
- Sending the IPC message to the backend
- Deserializing the response
- Resolving/rejecting the Promise

## Multiple Windows

Each `WindowIPC` subclass gets its own namespace:

```typescript
@windowName("Editor")
class EditorWindow extends WindowIPC {
  @mainHandler("save")
  async handleSave(content: string) { ... }
}

@windowName("Preview")
class PreviewWindow extends WindowIPC {
  @mainHandler("render")
  async handleRender(markdown: string) { ... }
}
```

Frontend for EditorWindow: `window.Editor.save(content)`
Frontend for PreviewWindow: `window.Preview.render(markdown)`

## Child View IPC

Child views have independent IPC registries:

```typescript
const sidebar = await win.createChildView({
  bounds: { x: 0, y: 0, width: 250, height: 600 },
  url: "public/sidebar.html",
});

// This handler is only available in the sidebar's webview
sidebar.registerIPCHandler("getNavItems", async () => {
  return navItems;
});

// This handler is only available in the parent window
win.handle("getMainContent", async () => {
  return mainContent;
});
```

## Type Generation

Running `tronbun build` or `tronbun generate-types` scans your source for decorators and generates `src/ipc-types.ts`:

```typescript
// Auto-generated — do not edit

interface CreateUserInput {
  name: string;
  email: string;
  role: "admin" | "user";
}

export interface AppHandlers {
  getUser: (data: string) => Promise<User>;
  createUser: (data: CreateUserInput) => Promise<User>;
  getSystemInfo: (data: void) => Promise<SystemInfo>;
}

declare global {
  interface Window {
    App: AppHandlers;
  }
}
```

This gives you:
- IntelliSense/autocomplete on the frontend
- Compile-time type checking for parameter and return types
- Documentation of available IPC methods

## Best Practices

1. **Use descriptive handler names.** `getUser` is better than `fetch` or `data`.

2. **Use typed interfaces for complex parameters.** Avoids `any` and ensures type safety across the IPC boundary.

3. **Keep handlers focused.** Each handler should do one thing. Prefer many small handlers over few large ones.

4. **Handle errors in handlers.** Thrown errors propagate to the frontend as rejected Promises.

5. **Avoid sending large payloads.** IPC uses JSON serialization. Large binary data should be written to disk and referenced by path.

6. **Use the decorator approach for production.** Manual `handle()` is fine for prototyping, but decorators provide the best developer experience.

## See Also

- [WindowIPC API](../api/window-ipc.md) — Decorator system reference
- [Window API](../api/window.md) — Manual IPC registration
- [Child Views](../api/child-views.md) — Child view IPC
