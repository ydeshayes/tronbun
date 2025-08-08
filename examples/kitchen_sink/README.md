# test-options

A desktop application built with Tronbun.

## Getting Started

1. Install dependencies:
   ```bash
   bun install
   ```

2. Build the application:
   ```bash
   bun run build
   ```

3. Run the application:
   ```bash
   bun run start
   ```

## Development

To start development mode with file watching:

```bash
bun run dev
```

## Creating a macOS App Bundle

To compile your application into a distributable macOS app:

```bash
bun run compile
```

This creates a `.app` bundle that can be double-clicked like any native macOS application. No terminal window will appear, and users don't need Bun installed.

## Project Structure

- `src/main.ts` - Backend code that runs in Bun
- `src/web/` - Frontend code that runs in the webview
- `public/` - Static assets
- `dist/` - Built application files