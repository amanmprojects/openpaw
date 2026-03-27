/**
 * Lightweight scanning and truncation for text injected into the system prompt (Hermes-style).
 */

/** Regex patterns with stable ids for logging / blocked messages. */
const CONTEXT_THREAT_PATTERNS: [RegExp, string][] = [
  [/ignore\s+(previous|all|above|prior)\s+instructions/i, "prompt_injection"],
  [/do\s+not\s+tell\s+the\s+user/i, "deception_hide"],
  [/system\s+prompt\s+override/i, "sys_prompt_override"],
  [/disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i, "disregard_rules"],
  [
    /act\s+as\s+(if|though)\s+you\s+(have\s+no|don't\s+have)\s+(restrictions|limits|rules)/i,
    "bypass_restrictions",
  ],
  [/<!--[^>]*(?:ignore|override|system|secret|hidden)[^>]*-->/i, "html_comment_injection"],
  [/<\s*div\s+style\s*=\s*["'].*display\s*:\s*none/i, "hidden_div"],
  [/translate\s+.*\s+into\s+.*\s+and\s+(execute|run|eval)/i, "translate_execute"],
  [/curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, "exfil_curl"],
  [/cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass)/i, "read_secrets"],
];

const CONTEXT_INVISIBLE_CHARS = new Set([
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

export const CONTEXT_FILE_MAX_CHARS = 20_000;
const CONTEXT_TRUNCATE_HEAD_RATIO = 0.7;
const CONTEXT_TRUNCATE_TAIL_RATIO = 0.2;

/**
 * Scans context file content for suspicious patterns. Returns sanitized replacement if blocked.
 */
export function scanContextContent(content: string, filename: string): string {
  const findings: string[] = [];

  for (const char of CONTEXT_INVISIBLE_CHARS) {
    if (content.includes(char)) {
      findings.push(`invisible unicode U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);
    }
  }

  for (const [re, pid] of CONTEXT_THREAT_PATTERNS) {
    if (re.test(content)) {
      findings.push(pid);
    }
  }

  if (findings.length > 0) {
    return `[BLOCKED: ${filename} contained potential prompt injection (${findings.join(", ")}). Content not loaded.]`;
  }

  return content;
}

/**
 * Head/tail truncation with a middle marker when content exceeds maxChars.
 */
export function truncateContextContent(
  content: string,
  filename: string,
  maxChars: number = CONTEXT_FILE_MAX_CHARS,
): string {
  if (content.length <= maxChars) {
    return content;
  }
  const headChars = Math.floor(maxChars * CONTEXT_TRUNCATE_HEAD_RATIO);
  const tailChars = Math.floor(maxChars * CONTEXT_TRUNCATE_TAIL_RATIO);
  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);
  const marker = `\n\n[...truncated ${filename}: kept ${headChars}+${tailChars} of ${content.length} chars. Use file tools to read the full file.]\n\n`;
  return head + marker + tail;
}
