/**
 * Manual Test App for Native Dialogs
 *
 * This app provides an interactive UI to test all dialog functionality:
 * - File Open Dialog (single and multiple selection)
 * - File Save Dialog
 * - Folder Picker Dialog
 * - Message Boxes (info, warning, error, question)
 *
 * Run with: bun run examples/dialog-test/index.ts
 */

import { Window, type FileFilter } from "../../src";

const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Dialog API Test</title>
    <style>
        * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        body {
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 800px;
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
            border-bottom: 2px solid #667eea;
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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
        .btn-error {
            background: #e74c3c;
            color: white;
        }
        .btn-question {
            background: #9b59b6;
            color: white;
        }
        .btn-file {
            background: #27ae60;
            color: white;
        }
        .result {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
            font-family: monospace;
            font-size: 13px;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 200px;
            overflow-y: auto;
        }
        .result.success {
            border-color: #27ae60;
            background: #d4edda;
        }
        .result.cancelled {
            border-color: #ffc107;
            background: #fff3cd;
        }
        .result.error {
            border-color: #e74c3c;
            background: #f8d7da;
        }
        .label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
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
    </style>
</head>
<body>
    <div class="container">
        <h1>Native Dialog API Test</h1>

        <!-- File Dialogs Section -->
        <div class="section">
            <h2>File Dialogs</h2>
            <div class="button-group">
                <button class="btn-file" onclick="testOpenFile()">Open File</button>
                <button class="btn-file" onclick="testOpenMultipleFiles()">Open Multiple Files</button>
                <button class="btn-file" onclick="testOpenFileWithFilters()">Open with Filters</button>
                <button class="btn-file" onclick="testSaveFile()">Save File</button>
                <button class="btn-file" onclick="testOpenFolder()">Open Folder</button>
            </div>
            <div class="label">Result:</div>
            <div id="fileResult" class="result">Click a button to test file dialogs...</div>
        </div>

        <!-- Message Box Section -->
        <div class="section">
            <h2>Message Boxes</h2>
            <div class="button-group">
                <button class="btn-info" onclick="testShowInfo()">Show Info</button>
                <button class="btn-warning" onclick="testShowWarning()">Show Warning</button>
                <button class="btn-error" onclick="testShowError()">Show Error</button>
                <button class="btn-question" onclick="testConfirm()">Confirm Dialog</button>
            </div>
            <div class="button-group">
                <button class="btn-primary" onclick="testOkCancel()">OK/Cancel</button>
                <button class="btn-primary" onclick="testYesNo()">Yes/No</button>
                <button class="btn-primary" onclick="testYesNoCancel()">Yes/No/Cancel</button>
            </div>
            <div class="label">Result:</div>
            <div id="msgResult" class="result">Click a button to test message boxes...</div>
        </div>

        <!-- Log Section -->
        <div class="section">
            <h2>Event Log</h2>
            <div id="log"></div>
        </div>
    </div>

    <script>
        function log(message, type = 'info') {
            const logDiv = document.getElementById('log');
            const timestamp = new Date().toLocaleTimeString();
            const colors = { info: '#00ff00', success: '#27ae60', error: '#e74c3c', cancelled: '#ffc107' };
            logDiv.innerHTML += '<div><span class="timestamp">[' + timestamp + ']</span> <span style="color:' + (colors[type] || colors.info) + '">' + message + '</span></div>';
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        function showFileResult(result, cancelled = false) {
            const el = document.getElementById('fileResult');
            if (cancelled) {
                el.className = 'result cancelled';
                el.textContent = 'Dialog cancelled (no selection)';
            } else {
                el.className = 'result success';
                el.textContent = JSON.stringify(result, null, 2);
            }
        }

        function showMsgResult(result) {
            const el = document.getElementById('msgResult');
            el.className = 'result success';
            el.textContent = 'Result: ' + result;
        }

        // File Dialog Tests
        async function testOpenFile() {
            log('Opening file dialog...');
            try {
                const result = await tronbun.invoke('open-file', {});
                if (result) {
                    log('Selected: ' + result.join(', '), 'success');
                    showFileResult(result);
                } else {
                    log('Dialog cancelled', 'cancelled');
                    showFileResult(null, true);
                }
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function testOpenMultipleFiles() {
            log('Opening multiple file dialog...');
            try {
                const result = await tronbun.invoke('open-multiple-files', {});
                if (result) {
                    log('Selected ' + result.length + ' files', 'success');
                    showFileResult(result);
                } else {
                    log('Dialog cancelled', 'cancelled');
                    showFileResult(null, true);
                }
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function testOpenFileWithFilters() {
            log('Opening file dialog with filters...');
            try {
                const result = await tronbun.invoke('open-file-filtered', {});
                if (result) {
                    log('Selected: ' + result.join(', '), 'success');
                    showFileResult(result);
                } else {
                    log('Dialog cancelled', 'cancelled');
                    showFileResult(null, true);
                }
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function testSaveFile() {
            log('Opening save file dialog...');
            try {
                const result = await tronbun.invoke('save-file', {});
                if (result) {
                    log('Save path: ' + result, 'success');
                    showFileResult({ path: result });
                } else {
                    log('Dialog cancelled', 'cancelled');
                    showFileResult(null, true);
                }
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        async function testOpenFolder() {
            log('Opening folder dialog...');
            try {
                const result = await tronbun.invoke('open-folder', {});
                if (result) {
                    log('Selected folder: ' + result, 'success');
                    showFileResult({ folder: result });
                } else {
                    log('Dialog cancelled', 'cancelled');
                    showFileResult(null, true);
                }
            } catch (err) {
                log('Error: ' + err.message, 'error');
            }
        }

        // Message Box Tests
        async function testShowInfo() {
            log('Showing info dialog...');
            await tronbun.invoke('show-info', { message: 'This is an informational message.' });
            log('Info dialog closed', 'success');
            showMsgResult('ok (info dialog closed)');
        }

        async function testShowWarning() {
            log('Showing warning dialog...');
            await tronbun.invoke('show-warning', { message: 'This is a warning message!' });
            log('Warning dialog closed', 'success');
            showMsgResult('ok (warning dialog closed)');
        }

        async function testShowError() {
            log('Showing error dialog...');
            await tronbun.invoke('show-error', { message: 'An error has occurred!' });
            log('Error dialog closed', 'success');
            showMsgResult('ok (error dialog closed)');
        }

        async function testConfirm() {
            log('Showing confirm dialog...');
            const result = await tronbun.invoke('confirm', { message: 'Do you want to proceed?' });
            log('Confirm result: ' + result, result ? 'success' : 'cancelled');
            showMsgResult(result ? 'Yes (confirmed)' : 'No (rejected)');
        }

        async function testOkCancel() {
            log('Showing OK/Cancel dialog...');
            const result = await tronbun.invoke('ok-cancel', { message: 'Click OK or Cancel' });
            log('Result: ' + result, result === 'ok' ? 'success' : 'cancelled');
            showMsgResult(result);
        }

        async function testYesNo() {
            log('Showing Yes/No dialog...');
            const result = await tronbun.invoke('yes-no', { message: 'Do you agree?' });
            log('Result: ' + result, result === 'yes' ? 'success' : 'cancelled');
            showMsgResult(result);
        }

        async function testYesNoCancel() {
            log('Showing Yes/No/Cancel dialog...');
            const result = await tronbun.invoke('yes-no-cancel', { message: 'Save changes before closing?' });
            const type = result === 'yes' ? 'success' : (result === 'cancel' ? 'cancelled' : 'info');
            log('Result: ' + result, type);
            showMsgResult(result);
        }

        // Initialize
        log('Dialog test app loaded. Ready to test!', 'success');
    </script>
</body>
</html>
`;

async function main() {
    console.log("Starting Dialog Test App...");

    const win = new Window({
        title: "Dialog API Test",
        width: 900,
        height: 800
    });

    // File dialog handlers
    win.handle("open-file", async () => {
        return await win.dialog.openFile({
            title: "Select a File"
        });
    });

    win.handle("open-multiple-files", async () => {
        return await win.dialog.openFile({
            title: "Select Multiple Files",
            multiple: true
        });
    });

    win.handle("open-file-filtered", async () => {
        return await win.dialog.openFile({
            title: "Select an Image or Document",
            filters: [
                { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
                { name: "Documents", extensions: ["pdf", "doc", "docx", "txt"] }
            ]
        });
    });

    win.handle("save-file", async () => {
        return await win.dialog.saveFile({
            title: "Save File As",
            defaultName: "untitled.txt",
            filters: [
                { name: "Text Files", extensions: ["txt"] },
                { name: "All Files", extensions: ["*"] }
            ]
        });
    });

    win.handle("open-folder", async () => {
        return await win.dialog.openFolder({
            title: "Select a Folder"
        });
    });

    // Message box handlers
    win.handle("show-info", async (data: { message: string }) => {
        await win.dialog.showInfo(data.message, "Information");
    });

    win.handle("show-warning", async (data: { message: string }) => {
        await win.dialog.showWarning(data.message, "Warning");
    });

    win.handle("show-error", async (data: { message: string }) => {
        await win.dialog.showError(data.message, "Error");
    });

    win.handle("confirm", async (data: { message: string }) => {
        return await win.dialog.confirm(data.message, "Confirm");
    });

    win.handle("ok-cancel", async (data: { message: string }) => {
        return await win.dialog.showMessage({
            title: "Question",
            message: data.message,
            type: "question",
            buttons: "okCancel"
        });
    });

    win.handle("yes-no", async (data: { message: string }) => {
        return await win.dialog.showMessage({
            title: "Question",
            message: data.message,
            type: "question",
            buttons: "yesNo"
        });
    });

    win.handle("yes-no-cancel", async (data: { message: string }) => {
        return await win.dialog.showMessage({
            title: "Save Changes",
            message: data.message,
            detail: "Your changes will be lost if you don't save.",
            type: "question",
            buttons: "yesNoCancel"
        });
    });

    // Load HTML and show window
    await win.setHtml(html);
    await win.showWindow();

    console.log("Dialog Test App is running. Close the window to exit.");
}

main().catch(console.error);
