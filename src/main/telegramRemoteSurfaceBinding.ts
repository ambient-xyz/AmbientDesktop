import type {
  MessagingAmbientSurface,
  MessagingBindingCreateInput,
  MessagingBindingLifecyclePreview,
  MessagingBindingLifecycleResult,
  MessagingBindingRevokeInput,
  MessagingGatewayAdapterRuntimeStatus,
  MessagingGatewayProviderReadiness,
  MessagingGatewayProviderSessionReadiness,
} from "../shared/messagingGateway";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";
const PURPOSE = "remote_ambient_surface";

export type TelegramRemoteSurfaceBindingAction = "create" | "revoke";
export type TelegramRemoteSurfaceBindingApplyStatus = "applied" | "blocked" | "denied";

export type TelegramRemoteSurfaceBindingToolInput =
  | {
    action: "create";
    purpose: "remote_ambient_surface";
    profileId: string;
    conversationId: string;
    ownerUserId: string;
    ambientSurface: MessagingAmbientSurface;
    maxDisclosureLabel: string;
    threadId?: string;
    projectId?: string;
    workflowId?: string;
    permissionProfileId?: string;
    guardProfileId?: string;
    ownerHandoffSourceMessageId?: string;
  }
  | {
    action: "revoke";
    bindingId: string;
    reason?: string;
  };

export interface TelegramRemoteSurfaceBindingPlan {
  action: TelegramRemoteSurfaceBindingAction;
  status: "ready" | "blocked";
  canApplyNow: boolean;
  lifecycle: MessagingBindingLifecyclePreview | MessagingBindingLifecycleResult;
  readiness?: MessagingGatewayProviderReadiness;
  runtimeProvider?: MessagingGatewayAdapterRuntimeStatus;
  matchedSession?: MessagingGatewayProviderSessionReadiness;
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    startsBridge: false;
    readsProviderMessages: false;
    sendsProviderMessages: false;
    enablesInboundIngestion: false;
  };
}

export interface TelegramRemoteSurfaceBindingApplyResult extends TelegramRemoteSurfaceBindingPlan {
  applyStatus: TelegramRemoteSurfaceBindingApplyStatus;
  persisted: boolean;
  approvalRecorded: boolean;
  blockedReason?: string;
}

export function telegramRemoteSurfaceBindingInput(params: unknown): TelegramRemoteSurfaceBindingToolInput {
  const raw = params as Record<string, unknown> | undefined;
  const action = optionalString(raw?.action);
  if (action === "revoke") {
    const bindingId = optionalString(raw?.bindingId);
    if (!bindingId) throw new Error("bindingId is required when action=revoke.");
    return { action, bindingId, reason: optionalString(raw?.reason) };
  }
  if (action !== "create") throw new Error("action must be create or revoke.");

  const purpose = optionalString(raw?.purpose);
  if (purpose !== PURPOSE) throw new Error("purpose must be remote_ambient_surface when action=create.");
  const profileId = optionalString(raw?.profileId);
  const conversationId = optionalString(raw?.conversationId);
  const ownerUserId = optionalString(raw?.ownerUserId);
  const ambientSurface = optionalString(raw?.ambientSurface);
  const maxDisclosureLabel = optionalString(raw?.maxDisclosureLabel);
  if (!profileId) throw new Error("profileId is required when action=create.");
  if (!conversationId) throw new Error("conversationId is required when action=create.");
  if (!ownerUserId) throw new Error("ownerUserId is required when action=create.");
  if (!ambientSurface || !isMessagingAmbientSurface(ambientSurface)) {
    throw new Error("ambientSurface must be chat, projects, workflow_agents, settings, or notifications.");
  }
  if (!maxDisclosureLabel) throw new Error("maxDisclosureLabel is required when action=create.");

  return {
    action,
    purpose,
    profileId,
    conversationId,
    ownerUserId,
    ambientSurface,
    maxDisclosureLabel,
    threadId: optionalString(raw?.threadId),
    projectId: optionalString(raw?.projectId),
    workflowId: optionalString(raw?.workflowId),
    permissionProfileId: optionalString(raw?.permissionProfileId),
    guardProfileId: optionalString(raw?.guardProfileId),
    ownerHandoffSourceMessageId: optionalString(raw?.ownerHandoffSourceMessageId),
  };
}

