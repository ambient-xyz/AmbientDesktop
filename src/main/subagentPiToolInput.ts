import type {
  SubagentDependencyMode,
  SubagentWaitBarrierMode,
} from "../shared/subagentProtocol";

export const SUBAGENT_PI_TOOL_INPUT_SCHEMA_VERSION =
  "ambient-subagent-pi-tool-input-v1" as const;

export const DEFAULT_OPTIONAL_BACKGROUND_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS = 60_000;
export const MIN_REQUIRED_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS = MIN_REQUIRED_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS;
export const MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS = 60 * 60_000;

export interface ResolveSubagentPiToolWaitTimeoutOptions {
  waitBarrierMode?: SubagentWaitBarrierMode | SubagentDependencyMode;
  env?: NodeJS.ProcessEnv;
}

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

export function resolveSubagentPiToolWaitTimeoutMs(
  input: Record<string, unknown>,
  options: ResolveSubagentPiToolWaitTimeoutOptions = {},
): number {
  const wait = objectInput(input.wait);
  const raw = typeof wait.timeoutMs === "number" ? wait.timeoutMs : undefined;
  const optionalBackground = options.waitBarrierMode === "optional_background";
  const requiredFloorMs = optionalBackground
    ? 0
    : resolveRequiredSubagentPiToolWaitTimeoutFloorMs(options.env);
  const defaultTimeoutMs = optionalBackground
    ? DEFAULT_OPTIONAL_BACKGROUND_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS
    : requiredFloorMs;
  if (raw === undefined || !Number.isFinite(raw)) return defaultTimeoutMs;
  const maxTimeoutMs = Math.max(requiredFloorMs, MAX_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS);
  return Math.max(requiredFloorMs, Math.min(maxTimeoutMs, Math.floor(raw)));
}

export function resolveRequiredSubagentPiToolWaitTimeoutFloorMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.AMBIENT_SUBAGENT_REQUIRED_WAIT_TIMEOUT_FLOOR_MS);
  if (!Number.isFinite(raw)) return MIN_REQUIRED_SUBAGENT_PI_TOOL_WAIT_TIMEOUT_MS;
  return Math.max(1, Math.floor(raw));
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
