# Context Menu Feature

This document describes the customizable right-click context menu feature in Tronbun, which allows users to create custom context menus for their webview applications across all supported platforms (macOS, Windows, and Linux).

## Overview

The context menu feature provides a cross-platform API to:
- Define custom context menu items with labels, IDs, and callbacks
- Support separators and disabled items
- Handle menu item clicks with TypeScript callbacks
- Dynamically update menus at runtime
- Clear/disable context menus

## API Reference

### ContextMenuItem Interface

```typescript
interface ContextMenuItem {
    id: string;              // Unique identifier for the menu item
    label?: string;          // Display text (not needed for separators)
    type?: 'normal' | 'separator';  // Item type (default: 'normal')
    enabled?: boolean;       // Whether the item is clickable (default: true)
    callback?: () => void;   // Function to execute when clicked
}
```

### WebViewOptions

The `contextMenu` property can be added to `WebViewOptions`:

```typescript
interface WebViewOptions {
    // ... other options
    contextMenu?: ContextMenuItem[];
}
```

### Window/Webview Methods

#### `setContextMenu(items: ContextMenuItem[]): Promise<void>`
Sets custom context menu items for the window.

#### `clearContextMenu(): Promise<void>`
Removes the custom context menu, reverting to default behavior.

#### `registerContextMenuCallback(itemId: string, callback: () => void): void`
Registers a callback for a specific menu item ID.

#### `unregisterContextMenuCallback(itemId: string): void`
Removes a callback for a specific menu item ID.

## Usage Examples

### Basic Context Menu

```typescript
import { Window } from "tronbun";

const window = new Window({
    title: "My App",
    width: 800,
    height: 600,
    contextMenu: [
        {
            id: "copy",
            label: "Copy",
            callback: () => {
                console.log("Copy clicked!");
                // Copy logic here
            }
        },
        {
            id: "separator1",
            type: "separator"
        },
        {
            id: "paste",
            label: "Paste",
            enabled: false,  // Disabled item
            callback: () => {
                console.log("Paste clicked!");
            }
        }
    ]
});
```

### Dynamic Context Menu

```typescript
import { Window } from "tronbun";

const window = new Window({
    title: "Dynamic Menu Example",
    width: 800,
    height: 600
});

// Set initial menu
await window.setContextMenu([
    {
        id: "action1",
        label: "Action 1",
        callback: () => console.log("Action 1")
    }
]);

// Update menu later
setTimeout(async () => {
    await window.setContextMenu([
        {
            id: "action2",
            label: "Action 2",
            callback: () => console.log("Action 2")
        },
        {
            id: "clear",
            label: "Clear Menu",
            callback: async () => {
                await window.clearContextMenu();
            }
        }
    ]);
}, 5000);
```

### Registering Callbacks Separately

```typescript
import { Window } from "tronbun";

const window = new Window({
    title: "Callback Example",
    width: 800,
    height: 600,
    contextMenu: [
        { id: "item1", label: "Item 1" },
        { id: "item2", label: "Item 2" }
    ]
});

// Register callbacks after window creation
window.registerContextMenuCallback("item1", () => {
    console.log("Item 1 clicked!");
});

window.registerContextMenuCallback("item2", () => {
    console.log("Item 2 clicked!");
});
```

## Platform-Specific Implementation Details

### macOS
- Uses NSMenu and NSMenuItem for native context menus
- Context menus are attached to WKWebView instances
- Supports all standard menu item features including separators and disabled items

### Windows
- Uses Win32 CreatePopupMenu and TrackPopupMenu APIs
- Hooks into the window procedure to handle WM_CONTEXTMENU messages
- Custom JSON parser for menu configuration

### Linux
- Uses GTK+ GtkMenu and GtkMenuItem widgets
- Integrates with the GTK event system for menu activation
- Supports separators via GtkSeparatorMenuItem

## Technical Architecture

### IPC Communication
Context menu events are communicated between the native layer and TypeScript via JSON messages:

```json
{
    "type": "context_menu_click",
    "id": "menu_item_id"
}
```

### Native Layer Commands
- `window_set_context_menu`: Sets menu items (receives JSON array)
- `window_clear_context_menu`: Clears the custom menu

### Menu Item JSON Format
```json
[
    {
        "id": "item1",
        "label": "Menu Item 1",
        "type": "normal",
        "enabled": true
    },
    {
        "id": "sep1",
        "type": "separator"
    }
]
```

## Error Handling

- Invalid JSON in menu configuration will be logged to stderr
- Missing or invalid menu item IDs will be ignored
- Platform-specific errors (e.g., menu creation failures) are logged but don't crash the application

## Limitations

- Maximum of 32 menu items per context menu (platform limitation)
- Nested/submenu support is not currently implemented
- Menu icons are not supported in the current version
- Keyboard shortcuts for menu items are not supported

## Future Enhancements

Potential future improvements could include:
- Submenu support
- Menu item icons
- Keyboard shortcuts
- Menu item checkboxes/radio buttons
- Dynamic menu item updates without full menu recreation

## Example Application

See `examples/context_menu_example.ts` for a complete working example that demonstrates:
- Basic menu setup
- Dynamic menu updates
- Interaction with web content
- Different menu item types

Run the example with:
```bash
bun run examples/context_menu_example.ts
```
