export const SUBAGENT_PI_TOOL_INPUT_SCHEMA_VERSION =
  "ambient-subagent-pi-tool-input-v1" as const;

export const DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS = 60_000;
export const MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS = 10 * 60_000;

export interface ResolvedSubagentPiToolInput<Action extends string> {
  input: Record<string, unknown>;
  action: Action;
}

export function resolveSubagentPiToolInput<Action extends readonly string[]>(
  params: unknown,
  allowedActions: Action,
): ResolvedSubagentPiToolInput<Action[number]> {
  const input = objectInput(params);
  return {
    input,
    action: enumValue(input.action, allowedActions, "action"),
  };
}

export function resolveSubagentPiToolWaitTimeoutMs(input: Record<string, unknown>): number {
  const wait = objectInput(input.wait);
  const raw = typeof wait.timeoutMs === "number" ? wait.timeoutMs : undefined;
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS;
  return Math.max(0, Math.min(MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS, Math.floor(raw)));
}

export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function requiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function enumValue<T extends readonly string[]>(value: unknown, allowed: T, key: string): T[number] {
  const text = optionalString(value);
  if (text && (allowed as readonly string[]).includes(text)) return text as T[number];
  throw new Error(`${key} must be one of ${allowed.join(", ")}.`);
}
