import { useEffect, useRef, useState } from "react";

import type { MessageVoiceState } from "../../shared/localRuntimeTypes";
import type { AnswerPlannerDecisionQuestionInput, PlannerPlanArtifact } from "../../shared/plannerTypes";
import { sttMessageMetadataFromUnknown } from "../../shared/sttMessageMetadata";
import type { ChatMessage, RunStatus } from "../../shared/threadTypes";
import type { WorkspaceOpenTarget } from "../../shared/workspaceTypes";
import {
  MessageContextList,
  MessageDiagnosticCard,
  MessageSttMetadataStrip,
  MessageVoiceStateStrip,
  PlannerDecisionPanel,
  SessionContextRecoveryInlineActions,
} from "./AppMessageAdjunctPanels";
import { MessageActionBar, MessageBubbleHeader, MessageContentBody, PlannerMessageWarningStrips } from "./AppMessageBubblePanels";
import {
  contextReferencesFromMetadata,
  formatMessageWallClockTime,
  isSessionContextMissingError,
  isThinkingMessage,
  messageMetaLabel,
  messageStatus,
  messageStreamingPlaceholder,
  renderableMessageContent,
} from "./AppMessageState";
import type { RunActivityLine } from "./AppRunActivity";
import { ToolMessageCard } from "./AppToolMessages";
import { messageContentWithoutDiagnostic, messageDiagnosticCardModel } from "./messageDiagnosticUiModel";
import { plannerCanRefineWithAdditionalFeedback, plannerRequiredDecisionQuestionsAnswered } from "./plannerModeUiModel";
import { promptCacheStatusBadgeModel, type PromptCacheStatusBadgeModel } from "./promptCacheStatusUiModel";
import {
  isHtmlArtifactPath,
  preferredWorkspaceOpenTarget,
  workspaceAbsoluteArtifactPath,
  type LinkContextMenuState,
} from "./RightPanelRichText";
import type { ArtifactPathHints } from "./toolMessageArtifactUiModel";

export {
  MessageContextList,
  MessageDiagnosticCard,
  MessageSttMetadataStrip,
  MessageVoiceStateStrip,
  PlannerDecisionPanel,
  SessionContextRecoveryButtons,
  SessionContextRecoveryInlineActions,
  SttArtifactLinks,
  plannerFinalizationProgressText,
  providerLabelFromCapability,
  sttMetadataSummary,
} from "./AppMessageAdjunctPanels";
export {
  assistantVisibleTextIsStreaming,
  conciseStreamingActivityText,
  contextReferencesFromMetadata,
  countTextMatches,
  formatMessageWallClockTime,
  isSessionContextMissingError,
  isThinkingMessage,
  messageIsStreaming,
  messageIsStreamingForRender,
  messageKindForActivity,
  messageMetaLabel,
  messageStatus,
  messageStreamingPlaceholder,
  renderableMessageContent,
  retryableFailedPromptIds,
  streamingAssistantMessageId,
  visibleMessages,
} from "./AppMessageState";

export const GOAL_COMPLETION_MESSAGE_KIND = "goal-completion";

