import { describe, expect, test } from "bun:test";
import {
  firstCommandToken,
  formatAvailableOpenPawSlashCommandsForUser,
  restAfterCommand,
} from "../gateway/slash-command-tokens";

describe("slash command parsing", () => {
  test("extracts the first command token", () => {
    expect(firstCommandToken("/resume@openpawbot 2")).toBe("/resume");
  });

  test("extracts the rest of the command", () => {
    expect(restAfterCommand("/mode coding")).toBe("coding");
  });

  test("formats available commands", () => {
    expect(formatAvailableOpenPawSlashCommandsForUser()).toContain("/sandbox");
  });
});
