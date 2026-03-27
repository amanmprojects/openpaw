/**
 * Bounded curated memory: MEMORY.md (agent notes) and USER.md (user profile facts).
 * Frozen snapshot at load for system prompt; mutations persist to disk and return live state in tool results.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** Same delimiter as Hermes memory_tool — entries may be multiline. */
export const ENTRY_DELIMITER = "\n§\n";

const MEMORY_CHAR_LIMIT = 2200;
const USER_CHAR_LIMIT = 1375;

const MEMORY_THREAT_PATTERNS: [RegExp, string][] = [
  [/ignore\s+(previous|all|above|prior)\s+instructions/i, "prompt_injection"],
  [/you\s+are\s+now\s+/i, "role_hijack"],
  [/do\s+not\s+tell\s+the\s+user/i, "deception_hide"],
  [/system\s+prompt\s+override/i, "sys_prompt_override"],
  [/disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i, "disregard_rules"],
  [
    /act\s+as\s+(if|though)\s+you\s+(have\s+no|don't\s+have)\s+(restrictions|limits|rules)/i,
    "bypass_restrictions",
  ],
  [/curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, "exfil_curl"],
  [/wget\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, "exfil_wget"],
  [/cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)/i, "read_secrets"],
  [/authorized_keys/i, "ssh_backdoor"],
  [/\$HOME\/\.ssh|~\/\.ssh/i, "ssh_access"],
  [/\$HOME\/\.openpaw\/\.env|~\/\.openpaw\/\.env/i, "openpaw_env"],
];

const INVISIBLE_CHARS = new Set([
  "\u200b",
  "\u200c",
  "\u200d",
  "\u2060",
  "\ufeff",
  "\u202a",
  "\u202b",
  "\u202c",
  "\u202d",
  "\u202e",
]);

export type MemoryTarget = "memory" | "user";

export type MemoryMutationResult =
  | {
      success: true;
      target: MemoryTarget;
      entries: string[];
      usage: string;
      entry_count: number;
      /** Present for add/replace/remove confirmations. */
      message?: string;
    }
  | {
      success: false;
      error: string;
      matches?: string[];
      current_entries?: string[];
      usage?: string;
    };

/**
 * Returns an error string if content should be blocked for injection/exfil patterns.
 */
export function scanMemoryContent(content: string): string | null {
  for (const char of INVISIBLE_CHARS) {
    if (content.includes(char)) {
      return `Blocked: content contains invisible unicode character U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")} (possible injection).`;
    }
  }

  for (const [re, pid] of MEMORY_THREAT_PATTERNS) {
    if (re.test(content)) {
      return `Blocked: content matches threat pattern '${pid}'. Memory entries are injected into the system prompt and must not contain injection or exfiltration payloads.`;
    }
  }

  return null;
}

function splitEntries(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }
  return raw
    .split(ENTRY_DELIMITER)
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Writes UTF-8 content atomically: temp file in the same directory, then rename.
 */
