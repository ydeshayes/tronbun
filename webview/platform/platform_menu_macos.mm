/**
 * macOS application menu implementation using NSMenu
 */

#ifdef __APPLE__

#import "platform_menu.h"
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#include <stdlib.h>
#include <string.h>

// ============================================================================
// Menu Delegate for handling callbacks
// ============================================================================

@interface MenuDelegate : NSObject
@property (nonatomic, assign) platform_menu_callback_t callback;
@property (nonatomic, assign) void* userData;
@property (nonatomic, strong) NSMutableDictionary<NSString*, NSMenuItem*>* itemsById;
@end

@implementation MenuDelegate

- (instancetype)init {
    self = [super init];
    if (self) {
        _itemsById = [[NSMutableDictionary alloc] init];
    }
    return self;
}

- (void)menuItemClicked:(NSMenuItem*)sender {
    NSString* menuId = [sender representedObject];
    if (menuId && self.callback) {
        self.callback([menuId UTF8String], self.userData);
    }
}

- (void)registerItem:(NSMenuItem*)item withId:(NSString*)itemId {
    if (itemId && item) {
        self.itemsById[itemId] = item;
    }
}

- (NSMenuItem*)itemForId:(NSString*)itemId {
    return self.itemsById[itemId];
}

@end

// Global delegate storage (one per application)
static MenuDelegate* g_menuDelegate = nil;

// ============================================================================
// Helper Functions
// ============================================================================

// Parse accelerator string and set key equivalent
static void setAccelerator(NSMenuItem* item, const char* accelerator) {
    if (!accelerator || strlen(accelerator) == 0) return;

    NSString* accel = [NSString stringWithUTF8String:accelerator];
    NSEventModifierFlags modifiers = 0;
    NSString* key = @"";

    // Parse modifiers
    if ([accel containsString:@"CmdOrCtrl+"] || [accel containsString:@"Cmd+"]) {
        modifiers |= NSEventModifierFlagCommand;
        accel = [accel stringByReplacingOccurrencesOfString:@"CmdOrCtrl+" withString:@""];
        accel = [accel stringByReplacingOccurrencesOfString:@"Cmd+" withString:@""];
    }
    if ([accel containsString:@"Ctrl+"]) {
        modifiers |= NSEventModifierFlagControl;
        accel = [accel stringByReplacingOccurrencesOfString:@"Ctrl+" withString:@""];
    }
    if ([accel containsString:@"Alt+"] || [accel containsString:@"Option+"]) {
        modifiers |= NSEventModifierFlagOption;
        accel = [accel stringByReplacingOccurrencesOfString:@"Alt+" withString:@""];
        accel = [accel stringByReplacingOccurrencesOfString:@"Option+" withString:@""];
    }
    if ([accel containsString:@"Shift+"]) {
        modifiers |= NSEventModifierFlagShift;
        accel = [accel stringByReplacingOccurrencesOfString:@"Shift+" withString:@""];
    }

    // The remaining string is the key
    key = [accel lowercaseString];

    // Handle special keys
    if ([key isEqualToString:@"enter"] || [key isEqualToString:@"return"]) {
        key = @"\r";
    } else if ([key isEqualToString:@"tab"]) {
        key = @"\t";
    } else if ([key isEqualToString:@"backspace"] || [key isEqualToString:@"delete"]) {
        key = [NSString stringWithFormat:@"%C", (unichar)NSBackspaceCharacter];
    } else if ([key isEqualToString:@"escape"] || [key isEqualToString:@"esc"]) {
        key = [NSString stringWithFormat:@"%C", (unichar)0x1B];
    } else if ([key isEqualToString:@"up"]) {
        key = [NSString stringWithFormat:@"%C", (unichar)NSUpArrowFunctionKey];
    } else if ([key isEqualToString:@"down"]) {
        key = [NSString stringWithFormat:@"%C", (unichar)NSDownArrowFunctionKey];
    } else if ([key isEqualToString:@"left"]) {
        key = [NSString stringWithFormat:@"%C", (unichar)NSLeftArrowFunctionKey];
    } else if ([key isEqualToString:@"right"]) {
        key = [NSString stringWithFormat:@"%C", (unichar)NSRightArrowFunctionKey];
    } else if ([key hasPrefix:@"f"] && key.length >= 2) {
        // Function keys F1-F12
        int fNum = [[key substringFromIndex:1] intValue];
        if (fNum >= 1 && fNum <= 12) {
            key = [NSString stringWithFormat:@"%C", (unichar)(NSF1FunctionKey + fNum - 1)];
        }
    }

    [item setKeyEquivalent:key];
    [item setKeyEquivalentModifierMask:modifiers];
}

