// Decorators and metadata system for type-safe IPC handlers
import type { WindowIPC } from "./WindowIPC";

export interface HandlerMetadata {
  name: string;
  method: string;
  hasResponseHandler?: boolean;
}

export interface WindowMetadata {
  name: string;
  handlers: HandlerMetadata[];
}

// Global registry for window metadata
const windowRegistry = new Map<Function, WindowMetadata>();

/**
 * Decorator for defining the window name
 */
export function windowName<const TName extends string>(name: TName) {
  return function <TClass extends { new (...args: any[]): WindowIPC }>(constructor: TClass) {
    const existing = windowRegistry.get(constructor) || { name: '', handlers: [] };
    existing.name = name;
    windowRegistry.set(constructor, existing);
    
    // Cast to branded type
    return constructor as TClass & { __windowName: TName };
  };
}

/**
 * Decorator for defining IPC handlers in the main process
 */
export function mainHandler<TName extends string>(name: TName) {
  return function <TKey extends string | symbol>(
    target: any, 
    propertyKey: TKey, 
    descriptor?: PropertyDescriptor
  ): void {
    const constructor = target.constructor;
    const existing = windowRegistry.get(constructor) || { name: '', handlers: [] };
    
    existing.handlers.push({
      name,
      method: propertyKey.toString(),
      hasResponseHandler: false
    });
    
    windowRegistry.set(constructor, existing);

    // Store handler name in a way TypeScript can access
    if (!target.__handlerNames) {
      target.__handlerNames = {};
    }
    target.__handlerNames[propertyKey] = name;
  };
}

/**
 * Decorator for defining response handlers (for async communication patterns)
 */
export function responseHandler<T = any>() {
  return function (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void {
    const constructor = target.constructor;
    const existing = windowRegistry.get(constructor) || { name: '', handlers: [] };
    
    // Find the corresponding handler and mark it as having a response handler
    const handlerName = propertyKey.toString().replace(/Response$/, '');
    const handler = existing.handlers.find(h => h.method === handlerName);
    if (handler) {
      handler.hasResponseHandler = true;
    }
    
    windowRegistry.set(constructor, existing);
  };
}

/**
 * Get metadata for a window class
 */
export function getWindowMetadata(constructor: Function): WindowMetadata | undefined {
  return windowRegistry.get(constructor);
}

/**
 * Get all registered window metadata
 */
export function getAllWindowMetadata(): WindowMetadata[] {
  return Array.from(windowRegistry.values());
} 