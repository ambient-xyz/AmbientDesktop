import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
  MessagingInboundEvent,
} from "../../../shared/messagingGateway";
import type { MessagingGatewayInboundDispatchResult } from "../../messaging/messagingGatewayRunner";
import {
  signalBridgeEndpointPaths,
  signalBridgeRealUnreadWindowContract,
  type SignalBridgeRealUnreadWindowContract,
  validateSignalBridgeUnreadWindowDispatchEnvelope,
} from "./signalBridgeContract";

const SIGNAL_PROVIDER_ID = "signal-cli";
const MAX_UNREAD_LIMIT = 25;
const MAX_SEEN_IDS = 500;
const DEFAULT_BRIDGE_PORT = "8092";
const FAKE_BRIDGE_APPLY_FLAG = "AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY";

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface SignalUnreadWindowInput {
  providerId: "signal-cli";
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
  limit: number;
}

export interface SignalUnreadWindowBindingSummary {
  bindingId: string;
  authProfileId: string;
  conversationId: string;
  ownerUserId: string;
  ambientSurface?: string;
  maxDisclosureLabel?: string;
}

export interface SignalUnreadWindowContract {
  kind: "signal-bounded-unread-window-v0";
  providerId: "signal-cli";
  endpointPath?: string;
  applyToolName: "ambient_messaging_signal_unread_window_apply";
  requiredScopeFields: string[];
  bridgeInternalMessageFields: string[];
  piVisibleMessageFields: string[];
  forbiddenPiVisibleFields: string[];
  dispatchBoundary: string[];
}

export type SignalRealUnreadReadinessStatus =
  | "fake-ready"
  | "real-contract-present-but-blocked"
  | "real-ready-for-approved-single-read";

export interface SignalRealUnreadReadiness {
  status: SignalRealUnreadReadinessStatus;
  contractReady: boolean;
  singleReadReady: boolean;
  applyImplemented: boolean;
  contract: SignalBridgeRealUnreadWindowContract;
  blockers: string[];
  warnings: string[];
}

export interface SignalUnreadWindowPreview {
  providerId: "signal-cli";
  status: "ready" | "blocked";
  canApplyNow: boolean;
  contractReady: boolean;
  previewOnly: boolean;
  approvalRequired: true;
  applyToolName: "ambient_messaging_signal_unread_window_apply";
  fakeBridgeApplyEnabled: boolean;
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
  limit: number;
  endpointPath?: string;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  selectedBindings: SignalUnreadWindowBindingSummary[];
  contract: SignalUnreadWindowContract;
  realBridgeUnreadEnabled: false;
  realBridgeUnreadReadiness: SignalRealUnreadReadiness;
  blockers: string[];
  contractBlockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    readsProviderUnreadMessages: boolean;
    resolvesSenderProfiles: false;
    returnsProviderMessageBodiesToPi: false;
    routesRemoteAmbientSurface: boolean;
    writesDedupeState: boolean;
    startsBridge: false;
    sendsProviderMessages: false;
    mutatesBindings: false;
  };
}

export interface SignalUnreadWindowDispatchSummary {
  messageId: string;
  accepted: boolean;
  queuedProjectionId?: string;
  projectionKind?: string;
  projectionTitle?: string;
  droppedReason?: string;
}

export interface SignalUnreadWindowApplyResult extends SignalUnreadWindowPreview {
  applyStatus: "applied" | "blocked" | "denied" | "failed";
  approvalRequested: boolean;
  approvalRecorded: boolean;
  polled: boolean;
  statePath?: string;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  duplicateMessageCount: number;
  skippedMessageCount: number;
  acceptedDispatchCount: number;
  droppedDispatchCount: number;
  dispatches: SignalUnreadWindowDispatchSummary[];
  seenMessageCount?: number;
  lastPollAt?: string;
  lastAcceptedMessageId?: string;
  failureHint?: string;
  error?: string;
}

export interface SignalUnreadWindowStatusInput {
  providerId: "signal-cli";
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
  includeInactive: boolean;
}

export type SignalRealUnreadWindowInput = SignalUnreadWindowInput;

export interface SignalRealUnreadWindowPreview {
  providerId: "signal-cli";
  status: "ready" | "blocked";
  canApplyNow: boolean;
  previewOnly: boolean;
  approvalRequired: true;
  applyToolName: "ambient_messaging_signal_real_unread_window_apply";
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
  limit: number;
  endpointPath?: string;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  selectedBindings: SignalUnreadWindowBindingSummary[];
  realBridgeUnreadEnabled: boolean;
  realBridgeUnreadReadiness: SignalRealUnreadReadiness;
  contractBlockers: string[];
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    requestsApproval: boolean;
    contactsBridgeUnreadEndpoint: boolean;
    readsProviderUnreadMessages: boolean;
    returnsProviderMessageBodiesToPi: false;
    routesRemoteAmbientSurface: boolean;
    writesDedupeState: boolean;
    startsBridge: false;
    sendsProviderMessages: false;
    mutatesBindings: false;
  };
}

export interface SignalRealUnreadWindowApplyResult extends SignalRealUnreadWindowPreview {
  applyStatus: "applied" | "blocked" | "denied" | "failed";
  approvalRequested: boolean;
  approvalRecorded: boolean;
  polled: boolean;
  statePath?: string;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  duplicateMessageCount: number;
  skippedMessageCount: number;
  acceptedDispatchCount: number;
  droppedDispatchCount: number;
  dispatches: SignalUnreadWindowDispatchSummary[];
  seenMessageCount?: number;
  lastPollAt?: string;
  lastAcceptedMessageId?: string;
  failureHint?: string;
  error?: string;
}

export interface SignalUnreadWindowQueuedProjectionSummary {
  queuedProjectionId: string;
  bindingId?: string;
  conversationId: string;
  sourceEventId: string;
  projectionKind: string;
  projectionTitle: string;
  queuedAt: string;
}

export interface SignalUnreadWindowBindingStatus {
  bindingId: string;
  bindingStatus: string;
  profileId: string;
  conversationId: string;
  ownerUserIdPresent: boolean;
  ambientSurface?: string;
  initialSeenMessageCount: number;
  dedupeSeenMessageCount: number;
  lastPollAt?: string;
  lastAcceptedMessageId?: string;
  queuedProjectionCount: number;
  queuedProjections: SignalUnreadWindowQueuedProjectionSummary[];
}

export interface SignalUnreadWindowStatus {
  providerId: "signal-cli";
  status: "ready" | "blocked";
  statePath: string;
  stateReadable: boolean;
  stateError?: string;
  fakeBridgeApplyEnabled: boolean;
  realBridgeUnreadEnabled: false;
  realBridgeUnreadReadiness: SignalRealUnreadReadiness;
  bridgeModeLabel: string;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  selectedBindingCount: number;
  activeSignalRemoteSurfaceBindingCount: number;
  dedupeBindingCount: number;
  queuedSignalProjectionCount: number;
  bindings: SignalUnreadWindowBindingStatus[];
  blockers: string[];
  warnings: string[];
  nextSteps: string[];
  safety: {
    readsProviderUnreadMessages: false;
    returnsProviderMessageBodiesToPi: false;
    startsBridge: false;
    sendsProviderMessages: false;
    mutatesBindings: false;
  };
}

interface SignalUnreadWindowState {
  version: 1;
  bindings: Record<string, SignalUnreadWindowBindingState>;
}

interface SignalUnreadWindowBindingState {
  seenMessageIds: string[];
  lastPollAt?: string;
  lastAcceptedMessageId?: string;
}

interface SignalUnreadWindowCorePreview {
  canApplyNow: boolean;
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
  endpointPath?: string;
  policyNotes: string[];
}

interface SignalUnreadWindowCoreResult {
  applyStatus: "applied" | "failed";
  approvalRecorded: boolean;
  polled: boolean;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  duplicateMessageCount: number;
  skippedMessageCount: number;
  acceptedDispatchCount: number;
  droppedDispatchCount: number;
  dispatches: SignalUnreadWindowDispatchSummary[];
  seenMessageCount?: number;
  lastPollAt?: string;
  lastAcceptedMessageId?: string;
  failureHint?: string;
  error?: string;
  policyNotes: string[];
}

export function signalUnreadWindowInput(params: unknown): SignalUnreadWindowInput {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId) ?? SIGNAL_PROVIDER_ID;
  if (providerId !== SIGNAL_PROVIDER_ID) {
    throw new Error(`providerId must be ${SIGNAL_PROVIDER_ID} when supplied.`);
  }
  const limitValue = typeof raw?.limit === "number" && Number.isFinite(raw.limit)
    ? Math.floor(raw.limit)
    : 10;
  return {
    providerId: SIGNAL_PROVIDER_ID,
    profileId: optionalString(raw?.profileId) ?? optionalString(raw?.authProfileId),
    conversationId: optionalString(raw?.conversationId),
    bindingId: optionalString(raw?.bindingId),
    limit: Math.max(1, Math.min(MAX_UNREAD_LIMIT, limitValue)),
  };
}

