/**
 * macOS context menu (right-click menu) implementation using NSMenu + NSEvent monitor
 *
 * Uses a local event monitor to intercept right-click events before they reach
 * the WKWebView. When a custom context menu is set, right-clicks within the
 * webview are consumed and our native NSMenu is shown instead of the default
 * browser context menu.
 */

#ifdef __APPLE__

#import "platform_context_menu.h"
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <stdio.h>
#include <string.h>

// ============================================================================
// Context Menu Delegate
// ============================================================================

@interface ContextMenuDelegate : NSObject {
    platform_context_menu_callback_t _callback;
    void* _userData;
    NSMutableDictionary<NSString*, NSMenuItem*>* _itemsById;
}
@property (nonatomic, assign) platform_context_menu_callback_t callback;
@property (nonatomic, assign) void* userData;
@property (nonatomic, retain) NSMutableDictionary<NSString*, NSMenuItem*>* itemsById;
@end

@implementation ContextMenuDelegate

@synthesize callback = _callback;
@synthesize userData = _userData;
@synthesize itemsById = _itemsById;

- (instancetype)init {
    self = [super init];
    if (self) {
        _itemsById = [[NSMutableDictionary alloc] init];
    }
    return self;
}

- (void)dealloc {
    [_itemsById release];
    [super dealloc];
}

- (void)contextMenuItemClicked:(NSMenuItem*)sender {
    NSString* menuId = [sender representedObject];
    if (menuId && _callback) {
        _callback([menuId UTF8String], _userData);
    }
}

- (void)registerItem:(NSMenuItem*)item withId:(NSString*)itemId {
    if (itemId && item) {
        _itemsById[itemId] = item;
    }
}

- (NSMenuItem*)itemForId:(NSString*)itemId {
    return _itemsById[itemId];
}

@end

// ============================================================================
// Global State
// ============================================================================

static ContextMenuDelegate* g_ctxDelegate = nil;
static NSMenu* g_ctxMenu = nil;
static NSWindow* g_ctxWindow = nil;
static id g_eventMonitor = nil;

// ============================================================================
// Helper: Find WKWebView in window hierarchy
// ============================================================================

static WKWebView* ctx_findWKWebView(NSView* view) {
    if ([view isKindOfClass:[WKWebView class]]) {
        return (WKWebView*)view;
    }
    for (NSView* subview in [view subviews]) {
        WKWebView* found = ctx_findWKWebView(subview);
        if (found) return found;
    }
    return nil;
}

// ============================================================================
// Event Monitor
// ============================================================================

static void ctx_installEventMonitor(void) {
    if (g_eventMonitor) return;

    g_eventMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskRightMouseDown
                                                           handler:^NSEvent*(NSEvent* event) {
        if (!g_ctxMenu || !g_ctxWindow) return event;

        // Only intercept events for our tracked window
        if ([event window] != g_ctxWindow) return event;

        // Find the WKWebView in the window
        WKWebView* webView = ctx_findWKWebView([g_ctxWindow contentView]);
        if (!webView) return event;

        // Check if the click is within the WKWebView's bounds
        NSPoint locationInWindow = [event locationInWindow];
        NSPoint locationInWebView = [webView convertPoint:locationInWindow fromView:nil];
        if (!NSPointInRect(locationInWebView, [webView bounds])) return event;

        // Show our context menu at the click location
        [g_ctxMenu popUpMenuPositioningItem:nil atLocation:locationInWebView inView:webView];

        // Return nil to consume the event and prevent the default context menu
        return nil;
    }];

    [g_eventMonitor retain];
    fprintf(stderr, "Context menu: Installed event monitor\n");
}

static void ctx_removeEventMonitor(void) {
    if (!g_eventMonitor) return;

    [NSEvent removeMonitor:g_eventMonitor];
    [g_eventMonitor release];
    g_eventMonitor = nil;
    fprintf(stderr, "Context menu: Removed event monitor\n");
}

// ============================================================================
// Menu Building from JSON
// ============================================================================

static NSMenuItem* ctx_buildMenuItem(NSDictionary* itemDict, ContextMenuDelegate* delegate) {
    NSString* itemType = itemDict[@"type"] ?: @"normal";

    // Separator
    if ([itemType isEqualToString:@"separator"]) {
        return [NSMenuItem separatorItem];
    }

    NSString* label = itemDict[@"label"] ?: @"Item";
    NSMenuItem* menuItem = [[[NSMenuItem alloc] initWithTitle:label
                                                      action:@selector(contextMenuItemClicked:)
                                               keyEquivalent:@""] autorelease];
    [menuItem setTarget:delegate];

    // Set ID
    NSString* itemId = itemDict[@"id"] ?: [[NSUUID UUID] UUIDString];
    [menuItem setRepresentedObject:itemId];
    [delegate registerItem:menuItem withId:itemId];

    // Enabled state
    NSNumber* enabled = itemDict[@"enabled"];
    [menuItem setEnabled:(enabled == nil || [enabled boolValue])];

    // Checked state for checkbox/radio
    if ([itemType isEqualToString:@"checkbox"] || [itemType isEqualToString:@"radio"]) {
        NSNumber* checked = itemDict[@"checked"];
        [menuItem setState:[checked boolValue] ? NSControlStateValueOn : NSControlStateValueOff];
    }

    // Handle submenu
    NSArray* subItems = itemDict[@"submenu"];
    if ([subItems isKindOfClass:[NSArray class]] && subItems.count > 0) {
        NSMenu* submenu = [[[NSMenu alloc] initWithTitle:label] autorelease];
        [submenu setAutoenablesItems:NO];

        for (NSDictionary* subItemDict in subItems) {
            if (![subItemDict isKindOfClass:[NSDictionary class]]) continue;
            NSMenuItem* subMenuItem = ctx_buildMenuItem(subItemDict, delegate);
            [submenu addItem:subMenuItem];
        }

        [menuItem setSubmenu:submenu];
        [menuItem setAction:nil];
    }

    return menuItem;
}

