import { sttMessageMetadataFromTranscription, sttMessageMetadataFromUnknown } from "../../shared/sttMessageMetadata";
import type { SttDiagnosticSummary, SttMessageMetadata, SttProviderCandidate, SttProviderSetupAction, SttProviderSetupResult, SttProviderValidationMetadata, SttQueueState, SttSettings, SttTranscriptionState } from "../../shared/localRuntimeTypes";
import type { ChatMessage, MessageDelivery } from "../../shared/threadTypes";

export interface SttSettingsProviderModel {
  selectedProvider?: SttProviderCandidate;
  enabledChecked: boolean;
  enableDisabled: boolean;
  statusLabel: string;
  setupActions: SttProviderSetupActionModel[];
  availabilityMessage?: string;
  selectedLanguage: string;
  languageOptions: string[];
  diagnostics?: SttProviderDiagnosticsModel;
  validation?: SttValidationModel;
}

export interface SttProviderSetupActionModel {
  action: SttProviderSetupAction;
  label: string;
  title: string;
  icon: "install" | "repair" | "validate";
}

export interface SttProviderDiagnosticsModel {
  statusLabel: string;
  statusTone: "success" | "error" | "info";
  commandLabel?: string;
  cwdLabel?: string;
  errorLabel?: string;
  artifactLabels: string[];
  missingHints: string[];
}

export interface SttValidationModel {
  statusLabel: string;
  statusTone: "success" | "warning" | "error" | "info";
  detailLabels: string[];
  errorLabel?: string;
  missingHints: string[];
}

export interface SttSetupResultModel {
  statusLabel: string;
  statusTone: "success" | "warning" | "error" | "info";
  detailLabels: string[];
}

export interface SttDiagnosticRowModel {
  id: string;
  statusTone: "success" | "warning" | "error" | "info";
  title: string;
  createdLabel: string;
  detailLabels: string[];
}

export interface SttDraftMetadataState {
  content: string;
  metadata: SttMessageMetadata;
}

export type SttTranscriptReadyAction =
  | {
      kind: "insert";
      composerMessage: string;
    }
  | {
      kind: "send";
      content: string;
      delivery: MessageDelivery;
      metadata: SttMessageMetadata;
      composerMessage: string;
    };

export function sttTranscriptReadyAction(input: {
  autoSendAfterTranscription: boolean;
  running: boolean;
  text: string;
  transcription: SttTranscriptionState;
}): SttTranscriptReadyAction {
  if (!input.autoSendAfterTranscription) {
    return { kind: "insert", composerMessage: "Transcript inserted in composer." };
  }
  return {
    kind: "send",
    content: input.text,
    delivery: input.running ? "follow-up" : "prompt",
    metadata: sttMessageMetadataFromTranscription(input.transcription),
    composerMessage: input.running ? "Speech queued as follow-up." : "Speech sent.",
  };
}

export function sttInsertTranscriptIntoDraft(input: {
  currentDraft: string;
  text: string;
  transcription: SttTranscriptionState;
}): { draft: string; draftMetadata: SttDraftMetadataState } {
  const trimmed = input.currentDraft.trim();
  const draft = trimmed
    ? `${input.currentDraft}${input.currentDraft.endsWith(" ") || input.currentDraft.endsWith("\n") ? "" : "\n"}${input.text}`
    : input.text;
  return {
    draft,
    draftMetadata: {
      content: draft,
      metadata: sttMessageMetadataFromTranscription(input.transcription),
    },
  };
}

export function sttDraftMetadataForSubmit(input: {
  draft: string;
  content: string;
  draftMetadata?: SttDraftMetadataState;
}): SttMessageMetadata | undefined {
  return input.draftMetadata?.content.trim() === input.draft.trim() && input.content.trim() === input.draft.trim()
    ? input.draftMetadata.metadata
    : undefined;
}

export function sttRuntimeQueuedCount(queue: SttQueueState | undefined): number {
  if (!queue) return 0;
  return queue.queuedUtteranceIds.length + (queue.activeUtteranceId ? 1 : 0);
}

export function queuedSpeechFollowUpCount(messages: ChatMessage[]): number {
  return messages.filter((message) =>
    message.role === "user" &&
    message.metadata?.status === "queued" &&
    message.metadata?.delivery === "follow-up" &&
    Boolean(sttMessageMetadataFromUnknown(message.metadata?.stt)),
  ).length;
}

export function sttQueuedCountLabel(count: number): string | undefined {
  if (count <= 0) return undefined;
  return `${count.toLocaleString()} speech ${count === 1 ? "utterance" : "utterances"} queued`;
}

