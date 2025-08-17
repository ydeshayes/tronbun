# Tronbun (ALPHA)

<div align="center">
  <img src="assets/logo.webp" alt="Tronbun Application Example" width="300">
</div>

A powerful desktop application framework that combines Bun's performance with native webviews. Build desktop apps using TypeScript for both backend (Bun) and frontend (webview) with seamless IPC communication.

## Features

- 🚀 **Bun-powered backend**: Leverage Bun's speed and modern JavaScript APIs
- 🌐 **Native webviews**: Use web technologies for UI
- 🔄 **Seamless IPC**: Easy communication between Bun backend and web frontend
- 🖱️ **System tray support**: Cross-platform tray icons with custom menus
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

# Compile for Windows
bun run compile --platform windows
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

### `compile`
Create an executable for your application.

```bash
# Compile for current platform (auto-detected)
npx tronbun compile

# Compile for specific platform
npx tronbun compile --platform windows
npx tronbun compile --platform macos

# Compile with custom output name
npx tronbun compile -o my-app
npx tronbun compile --platform windows -o my-app
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

### System Tray Icons

Tronbun provides comprehensive system tray support with custom menus, and event handling across all platforms (Windows, macOS, Linux).

#### Basic Tray Usage

```typescript
import { Tray } from "tronbun";

const tray = new Tray({
    icon: "path/to/icon.png",
    tooltip: "My Application",
    menu: [
        {
            id: 'show',
            label: 'Show Window',
            type: 'normal',
            enabled: true,
            callback: () => {
                console.log("Show window clicked!");
                // Handle show window logic here
            }
        },
        {
            id: 'separator1',
            label: '',
            type: 'separator'
        },
        {
            id: 'quit',
            label: 'Quit',
            type: 'normal',
            accelerator: 'Cmd+Q',
            callback: async () => {
                await tray.destroy();
                process.exit(0);
            }
        }
    ]
});

// Handle tray icon clicks (optional)
tray.onClick(() => {
    console.log("Tray icon clicked!");
});
```

##### Alternative: External Menu Handlers

You can still use the traditional approach with external handlers if preferred:

```typescript
const tray = new Tray({
    icon: "path/to/icon.png",
    tooltip: "My Application", 
    menu: [
        { id: 'show', label: 'Show Window', type: 'normal' },
        { id: 'quit', label: 'Quit', type: 'normal', accelerator: 'Cmd+Q' }
    ]
});

// External handlers (will override inline callbacks if both are defined)
tray.onMenuClick('show', (menuId) => {
    console.log(`Menu item ${menuId} clicked`);
});

tray.onMenuClick('quit', async () => {
    await tray.destroy();
    process.exit(0);
});
```

#### Menu Item Types

Tray menus support different item types with optional inline callbacks:

```typescript
const menuItems = [
    // Normal menu item with callback
    {
        id: 'action',
        label: 'Perform Action',
        type: 'normal',
        enabled: true,
        callback: () => {
            console.log('Action performed!');
        }
    },
    
    // Checkbox item with state management
    {
        id: 'toggle',
        label: 'Toggle Feature',
        type: 'checkbox',
        checked: false,
        callback: () => {
            // Toggle logic here
            console.log('Feature toggled!');
        }
    },
    
    // Separator (no callback needed)
    {
        id: 'sep1',
        label: '',
        type: 'separator'
    },
    
    // Item with keyboard shortcut and async callback
    {
        id: 'shortcut',
        label: 'With Shortcut',
        type: 'normal',
        accelerator: 'Ctrl+N',
        callback: async () => {
            console.log('Shortcut activated!');
            // Perform async operations
            await performAsyncAction();
        }
    },
    
    // Submenu with nested callbacks
    {
        id: 'submenu',
        label: 'Options',
        type: 'submenu',
        submenu: [
            {
                id: 'option1',
                label: 'Option 1',
                type: 'normal',
                callback: () => console.log('Option 1 selected')
            },
            {
                id: 'option2', 
                label: 'Option 2',
                type: 'normal',
                callback: () => console.log('Option 2 selected')
            }
        ]
    }
];
```

#### Dynamic Menu Updates

Update the tray menu dynamically with callbacks:

```typescript
// Update menu based on application state
let isConnected = false;

