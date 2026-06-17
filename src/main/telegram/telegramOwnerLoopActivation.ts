import type {
  MessagingAmbientSurface,
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
  MessagingRemoteSurfaceActivationCard,
  MessagingRemoteSurfaceActivationCardPhase,
} from "../../shared/messagingGateway";
import type { TelegramBridgePollingRuntimeStatus } from "./telegramBridgePolling";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";
const DEFAULT_DISCLOSURE_LABEL = "owner-private-runtime-summary";
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_LIMIT = 10;

export type TelegramOwnerLoopActivationStatus =
  | "active"
  | "ready_to_start_polling"
  | "needs_setup"
  | "blocked";

export type TelegramOwnerLoopActivationPhaseStatus =
  | "complete"
  | "ready"
  | "waiting"
  | "blocked"
  | "optional";

export interface TelegramOwnerLoopActivationInput {
  profileId?: string;
  conversationId?: string;
  setupCode?: string;
  ownerUserId?: string;
  ownerHandoffSourceMessageId?: string;
  bindingId?: string;
  ambientSurface?: MessagingAmbientSurface;
  maxDisclosureLabel: string;
  minReceivedAt?: string;
  intervalMs: number;
  limit: number;
}

export interface TelegramOwnerLoopActivationPhase {
  id: string;
  title: string;
  status: TelegramOwnerLoopActivationPhaseStatus;
  toolSequence: string[];
  approvalRequired: boolean;
  userAction?: string;
  blockers: string[];
  carriesForward: string[];
  notes: string[];
}

export interface TelegramOwnerLoopActivationPlan {
  providerId: "telegram-tdlib";
  status: TelegramOwnerLoopActivationStatus;
  selectedProfileId?: string;
  selectedConversationId?: string;
  selectedBinding?: TelegramOwnerLoopActivationBindingSummary;
  knownProfiles: TelegramOwnerLoopActivationProfileSummary[];
  activeOwnerBindings: TelegramOwnerLoopActivationBindingSummary[];
  polling: {
    state: TelegramBridgePollingRuntimeStatus["state"];
    running: boolean;
    bindingId?: string;
    profileId?: string;
    intervalMs: number;
    minReceivedAt?: string;
    totalPollCount: number;
    failedPollCount: number;
    acceptedDispatchCount: number;
    droppedDispatchCount: number;
    lastError?: string;
  };
  providerState: {
    runtimeState: string;
    mode: string;
    readinessStatus: string;
    configured: boolean;
    bridgeReachable: boolean;
    apiCredentialsPresent: boolean;
    persistedSessionCount: number;
  };
  recommendedNextTool?: string;
  phases: TelegramOwnerLoopActivationPhase[];
  safety: {
    startsBridge: false;
    listsProviderChats: false;
    readsProviderMessages: false;
    readsProviderHistory: false;
    mutatesBindings: false;
    startsPolling: false;
    sendsProviderMessages: false;
  };
  policyNotes: string[];
}

export interface TelegramOwnerLoopActivationProfileSummary {
  profileId: string;
  metadataReadable: boolean;
  tdlibStateDirPresent: boolean;
  databaseEncryptionKeyPresent: boolean;
}

export interface TelegramOwnerLoopActivationBindingSummary {
  bindingId: string;
  authProfileId: string;
  conversationId: string;
  ambientSurface?: MessagingAmbientSurface;
  maxDisclosureLabel?: string;
}

