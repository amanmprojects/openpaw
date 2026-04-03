/**
 * Tests for config schema parsing, validation, and storage.
 */
import { describe, expect, test } from "bun:test";
import { configExists, getConfigPath, loadConfigResult, parseConfigContent, saveConfig } from "../config";
import { openPawConfigSchema } from "../config/schema";
import { withTempOpenPawHome } from "./helpers";

describe("config schema and storage", () => {
  test("parses a valid config with telegram", () => {
    const result = parseConfigContent(`
provider:
  baseUrl: "https://openai-litellm.duckdns.org/v1"
  apiKey: "sk-test"
  model: "gpt-4o"
channels:
  telegram:
    botToken: "123:abc"
personality: "Assistant"
`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.channels?.telegram?.botToken).toBe("123:abc");
    }
  });

  test("rejects invalid yaml", () => {
    const result = parseConfigContent("provider: [");
    expect(result.ok).toBe(false);
  });

  test("save then load preserves config", async () => {
    const temp = withTempOpenPawHome();
    try {
      await saveConfig({
        provider: {
          baseUrl: "https://openai-litellm.duckdns.org/v1",
          apiKey: "sk-test",
          model: "gpt-4o-mini",
        },
        personality: "Coder",
      });
      expect(configExists()).toBe(true);
      expect(getConfigPath().startsWith(temp.home)).toBe(true);
      const loaded = await loadConfigResult();
      expect(loaded.ok).toBe(true);
      if (loaded.ok) {
        expect(loaded.config.personality).toBe("Coder");
        expect(loaded.config.provider.model).toBe("gpt-4o-mini");
      }
    } finally {
      temp.dispose();
    }
  });
});

describe("cron config schema validation", () => {
  const baseConfig = {
    provider: {
      baseUrl: "https://openai-litellm.duckdns.org/v1",
      apiKey: "sk-test",
      model: "gpt-4o",
    },
    personality: "Assistant" as const,
  };

  test("accepts config without cron field", () => {
    const result = openPawConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  test("accepts valid cron config with all fields", () => {
    const result = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: {
        enabled: true,
        tickSeconds: 30,
        maxConcurrentRuns: 4,
        maxRunLogLines: 1000,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cron?.tickSeconds).toBe(30);
      expect(result.data.cron?.maxConcurrentRuns).toBe(4);
    }
  });

  test("accepts cron config with only enabled field", () => {
    const result = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { enabled: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cron?.enabled).toBe(false);
    }
  });

  test("rejects tickSeconds above 3600", () => {
    const result = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { tickSeconds: 3601 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects tickSeconds of zero", () => {
    const result = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { tickSeconds: 0 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative tickSeconds", () => {
    const result = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { tickSeconds: -10 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects maxConcurrentRuns below 1", () => {
    const result = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { maxConcurrentRuns: 0 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects maxConcurrentRuns above 32", () => {
    const result = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { maxConcurrentRuns: 33 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects maxRunLogLines below 100", () => {
    const result = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { maxRunLogLines: 99 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects maxRunLogLines above 100000", () => {
    const result = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { maxRunLogLines: 100_001 },
    });
    expect(result.success).toBe(false);
  });

  test("accepts boundary values for tickSeconds", () => {
    // max boundary
    const maxResult = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { tickSeconds: 3600 },
    });
    expect(maxResult.success).toBe(true);
    // small positive value
    const minResult = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { tickSeconds: 0.1 },
    });
    expect(minResult.success).toBe(true);
  });

  test("accepts boundary values for maxConcurrentRuns", () => {
    const minResult = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { maxConcurrentRuns: 1 },
    });
    expect(minResult.success).toBe(true);
    const maxResult = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { maxConcurrentRuns: 32 },
    });
    expect(maxResult.success).toBe(true);
  });

  test("accepts boundary values for maxRunLogLines", () => {
    const minResult = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { maxRunLogLines: 100 },
    });
    expect(minResult.success).toBe(true);
    const maxResult = openPawConfigSchema.safeParse({
      ...baseConfig,
      cron: { maxRunLogLines: 100_000 },
    });
    expect(maxResult.success).toBe(true);
  });

  test("parseConfigContent accepts cron block in YAML", () => {
    const result = parseConfigContent(`
provider:
  baseUrl: "https://openai-litellm.duckdns.org/v1"
  apiKey: "sk-test"
  model: "gpt-4o"
personality: "Assistant"
cron:
  enabled: true
  tickSeconds: 120
  maxConcurrentRuns: 2
  maxRunLogLines: 5000
`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.cron?.enabled).toBe(true);
      expect(result.config.cron?.tickSeconds).toBe(120);
    }
  });
});