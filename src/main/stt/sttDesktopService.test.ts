import { describe, expect, it, vi } from "vitest";
import type {
  SttDiagnosticSummary,
  SttProviderCandidate,
  SttProviderSetupResult,
  SttProviderValidationMetadata,
  SttQueueState,
  SttSettings,
  SttTranscriptionState,
} from "../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  createSttDesktopService,
  type SttDesktopHost,
  type SttDesktopRuntime,
  type SttDesktopServiceDependencies,
  type SttDesktopStore,
} from "./sttDesktopService";
import type { SttRuntimeOptions } from "./sttRuntime";

interface FakeRun {
  threadId: string;
  status: string;
}

interface FakeStore extends SttDesktopStore {
  activeRuns: FakeRun[];
}

interface FakeHost extends SttDesktopHost<FakeStore> {
  activeThreadId: string;
}

type FakeDeps = SttDesktopServiceDependencies<FakeHost, FakeStore>;

const thread = threadSummary("thread-1", "/workspace/project");
const baseSettings: SttSettings = {
  enabled: true,
  providerCapabilityId: "stt-package:tool:qwen3_asr_transcribe",
  spokenLanguage: "en",
  pushToTalkShortcut: "Space",
  microphone: { deviceId: "mic-1", label: "Desk Mic" },
  mode: "push-to-talk",
  autoSendAfterTranscription: true,
  silenceFinalizeSeconds: 1.5,
  noSpeechGate: { enabled: true, rmsThresholdDbfs: -48 },
  bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
};

function createStore(input: { activeRuns?: FakeRun[] } = {}): FakeStore {
  return {
    activeRuns: input.activeRuns ?? [],
    getThread(threadId) {
      if (threadId !== thread.id) throw new Error(`Thread not found: ${threadId}`);
      return thread;
    },
    listActiveRuns() {
      return this.activeRuns;
    },
  };
}

class FakeRuntime implements SttDesktopRuntime {
  readonly options: SttRuntimeOptions;
  readonly settingsUpdates: SttSettings[] = [];
  readonly disposedReasons: string[] = [];
  agentRunning = false;
  queue: SttQueueState = { phase: "idle", queuedUtteranceIds: [] };
  enqueueCalls: Array<{ threadId: string; utteranceId: string; audioPath: string }> = [];

  constructor(options: SttRuntimeOptions) {
    this.options = options;
  }

  updateSettings(settings: SttSettings): void {
    this.settingsUpdates.push(settings);
  }

  setAgentRunning(running: boolean): SttQueueState {
    this.agentRunning = running;
    this.queue = { phase: running ? "agent_running" : "idle", queuedUtteranceIds: [] };
    this.options.onQueueStateChanged?.(this.queue);
    return this.queue;
  }

  async enqueueUtterance(input: { threadId: string; utteranceId: string; audioPath: string }): Promise<SttTranscriptionState> {
    this.enqueueCalls.push(input);
    this.queue = { phase: "ready_to_send", queuedUtteranceIds: [input.utteranceId] };
    this.options.onQueueStateChanged?.(this.queue);
    return transcriptionState({
      threadId: input.threadId,
      utteranceId: input.utteranceId,
      audioPath: input.audioPath,
      status: "ready",
      text: "hello world",
    });
  }

  drainReadyToSend(): SttTranscriptionState[] {
    this.queue = { phase: "idle", queuedUtteranceIds: [] };
    this.options.onQueueStateChanged?.(this.queue);
    return [];
  }

  getQueueState(): SttQueueState {
    return this.queue;
  }

  setTtsSpeaking(speaking: boolean): SttQueueState {
    this.queue = { phase: speaking ? "speaking" : "idle", queuedUtteranceIds: [] };
    this.options.onQueueStateChanged?.(this.queue);
    if (speaking && this.options.onStopSpeakingRequested) this.options.onStopSpeakingRequested();
    return this.queue;
  }

  cancelTranscription(): SttQueueState {
    this.queue = { phase: "idle", queuedUtteranceIds: [] };
    this.options.onQueueStateChanged?.(this.queue);
    return this.queue;
  }

  dispose(reason = "disposed"): SttQueueState {
    this.disposedReasons.push(reason);
    return this.cancelTranscription();
  }
}

