import { describe, expect, it } from "vitest";
import type {
  AmbientMcpContainerRuntimeLifecyclePreview,
  AmbientMcpContainerRuntimeLifecycleProgress,
  AmbientMcpContainerRuntimeLifecycleResult,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilitySummary,
} from "../../shared/pluginTypes";
import {
  formatPluginMcpLaunchCommand,
  formatPluginMcpRuntimeEvent,
  mcpContainerRuntimeDetailRows,
  mcpContainerRuntimeDiagnosticsActionState,
  mcpContainerRuntimeInstallActionViews,
  mcpContainerRuntimeLifecycleActionViews,
  mcpContainerRuntimeLifecycleCommandPreview,
  mcpContainerRuntimeLifecycleForceWarningText,
  mcpContainerRuntimeLifecyclePreviewRows,
  mcpContainerRuntimeLifecycleRunActionState,
  mcpContainerRuntimeLifecycleStatusView,
  mcpContainerRuntimeLifecycleWarnings,
  mcpContainerRuntimePrimaryActionLabel,
  mcpContainerRuntimeSetupResumeRows,
  mcpContainerRuntimeShouldOpenStartupPanel,
  mcpContainerRuntimeStatusLabel,
  mcpContainerRuntimeTone,
  mcpDefaultCapabilityInstallActionState,
  mcpDefaultCapabilityRuntimeHandoffCandidate,
  mcpInstalledServerStatusLabel,
  mcpServerInstallActionState,
  mcpServerSearchResultSubtitle,
  mcpServerUninstallActionState,
  mcpToolReviewAcceptActionState,
} from "./pluginUiModel";

