import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import type {
  OrchestrationRun,
  OrchestrationTask,
  ProjectBoardCard,
  ProjectBoardCharter,
  ProjectBoardEvent,
  ProjectBoardEventKind,
  ProjectBoardExecutionArtifact,
  ProjectBoardSource,
  ProjectBoardSummary,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisRun,
} from "../../shared/types";
import {
  PROJECT_BOARD_ARTIFACT_ROOT,
  PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
  boardEventArtifactPath,
  parseBoardArtifactJsonl,
  proposalJsonlRecordArtifactSchema,
  serializeBoardArtifact,
  validateBoardConfigArtifact,
  validateBoardEventArtifact,
  validateCardArtifact,
  validateCharterArtifact,
  validateProjectBoardArtifactSet,
  validateProposalFinalArtifact,
  validateProposalManifestArtifact,
  validateProposalJsonlRecordArtifact,
  validateRunHandoffArtifact,
  validateRunManifestArtifact,
  validateRunProofArtifact,
  validateSourceClassificationArtifact,
  validateSourceSnapshotArtifact,
  type BoardConfigArtifact,
  type BoardEventArtifact,
  type CardArtifact,
  type CharterArtifact,
  type ProposalManifestArtifact,
  type ProposalJsonlRecordArtifact,
  type RunHandoffArtifact,
  type RunManifestArtifact,
  type RunProofArtifact,
  type SourceClassificationArtifact,
  type SourceSnapshotArtifact,
} from "./projectBoardArtifacts";
import { plannerActionJsonlContent, projectBoardPlannerActionsFromProgressiveRecords } from "./projectBoardPlannerActions";
import {
  projectBoardProgressiveRecordsFromDraft,
  proposalJsonlContent,
} from "./projectBoardProgressivePlanning";
import { projectBoardSynthesisDraftFromProposal } from "./projectBoardSynthesis";
import { projectBoardSourceAuthorityRole, projectBoardSourceContentHash, projectBoardSourceKey } from "./projectBoardSourceIdentity";
import {
  projectBoardTaskToolActionSummary,
  projectBoardTaskToolActionTitle,
  projectBoardTaskToolActionsFromProofOfWork,
  projectBoardTaskToolBrowserTraces,
  projectBoardTaskToolChangedFiles,
  projectBoardTaskToolCommands,
  projectBoardTaskToolCompleted,
  projectBoardTaskToolFollowUps,
  projectBoardTaskToolHandoffSummary,
  projectBoardTaskToolManualChecks,
  projectBoardTaskToolProofSummary,
  projectBoardTaskToolRemaining,
  projectBoardTaskToolRisks,
  projectBoardTaskToolScreenshots,
  projectBoardTaskToolVisualChecks,
  type ProjectBoardTaskToolAction,
} from "./projectBoardTaskTools";

export interface ProjectBoardArtifactFile {
  path: string;
  content: string;
}

export interface ProjectBoardArtifactExport {
  config: BoardConfigArtifact;
  charter?: CharterArtifact;
  sourceSnapshot: SourceSnapshotArtifact;
  sourceClassifications: SourceClassificationArtifact[];
  cards: CardArtifact[];
  events: BoardEventArtifact[];
  runManifests: RunManifestArtifact[];
  runProofs: RunProofArtifact[];
  runHandoffs: RunHandoffArtifact[];
  files: ProjectBoardArtifactFile[];
}

export interface ProjectBoardRuntimeExportContext {
  tasks: OrchestrationTask[];
  runs: OrchestrationRun[];
}

export interface ProjectBoardArtifactExportOptions {
  projectName?: string;
  exportedAt?: string;
  runtime?: ProjectBoardRuntimeExportContext;
}

