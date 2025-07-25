# Tronbun (ALPHA, macOS only build for now)

A powerful desktop application framework that combines Bun's performance with native webviews. Build desktop apps using TypeScript for both backend (Bun) and frontend (webview) with seamless IPC communication.

## Features

- 🚀 **Bun-powered backend**: Leverage Bun's speed and modern JavaScript APIs
- 🌐 **Native webviews**: Use web technologies for UI
- 🔄 **Seamless IPC**: Easy communication between Bun backend and web frontend
- 🛠️ **Built-in CLI**: Comprehensive tooling for development and building
- ⚡ **Fast builds**: Powered by Bun's built-in bundler
- 🔧 **TypeScript support**: Full TypeScript support for both backend and frontend

## Quick Start

### Create a new project

```
npx tronbun init my-app
```

### Development workflow

```bash
cd my-app
bun install

# Development mode with hot reload
bun run dev

# Or build and run
bun run build
bun run start

# Or compile
bun run compile
```

## CLI Commands

The Tronbun CLI provides comprehensive tooling for desktop app development:

### `init [name]`
Create a new Tronbun project with the specified name.

```bash
npx tronbun init my-app
```

### `build`
Build both backend (Bun) and frontend (web) parts of your application.

```bash
npx tronbun build

# Development build (no minification)
npx tronbun build --dev

# Build with file watching
npx tronbun build --watch
```

### `dev`
Start development mode with file watching and hot reload.

```bash
npx tronbun dev
```

### `start`
Run the built application.

```bash
npx tronbun start
```

## Project Structure

A typical Tronbun project has the following structure:

```
my-app/
├── src/
│   ├── main.ts          # Backend code (runs in Bun)
│   └── web/
│       └── index.ts     # Frontend code (runs in webview)
├── public/              # Static assets
├── dist/                # Built files
├── tronbun.config.json  # Configuration
├── package.json
└── tsconfig.json
```

## Configuration

The `tronbun.config.json` file controls build settings:

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "src/main.ts",
  "web": {
    "entry": "src/web/index.ts",
    "outDir": "dist/web",
    "publicDir": "public"
  },
  "backend": {
    "entry": "src/main.ts",
    "outDir": "dist"
  },
  "build": {
    "target": "bun",
    "minify": false,
    "sourcemap": true
  }
}
```

## API Usage

### Backend (Bun)

```typescript
import { Window } from "tronbun";

async function main() {
  const window = new Window({
    title: "My App",
    width: 800,
    height: 600
  });

  // Register IPC handlers
  window.registerIPCHandler('getData', async (params) => {
    // Your backend logic here
    return { message: "Hello from Bun!", timestamp: Date.now() };
  });

  // Load your web interface
  await window.setHtml(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>My App</title>
      <script type="module" src="./index.js"></script>
    </head>
    <body>
      <div id="app">Loading...</div>
    </body>
    </html>
  `);
}

main().catch(console.error);
```

### Frontend (Web)

```typescript
// Declare the tronbun API
declare global {
  interface Window {
    tronbun: {
      invoke: (channel: string, data?: any) => Promise<any>;
    };
  }
}

// Use IPC to communicate with backend
async function loadData() {
  try {
    const result = await window.tronbun.invoke('getData', { userId: 123 });
    document.getElementById('app')!.innerHTML = `
      <h1>${result.message}</h1>
      <p>Timestamp: ${result.timestamp}</p>
    `;
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}

// Initialize your app
loadData();
```

## Advanced Features

### Multiple Windows

```typescript
import { Window } from "tronbun";

const mainWindow = new Window({ title: "Main Window" });
const settingsWindow = new Window({ title: "Settings", width: 400, height: 300 });

// Each window has its own IPC handlers
mainWindow.registerIPCHandler('openSettings', () => {
  settingsWindow.setHtml('<h1>Settings</h1>');
});
```

### File System Access

Since your backend runs in Bun, you have full access to the file system:

```typescript
import { readFileSync, writeFileSync } from 'fs';

window.registerIPCHandler('saveFile', async (data) => {
  writeFileSync('user-data.json', JSON.stringify(data));
  return { success: true };
});

window.registerIPCHandler('loadFile', async () => {
  const data = readFileSync('user-data.json', 'utf-8');
  return JSON.parse(data);
});
```

### External APIs

Use Bun's built-in fetch and other APIs:

```typescript
window.registerIPCHandler('fetchWeather', async (city) => {
  const response = await fetch(`https://api.weather.com/v1/current?q=${city}`);
  return await response.json();
});
```

## Development Tips

1. **Hot Reload**: Use `bun run dev` for automatic rebuilding during development
2. **Debugging**: Backend logs appear in terminal, frontend logs in webview dev tools
3. **Performance**: The backend runs in Bun (fast), webview renders HTML/CSS/JS natively
4. **Distribution**: Built apps are portable - just ship the compiled files

# Library development

## Build webview

The native webview component needs to be built separately:

```bash
cd webview
make all
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

GPLv3 - see LICENSE file for details.
