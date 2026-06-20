import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DesktopState } from "../../shared/desktopTypes";
import type {
  ProjectBoardCard,
  ProjectBoardSynthesisRun,
  ProjectSummary,
  SeedProjectBoardCanonicalProjectionDogfoodInput,
  SeedProjectBoardDeliverableIntegrationDogfoodInput,
  SeedProjectBoardProofJudgmentDogfoodInput,
} from "../../shared/projectBoardTypes";
import { ProjectStore } from "../projectStore/projectStore";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import type { ProjectBoardSynthesisDraft } from "./projectBoardSynthesis";

export interface ProjectBoardDogfoodRuntimeHost {
  store: ProjectStore;
}

export interface ProjectBoardDogfoodDesktopServiceDependencies {
  applyProjectBoardIncrementalSynthesisFromRun(input: {
    boardId: string;
    runId: string;
    fallback: ProjectBoardSynthesisDraft;
    model?: string;
    startedAt: number;
    replaceExistingDraft: boolean;
    targetStore?: ProjectStore;
  }): void;
  emitProjectStateIfActive(host: ProjectBoardDogfoodRuntimeHost): void;
  readStateForProjectHostAction(host: ProjectBoardDogfoodRuntimeHost): DesktopState;
  requireProjectBoardForAction(boardId: string, targetStore: ProjectStore): NonNullable<ProjectSummary["board"]>;
  reviewFinishedProjectBoardRun(runId: string, targetStore: ProjectStore, emitProjectState: () => void): Promise<unknown> | unknown;
}

let projectBoardDogfoodServices: ProjectBoardDogfoodDesktopServiceDependencies | undefined;

export function configureProjectBoardDogfoodDesktopService(dependencies: ProjectBoardDogfoodDesktopServiceDependencies): void {
  projectBoardDogfoodServices = dependencies;
}

function services(): ProjectBoardDogfoodDesktopServiceDependencies {
  if (!projectBoardDogfoodServices) throw new Error("Project Board dogfood desktop service has not been configured.");
  return projectBoardDogfoodServices;
}

export function requireProjectBoardDogfoodTestHook(channel: string): void {
  if (process.env.AMBIENT_E2E === "1" || process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_ENABLE_TEST_HOOKS === "1") return;
  throw new Error(`${channel} is only available in Ambient E2E dogfood runs.`);
}

export function projectBoardSemanticIdleDogfoodFastRetryEnabled(): boolean {
  return process.env.AMBIENT_E2E === "1" && process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SEMANTIC_IDLE_FAST_RETRY === "1";
}

