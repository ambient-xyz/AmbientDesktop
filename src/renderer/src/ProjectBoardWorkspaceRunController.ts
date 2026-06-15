import { useEffect, useRef, useState } from "react";

import type {
  AddProjectBoardCardRunFeedbackInput,
  AttachProjectBoardLocalTaskMode,
  CopyProjectBoardSessionToThreadInput,
  OrchestrationBoard,
  OrchestrationPrepareResult,
  ProjectBoardProofDecisionAction,
  ProjectBoardSplitDecisionAction,
  ProjectBoardSummary,
  RepairOrchestrationWorkflowAction,
  RerunProjectBoardProofInput,
  ResolveOrchestrationWorkflowImpactAction,
  ResolveProjectBoardDeliverableIntegrationInput,
  SuggestProjectBoardProofInput,
  UpdateOrchestrationWorkflowRawInput,
  UpdateOrchestrationWorkflowSettingsInput,
} from "../../shared/types";

export type ProjectBoardWorkspaceRunControllerInput = {
  board?: ProjectBoardSummary;
  orchestrationRevision: number;
  onAddRunFeedback: (input: AddProjectBoardCardRunFeedbackInput) => Promise<void> | void;
  onAttachLocalTask: (taskId: string, mode: AttachProjectBoardLocalTaskMode) => Promise<void>;
  onCopySessionToThread: (input: CopyProjectBoardSessionToThreadInput) => Promise<void> | void;
  onCreateReadyTasks: (boardId: string) => Promise<void> | void;
  onOpenRunThread: (threadId: string, workspacePath?: string) => Promise<void>;
  onRecomputeProofCoverage: (boardId: string) => Promise<void> | void;
  onRerunProof: (input: RerunProjectBoardProofInput) => Promise<void> | void;
  onResolveDeliverableIntegration: (input: ResolveProjectBoardDeliverableIntegrationInput) => Promise<void> | void;
  onResolveProofDecision: (cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) => Promise<void> | void;
  onResolveSplitDecision: (cardId: string, action: ProjectBoardSplitDecisionAction) => Promise<void> | void;
  onSuggestProof: (input: SuggestProjectBoardProofInput) => Promise<void> | void;
};

export function projectBoardTaskFingerprint(board?: Pick<ProjectBoardSummary, "cards">): string {
  return board?.cards.map((card) => card.orchestrationTaskId).filter(Boolean).sort().join("|") ?? "";
}

export function projectBoardPrepareSkipReasonLabel(reason: string): string {
  switch (reason) {
    case "global-concurrency":
    case "state-concurrency":
      return "not prepared: the agent slot is busy with a running task. It will start automatically when the slot frees.";
    case "blocked":
      return "not prepared: blocked by an unfinished dependency.";
    case "already-running":
      return "already has a running attempt.";
    case "already-claimed":
      return "claimed by another desktop.";
    case "retry-queued":
      return "already queued for retry.";
    default:
      return `not prepared (${reason}). Check dependencies, state, and auto-dispatch settings.`;
  }
}

export function projectBoardPrepareSkippedMessage(prepared: Pick<OrchestrationPrepareResult, "prepared" | "skipped">): string | undefined {
  if (prepared.prepared.length > 0 || prepared.skipped.length === 0) return undefined;
  return prepared.skipped
    .slice(0, 3)
    .map((skip) => `${skip.identifier}: ${projectBoardPrepareSkipReasonLabel(skip.reason)}`)
    .join(" | ");
}

