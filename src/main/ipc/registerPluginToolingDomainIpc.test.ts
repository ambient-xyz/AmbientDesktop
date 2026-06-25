import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AmbientMcpContainerRuntimeLifecycleCommand,
  AmbientMcpContainerRuntimeLifecycleRunInput,
  AmbientMcpContainerRuntimeStatus,
} from "../../shared/pluginTypes";
import {
  previewContainerRuntimeLifecycleAction,
  runContainerRuntimeLifecycleAction,
  type ContainerRuntimeLifecycleRunOptions,
} from "../container-runtime/containerRuntimeLifecycleService";
import {
  pluginToolingDomainIpcChannels,
  registerPluginToolingDomainIpc,
  type RegisterPluginToolingDomainIpcDependencies,
} from "./registerPluginToolingDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];
type FakeProjectStore = {
  getThread: ReturnType<typeof vi.fn>;
  setPluginEnabled: ReturnType<typeof vi.fn>;
  setPluginTrusted: ReturnType<typeof vi.fn>;
};
type FakeProjectRuntimeHost = {
  workspacePath: string;
  store: FakeProjectStore;
};

describe("registerPluginToolingDomainIpc", () => {
  it("registers the plugin/tooling domain channel table", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginToolingDomainIpcChannels]);
  });

  it("routes plugin discovery through the active project store", async () => {
    const { catalog, deps, host, invoke } = registerWithFakes();

    await expect(invoke("plugins:discover")).resolves.toBe(catalog);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.readCodexPluginCatalog).toHaveBeenCalledWith(host.store);
  });

  it("routes MCP registry search through the install catalog", async () => {
    const { deps, invoke, searchRegistryServers, searchResults } = registerWithFakes();

    await expect(invoke("mcp:registry-search", { query: "browser", limit: 5 })).resolves.toBe(searchResults);

    expect(deps.createMcpInstallCatalog).toHaveBeenCalledOnce();
    expect(searchRegistryServers).toHaveBeenCalledWith({ query: "browser", limit: 5 });
  });

  it("routes plugin trust mutations through the active project store", async () => {
    const { catalog, deps, host, invoke } = registerWithFakes();
    const plugin = { pluginId: "plugin-a", name: "Plugin A" };

    deps.pluginHost.readCodexPlugin.mockResolvedValue(plugin);

    await expect(invoke("plugins:set-trusted", { pluginId: "plugin-a", trusted: true })).resolves.toBe(catalog);

    expect(deps.pluginHost.readCodexPlugin).toHaveBeenCalledWith("/tmp/workspace", { pluginId: "plugin-a" }, { plugins: [] });
    expect(host.store.setPluginTrusted).toHaveBeenCalledWith("plugin-a", true, "fingerprint");
    expect(deps.codexPluginTrustFingerprint).toHaveBeenCalledWith(plugin);
    expect(deps.resetProjectRuntimeAndPluginServers).toHaveBeenCalledWith(host);
    expect(deps.readCodexPluginCatalog).toHaveBeenCalledWith(host.store);
  });

  it("requests approval before installing plugin dependencies", async () => {
    const { deps, host, invoke } = registerWithFakes();
    const plugin = {
      pluginId: "plugin-a",
      displayName: "Plugin A",
      name: "plugin-a",
      rootPath: "/tmp/workspace/.codex/plugins/plugin-a",
      dependencyStatus: {
        required: true,
        installed: false,
        installCommand: ["pnpm", "install"],
        missingPackages: ["@example/dep"],
      },
    };
    const installResult = { status: "installed" };

    deps.pluginHost.readCodexPlugin.mockResolvedValue(plugin);
    deps.permissions.request.mockResolvedValue({ allowed: true });
    deps.pluginHost.installCodexPluginDependencies.mockResolvedValue(installResult);

    await expect(invoke("plugins:install-dependencies", { pluginId: "plugin-a" })).resolves.toBe(installResult);

    expect(deps.activeThreadIdForHost).toHaveBeenCalledWith(host);
    expect(deps.permissions.request).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.stringContaining("Missing packages: @example/dep"),
        message: "Ambient will run this plugin's package manager install in the workspace. Lifecycle scripts are disabled.",
        risk: "plugin-tool",
        threadId: "thread-1",
        title: 'Install dependencies for "Plugin A"?',
        toolName: "plugin_dependencies_install",
      }),
    );
    expect(deps.pluginHost.installCodexPluginDependencies).toHaveBeenCalledWith("/tmp/workspace", {
      pluginId: "plugin-a",
    });
    expect(deps.resetProjectRuntimeAndPluginServers).toHaveBeenCalledWith(host);
  });

  it("runs container runtime lifecycle through the service and emits progress", async () => {
    const { deps, invoke, lifecycleProgress, lifecycleResult } = registerWithFakes();

    await expect(
      invoke("mcp:container-runtime-lifecycle-run", {
        action: "restart",
        expectedPreviewId: "docker:restart:daemon-unreachable:darwin",
      }),
    ).resolves.toEqual({
      ...lifecycleResult,
      logPath: "/tmp/user-data/mcp-container-runtime/lifecycle-log.json",
    });

    expect(deps.runContainerRuntimeLifecycleAction).toHaveBeenCalledWith(
      {
        action: "restart",
        expectedPreviewId: "docker:restart:daemon-unreachable:darwin",
      },
      expect.objectContaining({
        getStatus: deps.probeAmbientMcpContainerRuntimeStatus,
        onProgress: expect.any(Function),
      }),
    );
    expect(deps.emitMainWindowDesktopEvent).toHaveBeenCalledWith({
      type: "mcp-container-runtime-lifecycle-progress",
      progress: lifecycleProgress,
    });
    expect(deps.writeContainerRuntimeLifecycleRedactedLog).toHaveBeenCalledWith("/tmp/user-data", lifecycleResult);
  });

  it("exercises a deterministic preview-run-progress-status lifecycle path without real runtime commands", async () => {
    const { deps, invoke } = registerWithFakes();
    const commands: AmbientMcpContainerRuntimeLifecycleCommand[] = [];
    const wedged = lifecycleRuntimeStatus({
      status: "installed-not-running",
      reason: "daemon-unreachable",
      message: "Docker Desktop is installed but unreachable.",
    });
    const ready = lifecycleRuntimeStatus({
      status: "ready",
      reason: "none",
      message: "ToolHive preflight passed.",
    });
    const probeQueue = [wedged, wedged, ready];

    deps.probeAmbientMcpContainerRuntimeStatus.mockImplementation(async () => probeQueue.shift() ?? ready);
    deps.previewContainerRuntimeLifecycleAction.mockImplementation(previewContainerRuntimeLifecycleAction);
    deps.runContainerRuntimeLifecycleAction.mockImplementation(
      (input: AmbientMcpContainerRuntimeLifecycleRunInput, options: ContainerRuntimeLifecycleRunOptions) =>
        runContainerRuntimeLifecycleAction(input, {
          ...options,
          commandRunner: async ({ command }) => {
            commands.push(command);
            return {
              command,
              stdout: "",
              stderr: "",
              exitCode: 0,
              durationMs: 1,
            };
          },
          pollIntervalMs: 0,
          now: fixedLifecycleNow,
        }),
    );

    const preview = await invoke("mcp:container-runtime-lifecycle-preview", {
      action: "restart",
      runtime: "docker",
    });

    expect(preview).toMatchObject({
      schemaVersion: "ambient-container-runtime-lifecycle-preview-v1",
      previewId: "docker:restart:daemon-unreachable:darwin",
      status: "available",
      runtime: "docker",
      expectedInterruption: expect.stringContaining("including non-Ambient containers"),
      commands: [expect.objectContaining({ exe: "/usr/bin/osascript" }), expect.objectContaining({ exe: "/usr/bin/open" })],
    });

    const result = await invoke("mcp:container-runtime-lifecycle-run", {
      action: "restart",
      runtime: "docker",
      expectedPreviewId: "docker:restart:daemon-unreachable:darwin",
    });

    expect(commands.map((command) => [command.exe, ...command.args].join(" "))).toEqual([
      '/usr/bin/osascript -e tell application "Docker" to quit',
      "/usr/bin/open -a Docker",
    ]);
    expect(result).toMatchObject({
      schemaVersion: "ambient-container-runtime-lifecycle-result-v1",
      status: "ready",
      after: {
        status: "ready",
        message: "ToolHive preflight passed.",
      },
      logPath: "/tmp/user-data/mcp-container-runtime/lifecycle-log.json",
    });
    expect((result as { progress: Array<{ phase: string }> }).progress.map((progress) => progress.phase)).toEqual([
      "previewed",
      "graceful-stop-started",
      "launch-started",
      "probe-poll",
      "ready",
    ]);
    const lifecycleEvents = (deps.emitMainWindowDesktopEvent.mock.calls as Array<[unknown]>).map((call) => call[0]);
    expect(lifecycleEvents).toEqual([
      expect.objectContaining({
        type: "mcp-container-runtime-lifecycle-progress",
        progress: expect.objectContaining({ phase: "previewed" }),
      }),
      expect.objectContaining({
        type: "mcp-container-runtime-lifecycle-progress",
        progress: expect.objectContaining({ phase: "graceful-stop-started" }),
      }),
      expect.objectContaining({
        type: "mcp-container-runtime-lifecycle-progress",
        progress: expect.objectContaining({ phase: "launch-started" }),
      }),
      expect.objectContaining({
        type: "mcp-container-runtime-lifecycle-progress",
        progress: expect.objectContaining({ phase: "probe-poll" }),
      }),
      expect.objectContaining({ type: "mcp-container-runtime-lifecycle-progress", progress: expect.objectContaining({ phase: "ready" }) }),
    ]);
    expect(deps.writeContainerRuntimeLifecycleRedactedLog).toHaveBeenCalledWith(
      "/tmp/user-data",
      expect.objectContaining({
        status: "ready",
        after: expect.objectContaining({ status: "ready" }),
      }),
    );
    expect(deps.installMcpDefaultCapabilityForDesktop).not.toHaveBeenCalled();
  });
});

