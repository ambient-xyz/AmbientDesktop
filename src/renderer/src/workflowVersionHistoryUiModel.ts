import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowVersionStatus, WorkflowVersionSummary } from "../../shared/workflowTypes";

export interface WorkflowVersionHistoryItemModel {
  id: string;
  version: number;
  versionLabel: string;
  statusLabel: string;
  createdByLabel: string;
  createdAt: string;
  commitLabel: string;
  badges: string[];
  isActive: boolean;
  isLatestApproved: boolean;
  canRestoreForReview: boolean;
  canRestoreAndApprove: boolean;
  restoreBlockReason?: string;
  nextRestoredVersionLabel: string;
  comparisonTitle: string;
  comparisonDetails: string[];
}

export interface WorkflowVersionHistoryModel {
  items: WorkflowVersionHistoryItemModel[];
  countLabel: string;
  latestApprovedVersionLabel?: string;
  nextRestoredVersionLabel: string;
}

export function workflowVersionHistoryModel(input: {
  thread: Pick<WorkflowAgentThreadSummary, "id" | "activeGraphSnapshotId">;
  artifact: Pick<WorkflowArtifactSummary, "id">;
  versions: WorkflowVersionSummary[];
}): WorkflowVersionHistoryModel {
  const versions = [...input.versions]
    .filter((version) => version.workflowThreadId === input.thread.id)
    .sort((left, right) => right.version - left.version || right.createdAt.localeCompare(left.createdAt));
  const latestApproved = versions.find((version) => version.status === "approved");
  const nextVersion = Math.max(0, ...versions.map((version) => version.version)) + 1;
  const nextRestoredVersionLabel = `Restores as v${nextVersion}`;

  return {
    items: versions.map((version) => versionHistoryItem(version, input.artifact, input.thread, latestApproved, nextRestoredVersionLabel)),
    countLabel: `${versions.length} version${versions.length === 1 ? "" : "s"}`,
    latestApprovedVersionLabel: latestApproved ? `v${latestApproved.version}` : undefined,
    nextRestoredVersionLabel,
  };
}

function versionHistoryItem(
  version: WorkflowVersionSummary,
  artifact: Pick<WorkflowArtifactSummary, "id">,
  thread: Pick<WorkflowAgentThreadSummary, "activeGraphSnapshotId">,
  latestApproved: WorkflowVersionSummary | undefined,
  nextRestoredVersionLabel: string,
): WorkflowVersionHistoryItemModel {
  const isActive = version.artifactId === artifact.id && version.graphSnapshotId === thread.activeGraphSnapshotId;
  const isLatestApproved = version.id === latestApproved?.id;
  const restoreBlockReason = workflowVersionRestoreBlockReason(version, isActive);
  const comparison = workflowVersionComparison(version, latestApproved);
  const badges = [
    isActive ? "Current" : undefined,
    isLatestApproved ? "Latest approved" : undefined,
    version.gitCommitHash ? undefined : "No commit",
  ].filter((badge): badge is string => Boolean(badge));
  return {
    id: version.id,
    version: version.version,
    versionLabel: `Version ${version.version}`,
    statusLabel: workflowVersionStatusLabel(version.status),
    createdByLabel: workflowVersionCreatedByLabel(version.createdBy),
    createdAt: version.createdAt,
    commitLabel: version.gitCommitHash ? version.gitCommitHash.slice(0, 7) : "no commit",
    badges,
    isActive,
    isLatestApproved,
    canRestoreForReview: !restoreBlockReason,
    canRestoreAndApprove: !restoreBlockReason,
    restoreBlockReason,
    nextRestoredVersionLabel,
    comparisonTitle: comparison.title,
    comparisonDetails: comparison.details,
  };
}

function workflowVersionComparison(
  version: WorkflowVersionSummary,
  latestApproved: WorkflowVersionSummary | undefined,
): { title: string; details: string[] } {
  if (!latestApproved) {
    return {
      title: "No approved baseline",
      details: ["Approve a workflow version before comparing restore candidates."],
    };
  }
  if (version.id === latestApproved.id) {
    return {
      title: "Latest approved baseline",
      details: ["This is the version latest-approved schedules currently target."],
    };
  }
  return {
    title: `Compared with v${latestApproved.version}`,
    details: [
      version.gitCommitHash && latestApproved.gitCommitHash
        ? version.gitCommitHash === latestApproved.gitCommitHash
          ? "Same source commit as latest approved."
          : "Different source commit from latest approved."
        : "Commit comparison unavailable.",
      version.graphSnapshotId && latestApproved.graphSnapshotId
        ? version.graphSnapshotId === latestApproved.graphSnapshotId
          ? "Same graph snapshot as latest approved."
          : "Different graph snapshot from latest approved."
        : "Graph comparison unavailable.",
    ],
  };
}

function workflowVersionRestoreBlockReason(version: WorkflowVersionSummary, isActive: boolean): string | undefined {
  if (isActive) return "This version is already current.";
  if (!version.gitCommitHash) return "This version has no git commit to restore.";
  if (version.status === "archived") return "Archived workflow versions are retained for audit and cannot be restored.";
  return undefined;
}

function workflowVersionStatusLabel(status: WorkflowVersionStatus): string {
  if (status === "ready_for_review") return "Ready for review";
  return labelFromSnakeCase(status);
}

function workflowVersionCreatedByLabel(createdBy: WorkflowVersionSummary["createdBy"]): string {
  if (createdBy === "version_revert") return "Version restore";
  if (createdBy === "ambient_debug_rewrite") return "Debug rewrite";
  if (createdBy === "user_source_edit") return "Source edit";
  return "Compiler";
}

function labelFromSnakeCase(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
