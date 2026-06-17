import type {
  MessagingBindingPurpose,
  MessagingConversationDirectorySetupCard,
  MessagingGatewayProviderSessionReadiness,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../../../shared/messagingGateway";
import {
  messagingConversationDirectoryContractNotes,
  messagingConversationDirectoryMetadataContract,
  type MessagingConversationDirectoryMetadataEntry,
  type MessagingConversationDirectoryMetadataContract,
} from "../../messaging/messagingConversationDirectoryContract";
import {
  messagingConversationDirectoryAdapterExecutionEnvelope,
  messagingConversationDirectoryAdapterExecutionText,
  messagingConversationDirectorySetupCard,
  signalConversationDirectoryAdapterPlan,
  type MessagingConversationDirectoryAdapterExecutionEnvelope,
} from "../../messaging/messagingConversationDirectoryAdapters";
import {
  signalBridgeEndpointPaths,
  validateSignalBridgeConversationDirectoryEnvelope,
} from "./signalBridgeContract";

const SIGNAL_PROVIDER_ID = "signal-cli";
const SIGNAL_PROVIDER_LABEL = "Signal";
const DEFAULT_BRIDGE_PORT = "8092";

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface SignalConversationDirectoryInput {
  providerId: "signal-cli";
  authProfileId?: string;
  purpose: MessagingBindingPurpose;
  query?: string;
  limit: number;
}

export interface SignalSessionMetadataContract {
  kind: "signal-local-bridge-session-metadata";
  requiredFutureFields: string[];
  allowedReadinessFields: string[];
  sensitiveFieldsNeverReturned: string[];
  messageStoreAccessRequired: false;
}

export interface SignalConversationDirectoryPreview {
  providerId: "signal-cli";
  providerLabel: string;
  status: "ready" | "blocked";
  implementationStatus: MessagingProviderDescriptor["implementation"]["status"] | "planned";
  purpose: MessagingBindingPurpose;
  purposeSupported: boolean;
  profileId?: string;
  query?: string;
  limit: number;
  canApplyNow: boolean;
  approvalRequired: true;
  endpointPath?: string;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  providerDirectoryTool: "ambient_messaging_signal_conversation_directory_preview";
  providerDirectoryApplyTool: "ambient_messaging_signal_conversation_directory_apply";
  metadataOnlyContract: MessagingConversationDirectoryMetadataContract;
  sessionMetadataContract: SignalSessionMetadataContract;
  readinessStatus?: string;
  configured?: boolean;
  bridgeReachable?: boolean;
  bridgeCapabilities?: {
    profileStatus?: boolean;
    metadataOnlyConversationDirectory?: boolean;
    boundedUnreadWindow?: boolean;
    approvedReplySend?: boolean;
  };
  readinessDiagnostics?: string[];
  knownAuthProfiles: Array<{
    profileId: string;
    metadataReadable: boolean;
    signalCliConfigDirPresent: boolean;
    accountIdentifierPresent: boolean;
    linkedDevicePresent: boolean;
    registrationMetadataPresent: boolean;
    bridgeSessionReadable: boolean;
  }>;
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    startsBridge: false;
    readsProviderMessages: false;
    readsProviderHistory: false;
    sendsProviderMessages: false;
    mutatesBindings: false;
    runsProviderCli: false;
    inspectsSignalDesktop: false;
    readsProviderConversationMetadata: boolean;
    returnsProviderMessageContent: false;
  };
  adapterExecution: MessagingConversationDirectoryAdapterExecutionEnvelope;
}

export type SignalConversationDirectoryConversation = MessagingConversationDirectoryMetadataEntry;

export type SignalConversationDirectoryFailureMode =
  | "none"
  | "bridge-unreachable"
  | "missing-auth-profile"
  | "missing-bridge-capability"
  | "bridge-contract-violation"
  | "bridge-request-failed"
  | "permission-denied"
  | "unknown";

