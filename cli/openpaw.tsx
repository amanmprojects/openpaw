#!/usr/bin/env bun
/**
 * Main OpenPaw CLI entrypoint and command registration.
 */
import { program } from "commander";
import { handleDoctor } from "./doctor";
import { handleMemoryList, handleMemoryRemove, handleMemoryReplace } from "./memory";
import { startGateway } from "../gateway";
import { handleSessionExport } from "./sessions";
import { handleSkillsList, handleSkillsRefresh } from "./skills";
import { runOpenPawTui } from "./tui";
import { handleOnboard } from "./onboard";
import { handleReset } from "./reset";
import { handleUpdate } from "./update";
import { getOpenPawVersion } from "./version";
import {
  getGatewayDaemonStatus,
  readGatewayDaemonLog,
  restartGatewayDaemon,
  startGatewayDaemon,
  stopGatewayDaemon,
} from "../gateway/daemon-manager";
import { registerCronCommands } from "./cron";

program.version(getOpenPawVersion()).description("OpenPaw");

registerCronCommands(program);

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

const memory = program.command("memory").description("Inspect and maintain persistent memory");

memory
  .command("list")
  .description("List all memory entries")
  .action(() => handleMemoryList());

memory
  .command("user")
  .description("List user memory entries")
  .action(() => handleMemoryList("user"));

memory
  .command("agent")
  .description("List agent memory entries")
  .action(() => handleMemoryList("memory"));

memory
  .command("remove")
  .description("Remove the first memory entry matching text")
  .argument("<target>", "memory or user")
  .argument("<match>", "substring to match")
  .action(async (target: "memory" | "user", match: string) => {
    await handleMemoryRemove(target, match);
  });

memory
  .command("replace")
  .description("Replace the first memory entry matching text")
  .argument("<target>", "memory or user")
  .argument("<oldText>", "substring to match")
  .argument("<content>", "new full entry content")
  .action(async (target: "memory" | "user", oldText: string, content: string) => {
    await handleMemoryReplace(target, oldText, content);
  });

const skills = program.command("skills").description("Inspect installed skills");

skills
  .command("list")
  .description("List discovered skills")
  .action(async () => {
    await handleSkillsList();
  });

skills
  .command("refresh")
  .description("Refresh skill discovery")
  .action(async () => {
    await handleSkillsRefresh();
  });

const sessions = program.command("sessions").description("Inspect persisted sessions");

sessions
  .command("export")
  .description("Export one session to stdout")
  .argument("<sessionId>", "session id to export")
  .option("--format <format>", "json or markdown", "markdown")
  .action(async (sessionId: string, options: { format?: "json" | "markdown" }) => {
    await handleSessionExport(sessionId, options.format ?? "markdown");
  });

program
  .command("doctor")
  .description("Print local diagnostic information")
  .action(async () => {
    await handleDoctor();
  });

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
  .command("restart")
  .description("Restart gateway daemon")
  .action(() => {
    try {
      const result = restartGatewayDaemon();
      const priorPid =
        result.stopped.status === "stopped" && result.stopped.pid !== null
          ? ` (previous pid ${result.stopped.pid})`
          : "";
      console.log(
        `Restarted OpenPaw gateway daemon${priorPid}; now running as pid ${result.started.pid}. Logs: ${result.started.paths.logFile}`,
      );
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
