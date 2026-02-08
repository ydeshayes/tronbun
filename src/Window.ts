import { Webview } from "./Webview";
import type { WebViewOptions } from "./Webview";
import { setupHotReload, isCompiledExecutable, getConfig, resolveIconPath } from "./utils";
import { ChildView, type ChildViewOptions, type ChildViewBounds, type AutoResizeConfig, type AutoResizeMode, type AnchorConfig } from "./ChildView";
import { Protocol } from "./Protocol";
import { resolve } from "path";

export interface WindowOptions extends WebViewOptions {}

/**
 * Merges tronbun.config.json window defaults with explicit constructor options.
 * Explicit options always take precedence over config defaults.
 */
function applyWindowConfigDefaults(options: WindowOptions): WindowOptions {
    try {
        const config = getConfig();
        const windowConfig = config.window;

        const defaults: WindowOptions = {};

        // Auto-resolve app icon if not explicitly set
        if (!options.icon) {
            const iconPath = resolveIconPath();
            if (iconPath) defaults.icon = iconPath;
        }

        if (!windowConfig) return { ...defaults, ...options };

        if (windowConfig.title !== undefined) defaults.title = windowConfig.title;
        if (windowConfig.width !== undefined) defaults.width = windowConfig.width;
        if (windowConfig.height !== undefined) defaults.height = windowConfig.height;
        if (windowConfig.resizable !== undefined) defaults.resizable = windowConfig.resizable;
        if (windowConfig.center !== undefined) defaults.center = windowConfig.center;
        if (windowConfig.alwaysOnTop !== undefined) defaults.alwaysOnTop = windowConfig.alwaysOnTop;
        if (windowConfig.frameless !== undefined) defaults.decorations = !windowConfig.frameless;
        if (windowConfig.opacity !== undefined) {
            // opacity < 1.0 means transparent
            if (windowConfig.opacity < 1.0) defaults.transparent = true;
        }

        return { ...defaults, ...options };
    } catch {
        return options;
    }
}

export type IPCHandler = (data: any) => any | Promise<any>;

export { ChildView, type ChildViewOptions, type ChildViewBounds, type AutoResizeConfig, type AutoResizeMode, type AnchorConfig };

/**
 * Information about a DOM element returned by automation queries
 */
export interface ElementInfo {
    /** Element tag name (lowercase) */
    tagName: string;
    /** Element id attribute */
    id: string;
    /** Element class attribute */
    className: string;
    /** Inner text content */
    textContent: string;
    /** Inner HTML content */
    innerHTML: string;
    /** Element's bounding rectangle */
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    /** Element attributes as key-value pairs */
    attributes: Record<string, string>;
    /** Whether the element is visible */
    isVisible: boolean;
    /** For inputs: the current value */
    value?: string;
    /** For links: the href */
    href?: string;
}

/**
 * Automation API for programmatic browser control
 * Useful for AI agents to navigate and interact with web content
 */
export interface WindowAutomation {
    // Navigation
    goBack(): Promise<void>;
    goForward(): Promise<void>;
    reload(): Promise<void>;
    getUrl(): Promise<string>;
    getTitle(): Promise<string>;

    // Content extraction
    getHtml(): Promise<string>;
    getText(): Promise<string>;
    screenshot(): Promise<string>;

    // DOM interaction
    querySelector(selector: string): Promise<ElementInfo | null>;
    querySelectorAll(selector: string): Promise<ElementInfo[]>;
    click(selector: string): Promise<void>;
    type(selector: string, text: string): Promise<void>;
    getValue(selector: string): Promise<string>;
    scrollTo(x: number, y: number): Promise<void>;
    scrollIntoView(selector: string): Promise<void>;

    // Waiting
    waitForSelector(selector: string, timeout?: number): Promise<boolean>;

    // File upload (real files from disk)
    setInputFiles(selector: string, filePaths: string[]): Promise<void>;

    // File download/save
    /** Download a file from a URL and save it to a local path */
    downloadFile(url: string, savePath: string): Promise<void>;
    /** Save an image element (img tag) to a local file */
    saveImage(selector: string, savePath: string): Promise<void>;
    /** Get the src URL of an image element */
    getImageSrc(selector: string): Promise<string | null>;
}

// ============================================================================
// Dialog API Types
// ============================================================================

/** Message box type (affects the icon displayed) */
export type MessageBoxType = "info" | "warning" | "error" | "question";

/** Message box button configuration */
export type MessageBoxButtons = "ok" | "okCancel" | "yesNo" | "yesNoCancel";

/** Message box result */
export type MessageBoxResult = "ok" | "cancel" | "yes" | "no";

/** File filter for open/save dialogs */
export interface FileFilter {
    /** Display name for the filter (e.g., "Images") */
    name: string;
    /** File extensions without dots (e.g., ["png", "jpg", "gif"]) */
    extensions: string[];
}

/** Options for file open dialog */
export interface OpenFileOptions {
    /** Dialog title */
    title?: string;
    /** File filters */
    filters?: FileFilter[];
    /** Allow selecting multiple files */
    multiple?: boolean;
}

/** Options for file save dialog */
export interface SaveFileOptions {
    /** Dialog title */
    title?: string;
    /** Default file name */
    defaultName?: string;
    /** File filters */
    filters?: FileFilter[];
}

/** Options for folder picker dialog */
export interface OpenFolderOptions {
    /** Dialog title */
    title?: string;
}

/** Options for message box */
export interface MessageBoxOptions {
    /** Dialog title */
    title?: string;
    /** Main message text */
    message: string;
    /** Optional detail text (shown below the main message) */
    detail?: string;
    /** Message type (affects icon) - default: "info" */
    type?: MessageBoxType;
    /** Button configuration - default: "ok" */
    buttons?: MessageBoxButtons;
}

/**
 * Dialog API for showing native dialogs
 */