static NSMenu* ctx_buildMenuFromJSON(const char* items_json, ContextMenuDelegate* delegate) {
    NSData* data = [[NSString stringWithUTF8String:items_json] dataUsingEncoding:NSUTF8StringEncoding];
    if (!data) return nil;

    NSError* error = nil;
    NSArray* itemsArray = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
    if (error || ![itemsArray isKindOfClass:[NSArray class]]) {
        fprintf(stderr, "Context menu: Failed to parse JSON: %s\n",
                error ? [[error localizedDescription] UTF8String] : "not an array");
        return nil;
    }

    NSMenu* menu = [[[NSMenu alloc] init] autorelease];
    [menu setAutoenablesItems:NO];

    for (NSDictionary* itemDict in itemsArray) {
        if (![itemDict isKindOfClass:[NSDictionary class]]) continue;
        NSMenuItem* menuItem = ctx_buildMenuItem(itemDict, delegate);
        [menu addItem:menuItem];
    }

    return menu;
}

// ============================================================================
// Public API Implementation
// ============================================================================

extern "C" {

int platform_context_menu_set(void* window, void* webview_handle,
                              const char* items_json,
                              platform_context_menu_callback_t callback,
                              void* user_data) {
    if (!window || !items_json) return -1;
    (void)webview_handle;

    @autoreleasepool {
        NSWindow* nsWindow = (__bridge NSWindow*)window;

        // Create or reset delegate
        if (!g_ctxDelegate) {
            g_ctxDelegate = [[ContextMenuDelegate alloc] init];
        }
        g_ctxDelegate.callback = callback;
        g_ctxDelegate.userData = user_data;
        [g_ctxDelegate.itemsById removeAllObjects];

        // Store the tracked window
        g_ctxWindow = nsWindow;

        // Build the menu from JSON
        NSMenu* menu = ctx_buildMenuFromJSON(items_json, g_ctxDelegate);
        if (!menu) {
            fprintf(stderr, "Context menu: Failed to build menu from JSON\n");
            return -1;
        }

        // Release old menu, retain new one
        [g_ctxMenu release];
        g_ctxMenu = [menu retain];

        // Install event monitor to intercept right-clicks
        ctx_installEventMonitor();

        fprintf(stderr, "Context menu: Set %ld items\n", (long)[[menu itemArray] count]);
        return 0;
    }
}

int platform_context_menu_remove(void* window, void* webview_handle) {
    (void)window;
    (void)webview_handle;

    @autoreleasepool {
        // Remove the event monitor
        ctx_removeEventMonitor();

        // Clean up
        [g_ctxMenu release];
        g_ctxMenu = nil;
        g_ctxWindow = nil;

        if (g_ctxDelegate) {
            [g_ctxDelegate.itemsById removeAllObjects];
        }

        fprintf(stderr, "Context menu: Removed\n");
        return 0;
    }
}

int platform_context_menu_update_item(const char* item_id,
                                      const char* label,
                                      int enabled, int checked) {
    if (!item_id || !g_ctxDelegate) return -1;

    @autoreleasepool {
        NSString* itemId = [NSString stringWithUTF8String:item_id];
        NSMenuItem* item = [g_ctxDelegate itemForId:itemId];
        if (!item) return -1;

        if (label) {
            [item setTitle:[NSString stringWithUTF8String:label]];
        }

        if (enabled >= 0) {
            [item setEnabled:enabled ? YES : NO];
        }

        if (checked >= 0) {
            [item setState:checked ? NSControlStateValueOn : NSControlStateValueOff];
        }

        return 0;
    }
}

int platform_context_menu_show(void* window, int x, int y) {
    if (!window || !g_ctxMenu) return -1;

    @autoreleasepool {
        NSWindow* nsWindow = (__bridge NSWindow*)window;

        // Find the WKWebView to use as the positioning view
        WKWebView* webView = ctx_findWKWebView([nsWindow contentView]);
        if (!webView) {
            fprintf(stderr, "Context menu: Could not find WKWebView\n");
            return -1;
        }

        // Convert coordinates: input is in web content coordinates (origin top-left)
        // NSView coordinates have origin at bottom-left
        NSRect viewBounds = [webView bounds];
        NSPoint location = NSMakePoint(x, viewBounds.size.height - y);

        [g_ctxMenu popUpMenuPositioningItem:nil atLocation:location inView:webView];
        return 0;
    }
}

} // extern "C"

#endif // __APPLE__
