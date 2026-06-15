import { createHash } from "node:crypto";
import type {
  MessagingAmbientSurface,
  MessagingBindingCreateInput,
  MessagingBindingDescriptor,
  MessagingBindingLifecycleResult,
  MessagingBindingListResult,
  MessagingBindingRevokeInput,
  MessagingGatewayProviderSessionReadiness,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../shared/messagingGateway";
import { signalBridgeEndpointPaths } from "./signalBridgeContract";
import { signalUnreadWindowContract, type SignalUnreadWindowContract } from "./signalUnreadWindow";

const SIGNAL_PROVIDER_ID = "signal-cli";
const SIGNAL_PROVIDER_LABEL = "Signal";
const PURPOSE = "remote_ambient_surface";
const MAX_INITIAL_SEEN_IDS = 100;
const MAX_UNREAD_LIMIT = 25;

type RuntimeProvider = MessagingGatewayRuntimeStatus["providers"][number];

export interface SignalRemoteSurfaceBindingInput {
  action: "create";
  providerId: "signal-cli";
  purpose: "remote_ambient_surface";
  profileId: string;
  conversationId: string;
  ownerUserId: string;
  ownerHandoffSourceMessageId: string;
  initialSeenMessageIds: string[];
  ambientSurface: MessagingAmbientSurface;
  maxDisclosureLabel: string;
  threadId?: string;
  projectId?: string;
  workflowId?: string;
  chatThreadId?: string;
  permissionProfileId?: string;
  guardProfileId?: string;
  limit: number;
}

export interface SignalRemoteSurfaceProfileSummary {
  profileId: string;
  metadataReadable: boolean;
  signalCliConfigDirPresent: boolean;
  accountIdentifierPresent: boolean;
  linkedDevicePresent: boolean;
  registrationMetadataPresent: boolean;
  bridgeSessionReadable: boolean;
}

export interface SignalRemoteSurfaceBindingContract {
  kind: "signal-remote-surface-binding-v0";
  providerId: "signal-cli";
  requiredOwnerHandoffFields: string[];
  requiredBindingFields: string[];
  futurePersistedMetadataFields: string[];
  genericBindingApplyAllowed: false;
  telegramOwnerHandoffAllowed: false;
}

export interface SignalRemoteSurfaceBindingPlan {
  providerId: "signal-cli";
  providerLabel: string;
  action: "create";
  status: "ready" | "blocked";
  canApplyNow: boolean;
  previewOnly: boolean;
  typedPreviewTool: "ambient_messaging_signal_remote_surface_preview";
  typedApplyTool: "ambient_messaging_signal_remote_surface_apply";
  genericBindingApplyAllowed: false;
  telegramOwnerHandoffAllowed: false;
  providerImplementationStatus: MessagingProviderDescriptor["implementation"]["status"] | "planned";
  purposeSupported: boolean;
  bindingLifecycleEnabled: boolean;
  runtimeLifecycleEnabled: boolean;
  inboundIngestionEnabled: boolean;
  outboundReplyEnabled: boolean;
  profileId: string;
  conversationId: string;
  ownerUserId: string;
  ownerHandoffSourceMessageId: string;
  initialSeenMessageIds: string[];
  initialSeenMessageCount: number;
  ambientSurface: MessagingAmbientSurface;
  maxDisclosureLabel: string;
  threadId?: string;
  projectId?: string;
  workflowId?: string;
  chatThreadId?: string;
  permissionProfileId?: string;
  guardProfileId?: string;
  limit: number;
  futureBinding: MessagingBindingDescriptor;
  futureUnreadEndpointPath?: string;
  runtimeProvider?: RuntimeProvider;
  readinessStatus?: string;
  configured?: boolean;
  bridgeReachable?: boolean;
  bridgeCapabilities?: {
    profileStatus?: boolean;
    metadataOnlyConversationDirectory?: boolean;
    boundedUnreadWindow?: boolean;
    approvedReplySend?: boolean;
  };
  knownAuthProfiles: SignalRemoteSurfaceProfileSummary[];
  selectedProfile?: SignalRemoteSurfaceProfileSummary;
  existingBindings: MessagingBindingDescriptor[];
  contract: SignalRemoteSurfaceBindingContract;
  unreadWindowContract: SignalUnreadWindowContract;
  gates: {
    ownerHandoffMetadataAccepted: boolean;
    profileSelected: boolean;
    conversationSelected: boolean;
    bridgeReadableProfile: boolean;
    metadataOnlyDirectoryReady: boolean;
    boundedUnreadContractAvailable: boolean;
    bindingLifecycleAvailable: boolean;
    runtimeLifecycleAvailable: boolean;
    inboundIngestionAvailable: boolean;
    outboundReplyAvailable: boolean;
  };
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    startsBridge: false;
    readsProviderMessages: false;
    readsProviderHistory: false;
    readsUnreadWindow: false;
    sendsProviderMessages: false;
    mutatesBindings: boolean;
    persistsBinding: boolean;
    runsProviderCli: false;
    inspectsSignalDesktop: false;
    usesTelegramOwnerHandoff: false;
    usesGenericBindingApply: false;
  };
}

export interface SignalRemoteSurfaceBindingApplyResult extends SignalRemoteSurfaceBindingPlan {
  applyStatus: "applied" | "blocked" | "denied";
  approvalRequested: boolean;
  approvalRecorded: boolean;
  persisted: boolean;
  canFeedFutureBindingLifecycle: boolean;
  bindingApplyInputReady: boolean;
  lifecycle?: MessagingBindingLifecycleResult;
  failureMode?: "readiness-blocked" | "approval-denied" | "persistence-failed";
  failureHint?: string;
}

