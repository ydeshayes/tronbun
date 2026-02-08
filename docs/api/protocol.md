# Protocol API

The Protocol API provides direct access to the Chrome DevTools Protocol (CDP), enabling advanced browser control including cookies, PDF generation, input simulation, network monitoring, and request interception.

Access it through `window.protocol` on any `Window` instance.

```typescript
const win = new Window({ title: "My App" });
const proto = win.protocol;
```

## Raw CDP Access

### `call(method: string, params?: Record<string, any>)`

Call any CDP method directly.

```typescript
// Get document node
const doc = await proto.call("DOM.getDocument");

// Enable a CDP domain
await proto.call("Page.enable");

// Get page metrics
const metrics = await proto.call("Performance.getMetrics");
```

### `subscribe(eventName: string, callback: (params: any) => void)`

Subscribe to a CDP event. Returns a subscription object for cleanup.

```typescript
const sub = await proto.subscribe("Page.loadEventFired", (params) => {
  console.log("Page loaded at:", params.timestamp);
});

// Later, unsubscribe
sub.unsubscribe();
```

## Cookies

### `getCookies(url?: string)`

Get all cookies, optionally filtered by URL.

```typescript
const cookies = await proto.getCookies();
const siteCookies = await proto.getCookies("https://example.com");

for (const cookie of cookies) {
  console.log(`${cookie.name}=${cookie.value}`);
}
```

### `setCookie(cookie: Cookie)`

Set a cookie.

```typescript
await proto.setCookie({
  name: "session",
  value: "abc123",
  domain: "example.com",
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
  expires: Date.now() / 1000 + 86400, // 1 day
});
```

### `deleteCookies(name: string, options?)`

Delete cookies by name.

```typescript
await proto.deleteCookies("session");
await proto.deleteCookies("tracker", { domain: ".example.com" });
```

### `clearCookies()`

Delete all cookies.

```typescript
await proto.clearCookies();
```

### Cookie Type

```typescript
interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;      // Unix timestamp in seconds
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}
```

## PDF Generation

### `printToPDF(options?: PDFOptions)`

Generate a PDF of the current page. Returns a base64-encoded PDF string.

```typescript
const pdf = await proto.printToPDF({
  landscape: false,
  printBackground: true,
  scale: 1,
  paperWidth: 8.5,
  paperHeight: 11,
  marginTop: 0.5,
  marginBottom: 0.5,
  marginLeft: 0.5,
  marginRight: 0.5,
});

await Bun.write("output.pdf", Buffer.from(pdf, "base64"));
```

### PDFOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `landscape` | `boolean` | `false` | Landscape orientation. |
| `displayHeaderFooter` | `boolean` | `false` | Show header/footer. |
| `printBackground` | `boolean` | `false` | Print background graphics. |
| `scale` | `number` | `1` | Scale factor (0.1 to 2.0). |
| `paperWidth` | `number` | `8.5` | Paper width in inches. |
| `paperHeight` | `number` | `11` | Paper height in inches. |
| `marginTop` | `number` | `0` | Top margin in inches. |
| `marginBottom` | `number` | `0` | Bottom margin in inches. |
| `marginLeft` | `number` | `0` | Left margin in inches. |
| `marginRight` | `number` | `0` | Right margin in inches. |
| `pageRanges` | `string` | — | Page ranges (e.g., `"1-3,5"`). |
| `preferCSSPageSize` | `boolean` | `false` | Use CSS-defined page size. |

## Mouse Input

### `clickAt(x: number, y: number, button?: MouseButton)`

Click at specific viewport coordinates.

```typescript
await proto.clickAt(100, 200);
await proto.clickAt(100, 200, "right");
```

### `doubleClickAt(x: number, y: number, button?: MouseButton)`

Double-click at specific coordinates.

```typescript
await proto.doubleClickAt(100, 200);
```

### `moveMouse(x: number, y: number)`

Move the mouse cursor to specific coordinates.

```typescript
await proto.moveMouse(100, 200);
```

### `dispatchMouseEvent(type, x, y, options?)`

Low-level mouse event dispatch.

```typescript
await proto.dispatchMouseEvent("mousePressed", 100, 200, {
  button: "left",
  clickCount: 1,
});
await proto.dispatchMouseEvent("mouseReleased", 100, 200, {
  button: "left",
  clickCount: 1,
});
```

### Mouse Types

```typescript
type MouseButton = "left" | "right" | "middle";
type MouseEventType = "mousePressed" | "mouseReleased" | "mouseMoved";
```

## Keyboard Input

### `pressKey(key: string, modifiers?: KeyModifiers)`

Press and release a key.

```typescript
await proto.pressKey("Enter");
await proto.pressKey("a", { ctrl: true }); // Ctrl+A (select all)
await proto.pressKey("c", { meta: true }); // Cmd+C (copy on macOS)
```

### `insertText(text: string)`

