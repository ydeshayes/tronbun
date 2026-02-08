#import <Cocoa/Cocoa.h>
#include "platform_window.h"
#include <objc/runtime.h>

// ============================================================================
// Window Resize Observer
// ============================================================================

// Key for associated object to store resize observer
static const char kResizeObserverKey = '\0';

@interface TronbunResizeObserver : NSObject {
    NSWindow *_observedWindow;
}
@property (nonatomic, assign) platform_window_resize_callback_t callback;
@property (nonatomic, assign) void *userData;
@end

@implementation TronbunResizeObserver

- (instancetype)initWithWindow:(NSWindow *)window
                      callback:(platform_window_resize_callback_t)callback
                      userData:(void *)userData {
    self = [super init];
    if (self) {
        _callback = callback;
        _userData = userData;
        _observedWindow = window;

        // Register for window resize notifications
        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(windowDidResize:)
                                                     name:NSWindowDidResizeNotification
                                                   object:window];
    }
    return self;
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    [super dealloc];
}

- (void)windowDidResize:(NSNotification *)notification {
    (void)notification;
    if (_callback && _observedWindow) {
        NSRect contentRect = [_observedWindow contentRectForFrameRect:[_observedWindow frame]];
        int width = (int)contentRect.size.width;
        int height = (int)contentRect.size.height;
        _callback(width, height, _userData);
    }
}

@end

// ============================================================================
// Helper Functions
// ============================================================================

// Helper function to recursively find WKWebView instances
NSArray<NSView*>* findWKWebViewsInView(NSView *view) {
    NSMutableArray<NSView*> *webviews = [NSMutableArray array];
    
    if ([view isKindOfClass:NSClassFromString(@"WKWebView")]) {
        [webviews addObject:view];
    }
    
    for (NSView *subview in [view subviews]) {
        NSArray<NSView*> *found = findWKWebViewsInView(subview);
        [webviews addObjectsFromArray:found];
    }
    
    return webviews;
}

void platform_window_set_transparent(void *native_window) {
    fprintf(stderr, "platform_window_set_transparent macos\n");
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        fprintf(stderr, "platform_window_set_transparent macos winok\n");
        [win setOpaque:NO];
        [win setBackgroundColor:[NSColor clearColor]];
        [win setHasShadow:NO];
        
        // Recursively find and configure the WKWebView for transparency
        NSView *contentView = [win contentView];
        fprintf(stderr, "Content view: %s\n", [[contentView description] UTF8String]);
        
        NSArray<NSView*> *webviews = findWKWebViewsInView(contentView);
        fprintf(stderr, "Found %lu WKWebView(s)\n", (unsigned long)[webviews count]);
        
        for (NSView *webview in webviews) {
            fprintf(stderr, "Configuring WKWebView: %s\n", [[webview description] UTF8String]);
            // Set WKWebView background to transparent
            [webview setValue:[NSNumber numberWithBool:NO] forKey:@"drawsBackground"];
            fprintf(stderr, "platform_window_set_transparent: WKWebView background set to transparent\n");
        }
        
        fprintf(stderr, "platform_window_set_transparent macos done\n");
    }
}

void platform_window_set_opaque(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        [win setOpaque:YES];
        [win setBackgroundColor:[NSColor windowBackgroundColor]];
        [win setHasShadow:YES];
        [win setAlphaValue:1.0];
        
        // Recursively find and configure the WKWebView for opacity
        NSView *contentView = [win contentView];
        NSArray<NSView*> *webviews = findWKWebViewsInView(contentView);
        
        for (NSView *webview in webviews) {
            // Set WKWebView background to opaque
            [webview setValue:[NSNumber numberWithBool:YES] forKey:@"drawsBackground"];
            fprintf(stderr, "platform_window_set_opaque: WKWebView background set to opaque\n");
        }
        
        // Remove any visual effect views that might be causing transparency
        NSArray *subviews = [[contentView subviews] copy];
        for (NSView *subview in subviews) {
            if ([subview isKindOfClass:[NSVisualEffectView class]]) {
                [subview removeFromSuperview];
            }
        }
    }
}

void platform_window_enable_blur(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        NSVisualEffectView *blurView = [[NSVisualEffectView alloc] initWithFrame:[[win contentView] bounds]];
        [blurView setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
        [blurView setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
        [blurView setMaterial:NSVisualEffectMaterialSidebar];
        [blurView setState:NSVisualEffectStateActive];
        [[win contentView] addSubview:blurView positioned:NSWindowBelow relativeTo:nil];
    }
}

void platform_window_remove_decorations(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        [win setStyleMask:NSWindowStyleMaskBorderless];
    }
}

void platform_window_add_decorations(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        // Restore standard window style with title bar, close/minimize/zoom buttons
        NSWindowStyleMask standardMask = NSWindowStyleMaskTitled | 
                                       NSWindowStyleMaskClosable | 
                                       NSWindowStyleMaskMiniaturizable | 
                                       NSWindowStyleMaskResizable;
        [win setStyleMask:standardMask];
    }
}

void platform_window_set_always_on_top(void *native_window, int on_top) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        [win setLevel:on_top ? NSFloatingWindowLevel : NSNormalWindowLevel];
    }
}

void platform_window_set_opacity(void *native_window, float opacity) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        // Clamp opacity between 0.0 and 1.0
        if (opacity < 0.0f) opacity = 0.0f;
        if (opacity > 1.0f) opacity = 1.0f;
        [win setAlphaValue:opacity];
    }
}

