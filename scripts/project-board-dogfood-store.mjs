import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export async function readProjectBoardSnapshot(projectRoot, options = {}) {
  const board = (
    await readProjectSqliteJson(
      projectRoot,
      [
        "select",
        "id,",
        "project_path as projectPath,",
        "status,",
        "title,",
        "summary,",
        "charter_id as charterId,",
        "active_draft_id as activeDraftId,",
        "created_at as createdAt,",
        "updated_at as updatedAt",
        "from project_boards",
        `where project_path = ${sqlString(projectRoot)} and status != 'archived'`,
        "order by updated_at desc",
        "limit 1",
      ].join(" "),
      options,
    )
  )[0];
  if (!board) return undefined;
  const boardId = board.id;
  return {
    ...board,
    charterId: board.charterId ?? undefined,
    activeDraftId: board.activeDraftId ?? undefined,
    cards: (await readProjectSqliteJson(projectRoot, projectBoardCardsSql(boardId), options)).map(mapProjectBoardCardRow),
    sources: (await readProjectSqliteJson(projectRoot, projectBoardSourcesSql(boardId), options)).map(mapProjectBoardSourceRow),
    questions: (await readProjectSqliteJson(projectRoot, projectBoardQuestionsSql(boardId), options)).map(mapProjectBoardQuestionRow),
    proposals: (await readProjectSqliteJson(projectRoot, projectBoardProposalsSql(boardId), options)).map(mapProjectBoardProposalRow),
    synthesisRuns: (await readProjectSqliteJson(projectRoot, projectBoardSynthesisRunsSql(boardId, options), options)).map(mapProjectBoardSynthesisRunRow),
    proofScopeWarnings: options.includeProofScopeWarnings
      ? (await readProjectSqliteJson(projectRoot, projectBoardProofScopeWarningsSql(boardId), options)).map(mapProjectBoardProofScopeWarningRow)
      : [],
    executionArtifacts: [],
    events: [],
  };
}

export async function readOrchestrationBoardSnapshot(projectRoot, options = {}) {
  const [tasks, runs] = await Promise.all([
    readProjectSqliteJson(projectRoot, orchestrationTasksSql(), options),
    readProjectSqliteJson(projectRoot, orchestrationRunsSql(), options),
  ]);
  return {
    tasks: tasks.map(mapOrchestrationTaskRow),
    runs: runs.map(mapOrchestrationRunRow),
  };
}

export async function readOrchestrationRunSnapshot(projectRoot, runId, options = {}) {
  const rows = await readProjectSqliteJson(
    projectRoot,
    [
      "select",
      "id,",
      "task_id as taskId,",
      "attempt_number as attemptNumber,",
      "status,",
      "workspace_path as workspacePath,",
      "thread_id as threadId,",
      "pi_session_file as piSessionFile,",
      "started_at as startedAt,",
      "finished_at as finishedAt,",
      "last_event_at as lastEventAt,",
      "error,",
      "proof_of_work_json as proofOfWorkJson",
      "from orchestration_runs",
      `where id = ${sqlString(runId)}`,
      "limit 1",
    ].join(" "),
    options,
  );
  return rows[0] ? mapOrchestrationRunRow(rows[0]) : undefined;
}

export function readyPendingProjectBoardProposal(board, previousProposalId) {
  const proposal = [...(board?.proposals ?? [])].find((candidate) => candidate.status === "pending" && candidate.id !== previousProposalId);
  if (!proposal) return undefined;
  const runs = board?.synthesisRuns ?? [];
  const proposalRun = runs.find((run) => run.proposalId === proposal.id && run.status === "succeeded");
  if (proposalRun) return proposal;
  const latestRun = latestSynthesisRunForBoard(board, proposal.boardId);
  return latestRun?.status === "succeeded" ? proposal : undefined;
}

export function latestSynthesisRunForBoard(board, boardId) {
  return [...(board?.synthesisRuns ?? [])]
    .filter((run) => run.boardId === boardId)
    .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))[0];
}

