import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayProviderSessionReadiness,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../shared/messagingGateway";
import {
  signalBridgeEndpointPaths,
  validateSignalBridgeOwnerHandoffEnvelope,
  type SignalBridgeOwnerHandoffStatus,
} from "./signalBridgeContract";

const SIGNAL_PROVIDER_ID = "signal-cli";
const SIGNAL_PROVIDER_LABEL = "Signal";
const DEFAULT_BRIDGE_PORT = "8092";
const MAX_HANDOFF_LIMIT = 25;
const MIN_SETUP_CODE_CHARS = 6;
const MAX_SETUP_CODE_CHARS = 120;
const FAKE_BRIDGE_APPLY_FLAG = "AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY";

type RuntimeProvider = MessagingGatewayRuntimeStatus["providers"][number];
type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface SignalOwnerHandoffInput {
  providerId: "signal-cli";
  profileId?: string;
  conversationId?: string;
  setupCode?: string;
  limit: number;
}

export interface SignalOwnerHandoffProfileSummary {
  profileId: string;
  metadataReadable: boolean;
  signalCliConfigDirPresent: boolean;
  accountIdentifierPresent: boolean;
  linkedDevicePresent: boolean;
  registrationMetadataPresent: boolean;
  bridgeSessionReadable: boolean;
}

export interface SignalOwnerHandoffExistingBindingSummary {
  bindingId: string;
  status: MessagingBindingDescriptor["status"];
  authProfileId: string;
  conversationId: string;
  ownerUserId?: string;
}

export interface SignalOwnerHandoffContract {
  kind: "signal-owner-handoff-v0";
  providerId: "signal-cli";
  endpointPath?: string;
  applyToolName: "ambient_messaging_signal_owner_handoff_apply";
  requiredInputs: string[];
  bridgeInternalMessageFields: string[];
  piVisibleResultFields: string[];
  forbiddenPiVisibleFields: string[];
  initialDedupeFields: string[];
  dispatchBoundary: string[];
}

export interface SignalOwnerHandoffPreview {
  providerId: "signal-cli";
  providerLabel: string;
  status: "ready" | "blocked";
  canApplyNow: boolean;
  previewOnly: boolean;
  approvalRequired: true;
  approvalRequiredForFutureApply: boolean;
  typedPreviewTool: "ambient_messaging_signal_owner_handoff_preview";
  typedApplyTool: "ambient_messaging_signal_owner_handoff_apply";
  bindingApplyTool: "none";
  fakeBridgeApplyEnabled: boolean;
  providerImplementationStatus: MessagingProviderDescriptor["implementation"]["status"] | "planned";
  profileId?: string;
  conversationId?: string;
  setupCodeLength?: number;
  setupCodePreview: string;
  limit: number;
  endpointPath?: string;
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
  knownAuthProfiles: SignalOwnerHandoffProfileSummary[];
  selectedProfile?: SignalOwnerHandoffProfileSummary;
  existingBindings: SignalOwnerHandoffExistingBindingSummary[];
  gates: {
    profileSelected: boolean;
    conversationSelected: boolean;
    setupCodeReady: boolean;
    bridgeReadableProfile: boolean;
    boundedUnreadWindowAvailable: boolean;
    fakeBridgeApplyEnabled: boolean;
    ownerHandoffApplyAvailable: boolean;
    bindingApplyAvailable: false;
    senderProfileResolutionAvailable: false;
  };
  contract: SignalOwnerHandoffContract;
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    readsProviderUnreadMessages: boolean;
    filtersExactSetupCode: boolean;
    resolvesSenderProfiles: false;
    returnsMatchedSenderId: boolean;
    returnsProviderMessageContent: false;
    writesInitialDedupeState: false;
    createsBinding: false;
    startsBridge: false;
    sendsProviderMessages: false;
    runsProviderCli: false;
    inspectsSignalDesktop: false;
    usesTelegramOwnerHandoff: false;
  };
}

export type SignalOwnerHandoffFailureMode =
  | "none"
  | "fake-bridge-apply-disabled"
  | "bridge-unreachable"
  | "missing-auth-profile"
  | "missing-conversation"
  | "missing-setup-code"
  | "missing-bridge-capability"
  | "bridge-contract-violation"
  | "bridge-request-failed"
  | "permission-denied"
  | "no-match"
  | "ambiguous"
  | "unknown";

