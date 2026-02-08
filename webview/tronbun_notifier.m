/**
 * Tronbun Notification Helper
 *
 * A minimal Cocoa app that shows macOS notifications via UNUserNotificationCenter.
 * Built as a proper .app bundle so it has its own bundle identifier and notification
 * permissions, independent of the parent process.
 *
 * NOTE: On macOS 15+, ad-hoc signed apps cannot trigger the native permission dialog.
 * Only apps signed with an Apple Developer ID certificate (with Team ID) get the
 * native prompt. For ad-hoc builds, the parent process shows an NSAlert fallback
 * guiding the user to enable notifications in System Settings.
 *
 * Modes:
 *   --init                Request notification permission (writes result to file).
 *   --result-file <path>  JSON result path (used with --init).
 *   --id <id> --title <t> Show a notification (after permission is granted).
 *     [--body <b>] [--silent] [--sound critical] [--action <text>] [--wait]
 */

#import <Cocoa/Cocoa.h>
#import <UserNotifications/UserNotifications.h>
#include <stdio.h>
#include <string.h>
#include <getopt.h>

// ============================================================================
// Notification options (parsed from CLI args)
// ============================================================================

typedef struct {
    char* notif_id;
    char* title;
    char* body;
    int silent;
    int critical;
    int wait_for_event;
    char* actions[8];
    int action_count;
    int init_only;        // --init mode: just request permission
    char* result_file;    // --result-file: write auth result here
} NotifArgs;

// ============================================================================
// App Delegate - handles the full async lifecycle
// ============================================================================

@interface NotifierDelegate : NSObject <NSApplicationDelegate, UNUserNotificationCenterDelegate>
@property (nonatomic, assign) NotifArgs args;
@property (nonatomic, assign) BOOL eventReceived;
@property (nonatomic, assign) BOOL notificationShown;
@end

@implementation NotifierDelegate

- (void)writeResultFile:(BOOL)granted error:(NSError*)error {
    if (!self.args.result_file) return;

    NSMutableDictionary* result = [NSMutableDictionary dictionary];
    result[@"granted"] = @(granted);
    if (error) {
        result[@"error"] = [error localizedDescription];
    }

    NSData* jsonData = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    NSString* json = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    NSString* path = [NSString stringWithUTF8String:self.args.result_file];
    [json writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil];
    fprintf(stderr, "[Notifier] Wrote result to %s: %s\n", self.args.result_file, [json UTF8String]);
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    fprintf(stderr, "[Notifier] applicationDidFinishLaunching\n");

    // For --init mode, activate the app so the permission dialog gets focus
    if (self.args.init_only) {
        [NSApp activateIgnoringOtherApps:YES];
    }

    UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];
    [center setDelegate:self];

    // First check current authorization status to understand the state
    [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* settings) {
        const char* statusStr = "unknown";
        switch (settings.authorizationStatus) {
            case UNAuthorizationStatusNotDetermined: statusStr = "notDetermined"; break;
            case UNAuthorizationStatusDenied:        statusStr = "denied"; break;
            case UNAuthorizationStatusAuthorized:     statusStr = "authorized"; break;
            case UNAuthorizationStatusProvisional:    statusStr = "provisional"; break;
            default: break;
        }
        fprintf(stderr, "[Notifier] Current authorization status: %s (%ld)\n",
                statusStr, (long)settings.authorizationStatus);

        if (settings.authorizationStatus == UNAuthorizationStatusAuthorized) {
            // Already authorized - write result and proceed
            fprintf(stderr, "[Notifier] Already authorized, skipping request\n");
            [self writeResultFile:YES error:nil];
            dispatch_async(dispatch_get_main_queue(), ^{
                if (self.args.init_only) {
                    [NSApp terminate:nil];
                } else {
                    [self showNotification];
                }
            });
            return;
        }

        if (settings.authorizationStatus == UNAuthorizationStatusDenied) {
            // Already denied - return result. Parent process handles the UX
            // (shows NSAlert guiding user to System Settings).
            fprintf(stderr, "[Notifier] Already denied\n");
            [self writeResultFile:NO error:nil];
            dispatch_async(dispatch_get_main_queue(), ^{
                if (self.args.init_only) {
                    [NSApp terminate:nil];
                } else {
                    printf("{\"error\":\"Notification permission denied. Enable in System Settings > Notifications.\"}\n");
                    fflush(stdout);
                    [NSApp terminate:nil];
                }
            });
            return;
        }

        // Status is notDetermined - request authorization (should show native dialog)
        fprintf(stderr, "[Notifier] Requesting authorization (status=notDetermined)...\n");
        [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                              completionHandler:^(BOOL granted, NSError* error) {
            if (error) {
                fprintf(stderr, "[Notifier] Auth error: %s\n", [[error localizedDescription] UTF8String]);
            }
            fprintf(stderr, "[Notifier] Authorization %s\n", granted ? "granted" : "not granted");

            [self writeResultFile:granted error:error];

            dispatch_async(dispatch_get_main_queue(), ^{
                if (self.args.init_only) {
                    // Just terminate - parent process handles the UX for denied state
                    [NSApp terminate:nil];
                } else if (granted) {
                    [self showNotification];
                } else {
                    printf("{\"error\":\"Notification permission denied. Enable in System Settings > Notifications.\"}\n");
                    fflush(stdout);
                    [NSApp terminate:nil];
                }
            });
        }];
    }];
}

