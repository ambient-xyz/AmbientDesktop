import { describe, expect, it, vi } from "vitest";
import type { MessageVoiceState, VoiceArtifactPruneResult, VoiceArtifactRetentionSummary, VoiceSettings } from "../../shared/localRuntimeTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import {
  createVoiceArtifactDesktopService,
  type VoiceArtifactDesktopHost,
  type VoiceArtifactDesktopServiceDependencies,
  type VoiceArtifactDesktopStore,
} from "./voiceArtifactDesktopService";
import type { RegenerateMessageVoiceStateInput } from "./voiceRuntime";

interface FakeStore extends VoiceArtifactDesktopStore {
  cleared: Array<{ messageId: string; error?: string }>;
  voiceStates: MessageVoiceState[];
}

interface FakeHost extends VoiceArtifactDesktopHost<FakeStore> {
  activeThreadId: string;
}

type FakeDeps = VoiceArtifactDesktopServiceDependencies<FakeHost, FakeStore>;

const thread = threadSummary("thread-1", "/workspace/project");
const readyVoiceState = messageVoiceState({
  audioPath: ".ambient/voice/thread-1/message-1.wav",
});
const voiceSettings: VoiceSettings = {
  enabled: true,
  mode: "assistant-final",
  autoplay: true,
  providerCapabilityId: "voice-package:tool:speak",
  voiceId: "demo",
  maxChars: 1500,
  longReply: "summarize",
  format: "wav",
  artifactCacheMaxMb: 2,
};

function createStore(input: { states?: MessageVoiceState[]; threads?: ThreadSummary[] } = {}): FakeStore {
  const states = [...(input.states ?? [readyVoiceState])];
  const threads = input.threads ?? [thread];
  return {
    cleared: [],
    voiceStates: states,
    clearMessageVoiceArtifact(messageId, error) {
      this.cleared.push({ messageId, error });
      const current = this.getMessageVoiceState(messageId);
      if (!current) throw new Error(`Voice state not found for message: ${messageId}`);
      const cleared = {
        ...current,
        status: "canceled" as const,
        lastAudioPath: current.audioPath ?? current.lastAudioPath,
        audioPath: undefined,
        error: error ?? "Voice artifact cleared.",
      };
      this.voiceStates = this.voiceStates.map((state) => state.messageId === messageId ? cleared : state);
      return cleared;
    },
    getMessageVoiceState(messageId) {
      return this.voiceStates.find((state) => state.messageId === messageId);
    },
    getThread(threadId) {
      const found = threads.find((candidate) => candidate.id === threadId);
      if (!found) throw new Error(`Thread not found: ${threadId}`);
      return found;
    },
    getWorkspace() {
      return { path: "/workspace/project" };
    },
    getWorkspaceIfOpen() {
      return { path: "/workspace/project" };
    },
    listMessageVoiceStates(threadId) {
      return this.voiceStates.filter((state) => state.threadId === threadId);
    },
    listMessages(): ChatMessage[] {
      return [];
    },
    listThreads() {
      return threads;
    },
    setMessageVoiceState(input) {
      const next = {
        ...input,
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z",
      };
      this.voiceStates = this.voiceStates.filter((state) => state.messageId !== input.messageId).concat(next);
      return next;
    },
  };
}

