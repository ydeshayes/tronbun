import { spawn } from "bun";
import { dirname } from "path";

export interface BaseResponse {
    type: string;
    id: string;
    result?: any;
    error?: string;
    [key: string]: any;
}

export abstract class BaseProcess {
    protected process: any = null;
    protected pendingCommands = new Map<string, {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
        timeout: Timer;
    }>();
    protected isDestroyed = false;

    constructor(executablePath: string) {
        this.process = spawn({
            cmd: [executablePath],
            cwd: dirname(executablePath),
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.startReadingResponses();

        // Handle process events
        this.process.exited.then((code: number) => {
            console.log(`${this.getProcessName()} process exited with code: ${code}`);
            this.cleanup();
        });

        this.handleStderr();
    }

    /**
     * Get the name of this process type for logging purposes
     */
    protected abstract getProcessName(): string;

    /**
     * Handle specific response types - each subclass implements its own logic
     */
    protected abstract handleSpecificResponse(response: BaseResponse): Promise<void> | void;

    /**
     * Send a command to the process
     */
    async sendCommand(method: string, params: any = {}, customId?: string): Promise<any> {
        if (this.isDestroyed) {
            throw new Error(`${this.getProcessName()} process is destroyed`);
        }

        const id = customId || Date.now().toString() + Math.random().toString(36).substring(2);
        const command = { method, id, params };
    
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingCommands.delete(id);
                reject(new Error(`Command '${method}' timed out`));
            }, 5000);
    
            this.pendingCommands.set(id, { resolve, reject, timeout });
    
            const commandJson = JSON.stringify(command) + '\n';
            if (process.env.TRONBUN_DEBUG) {
                console.debug(`📤 ${this.getProcessName()} Sending:`, commandJson.trim());
            }
            
            if (this.process?.stdin) {
                this.process.stdin.write(new TextEncoder().encode(commandJson));
            }
        });
    }

    /**
     * Start reading responses from the process stdout
     */
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
                            // Only log in debug mode to improve IPC performance
                            if (process.env.TRONBUN_DEBUG) {
                                console.log(`📥 ${this.getProcessName()} Received:`, line);
                            }
                            try {
                                const response: BaseResponse = JSON.parse(line);
                                // Handle responses asynchronously but don't await to avoid blocking the read loop
                                this.handleResponse(response).catch(error => {
                                    if (process.env.TRONBUN_DEBUG) {
                                        console.error(`Error handling response:`, error);
                                    }
                                });
                            } catch (error) {
                                if (process.env.TRONBUN_DEBUG) {
                                    console.log(`📄 ${this.getProcessName()} Raw output:`, line);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.log(`${this.getProcessName()} stdout reading ended`);
            }
        };

        readLoop();
    }

    /**
     * Handle responses from the process
     */
    private async handleResponse(response: BaseResponse) {
        // Handle standard command responses first (most common case)
        const pending = this.pendingCommands.get(response.id);
        if (pending) {   
            clearTimeout(pending.timeout);
            this.pendingCommands.delete(response.id);

            if (response.error) {
                pending.reject(new Error(response.error));
            } else {
                pending.resolve(response.result);
            }
            return; // Early return to avoid calling handleSpecificResponse for standard responses
        }

        // Let subclasses handle specific response types (like IPC calls)
        await this.handleSpecificResponse(response);
    }

    /**
     * Handle stderr output from the process
     */
    private async handleStderr(): Promise<void> {
        if (!this.process?.stderr) return;
        
        try {
            for await (const chunk of this.process.stderr) {
                const text = new TextDecoder().decode(chunk);
                process.stderr.write(`[${this.getProcessName()}] ${text}`);
            }
        } catch (error) {
            // Process ended, ignore
        }
    }

    /**
     * Clean up resources and terminate the process
     */
    cleanup(): void {
        if (this.isDestroyed) return;

        this.isDestroyed = true;

        // Cancel pending commands
        for (const [id, pending] of this.pendingCommands) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(`${this.getProcessName()} process destroyed`));
        }
        this.pendingCommands.clear();

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

        console.log(`🧹 ${this.getProcessName()} cleaned up`);
    }

    /**
     * Close/terminate the process
     */
    close() {
        if (this.process) {
            this.process.kill();
        }
    }
}
