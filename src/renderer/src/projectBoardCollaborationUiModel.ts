import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardGitProjectionChange, ProjectBoardGitProjectionResolution, ProjectBoardGitSyncStatus } from "../../shared/types";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";

type ProjectBoardTabId = "overview" | "board" | "map" | "proof" | "integration" | "charter" | "decisions" | "draft_inbox" | "history";
type ProjectBoardOverviewTone = "ready" | "warning" | "danger" | "neutral";
interface ProjectBoardOverviewMetric {
  label: string;
  value: number | string;
  title?: string;
}
type ProjectBoardExecutionReadinessTone = "ready" | "warning" | "danger" | "neutral";
type ProjectBoardExecutionReadinessBlockerKind =
  | "draft_board"
  | "planning_running"
  | "decision_blocked"
  | "needs_source_synthesis"
  | "needs_ticketization"
  | "missing_workflow"
  | "invalid_workflow"
  | "auto_dispatch_disabled"
  | "git_unavailable"
  | "git_unborn"
  | "local_only"
  | "git_no_remote"
  | "projection_invalid"
  | "projection_drift"
  | "remote_updates"
  | "unpublished_board_changes"
  | "claim_conflict"
  | "ready_not_prepared"
  | "start_prepared_run"
  | "active_run"
  | "proof_review"
  | "blocked_run"
  | "integration_pending"
  | "none";
export interface ProjectBoardExecutionReadinessNotice {
  tone: ProjectBoardExecutionReadinessTone;
  blockerKind: ProjectBoardExecutionReadinessBlockerKind;
  headline: string;
  detail: string;
  actionHint: string;
}

function projectBoardRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function projectBoardStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function projectBoardPlural(count: number): string {
  return count === 1 ? "" : "s";
}

export type ProjectBoardCardClaimAction = "claim" | "release" | "expire" | "resolve_conflict" | "force_release";

export interface ProjectBoardCardClaimActionState {
  action: ProjectBoardCardClaimAction;
  label: string;
  title: string;
  disabled: boolean;
  tone: "primary" | "secondary" | "danger";
}

export type ProjectBoardCollaborationReadinessTone = "neutral" | "ready" | "warning" | "danger";

export interface ProjectBoardCollaborationReadiness {
  label: string;
  headline: string;
  detail: string;
  actionHint: string;
  modeLabel: string;
  projectionSummary: string;
  claimSummary: string;
  tone: ProjectBoardCollaborationReadinessTone;
  canCollaborate: boolean;
  needsAttention: boolean;
}

export type ProjectBoardProjectionReviewChangeKind = "board" | "charter" | "source" | "card" | "event" | "proposal" | "runtime" | "other";
export type ProjectBoardProjectionReviewChangeAction = "add" | "remove" | "update" | "invalid";

export interface ProjectBoardProjectionReviewChange {
  id: string;
  kind: ProjectBoardProjectionReviewChangeKind;
  action: ProjectBoardProjectionReviewChangeAction;
  entityId?: string;
  label: string;
  detail: string;
  tone: "neutral" | "warning" | "danger";
  conflict: boolean;
  conflictReason?: string;
  recommendedResolution?: ProjectBoardGitProjectionResolution;
  applyConsequence: string;
  keepLocalConsequence: string;
  deferConsequence: string;
  changedFields?: string[];
  localStatus?: string;
  pulledStatus?: string;
}

export type ProjectBoardProjectionReviewResolutionMap = Record<string, ProjectBoardGitProjectionResolution | undefined>;

export interface ProjectBoardProjectionReviewResolutionState {
  conflictCount: number;
  resolvedConflictCount: number;
  canApply: boolean;
  applyTitle: string;
  applyImpact: string;
  unresolvedLabels: string[];
  resolvedConflicts: ProjectBoardProjectionReviewResolvedConflict[];
}

export interface ProjectBoardProjectionReviewResolvedConflict {
  rowId: string;
  label: string;
  resolution: Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">;
  resolutionLabel: string;
  consequence: string;
  exportsLocalOverlay: boolean;
}

export interface ProjectBoardProjectionReview {
  visible: boolean;
  headline: string;
  summary: string;
  applyTitle: string;
  canApply: boolean;
  rows: ProjectBoardProjectionReviewChange[];
  overflowCount: number;
  conflictCount: number;
}

export interface ProjectBoardHistoryCollaborationAuditItem {
  id: string;
  title: string;
  detail: string;
  tone: ProjectBoardOverviewTone;
  statusLabel: string;
  actionLabel: string;
  tabId: ProjectBoardTabId;
  metrics: ProjectBoardOverviewMetric[];
}

