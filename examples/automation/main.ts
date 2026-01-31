/**
 * Automation Example
 *
 * Demonstrates the Protocol API for browser automation.
 * Useful for AI agents to navigate, read content, and interact with web pages.
 *
 * Run with: bun run examples/automation/main.ts
 */

import { Window } from "../../src";

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("Starting automation example...\n");

    // Create a window
    const window = new Window({
        width: 1200,
        height: 800,
        title: "Automation Demo",
        debug: false
    });

    // Navigate to a test page
    await window.setHtml(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Automation Test Page</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 800px;
                    margin: 50px auto;
                    padding: 20px;
                    background: #f5f5f5;
                }
                .card {
                    background: white;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                h1 { color: #333; }
                input, textarea {
                    width: 100%;
                    padding: 10px;
                    margin: 10px 0;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    box-sizing: border-box;
                }
                button {
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 5px;
                }
                button:hover { background: #0056b3; }
                #output {
                    background: #f8f9fa;
                    border: 1px solid #ddd;
                    padding: 15px;
                    border-radius: 4px;
                    min-height: 100px;
                    white-space: pre-wrap;
                    font-family: monospace;
                }
                .status { color: #28a745; font-weight: bold; }
                .hidden { display: none; }
            </style>
        </head>
        <body>
            <h1>Automation Test Page</h1>

            <div class="card">
                <h2>Form Interaction</h2>
                <input type="text" id="nameInput" placeholder="Enter your name">
                <input type="email" id="emailInput" placeholder="Enter your email">
                <textarea id="messageInput" placeholder="Enter a message" rows="3"></textarea>

                <div style="margin: 15px 0; padding: 15px; border: 2px dashed #ddd; border-radius: 8px; text-align: center;" id="uploadArea">
                    <input type="file" id="fileInput" accept="image/*,.pdf" style="position: absolute; opacity: 0; width: 1px; height: 1px;">
                    <label for="fileInput" style="cursor: pointer; color: #666; display: block;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" style="margin-bottom: 8px;">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <div><strong>File Upload:</strong> Click to select a file</div>
                    </label>
                    <div id="fileInfo" style="margin-top: 15px; padding: 12px; background: #e8f5e9; border-radius: 6px; display: none; text-align: left;">
                        <p style="margin: 0 0 5px;"><strong>Selected:</strong> <span id="fileName" style="color: #2e7d32;"></span></p>
                        <p style="margin: 0;"><strong>Size:</strong> <span id="fileSize" style="color: #666;"></span></p>
                        <img id="filePreview" style="max-width: 100%; max-height: 150px; margin-top: 10px; border-radius: 4px; display: none;">
                    </div>
                </div>

                <button id="submitBtn" onclick="handleSubmit()">Submit</button>
                <button id="clearBtn" onclick="handleClear()">Clear</button>
            </div>

            <div class="card">
                <h2>Click Counter</h2>
                <p>Clicks: <span id="clickCount">0</span></p>
                <button id="incrementBtn" onclick="increment()">Increment</button>
                <button id="decrementBtn" onclick="decrement()">Decrement</button>
            </div>

            <div class="card">
                <h2>Dynamic Content</h2>
                <button id="loadBtn" onclick="loadContent()">Load Content</button>
                <div id="dynamicContent" class="hidden">
                    <p class="status">Content loaded successfully!</p>
                    <p>This content was loaded dynamically.</p>
                </div>
            </div>

            <div class="card">
                <h2>Output</h2>
                <div id="output">Waiting for interactions...</div>
            </div>

            <script>
                let clickCount = 0;

                function log(message) {
                    const output = document.getElementById('output');
                    output.textContent = new Date().toLocaleTimeString() + ': ' + message + '\\n' + output.textContent;
                }

                function handleSubmit() {
                    const name = document.getElementById('nameInput').value;
                    const email = document.getElementById('emailInput').value;
                    const message = document.getElementById('messageInput').value;
                    log('Form submitted - Name: ' + name + ', Email: ' + email + ', Message: ' + message);
                }

                function handleClear() {
                    document.getElementById('nameInput').value = '';
                    document.getElementById('emailInput').value = '';
                    document.getElementById('messageInput').value = '';
                    log('Form cleared');
                }

                function increment() {
                    clickCount++;
                    document.getElementById('clickCount').textContent = clickCount;
                    log('Count incremented to ' + clickCount);
                }

                function decrement() {
                    clickCount--;
                    document.getElementById('clickCount').textContent = clickCount;
                    log('Count decremented to ' + clickCount);
                }

                function loadContent() {
                    document.getElementById('dynamicContent').classList.remove('hidden');
                    log('Dynamic content loaded');
                }

                // File upload handler
                document.getElementById('fileInput').addEventListener('change', function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        document.getElementById('fileInfo').style.display = 'block';
                        document.getElementById('fileName').textContent = file.name;
                        document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(2) + ' KB';
                        log('File selected: ' + file.name + ' (' + (file.size / 1024).toFixed(2) + ' KB)');

                        // Show preview for images
                        if (file.type.startsWith('image/')) {
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                const preview = document.getElementById('filePreview');
                                preview.src = e.target.result;
                                preview.style.display = 'block';
                            };
                            reader.readAsDataURL(file);
                        }
                    }
                });
            </script>
        </body>
        </html>
    `);

    await window.setTitle("Automation Demo - Running Tests");

    // Wait for page to load
    await sleep(1000);

    console.log("=== Testing Automation API ===\n");

    // Test 1: Get page title
    console.log("1. Getting page title...");
    try {
        const title = await window.automation.getTitle();
        console.log(`   Title: ${title}\n`);
    } catch (e) {
        console.log(`   Error: ${e}\n`);
    }

    // Test 2: Get page text
    console.log("2. Getting page text (first 200 chars)...");
    try {
        const text = await window.automation.getText();
        console.log(`   Text: ${text.substring(0, 200)}...\n`);
    } catch (e) {
        console.log(`   Error: ${e}\n`);
    }

    // Test 3: Query DOM elements
    console.log("3. Querying DOM elements...");
    try {
        const buttons = await window.automation.querySelectorAll("button");
        console.log(`   Found ${buttons.length} buttons:`);
        buttons.forEach((btn, i) => {
            console.log(`   - Button ${i + 1}: "${btn.textContent}" (id: ${btn.id || 'none'})`);
        });
    } catch (e) {
        console.log(`   Error: ${e}`);
    }
    console.log();

    // Test 4: Fill form using automation API
    console.log("4. Filling form using automation.type()...");
    try {
        await window.automation.type("#nameInput", "John Doe");
        await window.automation.type("#emailInput", "john@example.com");
        await window.automation.type("#messageInput", "Hello from automation!");
        console.log("   Form filled!\n");
    } catch (e) {
        console.log(`   Error: ${e}\n`);
    }

    // Test 5: Click submit button
    console.log("5. Clicking submit button...");
    try {
        await window.automation.click("#submitBtn");
        await sleep(500);
        console.log("   Submitted!\n");
    } catch (e) {
        console.log(`   Error: ${e}\n`);
    }

    // Test 6: Click counter buttons
    console.log("6. Testing click counter...");
    try {
        for (let i = 0; i < 5; i++) {
            await window.automation.click("#incrementBtn");
            await sleep(100);
        }
        const countEl = await window.automation.querySelector("#clickCount");
        console.log(`   Click count: ${countEl?.textContent}\n`);
    } catch (e) {
        console.log(`   Error: ${e}\n`);
    }

    // Test 7: Wait for selector and click
    console.log("7. Loading dynamic content...");
    try {
        await window.automation.click("#loadBtn");
        const found = await window.automation.waitForSelector(".status", 3000);
        console.log(`   Dynamic content loaded: ${found}\n`);
    } catch (e) {
        console.log(`   Error: ${e}\n`);
    }

    // Test 8: Get element info
    console.log("8. Getting element info...");
    try {
        const statusEl = await window.automation.querySelector(".status");
        if (statusEl) {
            console.log(`   Status element:`);
            console.log(`   - Tag: ${statusEl.tagName}`);
            console.log(`   - Text: ${statusEl.textContent}`);
            console.log(`   - Visible: ${statusEl.isVisible}`);
            console.log(`   - Position: (${Math.round(statusEl.rect.x)}, ${Math.round(statusEl.rect.y)})`);
        }
    } catch (e) {
        console.log(`   Error: ${e}`);
    }
    console.log();

    // Test 9: Take screenshot
    console.log("9. Taking screenshot...");
    let screenshotData: string | null = null;
    try {
        screenshotData = await window.automation.screenshot();
        if (screenshotData && screenshotData.length > 0) {
            console.log(`   Screenshot captured (${screenshotData.length} chars base64)\n`);
        } else {
            console.log("   Screenshot returned empty\n");
        }
    } catch (e) {
        console.log(`   Error: ${e}\n`);
    }

    // Test 10: Automated file upload
    // This demonstrates programmatically setting files on a file input element,
    // similar to Puppeteer's file upload capability
    console.log("10. Testing automated file upload...");
    try {
        const fileName = 'test-image.png';

        // Step 1: Create a test file and set it on the file input using DataTransfer API
        // Note: Single-line format works better with the eval mechanism
        await window.executeScript(`(function() { var dt = new DataTransfer(); dt.items.add(new File(['test'], '${fileName}')); document.getElementById('fileInput').files = dt.files; return 'set'; })()`);

        // Step 2: Dispatch change event to trigger the form's file handler
        await window.executeScript(`document.getElementById('fileInput').dispatchEvent(new Event('change', { bubbles: true }))`);

        await sleep(500);

        // Verify the upload worked by checking the displayed filename
        const displayedName = await window.automation.getValue('#fileName');
        console.log(`   File uploaded: ${fileName}`);
        console.log(`   Form shows: "${displayedName}"\n`);
    } catch (e) {
        console.log(`   Error: ${e}\n`);
    }

    console.log("=== Testing Protocol API ===\n");

    // Test 11: Get cookies
    console.log("11. Getting cookies...");
    try {
        const cookies = await window.protocol.getCookies();
        console.log(`    Found ${Array.isArray(cookies) ? cookies.length : 0} cookies\n`);
    } catch (e) {
        console.log(`    Error: ${e}\n`);
    }

    // Test 12: Set a cookie
    console.log("12. Setting a test cookie...");
    try {
        const cookieSet = await window.protocol.setCookie({
            name: "test_cookie",
            value: "automation_test",
            domain: "localhost",
            path: "/"
        });
        console.log(`    Cookie set: ${cookieSet}\n`);
    } catch (e) {
        console.log(`    Error: ${e}\n`);
    }

    // Test 13: Raw CDP call
    console.log("13. Testing raw CDP call (Runtime.evaluate)...");
    try {
        const result = await window.protocol.call("Runtime.evaluate", {
            expression: "document.title"
        });
        console.log(`    CDP result: ${JSON.stringify(result)}\n`);
    } catch (e) {
        console.log(`    Raw CDP: ${e}\n`);
    }

    console.log("=== All Tests Complete ===\n");
    console.log("The automation demo window will remain open.");
    console.log("You can interact with it manually or close it to exit.");
}

main().catch(console.error);
