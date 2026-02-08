# Notification API

The Notification API provides native desktop notifications with click handlers and action buttons. Access it through `window.notification` on any `Window` instance.

```typescript
const win = new Window({ title: "My App" });

await win.notification.requestPermission();
await win.notification.show({ title: "Hello", body: "World" });
```

## Permissions

Notifications require user permission. Always request permission before showing notifications.

### `requestPermission()`

Request notification permission from the user. Returns the permission state.

```typescript
const status = await win.notification.requestPermission();
// "granted" | "denied" | "unavailable"

if (status === "granted") {
  await win.notification.show({ title: "Notifications enabled!" });
} else if (status === "denied") {
  console.log("User denied notification permission");
}
```

**Return values:**

| Value | Description |
|-------|-------------|
| `"granted"` | Permission granted. Notifications will be shown. |
| `"denied"` | Permission denied by user. |
| `"unavailable"` | Notifications not supported on this platform/configuration. |

### `isAvailable()`

Check the current notification permission status without prompting.

```typescript
const status = await win.notification.isAvailable();
```

**Return values:**

| Value | Description |
|-------|-------------|
| `1` | Permission granted. |
| `0` | Not determined (permission not yet requested). |
| `-1` | Permission denied. |

## Showing Notifications

### `show(options: NotificationOptions)`

Display a native desktop notification. Returns a notification ID that can be used to close it or identify it in event handlers.

```typescript
const id = await win.notification.show({
  title: "Download Complete",
  body: "your-file.zip has finished downloading.",
  silent: false,
  urgency: "normal",
});
```

#### NotificationOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | **required** | Notification title. |
| `body` | `string` | — | Notification body text. |
| `icon` | `string` | — | Icon path. |
| `silent` | `boolean` | `false` | Suppress notification sound. |
| `urgency` | `NotificationUrgency` | `"normal"` | Urgency level. |
| `actions` | `NotificationAction[]` | — | Action buttons (platform-dependent). |

#### NotificationUrgency

| Value | Description |
|-------|-------------|
| `"low"` | Low priority. May be shown silently. |
| `"normal"` | Standard notification. |
| `"critical"` | High priority. May override Do Not Disturb. |

#### NotificationAction

```typescript
interface NotificationAction {
  text: string; // Button label
}
```

### `close(notificationId: string)`

Programmatically dismiss a notification.

```typescript
const id = await win.notification.show({ title: "Processing..." });

// Later, after processing is done
await win.notification.close(id);
```

## Event Handlers

### `onClick(handler)`

Called when the user clicks the notification body.

```typescript
win.notification.onClick((notificationId: string) => {
  console.log("Notification clicked:", notificationId);
  win.showWindow(); // Bring app to front
});
```

### `offClick()`

Remove the click handler.

```typescript
win.notification.offClick();
```

### `onClose(handler)`

Called when the notification is dismissed (by user or timeout).

```typescript
win.notification.onClose((notificationId: string) => {
  console.log("Notification dismissed:", notificationId);
});
```

### `offClose()`

Remove the close handler.

```typescript
win.notification.offClose();
```

### `onAction(handler)`

Called when the user clicks an action button on the notification.

```typescript
win.notification.onAction((notificationId: string, actionIndex: number) => {
  console.log(`Action ${actionIndex} clicked on notification ${notificationId}`);
  if (actionIndex === 0) {
    openFile();
  } else if (actionIndex === 1) {
    showInFinder();
  }
});
```

### `offAction()`

Remove the action handler.

```typescript
win.notification.offAction();
```

## Configuration

Enable or disable notifications in `tronbun.config.json`:

```json
{
  "notifications": {
    "enabled": true
  }
}
```

## Platform Notes

### macOS

- Notifications use `UNUserNotificationCenter`.
- In **dev mode**, notifications are sent via a helper app (`TronbunNotifier.app`).
- In **compiled mode**, notifications use `libnotification.dylib` via Bun FFI for direct integration with the app bundle.
- macOS 15 (Sequoia) with ad-hoc signed apps may not show the native permission dialog. Users are guided to System Settings manually.
- Action buttons are supported natively.

### Windows

- Notifications use native Windows toast notifications via `libnotification.dll`.
- Action buttons are supported.

## Example

```typescript
import { Window } from "tronbun";

const win = new Window({ title: "Download Manager" });

async function setupNotifications() {
  const perm = await win.notification.requestPermission();
  if (perm !== "granted") {
    console.log("Notification permission not granted");
    return;
  }

  // Register event handlers
  win.notification.onClick((id) => {
    win.showWindow();
  });

  win.notification.onAction((id, actionIndex) => {
    if (actionIndex === 0) {
      openDownloadedFile(id);
    }
  });
}

async function notifyDownloadComplete(filename: string) {
  await win.notification.show({
    title: "Download Complete",
    body: `${filename} is ready.`,
    urgency: "normal",
    actions: [
      { text: "Open File" },
      { text: "Show in Folder" },
    ],
  });
}

setupNotifications();
```

## See Also

- [Window](window.md) — Parent Window API
- [Configuration](../configuration.md) — Notification config options
