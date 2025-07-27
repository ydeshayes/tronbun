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

Tronbun provides two ways to create windows: the **basic Window class approach** and the **decorator-based WindowIPC approach** for type-safe IPC handlers.

#### Benefits of Decorator-Based Approach

The decorator-based `WindowIPC` approach offers several advantages:

- **Type Safety**: Full TypeScript support with typed method parameters and return values
- **Better Organization**: IPC handlers are methods on your window class, making code more structured
- **Automatic Registration**: Handlers are automatically registered using decorators
- **IntelliSense Support**: Better IDE support for auto-completion and refactoring
- **Easier Testing**: Window classes can be easily unit tested
- **Clear Intent**: `@windowName` and `@mainHandler` decorators make the code self-documenting

#### Approach 1: Basic Window Class

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

#### Approach 2: Decorator-Based WindowIPC (Recommended)

For better organization and type safety, you can extend the WindowIPC class and use decorators:

```typescript
import { WindowIPC, windowName, mainHandler, findWebAssetPath } from "tronbun";

@windowName('MyApp')
export class MainWindow extends WindowIPC {
  constructor() {
    super({
      title: "My App",
      width: 800,
      height: 600
    });
    
    // Load your web interface
    this.navigate(`file://${findWebAssetPath('index.html')}`);
  }

  @mainHandler('getData')
  async handleGetData(params: any): Promise<{message: string, timestamp: number}> {
    // Your backend logic here with full TypeScript support
    return { message: "Hello from Bun!", timestamp: Date.now() };
  }

  @mainHandler('greet')
  async handleGreet(name: string): Promise<string> {
    console.log(`Hello ${name}`);
    return `Hello, ${name} from the decorated window!`;
  }

  @mainHandler('calculate')
  async handleCalculate(data: { a: number; b: number; operation: string }): Promise<number> {
    const { a, b, operation } = data;
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return b !== 0 ? a / b : 0;
      default: throw new Error(`Unknown operation: ${operation}`);
    }
  }
}

// Create and use your window
const mainWindow = new MainWindow();
```

### Frontend (Web)

#### With Basic Window Class

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

#### With Decorator-Based WindowIPC

When using `WindowIPC`, the class automatically creates a global object with the window name, providing direct access to your handlers:

```typescript
// For a @windowName('MyApp') window, declare the auto-generated API
declare global {
  interface Window {
    MyApp: {
      getData: (params?: any) => Promise<{message: string, timestamp: number}>;
      greet: (name: string) => Promise<string>;
      calculate: (data: { a: number; b: number; operation: string }) => Promise<number>;
    };
    // The base tronbun API is still available
    tronbun: {
      invoke: (channel: string, data?: any) => Promise<any>;
    };
  }
}

// Use the type-safe window-specific API
async function loadData() {
  try {
    // Direct method calls with full type safety
    const result = await window.MyApp.getData({ userId: 123 });
    const greeting = await window.MyApp.greet('World');
    const calculation = await window.MyApp.calculate({ a: 5, b: 3, operation: 'add' });
    
    document.getElementById('app')!.innerHTML = `
      <h1>${result.message}</h1>
      <p>Timestamp: ${result.timestamp}</p>
      <p>${greeting}</p>
      <p>5 + 3 = ${calculation}</p>
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

#### With Basic Window Class

```typescript
import { Window } from "tronbun";

const mainWindow = new Window({ title: "Main Window" });
const settingsWindow = new Window({ title: "Settings", width: 400, height: 300 });

// Each window has its own IPC handlers
mainWindow.registerIPCHandler('openSettings', () => {
  settingsWindow.setHtml('<h1>Settings</h1>');
});
```

#### With Decorator-Based Approach

```typescript
import { WindowIPC, windowName, mainHandler } from "tronbun";

@windowName('MainWindow')
class MainWindow extends WindowIPC {
  private settingsWindow: SettingsWindow;

  constructor() {
    super({ title: "Main Window" });
    this.settingsWindow = new SettingsWindow();
  }

  @mainHandler('openSettings')
  async handleOpenSettings(): Promise<void> {
    await this.settingsWindow.setHtml('<h1>Settings</h1>');
  }
}

@windowName('SettingsWindow')
class SettingsWindow extends WindowIPC {
  constructor() {
    super({ title: "Settings", width: 400, height: 300 });
  }

  @mainHandler('saveSettings')
  async handleSaveSettings(settings: any): Promise<boolean> {
    // Save settings logic
    return true;
  }
}
```

### File System Access

Since your backend runs in Bun, you have full access to the file system:

#### With Basic Window Class

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

#### With Decorator-Based Approach

```typescript
import { WindowIPC, windowName, mainHandler } from "tronbun";
import { readFileSync, writeFileSync } from 'fs';

@windowName('FileManager')
export class FileManagerWindow extends WindowIPC {
  @mainHandler('saveFile')
  async handleSaveFile(data: any): Promise<{ success: boolean }> {
    try {
      writeFileSync('user-data.json', JSON.stringify(data));
      return { success: true };
    } catch (error) {
      console.error('Failed to save file:', error);
      return { success: false };
    }
  }

  @mainHandler('loadFile')
  async handleLoadFile(): Promise<any> {
    try {
      const data = readFileSync('user-data.json', 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load file:', error);
      return null;
    }
  }
}
```

### External APIs

Use Bun's built-in fetch and other APIs:

#### With Basic Window Class

```typescript
window.registerIPCHandler('fetchWeather', async (city) => {
  const response = await fetch(`https://api.weather.com/v1/current?q=${city}`);
  return await response.json();
});
```

#### With Decorator-Based Approach

```typescript
import { WindowIPC, windowName, mainHandler } from "tronbun";

@windowName('WeatherApp')
export class WeatherWindow extends WindowIPC {
  @mainHandler('fetchWeather')
  async handleFetchWeather(city: string): Promise<any> {
    try {
      const response = await fetch(`https://api.weather.com/v1/current?q=${city}`);
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      throw error;
    }
  }

  @mainHandler('getSystemInfo')
  async handleGetSystemInfo(): Promise<{ platform: string; version: string }> {
    return {
      platform: process.platform,
      version: process.version
    };
  }
}
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