function fixedLifecycleNow(): Date {
  return new Date("2026-06-04T12:00:00.000Z");
}

function lifecycleRuntimeStatus(input: {
  status: AmbientMcpContainerRuntimeStatus["status"];
  reason: NonNullable<AmbientMcpContainerRuntimeStatus["reason"]>;
  message: string;
}): AmbientMcpContainerRuntimeStatus {
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: input.status,
    runtime: "docker",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-06-04T12:00:00.000Z",
    durationMs: 10,
    message: input.message,
    reason: input.reason,
    nextAction: input.status === "ready" ? "none" : "start-runtime",
    toolHive: {
      status: "ready",
      message: input.status === "ready" ? "ToolHive ready" : "ToolHive ready but runtime unreachable",
      preflightOk: input.status === "ready",
    },
    hosts: [
      {
        kind: "docker",
        status: input.status === "ready" ? "ready" : "installed-not-running",
        reason: input.reason,
        message: input.message,
      },
    ],
    setup: {
      userDecision: "none",
      shouldPrompt: false,
      promptSuppressed: false,
      reason: input.status === "ready" ? "runtime-ready" : "runtime-not-missing",
    },
    postInstallQueue: [
      {
        kind: "default-capability",
        capabilityId: "scrapling",
        status: input.status === "ready" ? "queued" : "blocked",
      },
    ],
    defaultCapabilities: [
      {
        schemaVersion: "ambient-mcp-default-capability-v1",
        capabilityId: "scrapling",
        title: "Scrapling",
        status: input.status === "ready" ? "blocked_approval" : "blocked_runtime",
        nextAction: input.status === "ready" ? "approve-default-capability" : "install-runtime",
        message:
          input.status === "ready"
            ? "Runtime is ready. Scrapling is waiting for default capability approval."
            : "Scrapling is blocked until the isolated runtime is ready.",
        serverId: "io.github.d4vinci/scrapling",
        workloadName: "ambient-scrapling",
        runtimeStatus: input.status,
        lastReconciledAt: "2026-06-04T12:00:00.000Z",
        appVersion: "0.0.0-test",
      },
    ],
  };
}

