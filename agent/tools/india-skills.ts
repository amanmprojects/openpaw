/**
 * India-first skill tools for OpenPaw.
 *
 * Includes:
 *  - `upi_parse`  — Parse forwarded UPI/payment SMS messages (PhonePe, GPay,
 *                   Paytm, BHIM) into structured expense records
 *  - `upi_summary` — Summarise parsed transactions by category / total
 *  - `academic_calendar` — Parse academic event strings and compute days
 *                          remaining (assignment deadlines, exams, practicals)
 *
 * These tools run entirely offline (regex + date arithmetic) — no API keys.
 */

import { tool } from "ai";
import { z } from "zod";

// ─── UPI message patterns ─────────────────────────────────────────────────────

type ParsedTransaction = {
  raw: string;
  amount: number;
  currency: string;
  direction: "debit" | "credit";
  merchant?: string;
  bank?: string;
  utr?: string;
  date?: string;
  app?: string;
};

const INR_AMOUNT_RE = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const UTR_RE = /(?:UPI\s*Ref\.?\s*(?:No\.?)?\s*|UTR[:\s]*)(\w{10,20})/i;
const MERCHANT_DEBITED_RE = /(?:paid\s+to|debited\s+to|sent\s+to|transferred\s+to)\s+([^.\n]{3,40})/i;
const MERCHANT_RECEIVED_RE = /(?:received\s+from|credited\s+by|from)\s+([^.\n]{3,40})/i;
const BANK_RE = /\b(HDFC|SBI|ICICI|Axis|Kotak|BOB|PNB|Canara|Union|Yes Bank|IndusInd)\b/i;
const APPS: [RegExp, string][] = [
  [/phonepe/i, "PhonePe"],
  [/gpay|google\s*pay/i, "GPay"],
  [/paytm/i, "Paytm"],
  [/bhim/i, "BHIM"],
  [/amazon\s*pay/i, "Amazon Pay"],
];

const DATE_RE = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i;

function parseUpiMessage(raw: string): ParsedTransaction | null {
  const text = raw.trim();
  const amountMatch = text.match(INR_AMOUNT_RE);
  if (!amountMatch) return null;

  const amount = parseFloat((amountMatch[1] ?? "0").replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  const isCredit =
    /credited|received|credit|added|refund/i.test(text) &&
    !/debited|sent|paid\s+to|deducted/i.test(text);
  const direction: "debit" | "credit" = isCredit ? "credit" : "debit";

  const merchantMatch = direction === "debit"
    ? text.match(MERCHANT_DEBITED_RE)
    : text.match(MERCHANT_RECEIVED_RE);
  const merchant = merchantMatch?.[1]?.trim().replace(/\s+/g, " ");

  const utrMatch = text.match(UTR_RE);
  const bankMatch = text.match(BANK_RE);
  const dateMatch = text.match(DATE_RE);

  let app: string | undefined;
  for (const [re, name] of APPS) {
    if (re.test(text)) { app = name; break; }
  }

  return {
    raw: text,
    amount,
    currency: "INR",
    direction,
    merchant: merchant || undefined,
    bank: bankMatch?.[1] || undefined,
    utr: utrMatch?.[1] || undefined,
    date: dateMatch?.[1] || undefined,
    app,
  };
}

// ─── Academic calendar ────────────────────────────────────────────────────────

type AcademicEvent = {
  label: string;
  date: string;
  daysRemaining: number;
  type: "exam" | "assignment" | "practical" | "other";
};

const EVENT_TYPES: [RegExp, AcademicEvent["type"]][] = [
  [/\bexam|test|sem(?:ester)?\s*exam|gate|cat\b/i, "exam"],
  [/\bassignment|homework|submission|submit\b/i, "assignment"],
  [/\bpractical|lab|viva\b/i, "practical"],
];

function classifyEvent(label: string): AcademicEvent["type"] {
  for (const [re, type] of EVENT_TYPES) {
    if (re.test(label)) return type;
  }
  return "other";
}

function parseDateString(raw: string): Date | null {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  // try DD/MM/YYYY
  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    const year = (yyyy?.length === 2) ? `20${yyyy}` : yyyy;
    return new Date(`${year}-${mm?.padStart(2, "0")}-${dd?.padStart(2, "0")}`);
  }
  return null;
}

