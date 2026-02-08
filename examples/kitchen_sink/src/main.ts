import { Tray, WindowIPC, findWebAssetPath, resolveAssetPath, mainHandler, windowName } from "tronbun";
import type { Menu, MenuItem, FileFilter, MessageBoxResult } from "tronbun";

  @windowName('test_options')
  export class MainWindow extends WindowIPC {
    constructor() {
      super({
        title: "Kitchen Sink Demo",
        width: 900,
        height: 700
      });
    }

    public async setupMenu() {
      const menus: Menu[] = [
        {
          id: "file",
          label: "File",
          items: [
            {
              id: "file-new",
              label: "New",
              accelerator: "CmdOrCtrl+N",
              click: () => this.notifyMenuClick("file-new")
            },
            {
              id: "file-open",
              label: "Open...",
              accelerator: "CmdOrCtrl+O",
              click: () => this.handleOpenFile()
            },
            { type: "separator" },
            {
              id: "file-save",
              label: "Save",
              accelerator: "CmdOrCtrl+S",
              click: () => this.handleSaveFile()
            },
            {
              id: "file-save-as",
              label: "Save As...",
              accelerator: "CmdOrCtrl+Shift+S",
              click: () => this.handleSaveFileAs()
            },
            { type: "separator" },
            {
              id: "file-exit",
              label: "Exit",
              accelerator: "Alt+F4",
              click: () => this.handleExit()
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
              label: "Show Sidebar",
              type: "checkbox",
              checked: true,
              accelerator: "CmdOrCtrl+B",
              click: () => this.notifyMenuClick("view-sidebar")
            },
            {
              id: "view-statusbar",
              label: "Show Status Bar",
              type: "checkbox",
              checked: true,
              click: () => this.notifyMenuClick("view-statusbar")
            },
            { type: "separator" },
            { role: "zoomIn", label: "Zoom In", accelerator: "CmdOrCtrl+=" },
            { role: "zoomOut", label: "Zoom Out", accelerator: "CmdOrCtrl+-" },
            { role: "resetZoom", label: "Reset Zoom", accelerator: "CmdOrCtrl+0" }
          ]
        },
        {
          id: "help",
          label: "Help",
          items: [
            {
              id: "help-docs",
              label: "Documentation",
              click: () => this.notifyMenuClick("help-docs")
            },
            { type: "separator" },
            {
              id: "help-about",
              label: "About Kitchen Sink",
              click: () => this.handleAbout()
            }
          ]
        }
      ];

      await this.menu.setMenu(menus);
    }

    private async notifyMenuClick(itemId: string) {
      console.log(`Menu item clicked: ${itemId}`);
      await this.eval(`window.onMenuClick && window.onMenuClick('${itemId}')`);
    }

    private async handleOpenFile() {
      const result = await this.dialog.openFile({
        title: "Open File",
        filters: [
          { name: "All Files", extensions: ["*"] },
          { name: "Text Files", extensions: ["txt", "md"] },
          { name: "Images", extensions: ["png", "jpg", "gif"] }
        ]
      });
      if (result) {
        await this.eval(`window.onFileOpened && window.onFileOpened(${JSON.stringify(result)})`);
      }
    }

    private async handleSaveFile() {
      this.notifyMenuClick("file-save");
    }

    private async handleSaveFileAs() {
      const result = await this.dialog.saveFile({
        title: "Save File As",
        defaultName: "untitled.txt",
        filters: [
          { name: "Text Files", extensions: ["txt"] },
          { name: "All Files", extensions: ["*"] }
        ]
      });
      if (result) {
        await this.eval(`window.onFileSaved && window.onFileSaved(${JSON.stringify(result)})`);
      }
    }

    private async handleAbout() {
      await this.dialog.showInfo(
        "Kitchen Sink Demo\nVersion 1.0.0\n\nA comprehensive demo of Tronbun features including:\n- Window controls\n- Native dialogs\n- Application menus\n- System tray",
        "About Kitchen Sink"
      );
    }

    private async handleExit() {
      const confirmed = await this.dialog.confirm("Are you sure you want to exit?", "Exit Application");
      if (confirmed) {
        process.exit(0);
      }
    }

  
    @mainHandler('setOpacity')
    async handleSetOpacity(opacity: number): Promise<void> {
      return this.setOpacity(opacity);
    }

    @mainHandler('setResizable')
    async handleSetResizable(resizable: boolean): Promise<void> {
      return this.setResizable(resizable);
    }

    @mainHandler('setPosition')
    async handleSetPosition(x: number, y: number): Promise<void> {
      return this.setPosition(x, y);
    }

    @mainHandler('setAlwaysOnTop')
    async handleSetAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
      return this.setAlwaysOnTop(alwaysOnTop);
    }

    @mainHandler('setTransparent')
    async handleSetTransparent(): Promise<void> {
      return this.setTransparent();
    }

    @mainHandler('setOpaque')
    async handleSetOpaque(): Promise<void> {
      return this.setOpaque();
    }

    @mainHandler('enableBlur')
    async handleEnableBlur(): Promise<void> {
      return this.enableBlur();
    }

    @mainHandler('removeDecorations')
    async handleRemoveDecorations(): Promise<void> {
      return this.removeDecorations();
    }

    @mainHandler('centerWindow')
    async handleCenterWindow(): Promise<void> {
      return this.centerWindow();
    }

    @mainHandler('minimizeWindow')
    async handleMinimizeWindow(): Promise<void> {
      return this.minimizeWindow();
    }

    @mainHandler('maximizeWindow')
    async handleMaximizeWindow(): Promise<void> {
      return this.maximizeWindow();
    }

    @mainHandler('restoreWindow')
    async handleRestoreWindow(): Promise<void> {
      return this.restoreWindow();
    }

    @mainHandler('setSize')
    async handleSetSize(width: number, height: number): Promise<void> {
      return this.setSize(width, height);
    }

    @mainHandler('setTitle')
    async handleSetTitle(title: string): Promise<void> {
      return this.setTitle(title);
    }

    @mainHandler('addDecorations')
    async handleAddDecorations(): Promise<void> {
      return this.addDecorations();
    }

    @mainHandler('hideWindow')
    async handleHideWindow(): Promise<void> {
      return this.hideWindow();
    }

    @mainHandler('showWindow')
    async handleShowWindow(): Promise<void> {
      return this.showWindow();
    }

    // ============================================================================
    // Dialog Handlers
    // ============================================================================

    @mainHandler('openFileDialog')
    async handleOpenFileDialog(options: { title?: string; multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string[] | null> {
      return this.dialog.openFile({
        title: options.title,
        multiple: options.multiple,
        filters: options.filters
      });
    }

    @mainHandler('saveFileDialog')
    async handleSaveFileDialog(options: { title?: string; defaultName?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
      return this.dialog.saveFile({
        title: options.title,
        defaultName: options.defaultName,
        filters: options.filters
      });
    }

    @mainHandler('openFolderDialog')
    async handleOpenFolderDialog(options: { title?: string }): Promise<string | null> {
      return this.dialog.openFolder({
        title: options.title
      });
    }

    @mainHandler('showInfoDialog')
    async handleShowInfoDialog(options: { message: string; title?: string }): Promise<void> {
      return this.dialog.showInfo(options.message, options.title);
    }

    @mainHandler('showWarningDialog')
    async handleShowWarningDialog(options: { message: string; title?: string }): Promise<void> {
      return this.dialog.showWarning(options.message, options.title);
    }

    @mainHandler('showErrorDialog')
    async handleShowErrorDialog(options: { message: string; title?: string }): Promise<void> {
      return this.dialog.showError(options.message, options.title);
    }

    @mainHandler('confirmDialog')
    async handleConfirmDialog(options: { message: string; title?: string }): Promise<boolean> {
      return this.dialog.confirm(options.message, options.title);
    }

    @mainHandler('messageBoxDialog')
    async handleMessageBoxDialog(options: {
      title?: string;
      message: string;
      detail?: string;
      type?: 'info' | 'warning' | 'error' | 'question';
      buttons?: 'ok' | 'okCancel' | 'yesNo' | 'yesNoCancel'
    }): Promise<string> {
      return this.dialog.showMessage(options);
    }

    // ============================================================================
    // Menu Handlers
    // ============================================================================

    @mainHandler('setDefaultMenu')
    async handleSetDefaultMenu(): Promise<void> {
      return this.menu.setDefaultMenu("Kitchen Sink");
    }

    @mainHandler('removeMenu')
    async handleRemoveMenu(): Promise<void> {
      return this.menu.removeMenu();
    }

    @mainHandler('resetCustomMenu')
    async handleResetCustomMenu(): Promise<void> {
      await this.setupMenu();
    }

    @mainHandler('setMenuItemEnabled')
    async handleSetMenuItemEnabled(options: { itemId: string; enabled: boolean }): Promise<void> {
      return this.menu.setItemEnabled(options.itemId, options.enabled);
    }

    @mainHandler('setMenuItemChecked')
    async handleSetMenuItemChecked(options: { itemId: string; checked: boolean }): Promise<void> {
      return this.menu.setItemChecked(options.itemId, options.checked);
    }

    // ============================================================================
    // Notification Handlers
    // ============================================================================

    @mainHandler('showNotification')
    async handleShowNotification(options: { title: string; body?: string }): Promise<string> {
      if((await this.notification.isAvailable()) !== 1) {
        await this.notification.requestPermission();
      }
      
      return this.notification.show({
        title: options.title,
        body: options.body
      });
    }

    @mainHandler('requestNotificationPermission')
    async handleRequestNotificationPermission(): Promise<string> {
      return this.notification.requestPermission();
    }
  }

  if (Tray.isSupported()) {
    const tray = new Tray({
      icon: resolveAssetPath("icon.ico"), // Use the smaller tray icon
      tooltip: "Tronbun Kitchen Sink - Click for menu",
      menu: [
          {
              id: 'show',
              label: 'Show Window',
              type: 'normal',
              enabled: true,
              callback: () => {
                  console.log('Showing window from tray menu');
                  window.showWindow();
              }
          },
          {
              id: 'hide',
              label: 'Hide Window',
              type: 'normal',
              enabled: true,
              callback: () => {
                  console.log('Hiding window from tray menu');
                  window.hideWindow();
              }
          },
          {
              id: 'separator1',
              label: '',
              type: 'separator'
          },
          {
              id: 'about',
              label: 'About Kitchen Sink',
              type: 'normal',
              enabled: true,
              callback: () => {
                  console.log('About clicked from tray menu');
                  window.showWindow();
              }
          },
          {
              id: 'quit',
              label: 'Quit',
              type: 'normal',
              enabled: true,
              accelerator: 'Cmd+Q',
              callback: async () => {
                  console.log('Quitting application from tray menu');
                  await tray.destroy();
                  await window.close();
                  process.exit(0);
              }
          }
      ]
    });
  }

  const window = new MainWindow();

  const webAssetsPath = findWebAssetPath("index.html", __dirname);
  
  if (!webAssetsPath) {
    throw new Error("Could not find web assets. Make sure the dist/web/index.html file exists.");
  }

  // Load the web interface from file
  console.log("Loading web assets from:", webAssetsPath);
  await window.navigate(`file://${webAssetsPath}`);

  // Set up the application menu after window is ready
  await window.setupMenu();

  await window.context.setContextMenu([
    { id: "copy", label: "Copy", accelerator: "Ctrl+C", click: () => console.log("Copy!") },
    { type: "separator" },
    { id: "paste", label: "Paste", accelerator: "Ctrl+V" },
    { id: "options", label: "Options", type: "submenu", submenu: [
        { id: "opt1", label: "Dark Mode", type: "checkbox", checked: true },
    ]},
]);

window.context.onClick("paste", () => console.log("Paste clicked"));

// await window.context.removeContextMenu(); // restore default
