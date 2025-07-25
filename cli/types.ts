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
  };
}

export interface BuildOptions {
  watch?: boolean;
  dev?: boolean;
}

export interface CompileOptions {
  output?: string;
}

export interface CLIArgs {
  help?: boolean;
  version?: boolean;
  watch?: boolean;
  dev?: boolean;
  output?: string;
} 