export interface SignalConversationDirectoryResult extends SignalConversationDirectoryPreview {
  applyStatus: "applied" | "blocked" | "denied" | "failed";
  approvalRecorded: boolean;
  fetchedConversationCount: number;
  returnedConversationCount: number;
  failureMode: SignalConversationDirectoryFailureMode;
  failureHint?: string;
  error?: string;
  conversations: SignalConversationDirectoryConversation[];
}

export function signalConversationDirectoryInput(params: unknown): SignalConversationDirectoryInput {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId) ?? SIGNAL_PROVIDER_ID;
  if (providerId !== SIGNAL_PROVIDER_ID) {
    throw new Error(`providerId must be ${SIGNAL_PROVIDER_ID} when supplied.`);
  }
  const purpose = optionalString(raw?.purpose) ?? "remote_ambient_surface";
  if (purpose !== "remote_ambient_surface" && purpose !== "messaging_connector") {
    throw new Error("purpose must be remote_ambient_surface or messaging_connector when supplied.");
  }
  const query = optionalString(raw?.query);
  const limitValue = typeof raw?.limit === "number" ? raw.limit : 10;
  return {
    providerId: SIGNAL_PROVIDER_ID,
    authProfileId: optionalString(raw?.authProfileId) ?? optionalString(raw?.profileId),
    purpose,
    ...(query ? { query: query.slice(0, 80) } : {}),
    limit: Math.max(1, Math.min(25, Math.floor(limitValue))),
  };
}

export function signalSessionMetadataContract(): SignalSessionMetadataContract {
  return {
    kind: "signal-local-bridge-session-metadata",
    requiredFutureFields: [
      "profileId",
      "metadataPath",
      "signalCliConfigDirPresent",
      "accountIdentifierPresent",
      "linkedDevicePresent",
      "registrationMetadataPresent",
      "bridgeSessionReadable",
    ],
    allowedReadinessFields: [
      "profileId",
      "metadataPath",
      "metadataReadable",
      "signalCliConfigDirPresent",
      "accountIdentifierPresent",
      "linkedDevicePresent",
      "registrationMetadataPresent",
      "bridgeSessionReadable",
      "error",
    ],
    sensitiveFieldsNeverReturned: [
      "phoneNumber",
      "serviceId",
      "aci",
      "pni",
      "profileName",
      "deviceName",
      "registrationId",
      "identityKey",
      "sessionKeys",
      "messageBodies",
    ],
    messageStoreAccessRequired: false,
  };
}