export function projectBoardArtifactExportFromSummary(
  board: ProjectBoardSummary,
  options: ProjectBoardArtifactExportOptions = {},
): ProjectBoardArtifactExport {
  const sourceSnapshot = sourceSnapshotArtifactFromBoard(board, options);
  const sourceClassifications = board.sources.map((source) => sourceClassificationArtifactFromSource(source));
  const cards = cardArtifactsFromBoard(board);
  const persistedEvents = (board.events ?? []).map((event) => boardEventArtifactFromEvent(event));
  const runtimeArtifacts = runtimeArtifactsFromBoard(board, cards, options.runtime);
  const projectedRunArtifacts = executionArtifactsFromBoard(board);
  const events = uniqueBy([...persistedEvents, ...runtimeArtifacts.events], (event) => event.eventId);
  const runManifests = uniqueBy([...runtimeArtifacts.runManifests, ...projectedRunArtifacts.runManifests], (manifest) => manifest.runId);
  const runProofs = uniqueBy([...runtimeArtifacts.runProofs, ...projectedRunArtifacts.runProofs], (proof) => proof.runId);
  const runHandoffs = uniqueBy([...runtimeArtifacts.runHandoffs, ...projectedRunArtifacts.runHandoffs], (handoff) => handoff.runId);
  const config = validateBoardConfigArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    boardId: board.id,
    title: board.title,
    status: board.status,
    summary: board.summary,
    projectName: options.projectName,
    activeCharterId: board.charter?.id ?? board.charterId,
    collaboration: { mode: "local" },
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  });
  const charter = board.charter ? charterArtifactFromCharter(board.charter) : undefined;

  validateProjectBoardArtifactSet({
    config,
    charter,
    sourceSnapshots: [sourceSnapshot],
    sourceClassifications,
    cards,
    events,
    runManifests,
    runProofs,
    runHandoffs,
  });

  const files: ProjectBoardArtifactFile[] = [
    artifactFile("board.config.json", config),
    artifactFile("sources/snapshots/current.json", sourceSnapshot),
    ...sourceClassifications.map((classification) =>
      artifactFile(`sources/classifications/${safeArtifactFileStem(classification.sourceId)}.json`, classification),
    ),
    ...cards.map((card) => artifactFile(`cards/${safeArtifactFileStem(card.cardId)}.json`, card)),
    ...events.map((event) => ({ path: boardEventArtifactPath(event), content: serializeBoardArtifact(event) })),
    ...runManifests.map((manifest) => artifactFile(`runs/${safeArtifactFileStem(manifest.runId)}/manifest.json`, manifest)),
    ...runProofs.map((proof) => artifactFile(`runs/${safeArtifactFileStem(proof.runId)}/proof.json`, proof)),
    ...runHandoffs.map((handoff) => artifactFile(`runs/${safeArtifactFileStem(handoff.runId)}/handoff.json`, handoff)),
    ...proposalFiles(board.proposals, board.sources),
    ...synthesisRunFiles(board.synthesisRuns ?? []),
  ];
  if (charter) {
    files.push(artifactFile("charter/active.json", charter));
    files.push({ path: `${PROJECT_BOARD_ARTIFACT_ROOT}/charter/active.md`, content: `${charter.markdown.trimEnd()}\n` });
  }

  return {
    config,
    ...(charter ? { charter } : {}),
    sourceSnapshot,
    sourceClassifications,
    cards,
    events,
    runManifests,
    runProofs,
    runHandoffs,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export async function writeProjectBoardArtifactExport(
  projectRoot: string,
  artifactExport: ProjectBoardArtifactExport,
  options: { skipPaths?: Set<string> } = {},
): Promise<void> {
  for (const file of artifactExport.files) {
    if (options.skipPaths?.has(file.path)) continue;
    const absolutePath = join(projectRoot, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
  }
  await removeStaleManagedArtifactFiles(projectRoot, artifactExport, options.skipPaths);
}

// Directories whose contents this export owns completely. Files here that are not in
// the export set belong to deleted entities and must be removed, or git pull will
// resurrect them (a deleted card's stale cards/<id>.json reads as "pulled adds card").
// events/ is append-only (claim events are written by other flows) and
// planner-workspaces/ is run-scoped scratch space, so neither is swept.
const MANAGED_ARTIFACT_DIRECTORIES = ["cards", "sources/classifications", "runs", "proposals", "charter"];

async function removeStaleManagedArtifactFiles(
  projectRoot: string,
  artifactExport: ProjectBoardArtifactExport,
  skipPaths?: Set<string>,
): Promise<void> {
  const expectedPaths = new Set(artifactExport.files.map((file) => file.path));
  for (const directory of MANAGED_ARTIFACT_DIRECTORIES) {
    const absoluteDirectory = join(projectRoot, PROJECT_BOARD_ARTIFACT_ROOT, directory);
    for (const absolutePath of await collectArtifactFilePaths(absoluteDirectory)) {
      const relativePath = relative(projectRoot, absolutePath).split("\\").join("/");
      if (expectedPaths.has(relativePath) || skipPaths?.has(relativePath)) continue;
      await rm(absolutePath, { force: true });
    }
  }
}

async function collectArtifactFilePaths(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await collectArtifactFilePaths(absolutePath)));
    } else if (entry.isFile() && /\.(?:json|jsonl|md)$/.test(entry.name)) {
      paths.push(absolutePath);
    }
  }
  return paths;
}

function charterArtifactFromCharter(charter: ProjectBoardCharter): CharterArtifact {
  return validateCharterArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    charterId: charter.id,
    boardId: charter.boardId,
    version: charter.version,
    status: charter.status,
    goal: charter.goal,
    currentState: charter.currentState,
    targetUser: charter.targetUser,
    nonGoals: charter.nonGoals,
    qualityBar: charter.qualityBar,
    testPolicy: charter.testPolicy,
    decisionPolicy: charter.decisionPolicy,
    dependencyPolicy: charter.dependencyPolicy,
    budgetPolicy: charter.budgetPolicy,
    sourcePolicy: charter.sourcePolicy,
    markdown: charter.markdown,
    ...(charter.projectSummary ? { projectSummary: charter.projectSummary } : {}),
    createdAt: charter.createdAt,
    updatedAt: charter.updatedAt,
  });
}

function sourceSnapshotArtifactFromBoard(
  board: ProjectBoardSummary,
  options: ProjectBoardArtifactExportOptions,
): SourceSnapshotArtifact {
  return validateSourceSnapshotArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    snapshotId: "source-snapshot-current",
    boardId: board.id,
    createdAt: options.exportedAt ?? board.updatedAt,
    sources: board.sources.map((source) => ({
      sourceId: source.id,
      sourceKey: source.sourceKey ?? projectBoardSourceKey(source),
      kind: source.kind,
      changeState: source.changeState ?? "unchanged",
      title: source.title,
      summary: source.summary,
      excerpt: source.excerpt,
      path: source.path,
      threadId: source.threadId,
      artifactId: source.artifactId,
      messageId: source.messageId,
      contentHash: source.contentHash ?? projectBoardSourceContentHash(source),
      byteSize: source.byteSize ?? (source.excerpt ? Buffer.byteLength(source.excerpt, "utf8") : undefined),
      mtime: source.mtime ?? source.updatedAt,
    })),
  });
}

