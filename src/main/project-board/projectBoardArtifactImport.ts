import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  ProjectBoardGitProjectionChange,
  ProjectBoardGitProjectionChangeKind,
  ProjectBoardGitProjectionResolutionDecision,
  ProjectBoardSummary,
} from "../../shared/types";
import {
  PROJECT_BOARD_ARTIFACT_ROOT,
  boardConfigArtifactSchema,
  boardEventArtifactSchema,
  cardArtifactSchema,
  charterArtifactSchema,
  parseBoardArtifactJson,
  parseBoardArtifactJsonl,
  plannerActionArtifactSchema,
  proposalFinalArtifactSchema,
  proposalJsonlRecordArtifactSchema,
  proposalManifestArtifactSchema,
  runHandoffArtifactSchema,
  runManifestArtifactSchema,
  runProofArtifactSchema,
  serializeBoardArtifact,
  sourceClassificationArtifactSchema,
  sourceSnapshotArtifactSchema,
  validateProjectBoardArtifactSet,
  ProjectBoardArtifactValidationError,
  type BoardConfigArtifact,
  type BoardEventArtifact,
  type CardArtifact,
  type CharterArtifact,
  type ProposalFinalArtifact,
  type ProposalJsonlRecordArtifact,
  type ProposalManifestArtifact,
  type PlannerActionArtifact,
  type RunHandoffArtifact,
  type RunManifestArtifact,
  type RunProofArtifact,
  type SourceClassificationArtifact,
  type SourceSnapshotArtifact,
} from "./projectBoardArtifacts";
import {
  projectBoardArtifactExportFromSummary,
  type ProjectBoardArtifactExportOptions,
  type ProjectBoardArtifactFile,
} from "./projectBoardArtifactExport";

export type ProposalProgressRecordArtifact = Extract<ProposalJsonlRecordArtifact, { type: "progress" }>;
export type ProposalCandidateCardRecordArtifact = Extract<ProposalJsonlRecordArtifact, { type: "candidate_card" }>;
export type ProposalQuestionRecordArtifact = Extract<ProposalJsonlRecordArtifact, { type: "question" }>;
export type ProposalFinalRecordArtifact = Extract<ProposalJsonlRecordArtifact, { type: "proposal_final" }>;
export type ProposalSourceCoverageRecordArtifact = Extract<ProposalJsonlRecordArtifact, { type: "source_coverage" }>;
export type ProposalDependencyEdgeRecordArtifact = Extract<ProposalJsonlRecordArtifact, { type: "dependency_edge" }>;
export type ProposalWarningRecordArtifact = Extract<ProposalJsonlRecordArtifact, { type: "warning" }>;
export type ProposalErrorRecordArtifact = Extract<ProposalJsonlRecordArtifact, { type: "error" }>;

export interface ProjectBoardProposalRunProjection {
  proposalPathId: string;
  proposalId?: string;
  proposalRunId?: string;
  manifest?: ProposalManifestArtifact;
  final?: ProposalFinalArtifact;
  plannerActions: PlannerActionArtifact[];
  progress: ProposalProgressRecordArtifact[];
  candidateCards: ProposalCandidateCardRecordArtifact[];
  questions: ProposalQuestionRecordArtifact[];
  proposalFinals: ProposalFinalRecordArtifact[];
  sourceCoverage: ProposalSourceCoverageRecordArtifact[];
  dependencyEdges: ProposalDependencyEdgeRecordArtifact[];
  warnings: ProposalWarningRecordArtifact[];
  errors: ProposalErrorRecordArtifact[];
}

export interface ProjectBoardRunArtifactProjection {
  runPathId: string;
  runId?: string;
  manifest?: RunManifestArtifact;
  proof?: RunProofArtifact;
  handoff?: RunHandoffArtifact;
}

export interface ProjectBoardArtifactProjection {
  config: BoardConfigArtifact;
  charter?: CharterArtifact;
  sourceSnapshots: SourceSnapshotArtifact[];
  sourceClassifications: SourceClassificationArtifact[];
  cards: CardArtifact[];
  events: BoardEventArtifact[];
  proposalRuns: ProjectBoardProposalRunProjection[];
  runArtifacts: ProjectBoardRunArtifactProjection[];
  files: ProjectBoardArtifactFile[];
}

export interface ProjectBoardProjectionDiff {
  ok: boolean;
  differences: string[];
  changes?: ProjectBoardGitProjectionChange[];
  conflictCount?: number;
}

export interface ProjectBoardResolvedArtifactProjection {
  projection: ProjectBoardArtifactProjection;
  diff: ProjectBoardProjectionDiff;
  unresolvedConflicts: ProjectBoardGitProjectionChange[];
  localOverlayCount: number;
  /** Cards whose conflicts were deferred: the local board state is kept, but the pulled
   * artifact files on disk must not be rewritten so the pull can be re-applied later. */
  deferredCardIds: string[];
}

interface MutableProposalRunProjection extends ProjectBoardProposalRunProjection {
  manifest?: ProposalManifestArtifact;
  final?: ProposalFinalArtifact;
}

interface MutableRunArtifactProjection extends ProjectBoardRunArtifactProjection {
  manifest?: RunManifestArtifact;
  proof?: RunProofArtifact;
  handoff?: RunHandoffArtifact;
}

export async function readProjectBoardArtifactFiles(projectRoot: string): Promise<ProjectBoardArtifactFile[]> {
  const root = join(projectRoot, PROJECT_BOARD_ARTIFACT_ROOT);
  const files = await readArtifactFiles(projectRoot, root);
  return files.filter(isProjectBoardProjectionArtifactFile).sort((left, right) => left.path.localeCompare(right.path));
}

