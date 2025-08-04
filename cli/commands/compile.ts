import { resolve, basename, dirname } from "path";
import { existsSync, writeFileSync } from "fs";
import { $ } from "bun";
import type { TronbunConfig, CompileOptions } from "../types.js";
import { Utils } from "../utils.js";
import { BuildCommand } from "./build.js";

export class CompileCommand {
  static async compile(
    config: TronbunConfig,
    projectRoot: string,
    options: CompileOptions = {}
  ): Promise<boolean> {
    console.log("📦 Compiling Tronbun application to executable...");
    
    // First, build the application
    const buildSuccess = await BuildCommand.build(config, projectRoot);
    if (!buildSuccess) {
      console.error("❌ Build failed, cannot compile executable");
      return false;
    }

    const mainFile = resolve(
      projectRoot,
      config.backend.outDir,
      basename(config.backend.entry, ".ts") + ".js"
    );
    
    if (!existsSync(mainFile)) {
      console.error("❌ Built application not found:", mainFile);
      return false;
    }

    // Determine target platform
    const targetPlatform = options.platform || 'auto';
    const currentPlatform = Utils.getPlatform();
    const platform = targetPlatform === 'auto' ? currentPlatform : targetPlatform;

    if (platform === 'windows') {
      return await this.compileForWindows(config, projectRoot, mainFile, options);
    } else if (platform === 'macos') {
      return await this.compileForMacOS(config, projectRoot, mainFile, options);
    } else {
      console.error("❌ Unsupported platform:", platform);
      return false;
    }
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
      
      // Copy web assets to a dist folder next to the executable
      const webDistDir = resolve(projectRoot, config.web.outDir);
      if (existsSync(webDistDir)) {
        const assetsDir = resolve(projectRoot, "build");
        Utils.ensureDir(assetsDir);
        
        console.log("📁 Copying web assets...");
        await Utils.copyDirectory(webDistDir, assetsDir);
        console.log("✅ Web assets copied to build/");
      }
      
      // Copy webview executable to the same directory as the compiled executable
      const tronbunRoot = resolve(__dirname, "..", "..");
      const webviewExecutable = resolve(tronbunRoot, "webview", "build", "webview_main.exe");
      
      if (existsSync(webviewExecutable)) {
        console.log("🖥️  Copying webview executable...");
        // Copy webview executable to the same directory as the compiled executable
        await Utils.copyFile(webviewExecutable, resolve(dirname(executablePath), "webview_main.exe"));
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
      
      // Copy web assets to the Resources directory
      const webDistDir = resolve(projectRoot, config.web.outDir);
      if (existsSync(webDistDir)) {
        Utils.ensureDir(resolve(resourcesDir, "dist"));
        
        console.log("📁 Copying web assets...");
        await Utils.copyDirectory(webDistDir, resolve(resourcesDir, "dist"));
        console.log("✅ Web assets copied");
      }
      
      // Copy webview executable to Resources
      const tronbunRoot = resolve(__dirname, "..", "..");
      const webviewExecutable = resolve(tronbunRoot, "webview", "build", "webview_main");
      
      if (existsSync(webviewExecutable)) {
        const webviewDir = resolve(resourcesDir, "webview", "build");
        Utils.ensureDir(webviewDir);
        
        console.log("🖥️  Copying webview executable...");
        await Utils.copyFile(webviewExecutable, webviewDir);
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