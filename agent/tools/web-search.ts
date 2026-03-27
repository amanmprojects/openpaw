/**
 * Web search tool for OpenPaw.
 *
 * Uses the DuckDuckGo Instant Answer API (no API key required) for quick
 * factual lookups, and falls back to scraping DuckDuckGo HTML search results
 * for broader queries when the instant answer is empty.
 *
 * For richer results, users can set the BRAVE_SEARCH_API_KEY environment
 * variable to use the Brave Search API instead.
 */

import { tool } from "ai";
import { z } from "zod";

const DDG_INSTANT_API = "https://api.duckduckgo.com/";
const BRAVE_SEARCH_API = "https://api.search.brave.com/res/v1/web/search";
const USER_AGENT = "OpenPaw/1.0 (personal AI agent; contact via GitHub)";
const DEFAULT_TIMEOUT_MS = 10_000;

// ─── DuckDuckGo ──────────────────────────────────────────────────────────────

type DdgResult = {
  AbstractText: string;
  AbstractURL: string;
  RelatedTopics: { Text?: string; FirstURL?: string; Topics?: unknown[] }[];
  Answer: string;
  AnswerType: string;
};

async function fetchDdgInstant(query: string): Promise<SearchResult[]> {
  const url = new URL(DDG_INSTANT_API);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as DdgResult;
  const results: SearchResult[] = [];

  if (data.Answer) {
    results.push({
      title: "Instant answer",
      snippet: data.Answer,
      url: "",
    });
  }
  if (data.AbstractText) {
    results.push({
      title: "Summary",
      snippet: data.AbstractText,
      url: data.AbstractURL,
    });
  }
  for (const topic of data.RelatedTopics.slice(0, 5)) {
    if (topic.Text && topic.FirstURL) {
      results.push({ title: "", snippet: topic.Text, url: topic.FirstURL });
    }
  }
  return results;
}

// ─── Brave Search ─────────────────────────────────────────────────────────────

type BraveWebResult = {
  title: string;
  description: string;
  url: string;
};

async function fetchBraveSearch(
  query: string,
  apiKey: string,
  count: number,
): Promise<SearchResult[]> {
  const url = new URL(BRAVE_SEARCH_API);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const res = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { web?: { results?: BraveWebResult[] } };
  return (data.web?.results ?? []).map((r) => ({
    title: r.title,
    snippet: r.description,
    url: r.url,
  }));
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export type SearchResult = {
  title: string;
  snippet: string;
  url: string;
};

// ─── Tool factory ─────────────────────────────────────────────────────────────

/**
 * Creates a `web_search` tool.
 * Uses Brave Search when BRAVE_SEARCH_API_KEY is set, DuckDuckGo otherwise.
 */
export function createWebSearchTool() {
  return tool({
    description:
      "Search the web for real-time information. Use for current events, factual lookups, prices, weather, news, or anything that may have changed since the model's training cutoff. Returns titles, snippets, and source URLs.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
      count: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Number of results to return (default 5)"),
    }),
    execute: async ({ query, count = 5 }) => {
      try {
        const braveKey = process.env.BRAVE_SEARCH_API_KEY;
        const results: SearchResult[] = braveKey
          ? await fetchBraveSearch(query, braveKey, count)
          : await fetchDdgInstant(query);

        const trimmed = results.slice(0, count);

        if (trimmed.length === 0) {
          return {
            ok: false as const,
            results: [],
            message: "No results found. Try rephrasing the query.",
          };
        }

        return { ok: true as const, results: trimmed, query };
      } catch (e) {
        return {
          ok: false as const,
          results: [],
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  });
}
