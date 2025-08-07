import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "fs";
import { platform } from "os";
import { resolve, join } from "path";
import { $ } from "bun";

export class Utils {
  static ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  static getPlatform(): 'windows' | 'macos' | 'linux' {
    const osPlatform = platform();
    switch (osPlatform) {
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'macos';
      case 'linux':
        return 'linux';
      default:
        return 'linux';
    }
  }

  static async copyFile(source: string, destination: string): Promise<void> {
    try {
      copyFileSync(source, destination);
    } catch (error) {
      console.error(`Failed to copy file from ${source} to ${destination}:`, error);
      throw error;
    }
  }

  static async copyDirectory(source: string, destination: string): Promise<void> {
    try {
      this.ensureDir(destination);
      
      const items = readdirSync(source);
      
      for (const item of items) {
        const sourcePath = join(source, item);
        const destPath = join(destination, item);
        
        const stat = statSync(sourcePath);
        
        if (stat.isDirectory()) {
          await this.copyDirectory(sourcePath, destPath);
        } else {
          copyFileSync(sourcePath, destPath);
        }
      }
    } catch (error) {
      console.error(`Failed to copy directory from ${source} to ${destination}:`, error);
      throw error;
    }
  }

  static showHelp(): void {
    const helpText = [
      "",
      "Tronbun CLI - Build desktop applications with Bun and webviews",
      "",
      "Usage: tronbun <command> [options]",
      "",
      "Commands:",
      "  init [name]     Create a new Tronbun project",
      "  build           Build the application",
      "  dev             Start development mode with file watching",
      "  run             Run the built application",
      "  compile         Create executable (.exe on Windows, .app on macOS)",
      "  clean           Clean build artifacts",
      "",
      "Options:",
      "  -h, --help      Show this help message",
      "  -v, --version   Show version",
      "  -w, --watch     Watch for file changes",
      "  -d, --dev       Development mode (no minification)",
      "  -o, --output    Output filename for executable (compile command)",
      "  --platform      Target platform: windows, macos, or auto (default: auto)",
      "",
      "Examples:",
      "  tronbun init my-app           Create a new project",
      "  tronbun build                 Build the application",
      "  tronbun dev                   Start development mode",
      "  tronbun run                   Run the application",
      "  tronbun compile               Create executable for current platform",
      "  tronbun compile -o my-app     Create executable with custom name",
      "  tronbun compile --platform windows  Create Windows executable",
      "  tronbun compile --platform macos     Create macOS app bundle"
    ];
    console.log(helpText.join("\n"));
  }

  static showVersion(): void {
    console.log("tronbun v0.0.1");
  }
} 