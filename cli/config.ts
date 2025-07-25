import { join } from "path";
import { existsSync, readFileSync } from "fs";
import type { TronbunConfig } from "./types.js";

export class ConfigManager {
  static loadConfig(projectRoot: string): TronbunConfig {
    const configPath = join(projectRoot, "tronbun.config.json");
    
    if (existsSync(configPath)) {
      try {
        return JSON.parse(readFileSync(configPath, "utf-8"));
      } catch (error) {
        console.error("Error parsing tronbun.config.json:", error);
        process.exit(1);
      }
    }

    // Default configuration
    return {
      name: "tronbun-app",
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
  }
} 