export function projectBoardArtifactProjectionFromFiles(files: ProjectBoardArtifactFile[]): ProjectBoardArtifactProjection {
  let config: BoardConfigArtifact | undefined;
  let charter: CharterArtifact | undefined;
  const sourceSnapshots: SourceSnapshotArtifact[] = [];
  const sourceClassifications: SourceClassificationArtifact[] = [];
  const cards: CardArtifact[] = [];
  const events: BoardEventArtifact[] = [];
  const proposalRuns = new Map<string, MutableProposalRunProjection>();
  const runArtifacts = new Map<string, MutableRunArtifactProjection>();
  const normalizedFiles = files.map((file) => ({ ...file, path: normalizeArtifactPath(file.path) })).sort((left, right) => left.path.localeCompare(right.path));

  for (const file of normalizedFiles) {
    const relativePath = stripBoardRoot(file.path);
    if (!relativePath) continue;

    if (relativePath === "board.config.json") {
      config = parseBoardArtifactJson(file.content, boardConfigArtifactSchema, file.path);
      continue;
    }
    if (relativePath === "charter/active.json") {
      charter = parseBoardArtifactJson(file.content, charterArtifactSchema, file.path);
      continue;
    }
    if (/^sources\/snapshots\/[^/]+\.json$/.test(relativePath)) {
      sourceSnapshots.push(parseBoardArtifactJson(file.content, sourceSnapshotArtifactSchema, file.path));
      continue;
    }
    if (/^sources\/classifications\/[^/]+\.json$/.test(relativePath)) {
      sourceClassifications.push(parseBoardArtifactJson(file.content, sourceClassificationArtifactSchema, file.path));
      continue;
    }
    if (/^cards\/[^/]+\.json$/.test(relativePath)) {
      cards.push(parseBoardArtifactJson(file.content, cardArtifactSchema, file.path));
      continue;
    }
    if (/^events\/.+\.json$/.test(relativePath)) {
      events.push(parseBoardArtifactJson(file.content, boardEventArtifactSchema, file.path));
      continue;
    }

    const runMatch = /^runs\/([^/]+)\/([^/]+)$/.exec(relativePath);
    if (runMatch) {
      const [, runPathId, runFileName] = runMatch;
      const runArtifact = getRunArtifact(runArtifacts, runPathId);
      if (runFileName === "manifest.json") {
        runArtifact.manifest = parseBoardArtifactJson(file.content, runManifestArtifactSchema, file.path);
        runArtifact.runId = runArtifact.manifest.runId;
      } else if (runFileName === "proof.json") {
        runArtifact.proof = parseBoardArtifactJson(file.content, runProofArtifactSchema, file.path);
        runArtifact.runId = runArtifact.proof.runId;
      } else if (runFileName === "handoff.json") {
        runArtifact.handoff = parseBoardArtifactJson(file.content, runHandoffArtifactSchema, file.path);
        runArtifact.runId = runArtifact.handoff.runId;
      }
      continue;
    }

    const proposalMatch = /^proposals\/([^/]+)\/([^/]+)$/.exec(relativePath);
    if (!proposalMatch) continue;
    const [, proposalPathId, proposalFileName] = proposalMatch;
    const proposalRun = getProposalRun(proposalRuns, proposalPathId);
    if (proposalFileName === "manifest.json") {
      proposalRun.manifest = parseBoardArtifactJson(file.content, proposalManifestArtifactSchema, file.path);
      proposalRun.proposalRunId = proposalRun.manifest.proposalRunId;
    } else if (proposalFileName === "proposal.final.json") {
      proposalRun.final = parseBoardArtifactJson(file.content, proposalFinalArtifactSchema, file.path);
      proposalRun.proposalId = proposalRun.final.proposalId;
    } else if (proposalFileName === "planner-actions.jsonl") {
      proposalRun.plannerActions.push(...parseBoardArtifactJsonl(file.content, plannerActionArtifactSchema, file.path));
    } else if (proposalFileName.endsWith(".jsonl")) {
      appendProposalJsonlRecords(proposalRun, parseBoardArtifactJsonl(file.content, proposalJsonlRecordArtifactSchema, file.path));
    }
  }

  if (!config) {
    throw new ProjectBoardArtifactValidationError(`${PROJECT_BOARD_ARTIFACT_ROOT}/board.config.json is required to import a project board.`);
  }

  const artifactSet = validateProjectBoardArtifactSet({
    config,
    charter,
    sourceSnapshots,
    sourceClassifications,
    cards,
    events,
    runManifests: [...runArtifacts.values()].flatMap((run) => (run.manifest ? [run.manifest] : [])),
    runProofs: [...runArtifacts.values()].flatMap((run) => (run.proof ? [run.proof] : [])),
    runHandoffs: [...runArtifacts.values()].flatMap((run) => (run.handoff ? [run.handoff] : [])),
  });
  validateProposalRuns([...proposalRuns.values()], artifactSet.config.boardId);
  validateRunArtifacts([...runArtifacts.values()], artifactSet.config.boardId, new Set(artifactSet.cards.map((card) => card.cardId)));

  return {
    config: artifactSet.config,
    ...(artifactSet.charter ? { charter: artifactSet.charter } : {}),
    sourceSnapshots: artifactSet.sourceSnapshots.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.snapshotId.localeCompare(right.snapshotId)),
    sourceClassifications: artifactSet.sourceClassifications.sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    cards: artifactSet.cards.sort((left, right) => left.cardId.localeCompare(right.cardId)),
    events: artifactSet.events.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.eventId.localeCompare(right.eventId)),
    proposalRuns: [...proposalRuns.values()].sort((left, right) => left.proposalPathId.localeCompare(right.proposalPathId)),
    runArtifacts: [...runArtifacts.values()].sort((left, right) => left.runPathId.localeCompare(right.runPathId)),
    files: normalizedFiles,
  };
}

export function compareProjectBoardSummaryToArtifactProjection(
  board: ProjectBoardSummary,
  projection: ProjectBoardArtifactProjection,
  options: ProjectBoardArtifactExportOptions = {},
): ProjectBoardProjectionDiff {
  const expected = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(board, options).files);
  return compareProjectBoardArtifactProjections(expected, projection);
}

export function compareProjectBoardArtifactProjections(
  expected: ProjectBoardArtifactProjection,
  actual: ProjectBoardArtifactProjection,
): ProjectBoardProjectionDiff {
  const differences: string[] = [];
  compareArtifact("board config", expected.config, actual.config, differences);
  compareOptionalArtifact("active charter", expected.charter, actual.charter, differences);
  compareArtifactMap("source snapshot", expected.sourceSnapshots, actual.sourceSnapshots, (snapshot) => snapshot.snapshotId, differences);
  compareArtifactMap("source classification", expected.sourceClassifications, actual.sourceClassifications, (classification) => classification.sourceId, differences);
  compareArtifactMap("card", expected.cards, actual.cards, (card) => card.cardId, differences);
  compareArtifactMap("event", expected.events, actual.events, (event) => event.eventId, differences);
  compareProposalRuns(expected.proposalRuns, actual.proposalRuns, differences);
  compareRunArtifacts(expected.runArtifacts, actual.runArtifacts, differences);
  const changes = projectBoardProjectionChanges(expected, actual);
  const conflictCount = changes.filter((change) => change.conflict).length;
  return {
    ok: differences.length === 0,
    differences,
    ...(changes.length > 0 ? { changes } : {}),
    ...(conflictCount > 0 ? { conflictCount } : {}),
  };
}

