import { describe, expect, it, vi } from "vitest";
import type { AmbientPermissionGrant, PermissionMode } from "../../shared/permissionTypes";
import type { AmbientRetryPolicy } from "./workflowDiscoveryAmbientFacade";
import {
  createWorkflowDiscoveryDesktopService,
  type WorkflowDiscoveryDesktopServiceDependencies,
  type WorkflowDiscoveryDesktopStore,
} from "./workflowDiscoveryDesktopService";
import type { WorkflowDiscoveryPolicyContext, WorkflowDiscoveryPolicyInput } from "./workflowDiscoveryPolicy";
import type { PluginMcpToolRegistration } from "./workflowDiscoveryPluginsFacade";

interface ModelRuntimeSettings {
  aggressiveRetries?: boolean;
  label?: string;
}

interface TestThread {
  id: string;
  workspacePath?: string;
  permissionMode?: PermissionMode;
}

class FakeStore implements WorkflowDiscoveryDesktopStore<ModelRuntimeSettings> {
  readonly trusted: Array<{ pluginId: string; trusted: boolean; pluginFingerprint?: string }> = [];
  modelRuntimeSettings: ModelRuntimeSettings = {};
  grants: AmbientPermissionGrant[] = [];
  workflowThread?: { projectPath?: string };
  workspace = { path: "/fallback-workspace" };

  getModelRuntimeSettings(): ModelRuntimeSettings {
    return this.modelRuntimeSettings;
  }

  getWorkflowAgentThreadSummary(): { projectPath?: string } | undefined {
    return this.workflowThread;
  }

  getWorkspace(): { path: string } {
    return this.workspace;
  }

  listPermissionGrants(): AmbientPermissionGrant[] {
    return this.grants;
  }

  isPluginTrusted(pluginId: string, pluginFingerprint?: string): boolean {
    return pluginId === "trusted-plugin" && pluginFingerprint === "trusted-fingerprint";
  }

  setPluginTrusted(pluginId: string, trusted: boolean, pluginFingerprint?: string): void {
    this.trusted.push({ pluginId, trusted, pluginFingerprint });
  }
}

const retryPolicy: AmbientRetryPolicy = {
  enabled: true,
  maxRetries: 2,
  backoffMs: [10, 20],
  providerMaxRetryDelayMs: 1_000,
};

function thread(input: Partial<TestThread> = {}): TestThread {
  return {
    id: "thread-1",
    workspacePath: "/thread-workspace",
    permissionMode: "workspace",
    ...input,
  };
}

function pluginRegistration(input: Partial<PluginMcpToolRegistration> = {}): PluginMcpToolRegistration {
  return {
    registeredName: "plugin__server__tool",
    originalName: "tool",
    label: "Tool",
    description: "Tool description",
    promptSnippet: "",
    promptGuidelines: [],
    parameters: {},
    descriptor: {} as never,
    launchPlan: {
      pluginId: "plugin-1",
      pluginName: "Plugin One",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fingerprint-1",
      serverName: "server",
      cwd: "/workspace",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      name: "tool",
      pluginId: "plugin-1",
      pluginName: "Plugin One",
      serverName: "server",
    } as never,
    ...input,
  };
}

function createHarness(input: {
  store?: FakeStore;
  requestAllowed?: boolean;
  thread?: TestThread;
} = {}) {
  const store = input.store ?? new FakeStore();
  const activeThread = input.thread ?? thread();
  const provider = { kind: "test-provider" };
  const buildPolicyContext = vi.fn((policyInput: WorkflowDiscoveryPolicyInput) => ({
    projectPath: policyInput.projectPath,
    workspacePath: policyInput.workspacePath ?? policyInput.projectPath,
    permissionMode: policyInput.permissionMode ?? "workspace",
    stage: policyInput.stage ?? "initial_discovery",
    workflowThreadId: policyInput.workflowThreadId,
    threadId: policyInput.threadId,
    scannedAt: "2026-06-20T00:00:00.000Z",
    files: [],
    skippedPaths: [],
    contentExcerpts: [],
    accessDecisions: [],
    contextEvidence: [],
    connectors: [],
    pluginTools: [],
    ambientCliCapabilities: [],
    searchRoutingSettings: policyInput.searchRoutingSettings,
    policyNotes: [],
  } satisfies WorkflowDiscoveryPolicyContext));
  const dependencies: WorkflowDiscoveryDesktopServiceDependencies<
    FakeStore,
    TestThread,
    ModelRuntimeSettings,
    typeof provider
  > = {
    defaultStore: () => store,
    defaultContext: () => ({ targetStore: store, thread: activeThread }),
    readAmbientApiKey: vi.fn(() => "ambient-key"),
    retryPolicyFromSettings: vi.fn(() => retryPolicy),
    pluginMcpRegistrationsForThread: vi.fn(async () => [pluginRegistration()]),
    connectorDescriptors: vi.fn(() => [
      {
        id: "connector-1",
        label: "Connector One",
        accounts: [],
        operations: [],
        auth: { status: "available" },
      } as never,
    ]),
    searchRoutingSettings: vi.fn(() => ({ webSearchEnabled: true }) as never),
    requestPermission: vi.fn(async () => ({ allowed: input.requestAllowed ?? true })),
    buildPolicyContext,
    createProvider: vi.fn(() => provider),
  };
  const service = createWorkflowDiscoveryDesktopService(dependencies);
  return {
    activeThread,
    buildPolicyContext,
    dependencies,
    provider,
    service,
    store,
  };
}

