import type {
  AmbientPluginAppAuthSummary,
  AmbientPluginAuthAccountSummary,
  AmbientPluginAuthStatus,
  CodexPluginApp,
  CodexPluginSummary,
} from "../../shared/types";
import {
  WorkflowConnectorAuthService,
  providerSupportsConnector,
  workflowConnectorAccountAuthorizer,
  type WorkflowConnectorAccountRecord,
  type WorkflowConnectorAccessToken,
  type WorkflowConnectorCompleteConnectInput,
  type WorkflowConnectorGrantAuthorizationInput,
  type WorkflowConnectorPendingConnect,
  type WorkflowConnectorProvider,
  type WorkflowConnectorStartConnectInput,
  type WorkflowConnectorTokenVault,
} from "../workflowConnectorAuth";

export interface PluginAuthServiceOptions {
  providers?: WorkflowConnectorProvider[];
  tokenVault?: WorkflowConnectorTokenVault;
  now?: () => Date;
}

export interface PluginAppConnectInput {
  connectorId: string;
  scopes?: string[];
}

export class PluginAuthService {
  private readonly auth: WorkflowConnectorAuthService;
  private readonly providersByConnector = new Map<string, WorkflowConnectorProvider>();

  constructor(options: PluginAuthServiceOptions = {}) {
    this.auth = new WorkflowConnectorAuthService({
      providers: options.providers,
      tokenVault: options.tokenVault,
      now: options.now,
    });
    for (const provider of options.providers ?? []) this.indexProvider(provider);
  }

  registerOAuthProvider(provider: WorkflowConnectorProvider): void {
    this.auth.registerProvider(provider);
    this.indexProvider(provider);
  }

  listAppAuthStates(plugins: CodexPluginSummary[]): AmbientPluginAppAuthSummary[] {
    const apps = new Map<string, CodexPluginApp>();
    for (const plugin of plugins) {
      for (const app of plugin.apps ?? []) {
        if (!apps.has(app.connectorId)) apps.set(app.connectorId, app);
      }
    }
    return [...apps.values()]
      .map((app) => this.appAuthState(app.connectorId))
      .sort((left, right) => left.connectorId.localeCompare(right.connectorId));
  }

  appAuthState(connectorId: string): AmbientPluginAppAuthSummary {
    const provider = this.providersByConnector.get(connectorId);
    if (!provider) {
      return {
        connectorId,
        status: "unavailable",
        accounts: [],
        unavailableReason: "No Ambient auth provider is registered for this Codex app connector.",
      };
    }

    const accounts = this.auth
      .listAccounts(provider.id)
      .filter((account) => providerSupportsConnector(provider, connectorId) && providerSupportsConnector(provider, account.connectorId))
      .map(pluginAccountSummary);

    return {
      connectorId,
      providerId: provider.id,
      providerLabel: provider.label,
      status: aggregateAuthStatus(accounts),
      accounts,
    };
  }

  authIndexForPlugins(plugins: CodexPluginSummary[]): Map<string, AmbientPluginAppAuthSummary> {
    return new Map(this.listAppAuthStates(plugins).map((state) => [state.connectorId, state]));
  }

  startConnectForApp(input: PluginAppConnectInput): WorkflowConnectorPendingConnect {
    const provider = this.requireProviderForConnector(input.connectorId);
    const scopes = input.scopes?.length ? input.scopes : provider.scopes.map((scope) => scope.id);
    return this.auth.startConnect({ providerId: provider.id, scopes } satisfies WorkflowConnectorStartConnectInput);
  }

  completeConnect(input: WorkflowConnectorCompleteConnectInput): Promise<AmbientPluginAuthAccountSummary> {
    return this.auth.completeConnect(input).then(pluginAccountSummary);
  }

  async revokeAccount(accountRecordId: string): Promise<AmbientPluginAuthAccountSummary> {
    return pluginAccountSummary(await this.auth.revokeAccount(accountRecordId));
  }

  async disconnectAccount(accountRecordId: string): Promise<AmbientPluginAuthAccountSummary> {
    return pluginAccountSummary(await this.auth.disconnectAccount(accountRecordId));
  }

  async testAccount(accountRecordId: string): Promise<AmbientPluginAuthAccountSummary> {
    return pluginAccountSummary(await this.auth.testAccount(accountRecordId));
  }

  accessTokenForApp(connectorId: string, accountHandle: string): Promise<WorkflowConnectorAccessToken> {
    const provider = this.requireProviderForConnector(connectorId);
    return this.auth.accessTokenForConnectorAccount(provider.id, connectorId, accountHandle);
  }

  connectorAccountAuthorizer(): (input: WorkflowConnectorGrantAuthorizationInput) => Promise<void> {
    return workflowConnectorAccountAuthorizer(this.auth);
  }

  private indexProvider(provider: WorkflowConnectorProvider): void {
    this.providersByConnector.set(provider.connectorId, provider);
    for (const connectorId of provider.connectorIds ?? []) {
      this.providersByConnector.set(connectorId, provider);
    }
  }

  private requireProviderForConnector(connectorId: string): WorkflowConnectorProvider {
    const provider = this.providersByConnector.get(connectorId);
    if (!provider) throw new Error(`No Ambient auth provider is registered for Codex app connector: ${connectorId}`);
    return provider;
  }
}

function aggregateAuthStatus(accounts: AmbientPluginAuthAccountSummary[]): AmbientPluginAuthStatus {
  if (accounts.some((account) => account.status === "available")) return "available";
  return accounts[0]?.status ?? "not_configured";
}

function pluginAccountSummary(account: WorkflowConnectorAccountRecord): AmbientPluginAuthAccountSummary {
  return {
    id: account.id,
    accountId: account.accountId,
    label: account.label,
    email: account.email,
    status: account.status === "not_configured" ? "not_configured" : account.status,
    grantedScopes: [...account.grantedScopes],
    connectedAt: account.connectedAt,
    updatedAt: account.updatedAt,
    lastValidatedAt: account.lastValidatedAt,
    validationError: account.validationError,
  };
}
