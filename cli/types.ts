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