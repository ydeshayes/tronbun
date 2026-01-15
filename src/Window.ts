import { Webview } from "./Webview";
import type { WebViewOptions } from "./Webview";
import { setupHotReload, isCompiledExecutable } from "./utils";

export interface WindowOptions extends WebViewOptions {}

export type IPCHandler = (data: any) => any | Promise<any>;

export class Window {
    public readonly id: string;
    private webview: Webview;
    private ipcHandlers = new Map<string, IPCHandler>();
    private hotReloadCleanup: (() => void) | null = null;
    private currentUrl: string | null = null;
    
    constructor(options: WindowOptions = {}) {
        this.id = Date.now().toString() + Math.random().toString(36).substring(2);
        this.webview = new Webview(options);

        this.webview.onIPC = this.onIPC.bind(this);
    }

    private async onIPC(channel: string, data: any) {
        if (process.env.TRONBUN_DEBUG) {
            console.log('onIPC', channel, data); // Don't log the entire handler map
        }
        const handler = this.ipcHandlers.get(channel);
        if (handler) {
            return await handler(data);
        }
    }

    public registerIPCHandler(name: string, handler: IPCHandler) {
        this.ipcHandlers.set(name, handler);
    }

    public unregisterIPCHandler(name: string) {
        this.ipcHandlers.delete(name);
    }

    async setTitle(title: string): Promise<void> {
        await this.webview.setTitle(title);
    }

    async setSize(width: number, height: number): Promise<void> {
        await this.webview.setSize(width, height);
    }

    async setHtml(html: string): Promise<void> {
        await this.webview.setHtml(html);
        this.currentUrl = null;
        this.stopHotReload();
    }

    async navigate(url: string): Promise<void> {
        // Auto-detect: if compiled and URL is file:// or embedded path, use custom tronbun:// protocol
        if (isCompiledExecutable() && (url.startsWith('file://') || url.startsWith('/__embedded__/'))) {
            // Check for compressed embedded files (new format)
            const compressedFiles = (globalThis as any).__TRONBUN_EMBEDDED_FILES_COMPRESSED__ as Record<string, string> | undefined;

            if (compressedFiles) {
                try {
                    // Decompress and register all embedded files with the virtual file system
                    const fileCount = Object.keys(compressedFiles).length;
                    if (process.env.TRONBUN_DEBUG) {
                        console.log('📦 Decompressing and registering', fileCount, 'files in virtual file system');
                    }

                    for (const [path, base64Content] of Object.entries(compressedFiles)) {
                        // Decode base64 and decompress gzip
                        const compressed = Buffer.from(base64Content, 'base64');
                        const decompressed = Bun.gunzipSync(compressed);
                        // Use TextDecoder to properly convert Uint8Array to string
                        const content = new TextDecoder('utf-8').decode(decompressed);

                        await this.webview.registerVirtualFile(path, content);
                    }

                    // Navigate to the custom protocol
                    if (process.env.TRONBUN_DEBUG) {
                        console.log('📦 Navigating to tronbun://app/');
                    }
                    await this.webview.navigate('tronbun://app/');
                    this.currentUrl = url;
                    this.stopHotReload();
                    return;
                } catch (error) {
                    console.error('Failed to decompress/register virtual files:', error);
                    // Fall through to regular navigation
                }
            } else if (process.env.TRONBUN_DEBUG) {
                console.log('📁 No embedded assets found, using file:// URL');
            }
        }

        await this.webview.navigate(url);
        this.currentUrl = url;

        // Set up hot reload for file:// URLs in development mode
        if (url.startsWith('file://') && process.env.TRONBUN_DEV_MODE) {
            this.setupHotReloadForUrl();
        } else {
            this.stopHotReload();
        }
    }
    
    async executeScript(script: string): Promise<any> {
        return await this.webview.eval(script);
    }

    async close(): Promise<void> {
        this.stopHotReload();
        this.ipcHandlers.clear();
        await this.webview.close();
    }

    private setupHotReloadForUrl(): void {
        this.stopHotReload();
    
        
        this.hotReloadCleanup = setupHotReload(async () => {
            // Force a complete reload using JavaScript
            const targetUrl = this.currentUrl;
            if (targetUrl) {
                console.log("🔄 Reloading webview...");
                
                try {
                    // First, try to use JavaScript to force a hard reload
                    await this.webview.eval('window.location.reload(true);');
                    console.log("🔄 JavaScript reload executed");
                    
                    // Wait a bit for the reload to happen
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error("🔄 JavaScript reload failed, falling back to navigation:", error);
                }
            }
        });
    }

    private stopHotReload(): void {
        if (this.hotReloadCleanup) {
            this.hotReloadCleanup();
            this.hotReloadCleanup = null;
        }
    }

    protected init(jsScript: string): void {
        this.webview.init(jsScript);
    }

    async setOpacity(opacity: number) {
        return this.webview.setOpacity(opacity);
    }

    async setResizable(resizable: boolean) {
        return this.webview.setResizable(resizable);
    }

    async setPosition(x: number, y: number) {
        return this.webview.setPosition(x, y);
    }

    async setAlwaysOnTop(alwaysOnTop: boolean) {
        return this.webview.setAlwaysOnTop(alwaysOnTop);
    }

    async setTransparent() {
        return this.webview.setTransparent();
    }

    async setOpaque() {
        return this.webview.setOpaque();
    }

    async enableBlur() {
        return this.webview.enableBlur();
    }

    async removeDecorations() {
        return this.webview.removeDecorations();
    }

    async centerWindow() {
        return this.webview.centerWindow();
    }

    async minimizeWindow() {
        return this.webview.minimizeWindow();
    }

    async maximizeWindow() {
        return this.webview.maximizeWindow();
    }

    async restoreWindow() {
        return this.webview.restoreWindow();
    }

    async addDecorations() {
        return this.webview.addDecorations();
    }

    async hideWindow() {
        return this.webview.hideWindow();
    }

    async showWindow() {
        return this.webview.showWindow();
    }
    
}