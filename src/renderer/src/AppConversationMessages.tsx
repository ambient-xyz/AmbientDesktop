import { ChevronDown } from "lucide-react";

import { ChatFindBar, DismissibleErrorStrip, ThreadVoiceStatusBar } from "./AppChatChrome";
import { AppConversationMessageList } from "./AppConversationMessageList";
import { GoalCompletionConfetti } from "./AppGoalControls";
import { formatRuntimeActivity } from "./AppRunActivity";
import type { AppConversationMessagesProps } from "./AppConversationMessagesTypes";
import { RuntimeStatusStrips } from "./AppRuntimeStatusStrips";
import { SessionContextRecoveryStrip } from "./AppSessionRecovery";
import { WorkflowRecordingChatBanner } from "./AppWorkflowRecording";
import { SubagentThreadInspector } from "./SubagentThreadInspector";

export function AppConversationMessages(props: AppConversationMessagesProps) {
  const {
    children,
    goalCompletionCelebrationId,
    chatFindOpen,
    chatFindInputRef,
    chatFindQuery,
    chatFindCount,
    chatFindIndex,
    onChatFindQueryChange,
    onChatFindPrevious,
    onChatFindNext,
    onChatFindClose,
    activeThreadVoiceStatusVisible,
    activeThreadVoiceStatus,
    activeThreadVoiceStatusDismissKey,
    onDismissActiveThreadVoiceStatus,
    activeSubagentInspector,
    workflowRecording,
    workflowRecordingReviewRunning,
    running,
    abortArmed,
    activeThreadId,
    activeThreadGoal,
    activeRunActivityLines,
    runStatus,
    retryStats,
    chatExportBusy,
    onRetryWorkflowRecordingReview,
    onAbortRun,
    onStopWorkflowRecording,
    onExportActiveChat,
    onOpenSettingsPanel,
    onOpenSubagentParentThread,
    showScrollToBottom,
    onJumpToLatestMessage,
    errorNeedsSessionRecovery,
    error,
    contextRecoveryBusy,
    canRetryContextRecovery,
    onRecoverActiveThreadContext,
    onRecoverAndRetryLatest,
    onDuplicateActiveThreadFromTranscript,
    onDismissError,
    activeWorkspaceIsPreparedLocalTask,
    projectRootPath,
    activeWorkspacePath,
    runtimeStatusIndicators,
    activeActivity,
  } = props;

  return (
    <section className={activeSubagentInspector ? "conversation subagent-inspector-docked" : "conversation"}>
      {goalCompletionCelebrationId && <GoalCompletionConfetti key={goalCompletionCelebrationId} />}
      {chatFindOpen && (
        <ChatFindBar
          inputRef={chatFindInputRef}
          query={chatFindQuery}
          count={chatFindCount}
          activeIndex={chatFindCount > 0 ? Math.min(chatFindIndex, chatFindCount - 1) : 0}
          onQueryChange={onChatFindQueryChange}
          onPrevious={onChatFindPrevious}
          onNext={onChatFindNext}
          onClose={onChatFindClose}
        />
      )}
      {activeThreadVoiceStatusVisible && activeThreadVoiceStatus && activeThreadVoiceStatusDismissKey && (
        <ThreadVoiceStatusBar
          status={activeThreadVoiceStatus}
          onOpenVoiceSettings={onOpenSettingsPanel}
          onDismiss={() => onDismissActiveThreadVoiceStatus(activeThreadVoiceStatusDismissKey)}
        />
      )}
      <WorkflowRecordingChatBanner
        recording={workflowRecording}
        reviewRunning={workflowRecordingReviewRunning}
        running={running}
        abortArmed={abortArmed}
        activeThreadId={activeThreadId}
        activeRunActivityLines={activeRunActivityLines}
        runStatus={runStatus}
        retryStats={retryStats}
        chatExportBusy={chatExportBusy}
        onRetryReview={onRetryWorkflowRecordingReview}
        onAbortRun={onAbortRun}
        onStopRecording={onStopWorkflowRecording}
        onExportActiveChat={onExportActiveChat}
      />
      <AppConversationMessageList {...props} />

      {showScrollToBottom && (
        <div className="scroll-to-bottom-anchor">
          <button
            type="button"
            className="scroll-to-bottom-button"
            title="Jump to latest"
            aria-label="Jump to latest"
            onClick={onJumpToLatestMessage}
          >
            <ChevronDown size={22} />
          </button>
        </div>
      )}

      {activeSubagentInspector && (
        <div className="subagent-thread-inspector-dock" aria-label="Active sub-agent summary">
          <SubagentThreadInspector model={activeSubagentInspector} onOpenParentThread={onOpenSubagentParentThread} />
        </div>
      )}

      {errorNeedsSessionRecovery ? (
        <SessionContextRecoveryStrip
          message={error}
          busy={contextRecoveryBusy}
          running={running}
          canRetry={canRetryContextRecovery}
          onRecover={onRecoverActiveThreadContext}
          onRecoverAndRetry={onRecoverAndRetryLatest}
          onDuplicate={onDuplicateActiveThreadFromTranscript}
          onDismiss={onDismissError}
        />
      ) : (
        error && <DismissibleErrorStrip message={error} onDismiss={onDismissError} />
      )}
      {activeWorkspaceIsPreparedLocalTask && (
        <div className="workspace-context-strip" title={`Project root: ${projectRootPath}\nCurrent chat workspace: ${activeWorkspacePath}`}>
          <strong>Local Task workspace</strong>
          <span>
            This chat is running in a prepared workspace. Project board actions still use the owning project root, while file, terminal, and
            artifact actions use the current workspace.
          </span>
        </div>
      )}
      <RuntimeStatusStrips indicators={runtimeStatusIndicators} activeGoal={activeThreadGoal} />
      {activeActivity && <div className="activity-strip">{formatRuntimeActivity(activeActivity)}</div>}
      {children}
    </section>
  );
}
