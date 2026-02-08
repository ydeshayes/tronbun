/**
 * Native notification support via FFI (compiled mode — macOS and Windows).
 *
 * Loads the platform-specific shared library:
 * - macOS:   libnotification.dylib from Contents/MacOS/ (UNUserNotificationCenter via Cocoa)
 * - Windows: libnotification.dll embedded in the executable at compile time,
 *            extracted to a temp file at runtime and loaded via FFI.
 *
 * On macOS, the Bun process IS the CFBundleExecutable of the .app bundle,
 * so UNUserNotificationCenter uses the correct app identity automatically.
 *
 * On Windows, the DLL is embedded as base64 in a global variable during
 * compilation, eliminating the need for an external DLL file next to the exe.
 * A background thread runs a message pump for balloon events.
 */

import { dlopen, FFIType, JSCallback, CString, ptr, suffix } from "bun:ffi";
import { resolve, dirname, join } from "path";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";

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
            notification_ffi_set_icon: {
                args: [FFIType.pointer],
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
     * Resolves the dylib path from the executable location, or extracts
     * an embedded DLL from the compiled executable on Windows.
     */
    static getInstance(): NotificationNative | null {
        if (instance) return instance;

        try {
            let dylibPath: string;

            // Check for embedded DLL data (Windows compiled mode).
            // The compile step base64-encodes libnotification.dll and stores it
            // in a global so we don't need an external DLL file next to the exe.
            const embeddedBase64 = (globalThis as any).__TRONBUN_NOTIFICATION_DLL_BASE64__;
            if (embeddedBase64 && process.platform === 'win32') {
                // Extract embedded DLL to temp directory so we can load it via FFI
                const tempDllPath = join(tmpdir(), `tronbun-libnotification-${process.pid}.dll`);
                const dllBytes = Buffer.from(embeddedBase64, 'base64');
                writeFileSync(tempDllPath, dllBytes);
                dylibPath = tempDllPath;

                // Attempt to clean up temp DLL on process exit
                // (may fail on Windows if the DLL is still loaded, which is fine —
                // the OS temp directory gets cleaned up periodically)
                process.on('exit', () => {
                    try { unlinkSync(tempDllPath); } catch {}
                });
            } else {
                // macOS: dylib is next to the executable in Contents/MacOS/
                // Dev mode: dylib is next to the executable in webview/build/
                const execDir = dirname(process.execPath);
                dylibPath = resolve(execDir, `libnotification.${suffix}`);
            }

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

    /**
     * Set the icon used by the notification system's tray icon.
     * @param iconPath Path to the .ico file
     * @returns 0 on success, -1 on failure
     */
    setIcon(iconPath: string): number {
        const pathBuf = cstr(iconPath);
        return this.lib.symbols.notification_ffi_set_icon(ptr(pathBuf)) as number;
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