export interface ProjectBoardHistoryCollaborationAuditModel {
  visible: boolean;
  headline: string;
  detail: string;
  tone: ProjectBoardOverviewTone;
  metrics: ProjectBoardOverviewMetric[];
  items: ProjectBoardHistoryCollaborationAuditItem[];
}

export function projectBoardCardClaimBlocksLocalTicketization(card: ProjectBoardCard): boolean {
  if ((card.claimConflicts?.length ?? 0) > 0) return true;
  return card.claim?.status === "active" && card.claim.ownedByLocal !== true;
}

export function projectBoardCardClaimLabel(card: ProjectBoardCard): string | undefined {
  const conflictCount = card.claimConflicts?.length ?? 0;
  if (conflictCount > 0) return `${conflictCount} claim conflict${conflictCount === 1 ? "" : "s"}`;
  if (!card.claim) return undefined;
  if (card.claim.status === "expired") return `Expired claim from ${card.claim.displayName || card.claim.agentId}`;
  if (card.claim.ownedByLocal) return "Claimed here";
  return `Claimed by ${card.claim.displayName || card.claim.agentId}`;
}

export function projectBoardCardClaimTitle(card: ProjectBoardCard): string | undefined {
  if ((card.claimConflicts?.length ?? 0) > 0) {
    const owner = card.claim ? `${card.claim.displayName || card.claim.agentId} (${card.claim.runId})` : "No active winning claim";
    const conflicts = projectBoardCardClaimConflictDetails(card);
    return `This card has competing Git claim events. Current winning owner: ${owner}. Conflicting claim${card.claimConflicts?.length === 1 ? "" : "s"}: ${conflicts}. Resolve the conflict to record expiry events for the later losing claims before ticketizing or executing it.`;
  }
  if (!card.claim) return undefined;
  const owner = card.claim.ownedByLocal ? "this desktop" : card.claim.displayName || card.claim.agentId;
  if (card.claim.status === "expired") {
    const lease = formattedClaimLease(card.claim.leaseUntil, "Lease expired");
    const recorded = card.claim.expirationRecorded
      ? " The stale claim has been recorded in the board audit history."
      : " Record the expiry before reclaiming so collaborators can see why ownership changed.";
    return `Previous claim by ${owner} is no longer active.${lease}${recorded}`;
  }
  const lease = formattedClaimLease(card.claim.leaseUntil, "Lease expires");
  return `Card is claimed by ${owner}.${lease}`;
}

function formattedClaimLease(leaseUntil: string | undefined, prefix: string): string {
  if (!leaseUntil) return "";
  const date = new Date(leaseUntil);
  // Hand-edited or older git-synced boards can carry malformed timestamps; render
  // nothing rather than "Lease expires Invalid Date".
  if (Number.isNaN(date.getTime())) return "";
  return ` ${prefix} ${date.toLocaleString()}.`;
}

export function projectBoardCardClaimActionState(
  card: ProjectBoardCard,
  gitStatus?: ProjectBoardGitSyncStatus,
  busy = false,
): ProjectBoardCardClaimActionState {
  const gitReady = Boolean(gitStatus?.isGitRepository && gitStatus.hasRemote);
  const projectionReady = Boolean(gitStatus?.projection?.valid && gitStatus.projection.ok);
  const unavailableTitle = !gitStatus
    ? "Board Git sync status is still loading."
    : !gitReady
      ? "Claim controls require this project to be in a Git repo with an origin remote."
      : !projectionReady
        ? "Export, commit, pull, or apply the current .ambient/board projection before claiming cards."
        : "";
  const disabledByGit = Boolean(unavailableTitle);
  if ((card.claimConflicts?.length ?? 0) > 0) {
    return {
      action: "resolve_conflict",
      label: busy ? "Resolving Conflict" : "Resolve Conflict",
      title: disabledByGit
        ? unavailableTitle
        : "Resolve competing claims by recording card.claim_expired audit events for later losing claim runs. The earliest still-active claim remains the owner.",
      disabled: busy || disabledByGit,
      tone: "danger",
    };
  }
  if (card.claim?.status === "expired") {
    if (card.claim.expirationRecorded) {
      return {
        action: "claim",
        label: busy ? "Reclaiming Card" : "Reclaim Card",
        title: disabledByGit ? unavailableTitle : "Claim this card now that the stale ownership lease has been recorded as expired.",
        disabled: busy || disabledByGit,
        tone: "primary",
      };
    }
    return {
      action: "expire",
      label: busy ? "Recording Expiry" : "Record Expiry",
      title: disabledByGit ? unavailableTitle : "Record a card.claim_expired audit event for this stale ownership lease before reclaiming the card.",
      disabled: busy || disabledByGit,
      tone: "secondary",
    };
  }
  if (card.claim?.ownedByLocal) {
    return {
      action: "release",
      label: busy ? "Releasing Claim" : "Release Claim",
      title: disabledByGit ? unavailableTitle : "Release this desktop's Git claim so another desktop can work the card.",
      disabled: busy || disabledByGit,
      tone: "secondary",
    };
  }
  if (card.claim) {
    return {
      action: "force_release",
      label: busy ? "Releasing Claim" : "Force Release",
      title: disabledByGit
        ? unavailableTitle
        : `Force-release ${card.claim.displayName || card.claim.agentId}'s claim with an audit event. Use this only when the owner is stale or blocked.`,
      disabled: busy || disabledByGit,
      tone: "danger",
    };
  }
  return {
    action: "claim",
    label: busy ? "Claiming Card" : "Claim Card",
    title: disabledByGit ? unavailableTitle : "Claim this card through Git before ticketizing or executing it from this desktop.",
    disabled: busy || disabledByGit,
    tone: "primary",
  };
}

