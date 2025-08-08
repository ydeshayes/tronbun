import { Tray, Window } from "tronbun";
import { join } from "path";

async function main() {
    console.log("🚀 Starting Tronbun Tray Example...");

    // Check if tray icons are supported
    if (!Tray.isSupported()) {
        console.error("❌ Tray icons are not supported on this platform");
        process.exit(1);
    }

    // Create a hidden window for the app (optional - you can have tray-only apps)
    const window = new Window({
        title: "Tray Example",
        width: 400,
        height: 300,
        hidden: true, // Start hidden, show via tray menu
        html: `
            <html>
            <head>
                <title>Tray Example Window</title>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        padding: 20px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        margin: 0;
                    }
                    .container {
                        text-align: center;
                        margin-top: 50px;
                    }
                    h1 { margin-bottom: 20px; }
                    p { margin: 10px 0; opacity: 0.9; }
                    .status { 
                        background: rgba(255,255,255,0.1);
                        padding: 10px;
                        border-radius: 8px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎯 Tronbun Tray Example</h1>
                    <div class="status">
                        <p>✅ Tray icon is active</p>
                        <p>Right-click the tray icon to see the menu</p>
                        <p>Left-click to toggle this window</p>
                    </div>
                    <p>This window can be controlled from the system tray!</p>
                </div>
            </body>
            </html>
        `
    });

    // Set up IPC handlers for window control
    window.registerIPCHandler('show-window', () => {
        window.showWindow();
        return 'Window shown';
    });

    window.registerIPCHandler('hide-window', () => {
        window.hideWindow();
        return 'Window hidden';
    });

    // Create tray icon with menu
    const tray = new Tray({
        icon: join(process.cwd(), "../../assets/tray-icon.png"), // Use the smaller tray icon
        tooltip: "Tronbun Tray Example - Right click for menu",
        menu: [
            {
                id: 'show',
                label: 'Show Window',
                type: 'normal',
                enabled: true
            },
            {
                id: 'hide',
                label: 'Hide Window',
                type: 'normal',
                enabled: true
            },
            {
                id: 'separator1',
                label: '',
                type: 'separator'
            },
            {
                id: 'notifications',
                label: 'Enable Notifications',
                type: 'checkbox',
                enabled: true,
                checked: true
            },
            {
                id: 'separator2',
                label: '',
                type: 'separator'
            },
            {
                id: 'about',
                label: 'About Tronbun',
                type: 'normal',
                enabled: true
            },
            {
                id: 'quit',
                label: 'Quit',
                type: 'normal',
                enabled: true,
                accelerator: 'Cmd+Q'
            }
        ]
    });

    // Handle tray icon clicks (left-click)
    tray.onClick(() => {
        console.log("🖱️ Tray icon clicked - toggling window visibility");
        // Toggle window visibility
        window.executeScript(`
            if (document.hidden || !document.hasFocus()) {
                window.tronbun.invoke('show-window');
            } else {
                window.tronbun.invoke('hide-window');
            }
        `).catch(() => {
            // If script execution fails, just show the window
            window.showWindow();
        });
    });

    // Handle menu item clicks
    tray.onMenuClick('show', (menuId) => {
        console.log(`📋 Menu item clicked: ${menuId}`);
        window.showWindow();
        window.executeScript(`
            document.querySelector('.status p:first-child').textContent = '👁️ Window is now visible';
        `);
    });

    tray.onMenuClick('hide', (menuId) => {
        console.log(`📋 Menu item clicked: ${menuId}`);
        window.hideWindow();
    });

    tray.onMenuClick('notifications', async (menuId) => {
        console.log(`📋 Menu item clicked: ${menuId}`);
        
        // Show a test notification
        await tray.showNotification(
            "Tronbun Tray Example", 
            "Notifications are working! 🎉"
        );

        // Update menu to show notifications are enabled
        await tray.setMenu([
            {
                id: 'show',
                label: 'Show Window',
                type: 'normal',
                enabled: true
            },
            {
                id: 'hide',
                label: 'Hide Window', 
                type: 'normal',
                enabled: true
            },
            {
                id: 'separator1',
                label: '',
                type: 'separator'
            },
            {
                id: 'notifications',
                label: 'Notifications Enabled ✓',
                type: 'checkbox',
                enabled: true,
                checked: true
            },
            {
                id: 'separator2',
                label: '',
                type: 'separator'
            },
            {
                id: 'about',
                label: 'About Tronbun',
                type: 'normal',
                enabled: true
            },
            {
                id: 'quit',
                label: 'Quit',
                type: 'normal',
                enabled: true,
                accelerator: 'Cmd+Q'
            }
        ]);
    });

    tray.onMenuClick('about', async (menuId) => {
        console.log(`📋 Menu item clicked: ${menuId}`);
        
        await tray.showNotification(
            "About Tronbun", 
            "Tronbun is a modern desktop app framework using Bun + WebView with cross-platform tray support!"
        );
        
        window.showWindow();
        window.executeScript(`
            document.querySelector('.container').innerHTML += 
                '<div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-top: 20px;">' +
                '<h3>About Tronbun</h3>' +
                '<p>A modern desktop app framework</p>' +
                '<p>Built with Bun + WebView + Native APIs</p>' +
                '<p>Cross-platform tray icon support ✨</p>' +
                '</div>';
        `);
    });

    tray.onMenuClick('quit', async (menuId) => {
        console.log(`📋 Menu item clicked: ${menuId} - Quitting application`);
        
        await tray.showNotification("Goodbye!", "Thanks for trying Tronbun! 👋");
        
        // Clean up and exit
        setTimeout(async () => {
            await tray.destroy();
            await window.close();
            process.exit(0);
        }, 1000);
    });

    // Handle process termination
    process.on('SIGINT', async () => {
        console.log("\n🛑 Received SIGINT, cleaning up...");
        await tray.destroy();
        await window.close();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log("\n🛑 Received SIGTERM, cleaning up...");
        await tray.destroy();
        await window.close();
        process.exit(0);
    });

    console.log("✅ Tray example is running!");
    console.log("📍 Look for the tray icon in your system tray");
    console.log("🖱️  Left-click to toggle window, right-click for menu");
    console.log("⏹️  Press Ctrl+C to quit");

    // Show a welcome notification
    setTimeout(async () => {
        await tray.showNotification(
            "Tronbun Tray Example Started!", 
            "Right-click the tray icon to see available options."
        );
    }, 1000);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the application
main().catch((error) => {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
});