export function buildSignalConversationDirectoryPreview(input: {
  toolInput: SignalConversationDirectoryInput;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  descriptor?: MessagingProviderDescriptor;
}): SignalConversationDirectoryPreview {
  const runtimeProvider = input.runtimeStatus?.providers.find((provider) => provider.providerId === SIGNAL_PROVIDER_ID);
  const readiness = runtimeProvider?.readiness;
  const descriptor = input.descriptor;
  const purposeSupported = descriptor?.purposeSupport[input.toolInput.purpose] === true;
  const knownAuthProfiles = (readiness?.sessions ?? []).filter((session) =>
    input.toolInput.authProfileId ? session.profileId === input.toolInput.authProfileId : true
  );
  const selectedProfileId = input.toolInput.authProfileId ?? singleProfileId(knownAuthProfiles);
  const blockers: string[] = [];
  const warnings: string[] = [
    "Signal Desktop being installed locally is not a supported provider runtime signal.",
    "Signal directory metadata alone does not enable lifecycle, broad inbound ingestion, bindings, unread windows, polling, or replies; use the separate typed Signal tools for each reviewed path.",
    "Do not run signal-cli, inspect Signal Desktop storage, browse app UI, or ask Pi to infer conversation ids from message history.",
  ];

  if (!runtimeProvider) {
    blockers.push("Signal provider runtime status is unavailable.");
  }
  if (!readiness) {
    blockers.push("Signal readiness has not been refreshed.");
  } else {
    if (!readiness.bridgeReachable) blockers.push("Signal bridge root is not reachable.");
    if (!readiness.bridgeCapabilities?.profileStatus) blockers.push("Signal bridge root did not advertise profileStatus; profile status readiness is required before directory apply.");
    if (!readiness.bridgeCapabilities?.metadataOnlyConversationDirectory) blockers.push("Signal bridge root did not advertise metadataOnlyConversationDirectory.");
    if (!readiness.configured) blockers.push("No reviewed bridge-readable Signal profile is configured.");
    if (!readiness.sessions.some((session) => session.metadataReadable && session.bridgeSessionReadable === true)) {
      blockers.push("No readable Signal auth profile with bridgeSessionReadable=true is available.");
    }
  }
  if (!selectedProfileId) {
    blockers.push(knownAuthProfiles.length > 1
      ? "Multiple Signal auth profiles are available; provide profileId before applying directory read."
      : "No Signal auth profile is available for directory read.");
  }
  const selectedProfile = selectedProfileId
    ? knownAuthProfiles.find((session) => session.profileId === selectedProfileId)
    : undefined;
  if (input.toolInput.authProfileId && !selectedProfile) {
    blockers.push(`Signal auth profile was not found in readiness metadata: ${input.toolInput.authProfileId}.`);
  }
  if (selectedProfile && (!selectedProfile.metadataReadable || selectedProfile.bridgeSessionReadable !== true)) {
    blockers.push(`Signal auth profile ${selectedProfile.profileId} is not bridge-readable.`);
  }
  if (!purposeSupported) {
    warnings.push("Signal purpose support is intentionally disabled; directory apply can only return routing metadata for setup and cannot create or activate a binding.");
  }

  const endpointPath = selectedProfileId ? endpointPathFor({ ...input.toolInput, authProfileId: selectedProfileId }) : undefined;
  const canApplyNow = blockers.length === 0;
  const adapterPlan = signalConversationDirectoryAdapterPlan({ purpose: input.toolInput.purpose, runtimeProvider });
  const failureMode = canApplyNow ? "none" : blockedFailureModeFromBlockers(blockers);
  return {
    providerId: SIGNAL_PROVIDER_ID,
    providerLabel: descriptor?.label ?? SIGNAL_PROVIDER_LABEL,
    status: canApplyNow ? "ready" : "blocked",
    implementationStatus: descriptor?.implementation.status ?? "planned",
    purpose: input.toolInput.purpose,
    purposeSupported,
    ...(selectedProfileId ? { profileId: selectedProfileId } : {}),
    ...(input.toolInput.query ? { query: input.toolInput.query } : {}),
    limit: input.toolInput.limit,
    canApplyNow,
    approvalRequired: true,
    ...(endpointPath ? { endpointPath } : {}),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    providerDirectoryTool: "ambient_messaging_signal_conversation_directory_preview",
    providerDirectoryApplyTool: "ambient_messaging_signal_conversation_directory_apply",
    metadataOnlyContract: messagingConversationDirectoryMetadataContract(),
    sessionMetadataContract: signalSessionMetadataContract(),
    readinessStatus: readiness?.status,
    configured: readiness?.configured,
    bridgeReachable: readiness?.bridgeReachable,
    ...(readiness?.bridgeCapabilities ? { bridgeCapabilities: readiness.bridgeCapabilities } : {}),
    ...(readiness?.diagnostics.length ? { readinessDiagnostics: readiness.diagnostics } : {}),
    knownAuthProfiles: knownAuthProfiles.map(profileSummary),
    blockers,
    warnings,
    policyNotes: [
      "Signal directory preview/apply uses only a reviewed local bridge contract; Signal provider lifecycle and message access remain disabled.",
      "Directory apply is approval-gated and calls only the metadata-only conversation directory endpoint when readiness proves the bridge contract and profile status.",
      "Ambient returns only conversation id, title, type, unread count, folder ids, and updated time.",
      "Ambient requires metadataOnly=true and rejects any Signal bridge response containing provider-message payload fields.",
      "Conversation ids are routing identifiers, not permission grants. Binding creation must remain purpose-scoped and approval-gated.",
      "Remote Ambient Surface remains separate from Messaging Connector.",
      ...messagingConversationDirectoryContractNotes(),
      ...(descriptor?.privacyNotes ?? []),
      ...(descriptor?.implementation.notes ?? []),
    ],
    nextSteps: canApplyNow
      ? [
        "Ask the user to approve one bounded Signal conversation-directory metadata read.",
        "Use the returned conversation id only with ambient_messaging_signal_binding_readiness_preview; Signal binding apply remains blocked until owner authentication, lifecycle, inbound polling, and replies are reviewed.",
      ]
      : [
        "Fix Signal bridge root/profile readiness, metadata-only directory capability, or profile selection blockers before applying a directory read.",
        "Do not use shell, browser, Signal Desktop UI, provider CLIs, or Telegram-specific tools to discover Signal conversations as a workaround.",
      ],
    safety: {
      startsBridge: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
      runsProviderCli: false,
      inspectsSignalDesktop: false,
      readsProviderConversationMetadata: canApplyNow,
      returnsProviderMessageContent: false,
    },
    adapterExecution: messagingConversationDirectoryAdapterExecutionEnvelope({
      plan: adapterPlan,
      executionStatus: "preview",
      approvalRecorded: false,
      failureMode: failureMode === "none" ? undefined : failureMode,
      failureHint: failureMode === "none" ? undefined : failureHintFor(failureMode),
    }),
  };
}

