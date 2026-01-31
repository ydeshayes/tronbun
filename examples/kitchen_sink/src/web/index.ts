// Web frontend code that runs in the webview

function setTransparent() {
    window.test_options.setTransparent();
}

function setOpaque() {
    window.test_options.setOpaque();
}

function enableBlur() {
    window.test_options.enableBlur();
}

function setOpacity(opacity: number) {
  window.test_options.setOpacity(opacity);
}

function addDecorations() {
  window.test_options.addDecorations();
}

function removeDecorations() {
  window.test_options.removeDecorations();
}

function setResizable(resizable: boolean) {
  window.test_options.setResizable(resizable);
}

function setPosition(x: number, y: number) {
  window.test_options.setPosition(x, y);
}

function setAlwaysOnTop(alwaysOnTop: boolean) {
  window.test_options.setAlwaysOnTop(alwaysOnTop);
}

function centerWindow() {
  window.test_options.centerWindow();
}

function minimizeWindow() {
  window.test_options.minimizeWindow();
}

function maximizeWindow() {
  window.test_options.maximizeWindow();
}

function restoreWindow() {
  window.test_options.restoreWindow();
}

function hideWindow() {
  window.test_options.hideWindow();
  showWindowDelayed();
}

function showWindow() {
  window.test_options.showWindow();
}

function showWindowDelayed() {
  setTimeout(() => {
    window.test_options.showWindow();
  }, 5000);
}

window.setAlwaysOnTop = setAlwaysOnTop;
window.setTransparent = setTransparent;
window.enableBlur = enableBlur;
window.addDecorations = addDecorations;
window.removeDecorations = removeDecorations;
window.centerWindow = centerWindow;
window.setPosition = setPosition;
window.setResizable = setResizable;
window.setOpaque = setOpaque;
window.setOpacity = setOpacity;
window.minimizeWindow = minimizeWindow;
window.maximizeWindow = maximizeWindow;
window.restoreWindow = restoreWindow;
window.hideWindow = hideWindow;
window.showWindow = showWindow;
window.showWindowDelayed = showWindowDelayed;

// ============================================================================
// Dialog Functions
// ============================================================================

function showFileResult(result: any, cancelled = false) {
    const el = document.getElementById('fileResult')!;
    if (cancelled) {
        el.className = 'result-box cancelled';
        el.textContent = 'Dialog cancelled (no selection)';
    } else {
        el.className = 'result-box success';
        el.textContent = JSON.stringify(result, null, 2);
    }
}

function showMsgResult(result: string) {
    const el = document.getElementById('msgResult')!;
    el.className = 'result-box success';
    el.textContent = 'Result: ' + result;
}

async function openFile() {
    const result = await window.test_options.openFileDialog({ title: 'Select a File' });
    if (result) {
        showFileResult(result);
    } else {
        showFileResult(null, true);
    }
}

async function openMultipleFiles() {
    const result = await window.test_options.openFileDialog({
        title: 'Select Multiple Files',
        multiple: true
    });
    if (result) {
        showFileResult({ files: result, count: result.length });
    } else {
        showFileResult(null, true);
    }
}

async function openFileFiltered() {
    const result = await window.test_options.openFileDialog({
        title: 'Select Images or Documents',
        filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
            { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt'] }
        ]
    });
    if (result) {
        showFileResult(result);
    } else {
        showFileResult(null, true);
    }
}

