import type { EmbeddingProviderCandidate, SttProviderCandidate, VoiceProviderCandidate } from "../../shared/localRuntimeTypes";
import type { AmbientCliPackageCatalog } from "./ambientCliPackageTypes";
import {
  ambientCliCommandHealth,
  ambientCliEmbeddingProviderAvailabilityReason,
  ambientCliEmbeddingProviderDiagnostics,
  ambientCliEmbeddingProviderHealthPayload,
  ambientCliProviderLifecycleWithPackage,
  ambientCliSttProviderAvailabilityReason,
  ambientCliSttProviderDiagnostics,
  ambientCliSttProviderHealthPayload,
  ambientCliVoiceProviderAvailabilityReason,
  ambientCliVoiceProviderDiagnostics,
  ambientCliVoiceProviderHealthPayload,
  providerFallbackLabel,
  voiceProviderFallbackLabel,
} from "./ambientCliProviderDiagnostics";
import { ambientCliCapabilityId } from "./ambientCliPackageTypes";
export {
  normalizeEmbeddingProviderCommandMetadata,
  normalizeSttProviderCommandMetadata,
  normalizeVoiceProviderCommandMetadata,
  validateCliProviderLifecycleCommands,
} from "./ambientCliPackageProviderNormalization";

export function ambientCliVoiceProvidersFromCatalog(catalog: AmbientCliPackageCatalog): VoiceProviderCandidate[] {
  return catalog.packages.flatMap((pkg) => {
    return pkg.commands.flatMap((command) => {
      if (!command.voiceProvider) return [];
      const capabilityId = ambientCliCapabilityId(pkg.id, "tool", command.name);
      const health = ambientCliCommandHealth(pkg, command);
      const healthPayload = ambientCliVoiceProviderHealthPayload(pkg, command);
      const availabilityReason = ambientCliVoiceProviderAvailabilityReason(pkg, command);
      const diagnostics = ambientCliVoiceProviderDiagnostics(pkg, command);
      const providerLifecycle = command.voiceProvider.runtimeLifecycle
        ? ambientCliProviderLifecycleWithPackage(command.voiceProvider.runtimeLifecycle, pkg)
        : undefined;
      return [
        {
          packageId: pkg.id,
          packageName: pkg.name,
          command: command.name,
          capabilityId,
          providerId: capabilityId,
          label: command.voiceProvider.label ?? voiceProviderFallbackLabel(pkg.name, command.name),
          ...(command.description ? { description: command.description } : {}),
          format: command.voiceProvider.defaultFormat,
          formats: command.voiceProvider.formats,
          voices: command.voiceProvider.voices,
          ...(command.voiceProvider.local !== undefined ? { local: command.voiceProvider.local } : {}),
          ...(command.voiceProvider.voiceDiscovery ? { voiceDiscovery: command.voiceProvider.voiceDiscovery } : {}),
          ...(command.voiceProvider.voiceCloning ? { voiceCloning: command.voiceProvider.voiceCloning } : {}),
          ...(providerLifecycle ? { providerLifecycle } : {}),
          installed: pkg.installed,
          available: pkg.errors.length === 0 && health !== "failed" && healthPayload?.available !== false,
          availabilityReason,
          diagnostics,
        },
      ];
    });
  });
}

export function ambientCliEmbeddingProvidersFromCatalog(catalog: AmbientCliPackageCatalog): EmbeddingProviderCandidate[] {
  return catalog.packages.flatMap((pkg) => {
    return pkg.commands.flatMap((command) => {
      if (!command.embeddingProvider) return [];
      const capabilityId = ambientCliCapabilityId(pkg.id, "tool", command.name);
      const health = ambientCliCommandHealth(pkg, command);
      const healthPayload = ambientCliEmbeddingProviderHealthPayload(pkg, command);
      const availabilityReason = ambientCliEmbeddingProviderAvailabilityReason(pkg, command);
      const diagnostics = ambientCliEmbeddingProviderDiagnostics(pkg, command);
      const providerLifecycle = command.embeddingProvider.runtimeLifecycle
        ? ambientCliProviderLifecycleWithPackage(command.embeddingProvider.runtimeLifecycle, pkg)
        : undefined;
      return [
        {
          packageId: pkg.id,
          packageName: pkg.name,
          command: command.name,
          capabilityId,
          providerId: capabilityId,
          label: command.embeddingProvider.label ?? providerFallbackLabel(pkg.name, command.name),
          ...(command.description ? { description: command.description } : {}),
          ...(command.embeddingProvider.modelId ? { modelId: command.embeddingProvider.modelId } : {}),
          ...(command.embeddingProvider.dimensions !== undefined ? { dimensions: command.embeddingProvider.dimensions } : {}),
          ...(command.embeddingProvider.local !== undefined ? { local: command.embeddingProvider.local } : {}),
          ...(providerLifecycle ? { providerLifecycle } : {}),
          installed: pkg.installed,
          available: pkg.errors.length === 0 && health !== "failed" && healthPayload?.available !== false,
          availabilityReason,
          diagnostics,
        },
      ];
    });
  });
}

export function ambientCliSttProvidersFromCatalog(catalog: AmbientCliPackageCatalog): SttProviderCandidate[] {
  return catalog.packages.flatMap((pkg) => {
    return pkg.commands.flatMap((command) => {
      if (!command.sttProvider) return [];
      const capabilityId = ambientCliCapabilityId(pkg.id, "tool", command.name);
      const health = ambientCliCommandHealth(pkg, command);
      const healthPayload = ambientCliSttProviderHealthPayload(pkg, command);
      const availabilityReason = ambientCliSttProviderAvailabilityReason(pkg, command);
      const diagnostics = ambientCliSttProviderDiagnostics(pkg, command);
      return [
        {
          packageId: pkg.id,
          packageName: pkg.name,
          command: command.name,
          capabilityId,
          providerId: capabilityId,
          label: command.sttProvider.label ?? providerFallbackLabel(pkg.name, command.name),
          ...(command.description ? { description: command.description } : {}),
          languages: command.sttProvider.languages,
          ...(command.sttProvider.defaultLanguage ? { defaultLanguage: command.sttProvider.defaultLanguage } : {}),
          ...(command.sttProvider.local !== undefined ? { local: command.sttProvider.local } : {}),
          installed: pkg.installed,
          available: pkg.errors.length === 0 && health !== "failed" && healthPayload?.available !== false,
          availabilityReason,
          diagnostics,
        },
      ];
    });
  });
}
