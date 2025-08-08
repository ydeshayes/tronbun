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
