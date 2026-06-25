import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProjectStoreRepositoryFactoryHost } from "./projectStoreRepositoryFactory";
import { ProjectStoreSubagentBatchRepository } from "./subagentBatchRepository";
import { ProjectStoreSubagentMailboxRepository } from "./subagentMailboxRepository";
import { ProjectStoreSubagentMaturitySnapshotRepository } from "./subagentMaturitySnapshotRepository";
import { ProjectStoreSubagentParentStopCascadeRepository } from "./subagentParentStopCascadeRepository";
import { ProjectStoreSubagentRepairDiagnosticsRepository } from "./subagentRepairDiagnosticsRepository";
import { ProjectStoreSubagentRestartReconciliationRepository } from "./subagentRestartReconciliationRepository";
import { ProjectStoreSubagentRetentionCleanupRepository } from "./subagentRetentionCleanupRepository";
import { ProjectStoreSubagentRunCompletionRepository } from "./subagentRunCompletionRepository";
import { ProjectStoreSubagentRunCreationRepository } from "./subagentRunCreationRepository";
import { ProjectStoreSubagentRunRepository } from "./subagentRunRepository";
import { ProjectStoreSubagentSpawnEdgeRepairRepository } from "./subagentSpawnEdgeRepairRepository";
import { ProjectStoreSubagentWaitBarrierRepository } from "./subagentWaitBarrierRepository";
import {
  ProjectStoreSubagentRepositoryFactory,
  type ProjectStoreSubagentRepositoryFactoryDeps,
} from "./projectStoreSubagentRepositoryFactory";

describe("ProjectStoreSubagentRepositoryFactory", () => {
  let db: Database.Database;
  let factory: ProjectStoreSubagentRepositoryFactory;

  beforeEach(() => {
    db = new Database(":memory:");
    factory = new ProjectStoreSubagentRepositoryFactory(
      {
        projectBoardRepos: {},
        requireDb: () => db,
        getWorkspace: () => ({
          path: "/tmp/workspace",
          name: "workspace",
          statePath: "/tmp/workspace/.ambient",
          sessionPath: "/tmp/workspace/.ambient/sessions",
        }),
      } as unknown as ProjectStoreRepositoryFactoryHost,
      {
        threads: () => ({}),
        workflowRuns: () => ({}),
      } as ProjectStoreSubagentRepositoryFactoryDeps,
    );
  });

  afterEach(() => {
    db.close();
  });

  it("creates the concrete subagent repository owners", () => {
    expect(factory.subagentRuns()).toBeInstanceOf(ProjectStoreSubagentRunRepository);
    expect(factory.subagentMailboxes()).toBeInstanceOf(ProjectStoreSubagentMailboxRepository);
    expect(factory.subagentWaitBarriers()).toBeInstanceOf(ProjectStoreSubagentWaitBarrierRepository);
    expect(factory.subagentBatches()).toBeInstanceOf(ProjectStoreSubagentBatchRepository);
    expect(factory.subagentRunCreations()).toBeInstanceOf(ProjectStoreSubagentRunCreationRepository);
    expect(factory.subagentSpawnEdgeRepairs()).toBeInstanceOf(ProjectStoreSubagentSpawnEdgeRepairRepository);
    expect(factory.subagentParentStopCascades()).toBeInstanceOf(ProjectStoreSubagentParentStopCascadeRepository);
    expect(factory.subagentRunCompletions()).toBeInstanceOf(ProjectStoreSubagentRunCompletionRepository);
    expect(factory.subagentRestartReconciliations()).toBeInstanceOf(ProjectStoreSubagentRestartReconciliationRepository);
    expect(factory.subagentMaturitySnapshots()).toBeInstanceOf(ProjectStoreSubagentMaturitySnapshotRepository);
    expect(factory.subagentRepairDiagnostics()).toBeInstanceOf(ProjectStoreSubagentRepairDiagnosticsRepository);
    expect(factory.subagentRetentionCleanups()).toBeInstanceOf(ProjectStoreSubagentRetentionCleanupRepository);
  });
});