export function sttProviderCapabilityAliases(provider: SttProviderCandidate): string[] {
  return Array.from(
    new Set(
      [
        provider.capabilityId,
        provider.providerId,
        `ambient-cli:${provider.packageName}:tool:${provider.command}`,
        `${provider.packageId}:tool:${provider.command}`,
      ].filter(Boolean),
    ),
  );
}

export function sttProviderForCapabilityId(
  providers: SttProviderCandidate[],
  providerCapabilityId: string | undefined,
): SttProviderCandidate | undefined {
  if (!providerCapabilityId) return undefined;
  return providers.find((provider) => sttProviderCapabilityAliases(provider).includes(providerCapabilityId));
}

export function sttSettingsProviderModel(input: {
  providers: SttProviderCandidate[];
  settings: SttSettings;
}): SttSettingsProviderModel {
  const selectedProvider = sttProviderForCapabilityId(input.providers, input.settings.providerCapabilityId);
  const providerAvailable = Boolean(selectedProvider?.available);
  const languageOptions = normalizedLanguageOptions(selectedProvider);
  const selectedLanguage = languageOptions.includes(input.settings.spokenLanguage)
    ? input.settings.spokenLanguage
    : selectedProvider?.defaultLanguage ?? input.settings.spokenLanguage;
  const enabledChecked = input.settings.enabled && providerAvailable;
  const statusLabel = enabledChecked
    ? selectedProvider?.label ?? "Speech input enabled"
    : selectedProvider
      ? providerAvailable
        ? "Provider selected"
        : "Provider needs setup"
      : input.providers.length
        ? "Select a speech provider"
        : "Install Qwen3-ASR";
  return {
    ...(selectedProvider ? { selectedProvider } : {}),
    enabledChecked,
    enableDisabled: !providerAvailable,
    statusLabel,
    setupActions: sttProviderSetupActions({ providers: input.providers, selectedProvider }),
    selectedLanguage,
    languageOptions,
    ...(selectedProvider?.availabilityReason ? { availabilityMessage: selectedProvider.availabilityReason } : {}),
    ...(selectedProvider?.diagnostics ? { diagnostics: sttProviderDiagnosticsModel(selectedProvider) } : {}),
    ...(selectedProvider?.validation ? { validation: sttValidationModel(selectedProvider.validation) } : {}),
  };
}

function sttProviderSetupActions(input: {
  providers: SttProviderCandidate[];
  selectedProvider?: SttProviderCandidate;
}): SttProviderSetupActionModel[] {
  const hasProviderPackage = input.providers.length > 0;
  if (!hasProviderPackage) {
    return [
      {
        action: "install",
        label: "Install Qwen3-ASR",
        title: "Install the Qwen3-ASR speech provider package and runtime assets",
        icon: "install",
      },
    ];
  }

  const reinstall: SttProviderSetupActionModel = {
    action: "install",
    label: "Reinstall Qwen3-ASR",
    title: "Run the Qwen3-ASR install flow again for a clean provider/runtime setup",
    icon: "install",
  };
  const repair: SttProviderSetupActionModel = {
    action: "repair",
    label: "Repair Qwen3-ASR",
    title: "Repair the existing Qwen3-ASR package, runtime, and validation metadata",
    icon: "repair",
  };
  const validate: SttProviderSetupActionModel = {
    action: "validate",
    label: "Validate Qwen3-ASR",
    title: input.selectedProvider?.available
      ? "Validate the selected Qwen3-ASR provider"
      : "Check the selected Qwen3-ASR provider and show missing runtime or asset details",
    icon: "validate",
  };

  if (!input.selectedProvider) return [repair, reinstall];
  return input.selectedProvider.available ? [validate, repair, reinstall] : [repair, reinstall, validate];
}

export function sttProviderDiagnosticsModel(provider: SttProviderCandidate): SttProviderDiagnosticsModel {
  const diagnostics = provider.diagnostics;
  const healthStatus = diagnostics?.healthStatus ?? "unknown";
  const statusLabel =
    healthStatus === "passed"
      ? provider.available
        ? "Health check passed"
        : "Health check needs runtime"
      : healthStatus === "failed"
        ? "Health check failed"
        : "Health check not declared";
  const statusTone = healthStatus === "passed" ? (provider.available ? "success" : "info") : healthStatus === "failed" ? "error" : "info";
  const artifactLabels = [
    diagnostics?.stdoutArtifactPath ? `stdout artifact ${diagnostics.stdoutArtifactPath}` : "",
    diagnostics?.stderrArtifactPath ? `stderr artifact ${diagnostics.stderrArtifactPath}` : "",
  ].filter(Boolean);
  return {
    statusLabel,
    statusTone,
    ...(diagnostics?.healthCommand?.length ? { commandLabel: diagnostics.healthCommand.join(" ") } : {}),
    ...(diagnostics?.healthCwd ? { cwdLabel: diagnostics.healthCwd } : {}),
    ...(diagnostics?.healthError ? { errorLabel: diagnostics.healthError } : {}),
    artifactLabels,
    missingHints: diagnostics?.missingHints ?? [],
  };
}

