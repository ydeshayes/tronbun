import { resolve, dirname, join } from "path";
import { existsSync, readFileSync, watchFile } from "fs";
import { fileURLToPath } from 'url';

import { ConfigManager } from "../cli/config.js";
import type { TronbunConfig } from "../cli/types.js";

export function isCompiledExecutable() {
    // Check if we're running from a compiled executable
    // When compiled, import.meta.url will contain '$bunfs' (Bun's virtual filesystem)
    // and we're not running directly from bun
    console.log("isCompiledExecutable", import.meta.url.includes('$bunfs'), process.argv, process.argv[0] !== 'bun', process.argv[1]?.endsWith('.exe'));
    return import.meta.url.includes('$bunfs') || process.argv[1]?.endsWith('.exe');
}

function loadProjectConfig(projectRoot?: string): TronbunConfig {
    const root = projectRoot || process.cwd();
    return ConfigManager.loadConfig(root);
}

/**
 * Resolves the path to web assets, handling both development and compiled executable scenarios.
 * Uses the same logic as Webview.ts for consistent path resolution.
 * 
 * @param relativePath - The relative path from the configured output directory to the asset (e.g., "index.html")
 * @param callerDirname - The __dirname of the calling file
 * @param projectRoot - Optional project root path (defaults to process.cwd())
 * @returns The resolved absolute path to the web asset
 */
export function resolveWebAssetPath(relativePath: string, callerDirname: string, projectRoot?: string): string {
    
    // Load configuration to get the actual output directories
    const config = loadProjectConfig(projectRoot);
    const webOutDir = config.web?.outDir || "dist/web";
    
    if (isCompiledExecutable()) {
        // For compiled executables, use the same logic as Webview.ts
        // Get the original command that was used to run this executable
        const originalCommand = process.argv0;
        
        // Try to construct the path based on the executable location
        let executableDir: string;
        
        if (originalCommand && originalCommand !== 'bun' && originalCommand.includes('/')) {
            const execPath = resolve(originalCommand);
            
            // Check if this is a macOS app bundle structure
            if (execPath.includes('.app/Contents/MacOS/')) {
                // Extract the app bundle root and look in Resources
                const appBundleRoot = execPath.split('.app/Contents/MacOS/')[0] + '.app';
                executableDir = resolve(appBundleRoot, 'Contents', 'Resources');
            } else {
                // Legacy structure - assets are relative to executable
                executableDir = dirname(execPath);
            }

            return resolve(executableDir, "dist", relativePath);
        } else if (process.argv[1] && process.argv[1].endsWith('.exe')) {
           const exePath = process.execPath;
           const realDir = dirname(exePath);
            executableDir = realDir;

            return resolve(executableDir, relativePath);
        } else {
            // Fallback: assume the executable is in the current working directory
            executableDir = process.cwd();
        }
        
        return resolve(executableDir, webOutDir, relativePath);
    } else {
        // For development: assets are relative to the source directory
        return resolve(callerDirname, "..", webOutDir, relativePath);
    }
}

/**
 * Finds and returns the first existing web asset path from multiple possible locations.
 * Uses the same detection logic as Webview.ts for consistent behavior.
 * 
 * @param relativePath - The relative path from the configured output directory to the asset
 * @param callerDirname - The __dirname of the calling file
 * @param projectRoot - Optional project root path (defaults to process.cwd())
 * @returns The resolved path if found, or null if not found
 */
export function findWebAssetPath(relativePath: string, callerDirname: string, projectRoot?: string): string | null {
    const primaryPath = resolveWebAssetPath(relativePath, callerDirname, projectRoot);

    if (existsSync(primaryPath)) {
        return primaryPath;
    }
    
    return null;
}

/**
 * Sets up hot reload functionality for development mode.
 * Watches for changes to the .dev-reload signal file and calls the callback when detected.
 * 
 * @param webAssetPath - The path to the web assets directory
 * @param onReload - Callback function to execute when a reload is triggered
 * @returns A cleanup function to stop watching
 */
export function setupHotReload(webAssetPath: string, onReload: () => void): () => void {
    // Only enable in development mode
    if (!process.env.TRONBUN_DEV_MODE) {
        return () => {}; // Return empty cleanup function
    }

    const webDir = dirname(webAssetPath);
    const reloadSignalFile = resolve(webDir, '.dev-reload');
    
    let lastReloadTime = 0;
    
    // Read initial timestamp if file exists
    if (existsSync(reloadSignalFile)) {
        try {
            lastReloadTime = parseInt(readFileSync(reloadSignalFile, 'utf8'));
        } catch (error) {
            // Ignore errors reading initial timestamp
        }
    }
    
    // Watch for changes to the reload signal file
    watchFile(reloadSignalFile, { interval: 500 }, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
            try {
                const newReloadTime = parseInt(readFileSync(reloadSignalFile, 'utf8'));
                if (newReloadTime > lastReloadTime) {
                    lastReloadTime = newReloadTime;
                    onReload();
                }
            } catch (error) {
                // Ignore errors reading reload signal
                console.warn("Warning: Could not read reload signal:", error);
            }
        }
    });
    
    // Return cleanup function
    return () => {
        try {
            const fs = require('fs');
            fs.unwatchFile(reloadSignalFile);
        } catch (error) {
            // Ignore cleanup errors
        }
    };
}