export function useProjectBoardWorkspaceRunController({
  board,
  orchestrationRevision,
  onAddRunFeedback,
  onAttachLocalTask,
  onCopySessionToThread,
  onCreateReadyTasks,
  onOpenRunThread,
  onRecomputeProofCoverage,
  onRerunProof,
  onResolveDeliverableIntegration,
  onResolveProofDecision,
  onResolveSplitDecision,
  onSuggestProof,
}: ProjectBoardWorkspaceRunControllerInput) {
  const [projectBoardOrchestration, setProjectBoardOrchestration] = useState<OrchestrationBoard | undefined>();
  const [projectBoardOrchestrationError, setProjectBoardOrchestrationError] = useState<string | undefined>();
  const [projectBoardRunBusy, setProjectBoardRunBusy] = useState<string | undefined>();
  const [projectBoardDeliverableBusy, setProjectBoardDeliverableBusy] = useState<string | undefined>();
  const [projectBoardTaskImportBusy, setProjectBoardTaskImportBusy] = useState<string | undefined>();
  const [projectBoardCreateReadyTasksBusy, setProjectBoardCreateReadyTasksBusy] = useState(false);
  const orchestrationWriteTicketRef = useRef(0);
  const projectBoardRunActionsInFlight = useRef<Set<string>>(new Set());

  const boardTaskFingerprint = projectBoardTaskFingerprint(board);

  function applyProjectBoardOrchestration(next: OrchestrationBoard | undefined) {
    orchestrationWriteTicketRef.current += 1;
    setProjectBoardOrchestration(next);
  }

  function beginProjectBoardRunAction(key: string): boolean {
    if (projectBoardRunActionsInFlight.current.has(key)) return false;
    projectBoardRunActionsInFlight.current.add(key);
    setProjectBoardRunBusy(key);
    return true;
  }

  function endProjectBoardRunAction(key: string) {
    projectBoardRunActionsInFlight.current.delete(key);
    setProjectBoardRunBusy((current) => (current === key ? undefined : current));
  }

  useEffect(() => {
    if (!board) {
      setProjectBoardOrchestration(undefined);
      setProjectBoardOrchestrationError(undefined);
      return;
    }
    let disposed = false;
    setProjectBoardOrchestrationError(undefined);
    const ticket = orchestrationWriteTicketRef.current;
    void window.ambientDesktop
      .listOrchestrationBoard()
      .then((next) => {
        if (!disposed && orchestrationWriteTicketRef.current === ticket) applyProjectBoardOrchestration(next);
      })
      .catch((error) => {
        if (!disposed) setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      disposed = true;
    };
  }, [board?.id, board?.updatedAt, boardTaskFingerprint, orchestrationRevision]);

  async function startProjectBoardRun(runId: string) {
    if (!beginProjectBoardRunAction(`start:${runId}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      applyProjectBoardOrchestration(await window.ambientDesktop.startOrchestrationRun({ runId }));
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`start:${runId}`);
    }
  }

  async function cancelProjectBoardRun(runId: string) {
    if (!beginProjectBoardRunAction(`cancel:${runId}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      applyProjectBoardOrchestration(await window.ambientDesktop.cancelOrchestrationRun({ runId }));
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`cancel:${runId}`);
    }
  }

  async function revealProjectBoardWorkspace(workspacePath: string) {
    if (!beginProjectBoardRunAction(`reveal:${workspacePath}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      await window.ambientDesktop.revealOrchestrationWorkspace({ workspacePath });
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`reveal:${workspacePath}`);
    }
  }

  async function openProjectBoardRunThread(threadId: string, _workspacePath?: string) {
    if (!beginProjectBoardRunAction(`thread:${threadId}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      await onOpenRunThread(threadId);
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`thread:${threadId}`);
    }
  }

  async function copyProjectBoardRunSession(input: CopyProjectBoardSessionToThreadInput) {
    if (!beginProjectBoardRunAction(`copy-session:${input.runId}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      await onCopySessionToThread(input);
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`copy-session:${input.runId}`);
    }
  }

  async function attachProjectBoardTask(taskId: string, mode: AttachProjectBoardLocalTaskMode) {
    setProjectBoardTaskImportBusy(`${mode}:${taskId}`);
    setProjectBoardOrchestrationError(undefined);
    try {
      await onAttachLocalTask(taskId, mode);
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBoardTaskImportBusy(undefined);
    }
  }

  async function prepareProjectBoardRuns() {
    if (!beginProjectBoardRunAction("prepare:next")) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      const prepared = await window.ambientDesktop.prepareNextOrchestrationTasks();
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
      const skippedMessage = projectBoardPrepareSkippedMessage(prepared);
      if (skippedMessage) setProjectBoardOrchestrationError(skippedMessage);
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction("prepare:next");
    }
  }

  async function resolveProjectBoardWorkflowImpact(action: ResolveOrchestrationWorkflowImpactAction, runIds: string[]) {
    if (!beginProjectBoardRunAction(`workflow-impact:${action}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      const result = await window.ambientDesktop.resolveOrchestrationWorkflowImpact({ action, runIds });
      setProjectBoardOrchestration(result.board);
      if (action === "prepare_again" && result.prepared.prepared.length === 0) {
        const skipped = result.prepared.skipped.length + result.skippedRuns.length;
        if (skipped > 0) {
          setProjectBoardOrchestrationError(
            "Workflow impact was resolved, but no eligible Local Tasks were prepared. Check dependencies, active runs, and workflow readiness.",
          );
        }
      }
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`workflow-impact:${action}`);
    }
  }

  async function repairProjectBoardWorkflow(action: RepairOrchestrationWorkflowAction) {
    if (!beginProjectBoardRunAction(`workflow-repair:${action}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      const result = await window.ambientDesktop.repairOrchestrationWorkflow({ action });
      setProjectBoardOrchestration(result.board);
      if (result.status !== "ready") {
        setProjectBoardOrchestrationError(result.message ?? "WORKFLOW.md still needs repair before Local Tasks can prepare.");
      }
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`workflow-repair:${action}`);
    }
  }

  async function updateProjectBoardWorkflowSettings(input: UpdateOrchestrationWorkflowSettingsInput) {
    if (!beginProjectBoardRunAction("workflow-settings:update")) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      const result = await window.ambientDesktop.updateOrchestrationWorkflowSettings(input);
      setProjectBoardOrchestration(result.board);
      if (result.status !== "ready") {
        setProjectBoardOrchestrationError(result.message ?? "WORKFLOW.md settings were written, but the workflow still needs repair.");
      }
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction("workflow-settings:update");
    }
  }

  async function updateProjectBoardWorkflowRaw(input: UpdateOrchestrationWorkflowRawInput) {
    if (!beginProjectBoardRunAction("workflow-raw:update")) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      const result = await window.ambientDesktop.updateOrchestrationWorkflowRaw(input);
      setProjectBoardOrchestration(result.board);
      if (result.status !== "ready") {
        setProjectBoardOrchestrationError(result.message ?? "WORKFLOW.md raw edit was not saved because validation failed.");
      }
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction("workflow-raw:update");
    }
  }

  async function createProjectBoardReadyTasks(boardId: string) {
    setProjectBoardCreateReadyTasksBusy(true);
    setProjectBoardOrchestrationError(undefined);
    try {
      await onCreateReadyTasks(boardId);
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBoardCreateReadyTasksBusy(false);
    }
  }

  async function resolveProjectBoardProofDecision(cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) {
    if (!beginProjectBoardRunAction(`proof:${cardId}:${action}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      await onResolveProofDecision(cardId, action, reason);
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`proof:${cardId}:${action}`);
    }
  }

  async function rerunProjectBoardProof(input: RerunProjectBoardProofInput) {
    if (!beginProjectBoardRunAction(`proof:${input.cardId}:rerun`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      await onRerunProof(input);
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`proof:${input.cardId}:rerun`);
    }
  }

  async function resolveProjectBoardDeliverableIntegration(input: ResolveProjectBoardDeliverableIntegrationInput) {
    setProjectBoardDeliverableBusy(`${input.runId}:${input.action}`);
    setProjectBoardOrchestrationError(undefined);
    try {
      await onResolveDeliverableIntegration(input);
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectBoardDeliverableBusy(undefined);
    }
  }

  async function recomputeProjectBoardProofCoverage(boardId: string) {
    if (!beginProjectBoardRunAction(`proof-coverage:${boardId}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      await onRecomputeProofCoverage(boardId);
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`proof-coverage:${boardId}`);
    }
  }

  async function suggestProjectBoardProof(boardId: string, cardIds?: string[]) {
    if (!beginProjectBoardRunAction(`proof-suggest:${boardId}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      await onSuggestProof({ boardId, ...(cardIds?.length ? { cardIds } : {}) });
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`proof-suggest:${boardId}`);
    }
  }

  async function resolveProjectBoardSplitDecision(cardId: string, action: ProjectBoardSplitDecisionAction) {
    if (!beginProjectBoardRunAction(`split:${cardId}:${action}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      await onResolveSplitDecision(cardId, action);
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`split:${cardId}:${action}`);
    }
  }

  async function addProjectBoardRunFeedback(input: AddProjectBoardCardRunFeedbackInput) {
    if (!beginProjectBoardRunAction(`feedback:${input.cardId}`)) return;
    setProjectBoardOrchestrationError(undefined);
    try {
      await onAddRunFeedback(input);
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
    } catch (error) {
      setProjectBoardOrchestrationError(error instanceof Error ? error.message : String(error));
    } finally {
      endProjectBoardRunAction(`feedback:${input.cardId}`);
    }
  }

  return {
    addProjectBoardRunFeedback,
    applyProjectBoardOrchestration,
    attachProjectBoardTask,
    cancelProjectBoardRun,
    copyProjectBoardRunSession,
    createProjectBoardReadyTasks,
    openProjectBoardRunThread,
    prepareProjectBoardRuns,
    projectBoardCreateReadyTasksBusy,
    projectBoardDeliverableBusy,
    projectBoardOrchestration,
    projectBoardOrchestrationError,
    projectBoardRunBusy,
    projectBoardTaskImportBusy,
    recomputeProjectBoardProofCoverage,
    repairProjectBoardWorkflow,
    resolveProjectBoardDeliverableIntegration,
    resolveProjectBoardProofDecision,
    resolveProjectBoardSplitDecision,
    resolveProjectBoardWorkflowImpact,
    revealProjectBoardWorkspace,
    rerunProjectBoardProof,
    setProjectBoardOrchestrationError,
    startProjectBoardRun,
    suggestProjectBoardProof,
    updateProjectBoardWorkflowRaw,
    updateProjectBoardWorkflowSettings,
  };
}
