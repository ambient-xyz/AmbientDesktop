export function normalizeToolArgumentsForTool(toolName: string, value: unknown): unknown {
  return normalizeToolArgumentsForToolInner(toolName, value, 0);
}

function normalizeToolArgumentsForToolInner(toolName: string, value: unknown, depth: number): unknown {
  if (depth > 5 || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;

  const nestedToolCall = objectOrUndefined(input.toolCall);
  if (nestedToolCall) return normalizeToolArgumentsForToolInner(toolName, nestedToolCall, depth + 1);

  const nestedName = stringValue(input.toolName) ?? stringValue(input.name);
  const nestedNameMatches = nestedName?.trim() === toolName;
  const looksLikeToolCallEnvelope = input.type === "toolCall" || input.type === "tool_call";
  if (nestedName && !nestedNameMatches) return value;

  if (nestedNameMatches && ("toolInput" in input || "input" in input)) {
    return normalizeToolArgumentsForToolInner(toolName, input.toolInput ?? input.input ?? {}, depth + 1);
  }

  if ((nestedNameMatches || looksLikeToolCallEnvelope) && "arguments" in input) {
    return normalizeToolArgumentsForToolInner(toolName, parseToolArguments(input.arguments), depth + 1);
  }

  if (nestedNameMatches && isEnvelopeOnly(input)) {
    return {};
  }

  if (!nestedName && isEnvelopeOnly(input)) {
    if ("toolInput" in input || "input" in input) {
      return normalizeToolArgumentsForToolInner(toolName, input.toolInput ?? input.input ?? {}, depth + 1);
    }
    if (looksLikeToolCallEnvelope && "arguments" in input) {
      return normalizeToolArgumentsForToolInner(toolName, parseToolArguments(input.arguments), depth + 1);
    }
  }

  return value;
}

function parseToolArguments(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isEnvelopeOnly(input: Record<string, unknown>): boolean {
  const envelopeKeys = new Set(["toolCall", "toolName", "name", "toolInput", "input", "arguments", "type"]);
  return Object.keys(input).length > 0 && Object.keys(input).every((key) => envelopeKeys.has(key));
}

function objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
