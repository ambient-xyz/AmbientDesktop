import { join } from "node:path";
import {
  AMBIENT_LOCAL_TEXT_MODEL,
  AMBIENT_PROVIDER_LOCAL,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../shared/ambientModels";
import type { ThreadSummary } from "../shared/types";
import type { CreateLocalTextSubagentRuntimeAdapterOptions } from "./localTextSubagentRuntime";
import type { LocalTextSubagentRuntimeConfig } from "./localTextSubagentRuntime";

export interface LocalTextSubagentStartupFeature {
  profile: AmbientModelRuntimeProfile;
  resolveModelRuntimeProfile: (modelId?: string) => AmbientModelRuntimeProfile;
  resolveRuntimeForMain: (input: {
    thread: ThreadSummary;
    runId: string;
    model: AmbientModelRuntimeProfile;
    prompt: string;
  }) => LocalTextSubagentRuntimeConfig | undefined;
  resolveRuntimeForLaunch: NonNullable<CreateLocalTextSubagentRuntimeAdapterOptions["resolveRuntimeForLaunch"]>;
  resolveRuntime: CreateLocalTextSubagentRuntimeAdapterOptions["resolveRuntime"];
}

export interface LocalTextSubagentStartupConfigResult {
  feature?: LocalTextSubagentStartupFeature;
  warnings: string[];
}

export function localTextSubagentStartupFeatureFromEnv(
  env: NodeJS.ProcessEnv,
): LocalTextSubagentStartupConfigResult {
  const command = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_COMMAND");
  const completionUrl = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_COMPLETION_URL");
  const warnings: string[] = [];
  if (!command && !completionUrl) return { warnings };
  if (!command) warnings.push("AMBIENT_LOCAL_TEXT_SUBAGENT_COMMAND is required to enable the startup local text sub-agent runtime.");
  if (!completionUrl) warnings.push("AMBIENT_LOCAL_TEXT_SUBAGENT_COMPLETION_URL is required to enable the startup local text sub-agent runtime.");

  const argsJson = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_ARGS_JSON");
  const args = argsJson ? parseStringArrayEnv(argsJson, "AMBIENT_LOCAL_TEXT_SUBAGENT_ARGS_JSON", warnings) : undefined;
  const estimatedResidentMemoryBytes = parsePositiveIntegerEnv(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_ESTIMATED_RSS_BYTES", warnings);
  const contextWindowTokens = parsePositiveIntegerEnv(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_CONTEXT_TOKENS", warnings);
  const maxOutputTokens = parsePositiveIntegerEnv(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_MAX_OUTPUT_TOKENS", warnings);
  const startupTimeoutMs = parsePositiveIntegerEnv(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_STARTUP_TIMEOUT_MS", warnings);
  const idleTimeoutMs = parseNonNegativeIntegerEnv(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_IDLE_TIMEOUT_MS", warnings);
  const timeoutMs = parsePositiveIntegerEnv(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_COMPLETION_TIMEOUT_MS", warnings);
  const maxInlineChars = parsePositiveIntegerEnv(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_MAX_INLINE_CHARS", warnings);

  if (!command || !completionUrl || warnings.length > 0) return { warnings };

  const modelId = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_MODEL_ID") ?? AMBIENT_LOCAL_TEXT_MODEL;
  const runtimeId = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_RUNTIME_ID") ?? `local-text:${modelId}`;
  const profile = configuredLocalTextProfile({
    modelId,
    profileId: `${AMBIENT_PROVIDER_LOCAL}:${modelId}:startup`,
    label: envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_LABEL") ?? "Local Text startup runtime",
    contextWindowTokens,
    maxOutputTokens,
    estimatedResidentMemoryBytes,
  });
  const cwd = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_CWD");
  const healthUrl = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_HEALTH_URL");
  const artifactRootPath = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_ARTIFACT_ROOT");
  const fullOutputPath = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_FULL_OUTPUT_PATH");
  const stateRootPath = envValue(env, "AMBIENT_LOCAL_TEXT_SUBAGENT_STATE_ROOT");

  return {
    warnings,
    feature: {
      profile,
      resolveModelRuntimeProfile: (requestedModelId) => {
        const normalized = requestedModelId?.trim() || AMBIENT_LOCAL_TEXT_MODEL;
        if (normalized === modelId) return profile;
        return resolveAmbientModelRuntimeProfile(requestedModelId);
      },
      resolveRuntimeForMain: ({ thread, runId, model }) => {
        if (model.modelId !== modelId) return undefined;
        return localTextRuntimeConfig({
          parentThreadWorkspacePath: thread.workspacePath,
          runId,
          runtimeId,
          command,
          args,
          cwd,
          healthUrl,
          startupTimeoutMs,
          idleTimeoutMs,
          estimatedResidentMemoryBytes,
          completionUrl,
          artifactRootPath: artifactRootPath ?? join(thread.workspacePath, ".ambient/local-main", runId),
          fullOutputPath,
          maxInlineChars,
          timeoutMs,
          stateRootPath,
        });
      },
      resolveRuntimeForLaunch: ({ parentThread, model }) => {
        if (model.modelId !== modelId) return undefined;
        return localTextRuntimeConfig({
          parentThreadWorkspacePath: parentThread.workspacePath,
          runId: "__scheduler_preflight__",
          runtimeId,
          command,
          args,
          cwd,
          healthUrl,
          startupTimeoutMs,
          idleTimeoutMs,
          estimatedResidentMemoryBytes,
          completionUrl,
          artifactRootPath,
          fullOutputPath,
          maxInlineChars,
          timeoutMs,
          stateRootPath,
        });
      },
      resolveRuntime: ({ parentThread, run, model }) => {
        if (model.modelId !== modelId) return undefined;
        return localTextRuntimeConfig({
          parentThreadWorkspacePath: parentThread.workspacePath,
          runId: run.id,
          runtimeId,
          command,
          args,
          cwd,
          healthUrl,
          startupTimeoutMs,
          idleTimeoutMs,
          estimatedResidentMemoryBytes,
          completionUrl,
          artifactRootPath,
          fullOutputPath,
          maxInlineChars,
          timeoutMs,
          stateRootPath,
        });
      },
    },
  };
}

function localTextRuntimeConfig(input: {
  parentThreadWorkspacePath: string;
  runId: string;
  runtimeId: string;
  command: string;
  args?: string[];
  cwd?: string;
  healthUrl?: string;
  startupTimeoutMs?: number;
  idleTimeoutMs?: number;
  estimatedResidentMemoryBytes?: number;
  completionUrl: string;
  artifactRootPath?: string;
  fullOutputPath?: string;
  maxInlineChars?: number;
  timeoutMs?: number;
  stateRootPath?: string;
}): NonNullable<ReturnType<LocalTextSubagentStartupFeature["resolveRuntime"]>> {
  return {
    launch: {
      runtimeId: input.runtimeId,
      command: input.command,
      ...(input.args ? { args: input.args } : {}),
      cwd: input.cwd ?? input.parentThreadWorkspacePath,
      ...(input.healthUrl ? { healthUrl: input.healthUrl } : {}),
      ...(input.startupTimeoutMs !== undefined ? { startupTimeoutMs: input.startupTimeoutMs } : {}),
      ...(input.idleTimeoutMs !== undefined ? { idleTimeoutMs: input.idleTimeoutMs } : {}),
      ...(input.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: input.estimatedResidentMemoryBytes } : {}),
    },
    completionUrl: input.completionUrl,
    artifactRootPath: input.artifactRootPath ?? join(input.parentThreadWorkspacePath, ".ambient/subagents", input.runId),
    ...(input.fullOutputPath ? { fullOutputPath: input.fullOutputPath } : {}),
    ...(input.maxInlineChars !== undefined ? { maxInlineChars: input.maxInlineChars } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    stateRootPath: input.stateRootPath ?? join(input.parentThreadWorkspacePath, ".ambient/local-model-runtime"),
  };
}

function configuredLocalTextProfile(input: {
  modelId: string;
  profileId: string;
  label: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  estimatedResidentMemoryBytes?: number;
}): AmbientModelRuntimeProfile {
  const base = resolveAmbientModelRuntimeProfile(input.modelId);
  return {
    ...base,
    profileId: input.profileId,
    providerId: AMBIENT_PROVIDER_LOCAL,
    modelId: input.modelId,
    label: input.label,
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    unavailableReason: undefined,
    contextWindowTokens: input.contextWindowTokens ?? base.contextWindowTokens ?? 16_384,
    maxOutputTokens: input.maxOutputTokens ?? base.maxOutputTokens ?? 4096,
    supportsStreaming: true,
    toolUse: "none",
    structuredOutput: "none",
    supportsVision: false,
    supportsAudio: false,
    locality: "local",
    costClass: "local",
    trustClass: "local-user-managed",
    privacyLabel: "Local user-managed text runtime",
    memoryClass: "small-local",
    ...(input.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: input.estimatedResidentMemoryBytes } : {}),
    providerQuirks: [
      "Configured from Ambient Desktop startup environment.",
      "Text-only Phase 3 local runtime for direct chat and sub-agent delegation; no Ambient/Pi tools are exposed.",
      ...(input.estimatedResidentMemoryBytes !== undefined ? [`Estimated resident memory ${input.estimatedResidentMemoryBytes} bytes.`] : []),
    ],
  };
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function parseStringArrayEnv(value: string, name: string, warnings: string[]): string[] | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string" && item.trim())) {
      return parsed.map((item) => item.trim());
    }
  } catch {
    // handled below
  }
  warnings.push(`${name} must be a JSON array of non-empty strings.`);
  return undefined;
}

function parsePositiveIntegerEnv(env: NodeJS.ProcessEnv, name: string, warnings: string[]): number | undefined {
  const raw = envValue(env, name);
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  warnings.push(`${name} must be a positive integer.`);
  return undefined;
}

function parseNonNegativeIntegerEnv(env: NodeJS.ProcessEnv, name: string, warnings: string[]): number | undefined {
  const raw = envValue(env, name);
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  warnings.push(`${name} must be a non-negative integer.`);
  return undefined;
}
