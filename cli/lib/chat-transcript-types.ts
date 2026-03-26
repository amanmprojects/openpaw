/**
 * Shared row types for the terminal chat transcript (user lines, assistant segments, system).
 */

/** One contiguous block of assistant output: extended thinking vs visible reply (and tool lines). */
export type AssistantSegment = { kind: "reasoning" | "text"; text: string };

export type ChatLine =
  | { role: "user"; text: string }
  | { role: "assistant"; segments: AssistantSegment[] }
  | { role: "system"; text: string };
