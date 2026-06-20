import type {
  AmbientPluginAppAuthSummary,
  AmbientPluginAuthAccountSummary,
  FirstPartyGoogleIntegrationState,
  GoogleWorkspaceCliInstallState,
  GoogleWorkspaceSetupState,
} from "../../shared/pluginTypes";
import { googleWorkspaceOAuthProvidersFromEnv } from "./googleOAuthProvider";
import {
  googleWorkspaceConnectorDescriptors,
  googleWorkspaceConnectorRegistrations,
  type GoogleWorkspaceConnectorDescriptorOptions,
  type GoogleWorkspaceConnectorRuntime,
} from "./googleWorkspaceConnectors";
import type {
  WorkflowConnectorAccessToken,
  WorkflowConnectorDescriptor,
  WorkflowConnectorRegistration,
} from "./googleWorkspaceWorkflowFacade";
import type { GoogleWorkspaceCliStatus } from "./googleWorkspaceCliAdapter";
import type { GoogleSidecarRequest } from "./googleSidecarSupervisor";
import type { WorkflowConnectorGrantAuthorizationInput } from "../plugins/pluginsWorkflowAuthFacade";

export type GoogleWorkspaceConnectorMode = "disabled" | "gws" | "ambient_oauth";

export type GoogleWorkspaceCliAdapterHandle = GoogleWorkspaceConnectorRuntime["sidecar"] & {
  status(accountHint?: string): GoogleWorkspaceCliStatus;
};

export interface GoogleWorkspaceSetupHandle {
  state(): GoogleWorkspaceSetupState;
  accountSummaries(): AmbientPluginAuthAccountSummary[];
}

export interface GoogleWorkspaceCliInstallerHandle {
  state(): GoogleWorkspaceCliInstallState;
}

export interface GoogleWorkspacePluginAuthHandle {
  appAuthState(connectorId: string): AmbientPluginAppAuthSummary;
  accessTokenForApp(connectorId: string, accountHandle: string): Promise<WorkflowConnectorAccessToken>;
  connectorAccountAuthorizer(): (input: WorkflowConnectorGrantAuthorizationInput) => Promise<void>;
}

export interface GoogleWorkspaceSidecarSupervisorHandle {
  status(): FirstPartyGoogleIntegrationState["sidecar"];
  invoke<T = unknown>(request: GoogleSidecarRequest): Promise<T>;
}

export interface GoogleWorkspaceDesktopIntegrationDependencies {
  env: NodeJS.ProcessEnv;
  cliAdapter(): GoogleWorkspaceCliAdapterHandle | undefined;
  cliInstaller(): GoogleWorkspaceCliInstallerHandle | undefined;
  setupService(): GoogleWorkspaceSetupHandle | undefined;
  pluginAuthService(): GoogleWorkspacePluginAuthHandle | undefined;
  sidecarSupervisor(): GoogleWorkspaceSidecarSupervisorHandle | undefined;
  workspaceConnectorDescriptors(): WorkflowConnectorDescriptor[];
}

export interface GoogleWorkspaceDesktopIntegrationService {
  connectorMode(): GoogleWorkspaceConnectorMode;
  connectorsEnabled(): boolean;
  refreshGoogleWorkspaceConnectorMode(): void;
  readFirstPartyGoogleIntegration(): FirstPartyGoogleIntegrationState;
  redactGoogleWorkspaceSetupState(
    setup: FirstPartyGoogleIntegrationState["setup"],
  ): FirstPartyGoogleIntegrationState["setup"];
  googleAppAuthState(connectorId: string): AmbientPluginAppAuthSummary;
  firstPartyGoogleConnectorDescriptorOptions(): GoogleWorkspaceConnectorDescriptorOptions;
  firstPartyWorkflowConnectorDescriptors(): WorkflowConnectorDescriptor[];
  firstPartyWorkflowConnectorRegistrations(): WorkflowConnectorRegistration[];
  firstPartyWorkflowConnectorAccountAuthorizer(): ((input: WorkflowConnectorGrantAuthorizationInput) => Promise<void>) | undefined;
}

const GOOGLE_CONNECTOR_IDS = ["google.gmail", "google.calendar", "google.drive"] as const;

