/**
 * OpenPaw Web Dashboard — HTTP server.
 *
 * Serves the static dashboard UI at http://localhost:4242 and exposes a
 * small REST API for the UI to read/write workspace files, sessions, memory
 * entries, and the token budget.
 *
 * API routes:
 *   GET  /                      → dashboard HTML
 *   GET  /api/info              → { sessionCount, memoryCount, tools[] }
 *   GET  /api/sessions          → { sessions: [{ id, messageCount, updatedAt }] }
 *   GET  /api/memory?q=<query>  → { entries: MemoryEntry[] }
 *   GET  /api/file?name=<name>  → { content: string }
 *   POST /api/file              → { name, content } → 200/400
 *   GET  /api/budget            → { date, used, limit, remaining, exhausted }
 */

import { join } from "node:path";
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { getWorkspaceRoot, getSessionsDir, getMemoryDbPath } from "../config/paths";
import { openMemoryDb, getRecentMemories } from "../agent/memory/memory-store";
import { loadState } from "../agent/token-budget";

const DASHBOARD_HTML = join(import.meta.dir, "index.html");
const PORT = 4242;

// Safe workspace filenames that the dashboard is allowed to read/write.
const ALLOWED_FILES = new Set(["agents.md", "soul.md", "user.md", "HEARTBEAT.md"]);

// Tool names exposed in /api/info (kept in sync manually for now).
const TOOL_NAMES = [
  "bash", "file_editor", "web_search", "pdf_read",
  "memory_write", "memory_search", "memory_recent", "memory_prune",
  "upi_parse", "upi_summary", "academic_calendar",
];

function cors(headers: Record<string, string> = {}): Headers {
  const h = new Headers(headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return h;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors({ "Content-Type": "application/json" }),
  });
}

function countSessionMessages(filePath: string): number {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { messages?: unknown[] };
    return parsed.messages?.length ?? 0;
  } catch {
    return 0;
  }
}

function handleApiInfo(): Response {
  const sessionsDir = getSessionsDir();
  let sessionCount = 0;
  if (existsSync(sessionsDir)) {
    sessionCount = readdirSync(sessionsDir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("token-budget"))
      .length;
  }

  let memoryCount = 0;
  const dbPath = getMemoryDbPath();
  if (existsSync(dbPath)) {
    try {
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare("SELECT COUNT(*) as n FROM memory").get() as { n: number };
      memoryCount = row.n;
      db.close();
    } catch {}
  }

  return json({ sessionCount, memoryCount, tools: TOOL_NAMES });
}

function handleApiSessions(): Response {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return json({ sessions: [] });

  const sessions = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("token-budget") && !f.startsWith("telegram-"))
    .map((f) => {
      const path = join(dir, f);
      const stat = statSync(path);
      return {
        id: f.replace(/\.json$/, ""),
        messageCount: countSessionMessages(path),
        updatedAt: stat.mtime.toISOString().slice(0, 16).replace("T", " "),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50);

  return json({ sessions });
}

function handleApiMemory(url: URL): Response {
  const dbPath = getMemoryDbPath();
  if (!existsSync(dbPath)) return json({ entries: [] });

  try {
    const db = openMemoryDb(dbPath);
    const entries = getRecentMemories(db, 100);
    const q = url.searchParams.get("q")?.toLowerCase().trim() ?? "";
    const filtered = q
      ? entries.filter((e) =>
          e.summary.toLowerCase().includes(q) || e.content.toLowerCase().includes(q)
        )
      : entries;
    db.close();
    return json({ entries: filtered.slice(0, 50) });
  } catch (e) {
    return json({ entries: [], error: String(e) });
  }
}

function handleApiFileGet(url: URL): Response {
  const name = url.searchParams.get("name") ?? "";
  if (!ALLOWED_FILES.has(name)) return json({ error: "File not allowed" }, 400);
  const path = join(getWorkspaceRoot(), name);
  const content = existsSync(path) ? readFileSync(path, "utf8") : "";
  return json({ name, content });
}

async function handleApiFilePost(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { name?: string; content?: string };
    const { name = "", content = "" } = body;
    if (!ALLOWED_FILES.has(name)) return json({ error: "File not allowed" }, 400);
    const path = join(getWorkspaceRoot(), name);
    writeFileSync(path, content, "utf8");
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}

function handleApiBudget(): Response {
  try {
    const state = loadState();
    return json(state);
  } catch {
    return json({ date: "—", used: 0, limit: 0, remaining: 0, exhausted: false });
  }
}

/**
 * Starts the OpenPaw dashboard server.
 * Returns the server instance so callers can close it on shutdown.
 */
export function startDashboardServer(): ReturnType<typeof Bun.serve> {
  const htmlContent = existsSync(DASHBOARD_HTML)
    ? readFileSync(DASHBOARD_HTML, "utf8")
    : "<h1>Dashboard not found</h1>";

  const server = Bun.serve({
    port: PORT,
    fetch: async (req) => {
      const url = new URL(req.url);
      const path = url.pathname;

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors() });
      }

      try {
        if (path === "/" || path === "/index.html") {
          return new Response(htmlContent, {
            headers: cors({ "Content-Type": "text/html; charset=utf-8" }),
          });
        }
        if (path === "/api/info") return handleApiInfo();
        if (path === "/api/sessions") return handleApiSessions();
        if (path === "/api/memory") return handleApiMemory(url);
        if (path === "/api/file") {
          if (req.method === "GET") return handleApiFileGet(url);
          if (req.method === "POST") return handleApiFilePost(req);
        }
        if (path === "/api/budget") return handleApiBudget();
        return new Response("Not found", { status: 404, headers: cors() });
      } catch (e) {
        console.error("[dashboard] Error handling", path, e);
        return json({ error: "Internal error" }, 500);
      }
    },
  });

  console.log(`🐾 OpenPaw Dashboard → http://localhost:${PORT}`);
  return server;
}