export interface SignalRemoteSurfaceBindingRevokeInput {
  action: "revoke";
  providerId: "signal-cli";
  bindingId: string;
  reason?: string;
}

export interface SignalRemoteSurfaceBindingRevokePlan {
  providerId: "signal-cli";
  providerLabel: string;
  action: "revoke";
  status: "ready" | "blocked";
  canApplyNow: boolean;
  previewOnly: boolean;
  typedPreviewTool: "ambient_messaging_signal_remote_surface_preview";
  typedApplyTool: "ambient_messaging_signal_remote_surface_apply";
  genericBindingApplyAllowed: false;
  telegramOwnerHandoffAllowed: false;
  providerImplementationStatus: MessagingProviderDescriptor["implementation"]["status"] | "planned";
  purposeSupported: boolean;
  bindingLifecycleEnabled: boolean;
  bindingId: string;
  reason?: string;
  targetBinding?: MessagingBindingDescriptor;
  matchingBindings: MessagingBindingDescriptor[];
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    startsBridge: false;
    readsProviderMessages: false;
    readsProviderHistory: false;
    readsUnreadWindow: false;
    sendsProviderMessages: false;
    mutatesBindings: boolean;
    persistsBinding: boolean;
    runsProviderCli: false;
    inspectsSignalDesktop: false;
    usesTelegramOwnerHandoff: false;
    usesGenericBindingApply: false;
  };
}

export interface SignalRemoteSurfaceBindingRevokeResult extends SignalRemoteSurfaceBindingRevokePlan {
  applyStatus: "applied" | "blocked" | "denied";
  approvalRequested: boolean;
  approvalRecorded: boolean;
  persisted: boolean;
  lifecycle?: MessagingBindingLifecycleResult;
  failureMode?: "readiness-blocked" | "approval-denied" | "persistence-failed";
  failureHint?: string;
}

export function signalRemoteSurfaceBindingInput(params: unknown): SignalRemoteSurfaceBindingInput {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId) ?? SIGNAL_PROVIDER_ID;
  if (providerId !== SIGNAL_PROVIDER_ID) throw new Error(`providerId must be ${SIGNAL_PROVIDER_ID} when supplied.`);
  const action = optionalString(raw?.action) ?? "create";
  if (action !== "create") throw new Error("Signal Remote Ambient Surface binding currently supports action=create only.");
  const purpose = optionalString(raw?.purpose) ?? PURPOSE;
  if (purpose !== PURPOSE) throw new Error(`purpose must be ${PURPOSE}.`);
  const profileId = optionalString(raw?.profileId) ?? optionalString(raw?.authProfileId);
  const conversationId = optionalString(raw?.conversationId);
  const ownerUserId = optionalString(raw?.ownerUserId);
  const ownerHandoffSourceMessageId = optionalString(raw?.ownerHandoffSourceMessageId) ?? optionalString(raw?.sourceMessageId);
  const initialSeenMessageIds = stringArray(raw?.initialSeenMessageIds);
  const ambientSurface = optionalString(raw?.ambientSurface);
  const maxDisclosureLabel = optionalString(raw?.maxDisclosureLabel);
  if (!profileId) throw new Error("profileId is required.");
  if (!conversationId) throw new Error("conversationId is required.");
  if (!ownerUserId) throw new Error("ownerUserId is required from a matched Signal owner handoff.");
  if (!ownerHandoffSourceMessageId) throw new Error("ownerHandoffSourceMessageId is required from a matched Signal owner handoff.");
  if (!initialSeenMessageIds.length) throw new Error("initialSeenMessageIds is required from a matched Signal owner handoff.");
  if (!initialSeenMessageIds.includes(ownerHandoffSourceMessageId)) {
    throw new Error("initialSeenMessageIds must include ownerHandoffSourceMessageId.");
  }
  if (!ambientSurface || !isMessagingAmbientSurface(ambientSurface)) {
    throw new Error("ambientSurface must be chat, projects, workflow_agents, settings, or notifications.");
  }
  if (!maxDisclosureLabel) throw new Error("maxDisclosureLabel is required.");
  const limitValue = typeof raw?.limit === "number" && Number.isFinite(raw.limit) ? Math.floor(raw.limit) : 10;

  return {
    action: "create",
    providerId: SIGNAL_PROVIDER_ID,
    purpose,
    profileId,
    conversationId,
    ownerUserId,
    ownerHandoffSourceMessageId,
    initialSeenMessageIds,
    ambientSurface,
    maxDisclosureLabel,
    ...(optionalString(raw?.threadId) ? { threadId: optionalString(raw?.threadId)! } : {}),
    ...(optionalString(raw?.projectId) ? { projectId: optionalString(raw?.projectId)! } : {}),
    ...(optionalString(raw?.workflowId) ? { workflowId: optionalString(raw?.workflowId)! } : {}),
    ...(optionalString(raw?.chatThreadId) ? { chatThreadId: optionalString(raw?.chatThreadId)! } : {}),
    ...(optionalString(raw?.permissionProfileId) ? { permissionProfileId: optionalString(raw?.permissionProfileId)! } : {}),
    ...(optionalString(raw?.guardProfileId) ? { guardProfileId: optionalString(raw?.guardProfileId)! } : {}),
    limit: Math.max(1, Math.min(MAX_UNREAD_LIMIT, limitValue)),
  };
}

