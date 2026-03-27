/**
 * Centralizes OpenTUI renderer creation for OpenPaw and applies terminal-input
 * workarounds needed for Bun/OpenTUI in some integrated terminal environments.
 */
import {
  createCliRenderer,
  type CliRenderer,
  type CliRendererConfig,
} from "@opentui/core";
import { openSync } from "node:fs";
import { ReadStream } from "node:tty";

type PatchedReadStream = NodeJS.ReadStream & {
  __openpawPatchedRead?: boolean;
};

type OwnedReadStream = NodeJS.ReadStream & {
  destroy: () => void;
};

/**
 * Returns true when a stream read failed with the transient EPERM issue seen in
 * some Bun + integrated terminal combinations.
 */
function isOperationNotPermittedReadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "EPERM" &&
    typeof error.message === "string" &&
    error.message.includes("read")
  );
}

/**
 * Wraps `stdin.read()` so OpenTUI resume cycles do not crash or steal focus
 * when Bun surfaces a spurious EPERM from the terminal device.
 */
function patchReadOperation(stdin: NodeJS.ReadStream): void {
  const patchedStream = stdin as PatchedReadStream;
  if (patchedStream.__openpawPatchedRead) {
    return;
  }

  const originalRead = stdin.read.bind(stdin);
  stdin.read = ((size?: number) => {
    try {
      return originalRead(size);
    } catch (error) {
      if (isOperationNotPermittedReadError(error)) {
        return null;
      }
      throw error;
    }
  }) as typeof stdin.read;

  patchedStream.__openpawPatchedRead = true;
}

/**
 * Opens the controlling terminal directly so OpenTUI reads from the actual TTY
 * device instead of Bun's wrapped stdin object.
 */
function openControllingTerminalInput(): OwnedReadStream | null {
  try {
    const fd = openSync("/dev/tty", "r");
    return new ReadStream(fd) as OwnedReadStream;
  } catch {
    return null;
  }
}

/**
 * Creates a CLI renderer with input guards suited for interactive OpenPaw TUIs.
 */
export async function createSafeCliRenderer(
  config: CliRendererConfig = {},
): Promise<CliRenderer> {
  const ownedStdin = config.stdin ? null : openControllingTerminalInput();
  const stdin = config.stdin ?? ownedStdin ?? process.stdin;
  const stdout = config.stdout ?? process.stdout;

  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      "OpenPaw requires an interactive terminal. Run it directly in a terminal window without redirected input.",
    );
  }

  patchReadOperation(stdin);

  return createCliRenderer({
    ...config,
    stdin,
    stdout,
    useConsole: false,
    openConsoleOnError: false,
    onDestroy: () => {
      ownedStdin?.destroy();
      config.onDestroy?.();
    },
  });
}
