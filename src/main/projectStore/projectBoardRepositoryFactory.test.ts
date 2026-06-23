import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProjectStoreProjectBoardArtifactProjectionRepository } from "./projectBoardArtifactProjectionRepository";
import { ProjectStoreProjectBoardCardExecutionSessionRepository } from "./projectBoardCardExecutionSessionRepository";
import { ProjectStoreProjectBoardCardMutationRepository } from "./projectBoardCardMutationRepository";
import { ProjectStoreProjectBoardClarificationDefaultRepository } from "./projectBoardClarificationDefaultRepository";
import { ProjectStoreProjectBoardCompactPlannerPlanRepository } from "./projectBoardCompactPlannerPlanRepository";
import { ProjectStoreProjectBoardDeliverableIntegrationRepository } from "./projectBoardDeliverableIntegrationRepository";
import { ProjectStoreProjectBoardDependencyArtifactRepository } from "./projectBoardDependencyArtifactRepository";
import { ProjectStoreProjectBoardDependencyExecutionContextRepository } from "./projectBoardDependencyExecutionContextRepository";
import { ProjectStoreProjectBoardExecutionReadinessRepository } from "./projectBoardExecutionReadinessRepository";
import { ProjectStoreProjectBoardLifecycleRepository } from "./projectBoardLifecycleRepository";
import { ProjectStoreProjectBoardPlannerPlanPromotionRepository } from "./projectBoardPlannerPlanPromotionRepository";
import { ProjectStoreProjectBoardPlanningSnapshotRepository } from "./projectBoardPlanningSnapshotRepository";
import { ProjectStoreProjectBoardProofSuggestionRepository } from "./projectBoardProofSuggestionRepository";
import { ProjectStoreProjectBoardQuestionRepository } from "./projectBoardQuestionRepository";
import { ProjectStoreProjectBoardReadRepository } from "./projectBoardReadRepository";
import {
  ProjectStoreProjectBoardRepositoryFactory,
  type ProjectStoreProjectBoardRepositoryFactoryDeps,
} from "./projectBoardRepositoryFactory";
import { ProjectStoreProjectBoardRunProgressRepository } from "./projectBoardRunProgressRepository";
import { ProjectStoreProjectBoardSessionCopyRepository } from "./projectBoardSessionCopyRepository";
import { ProjectStoreProjectBoardSourceRepository } from "./projectBoardSourceRepository";
import { ProjectStoreProjectBoardSynthesisApplyRepository } from "./projectBoardSynthesisApplyRepository";
import { ProjectStoreProjectBoardSynthesisProposalRepository } from "./projectBoardSynthesisProposalRepository";
import { ProjectStoreProjectBoardSynthesisRunRepository } from "./projectBoardSynthesisRunRepository";
import { ProjectStoreProjectBoardSynthesisStartFreshRepository } from "./projectBoardSynthesisStartFreshRepository";
import { ProjectStoreProjectBoardWorkflowRepository } from "./projectBoardWorkflowRepository";

describe("ProjectStoreProjectBoardRepositoryFactory", () => {
  let db: Database.Database;
  let factory: ProjectStoreProjectBoardRepositoryFactory;

  beforeEach(() => {
    db = new Database(":memory:");
    factory = new ProjectStoreProjectBoardRepositoryFactory({
      requireDb: () => db,
    } as unknown as ProjectStoreProjectBoardRepositoryFactoryDeps);
  });

  afterEach(() => {
    db.close();
  });

  it("creates the concrete Project Board repository owners", () => {
    expect(factory.projectBoards()).toBeInstanceOf(ProjectStoreProjectBoardReadRepository);
    expect(factory.projectBoardCompactPlannerPlans()).toBeInstanceOf(ProjectStoreProjectBoardCompactPlannerPlanRepository);
    expect(factory.projectBoardPlannerPlanPromotions()).toBeInstanceOf(ProjectStoreProjectBoardPlannerPlanPromotionRepository);
    expect(factory.projectBoardLifecycle()).toBeInstanceOf(ProjectStoreProjectBoardLifecycleRepository);
    expect(factory.projectBoardQuestions()).toBeInstanceOf(ProjectStoreProjectBoardQuestionRepository);
    expect(factory.projectBoardClarificationDefaults()).toBeInstanceOf(ProjectStoreProjectBoardClarificationDefaultRepository);
    expect(factory.projectBoardSources()).toBeInstanceOf(ProjectStoreProjectBoardSourceRepository);
    expect(factory.projectBoardPlanningSnapshots()).toBeInstanceOf(ProjectStoreProjectBoardPlanningSnapshotRepository);
    expect(factory.projectBoardDeliverableIntegrations()).toBeInstanceOf(ProjectStoreProjectBoardDeliverableIntegrationRepository);
    expect(factory.projectBoardDependencyArtifacts()).toBeInstanceOf(ProjectStoreProjectBoardDependencyArtifactRepository);
    expect(factory.projectBoardDependencyExecutionContexts()).toBeInstanceOf(ProjectStoreProjectBoardDependencyExecutionContextRepository);
    expect(factory.projectBoardRunProgress()).toBeInstanceOf(ProjectStoreProjectBoardRunProgressRepository);
    expect(factory.projectBoardProofSuggestions()).toBeInstanceOf(ProjectStoreProjectBoardProofSuggestionRepository);
    expect(factory.projectBoardCardExecutionSessions()).toBeInstanceOf(ProjectStoreProjectBoardCardExecutionSessionRepository);
    expect(factory.projectBoardSessionCopies()).toBeInstanceOf(ProjectStoreProjectBoardSessionCopyRepository);
    expect(factory.projectBoardExecutionReadiness()).toBeInstanceOf(ProjectStoreProjectBoardExecutionReadinessRepository);
    expect(factory.projectBoardWorkflows()).toBeInstanceOf(ProjectStoreProjectBoardWorkflowRepository);
    expect(factory.projectBoardSynthesisProposals()).toBeInstanceOf(ProjectStoreProjectBoardSynthesisProposalRepository);
    expect(factory.projectBoardSynthesisApply()).toBeInstanceOf(ProjectStoreProjectBoardSynthesisApplyRepository);
    expect(factory.projectBoardSynthesisStartFresh()).toBeInstanceOf(ProjectStoreProjectBoardSynthesisStartFreshRepository);
    expect(factory.projectBoardArtifactProjections()).toBeInstanceOf(ProjectStoreProjectBoardArtifactProjectionRepository);
    expect(factory.projectBoardSynthesisRuns()).toBeInstanceOf(ProjectStoreProjectBoardSynthesisRunRepository);
    expect(factory.projectBoardCardMutations()).toBeInstanceOf(ProjectStoreProjectBoardCardMutationRepository);
  });
});
