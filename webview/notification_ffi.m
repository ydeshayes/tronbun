/**
 * Notification FFI Library for Bun
 *
 * Compiled as libnotification.dylib, loaded by the Bun process via bun:ffi.
 * Since the Bun binary IS the CFBundleExecutable of the .app bundle,
 * UNUserNotificationCenter uses the correct app identity automatically.
 *
 * All functions are synchronous (using dispatch_semaphore) so they can be
 * called directly from FFI without async wrappers.
 *
 * Key insight: the FFI call runs on Bun's main thread. After posting a
 * notification, we briefly pump the main CFRunLoop so that the
 * willPresentNotification delegate callback can fire — this is what tells
 * macOS to show a banner + play sound for foreground apps.
 */

#import <Cocoa/Cocoa.h>
#import <UserNotifications/UserNotifications.h>
#include <stdio.h>
#include <string.h>
#include <dispatch/dispatch.h>
#include <CoreFoundation/CoreFoundation.h>

// ============================================================================
// Types
// ============================================================================

typedef void (*notification_ffi_callback_t)(const char* id, const char* event, int action_idx);

// ============================================================================
// Delegate for handling notification events
// ============================================================================

@interface NotificationFFIDelegate : NSObject <UNUserNotificationCenterDelegate>
@property (nonatomic, assign) notification_ffi_callback_t callback;
@end

@implementation NotificationFFIDelegate

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
    if (@available(macOS 11.0, *)) {
        completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound);
    } else {
        completionHandler(UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionSound);
    }
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler {
    if (!self.callback) {
        completionHandler();
        return;
    }

    NSString* actionId = response.actionIdentifier;
    NSString* notifId = response.notification.request.identifier;
    const char* nid = [notifId UTF8String];

    if ([actionId isEqualToString:UNNotificationDefaultActionIdentifier]) {
        self.callback(nid, "click", -1);
    } else if ([actionId isEqualToString:UNNotificationDismissActionIdentifier]) {
        self.callback(nid, "close", -1);
    } else if ([actionId hasPrefix:@"action_"]) {
        int idx = [[actionId substringFromIndex:7] intValue];
        self.callback(nid, "action", idx);
    }

    completionHandler();
}

@end

// ============================================================================
// Global State
// ============================================================================

static NotificationFFIDelegate* g_delegate = nil;
static int g_initialized = 0;

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Initialize the notification system and set the event callback.
 * Must be called before any other notification_ffi_ functions.
 * @param callback Function pointer called on notification events (click/close/action).
 *                 May be NULL if events are not needed.
 * @return 0 on success
 */
int notification_ffi_init(notification_ffi_callback_t callback) {
    @autoreleasepool {
        if (g_initialized) {
            if (g_delegate) g_delegate.callback = callback;
            return 0;
        }

        g_delegate = [[NotificationFFIDelegate alloc] init];
        g_delegate.callback = callback;

        UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];
        [center setDelegate:g_delegate];

        g_initialized = 1;

        NSBundle* main = [NSBundle mainBundle];
        fprintf(stderr, "[NotifFFI] Initialized. Bundle: %s (%s)\n",
                [[main bundleIdentifier] UTF8String] ?: "(nil)",
                [[main objectForInfoDictionaryKey:@"CFBundleName"] UTF8String] ?: "(nil)");

        return 0;
    }
}

/**
 * Request notification permission from the user.
 * On macOS 15+ with ad-hoc signing, this may silently fail (returns -2).
 * The app must be registered in System Settings > Notifications for this to work.
 * @return 0 if granted, -2 if denied, -1 on error
 */
int notification_ffi_request_permission(void) {
    @autoreleasepool {
        if (!g_initialized) notification_ffi_init(NULL);

        UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];

        __block int result = -1;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);

        // First check current status
        [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* settings) {
            fprintf(stderr, "[NotifFFI] Current status: %ld\n", (long)settings.authorizationStatus);

            if (settings.authorizationStatus == UNAuthorizationStatusAuthorized) {
                result = 0;
                dispatch_semaphore_signal(sem);
                return;
            }

            if (settings.authorizationStatus == UNAuthorizationStatusDenied) {
                result = -2;
                dispatch_semaphore_signal(sem);
                return;
            }

            // Status is notDetermined - request authorization
            [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                                  completionHandler:^(BOOL granted, NSError* error) {
                if (error) {
                    fprintf(stderr, "[NotifFFI] Auth error: %s\n", [[error localizedDescription] UTF8String]);
                }
                result = granted ? 0 : -2;
                fprintf(stderr, "[NotifFFI] Authorization %s\n", granted ? "granted" : "denied");
                dispatch_semaphore_signal(sem);
            }];
        }];

        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 30LL * NSEC_PER_SEC));
        return result;
    }
}

/**
 * Show a notification.
 * @param id Unique notification identifier
 * @param title Notification title (required)
 * @param body Notification body text (may be NULL)
 * @param silent 1 to suppress sound, 0 for default sound
 * @param urgency 0=low, 1=normal, 2=critical
 * @param actions_json JSON array of action strings, e.g. '["Reply","Dismiss"]' (may be NULL)
 * @return 0 on success, -1 on error, -2 if permission denied
 */
