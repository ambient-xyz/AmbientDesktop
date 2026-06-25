import { AlertCircle, Download, LoaderCircle, MessageCircle, Paperclip, RefreshCw } from "lucide-react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  Ref,
  RefObject,
  SetStateAction,
} from "react";
import type { DesktopState, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { LocalDeepResearchEffort, LocalDeepResearchRunBudget } from "../../shared/localRuntimeTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { CollaborationMode, ThinkingLevel } from "../../shared/threadTypes";
import type { GitReviewSummary, WorkspaceContextReference, WorkspaceGitStatus } from "../../shared/workspaceTypes";
import type { SlashCommandCatalogEntry, SlashCommandSelection } from "../../shared/slashCommandTypes";
import type { SymphonyWorkflowPatternId } from "../../shared/symphonyWorkflowRecipes";
import type { ProjectBoardThreadPlanActionState } from "./projectBoardUiModel";
import { AppComposerLocalDeepResearchControl } from "./AppComposerLocalDeepResearchControl";
import { AppComposerSettingsControls, type ComposerModelOption } from "./AppComposerSettingsControls";
import { AppComposerRightControls, AppComposerSttStatusStrip, type SttComposerUiState } from "./AppComposerSttControls";
import {
  ChatComposerInput,
  ContextAttachmentStrip,
  ContextUsageIndicator,
  type ChatComposerInputHandle,
  type ComposerDraftStore,
} from "./AppComposerControls";
import {
  AppComposerSlashCommandPopover,
  AppComposerSlashCommandSelectionChip,
  useAppComposerSlashCommandPicker,
} from "./AppComposerSlashCommandPicker";
import { AppComposerStatusBar } from "./AppComposerStatusBar";
import { SymphonyWorkflowBuilderPanel, SymphonyWorkflowComposerToggle } from "./SymphonyWorkflowBuilder";
import type { SymphonyWorkflowBuilderDraft, SymphonyWorkflowBuilderUiModel } from "./symphonyWorkflowBuilderUiModel";
import { type ApiKeyStatus } from "./RightPanel";

export type { SttComposerUiState } from "./AppComposerSttControls";

export type AppComposerShellProps = {
  state: DesktopState;
  composerInputRef: Ref<ChatComposerInputHandle>;
  composerDraftStore: ComposerDraftStore;
  composerCanSubmit: boolean;
  selectedSlashCommand?: SlashCommandSelection;
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
  localDeepResearchRunActive: boolean;
  localDeepResearchModeArmed: boolean;
  localDeepResearchRunBudget: LocalDeepResearchRunBudget;
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
  onSelectSlashCommandEntry: Parameters<typeof useAppComposerSlashCommandPicker>[0]["onSelectSlashCommandEntry"];
  onRemoveSlashCommand: () => void;
  onUnavailableSlashCommand: (entry: SlashCommandCatalogEntry) => void;
  onSelectSymphonyPattern: (patternId: SymphonyWorkflowPatternId) => void;
  onSelectSymphonyStepChoice: (stepId: string, choiceId: string) => void;
  onChangeSymphonyStepCustomText: (stepId: string, value: string) => void;
  onChangeSymphonyMetric: (metricId: string, value: string) => void;
  onChangeSymphonyBlocking: (blocking: boolean) => void;
  onChooseSymphonyPreflightCustom: (goal: string) => void;
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
  onSelectLocalDeepResearchEffort: (effort: LocalDeepResearchEffort) => void;
  onLocalDeepResearchCustomMaxToolCallsChange: (maxToolCalls: number) => void;
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
};

export function AppComposerShell({
  state,
  composerInputRef,
  composerDraftStore,
  composerCanSubmit,
  selectedSlashCommand,
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
  localDeepResearchRunActive,
  localDeepResearchModeArmed,
  localDeepResearchRunBudget,
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
  onSelectSlashCommandEntry,
  onRemoveSlashCommand,
  onUnavailableSlashCommand,
  onSelectSymphonyPattern,
  onSelectSymphonyStepChoice,
  onChangeSymphonyStepCustomText,
  onChangeSymphonyMetric,
  onChangeSymphonyBlocking,
  onChooseSymphonyPreflightCustom,
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
  onSelectLocalDeepResearchEffort,
  onLocalDeepResearchCustomMaxToolCallsChange,
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
}: AppComposerShellProps) {
  const slashCommandPicker = useAppComposerSlashCommandPicker({
    composerDraftStore,
    selectedSlashCommand,
    onComposerKeyDown,
    onSelectSlashCommandEntry,
    onUnavailableSlashCommand,
  });

  const composerPlaceholder = localDeepResearchRunActive
    ? "Local Deep Research is running in this thread"
    : workflowRecordingReviewFeedbackActive
      ? "Reply with Ambient Review feedback before confirming the playbook"
      : state.settings.collaborationMode === "planner"
        ? "Ask Ambient to plan in this project"
        : "Ask Ambient to work in this project";

  return (
    <>
      <form className="composer" onSubmit={onSubmit}>
        <div className="composer-input-wrap">
          <ChatComposerInput
            ref={composerInputRef}
            composerDraftStore={composerDraftStore}
            onChange={onComposerChange}
            onPaste={onComposerPaste}
            onKeyDown={slashCommandPicker.onComposerInputKeyDown}
            disabled={localDeepResearchRunActive}
            placeholder={composerPlaceholder}
          />
          {slashCommandPicker.popoverOpen && (
            <AppComposerSlashCommandPopover
              status={slashCommandPicker.status}
              entries={slashCommandPicker.entries}
              activeIndex={slashCommandPicker.activeIndex}
              error={slashCommandPicker.error}
              onHoverEntry={slashCommandPicker.onHoverEntry}
              onChooseEntry={slashCommandPicker.onChooseEntry}
            />
          )}
        </div>
        {selectedSlashCommand && <AppComposerSlashCommandSelectionChip selection={selectedSlashCommand} onRemove={onRemoveSlashCommand} />}
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
            onChoosePreflightCustom={onChooseSymphonyPreflightCustom}
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
            <button type="button" disabled={running || contextRecoveryBusy || !canRetryContextRecovery} onClick={onRecoverAndRetryLatest}>
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
          <AppComposerSttStatusStrip
            sttComposer={sttComposer}
            sttQueuedSpeechLabel={sttQueuedSpeechLabel}
            sttComposerStripStatus={sttComposerStripStatus}
            sttComposerBusy={sttComposerBusy}
            onPreviewSttArtifact={onPreviewSttArtifact}
            onCancelSttComposerRecording={onCancelSttComposerRecording}
            onRetrySttComposerTranscription={onRetrySttComposerTranscription}
            onDiscardSttComposerResult={onDiscardSttComposerResult}
          />
        )}
        <div className="composer-controls">
          <div className="composer-tool-actions" aria-label="Composer tools">
            <button
              type="button"
              className="icon-button subtle"
              data-tooltip="Attach files to the next message."
              aria-label="Attach files"
              disabled={localDeepResearchRunActive}
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
              <SymphonyWorkflowComposerToggle model={symphonyBuilderModel.toggle} onToggle={onToggleSymphonyBuilder} />
            )}
            <AppComposerLocalDeepResearchControl
              ready={localDeepResearchReady}
              modeArmed={localDeepResearchModeArmed}
              runActive={localDeepResearchRunActive}
              collaborationMode={state.settings.collaborationMode}
              runBudget={localDeepResearchRunBudget}
              onToggleMode={onToggleLocalDeepResearchMode}
              onSelectEffort={onSelectLocalDeepResearchEffort}
              onCustomMaxToolCallsChange={onLocalDeepResearchCustomMaxToolCallsChange}
            />
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
          <AppComposerSettingsControls
            state={state}
            running={running}
            goalModeArmed={goalModeArmed}
            goalBusy={goalBusy}
            showRevisePlanControl={showRevisePlanControl}
            activeThreadSuppressesProjectBoard={activeThreadSuppressesProjectBoard}
            projectBoardThreadPlanAction={projectBoardThreadPlanAction}
            projectBoardPlanPickerOpen={projectBoardPlanPickerOpen}
            readyPlannerPlanArtifacts={readyPlannerPlanArtifacts}
            modelPickerRef={modelPickerRef}
            modelPickerButtonRef={modelPickerButtonRef}
            modelPickerOpen={modelPickerOpen}
            composerModelOptions={composerModelOptions}
            selectedComposerModelOption={selectedComposerModelOption}
            onCollaborationModeChange={onCollaborationModeChange}
            onToggleGoalMode={onToggleGoalMode}
            onPermissionModeChange={onPermissionModeChange}
            onReviseLatestPlannerPlan={onReviseLatestPlannerPlan}
            onRunProjectBoardThreadPlanAction={onRunProjectBoardThreadPlanAction}
            onAddPlannerPlanToBoard={onAddPlannerPlanToBoard}
            onThinkingDisplayModeChange={onThinkingDisplayModeChange}
            onThinkingLevelChange={onThinkingLevelChange}
            setModelPickerOpen={setModelPickerOpen}
            onFocusModelPickerOption={onFocusModelPickerOption}
            onSelectComposerModel={onSelectComposerModel}
          />
          <AppComposerRightControls
            sttComposerRecording={sttComposerRecording}
            sttComposerBusy={sttComposerBusy}
            sttComposerDisabled={sttComposerDisabled}
            sttComposerShortcutLabel={sttComposerShortcutLabel}
            sttComposerTitle={sttComposerTitle}
            localDeepResearchRunActive={localDeepResearchRunActive}
            running={running}
            abortArmed={abortArmed}
            composerCanSubmit={composerCanSubmit}
            onStartSttComposerRecording={onStartSttComposerRecording}
            onStopSttComposerRecording={onStopSttComposerRecording}
            onCancelSttComposerRecording={onCancelSttComposerRecording}
            onAbortRun={onAbortRun}
          />
        </div>
      </form>

      <AppComposerStatusBar
        activeGitReview={activeGitReview}
        activeGitReviewError={activeGitReviewError}
        gitStatus={gitStatus}
        gitStatusError={gitStatusError}
        activeThreadGoal={state.activeThreadGoal}
        collaborationMode={state.settings.collaborationMode}
        permissionMode={state.settings.permissionMode}
        goalMenuOpen={goalMenuOpen}
        goalBusy={goalBusy}
        onCreateThreadWorktree={onCreateThreadWorktree}
        onAttachExistingWorktree={onAttachExistingWorktree}
        onOpenGitSummary={onOpenGitSummary}
        onSwitchBranch={onSwitchBranch}
        onCreateBranch={onCreateBranch}
        onToggleGoalMenu={onToggleGoalMenu}
        onPauseResumeGoal={onPauseResumeGoal}
        onEditGoalObjective={onEditGoalObjective}
        onSetGoalBudget={onSetGoalBudget}
        onClearGoal={onClearGoal}
      />
    </>
  );
}
