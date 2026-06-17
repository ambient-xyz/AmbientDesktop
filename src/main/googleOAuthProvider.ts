import type { WorkflowConnectorProvider, WorkflowConnectorTokenSet } from "./workflow/workflowConnectorAuth";

export const GOOGLE_WORKSPACE_PROVIDER_ID = "google.workspace";
export const GOOGLE_WORKSPACE_CONNECTOR_ID = "google.workspace";
export const GOOGLE_WORKSPACE_CONNECTOR_IDS = ["google.gmail", "google.calendar", "google.drive"];

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOCATION_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

const scopeCatalog = [
  {
    id: "openid",
    googleScope: "openid",
    label: "Google identity",
    description: "Identify the connected Google account.",
    personalData: true,
  },
  {
    id: "email",
    googleScope: "email",
    label: "Google email",
    description: "Read the connected Google account email address.",
    personalData: true,
  },
  {
    id: "profile",
    googleScope: "profile",
    label: "Google profile",
    description: "Read the connected Google account profile label.",
    personalData: true,
  },
  {
    id: "gmail.readonly",
    googleScope: "https://www.googleapis.com/auth/gmail.readonly",
    label: "Gmail read",
    description: "Read Gmail threads, message content, and attachments.",
    personalData: true,
  },
  {
    id: "gmail.compose",
    googleScope: "https://www.googleapis.com/auth/gmail.compose",
    label: "Gmail drafts",
    description: "Create, read, update, delete, and send Gmail drafts.",
    personalData: true,
  },
  {
    id: "gmail.send",
    googleScope: "https://www.googleapis.com/auth/gmail.send",
    label: "Gmail send",
    description: "Send Gmail messages or existing drafts.",
    personalData: true,
  },
  {
    id: "calendar.readonly",
    googleScope: "https://www.googleapis.com/auth/calendar.readonly",
    label: "Calendar read",
    description: "Read Google Calendar calendars, events, and free-busy data.",
    personalData: true,
  },
  {
    id: "calendar.events",
    googleScope: "https://www.googleapis.com/auth/calendar.events",
    label: "Calendar write",
    description: "Create, update, and delete Google Calendar events.",
    personalData: true,
  },
  {
    id: "drive.readonly",
    googleScope: "https://www.googleapis.com/auth/drive.readonly",
    label: "Drive read",
    description: "Read Google Drive files.",
    personalData: true,
  },
  {
    id: "drive.file",
    googleScope: "https://www.googleapis.com/auth/drive.file",
    label: "Drive write",
    description: "Create, update, copy, trash, and share files available to Ambient.",
    personalData: true,
  },
];

const byId = new Map(scopeCatalog.map((scope) => [scope.id, scope]));
const byGoogleScope = new Map(scopeCatalog.map((scope) => [scope.googleScope, scope]));

export interface GoogleWorkspaceOAuthProviderOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

