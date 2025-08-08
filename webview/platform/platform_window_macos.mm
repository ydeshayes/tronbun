#import <Cocoa/Cocoa.h>
#include "platform_window.h"

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