export function signalConversationDirectoryBlockedResult(
  preview: SignalConversationDirectoryPreview,
  approvalRecorded = false,
): SignalConversationDirectoryResult {
  const failureMode = blockedFailureMode(preview);
  return {
    ...preview,
    applyStatus: "blocked",
    approvalRecorded,
    fetchedConversationCount: 0,
    returnedConversationCount: 0,
    failureMode,
    failureHint: failureHintFor(failureMode),
    conversations: [],
    adapterExecution: messagingConversationDirectoryAdapterExecutionEnvelope({
      plan: signalConversationDirectoryAdapterPlan({ purpose: preview.purpose, runtimeProvider: preview.runtimeProvider }),
      executionStatus: "blocked",
      approvalRecorded,
      failureMode,
      failureHint: failureHintFor(failureMode),
    }),
    safety: {
      ...preview.safety,
      readsProviderConversationMetadata: false,
    },
  };
}

export function signalConversationDirectoryDeniedResult(
  preview: SignalConversationDirectoryPreview,
): SignalConversationDirectoryResult {
  return {
    ...preview,
    applyStatus: "denied",
    approvalRecorded: false,
    fetchedConversationCount: 0,
    returnedConversationCount: 0,
    failureMode: "permission-denied",
    failureHint: failureHintFor("permission-denied"),
    conversations: [],
    adapterExecution: signalAdapterExecution(preview, {
      executionStatus: "denied",
      approvalRecorded: false,
      failureMode: "permission-denied",
      failureHint: failureHintFor("permission-denied"),
    }),
    safety: {
      ...preview.safety,
      readsProviderConversationMetadata: false,
    },
  };
}

