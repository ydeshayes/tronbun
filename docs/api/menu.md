# Menu API

Tronbun provides two menu APIs: an application **menu bar** (`window.menu`) and a **context menu** (`window.context`) for right-click menus.

```typescript
const win = new Window({ title: "My App" });

// Application menu bar
await win.menu.setMenu([...]);

// Right-click context menu
await win.context.setContextMenu([...]);
```

## Application Menu Bar

Access via `window.menu`.

### `setMenu(menus: Menu[])`

Set the application menu bar. Each `Menu` represents a top-level menu with its items.

```typescript
await win.menu.setMenu([
  {
    label: "File",
    items: [
      { id: "new", label: "New File", accelerator: "CmdOrCtrl+N" },
      { id: "open", label: "Open...", accelerator: "CmdOrCtrl+O" },
      { type: "separator" },
      { id: "save", label: "Save", accelerator: "CmdOrCtrl+S" },
      { id: "saveAs", label: "Save As...", accelerator: "CmdOrCtrl+Shift+S" },
      { type: "separator" },
      { role: "quit" },
    ],
  },
  {
    label: "Edit",
    items: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    items: [
      { id: "darkMode", label: "Dark Mode", type: "checkbox", checked: false },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  },
]);
```

### `setDefaultMenu(appName?: string)`

Set a standard menu bar with File, Edit, View, Window, and Help menus.

```typescript
await win.menu.setDefaultMenu("My App");
```

### `removeMenu()`

Remove the menu bar entirely.

```typescript
await win.menu.removeMenu();
```

### `updateItem(itemId: string, updates)`

Update a menu item's properties dynamically.

```typescript
await win.menu.updateItem("save", { enabled: false });
await win.menu.updateItem("darkMode", { checked: true });
await win.menu.updateItem("open", { label: "Open Project..." });
```

### `setItemEnabled(itemId: string, enabled: boolean)`

Enable or disable a menu item.

```typescript
await win.menu.setItemEnabled("save", false);
```

### `setItemChecked(itemId: string, checked: boolean)`

Set the checked state of a checkbox or radio menu item.

```typescript
await win.menu.setItemChecked("darkMode", true);
```

### `onClick(itemId: string, handler: () => void)`

Register a click handler for a menu item.

```typescript
win.menu.onClick("new", () => {
  createNewFile();
});

win.menu.onClick("save", () => {
  saveCurrentFile();
});

win.menu.onClick("darkMode", () => {
  toggleDarkMode();
});
```

### `offClick(itemId: string)`

Remove a click handler.

```typescript
win.menu.offClick("save");
```

## Context Menu

Access via `window.context`. Provides a custom right-click menu.

### `setContextMenu(items: ContextMenuItem[])`

Replace the default browser context menu with a custom one.

```typescript
await win.context.setContextMenu([
  { id: "cut", label: "Cut" },
  { id: "copy", label: "Copy" },
  { id: "paste", label: "Paste" },
  { type: "separator" },
  { id: "inspect", label: "Inspect Element" },
]);
```

### `removeContextMenu()`

Restore the default browser context menu.

```typescript
await win.context.removeContextMenu();
```

### `updateItem(itemId: string, updates)`

Update a context menu item's properties.

```typescript
await win.context.updateItem("paste", { enabled: false });
```

### `setItemEnabled(itemId: string, enabled: boolean)`

```typescript
await win.context.setItemEnabled("paste", true);
```

### `setItemChecked(itemId: string, checked: boolean)`

```typescript
await win.context.setItemChecked("wordWrap", true);
```

### `onClick(itemId: string, handler: () => void)`

```typescript
win.context.onClick("copy", () => {
  copySelection();
});
```

### `offClick(itemId: string)`

```typescript
win.context.offClick("copy");
```

## Types

### Menu

```typescript
interface Menu {
  id?: string;
  label: string;
  items: MenuItem[];
}
```

### MenuItem

```typescript
interface MenuItem {
  id?: string;
  label?: string;
  type?: MenuItemType;
  role?: MenuItemRole;
  enabled?: boolean;
  checked?: boolean;
  accelerator?: string;
  submenu?: MenuItem[];
  click?: () => void;
}
```

