import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import {
  createAgentRuntimeFeatureFactory,
  type AgentRuntimeFeatureFactoryDependencies,
} from "./agentRuntimeFeatureFactory";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";

class FakeStore {
  constructor(private readonly workspacePath: string) {}

  getWorkspace() {
    return { path: this.workspacePath };
  }
}

interface FakeBrowser {
  id: string;
}

function createDependencies(options: { localTextSubagents?: NonNullable<AgentRuntimeFeatures["localTextSubagents"]> } = {}) {
  const defaultStore = new FakeStore("/workspace/default");
  const contextStore = new FakeStore("/workspace/context");
  const browser: FakeBrowser = { id: "browser-1" };
  const emitRuntimeFeatureStateUpdated = vi.fn();
  const readFeatureFlagSnapshot = vi.fn(() => resolveAmbientFeatureFlags({ generatedAt: "2026-06-19T00:00:00.000Z" }));
  const updateSearchSettings = vi.fn((input, options) => {
    options.onStateUpdated();
    return input;
  });
  const updateLocalDeepResearchSettings = vi.fn((input, options) => {
    options.onStateUpdated();
    return input;
  });
  const updateMediaPlaybackSettings = vi.fn((input, options) => {
    options.onStateUpdated();
    return input;
  });
  const updatePlannerSettings = vi.fn((input, options) => {
    options.onStateUpdated();
    return input;
  });
  const updateVoiceSettings = vi.fn((input, _audit, options) => {
    options.onStateUpdated();
    return input;
  });
  const updateSttSettings = vi.fn((input, options) => {
    options.onStateUpdated();
    return input;
  });
  const runExploration = vi.fn(async () => ({ thread: { id: "workflow-thread-1" } as never }));
  const compilePreview = vi.fn(async () => ({ thread: { id: "workflow-thread-1" } as never }));
  const reviewArtifact = vi.fn(async () => ({
    thread: { id: "workflow-thread-1" } as never,
    artifactId: "artifact-1",
    artifactStatus: "approved",
    changed: true,
  }));
  const cancelRun = vi.fn(async () => ({
    thread: { id: "workflow-thread-1" } as never,
    runId: "run-1",
    changed: true,
  }));
  const recoverRun = vi.fn(async () => ({
    thread: { id: "workflow-thread-1" } as never,
    runId: "run-1",
    changed: true,
  }));
  const googleWorkspace = {
    readIntegration: vi.fn(() => ({ enabled: true }) as never),
    installCli: vi.fn(async () => ({ installed: true }) as never),
    startSetup: vi.fn(() => ({ status: "idle" }) as never),
    importOAuthClient: vi.fn(() => ({ status: "idle" }) as never),
    cancelSetup: vi.fn(() => ({ status: "idle" }) as never),
    validate: vi.fn(async () => ({ valid: true }) as never),
    searchMethods: vi.fn(() => ({ methods: [] }) as never),
    describeMethod: vi.fn(async () => ({ id: "method-1" }) as never),
    resolveAccountHint: vi.fn(() => "default"),
    call: vi.fn(async () => ({ ok: true }) as never),
    materializeFile: vi.fn(async () => ({ path: "/workspace/file" }) as never),
  } as unknown as NonNullable<AgentRuntimeFeatures["googleWorkspace"]>;
  const dependencies = {
    browserLoginBrokerEnabled: true,
    defaultStore: () => defaultStore,
    emitRuntimeFeatureStateUpdated,
    readFeatureFlagSnapshot,
    userDataPath: () => "/user-data",
    appVersion: "0.1.test",
    env: { AMBIENT_TEST: "1" },
    localModelHostMemory: vi.fn(() => ({ totalBytes: 1, freeBytes: 1 } as never)),
    googleWorkspace,
    workflowNativeTools: {
      connectorDescriptors: vi.fn(() => []),
      connectorRegistrations: vi.fn(() => []),
      connectorAccountAuthorizer: vi.fn(() => undefined),
    },
    localTextSubagents: options.localTextSubagents,
    readSearchSettings: vi.fn(() => ({}) as never),
    updateSearchSettings,
    readLocalDeepResearchSettings: vi.fn(() => ({}) as never),
    updateLocalDeepResearchSettings,
    readMediaPlaybackSettings: vi.fn(() => ({}) as never),
    updateMediaPlaybackSettings,
    readPlannerSettings: vi.fn(() => ({}) as never),
    updatePlannerSettings,
    listProjects: vi.fn(() => [{ id: "project-1", workspacePath: "/workspace/context" }] as never),
    createProject: vi.fn(() => ({ id: "project-created" }) as never),
    switchProject: vi.fn(() => undefined),
    workflowAgents: {
      runExploration,
      compilePreview,
      reviewArtifact,
      cancelRun,
      recoverRun,
    },
    workflowRecordings: {
      search: vi.fn(() => ({ results: [] }) as never),
      describe: vi.fn(() => ({ id: "playbook-1" }) as never),
      inject: vi.fn(() => ({ id: "injection-1" }) as never),
      update: vi.fn(() => ({ id: "playbook-1" }) as never),
      archive: vi.fn(() => ({ id: "playbook-1" }) as never),
      unarchive: vi.fn(() => ({ id: "playbook-1" }) as never),
      restoreVersion: vi.fn(() => ({ id: "playbook-1" }) as never),
    },
    readVoiceSettings: vi.fn(() => ({}) as never),
    updateVoiceSettings,
    listVoiceProviders: vi.fn(() => []),
    enforceVoiceArtifactBudget: vi.fn(() => undefined),
    createMediaUrl: vi.fn(() => "workspace-media://voice"),
    readSttSettings: vi.fn(() => ({}) as never),
    updateSttSettings,
    listSttProviders: vi.fn(() => []),
    privilegedCredentials: {
      request: vi.fn(async () => ({ approved: true }) as never),
    },
    secureInputs: {
      request: vi.fn(async () => ({ submitted: true }) as never),
    },
  } satisfies AgentRuntimeFeatureFactoryDependencies<FakeStore, FakeBrowser>;

  return {
    browser,
    context: {
      store: contextStore,
      browserService: browser,
      activeThreadId: () => "thread-1",
    },
    contextStore,
    defaultStore,
    dependencies,
  };
}

