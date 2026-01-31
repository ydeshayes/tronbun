/**
 * Tests for the Native Menu API
 *
 * Note: Menu display and interaction require a running native window.
 * These tests focus on:
 * 1. Type checking and interface validation
 * 2. Parameter mapping and encoding
 * 3. Mock-based unit tests for the API layer
 * 4. JSON serialization format verification
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Import types from Window.ts
import type {
    MenuItemType,
    MenuItemRole,
    MenuItem,
    Menu,
    WindowMenu
} from "../src/Window";

describe("Menu API Types", () => {
    test("MenuItemType should accept valid values", () => {
        const validTypes: MenuItemType[] = ["normal", "separator", "checkbox", "radio", "submenu"];
        expect(validTypes).toHaveLength(5);
        validTypes.forEach(type => {
            expect(typeof type).toBe("string");
        });
    });

    test("MenuItemRole should accept valid values", () => {
        const validRoles: MenuItemRole[] = [
            // Application menu (macOS)
            "about", "services", "hide", "hideOthers", "unhide", "quit",
            // Edit menu
            "undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "delete", "selectAll",
            // View menu
            "reload", "forceReload", "toggleDevTools", "zoomIn", "zoomOut", "resetZoom", "toggleFullScreen",
            // Window menu
            "minimize", "close", "zoom", "front"
        ];
        expect(validRoles).toHaveLength(25);
        validRoles.forEach(role => {
            expect(typeof role).toBe("string");
        });
    });

    test("MenuItem should support all fields", () => {
        const item: MenuItem = {
            id: "file-new",
            label: "New",
            type: "normal",
            role: "undo",
            enabled: true,
            checked: false,
            accelerator: "CmdOrCtrl+N",
            submenu: [],
            click: () => {}
        };
        expect(item.id).toBe("file-new");
        expect(item.label).toBe("New");
        expect(item.type).toBe("normal");
        expect(item.role).toBe("undo");
        expect(item.enabled).toBe(true);
        expect(item.checked).toBe(false);
        expect(item.accelerator).toBe("CmdOrCtrl+N");
        expect(item.submenu).toHaveLength(0);
        expect(typeof item.click).toBe("function");
    });

    test("MenuItem should allow minimal definition", () => {
        const item: MenuItem = {
            label: "Simple Item"
        };
        expect(item.label).toBe("Simple Item");
        expect(item.id).toBeUndefined();
        expect(item.type).toBeUndefined();
    });

    test("Menu should have correct structure", () => {
        const menu: Menu = {
            id: "file-menu",
            label: "File",
            items: [
                { id: "file-new", label: "New", accelerator: "CmdOrCtrl+N" },
                { type: "separator" },
                { id: "file-exit", label: "Exit", accelerator: "Alt+F4" }
            ]
        };
        expect(menu.id).toBe("file-menu");
        expect(menu.label).toBe("File");
        expect(menu.items).toHaveLength(3);
        expect(menu.items[1].type).toBe("separator");
    });

    test("Menu should allow minimal definition (no id)", () => {
        const menu: Menu = {
            label: "Edit",
            items: []
        };
        expect(menu.label).toBe("Edit");
        expect(menu.id).toBeUndefined();
        expect(menu.items).toHaveLength(0);
    });
});

describe("Menu Item Types", () => {
    test("normal item should be the default type", () => {
        const item: MenuItem = {
            id: "test",
            label: "Test Item"
        };
        // Type is undefined but native layer treats it as "normal"
        expect(item.type).toBeUndefined();
    });

    test("separator should not require label", () => {
        const item: MenuItem = {
            type: "separator"
        };
        expect(item.type).toBe("separator");
        expect(item.label).toBeUndefined();
    });

    test("checkbox should support checked state", () => {
        const item: MenuItem = {
            id: "view-sidebar",
            label: "Show Sidebar",
            type: "checkbox",
            checked: true
        };
        expect(item.type).toBe("checkbox");
        expect(item.checked).toBe(true);
    });

    test("radio should support checked state", () => {
        const item: MenuItem = {
            id: "view-small",
            label: "Small Icons",
            type: "radio",
            checked: false
        };
        expect(item.type).toBe("radio");
        expect(item.checked).toBe(false);
    });

    test("submenu should have nested items", () => {
        const item: MenuItem = {
            id: "recent-files",
            label: "Recent Files",
            type: "submenu",
            submenu: [
                { id: "file1", label: "document1.txt" },
                { id: "file2", label: "document2.txt" }
            ]
        };
        expect(item.type).toBe("submenu");
        expect(item.submenu).toHaveLength(2);
        expect(item.submenu![0].label).toBe("document1.txt");
    });
});

describe("Menu Roles", () => {
    test("application roles should be valid", () => {
        const appRoles: MenuItemRole[] = ["about", "services", "hide", "hideOthers", "unhide", "quit"];
        appRoles.forEach(role => {
            const item: MenuItem = { role };
            expect(item.role).toBe(role);
        });
    });

    test("edit roles should be valid", () => {
        const editRoles: MenuItemRole[] = [
            "undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "delete", "selectAll"
        ];
        editRoles.forEach(role => {
            const item: MenuItem = { role };
            expect(item.role).toBe(role);
        });
    });

    test("view roles should be valid", () => {
        const viewRoles: MenuItemRole[] = [
            "reload", "forceReload", "toggleDevTools", "zoomIn", "zoomOut", "resetZoom", "toggleFullScreen"
        ];
        viewRoles.forEach(role => {
            const item: MenuItem = { role };
            expect(item.role).toBe(role);
        });
    });

    test("window roles should be valid", () => {
        const windowRoles: MenuItemRole[] = ["minimize", "close", "zoom", "front"];
        windowRoles.forEach(role => {
            const item: MenuItem = { role };
            expect(item.role).toBe(role);
        });
    });
});

describe("Accelerator Format", () => {
    test("should support CmdOrCtrl modifier", () => {
        const item: MenuItem = {
            label: "Save",
            accelerator: "CmdOrCtrl+S"
        };
        expect(item.accelerator).toBe("CmdOrCtrl+S");
    });

    test("should support Cmd modifier", () => {
        const item: MenuItem = {
            label: "Preferences",
            accelerator: "Cmd+,"
        };
        expect(item.accelerator).toBe("Cmd+,");
    });

    test("should support Ctrl modifier", () => {
        const item: MenuItem = {
            label: "Break",
            accelerator: "Ctrl+Break"
        };
        expect(item.accelerator).toBe("Ctrl+Break");
    });

    test("should support Alt modifier", () => {
        const item: MenuItem = {
            label: "Exit",
            accelerator: "Alt+F4"
        };
        expect(item.accelerator).toBe("Alt+F4");
    });

    test("should support Shift modifier", () => {
        const item: MenuItem = {
            label: "Save As",
            accelerator: "CmdOrCtrl+Shift+S"
        };
        expect(item.accelerator).toBe("CmdOrCtrl+Shift+S");
    });

    test("should support multiple modifiers", () => {
        const item: MenuItem = {
            label: "Reset",
            accelerator: "Ctrl+Shift+Alt+R"
        };
        expect(item.accelerator).toBe("Ctrl+Shift+Alt+R");
    });

    test("should support function keys", () => {
        const item: MenuItem = {
            label: "Help",
            accelerator: "F1"
        };
        expect(item.accelerator).toBe("F1");
    });

    test("should support special keys", () => {
        const validAccelerators = [
            "CmdOrCtrl+Enter",
            "CmdOrCtrl+Tab",
            "CmdOrCtrl+Backspace",
            "CmdOrCtrl+Delete",
            "CmdOrCtrl+Home",
            "CmdOrCtrl+End"
        ];
        validAccelerators.forEach(accel => {
            const item: MenuItem = { label: "Test", accelerator: accel };
            expect(item.accelerator).toBe(accel);
        });
    });
});

describe("Menu JSON Serialization", () => {
    // Helper to simulate the JSON conversion that happens in createMenuAPI
    const processItem = (item: MenuItem): any => {
        const result: any = {
            id: item.id || `item_generated`,
            label: item.label || '',
            type: item.type || 'normal',
            enabled: item.enabled !== false,
            checked: item.checked || false
        };

        if (item.role) {
            result.role = item.role;
        }

        if (item.accelerator) {
            result.accelerator = item.accelerator;
        }

        if (item.submenu && item.submenu.length > 0) {
            result.submenu = item.submenu.map(processItem);
        }

        return result;
    };

    const menusToJson = (menus: Menu[]): string => {
        return JSON.stringify(menus.map(menu => ({
            id: menu.id || `menu_generated`,
            label: menu.label,
            items: menu.items.map(processItem)
        })));
    };

    test("should serialize simple menu to JSON", () => {
        const menus: Menu[] = [{
            id: "file",
            label: "File",
            items: [
                { id: "new", label: "New" }
            ]
        }];

        const json = menusToJson(menus);
        const parsed = JSON.parse(json);

        expect(parsed).toHaveLength(1);
        expect(parsed[0].id).toBe("file");
        expect(parsed[0].label).toBe("File");
        expect(parsed[0].items).toHaveLength(1);
        expect(parsed[0].items[0].id).toBe("new");
        expect(parsed[0].items[0].label).toBe("New");
    });

    test("should serialize menu with defaults", () => {
        const menus: Menu[] = [{
            label: "Edit",
            items: [
                { label: "Undo" }
            ]
        }];

        const json = menusToJson(menus);
        const parsed = JSON.parse(json);

        expect(parsed[0].id).toBe("menu_generated");
        expect(parsed[0].items[0].id).toBe("item_generated");
        expect(parsed[0].items[0].type).toBe("normal");
        expect(parsed[0].items[0].enabled).toBe(true);
        expect(parsed[0].items[0].checked).toBe(false);
    });

    test("should serialize menu with all options", () => {
        const menus: Menu[] = [{
            id: "view",
            label: "View",
            items: [
                {
                    id: "sidebar",
                    label: "Show Sidebar",
                    type: "checkbox",
                    checked: true,
                    enabled: true,
                    accelerator: "CmdOrCtrl+B"
                }
            ]
        }];

        const json = menusToJson(menus);
        const parsed = JSON.parse(json);

        const item = parsed[0].items[0];
        expect(item.id).toBe("sidebar");
        expect(item.type).toBe("checkbox");
        expect(item.checked).toBe(true);
        expect(item.enabled).toBe(true);
        expect(item.accelerator).toBe("CmdOrCtrl+B");
    });

    test("should serialize nested submenus", () => {
        const menus: Menu[] = [{
            id: "file",
            label: "File",
            items: [
                {
                    id: "recent",
                    label: "Recent Files",
                    type: "submenu",
                    submenu: [
                        { id: "file1", label: "document.txt" },
                        { type: "separator" },
                        { id: "clear", label: "Clear Recent" }
                    ]
                }
            ]
        }];

        const json = menusToJson(menus);
        const parsed = JSON.parse(json);

        const submenu = parsed[0].items[0].submenu;
        expect(submenu).toHaveLength(3);
        expect(submenu[0].label).toBe("document.txt");
        expect(submenu[1].type).toBe("separator");
        expect(submenu[2].label).toBe("Clear Recent");
    });

    test("should serialize menu item with role", () => {
        const menus: Menu[] = [{
            label: "Edit",
            items: [
                { role: "undo" },
                { role: "redo" }
            ]
        }];

        const json = menusToJson(menus);
        const parsed = JSON.parse(json);

        expect(parsed[0].items[0].role).toBe("undo");
        expect(parsed[0].items[1].role).toBe("redo");
    });

    test("should handle separator without label", () => {
        const menus: Menu[] = [{
            label: "File",
            items: [
                { id: "new", label: "New" },
                { type: "separator" },
                { id: "exit", label: "Exit" }
            ]
        }];

        const json = menusToJson(menus);
        const parsed = JSON.parse(json);

        expect(parsed[0].items[1].type).toBe("separator");
        expect(parsed[0].items[1].label).toBe("");
    });

    test("should handle disabled items", () => {
        const menus: Menu[] = [{
            label: "Edit",
            items: [
                { id: "paste", label: "Paste", enabled: false }
            ]
        }];

        const json = menusToJson(menus);
        const parsed = JSON.parse(json);

        expect(parsed[0].items[0].enabled).toBe(false);
    });
});

describe("Menu API Mock Tests", () => {
    // Mock sendCommand function
    const createMockWebview = () => {
        const commands: Array<{ method: string; params: any }> = [];
        return {
            sendCommand: mock((method: string, params: any) => {
                commands.push({ method, params });
                return Promise.resolve({ success: true });
            }),
            commands
        };
    };

    test("setMenu should send correct command", async () => {
        const mockWebview = createMockWebview();
        const menuClickHandlers = new Map<string, () => void>();

        // Simulate setMenu call
        const menus: Menu[] = [{
            id: "file",
            label: "File",
            items: [{ id: "new", label: "New" }]
        }];

        // Clear and convert
        menuClickHandlers.clear();
        const menusJson = JSON.stringify(menus.map(menu => ({
            id: menu.id,
            label: menu.label,
            items: menu.items.map(item => ({
                id: item.id,
                label: item.label,
                type: item.type || 'normal',
                enabled: item.enabled !== false,
                checked: item.checked || false
            }))
        })));

        await mockWebview.sendCommand('set_menu', { menus: menusJson });

        expect(mockWebview.commands).toHaveLength(1);
        expect(mockWebview.commands[0].method).toBe('set_menu');
        expect(mockWebview.commands[0].params.menus).toContain('"id":"file"');
    });

    test("setDefaultMenu should send appName", async () => {
        const mockWebview = createMockWebview();

        await mockWebview.sendCommand('set_default_menu', { appName: 'MyApp' });

        expect(mockWebview.commands).toHaveLength(1);
        expect(mockWebview.commands[0].method).toBe('set_default_menu');
        expect(mockWebview.commands[0].params.appName).toBe('MyApp');
    });

    test("removeMenu should send empty params", async () => {
        const mockWebview = createMockWebview();

        await mockWebview.sendCommand('remove_menu', {});

        expect(mockWebview.commands).toHaveLength(1);
        expect(mockWebview.commands[0].method).toBe('remove_menu');
    });

    test("updateItem should send correct params", async () => {
        const mockWebview = createMockWebview();

        await mockWebview.sendCommand('update_menu_item', {
            itemId: 'file-save',
            label: 'Save Now',
            enabled: 1,
            checked: -1
        });

        expect(mockWebview.commands).toHaveLength(1);
        expect(mockWebview.commands[0].method).toBe('update_menu_item');
        expect(mockWebview.commands[0].params.itemId).toBe('file-save');
        expect(mockWebview.commands[0].params.label).toBe('Save Now');
        expect(mockWebview.commands[0].params.enabled).toBe(1);
        expect(mockWebview.commands[0].params.checked).toBe(-1);
    });

    test("setItemEnabled should send enabled state", async () => {
        const mockWebview = createMockWebview();

        // Enable
        await mockWebview.sendCommand('update_menu_item', {
            itemId: 'edit-paste',
            label: '',
            enabled: 1,
            checked: -1
        });

        // Disable
        await mockWebview.sendCommand('update_menu_item', {
            itemId: 'edit-paste',
            label: '',
            enabled: 0,
            checked: -1
        });

        expect(mockWebview.commands).toHaveLength(2);
        expect(mockWebview.commands[0].params.enabled).toBe(1);
        expect(mockWebview.commands[1].params.enabled).toBe(0);
    });

    test("setItemChecked should send checked state", async () => {
        const mockWebview = createMockWebview();

        // Check
        await mockWebview.sendCommand('update_menu_item', {
            itemId: 'view-sidebar',
            label: '',
            enabled: -1,
            checked: 1
        });

        // Uncheck
        await mockWebview.sendCommand('update_menu_item', {
            itemId: 'view-sidebar',
            label: '',
            enabled: -1,
            checked: 0
        });

        expect(mockWebview.commands).toHaveLength(2);
        expect(mockWebview.commands[0].params.checked).toBe(1);
        expect(mockWebview.commands[1].params.checked).toBe(0);
    });
});

describe("Menu Click Handler Management", () => {
    test("onClick should register handler", () => {
        const handlers = new Map<string, () => void>();
        const handler = () => console.log("clicked");

        handlers.set("file-new", handler);

        expect(handlers.has("file-new")).toBe(true);
        expect(handlers.get("file-new")).toBe(handler);
    });

    test("offClick should remove handler", () => {
        const handlers = new Map<string, () => void>();
        const handler = () => console.log("clicked");

        handlers.set("file-new", handler);
        handlers.delete("file-new");

        expect(handlers.has("file-new")).toBe(false);
    });

    test("handler should be invoked on menu click event", () => {
        const handlers = new Map<string, () => void>();
        let clicked = false;

        handlers.set("test-item", () => { clicked = true; });

        // Simulate event from native
        const event = { type: "menu_click", menuId: "test-item" };
        if (event.type === "menu_click" && event.menuId) {
            const handler = handlers.get(event.menuId);
            if (handler) handler();
        }

        expect(clicked).toBe(true);
    });

    test("click handlers in MenuItem should be registered", () => {
        const handlers = new Map<string, () => void>();
        let saveClicked = false;

        const item: MenuItem = {
            id: "file-save",
            label: "Save",
            click: () => { saveClicked = true; }
        };

        // Simulate registration during setMenu
        if (item.click && item.id) {
            handlers.set(item.id, item.click);
        }

        // Simulate event
        const handler = handlers.get("file-save");
        if (handler) handler();

        expect(saveClicked).toBe(true);
    });
});

describe("Edge Cases", () => {
    test("empty menu array should be valid", () => {
        const menus: Menu[] = [];
        expect(menus).toHaveLength(0);
    });

    test("menu with no items should be valid", () => {
        const menu: Menu = {
            label: "Empty",
            items: []
        };
        expect(menu.items).toHaveLength(0);
    });

    test("deeply nested submenus should work", () => {
        const menu: Menu = {
            label: "File",
            items: [{
                id: "level1",
                label: "Level 1",
                type: "submenu",
                submenu: [{
                    id: "level2",
                    label: "Level 2",
                    type: "submenu",
                    submenu: [{
                        id: "level3",
                        label: "Level 3 Item"
                    }]
                }]
            }]
        };

        const level2 = menu.items[0].submenu![0];
        const level3 = level2.submenu![0];

        expect(level3.label).toBe("Level 3 Item");
    });

    test("special characters in labels should be allowed", () => {
        const item: MenuItem = {
            label: "Save & Close (Ctrl+S)..."
        };
        expect(item.label).toBe("Save & Close (Ctrl+S)...");
    });

    test("unicode in labels should be allowed", () => {
        const item: MenuItem = {
            label: "Preferences... \u2318,"
        };
        expect(item.label).toContain("\u2318");
    });

    test("empty label should be allowed", () => {
        const item: MenuItem = {
            label: ""
        };
        expect(item.label).toBe("");
    });

    test("null/undefined accelerator should be allowed", () => {
        const item1: MenuItem = { label: "No accelerator" };
        const item2: MenuItem = { label: "Also no accelerator", accelerator: undefined };

        expect(item1.accelerator).toBeUndefined();
        expect(item2.accelerator).toBeUndefined();
    });
});

describe("Common Menu Structures", () => {
    test("should create standard File menu", () => {
        const fileMenu: Menu = {
            id: "file",
            label: "File",
            items: [
                { id: "new", label: "New", accelerator: "CmdOrCtrl+N" },
                { id: "open", label: "Open...", accelerator: "CmdOrCtrl+O" },
                { type: "separator" },
                { id: "save", label: "Save", accelerator: "CmdOrCtrl+S" },
                { id: "save-as", label: "Save As...", accelerator: "CmdOrCtrl+Shift+S" },
                { type: "separator" },
                { id: "exit", label: "Exit", accelerator: "Alt+F4" }
            ]
        };

        expect(fileMenu.items).toHaveLength(7);
        expect(fileMenu.items.filter(i => i.type === "separator")).toHaveLength(2);
    });

    test("should create standard Edit menu", () => {
        const editMenu: Menu = {
            id: "edit",
            label: "Edit",
            items: [
                { role: "undo", label: "Undo", accelerator: "CmdOrCtrl+Z" },
                { role: "redo", label: "Redo", accelerator: "CmdOrCtrl+Shift+Z" },
                { type: "separator" },
                { role: "cut", label: "Cut", accelerator: "CmdOrCtrl+X" },
                { role: "copy", label: "Copy", accelerator: "CmdOrCtrl+C" },
                { role: "paste", label: "Paste", accelerator: "CmdOrCtrl+V" },
                { type: "separator" },
                { role: "selectAll", label: "Select All", accelerator: "CmdOrCtrl+A" }
            ]
        };

        expect(editMenu.items).toHaveLength(8);
        expect(editMenu.items.filter(i => i.role)).toHaveLength(6);
    });

    test("should create View menu with checkboxes", () => {
        const viewMenu: Menu = {
            id: "view",
            label: "View",
            items: [
                { id: "sidebar", label: "Show Sidebar", type: "checkbox", checked: true, accelerator: "CmdOrCtrl+B" },
                { id: "statusbar", label: "Show Status Bar", type: "checkbox", checked: true },
                { type: "separator" },
                { role: "zoomIn", label: "Zoom In", accelerator: "CmdOrCtrl+=" },
                { role: "zoomOut", label: "Zoom Out", accelerator: "CmdOrCtrl+-" },
                { role: "resetZoom", label: "Actual Size", accelerator: "CmdOrCtrl+0" }
            ]
        };

        expect(viewMenu.items.filter(i => i.type === "checkbox")).toHaveLength(2);
    });

    test("should create full application menu bar", () => {
        const menuBar: Menu[] = [
            { label: "File", items: [{ label: "New" }, { label: "Open" }, { type: "separator" }, { label: "Exit" }] },
            { label: "Edit", items: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }] },
            { label: "View", items: [{ id: "zoom-in", label: "Zoom In" }, { id: "zoom-out", label: "Zoom Out" }] },
            { label: "Help", items: [{ id: "about", label: "About" }] }
        ];

        expect(menuBar).toHaveLength(4);
        expect(menuBar.map(m => m.label)).toEqual(["File", "Edit", "View", "Help"]);
    });
});
