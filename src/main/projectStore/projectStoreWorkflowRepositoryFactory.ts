import { ProjectStoreSymphonyWorkflowRecipeRepository } from "./symphonyWorkflowRecipeRepository";
import type { ProjectStoreRepositoryFactoryHost } from "./projectStoreRepositoryFactory";
import { ProjectStoreWorkflowAgentReadModelRepository } from "./workflowAgentReadModelRepository";
import { ProjectStoreWorkflowAgentThreadRepository } from "./workflowAgentThreadRepository";
import { ProjectStoreWorkflowArtifactRepository } from "./workflowArtifactRepository";
import { ProjectStoreWorkflowDiscoveryQuestionRepository } from "./workflowDiscoveryQuestionRepository";
import { ProjectStoreWorkflowExplorationTraceRepository } from "./workflowExplorationTraceRepository";
import { ProjectStoreWorkflowGraphSnapshotRepository } from "./workflowGraphSnapshotRepository";
import { ProjectStoreWorkflowLabRepository } from "./projectStoreWorkflowLabRepository";
import { ProjectStoreWorkflowModelCallRepository } from "./workflowModelCallRepository";
import { ProjectStoreWorkflowRecordingRepository } from "./workflowRecordingRepository";
import { ProjectStoreWorkflowRevisionRepository } from "./workflowRevisionRepository";
import { ProjectStoreWorkflowRunRepository } from "./workflowRunRepository";
import { ProjectStoreWorkflowTraceRetentionRepository } from "./workflowTraceRetentionRepository";
import { ProjectStoreWorkflowVersionRepository } from "./workflowVersionRepository";

export class ProjectStoreWorkflowRepositoryFactory {
  constructor(private readonly host: ProjectStoreRepositoryFactoryHost) {}

  workflowArtifacts(): ProjectStoreWorkflowArtifactRepository {
    return new ProjectStoreWorkflowArtifactRepository(this.host.requireDb(), {
      createWorkflowAgentThreadRecord: (input) => this.host.createWorkflowAgentThreadRecord(input),
    });
  }

  workflowExplorationTraces(): ProjectStoreWorkflowExplorationTraceRepository {
    return new ProjectStoreWorkflowExplorationTraceRepository(this.host.requireDb());
  }

  workflowGraphSnapshots(): ProjectStoreWorkflowGraphSnapshotRepository {
    return new ProjectStoreWorkflowGraphSnapshotRepository(this.host.requireDb());
  }

  workflowModelCalls(): ProjectStoreWorkflowModelCallRepository {
    return new ProjectStoreWorkflowModelCallRepository(this.host.requireDb(), {
      getWorkflowRun: (runId) => this.host.getWorkflowRun(runId),
      getWorkflowArtifact: (artifactId) => this.host.getWorkflowArtifact(artifactId),
    });
  }

  workflowAgentThreads(): ProjectStoreWorkflowAgentThreadRepository {
    return new ProjectStoreWorkflowAgentThreadRepository(this.host.requireDb(), {
      workspacePath: () => this.host.getWorkspace().path,
      createThread: (title, workspacePath) => this.host.createThread(title, workspacePath),
    });
  }

