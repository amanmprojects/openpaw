/**
 * Slash command parsing and completion for the terminal chat UI.
 */
import type { SessionMode } from "../../../agent";

export const TUI_SLASH_SUGGESTIONS: { command: string; description: string }[] = [
  { command: "/new", description: "Start a new conversation thread" },
  { command: "/sessions", description: "List saved sessions" },
  { command: "/resume", description: "Resume session by number (see /sessions)" },
  { command: "/sandbox", description: "on or off — workspace filesystem & shell scope" },
  { command: "/pin", description: "Pin the current session" },
  { command: "/unpin", description: "Unpin the current session" },
  { command: "/title", description: "Rename the current session" },
  { command: "/mode", description: "general, coding, or research" },
];

export const LOCAL_TUI_COMMANDS = new Set(["/pin", "/unpin", "/title", "/mode"]);

/**
 * True when the message is a slash command at the start (leading spaces allowed).
 */
export function isSlashCommandLine(draft: string): boolean {
  return draft.trimStart().startsWith("/");
}

/**
 * Returns slash commands whose name prefix matches the first segment after `/`.
 */
export function matchingSlashSuggestions(
  draft: string,
): { command: string; description: string }[] {
  if (!isSlashCommandLine(draft)) {
    return [];
  }
  const lead = draft.trimStart();
  const firstSeg = lead.split(/\s+/)[0] ?? "";
  const namePrefix = firstSeg.slice(1).toLowerCase();
  return TUI_SLASH_SUGGESTIONS.filter((s) => {
    const name = s.command.slice(1).toLowerCase();
    return namePrefix === "" || name.startsWith(namePrefix);
  });
}

/**
 * Builds the text to send to handlers from draft + chosen command (keeps args after first token).
 */
export function applyChosenSlashCommand(
  draft: string,
  chosen: { command: string },
): string {
  const lead = draft.trimStart();
  const parts = lead.split(/\s+/).filter(Boolean);
  const tail = parts.slice(1).join(" ").trim();
  return tail.length > 0 ? `${chosen.command} ${tail}` : chosen.command;
}

/**
 * Parses `/mode` arguments into a supported session mode.
 */
export function parseSessionMode(value: string): SessionMode | null {
  if (value === "general" || value === "coding" || value === "research") {
    return value;
  }
  return null;
}