export interface WindowDialog {
    /**
     * Show a file open dialog
     * @returns Array of selected file paths, or null if cancelled
     */
    openFile(options?: OpenFileOptions): Promise<string[] | null>;

    /**
     * Show a file save dialog
     * @returns Selected file path, or null if cancelled
     */
    saveFile(options?: SaveFileOptions): Promise<string | null>;

    /**
     * Show a folder picker dialog
     * @returns Selected folder path, or null if cancelled
     */
    openFolder(options?: OpenFolderOptions): Promise<string | null>;

    /**
     * Show a message box dialog
     * @returns The button that was clicked
     */
    showMessage(options: MessageBoxOptions): Promise<MessageBoxResult>;

    /**
     * Show an info message box with OK button
     */
    showInfo(message: string, title?: string): Promise<void>;

    /**
     * Show a warning message box with OK button
     */
    showWarning(message: string, title?: string): Promise<void>;

    /**
     * Show an error message box with OK button
     */
    showError(message: string, title?: string): Promise<void>;

    /**
     * Show a confirmation dialog with Yes/No buttons
     * @returns true if Yes was clicked, false if No
     */
    confirm(message: string, title?: string): Promise<boolean>;
}

// ============================================================================
// Menu API Types
// ============================================================================

/** Menu item type */
export type MenuItemType = "normal" | "separator" | "checkbox" | "radio" | "submenu";

/** Standard menu item roles for automatic behavior */
export type MenuItemRole =
    // Application menu (macOS)
    | "about"
    | "services"
    | "hide"
    | "hideOthers"
    | "unhide"
    | "quit"
    // Edit menu
    | "undo"
    | "redo"
    | "cut"
    | "copy"
    | "paste"
    | "pasteAndMatchStyle"
    | "delete"
    | "selectAll"
    // View menu
    | "reload"
    | "forceReload"
    | "toggleDevTools"
    | "zoomIn"
    | "zoomOut"
    | "resetZoom"
    | "toggleFullScreen"
    // Window menu
    | "minimize"
    | "close"
    | "zoom"
    | "front";

/** Menu item definition */
export interface MenuItem {
    /** Unique identifier for callbacks */
    id?: string;
    /** Display label */
    label?: string;
    /** Item type - default: "normal" */
    type?: MenuItemType;
    /** Standard role for automatic behavior */
    role?: MenuItemRole;
    /** Whether item is enabled - default: true */
    enabled?: boolean;
    /** Whether item is checked (for checkbox/radio) */
    checked?: boolean;
    /** Keyboard shortcut (e.g., "CmdOrCtrl+S", "Alt+F4") */
    accelerator?: string;
    /** Submenu items (if type is "submenu") */
    submenu?: MenuItem[];
    /** Click handler (called when item is clicked) */
    click?: () => void;
}

/** Top-level menu definition */
export interface Menu {
    /** Unique identifier */
    id?: string;
    /** Menu label (e.g., "File", "Edit") */
    label: string;
    /** Menu items */
    items: MenuItem[];
}

/**
 * Menu API for application menu bar
 */
export interface WindowMenu {
    /**
     * Set the application menu bar
     * @param menus Array of top-level menus
     */
    setMenu(menus: Menu[]): Promise<void>;

    /**
     * Set the default application menu (File, Edit, View, Window, Help)
     * @param appName Application name for menu labels
     */
    setDefaultMenu(appName?: string): Promise<void>;

    /**
     * Remove the application menu bar
     */
    removeMenu(): Promise<void>;

    /**
     * Update a specific menu item
     * @param itemId The ID of the item to update
     * @param updates Properties to update
     */
    updateItem(itemId: string, updates: Partial<Pick<MenuItem, "label" | "enabled" | "checked">>): Promise<void>;

    /**
     * Enable or disable a menu item
     * @param itemId The ID of the item
     * @param enabled Whether to enable or disable
     */
    setItemEnabled(itemId: string, enabled: boolean): Promise<void>;

    /**
     * Set the checked state of a menu item
     * @param itemId The ID of the item
     * @param checked Whether to check or uncheck
     */
    setItemChecked(itemId: string, checked: boolean): Promise<void>;

    /**
     * Register a click handler for a menu item
     * @param itemId The ID of the item
     * @param handler Function to call when clicked
     */
    onClick(itemId: string, handler: () => void): void;

    /**
     * Remove a click handler for a menu item
     * @param itemId The ID of the item
     */
    offClick(itemId: string): void;
}

// ============================================================================
// Context Menu API Types
// ============================================================================

/** Context menu item type */
export type ContextMenuItemType = "normal" | "separator" | "checkbox" | "radio" | "submenu";

/** Context menu item definition */
export interface ContextMenuItem {
    /** Unique identifier for callbacks */
    id?: string;
    /** Display label */
    label?: string;
    /** Item type - default: "normal" */
    type?: ContextMenuItemType;
    /** Whether item is enabled - default: true */
    enabled?: boolean;
    /** Whether item is checked (for checkbox/radio) */
    checked?: boolean;
    /** Keyboard shortcut hint (display only, e.g., "Ctrl+C") */
    accelerator?: string;
    /** Submenu items (if type is "submenu") */
    submenu?: ContextMenuItem[];
    /** Click handler (called when item is clicked) */
    click?: () => void;
}

/**
 * Context Menu API for native right-click menus in the webview.
 *
 * When set, right-clicking in the webview will show a native OS context menu
 * instead of the default browser context menu.
 */
export interface WindowContext {
    /**
     * Set the right-click context menu for the webview.
     * This replaces the default browser context menu with a native OS menu.
     * @param items Array of context menu items
     */
    setContextMenu(items: ContextMenuItem[]): Promise<void>;

    /**
     * Remove the custom context menu and restore the default browser context menu.
     */
    removeContextMenu(): Promise<void>;

