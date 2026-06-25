import type {
  MessagingConversationDirectorySetupCard,
  MessagingConversationDirectorySetupCardConversation,
  MessagingRemoteSurfaceActivationCard,
  MessagingRemoteSurfaceActivationCardPhase,
  TelegramSessionSetupCard,
} from "../../shared/messagingGateway";
import {
  booleanField,
  formatCompactTaskState,
  nonEmptyTextField,
  numberField,
  recordValue,
  stringArrayField,
} from "./toolMessageMetadataFields";

export type ToolTelegramSessionSetupPreviewData = TelegramSessionSetupCard;
export type ToolMessagingConversationDirectorySetupPreviewData = MessagingConversationDirectorySetupCard;
export type ToolMessagingRemoteSurfaceActivationPreviewData = MessagingRemoteSurfaceActivationCard;

export type ToolMessagingConversationDirectorySetupTone = "success" | "warning" | "danger" | "info";

export type ToolMessagingConversationDirectorySetupCardViewModel = {
  tone: ToolMessagingConversationDirectorySetupTone;
  title: string;
  summary: string;
  detail: string;
  icon: "success" | "attention" | "directory";
  rows: Array<{ label: string; value: string }>;
  notes: string[];
  noteKind: "blocker" | "warning" | "next-step" | "none";
  conversationChips: Array<{ label: string; title: string }>;
  safetyChips: string[];
};

export type ToolMessagingRemoteSurfaceActivationTone = "success" | "warning" | "danger" | "info";

export type ToolMessagingRemoteSurfaceActivationCardViewModel = {
  tone: ToolMessagingRemoteSurfaceActivationTone;
  title: string;
  summary: string;
  detail: string;
  icon: "success" | "attention" | "route";
  actions: Array<{
    id: "continue" | "repair" | "provider-onboarding";
    label: string;
    title: string;
    prompt: string;
    tone: "primary" | "secondary";
  }>;
  rows: Array<{ label: string; value: string }>;
  notes: string[];
  phaseChips: Array<{ label: string; title: string; tone: ToolMessagingRemoteSurfaceActivationTone }>;
  safetyChips: string[];
};

export function toolMessagingConversationDirectorySetupCardViewModel(
  card: ToolMessagingConversationDirectorySetupPreviewData,
): ToolMessagingConversationDirectorySetupCardViewModel {
  const providerTitle = card.providerLabel ?? card.providerId;
  const tone = messagingConversationDirectorySetupTone(card);
  const notes = card.blockers.length ? card.blockers : card.warnings.length ? card.warnings : card.nextSteps;
  const noteKind = card.blockers.length ? "blocker" : card.warnings.length ? "warning" : card.nextSteps.length ? "next-step" : "none";
  const conversationChips = card.conversations.slice(0, 8).map((conversation) => ({
    label: `${conversation.title}${typeof conversation.unreadCount === "number" && conversation.unreadCount > 0 ? ` (${conversation.unreadCount})` : ""}`,
    title: conversation.conversationId,
  }));
  const hiddenConversationCount = Math.max(0, card.conversations.length - conversationChips.length);
  if (hiddenConversationCount > 0) {
    conversationChips.push({
      label: `${hiddenConversationCount.toLocaleString()} more`,
      title: `${hiddenConversationCount.toLocaleString()} additional conversation metadata row(s) omitted from this compact card`,
    });
  }
  return {
    tone,
    title: `${providerTitle} conversation directory`,
    summary: messagingConversationDirectorySetupSummary(card),
    detail:
      card.failureHint ??
      (card.canApplyNow
        ? "Ready for an approved metadata-only directory read."
        : "Blocked until provider readiness or adapter support is available."),
    icon: card.status === "applied" ? "success" : card.status === "blocked" || card.status === "failed" ? "attention" : "directory",
    rows: [
      { label: "Provider", value: card.providerLabel ? `${card.providerLabel} (${card.providerId})` : card.providerId },
      { label: "State", value: messagingConversationDirectorySetupStatusLabel(card.status) },
      card.directoryStatus ? { label: "Directory", value: formatCompactTaskState(card.directoryStatus) } : undefined,
      { label: "Adapter", value: `${card.adapterStatus} / ${card.adapterKind}` },
      { label: "Preview tool", value: card.previewToolName },
      card.applyToolName ? { label: "Apply tool", value: card.applyToolName } : undefined,
      { label: "Approval", value: card.requiresApprovalForApply ? (card.approvalRecorded ? "recorded" : "required") : "not required" },
      {
        label: "Counts",
        value: `${card.returnedConversationCount.toLocaleString()}/${card.fetchedConversationCount.toLocaleString()} returned`,
      },
      card.failureMode ? { label: "Failure", value: card.failureMode } : undefined,
    ].filter((row): row is { label: string; value: string } => Boolean(row?.value)),
    notes: notes.slice(0, 3),
    noteKind,
    conversationChips,
    safetyChips: ["No message reads", "No history", "No sends", "No provider CLI", "No desktop scrape", "No bindings"],
  };
}

