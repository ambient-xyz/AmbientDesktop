import { describe, expect, it } from "vitest";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowVersionSummary } from "../../shared/types";
import { workflowVersionHistoryModel } from "./workflowVersionHistoryUiModel";

const artifact: Pick<WorkflowArtifactSummary, "id"> = { id: "artifact-1" };
const thread: Pick<WorkflowAgentThreadSummary, "id" | "activeGraphSnapshotId"> = {
  id: "thread-1",
  activeGraphSnapshotId: "graph-3",
};

describe("workflow version history UI model", () => {
  it("labels current, latest approved, and restore actions", () => {
    const model = workflowVersionHistoryModel({
      thread,
      artifact,
      versions: [
        versionFixture({ id: "version-1", version: 1, status: "approved", graphSnapshotId: "graph-1", gitCommitHash: "a".repeat(40) }),
        versionFixture({ id: "version-2", version: 2, status: "approved", graphSnapshotId: "graph-2", gitCommitHash: "b".repeat(40) }),
        versionFixture({ id: "version-3", version: 3, status: "ready_for_review", graphSnapshotId: "graph-3", gitCommitHash: "c".repeat(40) }),
      ],
    });

    expect(model).toMatchObject({
      countLabel: "3 versions",
      latestApprovedVersionLabel: "v2",
      nextRestoredVersionLabel: "Restores as v4",
    });
    expect(model.items.map((item) => item.version)).toEqual([3, 2, 1]);
    expect(model.items[0]).toMatchObject({
      id: "version-3",
      statusLabel: "Ready for review",
      badges: ["Current"],
      isActive: true,
      canRestoreForReview: false,
      restoreBlockReason: "This version is already current.",
    });
    expect(model.items[1]).toMatchObject({
      id: "version-2",
      badges: ["Latest approved"],
      isLatestApproved: true,
      canRestoreForReview: true,
      canRestoreAndApprove: true,
      nextRestoredVersionLabel: "Restores as v4",
      comparisonTitle: "Latest approved baseline",
      comparisonDetails: ["This is the version latest-approved schedules currently target."],
    });
    expect(model.items[2]).toMatchObject({
      id: "version-1",
      comparisonTitle: "Compared with v2",
      comparisonDetails: ["Different source commit from latest approved.", "Different graph snapshot from latest approved."],
    });
  });

  it("blocks restore for uncommitted and archived versions", () => {
    const model = workflowVersionHistoryModel({
      thread: { ...thread, activeGraphSnapshotId: "graph-current" },
      artifact,
      versions: [
        versionFixture({ id: "version-uncommitted", version: 2, status: "ready_for_review", gitCommitHash: undefined }),
        versionFixture({ id: "version-archived", version: 1, status: "archived", gitCommitHash: "d".repeat(40) }),
      ],
    });

    expect(model.items[0]).toMatchObject({
      id: "version-uncommitted",
      badges: ["No commit"],
      canRestoreForReview: false,
      restoreBlockReason: "This version has no git commit to restore.",
    });
    expect(model.items[1]).toMatchObject({
      id: "version-archived",
      statusLabel: "Archived",
      canRestoreAndApprove: false,
      restoreBlockReason: "Archived workflow versions are retained for audit and cannot be restored.",
    });
  });

  it("shows missing approved baseline when no version is approved", () => {
    const model = workflowVersionHistoryModel({
      thread,
      artifact,
      versions: [versionFixture({ id: "version-review", status: "ready_for_review", gitCommitHash: "e".repeat(40) })],
    });

    expect(model).toMatchObject({ latestApprovedVersionLabel: undefined });
    expect(model.items[0]).toMatchObject({
      comparisonTitle: "No approved baseline",
      comparisonDetails: ["Approve a workflow version before comparing restore candidates."],
    });
  });
});

function versionFixture(input: Partial<WorkflowVersionSummary>): WorkflowVersionSummary {
  return {
    id: input.id ?? "version-1",
    workflowThreadId: input.workflowThreadId ?? "thread-1",
    artifactId: input.artifactId ?? "artifact-1",
    version: input.version ?? 1,
    graphSnapshotId: input.graphSnapshotId ?? "graph-1",
    sourcePath: input.sourcePath ?? "/tmp/main.ts",
    repoPath: input.repoPath ?? "/tmp/workflow",
    gitCommitHash: input.gitCommitHash,
    status: input.status ?? "approved",
    createdBy: input.createdBy ?? "compiler",
    createdAt: input.createdAt ?? "2026-05-05T00:00:00.000Z",
  };
}