describe("plugin UI model MCP runtime", () => {
  it("formats MCP runtime launch and lifecycle event diagnostics", () => {
    expect(formatPluginMcpLaunchCommand({ command: "node", args: ["server.js", "--stdio"] })).toBe("node server.js --stdio");
    expect(formatPluginMcpLaunchCommand({ args: [] })).toBe("(missing command)");
    expect(
      formatPluginMcpRuntimeEvent({
        sequence: 1,
        method: "tools/call",
        toolName: "search",
        status: "failed",
        startedAt: "2026-05-04T00:00:00.000Z",
        finishedAt: "2026-05-04T00:00:00.125Z",
        durationMs: 125,
        error: "Timed out waiting for MCP tools/call.",
      }),
    ).toBe("Call tool: search failed in 125ms - Timed out waiting for MCP tools/call.");
    expect(
      formatPluginMcpRuntimeEvent({
        sequence: 2,
        method: "restart",
        status: "succeeded",
        startedAt: "2026-05-04T00:00:00.000Z",
        durationMs: 0,
        error: "Manual runtime restart completed.",
      }),
    ).toBe("Restart ok in 0ms - Manual runtime restart completed.");
    expect(
      formatPluginMcpRuntimeEvent({
        sequence: 3,
        method: "stderr",
        status: "succeeded",
        startedAt: "2026-05-04T00:00:00.000Z",
        error: "warning",
      }),
    ).toBe("stderr ok - warning");
  });

  it("models MCP server registry and lifecycle actions", () => {
    const result = {
      serverId: "context7",
      title: "Context7",
      description: "Library documentation.",
      transport: "streamable-http",
      tier: "community",
      status: "active",
      tags: ["docs"],
      tools: ["resolve-library-id", "get-library-docs"],
      installed: false,
      riskHints: [],
    };
    expect(mcpServerSearchResultSubtitle(result)).toBe("Streamable Http - Community - Active - 2 tools - not installed");

    const preview = {
      serverId: "context7",
      title: "Context7",
      summary: "Install Context7.",
      sourceSummary: "ToolHive registry",
      runtimeSummary: "ToolHive",
      permissionSummary: "Network isolated",
      secretSummary: "No secrets",
      validationSummary: "Valid",
      blockers: [],
      warnings: [],
      riskLevel: "low",
      riskReasons: ["registry server"],
      runPlan: {
        serverId: "context7",
        workloadName: "ambient-context7",
        group: "ambient",
        isolateNetwork: true,
        transport: "streamable-http",
        permissionProfilePath: "/tmp/profile.json",
        sourceRef: "toolhive-registry:context7",
      },
      permissionProfile: { path: "/tmp/profile.json", sha256: "abc" },
      expectedTools: ["get-library-docs"],
      reviewText: "Install Context7.",
    };
    expect(mcpServerInstallActionState(preview)).toMatchObject({
      label: "Install",
      disabled: false,
      visible: true,
      title: expect.stringContaining("ambient-context7"),
    });
    expect(mcpServerInstallActionState({ ...preview, blockers: ["Secret TOKEN is required."], runPlan: undefined })).toMatchObject({
      label: "Blocked",
      disabled: true,
      title: "Secret TOKEN is required.",
    });
    expect(mcpServerInstallActionState(preview, "install:context7")).toMatchObject({
      label: "Installing",
      disabled: true,
    });

    const installed = {
      serverId: "context7",
      workloadName: "ambient-context7",
      permissionProfilePath: "/tmp/profile.json",
      permissionProfileSha256: "abc",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
      workloadStatus: "running",
    };
    expect(mcpInstalledServerStatusLabel(installed)).toBe("Running");
    expect(mcpServerUninstallActionState(installed)).toMatchObject({
      label: "Uninstall",
      disabled: false,
    });
    expect(mcpServerUninstallActionState(installed, "uninstall:context7:ambient-context7")).toMatchObject({
      label: "Removing",
      disabled: true,
    });
    expect(mcpToolReviewAcceptActionState(installed)).toMatchObject({
      visible: false,
    });
    const drifted = {
      ...installed,
      lastKnownToolDescriptorHash: "hash123",
      toolDescriptorReviewStatus: "needs-review" as const,
    };
    expect(mcpToolReviewAcceptActionState(drifted)).toMatchObject({
      label: "Trust tools",
      disabled: false,
      visible: true,
    });
    expect(mcpToolReviewAcceptActionState(drifted, "tool-review:context7:ambient-context7")).toMatchObject({
      label: "Trusting",
      disabled: true,
      visible: true,
    });
  });

  it("models MCP container runtime status for the plugin settings surface", () => {
    expect(mcpContainerRuntimeStatusLabel("ready")).toBe("Ready");
    expect(mcpContainerRuntimeStatusLabel("installed-not-running")).toBe("Installed, not running");
    expect(mcpContainerRuntimeStatusLabel("blocked-by-permissions")).toBe("Permission repair needed");
    expect(mcpContainerRuntimeStatusLabel("missing")).toBe("Runtime missing");
    expect(mcpContainerRuntimeTone("ready")).toBe("success");
    expect(mcpContainerRuntimeTone("blocked-by-permissions")).toBe("warning");
    expect(mcpContainerRuntimeTone("missing")).toBe("warning");
    expect(mcpContainerRuntimeTone("unsupported")).toBe("error");
    expect(mcpContainerRuntimePrimaryActionLabel("installed-not-running")).toBe("Retry after starting runtime");
    expect(mcpContainerRuntimePrimaryActionLabel("blocked-by-permissions")).toBe("Open permission repair steps");

    const rows = mcpContainerRuntimeDetailRows({
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "missing",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:00:00.000Z",
      durationMs: 12,
      message: "No container runtime detected.",
      nextAction: "install-runtime",
      toolHive: {
        status: "ready",
        message: "ToolHive is ready.",
        preflightOk: false,
        versionLine: "ToolHive v0.28.2",
      },
      hosts: [
        {
          kind: "docker",
          status: "missing",
          message: "docker CLI was not found.",
        },
      ],
      processHints: [
        {
          kind: "podman",
          pid: 101,
          processName: "Podman Desktop",
          applicationPath: "/Applications/Podman Desktop.app",
          confidence: "high",
          reason: "Podman process detected as Podman Desktop at /Applications/Podman Desktop.app",
        },
      ],
      setup: {
        userDecision: "install-launched",
        shouldPrompt: false,
        promptSuppressed: true,
        reason: "install-launched",
        lastDecisionAt: "2026-05-23T20:10:00.000Z",
        installActionId: "podman-desktop-macos",
        installRuntime: "podman",
        installUrl: "https://podman-desktop.io/downloads",
        upgradeReconciledAppVersion: "1.2.3",
      },
      postInstallQueue: [
        {
          kind: "default-capability",
          capabilityId: "scrapling",
          status: "blocked",
        },
      ],
      defaultCapabilities: [
        {
          schemaVersion: "ambient-mcp-default-capability-v1",
          capabilityId: "scrapling",
          title: "Scrapling",
          status: "blocked_runtime",
          nextAction: "install-runtime",
          message: "Scrapling is blocked until the isolated runtime is ready.",
          serverId: "io.github.d4vinci/scrapling",
          workloadName: "ambient-scrapling",
          descriptorHash: "descriptor-sha",
          imageDigest: "sha256:abc",
          runtimeStatus: "missing",
          lastReconciledAt: "2026-05-23T20:10:00.000Z",
          appVersion: "1.2.3",
        },
      ],
      installPlan: {
        schemaVersion: "ambient-container-runtime-install-plan-v1",
        platform: "darwin",
        arch: "arm64",
        status: "missing",
        preferredRuntime: "podman",
        summary: "Install Podman Desktop.",
        primaryAction: {
          id: "podman-desktop-macos",
          label: "Open Podman Desktop download",
          kind: "open-installer",
          runtime: "podman",
          url: "https://podman-desktop.io/downloads",
          reason: "Preferred runtime.",
        },
        alternatives: [],
        prerequisites: [],
        warnings: [],
        postInstallSteps: [],
      },
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        "Runtime: Not detected",
        "ToolHive: Ready",
        "Next: Install Runtime",
        "Setup: Open Podman Desktop download",
        "Prompt: Install Launched",
        "Last setup action: podman-desktop-macos",
        "Last setup runtime: Podman",
        "Process: Podman Podman Desktop at /Applications/Podman Desktop.app confidence high",
        "Scrapling: Blocked",
        "Scrapling Reconcile: Blocked Runtime",
      ]),
    );
    expect(
      mcpContainerRuntimeSetupResumeRows({
        schemaVersion: "ambient-container-runtime-probe-v1",
        status: "missing",
        platform: "darwin",
        arch: "arm64",
        checkedAt: "2026-05-23T20:00:00.000Z",
        durationMs: 12,
        message: "No container runtime detected.",
        nextAction: "install-runtime",
        toolHive: { status: "ready", message: "ToolHive is ready." },
        hosts: [],
        setup: {
          userDecision: "install-launched",
          shouldPrompt: false,
          promptSuppressed: true,
          reason: "install-launched",
          lastDecisionAt: "2026-05-23T20:10:00.000Z",
          installActionId: "podman-desktop-macos",
          installRuntime: "podman",
          installUrl: "https://podman-desktop.io/downloads",
        },
        postInstallQueue: [],
        defaultCapabilities: [],
      }),
    ).toEqual([
      "Last setup action: podman-desktop-macos",
      "Runtime: Podman",
      "Opened URL: https://podman-desktop.io/downloads",
      "Opened at: 2026-05-23T20:10:00.000Z",
    ]);
  });

  it("models default MCP capability setup actions", () => {
    const capability = {
      schemaVersion: "ambient-mcp-default-capability-v1" as const,
      capabilityId: "scrapling" as const,
      title: "Scrapling",
      status: "blocked_approval" as const,
      nextAction: "approve-default-capability" as const,
      message: "Runtime is ready. Scrapling is waiting for default capability approval.",
      serverId: "io.github.d4vinci/scrapling",
      workloadName: "ambient-scrapling",
      runtimeStatus: "ready" as const,
      lastReconciledAt: "2026-05-23T20:10:00.000Z",
      appVersion: "1.2.3",
    };

    expect(mcpDefaultCapabilityInstallActionState(capability, { runtimeReady: true })).toMatchObject({
      label: "Set up Scrapling",
      disabled: false,
      visible: true,
    });
    expect(mcpDefaultCapabilityInstallActionState(capability, { runtimeReady: false })).toMatchObject({
      label: "Set up Scrapling",
      disabled: true,
      visible: true,
    });
    expect(
      mcpDefaultCapabilityInstallActionState(capability, { runtimeReady: true, busyKey: "default-capability:scrapling" }),
    ).toMatchObject({
      label: "Setting up",
      disabled: true,
      visible: true,
    });
    expect(
      mcpDefaultCapabilityInstallActionState(
        {
          ...capability,
          status: "warming_up",
          nextAction: "none",
          installedWorkloadStatus: "starting",
          unhealthySince: "2026-05-23T20:10:00.000Z",
          retryAfter: "2026-05-23T20:11:30.000Z",
        },
        { runtimeReady: true },
      ),
    ).toMatchObject({
      label: "Checking",
      disabled: true,
      visible: true,
    });
    expect(
      mcpDefaultCapabilityInstallActionState(
        {
          ...capability,
          status: "failed",
          nextAction: "install-default-capability",
          installedWorkloadStatus: "exited",
        },
        { runtimeReady: true },
      ),
    ).toMatchObject({
      label: "Repair Scrapling",
      disabled: false,
      visible: true,
    });
    expect(
      mcpDefaultCapabilityInstallActionState(
        {
          ...capability,
          status: "not_configured",
          nextAction: "install-default-capability",
          installedWorkloadStatus: "starting",
        },
        { runtimeReady: true },
      ),
    ).toMatchObject({
      label: "Retry Scrapling",
      disabled: false,
      visible: true,
    });
    expect(mcpDefaultCapabilityInstallActionState({ ...capability, status: "installed", nextAction: "none" })).toMatchObject({
      visible: false,
    });
  });

  it("selects a default MCP capability handoff only after runtime readiness", () => {
    const capability = {
      schemaVersion: "ambient-mcp-default-capability-v1" as const,
      capabilityId: "scrapling" as const,
      title: "Scrapling",
      status: "blocked_approval" as const,
      nextAction: "approve-default-capability" as const,
      message: "Runtime is ready. Scrapling is waiting for default capability approval.",
      serverId: "io.github.d4vinci/scrapling",
      workloadName: "ambient-scrapling",
      runtimeStatus: "ready" as const,
      lastReconciledAt: "2026-05-23T20:10:00.000Z",
      appVersion: "1.2.3",
    };
    const status = {
      schemaVersion: "ambient-container-runtime-probe-v1" as const,
      status: "ready" as const,
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "Runtime ready.",
      nextAction: "none" as const,
      toolHive: {
        status: "ready" as const,
        message: "ToolHive is ready.",
        preflightOk: true,
      },
      hosts: [],
      setup: {
        userDecision: "none" as const,
        shouldPrompt: false,
        promptSuppressed: false,
        reason: "runtime-ready" as const,
      },
      postInstallQueue: [],
      defaultCapabilities: [capability],
    };

    expect(mcpDefaultCapabilityRuntimeHandoffCandidate(status)).toBe(capability);
    expect(
      mcpDefaultCapabilityRuntimeHandoffCandidate({ ...status, status: "missing", defaultCapabilities: [capability] }),
    ).toBeUndefined();
    expect(
      mcpDefaultCapabilityRuntimeHandoffCandidate({
        ...status,
        defaultCapabilities: [{ ...capability, status: "installed", nextAction: "none" }],
      }),
    ).toBeUndefined();
    expect(
      mcpDefaultCapabilityRuntimeHandoffCandidate({
        ...status,
        defaultCapabilities: [{ ...capability, status: "needs_review", nextAction: "review-descriptor" }],
      }),
    ).toBeUndefined();
    expect(
      mcpDefaultCapabilityRuntimeHandoffCandidate({
        ...status,
        defaultCapabilities: [
          {
            ...capability,
            status: "warming_up",
            nextAction: "none",
            installedWorkloadStatus: "starting",
            retryAfter: "2026-05-23T20:11:30.000Z",
          },
        ],
      }),
    ).toBeUndefined();
  });

  it("opens the MCP startup panel for runtime prompts or ready default capability handoff", () => {
    const baseStatus = {
      schemaVersion: "ambient-container-runtime-probe-v1" as const,
      status: "missing" as const,
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "No runtime detected.",
      nextAction: "install-runtime" as const,
      toolHive: {
        status: "ready" as const,
        message: "ToolHive is ready.",
      },
      hosts: [],
      setup: {
        userDecision: "none" as const,
        shouldPrompt: true,
        promptSuppressed: false,
        reason: "runtime-missing" as const,
      },
      postInstallQueue: [],
      defaultCapabilities: [],
    };
    const handoffCapability = {
      schemaVersion: "ambient-mcp-default-capability-v1" as const,
      capabilityId: "scrapling" as const,
      title: "Scrapling",
      status: "blocked_approval" as const,
      nextAction: "approve-default-capability" as const,
      message: "Runtime is ready. Scrapling is waiting for default capability approval.",
      serverId: "io.github.d4vinci/scrapling",
      workloadName: "ambient-scrapling",
      runtimeStatus: "ready" as const,
      lastReconciledAt: "2026-05-23T20:10:00.000Z",
      appVersion: "1.2.3",
    };

    expect(mcpContainerRuntimeShouldOpenStartupPanel(baseStatus)).toBe(true);
    expect(
      mcpContainerRuntimeShouldOpenStartupPanel({
        ...baseStatus,
        setup: { ...baseStatus.setup, shouldPrompt: false, promptSuppressed: true, reason: "user-deferred" },
      }),
    ).toBe(false);
    expect(
      mcpContainerRuntimeShouldOpenStartupPanel({
        ...baseStatus,
        status: "ready",
        message: "Runtime ready.",
        nextAction: "none",
        setup: { ...baseStatus.setup, shouldPrompt: false, reason: "runtime-ready" },
        defaultCapabilities: [handoffCapability],
      }),
    ).toBe(true);
    expect(
      mcpContainerRuntimeShouldOpenStartupPanel({
        ...baseStatus,
        status: "ready",
        message: "Runtime ready.",
        nextAction: "none",
        setup: { ...baseStatus.setup, shouldPrompt: false, reason: "runtime-ready" },
        defaultCapabilities: [{ ...handoffCapability, status: "installed", nextAction: "none" }],
      }),
    ).toBe(false);
    expect(
      mcpContainerRuntimeShouldOpenStartupPanel({
        ...baseStatus,
        status: "ready",
        message: "Runtime ready.",
        nextAction: "none",
        setup: { ...baseStatus.setup, shouldPrompt: false, reason: "runtime-ready" },
        defaultCapabilities: [
          {
            ...handoffCapability,
            status: "warming_up",
            nextAction: "none",
            installedWorkloadStatus: "starting",
            retryAfter: "2026-05-23T20:11:30.000Z",
          },
        ],
      }),
    ).toBe(false);
  });

  it("models MCP runtime diagnostic export action state", () => {
    const baseStatus: AmbientMcpContainerRuntimeStatus = {
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "missing",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "No runtime detected.",
      nextAction: "install-runtime",
      toolHive: {
        status: "ready",
        message: "ToolHive is ready.",
      },
      hosts: [],
      setup: {
        userDecision: "none",
        shouldPrompt: true,
        promptSuppressed: false,
        reason: "runtime-missing",
      },
      postInstallQueue: [],
      defaultCapabilities: [],
    };
    const installedScrapling: AmbientMcpDefaultCapabilitySummary = {
      schemaVersion: "ambient-mcp-default-capability-v1",
      capabilityId: "scrapling",
      title: "Scrapling",
      status: "installed",
      nextAction: "none",
      message: "Scrapling is installed.",
      serverId: "io.github.d4vinci/scrapling",
      workloadName: "ambient-scrapling",
      runtimeStatus: "ready",
      lastReconciledAt: "2026-05-23T20:10:00.000Z",
      appVersion: "1.2.3",
    };
    const readyStatus: AmbientMcpContainerRuntimeStatus = {
      ...baseStatus,
      status: "ready",
      message: "Runtime ready.",
      nextAction: "none",
      setup: { ...baseStatus.setup, shouldPrompt: false, reason: "runtime-ready" },
      defaultCapabilities: [installedScrapling],
    };

    expect(mcpContainerRuntimeDiagnosticsActionState(undefined).visible).toBe(false);
    expect(mcpContainerRuntimeDiagnosticsActionState(readyStatus).visible).toBe(false);

    const missingAction = mcpContainerRuntimeDiagnosticsActionState(baseStatus);
    expect(missingAction).toMatchObject({
      label: "Export diagnostics",
      disabled: false,
      visible: true,
    });
    expect(missingAction.title).toContain("runtime probe state");

    const errorAction = mcpContainerRuntimeDiagnosticsActionState(readyStatus, { error: "ToolHive preflight failed" });
    expect(errorAction.visible).toBe(true);
    expect(errorAction.title).toContain("ToolHive preflight failed");

    const failedCapabilityAction = mcpContainerRuntimeDiagnosticsActionState({
      ...readyStatus,
      defaultCapabilities: [{ ...installedScrapling, status: "failed", nextAction: "inspect-failure", message: "Smoke test failed." }],
    });
    expect(failedCapabilityAction.visible).toBe(true);
    expect(failedCapabilityAction.title).toContain("default capability reconciliation");

    expect(mcpContainerRuntimeDiagnosticsActionState(baseStatus, { busy: true })).toMatchObject({
      label: "Exporting",
      disabled: true,
      visible: true,
    });
  });

  it("models all safe MCP runtime install and recovery launcher choices", () => {
    const status: AmbientMcpContainerRuntimeStatus = {
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "missing",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "No runtime detected.",
      nextAction: "install-runtime",
      toolHive: {
        status: "ready",
        message: "ToolHive is ready.",
      },
      hosts: [],
      setup: {
        userDecision: "none",
        shouldPrompt: true,
        promptSuppressed: false,
        reason: "runtime-missing",
      },
      postInstallQueue: [],
      defaultCapabilities: [],
      installPlan: {
        schemaVersion: "ambient-container-runtime-install-plan-v1",
        platform: "darwin",
        arch: "arm64",
        status: "missing",
        preferredRuntime: "podman",
        summary: "Install Podman Desktop.",
        primaryAction: {
          id: "podman-desktop-macos",
          label: "Open Podman Desktop download",
          kind: "open-installer",
          runtime: "podman",
          url: "https://podman-desktop.io/downloads",
          reason: "Podman is the preferred fresh install path.",
        },
        alternatives: [
          {
            id: "podman-cli-macos-docs",
            label: "Open Podman CLI install docs",
            kind: "open-documentation",
            runtime: "podman",
            url: "https://podman.io/docs/installation",
            reason: "Use this if you prefer Homebrew.",
          },
          {
            id: "docker-desktop-macos",
            label: "Open Docker Desktop download",
            kind: "open-installer",
            runtime: "docker",
            url: "https://www.docker.com/products/docker-desktop/",
            reason: "Docker Desktop is accepted if you already prefer Docker.",
          },
          {
            id: "docker-desktop-macos",
            label: "Open Docker Desktop download",
            kind: "open-installer",
            runtime: "docker",
            url: "https://www.docker.com/products/docker-desktop/",
            reason: "Duplicate fixture.",
          },
        ],
        prerequisites: [],
        warnings: [],
        postInstallSteps: [],
      },
    };

    expect(mcpContainerRuntimeInstallActionViews(undefined)).toEqual([]);
    expect(mcpContainerRuntimeInstallActionViews(status)).toEqual([
      expect.objectContaining({
        actionId: "podman-desktop-macos",
        primary: true,
        disabled: false,
        runtime: "podman",
        kind: "open-installer",
      }),
      expect.objectContaining({
        actionId: "podman-cli-macos-docs",
        primary: false,
        disabled: false,
        runtime: "podman",
        kind: "open-documentation",
      }),
      expect.objectContaining({
        actionId: "docker-desktop-macos",
        primary: false,
        disabled: false,
        runtime: "docker",
        kind: "open-installer",
      }),
    ]);
    expect(mcpContainerRuntimeInstallActionViews(status, { launchBusy: true }).every((action) => action.disabled)).toBe(true);
  });

  it("models managed MCP runtime install command previews", () => {
    const status: AmbientMcpContainerRuntimeStatus = {
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "missing",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "No runtime detected.",
      nextAction: "install-runtime",
      toolHive: {
        status: "ready",
        message: "ToolHive is ready.",
      },
      hosts: [],
      setup: {
        userDecision: "none",
        shouldPrompt: true,
        promptSuppressed: false,
        reason: "runtime-missing",
      },
      postInstallQueue: [],
      defaultCapabilities: [],
      installPlan: {
        schemaVersion: "ambient-container-runtime-install-plan-v1",
        platform: "darwin",
        arch: "arm64",
        status: "missing",
        preferredRuntime: "podman",
        summary: "Install Podman Desktop.",
        primaryAction: {
          id: "podman-desktop-macos-homebrew",
          label: "Install Podman Desktop with Homebrew",
          kind: "managed-install",
          runtime: "podman",
          url: "https://podman-desktop.io/downloads/macos",
          reason: "Install through Homebrew.",
          managedInstall: {
            schemaVersion: "ambient-container-runtime-managed-install-v1",
            execution: "user-command",
            strategy: "homebrew-cask-podman-desktop",
            packageName: "podman-desktop",
            platform: "darwin",
            requiresCredential: false,
            commands: [
              {
                exe: "brew",
                args: ["install", "--cask", "podman-desktop"],
                rationale: "Install Podman Desktop.",
              },
            ],
            fallbackActionIds: ["podman-desktop-macos"],
          },
        },
        alternatives: [],
        prerequisites: [],
        warnings: [],
        postInstallSteps: [],
      },
    };

    expect(mcpContainerRuntimeInstallActionViews(status)).toEqual([
      expect.objectContaining({
        actionId: "podman-desktop-macos-homebrew",
        kind: "managed-install",
        busyLabel: "Installing",
        commandPreview: "brew install --cask podman-desktop",
        managedExecution: "user-command",
        title: expect.stringContaining("Commands: brew install --cask podman-desktop"),
      }),
    ]);
  });

  it("models MCP runtime lifecycle restart controls", () => {
    const wedgedStatus: AmbientMcpContainerRuntimeStatus = {
      schemaVersion: "ambient-container-runtime-probe-v1",
      status: "installed-not-running",
      runtime: "docker",
      reason: "desktop-app-not-responding",
      platform: "darwin",
      arch: "arm64",
      checkedAt: "2026-05-23T20:10:00.000Z",
      durationMs: 12,
      message: "Docker Desktop is installed but not responding.",
      nextAction: "start-runtime",
      toolHive: {
        status: "ready",
        message: "ToolHive is ready.",
      },
      hosts: [
        {
          kind: "docker",
          status: "installed-not-running",
          reason: "desktop-app-not-responding",
          message: "Docker Desktop did not respond to probe.",
        },
      ],
      setup: {
        userDecision: "none",
        shouldPrompt: false,
        promptSuppressed: false,
        reason: "runtime-not-missing",
      },
      postInstallQueue: [],
      defaultCapabilities: [],
    };

    expect(mcpContainerRuntimeLifecycleActionViews(undefined)).toEqual([]);
    expect(mcpContainerRuntimeLifecycleActionViews({ ...wedgedStatus, status: "ready", nextAction: "none" })).toEqual([]);
    expect(mcpContainerRuntimeLifecycleActionViews({ ...wedgedStatus, status: "missing", nextAction: "install-runtime" })).toEqual([]);

    const actions = mcpContainerRuntimeLifecycleActionViews(wedgedStatus);
    expect(actions).toEqual([
      expect.objectContaining({ action: "restart", label: "Preview restart", primary: true, danger: false, disabled: false }),
      expect.objectContaining({
        action: "force-quit-and-restart",
        label: "Preview force quit",
        primary: false,
        danger: true,
        disabled: false,
      }),
      expect.objectContaining({ action: "open-recovery", label: "Preview recovery", primary: false, danger: false, disabled: false }),
    ]);
    expect(actions[1]?.title).toContain("including non-Ambient containers");
    expect(mcpContainerRuntimeLifecycleActionViews(wedgedStatus, { busyKey: "preview:restart" })).toEqual([
      expect.objectContaining({ action: "restart", label: "Previewing", disabled: true }),
      expect.objectContaining({ action: "force-quit-and-restart", disabled: true }),
      expect.objectContaining({ action: "open-recovery", disabled: true }),
    ]);
    expect(
      mcpContainerRuntimeLifecycleActionViews({
        ...wedgedStatus,
        status: "blocked-by-permissions",
        reason: "permission-denied",
        nextAction: "repair-permissions",
      }).map((action) => action.action),
    ).toEqual(["open-recovery"]);
  });

  it("models MCP runtime lifecycle preview, confirmation, progress, and result status", () => {
    const preview: AmbientMcpContainerRuntimeLifecyclePreview = {
      schemaVersion: "ambient-container-runtime-lifecycle-preview-v1",
      previewId: "docker:force-quit-and-restart:desktop-app-not-responding:darwin",
      action: "force-quit-and-restart",
      runtime: "docker",
      platform: "darwin",
      status: "available",
      reason: "desktop-app-not-responding",
      summary: "Force quit Docker Desktop, relaunch it, and poll ToolHive until the runtime is ready.",
      requiresConfirmation: true,
      warnings: ["Force quit may terminate Docker Desktop before it can stop containers cleanly."],
      targets: [
        {
          kind: "process",
          runtime: "docker",
          label: "Docker Desktop process",
          identifier: "Docker",
          platform: "darwin",
          verified: true,
          reason: "Allowlisted Docker Desktop process identity for force quit.",
        },
      ],
      commands: [
        {
          exe: "osascript",
          args: ["-e", 'tell application "Docker" to quit'],
          rationale: "Ask Docker Desktop to quit.",
          destructive: true,
        },
      ],
      expectedInterruption: "Restarting Docker can interrupt all containers using that runtime, including non-Ambient containers.",
      createdAt: "2026-05-23T20:10:00.000Z",
    };
    const progress: AmbientMcpContainerRuntimeLifecycleProgress = {
      schemaVersion: "ambient-container-runtime-lifecycle-progress-v1",
      action: "force-quit-and-restart",
      runtime: "docker",
      phase: "force-stop-started",
      status: "running",
      message: "Force quitting Docker Desktop.",
      recordedAt: "2026-05-23T20:10:01.000Z",
    };
    const result: AmbientMcpContainerRuntimeLifecycleResult = {
      schemaVersion: "ambient-container-runtime-lifecycle-result-v1",
      action: "force-quit-and-restart",
      runtime: "docker",
      status: "ready",
      reason: "none",
      message: "Docker restart completed and ToolHive preflight is ready.",
      preview,
      progress: [progress],
      logPath: "/tmp/ambient/mcp-container-runtime/restart.json",
      durationMs: 1200,
    };

    expect(mcpContainerRuntimeLifecyclePreviewRows(preview)).toEqual(
      expect.arrayContaining([
        "Action: Force Quit And Restart",
        "Runtime: Docker",
        "Interruption: Restarting Docker can interrupt all containers using that runtime, including non-Ambient containers.",
        "Targets: 1",
        "Commands: 1",
      ]),
    );
    expect(mcpContainerRuntimeLifecycleWarnings(preview)).toEqual([
      mcpContainerRuntimeLifecycleForceWarningText,
      "Force quit may terminate Docker Desktop before it can stop containers cleanly.",
    ]);
    expect(mcpContainerRuntimeLifecycleCommandPreview(preview.commands[0]!)).toBe('osascript -e tell application "Docker" to quit');
    expect(mcpContainerRuntimeLifecycleRunActionState(preview)).toMatchObject({
      label: "Confirm force quit and restart",
      disabled: false,
      danger: true,
      title: mcpContainerRuntimeLifecycleForceWarningText,
    });
    expect(mcpContainerRuntimeLifecycleRunActionState({ ...preview, status: "blocked" })).toMatchObject({
      disabled: true,
    });
    expect(mcpContainerRuntimeLifecycleStatusView({ preview })).toEqual({ kind: "info", message: preview.summary });
    expect(mcpContainerRuntimeLifecycleStatusView({ progress })).toEqual({ kind: "info", message: progress.message });
    expect(mcpContainerRuntimeLifecycleStatusView({ result })).toEqual({ kind: "success", message: result.message });
    expect(mcpContainerRuntimeLifecycleStatusView({ error: "Lifecycle IPC failed" })).toEqual({
      kind: "error",
      message: "Lifecycle IPC failed",
    });
  });
});
