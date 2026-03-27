import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { tool } from "ai";
import { z } from "zod";
import { isSandboxRestricted } from "../turn-context";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 256_000;

function runBunSpawn(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("/bin/sh", ["-c", command], {
      cwd,
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
    }, timeoutMs);

    const cap = (chunk: Buffer, acc: { s: string; n: number }) => {
      const str = chunk.toString("utf8");
      if (acc.n >= MAX_OUTPUT_BYTES) {
        return;
      }
      const take = Math.min(str.length, MAX_OUTPUT_BYTES - acc.n);
      acc.s += str.slice(0, take);
      acc.n += take;
    };

    const outAcc = { s: "", n: 0 };
    const errAcc = { s: "", n: 0 };

    proc.stdout?.on("data", (d: Buffer) => cap(d, outAcc));
    proc.stderr?.on("data", (d: Buffer) => cap(d, errAcc));

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killed) {
        resolve({
          stdout: outAcc.s,
          stderr: errAcc.s + "\n[openpaw] Command timed out.",
          exitCode: 124,
        });
        return;
      }
      resolve({ stdout: outAcc.s, stderr: errAcc.s, exitCode: code });
    });
  });
}

/**
 * Runs a shell command; cwd is the workspace when sandbox is on, or the user home when off.
 */
export function createBashTool(workspaceRoot: string) {
  return tool({
    description:
      "Run a shell command via sh -c. With sandbox on, cwd is the OpenPaw workspace root; with sandbox off, cwd is the user home directory. Avoid destructive commands unless the user asked.",
    inputSchema: z.object({
      command: z.string().describe("Shell command to run (sh -c)"),
      timeoutMs: z
        .number()
        .optional()
        .describe(`Optional timeout in ms (default ${DEFAULT_TIMEOUT_MS})`),
    }),
    execute: async ({ command, timeoutMs }) => {
      const ms = timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const cwd = isSandboxRestricted() ? workspaceRoot : homedir();
      try {
        const { stdout, stderr, exitCode } = await runBunSpawn(command, cwd, ms);
        return {
          exitCode,
          stdout,
          stderr,
        };
      } catch (e) {
        return {
          exitCode: -1,
          stdout: "",
          stderr: e instanceof Error ? e.message : String(e),
        };
      }
    },
  });
}
