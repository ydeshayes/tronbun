import { WindowIPC, findWebAssetPath, mainHandler, windowName } from "tronbun";
import { readdir, stat, readFile, writeFile, mkdir, unlink, rmdir } from "fs/promises";
import { join, basename, dirname, relative } from "path";
import { homedir } from "os";

// Types for file operations
interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface Model {
  id: string;
  name: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Available free models on OpenRouter
const FREE_MODELS = [
  { id: "meta-llama/llama-4-maverick:free", name: "Llama 4 Maverick" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1" },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1" },
  { id: "deepseek/deepseek-r1-distill-llama-70b:free", name: "DeepSeek R1 Distill 70B" },
  { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash" },
  { id: "qwen/qwen3-32b:free", name: "Qwen 3 32B" },
  { id: "openai/gpt-oss-120b:free", name: "openai gpt-oss-120b:free" },
  { id: "xiaomi/mimo-v2-flash:free", name: "xiaomi mimo-v2-flash:free" },
];

interface PendingPlan {
  operations: string[];
  rawResponse: string;
}

@windowName("cowork")
export class CoworkWindow extends WindowIPC {
  private workingDirectory: string = homedir();
  private chatHistory: ChatMessage[] = [];
  private apiKey: string = "";
  private selectedModel: string = FREE_MODELS[0].id;
  private pendingPlan: PendingPlan | null = null;

  constructor() {
    super({
      title: "Cowork - AI File Assistant",
      width: 1200,
      height: 800,
    });
  }

  // === API Key Management ===
  @mainHandler("setApiKey")
  async handleSetApiKey(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
  }

  @mainHandler("getApiKey")
  async handleGetApiKey(): Promise<string> {
    return this.apiKey;
  }

  // === Model Management ===
  @mainHandler("getModels")
  async handleGetModels(): Promise<Model[]> {
    return FREE_MODELS;
  }

  @mainHandler("setModel")
  async handleSetModel(modelId: string): Promise<void> {
    this.selectedModel = modelId;
  }

  @mainHandler("getSelectedModel")
  async handleGetSelectedModel(): Promise<string> {
    return this.selectedModel;
  }

  // === Directory Management ===
  @mainHandler("selectFolder")
  async handleSelectFolder(path: string): Promise<{ success: boolean; path: string }> {
    try {
      const stats = await stat(path);
      if (!stats.isDirectory()) {
        return { success: false, path: this.workingDirectory };
      }
      this.workingDirectory = path;
      return { success: true, path: this.workingDirectory };
    } catch {
      return { success: false, path: this.workingDirectory };
    }
  }

  @mainHandler("getWorkingDirectory")
  async handleGetWorkingDirectory(): Promise<string> {
    return this.workingDirectory;
  }

  @mainHandler("getHomeDirectory")
  async handleGetHomeDirectory(): Promise<string> {
    return homedir();
  }

  // === File System Operations ===
  @mainHandler("listFiles")
  async handleListFiles(path?: string): Promise<FileEntry[]> {
    const targetPath = path || this.workingDirectory;
    try {
      const entries = await readdir(targetPath, { withFileTypes: true });
      const files: FileEntry[] = [];

      for (const entry of entries) {
        // Skip hidden files
        if (entry.name.startsWith(".")) continue;

        const fullPath = join(targetPath, entry.name);
        const isDir = entry.isDirectory();

        // Only stat files (not directories) to get size - faster
        let size = 0;
        if (!isDir) {
          try {
            const stats = await stat(fullPath);
            size = stats.size;
          } catch {
            // Skip files we can't stat
          }
        }

        files.push({
          name: entry.name,
          path: fullPath,
          isDirectory: isDir,
          size,
          modified: new Date().toISOString(),
        });
      }

      // Sort: directories first, then alphabetically
      return files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error("Error listing files:", error);
      return [];
    }
  }

  @mainHandler("readFile")
  async handleReadFile(path: string): Promise<{ success: boolean; content: string; error?: string }> {
    // Security: ensure path is within working directory
    const normalizedPath = join(path);
    if (!normalizedPath.startsWith(this.workingDirectory)) {
      return { success: false, content: "", error: "Access denied: path outside working directory" };
    }

    try {
      const content = await readFile(path, "utf-8");
      return { success: true, content };
    } catch (error) {
      return { success: false, content: "", error: String(error) };
    }
  }

  @mainHandler("writeFile")
  async handleWriteFile(path: string, content: string): Promise<{ success: boolean; error?: string }> {
    // Security: ensure path is within working directory
    const normalizedPath = join(path);
    if (!normalizedPath.startsWith(this.workingDirectory)) {
      return { success: false, error: "Access denied: path outside working directory" };
    }

    try {
      // Ensure directory exists
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  @mainHandler("createFile")
  async handleCreateFile(name: string, content: string = ""): Promise<{ success: boolean; path: string; error?: string }> {
    const filePath = join(this.workingDirectory, name);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      return { success: true, path: filePath };
    } catch (error) {
      return { success: false, path: "", error: String(error) };
    }
  }

  @mainHandler("createFolder")
  async handleCreateFolder(name: string): Promise<{ success: boolean; path: string; error?: string }> {
    const folderPath = join(this.workingDirectory, name);
    try {
      await mkdir(folderPath, { recursive: true });
      return { success: true, path: folderPath };
    } catch (error) {
      return { success: false, path: "", error: String(error) };
    }
  }

  @mainHandler("deleteFile")
  async handleDeleteFile(path: string): Promise<{ success: boolean; error?: string }> {
    // Security: ensure path is within working directory
    const normalizedPath = join(path);
    if (!normalizedPath.startsWith(this.workingDirectory)) {
      return { success: false, error: "Access denied: path outside working directory" };
    }

    try {
      const stats = await stat(path);
      if (stats.isDirectory()) {
        await rmdir(path, { recursive: true });
      } else {
        await unlink(path);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  @mainHandler("getRelativePath")
  async handleGetRelativePath(path: string): Promise<string> {
    return relative(this.workingDirectory, path);
  }

  // === Chat & AI Operations ===
  @mainHandler("sendMessage")
  async handleSendMessage(message: string): Promise<{ success: boolean; response: string; error?: string }> {
    if (!this.apiKey) {
      return { success: false, response: "", error: "Please set your OpenRouter API key first" };
    }

    // Build context about current working directory
    const files = await this.handleListFiles();
    const fileList = files.map((f) => `${f.isDirectory ? "[DIR]" : "[FILE]"} ${f.name}`).join("\n");

    const systemPrompt = `You are Cowork, an AI assistant that helps users manage files in their local filesystem.

Current working directory: ${this.workingDirectory}

Files in current directory:
${fileList}

IMPORTANT: You must ALWAYS present a plan and ask for confirmation before performing any file operations.

When the user asks you to do something that involves file operations:
1. First, explain what you understand the user wants
2. Present a numbered plan of actions you will take
3. End with asking for confirmation using: [PLAN_PENDING]

Available operations (only include these AFTER user confirms with "yes", "confirm", "do it", etc.):
- [READ_FILE: filename] - Read a file's contents
- [WRITE_FILE: filename]content here[END_FILE] - Create or update a file
- [CREATE_FOLDER: foldername] - Create a new folder
- [DELETE: filename] - Delete a file or folder
- [NAVIGATE: path] - Navigate to a different directory

Example interaction:
User: "Create a hello.txt file with 'Hello World' in it"
Assistant: "I'll create a new text file for you.

**Plan:**
1. Create a new file called \`hello.txt\`
2. Write "Hello World" as the content

Would you like me to proceed with this plan?
[PLAN_PENDING]"

User: "yes"
Assistant: "Creating the file now.
[WRITE_FILE: hello.txt]
Hello World
[END_FILE]"

If the user just wants information or to chat, respond normally without any operation tags.
If the user confirms a plan (says yes, confirm, go ahead, do it, etc.), execute the operations immediately.`;

    // Add user message to history
    this.chatHistory.push({ role: "user", content: message });

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/tronbun/cowork",
          "X-Title": "Cowork Desktop App",
        },
        body: JSON.stringify({
          model: this.selectedModel,
          messages: [{ role: "system", content: systemPrompt }, ...this.chatHistory],
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, response: "", error: `API error: ${response.status} - ${errorText}` };
      }

      const data = (await response.json()) as OpenRouterResponse;
      const assistantMessage = data.choices[0]?.message?.content || "No response received";

      // Add assistant response to history
      this.chatHistory.push({ role: "assistant", content: assistantMessage });

      // Check if this is a plan pending confirmation
      if (assistantMessage.includes("[PLAN_PENDING]")) {
        // Extract the operations from the message for later execution
        const operations = this.extractOperations(assistantMessage);
        if (operations.length > 0) {
          this.pendingPlan = { operations, rawResponse: assistantMessage };
        }
        // Return message without the [PLAN_PENDING] tag
        const cleanResponse = assistantMessage.replace(/\[PLAN_PENDING\]/g, "").trim();
        return { success: true, response: cleanResponse };
      }

      // Check if user is confirming a pending plan
      const confirmPatterns = /^(yes|yeah|yep|confirm|go ahead|do it|proceed|ok|okay|sure|execute|run it|approved)\.?$/i;
      if (this.pendingPlan && confirmPatterns.test(message.trim())) {
        // Execute the pending plan
        const processedResponse = await this.processAICommands(this.pendingPlan.rawResponse);
        this.pendingPlan = null;
        return { success: true, response: processedResponse };
      }

      // Process any file operation commands in the response (for direct execution after confirmation)
      const processedResponse = await this.processAICommands(assistantMessage);

      return { success: true, response: processedResponse };
    } catch (error) {
      return { success: false, response: "", error: String(error) };
    }
  }

  private async processAICommands(response: string): Promise<string> {
    let result = response;
    const operations: string[] = [];

    // Process READ_FILE commands
    const readMatch = response.match(/\[READ_FILE:\s*([^\]]+)\]/g);
    if (readMatch) {
      for (const match of readMatch) {
        const filename = match.replace(/\[READ_FILE:\s*/, "").replace(/\]$/, "").trim();
        const filePath = join(this.workingDirectory, filename);
        const readResult = await this.handleReadFile(filePath);
        if (readResult.success) {
          operations.push(`Read ${filename}:\n\`\`\`\n${readResult.content.slice(0, 2000)}${readResult.content.length > 2000 ? "\n... (truncated)" : ""}\n\`\`\``);
        } else {
          operations.push(`Failed to read ${filename}: ${readResult.error}`);
        }
      }
    }

    // Process WRITE_FILE commands
    const writeRegex = /\[WRITE_FILE:\s*([^\]]+)\]([\s\S]*?)\[END_FILE\]/g;
    let writeMatch;
    while ((writeMatch = writeRegex.exec(response)) !== null) {
      const filename = writeMatch[1].trim();
      const content = writeMatch[2].trim();
      const filePath = join(this.workingDirectory, filename);
      const writeResult = await this.handleWriteFile(filePath, content);
      if (writeResult.success) {
        operations.push(`Created/updated file: ${filename}`);
      } else {
        operations.push(`Failed to write ${filename}: ${writeResult.error}`);
      }
    }

    // Process CREATE_FOLDER commands
    const folderMatch = response.match(/\[CREATE_FOLDER:\s*([^\]]+)\]/g);
    if (folderMatch) {
      for (const match of folderMatch) {
        const foldername = match.replace(/\[CREATE_FOLDER:\s*/, "").replace(/\]$/, "").trim();
        const createResult = await this.handleCreateFolder(foldername);
        if (createResult.success) {
          operations.push(`Created folder: ${foldername}`);
        } else {
          operations.push(`Failed to create folder ${foldername}: ${createResult.error}`);
        }
      }
    }

    // Process DELETE commands
    const deleteMatch = response.match(/\[DELETE:\s*([^\]]+)\]/g);
    if (deleteMatch) {
      for (const match of deleteMatch) {
        const filename = match.replace(/\[DELETE:\s*/, "").replace(/\]$/, "").trim();
        const filePath = join(this.workingDirectory, filename);
        const deleteResult = await this.handleDeleteFile(filePath);
        if (deleteResult.success) {
          operations.push(`Deleted: ${filename}`);
        } else {
          operations.push(`Failed to delete ${filename}: ${deleteResult.error}`);
        }
      }
    }

    // Process NAVIGATE commands
    const navMatch = response.match(/\[NAVIGATE:\s*([^\]]+)\]/g);
    if (navMatch) {
      for (const match of navMatch) {
        let path = match.replace(/\[NAVIGATE:\s*/, "").replace(/\]$/, "").trim();
        // Handle relative paths
        if (!path.startsWith("/")) {
          path = join(this.workingDirectory, path);
        }
        const selectResult = await this.handleSelectFolder(path);
        if (selectResult.success) {
          operations.push(`Navigated to: ${path}`);
        } else {
          operations.push(`Failed to navigate to ${path}`);
        }
      }
    }

    if (operations.length > 0) {
      result += "\n\n---\n**Operations performed:**\n" + operations.join("\n");
    }

    return result;
  }

  @mainHandler("clearChat")
  async handleClearChat(): Promise<void> {
    this.chatHistory = [];
    this.pendingPlan = null;
  }

  @mainHandler("hasPendingPlan")
  async handleHasPendingPlan(): Promise<boolean> {
    return this.pendingPlan !== null;
  }

  @mainHandler("cancelPlan")
  async handleCancelPlan(): Promise<void> {
    this.pendingPlan = null;
  }

  private extractOperations(response: string): string[] {
    const operations: string[] = [];

    // Check for various operation patterns
    if (response.match(/\[READ_FILE:\s*[^\]]+\]/)) operations.push("read");
    if (response.match(/\[WRITE_FILE:\s*[^\]]+\]/)) operations.push("write");
    if (response.match(/\[CREATE_FOLDER:\s*[^\]]+\]/)) operations.push("create_folder");
    if (response.match(/\[DELETE:\s*[^\]]+\]/)) operations.push("delete");
    if (response.match(/\[NAVIGATE:\s*[^\]]+\]/)) operations.push("navigate");

    return operations;
  }

  @mainHandler("getChatHistory")
  async handleGetChatHistory(): Promise<ChatMessage[]> {
    return this.chatHistory;
  }
}

// Create and launch the window
const coworkWindow = new CoworkWindow();

const webAssetsPath = findWebAssetPath("index.html", __dirname);

if (!webAssetsPath) {
  throw new Error("Could not find web assets. Make sure the dist/web/index.html file exists.");
}

console.log("Cowork - AI File Assistant");
console.log("Loading web assets from:", webAssetsPath);
await coworkWindow.navigate(`file://${webAssetsPath}`);
