/**
 * Chrome DevTools Protocol (CDP) Interface for Tronbun
 *
 * Provides Puppeteer-like browser automation capabilities.
 * - Windows: Uses native WebView2 CDP support
 * - macOS: Emulates CDP using WKWebView APIs
 */

import type { Webview } from "./Webview";

/**
 * Cookie object matching CDP Network.Cookie
 */
export interface Cookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * PDF generation options matching CDP Page.printToPDF
 */
export interface PDFOptions {
    landscape?: boolean;
    displayHeaderFooter?: boolean;
    printBackground?: boolean;
    scale?: number;
    paperWidth?: number;
    paperHeight?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    pageRanges?: string;
    preferCSSPageSize?: boolean;
}

/**
 * Mouse button type
 */
export type MouseButton = 'left' | 'right' | 'middle';

/**
 * Mouse event type
 */
export type MouseEventType = 'mousePressed' | 'mouseReleased' | 'mouseMoved';

/**
 * Key event type
 */
export type KeyEventType = 'keyDown' | 'keyUp' | 'char';

/**
 * Keyboard modifiers
 */
export interface KeyModifiers {
    alt?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
}

/**
 * Request interception pattern
 */
export interface RequestPattern {
    urlPattern?: string;
    resourceType?: string;
    requestStage?: 'Request' | 'Response';
}

/**
 * Intercepted request information
 */
export interface InterceptedRequest {
    requestId: string;
    request: {
        url: string;
        method: string;
        headers: Record<string, string>;
        postData?: string;
    };
    frameId: string;
    resourceType: string;
}

/**
 * CDP event subscription
 */
export interface CDPSubscription {
    unsubscribe(): Promise<void>;
}

/**
 * Protocol API for low-level browser automation
 * Provides Puppeteer-like capabilities through CDP or native APIs
 */
export class Protocol {
    private webview: Webview;
    private subscriptionCounter = 0;
    private activeSubscriptions = new Map<number, string>();

    constructor(webview: Webview) {
        this.webview = webview;
    }

    // =========================================================================
    // Raw CDP Access
    // =========================================================================

    /**
     * Call a raw CDP method
     * Note: Full CDP support only available on Windows (WebView2)
     * macOS emulates common methods via WKWebView APIs
     */
    async call(method: string, params: Record<string, any> = {}): Promise<any> {
        return await this.webview.sendCommand('cdp_call', {
            method,
            params: JSON.stringify(params)
        });
    }

    /**
     * Subscribe to a CDP event
     * Note: Event subscriptions are not fully implemented yet.
     * This is a placeholder for future implementation.
     */
    async subscribe(
        eventName: string,
        callback: (params: any) => void
    ): Promise<CDPSubscription> {
        const subscriptionId = ++this.subscriptionCounter;

        // Store callback for routing events (would need native event routing)
        this.activeSubscriptions.set(subscriptionId, eventName);

        // Note: CDP event subscriptions not yet implemented in native layer
        console.warn(`[Protocol] CDP event subscriptions not yet fully implemented: ${eventName}`);

        return {
            unsubscribe: async () => {
                this.activeSubscriptions.delete(subscriptionId);
            }
        };
    }

    // =========================================================================
    // Cookies (Network Domain)
    // =========================================================================

    /**
     * Get all cookies, optionally filtered by URL
     */
    async getCookies(url?: string): Promise<Cookie[]> {
        const result = await this.webview.sendCommand('cdp_get_cookies', {
            url: url || ''
        });

        try {
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            return parsed.cookies || parsed || [];
        } catch {
            return [];
        }
    }

    /**
     * Set a cookie
     */
    async setCookie(cookie: Cookie): Promise<boolean> {
        const result = await this.webview.sendCommand('cdp_set_cookie', {
            cookie: JSON.stringify(cookie)
        });

        try {
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            return parsed.success !== false;
        } catch {
            return false;
        }
    }

    /**
     * Delete cookies matching the specified criteria
     */
    async deleteCookies(
        name: string,
        options?: { url?: string; domain?: string }
    ): Promise<void> {
        await this.webview.sendCommand('cdp_delete_cookies', {
            name,
            url: options?.url || '',
            domain: options?.domain || ''
        });
    }