- (void)showNotification {
    UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];

    UNMutableNotificationContent* content = [[UNMutableNotificationContent alloc] init];
    content.title = [NSString stringWithUTF8String:self.args.title];

    if (self.args.body) {
        content.body = [NSString stringWithUTF8String:self.args.body];
    }

    if (!self.args.silent) {
        content.sound = self.args.critical ? [UNNotificationSound defaultCriticalSound]
                                           : [UNNotificationSound defaultSound];
    }

    // Add actions if any
    if (self.args.action_count > 0) {
        NSMutableArray<UNNotificationAction*>* actionsArr = [NSMutableArray array];
        for (int i = 0; i < self.args.action_count; i++) {
            NSString* actionId = [NSString stringWithFormat:@"action_%d", i];
            NSString* actionTitle = [NSString stringWithUTF8String:self.args.actions[i]];
            UNNotificationAction* action = [UNNotificationAction
                actionWithIdentifier:actionId
                title:actionTitle
                options:UNNotificationActionOptionForeground];
            [actionsArr addObject:action];
        }

        NSString* notifId = [NSString stringWithUTF8String:self.args.notif_id];
        NSString* categoryId = [NSString stringWithFormat:@"tronbun_%@", notifId];
        UNNotificationCategory* category = [UNNotificationCategory
            categoryWithIdentifier:categoryId
            actions:actionsArr
            intentIdentifiers:@[]
            options:UNNotificationCategoryOptionCustomDismissAction];
        [center setNotificationCategories:[NSSet setWithObject:category]];
        content.categoryIdentifier = categoryId;
    }

    NSString* identifier = [NSString stringWithUTF8String:self.args.notif_id];
    UNNotificationRequest* request = [UNNotificationRequest
        requestWithIdentifier:identifier
        content:content
        trigger:nil]; // nil trigger = deliver immediately

    [center addNotificationRequest:request withCompletionHandler:^(NSError* error) {
        if (error) {
            fprintf(stderr, "[Notifier] Show error: %s\n", [[error localizedDescription] UTF8String]);
            printf("{\"error\":\"%s\"}\n", [[error localizedDescription] UTF8String]);
            fflush(stdout);

            dispatch_async(dispatch_get_main_queue(), ^{
                [NSApp terminate:nil];
            });
            return;
        }

        self.notificationShown = YES;
        fprintf(stderr, "[Notifier] Notification delivered: %s\n", self.args.notif_id);
        printf("{\"success\":true,\"id\":\"%s\"}\n", self.args.notif_id);
        fflush(stdout);

        if (!self.args.wait_for_event) {
            // Exit after a brief delay to ensure notification is delivered
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)),
                           dispatch_get_main_queue(), ^{
                [NSApp terminate:nil];
            });
        } else {
            // Timeout after 5 minutes if no user interaction
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(300 * NSEC_PER_SEC)),
                           dispatch_get_main_queue(), ^{
                if (!self.eventReceived) {
                    printf("{\"event\":\"timeout\",\"id\":\"%s\"}\n", self.args.notif_id);
                    fflush(stdout);
                    [NSApp terminate:nil];
                }
            });
        }
    }];
}

