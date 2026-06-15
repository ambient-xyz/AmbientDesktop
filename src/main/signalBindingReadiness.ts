import type {
  MessagingAmbientSurface,
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayProviderSessionReadiness,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../shared/messagingGateway";
import { signalBridgeEndpointPaths } from "./signalBridgeContract";
import { signalUnreadWindowContract, type SignalUnreadWindowContract } from "./signalUnreadWindow";

const SIGNAL_PROVIDER_ID = "signal-cli";
const SIGNAL_PROVIDER_LABEL = "Signal";
const MAX_UNREAD_LIMIT = 25;

type RuntimeProvider = MessagingGatewayRuntimeStatus["providers"][number];

export interface SignalBindingReadinessInput {
  providerId: "signal-cli";
  profileId?: string;
  conversationId?: string;
  ownerUserId?: string;
  ambientSurface?: MessagingAmbientSurface;
  maxDisclosureLabel?: string;
  limit: number;
}

export interface SignalBindingReadinessProfileSummary {
  profileId: string;
  metadataReadable: boolean;
  signalCliConfigDirPresent: boolean;
  accountIdentifierPresent: boolean;
  linkedDevicePresent: boolean;
  registrationMetadataPresent: boolean;
  bridgeSessionReadable: boolean;
}

export interface SignalBindingReadinessBindingSummary {
  bindingId: string;
  status: MessagingBindingDescriptor["status"];
  authProfileId: string;
  conversationId: string;
  ownerUserId?: string;
  ambientSurface?: MessagingAmbientSurface;
  maxDisclosureLabel?: string;
}

export interface SignalBindingReadinessPreview {
  providerId: "signal-cli";
  providerLabel: string;
  status: "blocked";
  canApplyNow: false;
  previewOnly: true;
  typedPreviewTool: "ambient_messaging_signal_binding_readiness_preview";
  typedApplyTool: "ambient_messaging_signal_remote_surface_apply";
  genericBindingApplyAllowed: false;
  telegramOwnerHandoffAllowed: false;
  implementationStatus: MessagingProviderDescriptor["implementation"]["status"] | "planned";
  purposeSupported: boolean;
  bindingLifecycleEnabled: boolean;
  runtimeLifecycleEnabled: boolean;
  inboundIngestionEnabled: boolean;
  outboundReplyEnabled: boolean;
  profileId?: string;
  conversationId?: string;
  ownerUserId?: string;
  ambientSurface?: MessagingAmbientSurface;
  maxDisclosureLabel?: string;
  limit: number;
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
  knownAuthProfiles: SignalBindingReadinessProfileSummary[];
  selectedProfile?: SignalBindingReadinessProfileSummary;
  existingBindings: SignalBindingReadinessBindingSummary[];
  gates: {
    directoryConversationSelected: boolean;
    bridgeReadableProfile: boolean;
    metadataOnlyDirectoryReady: boolean;
    boundedUnreadContractAvailable: boolean;
    ownerAuthenticationAvailable: false;
    bindingLifecycleAvailable: boolean;
    runtimeLifecycleAvailable: boolean;
    inboundIngestionAvailable: boolean;
    outboundReplyAvailable: boolean;
  };
  unreadWindowContract: SignalUnreadWindowContract;
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
    mutatesBindings: false;
    runsProviderCli: false;
    inspectsSignalDesktop: false;
    usesTelegramOwnerHandoff: false;
  };
}

export function signalBindingReadinessInput(params: unknown): SignalBindingReadinessInput {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId) ?? SIGNAL_PROVIDER_ID;
  if (providerId !== SIGNAL_PROVIDER_ID) {
    throw new Error(`providerId must be ${SIGNAL_PROVIDER_ID} when supplied.`);
  }
  const ambientSurface = optionalString(raw?.ambientSurface);
  if (ambientSurface && !isMessagingAmbientSurface(ambientSurface)) {
    throw new Error("ambientSurface must be chat, projects, workflow_agents, settings, or notifications when supplied.");
  }
  const parsedAmbientSurface = ambientSurface && isMessagingAmbientSurface(ambientSurface) ? ambientSurface : undefined;
  const limitValue = typeof raw?.limit === "number" && Number.isFinite(raw.limit)
    ? Math.floor(raw.limit)
    : 10;
  return {
    providerId: SIGNAL_PROVIDER_ID,
    profileId: optionalString(raw?.profileId) ?? optionalString(raw?.authProfileId),
    conversationId: optionalString(raw?.conversationId),
    ownerUserId: optionalString(raw?.ownerUserId),
    ambientSurface: parsedAmbientSurface,
    maxDisclosureLabel: optionalString(raw?.maxDisclosureLabel),
    limit: Math.max(1, Math.min(MAX_UNREAD_LIMIT, limitValue)),
  };
}