export function toolMessagingRemoteSurfaceActivationCardViewModel(
  card: ToolMessagingRemoteSurfaceActivationPreviewData,
): ToolMessagingRemoteSurfaceActivationCardViewModel {
  const tone = messagingRemoteSurfaceActivationTone(card);
  const phase = card.currentPhase;
  const phaseChips = card.phaseChips.slice(0, 8).map((item) => ({
    label: `${shortActivationPhaseLabel(item)}: ${formatCompactTaskState(item.status)}`,
    title: item.nextTool ? `${item.title} · ${item.nextTool}` : item.title,
    tone: messagingRemoteSurfaceActivationPhaseTone(item),
  }));
  const hiddenPhaseCount = Math.max(0, card.phaseChips.length - phaseChips.length);
  if (hiddenPhaseCount > 0) {
    phaseChips.push({
      label: `${hiddenPhaseCount.toLocaleString()} more`,
      title: `${hiddenPhaseCount.toLocaleString()} activation phase(s) omitted from this compact card`,
      tone: "info",
    });
  }
  return {
    tone,
    title: card.title,
    summary: card.summary,
    detail: card.detail,
    icon: tone === "success" ? "success" : tone === "danger" || tone === "warning" ? "attention" : "route",
    actions: messagingRemoteSurfaceActivationActions(card),
    rows: [
      { label: "Surface", value: card.ambientSurface },
      card.providerLabel || card.providerId
        ? {
            label: "Provider",
            value: card.providerLabel ? `${card.providerLabel}${card.providerId ? ` (${card.providerId})` : ""}` : card.providerId!,
          }
        : undefined,
      { label: "State", value: messagingRemoteSurfaceActivationStatusLabel(card.status) },
      phase ? { label: "Current phase", value: phase.title } : undefined,
      phase?.nextTool ? { label: "Phase tool", value: phase.nextTool } : undefined,
      card.recommendedNextTool ? { label: "Next tool", value: card.recommendedNextTool } : undefined,
      card.delegatedRecommendedNextTool ? { label: "After plan", value: card.delegatedRecommendedNextTool } : undefined,
      card.activationPlanFirstTool ? { label: "Plan first", value: card.activationPlanFirstTool } : undefined,
      card.blockedUntilActivationPlan.length
        ? { label: "Blocked tools", value: `${card.blockedUntilActivationPlan.length.toLocaleString()} until activation plan` }
        : undefined,
      {
        label: "Provider send",
        value: card.previewSendSafety.providerSendRequiresSeparateApproval ? "separate approval required" : "not approved",
      },
    ].filter((row): row is { label: string; value: string } => Boolean(row?.value)),
    notes: (card.repairPrompts.length ? card.repairPrompts : card.repairPrompt ? [card.repairPrompt] : []).slice(0, 3),
    phaseChips,
    safetyChips: ["No bridge start", "No message reads", "No history", "No sends", "No polling start", "Preview before send"],
  };
}

export function extractTelegramSessionSetupPreview(
  toolName: string,
  metadata?: Record<string, unknown>,
): ToolTelegramSessionSetupPreviewData | undefined {
  const normalized = toolName.toLowerCase();
  if (normalized !== "ambient_messaging_telegram_session_preview" && normalized !== "ambient_messaging_telegram_session_apply")
    return undefined;
  return telegramSessionSetupCardFromMetadata(recordValue(metadata?.toolResultDetails)?.telegramSessionSetup);
}

