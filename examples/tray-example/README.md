# Tronbun Tray Icon Example

This example demonstrates how to create system tray icons with custom menus using Tronbun.

## Features Demonstrated

- ✅ System tray icon creation
- 🎯 Custom context menu with different item types
- 🖱️ Click handlers for tray icon and menu items
- 📢 Native notifications
- 🪟 Window control from tray (show/hide)
- ⚙️ Checkbox menu items with state management
- 🔧 Menu updates and dynamic content
- 🎨 Modern UI with gradient background
- 🧹 Proper cleanup on exit

## Menu Items Included

- **Show Window** - Makes the app window visible
- **Hide Window** - Hides the app window
- **Enable Notifications** - Checkbox item that shows a test notification
- **About Tronbun** - Shows information about the framework
- **Quit** - Exits the application cleanly

## Running the Example

```bash
cd examples/tray-example
bun install
bun run dev
```

## Platform Support

This example works on:
- ✅ **macOS** - Uses NSStatusItem with native menu support
- ✅ **Windows** - Uses Shell_NotifyIcon with popup menu
- ✅ **Linux** - Uses GTK StatusIcon with libnotify notifications

## Usage

1. **Left-click** the tray icon to toggle window visibility
2. **Right-click** the tray icon to open the context menu
3. Use menu items to control the application
4. Notifications will appear when certain actions are performed

## Key Code Features

### Basic Tray Creation
```typescript
const tray = new Tray({
    icon: "path/to/icon.png",
    tooltip: "My App",
    menu: [/* menu items */]
});
```

### Menu Item Types
```typescript
{
    id: 'normal-item',
    label: 'Normal Item',
    type: 'normal'
},
{
    id: 'checkbox-item', 
    label: 'Checkbox Item',
    type: 'checkbox',
    checked: true
},
{
    id: 'separator',
    label: '',
    type: 'separator'
}
```

### Event Handlers
```typescript
// Tray icon click
tray.onClick(() => {
    console.log("Tray clicked!");
});

// Menu item click
tray.onMenuClick('menu-id', (menuId) => {
    console.log(`Menu item ${menuId} clicked`);
});
```

### Notifications
```typescript
await tray.showNotification("Title", "Message body");
```

## Architecture

The tray functionality uses:
- **TypeScript Layer**: `Tray` class with event handling
- **C Layer**: Platform-specific tray implementations
- **IPC**: JSON-based communication between layers
- **Cross-platform**: Unified API across Windows, macOS, and Linux

## Cleanup

The example demonstrates proper cleanup:
- Destroys tray icon on exit
- Closes windows gracefully
- Handles SIGINT/SIGTERM signals
- Prevents resource leaks