Type text as if entered from the keyboard.

```typescript
await proto.insertText("Hello, World!");
```

### `dispatchKeyEvent(type, key, modifiers?)`

Low-level keyboard event dispatch.

```typescript
await proto.dispatchKeyEvent("keyDown", "Shift");
await proto.dispatchKeyEvent("keyUp", "Shift");
```

### Keyboard Types

```typescript
type KeyEventType = "keyDown" | "keyUp" | "char";

interface KeyModifiers {
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;   // Cmd on macOS, Win on Windows
  shift?: boolean;
}
```

## Network Monitoring

### `enableNetworkMonitoring()`

Start monitoring network requests. Use with `subscribe` to receive events.

```typescript
await proto.enableNetworkMonitoring();

await proto.subscribe("Network.requestWillBeSent", (params) => {
  console.log("Request:", params.request.url);
});

await proto.subscribe("Network.responseReceived", (params) => {
  console.log("Response:", params.response.status, params.response.url);
});
```

### `disableNetworkMonitoring()`

Stop monitoring network requests.

```typescript
await proto.disableNetworkMonitoring();
```

### `setBlockedURLs(patterns: string[])`

Block requests matching URL patterns.

```typescript
await proto.setBlockedURLs([
  "*.analytics.com/*",
  "*/ads/*",
  "*.tracking.js",
]);
```

### `setExtraHTTPHeaders(headers: Record<string, string>)`

Add custom headers to all outgoing requests.

```typescript
await proto.setExtraHTTPHeaders({
  "Authorization": "Bearer token123",
  "X-Custom-Header": "value",
});
```

### `emulateNetworkConditions(options)`

Simulate different network conditions.

```typescript
// Simulate slow 3G
await proto.emulateNetworkConditions({
  offline: false,
  latency: 400,
  downloadThroughput: 400 * 1024,  // 400 KB/s
  uploadThroughput: 100 * 1024,    // 100 KB/s
});

// Go offline
await proto.emulateNetworkConditions({ offline: true });
```

### `clearCache()`

Clear the browser cache.

```typescript
await proto.clearCache();
```

### `waitForNetworkIdle(idleTime?: number)`

Wait until no network requests are pending. Useful for waiting for dynamic content to finish loading.

```typescript
await proto.waitForNetworkIdle(500); // Wait for 500ms of no network activity
```

## Request Interception

### `enableRequestInterception(patterns: RequestPattern[])`

Intercept network requests matching patterns. Use with `subscribe("Fetch.requestPaused", ...)` to handle intercepted requests.

```typescript
await proto.enableRequestInterception([
  { urlPattern: "*", requestStage: "Request" },
]);

await proto.subscribe("Fetch.requestPaused", async (params) => {
  if (params.request.url.includes("api/data")) {
    // Modify and continue the request
    await proto.continueRequest(params.requestId, {
      url: params.request.url + "?modified=true",
      headers: { ...params.request.headers, "X-Intercepted": "true" },
    });
  } else {
    // Let it through unchanged
    await proto.continueRequest(params.requestId);
  }
});
```

### `continueRequest(requestId, overrides?)`

Continue an intercepted request, optionally with modifications.

```typescript
await proto.continueRequest(requestId, {
  url: "https://alternative-api.com/data",
  method: "POST",
  headers: { "Content-Type": "application/json" },
});
```

### `fulfillRequest(requestId, response)`

Respond to an intercepted request with a custom response (mock response).

```typescript
await proto.fulfillRequest(requestId, {
  status: 200,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mocked: true, data: [1, 2, 3] }),
});
```

### `failRequest(requestId, reason)`

Fail an intercepted request.

```typescript
await proto.failRequest(requestId, "BlockedByClient");
```

## Example: PDF Report

```typescript
import { Window } from "tronbun";

const win = new Window({ title: "Report", hidden: true });
await win.navigate("public/report.html");

// Wait for content to load
await win.automation.waitForSelector(".report-ready", 10000);

// Generate PDF
const pdf = await win.protocol.printToPDF({
  printBackground: true,
  marginTop: 1,
  marginBottom: 1,
  marginLeft: 0.75,
  marginRight: 0.75,
});

await Bun.write("report.pdf", Buffer.from(pdf, "base64"));
await win.close();
```

## Example: API Mocking

```typescript
const win = new Window({ title: "Test App" });

// Intercept API calls
await win.protocol.enableRequestInterception([
  { urlPattern: "*/api/*", requestStage: "Request" },
]);

await win.protocol.subscribe("Fetch.requestPaused", async ({ requestId, request }) => {
  if (request.url.endsWith("/api/users")) {
    await win.protocol.fulfillRequest(requestId, {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]),
    });
  } else {
    await win.protocol.continueRequest(requestId);
  }
});

await win.navigate("public/index.html");
```

## See Also

- [Window](window.md) — Parent Window API
- [Automation](automation.md) — Higher-level DOM automation
