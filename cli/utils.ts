import { existsSync, mkdirSync } from "fs";

export class Utils {
  static ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
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
      "  compile         Create macOS app bundle (.app)",
      "  clean           Clean build artifacts",
      "",
      "Options:",
      "  -h, --help      Show this help message",
      "  -v, --version   Show version",
      "  -w, --watch     Watch for file changes",
      "  -d, --dev       Development mode (no minification)",
      "  -o, --output    Output filename for executable (compile command)",
      "",
      "Examples:",
      "  tronbun init my-app           Create a new project",
      "  tronbun build                 Build the application",
      "  tronbun dev                   Start development mode",
      "  tronbun run                   Run the application",
      "  tronbun compile               Create macOS app bundle (.app)",
      "  tronbun compile -o my-app     Create app bundle with custom name"
    ];
    console.log(helpText.join("\n"));
  }

  static showVersion(): void {
    console.log("tronbun v0.0.1");
  }
} 