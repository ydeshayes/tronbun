import { Window } from "../src/Window";

const window = new Window({
  title: "Context Menu Example",
  width: 800,
  height: 600,
  html: `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Context Menu Example</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                margin: 0;
                height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
            }
            .container {
                text-align: center;
                background: rgba(255, 255, 255, 0.1);
                padding: 40px;
                border-radius: 10px;
                backdrop-filter: blur(10px);
            }
            h1 {
                margin-bottom: 20px;
            }
            p {
                margin-bottom: 10px;
                opacity: 0.9;
            }
            .status {
                margin-top: 20px;
                padding: 10px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 5px;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🖱️ Context Menu Example</h1>
            <p>Right-click anywhere on this window to see the custom context menu!</p>
            <p>The menu includes:</p>
            <ul style="text-align: left; display: inline-block;">
                <li>Hello World - Shows an alert</li>
                <li>Copy Text - Copies text to clipboard</li>
                <li>Separator</li>
                <li>Disabled Item - Cannot be clicked</li>
                <li>Reload Page - Refreshes the page</li>
            </ul>
            <div class="status" id="status">Right-click to test the context menu!</div>
        </div>

        <script>
            function updateStatus(message) {
                document.getElementById('status').textContent = message;
            }
        </script>
    </body>
    </html>
  `,
  contextMenu: [
    {
      id: "hello",
      label: "Hello World",
      callback: () => {
        console.log("Hello World clicked!");
        window.executeScript('updateStatus("Hello World was clicked!"); alert("Hello from context menu!");');
      }
    },
    {
      id: "copy",
      label: "Copy Text",
      callback: () => {
        console.log("Copy Text clicked!");
        window.executeScript('updateStatus("Copy Text was clicked!"); navigator.clipboard.writeText("Text copied from context menu!");');
      }
    },
    {
      id: "separator1",
      type: "separator"
    },
    {
      id: "disabled",
      label: "Disabled Item",
      enabled: false,
      callback: () => {
        console.log("This should not be called");
      }
    },
    {
      id: "reload",
      label: "Reload Page",
      callback: () => {
        console.log("Reload Page clicked!");
        window.executeScript('updateStatus("Reloading page..."); setTimeout(() => location.reload(), 1000);');
      }
    }
  ]
});

// You can also register callbacks after window creation
window.registerContextMenuCallback("dynamic", () => {
  console.log("Dynamic callback executed!");
});

// Example of updating context menu dynamically
setTimeout(() => {
  window.setContextMenu([
    {
      id: "new_item",
      label: "New Dynamic Item",
      callback: () => {
        window.executeScript('updateStatus("Dynamic menu item clicked!");');
      }
    },
    {
      id: "separator2",
      type: "separator"
    },
    {
      id: "clear_menu",
      label: "Clear Context Menu",
      callback: () => {
        window.clearContextMenu();
        window.executeScript('updateStatus("Context menu cleared!");');
      }
    }
  ]);
  
  window.executeScript('updateStatus("Context menu updated with new items!");');
}, 5000);

console.log("Context Menu Example started!");
console.log("Right-click on the window to test the custom context menu.");