function createHarness(input: { activeRuns?: FakeRun[]; env?: Record<string, string | undefined> } = {}) {
  let settings = { ...baseSettings };
  const store = createStore({ activeRuns: input.activeRuns });
  const host: FakeHost = {
    activeThreadId: "thread-1",
    workspacePath: "/workspace/project",
    store,
  };
  const runtimes: FakeRuntime[] = [];
  const writeSttSettings = vi.fn(async () => undefined);
  const diagnostics = {
    list: vi.fn(() => [diagnosticSummary("setup")]),
    record: vi.fn(async (workspacePath: string, diagnostic: SttDiagnosticSummary) => {
      void workspacePath;
      return [diagnostic];
    }),
  };
  const providers: NonNullable<FakeDeps["providers"]> = {
    discoverAmbientCliSttProviders: vi.fn(async () => [sttProvider()]),
    mergeSttProvidersWithValidation: vi.fn((candidates: SttProviderCandidate[], validation: SttProviderValidationMetadata | undefined) =>
      candidates.map((provider) => validation ? { ...provider, validation } : provider),
    ),
    readQwen3AsrValidationMetadata: vi.fn(async () => validationMetadata()),
    setupQwen3AsrProvider: vi.fn(async () => setupResult()),
  };
  const emittedEvents: unknown[] = [];
  const emitDesktopState = vi.fn();
  const service = createSttDesktopService<FakeHost, FakeStore>({
    activeProjectRuntimeHost: () => host,
    activeThreadIdForHost: (targetHost) => targetHost.activeThreadId,
    activeWorkspacePath: () => "/workspace/project",
    diagnostics,
    emitDesktopState,
    emitDesktopEvent: (event) => emittedEvents.push(event),
    emitRuntimeFeatureStateUpdated: vi.fn(),
    env: input.env ?? {},
    getSttSettings: () => settings,
    normalizeWorkspacePath: (workspacePath) => workspacePath.replace(/\/+$/, ""),
    nowMs: () => 1000,
    providers,
    requireProjectRuntimeHostForThread: () => host,
    runner: async (workspacePath, command) => ({
      packageId: command.packageId ?? "stt-package",
      packageName: command.packageName ?? "STT Package",
      commandName: command.command,
      command: [command.command, ...(command.args ?? [])],
      cwd: workspacePath,
      durationMs: 1,
    }),
    runtimeFactory: (options) => {
      const runtime = new FakeRuntime(options);
      runtimes.push(runtime);
      return runtime;
    },
    setSttSettings: (next) => {
      settings = next;
    },
    settingsPath: () => "/user-data/preferences.json",
    setupDiagnosticSummary: () => diagnosticSummary("setup"),
    transcriptionDiagnosticSummary: () => diagnosticSummary("transcription"),
    writeSttSettings,
  });
  return {
    diagnostics,
    emitDesktopState,
    emittedEvents,
    host,
    providers,
    runtimes,
    service,
    settings: () => settings,
    store,
    writeSttSettings,
  };
}

