/**
 * Persistent curated memory tool — add / replace / remove entries in MEMORY.md or USER.md.
 */

import { tool } from "ai";
import { z } from "zod";
import type { MemoryStore } from "../memory-store";

const DESCRIPTION =
  "Save durable information to persistent memory (survives across sessions; compact entries).\n\n" +
  "PARAMETERS BY ACTION (do not skip required fields):\n" +
  "- action add: MUST set `content` (the new entry). Do NOT use replace for brand-new facts.\n" +
  "- action replace: MUST set BOTH `old_text` AND `content`. `old_text` is a short unique substring that appears in exactly one existing entry (copy from the memory block in the prompt or from your last memory tool result). `content` is the full replacement text for that entry.\n" +
  "- action remove: MUST set `old_text` (substring identifying the entry). `content` is ignored.\n\n" +
  "Common mistake: using action replace with only `content` — that fails; use add for new entries, or include `old_text` when replacing.\n\n" +
  "WHEN TO SAVE: corrections, preferences, timezone/location when relevant, stable environment facts. Not ephemeral logs.\n\n" +
  "TARGETS: user = user profile facts; memory = your notes.\n\n" +
  "When you tell the user you saved something, say it in ordinary words — do not name backing files or tools.";

/**
 * Registers the memory tool against a shared {@link MemoryStore} instance.
 */
export function createMemoryTool(store: MemoryStore) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      action: z
        .enum(["add", "replace", "remove"])
        .describe(
          "add = append one entry (needs content only). replace = rewrite one entry (needs old_text + content). remove = delete one entry (needs old_text only).",
        ),
      target: z
        .enum(["memory", "user"])
        .describe("memory = agent notes; user = user profile."),
      content: z
        .string()
        .optional()
        .describe(
          "For add: required full text of the new entry. For replace: required full text that will replace the matched entry. Omit for remove.",
        ),
      old_text: z
        .string()
        .optional()
        .describe(
          "For replace and remove: required. A substring unique to one existing entry (e.g. 'Birthday:' or an old date). Not needed for add.",
        ),
    }),
    execute: async ({ action, target, content, old_text }) => {
      if (action === "add") {
        if (!content?.trim()) {
          return JSON.stringify({ success: false, error: "content is required for add." });
        }
        const result = await store.add(target, content);
        return JSON.stringify(result);
      }
      if (action === "replace") {
        if (!old_text?.trim()) {
          return JSON.stringify({
            success: false,
            error:
              "replace requires `old_text` (substring of the entry to change) AND `content` (new full entry). For a new fact with no prior entry, use action `add` with only `content`.",
          });
        }
        if (!content?.trim()) {
          return JSON.stringify({
            success: false,
            error:
              "replace requires `content` (the full replacement text for the entry matched by `old_text`).",
          });
        }
        const result = await store.replace(target, old_text, content);
        return JSON.stringify(result);
      }
      if (action === "remove") {
        if (!old_text?.trim()) {
          return JSON.stringify({ success: false, error: "old_text is required for remove." });
        }
        const result = await store.remove(target, old_text);
        return JSON.stringify(result);
      }
      return JSON.stringify({ success: false, error: "Unknown action." });
    },
  });
}
