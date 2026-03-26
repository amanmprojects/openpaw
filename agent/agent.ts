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
import { createBashTool } from "./tools/bash";
import { createFileEditorTool } from "./tools/file-editor";

function createTools(workspacePath: string) {
  return {
    bash: createBashTool(workspacePath),
    file_editor: createFileEditorTool(workspacePath),
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
      "You are OpenPaw, a capable assistant. Follow workspace instructions in the system prompt.",
    tools,
    prepareCall: async (options) => ({
      ...options,
      instructions: await buildSystemPrompt(workspacePath, config.personality),
    }),
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
  { sessionId, userText, onTextDelta, onReasoningDelta }: RunTurnParams,
): Promise<{ text: string }> {
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
    } else if (chunk.type === "reasoning-delta" && "delta" in chunk) {
      onReasoningDelta?.(chunk.delta);
    }
  }

  return { text: accumulated };
}
