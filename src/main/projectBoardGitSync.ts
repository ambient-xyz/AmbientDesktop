import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type {
  ProjectBoardGitProjectionChange,
  ProjectBoardGitProjectionResolutionDecision,
  ProjectBoardGitSyncStatus,
  ProjectBoardSummary,
} from "../shared/types";
import { PROJECT_BOARD_ARTIFACT_ROOT, boardEventArtifactPath, serializeBoardArtifact, type BoardEventArtifact } from "./projectBoardArtifacts";
import {
  projectBoardArtifactExportFromSummary,
  projectBoardCardArtifactPath,
  writeProjectBoardArtifactExport,
  type ProjectBoardRuntimeExportContext,
} from "./projectBoardArtifactExport";
import {
  compareProjectBoardSummaryToArtifactProjection,
  type ProjectBoardArtifactProjection,
  projectBoardArtifactProjectionWithResolvedConflicts,
  projectBoardArtifactProjectionFromFiles,
  readProjectBoardArtifactFiles,
} from "./projectBoardArtifactImport";
import {
  assertProjectBoardCardClaimAvailable,
  createProjectBoardClaimEvent,
  createProjectBoardClaimExpiredEvent,
  createProjectBoardClaimReleaseEvent,
  defaultProjectBoardClaimAgentId,
  projectBoardClaimProjectionFromEvents,
  type ProjectBoardClaim,
} from "./projectBoardClaims";

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 60_000;

// Board git operations mutate the same worktree files across await points, so two
// concurrent operations (e.g. git-commit while git-apply-pulled rewrites the export)
// can commit half-written artifacts or wipe edits without conflict detection. All
// mutating entry points serialize per project root through this promise chain.
// The chain is NOT reentrant: a locked function must never call another locked one.
const projectBoardGitOperationQueues = new Map<string, Promise<unknown>>();

export async function withProjectBoardGitOperationLock<T>(projectRoot: string, operation: () => Promise<T>): Promise<T> {
  const previous = projectBoardGitOperationQueues.get(projectRoot) ?? Promise.resolve();
  const next = previous.then(operation);
  const tail = next.catch(() => undefined);
  projectBoardGitOperationQueues.set(projectRoot, tail);
  try {
    return await next;
  } finally {
    if (projectBoardGitOperationQueues.get(projectRoot) === tail) projectBoardGitOperationQueues.delete(projectRoot);
  }
}

export interface ProjectBoardGitClaimInput {
  cardId: string;
  runId?: string;
  agentId?: string;
  appInstanceId?: string;
  workspaceBranch?: string;
  leaseMs?: number;
  now?: string;
}

export interface ProjectBoardGitClaimReleaseInput {
  cardId: string;
  runId?: string;
  agentId?: string;
  appInstanceId?: string;
  reason?: string;
  force?: boolean;
  now?: string;
}

export interface ProjectBoardGitSyncRuntimeOptions {
  runtime?: ProjectBoardRuntimeExportContext;
}

export interface ApplyProjectBoardGitProjectionOptions extends ProjectBoardGitSyncRuntimeOptions {
  resolutions?: ProjectBoardGitProjectionResolutionDecision[];
  applyProjection: (projectPath: string, projection: ProjectBoardArtifactProjection) => ProjectBoardSummary;
  exportLocalOverlays?: boolean;
}

export interface ApplyProjectBoardGitProjectionResult {
  appliedBoard: ProjectBoardSummary;
  conflictCount: number;
  localOverlayCount: number;
  projection: ProjectBoardArtifactProjection;
}

export async function getProjectBoardGitSyncStatus(
  board: ProjectBoardSummary,
  options: ProjectBoardGitSyncRuntimeOptions = {},
): Promise<ProjectBoardGitSyncStatus> {
  return projectBoardGitSyncStatus(board, options);
}

