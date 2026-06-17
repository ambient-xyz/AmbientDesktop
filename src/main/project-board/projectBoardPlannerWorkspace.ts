import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  parseBoardArtifactJsonl,
  proposalJsonlRecordArtifactSchema,
  stableBoardArtifactId,
  validateProposalJsonlRecordArtifact,
  type ProposalJsonlRecordArtifact,
} from "./projectBoardArtifacts";
import { proposalJsonlContent } from "./projectBoardProgressivePlanning";
import { buildProjectBoardRenderedCardLedger } from "./projectBoardRenderedCardLedger";
import type { ProjectBoardSynthesisSource } from "./projectBoardSynthesis";

export interface ProjectBoardPlannerWorkspaceSource {
  sourceId: string;
  title: string;
  kind: ProjectBoardSynthesisSource["kind"];
  summary: string;
  originalPath?: string;
  contentHash?: string;
  workspacePath: string;
  charCount: number;
  relevance: number;
}

export interface ProjectBoardPlannerWorkspace {
  boardId: string;
  runId: string;
  operation: ProjectBoardPlannerWorkspaceInput["operation"];
  projectName?: string;
  sessionId: string;
  rootPath: string;
  sessionPath: string;
  ledgerPath: string;
  manifestPath: string;
  instructionsPath: string;
  sourcesDir: string;
  outputsDir: string;
  aggregateJsonlPath: string;
  outputPaths: Record<ProposalJsonlRecordArtifact["type"], string>;
  sources: ProjectBoardPlannerWorkspaceSource[];
  batchPolicy: ProjectBoardPlannerBatchPolicy;
}

export interface ProjectBoardPlannerWorkspaceInput {
  projectPath: string;
  boardId: string;
  runId: string;
  projectName?: string;
  operation: "board_synthesis" | "section_elaboration" | "source_elaboration";
  sources: ProjectBoardSynthesisSource[];
}

export interface ProjectBoardPlannerWorkspaceTailState {
  seenRecordKeys: Set<string>;
  seenErrorKeys: Set<string>;
}

export type ProjectBoardPlannerStopState =
  | "planning_complete"
  | "needs_user_decision"
  | "budget_exhausted"
  | "stale_source_snapshot"
  | "validation_failed"
  | "user_cancelled";

export interface ProjectBoardPlannerBatchPolicy {
  minCandidateCardsPerBatch: number;
  maxCandidateCardsPerBatch: number;
  outputUnit: "validated_progressive_jsonl_records";
  continuationMode: "same_session_next_cards";
  stopStates: ProjectBoardPlannerStopState[];
}

const OUTPUT_FILENAMES: Record<ProposalJsonlRecordArtifact["type"], string> = {
  progress: "progress.jsonl",
  candidate_card: "candidate-cards.jsonl",
  question: "questions.jsonl",
  proposal_final: "proposal-final.jsonl",
  source_coverage: "source-coverage.jsonl",
  dependency_edge: "dependency-edges.jsonl",
  warning: "warnings.jsonl",
  error: "errors.jsonl",
};

