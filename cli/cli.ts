import type { TronbunConfig, BuildOptions, CompileOptions } from "./types.js";
import { ConfigManager } from "./config.js";
import { BuildCommand } from "./commands/build.js";
import { DevCommand } from "./commands/dev.js";
import { RunCommand } from "./commands/run.js";
import { InitCommand } from "./commands/init.js";
import { CleanCommand } from "./commands/clean.js";
import { CompileCommand } from "./commands/compile.js";

export class TronbunCLI {
  private config: TronbunConfig;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.config = ConfigManager.loadConfig(projectRoot);
  }

  async build(options: BuildOptions = {}): Promise<boolean> {
    return BuildCommand.build(this.config, this.projectRoot, options);
  }

  async dev(): Promise<void> {
    return DevCommand.dev(this.config, this.projectRoot);
  }

  async run(): Promise<void> {
    return RunCommand.run(this.config, this.projectRoot);
  }

  async init(projectName?: string): Promise<void> {
    return InitCommand.init(projectName);
  }

  async clean(): Promise<void> {
    return CleanCommand.clean(this.config, this.projectRoot);
  }

  async compile(options: CompileOptions = {}): Promise<boolean> {
    return CompileCommand.compile(this.config, this.projectRoot, options);
  }
} 