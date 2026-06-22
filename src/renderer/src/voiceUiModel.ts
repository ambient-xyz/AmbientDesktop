import type { MessageVoiceState, VoiceProviderCandidate, VoiceProviderRuntimeState, VoiceSettings, VoiceSettingsAuditEntry } from "../../shared/localRuntimeTypes";
import type { ChatMessage } from "../../shared/threadTypes";

export interface MessageVoiceStripModel {
  statusLabel: string;
  sourceLabel: string;
  diagnostic?: VoiceRunDiagnostic;
  detailParts: string[];
  canPlay: boolean;
  canInspect: boolean;
  inspectRows: Array<{ label: string; value: string }>;
  spokenTextPreview?: string;
  canRevealArtifact: boolean;
  canClearArtifact: boolean;
  canRegenerate: boolean;
  regenerateLabel?: string;
  audioKey?: string;
}

export type VoiceProviderLabelMap = Record<string, string>;

export interface VoiceAutoplayCursor {
  initialized: boolean;
  lastKey?: string;
}

export interface VoiceAutoplayDecision {
  next: VoiceAutoplayCursor;
  autoplayKey?: string;
}

export interface VoiceSettingsProviderModel {
  selectedProvider?: VoiceProviderCandidate;
  selectedVoiceId: string;
  selectedFormat: VoiceSettings["format"];
  enabledChecked: boolean;
  enableDisabled: boolean;
  autoplayChecked: boolean;
  autoplayDisabled: boolean;
  statusLabel: string;
  runtimeState: VoiceProviderRuntimeStateModel;
  availabilityMessage?: string;
  diagnostics?: VoiceProviderDiagnosticsModel;
}

export type VoiceProviderRuntimeStateStatus = "not-configured" | "off" | "ready" | "running" | "stopped" | "unavailable";

export interface VoiceProviderRuntimeStateModel {
  status: VoiceProviderRuntimeStateStatus;
  label: string;
  detail: string;
  tone: "success" | "warning" | "info";
}

export interface VoiceProviderDiagnosticsModel {
  statusLabel: string;
  statusTone: "success" | "error" | "info";
  commandLabel?: string;
  cwdLabel?: string;
  errorLabel?: string;
  cacheLabel?: string;
  runtimeLabels?: string[];
  artifactLabels: string[];
  missingHints: string[];
}

export interface VoiceThreadStatusModel {
  visible: boolean;
  tone: "ready" | "warning" | "muted" | "idle";
  label: string;
  detail: string;
  counts: {
    ready: number;
    failed: number;
    skipped: number;
    canceled: number;
    queued: number;
    synthesizing: number;
  };
  settingsRouteLabel: string;
}

export interface VoiceSettingsAuditRow {
  id: string;
  createdAt: string;
  sourceLabel: string;
  summary: string;
  detail: string;
}

export type VoiceRunDiagnosticCause =
  | "settings-disabled"
  | "provider-unavailable"
  | "long-reply-policy"
  | "missing-artifact"
  | "synthesis-failure"
  | "artifact-cleared"
  | "queued"
  | "ready"
  | "not-configured"
  | "unknown";

export interface VoiceRunDiagnostic {
  cause: VoiceRunDiagnosticCause;
  label: string;
  detail: string;
  tone: "ready" | "warning" | "muted" | "idle";
}

