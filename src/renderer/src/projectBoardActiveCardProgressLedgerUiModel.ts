import type { ProjectBoardCard, ProjectBoardExecutionArtifact } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { projectBoardDependencySatisfied, projectBoardTaskDependencySatisfied } from "./projectBoardDependencyUiModel";
import { projectBoardCanonicalCardProjection } from "./projectBoardActiveCardProjectionUiModel";
import { projectBoardTaskPauseDetail, projectBoardTaskPauseLedgerState } from "./projectBoardActiveCardTaskPauseUiModel";
import {
  projectBoardDurationLabel,
  projectBoardProofArray,
  projectBoardProofFileLabel,
  projectBoardProofObject,
  projectBoardProofText,
  projectBoardReadableState,
  projectBoardRunHasReviewableEvidence,
  projectBoardRunIsActive,
  projectBoardRunNeedsIntervention,
  projectBoardTaskActionArray,
  projectBoardTaskActionDiagnosticsDetail,
  projectBoardTaskActionEvidenceFromProof,
  projectBoardTaskActionObjectsFromProof,
  projectBoardUniqueProofItems,
  truncateProjectBoardLedgerText,
} from "./projectBoardProofEvidenceUiModel";

function projectBoardJoinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export type ProjectBoardProgressLedgerState = "done" | "active" | "review" | "blocked" | "missing";

export interface ProjectBoardProgressLedgerEntry {
  id:
    | "completed_work"
    | "remaining_work"
    | "files_touched"
    | "verification"
    | "proof_collected"
    | "task_actions"
    | "blockers_questions"
    | "next_action";
  label: string;
  state: ProjectBoardProgressLedgerState;
  detail: string;
}

function projectBoardRemainingWorkDetail(
  card: ProjectBoardCard,
  proofExpectationCount: number,
  blockerLabels: string[],
  latestRun?: OrchestrationRun,
  task?: OrchestrationTask,
): string {
  if (card.status === "done") return "Card is marked Done; no remaining work is recorded on the board.";
  if (card.status === "review") return "Review the latest proof packet against acceptance criteria before closing the card.";
  const taskPause = projectBoardTaskPauseDetail(task?.state);
  if (taskPause) return taskPause;
  if (blockerLabels.length > 0) return `Clear ${projectBoardJoinList(blockerLabels.slice(0, 3))} before continuing.`;
  if (latestRun && projectBoardRunNeedsIntervention(latestRun))
    return `Inspect attempt ${latestRun.attemptNumber + 1} and resolve ${projectBoardReadableState(latestRun.status)} before retrying.`;

  const criteria = card.acceptanceCriteria.length;
  if (card.status === "in_progress" || (latestRun && projectBoardRunIsActive(latestRun))) {
    return `Continue until ${criteria || "all"} acceptance ${criteria === 1 ? "criterion is" : "criteria are"} satisfied and ${proofExpectationCount || "runtime"} proof is recorded.`;
  }
  if (criteria > 0 || proofExpectationCount > 0) {
    return `${criteria} acceptance ${criteria === 1 ? "criterion" : "criteria"} and ${proofExpectationCount} proof ${proofExpectationCount === 1 ? "expectation" : "expectations"} are waiting for execution.`;
  }
  return "Define acceptance criteria and proof expectations before relying on low-intervention execution.";
}

function projectBoardVerificationDetail(
  proofExpectationCount: number,
  afterRunHook: Record<string, unknown> | undefined,
  hasRunEvidence: boolean,
  taskActionVerificationCount = 0,
): string {
  if (afterRunHook) {
    const ok = afterRunHook.ok === false ? "failed" : "passed";
    const duration = typeof afterRunHook.durationMs === "number" ? ` in ${afterRunHook.durationMs}ms` : "";
    return `afterRun hook ${ok}${duration}.`;
  }
  if (taskActionVerificationCount > 0)
    return `${taskActionVerificationCount} verification ${taskActionVerificationCount === 1 ? "item was" : "items were"} reported through task actions.`;
  if (hasRunEvidence) return "Run evidence was recorded; no afterRun hook result was attached.";
  if (proofExpectationCount > 0)
    return `${proofExpectationCount} proof ${proofExpectationCount === 1 ? "expectation is" : "expectations are"} defined; command output is not recorded yet.`;
  return "No command, browser, or manual verification expectation is recorded yet.";
}

