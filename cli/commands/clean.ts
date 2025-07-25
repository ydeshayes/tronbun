import { resolve } from "path";
import { existsSync } from "fs";
import { $ } from "bun";
import type { TronbunConfig } from "../types.js";

export class CleanCommand {
  static async clean(config: TronbunConfig, projectRoot: string): Promise<void> {
    console.log("🧹 Cleaning build artifacts...");
    
    const outDirs = [
      resolve(projectRoot, config.backend.outDir),
      resolve(projectRoot, config.web.outDir)
    ];
    
    for (const dir of outDirs) {
      if (existsSync(dir)) {
        await $`rm -rf ${dir}`;
        console.log("✅ Cleaned " + dir);
      }
    }
  }
} 