    /**
     * Clear all cookies
     */
    async clearCookies(): Promise<void> {
        await this.call('Network.clearBrowserCookies', {});
    }

    // =========================================================================
    // PDF Generation (Page Domain)
    // =========================================================================

    /**
     * Generate a PDF of the current page
     * @returns Base64-encoded PDF data
     */
    async printToPDF(options: PDFOptions = {}): Promise<string> {
        const result = await this.webview.sendCommand('cdp_print_to_pdf', {
            options: JSON.stringify({
                landscape: options.landscape ?? false,
                displayHeaderFooter: options.displayHeaderFooter ?? false,
                printBackground: options.printBackground ?? false,
                scale: options.scale ?? 1,
                paperWidth: options.paperWidth ?? 8.5,
                paperHeight: options.paperHeight ?? 11,
                marginTop: options.marginTop ?? 0.4,
                marginBottom: options.marginBottom ?? 0.4,
                marginLeft: options.marginLeft ?? 0.4,
                marginRight: options.marginRight ?? 0.4,
                pageRanges: options.pageRanges ?? '',
                preferCSSPageSize: options.preferCSSPageSize ?? false
            })
        });

        try {
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            return parsed.data || '';
        } catch {
            return typeof result === 'string' ? result : '';
        }
    }

    // =========================================================================
    // Input Simulation (Input Domain)
    // =========================================================================

    /**
     * Dispatch a mouse event at specific coordinates
     */
    async dispatchMouseEvent(
        type: MouseEventType,
        x: number,
        y: number,
        options?: {
            button?: MouseButton;
            clickCount?: number;
        }
    ): Promise<void> {
        await this.webview.sendCommand('cdp_mouse_event', {
            type,
            x,
            y,
            button: options?.button || 'left',
            click_count: options?.clickCount || 1
        });
    }

    /**
     * Click at specific coordinates
     */
    async clickAt(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
        await this.dispatchMouseEvent('mousePressed', x, y, { button, clickCount: 1 });
        await this.dispatchMouseEvent('mouseReleased', x, y, { button, clickCount: 1 });
    }

    /**
     * Double-click at specific coordinates
     */
    async doubleClickAt(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
        await this.dispatchMouseEvent('mousePressed', x, y, { button, clickCount: 1 });
        await this.dispatchMouseEvent('mouseReleased', x, y, { button, clickCount: 1 });
        await this.dispatchMouseEvent('mousePressed', x, y, { button, clickCount: 2 });
        await this.dispatchMouseEvent('mouseReleased', x, y, { button, clickCount: 2 });
    }

    /**
     * Move mouse to specific coordinates
     */
    async moveMouse(x: number, y: number): Promise<void> {
        await this.dispatchMouseEvent('mouseMoved', x, y);
    }

    /**
     * Dispatch a keyboard event
     */
    async dispatchKeyEvent(
        type: KeyEventType,
        key: string,
        modifiers?: KeyModifiers
    ): Promise<void> {
        let modifierFlags = 0;
        if (modifiers?.alt) modifierFlags |= 1;
        if (modifiers?.ctrl) modifierFlags |= 2;
        if (modifiers?.meta) modifierFlags |= 4;
        if (modifiers?.shift) modifierFlags |= 8;

        await this.webview.sendCommand('cdp_key_event', {
            type,
            key,
            modifiers: modifierFlags
        });
    }

    /**
     * Press a key (keyDown + keyUp)
     */
    async pressKey(key: string, modifiers?: KeyModifiers): Promise<void> {
        await this.dispatchKeyEvent('keyDown', key, modifiers);
        await this.dispatchKeyEvent('keyUp', key, modifiers);
    }

    /**
     * Type text character by character
     */
    async insertText(text: string): Promise<void> {
        await this.webview.sendCommand('cdp_insert_text', { text });
    }

    // =========================================================================
    // Network Monitoring (Network Domain)
    // =========================================================================