export function telegramOwnerLoopActivationInput(params: unknown): TelegramOwnerLoopActivationInput {
  const raw = params as Record<string, unknown> | undefined;
  const intervalMs = typeof raw?.intervalMs === "number" && Number.isFinite(raw.intervalMs)
    ? Math.floor(raw.intervalMs)
    : DEFAULT_POLL_INTERVAL_MS;
  const limit = typeof raw?.limit === "number" && Number.isFinite(raw.limit)
    ? Math.floor(raw.limit)
    : DEFAULT_LIMIT;
  const ambientSurface = optionalString(raw?.ambientSurface);
  if (ambientSurface && !isMessagingAmbientSurface(ambientSurface)) {
    throw new Error("ambientSurface must be chat, projects, workflow_agents, settings, or notifications.");
  }
  return {
    profileId: optionalString(raw?.profileId),
    conversationId: optionalString(raw?.conversationId),
    setupCode: optionalString(raw?.setupCode),
    ownerUserId: optionalString(raw?.ownerUserId),
    ownerHandoffSourceMessageId: optionalString(raw?.ownerHandoffSourceMessageId),
    bindingId: optionalString(raw?.bindingId),
    ambientSurface: ambientSurface as MessagingAmbientSurface | undefined,
    maxDisclosureLabel: optionalString(raw?.maxDisclosureLabel) ?? DEFAULT_DISCLOSURE_LABEL,
    minReceivedAt: optionalString(raw?.minReceivedAt),
    intervalMs: clamp(intervalMs, 5_000, 300_000),
    limit: clamp(limit, 1, 25),
  };
}

export function buildTelegramOwnerLoopActivationPlan(input: {
  toolInput: TelegramOwnerLoopActivationInput;
  runtimeStatus: MessagingGatewayRuntimeStatus;
  bindings: MessagingBindingListResult;
  pollingStatus: TelegramBridgePollingRuntimeStatus;
}): TelegramOwnerLoopActivationPlan {
  const runtimeProvider = input.runtimeStatus.providers.find((provider) => provider.providerId === TELEGRAM_PROVIDER_ID);
  const readiness = runtimeProvider?.readiness;
  const knownProfiles = (readiness?.sessions ?? []).map((session) => ({
    profileId: session.profileId,
    metadataReadable: session.metadataReadable,
    tdlibStateDirPresent: session.tdlibStateDirPresent,
    databaseEncryptionKeyPresent: session.databaseEncryptionKeyPresent,
  }));
  const activeOwnerBindings = input.bindings.bindings
    .filter((binding) => binding.providerId === TELEGRAM_PROVIDER_ID)
    .filter((binding) => binding.purpose === "remote_ambient_surface")
    .filter((binding) => binding.status === "active")
    .filter((binding) => binding.externalTrustClass === "owner")
    .map(bindingSummary);
  const selectedBinding = selectedBindingFor(input.toolInput, activeOwnerBindings);
  const selectedProfileId = input.toolInput.profileId
    ?? selectedBinding?.authProfileId
    ?? singleProfileId(knownProfiles);
  const selectedConversationId = input.toolInput.conversationId ?? selectedBinding?.conversationId;
  const providerBlockers = providerReadinessBlockers(runtimeProvider);
  const providerReady = providerBlockers.length === 0;
  const phases = [
    providerPhase(providerReady, providerBlockers),
    directoryPhase({ providerReady, selectedProfileId, selectedConversationId }),
    handoffPhase({ providerReady, input: input.toolInput, selectedProfileId, selectedConversationId, selectedBinding }),
    bindingPhase({ providerReady, input: input.toolInput, selectedProfileId, selectedConversationId, selectedBinding }),
    pollingPhase({ providerReady, selectedBinding, pollingStatus: input.pollingStatus, toolInput: input.toolInput }),
    commandRelayPhase(),
    cleanupPhase(),
  ];
  const recommendedNextTool = nextTool(phases);
  return {
    providerId: TELEGRAM_PROVIDER_ID,
    status: overallStatus({ providerReady, selectedBinding, pollingStatus: input.pollingStatus }),
    ...(selectedProfileId ? { selectedProfileId } : {}),
    ...(selectedConversationId ? { selectedConversationId } : {}),
    ...(selectedBinding ? { selectedBinding } : {}),
    knownProfiles,
    activeOwnerBindings,
    polling: {
      state: input.pollingStatus.state,
      running: input.pollingStatus.running,
      ...(input.pollingStatus.bindingId ? { bindingId: input.pollingStatus.bindingId } : {}),
      ...(input.pollingStatus.profileId ? { profileId: input.pollingStatus.profileId } : {}),
      intervalMs: input.pollingStatus.intervalMs,
      ...(input.pollingStatus.minReceivedAt ? { minReceivedAt: input.pollingStatus.minReceivedAt } : {}),
      totalPollCount: input.pollingStatus.totalPollCount,
      failedPollCount: input.pollingStatus.failedPollCount,
      acceptedDispatchCount: input.pollingStatus.acceptedDispatchCount,
      droppedDispatchCount: input.pollingStatus.droppedDispatchCount,
      ...(input.pollingStatus.lastError ? { lastError: input.pollingStatus.lastError } : {}),
    },
    providerState: {
      runtimeState: runtimeProvider?.state ?? "unavailable",
      mode: runtimeProvider?.mode ?? "none",
      readinessStatus: readiness?.status ?? "unavailable",
      configured: readiness?.configured === true,
      bridgeReachable: readiness?.bridgeReachable === true,
      apiCredentialsPresent: readiness?.apiCredentialsPresent === true,
      persistedSessionCount: readiness?.persistedSessionCount ?? 0,
    },
    ...(recommendedNextTool ? { recommendedNextTool } : {}),
    phases,
    safety: {
      startsBridge: false,
      listsProviderChats: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      mutatesBindings: false,
      startsPolling: false,
      sendsProviderMessages: false,
    },
    policyNotes: [
      "This plan is the Telegram owner Remote Ambient Surface path, not the external Messaging Connector path.",
      "Use typed preview tools first and apply tools only after explicit approval.",
      "Do not use shell, browser automation, Telegram Desktop UI, provider CLIs, arbitrary history reads, or chat scraping as fallbacks.",
      "Owner handoff and polling may read only bounded unread windows through reviewed tools; this plan tool itself reads no provider messages.",
      "When activating polling after setup or handoff, pass minReceivedAt from the activation/command boundary so old unread backlog is counted stale.",
      "Outbound Telegram replies remain separate: preview the exact relay text first, then apply only after approval.",
    ],
  };
}

