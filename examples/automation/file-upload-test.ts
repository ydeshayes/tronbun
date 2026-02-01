/**
 * File Upload Test
 *
 * Demonstrates uploading REAL files from disk using the automation API.
 * This uses the new setInputFiles() method which reads actual files,
 * not the fake DataTransfer API approach.
 *
 * Run with: bun run examples/automation/file-upload-test.ts
 */

import { Window } from "../../src";
import { join } from "path";

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("=== Real File Upload Test ===\n");

    // Step 1: Create a real test file on disk
    const testDir = join(import.meta.dir, "test-files");
    const testFilePath = join(testDir, "test-document.txt");
    const testImagePath = join(testDir, "test-image.png");

    console.log("1. Creating test files on disk...");

    // Create test directory
    await Bun.write(testFilePath, `This is a real test document.
Created at: ${new Date().toISOString()}
Content: Hello from the file system!
This file was read from disk and uploaded via automation.`);

    // Create a simple PNG image (1x1 red pixel)
    const pngData = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    await Bun.write(testImagePath, pngData);

    console.log(`   Created: ${testFilePath}`);
    console.log(`   Created: ${testImagePath}\n`);

    // Step 2: Create window with file upload form
    console.log("2. Creating window with file upload form...");

    const window = new Window({
        width: 800,
        height: 600,
        title: "File Upload Test",
        debug: false
    });

    await window.setHtml(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>File Upload Test</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 600px;
                    margin: 50px auto;
                    padding: 20px;
                    background: #f0f0f0;
                }
                .upload-area {
                    background: white;
                    border-radius: 8px;
                    padding: 30px;
                    margin: 20px 0;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h1 { color: #333; margin-bottom: 20px; }
                .file-input-wrapper {
                    position: relative;
                    border: 2px dashed #ccc;
                    border-radius: 8px;
                    padding: 40px;
                    text-align: center;
                    margin-bottom: 20px;
                    transition: border-color 0.3s;
                }
                .file-input-wrapper:hover {
                    border-color: #007bff;
                }
                /* Cover drop zone so programmatic drop lands on input; label stays visible underneath */
                input[type="file"] {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    opacity: 0;
                    cursor: pointer;
                }
                .file-label {
                    cursor: pointer;
                    color: #666;
                }
                .file-info {
                    background: #e8f5e9;
                    border-radius: 8px;
                    padding: 15px;
                    margin-top: 20px;
                    display: none;
                }
                .file-info.visible {
                    display: block;
                }
                .file-name { color: #2e7d32; font-weight: bold; }
                .file-size { color: #666; }
                .file-type { color: #1565c0; }
                .file-content {
                    background: #f5f5f5;
                    padding: 10px;
                    border-radius: 4px;
                    margin-top: 10px;
                    font-family: monospace;
                    white-space: pre-wrap;
                    max-height: 200px;
                    overflow: auto;
                }
                .success { color: #2e7d32; }
                .error { color: #c62828; }
            </style>
        </head>
        <body>
            <h1>Real File Upload Test</h1>

            <div class="upload-area">
                <h2>Upload a File</h2>
                <div class="file-input-wrapper">
                    <input type="file" id="fileInput" accept="*/*">
                    <label for="fileInput" class="file-label">
                        <div style="font-size: 48px; margin-bottom: 10px;">📁</div>
                        <div>Click to select a file or drop one here</div>
                    </label>
                </div>

                <div id="fileInfo" class="file-info">
                    <p><strong>File Name:</strong> <span id="fileName" class="file-name"></span></p>
                    <p><strong>File Size:</strong> <span id="fileSize" class="file-size"></span></p>
                    <p><strong>File Type:</strong> <span id="fileType" class="file-type"></span></p>
                    <div id="imagePreviewSection" style="display: none; margin-top: 15px;">
                        <p><strong>Image Preview (if content is present, image will show):</strong></p>
                        <img id="imagePreview" alt="Preview" style="max-width: 100%; max-height: 200px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                    <div id="contentSection" style="display: none;">
                        <p><strong>Content Preview:</strong></p>
                        <div id="fileContent" class="file-content"></div>
                    </div>
                </div>
            </div>

            <div id="status"></div>

            <script>
                document.getElementById('fileInput').addEventListener('change', function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        // Show file info
                        document.getElementById('fileInfo').classList.add('visible');
                        document.getElementById('fileName').textContent = file.name;
                        document.getElementById('fileSize').textContent = formatSize(file.size);
                        document.getElementById('fileType').textContent = file.type || 'unknown';

                        // Show image preview for image files (checks if content is actually present)
                        const imagePreviewSection = document.getElementById('imagePreviewSection');
                        const imagePreview = document.getElementById('imagePreview');
                        if (file.type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name)) {
                            imagePreviewSection.style.display = 'block';
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                imagePreview.src = e.target.result;
                            };
                            reader.onerror = function() {
                                imagePreview.src = '';
                                imagePreview.alt = 'Failed to read image (file may be empty)';
                            };
                            reader.readAsDataURL(file);
                        } else {
                            imagePreviewSection.style.display = 'none';
                            imagePreview.src = '';
                        }

                        // Read and display content for text files
                        if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.json')) {
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                document.getElementById('contentSection').style.display = 'block';
                                document.getElementById('fileContent').textContent = e.target.result;
                            };
                            reader.readAsText(file);
                        } else {
                            document.getElementById('contentSection').style.display = 'none';
                        }

                        showStatus('File uploaded successfully!', 'success');
                    }
                });

                function formatSize(bytes) {
                    if (bytes < 1024) return bytes + ' bytes';
                    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
                    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
                }

                function showStatus(message, type) {
                    const status = document.getElementById('status');
                    status.innerHTML = '<p class="' + type + '">' + message + '</p>';
                }
            </script>
        </body>
        </html>
    `);

    await sleep(1000);
    console.log("   Window created\n");

    // Step 3: Upload the text file using the real file upload API
    console.log("3. Uploading real text file from disk...");
    console.log(`   Source: ${testFilePath}`);

    try {
        await window.automation.setInputFiles('#fileInput', [testFilePath]);
        await sleep(1500); // Wait for file handler to process
        console.log("   SUCCESS: Real file uploaded from disk!");
        console.log("   (See screenshot for verification)\n");
    } catch (e) {
        console.log(`   ERROR: ${e}\n`);
    }

    // Step 4: Take a screenshot to prove it worked
    console.log("4. Taking screenshot as proof...");
    try {
        const screenshot = await window.automation.screenshot();
        const screenshotPath = join(testDir, "upload-result.png");

        // Decode base64 and save
        const screenshotData = Uint8Array.from(atob(screenshot), c => c.charCodeAt(0));
        await Bun.write(screenshotPath, screenshotData);
        console.log(`   Screenshot saved: ${screenshotPath}\n`);
    } catch (e) {
        console.log(`   Screenshot error: ${e}\n`);
    }

    // Step 5: Test uploading image file
    console.log("5. Uploading real image file from disk...");
    console.log(`   Source: ${testImagePath}`);

    try {
        await window.automation.setInputFiles('#fileInput', [testImagePath]);
        await sleep(1500);
        console.log("   SUCCESS: Real image uploaded from disk!\n");
    } catch (e) {
        console.log(`   ERROR: ${e}\n`);
    }

    // Take another screenshot showing the image upload
    console.log("6. Taking final screenshot...");
    try {
        const screenshot2 = await window.automation.screenshot();
        const screenshot2Path = join(testDir, "upload-result-image.png");
        const screenshot2Data = Uint8Array.from(atob(screenshot2), c => c.charCodeAt(0));
        await Bun.write(screenshot2Path, screenshot2Data);
        console.log(`   Screenshot saved: ${screenshot2Path}\n`);
    } catch (e) {
        console.log(`   Screenshot error: ${e}\n`);
    }

    console.log("=== Test Complete ===\n");
    console.log("The window will remain open. Close it to exit.");
    console.log(`Test files are in: ${testDir}`);
}

main().catch(console.error);
