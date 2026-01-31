# Automation Examples

These examples demonstrate Tronbun's browser automation capabilities via the `automation` and `protocol` APIs. These APIs are designed for AI agents and automated workflows that need to interact with web content.

## Examples

### 1. Main Automation Demo (`main.ts`)

Comprehensive demonstration of all automation features:

```bash
bun run examples/automation/main.ts
```

Features demonstrated:
- DOM querying and element info extraction
- Form filling and button clicking
- Wait for selectors
- Screenshots
- Cookie management
- Mouse and keyboard input simulation
- PDF generation
- Raw CDP calls

### 2. Web Scraper (`web-scraper.ts`)

Shows how to build a web scraper that navigates pages and extracts data:

```bash
bun run examples/automation/web-scraper.ts
```

Features demonstrated:
- Page navigation (pagination)
- Data extraction from DOM
- Handling dynamic content
- Multi-page scraping

### 3. PDF Generator (`pdf-generator.ts`)

Generate PDFs from HTML content (invoices, reports, etc.):

```bash
bun run examples/automation/pdf-generator.ts
```

Features demonstrated:
- Professional invoice template
- PDF generation with options
- Screenshot fallback
- File saving

## API Overview

### Window.automation

High-level automation API using JavaScript injection:

```typescript
const window = new Window({ width: 1200, height: 800 });

// Navigation
await window.automation.goBack();
await window.automation.goForward();
await window.automation.reload();
const url = await window.automation.getUrl();
const title = await window.automation.getTitle();

// Content extraction
const html = await window.automation.getHtml();
const text = await window.automation.getText();
const screenshot = await window.automation.screenshot();

// DOM interaction
const element = await window.automation.querySelector('.my-class');
const elements = await window.automation.querySelectorAll('button');
await window.automation.click('#submit-btn');
await window.automation.type('#input-field', 'Hello');
const value = await window.automation.getValue('#input-field');

// Scrolling
await window.automation.scrollTo(0, 500);
await window.automation.scrollIntoView('.footer');

// Waiting
const found = await window.automation.waitForSelector('.loaded', 5000);
```

### Window.protocol

Low-level CDP (Chrome DevTools Protocol) interface:

```typescript
// Cookies
const cookies = await window.protocol.getCookies('https://example.com');
await window.protocol.setCookie({ name: 'session', value: 'abc123', domain: 'example.com' });
await window.protocol.deleteCookies('session', { domain: 'example.com' });
await window.protocol.clearCookies();

// PDF generation
const pdfBase64 = await window.protocol.printToPDF({
    landscape: false,
    printBackground: true,
    paperWidth: 8.5,
    paperHeight: 11
});

// Input simulation
await window.protocol.clickAt(100, 200);
await window.protocol.doubleClickAt(100, 200);
await window.protocol.moveMouse(300, 400);
await window.protocol.pressKey('Enter');
await window.protocol.insertText('Hello World');

// Network
await window.protocol.enableNetworkMonitoring();
await window.protocol.setBlockedURLs(['*.ads.com/*']);
await window.protocol.setExtraHTTPHeaders({ 'X-Custom': 'value' });
await window.protocol.clearCache();

// Raw CDP (Windows has full support, macOS has limited emulation)
const result = await window.protocol.call('Page.captureScreenshot', { format: 'png' });
```

## Platform Notes

### Windows (WebView2)
- Full native CDP support
- All features work as expected
- Request interception fully supported

### macOS (WKWebView)
- CDP emulated via WKWebView APIs
- Cookies: Full support via WKHTTPCookieStore
- PDF: Supported via NSPrintOperation
- Input: Emulated via JavaScript events
- Network interception: Limited support

## Use Cases

1. **AI Agents**: Let AI navigate websites, fill forms, extract data
2. **Testing**: Automated UI testing and verification
3. **Scraping**: Extract data from web pages
4. **PDF Generation**: Create documents from HTML templates
5. **Automation**: Automate repetitive web tasks