// Create NSMenuItem from platform_menu_item_t
static NSMenuItem* createMenuItem(const platform_menu_item_t* item, MenuDelegate* delegate) {
    if (item->type == MENU_ITEM_SEPARATOR) {
        return [NSMenuItem separatorItem];
    }

    NSString* label = [NSString stringWithUTF8String:item->label];
    // Remove & accelerator hints (Windows style) for macOS
    label = [label stringByReplacingOccurrencesOfString:@"&" withString:@""];

    NSMenuItem* menuItem = [[NSMenuItem alloc] initWithTitle:label
                                                      action:nil
                                               keyEquivalent:@""];

    // Set type-specific properties
    if (item->type == MENU_ITEM_CHECKBOX || item->type == MENU_ITEM_RADIO) {
        [menuItem setState:item->checked ? NSControlStateValueOn : NSControlStateValueOff];
    }

    [menuItem setEnabled:item->enabled ? YES : NO];

    // Set accelerator
    setAccelerator(menuItem, item->accelerator);

    // Handle standard roles
    if (item->role != MENU_ROLE_NONE) {
        switch (item->role) {
            case MENU_ROLE_UNDO:
                [menuItem setAction:@selector(undo:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"z"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
                }
                break;
            case MENU_ROLE_REDO:
                [menuItem setAction:@selector(redo:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"z"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagShift];
                }
                break;
            case MENU_ROLE_CUT:
                [menuItem setAction:@selector(cut:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"x"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
                }
                break;
            case MENU_ROLE_COPY:
                [menuItem setAction:@selector(copy:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"c"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
                }
                break;
            case MENU_ROLE_PASTE:
                [menuItem setAction:@selector(paste:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"v"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
                }
                break;
            case MENU_ROLE_SELECT_ALL:
                [menuItem setAction:@selector(selectAll:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"a"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
                }
                break;
            case MENU_ROLE_DELETE:
                [menuItem setAction:@selector(delete:)];
                break;
            case MENU_ROLE_MINIMIZE:
                [menuItem setAction:@selector(miniaturize:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"m"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
                }
                break;
            case MENU_ROLE_ZOOM:
                [menuItem setAction:@selector(zoom:)];
                break;
            case MENU_ROLE_CLOSE:
                [menuItem setAction:@selector(performClose:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"w"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
                }
                break;
            case MENU_ROLE_FULLSCREEN:
                [menuItem setAction:@selector(toggleFullScreen:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"f"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagControl];
                }
                break;
            case MENU_ROLE_HIDE:
                [menuItem setAction:@selector(hide:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"h"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
                }
                break;
            case MENU_ROLE_HIDE_OTHERS:
                [menuItem setAction:@selector(hideOtherApplications:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"h"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagOption];
                }
                break;
            case MENU_ROLE_UNHIDE:
                [menuItem setAction:@selector(unhideAllApplications:)];
                break;
            case MENU_ROLE_QUIT:
                [menuItem setAction:@selector(terminate:)];
                if (strlen(item->accelerator) == 0) {
                    [menuItem setKeyEquivalent:@"q"];
                    [menuItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
                }
                break;
            case MENU_ROLE_FRONT:
                [menuItem setAction:@selector(arrangeInFront:)];
                break;
            default:
                // Custom action for other roles
                [menuItem setTarget:delegate];
                [menuItem setAction:@selector(menuItemClicked:)];
                break;
        }
    }

    // Set custom action if no role or item type is submenu
    if (item->type != MENU_ITEM_SUBMENU && item->role == MENU_ROLE_NONE) {
        [menuItem setTarget:delegate];
        [menuItem setAction:@selector(menuItemClicked:)];
    }

    // Set represented object for callback identification
    NSString* itemId = [NSString stringWithUTF8String:item->id];
    [menuItem setRepresentedObject:itemId];

    // Register item for later updates
    [delegate registerItem:menuItem withId:itemId];

    // Handle submenu
    if (item->type == MENU_ITEM_SUBMENU && item->submenu_items && item->submenu_count > 0) {
        NSMenu* submenu = [[NSMenu alloc] initWithTitle:label];
        [submenu setAutoenablesItems:NO];

        platform_menu_item_t* subItems = (platform_menu_item_t*)item->submenu_items;
        for (int i = 0; i < item->submenu_count; i++) {
            NSMenuItem* subMenuItem = createMenuItem(&subItems[i], delegate);
            [submenu addItem:subMenuItem];
        }

        [menuItem setSubmenu:submenu];
    }

    return menuItem;
}

// ============================================================================
// Public API Implementation
// ============================================================================

extern "C" {

int platform_menu_set(void* window, const platform_menu_t* menus, int menu_count,
                      platform_menu_callback_t callback, void* user_data) {
    if (!menus || menu_count <= 0) return -1;

    @autoreleasepool {
        // Create or get delegate
        if (!g_menuDelegate) {
            g_menuDelegate = [[MenuDelegate alloc] init];
        }
        g_menuDelegate.callback = callback;
        g_menuDelegate.userData = user_data;
        [g_menuDelegate.itemsById removeAllObjects];

        // Create main menu bar
        NSMenu* mainMenu = [[NSMenu alloc] init];
        [mainMenu setAutoenablesItems:NO];

        // Add each top-level menu
        for (int i = 0; i < menu_count; i++) {
            const platform_menu_t* menu = &menus[i];

            NSString* menuLabel = [NSString stringWithUTF8String:menu->label];
            // Remove & accelerator hints
            menuLabel = [menuLabel stringByReplacingOccurrencesOfString:@"&" withString:@""];

            NSMenuItem* topItem = [[NSMenuItem alloc] initWithTitle:menuLabel
                                                            action:nil
                                                     keyEquivalent:@""];

            NSMenu* submenu = [[NSMenu alloc] initWithTitle:menuLabel];
            [submenu setAutoenablesItems:NO];

            // Add items to this menu
            for (int j = 0; j < menu->item_count; j++) {
                NSMenuItem* menuItem = createMenuItem(&menu->items[j], g_menuDelegate);
                [submenu addItem:menuItem];
            }

            [topItem setSubmenu:submenu];
            [mainMenu addItem:topItem];
        }

        // Set as application menu
        [NSApp setMainMenu:mainMenu];

        return 0;
    }
}

int platform_menu_set_from_json(void* window, const char* menu_json,
                                platform_menu_callback_t callback, void* user_data) {
    if (!menu_json) return -1;

    @autoreleasepool {
        // Parse JSON
        NSData* data = [[NSString stringWithUTF8String:menu_json] dataUsingEncoding:NSUTF8StringEncoding];
        if (!data) return -1;

        NSError* error = nil;
        NSArray* menuArray = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
        if (error || ![menuArray isKindOfClass:[NSArray class]]) return -1;

        // Create or get delegate
        if (!g_menuDelegate) {
            g_menuDelegate = [[MenuDelegate alloc] init];
        }
        g_menuDelegate.callback = callback;
        g_menuDelegate.userData = user_data;
        [g_menuDelegate.itemsById removeAllObjects];

        // Create main menu bar
        NSMenu* mainMenu = [[NSMenu alloc] init];
        [mainMenu setAutoenablesItems:NO];

        // Process each top-level menu
        for (NSDictionary* menuDict in menuArray) {
            if (![menuDict isKindOfClass:[NSDictionary class]]) continue;

            NSString* label = menuDict[@"label"] ?: @"Menu";
            label = [label stringByReplacingOccurrencesOfString:@"&" withString:@""];

            NSMenuItem* topItem = [[NSMenuItem alloc] initWithTitle:label
                                                            action:nil
                                                     keyEquivalent:@""];

            NSMenu* submenu = [[NSMenu alloc] initWithTitle:label];
            [submenu setAutoenablesItems:NO];

            // Process items
            NSArray* items = menuDict[@"items"];
            if ([items isKindOfClass:[NSArray class]]) {
                for (NSDictionary* itemDict in items) {
                    if (![itemDict isKindOfClass:[NSDictionary class]]) continue;

                    NSString* itemType = itemDict[@"type"] ?: @"normal";

                    if ([itemType isEqualToString:@"separator"]) {
                        [submenu addItem:[NSMenuItem separatorItem]];
                        continue;
                    }

                    NSString* itemLabel = itemDict[@"label"] ?: @"Item";
                    itemLabel = [itemLabel stringByReplacingOccurrencesOfString:@"&" withString:@""];

                    NSMenuItem* menuItem = [[NSMenuItem alloc] initWithTitle:itemLabel
                                                                     action:@selector(menuItemClicked:)
                                                              keyEquivalent:@""];
                    [menuItem setTarget:g_menuDelegate];

                    // Set ID
                    NSString* itemId = itemDict[@"id"] ?: [[NSUUID UUID] UUIDString];
                    [menuItem setRepresentedObject:itemId];
                    [g_menuDelegate registerItem:menuItem withId:itemId];

                    // Set enabled state
                    NSNumber* enabled = itemDict[@"enabled"];
                    [menuItem setEnabled:(enabled == nil || [enabled boolValue])];

                    // Set checked state
                    if ([itemType isEqualToString:@"checkbox"] || [itemType isEqualToString:@"radio"]) {
                        NSNumber* checked = itemDict[@"checked"];
                        [menuItem setState:[checked boolValue] ? NSControlStateValueOn : NSControlStateValueOff];
                    }

                    // Set accelerator
                    NSString* accelerator = itemDict[@"accelerator"];
                    if (accelerator) {
                        const char* accelStr = [accelerator UTF8String];
                        setAccelerator(menuItem, accelStr);
                    }

                    // Handle role
                    NSString* role = itemDict[@"role"];
                    if (role) {
                        if ([role isEqualToString:@"undo"]) {
                            [menuItem setAction:@selector(undo:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"redo"]) {
                            [menuItem setAction:@selector(redo:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"cut"]) {
                            [menuItem setAction:@selector(cut:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"copy"]) {
                            [menuItem setAction:@selector(copy:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"paste"]) {
                            [menuItem setAction:@selector(paste:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"selectAll"]) {
                            [menuItem setAction:@selector(selectAll:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"minimize"]) {
                            [menuItem setAction:@selector(miniaturize:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"close"]) {
                            [menuItem setAction:@selector(performClose:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"quit"]) {
                            [menuItem setAction:@selector(terminate:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"toggleFullScreen"]) {
                            [menuItem setAction:@selector(toggleFullScreen:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"hide"]) {
                            [menuItem setAction:@selector(hide:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"hideOthers"]) {
                            [menuItem setAction:@selector(hideOtherApplications:)];
                            [menuItem setTarget:nil];
                        } else if ([role isEqualToString:@"unhide"]) {
                            [menuItem setAction:@selector(unhideAllApplications:)];
                            [menuItem setTarget:nil];
                        }
                    }

                    // Handle submenu
                    NSArray* subItems = itemDict[@"submenu"];
                    if ([subItems isKindOfClass:[NSArray class]] && subItems.count > 0) {
                        NSMenu* itemSubmenu = [[NSMenu alloc] initWithTitle:itemLabel];
                        [itemSubmenu setAutoenablesItems:NO];

                        for (NSDictionary* subItemDict in subItems) {
                            // Recursively create submenu items (simplified for one level)
                            NSString* subType = subItemDict[@"type"] ?: @"normal";
                            if ([subType isEqualToString:@"separator"]) {
                                [itemSubmenu addItem:[NSMenuItem separatorItem]];
                                continue;
                            }

                            NSString* subLabel = subItemDict[@"label"] ?: @"Item";
                            subLabel = [subLabel stringByReplacingOccurrencesOfString:@"&" withString:@""];

                            NSMenuItem* subMenuItem = [[NSMenuItem alloc] initWithTitle:subLabel
                                                                               action:@selector(menuItemClicked:)
                                                                        keyEquivalent:@""];
                            [subMenuItem setTarget:g_menuDelegate];

                            NSString* subId = subItemDict[@"id"] ?: [[NSUUID UUID] UUIDString];
                            [subMenuItem setRepresentedObject:subId];
                            [g_menuDelegate registerItem:subMenuItem withId:subId];

                            NSNumber* subEnabled = subItemDict[@"enabled"];
                            [subMenuItem setEnabled:(subEnabled == nil || [subEnabled boolValue])];

                            NSString* subAccel = subItemDict[@"accelerator"];
                            if (subAccel) {
                                setAccelerator(subMenuItem, [subAccel UTF8String]);
                            }

                            [itemSubmenu addItem:subMenuItem];
                        }

                        [menuItem setSubmenu:itemSubmenu];
                        [menuItem setAction:nil];
                    }

                    [submenu addItem:menuItem];
                }
            }

            [topItem setSubmenu:submenu];
            [mainMenu addItem:topItem];
        }

        [NSApp setMainMenu:mainMenu];
        return 0;
    }
}

int platform_menu_update_item(void* window, const char* item_id,
                              const char* label, int enabled, int checked) {
    if (!item_id || !g_menuDelegate) return -1;

    @autoreleasepool {
        NSString* itemId = [NSString stringWithUTF8String:item_id];
        NSMenuItem* item = [g_menuDelegate itemForId:itemId];
        if (!item) return -1;

        if (label) {
            NSString* newLabel = [NSString stringWithUTF8String:label];
            newLabel = [newLabel stringByReplacingOccurrencesOfString:@"&" withString:@""];
            [item setTitle:newLabel];
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

int platform_menu_set_item_enabled(void* window, const char* item_id, int enabled) {
    return platform_menu_update_item(window, item_id, NULL, enabled, -1);
}

int platform_menu_set_item_checked(void* window, const char* item_id, int checked) {
    return platform_menu_update_item(window, item_id, NULL, -1, checked);
}

int platform_menu_remove(void* window) {
    @autoreleasepool {
        [NSApp setMainMenu:nil];
        if (g_menuDelegate) {
            [g_menuDelegate.itemsById removeAllObjects];
        }
        return 0;
    }
}

int platform_menu_set_default(void* window, const char* app_name,
                              platform_menu_callback_t callback, void* user_data) {
    if (!app_name) return -1;

    @autoreleasepool {
        NSString* appName = [NSString stringWithUTF8String:app_name];

        // Create or get delegate
        if (!g_menuDelegate) {
            g_menuDelegate = [[MenuDelegate alloc] init];
        }
        g_menuDelegate.callback = callback;
        g_menuDelegate.userData = user_data;
        [g_menuDelegate.itemsById removeAllObjects];

        // Create main menu
        NSMenu* mainMenu = [[NSMenu alloc] init];
        [mainMenu setAutoenablesItems:NO];

        // ===== Application Menu =====
        NSMenuItem* appMenuItem = [[NSMenuItem alloc] initWithTitle:appName action:nil keyEquivalent:@""];
        NSMenu* appMenu = [[NSMenu alloc] initWithTitle:appName];
        [appMenu setAutoenablesItems:NO];

        // About
        NSMenuItem* aboutItem = [[NSMenuItem alloc] initWithTitle:[NSString stringWithFormat:@"About %@", appName]
                                                           action:@selector(orderFrontStandardAboutPanel:)
                                                    keyEquivalent:@""];
        [appMenu addItem:aboutItem];
        [appMenu addItem:[NSMenuItem separatorItem]];

        // Services
        NSMenuItem* servicesItem = [[NSMenuItem alloc] initWithTitle:@"Services" action:nil keyEquivalent:@""];
        NSMenu* servicesMenu = [[NSMenu alloc] initWithTitle:@"Services"];
        [servicesItem setSubmenu:servicesMenu];
        [NSApp setServicesMenu:servicesMenu];
        [appMenu addItem:servicesItem];
        [appMenu addItem:[NSMenuItem separatorItem]];

        // Hide
        NSMenuItem* hideItem = [[NSMenuItem alloc] initWithTitle:[NSString stringWithFormat:@"Hide %@", appName]
                                                          action:@selector(hide:)
                                                   keyEquivalent:@"h"];
        [appMenu addItem:hideItem];

        // Hide Others
        NSMenuItem* hideOthersItem = [[NSMenuItem alloc] initWithTitle:@"Hide Others"
                                                               action:@selector(hideOtherApplications:)
                                                        keyEquivalent:@"h"];
        [hideOthersItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagOption];
        [appMenu addItem:hideOthersItem];

        // Show All
        NSMenuItem* showAllItem = [[NSMenuItem alloc] initWithTitle:@"Show All"
                                                            action:@selector(unhideAllApplications:)
                                                     keyEquivalent:@""];
        [appMenu addItem:showAllItem];
        [appMenu addItem:[NSMenuItem separatorItem]];

        // Quit
        NSMenuItem* quitItem = [[NSMenuItem alloc] initWithTitle:[NSString stringWithFormat:@"Quit %@", appName]
                                                          action:@selector(terminate:)
                                                   keyEquivalent:@"q"];
        [appMenu addItem:quitItem];

        [appMenuItem setSubmenu:appMenu];
        [mainMenu addItem:appMenuItem];

        // ===== File Menu =====
        NSMenuItem* fileMenuItem = [[NSMenuItem alloc] initWithTitle:@"File" action:nil keyEquivalent:@""];
        NSMenu* fileMenu = [[NSMenu alloc] initWithTitle:@"File"];
        [fileMenu setAutoenablesItems:NO];

        // Close Window
        NSMenuItem* closeItem = [[NSMenuItem alloc] initWithTitle:@"Close Window"
                                                          action:@selector(performClose:)
                                                   keyEquivalent:@"w"];
        [fileMenu addItem:closeItem];

        [fileMenuItem setSubmenu:fileMenu];
        [mainMenu addItem:fileMenuItem];

        // ===== Edit Menu =====
        NSMenuItem* editMenuItem = [[NSMenuItem alloc] initWithTitle:@"Edit" action:nil keyEquivalent:@""];
        NSMenu* editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
        [editMenu setAutoenablesItems:NO];

        NSMenuItem* undoItem = [[NSMenuItem alloc] initWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
        [editMenu addItem:undoItem];

        NSMenuItem* redoItem = [[NSMenuItem alloc] initWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"z"];
        [redoItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagShift];
        [editMenu addItem:redoItem];
        [editMenu addItem:[NSMenuItem separatorItem]];

        NSMenuItem* cutItem = [[NSMenuItem alloc] initWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
        [editMenu addItem:cutItem];

        NSMenuItem* copyItem = [[NSMenuItem alloc] initWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
        [editMenu addItem:copyItem];

        NSMenuItem* pasteItem = [[NSMenuItem alloc] initWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
        [editMenu addItem:pasteItem];

        NSMenuItem* selectAllItem = [[NSMenuItem alloc] initWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
        [editMenu addItem:selectAllItem];

        [editMenuItem setSubmenu:editMenu];
        [mainMenu addItem:editMenuItem];

        // ===== View Menu =====
        NSMenuItem* viewMenuItem = [[NSMenuItem alloc] initWithTitle:@"View" action:nil keyEquivalent:@""];
        NSMenu* viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
        [viewMenu setAutoenablesItems:NO];

        NSMenuItem* fullscreenItem = [[NSMenuItem alloc] initWithTitle:@"Toggle Full Screen"
                                                               action:@selector(toggleFullScreen:)
                                                        keyEquivalent:@"f"];
        [fullscreenItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagControl];
        [viewMenu addItem:fullscreenItem];

        [viewMenuItem setSubmenu:viewMenu];
        [mainMenu addItem:viewMenuItem];

        // ===== Window Menu =====
        NSMenuItem* windowMenuItem = [[NSMenuItem alloc] initWithTitle:@"Window" action:nil keyEquivalent:@""];
        NSMenu* windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
        [windowMenu setAutoenablesItems:NO];

        NSMenuItem* minimizeItem = [[NSMenuItem alloc] initWithTitle:@"Minimize"
                                                             action:@selector(miniaturize:)
                                                      keyEquivalent:@"m"];
        [windowMenu addItem:minimizeItem];

        NSMenuItem* zoomItem = [[NSMenuItem alloc] initWithTitle:@"Zoom" action:@selector(zoom:) keyEquivalent:@""];
        [windowMenu addItem:zoomItem];
        [windowMenu addItem:[NSMenuItem separatorItem]];

        NSMenuItem* frontItem = [[NSMenuItem alloc] initWithTitle:@"Bring All to Front"
                                                          action:@selector(arrangeInFront:)
                                                   keyEquivalent:@""];
        [windowMenu addItem:frontItem];

        [windowMenuItem setSubmenu:windowMenu];
        [NSApp setWindowsMenu:windowMenu];
        [mainMenu addItem:windowMenuItem];

        // ===== Help Menu =====
        NSMenuItem* helpMenuItem = [[NSMenuItem alloc] initWithTitle:@"Help" action:nil keyEquivalent:@""];
        NSMenu* helpMenu = [[NSMenu alloc] initWithTitle:@"Help"];
        [helpMenu setAutoenablesItems:NO];

        NSMenuItem* helpItem = [[NSMenuItem alloc] initWithTitle:[NSString stringWithFormat:@"%@ Help", appName]
                                                          action:@selector(showHelp:)
                                                   keyEquivalent:@"?"];
        [helpMenu addItem:helpItem];

        [helpMenuItem setSubmenu:helpMenu];
        [NSApp setHelpMenu:helpMenu];
        [mainMenu addItem:helpMenuItem];

        // Set main menu
        [NSApp setMainMenu:mainMenu];

        return 0;
    }
}

int platform_menu_popup(void* window, const platform_menu_item_t* items, int item_count,
                        int x, int y, platform_menu_callback_t callback, void* user_data) {
    if (!items || item_count <= 0) return -1;

    @autoreleasepool {
        // Create or get delegate
        if (!g_menuDelegate) {
            g_menuDelegate = [[MenuDelegate alloc] init];
        }
        g_menuDelegate.callback = callback;
        g_menuDelegate.userData = user_data;

        // Create popup menu
        NSMenu* menu = [[NSMenu alloc] init];
        [menu setAutoenablesItems:NO];

        for (int i = 0; i < item_count; i++) {
            NSMenuItem* menuItem = createMenuItem(&items[i], g_menuDelegate);
            [menu addItem:menuItem];
        }

        // Convert coordinates (y needs to be flipped for macOS)
        NSPoint location = NSMakePoint(x, [[NSScreen mainScreen] frame].size.height - y);

        // Show popup
        [menu popUpMenuPositioningItem:nil atLocation:location inView:nil];

        return 0;
    }
}

} // extern "C"

#endif // __APPLE__