function sourceClassificationArtifactFromSource(source: ProjectBoardSource): SourceClassificationArtifact {
  return validateSourceClassificationArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    sourceId: source.id,
    sourceKey: source.sourceKey ?? projectBoardSourceKey(source),
    contentHash: source.contentHash ?? projectBoardSourceContentHash(source),
    detectedKind: source.kind,
    effectiveKind: source.kind,
    confidence: source.classificationConfidence ?? Math.max(0.1, Math.min(0.95, source.relevance / 100)),
    classificationReason:
      source.classificationReason ?? "Exported from the current ProjectStore source kind. Pi-first classification has not been run for this artifact yet.",
    authorityRole: source.authorityRole ?? projectBoardSourceAuthorityRole(source.kind, source.relevance),
    includeInSynthesis: source.includeInSynthesis ?? source.kind !== "ignored",
    notableScope: source.summary,
    warnings: source.classifiedBy === "fallback_heuristic" || !source.classifiedBy ? ["fallback-exported-classification"] : [],
    classifiedBy: source.classifiedBy ?? "fallback_heuristic",
    classifiedAt: source.updatedAt,
  });
}

function cardArtifactsFromBoard(board: ProjectBoardSummary): CardArtifact[] {
  const cards = [...board.cards].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.title.localeCompare(right.title));
  const refs = new Map<string, string>();
  for (const card of cards) {
    refs.set(card.id.toLowerCase(), card.id);
    refs.set(card.sourceId.toLowerCase(), card.id);
    refs.set(card.title.toLowerCase(), card.id);
  }
  return cards.map((card) => {
    const blockedBy: string[] = [];
    const unresolvedBlockers: string[] = [];
    for (const blocker of card.blockedBy) {
      const resolved = refs.get(blocker.trim().toLowerCase());
      if (resolved) blockedBy.push(resolved);
      else unresolvedBlockers.push(blocker);
    }
    return validateCardArtifact({
      schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
      cardId: card.id,
      boardId: card.boardId,
      title: card.title,
      description: card.description,
      status: card.status,
      candidateStatus: card.candidateStatus,
      priority: card.priority,
      phase: card.phase,
      labels: card.labels,
      blockedBy: unique(blockedBy),
      unresolvedBlockers: unique(unresolvedBlockers),
      acceptanceCriteria: card.acceptanceCriteria,
      testPlan: card.testPlan,
      sourceKind: card.sourceKind,
      sourceId: card.sourceId,
      sourceRefs: sourceRefsForCard(card, board.sources),
      clarificationQuestions: card.clarificationQuestions ?? [],
      clarificationSuggestions: card.clarificationSuggestions ?? [],
      clarificationAnswers: card.clarificationAnswers ?? [],
      clarificationDecisions: card.clarificationDecisions ?? [],
      runFeedback: card.runFeedback ?? [],
      objectiveProvenance: card.objectiveProvenance,
      orchestrationTaskId: card.orchestrationTaskId,
      executionThreadId: card.executionThreadId,
      executionSessionPolicy: card.executionSessionPolicy,
      uiMockRole: card.uiMockRole,
      requiresUiMockApproval: card.requiresUiMockApproval,
      proofReview: card.proofReview,
      splitOutcome: card.splitOutcome,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    });
  });
}

function sourceRefsForCard(card: ProjectBoardCard, sources: ProjectBoardSource[]): Array<{ sourceId?: string; path?: string; note?: string }> {
  const refs: Array<{ sourceId?: string; path?: string; note?: string }> = [];
  for (const sourceRef of card.sourceRefs ?? []) {
    const matched = sources.find((source) => sourceRefMatchesSource(sourceRef, source));
    if (matched) refs.push({ sourceId: matched.id, path: matched.path, note: `Matched explicit card source ref: ${sourceRef}` });
    else refs.push({ path: sourceRef, note: "Explicit card source ref." });
  }
  for (const source of sources) {
    if (card.sourceThreadId && source.threadId === card.sourceThreadId) refs.push({ sourceId: source.id, path: source.path, note: "Matched by source thread." });
    else if (card.sourceMessageId && source.messageId === card.sourceMessageId) refs.push({ sourceId: source.id, path: source.path, note: "Matched by source message." });
    else if (card.sourceKind === "planner_plan" && source.artifactId === card.sourceId) refs.push({ sourceId: source.id, path: source.path, note: "Matched by planner artifact." });
  }
  return uniqueBy(refs, (ref) => ref.sourceId ?? ref.path ?? "");
}

function sourceRefMatchesSource(ref: string, source: ProjectBoardSource): boolean {
  const normalizedRef = normalizeArtifactSourceRef(ref);
  if (!normalizedRef) return false;
  return [source.id, source.sourceKey, source.path, source.title, source.artifactId, source.threadId, source.messageId]
    .filter((value): value is string => Boolean(value))
    .map(normalizeArtifactSourceRef)
    .some((candidate) => Boolean(candidate) && (candidate === normalizedRef || normalizedRef.includes(candidate) || candidate.includes(normalizedRef)));
}

function normalizeArtifactSourceRef(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, "/");
}

function boardEventArtifactFromEvent(event: ProjectBoardEvent): BoardEventArtifact {
  const importedType = typeof event.metadata.artifactEventType === "string" ? event.metadata.artifactEventType : undefined;
  const importedPayload =
    event.metadata.artifactPayload && typeof event.metadata.artifactPayload === "object" && !Array.isArray(event.metadata.artifactPayload)
      ? (event.metadata.artifactPayload as Record<string, unknown>)
      : undefined;
  const importedActor =
    event.metadata.artifactActor && typeof event.metadata.artifactActor === "object" && !Array.isArray(event.metadata.artifactActor)
      ? (event.metadata.artifactActor as Record<string, unknown>)
      : undefined;
  return validateBoardEventArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    eventId: event.id,
    boardId: event.boardId,
    type: (importedType as BoardEventArtifact["type"] | undefined) ?? boardEventTypeForCurrentKind(event.kind),
    entityKind: entityKindForCurrentEvent(event),
    entityId: event.entityId,
    actor: importedActor ?? { kind: "importer", displayName: "ProjectStore export" },
    createdAt: event.createdAt,
    payload: importedPayload ?? {
      currentKind: event.kind,
      title: event.title,
      summary: event.summary,
      metadata: event.metadata,
    },
  });
}

