import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type {
  MessagingGatewayProviderReadiness,
  MessagingGatewayProviderSessionReadiness,
} from "../../shared/messagingGateway";
import type { MessagingGatewayReadinessAdapter } from "../messaging/messagingProviderReadiness";

const PROVIDER_ID = "telegram-tdlib";
const DEFAULT_PORT = "8091";
const DEFAULT_TIMEOUT_MS = 1500;
const SESSION_METADATA_FILE = "bridge-session.json";

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface TelegramMessagingReadinessOptions {
  workspacePath?: string;
  baseUrl?: string;
  stateRoot?: string;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}

interface TelegramBridgeRootResponse {
  ok?: boolean;
  stateRoot?: string;
  sessionCount?: number;
}

interface PersistedTelegramSession {
  profileId?: unknown;
  phoneNumber?: unknown;
  tdlibStateDir?: unknown;
  databaseEncryptionKey?: unknown;
}

export function createTelegramMessagingReadinessProbe(
  options: TelegramMessagingReadinessOptions = {},
): () => Promise<MessagingGatewayProviderReadiness> {
  return () => probeTelegramMessagingReadiness(options);
}

export function createTelegramMessagingReadinessAdapter(
  options: TelegramMessagingReadinessOptions = {},
): MessagingGatewayReadinessAdapter {
  return {
    providerId: PROVIDER_ID,
    label: "Telegram",
    createProbe: () => createTelegramMessagingReadinessProbe(options),
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: false,
      startsBridge: false,
      readsProviderHistory: false,
    },
  };
}

export async function probeTelegramMessagingReadiness(
  options: TelegramMessagingReadinessOptions = {},
): Promise<MessagingGatewayProviderReadiness> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  const workspacePath = options.workspacePath ?? process.cwd();
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? bridgeBaseUrlFromEnv(env));
  const stateRoot = path.resolve(options.stateRoot ?? stateRootFromEnv(env, workspacePath));
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = Math.max(250, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const apiCredentialsPresent = Boolean(env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim());
  const diagnostics = [
    "Readiness probe performs only bridge root health and redacted local metadata inspection.",
    "Readiness probe intentionally does not call /sessions/* because Ambient Agent's Telegram bridge may start TDLib sessions from that path.",
    "Readiness probe does not read Telegram messages, send Telegram messages, or start a bridge process.",
  ];

  const sessions = await scanPersistedSessions(stateRoot);
  const bridge = await probeBridgeRoot(baseUrl, fetchFn, timeoutMs);
  if (bridge.diagnostic) diagnostics.push(bridge.diagnostic);

  const persistedSessionCount = sessions.filter((session) => session.metadataReadable).length;
  const bridgeReachable = bridge.reachable;
  const bridgeSessionCount = bridge.sessionCount;
  const configured = persistedSessionCount > 0 && sessions.some((session) => session.databaseEncryptionKeyPresent);
  const authNeeded = !apiCredentialsPresent || !configured;
  const status = readinessStatus({
    configured,
    bridgeReachable,
    apiCredentialsPresent,
    bridgeSessionCount,
  });
  const { message, repairHint } = readinessMessage({
    status,
    configured,
    bridgeReachable,
    apiCredentialsPresent,
    persistedSessionCount,
    bridgeSessionCount,
  });

  return {
    providerId: PROVIDER_ID,
    status,
    configured,
    bridgeReachable,
    authNeeded,
    apiCredentialsPresent,
    persistedSessionCount,
    checkedAt,
    message,
    diagnostics,
    sessions,
    bridgeBaseUrl: baseUrl,
    ...(bridge.stateRoot ? { bridgeStateRoot: bridge.stateRoot } : {}),
    ...(typeof bridgeSessionCount === "number" ? { bridgeSessionCount } : {}),
    stateRoot,
    ...(repairHint ? { repairHint } : {}),
  };
}

function bridgeBaseUrlFromEnv(env: Record<string, string | undefined>): string {
  const explicit = env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL?.trim();
  if (explicit) return explicit;
  const port = env.AMBIENT_AGENT_TELEGRAM_BRIDGE_PORT?.trim() || DEFAULT_PORT;
  return `http://127.0.0.1:${port}`;
}

function stateRootFromEnv(env: Record<string, string | undefined>, workspacePath: string): string {
  return env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim()
    || path.resolve(workspacePath, ".ambient-agent-state", "telegram");
}

function normalizeBaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

async function scanPersistedSessions(stateRoot: string): Promise<MessagingGatewayProviderSessionReadiness[]> {
  let entries: Array<{ isDirectory(): boolean; name: string }>;
  try {
    entries = await readdir(stateRoot, { withFileTypes: true });
  } catch (error) {
    return [
      {
        profileId: "state-root",
        metadataPath: path.join(stateRoot, SESSION_METADATA_FILE),
        metadataReadable: false,
        tdlibStateDirPresent: false,
        phoneNumberPresent: false,
        databaseEncryptionKeyPresent: false,
        error: errorMessage(error),
      },
    ];
  }

  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSessionMetadata(stateRoot, entry.name)));
  return sessions.sort((left, right) => left.profileId.localeCompare(right.profileId));
}

