import type {
  AgentEndEvent,
  AgentToolResult,
  ContextEvent,
  ExtensionFactory,
} from "@mariozechner/pi-coding-agent";

import { registerDesktopTool } from "../../desktopToolRegistration";
import type { DesktopToolDescriptor } from "../../desktopToolRegistry";
import type { ChatMessage } from "../../../shared/types";
import { buildAmbientTencentMemoryOffloadContext } from "./offload";
import type { AmbientTencentDbMemoryRuntime } from "./runtime";
import {
  TENCENT_CONVERSATION_SEARCH_TOOL_NAME,
  TENCENT_MEMORY_DELETE_TOOL_NAME,
  TENCENT_MEMORY_INSPECT_TOOL_NAME,
  TENCENT_MEMORY_SEARCH_TOOL_NAME,
  TENCENT_MEMORY_UPDATE_TOOL_NAME,
} from "./runtime";

type AgentMessage = ContextEvent["messages"][number];
type UserAgentMessage = Extract<AgentMessage, { role: "user" }>;
type AssistantAgentMessage = Extract<AgentMessage, { role: "assistant" }>;

export interface TencentMemoryExtensionOptions {
  runtime: AmbientTencentDbMemoryRuntime;
  now?: () => number;
  shortTermOffload?: TencentMemoryShortTermOffloadOptions;
}

export interface TencentMemoryShortTermOffloadOptions {
  enabled: boolean;
  getMessages: () => readonly ChatMessage[];
  maxEntries?: number;
  maxContextChars?: number;
}

interface PendingTurn {
  userText: string;
  startedAt: number;
  originalUserMessageCount: number;
  captureKey?: string;
}

export function createTencentDbMemoryPiExtension(options: TencentMemoryExtensionOptions): ExtensionFactory {
  const now = options.now ?? Date.now;
  let pendingTurn: PendingTurn | undefined;
  let shortTermOffloadDisabled = false;

  return (pi) => {
    pi.on("before_agent_start", (event) => {
      pendingTurn = {
        userText: event.prompt,
        startedAt: turnStartFloorForUserMessage(undefined, now()),
        originalUserMessageCount: 0,
      };
    });

    pi.on("context", async (event) => {
      const userIndex = findLastUserMessageIndex(event.messages);
      if (userIndex < 0) return undefined;
      const userText = messageText(event.messages[userIndex]);
      if (!userText.trim()) return undefined;
      const startedAt = turnStartFloorForUserMessage(event.messages[userIndex], now());
      if (!pendingTurn || pendingTurn.userText !== userText) {
        pendingTurn = {
          userText,
          startedAt,
          originalUserMessageCount: userIndex,
        };
      } else {
        pendingTurn.startedAt = Math.min(pendingTurn.startedAt, startedAt);
        pendingTurn.originalUserMessageCount = userIndex;
      }

      const [recall, offloadText] = await Promise.all([
        options.runtime.recall(userText),
        buildShortTermOffloadContext(options.shortTermOffload, () => shortTermOffloadDisabled, () => {
          shortTermOffloadDisabled = true;
        }),
      ]);
      const contextBlocks = [
        recall?.text.trim(),
        offloadText?.trim(),
      ].filter((text): text is string => Boolean(text));
      if (!contextBlocks.length) return undefined;
      const injectedContext = contextBlocks.join("\n\n");
      options.runtime.recordContextInjection({
        messageCount: event.messages.length,
        originalUserChars: userText.length,
        recallContextChars: recall?.text.trim().length ?? 0,
        offloadContextChars: offloadText?.trim().length ?? 0,
        totalInjectedChars: injectedContext.length,
        projectedUserMessageChars: injectedContext.length + userText.length + 2,
        truncated: Boolean(recall?.truncated || offloadText?.includes("[truncated]")),
      });
      const messages = [...event.messages];
      messages[userIndex] = prependContextToUserMessage(messages[userIndex], injectedContext);
      return { messages };
    });

    pi.on("agent_end", async (event) => {
      const userIndex = pendingTurn?.originalUserMessageCount ?? findLastUserMessageIndex(event.messages);
      const userText = pendingTurn?.userText ?? (userIndex >= 0 ? messageText(event.messages[userIndex]) : "");
      if (!userText.trim()) return;
      const turnMessages = userIndex >= 0 ? event.messages.slice(userIndex) : event.messages;
      const assistantText = assistantTextAfterUser(event, userIndex);
      const captureKey = `${pendingTurn?.startedAt ?? 0}:${userText}:${assistantText}`;
      if (pendingTurn?.captureKey === captureKey) return;
      if (pendingTurn) pendingTurn.captureKey = captureKey;
      await options.runtime.capture({
        userText,
        assistantText,
        messages: turnMessages,
        startedAt: pendingTurn?.startedAt,
        originalUserMessageCount: userIndex >= 0 ? userIndex : undefined,
      });
    });

    pi.on("session_shutdown", async () => {
      await options.runtime.dispose();
    });

    registerTencentMemorySearchTools(pi, options.runtime);
  };
}

