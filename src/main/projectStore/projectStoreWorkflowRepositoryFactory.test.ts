import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProjectStoreRepositoryFactoryHost } from "./projectStoreRepositoryFactory";
import { ProjectStoreWorkflowAgentReadModelRepository } from "./workflowAgentReadModelRepository";
import { ProjectStoreWorkflowAgentThreadRepository } from "./workflowAgentThreadRepository";
import { ProjectStoreWorkflowArtifactRepository } from "./workflowArtifactRepository";
import { ProjectStoreWorkflowDiscoveryQuestionRepository } from "./workflowDiscoveryQuestionRepository";
import { ProjectStoreWorkflowGraphSnapshotRepository } from "./workflowGraphSnapshotRepository";
import { ProjectStoreWorkflowModelCallRepository } from "./workflowModelCallRepository";
import { ProjectStoreWorkflowRecordingRepository } from "./workflowRecordingRepository";
import { ProjectStoreWorkflowRepositoryFactory } from "./projectStoreWorkflowRepositoryFactory";
import { ProjectStoreWorkflowRevisionRepository } from "./workflowRevisionRepository";
import { ProjectStoreWorkflowRunRepository } from "./workflowRunRepository";
import { ProjectStoreWorkflowVersionRepository } from "./workflowVersionRepository";

describe("ProjectStoreWorkflowRepositoryFactory", () => {
  let db: Database.Database;
  let factory: ProjectStoreWorkflowRepositoryFactory;

  beforeEach(() => {
    db = new Database(":memory:");
    factory = new ProjectStoreWorkflowRepositoryFactory({
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

  it("creates the concrete workflow repository owners", () => {
    expect(factory.workflowArtifacts()).toBeInstanceOf(ProjectStoreWorkflowArtifactRepository);
    expect(factory.workflowGraphSnapshots()).toBeInstanceOf(ProjectStoreWorkflowGraphSnapshotRepository);
    expect(factory.workflowModelCalls()).toBeInstanceOf(ProjectStoreWorkflowModelCallRepository);
    expect(factory.workflowAgentThreads()).toBeInstanceOf(ProjectStoreWorkflowAgentThreadRepository);
    expect(factory.workflowAgentReadModels()).toBeInstanceOf(ProjectStoreWorkflowAgentReadModelRepository);
    expect(factory.workflowDiscoveryQuestions()).toBeInstanceOf(ProjectStoreWorkflowDiscoveryQuestionRepository);
    expect(factory.workflowRevisions()).toBeInstanceOf(ProjectStoreWorkflowRevisionRepository);
    expect(factory.workflowVersions()).toBeInstanceOf(ProjectStoreWorkflowVersionRepository);
    expect(factory.workflowRuns()).toBeInstanceOf(ProjectStoreWorkflowRunRepository);
    expect(factory.workflowRecordings()).toBeInstanceOf(ProjectStoreWorkflowRecordingRepository);
  });
});