async function saveFile() {
    const result = await window.test_options.saveFileDialog({
        title: 'Save File As',
        defaultName: 'untitled.txt',
        filters: [
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    if (result) {
        showFileResult({ savePath: result });
    } else {
        showFileResult(null, true);
    }
}

async function openFolder() {
    const result = await window.test_options.openFolderDialog({ title: 'Select Folder' });
    if (result) {
        showFileResult({ folder: result });
    } else {
        showFileResult(null, true);
    }
}

async function showInfo() {
    await window.test_options.showInfoDialog({
        message: 'This is an informational message.',
        title: 'Information'
    });
    showMsgResult('Info dialog closed');
}

async function showWarning() {
    await window.test_options.showWarningDialog({
        message: 'This is a warning message!',
        title: 'Warning'
    });
    showMsgResult('Warning dialog closed');
}

async function showError() {
    await window.test_options.showErrorDialog({
        message: 'An error has occurred!',
        title: 'Error'
    });
    showMsgResult('Error dialog closed');
}

async function showConfirm() {
    const result = await window.test_options.confirmDialog({
        message: 'Do you want to proceed?',
        title: 'Confirm'
    });
    showMsgResult(result ? 'Confirmed (Yes)' : 'Declined (No)');
}

async function showOkCancel() {
    const result = await window.test_options.messageBoxDialog({
        title: 'Question',
        message: 'Click OK or Cancel',
        type: 'question',
        buttons: 'okCancel'
    });
    showMsgResult(result);
}

async function showYesNo() {
    const result = await window.test_options.messageBoxDialog({
        title: 'Question',
        message: 'Do you agree?',
        type: 'question',
        buttons: 'yesNo'
    });
    showMsgResult(result);
}

async function showYesNoCancel() {
    const result = await window.test_options.messageBoxDialog({
        title: 'Save Changes',
        message: 'Save changes before closing?',
        detail: 'Your changes will be lost if you don\'t save.',
        type: 'question',
        buttons: 'yesNoCancel'
    });
    showMsgResult(result);
}

// Expose dialog functions
window.openFile = openFile;
window.openMultipleFiles = openMultipleFiles;
window.openFileFiltered = openFileFiltered;
window.saveFile = saveFile;
window.openFolder = openFolder;
window.showInfo = showInfo;
window.showWarning = showWarning;
window.showError = showError;
window.showConfirm = showConfirm;
window.showOkCancel = showOkCancel;
window.showYesNo = showYesNo;
window.showYesNoCancel = showYesNoCancel;

// ============================================================================
// Menu Functions
// ============================================================================

let saveEnabled = true;
let sidebarChecked = true;

function logMenu(message: string, type = 'info') {
    const logDiv = document.getElementById('menuLog')!;
    const timestamp = new Date().toLocaleTimeString();
    const className = type === 'menu' ? 'menu' : type === 'success' ? 'success' : '';
    logDiv.innerHTML += `<div><span class="timestamp">[${timestamp}]</span> <span class="${className}">${message}</span></div>`;
    logDiv.scrollTop = logDiv.scrollHeight;
}

async function resetCustomMenu() {
    logMenu('Resetting custom menu...', 'menu');
    await window.test_options.resetCustomMenu();
    logMenu('Custom menu set!', 'success');
}

async function setDefaultMenu() {
    logMenu('Setting default menu...', 'menu');
    await window.test_options.setDefaultMenu();
    logMenu('Default menu set!', 'success');
}

async function removeMenu() {
    logMenu('Removing menu...', 'menu');
    await window.test_options.removeMenu();
    logMenu('Menu removed!', 'success');
}

async function toggleSaveEnabled() {
    saveEnabled = !saveEnabled;
    logMenu(`Toggling "Save" enabled to: ${saveEnabled}`, 'menu');
    await window.test_options.setMenuItemEnabled({ itemId: 'file-save', enabled: saveEnabled });
    logMenu(`"Save" is now ${saveEnabled ? 'enabled' : 'disabled'}`, 'success');
}

async function toggleSidebarChecked() {
    sidebarChecked = !sidebarChecked;
    logMenu(`Toggling "Sidebar" checked to: ${sidebarChecked}`, 'menu');
    await window.test_options.setMenuItemChecked({ itemId: 'view-sidebar', checked: sidebarChecked });
    logMenu(`"Sidebar" is now ${sidebarChecked ? 'checked' : 'unchecked'}`, 'success');
}

// Called from backend when menu item is clicked
window.onMenuClick = function(itemId: string) {
    logMenu(`Menu item clicked: ${itemId}`, 'menu');
};

// Called from backend when file is opened via menu
window.onFileOpened = function(files: string[]) {
    logMenu(`File opened via menu: ${files.join(', ')}`, 'success');
    showFileResult(files);
};

// Called from backend when file is saved via menu
window.onFileSaved = function(path: string) {
    logMenu(`File saved via menu: ${path}`, 'success');
    showFileResult({ savePath: path });
};

// Expose menu functions
window.resetCustomMenu = resetCustomMenu;
window.setDefaultMenu = setDefaultMenu;
window.removeMenu = removeMenu;
window.toggleSaveEnabled = toggleSaveEnabled;
window.toggleSidebarChecked = toggleSidebarChecked;

console.log('Web frontend loaded!');

// Platform detection
const platform = navigator.platform.toLowerCase();
let platformName = 'Unknown';
if (platform.includes('mac')) platformName = 'macOS';
else if (platform.includes('win')) platformName = 'Windows';
else if (platform.includes('linux')) platformName = 'Linux';

document.getElementById('platform-info')!.innerHTML = 
    `<strong>Platform:</strong> ${platformName}<br>`+
    `<strong>User Agent:</strong> ${navigator.userAgent}<br>`+
    `<strong>Note:</strong> Some effects may vary by platform and desktop environment.`;