function daysUntil(d: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

// ─── Tool factories ───────────────────────────────────────────────────────────

/**
 * Parses a forwarded UPI/payment SMS message into a structured record.
 */
export const upiParseTool = tool({
  description:
    "Parse a forwarded UPI or bank payment SMS/notification into a structured transaction record (amount, direction debit/credit, merchant, UTR, bank, app). Works with PhonePe, GPay, Paytm, BHIM, and most Indian bank SMS formats.",
  inputSchema: z.object({
    message: z.string().describe("The raw SMS or notification text from the payment app / bank"),
  }),
  execute: async ({ message }) => {
    const tx = parseUpiMessage(message);
    if (!tx) {
      return { ok: false as const, error: "Could not extract a UPI transaction from this text." };
    }
    return { ok: true as const, transaction: tx };
  },
});

/**
 * Summarises a list of raw UPI messages into totals and per-app breakdowns.
 */
export const upiSummaryTool = tool({
  description:
    "Parse and summarise multiple UPI/bank SMS messages. Returns total debits, total credits, per-app breakdown, and a list of parsed transactions. Useful for monthly expense summaries.",
  inputSchema: z.object({
    messages: z.array(z.string()).min(1).max(200).describe("Array of raw payment SMS/notification texts"),
  }),
  execute: async ({ messages }) => {
    const transactions: ParsedTransaction[] = [];
    let skipped = 0;

    for (const msg of messages) {
      const tx = parseUpiMessage(msg);
      if (tx) transactions.push(tx);
      else skipped++;
    }

    const totalDebits = transactions
      .filter((t) => t.direction === "debit")
      .reduce((s, t) => s + t.amount, 0);
    const totalCredits = transactions
      .filter((t) => t.direction === "credit")
      .reduce((s, t) => s + t.amount, 0);

    const byApp: Record<string, { debits: number; credits: number; count: number }> = {};
    for (const tx of transactions) {
      const key = tx.app ?? "Unknown";
      if (!byApp[key]) byApp[key] = { debits: 0, credits: 0, count: 0 };
      if (tx.direction === "debit") byApp[key].debits += tx.amount;
      else byApp[key].credits += tx.amount;
      byApp[key].count++;
    }

    return {
      ok: true as const,
      parsed: transactions.length,
      skipped,
      totalDebits: Math.round(totalDebits * 100) / 100,
      totalCredits: Math.round(totalCredits * 100) / 100,
      netFlow: Math.round((totalCredits - totalDebits) * 100) / 100,
      byApp,
      transactions,
    };
  },
});

/**
 * Computes days remaining for academic events (exams, assignments, practicals).
 * Returns a sorted list with urgency labels.
 */
export const academicCalendarTool = tool({
  description:
    "Calculate days remaining for academic events — exams, assignments, practicals, or any deadline. Provide a list of events with labels and dates. Returns sorted urgency list, perfect for the morning heartbeat briefing.",
  inputSchema: z.object({
    events: z.array(
      z.object({
        label: z.string().describe("Event name (e.g. 'DBMS Assignment', 'Mid-sem Exam', 'GATE 2025')"),
        date: z.string().describe("Date string (YYYY-MM-DD, DD/MM/YYYY, or natural like '15 Apr 2025')"),
      })
    ).min(1).max(50),
  }),
  execute: async ({ events }) => {
    const results: AcademicEvent[] = [];
    const errors: string[] = [];

    for (const ev of events) {
      const d = parseDateString(ev.date);
      if (!d) {
        errors.push(`Could not parse date for "${ev.label}": "${ev.date}"`);
        continue;
      }
      results.push({
        label: ev.label,
        date: d.toISOString().slice(0, 10),
        daysRemaining: daysUntil(d),
        type: classifyEvent(ev.label),
      });
    }

    results.sort((a, b) => a.daysRemaining - b.daysRemaining);

    const urgent = results.filter((e) => e.daysRemaining >= 0 && e.daysRemaining <= 3);
    const upcoming = results.filter((e) => e.daysRemaining > 3 && e.daysRemaining <= 14);
    const later = results.filter((e) => e.daysRemaining > 14);
    const past = results.filter((e) => e.daysRemaining < 0);

    return { ok: true as const, events: results, urgent, upcoming, later, past, errors };
  },
});
