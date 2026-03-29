import { describe, expect, test } from "bun:test";
import {
  getTelegramChatPreferences,
  setTelegramChatPreferences,
} from "../gateway/telegram/chat-preferences";
import { withTempOpenPawHome } from "./helpers";

describe("telegram chat preferences", () => {
  test("persists safety mode alongside sandbox compatibility", async () => {
    const temp = withTempOpenPawHome();
    try {
      await setTelegramChatPreferences(1, { safetyMode: "full_access" });
      const prefs = await getTelegramChatPreferences(1);
      expect(prefs.safetyMode).toBe("full_access");
      expect(prefs.sandboxRestricted).toBe(false);
    } finally {
      temp.dispose();
    }
  });
});