export function createGoogleWorkspaceDesktopIntegrationService(
  dependencies: GoogleWorkspaceDesktopIntegrationDependencies,
): GoogleWorkspaceDesktopIntegrationService {
  let connectorMode: GoogleWorkspaceConnectorMode = "disabled";
  let connectorsEnabled = false;

  function refreshGoogleWorkspaceConnectorMode(): void {
    const gwsStatus = dependencies.cliAdapter()?.status();
    const googleOAuthProviders = googleWorkspaceOAuthProvidersFromEnv(dependencies.env);
    if (gwsStatus && gwsStatus.state !== "missing") {
      connectorMode = "gws";
      connectorsEnabled = true;
      return;
    }
    if (googleOAuthProviders.length > 0) {
      connectorMode = "ambient_oauth";
      connectorsEnabled = true;
      return;
    }
    connectorMode = "gws";
    connectorsEnabled = false;
  }

  function readFirstPartyGoogleIntegration(): FirstPartyGoogleIntegrationState {
    const gwsStatus = dependencies.cliAdapter()?.status();
    const sidecar = connectorMode === "gws" && gwsStatus
      ? gwsStatus
      : {
          adapter: "ambient-go" as const,
          ...(dependencies.sidecarSupervisor()?.status() ?? {
            state: "missing" as const,
            binaryPath: "",
            pending: 0,
          }),
        };
    return {
      enabled: connectorsEnabled,
      authMode: connectorMode,
      connectors: GOOGLE_CONNECTOR_IDS.map((connectorId) => googleAppAuthState(connectorId)),
      install: dependencies.cliInstaller()?.state(),
      setup: redactGoogleWorkspaceSetupState(dependencies.setupService()?.state()),
      sidecar,
      ...(connectorsEnabled
        ? {}
        : {
            unavailableReason:
              gwsStatus?.unavailableReason ??
              "Install Google Workspace CLI (`gws`) or set AMBIENT_GOOGLE_CLIENT_ID before starting Ambient Desktop to enable Google integrations.",
          }),
    };
  }

  function redactGoogleWorkspaceSetupState(
    setup: FirstPartyGoogleIntegrationState["setup"],
  ): FirstPartyGoogleIntegrationState["setup"] {
    if (!setup) return undefined;
    const safeSetup = structuredClone(setup);
    delete safeSetup.authUrl;
    return safeSetup;
  }

  function firstPartyWorkflowConnectorDescriptors(): WorkflowConnectorDescriptor[] {
    const descriptors = dependencies.workspaceConnectorDescriptors();
    if (!connectorsEnabled) return descriptors;
    return [
      ...descriptors,
      ...googleWorkspaceConnectorDescriptors(firstPartyGoogleConnectorDescriptorOptions()),
    ];
  }

  function firstPartyWorkflowConnectorRegistrations(): WorkflowConnectorRegistration[] {
    if (!connectorsEnabled) return [];
    if (connectorMode === "gws") {
      const sidecar = dependencies.cliAdapter();
      if (!sidecar) return [];
      return googleWorkspaceConnectorRegistrations(
        { sidecar },
        firstPartyGoogleConnectorDescriptorOptions(),
      );
    }
    const auth = dependencies.pluginAuthService();
    const sidecar = dependencies.sidecarSupervisor();
    if (!auth || !sidecar) return [];
    return googleWorkspaceConnectorRegistrations({
      auth,
      sidecar,
    }, firstPartyGoogleConnectorDescriptorOptions());
  }

  function firstPartyWorkflowConnectorAccountAuthorizer(): ((input: WorkflowConnectorGrantAuthorizationInput) => Promise<void>) | undefined {
    return connectorMode === "gws" ? undefined : dependencies.pluginAuthService()?.connectorAccountAuthorizer();
  }

  function firstPartyGoogleConnectorDescriptorOptions(): GoogleWorkspaceConnectorDescriptorOptions {
    const adapter = connectorMode === "gws" ? "gws" : "ambient-oauth";
    return {
      adapter,
      states: Object.fromEntries(
        GOOGLE_CONNECTOR_IDS.map((connectorId) => {
          const authState = googleAppAuthState(connectorId);
          return [
            connectorId,
            {
              status: authState.status,
              accounts: authState.accounts.map((account) => ({
                id: account.accountId,
                label: account.email ?? account.label,
              })),
            },
          ];
        }),
      ),
    };
  }

  function googleAppAuthState(connectorId: string): AmbientPluginAppAuthSummary {
    if (connectorMode !== "gws") {
      const pluginAuth = dependencies.pluginAuthService();
      if (pluginAuth) return pluginAuth.appAuthState(connectorId);
      return {
        connectorId,
        status: "unavailable",
        accounts: [],
        unavailableReason: "No Ambient auth provider is registered for this Codex app connector.",
      };
    }
    const adapter = dependencies.cliAdapter();
    const setupService = dependencies.setupService();
    const status = adapter?.status();
    const accounts = setupService?.accountSummaries() ?? [];
    const setup = setupService?.state() ?? { status: "idle" as const };
    const authStatus = !status || status.state === "missing"
      ? "unavailable" as const
      : accounts.some((account) => account.status === "available")
        ? "available" as const
        : setup.status === "running" || setup.status === "validating"
          ? "connecting" as const
          : accounts.some((account) => account.status === "error")
            ? "error" as const
            : "not_configured" as const;
    return {
      connectorId,
      providerId: "google.workspace.cli",
      providerLabel: "Google Workspace CLI",
      status: authStatus,
      accounts: status?.state === "missing" ? [] : accounts,
      ...(status?.state === "missing" ? { unavailableReason: status.unavailableReason } : {}),
    };
  }

  return {
    connectorMode: () => connectorMode,
    connectorsEnabled: () => connectorsEnabled,
    refreshGoogleWorkspaceConnectorMode,
    readFirstPartyGoogleIntegration,
    redactGoogleWorkspaceSetupState,
    googleAppAuthState,
    firstPartyGoogleConnectorDescriptorOptions,
    firstPartyWorkflowConnectorDescriptors,
    firstPartyWorkflowConnectorRegistrations,
    firstPartyWorkflowConnectorAccountAuthorizer,
  };
}