### MenuItemType

| Value | Description |
|-------|-------------|
| `"normal"` | Standard clickable item (default). |
| `"separator"` | Visual separator line. |
| `"checkbox"` | Item with a checkmark toggle. |
| `"radio"` | Radio button item (mutually exclusive within group). |
| `"submenu"` | Item that opens a submenu. |

### MenuItemRole

Platform-standard menu items with built-in behavior:

| Role | Description |
|------|-------------|
| `"about"` | Show About dialog. |
| `"quit"` | Quit the application. |
| `"undo"` | Undo last action. |
| `"redo"` | Redo last action. |
| `"cut"` | Cut selection. |
| `"copy"` | Copy selection. |
| `"paste"` | Paste from clipboard. |
| `"selectAll"` | Select all content. |
| `"delete"` | Delete selection. |
| `"minimize"` | Minimize window. |
| `"close"` | Close window. |
| `"hide"` | Hide application (macOS). |
| `"hideOthers"` | Hide other applications (macOS). |
| `"unhide"` | Show all applications (macOS). |
| `"front"` | Bring all windows to front. |
| `"zoom"` | Zoom window. |
| `"togglefullscreen"` | Toggle fullscreen. |
| `"services"` | macOS Services menu. |
| `"startSpeaking"` | Start text-to-speech (macOS). |
| `"stopSpeaking"` | Stop text-to-speech (macOS). |

### Accelerator Strings

Keyboard shortcuts use Electron-style accelerator strings:

- `"CmdOrCtrl+S"` — Cmd on macOS, Ctrl on Windows/Linux
- `"CmdOrCtrl+Shift+S"` — With Shift modifier
- `"Alt+F4"` — Alt key combination
- `"F11"` — Function key

### ContextMenuItem

```typescript
interface ContextMenuItem {
  id?: string;
  label?: string;
  type?: ContextMenuItemType;
  enabled?: boolean;
  checked?: boolean;
  submenu?: ContextMenuItem[];
  click?: () => void;
}
```

Context menu items support the same types (`normal`, `separator`, `checkbox`, `radio`, `submenu`) but not roles or accelerators.

## Example: Full Application Menu

```typescript
import { Window } from "tronbun";

const win = new Window({ title: "Text Editor" });

await win.menu.setMenu([
  {
    label: "File",
    items: [
      { id: "new", label: "New", accelerator: "CmdOrCtrl+N" },
      { id: "open", label: "Open...", accelerator: "CmdOrCtrl+O" },
      { type: "separator" },
      { id: "save", label: "Save", accelerator: "CmdOrCtrl+S" },
      { id: "saveAs", label: "Save As...", accelerator: "CmdOrCtrl+Shift+S" },
      { type: "separator" },
      { role: "quit" },
    ],
  },
  {
    label: "Edit",
    items: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { type: "separator" },
      { id: "find", label: "Find...", accelerator: "CmdOrCtrl+F" },
      { id: "replace", label: "Replace...", accelerator: "CmdOrCtrl+H" },
    ],
  },
  {
    label: "View",
    items: [
      { id: "wordWrap", label: "Word Wrap", type: "checkbox", checked: true },
      { id: "lineNumbers", label: "Line Numbers", type: "checkbox", checked: true },
      { type: "separator" },
      {
        label: "Theme",
        type: "submenu",
        submenu: [
          { id: "theme-light", label: "Light", type: "radio", checked: true },
          { id: "theme-dark", label: "Dark", type: "radio" },
          { id: "theme-system", label: "System", type: "radio" },
        ],
      },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  },
]);

// Register click handlers
win.menu.onClick("new", () => createNewFile());
win.menu.onClick("open", async () => {
  const files = await win.dialog.openFile({
    filters: [{ name: "Text", extensions: ["txt", "md"] }],
  });
  if (files) openFile(files[0]);
});
win.menu.onClick("save", () => saveFile());
win.menu.onClick("wordWrap", () => toggleWordWrap());
```

## See Also

- [Window](window.md) — Parent Window API
- [Tray](tray.md) — System tray menus
