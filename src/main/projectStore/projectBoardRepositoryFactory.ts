import type Database from "better-sqlite3";

import {
  ProjectStoreProjectBoardArtifactProjectionRepository,
  type ProjectStoreProjectBoardArtifactProjectionRepositoryDeps,
} from "./projectBoardArtifactProjectionRepository";
import {
  ProjectStoreProjectBoardCardExecutionSessionRepository,
  type ProjectStoreProjectBoardCardExecutionSessionRepositoryDeps,
} from "./projectBoardCardExecutionSessionRepository";
import {
  ProjectStoreProjectBoardCardMutationRepository,
  type ProjectStoreProjectBoardCardMutationRepositoryDeps,
} from "./projectBoardCardMutationRepository";
import { assertProjectBoardCardClaimAllowsLocalTicketization } from "./projectBoardCardTicketizationClaimGuard";
import { ProjectStoreProjectBoardCardReadinessGateRepository } from "./projectBoardCardReadinessGateRepository";
import {
  ProjectStoreProjectBoardClarificationDefaultRepository,
  type ProjectStoreProjectBoardClarificationDefaultRepositoryDeps,
} from "./projectBoardClarificationDefaultRepository";
import {
  ProjectStoreProjectBoardCompactPlannerPlanRepository,
  type ProjectStoreProjectBoardCompactPlannerPlanRepositoryDeps,
} from "./projectBoardCompactPlannerPlanRepository";
import {
  ProjectStoreProjectBoardDeliverableIntegrationRepository,
  type ProjectStoreProjectBoardDeliverableIntegrationRepositoryDeps,
} from "./projectBoardDeliverableIntegrationRepository";
import {
  ProjectStoreProjectBoardDependencyArtifactRepository,
  type ProjectStoreProjectBoardDependencyArtifactRepositoryDeps,
} from "./projectBoardDependencyArtifactRepository";
import {
  ProjectStoreProjectBoardDependencyExecutionContextRepository,
  type ProjectStoreProjectBoardDependencyExecutionContextRepositoryDeps,
} from "./projectBoardDependencyExecutionContextRepository";
import {
  ProjectStoreProjectBoardExecutionReadinessRepository,
  type ProjectStoreProjectBoardExecutionReadinessRepositoryDeps,
} from "./projectBoardExecutionReadinessRepository";
import {
  ProjectStoreProjectBoardLifecycleRepository,
  type ProjectStoreProjectBoardLifecycleRepositoryDeps,
} from "./projectBoardLifecycleRepository";
import {
  ProjectStoreProjectBoardPlannerPlanPromotionRepository,
  type ProjectStoreProjectBoardPlannerPlanPromotionRepositoryDeps,
} from "./projectBoardPlannerPlanPromotionRepository";
import {
  ProjectStoreProjectBoardPlanningSnapshotRepository,
  type ProjectStoreProjectBoardPlanningSnapshotRepositoryDeps,
} from "./projectBoardPlanningSnapshotRepository";
import {
  ProjectStoreProjectBoardProofSuggestionRepository,
  type ProjectStoreProjectBoardProofSuggestionRepositoryDeps,
} from "./projectBoardProofSuggestionRepository";
import {
  ProjectStoreProjectBoardQuestionRepository,
  type ProjectStoreProjectBoardQuestionRepositoryDeps,
} from "./projectBoardQuestionRepository";
import { ProjectStoreProjectBoardReadRepository, type ProjectStoreProjectBoardReadRepositoryDeps } from "./projectBoardReadRepository";
import {
  ProjectStoreProjectBoardRunProgressRepository,
  type ProjectStoreProjectBoardRunProgressRepositoryDeps,
} from "./projectBoardRunProgressRepository";
import {
  ProjectStoreProjectBoardSessionCopyRepository,
  type ProjectStoreProjectBoardSessionCopyRepositoryDeps,
} from "./projectBoardSessionCopyRepository";
import {
  ProjectStoreProjectBoardSourceRepository,
  type ProjectStoreProjectBoardSourceRepositoryDeps,
} from "./projectBoardSourceRepository";
import {
  ProjectStoreProjectBoardSynthesisApplyRepository,
  type ProjectStoreProjectBoardSynthesisApplyRepositoryDeps,
} from "./projectBoardSynthesisApplyRepository";
import {
  ProjectStoreProjectBoardSynthesisProposalRepository,
  type ProjectStoreProjectBoardSynthesisProposalRepositoryDeps,
} from "./projectBoardSynthesisProposalRepository";
import {
  ProjectStoreProjectBoardSynthesisRunRepository,
  type ProjectStoreProjectBoardSynthesisRunRepositoryDeps,
} from "./projectBoardSynthesisRunRepository";
import {
  ProjectStoreProjectBoardSynthesisStartFreshRepository,
  type ProjectStoreProjectBoardSynthesisStartFreshRepositoryDeps,
} from "./projectBoardSynthesisStartFreshRepository";
import {
  ProjectStoreProjectBoardWorkflowRepository,
  type ProjectStoreProjectBoardWorkflowRepositoryDeps,
} from "./projectBoardWorkflowRepository";
import type { ProjectBoardCardDependencyExecutionContext } from "./projectBoardMappers";