export function sttValidationModel(validation: SttProviderValidationMetadata): SttValidationModel {
  const statusLabel =
    validation.status === "passed"
      ? "Validation passed"
      : validation.status === "runtime-ready"
        ? "Runtime ready"
        : validation.status === "needs-runtime"
          ? "Runtime missing"
          : validation.status === "failed"
            ? "Validation failed"
            : "Validation not run";
  const statusTone =
    validation.status === "passed"
      ? "success"
      : validation.status === "runtime-ready" || validation.status === "not-run"
        ? "info"
        : validation.status === "needs-runtime"
          ? "warning"
          : "error";
  const detailLabels = [
    validation.lane ? `Lane: ${validation.lane}` : "",
    validation.runtimeVersion ? `Runtime: ${validation.runtimeVersion}` : "",
    validation.binaryPath ? `Binary: ${validation.binaryPath}` : "",
    validation.model ? `Model: ${validation.model}` : "",
    validation.assetManifest ? `Assets: ${validation.assetManifest.model.id} @ ${validation.assetManifest.model.revision.slice(0, 8)}` : "",
    validation.assetManifest ? `Runtime downloads: ${validation.assetManifest.runtime.directDownloadsEnabled ? "enabled" : "disabled"}` : "",
    validation.validationTranscript ? `Transcript: ${validation.validationTranscript}` : "",
    validation.durationMs !== undefined ? `Elapsed: ${Math.round(validation.durationMs).toLocaleString()} ms` : "",
    validation.updatedAt ? `Updated: ${validation.updatedAt}` : "",
  ].filter(Boolean);
  return {
    statusLabel,
    statusTone,
    detailLabels,
    ...(validation.error ? { errorLabel: validation.error } : {}),
    missingHints: validation.missingHints,
  };
}

export function sttSetupResultModel(result: SttProviderSetupResult): SttSetupResultModel {
  const statusLabel =
    result.status === "ready"
      ? result.validation.status === "passed"
        ? "Qwen3-ASR validated"
        : "Qwen3-ASR runtime ready"
      : result.status === "needs-runtime"
        ? "Qwen3-ASR needs runtime"
        : result.status === "validation-failed"
          ? "Qwen3-ASR validation failed"
          : result.status === "failed"
            ? "Qwen3-ASR setup failed"
            : "Qwen3-ASR installed";
  const statusTone =
    result.status === "ready"
      ? "success"
      : result.status === "needs-runtime"
        ? "warning"
        : result.status === "validation-failed" || result.status === "failed"
          ? "error"
          : "info";
  const installed = result.installStatuses.find((status) => status.packageName === result.packageName);
  const detailLabels = [
    installed ? `Package: ${installed.status}` : "",
    result.runtimeInstall ? runtimeInstallLabel(result.runtimeInstall) : "",
    result.validation.runtimeVersion ? `Runtime: ${result.validation.runtimeVersion}` : "",
    result.validation.binaryPath ? `Binary: ${result.validation.binaryPath}` : "",
    result.validation.validationTranscript ? `Transcript: ${result.validation.validationTranscript}` : "",
    ...result.nextSteps,
  ].filter(Boolean);
  return { statusLabel, statusTone, detailLabels };
}

export function sttDiagnosticsModel(diagnostics: SttDiagnosticSummary[], limit = 5): SttDiagnosticRowModel[] {
  return diagnostics.slice(0, limit).map((diagnostic) => {
    if (diagnostic.kind === "setup") return sttSetupDiagnosticRow(diagnostic);
    return sttTranscriptionDiagnosticRow(diagnostic);
  });
}

function runtimeInstallLabel(runtimeInstall: SttProviderSetupResult["runtimeInstall"]): string {
  if (!runtimeInstall) return "";
  const manager = runtimeInstall.manager ? ` via ${runtimeInstall.manager}` : "";
  if (runtimeInstall.status === "already-installed") return `Runtime install: already installed${manager}`;
  if (runtimeInstall.status === "installed") return `Runtime install: installed${manager}`;
  if (runtimeInstall.status === "skipped") return `Runtime install: skipped${manager}`;
  if (runtimeInstall.status === "unsupported") return "Runtime install: unsupported on this platform";
  return `Runtime install: ${runtimeInstall.status}${manager}`;
}