export function seedProjectBoardSemanticIdleDogfoodRun(boardId: string, targetStore: ProjectStore): ProjectBoardSynthesisRun {
  requireProjectBoardDogfoodTestHook("seedProjectBoardSemanticIdleDogfoodRun");
  const board = services().requireProjectBoardForAction(boardId, targetStore);
  if (board.status === "draft") targetStore.updateProjectBoardStatus(boardId, "active");
  const sources = targetStore.replaceProjectBoardSources(boardId, [
    {
      kind: "functional_spec",
      sourceKey: "dogfood:semantic-idle-foundation",
      contentHash: "dogfood-foundation-v1",
      changeState: "new",
      title: "Semantic Idle Dogfood Foundation",
      summary: "Foundation section for a deterministic stalled-section recovery dogfood.",
      excerpt: "## Foundation\nBuild a small shell card first so retry can prove completed sections are preserved.",
      path: "dogfood/semantic-idle-foundation.md",
      relevance: 100,
      classifiedBy: "user",
      classificationReason: "E2E dogfood seed source for project-board stalled-section recovery.",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
    },
    {
      kind: "functional_spec",
      sourceKey: "dogfood:semantic-idle-combat",
      contentHash: "dogfood-combat-v1",
      changeState: "new",
      title: "Semantic Idle Dogfood Combat",
      summary: "Second source section intentionally represented as semantic-idle stalled coverage.",
      excerpt: "## Combat\nThis section should initially stall, then be retried into a second card.",
      path: "dogfood/semantic-idle-combat.md",
      relevance: 95,
      classifiedBy: "user",
      classificationReason: "E2E dogfood seed source for project-board stalled-section recovery.",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
    },
  ]);
  const foundationSource = sources[0];
  const combatSource = sources[1];
  if (!foundationSource || !combatSource) throw new Error("Semantic-idle dogfood sources were not created.");
  const run = targetStore.createProjectBoardSynthesisRun({ boardId, model: "dogfood-semantic-idle" });
  const createdAt = new Date().toISOString();
  const records: ProposalJsonlRecordArtifact[] = [
    validateProposalJsonlRecordArtifact({
      type: "progress",
      stage: "section_succeeded",
      title: "Completed section 1/2",
      summary: "Foundation cards planned before the dogfood semantic-idle stall.",
      createdAt,
      metadata: {
        sectionId: "dogfood-section-foundation",
        sectionStatus: "succeeded",
        sectionIndex: 1,
        sectionCount: 2,
        sectionHeading: "Foundation",
        sourceId: foundationSource.id,
        sourcePath: foundationSource.path,
        sectionRange: "lines:1-2",
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "candidate_card",
      sourceId: "synthesis:dogfood-foundation-shell",
      title: "Build the dogfood foundation shell",
      description: "Create the smallest project-board foundation shell so a later retry can prove completed section cards are preserved.",
      candidateStatus: "needs_clarification",
      priority: 1,
      phase: "Foundation",
      labels: ["dogfood", "foundation", "semantic-idle"],
      blockedBy: [],
      clarificationQuestions: ["Confirm the dogfood Foundation card should remain as the preserved completed-section card."],
      sourceRefs: [{ sourceId: foundationSource.id, path: foundationSource.path, range: "lines:1-2" }],
      acceptanceCriteria: ["The foundation shell card remains present after retrying the stalled section."],
      testPlan: {
        unit: ["Assert the recovered board keeps the foundation card."],
        integration: ["Exercise Retry Failed Sections through the Desktop IPC boundary."],
        visual: ["Capture the section-status panel showing the stalled section before retry."],
        manual: ["Confirm the retry adds only the missing section card."],
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: foundationSource.id,
      range: "lines:1-2",
      status: "covered",
      cardIds: ["synthesis:dogfood-foundation-shell"],
      note: "Foundation source was covered before the semantic-idle stall.",
      updatedAt: createdAt,
    }),
    validateProposalJsonlRecordArtifact({
      type: "question",
      questionId: "question:dogfood-combat-scope",
      question: "When the stalled Combat section is retried, should it create one narrow card instead of replacing the Foundation work?",
      cardId: "synthesis:dogfood-combat-loop",
      required: true,
      createdAt,
    }),
    validateProposalJsonlRecordArtifact({
      type: "progress",
      stage: "section_failed",
      title: "Stalled section 2/2",
      summary: "Combat stopped producing model content or planner records and can be retried without discarding Foundation.",
      createdAt,
      metadata: {
        sectionId: "dogfood-section-combat",
        sectionStatus: "failed",
        failureKind: "semantic_idle_timeout",
        retryable: true,
        sectionIndex: 2,
        sectionCount: 2,
        sectionHeading: "Combat",
        sourceId: combatSource.id,
        sourcePath: combatSource.path,
        sectionRange: "lines:1-2",
        completedSectionCount: 1,
        candidateCardCount: 1,
        questionCount: 1,
        semanticIdleTimeoutMs: 25,
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "error",
      code: "section_semantic_idle_timeout",
      message: "Combat stalled after 25ms without model content or planner records.",
      recoverable: true,
      createdAt,
      metadata: {
        sectionId: "dogfood-section-combat",
        sourceId: combatSource.id,
        sourcePath: combatSource.path,
        range: "lines:1-2",
        failureKind: "semantic_idle_timeout",
        retryable: true,
        completedSectionCount: 1,
        candidateCardCount: 1,
        questionCount: 1,
        semanticIdleTimeoutMs: 25,
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: combatSource.id,
      range: "lines:1-2",
      status: "unresolved",
      cardIds: [],
      note: "Combat source coverage is unresolved until Retry Failed Sections replans this section.",
      updatedAt: createdAt,
    }),
  ];
  targetStore.recordProjectBoardSynthesisRunProgressiveRecords(run.id, records, {
    title: "Seeded semantic-idle section dogfood records",
    summary: "Inserted one completed section, one preserved card, one unresolved question, and one retryable semantic-idle section.",
  });
  services().applyProjectBoardIncrementalSynthesisFromRun({
    boardId,
    runId: run.id,
    fallback: dogfoodSemanticIdleDraftFallback(),
    model: "dogfood-semantic-idle",
    startedAt: Date.now(),
    replaceExistingDraft: true,
    targetStore,
  });
  return targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: "board_applied",
    title: "Applied partial semantic-idle dogfood synthesis",
    summary: "Applied the preserved Foundation card while leaving Combat as a retryable stalled section.",
    metadata: {
      dogfood: "semantic_idle_section",
      partial: true,
      failedSectionCount: 1,
      semanticIdleSectionCount: 1,
      completedSectionCount: 1,
      questionCount: 1,
      cardCount: 1,
    },
    status: "succeeded",
    completedAt: new Date().toISOString(),
    cardCount: 1,
    questionCount: 1,
  });
}

export function seedProjectBoardCanonicalProjectionDogfoodForProjectHost(
  host: ProjectBoardDogfoodRuntimeHost,
  input: SeedProjectBoardCanonicalProjectionDogfoodInput,
) {
  const targetStore = host.store;
  const board = services().requireProjectBoardForAction(input.boardId, targetStore);
  if (board.status === "draft") targetStore.updateProjectBoardStatus(input.boardId, "active");
  const workspacePath = targetStore.getWorkspace().path;

  const createReadyCard = (cardInput: {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    unitProof: string[];
    labels: string[];
  }): ProjectBoardCard => {
    const draft = targetStore.createProjectBoardManualCard({
      boardId: input.boardId,
      title: cardInput.title,
      description: cardInput.description,
    });
    const ready = targetStore.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      labels: cardInput.labels,
      acceptanceCriteria: cardInput.acceptanceCriteria,
      testPlan: {
        unit: cardInput.unitProof,
        integration: [],
        visual: [],
        manual: [],
      },
    });
    const approved = targetStore.approveProjectBoardCard(ready.id);
    if (!approved.orchestrationTaskId) throw new Error(`Canonical projection dogfood card was not ticketized: ${approved.title}`);
    return approved;
  };

  const recordRun = (card: ProjectBoardCard, status: "failed" | "completed", proofOfWork: Record<string, unknown>, error?: string) => {
    if (!card.orchestrationTaskId) throw new Error(`Canonical projection card has no Local Task: ${card.title}`);
    const run = targetStore.recordPreparedOrchestrationRun({
      taskId: card.orchestrationTaskId,
      workspacePath: join(workspacePath, ".ambient-codex", "kanban-phase1", card.id),
    });
    return targetStore.updateOrchestrationRun({
      id: run.id,
      status,
      threadId: targetStore.createThread(`${card.title} proof thread`, workspacePath).id,
      error,
      proofOfWork,
      finish: true,
    });
  };

  const stopwatch = createReadyCard({
    title: "Static stopwatch DOM wiring",
    description:
      "Gate A fixture: the DOM wiring card was sent back once, retried, and then accepted as done through PM Review.",
    labels: ["phase-1", "stopwatch", "retry-cleanup"],
    acceptanceCriteria: ["Wire the start, pause, reset, and lap controls.", "Keep stopwatch state deterministic in unit tests."],
    unitProof: ["Run stopwatch DOM wiring unit tests."],
  });
  const stopwatchFailedRun = recordRun(
    stopwatch,
    "failed",
    {
      changedFiles: [],
      commands: [{ command: "pnpm exec vitest run test/stopwatch-dom.test.ts", exitCode: 1, output: "lap button handler missing" }],
      lastAssistantText: "Initial DOM wiring attempt failed before the lap button handler was connected.",
    },
    "DOM wiring proof failed; lap button handler missing.",
  );
  targetStore.resolveProjectBoardProofDecision({
    cardId: stopwatch.id,
    action: "retry",
    reason: "Send back once so the retry cleanup gate can verify stale failed badges do not survive PM acceptance.",
  });
  const retriedStopwatch = targetStore.getProjectBoardCard(stopwatch.id);
  const stopwatchCompletedRun = recordRun(retriedStopwatch, "completed", {
    changedFiles: ["src/stopwatch.ts", "test/stopwatch-dom.test.ts"],
    commands: [{ command: "pnpm exec vitest run test/stopwatch-dom.test.ts", exitCode: 0, output: "2 tests passed" }],
    lastAssistantText:
      "Implemented start, pause, reset, and lap DOM wiring. Stopwatch state is deterministic and the unit proof passed.",
  });
  targetStore.resolveProjectBoardProofDecision({
    cardId: stopwatch.id,
    action: "accept_done",
    reason: "Retried DOM wiring proof is sufficient; close without surfacing the prior failed attempt as active work.",
  });

  const csv = createReadyCard({
    title: "CSV expense stopped-after-proof",
    description:
      "Gate B fixture: the worker recorded durable CSV summarizer proof, then the provider stopped before final response closure.",
    labels: ["phase-1", "csv-expense", "stopped-after-proof"],
    acceptanceCriteria: ["Parse local CSV expense rows.", "Write a category summary artifact.", "Verify the summarizer with unit proof."],
    unitProof: ["Run CSV expense summarizer unit tests."],
  });
  const csvStoppedRun = recordRun(
    csv,
    "failed",
    {
      changedFiles: ["src/expenseSummary.ts", "test/expenseSummary.test.ts", "artifacts/expense-summary.md"],
      commands: [{ command: "pnpm exec vitest run test/expenseSummary.test.ts", exitCode: 0, output: "1 test passed" }],
      taskToolActions: [
        {
          actionId: "csv-proof-1",
          action: "task_report_proof",
          createdAt: "2026-05-17T09:00:00.000Z",
          summary: "CSV parser and summary artifact were implemented before the provider stopped.",
          commands: [{ command: "pnpm exec vitest run test/expenseSummary.test.ts", exitCode: 0 }],
          changedFiles: ["src/expenseSummary.ts", "test/expenseSummary.test.ts", "artifacts/expense-summary.md"],
          screenshots: [],
          browserTraces: [],
          visualChecks: [],
          manualChecks: [],
        },
        {
          actionId: "csv-complete-1",
          action: "task_complete",
          createdAt: "2026-05-17T09:00:05.000Z",
          summary: "Durable CSV expense summarizer proof satisfies the card criteria despite the stopped final response.",
          completedItems: ["CSV parser", "summary artifact", "unit proof"],
        },
      ],
      lastAssistantText: "Implemented the CSV expense summarizer and wrote durable proof before the provider stopped.",
    },
    "Provider stopped after proof was recorded.",
  );
  targetStore.resolveProjectBoardProofDecision({
    cardId: csv.id,
    action: "accept_done",
    reason: "Durable changed files and command proof satisfy the card after the provider stopped.",
  });

  services().emitProjectStateIfActive(host);
  const state = services().readStateForProjectHostAction(host);
  return {
    state,
    boardId: input.boardId,
    scenarios: [
      {
        name: "stopwatch_retry_cleanup",
        cardId: stopwatch.id,
        taskId: stopwatch.orchestrationTaskId!,
        runIds: [stopwatchFailedRun.id, stopwatchCompletedRun.id],
      },
      {
        name: "csv_stopped_after_proof",
        cardId: csv.id,
        taskId: csv.orchestrationTaskId!,
        runIds: [csvStoppedRun.id],
      },
    ],
  };
}

