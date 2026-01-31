import { resolveWebviewPath } from "./utils.js";
import { BaseProcess, type BaseResponse } from "./BaseProcess.js";

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
}  
export interface WebViewResponse extends BaseResponse {
    type: 'response' | 'bind_callback' | 'ipc:call' | 'window_resize' | 'menu_click' | string;
    req?: any;
    seq?: string;
    viewId?: string;  // For routing IPC to child views
    data?: any;  // For event types (window_resize, menu_click, etc.)
}

export class Webview extends BaseProcess {
    private bindCallbacks = new Map<string, (data: any) => void>();
    private pendingEvals = new Map<string, {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
    }>();

    public onIPC = (channel: string, data: any, viewId?: string) => {
        console.log('onIPC', channel, data, 'viewId:', viewId);
    };

    /** Callback for native events (window_resize, menu_click, etc.) */
    public onEvent: ((type: string, data: any) => void) | null = null;

    protected getProcessName(): string {
        return "WebView";
    }

    protected async handleSpecificResponse(response: WebViewResponse): Promise<void> {
        // Handle native events (window_resize, menu_click, etc.)
        if (response.type && response.type !== 'response' && response.type !== 'ipc:call' && response.data !== undefined) {
            if (this.onEvent) {
                this.onEvent(response.type, response.data);
            }
            return;
        }

        if (response.type === 'ipc:call' && response.req) {
            if (process.env.TRONBUN_DEBUG) {
                console.log('ipc:call', response.req, 'viewId:', response.viewId);
            }

            const payload = JSON.parse(response.req[1]);

            // Handle eval results specially
            if (payload.channel === '__eval_result__') {
                const { id, result, error } = payload.data;
                const pending = this.pendingEvals.get(id);
                if (pending) {
                    this.pendingEvals.delete(id);
                    if (error) {
                        pending.reject(new Error(error));
                    } else {
                        pending.resolve(result);
                    }
                }
                return;
            }

            // Extract viewId from payload if present (child views include it)
            const viewId = payload.viewId || response.viewId;
            const result = await this.onIPC(payload.channel, payload.data, viewId);
            // Use sendCommandNoWait since ipc:response doesn't expect a reply
            this.sendCommandNoWait('ipc:response', { id: response.seq, result: result ?? "", viewId }, response.seq);
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
    }
    // Override cleanup to also clear bind callbacks and pending evals
    override cleanup(): void {
        // Clear callbacks before calling parent cleanup
        this.bindCallbacks.clear();
        // Reject any pending evals
        for (const [id, pending] of this.pendingEvals) {
            pending.reject(new Error('Webview cleanup: eval cancelled'));
        }
        this.pendingEvals.clear();
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

  async eval(js: string, timeout: number = 30000): Promise<any> {
    // Generate unique ID for this eval
    const evalId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create a promise that will be resolved when the result comes back via IPC
    return new Promise<any>((resolve, reject) => {
      // Set up timeout to prevent memory leaks
      const timeoutId = setTimeout(() => {
        if (this.pendingEvals.has(evalId)) {
          this.pendingEvals.delete(evalId);
          reject(new Error(`Eval timed out after ${timeout}ms`));
        }
      }, timeout);

      // Store the resolve/reject callbacks
      this.pendingEvals.set(evalId, {
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      // Send the eval command with our custom ID (no wait)
      // The native code wraps the JS to send results via __bunwebview_invoke callback
      // rather than via the normal response mechanism
      this.sendCommandNoWait('eval', { js }, evalId);
    });
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

  // === Virtual File System Methods (for tronbun:// protocol) ===

  /**
   * Register a file in the virtual file system.
   * The file will be accessible via tronbun://path
   * @param path The virtual path (e.g., "index.html" or "js/app.js")
   * @param content The file content
   */
  async registerVirtualFile(path: string, content: string): Promise<void> {
    await this.sendCommand('virtual_fs_register', { path, content });
  }

  /**
   * Clear all files from the virtual file system.
   */
  async clearVirtualFiles(): Promise<void> {
    await this.sendCommand('virtual_fs_clear');
  }
}