    /**
     * Update a specific context menu item by its ID.
     * @param itemId The ID of the item to update
     * @param updates Properties to update (label, enabled, checked)
     */
    updateItem(itemId: string, updates: Partial<Pick<ContextMenuItem, "label" | "enabled" | "checked">>): Promise<void>;

    /**
     * Enable or disable a context menu item.
     * @param itemId The ID of the item
     * @param enabled Whether to enable or disable
     */
    setItemEnabled(itemId: string, enabled: boolean): Promise<void>;

    /**
     * Set the checked state of a context menu item.
     * @param itemId The ID of the item
     * @param checked Whether to check or uncheck
     */
    setItemChecked(itemId: string, checked: boolean): Promise<void>;

    /**
     * Register a click handler for a context menu item.
     * @param itemId The ID of the item
     * @param handler Function to call when clicked
     */
    onClick(itemId: string, handler: () => void): void;

    /**
     * Remove a click handler for a context menu item.
     * @param itemId The ID of the item
     */
    offClick(itemId: string): void;
}

// ============================================================================
// Notification API Types
// ============================================================================

export type NotificationUrgency = "low" | "normal" | "critical";

export interface NotificationAction {
    text: string;
}

export interface NotificationOptions {
    title: string;
    body?: string;
    icon?: string;
    silent?: boolean;
    urgency?: NotificationUrgency;
    actions?: NotificationAction[];
}

export type NotificationClickHandler = (notificationId: string) => void;
export type NotificationCloseHandler = (notificationId: string) => void;
export type NotificationActionHandler = (notificationId: string, actionIndex: number) => void;

export interface WindowNotification {
    /** Request notification permission from the user. */
    requestPermission(): Promise<'granted' | 'denied' | 'unavailable'>;
    /** Show a notification. Returns the notification ID. */
    show(options: NotificationOptions): Promise<string>;
    /** Close/dismiss a notification by its ID. */
    close(notificationId: string): Promise<void>;
    /**
     * Check the current notification permission status.
     * @returns
     *   `1`  — authorized (notifications will be shown)
     *   `0`  — not determined (user hasn't been asked yet)
     *   `-1` — denied (user explicitly disabled notifications for this app)
     */
    isAvailable(): Promise<number>;
    onClick(handler: NotificationClickHandler): void;
    offClick(): void;
    onClose(handler: NotificationCloseHandler): void;
    offClose(): void;
    onAction(handler: NotificationActionHandler): void;
    offAction(): void;
}

export class Window {
    public readonly id: string;
    private webview: Webview;
    private ipcHandlers = new Map<string, IPCHandler>();
    private childViews = new Map<string, ChildView>();
    private hotReloadCleanup: (() => void) | null = null;
    private currentUrl: string | null = null;

    /**
     * Automation API for programmatic browser control.
     * Useful for AI agents to navigate, read content, and interact with web pages.
     */
    public readonly automation: WindowAutomation;

    /**
     * Protocol API for low-level browser automation via CDP.
     * Provides Puppeteer-like capabilities for cookies, PDF generation,
     * input simulation, network monitoring, and request interception.
     */
    public readonly protocol: Protocol;

    /**
     * Dialog API for showing native dialogs.
     * Provides file open/save dialogs, folder picker, and message boxes.
     */
    public readonly dialog: WindowDialog;

    /**
     * Menu API for application menu bar.
     * Provides native menu bar with File, Edit, View, Window, Help menus.
     */
    public readonly menu: WindowMenu;

    /**
     * Context Menu API for native right-click menus.
     * Replaces the default browser context menu with a native OS context menu.
     */
    public readonly context: WindowContext;

    /**
     * Notification API for native desktop notifications.
     * Show OS notifications with optional action buttons and event handlers.
     */
    public readonly notification: WindowNotification;

    /** Menu click handlers by item ID */
    private menuClickHandlers = new Map<string, () => void>();

    /** Context menu click handlers by item ID */
    private contextMenuClickHandlers = new Map<string, () => void>();

    /** Notification event handlers */
    private notificationClickHandler: NotificationClickHandler | null = null;
    private notificationCloseHandler: NotificationCloseHandler | null = null;
    private notificationActionHandler: NotificationActionHandler | null = null;

    /** Resolved icon path (used for window icon, notifications, etc.) */
    private iconPath: string | null = null;

    constructor(options: WindowOptions = {}) {
        this.id = Date.now().toString() + Math.random().toString(36).substring(2);
        const mergedOptions = applyWindowConfigDefaults(options);
        this.iconPath = mergedOptions.icon || null;
        this.webview = new Webview(mergedOptions);

        this.webview.onIPC = this.onIPC.bind(this);

        // Initialize protocol API first (automation setInputFiles uses it on Windows)
        this.protocol = new Protocol(this.webview);

        // Initialize automation API
        this.automation = this.createAutomationAPI();

        // Initialize dialog API
        this.dialog = this.createDialogAPI();

        // Initialize menu API
        this.menu = this.createMenuAPI();

        // Initialize context menu API
        this.context = this.createContextMenuAPI();

        // Initialize notification API
        this.notification = this.createNotificationAPI();

        // Listen for events from native layer
        this.webview.onEvent = (type: string, data: any) => {
            if (type === "menu_click" && data?.menuId) {
                const handler = this.menuClickHandlers.get(data.menuId);
                if (handler) {
                    handler();
                }
            } else if (type === "context_menu_click" && data?.menuId) {
                const handler = this.contextMenuClickHandlers.get(data.menuId);
                if (handler) {
                    handler();
                }
            } else if (type === "window_resize" && data?.width !== undefined && data?.height !== undefined) {
                this.handleWindowResize(data.width, data.height);
            } else if (type === "notification_click" && data?.id) {
                if (this.notificationClickHandler) {
                    this.notificationClickHandler(data.id);
                }
            } else if (type === "notification_close" && data?.id) {
                if (this.notificationCloseHandler) {
                    this.notificationCloseHandler(data.id);
                }
            } else if (type === "notification_action" && data?.id) {
                if (this.notificationActionHandler) {
                    this.notificationActionHandler(data.id, data.actionIndex ?? 0);
                }
            }
        };
    }

