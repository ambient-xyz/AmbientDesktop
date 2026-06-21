import { describe, expect, it, vi } from "vitest";
import type {
  EmbeddingProviderCandidate,
  RefreshVoiceProviderVoicesInput,
  VoiceProviderCandidate,
  VoiceSettings,
} from "../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  createVoiceSettingsDesktopService,
  type VoiceSettingsDesktopProviders,
  type VoiceSettingsDesktopStore,
} from "./voiceSettingsDesktopService";
import type { VoiceDiscoveryCache } from "./voiceDiscoveryCache";

interface FakeStore extends VoiceSettingsDesktopStore {
  workspacePath: string;
  threads: ThreadSummary[];
}

const baseSettings: VoiceSettings = {
  enabled: false,
  mode: "assistant-final",
  autoplay: false,
  maxChars: 1200,
  longReply: "summarize",
  format: "mp3",
  artifactCacheMaxMb: 8,
};

const enabledSettings: VoiceSettings = {
  ...baseSettings,
  enabled: true,
  autoplay: true,
  providerCapabilityId: "voice-package:tool:speak",
  voiceId: "alloy",
  preferredVoicesByProvider: {
    "voice-package:tool:speak": "alloy",
  },
};

function createStore(input: { workspacePath?: string; threadWorkspaces?: string[] } = {}): FakeStore {
  const workspacePath = input.workspacePath ?? "/workspace/project";
  const threadWorkspaces = input.threadWorkspaces ?? [workspacePath, "/workspace/child", "/workspace/child"];
  return {
    workspacePath,
    threads: threadWorkspaces.map((threadWorkspace, index) => threadSummary(`thread-${index + 1}`, threadWorkspace)),
    getWorkspace() {
      return { path: this.workspacePath };
    },
    listThreads() {
      return this.threads;
    },
  };
}

function createHarness(input: {
  initialSettings?: VoiceSettings;
  voiceProvidersByWorkspace?: Record<string, VoiceProviderCandidate[]>;
  memoryEmbeddingProvidersByWorkspace?: Record<string, EmbeddingProviderCandidate[] | Error>;
  cliEmbeddingProvidersByWorkspace?: Record<string, EmbeddingProviderCandidate[] | Error>;
} = {}) {
  const store = createStore();
  const voiceProvidersByWorkspace = input.voiceProvidersByWorkspace ?? {
    "/workspace/project": [voiceProvider({ capabilityId: "voice-package:tool:speak" })],
    "/workspace/child": [voiceProvider({ capabilityId: "voice-package:tool:speak" }), voiceProvider({ capabilityId: "voice-package:tool:narrate" })],
  };
  const memoryEmbeddingProvidersByWorkspace = input.memoryEmbeddingProvidersByWorkspace ?? {
    "/workspace/project": [embeddingProvider({ capabilityId: "memory-package:tool:embed" })],
    "/workspace/child": [embeddingProvider({ capabilityId: "memory-package:tool:embed" })],
  };
  const cliEmbeddingProvidersByWorkspace = input.cliEmbeddingProvidersByWorkspace ?? {
    "/workspace/project": [embeddingProvider({ capabilityId: "cli-package:tool:embed" })],
    "/workspace/child": [embeddingProvider({ capabilityId: "cli-package:tool:embed-child" })],
  };
  const emptyCache: VoiceDiscoveryCache = { schemaVersion: "ambient-voice-discovery-cache-v1", providers: {} };
  const providers: VoiceSettingsDesktopProviders = {
    discoverAmbientCliVoiceProviders: vi.fn(async (workspacePath) => voiceProvidersByWorkspace[workspacePath] ?? []),
    discoverAmbientMemoryEmbeddingProviders: vi.fn(async (workspacePath) => resultOrThrow(memoryEmbeddingProvidersByWorkspace[workspacePath] ?? [])),
    discoverAmbientCliEmbeddingProviders: vi.fn(async (workspacePath) => resultOrThrow(cliEmbeddingProvidersByWorkspace[workspacePath] ?? [])),
    readVoiceDiscoveryCache: vi.fn(async () => emptyCache),
    mergeVoiceProvidersWithCachedVoices: vi.fn((candidates) => candidates),
    refreshVoiceProviderVoices: vi.fn(async (
      _workspacePath: string,
      candidates: VoiceProviderCandidate[],
      refreshInput: RefreshVoiceProviderVoicesInput,
    ) => ({
      provider: candidates.find((candidate) => candidate.capabilityId === refreshInput.providerCapabilityId) ?? voiceProvider(),
      entry: {
        providerCapabilityId: refreshInput.providerCapabilityId,
        providerLabel: "Narrate",
        source: "cloud-api" as const,
        refreshedAt: "2026-06-19T00:00:00.000Z",
        expiresAt: "2026-06-20T00:00:00.000Z",
        voiceCount: 2,
        voices: [{ id: "nova" }, { id: "onyx" }],
      },
      durationMs: 42,
      stdoutArtifactPath: ".ambient/voice/stdout.log",
      stderrArtifactPath: ".ambient/voice/stderr.log",
    })),
  };
  const writeVoiceSettings = vi.fn(async () => undefined);
  const enforceVoiceArtifactBudget = vi.fn(async () => undefined);
  const emitDesktopState = vi.fn();
  const service = createVoiceSettingsDesktopService<FakeStore>({
    activeWorkspacePath: () => store.workspacePath,
    defaultStore: () => store,
    emitDesktopState,
    enforceVoiceArtifactBudget,
    initialSettings: input.initialSettings ?? baseSettings,
    now: () => new Date("2026-06-19T00:00:00.000Z"),
    randomId: () => "auditid",
    runner: async (workspacePath, command) => ({
      packageId: command.packageId ?? "voice-package",
      packageName: "Voice Package",
      commandName: command.command,
      command: [command.command, ...(command.args ?? [])],
      cwd: workspacePath,
      durationMs: 1,
    }),
    settingsPath: () => "/user-data/preferences.json",
    writeVoiceSettings,
    providers,
  });
  return {
    emitDesktopState,
    enforceVoiceArtifactBudget,
    providers,
    service,
    store,
    writeVoiceSettings,
  };
}