export function googleWorkspaceOAuthProvider(options: GoogleWorkspaceOAuthProviderOptions): WorkflowConnectorProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    id: GOOGLE_WORKSPACE_PROVIDER_ID,
    connectorId: GOOGLE_WORKSPACE_CONNECTOR_ID,
    connectorIds: GOOGLE_WORKSPACE_CONNECTOR_IDS,
    label: "Google Workspace",
    authType: "oauth2_pkce",
    clientId: options.clientId,
    redirectUri: options.redirectUri,
    authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    revocationEndpoint: GOOGLE_REVOCATION_ENDPOINT,
    authorizationParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
    authorizationScopes: googleScopeIdsForConnectorScopes,
    scopes: scopeCatalog.map(({ id, label, description, personalData }) => ({ id, label, description, personalData })),
    exchangeAuthorizationCode: async ({ code, codeVerifier, redirectUri, requestedScopes }) => {
      return normalizeTokenResponse(
        await postForm<GoogleTokenResponse>(fetchImpl, GOOGLE_TOKEN_ENDPOINT, {
          code,
          client_id: options.clientId,
          ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
        requestedScopes,
      );
    },
    refreshToken: async ({ refreshToken, token }) => {
      const refreshed = normalizeTokenResponse(
        await postForm<GoogleTokenResponse>(fetchImpl, GOOGLE_TOKEN_ENDPOINT, {
          refresh_token: refreshToken,
          client_id: options.clientId,
          ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
          grant_type: "refresh_token",
        }),
        token.scopes,
      );
      return {
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? refreshToken,
      };
    },
    revokeToken: async ({ token }) => {
      const value = token.refreshToken ?? token.accessToken;
      if (!value) return;
      await postForm(fetchImpl, GOOGLE_REVOCATION_ENDPOINT, { token: value }, { allowEmpty: true });
    },
    fetchAccountIdentity: async ({ token }) => {
      const info = await getJSON<GoogleUserInfo>(fetchImpl, GOOGLE_USERINFO_ENDPOINT, token.accessToken);
      return {
        id: normalizeGoogleAccountId(info.sub, info.email),
        label: info.email || info.name || info.sub,
        email: info.email,
      };
    },
    testAccount: async ({ token }) => {
      await getJSON(fetchImpl, GOOGLE_USERINFO_ENDPOINT, token.accessToken);
    },
  };
}

export function googleWorkspaceOAuthProviderFromEnv(env: NodeJS.ProcessEnv): WorkflowConnectorProvider | undefined {
  const clientId = env.AMBIENT_GOOGLE_CLIENT_ID || env.AMBIENT_AGENT_GOOGLE_CLIENT_ID;
  if (!clientId?.trim()) return undefined;
  return googleWorkspaceOAuthProvider({
    clientId: clientId.trim(),
    clientSecret: (env.AMBIENT_GOOGLE_CLIENT_SECRET || env.AMBIENT_AGENT_GOOGLE_CLIENT_SECRET)?.trim(),
    redirectUri: (env.AMBIENT_GOOGLE_REDIRECT_URI || env.AMBIENT_AGENT_GOOGLE_REDIRECT_URL || "http://127.0.0.1:14589/oauth/google/callback").trim(),
  });
}

export function googleWorkspaceOAuthProvidersFromEnv(env: NodeJS.ProcessEnv): WorkflowConnectorProvider[] {
  const provider = googleWorkspaceOAuthProviderFromEnv(env);
  return provider ? [provider] : [];
}

export function googleScopeIdsForConnectorScopes(scopes: string[]): string[] {
  return scopes.map((scope) => byId.get(scope)?.googleScope ?? scope);
}

function normalizeTokenResponse(response: GoogleTokenResponse, fallbackScopes: string[]): WorkflowConnectorTokenSet {
  const expiresAt = response.expires_in ? new Date(Date.now() + response.expires_in * 1000).toISOString() : undefined;
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    tokenType: response.token_type || "Bearer",
    expiresAt,
    scopes: normalizeScopeIds(response.scope ? response.scope.split(/\s+/) : fallbackScopes),
  };
}

function normalizeScopeIds(scopes: string[]): string[] {
  const normalized = new Set<string>();
  for (const scope of scopes) {
    const trimmed = scope.trim();
    if (!trimmed) continue;
    normalized.add(byGoogleScope.get(trimmed)?.id ?? trimmed);
  }
  return [...normalized].sort();
}

async function postForm<T = unknown>(
  fetchImpl: typeof fetch,
  url: string,
  values: Record<string, string>,
  options: { allowEmpty?: boolean } = {},
): Promise<T> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
  if (!response.ok) throw new Error(`Google OAuth request failed with ${response.status}: ${await response.text()}`);
  if (options.allowEmpty) return undefined as T;
  return (await response.json()) as T;
}

async function getJSON<T = unknown>(fetchImpl: typeof fetch, url: string, accessToken: string): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Google OAuth request failed with ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

function normalizeGoogleAccountId(subject: string, email?: string): string {
  const stable = subject.trim() || email?.trim() || "google-account";
  return stable.replace(/[^A-Za-z0-9_.:-]/g, "_");
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  name?: string;
}
