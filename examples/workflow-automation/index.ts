/**
 * Workflow Automation App
 *
 * A robust desktop app for recording, editing, and replaying web automation
 * workflows with LLM-powered step generation and variable extraction.
 *
 * Usage:
 *   OPENROUTER_API_KEY=your_key bun run examples/workflow-automation/index.ts
 *
 * Features:
 * - Record user interactions on any website
 * - LLM converts recordings to structured steps with variable extraction
 * - Edit, retry, or remove individual steps
 * - Playback with pause/resume and user intervention when stuck
 * - Save and load workflows
 */

import { Window } from "../../src/Window";
import type { ChildView } from "../../src/ChildView";
import { join } from "path";

import type { AppState, Website, Workflow, WorkflowStep, RecordedEvent, PlaybackState } from "./types";
import { generateId, createEmptyWorkflow } from "./types";
import { getControlPanelHtml, PANEL_WIDTH } from "./ui";
import { RecordingEngine } from "./RecordingEngine";
import { PlaybackEngine } from "./PlaybackEngine";
import { LLMPlanner } from "./LLMPlanner";
import { WorkflowStore } from "./WorkflowStore";

const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;
const WEBVIEW_X = PANEL_WIDTH;

class WorkflowAutomationApp {
    private window: Window;
    private childView: ChildView | null = null;

    private store: WorkflowStore;
    private recordingEngine: RecordingEngine;
    private playbackEngine: PlaybackEngine;
    private llmPlanner: LLMPlanner | null = null;

    private state: AppState;

    constructor() {
        // Initialize data store
        const dataDir = join(process.cwd(), "examples", "workflow-automation", "data");
        this.store = new WorkflowStore(dataDir);

        // Initialize engines
        this.recordingEngine = new RecordingEngine();

        // Initialize LLM planner if API key is available
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (apiKey) {
            this.llmPlanner = new LLMPlanner(apiKey);
            console.log("[App] LLM planner initialized");
        } else {
            console.log("[App] No OPENROUTER_API_KEY - using simple step conversion");
        }

        this.playbackEngine = new PlaybackEngine(this.llmPlanner || undefined);

        // Initialize state
        this.state = {
            currentWebsite: null,
            currentWorkflow: null,
            websites: this.store.loadWebsites(),
            workflows: this.store.loadWorkflows(),
            isRecording: false,
            recordedEvents: [],
            playback: {
                status: "idle",
                currentStepIndex: 0,
                totalSteps: 0
            },
            variableValues: {}
        };

        // Create the main window
        this.window = new Window({
            width: WINDOW_WIDTH,
            height: WINDOW_HEIGHT,
            title: "Workflow Automation",
            visible: true
        });

        // Set up playback state callback
        this.playbackEngine.setStateCallback((playbackState) => {
            this.state.playback = playbackState;
            this.syncUIState();
        });
    }

    /**
     * Initialize the application
     */
    async init(): Promise<void> {
        console.log("[App] Initializing...");

        // Set the control panel HTML
        await this.window.setHtml(getControlPanelHtml(this.state));

        // Create the child view for the target website
        this.childView = await this.window.createChildView({
            id: "webview",
            bounds: {
                x: WEBVIEW_X,
                y: 0,
                width: WINDOW_WIDTH - WEBVIEW_X,
                height: WINDOW_HEIGHT
            },
            html: this.getPlaceholderHtml()
        });

        // Register IPC handlers
        this.registerIPCHandlers();

        console.log("[App] Initialized successfully");
        console.log("[App] Control panel on left, webview on right");
    }