function createHarness(input: { store?: FakeStore; activeThreadId?: string } = {}) {
  const store = input.store ?? createStore();
  const host: FakeHost = {
    activeThreadId: input.activeThreadId ?? "thread-1",
    workspacePath: "/workspace/project",
    store,
  };
  const emitProjectStateIfActive = vi.fn();
  const emitRuntimeFeatureStateUpdated = vi.fn();
  const providerSummaryForThread = vi.fn(() => ({ model: "kimi", apiKey: "test-key", baseUrl: "https://ambient.invalid" }));
  const resolveVoiceProviderWorkspacePath = vi.fn(async () => "/workspace/provider");
  const showItemInFolder = vi.fn();
  const removeFile = vi.fn(async () => undefined);
  const warn = vi.fn();
  const regenerateMessageVoiceState = vi.fn(async (request: RegenerateMessageVoiceStateInput) => {
    request.summaryForThread?.(thread);
    request.onStateUpdated?.();
    return messageVoiceState({ messageId: request.messageId, threadId: "thread-1", audioPath: ".ambient/voice/thread-1/regenerated.wav" });
  });
  const artifacts: NonNullable<FakeDeps["artifacts"]> = {
    clearManagedVoiceArtifacts: vi.fn(async () => pruneResult({
      deletedFileCount: 1,
      deletedPreview: [".ambient/voice/thread-1/message-1.wav"],
    })),
    clearManagedVoiceArtifactsSync: vi.fn(() => [".ambient/voice/thread-1/message-1.wav"]),
    inspectVoiceArtifactRetention: vi.fn(async (request) => retentionSummary({ threadId: request.threadId })),
    pruneManagedVoiceArtifactsToBudget: vi.fn(async () => pruneResult({ deletedFileCount: 0, deletedPreview: [] })),
    pruneVoiceArtifactOrphans: vi.fn(async () => pruneResult({
      deletedFileCount: 1,
      deletedPreview: [".ambient/voice/thread-1/message-1.wav"],
    })),
  };
  const service = createVoiceArtifactDesktopService<FakeHost, FakeStore>({
    activeProjectRuntimeHost: () => host,
    activeStore: () => store,
    activeThreadIdForHost: (targetHost) => targetHost.activeThreadId,
    activeWorkspacePath: () => "/workspace/project",
    artifactCacheMaxBytes: () => 2 * 1024 * 1024,
    createMediaUrl: () => "ambient-media://voice",
    emitProjectStateIfActive,
    emitRuntimeFeatureStateUpdated,
    getVoiceSettings: () => voiceSettings,
    projectRuntimeHostList: () => [host],
    providerSummaryForThread,
    removeFile,
    requireProjectRuntimeHostForMessageVoiceState: () => host,
    requireProjectRuntimeHostForThread: () => host,
    resolveVoiceProviderWorkspacePath,
    resolveWorkspacePath: (workspacePath, relativePath) => `${workspacePath}/${relativePath}`,
    runner: async (workspacePath, command) => ({
      packageId: command.packageId ?? "voice-package",
      packageName: command.packageName ?? "Voice Package",
      commandName: command.command,
      command: [command.command, ...(command.args ?? [])],
      cwd: workspacePath,
      durationMs: 1,
    }),
    shouldEmitRuntimeFeatureStateUpdated: () => true,
    showItemInFolder,
    warn,
    artifacts,
    regenerateMessageVoiceState,
  });

  return {
    artifacts,
    emitProjectStateIfActive,
    emitRuntimeFeatureStateUpdated,
    host,
    providerSummaryForThread,
    regenerateMessageVoiceState,
    removeFile,
    resolveVoiceProviderWorkspacePath,
    service,
    showItemInFolder,
    store,
    warn,
  };
}

describe("createVoiceArtifactDesktopService", () => {
  it("regenerates message voice with provider workspace, media URL, summary, and budget enforcement", async () => {
    const {
      artifacts,
      emitProjectStateIfActive,
      providerSummaryForThread,
      regenerateMessageVoiceState,
      resolveVoiceProviderWorkspacePath,
      service,
      store,
    } = createHarness();

    await expect(service.regenerateMessageVoice({ messageId: "message-1" })).resolves.toMatchObject({
      messageId: "message-1",
      audioPath: ".ambient/voice/thread-1/regenerated.wav",
    });

    expect(resolveVoiceProviderWorkspacePath).toHaveBeenCalledWith("voice-package:tool:speak", store);
    expect(providerSummaryForThread).toHaveBeenCalledWith(thread);
    expect(regenerateMessageVoiceState).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "message-1",
      packageWorkspacePath: "/workspace/provider",
      settings: voiceSettings,
      store,
    }));
    expect(artifacts.pruneManagedVoiceArtifactsToBudget).toHaveBeenCalledWith({
      workspacePath: "/workspace/project",
      maxBytes: 2 * 1024 * 1024,
    });
    expect(emitProjectStateIfActive).toHaveBeenCalledTimes(2);
  });

  it("reveals only managed voice artifacts", () => {
    const { service, showItemInFolder, store } = createHarness();

    service.revealMessageVoiceArtifact({ messageId: "message-1" });
    expect(showItemInFolder).toHaveBeenCalledWith("/workspace/project/.ambient/voice/thread-1/message-1.wav");

    store.voiceStates = [messageVoiceState({ audioPath: "outside.wav" })];
    expect(() => service.revealMessageVoiceArtifact({ messageId: "message-1" })).toThrow("managed voice directory");
  });

  it("removes and clears managed message voice artifacts", async () => {
    const { emitProjectStateIfActive, removeFile, service, store } = createHarness();

    await expect(service.clearMessageVoiceArtifact({ messageId: "message-1" })).resolves.toMatchObject({
      status: "canceled",
      lastAudioPath: ".ambient/voice/thread-1/message-1.wav",
    });

    expect(removeFile).toHaveBeenCalledWith("/workspace/project/.ambient/voice/thread-1/message-1.wav", { force: true });
    expect(store.cleared).toEqual([{ messageId: "message-1", error: undefined }]);
    expect(emitProjectStateIfActive).toHaveBeenCalledTimes(1);
  });

  it("builds retention requests from the selected host and prunes deleted states", async () => {
    const { artifacts, emitProjectStateIfActive, service, store } = createHarness();

    await expect(service.inspectVoiceArtifacts({ providerCapabilityId: "voice-package:tool:speak" })).resolves.toMatchObject({
      threadId: "thread-1",
    });
    expect(artifacts.inspectVoiceArtifactRetention).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: "/workspace/project",
      threadId: "thread-1",
      providerCapabilityId: "voice-package:tool:speak",
      voiceStates: [readyVoiceState],
    }));

    await expect(service.pruneVoiceArtifacts()).resolves.toMatchObject({ deletedFileCount: 1 });
    expect(store.cleared).toEqual([{
      messageId: "message-1",
      error: "Voice artifact cache removed this audio file.",
    }]);
    expect(emitProjectStateIfActive).toHaveBeenCalledTimes(1);
  });

  it("clears managed cache and enforces budgets across store state", async () => {
    const { artifacts, emitRuntimeFeatureStateUpdated, service, store } = createHarness();

    await service.clearManagedVoiceArtifactCache("test");
    expect(artifacts.clearManagedVoiceArtifacts).toHaveBeenCalledWith("/workspace/project");
    expect(store.cleared).toEqual([{
      messageId: "message-1",
      error: "Voice artifact cache cleared on test.",
    }]);
    expect(emitRuntimeFeatureStateUpdated).toHaveBeenCalledWith(store);

    store.voiceStates = [readyVoiceState];
    store.cleared = [];
    vi.mocked(artifacts.pruneManagedVoiceArtifactsToBudget).mockResolvedValueOnce(pruneResult({
      deletedFileCount: 1,
      deletedPreview: [".ambient/voice/thread-1/message-1.wav"],
    }));
    await service.enforceVoiceArtifactBudget();
    expect(artifacts.pruneManagedVoiceArtifactsToBudget).toHaveBeenLastCalledWith({
      workspacePath: "/workspace/project",
      maxBytes: 2 * 1024 * 1024,
    });
    expect(store.cleared).toEqual([{
      messageId: "message-1",
      error: "Voice artifact cache limit removed this audio file.",
    }]);
  });
});