export function extractMessagingConversationDirectorySetupPreview(
  toolName: string,
  metadata?: Record<string, unknown>,
): ToolMessagingConversationDirectorySetupPreviewData | undefined {
  const normalized = toolName.toLowerCase();
  if (!normalized.startsWith("ambient_messaging_") || !normalized.includes("_conversation_directory_")) return undefined;
  return messagingConversationDirectorySetupCardFromMetadata(recordValue(metadata?.toolResultDetails)?.messagingConversationDirectorySetup);
}

export function extractMessagingRemoteSurfaceActivationPreview(
  toolName: string,
  metadata?: Record<string, unknown>,
): ToolMessagingRemoteSurfaceActivationPreviewData | undefined {
  const normalized = toolName.toLowerCase();
  if (
    normalized !== "ambient_messaging_remote_surface_activation_plan" &&
    normalized !== "ambient_messaging_telegram_owner_loop_activation_plan"
  )
    return undefined;
  return messagingRemoteSurfaceActivationCardFromMetadata(recordValue(metadata?.toolResultDetails)?.messagingRemoteSurfaceActivation);
}

export function telegramSessionSetupCardFromMetadata(value: unknown): ToolTelegramSessionSetupPreviewData | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "telegram-session-setup") return undefined;
  const providerId = nonEmptyTextField(record, ["providerId"]);
  const profileId = nonEmptyTextField(record, ["profileId"]);
  const action = nonEmptyTextField(record, ["action"]);
  const status = telegramSessionSetupStatusField(record.status);
  const title = nonEmptyTextField(record, ["title"]);
  const summary = nonEmptyTextField(record, ["summary"]);
  const detail = nonEmptyTextField(record, ["detail"]);
  if (!providerId || !profileId || !action || !status || !title || !summary || !detail) return undefined;
  const authState = telegramSessionSetupAuthStateFromMetadata(record.authState);
  const primaryAction = telegramSessionSetupActionFromMetadata(record.primaryAction);
  const checkedAt = nonEmptyTextField(record, ["checkedAt"]);
  const applied = booleanField(record, ["applied"]);
  const secondaryActions = Array.isArray(record.secondaryActions)
    ? record.secondaryActions.flatMap((item): TelegramSessionSetupCard["secondaryActions"] => {
        const parsed = telegramSessionSetupActionFromMetadata(item);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    kind: "telegram-session-setup",
    providerId,
    profileId,
    action,
    status,
    title,
    summary,
    detail,
    ...(checkedAt ? { checkedAt } : {}),
    ...(applied !== undefined ? { applied } : {}),
    ...(authState ? { authState } : {}),
    missingInputs: stringArrayField(record, ["missingInputs"]) ?? [],
    ...(primaryAction ? { primaryAction } : {}),
    secondaryActions,
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: false,
      createsBinding: false,
      enablesInboundIngestion: false,
    },
  };
}