export async function createProjectBoardPlannerWorkspace(input: ProjectBoardPlannerWorkspaceInput): Promise<ProjectBoardPlannerWorkspace> {
  const rootPath = join(input.projectPath, ".ambient", "board", "planner-workspaces", safePathSegment(input.runId));
  const sourcesDir = join(rootPath, "sources");
  const outputsDir = join(rootPath, "outputs");
  await mkdir(sourcesDir, { recursive: true });
  await mkdir(outputsDir, { recursive: true });

  const sourceEntries = input.sources.filter(
    (source) => source.kind !== "ignored" && source.includeInSynthesis !== false && sourceText(source).trim(),
  );
  const sources = sourceEntries.map((source, index): ProjectBoardPlannerWorkspaceSource => {
    const sourceId = source.id?.trim() || stableBoardArtifactId("source", [source.path, source.title, index]);
    const filename = `${String(index + 1).padStart(3, "0")}-${safePathSegment(source.path || source.title || sourceId)}.md`;
    return {
      sourceId,
      title: source.title,
      kind: source.kind,
      summary: source.summary,
      ...(source.path ? { originalPath: source.path } : {}),
      ...(source.contentHash ? { contentHash: source.contentHash } : {}),
      workspacePath: join(sourcesDir, filename),
      charCount: sourceText(source).length,
      relevance: source.relevance,
    };
  });

  await Promise.all(
    sources.map((workspaceSource, index) => {
      const source = sourceEntries[index];
      return writeFile(workspaceSource.workspacePath, sourceFileContent(source, workspaceSource), "utf8");
    }),
  );

  const outputPaths = Object.fromEntries(
    Object.entries(OUTPUT_FILENAMES).map(([type, filename]) => [type, join(outputsDir, filename)]),
  ) as Record<ProposalJsonlRecordArtifact["type"], string>;
  const aggregateJsonlPath = join(outputsDir, "proposal.records.jsonl");
  const sessionId = stableBoardArtifactId("planner-session", [input.boardId, input.runId, input.operation]);
  const sessionPath = join(rootPath, "planner-session.json");
  const ledgerPath = join(rootPath, "planner-ledger.json");
  const manifestPath = join(rootPath, "manifest.json");
  const instructionsPath = join(rootPath, "instructions.md");
  const batchPolicy = projectBoardPlannerBatchPolicy(input.operation);
  const workspace: ProjectBoardPlannerWorkspace = {
    boardId: input.boardId,
    runId: input.runId,
    operation: input.operation,
    ...(input.projectName ? { projectName: input.projectName } : {}),
    sessionId,
    rootPath,
    sessionPath,
    ledgerPath,
    manifestPath,
    instructionsPath,
    sourcesDir,
    outputsDir,
    aggregateJsonlPath,
    outputPaths,
    sources,
    batchPolicy,
  };
  await writeFile(manifestPath, `${JSON.stringify(plannerWorkspaceManifest(input, workspace), null, 2)}\n`, "utf8");
  await writeFile(sessionPath, `${JSON.stringify(plannerWorkspaceSessionDescriptor(workspace), null, 2)}\n`, "utf8");
  await writeProjectBoardPlannerWorkspaceLedger(workspace, []);
  await writeFile(instructionsPath, plannerWorkspaceInstructions(input, workspace), "utf8");
  await writeFile(aggregateJsonlPath, "", { flag: "a" });
  await Promise.all(Object.values(outputPaths).map((path) => writeFile(path, "", { flag: "a" })));
  return workspace;
}

export function projectBoardPlannerWorkspacePromptBlock(workspace?: ProjectBoardPlannerWorkspace): string {
  if (!workspace) return "";
  return [
    "Planner workspace:",
    `- Planner session id: ${workspace.sessionId}`,
    `- Root: ${workspace.rootPath}`,
    `- Session descriptor: ${workspace.sessionPath}`,
    `- Planner ledger: ${workspace.ledgerPath}`,
    `- Manifest: ${workspace.manifestPath}`,
    `- Instructions: ${workspace.instructionsPath}`,
    `- Aggregate JSONL output: ${workspace.aggregateJsonlPath}`,
    `- Batch policy target: progressive Pi-session planning asks for the next ${workspace.batchPolicy.minCandidateCardsPerBatch}-${workspace.batchPolicy.maxCandidateCardsPerBatch} candidate_card records, persists validated records, updates the ledger, then continues in the same planner session until a typed stop state is reached.`,
    `- Stop states: ${workspace.batchPolicy.stopStates.join(", ")}`,
    "- Type-specific JSONL outputs:",
    ...Object.entries(workspace.outputPaths).map(([type, path]) => `  - ${type}: ${path}`),
    "- Source files:",
    ...workspace.sources.map(
      (source, index) =>
        `  ${index + 1}. ${source.sourceId} (${source.kind}, relevance ${source.relevance}, ${source.charCount.toLocaleString()} chars): ${source.workspacePath}`,
    ),
    "",
    "If file-write tools are available, write each progressive JSONL planning record to the aggregate output as soon as it is ready and also to the matching type-specific file. Still return compact JSON/JSONL in the response for Ambient compatibility.",
    "Use stable sourceId/card ids and avoid rewriting records that already appear in the planner ledger.",
  ].join("\n");
}