export async function seedProjectBoardDeliverableIntegrationDogfoodForProjectHost(
  host: ProjectBoardDogfoodRuntimeHost,
  input: SeedProjectBoardDeliverableIntegrationDogfoodInput,
) {
  const targetStore = host.store;
  const board = services().requireProjectBoardForAction(input.boardId, targetStore);
  if (board.status === "draft") targetStore.updateProjectBoardStatus(input.boardId, "active");
  const workspacePath = targetStore.getWorkspace().path;

  const createReadyCard = (cardInput: {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    unitProof: string[];
    labels: string[];
  }): ProjectBoardCard => {
    const draft = targetStore.createProjectBoardManualCard({
      boardId: input.boardId,
      title: cardInput.title,
      description: cardInput.description,
    });
    const ready = targetStore.updateProjectBoardCard({
      cardId: draft.id,
      candidateStatus: "ready_to_create",
      labels: cardInput.labels,
      acceptanceCriteria: cardInput.acceptanceCriteria,
      testPlan: {
        unit: cardInput.unitProof,
        integration: [],
        visual: [],
        manual: [],
      },
    });
    const approved = targetStore.approveProjectBoardCard(ready.id);
    if (!approved.orchestrationTaskId) throw new Error(`Deliverable integration dogfood card was not ticketized: ${approved.title}`);
    return approved;
  };

  const recordCompletedRun = async (
    card: ProjectBoardCard,
    workspaceStem: string,
    files: Array<{ path: string; content: string }>,
    proofExtras: Record<string, unknown> = {},
  ) => {
    if (!card.orchestrationTaskId) throw new Error(`Deliverable integration card has no Local Task: ${card.title}`);
    const runWorkspace = join(workspacePath, ".ambient-codex", "kanban-phase2-deliverables", workspaceStem);
    for (const file of files) {
      await mkdir(dirname(join(runWorkspace, file.path)), { recursive: true });
      await writeFile(join(runWorkspace, file.path), file.content, "utf8");
    }
    const run = targetStore.recordPreparedOrchestrationRun({
      taskId: card.orchestrationTaskId,
      workspacePath: runWorkspace,
    });
    return targetStore.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      threadId: targetStore.createThread(`${card.title} deliverable thread`, workspacePath).id,
      proofOfWork: {
        changedFiles: files.map((file) => file.path),
        commands: [{ command: "pnpm test", exitCode: 0, output: "seeded deliverable proof passed" }],
        commits: [`dogfood-${workspaceStem}`],
        ...proofExtras,
      },
      finish: true,
      reviewProjectBoardProof: false,
    });
  };

  const pomodoro = createReadyCard({
    title: "Pomodoro root integration",
    description: "Phase 2 Gate A fixture: material Pomodoro files are produced in a Local Task workspace before root integration.",
    labels: ["phase-2", "pomodoro", "integration-queue"],
    acceptanceCriteria: ["Generate index.html, app.js, style.css, and tests/checklist.md.", "Exclude runtime and dependency folders from integration."],
    unitProof: ["Run Pomodoro root integration proof."],
  });
  const pomodoroRun = await recordCompletedRun(
    pomodoro,
    "pomodoro-root",
    [
      { path: "index.html", content: "<main><h1>Pomodoro</h1><button>Start</button></main>\n" },
      { path: "app.js", content: "export const pomodoroMinutes = 25;\n" },
      { path: "style.css", content: "main { font-family: Inter, sans-serif; }\n" },
      { path: "tests/checklist.md", content: "- [x] Timer controls render\n- [x] Session state is deterministic\n" },
      { path: ".ambient/phase2-dogfood-runtime.json", content: "{\"runtime\":true}\n" },
      { path: "node_modules/phase2-dogfood-cache/index.js", content: "module.exports = {};\n" },
    ],
    { dependencyImports: ["date-fns"] },
  );
  targetStore.resolveProjectBoardProofDecision({
    cardId: pomodoro.id,
    action: "accept_done",
    reason: "Seeded Pomodoro deliverable proof is accepted so the close-state gate can focus on integration reachability.",
  });

  const recipe = createReadyCard({
    title: "Recipe index export bundle",
    description: "Phase 2 Gate B fixture: separate recipe index outputs are bundled for explicit handoff.",
    labels: ["phase-2", "recipe-index", "integration-queue"],
    acceptanceCriteria: ["Generate recipe fixtures, build-index.mjs, INDEX.md, and a verification script."],
    unitProof: ["Run recipe index verification from the integrated root or exported bundle."],
  });
  const recipeRun = await recordCompletedRun(
    recipe,
    "recipe-index",
    [
      { path: "recipes/apple-pie.json", content: "{\"title\":\"Apple Pie\",\"tags\":[\"dessert\"]}\n" },
      { path: "recipes/tomato-soup.json", content: "{\"title\":\"Tomato Soup\",\"tags\":[\"lunch\"]}\n" },
      { path: "build-index.mjs", content: "console.log('INDEX.md generated from recipes');\n" },
      { path: "INDEX.md", content: "# Recipe Index\n\n- Apple Pie\n- Tomato Soup\n" },
      { path: "tests/verify-recipes.mjs", content: "console.log('recipe fixture verification passed');\n" },
      { path: ".ambient-codex/phase2-dogfood-session.json", content: "{\"session\":true}\n" },
      { path: "node_modules/phase2-dogfood-cache/index.js", content: "module.exports = {};\n" },
    ],
    { dependencyImports: ["node:fs/promises"] },
  );
  targetStore.resolveProjectBoardProofDecision({
    cardId: recipe.id,
    action: "accept_done",
    reason: "Seeded Recipe Index deliverable proof is accepted so the close-state gate can focus on exported handoff artifacts.",
  });

  const deferred = createReadyCard({
    title: "Deferred theme review",
    description: "Phase 2 fixture: deliverables can be explicitly deferred without writing to the project root.",
    labels: ["phase-2", "defer", "integration-queue"],
    acceptanceCriteria: ["Record an explicit PM defer reason for non-root material output."],
    unitProof: ["Run defer-decision smoke proof."],
  });
  const deferredRun = await recordCompletedRun(deferred, "deferred-theme", [
    { path: "theme-review.md", content: "# Theme Review\n\nAwaiting PM approval before root integration.\n" },
  ]);
  targetStore.resolveProjectBoardProofDecision({
    cardId: deferred.id,
    action: "accept_done",
    reason: "Seeded theme deliverable proof is accepted so the close-state gate can verify explicit defer outcomes.",
  });

  services().emitProjectStateIfActive(host);
  const state = services().readStateForProjectHostAction(host);
  return {
    state,
    boardId: input.boardId,
    scenarios: [
      {
        name: "pomodoro_root_apply",
        cardId: pomodoro.id,
        taskId: pomodoro.orchestrationTaskId!,
        runId: pomodoroRun.id,
        workspacePath: pomodoroRun.workspacePath,
        materialFiles: ["index.html", "app.js", "style.css", "tests/checklist.md"],
        excludedFiles: [".ambient/phase2-dogfood-runtime.json", "node_modules/phase2-dogfood-cache/index.js"],
      },
      {
        name: "recipe_index_export",
        cardId: recipe.id,
        taskId: recipe.orchestrationTaskId!,
        runId: recipeRun.id,
        workspacePath: recipeRun.workspacePath,
        materialFiles: ["recipes/apple-pie.json", "recipes/tomato-soup.json", "build-index.mjs", "INDEX.md", "tests/verify-recipes.mjs"],
        excludedFiles: [".ambient-codex/phase2-dogfood-session.json", "node_modules/phase2-dogfood-cache/index.js"],
      },
      {
        name: "deferred_theme_review",
        cardId: deferred.id,
        taskId: deferred.orchestrationTaskId!,
        runId: deferredRun.id,
        workspacePath: deferredRun.workspacePath,
        materialFiles: ["theme-review.md"],
        excludedFiles: [],
      },
    ],
  };
}

