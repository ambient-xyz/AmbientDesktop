import {
  AlertCircle,
  Check,
  Copy,
  FileText,
  FolderOpen,
  Info,
  LoaderCircle,
  MessageCircle,
  Mic,
  Music,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { MessageVoiceState, SttMessageMetadata } from "../../shared/localRuntimeTypes";
import type { AnswerPlannerDecisionQuestionInput, PlannerDecisionQuestion, PlannerPlanArtifact } from "../../shared/plannerTypes";
import { sttMessageArtifactEntries } from "../../shared/sttMessageMetadata";
import type { RunStatus } from "../../shared/threadTypes";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import type { RunActivityLine } from "./AppRunActivity";
import type { MessageDiagnosticCardModel } from "./messageDiagnosticUiModel";
import {
  plannerDecisionAnswerStatusLabel,
  plannerDecisionAnswerText,
  plannerDecisionQuestionsComplete,
  plannerNextDecisionQuestion,
  plannerRequiredDecisionQuestionsAnswered,
  plannerSortedOptions,
  plannerWorkflowStateLabel,
} from "./plannerModeUiModel";
import { contextAttachmentKey } from "./RightPanelDetailPanels";
import { formatDurationMs } from "./RightPanelSettingsRuntime";
import { messageVoiceStripModel } from "./voiceUiModel";

export function MessageSttMetadataStrip({
  metadata,
  onPreviewPath,
}: {
  metadata: SttMessageMetadata;
  onPreviewPath: (path: string) => void;
}) {
  return (
    <div className="message-stt-metadata">
      <Mic size={13} aria-hidden="true" />
      <span>{sttMetadataSummary(metadata)}</span>
      <SttArtifactLinks metadata={metadata} onPreviewPath={onPreviewPath} />
    </div>
  );
}

export function SttArtifactLinks({
  metadata,
  onPreviewPath,
  compact = false,
}: {
  metadata: SttMessageMetadata;
  onPreviewPath: (path: string) => void;
  compact?: boolean;
}) {
  const artifacts = sttMessageArtifactEntries(metadata);
  if (!artifacts.length) return null;
  const visibleArtifacts = compact ? artifacts.slice(0, 3) : artifacts;
  return (
    <div className={`stt-artifact-links ${compact ? "compact" : ""}`} aria-label="Speech artifact links">
      {visibleArtifacts.map((artifact) => (
        <button
          key={artifact.key}
          type="button"
          className="artifact-link"
          title={artifact.path}
          onClick={() => onPreviewPath(artifact.path)}
        >
          {artifact.label}
        </button>
      ))}
    </div>
  );
}

export function sttMetadataSummary(metadata: SttMessageMetadata): string {
  const labels = [
    "Speech",
    metadata.providerId ?? providerLabelFromCapability(metadata.providerCapabilityId),
    metadata.language,
    typeof metadata.durationMs === "number" ? formatDurationMs(metadata.durationMs) : undefined,
    typeof metadata.noSpeechGate?.rmsDbfs === "number" ? `${Math.round(metadata.noSpeechGate.rmsDbfs)} dBFS` : undefined,
  ].filter(Boolean);
  return labels.join(" · ");
}

export function providerLabelFromCapability(capabilityId: string | undefined): string | undefined {
  if (!capabilityId) return undefined;
  const command = capabilityId.split(":tool:").at(-1);
  return command?.replace(/[_-]+/g, " ");
}

export function MessageVoiceStateStrip({
  voiceState,
  providerLabels,
  shouldAutoplay,
  activeVoiceMessageId,
  onActiveVoiceMessageChange,
  onRegenerateVoice,
  onRevealVoiceArtifact,
  onClearVoiceArtifact,
}: {
  voiceState: MessageVoiceState;
  providerLabels: Record<string, string>;
  shouldAutoplay: boolean;
  activeVoiceMessageId?: string;
  onActiveVoiceMessageChange: (messageId?: string) => void;
  onRegenerateVoice: (messageId: string) => void | Promise<void>;
  onRevealVoiceArtifact: (messageId: string) => void | Promise<void>;
  onClearVoiceArtifact: (messageId: string) => void | Promise<void>;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const stripModel = messageVoiceStripModel(voiceState, { providerLabels });
  const canPlay = stripModel.canPlay;
  const canRegenerate = stripModel.canRegenerate;
  const isActiveVoice = activeVoiceMessageId === voiceState.messageId;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isActiveVoice) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
  }, [isActiveVoice]);

  useEffect(() => {
    if (!canPlay || !shouldAutoplay) return;
    // Preserve the moved voice autoplay trigger while keeping the same dependency surface.
    // eslint-disable-next-line react-hooks/immutability
    void playVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, shouldAutoplay, voiceState.mediaUrl, voiceState.updatedAt]);

  async function playVoice() {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;
    onActiveVoiceMessageChange(voiceState.messageId);
    try {
      await audio.play();
    } catch {
      setPlaying(false);
      onActiveVoiceMessageChange(undefined);
    }
  }

  function pauseVoice() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    if (isActiveVoice) onActiveVoiceMessageChange(undefined);
  }

  function stopVoice() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    if (isActiveVoice) onActiveVoiceMessageChange(undefined);
  }

  return (
    <div className={`message-voice-state voice-${voiceState.status}`} title={stripModel.detailParts.join(" · ")}>
      {voiceState.status === "synthesizing" ? <LoaderCircle size={13} className="spin" /> : <Music size={13} />}
      <span>{stripModel.statusLabel}</span>
      <small>{stripModel.detailParts.join(" · ")}</small>
      {stripModel.canInspect && (
        <button
          type="button"
          className={`message-voice-action ${detailsOpen ? "active" : ""}`}
          title="Inspect voice details"
          aria-label="Inspect voice details"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <Info size={12} />
        </button>
      )}
      {canPlay && (
        <>
          <button
            type="button"
            className={`message-voice-action ${playing ? "active" : ""}`}
            title={playing ? "Pause voice" : "Play voice"}
            aria-label={playing ? "Pause voice" : "Play voice"}
            onClick={() => (playing ? pauseVoice() : void playVoice())}
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button type="button" className="message-voice-action" title="Stop voice" aria-label="Stop voice" onClick={stopVoice}>
            <Square size={12} />
          </button>
        </>
      )}
      {canRegenerate && (
        <button
          type="button"
          className="message-voice-action"
          title={stripModel.regenerateLabel}
          aria-label={stripModel.regenerateLabel}
          onClick={() => void onRegenerateVoice(voiceState.messageId)}
        >
          <RefreshCw size={12} />
        </button>
      )}
      {stripModel.canRevealArtifact && (
        <button
          type="button"
          className="message-voice-action"
          title="Reveal voice file"
          aria-label="Reveal voice file"
          onClick={() => void onRevealVoiceArtifact(voiceState.messageId)}
        >
          <FolderOpen size={12} />
        </button>
      )}
      {stripModel.canClearArtifact && (
        <button
          type="button"
          className="message-voice-action"
          title="Clear voice file"
          aria-label="Clear voice file"
          onClick={() => void onClearVoiceArtifact(voiceState.messageId)}
        >
          <Trash2 size={12} />
        </button>
      )}
      {canPlay && (
        <audio
          key={stripModel.audioKey}
          ref={audioRef}
          className="message-voice-audio"
          preload={shouldAutoplay ? "auto" : "metadata"}
          src={voiceState.mediaUrl}
          onPlay={() => {
            onActiveVoiceMessageChange(voiceState.messageId);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            if (activeVoiceMessageId === voiceState.messageId) onActiveVoiceMessageChange(undefined);
          }}
        >
          Voice playback is not supported by this Electron build.
        </audio>
      )}
      {detailsOpen && (
        <div className="message-voice-details" role="dialog" aria-label="Voice details">
          <dl>
            {stripModel.inspectRows.map((row) => (
              <div key={`${row.label}:${row.value}`}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {stripModel.spokenTextPreview && <pre>{stripModel.spokenTextPreview}</pre>}
        </div>
      )}
    </div>
  );
}

export function PlannerDecisionPanel({
  artifact,
  runActivityLines,
  runStatus,
  onAnswerPlannerDecisionQuestion,
  onRetryPlannerFinalization,
}: {
  artifact: PlannerPlanArtifact;
  runActivityLines: RunActivityLine[];
  runStatus: RunStatus;
  onAnswerPlannerDecisionQuestion: (
    artifact: PlannerPlanArtifact,
    questionId: string,
    answer: AnswerPlannerDecisionQuestionInput["answer"],
  ) => void | Promise<void>;
  onRetryPlannerFinalization: (artifact: PlannerPlanArtifact) => void | Promise<void>;
}) {
  const workflowLabel = plannerWorkflowStateLabel(artifact);
  const isFinalizing = artifact.workflowState === "finalizing" || artifact.finalizationAttempt?.status === "running";
  const finalizationFailed = artifact.workflowState === "failed" || artifact.finalizationAttempt?.status === "failed";
  const nextQuestion = isFinalizing ? undefined : plannerNextDecisionQuestion(artifact);
  const [customAnswer, setCustomAnswer] = useState("");
  const answeredQuestions = artifact.decisionQuestions.filter((question) => question.answer);
  const finalizationProgressText = isFinalizing ? plannerFinalizationProgressText(runActivityLines, runStatus) : undefined;
  const canRetryFinalization = finalizationFailed && artifact.status === "ready" && plannerRequiredDecisionQuestionsAnswered(artifact);

  useEffect(() => {
    // Preserve the moved planner answer reset when the active question changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomAnswer("");
  }, [artifact.id, nextQuestion?.id]);

  async function answerOption(question: PlannerDecisionQuestion, optionId: string) {
    await onAnswerPlannerDecisionQuestion(artifact, question.id, { kind: "option", optionId });
  }

  async function answerCustom(question: PlannerDecisionQuestion) {
    const text = customAnswer.trim();
    if (!text) return;
    await onAnswerPlannerDecisionQuestion(artifact, question.id, { kind: "custom", customText: text });
    setCustomAnswer("");
  }

  return (
    <section className="planner-decisions" aria-label="Planner decisions">
      <div className="planner-decisions-header">
        <div>
          <div className="planner-decisions-title">Planner decisions</div>
          <div className="planner-decisions-subtitle">
            {plannerDecisionAnswerStatusLabel(artifact)} · {workflowLabel}
          </div>
        </div>
        {isFinalizing ? (
          <span className="planner-decision-complete" role="status" aria-live="polite">
            <RefreshCw size={13} className="spin" />
            Finalizing
          </span>
        ) : finalizationFailed ? (
          <span className="planner-decision-failed">
            <AlertCircle size={13} />
            Failed
          </span>
        ) : plannerDecisionQuestionsComplete(artifact) ? (
          <span className="planner-decision-complete">
            <Check size={13} />
            Complete
          </span>
        ) : null}
      </div>

      {nextQuestion ? (
        <div className="planner-decision-question">
          <div className="planner-decision-question-text">
            {nextQuestion.question}
            {nextQuestion.required && <span className="planner-decision-required">Required</span>}
          </div>
          <div className="planner-decision-options">
            {plannerSortedOptions(nextQuestion).map((option) => (
              <button
                key={option.id}
                type="button"
                className="planner-decision-option"
                onClick={() => void answerOption(nextQuestion, option.id)}
              >
                <span className="planner-decision-option-topline">
                  <span>{option.label}</span>
                  {option.id === nextQuestion.recommendedOptionId && <span className="planner-decision-recommended">Recommended</span>}
                </span>
                <span className="planner-decision-option-description">{option.description}</span>
              </button>
            ))}
          </div>
          <div className="planner-decision-custom">
            <textarea value={customAnswer} onChange={(event) => setCustomAnswer(event.target.value)} placeholder="Custom answer" rows={2} />
            <button type="button" disabled={!customAnswer.trim()} onClick={() => void answerCustom(nextQuestion)}>
              <MessageCircle size={14} />
              Use custom
            </button>
          </div>
        </div>
      ) : (
        <div className="planner-decision-summary">
          {answeredQuestions.map((question) => (
            <div key={question.id} className="planner-decision-summary-row">
              <span>{question.question}</span>
              <strong>{plannerDecisionAnswerText(question)}</strong>
            </div>
          ))}
        </div>
      )}

      {answeredQuestions.length > 0 && nextQuestion && (
        <div className="planner-decision-answered">
          {answeredQuestions.map((question) => (
            <div key={question.id}>
              <Check size={13} />
              <span>{plannerDecisionAnswerText(question)}</span>
            </div>
          ))}
        </div>
      )}

      {finalizationProgressText && (
        <div className="planner-decision-progress" role="status" aria-live="polite">
          <LoaderCircle size={14} className="spin" />
          <span>{finalizationProgressText}</span>
        </div>
      )}

      {canRetryFinalization && (
        <div className="planner-decision-failure">
          <AlertCircle size={14} />
          <span>Plan finalization did not complete.</span>
          <button type="button" onClick={() => void onRetryPlannerFinalization(artifact)}>
            <RotateCcw size={14} />
            Retry finalization
          </button>
        </div>
      )}

      {answeredQuestions.length > 0 && (
        <p className="planner-decision-action-note">
          Use the message actions above to refine the plan with additional feedback or start implementation.
        </p>
      )}
    </section>
  );
}

export function plannerFinalizationProgressText(lines: RunActivityLine[], status: RunStatus): string {
  const latest = [...lines].reverse().find((line) => line.text.trim());
  if (latest) return latest.text;
  if (status === "starting") return "Starting the planner Pi session.";
  if (status === "retrying") return "Retrying planner finalization.";
  if (status === "streaming") return "Waiting for Ambient to finalize the plan.";
  if (status === "tool") return "Ambient is checking context for the plan.";
  return "Plan finalization is queued.";
}

export function MessageContextList({ attachments }: { attachments: WorkspaceContextReference[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="message-context-list" aria-label="Attached context">
      {attachments.map((item) => (
        <span key={contextAttachmentKey(item)} title={item.path}>
          {item.kind === "directory" ? <FolderOpen size={12} /> : <FileText size={12} />}
          {item.path}
        </span>
      ))}
    </div>
  );
}

export function MessageDiagnosticCard({
  model,
  copied = false,
  onCopy,
  onDismiss,
}: {
  model: MessageDiagnosticCardModel;
  copied?: boolean;
  onCopy?: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className={`message-diagnostic-card ${model.tone}`} aria-label={model.title}>
      <div className="message-diagnostic-card-header">
        <div>
          <strong>{model.title}</strong>
          <span>{model.summary}</span>
        </div>
        <div className="message-diagnostic-actions">
          {onCopy ? (
            <button
              type="button"
              className="message-diagnostic-action"
              aria-label={copied ? `Copied ${model.title}` : `Copy ${model.title}`}
              title={copied ? "Copied" : "Copy"}
              onClick={onCopy}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          ) : null}
          {model.dismissible ? (
            <button
              type="button"
              className="message-diagnostic-action"
              aria-label={`Dismiss ${model.title}`}
              title="Dismiss"
              onClick={onDismiss}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>
      {model.details.trim() ? (
        <details className="message-diagnostic-details">
          <summary>Details</summary>
          <pre>{model.details}</pre>
        </details>
      ) : null}
    </section>
  );
}

export function SessionContextRecoveryInlineActions({
  busy,
  canRetry,
  onRecover,
  onRecoverAndRetry,
  onDuplicate,
}: {
  busy: boolean;
  canRetry: boolean;
  onRecover?: () => void | Promise<void>;
  onRecoverAndRetry?: () => void | Promise<void>;
  onDuplicate?: () => void | Promise<void>;
}) {
  return (
    <div className="session-context-recovery-inline" role="group" aria-label="Chat context recovery actions">
      <div>
        <AlertCircle size={14} aria-hidden="true" />
        <span>The visible transcript can be used to recover this chat.</span>
      </div>
      <SessionContextRecoveryButtons
        busy={busy}
        disabled={false}
        canRetry={canRetry}
        onRecover={() => void onRecover?.()}
        onRecoverAndRetry={() => void onRecoverAndRetry?.()}
        onDuplicate={() => void onDuplicate?.()}
      />
    </div>
  );
}

export function SessionContextRecoveryButtons({
  busy,
  disabled,
  canRetry,
  onRecover,
  onRecoverAndRetry,
  onDuplicate,
}: {
  busy: boolean;
  disabled: boolean;
  canRetry: boolean;
  onRecover: () => void;
  onRecoverAndRetry: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="session-context-recovery-actions">
      <button type="button" disabled={disabled || busy} onClick={onRecover}>
        {busy ? "Rebuilding..." : "Rebuild context"}
      </button>
      <button type="button" disabled={disabled || busy || !canRetry} onClick={onRecoverAndRetry}>
        Rebuild and retry
      </button>
      <button type="button" disabled={disabled} onClick={onDuplicate}>
        Duplicate chat
      </button>
    </div>
  );
}
