/**
 * macOS file dialog implementation using NSOpenPanel/NSSavePanel
 */

#ifdef __APPLE__

#import "platform_file_dialog.h"
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

// Helper to parse filter JSON and apply to panel
static void apply_filters_to_panel(NSSavePanel* panel, const char* filters_json) {
    if (!filters_json) return;

    NSData* data = [[NSString stringWithUTF8String:filters_json] dataUsingEncoding:NSUTF8StringEncoding];
    if (!data) return;

    NSError* error = nil;
    NSArray* filters = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
    if (error || ![filters isKindOfClass:[NSArray class]]) return;

    NSMutableArray<NSString*>* allowedTypes = [NSMutableArray array];

    for (NSDictionary* filter in filters) {
        if (![filter isKindOfClass:[NSDictionary class]]) continue;

        NSArray* extensions = filter[@"extensions"];
        if ([extensions isKindOfClass:[NSArray class]]) {
            for (NSString* ext in extensions) {
                if ([ext isKindOfClass:[NSString class]]) {
                    [allowedTypes addObject:ext];
                }
            }
        }
    }

    if (allowedTypes.count > 0) {
        if (@available(macOS 11.0, *)) {
            NSMutableArray<UTType*>* contentTypes = [NSMutableArray array];
            for (NSString* ext in allowedTypes) {
                UTType* type = [UTType typeWithFilenameExtension:ext];
                if (type) {
                    [contentTypes addObject:type];
                }
            }
            if (contentTypes.count > 0) {
                panel.allowedContentTypes = contentTypes;
            }
        } else {
            panel.allowedFileTypes = allowedTypes;
        }
    }
}

