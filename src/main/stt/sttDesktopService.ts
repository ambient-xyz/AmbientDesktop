import type { DesktopEvent, UpdateSttSettingsInput } from "../../shared/desktopTypes";
import type {
  SetSttTtsSpeakingInput,
  SttDiagnosticSummary,
  SttProviderCandidate,
  SttProviderSetupInput,
  SttProviderSetupResult,
  SttProviderValidationMetadata,
  SttQueueState,
  SttSettings,
  SttTranscribeAudioInput,
  SttTranscribeAudioResult,
  SttTranscriptionState,
} from "../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { discoverAmbientCliSttProviders } from "../ambient-cli/ambientCliPackages";
import {
  mergeSttProvidersWithValidation,
  readQwen3AsrValidationMetadata,
  setupQwen3AsrProvider,
  type SetupQwen3AsrProviderOptions,
} from "./sttProviderInstaller";
import { SttDiagnosticRecorder, sttSetupDiagnosticSummary, sttTranscriptionDiagnosticSummary } from "./sttDiagnostics";
import type { AmbientCliSttRunner } from "./sttProvider";
import { SttRuntime, type SttRuntimeOptions } from "./sttRuntime";

export interface SttDesktopStore {
  getThread(threadId: string): ThreadSummary;
  listActiveRuns(): Array<{ threadId: string; status: string }>;
}

export interface SttDesktopHost<Store extends SttDesktopStore = SttDesktopStore> {
  workspacePath: string;
  store: Store;
}

export interface VoiceSttDesktopContext<
  Host extends SttDesktopHost<Store>,
  Store extends SttDesktopStore,
> {
  host: Host;
  targetStore: Store;
  threadId: string;
  thread: ThreadSummary;
  workspacePath: string;
}

export interface SttDesktopRuntime {
  cancelTranscription(reason?: string): SttQueueState;
  dispose(reason?: string): SttQueueState;
  drainReadyToSend(): SttTranscriptionState[];
  enqueueUtterance(input: { threadId: string; utteranceId: string; audioPath: string }): Promise<SttTranscriptionState>;
  getQueueState(): SttQueueState;
  setAgentRunning(running: boolean): SttQueueState;
  setTtsSpeaking(speaking: boolean): SttQueueState;
  updateSettings(settings: SttSettings): void;
}

export interface SttDesktopDiagnostics {
  list(workspacePath: string): SttDiagnosticSummary[];
  record(workspacePath: string, diagnostic: SttDiagnosticSummary): Promise<SttDiagnosticSummary[]>;
}

export interface SttDesktopServiceDependencies<
  Host extends SttDesktopHost<Store>,
  Store extends SttDesktopStore,
> {
  activeProjectRuntimeHost(): Host;
  activeThreadIdForHost(host: Host): string;
  activeWorkspacePath(): string;
  emitDesktopState(): void;
  emitDesktopEvent(event: DesktopEvent): void;
  emitRuntimeFeatureStateUpdated(targetStore: Store): void;
  getSttSettings(): SttSettings;
  normalizeWorkspacePath(workspacePath: string): string;
  requireProjectRuntimeHostForThread(threadId: string): Host;
  runner: AmbientCliSttRunner;
  setSttSettings(settings: SttSettings): void;
  settingsPath(): string;
  writeSttSettings(path: string, settings: SttSettings): Promise<void>;
  diagnostics?: SttDesktopDiagnostics;
  env?: Record<string, string | undefined>;
  nowMs?: () => number;
  providers?: {
    discoverAmbientCliSttProviders(workspacePath: string): Promise<SttProviderCandidate[]>;
    mergeSttProvidersWithValidation(
      providers: SttProviderCandidate[],
      validation: SttProviderValidationMetadata | undefined,
    ): SttProviderCandidate[];
    readQwen3AsrValidationMetadata(workspacePath: string): Promise<SttProviderValidationMetadata | undefined>;
    setupQwen3AsrProvider(
      workspacePath: string,
      input: SttProviderSetupInput,
      options: SetupQwen3AsrProviderOptions,
    ): Promise<SttProviderSetupResult>;
  };
  runtimeFactory?: (options: SttRuntimeOptions) => SttDesktopRuntime;
  setupDiagnosticSummary?: typeof sttSetupDiagnosticSummary;
  transcriptionDiagnosticSummary?: typeof sttTranscriptionDiagnosticSummary;
}

export interface SttDesktopService<
  Host extends SttDesktopHost<Store>,
  Store extends SttDesktopStore,
