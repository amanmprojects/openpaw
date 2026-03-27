import { spawn } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import { requestApproval } from "../../gateway/approval-gate";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 256_000;

/**
 * Patterns that signal a potentially destructive command requiring approval.
 * If any pattern matches, the user is asked before execution.
 */
const SENSITIVE_PATTERNS = [
  /\brm\b/,
  /\bmv\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bcurl\b/,
  /\bwget\b/,
  /\bnpm\s+(publish|unpublish)\b/,
  /\bgit\s+(push|reset|clean|rebase)\b/,
  /\bdd\b/,
  /\bmkfs\b/,
  /\bsudo\b/,
  />/,            // output redirection (writes to files)
  /\btruncate\b/,
];

function isSensitiveCommand(command: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(command));
}

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
 * Runs a shell command with cwd locked to the workspace root.
 * Sensitive commands (rm, curl, git push, redirects, etc.) require explicit
 * user approval through the registered channel before execution.
 */
export function createBashTool(workspaceRoot: string) {
  return tool({
    description:
      "Run a shell command. Current working directory is the OpenPaw workspace root only. Destructive commands (rm, curl, git push, etc.) will ask the user for approval before running.",
    inputSchema: z.object({
      command: z.string().describe("Shell command to run (sh -c)"),
      timeoutMs: z
        .number()
        .optional()
        .describe(`Optional timeout in ms (default ${DEFAULT_TIMEOUT_MS})`),
    }),
    execute: async ({ command, timeoutMs }) => {
      // Gate: ask for approval if the command looks sensitive.
      if (isSensitiveCommand(command)) {
        const approved = await requestApproval(
          "bash",
          `Run shell command:\n\`\`\`\n${command}\n\`\`\``,
        );
        if (!approved) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: "[openpaw] Command denied by user (approval timeout or rejection).",
          };
        }
      }

      const ms = timeoutMs ?? DEFAULT_TIMEOUT_MS;
      try {
        const { stdout, stderr, exitCode } = await runBunSpawn(command, workspaceRoot, ms);
        return { exitCode, stdout, stderr };
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
