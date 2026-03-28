#!/usr/bin/env bun
import { program } from "commander";
import { startGateway } from "../gateway";
import { runOpenPawTui } from "./tui";
import { handleOnboard } from "./onboard";
import { handleReset } from "./reset";
import { handleUpdate } from "./update";
import { getOpenPawVersion } from "./version";
import {
  getGatewayDaemonStatus,
  readGatewayDaemonLog,
  startGatewayDaemon,
  stopGatewayDaemon,
} from "../gateway/daemon-manager";

program.version(getOpenPawVersion()).description("OpenPaw");

program
  .command("reset")
  .description(
    "Delete ~/.openpaw/workspace (sessions and files) and recreate onboarding default layout",
  )
  .action(() => {
    try {
      handleReset();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

program
  .command("onboard")
  .description("Go through the onboarding setup")
  .action(handleOnboard);

program
  .command("update")
  .description("Update OpenPaw to the latest published release")
  .action(() => {
    try {
      handleUpdate();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

const gateway = program.command("gateway").description("Run messaging channel adapters (shared agent runtime)");

gateway
  .command("dev")
  .description("Start all configured channels in foreground mode (blocking)")
  .action(async () => {
    try {
      await startGateway();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

gateway
  .command("start")
  .description("Start gateway daemon in background mode")
  .action(() => {
    try {
      const result = startGatewayDaemon();
      if (result.status === "already_running") {
        console.log(
          `OpenPaw gateway is already running (pid ${result.pid}). Logs: ${result.paths.logFile}`,
        );
        return;
      }
      console.log(
        `OpenPaw gateway started in background (pid ${result.pid}). Logs: ${result.paths.logFile}`,
      );
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

gateway
  .command("stop")
  .description("Stop gateway daemon")
  .action(() => {
    try {
      const result = stopGatewayDaemon();
      if (result.status === "already_stopped") {
        console.log("OpenPaw gateway is not running.");
        return;
      }
      console.log(`Stopped OpenPaw gateway daemon (pid ${result.pid}).`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

gateway
  .command("status")
  .description("Show gateway daemon status")
  .action(() => {
    try {
      const status = getGatewayDaemonStatus();
      if (status.state === "running") {
        console.log(`OpenPaw gateway is running (pid ${status.pid}).`);
        console.log(`stdout log: ${status.paths.logFile}`);
        console.log(`stderr log: ${status.paths.errFile}`);
        return;
      }
      if (status.state === "stale") {
        console.log(`OpenPaw gateway had a stale pid (${status.pid}); pid file was cleaned.`);
        return;
      }
      console.log("OpenPaw gateway is stopped.");
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

gateway
  .command("logs")
  .description("Print recent gateway daemon logs")
  .option("--stderr", "Show stderr log instead of stdout")
  .option("-n, --lines <count>", "Number of lines to show", "80")
  .action((options: { stderr?: boolean; lines?: string }) => {
    try {
      const parsed = Number.parseInt(options.lines ?? "80", 10);
      const lineCount = Number.isFinite(parsed) && parsed > 0 ? parsed : 80;
      const stream = options.stderr ? "stderr" : "stdout";
      const text = readGatewayDaemonLog(lineCount, stream);
      if (!text) {
        console.log("No daemon logs found yet.");
        return;
      }
      console.log(text);
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