export function messagingConversationDirectorySetupCardFromMetadata(
  value: unknown,
): ToolMessagingConversationDirectorySetupPreviewData | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "messaging-conversation-directory-setup") return undefined;
  const providerId = nonEmptyTextField(record, ["providerId"]);
  const status = messagingConversationDirectorySetupStatusField(record.status);
  const adapterStatus = record.adapterStatus === "available" || record.adapterStatus === "blocked" ? record.adapterStatus : undefined;
  const adapterKind =
    record.adapterKind === "live-metadata-only-adapter" || record.adapterKind === "blocked-contract-skeleton"
      ? record.adapterKind
      : undefined;
  const previewToolName = nonEmptyTextField(record, ["previewToolName"]);
  if (!providerId || !status || !adapterStatus || !adapterKind || !previewToolName) return undefined;
  if (record.metadataOnlyContractKind !== "metadata-only-routing") return undefined;
  const requiresApprovalForApply = booleanField(record, ["requiresApprovalForApply"]);
  const approvalRecorded = booleanField(record, ["approvalRecorded"]);
  const canApplyWithReadiness = booleanField(record, ["canApplyWithReadiness"]);
  const canApplyNow = booleanField(record, ["canApplyNow"]);
  const fetchedConversationCount = numberField(record, ["fetchedConversationCount"]);
  const returnedConversationCount = numberField(record, ["returnedConversationCount"]);
  if (
    requiresApprovalForApply === undefined ||
    approvalRecorded === undefined ||
    canApplyWithReadiness === undefined ||
    canApplyNow === undefined ||
    fetchedConversationCount === undefined ||
    returnedConversationCount === undefined
  )
    return undefined;
  return {
    kind: "messaging-conversation-directory-setup",
    providerId,
    ...(nonEmptyTextField(record, ["providerLabel"]) ? { providerLabel: nonEmptyTextField(record, ["providerLabel"]) } : {}),
    status,
    ...(nonEmptyTextField(record, ["directoryStatus"]) ? { directoryStatus: nonEmptyTextField(record, ["directoryStatus"]) } : {}),
    adapterStatus,
    adapterKind,
    previewToolName,
    ...(nonEmptyTextField(record, ["applyToolName"]) ? { applyToolName: nonEmptyTextField(record, ["applyToolName"]) } : {}),
    requiresApprovalForApply,
    approvalRecorded,
    canApplyWithReadiness,
    canApplyNow,
    metadataOnlyContractKind: "metadata-only-routing",
    fetchedConversationCount: Math.max(0, Math.floor(fetchedConversationCount)),
    returnedConversationCount: Math.max(0, Math.floor(returnedConversationCount)),
    ...(nonEmptyTextField(record, ["failureMode"]) ? { failureMode: nonEmptyTextField(record, ["failureMode"]) } : {}),
    ...(nonEmptyTextField(record, ["failureHint"]) ? { failureHint: nonEmptyTextField(record, ["failureHint"]) } : {}),
    blockers: stringArrayField(record, ["blockers"]) ?? [],
    warnings: stringArrayField(record, ["warnings"]) ?? [],
    nextSteps: stringArrayField(record, ["nextSteps"]) ?? [],
    safety: {
      startsBridge: false,
      runsProviderCli: false,
      inspectsProviderDesktop: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
    },
    conversations: messagingConversationDirectorySetupConversationsFromMetadata(record.conversations),
  };
}