export function runningSynthesisRunForBoard(board, boardId) {
  const latest = latestSynthesisRunForBoard(board, boardId);
  return latest?.status === "running" ? latest : undefined;
}

export function isSourceRefreshOnlySynthesisRun(run) {
  if (!run) return false;
  const progressiveRecordCount = Number(run.progressiveRecordCount ?? run.progressiveRecords?.length ?? 0) || 0;
  const hasSourceRefreshOnlyEvent = (run.events ?? []).some((event) => event?.metadata?.sourceRefreshOnly === true);
  return (
    (hasSourceRefreshOnlyEvent || (run.status === "succeeded" && run.stage === "sources_persisted")) &&
    run.proposalId == null &&
    run.retryOfRunId == null &&
    run.cardCount == null &&
    run.questionCount == null &&
    progressiveRecordCount === 0
  );
}

export function hasProjectBoardPlanningShape(run) {
  if (!run || isSourceRefreshOnlySynthesisRun(run)) return false;
  const progressiveRecordCount = Number(run.progressiveRecordCount ?? run.progressiveRecords?.length ?? 0) || 0;
  return (
    run.proposalId != null ||
    run.cardCount != null ||
    run.questionCount != null ||
    progressiveRecordCount > 0 ||
    ["deterministic_baseline", "model_request", "model_response", "schema_validation", "proposal_created", "board_applied"].includes(run.stage)
  );
}

export function latestPlanningSynthesisRunForBoard(board, boardId, previousRunId) {
  return [...(board?.synthesisRuns ?? [])]
    .filter((run) => run.boardId === boardId)
    .filter((run) => !previousRunId || run.id !== previousRunId)
    .filter((run) => hasProjectBoardPlanningShape(run))
    .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))[0];
}

export function runningPlanningSynthesisRunForBoard(board, boardId) {
  const latest = latestPlanningSynthesisRunForBoard(board, boardId);
  return latest?.status === "running" ? latest : undefined;
}

export function planningStartIntentForBoard(board, boardId) {
  const latest = latestSynthesisRunForBoard(board, boardId);
  if (!latest) return { shouldStartNewRun: true, previousRunId: undefined, inFlightRun: undefined };
  if (latest.status === "running") {
    return { shouldStartNewRun: false, previousRunId: undefined, inFlightRun: latest };
  }
  return { shouldStartNewRun: true, previousRunId: latest.id, inFlightRun: undefined };
}

export function projectBoardIncrementalSynthesisSnapshot(board, boardId) {
  const run = latestSynthesisRunForBoard(board, boardId);
  const boardSynthesisCards = (board?.cards ?? []).filter(isBoardSynthesisCard);
  const ticketizedCards = boardSynthesisCards.filter((card) => card.orchestrationTaskId);
  return {
    run,
    boardSynthesisCardCount: boardSynthesisCards.length,
    ticketizedCardCount: ticketizedCards.length,
    firstCard: boardSynthesisCards[0] ? projectBoardSynthesisCardMilestone(boardSynthesisCards[0]) : undefined,
    firstTicketizedCard: ticketizedCards[0] ? projectBoardSynthesisCardMilestone(ticketizedCards[0]) : undefined,
  };
}

export function projectBoardSynthesisCardMilestone(card) {
  return {
    id: card.id,
    sourceId: card.sourceId,
    title: card.title,
    status: card.status,
    candidateStatus: card.candidateStatus,
    priority: card.priority,
    phase: card.phase,
    blockedBy: card.blockedBy,
    orchestrationTaskId: card.orchestrationTaskId,
  };
}

function isBoardSynthesisCard(card) {
  return card?.sourceKind === "board_synthesis" || card?.sourceKind === "project_board_synthesis";
}