export function signalRemoteSurfaceBindingRevokeInput(params: unknown): SignalRemoteSurfaceBindingRevokeInput {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId) ?? SIGNAL_PROVIDER_ID;
  if (providerId !== SIGNAL_PROVIDER_ID) throw new Error(`providerId must be ${SIGNAL_PROVIDER_ID} when supplied.`);
  const action = optionalString(raw?.action);
  if (action !== "revoke") throw new Error("Signal Remote Ambient Surface binding revoke requires action=revoke.");
  const bindingId = optionalString(raw?.bindingId);
  if (!bindingId) throw new Error("bindingId is required when action=revoke.");
  return {
    action: "revoke",
    providerId: SIGNAL_PROVIDER_ID,
    bindingId,
    ...(optionalString(raw?.reason) ? { reason: optionalString(raw?.reason)! } : {}),
  };
}

export function signalRemoteSurfaceBindingAction(params: unknown): "create" | "revoke" {
  const raw = params as Record<string, unknown> | undefined;
  const action = optionalString(raw?.action) ?? "create";
  if (action !== "create" && action !== "revoke") throw new Error("action must be create or revoke.");
  return action;
}

export function buildSignalRemoteSurfaceBindingPlan(input: {
  toolInput: SignalRemoteSurfaceBindingInput;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  descriptor?: MessagingProviderDescriptor;
  now?: () => Date;
}): SignalRemoteSurfaceBindingPlan {
  const descriptor = input.descriptor;
  const implementation = descriptor?.implementation;
  const runtimeProvider = input.runtimeStatus?.providers.find((provider) => provider.providerId === SIGNAL_PROVIDER_ID);
  const readiness = runtimeProvider?.readiness;
  const knownAuthProfiles = (readiness?.sessions ?? [])
    .filter((session) => session.profileId === input.toolInput.profileId)
    .map(profileSummary);
  const selectedProfile = knownAuthProfiles.find((profile) => profile.profileId === input.toolInput.profileId);
  const bridgeReadableProfile = selectedProfile?.metadataReadable === true && selectedProfile.bridgeSessionReadable === true;
  const metadataOnlyDirectoryReady = readiness?.bridgeReachable === true
    && readiness.bridgeCapabilities?.profileStatus === true
    && readiness.bridgeCapabilities.metadataOnlyConversationDirectory === true
    && bridgeReadableProfile;
  const boundedUnreadContractAvailable = readiness?.bridgeReachable === true
    && readiness.bridgeCapabilities?.profileStatus === true
    && readiness.bridgeCapabilities.boundedUnreadWindow === true
    && bridgeReadableProfile;
  const purposeSupported = descriptor?.purposeSupport.remote_ambient_surface === true;
  const bindingLifecycleEnabled = implementation?.bindingLifecycleEnabled === true;
  const runtimeLifecycleEnabled = implementation?.runtimeLifecycleEnabled === true;
  const inboundIngestionEnabled = implementation?.inboundIngestionEnabled === true;
  const outboundReplyEnabled = implementation?.outboundReplyEnabled === true;
  const futureUnreadEndpointPath = signalBridgeEndpointPaths(input.toolInput.profileId, input.toolInput.conversationId)
    .unreadWindow
    .replace(":limit", String(input.toolInput.limit));
  const futureBinding = futureBindingDescriptor(input.toolInput, input.now?.() ?? new Date());
  const existingBindings = input.bindings.bindings
    .filter((binding) => binding.providerId === SIGNAL_PROVIDER_ID)
    .filter((binding) => binding.purpose === PURPOSE)
    .filter((binding) => binding.authProfileId === input.toolInput.profileId)
    .filter((binding) => binding.conversationId === input.toolInput.conversationId);
  const blockers: string[] = [];
  if (!purposeSupported) blockers.push("Signal provider does not currently enable remote_ambient_surface purpose support.");
  if (!bindingLifecycleEnabled) blockers.push("Signal binding lifecycle adapter is disabled.");
  if (!runtimeProvider) blockers.push("Signal runtime status is unavailable.");
  if (!readiness) {
    blockers.push("Signal readiness has not been refreshed.");
  } else {
    if (!readiness.bridgeReachable) blockers.push("Signal bridge root is not reachable.");
    if (!readiness.bridgeCapabilities?.profileStatus) blockers.push("Signal bridge root did not advertise profileStatus.");
    if (!readiness.bridgeCapabilities?.metadataOnlyConversationDirectory) blockers.push("Signal bridge root did not advertise metadataOnlyConversationDirectory.");
    if (!readiness.bridgeCapabilities?.boundedUnreadWindow) blockers.push("Signal bridge root did not advertise boundedUnreadWindow.");
    if (!readiness.configured) blockers.push("No reviewed bridge-readable Signal profile is configured.");
  }
  if (!selectedProfile) blockers.push(`Signal profile was not found in readiness metadata: ${input.toolInput.profileId}.`);
  if (selectedProfile && !bridgeReadableProfile) blockers.push(`Signal profile ${selectedProfile.profileId} is not bridge-readable.`);
  if (existingBindings.some((binding) => binding.status === "active")) {
    blockers.push("An active Signal Remote Ambient Surface binding already exists for this profile/conversation.");
  }
  const canApplyNow = blockers.length === 0;
  const plannedImplementation = (implementation?.status ?? "planned") !== "available";

  return {
    providerId: SIGNAL_PROVIDER_ID,
    providerLabel: descriptor?.label ?? SIGNAL_PROVIDER_LABEL,
    action: "create",
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    previewOnly: !canApplyNow,
    typedPreviewTool: "ambient_messaging_signal_remote_surface_preview",
    typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
    genericBindingApplyAllowed: false,
    telegramOwnerHandoffAllowed: false,
    providerImplementationStatus: implementation?.status ?? "planned",
    purposeSupported,
    bindingLifecycleEnabled,
    runtimeLifecycleEnabled,
    inboundIngestionEnabled,
    outboundReplyEnabled,
    profileId: input.toolInput.profileId,
    conversationId: input.toolInput.conversationId,
    ownerUserId: input.toolInput.ownerUserId,
    ownerHandoffSourceMessageId: input.toolInput.ownerHandoffSourceMessageId,
    initialSeenMessageIds: input.toolInput.initialSeenMessageIds,
    initialSeenMessageCount: input.toolInput.initialSeenMessageIds.length,
    ambientSurface: input.toolInput.ambientSurface,
    maxDisclosureLabel: input.toolInput.maxDisclosureLabel,
    ...(input.toolInput.threadId ? { threadId: input.toolInput.threadId } : {}),
    ...(input.toolInput.projectId ? { projectId: input.toolInput.projectId } : {}),
    ...(input.toolInput.workflowId ? { workflowId: input.toolInput.workflowId } : {}),
    ...(input.toolInput.chatThreadId ? { chatThreadId: input.toolInput.chatThreadId } : {}),
    ...(input.toolInput.permissionProfileId ? { permissionProfileId: input.toolInput.permissionProfileId } : {}),
    ...(input.toolInput.guardProfileId ? { guardProfileId: input.toolInput.guardProfileId } : {}),
    limit: input.toolInput.limit,
    futureBinding,
    futureUnreadEndpointPath,
    ...(runtimeProvider ? { runtimeProvider } : {}),
    readinessStatus: readiness?.status,
    configured: readiness?.configured,
    bridgeReachable: readiness?.bridgeReachable,
    ...(readiness?.bridgeCapabilities ? { bridgeCapabilities: readiness.bridgeCapabilities } : {}),
    knownAuthProfiles,
    ...(selectedProfile ? { selectedProfile } : {}),
    existingBindings,
    contract: signalRemoteSurfaceBindingContract(),
    unreadWindowContract: signalUnreadWindowContract(futureUnreadEndpointPath),
    gates: {
      ownerHandoffMetadataAccepted: true,
      profileSelected: true,
      conversationSelected: true,
      bridgeReadableProfile,
      metadataOnlyDirectoryReady,
      boundedUnreadContractAvailable,
      bindingLifecycleAvailable: bindingLifecycleEnabled,
      runtimeLifecycleAvailable: runtimeLifecycleEnabled,
      inboundIngestionAvailable: inboundIngestionEnabled,
      outboundReplyAvailable: outboundReplyEnabled,
    },
    blockers,
    warnings: [
      ...(plannedImplementation ? ["Signal runtime, inbound ingestion, and outbound replies remain planned even though owner-approved binding metadata can now be persisted."] : []),
      ...(runtimeLifecycleEnabled ? [] : ["Signal runtime lifecycle remains disabled; applying this binding will not start a Signal bridge."]),
      ...(inboundIngestionEnabled ? [] : ["Signal inbound ingestion remains disabled; applying this binding will not poll, read, or route Signal messages."]),
      ...(outboundReplyEnabled ? [] : ["Signal outbound replies remain disabled; applying this binding will not send Signal messages."]),
      "Do not call ambient_messaging_binding_apply for Signal; generic binding apply remains invalid even when owner handoff metadata is present.",
      "Do not use Telegram owner handoff, Telegram tools, shell, browser automation, Signal Desktop UI, provider CLIs, or arbitrary Signal history reads as a workaround.",
      ...(existingBindings.length ? ["A Signal Remote Ambient Surface binding already exists for this profile/conversation; only one active binding is allowed."] : []),
    ],
    policyNotes: [
      "The only acceptable owner identity source for this typed path is a matched Signal owner handoff result with ownerUserId, ownerHandoffSourceMessageId, and initialSeenMessageIds.",
      "Initial seen message ids must seed future poll dedupe so the setup-code message is never routed as an Ambient command.",
      "This typed path persists owner-approved binding metadata only; inbound polling, projection routing, runtime lifecycle, and replies are separate disabled gates.",
      "Remote Ambient Surface remains an owner control-plane binding, separate from Messaging Connector.",
      ...(descriptor?.privacyNotes ?? []),
      ...(descriptor?.implementation.notes ?? []),
    ],
    nextSteps: [
      canApplyNow
        ? "If the user approves, call ambient_messaging_signal_remote_surface_apply with the same matched owner-handoff metadata to persist the binding record."
        : "Resolve the blockers above before attempting the typed Signal apply.",
      "After typed apply succeeds, call ambient_messaging_list_bindings with providerId=signal-cli and includeInactive=true to verify the binding record.",
      "Do not retry with ambient_messaging_binding_apply or Telegram tools.",
      "A later implementation slice must add typed revoke and inbound polling behind the persisted binding.",
    ],
    safety: {
      startsBridge: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      readsUnreadWindow: false,
      sendsProviderMessages: false,
      mutatesBindings: canApplyNow,
      persistsBinding: canApplyNow,
      runsProviderCli: false,
      inspectsSignalDesktop: false,
      usesTelegramOwnerHandoff: false,
      usesGenericBindingApply: false,
    },
  };
}