export function messagingRemoteSurfaceActivationCardFromMetadata(
  value: unknown,
): ToolMessagingRemoteSurfaceActivationPreviewData | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "messaging-remote-surface-activation") return undefined;
  if (record.intent !== "remote_ambient_surface") return undefined;
  const status = messagingRemoteSurfaceActivationStatusField(record.status);
  const title = nonEmptyTextField(record, ["title"]);
  const summary = nonEmptyTextField(record, ["summary"]);
  const detail = nonEmptyTextField(record, ["detail"]);
  const ambientSurface = messagingAmbientSurfaceField(record.ambientSurface);
  if (!status || !title || !summary || !detail || !ambientSurface) return undefined;
  const currentPhase = messagingRemoteSurfaceActivationPhaseFromMetadata(record.currentPhase);
  return {
    kind: "messaging-remote-surface-activation",
    intent: "remote_ambient_surface",
    ...(nonEmptyTextField(record, ["providerId"]) ? { providerId: nonEmptyTextField(record, ["providerId"]) } : {}),
    ...(nonEmptyTextField(record, ["providerLabel"]) ? { providerLabel: nonEmptyTextField(record, ["providerLabel"]) } : {}),
    ...(nonEmptyTextField(record, ["requestedProvider"]) ? { requestedProvider: nonEmptyTextField(record, ["requestedProvider"]) } : {}),
    status,
    title,
    summary,
    detail,
    ambientSurface,
    ...(currentPhase ? { currentPhase } : {}),
    phaseChips: messagingRemoteSurfaceActivationPhasesFromMetadata(record.phaseChips),
    ...(nonEmptyTextField(record, ["recommendedNextTool"])
      ? { recommendedNextTool: nonEmptyTextField(record, ["recommendedNextTool"]) }
      : {}),
    ...(nonEmptyTextField(record, ["delegatedRecommendedNextTool"])
      ? { delegatedRecommendedNextTool: nonEmptyTextField(record, ["delegatedRecommendedNextTool"]) }
      : {}),
    ...(nonEmptyTextField(record, ["activationPlanFirstTool"])
      ? { activationPlanFirstTool: nonEmptyTextField(record, ["activationPlanFirstTool"]) }
      : {}),
    ...(nonEmptyTextField(record, ["repairPrompt"]) ? { repairPrompt: nonEmptyTextField(record, ["repairPrompt"]) } : {}),
    repairPrompts: stringArrayField(record, ["repairPrompts"]) ?? [],
    blockedUntilActivationPlan: stringArrayField(record, ["blockedUntilActivationPlan"]) ?? [],
    previewSendSafety: {
      commandPreviewTool:
        nonEmptyTextField(recordValue(record.previewSendSafety), ["commandPreviewTool"]) ??
        "ambient_messaging_remote_surface_command_preview",
      replyPreviewTool:
        nonEmptyTextField(recordValue(record.previewSendSafety), ["replyPreviewTool"]) ?? "ambient_messaging_remote_surface_reply_preview",
      providerSendApplyTool:
        nonEmptyTextField(recordValue(record.previewSendSafety), ["providerSendApplyTool"]) ??
        "ambient_messaging_remote_surface_reply_apply",
      previewRequiredBeforeProviderSend: true,
      providerSendRequiresSeparateApproval: true,
      providerSendReady: false,
    },
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

function messagingConversationDirectorySetupStatusField(value: unknown): MessagingConversationDirectorySetupCard["status"] | undefined {
  return value === "preview" || value === "applied" || value === "blocked" || value === "denied" || value === "failed" ? value : undefined;
}

function messagingRemoteSurfaceActivationStatusField(value: unknown): MessagingRemoteSurfaceActivationCard["status"] | undefined {
  return value === "route_ready" ||
    value === "needs_provider_choice" ||
    value === "unsupported_provider" ||
    value === "blocked" ||
    value === "active" ||
    value === "ready_to_start_polling" ||
    value === "needs_setup"
    ? value
    : undefined;
}

function messagingRemoteSurfaceActivationPhaseStatusField(value: unknown): MessagingRemoteSurfaceActivationCardPhase["status"] | undefined {
  return value === "complete" || value === "ready" || value === "waiting" || value === "blocked" || value === "optional"
    ? value
    : undefined;
}

function messagingRemoteSurfaceActivationPhaseFromMetadata(value: unknown): MessagingRemoteSurfaceActivationCardPhase | undefined {
  const record = recordValue(value);
  const id = nonEmptyTextField(record, ["id"]);
  const title = nonEmptyTextField(record, ["title"]);
  const status = messagingRemoteSurfaceActivationPhaseStatusField(record?.status);
  if (!id || !title || !status) return undefined;
  const blockerCount = numberField(record, ["blockerCount"]);
  return {
    id,
    title,
    status,
    approvalRequired: record?.approvalRequired === true,
    ...(nonEmptyTextField(record, ["nextTool"]) ? { nextTool: nonEmptyTextField(record, ["nextTool"]) } : {}),
    blockerCount: blockerCount === undefined ? 0 : Math.max(0, Math.floor(blockerCount)),
  };
}

function messagingRemoteSurfaceActivationPhasesFromMetadata(value: unknown): MessagingRemoteSurfaceActivationCardPhase[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MessagingRemoteSurfaceActivationCardPhase[] => {
    const parsed = messagingRemoteSurfaceActivationPhaseFromMetadata(item);
    return parsed ? [parsed] : [];
  });
}

function messagingAmbientSurfaceField(value: unknown): MessagingRemoteSurfaceActivationCard["ambientSurface"] | undefined {
  return value === "chat" || value === "projects" || value === "workflow_agents" || value === "settings" || value === "notifications"
    ? value
    : undefined;
}

function messagingConversationDirectorySetupTone(
  card: ToolMessagingConversationDirectorySetupPreviewData,
): ToolMessagingConversationDirectorySetupTone {
  if (card.status === "applied") return "success";
  if (card.status === "blocked" || card.status === "failed") return "danger";
  if (card.status === "denied") return "warning";
  return card.canApplyNow ? "success" : "info";
}

function messagingConversationDirectorySetupSummary(card: ToolMessagingConversationDirectorySetupPreviewData): string {
  if (card.status === "applied") return `${card.returnedConversationCount.toLocaleString()} metadata row(s) available.`;
  if (card.status === "blocked") return "Directory apply is blocked by the adapter contract.";
  if (card.status === "denied") return "Directory read was not approved.";
  if (card.status === "failed") return "Directory read failed.";
  return card.canApplyNow ? "Preview is ready for approval." : "Preview found setup blockers.";
}

