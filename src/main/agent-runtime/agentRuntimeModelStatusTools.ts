import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type {
  AmbientModelProviderId,
  AmbientModelReasoningCapability,
  AmbientModelReasoningOption,
  AmbientModelRuntimeCatalog,
  AmbientModelRuntimeProfile,
  AmbientModelStructuredOutputSupport,
  AmbientModelToolUseSupport,
} from "../../shared/ambientModels";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { ProviderStatus } from "../../shared/desktopTypes";
import { modelStatusToolDescriptor } from "./agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "./agentRuntimeDesktopToolFacade";

export const AMBIENT_MODEL_STATUS_TOOL_NAME = "ambient_model_status" as const;

export type AmbientModelStatusSecretStatus = "available" | "missing" | "not-required";

export interface AmbientModelStatusSelected {
  requestedModelId: string;
  effectiveModelId: string;
  label: string;
  profileId: string;
  providerId: AmbientModelProviderId;
}

export interface AmbientModelStatusRunning {
  modelId: string;
  label: string;
  matchesSelected: boolean;
}

export interface AmbientModelStatusProvider {
  id: string;
  label: string;
  locality: "cloud" | "local";
  supportsStreaming: boolean;
  supportsTools: boolean;
  secretStatus: AmbientModelStatusSecretStatus;
  storage: ProviderStatus["storage"];
  debugOverride?: boolean;
}

export interface AmbientModelStatusCapabilities {
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  supportsVision: boolean;
  supportsAudio: boolean;
  toolUse: AmbientModelToolUseSupport;
  structuredOutput: AmbientModelStructuredOutputSupport;
}

export interface AmbientModelStatusReasoning {
  control: AmbientModelReasoningCapability["control"];
  fixedReasoning: boolean;
  hiddenReasoningPreserved: boolean;
  defaultThinkingLevel: AmbientModelReasoningCapability["defaultThinkingLevel"];
  payloadStrategy: AmbientModelReasoningCapability["payloadStrategy"];
  selectableThinkingLevels: AmbientModelReasoningOption[];
  requestFields: string[];
  effortByThinkingLevel?: AmbientModelReasoningCapability["effortByThinkingLevel"];
}

export interface AmbientModelStatusResult {
  schemaVersion: "ambient-running-model-status-v1";
  selected: AmbientModelStatusSelected;
  running: AmbientModelStatusRunning;
  provider: AmbientModelStatusProvider;
  capabilities: AmbientModelStatusCapabilities;
  reasoning: AmbientModelStatusReasoning;
  warnings: string[];
}

export interface BuildAmbientModelStatusInput {
  requestedModelId: string;
  runningModelId: string;
  providerStatus: ProviderStatus;
  catalog: AmbientModelRuntimeCatalog;
}

export interface ModelStatusToolRegistrationOptions {
  requestedModelId: () => string;
  runningModel: () => { id: string; name?: string };
  providerStatus: () => ProviderStatus;
  modelRuntimeCatalog: () => AmbientModelRuntimeCatalog;
}

export function createModelStatusToolExtension(options: ModelStatusToolRegistrationOptions): ExtensionFactory {
  return (pi) => {
    registerModelStatusTools(pi, options);
  };
}

export function registerModelStatusTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: ModelStatusToolRegistrationOptions,
): void {
  registerDesktopTool(pi, modelStatusToolDescriptor(AMBIENT_MODEL_STATUS_TOOL_NAME), {
    executionMode: "sequential",
    execute: async (_toolCallId, _params, _signal, onUpdate) => {
      onUpdate?.(modelStatusToolUpdate("Inspecting Ambient model runtime status."));
      const runningModel = options.runningModel();
      const result = buildAmbientModelStatus({
        requestedModelId: options.requestedModelId(),
        runningModelId: runningModel.id,
        providerStatus: options.providerStatus(),
        catalog: options.modelRuntimeCatalog(),
      });
      return modelStatusToolResult(result);
    },
  });
}

