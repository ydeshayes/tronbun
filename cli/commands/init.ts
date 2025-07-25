import { resolve, join } from "path";
import { writeFileSync } from "fs";
import type { TronbunConfig } from "../types.js";
import { Utils } from "../utils.js";

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
    
    // Create main backend file
    const mainTs = `import { Window, findWebAssetPath } from "tronbun";

async function main() {
  const window = new Window({
    title: "${name}",
    width: 800,
    height: 600
  });

  // Set up IPC handlers
  window.registerIPCHandler('greet', (name: string) => {
    return \`Hello, \${name} from Bun!\`;
  });

  // Find web assets using the helper function
  const webAssetsPath = findWebAssetPath("index.html", __dirname);
  
  if (!webAssetsPath) {
    throw new Error("Could not find web assets. Make sure the dist/web/index.html file exists.");
  }

  // Load the web interface from file
  console.log("Loading web assets from:", webAssetsPath);
  await window.navigate(\`file://\${webAssetsPath}\`);

  console.log("Application started!");
}

main().catch(console.error);
`;
    
    writeFileSync(join(projectDir, "src/main.ts"), mainTs);
    
    // Create web frontend file
    const webTs = `// Web frontend code that runs in the webview

declare global {
  interface Window {
    tronbun: {
      invoke: (channel: string, data?: any) => Promise<any>;
    };
  }
}

async function greetUser() {
  try {
    const result = await window.tronbun.invoke('greet', 'World');
    document.getElementById('result')!.innerHTML = \`<p><strong>\${result}</strong></p>\`;
  } catch (error) {
    console.error('IPC call failed:', error);
  }
}

// Make function globally available
(window as any).greetUser = greetUser;

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
    
    console.log("✅ Project '" + name + "' created successfully!");
    console.log("\nNext steps:");
    console.log("  cd " + name);
    console.log("  bun install");
    console.log("  bun run build");
    console.log("  bun run start");
  }
} 