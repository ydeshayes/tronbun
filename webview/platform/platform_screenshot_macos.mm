/**
 * macOS screenshot implementation using WKWebView
 */

#ifdef __APPLE__

#import "platform_screenshot.h"
#import <WebKit/WebKit.h>
#import <AppKit/AppKit.h>

// Run loop step function - pumps both the run loop and GCD main queue
// This is needed because WKWebView completion handlers use GCD
extern "C" void macos_run_loop_step(int timeout_ms) {
    @autoreleasepool {
        // Use NSRunLoop which properly integrates with GCD main queue
        NSDate* limitDate = [NSDate dateWithTimeIntervalSinceNow:timeout_ms / 1000.0];
        [[NSRunLoop mainRunLoop] runUntilDate:limitDate];
    }
}

// Helper to get WKWebView from the webview library's window
// The webview library stores the WKWebView as a subview of the window's contentView
static WKWebView* get_wkwebview_from_window(void* window) {
    if (!window) return nil;

    NSWindow* nsWindow = (__bridge NSWindow*)window;
    NSView* contentView = [nsWindow contentView];

    // Find the WKWebView in the view hierarchy
    for (NSView* subview in [contentView subviews]) {
        if ([subview isKindOfClass:[WKWebView class]]) {
            return (WKWebView*)subview;
        }
        // Check one level deeper
        for (NSView* subsubview in [subview subviews]) {
            if ([subsubview isKindOfClass:[WKWebView class]]) {
                return (WKWebView*)subsubview;
            }
        }
    }

    return nil;
}

void platform_take_screenshot(void* webview_window, screenshot_callback_t callback, void* user_data) {
    if (!callback) return;

    WKWebView* wkWebView = get_wkwebview_from_window(webview_window);

    if (!wkWebView) {
        NSLog(@"[Screenshot] Failed to get WKWebView from window");
        callback(NULL, 0, user_data);
        return;
    }

    // Configure snapshot to capture the full visible content
    WKSnapshotConfiguration* config = [[WKSnapshotConfiguration alloc] init];

    [wkWebView takeSnapshotWithConfiguration:config completionHandler:^(NSImage* image, NSError* error) {
        if (error || !image) {
            NSLog(@"[Screenshot] Failed to take snapshot: %@", error);
            callback(NULL, 0, user_data);
            return;
        }

        // Convert NSImage to PNG data
        NSBitmapImageRep* bitmapRep = nil;

        // Get the best representation
        for (NSImageRep* rep in [image representations]) {
            if ([rep isKindOfClass:[NSBitmapImageRep class]]) {
                bitmapRep = (NSBitmapImageRep*)rep;
                break;
            }
        }

        if (!bitmapRep) {
            // Create bitmap representation from image
            CGImageRef cgImage = [image CGImageForProposedRect:NULL context:nil hints:nil];
            if (cgImage) {
                bitmapRep = [[NSBitmapImageRep alloc] initWithCGImage:cgImage];
            }
        }

        if (!bitmapRep) {
            NSLog(@"[Screenshot] Failed to create bitmap representation");
            callback(NULL, 0, user_data);
            return;
        }

        // Convert to PNG
        NSData* pngData = [bitmapRep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];

        if (!pngData || [pngData length] == 0) {
            NSLog(@"[Screenshot] Failed to create PNG data");
            callback(NULL, 0, user_data);
            return;
        }

        // Convert to base64
        NSString* base64String = [pngData base64EncodedStringWithOptions:0];

        if (!base64String) {
            NSLog(@"[Screenshot] Failed to encode as base64");
            callback(NULL, 0, user_data);
            return;
        }

        const char* base64CStr = [base64String UTF8String];
        size_t length = strlen(base64CStr);

        NSLog(@"[Screenshot] Captured %zu bytes (base64)", length);

        // Call the callback with the base64 data
        callback(base64CStr, length, user_data);
    }];
}

void platform_child_take_screenshot(void* child_view, screenshot_callback_t callback, void* user_data) {
    if (!callback || !child_view) {
        if (callback) callback(NULL, 0, user_data);
        return;
    }

    // The child_view is the container NSView, find the WKWebView inside
    NSView* containerView = (__bridge NSView*)child_view;
    WKWebView* wkWebView = nil;

    for (NSView* subview in [containerView subviews]) {
        if ([subview isKindOfClass:[WKWebView class]]) {
            wkWebView = (WKWebView*)subview;
            break;
        }
    }

    if (!wkWebView) {
        NSLog(@"[Screenshot] Failed to get WKWebView from child view");
        callback(NULL, 0, user_data);
        return;
    }

    WKSnapshotConfiguration* config = [[WKSnapshotConfiguration alloc] init];

    [wkWebView takeSnapshotWithConfiguration:config completionHandler:^(NSImage* image, NSError* error) {
        if (error || !image) {
            NSLog(@"[Screenshot] Child view snapshot failed: %@", error);
            callback(NULL, 0, user_data);
            return;
        }

        // Same conversion as above
        NSBitmapImageRep* bitmapRep = nil;

        for (NSImageRep* rep in [image representations]) {
            if ([rep isKindOfClass:[NSBitmapImageRep class]]) {
                bitmapRep = (NSBitmapImageRep*)rep;
                break;
            }
        }

        if (!bitmapRep) {
            CGImageRef cgImage = [image CGImageForProposedRect:NULL context:nil hints:nil];
            if (cgImage) {
                bitmapRep = [[NSBitmapImageRep alloc] initWithCGImage:cgImage];
            }
        }

        if (!bitmapRep) {
            callback(NULL, 0, user_data);
            return;
        }

        NSData* pngData = [bitmapRep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];

        if (!pngData || [pngData length] == 0) {
            callback(NULL, 0, user_data);
            return;
        }

        NSString* base64String = [pngData base64EncodedStringWithOptions:0];

        if (!base64String) {
            callback(NULL, 0, user_data);
            return;
        }

        const char* base64CStr = [base64String UTF8String];
        callback(base64CStr, strlen(base64CStr), user_data);
    }];
}

#endif // __APPLE__