function sttSetupDiagnosticRow(diagnostic: Extract<SttDiagnosticSummary, { kind: "setup" }>): SttDiagnosticRowModel {
  const statusTone =
    diagnostic.status === "ready" || diagnostic.status === "installed"
      ? "success"
      : diagnostic.status === "needs-runtime"
        ? "warning"
        : "error";
  const detailLabels = [
    `Action: ${diagnostic.action}`,
    `Elapsed: ${Math.round(diagnostic.durationMs).toLocaleString()} ms`,
    diagnostic.lane ? `Lane: ${diagnostic.lane}` : "",
    diagnostic.runtimeVersion ? `Runtime: ${diagnostic.runtimeVersion}` : "",
    diagnostic.model ? `Model: ${diagnostic.model}` : "",
    diagnostic.assetManifestVersion ? `Assets: ${diagnostic.assetManifestVersion}` : "",
    diagnostic.runtimeInstallStatus ? `Runtime install: ${diagnostic.runtimeInstallStatus}` : "",
    diagnostic.errorCategory ? `Error category: ${diagnostic.errorCategory}` : "",
    diagnostic.missingHintCount ? `${diagnostic.missingHintCount.toLocaleString()} setup hint${diagnostic.missingHintCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return {
    id: diagnostic.id,
    statusTone,
    title: `STT setup ${diagnostic.status}`,
    createdLabel: diagnostic.createdAt,
    detailLabels,
  };
}

function sttTranscriptionDiagnosticRow(diagnostic: Extract<SttDiagnosticSummary, { kind: "transcription" }>): SttDiagnosticRowModel {
  const statusTone =
    diagnostic.status === "ready"
      ? "success"
      : diagnostic.status === "no-speech"
        ? "warning"
        : diagnostic.status === "failed"
          ? "error"
          : "info";
  const detailLabels = [
    `Elapsed: ${Math.round(diagnostic.transcriptionElapsedMs).toLocaleString()} ms`,
    diagnostic.audioDurationMs !== undefined ? `Audio: ${(diagnostic.audioDurationMs / 1000).toFixed(1)}s` : "",
    diagnostic.providerId ? `Provider: ${diagnostic.providerId}` : "",
    diagnostic.language ? `Language: ${diagnostic.language}` : "",
    diagnostic.transcriptChars !== undefined ? `Transcript: ${diagnostic.transcriptChars.toLocaleString()} chars` : "",
    diagnostic.noSpeechGate
      ? `No-speech gate: ${diagnostic.noSpeechGate.skipped ? "skipped" : "passed"}${diagnostic.noSpeechGate.rmsDbfs !== undefined ? ` · ${diagnostic.noSpeechGate.rmsDbfs} dBFS` : ""}`
      : "",
    diagnostic.queuePhase ? `Queue: ${diagnostic.queuePhase}` : "",
    diagnostic.errorCategory ? `Error category: ${diagnostic.errorCategory}` : "",
  ].filter(Boolean);
  return {
    id: diagnostic.id,
    statusTone,
    title: `STT transcription ${diagnostic.status}`,
    createdLabel: diagnostic.createdAt,
    detailLabels,
  };
}

export function sttProviderCacheChanges(previous: SttProviderCandidate[], next: SttProviderCandidate[]): string[] {
  const previousById = new Map(previous.map((provider) => [provider.capabilityId, provider]));
  const nextById = new Map(next.map((provider) => [provider.capabilityId, provider]));
  const changes: string[] = [];
  for (const provider of next) {
    const previousProvider = previousById.get(provider.capabilityId);
    const label = provider.label || `${provider.packageName} ${provider.command}`;
    if (!previousProvider) {
      changes.push(`${label} added ${provider.available ? "available" : "unavailable"}`);
      continue;
    }
    if (previousProvider.available !== provider.available) {
      changes.push(`${label} became ${provider.available ? "available" : "unavailable"}`);
    }
    if (previousProvider.validation?.status !== provider.validation?.status && provider.validation?.status) {
      changes.push(`${label} validation ${provider.validation.status}`);
    }
  }
  for (const provider of previous) {
    if (nextById.has(provider.capabilityId)) continue;
    const label = provider.label || `${provider.packageName} ${provider.command}`;
    changes.push(`${label} removed`);
  }
  return changes;
}

function normalizedLanguageOptions(provider: SttProviderCandidate | undefined): string[] {
  const options = provider?.languages?.length ? provider.languages : provider?.defaultLanguage ? [provider.defaultLanguage] : ["English"];
  const deduped = Array.from(new Set(options.map((language) => language.trim()).filter(Boolean)));
  return deduped.length ? deduped : ["English"];
}