function registerWithFakes(): {
  catalog: { plugins: unknown[] };
  deps: RegisterPluginToolingDomainIpcDependencies;
  handlers: Map<string, IpcListener>;
  host: FakeProjectRuntimeHost;
  invoke(channel: string, raw?: unknown): Promise<unknown>;
  lifecycleProgress: { phase: string };
  lifecycleResult: {
    schemaVersion: string;
    action: string;
    runtime: string;
    status: string;
    reason: string;
    message: string;
    progress: Array<{ phase: string }>;
    durationMs: number;
  };
  searchRegistryServers: ReturnType<typeof vi.fn>;
  searchResults: Array<{ id: string }>;
} {
  const handlers = new Map<string, IpcListener>();
  const catalog = { plugins: [] };
  const searchResults = [{ id: "server-1" }];
  const searchRegistryServers = vi.fn(() => searchResults);
  const lifecycleProgress = { phase: "ready" };
  const lifecycleResult = {
    schemaVersion: "ambient-container-runtime-lifecycle-result-v1",
    action: "restart",
    runtime: "docker",
    status: "ready",
    reason: "none",
    message: "Docker restart completed.",
    progress: [lifecycleProgress],
    durationMs: 10,
  };
  const host: FakeProjectRuntimeHost = {
    workspacePath: "/tmp/workspace",
    store: {
      getThread: vi.fn(() => ({ permissionMode: "workspace" })),
      setPluginEnabled: vi.fn(),
      setPluginTrusted: vi.fn(),
    },
  };
  const deps: RegisterPluginToolingDomainIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    acceptMcpToolDescriptorReviewForDesktop: vi.fn(),
    activeThreadId: "thread-1",
    activeThreadIdForHost: vi.fn(() => "thread-1"),
    allPluginMcpRuntimeSnapshots: vi.fn(() => []),
    ambientMcpInstallPreview: vi.fn((input) => input),
    app: { getPath: vi.fn(() => "/tmp/user-data") },
    buildContainerRuntimeInstallPlanFromProbe: vi.fn(),
    codexPluginTrustFingerprint: vi.fn(() => "fingerprint"),
    createMcpInstallCatalog: vi.fn(() => ({
      catalog: {
        searchRegistryServers,
        previewRegistryInstall: vi.fn(),
        listInstalledServers: vi.fn(() => []),
      },
      toolHive: {},
    })),
    createPrivilegedActionAdapter: vi.fn(),
    dialog: { showOpenDialog: vi.fn() },
    discoverCapabilityBuilderHistory: vi.fn(),
    emitMainWindowDesktopEvent: vi.fn(),
    executeContainerRuntimeManagedInstallAction: vi.fn(),
    googleWorkspaceCliInstaller: { install: vi.fn() },
    googleWorkspaceSetupService: {
      cancel: vi.fn(),
      forgetAccount: vi.fn(),
      importOAuthClientConfig: vi.fn(),
      start: vi.fn(),
      state: vi.fn(),
      validate: vi.fn(),
    },
    installMcpDefaultCapabilityForDesktop: vi.fn(),
    installMcpRegistryServerForDesktop: vi.fn(),
    launchContainerRuntimeInstallAction: vi.fn(),
    listManagedDevServers: vi.fn(() => []),
    mcpContainerRuntimeSetupStatePath: vi.fn(() => "/tmp/setup-state.json"),
    openAllowedExternalUrl: vi.fn(),
    openContainerRuntimeApplication: vi.fn(),
    packageJson: { version: "0.0.0-test" },
    permissions: { request: vi.fn() },
    pluginHost: {
      addCodexMarketplace: vi.fn(),
      completePluginAppAuth: vi.fn(),
      disconnectPluginAuthAccount: vi.fn(),
      getCapabilityDiagnostics: vi.fn(),
      importCodexPlugin: vi.fn(),
      inspectCodexPluginMcp: vi.fn(),
      installCodexPluginDependencies: vi.fn(),
      listRuntimeCapabilities: vi.fn(),
      readCodexPlugin: vi.fn(),
      removeCodexMarketplace: vi.fn(),
      restartPluginMcpRuntime: vi.fn(),
      revokePluginAuthAccount: vi.fn(),
      startPluginAppAuth: vi.fn(),
      stopPluginMcpRuntime: vi.fn(),
      testPluginAuthAccount: vi.fn(),
      uninstallCodexPlugin: vi.fn(),
    },
    pluginStateReaderForStore: vi.fn(() => ({ plugins: [] })),
    privilegedActionAdapterSelectionFromEnv: vi.fn(),
    privilegedCredentials: { request: vi.fn() },
    previewContainerRuntimeLifecycleAction: vi.fn(() => ({
      schemaVersion: "ambient-container-runtime-lifecycle-preview-v1",
      previewId: "docker:restart:daemon-unreachable:darwin",
      action: "restart",
      runtime: "docker",
      platform: "darwin",
      status: "available",
      reason: "daemon-unreachable",
      summary: "Restart Docker Desktop.",
      requiresConfirmation: false,
      warnings: [],
      targets: [],
      commands: [],
      expectedInterruption: "Docker restart can interrupt containers.",
      createdAt: "2026-06-04T12:00:00.000Z",
    })),
    probeAmbientMcpContainerRuntimeStatus: vi.fn(async () => ({
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "installed-not-running",
      runtime: "docker",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-06-04T12:00:00.000Z",
      durationMs: 10,
      message: "Docker is not reachable.",
      reason: "daemon-unreachable",
      nextAction: "start-runtime",
      toolHive: { status: "ready", message: "ToolHive ready" },
      hosts: [],
      setup: {
        userDecision: "none",
        shouldPrompt: false,
        promptSuppressed: false,
        reason: "runtime-not-missing",
      },
      postInstallQueue: [],
      defaultCapabilities: [],
    })),
    probeContainerRuntime: vi.fn(),
    readAmbientPluginRegistry: vi.fn(),
    readCodexHostedMarketplaceReport: vi.fn(),
    readCodexPluginCatalog: vi.fn(() => catalog),
    readFirstPartyGoogleIntegration: vi.fn(),
    recordContainerRuntimeDeferred: vi.fn(),
    recordContainerRuntimeInstallLaunched: vi.fn(),
    redactGoogleWorkspaceSetupState: vi.fn((state) => state),
    refreshGoogleWorkspaceConnectorMode: vi.fn(),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resetProjectRuntimeAndPluginServers: vi.fn(),
    resetRuntimeAndPluginServers: vi.fn(),
    runContainerRuntimeLifecycleAction: vi.fn(async (_input, options) => {
      options.onProgress(lifecycleProgress);
      return lifecycleResult;
    }),
    restartProjectRuntimeMcpRuntime: vi.fn(),
    stopManagedDevServer: vi.fn(),
    stopProjectRuntimeMcpRuntime: vi.fn(),
    uninstallMcpServerForDesktop: vi.fn(),
    writeContainerRuntimeLifecycleRedactedLog: vi.fn(async () => "/tmp/user-data/mcp-container-runtime/lifecycle-log.json"),
    writeContainerRuntimeManagedInstallRedactedLog: vi.fn(),
    writePrivilegedActionRedactedLog: vi.fn(),
  };

  registerPluginToolingDomainIpc(deps);

  return {
    catalog,
    deps,
    handlers,
    host,
    invoke: (channel, raw) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
    lifecycleProgress,
    lifecycleResult,
    searchRegistryServers,
    searchResults,
  };
}