export function signalRemoteSurfaceBindingBlockedResult(
  plan: SignalRemoteSurfaceBindingPlan,
): SignalRemoteSurfaceBindingApplyResult {
  return {
    ...plan,
    applyStatus: "blocked",
    approvalRequested: false,
    approvalRecorded: false,
    persisted: false,
    canFeedFutureBindingLifecycle: plan.gates.ownerHandoffMetadataAccepted
      && plan.gates.profileSelected
      && plan.gates.conversationSelected
      && plan.initialSeenMessageIds.includes(plan.ownerHandoffSourceMessageId),
    bindingApplyInputReady: plan.canApplyNow,
    failureMode: "readiness-blocked",
    failureHint: "Signal owner-handoff metadata may have the right shape, but this typed apply is blocked by the readiness gates above. No binding was created, no provider messages were read, and generic binding apply remains invalid for Signal.",
  };
}

export function signalRemoteSurfaceBindingDeniedResult(
  plan: SignalRemoteSurfaceBindingPlan,
): SignalRemoteSurfaceBindingApplyResult {
  return {
    ...plan,
    applyStatus: "denied",
    approvalRequested: true,
    approvalRecorded: false,
    persisted: false,
    canFeedFutureBindingLifecycle: false,
    bindingApplyInputReady: plan.canApplyNow,
    failureMode: "approval-denied",
    failureHint: "The user denied Signal Remote Ambient Surface binding persistence. No binding was created, no provider messages were read, and generic binding apply remains invalid for Signal.",
  };
}

