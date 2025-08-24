import { resolveWebviewPath } from "./utils.js";
import { BaseProcess, type BaseResponse } from "./BaseProcess.js";

export interface ContextMenuItem {
    id: string;
    label?: string;
    type?: 'normal' | 'separator';
    enabled?: boolean;
    callback?: () => void;
}

export interface WebViewOptions {
    debug?: boolean;
    width?: number;
    height?: number;
    title?: string;
    html?: string;
    url?: string;
    initScript?: string;
    alwaysOnTop?: boolean;
    transparent?: boolean;
    opaque?: boolean;
    blur?: boolean;
    decorations?: boolean;
    resizable?: boolean;
    position?: { x: number; y: number };
    center?: boolean;
    hidden?: boolean;
    contextMenu?: ContextMenuItem[];
}  
export interface WebViewResponse extends BaseResponse {
    type: 'response' | 'bind_callback' | 'ipc:call' | 'context_menu_click';
    req?: any;
    seq?: string;
}

export class Webview extends BaseProcess {
    private bindCallbacks = new Map<string, (data: any) => void>();
    private contextMenuCallbacks = new Map<string, () => void>();

    public onIPC = (channel: string, data: any) => {
        console.log('onIPC', channel, data);
    };

    public onContextMenuClick = (itemId: string) => {
        const callback = this.contextMenuCallbacks.get(itemId);
        if (callback) {
            callback();
        }
    };

    protected getProcessName(): string {
        return "WebView";
    }

    protected async handleSpecificResponse(response: WebViewResponse): Promise<void> {
        if (response.type === 'ipc:call' && response.req) {
            if (process.env.TRONBUN_DEBUG) {
                console.log('ipc:call', response.req);
            }

            const payload = JSON.parse(response.req[1]);
            
            // Handle context menu clicks sent via IPC
            if (payload.channel === 'context_menu_click' && payload.data && payload.data.id) {
                if (process.env.TRONBUN_DEBUG) {
                    console.log('context_menu_click via IPC', payload.data.id);
                }
                this.onContextMenuClick(payload.data.id);
                this.sendCommand('ipc:response', { id: response.seq, result: "ok" }, response.seq);
                return;
            }
            
            const result = await this.onIPC(payload.channel, payload.data);
            this.sendCommand('ipc:response', { id: response.seq, result: result ?? "" }, response.seq);
        } else if (response.type === 'context_menu_click' && response.id) {
            if (process.env.TRONBUN_DEBUG) {
                console.log('context_menu_click', response.id);
            }
            this.onContextMenuClick(response.id);
        }
    }

    constructor(options: WebViewOptions = {}) {
        // Resolve the webview executable path using cross-platform utility
        const webviewPath = resolveWebviewPath();
        super(webviewPath);

         // Apply initial options
        if (options.title) this.setTitle(options.title);
        if (options.width && options.height) this.setSize(options.width, options.height);
        if (options.html) this.setHtml(options.html);
        
        if (options.initScript) this.init(options.initScript);
        else if (options.url) this.navigate(options.url);

        if (options.alwaysOnTop) this.setAlwaysOnTop(options.alwaysOnTop);
        if (options.transparent) this.setTransparent();
        if (options.opaque) this.setOpaque();
        if (options.blur) this.enableBlur();
        if (options.decorations === false) this.removeDecorations();
        if (options.resizable) this.setResizable(options.resizable);
        if (options.position) this.setPosition(options.position.x, options.position.y);
        if (options.center) this.centerWindow();
        if (options.hidden) this.hideWindow();
        if (options.contextMenu) this.setContextMenu(options.contextMenu);
    }
    // Override cleanup to also clear bind callbacks
    override cleanup(): void {
        // Clear callbacks before calling parent cleanup
        this.bindCallbacks.clear();
        super.cleanup();
    }

  // === WebView API Methods ===

  async setTitle(title: string): Promise<void> {
    await this.sendCommand('set_title', { title });
  }

  async setSize(width: number, height: number, hints: number = 0): Promise<void> {
    await this.sendCommand('set_size', { width, height, hints });
  }

  async navigate(url: string): Promise<void> {
    await this.sendCommand('navigate', { url });
  }

  async setHtml(html: string): Promise<void> {
    await this.sendCommand('set_html', { html });
  }

  async eval(js: string): Promise<any> {
    return await this.sendCommand('eval', { js });
  }

  async init(js: string): Promise<void> {
    await this.sendCommand('init', { js });
  }