export async function seedProjectBoardProofJudgmentDogfoodForProjectHost(
  host: ProjectBoardDogfoodRuntimeHost,
  input: SeedProjectBoardProofJudgmentDogfoodInput,
): Promise<{
  state: DesktopState;
  boardId: string;
  cardId: string;
  runId: string;
  proofReview: ProjectBoardCard["proofReview"];
}> {
  const targetStore = host.store;
  const workspacePath = targetStore.getWorkspace().path;
  const board = services().requireProjectBoardForAction(input.boardId, targetStore);
  if (board.status === "draft") targetStore.updateProjectBoardStatus(input.boardId, "active");
  const draft = targetStore.createProjectBoardManualCard({
    boardId: input.boardId,
    title: "Judge aggressive retry proof smoke",
    description:
      "Exercise the project-board proof judgment direct helper through the Desktop product path after a completed card run.",
  });
  const ready = targetStore.updateProjectBoardCard({
    cardId: draft.id,
    candidateStatus: "ready_to_create",
    acceptanceCriteria: [
      "The implementation records a completed run with changed source evidence.",
      "The proof packet includes a successful automated verification command.",
      "The PM proof judgment direct helper can retry a no-content stream stall and apply a live judgment.",
    ],
    testPlan: {
      unit: ["Assert proof judgment retry metadata is recorded on the board timeline."],
      integration: ["Run the direct-helper GMI failpoint smoke through Desktop IPC."],
      visual: [],
      manual: [],
    },
  });
  const approved = targetStore.approveProjectBoardCard(ready.id);
  if (!approved.orchestrationTaskId) throw new Error("Proof-judgment dogfood card was not ticketized.");
  const thread = targetStore.createThread("Proof judgment retry smoke thread", workspacePath);
  targetStore.addMessage({
    threadId: thread.id,
    role: "assistant",
    content:
      "Implemented the aggressive retry proof smoke fixture, recorded verification output, and preserved the board-card proof packet.",
  });
  const run = targetStore.recordPreparedOrchestrationRun({
    taskId: approved.orchestrationTaskId,
    workspacePath,
  });
  targetStore.updateOrchestrationRun({
    id: run.id,
    status: "completed",
    threadId: thread.id,
    proofOfWork: {
      changedFiles: ["src/aggressiveRetryProofSmoke.ts", "src/aggressiveRetryProofSmoke.test.ts"],
      commands: [
        {
          command: "pnpm exec vitest run src/aggressiveRetryProofSmoke.test.ts",
          exitCode: 0,
          durationMs: 1842,
          output: "1 test file passed; proof judgment retry fixture stayed deterministic.",
        },
      ],
      afterRunHook: { ok: true, summary: "Post-run verification hook passed." },
      lastAssistantText:
        "Implemented the requested behavior, added focused verification, and confirmed the proof packet covers the acceptance criteria.",
      taskActions: {
        protocolSatisfied: true,
        terminalAction: "task_complete",
        actions: ["task_heartbeat", "task_report_proof", "task_complete"],
      },
    },
    finish: true,
    reviewProjectBoardProof: false,
  });
  await services().reviewFinishedProjectBoardRun(run.id, targetStore, () => services().emitProjectStateIfActive(host));
  const reviewed = targetStore.getProjectBoardCard(approved.id);
  const state = services().readStateForProjectHostAction(host);
  return {
    state,
    boardId: input.boardId,
    cardId: approved.id,
    runId: run.id,
    proofReview: reviewed.proofReview,
  };
}