  workflowAgentReadModels(): ProjectStoreWorkflowAgentReadModelRepository {
    return new ProjectStoreWorkflowAgentReadModelRepository({
      ensureWorkflowAgentThreadLinks: () => this.workflowArtifacts().ensureWorkflowAgentThreadLinks(),
      getWorkspace: () => this.host.getWorkspace(),
      latestWorkflowVersionForThread: (workflowThreadId) => this.workflowVersions().latestWorkflowVersionForThread(workflowThreadId),
      listWorkflowAgentFolderRows: () => this.workflowAgentThreads().listWorkflowAgentFolderRows(),
      listWorkflowAgentThreadRows: () => this.workflowAgentThreads().listWorkflowAgentThreadRows(),
      listWorkflowDiscoveryQuestions: (workflowThreadId) => this.host.listWorkflowDiscoveryQuestions(workflowThreadId),
      listWorkflowGraphSnapshots: (workflowThreadId) => this.host.listWorkflowGraphSnapshots(workflowThreadId),
      listWorkflowRunEvents: (runId) => this.host.listWorkflowRunEvents(runId),
      listWorkflowRuns: (artifactId, limit) => this.host.listWorkflowRuns(artifactId, limit),
      requireWorkflowAgentThread: (threadId) => this.host.requireWorkflowAgentThread(threadId),
      tryGetWorkflowArtifact: (artifactId) => this.host.tryGetWorkflowArtifact(artifactId),
      tryGetWorkflowGraphSnapshot: (snapshotId) => this.host.tryGetWorkflowGraphSnapshot(snapshotId),
    });
  }

  workflowDiscoveryQuestions(): ProjectStoreWorkflowDiscoveryQuestionRepository {
    return new ProjectStoreWorkflowDiscoveryQuestionRepository(this.host.requireDb(), {
      getWorkflowRevision: (revisionId) => this.host.getWorkflowRevision(revisionId),
    });
  }

  workflowRevisions(): ProjectStoreWorkflowRevisionRepository {
    return new ProjectStoreWorkflowRevisionRepository(this.host.requireDb(), {
      getWorkflowVersion: (versionId) => this.host.getWorkflowVersion(versionId),
      getWorkflowArtifact: (artifactId) => this.host.getWorkflowArtifact(artifactId),
      requireWorkflowGraphSnapshotForThread: (snapshotId, workflowThreadId) =>
        this.host.requireWorkflowGraphSnapshotForThread(snapshotId, workflowThreadId),
      workflowVersionForGraphSnapshot: (graphSnapshotId) => this.host.workflowVersionForGraphSnapshot(graphSnapshotId),
    });
  }

  workflowVersions(): ProjectStoreWorkflowVersionRepository {
    return new ProjectStoreWorkflowVersionRepository(this.host.requireDb(), {
      getWorkflowArtifact: (artifactId) => this.host.getWorkflowArtifact(artifactId),
      tryGetWorkflowGraphSnapshot: (snapshotId) => this.host.tryGetWorkflowGraphSnapshot(snapshotId),
    });
  }

  workflowRuns(): ProjectStoreWorkflowRunRepository {
    return new ProjectStoreWorkflowRunRepository(this.host.requireDb());
  }

  workflowTraceRetention(): ProjectStoreWorkflowTraceRetentionRepository {
    return new ProjectStoreWorkflowTraceRetentionRepository(this.host.requireDb());
  }

  workflowRecordings(): ProjectStoreWorkflowRecordingRepository {
    return new ProjectStoreWorkflowRecordingRepository(this.host.requireDb(), {
      workspacePath: () => this.host.getWorkspace().path,
      createThread: (title, workspacePath) => this.host.createThread(title, workspacePath),
      getThread: (threadId) => this.host.getThread(threadId),
      listMessages: (threadId) => this.host.listMessages(threadId),
    });
  }

  workflowLabs(): ProjectStoreWorkflowLabRepository {
    return new ProjectStoreWorkflowLabRepository({
      workspacePath: () => this.host.getWorkspace().path,
      describeWorkflowRecording: (id) => this.host.describeWorkflowRecording(id),
      updateWorkflowRecordingPlaybook: (id, input) => this.host.updateWorkflowRecordingPlaybook(id, input),
    });
  }

  symphonyWorkflowRecipes(): ProjectStoreSymphonyWorkflowRecipeRepository {
    return new ProjectStoreSymphonyWorkflowRecipeRepository({
      describeWorkflowRecording: (id, input) => this.host.describeWorkflowRecording(id, input),
      getThread: (threadId) => this.host.getThread(threadId),
      workflowRecordingLibraryIndexes: () => this.workflowRecordings().libraryIndexes(),
    });
  }
}
