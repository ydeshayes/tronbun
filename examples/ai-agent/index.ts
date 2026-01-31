/**
 * AI Web Agent Example
 *
 * This example demonstrates using a free LLM from OpenRouter to control
 * a webview and execute tasks using the automation API.
 *
 * The agent uses DOM parsing (HTML) as the primary navigation method,
 * with screenshot as a fallback for visual verification.
 *
 * Usage:
 *   OPENROUTER_API_KEY=your_key bun run examples/ai-agent/index.ts "search for cats on google"
 *
 * Or run interactively:
 *   OPENROUTER_API_KEY=your_key bun run examples/ai-agent/index.ts
 */

import { Window, type ElementInfo } from "../../src/Window";

// OpenRouter configuration
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Free models on OpenRouter
const FREE_MODEL = "google/gemma-3-27b-it:free";

interface AgentAction {
    type: "navigate" | "click" | "type" | "scroll" | "wait" | "done" | "screenshot" | "save_image" | "download";
    selector?: string;
    text?: string;
    url?: string;
    savePath?: string;
    x?: number;
    y?: number;
    reason: string;
}

interface ParsedElement {
    tag: string;
    id?: string;
    classes?: string[];
    name?: string;
    type?: string;
    placeholder?: string;
    text?: string;
    href?: string;
    src?: string;
    alt?: string;
    role?: string;
    ariaLabel?: string;
    selector: string;
}

interface ConversationMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/**
 * Parse and filter HTML to extract only actionable elements
 */