    /**
     * Register all IPC handlers for UI communication
     */
    private registerIPCHandlers(): void {
        console.log("[App] Registering IPC handlers...");

        // Website management
        this.window.registerIPCHandler("add-website", async (data) => {
            console.log("[App] IPC: add-website called with:", data);
            return this.handleAddWebsite(data);
        });

        this.window.registerIPCHandler("select-website", async (data) => {
            console.log("[App] IPC: select-website called with:", data);
            return this.handleSelectWebsite(data.websiteId);
        });

        // Recording
        this.window.registerIPCHandler("start-recording", async () => {
            return this.handleStartRecording();
        });

        this.window.registerIPCHandler("stop-recording", async () => {
            return this.handleStopRecording();
        });

        // Playback
        this.window.registerIPCHandler("start-playback", async (data) => {
            return this.handleStartPlayback(data.variables || {});
        });

        this.window.registerIPCHandler("pause-playback", async () => {
            return this.handlePausePlayback();
        });

        this.window.registerIPCHandler("continue-after-intervention", async () => {
            return this.handleContinueAfterIntervention();
        });

        // Step management
        this.window.registerIPCHandler("update-step", async (data) => {
            return this.handleUpdateStep(data.stepId, data.updates);
        });

        this.window.registerIPCHandler("delete-step", async (data) => {
            return this.handleDeleteStep(data.stepId);
        });

        this.window.registerIPCHandler("retry-step", async (data) => {
            return this.handleRetryStep(data.stepId);
        });

        // Variables
        this.window.registerIPCHandler("update-variable", async (data) => {
            this.state.variableValues[data.name] = data.value;
            return { success: true };
        });

        // Workflow management
        this.window.registerIPCHandler("save-workflow", async (data) => {
            return this.handleSaveWorkflow(data.name);
        });

        this.window.registerIPCHandler("load-workflow", async (data) => {
            return this.handleLoadWorkflow(data.workflowId);
        });

        this.window.registerIPCHandler("delete-workflow", async (data) => {
            return this.handleDeleteWorkflow(data.workflowId);
        });

        this.window.registerIPCHandler("refresh-workflows", async () => {
            this.state.workflows = this.store.loadWorkflows();
            this.syncUIState();
            return { success: true };
        });

        // Get current state (used by UI to refresh)
        this.window.registerIPCHandler("get-state", async () => {
            console.log("[App] IPC: get-state called");
            return this.getUIState();
        });
    }

    /**
     * Get the current state formatted for the UI
     */
    private getUIState(): AppState {
        return {
            ...this.state,
            recordedEvents: this.state.recordedEvents.map(e => ({
                ...e,
                screenshot: undefined
            }))
        };
    }

