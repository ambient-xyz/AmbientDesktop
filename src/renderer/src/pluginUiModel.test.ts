import { describe, expect, it } from "vitest";
import type {
  AmbientPluginAppAuthSummary,
  AmbientPluginCapabilitySummary,
  AmbientPluginRegistry,
  AmbientPluginSummary,
  CodexPluginSummary,
  FirstPartyGoogleIntegrationState,
} from "../../shared/pluginTypes";
import {
  capabilityDiagnosticsActionState,
  codexImportActionState,
  codexMarketplaceAddActionState,
  codexMarketplaceRemoveActionState,
  dedupeGoogleWorkspaceAccounts,
  filterAmbientCapabilities,
  filterAmbientPluginsBySource,
  formatAmbientAvailability,
  formatAmbientCapabilityKind,
  formatAmbientPluginSourceKind,
  formatAmbientRuntimeSupport,
  googleWorkspaceAccountRows,
  googleWorkspaceActionState,
  googleWorkspaceConnectorLabel,
  googleWorkspaceValidationButtonView,
  googleWorkspaceValidationFeedbackForAccount,
  googleWorkspaceStatusItems,
  groupCodexImportCandidates,
  piExtensionSandboxUninstallActionState,
  piPackageEnableActionState,
  piPackageInstallActionState,
  piPackageUninstallActionState,
  piPrivilegedDisableActionState,
  piPrivilegedUninstallActionState,
  pluginAuthCompleteActionState,
  pluginDetailsActionState,
  workflowPluginRequirementRows,
} from "./pluginUiModel";

