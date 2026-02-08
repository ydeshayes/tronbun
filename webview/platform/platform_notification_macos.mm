/**
 * macOS desktop notification implementation (dev mode).
 *
 * Uses TronbunNotifier.app helper for showing notifications via UNUserNotificationCenter.
 * The helper is a proper .app bundle with its own bundle identifier.
 *
 * In compiled mode, notifications are handled directly by the Bun process via FFI
 * (libnotification.dylib), so this code is only used in dev mode (webview_main).
 *
 * Permission flow:
 *   1. platform_notification_init() launches helper with --init to trigger the
 *      macOS permission dialog (via `open -a` through LaunchServices).
 *   2. If permission is silently denied (ad-hoc signed apps), an NSAlert is shown
 *      guiding the user to enable notifications in System Settings.
 *   3. platform_notification_show() launches helper via NSTask to show notifications.
 */

#import <Cocoa/Cocoa.h>
#include "platform_notification.h"
#include <stdio.h>
#include <string.h>
#include <time.h>

// ============================================================================
// Global State
// ============================================================================

static notification_event_callback_t g_event_callback = NULL;
static void* g_event_userdata = NULL;
static volatile int g_initialized = 0;
static volatile int g_authorized = 0;
static volatile int g_dialog_shown = 0;    // Only show permission dialog once
static time_t g_last_permission_check = 0; // Cooldown for re-checking permission
static char g_notifier_path[4096] = "";    // Helper executable path
static char g_notifier_app[4096] = "";     // Helper .app bundle path

// ============================================================================
// Helper: Find TronbunNotifier.app paths
// ============================================================================

static int find_notifier(void) {
    @autoreleasepool {
        NSString* execPath = [[NSProcessInfo processInfo] arguments][0];
        NSString* execDir = [execPath stringByDeletingLastPathComponent];

        // Look for TronbunNotifier.app in search paths (dev mode)
        NSArray<NSString*>* searchPaths = @[
            [execDir stringByAppendingPathComponent:@"TronbunNotifier.app"],
            [[execDir stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"TronbunNotifier.app"],
            [[[execDir stringByDeletingLastPathComponent] stringByDeletingLastPathComponent] stringByAppendingPathComponent:@"TronbunNotifier.app"],
        ];

        NSFileManager* fm = [NSFileManager defaultManager];
        for (NSString* appPath in searchPaths) {
            NSString* executablePath = [appPath stringByAppendingPathComponent:@"Contents/MacOS/tronbun_notifier"];
            if ([fm isExecutableFileAtPath:executablePath]) {
                strncpy(g_notifier_path, [executablePath UTF8String], sizeof(g_notifier_path) - 1);
                strncpy(g_notifier_app, [appPath UTF8String], sizeof(g_notifier_app) - 1);
                fprintf(stderr, "[Notification] Found notifier app: %s\n", g_notifier_app);
                return 0;
            }
        }

        fprintf(stderr, "[Notification] Notifier not found in search paths\n");
        for (NSString* path in searchPaths) {
            fprintf(stderr, "[Notification]   Searched: %s\n", [path UTF8String]);
        }
        return -1;
    }
}

// ============================================================================
// Request permission via LaunchServices (open command)
// ============================================================================

static int request_permission(void) {
    @autoreleasepool {
        NSString* tmpDir = NSTemporaryDirectory();
        NSString* resultFile = [tmpDir stringByAppendingPathComponent:
            [NSString stringWithFormat:@"tronbun_auth_%d.json", getpid()]];

        NSString* appPath = [NSString stringWithUTF8String:g_notifier_app];

        NSTask* task = [[NSTask alloc] init];
        [task setLaunchPath:@"/usr/bin/open"];
        [task setArguments:@[@"-W", @"-n", @"-a", appPath, @"--args", @"--init", @"--result-file", resultFile]];

        NSPipe* stderrPipe = [NSPipe pipe];
        [task setStandardError:stderrPipe];

        NSError* launchError = nil;
        [task launchAndReturnError:&launchError];
        if (launchError) {
            fprintf(stderr, "[Notification] Failed to launch permission request: %s\n",
                    [[launchError localizedDescription] UTF8String]);
            return -1;
        }

        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
            NSData* errData = [[stderrPipe fileHandleForReading] readDataToEndOfFile];
            if ([errData length] > 0) {
                NSString* errStr = [[NSString alloc] initWithData:errData encoding:NSUTF8StringEncoding];
                fprintf(stderr, "[Notification] Permission helper stderr: %s", [errStr UTF8String]);
            }
        });

        [task waitUntilExit];

        NSData* resultData = [NSData dataWithContentsOfFile:resultFile];
        [[NSFileManager defaultManager] removeItemAtPath:resultFile error:nil];

        if (!resultData) {
            fprintf(stderr, "[Notification] No result file from permission request\n");
            return -1;
        }

        NSDictionary* result = [NSJSONSerialization JSONObjectWithData:resultData options:0 error:nil];
        if (!result) return -1;

        return [result[@"granted"] boolValue] ? 0 : -2;
    }
}

