#!/usr/bin/env bun
import { program } from "commander";
import { runTelegramGateway } from "../gateway/telegram";
import { handleOnboard } from "./onboard";

program.version("0.1.0").description("OpenPaw");

program
  .command("onboard")
  .description("Go through the onboarding setup")
  // .option("-r, --reset", "Reset all configuration and start fresh")
  .action(handleOnboard);

program
  .command("gateway")
  .description("Run the Telegram bot gateway (long polling)")
  .action(async () => {
    try {
      await runTelegramGateway();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

program.parse();
