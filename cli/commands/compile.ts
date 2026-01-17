import { resolve, basename, dirname } from "path";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import { $ } from "bun";
import type { TronbunConfig, CompileOptions } from "../types.js";
import { Utils } from "../utils.js";
import { BuildCommand } from "./build.js";

/**
 * Generates embedded-assets.ts with a map of all web files.
 * Uses a global variable so Window.ts can access it without import path issues.
 * Supports lazy loading by preserving the file structure.
 *
 * Files are compressed with gzip for:
 * - Obfuscation (not readable with `strings` command)
 * - Smaller binary size
 * - Faster IPC transfers
 */
async function generateEmbeddedAssets(
  projectRoot: string,
  config: TronbunConfig,
  embeddedFiles: Record<string, string>
): Promise<string> {
  // Compress each file's content with gzip and encode as base64
  const compressedFiles: Record<string, string> = {};
  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const [path, content] of Object.entries(embeddedFiles)) {
    const originalSize = content.length;
    totalOriginal += originalSize;

    // Compress with gzip
    const compressed = Bun.gzipSync(Buffer.from(content, 'utf-8'));
    const base64 = Buffer.from(compressed).toString('base64');

    totalCompressed += base64.length;
    compressedFiles[path] = base64;
  }

  const compressionRatio = ((1 - totalCompressed / totalOriginal) * 100).toFixed(1);
  console.log(`📦 Compressed ${Object.keys(embeddedFiles).length} files (${compressionRatio}% smaller)`);

  // Generate file entries
  const fileEntries = Object.entries(compressedFiles)
    .map(([path, content]) => `  "${path}": "${content}"`)
    .join(',\n');

  // Use globalThis to register embedded content so Window.ts can access it
  // Content is compressed and will be decompressed at runtime
  const embeddedModule = `// Auto-generated file - DO NOT EDIT
// This file contains embedded web assets for production builds
// Files are gzip compressed and base64 encoded for obfuscation and size reduction

const compressedFiles: Record<string, string> = {
${fileEntries}
};

// Register globally for tronbun to access (marked as compressed)
(globalThis as any).__TRONBUN_EMBEDDED_FILES_COMPRESSED__ = compressedFiles;

export { compressedFiles };
`;

  const embeddedPath = resolve(projectRoot, config.backend.outDir, "embedded-assets.ts");
  await Bun.write(embeddedPath, embeddedModule);
  console.log("✅ Generated embedded-assets.ts with", Object.keys(embeddedFiles).length, "compressed files");
  return embeddedPath;
}