function proposalFiles(proposals: ProjectBoardSynthesisProposal[], sources: ProjectBoardSource[]): ProjectBoardArtifactFile[] {
  return proposals.flatMap((proposal) => {
    const root = `proposals/${safeArtifactFileStem(proposal.id)}`;
    const progressiveRecords = projectBoardProgressiveRecordsFromDraft({
      draft: projectBoardSynthesisDraftFromProposal(proposal),
      sources,
      proposalId: proposal.id,
      createdAt: proposal.createdAt,
      includeProgress: false,
    });
    const finalProposal = validateProposalFinalArtifact({
      schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
      proposalId: proposal.id,
      boardId: proposal.boardId,
      status: proposal.status,
      summary: proposal.summary,
      goal: proposal.goal,
      currentState: proposal.currentState,
      targetUser: proposal.targetUser,
      qualityBar: proposal.qualityBar,
      assumptions: proposal.assumptions,
      questions: proposal.questions,
      answers: proposal.answers,
      sourceNotes: proposal.sourceNotes,
      cards: proposal.cards,
      reviewReport: proposal.reviewReport,
      model: proposal.model,
      durationMs: proposal.durationMs,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
      appliedAt: proposal.appliedAt,
    });
    return [
      artifactFile(`${root}/proposal.final.json`, finalProposal),
      {
        path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/questions.jsonl`,
        content: proposalJsonlContent(progressiveRecords, "question"),
      },
      {
        path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/proposal-final.jsonl`,
        content: proposalJsonlContent(progressiveRecords, "proposal_final"),
      },
      {
        path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/cards.partial.jsonl`,
        content: proposalJsonlContent(progressiveRecords, "candidate_card"),
      },
      {
        path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/source-coverage.jsonl`,
        content: proposalJsonlContent(progressiveRecords, "source_coverage"),
      },
      {
        path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/dependency-edges.jsonl`,
        content: proposalJsonlContent(progressiveRecords, "dependency_edge"),
      },
      {
        path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/warnings.jsonl`,
        content: proposalJsonlContent(progressiveRecords, "warning"),
      },
    ];
  });
}

function synthesisRunFiles(runs: ProjectBoardSynthesisRun[]): ProjectBoardArtifactFile[] {
  return runs.flatMap((run) => {
    const root = `proposals/${safeArtifactFileStem(run.id)}`;
    const progressiveRecords = progressiveRecordsForRun(run);
    const manifest = validateProposalManifestArtifact({
      schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
      proposalRunId: run.id,
      boardId: run.boardId,
      status: run.status,
      stage: proposalManifestStage(run.stage),
      model: run.model,
      sourceCount: run.sourceCount,
      sourceCharCount: run.sourceCharCount,
      promptCharCount: run.promptCharCount,
      responseCharCount: run.responseCharCount,
      cardCount: run.cardCount,
      questionCount: run.questionCount,
      warningCount: run.warningCount,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
      error: run.error,
    });
    const progressJsonl = run.events
      .map((event) =>
        JSON.stringify({
          type: "progress",
          stage: event.stage,
          title: event.title,
          summary: event.summary,
          createdAt: event.createdAt,
          metadata: event.metadata,
        }),
      )
      .join("\n")
      .concat(run.events.length > 0 ? "\n" : "");
    parseBoardArtifactJsonl(progressJsonl, proposalJsonlRecordArtifactSchema, `${run.id} progress`);
    const files: ProjectBoardArtifactFile[] = [
      artifactFile(`${root}/manifest.json`, manifest),
      { path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/progress.jsonl`, content: progressJsonl },
    ];
    if (progressiveRecords.length > 0) {
      const sectionStatusContent = proposalJsonlContent(progressiveRecords, "progress");
      const plannerActions = projectBoardPlannerActionsFromProgressiveRecords({
        records: progressiveRecords,
        proposalRunId: run.id,
        createdAt: run.updatedAt,
      });
      files.push(
        ...(plannerActions.length > 0
          ? [
              {
                path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/planner-actions.jsonl`,
                content: plannerActionJsonlContent(plannerActions),
              },
            ]
          : []),
        ...(sectionStatusContent.trim()
          ? [
              {
                path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/section-status.jsonl`,
                content: sectionStatusContent,
              },
            ]
          : []),
        {
          path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/cards.partial.jsonl`,
          content: proposalJsonlContent(progressiveRecords, "candidate_card"),
        },
        {
          path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/questions.jsonl`,
          content: proposalJsonlContent(progressiveRecords, "question"),
        },
        ...(proposalJsonlContent(progressiveRecords, "proposal_final").trim()
          ? [
              {
                path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/proposal-final.jsonl`,
                content: proposalJsonlContent(progressiveRecords, "proposal_final"),
              },
            ]
          : []),
        {
          path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/source-coverage.jsonl`,
          content: proposalJsonlContent(progressiveRecords, "source_coverage"),
        },
        {
          path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/dependency-edges.jsonl`,
          content: proposalJsonlContent(progressiveRecords, "dependency_edge"),
        },
        {
          path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/warnings.jsonl`,
          content: proposalJsonlContent(progressiveRecords, "warning"),
        },
        {
          path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${root}/errors.jsonl`,
          content: proposalJsonlContent(progressiveRecords, "error"),
        },
      );
    }
    return files;
  });
}

