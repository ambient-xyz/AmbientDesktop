import type { GitReviewSummary, WorkspaceGitStatus } from "../../shared/types";

export function filterGitBranches(branches: string[], query: string, currentBranch = ""): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  const uniqueBranches = Array.from(new Set(branches.filter(Boolean)));
  const filtered = normalizedQuery
    ? uniqueBranches.filter((branch) => branch.toLowerCase().includes(normalizedQuery))
    : uniqueBranches;
  return filtered.sort((left, right) => {
    if (left === currentBranch) return -1;
    if (right === currentBranch) return 1;
    return left.localeCompare(right);
  });
}

export function gitCommitActionState(input: {
  review?: Pick<GitReviewSummary, "stagedCount" | "conflictedCount">;
  message: string;
  busy?: boolean;
}): { disabled: boolean; reason?: string } {
  if (input.busy) return { disabled: true, reason: "A Git action is already running." };
  if (!input.message.trim()) return { disabled: true, reason: "Enter a commit message." };
  if (!input.review || input.review.stagedCount === 0) return { disabled: true, reason: "Stage files before committing." };
  if (input.review.conflictedCount > 0) return { disabled: true, reason: "Resolve merge conflicts before committing." };
  return { disabled: false };
}

export function gitCreateBranchActionState(input: {
  name: string;
  branches: string[];
  busy?: boolean;
}): { disabled: boolean; reason?: string } {
  const name = input.name.trim();
  if (input.busy) return { disabled: true, reason: "A Git action is already running." };
  if (!name) return { disabled: true, reason: "Enter a branch name." };
  if (/\s/.test(name)) return { disabled: true, reason: "Branch names cannot contain spaces." };
  if (input.branches.includes(name)) return { disabled: true, reason: "That branch already exists." };
  return { disabled: false };
}

export function gitPullRequestActionState(input: {
  review: Pick<GitReviewSummary, "compareUrl" | "remote" | "ahead" | "behind" | "upstream" | "provider">;
  busy?: boolean;
}): { disabled: boolean; reason?: string } {
  if (input.busy) return { disabled: true, reason: "A Git action is already running." };
  const readiness = gitPullRequestReadiness(input.review);
  if (readiness.action !== "create") return { disabled: true, reason: readiness.detail };
  return { disabled: false };
}

export function gitPullRequestReadiness(
  review: Pick<GitReviewSummary, "compareUrl" | "remote" | "ahead" | "behind" | "upstream" | "provider">,
): { label: string; detail: string; tone: "ready" | "warning" | "blocked"; action: "create" | "push" | "pull" | "blocked" } {
  if (!review.remote) {
    return {
      label: "No remote",
      detail: "Add a GitHub or GitLab remote before creating a pull request.",
      tone: "blocked",
      action: "blocked",
    };
  }
  if (!review.compareUrl) {
    return {
      label: "Unsupported remote",
      detail: "Pull request links are available for GitHub and GitLab remotes.",
      tone: "blocked",
      action: "blocked",
    };
  }
  if (!review.upstream || review.ahead > 0) {
    return {
      label: "Push required",
      detail: "Push this branch before creating a pull request so the remote contains the commits.",
      tone: "warning",
      action: "push",
    };
  }
  if (review.behind > 0) {
    return {
      label: "Pull recommended",
      detail: "Pull remote changes before creating a pull request to avoid opening it from a stale branch.",
      tone: "warning",
      action: "pull",
    };
  }
  return {
    label: "Ready",
    detail: `Open a ${review.provider === "gitlab" ? "merge request" : "pull request"} for this branch.`,
    tone: "ready",
    action: "create",
  };
}

export function gitWorkModeSummary(review?: Pick<GitReviewSummary, "workspacePath" | "projectRoot" | "worktree">): {
  label: string;
  detail: string;
  tone: "neutral" | "active" | "warning" | "danger";
} {
  if (!review) return { label: "Work locally", detail: "Checking workspace mode.", tone: "neutral" };
  if (review.worktree?.status === "active") {
    return { label: "Thread worktree", detail: review.worktree.branchName, tone: "active" };
  }
  if (review.worktree?.status === "failed") {
    return { label: "Worktree failed", detail: review.worktree.error ?? "Worktree setup failed.", tone: "danger" };
  }
  if (review.workspacePath === review.projectRoot) {
    return { label: "Shared workspace", detail: "This thread is using the project root.", tone: "warning" };
  }
  return { label: "Work locally", detail: review.workspacePath, tone: "neutral" };
}

export function gitStatusDetail(status?: WorkspaceGitStatus): string {
  if (!status) return "Checking git";
  if (!status.isGitRepository) return status.error ?? "No git repository detected.";
  const remoteStatus = [status.ahead > 0 ? `ahead ${status.ahead}` : "", status.behind > 0 ? `behind ${status.behind}` : ""]
    .filter(Boolean)
    .join(", ");
  return [status.dirtyCount > 0 ? `${status.dirtyCount} changes` : "clean", remoteStatus].filter(Boolean).join(", ");
}
