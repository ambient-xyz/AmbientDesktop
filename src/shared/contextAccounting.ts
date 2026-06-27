export interface ProviderPayloadAccounting {
  requestType: "normal" | "compaction" | "retry" | "title" | "workflow" | "unknown";
  model?: string;
  messageCount?: number;
  roles?: string[];
  contentBytes?: number;
  toolCount?: number;
  toolNames?: string[];
  toolSchemaBytes?: number;
  toolSchemaBreakdown?: ProviderToolSchemaAccounting[];
  totalBytes?: number;
  estimatedTokens?: number;
}

export interface ProviderToolSchemaAccounting {
  name: string;
  bytes: number;
}

export interface PromptPreflightResult {
  promptTokens: number;
  projectedTokens?: number;
  projectedPercent?: number;
  contextWindow: number;
  shouldCompact: boolean;
  promptTooLarge: boolean;
  reason?: string;
}

const TOKEN_CHAR_RATIO = 4;
const MAX_ACCOUNTED_ARRAY_ITEMS = 200;
const MAX_ACCOUNTED_OBJECT_KEYS = 200;
const MAX_ACCOUNTED_TOOL_NAMES = 120;
const MAX_ACCOUNTED_TOOL_SCHEMA_BREAKDOWN = 80;
const TRUNCATED_JSON_OVERHEAD_BYTES = 64;

export function estimateTokensFromText(value: string): number {
  if (!value) return 0;
  return Math.ceil(value.length / TOKEN_CHAR_RATIO);
}

export function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes / TOKEN_CHAR_RATIO);
}

export function estimateJsonByteLength(value: unknown): number {
  return estimateJsonByteLengthInternal(value, new WeakSet<object>());
}

export function summarizeProviderPayload(payload: unknown, requestType: ProviderPayloadAccounting["requestType"] = "normal"): ProviderPayloadAccounting {
  const record = objectRecord(payload);
  const messages = Array.isArray(record?.messages) ? record.messages : [];
  const roles = messages
    .map((message) => objectRecord(message)?.role)
    .filter((role): role is string => typeof role === "string")
    .slice(0, 80);
  const contentBytes = messages.reduce((total, message) => total + byteLength(objectRecord(message)?.content), 0);
  const toolSchema = summarizeToolSchemas(record);
  const toolSchemaBytes = toolSchema.bytes + byteLength(record?.tool_choice);
  const totalBytes = estimateProviderPayloadBytes(record, contentBytes, toolSchemaBytes);
  return {
    requestType,
    model: typeof record?.model === "string" ? record.model : undefined,
    messageCount: messages.length || undefined,
    roles: roles.length ? roles : undefined,
    contentBytes: contentBytes || undefined,
    toolCount: toolSchema.toolCount || undefined,
    toolNames: toolSchema.toolNames.length ? toolSchema.toolNames : undefined,
    toolSchemaBytes: toolSchemaBytes || undefined,
    toolSchemaBreakdown: toolSchema.breakdown.length ? toolSchema.breakdown : undefined,
    totalBytes: totalBytes || undefined,
    estimatedTokens: estimateTokensFromBytes(totalBytes),
  };
}

