import { resolveWebviewPath } from "./utils.js";
import { BaseProcess, type BaseResponse } from "./BaseProcess.js";

export interface TrayMenuItem {
    id: string;
    label: string;
    type?: 'normal' | 'separator' | 'checkbox' | 'submenu';
    enabled?: boolean;
    checked?: boolean;
    submenu?: TrayMenuItem[];
    accelerator?: string;
    callback?: () => void | Promise<void>;
}

export interface TrayOptions {
    icon: string;
    tooltip?: string;
    menu?: TrayMenuItem[];
}

export interface TrayResponse extends BaseResponse {
    type: 'response' | 'menu_click';
    data?: {
        menuId?: string;
    };
}

export type TrayMenuClickHandler = (menuId: string) => void;

export class Tray extends BaseProcess {
    private menuClickHandlers = new Map<string, TrayMenuClickHandler>();

    constructor(options: TrayOptions) {
        // Resolve the tray executable path using cross-platform utility
        const webviewPath = resolveWebviewPath();
        const trayPath = webviewPath.replace('webview_main', 'tray_main');
        super(trayPath);

        // Initialize tray with options
        this.initialize(options);
    }

    protected getProcessName(): string {
        return "Tray";
    }

    protected async handleSpecificResponse(response: TrayResponse): Promise<void> {
        if (response.type === 'menu_click') {
            const menuId = response.data?.menuId;
            if (menuId) {
                const handler = this.menuClickHandlers.get(menuId);
                if (handler) {
                    handler(menuId);
                }
            }
            return;
        }
    }

    private async initialize(options: TrayOptions) {
        // Give the tray process a moment to fully initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await this.setIcon(options.icon);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        if (options.tooltip) {
            await this.setTooltip(options.tooltip);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        if (options.menu) {
            await this.setMenu(options.menu);
        }
    }

    // Override cleanup to also clear menu click handlers  
    override cleanup(): void {
        // Clear handlers before calling parent cleanup
        this.menuClickHandlers.clear();
        super.cleanup();
    }

    /**
     * Recursively register callbacks from menu items
     * @param menuItems Array of menu items to process
     */
    private registerMenuCallbacks(menuItems: TrayMenuItem[]): void {
        for (const item of menuItems) {
            // Register callback if it exists
            if (item.callback && item.id) {
                this.menuClickHandlers.set(item.id, () => {
                    item.callback!();
                });
            }
            
            // Recursively handle submenus
            if (item.submenu && item.submenu.length > 0) {
                this.registerMenuCallbacks(item.submenu);
            }
        }
    }

    // === Tray API Methods ===

    /**
     * Set the tray icon
     * @param iconPath Path to the icon file
     */
    async setIcon(iconPath: string): Promise<void> {
        await this.sendCommand('tray_set_icon', { icon: iconPath });
    }

    /**
     * Set the tray tooltip
     * @param tooltip Tooltip text
     */
    async setTooltip(tooltip: string): Promise<void> {
        await this.sendCommand('tray_set_tooltip', { tooltip });
    }

    /**
     * Set the tray menu
     * @param menu Array of menu items
     */
    async setMenu(menu: TrayMenuItem[]): Promise<void> {
        // Register any inline callbacks before setting the menu
        this.registerMenuCallbacks(menu);
        await this.sendCommand('tray_set_menu', { menu });
    }

    /**
     * Remove the tray icon
     */
    async destroy(): Promise<void> {
        if (this.isDestroyed) return;
        
        try {
            await this.sendCommand('tray_destroy');
        } catch (error) {
            // Ignore errors during destroy
        }
        this.cleanup();
    }

    /**
     * Register a handler for menu item clicks
     * Note: This will override any inline callback defined in the menu item
     * @param menuId Menu item ID
     * @param handler Click handler function
     */
    onMenuClick(menuId: string, handler: TrayMenuClickHandler): void {
        this.menuClickHandlers.set(menuId, handler);
    }

    /**
     * Remove a menu click handler
     * @param menuId Menu item ID
     */
    offMenuClick(menuId: string): void {
        this.menuClickHandlers.delete(menuId);
    }



    /**
     * Check if tray is supported on this platform
     */
    static isSupported(): boolean {
        // Tray icons are supported on all major desktop platforms
        return process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux';
    }
}
