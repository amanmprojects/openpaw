import { describe, expect, test } from "bun:test";
import { configExists, getConfigPath, loadConfigResult, parseConfigContent, saveConfig } from "../config";
import { withTempOpenPawHome } from "./helpers";

describe("config schema and storage", () => {
  test("parses a valid config with telegram", () => {
    const result = parseConfigContent(`
provider:
  baseUrl: "https://api.openai.com/v1"
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
          baseUrl: "https://api.openai.com/v1",
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