export type ProjectStoreProjectBoardRepositoryFactoryDeps = {
  requireDb(): Database.Database;
} & ProjectStoreProjectBoardArtifactProjectionRepositoryDeps &
  ProjectStoreProjectBoardCardExecutionSessionRepositoryDeps &
  ProjectStoreProjectBoardCardMutationRepositoryDeps &
  ProjectStoreProjectBoardClarificationDefaultRepositoryDeps &
  ProjectStoreProjectBoardCompactPlannerPlanRepositoryDeps &
  ProjectStoreProjectBoardDeliverableIntegrationRepositoryDeps &
  ProjectStoreProjectBoardDependencyArtifactRepositoryDeps &
  ProjectStoreProjectBoardDependencyExecutionContextRepositoryDeps &
  ProjectStoreProjectBoardExecutionReadinessRepositoryDeps &
  ProjectStoreProjectBoardLifecycleRepositoryDeps &
  ProjectStoreProjectBoardPlannerPlanPromotionRepositoryDeps &
  ProjectStoreProjectBoardPlanningSnapshotRepositoryDeps &
  ProjectStoreProjectBoardProofSuggestionRepositoryDeps &
  ProjectStoreProjectBoardQuestionRepositoryDeps &
  ProjectStoreProjectBoardReadRepositoryDeps &
  ProjectStoreProjectBoardRunProgressRepositoryDeps &
  ProjectStoreProjectBoardSessionCopyRepositoryDeps &
  ProjectStoreProjectBoardSourceRepositoryDeps &
  ProjectStoreProjectBoardSynthesisApplyRepositoryDeps &
  ProjectStoreProjectBoardSynthesisProposalRepositoryDeps &
  ProjectStoreProjectBoardSynthesisRunRepositoryDeps &
  ProjectStoreProjectBoardSynthesisStartFreshRepositoryDeps &
  ProjectStoreProjectBoardWorkflowRepositoryDeps;

export type ProjectStoreProjectBoardRepositoryFactoryHost = Omit<
  ProjectStoreProjectBoardRepositoryFactoryDeps,
  | "getWorkspacePath"
  | "mapProjectBoard"
  | "listProjectBoardCards"
  | "listProjectBoardQuestions"
  | "listProjectBoardSources"
  | "listProjectBoardEvents"
  | "projectBoardCardDependencyExecutionContext"
  | "materializeProjectBoardPulledHandoffFollowUps"
  | "projectBoardRequiresProofSpec"
  | "assertProjectBoardCardProofReady"
  | "assertProjectBoardCardClarificationsResolved"
  | "assertProjectBoardCardClaimAllowsLocalTicketization"
  | "assertProjectBoardRunFollowUpStillActionable"
  | "assertProjectBoardUxMockGateOpen"
>;