async function buildShortTermOffloadContext(
  options: TencentMemoryShortTermOffloadOptions | undefined,
  isDisabled: () => boolean,
  disable: () => void,
): Promise<string | undefined> {
  if (!options?.enabled || isDisabled()) return undefined;
  try {
    return buildAmbientTencentMemoryOffloadContext({
      messages: options.getMessages(),
      maxEntries: options.maxEntries,
      maxContextChars: options.maxContextChars,
    })?.text;
  } catch {
    disable();
    return undefined;
  }
}

function registerTencentMemorySearchTools(
  pi: Parameters<ExtensionFactory>[0],
  runtime: AmbientTencentDbMemoryRuntime,
): void {
  registerDesktopTool(pi, tencentMemorySearchToolDescriptor, {
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      const input = params as { query: string; limit?: number; type?: string; scene?: string };
      const result = await runtime.searchMemories({
        query: input.query,
        limit: input.limit,
        type: input.type,
        scene: input.scene,
      });
      if (!result) return unavailableToolResult("TencentDB memory search is unavailable.");
      return {
        content: [{ type: "text", text: result.text || "No matching TencentDB memories found." }],
        details: {
          total: result.total,
          strategy: result.strategy,
        },
      };
    },
  });

  registerDesktopTool(pi, tencentConversationSearchToolDescriptor, {
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      const input = params as { query: string; limit?: number; sessionKey?: string };
      const result = await runtime.searchConversations({
        query: input.query,
        limit: input.limit,
        sessionKey: input.sessionKey,
      });
      if (!result) return unavailableToolResult("TencentDB conversation search is unavailable.");
      return {
        content: [{ type: "text", text: result.text || "No matching TencentDB conversations found." }],
        details: {
          total: result.total,
        },
      };
    },
  });

  registerDesktopTool(pi, tencentMemoryInspectToolDescriptor, {
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      const input = params as { layer?: "l1" | "l0" | "l2" | "l3" | "all"; scope?: "thread" | "workspace"; query?: string; limit?: number; sessionKey?: string; sessionId?: string };
      const result = await runtime.inspectMemories({
        layer: input.layer,
        scope: input.scope,
        query: input.query,
        limit: input.limit,
        sessionKey: input.sessionKey,
        sessionId: input.sessionId,
      });
      if (!result) return unavailableToolResult("TencentDB memory inspection is unavailable.");
      return {
        content: [{ type: "text", text: formatMemoryInspectTable(result) }],
        details: {
          total: result.total,
          truncated: result.truncated,
          rows: result.rows.map(memoryRowDetails),
        },
      };
    },
  });

  registerDesktopTool(pi, tencentMemoryUpdateToolDescriptor, {
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      const input = params as {
        layer: "l1" | "l2" | "l3";
        id: string;
        content: string;
        type?: string;
        priority?: number;
        sceneName?: string;
        filename?: string;
        confirmed?: boolean;
      };
      if (!input.confirmed) {
        return unavailableToolResult("Memory update requires explicit confirmation. Re-run with confirmed=true after the user confirms the exact memory id and replacement content.");
      }
      const row = await runtime.updateMemory({
        layer: input.layer,
        id: input.id,
        content: input.content,
        type: input.type,
        priority: input.priority,
        sceneName: input.sceneName,
        filename: input.filename,
      });
      if (!row) return unavailableToolResult("TencentDB memory update is unavailable.");
      return {
        content: [{ type: "text", text: `Updated TencentDB memory ${row.id} (${row.layer}).\n\n${formatMemoryRowsTable([row])}` }],
        details: {
          updated: memoryRowDetails(row),
        },
      };
    },
  });

  registerDesktopTool(pi, tencentMemoryDeleteToolDescriptor, {
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      const input = params as { layer: "l1" | "l0" | "l2" | "l3"; ids: string[]; confirmed?: boolean };
      if (!input.confirmed) {
        return unavailableToolResult("Memory delete requires explicit confirmation. Re-run with confirmed=true after the user confirms the exact memory id(s) to delete.");
      }
      const result = await runtime.deleteMemory({
        layer: input.layer,
        ids: Array.isArray(input.ids) ? input.ids : [],
      });
      if (!result) return unavailableToolResult("TencentDB memory delete is unavailable.");
      return {
        content: [{
          type: "text",
          text: [
            `Deleted ${result.deleted.length} TencentDB ${input.layer} memor${result.deleted.length === 1 ? "y" : "ies"}.`,
            result.failed.length ? `Failed ids: ${result.failed.join(", ")}` : undefined,
          ].filter(Boolean).join("\n"),
        }],
        details: result,
      };
    },
  });
}

