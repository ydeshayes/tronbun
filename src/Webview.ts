import { spawn } from "bun";
import { dirname } from "path";
import { resolveWebviewPath } from "./utils.js";

export interface WebViewOptions {
    debug?: boolean;
    width?: number;
    height?: number;
    title?: string;
    html?: string;
    url?: string;
}  
export interface WebViewResponse {
    type: 'response' | 'bind_callback' | 'ipc:call';
    id: string;
    result?: any;
    error?: string;
    req?: any;
    seq?: string;
}

export class Webview {
    private process: any = null;
    private bindCallbacks = new Map<string, (data: any) => void>();
    private pendingCommands = new Map<string, {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
        timeout: Timer;
      }>();
    private isDestroyed = false;

    public onIPC = (channel: string, data: any) => {
        console.log('onIPC', channel, data);
    };

    constructor(options: WebViewOptions = {}) {
        // Resolve the webview executable path using cross-platform utility
        const webviewPath = resolveWebviewPath();

        this.process = spawn({
            cmd: [webviewPath],
            cwd: dirname(webviewPath),
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.startReadingResponses();

        // Handle process events
        this.process.exited.then((code: number) => {
            console.log(`WebView process exited with code: ${code}`);
            this.cleanup();
        });

        this.handleStderr();

         // Apply initial options
        if (options.title) this.setTitle(options.title);
        if (options.width && options.height) this.setSize(options.width, options.height);
        if (options.html) this.setHtml(options.html);
        else if (options.url) this.navigate(options.url);
    }

    close() {
        this.process.kill();
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
          console.debug('📤 Sending:', commandJson.trim());
          
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
                  console.log('📥 Received:', line);
                  try {
                    const response: WebViewResponse = JSON.parse(line);
                    console.log('response', response);
                    this.handleResponse(response);
                  } catch (error) {
                    console.log('📄 Raw output:', line);
                  }
                }
              }
            }
          } catch (error) {
            console.log('stdout reading ended');
          }
        };
    
        readLoop();
      }

      private async handleResponse(response: WebViewResponse) {
        console.log('pending commands', this.pendingCommands);
        const pending = this.pendingCommands.get(response.id);
        console.log('pending', response, pending);
        
        if (response.type === 'ipc:call' && response.req) {
            console.log('ipc:call', response.req);
            // TODO: Check why the structure is like this and improve it
            const payload = JSON.parse(response.req[1]);
            const data = payload.data;
            const channel = payload.channel;
            const r = await this.onIPC(channel, data);
            this.sendCommand('ipc:response', { id: response.seq, result: r }, response.seq);
        }
        
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

    // Cancel pending commands
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('WebView IPC destroyed'));
    }
    this.pendingCommands.clear();

    // Clear callbacks
    this.bindCallbacks.clear();

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

    console.log('🧹 WebView IPC cleaned up');
  }

  private async handleStderr(): Promise<void> {
    if (!this.process?.stderr) return;
    
    try {
      for await (const chunk of this.process.stderr) {
        const text = new TextDecoder().decode(chunk);
        process.stderr.write(text);
      }
    } catch (error) {
      // Process ended, ignore
    }
  }

  // === WebView API Methods ===

  async setTitle(title: string): Promise<void> {
    await this.sendCommand('set_title', { title });
  }

  async setSize(width: number, height: number, hints: number = 0): Promise<void> {
    await this.sendCommand('set_size', { width, height, hints });
  }

  async navigate(url: string): Promise<void> {
    await this.sendCommand('navigate', { url });
  }

  async setHtml(html: string): Promise<void> {
    await this.sendCommand('set_html', { html });
  }

  async eval(js: string): Promise<any> {
    return await this.sendCommand('eval', { js });
  }

  async init(js: string): Promise<void> {
    await this.sendCommand('init', { js });
  }

  async bind(name: string, callback?: (data: any) => void): Promise<void> {
    if (callback) {
      this.bindCallbacks.set(name, callback);
    }
    await this.sendCommand('bind', { name });
  }

  async unbind(name: string): Promise<void> {
    this.bindCallbacks.delete(name);
    await this.sendCommand('unbind', { name });
  }

  async terminate(): Promise<void> {
    await this.sendCommand('terminate');
  }

  async getWindow(): Promise<string> {
    return await this.sendCommand('get_window');
  }

  async getVersion(): Promise<any> {
    const result = await this.sendCommand('get_version');
    return typeof result === 'string' ? JSON.parse(result) : result;
  }
}