function writeFileSyncAtomic(path: string, content: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.mem_${randomBytes(8).toString("hex")}.tmp`);
  try {
    writeFileSync(tmp, content, "utf-8");
    renameSync(tmp, path);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw e;
  }
}

/**
 * Persists curated memory files under `workspaceRoot/memories/`.
 */
export class MemoryStore {
  memoryEntries: string[] = [];
  userEntries: string[] = [];
  private readonly memoryCharLimit = MEMORY_CHAR_LIMIT;
  private readonly userCharLimit = USER_CHAR_LIMIT;
  private readonly memoryPath: string;
  private readonly userPath: string;
  /** Frozen at {@link loadFromDisk} for system prompt injection. */
  private systemPromptSnapshot: { memory: string; user: string } = { memory: "", user: "" };
  private chain: Promise<void> = Promise.resolve();

  constructor(workspaceRoot: string) {
    const dir = join(workspaceRoot, "memories");
    this.memoryPath = join(dir, "MEMORY.md");
    this.userPath = join(dir, "USER.md");
  }

  /**
   * Serialize mutations so concurrent tool calls do not corrupt entries.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  /**
   * Loads entries from disk and captures the frozen system-prompt snapshot.
   */
  loadFromDisk(): void {
    mkdirSync(join(this.memoryPath, ".."), { recursive: true });

    this.memoryEntries = this.dedupe(this.readFileEntries(this.memoryPath));
    this.userEntries = this.dedupe(this.readFileEntries(this.userPath));

    this.systemPromptSnapshot = {
      memory: this.renderBlock("memory", this.memoryEntries),
      user: this.renderBlock("user", this.userEntries),
    };
  }

  /**
   * Returns the frozen snapshot for system prompt injection (not live mid-session edits).
   */
  formatForSystemPrompt(target: MemoryTarget): string | null {
    const block = target === "user" ? this.systemPromptSnapshot.user : this.systemPromptSnapshot.memory;
    return block || null;
  }

  /**
   * Appends a new entry after validation and capacity checks.
   */
  async add(target: MemoryTarget, content: string): Promise<MemoryMutationResult> {
    const trimmed = content.trim();
    if (!trimmed) {
      return { success: false, error: "Content cannot be empty." };
    }
    const scanError = scanMemoryContent(trimmed);
    if (scanError) {
      return { success: false, error: scanError };
    }

    return this.enqueue(async () => {
      await this.reloadTarget(target);
      const entries = this.entriesFor(target);
      const limit = this.limitFor(target);

      if (entries.includes(trimmed)) {
        return this.successResponse(target, "Entry already exists (no duplicate added).");
      }

      const next = [...entries, trimmed];
      if (this.joinedLength(next) > limit) {
        const current = this.charCount(target);
        return {
          success: false,
          error: `Memory at ${current.toLocaleString()}/${limit.toLocaleString()} chars. Adding this entry (${trimmed.length} chars) would exceed the limit. Replace or remove existing entries first.`,
          current_entries: entries,
          usage: `${current.toLocaleString()}/${limit.toLocaleString()}`,
        };
      }

      this.setEntries(target, next);
      this.saveToDisk(target);
      return this.successResponse(target, "Entry added.");
    });
  }

  /**
   * Replaces the first entry containing `oldText` with `newContent`.
   */
  async replace(target: MemoryTarget, oldText: string, newContent: string): Promise<MemoryMutationResult> {
    const ot = oldText.trim();
    const nc = newContent.trim();
    if (!ot) {
      return { success: false, error: "old_text cannot be empty." };
    }
    if (!nc) {
      return { success: false, error: "new_content cannot be empty. Use 'remove' to delete entries." };
    }
    const scanError = scanMemoryContent(nc);
    if (scanError) {
      return { success: false, error: scanError };
    }

    return this.enqueue(async () => {
      await this.reloadTarget(target);
      const entries = this.entriesFor(target);
      const matches = entries.map((e, i) => ({ i, e })).filter(({ e }) => e.includes(ot));

      if (matches.length === 0) {
        return { success: false, error: `No entry matched '${ot}'.` };
      }

      if (matches.length > 1) {
        const uniqueTexts = new Set(matches.map((m) => m.e));
        if (uniqueTexts.size > 1) {
          const previews = matches.map((m) =>
            m.e.length > 80 ? `${m.e.slice(0, 80)}...` : m.e,
          );
          return {
            success: false,
            error: `Multiple entries matched '${ot}'. Be more specific.`,
            matches: previews,
          };
        }
      }

      const idx = matches[0]!.i;
      const limit = this.limitFor(target);
      const test = [...entries];
      test[idx] = nc;

      if (this.joinedLength(test) > limit) {
        return {
          success: false,
          error: `Replacement would put memory at ${this.joinedLength(test).toLocaleString()}/${limit.toLocaleString()} chars. Shorten the new content or remove other entries first.`,
        };
      }

      entries[idx] = nc;
      this.setEntries(target, entries);
      this.saveToDisk(target);
      return this.successResponse(target, "Entry replaced.");
    });
  }

  /**
   * Removes the first entry containing `oldText`.
   */
  async remove(target: MemoryTarget, oldText: string): Promise<MemoryMutationResult> {
    const ot = oldText.trim();
    if (!ot) {
      return { success: false, error: "old_text cannot be empty." };
    }

    return this.enqueue(async () => {
      await this.reloadTarget(target);
      const entries = this.entriesFor(target);
      const matches = entries.map((e, i) => ({ i, e })).filter(({ e }) => e.includes(ot));

      if (matches.length === 0) {
        return { success: false, error: `No entry matched '${ot}'.` };
      }

      if (matches.length > 1) {
        const uniqueTexts = new Set(matches.map((m) => m.e));
        if (uniqueTexts.size > 1) {
          const previews = matches.map((m) =>
            m.e.length > 80 ? `${m.e.slice(0, 80)}...` : m.e,
          );
          return {
            success: false,
            error: `Multiple entries matched '${ot}'. Be more specific.`,
            matches: previews,
          };
        }
      }

      const idx = matches[0]!.i;
      entries.splice(idx, 1);
      this.setEntries(target, entries);
      this.saveToDisk(target);
      return this.successResponse(target, "Entry removed.");
    });
  }

  private dedupe(entries: string[]): string[] {
    return [...new Set(entries)];
  }

  private entriesFor(target: MemoryTarget): string[] {
    return target === "user" ? this.userEntries : this.memoryEntries;
  }

  private setEntries(target: MemoryTarget, entries: string[]): void {
    if (target === "user") {
      this.userEntries = entries;
    } else {
      this.memoryEntries = entries;
    }
  }

  private limitFor(target: MemoryTarget): number {
    return target === "user" ? this.userCharLimit : this.memoryCharLimit;
  }

  private charCount(target: MemoryTarget): number {
    const entries = this.entriesFor(target);
    if (entries.length === 0) {
      return 0;
    }
    return this.joinedLength(entries);
  }

  private joinedLength(entries: string[]): number {
    return entries.length === 0 ? 0 : entries.join(ENTRY_DELIMITER).length;
  }

  private async reloadTarget(target: MemoryTarget): Promise<void> {
    const path = target === "user" ? this.userPath : this.memoryPath;
    const fresh = this.dedupe(this.readFileEntries(path));
    this.setEntries(target, fresh);
  }

  private readFileEntries(path: string): string[] {
    if (!existsSync(path)) {
      return [];
    }
    try {
      const raw = readFileSync(path, "utf-8");
      return splitEntries(raw);
    } catch {
      return [];
    }
  }

  private saveToDisk(target: MemoryTarget): void {
    const path = target === "user" ? this.userPath : this.memoryPath;
    const entries = this.entriesFor(target);
    const content = entries.length === 0 ? "" : entries.join(ENTRY_DELIMITER);
    writeFileSyncAtomic(path, content);
  }

  private successResponse(target: MemoryTarget, message?: string): MemoryMutationResult {
    const entries = this.entriesFor(target);
    const current = this.charCount(target);
    const limit = this.limitFor(target);
    const pct = limit > 0 ? Math.floor((current / limit) * 100) : 0;
    const out: MemoryMutationResult = {
      success: true,
      target,
      entries,
      usage: `${pct}% — ${current.toLocaleString()}/${limit.toLocaleString()} chars`,
      entry_count: entries.length,
      ...(message ? { message } : {}),
    };
    return out;
  }

  private renderBlock(target: MemoryTarget, entries: string[]): string {
    if (entries.length === 0) {
      return "";
    }
    const limit = this.limitFor(target);
    const content = entries.join(ENTRY_DELIMITER);
    const current = content.length;
    const pct = limit > 0 ? Math.floor((current / limit) * 100) : 0;
    const header =
      target === "user"
        ? `USER PROFILE (who the user is) [${pct}% — ${current.toLocaleString()}/${limit.toLocaleString()} chars]`
        : `MEMORY (your personal notes) [${pct}% — ${current.toLocaleString()}/${limit.toLocaleString()} chars]`;
    const separator = "═".repeat(46);
    return `${separator}\n${header}\n${separator}\n${content}`;
  }
}
