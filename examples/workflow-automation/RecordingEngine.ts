/**
 * Recording Engine - Captures user interactions in the webview
 */

import type { ChildView } from "../../src/ChildView";
import type { Window } from "../../src/Window";
import type { RecordedEvent } from "./types";

/**
 * JavaScript code injected into the webview to capture events
 */
const RECORDING_SCRIPT = `
(function() {
    // Prevent double injection
    if (window.__workflowRecordingActive) return;
    window.__workflowRecordingActive = true;

    // Build a robust CSS selector for an element
    function buildSelector(el) {
        if (!el || el === document.body || el === document.documentElement) {
            return 'body';
        }

        // Try ID first (most reliable)
        if (el.id && !el.id.match(/^[0-9]/) && !el.id.includes(':')) {
            return '#' + CSS.escape(el.id);
        }

        // Try name attribute (for form elements)
        if (el.name) {
            const tag = el.tagName.toLowerCase();
            const selector = tag + '[name="' + el.name + '"]';
            if (document.querySelectorAll(selector).length === 1) {
                return selector;
            }
        }

        // Try data-testid
        if (el.dataset && el.dataset.testid) {
            return '[data-testid="' + el.dataset.testid + '"]';
        }

        // Try unique class combination
        if (el.classList && el.classList.length > 0) {
            const classes = Array.from(el.classList)
                .filter(c => !c.match(/^[0-9]/) && c.length < 50)
                .slice(0, 3);
            if (classes.length > 0) {
                const tag = el.tagName.toLowerCase();
                const selector = tag + '.' + classes.join('.');
                const matches = document.querySelectorAll(selector);
                if (matches.length === 1) {
                    return selector;
                }
                // If multiple matches, add nth-child
                const parent = el.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.children);
                    const index = siblings.indexOf(el) + 1;
                    return selector + ':nth-child(' + index + ')';
                }
            }
        }

        // Build path-based selector
        const path = [];
        let current = el;
        while (current && current !== document.body && path.length < 5) {
            let selector = current.tagName.toLowerCase();

            if (current.id && !current.id.match(/^[0-9]/)) {
                selector = '#' + CSS.escape(current.id);
                path.unshift(selector);
                break;
            }

            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                if (siblings.length > 1) {
                    const index = siblings.indexOf(current) + 1;
                    selector += ':nth-of-type(' + index + ')';
                }
            }

            path.unshift(selector);
            current = parent;
        }

        return path.join(' > ');
    }

    // Build alternative selectors for robustness
    function buildAltSelectors(el) {
        const selectors = [];

        // By aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) {
            selectors.push('[aria-label="' + ariaLabel + '"]');
        }

        // By placeholder
        const placeholder = el.getAttribute('placeholder');
        if (placeholder) {
            selectors.push('[placeholder="' + placeholder + '"]');
        }

        // By text content (for buttons/links)
        const text = el.textContent?.trim();
        if (text && text.length < 50 && (el.tagName === 'BUTTON' || el.tagName === 'A')) {
            // Can't directly select by text in CSS, but we'll store it for LLM context
        }

        // By type for inputs
        if (el.tagName === 'INPUT') {
            const type = el.type || 'text';
            selectors.push('input[type="' + type + '"]');
        }

        return selectors;
    }

    // Get element info
    function getElementInfo(el) {
        const rect = el.getBoundingClientRect();
        return {
            tagName: el.tagName.toLowerCase(),
            textContent: (el.textContent || '').trim().substring(0, 100),
            attributes: {
                id: el.id || undefined,
                class: el.className || undefined,
                name: el.name || undefined,
                type: el.type || undefined,
                placeholder: el.placeholder || undefined,
                href: el.href || undefined,
                value: el.value || undefined,
                ariaLabel: el.getAttribute('aria-label') || undefined
            },
            position: {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2)
            }
        };
    }

    // Send event to main process
    function reportEvent(eventData) {
        if (typeof tronbun !== 'undefined' && tronbun.invoke) {
            tronbun.invoke('event-recorded', eventData).catch(err => {
                console.error('[Recording] Failed to report event:', err);
            });
        }
    }

    // Track input values for change detection
    const inputValues = new WeakMap();

    // Event handlers
    function handleClick(e) {
        const el = e.target;
        if (!el || el === document.body) return;

        const info = getElementInfo(el);

        reportEvent({
            type: 'click',
            timestamp: Date.now(),
            selector: buildSelector(el),
            altSelectors: buildAltSelectors(el),
            position: info.position,
            tagName: info.tagName,
            textContent: info.textContent,
            attributes: info.attributes
        });
    }

    function handleInput(e) {
        const el = e.target;
        if (!el || !('value' in el)) return;

        // Debounce rapid input events
        clearTimeout(el.__inputTimeout);
        el.__inputTimeout = setTimeout(() => {
            const info = getElementInfo(el);

            reportEvent({
                type: 'input',
                timestamp: Date.now(),
                selector: buildSelector(el),
                altSelectors: buildAltSelectors(el),
                value: el.value,
                tagName: info.tagName,
                attributes: info.attributes
            });
        }, 300);
    }

    function handleChange(e) {
        const el = e.target;
        if (!el) return;

        const info = getElementInfo(el);
        const value = 'value' in el ? el.value : el.textContent;

        reportEvent({
            type: 'change',
            timestamp: Date.now(),
            selector: buildSelector(el),
            altSelectors: buildAltSelectors(el),
            value: value,
            tagName: info.tagName,
            attributes: info.attributes
        });
    }

    function handleSubmit(e) {
        const form = e.target;
        if (!form || form.tagName !== 'FORM') return;

        reportEvent({
            type: 'submit',
            timestamp: Date.now(),
            selector: buildSelector(form),
            altSelectors: buildAltSelectors(form),
            tagName: 'form'
        });
    }

    function handleKeydown(e) {
        // Only capture special keys (Enter, Tab, Escape, arrows)
        const specialKeys = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete'];
        if (!specialKeys.includes(e.key)) return;

        const el = e.target;
        const info = getElementInfo(el);

        reportEvent({
            type: 'keydown',
            timestamp: Date.now(),
            selector: buildSelector(el),
            key: e.key,
            tagName: info.tagName,
            attributes: info.attributes
        });
    }

    let lastScrollTime = 0;
    function handleScroll(e) {
        // Throttle scroll events
        const now = Date.now();
        if (now - lastScrollTime < 500) return;
        lastScrollTime = now;

        reportEvent({
            type: 'scroll',
            timestamp: Date.now(),
            selector: 'window',
            position: {
                x: window.scrollX,
                y: window.scrollY
            }
        });
    }

    // Monitor URL changes
    let lastUrl = window.location.href;
    function checkUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            reportEvent({
                type: 'navigate',
                timestamp: Date.now(),
                selector: '',
                url: currentUrl
            });
            lastUrl = currentUrl;
        }
    }

    // Add event listeners (capture phase for early interception)
    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleChange, true);
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('scroll', handleScroll, true);

    // Poll for URL changes (for SPA navigation)
    setInterval(checkUrlChange, 500);

    // Store cleanup function
    window.__stopWorkflowRecording = function() {
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('input', handleInput, true);
        document.removeEventListener('change', handleChange, true);
        document.removeEventListener('submit', handleSubmit, true);
        document.removeEventListener('keydown', handleKeydown, true);
        window.removeEventListener('scroll', handleScroll, true);
        window.__workflowRecordingActive = false;
    };

    console.log('[Recording] Event capture initialized');
})();
`;