export function signalRemoteSurfaceBindingAppliedResult(
  plan: SignalRemoteSurfaceBindingPlan,
  lifecycle: MessagingBindingLifecycleResult,
): SignalRemoteSurfaceBindingApplyResult {
  return {
    ...plan,
    futureBinding: lifecycle.binding,
    status: "ready",
    previewOnly: false,
    canApplyNow: true,
    applyStatus: "applied",
    approvalRequested: true,
    approvalRecorded: true,
    persisted: lifecycle.persisted,
    canFeedFutureBindingLifecycle: false,
    bindingApplyInputReady: true,
    lifecycle,
    existingBindings: [...plan.existingBindings, lifecycle.binding],
  };
}

export function signalRemoteSurfaceBindingCreateInput(input: SignalRemoteSurfaceBindingInput): MessagingBindingCreateInput {
  return {
    providerId: SIGNAL_PROVIDER_ID,
    authProfileId: input.profileId,
    conversationId: input.conversationId,
    ...(input.threadId ? { threadId: input.threadId } : {}),
    purpose: PURPOSE,
    ownerUserId: input.ownerUserId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.workflowId ? { workflowId: input.workflowId } : {}),
    ...(input.chatThreadId ? { chatThreadId: input.chatThreadId } : {}),
    ambientSurface: input.ambientSurface,
    externalTrustClass: "owner",
    ...(input.permissionProfileId ? { permissionProfileId: input.permissionProfileId } : {}),
    ...(input.guardProfileId ? { guardProfileId: input.guardProfileId } : {}),
    maxDisclosureLabel: input.maxDisclosureLabel,
    metadata: {
      setupTool: "ambient_messaging_signal_remote_surface_apply",
      setupShape: "signal-owner-remote-ambient-surface",
      disclosurePolicy: input.maxDisclosureLabel,
      ownerHandoffSourceMessageId: input.ownerHandoffSourceMessageId,
      initialSeenMessageIds: [...input.initialSeenMessageIds],
      unreadWindowLimit: input.limit,
    },
  };
}

export function buildSignalRemoteSurfaceBindingRevokePlan(input: {
  toolInput: SignalRemoteSurfaceBindingRevokeInput;
  bindings: MessagingBindingListResult;
  descriptor?: MessagingProviderDescriptor;
}): SignalRemoteSurfaceBindingRevokePlan {
  const descriptor = input.descriptor;
  const implementation = descriptor?.implementation;
  const purposeSupported = descriptor?.purposeSupport.remote_ambient_surface === true;
  const bindingLifecycleEnabled = implementation?.bindingLifecycleEnabled === true;
  const targetBinding = input.bindings.bindings.find((binding) => binding.id === input.toolInput.bindingId);
  const matchingBindings = targetBinding ? [targetBinding] : [];
  const blockers: string[] = [];
  if (!purposeSupported) blockers.push("Signal provider does not currently enable remote_ambient_surface purpose support.");
  if (!bindingLifecycleEnabled) blockers.push("Signal binding lifecycle adapter is disabled.");
  if (!targetBinding) {
    blockers.push(`Signal Remote Ambient Surface binding was not found: ${input.toolInput.bindingId}.`);
  } else {
    if (targetBinding.providerId !== SIGNAL_PROVIDER_ID) blockers.push(`Binding ${targetBinding.id} is not a Signal binding.`);
    if (targetBinding.purpose !== PURPOSE) blockers.push(`Binding ${targetBinding.id} is not a Signal Remote Ambient Surface binding.`);
    if (targetBinding.status !== "active") blockers.push(`Binding ${targetBinding.id} is not active; current status is ${targetBinding.status}.`);
  }
  const canApplyNow = blockers.length === 0;

  return {
    providerId: SIGNAL_PROVIDER_ID,
    providerLabel: descriptor?.label ?? SIGNAL_PROVIDER_LABEL,
    action: "revoke",
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    previewOnly: !canApplyNow,
    typedPreviewTool: "ambient_messaging_signal_remote_surface_preview",
    typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
    genericBindingApplyAllowed: false,
    telegramOwnerHandoffAllowed: false,
    providerImplementationStatus: implementation?.status ?? "planned",
    purposeSupported,
    bindingLifecycleEnabled,
    bindingId: input.toolInput.bindingId,
    ...(input.toolInput.reason ? { reason: input.toolInput.reason } : {}),
    ...(targetBinding ? { targetBinding } : {}),
    matchingBindings,
    blockers,
    warnings: [
      "Signal revoke mutates only Ambient binding metadata. It does not start Signal, stop Signal, read Signal messages, poll unread windows, or send replies.",
      "Do not call ambient_messaging_binding_apply for Signal; generic binding apply remains invalid even for revocation.",
      ...(targetBinding?.status === "active" ? ["Revoking this binding will prevent future Signal Remote Ambient Surface routing for the bound conversation until a new owner handoff creates another binding."] : []),
    ],
    policyNotes: [
      "Signal Remote Ambient Surface revoke is provider-specific so it cannot bypass the owner-handoff metadata and dedupe audit fields used during create.",
      "Revoked binding records preserve setup metadata for audit/debugging and should be listed with includeInactive=true.",
      "Provider lifecycle, unread polling, and outbound replies remain separate disabled gates.",
      ...(descriptor?.privacyNotes ?? []),
      ...(descriptor?.implementation.notes ?? []),
    ],
    nextSteps: [
      canApplyNow
        ? "If the user approves, call ambient_messaging_signal_remote_surface_apply with action=revoke and this bindingId."
        : "Resolve the blockers above before attempting the typed Signal revoke.",
      "After typed revoke succeeds, call ambient_messaging_list_bindings with providerId=signal-cli and includeInactive=true to verify status=revoked.",
      "Do not retry with ambient_messaging_binding_apply or Telegram tools.",
    ],
    safety: {
      startsBridge: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      readsUnreadWindow: false,
      sendsProviderMessages: false,
      mutatesBindings: canApplyNow,
      persistsBinding: canApplyNow,
      runsProviderCli: false,
      inspectsSignalDesktop: false,
      usesTelegramOwnerHandoff: false,
      usesGenericBindingApply: false,
    },
  };
}

