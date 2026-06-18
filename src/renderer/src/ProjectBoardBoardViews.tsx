import { AlertCircle, ClipboardPaste, Kanban, RefreshCw } from "lucide-react";

import type { AddProjectBoardCardRunFeedbackInput, AttachProjectBoardLocalTaskMode, CopyProjectBoardSessionToThreadInput, ProjectBoardCard, ProjectBoardGitSyncStatus, ProjectBoardProofDecisionAction, ProjectBoardSplitDecisionAction, ProjectBoardSynthesisRun, ProjectSummary, RetryProjectBoardSynthesisInput } from "../../shared/projectBoardTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { OrchestrationBoard, RepairOrchestrationWorkflowAction, ResolveOrchestrationWorkflowImpactAction, UpdateOrchestrationWorkflowRawInput, UpdateOrchestrationWorkflowSettingsInput } from "../../shared/workflowTypes";
import type {
  ProjectBoardCardClaimAction,
  ProjectBoardLiveSessionActivityLine,
  ProjectBoardTabId,
} from "./projectBoardUiModel";
import {
  projectBoardBoardDecisionImpactRail,
  projectBoardBoardTabShowsDraftCallout,
  projectBoardBoardTabShowsExecutionPanels,
  projectBoardBoardTabStatusLabel,
  projectBoardCardClaimBlocksLocalTicketization,
  projectBoardColumns,
  projectBoardExecutionOverview,
  projectBoardUnattachedLocalTasks,
  projectBoardWorkflowImpactPreview,
} from "./projectBoardUiModel";
import type {
  ProjectBoardCardInspectorOptions,
  ProjectBoardCardInspectorRequest,
} from "./ProjectBoardActiveCardDetailViews";
import { ProjectBoardActiveCardDetail } from "./ProjectBoardActiveCardDetailViews";
import {
  ProjectBoardBoardDecisionImpactPanel,
  ProjectBoardExecutionOverviewPanel,
  ProjectBoardUnattachedTasks,
  ProjectBoardWorkflowImpactPanel,
} from "./ProjectBoardExecutionViews";
import { ProjectBoardColumn } from "./ProjectBoardLaneViews";
import { ProjectBoardSynthesisRunLedger } from "./ProjectBoardSynthesisViews";

