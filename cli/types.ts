/**
 * Obfuscation options for JavaScript code protection.
 * These options are passed to javascript-obfuscator.
 * See: https://github.com/javascript-obfuscator/javascript-obfuscator#options
 */
export interface ObfuscationOptions {
  /** Enable obfuscation (default: false) */
  enabled?: boolean;

  /** Compact code output (default: true) */
  compact?: boolean;

  /** Enable control flow flattening - makes code harder to understand (default: false) */
  controlFlowFlattening?: boolean;

  /** Probability of control flow flattening (0-1, default: 0.75) */
  controlFlowFlatteningThreshold?: number;

  /** Inject dead code to confuse reverse engineering (default: false) */
  deadCodeInjection?: boolean;

  /** Probability of dead code injection (0-1, default: 0.4) */
  deadCodeInjectionThreshold?: number;

  /** Identifier naming strategy: 'hexadecimal' | 'mangled' | 'mangled-shuffled' (default: 'hexadecimal') */
  identifierNamesGenerator?: 'hexadecimal' | 'mangled' | 'mangled-shuffled';

  /** Rename global variables (default: false - can break window.* APIs) */
  renameGlobals?: boolean;

  /** Enable self-defending code - WARNING: can cause issues with React (default: false) */
  selfDefending?: boolean;

  /** Enable string array transformation (default: true) */
  stringArray?: boolean;

  /** Encoding for string array: 'none' | 'base64' | 'rc4' (default: ['base64']) */
  stringArrayEncoding?: ('none' | 'base64' | 'rc4')[];

  /** Probability of string array transformation (0-1, default: 0.75) */
  stringArrayThreshold?: number;

  /** Split strings into chunks (default: false) */
  splitStrings?: boolean;

  /** Chunk length for split strings (default: 10) */
  splitStringsChunkLength?: number;

  /** Transform object keys (default: false) */
  transformObjectKeys?: boolean;

  /** Use unicode escape sequences (default: false - impacts performance) */
  unicodeEscapeSequence?: boolean;
}

/**
 * App-level metadata for packaging and platform integration.
 */
export interface AppConfig {
  /** Bundle identifier (e.g., "com.mycompany.myapp"). Defaults to "com.tronbun.<name>" */
  identifier?: string;
  /** Path to macOS app icon (.icns file), relative to project root */
  icon?: string;
  /** Path to Windows app icon (.ico file), relative to project root */
  iconWin?: string;
  /** Category for macOS (e.g., "public.app-category.developer-tools") */
  category?: string;
}

/**
 * Default window configuration. These are used as defaults when creating a Window
 * without explicit options. Individual Window instances can override these.
 */
export interface WindowConfig {
  /** Default window title */
  title?: string;
  /** Default window width (default: 800) */
  width?: number;
  /** Default window height (default: 600) */
  height?: number;
  /** Minimum window width */
  minWidth?: number;
  /** Minimum window height */
  minHeight?: number;
  /** Maximum window width */
  maxWidth?: number;
  /** Maximum window height */
  maxHeight?: number;
  /** Whether the window is resizable (default: true) */
  resizable?: boolean;
  /** Center the window on screen at startup */
  center?: boolean;
  /** Keep window always on top */
  alwaysOnTop?: boolean;
  /** Start the window in fullscreen */
  fullscreen?: boolean;
  /** Start the window frameless (no title bar / decorations) */
  frameless?: boolean;
  /** Window background transparency (0.0 to 1.0, default: 1.0) */
  opacity?: number;
}

/**
 * System tray configuration.
 */
export interface TrayConfig {
  /** Enable system tray (default: false) */
  enabled?: boolean;
  /** Path to tray icon, relative to project root */
  icon?: string;
  /** Tooltip text shown on hover */
  tooltip?: string;
}

/**
 * Desktop notification configuration.
 */
export interface NotificationConfig {
  /** Enable desktop notifications (default: true) */
  enabled?: boolean;
}

export interface TronbunConfig {
  name: string;
  version: string;
  main: string;
  web: {
    entry: string;
    outDir: string;
    publicDir?: string;
  };
  backend: {
    entry: string;
    outDir: string;
  };
  build: {
    target?: string;
    minify?: boolean;
    sourcemap?: boolean;
    /** JavaScript obfuscation options for production builds */
    obfuscation?: ObfuscationOptions;
  };
  /** App-level metadata for packaging */
  app?: AppConfig;
  /** Default window configuration */
  window?: WindowConfig;
  /** System tray configuration */
  tray?: TrayConfig;
  /** Desktop notification configuration */
  notifications?: NotificationConfig;
}

export interface BuildOptions {
  watch?: boolean;
  dev?: boolean;
  production?: boolean;  // Bundle all assets inline for production (no external files)
}

export interface CompileOptions {
  output?: string;
  platform?: 'windows' | 'macos' | 'auto';
}

export interface CLIArgs {
  help?: boolean;
  version?: boolean;
  watch?: boolean;
  dev?: boolean;
  output?: string;
  platform?: string;
} 