function parseHtmlToActionableElements(html: string): ParsedElement[] {
    const elements: ParsedElement[] = [];

    // Regular expressions to extract elements
    const tagPatterns = [
        // Links
        /<a\s+([^>]*?)>([^<]*?)<\/a>/gi,
        // Buttons
        /<button\s*([^>]*?)>([^<]*?)<\/button>/gi,
        // Inputs (self-closing and not)
        /<input\s+([^>]*?)\/?>/gi,
        // Textareas
        /<textarea\s*([^>]*?)>([^<]*?)<\/textarea>/gi,
        // Select dropdowns
        /<select\s*([^>]*?)>/gi,
        // Forms
        /<form\s*([^>]*?)>/gi,
        // Headings
        /<h[1-6]\s*([^>]*?)>([^<]*?)<\/h[1-6]>/gi,
        // Clickable divs/spans with role
        /<(?:div|span)\s+([^>]*?role\s*=\s*["'](?:button|link|menuitem)[^>]*?)>([^<]*?)<\/(?:div|span)>/gi,
    ];

    // Helper to extract attribute value
    const getAttr = (attrs: string, name: string): string | undefined => {
        const match = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
        return match ? match[1] : undefined;
    };

    // Helper to build a selector
    const buildSelector = (tag: string, attrs: string): string => {
        const id = getAttr(attrs, 'id');
        if (id) return `#${id}`;

        const name = getAttr(attrs, 'name');
        if (name) return `${tag}[name="${name}"]`;

        const type = getAttr(attrs, 'type');
        const placeholder = getAttr(attrs, 'placeholder');

        if (tag === 'input' && type) {
            if (placeholder) return `input[type="${type}"][placeholder="${placeholder}"]`;
            return `input[type="${type}"]`;
        }

        const className = getAttr(attrs, 'class');
        if (className) {
            const firstClass = className.split(/\s+/)[0];
            if (firstClass && !firstClass.match(/^[0-9]/)) {
                return `${tag}.${firstClass}`;
            }
        }

        const role = getAttr(attrs, 'role');
        if (role) return `${tag}[role="${role}"]`;

        return tag;
    };

    // Process links
    const linkRegex = /<a\s+([^>]*?)>([^<]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        const attrs = match[1];
        const text = match[2].trim();
        if (text || getAttr(attrs, 'aria-label')) {
            elements.push({
                tag: 'a',
                id: getAttr(attrs, 'id'),
                href: getAttr(attrs, 'href'),
                text: text.substring(0, 50),
                ariaLabel: getAttr(attrs, 'aria-label'),
                selector: buildSelector('a', attrs)
            });
        }
    }

    // Process buttons
    const buttonRegex = /<button\s*([^>]*?)>([^<]*?)<\/button>/gi;
    while ((match = buttonRegex.exec(html)) !== null) {
        const attrs = match[1];
        const text = match[2].trim();
        elements.push({
            tag: 'button',
            id: getAttr(attrs, 'id'),
            name: getAttr(attrs, 'name'),
            type: getAttr(attrs, 'type'),
            text: text.substring(0, 50),
            ariaLabel: getAttr(attrs, 'aria-label'),
            selector: buildSelector('button', attrs)
        });
    }

    // Process inputs
    const inputRegex = /<input\s+([^>]*?)\/?>/gi;
    while ((match = inputRegex.exec(html)) !== null) {
        const attrs = match[1];
        const type = getAttr(attrs, 'type') || 'text';
        // Skip hidden inputs
        if (type === 'hidden') continue;

        elements.push({
            tag: 'input',
            id: getAttr(attrs, 'id'),
            name: getAttr(attrs, 'name'),
            type: type,
            placeholder: getAttr(attrs, 'placeholder'),
            ariaLabel: getAttr(attrs, 'aria-label'),
            selector: buildSelector('input', attrs)
        });
    }

    // Process textareas
    const textareaRegex = /<textarea\s*([^>]*?)>([^<]*?)<\/textarea>/gi;
    while ((match = textareaRegex.exec(html)) !== null) {
        const attrs = match[1];
        elements.push({
            tag: 'textarea',
            id: getAttr(attrs, 'id'),
            name: getAttr(attrs, 'name'),
            placeholder: getAttr(attrs, 'placeholder'),
            ariaLabel: getAttr(attrs, 'aria-label'),
            selector: buildSelector('textarea', attrs)
        });
    }

    // Process headings (for context)
    const headingRegex = /<h([1-6])\s*([^>]*?)>([^<]*?)<\/h[1-6]>/gi;
    while ((match = headingRegex.exec(html)) !== null) {
        const level = match[1];
        const attrs = match[2];
        const text = match[3].trim();
        if (text) {
            elements.push({
                tag: `h${level}`,
                id: getAttr(attrs, 'id'),
                text: text.substring(0, 100),
                selector: buildSelector(`h${level}`, attrs)
            });
        }
    }

    // Process images
    const imgRegex = /<img\s+([^>]*?)\/?>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
        const attrs = match[1];
        const src = getAttr(attrs, 'src');
        // Skip small icons, tracking pixels, etc.
        const width = getAttr(attrs, 'width');
        const height = getAttr(attrs, 'height');
        if (width && parseInt(width) < 50) continue;
        if (height && parseInt(height) < 50) continue;
        // Skip data URIs that are tiny
        if (src?.startsWith('data:') && src.length < 200) continue;

        elements.push({
            tag: 'img',
            id: getAttr(attrs, 'id'),
            src: src?.substring(0, 200), // Truncate long URLs
            alt: getAttr(attrs, 'alt'),
            ariaLabel: getAttr(attrs, 'aria-label'),
            selector: buildSelector('img', attrs)
        });
    }

    // Deduplicate by selector
    const seen = new Set<string>();
    return elements.filter(el => {
        if (seen.has(el.selector)) return false;
        seen.add(el.selector);
        return true;
    });
}

/**
 * Format parsed elements for LLM consumption
 */
function formatElementsForLLM(elements: ParsedElement[]): string {
    const lines: string[] = [];

    // Group by type
    const inputs = elements.filter(e => e.tag === 'input' || e.tag === 'textarea');
    const buttons = elements.filter(e => e.tag === 'button');
    const links = elements.filter(e => e.tag === 'a');
    const headings = elements.filter(e => e.tag.startsWith('h'));
    const images = elements.filter(e => e.tag === 'img');

    if (headings.length > 0) {
        lines.push("=== Page Headings ===");
        headings.slice(0, 10).forEach(h => {
            lines.push(`  [${h.tag}] "${h.text}" -> ${h.selector}`);
        });
        lines.push("");
    }

    if (inputs.length > 0) {
        lines.push("=== Input Fields ===");
        inputs.slice(0, 15).forEach(i => {
            const desc = i.placeholder || i.ariaLabel || i.name || i.type || 'text input';
            lines.push(`  [${i.tag}] ${desc} -> ${i.selector}`);
        });
        lines.push("");
    }

    if (buttons.length > 0) {
        lines.push("=== Buttons ===");
        buttons.slice(0, 15).forEach(b => {
            const desc = b.text || b.ariaLabel || b.name || 'button';
            lines.push(`  [button] "${desc}" -> ${b.selector}`);
        });
        lines.push("");
    }

    if (links.length > 0) {
        lines.push("=== Links (first 20) ===");
        links.slice(0, 20).forEach(l => {
            const desc = l.text || l.ariaLabel || l.href || 'link';
            lines.push(`  [link] "${desc}" -> ${l.selector}`);
        });
        lines.push("");
    }

    if (images.length > 0) {
        lines.push("=== Images (first 15) ===");
        images.slice(0, 15).forEach(img => {
            const desc = img.alt || img.ariaLabel || 'image';
            lines.push(`  [img] "${desc}" -> ${img.selector}`);
        });
        lines.push("");
    }

    return lines.join("\n");
}

class WebAgent {
    private window: Window;
    private apiKey: string;
    private conversation: ConversationMessage[] = [];
    private maxSteps: number = 20;
    private currentStep: number = 0;

    constructor(apiKey: string) {
        this.apiKey = apiKey;

        this.window = new Window({
            width: 1200,
            height: 800,
            title: "AI Web Agent",
            visible: true
        });
    }

    private getSystemPrompt(): string {
        // Get desktop path for the current user
        const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
        const desktopPath = `${homeDir}/Desktop`;

        return `You are a web browsing AI agent. Your task is to help users accomplish tasks on the web by analyzing page elements and taking actions.

You receive a structured list of page elements (inputs, buttons, links, headings, images) with their CSS selectors.

You can perform these actions (respond with ONLY a JSON object):

1. navigate - Go to a URL:
   {"type": "navigate", "url": "https://example.com", "reason": "explanation"}

2. click - Click an element using its selector:
   {"type": "click", "selector": "#search-btn", "reason": "explanation"}

3. type - Type text into an input field:
   {"type": "type", "selector": "input[name='q']", "text": "search query", "reason": "explanation"}

4. scroll - Scroll down the page:
   {"type": "scroll", "y": 500, "reason": "explanation"}

5. wait - Wait for page to load:
   {"type": "wait", "reason": "explanation"}

6. screenshot - Take a screenshot for visual verification:
   {"type": "screenshot", "reason": "explanation"}

7. save_image - Save an image from the page to a local file:
   {"type": "save_image", "selector": "img.result-image", "savePath": "${desktopPath}/image.png", "reason": "explanation"}

8. download - Download a file from a URL:
   {"type": "download", "url": "https://example.com/file.jpg", "savePath": "${desktopPath}/file.jpg", "reason": "explanation"}

9. done - Task is complete:
   {"type": "done", "reason": "summary of what was accomplished"}

IMPORTANT PATHS:
- User's Desktop: ${desktopPath}
- When saving files, use full absolute paths

RULES:
- Use the EXACT selectors provided in the element list
- For search: type in the search input, then click the search button
- If an element is not in the list, use scroll to reveal more content
- Respond with ONLY a valid JSON object, no other text
- After typing, usually click a submit button or press Enter via another action
- To save an image: find the image selector from the Images list, then use save_image action
- When downloading/saving files, generate a descriptive filename`;
    }

    async callLLM(userMessage: string): Promise<string> {
        if (this.conversation.length === 0) {
            this.conversation.push({
                role: "system",
                content: this.getSystemPrompt()
            });
        }

        this.conversation.push({
            role: "user",
            content: userMessage
        });

        // Keep conversation manageable (last 10 messages + system)
        if (this.conversation.length > 12) {
            this.conversation = [
                this.conversation[0],
                ...this.conversation.slice(-10)
            ];
        }

        try {
            const response = await fetch(OPENROUTER_API_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/anthropics/tronbun",
                    "X-Title": "Tronbun AI Agent"
                },
                body: JSON.stringify({
                    model: FREE_MODEL,
                    messages: this.conversation,
                    max_tokens: 500,
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
            }

            const data = await response.json();
            const assistantMessage = data.choices[0]?.message?.content || "";

            this.conversation.push({
                role: "assistant",
                content: assistantMessage
            });

            return assistantMessage;
        } catch (error) {
            console.error("LLM call failed:", error);
            throw error;
        }
    }

    parseAction(response: string): AgentAction {
        // Try to extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) {
            console.log("Could not parse action from:", response);
            return { type: "wait", reason: "Failed to parse action, waiting" };
        }

        try {
            const action = JSON.parse(jsonMatch[0]) as AgentAction;
            return action;
        } catch (e) {
            console.log("JSON parse error:", e);
            return { type: "wait", reason: "JSON parse failed, waiting" };
        }
    }

    async executeAction(action: AgentAction): Promise<boolean> {
        console.log(`\n[Step ${this.currentStep}] Action: ${action.type}`);
        console.log(`  Reason: ${action.reason}`);

        try {
            switch (action.type) {
                case "navigate":
                    if (action.url) {
                        console.log(`  Navigating to: ${action.url}`);
                        await this.window.navigate(action.url);
                        await this.sleep(2000);
                    }
                    break;

                case "click":
                    if (action.selector) {
                        console.log(`  Clicking: ${action.selector}`);
                        await this.window.automation.click(action.selector);
                        await this.sleep(1500);
                    }
                    break;

                case "type":
                    if (action.selector && action.text !== undefined) {
                        console.log(`  Typing "${action.text}" into: ${action.selector}`);
                        await this.window.automation.type(action.selector, action.text);
                        await this.sleep(500);
                    }
                    break;

                case "scroll":
                    const scrollY = action.y || 500;
                    console.log(`  Scrolling down ${scrollY}px`);
                    await this.window.automation.scrollTo(0, scrollY);
                    await this.sleep(500);
                    break;

                case "wait":
                    console.log("  Waiting for page...");
                    await this.sleep(2000);
                    break;

                case "screenshot":
                    console.log("  Taking screenshot for reference...");
                    const screenshot = await this.window.automation.screenshot();
                    console.log(`  Screenshot captured (${screenshot.length} bytes base64)`);
                    break;

                case "save_image":
                    if (action.selector && action.savePath) {
                        console.log(`  Saving image: ${action.selector} -> ${action.savePath}`);
                        await this.window.automation.saveImage(action.selector, action.savePath);
                        console.log(`  Image saved successfully!`);
                    }
                    break;

                case "download":
                    if (action.url && action.savePath) {
                        console.log(`  Downloading: ${action.url} -> ${action.savePath}`);
                        await this.window.automation.downloadFile(action.url, action.savePath);
                        console.log(`  Download completed!`);
                    }
                    break;

                case "done":
                    console.log("\n=== Task Completed ===");
                    console.log(`Result: ${action.reason}`);
                    return true;

                default:
                    console.log(`  Unknown action type: ${action.type}`);
            }
        } catch (error) {
            console.error(`  Action failed: ${error}`);
            // Provide feedback to LLM about the failure
            this.conversation.push({
                role: "user",
                content: `The action failed with error: ${error}. Please try a different approach.`
            });
        }

        return false;
    }

    async getPageState(): Promise<string> {
        const html = await this.window.automation.getHtml();
        const title = await this.window.automation.getTitle();
        const url = await this.window.automation.getUrl();

        // Parse and filter HTML to actionable elements
        const elements = parseHtmlToActionableElements(html);
        const formattedElements = formatElementsForLLM(elements);

        return `Current URL: ${url}
Page Title: ${title}

${formattedElements}

Total elements found: ${elements.length}`;
    }

    async run(task: string): Promise<void> {
        console.log("\n===========================================");
        console.log("AI Web Agent Starting");
        console.log(`Task: ${task}`);
        console.log(`Model: ${FREE_MODEL}`);
        console.log("===========================================\n");

        // Start with Google
        console.log("Starting at Google...");
        await this.window.navigate("https://www.google.com");
        await this.sleep(2000);

        // Agent loop
        while (this.currentStep < this.maxSteps) {
            this.currentStep++;

            // Get current page state using DOM parsing
            console.log(`\n[Step ${this.currentStep}] Analyzing page DOM...`);
            const pageState = await this.getPageState();
            console.log(pageState.substring(0, 500) + "...");

            // Build the message for the LLM
            const message = `Task: ${task}

${pageState}

What action should I take next? Respond with only a JSON action object.`;

            // Get action from LLM
            console.log("  Asking LLM for next action...");
            const response = await this.callLLM(message);
            console.log("  LLM response:", response);

            // Parse and execute action
            const action = this.parseAction(response);
            const isDone = await this.executeAction(action);

            if (isDone) {
                break;
            }

            // Small delay between steps
            await this.sleep(500);
        }

        if (this.currentStep >= this.maxSteps) {
            console.log("\n=== Max steps reached ===");
        }

        console.log("\nAgent finished. Window will remain open.");
        console.log("Press Ctrl+C to exit.");
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close(): Promise<void> {
        await this.window.close();
    }
}

// Interactive prompt
async function askQuestion(question: string): Promise<string> {
    process.stdout.write(question);
    const reader = Bun.stdin.stream().getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    return new TextDecoder().decode(value).trim();
}

// Main
async function main() {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.error("Error: OPENROUTER_API_KEY environment variable is required");
        console.error("\nTo get a free API key:");
        console.error("1. Go to https://openrouter.ai/");
        console.error("2. Sign up and get an API key (free tier available)");
        console.error("3. Run: OPENROUTER_API_KEY=your_key bun run examples/ai-agent/index.ts");
        process.exit(1);
    }

    // Get task from command line or ask interactively
    let task = process.argv[2];

    if (!task) {
        console.log("===========================================");
        console.log("         AI Web Agent - Tronbun");
        console.log("===========================================");
        console.log("\nExamples of tasks you can ask:");
        console.log('  - "Search for cats on Google"');
        console.log('  - "Go to wikipedia and search for TypeScript"');
        console.log('  - "Find the weather in New York"');
        console.log("");

        task = await askQuestion("Enter your task: ");

        if (!task) {
            console.log("No task provided. Exiting.");
            process.exit(0);
        }
    }

    const agent = new WebAgent(apiKey);

    try {
        await agent.run(task);

        // Keep window open
        await new Promise(() => {}); // Wait forever until Ctrl+C
    } catch (error) {
        console.error("Agent error:", error);
        await agent.close();
        process.exit(1);
    }
}

main();
