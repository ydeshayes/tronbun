# Window API

The `Window` class is the primary way to create and manage application windows. It wraps the native webview process and provides methods for navigation, IPC, window control, and access to sub-APIs (dialogs, menus, notifications, automation).

```typescript
import { Window } from "tronbun";
```

## Constructor

```typescript
const win = new Window(options?: WindowOptions);
```

### WindowOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Window title bar text. |
| `width` | `number` | `800` | Window width in pixels. |
| `height` | `number` | `600` | Window height in pixels. |
| `html` | `string` | — | Initial HTML content. |
| `url` | `string` | — | Initial URL to load. |
| `initScript` | `string` | — | JavaScript to inject before page loads. |
| `alwaysOnTop` | `boolean` | `false` | Keep window above other windows. |
| `transparent` | `boolean` | `false` | Enable window transparency. |
| `opaque` | `boolean` | `true` | Opaque window background. |
| `blur` | `boolean` | `false` | Enable background blur effect. |
| `decorations` | `boolean` | `true` | Show window decorations (title bar, borders). |
| `resizable` | `boolean` | `true` | Allow window resizing. |
| `position` | `{ x: number; y: number }` | — | Initial window position. |
| `center` | `boolean` | — | Center window on screen. |
| `hidden` | `boolean` | `false` | Start window hidden. |
| `debug` | `boolean` | `false` | Enable webview debug tools. |

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique window identifier. |
| `automation` | `WindowAutomation` | [DOM automation API](automation.md). |
| `protocol` | `Protocol` | [CDP protocol API](protocol.md). |
| `dialog` | `WindowDialog` | [Native dialog API](dialog.md). |
| `menu` | `WindowMenu` | [Menu bar API](menu.md). |
| `context` | `WindowContext` | [Context menu API](menu.md#context-menu). |
| `notification` | `WindowNotification` | [Notification API](notification.md). |

## Navigation & Content

### `navigate(url: string)`

Navigate the webview to a URL or local file path. In dev mode, uses `file://` URLs for hot reload. In compiled mode, uses embedded HTML content.

```typescript
await win.navigate("public/index.html");
await win.navigate("https://example.com");
```

### `setHtml(html: string)`

Set the webview content directly from an HTML string.

```typescript
await win.setHtml("<h1>Hello World</h1>");
```

### `setTitle(title: string)`

Update the window title bar text.

```typescript
await win.setTitle("My App - Untitled");
```

### `executeScript(script: string)`

Execute JavaScript in the webview and return the result.

```typescript
const title = await win.executeScript("document.title");
const count = await win.executeScript("document.querySelectorAll('li').length");
```

## IPC Handlers

### `registerIPCHandler(name: string, handler: IPCHandler)`

Register a handler for frontend-to-backend IPC calls.

```typescript
win.registerIPCHandler("getData", async (params) => {
  const data = await fetchFromDatabase(params.id);
  return data;
});
```

### `handle(channel: string, handler: IPCHandler)`

Alias for `registerIPCHandler`.

```typescript
win.handle("save", async (data) => {
  await saveToFile(data);
  return { success: true };
});
```

### `unregisterIPCHandler(name: string)`

Remove a previously registered IPC handler.

```typescript
win.unregisterIPCHandler("getData");
```

### IPCHandler Type

```typescript
type IPCHandler = (data: any) => any | Promise<any>;
```

## Window Control

### Size & Position

```typescript
await win.setSize(1024, 768);
await win.setPosition(100, 200);
await win.centerWindow();

const size = await win.getWindowSize();
// { width: 1024, height: 768 }
```

### Window State

```typescript
await win.minimizeWindow();
await win.maximizeWindow();
await win.restoreWindow();
await win.hideWindow();
await win.showWindow();
```

### Appearance

```typescript
await win.setOpacity(0.9);          // 0.0 to 1.0
await win.setResizable(false);
await win.setAlwaysOnTop(true);
await win.setTransparent();
await win.setOpaque();
await win.enableBlur();
await win.removeDecorations();
await win.addDecorations();
```

### Close

```typescript
await win.close();
```

## Child Views

Create embedded webviews within the window. See [Child Views](child-views.md) for full details.

```typescript
const child = await win.createChildView({
  bounds: { x: 0, y: 0, width: 300, height: 400 },
  url: "https://example.com",
});

await win.destroyChildView(child);

const view = win.getChildView("view-id");
const allViews = win.getChildViews();
```

## Init Scripts

Register JavaScript that runs before every page load:

```typescript
// Protected method — use in subclass
class MyWindow extends Window {
  constructor() {
    super({ title: "My App" });
    this.init(`
      window.appVersion = "1.0.0";
      console.log("Init script loaded");
    `);
  }
}
```

## Events

Window events are dispatched through the internal `onEvent` callback:

| Event | Data | Description |
|-------|------|-------------|
| `window_resize` | `{ width, height }` | Window was resized. |
| `menu_click` | `{ menuId }` | Menu item was clicked. |
| `context_menu_click` | `{ menuId }` | Context menu item was clicked. |
| `notification_click` | `{ id }` | Notification was clicked. |
| `notification_close` | `{ id }` | Notification was dismissed. |
| `notification_action` | `{ id, actionIndex }` | Notification action button was clicked. |

## Example

```typescript
import { Window } from "tronbun";

const win = new Window({
  title: "My Application",
  width: 1024,
  height: 768,
  center: true,
  debug: true,
});

// Navigate to frontend
win.navigate("public/index.html");

// Register IPC handlers
win.handle("loadUser", async ({ userId }) => {
  return await db.getUser(userId);
});

win.handle("savePreferences", async (prefs) => {
  await fs.writeFile("prefs.json", JSON.stringify(prefs));
  return { saved: true };
});
```

## See Also

- [WindowIPC](window-ipc.md) — Decorator-based IPC (recommended)
- [Dialog](dialog.md) — File and message dialogs
- [Menu](menu.md) — Menu bar and context menus
- [Notification](notification.md) — Desktop notifications
- [Automation](automation.md) — DOM querying and browser automation
- [Protocol](protocol.md) — CDP protocol access
- [Child Views](child-views.md) — Embedded child webviews
