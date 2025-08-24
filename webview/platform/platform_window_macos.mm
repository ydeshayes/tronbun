#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include "platform_window.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Global storage for context menu data
static NSMutableDictionary *contextMenuStorage = nil;

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

// Context menu handler using associated objects to avoid webview replacement
#import <objc/runtime.h>

static const char* kContextMenuItemsKey = "TronbunContextMenuItems";

@interface WKWebView (TronbunContextMenu)
@property (nonatomic, strong) NSArray *tronbun_contextMenuItems;
@end

@implementation WKWebView (TronbunContextMenu)

- (NSArray *)tronbun_contextMenuItems {
    return objc_getAssociatedObject(self, kContextMenuItemsKey);
}

- (void)setTronbun_contextMenuItems:(NSArray *)items {
    objc_setAssociatedObject(self, kContextMenuItemsKey, items, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

- (void)tronbun_rightMouseDown:(NSEvent *)event {
    NSArray *contextMenuItems = self.tronbun_contextMenuItems;
    
    if (!contextMenuItems || [contextMenuItems count] == 0) {
        // No custom menu, use default behavior
        [self tronbun_rightMouseDown:event]; // This will call the original method
        return;
    }
    
    // Create custom context menu
    NSMenu *customMenu = [[NSMenu alloc] init];
    
    for (NSDictionary *item in contextMenuItems) {
        NSString *title = item[@"label"] ?: item[@"id"];
        NSString *itemId = item[@"id"] ?: @"";
        BOOL enabled = item[@"enabled"] ? [item[@"enabled"] boolValue] : YES;
        
        if ([item[@"type"] isEqualToString:@"separator"]) {
            [customMenu addItem:[NSMenuItem separatorItem]];
        } else {
            NSMenuItem *menuItem = [[NSMenuItem alloc] initWithTitle:title action:@selector(tronbun_contextMenuItemClicked:) keyEquivalent:@""];
            [menuItem setTarget:self];
            [menuItem setEnabled:enabled];
            [menuItem setRepresentedObject:itemId];
            [customMenu addItem:menuItem];
        }
    }
    
    // Show the custom menu at the click location
    NSPoint clickLocation = [self convertPoint:[event locationInWindow] fromView:nil];
    [customMenu popUpMenuPositioningItem:nil atLocation:clickLocation inView:self];
}

- (void)tronbun_contextMenuItemClicked:(NSMenuItem *)sender {
    NSString *itemId = [sender representedObject];
    if (itemId) {
        // Send context menu click event to stdout for IPC
        printf("{\"type\":\"context_menu_click\",\"id\":\"%s\"}\n", [itemId UTF8String]);
        fflush(stdout);
    }
}

@end

// Method swizzling helper
static void swizzleMethod(Class cls, SEL originalSelector, SEL swizzledSelector) {
    Method originalMethod = class_getInstanceMethod(cls, originalSelector);
    Method swizzledMethod = class_getInstanceMethod(cls, swizzledSelector);
    
    BOOL didAddMethod = class_addMethod(cls, originalSelector, method_getImplementation(swizzledMethod), method_getTypeEncoding(swizzledMethod));
    
    if (didAddMethod) {
        class_replaceMethod(cls, swizzledSelector, method_getImplementation(originalMethod), method_getTypeEncoding(originalMethod));
    } else {
        method_exchangeImplementations(originalMethod, swizzledMethod);
    }
}

void platform_window_set_context_menu(void *native_window, const char *menu_json) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (!win || !menu_json) {
        fprintf(stderr, "platform_window_set_context_menu: Invalid parameters\n");
        return;
    }
    
    fprintf(stderr, "platform_window_set_context_menu: Setting native context menu with JSON: %s\n", menu_json);
    
    // Initialize storage if needed
    if (!contextMenuStorage) {
        contextMenuStorage = [[NSMutableDictionary alloc] init];
    }
    
    // Parse JSON menu items
    NSString *jsonString = [NSString stringWithUTF8String:menu_json];
    if (!jsonString) {
        fprintf(stderr, "platform_window_set_context_menu: Failed to create NSString from JSON\n");
        return;
    }
    
    NSData *jsonData = [jsonString dataUsingEncoding:NSUTF8StringEncoding];
    if (!jsonData) {
        fprintf(stderr, "platform_window_set_context_menu: Failed to create NSData from JSON string\n");
        return;
    }
    
    NSError *error = nil;
    NSArray *menuItems = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
    
    if (error) {
        fprintf(stderr, "platform_window_set_context_menu: JSON parsing error: %s\n", [[error localizedDescription] UTF8String]);
        return;
    }
    
    if (![menuItems isKindOfClass:[NSArray class]]) {
        fprintf(stderr, "platform_window_set_context_menu: JSON root is not an array\n");
        return;
    }
    
    fprintf(stderr, "platform_window_set_context_menu: Successfully parsed %lu menu items\n", (unsigned long)[menuItems count]);
    
    // Swizzle rightMouseDown method for WKWebView class (only once)
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        swizzleMethod([WKWebView class], @selector(rightMouseDown:), @selector(tronbun_rightMouseDown:));
        fprintf(stderr, "Method swizzling applied to WKWebView rightMouseDown\n");
    });
    
    // Find WKWebView instances and set context menu items
    NSView *contentView = [win contentView];
    NSArray<NSView*> *webviews = findWKWebViewsInView(contentView);
    
    for (NSView *webview in webviews) {
        if ([webview isKindOfClass:[WKWebView class]]) {
            WKWebView *wkWebView = (WKWebView *)webview;
            [wkWebView setTronbun_contextMenuItems:menuItems];
            
            fprintf(stderr, "Native context menu items set for WKWebView with %lu items\n", (unsigned long)[menuItems count]);
        }
    }
    
    // Store menu items for this window
    NSString *windowKey = [NSString stringWithFormat:@"%p", native_window];
    [contextMenuStorage setObject:menuItems forKey:windowKey];
}

void platform_window_clear_context_menu(void *native_window) {
    NSWindow *win = (__bridge NSWindow *)native_window;
    if (!win) {
        fprintf(stderr, "platform_window_clear_context_menu: Invalid window parameter\n");
        return;
    }
    
    // Find WKWebView instances and clear context menu items
    NSView *contentView = [win contentView];
    NSArray<NSView*> *webviews = findWKWebViewsInView(contentView);
    
    for (NSView *webview in webviews) {
        if ([webview isKindOfClass:[WKWebView class]]) {
            WKWebView *wkWebView = (WKWebView *)webview;
            [wkWebView setTronbun_contextMenuItems:nil];
            
            fprintf(stderr, "Native context menu items cleared from WKWebView\n");
        }
    }
    
    // Remove from storage
    if (contextMenuStorage) {
        NSString *windowKey = [NSString stringWithFormat:@"%p", native_window];
        [contextMenuStorage removeObjectForKey:windowKey];
    }
    
    fprintf(stderr, "platform_window_clear_context_menu: Native context menu cleared for window\n");
}