async function readSessionMetadata(stateRoot: string, profileDirName: string): Promise<MessagingGatewayProviderSessionReadiness> {
  const metadataPath = path.join(stateRoot, profileDirName, SESSION_METADATA_FILE);
  try {
    const raw = await readFile(metadataPath, "utf8");
    const metadata = JSON.parse(raw) as PersistedTelegramSession;
    const profileId = stringValue(metadata.profileId) || profileDirName;
    const tdlibStateDir = stringValue(metadata.tdlibStateDir);
    return {
      profileId,
      metadataPath,
      metadataReadable: true,
      tdlibStateDirPresent: tdlibStateDir ? await directoryExists(tdlibStateDir) : await directoryExists(path.dirname(metadataPath)),
      phoneNumberPresent: Boolean(stringValue(metadata.phoneNumber)),
      databaseEncryptionKeyPresent: Boolean(stringValue(metadata.databaseEncryptionKey)),
    };
  } catch (error) {
    return {
      profileId: profileDirName,
      metadataPath,
      metadataReadable: false,
      tdlibStateDirPresent: await directoryExists(path.dirname(metadataPath)),
      phoneNumberPresent: false,
      databaseEncryptionKeyPresent: false,
      error: errorMessage(error),
    };
  }
}

async function directoryExists(candidatePath: string): Promise<boolean> {
  try {
    return (await stat(candidatePath)).isDirectory();
  } catch {
    return false;
  }
}

async function probeBridgeRoot(
  baseUrl: string,
  fetchFn: FetchLike,
  timeoutMs: number,
): Promise<{
  reachable: boolean;
  sessionCount?: number;
  stateRoot?: string;
  diagnostic?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(`${baseUrl}/`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        reachable: false,
        diagnostic: `Telegram bridge root probe returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
      };
    }
    const body = await response.json() as TelegramBridgeRootResponse;
    if (body.ok !== true) {
      return {
        reachable: false,
        diagnostic: "Telegram bridge root probe returned JSON without ok=true.",
      };
    }
    return {
      reachable: true,
      ...(typeof body.sessionCount === "number" ? { sessionCount: body.sessionCount } : {}),
      ...(typeof body.stateRoot === "string" && body.stateRoot.trim() ? { stateRoot: body.stateRoot.trim() } : {}),
      diagnostic: "Telegram bridge root probe succeeded without starting a session.",
    };
  } catch (error) {
    return {
      reachable: false,
      diagnostic: `Telegram bridge root probe failed: ${errorMessage(error)}.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readinessStatus(input: {
  configured: boolean;
  bridgeReachable: boolean;
  apiCredentialsPresent: boolean;
  bridgeSessionCount?: number;
}): MessagingGatewayProviderReadiness["status"] {
  if (!input.configured) return "not-configured";
  if (!input.bridgeReachable || !input.apiCredentialsPresent) return "degraded";
  if ((input.bridgeSessionCount ?? 0) > 0) return "available";
  return "degraded";
}

function readinessMessage(input: {
  status: MessagingGatewayProviderReadiness["status"];
  configured: boolean;
  bridgeReachable: boolean;
  apiCredentialsPresent: boolean;
  persistedSessionCount: number;
  bridgeSessionCount?: number;
}): { message: string; repairHint?: string } {
  if (!input.configured) {
    return {
      message: "Telegram bridge/session metadata is not configured for this workspace.",
      repairHint: "Create or bind a Telegram TDLib session before attempting real provider startup.",
    };
  }
  if (!input.apiCredentialsPresent) {
    return {
      message: "Telegram session metadata exists, but Telegram API credentials are not available to the runtime.",
      repairHint: "Bind AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH through Ambient-managed secret/env flow before real startup.",
    };
  }
  if (!input.bridgeReachable) {
    return {
      message: "Telegram session metadata and API credentials exist, but the local bridge root is not reachable.",
      repairHint: "Preview and approve bridge startup before reading Telegram messages.",
    };
  }
  if ((input.bridgeSessionCount ?? 0) <= 0) {
    return {
      message: "Telegram bridge root is reachable and local metadata exists, but no in-memory bridge session is loaded yet.",
      repairHint: "A real startup flow must load the approved Telegram profile before inbound ingestion.",
    };
  }
  return {
    message: "Telegram bridge root is reachable with a loaded bridge session. Session auth is not deeply verified by this safe readiness probe.",
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "probe timed out" : error.message;
  }
  return String(error);
}