export function signalUnreadWindowStatusInput(params: unknown): SignalUnreadWindowStatusInput {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId) ?? SIGNAL_PROVIDER_ID;
  if (providerId !== SIGNAL_PROVIDER_ID) {
    throw new Error(`providerId must be ${SIGNAL_PROVIDER_ID} when supplied.`);
  }
  return {
    providerId: SIGNAL_PROVIDER_ID,
    profileId: optionalString(raw?.profileId) ?? optionalString(raw?.authProfileId),
    conversationId: optionalString(raw?.conversationId),
    bindingId: optionalString(raw?.bindingId),
    includeInactive: raw?.includeInactive === true,
  };
}

export function signalRealUnreadWindowInput(params: unknown): SignalRealUnreadWindowInput {
  return signalUnreadWindowInput(params);
}

export function buildSignalRealUnreadWindowPreview(input: {
  toolInput: SignalRealUnreadWindowInput;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
}): SignalRealUnreadWindowPreview {
  const runtimeProvider = input.runtimeStatus?.providers.find((provider) => provider.providerId === SIGNAL_PROVIDER_ID);
  const matchingBindings = activeOwnerSignalBindings(input.bindings.bindings)
    .filter((binding) => input.toolInput.bindingId ? binding.id === input.toolInput.bindingId : true)
    .filter((binding) => input.toolInput.profileId ? binding.authProfileId === input.toolInput.profileId : true)
    .filter((binding) => input.toolInput.conversationId ? binding.conversationId === input.toolInput.conversationId : true);
  const selectedBinding = input.toolInput.bindingId && matchingBindings.length === 1 ? matchingBindings[0] : undefined;
  const profileId = input.toolInput.profileId ?? selectedBinding?.authProfileId;
  const conversationId = input.toolInput.conversationId ?? selectedBinding?.conversationId;
  const scopeBlockers: string[] = [];
  if (!input.toolInput.bindingId) {
    scopeBlockers.push("Real Signal unread apply requires an exact active bindingId before apply can be ready.");
  }
  if (matchingBindings.length > 1) {
    scopeBlockers.push("Real Signal unread scope matched multiple active owner bindings; provide one exact bindingId.");
  }
  const realBridgeUnreadReadiness = buildSignalRealUnreadReadiness({
    profileId,
    conversationId,
    limit: input.toolInput.limit,
    binding: selectedBinding,
    runtimeProvider,
    fakeApplyReady: false,
    applyImplemented: true,
  });
  const endpointPath = realBridgeUnreadReadiness.contract.endpointPath;
  const blockers = [...scopeBlockers, ...realBridgeUnreadReadiness.blockers];
  const canApplyNow = blockers.length === 0 && realBridgeUnreadReadiness.singleReadReady;
  return {
    providerId: SIGNAL_PROVIDER_ID,
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    previewOnly: !canApplyNow,
    approvalRequired: true,
    applyToolName: "ambient_messaging_signal_real_unread_window_apply",
    ...(profileId ? { profileId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(input.toolInput.bindingId ? { bindingId: input.toolInput.bindingId } : {}),
    limit: input.toolInput.limit,
    ...(endpointPath ? { endpointPath } : {}),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    selectedBindings: matchingBindings.map(bindingSummary),
    realBridgeUnreadEnabled: canApplyNow,
    realBridgeUnreadReadiness,
    contractBlockers: blockers,
    blockers,
    warnings: [
      "Real Signal unread apply is a single approval-gated read only; it never sends replies. Use the separate typed Signal polling and bridge-reply tools for those reviewed paths.",
      "Do not use the fake dogfood unread apply, shell, browser, Signal Desktop UI, provider CLIs, generic binding tools, or Telegram tools as a workaround.",
      ...realBridgeUnreadReadiness.warnings,
    ],
    policyNotes: [
      "This is the only reviewed real Signal unread entrypoint. It does not use the fake bridge dogfood flag.",
      "The real-read shape is one approved bounded single read for one exact active owner Remote Ambient Surface binding.",
      "Provider message bodies are retained only inside the adapter for command routing and must not be returned directly to Pi.",
      "Deduplication state is checked and written before returning so repeated single reads are idempotent.",
      "Periodic polling and Signal replies require separate reviewed typed contracts.",
    ],
    nextSteps: canApplyNow
      ? [
        "Ask the user to approve one real bounded Signal unread single-read.",
        "Apply will call only the reviewed bounded unread endpoint for this exact binding and return sanitized dispatch metadata.",
      ]
      : [
        "Satisfy the exact active owner binding and reviewed bridge readiness gates before applying a real single read.",
        "Do not retry with shell, browser, Signal Desktop UI, provider CLIs, generic binding tools, Telegram tools, or fake dogfood apply.",
      ],
    safety: {
      requestsApproval: canApplyNow,
      contactsBridgeUnreadEndpoint: canApplyNow,
      readsProviderUnreadMessages: canApplyNow,
      returnsProviderMessageBodiesToPi: false,
      routesRemoteAmbientSurface: canApplyNow,
      writesDedupeState: canApplyNow,
      startsBridge: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
    },
  };
}

export function signalRealUnreadWindowPreviewText(preview: SignalRealUnreadWindowPreview): string {
  return [
    `Signal real unread-window preview: ${preview.status}`,
    `Provider: ${preview.providerId}`,
    `Status: ${preview.status}`,
    `Preview only: ${preview.previewOnly ? "yes" : "no"}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Approval required before apply: ${preview.approvalRequired ? "yes" : "no"}`,
    `Apply tool: ${preview.applyToolName}`,
    preview.bindingId ? `Binding: ${preview.bindingId}` : undefined,
    preview.profileId ? `Profile: ${preview.profileId}` : undefined,
    preview.conversationId ? `Conversation: ${preview.conversationId}` : undefined,
    `Limit: ${preview.limit}`,
    preview.endpointPath ? `Endpoint path: ${preview.endpointPath}` : "Endpoint path: unavailable",
    preview.runtimeProvider ? `Runtime state: ${preview.runtimeProvider.state}/${preview.runtimeProvider.mode}` : "Runtime state: unavailable",
    "",
    "Real single-read readiness:",
    `- Status: ${preview.realBridgeUnreadReadiness.status}`,
    `- Contract ready: ${preview.realBridgeUnreadReadiness.contractReady ? "yes" : "no"}`,
    `- Ready for approved single read: ${preview.realBridgeUnreadReadiness.singleReadReady ? "yes" : "no"}`,
    `- Apply implemented: ${preview.realBridgeUnreadReadiness.applyImplemented ? "yes" : "no"}`,
    `- Real unread ingestion enabled: ${preview.realBridgeUnreadEnabled ? "yes" : "no"}`,
    `- Contract: ${preview.realBridgeUnreadReadiness.contract.kind}`,
    preview.realBridgeUnreadReadiness.contract.endpointPath ? `- Endpoint: ${preview.realBridgeUnreadReadiness.contract.endpointPath}` : undefined,
    ...preview.realBridgeUnreadReadiness.blockers.map((blocker) => `- Blocker: ${blocker}`),
    "",
    "Safety:",
    `- Requests approval: ${preview.safety.requestsApproval ? "yes" : "no"}`,
    `- Contacts bridge unread endpoint: ${preview.safety.contactsBridgeUnreadEndpoint ? "yes" : "no"}`,
    `- Reads provider unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Returns provider message bodies to Pi: ${preview.safety.returnsProviderMessageBodiesToPi ? "yes" : "no"}`,
    `- Routes Remote Ambient Surface: ${preview.safety.routesRemoteAmbientSurface ? "yes" : "no"}`,
    `- Writes dedupe state: ${preview.safety.writesDedupeState ? "yes" : "no"}`,
    `- Starts bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    `- Sends provider messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    `- Mutates bindings: ${preview.safety.mutatesBindings ? "yes" : "no"}`,
    "",
    "Selected bindings:",
    ...(preview.selectedBindings.length
      ? preview.selectedBindings.flatMap((binding) => [
        `- ${binding.bindingId}`,
        `  Profile: ${binding.authProfileId}`,
        `  Conversation: ${binding.conversationId}`,
        `  Owner: ${binding.ownerUserId}`,
        binding.ambientSurface ? `  Surface: ${binding.ambientSurface}` : undefined,
        binding.maxDisclosureLabel ? `  Max disclosure: ${binding.maxDisclosureLabel}` : undefined,
      ].filter((line): line is string => Boolean(line)))
      : ["- None"]),
    "",
    "Blockers:",
    ...(preview.blockers.length ? preview.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Warnings:",
    ...(preview.warnings.length ? preview.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "Policy notes:",
    ...preview.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...preview.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function signalRealUnreadWindowBlockedResult(preview: SignalRealUnreadWindowPreview): SignalRealUnreadWindowApplyResult {
  return {
    ...preview,
    applyStatus: "blocked",
    approvalRequested: false,
    approvalRecorded: false,
    polled: false,
    fetchedMessageCount: 0,
    candidateMessageCount: 0,
    duplicateMessageCount: 0,
    skippedMessageCount: 0,
    acceptedDispatchCount: 0,
    droppedDispatchCount: 0,
    dispatches: [],
    failureHint: preview.blockers.join("; ") || "Real Signal unread single-read apply is blocked.",
  };
}

export function signalRealUnreadWindowDeniedResult(preview: SignalRealUnreadWindowPreview, statePath?: string): SignalRealUnreadWindowApplyResult {
  return {
    ...signalRealUnreadWindowBlockedResult(preview),
    applyStatus: "denied",
    approvalRequested: true,
    ...(statePath ? { statePath } : {}),
    failureHint: "The user denied the real bounded Signal unread single-read. No Signal unread messages were read.",
  };
}

export function signalRealUnreadWindowFailedResult(
  preview: SignalRealUnreadWindowPreview,
  statePath: string,
  error: string,
): SignalRealUnreadWindowApplyResult {
  return {
    ...signalRealUnreadWindowBlockedResult(preview),
    applyStatus: "failed",
    approvalRequested: true,
    approvalRecorded: true,
    statePath,
    error,
    failureHint: "Real Signal unread single-read failed closed before returning provider message bodies to Pi.",
  };
}

export function signalRealUnreadWindowApprovalDetail(preview: SignalRealUnreadWindowPreview): string {
  return [
    `Provider: ${preview.providerId}`,
    `Binding: ${preview.bindingId ?? "missing"}`,
    `Profile: ${preview.profileId ?? "missing"}`,
    `Conversation: ${preview.conversationId ?? "missing"}`,
    `Limit: ${preview.limit}`,
    `Endpoint: ${preview.endpointPath ?? "unavailable"}`,
    `Real single-read readiness: ${preview.realBridgeUnreadReadiness.status}`,
    `Would contact bridge unread endpoint: ${preview.safety.contactsBridgeUnreadEndpoint ? "yes" : "no"}`,
    `Would read unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `Would route Remote Ambient Surface: ${preview.safety.routesRemoteAmbientSurface ? "yes" : "no"}`,
    `Would write dedupe state: ${preview.safety.writesDedupeState ? "yes" : "no"}`,
    `Would return provider message bodies to Pi: ${preview.safety.returnsProviderMessageBodiesToPi ? "yes" : "no"}`,
    `Would send Signal messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    ...preview.policyNotes,
  ].join("\n");
}

export async function applySignalRealUnreadWindow(input: {
  preview: SignalRealUnreadWindowPreview;
  bindings: MessagingBindingListResult;
  stateRoot: string;
  approvalRecorded: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
  now?: () => Date;
  dispatch: (event: MessagingInboundEvent) => MessagingGatewayInboundDispatchResult;
}): Promise<SignalRealUnreadWindowApplyResult> {
  const statePath = signalUnreadWindowStatePath(input.stateRoot);
  if (!input.preview.canApplyNow) return { ...signalRealUnreadWindowBlockedResult(input.preview), statePath };
  if (!input.approvalRecorded) return signalRealUnreadWindowDeniedResult(input.preview, statePath);
  const binding = input.bindings.bindings.find((candidate) => candidate.id === input.preview.bindingId);
  if (!binding) {
    return signalRealUnreadWindowFailedResult(input.preview, statePath, "Active Signal Remote Ambient Surface binding disappeared before real apply.");
  }
  if (binding.status !== "active" || binding.providerId !== SIGNAL_PROVIDER_ID || binding.purpose !== "remote_ambient_surface") {
    return signalRealUnreadWindowFailedResult(input.preview, statePath, "Binding no longer matches the active Signal Remote Ambient Surface scope.");
  }
  if (!binding.ownerUserId?.trim()) {
    return signalRealUnreadWindowFailedResult(input.preview, statePath, "Binding no longer has an owner sender id.");
  }
  if (binding.authProfileId !== input.preview.profileId || binding.conversationId !== input.preview.conversationId) {
    return signalRealUnreadWindowFailedResult(input.preview, statePath, "Binding profile/conversation no longer matches the real unread preview scope.");
  }
  try {
    const applied = await applySignalUnreadWindowCore({
      preview: input.preview,
      binding,
      statePath,
      approvalRecorded: true,
      env: input.env,
      fetchFn: input.fetchFn,
      now: input.now,
      dispatch: input.dispatch,
    });
    return {
      ...input.preview,
      applyStatus: applied.applyStatus,
      approvalRequested: true,
      approvalRecorded: applied.approvalRecorded,
      polled: applied.polled,
      statePath,
      fetchedMessageCount: applied.fetchedMessageCount,
      candidateMessageCount: applied.candidateMessageCount,
      duplicateMessageCount: applied.duplicateMessageCount,
      skippedMessageCount: applied.skippedMessageCount,
      acceptedDispatchCount: applied.acceptedDispatchCount,
      droppedDispatchCount: applied.droppedDispatchCount,
      dispatches: applied.dispatches,
      ...(applied.seenMessageCount !== undefined ? { seenMessageCount: applied.seenMessageCount } : {}),
      ...(applied.lastPollAt ? { lastPollAt: applied.lastPollAt } : {}),
      ...(applied.lastAcceptedMessageId ? { lastAcceptedMessageId: applied.lastAcceptedMessageId } : {}),
      ...(applied.failureHint ? { failureHint: applied.failureHint } : {}),
      ...(applied.error ? { error: applied.error } : {}),
      policyNotes: applied.policyNotes,
    };
  } catch (error) {
    return signalRealUnreadWindowFailedResult(input.preview, statePath, errorMessage(error));
  }
}

export function signalRealUnreadWindowResultText(result: SignalRealUnreadWindowApplyResult): string {
  const lines = [
    `Signal real unread-window apply: ${result.applyStatus}`,
    `Apply status: ${result.applyStatus}`,
    `Approval requested: ${result.approvalRequested ? "yes" : "no"}`,
    `Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `Polled: ${result.polled ? "yes" : "no"}`,
    result.statePath ? `Dedupe state path: ${result.statePath}` : undefined,
    result.failureHint ? `Failure hint: ${result.failureHint}` : undefined,
    result.error ? `Error: ${result.error}` : undefined,
    typeof result.seenMessageCount === "number" ? `Seen message ids for binding: ${result.seenMessageCount}` : undefined,
    result.lastPollAt ? `Last poll: ${result.lastPollAt}` : undefined,
    result.lastAcceptedMessageId ? `Last accepted message: ${result.lastAcceptedMessageId}` : undefined,
    "",
    "Counts:",
    `- Fetched messages: ${result.fetchedMessageCount}`,
    `- Candidate owner messages: ${result.candidateMessageCount}`,
    `- Duplicate messages: ${result.duplicateMessageCount}`,
    `- Skipped messages: ${result.skippedMessageCount}`,
    `- Accepted dispatches: ${result.acceptedDispatchCount}`,
    `- Dropped dispatches: ${result.droppedDispatchCount}`,
  ].filter((line): line is string => line !== undefined);
  if (result.dispatches.length) {
    lines.push("", "Dispatches:");
    for (const dispatch of result.dispatches.slice(0, 10)) {
      lines.push(`- Message: ${dispatch.messageId}`);
      lines.push(`  Accepted: ${dispatch.accepted ? "yes" : "no"}`);
      if (dispatch.queuedProjectionId) lines.push(`  Queued projection: ${dispatch.queuedProjectionId}`);
      if (dispatch.projectionKind) lines.push(`  Projection kind: ${dispatch.projectionKind}`);
      if (dispatch.projectionTitle) lines.push(`  Projection title: ${dispatch.projectionTitle}`);
      if (dispatch.droppedReason) lines.push(`  Dropped reason: ${dispatch.droppedReason}`);
    }
    if (result.dispatches.length > 10) {
      lines.push(`- ${result.dispatches.length - 10} additional dispatches omitted from preview.`);
    }
  }
  lines.push(
    "",
    "Safety:",
    `- Contacts bridge unread endpoint: ${result.safety.contactsBridgeUnreadEndpoint ? "yes" : "no"}`,
    `- Reads provider unread messages: ${result.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Returns provider message bodies to Pi: ${result.safety.returnsProviderMessageBodiesToPi ? "yes" : "no"}`,
    `- Routes Remote Ambient Surface: ${result.safety.routesRemoteAmbientSurface ? "yes" : "no"}`,
    `- Writes dedupe state: ${result.safety.writesDedupeState ? "yes" : "no"}`,
    `- Starts bridge: ${result.safety.startsBridge ? "yes" : "no"}`,
    `- Sends provider messages: ${result.safety.sendsProviderMessages ? "yes" : "no"}`,
    "",
    signalRealUnreadWindowPreviewText(result),
  );
  return lines.join("\n");
}

export function buildSignalUnreadWindowPreview(input: {
  toolInput: SignalUnreadWindowInput;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  env?: Record<string, string | undefined>;
}): SignalUnreadWindowPreview {
  const env = input.env ?? process.env;
  const runtimeProvider = input.runtimeStatus?.providers.find((provider) => provider.providerId === SIGNAL_PROVIDER_ID);
  const readiness = runtimeProvider?.readiness;
  const matchingBindings = activeOwnerSignalBindings(input.bindings.bindings)
    .filter((binding) => input.toolInput.bindingId ? binding.id === input.toolInput.bindingId : true)
    .filter((binding) => input.toolInput.profileId ? binding.authProfileId === input.toolInput.profileId : true)
    .filter((binding) => input.toolInput.conversationId ? binding.conversationId === input.toolInput.conversationId : true);
  const selectedBinding = matchingBindings.length === 1 ? matchingBindings[0] : undefined;
  const profileId = input.toolInput.profileId ?? selectedBinding?.authProfileId;
  const conversationId = input.toolInput.conversationId ?? selectedBinding?.conversationId;
  const endpointPath = profileId && conversationId
    ? endpointPathFor(profileId, conversationId, input.toolInput.limit)
    : undefined;
  const fakeBridgeApplyEnabled = env[FAKE_BRIDGE_APPLY_FLAG] === "1";
  const contractBlockers: string[] = [];
  const blockers: string[] = [];

  if (!fakeBridgeApplyEnabled) {
    blockers.push(`Signal bounded unread-window apply is enabled only for the reviewed fake bridge when ${FAKE_BRIDGE_APPLY_FLAG}=1.`);
  }
  if (!input.toolInput.bindingId) {
    contractBlockers.push("Signal unread-window apply requires an exact active Remote Ambient Surface bindingId; broad provider polling is not allowed.");
  }
  if (!matchingBindings.length) {
    contractBlockers.push("No active owner Remote Ambient Surface Signal binding matches the requested unread-window scope.");
  } else if (matchingBindings.length > 1) {
    contractBlockers.push("Signal unread-window scope matched multiple bindings; provide an exact bindingId before apply.");
  }
  if (!runtimeProvider) {
    contractBlockers.push("Signal runtime status is unavailable.");
  }
  if (!readiness) {
    contractBlockers.push("Signal readiness has not been refreshed.");
  } else {
    if (!readiness.bridgeReachable) contractBlockers.push("Signal bridge root is not reachable according to readiness.");
    if (!readiness.bridgeCapabilities?.profileStatus) contractBlockers.push("Signal bridge root did not advertise profileStatus.");
    if (!readiness.bridgeCapabilities?.boundedUnreadWindow) contractBlockers.push("Signal bridge root did not advertise boundedUnreadWindow.");
    if (!readiness.configured) contractBlockers.push("No reviewed bridge-readable Signal profile is configured.");
  }
  if (!profileId) contractBlockers.push("Signal unread-window scope requires an exact profileId from the approved binding.");
  if (!conversationId) contractBlockers.push("Signal unread-window scope requires an exact conversationId from the approved binding.");

  const contractReady = contractBlockers.length === 0;
  const canApplyNow = blockers.length === 0 && contractReady;
  const realBridgeUnreadReadiness = buildSignalRealUnreadReadiness({
    profileId,
    conversationId,
    limit: input.toolInput.limit,
    binding: selectedBinding,
    runtimeProvider,
    fakeApplyReady: canApplyNow,
  });
  return {
    providerId: SIGNAL_PROVIDER_ID,
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    contractReady,
    previewOnly: !canApplyNow,
    approvalRequired: true,
    applyToolName: "ambient_messaging_signal_unread_window_apply",
    fakeBridgeApplyEnabled,
    ...(profileId ? { profileId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(input.toolInput.bindingId ? { bindingId: input.toolInput.bindingId } : {}),
    limit: input.toolInput.limit,
    ...(endpointPath ? { endpointPath } : {}),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    selectedBindings: matchingBindings.map(bindingSummary),
    contract: signalUnreadWindowContract(endpointPath),
    realBridgeUnreadEnabled: false,
    realBridgeUnreadReadiness,
    blockers: [...blockers, ...contractBlockers],
    contractBlockers,
    warnings: [
      "This preview does not start lifecycle, poll periodically, perform broad inbound ingestion, or send replies.",
      "This preview must not be treated as permission to poll Signal or inspect Signal Desktop.",
      ...realBridgeUnreadReadiness.warnings,
    ],
    policyNotes: [
      "The Signal unread adapter must be bounded to one exact active owner Remote Ambient Surface binding.",
      "The bridge call must use the exact profile id and conversation id from the approved binding.",
      "Unread message bodies may be read only inside the adapter for Remote Ambient Surface command routing and must not be returned directly to Pi.",
      "Pi-visible results should contain only counts, dispatch ids, projection ids/titles, dropped reasons, and non-message metadata.",
      "Deduplication/high-water state must be written before repeated polling is enabled.",
      "Outbound Signal replies require a separate approved reply adapter and are out of scope for this preview.",
    ],
    nextSteps: canApplyNow
      ? [
        "Ask the user to approve one bounded fake-bridge Signal unread-window read.",
        "Apply routes accepted owner messages through the provider-neutral Remote Ambient Surface dispatch path and returns only sanitized dispatch metadata.",
      ]
      : contractReady
      ? [
        `Keep apply blocked unless the reviewed fake bridge apply flag ${FAKE_BRIDGE_APPLY_FLAG}=1 is enabled in this test/runtime environment.`,
        "Do not use shell, browser, Signal Desktop UI, provider CLIs, or Telegram-specific tools to read Signal messages as a workaround.",
      ]
      : [
        "Create an approved active owner Remote Ambient Surface binding and reviewed bridge readiness before implementing unread-window apply.",
        "Do not use shell, browser, Signal Desktop UI, provider CLIs, or Telegram-specific tools to read Signal messages as a workaround.",
      ],
    safety: {
      readsProviderUnreadMessages: canApplyNow,
      resolvesSenderProfiles: false,
      returnsProviderMessageBodiesToPi: false,
      routesRemoteAmbientSurface: canApplyNow,
      writesDedupeState: canApplyNow,
      startsBridge: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
    },
  };
}

export function signalUnreadWindowPreviewText(preview: SignalUnreadWindowPreview): string {
  return [
    "Signal bounded unread-window preview",
    `Provider: ${preview.providerId}`,
    `Status: ${preview.status}`,
    `Preview only: ${preview.previewOnly ? "yes" : "no"}`,
    `Contract ready: ${preview.contractReady ? "yes" : "no"}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Apply tool: ${preview.applyToolName}`,
    `Fake bridge apply enabled: ${preview.fakeBridgeApplyEnabled ? "yes" : "no"}`,
    preview.bindingId ? `Binding: ${preview.bindingId}` : undefined,
    preview.profileId ? `Profile: ${preview.profileId}` : undefined,
    preview.conversationId ? `Conversation: ${preview.conversationId}` : undefined,
    `Limit: ${preview.limit}`,
    preview.endpointPath ? `Endpoint path: ${preview.endpointPath}` : "Endpoint path: unavailable",
    preview.runtimeProvider ? `Runtime state: ${preview.runtimeProvider.state}/${preview.runtimeProvider.mode}` : "Runtime state: unavailable",
    "",
    "Real Signal unread readiness:",
    `- Status: ${preview.realBridgeUnreadReadiness.status}`,
    `- Contract ready: ${preview.realBridgeUnreadReadiness.contractReady ? "yes" : "no"}`,
    `- Ready for approved single read: ${preview.realBridgeUnreadReadiness.singleReadReady ? "yes" : "no"}`,
    `- Apply implemented: ${preview.realBridgeUnreadReadiness.applyImplemented ? "yes" : "no"}`,
    `- Real unread ingestion enabled: ${preview.realBridgeUnreadEnabled ? "yes" : "no"}`,
    `- Contract: ${preview.realBridgeUnreadReadiness.contract.kind}`,
    preview.realBridgeUnreadReadiness.contract.endpointPath ? `- Endpoint: ${preview.realBridgeUnreadReadiness.contract.endpointPath}` : undefined,
    ...preview.realBridgeUnreadReadiness.blockers.map((blocker) => `- Blocker: ${blocker}`),
    "",
    "Safety:",
    `- Reads provider unread messages on apply: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Resolves sender profiles on apply: ${preview.safety.resolvesSenderProfiles ? "yes" : "no"}`,
    `- Returns provider message bodies to Pi: ${preview.safety.returnsProviderMessageBodiesToPi ? "yes" : "no"}`,
    `- Routes Remote Ambient Surface on apply: ${preview.safety.routesRemoteAmbientSurface ? "yes" : "no"}`,
    `- Writes dedupe state on apply: ${preview.safety.writesDedupeState ? "yes" : "no"}`,
    `- Starts bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    `- Sends provider messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    `- Mutates bindings: ${preview.safety.mutatesBindings ? "yes" : "no"}`,
    "",
    `Contract: ${preview.contract.kind}`,
    `Required scope fields: ${preview.contract.requiredScopeFields.join(", ")}`,
    `Bridge internal message fields: ${preview.contract.bridgeInternalMessageFields.join(", ")}`,
    `Pi-visible message fields: ${preview.contract.piVisibleMessageFields.join(", ")}`,
    `Forbidden Pi-visible fields: ${preview.contract.forbiddenPiVisibleFields.join(", ")}`,
    "",
    "Selected bindings:",
    ...(preview.selectedBindings.length
      ? preview.selectedBindings.flatMap((binding) => [
        `- ${binding.bindingId}`,
        `  Profile: ${binding.authProfileId}`,
        `  Conversation: ${binding.conversationId}`,
        `  Owner: ${binding.ownerUserId}`,
        binding.ambientSurface ? `  Surface: ${binding.ambientSurface}` : undefined,
        binding.maxDisclosureLabel ? `  Max disclosure: ${binding.maxDisclosureLabel}` : undefined,
      ].filter((line): line is string => Boolean(line)))
      : ["- None"]),
    "",
    "Blockers:",
    ...preview.blockers.map((blocker) => `- ${blocker}`),
    "",
    "Warnings:",
    ...preview.warnings.map((warning) => `- ${warning}`),
    "",
    "Policy notes:",
    ...preview.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...preview.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function signalUnreadWindowContract(endpointPath?: string): SignalUnreadWindowContract {
  return {
    kind: "signal-bounded-unread-window-v0",
    providerId: SIGNAL_PROVIDER_ID,
    ...(endpointPath ? { endpointPath } : {}),
    applyToolName: "ambient_messaging_signal_unread_window_apply",
    requiredScopeFields: ["bindingId", "profileId", "conversationId", "ownerUserId", "limit"],
    bridgeInternalMessageFields: ["messageId", "senderId", "senderLabel", "text", "receivedAt", "outgoing"],
    piVisibleMessageFields: ["messageId", "accepted", "queuedProjectionId", "projectionKind", "projectionTitle", "droppedReason"],
    forbiddenPiVisibleFields: ["text", "body", "messageBody", "lastMessage", "rawMessage", "attachments", "contacts", "groups"],
    dispatchBoundary: [
      "Read bounded unread messages only for the exact active owner binding.",
      "Drop outgoing, duplicate, empty, wrong-sender, and unbound events before queueing projections.",
      "Return only dispatch/projection summaries to Pi; never return raw message text.",
    ],
  };
}

async function applySignalUnreadWindowCore(input: {
  preview: SignalUnreadWindowCorePreview;
  binding: MessagingBindingDescriptor;
  statePath: string;
  approvalRecorded: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
  now?: () => Date;
  dispatch: (event: MessagingInboundEvent) => MessagingGatewayInboundDispatchResult;
}): Promise<SignalUnreadWindowCoreResult> {
  try {
    const now = input.now ?? (() => new Date());
    const env = input.env ?? process.env;
    const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
    if (!input.preview.endpointPath) throw new Error("Signal unread-window endpoint is unavailable.");
    const baseUrl = normalizeBaseUrl(env.AMBIENT_SIGNAL_BRIDGE_URL?.trim()
      || env.AMBIENT_AGENT_SIGNAL_BRIDGE_URL?.trim()
      || `http://127.0.0.1:${env.AMBIENT_SIGNAL_BRIDGE_PORT?.trim() || env.AMBIENT_AGENT_SIGNAL_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT}`);
    const body = await fetchBridgeJson(`${baseUrl}${input.preview.endpointPath}`, fetchFn);
    const summary = validateSignalBridgeUnreadWindowDispatchEnvelope(
      body,
      input.preview.profileId ?? input.binding.authProfileId,
      input.preview.conversationId ?? input.binding.conversationId,
    );
    const state = readUnreadWindowState(input.statePath);
    const bindingState = state.bindings[input.binding.id] ?? { seenMessageIds: [] };
    const seen = new Set([...bindingState.seenMessageIds, ...bindingInitialSeenMessageIds(input.binding)]);
    const dispatches: SignalUnreadWindowDispatchSummary[] = [];
    const newlySeen: string[] = [];
    let candidateMessageCount = 0;
    let duplicateMessageCount = 0;
    let skippedMessageCount = 0;

    for (const message of summary.messages) {
      if (seen.has(message.messageId)) {
        duplicateMessageCount += 1;
        dispatches.push({ messageId: message.messageId, accepted: false, droppedReason: "duplicate" });
        continue;
      }
      newlySeen.push(message.messageId);
      if (message.outgoing) {
        skippedMessageCount += 1;
        dispatches.push({ messageId: message.messageId, accepted: false, droppedReason: "outgoing" });
        continue;
      }
      if (!message.text.trim()) {
        skippedMessageCount += 1;
        dispatches.push({ messageId: message.messageId, accepted: false, droppedReason: "empty" });
        continue;
      }
      if (message.senderId !== input.binding.ownerUserId) {
        skippedMessageCount += 1;
        dispatches.push({ messageId: message.messageId, accepted: false, droppedReason: "wrong-sender" });
        continue;
      }
      candidateMessageCount += 1;
      const dispatch = input.dispatch(signalUnreadWindowEventFromMessage({
        binding: input.binding,
        messageId: message.messageId,
        senderId: message.senderId!,
        senderLabel: message.senderLabel,
        text: message.text,
        receivedAt: message.receivedAt ?? now().toISOString(),
      }));
      dispatches.push(sanitizeDispatch(message.messageId, dispatch));
    }

    const acceptedDispatchCount = dispatches.filter((dispatch) => dispatch.accepted).length;
    const droppedDispatchCount = dispatches.length - acceptedDispatchCount;
    const lastAcceptedMessageId = [...dispatches].reverse().find((dispatch) => dispatch.accepted)?.messageId;
    const nextBindingState: SignalUnreadWindowBindingState = {
      seenMessageIds: trimSeenIds([...bindingState.seenMessageIds, ...bindingInitialSeenMessageIds(input.binding), ...newlySeen]),
      lastPollAt: now().toISOString(),
      ...(lastAcceptedMessageId ? { lastAcceptedMessageId } : bindingState.lastAcceptedMessageId ? { lastAcceptedMessageId: bindingState.lastAcceptedMessageId } : {}),
    };
    state.bindings[input.binding.id] = nextBindingState;
    writeUnreadWindowState(input.statePath, state);

    return {
      applyStatus: "applied",
      approvalRecorded: input.approvalRecorded,
      polled: true,
      fetchedMessageCount: summary.fetchedMessageCount,
      candidateMessageCount,
      duplicateMessageCount,
      skippedMessageCount,
      acceptedDispatchCount,
      droppedDispatchCount,
      dispatches,
      seenMessageCount: nextBindingState.seenMessageIds.length,
      lastPollAt: nextBindingState.lastPollAt,
      ...(nextBindingState.lastAcceptedMessageId ? { lastAcceptedMessageId: nextBindingState.lastAcceptedMessageId } : {}),
      policyNotes: [...input.preview.policyNotes, ...summary.diagnostics],
    };
  } catch (error) {
    return {
      applyStatus: "failed",
      approvalRecorded: input.approvalRecorded,
      polled: false,
      fetchedMessageCount: 0,
      candidateMessageCount: 0,
      duplicateMessageCount: 0,
      skippedMessageCount: 0,
      acceptedDispatchCount: 0,
      droppedDispatchCount: 0,
      dispatches: [],
      failureHint: "Signal unread single-read failed closed before returning provider message bodies to Pi.",
      error: errorMessage(error),
      policyNotes: input.preview.policyNotes,
    };
  }
}

export async function applySignalUnreadWindow(input: {
  preview: SignalUnreadWindowPreview;
  bindings: MessagingBindingListResult;
  stateRoot: string;
  approvalRecorded: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
  now?: () => Date;
  dispatch: (event: MessagingInboundEvent) => MessagingGatewayInboundDispatchResult;
}): Promise<SignalUnreadWindowApplyResult> {
  const statePath = signalUnreadWindowStatePath(input.stateRoot);
  if (!input.preview.canApplyNow) return signalUnreadWindowBlockedResult(input.preview, false, statePath);
  if (!input.approvalRecorded) return signalUnreadWindowDeniedResult(input.preview, statePath);
  const binding = input.bindings.bindings.find((candidate) => candidate.id === input.preview.bindingId);
  if (!binding) {
    return signalUnreadWindowFailedResult(input.preview, statePath, "Active Signal Remote Ambient Surface binding disappeared before apply.");
  }
  if (binding.status !== "active" || binding.providerId !== SIGNAL_PROVIDER_ID || binding.purpose !== "remote_ambient_surface") {
    return signalUnreadWindowFailedResult(input.preview, statePath, "Binding no longer matches the active Signal Remote Ambient Surface scope.");
  }
  if (!binding.ownerUserId?.trim()) {
    return signalUnreadWindowFailedResult(input.preview, statePath, "Binding no longer has an owner sender id.");
  }
  if (binding.authProfileId !== input.preview.profileId || binding.conversationId !== input.preview.conversationId) {
    return signalUnreadWindowFailedResult(input.preview, statePath, "Binding profile/conversation no longer matches the preview scope.");
  }
  try {
    const now = input.now ?? (() => new Date());
    const env = input.env ?? process.env;
    const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
    if (!input.preview.endpointPath) throw new Error("Signal unread-window endpoint is unavailable.");
    const baseUrl = normalizeBaseUrl(env.AMBIENT_SIGNAL_BRIDGE_URL?.trim()
      || env.AMBIENT_AGENT_SIGNAL_BRIDGE_URL?.trim()
      || `http://127.0.0.1:${env.AMBIENT_SIGNAL_BRIDGE_PORT?.trim() || env.AMBIENT_AGENT_SIGNAL_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT}`);
    const body = await fetchBridgeJson(`${baseUrl}${input.preview.endpointPath}`, fetchFn);
    const summary = validateSignalBridgeUnreadWindowDispatchEnvelope(
      body,
      input.preview.profileId ?? binding.authProfileId,
      input.preview.conversationId ?? binding.conversationId,
    );
    const state = readUnreadWindowState(statePath);
    const bindingState = state.bindings[binding.id] ?? { seenMessageIds: [] };
    const seen = new Set([...bindingState.seenMessageIds, ...bindingInitialSeenMessageIds(binding)]);
    const dispatches: SignalUnreadWindowDispatchSummary[] = [];
    const newlySeen: string[] = [];
    let candidateMessageCount = 0;
    let duplicateMessageCount = 0;
    let skippedMessageCount = 0;

    for (const message of summary.messages) {
      if (seen.has(message.messageId)) {
        duplicateMessageCount += 1;
        dispatches.push({ messageId: message.messageId, accepted: false, droppedReason: "duplicate" });
        continue;
      }
      newlySeen.push(message.messageId);
      if (message.outgoing) {
        skippedMessageCount += 1;
        dispatches.push({ messageId: message.messageId, accepted: false, droppedReason: "outgoing" });
        continue;
      }
      if (!message.text.trim()) {
        skippedMessageCount += 1;
        dispatches.push({ messageId: message.messageId, accepted: false, droppedReason: "empty" });
        continue;
      }
      if (message.senderId !== binding.ownerUserId) {
        skippedMessageCount += 1;
        dispatches.push({ messageId: message.messageId, accepted: false, droppedReason: "wrong-sender" });
        continue;
      }
      candidateMessageCount += 1;
      const dispatch = input.dispatch(signalUnreadWindowEventFromMessage({
        binding,
        messageId: message.messageId,
        senderId: message.senderId,
        senderLabel: message.senderLabel,
        text: message.text,
        receivedAt: message.receivedAt ?? now().toISOString(),
      }));
      dispatches.push(sanitizeDispatch(message.messageId, dispatch));
    }

    const acceptedDispatchCount = dispatches.filter((dispatch) => dispatch.accepted).length;
    const droppedDispatchCount = dispatches.length - acceptedDispatchCount;
    const lastAcceptedMessageId = [...dispatches].reverse().find((dispatch) => dispatch.accepted)?.messageId;
    const nextBindingState: SignalUnreadWindowBindingState = {
      seenMessageIds: trimSeenIds([...bindingState.seenMessageIds, ...bindingInitialSeenMessageIds(binding), ...newlySeen]),
      lastPollAt: now().toISOString(),
      ...(lastAcceptedMessageId ? { lastAcceptedMessageId } : bindingState.lastAcceptedMessageId ? { lastAcceptedMessageId: bindingState.lastAcceptedMessageId } : {}),
    };
    state.bindings[binding.id] = nextBindingState;
    writeUnreadWindowState(statePath, state);

    return {
      ...input.preview,
      applyStatus: "applied",
      approvalRequested: true,
      approvalRecorded: true,
      polled: true,
      statePath,
      fetchedMessageCount: summary.fetchedMessageCount,
      candidateMessageCount,
      duplicateMessageCount,
      skippedMessageCount,
      acceptedDispatchCount,
      droppedDispatchCount,
      dispatches,
      seenMessageCount: nextBindingState.seenMessageIds.length,
      lastPollAt: nextBindingState.lastPollAt,
      ...(nextBindingState.lastAcceptedMessageId ? { lastAcceptedMessageId: nextBindingState.lastAcceptedMessageId } : {}),
      policyNotes: [...input.preview.policyNotes, ...summary.diagnostics],
    };
  } catch (error) {
    return signalUnreadWindowFailedResult(input.preview, statePath, errorMessage(error));
  }
}

export function buildSignalUnreadWindowStatus(input: {
  toolInput: SignalUnreadWindowStatusInput;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  stateRoot: string;
  env?: Record<string, string | undefined>;
}): SignalUnreadWindowStatus {
  const env = input.env ?? process.env;
  const statePath = signalUnreadWindowStatePath(input.stateRoot);
  const runtimeProvider = input.runtimeStatus?.providers.find((provider) => provider.providerId === SIGNAL_PROVIDER_ID);
  const fakeBridgeApplyEnabled = env[FAKE_BRIDGE_APPLY_FLAG] === "1";
  let state: SignalUnreadWindowState = { version: 1, bindings: {} };
  let stateReadable = true;
  let stateError: string | undefined;
  try {
    state = readUnreadWindowState(statePath);
  } catch (error) {
    stateReadable = false;
    stateError = errorMessage(error);
  }

  const activeSignalBindings = activeOwnerSignalBindings(input.bindings.bindings);
  const candidateBindings = input.bindings.bindings
    .filter((binding) => binding.providerId === SIGNAL_PROVIDER_ID)
    .filter((binding) => binding.purpose === "remote_ambient_surface")
    .filter((binding) => input.toolInput.includeInactive ? true : binding.status === "active")
    .filter((binding) => input.toolInput.bindingId ? binding.id === input.toolInput.bindingId : true)
    .filter((binding) => input.toolInput.profileId ? binding.authProfileId === input.toolInput.profileId : true)
    .filter((binding) => input.toolInput.conversationId ? binding.conversationId === input.toolInput.conversationId : true);
  const selectedBindingIds = new Set(candidateBindings.map((binding) => binding.id));
  const queuedSignalProjections = (input.runtimeStatus?.queuedProjections ?? [])
    .filter((projection) => projection.providerId === SIGNAL_PROVIDER_ID)
    .filter((projection) => projection.purpose === "remote_ambient_surface")
    .filter((projection) => selectedBindingIds.size ? selectedBindingIds.has(projection.bindingId ?? "") : true);
  const queuedByBinding = new Map<string, SignalUnreadWindowQueuedProjectionSummary[]>();
  for (const projection of queuedSignalProjections) {
    const key = projection.bindingId ?? "";
    const items = queuedByBinding.get(key) ?? [];
    items.push({
      queuedProjectionId: projection.id,
      ...(projection.bindingId ? { bindingId: projection.bindingId } : {}),
      conversationId: projection.conversationId,
      sourceEventId: projection.sourceEventId,
      projectionKind: projection.projection.kind,
      projectionTitle: projection.projection.title,
      queuedAt: projection.queuedAt,
    });
    queuedByBinding.set(key, items);
  }

  const bindingStatuses = candidateBindings.map((binding) => {
    const bindingState = state.bindings[binding.id];
    const queuedProjections = queuedByBinding.get(binding.id) ?? [];
    return {
      bindingId: binding.id,
      bindingStatus: binding.status,
      profileId: binding.authProfileId,
      conversationId: binding.conversationId,
      ownerUserIdPresent: Boolean(binding.ownerUserId?.trim()),
      ...(binding.ambientSurface ? { ambientSurface: binding.ambientSurface } : {}),
      initialSeenMessageCount: bindingInitialSeenMessageIds(binding).length,
      dedupeSeenMessageCount: bindingState?.seenMessageIds.length ?? 0,
      ...(bindingState?.lastPollAt ? { lastPollAt: bindingState.lastPollAt } : {}),
      ...(bindingState?.lastAcceptedMessageId ? { lastAcceptedMessageId: bindingState.lastAcceptedMessageId } : {}),
      queuedProjectionCount: queuedProjections.length,
      queuedProjections: queuedProjections.slice(-5),
    };
  });

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!stateReadable) blockers.push("Signal unread-window dedupe state could not be read.");
  if (!candidateBindings.length) blockers.push("No Signal Remote Ambient Surface binding matches the requested status scope.");
  if (!runtimeProvider) warnings.push("Signal runtime provider is not present in the current gateway runner status.");
  if (!fakeBridgeApplyEnabled) {
    warnings.push(`Fake-bridge apply is disabled in this runtime; apply remains blocked unless ${FAKE_BRIDGE_APPLY_FLAG}=1 is set.`);
  }
  warnings.push("Real Signal unread ingestion is still intentionally disabled; only the reviewed fake-bridge dogfood apply path can read bounded unread messages.");
  if (!queuedSignalProjections.length) warnings.push("No queued Signal Remote Ambient Surface projections currently exist for the selected binding scope.");
  const selectedBinding = candidateBindings.length === 1 ? candidateBindings[0] : undefined;
  const realBridgeUnreadReadiness = buildSignalRealUnreadReadiness({
    profileId: input.toolInput.profileId ?? selectedBinding?.authProfileId,
    conversationId: input.toolInput.conversationId ?? selectedBinding?.conversationId,
    limit: 10,
    binding: selectedBinding,
    runtimeProvider,
    fakeApplyReady: fakeBridgeApplyEnabled
      && Boolean(selectedBinding)
      && runtimeProvider?.readiness?.bridgeReachable === true
      && runtimeProvider.readiness.bridgeCapabilities?.profileStatus === true
      && runtimeProvider.readiness.bridgeCapabilities.boundedUnreadWindow === true
      && runtimeProvider.readiness.configured === true,
  });

  return {
    providerId: SIGNAL_PROVIDER_ID,
    status: blockers.length ? "blocked" : "ready",
    statePath,
    stateReadable,
    ...(stateError ? { stateError } : {}),
    fakeBridgeApplyEnabled,
    realBridgeUnreadEnabled: false,
    realBridgeUnreadReadiness,
    bridgeModeLabel: fakeBridgeApplyEnabled
      ? "reviewed fake Signal bridge apply path enabled; real Signal bridge unread ingestion disabled"
      : "fake Signal bridge apply path disabled; real Signal bridge unread ingestion disabled",
    ...(runtimeProvider ? { runtimeProvider } : {}),
    selectedBindingCount: candidateBindings.length,
    activeSignalRemoteSurfaceBindingCount: activeSignalBindings.length,
    dedupeBindingCount: Object.keys(state.bindings).length,
    queuedSignalProjectionCount: queuedSignalProjections.length,
    bindings: bindingStatuses,
    blockers,
    warnings: [...warnings, ...realBridgeUnreadReadiness.warnings],
    nextSteps: [
      "Use this read-only status after each fake-bridge apply to verify duplicate/drop counts and queued projection ids before enabling any polling loop.",
      "Repeated apply should show previously-seen provider message ids as duplicates and should not create another queued projection for the same message id.",
      "Use ambient_messaging_gateway_status to inspect provider-neutral runtime state; use this Signal status when dedupe state, fake-vs-real readiness, or Signal projection scope matters.",
      "Do not use shell, browser, Signal Desktop UI, provider CLIs, generic binding tools, or Telegram-specific tools as a workaround for blocked real Signal ingestion.",
    ],
    safety: {
      readsProviderUnreadMessages: false,
      returnsProviderMessageBodiesToPi: false,
      startsBridge: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
    },
  };
}

export function signalUnreadWindowBlockedResult(
  preview: SignalUnreadWindowPreview,
  approvalRecorded = false,
  statePath?: string,
): SignalUnreadWindowApplyResult {
  return {
    ...preview,
    applyStatus: "blocked",
    approvalRequested: false,
    approvalRecorded,
    polled: false,
    ...(statePath ? { statePath } : {}),
    fetchedMessageCount: 0,
    candidateMessageCount: 0,
    duplicateMessageCount: 0,
    skippedMessageCount: 0,
    acceptedDispatchCount: 0,
    droppedDispatchCount: 0,
    dispatches: [],
    failureHint: preview.blockers.join("; ") || "Signal unread-window apply is blocked.",
  };
}

export function signalUnreadWindowDeniedResult(
  preview: SignalUnreadWindowPreview,
  statePath?: string,
): SignalUnreadWindowApplyResult {
  return {
    ...signalUnreadWindowBlockedResult(preview, false, statePath),
    applyStatus: "denied",
    approvalRequested: true,
    failureHint: "The user denied the bounded Signal unread-window read. No Signal unread messages were read.",
  };
}

export function signalUnreadWindowResultText(result: SignalUnreadWindowApplyResult): string {
  const lines = [
    "Signal bounded unread-window apply",
    `Apply status: ${result.applyStatus}`,
    `Approval requested: ${result.approvalRequested ? "yes" : "no"}`,
    `Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `Polled: ${result.polled ? "yes" : "no"}`,
    result.statePath ? `Dedupe state path: ${result.statePath}` : undefined,
    result.failureHint ? `Failure hint: ${result.failureHint}` : undefined,
    result.error ? `Error: ${result.error}` : undefined,
    typeof result.seenMessageCount === "number" ? `Seen message ids for binding: ${result.seenMessageCount}` : undefined,
    result.lastPollAt ? `Last poll: ${result.lastPollAt}` : undefined,
    result.lastAcceptedMessageId ? `Last accepted message: ${result.lastAcceptedMessageId}` : undefined,
    "",
    "Counts:",
    `- Fetched messages: ${result.fetchedMessageCount}`,
    `- Candidate owner messages: ${result.candidateMessageCount}`,
    `- Duplicate messages: ${result.duplicateMessageCount}`,
    `- Skipped messages: ${result.skippedMessageCount}`,
    `- Accepted dispatches: ${result.acceptedDispatchCount}`,
    `- Dropped dispatches: ${result.droppedDispatchCount}`,
  ].filter((line): line is string => line !== undefined);
  if (result.dispatches.length) {
    lines.push("", "Dispatches:");
    for (const dispatch of result.dispatches.slice(0, 10)) {
      lines.push(`- Message: ${dispatch.messageId}`);
      lines.push(`  Accepted: ${dispatch.accepted ? "yes" : "no"}`);
      if (dispatch.queuedProjectionId) lines.push(`  Queued projection: ${dispatch.queuedProjectionId}`);
      if (dispatch.projectionKind) lines.push(`  Projection kind: ${dispatch.projectionKind}`);
      if (dispatch.projectionTitle) lines.push(`  Projection title: ${dispatch.projectionTitle}`);
      if (dispatch.droppedReason) lines.push(`  Dropped reason: ${dispatch.droppedReason}`);
    }
    if (result.dispatches.length > 10) {
      lines.push(`- ${result.dispatches.length - 10} additional dispatches omitted from preview.`);
    }
  }
  lines.push(
    "",
    "Safety:",
    `- Reads provider unread messages: ${result.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Returns provider message bodies to Pi: ${result.safety.returnsProviderMessageBodiesToPi ? "yes" : "no"}`,
    `- Routes Remote Ambient Surface: ${result.safety.routesRemoteAmbientSurface ? "yes" : "no"}`,
    `- Writes dedupe state: ${result.safety.writesDedupeState ? "yes" : "no"}`,
    `- Starts bridge: ${result.safety.startsBridge ? "yes" : "no"}`,
    `- Sends provider messages: ${result.safety.sendsProviderMessages ? "yes" : "no"}`,
  );
  lines.push("", signalUnreadWindowPreviewText(result));
  return lines.join("\n");
}

export function signalUnreadWindowStatusText(result: SignalUnreadWindowStatus): string {
  const lines = [
    "Signal unread-window status",
    `Provider: ${result.providerId}`,
    `Status: ${result.status}`,
    `Bridge mode: ${result.bridgeModeLabel}`,
    `Fake bridge apply enabled: ${result.fakeBridgeApplyEnabled ? "yes" : "no"}`,
    `Real Signal unread ingestion enabled: ${result.realBridgeUnreadEnabled ? "yes" : "no"}`,
    `Dedupe state path: ${result.statePath}`,
    `Dedupe state readable: ${result.stateReadable ? "yes" : "no"}`,
    result.stateError ? `Dedupe state error: ${result.stateError}` : undefined,
    result.runtimeProvider ? `Runtime state: ${result.runtimeProvider.state}/${result.runtimeProvider.mode}` : "Runtime state: unavailable",
    `Active Signal Remote Ambient Surface bindings: ${result.activeSignalRemoteSurfaceBindingCount}`,
    `Selected bindings: ${result.selectedBindingCount}`,
    `Dedupe binding records: ${result.dedupeBindingCount}`,
    `Queued Signal projections: ${result.queuedSignalProjectionCount}`,
    "",
    "Real Signal unread readiness:",
    `- Status: ${result.realBridgeUnreadReadiness.status}`,
    `- Contract ready: ${result.realBridgeUnreadReadiness.contractReady ? "yes" : "no"}`,
    `- Ready for approved single read: ${result.realBridgeUnreadReadiness.singleReadReady ? "yes" : "no"}`,
    `- Apply implemented: ${result.realBridgeUnreadReadiness.applyImplemented ? "yes" : "no"}`,
    `- Contract: ${result.realBridgeUnreadReadiness.contract.kind}`,
    result.realBridgeUnreadReadiness.contract.endpointPath ? `- Endpoint: ${result.realBridgeUnreadReadiness.contract.endpointPath}` : undefined,
    ...result.realBridgeUnreadReadiness.blockers.map((blocker) => `- Blocker: ${blocker}`),
    "",
    "Selected binding state:",
  ].filter((line): line is string => line !== undefined);
  if (!result.bindings.length) {
    lines.push("- None");
  }
  for (const binding of result.bindings.slice(0, 10)) {
    lines.push(`- Binding ${binding.bindingId}`);
    lines.push(`  Status: ${binding.bindingStatus}`);
    lines.push(`  Profile: ${binding.profileId}`);
    lines.push(`  Conversation: ${binding.conversationId}`);
    lines.push(`  Owner id present: ${binding.ownerUserIdPresent ? "yes" : "no"}`);
    if (binding.ambientSurface) lines.push(`  Surface: ${binding.ambientSurface}`);
    lines.push(`  Initial seen message ids: ${binding.initialSeenMessageCount}`);
    lines.push(`  Dedupe seen message ids: ${binding.dedupeSeenMessageCount}`);
    if (binding.lastPollAt) lines.push(`  Last poll: ${binding.lastPollAt}`);
    if (binding.lastAcceptedMessageId) lines.push(`  Last accepted message: ${binding.lastAcceptedMessageId}`);
    lines.push(`  Queued projections: ${binding.queuedProjectionCount}`);
    for (const projection of binding.queuedProjections) {
      lines.push(`    - ${projection.queuedProjectionId}: ${projection.projectionTitle} (${projection.projectionKind})`);
      lines.push(`      Source event: ${projection.sourceEventId}`);
    }
  }
  if (result.bindings.length > 10) lines.push(`- ${result.bindings.length - 10} additional binding states omitted from preview.`);
  lines.push(
    "",
    "Blockers:",
    ...(result.blockers.length ? result.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Warnings:",
    ...(result.warnings.length ? result.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "Safety:",
    `- Reads provider unread messages: ${result.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Returns provider message bodies to Pi: ${result.safety.returnsProviderMessageBodiesToPi ? "yes" : "no"}`,
    `- Starts bridge: ${result.safety.startsBridge ? "yes" : "no"}`,
    `- Sends provider messages: ${result.safety.sendsProviderMessages ? "yes" : "no"}`,
    `- Mutates bindings: ${result.safety.mutatesBindings ? "yes" : "no"}`,
    "",
    "Next steps:",
    ...result.nextSteps.map((step) => `- ${step}`),
  );
  return lines.join("\n");
}

export function signalUnreadWindowApprovalDetail(preview: SignalUnreadWindowPreview): string {
  return [
    `Provider: ${preview.providerId}`,
    `Binding: ${preview.bindingId ?? "missing"}`,
    `Profile: ${preview.profileId ?? "missing"}`,
    `Conversation: ${preview.conversationId ?? "missing"}`,
    `Limit: ${preview.limit}`,
    `Endpoint: ${preview.endpointPath ?? "unavailable"}`,
    `Fake bridge apply enabled: ${preview.fakeBridgeApplyEnabled ? "yes" : "no"}`,
    `Would read unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `Would route Remote Ambient Surface: ${preview.safety.routesRemoteAmbientSurface ? "yes" : "no"}`,
    `Would write dedupe state: ${preview.safety.writesDedupeState ? "yes" : "no"}`,
    `Would return provider message bodies to Pi: ${preview.safety.returnsProviderMessageBodiesToPi ? "yes" : "no"}`,
    `Would send Signal messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    ...preview.policyNotes,
  ].join("\n");
}

function buildSignalRealUnreadReadiness(input: {
  profileId?: string;
  conversationId?: string;
  limit: number;
  binding?: MessagingBindingDescriptor;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  fakeApplyReady: boolean;
  applyImplemented?: boolean;
}): SignalRealUnreadReadiness {
  const contract = signalBridgeRealUnreadWindowContract({
    profileId: input.profileId,
    conversationId: input.conversationId,
    limit: input.limit,
  });
  const blockers: string[] = [];
  const readiness = input.runtimeProvider?.readiness;

  if (!input.profileId) blockers.push("Real Signal unread single-read requires an exact profileId from the active binding.");
  if (!input.conversationId) blockers.push("Real Signal unread single-read requires an exact conversationId from the active binding.");
  if (!input.binding) {
    blockers.push("Real Signal unread single-read requires one exact active Signal Remote Ambient Surface binding.");
  } else {
    if (input.binding.providerId !== SIGNAL_PROVIDER_ID) blockers.push("Selected binding is not a Signal binding.");
    if (input.binding.purpose !== "remote_ambient_surface") blockers.push("Selected binding is not a Remote Ambient Surface binding.");
    if (input.binding.status !== "active") blockers.push("Selected binding is not active.");
    if (!input.binding.ownerUserId?.trim()) blockers.push("Selected binding does not have an authenticated ownerUserId.");
    if (input.profileId && input.binding.authProfileId !== input.profileId) blockers.push("Selected binding profile does not match the requested profileId.");
    if (input.conversationId && input.binding.conversationId !== input.conversationId) blockers.push("Selected binding conversation does not match the requested conversationId.");
    const metadata = input.binding.metadata ?? {};
    if (metadata.setupShape !== "signal-owner-remote-ambient-surface") {
      blockers.push("Selected binding was not created by the typed Signal owner Remote Ambient Surface flow.");
    }
  }

  if (!input.runtimeProvider) {
    blockers.push("Signal runtime provider is not present in the gateway status.");
  }
  if (!readiness) {
    blockers.push("Signal readiness has not been refreshed.");
  } else {
    if (!readiness.bridgeReachable) blockers.push("Real Signal unread single-read requires a reachable reviewed Signal bridge root.");
    if (!readiness.bridgeCapabilities?.profileStatus) blockers.push("Real Signal unread single-read requires bridge capability profileStatus.");
    if (!readiness.bridgeCapabilities?.boundedUnreadWindow) blockers.push("Real Signal unread single-read requires bridge capability boundedUnreadWindow.");
    if (!readiness.configured) blockers.push("Real Signal unread single-read requires a reviewed bridge-readable Signal profile.");
    const session = input.profileId
      ? readiness.sessions.find((candidate) => candidate.profileId === input.profileId)
      : undefined;
    if (input.profileId && !session) blockers.push("Signal readiness did not include the requested profile.");
    if (session && session.bridgeSessionReadable !== true) blockers.push("Requested Signal profile is not bridge-readable.");
  }

  const singleReadReady = blockers.length === 0;
  const applyImplemented = input.applyImplemented === true;
  return {
    status: input.fakeApplyReady && singleReadReady
      ? "fake-ready"
      : singleReadReady
      ? "real-ready-for-approved-single-read"
      : "real-contract-present-but-blocked",
    contractReady: singleReadReady,
    singleReadReady,
    applyImplemented,
    contract,
    blockers: [
      ...blockers,
      ...(!applyImplemented ? ["Real Signal unread apply is not implemented in this build; current apply remains fake-bridge dogfood only."] : []),
    ],
    warnings: [
      "Do not treat fake-bridge readiness, Signal Desktop presence, or generic lifecycle state as permission to perform real Signal ingestion.",
      ...(applyImplemented
        ? ["Real Signal unread single-read is approval-gated and bounded; it never sends replies. Use separate typed polling/reply tools for those paths."]
        : ["Real Signal unread ingestion remains disabled until a reviewed approval-gated single-read adapter is implemented."]),
    ],
  };
}

function endpointPathFor(profileId: string, conversationId: string, limit: number): string {
  return signalBridgeEndpointPaths(profileId, conversationId).unreadWindow.replace(":limit", String(limit));
}

function activeOwnerSignalBindings(bindings: MessagingBindingDescriptor[]): MessagingBindingDescriptor[] {
  return bindings.filter((binding) =>
    binding.providerId === SIGNAL_PROVIDER_ID &&
    binding.purpose === "remote_ambient_surface" &&
    binding.status === "active" &&
    Boolean(binding.ownerUserId?.trim())
  );
}

function signalUnreadWindowEventFromMessage(input: {
  binding: MessagingBindingDescriptor;
  messageId: string;
  senderId: string;
  senderLabel?: string;
  text: string;
  receivedAt: string;
}): MessagingInboundEvent {
  return {
    id: `signal-${input.binding.authProfileId}-${input.binding.conversationId}-${input.messageId}`,
    providerId: SIGNAL_PROVIDER_ID,
    authProfileId: input.binding.authProfileId,
    conversationId: input.binding.conversationId,
    ...(input.binding.threadId ? { threadId: input.binding.threadId } : {}),
    sender: {
      id: input.senderId,
      ...(input.senderLabel ? { label: input.senderLabel } : {}),
    },
    text: input.text,
    receivedAt: input.receivedAt,
  };
}

function sanitizeDispatch(
  messageId: string,
  dispatch: MessagingGatewayInboundDispatchResult,
): SignalUnreadWindowDispatchSummary {
  return {
    messageId,
    accepted: dispatch.accepted,
    ...(dispatch.queuedProjection?.id ? { queuedProjectionId: dispatch.queuedProjection.id } : {}),
    ...(dispatch.projection?.kind ? { projectionKind: dispatch.projection.kind } : {}),
    ...(dispatch.projection?.title ? { projectionTitle: dispatch.projection.title } : {}),
    ...(dispatch.droppedReason ? { droppedReason: dispatch.droppedReason } : {}),
  };
}

function bindingInitialSeenMessageIds(binding: MessagingBindingDescriptor): string[] {
  const metadata = binding.metadata ?? {};
  const ids = [
    stringValue(metadata.ownerHandoffSourceMessageId),
    ...(Array.isArray(metadata.initialSeenMessageIds) ? metadata.initialSeenMessageIds.map(stringValue) : []),
  ].filter(Boolean);
  return [...new Set(ids)];
}

async function fetchBridgeJson(url: string, fetchFn: FetchLike): Promise<unknown> {
  const response = await fetchFn(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Signal bridge request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  }
  return await response.json();
}

function signalUnreadWindowStatePath(stateRoot: string): string {
  return join(stateRoot, "messaging-gateway", "signal-unread-window-state.json");
}

function readUnreadWindowState(statePath: string): SignalUnreadWindowState {
  if (!existsSync(statePath)) return { version: 1, bindings: {} };
  const raw = JSON.parse(readFileSync(statePath, "utf8")) as SignalUnreadWindowState;
  if (raw.version !== 1 || typeof raw.bindings !== "object" || !raw.bindings) {
    throw new Error(`Unsupported Signal unread-window state in ${statePath}`);
  }
  return raw;
}

function writeUnreadWindowState(statePath: string, state: SignalUnreadWindowState): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function trimSeenIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].slice(-MAX_SEEN_IDS);
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

function signalUnreadWindowFailedResult(
  preview: SignalUnreadWindowPreview,
  statePath: string,
  error: string,
): SignalUnreadWindowApplyResult {
  return {
    ...preview,
    applyStatus: "failed",
    approvalRequested: true,
    approvalRecorded: true,
    polled: false,
    statePath,
    fetchedMessageCount: 0,
    candidateMessageCount: 0,
    duplicateMessageCount: 0,
    skippedMessageCount: 0,
    acceptedDispatchCount: 0,
    droppedDispatchCount: 0,
    dispatches: [],
    failureHint: "Signal unread-window apply failed before routing any provider message bodies to Pi.",
    error,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function bindingSummary(binding: MessagingBindingDescriptor): SignalUnreadWindowBindingSummary {
  return {
    bindingId: binding.id,
    authProfileId: binding.authProfileId,
    conversationId: binding.conversationId,
    ownerUserId: binding.ownerUserId ?? "",
    ...(binding.ambientSurface ? { ambientSurface: binding.ambientSurface } : {}),
    ...(binding.maxDisclosureLabel ? { maxDisclosureLabel: binding.maxDisclosureLabel } : {}),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