    /**
     * Handle window resize events and update auto-resizing child views
     * @internal
     */
    private handleWindowResize(newWidth: number, newHeight: number): void {
        if (process.env.TRONBUN_DEBUG) {
            console.log(`Window resized to ${newWidth}x${newHeight}`);
        }

        // Update all child views that have auto-resize enabled
        for (const childView of this.childViews.values()) {
            const config = childView.getAutoResizeConfig();
            if (config && config.mode !== "none") {
                const newBounds = childView.calculateResizedBounds(newWidth, newHeight);
                if (newBounds) {
                    // Update bounds asynchronously (don't await to avoid blocking)
                    childView.setBounds(newBounds).catch(err => {
                        console.error(`Failed to resize child view ${childView.id}:`, err);
                    });
                }
            }
        }
    }

    private createAutomationAPI(): WindowAutomation {
        const webview = this.webview;
        const protocol = this.protocol;

        // Helper to extract element info from a DOM element
        const getElementInfoScript = `
            (function(el) {
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                const attrs = {};
                for (const attr of el.attributes) {
                    attrs[attr.name] = attr.value;
                }
                const style = window.getComputedStyle(el);
                const isVisible = style.display !== 'none' &&
                                  style.visibility !== 'hidden' &&
                                  style.opacity !== '0' &&
                                  rect.width > 0 && rect.height > 0;
                return {
                    tagName: el.tagName.toLowerCase(),
                    id: el.id || '',
                    className: el.className || '',
                    textContent: el.textContent?.trim().substring(0, 1000) || '',
                    innerHTML: el.innerHTML?.substring(0, 5000) || '',
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    attributes: attrs,
                    isVisible: isVisible,
                    value: el.value,
                    href: el.href
                };
            })
        `;

        return {
            // Navigation
            async goBack(): Promise<void> {
                await webview.eval('window.history.back()');
            },

            async goForward(): Promise<void> {
                await webview.eval('window.history.forward()');
            },

            async reload(): Promise<void> {
                await webview.eval('window.location.reload()');
            },

            async getUrl(): Promise<string> {
                await webview.eval('window.location.href');
                // Note: eval doesn't return values directly, so we use a workaround
                const result = await webview.eval(`
                    (function() {
                        return window.location.href;
                    })()
                `);
                return result as string || '';
            },

            async getTitle(): Promise<string> {
                const result = await webview.eval(`
                    (function() {
                        return document.title;
                    })()
                `);
                return result as string || '';
            },

            // Content extraction
            async getHtml(): Promise<string> {
                const result = await webview.eval(`
                    (function() {
                        return document.documentElement.outerHTML;
                    })()
                `);
                return result as string || '';
            },

            async getText(): Promise<string> {
                const result = await webview.eval(`
                    (function() {
                        return document.body.innerText;
                    })()
                `);
                return result as string || '';
            },

            async screenshot(): Promise<string> {
                const result = await webview.sendCommand('screenshot', {});
                return result as string || '';
            },

            // DOM interaction
            async querySelector(selector: string): Promise<ElementInfo | null> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const result = await webview.eval(`
                    (function() {
                        const el = document.querySelector('${escapedSelector}');
                        return ${getElementInfoScript}(el);
                    })()
                `);
                return result as ElementInfo | null;
            },

            async querySelectorAll(selector: string): Promise<ElementInfo[]> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const result = await webview.eval(`
                    (function() {
                        const elements = document.querySelectorAll('${escapedSelector}');
                        const getInfo = ${getElementInfoScript};
                        return Array.from(elements).map(el => getInfo(el)).filter(Boolean);
                    })()
                `);
                return (result as ElementInfo[]) || [];
            },