export function projectBoardArtifactProjectionWithResolvedConflicts(
  board: ProjectBoardSummary,
  projection: ProjectBoardArtifactProjection,
  resolutions: ProjectBoardGitProjectionResolutionDecision[] = [],
  options: ProjectBoardArtifactExportOptions = {},
): ProjectBoardResolvedArtifactProjection {
  const localProjection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(board, options).files);
  const initialDiff = compareProjectBoardArtifactProjections(localProjection, projection);
  const conflicts = initialDiff.changes?.filter((change) => change.conflict) ?? [];
  const resolutionByChangeId = new Map(resolutions.flatMap((decision) => (decision.changeId ? [[decision.changeId, decision] as const] : [])));
  const resolutionByEntityId = new Map(resolutions.flatMap((decision) => (decision.entityId ? [[decision.entityId, decision] as const] : [])));
  const nextProjection: ProjectBoardArtifactProjection = {
    ...projection,
    cards: [...projection.cards],
    sourceSnapshots: [...projection.sourceSnapshots],
    sourceClassifications: [...projection.sourceClassifications],
    events: [...projection.events],
    proposalRuns: [...projection.proposalRuns],
    runArtifacts: [...projection.runArtifacts],
    files: [...projection.files],
  };
  const localCardsById = new Map(localProjection.cards.map((card) => [card.cardId, card]));
  const unresolvedConflicts: ProjectBoardGitProjectionChange[] = [];
  const deferredCardIds: string[] = [];
  let localOverlayCount = 0;

  for (const conflict of conflicts) {
    const decision = resolutionByChangeId.get(conflict.id) ?? (conflict.entityId ? resolutionByEntityId.get(conflict.entityId) : undefined);
    if (!decision) {
      unresolvedConflicts.push(conflict);
      continue;
    }
    if (decision.resolution === "apply_pulled") continue;
    if (conflict.kind !== "card" || !conflict.entityId) {
      unresolvedConflicts.push(conflict);
      continue;
    }
    // Both keep_local and defer keep the local board state in the applied projection.
    // The difference is on disk: keep_local counts as an overlay so the export rewrites
    // the artifact with the local version, while defer leaves the pulled file untouched
    // so the conflict can be re-applied later.
    const localCard = localCardsById.get(conflict.entityId);
    const nextIndex = nextProjection.cards.findIndex((card) => card.cardId === conflict.entityId);
    if (!localCard) {
      if (nextIndex >= 0) nextProjection.cards.splice(nextIndex, 1);
    } else if (nextIndex >= 0) {
      nextProjection.cards[nextIndex] = localCard;
    } else {
      nextProjection.cards.push(localCard);
    }
    if (decision.resolution === "defer") deferredCardIds.push(conflict.entityId);
    else localOverlayCount += 1;
  }

  return {
    projection: nextProjection,
    diff: compareProjectBoardArtifactProjections(localProjection, nextProjection),
    unresolvedConflicts,
    localOverlayCount,
    deferredCardIds,
  };
}

async function readArtifactFiles(projectRoot: string, directory: string): Promise<ProjectBoardArtifactFile[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }

  const files: ProjectBoardArtifactFile[] = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readArtifactFiles(projectRoot, absolutePath)));
    } else if (entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl"))) {
      files.push({
        path: normalizeArtifactPath(relative(projectRoot, absolutePath)),
        content: await readFile(absolutePath, "utf8"),
      });
    }
  }
  return files;
}

function isProjectBoardProjectionArtifactFile(file: ProjectBoardArtifactFile): boolean {
  const relativePath = stripBoardRoot(normalizeArtifactPath(file.path));
  if (!relativePath) return false;
  if (relativePath === "board.config.json") return true;
  if (relativePath === "charter/active.json") return true;
  if (/^sources\/snapshots\/[^/]+\.json$/.test(relativePath)) return true;
  if (/^sources\/classifications\/[^/]+\.json$/.test(relativePath)) return true;
  if (/^cards\/[^/]+\.json$/.test(relativePath)) return true;
  if (/^events\/.+\.json$/.test(relativePath)) return true;
  if (/^runs\/[^/]+\/(?:manifest|proof|handoff)\.json$/.test(relativePath)) return true;
  if (/^proposals\/[^/]+\/(?:manifest|proposal\.final)\.json$/.test(relativePath)) return true;
  if (/^proposals\/[^/]+\/(?:planner-actions|.+)\.jsonl$/.test(relativePath)) return true;
  return false;
}

function getProposalRun(runs: Map<string, MutableProposalRunProjection>, proposalPathId: string): MutableProposalRunProjection {
  const existing = runs.get(proposalPathId);
  if (existing) return existing;
  const created: MutableProposalRunProjection = {
    proposalPathId,
    plannerActions: [],
    progress: [],
    candidateCards: [],
    questions: [],
    proposalFinals: [],
    sourceCoverage: [],
    dependencyEdges: [],
    warnings: [],
    errors: [],
  };
  runs.set(proposalPathId, created);
  return created;
}

function getRunArtifact(runs: Map<string, MutableRunArtifactProjection>, runPathId: string): MutableRunArtifactProjection {
  const existing = runs.get(runPathId);
  if (existing) return existing;
  const created: MutableRunArtifactProjection = { runPathId };
  runs.set(runPathId, created);
  return created;
}

function appendProposalJsonlRecords(proposalRun: MutableProposalRunProjection, records: ProposalJsonlRecordArtifact[]): void {
  for (const record of records) {
    if (record.type === "progress") proposalRun.progress.push(record);
    else if (record.type === "candidate_card") proposalRun.candidateCards.push(record);
    else if (record.type === "question") proposalRun.questions.push(record);
    else if (record.type === "proposal_final") proposalRun.proposalFinals.push(record);
    else if (record.type === "source_coverage") proposalRun.sourceCoverage.push(record);
    else if (record.type === "dependency_edge") proposalRun.dependencyEdges.push(record);
    else if (record.type === "warning") proposalRun.warnings.push(record);
    else if (record.type === "error") proposalRun.errors.push(record);
  }
}

function validateProposalRuns(proposalRuns: ProjectBoardProposalRunProjection[], boardId: string): void {
  const errors: string[] = [];
  for (const proposalRun of proposalRuns) {
    if (proposalRun.manifest && proposalRun.manifest.boardId !== boardId) {
      errors.push(`proposal run ${proposalRun.proposalPathId} manifest belongs to board ${proposalRun.manifest.boardId}, not ${boardId}.`);
    }
    if (proposalRun.final && proposalRun.final.boardId !== boardId) {
      errors.push(`proposal run ${proposalRun.proposalPathId} final proposal belongs to board ${proposalRun.final.boardId}, not ${boardId}.`);
    }
  }
  if (errors.length > 0) throw new ProjectBoardArtifactValidationError(errors.join("\n"));
}

function validateRunArtifacts(runArtifacts: ProjectBoardRunArtifactProjection[], boardId: string, cardIds: Set<string>): void {
  const errors: string[] = [];
  for (const runArtifact of runArtifacts) {
    const runId = runArtifact.manifest?.runId ?? runArtifact.proof?.runId ?? runArtifact.handoff?.runId ?? runArtifact.runPathId;
    const cardId = runArtifact.manifest?.cardId ?? runArtifact.proof?.cardId ?? runArtifact.handoff?.cardId;
    if (runArtifact.manifest && runArtifact.manifest.boardId !== boardId) {
      errors.push(`run ${runArtifact.runPathId} manifest belongs to board ${runArtifact.manifest.boardId}, not ${boardId}.`);
    }
    if (runArtifact.proof && runArtifact.proof.boardId !== boardId) {
      errors.push(`run ${runArtifact.runPathId} proof belongs to board ${runArtifact.proof.boardId}, not ${boardId}.`);
    }
    if (runArtifact.handoff && runArtifact.handoff.boardId !== boardId) {
      errors.push(`run ${runArtifact.runPathId} handoff belongs to board ${runArtifact.handoff.boardId}, not ${boardId}.`);
    }
    if (runArtifact.proof && runArtifact.manifest && runArtifact.proof.runId !== runArtifact.manifest.runId) {
      errors.push(`run ${runArtifact.runPathId} proof run id ${runArtifact.proof.runId} does not match manifest ${runArtifact.manifest.runId}.`);
    }
    if (runArtifact.handoff && runArtifact.manifest && runArtifact.handoff.runId !== runArtifact.manifest.runId) {
      errors.push(`run ${runArtifact.runPathId} handoff run id ${runArtifact.handoff.runId} does not match manifest ${runArtifact.manifest.runId}.`);
    }
    if (runArtifact.proof && runArtifact.manifest && runArtifact.proof.cardId !== runArtifact.manifest.cardId) {
      errors.push(`run ${runArtifact.runPathId} proof card ${runArtifact.proof.cardId} does not match manifest card ${runArtifact.manifest.cardId}.`);
    }
    if (runArtifact.handoff && runArtifact.manifest && runArtifact.handoff.cardId !== runArtifact.manifest.cardId) {
      errors.push(`run ${runArtifact.runPathId} handoff card ${runArtifact.handoff.cardId} does not match manifest card ${runArtifact.manifest.cardId}.`);
    }
    if (cardId && cardIds.size > 0 && !cardIds.has(cardId)) errors.push(`run ${runId} references missing card ${cardId}.`);
  }
  if (errors.length > 0) throw new ProjectBoardArtifactValidationError(errors.join("\n"));
}