function projectBoardProofCollectedDetail(
  proofKind: string | undefined,
  messageCount: number | undefined,
  lastAssistantStatus: string | undefined,
  changedFileCount: number,
  gitStatusCount: number,
  taskActionCount: number,
  diffTruncated: boolean,
  focusLoop: Record<string, unknown> | undefined,
  elapsedMs?: number,
  outputCharCount?: number,
  toolMessageCount?: number,
): string {
  const parts: string[] = [];
  if (proofKind) parts.push(proofKind);
  if (elapsedMs !== undefined) parts.push(`${projectBoardDurationLabel(elapsedMs)} elapsed`);
  if (outputCharCount !== undefined) parts.push(`${outputCharCount.toLocaleString()} output chars`);
  if (messageCount !== undefined) parts.push(`${messageCount} ${messageCount === 1 ? "message" : "messages"}`);
  if (toolMessageCount !== undefined) parts.push(`${toolMessageCount} tool ${toolMessageCount === 1 ? "card" : "cards"}`);
  if (lastAssistantStatus) parts.push(`assistant ${projectBoardReadableState(lastAssistantStatus)}`);
  if (changedFileCount > 0) parts.push(`${changedFileCount} changed ${changedFileCount === 1 ? "file" : "files"}`);
  if (gitStatusCount > 0) parts.push(`${gitStatusCount} git status ${gitStatusCount === 1 ? "entry" : "entries"}`);
  if (taskActionCount > 0) parts.push(`${taskActionCount} task ${taskActionCount === 1 ? "action" : "actions"}`);
  if (diffTruncated) parts.push("diff truncated");
  if (typeof focusLoop?.passNumber === "number") {
    parts.push(`focus pass ${focusLoop.passNumber}${typeof focusLoop.reason === "string" ? ` ${focusLoop.reason}` : ""}`);
  }
  return parts.length > 0 ? `Proof packet: ${parts.join(", ")}.` : "No proof packet recorded yet.";
}

function projectBoardBlockerDetail(blockerLabels: string[], latestRun?: OrchestrationRun, task?: OrchestrationTask): string {
  if (blockerLabels.length > 0) return `Waiting on ${projectBoardJoinList(blockerLabels.slice(0, 4))}.`;
  const taskPause = projectBoardTaskPauseDetail(task?.state);
  if (taskPause) return taskPause;
  if (latestRun?.error) return `${projectBoardReadableState(latestRun.status)}: ${truncateProjectBoardLedgerText(latestRun.error, 180)}`;
  if (latestRun && projectBoardRunNeedsIntervention(latestRun))
    return `Attempt ${latestRun.attemptNumber + 1} is ${projectBoardReadableState(latestRun.status)} and needs inspection.`;
  return "No blockers or review questions are recorded.";
}

function projectBoardNextActionState(
  card: ProjectBoardCard,
  task: OrchestrationTask | undefined,
  latestRun: OrchestrationRun | undefined,
  blockerLabels: string[],
  proofExpectationCount: number,
): ProjectBoardProgressLedgerState {
  if (projectBoardCanonicalCardProjection(card, { task, latestRun }).terminalDone) return "done";
  if (latestRun?.status === "completed" || card.status === "review") return "review";
  if (blockerLabels.length > 0 || (latestRun && projectBoardRunNeedsIntervention(latestRun))) return "blocked";
  const taskPause = projectBoardTaskPauseLedgerState(task?.state);
  if (taskPause) return taskPause;
  if (latestRun && projectBoardRunIsActive(latestRun)) return "active";
  if (card.status === "done") return "done";
  if (!task || proofExpectationCount === 0) return "missing";
  return "active";
}

function projectBoardNextActionDetail(
  card: ProjectBoardCard,
  task: OrchestrationTask | undefined,
  latestRun: OrchestrationRun | undefined,
  blockerLabels: string[],
  proofExpectationCount: number,
): string {
  if (blockerLabels.length > 0) return `Resolve ${projectBoardJoinList(blockerLabels.slice(0, 3))} before dispatch.`;
  if (latestRun?.status === "completed") return "Review the proof packet against the card's acceptance criteria and proof expectations.";
  if (task && latestRun && projectBoardRunNeedsIntervention(latestRun) && projectBoardRunHasReviewableEvidence(latestRun)) {
    return "Inspect the stopped run evidence; if it satisfies the card, accept manually, otherwise retry or mark it blocked.";
  }
  const taskPause = projectBoardTaskPauseDetail(task?.state);
  if (taskPause) return taskPause;
  if (latestRun && projectBoardRunIsActive(latestRun))
    return "Let the current Pi attempt continue until it records proof or a terminal blocker.";
  if (card.status === "in_progress" || task?.state === "in_progress")
    return "Let the linked Local Task continue until it records proof or a terminal blocker.";
  if (latestRun?.status === "prepared" || latestRun?.status === "retry_queued")
    return "Start the prepared run when the card is still the next eligible task.";
  if (latestRun && projectBoardRunNeedsIntervention(latestRun)) return "Retry only after inspecting the run error and proof packet.";
  if (card.status === "done") return "No next action is required.";
  if (!task) return "Approve the draft into a Local Task before running.";
  if (proofExpectationCount === 0) return "Add proof expectations before relying on low-intervention execution.";
  return "Prepare or dispatch the next eligible run for this card.";
}

