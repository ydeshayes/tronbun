/**
 * Playback Engine - Executes workflow steps with robustness features
 */

import type { ChildView } from "../../src/ChildView";
import type { Window } from "../../src/Window";
import type { Workflow, WorkflowStep, PlaybackState, PlaybackStatus } from "./types";
import { LLMPlanner } from "./LLMPlanner";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 3000]; // Increasing delays between retries

type StateCallback = (state: PlaybackState) => void;

export class PlaybackEngine {
    private childView: ChildView | null = null;
    private mainWindow: Window | null = null;
    private workflow: Workflow | null = null;
    private variables: Record<string, string> = {};
    private llmPlanner: LLMPlanner | null = null;

    private state: PlaybackState = {
        status: "idle",
        currentStepIndex: 0,
        totalSteps: 0
    };

    private onStateChange: StateCallback | null = null;
    private pauseResolver: (() => void) | null = null;
    private userInterventionResolver: (() => void) | null = null;
    private abortController: AbortController | null = null;

    constructor(llmPlanner?: LLMPlanner) {
        this.llmPlanner = llmPlanner || null;
    }

    /**
     * Set the callback for state changes
     */
    setStateCallback(callback: StateCallback): void {
        this.onStateChange = callback;
    }

    /**
     * Get current playback state
     */
    getState(): PlaybackState {
        return { ...this.state };
    }

    /**
     * Start playback of a workflow
     */
    async play(
        childView: ChildView,
        mainWindow: Window,
        workflow: Workflow,
        variables: Record<string, string>
    ): Promise<void> {
        if (this.state.status === "playing") {
            throw new Error("Playback is already in progress");
        }

        this.childView = childView;
        this.mainWindow = mainWindow;
        this.workflow = workflow;
        this.variables = { ...workflow.variables, ...variables };
        this.abortController = new AbortController();

        // Reset step statuses
        workflow.steps.forEach(step => {
            step.status = "pending";
            step.errorMessage = undefined;
        });

        this.updateState({
            status: "playing",
            currentStepIndex: 0,
            totalSteps: workflow.steps.length
        });

        console.log("[PlaybackEngine] Starting playback of", workflow.steps.length, "steps");

        try {
            for (let i = 0; i < workflow.steps.length; i++) {
                // Check if aborted
                if (this.abortController.signal.aborted) {
                    console.log("[PlaybackEngine] Playback aborted");
                    break;
                }

                this.state.currentStepIndex = i;
                const step = workflow.steps[i];

                // Check for pause
                if (this.state.status === "paused") {
                    await this.waitForResume();
                }

                // Check for user intervention
                if (this.state.status === "waiting_user") {
                    await this.waitForUserIntervention();
                }

                // Execute step
                const success = await this.executeStepWithRetry(step);

                if (!success) {
                    // Step failed after all retries
                    step.status = "error";
                    this.notifyStateChange();

                    // Ask for user intervention
                    await this.requestUserIntervention(
                        `Step ${i + 1} failed: ${step.description}\n\n` +
                        `Please manually complete this action on the page, then click Continue.`
                    );
                }
            }

            // Playback completed
            if (!this.abortController.signal.aborted) {
                this.updateState({ status: "completed" });
                console.log("[PlaybackEngine] Playback completed successfully");
            }
        } catch (error) {
            console.error("[PlaybackEngine] Playback error:", error);
            this.updateState({
                status: "error",
                errorMessage: String(error)
            });
        }
    }

    /**
     * Pause playback
     */
    pause(): void {
        if (this.state.status === "playing") {
            this.updateState({ status: "paused" });
            console.log("[PlaybackEngine] Playback paused");
        }
    }

    /**
     * Resume playback
     */
    resume(): void {
        if (this.state.status === "paused" && this.pauseResolver) {
            this.updateState({ status: "playing" });
            this.pauseResolver();
            this.pauseResolver = null;
            console.log("[PlaybackEngine] Playback resumed");
        }
    }

    /**
     * Stop playback completely
     */
    stop(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
        if (this.pauseResolver) {
            this.pauseResolver();
            this.pauseResolver = null;
        }
        if (this.userInterventionResolver) {
            this.userInterventionResolver();
            this.userInterventionResolver = null;
        }
        this.updateState({ status: "idle" });
        console.log("[PlaybackEngine] Playback stopped");
    }

