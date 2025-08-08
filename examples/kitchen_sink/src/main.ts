import { WindowIPC, findWebAssetPath, mainHandler, windowName } from "tronbun";

  @windowName('test_options')
  export class MainWindow extends WindowIPC {
    constructor() {
      super({
        title: "Hello world",
        width: 800,
        height: 600
      });
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
  }

  const window = new MainWindow();

  const webAssetsPath = findWebAssetPath("index.html", __dirname);
  
  if (!webAssetsPath) {
    throw new Error("Could not find web assets. Make sure the dist/web/index.html file exists.");
  }

  // Load the web interface from file
  console.log("Loading web assets from:", webAssetsPath);
  await window.navigate(`file://${webAssetsPath}`);