function projectBoardCardClaimConflictDetails(card: ProjectBoardCard): string {
  const conflicts = card.claimConflicts ?? [];
  if (conflicts.length === 0) return "none";
  const labels = conflicts.slice(0, 3).map((claim) => `${claim.displayName || claim.agentId} (${claim.runId})`);
  const overflow = conflicts.length > labels.length ? `, plus ${conflicts.length - labels.length} more` : "";
  return `${labels.join(", ")}${overflow}`;
}

export function projectBoardCollaborationReadiness(status?: ProjectBoardGitSyncStatus, error?: string): ProjectBoardCollaborationReadiness {
  if (error) {
    return {
      label: "Board Git error",
      headline: "Collaboration status unavailable",
      detail: error,
      actionHint: "Fix the Git or board artifact error, then refresh the board status.",
      modeLabel: "Error",
      projectionSummary: "Projection unavailable",
      claimSummary: "Claims unavailable",
      tone: "danger",
      canCollaborate: false,
      needsAttention: true,
    };
  }

  if (!status) {
    return {
      label: "Checking",
      headline: "Checking board collaboration",
      detail: "Ambient is checking whether this project board has Git-backed artifacts, a remote, and a valid board projection.",
      actionHint: "Status will update when the board check completes.",
      modeLabel: "Checking",
      projectionSummary: "Projection pending",
      claimSummary: "Claims pending",
      tone: "neutral",
      canCollaborate: false,
      needsAttention: false,
    };
  }

  const projection = status.projection;
  const dirtyCount = status.dirtyBoardFileCount;
  const activeClaims = projection?.activeClaimCount ?? 0;
  const expiredClaims = projection?.expiredClaimCount ?? 0;
  const claimConflicts = projection?.claimConflictCount ?? 0;
  const canCollaborate = status.isGitRepository && status.hasRemote && projection?.valid === true && projection.ok && claimConflicts === 0;
  const modeLabel = !status.isGitRepository
    ? "Local only"
    : !status.hasRemote
      ? "Git, no remote"
      : status.upstream
        ? `Git remote: ${status.upstream}`
        : status.remote
          ? `Git remote: ${status.remote}`
          : "Git remote ready";
  const projectionSummary = !projection
    ? "Projection not exported"
    : !projection.valid
      ? "Projection invalid"
      : projection.ok
        ? `${projection.cardCount} cards synced`
        : `${projection.differenceCount} projection difference${projectBoardPlural(projection.differenceCount)}`;
  const claimSummary = !projection
    ? "Claims unavailable until export"
    : claimConflicts > 0
      ? `${claimConflicts} claim conflict${projectBoardPlural(claimConflicts)}`
      : `${activeClaims} active claim${projectBoardPlural(activeClaims)}${expiredClaims > 0 ? `, ${expiredClaims} expired` : ""}`;

  if (!status.isGitRepository) {
    return {
      label: "Local only",
      headline: "Local-only board",
      detail: "This board can be planned and executed on this desktop, but other Ambient instances cannot coordinate ownership until the project is in Git.",
      actionHint: "Initialize Git for the project, export board artifacts, and add a remote before multi-desktop collaboration.",
      modeLabel,
      projectionSummary,
      claimSummary,
      tone: "warning",
      canCollaborate: false,
      needsAttention: true,
    };
  }

  if (!status.hasRemote) {
    return {
      label: "Git, no remote",
      headline: "Git exists, but collaboration is local",
      detail: "Board artifacts can be committed locally, but claim ownership and handoffs will not reach other desktops without a shared remote.",
      actionHint: "Add an origin remote, commit the board artifacts, then push the board state.",
      modeLabel,
      projectionSummary,
      claimSummary,
      tone: "warning",
      canCollaborate: false,
      needsAttention: true,
    };
  }

  if (projection && !projection.valid) {
    return {
      label: "Projection invalid",
      headline: "Pulled board projection is invalid",
      detail: "The .ambient/board files do not validate, so Ambient will not apply them or trust claim ownership from them.",
      actionHint: "Inspect the board artifact error, pull a clean projection, or export the current board again.",
      modeLabel,
      projectionSummary,
      claimSummary,
      tone: "danger",
      canCollaborate: false,
      needsAttention: true,
    };
  }

  if (claimConflicts > 0) {
    return {
      label: "Claim conflicts",
      headline: "Card ownership needs attention",
      detail: "At least one card has conflicting ownership events in the Git projection, so automatic low-intervention execution should pause for review.",
      actionHint: "Pull the latest board artifacts, apply the validated projection, then release or force-release stale claims as needed.",
      modeLabel,
      projectionSummary,
      claimSummary,
      tone: "danger",
      canCollaborate: false,
      needsAttention: true,
    };
  }

  if (projection && !projection.ok) {
    return {
      label: "Board drift",
      headline: "Pulled board differs from local state",
      detail: `${projection.differenceCount} board projection difference${projectBoardPlural(projection.differenceCount)} ${projection.differenceCount === 1 ? "needs" : "need"} review before this desktop can safely coordinate with others.`,
      actionHint: "Use Apply Pulled Board to accept the validated projection, or export and commit the local board if this desktop should be authoritative.",
      modeLabel,
      projectionSummary,
      claimSummary,
      tone: "warning",
      canCollaborate: false,
      needsAttention: true,
    };
  }

  if (status.behind > 0) {
    return {
      label: "Remote updates",
      headline: "Remote board updates are waiting",
      detail: `This branch is ${status.behind} commit${projectBoardPlural(status.behind)} behind its upstream, so card ownership may be stale.`,
      actionHint: "Pull board artifacts and apply the validated projection before claiming or executing more cards.",
      modeLabel,
      projectionSummary,
      claimSummary,
      tone: "warning",
      canCollaborate: false,
      needsAttention: true,
    };
  }

  if (dirtyCount > 0 || status.ahead > 0) {
    const parts = [
      dirtyCount > 0 ? `${dirtyCount} board artifact change${projectBoardPlural(dirtyCount)}` : "",
      status.ahead > 0 ? `${status.ahead} unpushed commit${projectBoardPlural(status.ahead)}` : "",
    ].filter(Boolean);
    return {
      label: "Unpublished changes",
      headline: "Collaboration ready with unpublished board work",
      detail: `${parts.join(" and ")} should be shared before another desktop relies on this board state.`,
      actionHint: dirtyCount > 0 ? "Commit and push the board artifacts when the current changes are ready." : "Push the board commits to share them with other desktops.",
      modeLabel,
      projectionSummary,
      claimSummary,
      tone: "warning",
      canCollaborate,
      needsAttention: true,
    };
  }

  return {
    label: "Collaboration ready",
    headline: "Git collaboration is ready",
    detail: "This board has a Git remote, a valid projection, and no detected board drift or claim conflicts.",
    actionHint: "Cards can be claimed and handed off through board artifacts; commit and push new board changes as work progresses.",
    modeLabel,
    projectionSummary,
    claimSummary,
    tone: "ready",
    canCollaborate: true,
    needsAttention: false,
  };
}

