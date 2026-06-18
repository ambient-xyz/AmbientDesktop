import {
  Check,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  PanelRight,
  Plus,
  Search,
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  useState,
} from "react";

import type { GitReviewSummary, WorkspaceGitStatus } from "../../shared/workspaceTypes";
import {
  filterGitBranches,
  gitCreateBranchActionState,
  gitStatusDetail,
  gitWorkModeSummary,
} from "./gitUiModel";

export function GitStatusControl({
  gitStatus,
  error,
  onSwitchBranch,
  onCreateBranch,
}: {
  gitStatus?: WorkspaceGitStatus;
  error?: string;
  onSwitchBranch: (branch: string) => void;
  onCreateBranch: (branch: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  if (error) {
    return <GitReadonlyChip icon={<GitBranch size={13} />} label="Git unavailable" title={error} />;
  }

  if (!gitStatus) {
    return <GitReadonlyChip icon={<GitBranch size={13} />} label="Checking git" />;
  }

  if (!gitStatus.isGitRepository) {
    return <GitReadonlyChip icon={<GitBranch size={13} />} label="No git" title={gitStatus.error} />;
  }

  const detail = gitStatusDetail(gitStatus);
  const chipTitle = `${gitStatus.branch}: ${detail}`;
  const branches = filterGitBranches(gitStatus.branches, query, gitStatus.branch);

  return (
    <span className="git-chip-anchor">
      <button
        type="button"
        className={`git-context-chip ${gitStatus.dirtyCount > 0 ? "dirty" : ""}`}
        title={chipTitle}
        aria-label={`Switch Git branch ${gitStatus.branch}`}
        data-ui-allow-truncation="true"
        onClick={() => setOpen((current) => !current)}
      >
        <GitBranch size={13} />
        <span>{gitStatus.branch}</span>
        {gitStatus.dirtyCount > 0 && <span className="status-dot">{gitStatus.dirtyCount}</span>}
        <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <button type="button" className="git-popover-scrim" aria-label="Close Git branch menu" onClick={() => setOpen(false)} />
          <div className="git-chip-menu git-branch-menu" role="menu" aria-label="Git branches">
            <label className="git-branch-search">
              <Search size={13} />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches" />
            </label>
            <div className="git-menu-list">
              {branches.length > 0 ? (
                branches.map((branch) => (
                  <button
                    type="button"
                    className="git-menu-row"
                    key={branch}
                    disabled={branch === gitStatus.branch}
                    onClick={() => {
                      setOpen(false);
                      onSwitchBranch(branch);
                    }}
                  >
                    <span>{branch}</span>
                    {branch === gitStatus.branch && <Check size={14} />}
                  </button>
                ))
              ) : (
                <p className="git-menu-empty">No branches matched.</p>
              )}
            </div>
            <button
              type="button"
              className="git-menu-row create"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
            >
              <Plus size={14} />
              <span>Create branch</span>
            </button>
          </div>
        </>
      )}
      {createOpen && (
        <GitCreateBranchDialog
          branches={gitStatus.branches}
          currentBranch={gitStatus.branch}
          onCancel={() => setCreateOpen(false)}
          onCreate={async (name) => {
            await onCreateBranch(name);
            setCreateOpen(false);
            setQuery("");
          }}
        />
      )}
    </span>
  );
}