function messagingRemoteSurfaceActivationTone(
  card: ToolMessagingRemoteSurfaceActivationPreviewData,
): ToolMessagingRemoteSurfaceActivationTone {
  if (card.status === "active" || card.status === "ready_to_start_polling" || card.status === "route_ready") return "success";
  if (card.status === "needs_provider_choice" || card.status === "needs_setup") return "info";
  if (card.status === "unsupported_provider" || card.status === "blocked") return "danger";
  return "info";
}

function messagingRemoteSurfaceActivationPhaseTone(
  phase: MessagingRemoteSurfaceActivationCardPhase,
): ToolMessagingRemoteSurfaceActivationTone {
  if (phase.status === "complete") return "success";
  if (phase.status === "ready") return "info";
  if (phase.status === "waiting" || phase.status === "optional") return "warning";
  return "danger";
}

function messagingRemoteSurfaceActivationStatusLabel(status: ToolMessagingRemoteSurfaceActivationPreviewData["status"]): string {
  if (status === "route_ready") return "Route ready";
  if (status === "needs_provider_choice") return "Needs provider choice";
  if (status === "unsupported_provider") return "Unsupported provider";
  if (status === "ready_to_start_polling") return "Ready to start polling";
  return formatCompactTaskState(status);
}

function messagingRemoteSurfaceActivationActions(
  card: ToolMessagingRemoteSurfaceActivationPreviewData,
): ToolMessagingRemoteSurfaceActivationCardViewModel["actions"] {
  const actions: ToolMessagingRemoteSurfaceActivationCardViewModel["actions"] = [];
  const nextTool = card.recommendedNextTool ?? card.currentPhase?.nextTool;
  if (nextTool) {
    actions.push({
      id: "continue",
      label: "Continue",
      title: `Ask Ambient to continue Remote Ambient Surface activation with ${nextTool}.`,
      prompt: remoteSurfaceActivationContinuePrompt(card, nextTool),
      tone: "primary",
    });
  }
  const repairPrompt = card.repairPrompt ?? card.repairPrompts[0];
  if (repairPrompt) {
    actions.push({
      id: "repair",
      label: nextTool ? "Repair" : "Use repair",
      title: "Ask Ambient to apply the first repair prompt from this activation card.",
      prompt: remoteSurfaceActivationRepairPrompt(card, repairPrompt),
      tone: "secondary",
    });
  }
  if (card.status === "unsupported_provider") {
    actions.push({
      id: "provider-onboarding",
      label: "Plan provider support",
      title: "Ask Ambient to plan future reviewed provider support without activating this provider now.",
      prompt: remoteSurfaceActivationProviderOnboardingPrompt(card),
      tone: "secondary",
    });
  }
  return actions;
}

function remoteSurfaceActivationContinuePrompt(card: ToolMessagingRemoteSurfaceActivationPreviewData, nextTool: string): string {
  return [
    `Continue Remote Ambient Surface activation by calling ${nextTool}.`,
    `Use the latest activation card/tool result in this thread for provider, surface (${card.ambientSurface}), profile, binding, and approval context.`,
    remoteSurfaceActivationPromptBoundary(),
  ].join(" ");
}

function remoteSurfaceActivationRepairPrompt(card: ToolMessagingRemoteSurfaceActivationPreviewData, repairPrompt: string): string {
  return [
    `Repair Remote Ambient Surface activation: ${repairPrompt}`,
    `Use the latest activation card/tool result in this thread for provider, surface (${card.ambientSurface}), and current phase context.`,
    remoteSurfaceActivationPromptBoundary(),
  ].join(" ");
}

function remoteSurfaceActivationProviderOnboardingPrompt(card: ToolMessagingRemoteSurfaceActivationPreviewData): string {
  const provider = card.requestedProvider ?? card.providerLabel ?? card.providerId ?? "this provider";
  return [
    `Plan future reviewed Remote Ambient Surface provider support for ${provider} by calling ambient_messaging_remote_surface_provider_support_plan first.`,
    `Pass provider exactly as ${provider} and ambientSurface exactly as ${card.ambientSurface}; use the latest activation card/tool result only as blocker context.`,
    "This is provider onboarding/planning, not active Remote Ambient Surface activation. After the planning tool returns, produce a concise plan and ask for approval before implementing, installing dependencies, scaffolding provider support, linking accounts/devices, or running validation.",
    "Do not call provider-specific low-level tools, provider desktop UI, shell, browser automation, provider CLIs, generic Messaging Connector setup, arbitrary history reads, provider message reads, provider sends, lifecycle/binding/polling/apply tools, or future-provider scaffolding unless the user explicitly approves implementation.",
    remoteSurfaceActivationPromptBoundary(),
  ].join(" ");
}

