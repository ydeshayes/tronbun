import { resolve, basename, dirname } from "path";
import { existsSync, readdirSync } from "fs";
import { $ } from "bun";
import type { TronbunConfig, BuildOptions } from "../types.js";
import { Utils } from "../utils.js";
import { GenerateTypesCommand } from "./generate-types.js";
import JavaScriptObfuscator from "javascript-obfuscator";

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

  /**
   * Obfuscates JavaScript code to make it unreadable.
   * Uses javascript-obfuscator with high obfuscation settings.
   */
  private static obfuscateJs(code: string): string {
    const result = JavaScriptObfuscator.obfuscate(code, {
      // High obfuscation - balance between security and performance
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false, // Keep false to not break window.* APIs
      rotateStringArray: true,
      selfDefending: true,
      shuffleStringArray: true,
      splitStrings: true,
      splitStringsChunkLength: 10,
      stringArray: true,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 4,
      stringArrayWrappersType: 'function',
      stringArrayThreshold: 0.75,
      transformObjectKeys: true,
      unicodeEscapeSequence: false, // Keep false for performance
    });
    return result.getObfuscatedCode();
  }

  /**
   * Collects all files from the web output directory into a map structure.
   * This preserves the file structure for lazy loading and code splitting support.
   * Used by the compile command to embed web content into the executable.
   *
   * @param obfuscate If true, JavaScript files will be obfuscated
   * @returns Map of relative paths to file contents (excluding .map files in production)
   */
  static async collectEmbeddedFiles(
    config: TronbunConfig,
    projectRoot: string,
    obfuscate: boolean = false
  ): Promise<Record<string, string> | null> {
    console.log("📦 Collecting web assets for embedding...");

    const outDir = resolve(projectRoot, config.web.outDir);

    if (!existsSync(outDir)) {
      console.error("❌ Web output directory not found:", outDir);
      return null;
    }

    try {
      const { readdir, stat } = await import("fs/promises");
      const { join, relative } = await import("path");

      const files: Record<string, string> = {};

      // Recursively collect all files
      const collectFiles = async (dir: string) => {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            await collectFiles(fullPath);
          } else {
            // Skip .map files in production
            if (entry.name.endsWith('.map')) {
              console.log(`  ⊘ Skipping sourcemap: ${entry.name}`);
              continue;
            }

            // Get relative path from outDir
            const relativePath = relative(outDir, fullPath);

            // Read file content
            let content = await Bun.file(fullPath).text();

            // Remove sourcemap references from JS/CSS files
            if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) {
              content = content
                .replace(/\/\/# sourceMappingURL=.+\.map/g, '')
                .replace(/\/\*# sourceMappingURL=.+\.map \*\//g, '');
            }

            // Obfuscate JavaScript files if requested
            if (obfuscate && entry.name.endsWith('.js')) {
              console.log(`  🔒 Obfuscating: ${relativePath}`);
              try {
                content = this.obfuscateJs(content);
              } catch (err) {
                console.warn(`  ⚠️ Obfuscation failed for ${relativePath}, using original`);
              }
            }

            files[relativePath] = content;
            console.log(`  ✓ Collected: ${relativePath}`);
          }
        }
      };

      await collectFiles(outDir);

      const fileCount = Object.keys(files).length;
      console.log(`✅ Collected ${fileCount} files for embedding`);
      return files;

    } catch (error) {
      console.error("❌ Failed to collect embedded files:", error);
      return null;
    }
  }

  static async build(
    config: TronbunConfig,
    projectRoot: string,
    options: BuildOptions = {}
  ): Promise<boolean> {
    console.log("🚀 Building Tronbun application...");
    
    const backendSuccess = await this.buildBackend(config, projectRoot, options);
    await GenerateTypesCommand.generateTypes(config, projectRoot);
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