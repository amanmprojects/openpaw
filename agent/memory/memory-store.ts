/**
 * Persistent memory store for OpenPaw.
 *
 * Uses Bun's built-in SQLite to persist diary entries. Each entry has:
 * - timestamp
 * - summary (short label)
 * - content (the full text)
 * - embedding (float32 vector stored as a BLOB for cosine search)
 *
 * Embeddings are generated lazily via the AI SDK `embed()` call using the
 * same provider the user has configured.
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

export type MemoryEntry = {
  id: number;
  createdAt: string;       // ISO timestamp
  summary: string;
  content: string;
};

type RawRow = {
  id: number;
  created_at: string;
  summary: string;
  content: string;
  embedding: ArrayBuffer | null;
};

// ─── DB bootstrap ─────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT    NOT NULL,
  summary    TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  embedding  BLOB
);
CREATE INDEX IF NOT EXISTS idx_memory_created ON memory(created_at DESC);
`;

/**
 * Opens (or creates) the memory SQLite database at the given path.
 */
export function openMemoryDb(dbPath: string): Database {
  const dir = join(dbPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath, { create: true });
  db.exec(SCHEMA);
  return db;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/** Insert a memory entry, optionally with a pre-computed embedding. */
export function insertMemory(
  db: Database,
  summary: string,
  content: string,
  embedding?: Float32Array,
): number {
  const stmt = db.prepare(
    "INSERT INTO memory (created_at, summary, content, embedding) VALUES (?, ?, ?, ?)",
  );
  const result = stmt.run(
    new Date().toISOString(),
    summary,
    content,
    embedding ? Buffer.from(embedding.buffer) : null,
  );
  return Number(result.lastInsertRowid);
}

/** Update the embedding for an existing entry. */
export function updateEmbedding(db: Database, id: number, embedding: Float32Array): void {
  db.prepare("UPDATE memory SET embedding = ? WHERE id = ?").run(
    Buffer.from(embedding.buffer),
    id,
  );
}

/** Return the N most recent entries (newest first). */
export function getRecentMemories(db: Database, limit = 20): MemoryEntry[] {
  const rows = db
    .prepare("SELECT id, created_at, summary, content FROM memory ORDER BY created_at DESC LIMIT ?")
    .all(limit) as RawRow[];
  return rows.map(toEntry);
}

/** Delete all entries older than `days` days. */
export function pruneOldMemories(db: Database, days: number): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = db.prepare("DELETE FROM memory WHERE created_at < ?").run(cutoff);
  return Number(result.changes);
}

// ─── Vector search ────────────────────────────────────────────────────────────

function toFloat32(buf: ArrayBuffer): Float32Array {
  return new Float32Array(buf);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export type ScoredMemory = MemoryEntry & { score: number };

/**
 * Returns the top-K memories most similar to `queryEmbedding` by cosine.
 * Falls back to recency-ranked results when no entries have embeddings.
 */
export function searchMemories(
  db: Database,
  queryEmbedding: Float32Array,
  topK = 5,
): ScoredMemory[] {
  const rows = db
    .prepare("SELECT id, created_at, summary, content, embedding FROM memory WHERE embedding IS NOT NULL")
    .all() as RawRow[];

  if (rows.length === 0) {
    return getRecentMemories(db, topK).map((e) => ({ ...e, score: 0 }));
  }

  const scored: ScoredMemory[] = rows.map((row) => ({
    ...toEntry(row),
    score: cosine(queryEmbedding, toFloat32(row.embedding!)),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function toEntry(row: RawRow): MemoryEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    summary: row.summary,
    content: row.content,
  };
}