// ============================================================================
// Show notification via helper (NSTask)
// ============================================================================

static int show_via_helper(const notification_options_t* options) {
    @autoreleasepool {
        NSMutableArray<NSString*>* args = [NSMutableArray array];

        [args addObject:@"--id"];
        [args addObject:[NSString stringWithUTF8String:options->id]];
        [args addObject:@"--title"];
        [args addObject:[NSString stringWithUTF8String:options->title]];

        if (options->body[0] != '\0') {
            [args addObject:@"--body"];
            [args addObject:[NSString stringWithUTF8String:options->body]];
        }
        if (options->silent) {
            [args addObject:@"--silent"];
        }
        if (options->urgency == NOTIFICATION_URGENCY_CRITICAL) {
            [args addObject:@"--sound"];
            [args addObject:@"critical"];
        }
        for (int i = 0; i < options->action_count && i < 8; i++) {
            [args addObject:@"--action"];
            [args addObject:[NSString stringWithUTF8String:options->actions[i].text]];
        }
        if (g_event_callback) {
            [args addObject:@"--wait"];
        }

        NSTask* task = [[NSTask alloc] init];
        [task setLaunchPath:[NSString stringWithUTF8String:g_notifier_path]];
        [task setArguments:args];

        NSPipe* stdoutPipe = [NSPipe pipe];
        NSPipe* stderrPipe = [NSPipe pipe];
        [task setStandardOutput:stdoutPipe];
        [task setStandardError:stderrPipe];

        NSError* launchError = nil;
        [task launchAndReturnError:&launchError];
        if (launchError) {
            fprintf(stderr, "[Notification] Helper launch error: %s\n",
                    [[launchError localizedDescription] UTF8String]);
            return -1;
        }

        // Read stderr in background to avoid blocking
        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
            NSData* errData = [[stderrPipe fileHandleForReading] readDataToEndOfFile];
            if ([errData length] > 0) {
                NSString* errStr = [[NSString alloc] initWithData:errData encoding:NSUTF8StringEncoding];
                fprintf(stderr, "[Notification] Helper stderr: %s", [errStr UTF8String]);
            }
        });

        if (g_event_callback) {
            NSFileHandle* handle = [stdoutPipe fileHandleForReading];
            dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
                NSData* data = [handle readDataToEndOfFile];
                NSString* output = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];

                for (NSString* line in [output componentsSeparatedByString:@"\n"]) {
                    if ([line length] == 0) continue;
                    NSData* jsonData = [line dataUsingEncoding:NSUTF8StringEncoding];
                    NSDictionary* json = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:nil];
                    if (!json) continue;

                    NSString* event = json[@"event"];
                    NSString* notifId = json[@"id"];
                    if (!event || !notifId) continue;

                    if ([event isEqualToString:@"click"]) {
                        g_event_callback([notifId UTF8String], "click", -1, g_event_userdata);
                    } else if ([event isEqualToString:@"close"]) {
                        g_event_callback([notifId UTF8String], "close", -1, g_event_userdata);
                    } else if ([event isEqualToString:@"action"]) {
                        NSNumber* idx = json[@"actionIndex"];
                        g_event_callback([notifId UTF8String], "action", idx ? [idx intValue] : 0, g_event_userdata);
                    }
                }
            });
        } else {
            [task waitUntilExit];
            if ([task terminationStatus] != 0) {
                fprintf(stderr, "[Notification] Helper exited with code %d\n", [task terminationStatus]);
                return -1;
            }
        }

        fprintf(stderr, "[Notification] Shown via helper: %s\n", options->id);
        return 0;
    }
}