export function telegramRemoteSurfaceBindingCreateInput(
  input: Extract<TelegramRemoteSurfaceBindingToolInput, { action: "create" }>,
): MessagingBindingCreateInput {
  return {
    providerId: TELEGRAM_PROVIDER_ID,
    authProfileId: input.profileId,
    conversationId: input.conversationId,
    threadId: input.threadId,
    purpose: PURPOSE,
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    workflowId: input.workflowId,
    ambientSurface: input.ambientSurface,
    externalTrustClass: "owner",
    permissionProfileId: input.permissionProfileId,
    guardProfileId: input.guardProfileId,
    maxDisclosureLabel: input.maxDisclosureLabel,
    metadata: {
      setupTool: "ambient_messaging_telegram_remote_surface_apply",
      setupShape: "telegram-owner-remote-ambient-surface",
      disclosurePolicy: input.maxDisclosureLabel,
      ...(input.ownerHandoffSourceMessageId ? { ownerHandoffSourceMessageId: input.ownerHandoffSourceMessageId } : {}),
    },
  };
}

export function telegramRemoteSurfaceBindingRevokeInput(
  input: Extract<TelegramRemoteSurfaceBindingToolInput, { action: "revoke" }>,
): MessagingBindingRevokeInput {
  return {
    bindingId: input.bindingId,
    reason: input.reason,
  };
}

export function buildTelegramRemoteSurfaceBindingPlan(input: {
  toolInput: TelegramRemoteSurfaceBindingToolInput;
  lifecycle: MessagingBindingLifecyclePreview | MessagingBindingLifecycleResult;
  readiness?: MessagingGatewayProviderReadiness;
  runtimeProvider?: MessagingGatewayAdapterRuntimeStatus;
}): TelegramRemoteSurfaceBindingPlan {
  const blockers = bindingShapeBlockers(input.lifecycle);
  const warnings: string[] = [];
  const matchedSession = input.toolInput.action === "create"
    ? matchingSession(input.readiness, input.toolInput.profileId)
    : undefined;

  if (input.toolInput.action === "create") {
    blockers.push(...telegramCreateReadinessBlockers(input.toolInput, input.readiness, matchedSession));
    warnings.push(...telegramCreateReadinessWarnings(input.readiness, input.runtimeProvider, matchedSession));
  }
  if (input.toolInput.action === "revoke") {
    warnings.push("Revoking the binding removes routing intent only; it does not delete Telegram session metadata or stop a running bridge.");
  }

  const status = blockers.length ? "blocked" : "ready";
  return {
    action: input.toolInput.action,
    status,
    canApplyNow: status === "ready",
    lifecycle: input.lifecycle,
    readiness: input.readiness,
    runtimeProvider: input.runtimeProvider,
    matchedSession,
    blockers,
    warnings,
    policyNotes: policyNotes(input.lifecycle),
    nextSteps: nextSteps(input.toolInput.action, status),
    safety: {
      startsBridge: false,
      readsProviderMessages: false,
      sendsProviderMessages: false,
      enablesInboundIngestion: false,
    },
  };
}

export function telegramRemoteSurfaceBindingBlockedResult(
  plan: TelegramRemoteSurfaceBindingPlan,
  approvalRecorded = false,
): TelegramRemoteSurfaceBindingApplyResult {
  return {
    ...plan,
    applyStatus: "blocked",
    persisted: false,
    approvalRecorded,
    blockedReason: plan.blockers.join(" "),
  };
}

export function telegramRemoteSurfaceBindingDeniedResult(
  plan: TelegramRemoteSurfaceBindingPlan,
): TelegramRemoteSurfaceBindingApplyResult {
  return {
    ...plan,
    applyStatus: "denied",
    persisted: false,
    approvalRecorded: false,
  };
}

export function telegramRemoteSurfaceBindingAppliedResult(
  plan: TelegramRemoteSurfaceBindingPlan,
  lifecycle: MessagingBindingLifecycleResult,
): TelegramRemoteSurfaceBindingApplyResult {
  return {
    ...plan,
    status: "ready",
    canApplyNow: true,
    lifecycle,
    applyStatus: "applied",
    persisted: lifecycle.persisted,
    approvalRecorded: true,
  };
}