function progressiveRecordsForRun(run: ProjectBoardSynthesisRun): ProposalJsonlRecordArtifact[] {
  return (run.progressiveRecords ?? []).flatMap((record) => {
    try {
      return [validateProposalJsonlRecordArtifact(record)];
    } catch {
      return [];
    }
  });
}

function runtimeArtifactsFromBoard(
  board: ProjectBoardSummary,
  cards: CardArtifact[],
  runtime?: ProjectBoardRuntimeExportContext,
): { runManifests: RunManifestArtifact[]; runProofs: RunProofArtifact[]; runHandoffs: RunHandoffArtifact[]; events: BoardEventArtifact[] } {
  if (!runtime) return { runManifests: [], runProofs: [], runHandoffs: [], events: [] };
  const cardsByTaskId = new Map(cards.flatMap((card) => (card.orchestrationTaskId ? [[card.orchestrationTaskId, card] as const] : [])));
  const tasksById = new Map(runtime.tasks.map((task) => [task.id, task]));
  const runManifests: RunManifestArtifact[] = [];
  const runProofs: RunProofArtifact[] = [];
  const runHandoffs: RunHandoffArtifact[] = [];
  const events: BoardEventArtifact[] = [];

  for (const run of [...runtime.runs].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id))) {
    const card = cardsByTaskId.get(run.taskId);
    if (!card) continue;
    const task = tasksById.get(run.taskId);
    const manifest = validateRunManifestArtifact({
      schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
      runId: run.id,
      boardId: board.id,
      cardId: card.cardId,
      status: runManifestStatus(run.status),
      agentId: "ambient-desktop",
      piSessionId: run.piSessionFile,
      workspaceBranch: task?.branchName,
      startedAt: run.startedAt,
      updatedAt: run.lastEventAt ?? run.finishedAt ?? run.startedAt,
      completedAt: run.finishedAt,
    });
    runManifests.push(manifest);
    events.push(runStatusEventFromRun(board, card, task, run, manifest));
    events.push(...runTaskToolActionEventsFromRun(board, card, task, run));

    const proof = runProofArtifactFromRun(board, card, run);
    if (proof) runProofs.push(proof);
    const handoff = runHandoffArtifactFromRun(board, card, run);
    if (handoff) {
      runHandoffs.push(handoff);
      events.push(runHandoffEventFromRun(board, card, run, handoff));
    }
  }

  return {
    runManifests,
    runProofs,
    runHandoffs,
    events,
  };
}

function executionArtifactsFromBoard(
  board: ProjectBoardSummary,
): { runManifests: RunManifestArtifact[]; runProofs: RunProofArtifact[]; runHandoffs: RunHandoffArtifact[] } {
  const runManifests: RunManifestArtifact[] = [];
  const runProofs: RunProofArtifact[] = [];
  const runHandoffs: RunHandoffArtifact[] = [];
  const cardIds = new Set(board.cards.map((card) => card.id));

  for (const artifact of board.executionArtifacts ?? []) {
    if (!cardIds.has(artifact.cardId)) continue;
    runManifests.push(runManifestArtifactFromExecutionArtifact(board, artifact));
    if (artifact.proof) {
      runProofs.push(
        validateRunProofArtifact({
          schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
          runId: artifact.id,
          boardId: board.id,
          cardId: artifact.cardId,
          summary: artifact.proof.summary,
          commands: artifact.proof.commands,
          changedFiles: artifact.proof.changedFiles,
          screenshots: artifact.proof.screenshots,
          browserTraces: artifact.proof.browserTraces,
          visualChecks: artifact.proof.visualChecks,
          manualChecks: artifact.proof.manualChecks,
          createdAt: artifact.proof.createdAt,
        }),
      );
    }
    if (artifact.handoff) {
      runHandoffs.push(
        validateRunHandoffArtifact({
          schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
          runId: artifact.id,
          boardId: board.id,
          cardId: artifact.cardId,
          summary: artifact.handoff.summary,
          completed: artifact.handoff.completed,
          remaining: artifact.handoff.remaining,
          risks: artifact.handoff.risks,
          followUps: artifact.handoff.followUps,
          createdAt: artifact.handoff.createdAt,
        }),
      );
    }
  }

  return { runManifests, runProofs, runHandoffs };
}

function runManifestArtifactFromExecutionArtifact(board: ProjectBoardSummary, artifact: ProjectBoardExecutionArtifact): RunManifestArtifact {
  return validateRunManifestArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    runId: artifact.id,
    boardId: board.id,
    cardId: artifact.cardId,
    status: runManifestStatus(artifact.status),
    agentId: artifact.agentId,
    piSessionId: artifact.piSessionId,
    workspaceBranch: artifact.workspaceBranch,
    startedAt: artifact.startedAt,
    updatedAt: artifact.updatedAt,
    completedAt: artifact.completedAt,
  });
}

function runStatusEventFromRun(
  board: ProjectBoardSummary,
  card: CardArtifact,
  task: OrchestrationTask | undefined,
  run: OrchestrationRun,
  manifest: RunManifestArtifact,
): BoardEventArtifact {
  return validateBoardEventArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    eventId: stableRunEventId(board.id, card.cardId, run.id, `status-${manifest.status}`),
    boardId: board.id,
    type: runEventTypeForStatus(manifest.status),
    entityKind: "run",
    entityId: run.id,
    actor: { kind: "ambient-desktop", displayName: "Local Task runner", piSessionId: run.piSessionFile },
    createdAt: run.lastEventAt ?? run.finishedAt ?? run.startedAt,
    payload: {
      cardId: card.cardId,
      taskId: run.taskId,
      taskIdentifier: task?.identifier,
      taskTitle: task?.title,
      runId: run.id,
      attemptNumber: run.attemptNumber,
      status: run.status,
      normalizedStatus: manifest.status,
      workspacePath: run.workspacePath,
      workspaceBranch: task?.branchName,
      threadId: run.threadId,
      piSessionFile: run.piSessionFile,
      error: run.error,
    },
  });
}