export function seedProjectBoardSemanticIdleDogfoodRetry(
  boardId: string,
  retryOfRunId: string,
  targetStore: ProjectStore,
): ProjectBoardSynthesisRun {
  requireProjectBoardDogfoodTestHook("seedProjectBoardSemanticIdleDogfoodRetry");
  const priorRun = targetStore.getProjectBoardSynthesisRun(retryOfRunId);
  if (!priorRun || priorRun.boardId !== boardId) throw new Error("Semantic-idle dogfood retry run not found for this board.");
  const board = services().requireProjectBoardForAction(boardId, targetStore);
  const foundationSource = board.sources.find((source) => source.sourceKey === "dogfood:semantic-idle-foundation") ?? board.sources[0];
  const combatSource = board.sources.find((source) => source.sourceKey === "dogfood:semantic-idle-combat") ?? board.sources.at(-1);
  if (!foundationSource || !combatSource) throw new Error("Semantic-idle dogfood retry sources are missing.");
  const run = targetStore.createProjectBoardSynthesisRun({ boardId, model: "dogfood-semantic-idle-retry", retryOfRunId });
  const createdAt = new Date().toISOString();
  const records: ProposalJsonlRecordArtifact[] = [
    validateProposalJsonlRecordArtifact({
      type: "progress",
      stage: "section_skipped",
      title: "Reused section 1/2",
      summary: "Foundation was reused from the previous completed section records.",
      createdAt,
      metadata: {
        sectionId: "dogfood-section-foundation",
        sectionStatus: "skipped",
        sectionIndex: 1,
        sectionCount: 2,
        sectionHeading: "Foundation",
        sourceId: foundationSource.id,
        sourcePath: foundationSource.path,
        sectionRange: "lines:1-2",
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "candidate_card",
      sourceId: "synthesis:dogfood-foundation-shell",
      title: "Build the dogfood foundation shell",
      description: "Preserved from the completed section so retry can focus on the previously stalled source slice.",
      candidateStatus: "needs_clarification",
      priority: 1,
      phase: "Foundation",
      labels: ["dogfood", "foundation", "semantic-idle"],
      blockedBy: [],
      clarificationQuestions: ["Confirm the dogfood Foundation card should remain as the preserved completed-section card."],
      sourceRefs: [{ sourceId: foundationSource.id, path: foundationSource.path, range: "lines:1-2" }],
      acceptanceCriteria: ["The foundation shell card remains present after retrying the stalled section."],
      testPlan: {
        unit: ["Assert the recovered board keeps the foundation card."],
        integration: ["Exercise Retry Failed Sections through the Desktop IPC boundary."],
        visual: ["Capture the section-status panel showing the reused section after retry."],
        manual: ["Confirm the retry adds only the missing section card."],
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "progress",
      stage: "section_succeeded",
      title: "Completed section 2/2",
      summary: "Combat was replanned during the retry and now has a self-contained card.",
      createdAt,
      metadata: {
        sectionId: "dogfood-section-combat",
        sectionStatus: "succeeded",
        sectionIndex: 2,
        sectionCount: 2,
        sectionHeading: "Combat",
        sourceId: combatSource.id,
        sourcePath: combatSource.path,
        sectionRange: "lines:1-2",
        retryOfRunId,
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "candidate_card",
      sourceId: "synthesis:dogfood-combat-loop",
      title: "Add the retried dogfood combat loop",
      description: "Create the missing Combat card from the section that previously stalled without model content or planner records.",
      candidateStatus: "needs_clarification",
      priority: 2,
      phase: "Combat",
      labels: ["dogfood", "combat", "semantic-idle"],
      blockedBy: ["synthesis:dogfood-foundation-shell"],
      clarificationQuestions: ["Confirm that the retried Combat card should remain blocked by the preserved Foundation card."],
      sourceRefs: [{ sourceId: combatSource.id, path: combatSource.path, range: "lines:1-2" }],
      acceptanceCriteria: ["The retry adds a Combat card without replacing the preserved Foundation card."],
      testPlan: {
        unit: ["Assert the retry summary has zero semantic-idle errors."],
        integration: ["Verify the retried run reuses section 1 and succeeds section 2."],
        visual: ["Capture the section-status panel after retry."],
        manual: ["Review that Combat is now represented as a card."],
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: foundationSource.id,
      range: "lines:1-2",
      status: "covered",
      cardIds: ["synthesis:dogfood-foundation-shell"],
      note: "Foundation source was reused from the previous run.",
      updatedAt: createdAt,
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: combatSource.id,
      range: "lines:1-2",
      status: "covered",
      cardIds: ["synthesis:dogfood-combat-loop"],
      note: "Combat source coverage was resolved by retrying the stalled section.",
      updatedAt: createdAt,
    }),
  ];
  targetStore.recordProjectBoardSynthesisRunProgressiveRecords(run.id, records, {
    title: "Seeded semantic-idle retry dogfood records",
    summary: "Reused the completed Foundation section and resolved the previously stalled Combat section.",
  });
  services().applyProjectBoardIncrementalSynthesisFromRun({
    boardId,
    runId: run.id,
    fallback: dogfoodSemanticIdleDraftFallback(),
    model: "dogfood-semantic-idle-retry",
    startedAt: Date.now(),
    replaceExistingDraft: true,
    targetStore,
  });
  return targetStore.recordProjectBoardSynthesisRunEvent(run.id, {
    stage: "board_applied",
    title: "Applied semantic-idle retry dogfood synthesis",
    summary: "Retry reused the completed Foundation section and added the missing Combat card.",
    metadata: {
      dogfood: "semantic_idle_section_retry",
      retryOfRunId,
      skippedSectionCount: 1,
      completedSectionCount: 2,
      failedSectionCount: 0,
      semanticIdleSectionCount: 0,
      cardCount: 2,
    },
    status: "succeeded",
    completedAt: new Date().toISOString(),
    cardCount: 2,
  });
}

function dogfoodSemanticIdleDraftFallback(): ProjectBoardSynthesisDraft {
  return {
    summary: "Dogfood semantic-idle section recovery proposal.",
    goal: "Prove stalled section recovery through the project-board app boundary.",
    currentState: "A sectioned board synthesis run produced one completed section and one semantic-idle stalled section.",
    targetUser: "Ambient project-board dogfood operator.",
    qualityBar: "Completed section work must be preserved while failed source coverage remains visible and retryable.",
    assumptions: ["This draft is E2E-only dogfood data."],
    questions: [],
    sourceNotes: [],
    cards: [],
  };
}