// Show notification banner even when the app is in foreground
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
    if (@available(macOS 11.0, *)) {
        completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound);
    } else {
        completionHandler(UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionSound);
    }
}

// Handle user interaction with notification
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler {
    NSString* actionId = response.actionIdentifier;
    NSString* notifId = response.notification.request.identifier;

    if ([actionId isEqualToString:UNNotificationDefaultActionIdentifier]) {
        printf("{\"event\":\"click\",\"id\":\"%s\"}\n", [notifId UTF8String]);
    } else if ([actionId isEqualToString:UNNotificationDismissActionIdentifier]) {
        printf("{\"event\":\"close\",\"id\":\"%s\"}\n", [notifId UTF8String]);
    } else if ([actionId hasPrefix:@"action_"]) {
        int idx = [[actionId substringFromIndex:7] intValue];
        printf("{\"event\":\"action\",\"id\":\"%s\",\"actionIndex\":%d}\n", [notifId UTF8String], idx);
    }
    fflush(stdout);
    self.eventReceived = YES;

    completionHandler();

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        [NSApp terminate:nil];
    });
}

@end

// ============================================================================
// Main - parse args, start app with run loop
// ============================================================================

int main(int argc, char* argv[]) {
    @autoreleasepool {
        NotifArgs args = {0};

        static struct option long_options[] = {
            {"id",          required_argument, 0, 'i'},
            {"title",       required_argument, 0, 't'},
            {"body",        required_argument, 0, 'b'},
            {"silent",      no_argument,       0, 's'},
            {"sound",       required_argument, 0, 'S'},
            {"action",      required_argument, 0, 'a'},
            {"wait",        no_argument,       0, 'w'},
            {"init",        no_argument,       0, 'I'},
            {"result-file", required_argument, 0, 'R'},
            {"help",        no_argument,       0, 'h'},
            {0, 0, 0, 0}
        };

        int opt;
        while ((opt = getopt_long(argc, argv, "i:t:b:sS:a:wIR:h", long_options, NULL)) != -1) {
            switch (opt) {
                case 'i': args.notif_id = optarg; break;
                case 't': args.title = optarg; break;
                case 'b': args.body = optarg; break;
                case 's': args.silent = 1; break;
                case 'S': args.critical = (strcmp(optarg, "critical") == 0); break;
                case 'a':
                    if (args.action_count < 8) args.actions[args.action_count++] = optarg;
                    break;
                case 'w': args.wait_for_event = 1; break;
                case 'I': args.init_only = 1; break;
                case 'R': args.result_file = optarg; break;
                case 'h':
                    fprintf(stderr, "Usage: tronbun_notifier --init --result-file <path>\n");
                    fprintf(stderr, "       tronbun_notifier --id <id> --title <title> [options]\n");
                    return 0;
                default: break;
            }
        }

        if (!args.init_only && !args.title) {
            fprintf(stderr, "Error: --title is required (or use --init for permission request only)\n");
            return 1;
        }
        if (!args.notif_id) {
            args.notif_id = "tronbun_notif";
        }

        // Create the application with run loop
        [NSApplication sharedApplication];
        // For --init mode, use Regular policy so macOS shows the permission dialog.
        // Accessory apps may not get the native permission prompt on macOS 15+.
        if (args.init_only) {
            [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        } else {
            [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        }

        NotifierDelegate* delegate = [[NotifierDelegate alloc] init];
        delegate.args = args;
        [NSApp setDelegate:delegate];

        // Run the app - this starts the run loop.
        // applicationDidFinishLaunching will be called, which requests permission
        // and (if not --init) shows the notification.
        [NSApp run];

        return 0;
    }
}