export class RecordingEngine {
    private childView: ChildView | null = null;
    private mainWindow: Window | null = null;
    private events: RecordedEvent[] = [];
    private isRecording: boolean = false;
    private onEventCallback: ((event: RecordedEvent) => void) | null = null;
    private screenshotInterval: ReturnType<typeof setInterval> | null = null;
    private lastScreenshot: string | null = null;

    /**
     * Start recording events in the child view
     */
    async start(
        childView: ChildView,
        mainWindow: Window,
        onEvent?: (event: RecordedEvent) => void
    ): Promise<void> {
        if (this.isRecording) {
            throw new Error("Recording is already in progress");
        }

        this.childView = childView;
        this.mainWindow = mainWindow;
        this.events = [];
        this.isRecording = true;
        this.onEventCallback = onEvent || null;

        // Register IPC handler for recorded events
        childView.registerIPCHandler("event-recorded", async (data: RecordedEvent) => {
            await this.handleRecordedEvent(data);
            return { received: true };
        });

        // Inject the recording script
        await childView.init(RECORDING_SCRIPT);

        // Also inject into current page (init only runs on new page loads)
        await childView.eval(RECORDING_SCRIPT);

        // Start periodic screenshot capture for context
        this.screenshotInterval = setInterval(async () => {
            try {
                this.lastScreenshot = await mainWindow.automation.screenshot();
            } catch (e) {
                // Ignore screenshot errors during recording
            }
        }, 5000);

        console.log("[RecordingEngine] Recording started");
    }