function unavailableToolResult(message: string): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: message }],
    details: { unavailable: true },
  };
}

function findLastUserMessageIndex(messages: readonly AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isUserMessage(messages[index])) return index;
  }
  return -1;
}

function assistantTextAfterUser(event: AgentEndEvent, userIndex: number): string {
  const messages = userIndex >= 0 ? event.messages.slice(userIndex + 1) : event.messages;
  return messages
    .filter(isAssistantMessage)
    .map(messageText)
    .filter(Boolean)
    .join("\n\n");
}

function prependContextToUserMessage(message: AgentMessage, context: string): AgentMessage {
  if (!isUserMessage(message)) return message;
  if (typeof message.content === "string") {
    return {
      ...message,
      content: `${context}\n\n${message.content}`,
    };
  }
  if (Array.isArray(message.content)) {
    return {
      ...message,
      content: [
        { type: "text", text: `${context}\n\n` },
        ...message.content,
      ],
    };
  }
  return message;
}

function messageText(message: AgentMessage | undefined): string {
  if (!message || typeof message !== "object" || !("content" in message)) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => item && typeof item === "object" && "type" in item && item.type === "text" && "text" in item ? String(item.text) : "")
    .filter(Boolean)
    .join("");
}

function turnStartFloorForUserMessage(message: AgentMessage | undefined, fallbackNow: number): number {
  const timestamp = messageTimestampMs(message);
  const base = timestamp ?? fallbackNow;
  return Math.max(0, Math.floor(base) - 1);
}

function messageTimestampMs(message: AgentMessage | undefined): number | undefined {
  if (!message || typeof message !== "object" || !("timestamp" in message)) return undefined;
  const timestamp = message.timestamp;
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) return timestamp;
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const dateTimestamp: unknown = timestamp;
  if (dateTimestamp instanceof Date) return dateTimestamp.getTime();
  return undefined;
}

function isUserMessage(message: AgentMessage | undefined): message is UserAgentMessage {
  return Boolean(message && typeof message === "object" && "role" in message && message.role === "user");
}

function isAssistantMessage(message: AgentMessage | undefined): message is AssistantAgentMessage {
  return Boolean(message && typeof message === "object" && "role" in message && message.role === "assistant");
}

const tencentMemorySearchToolDescriptor: DesktopToolDescriptor = {
  name: TENCENT_MEMORY_SEARCH_TOOL_NAME,
  label: "Tencent Memory Search",
  description: "Search TencentDB Agent Memory structured long-term memories for this workspace.",
  promptSnippet: "tdai_memory_search: Search TencentDB Agent Memory long-term memories for prior durable facts, preferences, and decisions.",
  promptGuidelines: [
    "Use this when remembered user preferences, prior decisions, or durable workspace facts would materially help the current task.",
    "Treat results as recalled context, not as a replacement for inspecting current files or live tool output.",
    "Do not expose raw memory storage paths or internal diagnostic details to the user.",
  ],
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
      limit: { type: "number", description: "Maximum results to return. Defaults to 5." },
      type: { type: "string", description: "Optional Tencent memory type filter." },
      scene: { type: "string", description: "Optional Tencent scene filter." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      total: { type: "number" },
      strategy: { type: "string" },
    },
    additionalProperties: true,
  },
  source: "first-party",
  sideEffects: "none",
  permissionScope: "memory.read",
  supportsDryRun: true,
  supportsUndo: false,
  idempotency: "required",
  defaultTimeoutMs: 8_000,
  runtimeSupport: ["chat"],
};

