import { randomBytes } from "node:crypto";
import path from "node:path";
import type {
  MessagingGatewayBridgeSupervisorStatus,
  TelegramSessionSetupCard,
  TelegramSessionSetupCardAction,
  TelegramSessionSetupCardStatus,
} from "../../shared/messagingGateway";

const PROVIDER_ID = "telegram-tdlib";
const DEFAULT_PORT = "8091";
const DEFAULT_TIMEOUT_MS = 8_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export type TelegramSessionBootstrapAction = "start_auth" | "status" | "submit_code" | "submit_password";

export interface TelegramSessionBootstrapInput {
  action: TelegramSessionBootstrapAction;
  providerId?: string;
  profileId: string;
  phoneNumber?: string;
  code?: string;
  password?: string;
}

export interface TelegramSessionBootstrapOptions {
  workspacePath?: string;
  bridgeBaseUrl?: string;
  stateRoot?: string;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  fetchFn?: FetchLike;
  timeoutMs?: number;
  supervisor?: {
    status(): MessagingGatewayBridgeSupervisorStatus;
    startForSetup(input: { apiCredentialsPresent: boolean }): Promise<MessagingGatewayBridgeSupervisorStatus>;
  };
}

export interface TelegramSessionBootstrapPreview {
  providerId: string;
  action: TelegramSessionBootstrapAction;
  profileId: string;
  phoneNumberPresent: boolean;
  codePresent: boolean;
  passwordPresent: boolean;
  bridgeBaseUrl: string;
  stateRoot: string;
  tdlibStateDir: string;
  approvalRequired: true;
  wouldLaunchBridgeForSetup: boolean;
  wouldCallEndpoint: string;
  wouldStartOrResumeSession: boolean;
  wouldSubmitCode: boolean;
  wouldSubmitPassword: boolean;
  wouldReadProviderMessages: false;
  wouldSendProviderMessages: false;
  apiCredentialsPresent: boolean;
  missingInputs: string[];
  policyNotes: string[];
  nextSteps: string[];
  bridgeSupervisor?: MessagingGatewayBridgeSupervisorStatus;
}

export interface TelegramSessionBootstrapResult extends TelegramSessionBootstrapPreview {
  applyStatus: "applied" | "blocked";
  applied: boolean;
  checkedAt: string;
  authState?: TelegramAuthSessionSummary;
  blockedReason?: string;
}

export interface TelegramAuthSessionSummary {
  state: string;
  message?: string;
  ready: boolean;
  needsCode: boolean;
  needsPassword: boolean;
  lastSyncAt?: string;
  phoneNumberPresent: boolean;
  profile: {
    userIdPresent: boolean;
    usernamePresent: boolean;
    displayNamePresent: boolean;
  };
}

interface TelegramBridgeAuthEnvelope {
  state?: unknown;
  message?: unknown;
  ready?: unknown;
  needsCode?: unknown;
  needsPassword?: unknown;
  lastSyncAt?: unknown;
  phoneNumber?: unknown;
  profile?: {
    userId?: unknown;
    username?: unknown;
    displayName?: unknown;
    phoneNumber?: unknown;
  };
}

export function previewTelegramSessionBootstrap(
  input: TelegramSessionBootstrapInput,
  options: TelegramSessionBootstrapOptions = {},
): TelegramSessionBootstrapPreview {
  const normalized = normalizeInput(input);
  const env = options.env ?? process.env;
  const bridgeBaseUrl = normalizeBaseUrl(options.bridgeBaseUrl ?? bridgeBaseUrlFromEnv(env));
  const stateRoot = path.resolve(options.stateRoot ?? stateRootFromEnv(env, options.workspacePath ?? process.cwd()));
  const tdlibStateDir = path.join(stateRoot, normalized.profileId);
  const bridgeSupervisor = options.supervisor?.status();
  const apiCredentialsPresent = Boolean(env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim());
  const missingInputs = missingInputsFor(normalized, apiCredentialsPresent);
  if (bridgeSupervisor?.state === "missing") missingInputs.push("Ambient Agent Telegram package");
  const wouldLaunchBridgeForSetup = bridgeSupervisor ? !bridgeSupervisor.managed : false;
  return {
    providerId: PROVIDER_ID,
    action: normalized.action,
    profileId: normalized.profileId,
    phoneNumberPresent: Boolean(normalized.phoneNumber),
    codePresent: Boolean(normalized.code),
    passwordPresent: Boolean(normalized.password),
    bridgeBaseUrl,
    stateRoot,
    tdlibStateDir,
    approvalRequired: true,
    wouldLaunchBridgeForSetup,
    wouldCallEndpoint: endpointFor(normalized.action, normalized.profileId),
    wouldStartOrResumeSession: true,
    wouldSubmitCode: normalized.action === "submit_code",
    wouldSubmitPassword: normalized.action === "submit_password",
    wouldReadProviderMessages: false,
    wouldSendProviderMessages: false,
    apiCredentialsPresent,
    missingInputs,
    policyNotes: [
      "Telegram session bootstrap is separate from provider lifecycle, inbound ingestion, outbound sending, and purpose-scoped bindings.",
      "This setup path may start or resume a TDLib auth session, but it must not list chats, read messages, ingest events, or send messages.",
      "Telegram API credentials, database encryption keys, login codes, passwords, and phone numbers must not appear in Pi-visible output.",
      "Code/password submission should come from the secure Desktop input path; do not ask the user to paste those values into chat.",
    ],
    nextSteps: nextStepsFor(normalized, missingInputs),
    ...(bridgeSupervisor ? { bridgeSupervisor } : {}),
  };
}

