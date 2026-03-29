import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Filesystem paths used by the gateway daemon lifecycle. */
export type GatewayDaemonPaths = {
  stateDir: string;
  pidFile: string;
  logFile: string;
  errFile: string;
};

/** Current observed process state for the background gateway daemon. */
export type GatewayDaemonState = "running" | "stopped" | "stale";

/** Structured status payload returned by {@link getGatewayDaemonStatus}. */
export type GatewayDaemonStatus = {
  state: GatewayDaemonState;
  pid: number | null;
  paths: GatewayDaemonPaths;
};

/** Result payload from {@link startGatewayDaemon}. */
export type StartGatewayDaemonResult = {
  status: "started" | "already_running";
  pid: number;
  paths: GatewayDaemonPaths;
};

/** Result payload from {@link stopGatewayDaemon}. */
export type StopGatewayDaemonResult = {
  status: "stopped" | "already_stopped";
  pid: number | null;
  paths: GatewayDaemonPaths;
};

/** Result payload from {@link restartGatewayDaemon}. */
export type RestartGatewayDaemonResult = {
  stopped: StopGatewayDaemonResult;
  started: StartGatewayDaemonResult;
};

/** CLI entrypoint path for spawning `openpaw gateway dev` in a detached process. */
const OPENPAW_CLI_ENTRY = fileURLToPath(new URL("../cli/openpaw.tsx", import.meta.url));

/**
 * Canonical daemon state file locations under `~/.openpaw/gateway`.
 */
export function getGatewayDaemonPaths(): GatewayDaemonPaths {
  const stateDir = join(homedir(), ".openpaw", "gateway");
  return {
    stateDir,
    pidFile: join(stateDir, "gateway.pid"),
    logFile: join(stateDir, "gateway.log"),
    errFile: join(stateDir, "gateway.err.log"),
  };
}

/**
 * Ensures daemon state directory exists before reading/writing status files.
 */
function ensureDaemonStateDir(paths: GatewayDaemonPaths): void {
  if (!existsSync(paths.stateDir)) {
    mkdirSync(paths.stateDir, { recursive: true });
  }
}

/**
 * Parses daemon pid from disk. Returns `null` when missing, invalid, or unreadable.
 */
function readPid(paths: GatewayDaemonPaths): number | null {
  if (!existsSync(paths.pidFile)) {
    return null;
  }
  try {
    const raw = readFileSync(paths.pidFile, "utf8").trim();
    if (!/^\d+$/.test(raw)) {
      return null;
    }
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort liveness check using `kill(pid, 0)` semantics.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes stale pid file when process is no longer alive.
 */
function cleanupStalePid(paths: GatewayDaemonPaths): void {
  if (existsSync(paths.pidFile)) {
    rmSync(paths.pidFile, { force: true });
  }
}

/**
 * Resolves current daemon status and auto-cleans stale pid state.
 */
export function getGatewayDaemonStatus(): GatewayDaemonStatus {
  const paths = getGatewayDaemonPaths();
  const pid = readPid(paths);
  if (pid === null) {
    return { state: "stopped", pid: null, paths };
  }

  if (isProcessAlive(pid)) {
    return { state: "running", pid, paths };
  }

  cleanupStalePid(paths);
  return { state: "stale", pid, paths };
}

/**
 * Starts gateway in detached mode (`openpaw gateway dev`) if not already running.
 */
export function startGatewayDaemon(): StartGatewayDaemonResult {
  const pre = getGatewayDaemonStatus();
  if (pre.state === "running" && pre.pid !== null) {
    return { status: "already_running", pid: pre.pid, paths: pre.paths };
  }

  const paths = pre.paths;
  ensureDaemonStateDir(paths);

  const outFd = openSync(paths.logFile, "a");
  const errFd = openSync(paths.errFile, "a");
  const child = spawn(process.execPath, [OPENPAW_CLI_ENTRY, "gateway", "dev"], {
    detached: true,
    stdio: ["ignore", outFd, errFd],
    env: process.env,
  });

  child.unref();
  closeSync(outFd);
  closeSync(errFd);

  if (child.pid === undefined) {
    throw new Error("Failed to start gateway daemon: child process pid was unavailable.");
  }

  writeFileSync(paths.pidFile, `${child.pid}\n`, "utf8");
  return { status: "started", pid: child.pid, paths };
}

/**
 * Stops detached gateway daemon process if currently running.
 */
export function stopGatewayDaemon(): StopGatewayDaemonResult {
  const status = getGatewayDaemonStatus();
  const { paths } = status;

  if (status.state !== "running" || status.pid === null) {
    cleanupStalePid(paths);
    return { status: "already_stopped", pid: status.pid, paths };
  }

  try {
    process.kill(status.pid, "SIGTERM");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to stop gateway daemon (pid ${status.pid}): ${message}`);
  }

  cleanupStalePid(paths);
  return { status: "stopped", pid: status.pid, paths };
}

/**
 * Restarts detached gateway daemon by stopping any running process, then starting a new one.
 */
export function restartGatewayDaemon(): RestartGatewayDaemonResult {
  const stopped = stopGatewayDaemon();
  const started = startGatewayDaemon();
  return { stopped, started };
}

/**
 * Returns the last `lineCount` lines from the selected daemon log file.
 */
export function readGatewayDaemonLog(lineCount = 80, stream: "stdout" | "stderr" = "stdout"): string {
  const paths = getGatewayDaemonPaths();
  const logPath = stream === "stdout" ? paths.logFile : paths.errFile;
  if (!existsSync(logPath)) {
    return "";
  }

  const raw = readFileSync(logPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const tail = lines.slice(Math.max(lines.length - lineCount, 0));
  return tail.join("\n").trim();
}
