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
 * Auto-resize mode for child views
 * - "none": No auto-resize (default)
 * - "fill": Fill the entire window (or specified margins)
 * - "proportional": Maintain proportional position and size relative to window
 * - "anchor": Keep specified edges anchored to window edges
 */
export type AutoResizeMode = "none" | "fill" | "proportional" | "anchor";

/**
 * Configuration for anchor-based auto-resize
 * Specify which edges should stay anchored to the window edge
 */
export interface AnchorConfig {
    /** Anchor to left edge - distance from left stays constant */
    left?: boolean;
    /** Anchor to right edge - distance from right stays constant */
    right?: boolean;
    /** Anchor to top edge - distance from top stays constant */
    top?: boolean;
    /** Anchor to bottom edge - distance from bottom stays constant */
    bottom?: boolean;
}

/**
 * Auto-resize configuration
 */
export interface AutoResizeConfig {
    /** Resize mode */
    mode: AutoResizeMode;
    /** Margins for "fill" mode (optional) */
    margins?: {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
    };
    /** Anchor configuration for "anchor" mode */
    anchors?: AnchorConfig;
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
    /** Auto-resize configuration (optional) */
    autoResize?: AutoResizeConfig | AutoResizeMode;
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

    /** Auto-resize configuration */
    private autoResizeConfig: AutoResizeConfig | null = null;

    /** Initial window size when child view was created (for proportional resize) */
    private initialWindowSize: { width: number; height: number } | null = null;

    /** Initial bounds (for proportional resize) */
    private initialBounds: ChildViewBounds;

    /**
     * Create a new ChildView. Should be called via Window.createChildView()
     * @internal
     */
    constructor(parentWebview: Webview, id: string, bounds: ChildViewBounds) {
        this.id = id;
        this.parentWebview = parentWebview;
        this.bounds = { ...bounds };
        this.initialBounds = { ...bounds };
    }

    /**
     * Set auto-resize configuration
     * @internal Called by Window
     */
    setAutoResize(config: AutoResizeConfig | null, windowSize: { width: number; height: number }): void {
        this.autoResizeConfig = config;
        this.initialWindowSize = windowSize;
        this.initialBounds = { ...this.bounds };
    }

    /**
     * Get auto-resize configuration
     * @internal
     */
    getAutoResizeConfig(): AutoResizeConfig | null {
        return this.autoResizeConfig;
    }

    /**
     * Calculate new bounds based on window resize
     * @internal Called by Window on resize events
     */
    calculateResizedBounds(newWindowWidth: number, newWindowHeight: number): ChildViewBounds | null {
        if (!this.autoResizeConfig || this.autoResizeConfig.mode === "none") {
            return null;
        }

        const config = this.autoResizeConfig;

        switch (config.mode) {
            case "fill": {
                const margins = config.margins || {};
                const top = margins.top ?? 0;
                const right = margins.right ?? 0;
                const bottom = margins.bottom ?? 0;
                const left = margins.left ?? 0;

                return {
                    x: left,
                    y: top,
                    width: Math.max(0, newWindowWidth - left - right),
                    height: Math.max(0, newWindowHeight - top - bottom)
                };
            }

            case "proportional": {
                if (!this.initialWindowSize) {
                    return null;
                }

                const scaleX = newWindowWidth / this.initialWindowSize.width;
                const scaleY = newWindowHeight / this.initialWindowSize.height;

                return {
                    x: Math.round(this.initialBounds.x * scaleX),
                    y: Math.round(this.initialBounds.y * scaleY),
                    width: Math.round(this.initialBounds.width * scaleX),
                    height: Math.round(this.initialBounds.height * scaleY)
                };
            }

            case "anchor": {
                if (!this.initialWindowSize || !config.anchors) {
                    return null;
                }

                const anchors = config.anchors;
                const initial = this.initialBounds;
                const oldWidth = this.initialWindowSize.width;
                const oldHeight = this.initialWindowSize.height;

                let x = initial.x;
                let y = initial.y;
                let width = initial.width;
                let height = initial.height;

                // Calculate horizontal positioning
                if (anchors.left && anchors.right) {
                    // Both anchored: stretch width
                    const rightMargin = oldWidth - initial.x - initial.width;
                    width = newWindowWidth - initial.x - rightMargin;
                } else if (anchors.right) {
                    // Only right anchored: keep distance from right
                    const rightMargin = oldWidth - initial.x - initial.width;
                    x = newWindowWidth - width - rightMargin;
                }
                // If only left or none anchored, keep x position

                // Calculate vertical positioning
                if (anchors.top && anchors.bottom) {
                    // Both anchored: stretch height
                    const bottomMargin = oldHeight - initial.y - initial.height;
                    height = newWindowHeight - initial.y - bottomMargin;
                } else if (anchors.bottom) {
                    // Only bottom anchored: keep distance from bottom
                    const bottomMargin = oldHeight - initial.y - initial.height;
                    y = newWindowHeight - height - bottomMargin;
                }
                // If only top or none anchored, keep y position

                return {
                    x: Math.max(0, x),
                    y: Math.max(0, y),
                    width: Math.max(0, width),
                    height: Math.max(0, height)
                };
            }

            default:
                return null;
        }
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
