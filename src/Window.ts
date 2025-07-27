import { Webview } from "./Webview";
import type { WebViewOptions } from "./Webview";
import { setupHotReload } from "./utils";

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
        console.log('onIPC', this.ipcHandlers, channel, data);
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
        await this.webview.navigate(url);
        this.currentUrl = url;
        
        // Set up hot reload for file:// URLs in development mode
        if (url.startsWith('file://') && process.env.TRONBUN_DEV_MODE) {
            this.setupHotReloadForUrl(url);
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

    private setupHotReloadForUrl(url: string): void {
        this.stopHotReload();
        
        const filePath = url.replace('file://', '');
        
        this.hotReloadCleanup = setupHotReload(filePath, async () => {
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
}