export function telegramOwnerLoopActivationPlanText(plan: TelegramOwnerLoopActivationPlan): string {
  return [
    "Telegram owner-loop activation plan",
    `Status: ${plan.status}`,
    `Provider: ${plan.providerId}`,
    `Selected profile: ${plan.selectedProfileId ?? "none"}`,
    `Selected conversation: ${plan.selectedConversationId ?? "none"}`,
    `Active owner bindings: ${plan.activeOwnerBindings.length}`,
    plan.selectedBinding ? `Selected binding: ${plan.selectedBinding.bindingId}` : undefined,
    `Recommended next tool: ${plan.recommendedNextTool ?? "none"}`,
    "",
    "Provider state:",
    `- Runtime: ${plan.providerState.runtimeState}/${plan.providerState.mode}`,
    `- Readiness: ${plan.providerState.readinessStatus}`,
    `- Configured: ${plan.providerState.configured ? "yes" : "no"}`,
    `- Bridge reachable: ${plan.providerState.bridgeReachable ? "yes" : "no"}`,
    `- API credentials present: ${plan.providerState.apiCredentialsPresent ? "yes" : "no"}`,
    `- Persisted sessions: ${plan.providerState.persistedSessionCount}`,
    "",
    "Polling runner:",
    `- State: ${plan.polling.state}`,
    `- Running: ${plan.polling.running ? "yes" : "no"}`,
    plan.polling.bindingId ? `- Binding: ${plan.polling.bindingId}` : undefined,
    plan.polling.profileId ? `- Profile: ${plan.polling.profileId}` : undefined,
    `- Interval: ${plan.polling.intervalMs}ms`,
    plan.polling.minReceivedAt ? `- minReceivedAt: ${plan.polling.minReceivedAt}` : undefined,
    `- Total polls: ${plan.polling.totalPollCount}`,
    `- Failed polls: ${plan.polling.failedPollCount}`,
    `- Accepted dispatches: ${plan.polling.acceptedDispatchCount}`,
    `- Dropped dispatches: ${plan.polling.droppedDispatchCount}`,
    plan.polling.lastError ? `- Last error: ${plan.polling.lastError}` : undefined,
    "",
    "Safety boundary:",
    `- Starts bridge: ${plan.safety.startsBridge ? "yes" : "no"}`,
    `- Lists provider chats: ${plan.safety.listsProviderChats ? "yes" : "no"}`,
    `- Reads provider messages: ${plan.safety.readsProviderMessages ? "yes" : "no"}`,
    `- Reads provider history: ${plan.safety.readsProviderHistory ? "yes" : "no"}`,
    `- Mutates bindings: ${plan.safety.mutatesBindings ? "yes" : "no"}`,
    `- Starts polling: ${plan.safety.startsPolling ? "yes" : "no"}`,
    `- Sends provider messages: ${plan.safety.sendsProviderMessages ? "yes" : "no"}`,
    "",
    "Activation phases:",
    ...plan.phases.flatMap(phaseText),
    "",
    "Policy notes:",
    ...plan.policyNotes.map((note) => `- ${note}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function telegramOwnerLoopActivationCard(plan: TelegramOwnerLoopActivationPlan): MessagingRemoteSurfaceActivationCard {
  const currentPhase = currentActivationPhase(plan.phases);
  const repairPrompts = activationPhaseRepairPrompts(currentPhase);
  return {
    kind: "messaging-remote-surface-activation",
    intent: "remote_ambient_surface",
    providerId: TELEGRAM_PROVIDER_ID,
    providerLabel: "Telegram",
    status: plan.status,
    title: "Telegram Remote Ambient Surface activation",
    summary: telegramActivationSummary(plan),
    detail: currentPhase
      ? `${currentPhase.title}: ${formatActivationPhaseStatus(currentPhase.status)}.`
      : "No blocking activation phase is currently selected.",
    ambientSurface: plan.selectedBinding?.ambientSurface ?? "projects",
    ...(currentPhase ? { currentPhase: activationCardPhase(currentPhase) } : {}),
    phaseChips: plan.phases.map(activationCardPhase),
    ...(plan.recommendedNextTool ? { recommendedNextTool: plan.recommendedNextTool } : {}),
    ...(repairPrompts[0] ? { repairPrompt: repairPrompts[0] } : {}),
    repairPrompts,
    blockedUntilActivationPlan: [],
    previewSendSafety: remoteSurfaceActivationPreviewSendSafety(),
    safety: {
      startsBridge: false,
      listsProviderChats: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      mutatesBindings: false,
      startsPolling: false,
      sendsProviderMessages: false,
    },
  };
}

function providerPhase(providerReady: boolean, blockers: string[]): TelegramOwnerLoopActivationPhase {
  return {
    id: "provider-readiness",
    title: "Confirm Telegram provider readiness",
    status: providerReady ? "complete" : "blocked",
    toolSequence: ["ambient_messaging_gateway_status", "ambient_messaging_gateway_lifecycle_preview", "ambient_messaging_gateway_lifecycle_apply"],
    approvalRequired: !providerReady,
    blockers,
    carriesForward: ["profileId from readiness/session metadata"],
    notes: [
      "Start/attach Telegram through the approved lifecycle lane if the provider is not running in real mode.",
      "Readiness probes inspect bridge root health and local redacted session metadata only.",
    ],
  };
}

function currentActivationPhase(phases: TelegramOwnerLoopActivationPhase[]): TelegramOwnerLoopActivationPhase | undefined {
  return phases.find((phase) => phase.status === "blocked")
    ?? phases.find((phase) => phase.status === "ready")
    ?? phases.find((phase) => phase.status === "waiting")
    ?? phases.find((phase) => phase.status !== "complete" && phase.status !== "optional")
    ?? phases.find((phase) => phase.status === "optional");
}

function activationCardPhase(phase: TelegramOwnerLoopActivationPhase): MessagingRemoteSurfaceActivationCardPhase {
  return {
    id: phase.id,
    title: phase.title,
    status: phase.status,
    approvalRequired: phase.approvalRequired,
    ...(phase.toolSequence[0] ? { nextTool: phase.toolSequence[0] } : {}),
    blockerCount: phase.blockers.length,
  };
}

function activationPhaseRepairPrompts(phase: TelegramOwnerLoopActivationPhase | undefined): string[] {
  if (!phase) return [];
  if (phase.blockers.length) return phase.blockers;
  if (phase.userAction) return [phase.userAction];
  return phase.notes.slice(0, 2);
}

function telegramActivationSummary(plan: TelegramOwnerLoopActivationPlan): string {
  if (plan.status === "active") return "Owner loop is active.";
  if (plan.status === "ready_to_start_polling") return "Owner binding is ready; polling can be started after approval.";
  if (plan.status === "needs_setup") return "Setup is incomplete; follow the next activation phase.";
  return "Activation is blocked by provider readiness or missing setup inputs.";
}

function formatActivationPhaseStatus(status: TelegramOwnerLoopActivationPhaseStatus): string {
  return status.replace(/_/g, " ");
}

function remoteSurfaceActivationPreviewSendSafety(): MessagingRemoteSurfaceActivationCard["previewSendSafety"] {
  return {
    commandPreviewTool: "ambient_messaging_remote_surface_command_preview",
    replyPreviewTool: "ambient_messaging_remote_surface_reply_preview",
    providerSendApplyTool: "ambient_messaging_remote_surface_reply_apply",
    previewRequiredBeforeProviderSend: true,
    providerSendRequiresSeparateApproval: true,
    providerSendReady: false,
  };
}

function directoryPhase(input: {
  providerReady: boolean;
  selectedProfileId?: string;
  selectedConversationId?: string;
}): TelegramOwnerLoopActivationPhase {
  const blockers = input.providerReady ? [] : ["Telegram provider readiness is not complete."];
  const status = blockers.length ? "blocked" : input.selectedConversationId ? "complete" : input.selectedProfileId ? "ready" : "waiting";
  return {
    id: "metadata-directory",
    title: "Choose the owner conversation from metadata only",
    status,
    toolSequence: ["ambient_messaging_telegram_conversation_directory_preview", "ambient_messaging_telegram_conversation_directory_apply"],
    approvalRequired: true,
    blockers,
    carriesForward: ["profileId", "conversationId"],
    notes: [
      "Apply returns sanitized conversation metadata only; it must not return lastMessage or provider message bodies.",
      "If profileId is not known, use the provider readiness/session rows instead of Telegram Desktop scraping.",
    ],
  };
}

function handoffPhase(input: {
  providerReady: boolean;
  input: TelegramOwnerLoopActivationInput;
  selectedProfileId?: string;
  selectedConversationId?: string;
  selectedBinding?: TelegramOwnerLoopActivationBindingSummary;
}): TelegramOwnerLoopActivationPhase {
  const blockers = input.providerReady ? [] : ["Telegram provider readiness is not complete."];
  const complete = Boolean(input.input.ownerUserId || input.selectedBinding);
  const missing = complete ? [] : [
    input.selectedProfileId ? undefined : "profileId",
    input.selectedConversationId ? undefined : "conversationId",
    input.input.setupCode ? undefined : "setupCode",
  ].filter((value): value is string => Boolean(value));
  const status = blockers.length ? "blocked" : complete ? "complete" : missing.length ? "waiting" : "ready";
  return {
    id: "owner-handoff",
    title: "Authenticate the owner sender with a one-time setup code",
    status,
    toolSequence: ["ambient_messaging_telegram_owner_handoff_preview", "ambient_messaging_telegram_owner_handoff_apply"],
    approvalRequired: true,
    userAction: "Ask the owner to send the exact unique setup code in the selected Telegram conversation before apply.",
    blockers: [...blockers, ...missing.map((field) => `Missing ${field}.`)],
    carriesForward: ["ownerUserId", "sourceMessageId", "receivedAt"],
    notes: [
      "Apply reads only a bounded unread window for exact setup-code matches and returns no provider message bodies.",
      "Carry sourceMessageId forward as ownerHandoffSourceMessageId so the setup message cannot later become a command.",
    ],
  };
}

function bindingPhase(input: {
  providerReady: boolean;
  input: TelegramOwnerLoopActivationInput;
  selectedProfileId?: string;
  selectedConversationId?: string;
  selectedBinding?: TelegramOwnerLoopActivationBindingSummary;
}): TelegramOwnerLoopActivationPhase {
  const blockers = input.providerReady ? [] : ["Telegram provider readiness is not complete."];
  const missing = [
    input.selectedProfileId ? undefined : "profileId",
    input.selectedConversationId ? undefined : "conversationId",
    input.input.ownerUserId ? undefined : "ownerUserId",
  ].filter((value): value is string => Boolean(value));
  const status = blockers.length ? "blocked" : input.selectedBinding ? "complete" : missing.length ? "waiting" : "ready";
  return {
    id: "owner-binding",
    title: "Create the owner Remote Ambient Surface binding",
    status,
    toolSequence: ["ambient_messaging_telegram_remote_surface_preview", "ambient_messaging_telegram_remote_surface_apply", "ambient_messaging_list_bindings"],
    approvalRequired: true,
    blockers: [...blockers, ...missing.map((field) => `Missing ${field}.`)],
    carriesForward: ["bindingId", "ambientSurface", "maxDisclosureLabel", "ownerHandoffSourceMessageId"],
    notes: [
      `Use maxDisclosureLabel=${input.input.maxDisclosureLabel}.`,
      `Use ambientSurface=${input.input.ambientSurface ?? "projects"} unless the owner selected another surface.`,
      "Binding creation persists routing metadata only; it does not read messages or start polling.",
    ],
  };
}

function pollingPhase(input: {
  providerReady: boolean;
  selectedBinding?: TelegramOwnerLoopActivationBindingSummary;
  pollingStatus: TelegramBridgePollingRuntimeStatus;
  toolInput: TelegramOwnerLoopActivationInput;
}): TelegramOwnerLoopActivationPhase {
  const blockers = input.providerReady ? [] : ["Telegram provider readiness is not complete."];
  const status = blockers.length
    ? "blocked"
    : input.pollingStatus.running
      ? "complete"
      : input.selectedBinding
        ? "ready"
        : "waiting";
  return {
    id: "periodic-polling",
    title: "Start the ongoing owner polling loop",
    status,
    toolSequence: ["ambient_messaging_telegram_bridge_polling_preview", "ambient_messaging_telegram_bridge_polling_apply", "ambient_messaging_telegram_bridge_polling_status", "ambient_messaging_gateway_status"],
    approvalRequired: true,
    blockers: [
      ...blockers,
      ...(input.selectedBinding ? [] : ["No active owner Remote Ambient Surface binding is selected."]),
    ],
    carriesForward: ["runtimeEventId from accepted command projections", "queuedProjectionId when command text needs preview/apply"],
    notes: [
      `Use intervalMs=${input.toolInput.intervalMs}.`,
      `Use limit=${input.toolInput.limit}.`,
      "For activation after setup or handoff, set minReceivedAt to the activation/command boundary so old unread backlog is stale.",
      input.toolInput.minReceivedAt ? `Requested minReceivedAt=${input.toolInput.minReceivedAt}.` : "If no freshness anchor is known, ask the user to send the first command after activation and anchor to that time.",
    ],
  };
}

function commandRelayPhase(): TelegramOwnerLoopActivationPhase {
  return {
    id: "command-and-relay-preview",
    title: "Preview/apply commands and preview the relay",
    status: "waiting",
    toolSequence: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply", "ambient_messaging_gateway_status", "ambient_messaging_remote_surface_reply_preview"],
    approvalRequired: true,
    blockers: ["Waiting for an owner command projection from polling."],
    carriesForward: ["runtimeEventId", "relay preview text"],
    notes: [
      "Remote Ambient Surface command apply may schedule runtime work; inspect gateway status before summarizing.",
      "Provider replies must be previewed first and sent only after explicit approval.",
    ],
  };
}

function cleanupPhase(): TelegramOwnerLoopActivationPhase {
  return {
    id: "cleanup",
    title: "Stop polling or revoke the binding when requested",
    status: "optional",
    toolSequence: ["ambient_messaging_telegram_bridge_polling_preview", "ambient_messaging_telegram_bridge_polling_apply", "ambient_messaging_telegram_remote_surface_preview", "ambient_messaging_telegram_remote_surface_apply"],
    approvalRequired: true,
    blockers: [],
    carriesForward: [],
    notes: [
      "Stopping polling does not revoke the binding.",
      "Revoking the binding does not delete Telegram session metadata or send provider messages.",
    ],
  };
}

function providerReadinessBlockers(runtimeProvider: MessagingGatewayRuntimeStatus["providers"][number] | undefined): string[] {
  const readiness = runtimeProvider?.readiness;
  const blockers: string[] = [];
  if (!runtimeProvider) {
    blockers.push("Telegram provider runtime status is unavailable.");
    return blockers;
  }
  if (runtimeProvider.state !== "running" || runtimeProvider.mode !== "real") {
    blockers.push("Telegram provider is not running in real mode.");
  }
  if (!readiness) {
    blockers.push("Telegram readiness has not been refreshed.");
    return blockers;
  }
  if (!readiness.configured) blockers.push("Telegram session readiness is not configured.");
  if (!readiness.bridgeReachable) blockers.push("Telegram bridge root is not reachable.");
  if (!readiness.apiCredentialsPresent) blockers.push("Telegram API credentials are not present.");
  if (!readiness.sessions.some((session) => session.metadataReadable && session.databaseEncryptionKeyPresent)) {
    blockers.push("No readable Telegram auth profile with encrypted TDLib session metadata is available.");
  }
  return blockers;
}

function selectedBindingFor(
  input: TelegramOwnerLoopActivationInput,
  bindings: TelegramOwnerLoopActivationBindingSummary[],
): TelegramOwnerLoopActivationBindingSummary | undefined {
  return bindings.find((binding) =>
    (input.bindingId ? binding.bindingId === input.bindingId : true)
    && (input.profileId ? binding.authProfileId === input.profileId : true)
    && (input.conversationId ? binding.conversationId === input.conversationId : true)
  ) ?? (bindings.length === 1 ? bindings[0] : undefined);
}

function bindingSummary(binding: MessagingBindingDescriptor): TelegramOwnerLoopActivationBindingSummary {
  return {
    bindingId: binding.id,
    authProfileId: binding.authProfileId,
    conversationId: binding.conversationId,
    ...(binding.ambientSurface ? { ambientSurface: binding.ambientSurface } : {}),
    ...(binding.maxDisclosureLabel ? { maxDisclosureLabel: binding.maxDisclosureLabel } : {}),
  };
}

function overallStatus(input: {
  providerReady: boolean;
  selectedBinding?: TelegramOwnerLoopActivationBindingSummary;
  pollingStatus: TelegramBridgePollingRuntimeStatus;
}): TelegramOwnerLoopActivationStatus {
  if (!input.providerReady) return "blocked";
  if (input.pollingStatus.running) return "active";
  if (input.selectedBinding) return "ready_to_start_polling";
  return "needs_setup";
}

function nextTool(phases: TelegramOwnerLoopActivationPhase[]): string | undefined {
  for (const phase of phases) {
    if (phase.status === "blocked" || phase.status === "ready" || phase.status === "waiting") {
      return phase.toolSequence[0];
    }
  }
  return undefined;
}

function phaseText(phase: TelegramOwnerLoopActivationPhase): string[] {
  return [
    `- ${phase.id}: ${phase.status} (${phase.title})`,
    `  Tool sequence: ${phase.toolSequence.join(" -> ")}`,
    `  Approval required: ${phase.approvalRequired ? "yes" : "no"}`,
    phase.userAction ? `  User action: ${phase.userAction}` : undefined,
    `  Carries forward: ${phase.carriesForward.length ? phase.carriesForward.join(", ") : "none"}`,
    `  Blockers: ${phase.blockers.length ? phase.blockers.join("; ") : "none"}`,
    ...phase.notes.map((note) => `  Note: ${note}`),
  ].filter((line): line is string => line !== undefined);
}

function singleProfileId(profiles: TelegramOwnerLoopActivationProfileSummary[]): string | undefined {
  return profiles.length === 1 ? profiles[0].profileId : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isMessagingAmbientSurface(value: string): value is MessagingAmbientSurface {
  return value === "chat"
    || value === "projects"
    || value === "workflow_agents"
    || value === "settings"
    || value === "notifications";
}