describe("workflowDiscoveryDesktopService", () => {
  it("returns no retry policy unless aggressive retries are enabled", () => {
    const { dependencies, service, store } = createHarness();

    expect(service.ambientRetryPolicyFromCurrentSettings()).toBeUndefined();
    expect(dependencies.retryPolicyFromSettings).not.toHaveBeenCalled();

    store.modelRuntimeSettings = { aggressiveRetries: true, label: "aggressive" };

    expect(service.ambientRetryPolicyFromCurrentSettings()).toBe(retryPolicy);
    expect(dependencies.retryPolicyFromSettings).toHaveBeenCalledWith({
      modelRuntime: { aggressiveRetries: true, label: "aggressive" },
    });
  });

  it("creates the Ambient workflow discovery provider with provider status and current retry policy", () => {
    const { dependencies, provider, service, store } = createHarness();
    store.modelRuntimeSettings = { aggressiveRetries: true };

    expect(service.createWorkflowDiscoveryProvider({
      baseUrl: "https://ambient.test",
      model: "<model>",
    })).toBe(provider);

    expect(dependencies.createProvider).toHaveBeenCalledWith({
      apiKey: "ambient-key",
      baseUrl: "https://ambient.test",
      model: "<model>",
      retryPolicy,
    });
  });

  it("builds capability lookup policy context with explicit project path precedence", async () => {
    const { activeThread, buildPolicyContext, dependencies, service, store } = createHarness();

    const context = await service.workflowDiscoveryPolicyContextForCapabilityLookup({
      workflowThreadId: "workflow-1",
      projectPath: "/explicit-project",
    });

    expect(context.projectPath).toBe("/explicit-project");
    expect(dependencies.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(
      { ...activeThread, workspacePath: "/explicit-project" },
      store,
    );
    expect(buildPolicyContext).toHaveBeenCalledWith(expect.objectContaining({
      projectPath: "/explicit-project",
      workspacePath: "/thread-workspace",
      permissionMode: "workspace",
      stage: "initial_discovery",
      workflowThreadId: "workflow-1",
      threadId: "thread-1",
      grants: [],
      pluginRegistrations: [expect.objectContaining({ registeredName: "plugin__server__tool" })],
      searchRoutingSettings: { webSearchEnabled: true },
    }));
  });

  it("falls back from workflow-thread project path to thread and workspace paths", async () => {
    const workflowStore = new FakeStore();
    workflowStore.workflowThread = { projectPath: "/workflow-project" };
    const workflowHarness = createHarness({ store: workflowStore });

    await workflowHarness.service.workflowDiscoveryPolicyContextForCapabilityLookup({ workflowThreadId: "workflow-1" });

    expect(workflowHarness.dependencies.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePath: "/workflow-project" }),
      workflowStore,
    );

    const workspaceStore = new FakeStore();
    workspaceStore.workspace = { path: "/store-workspace" };
    const workspaceHarness = createHarness({ store: workspaceStore, thread: thread({ workspacePath: undefined }) });

    await workspaceHarness.service.workflowDiscoveryPolicyContextForCapabilityLookup({});

    expect(workspaceHarness.dependencies.pluginMcpRegistrationsForThread).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePath: "/store-workspace" }),
      workspaceStore,
    );
  });

  it("does not prompt when a workflow plugin is already trusted", async () => {
    const { dependencies, service, store } = createHarness();
    const trustedRegistration = pluginRegistration({
      launchPlan: {
        ...pluginRegistration().launchPlan,
        pluginId: "trusted-plugin",
        pluginFingerprint: "trusted-fingerprint",
      },
      tool: {
        name: "tool",
        pluginId: "trusted-plugin",
        pluginName: "Trusted Plugin",
        serverName: "server",
      } as never,
    });

    await expect(service.ensureWorkflowPluginTrusted(thread(), trustedRegistration)).resolves.toBe(true);

    expect(dependencies.requestPermission).not.toHaveBeenCalled();
    expect(store.trusted).toEqual([]);
  });

  it("prompts and records trust only when the user allows a workflow plugin", async () => {
    const { dependencies, service, store } = createHarness({ requestAllowed: true });
    const registration = pluginRegistration();

    await expect(service.ensureWorkflowPluginTrusted(thread(), registration)).resolves.toBe(true);

    expect(dependencies.requestPermission).toHaveBeenCalledWith({
      threadId: "thread-1",
      toolName: "plugin__server__tool",
      title: 'Trust Codex plugin "Plugin One"?',
      message: "Ambient wants to run a local MCP tool from this plugin in a workflow. Trusting it allows future tool calls from this plugin without another first-use prompt.",
      detail: [
        "Workspace: /thread-workspace",
        "Plugin: Plugin One",
        "MCP server: server",
        "Tool: tool",
        "Registered as: plugin__server__tool",
      ].join("\n"),
      risk: "plugin-tool",
    });
    expect(store.trusted).toEqual([
      { pluginId: "plugin-1", trusted: true, pluginFingerprint: "fingerprint-1" },
    ]);
  });

  it("leaves plugin trust unchanged when the user denies the prompt", async () => {
    const { service, store } = createHarness({ requestAllowed: false });

    await expect(service.ensureWorkflowPluginTrusted(thread(), pluginRegistration())).resolves.toBe(false);

    expect(store.trusted).toEqual([]);
  });
});