    /**
     * Signal that user has completed manual intervention
     */
    continueAfterIntervention(): void {
        if (this.state.status === "waiting_user" && this.userInterventionResolver) {
            this.userInterventionResolver();
            this.userInterventionResolver = null;
            this.updateState({ status: "playing" });
            console.log("[PlaybackEngine] Continuing after user intervention");
        }
    }

    /**
     * Retry the current step
     */
    async retryCurrent(): Promise<boolean> {
        if (!this.workflow || !this.childView) return false;

        const step = this.workflow.steps[this.state.currentStepIndex];
        if (!step) return false;

        step.status = "pending";
        step.errorMessage = undefined;
        this.notifyStateChange();

        return await this.executeStepWithRetry(step);
    }

    /**
     * Skip the current step
     */
    skipCurrent(): void {
        if (!this.workflow) return;

        const step = this.workflow.steps[this.state.currentStepIndex];
        if (step) {
            step.status = "skipped";
        }

        if (this.userInterventionResolver) {
            this.userInterventionResolver();
            this.userInterventionResolver = null;
        }

        this.updateState({ status: "playing" });
    }

    /**
     * Execute a single step with retry logic
     */
    private async executeStepWithRetry(step: WorkflowStep): Promise<boolean> {
        step.status = "running";
        this.notifyStateChange();

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`[PlaybackEngine] Executing step: ${step.description} (attempt ${attempt})`);
                await this.executeStep(step);
                step.status = "success";
                this.notifyStateChange();
                return true;
            } catch (error) {
                console.error(`[PlaybackEngine] Step failed (attempt ${attempt}):`, error);
                step.errorMessage = String(error);

                if (attempt < MAX_RETRIES) {
                    // Wait before retry
                    await this.sleep(RETRY_DELAYS[attempt - 1]);

                    // Try selector repair on failure
                    if (step.selector && this.llmPlanner && this.childView) {
                        const repaired = await this.attemptSelectorRepair(step);
                        if (repaired) {
                            console.log("[PlaybackEngine] Selector repaired, retrying...");
                        }
                    }
                }
            }
        }

        // All retries failed - take a diagnostic screenshot
        try {
            const screenshot = await this.mainWindow?.automation.screenshot();
            if (screenshot) {
                this.state.lastScreenshot = screenshot;
            }
        } catch (e) {
            // Ignore screenshot errors
        }

        return false;
    }

    /**
     * Execute a single step
     */
    private async executeStep(step: WorkflowStep): Promise<void> {
        if (!this.childView) {
            throw new Error("Child view not initialized");
        }

        // Substitute variables in value
        const value = step.isVariable && step.variableName
            ? this.variables[step.variableName] || step.value
            : step.value;

        switch (step.action) {
            case "navigate":
                if (step.url) {
                    await this.childView.navigate(step.url);
                    await this.sleep(2000); // Wait for page load
                }
                break;

            case "click":
                await this.clickElement(step.selector!);
                await this.sleep(500);
                break;

            case "type":
                await this.typeInElement(step.selector!, value || "");
                await this.sleep(300);
                break;

            case "press_key":
                await this.pressKey(step.selector!, step.key || "Enter");
                await this.sleep(500);
                break;

            case "scroll":
                if (step.scrollTo) {
                    await this.scrollTo(step.scrollTo.x, step.scrollTo.y);
                    await this.sleep(300);
                }
                break;

            case "wait":
                await this.sleep(step.timeout || 2000);
                break;

            case "screenshot":
                // Just capture for debugging
                const screenshot = await this.mainWindow?.automation.screenshot();
                if (screenshot) {
                    step.screenshot = screenshot;
                }
                break;

            default:
                console.warn(`[PlaybackEngine] Unknown action: ${step.action}`);
        }
    }

    /**
     * Click an element in the child view
     */
    private async clickElement(selector: string): Promise<void> {
        const escapedSelector = this.escapeSelector(selector);

        const result = await this.childView!.eval(`
            (function() {
                const el = document.querySelector('${escapedSelector}');
                if (!el) {
                    return { error: 'Element not found: ${escapedSelector}' };
                }

                // Scroll into view if needed
                el.scrollIntoView({ behavior: 'instant', block: 'center' });

                // Dispatch click events
                const rect = el.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;

                const mousedown = new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y
                });

                const mouseup = new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y
                });

                const click = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y
                });

                el.dispatchEvent(mousedown);
                el.dispatchEvent(mouseup);
                el.dispatchEvent(click);

                // Also try direct click for buttons
                if (typeof el.click === 'function') {
                    el.click();
                }

                return { success: true };
            })()
        `);

        if (result?.error) {
            throw new Error(result.error);
        }
    }

    /**
     * Type text into an element
     */
    private async typeInElement(selector: string, text: string): Promise<void> {
        const escapedSelector = this.escapeSelector(selector);
        const escapedText = text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");

        const result = await this.childView!.eval(`
            (function() {
                const el = document.querySelector('${escapedSelector}');
                if (!el) {
                    return { error: 'Element not found: ${escapedSelector}' };
                }

                // Focus the element
                el.focus();

                // Clear existing value
                if ('value' in el) {
                    el.value = '';
                }

                // Set new value
                if ('value' in el) {
                    el.value = '${escapedText}';
                } else if (el.isContentEditable) {
                    el.textContent = '${escapedText}';
                }

                // Dispatch events
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));

                return { success: true };
            })()
        `);

        if (result?.error) {
            throw new Error(result.error);
        }
    }

    /**
     * Press a key on an element
     */
    private async pressKey(selector: string, key: string): Promise<void> {
        const escapedSelector = this.escapeSelector(selector);

        const result = await this.childView!.eval(`
            (function() {
                const el = document.querySelector('${escapedSelector}') || document.activeElement;
                if (!el) {
                    return { error: 'No element to receive key event' };
                }

                const keydownEvent = new KeyboardEvent('keydown', {
                    key: '${key}',
                    code: '${key}',
                    bubbles: true,
                    cancelable: true
                });

                const keypressEvent = new KeyboardEvent('keypress', {
                    key: '${key}',
                    code: '${key}',
                    bubbles: true,
                    cancelable: true
                });

                const keyupEvent = new KeyboardEvent('keyup', {
                    key: '${key}',
                    code: '${key}',
                    bubbles: true,
                    cancelable: true
                });

                el.dispatchEvent(keydownEvent);
                el.dispatchEvent(keypressEvent);
                el.dispatchEvent(keyupEvent);

                // Special handling for Enter key on forms
                if ('${key}' === 'Enter') {
                    const form = el.closest('form');
                    if (form) {
                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    }
                }

                return { success: true };
            })()
        `);

        if (result?.error) {
            throw new Error(result.error);
        }
    }

    /**
     * Scroll to coordinates
     */
    private async scrollTo(x: number, y: number): Promise<void> {
        await this.childView!.eval(`window.scrollTo(${x}, ${y})`);
    }

    /**
     * Attempt to repair a broken selector using LLM
     */
    private async attemptSelectorRepair(step: WorkflowStep): Promise<boolean> {
        if (!this.llmPlanner || !this.childView || !step.selector) {
            return false;
        }

        try {
            const html = await this.childView.eval("document.body.innerHTML");

            const repair = await this.llmPlanner.repairSelector(
                step,
                html,
                step.errorMessage || "Element not found"
            );

            if (repair.suggestedSelector) {
                // Verify the suggested selector works
                const exists = await this.childView.eval(`
                    !!document.querySelector('${this.escapeSelector(repair.suggestedSelector)}')
                `);

                if (exists) {
                    console.log(`[PlaybackEngine] Selector repair: ${step.selector} -> ${repair.suggestedSelector}`);
                    step.selector = repair.suggestedSelector;
                    step.errorMessage = undefined;
                    return true;
                }
            }
        } catch (error) {
            console.error("[PlaybackEngine] Selector repair failed:", error);
        }

        return false;
    }

    /**
     * Wait for resume after pause
     */
    private waitForResume(): Promise<void> {
        return new Promise(resolve => {
            this.pauseResolver = resolve;
        });
    }

    /**
     * Request user intervention
     */
    private async requestUserIntervention(message: string): Promise<void> {
        this.updateState({
            status: "waiting_user",
            userPromptMessage: message
        });

        return new Promise(resolve => {
            this.userInterventionResolver = resolve;
        });
    }

    /**
     * Wait for user to complete intervention
     */
    private waitForUserIntervention(): Promise<void> {
        return new Promise(resolve => {
            this.userInterventionResolver = resolve;
        });
    }

    /**
     * Update state and notify callback
     */
    private updateState(updates: Partial<PlaybackState>): void {
        this.state = { ...this.state, ...updates };
        this.notifyStateChange();
    }

    /**
     * Notify state change callback
     */
    private notifyStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange(this.getState());
        }
    }

    /**
     * Escape a CSS selector for use in JavaScript string
     */
    private escapeSelector(selector: string): string {
        return selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }

    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
