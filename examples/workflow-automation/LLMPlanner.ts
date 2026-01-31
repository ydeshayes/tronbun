/**
 * LLM Planner - Converts recorded events to workflow steps using an LLM
 */

import type {
    RecordedEvent,
    WorkflowStep,
    LLMConversationMessage,
    LLMStepGenerationResult,
    LLMSelectorRepairResult
} from "./types";
import { generateId } from "./types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const FREE_MODEL = "google/gemma-3-27b-it:free";

export class LLMPlanner {
    private apiKey: string;
    private conversation: LLMConversationMessage[] = [];

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Convert recorded events into structured workflow steps
     */
    async generateSteps(events: RecordedEvent[]): Promise<LLMStepGenerationResult> {
        if (!this.apiKey) {
            // Fallback to simple conversion without LLM
            return this.simpleConversion(events);
        }

        const systemPrompt = this.getStepGenerationSystemPrompt();
        const userPrompt = this.formatEventsForLLM(events);

        try {
            const response = await this.callLLM(systemPrompt, userPrompt);
            return this.parseStepGenerationResponse(response, events);
        } catch (error) {
            console.error("[LLMPlanner] LLM call failed, using simple conversion:", error);
            return this.simpleConversion(events);
        }
    }

    /**
     * Get suggestions for fixing a broken selector
     */
    async repairSelector(
        step: WorkflowStep,
        html: string,
        errorMessage: string
    ): Promise<LLMSelectorRepairResult> {
        if (!this.apiKey) {
            return {
                suggestedSelector: null,
                explanation: "No API key configured for LLM assistance"
            };
        }

        const systemPrompt = `You are a web automation expert. A selector failed to find an element.
Analyze the provided HTML and suggest an alternative selector.

RULES:
1. Look for elements that match the intent of the failed step
2. Prefer ID selectors > name selectors > class selectors
3. Consider that the page may have changed since recording
4. Return ONLY valid JSON

Respond with JSON:
{
    "suggestedSelector": "the new CSS selector or null if not found",
    "suggestedCoordinates": { "x": number, "y": number } (optional, if you can identify position),
    "explanation": "why this selector should work"
}`;

        const userPrompt = `Failed Step:
- Action: ${step.action}
- Original Selector: ${step.selector}
- Description: ${step.description}
- Error: ${errorMessage}

Page HTML (truncated):
${html.substring(0, 10000)}

Suggest a fix:`;

        try {
            const response = await this.callLLM(systemPrompt, userPrompt);
            return this.parseSelectorRepairResponse(response);
        } catch (error) {
            console.error("[LLMPlanner] Selector repair failed:", error);
            return {
                suggestedSelector: null,
                explanation: "LLM repair failed: " + String(error)
            };
        }
    }