export async function readProjectSqliteJson(projectRoot, sql, options = {}) {
  const dbPath = projectBoardDogfoodStateDbPath(projectRoot);
  const runCommand = options.runCommand ?? defaultRunCommand;
  if (!options.runCommand && !existsSync(dbPath)) return [];
  const { stdout } = await runCommand("sqlite3", ["-json", dbPath, sql], projectRoot);
  const trimmed = stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

export function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function projectBoardDogfoodStateDbPath(projectRoot) {
  const workspace = resolve(projectRoot);
  const legacyDbPath = join(workspace, ".ambient-codex", "state.sqlite");
  const authorityRoot = projectBoardDogfoodAuthorityRoot();
  if (!authorityRoot) return legacyDbPath;
  const authorityDbPath = join(authorityRoot, "workspaces", projectBoardDogfoodAuthorityDirectoryName(workspace), "state.sqlite");
  return existsSync(authorityDbPath) || !existsSync(legacyDbPath) ? authorityDbPath : legacyDbPath;
}

function projectBoardDogfoodAuthorityRoot() {
  const explicitRoot = process.env.AMBIENT_AUTHORITY_STATE_ROOT?.trim();
  if (explicitRoot) return resolve(explicitRoot);
  const e2eUserData = process.env.AMBIENT_E2E_USER_DATA?.trim();
  if (e2eUserData) return join(resolve(e2eUserData), "authority-state");
  return undefined;
}

function projectBoardDogfoodAuthorityDirectoryName(workspace) {
  const name = safePathSegment(basename(workspace)) || "workspace";
  const id = createHash("sha256").update(resolve(workspace)).digest("hex").slice(0, 16);
  return `${name}-${id}`;
}

function safePathSegment(value) {
  return value.trim().replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^\.+|\.+$/g, "");
}

function projectBoardCardsSql(boardId) {
  return [
    "select",
    "id,",
    "board_id as boardId,",
    "title,",
    "description,",
    "status,",
    "candidate_status as candidateStatus,",
    "priority,",
    "phase,",
    "labels_json as labelsJson,",
    "blocked_by_json as blockedByJson,",
    "acceptance_criteria_json as acceptanceCriteriaJson,",
    "test_plan_json as testPlanJson,",
    "clarification_questions_json as clarificationQuestionsJson,",
    "source_kind as sourceKind,",
    "source_id as sourceId,",
    "source_thread_id as sourceThreadId,",
    "source_message_id as sourceMessageId,",
    "orchestration_task_id as orchestrationTaskId,",
    "execution_thread_id as executionThreadId,",
    "execution_session_policy as executionSessionPolicy,",
    "proof_review_json as proofReviewJson,",
    "split_outcome_json as splitOutcomeJson,",
    "user_touched_fields_json as userTouchedFieldsJson,",
    "user_touched_at as userTouchedAt,",
    "created_at as createdAt,",
    "updated_at as updatedAt",
    "from project_board_cards",
    `where board_id = ${sqlString(boardId)} and status != 'archived'`,
    "order by priority is null, priority asc, updated_at desc",
  ].join(" ");
}

function projectBoardSourcesSql(boardId) {
  return [
    "select",
    "id,",
    "board_id as boardId,",
    "source_kind as sourceKind,",
    "source_key as sourceKey,",
    "content_hash as contentHash,",
    "change_state as changeState,",
    "title,",
    "summary,",
    "excerpt,",
    "path,",
    "thread_id as threadId,",
    "artifact_id as artifactId,",
    "message_id as messageId,",
    "byte_size as byteSize,",
    "mtime,",
    "classification_reason as classificationReason,",
    "classified_by as classifiedBy,",
    "classification_confidence as classificationConfidence,",
    "authority_role as authorityRole,",
    "include_in_synthesis as includeInSynthesis,",
    "relevance,",
    "created_at as createdAt,",
    "updated_at as updatedAt",
    "from project_board_sources",
    `where board_id = ${sqlString(boardId)}`,
    "order by relevance desc, updated_at desc, title asc",
  ].join(" ");
}