export function preflightPrompt(input: {
  prompt: string;
  currentTokens?: number;
  contextWindow: number;
  reserveTokens: number;
  hardPreflightPercent: number;
  justCompacted?: boolean;
}): PromptPreflightResult {
  const promptTokens = estimateTokensFromText(input.prompt);
  const usableWindow = Math.max(1, input.contextWindow - input.reserveTokens);
  const promptTooLarge = promptTokens > usableWindow;
  if (promptTooLarge) {
    return {
      promptTokens,
      contextWindow: input.contextWindow,
      shouldCompact: false,
      promptTooLarge: true,
      reason: `The prompt is estimated at ${promptTokens.toLocaleString()} tokens, which cannot fit with the configured response reserve.`,
    };
  }

  if (input.currentTokens === undefined) {
    return {
      promptTokens,
      contextWindow: input.contextWindow,
      shouldCompact: false,
      promptTooLarge: false,
    };
  }

  const projectedTokens = input.currentTokens + promptTokens;
  const projectedPercent = (projectedTokens / input.contextWindow) * 100;
  const shouldCompact = !input.justCompacted && projectedPercent >= input.hardPreflightPercent;
  return {
    promptTokens,
    projectedTokens,
    projectedPercent,
    contextWindow: input.contextWindow,
    shouldCompact,
    promptTooLarge: false,
    reason: shouldCompact
      ? `Projected context is ${Math.round(projectedPercent)}%, above the ${input.hardPreflightPercent}% hard preflight threshold.`
      : undefined,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function byteLength(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return Buffer.byteLength(value);
  return estimateJsonByteLength(value);
}

function summarizeToolSchemas(record: Record<string, unknown> | undefined): {
  bytes: number;
  toolCount: number;
  toolNames: string[];
  breakdown: ProviderToolSchemaAccounting[];
} {
  const tools = [
    ...arrayValue(record?.tools),
    ...arrayValue(record?.functions),
  ];
  const breakdown = tools
    .map((tool, index) => ({
      name: toolSchemaName(tool) ?? `unnamed_tool_${index + 1}`,
      bytes: byteLength(tool),
    }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    .slice(0, MAX_ACCOUNTED_TOOL_SCHEMA_BREAKDOWN);
  return {
    bytes: byteLength(record?.tools) + byteLength(record?.functions),
    toolCount: tools.length,
    toolNames: tools
      .map((tool, index) => toolSchemaName(tool) ?? `unnamed_tool_${index + 1}`)
      .slice(0, MAX_ACCOUNTED_TOOL_NAMES),
    breakdown,
  };
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toolSchemaName(value: unknown): string | undefined {
  const record = objectRecord(value);
  const fn = objectRecord(record?.function);
  const directName = typeof record?.name === "string" ? record.name : undefined;
  const functionName = typeof fn?.name === "string" ? fn.name : undefined;
  const name = functionName ?? directName;
  return name?.trim() || undefined;
}

function estimateProviderPayloadBytes(
  record: Record<string, unknown> | undefined,
  contentBytes: number,
  toolSchemaBytes: number,
): number {
  if (!record) return 0;
  const messageOverhead = Array.isArray(record.messages) ? record.messages.length * 80 : 0;
  const roleBytes = Array.isArray(record.messages)
    ? record.messages.reduce((total, message) => total + byteLength(objectRecord(message)?.role), 0)
    : 0;
  const modelBytes = byteLength(record.model);
  const scalarOptionsBytes = estimateJsonByteLength({
    temperature: record.temperature,
    max_tokens: record.max_tokens,
    stream: record.stream,
    reasoning: record.reasoning,
    response_format: record.response_format,
  });
  return contentBytes + toolSchemaBytes + messageOverhead + roleBytes + modelBytes + scalarOptionsBytes;
}

function estimateJsonByteLengthInternal(value: unknown, seen: WeakSet<object>): number {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return 0;
  if (value === null) return 4;
  if (typeof value === "string") return Buffer.byteLength(value) + 2;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return Buffer.byteLength(String(value));
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return TRUNCATED_JSON_OVERHEAD_BYTES;
    seen.add(value);
    const values = value.slice(0, MAX_ACCOUNTED_ARRAY_ITEMS);
    const truncated = value.length > values.length ? TRUNCATED_JSON_OVERHEAD_BYTES : 0;
    return 2 + Math.max(0, values.length - 1) + truncated + values.reduce((total, item) => total + estimateJsonByteLengthInternal(item, seen), 0);
  }
  if (typeof value === "object") {
    if (seen.has(value)) return TRUNCATED_JSON_OVERHEAD_BYTES;
    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_ACCOUNTED_OBJECT_KEYS);
    const truncated = Object.keys(value as Record<string, unknown>).length > entries.length ? TRUNCATED_JSON_OVERHEAD_BYTES : 0;
    return (
      2 +
      Math.max(0, entries.length - 1) +
      truncated +
      entries.reduce(
        (total, [key, item]) => total + Buffer.byteLength(key) + 3 + estimateJsonByteLengthInternal(item, seen),
        0,
      )
    );
  }
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}