    /**
     * Call the LLM API
     */
    private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
        const messages: LLMConversationMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];

        const response = await fetch(OPENROUTER_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/anthropics/tronbun",
                "X-Title": "Tronbun Workflow Automation"
            },
            body: JSON.stringify({
                model: FREE_MODEL,
                messages,
                max_tokens: 2000,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || "";
    }

    /**
     * Get the system prompt for step generation
     */
    private getStepGenerationSystemPrompt(): string {
        return `You are a workflow automation expert. Convert recorded browser events into clean, reusable workflow steps.

RULES:
1. MERGE related events (e.g., click on input + type = single "type" step)
2. IDENTIFY values that should be variables:
   - Email addresses → {{email}}
   - Passwords → {{password}}
   - Names → {{name}}
   - Phone numbers → {{phone}}
   - Search queries → {{search_term}}
   - Usernames → {{username}}
   - Custom significant values → {{input_1}}, {{input_2}}, etc.
3. Use CLEAR descriptions that explain the intent
4. PRESERVE the original selector, it's the most reliable
5. Skip redundant events (multiple inputs for the same field)
6. Skip scroll events unless they're significant (like scrolling to load more content)

Return ONLY valid JSON in this format:
{
    "steps": [
        {
            "action": "navigate|click|type|wait|scroll|press_key",
            "selector": "CSS selector or null for navigate",
            "value": "value for type/navigate actions",
            "isVariable": true/false,
            "variableName": "name without braces if isVariable",
            "description": "Human-readable description",
            "timeout": 5000
        }
    ],
    "variables": {
        "variableName": "default value"
    }
}`;
    }

    /**
     * Format recorded events for LLM consumption
     */
    private formatEventsForLLM(events: RecordedEvent[]): string {
        const formatted = events.map((e, i) => {
            const parts = [`Event ${i + 1}: ${e.type}`];
            if (e.selector) parts.push(`Selector: ${e.selector}`);
            if (e.value) parts.push(`Value: "${e.value}"`);
            if (e.url) parts.push(`URL: ${e.url}`);
            if (e.key) parts.push(`Key: ${e.key}`);
            if (e.tagName) parts.push(`Element: <${e.tagName}>`);
            if (e.textContent) parts.push(`Text: "${e.textContent.substring(0, 50)}"`);
            if (e.attributes) {
                const attrs = Object.entries(e.attributes)
                    .filter(([_, v]) => v)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(", ");
                if (attrs) parts.push(`Attributes: ${attrs}`);
            }
            return parts.join("\n  ");
        });

        return `Recorded Events (${events.length} total):\n\n${formatted.join("\n\n")}`;
    }

    /**
     * Parse the LLM response for step generation
     */
    private parseStepGenerationResponse(
        response: string,
        originalEvents: RecordedEvent[]
    ): LLMStepGenerationResult {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error("No JSON found in response");
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Validate and enhance steps
            const steps: WorkflowStep[] = (parsed.steps || []).map((s: any, i: number) => ({
                id: generateId(),
                action: s.action || "wait",
                selector: s.selector || undefined,
                value: s.value || undefined,
                url: s.action === "navigate" ? s.value : undefined,
                isVariable: s.isVariable || false,
                variableName: s.variableName || undefined,
                description: s.description || `Step ${i + 1}`,
                timeout: s.timeout || 5000,
                status: "pending"
            }));

            const variables: Record<string, string> = parsed.variables || {};

            return { steps, variables };
        } catch (error) {
            console.error("[LLMPlanner] Failed to parse LLM response:", error);
            return this.simpleConversion(originalEvents);
        }
    }

    /**
     * Parse the LLM response for selector repair
     */
    private parseSelectorRepairResponse(response: string): LLMSelectorRepairResult {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return {
                    suggestedSelector: null,
                    explanation: "Could not parse LLM response"
                };
            }

            const parsed = JSON.parse(jsonMatch[0]);
            return {
                suggestedSelector: parsed.suggestedSelector || null,
                suggestedCoordinates: parsed.suggestedCoordinates,
                explanation: parsed.explanation || "No explanation provided"
            };
        } catch (error) {
            return {
                suggestedSelector: null,
                explanation: "Failed to parse repair response: " + String(error)
            };
        }
    }

    /**
     * Simple conversion without LLM (fallback)
     */
    private simpleConversion(events: RecordedEvent[]): LLMStepGenerationResult {
        const steps: WorkflowStep[] = [];
        const variables: Record<string, string> = {};
        let inputCounter = 0;

        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const nextEvent = events[i + 1];

            switch (event.type) {
                case "navigate":
                    steps.push({
                        id: generateId(),
                        action: "navigate",
                        url: event.url,
                        description: `Navigate to ${event.url}`,
                        status: "pending"
                    });
                    break;

                case "click":
                    // Skip click if followed by input on same element (merged into type)
                    if (nextEvent?.type === "input" && nextEvent.selector === event.selector) {
                        continue;
                    }
                    steps.push({
                        id: generateId(),
                        action: "click",
                        selector: event.selector,
                        altSelectors: event.altSelectors,
                        description: `Click on ${event.textContent || event.tagName || "element"}`,
                        status: "pending"
                    });
                    break;

                case "input":
                case "change":
                    // Check if this is a significant input value
                    const { isVariable, variableName, defaultValue } = this.detectVariable(event.value || "");

                    if (isVariable && variableName) {
                        variables[variableName] = defaultValue;
                    }

                    steps.push({
                        id: generateId(),
                        action: "type",
                        selector: event.selector,
                        altSelectors: event.altSelectors,
                        value: event.value,
                        isVariable,
                        variableName: variableName || undefined,
                        description: `Type ${isVariable ? "{{" + variableName + "}}" : '"' + (event.value || "") + '"'} into ${event.attributes?.placeholder || event.tagName || "input"}`,
                        status: "pending"
                    });

                    // Skip the next event if it's a change on the same element
                    if (nextEvent?.type === "change" && nextEvent.selector === event.selector) {
                        i++;
                    }
                    break;

                case "keydown":
                    if (event.key === "Enter") {
                        steps.push({
                            id: generateId(),
                            action: "press_key",
                            selector: event.selector,
                            key: event.key,
                            description: "Press Enter to submit",
                            status: "pending"
                        });
                    }
                    break;

                case "submit":
                    // Usually handled by Enter keypress or click, skip if redundant
                    break;

                case "scroll":
                    // Only include significant scrolls
                    if (event.position && event.position.y > 500) {
                        steps.push({
                            id: generateId(),
                            action: "scroll",
                            scrollTo: event.position,
                            description: `Scroll to position (${event.position.x}, ${event.position.y})`,
                            status: "pending"
                        });
                    }
                    break;
            }
        }

        return { steps, variables };
    }

    /**
     * Detect if a value should be a variable
     */
    private detectVariable(value: string): { isVariable: boolean; variableName: string | null; defaultValue: string } {
        // Email pattern
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return { isVariable: true, variableName: "email", defaultValue: value };
        }

        // Password-like (if input type was password, the value would be masked anyway)
        // We'll mark long random-looking strings as potential passwords
        if (value.length >= 8 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value)) {
            return { isVariable: true, variableName: "password", defaultValue: value };
        }

        // Phone number
        if (/^[\d\s\-\+\(\)]{7,}$/.test(value)) {
            return { isVariable: true, variableName: "phone", defaultValue: value };
        }

        // URL
        if (/^https?:\/\//.test(value)) {
            return { isVariable: true, variableName: "url", defaultValue: value };
        }

        // For other significant inputs (more than 3 chars), make them variables
        if (value.length > 3 && !/^\d+$/.test(value)) {
            return { isVariable: true, variableName: "input", defaultValue: value };
        }

        return { isVariable: false, variableName: null, defaultValue: value };
    }
}
