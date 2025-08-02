import type { TronbunConfig } from "../types.js";
import { BuildCommand } from "./build.js";
import { resolve, dirname } from "path";
import { watch } from "fs";
import { spawn } from "bun";
import { existsSync, writeFileSync } from "fs";
import { GenerateTypesCommand } from "./generate-types.js";

export class DevCommand {
  private static appProcess: any = null;
  private static webWatcher: any = null;
  private static backendWatcher: any = null;
  private static isRestarting = false;

  static async dev(config: TronbunConfig, projectRoot: string): Promise<void> {
    console.log("🔥 Starting development mode...");
    
    // Build once first
    const buildSuccess = await BuildCommand.build(config, projectRoot, { dev: true });
    if (!buildSuccess) {
      console.error("❌ Initial build failed. Cannot start dev mode.");
      return;
    }

    // Create dev reload signal file
    this.createReloadSignal(config, projectRoot);

    // Start the application
    await this.startApp(config, projectRoot);

    // Set up file watchers
    this.setupWatchers(config, projectRoot);

    console.log("👀 Watching for changes... Press Ctrl+C to stop");
    
    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping development mode...');
      await this.cleanup();
      process.exit(0);
    });

    // Keep the process running
    await new Promise(() => {});
  }

  private static createReloadSignal(config: TronbunConfig, projectRoot: string): void {
    const signalFile = resolve(projectRoot, '.dev-reload');
    writeFileSync(signalFile, Date.now().toString());
  }

  private static async startApp(config: TronbunConfig, projectRoot: string): Promise<void> {
    if (this.appProcess) {
      this.appProcess.kill();
      this.appProcess = null;
    }

    // Get the backend entry filename and convert to .js
    const backendEntry = config.backend.entry;
    const entryFilename = backendEntry.split('/').pop()?.replace('.ts', '.js') || 'main.js';
    const mainFile = resolve(projectRoot, config.backend.outDir, entryFilename);

    if (!existsSync(mainFile)) {
      console.error("❌ Built application not found:", mainFile);
      return;
    }

    console.log("🚀 Starting application...");
    this.appProcess = spawn({
      cmd: ["bun", mainFile],
      cwd: projectRoot,
      stdio: ['inherit', 'inherit', 'inherit'],
      env: {
        ...process.env,
        TRONBUN_DEV_MODE: 'true'
      }
    });

    // Handle process exit
    this.appProcess.exited.then((code: number) => {
      if (!this.isRestarting) {
        console.log(`\n💥 Application exited with code: ${code}`);
        if (code !== 0) {
          console.log("🔄 Restarting application...");
          setTimeout(() => this.startApp(config, projectRoot), 1000);
        }
      }
    });

    // Give the app a moment to start
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log("✅ Application started!");
  }

  private static setupWatchers(config: TronbunConfig, projectRoot: string): void {
    // Watch backend files
    const backendEntry = resolve(projectRoot, config.backend.entry);
    const backendDir = dirname(backendEntry);
    
    console.log("👁️  Watching backend files in:", backendDir);
    this.backendWatcher = watch(backendDir, { recursive: true }, async (eventType, filename) => {
      if (filename && (filename.endsWith('.ts') || filename.endsWith('.js'))) {
        console.log(`\n📝 Backend file changed: ${filename}`);
        await this.restartApp(config, projectRoot);
      }
    });

    // Watch web files
    const webEntry = resolve(projectRoot, config.web.entry);
    const webDir = dirname(webEntry);
    
    console.log("👁️  Watching web files in:", webDir);
    this.webWatcher = watch(webDir, { recursive: true }, async (eventType, filename) => {
      if (filename && (filename.endsWith('.tsx') || filename.endsWith('.ts') || filename.endsWith('.js') || filename.endsWith('.jsx') || filename.endsWith('.html') || filename.endsWith('.css'))) {
        console.log(`\n🌐 Web file changed: ${filename}`);
        await this.reloadWeb(config, projectRoot);
      }
    });

    // Watch public directory if it exists
    if (config.web.publicDir) {
      const publicDir = resolve(projectRoot, config.web.publicDir);
      if (existsSync(publicDir)) {
        console.log("👁️  Watching public files in:", publicDir);
        watch(publicDir, { recursive: true }, async (eventType, filename) => {
          if (filename) {
            console.log(`\n📁 Public file changed: ${filename}`);
            await this.reloadWeb(config, projectRoot);
          }
        });
      }
    }
  }

  private static async restartApp(config: TronbunConfig, projectRoot: string): Promise<void> {
    if (this.isRestarting) return;
    this.isRestarting = true;

    try {
      console.log("🔄 Rebuilding backend...");
      const buildSuccess = await BuildCommand.buildBackend(config, projectRoot, { dev: true });
      await GenerateTypesCommand.generateTypes(config, projectRoot);

      if (buildSuccess) {
        console.log("🔄 Restarting application...");
        await this.startApp(config, projectRoot);
      } else {
        console.error("❌ Backend rebuild failed. Application not restarted.");
      }
    } finally {
      this.isRestarting = false;
    }
  }

  private static async reloadWeb(config: TronbunConfig, projectRoot: string): Promise<void> {
    console.log("🔄 Rebuilding web assets...");

    const buildSuccess = await BuildCommand.buildWeb(config, projectRoot, { dev: true });
    
    if (buildSuccess) {
      // Update the reload signal file to trigger hot reload
      this.createReloadSignal(config, projectRoot);
      console.log("🔄 Web assets rebuilt successfully!");
      console.log("🔥 Hot reload signal sent!");
    } else {
      console.error("❌ Web rebuild failed.");
    }
  }

  private static async cleanup(): Promise<void> {
    if (this.appProcess) {
      this.appProcess.kill();
      this.appProcess = null;
    }

    if (this.webWatcher) {
      this.webWatcher.close();
      this.webWatcher = null;
    }

    if (this.backendWatcher) {
      this.backendWatcher.close();
      this.backendWatcher = null;
    }

    console.log("🧹 Development mode cleaned up");
  }
} 