    /**
     * Handle adding a new website
     */
    private async handleAddWebsite(data: {
        name: string;
        url: string;
        username?: string;
        password?: string;
    }): Promise<{ success: boolean; website?: Website }> {
        console.log("[App] Adding website:", data.name, data.url);

        try {
            // Normalize URL
            let url = data.url;
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                // url = "https://" + url;
            }

            const website = this.store.addWebsite({
                name: data.name,
                url,
                username: data.username,
                password: data.password
            });

            console.log("[App] Website added with ID:", website.id);

            this.state.websites.push(website);
            this.state.currentWebsite = website;

            // Navigate to the website
            await this.navigateToWebsite(website);

            // Create a new workflow for this website
            this.state.currentWorkflow = createEmptyWorkflow("New Workflow", website.id);
            this.state.variableValues = {};

            this.syncUIState();
            console.log("[App] Website added successfully, total websites:", this.state.websites.length);
            return { success: true, website };
        } catch (error) {
            console.error("[App] Failed to add website:", error);
            return { success: false };
        }
    }

    /**
     * Handle selecting a website
     */
    private async handleSelectWebsite(websiteId: string): Promise<{ success: boolean }> {
        console.log("[App] Selecting website:", websiteId);

        if (!websiteId) {
            this.state.currentWebsite = null;
            if (this.childView) {
                await this.childView.setHtml(this.getPlaceholderHtml());
            }
            this.syncUIState();
            return { success: true };
        }

        const website = this.state.websites.find(w => w.id === websiteId);
        console.log("[App] Found websites:",  this.state.websites);
        if (!website) {
            console.error("[App] Website not found:", websiteId);
            console.log("[App] Available websites:", this.state.websites.map(w => w.id));
            return { success: false };
        }

        console.log("[App] Found website:", website.name, website.url);
        this.state.currentWebsite = website;
        await this.navigateToWebsite(website);

        // Create new workflow for this website
        this.state.currentWorkflow = createEmptyWorkflow("New Workflow", website.id);
        this.state.variableValues = {};

        this.syncUIState();
        return { success: true };
    }

    /**
     * Navigate to a website
     */
    private async navigateToWebsite(website: Website): Promise<void> {
        console.log("[App] navigateToWebsite called with:", website.name, website.url);
        console.log("[App] childView exists:", !!this.childView);

        if (!this.childView) {
            console.error("[App] Cannot navigate - child view not initialized");
            return;
        }

        try {
            console.log(`[App] Calling childView.navigate(${website.url})`);
            await this.childView.navigate(website.url);
            console.log("[App] childView.navigate completed successfully");
        } catch (error) {
            console.error("[App] childView.navigate failed:", error);
        }
    }

    /**
     * Handle starting recording
     */
    private async handleStartRecording(): Promise<{ success: boolean }> {
        if (!this.childView || !this.state.currentWebsite) {
            return { success: false };
        }

        try {
            this.state.recordedEvents = [];
            this.state.isRecording = true;

            await this.recordingEngine.start(
                this.childView,
                this.window,
                (event) => {
                    this.state.recordedEvents.push(event);
                    this.syncUIState();
                }
            );

            console.log("[App] Recording started");
            this.syncUIState();
            return { success: true };
        } catch (error) {
            console.error("[App] Failed to start recording:", error);
            return { success: false };
        }
    }

    /**
     * Handle stopping recording
     */
    private async handleStopRecording(): Promise<{ success: boolean }> {
        if (!this.state.isRecording) {
            return { success: false };
        }

        try {
            const events = await this.recordingEngine.stop();
            this.state.isRecording = false;
            this.state.recordedEvents = events;

            console.log(`[App] Recording stopped, captured ${events.length} events`);

            // Convert events to steps using LLM
            if (events.length > 0) {
                console.log("[App] Processing events with LLM...");
                const planner = this.llmPlanner || new LLMPlanner("");
                const result = await planner.generateSteps(events);

                // Create or update workflow with generated steps
                if (!this.state.currentWorkflow) {
                    this.state.currentWorkflow = createEmptyWorkflow(
                        "Recorded Workflow",
                        this.state.currentWebsite?.id || ""
                    );
                }

                this.state.currentWorkflow.steps = result.steps;
                this.state.currentWorkflow.variables = result.variables;
                this.state.variableValues = { ...result.variables };

                console.log(`[App] Generated ${result.steps.length} steps, ${Object.keys(result.variables).length} variables`);
            }

            this.syncUIState();
            return { success: true };
        } catch (error) {
            console.error("[App] Failed to stop recording:", error);
            this.state.isRecording = false;
            this.syncUIState();
            return { success: false };
        }
    }

    /**
     * Handle starting playback
     */
    private async handleStartPlayback(variables: Record<string, string>): Promise<{ success: boolean }> {
        if (!this.childView || !this.state.currentWorkflow) {
            return { success: false };
        }

        // If paused, resume instead
        if (this.state.playback.status === "paused") {
            this.playbackEngine.resume();
            return { success: true };
        }

        try {
            // Navigate to website first
            if (this.state.currentWebsite) {
                await this.navigateToWebsite(this.state.currentWebsite);
                await this.sleep(2000); // Wait for page load
            }

            // Start playback
            this.playbackEngine.play(
                this.childView,
                this.window,
                this.state.currentWorkflow,
                { ...this.state.variableValues, ...variables }
            );

            return { success: true };
        } catch (error) {
            console.error("[App] Failed to start playback:", error);
            return { success: false };
        }
    }

    /**
     * Handle pausing playback
     */
    private handlePausePlayback(): { success: boolean } {
        this.playbackEngine.pause();
        return { success: true };
    }

    /**
     * Handle continuing after user intervention
     */
    private handleContinueAfterIntervention(): { success: boolean } {
        this.playbackEngine.continueAfterIntervention();
        return { success: true };
    }

    /**
     * Handle updating a step
     */
    private handleUpdateStep(stepId: string, updates: Partial<WorkflowStep>): { success: boolean } {
        if (!this.state.currentWorkflow) {
            return { success: false };
        }

        const step = this.state.currentWorkflow.steps.find(s => s.id === stepId);
        if (!step) {
            return { success: false };
        }

        Object.assign(step, updates);

        // Update variables if variable name changed
        if (updates.isVariable && updates.variableName && updates.value) {
            this.state.currentWorkflow.variables[updates.variableName] = updates.value;
            this.state.variableValues[updates.variableName] = updates.value;
        }

        this.syncUIState();
        return { success: true };
    }

    /**
     * Handle deleting a step
     */
    private handleDeleteStep(stepId: string): { success: boolean } {
        if (!this.state.currentWorkflow) {
            return { success: false };
        }

        const index = this.state.currentWorkflow.steps.findIndex(s => s.id === stepId);
        if (index === -1) {
            return { success: false };
        }

        this.state.currentWorkflow.steps.splice(index, 1);
        this.syncUIState();
        return { success: true };
    }

    /**
     * Handle retrying a step
     */
    private async handleRetryStep(stepId: string): Promise<{ success: boolean }> {
        if (!this.state.currentWorkflow) {
            return { success: false };
        }

        const step = this.state.currentWorkflow.steps.find(s => s.id === stepId);
        if (!step) {
            return { success: false };
        }

        // If playback is waiting for user, retry current step
        if (this.state.playback.status === "waiting_user" || this.state.playback.status === "error") {
            const success = await this.playbackEngine.retryCurrent();
            return { success };
        }

        return { success: false };
    }

    /**
     * Handle saving a workflow
     */
    private handleSaveWorkflow(name: string): { success: boolean; workflow?: Workflow } {
        if (!this.state.currentWorkflow) {
            return { success: false };
        }

        try {
            this.state.currentWorkflow.name = name;
            this.state.currentWorkflow.updatedAt = new Date().toISOString();

            this.store.saveWorkflow(this.state.currentWorkflow);

            // Refresh workflows list
            this.state.workflows = this.store.loadWorkflows();

            this.syncUIState();
            return { success: true, workflow: this.state.currentWorkflow };
        } catch (error) {
            console.error("[App] Failed to save workflow:", error);
            return { success: false };
        }
    }

    /**
     * Handle loading a workflow
     */
    private async handleLoadWorkflow(workflowId: string): Promise<{ success: boolean }> {
        try {
            const workflow = this.store.loadWorkflow(workflowId);
            if (!workflow) {
                return { success: false };
            }

            this.state.currentWorkflow = workflow;
            this.state.variableValues = { ...workflow.variables };

            // Select the associated website
            const website = this.state.websites.find(w => w.id === workflow.websiteId);
            if (website) {
                this.state.currentWebsite = website;
                await this.navigateToWebsite(website);
            }

            this.syncUIState();
            return { success: true };
        } catch (error) {
            console.error("[App] Failed to load workflow:", error);
            return { success: false };
        }
    }

    /**
     * Handle deleting a workflow
     */
    private handleDeleteWorkflow(workflowId: string): { success: boolean } {
        try {
            this.store.deleteWorkflow(workflowId);

            // Clear current workflow if it's the one being deleted
            if (this.state.currentWorkflow?.id === workflowId) {
                this.state.currentWorkflow = null;
                this.state.variableValues = {};
            }

            // Refresh workflows list
            this.state.workflows = this.store.loadWorkflows();

            this.syncUIState();
            return { success: true };
        } catch (error) {
            console.error("[App] Failed to delete workflow:", error);
            return { success: false };
        }
    }

    /**
     * Sync state to UI
     */
    private syncUIState(): void {
        const uiState = this.getUIState();
        const stateJson = JSON.stringify(uiState);
        console.log(`[App] Syncing UI state (${stateJson.length} bytes, ${this.state.websites.length} websites)`);

        this.window.executeScript(`
            if (window.updateState) {
                window.updateState(${stateJson});
            } else {
                console.error('updateState not found');
            }
        `).catch(err => {
            console.error("[App] Failed to sync UI state:", err);
        });
    }

    /**
     * Get placeholder HTML for the webview
     */
    private getPlaceholderHtml(): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #888;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            text-align: center;
        }
        .content {
            padding: 40px;
        }
        .icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        h2 {
            font-size: 24px;
            font-weight: 400;
            margin: 0 0 10px 0;
            color: #e94560;
        }
        p {
            font-size: 14px;
            margin: 0;
            max-width: 300px;
        }
    </style>
</head>
<body>
    <div class="content">
        <div class="icon">🌐</div>
        <h2>Select a Website</h2>
        <p>Choose a website from the dropdown or add a new one to start automating.</p>
    </div>
</body>
</html>
        `;
    }

    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Run the application
     */
    async run(): Promise<void> {
        await this.init();

        console.log("\n========================================");
        console.log("  Workflow Automation App");
        console.log("========================================");
        console.log("\nInstructions:");
        console.log("1. Add a website using the + button");
        console.log("2. Click Record to start capturing actions");
        console.log("3. Perform actions on the website");
        console.log("4. Click Stop to generate workflow steps");
        console.log("5. Edit variables and steps as needed");
        console.log("6. Click Play to run the automation");
        console.log("7. Save your workflow for later use");
        console.log("\nPress Ctrl+C to exit.");

        // Keep the app running
        await new Promise(() => {});
    }
}

// Main entry point
async function main() {
    const app = new WorkflowAutomationApp();
    await app.run();
}

main().catch(error => {
    console.error("Application error:", error);
    process.exit(1);
});