function messageVoiceState(input: Partial<MessageVoiceState> = {}): MessageVoiceState {
  return {
    messageId: input.messageId ?? "message-1",
    threadId: input.threadId ?? "thread-1",
    status: input.status ?? "ready",
    source: input.source ?? "assistant-text",
    sourceMessageId: input.sourceMessageId ?? "message-1",
    providerCapabilityId: input.providerCapabilityId ?? "voice-package:tool:speak",
    providerId: input.providerId ?? "voice-provider",
    voiceId: input.voiceId ?? "demo",
    spokenText: input.spokenText ?? "Hello",
    spokenTextChars: input.spokenTextChars ?? 5,
    sourceTextChars: input.sourceTextChars ?? 5,
    ...(input.audioPath !== undefined ? { audioPath: input.audioPath } : {}),
    ...(input.lastAudioPath !== undefined ? { lastAudioPath: input.lastAudioPath } : {}),
    ...(input.mediaUrl !== undefined ? { mediaUrl: input.mediaUrl } : {}),
    ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.error !== undefined ? { error: input.error } : {}),
    createdAt: input.createdAt ?? "2026-06-19T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-06-19T00:00:00.000Z",
  };
}

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

function retentionSummary(input: Partial<VoiceArtifactRetentionSummary> = {}): VoiceArtifactRetentionSummary {
  return {
    threadId: input.threadId ?? "thread-1",
    ...(input.providerCapabilityId ? { providerCapabilityId: input.providerCapabilityId } : {}),
    rootPath: input.rootPath ?? ".ambient/voice/thread-1",
    managedFileCount: input.managedFileCount ?? 1,
    managedBytes: input.managedBytes ?? 100,
    referencedFileCount: input.referencedFileCount ?? 1,
    referencedBytes: input.referencedBytes ?? 100,
    orphanedFileCount: input.orphanedFileCount ?? 0,
    orphanedBytes: input.orphanedBytes ?? 0,
    referencedPreview: input.referencedPreview ?? [".ambient/voice/thread-1/message-1.wav"],
    orphanedPreview: input.orphanedPreview ?? [],
  };
}

function pruneResult(input: Partial<VoiceArtifactPruneResult> = {}): VoiceArtifactPruneResult {
  return {
    ...retentionSummary(input),
    deletedFileCount: input.deletedFileCount ?? 0,
    deletedBytes: input.deletedBytes ?? 0,
    deletedPreview: input.deletedPreview ?? [],
  };
}
