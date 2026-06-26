import type {
  LocalRuntimeProviderLifecycleActionKind,
  LocalRuntimeProviderLifecycleControls,
  VoiceProviderCloningMetadata,
  VoiceProviderDiscoveryMetadata,
} from "../../shared/localRuntimeTypes";
import type { CliCommandDescriptor, CliRuntimeLifecycleActionDescriptor, CliRuntimeLifecycleDescriptor } from "./ambientCliPackageSchemas";
import type {
  AmbientCliEmbeddingProviderCommandMetadata,
  AmbientCliPackageCommand,
  AmbientCliSttProviderCommandMetadata,
  AmbientCliVoiceProviderCommandMetadata,
} from "./ambientCliPackageTypes";

export function validateCliProviderLifecycleCommands(commands: AmbientCliPackageCommand[], errors: string[]): void {
  const commandNames = new Set(commands.map((command) => command.name));
  for (const command of commands) {
    const lifecycleSources = [
      ["voiceProvider", command.voiceProvider?.runtimeLifecycle],
      ["embeddingProvider", command.embeddingProvider?.runtimeLifecycle],
    ] satisfies Array<[string, LocalRuntimeProviderLifecycleControls | undefined]>;
    for (const [field, lifecycle] of lifecycleSources) {
      if (!lifecycle) continue;
      for (const action of [lifecycle.start, lifecycle.stop, lifecycle.restart]) {
        if (!action) continue;
        if (commandNames.has(action.command)) continue;
        errors.push(
          `Command "${command.name}" ${field}.runtimeLifecycle.${action.kind}.command references undeclared command "${action.command}".`,
        );
      }
    }
  }
}

export function normalizeVoiceProviderCommandMetadata(
  input: CliCommandDescriptor["voiceProvider"],
): AmbientCliVoiceProviderCommandMetadata {
  return {
    ...(input?.label?.trim() ? { label: input.label.trim() } : {}),
    defaultFormat: input?.defaultFormat ?? "wav",
    formats: input?.formats?.length ? input.formats : ["wav"],
    voices: input?.voices?.length
      ? input.voices.map((voice) => ({ id: voice.id, ...(voice.label ? { label: voice.label } : {}) }))
      : [{ id: "default" }],
    ...(input?.local !== undefined ? { local: input.local } : {}),
    ...(input?.voiceDiscovery ? { voiceDiscovery: normalizeVoiceDiscoveryMetadata(input.voiceDiscovery) } : {}),
    ...(input?.voiceCloning ? { voiceCloning: normalizeVoiceCloningMetadata(input.voiceCloning) } : {}),
    ...(input?.runtimeLifecycle ? { runtimeLifecycle: normalizeProviderLifecycleControls(input.runtimeLifecycle) } : {}),
  };
}

export function normalizeEmbeddingProviderCommandMetadata(
  input: CliCommandDescriptor["embeddingProvider"],
): AmbientCliEmbeddingProviderCommandMetadata {
  return {
    ...(input?.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input?.modelId?.trim() ? { modelId: input.modelId.trim() } : {}),
    ...(input?.dimensions !== undefined ? { dimensions: input.dimensions } : {}),
    ...(input?.local !== undefined ? { local: input.local } : {}),
    ...(input?.runtimeLifecycle ? { runtimeLifecycle: normalizeProviderLifecycleControls(input.runtimeLifecycle) } : {}),
  };
}

export function normalizeSttProviderCommandMetadata(input: CliCommandDescriptor["sttProvider"]): AmbientCliSttProviderCommandMetadata {
  const languages = Array.from(new Set((input?.languages ?? []).map((language) => language.trim()).filter(Boolean)));
  return {
    ...(input?.label?.trim() ? { label: input.label.trim() } : {}),
    languages,
    ...(input?.defaultLanguage?.trim() ? { defaultLanguage: input.defaultLanguage.trim() } : {}),
    ...(input?.local !== undefined ? { local: input.local } : {}),
  };
}

