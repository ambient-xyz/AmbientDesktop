import { describe, expect, it, vi } from "vitest";

import type {
  AmbientPluginAppAuthSummary,
  AmbientPluginAuthAccountSummary,
  GoogleWorkspaceCliInstallState,
  GoogleWorkspaceSetupState,
} from "../../shared/pluginTypes";
import { workspaceInventoryConnectorDescriptor } from "../workflow/workflowConnectors";
import { createGoogleWorkspaceDesktopIntegrationService } from "./googleWorkspaceDesktopIntegrationService";
import type { GoogleWorkspaceCliStatus } from "./googleWorkspaceCliAdapter";

const workspaceDescriptor = workspaceInventoryConnectorDescriptor();

function cliStatus(overrides: Partial<GoogleWorkspaceCliStatus> = {}): GoogleWorkspaceCliStatus {
  return {
    adapter: "gws",
    state: "missing",
    binaryPath: "",
    configDir: "/tmp/gws-config",
    pending: 0,
    setupCommands: [],
    unavailableReason: "gws missing",
    ...overrides,
  };
}

function installState(): GoogleWorkspaceCliInstallState {
  return {
    status: "idle",
    version: "",
    platform: "darwin",
    arch: "arm64",
  };
}

function account(overrides: Partial<AmbientPluginAuthAccountSummary> = {}): AmbientPluginAuthAccountSummary {
  return {
    id: "account-1",
    accountId: "account-1",
    label: "Account One",
    email: "one@example.test",
    status: "available",
    grantedScopes: ["gmail.readonly"],
    connectedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function setupState(overrides: Partial<GoogleWorkspaceSetupState> = {}): GoogleWorkspaceSetupState {
  return {
    status: "idle",
    ...overrides,
  };
}

describe("createGoogleWorkspaceDesktopIntegrationService", () => {
  it("selects gws mode when the CLI adapter is available", () => {
    const service = createGoogleWorkspaceDesktopIntegrationService({
      env: {},
      cliAdapter: () => ({
        status: () => cliStatus({ state: "available", binaryPath: "/usr/local/bin/gws" }),
        invoke: vi.fn(),
      }),
      cliInstaller: () => ({ state: installState }),
      setupService: () => ({
        state: () => setupState({ status: "running", authUrl: "https://secret.example.test/auth" }),
        accountSummaries: () => [account()],
      }),
      pluginAuthService: () => undefined,
      sidecarSupervisor: () => undefined,
      workspaceConnectorDescriptors: () => [workspaceDescriptor],
    });

    service.refreshGoogleWorkspaceConnectorMode();

    expect(service.connectorMode()).toBe("gws");
    expect(service.connectorsEnabled()).toBe(true);
    expect(service.firstPartyWorkflowConnectorAccountAuthorizer()).toBeUndefined();
    expect(service.firstPartyWorkflowConnectorDescriptors().map((descriptor) => descriptor.id)).toEqual([
      "workspace.inventory",
      "google.gmail",
      "google.calendar",
      "google.drive",
    ]);
    expect(service.firstPartyWorkflowConnectorRegistrations().map((registration) => registration.descriptor.id)).toEqual([
      "google.gmail",
      "google.calendar",
      "google.drive",
    ]);
    const integration = service.readFirstPartyGoogleIntegration();
    expect(integration.connectors.map((connector) => connector.connectorId)).toEqual([
      "google.gmail",
      "google.calendar",
      "google.drive",
    ]);
    expect(integration).toMatchObject({
      enabled: true,
      authMode: "gws",
      setup: {
        status: "running",
      },
      sidecar: {
        adapter: "gws",
        state: "available",
      },
    });
    expect(integration.connectors[0]).toMatchObject({
      connectorId: "google.gmail",
      providerId: "google.workspace.cli",
      status: "available",
      accounts: [{ accountId: "account-1" }],
    });
    expect(integration.setup).not.toHaveProperty("authUrl");
  });

  it("falls back to Ambient OAuth mode when providers are configured and gws is missing", () => {
    const appAuthState = vi.fn<(connectorId: string) => AmbientPluginAppAuthSummary>((connectorId) => ({
      connectorId,
      providerId: "google.workspace",
      providerLabel: "Google Workspace",
      status: "available",
      accounts: [account({ accountId: `${connectorId}:account` })],
    }));
    const authorizer = vi.fn();
    const invoke = vi.fn();
    const service = createGoogleWorkspaceDesktopIntegrationService({
      env: {
        AMBIENT_GOOGLE_CLIENT_ID: "client-id",
        AMBIENT_GOOGLE_CLIENT_SECRET: "client-secret",
      },
      cliAdapter: () => ({
        status: () => cliStatus(),
        invoke: vi.fn(),
      }),
      cliInstaller: () => undefined,
      setupService: () => undefined,
      pluginAuthService: () => ({
        appAuthState,
        accessTokenForApp: vi.fn(),
        connectorAccountAuthorizer: () => authorizer,
      }),
      sidecarSupervisor: () => ({
        status: () => ({
          adapter: "ambient-go",
          state: "running",
          binaryPath: "/tmp/ambient-go",
          pending: 2,
        }),
        invoke,
      }),
      workspaceConnectorDescriptors: () => [workspaceDescriptor],
    });

    service.refreshGoogleWorkspaceConnectorMode();

    expect(service.connectorMode()).toBe("ambient_oauth");
    expect(service.connectorsEnabled()).toBe(true);
    expect(service.firstPartyWorkflowConnectorAccountAuthorizer()).toBe(authorizer);
    expect(service.firstPartyGoogleConnectorDescriptorOptions()).toMatchObject({
      adapter: "ambient-oauth",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "google.gmail:account", label: "one@example.test" }],
        },
      },
    });
    expect(service.firstPartyWorkflowConnectorRegistrations()).toHaveLength(3);
    expect(service.readFirstPartyGoogleIntegration()).toMatchObject({
      enabled: true,
      authMode: "ambient_oauth",
      sidecar: {
        adapter: "ambient-go",
        state: "running",
        pending: 2,
      },
    });
    expect(appAuthState).toHaveBeenCalledWith("google.gmail");
  });

  it("keeps only workspace descriptors and reports an unavailable integration when no Google transport is configured", () => {
    const service = createGoogleWorkspaceDesktopIntegrationService({
      env: {},
      cliAdapter: () => ({
        status: () => cliStatus(),
        invoke: vi.fn(),
      }),
      cliInstaller: () => ({ state: installState }),
      setupService: () => ({
        state: () => setupState(),
        accountSummaries: () => [],
      }),
      pluginAuthService: () => undefined,
      sidecarSupervisor: () => undefined,
      workspaceConnectorDescriptors: () => [workspaceDescriptor],
    });

    service.refreshGoogleWorkspaceConnectorMode();

    expect(service.connectorMode()).toBe("gws");
    expect(service.connectorsEnabled()).toBe(false);
    expect(service.firstPartyWorkflowConnectorDescriptors()).toEqual([workspaceDescriptor]);
    expect(service.firstPartyWorkflowConnectorRegistrations()).toEqual([]);
    const integration = service.readFirstPartyGoogleIntegration();
    expect(integration.connectors.map((connector) => [connector.connectorId, connector.status])).toEqual([
      ["google.gmail", "unavailable"],
      ["google.calendar", "unavailable"],
      ["google.drive", "unavailable"],
    ]);
    expect(integration).toMatchObject({
      enabled: false,
      authMode: "gws",
      unavailableReason: "gws missing",
    });
    expect(integration.connectors[0]).toMatchObject({
      connectorId: "google.gmail",
      status: "unavailable",
      accounts: [],
      unavailableReason: "gws missing",
    });
  });
});
