#!/usr/bin/env bun
import { program } from "commander";
import { handleOnboard } from "./onboard";

program.version("0.1.0").description("OpenPaw");

program
  .command("onboard")
  .description("Go through the onboarding setup")
  // .option("-r, --reset", "Reset all configuration and start fresh")
  .action(handleOnboard);

program.parse();