describe("createSttDesktopService", () => {
  it("builds the active voice/STT context from the selected host", () => {
    const { host, service, store } = createHarness();

    expect(service.activeVoiceSttContextForProjectHost()).toEqual({
      host,
      targetStore: store,
      threadId: "thread-1",
      thread,
      workspacePath: "/workspace/project",
    });
  });

  it("updates persisted STT settings and pushes them into existing runtimes", async () => {
    const { emitDesktopState, runtimes, service, settings } = createHarness();
    await service.setSttTtsSpeaking({ speaking: true }, "/workspace/project/");

    const next: SttSettings = {
      enabled: false,
      spokenLanguage: baseSettings.spokenLanguage,
      mode: baseSettings.mode,
      autoSendAfterTranscription: baseSettings.autoSendAfterTranscription,
      silenceFinalizeSeconds: baseSettings.silenceFinalizeSeconds,
      noSpeechGate: baseSettings.noSpeechGate,
      bargeIn: baseSettings.bargeIn,
    };
    await expect(service.updateSttSettings(next)).resolves.toMatchObject({
      enabled: false,
      spokenLanguage: "en",
      microphone: {},
    });

    expect(settings().enabled).toBe(false);
    expect(settings().providerCapabilityId).toBeUndefined();
    expect(runtimes[0]?.settingsUpdates.at(-1)).toMatchObject({ enabled: false });
    expect(emitDesktopState).toHaveBeenCalledTimes(1);
  });

  it("lists providers merged with validation metadata", async () => {
    const { providers, service } = createHarness();

    await expect(service.listSttProvidersWithValidation("/workspace/project")).resolves.toMatchObject([
      { capabilityId: "stt-package:tool:qwen3_asr_transcribe", validation: { status: "runtime-ready" } },
    ]);
    expect(providers.discoverAmbientCliSttProviders).toHaveBeenCalledWith("/workspace/project");
    expect(providers.readQwen3AsrValidationMetadata).toHaveBeenCalledWith("/workspace/project");
  });

  it("sets up Qwen STT, optionally selects the provider, and records diagnostics", async () => {
    const { diagnostics, emittedEvents, providers, service, settings } = createHarness({
      env: {
        AMBIENT_E2E: "1",
        AMBIENT_E2E_STT_DISABLE_RUNTIME_AUTODETECT: "1",
        AMBIENT_E2E_STT_DISABLE_RUNTIME_INSTALL: "1",
      },
    });

    await expect(service.setupSttProvider({
      provider: "qwen3-asr",
      selectProvider: true,
      enable: true,
      spokenLanguage: "fr",
    })).resolves.toMatchObject({
      status: "ready",
      providers: [{ capabilityId: "stt-package:tool:qwen3_asr_transcribe" }],
    });

    expect(providers.setupQwen3AsrProvider).toHaveBeenCalledWith("/workspace/project", expect.objectContaining({
      provider: "qwen3-asr",
    }), {
      disableRuntimeAutoDetect: true,
      disableRuntimeInstall: true,
    });
    expect(settings()).toMatchObject({
      enabled: true,
      providerCapabilityId: "stt-package:tool:qwen3_asr_transcribe",
      spokenLanguage: "fr",
    });
    expect(diagnostics.record).toHaveBeenCalledWith("/workspace/project", expect.objectContaining({ kind: "setup" }));
    expect(emittedEvents).toContainEqual(expect.objectContaining({ type: "stt-diagnostic-recorded" }));
  });

  it("transcribes audio through the workspace runtime and records queue diagnostics", async () => {
    const { diagnostics, emittedEvents, runtimes, service } = createHarness({
      activeRuns: [{ threadId: "thread-1", status: "streaming" }],
    });

    await expect(service.transcribeSttAudio({
      threadId: "thread-1",
      utteranceId: "utt-1",
      audioPath: ".ambient/stt/utt-1.wav",
    })).resolves.toMatchObject({
      state: { status: "ready", text: "hello world" },
      queue: { phase: "idle" },
    });

    expect(runtimes[0]?.agentRunning).toBe(true);
    expect(runtimes[0]?.enqueueCalls).toEqual([{
      threadId: "thread-1",
      utteranceId: "utt-1",
      audioPath: ".ambient/stt/utt-1.wav",
    }]);
    expect(diagnostics.record).toHaveBeenCalledWith("/workspace/project", expect.objectContaining({ kind: "transcription" }));
    expect(emittedEvents).toContainEqual(expect.objectContaining({ type: "stt-queue-updated" }));
  });

  it("reports, cancels, disposes, and clears runtime queue state", async () => {
    const { runtimes, service } = createHarness();

    await expect(service.setSttTtsSpeaking({ speaking: true }, "/workspace/project/")).resolves.toEqual({
      phase: "speaking",
      queuedUtteranceIds: [],
    });
    expect(service.currentSttQueueState("/workspace/project")).toEqual({ phase: "speaking", queuedUtteranceIds: [] });

    await expect(service.cancelSttTranscription("/workspace/project")).resolves.toEqual({ phase: "idle", queuedUtteranceIds: [] });
    service.disposeSttRuntimeForWorkspace("/workspace/project/", "closed");
    expect(runtimes[0]?.disposedReasons).toEqual(["closed"]);
    expect(service.currentSttQueueState("/workspace/project")).toEqual({ phase: "idle", queuedUtteranceIds: [] });

    await service.setSttTtsSpeaking({ speaking: true }, "/workspace/project");
    service.clearSttRuntimes();
    expect(service.currentSttQueueState("/workspace/project")).toEqual({ phase: "idle", queuedUtteranceIds: [] });
  });
});

