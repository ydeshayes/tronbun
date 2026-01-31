/**
 * TypeScript interfaces for the Workflow Automation App
 */

// ============================================================================
// Recording Types
// ============================================================================

export interface RecordedEvent {
    /** Event type */
    type: "click" | "input" | "change" | "scroll" | "navigate" | "submit" | "keydown";
    /** Timestamp when event occurred */
    timestamp: number;
    /** CSS selector for the target element */
    selector: string;
    /** Alternative selectors for robustness */
    altSelectors?: string[];
    /** Value for input/change events */
    value?: string;
    /** URL for navigate events */
    url?: string;
    /** Key for keydown events */
    key?: string;
    /** Click position */
    position?: { x: number; y: number };
    /** Screenshot at time of event (base64 PNG) */
    screenshot?: string;
    /** Element tag name */
    tagName?: string;
    /** Element text content (truncated) */
    textContent?: string;
    /** Element attributes */
    attributes?: Record<string, string>;
}

// ============================================================================
// Workflow Types
// ============================================================================

export interface WorkflowStep {
    /** Unique step ID */
    id: string;
    /** Action to perform */
    action: "navigate" | "click" | "type" | "wait" | "scroll" | "screenshot" | "press_key";
    /** CSS selector for target element */
    selector?: string;
    /** Alternative selectors */
    altSelectors?: string[];
    /** Value for type actions, or URL for navigate */
    value?: string;
    /** URL for navigate action */
    url?: string;
    /** Key for press_key action */
    key?: string;
    /** If true, value is a variable reference like {{email}} */
    isVariable?: boolean;
    /** Variable name (without braces) */
    variableName?: string;
    /** Human-readable description */
    description: string;
    /** Timeout in ms for this step */
    timeout?: number;
    /** Reference screenshot for visual verification */
    screenshot?: string;
    /** Scroll coordinates */
    scrollTo?: { x: number; y: number };
    /** Status during playback */
    status?: "pending" | "running" | "success" | "error" | "skipped";
    /** Error message if step failed */
    errorMessage?: string;
}

export interface Website {
    /** Unique website ID */
    id: string;
    /** Display name */
    name: string;
    /** Starting URL */
    url: string;
    /** Optional username for login */
    username?: string;
    /** Optional password for login */
    password?: string;
}

export interface Workflow {
    /** Unique workflow ID */
    id: string;
    /** Workflow name */
    name: string;
    /** Associated website ID */
    websiteId: string;
    /** Workflow steps */
    steps: WorkflowStep[];
    /** Variable definitions: name -> default value */
    variables: Record<string, string>;
    /** Creation timestamp */
    createdAt: string;
    /** Last update timestamp */
    updatedAt: string;
}

// ============================================================================
// Playback Types
// ============================================================================

export type PlaybackStatus = "idle" | "playing" | "paused" | "waiting_user" | "error" | "completed";

export interface PlaybackState {
    /** Current playback status */
    status: PlaybackStatus;
    /** Current step index (0-based) */
    currentStepIndex: number;
    /** Total number of steps */
    totalSteps: number;
    /** Error message if status is "error" */
    errorMessage?: string;
    /** Last captured screenshot for debugging */
    lastScreenshot?: string;
    /** Message to show user when waiting for input */
    userPromptMessage?: string;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface AppState {
    /** Currently selected website */
    currentWebsite: Website | null;
    /** Currently loaded workflow */
    currentWorkflow: Workflow | null;
    /** All registered websites */
    websites: Website[];
    /** All saved workflows */
    workflows: Workflow[];
    /** Is recording in progress */
    isRecording: boolean;
    /** Recorded events (during recording) */
    recordedEvents: RecordedEvent[];
    /** Playback state */
    playback: PlaybackState;
    /** Variable values for current playback */
    variableValues: Record<string, string>;
}

// ============================================================================
// IPC Message Types
// ============================================================================

export interface UIMessage {
    type: string;
    payload?: any;
}

export interface EventRecordedMessage {
    event: RecordedEvent;
}

export interface StepUpdateMessage {
    stepId: string;
    updates: Partial<WorkflowStep>;
}

// ============================================================================
// LLM Types
// ============================================================================

export interface LLMConversationMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface LLMStepGenerationResult {
    steps: WorkflowStep[];
    variables: Record<string, string>;
}

export interface LLMSelectorRepairResult {
    suggestedSelector: string | null;
    suggestedCoordinates?: { x: number; y: number };
    explanation: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createEmptyWorkflow(name: string, websiteId: string): Workflow {
    const now = new Date().toISOString();
    return {
        id: generateId(),
        name,
        websiteId,
        steps: [],
        variables: {},
        createdAt: now,
        updatedAt: now
    };
}

export function createStep(
    action: WorkflowStep["action"],
    description: string,
    options: Partial<WorkflowStep> = {}
): WorkflowStep {
    return {
        id: generateId(),
        action,
        description,
        status: "pending",
        ...options
    };
}