export function ProjectBoardBoardTab({
  board,
  columns,
  boardStatus,
  latestSynthesisRun,
  synthesisRetryBusy,
  orchestrationBoard,
  orchestrationError,
  runActivityLinesByThread,
  threadRunStatuses,
  selectedCard,
  selectedCardId,
  onSelectCard,
  onSelectTab,
  onOpenSourcePicker,
  onJumpToBlocker,
  onJumpToInbox,
  runBusy,
  onPrepareRuns,
  onResolveWorkflowImpact,
  onRepairWorkflow,
  onUpdateWorkflowSettings,
  onUpdateWorkflowRaw,
  onStartRun,
  onCancelRun,
  onRevealWorkspace,
  onOpenRunThread,
  onCopySessionToThread,
  onResolveProofDecision,
  onResolveSplitDecision,
  onAddRunFeedback,
  onRetrySynthesis,
  synthesisDeferBusy,
  onDeferSynthesisSections,
  taskImportBusy,
  onAttachLocalTask,
  gitStatus,
  gitError,
  claimBusy,
  onClaimAction,
  inspectorRequest,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  columns: ReturnType<typeof projectBoardColumns>;
  boardStatus: NonNullable<ProjectSummary["board"]>["status"];
  latestSynthesisRun?: ProjectBoardSynthesisRun;
  synthesisRetryBusy: boolean;
  orchestrationBoard?: OrchestrationBoard;
  orchestrationError?: string;
  runActivityLinesByThread: Record<string, ProjectBoardLiveSessionActivityLine[]>;
  threadRunStatuses: Record<string, RunStatus>;
  selectedCard?: ProjectBoardCard;
  selectedCardId?: string;
  onSelectCard: (cardId: string | undefined, options?: ProjectBoardCardInspectorOptions) => void;
  onSelectTab: (tabId: ProjectBoardTabId) => void;
  onOpenSourcePicker: () => void;
  onJumpToBlocker: (cardId: string) => void;
  onJumpToInbox: (cardId: string) => void;
  runBusy?: string;
  onPrepareRuns: () => void;
  onResolveWorkflowImpact: (action: ResolveOrchestrationWorkflowImpactAction, runIds: string[]) => void;
  onRepairWorkflow: (action: RepairOrchestrationWorkflowAction) => void;
  onUpdateWorkflowSettings: (input: UpdateOrchestrationWorkflowSettingsInput) => void;
  onUpdateWorkflowRaw: (input: UpdateOrchestrationWorkflowRawInput) => void;
  onStartRun: (runId: string) => void;
  onCancelRun: (runId: string) => void;
  onRevealWorkspace: (workspacePath: string) => void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => void;
  onCopySessionToThread: (input: CopyProjectBoardSessionToThreadInput) => void;
  onResolveProofDecision: (cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) => void;
  onResolveSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => void;
  onAddRunFeedback: (input: AddProjectBoardCardRunFeedbackInput) => Promise<void> | void;
  onRetrySynthesis: (retryOfRunId?: string, mode?: RetryProjectBoardSynthesisInput["mode"]) => void;
  synthesisDeferBusy: boolean;
  onDeferSynthesisSections: (runId: string) => void;
  taskImportBusy?: string;
  onAttachLocalTask: (taskId: string, mode: AttachProjectBoardLocalTaskMode) => void;
  gitStatus?: ProjectBoardGitSyncStatus;
  gitError?: string;
  claimBusy?: string;
  onClaimAction: (card: ProjectBoardCard, action: ProjectBoardCardClaimAction) => void;
  inspectorRequest: ProjectBoardCardInspectorRequest;
}) {
  const count = columns.reduce((total, column) => total + column.cards.length, 0);
  const readyCards = columns.find((column) => column.id === "ready")?.cards ?? [];
  const readyCardCount = readyCards.length;
  const claimBlockedReadyCount = readyCards.filter(projectBoardCardClaimBlocksLocalTicketization).length;
  const tasks = orchestrationBoard?.tasks ?? [];
  const runs = orchestrationBoard?.runs ?? [];
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const unattachedTasks = projectBoardUnattachedLocalTasks(board, tasks);
  const failedSynthesisRun = latestSynthesisRun?.status === "failed" && latestSynthesisRun.stage !== "kickoff_defaults" ? latestSynthesisRun : undefined;
  const executionOverview = projectBoardExecutionOverview(board, tasks, runs, {
    runBusy,
    orchestrationError,
    workflowReadiness: orchestrationBoard?.workflowReadiness,
    gitStatus,
    gitError,
  });
  const workflowImpact = projectBoardWorkflowImpactPreview(board, tasks, runs, orchestrationBoard?.workflowReadiness);
  const decisionImpactRail = projectBoardBoardDecisionImpactRail(board);
  const statusLabel = projectBoardBoardTabStatusLabel(board, count, readyCardCount);
  const showDraftCallout = projectBoardBoardTabShowsDraftCallout(board, count);
  const showExecutionPanels = projectBoardBoardTabShowsExecutionPanels(board, count);
  return (
    <section className="project-board-tab-panel" aria-label="Project board active cards">
      <header className="project-board-panel-header">
        <div>
          <span className="project-board-kicker">Board</span>
          <h3>{count} executable card{count === 1 ? "" : "s"}</h3>
        </div>
        <div className="project-board-card-actions">
          <span className="project-board-status">{statusLabel}</span>
          {boardStatus === "active" && count > 0 && (
            <button
              type="button"
              className="secondary-button"
              disabled={runBusy === "prepare:next" || readyCardCount === 0 || claimBlockedReadyCount > 0}
              title={
                claimBlockedReadyCount > 0
                  ? `${claimBlockedReadyCount} ready Local Task card${claimBlockedReadyCount === 1 ? " is" : "s are"} claimed by another desktop or in claim conflict. Pull/apply the board or wait for the lease to clear before preparing runs.`
                  : readyCardCount > 0
                    ? "Prepare the next eligible ready Local Task run. Use Start once the run is prepared."
                    : "No Ready Local Tasks are eligible for preparation right now."
              }
              onClick={onPrepareRuns}
            >
              <ClipboardPaste size={14} className={runBusy === "prepare:next" ? "spin" : ""} />
              <span>{runBusy === "prepare:next" ? "Preparing" : "Prepare Runs"}</span>
            </button>
          )}
        </div>
      </header>
      {showDraftCallout ? (
        <div className="project-board-board-callout attention">
          <AlertCircle size={16} />
          <div>
            <strong>Finish kickoff before execution work appears here.</strong>
            <p>The Draft Inbox can hold proposed cards now, but the execution board populates only after the charter is active and ready candidates are created as Local Tasks.</p>
          </div>
        </div>
      ) : failedSynthesisRun && count === 0 ? (
        <>
          <div className="project-board-board-callout attention">
            <AlertCircle size={16} />
            <div>
              <strong>Board synthesis failed before cards were created.</strong>
              <p>{failedSynthesisRun.error || failedSynthesisRun.events.at(-1)?.summary || "Ambient/Pi did not produce a usable board synthesis result."}</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={synthesisRetryBusy}
              title="Retry live Ambient/Pi board synthesis and replace unticketized draft candidates if the retry succeeds."
              onClick={() => onRetrySynthesis(failedSynthesisRun.id)}
            >
              <RefreshCw size={14} className={synthesisRetryBusy ? "spin" : ""} />
              <span>{synthesisRetryBusy ? "Retrying" : "Retry Synthesis"}</span>
            </button>
          </div>
          <ProjectBoardSynthesisRunLedger
            run={failedSynthesisRun}
            retryBusy={synthesisRetryBusy}
            deferBusy={synthesisDeferBusy}
            onRetryFailedSections={(runId) => onRetrySynthesis(runId, "failed_sections")}
            onRetryStalledRun={(runId) => onRetrySynthesis(runId, "stalled_run")}
            onContinuePlannerBatch={(runId) => onRetrySynthesis(runId, "continue_batch")}
            onResumePausedRun={(runId) => onRetrySynthesis(runId, "paused_run")}
            onStartFreshFromPausedRun={(runId) => onRetrySynthesis(runId, "start_fresh")}
            onDeferFailedSections={onDeferSynthesisSections}
          />
        </>
      ) : count === 0 ? (
        <div className="project-board-board-callout">
          <Kanban size={16} />
          <div>
            <strong>No executable cards yet.</strong>
            <p>Approve ready candidates in Draft Inbox, then use Create Ready Tasks there. Ticketized cards appear here, where you can prepare and start Local Task runs.</p>
          </div>
        </div>
      ) : null}
      {showExecutionPanels && (
        <>
          <ProjectBoardExecutionOverviewPanel
            overview={executionOverview}
            onSelectCard={onSelectCard}
            onSelectTab={onSelectTab}
            onOpenSourcePicker={onOpenSourcePicker}
            onPrepareRuns={onPrepareRuns}
            onStartRun={onStartRun}
            runBusy={runBusy}
          />
          <ProjectBoardWorkflowImpactPanel
            preview={workflowImpact}
            onPrepareRuns={onPrepareRuns}
            onResolveWorkflowImpact={onResolveWorkflowImpact}
            onRepairWorkflow={onRepairWorkflow}
            onUpdateWorkflowSettings={onUpdateWorkflowSettings}
            onUpdateWorkflowRaw={onUpdateWorkflowRaw}
            runBusy={runBusy}
          />
          <ProjectBoardBoardDecisionImpactPanel rail={decisionImpactRail} onSelectCard={onSelectCard} />
        </>
      )}
      <div className="project-board-board-layout">
        <div className="project-board-grid" data-board-status={boardStatus}>
          {columns.map((column) => (
            <ProjectBoardColumn
              key={column.id}
              title={column.title}
              tooltip={column.tooltip}
              cards={column.cards}
              allCards={board.cards}
              selectedCardId={selectedCardId}
              onSelectCard={onSelectCard}
              taskById={tasksById}
              tasks={tasks}
              runs={runs}
              executionArtifacts={board.executionArtifacts}
            />
          ))}
        </div>
        <ProjectBoardUnattachedTasks tasks={unattachedTasks} busy={taskImportBusy} onAttachLocalTask={onAttachLocalTask} />
        <ProjectBoardActiveCardDetail
          board={board}
          card={selectedCard}
          orchestrationBoard={orchestrationBoard}
          orchestrationError={orchestrationError}
          runActivityLinesByThread={runActivityLinesByThread}
          threadRunStatuses={threadRunStatuses}
          onClose={() => onSelectCard(undefined)}
          runBusy={runBusy}
          onPrepareRuns={onPrepareRuns}
          onStartRun={onStartRun}
          onCancelRun={onCancelRun}
          onRevealWorkspace={onRevealWorkspace}
          onOpenRunThread={onOpenRunThread}
          onCopySessionToThread={onCopySessionToThread}
          onResolveProofDecision={onResolveProofDecision}
          onResolveSplitDecision={onResolveSplitDecision}
          onAddRunFeedback={onAddRunFeedback}
          gitStatus={gitStatus}
          claimBusy={claimBusy}
          onClaimAction={onClaimAction}
          inspectorRequest={inspectorRequest}
          onJumpToBlocker={onJumpToBlocker}
          onJumpToInbox={onJumpToInbox}
        />
      </div>
    </section>
  );
}
