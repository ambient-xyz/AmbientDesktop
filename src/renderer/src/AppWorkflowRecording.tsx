import {
  Check,
  ClipboardPaste,
  Download,
  LoaderCircle,
  MessageCircle,
  Pencil,
  RotateCcw,
  Send,
  Square,
  X,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import type { RunStatus } from "../../shared/threadTypes";
import type { WorkflowCompileProgress, WorkflowRecordingEditContext, WorkflowRecordingReviewDraftUpdate, WorkflowRecordingState } from "../../shared/workflowTypes";
import { ambientMiniLogoUrl } from "./AppBranding";
import {
  RUN_ACTIVITY_PLACEHOLDER,
  summarizeRunActivity,
  workflowReviewRetryStatusLabel,
  type RunActivityLine,
  type RunRetryStats,
} from "./AppRunActivity";
import {
  workflowRecorderLegacyCompilerEnabled,
  workflowRecorderReviewDraftUpdateFromEditorFields,
  workflowRecorderReviewEditorFieldsFromDraft,
  workflowRecorderReviewModel,
  workflowRecorderSurfaceModel,
  type WorkflowRecorderReviewEditorFields,
} from "./workflowRecorderUiModel";

const workflowRecorderSurface = workflowRecorderSurfaceModel({
  legacyCompilerEnabled: workflowRecorderLegacyCompilerEnabled(import.meta.env.AMBIENT_LEGACY_WORKFLOW_COMPILER),
});

export function WorkflowRecorderEmptyChatState({
  title,
  paragraphs,
  children,
}: {
  title: string;
  paragraphs: string[];
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <img className="ambient-mark large" src={ambientMiniLogoUrl} alt="" />
      <h1>{title}</h1>
      <div className="empty-project-guidance">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {children}
    </div>
  );
}

export function workflowRecordingEditContextFromMetadata(value: unknown): WorkflowRecordingEditContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.version !== "number") return undefined;
  if (
    typeof record.manifestPath !== "string" ||
    typeof record.markdownPath !== "string" ||
    typeof record.sidecarPath !== "string" ||
    typeof record.transcriptPath !== "string"
  ) {
    return undefined;
  }
  return {
    id: record.id,
    title: record.title,
    version: record.version,
    manifestPath: record.manifestPath,
    markdownPath: record.markdownPath,
    sidecarPath: record.sidecarPath,
    transcriptPath: record.transcriptPath,
  };
}

export function coalesceWorkflowCompileProgress(current: WorkflowCompileProgress[], progress: WorkflowCompileProgress): WorkflowCompileProgress[] {
  const activeCompile = current.some((item) => item.compileId === progress.compileId) ? current : [];
  const duplicateIndex = [...activeCompile]
    .reverse()
    .findIndex((item) => item.compileId === progress.compileId && item.phase === progress.phase && item.status === progress.status);
  if (duplicateIndex < 0) return [...activeCompile, progress].slice(-10);
  const index = activeCompile.length - 1 - duplicateIndex;
  const next = [...activeCompile];
  next[index] = progress;
  return next.slice(-10);
}

