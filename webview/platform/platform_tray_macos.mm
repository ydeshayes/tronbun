#import <Cocoa/Cocoa.h>
#include "platform_tray.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

@interface TrayDelegate : NSObject
@property (nonatomic, assign) platform_tray_click_callback_t clickCallback;
@property (nonatomic, assign) platform_menu_click_callback_t menuCallback;
@property (nonatomic, assign) void* userdata;
@property (nonatomic, strong) NSMutableDictionary* menuItems;
@end

@implementation TrayDelegate
- (instancetype)init {
    self = [super init];
    if (self) {
        _menuItems = [[NSMutableDictionary alloc] init];
    }
    return self;
}

- (void)trayIconClicked:(id)sender {
    // Left-click now shows the menu instead of calling custom handlers
    NSStatusItem* statusItem = (NSStatusItem*)sender;
    NSMenu* menu = [statusItem menu];
    if (menu) {
        // Get the button and its frame to position the menu
        NSButton* button = [statusItem button];
        if (button) {
            NSRect buttonFrame = [button frame];
            // Show menu below the button
            [menu popUpMenuPositioningItem:nil 
                               atLocation:NSMakePoint(NSMinX(buttonFrame), NSMinY(buttonFrame))
                                   inView:button];
        }
    }
}

- (void)menuItemClicked:(NSMenuItem*)sender {
    NSString* menuId = [sender representedObject];
    if (menuId && self.menuCallback) {
        self.menuCallback([menuId UTF8String], self.userdata);
    }
}
@end

struct platform_tray {
    NSStatusItem* statusItem;
    TrayDelegate* delegate;
};

platform_tray_t* platform_tray_create(const char* icon_path, const char* tooltip) {
    @autoreleasepool {
        // Initialize NSApplication if not already done
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        
        platform_tray_t* tray = (platform_tray_t*)malloc(sizeof(platform_tray_t));
        if (!tray) return NULL;
        
        // Create status item
        NSStatusItem* statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSSquareStatusItemLength];
        if (!statusItem) {
            free(tray);
            return NULL;
        }
        tray->statusItem = [statusItem retain];
        
        // Create delegate
        tray->delegate = [[TrayDelegate alloc] init];
        
        // Set initial icon - use a system icon as default
        NSImage* defaultImage = [NSImage imageNamed:NSImageNameApplicationIcon];
        if (defaultImage) {
            [defaultImage setSize:NSMakeSize(18, 18)];
            [defaultImage setTemplate:YES];
            [[tray->statusItem button] setImage:defaultImage];
        }
        
        // Set custom icon if provided
        if (icon_path) {
            NSString* iconPathStr = [NSString stringWithUTF8String:icon_path];
            NSImage* image = [[NSImage alloc] initWithContentsOfFile:iconPathStr];
            if (image) {
                [image setSize:NSMakeSize(18, 18)];
                [image setTemplate:YES];
                [[tray->statusItem button] setImage:image];
            }
        }
        
        // Set initial tooltip
        if (tooltip) {
            NSString* tooltipStr = [NSString stringWithUTF8String:tooltip];
            [[tray->statusItem button] setToolTip:tooltipStr];
        }
        
        // Set up click handling
        [[tray->statusItem button] setTarget:tray->delegate];
        [[tray->statusItem button] setAction:@selector(trayIconClicked:)];
        
        return tray;
    }
}

void platform_tray_destroy(platform_tray_t* tray) {
    if (!tray) return;
    
    @autoreleasepool {
        if (tray->statusItem) {
            [[NSStatusBar systemStatusBar] removeStatusItem:tray->statusItem];
            [tray->statusItem release];
            tray->statusItem = nil;
        }
        
        if (tray->delegate) {
            [tray->delegate release];
            tray->delegate = nil;
        }
        
        free(tray);
    }
}

int platform_tray_set_icon(platform_tray_t* tray, const char* icon_path) {
    if (!tray) return -1;
    
    @autoreleasepool {
        NSImage* image = nil;
        
        if (icon_path && strlen(icon_path) > 0) {
            NSString* iconPathStr = [NSString stringWithUTF8String:icon_path];
            image = [[NSImage alloc] initWithContentsOfFile:iconPathStr];
            if (!image) {
                fprintf(stderr, "Failed to load icon from path: %s, using default\n", icon_path);
            }
        }
        
        // Use default system icon if custom icon failed to load or not provided
        if (!image) {
            image = [NSImage imageNamed:NSImageNameApplicationIcon];
        }
        
        if (image) {
            // Create a copy to avoid modifying the original system image
            NSImage* iconCopy = [image copy];
            [iconCopy setSize:NSMakeSize(18, 18)];
            [iconCopy setTemplate:YES];
            
            // Should already be on main thread
            if (tray->statusItem) {
                NSButton* button = [tray->statusItem button];
                if (button) {
                    [button setImage:iconCopy];
                } else {
                    fprintf(stderr, "Warning: statusItem button is nil\n");
                }
            } else {
                fprintf(stderr, "Error: statusItem is nil\n");
            }
        }
        
        return 0;
    }
}

