/**
 * Tests for session persistence, metadata, and legacy compatibility.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { getSessionsDir } from "../config";
import {
  deriveSessionTitle,
  getLegacySessionFilePath,
  getSessionFilePath,
  getSessionTurnsDir,
  loadSessionFile,
  loadSessionMessages,
  saveSessionMessages,
  sessionIdToDirname,
} from "../agent";
import { withTempOpenPawHome } from "./helpers";

const TOOLS = {} as never;

describe("session store", () => {
  test("session directory names are filesystem-safe", () => {
    expect(sessionIdToDirname("telegram:123/../../bad")).toBe("telegram_123_.._.._bad");
  });

  test("save and load session metadata", async () => {
    const temp = withTempOpenPawHome();
    try {
      await saveSessionMessages(
        "tui:main",
        [
          {
            id: "1",
            role: "user",
            parts: [{ type: "text", text: "Build a release checklist" }],
          },
        ],
        {
          surface: "cli",
          metadataPatch: { mode: "coding", pinned: true },
        },
      );
      const loaded = await loadSessionFile("tui:main", TOOLS);
      expect(loaded?.metadata.mode).toBe("coding");
      expect(loaded?.metadata.pinned).toBe(true);
      expect(loaded?.metadata.title).toBe("Build a release checklist");
      expect(getSessionFilePath("tui:main")).toContain("/sessions/tui_main/session.json");
      expect(getSessionTurnsDir("tui:main")).toContain("/sessions/tui_main/turns");
    } finally {
      temp.dispose();
    }
  });

  test("loads legacy v1 session files", async () => {
    const temp = withTempOpenPawHome();
    try {
      mkdirSync(getSessionsDir(), { recursive: true });
      await Bun.write(
        getLegacySessionFilePath("tui:main"),
        JSON.stringify({
          version: 1,
          messages: [
            {
              id: "1",
              role: "user",
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        }),
      );
      const loaded = await loadSessionMessages("tui:main", TOOLS);
      expect(loaded).toHaveLength(1);
    } finally {
      temp.dispose();
    }
  });

  test("derives a short title from the first user message", () => {
    const title = deriveSessionTitle([
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "Investigate telegram delivery latency spikes" }],
      },
    ] as never);
    expect(title).toBe("Investigate telegram delivery latency spikes");
  });
});