> {
  activeVoiceSttContextForProjectHost(host?: Host): VoiceSttDesktopContext<Host, Store>;
  cancelSttTranscription(workspacePath?: string): Promise<SttQueueState>;
  clearSttRuntimes(): void;
  currentSttQueueState(workspacePath?: string): SttQueueState;
  disposeSttRuntimeForWorkspace(workspacePath: string, reason: string): void;
  listSttDiagnostics(workspacePath: string): SttDiagnosticSummary[];
  listSttProvidersWithValidation(workspacePath?: string): Promise<SttProviderCandidate[]>;
  setSttTtsSpeaking(input: SetSttTtsSpeakingInput, workspacePath?: string): Promise<SttQueueState>;
  setupSttProvider(
    input: SttProviderSetupInput,
    context?: VoiceSttDesktopContext<Host, Store>,
  ): Promise<SttProviderSetupResult>;
  transcribeSttAudio(input: SttTranscribeAudioInput, host?: Host): Promise<SttTranscribeAudioResult>;
  updateSttSettings(input: UpdateSttSettingsInput, options?: { onStateUpdated?: () => void }): Promise<SttSettings>;
}

export function createSttDesktopService<
  Host extends SttDesktopHost<Store>,
  Store extends SttDesktopStore,
>({
  activeProjectRuntimeHost,
  activeThreadIdForHost,
  activeWorkspacePath,
  emitDesktopState,
  diagnostics = new SttDiagnosticRecorder(),
  emitDesktopEvent,
  emitRuntimeFeatureStateUpdated,
  env = process.env,
  getSttSettings,
  normalizeWorkspacePath,
  nowMs = () => Date.now(),
  providers = {
    discoverAmbientCliSttProviders,
    mergeSttProvidersWithValidation,
    readQwen3AsrValidationMetadata,
    setupQwen3AsrProvider,
  },
  requireProjectRuntimeHostForThread,
  runner,
  runtimeFactory = (options) => new SttRuntime(options),
  setSttSettings,
  settingsPath,
  setupDiagnosticSummary = sttSetupDiagnosticSummary,
  transcriptionDiagnosticSummary = sttTranscriptionDiagnosticSummary,
  writeSttSettings,
}: SttDesktopServiceDependencies<Host, Store>): SttDesktopService<Host, Store> {
  const runtimes = new Map<string, SttDesktopRuntime>();

  function activeVoiceSttContextForProjectHost(host = activeProjectRuntimeHost()): VoiceSttDesktopContext<Host, Store> {
    const threadId = activeThreadIdForHost(host);
    const thread = host.store.getThread(threadId);
    return {
      host,
      targetStore: host.store,
      threadId,
      thread,
      workspacePath: thread.workspacePath,
    };
  }

  async function updateSttSettings(input: UpdateSttSettingsInput, options: { onStateUpdated?: () => void } = {}): Promise<SttSettings> {
    const nextSettings: SttSettings = {
      enabled: input.enabled && Boolean(input.providerCapabilityId),
      ...(input.providerCapabilityId ? { providerCapabilityId: input.providerCapabilityId } : {}),
      spokenLanguage: input.spokenLanguage,
      ...(input.pushToTalkShortcut ? { pushToTalkShortcut: input.pushToTalkShortcut } : {}),
      microphone: {
        ...(input.microphone?.deviceId ? { deviceId: input.microphone.deviceId } : {}),
        ...(input.microphone?.label ? { label: input.microphone.label } : {}),
      },
      mode: input.mode,
      autoSendAfterTranscription: input.autoSendAfterTranscription,
      silenceFinalizeSeconds: input.silenceFinalizeSeconds,
      noSpeechGate: input.noSpeechGate,
      bargeIn: input.bargeIn,
    };
    setSttSettings(nextSettings);
    await writeSttSettings(settingsPath(), nextSettings);
    for (const runtime of runtimes.values()) runtime.updateSettings(nextSettings);
    if (options.onStateUpdated) options.onStateUpdated();
    else emitDesktopState();
    return nextSettings;
  }

  async function listSttProvidersWithValidation(workspacePath = activeWorkspacePath()): Promise<SttProviderCandidate[]> {
    const discovered = await providers.discoverAmbientCliSttProviders(workspacePath);
    const validation = await providers.readQwen3AsrValidationMetadata(workspacePath);
    return providers.mergeSttProvidersWithValidation(discovered, validation);
  }

  async function setupSttProvider(
    input: SttProviderSetupInput,
    context = activeVoiceSttContextForProjectHost(),
  ): Promise<SttProviderSetupResult> {
    const { workspacePath } = context;
    const startedAt = nowMs();
    const result = await providers.setupQwen3AsrProvider(workspacePath, input, sttProviderSetupOptions(env));
    const selectedProvider = result.selectedProvider;
    if (input.selectProvider && selectedProvider) {
      await updateSttSettings({
        ...getSttSettings(),
        enabled: Boolean(input.enable) && selectedProvider.available && result.status === "ready",
        providerCapabilityId: selectedProvider.capabilityId,
        spokenLanguage: input.spokenLanguage?.trim() || selectedProvider.defaultLanguage || getSttSettings().spokenLanguage,
      }, {
        onStateUpdated: () => emitRuntimeFeatureStateUpdated(context.targetStore),
      });
    }
    await recordSttDiagnostic(workspacePath, setupDiagnosticSummary({ result, durationMs: nowMs() - startedAt }));
    return {
      ...result,
      providers: await listSttProvidersWithValidation(workspacePath),
    };
  }

  async function transcribeSttAudio(
    input: SttTranscribeAudioInput,
    host = requireProjectRuntimeHostForThread(input.threadId),
  ): Promise<SttTranscribeAudioResult> {
    const settings = getSttSettings();
    if (!settings.enabled || !settings.providerCapabilityId) {
      throw new Error("Enable speech input and select an available STT provider before transcribing speech.");
    }
    const targetStore = host.store;
    const thread = targetStore.getThread(input.threadId);
    const workspacePath = thread.workspacePath;
    const runtime = getSttRuntime(workspacePath);
    runtime.updateSettings(settings);
    runtime.setAgentRunning(isThreadRunActive(input.threadId, targetStore));
    const startedAt = nowMs();
    const state = await runtime.enqueueUtterance({
      threadId: input.threadId,
      utteranceId: input.utteranceId ?? `stt-${nowMs().toString(36)}`,
      audioPath: input.audioPath,
    });
    runtime.drainReadyToSend();
    const queue = runtime.getQueueState();
    await recordSttDiagnostic(
      workspacePath,
      transcriptionDiagnosticSummary({ state, elapsedMs: nowMs() - startedAt, queue }),
    );
    return { state, queue };
  }

  async function setSttTtsSpeaking(
    input: SetSttTtsSpeakingInput,
    workspacePath = activeVoiceSttContextForProjectHost().workspacePath,
  ): Promise<SttQueueState> {
    const runtime = getSttRuntime(workspacePath);
    runtime.updateSettings(getSttSettings());
    return runtime.setTtsSpeaking(input.speaking);
  }

  async function cancelSttTranscription(workspacePath = activeVoiceSttContextForProjectHost().workspacePath): Promise<SttQueueState> {
    const runtime = getSttRuntime(workspacePath);
    runtime.updateSettings(getSttSettings());
    return runtime.cancelTranscription();
  }

  function currentSttQueueState(workspacePath = activeWorkspacePath()): SttQueueState {
    return runtimes.get(normalizeWorkspacePath(workspacePath))?.getQueueState() ?? idleSttQueueState();
  }

  function listSttDiagnostics(workspacePath: string): SttDiagnosticSummary[] {
    return diagnostics.list(workspacePath);
  }

  function clearSttRuntimes(): void {
    runtimes.clear();
  }

  function disposeSttRuntimeForWorkspace(workspacePath: string, reason: string): void {
    const normalized = normalizeWorkspacePath(workspacePath);
    const runtime = runtimes.get(normalized);
    if (!runtime) return;
    runtime.dispose(reason);
    runtimes.delete(normalized);
  }

  function getSttRuntime(workspacePath: string): SttDesktopRuntime {
    const normalized = normalizeWorkspacePath(workspacePath);
    let runtime = runtimes.get(normalized);
    if (!runtime) {
      runtime = runtimeFactory({
        workspacePath: normalized,
        settings: getSttSettings(),
        runner,
        onQueueStateChanged: (queue) => {
          emitDesktopEvent({ type: "stt-queue-updated", queue, workspacePath: normalized });
        },
        onStopSpeakingRequested: () => {
          emitDesktopEvent({ type: "stt-stop-tts-requested", workspacePath: normalized });
        },
      });
      runtimes.set(normalized, runtime);
    }
    return runtime;
  }

  async function recordSttDiagnostic(workspacePath: string, diagnostic: SttDiagnosticSummary): Promise<void> {
    const nextDiagnostics = await diagnostics.record(workspacePath, diagnostic);
    emitDesktopEvent({
      type: "stt-diagnostic-recorded",
      diagnostic,
      diagnostics: nextDiagnostics,
      workspacePath,
    });
  }

  function isThreadRunActive(threadId: string, targetStore: Store): boolean {
    return targetStore
      .listActiveRuns()
      .some((run) => run.threadId === threadId && (run.status === "starting" || run.status === "streaming" || run.status === "tool"));
  }

  return {
    activeVoiceSttContextForProjectHost,
    cancelSttTranscription,
    clearSttRuntimes,
    currentSttQueueState,
    disposeSttRuntimeForWorkspace,
    listSttDiagnostics,
    listSttProvidersWithValidation,
    setSttTtsSpeaking,
    setupSttProvider,
    transcribeSttAudio,
    updateSttSettings,
  };
}

function idleSttQueueState(): SttQueueState {
  return { phase: "idle", queuedUtteranceIds: [] };
}

function sttProviderSetupOptions(env: Record<string, string | undefined>): SetupQwen3AsrProviderOptions {
  if (env.AMBIENT_E2E !== "1") return {};
  return {
    disableRuntimeAutoDetect: env.AMBIENT_E2E_STT_DISABLE_RUNTIME_AUTODETECT === "1",
    disableRuntimeInstall: env.AMBIENT_E2E_STT_DISABLE_RUNTIME_INSTALL === "1",
  };
}
