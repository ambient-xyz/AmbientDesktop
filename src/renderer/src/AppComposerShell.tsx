import {
  AlertCircle,
  BookOpenText,
  Bot,
  Brain,
  ChevronDown,
  ClipboardPaste,
  Download,
  Kanban,
  LoaderCircle,
  MessageCircle,
  Mic,
  Paperclip,
  RefreshCw,
  Send,
  Shield,
  Square,
  X,
  Zap,
} from "lucide-react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  Ref,
  RefObject,
  SetStateAction,
} from "react";

import type {
  CollaborationMode,
  DesktopState,
  GitReviewSummary,
  PermissionMode,
  PlannerPlanArtifact,
  SttTranscriptionState,
  ThinkingDisplayMode,
  ThinkingLevel,
  WorkspaceContextReference,
  WorkspaceGitStatus,
} from "../../shared/types";
import { sttMessageMetadataFromTranscription } from "../../shared/sttMessageMetadata";
import type { SymphonyWorkflowPatternId } from "../../shared/symphonyWorkflowRecipes";
import type { ProjectBoardThreadPlanActionState } from "./projectBoardUiModel";
import type { SttMicrophoneLevel } from "./sttMicrophoneRecorder";
import {
  ChatComposerInput,
  ContextAttachmentStrip,
  ContextUsageIndicator,
  SegmentedCollaborationMode,
  SegmentedPermission,
  type ChatComposerInputHandle,
  type ComposerDraftStore,
} from "./AppComposerControls";
import {
  GoalModeComposerToggle,
  GoalStatusControl,
} from "./AppGoalControls";
import {
  GitStatusControl,
  GitWorkModeControl,
} from "./AppGitControls";
import { SttArtifactLinks } from "./AppMessages";
import {
  SymphonyWorkflowBuilderPanel,
  SymphonyWorkflowComposerToggle,
} from "./SymphonyWorkflowBuilder";
import type {
  SymphonyWorkflowBuilderDraft,
  SymphonyWorkflowBuilderUiModel,
} from "./symphonyWorkflowBuilderUiModel";
import {
  thinkingDisplayModeLabel,
  thinkingLevelLabel,
  thinkingOptions,
} from "./thinkingDisplayUiModel";
import {
  type ApiKeyStatus,
  thinkingDisplayOptions,
} from "./RightPanel";

export type SttComposerUiState = {
  status: "idle" | "recording" | "saving" | "transcribing" | "ready" | "no-speech" | "error";
  message?: string;
  state?: SttTranscriptionState;
  level?: SttMicrophoneLevel;
  silenceMs?: number;
};

type ComposerModelOption = {
  id: string;
  label: string;
};

