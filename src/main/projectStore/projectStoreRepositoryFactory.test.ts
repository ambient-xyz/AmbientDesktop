import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProjectStoreAutomationRepository } from "./automationRepository";
import { ProjectStoreCallableWorkflowTaskRepository } from "./callableWorkflowTaskRepository";
import { ProjectStoreMessageRepository } from "./messageRepository";
import { ProjectStoreOrchestrationRepository } from "./orchestrationRepository";
import { ProjectStoreProjectBoardLinkedTaskRepository } from "./projectBoardLinkedTaskRepository";
import { ProjectStoreRepositoryFactory, type ProjectStoreRepositoryFactoryHost } from "./projectStoreRepositoryFactory";
import { ProjectStoreSubagentRunCreationRepository } from "./subagentRunCreationRepository";
import { ProjectStoreThreadRepository } from "./threadRepository";
import { ProjectStoreWorkflowArtifactRepository } from "./workflowArtifactRepository";
import { ProjectStoreWorkflowRecordingRepository } from "./workflowRecordingRepository";

describe("ProjectStoreRepositoryFactory", () => {
  let db: Database.Database;
  let factory: ProjectStoreRepositoryFactory;

  beforeEach(() => {
    db = new Database(":memory:");
    factory = new ProjectStoreRepositoryFactory({
      projectBoardRepos: {},
      requireDb: () => db,
      getWorkspace: () => ({
        path: "/tmp/workspace",
        name: "workspace",
        statePath: "/tmp/workspace/.ambient",
        sessionPath: "/tmp/workspace/.ambient/sessions",
      }),
    } as unknown as ProjectStoreRepositoryFactoryHost);
  });

  afterEach(() => {
    db.close();
  });

  it("creates representative concrete repository owners", () => {
    expect(factory.threads()).toBeInstanceOf(ProjectStoreThreadRepository);
    expect(factory.messages()).toBeInstanceOf(ProjectStoreMessageRepository);
    expect(factory.workflowArtifacts()).toBeInstanceOf(ProjectStoreWorkflowArtifactRepository);
    expect(factory.workflowRecordings()).toBeInstanceOf(ProjectStoreWorkflowRecordingRepository);
    expect(factory.automations()).toBeInstanceOf(ProjectStoreAutomationRepository);
    expect(factory.callableWorkflowTasks()).toBeInstanceOf(ProjectStoreCallableWorkflowTaskRepository);
    expect(factory.subagentRunCreations()).toBeInstanceOf(ProjectStoreSubagentRunCreationRepository);
    expect(factory.projectBoardLinkedTasks()).toBeInstanceOf(ProjectStoreProjectBoardLinkedTaskRepository);
    expect(factory.orchestration()).toBeInstanceOf(ProjectStoreOrchestrationRepository);
  });
});