export function GitWorkModeControl({
  review,
  error,
  onCreateThreadWorktree,
  onAttachExistingWorktree,
  onOpenGitSummary,
}: {
  review?: GitReviewSummary;
  error?: string;
  onCreateThreadWorktree: () => void;
  onAttachExistingWorktree: () => void;
  onOpenGitSummary: () => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = gitWorkModeSummary(review);
  const canCreateWorktree = Boolean(review?.isGitRepository && review.worktree?.status !== "active");
  const canAttachWorktree = Boolean(review?.isGitRepository);
  const chipTitle = error ? `Git review unavailable: ${error}` : `${summary.label}: ${summary.detail}`;
  return (
    <span className="git-chip-anchor">
      <button
        type="button"
        className={`git-context-chip work-mode ${summary.tone}`}
        title={chipTitle}
        aria-label={`Git work mode ${summary.label}`}
        data-ui-allow-truncation="true"
        onClick={() => setOpen((current) => !current)}
      >
        <FolderOpen size={13} />
        <span>{error ? "Git review unavailable" : summary.label}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <button type="button" className="git-popover-scrim" aria-label="Close Git work mode menu" onClick={() => setOpen(false)} />
          <div className="git-chip-menu git-work-menu" role="menu" aria-label="Git work mode">
            <div className="git-menu-section">
              <span>Workspace</span>
              <strong>{error ? "Git review unavailable" : summary.label}</strong>
              <small>{error ?? summary.detail}</small>
            </div>
            <button
              type="button"
              className="git-menu-row"
              disabled={!canCreateWorktree}
              onClick={() => {
                setOpen(false);
                onCreateThreadWorktree();
              }}
            >
              <FolderPlus size={14} />
              <span>Create thread worktree</span>
            </button>
            <button
              type="button"
              className="git-menu-row"
              onClick={() => {
                setOpen(false);
                onOpenGitSummary();
              }}
            >
              <PanelRight size={14} />
              <span>Open Git panel</span>
            </button>
            <button
              type="button"
              className="git-menu-row"
              disabled={!canAttachWorktree}
              onClick={() => {
                setOpen(false);
                onAttachExistingWorktree();
              }}
            >
              <Folder size={14} />
              <span>Attach existing worktree</span>
            </button>
          </div>
        </>
      )}
    </span>
  );
}

export function GitReadonlyChip({ icon, label, title }: { icon: ReactNode; label: string; title?: string }) {
  return (
    <span
      className="git-context-chip readonly"
      title={title ?? label}
      aria-label={label}
      data-ui-allow-truncation="true"
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}

export function GitCreateBranchDialog({
  branches,
  currentBranch,
  onCancel,
  onCreate,
}: {
  branches: string[];
  currentBranch: string;
  onCancel: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const actionState = gitCreateBranchActionState({ name, branches, busy });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionState.disabled) {
      setError(actionState.reason);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onCreate(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop git-branch-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <form className="git-branch-dialog" role="dialog" aria-modal="true" aria-labelledby="git-create-branch-title" onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()}>
        <div className="permission-dialog-header">
          <span className="dialog-icon">
            <GitBranch size={20} />
          </span>
          <div>
            <h2 id="git-create-branch-title">Create branch</h2>
            <p>Branch from {currentBranch} and switch this workspace to the new branch.</p>
          </div>
        </div>
        <label className="dialog-field">
          <span>Branch name</span>
          <input autoFocus className="panel-input" value={name} placeholder="feature/name" disabled={busy} onChange={(event) => setName(event.target.value)} />
        </label>
        {error && <p className="panel-status error">{error}</p>}
        <div className="permission-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="secondary-button" disabled={actionState.disabled} title={actionState.reason}>
            {busy ? "Creating" : "Create and switch"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function GitEditSummaryBadge({
  review,
  error,
  onOpen,
}: {
  review?: GitReviewSummary;
  error?: string;
  onOpen: () => void;
}) {
  if (!review?.isGitRepository || review.files.length === 0) return null;
  const title = gitEditSummaryBadgeTitle(review, error);
  return (
    <button type="button" className="git-edit-badge" data-tooltip={title} aria-label="Open Git summary" onClick={onOpen}>
      <span className="addition">+{review.additions}</span>
      <span className="deletion">-{review.deletions}</span>
      <PanelRight size={16} />
    </button>
  );
}

export function gitEditSummaryBadgeTitle(
  review: Pick<GitReviewSummary, "files" | "branch">,
  error?: string,
): string {
  return error
    ? `Git review may be stale: ${error}`
    : `${review.files.length} ${review.files.length === 1 ? "file" : "files"} changed on ${review.branch}`;
}
