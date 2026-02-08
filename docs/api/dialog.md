# Dialog API

The Dialog API provides native file dialogs and message boxes. Access it through `window.dialog` on any `Window` or `WindowIPC` instance.

```typescript
const win = new Window({ title: "My App" });
const result = await win.dialog.openFile();
```

## File Dialogs

### `openFile(options?: OpenFileOptions)`

Show a native file open dialog. Returns an array of selected file paths, or `null` if cancelled.

```typescript
const files = await win.dialog.openFile({
  title: "Select an image",
  filters: [
    { name: "Images", extensions: ["png", "jpg", "gif"] },
    { name: "All Files", extensions: ["*"] },
  ],
  multiple: true,
});

if (files) {
  for (const path of files) {
    console.log("Selected:", path);
  }
}
```

#### OpenFileOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Dialog title. |
| `filters` | `FileFilter[]` | — | File type filters. |
| `multiple` | `boolean` | `false` | Allow selecting multiple files. |

### `saveFile(options?: SaveFileOptions)`

Show a native save file dialog. Returns the chosen file path, or `null` if cancelled.

```typescript
const path = await win.dialog.saveFile({
  title: "Save document",
  defaultName: "untitled.txt",
  filters: [
    { name: "Text Files", extensions: ["txt"] },
    { name: "All Files", extensions: ["*"] },
  ],
});

if (path) {
  await Bun.write(path, content);
}
```

#### SaveFileOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Dialog title. |
| `defaultName` | `string` | — | Default file name. |
| `filters` | `FileFilter[]` | — | File type filters. |

### `openFolder(options?: OpenFolderOptions)`

Show a native folder selection dialog. Returns the selected folder path, or `null` if cancelled.

```typescript
const folder = await win.dialog.openFolder({
  title: "Select project directory",
});

if (folder) {
  console.log("Selected folder:", folder);
}
```

#### OpenFolderOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Dialog title. |

## Message Boxes

### `showMessage(options: MessageBoxOptions)`

Show a native message box with configurable buttons. Returns the button that was clicked.

```typescript
const result = await win.dialog.showMessage({
  title: "Confirm Delete",
  message: "Are you sure you want to delete this file?",
  detail: "This action cannot be undone.",
  type: "question",
  buttons: "yesNo",
});

if (result === "yes") {
  await deleteFile();
}
```

#### MessageBoxOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | — | Message box title. |
| `message` | `string` | **required** | Main message text. |
| `detail` | `string` | — | Additional detail text. |
| `type` | `MessageBoxType` | `"info"` | Icon type. |
| `buttons` | `MessageBoxButtons` | `"ok"` | Button set. |

#### MessageBoxType

| Value | Description |
|-------|-------------|
| `"info"` | Information icon. |
| `"warning"` | Warning icon. |
| `"error"` | Error icon. |
| `"question"` | Question icon. |

#### MessageBoxButtons

| Value | Buttons Shown | Possible Results |
|-------|---------------|------------------|
| `"ok"` | OK | `"ok"` |
| `"okCancel"` | OK, Cancel | `"ok"`, `"cancel"` |
| `"yesNo"` | Yes, No | `"yes"`, `"no"` |
| `"yesNoCancel"` | Yes, No, Cancel | `"yes"`, `"no"`, `"cancel"` |

### Convenience Methods

#### `showInfo(message: string, title?: string)`

Show an informational message box with an OK button.

```typescript
await win.dialog.showInfo("Operation completed successfully.");
```

#### `showWarning(message: string, title?: string)`

Show a warning message box.

```typescript
await win.dialog.showWarning("Disk space is running low.");
```

#### `showError(message: string, title?: string)`

Show an error message box.

```typescript
await win.dialog.showError("Failed to save file.");
```

#### `confirm(message: string, title?: string)`

Show a yes/no confirmation dialog. Returns `true` if "Yes" was clicked.

```typescript
const confirmed = await win.dialog.confirm("Save changes before closing?");
if (confirmed) {
  await save();
}
```

## Types

### FileFilter

```typescript
interface FileFilter {
  name: string;       // Display name (e.g., "Images")
  extensions: string[]; // File extensions without dots (e.g., ["png", "jpg"])
}
```

### MessageBoxResult

```typescript
type MessageBoxResult = "ok" | "cancel" | "yes" | "no";
```

## Example

```typescript
import { Window } from "tronbun";

const win = new Window({ title: "File Manager" });

// Open multiple images
const images = await win.dialog.openFile({
  title: "Select Images",
  filters: [{ name: "Images", extensions: ["png", "jpg", "gif", "webp"] }],
  multiple: true,
});

if (!images) {
  await win.dialog.showInfo("No files selected.");
  return;
}

// Process and confirm
const confirmed = await win.dialog.confirm(
  `Process ${images.length} image(s)?`,
  "Batch Processing"
);

if (confirmed) {
  try {
    await processImages(images);
    await win.dialog.showInfo("All images processed!");
  } catch (err) {
    await win.dialog.showError(`Processing failed: ${err.message}`);
  }
}
```

## See Also

- [Window](window.md) — Parent Window API
- [Menu](menu.md) — Native menus