    /**
     * Enable network monitoring
     * After enabling, you can subscribe to network events
     * Note: Uses raw CDP call, limited support on macOS
     */
    async enableNetworkMonitoring(): Promise<void> {
        try {
            await this.call('Network.enable', {});
        } catch {
            // Silently ignore if not supported
        }
    }

    /**
     * Disable network monitoring
     * Note: Uses raw CDP call, limited support on macOS
     */
    async disableNetworkMonitoring(): Promise<void> {
        try {
            await this.call('Network.disable', {});
        } catch {
            // Silently ignore if not supported
        }
    }

    // =========================================================================
    // Request Interception (Fetch Domain)
    // =========================================================================

    /**
     * Enable request interception for specified patterns
     * Note: Limited support on macOS, full support on Windows
     */
    async enableRequestInterception(patterns: RequestPattern[]): Promise<void> {
        try {
            await this.call('Fetch.enable', { patterns });
        } catch {
            // Silently ignore if not supported
        }
    }

    /**
     * Continue an intercepted request (optionally with modifications)
     */
    async continueRequest(
        requestId: string,
        overrides?: {
            url?: string;
            method?: string;
            headers?: Record<string, string>;
        }
    ): Promise<void> {
        try {
            await this.call('Fetch.continueRequest', {
                requestId,
                ...overrides
            });
        } catch {
            // Silently ignore if not supported
        }
    }

    /**
     * Fulfill an intercepted request with a custom response
     */
    async fulfillRequest(
        requestId: string,
        response: {
            status: number;
            headers?: Record<string, string>;
            body?: string;
        }
    ): Promise<void> {
        try {
            // Convert headers to CDP format (array of {name, value})
            const responseHeaders = response.headers
                ? Object.entries(response.headers).map(([name, value]) => ({ name, value }))
                : [];

            // Base64 encode the body
            const bodyBase64 = response.body
                ? Buffer.from(response.body).toString('base64')
                : '';

            await this.call('Fetch.fulfillRequest', {
                requestId,
                responseCode: response.status,
                responseHeaders,
                body: bodyBase64
            });
        } catch {
            // Silently ignore if not supported
        }
    }

    /**
     * Fail an intercepted request
     */
    async failRequest(
        requestId: string,
        reason: 'Failed' | 'Aborted' | 'TimedOut' | 'AccessDenied' | 'ConnectionClosed' |
            'ConnectionFailed' | 'ConnectionRefused' | 'ConnectionReset' |
            'InternetDisconnected' | 'NameNotResolved' | 'AddressUnreachable'
    ): Promise<void> {
        try {
            await this.call('Fetch.failRequest', {
                requestId,
                errorReason: reason
            });
        } catch {
            // Silently ignore if not supported
        }
    }

    // =========================================================================
    // High-Level Helpers
    // =========================================================================

    /**
     * Wait for network to be idle (no requests for specified duration)
     * Note: Requires network monitoring to be enabled
     */
    async waitForNetworkIdle(idleTime: number = 500): Promise<void> {
        // Implementation would track network requests
        // For now, just wait the idle time
        await new Promise(resolve => setTimeout(resolve, idleTime));
    }

    /**
     * Block URLs matching patterns
     */
    async setBlockedURLs(patterns: string[]): Promise<void> {
        await this.call('Network.setBlockedURLs', { urls: patterns });
    }

    /**
     * Set extra HTTP headers for all requests
     */
    async setExtraHTTPHeaders(headers: Record<string, string>): Promise<void> {
        await this.call('Network.setExtraHTTPHeaders', { headers });
    }

    /**
     * Emulate network conditions
     */
    async emulateNetworkConditions(options: {
        offline?: boolean;
        latency?: number;
        downloadThroughput?: number;
        uploadThroughput?: number;
    }): Promise<void> {
        await this.call('Network.emulateNetworkConditions', {
            offline: options.offline ?? false,
            latency: options.latency ?? 0,
            downloadThroughput: options.downloadThroughput ?? -1,
            uploadThroughput: options.uploadThroughput ?? -1
        });
    }

    /**
     * Clear browser cache
     */
    async clearCache(): Promise<void> {
        await this.call('Network.clearBrowserCache', {});
    }
}
