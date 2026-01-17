/**
 * Child Views Example
 *
 * Demonstrates embedded child webviews within a parent window,
 * similar to Electron's BrowserView pattern.
 *
 * Run with: bun examples/child-views/main.ts
 */

import { Window } from "../../src";

async function main() {
    // Create main window
    const mainWindow = new Window({
        width: 1000,
        height: 700,
        title: 'Child Views Demo',
        debug: true
    });

    // Main window content - a simple header
    await mainWindow.setHtml(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    margin: 0;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #1e1e1e;
                    color: #fff;
                }
                .header {
                    background: #2d2d2d;
                    padding: 10px 20px;
                    border-bottom: 1px solid #404040;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 500;
                }
                .controls {
                    display: flex;
                    gap: 10px;
                }
                button {
                    background: #0078d4;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                button:hover {
                    background: #1084d8;
                }
                .info {
                    padding: 20px;
                    color: #888;
                    font-size: 13px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Child Views Demo</h1>
                <div class="controls">
                    <button onclick="tronbun.invoke('toggle-sidebar')">Toggle Sidebar</button>
                    <button onclick="tronbun.invoke('swap-z-order')">Swap Z-Order</button>
                    <button onclick="tronbun.invoke('resize-content')">Resize Content</button>
                </div>
            </div>
            <div class="info">
                The colored areas below are embedded child webviews.<br>
                Each has its own IPC handlers and can be controlled independently.
            </div>
        </body>
        </html>
    `);

    // Register main window IPC handlers
    let sidebarVisible = true;
    let contentExpanded = false;

    mainWindow.registerIPCHandler('toggle-sidebar', async () => {
        sidebarVisible = !sidebarVisible;
        const sidebar = mainWindow.getChildView('sidebar');
        if (sidebar) {
            await sidebar.setVisible(sidebarVisible);
            // Adjust content view when sidebar is hidden
            const content = mainWindow.getChildView('content');
            if (content) {
                if (sidebarVisible) {
                    await content.setBounds({ x: 200, y: 80, width: 800, height: 620 });
                } else {
                    await content.setBounds({ x: 0, y: 80, width: 1000, height: 620 });
                }
            }
        }
        console.log(`Sidebar ${sidebarVisible ? 'shown' : 'hidden'}`);
    });

    mainWindow.registerIPCHandler('swap-z-order', async () => {
        const sidebar = mainWindow.getChildView('sidebar');
        const content = mainWindow.getChildView('content');
        if (sidebar && content) {
            await sidebar.bringToFront();
            console.log('Sidebar brought to front');
        }
    });

    mainWindow.registerIPCHandler('resize-content', async () => {
        const content = mainWindow.getChildView('content');
        if (content) {
            contentExpanded = !contentExpanded;
            if (contentExpanded) {
                await content.setBounds({ x: 100, y: 60, width: 800, height: 600 });
            } else {
                await content.setBounds({ x: 200, y: 80, width: 800, height: 620 });
            }
            console.log(`Content ${contentExpanded ? 'expanded' : 'normal'}`);
        }
    });

    // Wait a bit for main window to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create sidebar child view
    const sidebar = await mainWindow.createChildView({
        id: 'sidebar',
        bounds: { x: 0, y: 80, width: 200, height: 620 },
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        margin: 0;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: #fff;
                        height: 100vh;
                        box-sizing: border-box;
                    }
                    .sidebar-header {
                        padding: 15px;
                        border-bottom: 1px solid rgba(255,255,255,0.2);
                        font-weight: 600;
                    }
                    .nav-item {
                        padding: 12px 15px;
                        cursor: pointer;
                        transition: background 0.2s;
                    }
                    .nav-item:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .nav-item.active {
                        background: rgba(255,255,255,0.2);
                    }
                    .counter {
                        padding: 15px;
                        margin-top: 20px;
                        background: rgba(0,0,0,0.2);
                        text-align: center;
                    }
                    .counter-value {
                        font-size: 48px;
                        font-weight: bold;
                    }
                    button {
                        margin-top: 10px;
                        padding: 8px 16px;
                        background: rgba(255,255,255,0.2);
                        border: 1px solid rgba(255,255,255,0.3);
                        color: white;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    button:hover {
                        background: rgba(255,255,255,0.3);
                    }
                </style>
            </head>
            <body>
                <div class="sidebar-header">Sidebar View</div>
                <div class="nav-item active" onclick="selectItem(0)">Dashboard</div>
                <div class="nav-item" onclick="selectItem(1)">Settings</div>
                <div class="nav-item" onclick="selectItem(2)">Profile</div>
                <div class="nav-item" onclick="selectItem(3)">Help</div>

                <div class="counter">
                    <div>Click Count</div>
                    <div class="counter-value" id="counter">0</div>
                    <button onclick="incrementCounter()">Increment</button>
                    <button onclick="sendToContent()">Send to Content</button>
                </div>

                <script>
                    let counter = 0;

                    function selectItem(index) {
                        document.querySelectorAll('.nav-item').forEach((el, i) => {
                            el.classList.toggle('active', i === index);
                        });
                        // Notify main window
                        tronbun.invoke('sidebar-selection', { index });
                    }

                    function incrementCounter() {
                        counter++;
                        document.getElementById('counter').textContent = counter;
                    }

                    async function sendToContent() {
                        const result = await tronbun.invoke('send-to-content', { value: counter });
                        console.log('Result from main:', result);
                    }
                </script>
            </body>
            </html>
        `
    });

    // Register sidebar IPC handlers
    sidebar.registerIPCHandler('sidebar-selection', (data) => {
        console.log(`Sidebar selection: ${data.index}`);
        return { acknowledged: true };
    });

    sidebar.registerIPCHandler('send-to-content', async (data) => {
        // Forward to content view via main window
        const content = mainWindow.getChildView('content');
        if (content) {
            await content.eval(`updateFromSidebar(${data.value})`);
        }
        return { forwarded: true, value: data.value };
    });

    // Create main content child view
    const content = await mainWindow.createChildView({
        id: 'content',
        bounds: { x: 200, y: 80, width: 800, height: 620 },
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        margin: 0;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                        color: #fff;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                    }
                    h1 {
                        font-size: 36px;
                        margin-bottom: 10px;
                    }
                    .subtitle {
                        font-size: 14px;
                        opacity: 0.8;
                        margin-bottom: 30px;
                    }
                    .received-value {
                        font-size: 24px;
                        padding: 20px 40px;
                        background: rgba(0,0,0,0.2);
                        border-radius: 8px;
                        margin: 20px 0;
                    }
                    .actions {
                        display: flex;
                        gap: 10px;
                        margin-top: 20px;
                    }
                    button {
                        padding: 12px 24px;
                        background: rgba(255,255,255,0.2);
                        border: 1px solid rgba(255,255,255,0.3);
                        color: white;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    }
                    button:hover {
                        background: rgba(255,255,255,0.3);
                    }
                </style>
            </head>
            <body>
                <h1>Content View</h1>
                <div class="subtitle">This is an embedded child webview</div>

                <div class="received-value">
                    Value from sidebar: <span id="sidebar-value">0</span>
                </div>

                <div class="actions">
                    <button onclick="sendToMain()">Send to Main</button>
                    <button onclick="changeColor()">Change Color</button>
                </div>

                <script>
                    let colorIndex = 0;
                    const colors = [
                        'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                        'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)',
                        'linear-gradient(135deg, #00b4db 0%, #0083b0 100%)',
                        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
                    ];

                    function updateFromSidebar(value) {
                        document.getElementById('sidebar-value').textContent = value;
                    }

                    async function sendToMain() {
                        const result = await tronbun.invoke('content-message', {
                            message: 'Hello from content view!',
                            timestamp: Date.now()
                        });
                        console.log('Main responded:', result);
                    }

                    function changeColor() {
                        colorIndex = (colorIndex + 1) % colors.length;
                        document.body.style.background = colors[colorIndex];
                    }
                </script>
            </body>
            </html>
        `
    });

    // Register content view IPC handlers
    content.registerIPCHandler('content-message', (data) => {
        console.log(`Content view message: ${data.message}`);
        return { received: true, echo: data.message };
    });

    console.log('Child Views Demo started!');
    console.log('- Main window with header controls');
    console.log('- Sidebar child view (purple gradient)');
    console.log('- Content child view (green gradient)');
    console.log('');
    console.log('Try the controls:');
    console.log('- "Toggle Sidebar" - shows/hides sidebar');
    console.log('- "Swap Z-Order" - brings sidebar to front');
    console.log('- "Resize Content" - toggles content size');
}

main().catch(console.error);