async function exportProjectBoardGitArtifactsUnlocked(
  board: ProjectBoardSummary,
  options: ProjectBoardGitSyncRuntimeOptions = {},
): Promise<ProjectBoardGitSyncStatus> {
  await writeProjectBoardArtifactExport(
    board.projectPath,
    projectBoardArtifactExportFromSummary(board, {
      projectName: projectNameFromPath(board.projectPath),
      exportedAt: new Date().toISOString(),
      runtime: options.runtime,
    }),
  );
  return projectBoardGitSyncStatus(board, { ...options, message: "Board artifacts exported to .ambient/board.", exported: true });
}

async function commitProjectBoardGitArtifactsUnlocked(
  board: ProjectBoardSummary,
  message?: string,
  options: ProjectBoardGitSyncRuntimeOptions = {},
): Promise<ProjectBoardGitSyncStatus> {
  await ensureGitRepository(board.projectPath);
  await writeProjectBoardArtifactExport(
    board.projectPath,
    projectBoardArtifactExportFromSummary(board, {
      projectName: projectNameFromPath(board.projectPath),
      exportedAt: new Date().toISOString(),
      runtime: options.runtime,
    }),
  );
  const dirty = await boardDirtyFiles(board.projectPath);
  if (dirty.length === 0) {
    return projectBoardGitSyncStatus(board, { ...options, message: "Board artifacts are already committed.", exported: true });
  }
  await gitOrThrow(board.projectPath, ["add", "--", PROJECT_BOARD_ARTIFACT_ROOT]);
  const commitMessage = safeCommitMessage(message, board);
  await gitOrThrow(board.projectPath, ["commit", "-m", commitMessage, "--", PROJECT_BOARD_ARTIFACT_ROOT], 60_000);
  return projectBoardGitSyncStatus(board, { ...options, message: `Committed board artifacts: ${commitMessage}`, exported: true });
}

async function pushProjectBoardGitArtifactsUnlocked(board: ProjectBoardSummary): Promise<ProjectBoardGitSyncStatus> {
  await ensureGitRepository(board.projectPath);
  const remote = await git(board.projectPath, ["remote", "get-url", "origin"]);
  if (!remote.ok || !remote.output.trim()) throw new Error("Board Git sync needs a configured origin remote before pushing.");
  await assertOnlyBoardCommitsAhead(board.projectPath);
  await pushCurrentBranch(board.projectPath);
  return projectBoardGitSyncStatus(board, { message: "Board artifacts pushed to the configured Git remote." });
}