export interface WebviewPathOptions {
    platform?: NodeJS.Platform;
    isCompiledExecutable?: boolean;
}

export function resolveWebviewPath(options: WebviewPathOptions = {}): string {
    const platform = options.platform || process.platform;
    const isCompiled = options.isCompiledExecutable ?? isCompiledExecutable();
    
    // Get the executable name based on platform
    const executableName = getWebviewExecutableName(platform);
    
    if (isCompiled) {
        return resolveCompiledExecutablePath(executableName, platform);
    } else {
        return resolveDevelopmentPath(executableName);
    }
}

function getWebviewExecutableName(platform: NodeJS.Platform): string {
    switch (platform) {
        case 'win32':
            // Try static version first, then fallback to regular
            return 'webview_main_win.exe';
        case 'darwin':
        case 'linux':
            return 'webview_main';
        default:
            return 'webview_main';
    }
}

function resolveCompiledExecutablePath(executableName: string, platform: NodeJS.Platform): string {
    const originalCommand = process.argv0;
    let executableDir: string;
    
    if (platform === 'win32' || (originalCommand && originalCommand !== 'bun' && originalCommand.includes('/'))) {
        const execPath = resolve(originalCommand);
        executableDir = getExecutableDirectory(execPath, platform);
    } else {
        executableDir = process.cwd();
    }
    
    let webviewPath: string;
    
    if (platform === 'win32') {
        // On Windows, webview executable is in the same directory as the main executable
        webviewPath = resolve(executableDir, executableName);
    } else {
        // On macOS/Linux, webview executable is in webview/build subdirectory
        webviewPath = resolve(executableDir, 'webview', 'build', executableName);
    }
    
    if (!existsSync(webviewPath)) {
        throw new Error(`Webview executable not found at: ${webviewPath}`);
    }
    
    return webviewPath;
}

function getExecutableDirectory(execPath: string, platform: NodeJS.Platform): string {
    switch (platform) {
        case 'darwin':
            // Check if this is a macOS app bundle structure
            if (execPath.includes('.app/Contents/MacOS/')) {
                const appBundleRoot = execPath.split('.app/Contents/MacOS/')[0] + '.app';
                return resolve(appBundleRoot, 'Contents', 'Resources');
            }
            return dirname(execPath);
            
        case 'win32':
            return dirname(execPath);
            
        case 'linux':
            // For Linux, check for common installation patterns
            if (execPath.includes('/usr/bin') || execPath.includes('/usr/local/bin')) {
                // If installed system-wide, webview might be in /usr/share or similar
                const binDir = dirname(execPath);
                const shareDir = resolve(binDir, '..', 'share', 'tronbun');
                if (existsSync(shareDir)) {
                    return shareDir;
                }
            }
            return dirname(execPath);
            
        default:
            return dirname(execPath);
    }
}

function resolveDevelopmentPath(executableName: string): string {
    const searchPaths = getDevelopmentSearchPaths(executableName);
    
    for (const webviewPath of searchPaths) {
        if (existsSync(webviewPath)) {
            return resolve(webviewPath);
        }
    }
    
    throw new Error(`Webview executable not found. Searched paths:\n${searchPaths.join('\n')}`);
}

function getDevelopmentSearchPaths(executableName: string): string[] {
    const paths: string[] = [];
    
    // 1. Try relative to the executable's location (for development)
    let executablePath: string | null = null;
    
    if (Bun.main && Bun.main !== 'bun' && !Bun.main.includes('$bunfs')) {
        executablePath = Bun.main;
    } else if (import.meta.url.startsWith('file://') && !import.meta.url.includes('$bunfs')) {
        executablePath = fileURLToPath(import.meta.url);
    } else if (process.argv[0] && process.argv[0] !== 'bun') {
        executablePath = resolve(process.argv[0]);
    }
    
    if (executablePath) {
        paths.push(resolve(dirname(executablePath), 'webview', 'build', executableName));
    }
    
    // 2. Current working directory (for command line usage)
    paths.push(join(process.cwd(), 'webview', 'build', executableName));
    
    // 3. Try to resolve the tronbun package and find webview executable relative to it
    try {
        const tronbunPackageDir = dirname(require.resolve('tronbun/package.json'));
        paths.push(resolve(join(tronbunPackageDir, 'webview', 'build', executableName)));
    } catch (error) {
        // Package not found, skip this path
    }
    
    // 4. Relative path from current file (for development)
    const currentDir = dirname(fileURLToPath(import.meta.url));
    paths.push(resolve(join(currentDir, '..', 'webview', 'build', executableName)));
    
    // 5. For Windows, also try the regular version as fallback
    if (process.platform === 'win32' && executableName.includes('_static')) {
        const regularName = executableName.replace('_static', '');
        paths.push(resolve(dirname(executablePath || process.cwd()), 'webview', 'build', regularName));
        paths.push(join(process.cwd(), 'webview', 'build', regularName));
        paths.push(resolve(join(currentDir, '..', 'webview', 'build', regularName)));
    }
    
    return paths;
}