export async function readProjectBoardPlannerWorkspaceRecords(
  workspace?: ProjectBoardPlannerWorkspace,
): Promise<ProposalJsonlRecordArtifact[]> {
  if (!workspace) return [];
  const paths = [workspace.aggregateJsonlPath, ...Object.values(workspace.outputPaths)];
  const records: ProposalJsonlRecordArtifact[] = [];
  for (const path of paths) {
    let content = "";
    try {
      content = await readFile(path, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
    if (!content.trim()) continue;
    records.push(...parseBoardArtifactJsonl(content, proposalJsonlRecordArtifactSchema, path));
  }
  return dedupePlannerWorkspaceRecords(records);
}

export async function readProjectBoardPlannerWorkspaceRecordsFromRoot(rootPath?: string): Promise<ProposalJsonlRecordArtifact[]> {
  if (!rootPath?.trim()) return [];
  return readProjectBoardPlannerWorkspaceRecords(projectBoardPlannerWorkspaceFromRoot(rootPath.trim()));
}

export function projectBoardPlannerWorkspaceFromRoot(rootPath: string): ProjectBoardPlannerWorkspace {
  const sourcesDir = join(rootPath, "sources");
  const outputsDir = join(rootPath, "outputs");
  return {
    boardId: "",
    runId: "",
    operation: "board_synthesis",
    sessionId: stableBoardArtifactId("planner-session", [rootPath]),
    rootPath,
    sessionPath: join(rootPath, "planner-session.json"),
    ledgerPath: join(rootPath, "planner-ledger.json"),
    manifestPath: join(rootPath, "manifest.json"),
    instructionsPath: join(rootPath, "instructions.md"),
    sourcesDir,
    outputsDir,
    aggregateJsonlPath: join(outputsDir, "proposal.records.jsonl"),
    outputPaths: Object.fromEntries(
      Object.entries(OUTPUT_FILENAMES).map(([type, filename]) => [type, join(outputsDir, filename)]),
    ) as Record<ProposalJsonlRecordArtifact["type"], string>,
    sources: [],
    batchPolicy: projectBoardPlannerBatchPolicy("board_synthesis"),
  };
}

export function createProjectBoardPlannerWorkspaceTailState(
  existingRecords: ProposalJsonlRecordArtifact[] = [],
): ProjectBoardPlannerWorkspaceTailState {
  return {
    seenRecordKeys: new Set(existingRecords.map(recordKey)),
    seenErrorKeys: new Set(),
  };
}

export function markProjectBoardPlannerWorkspaceTailRecords(
  state: ProjectBoardPlannerWorkspaceTailState,
  records: ProposalJsonlRecordArtifact[],
): void {
  for (const record of records) state.seenRecordKeys.add(recordKey(record));
}

export async function pollProjectBoardPlannerWorkspaceRecords(input: {
  workspace?: ProjectBoardPlannerWorkspace;
  state: ProjectBoardPlannerWorkspaceTailState;
  includeIncompleteLastLine?: boolean;
}): Promise<ProposalJsonlRecordArtifact[]> {
  if (!input.workspace) return [];
  const records: ProposalJsonlRecordArtifact[] = [];
  for (const path of plannerWorkspaceJsonlPaths(input.workspace)) {
    let content = "";
    try {
      content = await readFile(path, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
    if (!content.trim()) continue;
    const lines = content.split(/\r?\n/);
    const lastIndex = lines.length - 1;
    for (const [lineIndex, line] of lines.entries()) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const isIncompleteLastLine = lineIndex === lastIndex && !content.endsWith("\n") && !input.includeIncompleteLastLine;
      if (isIncompleteLastLine) continue;
      const record = parsePlannerWorkspaceJsonlLine(path, lineIndex + 1, trimmed, input.state);
      if (!record) continue;
      const key = recordKey(record);
      if (input.state.seenRecordKeys.has(key)) continue;
      input.state.seenRecordKeys.add(key);
      records.push(record);
    }
  }
  return records;
}

export async function appendProjectBoardPlannerWorkspaceRecords(
  workspace: ProjectBoardPlannerWorkspace | undefined,
  records: ProposalJsonlRecordArtifact[],
): Promise<void> {
  if (!workspace) return;
  const deduped = dedupePlannerWorkspaceRecords(records);
  if (deduped.length === 0) return;
  await writeFile(workspace.aggregateJsonlPath, proposalJsonlContent(deduped), { flag: "a" });
  await Promise.all(
    Object.entries(workspace.outputPaths).map(([type, path]) => {
      const content = proposalJsonlContent(deduped, type as ProposalJsonlRecordArtifact["type"]);
      return content ? writeFile(path, content, { flag: "a" }) : Promise.resolve();
    }),
  );
  const workspaceRecords = await readProjectBoardPlannerWorkspaceRecords(workspace);
  await writeProjectBoardPlannerWorkspaceLedger(workspace, workspaceRecords);
}

function plannerWorkspaceJsonlPaths(workspace: ProjectBoardPlannerWorkspace): string[] {
  return [workspace.aggregateJsonlPath, ...Object.values(workspace.outputPaths)];
}

function plannerWorkspaceManifest(input: ProjectBoardPlannerWorkspaceInput, workspace: ProjectBoardPlannerWorkspace) {
  return {
    schemaVersion: 1,
    sessionId: workspace.sessionId,
    boardId: input.boardId,
    runId: input.runId,
    projectName: input.projectName,
    operation: input.operation,
    rootPath: workspace.rootPath,
    sessionPath: workspace.sessionPath,
    ledgerPath: workspace.ledgerPath,
    instructionsPath: workspace.instructionsPath,
    aggregateJsonlPath: workspace.aggregateJsonlPath,
    outputPaths: workspace.outputPaths,
    batchPolicy: workspace.batchPolicy,
    sources: workspace.sources.map((source) => ({
      ...source,
      workspacePath: relative(workspace.rootPath, source.workspacePath),
    })),
  };
}

function plannerWorkspaceSessionDescriptor(workspace: ProjectBoardPlannerWorkspace) {
  return {
    schemaVersion: 1,
    sessionId: workspace.sessionId,
    boardId: workspace.boardId,
    runId: workspace.runId,
    projectName: workspace.projectName,
    operation: workspace.operation,
    executionMode: "pi_session_stream",
    compatibilityFallback: "direct_chat_compat",
    batchPolicy: workspace.batchPolicy,
    paths: {
      root: workspace.rootPath,
      manifest: workspace.manifestPath,
      instructions: workspace.instructionsPath,
      ledger: workspace.ledgerPath,
      aggregateJsonl: workspace.aggregateJsonlPath,
      outputs: workspace.outputPaths,
      sourcesDir: workspace.sourcesDir,
    },
    createdAt: new Date().toISOString(),
  };
}

async function writeProjectBoardPlannerWorkspaceLedger(
  workspace: ProjectBoardPlannerWorkspace,
  records: ProposalJsonlRecordArtifact[],
): Promise<void> {
  const ledger = projectBoardPlannerWorkspaceLedger(workspace, records);
  await writeFile(workspace.ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function projectBoardPlannerWorkspaceLedger(workspace: ProjectBoardPlannerWorkspace, records: ProposalJsonlRecordArtifact[]) {
  const renderedCardLedger = buildProjectBoardRenderedCardLedger(records, { sources: workspace.sources });
  const questions = records.filter((record) => record.type === "question");
  const sourceCoverage = latestSourceCoverageRecords(records);
  const coverageStatusBySource = sourceCoverageStatusBySource(sourceCoverage);
  return {
    schemaVersion: 1,
    sessionId: workspace.sessionId,
    boardId: workspace.boardId,
    runId: workspace.runId,
    operation: workspace.operation,
    updatedAt: new Date().toISOString(),
    batchPolicy: workspace.batchPolicy,
    sourceLedger: workspace.sources.map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      kind: source.kind,
      summary: source.summary,
      contentHash: source.contentHash,
      originalPath: source.originalPath,
      workspacePath: relative(workspace.rootPath, source.workspacePath),
      charCount: source.charCount,
      relevance: source.relevance,
      coverageStatus: coverageStatusBySource.get(source.sourceId) ?? "uncovered",
    })),
    renderedCardLedger: renderedCardLedger.entries,
    renderedCardLedgerChecksum: renderedCardLedger.checksum,
    renderedCardLedgerSummary: {
      cardCount: renderedCardLedger.cardCount,
      blockedCardCount: renderedCardLedger.blockedCardCount,
      duplicateCardCount: renderedCardLedger.duplicateCardCount,
      rejectedCardCount: renderedCardLedger.rejectedCardCount,
      evidenceCardCount: renderedCardLedger.evidenceCardCount,
      splitLineageCount: renderedCardLedger.splitLineageCount,
      invalidatedCardCount: renderedCardLedger.invalidatedCardCount,
    },
    questionLedger: questions.map((record) => ({
      questionId: record.questionId,
      cardId: record.cardId,
      required: record.required,
      fingerprint: plannerRecordFingerprint(record),
    })),
    sourceCoverageLedger: sourceCoverage.map((record) => ({
      sourceId: record.sourceId,
      range: record.range,
      status: record.status,
      cardIds: record.cardIds,
      fingerprint: plannerRecordFingerprint(record),
    })),
    remainingCoverageLedger: workspace.sources
      .filter((source) => coverageStatusBySource.get(source.sourceId) !== "covered")
      .map((source) => ({
        sourceId: source.sourceId,
        title: source.title,
        status: coverageStatusBySource.get(source.sourceId) ?? "uncovered",
      })),
    recordFingerprints: records.map((record) => ({
      type: record.type,
      fingerprint: plannerRecordFingerprint(record),
    })),
  };
}

function latestSourceCoverageRecords(records: ProposalJsonlRecordArtifact[]): Extract<ProposalJsonlRecordArtifact, { type: "source_coverage" }>[] {
  const byKey = new Map<string, Extract<ProposalJsonlRecordArtifact, { type: "source_coverage" }>>();
  for (const record of records) {
    if (record.type !== "source_coverage") continue;
    byKey.set(`${record.sourceId}:${record.range ?? ""}`, record);
  }
  return [...byKey.values()];
}

function sourceCoverageStatusBySource(
  records: Extract<ProposalJsonlRecordArtifact, { type: "source_coverage" }>[],
): Map<string, "covered" | "unresolved" | "uncovered"> {
  const statuses = new Map<string, "covered" | "unresolved" | "uncovered">();
  for (const record of records) {
    if (record.status === "ignored") continue;
    const current = statuses.get(record.sourceId);
    if (record.status === "partial" || record.status === "unresolved") {
      statuses.set(record.sourceId, "unresolved");
    } else if (record.status === "covered" && !current) {
      statuses.set(record.sourceId, "covered");
    }
  }
  return statuses;
}

function plannerRecordFingerprint(record: ProposalJsonlRecordArtifact): string {
  return stableBoardArtifactId(`${record.type}-record`, [stableJson(record)]);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)]),
  );
}