export async function applySignalConversationDirectory(input: {
  preview: SignalConversationDirectoryPreview;
  approvalRecorded: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
}): Promise<SignalConversationDirectoryResult> {
  if (!input.preview.canApplyNow) return signalConversationDirectoryBlockedResult(input.preview, input.approvalRecorded);
  if (!input.approvalRecorded) return signalConversationDirectoryDeniedResult(input.preview);
  const env = input.env ?? process.env;
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  try {
    if (!input.preview.endpointPath) throw new Error("Signal conversation directory endpoint is unavailable.");
    if (!input.preview.profileId) throw new Error("Signal conversation directory profile is unavailable.");
    const baseUrl = normalizeBaseUrl(env.AMBIENT_SIGNAL_BRIDGE_URL?.trim()
      || env.AMBIENT_AGENT_SIGNAL_BRIDGE_URL?.trim()
      || `http://127.0.0.1:${env.AMBIENT_SIGNAL_BRIDGE_PORT?.trim() || env.AMBIENT_AGENT_SIGNAL_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT}`);
    const body = await fetchBridgeJson(`${baseUrl}${input.preview.endpointPath}`, fetchFn);
    const summary = validateSignalBridgeConversationDirectoryEnvelope(body, input.preview.profileId);
    return {
      ...input.preview,
      applyStatus: "applied",
      approvalRecorded: true,
      fetchedConversationCount: summary.fetchedConversationCount,
      returnedConversationCount: summary.returnedConversationCount,
      conversations: summary.conversations,
      failureMode: "none",
      readinessDiagnostics: [
        ...(input.preview.readinessDiagnostics ?? []),
        ...summary.diagnostics,
      ],
      adapterExecution: signalAdapterExecution(input.preview, {
        executionStatus: "applied",
        approvalRecorded: true,
        fetchedConversationCount: summary.fetchedConversationCount,
        returnedConversationCount: summary.returnedConversationCount,
      }),
    };
  } catch (error) {
    const errorText = errorMessage(error);
    const failureMode = failedFailureMode(errorText);
    return {
      ...input.preview,
      applyStatus: "failed",
      approvalRecorded: true,
      fetchedConversationCount: 0,
      returnedConversationCount: 0,
      conversations: [],
      failureMode,
      failureHint: failureHintFor(failureMode),
      error: errorText,
      adapterExecution: signalAdapterExecution(input.preview, {
        executionStatus: "failed",
        approvalRecorded: true,
        failureMode,
        failureHint: failureHintFor(failureMode),
        error: errorText,
      }),
      safety: {
        ...input.preview.safety,
        readsProviderConversationMetadata: false,
      },
    };
  }
}

export function signalConversationDirectoryPreviewText(preview: SignalConversationDirectoryPreview): string {
  return [
    `Signal conversation directory preview: ${preview.status}`,
    `Provider: ${preview.providerLabel} (${preview.providerId})`,
    `Implementation: ${preview.implementationStatus}`,
    `Purpose: ${preview.purpose}`,
    `Purpose support: ${preview.purposeSupported ? "yes" : "no"}`,
    preview.profileId ? `Profile: ${preview.profileId}` : undefined,
    preview.query ? `Query: ${preview.query}` : undefined,
    `Limit: ${preview.limit}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    preview.endpointPath ? `Endpoint path: ${preview.endpointPath}` : "Endpoint path: unavailable",
    `Provider directory tool: ${preview.providerDirectoryTool}`,
    `Provider directory apply tool: ${preview.providerDirectoryApplyTool}`,
    preview.readinessStatus ? `Readiness: ${preview.readinessStatus}` : "Readiness: not refreshed",
    typeof preview.configured === "boolean" ? `Configured: ${preview.configured ? "yes" : "no"}` : undefined,
    typeof preview.bridgeReachable === "boolean" ? `Bridge reachable: ${preview.bridgeReachable ? "yes" : "no"}` : undefined,
    preview.bridgeCapabilities ? `Bridge capabilities: profileStatus=${preview.bridgeCapabilities.profileStatus ? "yes" : "no"}, metadataOnlyConversationDirectory=${preview.bridgeCapabilities.metadataOnlyConversationDirectory ? "yes" : "no"}, boundedUnreadWindow=${preview.bridgeCapabilities.boundedUnreadWindow ? "yes" : "no"}, approvedReplySend=${preview.bridgeCapabilities.approvedReplySend ? "yes" : "no"}` : undefined,
    preview.readinessDiagnostics?.length ? "Readiness diagnostics:" : undefined,
    ...(preview.readinessDiagnostics ?? []).map((diagnostic) => `- ${diagnostic}`),
    "",
    "Safety:",
    "- Starts bridge: no",
    "- Runs provider CLI: no",
    "- Inspects Signal Desktop: no",
    "- Reads Signal messages: no",
    "- Reads Signal history: no",
    "- Sends Signal messages: no",
    "- Mutates bindings: no",
    `- Reads provider conversation metadata on apply: ${preview.safety.readsProviderConversationMetadata ? "yes" : "no"}`,
    `- Returns provider message content: ${preview.safety.returnsProviderMessageContent ? "yes" : "no"}`,
    "",
    `Known auth profiles: ${preview.knownAuthProfiles.length}`,
    ...preview.knownAuthProfiles.map((profile) => `- ${profile.profileId}: metadata=${profile.metadataReadable ? "readable" : "unreadable"}, signalCliConfigDir=${profile.signalCliConfigDirPresent ? "present" : "missing"}, account=${profile.accountIdentifierPresent ? "present" : "missing"}, linked=${profile.linkedDevicePresent ? "present" : "missing"}, registration=${profile.registrationMetadataPresent ? "present" : "missing"}, bridgeReadable=${profile.bridgeSessionReadable ? "yes" : "no"}`),
    "",
    `Metadata-only contract: ${preview.metadataOnlyContract.kind}`,
    `Allowed result fields: ${preview.metadataOnlyContract.allowedFields.join(", ")}`,
    `Forbidden payload fields fail closed: ${preview.metadataOnlyContract.forbiddenPayloadFields.join(", ")}`,
    "",
    `Signal session metadata contract: ${preview.sessionMetadataContract.kind}`,
    `Required future readiness fields: ${preview.sessionMetadataContract.requiredFutureFields.join(", ")}`,
    `Allowed readiness fields: ${preview.sessionMetadataContract.allowedReadinessFields.join(", ")}`,
    `Sensitive fields never returned: ${preview.sessionMetadataContract.sensitiveFieldsNeverReturned.join(", ")}`,
    `Message store access required for readiness: ${preview.sessionMetadataContract.messageStoreAccessRequired ? "yes" : "no"}`,
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
    "",
    messagingConversationDirectoryAdapterExecutionText(preview.adapterExecution),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function signalConversationDirectoryResultText(result: SignalConversationDirectoryResult): string {
  const lines = [
    `Signal conversation directory result: ${result.applyStatus}`,
    `Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `Fetched conversations: ${result.fetchedConversationCount}`,
    `Returned conversations: ${result.returnedConversationCount}`,
    `Failure mode: ${result.failureMode}`,
    ...(result.failureHint ? [`Failure hint: ${result.failureHint}`] : []),
    ...(result.error ? [`Error: ${result.error}`] : []),
    "",
    "Conversations:",
  ];
  if (!result.conversations.length) {
    lines.push("- None");
  } else {
    for (const conversation of result.conversations) {
      lines.push(`- ${conversation.conversationId}: ${conversation.title}${conversation.type ? ` (${conversation.type})` : ""}${typeof conversation.unreadCount === "number" ? `, unread=${conversation.unreadCount}` : ""}${conversation.updatedAt ? `, updated=${conversation.updatedAt}` : ""}`);
    }
  }
  lines.push(
    "",
    signalConversationDirectoryPreviewText(result),
  );
  return lines.join("\n");
}

