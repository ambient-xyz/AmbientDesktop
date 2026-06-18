import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { WorkflowConnectorManifestGrant } from "../../shared/workflowTypes";
import type {
  WorkflowConnectorCallInput,
  WorkflowConnectorDescriptor,
  WorkflowConnectorOperationDescriptor,
} from "./workflowConnectors";

export type WorkflowOAuthConnectorStatus = "not_configured" | "connecting" | "available" | "expired" | "revoked" | "error";

export interface WorkflowConnectorProviderScope {
  id: string;
  label: string;
  description: string;
  personalData: boolean;
}

export interface WorkflowConnectorTokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
  scopes: string[];
}

export interface WorkflowConnectorAccountIdentity {
  id: string;
  label: string;
  email?: string;
}

export interface WorkflowConnectorProvider {
  id: string;
  connectorId: string;
  connectorIds?: string[];
  label: string;
  authType: "oauth2_pkce";
  clientId: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
  authorizationParams?: Record<string, string>;
  authorizationScopes?(requestedScopes: string[]): string[];
  scopes: WorkflowConnectorProviderScope[];
  exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    requestedScopes: string[];
  }): Promise<WorkflowConnectorTokenSet> | WorkflowConnectorTokenSet;
  refreshToken(input: {
    refreshToken: string;
    token: WorkflowConnectorTokenSet;
  }): Promise<WorkflowConnectorTokenSet> | WorkflowConnectorTokenSet;
  revokeToken?(input: { token: WorkflowConnectorTokenSet }): Promise<void> | void;
  fetchAccountIdentity(input: {
    token: WorkflowConnectorTokenSet;
  }): Promise<WorkflowConnectorAccountIdentity> | WorkflowConnectorAccountIdentity;
  testAccount?(input: { token: WorkflowConnectorTokenSet }): Promise<void> | void;
}

export interface WorkflowConnectorAccountRecord {
  id: string;
  providerId: string;
  connectorId: string;
  accountId: string;
  label: string;
  email?: string;
  grantedScopes: string[];
  status: WorkflowOAuthConnectorStatus;
  tokenRef: string;
  connectedAt: string;
  updatedAt: string;
  expiresAt?: string;
  lastRefreshedAt?: string;
  lastValidatedAt?: string;
  validationError?: string;
  revokedAt?: string;
  disconnectedAt?: string;
}

export interface WorkflowConnectorAccessToken {
  account: WorkflowConnectorAccountRecord;
  accessToken: string;
  tokenType?: string;
  expiresAt?: string;
  scopes: string[];
}

export interface WorkflowConnectorPendingConnect {
  providerId: string;
  requestedScopes: string[];
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectUri: string;
  authorizationUrl: string;
  createdAt: string;
  expiresAt: string;
}

export interface WorkflowConnectorTokenVault {
  save(ref: string, token: WorkflowConnectorTokenSet): Promise<void> | void;
  read(ref: string): Promise<WorkflowConnectorTokenSet | undefined> | WorkflowConnectorTokenSet | undefined;
  delete(ref: string): Promise<void> | void;
}

export interface WorkflowConnectorSafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class MemoryWorkflowConnectorTokenVault implements WorkflowConnectorTokenVault {
  private readonly tokens = new Map<string, WorkflowConnectorTokenSet>();

  save(ref: string, token: WorkflowConnectorTokenSet): void {
    this.tokens.set(ref, structuredClone(token));
  }

  read(ref: string): WorkflowConnectorTokenSet | undefined {
    const token = this.tokens.get(ref);
    return token ? structuredClone(token) : undefined;
  }

  delete(ref: string): void {
    this.tokens.delete(ref);
  }

  snapshot(): Record<string, WorkflowConnectorTokenSet> {
    return Object.fromEntries([...this.tokens.entries()].map(([ref, token]) => [ref, structuredClone(token)]));
  }
}

export class SafeStorageWorkflowConnectorTokenVault implements WorkflowConnectorTokenVault {
  constructor(
    private readonly filePath: string,
    private readonly safeStorage: WorkflowConnectorSafeStorage,
  ) {}

  async save(ref: string, token: WorkflowConnectorTokenSet): Promise<void> {
    this.assertEncryptionAvailable();
    const records = await this.readEncryptedRecords();
    records[ref] = this.safeStorage.encryptString(JSON.stringify(token)).toString("base64");
    await this.writeEncryptedRecords(records);
  }

  async read(ref: string): Promise<WorkflowConnectorTokenSet | undefined> {
    this.assertEncryptionAvailable();
    const records = await this.readEncryptedRecords();
    const encrypted = records[ref];
    if (!encrypted) return undefined;
    return JSON.parse(this.safeStorage.decryptString(Buffer.from(encrypted, "base64"))) as WorkflowConnectorTokenSet;
  }