function projectBoardPlannerBatchPolicy(operation: ProjectBoardPlannerWorkspaceInput["operation"]): ProjectBoardPlannerBatchPolicy {
  return {
    minCandidateCardsPerBatch: operation === "source_elaboration" ? 1 : 2,
    maxCandidateCardsPerBatch: 3,
    outputUnit: "validated_progressive_jsonl_records",
    continuationMode: "same_session_next_cards",
    stopStates: [
      "planning_complete",
      "needs_user_decision",
      "budget_exhausted",
      "stale_source_snapshot",
      "validation_failed",
      "user_cancelled",
    ],
  };
}

function plannerWorkspaceInstructions(input: ProjectBoardPlannerWorkspaceInput, workspace: ProjectBoardPlannerWorkspace): string {
  return [
    "# Project Board Planner Workspace",
    "",
    `Project: ${input.projectName || "unspecified"}`,
    `Board: ${input.boardId}`,
    `Run: ${input.runId}`,
    `Planner session: ${workspace.sessionId}`,
    `Operation: ${input.operation}`,
    "",
    "Read `planner-session.json` for the durable planner-session contract and `planner-ledger.json` for already-rendered candidate cards, coverage, questions, and record fingerprints.",
    `Batch policy target: emit the next ${workspace.batchPolicy.minCandidateCardsPerBatch}-${workspace.batchPolicy.maxCandidateCardsPerBatch} candidate cards per progressive batch unless source evidence produces fewer ready candidates. Compatibility calls may still return a compact final proposal, but append-only progressive records should respect this unit.`,
    `Typed stop states: ${workspace.batchPolicy.stopStates.join(", ")}.`,
    "",
    "Read the source files in `sources/`. Emit append-only JSONL planning records in `outputs/proposal.records.jsonl` and the matching type-specific output file.",
    "",
    "Valid record types:",
    ...Object.keys(OUTPUT_FILENAMES).map((type) => `- ${type}`),
    "",
    "Do not rewrite user-owned board state directly. Ambient validates these records and applies them through the project-board store.",
    "",
    "Sources:",
    ...workspace.sources.map((source) => `- ${source.sourceId}: ${relative(workspace.rootPath, source.workspacePath)} (${source.kind})`),
    "",
  ].join("\n");
}