export function createProjectStoreProjectBoardRepositoryFactory(
  host: ProjectStoreProjectBoardRepositoryFactoryHost,
): ProjectStoreProjectBoardRepositoryFactory {
  // eslint-disable-next-line prefer-const -- dependency callbacks close over the factory before it is assigned below.
  let factory: ProjectStoreProjectBoardRepositoryFactory;
  const cardReadinessGates = () =>
    new ProjectStoreProjectBoardCardReadinessGateRepository(host.requireDb(), {
      listProjectBoardCards: (boardId) => factory.projectBoards().listProjectBoardCards(boardId),
    });
  factory = new ProjectStoreProjectBoardRepositoryFactory({
    requireDb: () => host.requireDb(),
    getWorkspace: () => host.getWorkspace(),
    getWorkspacePath: () => host.getWorkspace().path,
    getActiveProjectBoard: (sourceThreadId?: string) => host.getActiveProjectBoard(sourceThreadId),
    getProjectBoardForPath: (projectPath, sourceThreadId) => host.getProjectBoardForPath(projectPath, sourceThreadId),
    getProjectBoard: (boardId) => host.getProjectBoard(boardId),
    createProjectBoard: (input) => host.createProjectBoard(input),
    mapProjectBoard: (row) => factory.projectBoards().mapProjectBoard(row),
    getProjectBoardCard: (cardId) => host.getProjectBoardCard(cardId),
    tryGetProjectBoardCard: (cardId) => host.tryGetProjectBoardCard(cardId),
    getProjectBoardCardForOrchestrationTask: (taskId) => host.getProjectBoardCardForOrchestrationTask(taskId),
    listProjectBoardCards: (boardId) => factory.projectBoards().listProjectBoardCards(boardId),
    listProjectBoardQuestions: (boardId) => factory.projectBoards().listProjectBoardQuestions(boardId),
    listProjectBoardSources: (boardId) => factory.projectBoards().listProjectBoardSources(boardId),
    listProjectBoardEvents: (boardId: string, limit?: number) => factory.projectBoards().listProjectBoardEvents(boardId, limit),
    ensureProjectBoardQuestions: (boardId) => host.ensureProjectBoardQuestions(boardId),
    finalizeProjectBoardKickoff: (boardId) => host.finalizeProjectBoardKickoff(boardId),
    appendProjectBoardEvent: (input) => host.appendProjectBoardEvent(input),
    appendProjectBoardPlanningSnapshotForRun: (runId, kind = "manual") => host.appendProjectBoardPlanningSnapshotForRun(runId, kind),
    latestStableProjectBoardPlanningSnapshot: (boardId) => host.latestStableProjectBoardPlanningSnapshot(boardId),
    projectBoardRequiresProofSpec: (boardId) => cardReadinessGates().projectBoardRequiresProofSpec(boardId),
    assertProjectBoardCardProofReady: (card) => cardReadinessGates().assertProjectBoardCardProofReady(card),
    assertProjectBoardCardClarificationsResolved: (card) => cardReadinessGates().assertProjectBoardCardClarificationsResolved(card),
    assertProjectBoardCardClaimAllowsLocalTicketization: (card) =>
      assertProjectBoardCardClaimAllowsLocalTicketization(card, factory.projectBoards().listProjectBoardEvents(card.boardId)),
    assertProjectBoardRunFollowUpStillActionable: (card) => cardReadinessGates().assertProjectBoardRunFollowUpStillActionable(card),
    assertProjectBoardUxMockGateOpen: (card, boardCards) => cardReadinessGates().assertProjectBoardUxMockGateOpen(card, boardCards),
    syncProjectBoardTaskBlockers: (boardId) => host.syncProjectBoardTaskBlockers(boardId),
    syncProjectBoardCardsForLinkedTasks: () => host.syncProjectBoardCardsForLinkedTasks(),
    projectBoardCardTaskDescription: (card) => host.projectBoardCardTaskDescription(card),
    addProjectBoardCardRunFeedback: (input) => host.addProjectBoardCardRunFeedback(input),
    applyProjectBoardCardProofReview: (input) => host.applyProjectBoardCardProofReview(input),
    getPlannerPlanArtifact: (artifactId) => host.getPlannerPlanArtifact(artifactId),
    getProjectArtifactWorkspacePath: () => host.getProjectArtifactWorkspacePath(),
    promotePlannerDurableArtifactToBoardSource: (artifactId) => host.promotePlannerDurableArtifactToBoardSource(artifactId),
    getOrchestrationTask: (taskId) => host.getOrchestrationTask(taskId),
    createOrchestrationTask: (input) => host.createOrchestrationTask(input),
    updateOrchestrationTaskDescription: (taskId, description) => host.updateOrchestrationTaskDescription(taskId, description),
    listOrchestrationTasks: () => host.listOrchestrationTasks(),
    listOrchestrationRuns: (limit) => host.listOrchestrationRuns(limit),
    getOrchestrationRun: (runId) => host.getOrchestrationRun(runId),
    updateOrchestrationRun: (input) => host.updateOrchestrationRun(input),
    latestOrchestrationRunForTask: (taskId) => host.latestOrchestrationRunForTask(taskId),
    latestDependencyArtifactRunForTask: (taskId) => host.latestDependencyArtifactRunForTask(taskId),
    mapOrchestrationTask: (row) => host.mapOrchestrationTask(row),
    tryGetThread: (threadId) => host.tryGetThread(threadId),
    createThread: (title, workspacePath) => host.createThread(title, workspacePath),
    getThread: (threadId) => host.getThread(threadId),
    forkThread: (threadId, workspacePath) => host.forkThread(threadId, workspacePath),
    updateThreadTitle: (threadId, title) => host.updateThreadTitle(threadId, title),
    addMessage: (input) => host.addMessage(input),
    getRunningProjectBoardSynthesisRun: (boardId: string) => host.getRunningProjectBoardSynthesisRun(boardId),
    projectBoardCardDependencyExecutionContext: (card): ProjectBoardCardDependencyExecutionContext | undefined =>
      factory.projectBoardDependencyExecutionContexts().projectBoardCardDependencyExecutionContext(card),
    materializeProjectBoardPulledHandoffFollowUps: (boardId, runArtifacts) =>
      factory.projectBoardCardMutations().materializeProjectBoardPulledHandoffFollowUps(boardId, runArtifacts),
  } satisfies ProjectStoreProjectBoardRepositoryFactoryDeps);
  return factory;
}