const createDynamicMenu = () => [
    {
        id: 'status',
        label: isConnected ? 'Connected ✓' : 'Disconnected ✗',
        type: 'normal',
        enabled: false
    },
    {
        id: 'connect',
        label: isConnected ? 'Disconnect' : 'Connect',
        type: 'normal',
        callback: async () => {
            if (isConnected) {
                // Disconnect logic
                await disconnect();
                isConnected = false;
            } else {
                // Connect logic
                await connect();
                isConnected = true;
            }
            // Update menu to reflect new state
            await tray.setMenu(createDynamicMenu());
        }
    },
    {
        id: 'separator',
        label: '',
        type: 'separator'
    },
    {
        id: 'refresh',
        label: 'Refresh Status',
        type: 'normal',
        callback: async () => {
            // Check connection status
            isConnected = await checkConnectionStatus();
            await tray.setMenu(createDynamicMenu());
        }
    }
];

// Set initial menu
await tray.setMenu(createDynamicMenu());
```

#### Tray with Window Control

Combine tray icons with window management using inline callbacks:

```typescript
import { Tray, Window } from "tronbun";

const window = new Window({
    title: "My App",
    hidden: true // Start hidden
});

const tray = new Tray({
    icon: "icon.png",
    tooltip: "My App",
    menu: [
        { 
            id: 'show', 
            label: 'Show Window', 
            type: 'normal',
            callback: () => {
                window.showWindow();
            }
        },
        { 
            id: 'hide', 
            label: 'Hide Window', 
            type: 'normal',
            callback: () => {
                window.hideWindow();
            }
        },
        {
            id: 'separator',
            label: '',
            type: 'separator'
        },
        { 
            id: 'quit', 
            label: 'Quit', 
            type: 'normal',
            callback: async () => {
                await tray.destroy();
                await window.close();
                process.exit(0);
            }
        }
    ]
});

// Toggle window visibility on tray click
tray.onClick(() => {
    // Toggle window visibility logic here
    // Note: You may need to track window state manually
    window.showWindow(); // or implement toggle logic
});
```

#### Platform Support

- **macOS**: Uses NSStatusItem with native menu support
- **Windows**: Uses Shell_NotifyIcon with popup menus and balloon tooltips
- **Linux**: Uses GTK StatusIcon

Check platform support:

```typescript
if (Tray.isSupported()) {
    const tray = new Tray({ /* options */ });
} else {
    console.log("Tray icons not supported on this platform");
}
```

#### Complete Tray Example

See `examples/tray-example/` for a complete working example that demonstrates:
- Tray icon creation and management
- Custom menus with different item types
- Click and menu event handling
- Window control from tray
- Proper cleanup and resource management

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

## Platform-Specific Compilation

Tronbun supports compilation for different platforms:

### Windows Compilation
Creates a standalone `.exe` executable with web assets in a `dist/` folder.

```bash
npx tronbun compile --platform windows
```

**Output structure:**
```
my-app/
├── my-app.exe          # Main executable
├── webview_main.exe    # Webview component (same directory)
├── libstdc++-6.dll     # Required runtime library (Windows only)
├── dist/               # Web assets
│   ├── index.html
│   ├── index.js
│   └── ...
└── assets/
    └── icon.ico        # App icon (optional)
```

### macOS Compilation
Creates a `.app` bundle with proper macOS app structure.

```bash
npx tronbun compile --platform macos
```

**Output structure:**
```
my-app.app/
├── Contents/
│   ├── MacOS/
│   │   └── my-app      # Main executable
│   ├── Resources/
│   │   ├── dist/       # Web assets
│   │   ├── webview/    # Webview component
│   │   └── icon.icns   # App icon
│   └── Info.plist      # App metadata
```

### Cross-Platform Development
- Use `--platform auto` (default) to compile for the current platform
- Web assets are automatically copied to the appropriate location
- App icons are supported (`.ico` for Windows, `.icns` for macOS)

## Development Tips

1. **Hot Reload**: Use `bun run dev` for automatic rebuilding during development
2. **Debugging**: Backend logs appear in terminal, frontend logs in webview dev tools
3. **Performance**: The backend runs in Bun (fast), webview renders HTML/CSS/JS natively
4. **Distribution**: Built apps are portable - just ship the compiled files
5. **Platform Detection**: The CLI automatically detects your platform for compilation

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
