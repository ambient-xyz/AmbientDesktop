import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  MessagingGatewayProviderReadiness,
  MessagingGatewayProviderSessionReadiness,
} from "../../../shared/messagingGateway";
import type { MessagingGatewayReadinessAdapter } from "../agentRuntimeMessagingFacade";
import {
  signalBridgeEndpointPaths,
  validateSignalBridgeProfileStatusEnvelope,
  validateSignalBridgeRootEnvelope,
  type SignalBridgeProfileStatusSummary,
  type SignalBridgeRootSummary,
} from "./signalBridgeContract";

const PROVIDER_ID = "signal-cli";
const SESSION_METADATA_FILE = "bridge-session.json";
const DEFAULT_BRIDGE_PORT = "8092";
const DEFAULT_TIMEOUT_MS = 1500;

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface SignalMessagingReadinessOptions {
  workspacePath?: string;
  stateRoot?: string;
  bridgeBaseUrl?: string;
  signalCliPath?: string;
  signalCliConfigDir?: string;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  homeDir?: string;
  pathEntries?: string[];
  fetchFn?: FetchLike;
  timeoutMs?: number;
}

interface PersistedSignalSession {
  profileId?: unknown;
  signalCliConfigDir?: unknown;
  accountIdentifierPresent?: unknown;
  linkedDevicePresent?: unknown;
  registrationMetadataPresent?: unknown;
  bridgeSessionReadable?: unknown;
}

interface SignalCliBinaryProbe {
  path?: string;
  checkedPaths: string[];
  explicit: boolean;
}

interface SignalCliConfigProbe {
  path?: string;
  present: boolean;
  checkedPaths: string[];
  explicit: boolean;
}

interface SignalSessionScan {
  sessions: MessagingGatewayProviderSessionReadiness[];
  readable: boolean;
  diagnostic?: string;
}

interface SignalBridgeProbe {
  reachable: boolean;
  root?: SignalBridgeRootSummary;
  profiles: Map<string, SignalBridgeProfileStatusSummary>;
  diagnostics: string[];
}

export function createSignalMessagingReadinessProbe(
  options: SignalMessagingReadinessOptions = {},
): () => Promise<MessagingGatewayProviderReadiness> {
  return () => probeSignalMessagingReadiness(options);
}

export function createSignalMessagingReadinessAdapter(
  options: SignalMessagingReadinessOptions = {},
): MessagingGatewayReadinessAdapter {
  return {
    providerId: PROVIDER_ID,
    label: "Signal",
    createProbe: () => createSignalMessagingReadinessProbe(options),
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: false,
      startsBridge: false,
      readsProviderHistory: false,
    },
  };
}

