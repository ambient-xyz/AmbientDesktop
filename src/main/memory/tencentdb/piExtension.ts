import type {
  AgentEndEvent,
  AgentToolResult,
  ContextEvent,
  ExtensionFactory,
} from "@mariozechner/pi-coding-agent";

import { registerDesktopTool, type DesktopToolDescriptor } from "../../desktop-tools/desktopToolFirstPartyRuntimeContract";
import type { ChatMessage } from "../../../shared/threadTypes";
import { redactSensitiveTextWithMetadata } from "./memorySecurityFacade";
import { buildAmbientTencentMemoryOffloadContext } from "./offload";
import type { AmbientTencentDbMemoryRuntime } from "./runtime";
import {
  TENCENT_CONVERSATION_SEARCH_TOOL_NAME,
  TENCENT_MEMORY_CREATE_TOOL_NAME,
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

    registerTencentMemorySearchTools(pi, options.runtime, () => pendingTurn?.userText);
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
  currentUserText: () => string | undefined,
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

  registerDesktopTool(pi, tencentMemoryCreateToolDescriptor, {
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      const input = params as {
        content: string;
        type?: "persona" | "episodic" | "instruction";
        priority?: number;
        sceneName?: string;
        confirmed?: boolean;
      };
      if (input.confirmed !== true) {
        return unavailableToolResult("Memory create requires explicit confirmation. Re-run with confirmed=true only after the current user message positively asks to remember the exact content.");
      }
      const guard = validateCurrentUserMemoryCreateRequest(currentUserText(), input.content);
      if (!guard.allowed) {
        return unavailableToolResult(guard.message);
      }
      const row = await runtime.createMemory({
        layer: "l1",
        content: input.content,
        type: input.type,
        priority: input.priority,
        sceneName: input.sceneName,
      });
      if (!row) return unavailableToolResult("TencentDB memory create is unavailable.");
      return {
        content: [{ type: "text", text: `Created TencentDB memory ${row.id} (l1).\n\n${formatMemoryRowsTable([row])}` }],
        details: {
          created: memoryRowDetails(row),
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

function validateCurrentUserMemoryCreateRequest(
  userText: string | undefined,
  content: string,
): { allowed: true } | { allowed: false; message: string } {
  const normalizedUserText = normalizeMemoryCreateGuardText(userText ?? "");
  const normalizedContent = normalizeMemoryCreateGuardText(content);
  if (!normalizedContent) {
    return { allowed: false, message: "Memory create requires non-empty content from the current user request." };
  }
  if (memoryCreateContentHasSecretLikeMaterial(content) || memoryCreateUserWindowHasSecretLikeMaterial(normalizedUserText, normalizedContent)) {
    return {
      allowed: false,
      message: "Memory create cannot store API keys, tokens, passwords, or other secret-like content. Use Ambient-managed secret storage with ambient_cli_secret_request or ambient_cli_env_bind instead.",
    };
  }
  if (!currentUserTextAuthorizesMemoryCreate(normalizedUserText, normalizedContent)) {
    return {
      allowed: false,
      message: "Memory create requires the current user message to positively ask Ambient to remember the exact content or store/save/record it as memory, a durable fact, a preference, or an instruction.",
    };
  }
  return { allowed: true };
}

function memoryCreateContentHasSecretLikeMaterial(content: string): boolean {
  if (redactSensitiveTextWithMetadata(content).redacted) return true;
  return /\b(?:api[_\s-]?key|access[_\s-]?token|refresh[_\s-]?token|auth[_\s-]?token|token|private[_\s-]?key|password|passphrase|passwd|pwd|secret|credential|auth[_\s-]?key)\b.{0,32}(?:\bis\b|[=:])/i.test(content) ||
    /\b(?:api[_\s-]?key|access[_\s-]?token|refresh[_\s-]?token|auth[_\s-]?token|token|private[_\s-]?key|password|passphrase|passwd|pwd|secret|credential|auth[_\s-]?key)\b\s+["']?[A-Za-z0-9._~+/=-]{4,}/i.test(content) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(content) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(content);
}

function memoryCreateUserWindowHasSecretLikeMaterial(normalizedUserText: string, normalizedContent: string): boolean {
  let searchFrom = 0;
  while (searchFrom < normalizedUserText.length) {
    const contentIndex = normalizedUserText.indexOf(normalizedContent, searchFrom);
    if (contentIndex < 0) return false;
    const start = Math.max(0, contentIndex - 120);
    const end = Math.min(normalizedUserText.length, contentIndex + normalizedContent.length + 120);
    if (memoryCreateContentHasSecretLikeMaterial(normalizedUserText.slice(start, end))) return true;
    searchFrom = contentIndex + Math.max(1, normalizedContent.length);
  }
  return false;
}

function currentUserTextAuthorizesMemoryCreate(normalizedUserText: string, normalizedContent: string): boolean {
  let searchFrom = 0;
  while (searchFrom < normalizedUserText.length) {
    const contentIndex = normalizedUserText.indexOf(normalizedContent, searchFrom);
    if (contentIndex < 0) return false;
    const { clause, priorContext } = currentUserMemoryCreateClause(normalizedUserText.slice(0, contentIndex));
    const suffix = normalizedUserText.slice(contentIndex + normalizedContent.length, contentIndex + normalizedContent.length + 160);
    const suffixClause = currentUserMemoryCreateSuffixClause(suffix);
    if (
      !memoryCreatePriorContextFramesUntrusted(`${priorContext} ${clause}`) &&
      memoryCreateContextHasPositiveIntent(clause, normalizedContent, suffixClause) &&
      !memoryCreateClauseHasNegatedIntent(clause) &&
      !memoryCreateClauseHasNegatedIntent(suffixClause) &&
      !memoryCreateClauseHasTransientScope(clause) &&
      !memoryCreateClauseHasTransientScope(suffixClause) &&
      !memoryCreateTextHasTransientScope(`${normalizedContent} ${suffix}`) &&
      !memoryCreateSuffixHasNegatingCaveat(suffix)
    ) {
      return true;
    }
    searchFrom = contentIndex + Math.max(1, normalizedContent.length);
  }
  return false;
}

function currentUserMemoryCreateClause(prefix: string): { clause: string; priorContext: string } {
  const boundary = Math.max(
    prefix.lastIndexOf("."),
    prefix.lastIndexOf("!"),
    prefix.lastIndexOf("?"),
    prefix.lastIndexOf(";"),
    prefix.lastIndexOf("\n"),
  );
  return {
    clause: prefix.slice(boundary + 1).trim(),
    priorContext: boundary < 0 ? "" : prefix.slice(0, boundary + 1).trim(),
  };
}

function currentUserMemoryCreateSuffixClause(suffix: string): string {
  const trimmed = suffix.trim();
  const boundary = [";", "\n"].reduce((best, marker) => {
    const index = trimmed.indexOf(marker);
    return index >= 0 && (best < 0 || index < best) ? index : best;
  }, -1);
  return (boundary < 0 ? trimmed : trimmed.slice(0, boundary)).trim();
}

function memoryCreatePriorContextFramesUntrusted(priorContext: string): boolean {
  return /\b(?:summari[sz]e|analy[sz]e|review|explain|translate|paraphrase)\b.{0,80}\b(?:prompt|instruction|text|block|document|quote|snippet|transcript|log)\b/.test(priorContext) ||
    /\b(?:pasted|quoted|untrusted|fenced|markdown|prompt[-\s]?injection)\b.{0,80}\b(?:prompt|instruction|text|block|document|quote|snippet|transcript|log)?\b/.test(priorContext);
}

function memoryCreateContextHasPositiveIntent(prefixClause: string, content: string, suffixClause: string): boolean {
  return memoryCreateClauseHasLeadingPositiveIntent(prefixClause, `${prefixClause} ${content} ${suffixClause}`) ||
    memoryCreateClauseHasTrailingPositiveIntent(suffixClause);
}

function memoryCreateClauseHasLeadingPositiveIntent(clause: string, context: string): boolean {
  const match = clause.match(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+(?:please\s+)?)?(?:(?:i\s+(?:want|need)\s+you\s+to)\s+(?:please\s+)?)?(?:ambient\s*,?\s*)?(remember|store|save|record)\b/);
  const verb = match?.[1];
  if (!verb) return false;
  if (verb === "remember") return !/\bremember\s+(?:when|if|whether|who|what|where|why|how)\b/.test(clause);
  return /\b(?:memory|durable|fact|preference|instruction)\b/.test(context);
}

function memoryCreateClauseHasTrailingPositiveIntent(clause: string): boolean {
  const match = clause.match(/^(?:[.!,?:]\s*)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+(?:please\s+)?)?(?:(?:i\s+(?:want|need)\s+you\s+to)\s+(?:please\s+)?)?(?:ambient\s*,?\s*)?(remember|store|save|record)\b/);
  const verb = match?.[1];
  if (!verb) return false;
  if (verb === "remember") {
    return /\bremember\s+(?:that|this|it|the\s+(?:above|previous|preceding)|what\s+i\s+just\s+said)\b/.test(clause);
  }
  return /\b(?:memory|durable|fact|preference|instruction)\b/.test(clause);
}

function memoryCreateClauseHasNegatedIntent(clause: string): boolean {
  return /\b(?:do\s+not|don't|dont|never|avoid|refuse\s+to|should\s+not|must\s+not|not\s+to)\s+(?:remember|store|save|record|keep)\b/.test(clause) ||
    /\b(?:remember|store|save|record|keep)\b.{0,40}\b(?:not|nothing)\b/.test(clause);
}

function memoryCreateClauseHasTransientScope(clause: string): boolean {
  return /\bfor\s+(?:this|the)\s+(?:answer|response|reply|run|task|command|session|tool|request)\b/.test(clause);
}

function memoryCreateTextHasTransientScope(text: string): boolean {
  return /\bfor\s+(?:this|the)\s+(?:answer|response|reply|run|task|command|session|tool|request)\b/.test(text) ||
    /\b(?:only|just)\s+for\s+(?:this|the)\s+(?:answer|response|reply|run|task|command|session|tool|request)\b/.test(text);
}

function memoryCreateSuffixHasNegatingCaveat(suffix: string): boolean {
  return /\b(?:do\s+not|don't|dont|never|avoid|refuse\s+to|should\s+not|must\s+not)\s+(?:follow|obey|use|apply|store|save|record|remember|keep)\b/.test(suffix) ||
    /\b(?:ignore|disregard)\s+(?:this|that|the)\s+(?:instruction|request|prompt|text|quote)\b/.test(suffix) ||
    /\b(?:pasted|quoted|untrusted|prompt[-\s]?injection)\s+(?:instruction|request|prompt|text|quote)\b/.test(suffix);
}

function normalizeMemoryCreateGuardText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
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

const tencentMemoryCreateToolDescriptor: DesktopToolDescriptor = {
  name: TENCENT_MEMORY_CREATE_TOOL_NAME,
  label: "Tencent Memory Create",
  description: "Create a new durable TencentDB Agent Memory L1 record for an explicit user memory request.",
  promptSnippet: "ambient_memory_create: Create a durable TencentDB L1 memory when the user directly asks you to remember/store exact content.",
  promptGuidelines: [
    "Use this for explicit current-message requests such as \"remember that...\", \"store this in memory\", or \"save this durable fact\" followed by the exact memory text.",
    "Set confirmed=true only when the current user message positively asks to remember exact content, or to store/save/record it as memory, a durable fact, a preference, or an instruction.",
    "The exact content argument must appear in the current user message next to that positive memory request; a bare \"yes\" confirmation is not enough.",
    "If you need to rewrite or infer the memory, ask the user to restate the exact memory text they want saved.",
    "Keep content concise, durable, and user-meaningful; do not store transient tool plans or hidden reasoning.",
    "Do not store API keys, tokens, passwords, private keys, or other secret-like content; use Ambient-managed secret tools instead.",
    "Use type=persona for stable user preferences, instruction for standing instructions, and episodic for event/task facts.",
    "After creating, report the stable id if the user may want to inspect, edit, or delete the memory later.",
  ],
  inputSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "Exact durable memory content to create." },
      type: { type: "string", enum: ["persona", "episodic", "instruction"], description: "L1 memory type. Defaults to episodic." },
      priority: { type: "number", description: "L1 priority score. Defaults to 50." },
      sceneName: { type: "string", description: "Optional scene/category name. Defaults to explicit_memory." },
      confirmed: { type: "boolean", description: "Must be true only after the current user message explicitly asks to remember/store the exact content." },
    },
    required: ["content", "confirmed"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      created: { type: "object" },
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
