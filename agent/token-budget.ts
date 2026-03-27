/**
 * Token budget manager — tracks daily API token usage, enforces a configurable
 * cap, and signals when the agent should switch to a local Ollama fallback.
 *
 * Usage:
 *   const budget = createTokenBudget({ dailyLimitTokens: 100_000 });
 *   budget.record(promptTokens, completionTokens);
 *   if (budget.isExhausted()) { useOllama(); }
 *   const report = budget.report();    // for /budget command
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../config/paths";

const BUDGET_FILENAME = "token-budget.json";
const TOKENS_PER_DOLLAR_APPROX = 50_000; // rough estimate for alert messages

// ─── Types ────────────────────────────────────────────────────────────────────

export type BudgetOptions = {
  /** Maximum tokens allowed per calendar day (UTC). 0 = unlimited. */
  dailyLimitTokens: number;
  /** If set, use this model ID as the fallback when budget is exhausted. */
  fallbackModel?: string;
};

export type BudgetState = {
  /** ISO date string (YYYY-MM-DD UTC) for the current bucket. */
  date: string;
  usedPromptTokens: number;
  usedCompletionTokens: number;
};

export type BudgetReport = {
  date: string;
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  exhausted: boolean;
  fallbackModel: string | undefined;
};

// ─── Storage ──────────────────────────────────────────────────────────────────

function budgetPath(): string {
  return join(getSessionsDir(), BUDGET_FILENAME);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadState(): BudgetState {
  const path = budgetPath();
  if (!existsSync(path)) {
    return { date: todayUtc(), usedPromptTokens: 0, usedCompletionTokens: 0 };
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "date" in parsed &&
      typeof (parsed as BudgetState).date === "string"
    ) {
      const state = parsed as BudgetState;
      // Roll over at midnight UTC.
      if (state.date !== todayUtc()) {
        return { date: todayUtc(), usedPromptTokens: 0, usedCompletionTokens: 0 };
      }
      return state;
    }
  } catch {
    // Corrupted file — start fresh.
  }
  return { date: todayUtc(), usedPromptTokens: 0, usedCompletionTokens: 0 };
}

function saveState(state: BudgetState): void {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(budgetPath(), JSON.stringify(state, null, 2), "utf8");
}

// ─── Budget instance ──────────────────────────────────────────────────────────

export type TokenBudget = {
  /** Record token usage after a completed turn. */
  record: (promptTokens: number, completionTokens: number) => void;
  /** Returns true when the daily limit is reached (or nearly reached). */
  isExhausted: () => boolean;
  /** Returns the model to use for the next turn. */
  activeModel: (primaryModel: string) => string;
  /** Returns a human-readable report (for /budget command). */
  report: () => BudgetReport;
};

/**
 * Creates a token budget instance backed by a JSON file in the sessions directory.
 * State is loaded lazily and persisted after every `record()` call.
 */
export function createTokenBudget(options: BudgetOptions): TokenBudget {
  let state = loadState();

  const reload = () => {
    state = loadState();
  };

  const totalUsed = () => state.usedPromptTokens + state.usedCompletionTokens;

  return {
    record(promptTokens: number, completionTokens: number): void {
      reload();
      state.usedPromptTokens += promptTokens;
      state.usedCompletionTokens += completionTokens;
      saveState(state);
    },

    isExhausted(): boolean {
      if (options.dailyLimitTokens <= 0) return false;
      reload();
      return totalUsed() >= options.dailyLimitTokens;
    },

    activeModel(primaryModel: string): string {
      if (this.isExhausted() && options.fallbackModel) {
        return options.fallbackModel;
      }
      return primaryModel;
    },

    report(): BudgetReport {
      reload();
      const used = totalUsed();
      const limit = options.dailyLimitTokens;
      const remaining = limit > 0 ? Math.max(0, limit - used) : Infinity;
      const percentUsed = limit > 0 ? Math.round((used / limit) * 100) : 0;
      return {
        date: state.date,
        used,
        limit,
        remaining,
        percentUsed,
        exhausted: limit > 0 && used >= limit,
        fallbackModel: options.fallbackModel,
      };
    },
  };
}

/**
 * Formats a budget report as a human-readable string for sending to the user.
 */
export function formatBudgetReport(report: BudgetReport): string {
  const approxCost = (report.used / TOKENS_PER_DOLLAR_APPROX).toFixed(4);
  const bar = buildBar(report.percentUsed);
  const lines = [
    `📊 <b>Token Budget — ${report.date}</b>`,
    ``,
    `${bar} ${report.percentUsed}%`,
    `Used: <code>${report.used.toLocaleString()}</code> tokens (~$${approxCost})`,
  ];
  if (report.limit > 0) {
    lines.push(`Limit: <code>${report.limit.toLocaleString()}</code> tokens/day`);
    lines.push(
      report.exhausted
        ? `⚠️ Budget exhausted${report.fallbackModel ? ` — using fallback: <code>${report.fallbackModel}</code>` : ""}`
        : `Remaining: <code>${report.remaining.toLocaleString()}</code>`,
    );
  } else {
    lines.push("Limit: unlimited");
  }
  return lines.join("\n");
}

function buildBar(percent: number): string {
  const filled = Math.round(percent / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}