export function projectBoardCollaborationExecutionNotice(status?: ProjectBoardGitSyncStatus, error?: string): ProjectBoardExecutionReadinessNotice | undefined {
  const readiness = projectBoardCollaborationReadiness(status, error);
  if (!readiness.needsAttention) return undefined;
  const projection = status?.projection;
  const blockerKind: ProjectBoardExecutionReadinessBlockerKind = error
    ? "git_unavailable"
    : !status?.isGitRepository
      ? "local_only"
      : !status.hasRemote
        ? "git_no_remote"
        : projection && !projection.valid
          ? "projection_invalid"
          : (projection?.claimConflictCount ?? 0) > 0
            ? "claim_conflict"
            : projection && !projection.ok
              ? "projection_drift"
              : status.behind > 0
                ? "remote_updates"
                : status.dirtyBoardFileCount > 0 || status.ahead > 0
                  ? "unpublished_board_changes"
                  : "none";
  if (blockerKind === "none") return undefined;
  return {
    tone: readiness.tone === "danger" ? "danger" : "warning",
    blockerKind,
    headline: readiness.headline,
    detail: readiness.detail,
    actionHint: readiness.actionHint,
  };
}

export function projectBoardProjectionReview(status?: ProjectBoardGitSyncStatus, error?: string): ProjectBoardProjectionReview {
  const hidden = {
    visible: false,
    headline: "",
    summary: "",
    applyTitle: "No pulled board projection needs review.",
    canApply: false,
    rows: [],
    overflowCount: 0,
    conflictCount: 0,
  };
  if (error || !status?.projection) return hidden;
  const projection = status.projection;
  if (projection.valid && projection.ok) return hidden;
  const differenceRows =
    projection.changes?.map((change, index) => projectBoardProjectionReviewChangeFromStructured(change, index)) ??
    projection.differences.map((difference, index) => projectBoardProjectionReviewChangeFromDifference(difference, index, projection.valid));
  const rows =
    differenceRows.length > 0
      ? differenceRows
      : [
          {
            id: "projection-invalid",
            kind: "other" as const,
            action: "invalid" as const,
            label: projection.valid ? "Projection difference" : "Invalid projection",
            detail: projection.valid ? "The pulled board differs from the local board, but no detailed difference was reported." : "The pulled board artifacts failed validation.",
            tone: projection.valid ? ("warning" as const) : ("danger" as const),
            conflict: false,
            applyConsequence: projection.valid ? "Apply the pulled board projection." : "Cannot apply invalid board artifacts.",
            keepLocalConsequence: "Keep this desktop's current board state.",
            deferConsequence: "Leave the pull unapplied until the projection validates.",
          },
        ];
  const overflowCount = Math.max(0, projection.differenceCount - projection.differences.length);
  const count = projection.differenceCount || rows.length;
  const conflictCount = projection.conflictCount ?? rows.filter((row) => row.conflict).length;
  if (!projection.valid) {
    return {
      visible: true,
      headline: "Pulled board cannot be applied",
      summary: "Ambient found an invalid .ambient/board projection. The local board will stay unchanged until the artifacts validate.",
      applyTitle: "Fix the invalid pulled board projection before applying it to SQLite.",
      canApply: false,
      rows,
      overflowCount,
      conflictCount,
    };
  }
  if (conflictCount > 0) {
    return {
      visible: true,
      headline: "Resolve pulled card conflicts before applying",
      summary: `${conflictCount} card-level conflict${projectBoardPlural(conflictCount)} could overwrite local execution, proof, or newer card work. Review the card consequences, then keep local, resolve artifacts, or retry pull after coordination.`,
      applyTitle: "Resolve blocking card conflicts before applying the pulled board projection.",
      canApply: false,
      rows,
      overflowCount,
      conflictCount,
    };
  }
  return {
    visible: true,
    headline: "Review pulled board changes before applying",
    summary: `${count} projection difference${projectBoardPlural(count)} would be reconciled. Applying replaces local board state with the validated pulled artifacts.`,
    applyTitle: "Apply the validated pulled board projection after reviewing the affected cards, events, sources, proof, and handoffs.",
    canApply: true,
    rows,
    overflowCount,
    conflictCount,
  };
}

