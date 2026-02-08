# Child Views API

Child views are embedded webviews within a parent window, similar to Electron's `BrowserView`. They allow you to display multiple independent web pages in a single window, each with its own content and IPC handlers.

## Creating Child Views

Child views are created through the parent `Window` instance:

```typescript
import { Window } from "tronbun";

const win = new Window({ title: "My App", width: 1200, height: 800 });
win.navigate("public/index.html");

const sidebar = await win.createChildView({
  bounds: { x: 0, y: 0, width: 300, height: 800 },
  url: "public/sidebar.html",
});

const content = await win.createChildView({
  bounds: { x: 300, y: 0, width: 900, height: 800 },
  html: "<h1>Content Area</h1>",
});
```

### ChildViewOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | `string` | auto-generated | Unique identifier for the child view. |
| `bounds` | `ChildViewBounds` | **required** | Position and size within the parent window. |
| `url` | `string` | — | URL to load in the child view. |
| `html` | `string` | — | HTML content to display. |
| `visible` | `boolean` | `true` | Initial visibility. |
| `autoResize` | `AutoResizeConfig \| AutoResizeMode` | — | Auto-resize behavior when parent resizes. |

### ChildViewBounds

```typescript
interface ChildViewBounds {
  x: number;      // Horizontal offset from parent's left edge
  y: number;      // Vertical offset from parent's top edge
  width: number;  // Width in pixels
  height: number; // Height in pixels
}
```

## ChildView Methods

### Content

#### `navigate(url: string)`

Navigate the child view to a URL.

```typescript
await sidebar.navigate("public/sidebar.html");
```

#### `setHtml(html: string)`

Set HTML content directly.

```typescript
await content.setHtml("<h2>Updated Content</h2>");
```

#### `eval(js: string)`

Execute JavaScript in the child view and return the result.

```typescript
const title = await sidebar.eval("document.title");
```

#### `init(js: string)`

Register an init script that runs before every page load.

```typescript
await sidebar.init(`
  window.viewType = "sidebar";
`);
```

### Positioning

#### `setBounds(bounds: ChildViewBounds)`

Update the child view's position and size.

```typescript
await sidebar.setBounds({ x: 0, y: 50, width: 250, height: 750 });
```

#### `getBounds()`

Get the current bounds.

```typescript
const bounds = sidebar.getBounds();
// { x: 0, y: 0, width: 300, height: 800 }
```

### Visibility & Ordering

#### `setVisible(visible: boolean)`

Show or hide the child view.

```typescript
await sidebar.setVisible(false); // Hide
await sidebar.setVisible(true);  // Show
```

#### `isVisible()`

Check if the child view is currently visible.

```typescript
if (sidebar.isVisible()) {
  console.log("Sidebar is shown");
}
```

#### `bringToFront()`

Move the child view above other child views.

```typescript
await overlay.bringToFront();
```

#### `sendToBack()`

Move the child view behind other child views.

```typescript
await background.sendToBack();
```

### IPC

Child views have their own IPC handler registries, separate from the parent window.

#### `registerIPCHandler(name: string, handler: IPCHandler)`

Register an IPC handler specific to this child view.

```typescript
sidebar.registerIPCHandler("getNavItems", async () => {
  return [
    { label: "Home", path: "/" },
    { label: "Settings", path: "/settings" },
  ];
});
```

#### `unregisterIPCHandler(name: string)`

Remove a child view IPC handler.

```typescript
sidebar.unregisterIPCHandler("getNavItems");
```

## Auto-Resize Modes

Child views can automatically resize when the parent window is resized.

### `AutoResizeMode`

| Mode | Description |
|------|-------------|
| `"none"` | No automatic resizing (default). |
| `"fill"` | Fill the entire parent window. |
| `"proportional"` | Maintain proportional size relative to the parent. |
| `"anchor"` | Anchor to edges, stretching with the parent. |

```typescript
// Simple mode string
const content = await win.createChildView({
  bounds: { x: 300, y: 0, width: 900, height: 800 },
  autoResize: "fill",
});

// Detailed configuration
const sidebar = await win.createChildView({
  bounds: { x: 0, y: 0, width: 300, height: 800 },
  autoResize: {
    mode: "anchor",
    // Additional config depends on mode
  },
});
```

## Managing Child Views

### From the Parent Window

#### `getChildView(id: string)`

Get a child view by its ID.

```typescript
const view = win.getChildView("sidebar-view");
if (view) {
  await view.navigate("public/updated-sidebar.html");
}
```

#### `getChildViews()`

Get all child views.

```typescript
const views = win.getChildViews();
console.log(`${views.length} child views`);
```

#### `destroyChildView(childViewOrId: ChildView | string)`

Remove a child view from the window.

```typescript
await win.destroyChildView(sidebar);
// or by ID
await win.destroyChildView("sidebar-view");
```

## Example: Sidebar + Content Layout

```typescript
import { Window } from "tronbun";

const win = new Window({
  title: "IDE Layout",
  width: 1200,
  height: 800,
});

// Main content
win.navigate("public/main.html");

// Sidebar navigation
const sidebar = await win.createChildView({
  id: "sidebar",
  bounds: { x: 0, y: 0, width: 250, height: 800 },
  url: "public/sidebar.html",
  autoResize: "anchor",
});

// Bottom panel (terminal/output)
const panel = await win.createChildView({
  id: "panel",
  bounds: { x: 250, y: 600, width: 950, height: 200 },
  html: "<pre>Output panel</pre>",
  visible: false,
});

// Sidebar IPC: navigate on item click
sidebar.registerIPCHandler("navigate", async (path: string) => {
  await win.navigate(`public/${path}.html`);
});

// Toggle bottom panel
win.handle("togglePanel", async () => {
  const visible = panel.isVisible();
  await panel.setVisible(!visible);

  // Resize content area when panel toggles
  if (!visible) {
    // Panel shown: shrink content
    await panel.setBounds({ x: 250, y: 600, width: 950, height: 200 });
  }

  return { visible: !visible };
});
```

## Example: Multi-View Communication

```typescript
const win = new Window({ title: "Dashboard" });

const chart = await win.createChildView({
  id: "chart",
  bounds: { x: 0, y: 0, width: 600, height: 400 },
  url: "public/chart.html",
});

const table = await win.createChildView({
  id: "table",
  bounds: { x: 600, y: 0, width: 600, height: 400 },
  url: "public/table.html",
});

// When the table selects a row, update the chart
table.registerIPCHandler("selectRow", async (rowData: any) => {
  await chart.eval(`updateChart(${JSON.stringify(rowData)})`);
  return { selected: true };
});
```

## See Also

- [Window](window.md) — Parent Window API
- [IPC Communication](../guides/ipc-communication.md) — IPC patterns