    /**
     * Stop recording and return captured events
     */
    async stop(): Promise<RecordedEvent[]> {
        if (!this.isRecording || !this.childView) {
            return this.events;
        }

        // Stop the recording script in the webview
        try {
            await this.childView.eval("if (window.__stopWorkflowRecording) window.__stopWorkflowRecording();");
        } catch (e) {
            // Ignore if page changed
        }

        // Unregister IPC handler
        this.childView.unregisterIPCHandler("event-recorded");

        // Stop screenshot interval
        if (this.screenshotInterval) {
            clearInterval(this.screenshotInterval);
            this.screenshotInterval = null;
        }

        this.isRecording = false;
        console.log("[RecordingEngine] Recording stopped, captured", this.events.length, "events");

        return this.events;
    }

    /**
     * Handle a recorded event from the webview
     */
    private async handleRecordedEvent(event: RecordedEvent): Promise<void> {
        // Filter out duplicate/noisy events
        const lastEvent = this.events[this.events.length - 1];
        if (lastEvent) {
            // Skip rapid duplicate scroll events
            if (event.type === "scroll" && lastEvent.type === "scroll" &&
                event.timestamp - lastEvent.timestamp < 1000) {
                return;
            }

            // Skip input events that match a recent change event
            if (event.type === "input" && lastEvent.type === "change" &&
                event.selector === lastEvent.selector &&
                event.value === lastEvent.value) {
                return;
            }
        }

        // Attach screenshot for significant actions
        if (this.shouldCaptureScreenshot(event) && this.mainWindow) {
            try {
                event.screenshot = await this.mainWindow.automation.screenshot();
            } catch (e) {
                // Use last cached screenshot if capture fails
                if (this.lastScreenshot) {
                    event.screenshot = this.lastScreenshot;
                }
            }
        }

        this.events.push(event);

        // Notify callback
        if (this.onEventCallback) {
            this.onEventCallback(event);
        }
    }

    /**
     * Determine if we should capture a screenshot for this event
     */
    private shouldCaptureScreenshot(event: RecordedEvent): boolean {
        // Capture screenshots for clicks and form submissions
        return event.type === "click" ||
               event.type === "submit" ||
               event.type === "navigate";
    }

    /**
     * Get the current recorded events
     */
    getEvents(): RecordedEvent[] {
        return [...this.events];
    }

    /**
     * Check if recording is in progress
     */
    isActive(): boolean {
        return this.isRecording;
    }

    /**
     * Manually capture a screenshot
     */
    async captureScreenshot(): Promise<string | null> {
        if (!this.mainWindow) return null;
        try {
            return await this.mainWindow.automation.screenshot();
        } catch (e) {
            return this.lastScreenshot;
        }
    }
}