function projectBoardProofScopeWarningsSql(boardId) {
  return [
    "select",
    "runs.id as runId,",
    "runs.status as runStatus,",
    "runs.stage as runStage,",
    "json_extract(record.value, '$.message') as message,",
    "json_extract(record.value, '$.createdAt') as createdAt,",
    "json_extract(record.value, '$.metadata.cardId') as cardId,",
    "json_extract(record.value, '$.metadata.sourceId') as sourceId,",
    "json_extract(record.value, '$.metadata.title') as title,",
    "json_extract(record.value, '$.metadata.proofOwnership') as proofOwnership,",
    "json_extract(record.value, '$.metadata.visualProofItems') as visualProofItemsJson",
    "from project_board_synthesis_runs runs,",
    "json_each(coalesce(runs.progressive_records_json, '[]')) record",
    `where runs.board_id = ${sqlString(boardId)}`,
    "and json_extract(record.value, '$.type') = 'warning'",
    "and json_extract(record.value, '$.code') = 'proof_scope_mismatch'",
    "order by runs.started_at desc, record.key asc",
    "limit 100",
  ].join(" ");
}

function projectBoardQuestionsSql(boardId) {
  return [
    "select",
    "id,",
    "board_id as boardId,",
    "question_order as questionOrder,",
    "question,",
    "required,",
    "answer,",
    "answered_at as answeredAt,",
    "created_at as createdAt,",
    "updated_at as updatedAt",
    "from project_board_questions",
    `where board_id = ${sqlString(boardId)}`,
    "order by question_order asc, rowid asc",
  ].join(" ");
}

function projectBoardProposalsSql(boardId) {
  return [
    "select",
    "id,",
    "board_id as boardId,",
    "status,",
    "summary,",
    "goal,",
    "current_state as currentState,",
    "target_user as targetUser,",
    "quality_bar as qualityBar,",
    "assumptions_json as assumptionsJson,",
    "questions_json as questionsJson,",
    "answers_json as answersJson,",
    "source_notes_json as sourceNotesJson,",
    "cards_json as cardsJson,",
    "review_report_json as reviewReportJson,",
    "model,",
    "duration_ms as durationMs,",
    "created_at as createdAt,",
    "updated_at as updatedAt,",
    "applied_at as appliedAt",
    "from project_board_synthesis_proposals",
    `where board_id = ${sqlString(boardId)}`,
    "order by case status when 'pending' then 0 when 'applied' then 1 when 'superseded' then 2 else 3 end, created_at desc, rowid desc",
    "limit 50",
  ].join(" ");
}

function projectBoardSynthesisRunsSql(boardId, options = {}) {
  const progressiveRecordCountSql = options.includeProgressiveRecordCount
    ? "coalesce(json_array_length(progressive_records_json), 0)"
    : "0";
  const eventsJsonSql = options.includeSynthesisEvents ? "events_json" : "null";
  const eventCountSql = options.includeSynthesisEventCount === false
    ? "0"
    : "coalesce(json_array_length(events_json), 0)";
  return [
    "select",
    "id,",
    "board_id as boardId,",
    "proposal_id as proposalId,",
    "retry_of_run_id as retryOfRunId,",
    "status,",
    "stage,",
    "model,",
    "source_count as sourceCount,",
    "included_source_count as includedSourceCount,",
    "source_char_count as sourceCharCount,",
    "prompt_char_count as promptCharCount,",
    "response_char_count as responseCharCount,",
    "card_count as cardCount,",
    "question_count as questionCount,",
    "warning_count as warningCount,",
    "error,",
    `${eventsJsonSql} as eventsJson,`,
    `${eventCountSql} as eventCount,`,
    `${progressiveRecordCountSql} as progressiveRecordCount,`,
    "started_at as startedAt,",
    "updated_at as updatedAt,",
    "completed_at as completedAt",
    "from project_board_synthesis_runs",
    `where board_id = ${sqlString(boardId)}`,
    "order by started_at desc, rowid desc",
    "limit 30",
  ].join(" ");
}