function runHandoffEventFromRun(
  board: ProjectBoardSummary,
  card: CardArtifact,
  run: OrchestrationRun,
  handoff: RunHandoffArtifact,
): BoardEventArtifact {
  return validateBoardEventArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    eventId: stableRunEventId(board.id, card.cardId, run.id, "handoff"),
    boardId: board.id,
    type: "run.handoff_created",
    entityKind: "run",
    entityId: run.id,
    actor: { kind: "ambient-desktop", displayName: "Local Task runner", piSessionId: run.piSessionFile },
    createdAt: handoff.createdAt,
    payload: {
      cardId: card.cardId,
      runId: run.id,
      taskId: run.taskId,
      summary: handoff.summary,
      completedCount: handoff.completed.length,
      remainingCount: handoff.remaining.length,
      riskCount: handoff.risks.length,
      followUpCount: handoff.followUps.length,
    },
  });
}

function runTaskToolActionEventsFromRun(
  board: ProjectBoardSummary,
  card: CardArtifact,
  task: OrchestrationTask | undefined,
  run: OrchestrationRun,
): BoardEventArtifact[] {
  const actions = projectBoardTaskToolActionsFromProofOfWork(run.proofOfWork);
  return actions.map((action) =>
    validateBoardEventArtifact({
      schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
      eventId: stableRunEventId(board.id, card.cardId, run.id, `task-action-${action.action}-${action.actionId}`),
      boardId: board.id,
      type: runEventTypeForTaskToolAction(action),
      entityKind: action.action === "task_create_followup" ? "card" : "run",
      entityId: action.action === "task_create_followup" ? card.cardId : run.id,
      actor: { kind: "pi-worker", displayName: "Pi worker", piSessionId: run.piSessionFile },
      createdAt: action.createdAt,
      payload: {
        cardId: card.cardId,
        taskId: run.taskId,
        taskIdentifier: task?.identifier,
        taskTitle: task?.title,
        runId: run.id,
        actionId: action.actionId,
        action: action.action,
        title: projectBoardTaskToolActionTitle(action),
        summary: projectBoardTaskToolActionSummary(action),
        taskToolAction: action,
      },
    }),
  );
}

function runEventTypeForTaskToolAction(action: ProjectBoardTaskToolAction): BoardEventArtifact["type"] {
  if (action.action === "task_block") return "run.blocked";
  if (action.action === "task_complete") return "run.completed";
  if (action.action === "task_create_followup") return "card.followup_created";
  if (action.action === "task_report_handoff") return "run.handoff_created";
  return "run.progress";
}

function runProofArtifactFromRun(board: ProjectBoardSummary, card: CardArtifact, run: OrchestrationRun): RunProofArtifact | undefined {
  const proof = run.proofOfWork ?? {};
  const taskActions = projectBoardTaskToolActionsFromProofOfWork(proof);
  if (Object.keys(proof).length === 0 && !run.error) return undefined;
  return validateRunProofArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    runId: run.id,
    boardId: board.id,
    cardId: card.cardId,
    summary: proofSummary(run),
    commands: unique([
      ...stringsFromUnknown(recordValue(proof, "commands")),
      ...stringsFromUnknown(recordValue(proof, "executedCommands")),
      ...stringsFromUnknown(recordValue(proof, "commandLog")),
      ...projectBoardTaskToolCommands(taskActions),
    ]),
    changedFiles: projectRelativePathsFromUnknown(
      [recordValue(proof, "changedFiles"), recordValue(proof, "filesChanged"), recordValue(proof, "modifiedFiles"), projectBoardTaskToolChangedFiles(taskActions)],
      board.projectPath,
      run.workspacePath,
    ),
    screenshots: projectRelativePathsFromUnknown(
      [recordValue(proof, "screenshots"), recordValue(proof, "screenshotPaths"), projectBoardTaskToolScreenshots(taskActions)],
      board.projectPath,
      run.workspacePath,
    ),
    browserTraces: projectRelativePathsFromUnknown(
      [recordValue(proof, "browserTraces"), recordValue(proof, "traces"), recordValue(proof, "tracePaths"), projectBoardTaskToolBrowserTraces(taskActions)],
      board.projectPath,
      run.workspacePath,
    ),
    visualChecks: [...looseObjectsFromUnknown(recordValue(proof, "visualChecks")), ...projectBoardTaskToolVisualChecks(taskActions)],
    manualChecks: unique([...stringsFromUnknown(recordValue(proof, "manualChecks")), ...stringsFromUnknown(recordValue(proof, "manualProof")), ...projectBoardTaskToolManualChecks(taskActions)]),
    createdAt: run.finishedAt ?? run.lastEventAt ?? run.startedAt,
  });
}

