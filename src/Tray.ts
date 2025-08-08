import { spawn } from "bun";
import { dirname } from "path";
import { resolveWebviewPath } from "./utils.js";

export interface TrayMenuItem {
    id: string;
    label: string;
    type?: 'normal' | 'separator' | 'checkbox' | 'submenu';
    enabled?: boolean;
    checked?: boolean;
    submenu?: TrayMenuItem[];
    accelerator?: string;
}

export interface TrayOptions {
    icon: string;
    tooltip?: string;
    menu?: TrayMenuItem[];
}

export interface TrayResponse {
    type: 'response' | 'menu_click' | 'tray_click';
    id: string;
    result?: any;
    error?: string;
    menuId?: string;
}

export type TrayMenuClickHandler = (menuId: string) => void;
export type TrayClickHandler = () => void;

export class Tray {
    private process: any = null;
    private pendingCommands = new Map<string, {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
        timeout: Timer;
    }>();
    private isDestroyed = false;
    private menuClickHandlers = new Map<string, TrayMenuClickHandler>();
    private clickHandlers: TrayClickHandler[] = [];

    constructor(options: TrayOptions) {
        // Resolve the tray executable path using cross-platform utility
        const webviewPath = resolveWebviewPath();
        const trayPath = webviewPath.replace('webview_main', 'tray_main');

        this.process = spawn({
            cmd: [trayPath],
            cwd: dirname(trayPath),
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.startReadingResponses();

        // Handle process events
        this.process.exited.then((code: number) => {
            console.log(`Tray process exited with code: ${code}`);
            this.cleanup();
        });

        this.handleStderr();

        // Initialize tray with options
        this.initialize(options);
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

    async sendCommand(method: string, params: any = {}, customId?: string): Promise<any> {
        const id = customId || Date.now().toString() + Math.random().toString(36).substring(2);
        const command = { method, id, params };
    
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingCommands.delete(id);
                reject(new Error(`Command '${method}' timed out`));
            }, 5000);
    
            this.pendingCommands.set(id, { resolve, reject, timeout });
    
            const commandJson = JSON.stringify(command) + '\n';
            console.debug('📤 Tray Sending:', commandJson.trim());
            
            if (this.process?.stdin) {
                this.process.stdin.write(new TextEncoder().encode(commandJson));
            }
        });
    }

    private startReadingResponses() {
        if (!this.process?.stdout) return;

        const decoder = new TextDecoder();
        let buffer = '';

        const reader = this.process.stdout.getReader();
        
        const readLoop = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.trim()) {
                            console.log('📥 Tray Received:', line);
                            try {
                                const response: TrayResponse = JSON.parse(line);
                                this.handleResponse(response);
                            } catch (error) {
                                console.log('📄 Tray Raw output:', line);
                            }
                        }
                    }
                }
            } catch (error) {
                console.log('Tray stdout reading ended');
            }
        };

        readLoop();
    }

    private async handleResponse(response: TrayResponse) {
        if (response.type === 'menu_click' && response.menuId) {
            const handler = this.menuClickHandlers.get(response.menuId);
            if (handler) {
                handler(response.menuId);
            }
            return;
        }

        if (response.type === 'tray_click') {
            for (const handler of this.clickHandlers) {
                handler();
            }
            return;
        }

        const pending = this.pendingCommands.get(response.id);
        if (pending) {   
            clearTimeout(pending.timeout);
            this.pendingCommands.delete(response.id);

            if (response.error) {
                pending.reject(new Error(response.error));
            } else {
                pending.resolve(response.result);
            }
        }
    }

    cleanup(): void {
        if (this.isDestroyed) return;

        this.isDestroyed = true;

        // Cancel pending commands without throwing errors
        for (const [id, pending] of this.pendingCommands) {
            clearTimeout(pending.timeout);
            // Don't reject during cleanup to avoid unhandled promise rejections
        }
        this.pendingCommands.clear();

        // Clear handlers
        this.menuClickHandlers.clear();
        this.clickHandlers.length = 0;

        // Close streams
        if (this.process?.stdin) {
            try {
                this.process.stdin.close().catch(() => {});
            } catch (error) {
                // Ignore cleanup errors
            }
        }

        if (this.process?.stdout) {
            this.process.stdout.cancel().catch(() => {});
        }

        // Kill process if still running
        if (this.process) {
            this.process.kill();
            this.process = null;
        }

        console.log('🧹 Tray cleaned up');
    }

    private async handleStderr(): Promise<void> {
        if (!this.process?.stderr) return;
        
        try {
            for await (const chunk of this.process.stderr) {
                const text = new TextDecoder().decode(chunk);
                process.stderr.write(`[Tray] ${text}`);
            }
        } catch (error) {
            // Process ended, ignore
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
        await this.sendCommand('tray_set_menu', { menu });
    }

    /**
     * Show a notification from the tray
     * @param title Notification title
     * @param body Notification body
     */
    async showNotification(title: string, body: string): Promise<void> {
        await this.sendCommand('tray_show_notification', { title, body });
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
     * Register a handler for tray icon clicks
     * @param handler Click handler function
     */
    onClick(handler: TrayClickHandler): void {
        this.clickHandlers.push(handler);
    }

    /**
     * Remove all click handlers
     */
    offClick(): void {
        this.clickHandlers.length = 0;
    }

    /**
     * Check if tray is supported on this platform
     */
    static isSupported(): boolean {
        // Tray icons are supported on all major desktop platforms
        return process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux';
    }
}