export class CompileCommand {
  static async compile(
    config: TronbunConfig,
    projectRoot: string,
    options: CompileOptions = {}
  ): Promise<boolean> {
    console.log("📦 Compiling Tronbun application to executable...");

    // First, build the application (without sourcemaps for production)
    const originalSourcemap = config.build.sourcemap;
    config.build.sourcemap = false; // Disable sourcemaps for production

    const buildSuccess = await BuildCommand.build(config, projectRoot);
    config.build.sourcemap = originalSourcemap; // Restore original config

    if (!buildSuccess) {
      console.error("❌ Build failed, cannot compile executable");
      return false;
    }

    // Collect all web files for embedding (supports lazy loading)
    // Obfuscation is configured via build.obfuscation in tronbun.config.json
    const obfuscationEnabled = config.build.obfuscation?.enabled ?? false;
    if (obfuscationEnabled) {
      console.log("🔒 Obfuscating JavaScript for production...");
    } else {
      console.log("📦 Collecting JavaScript for production...");
    }
    const embeddedFiles = await BuildCommand.collectEmbeddedFiles(config, projectRoot, config.build.obfuscation);
    if (!embeddedFiles) {
      console.error("❌ Failed to collect embedded files");
      return false;
    }

    // Generate embedded-assets.ts with file map
    const embeddedAssetsPath = await generateEmbeddedAssets(projectRoot, config, embeddedFiles);

    const mainFile = resolve(
      projectRoot,
      config.backend.outDir,
      basename(config.backend.entry, ".ts") + ".js"
    );

    if (!existsSync(mainFile)) {
      console.error("❌ Built application not found:", mainFile);
      return false;
    }

    // Build embedded-assets.ts to .js
    const embeddedJsPath = embeddedAssetsPath.replace('.ts', '.js');
    await $`bun build ${embeddedAssetsPath} --outfile ${embeddedJsPath} --target bun`;

    // Save original main.js content for restoration after compile
    const originalMainContent = await Bun.file(mainFile).text();

    // Prepend import of embedded-assets to main.js so it's executed at startup
    const embeddedImport = `import "./embedded-assets.js";\n`;
    if (!originalMainContent.includes('embedded-assets')) {
      await Bun.write(mainFile, embeddedImport + originalMainContent);
      console.log("✅ Injected embedded assets import into main.js");
    }

    // Determine target platform
    const targetPlatform = options.platform || 'auto';
    const currentPlatform = Utils.getPlatform();
    const platform = targetPlatform === 'auto' ? currentPlatform : targetPlatform;

    let result: boolean;
    if (platform === 'windows') {
      result = await this.compileForWindows(config, projectRoot, mainFile, options);
    } else if (platform === 'macos') {
      result = await this.compileForMacOS(config, projectRoot, mainFile, options);
    } else {
      console.error("❌ Unsupported platform:", platform);
      return false;
    }

    // Clean up: restore original main.js and remove generated files
    try {
      // Restore original main.js (without embedded import)
      await Bun.write(mainFile, originalMainContent);

      if (existsSync(embeddedAssetsPath)) {
        unlinkSync(embeddedAssetsPath);
      }
      const embeddedJsCleanup = embeddedAssetsPath.replace('.ts', '.js');
      if (existsSync(embeddedJsCleanup)) {
        unlinkSync(embeddedJsCleanup);
      }

      // Remove .map files from dist/web (not needed in production)
      const webOutDir = resolve(projectRoot, config.web.outDir);
      if (existsSync(webOutDir)) {
        const { readdirSync } = await import('fs');
        const files = readdirSync(webOutDir);
        for (const file of files) {
          if (file.endsWith('.map')) {
            unlinkSync(resolve(webOutDir, file));
          }
        }
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    return result;
  }

  private static async compileForWindows(
    config: TronbunConfig,
    projectRoot: string,
    mainFile: string,
    options: CompileOptions
  ): Promise<boolean> {
    const outputName = options.output || config.name;
    const executablePath = resolve(projectRoot, 'build', `${outputName}.exe`);

    try {
      console.log("🔨 Creating Windows executable...");
      
      const compileOptions = [
        "build",
        mainFile,
        "--compile",
        "--outfile", executablePath,
        "--target", "bun"
      ];

      if (config.build.minify) {
        compileOptions.push("--minify");
      }

      await $`bun ${compileOptions}`;

      // Web assets are now embedded in the executable - no need to copy dist/
      console.log("✅ Web assets embedded in executable (no external files)");

      // Copy webview executable to the same directory as the compiled executable
      const tronbunRoot = resolve(__dirname, "..", "..");
      const webviewExecutable = resolve(tronbunRoot, "webview", "build", "webview_main_win.exe");
      const trayExecutable = resolve(tronbunRoot, "webview", "build", "tray_main_win.exe");
      
      if (existsSync(webviewExecutable)) {
        console.log("🖥️  Copying webview executable...");
        // Copy webview executable to the same directory as the compiled executable
        await Utils.copyFile(webviewExecutable, resolve(dirname(executablePath), "webview_main_win.exe"));
        await Utils.copyFile(trayExecutable, resolve(dirname(executablePath), "tray_main_win.exe"));
        console.log("✅ Webview executable copied");
      } else {
        console.warn("⚠️  Webview executable not found at:", webviewExecutable);
        console.warn("    The compiled app may not work correctly");
      }

      // Copy app icon if available
      const iconPath = resolve(projectRoot, "assets", "icon.ico");
      if (existsSync(iconPath)) {
        console.log("🎨 App icon found:", iconPath);
        console.log("   Note: Windows executable icons need to be embedded during compilation");
        console.log("   Consider using a tool like rcedit to set the icon after compilation");
      } else {
        console.warn("⚠️  App icon not found at:", iconPath);
        console.warn("    Consider adding an icon.ico file to the assets folder");
      }

      console.log("✅ Windows executable created:", executablePath);
      console.log("🚀 You can now run:", executablePath);
      return true;
    } catch (error) {
      console.error("❌ Windows compilation failed:", error);
      return false;
    }
  }

  private static async compileForMacOS(
    config: TronbunConfig,
    projectRoot: string,
    mainFile: string,
    options: CompileOptions
  ): Promise<boolean> {
    // Determine output name and create macOS app bundle structure
    const outputName = options.output || config.name;
    const appBundleName = `${outputName}.app`;
    const appBundleDir = resolve(projectRoot, appBundleName);
    const contentsDir = resolve(appBundleDir, "Contents");
    const macosDir = resolve(contentsDir, "MacOS");
    const resourcesDir = resolve(contentsDir, "Resources");

    try {
      console.log("🔨 Creating macOS app bundle...");
      
      // Create app bundle directory structure
      Utils.ensureDir(appBundleDir);
      Utils.ensureDir(contentsDir);
      Utils.ensureDir(macosDir);
      Utils.ensureDir(resourcesDir);
      
      const executablePath = resolve(macosDir, outputName);
      
      const compileOptions = [
        "build",
        mainFile,
        "--compile",
        "--outfile", executablePath,
        "--target", "bun"
      ];

      if (config.build.minify) {
        compileOptions.push("--minify");
      }

      await $`bun ${compileOptions}`;

      // Web assets are now embedded in the executable - no need to copy dist/
      console.log("✅ Web assets embedded in executable (no external files)");

      // Copy webview executable to Resources
      const tronbunRoot = resolve(__dirname, "..", "..");
      const webviewExecutable = resolve(tronbunRoot, "webview", "build", "webview_main");
      const trayExecutable = resolve(tronbunRoot, "webview", "build", "tray_main");
      
      if (existsSync(webviewExecutable)) {
        const webviewDir = resolve(resourcesDir, "webview", "build");
        Utils.ensureDir(webviewDir);
        
        console.log("🖥️  Copying webview executable...");
        await Utils.copyFile(webviewExecutable, resolve(webviewDir, "webview_main"));
        await Utils.copyFile(trayExecutable, resolve(webviewDir, "tray_main"));
        console.log("✅ Webview executable copied");
      } else {
        console.warn("⚠️  Webview executable not found at:", webviewExecutable);
        console.warn("    The compiled app may not work correctly");
      }

      // Copy app icon to Resources
      const iconPath = resolve(projectRoot, "assets", "icon.icns");
      if (existsSync(iconPath)) {
        console.log("🎨 Copying app icon...");
        await Utils.copyFile(iconPath, resolve(resourcesDir, "icon.icns"));
        console.log("✅ App icon copied");
      } else {
        console.warn("⚠️  App icon not found at:", iconPath);
        console.warn("    The app bundle may not have an icon");
      }

      // Copy assets folder to Resources (for tray icons, etc.)
      const assetsDir = resolve(projectRoot, "assets");
      if (existsSync(assetsDir)) {
        const destAssetsDir = resolve(resourcesDir, "assets");
        Utils.ensureDir(destAssetsDir);
        console.log("📁 Copying assets folder...");
        await Utils.copyDirectory(assetsDir, destAssetsDir);
        console.log("✅ Assets folder copied");
      }

      // Create Info.plist for the app bundle
      const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${outputName}</string>
    <key>CFBundleIdentifier</key>
    <string>com.tronbun.${outputName}</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleName</key>
    <string>${config.name}</string>
    <key>CFBundleDisplayName</key>
    <string>${config.name}</string>
    <key>CFBundleVersion</key>
    <string>${config.version}</string>
    <key>CFBundleShortVersionString</key>
    <string>${config.version}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>`;
      
      writeFileSync(resolve(contentsDir, "Info.plist"), infoPlist);
      console.log("✅ Info.plist created");
      
      console.log("✅ macOS app bundle created:", appBundleDir);
      console.log("🚀 You can now double-click the app or run:", `open ${appBundleName}`);
      return true;
    } catch (error) {
      console.error("❌ macOS compilation failed:", error);
      return false;
    }
  }
} 