export async function probeSignalMessagingReadiness(
  options: SignalMessagingReadinessOptions = {},
): Promise<MessagingGatewayProviderReadiness> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  const workspacePath = options.workspacePath ?? process.cwd();
  const homePath = options.homeDir ?? env.HOME ?? homedir();
  const stateRoot = path.resolve(options.stateRoot ?? stateRootFromEnv(env, workspacePath));
  const bridgeBaseUrl = normalizeBaseUrl(options.bridgeBaseUrl ?? bridgeBaseUrlFromEnv(env));
  const binary = await probeSignalCliBinary({ options, env, homePath });
  const config = await probeSignalCliConfigDir({ options, env, homePath });
  const sessionScan = await scanAmbientSignalSessions(stateRoot, config.path);
  const bridge = await probeSignalBridge({
    baseUrl: bridgeBaseUrl,
    sessions: sessionScan.sessions,
    fetchFn: options.fetchFn ?? globalThis.fetch.bind(globalThis),
    timeoutMs: Math.max(250, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const sessions = sessionScan.sessions.map((session) => mergeBridgeProfileStatus(session, bridge.profiles.get(session.profileId)));
  const persistedSessionCount = sessions.filter((session) => session.metadataReadable).length;
  const configured = sessions.some((session) => session.metadataReadable && session.bridgeSessionReadable === true);
  const diagnostics = [
    "Signal readiness performs redacted local preflight only: signal-cli binary path lookup, Ambient-owned bridge session metadata scan, optional signal-cli config-directory presence check, and local bridge contract root/profile status probes.",
    "Signal readiness does not run signal-cli, does not inspect Signal Desktop, does not read Signal messages, does not read Signal history, does not read contacts/groups/attachments, does not start bridges, and does not send replies.",
    "Signal Desktop being installed or open is not sufficient for Ambient messaging; Pi should ignore Signal Desktop UI state unless a future reviewed Desktop adapter explicitly says otherwise. The actionable setup state is the reviewed local Signal bridge plus Ambient-owned bridge-readable session metadata.",
    binary.path
      ? `signal-cli binary found at ${binary.path}; the readiness probe did not execute it.`
      : `signal-cli binary not found in ${binary.explicit ? "the configured path" : "the checked PATH/default locations"}.`,
    config.path
      ? `signal-cli config directory ${config.present ? "present" : "not present"} at ${config.path}; file names and provider data are not returned.`
      : "No signal-cli config directory candidate is present.",
    sessionScan.diagnostic ?? `Ambient-owned Signal session metadata scan found ${persistedSessionCount} readable profile(s).`,
    ...bridge.diagnostics,
    "Signal typed Remote Ambient Surface binding metadata may be persisted after matched owner handoff. Lifecycle startup and broad inbound ingestion remain disabled; bounded unread polling and outbound replies are available only through their reviewed typed adapters.",
  ];

  return {
    providerId: PROVIDER_ID,
    status: "unavailable",
    configured,
    bridgeReachable: bridge.reachable,
    ...(bridge.root?.capabilities ? { bridgeCapabilities: bridge.root.capabilities } : {}),
    authNeeded: !configured,
    apiCredentialsPresent: false,
    persistedSessionCount,
    checkedAt,
    message: signalReadinessMessage({
      binaryFound: Boolean(binary.path),
      configured,
      persistedSessionCount,
      bridgeReachable: bridge.reachable,
    }),
    diagnostics,
    sessions,
    bridgeBaseUrl,
    ...(bridge.root?.stateRoot ? { bridgeStateRoot: bridge.root.stateRoot } : {}),
    ...(typeof bridge.root?.profileCount === "number" ? { bridgeSessionCount: bridge.root.profileCount } : {}),
    stateRoot,
    repairHint: "Use the reviewed Signal local bridge/session setup path before enabling Signal setup, bindings, directory reads, inbound ingestion, or replies; do not ask the user to operate Signal Desktop as a substitute for bridge readiness.",
  };
}

function stateRootFromEnv(env: Record<string, string | undefined>, workspacePath: string): string {
  return env.AMBIENT_AGENT_SIGNAL_STATE_ROOT?.trim()
    || path.resolve(workspacePath, ".ambient-agent-state", "signal");
}

function bridgeBaseUrlFromEnv(env: Record<string, string | undefined>): string {
  const explicit = env.AMBIENT_SIGNAL_BRIDGE_URL?.trim()
    || env.AMBIENT_AGENT_SIGNAL_BRIDGE_URL?.trim();
  if (explicit) return explicit;
  const port = env.AMBIENT_SIGNAL_BRIDGE_PORT?.trim()
    || env.AMBIENT_AGENT_SIGNAL_BRIDGE_PORT?.trim()
    || DEFAULT_BRIDGE_PORT;
  return `http://127.0.0.1:${port}`;
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

async function probeSignalCliBinary(input: {
  options: SignalMessagingReadinessOptions;
  env: Record<string, string | undefined>;
  homePath: string;
}): Promise<SignalCliBinaryProbe> {
  const explicitRaw = input.options.signalCliPath ?? input.env.AMBIENT_SIGNAL_CLI_PATH;
  const explicit = Boolean(explicitRaw?.trim());
  const candidates = explicit
    ? [expandHome(explicitRaw!.trim(), input.homePath)]
    : signalCliBinaryCandidates(input.options, input.env, input.homePath);
  const checkedPaths = uniqueTrimmed(candidates);
  for (const candidate of checkedPaths) {
    if (await executableFileExists(candidate)) {
      return { path: candidate, checkedPaths, explicit };
    }
  }
  return { checkedPaths, explicit };
}

async function probeSignalCliConfigDir(input: {
  options: SignalMessagingReadinessOptions;
  env: Record<string, string | undefined>;
  homePath: string;
}): Promise<SignalCliConfigProbe> {
  const explicitRaw = input.options.signalCliConfigDir
    ?? input.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR
    ?? input.env.SIGNAL_CLI_CONFIG_DIR;
  const explicit = Boolean(explicitRaw?.trim());
  const candidates = explicit
    ? [expandHome(explicitRaw!.trim(), input.homePath)]
    : signalCliConfigDirCandidates(input.homePath);
  const checkedPaths = uniqueTrimmed(candidates);
  for (const candidate of checkedPaths) {
    if (await directoryExists(candidate)) {
      return { path: candidate, present: true, checkedPaths, explicit };
    }
  }
  return {
    ...(checkedPaths[0] ? { path: checkedPaths[0] } : {}),
    present: false,
    checkedPaths,
    explicit,
  };
}

function signalCliBinaryCandidates(
  options: SignalMessagingReadinessOptions,
  env: Record<string, string | undefined>,
  homePath: string,
): string[] {
  const pathEntries = options.pathEntries
    ?? (env.PATH?.split(path.delimiter).filter(Boolean) ?? []);
  return [
    ...pathEntries.map((entry) => path.join(expandHome(entry, homePath), "signal-cli")),
    "/opt/homebrew/bin/signal-cli",
    "/usr/local/bin/signal-cli",
    "/usr/bin/signal-cli",
  ];
}

function signalCliConfigDirCandidates(homePath: string): string[] {
  return [
    path.join(homePath, ".local", "share", "signal-cli"),
    path.join(homePath, ".config", "signal-cli"),
    path.join(homePath, "Library", "Application Support", "signal-cli"),
  ];
}

async function scanAmbientSignalSessions(
  stateRoot: string,
  defaultConfigDir?: string,
): Promise<SignalSessionScan> {
  let entries: Array<{ isDirectory(): boolean; name: string }>;
  try {
    entries = await readdir(stateRoot, { withFileTypes: true });
  } catch (error) {
    return {
      sessions: [],
      readable: false,
      diagnostic: `Ambient-owned Signal session metadata root is not readable at ${stateRoot}: ${errorMessage(error)}.`,
    };
  }

  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSignalSessionMetadata(stateRoot, entry.name, defaultConfigDir)));
  const sorted = sessions.sort((left, right) => left.profileId.localeCompare(right.profileId));
  return {
    sessions: sorted,
    readable: true,
    diagnostic: `Ambient-owned Signal session metadata scan found ${sorted.filter((session) => session.metadataReadable).length} readable profile(s).`,
  };
}

async function readSignalSessionMetadata(
  stateRoot: string,
  profileDirName: string,
  defaultConfigDir?: string,
): Promise<MessagingGatewayProviderSessionReadiness> {
  const metadataPath = path.join(stateRoot, profileDirName, SESSION_METADATA_FILE);
  const sessionRoot = path.dirname(metadataPath);
  try {
    const raw = await readFile(metadataPath, "utf8");
    const metadata = JSON.parse(raw) as PersistedSignalSession;
    const profileId = stringValue(metadata.profileId) || profileDirName;
    const signalCliConfigDir = stringValue(metadata.signalCliConfigDir) || defaultConfigDir;
    return {
      profileId,
      metadataPath,
      metadataReadable: true,
      tdlibStateDirPresent: false,
      phoneNumberPresent: false,
      databaseEncryptionKeyPresent: false,
      signalCliConfigDirPresent: signalCliConfigDir ? await directoryExists(signalCliConfigDir) : false,
      accountIdentifierPresent: booleanValue(metadata.accountIdentifierPresent),
      linkedDevicePresent: booleanValue(metadata.linkedDevicePresent),
      registrationMetadataPresent: booleanValue(metadata.registrationMetadataPresent),
      bridgeSessionReadable: booleanValue(metadata.bridgeSessionReadable),
    };
  } catch (error) {
    return {
      profileId: profileDirName,
      metadataPath,
      metadataReadable: false,
      tdlibStateDirPresent: false,
      phoneNumberPresent: false,
      databaseEncryptionKeyPresent: false,
      signalCliConfigDirPresent: defaultConfigDir ? await directoryExists(defaultConfigDir) : await directoryExists(sessionRoot),
      accountIdentifierPresent: false,
      linkedDevicePresent: false,
      registrationMetadataPresent: false,
      bridgeSessionReadable: false,
      error: errorMessage(error),
    };
  }
}

async function probeSignalBridge(input: {
  baseUrl: string;
  sessions: MessagingGatewayProviderSessionReadiness[];
  fetchFn: FetchLike;
  timeoutMs: number;
}): Promise<SignalBridgeProbe> {
  const diagnostics: string[] = [];
  const root = await probeSignalBridgeRoot(input.baseUrl, input.fetchFn, input.timeoutMs);
  diagnostics.push(root.diagnostic);
  if (!root.summary) {
    return { reachable: false, profiles: new Map(), diagnostics };
  }
  diagnostics.push(...root.summary.diagnostics);
  const profiles = new Map<string, SignalBridgeProfileStatusSummary>();
  if (!root.summary.capabilities.profileStatus) {
    diagnostics.push("Signal bridge root did not advertise profileStatus; profile status was not probed.");
    return { reachable: true, root: root.summary, profiles, diagnostics };
  }
  const readableProfiles = uniqueTrimmed(input.sessions
    .filter((session) => session.metadataReadable)
    .map((session) => session.profileId));
  for (const profileId of readableProfiles) {
    const status = await probeSignalBridgeProfileStatus(input.baseUrl, profileId, input.fetchFn, input.timeoutMs);
    diagnostics.push(status.diagnostic);
    if (status.summary) {
      diagnostics.push(...status.summary.diagnostics);
      profiles.set(profileId, status.summary);
    }
  }
  return { reachable: true, root: root.summary, profiles, diagnostics };
}

async function probeSignalBridgeRoot(
  baseUrl: string,
  fetchFn: FetchLike,
  timeoutMs: number,
): Promise<{ summary?: SignalBridgeRootSummary; diagnostic: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(`${baseUrl}/`, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      return { diagnostic: `Signal bridge root probe returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.` };
    }
    const summary = validateSignalBridgeRootEnvelope(await response.json());
    return { summary, diagnostic: "Signal bridge root probe succeeded against the reviewed contract." };
  } catch (error) {
    return { diagnostic: `Signal bridge root probe failed: ${errorMessage(error)}.` };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeSignalBridgeProfileStatus(
  baseUrl: string,
  profileId: string,
  fetchFn: FetchLike,
  timeoutMs: number,
): Promise<{ summary?: SignalBridgeProfileStatusSummary; diagnostic: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = signalBridgeEndpointPaths(profileId).profileStatus;
  try {
    const response = await fetchFn(`${baseUrl}${endpoint}`, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      return { diagnostic: `Signal bridge profile status probe for ${profileId} returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.` };
    }
    const summary = validateSignalBridgeProfileStatusEnvelope(await response.json(), profileId);
    return { summary, diagnostic: `Signal bridge profile status probe succeeded for ${profileId}.` };
  } catch (error) {
    return { diagnostic: `Signal bridge profile status probe failed for ${profileId}: ${errorMessage(error)}.` };
  } finally {
    clearTimeout(timeout);
  }
}

function mergeBridgeProfileStatus(
  session: MessagingGatewayProviderSessionReadiness,
  status?: SignalBridgeProfileStatusSummary,
): MessagingGatewayProviderSessionReadiness {
  if (!status) return session;
  return {
    ...session,
    accountIdentifierPresent: session.accountIdentifierPresent === true || status.accountIdentifierPresent,
    linkedDevicePresent: session.linkedDevicePresent === true || status.linkedDevicePresent,
    registrationMetadataPresent: session.registrationMetadataPresent === true || status.registrationMetadataPresent,
    bridgeSessionReadable: session.bridgeSessionReadable === true || status.bridgeSessionReadable,
  };
}

async function executableFileExists(candidatePath: string): Promise<boolean> {
  try {
    const stats = await stat(candidatePath);
    return stats.isFile() && (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

async function directoryExists(candidatePath: string): Promise<boolean> {
  try {
    return (await stat(candidatePath)).isDirectory();
  } catch {
    return false;
  }
}

function signalReadinessMessage(input: {
  binaryFound: boolean;
  configured: boolean;
  persistedSessionCount: number;
  bridgeReachable: boolean;
}): string {
  if (input.configured) {
    return "Signal bridge contract readiness is present, but Signal provider runtime remains disabled until lifecycle, directory, inbound, and reply adapters are reviewed.";
  }
  if (input.bridgeReachable) {
    return "Signal bridge root contract is reachable, but no reviewed bridge-readable Signal profile is configured yet; continue with the local Signal bridge/session setup path rather than Signal Desktop UI actions.";
  }
  if (input.persistedSessionCount > 0) {
    return "Signal session metadata exists, but it is not yet sufficient for a reviewed bridge session.";
  }
  if (input.binaryFound) {
    return "signal-cli was found locally, but Ambient has no reviewed Signal bridge session metadata and the Signal adapter remains disabled; Signal Desktop UI state is not a substitute.";
  }
  return "Signal is a planned local messaging provider target, but signal-cli and reviewed Ambient bridge session metadata are not configured.";
}

function expandHome(candidatePath: string, homePath: string): string {
  if (candidatePath === "~") return homePath;
  if (candidatePath.startsWith("~/")) return path.join(homePath, candidatePath.slice(2));
  return candidatePath;
}

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    rows.push(trimmed);
  }
  return rows;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
