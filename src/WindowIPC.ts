import { Window } from "./Window";
import type { WindowOptions, IPCHandler } from "./Window";
import { getWindowMetadata } from "./decorators";

/**
 * Abstract base class for creating type-safe windows with decorator-based IPC handlers
 * Similar to electron-windows-ipc-manager's WindowIPC class
 */
export abstract class WindowIPC extends Window {
  constructor(options: WindowOptions = {}) {
    super(options);
    this.setupDecoratorHandlers();

    this.initialize();
  }

  /**
   * Automatically register all methods decorated with @mainHandler
   */
  private setupDecoratorHandlers(): void {
    const metadata = getWindowMetadata(this.constructor);
    if (!metadata) {
      return;
    }

    for (const handler of metadata.handlers) {
      const method = (this as any)[handler.method];
      if (typeof method === 'function') {
        const boundMethod = method.bind(this);
        this.registerIPCHandler(handler.name, boundMethod);
      }
    }
  }

  /**
   * Get the window name from the @windowName decorator
   */
  public getWindowName(): string {
    const metadata = getWindowMetadata(this.constructor);
    return metadata?.name || 'Unknown';
  }

  /**
   * Get all handler names registered for this window
   */
  public getHandlerNames(): string[] {
    const metadata = getWindowMetadata(this.constructor);
    return metadata?.handlers.map(h => h.name) || [];
  }

  /**
   * Initialize the window with a script that sets up the type-safe IPC client with direct method access
   */
  async initialize(): Promise<void> {
    const metadata = getWindowMetadata(this.constructor);
    if (!metadata) {
      return;
    }

    // Inject initialization script that sets up the tronbun global object with direct methods
    const initScript = `
    (function() {
      window.${metadata.name} = {};
      ${metadata.handlers.map(handler => `
      window.${metadata.name}.${handler.name} = function(data) {
        return window.tronbun.invoke('${handler.name}', data);
      };`).join('')}
      }())
    `;

    await this.init(initScript);
  }
} 