const tencentConversationSearchToolDescriptor: DesktopToolDescriptor = {
  name: TENCENT_CONVERSATION_SEARCH_TOOL_NAME,
  label: "Tencent Conversation Search",
  description: "Search TencentDB Agent Memory raw captured conversation records for this workspace.",
  promptSnippet: "tdai_conversation_search: Search TencentDB Agent Memory captured conversation records for prior turn evidence.",
  promptGuidelines: [
    "Use this when exact prior conversation evidence would help answer the current task.",
    "Prefer current transcript and artifacts when they are already visible; use this tool for older memory-backed turns.",
    "Summarize only relevant matches and avoid leaking unrelated remembered content.",
  ],
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
      limit: { type: "number", description: "Maximum results to return. Defaults to 5." },
      sessionKey: { type: "string", description: "Optional TencentDB memory session key filter." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      total: { type: "number" },
    },
    additionalProperties: true,
  },
  source: "first-party",
  sideEffects: "none",
  permissionScope: "memory.read",
  supportsDryRun: true,
  supportsUndo: false,
  idempotency: "required",
  defaultTimeoutMs: 8_000,
  runtimeSupport: ["chat"],
};

const tencentMemoryInspectToolDescriptor: DesktopToolDescriptor = {
  name: TENCENT_MEMORY_INSPECT_TOOL_NAME,
  label: "Tencent Memory Inspect",
  description: "Inspect TencentDB Agent Memory records for this thread or workspace as a compact table.",
  promptSnippet: "ambient_memory_inspect: Show associated TencentDB memories in a compact table with stable ids for follow-up edit/delete requests.",
  promptGuidelines: [
    "Use this when the user asks to see, inspect, audit, or review associated memories.",
    "Render the returned table directly unless the user asks for a narrower summary.",
    "Use stable ids from this tool for later ambient_memory_update or ambient_memory_delete calls.",
    "Use scope=workspace when the user asks for workspace memories, associated memories beyond the current thread, or why a later thread recalled something.",
    "Use scope=thread when the user asks only about memories captured from the current thread.",
    "Do not expand full remembered content unless the user asks for a specific memory id.",
  ],
  inputSchema: {
    type: "object",
    properties: {
      layer: { type: "string", enum: ["all", "l1", "l0", "l2", "l3"], description: "Memory layer to inspect. Defaults to all associated layers." },
      scope: { type: "string", enum: ["thread", "workspace"], description: "thread limits L1/L0 to the current Tencent session. workspace lists matching workspace memories across sessions. Defaults to thread." },
      query: { type: "string", description: "Optional substring filter." },
      limit: { type: "number", description: "Maximum rows to return. Defaults to 20, max 100." },
      sessionKey: { type: "string", description: "Optional Tencent session key. Defaults to this thread for L1/L0." },
      sessionId: { type: "string", description: "Optional Tencent session id filter for L1." },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      total: { type: "number" },
      truncated: { type: "boolean" },
      rows: { type: "array" },
    },
    additionalProperties: true,
  },
  source: "first-party",
  sideEffects: "none",
  permissionScope: "memory.read",
  supportsDryRun: true,
  supportsUndo: false,
  idempotency: "required",
  defaultTimeoutMs: 8_000,
  runtimeSupport: ["chat"],
};

const tencentMemoryUpdateToolDescriptor: DesktopToolDescriptor = {
  name: TENCENT_MEMORY_UPDATE_TOOL_NAME,
  label: "Tencent Memory Update",
  description: "Edit an inspectable TencentDB Agent Memory record through Tencent's durable store/profile path.",
  promptSnippet: "ambient_memory_update: Edit a visible TencentDB memory by stable id after the user explicitly confirms the id and replacement content.",
  promptGuidelines: [
    "Call ambient_memory_inspect first if the target id is not already visible in this conversation.",
    "Stable ids are workspace-visible; use the exact id from the inspected table instead of assuming the memory belongs to the current thread.",
    "Only call this with confirmed=true after the user confirms the exact id and replacement content.",
    "Use L1 for normal durable memory edits. Use L2/L3 only when the user is editing a profile or scene memory.",
    "Do not use this for L0 source conversation rows; L0 supports inspect/delete only.",
  ],
  inputSchema: {
    type: "object",
    properties: {
      layer: { type: "string", enum: ["l1", "l2", "l3"] },
      id: { type: "string", description: "Stable memory/profile id from ambient_memory_inspect." },
      content: { type: "string", description: "Replacement memory content." },
      type: { type: "string", enum: ["persona", "episodic", "instruction"], description: "L1 memory type. Defaults to the existing type when available." },
      priority: { type: "number", description: "L1 priority score. Defaults to the existing priority when available." },
      sceneName: { type: "string", description: "Optional L1 scene name." },
      filename: { type: "string", description: "Optional L2/L3 profile filename." },
      confirmed: { type: "boolean", description: "Must be true after explicit user confirmation." },
    },
    required: ["layer", "id", "content", "confirmed"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      updated: { type: "object" },
    },
    additionalProperties: true,
  },
  source: "first-party",
  sideEffects: "write-workspace",
  permissionScope: "memory.write",
  supportsDryRun: false,
  supportsUndo: false,
  idempotency: "recommended",
  defaultTimeoutMs: 8_000,
  runtimeSupport: ["chat"],
};

