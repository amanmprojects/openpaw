/**
 * Agent tools for persistent memory: `memory_write` and `memory_search`.
 *
 * Backed by the SQLite memory store. Embeddings are generated lazily using
 * the AI SDK `embed()` function with the same provider model.
 */

import { tool } from "ai";
import { embed } from "ai";
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Database } from "bun:sqlite";
import type { OpenPawConfig } from "../../config/types";
import {
  insertMemory,
  updateEmbedding,
  searchMemories,
  getRecentMemories,
  pruneOldMemories,
} from "./memory-store";

// ─── Embedding helper ─────────────────────────────────────────────────────────

/**
 * Generates a Float32Array embedding for the given text using the configured
 * provider.  Falls back to null if the provider does not support embeddings
 * (e.g. Ollama without an embed endpoint).
 */
async function embedText(
  config: OpenPawConfig,
  text: string,
): Promise<Float32Array | null> {
  try {
    const provider = createOpenAICompatible({
      baseURL: config.provider.baseUrl,
      name: "openpaw-embed",
      apiKey: config.provider.apiKey,
    });
    // Use the configured model as the embedding model.
    // Many OpenAI-compatible providers expose /embeddings on the same endpoint.
    const embeddingModel = provider.textEmbeddingModel(config.provider.model);
    const result = await embed({ model: embeddingModel, value: text });
    return new Float32Array(result.embedding);
  } catch {
    // Embedding not supported by this provider — degrade gracefully.
    return null;
  }
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

/**
 * Creates `memory_write` and `memory_search` tools tied to a specific SQLite
 * database and OpenPaw config (for embedding generation).
 */
export function createMemoryTools(db: Database, config: OpenPawConfig) {
  /**
   * Writes a new entry to the long-term memory diary.
   * The agent should call this to remember important facts, preferences,
   * decisions, or context that should persist across sessions.
   */
  const memory_write = tool({
    description:
      "Save a memory entry for long-term recall. Use to remember important facts, user preferences, decisions, or context that should persist across sessions. The agent calls this proactively without being asked.",
    inputSchema: z.object({
      summary: z
        .string()
        .max(120)
        .describe("Short one-line label for this memory (max 120 chars)"),
      content: z
        .string()
        .describe("Full text to remember. Be specific and concrete."),
    }),
    execute: async ({ summary, content }) => {
      try {
        const id = insertMemory(db, summary, content);
        // Generate embedding in background — don't block the agent reply.
        void embedText(config, `${summary}\n${content}`).then((vec) => {
          if (vec) updateEmbedding(db, id, vec);
        });
        return { ok: true, id, message: `Memory saved (id ${id}): "${summary}"` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  /**
   * Searches long-term memory for entries relevant to the given query.
   * Uses cosine similarity when embeddings are available, recency otherwise.
   */
  const memory_search = tool({
    description:
      "Search long-term memory for information relevant to a query. Returns the most semantically similar past entries. Call before answering questions about past conversations, preferences, or facts.",
    inputSchema: z.object({
      query: z.string().describe("Natural-language search query"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of results to return (default 5)"),
    }),
    execute: async ({ query, topK = 5 }) => {
      try {
        const queryVec = await embedText(config, query);
        const results = queryVec
          ? searchMemories(db, queryVec, topK)
          : getRecentMemories(db, topK).map((e) => ({ ...e, score: 0 }));

        if (results.length === 0) {
          return { ok: true, results: [], message: "No memories found yet." };
        }

        return {
          ok: true,
          results: results.map((r) => ({
            id: r.id,
            createdAt: r.createdAt,
            summary: r.summary,
            content: r.content,
            relevanceScore: parseFloat(r.score.toFixed(4)),
          })),
        };
      } catch (e) {
        return { ok: false, results: [], error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  /**
   * Lists the most recent memory entries (for /memory list style commands).
   */
  const memory_recent = tool({
    description:
      "List the most recent memory entries without semantic search. Useful to give the user a digest of what has been remembered.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of recent entries to return (default 10)"),
    }),
    execute: async ({ limit = 10 }) => {
      try {
        const entries = getRecentMemories(db, limit);
        return { ok: true, entries };
      } catch (e) {
        return { ok: false, entries: [], error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  /**
   * Prunes memory entries older than N days (maintenance / hygiene).
   */
  const memory_prune = tool({
    description:
      "Delete memory entries older than the specified number of days. Use for memory hygiene when the user asks to clean up old memories.",
    inputSchema: z.object({
      olderThanDays: z
        .number()
        .int()
        .min(1)
        .describe("Delete entries older than this many days"),
    }),
    execute: async ({ olderThanDays }) => {
      try {
        const deleted = pruneOldMemories(db, olderThanDays);
        return { ok: true, deleted, message: `Pruned ${deleted} entries older than ${olderThanDays} days.` };
      } catch (e) {
        return { ok: false, deleted: 0, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });

  return { memory_write, memory_search, memory_recent, memory_prune };
}