export function buildAmbientModelStatus(input: BuildAmbientModelStatusInput): AmbientModelStatusResult {
  const selectedEffectiveModelId = normalizeAmbientModelId(input.requestedModelId);
  const runningModelId = normalizeAmbientModelId(input.runningModelId);
  const selectedProfile = profileForModel(input.catalog, selectedEffectiveModelId);
  const runningProfile = profileForModel(input.catalog, runningModelId);
  const runningProvider = providerForId(input.catalog, runningProfile.providerId);
  const provider = providerForStatus(input.catalog, input.providerStatus, runningProvider);
  const warnings = modelStatusWarnings({
    selectedEffectiveModelId,
    runningModelId,
    selectedProfile,
    runningProfile,
    provider,
  });

  return {
    schemaVersion: "ambient-running-model-status-v1",
    selected: {
      requestedModelId: input.requestedModelId,
      effectiveModelId: selectedEffectiveModelId,
      label: selectedProfile.label,
      profileId: selectedProfile.profileId,
      providerId: selectedProfile.providerId,
    },
    running: {
      modelId: runningModelId,
      label: runningProfile.label,
      matchesSelected: runningModelId === selectedEffectiveModelId,
    },
    provider: {
      id: input.providerStatus.providerId,
      label: input.providerStatus.providerLabel,
      locality: provider.locality,
      supportsStreaming: provider.supportsStreaming,
      supportsTools: provider.supportsTools,
      secretStatus: providerSecretStatus(provider, input.providerStatus.hasApiKey),
      storage: input.providerStatus.storage,
      ...(input.providerStatus.debugOverride ? { debugOverride: true } : {}),
    },
    capabilities: {
      ...(runningProfile.contextWindowTokens ? { contextWindowTokens: runningProfile.contextWindowTokens } : {}),
      ...(runningProfile.maxOutputTokens ? { maxOutputTokens: runningProfile.maxOutputTokens } : {}),
      supportsVision: runningProfile.supportsVision,
      supportsAudio: runningProfile.supportsAudio,
      toolUse: runningProfile.toolUse,
      structuredOutput: runningProfile.structuredOutput,
    },
    reasoning: reasoningStatus(runningProfile.reasoningCapability),
    warnings,
  };
}

function profileForModel(catalog: AmbientModelRuntimeCatalog, modelId: string): AmbientModelRuntimeProfile {
  return catalog.profiles.find((profile) => profile.modelId === modelId) ?? unknownModelProfile(modelId);
}

function providerForStatus(
  catalog: AmbientModelRuntimeCatalog,
  providerStatus: ProviderStatus,
  fallback: AmbientModelStatusProviderSource,
): AmbientModelStatusProviderSource {
  return providerForId(catalog, providerStatus.providerId) ?? fallback;
}

type AmbientModelStatusProviderSource = AmbientModelRuntimeCatalog["providers"][number];

function providerForId(
  catalog: AmbientModelRuntimeCatalog,
  providerId: string,
): AmbientModelStatusProviderSource {
  return catalog.providers.find((provider) => provider.id === providerId) ?? unknownProvider(providerId);
}

function providerSecretStatus(
  provider: AmbientModelStatusProviderSource,
  hasApiKey: boolean,
): AmbientModelStatusSecretStatus {
  if (provider.secretRequirement === "none") return "not-required";
  return hasApiKey ? "available" : "missing";
}

