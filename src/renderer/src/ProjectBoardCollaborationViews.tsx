import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  GitBranch,
} from "lucide-react";

import type { ProjectBoardGitProjectionResolution, ProjectBoardGitSyncStatus } from "../../shared/projectBoardTypes";
import {
  projectBoardCollaborationReadiness,
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
} from "./projectBoardCollaborationUiModel";

export function ProjectBoardGitSyncControls({
  status,
  error,
  busy,
  projectionResolutionState,
  onAction,
}: {
  status?: ProjectBoardGitSyncStatus;
  error?: string;
  busy?: "export" | "commit" | "push" | "pull" | "apply";
  projectionResolutionState?: ReturnType<typeof projectBoardProjectionReviewResolutionState>;
  onAction: (action: "export" | "commit" | "push" | "pull" | "apply") => void;
}) {
  const isGit = status?.isGitRepository ?? false;
  const hasRemote = status?.hasRemote ?? false;
  const dirtyCount = status?.dirtyBoardFileCount ?? 0;
  const projection = status?.projection;
  const label = error
    ? "Board Git error"
    : !status
      ? "Checking board Git"
      : !isGit
        ? "Local board"
        : dirtyCount > 0
          ? `${dirtyCount} board change${dirtyCount === 1 ? "" : "s"}`
          : "Board Git clean";
  const title = error
    ? error
    : status
      ? [
          status.message,
          status.branch ? `Branch: ${status.branch}` : "",
          status.remote ? `Remote: ${status.remote}` : "",
          status.lastBoardCommit ? `Last board commit: ${status.lastBoardCommit.shortHash} ${status.lastBoardCommit.subject}` : "",
          projection
            ? `Projection: ${projection.valid ? (projection.ok ? "matches current board" : `${projection.differenceCount} difference(s)`) : "invalid"}`
            : "",
          projection?.valid
            ? `Claims: ${projection.activeClaimCount ?? 0} active, ${projection.expiredClaimCount ?? 0} expired, ${projection.claimConflictCount ?? 0} conflict(s)`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "Checking whether this board can sync through Git.";
  const projectionConflictCount = projection?.conflictCount ?? 0;
  const resolvedConflictApply = Boolean(projectionResolutionState && projectionConflictCount > 0 && projectionResolutionState.canApply);
  const canApplyProjection = Boolean(projection?.valid && !projection.ok && (projectionConflictCount === 0 || resolvedConflictApply));
  return (
    <div className="project-board-git-sync" aria-label="Project board Git sync">
      <span className={`project-board-status ${error || projection?.ok === false ? "warning" : ""}`} title={title}>
        <GitBranch size={13} />
        <span>{label}</span>
      </span>
      <button
        type="button"
        className="secondary-button"
        disabled={Boolean(busy)}
        title="Export the current board to deterministic .ambient/board artifacts without committing."
        onClick={() => onAction("export")}
      >
        <Download size={14} className={busy === "export" ? "spin" : ""} />
        <span>{busy === "export" ? "Exporting" : "Export Board"}</span>
      </button>
      <button
        type="button"
        className="secondary-button"
        disabled={Boolean(busy) || !isGit}
        title={isGit ? "Export, stage only .ambient/board, and commit board artifacts." : "Initialize Git for this project before committing board artifacts."}
        onClick={() => onAction("commit")}
      >
        <CheckCircle2 size={14} className={busy === "commit" ? "spin" : ""} />
        <span>{busy === "commit" ? "Committing" : "Commit Board"}</span>
      </button>
      <button
        type="button"
        className="secondary-button"
        disabled={Boolean(busy) || !isGit || !hasRemote}
        title={hasRemote ? "Push committed board artifacts to the configured Git remote." : "Configure an origin remote before pushing board artifacts."}
        onClick={() => onAction("push")}
      >
        <ChevronRight size={14} className={busy === "push" ? "spin" : ""} />
        <span>{busy === "push" ? "Pushing" : "Push Board"}</span>
      </button>
      <button
        type="button"
        className="secondary-button"
        disabled={Boolean(busy) || !isGit || !hasRemote}
        title={hasRemote ? "Pull board artifacts with a fast-forward Git pull, then validate the local projection." : "Configure an origin remote before pulling board artifacts."}
        onClick={() => onAction("pull")}
      >
        <ChevronLeft size={14} className={busy === "pull" ? "spin" : ""} />
        <span>{busy === "pull" ? "Pulling" : "Pull Board"}</span>
      </button>
      <button
        type="button"
        className="secondary-button"
        disabled={Boolean(busy) || !canApplyProjection}
        title={
          projection?.valid === false
            ? "The pulled board projection is invalid; fix .ambient/board before applying."
            : projectionConflictCount > 0
              ? projectionResolutionState?.applyTitle ?? `${projectionConflictCount} card-level conflict${projectionConflictCount === 1 ? "" : "s"} must be resolved before applying.`
            : canApplyProjection
              ? "Replace the local board with the validated pulled .ambient/board projection after confirmation."
              : "Pull a changed board projection before applying it locally."
        }
        onClick={() => onAction("apply")}
      >
        <ClipboardPaste size={14} className={busy === "apply" ? "spin" : ""} />
        <span>{busy === "apply" ? "Applying" : resolvedConflictApply ? "Apply Resolved Pull" : "Apply Pulled Board"}</span>
      </button>
    </div>
  );
}

export function ProjectBoardCollaborationReadinessPanel({ status, error }: { status?: ProjectBoardGitSyncStatus; error?: string }) {
  const readiness = projectBoardCollaborationReadiness(status, error);
  const icon =
    readiness.tone === "ready" ? (
      <CheckCircle2 size={14} />
    ) : readiness.tone === "danger" ? (
      <AlertCircle size={14} />
    ) : (
      <GitBranch size={14} />
    );
  const statusClass = readiness.tone === "danger" ? "danger" : readiness.tone === "warning" ? "warning" : readiness.tone === "ready" ? "ready" : "";
  const title = [readiness.detail, readiness.actionHint].filter(Boolean).join("\n");
  return (
    <section className={`project-board-collaboration-readiness ${readiness.tone}`} aria-label="Project board collaboration readiness">
      <div className="project-board-collaboration-readiness-main">
        <span className={`project-board-status ${statusClass}`} title={title}>
          {icon}
          <span>{readiness.label}</span>
        </span>
        <div>
          <h3>{readiness.headline}</h3>
          <p>{readiness.detail}</p>
        </div>
      </div>
      <div className="project-board-collaboration-readiness-meta" aria-label="Collaboration facts">
        <span title="Current Git collaboration mode for this board.">{readiness.modeLabel}</span>
        <span title="Whether the deterministic .ambient/board projection matches the current local board.">{readiness.projectionSummary}</span>
        <span title="Current Git-backed card ownership summary.">{readiness.claimSummary}</span>
      </div>
      <p className="project-board-collaboration-readiness-hint">{readiness.actionHint}</p>
    </section>
  );
}

export function ProjectBoardProjectionReviewPanel({
  status,
  error,
  resolutions = {},
  onResolve,
}: {
  status?: ProjectBoardGitSyncStatus;
  error?: string;
  resolutions?: Record<string, ProjectBoardGitProjectionResolution | undefined>;
  onResolve?: (changeId: string, resolution: Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">) => void;
}) {
  const review = projectBoardProjectionReview(status, error);
  if (!review.visible) return null;
  const resolutionState = projectBoardProjectionReviewResolutionState(review, resolutions);
  const resolvedConflictById = new Map(resolutionState.resolvedConflicts.map((conflict) => [conflict.rowId, conflict]));
  return (
    <section className={`project-board-projection-review ${resolutionState.canApply ? "warning" : "danger"}`} aria-label="Pulled board projection review">
      <header>
        <div>
          <span className="project-board-kicker">Pull review</span>
          <h3>{review.headline}</h3>
          <p>{review.summary}</p>
          {resolutionState.conflictCount > 0 && (
            <p>
              {resolutionState.resolvedConflictCount} of {resolutionState.conflictCount} blocking conflict{resolutionState.conflictCount === 1 ? "" : "s"} resolved for this apply.
            </p>
          )}
          <p className="project-board-projection-apply-impact">{resolutionState.applyImpact}</p>
        </div>
        <span className={`project-board-status ${resolutionState.canApply ? "warning" : "danger"}`} title={resolutionState.applyTitle}>
          {resolutionState.canApply ? <ClipboardPaste size={13} /> : <AlertCircle size={13} />}
          <span>{resolutionState.canApply ? "Review before apply" : "Cannot apply"}</span>
        </span>
      </header>
      <ul className="project-board-projection-review-list">
        {review.rows.map((row) => {
          const resolvedConflict = resolvedConflictById.get(row.id);
          return (
            <li key={row.id} className={`project-board-projection-review-item ${row.kind} ${row.tone}`}>
              <span className={`project-board-projection-review-kind ${row.kind}`}>{projectBoardProjectionReviewKindLabel(row.kind)}</span>
              <div>
                <strong>
                  {projectBoardProjectionReviewActionLabel(row.action)} {row.label}
                </strong>
                <p>{row.detail}</p>
                {row.conflict && row.conflictReason && <p><strong>Conflict:</strong> {row.conflictReason}</p>}
                <p><strong>Apply:</strong> {row.applyConsequence}</p>
                <p><strong>Keep local:</strong> {row.keepLocalConsequence}</p>
                <p><strong>Defer:</strong> {row.deferConsequence}</p>
                {(row.localStatus || row.pulledStatus) && (
                  <p>
                    <strong>Status:</strong> {row.localStatus ?? "missing locally"} → {row.pulledStatus ?? "missing in pull"}
                  </p>
                )}
                {resolvedConflict && (
                  <p className={`project-board-projection-resolution-note ${resolvedConflict.exportsLocalOverlay ? "overlay" : ""}`}>
                    <strong>Decision: {resolvedConflict.resolutionLabel}</strong> {resolvedConflict.consequence}
                  </p>
                )}
                {row.conflict && row.kind === "card" && onResolve && (
                  <div className="project-board-projection-resolution-actions" aria-label={`Resolve pull conflict for ${row.label}`}>
                    {(["apply_pulled", "keep_local", "defer"] as const).map((resolution) => (
                      <button
                        key={resolution}
                        type="button"
                        className={`secondary-button mini ${resolutions[row.id] === resolution ? "primary" : ""}`}
                        title={projectBoardProjectionResolutionTitle(resolution, row.label)}
                        aria-pressed={resolutions[row.id] === resolution}
                        onClick={() => onResolve(row.id, resolution)}
                      >
                        {projectBoardProjectionResolutionLabel(resolution)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {review.overflowCount > 0 && (
        <p className="project-board-projection-review-more">
          {review.overflowCount} more projection difference{review.overflowCount === 1 ? "" : "s"} are summarized in the Git status tooltip.
        </p>
      )}
    </section>
  );
}

export function projectBoardProjectionResolutionLabel(resolution?: ProjectBoardGitProjectionResolution): string {
  if (resolution === "apply_pulled") return "Apply pulled";
  if (resolution === "keep_local") return "Keep local";
  if (resolution === "defer") return "Defer";
  return "No decision";
}

export function projectBoardProjectionResolutionTitle(resolution: Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">, label: string): string {
  if (resolution === "apply_pulled") return `Accept the pulled version of ${label}; local card fields may be overwritten.`;
  if (resolution === "keep_local") return `Keep this desktop's ${label} and export the merged board projection after applying other pulled changes.`;
  return `Leave ${label} unchanged for now while applying other non-conflicting pulled changes.`;
}

export function projectBoardProjectionReviewActionLabel(action: "add" | "remove" | "update" | "invalid"): string {
  if (action === "add") return "Add";
  if (action === "remove") return "Remove";
  if (action === "invalid") return "Invalid";
  return "Update";
}

export function projectBoardProjectionReviewKindLabel(kind: "board" | "charter" | "source" | "card" | "event" | "proposal" | "runtime" | "other"): string {
  if (kind === "runtime") return "Proof";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