function projectBoardProjectionChanges(
  expected: ProjectBoardArtifactProjection,
  actual: ProjectBoardArtifactProjection,
): ProjectBoardGitProjectionChange[] {
  const changes: ProjectBoardGitProjectionChange[] = [];
  pushObjectProjectionChange(changes, "board", "board config", "board config", expected.config, actual.config, boardConfigProjectionChangeDetail);
  pushOptionalProjectionChange(changes, "charter", "active charter", "active charter", expected.charter, actual.charter, charterProjectionChangeDetail);
  pushProjectionMapChanges(
    changes,
    "source",
    "source snapshot",
    expected.sourceSnapshots,
    actual.sourceSnapshots,
    (snapshot) => snapshot.snapshotId,
    sourceSnapshotProjectionChangeDetail,
  );
  pushProjectionMapChanges(
    changes,
    "source",
    "source classification",
    expected.sourceClassifications,
    actual.sourceClassifications,
    (classification) => classification.sourceId,
    sourceClassificationProjectionChangeDetail,
  );
  pushProjectionMapChanges(changes, "card", "card", expected.cards, actual.cards, (card) => card.cardId, cardProjectionChangeDetail);
  pushProjectionMapChanges(changes, "event", "event", expected.events, actual.events, (event) => event.eventId, eventProjectionChangeDetail);
  pushProjectionMapChanges(changes, "proposal", "proposal run", expected.proposalRuns, actual.proposalRuns, (run) => run.proposalPathId, proposalRunProjectionChangeDetail);
  pushProjectionMapChanges(changes, "runtime", "run artifact", expected.runArtifacts, actual.runArtifacts, (run) => run.runPathId, runArtifactProjectionChangeDetail);
  return changes;
}

function pushOptionalProjectionChange(
  changes: ProjectBoardGitProjectionChange[],
  kind: ProjectBoardGitProjectionChangeKind,
  label: string,
  id: string,
  expected: unknown | undefined,
  actual: unknown | undefined,
  detailFor?: (input: { action: "add" | "remove" | "update"; id: string; local?: unknown; pulled?: unknown }) => Partial<ProjectBoardGitProjectionChange>,
): void {
  if (expected === undefined && actual === undefined) return;
  if (expected === undefined) {
    changes.push(genericProjectionChange({ kind, label, id, action: "add", pulledTitle: label, detail: detailFor?.({ action: "add", id, pulled: actual }) }));
    return;
  }
  if (actual === undefined) {
    changes.push(genericProjectionChange({ kind, label, id, action: "remove", localTitle: label, detail: detailFor?.({ action: "remove", id, local: expected }) }));
    return;
  }
  pushObjectProjectionChange(changes, kind, label, id, expected, actual, detailFor);
}

function pushObjectProjectionChange(
  changes: ProjectBoardGitProjectionChange[],
  kind: ProjectBoardGitProjectionChangeKind,
  label: string,
  id: string,
  expected: unknown,
  actual: unknown,
  detailFor?: (input: { action: "add" | "remove" | "update"; id: string; local?: unknown; pulled?: unknown }) => Partial<ProjectBoardGitProjectionChange>,
): void {
  if (serializeBoardArtifact(expected) === serializeBoardArtifact(actual)) return;
  changes.push(
    genericProjectionChange({
      kind,
      label,
      id,
      action: "update",
      localTitle: label,
      pulledTitle: label,
      detail: detailFor?.({ action: "update", id, local: expected, pulled: actual }),
    }),
  );
}

function pushProjectionMapChanges<T>(
  changes: ProjectBoardGitProjectionChange[],
  kind: ProjectBoardGitProjectionChangeKind,
  label: string,
  expected: T[],
  actual: T[],
  idFor: (value: T) => string,
  detailFor?: (input: { action: "add" | "remove" | "update"; id: string; local?: T; pulled?: T }) => Partial<ProjectBoardGitProjectionChange>,
): void {
  const expectedById = new Map(expected.map((item) => [idFor(item), item]));
  const actualById = new Map(actual.map((item) => [idFor(item), item]));
  for (const id of [...expectedById.keys()].sort()) {
    const local = expectedById.get(id);
    const pulled = actualById.get(id);
    if (!local) continue;
    if (!pulled) {
      changes.push(
        genericProjectionChange({
          kind,
          label,
          id,
          action: "remove",
          localTitle: projectionItemTitle(label, id),
          detail: detailFor?.({ action: "remove", id, local }),
        }),
      );
    } else if (serializeBoardArtifact(local) !== serializeBoardArtifact(pulled)) {
      changes.push(
        genericProjectionChange({
          kind,
          label,
          id,
          action: "update",
          localTitle: projectionItemTitle(label, id),
          pulledTitle: projectionItemTitle(label, id),
          detail: detailFor?.({ action: "update", id, local, pulled }),
        }),
      );
    }
  }
  for (const id of [...actualById.keys()].sort()) {
    if (expectedById.has(id)) continue;
    const pulled = actualById.get(id);
    changes.push(
      genericProjectionChange({
        kind,
        label,
        id,
        action: "add",
        pulledTitle: projectionItemTitle(label, id),
        detail: detailFor?.({ action: "add", id, pulled }),
      }),
    );
  }
}

