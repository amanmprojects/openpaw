import type { UIMessage } from "ai";
import { loadSessionFile } from "../agent";
import { createGatewayContext } from "../gateway/bootstrap";

function renderMessageText(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === "text" && "text" in part) {
        return part.text;
      }
      return `[${part.type}]`;
    })
    .join("")
    .trim();
}

function renderMarkdownTranscript(sessionId: string, messages: UIMessage[]): string {
  const lines = [`# Session ${sessionId}`, ""];
  for (const message of messages) {
    lines.push(`## ${message.role}`);
    lines.push(renderMessageText(message) || "(empty)");
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Exports a session transcript to stdout as JSON or markdown.
 */
export async function handleSessionExport(
  sessionId: string,
  format: "json" | "markdown",
): Promise<void> {
  const ctx = await createGatewayContext();
  const session = await loadSessionFile(sessionId, ctx.runtime.agent.tools);
  if (!session) {
    throw new Error(`Session not found or invalid: ${sessionId}`);
  }

  if (format === "json") {
    console.log(JSON.stringify(session, null, 2));
    return;
  }

  console.log(renderMarkdownTranscript(sessionId, session.messages));
}
