import type {
  MessagingBindingPurpose,
  MessagingConversationDirectorySetupCard,
  MessagingConversationDirectorySetupCardConversation,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../shared/messagingGateway";
import {
  messagingConversationDirectoryMetadataContract,
  type MessagingConversationDirectoryMetadataContract,
} from "./messagingConversationDirectoryContract";

export type MessagingConversationDirectoryAdapterStatus = "available" | "blocked";

export type MessagingConversationDirectoryAdapterKind =
  | "live-metadata-only-adapter"
  | "blocked-contract-skeleton";

export interface MessagingConversationDirectoryAdapterSafety {
  startsBridge: false;
  readsProviderMessages: false;
  readsProviderHistory: false;
  sendsProviderMessages: false;
  mutatesBindings: false;
  runsProviderCli: false;
  inspectsProviderDesktop: false;
}

export interface MessagingConversationDirectoryAdapterPlan {
  providerId: string;
  status: MessagingConversationDirectoryAdapterStatus;
  kind: MessagingConversationDirectoryAdapterKind;
  previewToolName: string;
  applyToolName?: string;
  metadataOnlyContract: MessagingConversationDirectoryMetadataContract;
  requiresApprovalForApply: boolean;
  canApplyWithReadiness: boolean;
  safety: MessagingConversationDirectoryAdapterSafety;
  readinessBlockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
}

export type MessagingConversationDirectoryAdapterExecutionStatus =
  | "preview"
  | "applied"
  | "blocked"
  | "denied"
  | "failed";

export interface MessagingConversationDirectoryAdapterExecutionEnvelope {
  kind: "messaging-conversation-directory-adapter-execution";
  providerId: string;
  adapterStatus: MessagingConversationDirectoryAdapterStatus;
  adapterKind: MessagingConversationDirectoryAdapterKind;
  previewToolName: string;
  applyToolName?: string;
  executionStatus: MessagingConversationDirectoryAdapterExecutionStatus;
  requiresApprovalForApply: boolean;
  approvalRecorded: boolean;
  canApplyWithReadiness: boolean;
  metadataOnlyContract: MessagingConversationDirectoryMetadataContract;
  safety: MessagingConversationDirectoryAdapterSafety;
  fetchedConversationCount: number;
  returnedConversationCount: number;
  failureMode?: string;
  failureHint?: string;
  error?: string;
}

export interface MessagingConversationDirectoryAdapterContext {
  descriptor: MessagingProviderDescriptor;
  purpose: MessagingBindingPurpose;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
}

export interface MessagingConversationDirectoryAdapter {
  providerId: string;
  plan(context: MessagingConversationDirectoryAdapterContext): MessagingConversationDirectoryAdapterPlan;
}

export class MessagingConversationDirectoryAdapterRegistry {
  private readonly adapters = new Map<string, MessagingConversationDirectoryAdapter>();

  register(adapter: MessagingConversationDirectoryAdapter): void {
    const providerId = adapter.providerId.trim();
    if (!providerId) throw new Error("Messaging conversation-directory adapter requires providerId.");
    if (this.adapters.has(providerId)) {
      throw new Error(`Messaging conversation-directory adapter already registered: ${providerId}`);
    }
    this.adapters.set(providerId, { ...adapter, providerId });
  }

  get(providerId: string): MessagingConversationDirectoryAdapter | undefined {
    return this.adapters.get(providerId.trim());
  }

  plansForDescriptors(input: {
    descriptors: MessagingProviderDescriptor[];
    purpose: MessagingBindingPurpose;
    runtimeStatus?: MessagingGatewayRuntimeStatus;
  }): Map<string, MessagingConversationDirectoryAdapterPlan> {
    const plans = new Map<string, MessagingConversationDirectoryAdapterPlan>();
    for (const descriptor of input.descriptors) {
      const adapter = this.get(descriptor.providerId);
      if (!adapter) continue;
      plans.set(descriptor.providerId, adapter.plan({
        descriptor,
        purpose: input.purpose,
        runtimeProvider: input.runtimeStatus?.providers.find((provider) => provider.providerId === descriptor.providerId),
      }));
    }
    return plans;
  }
}

export function createDefaultMessagingConversationDirectoryAdapterRegistry(): MessagingConversationDirectoryAdapterRegistry {
  const registry = new MessagingConversationDirectoryAdapterRegistry();
  registry.register(telegramConversationDirectoryAdapter());
  registry.register(signalConversationDirectoryAdapter());
  return registry;
}

export function telegramConversationDirectoryAdapter(): MessagingConversationDirectoryAdapter {
  return {
    providerId: "telegram-tdlib",
    plan: ({ descriptor, runtimeProvider }) => {
      const readinessBlockers = telegramReadinessBlockers(runtimeProvider);
      return {
        providerId: descriptor.providerId,
        status: "available",
        kind: "live-metadata-only-adapter",
        previewToolName: "ambient_messaging_telegram_conversation_directory_preview",
        applyToolName: "ambient_messaging_telegram_conversation_directory_apply",
        metadataOnlyContract: messagingConversationDirectoryMetadataContract(),
        requiresApprovalForApply: true,
        canApplyWithReadiness: readinessBlockers.length === 0,
        safety: noProviderIoSafety(),
        readinessBlockers,
        warnings: [
          "Telegram directory apply reads provider conversation metadata only after explicit approval; preview remains no-I/O.",
        ],
        policyNotes: [
          "Telegram directory adapter uses the reviewed local bridge metadata-only chat-list endpoint.",
          "Telegram directory apply is approval-gated and rejects provider-message payload fields instead of cleaning them for Pi.",
        ],
        nextSteps: readinessBlockers.length
          ? [
            "Use ambient_messaging_telegram_conversation_directory_preview to inspect Telegram-specific blockers before apply.",
            "Do not use shell, browser, Telegram Desktop UI, or provider CLIs as a fallback for chat discovery.",
          ]
          : [
            "Use ambient_messaging_telegram_conversation_directory_preview, then request approval for ambient_messaging_telegram_conversation_directory_apply.",
            "Use the returned metadata-only conversation id with the purpose-specific binding preview.",
          ],
      };
    },
  };
}

export function signalConversationDirectoryAdapter(): MessagingConversationDirectoryAdapter {
  return {
    providerId: "signal-cli",
    plan: ({ descriptor, runtimeProvider }) => {
      const readinessBlockers = signalReadinessBlockers(runtimeProvider);
      return {
        providerId: descriptor.providerId,
        status: "available",
        kind: "live-metadata-only-adapter",
        previewToolName: "ambient_messaging_signal_conversation_directory_preview",
        applyToolName: "ambient_messaging_signal_conversation_directory_apply",
        metadataOnlyContract: messagingConversationDirectoryMetadataContract(),
        requiresApprovalForApply: true,
        canApplyWithReadiness: readinessBlockers.length === 0,
        safety: noProviderIoSafety(),
        readinessBlockers,
        warnings: [
          "Signal Desktop availability is not a supported provider readiness signal.",
          "Signal directory apply reads provider conversation metadata only through the reviewed local bridge contract after explicit approval.",
          "Signal directory metadata alone does not enable lifecycle, broad inbound ingestion, unread windows, polling, or replies; use the separate typed Signal tools for each reviewed path.",
          "Do not run signal-cli, inspect Signal Desktop storage, browse app UI, or infer conversation ids from message history.",
        ],
        policyNotes: [
          "Signal directory adapter uses the reviewed local bridge metadata-only conversation-directory endpoint when bridge readiness proves the contract.",
          "Signal directory apply is approval-gated and rejects provider-message payload fields instead of cleaning them for Pi.",
          "Signal directory metadata does not enable bindings, inbound ingestion, unread windows, polling, or replies.",
        ],
        nextSteps: readinessBlockers.length
          ? [
            "Use ambient_messaging_signal_conversation_directory_preview to inspect Signal-specific bridge/profile blockers before apply.",
            "Do not use shell, browser, Signal Desktop UI, provider CLIs, or Telegram-specific tools as a fallback for Signal conversation discovery.",
          ]
          : [
            "Use ambient_messaging_signal_conversation_directory_preview, then request approval for ambient_messaging_signal_conversation_directory_apply.",
            "Use the returned metadata-only conversation id only with a later purpose-specific binding preview.",
          ],
      };
    },
  };
}

export function telegramConversationDirectoryAdapterPlan(input: {
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  purpose?: MessagingBindingPurpose;
} = {}): MessagingConversationDirectoryAdapterPlan {
  return telegramConversationDirectoryAdapter().plan({
    descriptor: {
      providerId: "telegram-tdlib",
      label: "Telegram",
    } as MessagingProviderDescriptor,
    purpose: input.purpose ?? "remote_ambient_surface",
    runtimeProvider: input.runtimeProvider,
  });
}

export function signalConversationDirectoryAdapterPlan(input: {
  purpose?: MessagingBindingPurpose;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
} = {}): MessagingConversationDirectoryAdapterPlan {
  return signalConversationDirectoryAdapter().plan({
    descriptor: {
      providerId: "signal-cli",
      label: "Signal",
    } as MessagingProviderDescriptor,
    purpose: input.purpose ?? "remote_ambient_surface",
    runtimeProvider: input.runtimeProvider,
  });
}

export function messagingConversationDirectoryAdapterExecutionEnvelope(input: {
  plan: MessagingConversationDirectoryAdapterPlan;
  executionStatus: MessagingConversationDirectoryAdapterExecutionStatus;
  approvalRecorded: boolean;
  fetchedConversationCount?: number;
  returnedConversationCount?: number;
  failureMode?: string;
  failureHint?: string;
  error?: string;
}): MessagingConversationDirectoryAdapterExecutionEnvelope {
  return {
    kind: "messaging-conversation-directory-adapter-execution",
    providerId: input.plan.providerId,
    adapterStatus: input.plan.status,
    adapterKind: input.plan.kind,
    previewToolName: input.plan.previewToolName,
    ...(input.plan.applyToolName ? { applyToolName: input.plan.applyToolName } : {}),
    executionStatus: input.executionStatus,
    requiresApprovalForApply: input.plan.requiresApprovalForApply,
    approvalRecorded: input.approvalRecorded,
    canApplyWithReadiness: input.plan.canApplyWithReadiness,
    metadataOnlyContract: input.plan.metadataOnlyContract,
    safety: input.plan.safety,
    fetchedConversationCount: Math.max(0, Math.floor(input.fetchedConversationCount ?? 0)),
    returnedConversationCount: Math.max(0, Math.floor(input.returnedConversationCount ?? 0)),
    ...(input.failureMode ? { failureMode: input.failureMode } : {}),
    ...(input.failureHint ? { failureHint: input.failureHint } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
}

export function messagingConversationDirectoryAdapterExecutionText(
  envelope: MessagingConversationDirectoryAdapterExecutionEnvelope,
): string {
  return [
    "Directory adapter execution:",
    `- Provider: ${envelope.providerId}`,
    `- Adapter status: ${envelope.adapterStatus}`,
    `- Adapter kind: ${envelope.adapterKind}`,
    `- Execution status: ${envelope.executionStatus}`,
    `- Preview tool: ${envelope.previewToolName}`,
    `- Apply tool: ${envelope.applyToolName ?? "none"}`,
    `- Apply approval required: ${envelope.requiresApprovalForApply ? "yes" : "no"}`,
    `- Approval recorded: ${envelope.approvalRecorded ? "yes" : "no"}`,
    `- Readiness allows apply: ${envelope.canApplyWithReadiness ? "yes" : "no"}`,
    `- Fetched conversations: ${envelope.fetchedConversationCount}`,
    `- Returned conversations: ${envelope.returnedConversationCount}`,
    envelope.failureMode ? `- Failure mode: ${envelope.failureMode}` : undefined,
    envelope.failureHint ? `- Failure hint: ${envelope.failureHint}` : undefined,
    envelope.error ? `- Error: ${envelope.error}` : undefined,
    `- Metadata-only contract: ${envelope.metadataOnlyContract.kind}`,
    `- Starts bridge: ${envelope.safety.startsBridge ? "yes" : "no"}`,
    `- Runs provider CLI: ${envelope.safety.runsProviderCli ? "yes" : "no"}`,
    `- Inspects provider desktop: ${envelope.safety.inspectsProviderDesktop ? "yes" : "no"}`,
    `- Reads provider messages: ${envelope.safety.readsProviderMessages ? "yes" : "no"}`,
    `- Reads provider history: ${envelope.safety.readsProviderHistory ? "yes" : "no"}`,
    `- Sends provider messages: ${envelope.safety.sendsProviderMessages ? "yes" : "no"}`,
    `- Mutates bindings: ${envelope.safety.mutatesBindings ? "yes" : "no"}`,
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function messagingConversationDirectorySetupCard(input: {
  providerLabel?: string;
  directoryStatus?: string;
  canApplyNow: boolean;
  adapterExecution: MessagingConversationDirectoryAdapterExecutionEnvelope;
  blockers?: string[];
  warnings?: string[];
  nextSteps?: string[];
  conversations?: MessagingConversationDirectorySetupCardConversation[];
}): MessagingConversationDirectorySetupCard {
  const conversations = (input.conversations ?? []).map(sanitizeDirectoryCardConversation).filter((conversation): conversation is MessagingConversationDirectorySetupCardConversation => Boolean(conversation));
  return {
    kind: "messaging-conversation-directory-setup",
    providerId: input.adapterExecution.providerId,
    ...(input.providerLabel ? { providerLabel: input.providerLabel } : {}),
    status: input.adapterExecution.executionStatus,
    ...(input.directoryStatus ? { directoryStatus: input.directoryStatus } : {}),
    adapterStatus: input.adapterExecution.adapterStatus,
    adapterKind: input.adapterExecution.adapterKind,
    previewToolName: input.adapterExecution.previewToolName,
    ...(input.adapterExecution.applyToolName ? { applyToolName: input.adapterExecution.applyToolName } : {}),
    requiresApprovalForApply: input.adapterExecution.requiresApprovalForApply,
    approvalRecorded: input.adapterExecution.approvalRecorded,
    canApplyWithReadiness: input.adapterExecution.canApplyWithReadiness,
    canApplyNow: input.canApplyNow,
    metadataOnlyContractKind: input.adapterExecution.metadataOnlyContract.kind,
    fetchedConversationCount: input.adapterExecution.fetchedConversationCount,
    returnedConversationCount: input.adapterExecution.returnedConversationCount,
    ...(input.adapterExecution.failureMode ? { failureMode: input.adapterExecution.failureMode } : {}),
    ...(input.adapterExecution.failureHint ? { failureHint: input.adapterExecution.failureHint } : {}),
    blockers: [...(input.blockers ?? [])],
    warnings: [...(input.warnings ?? [])],
    nextSteps: [...(input.nextSteps ?? [])],
    safety: input.adapterExecution.safety,
    conversations,
  };
}

function telegramReadinessBlockers(
  runtimeProvider: MessagingGatewayRuntimeStatus["providers"][number] | undefined,
): string[] {
  const blockers: string[] = [];
  const readiness = runtimeProvider?.readiness;
  if (!runtimeProvider || runtimeProvider.state !== "running" || runtimeProvider.mode !== "real") {
    blockers.push("Telegram provider directory adapter requires the Telegram provider to be running in real mode.");
  }
  if (!readiness) {
    blockers.push("Telegram provider directory adapter requires refreshed Telegram readiness.");
    return blockers;
  }
  if (!readiness.configured) blockers.push("Telegram provider directory adapter requires configured local session metadata.");
  if (!readiness.bridgeReachable) blockers.push("Telegram provider directory adapter requires a reachable local Telegram bridge.");
  if (!readiness.apiCredentialsPresent) blockers.push("Telegram provider directory adapter requires Telegram API credentials in the runtime environment.");
  return blockers;
}

function signalReadinessBlockers(
  runtimeProvider: MessagingGatewayRuntimeStatus["providers"][number] | undefined,
): string[] {
  const blockers: string[] = [];
  const readiness = runtimeProvider?.readiness;
  if (!runtimeProvider) {
    blockers.push("Signal provider directory adapter requires Signal runtime status.");
  }
  if (!readiness) {
    blockers.push("Signal provider directory adapter requires refreshed Signal readiness.");
    return blockers;
  }
  if (!readiness.bridgeReachable) blockers.push("Signal provider directory adapter requires a reachable reviewed local Signal bridge.");
  if (!readiness.bridgeCapabilities?.profileStatus) blockers.push("Signal provider directory adapter requires the bridge to advertise profileStatus.");
  if (!readiness.bridgeCapabilities?.metadataOnlyConversationDirectory) blockers.push("Signal provider directory adapter requires the bridge to advertise metadataOnlyConversationDirectory.");
  if (!readiness.configured) blockers.push("Signal provider directory adapter requires reviewed bridge-readable Signal session metadata.");
  if (!readiness.sessions.some((session) => session.metadataReadable && session.bridgeSessionReadable === true)) {
    blockers.push("Signal provider directory adapter requires a readable profile with bridgeSessionReadable=true.");
  }
  return blockers;
}

function noProviderIoSafety(): MessagingConversationDirectoryAdapterSafety {
  return {
    startsBridge: false,
    readsProviderMessages: false,
    readsProviderHistory: false,
    sendsProviderMessages: false,
    mutatesBindings: false,
    runsProviderCli: false,
    inspectsProviderDesktop: false,
  };
}

function sanitizeDirectoryCardConversation(
  value: MessagingConversationDirectorySetupCardConversation,
): MessagingConversationDirectorySetupCardConversation | undefined {
  const conversationId = value.conversationId.trim();
  const title = value.title.trim();
  if (!conversationId || !title) return undefined;
  return {
    conversationId,
    title,
    ...(value.type?.trim() ? { type: value.type.trim() } : {}),
    ...(typeof value.unreadCount === "number" && Number.isFinite(value.unreadCount) ? { unreadCount: Math.max(0, Math.floor(value.unreadCount)) } : {}),
    folderIds: Array.isArray(value.folderIds)
      ? value.folderIds
        .map((folderId) => typeof folderId === "number" && Number.isFinite(folderId) ? Math.floor(folderId) : undefined)
        .filter((folderId): folderId is number => folderId !== undefined)
      : [],
    ...(value.updatedAt?.trim() ? { updatedAt: value.updatedAt.trim() } : {}),
  };
}
