import { describe, expect, test } from "bun:test";
import { resolveScopePath } from "../agent/sandbox-paths";
import { buildToolExecutionPolicy } from "../agent/tool-policy";
import { runWithTurnContext } from "../agent/turn-context";

describe("sandbox paths", () => {
  test("rejects workspace traversal when restricted", () =>
    runWithTurnContext(
      {
        surface: "cli",
        safetyMode: "workspace_only",
        sessionMode: "general",
        toolPolicy: buildToolExecutionPolicy("workspace_only"),
      },
      async () => {
        expect(() => resolveScopePath("/tmp/workspace", [], "../etc/passwd")).toThrow();
      },
    ));

  test("allows absolute paths when full access is enabled", () =>
    runWithTurnContext(
      {
        surface: "cli",
        safetyMode: "full_access",
        sessionMode: "general",
        toolPolicy: buildToolExecutionPolicy("full_access"),
      },
      async () => {
        expect(resolveScopePath("/tmp/workspace", [], "/tmp/test")).toBe("/tmp/test");
      },
    ));
});
