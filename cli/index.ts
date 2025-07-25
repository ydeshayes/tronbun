#!/usr/bin/env bun

import { parseArgs } from "util";
import { TronbunCLI } from "./cli.js";
import { Utils } from "./utils.js";

async function main() {
  const { values: args, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      watch: { type: "boolean", short: "w" },
      dev: { type: "boolean", short: "d" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: true,
  });

  if (args.help) {
    Utils.showHelp();
    return;
  }

  if (args.version) {
    Utils.showVersion();
    return;
  }

  const command = positionals[0];
  const cli = new TronbunCLI();

  try {
    switch (command) {
      case "init":
        await cli.init(positionals[1]);
        break;
      case "build":
        await cli.build({ watch: args.watch, dev: args.dev });
        break;
      case "dev":
        await cli.dev();
        break;
      case "run":
        await cli.run();
        break;
      case "compile":
        await cli.compile({ output: args.output });
        break;
      case "clean":
        await cli.clean();
        break;
      default:
        console.error("Unknown command:", command);
        console.log("Run 'tronbun --help' for usage information.");
        process.exit(1);
    }
  } catch (error) {
    console.error("❌ Command failed:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