export function voiceProviderLabelForCapabilityId(
  providerCapabilityId: string | undefined,
  providerLabels: VoiceProviderLabelMap = {},
): string | undefined {
  const capabilityId = providerCapabilityId?.trim();
  if (!capabilityId) return undefined;
  const discoveredLabel = providerLabels[capabilityId]?.trim();
  if (discoveredLabel) return discoveredLabel;
  const parts = capabilityId.split(":").map((part) => part.trim()).filter(Boolean);
  const toolIndex = parts.indexOf("tool");
  const rawName = toolIndex >= 0 && parts[toolIndex + 1] ? parts[toolIndex + 1] : parts[parts.length - 1] ?? capabilityId;
  const cleaned = rawName
    .replace(/^(pkg|package|ambient-cli)[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\btts\b/gi, "TTS")
    .replace(/\bcli\b/gi, "CLI")
    .trim();
  if (!cleaned) return capabilityId;
  return cleaned
    .split(" ")
    .map((word) => (word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function voiceProviderLabelMap(providers: VoiceProviderCandidate[]): VoiceProviderLabelMap {
  const entries = providers.flatMap((provider) => {
    const label = provider.label || `${provider.packageName} ${provider.command}`;
    return voiceProviderCapabilityAliases(provider).map((capabilityId) => [capabilityId, label]);
  });
  return Object.fromEntries(entries);
}

export function voiceProviderCacheChanges(previous: VoiceProviderCandidate[], next: VoiceProviderCandidate[]): string[] {
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
  }
  for (const provider of previous) {
    if (nextById.has(provider.capabilityId)) continue;
    const label = provider.label || `${provider.packageName} ${provider.command}`;
    changes.push(`${label} removed`);
  }
  return changes.slice(0, 4);
}

export function voiceProviderCapabilityAliases(provider: VoiceProviderCandidate): string[] {
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

export function voiceProviderForCapabilityId(
  providers: VoiceProviderCandidate[],
  providerCapabilityId: string | undefined,
): VoiceProviderCandidate | undefined {
  if (!providerCapabilityId) return undefined;
  return providers.find((provider) => voiceProviderCapabilityAliases(provider).includes(providerCapabilityId));
}

export function messageVoiceStripModel(
  voiceState: MessageVoiceState,
  input: { providerLabels?: VoiceProviderLabelMap } = {},
): MessageVoiceStripModel {
  const status = voiceState.status;
  const sourceLabel = voiceState.source === "summary" ? "spoken summary" : "assistant text";
  const providerLabel = voiceProviderLabelForCapabilityId(voiceState.providerCapabilityId, input.providerLabels);
  const routineCacheCleanup = isRoutineVoiceArtifactCleanupCancellation(voiceState);
  const statusLabel =
    status === "queued"
      ? voiceState.source === "summary"
        ? "Summary queued"
        : "Voice queued"
      : status === "skipped"
        ? "Voice skipped"
        : status === "failed"
          ? "Voice failed"
          : status === "ready"
            ? "Voice ready"
            : status === "synthesizing"
              ? "Synthesizing voice"
              : routineCacheCleanup
                ? "Audio cache cleared"
              : `Voice ${status}`;
  const diagnostic = voiceRunDiagnosticForState(voiceState);
  const detailParts = [
    sourceLabel,
    `${voiceState.sourceTextChars.toLocaleString()} source chars`,
    voiceState.spokenTextChars > 0 ? `${voiceState.spokenTextChars.toLocaleString()} spoken chars` : "",
    providerLabel ? `provider ${providerLabel}` : "",
    diagnostic ? diagnostic.label : "",
  ].filter(Boolean);
  const canPlay = status === "ready" && Boolean(voiceState.mediaUrl);
  const artifactPath = voiceState.audioPath ?? voiceState.lastAudioPath;
  const spokenTextPreview = voiceState.spokenText?.trim();
  const inspectRows = [
    { label: "Source", value: sourceLabel },
    { label: "Source length", value: `${voiceState.sourceTextChars.toLocaleString()} chars` },
    voiceState.spokenTextChars > 0 ? { label: "Spoken length", value: `${voiceState.spokenTextChars.toLocaleString()} chars` } : undefined,
    providerLabel ? { label: "Provider", value: providerLabel } : undefined,
    voiceState.providerCapabilityId && providerLabel !== voiceState.providerCapabilityId ? { label: "Provider ID", value: voiceState.providerCapabilityId } : undefined,
    voiceState.voiceId ? { label: "Voice", value: voiceState.voiceId } : undefined,
    diagnostic ? { label: "Voice diagnostic", value: diagnostic.label } : undefined,
    diagnostic ? { label: "Diagnostic detail", value: diagnostic.detail } : undefined,
    voiceState.error ? { label: "Provider error", value: voiceState.error } : undefined,
    artifactPath ? { label: voiceState.audioPath ? "Artifact path" : "Last artifact path", value: artifactPath } : undefined,
    voiceState.mimeType ? { label: "MIME type", value: voiceState.mimeType } : undefined,
    voiceState.durationMs ? { label: "Duration", value: `${Math.round(voiceState.durationMs).toLocaleString()} ms` } : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row));
  const canRevealArtifact = Boolean(voiceState.audioPath);
  const canClearArtifact = Boolean(voiceState.audioPath);
  const canRegenerate = status === "failed" || status === "ready" || status === "skipped" || status === "canceled";
  const canInspect = inspectRows.length > 0 || Boolean(spokenTextPreview);
  return {
    statusLabel,
    sourceLabel,
    ...(diagnostic ? { diagnostic } : {}),
    detailParts,
    canPlay,
    canInspect,
    inspectRows,
    spokenTextPreview,
    canRevealArtifact,
    canClearArtifact,
    canRegenerate,
    regenerateLabel: canRegenerate ? (status === "ready" ? "Regenerate voice" : "Retry voice synthesis") : undefined,
    audioKey: canPlay ? `${voiceState.audioPath ?? voiceState.mediaUrl}:${voiceState.updatedAt}` : undefined,
  };
}

export function voiceRunDiagnosticForState(voiceState: MessageVoiceState): VoiceRunDiagnostic | undefined {
  const error = voiceState.error?.trim();
  const normalizedError = error?.toLowerCase() ?? "";
  if (voiceState.status === "failed") {
    if (looksLikeProviderUnavailable(normalizedError)) {
      return {
        cause: "provider-unavailable",
        label: "Provider unavailable",
        detail: error ? `The selected TTS provider could not run: ${error}` : "The selected TTS provider is unavailable or failed its health check.",
        tone: "warning",
      };
    }
    if (looksLikeMissingArtifact(normalizedError)) {
      return {
        cause: "missing-artifact",
        label: "Missing audio artifact",
        detail: error ? `Voice synthesis did not produce a playable artifact: ${error}` : "Voice synthesis did not produce a playable artifact.",
        tone: "warning",
      };
    }
    return {
      cause: "synthesis-failure",
      label: "Synthesis failed",
      detail: error ? `The selected TTS provider returned an error: ${error}` : "The selected TTS provider returned an error during synthesis.",
      tone: "warning",
    };
  }
  if (voiceState.status === "skipped") {
    if (looksLikeLongReplyPolicy(normalizedError)) {
      return {
        cause: "long-reply-policy",
        label: "Skipped by long-reply policy",
        detail: error ? `The current voice policy skipped this reply: ${error}` : "The reply was outside the configured speaking policy.",
        tone: "muted",
      };
    }
    return {
      cause: "unknown",
      label: "Voice skipped",
      detail: error ? `Voice was skipped: ${error}` : "Voice was skipped before synthesis.",
      tone: "muted",
    };
  }
  if (voiceState.status === "canceled") {
    if (looksLikeVoiceArtifactCacheCleanup(normalizedError)) {
      return {
        cause: "artifact-cleared",
        label: "Cached audio cleared",
        detail: "Ambient removed this cached audio file during routine voice cache cleanup. This is not a synthesis failure; retry only if you want to regenerate playback.",
        tone: "muted",
      };
    }
    return {
      cause: "artifact-cleared",
      label: "Audio artifact cleared",
      detail: voiceState.lastAudioPath
        ? `The generated audio file was cleared; retry to synthesize it again. Last artifact: ${voiceState.lastAudioPath}`
        : "The generated audio file was cleared; retry to synthesize it again.",
      tone: "muted",
    };
  }
  if (voiceState.status === "ready" && (!voiceState.mediaUrl || !voiceState.audioPath)) {
    return {
      cause: "missing-artifact",
      label: "Missing playback artifact",
      detail: "Voice is marked ready, but the managed audio artifact is missing or has no playable media URL.",
      tone: "warning",
    };
  }
  if (voiceState.status === "queued" || voiceState.status === "synthesizing") {
    return {
      cause: "queued",
      label: voiceState.status === "queued" ? "Waiting for synthesis" : "Synthesis in progress",
      detail: "Ambient has selected text for voice and is waiting for the provider to produce audio.",
      tone: "idle",
    };
  }
  return undefined;
}

export function latestReadyVoiceAutoplayTarget(input: {
  messages: ChatMessage[];
  messageVoiceStates: Record<string, MessageVoiceState>;
  autoplay: boolean;
  providerCapabilityId?: string;
}): { messageId: string; key: string } | undefined {
  if (!input.autoplay) return undefined;
  const message = [...input.messages].reverse().find((candidate) => {
    const voiceState = input.messageVoiceStates[candidate.id];
    return (
      candidate.role === "assistant" &&
      voiceState?.status === "ready" &&
      Boolean(voiceState.mediaUrl) &&
      voiceStateMatchesSelectedProvider(voiceState, input.providerCapabilityId)
    );
  });
  if (!message) return undefined;
  const voiceState = input.messageVoiceStates[message.id];
  return { messageId: message.id, key: `${message.id}:${voiceState.updatedAt}:${voiceState.mediaUrl}` };
}

export function voiceStateMatchesSelectedProvider(voiceState: MessageVoiceState | undefined, providerCapabilityId?: string): boolean {
  if (!voiceState) return false;
  if (!providerCapabilityId) return true;
  return voiceState.providerCapabilityId === providerCapabilityId;
}

export function nextVoiceAutoplayDecision(cursor: VoiceAutoplayCursor, latestKey?: string): VoiceAutoplayDecision {
  if (!cursor.initialized) {
    return { next: { initialized: true, lastKey: latestKey } };
  }
  if (!latestKey) {
    return { next: { initialized: true, lastKey: cursor.lastKey } };
  }
  if (cursor.lastKey === latestKey) {
    return { next: { initialized: true, lastKey: cursor.lastKey } };
  }
  return { next: { initialized: true, lastKey: latestKey }, autoplayKey: latestKey };
}

export function voiceSettingsProviderModel(input: {
  providers: VoiceProviderCandidate[];
  settings: VoiceSettings;
}): VoiceSettingsProviderModel {
  const selectedProvider = input.providers.find((provider) => provider.capabilityId === input.settings.providerCapabilityId);
  const providerAvailable = Boolean(selectedProvider?.available);
  const preferredVoiceId = selectedProvider ? input.settings.preferredVoicesByProvider?.[selectedProvider.capabilityId] : undefined;
  const preferredVoice = preferredVoiceId ? selectedProvider?.voices.find((voice) => voice.id === preferredVoiceId) : undefined;
  const selectedVoiceId = input.settings.voiceId ?? preferredVoice?.id ?? preferredVoiceId ?? selectedProvider?.voices[0]?.id ?? "";
  const selectedFormat =
    selectedProvider?.formats.includes(input.settings.format) ? input.settings.format : selectedProvider?.format ?? input.settings.format;
  const enabledChecked = input.settings.enabled && providerAvailable;
  const autoplayChecked = input.settings.autoplay && providerAvailable;
  const runtimeState = voiceProviderRuntimeStateModel(input.settings, selectedProvider, providerAvailable);
  const statusLabel = enabledChecked
    ? selectedProvider?.label ?? "Assistant voice enabled"
    : selectedProvider
      ? runtimeState.status === "stopped" || runtimeState.status === "unavailable"
        ? runtimeState.label
        : providerAvailable
        ? "Voice off"
        : "Provider unavailable"
      : "Set up a provider first";
  return {
    ...(selectedProvider ? { selectedProvider } : {}),
    selectedVoiceId,
    selectedFormat,
    enabledChecked,
    enableDisabled: !providerAvailable,
    autoplayChecked,
    autoplayDisabled: !providerAvailable,
    statusLabel,
    runtimeState,
    ...(selectedProvider?.availabilityReason ? { availabilityMessage: selectedProvider.availabilityReason } : {}),
    ...(selectedProvider?.diagnostics ? { diagnostics: voiceProviderDiagnosticsModel(selectedProvider) } : {}),
  };
}

export function voiceProviderRuntimeStateModel(
  settings: VoiceSettings,
  selectedProvider: VoiceProviderCandidate | undefined,
  providerAvailable = Boolean(selectedProvider?.available),
): VoiceProviderRuntimeStateModel {
  if (!selectedProvider) {
    return {
      status: "not-configured",
      label: "No voice provider",
      detail: "No TTS provider is selected for assistant voice output.",
      tone: "info",
    };
  }
  const providerRuntime = selectedProvider.diagnostics?.runtimeState;
  if (providerRuntime?.status === "stopped") {
    return {
      status: "stopped",
      label: "Voice runtime stopped",
      detail: `${selectedProvider.label} reports a stopped local voice runtime. ${voiceProviderRuntimeInlineDetail(providerRuntime)}`.trim(),
      tone: "info",
    };
  }
  if (providerRuntime?.status === "unavailable") {
    return {
      status: "unavailable",
      label: "Voice runtime unavailable",
      detail: `${selectedProvider.label} reports its local voice runtime is unavailable. ${providerRuntime.reason ?? selectedProvider.availabilityReason}`.trim(),
      tone: "warning",
    };
  }
  if (!providerAvailable) {
    return {
      status: "unavailable",
      label: "Provider unavailable",
      detail: `${selectedProvider.label} is installed or selected but failed availability checks. ${selectedProvider.availabilityReason}`.trim(),
      tone: "warning",
    };
  }
  if (providerRuntime?.running) {
    return {
      status: "running",
      label: "Voice runtime running",
      detail: `${selectedProvider.label} reports a running local voice runtime. ${voiceProviderRuntimeInlineDetail(providerRuntime)}`.trim(),
      tone: "success",
    };
  }
  if (!settings.enabled) {
    const locality = selectedProvider.local ? "local " : selectedProvider.local === false ? "cloud " : "";
    return {
      status: "off",
      label: "Voice output off",
      detail: `${selectedProvider.label} is the selected ${locality}TTS provider, but Ambient will not synthesize assistant replies until voice output is enabled.`,
      tone: "info",
    };
  }
  return {
    status: "ready",
    label: selectedProvider.local ? "Local voice provider ready" : selectedProvider.local === false ? "Cloud voice provider ready" : "Voice provider ready",
    detail: `${selectedProvider.label} is selected and available for assistant voice synthesis.`,
    tone: "success",
  };
}

export function voiceSettingsAuditRows(entries: VoiceSettingsAuditEntry[], limit = 5): VoiceSettingsAuditRow[] {
  return entries.slice(0, Math.max(0, limit)).map((entry) => {
    const sourceLabel =
      entry.source === "chat-tool"
        ? entry.toolName
          ? `Chat tool ${entry.toolName}`
          : "Chat tool"
        : entry.source === "settings-ui"
          ? "Settings"
          : "Ambient";
    const detail = entry.changes.length
      ? entry.changes.map((change) => `${change.field}: ${change.previous ?? "unset"} -> ${change.next ?? "unset"}`).join("; ")
      : "No setting changes recorded.";
    return {
      id: entry.id,
      createdAt: entry.createdAt,
      sourceLabel,
      summary: entry.summary,
      detail,
    };
  });
}

export function voiceProviderDiagnosticsModel(provider: VoiceProviderCandidate): VoiceProviderDiagnosticsModel {
  const diagnostics = provider.diagnostics;
  const healthStatus = diagnostics?.healthStatus ?? "unknown";
  const statusLabel = healthStatus === "passed" ? "Health check passed" : healthStatus === "failed" ? "Health check failed" : "Health check not declared";
  const statusTone = healthStatus === "passed" ? "success" : healthStatus === "failed" ? "error" : "info";
  const artifactLabels = [
    diagnostics?.stdoutArtifactPath ? `stdout artifact ${diagnostics.stdoutArtifactPath}` : "",
    diagnostics?.stderrArtifactPath ? `stderr artifact ${diagnostics.stderrArtifactPath}` : "",
  ].filter(Boolean);
  const cacheLabel = diagnostics?.healthCheckedAt
    ? `Health checked ${diagnostics.healthCached ? "from cache" : "fresh"} at ${diagnostics.healthCheckedAt}${diagnostics.healthCacheAgeMs !== undefined ? ` (${diagnostics.healthCacheAgeMs} ms old)` : ""}`
    : undefined;
  const runtimeLabels = voiceProviderRuntimeLabels(diagnostics?.runtimeState);
  return {
    statusLabel,
    statusTone,
    ...(diagnostics?.healthCommand?.length ? { commandLabel: diagnostics.healthCommand.join(" ") } : {}),
    ...(diagnostics?.healthCwd ? { cwdLabel: diagnostics.healthCwd } : {}),
    ...(diagnostics?.healthError ? { errorLabel: diagnostics.healthError } : {}),
    ...(cacheLabel ? { cacheLabel } : {}),
    ...(runtimeLabels.length ? { runtimeLabels } : {}),
    artifactLabels,
    missingHints: diagnostics?.missingHints ?? [],
  };
}

function voiceProviderRuntimeInlineDetail(runtime: VoiceProviderRuntimeState): string {
  return [
    runtime.modelRuntimeId ? `runtime ${runtime.modelRuntimeId}` : undefined,
    runtime.endpoint ? `endpoint ${runtime.endpoint}` : undefined,
    runtime.pid !== undefined ? `pid ${runtime.pid}` : undefined,
    runtime.estimatedResidentMemoryBytes !== undefined ? `estimated ${formatBytes(runtime.estimatedResidentMemoryBytes)}` : undefined,
    runtime.reason,
  ].filter(Boolean).join("; ");
}

function voiceProviderRuntimeLabels(runtime: VoiceProviderRuntimeState | undefined): string[] {
  if (!runtime) return [];
  return [
    `Runtime state: ${runtime.status}`,
    runtime.modelRuntimeId ? `Runtime: ${runtime.modelRuntimeId}` : undefined,
    runtime.modelProfileId ? `Profile: ${runtime.modelProfileId}` : undefined,
    runtime.modelId ? `Model: ${runtime.modelId}` : undefined,
    runtime.endpoint ? `Endpoint: ${runtime.endpoint}` : undefined,
    runtime.pid !== undefined ? `PID: ${runtime.pid}` : undefined,
    runtime.estimatedResidentMemoryBytes !== undefined ? `Estimated RSS: ${formatBytes(runtime.estimatedResidentMemoryBytes)}` : undefined,
    runtime.actualResidentMemoryBytes !== undefined ? `Actual RSS: ${formatBytes(runtime.actualResidentMemoryBytes)}` : undefined,
    runtime.startedAt ? `Started: ${runtime.startedAt}` : undefined,
    runtime.lastHeartbeatAt ? `Heartbeat: ${runtime.lastHeartbeatAt}` : undefined,
    runtime.reason ? `Runtime detail: ${runtime.reason}` : undefined,
  ].filter((label): label is string => Boolean(label));
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  const mib = bytes / (1024 ** 2);
  return `${mib.toFixed(0)} MiB`;
}

export function voiceThreadStatusModel(input: {
  settings: VoiceSettings;
  messageVoiceStates: Record<string, MessageVoiceState>;
  providerLabels?: VoiceProviderLabelMap;
  providerLabel?: string;
  selectedProvider?: VoiceProviderCandidate;
}): VoiceThreadStatusModel {
  const states = Object.values(input.messageVoiceStates);
  const statusStates = states.filter((state) => !isRoutineVoiceArtifactCleanupCancellation(state));
  const selectedProviderStates = input.settings.providerCapabilityId
    ? statusStates.filter((state) => state.providerCapabilityId === input.settings.providerCapabilityId)
    : statusStates;
  const counts = {
    ready: selectedProviderStates.filter((state) => state.status === "ready").length,
    failed: selectedProviderStates.filter((state) => state.status === "failed").length,
    skipped: selectedProviderStates.filter((state) => state.status === "skipped").length,
    canceled: selectedProviderStates.filter((state) => state.status === "canceled").length,
    queued: selectedProviderStates.filter((state) => state.status === "queued").length,
    synthesizing: selectedProviderStates.filter((state) => state.status === "synthesizing").length,
  };
  const total = selectedProviderStates.length;
  const providerLabel =
    input.selectedProvider?.label ??
    input.providerLabel ??
    voiceProviderLabelForCapabilityId(input.settings.providerCapabilityId, input.providerLabels) ??
    (input.settings.providerCapabilityId ? "selected provider" : "no provider");
  const priorityDiagnostic = selectedProviderStates
    .map((state) => voiceRunDiagnosticForState(state))
    .filter((diagnostic): diagnostic is VoiceRunDiagnostic => Boolean(diagnostic))
    .sort((a, b) => diagnosticPriority(b.cause) - diagnosticPriority(a.cause))[0];

  if (!input.settings.providerCapabilityId) {
    return {
      visible: total > 0,
      tone: "muted",
      label: "Voice not set up",
      detail: "Select a TTS provider to enable spoken assistant replies.",
      counts,
      settingsRouteLabel: "Voice settings",
    };
  }
  if (!input.settings.enabled) {
    return {
      visible: true,
      tone: "muted",
      label: "Voice off",
      detail: `${providerLabel} selected; assistant voice is disabled.`,
      counts,
      settingsRouteLabel: "Voice settings",
    };
  }
  if (input.selectedProvider && !input.selectedProvider.available) {
    const reason =
      input.selectedProvider.availabilityReason ??
      input.selectedProvider.diagnostics?.healthError ??
      "The selected TTS provider is installed but failed availability checks.";
    return {
      visible: true,
      tone: "warning",
      label: "Voice provider unavailable",
      detail: `${providerLabel} cannot synthesize new voice right now. ${reason}`,
      counts,
      settingsRouteLabel: "Voice diagnostics",
    };
  }
  if (counts.failed > 0) {
    return {
      visible: true,
      tone: "warning",
      label: "Voice needs attention",
      detail: priorityDiagnostic
        ? `${counts.failed.toLocaleString()} failed voice ${plural(counts.failed, "artifact")} in this thread. Reason: ${priorityDiagnostic.label}.`
        : `${counts.failed.toLocaleString()} failed voice ${plural(counts.failed, "artifact")} in this thread.`,
      counts,
      settingsRouteLabel: "Voice diagnostics",
    };
  }
  if (counts.queued > 0 || counts.synthesizing > 0) {
    const activeCount = counts.queued + counts.synthesizing;
    return {
      visible: true,
      tone: "idle",
      label: "Voice processing",
      detail: `${activeCount.toLocaleString()} voice ${plural(activeCount, "artifact")} queued or synthesizing with ${providerLabel}.`,
      counts,
      settingsRouteLabel: "Voice settings",
    };
  }
  if (counts.ready > 0) {
    return {
      visible: false,
      tone: "ready",
      label: "Voice ready",
      detail: `${counts.ready.toLocaleString()} ready voice ${plural(counts.ready, "artifact")} for ${providerLabel}.`,
      counts,
      settingsRouteLabel: counts.canceled > 0 || counts.skipped > 0 ? "Voice cleanup" : "Voice settings",
    };
  }
  if (total > 0) {
    return {
      visible: true,
      tone: "idle",
      label: "Voice tracked",
      detail: priorityDiagnostic
        ? `${total.toLocaleString()} voice ${plural(total, "state")} tracked; none ready for the selected provider. Reason: ${priorityDiagnostic.label}.`
        : `${total.toLocaleString()} voice ${plural(total, "state")} tracked; none ready for the selected provider.`,
      counts,
      settingsRouteLabel: "Voice cleanup",
    };
  }
  return {
    visible: true,
    tone: "idle",
    label: "Voice enabled",
    detail: `New assistant replies will use ${providerLabel}.`,
    counts,
    settingsRouteLabel: "Voice settings",
  };
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function looksLikeProviderUnavailable(normalizedError: string): boolean {
  return /provider unavailable|health check|model file missing|model missing|missing model|not installed|command not found|enoent|permission denied|unable to find voice/.test(
    normalizedError,
  );
}

function looksLikeLongReplyPolicy(normalizedError: string): boolean {
  return /long[- ]reply|too long|max chars|maximum characters|outside.*policy|policy.*skip|skipped.*policy/.test(normalizedError);
}

function looksLikeMissingArtifact(normalizedError: string): boolean {
  return /missing artifact|no audio|did not produce|output.*missing|artifact.*missing|empty output|unsupported.*extension/.test(normalizedError);
}

function looksLikeVoiceArtifactCacheCleanup(normalizedError: string): boolean {
  return /voice artifact cache (cleared|removed|limit removed)/.test(normalizedError);
}

function isRoutineVoiceArtifactCleanupCancellation(voiceState: MessageVoiceState): boolean {
  return voiceState.status === "canceled" && looksLikeVoiceArtifactCacheCleanup(voiceState.error?.toLowerCase() ?? "");
}

function diagnosticPriority(cause: VoiceRunDiagnosticCause): number {
  switch (cause) {
    case "provider-unavailable":
      return 100;
    case "synthesis-failure":
      return 90;
    case "missing-artifact":
      return 80;
    case "long-reply-policy":
      return 70;
    case "artifact-cleared":
      return 60;
    case "settings-disabled":
    case "not-configured":
      return 50;
    case "queued":
      return 20;
    case "ready":
      return 10;
    case "unknown":
      return 1;
  }
}