export function projectBoardProgressLedgerForCard(input: {
  card: ProjectBoardCard;
  task?: OrchestrationTask;
  latestRun?: OrchestrationRun;
  blockedByCards: ProjectBoardCard[];
  blockedByTasks: OrchestrationTask[];
  unresolvedBlockers: string[];
  proofExpectationCount: number;
  latestArtifactByCardId?: Map<string, ProjectBoardExecutionArtifact>;
}): ProjectBoardProgressLedgerEntry[] {
  const proof = input.latestRun?.proofOfWork;
  const proofKind = projectBoardProofText(proof?.kind);
  const isPreparationProof = proofKind === "preparation" || proofKind === "scheduled-preparation";
  const isRunningProgressProof = proofKind === "agent-run-progress";
  const progress = projectBoardProofObject(proof?.progress);
  const taskActions = projectBoardTaskActionEvidenceFromProof(proof);
  const taskActionRecords = projectBoardTaskActionObjectsFromProof(proof);
  const taskActionDiagnosticsDetail = projectBoardTaskActionDiagnosticsDetail(proof);
  const changedFiles = projectBoardUniqueProofItems(
    [...projectBoardProofArray(proof?.changedFiles), ...projectBoardTaskActionArray(taskActionRecords, "changedFiles")],
    projectBoardProofFileLabel,
  );
  const gitStatus = projectBoardProofArray(proof?.gitStatus).map((item) => String(item));
  const lastAssistantText = projectBoardProofText(proof?.lastAssistantText);
  const lastAssistantStatus = projectBoardProofText(proof?.lastAssistantStatus);
  const messageCount = typeof proof?.messageCount === "number" ? proof.messageCount : undefined;
  const elapsedMs =
    typeof proof?.elapsedMs === "number" ? proof.elapsedMs : typeof progress?.elapsedMs === "number" ? progress.elapsedMs : undefined;
  const outputCharCount =
    typeof proof?.outputCharCount === "number"
      ? proof.outputCharCount
      : typeof progress?.outputCharCount === "number"
        ? progress.outputCharCount
        : undefined;
  const toolMessageCount =
    typeof proof?.toolMessageCount === "number"
      ? proof.toolMessageCount
      : typeof progress?.toolMessageCount === "number"
        ? progress.toolMessageCount
        : undefined;
  const afterRunHook = projectBoardProofObject(proof?.afterRunHook);
  const focusLoop = projectBoardProofObject(proof?.focusLoop);
  const afterRunHookOk = typeof afterRunHook?.ok === "boolean" ? afterRunHook.ok : undefined;
  const taskActionVerificationCount =
    projectBoardTaskActionArray(taskActionRecords, "commands").length +
    projectBoardTaskActionArray(taskActionRecords, "screenshots").length +
    projectBoardTaskActionArray(taskActionRecords, "visualChecks").length +
    projectBoardTaskActionArray(taskActionRecords, "browserTraces").length +
    projectBoardTaskActionArray(taskActionRecords, "manualChecks").length;
  const latestTaskAction = [...taskActions].reverse().find((action) => action.action !== "task_show");
  const latestTaskActionIsBlocked = latestTaskAction?.tone === "danger";
  const hasFinalTaskAction = taskActions.some(
    (action) => action.action === "task_complete" || action.action === "task_report_proof" || action.action === "task_report_handoff",
  );
  const hasRunEvidence = Boolean(
    proof &&
    !isPreparationProof &&
    !isRunningProgressProof &&
    (lastAssistantText || messageCount !== undefined || changedFiles.length > 0 || gitStatus.length > 0 || taskActions.length > 0),
  );
  const hasRunningProgressEvidence = Boolean(
    proof &&
    isRunningProgressProof &&
    (messageCount !== undefined || outputCharCount !== undefined || toolMessageCount !== undefined || taskActions.length > 0),
  );
  const projection = projectBoardCanonicalCardProjection(input.card, { task: input.task, latestRun: input.latestRun });
  const taskPauseState = projectBoardTaskPauseLedgerState(input.task?.state);
  const blockerLabels = projection.suppressBlockers
    ? []
    : [
        ...input.blockedByCards
          .filter((card) => !projectBoardDependencySatisfied(card, input.latestArtifactByCardId))
          .map((card) => card.title),
        ...input.blockedByTasks.filter((task) => !projectBoardTaskDependencySatisfied(task)).map((task) => task.identifier),
        ...input.unresolvedBlockers.map((blocker) => `unresolved ${blocker}`),
      ];
  const latestRunBlocked = Boolean(
    !projection.suppressStaleRunState && input.latestRun && projectBoardRunNeedsIntervention(input.latestRun),
  );
  const active = Boolean(
    !taskPauseState &&
    ((input.latestRun && projectBoardRunIsActive(input.latestRun)) ||
      input.task?.state === "in_progress" ||
      input.card.status === "in_progress"),
  );
  const completed = projection.terminalDone || input.latestRun?.status === "completed";

  return [
    {
      id: "completed_work",
      label: "Completed work",
      state:
        completed || (!isRunningProgressProof && lastAssistantText) || latestTaskAction?.action === "task_complete"
          ? "done"
          : latestTaskActionIsBlocked
            ? "blocked"
            : (taskPauseState ?? (active || hasRunningProgressEvidence ? "active" : latestRunBlocked ? "blocked" : "missing")),
      detail: latestTaskAction
        ? `${latestTaskAction.label}: ${truncateProjectBoardLedgerText(latestTaskAction.summary, 180)}`
        : lastAssistantText
          ? truncateProjectBoardLedgerText(lastAssistantText, 220)
          : input.latestRun
            ? `Attempt ${input.latestRun.attemptNumber + 1} is ${projectBoardReadableState(input.latestRun.status)}.`
            : input.task
              ? `Linked Local Task ${input.task.identifier} is ${projectBoardReadableState(input.task.state)}.`
              : "No Local Task run has started for this card yet.",
    },
    {
      id: "remaining_work",
      label: "Remaining work",
      state: completed
        ? "done"
        : input.card.status === "review"
          ? "review"
          : (taskPauseState ?? (blockerLabels.length > 0 || latestRunBlocked ? "blocked" : active ? "active" : "missing")),
      detail: projection.terminalDone
        ? projection.summary
        : projectBoardRemainingWorkDetail(input.card, input.proofExpectationCount, blockerLabels, input.latestRun, input.task),
    },
    {
      id: "files_touched",
      label: "Files touched",
      state: changedFiles.length > 0 || gitStatus.length > 0 ? "done" : active ? "active" : "missing",
      detail:
        changedFiles.length > 0
          ? changedFiles.slice(0, 6).map(projectBoardProofFileLabel).join(", ")
          : gitStatus.length > 0
            ? gitStatus.slice(0, 6).join("; ")
            : "No changed files recorded yet.",
    },
    {
      id: "verification",
      label: "Verification",
      state:
        afterRunHookOk === false
          ? "blocked"
          : afterRunHook || taskActionVerificationCount > 0 || hasRunEvidence || hasFinalTaskAction
            ? "done"
            : active || hasRunningProgressEvidence
              ? "active"
              : input.proofExpectationCount > 0
                ? "review"
                : "missing",
      detail: projectBoardVerificationDetail(
        input.proofExpectationCount,
        afterRunHook,
        hasRunEvidence || hasFinalTaskAction,
        taskActionVerificationCount,
      ),
    },
    {
      id: "proof_collected",
      label: "Proof collected",
      state: hasRunEvidence ? "done" : hasRunningProgressEvidence ? "active" : proof ? "review" : "missing",
      detail: projectBoardProofCollectedDetail(
        proofKind,
        messageCount,
        lastAssistantStatus,
        changedFiles.length,
        gitStatus.length,
        taskActions.length,
        Boolean(proof?.diffTruncated),
        focusLoop,
        elapsedMs,
        outputCharCount,
        toolMessageCount,
      ),
    },
    {
      id: "task_actions",
      label: "Task actions",
      state: taskActions.some((action) => action.tone === "danger")
        ? "blocked"
        : taskActions.length > 0
          ? isRunningProgressProof && !hasFinalTaskAction
            ? "active"
            : "done"
          : active
            ? "active"
            : "missing",
      detail:
        taskActions.length > 0
          ? [
              taskActionDiagnosticsDetail,
              ...taskActions.slice(-4).map((action) => `${action.label}: ${truncateProjectBoardLedgerText(action.summary, 120)}`),
            ]
              .filter(Boolean)
              .join(" | ")
          : "No structured task actions reported by Pi yet.",
    },
    {
      id: "blockers_questions",
      label: "Blockers / questions",
      state:
        blockerLabels.length > 0 || latestRunBlocked || taskPauseState === "blocked"
          ? "blocked"
          : taskPauseState === "review"
            ? "review"
            : "done",
      detail: projection.terminalDone
        ? "No active blockers remain after the PM done decision."
        : projectBoardBlockerDetail(blockerLabels, input.latestRun, input.task),
    },
    {
      id: "next_action",
      label: "Next action",
      state: projectBoardNextActionState(input.card, input.task, input.latestRun, blockerLabels, input.proofExpectationCount),
      detail: projection.terminalDone
        ? "No next action is required; historical run issues are audit-only."
        : projectBoardNextActionDetail(input.card, input.task, input.latestRun, blockerLabels, input.proofExpectationCount),
    },
  ];
}