describe("createAgentRuntimeFeatureFactory", () => {
  it("routes feature reads and project operations through the provided context store", () => {
    const { context, contextStore, dependencies } = createDependencies();
    const createFeatures = createAgentRuntimeFeatureFactory(dependencies);
    const features = createFeatures(context);

    expect(features.browserLoginBroker).toBe(true);
    expect(features.mcp).toMatchObject({ userDataPath: "/user-data", appVersion: "0.1.test" });
    expect(features.featureFlags?.readSnapshot().generatedAt).toBe("2026-06-19T00:00:00.000Z");
    expect(dependencies.readFeatureFlagSnapshot).toHaveBeenCalledWith(contextStore);

    features.projects?.listProjects?.();
    features.projects?.createProject?.({ reason: "test" });
    expect(dependencies.listProjects).toHaveBeenCalledWith(contextStore);
    expect(dependencies.createProject).toHaveBeenCalledWith({ reason: "test" }, contextStore);
  });

  it("uses the default store when no runtime feature context is provided", () => {
    const { defaultStore, dependencies } = createDependencies();
    const createFeatures = createAgentRuntimeFeatureFactory(dependencies);
    const features = createFeatures();

    features.projects?.listProjects?.();
    expect(dependencies.listProjects).toHaveBeenCalledWith(defaultStore);
  });

  it("emits state updates for settings features against the selected store", async () => {
    const { context, contextStore, dependencies } = createDependencies();
    const features = createAgentRuntimeFeatureFactory(dependencies)(context);

    await features.search?.updateSettings?.({} as never);
    await features.media?.updateSettings?.({} as never);
    await features.planner?.updateSettings?.({} as never);
    await features.localDeepResearch?.updateSettings?.({} as never);
    await features.stt?.updateSettings?.({} as never);

    expect(dependencies.emitRuntimeFeatureStateUpdated).toHaveBeenCalledTimes(5);
    expect(dependencies.emitRuntimeFeatureStateUpdated).toHaveBeenCalledWith(contextStore);
  });

  it("forwards workflow agent actions with the original feature context", async () => {
    const { context, dependencies } = createDependencies();
    const features = createAgentRuntimeFeatureFactory(dependencies)(context);

    await features.workflowAgents?.runExploration?.({ workflowThreadId: "workflow-thread-1", reason: "test" });
    await features.workflowAgents?.compilePreview?.({ workflowThreadId: "workflow-thread-1", reason: "test" });
    await features.workflowAgents?.reviewArtifact?.({
      workflowThreadId: "workflow-thread-1",
      artifactId: "artifact-1",
      decision: "approved",
      reason: "test",
    });
    await features.workflowAgents?.cancelRun?.({ workflowThreadId: "workflow-thread-1", runId: "run-1", reason: "test" });
    await features.workflowAgents?.recoverRun?.({
      workflowThreadId: "workflow-thread-1",
      runId: "run-1",
      eventId: "event-1",
      action: "retry_step",
      reason: "test",
    });

    expect(dependencies.workflowAgents.runExploration).toHaveBeenCalledWith(
      { workflowThreadId: "workflow-thread-1", reason: "test" },
      context,
    );
    expect(dependencies.workflowAgents.compilePreview).toHaveBeenCalledWith(
      { workflowThreadId: "workflow-thread-1", reason: "test" },
      context,
    );
    expect(dependencies.workflowAgents.reviewArtifact).toHaveBeenCalledWith(
      { workflowThreadId: "workflow-thread-1", artifactId: "artifact-1", decision: "approved", reason: "test" },
      context,
    );
    expect(dependencies.workflowAgents.cancelRun).toHaveBeenCalledWith(
      { workflowThreadId: "workflow-thread-1", runId: "run-1", reason: "test" },
      context,
    );
    expect(dependencies.workflowAgents.recoverRun).toHaveBeenCalledWith(
      { workflowThreadId: "workflow-thread-1", runId: "run-1", eventId: "event-1", action: "retry_step", reason: "test" },
      context,
    );
  });

  it("scopes voice settings updates to the selected store workspace", async () => {
    const { context, contextStore, dependencies } = createDependencies();
    const features = createAgentRuntimeFeatureFactory(dependencies)(context);

    await features.voice?.updateSettings?.({} as never, { source: "settings" } as never);
    await features.voice?.enforceArtifactBudget?.("/workspace/context/.ambient/voice");
    features.voice?.onStateUpdated?.();

    expect(dependencies.updateVoiceSettings).toHaveBeenCalledWith(
      {},
      { source: "settings" },
      expect.objectContaining({
        providerStore: contextStore,
        workspacePath: "/workspace/context",
      }),
    );
    expect(dependencies.enforceVoiceArtifactBudget).toHaveBeenCalledWith("/workspace/context/.ambient/voice", contextStore);
    expect(dependencies.emitRuntimeFeatureStateUpdated).toHaveBeenCalledWith(contextStore);
  });

  it("adds local text subagent features only when configured", () => {
    const absent = createAgentRuntimeFeatureFactory(createDependencies().dependencies)();
    expect(absent.localTextSubagents).toBeUndefined();

    const localTextSubagents: NonNullable<AgentRuntimeFeatures["localTextSubagents"]> = {
      resolveRuntime: vi.fn(() => undefined),
    };
    const present = createAgentRuntimeFeatureFactory(createDependencies({ localTextSubagents }).dependencies)();
    expect(present.localTextSubagents).toBe(localTextSubagents);
  });
});