function threadSummary(id: string, workspacePath: string): ThreadSummary {
  return {
    id,
    title: "Thread",
    workspacePath,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "full-access",
    collaborationMode: "agent",
    model: "kimi",
    thinkingLevel: "medium",
  };
}

function sttProvider(input: Partial<SttProviderCandidate> = {}): SttProviderCandidate {
  return {
    packageId: input.packageId ?? "stt-package",
    packageName: input.packageName ?? "ambient-qwen3-asr",
    command: input.command ?? "qwen3_asr_transcribe",
    capabilityId: input.capabilityId ?? "stt-package:tool:qwen3_asr_transcribe",
    providerId: input.providerId ?? "qwen3-asr",
    label: input.label ?? "Qwen3 ASR",
    languages: input.languages ?? ["en", "fr"],
    defaultLanguage: input.defaultLanguage ?? "en",
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "ready",
    ...(input.validation ? { validation: input.validation } : {}),
  };
}

function validationMetadata(input: Partial<SttProviderValidationMetadata> = {}): SttProviderValidationMetadata {
  return {
    schemaVersion: "ambient-stt-provider-validation-v1",
    provider: "qwen3-asr",
    packageName: input.packageName ?? "ambient-qwen3-asr",
    providerCapabilityId: input.providerCapabilityId ?? "stt-package:tool:qwen3_asr_transcribe",
    status: input.status ?? "runtime-ready",
    updatedAt: input.updatedAt ?? "2026-06-19T00:00:00.000Z",
    platform: input.platform ?? "darwin",
    arch: input.arch ?? "arm64",
    lane: input.lane ?? "metal",
    missingHints: input.missingHints ?? [],
  };
}

function setupResult(input: Partial<SttProviderSetupResult> = {}): SttProviderSetupResult {
  const selectedProvider = input.selectedProvider ?? sttProvider({ defaultLanguage: "en" });
  return {
    provider: "qwen3-asr",
    action: input.action ?? "install",
    status: input.status ?? "ready",
    packageName: input.packageName ?? "ambient-qwen3-asr",
    installStatuses: input.installStatuses ?? [{
      packageName: "ambient-qwen3-asr",
      source: "first-party",
      status: "installed",
    }],
    selectedProvider,
    providers: input.providers ?? [selectedProvider],
    validation: input.validation ?? validationMetadata(),
    runtimeCandidates: input.runtimeCandidates ?? [],
    nextSteps: input.nextSteps ?? [],
  };
}

function transcriptionState(input: Partial<SttTranscriptionState> = {}): SttTranscriptionState {
  return {
    utteranceId: input.utteranceId ?? "utt-1",
    threadId: input.threadId ?? "thread-1",
    status: input.status ?? "ready",
    audioPath: input.audioPath ?? ".ambient/stt/utt-1.wav",
    language: input.language ?? "en",
    text: input.text ?? "hello",
    createdAt: input.createdAt ?? "2026-06-19T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-06-19T00:00:00.000Z",
  };
}

function diagnosticSummary(kind: SttDiagnosticSummary["kind"]): SttDiagnosticSummary {
  if (kind === "setup") {
    return {
      id: "stt-setup-test",
      kind,
      createdAt: "2026-06-19T00:00:00.000Z",
      provider: "qwen3-asr",
      action: "install",
      status: "ready",
      durationMs: 1,
      packageName: "ambient-qwen3-asr",
      platform: "darwin",
      arch: "arm64",
      lane: "metal",
      missingHintCount: 0,
    };
  }
  return {
    id: "stt-transcription-test",
    kind,
    createdAt: "2026-06-19T00:00:00.000Z",
    utteranceId: "utt-1",
    threadId: "thread-1",
    status: "ready",
    transcriptionElapsedMs: 1,
    artifacts: {
      audio: true,
      normalizedAudio: false,
      transcript: false,
      json: false,
      stdout: false,
      stderr: false,
    },
  };
}