function genericProjectionChange(input: {
  kind: ProjectBoardGitProjectionChangeKind;
  label: string;
  id: string;
  action: "add" | "remove" | "update";
  localTitle?: string;
  pulledTitle?: string;
  detail?: Partial<ProjectBoardGitProjectionChange>;
}): ProjectBoardGitProjectionChange {
  const title = input.detail?.title ?? projectionItemTitle(input.label, input.id);
  const entityId = input.detail?.entityId ?? input.id;
  const conflict = input.detail?.conflict ?? false;
  const summary =
    input.detail?.summary ??
    (input.action === "add"
      ? `Pulled board contains ${title}; applying will add it locally.`
      : input.action === "remove"
        ? `Pulled board does not contain ${title}; applying will remove the local copy.`
        : `Pulled board has different content for ${title}; applying will replace the local copy.`);
  return {
    id: `${input.action}:${input.label}:${input.id}`.replace(/\s+/g, "-"),
    kind: input.kind,
    action: input.action,
    entityId,
    title,
    summary,
    ...(input.detail?.local ? { local: input.detail.local } : input.localTitle ? { local: { title: input.localTitle } } : {}),
    ...(input.detail?.pulled ? { pulled: input.detail.pulled } : input.pulledTitle ? { pulled: { title: input.pulledTitle } } : {}),
    ...(input.detail?.changedFields?.length ? { changedFields: input.detail.changedFields } : {}),
    conflict,
    ...(input.detail?.conflictReason ? { conflictReason: input.detail.conflictReason } : {}),
    recommendedResolution: input.detail?.recommendedResolution ?? (conflict ? "manual_resolution_required" : "apply_pulled"),
    applyConsequence: input.detail?.applyConsequence ?? defaultApplyConsequence(input.action, title),
    keepLocalConsequence: input.detail?.keepLocalConsequence ?? `Keep the local ${title} by exporting and committing this desktop's board state instead of applying the pull.`,
    deferConsequence: input.detail?.deferConsequence ?? `Defer this pull; the local board stays unchanged and pulled ${input.label} updates remain unapplied.`,
  };
}

function boardConfigProjectionChangeDetail(input: {
  action: "add" | "remove" | "update";
  id: string;
  local?: unknown;
  pulled?: unknown;
}): Partial<ProjectBoardGitProjectionChange> {
  const local = input.local as BoardConfigArtifact | undefined;
  const pulled = input.pulled as BoardConfigArtifact | undefined;
  const title = pulled?.title || local?.title || "Board settings";
  const changedFields = local && pulled
    ? projectionChangedFields(local, pulled, ["boardId", "title", "status", "summary", "projectName", "activeCharterId", "collaboration", "updatedAt"])
    : undefined;
  const boardIdConflict = Boolean(local?.boardId && pulled?.boardId && local.boardId !== pulled.boardId);
  return {
    title: "Board settings",
    entityId: input.id,
    ...(local ? { local: { title: local.title, status: local.status, updatedAt: local.updatedAt } } : {}),
    ...(pulled ? { pulled: { title: pulled.title, status: pulled.status, updatedAt: pulled.updatedAt } } : {}),
    ...(changedFields?.length ? { changedFields } : {}),
    conflict: boardIdConflict,
    ...(boardIdConflict ? { conflictReason: `Pulled artifacts belong to board ${pulled?.boardId}, but the open local board is ${local?.boardId}.` } : {}),
    recommendedResolution: boardIdConflict ? "manual_resolution_required" : "apply_pulled",
    summary: boardIdConflict
      ? `Pulled board settings refer to a different board identity for "${title}".`
      : `Pulled board settings ${projectionActionVerb(input.action)} for "${title}".`,
    applyConsequence: boardIdConflict
      ? "Do not apply this projection onto the open board. Choose which board should own this workspace before importing artifacts."
      : `Use the pulled board title, status, summary, active charter pointer, and collaboration metadata for "${title}".`,
    keepLocalConsequence: "Keep this desktop's current board settings by exporting and committing the local projection instead of applying the pull.",
    deferConsequence: "Leave board settings unchanged until the pulled projection is applied later.",
  };
}

function charterProjectionChangeDetail(input: {
  action: "add" | "remove" | "update";
  id: string;
  local?: unknown;
  pulled?: unknown;
}): Partial<ProjectBoardGitProjectionChange> {
  const local = input.local as CharterArtifact | undefined;
  const pulled = input.pulled as CharterArtifact | undefined;
  const version = pulled?.version ?? local?.version;
  const title = version ? `Project charter v${version}` : "Project charter";
  const changedFields =
    local && pulled
      ? projectionChangedFields(local, pulled, [
          "version",
          "status",
          "goal",
          "currentState",
          "targetUser",
          "nonGoals",
          "qualityBar",
          "testPolicy",
          "decisionPolicy",
          "dependencyPolicy",
          "budgetPolicy",
          "sourcePolicy",
          "markdown",
          "projectSummary",
          "updatedAt",
        ])
      : undefined;
  return {
    title,
    entityId: pulled?.charterId ?? local?.charterId ?? input.id,
    ...(local ? { local: { title: `Charter v${local.version}`, status: local.status, updatedAt: local.updatedAt } } : {}),
    ...(pulled ? { pulled: { title: `Charter v${pulled.version}`, status: pulled.status, updatedAt: pulled.updatedAt } } : {}),
    ...(changedFields?.length ? { changedFields } : {}),
    summary: `Pulled board ${projectionActionVerb(input.action)} the active project charter, including goal, policies, proof bar, and source authority.`,
    applyConsequence: "Use the pulled charter as the board authority for future card planning, proof review, and worker judgment calls.",
    keepLocalConsequence: "Keep this desktop's current charter authority by exporting and committing the local board instead.",
    deferConsequence: "Leave the local charter authority unchanged until this pull is revisited.",
  };
}

function sourceSnapshotProjectionChangeDetail(input: {
  action: "add" | "remove" | "update";
  id: string;
  local?: SourceSnapshotArtifact;
  pulled?: SourceSnapshotArtifact;
}): Partial<ProjectBoardGitProjectionChange> {
  const local = input.local;
  const pulled = input.pulled;
  const localCount = local?.sources.length ?? 0;
  const pulledCount = pulled?.sources.length ?? 0;
  const changedFields = local && pulled ? projectionChangedFields(local, pulled, ["createdAt", "sources"]) : undefined;
  return {
    title: `Source snapshot ${input.id}`,
    entityId: input.id,
    ...(local ? { local: { title: `${localCount} source${localCount === 1 ? "" : "s"}`, status: "local source corpus", updatedAt: local.createdAt } } : {}),
    ...(pulled ? { pulled: { title: `${pulledCount} source${pulledCount === 1 ? "" : "s"}`, status: "pulled source corpus", updatedAt: pulled.createdAt } } : {}),
    ...(changedFields?.length ? { changedFields } : {}),
    summary: `Pulled board ${projectionActionVerb(input.action)} the source corpus snapshot used for Charter source review and source-scoped Add Cards.`,
    applyConsequence: `Use the pulled source corpus snapshot (${pulledCount} source${pulledCount === 1 ? "" : "s"}) for source review, synthesis provenance, and future Add Cards runs.`,
    keepLocalConsequence: "Keep this desktop's current source corpus by refreshing/exporting/committing local board artifacts before applying the pull.",
    deferConsequence: "Leave the source review corpus unchanged; pulled source additions or removals will not inform local planning yet.",
  };
}