  async delete(ref: string): Promise<void> {
    const records = await this.readEncryptedRecords();
    delete records[ref];
    await this.writeEncryptedRecords(records);
  }

  private assertEncryptionAvailable(): void {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error("Workflow connector token storage encryption is unavailable.");
    }
  }

  private async readEncryptedRecords(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, string>;
    } catch (error) {
      if (isNotFound(error)) return {};
      throw error;
    }
  }

  private async writeEncryptedRecords(records: Record<string, string>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }
}

export interface WorkflowConnectorAuthServiceOptions {
  providers?: WorkflowConnectorProvider[];
  tokenVault?: WorkflowConnectorTokenVault;
  now?: () => Date;
}

export interface WorkflowConnectorStartConnectInput {
  providerId: string;
  scopes: string[];
}

export interface WorkflowConnectorCompleteConnectInput {
  state: string;
  code: string;
}

export interface WorkflowConnectorGrantAuthorizationInput {
  descriptor: WorkflowConnectorDescriptor;
  grant: WorkflowConnectorManifestGrant;
  operation: WorkflowConnectorOperationDescriptor;
  callInput: WorkflowConnectorCallInput;
}

export class WorkflowConnectorAuthService {
  private readonly providers = new Map<string, WorkflowConnectorProvider>();
  private readonly accounts = new Map<string, WorkflowConnectorAccountRecord>();
  private readonly pending = new Map<string, WorkflowConnectorPendingConnect>();
  private readonly tokenVault: WorkflowConnectorTokenVault;
  private readonly now: () => Date;

  constructor(options: WorkflowConnectorAuthServiceOptions = {}) {
    this.tokenVault = options.tokenVault ?? new MemoryWorkflowConnectorTokenVault();
    this.now = options.now ?? (() => new Date());
    for (const provider of options.providers ?? []) this.registerProvider(provider);
  }

  registerProvider(provider: WorkflowConnectorProvider): void {
    assertConnectorIdentifier(provider.id, "connector provider id");
    assertConnectorIdentifier(provider.connectorId, `${provider.id} connector id`);
    for (const connectorId of provider.connectorIds ?? []) {
      assertConnectorIdentifier(connectorId, `${provider.id} connector id alias`);
    }
    assertConnectorText(provider.label, `${provider.id} label`);
    assertConnectorText(provider.clientId, `${provider.id} client id`);
    assertConnectorText(provider.redirectUri, `${provider.id} redirect uri`);
    assertConnectorText(provider.authorizationEndpoint, `${provider.id} authorization endpoint`);
    assertConnectorText(provider.tokenEndpoint, `${provider.id} token endpoint`);
    if (provider.authType !== "oauth2_pkce") throw new Error(`${provider.id} must use oauth2_pkce.`);
    const scopeIds = new Set<string>();
    for (const scope of provider.scopes) {
      assertConnectorIdentifier(scope.id, `${provider.id} scope id`);
      if (scopeIds.has(scope.id)) throw new Error(`${provider.id} declares duplicate scope: ${scope.id}`);
      scopeIds.add(scope.id);
    }
    this.providers.set(provider.id, provider);
  }

  listProviders(): WorkflowConnectorProvider[] {
    return [...this.providers.values()].map(cloneProvider);
  }

  listAccounts(providerId?: string): WorkflowConnectorAccountRecord[] {
    return [...this.accounts.values()]
      .filter((account) => !providerId || account.providerId === providerId)
      .map(publicAccountRecord);
  }

  getAccount(accountRecordId: string): WorkflowConnectorAccountRecord {
    const account = this.accounts.get(accountRecordId);
    if (!account) throw new Error(`Workflow connector account not found: ${accountRecordId}`);
    return publicAccountRecord(account);
  }