export function projectBoardHistoryCollaborationAudit(status?: ProjectBoardGitSyncStatus, error?: string): ProjectBoardHistoryCollaborationAuditModel {
  const readiness = projectBoardCollaborationReadiness(status, error);
  const projectionReview = projectBoardProjectionReview(status, error);
  const projection = status?.projection;
  const readinessNeedsAttention = readiness.needsAttention || readiness.tone === "danger" || readiness.tone === "warning";
  const claimConflictCount = projection?.claimConflictCount ?? 0;
  const expiredClaimCount = projection?.expiredClaimCount ?? 0;
  const hasClaimLedgerAttention = claimConflictCount > 0 || expiredClaimCount > 0;
  const items: ProjectBoardHistoryCollaborationAuditItem[] = [];

  if (readinessNeedsAttention) {
    items.push({
      id: "collaboration-readiness",
      title: readiness.headline,
      detail: `${readiness.detail} ${readiness.actionHint}`,
      tone: projectBoardCollaborationOverviewTone(readiness.tone),
      statusLabel: readiness.label,
      actionLabel: projectBoardHistoryCollaborationReadinessActionLabel(status, error),
      tabId: "overview",
      metrics: [
        { label: "Mode", value: readiness.modeLabel },
        { label: "Projection", value: readiness.projectionSummary },
        { label: "Claims", value: readiness.claimSummary },
      ],
    });
  }

  if (projectionReview.visible) {
    const changeCount = projectionReview.rows.length + projectionReview.overflowCount;
    items.push({
      id: "projection-review",
      title: projectionReview.headline,
      detail: projectionReview.summary,
      tone: projectionReview.canApply ? "warning" : "danger",
      statusLabel: projectionReview.canApply ? "Review before apply" : "Cannot apply",
      actionLabel: projectionReview.canApply ? "Review Pull" : "Inspect Projection",
      tabId: "overview",
      metrics: [
        { label: "Changes", value: changeCount },
        { label: "Conflicts", value: projectionReview.conflictCount },
        { label: "Apply", value: projectionReview.canApply ? "Allowed" : "Blocked" },
      ],
    });
  }

  if (hasClaimLedgerAttention && readiness.label !== "Claim conflicts") {
    items.push({
      id: "claim-ledger",
      title: "Card claim ledger needs review",
      detail:
        claimConflictCount > 0
          ? `${claimConflictCount} card ownership conflict${projectBoardPlural(claimConflictCount)} must be resolved before low-intervention execution can safely continue.`
          : `${expiredClaimCount} expired claim${projectBoardPlural(expiredClaimCount)} should be released or refreshed so other desktops can trust card ownership.`,
      tone: claimConflictCount > 0 ? "danger" : "warning",
      statusLabel: claimConflictCount > 0 ? "Claim conflict" : "Expired claims",
      actionLabel: "Review Claims",
      tabId: "board",
      metrics: [
        { label: "Active", value: projection?.activeClaimCount ?? 0 },
        { label: "Expired", value: expiredClaimCount },
        { label: "Conflicts", value: claimConflictCount },
      ],
    });
  }

  const dedupedItems = projectBoardHistoryCollaborationAuditDedupeItems(items);
  const dangerCount = dedupedItems.filter((item) => item.tone === "danger").length;
  const warningCount = dedupedItems.filter((item) => item.tone === "warning").length;
  const visible = dedupedItems.length > 0;
  const tone: ProjectBoardOverviewTone = dangerCount > 0 ? "danger" : warningCount > 0 ? "warning" : visible ? "neutral" : "ready";
  return {
    visible,
    headline:
      dangerCount > 0
        ? `${dangerCount} collaboration blocker${dangerCount === 1 ? "" : "s"} in history`
        : warningCount > 0
          ? `${warningCount} collaboration warning${warningCount === 1 ? "" : "s"} in history`
          : "No collaboration blockers in history",
    detail: visible
      ? "History keeps Git, projection, and claim state attached to planner recovery records so execution failures and deferred runs are not interpreted without their sync context."
      : "History has no active Git, projection, or claim blockers to attach to recovery records.",
    tone,
    metrics: [
      { label: "Mode", value: readiness.modeLabel },
      { label: "Projection", value: readiness.projectionSummary },
      { label: "Claims", value: readiness.claimSummary },
      { label: "Items", value: dedupedItems.length },
    ],
    items: dedupedItems,
  };
}