function orchestrationTasksSql() {
  return [
    "select",
    "id,",
    "identifier,",
    "title,",
    "description,",
    "state,",
    "priority,",
    "labels_json as labelsJson,",
    "blocked_by_json as blockedByJson,",
    "branch_name as branchName,",
    "workspace_path as workspacePath,",
    "source_kind as sourceKind,",
    "source_url as sourceUrl,",
    "created_at as createdAt,",
    "updated_at as updatedAt",
    "from orchestration_tasks",
    "order by priority is null, priority asc, created_at asc, identifier asc",
  ].join(" ");
}

function orchestrationRunsSql() {
  return [
    "select",
    "id,",
    "task_id as taskId,",
    "attempt_number as attemptNumber,",
    "status,",
    "workspace_path as workspacePath,",
    "thread_id as threadId,",
    "pi_session_file as piSessionFile,",
    "started_at as startedAt,",
    "finished_at as finishedAt,",
    "last_event_at as lastEventAt,",
    "error,",
    "proof_of_work_json as proofOfWorkJson",
    "from orchestration_runs",
    "order by started_at desc",
    "limit 50",
  ].join(" ");
}

function mapProjectBoardCardRow(row) {
  return {
    id: row.id,
    boardId: row.boardId,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    candidateStatus: row.candidateStatus ?? "ready_to_create",
    priority: row.priority ?? undefined,
    phase: row.phase ?? undefined,
    labels: parseJsonArray(row.labelsJson),
    blockedBy: parseJsonArray(row.blockedByJson),
    acceptanceCriteria: parseJsonArray(row.acceptanceCriteriaJson),
    testPlan: parseJsonObject(row.testPlanJson, { unit: [], integration: [], visual: [], manual: [] }),
    clarificationQuestions: parseJsonArray(row.clarificationQuestionsJson),
    sourceKind: row.sourceKind,
    sourceId: row.sourceId,
    sourceThreadId: row.sourceThreadId ?? undefined,
    sourceMessageId: row.sourceMessageId ?? undefined,
    orchestrationTaskId: row.orchestrationTaskId ?? undefined,
    executionThreadId: row.executionThreadId ?? undefined,
    executionSessionPolicy: row.executionSessionPolicy ?? "reuse_card_session",
    proofReview: parseJsonObject(row.proofReviewJson, undefined),
    splitOutcome: parseJsonObject(row.splitOutcomeJson, undefined),
    userTouchedFields: parseJsonArray(row.userTouchedFieldsJson),
    userTouchedAt: row.userTouchedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapProjectBoardSourceRow(row) {
  return {
    id: row.id,
    boardId: row.boardId,
    sourceKind: row.sourceKind,
    sourceKey: row.sourceKey ?? undefined,
    contentHash: row.contentHash ?? undefined,
    changeState: row.changeState ?? undefined,
    title: row.title,
    summary: row.summary ?? "",
    excerpt: row.excerpt ?? undefined,
    path: row.path ?? undefined,
    threadId: row.threadId ?? undefined,
    artifactId: row.artifactId ?? undefined,
    messageId: row.messageId ?? undefined,
    byteSize: row.byteSize ?? undefined,
    mtime: row.mtime ?? undefined,
    classificationReason: row.classificationReason ?? undefined,
    classifiedBy: row.classifiedBy ?? undefined,
    classificationConfidence: row.classificationConfidence ?? undefined,
    authorityRole: row.authorityRole ?? undefined,
    includeInSynthesis: row.includeInSynthesis !== 0,
    relevance: row.relevance ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapProjectBoardQuestionRow(row) {
  return {
    id: row.id,
    boardId: row.boardId,
    questionOrder: row.questionOrder,
    question: row.question,
    required: row.required !== 0,
    answer: row.answer ?? undefined,
    answeredAt: row.answeredAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapProjectBoardProposalRow(row) {
  return {
    id: row.id,
    boardId: row.boardId,
    status: row.status,
    summary: row.summary ?? "",
    goal: row.goal ?? "",
    currentState: row.currentState ?? "",
    targetUser: row.targetUser ?? "",
    qualityBar: row.qualityBar ?? "",
    assumptions: parseJsonArray(row.assumptionsJson),
    questions: parseJsonArray(row.questionsJson),
    answers: parseJsonArray(row.answersJson),
    sourceNotes: parseJsonArray(row.sourceNotesJson),
    cards: parseJsonArray(row.cardsJson),
    reviewReport: parseJsonObject(row.reviewReportJson, undefined),
    model: row.model ?? undefined,
    durationMs: row.durationMs ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    appliedAt: row.appliedAt ?? undefined,
  };
}

function mapProjectBoardSynthesisRunRow(row) {
  const progressiveRecords = row.progressiveRecordsJson ? parseJsonArray(row.progressiveRecordsJson) : [];
  const events = parseJsonArray(row.eventsJson);
  return {
    id: row.id,
    boardId: row.boardId,
    proposalId: row.proposalId ?? undefined,
    retryOfRunId: row.retryOfRunId ?? undefined,
    status: row.status,
    stage: row.stage,
    model: row.model ?? undefined,
    sourceCount: row.sourceCount ?? 0,
    includedSourceCount: row.includedSourceCount ?? 0,
    sourceCharCount: row.sourceCharCount ?? 0,
    promptCharCount: row.promptCharCount ?? undefined,
    responseCharCount: row.responseCharCount ?? undefined,
    cardCount: row.cardCount ?? undefined,
    questionCount: row.questionCount ?? undefined,
    warningCount: row.warningCount ?? 0,
    error: row.error ?? undefined,
    eventCount: row.eventCount ?? events.length,
    events,
    progressiveRecordCount: row.progressiveRecordCount ?? progressiveRecords.length,
    progressiveRecords,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
  };
}

function mapProjectBoardProofScopeWarningRow(row) {
  const cardRef = row.cardId ?? row.sourceId ?? undefined;
  return {
    code: "proof_scope_mismatch",
    runId: row.runId,
    runStatus: row.runStatus,
    runStage: row.runStage,
    message: row.message ?? "",
    createdAt: row.createdAt ?? undefined,
    cardRef,
    title: row.title ?? undefined,
    proofOwnership: row.proofOwnership ?? undefined,
    visualProofItems: parseJsonArray(row.visualProofItemsJson).slice(0, 5),
  };
}

function mapOrchestrationTaskRow(row) {
  return {
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    description: row.description ?? undefined,
    state: row.state,
    priority: row.priority ?? undefined,
    labels: parseJsonArray(row.labelsJson),
    blockedBy: parseJsonArray(row.blockedByJson),
    branchName: row.branchName ?? undefined,
    workspacePath: row.workspacePath ?? undefined,
    sourceKind: row.sourceKind,
    sourceUrl: row.sourceUrl ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOrchestrationRunRow(row) {
  return {
    id: row.id,
    taskId: row.taskId,
    attemptNumber: row.attemptNumber,
    status: row.status,
    workspacePath: row.workspacePath,
    threadId: row.threadId ?? undefined,
    piSessionFile: row.piSessionFile ?? undefined,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    lastEventAt: row.lastEventAt ?? undefined,
    error: row.error ?? undefined,
    proofOfWork: parseJsonObject(row.proofOfWorkJson, undefined),
  };
}

function parseJsonArray(value) {
  const parsed = parseJsonObject(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonObject(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function defaultRunCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeoutMs = Number(process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SQLITE_TIMEOUT_MS || 30_000);
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (timeout) clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs.toLocaleString()}ms.`));
        return;
      }
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${code}: ${stderr || stdout}`));
    });
  });
}
