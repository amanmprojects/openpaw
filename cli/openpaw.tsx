#!/usr/bin/env bun
import { program } from "commander";
import { startGateway } from "../gateway";
import { runOpenPawTui } from "./tui";
import { handleOnboard } from "./onboard";

program.version("0.1.0").description("OpenPaw");

program
  .command("onboard")
  .description("Go through the onboarding setup")
  .action(handleOnboard);

const gateway = program.command("gateway").description("Run messaging channel adapters (shared agent runtime)");

gateway
  .command("start")
  .description("Start all configured channels (e.g. Telegram when bot token is set)")
  .action(async () => {
    try {
      await startGateway();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

program
  .command("tui")
  .description("Terminal chat UI (OpenTUI / local session), separate from the gateway process")
  .action(async () => {
    try {
      await runOpenPawTui();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

program.parse();
