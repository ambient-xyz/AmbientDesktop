import {
  AlertCircle,
  BookOpenText,
  Bot,
  Brain,
  ChevronDown,
  ClipboardPaste,
  Download,
  Gauge,
  Kanban,
  ListChecks,
  LoaderCircle,
  MessageCircle,
  Mic,
  Network,
  Paperclip,
  RefreshCw,
  Send,
  Shield,
  Slash,
  Sparkles,
  Square,
  TerminalSquare,
  X,
  Zap,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  Ref,
  RefObject,
  SetStateAction,
} from "react";
import {
  LOCAL_DEEP_RESEARCH_EFFORT_ORDER,
  LOCAL_DEEP_RESEARCH_EFFORT_PRESETS,
  localDeepResearchEffortLabel,
} from "../../shared/localDeepResearchBudget";

import type { DesktopState, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { LocalDeepResearchEffort, LocalDeepResearchRunBudget, SttTranscriptionState } from "../../shared/localRuntimeTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { CollaborationMode, ThinkingLevel } from "../../shared/threadTypes";
import type { GitReviewSummary, WorkspaceContextReference, WorkspaceGitStatus } from "../../shared/workspaceTypes";
import type {
  SlashCommandCatalogEntry,
  SlashCommandSearchResponse,
  SlashCommandSelection,
} from "../../shared/slashCommandTypes";
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
  useComposerDraftValue,
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
import {
  slashCommandPickerSearchInput,
  slashCommandAvailabilityLabel,
  slashCommandEntryIsSelectable,
  slashCommandGroupLabel,
  slashCommandTriggerFromDraft,
} from "./slashCommandUiModel";

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
}: {
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
  onSelectSlashCommandEntry: (entry: SlashCommandCatalogEntry, query: string, draft: string) => void;
  onRemoveSlashCommand: () => void;
  onUnavailableSlashCommand: (entry: SlashCommandCatalogEntry) => void;
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
}) {
  const [localDeepResearchEffortOpen, setLocalDeepResearchEffortOpen] = useState(false);
  const [localDeepResearchCustomDraft, setLocalDeepResearchCustomDraft] = useState(() => String(localDeepResearchRunBudget.maxToolCalls));
  const localDeepResearchEffortRef = useRef<HTMLDivElement | null>(null);
  const localDeepResearchEffortLabelText = `Effort: ${localDeepResearchEffortLabel(localDeepResearchRunBudget.effort)}`;
  const composerDraftValue = useComposerDraftValue(composerDraftStore);
  const slashTrigger = slashCommandTriggerFromDraft(composerDraftValue, selectedSlashCommand);
  const [slashSearchState, setSlashSearchState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    response?: SlashCommandSearchResponse;
    error?: string;
  }>({ status: "idle" });
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [slashDismissedToken, setSlashDismissedToken] = useState("");
  const slashRequestIdRef = useRef(0);
  const slashPopoverOpen = slashTrigger.active && slashDismissedToken !== slashTrigger.token;
  const slashCommandEntries = slashSearchState.response?.entries ?? [];

  useEffect(() => {
    if (!localDeepResearchModeArmed) setLocalDeepResearchEffortOpen(false);
  }, [localDeepResearchModeArmed]);

  useEffect(() => {
    if (localDeepResearchRunActive) setLocalDeepResearchEffortOpen(false);
  }, [localDeepResearchRunActive]);

  useEffect(() => {
    if (!localDeepResearchEffortOpen) setLocalDeepResearchCustomDraft(String(localDeepResearchRunBudget.maxToolCalls));
  }, [localDeepResearchEffortOpen, localDeepResearchRunBudget.maxToolCalls]);

  useEffect(() => {
    if (slashDismissedToken && slashDismissedToken !== slashTrigger.token) setSlashDismissedToken("");
  }, [slashDismissedToken, slashTrigger.token]);

  useEffect(() => {
    if (!slashPopoverOpen) {
      setSlashSearchState({ status: "idle" });
      setSlashActiveIndex(0);
      return;
    }
    const requestId = ++slashRequestIdRef.current;
    setSlashSearchState({ status: "loading" });
    setSlashActiveIndex(0);
    window.ambientDesktop.searchSlashCommands(slashCommandPickerSearchInput(slashTrigger.query)).then((response) => {
      if (slashRequestIdRef.current !== requestId) return;
      setSlashSearchState({ status: "ready", response });
    }).catch((error) => {
      if (slashRequestIdRef.current !== requestId) return;
      setSlashSearchState({ status: "error", error: error instanceof Error ? error.message : String(error) });
    });
  }, [slashPopoverOpen, slashTrigger.query]);

  function chooseSlashCommand(entry: SlashCommandCatalogEntry): void {
    if (!slashCommandEntryIsSelectable(entry)) {
      onUnavailableSlashCommand(entry);
      return;
    }
    onSelectSlashCommandEntry(entry, slashTrigger.query, composerDraftValue);
    setSlashDismissedToken(slashTrigger.token);
  }

  function handleComposerInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (slashPopoverOpen && slashSearchState.status !== "idle") {
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashDismissedToken(slashTrigger.token);
        return;
      }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && slashCommandEntries.length > 0) {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setSlashActiveIndex((index) => (index + delta + slashCommandEntries.length) % slashCommandEntries.length);
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && slashCommandEntries[slashActiveIndex]) {
        event.preventDefault();
        chooseSlashCommand(slashCommandEntries[slashActiveIndex]!);
        return;
      }
    }
    onComposerKeyDown(event);
  }

  useEffect(() => {
    if (!localDeepResearchEffortOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!localDeepResearchEffortRef.current?.contains(event.target as Node)) setLocalDeepResearchEffortOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setLocalDeepResearchEffortOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [localDeepResearchEffortOpen]);

  function selectLocalDeepResearchEffort(effort: LocalDeepResearchEffort) {
    onSelectLocalDeepResearchEffort(effort);
    setLocalDeepResearchCustomDraft(String(effort === "custom" ? localDeepResearchRunBudget.maxToolCalls : LOCAL_DEEP_RESEARCH_EFFORT_PRESETS[effort].maxToolCalls));
    setLocalDeepResearchEffortOpen(false);
  }

  function changeLocalDeepResearchCustomMaxToolCalls(value: string) {
    setLocalDeepResearchCustomDraft(value);
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) onLocalDeepResearchCustomMaxToolCallsChange(parsed);
  }

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
            onChange={onComposerChange}
            onPaste={onComposerPaste}
            onKeyDown={handleComposerInputKeyDown}
            disabled={localDeepResearchRunActive}
            placeholder={composerPlaceholder}
          />
          {slashPopoverOpen && (
            <SlashCommandPopover
              status={slashSearchState.status}
              entries={slashCommandEntries}
              activeIndex={slashActiveIndex}
              error={slashSearchState.error}
              onHoverEntry={setSlashActiveIndex}
              onChooseEntry={chooseSlashCommand}
            />
          )}
        </div>
        {selectedSlashCommand && (
          <div className="slash-command-chip-strip">
            <button
              type="button"
              className="slash-command-chip"
              onClick={onRemoveSlashCommand}
              data-tooltip={`Remove ${selectedSlashCommand.title}`}
              aria-label={`Remove ${selectedSlashCommand.title}`}
            >
              <SlashCommandGlyph invocationKind={selectedSlashCommand.invocationKind} />
              <span>{selectedSlashCommand.title}</span>
              <small>{slashCommandSelectedKindLabel(selectedSlashCommand)}</small>
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )}
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
                disabled={localDeepResearchRunActive || state.settings.collaborationMode === "planner"}
                onClick={onToggleLocalDeepResearchMode}
              >
                <BookOpenText size={17} />
              </button>
            )}
            {localDeepResearchReady && localDeepResearchModeArmed && (
              <div className="local-deep-research-effort-picker" ref={localDeepResearchEffortRef}>
                <button
                  type="button"
                  className="local-deep-research-effort-chip"
                  data-tooltip={`Local Deep Research effort: ${localDeepResearchRunBudget.maxToolCalls.toLocaleString()} tool calls.`}
                  aria-label={`Local Deep Research ${localDeepResearchEffortLabelText}`}
                  aria-haspopup="menu"
                  aria-expanded={localDeepResearchEffortOpen}
                  disabled={localDeepResearchRunActive}
                  onClick={() => setLocalDeepResearchEffortOpen((open) => !open)}
                >
                  <Gauge size={14} />
                  <span>{localDeepResearchEffortLabelText}</span>
                  <ChevronDown size={13} />
                </button>
                {localDeepResearchEffortOpen && (
                  <div className="local-deep-research-effort-menu" role="menu" aria-label="Research effort">
                    <div className="local-deep-research-effort-menu-heading">Research effort</div>
                    {LOCAL_DEEP_RESEARCH_EFFORT_ORDER.map((effort) => {
                      const selected = localDeepResearchRunBudget.effort === effort;
                      return (
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          className={`local-deep-research-effort-option ${selected ? "active" : ""}`}
                          key={effort}
                          onClick={() => selectLocalDeepResearchEffort(effort)}
                        >
                          <span>{localDeepResearchEffortLabel(effort)}</span>
                          <small>{LOCAL_DEEP_RESEARCH_EFFORT_PRESETS[effort].maxToolCalls.toLocaleString()} tool calls</small>
                        </button>
                      );
                    })}
                    <label className="local-deep-research-custom-budget">
                      <span>Custom max tool calls</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        step={1}
                        value={localDeepResearchCustomDraft}
                        onChange={(event) => changeLocalDeepResearchCustomMaxToolCalls(event.target.value)}
                        onBlur={() => setLocalDeepResearchCustomDraft(String(localDeepResearchRunBudget.maxToolCalls))}
                      />
                    </label>
                  </div>
                )}
              </div>
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
                disabled={sttComposerDisabled || localDeepResearchRunActive}
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
                disabled={!composerCanSubmit || localDeepResearchRunActive}
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

function SlashCommandPopover({
  status,
  entries,
  activeIndex,
  error,
  onHoverEntry,
  onChooseEntry,
}: {
  status: "idle" | "loading" | "ready" | "error";
  entries: SlashCommandCatalogEntry[];
  activeIndex: number;
  error?: string;
  onHoverEntry: (index: number) => void;
  onChooseEntry: (entry: SlashCommandCatalogEntry) => void;
}) {
  let previousGroup = "";
  return (
    <div className="slash-command-popover" role="listbox" aria-label="Slash commands">
      {status === "loading" && (
        <div className="slash-command-empty">
          <LoaderCircle size={15} className="spin" aria-hidden="true" />
          <span>Searching...</span>
        </div>
      )}
      {status === "error" && (
        <div className="slash-command-empty warning">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error || "Command search failed."}</span>
        </div>
      )}
      {status === "ready" && entries.length === 0 && (
        <div className="slash-command-empty">
          <Slash size={15} aria-hidden="true" />
          <span>No commands found.</span>
        </div>
      )}
      {status === "ready" && entries.map((entry, index) => {
        const group = slashCommandGroupLabel(entry);
        const showGroup = group !== previousGroup;
        previousGroup = group;
        const selectable = slashCommandEntryIsSelectable(entry);
        return (
          <div key={entry.id}>
            {showGroup && <div className="slash-command-group-label">{group}</div>}
            <button
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              aria-disabled={!selectable}
              className={`slash-command-option ${activeIndex === index ? "active" : ""} ${selectable ? "" : "unavailable"}`}
              onMouseEnter={() => onHoverEntry(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChooseEntry(entry)}
            >
              <span className="slash-command-option-icon">
                <SlashCommandGlyph invocationKind={entry.invocationKind} />
              </span>
              <span className="slash-command-option-copy">
                <span>
                  <strong>{entry.command}</strong>
                  <em>{entry.title}</em>
                </span>
                {entry.description && <small>{entry.description}</small>}
              </span>
              <span className={`slash-command-availability ${entry.availability}`}>
                {slashCommandAvailabilityLabel(entry.availability)}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SlashCommandGlyph({ invocationKind }: { invocationKind: SlashCommandCatalogEntry["invocationKind"] | SlashCommandSelection["invocationKind"] }) {
  if (invocationKind === "builtin-command") return <ListChecks size={15} aria-hidden="true" />;
  if (invocationKind === "codex-plugin-skill") return <Sparkles size={15} aria-hidden="true" />;
  if (invocationKind === "ambient-cli-skill" || invocationKind === "ambient-cli-command") return <TerminalSquare size={15} aria-hidden="true" />;
  if (invocationKind === "workflow-playbook" || invocationKind === "callable-workflow") return <Workflow size={15} aria-hidden="true" />;
  if (invocationKind === "symphony-recipe") return <Network size={15} aria-hidden="true" />;
  return <Slash size={15} aria-hidden="true" />;
}

function slashCommandSelectedKindLabel(selection: SlashCommandSelection): string {
  if (selection.invocationKind === "codex-plugin-skill") return "Skill";
  if (selection.invocationKind === "ambient-cli-skill") return "CLI skill";
  if (selection.invocationKind === "ambient-cli-command") return "CLI command";
  if (selection.invocationKind === "workflow-playbook") return "Workflow";
  if (selection.invocationKind === "symphony-recipe") return "Symphony";
  if (selection.invocationKind === "callable-workflow") return "Callable";
  return "Command";
}