function projectBoardCollaborationOverviewTone(tone: ProjectBoardCollaborationReadinessTone): ProjectBoardOverviewTone {
  if (tone === "ready" || tone === "warning" || tone === "danger") return tone;
  return "neutral";
}

function projectBoardHistoryCollaborationReadinessActionLabel(status?: ProjectBoardGitSyncStatus, error?: string): string {
  if (error) return "Refresh Status";
  if (!status?.isGitRepository || !status?.hasRemote) return "Review Setup";
  if (status.projection && !status.projection.valid) return "Inspect Projection";
  if ((status.projection?.claimConflictCount ?? 0) > 0) return "Review Claims";
  if (status.projection && !status.projection.ok) return "Review Pull";
  if (status.behind > 0) return "Pull Board";
  if (status.dirtyBoardFileCount > 0 || status.ahead > 0) return "Share Board";
  return "Open Overview";
}

function projectBoardHistoryCollaborationAuditDedupeItems(
  items: ProjectBoardHistoryCollaborationAuditItem[],
): ProjectBoardHistoryCollaborationAuditItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function projectBoardProjectionReviewResolutionState(
  review: ProjectBoardProjectionReview,
  resolutions: ProjectBoardProjectionReviewResolutionMap = {},
): ProjectBoardProjectionReviewResolutionState {
  const conflictRows = review.rows.filter((row) => row.conflict);
  if (!review.visible || conflictRows.length === 0) {
    return {
      conflictCount: 0,
      resolvedConflictCount: 0,
      canApply: review.canApply,
      applyTitle: review.applyTitle,
      applyImpact: review.canApply
        ? "Applying imports the validated pulled board artifacts into the local board projection."
        : review.applyTitle,
      unresolvedLabels: [],
      resolvedConflicts: [],
    };
  }
  const resolvedRows = conflictRows.filter((row) => {
    const resolution = resolutions[row.id];
    return resolution === "apply_pulled" || resolution === "keep_local" || resolution === "defer";
  });
  const resolvedConflicts = resolvedRows.map((row) => {
    const resolution = resolutions[row.id] as Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">;
    return {
      rowId: row.id,
      label: row.label,
      resolution,
      resolutionLabel: projectBoardProjectionResolutionText(resolution),
      consequence: projectBoardProjectionResolutionConsequence(row, resolution),
      exportsLocalOverlay: resolution === "keep_local",
    };
  });
  const unresolvedLabels = conflictRows.filter((row) => !resolvedRows.includes(row)).map((row) => row.label);
  const hiddenConflictCount = Math.max(0, review.conflictCount - conflictRows.length);
  const manuallyBlockedRows = conflictRows.filter((row) => row.recommendedResolution === "manual_resolution_required" && row.kind !== "card");
  if (manuallyBlockedRows.length > 0) {
    return {
      conflictCount: review.conflictCount,
      resolvedConflictCount: resolvedRows.length,
      canApply: false,
      applyTitle: `${manuallyBlockedRows.length} pulled board conflict${projectBoardPlural(manuallyBlockedRows.length)} require manual board selection or artifact repair before apply.`,
      applyImpact: `Cannot apply this projection automatically because ${manuallyBlockedRows.map((row) => row.label).join(", ")} require manual board-level resolution.`,
      unresolvedLabels: manuallyBlockedRows.map((row) => row.label),
      resolvedConflicts,
    };
  }
  const canApply = review.canApply || (review.visible && review.conflictCount > 0 && unresolvedLabels.length === 0 && hiddenConflictCount === 0);
  const nonConflictRows = review.rows.filter((row) => !row.conflict);
  const runtimeRows = nonConflictRows.filter((row) => row.kind === "runtime");
  const keepLocalCount = resolvedConflicts.filter((row) => row.exportsLocalOverlay).length;
  return {
    conflictCount: review.conflictCount,
    resolvedConflictCount: resolvedRows.length,
    canApply,
    applyTitle: canApply
      ? `Apply the pulled board projection with ${resolvedRows.length} explicit card conflict resolution${projectBoardPlural(resolvedRows.length)}. Keep-local decisions will be re-exported as local overlays.`
      : hiddenConflictCount > 0
        ? `${hiddenConflictCount} additional pulled-card conflict${projectBoardPlural(hiddenConflictCount)} are hidden by the preview limit. Resolve the board artifacts or refresh the pull review before applying.`
        : `${unresolvedLabels.length} card conflict${projectBoardPlural(unresolvedLabels.length)} still need Apply pulled, Keep local, or Defer decisions before applying.`,
    applyImpact: canApply
      ? [
          `Applying imports ${nonConflictRows.length} non-conflicting pulled board change${projectBoardPlural(nonConflictRows.length)}${runtimeRows.length ? `, including ${runtimeRows.length} proof/handoff runtime artifact${projectBoardPlural(runtimeRows.length)}` : ""}.`,
          `It also uses ${resolvedRows.length} explicit card conflict decision${projectBoardPlural(resolvedRows.length)}.`,
          keepLocalCount > 0
            ? `${keepLocalCount} Keep local decision${projectBoardPlural(keepLocalCount)} will preserve this desktop's card fields and re-export them to .ambient/board as local overlay${projectBoardPlural(keepLocalCount)} after apply.`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : hiddenConflictCount > 0
        ? `${hiddenConflictCount} hidden card conflict${projectBoardPlural(hiddenConflictCount)} must be reviewed before Ambient can safely apply this pull.`
        : `Choose Apply pulled, Keep local, or Defer for ${unresolvedLabels.length} card conflict${projectBoardPlural(unresolvedLabels.length)} before Ambient imports the pulled board artifacts.`,
    unresolvedLabels,
    resolvedConflicts,
  };
}

function projectBoardProjectionResolutionText(resolution: Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">): string {
  if (resolution === "apply_pulled") return "Apply pulled";
  if (resolution === "keep_local") return "Keep local";
  return "Defer";
}

function projectBoardProjectionResolutionConsequence(
  row: ProjectBoardProjectionReviewChange,
  resolution: Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">,
): string {
  if (resolution === "apply_pulled") return row.applyConsequence;
  if (resolution === "keep_local") {
    return `${row.keepLocalConsequence} Ambient will re-export this local card as an overlay after importing non-conflicting pulled artifacts.`;
  }
  return row.deferConsequence;
}

function projectBoardProjectionReviewChangeFromStructured(change: ProjectBoardGitProjectionChange, index: number): ProjectBoardProjectionReviewChange {
  const changedFields = change.changedFields?.slice(0, 8) ?? [];
  const fieldDetail = changedFields.length ? ` Changed fields: ${changedFields.join(", ")}${(change.changedFields?.length ?? 0) > changedFields.length ? ", ..." : ""}.` : "";
  return {
    id: change.id || `projection-change:${index}`,
    kind: change.kind,
    action: change.action,
    ...(change.entityId ? { entityId: change.entityId } : {}),
    label: change.title,
    detail: `${change.summary}${fieldDetail}`,
    tone: change.conflict ? "danger" : change.action === "remove" || change.action === "update" ? "warning" : "neutral",
    conflict: change.conflict,
    ...(change.conflictReason ? { conflictReason: change.conflictReason } : {}),
    recommendedResolution: change.recommendedResolution,
    applyConsequence: change.applyConsequence,
    keepLocalConsequence: change.keepLocalConsequence,
    deferConsequence: change.deferConsequence,
    ...(change.changedFields?.length ? { changedFields: change.changedFields } : {}),
    ...(change.local?.status ? { localStatus: change.local.status } : {}),
    ...(change.pulled?.status ? { pulledStatus: change.pulled.status } : {}),
  };
}

function projectBoardProjectionReviewChangeFromDifference(difference: string, index: number, valid: boolean): ProjectBoardProjectionReviewChange {
  const normalized = difference.trim();
  const addRemoveMatch = normalized.match(/^(missing|unexpected) (.+?)\.$/);
  if (addRemoveMatch) {
    const action = addRemoveMatch[1] === "unexpected" ? "add" : "remove";
    const item = addRemoveMatch[2];
    return {
      id: `${action}:${item}:${index}`,
      kind: projectBoardProjectionReviewKind(item),
      action,
      label: projectBoardProjectionReviewLabel(item),
      detail:
        action === "add"
          ? "The pulled board contains this item. Applying will add it to the local board projection."
          : "This local item is absent from the pulled board. Applying will remove it from the local board projection.",
      tone: action === "remove" ? "warning" : "neutral",
      conflict: false,
      applyConsequence:
        action === "add"
          ? "Apply will add this pulled item to the local board projection."
          : "Apply will remove this local item because it is absent from the pulled projection.",
      keepLocalConsequence: "Keep local by exporting and committing this desktop's board state instead of applying the pull.",
      deferConsequence: "Leave the pull unapplied until this difference is resolved.",
    };
  }

  const differsMatch = normalized.match(/^(.+?) differs\.$/);
  if (differsMatch) {
    const item = differsMatch[1];
    return {
      id: `update:${item}:${index}`,
      kind: projectBoardProjectionReviewKind(item),
      action: "update",
      label: projectBoardProjectionReviewLabel(item),
      detail: "The pulled board has different content for this item. Applying will replace the local copy with the pulled copy.",
      tone: "warning",
      conflict: false,
      applyConsequence: "Apply will replace the local copy with the pulled artifact.",
      keepLocalConsequence: "Keep local by exporting and committing this desktop's board state instead of applying the pull.",
      deferConsequence: "Leave the pull unapplied until this difference is resolved.",
    };
  }

  return {
    id: `difference:${index}`,
    kind: projectBoardProjectionReviewKind(normalized),
    action: valid ? "update" : "invalid",
    label: normalized || "Projection issue",
    detail: valid ? "The pulled projection differs from the local board." : "The pulled projection did not validate.",
    tone: valid ? "warning" : "danger",
    conflict: false,
    applyConsequence: valid ? "Apply will replace local board state with the pulled projection." : "Invalid projections cannot be applied.",
    keepLocalConsequence: "Keep this desktop's current board state.",
    deferConsequence: "Leave the pull unapplied until the projection can be reviewed.",
  };
}

function projectBoardProjectionReviewKind(value: string): ProjectBoardProjectionReviewChangeKind {
  const normalized = value.toLowerCase();
  if (normalized.includes("card")) return "card";
  if (normalized.includes("event")) return "event";
  if (normalized.includes("source")) return "source";
  if (normalized.includes("proposal")) return "proposal";
  if (normalized.includes("proof") || normalized.includes("handoff") || normalized.startsWith("run ")) return "runtime";
  if (normalized.includes("charter")) return "charter";
  if (normalized.includes("board config")) return "board";
  return "other";
}

function projectBoardProjectionReviewLabel(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