export async function applyTelegramSessionBootstrap(
  input: TelegramSessionBootstrapInput,
  options: TelegramSessionBootstrapOptions = {},
): Promise<TelegramSessionBootstrapResult> {
  const preview = previewTelegramSessionBootstrap(input, options);
  const now = options.now ?? (() => new Date());
  if (preview.missingInputs.length) {
    return blocked(preview, now, `Missing required setup input: ${preview.missingInputs.join(", ")}.`);
  }
  if (options.supervisor) {
    try {
      await options.supervisor.startForSetup({ apiCredentialsPresent: preview.apiCredentialsPresent });
    } catch (error) {
      return blocked(preview, now, errorMessage(error));
    }
  }

  const normalized = normalizeInput(input);
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const env = options.env ?? process.env;
  const headers = credentialHeaders(env);
  const body = bodyForAction(normalized, preview);
  const method = normalized.action === "status" ? "GET" : "POST";
  const endpoint = `${preview.bridgeBaseUrl}${endpointFor(normalized.action, normalized.profileId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(endpoint, {
      method,
      headers: method === "GET" ? headers : { ...headers, "content-type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return blocked(preview, now, `Telegram setup endpoint returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`);
    }
    const envelope = await response.json() as TelegramBridgeAuthEnvelope;
    return {
      ...preview,
      applyStatus: "applied",
      applied: true,
      checkedAt: now().toISOString(),
      authState: summarizeAuthEnvelope(envelope),
    };
  } catch (error) {
    return blocked(preview, now, errorMessage(error));
  } finally {
    clearTimeout(timeout);
  }
}

export function telegramSessionBootstrapPreviewText(preview: TelegramSessionBootstrapPreview): string {
  return [
    "Telegram session bootstrap preview",
    `Provider: ${preview.providerId}`,
    `Action: ${preview.action}`,
    `Profile: ${preview.profileId}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    `API credentials present: ${preview.apiCredentialsPresent ? "yes" : "no"}`,
    `Phone number present: ${preview.phoneNumberPresent ? "yes" : "no"}`,
    `Code present: ${preview.codePresent ? "yes" : "no"}`,
    `Password present: ${preview.passwordPresent ? "yes" : "no"}`,
    `Would launch bridge for setup: ${preview.wouldLaunchBridgeForSetup ? "yes" : "no"}`,
    `Would call endpoint: ${preview.wouldCallEndpoint}`,
    `Would read provider messages: ${preview.wouldReadProviderMessages ? "yes" : "no"}`,
    `Would send provider messages: ${preview.wouldSendProviderMessages ? "yes" : "no"}`,
    preview.missingInputs.length ? `Missing inputs: ${preview.missingInputs.join(", ")}` : "Missing inputs: none",
    preview.bridgeSupervisor ? `Bridge supervisor: ${preview.bridgeSupervisor.state}` : undefined,
    "",
    "Policy notes:",
    ...preview.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...preview.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function telegramSessionBootstrapResultText(result: TelegramSessionBootstrapResult): string {
  return [
    "Telegram session bootstrap apply",
    `Provider: ${result.providerId}`,
    `Action: ${result.action}`,
    `Profile: ${result.profileId}`,
    `Apply status: ${result.applyStatus}`,
    `Applied: ${result.applied ? "yes" : "no"}`,
    result.blockedReason ? `Blocked reason: ${result.blockedReason}` : undefined,
    result.authState ? `Auth state: ${result.authState.state}` : undefined,
    result.authState ? `Ready: ${result.authState.ready ? "yes" : "no"}` : undefined,
    result.authState ? `Needs code: ${result.authState.needsCode ? "yes" : "no"}` : undefined,
    result.authState ? `Needs password: ${result.authState.needsPassword ? "yes" : "no"}` : undefined,
    result.authState ? `Phone number present: ${result.authState.phoneNumberPresent ? "yes" : "no"}` : undefined,
    "",
    "Safety:",
    `- Read provider messages: ${result.wouldReadProviderMessages ? "yes" : "no"}`,
    `- Send provider messages: ${result.wouldSendProviderMessages ? "yes" : "no"}`,
    "- Secret values and phone numbers are redacted from this output.",
    "",
    "Next steps:",
    ...result.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function telegramSessionBootstrapSetupCard(
  value: TelegramSessionBootstrapPreview | TelegramSessionBootstrapResult,
): TelegramSessionSetupCard {
  const status = telegramSessionSetupStatus(value);
  const blockedReason = "blockedReason" in value ? value.blockedReason : undefined;
  const authState = "authState" in value ? value.authState : undefined;
  const checkedAt = "checkedAt" in value ? value.checkedAt : undefined;
  const applied = "applied" in value ? value.applied : undefined;
  const title = telegramSessionSetupTitle(status);
  const detail = telegramSessionSetupDetail(status, value, blockedReason);
  const primaryAction = telegramSessionSetupPrimaryAction(value, status);
  return {
    kind: "telegram-session-setup",
    providerId: value.providerId,
    profileId: value.profileId,
    action: value.action,
    status,
    title,
    summary: telegramSessionSetupSummary(status, value, blockedReason),
    detail,
    ...(checkedAt ? { checkedAt } : {}),
    ...(applied !== undefined ? { applied } : {}),
    ...(authState
      ? {
          authState: {
            state: authState.state,
            ready: authState.ready,
            needsCode: authState.needsCode,
            needsPassword: authState.needsPassword,
            phoneNumberPresent: authState.phoneNumberPresent,
            ...(authState.message ? { message: authState.message } : {}),
          },
        }
      : {}),
    missingInputs: [...value.missingInputs],
    ...(primaryAction ? { primaryAction } : {}),
    secondaryActions: telegramSessionSetupSecondaryActions(value, status),
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: false,
      createsBinding: false,
      enablesInboundIngestion: false,
    },
  };
}

function normalizeInput(input: TelegramSessionBootstrapInput): Required<Pick<TelegramSessionBootstrapInput, "action" | "profileId">> & Omit<TelegramSessionBootstrapInput, "action" | "profileId"> {
  if (input.providerId && input.providerId.trim() !== PROVIDER_ID) throw new Error(`providerId must be ${PROVIDER_ID}.`);
  if (!["start_auth", "status", "submit_code", "submit_password"].includes(input.action)) throw new Error("action must be start_auth, status, submit_code, or submit_password.");
  const profileId = input.profileId.trim();
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(profileId)) throw new Error("profileId must be 1-80 chars of letters, numbers, underscore, dash, or dot.");
  return {
    ...input,
    action: input.action,
    profileId,
    phoneNumber: input.phoneNumber?.trim(),
    code: input.code?.trim(),
  };
}

function telegramSessionSetupStatus(value: TelegramSessionBootstrapPreview | TelegramSessionBootstrapResult): TelegramSessionSetupCardStatus {
  const authState = "authState" in value ? value.authState : undefined;
  if ("applyStatus" in value && value.applyStatus === "blocked") return "blocked";
  if (authState?.ready) return "ready";
  if (authState?.needsCode) return "needs_code";
  if (authState?.needsPassword) return "needs_password";
  if (value.missingInputs.includes("secure code input")) return "needs_code";
  if (value.missingInputs.includes("secure password input")) return "needs_password";
  if (value.missingInputs.length) return "blocked";
  if ("applied" in value && value.applied) return authState ? "pending" : "unknown";
  return "preview";
}

function telegramSessionSetupTitle(status: TelegramSessionSetupCardStatus): string {
  if (status === "needs_code") return "Telegram login code needed";
  if (status === "needs_password") return "Telegram two-factor password needed";
  if (status === "ready") return "Telegram setup ready";
  if (status === "blocked") return "Telegram setup blocked";
  if (status === "pending") return "Telegram setup pending";
  if (status === "unknown") return "Telegram setup state unknown";
  return "Telegram setup preview";
}

function telegramSessionSetupSummary(
  status: TelegramSessionSetupCardStatus,
  value: TelegramSessionBootstrapPreview | TelegramSessionBootstrapResult,
  blockedReason?: string,
): string {
  if (status === "needs_code") return `Profile ${value.profileId} is waiting for a Telegram login code.`;
  if (status === "needs_password") return `Profile ${value.profileId} is waiting for a Telegram two-factor password.`;
  if (status === "ready") return `Profile ${value.profileId} is authenticated and ready for later binding setup.`;
  if (status === "blocked") return blockedReason ?? `Profile ${value.profileId} setup is blocked.`;
  if (status === "pending") return `Profile ${value.profileId} setup is still in progress.`;
  if (status === "unknown") return `Profile ${value.profileId} returned no recognizable auth state.`;
  return `Profile ${value.profileId} setup can be reviewed without reading or sending Telegram messages.`;
}

function telegramSessionSetupDetail(
  status: TelegramSessionSetupCardStatus,
  value: TelegramSessionBootstrapPreview | TelegramSessionBootstrapResult,
  blockedReason?: string,
): string {
  const authState = "authState" in value ? value.authState : undefined;
  if (blockedReason) return blockedReason;
  if (authState?.message) return authState.message;
  if (status === "needs_code") return "Use the secure Desktop input dialog for the code. Do not paste the code into chat.";
  if (status === "needs_password") return "Use the secure Desktop input dialog for the password. Do not paste the password into chat.";
  if (status === "ready") return "Inbound ingestion, outbound sending, and purpose bindings are still disabled until explicitly approved.";
  if (value.missingInputs.length) return `Missing setup input: ${value.missingInputs.join(", ")}.`;
  return "This setup surface is auth-only. It does not list chats, read messages, create bindings, or send provider messages.";
}

function telegramSessionSetupPrimaryAction(
  value: TelegramSessionBootstrapPreview | TelegramSessionBootstrapResult,
  status: TelegramSessionSetupCardStatus,
): TelegramSessionSetupCardAction | undefined {
  if (status === "needs_code") {
    return telegramSessionSetupPromptAction({
      id: "submit-code",
      label: "Enter code",
      title: "Continue Telegram setup with a secure login-code dialog",
      tone: "primary",
      providerId: value.providerId,
      profileId: value.profileId,
      action: "submit_code",
      purpose: "Open the secure Desktop login-code dialog, then refresh Telegram readiness.",
    });
  }
  if (status === "needs_password") {
    return telegramSessionSetupPromptAction({
      id: "submit-password",
      label: "Enter password",
      title: "Continue Telegram setup with a secure two-factor password dialog",
      tone: "primary",
      providerId: value.providerId,
      profileId: value.profileId,
      action: "submit_password",
      purpose: "Open the secure Desktop two-factor password dialog, then refresh Telegram readiness.",
    });
  }
  return undefined;
}

function telegramSessionSetupSecondaryActions(
  value: TelegramSessionBootstrapPreview | TelegramSessionBootstrapResult,
  status: TelegramSessionSetupCardStatus,
): TelegramSessionSetupCardAction[] {
  if (status === "preview" && value.action !== "status") return [];
  return [
    telegramSessionSetupPromptAction({
      id: "refresh-status",
      label: "Refresh status",
      title: "Refresh Telegram setup status and provider readiness",
      tone: "secondary",
      providerId: value.providerId,
      profileId: value.profileId,
      action: "status",
      purpose: "Refresh the Telegram auth state and provider readiness without listing chats, reading messages, or sending messages.",
    }),
  ];
}

function telegramSessionSetupPromptAction(input: {
  id: string;
  label: string;
  title: string;
  tone: "primary" | "secondary";
  providerId: string;
  profileId: string;
  action: TelegramSessionBootstrapAction;
  purpose: string;
}): TelegramSessionSetupCardAction {
  const toolArgs = JSON.stringify({ action: input.action, providerId: input.providerId, profileId: input.profileId });
  return {
    id: input.id,
    label: input.label,
    title: input.title,
    tone: input.tone,
    prompt: [
      input.purpose,
      `Call ambient_messaging_telegram_session_apply with ${toolArgs}.`,
      "If the tool requests a Telegram login code or two-factor password, route it through Ambient Desktop secure input; do not ask me to paste it into chat.",
      `After the setup tool returns, call ambient_messaging_provider_status for ${input.providerId} and summarize readiness.`,
      "Do not list Telegram chats, read Telegram messages, create purpose bindings, ingest inbound provider events, or send provider messages.",
    ].join(" "),
  };
}

function missingInputsFor(input: ReturnType<typeof normalizeInput>, apiCredentialsPresent: boolean): string[] {
  const missing: string[] = [];
  if (!apiCredentialsPresent) missing.push("Telegram API credentials");
  if (input.action === "start_auth" && !input.phoneNumber) missing.push("phoneNumber");
  if (input.action === "submit_code" && !input.code) missing.push("secure code input");
  if (input.action === "submit_password" && !input.password) missing.push("secure password input");
  return missing;
}

function bodyForAction(input: ReturnType<typeof normalizeInput>, preview: TelegramSessionBootstrapPreview): unknown {
  if (input.action === "start_auth") {
    return {
      profileId: input.profileId,
      phoneNumber: input.phoneNumber,
      tdlibStateDir: preview.tdlibStateDir,
      databaseEncryptionKey: randomBytes(32).toString("hex"),
    };
  }
  if (input.action === "submit_code") return { profileId: input.profileId, code: input.code };
  if (input.action === "submit_password") return { profileId: input.profileId, password: input.password };
  return undefined;
}

function endpointFor(action: TelegramSessionBootstrapAction, profileId: string): string {
  const encoded = encodeURIComponent(profileId);
  if (action === "start_auth") return "/sessions";
  if (action === "submit_code") return `/sessions/${encoded}/code`;
  if (action === "submit_password") return `/sessions/${encoded}/password`;
  return `/sessions/${encoded}`;
}

function nextStepsFor(input: ReturnType<typeof normalizeInput>, missingInputs: string[]): string[] {
  if (missingInputs.length) {
    const onlySecureInputMissing = missingInputs.every((item) => item === "secure code input" || item === "secure password input");
    if (onlySecureInputMissing) {
      return [
        "Apply setup only after explicit user approval.",
        "Ambient Desktop will request the missing Telegram code/password through a secure input dialog; do not collect it in chat.",
      ];
    }
    return [
      "Collect missing setup inputs through approved Ambient-managed flows, not chat-pasted secrets.",
      "Retry the preview before applying setup.",
    ];
  }
  if (input.action === "start_auth") {
    return [
      "Apply setup only after explicit user approval.",
      "If Telegram requests a login code or password, capture it through a secure Desktop input path before using submit_code or submit_password.",
    ];
  }
  return [
    "Apply only after explicit user approval.",
    "After setup changes, refresh messaging gateway status and keep ingestion disabled until a purpose-scoped binding is approved.",
  ];
}

function summarizeAuthEnvelope(envelope: TelegramBridgeAuthEnvelope): TelegramAuthSessionSummary {
  return {
    state: typeof envelope.state === "string" ? envelope.state : "unknown",
    ...(typeof envelope.message === "string" && envelope.message.trim() ? { message: envelope.message.trim() } : {}),
    ready: envelope.ready === true,
    needsCode: envelope.needsCode === true,
    needsPassword: envelope.needsPassword === true,
    ...(typeof envelope.lastSyncAt === "string" ? { lastSyncAt: envelope.lastSyncAt } : {}),
    phoneNumberPresent: Boolean(stringValue(envelope.phoneNumber) || stringValue(envelope.profile?.phoneNumber)),
    profile: {
      userIdPresent: Boolean(stringValue(envelope.profile?.userId)),
      usernamePresent: Boolean(stringValue(envelope.profile?.username)),
      displayNamePresent: Boolean(stringValue(envelope.profile?.displayName)),
    },
  };
}

function credentialHeaders(env: Record<string, string | undefined>): Record<string, string> {
  const apiId = env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim();
  const apiHash = env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim();
  if (!apiId || !apiHash) throw new Error("Telegram API credentials are not available to the runtime.");
  return {
    "x-telegram-api-id": apiId,
    "x-telegram-api-hash": apiHash,
  };
}

function blocked(preview: TelegramSessionBootstrapPreview, now: () => Date, blockedReason: string): TelegramSessionBootstrapResult {
  return {
    ...preview,
    applyStatus: "blocked",
    applied: false,
    checkedAt: now().toISOString(),
    blockedReason,
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.name === "AbortError" ? "Telegram setup request timed out." : error.message;
  return String(error);
}
