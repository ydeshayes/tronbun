import { resolve, join } from "path";
import { writeFileSync, existsSync } from "fs";
import { $ } from "bun";
import type { TronbunConfig } from "../types.js";
import { Utils } from "../utils.js";

function sanitizeVariableName(name: string) {
  // Remove invalid characters and replace with _
  let clean = name.replace(/[^a-zA-Z0-9_$]/g, '_');

  // If it starts with a digit, prefix with an underscore
  if (/^[0-9]/.test(clean)) {
    clean = '_' + clean;
  }

  // Optionally, ensure it’s not a reserved word (optional check below)
  const reservedWords = new Set(['class', 'return', 'function', 'const', 'var', 'let', 'if', 'else']); // extend as needed
  if (reservedWords.has(clean)) {
    clean = '_' + clean;
  }

  return clean;
}

export class InitCommand {
  static async init(projectName?: string): Promise<void> {
    const name = projectName || "my-tronbun-app";
    const projectDir = resolve(process.cwd(), name);
    
    console.log("🎯 Creating new Tronbun application:", name);
    
    // Create project structure
    Utils.ensureDir(projectDir);
    Utils.ensureDir(join(projectDir, "src"));
    Utils.ensureDir(join(projectDir, "src/web"));
    Utils.ensureDir(join(projectDir, "public"));

    // Create default HTML file
    const defaultHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Tronbun App</title>
</head>
<body>
  <h1>Hello, World!</h1>
  <button onclick="greetUser()">Greet User</button>
  <div id="result"></div>

  <script src="index.js"></script>
</body>
</html>
`;

    writeFileSync(join(projectDir, "public/index.html"), defaultHtml);

    // Copy app icon from tronbun assets
    const tronbunRoot = resolve(__dirname, "..", "..");
    const assetsDir = resolve(tronbunRoot, "assets");
    const iconPath = resolve(assetsDir, "icon.icns");
    
    if (existsSync(iconPath)) {
      Utils.ensureDir(join(projectDir, "assets"));
      console.log("🎨 Copying app icon...");
      await $`cp ${iconPath} ${join(projectDir, "assets")}/`;
    }

    // Create tronbun config
    const config: TronbunConfig = {
      name,
      version: "1.0.0",
      main: "src/main.ts",
      web: {
        entry: "src/web/index.ts",
        outDir: "dist/web",
        publicDir: "public"
      },
      backend: {
        entry: "src/main.ts",
        outDir: "dist"
      },
      build: {
        target: "bun",
        minify: false,
        sourcemap: true
      }
    };
    
    writeFileSync(join(projectDir, "tronbun.config.json"), JSON.stringify(config, null, 2));
    
    // Create package.json
    const packageJson = {
      name,
      version: "1.0.0",
      description: "A Tronbun desktop application",
      main: "src/main.ts",
      scripts: {
        "build": "tronbun build",
        "dev": "tronbun dev",
        "start": "tronbun run",
        "generate-types": "tronbun generate-types",
        "compile": "tronbun compile"
      },
      dependencies: {
        "tronbun": "latest"
      },
      devDependencies: {
        "@types/bun": "latest",
        "typescript": "^5"
      }
    };
    
    writeFileSync(join(projectDir, "package.json"), JSON.stringify(packageJson, null, 2));
    
    const windowName = sanitizeVariableName(name);

    // Create main backend file
    const mainTs = `import { WindowIPC, findWebAssetPath, mainHandler, windowName } from "tronbun";

  @windowName('${windowName}')
  export class MainWindow extends WindowIPC {
    constructor() {
      super({
        title: "Hello world",
        width: 800,
        height: 600
      });
    }
  
    @mainHandler('greet')
    async handleGreet(name: string): Promise<string> {
      console.log(\`Hello \${name}\`);
      return \`Hello, \${name} from the decorated window!\`;
    }
  
    @mainHandler('calculate')
    async handleCalculate(data: { a: number; b: number; operation: string }): Promise<number> {
      const { a, b, operation } = data;
      switch (operation) {
        case 'add':
          return a + b;
        case 'subtract':
          return a - b;
        case 'multiply':
          return a * b;
        case 'divide':
          return b !== 0 ? a / b : 0;
        default:
          throw new Error(\`Unknown operation: \${operation}\`);
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

  const window = new MainWindow();

  const webAssetsPath = findWebAssetPath("index.html", __dirname);
  
  if (!webAssetsPath) {
    throw new Error("Could not find web assets. Make sure the dist/web/index.html file exists.");
  }

  // Load the web interface from file
  console.log("Loading web assets from:", webAssetsPath);
  await window.navigate(\`file://\${webAssetsPath}\`);
`;
    
    writeFileSync(join(projectDir, "src/main.ts"), mainTs);
    
    // Create web frontend file
    const webTs = `// Web frontend code that runs in the webview

    async function greetUser() {
      const result = await window.${windowName}.greet('World');
      document.getElementById('result')!.textContent = result;
    }


    window.greetUser = greetUser;

console.log('Web frontend loaded!');
`;
    
    writeFileSync(join(projectDir, "src/web/index.ts"), webTs);
    
    // Create TypeScript config
    const tsConfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        types: ["bun-types"]
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"]
    };
    
    writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify(tsConfig, null, 2));
    
    // Create README
    const readmeLines = [
      `# ${name}`,
      "",
      "A desktop application built with Tronbun.",
      "",
      "## Getting Started",
      "",
      "1. Install dependencies:",
      "   ```bash",
      "   bun install",
      "   ```",
      "",
      "2. Build the application:",
      "   ```bash",
      "   bun run build",
      "   ```",
      "",
      "3. Run the application:",
      "   ```bash",
      "   bun run start",
      "   ```",
      "",
      "## Development",
      "",
      "To start development mode with file watching:",
      "",
      "```bash",
      "bun run dev",
      "```",
      "",
      "## Creating a macOS App Bundle",
      "",
      "To compile your application into a distributable macOS app:",
      "",
      "```bash",
      "bun run compile",
      "```",
      "",
      "This creates a `.app` bundle that can be double-clicked like any native macOS application. No terminal window will appear, and users don't need Bun installed.",
      "",
      "## Project Structure",
      "",
      "- `src/main.ts` - Backend code that runs in Bun",
      "- `src/web/` - Frontend code that runs in the webview",
      "- `public/` - Static assets",
      "- `dist/` - Built application files"
    ];
    
    writeFileSync(join(projectDir, "README.md"), readmeLines.join("\n"));
    
    // Create .gitignore
    const gitignore = `node_modules
dist
.env
.DS_Store
.idea
src/types
`;

    writeFileSync(join(projectDir, ".gitignore"), gitignore);

    console.log("✅ Project '" + name + "' created successfully!");
    console.log("\nNext steps:");
    console.log("  cd " + name);
    console.log("  bun install");
    console.log("  bun run build");
    console.log("  bun run start");
  }
} 