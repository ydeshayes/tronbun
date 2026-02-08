/**
 * Native notification support via FFI (compiled mode — macOS and Windows).
 *
 * Loads the platform-specific shared library from next to the executable:
 * - macOS:   libnotification.dylib (UNUserNotificationCenter via Cocoa)
 * - Windows: libnotification.dll   (Shell_NotifyIconW balloon tips)
 *
 * On macOS, the Bun process IS the CFBundleExecutable of the .app bundle,
 * so UNUserNotificationCenter uses the correct app identity automatically.
 *
 * On Windows, a background thread runs a message pump for balloon events.
 */

import { dlopen, FFIType, JSCallback, CString, ptr, suffix } from "bun:ffi";
import { resolve, dirname } from "path";

export type NotificationEventHandler = (id: string, event: string, actionIndex: number) => void;

/** Encode a JS string as a null-terminated Buffer for FFI pointer args */
function cstr(s: string): Buffer {
    return Buffer.from(s + "\0");
}

let instance: NotificationNative | null = null;

export class NotificationNative {
    private lib: ReturnType<typeof dlopen>;
    private jsCallback: JSCallback | null = null;
    private eventHandler: NotificationEventHandler | null = null;

    private constructor(dylibPath: string) {
        this.lib = dlopen(dylibPath, {
            notification_ffi_init: {
                args: [FFIType.pointer],
                returns: FFIType.i32,
            },
            notification_ffi_request_permission: {
                args: [],
                returns: FFIType.i32,
            },
            notification_ffi_show: {
                args: [FFIType.pointer, FFIType.pointer, FFIType.pointer, FFIType.i32, FFIType.i32, FFIType.pointer],
                returns: FFIType.i32,
            },
            notification_ffi_close: {
                args: [FFIType.pointer],
                returns: FFIType.i32,
            },
            notification_ffi_check_permission: {
                args: [],
                returns: FFIType.i32,
            },
            notification_ffi_cleanup: {
                args: [],
                returns: FFIType.void,
            },
        });
    }

    /**
     * Get or create the singleton instance.
     * Resolves the dylib path from the executable location.
     */
    static getInstance(): NotificationNative | null {
        if (instance) return instance;

        try {
            // In compiled mode, the dylib is next to the executable in Contents/MacOS/
            const execDir = dirname(process.execPath);
            const dylibPath = resolve(execDir, `libnotification.${suffix}`);

            instance = new NotificationNative(dylibPath);
            return instance;
        } catch (e) {
            console.error("[NotificationNative] Failed to load dylib:", e);
            return null;
        }
    }

    /**
     * Initialize with an event handler for notification interactions.
     */
    init(handler?: NotificationEventHandler): number {
        this.eventHandler = handler || null;

        if (handler) {
            // Create a threadsafe callback for C → JS event delivery
            this.jsCallback = new JSCallback(
                (idPtr: number, eventPtr: number, actionIdx: number) => {
                    if (!this.eventHandler) return;
                    // Read C strings from pointers using Bun's CString
                    const id = new CString(idPtr);
                    const event = new CString(eventPtr);
                    this.eventHandler(id.toString(), event.toString(), actionIdx);
                },
                {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.i32],
                    returns: FFIType.void,
                    threadsafe: true,
                }
            );
            return this.lib.symbols.notification_ffi_init(this.jsCallback.ptr) as number;
        }

        return this.lib.symbols.notification_ffi_init(null) as number;
    }

    requestPermission(): number {
        return this.lib.symbols.notification_ffi_request_permission() as number;
    }

    show(id: string, title: string, body: string, silent: boolean, urgency: number, actions?: string[]): number {
        const actionsJson = actions && actions.length > 0 ? JSON.stringify(actions) : "";

        // Encode strings as null-terminated buffers and pass pointers
        const idBuf = cstr(id);
        const titleBuf = cstr(title);
        const bodyBuf = cstr(body);
        const actionsBuf = cstr(actionsJson);

        return this.lib.symbols.notification_ffi_show(
            ptr(idBuf), ptr(titleBuf), ptr(bodyBuf),
            silent ? 1 : 0, urgency,
            ptr(actionsBuf)
        ) as number;
    }

    close(id: string): number {
        const idBuf = cstr(id);
        return this.lib.symbols.notification_ffi_close(ptr(idBuf)) as number;
    }

    checkPermission(): number {
        return this.lib.symbols.notification_ffi_check_permission() as number;
    }

    cleanup(): void {
        this.lib.symbols.notification_ffi_cleanup();
        if (this.jsCallback) {
            this.jsCallback.close();
            this.jsCallback = null;
        }
        this.eventHandler = null;
        instance = null;
    }
}