int notification_ffi_show(const char* id, const char* title, const char* body,
                          int silent, int urgency, const char* actions_json) {
    @autoreleasepool {
        if (!g_initialized) notification_ffi_init(NULL);
        if (!id || !title) return -1;

        UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];

        UNMutableNotificationContent* content = [[UNMutableNotificationContent alloc] init];
        content.title = [NSString stringWithUTF8String:title];

        if (body && body[0] != '\0') {
            content.body = [NSString stringWithUTF8String:body];
        }

        if (!silent) {
            content.sound = (urgency == 2) ? [UNNotificationSound defaultCriticalSound]
                                           : [UNNotificationSound defaultSound];
        }

        // Parse actions from JSON
        NSString* identifier = [NSString stringWithUTF8String:id];
        if (actions_json && actions_json[0] != '\0') {
            NSData* jsonData = [[NSString stringWithUTF8String:actions_json] dataUsingEncoding:NSUTF8StringEncoding];
            NSArray* actions = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:nil];
            if ([actions isKindOfClass:[NSArray class]] && [actions count] > 0) {
                NSMutableArray<UNNotificationAction*>* actionsArr = [NSMutableArray array];
                for (NSUInteger i = 0; i < [actions count] && i < 8; i++) {
                    NSString* actionId = [NSString stringWithFormat:@"action_%lu", (unsigned long)i];
                    NSString* actionTitle = actions[i];
                    if (![actionTitle isKindOfClass:[NSString class]]) continue;
                    UNNotificationAction* action = [UNNotificationAction
                        actionWithIdentifier:actionId
                        title:actionTitle
                        options:UNNotificationActionOptionForeground];
                    [actionsArr addObject:action];
                }

                NSString* categoryId = [NSString stringWithFormat:@"tronbun_%@", identifier];
                UNNotificationCategory* category = [UNNotificationCategory
                    categoryWithIdentifier:categoryId
                    actions:actionsArr
                    intentIdentifiers:@[]
                    options:UNNotificationCategoryOptionCustomDismissAction];
                [center setNotificationCategories:[NSSet setWithObject:category]];
                content.categoryIdentifier = categoryId;
            }
        }

        // Use nil trigger for immediate delivery. The willPresentNotification
        // delegate callback will be dispatched to the main queue.
        UNNotificationRequest* request = [UNNotificationRequest
            requestWithIdentifier:identifier
            content:content
            trigger:nil];

        __block int result = -1;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);

        [center addNotificationRequest:request withCompletionHandler:^(NSError* error) {
            if (error) {
                fprintf(stderr, "[NotifFFI] Show error: %s\n", [[error localizedDescription] UTF8String]);
                result = -1;
            } else {
                fprintf(stderr, "[NotifFFI] Notification posted: %s\n", id);
                result = 0;
            }
            dispatch_semaphore_signal(sem);
        }];

        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 10LL * NSEC_PER_SEC));

        if (result == 0) {
            // Pump the main CFRunLoop so the willPresentNotification delegate
            // callback gets processed. This callback is dispatched to the main
            // queue by UNUserNotificationCenter. Since this FFI call runs on
            // Bun's main thread, CFRunLoopRunInMode processes the main run loop
            // and drains pending main queue blocks — including the delegate call
            // that tells macOS to show a banner + play sound.
            SInt32 rlResult;
            for (int i = 0; i < 10; i++) {
                rlResult = CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.1, true);
                if (rlResult == kCFRunLoopRunFinished || rlResult == kCFRunLoopRunStopped) {
                    break;
                }
            }
        }

        return result;
    }
}

/**
 * Close/dismiss a notification by ID.
 * @param id The notification identifier
 * @return 0 on success
 */
int notification_ffi_close(const char* id) {
    @autoreleasepool {
        if (!id) return -1;
        UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];
        NSString* identifier = [NSString stringWithUTF8String:id];
        [center removeDeliveredNotificationsWithIdentifiers:@[identifier]];
        [center removePendingNotificationRequestsWithIdentifiers:@[identifier]];
        return 0;
    }
}

/**
 * Check if notifications are available (authorized).
 * @return 1 if authorized, 0 if not determined, -1 if denied
 */
int notification_ffi_check_permission(void) {
    @autoreleasepool {
        if (!g_initialized) notification_ffi_init(NULL);

        UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];

        __block int result = 0;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);

        [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* settings) {
            switch (settings.authorizationStatus) {
                case UNAuthorizationStatusAuthorized:
                case UNAuthorizationStatusProvisional:
                    result = 1;
                    break;
                case UNAuthorizationStatusDenied:
                    result = -1;
                    break;
                default:
                    result = 0;
                    break;
            }
            dispatch_semaphore_signal(sem);
        }];

        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 5LL * NSEC_PER_SEC));
        return result;
    }
}

/**
 * Clean up notification system resources.
 */
void notification_ffi_cleanup(void) {
    g_delegate = nil;
    g_initialized = 0;
}