function normalizeProviderLifecycleControls(input: CliRuntimeLifecycleDescriptor): LocalRuntimeProviderLifecycleControls {
  const start = normalizeProviderLifecycleAction("start", input.start);
  const stop = normalizeProviderLifecycleAction("stop", input.stop);
  const restart = normalizeProviderLifecycleAction("restart", input.restart);
  return {
    schemaVersion: "ambient-local-runtime-provider-lifecycle-v1",
    providerKind: "ambient-cli",
    ...(start ? { start } : {}),
    ...(stop ? { stop } : {}),
    ...(restart ? { restart } : {}),
  };
}

function normalizeProviderLifecycleAction(
  kind: LocalRuntimeProviderLifecycleActionKind,
  input: CliRuntimeLifecycleActionDescriptor | undefined,
): LocalRuntimeProviderLifecycleControls[LocalRuntimeProviderLifecycleActionKind] | undefined {
  if (!input) return undefined;
  const command = input?.command.trim();
  if (!command) return undefined;
  return {
    schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1",
    kind,
    providerKind: "ambient-cli",
    command,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
  };
}

function normalizeVoiceDiscoveryMetadata(
  input: NonNullable<NonNullable<CliCommandDescriptor["voiceProvider"]>["voiceDiscovery"]>,
): VoiceProviderDiscoveryMetadata {
  return {
    command: input.command.trim(),
    ...(input.cacheTtlSeconds !== undefined ? { cacheTtlSeconds: input.cacheTtlSeconds } : {}),
    ...(input.requiresNetwork !== undefined ? { requiresNetwork: input.requiresNetwork } : {}),
    ...(input.requiresSecret?.length ? { requiresSecret: input.requiresSecret.map((name) => name.trim()).filter(Boolean) } : {}),
    ...(input.source ? { source: input.source } : {}),
  };
}

function normalizeVoiceCloningMetadata(
  input: NonNullable<NonNullable<CliCommandDescriptor["voiceProvider"]>["voiceCloning"]>,
): VoiceProviderCloningMetadata {
  return {
    supported: input.supported,
    ...(input.createCommand?.trim() ? { createCommand: input.createCommand.trim() } : {}),
    ...(input.statusCommand?.trim() ? { statusCommand: input.statusCommand.trim() } : {}),
    ...(input.deleteCommand?.trim() ? { deleteCommand: input.deleteCommand.trim() } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.inputs
      ? {
          inputs: {
            audioFormats: Array.from(
              new Set((input.inputs.audioFormats ?? []).map((format) => format.trim().replace(/^\./, "").toLowerCase()).filter(Boolean)),
            ),
            ...(input.inputs.minDurationSeconds !== undefined ? { minDurationSeconds: input.inputs.minDurationSeconds } : {}),
            ...(input.inputs.maxDurationSeconds !== undefined ? { maxDurationSeconds: input.inputs.maxDurationSeconds } : {}),
            ...(input.inputs.minSamples !== undefined ? { minSamples: input.inputs.minSamples } : {}),
            ...(input.inputs.maxSamples !== undefined ? { maxSamples: input.inputs.maxSamples } : {}),
            ...(input.inputs.transcript ? { transcript: input.inputs.transcript } : {}),
          },
        }
      : {}),
    requiresConsent: input.requiresConsent ?? true,
    ...(input.requiresSecret?.length ? { requiresSecret: input.requiresSecret.map((name) => name.trim()).filter(Boolean) } : {}),
    ...(input.networkHosts?.length ? { networkHosts: input.networkHosts.map((host) => host.trim()).filter(Boolean) } : {}),
    ...(input.costNote?.trim() ? { costNote: input.costNote.trim() } : {}),
    ...(input.privacyNote?.trim() ? { privacyNote: input.privacyNote.trim() } : {}),
    ...(input.output
      ? {
          output: {
            creates: Array.from(new Set(input.output.creates ?? [])),
            ...(input.output.appearsInDynamicCatalog !== undefined
              ? { appearsInDynamicCatalog: input.output.appearsInDynamicCatalog }
              : {}),
          },
        }
      : {}),
  };
}
