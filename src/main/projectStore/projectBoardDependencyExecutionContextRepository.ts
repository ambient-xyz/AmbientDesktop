import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  normalizeTaskReferences,
  normalizeTaskState,
  projectBoardCardIsTerminalAuditCandidate,
  projectBoardCardMatchesRef,
  projectBoardCardTaskDescription as buildProjectBoardCardTaskDescription,
  projectBoardPromptList,
  projectBoardPromptSummary,
  projectBoardRuntimeBudgetTrustworthyTaskActions,
  stringsFromProjectBoardUnknownArray,
  type ProjectBoardCardDependencyExecutionContext,
  type ProjectBoardCardDependencyExecutionEntry,
} from "./projectBoardMappers";
import {
  projectBoardTaskToolChangedFiles,
  projectBoardTaskToolCommands,
  projectBoardTaskToolCompleted,
  projectBoardTaskToolManualChecks,
  projectBoardTaskToolProofSummary,
} from "./projectStoreProjectBoardFacade";

export interface ProjectStoreProjectBoardDependencyExecutionContextRepositoryDeps {
  listProjectBoardCards(boardId: string): ProjectBoardCard[];
  listOrchestrationTasks(): OrchestrationTask[];
  latestDependencyArtifactRunForTask(taskId: string): OrchestrationRun | undefined;
  latestOrchestrationRunForTask(taskId: string): OrchestrationRun | undefined;
}

export class ProjectStoreProjectBoardDependencyExecutionContextRepository {
  constructor(private readonly deps: ProjectStoreProjectBoardDependencyExecutionContextRepositoryDeps) {}

  projectBoardCardTaskDescription(input: { card: ProjectBoardCard; budgetPolicy?: Record<string, unknown> }): string {
    return buildProjectBoardCardTaskDescription(
      input.card,
      input.budgetPolicy,
      this.projectBoardCardDependencyExecutionContext(input.card),
    );
  }

  projectBoardDependencyWorkspacePathsForCard(card: ProjectBoardCard): string[] {
    const context = this.projectBoardCardDependencyExecutionContext(card);
    if (!context?.available.length) return [];
    return projectBoardPromptList(
      context.available.flatMap((item) => (item.workspacePath ? [item.workspacePath] : [])),
      12,
    );
  }

  projectBoardCardDependencyExecutionContext(card: ProjectBoardCard): ProjectBoardCardDependencyExecutionContext | undefined {
    const blockerRefs = normalizeTaskReferences(card.blockedBy);
    if (blockerRefs.length === 0) return undefined;

    const cards = this.deps.listProjectBoardCards(card.boardId);
    const tasks = this.deps.listOrchestrationTasks();
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const tasksByIdentifier = new Map(tasks.map((task) => [task.identifier, task]));
    const available: ProjectBoardCardDependencyExecutionEntry[] = [];
    const pending: string[] = [];

    for (const blockerRef of blockerRefs) {
      const blockerCard = cards.find((candidate) => candidate.id !== card.id && projectBoardCardMatchesRef(candidate, blockerRef));
      if (blockerCard && projectBoardCardIsTerminalAuditCandidate(blockerCard)) continue;
      const task = blockerCard?.orchestrationTaskId
        ? tasksById.get(blockerCard.orchestrationTaskId)
        : (tasksById.get(blockerRef) ?? tasksByIdentifier.get(blockerRef));
      const linkedCard = blockerCard ?? (task ? cards.find((candidate) => candidate.orchestrationTaskId === task.id) : undefined);
      const taskState = task ? normalizeTaskState(task.state) : undefined;
      const cardStatus = linkedCard?.status;
      const dependencyAvailable =
        cardStatus === "done" ||
        cardStatus === "review" ||
        taskState === "done" ||
        taskState === "review" ||
        taskState === "needs_review";

      if (!dependencyAvailable) {
        const status = [
          linkedCard?.title,
          cardStatus ? `card ${cardStatus}` : "",
          task?.identifier,
          taskState ? `task ${taskState}` : "",
        ]
          .filter(Boolean)
          .join("; ");
        pending.push(`${blockerRef}${status ? ` (${status})` : ""}`);
        continue;
      }

      const artifactRun = task ? this.deps.latestDependencyArtifactRunForTask(task.id) : undefined;
      const latestRun = artifactRun ?? (task ? this.deps.latestOrchestrationRunForTask(task.id) : undefined);
      const proof = artifactRun?.proofOfWork;
      const taskActions = projectBoardRuntimeBudgetTrustworthyTaskActions(proof);
      available.push({
        ref: blockerRef,
        title: linkedCard?.title ?? task?.title ?? blockerRef,
        cardId: linkedCard?.id,
        taskId: task?.id,
        cardStatus,
        taskIdentifier: task?.identifier,
        taskState,
        workspacePath: artifactRun?.workspacePath ?? task?.workspacePath ?? latestRun?.workspacePath,
        branchName: task?.branchName,
        latestRunId: artifactRun?.id,
        latestRunStatus: latestRun?.status,
        proofSummary: projectBoardPromptSummary(
          projectBoardTaskToolProofSummary(taskActions),
          typeof proof?.summary === "string" ? proof.summary : undefined,
          typeof proof?.lastAssistantText === "string" ? proof.lastAssistantText : undefined,
          linkedCard?.proofReview?.summary,
        ),
        changedFiles: projectBoardPromptList(
          [...stringsFromProjectBoardUnknownArray(proof?.changedFiles), ...projectBoardTaskToolChangedFiles(taskActions)],
          12,
        ),
        commands: projectBoardPromptList([...stringsFromProjectBoardUnknownArray(proof?.commands), ...projectBoardTaskToolCommands(taskActions)], 8),
        manualChecks: projectBoardPromptList(
          [...stringsFromProjectBoardUnknownArray(proof?.manualChecks), ...projectBoardTaskToolManualChecks(taskActions)],
          8,
        ),
        completed: projectBoardPromptList([...stringsFromProjectBoardUnknownArray(proof?.completed), ...projectBoardTaskToolCompleted(taskActions)], 8),
      });
    }

    return available.length || pending.length ? { available, pending } : undefined;
  }
}