int platform_tray_set_tooltip(platform_tray_t* tray, const char* tooltip) {
    if (!tray || !tooltip) return -1;
    
    @autoreleasepool {
        NSString* tooltipStr = [NSString stringWithUTF8String:tooltip];

        if (tray->statusItem) {
            NSButton* button = [tray->statusItem button];
            if (button) {
                [button setToolTip:tooltipStr];
            } else {
                fprintf(stderr, "Warning: statusItem button is nil for tooltip\n");
            }
        } else {
            fprintf(stderr, "Error: statusItem is nil for tooltip\n");
        }
        
        return 0;
    }
}

NSMenuItem* createMenuItemFromPlatform(const platform_menu_item_t* item, TrayDelegate* delegate) {
    if (item->type == 1) { // separator
        return [NSMenuItem separatorItem];
    }
    
    NSString* label = [NSString stringWithUTF8String:item->label];
    NSMenuItem* menuItem = [[NSMenuItem alloc] initWithTitle:label action:nil keyEquivalent:@""];
    
    if (item->type == 2) { // checkbox
        [menuItem setState:item->checked ? NSControlStateValueOn : NSControlStateValueOff];
    }
    
    [menuItem setEnabled:item->enabled ? YES : NO];
    
    if (strlen(item->accelerator) > 0) {
        NSString* accelerator = [NSString stringWithUTF8String:item->accelerator];
        // Simple accelerator parsing - in a real implementation you'd want more sophisticated parsing
        if ([accelerator isEqualToString:@"Cmd+Q"]) {
            [menuItem setKeyEquivalent:@"q"];
            [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
        }
        // Add more accelerator combinations as needed
    }
    
    if (item->type != 3) { // not submenu
        [menuItem setTarget:delegate];
        [menuItem setAction:@selector(menuItemClicked:)];
        [menuItem setRepresentedObject:[NSString stringWithUTF8String:item->id]];
    }
    
    return menuItem;
}

int platform_tray_set_menu(platform_tray_t* tray, const platform_menu_item_t* menu_items, int count) {
    if (!tray || !menu_items || count <= 0) return -1;
    
    @autoreleasepool {
        NSMenu* menu = [[NSMenu alloc] init];
        
        for (int i = 0; i < count; i++) {
            NSMenuItem* menuItem = createMenuItemFromPlatform(&menu_items[i], tray->delegate);
            [menu addItem:menuItem];
        }
        
        [tray->statusItem setMenu:menu];
        return 0;
    }
}

void platform_tray_set_click_callback(platform_tray_t* tray, platform_tray_click_callback_t callback, void* userdata) {
    if (!tray) return;
    
    tray->delegate.clickCallback = callback;
    tray->delegate.userdata = userdata;
}

void platform_tray_set_menu_callback(platform_tray_t* tray, platform_menu_click_callback_t callback, void* userdata) {
    if (!tray) return;
    
    tray->delegate.menuCallback = callback;
    tray->delegate.userdata = userdata;
}

int platform_tray_show_notification(platform_tray_t* tray, const char* title, const char* body) {
    if (!tray || !title || !body) return -1;
    
    @autoreleasepool {
        NSUserNotification* notification = [[NSUserNotification alloc] init];
        notification.title = [NSString stringWithUTF8String:title];
        notification.informativeText = [NSString stringWithUTF8String:body];
        
        [[NSUserNotificationCenter defaultUserNotificationCenter] deliverNotification:notification];
        return 0;
    }
}

void platform_tray_run_event_loop(void* context) {
    // Import the IPC context structure
    typedef struct {
        int should_exit;
        void* application_data;
    } ipc_base_context_t;
    
    ipc_base_context_t* ipc_context = (ipc_base_context_t*)context;
    
    // macOS run loop
    @autoreleasepool {
        while (!ipc_context->should_exit) {
            @autoreleasepool {
                NSEvent* event = [NSApp nextEventMatchingMask:NSEventMaskAny
                                                    untilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]
                                                       inMode:NSDefaultRunLoopMode
                                                      dequeue:YES];
                if (event) {
                    [NSApp sendEvent:event];
                }
                
                // Process any pending runloop sources
                [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.01]];
            }
        }
    }
}

int platform_tray_is_supported(void) {
    return 1; // macOS always supports tray icons
}
