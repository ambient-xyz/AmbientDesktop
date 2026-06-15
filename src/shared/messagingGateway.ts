export type MessagingBindingPurpose = "remote_ambient_surface" | "messaging_connector";

export type MessagingProviderSource = "first-party" | "addon" | "user-built";

export type MessagingProviderAuthKind = "oauth" | "api-key" | "local-session" | "bridge" | "none";

export type MessagingProviderEventMode = "webhook" | "socket" | "polling" | "local-bridge";

export type MessagingProviderMarkdownSupport = "none" | "basic" | "platform-specific";

export type MessagingProviderHealthStatus = "available" | "degraded" | "not-configured" | "unavailable";

export type MessagingProviderImplementationStatus = "available" | "planned";

export type MessagingBindingStatus = "active" | "paused" | "revoked" | "error";

export type MessagingAmbientSurface = "chat" | "projects" | "workflow_agents" | "settings" | "notifications";

export type MessagingExternalTrustClass = "owner" | "delegate" | "external";

export type RuntimeUxCommandCategory = "settings" | "project" | "workflow" | "chat" | "approval" | "messaging" | "status";

export type RuntimeUxCommandMode = "read" | "mutate";

export type RuntimeUxCommandHeadlessStatus = "ready" | "partial" | "renderer-only" | "planned";

export type RuntimeSurfaceApprovalResponseMode =
  | "deny"
  | "allow_once"
  | "always_thread"
  | "always_workflow"
  | "always_project"
  | "always_workspace";

export interface MessagingProviderAuthDescriptor {
  kind: MessagingProviderAuthKind;
  requiredSecrets: string[];
  requiredScopes?: string[];
  setupNote?: string;
}

export interface MessagingProviderCapabilities {
  text: boolean;
  audio: boolean;
  files: boolean;
  images: boolean;
  typing: boolean;
  readReceipts: boolean;
  reactions: boolean;
  threads: boolean;
  replies: boolean;
  edits: boolean;
  deletes: boolean;
  conversationDiscovery: boolean;
  participantDiscovery: boolean;
}

export interface MessagingProviderLimits {
  maxTextChars?: number;
  maxAttachmentBytes?: number;
  rateLimitSummary?: string;
}

export interface MessagingProviderFormatting {
  markdown: MessagingProviderMarkdownSupport;
  html: boolean;
  linkPreviews: boolean;
}

export interface MessagingProviderDeployment {
  headlessSafe: boolean;
  supportedOperatingSystems: string[];
  requiresWindowing: boolean;
  headlessBrowserSufficient?: boolean;
  localAudioPlaybackRequired?: boolean;
  notes: string[];
}

export interface MessagingProviderImplementation {
  status: MessagingProviderImplementationStatus;
  bindingLifecycleEnabled: boolean;
  runtimeLifecycleEnabled: boolean;
  inboundIngestionEnabled: boolean;
  outboundReplyEnabled: boolean;
  notes: string[];
}

export interface MessagingProviderDescriptor {
  providerId: string;
  label: string;
  source: MessagingProviderSource;
  auth: MessagingProviderAuthDescriptor;
  eventModes: MessagingProviderEventMode[];
  capabilities: MessagingProviderCapabilities;
  limits: MessagingProviderLimits;
  formatting: MessagingProviderFormatting;
  privacyNotes: string[];
  deployment: MessagingProviderDeployment;
  implementation: MessagingProviderImplementation;
  purposeSupport: Record<MessagingBindingPurpose, boolean>;
  installNotes: string[];
  referencePaths?: string[];
}

export interface MessagingProviderHealth {
  providerId: string;
  status: MessagingProviderHealthStatus;
  configured: boolean;
  connected: boolean;
  headlessReady: boolean;
  message: string;
  repairHint?: string;
  checkedAt: string;
}

export interface MessagingProviderSummary {
  descriptor: MessagingProviderDescriptor;
  health: MessagingProviderHealth;
}

export interface MessagingProviderListResult {
  providers: MessagingProviderSummary[];
  providerCount: number;
  availableProviderCount: number;
  headlessReadyProviderCount: number;
}