// ============================================================================
// Show permission prompt dialog + open System Settings
// ============================================================================

static void show_permission_dialog(void) {
    @autoreleasepool {
        NSString* appName = @"This app";

        // Read app name from helper's Info.plist
        NSString* helperPath = [NSString stringWithUTF8String:g_notifier_app];
        NSString* plistPath = [helperPath stringByAppendingPathComponent:@"Contents/Info.plist"];
        NSDictionary* plist = [NSDictionary dictionaryWithContentsOfFile:plistPath];
        NSString* name = plist[@"CFBundleDisplayName"] ?: plist[@"CFBundleName"];
        if (name && [name length] > 0) {
            appName = [name copy];
        }

        NSString* message = [[NSString stringWithFormat:
            @"%@ needs permission to show notifications.", appName] copy];

        dispatch_async(dispatch_get_main_queue(), ^{
            @autoreleasepool {
                NSAlert* alert = [[NSAlert alloc] init];
                [alert setMessageText:@"Notification Permission"];
                [alert setInformativeText:message];
                [alert setAlertStyle:NSAlertStyleInformational];
                [alert addButtonWithTitle:@"Open Settings"];
                [alert addButtonWithTitle:@"Not Now"];

                NSModalResponse response = [alert runModal];

                if (response == NSAlertFirstButtonReturn) {
                    NSURL* url = [NSURL URLWithString:
                        @"x-apple.systempreferences:com.apple.Notifications-Settings.extension"];
                    [[NSWorkspace sharedWorkspace] openURL:url];
                }
            }
        });
    }
}

// ============================================================================
// Platform API Implementation
// ============================================================================

int platform_notification_init(notification_event_callback_t callback, void* user_data) {
    if (g_initialized) {
        g_event_callback = callback;
        g_event_userdata = user_data;
        return g_authorized ? 0 : -2;
    }

    g_event_callback = callback;
    g_event_userdata = user_data;

    if (find_notifier() != 0) {
        fprintf(stderr, "[Notification] Notifier not found - notifications unavailable\n");
        g_initialized = 1;
        g_authorized = 0;
        return -1;
    }

    int result = request_permission();
    g_initialized = 1;

    g_last_permission_check = time(NULL);

    if (result == 0) {
        g_authorized = 1;
        fprintf(stderr, "[Notification] Initialized (permission granted)\n");
        return 0;
    } else if (result == -2) {
        g_authorized = 0;
        fprintf(stderr, "[Notification] Initialized (permission denied)\n");
        if (!g_dialog_shown) {
            g_dialog_shown = 1;
            fprintf(stderr, "[Notification] Showing permission prompt\n");
            show_permission_dialog();
        }
        return -2;
    } else {
        g_authorized = 0;
        fprintf(stderr, "[Notification] Initialization failed\n");
        return -1;
    }
}

int platform_notification_show(const notification_options_t* options) {
    if (!options) return -1;

    if (!g_initialized) {
        int init_result = platform_notification_init(g_event_callback, g_event_userdata);
        if (init_result != 0) return init_result;
    }

    if (!g_authorized) {
        time_t now = time(NULL);
        if (now - g_last_permission_check >= 30) {
            g_initialized = 0;
            int init_result = platform_notification_init(g_event_callback, g_event_userdata);
            if (init_result != 0) return init_result;
        } else {
            return -2;
        }
    }

    return show_via_helper(options);
}

int platform_notification_close(const char* notification_id) {
    if (!notification_id || !g_initialized) return -1;
    fprintf(stderr, "[Notification] close: %s\n", notification_id);
    return 0;
}

int platform_notification_set_icon(const char* icon_path) {
    // macOS notifications use the app bundle icon automatically.
    (void)icon_path;
    return 0;
}

int platform_notification_is_available(void) {
    return g_authorized ? 1 : 0;
}

void platform_notification_cleanup(void) {
    g_event_callback = NULL;
    g_event_userdata = NULL;
    g_initialized = 0;
    g_authorized = 0;
    g_dialog_shown = 0;
    g_last_permission_check = 0;
    g_notifier_path[0] = '\0';
    g_notifier_app[0] = '\0';
}