export function WorkflowRecordingChatBanner({
  recording,
  reviewRunning,
  running,
  abortArmed,
  activeThreadId,
  activeRunActivityLines,
  runStatus,
  retryStats,
  chatExportBusy,
  onRetryReview,
  onAbortRun,
  onStopRecording,
  onExportActiveChat,
}: {
  recording?: WorkflowRecordingState;
  reviewRunning: boolean;
  running: boolean;
  abortArmed: boolean;
  activeThreadId?: string;
  activeRunActivityLines: RunActivityLine[];
  runStatus: RunStatus;
  retryStats?: RunRetryStats;
  chatExportBusy: boolean;
  onRetryReview: (recording: WorkflowRecordingState) => void | Promise<void>;
  onAbortRun: (threadId: string) => void | Promise<void>;
  onStopRecording: (input?: { requestReview?: boolean }) => void | Promise<void>;
  onExportActiveChat: () => void | Promise<void>;
}) {
  if (!recording) return null;
  const capture = recording.capture;
  const isRecording = recording.status === "recording";
  const review = isRecording ? undefined : workflowRecorderReviewModel(recording);
  if (!isRecording && !reviewRunning) return null;
  if (!isRecording) {
    const visibleLines = activeRunActivityLines.length > 0 ? activeRunActivityLines : [RUN_ACTIVITY_PLACEHOLDER];
    const latestLineId = visibleLines.at(-1)?.id;
    const summary = summarizeRunActivity(activeRunActivityLines, runStatus);
    const reviewMetrics = review?.available ? review.metrics.filter((metric) => metric.label !== "Redactions").slice(0, 3) : [];
    const aggressiveRetries = true;
    return (
      <div className="workflow-exploration-live-card running workflow-recorder-chat-stopover workflow-recorder-review-activity" role="status" aria-live="polite">
        <div className="workflow-recorder-banner-head">
          <div>
            <strong>Reviewing with Ambient</strong>
            <p>{summary.subtitle || "Ambient is reviewing the captured workflow playbook."}</p>
          </div>
          <div className="workflow-recorder-banner-actions">
            <button
              type="button"
              className="panel-button mini"
              disabled={!abortArmed}
              title={abortArmed ? "Stop this review attempt and retry in a fresh Ambient review session." : "Ambient review is starting."}
              onClick={() => void onRetryReview(recording)}
            >
              <RotateCcw size={13} />
              Retry
            </button>
            <button
              type="button"
              className="panel-button mini danger"
              disabled={!abortArmed || !activeThreadId}
              title={abortArmed ? "Cancel the active Ambient review session." : "Ambient review is starting."}
              onClick={() => activeThreadId && void onAbortRun(activeThreadId)}
            >
              <Square size={13} />
              Cancel
            </button>
            <LoaderCircle size={15} className="spin" aria-hidden="true" />
          </div>
        </div>
        <div className="workflow-recorder-review-activity-metrics" aria-label="Workflow review status">
          <span>Status {runStatus === "retrying" ? "retrying" : runStatus === "streaming" ? "streaming" : runStatus === "tool" ? "using tools" : "starting"}</span>
          <span>{workflowReviewRetryStatusLabel(retryStats, aggressiveRetries)}</span>
          {reviewMetrics.map((metric) => (
            <span key={metric.label}>
              {metric.value} {metric.label.toLowerCase()}
            </span>
          ))}
        </div>
        <div className="run-activity-lines workflow-recorder-review-activity-lines">
          {visibleLines.map((line) => (
            <div className={`run-activity-line ${line.kind}${line.id === latestLineId ? " active" : ""}`} key={line.id}>
              <span aria-hidden="true" />
              <p>{line.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const title = isRecording ? workflowRecorderSurface.chatBanner.recordingTitle : workflowRecorderSurface.chatBanner.stoppedTitle;
  const detail = isRecording
    ? recording.goal || "Use normal chat. Ambient will capture successful tools, failed approaches, assistant answers, and validation evidence."
    : capture
      ? `${capture.messageCount} messages captured, including ${capture.successfulToolResultCount} successful, ${capture.failedToolResultCount} failed, and ${capture.redactionCount ?? 0} redacted evidence item${(capture.redactionCount ?? 0) === 1 ? "" : "s"}.`
      : "Transcript capture is ready for the Phase 3 review summary.";
  return (
    <div className={`workflow-exploration-live-card ${isRecording ? "running" : "paused"} workflow-recorder-chat-stopover`} role="status" aria-live="polite">
      <div className="workflow-recorder-banner-head">
        <div>
          <strong>{title}</strong>
          <p>{detail}</p>
        </div>
        <div className="workflow-recorder-banner-actions">
          {isRecording && (
            <button
              type="button"
              className="panel-button mini primary workflow-recorder-review-button"
              disabled={running}
              title={
                running
                  ? "Wait for the current Ambient response to finish before requesting workflow review."
                  : workflowRecorderSurface.chatBanner.stopAndReviewButtonTitle
              }
              onClick={() => void onStopRecording({ requestReview: true })}
            >
              <Send size={13} />
              {workflowRecorderSurface.chatBanner.stopAndReviewButtonLabel}
            </button>
          )}
          <button
            type="button"
            className="panel-button mini"
            disabled={!isRecording || running}
            title={isRecording ? "Stop recording without sending the draft playbook to Ambient Review." : title}
            onClick={() => void onStopRecording()}
          >
            <Square size={13} />
            {isRecording ? workflowRecorderSurface.chatBanner.stopButtonLabel : workflowRecorderSurface.chatBanner.stoppedButtonLabel}
          </button>
          <button
            type="button"
            className="panel-button mini"
            disabled={chatExportBusy || !activeThreadId}
            title="Export the full redacted Pi session log and visible transcript for this workflow recording."
            onClick={() => void onExportActiveChat()}
          >
            {chatExportBusy ? <LoaderCircle size={13} className="spin" /> : <Download size={13} />}
            Export session
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowRecordingReviewPanel({
  recording,
  open,
  running,
  onClose,
  onRetryReview,
  onApplyLatestSummary,
  onSaveReviewEdit,
  onDraftValidationError,
  onFocusFeedback,
  onConfirmReview,
}: {
  recording?: WorkflowRecordingState;
  open: boolean;
  running: boolean;
  onClose: () => void;
  onRetryReview: (recording: WorkflowRecordingState) => void | Promise<void>;
  onApplyLatestSummary: () => void | Promise<void>;
  onSaveReviewEdit: (draft: WorkflowRecordingReviewDraftUpdate) => void | Promise<void>;
  onDraftValidationError: (message: string) => void;
  onFocusFeedback: () => void;
  onConfirmReview: () => void | Promise<void>;
}) {
  if (!recording || recording.status === "recording" || !open) return null;
  const review = workflowRecorderReviewModel(recording);
  if (!review.available) return null;
  const draft = recording.review?.draft;
  const editorFields = draft ? workflowRecorderReviewEditorFieldsFromDraft(draft) : undefined;
  const confirmed = recording.review?.status === "confirmed";
  const saveReviewEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft = workflowRecorderReviewDraftUpdateFromEditorFields(workflowRecordingReviewFieldsFromForm(event.currentTarget));
    if (!draft.intent.trim()) {
      onDraftValidationError("Workflow playbook intent is required before saving review edits.");
      return;
    }
    void onSaveReviewEdit(draft);
  };
  return (
    <aside className="workflow-recorder-review-panel" aria-label="Workflow recording Phase 3 review">
      <header className="workflow-recorder-review-panel-header">
        <div className="workflow-recorder-review-panel-title">
          <div>
            <strong>Workflow Review</strong>
            <p>{confirmed ? "The playbook is confirmed and ready for indexing." : "Ambient Review is active. Send feedback in chat, then confirm when the draft is right."}</p>
          </div>
          <button
            type="button"
            className="panel-button mini icon-only-panel-button"
            title="Close the review panel. The review summary stays visible in chat."
            aria-label="Close workflow recording review panel"
            onClick={onClose}
          >
            <X size={13} />
          </button>
        </div>
        <div className="workflow-recorder-review-panel-toolbar">
          <span className={`workflow-recorder-status-chip ${confirmed ? "confirmed" : ""}`}>{confirmed ? review.statusLabel : "Ambient Review"}</span>
          {!confirmed && (
            <>
              <button
                type="button"
                className="panel-button mini"
                disabled={running}
                title={workflowRecorderSurface.chatBanner.retryReviewButtonTitle}
                onClick={() => void onRetryReview(recording)}
              >
                <RotateCcw size={13} />
                {workflowRecorderSurface.chatBanner.retryReviewButtonLabel}
              </button>
              <button
                type="button"
                className="panel-button mini"
                disabled={running}
                title={workflowRecorderSurface.chatBanner.applySummaryButtonTitle}
                onClick={() => void onApplyLatestSummary()}
              >
                <ClipboardPaste size={13} />
                {workflowRecorderSurface.chatBanner.applySummaryButtonLabel}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="workflow-recorder-review-panel-scroll">
        <section className="workflow-recorder-review-panel-section">
          <div className="workflow-recorder-review-section-head">
            <strong>{review.title}</strong>
            <span>{review.statusLabel}</span>
          </div>
          <p className="workflow-recorder-review-intent">{review.intent}</p>
          {recording.review?.validationIssues?.length ? (
            <div className="workflow-recorder-review-validation-issues" role="alert">
              <strong>Draft edit rejected</strong>
              <ul>
                {recording.review.validationIssues.slice(0, 4).map((issue, index) => (
                  <li key={`${issue.field}:${issue.term}:${index}`}>
                    <span>{issue.field}</span>
                    {issue.message} Found <code>{issue.term}</code>.
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="workflow-recorder-review-metrics">
            {review.metrics.map((metric) => (
              <span key={metric.label}>
                <strong>{metric.value}</strong>
                {metric.label}
              </span>
            ))}
          </div>
        </section>

        {recording.review?.savedPlaybook && (
          <section className="workflow-recorder-saved-playbook workflow-recorder-review-panel-section">
            <strong>Saved workflow package</strong>
            <p>
              Version {recording.review.savedPlaybook.version} indexed at <code>{recording.review.savedPlaybook.markdownPath}</code>
            </p>
          </section>
        )}

        {draft && editorFields && !confirmed ? (
          <form
            key={`${draft.source}:${draft.generatedAt}`}
            className="workflow-recorder-review-editor workflow-recorder-review-panel-section"
            aria-label="Edit workflow recording review"
            onSubmit={saveReviewEdit}
          >
            <div className="workflow-recorder-review-section-head">
              <strong>Draft playbook</strong>
              <span>Editable</span>
            </div>
            <label className="workflow-recorder-editor-field wide">
              <span>Intent</span>
              <textarea name="intent" rows={2} defaultValue={editorFields.intent} />
            </label>
            <div className="workflow-recorder-review-editor-grid">
              <label className="workflow-recorder-editor-field">
                <span>Inputs</span>
                <textarea name="inputs" rows={4} defaultValue={editorFields.inputs} />
              </label>
              <label className="workflow-recorder-editor-field">
                <span>Successful tool examples</span>
                <textarea
                  name="successfulExamples"
                  rows={4}
                  defaultValue={editorFields.successfulExamples}
                  placeholder="browser_search | Scottsdale theater events | Returned venue pages | .ambient/tool-outputs/search.txt"
                />
              </label>
              <label className="workflow-recorder-editor-field">
                <span>Do Not</span>
                <textarea name="doNot" rows={3} defaultValue={editorFields.doNot} placeholder="failed | browser_open | Venue page returned 403" />
              </label>
              <label className="workflow-recorder-editor-field">
                <span>Validation</span>
                <textarea name="validation" rows={3} defaultValue={editorFields.validation} />
              </label>
              <label className="workflow-recorder-editor-field wide">
                <span>Output shape</span>
                <textarea name="outputShape" rows={3} defaultValue={editorFields.outputShape} />
              </label>
            </div>
            <div className="workflow-recorder-review-actions">
              <button type="submit" className="panel-button mini" disabled={running} title="Save these corrections into the draft playbook before confirmation.">
                <Pencil size={13} />
                Save edits
              </button>
            </div>
          </form>
        ) : (
          <section className="workflow-recorder-review-panel-section">
            <div className="workflow-recorder-review-section-head">
              <strong>Review sections</strong>
              <span>Read only</span>
            </div>
            <div className="workflow-recorder-review-grid">
              {review.sections.map((section) => (
                <section key={section.title}>
                  <strong>{section.title}</strong>
                  {(section.items.length ? section.items : [section.emptyLabel]).slice(0, 4).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </section>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="workflow-recorder-review-panel-footer">
        <p>{confirmed ? "This playbook has been confirmed." : "Use chat for Ambient Review feedback. Confirm only after the review reads correctly."}</p>
        <div className="workflow-recorder-review-actions">
          {!confirmed && (
            <>
              <button
                type="button"
                className="panel-button mini"
                disabled={running}
                title="Focus the chat composer to write feedback for Ambient Review."
                onClick={onFocusFeedback}
              >
                <MessageCircle size={13} />
                Add feedback
              </button>
              <button
                type="button"
                className="panel-button mini"
                disabled={running}
                title={workflowRecorderSurface.chatBanner.retryReviewButtonTitle}
                onClick={() => void onRetryReview(recording)}
              >
                <RotateCcw size={13} />
                {workflowRecorderSurface.chatBanner.retryReviewButtonLabel}
              </button>
              <button
                type="button"
                className="panel-button mini primary"
                disabled={running}
                title={workflowRecorderSurface.chatBanner.confirmButtonTitle}
                onClick={() => void onConfirmReview()}
              >
                <Check size={13} />
                {workflowRecorderSurface.chatBanner.confirmButtonLabel}
              </button>
            </>
          )}
        </div>
      </footer>
    </aside>
  );
}

function workflowRecordingReviewFieldsFromForm(form: HTMLFormElement): WorkflowRecorderReviewEditorFields {
  const data = new FormData(form);
  const field = (name: keyof WorkflowRecorderReviewEditorFields) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    intent: field("intent"),
    inputs: field("inputs"),
    successfulExamples: field("successfulExamples"),
    doNot: field("doNot"),
    validation: field("validation"),
    outputShape: field("outputShape"),
  };
}
