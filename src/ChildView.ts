import type { IPCHandler } from "./Window";
import type { Webview } from "./Webview";

/**
 * Bounds for positioning a child view within its parent window
 */
export interface ChildViewBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Options for creating a child view
 */
export interface ChildViewOptions {
    /** Unique ID for this child view (auto-generated if not provided) */
    id?: string;
    /** Position and size within parent window */
    bounds: ChildViewBounds;
    /** URL to navigate to after creation */
    url?: string;
    /** HTML content to set after creation */
    html?: string;
    /** Initial visibility (default: true) */
    visible?: boolean;
}

/**
 * ChildView represents an embedded webview within a parent Window.
 * Similar to Electron's BrowserView, it allows multiple web contents
 * to be displayed within a single native window.
 */
export class ChildView {
    /** Unique identifier for this child view */
    public readonly id: string;

    /** Reference to parent's webview for IPC communication */
    private parentWebview: Webview;

    /** Registered IPC handlers for this child view */
    private ipcHandlers = new Map<string, IPCHandler>();

    /** Current bounds */
    private bounds: ChildViewBounds;

    /** Current visibility state */
    private visible: boolean = true;

    /**
     * Create a new ChildView. Should be called via Window.createChildView()
     * @internal
     */
    constructor(parentWebview: Webview, id: string, bounds: ChildViewBounds) {
        this.id = id;
        this.parentWebview = parentWebview;
        this.bounds = { ...bounds };
    }

    // =========================================================================
    // Content Methods
    // =========================================================================

    /**
     * Navigate the child view to a URL
     */
    async navigate(url: string): Promise<void> {
        await this.parentWebview.sendCommand('child_navigate', {
            viewId: this.id,
            url
        });
    }

    /**
     * Set HTML content in the child view
     */
    async setHtml(html: string): Promise<void> {
        await this.parentWebview.sendCommand('child_set_html', {
            viewId: this.id,
            html
        });
    }

    /**
     * Execute JavaScript in the child view
     */
    async eval(js: string): Promise<any> {
        return await this.parentWebview.sendCommand('child_eval', {
            viewId: this.id,
            js
        });
    }

    /**
     * Add an initialization script that runs on every page load
     */
    async init(js: string): Promise<void> {
        await this.parentWebview.sendCommand('child_init', {
            viewId: this.id,
            js
        });
    }

    // =========================================================================
    // Positioning Methods
    // =========================================================================

    /**
     * Update the child view's position and size
     */
    async setBounds(bounds: ChildViewBounds): Promise<void> {
        this.bounds = { ...bounds };
        await this.parentWebview.sendCommand('set_child_bounds', {
            viewId: this.id,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
        });
    }

    /**
     * Get the current bounds
     */
    getBounds(): ChildViewBounds {
        return { ...this.bounds };
    }

    // =========================================================================
    // Visibility & Z-Order Methods
    // =========================================================================

    /**
     * Set child view visibility
     */
    async setVisible(visible: boolean): Promise<void> {
        this.visible = visible;
        await this.parentWebview.sendCommand('set_child_visible', {
            viewId: this.id,
            visible: visible ? 1 : 0
        });
    }

    /**
     * Check if the child view is visible
     */
    isVisible(): boolean {
        return this.visible;
    }

    /**
     * Bring this child view to the front (top of z-order)
     */
    async bringToFront(): Promise<void> {
        await this.parentWebview.sendCommand('bring_child_to_front', {
            viewId: this.id
        });
    }

    /**
     * Send this child view to the back (bottom of z-order)
     */
    async sendToBack(): Promise<void> {
        await this.parentWebview.sendCommand('send_child_to_back', {
            viewId: this.id
        });
    }

    // =========================================================================
    // IPC Methods
    // =========================================================================

    /**
     * Register an IPC handler for this child view
     * @param name The channel name
     * @param handler The handler function
     */
    registerIPCHandler(name: string, handler: IPCHandler): void {
        this.ipcHandlers.set(name, handler);
    }

    /**
     * Unregister an IPC handler
     * @param name The channel name
     */
    unregisterIPCHandler(name: string): void {
        this.ipcHandlers.delete(name);
    }

    /**
     * Handle an IPC call from this child view's frontend
     * @internal Called by parent Window
     */
    async handleIPC(channel: string, data: any): Promise<any> {
        const handler = this.ipcHandlers.get(channel);
        if (handler) {
            return await handler(data);
        }
        return undefined;
    }

    /**
     * Clear all IPC handlers
     * @internal Called during cleanup
     */
    clearIPCHandlers(): void {
        this.ipcHandlers.clear();
    }
}
