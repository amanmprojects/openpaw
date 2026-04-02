/**
 * Agent runtime assembly and turn execution for OpenPaw.
 */
import {
  createAgentUIStream,
  generateId,
  ToolLoopAgent,
  validateUIMessages,
} from "ai";
import type { OpenPawConfig } from "../config/types";
import { logInfo } from "../lib/log";
import { buildSystemPrompt } from "./prompt-builder";
import { MemoryStore } from "./memory-store";
import { createLanguageModel } from "./model";
import { saveTurnRecord } from "./turn-record-store";
import { buildToolExecutionPolicy } from "./tool-policy";
import {
  refreshSkillCatalog,
  type OpenPawSkillCatalog,
} from "./skill-catalog";
import { loadSessionFile, saveSessionMessages } from "./session-store";
import { createBashTool } from "./tools/bash";
import { createFileEditorTool } from "./tools/file-editor";
import { createListDirTool } from "./tools/list-dir";
import { createLoadSkillTool } from "./tools/load-skill";
import { createMemoryTool } from "./tools/memory";
import type {
  OpenPawSurface,
  RunTurnParams,
  SessionMode,
  ToolSafetyMode,
} from "./types";
import {
  getTurnSessionMode,
  getTurnSurface,
  isSandboxRestricted,
  runWithTurnContext,
} from "./turn-context";

const STATIC_AGENT_INSTRUCTIONS = [
  "You are OpenPaw, a capable local assistant.",
  "Follow the system prompt: identity, voice with the user, workspace content, tools, and channel hints.",
  "Use tools faithfully: file_editor (view before str_replace; exact single match for old_str), bash, list_dir, load_skill, memory.",
  "Memory tool: add uses content only; replace needs old_text + content; remove needs old_text only.",
  "load_skill: use when a listed skill fits the task; follow loaded instructions and use skillDirectory for bundled file paths.",
  "To the user: sound human; recall context naturally. Do not mention workspace filenames, profile files, or tool names unless they are developers debugging.",
].join(" ");

/** Instantiates all tools, including `load_skill` and filesystem tools that rescan {@link OpenPawSkillCatalog}. */
function createTools(workspacePath: string, memoryStore: MemoryStore, skillCatalog: OpenPawSkillCatalog) {
  return {
    bash: createBashTool(workspacePath),
    file_editor: createFileEditorTool(workspacePath, skillCatalog),
    list_dir: createListDirTool(workspacePath, skillCatalog),
    load_skill: createLoadSkillTool(skillCatalog),
    memory: createMemoryTool(memoryStore),
  };
}

export type OpenPawTools = ReturnType<typeof createTools>;

/**
 * Derives chat surface from session id when callers do not pass `surface` explicitly.
 */
export function surfaceFromSessionId(sessionId: string): OpenPawSurface {
  return sessionId.startsWith("telegram:") ? "telegram" : "cli";
}

/**
 * Creates a {@link ToolLoopAgent} with workspace-scoped tools, curated memory, and a dynamic system prompt.
 *
 * @param skillCatalog Mutable skill list for this process; rescanned from disk before each model call and in `load_skill`.
 */
