#!/usr/bin/env node

/**
 * Node launcher shim for OpenPaw.
 *
 * Purpose:
 * - Keep npm global install UX (`npm i -g openpaw`) simple.
 * - Ensure Bun is available before running the Bun-native TypeScript CLI.
 * - Offer interactive Bun install on macOS/Linux when missing.
 */

const { spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

/** Absolute CLI entrypoint shipped in the npm package. */
const CLI_ENTRY = path.resolve(__dirname, "..", "cli", "openpaw.tsx");

/** Home-local Bun binary path used by official installer on Unix systems. */
const HOME_BUN_BIN = path.join(os.homedir(), ".bun", "bin", "bun");

/**
 * Returns a PATH string that includes default Bun install directory if present.
 */
function pathWithHomeBun(envPath) {
  if (!existsSync(HOME_BUN_BIN)) {
    return envPath || "";
  }
  const delimiter = process.platform === "win32" ? ";" : ":";
  const segments = (envPath || "").split(delimiter).filter(Boolean);
  const homeBunDir = path.dirname(HOME_BUN_BIN);
  if (!segments.includes(homeBunDir)) {
    segments.unshift(homeBunDir);
  }
  return segments.join(delimiter);
}

/**
 * Resolves Bun binary by trying PATH (and `~/.bun/bin`) with lightweight version checks.
 */
function resolveBunBinary() {
  const env = { ...process.env, PATH: pathWithHomeBun(process.env.PATH) };
  const checkPath = spawnSync("bun", ["--version"], {
    env,
    stdio: "ignore",
  });
  if (checkPath.status === 0) {
    return { bun: "bun", env };
  }

  if (existsSync(HOME_BUN_BIN)) {
    const checkHome = spawnSync(HOME_BUN_BIN, ["--version"], {
      env,
      stdio: "ignore",
    });
    if (checkHome.status === 0) {
      return { bun: HOME_BUN_BIN, env };
    }
  }

  return null;
}

/**
 * Prompts the user for a yes/no choice and resolves `true` only for affirmative answers.
 */
function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      const value = String(answer || "").trim().toLowerCase();
      resolve(value === "" || value === "y" || value === "yes");
    });
  });
}

/**
 * Runs official Bun installer on Unix (`curl ... | bash`) and returns success flag.
 */
function installBunUnix() {
  const cmd = "curl -fsSL https://bun.sh/install | bash";
  const result = spawnSync("bash", ["-lc", cmd], { stdio: "inherit" });
  return result.status === 0;
}

/**
 * Prints manual Bun install guidance and exits with failure.
 */
function failWithBunInstructions() {
  if (process.platform === "win32") {
    console.error("Bun is required to run OpenPaw.");
    console.error("Install Bun from https://bun.sh/docs/installation and rerun `openpaw`.");
    process.exit(1);
  }

  console.error("Bun is required to run OpenPaw.");
  console.error("Install with: curl -fsSL https://bun.sh/install | bash");
  console.error("Then restart your shell and rerun `openpaw`.");
  process.exit(1);
}

/**
 * Ensures Bun is present. When missing on macOS/Linux, asks permission to install it.
 */
async function ensureBun() {
  const resolved = resolveBunBinary();
  if (resolved) {
    return resolved;
  }

  if (process.platform === "win32") {
    failWithBunInstructions();
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    failWithBunInstructions();
  }

  const consent = await promptYesNo("Bun is required but not found. Install Bun now? [Y/n] ");
  if (!consent) {
    failWithBunInstructions();
  }

  const installed = installBunUnix();
  if (!installed) {
    console.error("Bun install failed.");
    failWithBunInstructions();
  }

  const after = resolveBunBinary();
  if (!after) {
    console.error("Bun installed but not detected in PATH.");
    failWithBunInstructions();
  }

  return after;
}

/**
 * Executes Bun CLI (`bun run <entry> ...args`) with inherited stdio and signal forwarding.
 */
function runBunCli(bun, env) {
  const args = ["run", CLI_ENTRY, ...process.argv.slice(2)];
  const child = spawn(bun, args, {
    stdio: "inherit",
    env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

/**
 * Launcher entrypoint.
 */
async function main() {
  const { bun, env } = await ensureBun();
  runBunCli(bun, env);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`OpenPaw launcher error: ${message}`);
  process.exit(1);
});
