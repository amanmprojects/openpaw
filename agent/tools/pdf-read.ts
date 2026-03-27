/**
 * PDF reader tool for OpenPaw.
 *
 * Extracts text from a PDF file using the system `pdftotext` binary
 * (poppler-utils, installed on most Linux systems). The resulting text is
 * truncated to a sane limit before being returned to the model, with a
 * note if the document was cut off.
 *
 * The tool accepts both absolute paths and paths relative to the workspace
 * root (same sandbox rules as the file_editor tool).
 */

import { tool } from "ai";
import { z } from "zod";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const MAX_CHARS = 80_000; // ~20k tokens — enough for most papers
const PDFTOTEXT_TIMEOUT_MS = 30_000;

/** Run pdftotext and return the extracted text. */
function runPdfToText(pdfPath: string): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    // "-" as output means stdout
    const proc = spawn("pdftotext", ["-layout", pdfPath, "-"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
    }, PDFTOTEXT_TIMEOUT_MS);

    proc.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      rejectP(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killed) {
        rejectP(new Error("pdftotext timed out"));
        return;
      }
      if (code !== 0) {
        rejectP(new Error(`pdftotext exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolveP(stdout);
    });
  });
}

/**
 * Resolves a user-provided path: if it starts with `/` treat it as absolute,
 * otherwise resolve relative to `workspaceRoot`.
 * Returns null if the resolved path escapes the workspace root (for relative paths).
 */
function resolvePath(workspaceRoot: string, userPath: string): string | null {
  if (userPath.startsWith("/")) {
    return userPath; // absolute path — trust user (no workspace jail for PDFs)
  }
  const root = resolve(workspaceRoot);
  const full = resolve(workspaceRoot, userPath);
  if (full !== root && !full.startsWith(root + "/")) {
    return null;
  }
  return full;
}

/**
 * Creates the `pdf_read` tool, which extracts text from a PDF file and
 * returns it so the agent can summarise, search, or answer questions about it.
 */
export function createPdfReadTool(workspaceRoot: string) {
  return tool({
    description:
      "Extract and read text from a PDF file. Provide a path to the PDF file (absolute or relative to workspace root). The agent can then summarise, answer questions about, or search the document.",
    inputSchema: z.object({
      path: z.string().describe("Path to the PDF file (absolute or relative to workspace root)"),
      startPage: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("First page to extract (1-indexed, default: 1)"),
      endPage: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Last page to extract (inclusive, default: all)"),
    }),
    execute: async ({ path: userPath, startPage, endPage }) => {
      const absPath = resolvePath(workspaceRoot, userPath);
      if (!absPath) {
        return { ok: false as const, error: "Path escapes workspace root" };
      }
      if (!existsSync(absPath)) {
        return { ok: false as const, error: `File not found: ${absPath}` };
      }
      if (!absPath.toLowerCase().endsWith(".pdf")) {
        return { ok: false as const, error: "File does not appear to be a PDF" };
      }

      try {
        // Build args for page range
        const args: string[] = ["-layout"];
        if (startPage) { args.push("-f", String(startPage)); }
        if (endPage) { args.push("-l", String(endPage)); }

        // We need to call directly with page args — recreate proc
        const fullText = await new Promise<string>((res, rej) => {
          const proc = spawn("pdftotext", [...args, absPath, "-"], {
            stdio: ["ignore", "pipe", "pipe"],
          });
          let out = "";
          let err = "";
          let killed = false;
          const t = setTimeout(() => { killed = true; proc.kill("SIGTERM"); }, PDFTOTEXT_TIMEOUT_MS);
          proc.stdout?.on("data", (d: Buffer) => { out += d.toString("utf8"); });
          proc.stderr?.on("data", (d: Buffer) => { err += d.toString("utf8"); });
          proc.on("error", (e) => { clearTimeout(t); rej(e); });
          proc.on("close", (code) => {
            clearTimeout(t);
            if (killed) { rej(new Error("timeout")); return; }
            if (code !== 0) { rej(new Error(`pdftotext error: ${err.trim()}`)); return; }
            res(out);
          });
        });

        const truncated = fullText.length > MAX_CHARS;
        const text = truncated ? fullText.slice(0, MAX_CHARS) : fullText;
        const charCount = fullText.length;

        return {
          ok: true as const,
          text,
          charCount,
          truncated,
          truncatedNote: truncated
            ? `[truncated at ${MAX_CHARS} chars; document has ${charCount} total chars. Use startPage/endPage to read specific sections.]`
            : undefined,
        };
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  });
}
