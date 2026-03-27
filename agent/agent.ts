import {
  createAgentUIStream,
  generateId,
  ToolLoopAgent,
  validateUIMessages,
} from "ai";
import type { OpenPawConfig } from "../config/types";
import { buildSystemPrompt } from "./prompt-builder";
import { createLanguageModel } from "./model";
import { loadSessionMessages, saveSessionMessages } from "./session-store";
import type { RunTurnParams } from "./types";
import { isSandboxRestricted, runWithTurnContext } from "./turn-context";
import { createBashTool } from "./tools/bash";
import { createFileEditorTool } from "./tools/file-editor";
import { createListDirTool } from "./tools/list-dir";

function createTools(workspacePath: string) {
  return {
    bash: createBashTool(workspacePath),
    file_editor: createFileEditorTool(workspacePath),
    list_dir: createListDirTool(workspacePath),
  };
}

export type OpenPawTools = ReturnType<typeof createTools>;

/**
 * Creates a {@link ToolLoopAgent} with workspace-scoped tools and a dynamic system prompt from markdown files.
 */
export function createOpenPawAgent(config: OpenPawConfig, workspacePath: string) {
  const tools = createTools(workspacePath);
  return new ToolLoopAgent({
    model: createLanguageModel(config),
    instructions:
      "You are OpenPaw, a capable assistant. Follow workspace instructions in the system prompt. Use the file_editor tool: view before str_replace; str_replace needs an exact single match for old_str; delete/delete_lines/undo_edit are available when needed.",
    tools,
    prepareCall: async (options) => {
      let instructions = await buildSystemPrompt(workspacePath, config.personality);
      if (!isSandboxRestricted()) {
        instructions +=
          "\n\n## Sandbox (this turn)\nFilesystem sandbox is OFF: file_editor and list_dir may use absolute paths or paths anywhere under the filesystem root; bash runs with cwd set to the user home directory, not the workspace root.";
      }
      return { ...options, instructions };
    },
  });
}

export type OpenPawAgent = ReturnType<typeof createOpenPawAgent>;

export type AgentRuntime = {
  config: OpenPawConfig;
  workspacePath: string;
  agent: OpenPawAgent;
  runTurn: (params: RunTurnParams) => Promise<{ text: string }>;
};

export function createAgentRuntime(
  config: OpenPawConfig,
  workspacePath: string,
): AgentRuntime {
  const agent = createOpenPawAgent(config, workspacePath);

  return {
    config,
    workspacePath,
    agent,
    runTurn: async (params) => runTurnWithAgent(agent, params),
  };
}

async function runTurnWithAgent(
  agent: OpenPawAgent,
  params: RunTurnParams,
): Promise<{ text: string }> {
  const {
    sessionId,
    userText,
    sandboxRestricted = true,
    onTextDelta,
    onReasoningDelta,
    onToolStatus,
  } = params;

  return runWithTurnContext({ sandboxRestricted }, async () => {
    const prior = await loadSessionMessages(sessionId, agent.tools);
    const userMessage = {
      id: generateId(),
      role: "user" as const,
      parts: [{ type: "text" as const, text: userText }],
    };
    const draft = [...prior, userMessage];

    const uiMessages = await validateUIMessages({
      messages: draft,
      tools: agent.tools as never,
    });

    let accumulated = "";
    const toolNameByCallId = new Map<string, string>();

    const stream = await createAgentUIStream({
      agent,
      uiMessages,
      onFinish: async ({ messages }) => {
        await saveSessionMessages(sessionId, messages);
      },
    });

    for await (const chunk of stream) {
      if (chunk.type === "text-delta" && "delta" in chunk) {
        const d = chunk.delta;
        accumulated += d;
        onTextDelta?.(d);
      } else if (chunk.type === "error") {
        const errLine = `Error: ${chunk.errorText}`;
        accumulated += errLine;
        onTextDelta?.(errLine);
      } else if (chunk.type === "reasoning-delta" && "delta" in chunk) {
        onReasoningDelta?.(chunk.delta);
      } else if (chunk.type === "tool-input-start") {
        toolNameByCallId.set(chunk.toolCallId, chunk.toolName);
      } else if (chunk.type === "tool-input-available") {
        toolNameByCallId.set(chunk.toolCallId, chunk.toolName);
        onToolStatus?.({
          type: "tool_input",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: chunk.input,
        });
      } else if (chunk.type === "tool-input-error") {
        toolNameByCallId.set(chunk.toolCallId, chunk.toolName);
        onToolStatus?.({
          type: "tool_error",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          errorText: chunk.errorText,
        });
      } else if (chunk.type === "tool-output-available") {
        const toolName = toolNameByCallId.get(chunk.toolCallId) ?? "tool";
        onToolStatus?.({
          type: "tool_output",
          toolCallId: chunk.toolCallId,
          toolName,
          output: chunk.output,
        });
      } else if (chunk.type === "tool-output-error") {
        const toolName = toolNameByCallId.get(chunk.toolCallId) ?? "tool";
        onToolStatus?.({
          type: "tool_error",
          toolCallId: chunk.toolCallId,
          toolName,
          errorText: chunk.errorText,
        });
      } else if (chunk.type === "tool-output-denied") {
        const toolName = toolNameByCallId.get(chunk.toolCallId) ?? "tool";
        onToolStatus?.({
          type: "tool_denied",
          toolCallId: chunk.toolCallId,
          toolName,
        });
      }
    }

    return { text: accumulated };
  });
}