  async bind(name: string, callback?: (data: any) => void): Promise<void> {
    if (callback) {
      this.bindCallbacks.set(name, callback);
    }
    await this.sendCommand('bind', { name });
  }

  async unbind(name: string): Promise<void> {
    this.bindCallbacks.delete(name);
    await this.sendCommand('unbind', { name });
  }

  async terminate(): Promise<void> {
    await this.sendCommand('terminate');
  }

  async getWindow(): Promise<string> {
    return await this.sendCommand('get_window');
  }

  async getVersion(): Promise<any> {
    const result = await this.sendCommand('get_version');
    return typeof result === 'string' ? JSON.parse(result) : result;
  }

  async isready(): Promise<boolean> {
    const result = await this.sendCommand('isready');
    return result;
  }

  // === Platform Window Control Methods ===

  /**
   * Set window transparency
   */
  async setTransparent() {
    return this.sendCommand('window_set_transparent');
  }

  /**
   * Set window to be fully opaque (removes transparency)
   */
  async setOpaque() {
    return this.sendCommand('window_set_opaque');
  }

  /**
   * Enable blur/backdrop effects behind the window
   */
  async enableBlur() {
    return this.sendCommand('window_enable_blur');
  }

  /**
   * Remove window decorations (title bar, borders)
   */
  async removeDecorations() {
    return this.sendCommand('window_remove_decorations');
  }

  /**
   * Set window to always stay on top
   * @param onTop true to enable always on top, false to disable
   */
  async setAlwaysOnTop(onTop: boolean = true) {
    return this.sendCommand('window_set_always_on_top', { on_top: onTop ? 1 : 0 });
  }

  /**
   * Set window opacity level
   * @param opacity Opacity value from 0.0 (transparent) to 1.0 (opaque)
   */
  async setOpacity(opacity: number) {
    return this.sendCommand('window_set_opacity', { opacity: opacity.toString() });
  }

  /**
   * Set window to be resizable or fixed size
   * @param resizable true to enable resizing, false to disable
   */
  async setResizable(resizable: boolean = true) {
    return this.sendCommand('window_set_resizable', { resizable: resizable ? 1 : 0 });
  }

  /**
   * Set window position
   * @param x X coordinate
   * @param y Y coordinate
   */
  async setPosition(x: number, y: number) {
    return this.sendCommand('window_set_position', { x, y });
  }

  /**
   * Center window on screen
   */
  async centerWindow() {
    return this.sendCommand('window_center');
  }

  /**
   * Minimize window
   */
  async minimizeWindow() {
    return this.sendCommand('window_minimize');
  }

  /**
   * Maximize window
   */
  async maximizeWindow() {
    return this.sendCommand('window_maximize');
  }

  /**
   * Restore window from minimized/maximized state
   */
  async restoreWindow() {
    return this.sendCommand('window_restore');
  }

  async addDecorations() {
    return this.sendCommand('window_add_decorations');
  }

  /**
   * Hide window
   */
  async hideWindow() {
    return this.sendCommand('window_hide');
  }

  /**
   * Show window
   */
  async showWindow() {
    return this.sendCommand('window_show');
  }

  // === Context Menu Methods ===

  /**
   * Set custom context menu items
   * @param items Array of context menu items
   */
  async setContextMenu(items: ContextMenuItem[]): Promise<void> {
    // Clear existing callbacks
    this.contextMenuCallbacks.clear();
    
    // Register callbacks for menu items
    for (const item of items) {
      if (item.type !== 'separator' && item.callback) {
        this.contextMenuCallbacks.set(item.id, item.callback);
      }
    }
    
    // Send menu configuration to native layer
    return this.sendCommand('window_set_context_menu', { menu: items });
  }

  /**
   * Clear/disable custom context menu
   */
  async clearContextMenu(): Promise<void> {
    this.contextMenuCallbacks.clear();
    return this.sendCommand('window_clear_context_menu');
  }

  /**
   * Register a callback for a specific context menu item
   * @param itemId The ID of the menu item
   * @param callback The callback function to execute when the item is clicked
   */
  registerContextMenuCallback(itemId: string, callback: () => void): void {
    this.contextMenuCallbacks.set(itemId, callback);
  }

  /**
   * Unregister a callback for a specific context menu item
   * @param itemId The ID of the menu item
   */
  unregisterContextMenuCallback(itemId: string): void {
    this.contextMenuCallbacks.delete(itemId);
  }
}