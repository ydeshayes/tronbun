# Automation API

The Automation API provides browser-like DOM querying and interaction, similar to Puppeteer or Playwright. Access it through `window.automation` on any `Window` instance.

```typescript
const win = new Window({ title: "My App" });
await win.navigate("public/index.html");

const title = await win.automation.getTitle();
await win.automation.click("#submit-btn");
```

## Navigation

### `goBack()`

Navigate back in the webview history.

```typescript
await win.automation.goBack();
```

### `goForward()`

Navigate forward in the webview history.

```typescript
await win.automation.goForward();
```

### `reload()`

Reload the current page.

```typescript
await win.automation.reload();
```

### `getUrl()`

Get the current page URL.

```typescript
const url = await win.automation.getUrl();
// "file:///path/to/public/index.html" or "https://example.com"
```

### `getTitle()`

Get the current page title.

```typescript
const title = await win.automation.getTitle();
```

## Content Extraction

### `getHtml()`

Get the full HTML content of the page.

```typescript
const html = await win.automation.getHtml();
```

### `getText()`

Get the text content of the page (no HTML tags).

```typescript
const text = await win.automation.getText();
```

### `screenshot()`

Capture a screenshot of the webview. Returns a base64-encoded image string.

```typescript
const base64 = await win.automation.screenshot();
await Bun.write("screenshot.png", Buffer.from(base64, "base64"));
```

## DOM Querying

### `querySelector(selector: string)`

Find the first element matching a CSS selector. Returns `null` if not found.

```typescript
const el = await win.automation.querySelector("#main-heading");
if (el) {
  console.log(el.textContent); // "Welcome"
  console.log(el.tagName);     // "H1"
  console.log(el.isVisible);   // true
}
```

### `querySelectorAll(selector: string)`

Find all elements matching a CSS selector.

```typescript
const items = await win.automation.querySelectorAll("ul.nav li");
for (const item of items) {
  console.log(item.textContent, item.rect);
}
```

### ElementInfo

Both query methods return `ElementInfo` objects:

```typescript
interface ElementInfo {
  tagName: string;                    // "DIV", "INPUT", etc.
  id: string;                         // Element ID
  className: string;                  // CSS class string
  textContent: string;                // Text content
  innerHTML: string;                  // Inner HTML
  rect: {                             // Bounding rectangle
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes: Record<string, string>; // All HTML attributes
  isVisible: boolean;                 // Whether element is visible
  value?: string;                     // Input value (for form elements)
  href?: string;                      // Link URL (for anchor elements)
}
```

## DOM Interaction

### `click(selector: string)`

Click the first element matching the selector.

```typescript
await win.automation.click("#submit-btn");
await win.automation.click("a.nav-link:first-child");
```

### `type(selector: string, text: string)`

Type text into an input element. Focuses the element first, then types each character.

```typescript
await win.automation.type("#username", "john@example.com");
await win.automation.type("#password", "secret123");
await win.automation.click("#login-btn");
```

### `getValue(selector: string)`

Get the current value of a form element.

```typescript
const email = await win.automation.getValue("#email-input");
```

### `scrollTo(x: number, y: number)`

Scroll the page to specific coordinates.

```typescript
await win.automation.scrollTo(0, 500);
```

### `scrollIntoView(selector: string)`

Scroll an element into the visible viewport.

```typescript
await win.automation.scrollIntoView("#footer");
```

## Waiting

### `waitForSelector(selector: string, timeout?: number)`

Wait for an element to appear in the DOM. Returns `true` if found within the timeout, `false` otherwise.

```typescript
const found = await win.automation.waitForSelector(".loading-complete", 5000);
if (found) {
  const data = await win.automation.getText();
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `selector` | `string` | **required** | CSS selector to wait for. |
| `timeout` | `number` | — | Maximum wait time in milliseconds. |

## File Handling

### `setInputFiles(selector: string, filePaths: string[])`

Set file paths on a file input element, simulating file selection.

```typescript
await win.automation.setInputFiles("#file-upload", [
  "/path/to/document.pdf",
  "/path/to/image.png",
]);
```

### `downloadFile(url: string, savePath: string)`

Download a file from a URL and save it to disk.

```typescript
await win.automation.downloadFile(
  "https://example.com/report.pdf",
  "/Users/me/Downloads/report.pdf"
);
```

### `saveImage(selector: string, savePath: string)`

Save an image element's content to a file on disk.

```typescript
await win.automation.saveImage("#profile-photo", "/tmp/photo.png");
```

### `getImageSrc(selector: string)`

Get the `src` URL of an image element.

```typescript
const src = await win.automation.getImageSrc("#logo");
// "https://example.com/logo.png" or "data:image/png;base64,..."
```

## Example: Form Automation

```typescript
import { Window } from "tronbun";

const win = new Window({ title: "Automation Demo", debug: true });
await win.navigate("https://example.com/form");

// Wait for form to load
await win.automation.waitForSelector("#registration-form", 5000);

// Fill form fields
await win.automation.type("#first-name", "John");
await win.automation.type("#last-name", "Doe");
await win.automation.type("#email", "john@example.com");

// Upload a file
await win.automation.setInputFiles("#avatar", ["/path/to/photo.jpg"]);

// Submit form
await win.automation.click("#submit-btn");

// Wait for success message
const success = await win.automation.waitForSelector(".success-message", 10000);
if (success) {
  const message = await win.automation.querySelector(".success-message");
  console.log("Success:", message?.textContent);
}

// Take a screenshot
const screenshot = await win.automation.screenshot();
await Bun.write("result.png", Buffer.from(screenshot, "base64"));
```

## Example: Web Scraping

```typescript
const win = new Window({ title: "Scraper", hidden: true });
await win.navigate("https://news.example.com");

await win.automation.waitForSelector("article", 5000);

const articles = await win.automation.querySelectorAll("article h2 a");
for (const article of articles) {
  console.log(`${article.textContent} — ${article.href}`);
}

await win.close();
```

## See Also

- [Window](window.md) — Parent Window API
- [Protocol](protocol.md) — Lower-level CDP access for advanced automation