export function AppComposerShell({
  state,
  composerInputRef,
  composerDraftStore,
  composerCanSubmit,
  running,
  abortArmed,
  workflowRecordingReviewFeedbackActive,
  symphonyBuilderModel,
  symphonyBuilderDraft,
  symphonyBuilderActionBusy,
  contextAttachments,
  contextError,
  sessionContextMissing,
  contextRecoveryBusy,
  canRetryContextRecovery,
  chatExportStatus,
  chatExportBusy,
  showSttComposerStrip,
  sttComposer,
  sttQueuedSpeechLabel,
  sttComposerStripStatus,
  sttComposerRecording,
  sttComposerBusy,
  sttComposerDisabled,
  sttComposerShortcutLabel,
  sttComposerTitle,
  localDeepResearchReady,
  localDeepResearchModeArmed,
  goalModeArmed,
  goalBusy,
  showRevisePlanControl,
  activeThreadSuppressesProjectBoard,
  projectBoardThreadPlanAction,
  projectBoardPlanPickerOpen,
  readyPlannerPlanArtifacts,
  modelPickerRef,
  modelPickerButtonRef,
  modelPickerOpen,
  composerModelOptions,
  selectedComposerModelOption,
  activeGitReview,
  activeGitReviewError,
  gitStatus,
  gitStatusError,
  goalMenuOpen,
  onSubmit,
  onComposerChange,
  onComposerPaste,
  onComposerKeyDown,
  onSelectSymphonyPattern,
  onSelectSymphonyStepChoice,
  onChangeSymphonyStepCustomText,
  onChangeSymphonyMetric,
  onChangeSymphonyBlocking,
  onRunSymphonyOnce,
  onSaveSymphonyRecipe,
  onRemoveContextAttachment,
  onClearContextAttachments,
  onRecoverActiveThreadContext,
  onRecoverAndRetryLatest,
  onDuplicateActiveThreadFromTranscript,
  onDismissChatExportStatus,
  onPreviewSttArtifact,
  onCancelSttComposerRecording,
  onRetrySttComposerTranscription,
  onDiscardSttComposerResult,
  onAttachComposerFiles,
  onToggleSymphonyBuilder,
  onToggleLocalDeepResearchMode,
  onCompactActiveThread,
  onExportActiveChat,
  onCollaborationModeChange,
  onToggleGoalMode,
  onPermissionModeChange,
  onReviseLatestPlannerPlan,
  onRunProjectBoardThreadPlanAction,
  onAddPlannerPlanToBoard,
  onThinkingDisplayModeChange,
  onThinkingLevelChange,
  setModelPickerOpen,
  onFocusModelPickerOption,
  onSelectComposerModel,
  onStartSttComposerRecording,
  onStopSttComposerRecording,
  onAbortRun,
  onCreateThreadWorktree,
  onAttachExistingWorktree,
  onOpenGitSummary,
  onSwitchBranch,
  onCreateBranch,
  onToggleGoalMenu,
  onPauseResumeGoal,
  onEditGoalObjective,
  onSetGoalBudget,
  onClearGoal,
}: {
  state: DesktopState;
  composerInputRef: Ref<ChatComposerInputHandle>;
  composerDraftStore: ComposerDraftStore;
  composerCanSubmit: boolean;
  running: boolean;
  abortArmed: boolean;
  workflowRecordingReviewFeedbackActive: boolean;
  symphonyBuilderModel?: SymphonyWorkflowBuilderUiModel;
  symphonyBuilderDraft: SymphonyWorkflowBuilderDraft;
  symphonyBuilderActionBusy?: "run-once" | "save-recipe";
  contextAttachments: WorkspaceContextReference[];
  contextError?: string;
  sessionContextMissing: boolean;
  contextRecoveryBusy: boolean;
  canRetryContextRecovery: boolean;
  chatExportStatus?: ApiKeyStatus;
  chatExportBusy: boolean;
  showSttComposerStrip: boolean;
  sttComposer: SttComposerUiState;
  sttQueuedSpeechLabel?: string;
  sttComposerStripStatus: SttComposerUiState["status"] | "queued";
  sttComposerRecording: boolean;
  sttComposerBusy: boolean;
  sttComposerDisabled: boolean;
  sttComposerShortcutLabel?: string;
  sttComposerTitle: string;
  localDeepResearchReady: boolean;
  localDeepResearchModeArmed: boolean;
  goalModeArmed: boolean;
  goalBusy: boolean;
  showRevisePlanControl: boolean;
  activeThreadSuppressesProjectBoard: boolean;
  projectBoardThreadPlanAction: ProjectBoardThreadPlanActionState;
  projectBoardPlanPickerOpen: boolean;
  readyPlannerPlanArtifacts: PlannerPlanArtifact[];
  modelPickerRef: RefObject<HTMLDivElement | null>;
  modelPickerButtonRef: RefObject<HTMLButtonElement | null>;
  modelPickerOpen: boolean;
  composerModelOptions: ComposerModelOption[];
  selectedComposerModelOption: ComposerModelOption;
  activeGitReview?: GitReviewSummary;
  activeGitReviewError?: string;
  gitStatus?: WorkspaceGitStatus;
  gitStatusError?: string;
  goalMenuOpen: boolean;
  onSubmit: (event: FormEvent) => void;
  onComposerChange: (value: string) => void;
  onComposerPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  onComposerKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onSelectSymphonyPattern: (patternId: SymphonyWorkflowPatternId) => void;
  onSelectSymphonyStepChoice: (stepId: string, choiceId: string) => void;
  onChangeSymphonyStepCustomText: (stepId: string, value: string) => void;
  onChangeSymphonyMetric: (metricId: string, value: string) => void;
  onChangeSymphonyBlocking: (blocking: boolean) => void;
  onRunSymphonyOnce: () => void;
  onSaveSymphonyRecipe: () => void;
  onRemoveContextAttachment: (item: WorkspaceContextReference) => void;
  onClearContextAttachments: () => void;
  onRecoverActiveThreadContext: () => void;
  onRecoverAndRetryLatest: () => void;
  onDuplicateActiveThreadFromTranscript: () => void;
  onDismissChatExportStatus: () => void;
  onPreviewSttArtifact: (path: string) => void;
  onCancelSttComposerRecording: () => void;
  onRetrySttComposerTranscription: () => void;
  onDiscardSttComposerResult: () => void;
  onAttachComposerFiles: () => void;
  onToggleSymphonyBuilder: () => void;
  onToggleLocalDeepResearchMode: () => void;
  onCompactActiveThread: () => void;
  onExportActiveChat: () => void;
  onCollaborationModeChange: (collaborationMode: CollaborationMode) => void;
  onToggleGoalMode: () => void;
  onPermissionModeChange: (permissionMode: PermissionMode) => void;
  onReviseLatestPlannerPlan: () => void;
  onRunProjectBoardThreadPlanAction: () => void;
  onAddPlannerPlanToBoard: (artifact: PlannerPlanArtifact) => void;
  onThinkingDisplayModeChange: (mode: ThinkingDisplayMode) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  setModelPickerOpen: Dispatch<SetStateAction<boolean>>;
  onFocusModelPickerOption: (index?: number) => void;
  onSelectComposerModel: (modelId: string) => void;
  onStartSttComposerRecording: () => void;
  onStopSttComposerRecording: () => void;
  onAbortRun: () => void;
  onCreateThreadWorktree: () => void;
  onAttachExistingWorktree: () => void;
  onOpenGitSummary: () => void;
  onSwitchBranch: (branch: string) => void;
  onCreateBranch: (branch: string) => Promise<void>;
  onToggleGoalMenu: () => void;
  onPauseResumeGoal: () => void;
  onEditGoalObjective: () => void;
  onSetGoalBudget: () => void;
  onClearGoal: () => void;
}) {
  return (
    <>
      <form className="composer" onSubmit={onSubmit}>
        <ChatComposerInput
          ref={composerInputRef}
          onChange={onComposerChange}
          onPaste={onComposerPaste}
          onKeyDown={onComposerKeyDown}
          placeholder={
            workflowRecordingReviewFeedbackActive
              ? "Reply with Ambient Review feedback before confirming the playbook"
              : state.settings.collaborationMode === "planner"
                ? "Ask Ambient to plan in this project"
                : "Ask Ambient to work in this project"
          }
        />
        {symphonyBuilderModel && (
          <SymphonyWorkflowBuilderPanel
            model={symphonyBuilderModel}
            featureFlagSnapshot={state.featureFlagSnapshot}
            draft={symphonyBuilderDraft}
            composerDraftStore={composerDraftStore}
            onSelectPattern={onSelectSymphonyPattern}
            onSelectStepChoice={onSelectSymphonyStepChoice}
            onChangeStepCustomText={onChangeSymphonyStepCustomText}
            onChangeMetric={onChangeSymphonyMetric}
            onChangeBlocking={onChangeSymphonyBlocking}
            onRunOnce={onRunSymphonyOnce}
            onSaveRecipe={onSaveSymphonyRecipe}
            actionBusy={symphonyBuilderActionBusy}
          />
        )}
        {workflowRecordingReviewFeedbackActive && (
          <div className="workflow-recorder-feedback-strip">
            <MessageCircle size={13} aria-hidden="true" />
            <span>Feedback sent here goes to the active Ambient Review. Confirm the playbook from the review panel when it is ready.</span>
          </div>
        )}
        {contextAttachments.length > 0 && (
          <ContextAttachmentStrip
            attachments={contextAttachments}
            onRemove={onRemoveContextAttachment}
            onClear={onClearContextAttachments}
          />
        )}
        {contextError && <div className="context-error-strip">{contextError}</div>}
        {sessionContextMissing && (
          <div className="session-context-warning">
            <AlertCircle size={15} aria-hidden="true" />
            <span>Model context is not available for this chat. The visible transcript is still available.</span>
            <button type="button" disabled={running || contextRecoveryBusy} onClick={onRecoverActiveThreadContext}>
              {contextRecoveryBusy ? "Rebuilding..." : "Rebuild context"}
            </button>
            <button
              type="button"
              disabled={running || contextRecoveryBusy || !canRetryContextRecovery}
              onClick={onRecoverAndRetryLatest}
            >
              Rebuild and retry
            </button>
            <button type="button" disabled={running} onClick={onDuplicateActiveThreadFromTranscript}>
              Duplicate chat
            </button>
          </div>
        )}
        {(state.queue.steering.length > 0 || state.queue.followUp.length > 0) && (
          <div className="queue-strip">
            {state.queue.steering.length > 0 && <span>Steer {state.queue.steering.length}</span>}
            {state.queue.followUp.length > 0 && <span>Follow-up {state.queue.followUp.length}</span>}
          </div>
        )}
        {chatExportStatus && (
          <div className={`chat-export-strip ${chatExportStatus.kind}`}>
            <Download size={13} aria-hidden="true" />
            <span>{chatExportStatus.message}</span>
            <button type="button" className="artifact-link" onClick={onDismissChatExportStatus}>
              Dismiss
            </button>
          </div>
        )}
        {showSttComposerStrip && (
          <div className={`stt-composer-strip ${sttComposerStripStatus}`}>
            <Mic size={13} aria-hidden="true" />
            <span>{sttComposer.status !== "idle" && sttComposer.message ? sttComposer.message : "Speech queued."}</span>
            {sttQueuedSpeechLabel && <small className="stt-queue-count">{sttQueuedSpeechLabel}</small>}
            {sttComposer.level && sttComposer.status === "recording" && (
              <>
                <span className="stt-level-meter" aria-hidden="true">
                  <span style={{ width: `${Math.round(sttComposer.level.level * 100)}%` }} />
                </span>
                <small>
                  {Math.round(sttComposer.level.rmsDbfs)} dBFS
                  {sttComposer.silenceMs ? ` · silence ${(sttComposer.silenceMs / 1000).toFixed(1)}s` : ""}
                </small>
              </>
            )}
            {(sttComposer.status === "no-speech" || sttComposer.status === "error") && sttComposer.state && (
              <SttArtifactLinks
                metadata={sttMessageMetadataFromTranscription(sttComposer.state)}
                onPreviewPath={onPreviewSttArtifact}
                compact
              />
            )}
            {(sttComposerBusy || sttComposer.status === "no-speech" || sttComposer.status === "error") && (
              <div className="stt-strip-actions">
                {sttComposerBusy ? (
                  <button type="button" className="artifact-link" onClick={onCancelSttComposerRecording}>
                    Cancel
                  </button>
                ) : sttComposer.state?.audioPath ? (
                  <button type="button" className="artifact-link" onClick={onRetrySttComposerTranscription}>
                    Retry
                  </button>
                ) : null}
                {!sttComposerBusy && (
                  <button type="button" className="artifact-link" onClick={onDiscardSttComposerResult}>
                    Dismiss
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="composer-controls">
          <div className="composer-tool-actions" aria-label="Composer tools">
            <button
              type="button"
              className="icon-button subtle"
              data-tooltip="Attach files to the next message."
              aria-label="Attach files"
              onClick={onAttachComposerFiles}
            >
              <Paperclip size={17} />
              {contextAttachments.length > 0 && (
                <span className="icon-count" aria-hidden="true">
                  {contextAttachments.length}
                </span>
              )}
            </button>
            {symphonyBuilderModel?.toggle.visible && (
              <SymphonyWorkflowComposerToggle
                model={symphonyBuilderModel.toggle}
                onToggle={onToggleSymphonyBuilder}
              />
            )}
            {localDeepResearchReady && (
              <button
                type="button"
                className={`icon-button subtle local-deep-research-composer-button ${localDeepResearchModeArmed ? "active" : ""}`}
                data-tooltip={
                  state.settings.collaborationMode === "planner"
                    ? "Switch to Agent mode before running Local Deep Research."
                    : localDeepResearchModeArmed
                      ? "Local Deep Research on"
                      : "Local Deep Research"
                }
                aria-label={localDeepResearchModeArmed ? "Disable Local Deep Research" : "Enable Local Deep Research"}
                aria-pressed={localDeepResearchModeArmed}
                disabled={state.settings.collaborationMode === "planner"}
                onClick={onToggleLocalDeepResearchMode}
              >
                <BookOpenText size={17} />
              </button>
            )}
            <ContextUsageIndicator snapshot={state.contextUsage} settings={state.settings.compaction} />
            <button
              type="button"
              className="icon-button subtle"
              data-tooltip="Compact this chat context to free room."
              aria-label="Compact context"
              disabled={running}
              onClick={onCompactActiveThread}
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              className="icon-button subtle"
              data-tooltip="Export the current chat."
              aria-label="Export chat"
              disabled={chatExportBusy || !state.activeThreadId}
              onClick={onExportActiveChat}
            >
              {chatExportBusy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
            </button>
          </div>
          <div className="composer-settings-controls" aria-label="Composer settings">
            <SegmentedCollaborationMode
              value={state.settings.collaborationMode}
              onChange={onCollaborationModeChange}
            />
            <GoalModeComposerToggle
              goal={state.activeThreadGoal}
              armed={goalModeArmed}
              disabled={state.settings.collaborationMode === "planner"}
              busy={goalBusy}
              onToggle={onToggleGoalMode}
            />
            <SegmentedPermission
              value={state.settings.permissionMode}
              onChange={onPermissionModeChange}
            />
            {state.settings.collaborationMode === "planner" && showRevisePlanControl && (
              <div className="project-board-plan-control">
                <button
                  type="button"
                  data-tooltip="Revise the latest plan with composer feedback."
                  aria-label="Revise Plan with feedback"
                  disabled={running}
                  onClick={onReviseLatestPlannerPlan}
                >
                  <RefreshCw size={14} />
                  <span>Revise Plan</span>
                </button>
              </div>
            )}
            {!activeThreadSuppressesProjectBoard && (
              <div className="project-board-plan-control">
                <button
                  type="button"
                  data-tooltip={projectBoardThreadPlanAction.title}
                  aria-label="Add Plan to Board"
                  disabled={projectBoardThreadPlanAction.disabled}
                  onClick={onRunProjectBoardThreadPlanAction}
                >
                  <Kanban size={14} />
                  <span>{projectBoardThreadPlanAction.label}</span>
                  {projectBoardThreadPlanAction.kind === "multiple_ready_plans" && <ChevronDown size={13} />}
                </button>
                {projectBoardPlanPickerOpen && readyPlannerPlanArtifacts.length > 1 && (
                  <div className="project-board-plan-picker" role="menu" aria-label="Ready plans">
                    {readyPlannerPlanArtifacts.map((artifact) => (
                      <button type="button" role="menuitem" key={artifact.id} onClick={() => onAddPlannerPlanToBoard(artifact)}>
                        <span>{artifact.title}</span>
                        <small>{artifact.summary || `${artifact.steps.length} step${artifact.steps.length === 1 ? "" : "s"}`}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <label
              className="thinking-display-control"
              data-tooltip="Choose whether assistant thinking is hidden, temporary, or retained."
              aria-label={`Thinking display: ${thinkingDisplayModeLabel(state.settings.thinkingDisplay.mode)}`}
            >
              <Brain size={14} />
              <select
                aria-label="Thinking display"
                value={state.settings.thinkingDisplay.mode}
                onChange={(event) => onThinkingDisplayModeChange(event.target.value as ThinkingDisplayMode)}
              >
                {thinkingDisplayOptions.map((option) => (
                  <option key={option} value={option}>
                    Thinking: {thinkingDisplayModeLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <select
              aria-label="Thinking effort"
              data-tooltip={`Thinking effort: ${thinkingLevelLabel(state.settings.thinkingLevel)}`}
              value={state.settings.thinkingLevel}
              onChange={(event) => onThinkingLevelChange(event.target.value as ThinkingLevel)}
            >
              {thinkingOptions.map((option) => (
                <option key={option} value={option}>
                  {thinkingLevelLabel(option)}
                </option>
              ))}
            </select>
            <div className="model-picker" ref={modelPickerRef}>
              <button
                ref={modelPickerButtonRef}
                type="button"
                className="model-picker-button"
                aria-haspopup="listbox"
                aria-expanded={modelPickerOpen}
                aria-controls="composer-model-picker-listbox"
                aria-label={`Model: ${selectedComposerModelOption.label}`}
                data-tooltip={`Model: ${selectedComposerModelOption.label}`}
                onClick={() => setModelPickerOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setModelPickerOpen(true);
                    onFocusModelPickerOption(Math.max(composerModelOptions.findIndex((option) => option.id === selectedComposerModelOption.id), 0));
                  }
                }}
              >
                <Bot size={14} />
                <span>{selectedComposerModelOption.label}</span>
                <ChevronDown size={13} />
              </button>
              {modelPickerOpen && (
                <div className="model-picker-menu" id="composer-model-picker-listbox" role="listbox" aria-label="Model">
                  {composerModelOptions.map((option, index) => {
                    const selected = option.id === selectedComposerModelOption.id;
                    return (
                      <button
                        type="button"
                        role="option"
                        id={`composer-model-picker-option-${index}`}
                        aria-selected={selected}
                        className={`model-picker-option ${selected ? "active" : ""}`}
                        key={option.id}
                        onKeyDown={(event) => {
                          const nextIndex = (offset: number) => {
                            event.preventDefault();
                            const options = [...document.querySelectorAll<HTMLButtonElement>(".model-picker-option")];
                            options[Math.max(0, Math.min(options.length - 1, index + offset))]?.focus();
                          };
                          if (event.key === "ArrowDown") nextIndex(1);
                          if (event.key === "ArrowUp") nextIndex(-1);
                          if (event.key === "Home") {
                            event.preventDefault();
                            onFocusModelPickerOption(0);
                          }
                          if (event.key === "End") {
                            event.preventDefault();
                            onFocusModelPickerOption(composerModelOptions.length - 1);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setModelPickerOpen(false);
                            modelPickerButtonRef.current?.focus();
                          }
                        }}
                        onClick={() => {
                          setModelPickerOpen(false);
                          if (!selected) onSelectComposerModel(option.id);
                        }}
                      >
                        <span>{option.label}</span>
                        <small>{option.id}</small>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="right-controls">
            {sttComposerRecording ? (
              <>
                <button
                  type="button"
                  className="icon-button active stt-composer-button"
                  data-tooltip={sttComposerTitle}
                  aria-label="Stop recording and transcribe"
                  onClick={onStopSttComposerRecording}
                >
                  <Square size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button subtle"
                  data-tooltip="Cancel speech recording."
                  aria-label="Cancel speech recording"
                  onClick={onCancelSttComposerRecording}
                >
                  <X size={15} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="icon-button subtle stt-composer-button"
                data-tooltip={sttComposerTitle}
                aria-label="Push to talk"
                disabled={sttComposerDisabled}
                onClick={onStartSttComposerRecording}
              >
                {sttComposerBusy ? <LoaderCircle size={15} className="spin" /> : <Mic size={15} />}
              </button>
            )}
            {sttComposerBusy && (
              <button
                type="button"
                className="icon-button subtle"
                data-tooltip="Cancel speech transcription."
                aria-label="Cancel speech transcription"
                onClick={onCancelSttComposerRecording}
              >
                <X size={15} />
              </button>
            )}
            {sttComposerShortcutLabel && !sttComposerBusy && !sttComposerDisabled && (
              <span className="stt-shortcut-hint" title={`Hold ${sttComposerShortcutLabel} to talk`} aria-hidden="true">
                {sttComposerShortcutLabel}
              </span>
            )}
            {running ? (
              <button
                type="button"
                className="send-button stop-button"
                data-tooltip={abortArmed ? "Stop the current run." : "Ambient is starting this run."}
                aria-label={abortArmed ? "Stop current run" : "Run is starting"}
                disabled={!abortArmed}
                onClick={onAbortRun}
              >
                <Square size={15} />
              </button>
            ) : (
              <button
                type="submit"
                className="send-button"
                data-tooltip="Send this message to Ambient."
                aria-label="Send message"
                data-ui-required-action="composer-send"
                disabled={!composerCanSubmit}
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </form>

      <footer className="statusbar">
        <GitWorkModeControl
          review={activeGitReview}
          error={activeGitReviewError}
          onCreateThreadWorktree={onCreateThreadWorktree}
          onAttachExistingWorktree={onAttachExistingWorktree}
          onOpenGitSummary={onOpenGitSummary}
        />
        <GitStatusControl
          gitStatus={gitStatus}
          error={gitStatusError}
          onSwitchBranch={onSwitchBranch}
          onCreateBranch={onCreateBranch}
        />
        {state.activeThreadGoal && (
          <GoalStatusControl
            goal={state.activeThreadGoal}
            menuOpen={goalMenuOpen}
            busy={goalBusy}
            onToggleMenu={onToggleGoalMenu}
            onPauseResume={onPauseResumeGoal}
            onEditObjective={onEditGoalObjective}
            onSetBudget={onSetGoalBudget}
            onClear={onClearGoal}
          />
        )}
        <span
          className="statusbar-chip"
          data-tooltip={
            state.settings.collaborationMode === "planner"
              ? "Planner mode: Ambient drafts and revises a plan before applying changes."
              : "Agent mode: Ambient can work directly in this project."
          }
          aria-label={state.settings.collaborationMode === "planner" ? "Planner mode" : "Agent mode"}
        >
          {state.settings.collaborationMode === "planner" ? <ClipboardPaste size={13} aria-hidden="true" /> : <Bot size={13} aria-hidden="true" />}
          {state.settings.collaborationMode === "planner" ? "Planner mode" : "Agent mode"}
        </span>
        <span
          className="statusbar-chip"
          data-tooltip={
            state.settings.permissionMode === "full-access"
              ? "Full access: Ambient may request broader tool and filesystem access when needed."
              : "Workspace scope: file and shell work stays inside this project workspace."
          }
          aria-label={state.settings.permissionMode === "full-access" ? "Full access" : "Workspace scope"}
        >
          {state.settings.permissionMode === "full-access" ? <Zap size={13} aria-hidden="true" /> : <Shield size={13} aria-hidden="true" />}
          {state.settings.permissionMode === "full-access" ? "Full access" : "Workspace scope"}
        </span>
      </footer>
    </>
  );
}