            async click(selector: string): Promise<void> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                await webview.eval(`
                    (function() {
                        const el = document.querySelector('${escapedSelector}');
                        if (el) {
                            el.click();
                            return true;
                        }
                        return false;
                    })()
                `);
            },

            async type(selector: string, text: string): Promise<void> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                await webview.eval(`
                    (function() {
                        const el = document.querySelector('${escapedSelector}');
                        if (el) {
                            el.focus();
                            el.value = '${escapedText}';
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            return true;
                        }
                        return false;
                    })()
                `);
            },

            async getValue(selector: string): Promise<string> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const result = await webview.eval(`
                    (function() {
                        const el = document.querySelector('${escapedSelector}');
                        return el ? (el.value || el.textContent || '') : '';
                    })()
                `);
                return result as string || '';
            },

            async scrollTo(x: number, y: number): Promise<void> {
                await webview.eval(`window.scrollTo(${x}, ${y})`);
            },

            async scrollIntoView(selector: string): Promise<void> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                await webview.eval(`
                    (function() {
                        const el = document.querySelector('${escapedSelector}');
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    })()
                `);
            },

            // Waiting
            async waitForSelector(selector: string, timeout: number = 5000): Promise<boolean> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const result = await webview.eval(`
                    (function() {
                        return new Promise((resolve) => {
                            const startTime = Date.now();
                            const check = () => {
                                const el = document.querySelector('${escapedSelector}');
                                if (el) {
                                    resolve(true);
                                } else if (Date.now() - startTime >= ${timeout}) {
                                    resolve(false);
                                } else {
                                    requestAnimationFrame(check);
                                }
                            };
                            check();
                        });
                    })()
                `);
                return result as boolean || false;
            },

            // File upload - reads real files from disk and sets them on file input
            // Windows: uses CDP DOM.setFileInputFiles (file paths); macOS: uses DataTransfer + eval
            async setInputFiles(selector: string, filePaths: string[]): Promise<void> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                if (process.platform === "win32") {
                    // Windows: WebView2 strips File content when assigning input.files (size 0).
                    // Simulate a drop via CDP Input.dispatchDragEvent with file paths so the browser
                    // populates the input from disk (same as a real drag-drop).
                    for (const filePath of filePaths) {
                        const file = Bun.file(filePath);
                        if (!(await file.exists())) {
                            throw new Error(`File not found: ${filePath}`);
                        }
                    }
                    const absolutePaths = filePaths.map((p) => resolve(p));

                    // Hidden file inputs have 0x0 getBoundingClientRect(); use parent (visible drop zone) for drop coordinates
                    const centerJson = await webview.eval(
                        `(function(){ var el = document.querySelector('${escapedSelector}'); if(!el) return 'null'; var target = el.parentElement || el; var r = target.getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2}); })()`
                    );
                    const center = JSON.parse(centerJson ?? "null") as { x: number; y: number } | null;
                    if (!center || typeof center.x !== "number" || typeof center.y !== "number") {
                        throw new Error(`Element not found: ${selector}`);
                    }

                    const dragData = {
                        files: absolutePaths,
                        items: [] as { mimeType: string; data: string }[],
                        dragOperationsMask: 1,
                    };

                    await protocol.call("Input.dispatchDragEvent", {
                        type: "dragEnter",
                        x: center.x,
                        y: center.y,
                        data: dragData,
                        modifiers: 0,
                    });
                    await protocol.call("Input.dispatchDragEvent", {
                        type: "dragOver",
                        x: center.x,
                        y: center.y,
                        data: dragData,
                        modifiers: 0,
                    });
                    await protocol.call("Input.dispatchDragEvent", {
                        type: "drop",
                        x: center.x,
                        y: center.y,
                        data: dragData,
                        modifiers: 0,
                    });
                    return;
                }

                // macOS: DataTransfer + eval (works on WKWebView)
                const fileDataArray: { name: string; type: string; base64: string }[] = [];
                for (const filePath of filePaths) {
                    const file = Bun.file(filePath);
                    const exists = await file.exists();
                    if (!exists) {
                        throw new Error(`File not found: ${filePath}`);
                    }
                    const arrayBuffer = await file.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    let binary = '';
                    for (let i = 0; i < uint8Array.length; i++) {
                        binary += String.fromCharCode(uint8Array[i]);
                    }
                    const base64 = btoa(binary);
                    const name = filePath.split('/').pop() || filePath.split('\\').pop() || 'file';
                    const type = file.type || 'application/octet-stream';
                    fileDataArray.push({ name, type, base64 });
                }

                const escapeForJsString = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                await webview.eval(`(function() { window.__tronbun_dt = new DataTransfer(); return true; })()`);
                for (const fileData of fileDataArray) {
                    const escapedName = escapeForJsString(fileData.name);
                    const escapedType = escapeForJsString(fileData.type);
                    const chunkSize = 8000;
                    const chunks: string[] = [];
                    for (let i = 0; i < fileData.base64.length; i += chunkSize) {
                        chunks.push(escapeForJsString(fileData.base64.slice(i, i + chunkSize)));
                    }
                    await webview.eval(`(function() { window.__tronbun_b64 = ''; return true; })()`);
                    for (const chunk of chunks) {
                        await webview.eval(`(function() { window.__tronbun_b64 += '${chunk}'; return true; })()`);
                    }
                    await webview.eval(`(function() { var b = atob(window.__tronbun_b64); var a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); window.__tronbun_dt.items.add(new File([a], '${escapedName}', { type: '${escapedType}' })); return true; })()`);
                }
                await webview.eval(`(function() { var el = document.querySelector('${escapedSelector}'); if (el) { el.files = window.__tronbun_dt.files; } return true; })()`);
                await webview.eval(`(function() { var el = document.querySelector('${escapedSelector}'); if (el) { el.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`);
                await webview.eval(`(function() { delete window.__tronbun_dt; delete window.__tronbun_b64; return true; })()`);
            },

            // File download - download from URL to local file
            async downloadFile(url: string, savePath: string): Promise<void> {
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    await Bun.write(savePath, arrayBuffer);
                } catch (error) {
                    throw new Error(`Download failed: ${error}`);
                }
            },

            // Save an image element to a local file
            async saveImage(selector: string, savePath: string): Promise<void> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                // Get the image source URL
                const result = await webview.eval(`
                    (function() {
                        const img = document.querySelector('${escapedSelector}');
                        if (!img) return null;
                        // Handle both img tags and background images
                        if (img.tagName === 'IMG') {
                            return img.src || img.currentSrc;
                        }
                        // Try to get background image
                        const style = window.getComputedStyle(img);
                        const bgImage = style.backgroundImage;
                        if (bgImage && bgImage !== 'none') {
                            const match = bgImage.match(/url\\(["']?([^"')]+)["']?\\)/);
                            return match ? match[1] : null;
                        }
                        return null;
                    })()
                `);

                if (!result) {
                    throw new Error(`No image found at selector: ${selector}`);
                }

                const imageUrl = result as string;

                // Handle data URLs (base64 images)
                if (imageUrl.startsWith('data:')) {
                    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches) {
                        const base64Data = matches[2];
                        const binaryData = Buffer.from(base64Data, 'base64');
                        await Bun.write(savePath, binaryData);
                        return;
                    }
                }

                // Handle blob URLs - need to fetch from webview context
                if (imageUrl.startsWith('blob:')) {
                    const base64Result = await webview.eval(`
                        (function() {
                            return new Promise((resolve, reject) => {
                                const img = document.querySelector('${escapedSelector}');
                                if (!img || img.tagName !== 'IMG') {
                                    resolve(null);
                                    return;
                                }
                                const canvas = document.createElement('canvas');
                                canvas.width = img.naturalWidth || img.width;
                                canvas.height = img.naturalHeight || img.height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0);
                                resolve(canvas.toDataURL('image/png').split(',')[1]);
                            });
                        })()
                    `);
                    if (base64Result) {
                        const binaryData = Buffer.from(base64Result as string, 'base64');
                        await Bun.write(savePath, binaryData);
                        return;
                    }
                }

                // Regular URL - download directly
                await this.downloadFile(imageUrl, savePath);
            },

            // Get the src URL of an image element
            async getImageSrc(selector: string): Promise<string | null> {
                const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const result = await webview.eval(`
                    (function() {
                        const img = document.querySelector('${escapedSelector}');
                        if (!img) return null;
                        if (img.tagName === 'IMG') {
                            return img.src || img.currentSrc || null;
                        }
                        return null;
                    })()
                `);
                return result as string | null;
            }
        };
    }

    private createDialogAPI(): WindowDialog {
        const webview = this.webview;

        // Map TypeScript types to native enum values
        const typeMap: Record<MessageBoxType, number> = {
            info: 0,
            warning: 1,
            error: 2,
            question: 3
        };

        const buttonsMap: Record<MessageBoxButtons, number> = {
            ok: 0,
            okCancel: 1,
            yesNo: 2,
            yesNoCancel: 3
        };

        return {
            async openFile(options?: OpenFileOptions): Promise<string[] | null> {
                const result = await webview.sendCommand('open_file_dialog', {
                    title: options?.title || '',
                    filters: options?.filters ? JSON.stringify(options.filters) : '',
                    allowMultiple: options?.multiple ? 1 : 0
                });
                // Result is a JSON array of paths or null
                return result ? JSON.parse(result) : null;
            },

            async saveFile(options?: SaveFileOptions): Promise<string | null> {
                const result = await webview.sendCommand('save_file_dialog', {
                    title: options?.title || '',
                    defaultName: options?.defaultName || '',
                    filters: options?.filters ? JSON.stringify(options.filters) : ''
                });
                // Result is a JSON array with one path or null
                if (result) {
                    const paths = JSON.parse(result);
                    return paths && paths.length > 0 ? paths[0] : null;
                }
                return null;
            },

            async openFolder(options?: OpenFolderOptions): Promise<string | null> {
                const result = await webview.sendCommand('open_folder_dialog', {
                    title: options?.title || ''
                });
                // Result is a JSON array with one path or null
                if (result) {
                    const paths = JSON.parse(result);
                    return paths && paths.length > 0 ? paths[0] : null;
                }
                return null;
            },

            async showMessage(options: MessageBoxOptions): Promise<MessageBoxResult> {
                const result = await webview.sendCommand('message_box', {
                    title: options.title || '',
                    message: options.message,
                    detail: options.detail || '',
                    type: typeMap[options.type || 'info'],
                    buttons: buttonsMap[options.buttons || 'ok']
                });
                // Result is { result: "ok" | "cancel" | "yes" | "no" }
                return (result as { result: MessageBoxResult }).result;
            },

            async showInfo(message: string, title?: string): Promise<void> {
                await this.showMessage({
                    message,
                    title: title || 'Information',
                    type: 'info',
                    buttons: 'ok'
                });
            },

            async showWarning(message: string, title?: string): Promise<void> {
                await this.showMessage({
                    message,
                    title: title || 'Warning',
                    type: 'warning',
                    buttons: 'ok'
                });
            },

            async showError(message: string, title?: string): Promise<void> {
                await this.showMessage({
                    message,
                    title: title || 'Error',
                    type: 'error',
                    buttons: 'ok'
                });
            },

            async confirm(message: string, title?: string): Promise<boolean> {
                const result = await this.showMessage({
                    message,
                    title: title || 'Confirm',
                    type: 'question',
                    buttons: 'yesNo'
                });
                return result === 'yes';
            }
        };
    }

    private createMenuAPI(): WindowMenu {
        const webview = this.webview;
        const menuClickHandlers = this.menuClickHandlers;

        // Helper to convert Menu[] to format expected by native and register click handlers
        const processMenus = (menus: Menu[]): any[] => {
            const processItem = (item: MenuItem): any => {
                const result: any = {
                    id: item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                    label: item.label || '',
                    type: item.type || 'normal',
                    enabled: item.enabled !== false,
                    checked: item.checked || false
                };

                if (item.role) {
                    result.role = item.role;
                }

                if (item.accelerator) {
                    result.accelerator = item.accelerator;
                }

                if (item.submenu && item.submenu.length > 0) {
                    result.submenu = item.submenu.map(processItem);
                }

                // Register click handler if provided
                if (item.click) {
                    menuClickHandlers.set(result.id, item.click);
                }

                return result;
            };

            return menus.map(menu => ({
                id: menu.id || `menu_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                label: menu.label,
                items: menu.items.map(processItem)
            }));
        };

        return {
            async setMenu(menus: Menu[]): Promise<void> {
                // Clear existing handlers
                menuClickHandlers.clear();

                // Convert menus and register handlers
                const processedMenus = processMenus(menus);

                await webview.sendCommand('set_menu', {
                    menus: processedMenus
                });
            },

            async setDefaultMenu(appName?: string): Promise<void> {
                await webview.sendCommand('set_default_menu', {
                    appName: appName || 'Application'
                });
            },

            async removeMenu(): Promise<void> {
                menuClickHandlers.clear();
                await webview.sendCommand('remove_menu', {});
            },

            async updateItem(itemId: string, updates: Partial<Pick<MenuItem, "label" | "enabled" | "checked">>): Promise<void> {
                await webview.sendCommand('update_menu_item', {
                    itemId,
                    label: updates.label || '',
                    enabled: updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : -1,
                    checked: updates.checked !== undefined ? (updates.checked ? 1 : 0) : -1
                });
            },

            async setItemEnabled(itemId: string, enabled: boolean): Promise<void> {
                await webview.sendCommand('update_menu_item', {
                    itemId,
                    label: '',
                    enabled: enabled ? 1 : 0,
                    checked: -1
                });
            },

            async setItemChecked(itemId: string, checked: boolean): Promise<void> {
                await webview.sendCommand('update_menu_item', {
                    itemId,
                    label: '',
                    enabled: -1,
                    checked: checked ? 1 : 0
                });
            },

            onClick(itemId: string, handler: () => void): void {
                menuClickHandlers.set(itemId, handler);
            },

            offClick(itemId: string): void {
                menuClickHandlers.delete(itemId);
            }
        };
    }

    private createContextMenuAPI(): WindowContext {
        const webview = this.webview;
        const contextMenuClickHandlers = this.contextMenuClickHandlers;

        // Helper to process context menu items and register click handlers
        const processItems = (items: ContextMenuItem[]): any[] => {
            return items.map(item => {
                const result: any = {
                    id: item.id || `ctx_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                    label: item.label || '',
                    type: item.type || 'normal',
                    enabled: item.enabled !== false,
                    checked: item.checked || false
                };

                if (item.accelerator) {
                    result.accelerator = item.accelerator;
                }

                if (item.submenu && item.submenu.length > 0) {
                    result.type = 'submenu';
                    result.submenu = processItems(item.submenu);
                }

                // Register click handler if provided
                if (item.click) {
                    contextMenuClickHandlers.set(result.id, item.click);
                }

                return result;
            });
        };

        return {
            async setContextMenu(items: ContextMenuItem[]): Promise<void> {
                // Clear existing handlers
                contextMenuClickHandlers.clear();

                // Process items and register handlers
                const processedItems = processItems(items);

                await webview.sendCommand('set_context_menu', {
                    items: processedItems
                });
            },

            async removeContextMenu(): Promise<void> {
                contextMenuClickHandlers.clear();
                await webview.sendCommand('remove_context_menu', {});
            },

            async updateItem(itemId: string, updates: Partial<Pick<ContextMenuItem, "label" | "enabled" | "checked">>): Promise<void> {
                await webview.sendCommand('update_context_menu_item', {
                    itemId,
                    label: updates.label || '',
                    enabled: updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : -1,
                    checked: updates.checked !== undefined ? (updates.checked ? 1 : 0) : -1
                });
            },

            async setItemEnabled(itemId: string, enabled: boolean): Promise<void> {
                await webview.sendCommand('update_context_menu_item', {
                    itemId,
                    label: '',
                    enabled: enabled ? 1 : 0,
                    checked: -1
                });
            },

            async setItemChecked(itemId: string, checked: boolean): Promise<void> {
                await webview.sendCommand('update_context_menu_item', {
                    itemId,
                    label: '',
                    enabled: -1,
                    checked: checked ? 1 : 0
                });
            },

            onClick(itemId: string, handler: () => void): void {
                contextMenuClickHandlers.set(itemId, handler);
            },

            offClick(itemId: string): void {
                contextMenuClickHandlers.delete(itemId);
            }
        };
    }

    private createNotificationAPI(): WindowNotification {
        const webview = this.webview;
        const self = this;

        const urgencyMap: Record<NotificationUrgency, number> = {
            low: 0,
            normal: 1,
            critical: 2
        };

        // Compiled mode: use FFI to call native notification APIs directly
        // from the Bun process, bypassing the webview_main IPC path.
        // macOS: UNUserNotificationCenter via libnotification.dylib
        // Windows: Shell_NotifyIconW via libnotification.dll
        const isCompiled = (globalThis as any).__TRONBUN_EMBEDDED_FILES_COMPRESSED__;
        if (isCompiled && (process.platform === 'darwin' || process.platform === 'win32')) {
            return this.createNotificationAPIFFI(urgencyMap);
        }

        // Send the app icon to the notification system once on first use
        let notifIconSent = false;
        const ensureNotifIcon = async () => {
            if (notifIconSent) return;
            notifIconSent = true;
            if (self.iconPath && process.platform === 'win32') {
                try {
                    await webview.sendCommand('notification_set_icon', { path: self.iconPath });
                } catch { /* ignore if command not supported */ }
            }
        };

        return {
            async requestPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
                await ensureNotifIcon();
                const result = await webview.sendCommand('notification_request_permission', {});
                const str = typeof result === 'string' ? result : String(result);
                if (str === 'granted' || str === 'denied' || str === 'unavailable') return str;
                return 'unavailable';
            },

            async show(options: NotificationOptions): Promise<string> {
                await ensureNotifIcon();
                const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const result = await webview.sendCommand('notification_show', {
                    id: notifId,
                    title: options.title,
                    body: options.body || '',
                    icon: options.icon || '',
                    silent: options.silent ? 1 : 0,
                    urgency: urgencyMap[options.urgency || 'normal'],
                    actions: options.actions || []
                });
                return typeof result === 'string' ? result : notifId;
            },

            async close(notificationId: string): Promise<void> {
                await webview.sendCommand('notification_close', { id: notificationId });
            },

            async isAvailable(): Promise<number> {
                const result = await webview.sendCommand('notification_check', {});
                return typeof result === 'number' ? result : parseInt(result, 10);
            },

            onClick(handler: NotificationClickHandler): void {
                self.notificationClickHandler = handler;
            },

            offClick(): void {
                self.notificationClickHandler = null;
            },

            onClose(handler: NotificationCloseHandler): void {
                self.notificationCloseHandler = handler;
            },

            offClose(): void {
                self.notificationCloseHandler = null;
            },

            onAction(handler: NotificationActionHandler): void {
                self.notificationActionHandler = handler;
            },

            offAction(): void {
                self.notificationActionHandler = null;
            }
        };
    }

    /**
     * Create notification API using FFI (compiled macOS mode).
     * Loads libnotification.dylib and calls UNUserNotificationCenter directly.
     */
    private createNotificationAPIFFI(urgencyMap: Record<NotificationUrgency, number>): WindowNotification {
        const self = this;
        let native: import("./NotificationNative").NotificationNative | null = null;
        let initDone = false;

        const ensureInit = () => {
            if (initDone) return native;
            initDone = true;
            try {
                const { NotificationNative } = require("./NotificationNative") as typeof import("./NotificationNative");
                native = NotificationNative.getInstance();
                if (native) {
                    // Set the app icon for the notification tray icon before init
                    if (self.iconPath && process.platform === 'win32') {
                        native.setIcon(self.iconPath);
                    }
                    native.init((id, event, actionIndex) => {
                        if (event === 'click' && self.notificationClickHandler) {
                            self.notificationClickHandler(id);
                        } else if (event === 'close' && self.notificationCloseHandler) {
                            self.notificationCloseHandler(id);
                        } else if (event === 'action' && self.notificationActionHandler) {
                            self.notificationActionHandler(id, actionIndex);
                        }
                    });
                }
            } catch (e) {
                console.error("[Window] Failed to load notification FFI:", e);
                native = null;
            }
            return native;
        };

        let permissionDialogShown = false;

        return {
            async requestPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
                const n = ensureInit();
                if (!n) return 'unavailable';
                const result = n.requestPermission();
                if (result === 0) return 'granted';
                // Permission denied — show dialog guiding user to System Settings (macOS only)
                if (result === -2 && !permissionDialogShown && process.platform === 'darwin') {
                    permissionDialogShown = true;
                    const openSettings = await self.dialog.confirm(
                        "This app needs permission to show notifications.\n\nPlease enable notifications in System Settings > Notifications.",
                        "Notification Permission"
                    );
                    if (openSettings) {
                        Bun.spawn(["open", "x-apple.systempreferences:com.apple.Notifications-Settings.extension"]);
                    }
                    return 'denied';
                }
                if (result === -2) return 'denied';
                return 'unavailable';
            },

            async show(options: NotificationOptions): Promise<string> {
                const n = ensureInit();
                const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                if (!n) return notifId;
                n.show(
                    notifId,
                    options.title,
                    options.body || '',
                    options.silent || false,
                    urgencyMap[options.urgency || 'normal'],
                    options.actions
                );
                return notifId;
            },

            async close(notificationId: string): Promise<void> {
                const n = ensureInit();
                if (n) n.close(notificationId);
            },

            async isAvailable(): Promise<number> {
                const n = ensureInit();
                if (!n) return 0;
                return n.checkPermission();
            },

            onClick(handler: NotificationClickHandler): void {
                self.notificationClickHandler = handler;
            },

            offClick(): void {
                self.notificationClickHandler = null;
            },

            onClose(handler: NotificationCloseHandler): void {
                self.notificationCloseHandler = handler;
            },

            offClose(): void {
                self.notificationCloseHandler = null;
            },

            onAction(handler: NotificationActionHandler): void {
                self.notificationActionHandler = handler;
            },

            offAction(): void {
                self.notificationActionHandler = null;
            }
        };
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

    /**
     * Alias for registerIPCHandler - registers a handler for IPC calls from the webview
     * @param channel The channel name to handle
     * @param handler The handler function
     */
    public handle(channel: string, handler: IPCHandler) {
        this.registerIPCHandler(channel, handler);
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
        const isCompiled = isCompiledExecutable();
        const isEmbeddedPath = url.startsWith('file://') || url.startsWith('/__embedded__/');
        
        if (isCompiled && isEmbeddedPath) {
            // Check for compressed embedded files (new format)
            const compressedFiles = (globalThis as any).__TRONBUN_EMBEDDED_FILES_COMPRESSED__ as Record<string, string> | undefined;

            console.log('📦 Compiled mode detected, checking for embedded assets...');
            console.log('📦 Embedded files found:', compressedFiles ? Object.keys(compressedFiles).length : 0);

            if (compressedFiles) {
                try {
                    // Decompress and register all embedded files with the virtual file system
                    const fileCount = Object.keys(compressedFiles).length;
                    console.log('📦 Decompressing and registering', fileCount, 'files in virtual file system');

                    for (const [path, base64Content] of Object.entries(compressedFiles)) {
                        // Decode base64 and decompress gzip
                        const compressed = Buffer.from(base64Content, 'base64');
                        const decompressed = Bun.gunzipSync(compressed);
                        // Use TextDecoder to properly convert Uint8Array to string
                        const content = new TextDecoder('utf-8').decode(decompressed);

                        console.log('📦 Registering virtual file:', path, `(${content.length} bytes)`);
                        await this.webview.registerVirtualFile(path, content);
                    }

                    // Navigate to the custom protocol
                    console.log('📦 Navigating to tronbun://app/');
                    await this.webview.navigate('tronbun://app/');
                    this.currentUrl = url;
                    this.stopHotReload();
                    return;
                } catch (error) {
                    console.error('Failed to decompress/register virtual files:', error);
                    // Fall through to regular navigation
                }
            } else {
                console.log('📁 No embedded assets found, falling back to regular navigation');
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

        // Set up auto-resize if configured
        if (options.autoResize) {
            // Get current window size for proportional resize calculations
            const windowSize = await this.getWindowSize();

            // Normalize autoResize config
            let config: AutoResizeConfig;
            if (typeof options.autoResize === 'string') {
                config = { mode: options.autoResize };
            } else {
                config = options.autoResize;
            }

            childView.setAutoResize(config, windowSize);

            if (process.env.TRONBUN_DEBUG) {
                console.log(`Child view ${id} auto-resize enabled: ${config.mode}`);
            }
        }

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

    /**
     * Get the current window size
     * @returns Object with width and height properties
     */
    async getWindowSize(): Promise<{ width: number; height: number }> {
        const result = await this.webview.sendCommand('window_get_size', {});
        return result as { width: number; height: number };
    }
}