export interface SignalOwnerHandoffApplyResult extends SignalOwnerHandoffPreview {
  applyStatus: "applied" | "blocked" | "denied" | "failed";
  approvalRequested: boolean;
  approvalRecorded: boolean;
  handoffStatus: SignalBridgeOwnerHandoffStatus | "not-attempted";
  fetchedMessageCount: number;
  candidateMessageCount: number;
  matchedMessageCount: number;
  matchedSenderCount: number;
  sourceMessageId?: string;
  ownerUserId?: string;
  ownerLabel?: string;
  receivedAt?: string;
  initialSeenMessageIds: string[];
  canFeedBindingApply: boolean;
  bindingApplyInputReady: boolean;
  failureMode: SignalOwnerHandoffFailureMode;
  failureHint: string;
  error?: string;
}

export type SignalOwnerHandoffBlockedApplyResult = SignalOwnerHandoffApplyResult & {
  applyStatus: "blocked";
  approvalRequested: false;
  approvalRecorded: false;
  handoffStatus: "not-attempted";
  fetchedMessageCount: 0;
  candidateMessageCount: 0;
  matchedMessageCount: 0;
  matchedSenderCount: 0;
  initialSeenMessageIds: [];
  canFeedBindingApply: false;
  bindingApplyInputReady: false;
};

export function signalOwnerHandoffInput(params: unknown): SignalOwnerHandoffInput {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId) ?? SIGNAL_PROVIDER_ID;
  if (providerId !== SIGNAL_PROVIDER_ID) {
    throw new Error(`providerId must be ${SIGNAL_PROVIDER_ID} when supplied.`);
  }
  const setupCode = typeof raw?.setupCode === "string" ? raw.setupCode.trim() : undefined;
  if (setupCode) {
    if (/[\r\n]/.test(setupCode)) throw new Error("setupCode must be a single line when supplied.");
    if (setupCode.length < MIN_SETUP_CODE_CHARS) throw new Error(`setupCode must be at least ${MIN_SETUP_CODE_CHARS} characters when supplied.`);
    if (setupCode.length > MAX_SETUP_CODE_CHARS) throw new Error(`setupCode must be ${MAX_SETUP_CODE_CHARS} characters or fewer when supplied.`);
  }
  const limitValue = typeof raw?.limit === "number" && Number.isFinite(raw.limit)
    ? Math.floor(raw.limit)
    : 10;
  return {
    providerId: SIGNAL_PROVIDER_ID,
    profileId: optionalString(raw?.profileId) ?? optionalString(raw?.authProfileId),
    conversationId: optionalString(raw?.conversationId),
    ...(setupCode ? { setupCode } : {}),
    limit: Math.max(1, Math.min(MAX_HANDOFF_LIMIT, limitValue)),
  };
}