function sourceClassificationProjectionChangeDetail(input: {
  action: "add" | "remove" | "update";
  id: string;
  local?: SourceClassificationArtifact;
  pulled?: SourceClassificationArtifact;
}): Partial<ProjectBoardGitProjectionChange> {
  const local = input.local;
  const pulled = input.pulled;
  const changedFields =
    local && pulled
      ? projectionChangedFields(local, pulled, [
          "detectedKind",
          "effectiveKind",
          "userKind",
          "confidence",
          "classificationReason",
          "authorityRole",
          "includeInSynthesis",
          "notableScope",
          "warnings",
          "classifiedBy",
          "classifiedAt",
        ])
      : undefined;
  const sourceKey = pulled?.sourceKey || local?.sourceKey || input.id;
  return {
    title: `Source classification ${sourceKey}`,
    entityId: input.id,
    ...(local ? { local: { title: local.sourceKey, status: `${local.effectiveKind} / ${local.authorityRole}`, updatedAt: local.classifiedAt } } : {}),
    ...(pulled ? { pulled: { title: pulled.sourceKey, status: `${pulled.effectiveKind} / ${pulled.authorityRole}`, updatedAt: pulled.classifiedAt } } : {}),
    ...(changedFields?.length ? { changedFields } : {}),
    summary: `Pulled board ${projectionActionVerb(input.action)} classification and source-authority metadata for ${sourceKey}.`,
    applyConsequence: "Use the pulled classification, authority role, and synthesis inclusion decision when reviewing sources and planning cards.",
    keepLocalConsequence: "Keep this desktop's classification decision by exporting and committing the local board projection.",
    deferConsequence: "Leave local classification unchanged; pulled source authority decisions remain unapplied.",
  };
}

function eventProjectionChangeDetail(input: {
  action: "add" | "remove" | "update";
  id: string;
  local?: BoardEventArtifact;
  pulled?: BoardEventArtifact;
}): Partial<ProjectBoardGitProjectionChange> {
  const local = input.local;
  const pulled = input.pulled;
  const event = pulled ?? local;
  const changedFields = local && pulled ? projectionChangedFields(local, pulled, ["type", "entityKind", "entityId", "actor", "baseCommit", "createdAt", "payload"]) : undefined;
  const taskAction = boardEventTaskAction(event);
  if (taskAction) {
    const entityText = event?.entityId ? ` for ${event.entityKind ?? "entity"} ${event.entityId}` : "";
    return {
      title: `${taskAction.action} task action`,
      entityId: input.id,
      ...(local ? { local: { title: local.type, status: local.entityKind ?? "event", updatedAt: local.createdAt } } : {}),
      ...(pulled ? { pulled: { title: pulled.type, status: pulled.entityKind ?? "event", updatedAt: pulled.createdAt } } : {}),
      ...(changedFields?.length ? { changedFields } : {}),
      summary: `Pulled board ${projectionActionVerb(input.action)} Pi worker task action ${taskAction.action}${entityText}: ${taskAction.summary}`,
      applyConsequence:
        "Import the pulled Pi task-action event into board history and PM audit trails so collaborator heartbeats, proof reports, blockers, handoffs, and follow-up actions remain visible.",
      keepLocalConsequence: "Keep this desktop's local worker task-action history by exporting and committing the local board projection instead.",
      deferConsequence: "Leave the pulled worker task-action event unapplied; collaborator progress/proof audit context may remain incomplete locally.",
    };
  }
  return {
    title: event ? `${event.type} event` : `Event ${input.id}`,
    entityId: input.id,
    ...(local ? { local: { title: local.type, status: local.entityKind ?? "event", updatedAt: local.createdAt } } : {}),
    ...(pulled ? { pulled: { title: pulled.type, status: pulled.entityKind ?? "event", updatedAt: pulled.createdAt } } : {}),
    ...(changedFields?.length ? { changedFields } : {}),
    summary: `Pulled board ${projectionActionVerb(input.action)} an audit/history event${event?.entityId ? ` for ${event.entityKind ?? "entity"} ${event.entityId}` : ""}.`,
    applyConsequence: "Import the pulled event into board history, claim/proof audit trails, and collaboration chronology.",
    keepLocalConsequence: "Keep local board history by exporting and committing this desktop's event projection instead.",
    deferConsequence: "Leave the pulled history event unapplied; collaboration audit context may remain incomplete locally.",
  };
}

function boardEventTaskAction(event: BoardEventArtifact | undefined): { action: string; summary: string } | undefined {
  if (!event) return undefined;
  const payload = event.payload;
  const nested = payload.taskToolAction && typeof payload.taskToolAction === "object" && !Array.isArray(payload.taskToolAction) ? (payload.taskToolAction as Record<string, unknown>) : undefined;
  const action = typeof payload.action === "string" ? payload.action : typeof nested?.action === "string" ? nested.action : undefined;
  if (!action?.startsWith("task_")) return undefined;
  const summary =
    (typeof payload.summary === "string" && payload.summary.trim()) ||
    (typeof nested?.summary === "string" && nested.summary.trim()) ||
    (typeof nested?.reason === "string" && nested.reason.trim()) ||
    (typeof nested?.title === "string" && nested.title.trim()) ||
    action;
  return { action, summary: summary.slice(0, 500) };
}

function proposalRunProjectionChangeDetail(input: {
  action: "add" | "remove" | "update";
  id: string;
  local?: ProjectBoardProposalRunProjection;
  pulled?: ProjectBoardProposalRunProjection;
}): Partial<ProjectBoardGitProjectionChange> {
  const local = input.local;
  const pulled = input.pulled;
  const proposal = pulled ?? local;
  const changedFields =
    local && pulled
      ? projectionChangedFields(local, pulled, [
          "manifest",
          "final",
          "plannerActions",
          "progress",
          "candidateCards",
          "questions",
          "proposalFinals",
          "sourceCoverage",
          "dependencyEdges",
          "warnings",
          "errors",
        ])
      : undefined;
  return {
    title: proposalRunTitle(proposal, input.id),
    entityId: proposal?.proposalRunId ?? proposal?.proposalId ?? input.id,
    ...(local ? { local: { title: proposalRunTitle(local, input.id), status: proposalRunStatus(local), updatedAt: local.manifest?.updatedAt ?? local.final?.updatedAt } } : {}),
    ...(pulled ? { pulled: { title: proposalRunTitle(pulled, input.id), status: proposalRunStatus(pulled), updatedAt: pulled.manifest?.updatedAt ?? pulled.final?.updatedAt } } : {}),
    ...(changedFields?.length ? { changedFields } : {}),
    summary: `Pulled board ${projectionActionVerb(input.action)} a planning proposal/run with ${proposal?.candidateCards.length ?? 0} progressive card record${(proposal?.candidateCards.length ?? 0) === 1 ? "" : "s"} and ${proposal?.questions.length ?? 0} question record${(proposal?.questions.length ?? 0) === 1 ? "" : "s"}.`,
    applyConsequence: "Import the pulled planning run/proposal so Draft Inbox, PM Review, coverage, warnings, and retry/resume history reflect collaborator planning work.",
    keepLocalConsequence: "Keep this desktop's planning proposal/run records by exporting and committing local board artifacts first.",
    deferConsequence: "Leave pulled planning records unapplied; collaborator candidate-card/progress history will not appear locally yet.",
  };
}

