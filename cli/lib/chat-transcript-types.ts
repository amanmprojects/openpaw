/**
 * Shared row types for the terminal chat transcript (user lines, assistant segments, system).
 */

/** One contiguous block of assistant output: extended thinking, tools, or visible reply. */
export type AssistantSegment = { kind: "reasoning" | "text" | "tool"; text: string };

export type ChatLine =
  | { role: "user"; text: string }
  | { role: "assistant"; segments: AssistantSegment[] }
  | { role: "system"; text: string };