export function telegramRemoteSurfaceBindingText(
  value: TelegramRemoteSurfaceBindingPlan | TelegramRemoteSurfaceBindingApplyResult,
): string {
  const lifecycle = value.lifecycle;
  const binding = lifecycle.binding;
  const applied = "applyStatus" in value;
  const title = applied
    ? `Telegram Remote Ambient Surface binding ${value.applyStatus}`
    : `Telegram Remote Ambient Surface binding ${value.status === "ready" ? "preview ready" : "preview blocked"}`;
  const lines = [
    title,
    `Action: ${value.action}`,
    applied ? `Persisted: ${value.persisted ? "yes" : "no"}` : undefined,
    `Binding: ${binding.id}`,
    `Provider: ${binding.providerId}`,
    `Purpose: ${binding.purpose}`,
    `Profile: ${binding.authProfileId}`,
    `Conversation: ${binding.conversationId}${binding.threadId ? ` / ${binding.threadId}` : ""}`,
    binding.ownerUserId ? `Owner user: ${binding.ownerUserId}` : undefined,
    binding.ambientSurface ? `Surface: ${binding.ambientSurface}` : undefined,
    binding.projectId ? `Project: ${binding.projectId}` : undefined,
    binding.workflowId ? `Workflow: ${binding.workflowId}` : undefined,
    binding.maxDisclosureLabel ? `Max disclosure: ${binding.maxDisclosureLabel}` : undefined,
    metadataString(binding.metadata?.ownerHandoffSourceMessageId) ? `Owner handoff source message: ${metadataString(binding.metadata?.ownerHandoffSourceMessageId)}` : undefined,
    `State path: ${lifecycle.statePath}`,
    `Can apply now: ${value.canApplyNow ? "yes" : "no"}`,
    `Would persist: ${lifecycle.wouldPersist ? "yes" : "no"}`,
    `Would start bridge: ${value.safety.startsBridge ? "yes" : "no"}`,
    `Would read provider messages: ${value.safety.readsProviderMessages ? "yes" : "no"}`,
    `Would send provider messages: ${value.safety.sendsProviderMessages ? "yes" : "no"}`,
    `Would enable inbound ingestion: ${value.safety.enablesInboundIngestion ? "yes" : "no"}`,
    "",
    "Telegram readiness:",
    ...readinessLines(value),
    "",
    "Blockers:",
    ...(value.blockers.length ? value.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Warnings:",
    ...(value.warnings.length ? value.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "Policy notes:",
    ...value.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...value.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined);
  return lines.join("\n");
}

export function telegramRemoteSurfaceBindingApprovalDetail(plan: TelegramRemoteSurfaceBindingPlan): string {
  const binding = plan.lifecycle.binding;
  return [
    `Binding: ${binding.id}`,
    `Provider: ${binding.providerId}`,
    `Purpose: ${binding.purpose}`,
    `Profile: ${binding.authProfileId}`,
    `Conversation: ${binding.conversationId}${binding.threadId ? ` / ${binding.threadId}` : ""}`,
    binding.ownerUserId ? `Owner user: ${binding.ownerUserId}` : undefined,
    binding.ambientSurface ? `Surface: ${binding.ambientSurface}` : undefined,
    binding.maxDisclosureLabel ? `Max disclosure: ${binding.maxDisclosureLabel}` : undefined,
    `Readiness: ${plan.readiness?.status ?? "not refreshed"}`,
    `Bridge reachable: ${plan.readiness?.bridgeReachable ? "yes" : "no"}`,
    `Bridge state: ${plan.runtimeProvider?.state ?? "unknown"}`,
    "This persists routing metadata only.",
    "This does not start Telegram, list chats, read messages, ingest events, or send messages.",
    ...plan.policyNotes,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function bindingShapeBlockers(lifecycle: MessagingBindingLifecyclePreview | MessagingBindingLifecycleResult): string[] {
  const blockers: string[] = [];
  if (lifecycle.binding.providerId !== TELEGRAM_PROVIDER_ID) {
    blockers.push(`This typed flow only supports provider ${TELEGRAM_PROVIDER_ID}.`);
  }
  if (lifecycle.binding.purpose !== PURPOSE) {
    blockers.push("This typed flow only supports remote_ambient_surface bindings.");
  }
  return blockers;
}

function telegramCreateReadinessBlockers(
  input: Extract<TelegramRemoteSurfaceBindingToolInput, { action: "create" }>,
  readiness: MessagingGatewayProviderReadiness | undefined,
  session: MessagingGatewayProviderSessionReadiness | undefined,
): string[] {
  const blockers: string[] = [];
  if (!readiness) {
    blockers.push("Telegram readiness has not been refreshed.");
    return blockers;
  }
  if (readiness.providerId !== TELEGRAM_PROVIDER_ID) {
    blockers.push(`Readiness was returned for ${readiness.providerId}, not ${TELEGRAM_PROVIDER_ID}.`);
  }
  if (!readiness.apiCredentialsPresent) {
    blockers.push("Telegram API credentials are not available to the runtime.");
  }
  if (!session) {
    blockers.push(`No persisted Telegram session metadata was found for profile ${input.profileId}.`);
    return blockers;
  }
  if (!session.metadataReadable) {
    blockers.push(`Telegram session metadata for profile ${input.profileId} is not readable.`);
  }
  if (!session.databaseEncryptionKeyPresent) {
    blockers.push(`Telegram session metadata for profile ${input.profileId} is missing its database encryption key.`);
  }
  if (!session.tdlibStateDirPresent) {
    blockers.push(`Telegram TDLib state directory for profile ${input.profileId} is not present.`);
  }
  return blockers;
}

function telegramCreateReadinessWarnings(
  readiness: MessagingGatewayProviderReadiness | undefined,
  runtimeProvider: MessagingGatewayAdapterRuntimeStatus | undefined,
  session: MessagingGatewayProviderSessionReadiness | undefined,
): string[] {
  const warnings: string[] = [];
  if (!readiness) return warnings;
  if (session && !session.phoneNumberPresent) {
    warnings.push("The matched session metadata does not include a phone-number presence marker; real startup may request session repair.");
  }
  if (!readiness.bridgeReachable) {
    warnings.push("The Telegram bridge root is not reachable; this binding can be persisted, but real inbound ingestion stays disabled until bridge startup is separately approved and running.");
  }
  if (readiness.authNeeded) {
    warnings.push("The readiness probe reports authNeeded=true; a later real bridge startup must verify the session before any messages are read.");
  }
  const state = runtimeProvider?.state ?? "stopped";
  if (state !== "running") {
    warnings.push(`Gateway runtime state for Telegram is ${state}; creating this binding will not enable live message ingestion.`);
  }
  return warnings;
}

function matchingSession(
  readiness: MessagingGatewayProviderReadiness | undefined,
  profileId: string,
): MessagingGatewayProviderSessionReadiness | undefined {
  return readiness?.sessions.find((session) => session.profileId === profileId);
}

function readinessLines(value: TelegramRemoteSurfaceBindingPlan | TelegramRemoteSurfaceBindingApplyResult): string[] {
  const readiness = value.readiness;
  if (!readiness) return ["- Not refreshed"];
  const session = value.matchedSession;
  return [
    `- Status: ${readiness.status}`,
    `- API credentials present: ${readiness.apiCredentialsPresent ? "yes" : "no"}`,
    `- Persisted sessions: ${readiness.persistedSessionCount}`,
    `- Bridge reachable: ${readiness.bridgeReachable ? "yes" : "no"}`,
    `- Bridge session count: ${typeof readiness.bridgeSessionCount === "number" ? readiness.bridgeSessionCount : "unknown"}`,
    `- Runtime state: ${value.runtimeProvider?.state ?? "unknown"}`,
    session ? `- Matched profile ${session.profileId}: metadataReadable=${session.metadataReadable ? "yes" : "no"}, tdlibStateDir=${session.tdlibStateDirPresent ? "yes" : "no"}, encryptionKey=${session.databaseEncryptionKeyPresent ? "yes" : "no"}` : "- Matched profile: none",
  ];
}

function policyNotes(lifecycle: MessagingBindingLifecyclePreview | MessagingBindingLifecycleResult): string[] {
  return [
    ...lifecycle.policyNotes,
    "This Telegram-specific setup is for the owner Remote Ambient Surface only, not external messaging.",
    "The bound conversation is a control plane for Ambient surfaces; Messaging Connector flows must use a separate binding and prompt context.",
    "Binding creation is not authorization to read Telegram messages; ingestion remains disabled until a later approved bridge lifecycle step.",
    "The owner sender id must come from an existing Ambient owner binding, a previous approved bridge event/polling result, or the narrow owner-id handoff; do not scrape Telegram Desktop, browser views, provider CLIs, or arbitrary chat history to infer it.",
    "When binding immediately after an approved Telegram owner handoff, pass its sourceMessageId as ownerHandoffSourceMessageId so later polling treats the setup-code message as already consumed.",
  ];
}

function nextSteps(action: TelegramRemoteSurfaceBindingAction, status: "ready" | "blocked"): string[] {
  if (status === "blocked") {
    return [
      "Resolve the blockers, then run ambient_messaging_telegram_remote_surface_preview again.",
      "Do not fall back to generic messaging connector, shell, browser, or provider bridge operations to bypass the typed setup.",
    ];
  }
  if (action === "revoke") {
    return [
      "Ask the user to approve revoking this Telegram Remote Ambient Surface binding.",
      "After apply, call ambient_messaging_list_bindings with includeInactive=true to verify the revoked record.",
    ];
  }
  return [
    "Ask the user to approve creating this owner-scoped Telegram Remote Ambient Surface binding.",
    "After apply, call ambient_messaging_list_bindings to verify the active record.",
    "Use ambient_messaging_synthetic_route for safe routing dogfood before any real bridge startup.",
  ];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isMessagingAmbientSurface(value: string): value is MessagingAmbientSurface {
  return value === "chat"
    || value === "projects"
    || value === "workflow_agents"
    || value === "settings"
    || value === "notifications";
}