function runHandoffArtifactFromRun(board: ProjectBoardSummary, card: CardArtifact, run: OrchestrationRun): RunHandoffArtifact | undefined {
  const proof = run.proofOfWork ?? {};
  const handoff = recordFromUnknown(recordValue(proof, "handoff")) ?? {};
  const taskActions = projectBoardTaskToolActionsFromProofOfWork(proof);
  if (Object.keys(proof).length === 0 && !run.error && run.status !== "completed" && run.status !== "failed" && run.status !== "stalled") return undefined;
  return validateRunHandoffArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    runId: run.id,
    boardId: board.id,
    cardId: card.cardId,
    summary: handoffSummary(run),
    completed: unique([...stringsFromUnknown(recordValue(handoff, "completed")), ...stringsFromUnknown(recordValue(proof, "completed")), ...projectBoardTaskToolCompleted(taskActions)]),
    remaining: unique([
      ...stringsFromUnknown(recordValue(handoff, "remaining")),
      ...stringsFromUnknown(recordValue(proof, "remaining")),
      ...stringsFromUnknown(recordValue(proof, "nextSteps")),
      ...projectBoardTaskToolRemaining(taskActions),
    ]),
    risks: unique([
      ...stringsFromUnknown(recordValue(handoff, "risks")),
      ...stringsFromUnknown(recordValue(proof, "risks")),
      ...projectBoardTaskToolRisks(taskActions),
      ...(run.error ? [run.error] : []),
    ]),
    followUps: [...followUpsFromUnknown(recordValue(handoff, "followUps") ?? recordValue(proof, "followUps")), ...projectBoardTaskToolFollowUps(taskActions)],
    createdAt: run.finishedAt ?? run.lastEventAt ?? run.startedAt,
  });
}

function runManifestStatus(status: string): RunManifestArtifact["status"] {
  const normalized = status.trim().toLowerCase().replace(/[^a-z]+/g, "_");
  if (
    normalized === "queued" ||
    normalized === "claimed" ||
    normalized === "prepared" ||
    normalized === "preparing" ||
    normalized === "running" ||
    normalized === "completed" ||
    normalized === "failed" ||
    normalized === "blocked" ||
    normalized === "canceled" ||
    normalized === "stalled" ||
    normalized === "review"
  ) {
    return normalized;
  }
  if (normalized === "done" || normalized === "succeeded" || normalized === "success") return "completed";
  if (normalized === "cancelled") return "canceled";
  if (normalized === "needs_review" || normalized === "ready_for_review") return "review";
  return "running";
}

function runEventTypeForStatus(status: RunManifestArtifact["status"]): BoardEventArtifact["type"] {
  if (status === "prepared" || status === "preparing" || status === "claimed" || status === "queued") return "run.prepared";
  if (status === "running") return "run.started";
  if (status === "completed" || status === "review") return "run.completed";
  if (status === "blocked") return "run.blocked";
  if (status === "canceled") return "run.canceled";
  if (status === "stalled") return "run.stalled";
  return "run.failed";
}

function proofSummary(run: OrchestrationRun): string {
  const proof = run.proofOfWork ?? {};
  const taskActions = projectBoardTaskToolActionsFromProofOfWork(proof);
  return (
    projectBoardTaskToolProofSummary(taskActions) ??
    stringFromUnknown(recordValue(proof, "summary")) ??
    stringFromUnknown(recordValue(recordFromUnknown(recordValue(proof, "projectBoardReview")) ?? {}, "summary")) ??
    stringFromUnknown(recordValue(proof, "lastAssistantText")) ??
    run.error ??
    `Local Task run ${run.id} is ${run.status}.`
  );
}

function handoffSummary(run: OrchestrationRun): string {
  const proof = run.proofOfWork ?? {};
  const handoff = recordFromUnknown(recordValue(proof, "handoff")) ?? {};
  const taskActions = projectBoardTaskToolActionsFromProofOfWork(proof);
  return (
    projectBoardTaskToolHandoffSummary(taskActions) ??
    stringFromUnknown(recordValue(handoff, "summary")) ??
    stringFromUnknown(recordValue(proof, "handoffSummary")) ??
    proofSummary(run) ??
    `Local Task run ${run.id} produced no explicit handoff summary.`
  );
}