function runArtifactProjectionChangeDetail(input: {
  action: "add" | "remove" | "update";
  id: string;
  local?: ProjectBoardRunArtifactProjection;
  pulled?: ProjectBoardRunArtifactProjection;
}): Partial<ProjectBoardGitProjectionChange> {
  const local = input.local;
  const pulled = input.pulled;
  const run = pulled ?? local;
  const runId = run?.runId ?? run?.manifest?.runId ?? run?.proof?.runId ?? run?.handoff?.runId ?? input.id;
  const cardId = run?.manifest?.cardId ?? run?.proof?.cardId ?? run?.handoff?.cardId;
  const changedFields = local && pulled ? projectionChangedFields(local, pulled, ["manifest", "proof", "handoff"]) : undefined;
  return {
    title: `Run artifact ${runId}`,
    entityId: runId,
    ...(local ? { local: { title: runArtifactSideTitle(local), status: runArtifactStatus(local), updatedAt: runArtifactUpdatedAt(local) } } : {}),
    ...(pulled ? { pulled: { title: runArtifactSideTitle(pulled), status: runArtifactStatus(pulled), updatedAt: runArtifactUpdatedAt(pulled) } } : {}),
    ...(changedFields?.length ? { changedFields } : {}),
    summary: `Pulled board ${projectionActionVerb(input.action)} execution proof/handoff artifacts${cardId ? ` for card ${cardId}` : ""}.`,
    applyConsequence: "Import the pulled run manifest, proof, and handoff so card status, PM Review, downstream dependency readiness, and follow-up materialization can use collaborator execution evidence.",
    keepLocalConsequence: "Keep this desktop's execution proof/handoff view by exporting and committing local runtime artifacts instead.",
    deferConsequence: "Leave pulled proof/handoff artifacts unapplied; collaborator execution evidence and follow-ups may not be visible locally.",
  };
}

function cardProjectionChangeDetail(input: {
  action: "add" | "remove" | "update";
  id: string;
  local?: CardArtifact;
  pulled?: CardArtifact;
}): Partial<ProjectBoardGitProjectionChange> {
  const local = input.local;
  const pulled = input.pulled;
  const localSide = local ? cardProjectionSide(local) : undefined;
  const pulledSide = pulled ? cardProjectionSide(pulled) : undefined;
  const changedFields = local && pulled ? cardProjectionChangedFields(local, pulled) : undefined;
  const title = pulled?.title || local?.title || projectionItemTitle("card", input.id);
  const conflictReason = cardProjectionConflictReason(input.action, local, pulled);
  const conflict = Boolean(conflictReason);
  const fieldSummary = changedFields?.length ? ` Changed fields: ${changedFields.slice(0, 6).join(", ")}${changedFields.length > 6 ? ", ..." : ""}.` : "";
  return {
    title,
    entityId: input.id,
    ...(localSide ? { local: localSide } : {}),
    ...(pulledSide ? { pulled: pulledSide } : {}),
    ...(changedFields?.length ? { changedFields } : {}),
    summary:
      input.action === "add"
        ? `Pulled board adds card "${title}" in ${pulledSide?.status ?? "unknown"} state.`
        : input.action === "remove"
          ? `Pulled board removes local card "${title}" from ${localSide?.status ?? "unknown"} state.`
          : `Pulled board updates card "${title}".${fieldSummary}`,
    conflict,
    ...(conflictReason ? { conflictReason } : {}),
    recommendedResolution: conflict ? "manual_resolution_required" : "apply_pulled",
    applyConsequence:
      input.action === "add"
        ? `Add "${title}" to this desktop's board projection.`
        : input.action === "remove"
          ? `Remove local card "${title}" from this desktop's board projection.`
          : `Replace this desktop's "${title}" card fields with the pulled card artifact.`,
    keepLocalConsequence: `Keep this desktop's "${local?.title || title}" card by exporting/committing the local board, or by resolving the Git artifacts before applying.`,
    deferConsequence: `Leave "${title}" unchanged for now. Pulled claims, proof, dependencies, and handoffs tied to this card will not be reflected locally until a later apply.`,
  };
}

function cardProjectionSide(card: CardArtifact): NonNullable<ProjectBoardGitProjectionChange["local"]> {
  return {
    title: card.title,
    status: card.status,
    candidateStatus: card.candidateStatus,
    updatedAt: card.updatedAt,
  };
}

function cardProjectionChangedFields(local: CardArtifact, pulled: CardArtifact): string[] {
  const fields: Array<keyof CardArtifact> = [
    "title",
    "description",
    "status",
    "candidateStatus",
    "priority",
    "phase",
    "labels",
    "blockedBy",
    "unresolvedBlockers",
    "acceptanceCriteria",
    "testPlan",
    "sourceKind",
    "sourceId",
    "sourceRefs",
    "clarificationQuestions",
    "clarificationSuggestions",
    "clarificationAnswers",
    "clarificationDecisions",
    "runFeedback",
    "objectiveProvenance",
    "orchestrationTaskId",
    "executionThreadId",
    "executionSessionPolicy",
    "uiMockRole",
    "requiresUiMockApproval",
    "proofReview",
    "splitOutcome",
    "updatedAt",
  ];
  return fields.filter((field) => serializeBoardArtifact(local[field]) !== serializeBoardArtifact(pulled[field])).map(String);
}

function cardProjectionConflictReason(action: "add" | "remove" | "update", local?: CardArtifact, pulled?: CardArtifact): string | undefined {
  if (action === "add" || !local) return undefined;
  if (action === "remove") {
    if (cardHasLocalExecutionState(local)) return "The pulled board would remove a local card with execution, proof, split, or task state.";
    if (local.status !== "draft") return `The pulled board would remove a local ${local.status} card.`;
    return undefined;
  }
  if (!pulled) return undefined;
  if (["in_progress", "review", "blocked"].includes(local.status) && local.status !== pulled.status) {
    return `The local card is ${local.status}; applying the pulled ${pulled.status} card could overwrite active local execution state.`;
  }
  if (local.status === "done" && pulled.status !== "done") {
    return "The local card is done, but the pulled card is not done.";
  }
  if (cardHasLocalExecutionState(local) && (local.orchestrationTaskId !== pulled.orchestrationTaskId || local.executionThreadId !== pulled.executionThreadId)) {
    return "The pulled card points at different execution ownership than the local card.";
  }
  const localTime = Date.parse(local.updatedAt);
  const pulledTime = Date.parse(pulled.updatedAt);
  if (Number.isFinite(localTime) && Number.isFinite(pulledTime) && localTime > pulledTime) {
    return "The local card was updated after the pulled card artifact.";
  }
  return undefined;
}

function cardHasLocalExecutionState(card: CardArtifact): boolean {
  return Boolean(
      card.orchestrationTaskId ||
      card.executionThreadId ||
      card.runFeedback.length > 0 ||
      card.proofReview ||
      card.splitOutcome ||
      ["in_progress", "review", "done", "blocked"].includes(card.status),
  );
}

