import { resolve } from "path";
import { existsSync } from "fs";
import { $ } from "bun";
import type { TronbunConfig, BuildOptions } from "../types.js";
import { Utils } from "../utils.js";

export class BuildCommand {
  static async buildBackend(
    config: TronbunConfig,
    projectRoot: string,
    options: BuildOptions = {}
  ): Promise<boolean> {
    console.log("🔧 Building backend...");
    
    const entryPath = resolve(projectRoot, config.backend.entry);
    const outDir = resolve(projectRoot, config.backend.outDir);
    
    if (!existsSync(entryPath)) {
      console.error("❌ Backend entry file not found:", entryPath);
      return false;
    }

    Utils.ensureDir(outDir);

    try {
      const buildOptions = [
        "build",
        entryPath,
        "--outdir", outDir,
        "--target", "bun",
      ];

      if (config.build.minify && !options.dev) {
        buildOptions.push("--minify");
      }

      if (config.build.sourcemap) {
        buildOptions.push("--sourcemap");
      }

      if (options.watch) {
        buildOptions.push("--watch");
      }

      await $`bun ${buildOptions}`;
      console.log("✅ Backend build complete");
      return true;
    } catch (error) {
      console.error("❌ Backend build failed:", error);
      return false;
    }
  }

  static async buildWeb(
    config: TronbunConfig,
    projectRoot: string,
    options: BuildOptions = {}
  ): Promise<boolean> {
    console.log("🌐 Building web frontend...");
    
    const entryPath = resolve(projectRoot, config.web.entry);
    const outDir = resolve(projectRoot, config.web.outDir);
    
    if (!existsSync(entryPath)) {
      console.error("❌ Web entry file not found:", entryPath);
      return false;
    }

    Utils.ensureDir(outDir);

    // Empty the outDir
    await $`rm -rf ${outDir}`;

    try {
      const buildOptions = [
        "build",
        entryPath,
        "--outdir", outDir,
        "--target", "browser",
        "--format", "esm",
      ];

      if (config.build.minify && !options.dev) {
        buildOptions.push("--minify");
      }

      if (config.build.sourcemap) {
        buildOptions.push("--sourcemap");
      }

      if (options.watch) {
        buildOptions.push("--watch");
      }

      await $`bun ${buildOptions}`;

      // Copy public files if they exist
      if (config.web.publicDir) {
        const publicDir = resolve(projectRoot, config.web.publicDir);
        if (existsSync(publicDir)) {
          try {
            // Use Bun's built-in file operations for cross-platform compatibility
            const { readdir, copyFile, mkdir } = await import("fs/promises");
            const { join } = await import("path");
            
            const copyRecursive = async (src: string, dest: string) => {
              const entries = await readdir(src, { withFileTypes: true });
              
              for (const entry of entries) {
                const srcPath = join(src, entry.name);
                const destPath = join(dest, entry.name);
                
                if (entry.isDirectory()) {
                  await mkdir(destPath, { recursive: true });
                  await copyRecursive(srcPath, destPath);
                } else {
                  await copyFile(srcPath, destPath);
                }
              }
            };
            
            // Check if there are files to copy first
            const entries = await readdir(publicDir, { withFileTypes: true });
            if (entries.length > 0) {
              await copyRecursive(publicDir, outDir);
            }
          } catch (error) {
            // Ignore errors if no files to copy
            console.log("ℹ️  No public files to copy");
          }
        }
      }

      console.log("✅ Web build complete");
      return true;
    } catch (error) {
      console.error("❌ Web build failed:", error);
      return false;
    }
  }

  static async build(
    config: TronbunConfig,
    projectRoot: string,
    options: BuildOptions = {}
  ): Promise<boolean> {
    console.log("🚀 Building Tronbun application...");
    
    const backendSuccess = await this.buildBackend(config, projectRoot, options);
    const webSuccess = await this.buildWeb(config, projectRoot, options);
    
    if (backendSuccess && webSuccess) {
      console.log("✅ Build complete!");
      return true;
    } else {
      console.error("❌ Build failed!");
      return false;
    }
  }
} 