function remoteSurfaceActivationPromptBoundary(): string {
  return "Preserve the Remote Ambient Surface safety boundary: use preview tools before apply tools, do not read provider message bodies or history, do not use provider desktop UI, shell, browser automation, or provider CLIs as fallback, and do not send provider messages without an explicit approved preview.";
}

function shortActivationPhaseLabel(phase: MessagingRemoteSurfaceActivationCardPhase): string {
  if (phase.id === "product-provider-route") return "Route";
  if (phase.id === "provider-readiness") return "Provider";
  if (phase.id === "metadata-directory") return "Directory";
  if (phase.id === "owner-handoff") return "Handoff";
  if (phase.id === "owner-binding") return "Binding";
  if (phase.id === "periodic-polling") return "Polling";
  if (phase.id === "command-and-relay-preview") return "Command";
  if (phase.id === "cleanup") return "Cleanup";
  return phase.title;
}

function messagingConversationDirectorySetupStatusLabel(status: ToolMessagingConversationDirectorySetupPreviewData["status"]): string {
  return status === "preview" ? "Preview" : formatCompactTaskState(status);
}

function messagingConversationDirectorySetupConversationsFromMetadata(
  value: unknown,
): MessagingConversationDirectorySetupCardConversation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MessagingConversationDirectorySetupCardConversation[] => {
    const record = recordValue(item);
    const conversationId = nonEmptyTextField(record, ["conversationId"]);
    const title = nonEmptyTextField(record, ["title"]);
    if (!conversationId || !title) return [];
    const folderIds = Array.isArray(record?.folderIds)
      ? record.folderIds
          .map((folderId) => (typeof folderId === "number" && Number.isFinite(folderId) ? Math.floor(folderId) : undefined))
          .filter((folderId): folderId is number => folderId !== undefined)
      : [];
    const unreadCount = numberField(record, ["unreadCount"]);
    return [
      {
        conversationId,
        title,
        ...(nonEmptyTextField(record, ["type"]) ? { type: nonEmptyTextField(record, ["type"]) } : {}),
        ...(unreadCount !== undefined ? { unreadCount: Math.max(0, Math.floor(unreadCount)) } : {}),
        folderIds,
        ...(nonEmptyTextField(record, ["updatedAt"]) ? { updatedAt: nonEmptyTextField(record, ["updatedAt"]) } : {}),
      },
    ];
  });
}

function telegramSessionSetupStatusField(value: unknown): TelegramSessionSetupCard["status"] | undefined {
  return value === "preview" ||
    value === "pending" ||
    value === "needs_code" ||
    value === "needs_password" ||
    value === "ready" ||
    value === "blocked" ||
    value === "unknown"
    ? value
    : undefined;
}

function telegramSessionSetupActionFromMetadata(value: unknown): TelegramSessionSetupCard["primaryAction"] | undefined {
  const record = recordValue(value);
  const id = nonEmptyTextField(record, ["id"]);
  const label = nonEmptyTextField(record, ["label"]);
  const title = nonEmptyTextField(record, ["title"]);
  const prompt = nonEmptyTextField(record, ["prompt"]);
  const tone = record?.tone === "primary" || record?.tone === "secondary" ? record.tone : undefined;
  if (!id || !label || !title || !prompt || !tone) return undefined;
  return { id, label, title, prompt, tone };
}

function telegramSessionSetupAuthStateFromMetadata(value: unknown): TelegramSessionSetupCard["authState"] | undefined {
  const record = recordValue(value);
  const state = nonEmptyTextField(record, ["state"]);
  if (!state) return undefined;
  const message = nonEmptyTextField(record, ["message"]);
  return {
    state,
    ready: booleanField(record, ["ready"]) === true,
    needsCode: booleanField(record, ["needsCode"]) === true,
    needsPassword: booleanField(record, ["needsPassword"]) === true,
    phoneNumberPresent: booleanField(record, ["phoneNumberPresent"]) === true,
    ...(message ? { message } : {}),
  };
}