describe("createVoiceSettingsDesktopService", () => {
  it("updates persisted voice settings, records audit, and emits through injected state callback", async () => {
    const { emitDesktopState, enforceVoiceArtifactBudget, service, store, writeVoiceSettings } = createHarness();
    const onStateUpdated = vi.fn();

    await expect(service.updateVoiceSettings({
      ...baseSettings,
      enabled: false,
      autoplay: false,
      providerCapabilityId: "voice-package:tool:speak",
      voiceId: "alloy",
      preferredVoicesByProvider: { "voice-package:tool:other": "verse" },
    }, {
      source: "chat-tool",
      toolName: "ambient_voice_select",
      threadId: "thread-1",
    }, {
      providerStore: store,
      workspacePath: "/workspace/project",
      onStateUpdated,
    })).resolves.toMatchObject({
      enabled: true,
      autoplay: true,
      providerCapabilityId: "voice-package:tool:speak",
      voiceId: "alloy",
      preferredVoicesByProvider: {
        "voice-package:tool:other": "verse",
        "voice-package:tool:speak": "alloy",
      },
    });

    expect(writeVoiceSettings).toHaveBeenCalledWith("/user-data/preferences.json", service.readVoiceSettings());
    expect(enforceVoiceArtifactBudget).toHaveBeenCalledWith("/workspace/project", store);
    expect(onStateUpdated).toHaveBeenCalledTimes(1);
    expect(emitDesktopState).not.toHaveBeenCalled();
    expect(service.listVoiceSettingsAudit()).toEqual([
      expect.objectContaining({
        id: "voice-settings-mqk5wqo0-auditid",
        createdAt: "2026-06-19T00:00:00.000Z",
        source: "chat-tool",
        toolName: "ambient_voice_select",
        threadId: "thread-1",
        summary: expect.stringContaining("Chat updated voice settings"),
      }),
    ]);
  });

  it("falls back to desktop state emission and disables unavailable provider selections", async () => {
    const { emitDesktopState, service } = createHarness({
      initialSettings: enabledSettings,
      voiceProvidersByWorkspace: {
        "/workspace/project": [voiceProvider({ capabilityId: "voice-package:tool:speak", available: false })],
      },
    });

    await expect(service.updateVoiceSettings({
      ...enabledSettings,
      providerCapabilityId: "voice-package:tool:speak",
      voiceId: "alloy",
    })).resolves.toMatchObject({
      enabled: false,
      autoplay: false,
      providerCapabilityId: "voice-package:tool:speak",
    });

    expect(emitDesktopState).toHaveBeenCalledTimes(1);
    expect(service.listVoiceSettingsAudit()[0]?.summary).toContain("Settings updated voice settings");
  });

  it("lists voice providers with cached voices across unique workspace paths", async () => {
    const { providers, service, store } = createHarness();

    await expect(service.listVoiceProvidersWithCachedVoices(store)).resolves.toEqual([
      expect.objectContaining({ capabilityId: "voice-package:tool:speak" }),
      expect.objectContaining({ capabilityId: "voice-package:tool:narrate" }),
    ]);

    expect(providers.discoverAmbientCliVoiceProviders).toHaveBeenCalledTimes(2);
    expect(providers.discoverAmbientCliVoiceProviders).toHaveBeenCalledWith("/workspace/project");
    expect(providers.discoverAmbientCliVoiceProviders).toHaveBeenCalledWith("/workspace/child");
    expect(providers.readVoiceDiscoveryCache).toHaveBeenCalledTimes(2);
    expect(providers.mergeVoiceProvidersWithCachedVoices).toHaveBeenCalledTimes(2);
    expect(service.voiceProviderWorkspacePaths(store)).toEqual(["/workspace/project", "/workspace/child"]);
  });

  it("lists embedding providers for settings while tolerating per-source discovery failures", async () => {
    const { service, store } = createHarness({
      memoryEmbeddingProvidersByWorkspace: {
        "/workspace/project": new Error("memory discovery failed"),
        "/workspace/child": [embeddingProvider({ capabilityId: "memory-package:tool:embed-child" })],
      },
      cliEmbeddingProvidersByWorkspace: {
        "/workspace/project": [embeddingProvider({ capabilityId: "cli-package:tool:embed" })],
        "/workspace/child": [embeddingProvider({ capabilityId: "cli-package:tool:embed" })],
      },
    });

    await expect(service.listEmbeddingProvidersForSettings(store)).resolves.toEqual([
      expect.objectContaining({ capabilityId: "cli-package:tool:embed" }),
      expect.objectContaining({ capabilityId: "memory-package:tool:embed-child" }),
    ]);
  });

  it("resolves provider workspace paths and refreshes provider voice catalogs", async () => {
    const { providers, service, store } = createHarness({
      voiceProvidersByWorkspace: {
        "/workspace/project": [],
        "/workspace/child": [voiceProvider({ capabilityId: "voice-package:tool:narrate", label: "Narrate" })],
      },
    });

    await expect(service.resolveVoiceProviderWorkspacePath("voice-package:tool:narrate", store)).resolves.toBe("/workspace/child");
    await expect(service.resolveVoiceProviderWorkspacePath(undefined, store)).resolves.toBe("/workspace/project");
    await expect(service.refreshVoiceProviderCatalog({ providerCapabilityId: "voice-package:tool:narrate" }, store)).resolves.toEqual({
      providerCapabilityId: "voice-package:tool:narrate",
      providerLabel: "Narrate",
      source: "cloud-api",
      refreshedAt: "2026-06-19T00:00:00.000Z",
      expiresAt: "2026-06-20T00:00:00.000Z",
      voiceCount: 2,
      durationMs: 42,
      stdoutArtifactPath: ".ambient/voice/stdout.log",
      stderrArtifactPath: ".ambient/voice/stderr.log",
    });

    expect(providers.refreshVoiceProviderVoices).toHaveBeenCalledWith(
      "/workspace/child",
      [expect.objectContaining({ capabilityId: "voice-package:tool:narrate" })],
      { providerCapabilityId: "voice-package:tool:narrate" },
      expect.any(Function),
    );
  });

  it("sets loaded settings without recording an audit entry", () => {
    const { service } = createHarness();

    expect(service.setVoiceSettings(enabledSettings)).toEqual(enabledSettings);
    expect(service.readVoiceSettings()).toEqual(enabledSettings);
    expect(service.listVoiceSettingsAudit()).toEqual([]);
  });
});

function resultOrThrow<T>(result: T | Error): T {
  if (result instanceof Error) throw result;
  return result;
}

function threadSummary(id: string, workspacePath: string): ThreadSummary {
  return {
    id,
    title: id,
    workspacePath,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "<model>",
    thinkingLevel: "medium",
  };
}

function voiceProvider(input: Partial<VoiceProviderCandidate> = {}): VoiceProviderCandidate {
  return {
    packageId: "voice-package",
    packageName: "Voice Package",
    command: "speak",
    capabilityId: "voice-package:tool:speak",
    providerId: "voice-provider",
    label: "Speak",
    format: "mp3",
    formats: ["mp3"],
    voices: [{ id: "alloy" }],
    installed: true,
    available: true,
    availabilityReason: "ready",
    ...input,
  };
}

function embeddingProvider(input: Partial<EmbeddingProviderCandidate> = {}): EmbeddingProviderCandidate {
  return {
    packageId: "embedding-package",
    packageName: "Embedding Package",
    command: "embed",
    capabilityId: "embedding-package:tool:embed",
    providerId: "embedding-provider",
    label: "Embed",
    installed: true,
    available: true,
    availabilityReason: "ready",
    ...input,
  };
}
