/**
 * Manual Test App for Native Menus
 *
 * This app provides an interactive UI to test all menu functionality:
 * - Setting custom menus
 * - Default application menus
 * - Menu item types (normal, separator, checkbox, radio, submenu)
 * - Accelerators (keyboard shortcuts)
 * - Enabling/disabling items
 * - Checking/unchecking items
 * - Click handlers
 *
 * Run with: bun run examples/menu-test/index.ts
 */

import { Window, type Menu, type MenuItem } from "../../src";

const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Menu API Test</title>
    <style>
        * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        h1 {
            color: white;
            text-shadow: 0 2px 4px rgba(0,0,0,0.2);
            margin-bottom: 30px;
        }
        .section {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .section h2 {
            margin-top: 0;
            color: #333;
            border-bottom: 2px solid #11998e;
            padding-bottom: 10px;
        }
        .button-group {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 15px;
        }
        button {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        button:active {
            transform: translateY(0);
        }
        .btn-primary {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            color: white;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-danger {
            background: #e74c3c;
            color: white;
        }
        .btn-info {
            background: #3498db;
            color: white;
        }
        .btn-warning {
            background: #f39c12;
            color: white;
        }
        .info-box {
            background: #e8f5e9;
            border-left: 4px solid #4caf50;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 0 8px 8px 0;
        }
        .info-box h3 {
            margin: 0 0 10px 0;
            color: #2e7d32;
        }
        .info-box ul {
            margin: 0;
            padding-left: 20px;
        }
        .info-box li {
            margin: 5px 0;
        }
        code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 13px;
        }
        #log {
            background: #1e1e1e;
            color: #00ff00;
            border-radius: 8px;
            padding: 15px;
            font-family: monospace;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
        }
        #log div {
            margin-bottom: 5px;
        }
        .timestamp {
            color: #888;
        }
        .status {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            margin-left: 10px;
        }
        .status.active {
            background: #d4edda;
            color: #155724;
        }
        .status.inactive {
            background: #f8d7da;
            color: #721c24;
        }
        #currentMenu {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
            font-family: monospace;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Native Menu API Test</h1>

        <!-- Menu Setup Section -->
        <div class="section">
            <h2>Menu Setup</h2>
            <div class="info-box">
                <h3>Instructions</h3>
                <ul>
                    <li>Click "Set Custom Menu" to create a menu bar with File, Edit, View, and Help menus</li>
                    <li>Click "Set Default Menu" to use the standard application menu</li>
                    <li>Use the menu bar at the top of the window to test functionality</li>
                    <li>Menu clicks will be logged below</li>
                </ul>
            </div>
            <div class="button-group">
                <button class="btn-primary" onclick="setCustomMenu()">Set Custom Menu</button>
                <button class="btn-secondary" onclick="setDefaultMenu()">Set Default Menu</button>
                <button class="btn-danger" onclick="removeMenu()">Remove Menu</button>
            </div>
            <div id="currentMenu">No menu set yet. Click a button above to set the menu.</div>
        </div>

        <!-- Dynamic Updates Section -->
        <div class="section">
            <h2>Dynamic Menu Updates</h2>
            <p>Test updating menu items after they've been created:</p>
            <div class="button-group">
                <button class="btn-info" onclick="toggleSaveEnabled()">Toggle "Save" Enabled</button>
                <button class="btn-info" onclick="toggleSidebarChecked()">Toggle "Sidebar" Checked</button>
                <button class="btn-warning" onclick="updateSaveLabel()">Change "Save" Label</button>
            </div>
            <div style="margin-top: 15px;">
                <strong>Current States:</strong><br>
                Save: <span id="saveStatus" class="status active">Enabled</span><br>
                Sidebar: <span id="sidebarStatus" class="status active">Checked</span>
            </div>
        </div>

        <!-- Handler Section -->
        <div class="section">
            <h2>Additional Handlers</h2>
            <p>Register additional click handlers dynamically:</p>
            <div class="button-group">
                <button class="btn-info" onclick="registerHandler()">Register "New" Handler</button>
                <button class="btn-danger" onclick="unregisterHandler()">Unregister "New" Handler</button>
            </div>
        </div>

        <!-- Event Log Section -->
        <div class="section">
            <h2>Event Log</h2>
            <div id="log"></div>
        </div>
    </div>

    <script>
        let saveEnabled = true;
        let sidebarChecked = true;
        let saveLabel = 'Save';

        function log(message, type = 'info') {
            const logDiv = document.getElementById('log');
            const timestamp = new Date().toLocaleTimeString();
            const colors = {
                info: '#00ff00',
                success: '#27ae60',
                error: '#e74c3c',
                click: '#f39c12',
                menu: '#9b59b6'
            };
            logDiv.innerHTML += '<div><span class="timestamp">[' + timestamp + ']</span> <span style="color:' + (colors[type] || colors.info) + '">' + message + '</span></div>';
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        function updateMenuStatus(text) {
            document.getElementById('currentMenu').innerHTML = text;
        }

        async function setCustomMenu() {
            log('Setting custom menu...', 'menu');
            try {
                await tronbun.invoke('set-custom-menu', {});
                log('Custom menu set successfully!', 'success');
                updateMenuStatus(\`
<strong>Current Menu:</strong> Custom Menu
<br><br>
<strong>Menus:</strong>
<ul>
<li><strong>File</strong>: New (Cmd+N), Open (Cmd+O), -, Save (Cmd+S), Save As (Cmd+Shift+S), -, Recent Files >, -, Exit</li>
<li><strong>Edit</strong>: Undo (Cmd+Z), Redo (Cmd+Shift+Z), -, Cut (Cmd+X), Copy (Cmd+C), Paste (Cmd+V), -, Select All (Cmd+A)</li>
<li><strong>View</strong>: [x] Sidebar (Cmd+B), [ ] Status Bar, -, Zoom In (Cmd+=), Zoom Out (Cmd+-), Reset Zoom (Cmd+0)</li>
<li><strong>Help</strong>: Documentation, -, About</li>
</ul>
                \`);
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function setDefaultMenu() {
            log('Setting default menu...', 'menu');
            try {
                await tronbun.invoke('set-default-menu', {});
                log('Default menu set successfully!', 'success');
                updateMenuStatus(\`
<strong>Current Menu:</strong> Default Application Menu
<br><br>
Standard menus with platform-appropriate items.
                \`);
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function removeMenu() {
            log('Removing menu...', 'menu');
            try {
                await tronbun.invoke('remove-menu', {});
                log('Menu removed', 'success');
                updateMenuStatus('No menu set. Click a button above to set the menu.');
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function toggleSaveEnabled() {
            saveEnabled = !saveEnabled;
            log('Toggling Save enabled to: ' + saveEnabled, 'info');
            try {
                await tronbun.invoke('set-save-enabled', { enabled: saveEnabled });
                document.getElementById('saveStatus').className = 'status ' + (saveEnabled ? 'active' : 'inactive');
                document.getElementById('saveStatus').textContent = saveEnabled ? 'Enabled' : 'Disabled';
                log('Save is now ' + (saveEnabled ? 'enabled' : 'disabled'), 'success');
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function toggleSidebarChecked() {
            sidebarChecked = !sidebarChecked;
            log('Toggling Sidebar checked to: ' + sidebarChecked, 'info');
            try {
                await tronbun.invoke('set-sidebar-checked', { checked: sidebarChecked });
                document.getElementById('sidebarStatus').className = 'status ' + (sidebarChecked ? 'active' : 'inactive');
                document.getElementById('sidebarStatus').textContent = sidebarChecked ? 'Checked' : 'Unchecked';
                log('Sidebar is now ' + (sidebarChecked ? 'checked' : 'unchecked'), 'success');
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function updateSaveLabel() {
            saveLabel = saveLabel === 'Save' ? 'Save Document' : 'Save';
            log('Updating Save label to: ' + saveLabel, 'info');
            try {
                await tronbun.invoke('update-save-label', { label: saveLabel });
                log('Save label updated to: ' + saveLabel, 'success');
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function registerHandler() {
            log('Registering handler for "New"...', 'info');
            try {
                await tronbun.invoke('register-new-handler', {});
                log('Handler registered for "New" item', 'success');
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function unregisterHandler() {
            log('Unregistering handler for "New"...', 'info');
            try {
                await tronbun.invoke('unregister-new-handler', {});
                log('Handler unregistered for "New" item', 'success');
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        // Listen for menu click events from backend
        window.menuClicked = function(itemId) {
            log('Menu item clicked: ' + itemId, 'click');
        };

        // Initialize
        log('Menu test app loaded. Ready to test!', 'success');
        log('Tip: Try setting a custom menu and clicking menu items.', 'info');
    </script>
</body>
</html>
`;

async function main() {
    console.log("Starting Menu Test App...");

    const win = new Window({
        title: "Menu API Test",
        width: 950,
        height: 850
    });

    // Helper to notify UI of menu clicks
    const notifyMenuClick = async (itemId: string) => {
        await win.eval(`window.menuClicked && window.menuClicked('${itemId}')`);
    };

    // Create custom menu structure
    const createCustomMenu = (): Menu[] => {
        return [
            {
                id: "file",
                label: "File",
                items: [
                    {
                        id: "file-new",
                        label: "New",
                        accelerator: "CmdOrCtrl+N",
                        click: () => { console.log("New clicked"); notifyMenuClick("file-new"); }
                    },
                    {
                        id: "file-open",
                        label: "Open...",
                        accelerator: "CmdOrCtrl+O",
                        click: () => { console.log("Open clicked"); notifyMenuClick("file-open"); }
                    },
                    { type: "separator" },
                    {
                        id: "file-save",
                        label: "Save",
                        accelerator: "CmdOrCtrl+S",
                        click: () => { console.log("Save clicked"); notifyMenuClick("file-save"); }
                    },
                    {
                        id: "file-save-as",
                        label: "Save As...",
                        accelerator: "CmdOrCtrl+Shift+S",
                        click: () => { console.log("Save As clicked"); notifyMenuClick("file-save-as"); }
                    },
                    { type: "separator" },
                    {
                        id: "file-recent",
                        label: "Recent Files",
                        type: "submenu",
                        submenu: [
                            {
                                id: "recent-1",
                                label: "document1.txt",
                                click: () => { console.log("Recent 1 clicked"); notifyMenuClick("recent-1"); }
                            },
                            {
                                id: "recent-2",
                                label: "project.json",
                                click: () => { console.log("Recent 2 clicked"); notifyMenuClick("recent-2"); }
                            },
                            {
                                id: "recent-3",
                                label: "notes.md",
                                click: () => { console.log("Recent 3 clicked"); notifyMenuClick("recent-3"); }
                            },
                            { type: "separator" },
                            {
                                id: "recent-clear",
                                label: "Clear Recent",
                                click: () => { console.log("Clear Recent clicked"); notifyMenuClick("recent-clear"); }
                            }
                        ]
                    },
                    { type: "separator" },
                    {
                        id: "file-exit",
                        label: "Exit",
                        accelerator: "Alt+F4",
                        click: () => {
                            console.log("Exit clicked");
                            notifyMenuClick("file-exit");
                            process.exit(0);
                        }
                    }
                ]
            },
            {
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
            },
            {
                id: "view",
                label: "View",
                items: [
                    {
                        id: "view-sidebar",
                        label: "Sidebar",
                        type: "checkbox",
                        checked: true,
                        accelerator: "CmdOrCtrl+B",
                        click: () => { console.log("Sidebar toggled"); notifyMenuClick("view-sidebar"); }
                    },
                    {
                        id: "view-statusbar",
                        label: "Status Bar",
                        type: "checkbox",
                        checked: false,
                        click: () => { console.log("Status Bar toggled"); notifyMenuClick("view-statusbar"); }
                    },
                    { type: "separator" },
                    {
                        id: "view-zoom-in",
                        label: "Zoom In",
                        accelerator: "CmdOrCtrl+=",
                        click: () => { console.log("Zoom In clicked"); notifyMenuClick("view-zoom-in"); }
                    },
                    {
                        id: "view-zoom-out",
                        label: "Zoom Out",
                        accelerator: "CmdOrCtrl+-",
                        click: () => { console.log("Zoom Out clicked"); notifyMenuClick("view-zoom-out"); }
                    },
                    {
                        id: "view-zoom-reset",
                        label: "Reset Zoom",
                        accelerator: "CmdOrCtrl+0",
                        click: () => { console.log("Reset Zoom clicked"); notifyMenuClick("view-zoom-reset"); }
                    }
                ]
            },
            {
                id: "help",
                label: "Help",
                items: [
                    {
                        id: "help-docs",
                        label: "Documentation",
                        click: () => { console.log("Documentation clicked"); notifyMenuClick("help-docs"); }
                    },
                    { type: "separator" },
                    {
                        id: "help-about",
                        label: "About",
                        click: async () => {
                            console.log("About clicked");
                            notifyMenuClick("help-about");
                            await win.dialog.showInfo("Menu API Test App\nVersion 1.0.0\n\nBuilt with Tronbun", "About");
                        }
                    }
                ]
            }
        ];
    };

    // Menu operation handlers
    win.handle("set-custom-menu", async () => {
        const menus = createCustomMenu();
        await win.menu.setMenu(menus);
        console.log("Custom menu set");
    });

    win.handle("set-default-menu", async () => {
        await win.menu.setDefaultMenu("Menu Test App");
        console.log("Default menu set");
    });

    win.handle("remove-menu", async () => {
        await win.menu.removeMenu();
        console.log("Menu removed");
    });

    win.handle("set-save-enabled", async (data: { enabled: boolean }) => {
        await win.menu.setItemEnabled("file-save", data.enabled);
        console.log("Save enabled:", data.enabled);
    });

    win.handle("set-sidebar-checked", async (data: { checked: boolean }) => {
        await win.menu.setItemChecked("view-sidebar", data.checked);
        console.log("Sidebar checked:", data.checked);
    });

    win.handle("update-save-label", async (data: { label: string }) => {
        await win.menu.updateItem("file-save", { label: data.label });
        console.log("Save label updated to:", data.label);
    });

    win.handle("register-new-handler", async () => {
        win.menu.onClick("file-new", () => {
            console.log("New handler (dynamically registered)");
            notifyMenuClick("file-new (dynamic handler)");
        });
        console.log("Handler registered for file-new");
    });

    win.handle("unregister-new-handler", async () => {
        win.menu.offClick("file-new");
        console.log("Handler unregistered for file-new");
    });

    // Load HTML and show window
    await win.setHtml(html);
    await win.showWindow();

    console.log("Menu Test App is running. Close the window to exit.");
}

main().catch(console.error);