function followUpsFromUnknown(value: unknown): RunHandoffArtifact["followUps"] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return values.flatMap((item) => {
    if (typeof item === "string") return [{ title: item.slice(0, 240), reason: item, blockedBy: [] }];
    const record = recordFromUnknown(item);
    if (!record) return [];
    const title = stringFromUnknown(record.title) ?? stringFromUnknown(record.summary) ?? stringFromUnknown(record.reason);
    if (!title) return [];
    return [
      {
        title: title.slice(0, 240),
        reason: stringFromUnknown(record.reason) ?? stringFromUnknown(record.summary) ?? "",
        blockedBy: stringsFromUnknown(record.blockedBy).filter((blocker) => /^[A-Za-z0-9][A-Za-z0-9._:#-]{0,159}$/.test(blocker)),
      },
    ];
  });
}

function stringsFromUnknown(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return values.flatMap((item) => {
    if (typeof item === "string") return [item.trim()].filter(Boolean);
    if (typeof item === "number" || typeof item === "boolean") return [String(item)];
    const record = recordFromUnknown(item);
    const text =
      record &&
      (stringFromUnknown(record.command) ??
        stringFromUnknown(record.path) ??
        stringFromUnknown(record.file) ??
        stringFromUnknown(record.summary) ??
        stringFromUnknown(record.title) ??
        stringFromUnknown(record.text) ??
        stringFromUnknown(record.message));
    return text ? [text.trim()] : [];
  });
}

function looseObjectsFromUnknown(value: unknown): Array<Record<string, unknown>> {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return values.flatMap((item) => {
    const record = recordFromUnknown(item);
    if (record) return [record];
    if (typeof item === "string") return [{ summary: item }];
    return [];
  });
}

function projectRelativePathsFromUnknown(values: unknown[], projectRoot: string, workspacePath: string): string[] {
  return unique(
    values
      .flatMap(stringsFromUnknown)
      .flatMap((value) => projectRelativePathCandidates(value, projectRoot, workspacePath))
      .map((value) => value.replace(/\\/g, "/").replace(/\/+/g, "/"))
      .filter((value) => value && !value.startsWith("/") && !value.startsWith("~") && !value.split("/").some((segment) => segment === "..")),
  );
}

function projectRelativePathCandidates(value: string, projectRoot: string, workspacePath: string): string[] {
  const normalized = value.trim();
  if (!normalized) return [];
  if (!isAbsolute(normalized)) return [normalized];
  const roots = [workspacePath, projectRoot].filter(Boolean);
  for (const root of roots) {
    const candidate = relative(root, normalized);
    if (candidate && !candidate.startsWith("..") && !isAbsolute(candidate)) return [candidate];
  }
  return [];
}

function recordValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stableRunEventId(boardId: string, cardId: string, runId: string, kind: string): string {
  return `evt-${safeArtifactFileStem(`run-${kind}-${boardId}-${cardId}-${runId}`).slice(0, 150)}`;
}

function artifactFile(relativePath: string, value: unknown): ProjectBoardArtifactFile {
  return {
    path: `${PROJECT_BOARD_ARTIFACT_ROOT}/${relativePath}`,
    content: serializeBoardArtifact(value),
  };
}

export function projectBoardCardArtifactPath(cardId: string): string {
  return `${PROJECT_BOARD_ARTIFACT_ROOT}/cards/${safeArtifactFileStem(cardId)}.json`;
}

function boardEventTypeForCurrentKind(kind: ProjectBoardEventKind): BoardEventArtifact["type"] {
  const map: Record<ProjectBoardEventKind, BoardEventArtifact["type"]> = {
    board_created: "board.created",
    board_revision_started: "charter.revision_started",
    status_changed: "board.status_changed",
    sources_refreshed: "sources.refreshed",
    board_synthesized: "board.synthesized",
    synthesis_proposal_created: "proposal.completed",
    synthesis_proposal_answered: "proposal.question_answered",
    synthesis_proposal_card_reviewed: "proposal.card_reviewed",
    synthesis_proposal_applied: "proposal.applied",
    source_updated: "source.classified",
    question_answered: "charter.question_answered",
    kickoff_defaults_suggested: "charter.kickoff_defaults_suggested",
    charter_finalized: "charter.applied",
    charter_summary_refreshed: "charter.summary_refreshed",
    plan_promoted: "plan.promoted",
    card_updated: "card.updated",
    candidate_status_changed: "card.status_changed",
    card_split: "card.split",
    card_ticketized: "card.ticketized",
    card_execution_session_assigned: "card.execution_session_assigned",
    card_run_prepared: "run.prepared",
    card_run_started: "run.started",
    card_run_progress: "run.progress",
    card_run_completed: "run.completed",
    card_run_failed: "run.failed",
    card_run_blocked: "run.blocked",
    card_run_canceled: "run.canceled",
    card_run_stalled: "run.stalled",
    card_run_handoff_created: "run.handoff_created",
    card_claimed: "card.claimed",
    card_heartbeat: "card.heartbeat",
    card_claim_released: "card.claim_released",
    card_claim_expired: "card.claim_expired",
    execution_readiness_blocked: "board.execution_readiness_blocked",
    workflow_created: "board.workflow_created",
    workflow_impact_resolved: "board.workflow_impact_resolved",
    workflow_repaired: "board.workflow_repaired",
    workflow_settings_updated: "board.workflow_settings_updated",
    workflow_raw_updated: "board.workflow_raw_updated",
    ready_tasks_created: "board.ready_tasks_created",
    run_follow_up_created: "card.followup_created",
    card_proof_reviewed: "card.proof_reviewed",
    card_proof_review_ignored: "card.proof_reviewed",
    manual_card_created: "card.created",
    local_task_attached: "local_task.attached",
    local_task_imported_as_evidence: "local_task.imported_as_evidence",
    deliverable_integration_resolved: "run.deliverable_integration_resolved",
  };
  return map[kind];
}

function entityKindForCurrentEvent(event: ProjectBoardEvent): BoardEventArtifact["entityKind"] {
  if (event.entityKind === "card") return "card";
  if (event.entityKind === "source") return "source";
  if (event.entityKind === "proposal") return "proposal";
  if (event.entityKind === "task") return "task";
  if (event.entityKind === "run" || event.entityKind === "orchestration_run") return "run";
  if (event.kind === "deliverable_integration_resolved") return "run";
  if (event.kind.startsWith("card_run_")) return "run";
  if (event.kind.startsWith("charter") || event.kind === "question_answered" || event.kind === "kickoff_defaults_suggested" || event.kind === "board_revision_started") return "charter";
  if (event.kind.startsWith("synthesis")) return "proposal";
  if (event.kind.startsWith("card") || event.kind === "manual_card_created" || event.kind === "run_follow_up_created") return "card";
  return "board";
}

function proposalManifestStage(stage: ProjectBoardSynthesisRun["stage"]): ProposalManifestArtifact["stage"] {
  if (stage === "source_scan" || stage === "sources_persisted") return "source_scan";
  if (stage === "source_classification") return "source_classification";
  if (stage === "paused") return "paused";
  if (stage === "board_applied" || stage === "proposal_created") return "completed";
  if (stage === "failed") return "failed";
  if (stage === "schema_validation") return "importing";
  return "planning";
}

function safeArtifactFileStem(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "artifact";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const itemKey = key(value);
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);
    result.push(value);
  }
  return result;
}