export function MessageBubble({
  message,
  voiceState,
  voiceProviderLabels,
  streaming,
  workspacePath,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenUrl,
  onOpenBrowserUrl,
  onOpenBrowserPanel,
  onOpenMediaModal,
  generatedMediaAutoplay,
  voiceShouldAutoplay,
  activeVoiceMessageId,
  onActiveVoiceMessageChange,
  onRegenerateVoice,
  onRevealVoiceArtifact,
  onClearVoiceArtifact,
  artifactPathHints,
  plannerPlanArtifact,
  runActivityLines,
  runStatus,
  retryable,
  onRetry,
  toolActionDisabled = false,
  onSendTelegramSessionSetupPrompt,
  onSendRemoteSurfaceActivationPrompt,
  onImplementPlannerPlan,
  onRefinePlannerPlan,
  onRetryPlannerFinalization,
  onAddPlannerPlanToBoard,
  onGeneratePlannerDurableArtifact,
  onAnswerPlannerDecisionQuestion,
  hasProjectBoard,
  highlightQuery,
  contextRecoveryBusy = false,
  contextRecoveryCanRetry = false,
  onRecoverContext,
  onRecoverContextAndRetry,
  onDuplicateThreadFromTranscript,
  showPromptCacheStatus = false,
}: {
  message: ChatMessage;
  voiceState?: MessageVoiceState;
  voiceProviderLabels: Record<string, string>;
  streaming: boolean;
  workspacePath: string;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenBrowserUrl: (url: string) => void;
  onOpenBrowserPanel: () => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
  generatedMediaAutoplay: boolean;
  voiceShouldAutoplay: boolean;
  activeVoiceMessageId?: string;
  onActiveVoiceMessageChange: (messageId?: string) => void;
  onRegenerateVoice: (messageId: string) => void | Promise<void>;
  onRevealVoiceArtifact: (messageId: string) => void | Promise<void>;
  onClearVoiceArtifact: (messageId: string) => void | Promise<void>;
  artifactPathHints: ArtifactPathHints;
  plannerPlanArtifact?: PlannerPlanArtifact;
  runActivityLines: RunActivityLine[];
  runStatus: RunStatus;
  retryable?: boolean;
  onRetry?: (message: ChatMessage) => void | Promise<void>;
  toolActionDisabled?: boolean;
  onSendTelegramSessionSetupPrompt?: (prompt: string) => void | Promise<void>;
  onSendRemoteSurfaceActivationPrompt?: (prompt: string) => void | Promise<void>;
  onImplementPlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRefinePlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRetryPlannerFinalization: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onAddPlannerPlanToBoard: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onGeneratePlannerDurableArtifact: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onAnswerPlannerDecisionQuestion: (
    artifact: PlannerPlanArtifact,
    questionId: string,
    answer: AnswerPlannerDecisionQuestionInput["answer"],
  ) => void | Promise<void>;
  hasProjectBoard: boolean;
  highlightQuery?: string;
  contextRecoveryBusy?: boolean;
  contextRecoveryCanRetry?: boolean;
  onRecoverContext?: () => void | Promise<void>;
  onRecoverContextAndRetry?: () => void | Promise<void>;
  onDuplicateThreadFromTranscript?: () => void | Promise<void>;
  showPromptCacheStatus?: boolean;
}) {
  const metaLabel = messageMetaLabel(message);
  const status = messageStatus(message);
  const context = contextReferencesFromMetadata(message.metadata?.context);
  const sttMetadata = sttMessageMetadataFromUnknown(message.metadata?.stt);
  const thinking = isThinkingMessage(message);
  const promptCacheBadge = promptCacheStatusBadgeModel(message, Boolean(showPromptCacheStatus));
  const goalCompletion = isGoalCompletionMessage(message);
  const roleLabel = goalCompletion
    ? "Goal"
    : thinking
      ? "Thinking"
      : plannerPlanArtifact
        ? "Plan"
        : message.role === "assistant"
          ? "Ambient"
          : message.role;
  const timestampLabel = formatMessageWallClockTime(message.createdAt);
  const diagnosticCard = messageDiagnosticCardModel(message);
  const diagnosticContent = diagnosticCard ? messageContentWithoutDiagnostic(message) : message.content;
  const diagnosticCopyText =
    diagnosticCard && message.role === "system" && message.metadata?.runtime === "ambient-recovery"
      ? message.content.trim() || diagnosticCard.details
      : undefined;
  const showVoiceState = message.role === "assistant" && !thinking && Boolean(voiceState);
  const [copied, setCopied] = useState(false);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);
  const [diagnosticDismissed, setDiagnosticDismissed] = useState(false);
  const copyResetTimerRef = useRef<number | undefined>(undefined);
  const diagnosticCopyResetTimerRef = useRef<number | undefined>(undefined);
  const [durablePlanMenu, setDurablePlanMenu] = useState<LinkContextMenuState | undefined>();
  const [durablePlanOpenTargets, setDurablePlanOpenTargets] = useState<WorkspaceOpenTarget[]>([]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
      if (diagnosticCopyResetTimerRef.current) window.clearTimeout(diagnosticCopyResetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!durablePlanMenu?.artifactPath) {
      return;
    }
    let disposed = false;
    window.ambientDesktop
      .listWorkspaceOpenTargets()
      .then((targets) => {
        if (!disposed) setDurablePlanOpenTargets(targets);
      })
      .catch(() => {
        if (!disposed) setDurablePlanOpenTargets([]);
      });
    return () => {
      disposed = true;
    };
  }, [durablePlanMenu?.artifactPath]);

  useEffect(() => {
    if (!durablePlanMenu) return;
    const close = () => setDurablePlanMenu(undefined);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [durablePlanMenu]);

  const plannerPlanFinalizationRunning =
    plannerPlanArtifact?.workflowState === "finalizing" || plannerPlanArtifact?.finalizationAttempt?.status === "running";
  const plannerPlanReadyForActions = plannerPlanArtifact?.status === "ready" && !plannerPlanFinalizationRunning;
  const canImplementPlannerPlan =
    plannerPlanReadyForActions && plannerPlanArtifact ? plannerRequiredDecisionQuestionsAnswered(plannerPlanArtifact) : false;
  const canRefinePlannerPlan =
    plannerPlanArtifact && plannerPlanReadyForActions
      ? plannerCanRefineWithAdditionalFeedback(plannerPlanArtifact, plannerPlanFinalizationRunning)
      : false;
  const plannerDurableGenerating = plannerPlanArtifact?.workflowState === "durable_generating";
  const canGenerateDurablePlan = Boolean(plannerPlanArtifact && canImplementPlannerPlan && !plannerDurableGenerating);
  const copyKind = message.role === "user" ? "prompt" : "response";
  const canCopyMessage =
    (message.role === "assistant" || message.role === "user") && !thinking && !streaming && Boolean(renderableMessageContent(message));
  const canRetryMessage = message.role === "user" && Boolean(retryable) && !streaming && Boolean(renderableMessageContent(message));
  const showContextRecoveryActions = message.role === "assistant" && isSessionContextMissingError(message.content);
  const showMessageActions = canRetryMessage || canCopyMessage || (plannerPlanArtifact && plannerPlanArtifact.status === "ready");
  const streamingPlaceholder =
    streaming && !message.content ? messageStreamingPlaceholder(message, runActivityLines, runStatus) : undefined;
  const durablePlanPath = plannerPlanArtifact?.durableArtifactPath;
  const durablePlanOpenTargetsForMenu = durablePlanMenu?.artifactPath ? durablePlanOpenTargets : [];
  const durablePlanMenuFilePath = durablePlanMenu?.artifactPath
    ? workspaceAbsoluteArtifactPath(durablePlanMenu.artifactPath, workspacePath)
    : undefined;
  const durablePlanPrimaryOpenTarget = durablePlanMenu?.artifactPath
    ? preferredWorkspaceOpenTarget(durablePlanOpenTargetsForMenu)
    : undefined;
  const durablePlanChromeOpenTarget =
    durablePlanMenuFilePath && isHtmlArtifactPath(durablePlanMenuFilePath)
      ? durablePlanOpenTargetsForMenu.find((target) => target.id === "chrome")
      : undefined;
  const durablePlanSecondaryOpenTargets =
    durablePlanMenu?.artifactPath && durablePlanPrimaryOpenTarget
      ? durablePlanOpenTargetsForMenu.filter(
          (target) =>
            target.id !== durablePlanPrimaryOpenTarget.id && target.id !== durablePlanChromeOpenTarget?.id && target.kind !== "finder",
        )
      : [];
  const openDurablePlanMenuWith = (targetId?: string) => {
    if (!durablePlanMenu?.artifactPath) return;
    const path = targetId === "chrome" && durablePlanMenuFilePath ? durablePlanMenuFilePath : durablePlanMenu.artifactPath;
    void window.ambientDesktop.openWorkspacePathWith({ path, targetId }).catch(() => undefined);
  };
  const revealDurablePlanMenuFile = () => {
    if (!durablePlanMenu?.artifactPath) return;
    void window.ambientDesktop.revealWorkspacePath(durablePlanMenuFilePath ?? durablePlanMenu.artifactPath).catch(() => undefined);
  };

  async function copyMessageContent() {
    if (!canCopyMessage) return;
    await window.ambientDesktop.writeClipboardText(message.content);
    setCopied(true);
    if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
  }

  async function copyDiagnosticContent() {
    if (!diagnosticCopyText) return;
    await window.ambientDesktop.writeClipboardText(diagnosticCopyText);
    setDiagnosticCopied(true);
    if (diagnosticCopyResetTimerRef.current) window.clearTimeout(diagnosticCopyResetTimerRef.current);
    diagnosticCopyResetTimerRef.current = window.setTimeout(() => setDiagnosticCopied(false), 1400);
  }

  if (message.role === "tool") {
    return (
      <ToolMessageCard
        message={message}
        workspacePath={workspacePath}
        onPreviewPath={onPreviewPath}
        onPreviewLocalPath={onPreviewLocalPath}
        onOpenUrl={onOpenUrl}
        onOpenBrowserUrl={onOpenBrowserUrl}
        onOpenBrowserPanel={onOpenBrowserPanel}
        onOpenMediaModal={onOpenMediaModal}
        generatedMediaAutoplay={generatedMediaAutoplay}
        toolActionDisabled={toolActionDisabled}
        onSendTelegramSessionSetupPrompt={onSendTelegramSessionSetupPrompt}
        onSendRemoteSurfaceActivationPrompt={onSendRemoteSurfaceActivationPrompt}
      />
    );
  }
  if (diagnosticCard && diagnosticDismissed && !diagnosticContent.trim()) return null;
  return (
    <article
      className={`message ${message.role} ${thinking ? "thinking" : ""} ${plannerPlanArtifact ? "planner-plan" : ""} ${goalCompletion ? "goal-completion-message" : ""} ${diagnosticCard ? "diagnostic-message" : ""} ${status ? `status-${status}` : ""}`}
      data-message-id={message.id}
    >
      <MessageBubbleHeader
        roleLabel={roleLabel}
        timestampLabel={timestampLabel}
        createdAt={message.createdAt}
        accessory={promptCacheBadge ? <PromptCacheStatusBadge model={promptCacheBadge} /> : undefined}
      />
      {diagnosticCard && !diagnosticDismissed ? (
        <MessageDiagnosticCard
          model={diagnosticCard}
          copied={diagnosticCopied}
          onCopy={diagnosticCopyText ? () => void copyDiagnosticContent() : undefined}
          onDismiss={() => setDiagnosticDismissed(true)}
        />
      ) : null}
      <MessageContentBody
        diagnosticContent={diagnosticContent}
        thinking={thinking}
        streaming={streaming}
        streamingPlaceholder={streamingPlaceholder}
        highlightQuery={highlightQuery}
        artifactPathHints={artifactPathHints}
        workspacePath={workspacePath}
        onPreviewPath={onPreviewPath}
        onPreviewLocalPath={onPreviewLocalPath}
        onOpenMediaModal={onOpenMediaModal}
        onOpenUrl={onOpenUrl}
        onOpenBrowserUrl={onOpenBrowserUrl}
      />
      <PlannerMessageWarningStrips artifact={plannerPlanArtifact} />
      {showContextRecoveryActions && (
        <SessionContextRecoveryInlineActions
          busy={contextRecoveryBusy}
          canRetry={contextRecoveryCanRetry}
          onRecover={onRecoverContext}
          onRecoverAndRetry={onRecoverContextAndRetry}
          onDuplicate={onDuplicateThreadFromTranscript}
        />
      )}
      {showVoiceState && voiceState && (
        <MessageVoiceStateStrip
          voiceState={voiceState}
          providerLabels={voiceProviderLabels}
          shouldAutoplay={voiceShouldAutoplay}
          activeVoiceMessageId={activeVoiceMessageId}
          onActiveVoiceMessageChange={onActiveVoiceMessageChange}
          onRegenerateVoice={onRegenerateVoice}
          onRevealVoiceArtifact={onRevealVoiceArtifact}
          onClearVoiceArtifact={onClearVoiceArtifact}
        />
      )}
      {message.role === "user" && sttMetadata && <MessageSttMetadataStrip metadata={sttMetadata} onPreviewPath={onPreviewPath} />}
      {showMessageActions && (
        <MessageActionBar
          message={message}
          plannerPlanArtifact={plannerPlanArtifact}
          durablePlanPath={durablePlanPath}
          durablePlanMenu={durablePlanMenu}
          durablePlanChromeOpenTarget={durablePlanChromeOpenTarget}
          durablePlanPrimaryOpenTarget={durablePlanPrimaryOpenTarget}
          durablePlanSecondaryOpenTargets={durablePlanSecondaryOpenTargets}
          plannerPlanFinalizationRunning={plannerPlanFinalizationRunning}
          plannerPlanReadyForActions={Boolean(plannerPlanReadyForActions)}
          canGenerateDurablePlan={canGenerateDurablePlan}
          plannerDurableGenerating={plannerDurableGenerating}
          canRefinePlannerPlan={Boolean(canRefinePlannerPlan)}
          canImplementPlannerPlan={canImplementPlannerPlan}
          canRetryMessage={canRetryMessage}
          canCopyMessage={canCopyMessage}
          copied={copied}
          copyKind={copyKind}
          hasProjectBoard={hasProjectBoard}
          onPreviewPath={onPreviewPath}
          onOpenDurablePlanMenu={setDurablePlanMenu}
          onCloseDurablePlanMenu={() => setDurablePlanMenu(undefined)}
          onOpenDurablePlanWith={openDurablePlanMenuWith}
          onRevealDurablePlanFile={revealDurablePlanMenuFile}
          onGeneratePlannerDurableArtifact={onGeneratePlannerDurableArtifact}
          onAddPlannerPlanToBoard={onAddPlannerPlanToBoard}
          onRefinePlannerPlan={onRefinePlannerPlan}
          onImplementPlannerPlan={onImplementPlannerPlan}
          onRetry={onRetry}
          onCopyMessageContent={copyMessageContent}
        />
      )}
      {plannerPlanArtifact && plannerPlanArtifact.status === "ready" && plannerPlanArtifact.decisionQuestions.length > 0 && (
        <PlannerDecisionPanel
          artifact={plannerPlanArtifact}
          runActivityLines={runActivityLines}
          runStatus={runStatus}
          onAnswerPlannerDecisionQuestion={onAnswerPlannerDecisionQuestion}
          onRetryPlannerFinalization={onRetryPlannerFinalization}
        />
      )}
      {message.role === "user" && <MessageContextList attachments={context} />}
      {metaLabel && <div className="message-meta">{metaLabel}</div>}
    </article>
  );
}

function PromptCacheStatusBadge({ model }: { model: PromptCacheStatusBadgeModel }) {
  return (
    <span className={`message-prompt-cache-badge ${model.tone}`} data-tooltip={model.title} aria-label={model.title} tabIndex={0}>
      {model.label}
    </span>
  );
}

export function isGoalCompletionMessage(message: ChatMessage): boolean {
  return message.metadata?.kind === GOAL_COMPLETION_MESSAGE_KIND;
}