function reasoningStatus(reasoningCapability: AmbientModelRuntimeProfile["reasoningCapability"]): AmbientModelStatusReasoning {
  const capability = reasoningCapability ?? {
    schemaVersion: "ambient-model-reasoning-capability-v1",
    control: "unsupported",
    fixedReasoning: false,
    hiddenReasoningPreserved: false,
    defaultThinkingLevel: "medium",
    selectableThinkingLevels: [],
    payloadStrategy: "preserve-reasoning-controls",
    requestFields: [],
    notes: [],
  } satisfies AmbientModelReasoningCapability;
  return {
    control: capability.control,
    fixedReasoning: capability.fixedReasoning,
    hiddenReasoningPreserved: capability.hiddenReasoningPreserved,
    defaultThinkingLevel: capability.defaultThinkingLevel,
    payloadStrategy: capability.payloadStrategy,
    selectableThinkingLevels: capability.selectableThinkingLevels.map((option) => ({ ...option })),
    requestFields: [...capability.requestFields],
    ...(capability.effortByThinkingLevel ? { effortByThinkingLevel: { ...capability.effortByThinkingLevel } } : {}),
  };
}

function modelStatusWarnings(input: {
  selectedEffectiveModelId: string;
  runningModelId: string;
  selectedProfile: AmbientModelRuntimeProfile;
  runningProfile: AmbientModelRuntimeProfile;
  provider: AmbientModelStatusProviderSource;
}): string[] {
  const warnings = new Set<string>();
  if (input.runningModelId !== input.selectedEffectiveModelId) {
    warnings.add(
      `Selected model ${input.selectedEffectiveModelId} does not match running model ${input.runningModelId}.`,
    );
  }
  if (!input.selectedProfile.available) {
    warnings.add(input.selectedProfile.unavailableReason ?? `Selected model ${input.selectedEffectiveModelId} is unavailable.`);
  }
  if (!input.runningProfile.available) {
    warnings.add(input.runningProfile.unavailableReason ?? `Running model ${input.runningModelId} is unavailable.`);
  }
  if (!input.provider.supportsTools) {
    warnings.add(`Provider ${input.provider.id} does not advertise Ambient tool support.`);
  }
  return [...warnings];
}

function unknownModelProfile(modelId: string): AmbientModelRuntimeProfile {
  return {
    schemaVersion: "ambient-model-runtime-profile-v1",
    profileId: `unknown:${modelId}`,
    providerId: "unknown",
    modelId,
    label: `${modelId} (unavailable)`,
    selectableAsMain: false,
    selectableAsSubagent: false,
    available: false,
    unavailableReason: "Model is not registered in this Ambient Desktop build.",
    supportsStreaming: false,
    toolUse: "none",
    structuredOutput: "none",
    supportsVision: false,
    supportsAudio: false,
    locality: "cloud",
    costClass: "metered",
    trustClass: "user-configured",
    privacyLabel: "Unknown provider",
    providerQuirks: ["Preserved from stored settings or transcript; not eligible for new runs until registered."],
  };
}

function unknownProvider(providerId: string): AmbientModelStatusProviderSource {
  return {
    id: providerId,
    label: `${providerId} provider`,
    locality: "cloud",
    secretRequirement: "user-secret",
    supportsStreaming: false,
    supportsTools: false,
    notes: ["Provider is not registered in this Ambient Desktop build."],
  };
}

function modelStatusToolResult(
  result: AmbientModelStatusResult,
): { content: { type: "text"; text: string }[]; details: AmbientModelStatusResult } {
  return {
    content: [
      {
        type: "text",
        text: [
          "Ambient model status",
          "",
          `Selected: ${result.selected.label} (${result.selected.effectiveModelId})`,
          `Running: ${result.running.label} (${result.running.modelId})`,
          `Provider: ${result.provider.label} (${result.provider.id})`,
          `Reasoning: ${result.reasoning.control} via ${result.reasoning.payloadStrategy}`,
          result.warnings.length ? `Warnings: ${result.warnings.join(" ")}` : "Warnings: none",
          "",
          "```json",
          JSON.stringify(result, null, 2),
          "```",
        ].join("\n"),
      },
    ],
    details: result,
  };
}

function modelStatusToolUpdate(text: string): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: { runtime: "ambient-model-status", toolName: AMBIENT_MODEL_STATUS_TOOL_NAME, status: "running" },
  };
}