function sourceFileContent(source: ProjectBoardSynthesisSource, workspaceSource: ProjectBoardPlannerWorkspaceSource): string {
  return [
    `# ${workspaceSource.title || workspaceSource.sourceId}`,
    "",
    `Source id: ${workspaceSource.sourceId}`,
    `Kind: ${workspaceSource.kind}`,
    `Relevance: ${workspaceSource.relevance}`,
    workspaceSource.contentHash ? `Content hash: ${workspaceSource.contentHash}` : "",
    workspaceSource.originalPath ? `Original path: ${workspaceSource.originalPath}` : "",
    "",
    "## Summary",
    source.summary || "(no summary)",
    "",
    "## Material",
    sourceText(source),
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function sourceText(source: ProjectBoardSynthesisSource): string {
  return [source.title, source.summary, source.excerpt, source.path].filter((value): value is string => Boolean(value?.trim())).join("\n\n");
}

function safePathSegment(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safe || "item";
}

function dedupePlannerWorkspaceRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
  const seen = new Set<string>();
  const result: ProposalJsonlRecordArtifact[] = [];
  for (const record of records) {
    const key = recordKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

function parsePlannerWorkspaceJsonlLine(
  path: string,
  lineNumber: number,
  line: string,
  state: ProjectBoardPlannerWorkspaceTailState,
): ProposalJsonlRecordArtifact | undefined {
  try {
    return validateProposalJsonlRecordArtifact(JSON.parse(line));
  } catch (error) {
    const key = `${path}:${lineNumber}:${line}`;
    if (state.seenErrorKeys.has(key)) return undefined;
    state.seenErrorKeys.add(key);
    return validateProposalJsonlRecordArtifact({
      type: "error",
      code: "planner_workspace_invalid_jsonl",
      message: `Planner workspace JSONL record at ${path}:${lineNumber} could not be imported: ${errorMessage(error)}`,
      recoverable: true,
      createdAt: new Date().toISOString(),
      metadata: { path, lineNumber },
    });
  }
}

function recordKey(record: ProposalJsonlRecordArtifact): string {
  return JSON.stringify(record);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}
