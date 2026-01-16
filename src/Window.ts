import { Webview } from "./Webview";
import type { WebViewOptions } from "./Webview";
import { setupHotReload, isCompiledExecutable } from "./utils";
import { ChildView, type ChildViewOptions, type ChildViewBounds } from "./ChildView";

export interface WindowOptions extends WebViewOptions {}

export type IPCHandler = (data: any) => any | Promise<any>;

export { ChildView, type ChildViewOptions, type ChildViewBounds };

export class Window {
    public readonly id: string;
    private webview: Webview;
    private ipcHandlers = new Map<string, IPCHandler>();
    private childViews = new Map<string, ChildView>();
    private hotReloadCleanup: (() => void) | null = null;
    private currentUrl: string | null = null;
    
    constructor(options: WindowOptions = {}) {
        this.id = Date.now().toString() + Math.random().toString(36).substring(2);
        this.webview = new Webview(options);

        this.webview.onIPC = this.onIPC.bind(this);
    }

    private async onIPC(channel: string, data: any, viewId?: string) {
        if (process.env.TRONBUN_DEBUG) {
            console.log('onIPC', channel, data, 'viewId:', viewId);
        }

        // Route to child view if viewId is specified and not 'main'
        if (viewId && viewId !== 'main') {
            const childView = this.childViews.get(viewId);
            if (childView) {
                return await childView.handleIPC(channel, data);
            }
            console.warn(`Unknown child viewId: ${viewId}`);
            return undefined;
        }

        // Handle in main window
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
        // Destroy all child views first
        for (const childView of this.childViews.values()) {
            try {
                childView.clearIPCHandlers();
                await this.webview.sendCommand('destroy_child_view', { viewId: childView.id });
            } catch (e) {
                // Ignore errors during cleanup
            }
        }
        this.childViews.clear();

        this.stopHotReload();
        this.ipcHandlers.clear();
        await this.webview.close();
    }

    // =========================================================================
    // Child View Management
    // =========================================================================

    /**
     * Create an embedded child view within this window
     * @param options Child view options including bounds and optional initial content
     * @returns The created ChildView instance
     */
    async createChildView(options: ChildViewOptions): Promise<ChildView> {
        // Generate ID if not provided
        const id = options.id || `child_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Create the native child view
        await this.webview.sendCommand('create_child_view', {
            id,
            x: options.bounds.x,
            y: options.bounds.y,
            width: options.bounds.width,
            height: options.bounds.height
        });

        // Create TypeScript wrapper
        const childView = new ChildView(this.webview, id, options.bounds);
        this.childViews.set(id, childView);

        // Initialize with content if provided
        if (options.html) {
            await childView.setHtml(options.html);
        } else if (options.url) {
            await childView.navigate(options.url);
        }

        // Set visibility if specified
        if (options.visible === false) {
            await childView.setVisible(false);
        }

        return childView;
    }

    /**
     * Destroy a child view
     * @param childViewOrId The ChildView instance or its ID
     */
    async destroyChildView(childViewOrId: ChildView | string): Promise<void> {
        const id = typeof childViewOrId === 'string' ? childViewOrId : childViewOrId.id;
        const childView = this.childViews.get(id);

        if (childView) {
            childView.clearIPCHandlers();
            await this.webview.sendCommand('destroy_child_view', { viewId: id });
            this.childViews.delete(id);
        }
    }

    /**
     * Get a child view by ID
     * @param id The child view ID
     */
    getChildView(id: string): ChildView | undefined {
        return this.childViews.get(id);
    }

    /**
     * Get all child views
     */
    getChildViews(): ChildView[] {
        return Array.from(this.childViews.values());
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