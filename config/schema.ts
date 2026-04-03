/**
 * Zod schemas and helpers for validating and serializing `config.yaml`.
 */
import { parse, stringify } from "yaml";
import { z } from "zod";
import { PERSONALITIES, type OpenPawConfig } from "./types";

/**
 * Shared zod schema for the persisted OpenPaw config file.
 */
export const openPawConfigSchema = z.object({
  provider: z.object({
    baseUrl: z.string().trim().url("provider.baseUrl must be a valid URL."),
    apiKey: z.string().trim().min(1, "provider.apiKey is required."),
    model: z.string().trim().min(1, "provider.model is required."),
  }),
  channels: z
    .object({
      telegram: z
        .object({
          botToken: z.string().trim().min(1, "channels.telegram.botToken cannot be empty."),
        })
        .optional(),
    })
    .optional(),
  personality: z.enum(PERSONALITIES),
  cron: z
    .object({
      enabled: z.boolean().optional(),
      tickSeconds: z.number().finite().positive().max(3600).optional(),
      maxConcurrentRuns: z.number().finite().int().min(1).max(32).optional(),
      maxRunLogLines: z.number().finite().int().min(100).max(100_000).optional(),
    })
    .optional(),
});

export type ConfigValidationResult =
  | { ok: true; config: OpenPawConfig }
  | { ok: false; message: string };

/**
 * Parses and validates raw YAML config content.
 */
export function parseConfigContent(content: string): ConfigValidationResult {
  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const result = openPawConfigSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  return { ok: true, config: result.data };
}

/**
 * Serializes a config object back to YAML.
 */
export function stringifyConfig(config: OpenPawConfig): string {
  return stringify(config, {
    defaultStringType: "QUOTE_DOUBLE",
    lineWidth: 0,
  });
}