export function signalConversationDirectoryApprovalDetail(preview: SignalConversationDirectoryPreview): string {
  return [
    "Ambient will read a bounded Signal conversation directory from the reviewed local bridge contract.",
    `Profile: ${preview.profileId ?? "unavailable"}`,
    `Limit: ${preview.limit}`,
    preview.query ? `Query: ${preview.query}` : undefined,
    "The bridge request must include metadataOnly=true.",
    "Returned fields are restricted to conversation id, title, type, unread count, folder ids, and updated time.",
    "Signal message history is not read, provider messages are not returned, bindings are not changed, and no Signal messages are sent.",
    "Signal directory apply does not authorize lifecycle, broad inbound ingestion, unread windows, polling, or replies; those require their separate typed Signal tools.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function signalConversationDirectorySetupCard(
  value: SignalConversationDirectoryPreview | SignalConversationDirectoryResult,
): MessagingConversationDirectorySetupCard {
  return messagingConversationDirectorySetupCard({
    providerLabel: value.providerLabel,
    directoryStatus: value.status,
    canApplyNow: value.canApplyNow,
    adapterExecution: value.adapterExecution,
    blockers: value.blockers,
    warnings: value.warnings,
    nextSteps: value.nextSteps,
    conversations: "conversations" in value ? value.conversations : [],
  });
}

function endpointPathFor(input: SignalConversationDirectoryInput & { authProfileId: string }): string {
  const basePath = signalBridgeEndpointPaths(input.authProfileId).conversationDirectory;
  const url = new URL(`http://ambient.local${basePath}`);
  url.searchParams.set("metadataOnly", "true");
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.delete("query");
  if (input.query) url.searchParams.set("query", input.query);
  return `${url.pathname}${url.search}`;
}

function singleProfileId(sessions: MessagingGatewayProviderSessionReadiness[]): string | undefined {
  const usable = sessions.filter((session) => session.metadataReadable && session.bridgeSessionReadable === true);
  return usable.length === 1 ? usable[0].profileId : undefined;
}

function profileSummary(session: MessagingGatewayProviderSessionReadiness): SignalConversationDirectoryPreview["knownAuthProfiles"][number] {
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

async function fetchBridgeJson(url: string, fetchFn: FetchLike): Promise<unknown> {
  const response = await fetchFn(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Signal bridge request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  }
  return await response.json();
}

function blockedFailureMode(preview: SignalConversationDirectoryPreview): SignalConversationDirectoryFailureMode {
  return blockedFailureModeFromBlockers(preview.blockers);
}

function blockedFailureModeFromBlockers(blockerLines: string[]): SignalConversationDirectoryFailureMode {
  const blockers = blockerLines.join("\n").toLowerCase();
  if (blockers.includes("bridge root is not reachable")) return "bridge-unreachable";
  if (blockers.includes("metadataonlyconversationdirectory") || blockers.includes("profilestatus")) return "missing-bridge-capability";
  if (blockers.includes("profile")) return "missing-auth-profile";
  return "unknown";
}

function signalAdapterExecution(
  preview: SignalConversationDirectoryPreview,
  input: {
    executionStatus: "applied" | "blocked" | "denied" | "failed";
    approvalRecorded: boolean;
    fetchedConversationCount?: number;
    returnedConversationCount?: number;
    failureMode?: SignalConversationDirectoryFailureMode;
    failureHint?: string;
    error?: string;
  },
): MessagingConversationDirectoryAdapterExecutionEnvelope {
  return messagingConversationDirectoryAdapterExecutionEnvelope({
    plan: signalConversationDirectoryAdapterPlan({ purpose: preview.purpose, runtimeProvider: preview.runtimeProvider }),
    executionStatus: input.executionStatus,
    approvalRecorded: input.approvalRecorded,
    fetchedConversationCount: input.fetchedConversationCount,
    returnedConversationCount: input.returnedConversationCount,
    failureMode: input.failureMode,
    failureHint: input.failureHint,
    error: input.error,
  });
}

function failedFailureMode(errorText: string): SignalConversationDirectoryFailureMode {
  const normalized = errorText.toLowerCase();
  if (normalized.includes("metadata-only directory contract violation") || normalized.includes("forbidden field")) {
    return "bridge-contract-violation";
  }
  if (normalized.includes("fetch failed") || normalized.includes("econnrefused") || normalized.includes("timed out")) {
    return "bridge-unreachable";
  }
  if (normalized.includes("signal bridge request failed") || normalized.includes("http ")) {
    return "bridge-request-failed";
  }
  return "unknown";
}

function failureHintFor(mode: SignalConversationDirectoryFailureMode): string | undefined {
  switch (mode) {
    case "bridge-unreachable":
      return "Verify the reviewed local Signal bridge root is reachable and that Ambient is using the same bridge URL/port as the running bridge.";
    case "missing-auth-profile":
      return "Run Signal session setup or pass an exact profileId from readiness metadata before applying the directory read.";
    case "missing-bridge-capability":
      return "Expose profileStatus and metadataOnlyConversationDirectory from the reviewed Signal bridge root before applying the directory read.";
    case "bridge-contract-violation":
      return "Update the Signal bridge to honor metadataOnly=true and return only routing metadata, then retry the directory apply.";
    case "bridge-request-failed":
      return "Inspect the bridge status and profile id; the directory endpoint was reached but rejected or failed the request.";
    case "permission-denied":
      return "Ask for explicit user approval before retrying the bounded Signal directory read.";
    case "none":
    case "unknown":
      return undefined;
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