void platform_window_set_resizable(void *native_window, int resizable) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        NSWindowStyleMask currentMask = [win styleMask];
        if (resizable) {
            [win setStyleMask:currentMask | NSWindowStyleMaskResizable];
        } else {
            [win setStyleMask:currentMask & ~NSWindowStyleMaskResizable];
        }
    }
}

void platform_window_set_position(void *native_window, int x, int y) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        // Convert to Cocoa coordinates (bottom-left origin)
        NSScreen *screen = [NSScreen mainScreen];
        CGFloat screenHeight = [screen frame].size.height;
        NSPoint position = NSMakePoint(x, screenHeight - y - [win frame].size.height);
        [win setFrameOrigin:position];
    }
}

void platform_window_center(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        [win center];
    }
}

void platform_window_minimize(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        [win miniaturize:nil];
    }
}

void platform_window_maximize(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        if (!([win styleMask] & NSWindowStyleMaskResizable)) {
            // Temporarily enable resizing for maximizing
            NSWindowStyleMask currentMask = [win styleMask];
            [win setStyleMask:currentMask | NSWindowStyleMaskResizable];
            [win zoom:nil];
            [win setStyleMask:currentMask];
        } else {
            [win zoom:nil];
        }
    }
}

void platform_window_restore(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        if ([win isMiniaturized]) {
            [win deminiaturize:nil];
        } else if ([win isZoomed]) {
            [win zoom:nil];
        }
    }
}

void platform_window_hide(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        [win orderOut:nil];
    }
}

void platform_window_show(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        [win makeKeyAndOrderFront:nil];
    }
}

void platform_window_register_resize_callback(void *native_window,
                                              platform_window_resize_callback_t callback,
                                              void *user_data) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win && callback) {
        // Create the resize observer
        TronbunResizeObserver *observer = [[TronbunResizeObserver alloc] initWithWindow:win
                                                                               callback:callback
                                                                               userData:user_data];

        // Associate the observer with the window so it stays alive
        objc_setAssociatedObject(win, &kResizeObserverKey, observer,
                                 OBJC_ASSOCIATION_RETAIN_NONATOMIC);

        fprintf(stderr, "Registered resize callback for window %p\n", native_window);
    }
}

void platform_window_get_size(void *native_window, int *width, int *height) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (win) {
        NSRect frame = [win frame];
        NSRect contentRect = [win contentRectForFrameRect:frame];
        if (width) *width = (int)contentRect.size.width;
        if (height) *height = (int)contentRect.size.height;
    } else {
        if (width) *width = 0;
        if (height) *height = 0;
    }
}

void platform_window_pre_init_app(void) {
    // Pre-create NSApp and set the activation policy to Regular BEFORE the
    // webview library initialises.  When webview_main is a subprocess inside
    // a .app bundle the library's is_app_bundled() returns true and it skips
    // calling setActivationPolicy: (it assumes LaunchServices did it).  But
    // since we are spawned with Bun.spawn(), LaunchServices is NOT involved
    // and the default policy is Prohibited — no dock icon.
    //
    // By setting the policy here, the webview library's subsequent call to
    // [NSApplication sharedApplication] returns the same instance that
    // already has the correct policy.  makeKeyAndOrderFront: then works
    // properly and the app always appears in the dock.
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
}

void platform_window_activate_app(void) {
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    [NSApp activateIgnoringOtherApps:YES];

    // Re-apply activation and set the dock icon asynchronously once the main
    // run loop is pumping.  The synchronous calls above may not take effect
    // when the run loop hasn't started yet (webview_main is a subprocess
    // inside a .app bundle, not launched by LaunchServices).
    dispatch_async(dispatch_get_main_queue(), ^{
        // Re-apply activation policy now that the run loop is active.
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        [NSApp activateIgnoringOtherApps:YES];

        NSBundle *appBundle = nil;
        NSString *bundlePath = [[NSBundle mainBundle] bundlePath];

        if ([bundlePath hasSuffix:@".app"]) {
            appBundle = [NSBundle mainBundle];
        } else {
            // Walk up from the executable path to find the .app bundle
            NSString *execPath = [[NSProcessInfo processInfo] arguments].firstObject;
            NSRange appRange = [execPath rangeOfString:@".app/"];
            if (appRange.location != NSNotFound) {
                NSString *appPath = [execPath substringToIndex:appRange.location + 4];
                appBundle = [NSBundle bundleWithPath:appPath];
            }
        }

        if (!appBundle) return;

        NSString *iconFile = [appBundle objectForInfoDictionaryKey:@"CFBundleIconFile"];
        if (!iconFile) return;

        NSString *iconPath = [appBundle pathForResource:iconFile ofType:nil];
        if (!iconPath) {
            iconPath = [appBundle pathForResource:iconFile ofType:@"icns"];
        }
        if (!iconPath) return;

        NSImage *icon = [[NSImage alloc] initWithContentsOfFile:iconPath];
        if (icon) {
            [NSApp setApplicationIconImage:icon];
            [icon release];
            fprintf(stderr, "Dock icon set from: %s\n", [iconPath UTF8String]);
        }
    });
}

int platform_window_set_icon(void *native_window, const char *icon_path) {
    // macOS uses the .app bundle's icon automatically (CFBundleIconFile in Info.plist).
    // No per-window icon override needed.
    (void)native_window;
    (void)icon_path;
    return 0;
}