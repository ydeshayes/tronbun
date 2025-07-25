import { resolve, basename } from "path";
import { existsSync } from "fs";
import { $ } from "bun";
import type { TronbunConfig } from "../types.js";

export class RunCommand {
  static async run(config: TronbunConfig, projectRoot: string): Promise<void> {
    console.log("🏃 Running Tronbun application...");
    
    const mainFile = resolve(
      projectRoot,
      config.backend.outDir,
      basename(config.backend.entry, ".ts") + ".js"
    );
    
    if (!existsSync(mainFile)) {
      console.error("❌ Built application not found. Run 'tronbun build' first.");
      return;
    }

    try {
      await $`bun ${mainFile}`;
    } catch (error) {
      console.error("❌ Application failed to run:", error);
    }
  }
} 