describe("plugin UI model", () => {
  it("formats plugin source, capability, availability, and runtime labels", () => {
    expect(formatAmbientPluginSourceKind("pi-ambient-workspace")).toBe("Pi Ambient workspace");
    expect(formatAmbientPluginSourceKind("codex-ambient-curated")).toBe("Ambient curated");
    expect(formatAmbientPluginSourceKind("codex-remote-marketplace")).toBe("Codex remote");
    expect(formatAmbientPluginSourceKind("ambient-cli")).toBe("Ambient CLI");
    expect(formatAmbientCapabilityKind("mcp-tool")).toBe("MCP tool");
    expect(formatAmbientCapabilityKind("runtime-extension")).toBe("Runtime extension");
    expect(formatAmbientAvailability("auth-required")).toBe("Needs auth");
    expect(formatAmbientAvailability("untrusted")).toBe("Needs trust");
    expect(formatAmbientRuntimeSupport(["chat", "workflow", "automation"])).toBe("Chat, Workflow, Automation");
  });

  it("models Codex import button labels and disabled states", () => {
    expect(codexImportActionState({ compatibilityTier: "supported", imported: false, sourceKind: "codex-cache" })).toMatchObject({
      label: "Import",
      disabled: false,
      visible: true,
    });
    expect(codexImportActionState({ compatibilityTier: "partial", imported: false, sourceKind: "remote-marketplace" })).toMatchObject({
      label: "Register",
      disabled: false,
      visible: true,
    });
    expect(
      codexImportActionState({ compatibilityTier: "supported", imported: false, sourceKind: "remote-marketplace", updateAvailable: true }),
    ).toMatchObject({
      label: "Update",
      disabled: false,
      title: expect.stringContaining("Update"),
    });
    expect(codexImportActionState({ compatibilityTier: "unsupported", imported: false, sourceKind: "codex-cache" })).toMatchObject({
      label: "Import",
      disabled: true,
      title: expect.stringContaining("Unsupported"),
    });
    expect(codexImportActionState({ compatibilityTier: "supported", imported: true, sourceKind: "remote-marketplace" })).toMatchObject({
      label: "Registered",
      disabled: true,
    });
  });

  it("groups Codex import candidates by marketplace source", () => {
    const candidates = [
      { id: "curated", name: "curated", sourceKind: "remote-marketplace" as const, marketplaceKind: "ambient-curated" as const },
      { id: "remote", name: "remote", sourceKind: "remote-marketplace" as const, marketplaceKind: "remote" as const },
      { id: "cache", name: "cache", sourceKind: "codex-cache" as const, marketplaceKind: "workspace" as const },
    ] as CodexPluginSummary[];

    expect(groupCodexImportCandidates(candidates)).toMatchObject({
      curated: [expect.objectContaining({ name: "curated" })],
      remote: [expect.objectContaining({ name: "remote" })],
      localCache: [expect.objectContaining({ name: "cache" })],
    });
  });

  it("models Codex marketplace remove button visibility and busy state", () => {
    expect(codexMarketplaceRemoveActionState({ id: "workspace:.agents/plugins/marketplace.json", removable: false })).toMatchObject({
      label: "Remove",
      disabled: true,
      visible: false,
    });
    expect(codexMarketplaceRemoveActionState({ id: "url:https://example.test/marketplace.json", removable: true })).toMatchObject({
      label: "Remove",
      disabled: false,
      visible: true,
    });
    expect(
      codexMarketplaceRemoveActionState(
        { id: "url:https://example.test/marketplace.json", removable: true },
        "url:https://example.test/marketplace.json",
      ),
    ).toMatchObject({
      label: "Removing",
      disabled: true,
    });
  });

  it("models Pi package install button visibility and disabled states", () => {
    expect(piPackageInstallActionState({ packageSpec: "npm:pi-subagents", installed: false }, false)).toMatchObject({
      label: "Install",
      disabled: false,
      title: expect.stringContaining("workspace package state"),
      visible: true,
    });
    expect(piPackageInstallActionState({ packageSpec: "npm:pi-subagents", installed: false }, false, "global")).toMatchObject({
      title: expect.stringContaining("global package state"),
    });
    expect(piPackageInstallActionState({ packageSpec: "npm:pi-subagents", installed: false }, true)).toMatchObject({
      label: "Install",
      disabled: true,
      title: expect.stringContaining("in progress"),
      visible: true,
    });
    expect(piPackageInstallActionState({ packageSpec: "npm:pi-subagents", installed: true }, false)).toMatchObject({
      label: "Installed",
      disabled: true,
      visible: false,
    });
    expect(piPackageInstallActionState({ installed: false }, false)).toMatchObject({
      label: "Install",
      disabled: true,
      visible: false,
    });
  });

  it("models Pi package enable toggle visibility and disabled states", () => {
    const declarative = {
      installed: true,
      enabled: false,
      compatibilityTier: "supported" as const,
      resourceCounts: { extension: 0, skill: 1, prompt: 0, theme: 0 },
    };
    expect(piPackageEnableActionState(declarative, false)).toMatchObject({
      label: "Disabled",
      disabled: false,
      visible: true,
      title: expect.stringContaining("declarative Pi resources"),
    });
    expect(piPackageEnableActionState({ ...declarative, enabled: true }, false)).toMatchObject({
      label: "Enabled",
      disabled: false,
      title: expect.stringContaining("Disable"),
    });
    expect(piPackageEnableActionState(declarative, true)).toMatchObject({
      disabled: true,
      visible: true,
    });
    expect(piPackageEnableActionState({ ...declarative, installed: false }, false)).toMatchObject({
      visible: false,
      disabled: true,
    });
    expect(
      piPackageEnableActionState({ ...declarative, resourceCounts: { extension: 1, skill: 1, prompt: 0, theme: 0 } }, false),
    ).toMatchObject({
      disabled: true,
      title: expect.stringContaining("extensions"),
    });
    expect(piPackageEnableActionState({ ...declarative, compatibilityTier: "unsupported" }, false)).toMatchObject({
      disabled: true,
      title: expect.stringContaining("Unsupported"),
    });
  });

  it("models Pi package uninstall button visibility and busy state", () => {
    expect(piPackageUninstallActionState({ id: "pkg-1", installed: false }, undefined)).toMatchObject({
      label: "Uninstall",
      disabled: true,
      visible: false,
    });
    expect(piPackageUninstallActionState({ id: "pkg-1", installed: true }, undefined)).toMatchObject({
      label: "Uninstall",
      disabled: false,
      visible: true,
    });
    expect(piPackageUninstallActionState({ id: "pkg-1", installed: true }, "pkg-1")).toMatchObject({
      label: "Removing",
      disabled: true,
      title: expect.stringContaining("removing"),
    });
    expect(piPackageUninstallActionState({ id: "pkg-1", installed: true }, "pkg-2")).toMatchObject({
      label: "Uninstall",
      disabled: true,
      visible: true,
    });
  });

  it("models sandboxed and privileged Pi package management actions", () => {
    expect(piExtensionSandboxUninstallActionState({ id: "sandbox-1" })).toMatchObject({
      label: "Uninstall",
      disabled: false,
      visible: true,
    });
    expect(piExtensionSandboxUninstallActionState({ id: "sandbox-1" }, "sandbox-1")).toMatchObject({
      label: "Removing",
      disabled: true,
      title: expect.stringContaining("revoking"),
    });
    expect(piPrivilegedDisableActionState({ id: "priv-1", status: "disabled" })).toMatchObject({
      label: "Disable",
      disabled: true,
      title: expect.stringContaining("already disabled"),
    });
    expect(piPrivilegedDisableActionState({ id: "priv-1", status: "active" })).toMatchObject({
      label: "Disable",
      disabled: false,
    });
    expect(piPrivilegedUninstallActionState({ id: "priv-1" }, "priv-1")).toMatchObject({
      label: "Removing",
      disabled: true,
    });
  });

  it("filters plugin rows by source and capabilities by source/runtime", () => {
    const plugins: AmbientPluginSummary[] = [
      {
        id: "codex:one",
        sourcePluginId: "one",
        sourceKind: "codex-workspace" as const,
        sourceLabel: "Workspace",
        name: "one",
        installState: "installed" as const,
        compatibilityTier: "supported" as const,
        enabled: true,
        trusted: true,
        capabilityCount: 1,
        supportLabels: [],
        diagnostics: [],
      },
      {
        id: "pi:two",
        sourcePluginId: "two",
        sourceKind: "pi-gallery" as const,
        sourceLabel: "Gallery",
        name: "two",
        installState: "importable" as const,
        compatibilityTier: "partial" as const,
        enabled: false,
        trusted: false,
        capabilityCount: 1,
        supportLabels: [],
        diagnostics: [],
      },
    ];
    const capabilities: AmbientPluginCapabilitySummary[] = [
      {
        id: "cap-chat",
        pluginId: "one",
        pluginName: "one",
        kind: "skill" as const,
        name: "chat skill",
        sourceKind: "codex-workspace" as const,
        runtimeSupport: ["chat"],
        enabled: true,
        trusted: true,
        availability: "available" as const,
        supportLabels: [],
        diagnostics: [],
      },
      {
        id: "cap-workflow",
        pluginId: "two",
        pluginName: "two",
        kind: "tool" as const,
        name: "workflow tool",
        sourceKind: "pi-gallery" as const,
        runtimeSupport: ["workflow", "automation"],
        enabled: false,
        trusted: false,
        availability: "disabled" as const,
        supportLabels: [],
        diagnostics: [],
      },
    ];

    expect(filterAmbientPluginsBySource(plugins, "pi-gallery").map((plugin) => plugin.name)).toEqual(["two"]);
    expect(filterAmbientCapabilities(capabilities, { source: "all", runtime: "workflow" }).map((capability) => capability.name)).toEqual([
      "workflow tool",
    ]);
    expect(filterAmbientCapabilities(capabilities, { source: "codex-workspace", runtime: "workflow" })).toEqual([]);
  });

  it("models capability diagnostics action state", () => {
    const capability = {
      id: "cap-1",
      availability: "auth-required" as const,
      availabilityReason: "Connect an account before using this capability.",
    };

    expect(capabilityDiagnosticsActionState(capability)).toMatchObject({
      label: "Details",
      disabled: false,
      visible: true,
      title: expect.stringContaining("Needs auth"),
    });
    expect(capabilityDiagnosticsActionState(capability, "cap-1")).toMatchObject({
      label: "Inspecting",
      disabled: false,
    });
    expect(capabilityDiagnosticsActionState(capability, "other")).toMatchObject({
      label: "Details",
      disabled: true,
    });
  });

  it("joins workflow plugin requirements with registry availability for automations", () => {
    const grant = {
      capabilityId: "plugin-1:mcp-tool:server:fixture_original",
      pluginId: "plugin-1",
      pluginName: "Fixture",
      serverName: "server",
      toolName: "fixture_original",
      registeredName: "fixture_tool",
    };
    const registry: AmbientPluginRegistry = {
      plugins: [],
      capabilities: [
        {
          id: "plugin-1:mcp-server:server",
          pluginId: "plugin-1",
          pluginName: "Fixture",
          kind: "mcp-tool" as const,
          name: "server",
          sourceKind: "codex-workspace" as const,
          runtimeSupport: ["workflow", "automation"],
          enabled: true,
          trusted: false,
          availability: "untrusted" as const,
          availabilityReason: "Trust this plugin before automation dispatch.",
          serverName: "server",
          supportLabels: [],
          diagnostics: [],
        },
      ],
      sources: [],
      errors: [],
      sourceNotes: [],
    };

    expect(workflowPluginRequirementRows([grant], registry)).toEqual([
      expect.objectContaining({
        registeredName: "fixture_tool",
        availabilityLabel: "Needs trust",
        availabilityReason: "Trust this plugin before automation dispatch.",
        blocked: true,
      }),
    ]);
    expect(workflowPluginRequirementRows([grant], undefined)).toEqual([
      expect.objectContaining({ registeredName: "fixture_tool", availabilityLabel: "Not checked", blocked: false }),
    ]);
    expect(workflowPluginRequirementRows([grant], { ...registry, capabilities: [] })).toEqual([
      expect.objectContaining({ registeredName: "fixture_tool", availabilityLabel: "Unavailable", blocked: true }),
    ]);
  });

  it("models plugin detail action state", () => {
    const plugin = {
      id: "plugin-1",
      installState: "installed" as const,
      enabled: false,
      trusted: false,
    };

    expect(pluginDetailsActionState(plugin)).toMatchObject({
      label: "Details",
      disabled: false,
      visible: true,
      title: expect.stringContaining("Disabled"),
    });
    expect(pluginDetailsActionState(plugin, "plugin-1")).toMatchObject({
      label: "Hide details",
    });
  });

  it("models plugin auth completion action state", () => {
    expect(pluginAuthCompleteActionState(false, "", false)).toMatchObject({
      visible: false,
      disabled: true,
    });
    expect(pluginAuthCompleteActionState(true, "", false)).toMatchObject({
      label: "Complete auth",
      visible: true,
      disabled: true,
      title: expect.stringContaining("Paste"),
    });
    expect(pluginAuthCompleteActionState(true, "code", false)).toMatchObject({
      disabled: false,
      title: expect.stringContaining("Complete"),
    });
    expect(pluginAuthCompleteActionState(true, "code", true)).toMatchObject({
      label: "Completing",
      disabled: true,
    });
  });

  it("models Google Workspace account rows and action states", () => {
    const integration = googleIntegrationFixture();
    expect(googleWorkspaceConnectorLabel("google.gmail")).toBe("Gmail");
    expect(googleWorkspaceConnectorLabel("google.calendar")).toBe("Calendar");
    expect(dedupeGoogleWorkspaceAccounts(integration.connectors).map((account) => account.accountId)).toEqual(["travis@example.test"]);
    expect(googleWorkspaceAccountRows(integration.connectors, () => "just now")).toEqual([
      expect.objectContaining({
        accountId: "travis@example.test",
        email: "travis@example.test",
        identityLabel: "travis@example.test",
        handleLabel: "travis@example.test",
        connectorLabels: ["Gmail", "Calendar", "Drive"],
        lastValidatedLabel: "just now",
      }),
    ]);
    expect(googleWorkspaceStatusItems(integration)).toEqual(
      expect.arrayContaining(["Auth Gws", "gws Available", "Install Completed", "Setup Idle"]),
    );
    expect(googleWorkspaceStatusItems({ ...integration, setup: { status: "error", oauthClientConfigured: false } })).toEqual(
      expect.arrayContaining(["OAuth client Required"]),
    );
    expect(googleWorkspaceStatusItems({ ...integration, setup: { status: "completed", oauthClientConfigured: true } })).toEqual(
      expect.arrayContaining(["OAuth client Configured"]),
    );
    expect(googleWorkspaceActionState(integration, "connect")).toMatchObject({
      label: "Connect account",
      disabled: false,
      visible: true,
    });
    expect(googleWorkspaceActionState({ ...integration, sidecar: { ...integration.sidecar, state: "missing" } }, "install")).toMatchObject({
      label: "Install gws",
      disabled: false,
      visible: true,
    });
    expect(googleWorkspaceActionState({ ...integration, setup: { status: "running" } }, "cancel")).toMatchObject({
      label: "Cancel setup",
      disabled: false,
      visible: true,
    });
    expect(googleWorkspaceActionState({ ...integration, setup: { status: "running" } }, "validate")).toMatchObject({
      disabled: true,
    });
    expect(
      googleWorkspaceValidationFeedbackForAccount({ accountId: "travis@example.test", status: "validated" }, "travis@example.test"),
    ).toMatchObject({
      status: "validated",
    });
    expect(googleWorkspaceValidationFeedbackForAccount({ accountId: "travis@example.test", status: "validated" }, "other")).toBeUndefined();
    expect(googleWorkspaceValidationButtonView("Validate", undefined)).toEqual({
      label: "Validate",
      icon: "none",
      tone: "default",
    });
    expect(googleWorkspaceValidationButtonView("Validate", { accountId: "travis@example.test", status: "validating" })).toEqual({
      label: "Validating",
      icon: "spinner",
      tone: "default",
    });
    expect(googleWorkspaceValidationButtonView("Validate", { accountId: "travis@example.test", status: "validated" })).toEqual({
      label: "Validated",
      icon: "success",
      tone: "success",
    });
    expect(googleWorkspaceValidationButtonView("Validate", { accountId: "travis@example.test", status: "failed" })).toEqual({
      label: "Retry",
      icon: "error",
      tone: "error",
    });
  });

  it("keeps gws local account handles distinct from discovered Google emails", () => {
    const integration = googleIntegrationFixture();
    const handledAccount = {
      ...integration.connectors[0]!.accounts[0]!,
      id: "gws:work",
      accountId: "work",
      label: "travis@example.test",
      email: "travis@example.test",
    };
    const personalAccount = {
      ...integration.connectors[0]!.accounts[0]!,
      id: "gws:personal",
      accountId: "personal",
      label: "travis.good@gmail.com",
      email: "travis.good@gmail.com",
    };
    const connectors: AmbientPluginAppAuthSummary[] = ["google.gmail", "google.calendar", "google.drive"].map((connectorId) => ({
      connectorId,
      status: "available",
      accounts: connectorId === "google.drive" ? [personalAccount, handledAccount] : [handledAccount],
    }));

    expect(dedupeGoogleWorkspaceAccounts(connectors).map((account) => account.accountId)).toEqual(["work", "personal"]);
    expect(googleWorkspaceAccountRows(connectors)).toEqual([
      expect.objectContaining({
        accountId: "work",
        identityLabel: "travis@example.test",
        handleLabel: "work",
        connectorLabels: ["Gmail", "Calendar", "Drive"],
      }),
      expect.objectContaining({
        accountId: "personal",
        identityLabel: "travis.good@gmail.com",
        handleLabel: "personal",
        connectorLabels: ["Drive"],
      }),
    ]);
  });

  it("models Codex marketplace add action state", () => {
    expect(codexMarketplaceAddActionState("", false)).toMatchObject({
      label: "Add source",
      disabled: true,
    });
    expect(codexMarketplaceAddActionState("openai/codex-plugins", false)).toMatchObject({
      label: "Add source",
      disabled: false,
      title: expect.stringContaining("GitHub"),
    });
    expect(codexMarketplaceAddActionState("https://github.com/openai/codex-plugins", false)).toMatchObject({
      label: "Add source",
      disabled: false,
    });
    expect(codexMarketplaceAddActionState("https://plugins.example.test/marketplace.json", false)).toMatchObject({
      label: "Enable advanced URL",
      disabled: true,
      title: expect.stringContaining("experimental"),
    });
    expect(codexMarketplaceAddActionState("https://plugins.example.test/marketplace.json", false, true)).toMatchObject({
      label: "Add source",
      disabled: false,
    });
    expect(codexMarketplaceAddActionState("openai/codex-plugins", true)).toMatchObject({
      label: "Adding",
      disabled: true,
    });
  });
});

function googleIntegrationFixture(): FirstPartyGoogleIntegrationState {
  const account = {
    id: "account-1",
    accountId: "travis@example.test",
    label: "travis@example.test",
    email: "travis@example.test",
    status: "available" as const,
    grantedScopes: ["gmail.readonly", "calendar.readonly", "drive.readonly"],
    connectedAt: "2026-05-04T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
    lastValidatedAt: "2026-05-04T00:00:00.000Z",
  };
  const connectors: AmbientPluginAppAuthSummary[] = ["google.gmail", "google.calendar", "google.drive"].map((connectorId) => ({
    connectorId,
    status: "available",
    accounts: [account],
  }));
  return {
    enabled: true,
    authMode: "gws",
    connectors,
    install: {
      status: "completed",
      version: "0.22.3",
      platform: "darwin",
      arch: "arm64",
      binaryPath: "/tmp/gws",
    },
    setup: { status: "idle" },
    sidecar: {
      adapter: "gws",
      state: "available",
      binaryPath: "/tmp/gws",
      configDir: "/tmp/gws-config",
      pending: 0,
    },
  };
}