export function buildSignalOwnerHandoffPreview(input: {
  toolInput: SignalOwnerHandoffInput;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  descriptor?: MessagingProviderDescriptor;
  env?: Record<string, string | undefined>;
}): SignalOwnerHandoffPreview {
  const env = input.env ?? process.env;
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
  const endpointPath = profileId && conversationId
    ? signalBridgeEndpointPaths(profileId, conversationId).unreadWindow.replace(":limit", String(input.toolInput.limit))
    : undefined;
  const bridgeReadableProfile = selectedProfile?.metadataReadable === true && selectedProfile.bridgeSessionReadable === true;
  const boundedUnreadWindowAvailable = readiness?.bridgeReachable === true
    && readiness.bridgeCapabilities?.profileStatus === true
    && readiness.bridgeCapabilities.boundedUnreadWindow === true
    && bridgeReadableProfile;
  const setupCodeReady = Boolean(input.toolInput.setupCode);
  const fakeBridgeApplyEnabled = env[FAKE_BRIDGE_APPLY_FLAG] === "1";
  const existingBindings = input.bindings.bindings
    .filter((binding) => binding.providerId === SIGNAL_PROVIDER_ID)
    .filter((binding) => binding.purpose === "remote_ambient_surface")
    .filter((binding) => profileId ? binding.authProfileId === profileId : true)
    .filter((binding) => conversationId ? binding.conversationId === conversationId : true)
    .map(bindingSummary);

  const blockers: string[] = [];
  if (!fakeBridgeApplyEnabled) blockers.push(`Signal owner handoff apply is enabled only for the reviewed fake bridge when ${FAKE_BRIDGE_APPLY_FLAG}=1.`);
  if (!profileId) blockers.push("Signal owner handoff requires a selected bridge-readable profileId.");
  if (!conversationId) blockers.push("Signal owner handoff requires a selected metadata-only directory conversationId.");
  if (!setupCodeReady) blockers.push("Signal owner handoff requires a one-time setupCode before apply.");
  if (!runtimeProvider) {
    blockers.push("Signal runtime status is unavailable.");
  }
  if (!readiness) {
    blockers.push("Signal readiness has not been refreshed.");
  } else {
    if (!readiness.bridgeReachable) blockers.push("Signal bridge root is not reachable.");
    if (!readiness.bridgeCapabilities?.profileStatus) blockers.push("Signal bridge root did not advertise profileStatus.");
    if (!readiness.bridgeCapabilities?.boundedUnreadWindow) blockers.push("Signal bridge root did not advertise boundedUnreadWindow.");
    if (!readiness.configured) blockers.push("No reviewed bridge-readable Signal profile is configured.");
  }
  if (profileId && !selectedProfile) blockers.push(`Signal profile was not found in readiness metadata: ${profileId}.`);
  if (selectedProfile && !bridgeReadableProfile) blockers.push(`Signal profile ${selectedProfile.profileId} is not bridge-readable.`);
  if (readiness && !boundedUnreadWindowAvailable) blockers.push("Signal bounded unread-window bridge capability is not available for the selected profile.");

  const canApplyNow = blockers.length === 0;

  return {
    providerId: SIGNAL_PROVIDER_ID,
    providerLabel: descriptor?.label ?? SIGNAL_PROVIDER_LABEL,
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    previewOnly: !canApplyNow,
    approvalRequired: true,
    approvalRequiredForFutureApply: !canApplyNow,
    typedPreviewTool: "ambient_messaging_signal_owner_handoff_preview",
    typedApplyTool: "ambient_messaging_signal_owner_handoff_apply",
    bindingApplyTool: "none",
    fakeBridgeApplyEnabled,
    providerImplementationStatus: descriptor?.implementation.status ?? "planned",
    ...(profileId ? { profileId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(input.toolInput.setupCode ? { setupCodeLength: input.toolInput.setupCode.length } : {}),
    setupCodePreview: input.toolInput.setupCode ? `${input.toolInput.setupCode.length} chars` : "not supplied",
    limit: input.toolInput.limit,
    ...(endpointPath ? { endpointPath } : {}),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    readinessStatus: readiness?.status,
    configured: readiness?.configured,
    bridgeReachable: readiness?.bridgeReachable,
    ...(readiness?.bridgeCapabilities ? { bridgeCapabilities: readiness.bridgeCapabilities } : {}),
    knownAuthProfiles,
    ...(selectedProfile ? { selectedProfile } : {}),
    existingBindings,
    gates: {
      profileSelected: Boolean(profileId),
      conversationSelected: Boolean(conversationId),
      setupCodeReady,
      bridgeReadableProfile,
      boundedUnreadWindowAvailable,
      fakeBridgeApplyEnabled,
      ownerHandoffApplyAvailable: canApplyNow,
      bindingApplyAvailable: false,
      senderProfileResolutionAvailable: false,
    },
    contract: signalOwnerHandoffContract(endpointPath),
    blockers,
    warnings: [
      canApplyNow
        ? "Apply still requires explicit user approval and must read only the selected bounded fake-bridge unread endpoint."
        : "This preview must not be treated as permission to read Signal unread messages.",
      "Do not ask the user to paste Signal identifiers, phone numbers, service ids, identity keys, session keys, message text, or contact names.",
      "Do not use Telegram owner handoff, Telegram tools, shell, browser automation, Signal Desktop UI, or signal-cli as a workaround.",
      "The setup code may be supplied for preview, but apply compares it internally and never returns the setup-code message body.",
      ...(fakeBridgeApplyEnabled ? [
        "Fake-bridge owner handoff apply is for contract dogfooding only; real Signal bridge owner handoff remains disabled until reviewed separately.",
      ] : []),
      ...((descriptor?.implementation.status ?? "planned") !== "available" ? ["Signal provider implementation is planned."] : []),
      ...(!descriptor?.purposeSupport.remote_ambient_surface ? ["Signal provider does not currently enable remote_ambient_surface purpose support."] : []),
      ...(descriptor?.implementation.bindingLifecycleEnabled !== true ? ["Signal binding lifecycle adapter is disabled."] : []),
      ...(descriptor?.implementation.inboundIngestionEnabled !== true ? ["Signal inbound ingestion adapter is disabled."] : []),
      ...(existingBindings.length
        ? ["A Signal Remote Ambient Surface binding record already exists for this scope; owner handoff still remains disabled and must not be inferred from that record."]
        : []),
    ],
    policyNotes: [
      "Signal owner handoff must precede real Signal binding creation because linked-account metadata does not authenticate the sender inside a selected conversation.",
      "Apply may read only one bounded unread window for the exact selected profile and conversation after explicit approval.",
      "The adapter may compare message text to the one-time setup code internally, but Pi-visible output must include only counts, matched sender metadata, source message id, and initial dedupe ids.",
      "Initial dedupe/high-water metadata must be carried into Signal binding apply so the setup-code message is not later routed as a command.",
      "No Signal replies are sent during owner handoff.",
      ...(descriptor?.privacyNotes ?? []),
      ...(descriptor?.implementation.notes ?? []),
    ],
    nextSteps: canApplyNow
      ? [
        "Ask the user to approve one bounded fake-bridge owner handoff read.",
        "If exactly one sender matches, carry ownerUserId, sourceMessageId, and initialSeenMessageIds into ambient_messaging_signal_remote_surface_preview/apply.",
        "Do not use the generic binding apply path for Signal.",
      ]
      : [
        "Keep Signal owner handoff apply blocked unless the reviewed fake bridge apply flag and all readiness gates are satisfied.",
        "Do not use shell, browser, Signal Desktop UI, provider CLIs, Telegram tools, or generic binding apply as a workaround.",
        "After exactly one sender matches, pass ownerUserId, sourceMessageId, and initialSeenMessageIds into ambient_messaging_signal_remote_surface_preview/apply.",
      ],
    safety: {
      readsProviderUnreadMessages: canApplyNow,
      filtersExactSetupCode: canApplyNow,
      resolvesSenderProfiles: false,
      returnsMatchedSenderId: canApplyNow,
      returnsProviderMessageContent: false,
      writesInitialDedupeState: false,
      createsBinding: false,
      startsBridge: false,
      sendsProviderMessages: false,
      runsProviderCli: false,
      inspectsSignalDesktop: false,
      usesTelegramOwnerHandoff: false,
    },
  };
}

export function signalOwnerHandoffPreviewText(preview: SignalOwnerHandoffPreview): string {
  return [
    `Signal owner handoff preview: ${preview.status}`,
    `Provider: ${preview.providerLabel} (${preview.providerId})`,
    `Implementation: ${preview.providerImplementationStatus}`,
    `Preview only: ${preview.previewOnly ? "yes" : "no"}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    `Future approval required: ${preview.approvalRequiredForFutureApply ? "yes" : "no"}`,
    `Fake bridge apply enabled: ${preview.fakeBridgeApplyEnabled ? "yes" : "no"}`,
    `Typed preview tool: ${preview.typedPreviewTool}`,
    `Typed apply tool: ${preview.typedApplyTool}`,
    `Binding apply tool: ${preview.bindingApplyTool}`,
    preview.profileId ? `Profile: ${preview.profileId}` : "Profile: missing",
    preview.conversationId ? `Conversation: ${preview.conversationId}` : "Conversation: missing",
    `Setup code: ${preview.setupCodePreview}`,
    `Limit: ${preview.limit}`,
    preview.endpointPath ? `Future unread endpoint path: ${preview.endpointPath}` : "Future unread endpoint path: unavailable",
    "",
    "Readiness gates:",
    `- Profile selected: ${preview.gates.profileSelected ? "yes" : "no"}`,
    `- Conversation selected: ${preview.gates.conversationSelected ? "yes" : "no"}`,
    `- Setup code ready: ${preview.gates.setupCodeReady ? "yes" : "no"}`,
    `- Bridge-readable profile: ${preview.gates.bridgeReadableProfile ? "yes" : "no"}`,
    `- Bounded unread window available: ${preview.gates.boundedUnreadWindowAvailable ? "yes" : "no"}`,
    `- Fake bridge apply flag: ${preview.gates.fakeBridgeApplyEnabled ? "enabled" : "disabled"}`,
    `- Owner handoff apply: ${preview.gates.ownerHandoffApplyAvailable ? "enabled" : "disabled"}`,
    `- Binding apply: ${preview.gates.bindingApplyAvailable ? "enabled" : "disabled"}`,
    `- Sender profile resolution: ${preview.gates.senderProfileResolutionAvailable ? "enabled" : "disabled"}`,
    "",
    "Safety:",
    `- Reads Signal unread messages now: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Filters exact setup code now: ${preview.safety.filtersExactSetupCode ? "yes" : "no"}`,
    `- Returns matched sender id now: ${preview.safety.returnsMatchedSenderId ? "yes" : "no"}`,
    `- Returns provider message content: ${preview.safety.returnsProviderMessageContent ? "yes" : "no"}`,
    `- Writes initial dedupe state now: ${preview.safety.writesInitialDedupeState ? "yes" : "no"}`,
    `- Creates binding: ${preview.safety.createsBinding ? "yes" : "no"}`,
    `- Starts bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    `- Sends Signal messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    `- Runs provider CLI: ${preview.safety.runsProviderCli ? "yes" : "no"}`,
    `- Inspects Signal Desktop: ${preview.safety.inspectsSignalDesktop ? "yes" : "no"}`,
    `- Uses Telegram owner handoff: ${preview.safety.usesTelegramOwnerHandoff ? "yes" : "no"}`,
    "",
    preview.readinessStatus ? `Readiness: ${preview.readinessStatus}` : "Readiness: not refreshed",
    typeof preview.configured === "boolean" ? `Configured: ${preview.configured ? "yes" : "no"}` : undefined,
    typeof preview.bridgeReachable === "boolean" ? `Bridge reachable: ${preview.bridgeReachable ? "yes" : "no"}` : undefined,
    preview.bridgeCapabilities ? `Bridge capabilities: profileStatus=${preview.bridgeCapabilities.profileStatus ? "yes" : "no"}, metadataOnlyConversationDirectory=${preview.bridgeCapabilities.metadataOnlyConversationDirectory ? "yes" : "no"}, boundedUnreadWindow=${preview.bridgeCapabilities.boundedUnreadWindow ? "yes" : "no"}, approvedReplySend=${preview.bridgeCapabilities.approvedReplySend ? "yes" : "no"}` : undefined,
    "",
    `Known auth profiles: ${preview.knownAuthProfiles.length}`,
    ...preview.knownAuthProfiles.map((profile) => `- ${profile.profileId}: metadata=${profile.metadataReadable ? "readable" : "unreadable"}, signalCliConfigDir=${profile.signalCliConfigDirPresent ? "present" : "missing"}, account=${profile.accountIdentifierPresent ? "present" : "missing"}, linked=${profile.linkedDevicePresent ? "present" : "missing"}, registration=${profile.registrationMetadataPresent ? "present" : "missing"}, bridgeReadable=${profile.bridgeSessionReadable ? "yes" : "no"}`),
    "",
    `Existing matching bindings: ${preview.existingBindings.length}`,
    ...preview.existingBindings.map((binding) => `- ${binding.bindingId}: status=${binding.status}, profile=${binding.authProfileId}, conversation=${binding.conversationId}, owner=${binding.ownerUserId ?? "missing"}`),
    "",
    `Owner-handoff contract: ${preview.contract.kind}`,
    `Required inputs: ${preview.contract.requiredInputs.join(", ")}`,
    `Bridge internal message fields: ${preview.contract.bridgeInternalMessageFields.join(", ")}`,
    `Pi-visible result fields: ${preview.contract.piVisibleResultFields.join(", ")}`,
    `Forbidden Pi-visible fields: ${preview.contract.forbiddenPiVisibleFields.join(", ")}`,
    `Initial dedupe fields: ${preview.contract.initialDedupeFields.join(", ")}`,
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

export function signalOwnerHandoffBlockedApplyResult(
  preview: SignalOwnerHandoffPreview,
): SignalOwnerHandoffBlockedApplyResult {
  const failureMode = blockedFailureMode(preview);
  return {
    ...preview,
    applyStatus: "blocked",
    approvalRequested: false,
    approvalRecorded: false,
    handoffStatus: "not-attempted",
    fetchedMessageCount: 0,
    candidateMessageCount: 0,
    matchedMessageCount: 0,
    matchedSenderCount: 0,
    initialSeenMessageIds: [],
    canFeedBindingApply: false,
    bindingApplyInputReady: false,
    failureMode,
    failureHint: failureHintFor(failureMode),
    safety: {
      ...preview.safety,
      readsProviderUnreadMessages: false,
      filtersExactSetupCode: false,
      resolvesSenderProfiles: false,
      returnsMatchedSenderId: false,
      returnsProviderMessageContent: false,
      writesInitialDedupeState: false,
      createsBinding: false,
      startsBridge: false,
      sendsProviderMessages: false,
      runsProviderCli: false,
      inspectsSignalDesktop: false,
      usesTelegramOwnerHandoff: false,
    },
  };
}

export function signalOwnerHandoffDeniedResult(preview: SignalOwnerHandoffPreview): SignalOwnerHandoffApplyResult {
  return {
    ...signalOwnerHandoffBlockedApplyResult(preview),
    applyStatus: "denied",
    approvalRequested: true,
    failureMode: "permission-denied",
    failureHint: failureHintFor("permission-denied"),
  };
}

export async function applySignalOwnerHandoff(input: {
  preview: SignalOwnerHandoffPreview;
  setupCode: string;
  approvalRecorded: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
}): Promise<SignalOwnerHandoffApplyResult> {
  if (!input.preview.canApplyNow) return signalOwnerHandoffBlockedApplyResult(input.preview);
  if (!input.approvalRecorded) return signalOwnerHandoffDeniedResult(input.preview);
  const env = input.env ?? process.env;
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  try {
    if (!input.preview.endpointPath) throw new Error("Signal owner handoff endpoint is unavailable.");
    if (!input.preview.profileId) throw new Error("Signal owner handoff profile is unavailable.");
    if (!input.preview.conversationId) throw new Error("Signal owner handoff conversation is unavailable.");
    const baseUrl = normalizeBaseUrl(env.AMBIENT_SIGNAL_BRIDGE_URL?.trim()
      || env.AMBIENT_AGENT_SIGNAL_BRIDGE_URL?.trim()
      || `http://127.0.0.1:${env.AMBIENT_SIGNAL_BRIDGE_PORT?.trim() || env.AMBIENT_AGENT_SIGNAL_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT}`);
    const body = await fetchBridgeJson(`${baseUrl}${input.preview.endpointPath}`, fetchFn);
    const summary = validateSignalBridgeOwnerHandoffEnvelope(
      body,
      input.preview.profileId,
      input.preview.conversationId,
      input.setupCode,
    );
    if (summary.handoffStatus !== "matched" || !summary.ownerUserId || !summary.sourceMessageId) {
      const failureMode = summary.handoffStatus === "ambiguous" ? "ambiguous" : "no-match";
      return {
        ...input.preview,
        applyStatus: "failed",
        approvalRequested: true,
        approvalRecorded: true,
        handoffStatus: summary.handoffStatus,
        fetchedMessageCount: summary.fetchedMessageCount,
        candidateMessageCount: summary.candidateMessageCount,
        matchedMessageCount: summary.matchedMessageCount,
        matchedSenderCount: summary.matchedSenderCount,
        initialSeenMessageIds: summary.initialSeenMessageIds,
        canFeedBindingApply: false,
        bindingApplyInputReady: false,
        failureMode,
        failureHint: failureHintFor(failureMode),
        safety: appliedSafety(input.preview, false),
      };
    }
    return {
      ...input.preview,
      applyStatus: "applied",
      approvalRequested: true,
      approvalRecorded: true,
      handoffStatus: "matched",
      fetchedMessageCount: summary.fetchedMessageCount,
      candidateMessageCount: summary.candidateMessageCount,
      matchedMessageCount: summary.matchedMessageCount,
      matchedSenderCount: summary.matchedSenderCount,
      ownerUserId: summary.ownerUserId,
      ...(summary.ownerLabel ? { ownerLabel: summary.ownerLabel } : {}),
      sourceMessageId: summary.sourceMessageId,
      ...(summary.receivedAt ? { receivedAt: summary.receivedAt } : {}),
      initialSeenMessageIds: summary.initialSeenMessageIds,
      canFeedBindingApply: true,
      bindingApplyInputReady: true,
      failureMode: "none",
      failureHint: failureHintFor("none"),
      policyNotes: [
        ...input.preview.policyNotes,
        ...summary.diagnostics,
      ],
      safety: appliedSafety(input.preview, true),
    };
  } catch (error) {
    const errorText = errorMessage(error);
    const failureMode = failedFailureMode(errorText);
    return {
      ...input.preview,
      applyStatus: "failed",
      approvalRequested: true,
      approvalRecorded: true,
      handoffStatus: "not-attempted",
      fetchedMessageCount: 0,
      candidateMessageCount: 0,
      matchedMessageCount: 0,
      matchedSenderCount: 0,
      initialSeenMessageIds: [],
      canFeedBindingApply: false,
      bindingApplyInputReady: false,
      failureMode,
      failureHint: failureHintFor(failureMode),
      error: errorText,
      safety: appliedSafety(input.preview, false),
    };
  }
}

export function signalOwnerHandoffApprovalDetail(preview: SignalOwnerHandoffPreview): string {
  return [
    `Provider: ${preview.providerId}`,
    `Profile: ${preview.profileId ?? "missing"}`,
    `Conversation: ${preview.conversationId ?? "missing"}`,
    `Limit: ${preview.limit}`,
    `Setup code length: ${preview.setupCodeLength ?? 0}`,
    `Setup code preview: ${preview.setupCodePreview}`,
    `Endpoint: ${preview.endpointPath ?? "unavailable"}`,
    `Fake bridge apply enabled: ${preview.fakeBridgeApplyEnabled ? "yes" : "no"}`,
    `Would read Signal unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `Would filter exact setup code internally: ${preview.safety.filtersExactSetupCode ? "yes" : "no"}`,
    `Would return matched sender id: ${preview.safety.returnsMatchedSenderId ? "yes" : "no"}`,
    `Would return provider message content: ${preview.safety.returnsProviderMessageContent ? "yes" : "no"}`,
    `Would create binding: ${preview.safety.createsBinding ? "yes" : "no"}`,
    `Would send Signal messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    ...preview.policyNotes,
  ].join("\n");
}

export function signalOwnerHandoffResultText(result: SignalOwnerHandoffApplyResult): string {
  return [
    `Signal owner handoff apply: ${result.applyStatus}`,
    `Apply status: ${result.applyStatus}`,
    `Approval requested: ${result.approvalRequested ? "yes" : "no"}`,
    `Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `Handoff status: ${result.handoffStatus}`,
    `Can feed binding apply: ${result.canFeedBindingApply ? "yes" : "no"}`,
    `Binding apply input ready: ${result.bindingApplyInputReady ? "yes" : "no"}`,
    `Failure mode: ${result.failureMode}`,
    `Failure hint: ${result.failureHint}`,
    result.ownerUserId ? `Owner user: ${result.ownerUserId}` : undefined,
    result.ownerLabel ? `Owner label: ${result.ownerLabel}` : undefined,
    result.sourceMessageId ? `Source message: ${result.sourceMessageId}` : undefined,
    result.error ? `Error: ${result.error}` : undefined,
    "",
    "Counts:",
    `- Fetched messages: ${result.fetchedMessageCount}`,
    `- Candidate messages inspected: ${result.candidateMessageCount}`,
    `- Exact setup-code matches: ${result.matchedMessageCount}`,
    `- Distinct matched senders: ${result.matchedSenderCount}`,
    `- Initial seen message ids: ${result.initialSeenMessageIds.length}`,
    "",
    "Safety:",
    `- Reads Signal unread messages: ${result.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Filters exact setup code: ${result.safety.filtersExactSetupCode ? "yes" : "no"}`,
    `- Resolves sender profiles: ${result.safety.resolvesSenderProfiles ? "yes" : "no"}`,
    `- Returns matched sender id: ${result.safety.returnsMatchedSenderId ? "yes" : "no"}`,
    `- Returns provider message content: ${result.safety.returnsProviderMessageContent ? "yes" : "no"}`,
    `- Writes initial dedupe state: ${result.safety.writesInitialDedupeState ? "yes" : "no"}`,
    `- Creates binding: ${result.safety.createsBinding ? "yes" : "no"}`,
    `- Uses Telegram owner handoff: ${result.safety.usesTelegramOwnerHandoff ? "yes" : "no"}`,
    result.canFeedBindingApply ? [
      "",
      "Next binding step:",
      "- Use ambient_messaging_signal_remote_surface_preview/apply with ownerUserId, sourceMessageId, and initialSeenMessageIds. Do not use generic binding apply for Signal.",
    ].join("\n") : undefined,
    "",
    signalOwnerHandoffPreviewText(result),
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function signalOwnerHandoffContract(endpointPath?: string): SignalOwnerHandoffContract {
  return {
    kind: "signal-owner-handoff-v0",
    providerId: SIGNAL_PROVIDER_ID,
    ...(endpointPath ? { endpointPath } : {}),
    applyToolName: "ambient_messaging_signal_owner_handoff_apply",
    requiredInputs: ["profileId", "conversationId", "setupCode", "limit"],
    bridgeInternalMessageFields: ["messageId", "senderId", "senderLabel", "text", "receivedAt", "outgoing"],
    piVisibleResultFields: [
      "handoffStatus",
      "fetchedMessageCount",
      "candidateMessageCount",
      "matchedMessageCount",
      "matchedSenderCount",
      "ownerUserId",
      "ownerLabel",
      "sourceMessageId",
      "initialSeenMessageIds",
    ],
    forbiddenPiVisibleFields: ["text", "body", "messageBody", "lastMessage", "rawMessage", "attachments", "contacts", "groups", "phoneNumber", "serviceId", "identityKey", "sessionKeys"],
    initialDedupeFields: ["ownerHandoffSourceMessageId", "initialSeenMessageIds", "unreadHighWaterMark"],
    dispatchBoundary: [
      "Read a bounded unread window only after explicit approval.",
      "Match the one-time setup code internally and drop outgoing, duplicate, wrong-conversation, and non-matching messages.",
      "Return only sender and dedupe metadata to Pi; never return setup-code message text.",
      "Carry sourceMessageId and initialSeenMessageIds into binding apply before polling is enabled.",
    ],
  };
}

function profileSummary(session: MessagingGatewayProviderSessionReadiness): SignalOwnerHandoffProfileSummary {
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

function singleBridgeReadableProfile(profiles: SignalOwnerHandoffProfileSummary[]): SignalOwnerHandoffProfileSummary | undefined {
  const usable = profiles.filter((profile) => profile.metadataReadable && profile.bridgeSessionReadable);
  return usable.length === 1 ? usable[0] : undefined;
}

function bindingSummary(binding: MessagingBindingDescriptor): SignalOwnerHandoffExistingBindingSummary {
  return {
    bindingId: binding.id,
    status: binding.status,
    authProfileId: binding.authProfileId,
    conversationId: binding.conversationId,
    ...(binding.ownerUserId ? { ownerUserId: binding.ownerUserId } : {}),
  };
}

function appliedSafety(preview: SignalOwnerHandoffPreview, matched: boolean): SignalOwnerHandoffPreview["safety"] {
  return {
    ...preview.safety,
    readsProviderUnreadMessages: true,
    filtersExactSetupCode: true,
    resolvesSenderProfiles: false,
    returnsMatchedSenderId: matched,
    returnsProviderMessageContent: false,
    writesInitialDedupeState: false,
    createsBinding: false,
    startsBridge: false,
    sendsProviderMessages: false,
    runsProviderCli: false,
    inspectsSignalDesktop: false,
    usesTelegramOwnerHandoff: false,
  };
}

function blockedFailureMode(preview: SignalOwnerHandoffPreview): SignalOwnerHandoffFailureMode {
  const text = preview.blockers.join("\n");
  if (text.includes(FAKE_BRIDGE_APPLY_FLAG)) return "fake-bridge-apply-disabled";
  if (text.includes("profileId") || text.includes("profile was not found") || text.includes("bridge-readable")) return "missing-auth-profile";
  if (text.includes("conversationId")) return "missing-conversation";
  if (text.includes("setupCode")) return "missing-setup-code";
  if (text.includes("bounded unread-window") || text.includes("boundedUnreadWindow") || text.includes("profileStatus")) return "missing-bridge-capability";
  if (text.includes("not reachable")) return "bridge-unreachable";
  return "unknown";
}

function failedFailureMode(errorText: string): SignalOwnerHandoffFailureMode {
  if (/forbidden field|must include ok=true|providerId|profileId mismatch|conversationId mismatch|messages array/i.test(errorText)) {
    return "bridge-contract-violation";
  }
  if (/HTTP|fetch failed|ECONNREFUSED|ENOTFOUND|unreachable/i.test(errorText)) return "bridge-request-failed";
  return "unknown";
}

function failureHintFor(mode: SignalOwnerHandoffFailureMode): string {
  switch (mode) {
    case "none":
      return "Signal owner handoff matched exactly one sender and returned only owner/dedupe metadata. No binding was created.";
    case "fake-bridge-apply-disabled":
      return `Signal owner handoff apply is blocked unless the reviewed fake bridge apply path is explicitly enabled with ${FAKE_BRIDGE_APPLY_FLAG}=1. No Signal unread messages were read.`;
    case "bridge-unreachable":
      return "Signal owner handoff apply is blocked because the reviewed bridge is not reachable. No Signal unread messages were read.";
    case "missing-auth-profile":
      return "Signal owner handoff requires a selected bridge-readable profile before reading a bounded unread window.";
    case "missing-conversation":
      return "Signal owner handoff requires a selected metadata-only directory conversation before reading a bounded unread window.";
    case "missing-setup-code":
      return "Signal owner handoff requires a one-time setup code before reading a bounded unread window.";
    case "missing-bridge-capability":
      return "Signal owner handoff requires the reviewed bridge to advertise profileStatus and boundedUnreadWindow for the selected profile.";
    case "bridge-contract-violation":
      return "The Signal bridge owner-handoff response violated the reviewed contract and was rejected without exposing message content.";
    case "bridge-request-failed":
      return "The Signal bridge owner-handoff request failed. No owner sender was authenticated.";
    case "permission-denied":
      return "The user denied the bounded Signal owner handoff read. No Signal unread messages were read.";
    case "no-match":
      return "No unread message exactly matched the setup code. Ask the owner to send a fresh unique code in the selected Signal conversation and retry.";
    case "ambiguous":
      return "Multiple distinct senders matched the setup code. Fail closed and repeat handoff with a fresh unique setup code.";
    case "unknown":
      return "Signal owner handoff could not run safely. No owner sender was authenticated.";
  }
}

async function fetchBridgeJson(url: string, fetchFn: FetchLike): Promise<unknown> {
  const response = await fetchFn(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Signal bridge request failed: HTTP ${response.status} ${response.statusText}`.trim());
  }
  return response.json();
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