const tencentMemoryDeleteToolDescriptor: DesktopToolDescriptor = {
  name: TENCENT_MEMORY_DELETE_TOOL_NAME,
  label: "Tencent Memory Delete",
  description: "Delete TencentDB Agent Memory records through Tencent's durable store/profile path.",
  promptSnippet: "ambient_memory_delete: Delete visible TencentDB memory ids after the user explicitly confirms the ids.",
  promptGuidelines: [
    "Call ambient_memory_inspect first if the target ids are not already visible in this conversation.",
    "Only call this with confirmed=true after the user confirms the exact ids to delete.",
    "Use this for privacy deletes of L0 source records and normal deletes of L1/L2/L3 memories.",
    "After deleting, use ambient_memory_inspect or memory search if the user asks to verify the change.",
  ],
  inputSchema: {
    type: "object",
    properties: {
      layer: { type: "string", enum: ["l1", "l0", "l2", "l3"] },
      ids: { type: "array", items: { type: "string" }, description: "Stable ids from ambient_memory_inspect." },
      confirmed: { type: "boolean", description: "Must be true after explicit user confirmation." },
    },
    required: ["layer", "ids", "confirmed"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      deleted: { type: "array" },
      failed: { type: "array" },
    },
    additionalProperties: true,
  },
  source: "first-party",
  sideEffects: "write-workspace",
  permissionScope: "memory.write",
  supportsDryRun: false,
  supportsUndo: false,
  idempotency: "recommended",
  defaultTimeoutMs: 8_000,
  runtimeSupport: ["chat"],
};

function formatMemoryInspectTable(result: {
  rows: Array<{
    id: string;
    layer: string;
    preview: string;
    type?: string;
    role?: string;
    priority?: number;
    sceneName?: string;
    filename?: string;
    updatedAt?: string;
  }>;
  total: number;
  truncated: boolean;
}): string {
  if (!result.rows.length) return "No associated TencentDB memories found.";
  const suffix = result.truncated ? `\n\nShowing ${result.rows.length} of ${result.total} matching memories.` : "";
  return `${formatMemoryRowsTable(result.rows)}${suffix}`;
}

function formatMemoryRowsTable(rows: Array<{
  id: string;
  layer: string;
  preview: string;
  type?: string;
  role?: string;
  priority?: number;
  sceneName?: string;
  filename?: string;
  updatedAt?: string;
}>): string {
  const header = "| ID | Layer | Kind | Updated | Preview |\n| --- | --- | --- | --- | --- |";
  const body = rows.map((row) => [
    tableCell(row.id),
    tableCell(row.layer),
    tableCell(row.type ?? row.role ?? row.filename ?? ""),
    tableCell(row.updatedAt ?? ""),
    tableCell(row.preview),
  ].join(" | ")).map((line) => `| ${line} |`);
  return [header, ...body].join("\n");
}

function memoryRowDetails(row: {
  id: string;
  layer: string;
  preview: string;
  type?: string;
  priority?: number;
  sceneName?: string;
  sessionKey?: string;
  sessionId?: string;
  role?: string;
  filename?: string;
  updatedAt?: string;
}) {
  return {
    id: row.id,
    layer: row.layer,
    preview: row.preview,
    ...(row.type ? { type: row.type } : {}),
    ...(row.priority != null ? { priority: row.priority } : {}),
    ...(row.sceneName ? { sceneName: row.sceneName } : {}),
    ...(row.sessionKey ? { sessionKey: row.sessionKey } : {}),
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ...(row.role ? { role: row.role } : {}),
    ...(row.filename ? { filename: row.filename } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
  };
}

function tableCell(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
}