// The "Push Board" UI promises to publish board artifacts only, but git push always
// publishes the whole branch. Refuse when unrelated unpushed commits would ride along —
// publishing someone's unfinished local work is outward-facing and not undoable.
// Claim pushes (commitAndPushBoardEvents) intentionally skip this check: claims must
// flow even on a branch that carries unrelated local commits.
async function assertOnlyBoardCommitsAhead(projectRoot: string): Promise<void> {
  const upstream = await git(projectRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (!upstream.ok) return; // first push publishes the branch explicitly
  const aheadList = await git(projectRoot, ["rev-list", "@{upstream}..HEAD"]);
  if (!aheadList.ok || !aheadList.output.trim()) return;
  const unrelated: string[] = [];
  for (const sha of aheadList.output.split(/\s+/).filter(Boolean).slice(0, 100)) {
    const files = await git(projectRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", sha]);
    const paths = files.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    // Empty path lists are merge or empty commits; treat them as board-safe.
    if (paths.length === 0 || paths.every((path) => path.startsWith(`${PROJECT_BOARD_ARTIFACT_ROOT}/`))) continue;
    const subject = await git(projectRoot, ["log", "-1", "--format=%h %s", sha]);
    unrelated.push(subject.output.trim() || sha.slice(0, 7));
    if (unrelated.length >= 4) break;
  }
  if (unrelated.length > 0) {
    throw new Error(
      [
        "Push Board only publishes .ambient/board artifacts, but this branch has unpushed commits with unrelated changes:",
        ...unrelated.map((commit) => `  ${commit}`),
        'Push them yourself with "git push" if intended, then retry Push Board.',
      ].join("\n"),
    );
  }
}

async function pullProjectBoardGitArtifactsUnlocked(board: ProjectBoardSummary): Promise<ProjectBoardGitSyncStatus> {
  await ensureGitRepository(board.projectPath);
  const remote = await git(board.projectPath, ["remote", "get-url", "origin"]);
  if (!remote.ok || !remote.output.trim()) throw new Error("Board Git sync needs a configured origin remote before pulling.");
  await gitOrThrow(board.projectPath, ["pull", "--ff-only"], 60_000);
  return projectBoardGitSyncStatus(board, { message: "Pulled and validated board artifacts from Git." });
}

export async function readProjectBoardGitArtifactProjection(board: ProjectBoardSummary): Promise<ProjectBoardArtifactProjection> {
  const files = await readProjectBoardArtifactFiles(board.projectPath);
  if (files.length === 0) throw new Error("No .ambient/board artifacts are available to apply.");
  const projection = projectBoardArtifactProjectionFromFiles(files);
  if (projection.config.boardId !== board.id) {
    throw new Error(`Pulled board artifacts belong to ${projection.config.boardId}, not the open board ${board.id}.`);
  }
  return projection;
}

async function applyProjectBoardGitProjectionUnlocked(
  board: ProjectBoardSummary,
  options: ApplyProjectBoardGitProjectionOptions,
): Promise<ApplyProjectBoardGitProjectionResult> {
  const projection = await readProjectBoardGitArtifactProjection(board);
  const diff = compareProjectBoardSummaryToArtifactProjection(board, projection, { runtime: options.runtime });
  const conflicts = diff.changes?.filter((change) => change.conflict) ?? [];
  let projectionToApply = projection;
  let localOverlayCount = 0;
  let deferredCardIds: string[] = [];

  if (conflicts.length > 0) {
    const resolved = projectBoardArtifactProjectionWithResolvedConflicts(board, projection, options.resolutions ?? [], {
      runtime: options.runtime,
    });
    projectionToApply = resolved.projection;
    localOverlayCount = resolved.localOverlayCount;
    deferredCardIds = resolved.deferredCardIds;
    if (resolved.unresolvedConflicts.length > 0) throw unresolvedProjectBoardGitProjectionConflictError(resolved.unresolvedConflicts);
  }

  const appliedBoard = options.applyProjection(board.projectPath, projectionToApply);
  if (localOverlayCount > 0 && options.exportLocalOverlays !== false) {
    // Deferred conflicts keep the pulled artifact on disk so they can be re-applied
    // later; rewriting them here would silently turn defer into keep_local.
    const skipPaths = new Set(deferredCardIds.map((cardId) => projectBoardCardArtifactPath(cardId)));
    await writeProjectBoardArtifactExport(
      board.projectPath,
      projectBoardArtifactExportFromSummary(appliedBoard, {
        projectName: projectNameFromPath(appliedBoard.projectPath),
        exportedAt: new Date().toISOString(),
        runtime: options.runtime,
      }),
      { skipPaths },
    );
  }
  return { appliedBoard, conflictCount: conflicts.length, localOverlayCount, projection: projectionToApply };
}

async function claimProjectBoardGitCardArtifactsUnlocked(
  board: ProjectBoardSummary,
  input: ProjectBoardGitClaimInput,
): Promise<ProjectBoardGitSyncStatus> {
  await ensureGitRepository(board.projectPath);
  const remote = await git(board.projectPath, ["remote", "get-url", "origin"]);
  if (!remote.ok || !remote.output.trim()) throw new Error("Board Git claims require a configured origin remote.");
  await gitOrThrow(board.projectPath, ["pull", "--ff-only"], 60_000);
  const projection = await readProjectBoardGitArtifactProjection(board);
  const card = projection.cards.find((candidate) => candidate.cardId === input.cardId);
  if (!card) throw new Error(`Project board card is not present in pulled artifacts: ${input.cardId}`);
  if (card.status !== "ready" && card.status !== "in_progress" && !(card.status === "draft" && card.candidateStatus === "ready_to_create")) {
    throw new Error(`Project board card ${card.title} is ${card.status}, not eligible to claim.`);
  }
  assertProjectBoardCardClaimAvailable(projection.events, input.cardId, { now: input.now });
  const baseCommit = await gitOrThrow(board.projectPath, ["rev-parse", "HEAD"]);
  const event = createProjectBoardClaimEvent({
    boardId: board.id,
    cardId: input.cardId,
    runId: input.runId,
    agentId: input.agentId ?? defaultProjectBoardClaimAgentId(),
    appInstanceId: input.appInstanceId,
    workspaceBranch: input.workspaceBranch,
    baseCommit,
    leaseMs: input.leaseMs,
    now: input.now,
  });
  await commitAndPushBoardEvent(board.projectPath, event, `Claim Ambient board card: ${card.title}`);
  return projectBoardGitSyncStatus(board, { message: `Claimed board card: ${card.title}` });
}

async function releaseProjectBoardGitCardClaimArtifactsUnlocked(
  board: ProjectBoardSummary,
  input: ProjectBoardGitClaimReleaseInput,
): Promise<ProjectBoardGitSyncStatus> {
  const { card, claim, agentId, baseCommit } = await prepareClaimMutation(board, input);
  if (claim.agentId !== agentId && input.force !== true) {
    throw new Error(`Project board card ${card.title} is claimed by ${claim.agentId}; only that desktop can release it unless force release is requested.`);
  }
  const event = createProjectBoardClaimReleaseEvent({
    boardId: board.id,
    cardId: input.cardId,
    runId: input.runId ?? claim.runId,
    agentId,
    appInstanceId: input.appInstanceId,
    baseCommit,
    reason: input.reason ?? (input.force ? "Force release requested from Ambient Desktop." : "Released from Ambient Desktop."),
    force: input.force === true,
    now: input.now,
  });
  await commitAndPushBoardEvent(board.projectPath, event, `Release Ambient board card claim: ${card.title}`);
  return projectBoardGitSyncStatus(board, { message: `Released board card claim: ${card.title}` });
}

async function expireProjectBoardGitCardClaimArtifactsUnlocked(
  board: ProjectBoardSummary,
  input: ProjectBoardGitClaimReleaseInput,
): Promise<ProjectBoardGitSyncStatus> {
  const { card, claim, agentId, baseCommit } = await prepareClaimMutation(board, input, { allowExpired: true });
  const now = input.now ?? new Date().toISOString();
  if (Date.parse(claim.leaseUntil) > Date.parse(now) && input.force !== true) {
    throw new Error(`Project board card ${card.title} claim is active until ${claim.leaseUntil}; wait for expiry or force release it.`);
  }
  const event = createProjectBoardClaimExpiredEvent({
    boardId: board.id,
    cardId: input.cardId,
    runId: input.runId ?? claim.runId,
    agentId,
    appInstanceId: input.appInstanceId,
    baseCommit,
    expiredClaimEventId: claim.eventId,
    now,
  });
  await commitAndPushBoardEvent(board.projectPath, event, `Expire Ambient board card claim: ${card.title}`);
  return projectBoardGitSyncStatus(board, { message: `Recorded expired board card claim: ${card.title}` });
}

async function resolveProjectBoardGitCardClaimConflictsArtifactsUnlocked(
  board: ProjectBoardSummary,
  input: ProjectBoardGitClaimReleaseInput,
): Promise<ProjectBoardGitSyncStatus> {
  await ensureGitRepository(board.projectPath);
  const remote = await git(board.projectPath, ["remote", "get-url", "origin"]);
  if (!remote.ok || !remote.output.trim()) throw new Error("Board Git claim actions require a configured origin remote.");
  await gitOrThrow(board.projectPath, ["pull", "--ff-only"], 60_000);
  const projection = await readProjectBoardGitArtifactProjection(board);
  const card = projection.cards.find((candidate) => candidate.cardId === input.cardId);
  if (!card) throw new Error(`Project board card is not present in pulled artifacts: ${input.cardId}`);
  const claims = projectBoardClaimProjectionFromEvents(projection.events, { now: input.now });
  const conflicts = claims.conflicts.filter((candidate) => candidate.cardId === input.cardId);
  if (conflicts.length === 0) throw new Error(`Project board card ${card.title} does not have competing claim events to resolve.`);
  const activeClaim = claims.activeClaims.find((candidate) => candidate.cardId === input.cardId);
  if (!activeClaim) throw new Error(`Project board card ${card.title} has claim conflicts but no active winning claim. Pull again before resolving ownership.`);
  const agentId = input.agentId?.trim() || defaultProjectBoardClaimAgentId();
  const baseCommit = await gitOrThrow(board.projectPath, ["rev-parse", "HEAD"]);
  const now = input.now ?? new Date().toISOString();
  const events = conflicts.map((conflict) =>
    createProjectBoardClaimExpiredEvent({
      boardId: board.id,
      cardId: input.cardId,
      runId: conflict.runId,
      agentId,
      appInstanceId: input.appInstanceId,
      baseCommit,
      expiredClaimEventId: conflict.eventId,
      now,
    }),
  );
  await commitAndPushBoardEvents(
    board.projectPath,
    events,
    `Resolve Ambient board claim conflict${events.length === 1 ? "" : "s"}: ${card.title}`,
  );
  return projectBoardGitSyncStatus(board, {
    message: `Resolved ${events.length} competing claim${events.length === 1 ? "" : "s"} for board card: ${card.title}`,
  });
}

async function prepareClaimMutation(
  board: ProjectBoardSummary,
  input: ProjectBoardGitClaimReleaseInput,
  options: { allowExpired?: boolean } = {},
): Promise<{ card: ProjectBoardArtifactProjection["cards"][number]; claim: ProjectBoardClaim; agentId: string; baseCommit: string }> {
  await ensureGitRepository(board.projectPath);
  const remote = await git(board.projectPath, ["remote", "get-url", "origin"]);
  if (!remote.ok || !remote.output.trim()) throw new Error("Board Git claim actions require a configured origin remote.");
  await gitOrThrow(board.projectPath, ["pull", "--ff-only"], 60_000);
  const projection = await readProjectBoardGitArtifactProjection(board);
  const card = projection.cards.find((candidate) => candidate.cardId === input.cardId);
  if (!card) throw new Error(`Project board card is not present in pulled artifacts: ${input.cardId}`);
  const claims = projectBoardClaimProjectionFromEvents(projection.events, { now: input.now });
  const claim =
    claims.activeClaims.find((candidate) => candidate.cardId === input.cardId && (!input.runId || candidate.runId === input.runId)) ??
    (options.allowExpired
      ? claims.expiredClaims.find((candidate) => candidate.cardId === input.cardId && (!input.runId || candidate.runId === input.runId))
      : undefined);
  if (!claim) throw new Error(`Project board card ${card.title} does not have a matching claim to update.`);
  const agentId = input.agentId?.trim() || defaultProjectBoardClaimAgentId();
  const baseCommit = await gitOrThrow(board.projectPath, ["rev-parse", "HEAD"]);
  return { card, claim, agentId, baseCommit };
}

function unresolvedProjectBoardGitProjectionConflictError(unresolvedConflicts: ProjectBoardGitProjectionChange[]): Error {
  const preview = unresolvedConflicts
    .slice(0, 4)
    .map((change) => `${change.title}: ${change.conflictReason ?? change.summary}`)
    .join("\n");
  return new Error(
    [
      `${unresolvedConflicts.length} pulled board card conflict${unresolvedConflicts.length === 1 ? "" : "s"} must be resolved before applying the Git projection.`,
      preview,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function commitAndPushBoardEvent(projectRoot: string, event: BoardEventArtifact, message: string): Promise<void> {
  await commitAndPushBoardEvents(projectRoot, [event], message);
}

async function commitAndPushBoardEvents(projectRoot: string, events: BoardEventArtifact[], message: string): Promise<void> {
  if (events.length === 0) return;
  const eventPaths: string[] = [];
  for (const event of events) {
    const eventPath = boardEventArtifactPath(event);
    eventPaths.push(eventPath);
    await mkdir(dirname(join(projectRoot, eventPath)), { recursive: true });
    await writeFile(join(projectRoot, eventPath), serializeBoardArtifact(event), "utf8");
  }
  const baseCommit = await gitOrThrow(projectRoot, ["rev-parse", "HEAD"]);
  await gitOrThrow(projectRoot, ["add", "--", ...eventPaths]);
  await gitOrThrow(projectRoot, ["commit", "-m", message.slice(0, 240), "--", ...eventPaths]);
  try {
    await pushCurrentBranch(projectRoot);
  } catch (pushError) {
    const reason = pushError instanceof Error ? pushError.message : String(pushError);
    await rollbackBoardEventCommit(projectRoot, baseCommit, eventPaths, reason);
    throw new Error(
      `Pushing the board event commit failed, so the local commit was rolled back to keep this branch in sync with origin. ` +
        `Another desktop may have pushed a competing update first - pull and retry. (${reason})`,
    );
  }
}

async function rollbackBoardEventCommit(projectRoot: string, baseCommit: string, eventPaths: string[], pushReason: string): Promise<void> {
  // The event commit only contains the event files, so a soft reset plus unstaging
  // those files restores the branch without touching unrelated worktree changes.
  const reset = await git(projectRoot, ["reset", "--soft", baseCommit]);
  const unstage = reset.ok ? await git(projectRoot, ["rm", "--cached", "--force", "--quiet", "--", ...eventPaths]) : reset;
  if (!reset.ok || !unstage.ok) {
    const rollbackOutput = (reset.ok ? unstage : reset).output || "git rollback failed";
    throw new Error(
      `Pushing the board event commit failed (${pushReason}) and rolling back the local commit also failed (${rollbackOutput}). ` +
        `Run "git reset --hard @{upstream}" inside the project to realign this branch with origin before retrying.`,
    );
  }
  for (const eventPath of eventPaths) {
    await rm(join(projectRoot, eventPath), { force: true });
  }
}

async function projectBoardGitSyncStatus(
  board: ProjectBoardSummary,
  options: { message?: string; exported?: boolean; runtime?: ProjectBoardRuntimeExportContext } = {},
): Promise<ProjectBoardGitSyncStatus> {
  const repo = await git(board.projectPath, ["rev-parse", "--is-inside-work-tree"]);
  const projection = await readProjectionSummary(board, options.runtime);
  if (!repo.ok) {
    return {
      boardId: board.id,
      projectRoot: board.projectPath,
      artifactRoot: PROJECT_BOARD_ARTIFACT_ROOT,
      isGitRepository: false,
      hasCommit: false,
      hasRemote: false,
      ahead: 0,
      behind: 0,
      dirtyBoardFileCount: 0,
      dirtyBoardFiles: [],
      mode: "local_only",
      message: options.message ?? "This project is in local-only board mode because it is not inside a Git repository.",
      ...(projection ? { projection } : {}),
      ...(options.exported ? { exportedAt: new Date().toISOString() } : {}),
    };
  }

  const [repoRoot, branch, detachedHead, remote, upstream, aheadBehind, dirtyFiles, lastCommit] = await Promise.all([
    git(board.projectPath, ["rev-parse", "--show-toplevel"]),
    git(board.projectPath, ["branch", "--show-current"]),
    git(board.projectPath, ["rev-parse", "--short", "HEAD"]),
    git(board.projectPath, ["remote", "get-url", "origin"]),
    git(board.projectPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    git(board.projectPath, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
    boardDirtyFiles(board.projectPath),
    git(board.projectPath, ["log", "-1", "--format=%H%x00%ct%x00%s", "--", PROJECT_BOARD_ARTIFACT_ROOT]),
  ]);
  const { ahead, behind } = aheadBehind.ok ? parseAheadBehind(aheadBehind.output) : { ahead: 0, behind: 0 };
  const hasRemote = remote.ok && Boolean(remote.output.trim());
  const hasCommit = detachedHead.ok && Boolean(detachedHead.output.trim());
  const branchName = branch.output || (detachedHead.output ? `detached ${detachedHead.output}` : "detached");

  return {
    boardId: board.id,
    projectRoot: board.projectPath,
    artifactRoot: PROJECT_BOARD_ARTIFACT_ROOT,
    isGitRepository: true,
    repoRoot: repoRoot.output || board.projectPath,
    branch: branchName,
    hasCommit,
    remote: hasRemote ? remote.output : undefined,
    hasRemote,
    upstream: upstream.ok ? upstream.output : undefined,
    ahead,
    behind,
    dirtyBoardFileCount: dirtyFiles.length,
    dirtyBoardFiles: dirtyFiles,
    mode: hasRemote ? "git_ready" : "git_no_remote",
    message:
      options.message ??
      (hasRemote
        ? "Board Git sync is available for this project."
        : "Board artifacts can be exported and committed locally, but pushing requires an origin remote."),
    lastBoardCommit: parseLastBoardCommit(lastCommit.output),
    ...(projection ? { projection } : {}),
    ...(options.exported ? { exportedAt: new Date().toISOString() } : {}),
  };
}

async function readProjectionSummary(
  board: ProjectBoardSummary,
  runtime?: ProjectBoardRuntimeExportContext,
): Promise<ProjectBoardGitSyncStatus["projection"] | undefined> {
  const files = await readProjectBoardArtifactFiles(board.projectPath);
  if (files.length === 0) return undefined;
  try {
    const projection = projectBoardArtifactProjectionFromFiles(files);
    const diff = compareProjectBoardSummaryToArtifactProjection(board, projection, {
      projectName: projection.config.projectName ?? projectNameFromPath(board.projectPath),
      exportedAt: projection.sourceSnapshots.at(-1)?.createdAt,
      runtime,
    });
    const claims = projectBoardClaimProjectionFromEvents(projection.events);
    return {
      ok: diff.ok,
      valid: true,
      differenceCount: diff.differences.length,
      differences: diff.differences.slice(0, 20),
      conflictCount: diff.conflictCount ?? 0,
      ...(diff.changes?.length ? { changes: diff.changes.slice(0, 20) } : {}),
      fileCount: files.length,
      cardCount: projection.cards.length,
      sourceCount: projection.sourceSnapshots.at(-1)?.sources.length ?? 0,
      eventCount: projection.events.length,
      proposalRunCount: projection.proposalRuns.length,
      runArtifactCount: projection.runArtifacts.length,
      activeClaimCount: claims.activeClaims.length,
      expiredClaimCount: claims.expiredClaims.length,
      claimConflictCount: claims.conflicts.length,
      claimedCardIds: claims.activeClaims.map((claim) => claim.cardId).slice(0, 20),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      valid: false,
      differenceCount: 1,
      differences: [message],
      fileCount: files.length,
      cardCount: 0,
      sourceCount: 0,
      eventCount: 0,
      proposalRunCount: 0,
      runArtifactCount: 0,
    };
  }
}

async function ensureGitRepository(projectRoot: string): Promise<void> {
  const repo = await git(projectRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (!repo.ok) throw new Error("Board Git sync requires the project to be inside a Git repository.");
}

async function pushCurrentBranch(projectRoot: string): Promise<void> {
  const branch = (await git(projectRoot, ["branch", "--show-current"])).output;
  if (!branch) throw new Error("Cannot push board artifacts from a detached HEAD.");
  const upstream = await git(projectRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  await gitOrThrow(projectRoot, upstream.ok ? ["push"] : ["push", "-u", "origin", branch], 60_000);
}

async function boardDirtyFiles(projectRoot: string): Promise<string[]> {
  const status = await git(projectRoot, ["status", "--porcelain=v1", "--", PROJECT_BOARD_ARTIFACT_ROOT]);
  if (!status.ok || !status.output.trim()) return [];
  return status.output
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

function safeCommitMessage(message: string | undefined, board: ProjectBoardSummary): string {
  const trimmed = message?.trim();
  if (trimmed) return trimmed.slice(0, 240);
  const title = board.title.trim() || "project board";
  return `Update Ambient board state: ${title}`.slice(0, 240);
}

function parseLastBoardCommit(output: string): ProjectBoardGitSyncStatus["lastBoardCommit"] | undefined {
  if (!output.trim()) return undefined;
  const [hash, epochSeconds, ...subjectParts] = output.split("\0");
  if (!hash || !epochSeconds) return undefined;
  const epoch = Number.parseInt(epochSeconds, 10);
  return {
    hash,
    shortHash: hash.slice(0, 7),
    subject: subjectParts.join("\0") || "Board artifact update",
    committedAt: Number.isFinite(epoch) ? new Date(epoch * 1000).toISOString() : new Date().toISOString(),
  };
}

function parseAheadBehind(output: string): { ahead: number; behind: number } {
  const [ahead = 0, behind = 0] = output
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isFinite);
  return { ahead, behind };
}

function projectNameFromPath(projectPath: string): string {
  return projectPath.split(/[\\/]/).filter(Boolean).at(-1) || "Ambient project";
}

async function gitOrThrow(projectRoot: string, args: string[], timeout = gitTimeoutMs): Promise<string> {
  const result = await git(projectRoot, args, timeout);
  if (!result.ok) throw new Error(result.output || `git ${args.join(" ")} failed`);
  return result.output;
}

async function git(projectRoot: string, args: string[], timeout = gitTimeoutMs): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", projectRoot, ...args], {
      timeout,
      maxBuffer: 4_000_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    return { ok: false, output: `${stdout}${stderr}`.trim() };
  }
}

export async function exportProjectBoardGitArtifacts(
  board: ProjectBoardSummary,
  options: ProjectBoardGitSyncRuntimeOptions = {},
): Promise<ProjectBoardGitSyncStatus> {
  return withProjectBoardGitOperationLock(board.projectPath, () => exportProjectBoardGitArtifactsUnlocked(board, options));
}

export async function commitProjectBoardGitArtifacts(
  board: ProjectBoardSummary,
  message?: string,
  options: ProjectBoardGitSyncRuntimeOptions = {},
): Promise<ProjectBoardGitSyncStatus> {
  return withProjectBoardGitOperationLock(board.projectPath, () => commitProjectBoardGitArtifactsUnlocked(board, message, options));
}

export async function pushProjectBoardGitArtifacts(board: ProjectBoardSummary): Promise<ProjectBoardGitSyncStatus> {
  return withProjectBoardGitOperationLock(board.projectPath, () => pushProjectBoardGitArtifactsUnlocked(board));
}

export async function pullProjectBoardGitArtifacts(board: ProjectBoardSummary): Promise<ProjectBoardGitSyncStatus> {
  return withProjectBoardGitOperationLock(board.projectPath, () => pullProjectBoardGitArtifactsUnlocked(board));
}

export async function applyProjectBoardGitProjection(
  board: ProjectBoardSummary,
  options: ApplyProjectBoardGitProjectionOptions,
): Promise<ApplyProjectBoardGitProjectionResult> {
  return withProjectBoardGitOperationLock(board.projectPath, () => applyProjectBoardGitProjectionUnlocked(board, options));
}

export async function claimProjectBoardGitCardArtifacts(
  board: ProjectBoardSummary,
  input: ProjectBoardGitClaimInput,
): Promise<ProjectBoardGitSyncStatus> {
  return withProjectBoardGitOperationLock(board.projectPath, () => claimProjectBoardGitCardArtifactsUnlocked(board, input));
}

export async function releaseProjectBoardGitCardClaimArtifacts(
  board: ProjectBoardSummary,
  input: ProjectBoardGitClaimReleaseInput,
): Promise<ProjectBoardGitSyncStatus> {
  return withProjectBoardGitOperationLock(board.projectPath, () => releaseProjectBoardGitCardClaimArtifactsUnlocked(board, input));
}

export async function expireProjectBoardGitCardClaimArtifacts(
  board: ProjectBoardSummary,
  input: ProjectBoardGitClaimReleaseInput,
): Promise<ProjectBoardGitSyncStatus> {
  return withProjectBoardGitOperationLock(board.projectPath, () => expireProjectBoardGitCardClaimArtifactsUnlocked(board, input));
}

export async function resolveProjectBoardGitCardClaimConflictsArtifacts(
  board: ProjectBoardSummary,
  input: ProjectBoardGitClaimReleaseInput,
): Promise<ProjectBoardGitSyncStatus> {
  return withProjectBoardGitOperationLock(board.projectPath, () =>
    resolveProjectBoardGitCardClaimConflictsArtifactsUnlocked(board, input),
  );
}