export class ProjectStoreProjectBoardRepositoryFactory {
  constructor(private readonly deps: ProjectStoreProjectBoardRepositoryFactoryDeps) {}

  projectBoards(): ProjectStoreProjectBoardReadRepository {
    return new ProjectStoreProjectBoardReadRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardCompactPlannerPlans(): ProjectStoreProjectBoardCompactPlannerPlanRepository {
    return new ProjectStoreProjectBoardCompactPlannerPlanRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardPlannerPlanPromotions(): ProjectStoreProjectBoardPlannerPlanPromotionRepository {
    return new ProjectStoreProjectBoardPlannerPlanPromotionRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardLifecycle(): ProjectStoreProjectBoardLifecycleRepository {
    return new ProjectStoreProjectBoardLifecycleRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardQuestions(): ProjectStoreProjectBoardQuestionRepository {
    return new ProjectStoreProjectBoardQuestionRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardClarificationDefaults(): ProjectStoreProjectBoardClarificationDefaultRepository {
    return new ProjectStoreProjectBoardClarificationDefaultRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardSources(): ProjectStoreProjectBoardSourceRepository {
    return new ProjectStoreProjectBoardSourceRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardPlanningSnapshots(): ProjectStoreProjectBoardPlanningSnapshotRepository {
    return new ProjectStoreProjectBoardPlanningSnapshotRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardDeliverableIntegrations(): ProjectStoreProjectBoardDeliverableIntegrationRepository {
    return new ProjectStoreProjectBoardDeliverableIntegrationRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardDependencyArtifacts(): ProjectStoreProjectBoardDependencyArtifactRepository {
    return new ProjectStoreProjectBoardDependencyArtifactRepository(this.deps);
  }

  projectBoardDependencyExecutionContexts(): ProjectStoreProjectBoardDependencyExecutionContextRepository {
    return new ProjectStoreProjectBoardDependencyExecutionContextRepository(this.deps);
  }

  projectBoardRunProgress(): ProjectStoreProjectBoardRunProgressRepository {
    return new ProjectStoreProjectBoardRunProgressRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardProofSuggestions(): ProjectStoreProjectBoardProofSuggestionRepository {
    return new ProjectStoreProjectBoardProofSuggestionRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardCardExecutionSessions(): ProjectStoreProjectBoardCardExecutionSessionRepository {
    return new ProjectStoreProjectBoardCardExecutionSessionRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardSessionCopies(): ProjectStoreProjectBoardSessionCopyRepository {
    return new ProjectStoreProjectBoardSessionCopyRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardExecutionReadiness(): ProjectStoreProjectBoardExecutionReadinessRepository {
    return new ProjectStoreProjectBoardExecutionReadinessRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardWorkflows(): ProjectStoreProjectBoardWorkflowRepository {
    return new ProjectStoreProjectBoardWorkflowRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardSynthesisProposals(): ProjectStoreProjectBoardSynthesisProposalRepository {
    return new ProjectStoreProjectBoardSynthesisProposalRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardSynthesisApply(): ProjectStoreProjectBoardSynthesisApplyRepository {
    return new ProjectStoreProjectBoardSynthesisApplyRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardSynthesisStartFresh(): ProjectStoreProjectBoardSynthesisStartFreshRepository {
    return new ProjectStoreProjectBoardSynthesisStartFreshRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardArtifactProjections(): ProjectStoreProjectBoardArtifactProjectionRepository {
    return new ProjectStoreProjectBoardArtifactProjectionRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardSynthesisRuns(): ProjectStoreProjectBoardSynthesisRunRepository {
    return new ProjectStoreProjectBoardSynthesisRunRepository(this.deps.requireDb(), this.deps);
  }

  projectBoardCardMutations(): ProjectStoreProjectBoardCardMutationRepository {
    return new ProjectStoreProjectBoardCardMutationRepository(this.deps.requireDb(), this.deps);
  }
}