// Helper to convert URLs array to JSON
static NSString* urls_to_json(NSArray<NSURL*>* urls) {
    if (!urls || urls.count == 0) return nil;

    NSMutableArray* paths = [NSMutableArray arrayWithCapacity:urls.count];
    for (NSURL* url in urls) {
        [paths addObject:url.path];
    }

    NSError* error = nil;
    NSData* jsonData = [NSJSONSerialization dataWithJSONObject:paths options:0 error:&error];
    if (error) return nil;

    return [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
}

extern "C" {

void platform_open_file_dialog(void* window, const char* title, const char* filters_json,
                               int allow_multiple, file_dialog_callback_t callback, void* user_data) {
    if (!callback) return;

    NSOpenPanel* panel = [NSOpenPanel openPanel];

    if (title) {
        panel.title = [NSString stringWithUTF8String:title];
    }

    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = (allow_multiple != 0);

    apply_filters_to_panel(panel, filters_json);

    // Run the panel
    NSModalResponse response = [panel runModal];

    if (response == NSModalResponseOK) {
        NSString* jsonPaths = urls_to_json(panel.URLs);
        if (jsonPaths) {
            callback([jsonPaths UTF8String], user_data);
        } else {
            callback(NULL, user_data);
        }
    } else {
        callback(NULL, user_data);
    }
}

void platform_save_file_dialog(void* window, const char* title, const char* default_name,
                               const char* filters_json, file_dialog_callback_t callback, void* user_data) {
    if (!callback) return;

    NSSavePanel* panel = [NSSavePanel savePanel];

    if (title) {
        panel.title = [NSString stringWithUTF8String:title];
    }

    if (default_name) {
        panel.nameFieldStringValue = [NSString stringWithUTF8String:default_name];
    }

    apply_filters_to_panel(panel, filters_json);

    NSModalResponse response = [panel runModal];

    if (response == NSModalResponseOK && panel.URL) {
        NSArray* paths = @[panel.URL.path];
        NSError* error = nil;
        NSData* jsonData = [NSJSONSerialization dataWithJSONObject:paths options:0 error:&error];
        if (!error && jsonData) {
            NSString* jsonStr = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
            callback([jsonStr UTF8String], user_data);
        } else {
            callback(NULL, user_data);
        }
    } else {
        callback(NULL, user_data);
    }
}

void platform_open_folder_dialog(void* window, const char* title,
                                 file_dialog_callback_t callback, void* user_data) {
    if (!callback) return;

    NSOpenPanel* panel = [NSOpenPanel openPanel];

    if (title) {
        panel.title = [NSString stringWithUTF8String:title];
    }

    panel.canChooseFiles = NO;
    panel.canChooseDirectories = YES;
    panel.allowsMultipleSelection = NO;

    NSModalResponse response = [panel runModal];

    if (response == NSModalResponseOK) {
        NSString* jsonPaths = urls_to_json(panel.URLs);
        if (jsonPaths) {
            callback([jsonPaths UTF8String], user_data);
        } else {
            callback(NULL, user_data);
        }
    } else {
        callback(NULL, user_data);
    }
}

MessageBoxResult platform_message_box(void* window, MessageBoxType type, MessageBoxButtons buttons,
                                      const char* title, const char* message, const char* detail) {
    __block MessageBoxResult result = MSG_RESULT_CANCEL;

    void (^showAlert)(void) = ^{
        @autoreleasepool {
            NSAlert* alert = [[NSAlert alloc] init];

            // Set message
            if (message) {
                [alert setMessageText:[NSString stringWithUTF8String:message]];
            }

            // Set detail (informative text)
            if (detail) {
                [alert setInformativeText:[NSString stringWithUTF8String:detail]];
            }

            // Set alert style based on type
            switch (type) {
                case MSG_BOX_INFO:
                    [alert setAlertStyle:NSAlertStyleInformational];
                    break;
                case MSG_BOX_WARNING:
                    [alert setAlertStyle:NSAlertStyleWarning];
                    break;
                case MSG_BOX_ERROR:
                    [alert setAlertStyle:NSAlertStyleCritical];
                    break;
                case MSG_BOX_QUESTION:
                    [alert setAlertStyle:NSAlertStyleInformational];
                    break;
            }

            // Add buttons based on configuration
            switch (buttons) {
                case MSG_BUTTONS_OK:
                    [alert addButtonWithTitle:@"OK"];
                    break;
                case MSG_BUTTONS_OK_CANCEL:
                    [alert addButtonWithTitle:@"OK"];
                    [alert addButtonWithTitle:@"Cancel"];
                    break;
                case MSG_BUTTONS_YES_NO:
                    [alert addButtonWithTitle:@"Yes"];
                    [alert addButtonWithTitle:@"No"];
                    break;
                case MSG_BUTTONS_YES_NO_CANCEL:
                    [alert addButtonWithTitle:@"Yes"];
                    [alert addButtonWithTitle:@"No"];
                    [alert addButtonWithTitle:@"Cancel"];
                    break;
            }

            NSModalResponse response = [alert runModal];

            // Map response to MessageBoxResult
            // NSAlertFirstButtonReturn = 1000, NSAlertSecondButtonReturn = 1001, etc.
            switch (buttons) {
                case MSG_BUTTONS_OK:
                    result = MSG_RESULT_OK;
                    break;
                case MSG_BUTTONS_OK_CANCEL:
                    result = (response == NSAlertFirstButtonReturn) ? MSG_RESULT_OK : MSG_RESULT_CANCEL;
                    break;
                case MSG_BUTTONS_YES_NO:
                    result = (response == NSAlertFirstButtonReturn) ? MSG_RESULT_YES : MSG_RESULT_NO;
                    break;
                case MSG_BUTTONS_YES_NO_CANCEL:
                    if (response == NSAlertFirstButtonReturn) {
                        result = MSG_RESULT_YES;
                    } else if (response == NSAlertSecondButtonReturn) {
                        result = MSG_RESULT_NO;
                    } else {
                        result = MSG_RESULT_CANCEL;
                    }
                    break;
            }
        }
    };

    if ([NSThread isMainThread]) {
        showAlert();
    } else {
        dispatch_sync(dispatch_get_main_queue(), showAlert);
    }

    return result;
}

} // extern "C"

#endif // __APPLE__
