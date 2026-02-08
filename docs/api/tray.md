# Tray API

The `Tray` class creates a system tray icon with a dropdown menu. It runs as a separate native process.

```typescript
import { Tray } from "tronbun";
```

## Constructor

```typescript
const tray = new Tray(options: TrayOptions);
```

### TrayOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `icon` | `string` | **required** | Path to the tray icon image. |
| `tooltip` | `string` | — | Tooltip text shown on hover. |
| `menu` | `TrayMenuItem[]` | — | Initial tray menu items. |

## Methods

### `setIcon(iconPath: string)`

Change the tray icon.

```typescript
await tray.setIcon("assets/tray-active.png");
```

### `setTooltip(tooltip: string)`

Update the tooltip text.

```typescript
await tray.setTooltip("My App - Running");
```

### `setMenu(menu: TrayMenuItem[])`

Set or replace the tray dropdown menu.

```typescript
await tray.setMenu([
  { id: "show", label: "Show Window" },
  { id: "status", label: "Status: Running", enabled: false },
  { type: "separator" },
  { id: "autoStart", label: "Start on Login", type: "checkbox", checked: false },
  { type: "separator" },
  { id: "quit", label: "Quit" },
]);
```

### `destroy()`

Remove the tray icon and clean up.

```typescript
await tray.destroy();
```

### `onMenuClick(menuId: string, handler: TrayMenuClickHandler)`

Register a click handler for a specific menu item.

```typescript
tray.onMenuClick("show", () => {
  win.showWindow();
});

tray.onMenuClick("quit", () => {
  tray.destroy();
  process.exit(0);
});
```

### `offMenuClick(menuId: string)`

Remove a click handler.

```typescript
tray.offMenuClick("show");
```

## Static Methods

### `Tray.isSupported()`

Check if the system tray is supported on the current platform.

```typescript
if (Tray.isSupported()) {
  const tray = new Tray({ icon: "assets/tray.png" });
}
```

### `Tray.isEnabled()`

Check if the tray is enabled in `tronbun.config.json`.

```typescript
if (Tray.isEnabled()) {
  setupTray();
}
```

### `Tray.getConfigDefaults()`

Load tray defaults from `tronbun.config.json`.

```typescript
const defaults = Tray.getConfigDefaults();
// { icon: "assets/tray.png", tooltip: "My App" }
```

## Types

### TrayMenuItem

```typescript
interface TrayMenuItem {
  id: string;
  label: string;
  type?: "normal" | "separator" | "checkbox" | "submenu";
  enabled?: boolean;
  checked?: boolean;
  submenu?: TrayMenuItem[];
  accelerator?: string;
  callback?: () => void | Promise<void>;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | `string` | **required** | Unique identifier for click handlers. |
| `label` | `string` | **required** | Display text. |
| `type` | `string` | `"normal"` | Item type. |
| `enabled` | `boolean` | `true` | Whether the item is clickable. |
| `checked` | `boolean` | `false` | Checkmark state (for `"checkbox"` type). |
| `submenu` | `TrayMenuItem[]` | — | Nested menu items (for `"submenu"` type). |
| `accelerator` | `string` | — | Keyboard shortcut hint text. |
| `callback` | `Function` | — | Inline click callback (alternative to `onMenuClick`). |

### TrayMenuClickHandler

```typescript
type TrayMenuClickHandler = () => void | Promise<void>;
```

## Configuration

Configure tray defaults in `tronbun.config.json`:

```json
{
  "tray": {
    "enabled": true,
    "icon": "assets/tray-icon.png",
    "tooltip": "My Application"
  }
}
```

## Example

```typescript
import { Window, Tray } from "tronbun";

const win = new Window({
  title: "Background App",
  width: 400,
  height: 300,
});

win.navigate("public/index.html");

// Create system tray
const tray = new Tray({
  icon: "assets/tray-icon.png",
  tooltip: "My App",
  menu: [
    { id: "show", label: "Show Window" },
    { id: "hide", label: "Hide Window" },
    { type: "separator" },
    {
      id: "status",
      label: "Status",
      type: "submenu",
      submenu: [
        { id: "status-online", label: "Online", type: "radio", checked: true },
        { id: "status-away", label: "Away", type: "radio" },
        { id: "status-dnd", label: "Do Not Disturb", type: "radio" },
      ],
    },
    { type: "separator" },
    { id: "quit", label: "Quit" },
  ],
});

// Register handlers
tray.onMenuClick("show", () => {
  win.showWindow();
});

tray.onMenuClick("hide", () => {
  win.hideWindow();
});

tray.onMenuClick("quit", async () => {
  await tray.destroy();
  await win.close();
  process.exit(0);
});
```

## See Also

- [Window](window.md) — Window management
- [Menu](menu.md) — Application menu bar
- [Configuration](../configuration.md) — Tray config options