  startConnect(input: WorkflowConnectorStartConnectInput): WorkflowConnectorPendingConnect {
    const provider = this.requireProvider(input.providerId);
    const requestedScopes = normalizeScopes(input.scopes);
    this.assertProviderScopes(provider, requestedScopes);
    const createdAt = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + 10 * 60 * 1000).toISOString();
    const state = randomUUID();
    const codeVerifier = base64Url(randomBytes(32));
    const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
    const authorizationUrl = this.authorizationUrl(provider, requestedScopes, state, codeChallenge);
    const pending: WorkflowConnectorPendingConnect = {
      providerId: provider.id,
      requestedScopes,
      state,
      codeVerifier,
      codeChallenge,
      redirectUri: provider.redirectUri,
      authorizationUrl,
      createdAt,
      expiresAt,
    };
    this.pending.set(state, pending);
    return { ...pending };
  }

  async completeConnect(input: WorkflowConnectorCompleteConnectInput): Promise<WorkflowConnectorAccountRecord> {
    const pending = this.pending.get(input.state);
    if (!pending) throw new Error("Workflow connector OAuth state was not found or already used.");
    this.pending.delete(input.state);
    if (new Date(pending.expiresAt).getTime() <= this.now().getTime()) {
      throw new Error("Workflow connector OAuth state expired.");
    }
    const provider = this.requireProvider(pending.providerId);
    const token = normalizeTokenSet(
      await provider.exchangeAuthorizationCode({
        code: input.code,
        codeVerifier: pending.codeVerifier,
        redirectUri: pending.redirectUri,
        requestedScopes: pending.requestedScopes,
      }),
      pending.requestedScopes,
    );
    const identity = await provider.fetchAccountIdentity({ token });
    assertConnectorIdentifier(identity.id, `${provider.id} account id`);
    assertConnectorText(identity.label, `${provider.id} account label`);
    const now = this.now().toISOString();
    const accountRecordId = `${provider.id}:${identity.id}`;
    const tokenRef = `workflow-connector:${accountRecordId}`;
    await this.tokenVault.save(tokenRef, token);
    const account: WorkflowConnectorAccountRecord = {
      id: accountRecordId,
      providerId: provider.id,
      connectorId: provider.connectorId,
      accountId: identity.id,
      label: identity.label,
      email: identity.email,
      grantedScopes: token.scopes,
      status: tokenIsExpired(token, this.now()) ? "expired" : "available",
      tokenRef,
      connectedAt: this.accounts.get(accountRecordId)?.connectedAt ?? now,
      updatedAt: now,
      expiresAt: token.expiresAt,
    };
    this.accounts.set(account.id, account);
    return publicAccountRecord(account);
  }

  async refreshAccount(accountRecordId: string): Promise<WorkflowConnectorAccountRecord> {
    const account = this.requireAccount(accountRecordId);
    const provider = this.requireProvider(account.providerId);
    const token = await this.requireToken(account);
    if (!token.refreshToken) throw new Error(`Workflow connector account has no refresh token: ${accountRecordId}`);
    const refreshed = normalizeTokenSet(
      await provider.refreshToken({ refreshToken: token.refreshToken, token }),
      account.grantedScopes,
    );
    await this.tokenVault.save(account.tokenRef, refreshed);
    const now = this.now().toISOString();
    const updated: WorkflowConnectorAccountRecord = {
      ...account,
      grantedScopes: refreshed.scopes,
      status: tokenIsExpired(refreshed, this.now()) ? "expired" : "available",
      expiresAt: refreshed.expiresAt,
      lastRefreshedAt: now,
      updatedAt: now,
      validationError: undefined,
    };
    this.accounts.set(updated.id, updated);
    return publicAccountRecord(updated);
  }

  async testAccount(accountRecordId: string): Promise<WorkflowConnectorAccountRecord> {
    const account = await this.refreshIfExpired(this.requireAccount(accountRecordId));
    const provider = this.requireProvider(account.providerId);
    const token = await this.requireToken(account);
    const now = this.now().toISOString();
    try {
      await provider.testAccount?.({ token });
      const updated = {
        ...account,
        status: "available" as const,
        lastValidatedAt: now,
        validationError: undefined,
        updatedAt: now,
      };
      this.accounts.set(updated.id, updated);
      return publicAccountRecord(updated);
    } catch (error) {
      const updated = {
        ...account,
        status: "error" as const,
        lastValidatedAt: now,
        validationError: error instanceof Error ? error.message : String(error),
        updatedAt: now,
      };
      this.accounts.set(updated.id, updated);
      return publicAccountRecord(updated);
    }
  }

  async disconnectAccount(accountRecordId: string): Promise<WorkflowConnectorAccountRecord> {
    const account = this.requireAccount(accountRecordId);
    await this.tokenVault.delete(account.tokenRef);
    const now = this.now().toISOString();
    const updated = {
      ...account,
      status: "not_configured" as const,
      disconnectedAt: now,
      updatedAt: now,
      validationError: undefined,
    };
    this.accounts.set(updated.id, updated);
    return publicAccountRecord(updated);
  }

  async revokeAccount(accountRecordId: string): Promise<WorkflowConnectorAccountRecord> {
    const account = this.requireAccount(accountRecordId);
    const provider = this.requireProvider(account.providerId);
    const token = await this.tokenVault.read(account.tokenRef);
    if (token) await provider.revokeToken?.({ token });
    await this.tokenVault.delete(account.tokenRef);
    const now = this.now().toISOString();
    const updated = {
      ...account,
      status: "revoked" as const,
      revokedAt: now,
      updatedAt: now,
      validationError: undefined,
    };
    this.accounts.set(updated.id, updated);
    return publicAccountRecord(updated);
  }

  async upgradeScopes(accountRecordId: string, scopes: string[]): Promise<WorkflowConnectorPendingConnect> {
    const account = this.requireAccount(accountRecordId);
    return this.startConnect({
      providerId: account.providerId,
      scopes: [...new Set([...account.grantedScopes, ...normalizeScopes(scopes)])],
    });
  }

  async authorizeGrant(input: WorkflowConnectorGrantAuthorizationInput): Promise<void> {
    const providerId = input.descriptor.auth.providerId ?? providerIdForConnector(this.providers, input.descriptor.id);
    if (!providerId) {
      throw new Error(`Workflow connector has no OAuth provider registered: ${input.descriptor.id}`);
    }
    const accountHandle = input.callInput.accountId ?? input.grant.accountId;
    if (!accountHandle) throw new Error(`Workflow connector grant must choose an account: ${input.descriptor.id}`);
    const account = await this.refreshIfExpired(this.accountForHandle(providerId, input.descriptor.id, accountHandle));
    if (account.status !== "available") {
      throw new Error(`Workflow connector account is not available: ${account.id} (${account.status})`);
    }
    const provider = this.requireProvider(account.providerId);
    if (!providerSupportsConnector(provider, input.descriptor.id)) {
      throw new Error(`Workflow connector account belongs to ${account.connectorId}, not ${input.descriptor.id}.`);
    }
    const granted = new Set(account.grantedScopes);
    const required = new Set([...input.grant.scopes, ...input.operation.requiredScopes]);
    for (const scope of required) {
      if (!granted.has(scope)) throw new Error(`Workflow connector account is missing scope: ${account.id}/${scope}`);
    }
    input.callInput.accountId = account.accountId;
  }

  async accessTokenForConnectorAccount(
    providerId: string,
    connectorId: string,
    accountHandle: string,
  ): Promise<WorkflowConnectorAccessToken> {
    const account = await this.refreshIfExpired(this.accountForHandle(providerId, connectorId, accountHandle));
    if (account.status !== "available") {
      throw new Error(`Workflow connector account is not available: ${account.id} (${account.status})`);
    }
    const provider = this.requireProvider(account.providerId);
    if (!providerSupportsConnector(provider, connectorId)) {
      throw new Error(`Workflow connector account belongs to ${account.connectorId}, not ${connectorId}.`);
    }
    const token = await this.requireToken(account);
    return {
      account: publicAccountRecord(account),
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      expiresAt: token.expiresAt,
      scopes: [...token.scopes],
    };
  }

  private async refreshIfExpired(account: WorkflowConnectorAccountRecord): Promise<WorkflowConnectorAccountRecord> {
    if (account.status !== "expired" && (!account.expiresAt || new Date(account.expiresAt).getTime() > this.now().getTime())) {
      return account;
    }
    return this.refreshAccount(account.id);
  }

  private requireProvider(providerId: string): WorkflowConnectorProvider {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Workflow connector provider not found: ${providerId}`);
    return provider;
  }

  private requireAccount(accountRecordId: string): WorkflowConnectorAccountRecord {
    const account = this.accounts.get(accountRecordId);
    if (!account) throw new Error(`Workflow connector account not found: ${accountRecordId}`);
    return account;
  }

  private async requireToken(account: WorkflowConnectorAccountRecord): Promise<WorkflowConnectorTokenSet> {
    const token = await this.tokenVault.read(account.tokenRef);
    if (!token) throw new Error(`Workflow connector token is unavailable: ${account.id}`);
    return token;
  }

  private accountForHandle(providerId: string, connectorId: string, accountHandle: string): WorkflowConnectorAccountRecord {
    const directAccount = this.accounts.get(accountHandle);
    if (
      directAccount &&
      directAccount.providerId === providerId &&
      providerSupportsConnector(this.requireProvider(directAccount.providerId), connectorId)
    ) {
      return directAccount;
    }
    const account =
      [...this.accounts.values()].find(
        (candidate) =>
          candidate.providerId === providerId &&
          providerSupportsConnector(this.requireProvider(candidate.providerId), connectorId) &&
          (candidate.accountId === accountHandle || candidate.email === accountHandle || candidate.label === accountHandle),
      );
    if (!account) throw new Error(`Workflow connector account not found: ${connectorId}/${accountHandle}`);
    return account;
  }

  private assertProviderScopes(provider: WorkflowConnectorProvider, scopes: string[]): void {
    const availableScopes = new Set(provider.scopes.map((scope) => scope.id));
    for (const scope of scopes) {
      if (!availableScopes.has(scope)) throw new Error(`Workflow connector provider ${provider.id} does not expose scope: ${scope}`);
    }
  }

  private authorizationUrl(
    provider: WorkflowConnectorProvider,
    requestedScopes: string[],
    state: string,
    codeChallenge: string,
  ): string {
    const url = new URL(provider.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("redirect_uri", provider.redirectUri);
    url.searchParams.set("scope", (provider.authorizationScopes?.(requestedScopes) ?? requestedScopes).join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    for (const [key, value] of Object.entries(provider.authorizationParams ?? {})) {
      if (key && value) url.searchParams.set(key, value);
    }
    return url.toString();
  }
}

export function workflowConnectorAccountAuthorizer(
  auth: WorkflowConnectorAuthService,
): (input: WorkflowConnectorGrantAuthorizationInput) => Promise<void> {
  return (input) => auth.authorizeGrant(input);
}

export function fakeOAuthConnectorProvider(options: Partial<WorkflowConnectorProvider> = {}): WorkflowConnectorProvider {
  return {
    id: "fake.oauth",
    connectorId: "fake.oauth.records",
    label: "Fake OAuth Records",
    authType: "oauth2_pkce",
    clientId: "ambient-desktop-test",
    redirectUri: "ambient://workflow-connectors/fake.oauth/callback",
    authorizationEndpoint: "https://fake-oauth.local/authorize",
    tokenEndpoint: "https://fake-oauth.local/token",
    revocationEndpoint: "https://fake-oauth.local/revoke",
    scopes: [
      {
        id: "fake.records.read",
        label: "Read fake records",
        description: "Read fake account records from the deterministic OAuth test provider.",
        personalData: false,
      },
      {
        id: "fake.records.write",
        label: "Write fake records",
        description: "Write fake account records from the deterministic OAuth test provider.",
        personalData: false,
      },
    ],
    exchangeAuthorizationCode: ({ code, requestedScopes }) => {
      if (code === "oauth-denied") throw new Error("Fake OAuth provider denied the request.");
      return {
        accessToken: `fake-access-${code}`,
        refreshToken: `fake-refresh-${code}`,
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        scopes: requestedScopes,
      };
    },
    refreshToken: ({ refreshToken, token }) => ({
      accessToken: `${refreshToken}-rotated-access`,
      refreshToken: `${refreshToken}-rotated`,
      tokenType: "Bearer",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scopes: token.scopes,
    }),
    revokeToken: () => undefined,
    fetchAccountIdentity: () => ({
      id: "fake-user",
      label: "Fake User",
      email: "fake-user@example.test",
    }),
    testAccount: () => undefined,
    ...options,
  };
}

function normalizeTokenSet(token: WorkflowConnectorTokenSet, fallbackScopes: string[]): WorkflowConnectorTokenSet {
  assertConnectorText(token.accessToken, "connector access token");
  return {
    tokenType: token.tokenType ?? "Bearer",
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    scopes: normalizeScopes(token.scopes.length ? token.scopes : fallbackScopes),
  };
}

function tokenIsExpired(token: WorkflowConnectorTokenSet, now: Date): boolean {
  return Boolean(token.expiresAt && new Date(token.expiresAt).getTime() <= now.getTime());
}

function normalizeScopes(scopes: string[]): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}

function providerIdForConnector(providers: Map<string, WorkflowConnectorProvider>, connectorId: string): string | undefined {
  return [...providers.values()].find((provider) => providerSupportsConnector(provider, connectorId))?.id;
}

export function providerSupportsConnector(provider: WorkflowConnectorProvider, connectorId: string): boolean {
  return provider.connectorId === connectorId || (provider.connectorIds ?? []).includes(connectorId);
}

function publicAccountRecord(account: WorkflowConnectorAccountRecord): WorkflowConnectorAccountRecord {
  return structuredClone(account);
}

function cloneProvider(provider: WorkflowConnectorProvider): WorkflowConnectorProvider {
  return {
    ...provider,
    scopes: provider.scopes.map((scope) => ({ ...scope })),
  };
}

function base64Url(value: Buffer): string {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function assertConnectorIdentifier(value: string, label: string): void {
  assertConnectorText(value, label);
  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) throw new Error(`${label} is not a safe identifier: ${value}`);
}

function assertConnectorText(value: string | undefined, label: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