export function signalRemoteSurfaceBindingRevokeInputForStore(input: SignalRemoteSurfaceBindingRevokeInput): MessagingBindingRevokeInput {
  return {
    bindingId: input.bindingId,
    reason: input.reason ?? "revoked through Signal Remote Ambient Surface typed lifecycle",
  };
}

export function signalRemoteSurfaceBindingRevokeBlockedResult(
  plan: SignalRemoteSurfaceBindingRevokePlan,
): SignalRemoteSurfaceBindingRevokeResult {
  return {
    ...plan,
    applyStatus: "blocked",
    approvalRequested: false,
    approvalRecorded: false,
    persisted: false,
    failureMode: "readiness-blocked",
    failureHint: "Signal typed revoke is blocked by the lifecycle gates above. No binding metadata was changed, no provider messages were read, and generic binding apply remains invalid for Signal.",
  };
}

export function signalRemoteSurfaceBindingRevokeDeniedResult(
  plan: SignalRemoteSurfaceBindingRevokePlan,
): SignalRemoteSurfaceBindingRevokeResult {
  return {
    ...plan,
    applyStatus: "denied",
    approvalRequested: true,
    approvalRecorded: false,
    persisted: false,
    failureMode: "approval-denied",
    failureHint: "The user denied Signal Remote Ambient Surface binding revoke. No binding metadata was changed, no provider messages were read, and generic binding apply remains invalid for Signal.",
  };
}

export function signalRemoteSurfaceBindingRevokedResult(
  plan: SignalRemoteSurfaceBindingRevokePlan,
  lifecycle: MessagingBindingLifecycleResult,
): SignalRemoteSurfaceBindingRevokeResult {
  return {
    ...plan,
    targetBinding: lifecycle.binding,
    matchingBindings: [lifecycle.binding],
    status: "ready",
    previewOnly: false,
    canApplyNow: true,
    applyStatus: "applied",
    approvalRequested: true,
    approvalRecorded: true,
    persisted: lifecycle.persisted,
    lifecycle,
  };
}