export function buildSignalBindingReadinessPreview(input: {
  toolInput: SignalBindingReadinessInput;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  descriptor?: MessagingProviderDescriptor;
}): SignalBindingReadinessPreview {
  const descriptor = input.descriptor;
  const runtimeProvider = input.runtimeStatus?.providers.find((provider) => provider.providerId === SIGNAL_PROVIDER_ID);
  const readiness = runtimeProvider?.readiness;
  const knownAuthProfiles = (readiness?.sessions ?? [])
    .filter((session) => input.toolInput.profileId ? session.profileId === input.toolInput.profileId : true)
    .map(profileSummary);
  const selectedProfile = input.toolInput.profileId
    ? knownAuthProfiles.find((profile) => profile.profileId === input.toolInput.profileId)
    : singleBridgeReadableProfile(knownAuthProfiles);
  const profileId = input.toolInput.profileId ?? selectedProfile?.profileId;
  const conversationId = input.toolInput.conversationId;
  const futureUnreadEndpointPath = profileId && conversationId
    ? signalBridgeEndpointPaths(profileId, conversationId).unreadWindow.replace(":limit", String(input.toolInput.limit))
    : undefined;

  const implementation = descriptor?.implementation;
  const purposeSupported = descriptor?.purposeSupport.remote_ambient_surface === true;
  const bindingLifecycleEnabled = implementation?.bindingLifecycleEnabled === true;
  const runtimeLifecycleEnabled = implementation?.runtimeLifecycleEnabled === true;
  const inboundIngestionEnabled = implementation?.inboundIngestionEnabled === true;
  const outboundReplyEnabled = implementation?.outboundReplyEnabled === true;
  const bridgeReadableProfile = selectedProfile?.metadataReadable === true && selectedProfile.bridgeSessionReadable === true;
  const metadataOnlyDirectoryReady = readiness?.bridgeReachable === true
    && readiness.bridgeCapabilities?.profileStatus === true
    && readiness.bridgeCapabilities.metadataOnlyConversationDirectory === true
    && bridgeReadableProfile;
  const boundedUnreadContractAvailable = readiness?.bridgeReachable === true
    && readiness.bridgeCapabilities?.profileStatus === true
    && readiness.bridgeCapabilities.boundedUnreadWindow === true
    && bridgeReadableProfile;
  const existingBindings = input.bindings.bindings
    .filter((binding) => binding.providerId === SIGNAL_PROVIDER_ID)
    .filter((binding) => binding.purpose === "remote_ambient_surface")
    .filter((binding) => profileId ? binding.authProfileId === profileId : true)
    .filter((binding) => conversationId ? binding.conversationId === conversationId : true)
    .map(bindingSummary);

  const blockers = [
    "Signal binding readiness is preview-only; create binding metadata only through ambient_messaging_signal_remote_surface_apply after matched owner handoff metadata.",
  ];
  if ((descriptor?.implementation.status ?? "planned") !== "available") blockers.push("Signal provider implementation is planned.");
  if (!purposeSupported) blockers.push("Signal provider does not currently enable remote_ambient_surface purpose support.");
  if (!bindingLifecycleEnabled) blockers.push("Signal binding lifecycle adapter is disabled.");
  if (!runtimeLifecycleEnabled) blockers.push("Signal runtime lifecycle adapter is disabled.");
  if (!inboundIngestionEnabled) blockers.push("Signal inbound ingestion adapter is disabled.");
  if (!outboundReplyEnabled) blockers.push("Signal outbound reply adapter is disabled.");
  if (!profileId) blockers.push("Signal binding readiness requires a selected bridge-readable profileId from the directory preview/apply path.");
  if (!conversationId) blockers.push("Signal binding readiness requires a selected metadata-only directory conversationId.");
  if (!input.toolInput.ownerUserId) blockers.push("Signal binding readiness still needs an owner sender id from a matched Signal owner handoff.");
  blockers.push("Signal owner authentication requires matched owner-handoff metadata; do not treat ownerUserId alone, linked account metadata, or Telegram owner handoff as verification.");
  if (!input.toolInput.ambientSurface) blockers.push("Signal binding readiness requires the target Ambient surface.");
  if (!input.toolInput.maxDisclosureLabel) blockers.push("Signal binding readiness requires the user-approved max disclosure label.");
  if (!runtimeProvider) {
    blockers.push("Signal runtime status is unavailable.");
  }
  if (!readiness) {
    blockers.push("Signal readiness has not been refreshed.");
  } else {
    if (!readiness.bridgeReachable) blockers.push("Signal bridge root is not reachable.");
    if (!readiness.bridgeCapabilities?.profileStatus) blockers.push("Signal bridge root did not advertise profileStatus.");
    if (!readiness.bridgeCapabilities?.metadataOnlyConversationDirectory) blockers.push("Signal bridge root did not advertise metadataOnlyConversationDirectory.");
    if (!readiness.bridgeCapabilities?.boundedUnreadWindow) blockers.push("Signal bridge root did not advertise boundedUnreadWindow.");
    if (!readiness.configured) blockers.push("No reviewed bridge-readable Signal profile is configured.");
  }
  if (profileId && !selectedProfile) {
    blockers.push(`Signal profile was not found in readiness metadata: ${profileId}.`);
  }
  if (selectedProfile && !bridgeReadableProfile) {
    blockers.push(`Signal profile ${selectedProfile.profileId} is not bridge-readable.`);
  }

  return {
    providerId: SIGNAL_PROVIDER_ID,
    providerLabel: descriptor?.label ?? SIGNAL_PROVIDER_LABEL,
    status: "blocked",
    canApplyNow: false,
    previewOnly: true,
    typedPreviewTool: "ambient_messaging_signal_binding_readiness_preview",
    typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
    genericBindingApplyAllowed: false,
    telegramOwnerHandoffAllowed: false,
    implementationStatus: implementation?.status ?? "planned",
    purposeSupported,
    bindingLifecycleEnabled,
    runtimeLifecycleEnabled,
    inboundIngestionEnabled,
    outboundReplyEnabled,
    ...(profileId ? { profileId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(input.toolInput.ownerUserId ? { ownerUserId: input.toolInput.ownerUserId } : {}),
    ...(input.toolInput.ambientSurface ? { ambientSurface: input.toolInput.ambientSurface } : {}),
    ...(input.toolInput.maxDisclosureLabel ? { maxDisclosureLabel: input.toolInput.maxDisclosureLabel } : {}),
    limit: input.toolInput.limit,
    ...(futureUnreadEndpointPath ? { futureUnreadEndpointPath } : {}),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    readinessStatus: readiness?.status,
    configured: readiness?.configured,
    bridgeReachable: readiness?.bridgeReachable,
    ...(readiness?.bridgeCapabilities ? { bridgeCapabilities: readiness.bridgeCapabilities } : {}),
    knownAuthProfiles,
    ...(selectedProfile ? { selectedProfile } : {}),
    existingBindings,
    gates: {
      directoryConversationSelected: Boolean(profileId && conversationId),
      bridgeReadableProfile,
      metadataOnlyDirectoryReady,
      boundedUnreadContractAvailable,
      ownerAuthenticationAvailable: false,
      bindingLifecycleAvailable: bindingLifecycleEnabled,
      runtimeLifecycleAvailable: runtimeLifecycleEnabled,
      inboundIngestionAvailable: inboundIngestionEnabled,
      outboundReplyAvailable: outboundReplyEnabled,
    },
    unreadWindowContract: signalUnreadWindowContract(futureUnreadEndpointPath),
    blockers,
    warnings: [
      "This preview must not be treated as approval to create a generic Signal binding.",
      "Do not use ambient_messaging_binding_apply for Signal. Use the Signal-specific remote surface preview/apply path only after a matched Signal owner handoff result.",
      "Do not use Telegram owner handoff, Telegram tools, shell, browser automation, Signal Desktop UI, or signal-cli as a workaround.",
      "Existing Signal directory metadata is only routing metadata; it is not an owner-authenticated control-plane grant.",
      ...(existingBindings.length
        ? ["A Signal binding record matching this scope already exists, but Signal inbound/poll/reply adapters are still disabled."]
        : []),
    ],
    policyNotes: [
      "A valid Signal Remote Ambient Surface binding needs a reviewed directory conversation, a bridge-readable profile, Signal-specific owner authentication, bounded unread polling, inbound projection routing, and approved reply handling.",
      "The bounded unread-window contract may read message text only inside the future adapter and must return no raw provider message body to Pi.",
      "Owner identity cannot be inferred from a linked Signal account or from user-supplied text in chat.",
      "Generic binding metadata persistence is intentionally invalid for Signal because it would bypass provider-specific owner handoff and initial seen-message dedupe state.",
      "Remote Ambient Surface remains separate from Messaging Connector and must stay owner-scoped.",
      ...(descriptor?.privacyNotes ?? []),
      ...(descriptor?.implementation.notes ?? []),
    ],
    nextSteps: [
      "Use ambient_messaging_signal_owner_handoff_preview/apply to produce matched ownerUserId, sourceMessageId, and initialSeenMessageIds.",
      "After a matched owner handoff, use ambient_messaging_signal_remote_surface_preview/apply to validate and persist the Signal-specific binding metadata with explicit approval.",
      "Then implement bounded unread apply/periodic polling and prove raw Signal message bodies never appear in Pi-visible tool text/details.",
      "Only after inbound routing works should approved Signal reply send be added as a separate adapter.",
    ],
    safety: {
      startsBridge: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      readsUnreadWindow: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
      runsProviderCli: false,
      inspectsSignalDesktop: false,
      usesTelegramOwnerHandoff: false,
    },
  };
}

export function signalBindingReadinessPreviewText(preview: SignalBindingReadinessPreview): string {
  return [
    `Signal Remote Ambient Surface binding readiness preview: ${preview.status}`,
    `Provider: ${preview.providerLabel} (${preview.providerId})`,
    `Implementation: ${preview.implementationStatus}`,
    `Preview only: ${preview.previewOnly ? "yes" : "no"}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Typed preview tool: ${preview.typedPreviewTool}`,
    `Typed apply tool: ${preview.typedApplyTool}`,
    `Generic binding apply allowed: ${preview.genericBindingApplyAllowed ? "yes" : "no"}`,
    `Telegram owner handoff allowed: ${preview.telegramOwnerHandoffAllowed ? "yes" : "no"}`,
    preview.profileId ? `Profile: ${preview.profileId}` : "Profile: missing",
    preview.conversationId ? `Conversation: ${preview.conversationId}` : "Conversation: missing",
    preview.ownerUserId ? `Owner user id: ${preview.ownerUserId} (not yet authenticated by Signal-specific handoff)` : "Owner user id: missing",
    preview.ambientSurface ? `Ambient surface: ${preview.ambientSurface}` : "Ambient surface: missing",
    preview.maxDisclosureLabel ? `Max disclosure: ${preview.maxDisclosureLabel}` : "Max disclosure: missing",
    `Unread limit: ${preview.limit}`,
    preview.futureUnreadEndpointPath ? `Future unread endpoint path: ${preview.futureUnreadEndpointPath}` : "Future unread endpoint path: unavailable",
    "",
    "Readiness gates:",
    `- Selected directory conversation: ${preview.gates.directoryConversationSelected ? "yes" : "no"}`,
    `- Bridge-readable profile: ${preview.gates.bridgeReadableProfile ? "yes" : "no"}`,
    `- Metadata-only directory ready: ${preview.gates.metadataOnlyDirectoryReady ? "yes" : "no"}`,
    `- Bounded unread contract available: ${preview.gates.boundedUnreadContractAvailable ? "yes" : "no"}`,
    `- Owner authentication: ${preview.gates.ownerAuthenticationAvailable ? "yes" : "missing"}`,
    `- Binding lifecycle adapter: ${preview.gates.bindingLifecycleAvailable ? "enabled" : "disabled"}`,
    `- Runtime lifecycle adapter: ${preview.gates.runtimeLifecycleAvailable ? "enabled" : "disabled"}`,
    `- Inbound ingestion adapter: ${preview.gates.inboundIngestionAvailable ? "enabled" : "disabled"}`,
    `- Outbound reply adapter: ${preview.gates.outboundReplyAvailable ? "enabled" : "disabled"}`,
    "",
    "Safety:",
    "- Starts bridge: no",
    "- Runs provider CLI: no",
    "- Inspects Signal Desktop: no",
    "- Reads Signal messages: no",
    "- Reads Signal history: no",
    "- Reads unread window now: no",
    "- Sends Signal messages: no",
    "- Mutates bindings: no",
    "- Uses Telegram owner handoff: no",
    "",
    preview.readinessStatus ? `Readiness: ${preview.readinessStatus}` : "Readiness: not refreshed",
    typeof preview.configured === "boolean" ? `Configured: ${preview.configured ? "yes" : "no"}` : undefined,
    typeof preview.bridgeReachable === "boolean" ? `Bridge reachable: ${preview.bridgeReachable ? "yes" : "no"}` : undefined,
    preview.bridgeCapabilities ? `Bridge capabilities: profileStatus=${preview.bridgeCapabilities.profileStatus ? "yes" : "no"}, metadataOnlyConversationDirectory=${preview.bridgeCapabilities.metadataOnlyConversationDirectory ? "yes" : "no"}, boundedUnreadWindow=${preview.bridgeCapabilities.boundedUnreadWindow ? "yes" : "no"}, approvedReplySend=${preview.bridgeCapabilities.approvedReplySend ? "yes" : "no"}` : undefined,
    "",
    `Known auth profiles: ${preview.knownAuthProfiles.length}`,
    ...preview.knownAuthProfiles.map((profile) => `- ${profile.profileId}: metadata=${profile.metadataReadable ? "readable" : "unreadable"}, signalCliConfigDir=${profile.signalCliConfigDirPresent ? "present" : "missing"}, account=${profile.accountIdentifierPresent ? "present" : "missing"}, linked=${profile.linkedDevicePresent ? "present" : "missing"}, registration=${profile.registrationMetadataPresent ? "present" : "missing"}, bridgeReadable=${profile.bridgeSessionReadable ? "yes" : "no"}`),
    "",
    `Existing matching Signal bindings: ${preview.existingBindings.length}`,
    ...preview.existingBindings.map((binding) => `- ${binding.bindingId}: status=${binding.status}, profile=${binding.authProfileId}, conversation=${binding.conversationId}, owner=${binding.ownerUserId ?? "missing"}`),
    "",
    `Unread-window contract: ${preview.unreadWindowContract.kind}`,
    `Required unread scope fields: ${preview.unreadWindowContract.requiredScopeFields.join(", ")}`,
    `Unread bridge internal fields: ${preview.unreadWindowContract.bridgeInternalMessageFields.join(", ")}`,
    `Unread Pi-visible fields: ${preview.unreadWindowContract.piVisibleMessageFields.join(", ")}`,
    `Unread forbidden Pi-visible fields: ${preview.unreadWindowContract.forbiddenPiVisibleFields.join(", ")}`,
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

function profileSummary(session: MessagingGatewayProviderSessionReadiness): SignalBindingReadinessProfileSummary {
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

function singleBridgeReadableProfile(profiles: SignalBindingReadinessProfileSummary[]): SignalBindingReadinessProfileSummary | undefined {
  const usable = profiles.filter((profile) => profile.metadataReadable && profile.bridgeSessionReadable);
  return usable.length === 1 ? usable[0] : undefined;
}

function bindingSummary(binding: MessagingBindingDescriptor): SignalBindingReadinessBindingSummary {
  return {
    bindingId: binding.id,
    status: binding.status,
    authProfileId: binding.authProfileId,
    conversationId: binding.conversationId,
    ...(binding.ownerUserId ? { ownerUserId: binding.ownerUserId } : {}),
    ...(binding.ambientSurface ? { ambientSurface: binding.ambientSurface } : {}),
    ...(binding.maxDisclosureLabel ? { maxDisclosureLabel: binding.maxDisclosureLabel } : {}),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isMessagingAmbientSurface(value: string): value is MessagingAmbientSurface {
  return value === "chat"
    || value === "projects"
    || value === "workflow_agents"
    || value === "settings"
    || value === "notifications";
}