export function createOpenPawAgent(
  config: OpenPawConfig,
  workspacePath: string,
  memoryStore: MemoryStore,
  skillCatalog: OpenPawSkillCatalog,
) {
  const tools = createTools(workspacePath, memoryStore, skillCatalog);
  return new ToolLoopAgent({
    model: createLanguageModel(config),
    instructions: STATIC_AGENT_INSTRUCTIONS,
    tools,
    prepareCall: async (options) => {
      await refreshSkillCatalog(skillCatalog);
      let instructions = await buildSystemPrompt({
        workspacePath,
        personality: config.personality,
        surface: getTurnSurface(),
        sessionMode: getTurnSessionMode(),
        memoryUserBlock: memoryStore.formatForSystemPrompt("user"),
        memoryAgentBlock: memoryStore.formatForSystemPrompt("memory"),
        skills: skillCatalog.skills,
      });
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
  /** Curated memory store (frozen snapshot + tool mutations). */
  memoryStore: MemoryStore;
  agent: OpenPawAgent;
  runTurn: (params: RunTurnParams) => Promise<{ text: string }>;
};

/**
 * Loads memory, discovers skills under the workspace and user config dirs, and builds the shared runtime.
 */
export async function createAgentRuntime(
  config: OpenPawConfig,
  workspacePath: string,
): Promise<AgentRuntime> {
  const memoryStore = new MemoryStore(workspacePath);
  memoryStore.loadFromDisk();
  const skillCatalog: OpenPawSkillCatalog = { workspacePath, skills: [] };
  await refreshSkillCatalog(skillCatalog);
  const agent = createOpenPawAgent(config, workspacePath, memoryStore, skillCatalog);

  return {
    config,
    workspacePath,
    memoryStore,
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
    surface = surfaceFromSessionId(sessionId),
    sandboxRestricted = true,
    safetyMode = sandboxRestricted ? "workspace_only" : "full_access",
    sessionMode,
    onTextDelta,
    onReasoningDelta,
    onToolStatus,
  } = params;

  const requestedSafetyMode: ToolSafetyMode = safetyMode;
  const startedAt = new Date().toISOString();
  const existing = await loadSessionFile(sessionId, agent.tools);
  const effectiveSessionMode: SessionMode =
    sessionMode ?? existing?.metadata.mode ?? "general";

  return runWithTurnContext({
    surface,
    safetyMode: requestedSafetyMode,
    sessionMode: effectiveSessionMode,
    toolPolicy: buildToolExecutionPolicy(requestedSafetyMode),
  }, async () => {
    const prior = existing?.messages ?? [];
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
    const toolStatuses = new Map<string, { toolName: string; status: "pending" | "ok" | "error" | "denied" }>();
    const partialInputByCallId = new Map<string, string>();

    const stream = await createAgentUIStream({
      agent,
      uiMessages,
      onFinish: async ({ messages }) => {
        await saveSessionMessages(sessionId, messages, {
          surface,
          metadataPatch: { mode: effectiveSessionMode },
        });
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
        toolStatuses.set(chunk.toolCallId, {
          toolName: chunk.toolName,
          status: "pending",
        });
        partialInputByCallId.set(chunk.toolCallId, "");
        onToolStatus?.({
          type: "tool_starting",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
        });
      } else if (chunk.type === "tool-input-delta") {
        const toolName = toolNameByCallId.get(chunk.toolCallId) ?? "tool";
        const prev = partialInputByCallId.get(chunk.toolCallId) ?? "";
        partialInputByCallId.set(chunk.toolCallId, prev + chunk.inputTextDelta);
        onToolStatus?.({
          type: "tool_input_delta",
          toolCallId: chunk.toolCallId,
          toolName,
          delta: chunk.inputTextDelta,
        });
      } else if (chunk.type === "tool-input-available") {
        toolNameByCallId.set(chunk.toolCallId, chunk.toolName);
        toolStatuses.set(chunk.toolCallId, {
          toolName: chunk.toolName,
          status: "pending",
        });
        onToolStatus?.({
          type: "tool_input",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: chunk.input,
        });
      } else if (chunk.type === "tool-input-error") {
        toolNameByCallId.set(chunk.toolCallId, chunk.toolName);
        toolStatuses.set(chunk.toolCallId, {
          toolName: chunk.toolName,
          status: "error",
        });
        onToolStatus?.({
          type: "tool_error",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          errorText: chunk.errorText,
        });
      } else if (chunk.type === "tool-output-available") {
        const toolName = toolNameByCallId.get(chunk.toolCallId) ?? "tool";
        toolStatuses.set(chunk.toolCallId, { toolName, status: "ok" });
        onToolStatus?.({
          type: "tool_output",
          toolCallId: chunk.toolCallId,
          toolName,
          output: chunk.output,
        });
      } else if (chunk.type === "tool-output-error") {
        const toolName = toolNameByCallId.get(chunk.toolCallId) ?? "tool";
        toolStatuses.set(chunk.toolCallId, { toolName, status: "error" });
        onToolStatus?.({
          type: "tool_error",
          toolCallId: chunk.toolCallId,
          toolName,
          errorText: chunk.errorText,
        });
      } else if (chunk.type === "tool-output-denied") {
        const toolName = toolNameByCallId.get(chunk.toolCallId) ?? "tool";
        toolStatuses.set(chunk.toolCallId, { toolName, status: "denied" });
        onToolStatus?.({
          type: "tool_denied",
          toolCallId: chunk.toolCallId,
          toolName,
        });
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs =
      new Date(completedAt).getTime() - new Date(startedAt).getTime();
    const recordPath = await saveTurnRecord({
      sessionId,
      startedAt,
      completedAt,
      durationMs,
      surface,
      toolCalls: [...toolStatuses.values()]
        .filter((entry) => entry.status !== "pending")
        .map((entry) => ({
          toolName: entry.toolName,
          status: entry.status as "ok" | "error" | "denied",
        })),
    });
    logInfo("agent.turn.completed", {
      sessionId,
      surface,
      safetyMode: requestedSafetyMode,
      sessionMode: effectiveSessionMode,
      durationMs,
      turnRecordPath: recordPath,
    });

    return { text: accumulated };
  });
}