export function signalRemoteSurfaceBindingRevokeText(
  value: SignalRemoteSurfaceBindingRevokePlan | SignalRemoteSurfaceBindingRevokeResult,
): string {
  const applied = "applyStatus" in value;
  const title = applied
    ? `Signal Remote Ambient Surface binding revoke ${value.applyStatus}`
    : `Signal Remote Ambient Surface binding revoke preview ${value.status}`;
  return [
    title,
    `Provider: ${value.providerLabel} (${value.providerId})`,
    `Action: ${value.action}`,
    applied ? `Apply status: ${value.applyStatus}` : undefined,
    applied ? `Approval requested: ${value.approvalRequested ? "yes" : "no"}` : undefined,
    applied ? `Approval recorded: ${value.approvalRecorded ? "yes" : "no"}` : undefined,
    applied ? `Persisted: ${value.persisted ? "yes" : "no"}` : undefined,
    `Preview only: ${value.previewOnly ? "yes" : "no"}`,
    `Can apply now: ${value.canApplyNow ? "yes" : "no"}`,
    `Typed preview tool: ${value.typedPreviewTool}`,
    `Typed apply tool: ${value.typedApplyTool}`,
    `Generic binding apply allowed: ${value.genericBindingApplyAllowed ? "yes" : "no"}`,
    `Telegram owner handoff allowed: ${value.telegramOwnerHandoffAllowed ? "yes" : "no"}`,
    `Binding: ${value.bindingId}`,
    value.reason ? `Reason: ${value.reason}` : undefined,
    value.targetBinding ? `Target status: ${value.targetBinding.status}` : undefined,
    value.targetBinding ? `Profile: ${value.targetBinding.authProfileId}` : undefined,
    value.targetBinding ? `Conversation: ${value.targetBinding.conversationId}` : undefined,
    value.targetBinding?.ownerUserId ? `Owner user: ${value.targetBinding.ownerUserId}` : undefined,
    value.targetBinding?.ambientSurface ? `Ambient surface: ${value.targetBinding.ambientSurface}` : undefined,
    value.targetBinding?.maxDisclosureLabel ? `Max disclosure: ${value.targetBinding.maxDisclosureLabel}` : undefined,
    applied && value.lifecycle ? `Lifecycle state path: ${value.lifecycle.statePath}` : undefined,
    applied && value.failureMode ? `Failure mode: ${value.failureMode}` : undefined,
    applied && value.failureHint ? `Failure hint: ${value.failureHint}` : undefined,
    "",
    "Safety:",
    "- Starts bridge: no",
    "- Reads Signal messages: no",
    "- Reads Signal history: no",
    "- Reads unread window now: no",
    "- Sends Signal messages: no",
    `- Mutates bindings: ${value.safety.mutatesBindings ? "yes" : "no"}`,
    `- Persists binding: ${value.safety.persistsBinding ? "yes" : "no"}`,
    "- Runs provider CLI: no",
    "- Inspects Signal Desktop: no",
    "- Uses Telegram owner handoff: no",
    "- Uses generic binding apply: no",
    "",
    `Matching Signal bindings: ${value.matchingBindings.length}`,
    ...value.matchingBindings.map((binding) => `- ${binding.id}: status=${binding.status}, owner=${binding.ownerUserId ?? "missing"}`),
    "",
    "Blockers:",
    ...(value.blockers.length ? value.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Warnings:",
    ...value.warnings.map((warning) => `- ${warning}`),
    "",
    "Policy notes:",
    ...value.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...value.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function signalRemoteSurfaceBindingText(
  value: SignalRemoteSurfaceBindingPlan | SignalRemoteSurfaceBindingApplyResult,
): string {
  const applied = "applyStatus" in value;
  const title = applied
    ? `Signal Remote Ambient Surface binding ${value.applyStatus}`
    : `Signal Remote Ambient Surface binding preview ${value.status}`;
  return [
    title,
    `Provider: ${value.providerLabel} (${value.providerId})`,
    `Action: ${value.action}`,
    applied ? `Apply status: ${value.applyStatus}` : undefined,
    applied ? `Approval requested: ${value.approvalRequested ? "yes" : "no"}` : undefined,
    applied ? `Approval recorded: ${value.approvalRecorded ? "yes" : "no"}` : undefined,
    applied ? `Persisted: ${value.persisted ? "yes" : "no"}` : undefined,
    `Preview only: ${value.previewOnly ? "yes" : "no"}`,
    `Can apply now: ${value.canApplyNow ? "yes" : "no"}`,
    `Typed preview tool: ${value.typedPreviewTool}`,
    `Typed apply tool: ${value.typedApplyTool}`,
    `Generic binding apply allowed: ${value.genericBindingApplyAllowed ? "yes" : "no"}`,
    `Telegram owner handoff allowed: ${value.telegramOwnerHandoffAllowed ? "yes" : "no"}`,
    `Future binding: ${value.futureBinding.id}`,
    `Profile: ${value.profileId}`,
    `Conversation: ${value.conversationId}`,
    `Owner user: ${value.ownerUserId}`,
    `Owner handoff source message: ${value.ownerHandoffSourceMessageId}`,
    `Initial seen message ids: ${value.initialSeenMessageCount}`,
    `Ambient surface: ${value.ambientSurface}`,
    `Max disclosure: ${value.maxDisclosureLabel}`,
    value.futureUnreadEndpointPath ? `Future unread endpoint path: ${value.futureUnreadEndpointPath}` : "Future unread endpoint path: unavailable",
    applied ? `Can feed future binding lifecycle: ${value.canFeedFutureBindingLifecycle ? "yes" : "no"}` : undefined,
    applied ? `Binding apply input ready: ${value.bindingApplyInputReady ? "yes" : "no"}` : undefined,
    applied && value.lifecycle ? `Lifecycle state path: ${value.lifecycle.statePath}` : undefined,
    applied && value.failureMode ? `Failure mode: ${value.failureMode}` : undefined,
    applied && value.failureHint ? `Failure hint: ${value.failureHint}` : undefined,
    "",
    "Readiness gates:",
    `- Owner handoff metadata accepted: ${value.gates.ownerHandoffMetadataAccepted ? "yes" : "no"}`,
    `- Profile selected: ${value.gates.profileSelected ? "yes" : "no"}`,
    `- Conversation selected: ${value.gates.conversationSelected ? "yes" : "no"}`,
    `- Bridge-readable profile: ${value.gates.bridgeReadableProfile ? "yes" : "no"}`,
    `- Metadata-only directory ready: ${value.gates.metadataOnlyDirectoryReady ? "yes" : "no"}`,
    `- Bounded unread contract available: ${value.gates.boundedUnreadContractAvailable ? "yes" : "no"}`,
    `- Binding lifecycle adapter: ${value.gates.bindingLifecycleAvailable ? "enabled" : "disabled"}`,
    `- Runtime lifecycle adapter: ${value.gates.runtimeLifecycleAvailable ? "enabled" : "disabled"}`,
    `- Inbound ingestion adapter: ${value.gates.inboundIngestionAvailable ? "enabled" : "disabled"}`,
    `- Outbound reply adapter: ${value.gates.outboundReplyAvailable ? "enabled" : "disabled"}`,
    "",
    "Safety:",
    "- Starts bridge: no",
    "- Reads Signal messages: no",
    "- Reads Signal history: no",
    "- Reads unread window now: no",
    "- Sends Signal messages: no",
    `- Mutates bindings: ${value.safety.mutatesBindings ? "yes" : "no"}`,
    `- Persists binding: ${value.safety.persistsBinding ? "yes" : "no"}`,
    "- Runs provider CLI: no",
    "- Inspects Signal Desktop: no",
    "- Uses Telegram owner handoff: no",
    "- Uses generic binding apply: no",
    "",
    value.readinessStatus ? `Readiness: ${value.readinessStatus}` : "Readiness: not refreshed",
    typeof value.configured === "boolean" ? `Configured: ${value.configured ? "yes" : "no"}` : undefined,
    typeof value.bridgeReachable === "boolean" ? `Bridge reachable: ${value.bridgeReachable ? "yes" : "no"}` : undefined,
    value.bridgeCapabilities ? `Bridge capabilities: profileStatus=${value.bridgeCapabilities.profileStatus ? "yes" : "no"}, metadataOnlyConversationDirectory=${value.bridgeCapabilities.metadataOnlyConversationDirectory ? "yes" : "no"}, boundedUnreadWindow=${value.bridgeCapabilities.boundedUnreadWindow ? "yes" : "no"}, approvedReplySend=${value.bridgeCapabilities.approvedReplySend ? "yes" : "no"}` : undefined,
    "",
    `Existing matching Signal bindings: ${value.existingBindings.length}`,
    ...value.existingBindings.map((binding) => `- ${binding.id}: status=${binding.status}, owner=${binding.ownerUserId ?? "missing"}`),
    "",
    `Binding contract: ${value.contract.kind}`,
    `Required owner handoff fields: ${value.contract.requiredOwnerHandoffFields.join(", ")}`,
    `Future persisted metadata fields: ${value.contract.futurePersistedMetadataFields.join(", ")}`,
    `Unread-window contract: ${value.unreadWindowContract.kind}`,
    "",
    "Blockers:",
    ...value.blockers.map((blocker) => `- ${blocker}`),
    "",
    "Warnings:",
    ...value.warnings.map((warning) => `- ${warning}`),
    "",
    "Policy notes:",
    ...value.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...value.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

function signalRemoteSurfaceBindingContract(): SignalRemoteSurfaceBindingContract {
  return {
    kind: "signal-remote-surface-binding-v0",
    providerId: SIGNAL_PROVIDER_ID,
    requiredOwnerHandoffFields: ["ownerUserId", "ownerHandoffSourceMessageId", "initialSeenMessageIds"],
    requiredBindingFields: ["profileId", "conversationId", "ambientSurface", "maxDisclosureLabel"],
    futurePersistedMetadataFields: ["setupTool", "setupShape", "ownerHandoffSourceMessageId", "initialSeenMessageIds", "disclosurePolicy"],
    genericBindingApplyAllowed: false,
    telegramOwnerHandoffAllowed: false,
  };
}

function futureBindingDescriptor(input: SignalRemoteSurfaceBindingInput, now: Date): MessagingBindingDescriptor {
  const timestamp = now.toISOString();
  return {
    id: stableBindingId(input.profileId, input.conversationId, input.threadId),
    providerId: SIGNAL_PROVIDER_ID,
    authProfileId: input.profileId,
    conversationId: input.conversationId,
    ...(input.threadId ? { threadId: input.threadId } : {}),
    purpose: PURPOSE,
    status: "active",
    ownerUserId: input.ownerUserId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.workflowId ? { workflowId: input.workflowId } : {}),
    ...(input.chatThreadId ? { chatThreadId: input.chatThreadId } : {}),
    ambientSurface: input.ambientSurface,
    externalTrustClass: "owner",
    ...(input.permissionProfileId ? { permissionProfileId: input.permissionProfileId } : {}),
    ...(input.guardProfileId ? { guardProfileId: input.guardProfileId } : {}),
    maxDisclosureLabel: input.maxDisclosureLabel,
    headlessSafe: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: {
      setupTool: "ambient_messaging_signal_remote_surface_apply",
      setupShape: "signal-owner-remote-ambient-surface",
      disclosurePolicy: input.maxDisclosureLabel,
      ownerHandoffSourceMessageId: input.ownerHandoffSourceMessageId,
      initialSeenMessageIds: [...input.initialSeenMessageIds],
    },
  };
}

function profileSummary(session: MessagingGatewayProviderSessionReadiness): SignalRemoteSurfaceProfileSummary {
  return {
    profileId: session.profileId,
    metadataReadable: session.metadataReadable,
    signalCliConfigDirPresent: session.signalCliConfigDirPresent === true,
    accountIdentifierPresent: session.accountIdentifierPresent === true,
    linkedDevicePresent: session.linkedDevicePresent === true,
    registrationMetadataPresent: session.registrationMetadataPresent === true,
    bridgeSessionReadable: session.bridgeSessionReadable === true,
  };
}

function stableBindingId(profileId: string, conversationId: string, threadId?: string): string {
  const digest = createHash("sha256")
    .update([SIGNAL_PROVIDER_ID, PURPOSE, profileId, conversationId, threadId?.trim() ?? ""].join("\0"))
    .digest("hex")
    .slice(0, 16);
  return `${SIGNAL_PROVIDER_ID}-${PURPOSE.replaceAll("_", "-")}-${digest}`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    values.push(trimmed);
    if (values.length >= MAX_INITIAL_SEEN_IDS) break;
  }
  return values;
}

function isMessagingAmbientSurface(value: string): value is MessagingAmbientSurface {
  return value === "chat"
    || value === "projects"
    || value === "workflow_agents"
    || value === "settings"
    || value === "notifications";
}