export interface MessagingBindingDescriptor {
  id: string;
  providerId: string;
  authProfileId: string;
  conversationId: string;
  threadId?: string;
  purpose: MessagingBindingPurpose;
  status: MessagingBindingStatus;
  ownerUserId?: string;
  projectId?: string;
  workflowId?: string;
  chatThreadId?: string;
  ambientSurface?: MessagingAmbientSurface;
  externalTrustClass?: MessagingExternalTrustClass;
  permissionProfileId?: string;
  guardProfileId?: string;
  maxDisclosureLabel?: string;
  headlessSafe?: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string;
  participantPolicy?: Record<string, unknown>;
  mediaPolicy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface MessagingBindingListResult {
  bindings: MessagingBindingDescriptor[];
  bindingCount: number;
  activeBindingCount: number;
  remoteAmbientSurfaceCount: number;
  messagingConnectorCount: number;
  headlessSafeBindingCount: number;
}

export interface MessagingBindingCreateInput {
  providerId: string;
  authProfileId: string;
  conversationId: string;
  threadId?: string;
  purpose: MessagingBindingPurpose;
  ownerUserId?: string;
  projectId?: string;
  workflowId?: string;
  chatThreadId?: string;
  ambientSurface?: MessagingAmbientSurface;
  externalTrustClass?: MessagingExternalTrustClass;
  permissionProfileId?: string;
  guardProfileId?: string;
  maxDisclosureLabel?: string;
  participantPolicy?: Record<string, unknown>;
  mediaPolicy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface MessagingBindingRevokeInput {
  bindingId: string;
  reason?: string;
}

export type MessagingBindingLifecycleAction = "create" | "revoke";

export interface MessagingBindingLifecyclePreview {
  action: MessagingBindingLifecycleAction;
  binding: MessagingBindingDescriptor;
  approvalRequired: boolean;
  wouldPersist: boolean;
  wouldStartBridge: false;
  wouldReadMessages: false;
  wouldSendMessages: false;
  statePath: string;
  policyNotes: string[];
  nextSteps: string[];
}

export interface MessagingBindingLifecycleResult extends MessagingBindingLifecyclePreview {
  persisted: boolean;
}

export interface RuntimeSurfaceWorkflowRecoveryEvent {
  id: string;
  runId: string;
  type: string;
  message?: string;
  graphNodeId?: string;
  graphNodeLabel?: string;
  graphNodeType?: string;
  itemKey?: string;
  createdAt: string;
  retryEligible: boolean;
  retryLabel?: string;
  retryReasons?: string[];
  resumeEligible: boolean;
  resumeLabel?: string;
  resumeReasons?: string[];
  skipEligible: boolean;
  skipLabel?: string;
  skipReasons?: string[];
  commandExamples?: string[];
}

export interface RuntimeSurfaceSnapshot {
  workspace: {
    name: string;
    path: string;
  };
  activeChatId?: string;
  projects: Array<{
    id: string;
    name: string;
    path: string;
    updatedAt: string;
    threadCount: number;
    pinned?: boolean;
    active: boolean;
  }>;
  chats: Array<{
    id: string;
    title: string;
    updatedAt: string;
    permissionMode: string;
    collaborationMode: string;
    model: string;
    thinkingLevel: string;
    active?: boolean;
    messagePreview: string;
  }>;
  workflowAgents: Array<{
    id: string;
    title: string;
    folderId?: string;
    projectPath?: string;
    phase?: string;
    traceMode?: string;
    preview?: string;
    updatedAt?: string;
    latestStatus?: string;
    activeArtifactId?: string;
    activeGraphSnapshotId?: string;
    discoveryQuestionCount?: number;
    answeredDiscoveryQuestionCount?: number;
    unansweredDiscoveryQuestionCount?: number;
    latestVersion?: {
      id: string;
      version: number;
      status: string;
      createdAt: string;
    };
    latestRun?: {
      id: string;
      status: string;
      updatedAt: string;
      completedAt?: string;
      error?: string;
    };
    graphSummary?: string;
    recoveryEvents?: RuntimeSurfaceWorkflowRecoveryEvent[];
    nextCommands?: string[];
    waitingQuestionId?: string;
    waitingQuestion?: string;
    waitingQuestionChoices?: Array<{
      id: string;
      label: string;
      description: string;
      recommended?: boolean;
    }>;
    waitingQuestionAllowFreeform?: boolean;
  }>;
  pendingApprovals: Array<{
    id: string;
    threadId: string;
    toolName: string;
    title: string;
    message: string;
    detailPreview?: string;
    risk: string;
    workspacePath?: string;
    projectPath?: string;
    workflowThreadId?: string;
    responseModes: RuntimeSurfaceApprovalResponseMode[];
  }>;
  permissionGrants: Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
    scopeKind: string;
    actionKind: string;
    targetKind: string;
    targetLabel: string;
    source: string;
    reason: string;
    threadId?: string;
    workflowThreadId?: string;
    projectPath?: string;
    workspacePath?: string;
  }>;
  permissionAudit: Array<{
    id: string;
    threadId: string;
    createdAt: string;
    toolName: string;
    risk: string;
    decision: string;
    reason: string;
    decisionSource?: string;
    grantId?: string;
    detailPreview?: string;
  }>;
  relaySummaries: RuntimeSurfaceRelaySummary[];
  settings: Array<{
    key: string;
    label: string;
    sectionId?: string;
    rowId?: string;
    headlessStatus?: RuntimeUxCommandHeadlessStatus;
    headlessReadable: boolean;
    headlessWritable: boolean;
    requiresApproval?: boolean;
    plannerSafe?: boolean;
    configured: boolean;
    valueSummary?: string;
    values?: Record<string, string | number | boolean>;
    commandExamples?: string[];
    notes?: string[];
  }>;
  limits: {
    projectCount: number;
    chatCount: number;
    workflowAgentCount: number;
    pendingApprovalCount: number;
    permissionGrantCount: number;
    permissionAuditCount: number;
    relaySummaryCount: number;
    returnedProjectCount: number;
    returnedChatCount: number;
    returnedWorkflowAgentCount: number;
    returnedPendingApprovalCount: number;
    returnedPermissionGrantCount: number;
    returnedPermissionAuditCount: number;
    returnedRelaySummaryCount: number;
  };
}

export interface MessagingInboundSender {
  id: string;
  label?: string;
  trustClass?: MessagingExternalTrustClass;
}

export interface MessagingInboundEvent {
  id: string;
  providerId: string;
  authProfileId?: string;
  conversationId: string;
  threadId?: string;
  sender: MessagingInboundSender;
  text: string;
  receivedAt: string;
}

export type MessagingProjectionKind =
  | "binding_required"
  | "surface_choice"
  | "surface_list"
  | "workflow_status"
  | "tool_status"
  | "connector_guardrail"
  | "sender_not_authorized"
  | "unsupported";

export interface MessagingProjectionAction {
  id: string;
  label: string;
  command: string;
  requiresApproval?: boolean;
}

export interface MessagingProjection {
  kind: MessagingProjectionKind;
  purpose?: MessagingBindingPurpose;
  bindingId?: string;
  surface?: MessagingAmbientSurface;
  title: string;
  summary: string;
  bodyLines: string[];
  actions: MessagingProjectionAction[];
  disclosure: {
    includesRuntimeState: boolean;
    includesWorkspacePath: boolean;
    includesPrivateChatState: boolean;
    notes: string[];
  };
}

export interface MessagingPurposePromptContext {
  purpose: MessagingBindingPurpose;
  trustBoundary: string;
  allowedContext: string[];
  forbiddenContext: string[];
  systemPromptLines: string[];
}

export interface MessagingSyntheticRouteResult {
  event: MessagingInboundEvent;
  binding?: MessagingBindingDescriptor;
  projection: MessagingProjection;
  promptContext: MessagingPurposePromptContext;
}

export type MessagingGatewayAdapterState = "stopped" | "synthetic-active" | "starting" | "running" | "stopping" | "error";

export type MessagingGatewayRuntimeState = "idle" | "dispatching" | "error";

export type MessagingGatewayAdapterMode = "none" | "synthetic" | "real";

export type MessagingGatewayBridgeSupervisorState = "missing" | "stopped" | "starting" | "running" | "stopping" | "error";

export interface MessagingGatewayBridgeSupervisorStatus {
  providerId: string;
  state: MessagingGatewayBridgeSupervisorState;
  managed: boolean;
  command: string;
  args: string[];
  cwd: string;
  bridgeBaseUrl: string;
  stateRoot: string;
  envKeys: string[];
  safeRootProbeOnly: boolean;
  pid?: number;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastError?: string;
  recentLogs: string[];
}

export interface MessagingGatewayProviderSessionReadiness {
  profileId: string;
  metadataPath: string;
  metadataReadable: boolean;
  tdlibStateDirPresent: boolean;
  phoneNumberPresent: boolean;
  databaseEncryptionKeyPresent: boolean;
  signalCliConfigDirPresent?: boolean;
  accountIdentifierPresent?: boolean;
  linkedDevicePresent?: boolean;
  registrationMetadataPresent?: boolean;
  bridgeSessionReadable?: boolean;
  error?: string;
}

export interface MessagingGatewayProviderReadiness {
  providerId: string;
  status: MessagingProviderHealthStatus;
  configured: boolean;
  bridgeReachable: boolean;
  bridgeCapabilities?: {
    profileStatus?: boolean;
    metadataOnlyConversationDirectory?: boolean;
    boundedUnreadWindow?: boolean;
    approvedReplySend?: boolean;
  };
  authNeeded: boolean;
  apiCredentialsPresent: boolean;
  persistedSessionCount: number;
  checkedAt: string;
  message: string;
  diagnostics: string[];
  sessions: MessagingGatewayProviderSessionReadiness[];
  bridgeBaseUrl?: string;
  bridgeStateRoot?: string;
  bridgeSessionCount?: number;
  stateRoot?: string;
  repairHint?: string;
}

export type TelegramSessionSetupCardStatus =
  | "preview"
  | "pending"
  | "needs_code"
  | "needs_password"
  | "ready"
  | "blocked"
  | "unknown";

export interface TelegramSessionSetupCardAction {
  id: string;
  label: string;
  title: string;
  prompt: string;
  tone: "primary" | "secondary";
}

export interface TelegramSessionSetupCard {
  kind: "telegram-session-setup";
  providerId: string;
  profileId: string;
  action: string;
  status: TelegramSessionSetupCardStatus;
  title: string;
  summary: string;
  detail: string;
  checkedAt?: string;
  applied?: boolean;
  authState?: {
    state: string;
    ready: boolean;
    needsCode: boolean;
    needsPassword: boolean;
    phoneNumberPresent: boolean;
    message?: string;
  };
  missingInputs: string[];
  primaryAction?: TelegramSessionSetupCardAction;
  secondaryActions: TelegramSessionSetupCardAction[];
  safety: {
    readsProviderMessages: false;
    sendsProviderMessages: false;
    createsBinding: false;
    enablesInboundIngestion: false;
  };
}

export type MessagingConversationDirectorySetupCardStatus =
  | "preview"
  | "applied"
  | "blocked"
  | "denied"
  | "failed";

export type MessagingConversationDirectorySetupCardAdapterStatus = "available" | "blocked";

export type MessagingConversationDirectorySetupCardAdapterKind =
  | "live-metadata-only-adapter"
  | "blocked-contract-skeleton";

export interface MessagingConversationDirectorySetupCardSafety {
  startsBridge: false;
  runsProviderCli: false;
  inspectsProviderDesktop: false;
  readsProviderMessages: false;
  readsProviderHistory: false;
  sendsProviderMessages: false;
  mutatesBindings: false;
}

export interface MessagingConversationDirectorySetupCardConversation {
  conversationId: string;
  title: string;
  type?: string;
  unreadCount?: number;
  folderIds: number[];
  updatedAt?: string;
}

export interface MessagingConversationDirectorySetupCard {
  kind: "messaging-conversation-directory-setup";
  providerId: string;
  providerLabel?: string;
  status: MessagingConversationDirectorySetupCardStatus;
  directoryStatus?: string;
  adapterStatus: MessagingConversationDirectorySetupCardAdapterStatus;
  adapterKind: MessagingConversationDirectorySetupCardAdapterKind;
  previewToolName: string;
  applyToolName?: string;
  requiresApprovalForApply: boolean;
  approvalRecorded: boolean;
  canApplyWithReadiness: boolean;
  canApplyNow: boolean;
  metadataOnlyContractKind: "metadata-only-routing";
  fetchedConversationCount: number;
  returnedConversationCount: number;
  failureMode?: string;
  failureHint?: string;
  blockers: string[];
  warnings: string[];
  nextSteps: string[];
  safety: MessagingConversationDirectorySetupCardSafety;
  conversations: MessagingConversationDirectorySetupCardConversation[];
}

export type MessagingRemoteSurfaceActivationCardStatus =
  | "route_ready"
  | "needs_provider_choice"
  | "unsupported_provider"
  | "blocked"
  | "active"
  | "ready_to_start_polling"
  | "needs_setup";

export type MessagingRemoteSurfaceActivationCardPhaseStatus =
  | "complete"
  | "ready"
  | "waiting"
  | "blocked"
  | "optional";

export interface MessagingRemoteSurfaceActivationCardPhase {
  id: string;
  title: string;
  status: MessagingRemoteSurfaceActivationCardPhaseStatus;
  approvalRequired: boolean;
  nextTool?: string;
  blockerCount: number;
}

export interface MessagingRemoteSurfaceActivationCard {
  kind: "messaging-remote-surface-activation";
  intent: "remote_ambient_surface";
  providerId?: string;
  providerLabel?: string;
  requestedProvider?: string;
  status: MessagingRemoteSurfaceActivationCardStatus;
  title: string;
  summary: string;
  detail: string;
  ambientSurface: MessagingAmbientSurface;
  currentPhase?: MessagingRemoteSurfaceActivationCardPhase;
  phaseChips: MessagingRemoteSurfaceActivationCardPhase[];
  recommendedNextTool?: string;
  delegatedRecommendedNextTool?: string;
  activationPlanFirstTool?: string;
  repairPrompt?: string;
  repairPrompts: string[];
  blockedUntilActivationPlan: string[];
  previewSendSafety: {
    commandPreviewTool: string;
    replyPreviewTool: string;
    providerSendApplyTool: string;
    previewRequiredBeforeProviderSend: true;
    providerSendRequiresSeparateApproval: true;
    providerSendReady: false;
  };
  safety: {
    startsBridge: false;
    listsProviderChats: false;
    readsProviderMessages: false;
    readsProviderHistory: false;
    mutatesBindings: false;
    startsPolling: false;
    sendsProviderMessages: false;
  };
}

export interface MessagingGatewayAdapterRuntimeStatus {
  providerId: string;
  label: string;
  state: MessagingGatewayAdapterState;
  mode: MessagingGatewayAdapterMode;
  syntheticEventCount: number;
  realEventCount: number;
  queuedProjectionCount: number;
  readiness?: MessagingGatewayProviderReadiness;
  lastActivityAt?: string;
  lastError?: string;
}

export interface MessagingGatewayQueuedProjection {
  id: string;
  providerId: string;
  authProfileId?: string;
  conversationId: string;
  threadId?: string;
  sourceEventId: string;
  bindingId?: string;
  purpose?: MessagingBindingPurpose;
  projection: MessagingProjection;
  queuedAt: string;
}

export type MessagingGatewayOutboundDeliveryStatus = "sent" | "blocked" | "denied" | "failed";

export interface MessagingGatewayOutboundDelivery {
  id: string;
  providerId: string;
  authProfileId?: string;
  conversationId: string;
  threadId?: string;
  sourceProjectionId?: string;
  bindingId?: string;
  purpose?: MessagingBindingPurpose;
  replyToMessageId?: string;
  runtimeEventId?: string;
  providerMessageId?: string;
  status: MessagingGatewayOutboundDeliveryStatus;
  textPreview: string;
  textLength: number;
  sentAt: string;
  error?: string;
}

export type MessagingGatewayRemoteSurfaceRuntimeEventKind = "active_project_switch";

export type MessagingGatewayRemoteSurfaceRuntimeEventStatus = "pending" | "completed" | "failed" | "canceled";

export type MessagingGatewayRemoteSurfaceRuntimeEventRelayStatus = "sent" | "failed" | "denied" | "blocked";

export interface MessagingGatewayRemoteSurfaceRuntimeEvent {
  id: string;
  kind: MessagingGatewayRemoteSurfaceRuntimeEventKind;
  status: MessagingGatewayRemoteSurfaceRuntimeEventStatus;
  title: string;
  summary: string;
  threadId?: string;
  queuedProjectionId?: string;
  sourceEventId?: string;
  replyToMessageId?: string;
  bindingId?: string;
  projectName?: string;
  scheduledAt: string;
  completedAt?: string;
  failedAt?: string;
  canceledAt?: string;
  error?: string;
  relaySuggested: boolean;
  relayStatus?: MessagingGatewayRemoteSurfaceRuntimeEventRelayStatus;
  relayProviderId?: string;
  relayDeliveryId?: string;
  relayedAt?: string;
  relayError?: string;
}

export type RuntimeSurfaceRelayActionStatus =
  | "waiting"
  | "preview-ready"
  | "repair-needed"
  | "already-relayed"
  | "not-suggested";

export interface RuntimeSurfaceRelaySummary {
  runtimeEventId: string;
  title: string;
  eventStatus: MessagingGatewayRemoteSurfaceRuntimeEventStatus;
  relayActionStatus: RuntimeSurfaceRelayActionStatus;
  relaySuggested: boolean;
  duplicateBlocked: boolean;
  summary: string;
  projectName?: string;
  queuedProjectionId?: string;
  bindingId?: string;
  targetProviderId?: string;
  targetProviderLabel?: string;
  relayStatus?: MessagingGatewayRemoteSurfaceRuntimeEventRelayStatus;
  relayProviderId?: string;
  relayDeliveryId?: string;
  previewToolName?: string;
  applyToolName?: string;
  diagnosticsToolName?: string;
  previewCommand?: string;
  applyCommand?: string;
  diagnosticsCommand?: string;
  nextAction: string;
  repairHint?: string;
}

export interface MessagingGatewayRuntimeStatus {
  status: MessagingGatewayRuntimeState;
  providerCount: number;
  activeProviderCount: number;
  syntheticActiveProviderCount: number;
  queuedProjectionCount: number;
  recentEventCount: number;
  outboundDeliveryCount: number;
  providers: MessagingGatewayAdapterRuntimeStatus[];
  queuedProjections: MessagingGatewayQueuedProjection[];
  recentOutboundDeliveries: MessagingGatewayOutboundDelivery[];
  recentEvents: MessagingInboundEvent[];
  remoteSurfaceRuntimeEvents?: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  remoteSurfaceRelaySummaries?: RuntimeSurfaceRelaySummary[];
  pendingRemoteSurfaceRuntimeEventCount?: number;
  recentRemoteSurfaceRuntimeEventCount?: number;
  relayableRemoteSurfaceRuntimeEventCount?: number;
  alreadyRelayedRemoteSurfaceRuntimeEventCount?: number;
  lastError?: string;
}

export type MessagingRelayDiagnosticsStatus = "ready" | "blocked" | "synthetic-only";

export interface MessagingRelayDiagnosticsOwnerBindingSummary {
  bindingId: string;
  providerId: string;
  authProfileId: string;
  conversationId: string;
  ambientSurface?: MessagingAmbientSurface;
  maxDisclosureLabel?: string;
}

export interface MessagingRelayDiagnosticsProjectionSummary {
  queuedProjectionId: string;
  providerId: string;
  bindingId?: string;
  conversationId: string;
  queuedAt: string;
}

export interface MessagingRelayDiagnosticsRuntimeEventSummary {
  runtimeEventId: string;
  kind: MessagingGatewayRemoteSurfaceRuntimeEventKind;
  status: MessagingGatewayRemoteSurfaceRuntimeEventStatus;
  title: string;
  projectName?: string;
  queuedProjectionId?: string;
  bindingId?: string;
  relayStatus?: MessagingGatewayRemoteSurfaceRuntimeEventRelayStatus;
  relaySuggested: boolean;
}

export interface MessagingRelayDiagnosticsDeliverySummary {
  deliveryId: string;
  providerId: string;
  bindingId?: string;
  sourceProjectionId?: string;
  runtimeEventId?: string;
  status: MessagingGatewayOutboundDeliveryStatus;
  sentAt: string;
}

export interface MessagingRelayDiagnosticsResult {
  providerId: string;
  providerLabel: string;
  status: MessagingRelayDiagnosticsStatus;
  bridgeModeLabel: string;
  canSendOwnerRelayNow: boolean;
  runtimeState: MessagingGatewayAdapterState | "unknown";
  runtimeMode: MessagingGatewayAdapterMode | "unknown";
  readinessStatus: MessagingProviderHealthStatus | "unknown";
  bridgeReachable: boolean;
  sessionMetadataConfigured: boolean;
  apiCredentialsPresent: boolean;
  selectedOwnerBindings: MessagingRelayDiagnosticsOwnerBindingSummary[];
  queuedOwnerProjections: MessagingRelayDiagnosticsProjectionSummary[];
  relayableRuntimeEvents: MessagingRelayDiagnosticsRuntimeEventSummary[];
  recentRuntimeEvents: MessagingRelayDiagnosticsRuntimeEventSummary[];
  recentRelayDeliveries: MessagingRelayDiagnosticsDeliverySummary[];
  providerSpecificAssumptions: string[];
  blockers: string[];
  repairSteps: string[];
  warnings: string[];
  nextSteps: string[];
  safety: {
    readsProviderMessages: false;
    sendsProviderMessages: false;
    startsBridge: false;
    readsProviderHistory: false;
    mutatesBindings: false;
  };
}

export interface MessagingSecondProviderReadinessChecklistItem {
  id: string;
  label: string;
  required: boolean;
  status: "ready" | "planned" | "unknown";
  notes: string[];
}

export interface MessagingSecondProviderReadinessChecklist {
  providerCandidate: string;
  purpose: MessagingBindingPurpose;
  headlessSafeTarget: boolean;
  items: MessagingSecondProviderReadinessChecklistItem[];
  providerSpecificQuestions: string[];
}

export type MessagingGatewayLifecycleAction = "start" | "stop";

export type MessagingGatewayLifecycleMode = "synthetic" | "real";

export interface MessagingGatewayLifecyclePreview {
  action: MessagingGatewayLifecycleAction;
  providerId: string;
  label: string;
  mode: MessagingGatewayLifecycleMode;
  approvalRequired: boolean;
  canApplyNow: boolean;
  wouldStartRealBridge: boolean;
  wouldStopRealBridge: boolean;
  wouldAttachExistingBridge: boolean;
  wouldLaunchBridgeProcess: boolean;
  wouldStopBridgeProcess: boolean;
  wouldDetachRunnerOnly: boolean;
  wouldReadProviderMessages: boolean;
  wouldSendProviderMessages: boolean;
  bridgeSupervisor?: MessagingGatewayBridgeSupervisorStatus;
  readiness?: MessagingGatewayProviderReadiness;
  policyNotes: string[];
  nextSteps: string[];
}

export type MessagingGatewayLifecycleApplyStatus = "applied" | "blocked" | "denied";

export interface MessagingGatewayLifecycleApplyResult extends MessagingGatewayLifecyclePreview {
  applyStatus: MessagingGatewayLifecycleApplyStatus;
  applied: boolean;
  approvalRecorded: boolean;
  blockedReason?: string;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}

export interface RuntimeUxCommandDescriptor {
  id: string;
  label: string;
  category: RuntimeUxCommandCategory;
  mode: RuntimeUxCommandMode;
  headlessStatus: RuntimeUxCommandHeadlessStatus;
  toolName?: string;
  toolNames?: string[];
  commandExamples?: string[];
  ipcChannel?: string;
  requiresApproval: boolean;
  plannerSafe: boolean;
  notes: string[];
}

export interface RuntimeUxSettingDescriptor {
  key: string;
  label: string;
  sectionId: string;
  rowId: string;
  headlessStatus: RuntimeUxCommandHeadlessStatus;
  headlessReadable: boolean;
  headlessWritable: boolean;
  requiresApproval: boolean;
  plannerSafe: boolean;
  toolNames?: string[];
  commandExamples?: string[];
  notes: string[];
}

export interface RuntimeUxInventoryResult {
  commands: RuntimeUxCommandDescriptor[];
  settingsCatalog: RuntimeUxSettingDescriptor[];
  commandCount: number;
  headlessReadyCount: number;
  partialCount: number;
  rendererOnlyCount: number;
  plannedCount: number;
  settingCount: number;
  settingReadyCount: number;
  settingPartialCount: number;
  settingRendererOnlyCount: number;
  settingPlannedCount: number;
}

export const defaultMessagingProviderCapabilities: MessagingProviderCapabilities = {
  text: false,
  audio: false,
  files: false,
  images: false,
  typing: false,
  readReceipts: false,
  reactions: false,
  threads: false,
  replies: false,
  edits: false,
  deletes: false,
  conversationDiscovery: false,
  participantDiscovery: false,
};

export function messagingProviderCapabilityNames(capabilities: MessagingProviderCapabilities): string[] {
  return Object.entries(capabilities)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .sort();
}