function defaultApplyConsequence(action: "add" | "remove" | "update", title: string): string {
  if (action === "add") return `Add ${title} from the pulled board projection.`;
  if (action === "remove") return `Remove local ${title} because it is absent from the pulled board projection.`;
  return `Replace local ${title} with the pulled board projection.`;
}

function projectionChangedFields<T extends object>(local: T, pulled: T, fields: Array<keyof T>): string[] {
  return fields.filter((field) => serializeBoardArtifact(local[field]) !== serializeBoardArtifact(pulled[field])).map(String);
}

function projectionActionVerb(action: "add" | "remove" | "update"): string {
  if (action === "add") return "adds";
  if (action === "remove") return "removes";
  return "updates";
}

function proposalRunTitle(run: ProjectBoardProposalRunProjection | undefined, fallbackId: string): string {
  const id = run?.manifest?.proposalRunId ?? run?.final?.proposalId ?? run?.proposalRunId ?? run?.proposalId ?? fallbackId;
  return `Planning run ${id}`;
}

function proposalRunStatus(run: ProjectBoardProposalRunProjection): string {
  if (run.manifest?.status) return run.manifest.status;
  if (run.final?.status) return run.final.status;
  return `${run.candidateCards.length} card records`;
}

function runArtifactStatus(run: ProjectBoardRunArtifactProjection): string {
  if (run.manifest?.status) return run.manifest.status;
  if (run.proof && run.handoff) return "proof + handoff";
  if (run.proof) return "proof";
  if (run.handoff) return "handoff";
  return "runtime artifact";
}

function runArtifactSideTitle(run: ProjectBoardRunArtifactProjection): string {
  const runId = run.runId ?? run.manifest?.runId ?? run.proof?.runId ?? run.handoff?.runId ?? run.runPathId;
  const cardId = run.manifest?.cardId ?? run.proof?.cardId ?? run.handoff?.cardId;
  return cardId ? `${runId} / ${cardId}` : runId;
}

function runArtifactUpdatedAt(run: ProjectBoardRunArtifactProjection): string | undefined {
  return run.manifest?.updatedAt ?? run.proof?.createdAt ?? run.handoff?.createdAt;
}

function projectionItemTitle(label: string, id: string): string {
  return `${label} ${id}`.replace(/\s+/g, " ").trim();
}

function compareProposalRuns(
  expectedRuns: ProjectBoardProposalRunProjection[],
  actualRuns: ProjectBoardProposalRunProjection[],
  differences: string[],
): void {
  const expectedById = new Map(expectedRuns.map((run) => [run.proposalPathId, run]));
  const actualById = new Map(actualRuns.map((run) => [run.proposalPathId, run]));
  for (const id of [...expectedById.keys()].sort()) {
    const expected = expectedById.get(id);
    const actual = actualById.get(id);
    if (!actual) {
      differences.push(`missing proposal run ${id}.`);
      continue;
    }
    compareOptionalArtifact(`proposal run ${id} manifest`, expected?.manifest, actual.manifest, differences);
    compareOptionalArtifact(`proposal run ${id} final`, expected?.final, actual.final, differences);
    compareArtifact(`proposal run ${id} planner actions`, expected?.plannerActions ?? [], actual.plannerActions, differences);
    compareArtifact(`proposal run ${id} progress records`, expected?.progress ?? [], actual.progress, differences);
    compareArtifact(`proposal run ${id} candidate card records`, expected?.candidateCards ?? [], actual.candidateCards, differences);
    compareArtifact(`proposal run ${id} question records`, expected?.questions ?? [], actual.questions, differences);
    compareArtifact(`proposal run ${id} proposal final records`, expected?.proposalFinals ?? [], actual.proposalFinals, differences);
    compareArtifact(`proposal run ${id} source coverage records`, expected?.sourceCoverage ?? [], actual.sourceCoverage, differences);
    compareArtifact(`proposal run ${id} dependency edge records`, expected?.dependencyEdges ?? [], actual.dependencyEdges, differences);
    compareArtifact(`proposal run ${id} warning records`, expected?.warnings ?? [], actual.warnings, differences);
    compareArtifact(`proposal run ${id} error records`, expected?.errors ?? [], actual.errors, differences);
  }
  for (const id of [...actualById.keys()].sort()) {
    if (!expectedById.has(id)) differences.push(`unexpected proposal run ${id}.`);
  }
}

function compareRunArtifacts(
  expectedRuns: ProjectBoardRunArtifactProjection[],
  actualRuns: ProjectBoardRunArtifactProjection[],
  differences: string[],
): void {
  const expectedById = new Map(expectedRuns.map((run) => [run.runPathId, run]));
  const actualById = new Map(actualRuns.map((run) => [run.runPathId, run]));
  for (const id of [...expectedById.keys()].sort()) {
    const expected = expectedById.get(id);
    const actual = actualById.get(id);
    if (!actual) {
      differences.push(`missing run artifact ${id}.`);
      continue;
    }
    compareOptionalArtifact(`run ${id} manifest`, expected?.manifest, actual.manifest, differences);
    compareOptionalArtifact(`run ${id} proof`, expected?.proof, actual.proof, differences);
    compareOptionalArtifact(`run ${id} handoff`, expected?.handoff, actual.handoff, differences);
  }
  for (const id of [...actualById.keys()].sort()) {
    if (!expectedById.has(id)) differences.push(`unexpected run artifact ${id}.`);
  }
}

function compareArtifactMap<T>(label: string, expected: T[], actual: T[], idFor: (value: T) => string, differences: string[]): void {
  const expectedById = new Map(expected.map((item) => [idFor(item), item]));
  const actualById = new Map(actual.map((item) => [idFor(item), item]));
  for (const id of [...expectedById.keys()].sort()) {
    const expectedItem = expectedById.get(id);
    const actualItem = actualById.get(id);
    if (!actualItem) differences.push(`missing ${label} ${id}.`);
    else compareArtifact(`${label} ${id}`, expectedItem, actualItem, differences);
  }
  for (const id of [...actualById.keys()].sort()) {
    if (!expectedById.has(id)) differences.push(`unexpected ${label} ${id}.`);
  }
}

function compareOptionalArtifact(label: string, expected: unknown | undefined, actual: unknown | undefined, differences: string[]): void {
  if (expected === undefined && actual === undefined) return;
  if (expected === undefined) {
    differences.push(`unexpected ${label}.`);
    return;
  }
  if (actual === undefined) {
    differences.push(`missing ${label}.`);
    return;
  }
  compareArtifact(label, expected, actual, differences);
}

function compareArtifact(label: string, expected: unknown, actual: unknown, differences: string[]): void {
  if (serializeBoardArtifact(expected) !== serializeBoardArtifact(actual)) differences.push(`${label} differs.`);
}

function stripBoardRoot(path: string): string | undefined {
  const normalized = normalizeArtifactPath(path);
  if (normalized === PROJECT_BOARD_ARTIFACT_ROOT) return "";
  const prefix = `${PROJECT_BOARD_ARTIFACT_ROOT}/`;
  if (!normalized.startsWith(prefix)) return undefined;
  return normalized.slice(prefix.length);
}

function normalizeArtifactPath(path: string): string {
  return path.split(sep).join("/").replace(/\/+/g, "/");
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
