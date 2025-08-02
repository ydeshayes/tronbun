import { resolve, basename } from "path";
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
        await $`cp -r ${webDistDir} ${resourcesDir}/dist/`;
        console.log("✅ Web assets copied");
      }
      
      // Copy webview executable to Resources
      const tronbunRoot = resolve(__dirname, "..", "..");
      const webviewExecutable = resolve(tronbunRoot, "webview", "build", "webview_main");
      
      if (existsSync(webviewExecutable)) {
        const webviewDir = resolve(resourcesDir, "webview", "build");
        Utils.ensureDir(webviewDir);
        
        console.log("🖥️  Copying webview executable...");
        await $`cp ${webviewExecutable} ${webviewDir}/`;
        console.log("✅ Webview executable copied");
      } else {
        console.warn("⚠️  Webview executable not found at:", webviewExecutable);
        console.warn("    The compiled app may not work correctly");
      }

      // Copy app icon to Resources
      const iconPath = resolve(projectRoot, "assets", "icon.icns");
      if (existsSync(iconPath)) {
        console.log("🎨 Copying app icon...");
        await $`cp ${iconPath} ${resourcesDir}/icon.icns`;
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
      console.error("❌ Compilation failed:", error);
      return false;
    }
  }
} 