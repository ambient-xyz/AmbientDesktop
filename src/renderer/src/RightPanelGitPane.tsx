import { ChevronDown, ExternalLink, RefreshCw, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import type { GitReviewFile, GitReviewSummary, GitSimpleAction } from "../../shared/workspaceTypes";
import {
  gitCommitActionState,
  gitCreateBranchActionState,
  gitPullRequestActionState,
  gitPullRequestReadiness,
} from "./gitUiModel";

export function RightPanelGitPane({
  review,
  reviewError,
  actionNotice,
  busy,
  activeTab,
  commitMessage,
  branchName,
  unversionedAcknowledged,
  sharedWorkspaceAcknowledged,
  formatTimelineTime,
  onActiveTabChange,
  onRefresh,
  onCommitMessageChange,
  onBranchNameChange,
  onCommit,
  onCreateBranch,
  onAction,
  onCreatePullRequest,
  onInitializeRepository,
  onContinueWithoutGit,
  onCreateThreadWorktree,
  onAttachExistingWorktree,
  onKeepSharedWorkspace,
  onStageAll,
  onUnstageAll,
  onStage,
  onUnstage,
  onDiscard,
}: {
  review?: GitReviewSummary;
  reviewError?: string;
  actionNotice?: string;
  busy?: string;
  activeTab: "summary" | "review";
  commitMessage: string;
  branchName: string;
  unversionedAcknowledged: boolean;
  sharedWorkspaceAcknowledged: boolean;
  formatTimelineTime: (value: string) => string;
  onActiveTabChange: (tab: "summary" | "review") => void;
  onRefresh: () => void | Promise<void>;
  onCommitMessageChange: (value: string) => void;
  onBranchNameChange: (value: string) => void;
  onCommit: () => void | Promise<void>;
  onCreateBranch: () => void | Promise<void>;
  onAction: (action: GitSimpleAction) => void | Promise<void>;
  onCreatePullRequest: () => void | Promise<void>;
  onInitializeRepository: () => void | Promise<void>;
  onContinueWithoutGit: () => void;
  onCreateThreadWorktree: () => void | Promise<void>;
  onAttachExistingWorktree: () => void | Promise<void>;
  onKeepSharedWorkspace: () => void;
  onStageAll: () => void | Promise<void>;
  onUnstageAll: () => void | Promise<void>;
  onStage: (file: GitReviewFile) => void | Promise<void>;
  onUnstage: (file: GitReviewFile) => void | Promise<void>;
  onDiscard: (file: GitReviewFile) => void;
}) {
  return (
    <div className="panel-stack git-panel">
      <div className="git-panel-toolbar">
        <div className="panel-tabs">
          <button type="button" className={activeTab === "summary" ? "selected" : ""} onClick={() => onActiveTabChange("summary")}>
            Summary
          </button>
          <button type="button" className={activeTab === "review" ? "selected" : ""} onClick={() => onActiveTabChange("review")}>
            Review
          </button>
        </div>
        <button type="button" className="panel-button icon-panel-button" disabled={Boolean(busy)} onClick={() => void onRefresh()}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
      {reviewError && <p className="panel-status error">{reviewError}</p>}
      {actionNotice && <p className="panel-status success">{actionNotice}</p>}
      {review ? (
        activeTab === "summary" ? (
          <GitSummaryPanel
            review={review}
            busy={busy}
            commitMessage={commitMessage}
            branchName={branchName}
            formatTimelineTime={formatTimelineTime}
            onCommitMessageChange={onCommitMessageChange}
            onBranchNameChange={onBranchNameChange}
            onCommit={onCommit}
            onCreateBranch={onCreateBranch}
            onAction={onAction}
            onCreatePullRequest={onCreatePullRequest}
            onInitializeRepository={onInitializeRepository}
            onContinueWithoutGit={onContinueWithoutGit}
            unversionedAcknowledged={unversionedAcknowledged}
            onCreateThreadWorktree={onCreateThreadWorktree}
            onAttachExistingWorktree={onAttachExistingWorktree}
            onKeepSharedWorkspace={onKeepSharedWorkspace}
            sharedWorkspaceAcknowledged={sharedWorkspaceAcknowledged}
          />
        ) : (
          <GitReviewPanel
            review={review}
            busy={busy}
            onStageAll={onStageAll}
            onUnstageAll={onUnstageAll}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
          />
        )
      ) : (
        <p className="panel-note">Loading git review...</p>
      )}
    </div>
  );
}

function GitSummaryPanel({
  review,
  busy,
  commitMessage,
  branchName,
  formatTimelineTime,
  onCommitMessageChange,
  onBranchNameChange,
  onCommit,
  onCreateBranch,
  onAction,
  onCreatePullRequest,
  onInitializeRepository,
  onContinueWithoutGit,
  unversionedAcknowledged,
  onCreateThreadWorktree,
  onAttachExistingWorktree,
  onKeepSharedWorkspace,
  sharedWorkspaceAcknowledged,
}: {
  review: GitReviewSummary;
  busy?: string;
  commitMessage: string;
  branchName: string;
  formatTimelineTime: (value: string) => string;
  onCommitMessageChange: (value: string) => void;
  onBranchNameChange: (value: string) => void;
  onCommit: () => void | Promise<void>;
  onCreateBranch: () => void | Promise<void>;
  onAction: (action: GitSimpleAction) => void | Promise<void>;
  onCreatePullRequest: () => void | Promise<void>;
  onInitializeRepository: () => void | Promise<void>;
  onContinueWithoutGit: () => void;
  unversionedAcknowledged: boolean;
  onCreateThreadWorktree: () => void | Promise<void>;
  onAttachExistingWorktree: () => void | Promise<void>;
  onKeepSharedWorkspace: () => void;
  sharedWorkspaceAcknowledged: boolean;
}) {
  const hasRemote = Boolean(review.remote);
  const checkpoint = review.latestCheckpoint;
  const isSharedWorkspace = review.workspacePath === review.projectRoot && review.worktree?.status !== "active";
  const commitState = gitCommitActionState({ review, message: commitMessage, busy: Boolean(busy) });
  const branchState = gitCreateBranchActionState({ name: branchName, branches: review.branches, busy: Boolean(busy) });
  const pullRequestState = gitPullRequestActionState({ review, busy: Boolean(busy) });

  if (!review.isGitRepository) {
    return (
      <div className="git-summary-stack">
        <p className="panel-status info">
          {review.error ?? "No git repository detected."} Git actions are disabled until this workspace is initialized.
        </p>
        <section className="git-summary-card">
          <div>
            <span>Status</span>
            <strong>Unversioned workspace</strong>
            <small>{review.workspacePath}</small>
          </div>
        </section>
        <div className="git-no-repo-actions">
          <button type="button" className="panel-button" disabled={Boolean(busy)} onClick={() => void onInitializeRepository()}>
            {busy === "initialize-repository" ? "Initializing" : "Initialize repository"}
          </button>
          <button type="button" className="panel-button" disabled={Boolean(busy)} onClick={onContinueWithoutGit}>
            Continue without Git
          </button>
        </div>
        {unversionedAcknowledged && (
          <p className="panel-status success">
            Continuing without Git. File previews and artifact links stay available, but review, checkpoint, commit, and PR actions remain disabled.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="git-summary-stack">
      <GitSummaryDiffCard
        review={review}
        busy={busy}
        formatTimelineTime={formatTimelineTime}
        onCheckpoint={() => void onAction("create-checkpoint")}
        onUndo={() => void onAction("restore-latest-checkpoint")}
      />

      <section className="git-summary-card hero">
        <div>
          <span>Branch</span>
          <strong>{review.branch}</strong>
          {review.worktree?.status === "active" && <small>Thread worktree: {review.worktree.branchName}</small>}
          {review.worktree?.status === "failed" && <small className="danger-text">Worktree setup failed: {review.worktree.error}</small>}
        </div>
        <div className="git-remote-state">
          <span>Restore</span>
          <small>{checkpoint ? `Latest checkpoint: ${formatTimelineTime(checkpoint.createdAt)}` : "No checkpoint yet"}</small>
        </div>
      </section>

      {isSharedWorkspace && (
        <section className="git-summary-card shared-workspace-warning">
          <div>
            <span>Workspace isolation</span>
            <strong>{review.worktree?.status === "failed" ? "Worktree setup failed" : "Shared project workspace"}</strong>
            <small>
              {review.worktree?.error ??
                "This chat is still using the project root. Codex-style isolation works best when each chat has its own branch and worktree."}
            </small>
          </div>
          <div className="shared-workspace-actions">
            <button type="button" className="panel-button mini" disabled={Boolean(busy)} onClick={() => void onCreateThreadWorktree()}>
              {busy === "create-thread-worktree" ? "Creating" : "Create thread worktree"}
            </button>
            <button type="button" className="panel-button mini" disabled={Boolean(busy)} onClick={onKeepSharedWorkspace}>
              Keep shared
            </button>
            <button type="button" className="panel-button mini" disabled={Boolean(busy)} onClick={() => void onAttachExistingWorktree()}>
              {busy === "attach-existing-worktree" ? "Attaching" : "Attach existing"}
            </button>
          </div>
          {sharedWorkspaceAcknowledged && <p className="panel-status info">This chat will keep using the shared project root for now.</p>}
        </section>
      )}

      <div className="git-action-grid">
        <button type="button" className="panel-button" disabled={Boolean(busy)} onClick={() => void onAction("fetch")}>
          Fetch
        </button>
        <button type="button" className="panel-button" disabled={Boolean(busy) || !hasRemote} onClick={() => void onAction("pull")}>
          Pull
        </button>
        <button type="button" className="panel-button" disabled={Boolean(busy) || !hasRemote} onClick={() => void onAction("push")}>
          Push
        </button>
      </div>

      <GitPullRequestStatusCard
        review={review}
        busy={busy}
        actionState={pullRequestState}
        onAction={onAction}
        onCreatePullRequest={onCreatePullRequest}
      />

      <section className="git-form-card">
        <label>
          <span>Commit</span>
          <input
            className="panel-input"
            value={commitMessage}
            onChange={(event) => onCommitMessageChange(event.target.value)}
            placeholder={review.stagedCount > 0 ? "Commit message" : "Stage files before committing"}
            disabled={Boolean(busy)}
          />
        </label>
        <button type="button" className="panel-button" disabled={commitState.disabled} title={commitState.reason} onClick={() => void onCommit()}>
          {busy === "commit" ? "Committing" : "Commit staged"}
        </button>
      </section>

      <section className="git-form-card">
        <label>
          <span>Create branch</span>
          <input
            className="panel-input"
            value={branchName}
            onChange={(event) => onBranchNameChange(event.target.value)}
            placeholder="feature/name"
            disabled={Boolean(busy)}
          />
        </label>
        <button type="button" className="panel-button" disabled={branchState.disabled} title={branchState.reason} onClick={() => void onCreateBranch()}>
          {busy === "create-branch" ? "Creating" : "Create and switch"}
        </button>
      </section>

      <section className="git-summary-card">
        <div>
          <span>Remote</span>
          <strong>{hasRemote ? formatGitProvider(review.provider) : "No remote"}</strong>
          {review.upstream && <small>{review.upstream}</small>}
        </div>
        <div className="git-remote-state">
          {review.ahead > 0 && <span>ahead {review.ahead}</span>}
          {review.behind > 0 && <span>behind {review.behind}</span>}
          {review.ahead === 0 && review.behind === 0 && <span>up to date</span>}
        </div>
      </section>

      <section className="git-summary-card">
        <div>
          <span>Checkpoint</span>
          <strong>{checkpoint ? formatTimelineTime(checkpoint.createdAt) : "No checkpoint yet"}</strong>
          {checkpoint && <small>{checkpoint.reason}</small>}
          <small>{checkpoint ? "Restore reapplies the saved staged, unstaged, and untracked files where possible." : "Create a checkpoint manually when you want a restore point."}</small>
        </div>
      </section>
    </div>
  );
}

function GitSummaryDiffCard({
  review,
  busy,
  formatTimelineTime,
  onCheckpoint,
  onUndo,
}: {
  review: GitReviewSummary;
  busy?: string;
  formatTimelineTime: (value: string) => string;
  onCheckpoint: () => void;
  onUndo: () => void;
}) {
  const checkpoint = review.latestCheckpoint;
  const fileLabel = review.files.length === 1 ? "file" : "files";
  return (
    <section className="git-codex-summary-card" aria-label="Git change summary">
      <div className="git-codex-summary-header">
        <div className="git-codex-summary-title">
          <strong>
            {review.files.length} {fileLabel} changed
          </strong>
          <span className="git-codex-total-stats">
            <span className="addition">+{review.additions}</span>
            <span className="deletion">-{review.deletions}</span>
          </span>
          <span className="git-codex-stage-stats">
            {review.stagedCount} staged | {review.unstagedCount} unstaged | {review.untrackedCount} untracked
          </span>
        </div>
        <div className="git-codex-summary-actions">
          <button
            type="button"
            className="git-undo-button"
            disabled={Boolean(busy)}
            title="Create a manual checkpoint from the current workspace changes"
            onClick={onCheckpoint}
          >
            Checkpoint
            <Save size={15} />
          </button>
          <button
            type="button"
            className="git-undo-button"
            disabled={Boolean(busy) || !checkpoint}
            title={checkpoint ? `Restore checkpoint from ${formatTimelineTime(checkpoint.createdAt)}` : "No checkpoint available yet"}
            onClick={onUndo}
          >
            Restore
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      {review.files.length > 0 ? (
        <div className="git-codex-file-list">
          {review.files.map((file, index) => (
            <GitSummaryDiffFile key={`${file.status}-${file.path}`} file={file} openByDefault={index === 0 || file.conflicted} />
          ))}
        </div>
      ) : (
        <p className="panel-note">Working tree clean.</p>
      )}
    </section>
  );
}

function GitPullRequestStatusCard({
  review,
  busy,
  actionState,
  onAction,
  onCreatePullRequest,
}: {
  review: GitReviewSummary;
  busy?: string;
  actionState: { disabled: boolean; reason?: string };
  onAction: (action: GitSimpleAction) => void | Promise<void>;
  onCreatePullRequest: () => void | Promise<void>;
}) {
  const readiness = gitPullRequestReadiness(review);
  return (
    <section className={`git-summary-card git-pr-card ${readiness.tone}`}>
      <div>
        <span>Pull request</span>
        <strong>{readiness.label}</strong>
        <small>{readiness.detail}</small>
        <small>
          {review.remote ? formatGitProvider(review.provider) : "No remote"}
          {review.upstream ? ` | ${review.upstream}` : ""}
          {review.ahead > 0 ? ` | ahead ${review.ahead}` : ""}
          {review.behind > 0 ? ` | behind ${review.behind}` : ""}
        </small>
      </div>
      <div className="git-pr-actions">
        {readiness.action === "push" && (
          <button type="button" className="panel-button mini" disabled={Boolean(busy)} onClick={() => void onAction("push")}>
            {busy === "push" ? "Pushing" : "Push branch"}
          </button>
        )}
        {readiness.action === "pull" && (
          <button type="button" className="panel-button mini" disabled={Boolean(busy)} onClick={() => void onAction("pull")}>
            {busy === "pull" ? "Pulling" : "Pull first"}
          </button>
        )}
        <button
          type="button"
          className="panel-button mini icon-panel-button"
          disabled={actionState.disabled}
          title={actionState.reason}
          onClick={() => void onCreatePullRequest()}
        >
          <ExternalLink size={14} />
          Create PR
        </button>
      </div>
    </section>
  );
}

function GitSummaryDiffFile({ file, openByDefault }: { file: GitReviewFile; openByDefault: boolean }) {
  const [open, setOpen] = useState(openByDefault);
  const pathLabel = file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path;
  return (
    <details className={`git-summary-file ${file.category}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <strong title={pathLabel}>{pathLabel}</strong>
        <span className="git-file-stats">
          {file.additions || file.deletions ? (
            <>
              <span className="addition">+{file.additions}</span>
              <span className="deletion">-{file.deletions}</span>
            </>
          ) : (
            gitFileStateLabel(file)
          )}
        </span>
        <ChevronDown className="git-summary-file-chevron" size={15} />
      </summary>
      {file.diff ? (
        <DiffOutput diff={file.diff} />
      ) : (
        <p className="panel-note">{file.untracked ? "No text preview available for this untracked file." : "No text diff available."}</p>
      )}
    </details>
  );
}

function GitReviewPanel({
  review,
  busy,
  onStageAll,
  onUnstageAll,
  onStage,
  onUnstage,
  onDiscard,
}: {
  review: GitReviewSummary;
  busy?: string;
  onStageAll: () => void | Promise<void>;
  onUnstageAll: () => void | Promise<void>;
  onStage: (file: GitReviewFile) => void | Promise<void>;
  onUnstage: (file: GitReviewFile) => void | Promise<void>;
  onDiscard: (file: GitReviewFile) => void;
}) {
  if (!review.isGitRepository) {
    return <p className="panel-note">{review.error ?? "No git repository detected."}</p>;
  }
  if (review.files.length === 0) {
    return <p className="panel-note">No files changed.</p>;
  }
  const stageableCount = review.files.filter((file) => file.untracked || file.unstaged || file.conflicted).length;
  return (
    <div className="git-review-list">
      <div className="git-review-toolbar">
        <span>
          {review.stagedCount} staged / {review.unstagedCount} unstaged / {review.untrackedCount} untracked
        </span>
        <div>
          <button type="button" className="panel-button mini" disabled={Boolean(busy) || stageableCount === 0} onClick={() => void onStageAll()}>
            {busy === "stage-all" ? "Staging" : "Stage all"}
          </button>
          <button type="button" className="panel-button mini" disabled={Boolean(busy) || review.stagedCount === 0} onClick={() => void onUnstageAll()}>
            {busy === "unstage-all" ? "Unstaging" : "Unstage all"}
          </button>
        </div>
      </div>
      {review.files.map((file, index) => (
        <GitReviewFileRow
          key={`${file.status}-${file.path}`}
          file={file}
          busy={busy}
          openByDefault={index === 0 || file.conflicted}
          onStage={() => void onStage(file)}
          onUnstage={() => void onUnstage(file)}
          onDiscard={() => onDiscard(file)}
        />
      ))}
    </div>
  );
}

function GitReviewFileRow({
  file,
  busy,
  openByDefault,
  onStage,
  onUnstage,
  onDiscard,
}: {
  file: GitReviewFile;
  busy?: string;
  openByDefault: boolean;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
}) {
  const canStage = file.untracked || file.unstaged || file.conflicted;
  const canUnstage = file.staged;
  const canDiscard = file.untracked || file.unstaged || file.staged;
  const stageLabel = file.conflicted ? "Mark resolved" : "Stage";
  return (
    <details className={`git-review-file ${file.category}`} open={openByDefault}>
      <summary>
        <span className="git-file-state">{gitFileStateLabel(file)}</span>
        <strong title={file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}>
          {file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path}
        </strong>
        <span className="git-file-stats">
          {file.additions || file.deletions ? (
            <>
              <span className="addition">+{file.additions}</span>
              <span className="deletion">-{file.deletions}</span>
            </>
          ) : (
            file.status
          )}
        </span>
      </summary>
      <div className="git-file-actions">
        <button type="button" className="panel-button mini" disabled={Boolean(busy) || !canStage} onClick={onStage}>
          {stageLabel}
        </button>
        <button type="button" className="panel-button mini" disabled={Boolean(busy) || !canUnstage} onClick={onUnstage}>
          Unstage
        </button>
        <button type="button" className="panel-button mini danger" disabled={Boolean(busy) || !canDiscard} onClick={onDiscard}>
          Discard
        </button>
      </div>
      {file.conflicted && <p className="panel-note conflict-note">Resolve conflict markers in the file, then mark it resolved.</p>}
      {file.diff ? (
        <DiffOutput diff={file.diff} />
      ) : (
        <p className="panel-note">{file.untracked ? "No text preview available for this untracked file." : "No text diff available."}</p>
      )}
    </details>
  );
}

export function DiffOutput({ diff }: { diff: string }) {
  return (
    <pre className="diff-output">
      {diff.split(/\r?\n/).map((line, index) => (
        <span key={`${index}-${line.slice(0, 18)}`} className={diffLineClass(line)}>
          {line || " "}
        </span>
      ))}
    </pre>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "diff-line added";
  if (line.startsWith("-") && !line.startsWith("---")) return "diff-line removed";
  if (line.startsWith("@@")) return "diff-line hunk";
  if (line.startsWith("diff --git") || line.startsWith("Staged") || line.startsWith("Unstaged") || line.startsWith("Untracked") || line.startsWith("Conflict")) return "diff-line header";
  return "diff-line context";
}

export function formatGitSimpleAction(action: GitSimpleAction): string {
  if (action === "create-checkpoint") return "create-checkpoint";
  if (action === "restore-latest-checkpoint") return "restore-checkpoint";
  return action;
}

export function gitSimpleActionSuccessMessage(action: GitSimpleAction): string | undefined {
  if (action === "fetch") return "Fetched remote refs.";
  if (action === "push") return "Pushed branch changes.";
  return undefined;
}

function gitFileStateLabel(file: GitReviewFile): string {
  if (file.conflicted) return "Conflict";
  if (file.untracked) return "Untracked";
  if (file.staged && file.unstaged) return "Staged + modified";
  if (file.staged) return "Staged";
  if (file.unstaged) return "Modified";
  return formatTaskState(file.category);
}

function formatGitProvider(provider?: GitReviewSummary["provider"]): string {
  if (provider === "github") return "GitHub";
  if (provider === "gitlab") return "GitLab";
  if (provider === "unknown") return "Unknown remote";
  return "Remote";
}

function formatTaskState(state: string): string {
  return state
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
