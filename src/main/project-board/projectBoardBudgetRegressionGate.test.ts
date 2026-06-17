import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { createProjectBoardPlannerWorkspace, readProjectBoardPlannerWorkspaceRecords } from "./projectBoardPlannerWorkspace";
import type { ProjectBoardSynthesisSource } from "./projectBoardSynthesis";
import { AmbientProjectBoardSynthesisProvider, type AmbientProjectBoardSynthesisProgress } from "./projectBoardSynthesisProvider";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("project board planner budget regression gate", () => {
  it("keeps normal planner batches within budget and compacts large ledgers before Pi", async () => {
    const generatedAt = new Date().toISOString();
    const scenarios = [];

    scenarios.push(await runBudgetGateScenario({ name: "small", sources: budgetGateSources("small"), expectedCompaction: false }));
    scenarios.push(await runBudgetGateScenario({ name: "medium", sources: budgetGateSources("medium"), expectedCompaction: false }));
    const large = await runBudgetGateScenario({
      name: "large-ledger",
      sources: budgetGateSources("large"),
      resumeFromRecords: budgetGatePriorCards(1_500),
      expectedCompaction: true,
    });
    scenarios.push(large);
    scenarios.push(
      await runBudgetGateScenario({
        name: "large-ledger-cache-replay",
        sources: budgetGateSources("large"),
        resumeFromRecords: [...budgetGatePriorCards(1_500), large.compactionRecord],
        expectedCompaction: true,
        expectedCacheHit: true,
      }),
    );

    const report = {
      generatedAt,
      purpose:
        "Deterministic project-board planner prompt-budget regression gate. Normal card batches must stay within budget; large rendered-card ledgers must compact before planner calls; unchanged retries must reuse compaction cache.",
      scenarios: scenarios.map(({ compactionRecord: _compactionRecord, ...scenario }) => scenario),
    };
    const outputPath = resolve(
      process.env.AMBIENT_PROJECT_BOARD_BUDGET_GATE_OUT || join(process.cwd(), "test-results/project-board-budget-regression-gate/latest.json"),
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(scenarios.map((scenario) => scenario.name)).toEqual(["small", "medium", "large-ledger", "large-ledger-cache-replay"]);
    expect(scenarios.filter((scenario) => scenario.expectedCompaction === false).every((scenario) => scenario.promptBudgetStatus === "within_budget")).toBe(
      true,
    );
    expect(scenarios.filter((scenario) => scenario.expectedCompaction === false).every((scenario) => scenario.promptBudgetWarningCount === 0)).toBe(
      true,
    );
    expect(large.rawPromptBudgetStatus).toMatch(/summarization_recommended|soft_prompt_budget_exceeded|context_budget_exceeded/);
    expect(large.promptBudgetStatus).toBe("within_budget");
    expect(large.plannerLedgerCompactionCount).toBe(1);
    expect(large.plannerLedgerCompactionCacheHitCount).toBe(0);
    expect(large.promptBudgetWarningCount).toBe(0);
    expect(large.compactionPromptCount).toBe(1);

    const replay = scenarios.find((scenario) => scenario.name === "large-ledger-cache-replay");
    expect(replay).toMatchObject({
      promptBudgetStatus: "within_budget",
      plannerLedgerCompactionCount: 1,
      plannerLedgerCompactionCacheHitCount: 1,
      promptBudgetWarningCount: 0,
      compactionPromptCount: 0,
    });
  });
});

async function runBudgetGateScenario(input: {
  name: string;
  sources: ProjectBoardSynthesisSource[];
  resumeFromRecords?: ProposalJsonlRecordArtifact[];
  expectedCompaction: boolean;
  expectedCacheHit?: boolean;
}): Promise<{
  name: string;
  expectedCompaction: boolean;
  expectedCacheHit: boolean;
  sourceCount: number;
  resumeRecordCount: number;
  promptBudgetStatus?: string;
  rawPromptBudgetStatus?: string;
  promptBudgetWarningCount: number;
  plannerLedgerCompactionCount: number;
  plannerLedgerCompactionCacheHitCount: number;
  compactionPromptCount: number;
  plannerPromptCount: number;
  maxPromptBudgetUtilization?: number;
  outputTokenBudget?: number;
  cardCount: number;
  compactionRecord: ProposalJsonlRecordArtifact;
}> {
  const root = await mkdtemp(join(tmpdir(), `ambient-budget-gate-${input.name}-`));
  tempRoots.push(root);
  const projectName = input.name.startsWith("large-ledger") ? "Budget Gate large-ledger" : `Budget Gate ${input.name}`;
  const workspace = await createProjectBoardPlannerWorkspace({
    projectPath: root,
    boardId: `board-budget-gate-${input.name}`,
    runId: `run-budget-gate-${input.name}`,
    projectName,
    operation: "board_synthesis",
    sources: input.sources,
  });
  const progress: AmbientProjectBoardSynthesisProgress[] = [];
  let compactionPromptCount = 0;
  let plannerPromptCount = 0;
  const provider = new AmbientProjectBoardSynthesisProvider({
    model: "unknown-model",
    apiKey: "ambient-test-key",
    baseUrl: "https://ambient.example/v1",
    piTextCall: async (callInput) => {
      if (callInput.systemPrompt?.includes("ledger compaction")) {
        compactionPromptCount += 1;
        return JSON.stringify({
          summary: "Budget gate compacted the already-rendered card ledger while preserving remaining kanban coverage.",
          renderedCardThemes: ["Existing setup cards are already represented"],
          duplicateAvoidanceNotes: ["Do not recreate the prior rendered card series."],
          remainingCoverage: [{ sourceId: "source-budget-large", title: "Large budget fixture", status: "uncovered", summary: "One card gap remains." }],
          openQuestions: [],
          dependencyHints: ["Search existing cards before adding setup work."],
          citations: ["source-budget-large", "synthesis:prior-budget-card-1499"],
        });
      }
      plannerPromptCount += 1;
      return budgetGatePlannerResponse(input.name);
    },
  });

  const result = await provider.synthesizePlannerBatchesWithTelemetry({
    projectName,
    sources: input.sources,
    plannerWorkspace: workspace,
    resumeFromRecords: input.resumeFromRecords,
    maxBatches: 1,
    maxCardsPerBatch: 2,
    onProgress: (event) => progress.push(event),
  });
  const records = await readProjectBoardPlannerWorkspaceRecords(workspace);
  const compactionRecord = records.find((record) => record.type === "progress" && record.stage === "planner_ledger_compacted");
  const plannerRequest = progress.find((event) => event.stage === "model_request" && event.title === "Asked Ambient/Pi for planner batch 1");
  const rawPromptBudgetStatus = stringMetadata(plannerRequest?.metadata.rawPromptBudgetAssessment, "status");

  if (input.expectedCompaction) {
    expect(compactionRecord).toBeTruthy();
    expect(result.telemetry.plannerLedgerCompactionCount).toBe(1);
  } else {
    expect(compactionRecord).toBeFalsy();
    expect(result.telemetry.plannerLedgerCompactionCount ?? 0).toBe(0);
  }
  if (input.expectedCacheHit) {
    expect(compactionPromptCount).toBe(0);
    expect(result.telemetry.plannerLedgerCompactionCacheHitCount).toBe(1);
  }

  return {
    name: input.name,
    expectedCompaction: input.expectedCompaction,
    expectedCacheHit: input.expectedCacheHit === true,
    sourceCount: input.sources.length,
    resumeRecordCount: input.resumeFromRecords?.length ?? 0,
    promptBudgetStatus: result.telemetry.promptBudgetStatus,
    rawPromptBudgetStatus,
    promptBudgetWarningCount: result.telemetry.promptBudgetWarningCount ?? 0,
    plannerLedgerCompactionCount: result.telemetry.plannerLedgerCompactionCount ?? 0,
    plannerLedgerCompactionCacheHitCount: result.telemetry.plannerLedgerCompactionCacheHitCount ?? 0,
    compactionPromptCount,
    plannerPromptCount,
    maxPromptBudgetUtilization: result.telemetry.maxPromptBudgetUtilization,
    outputTokenBudget: result.telemetry.outputTokenBudget,
    cardCount: result.draft.cards.length,
    compactionRecord: compactionRecord ?? progressRecordPlaceholder(),
  };
}

function budgetGateSources(size: "small" | "medium" | "large"): ProjectBoardSynthesisSource[] {
  if (size === "small") {
    return [
      {
        id: "source-budget-small",
        kind: "functional_spec",
        title: "Small calculator objective",
        summary: "Build a compact calculator with arithmetic buttons, keyboard input, and simple proof.",
        path: "docs/calculator.md",
        relevance: 96,
      },
    ];
  }
  if (size === "medium") {
    return Array.from({ length: 8 }, (_, index) => ({
      id: `source-budget-medium-${index}`,
      kind: "functional_spec" as const,
      title: `Medium kanban feature ${index + 1}`,
      summary: `Feature ${index + 1} for a small web kanban board covering columns, cards, editing, filtering, persistence, accessibility, visual polish, and tests.`,
      excerpt: Array.from(
        { length: 18 },
        (_line, line) =>
          `Feature ${index + 1}.${line + 1}: implement a bounded kanban capability with acceptance criteria, proof expectations, and no duplicate cards.`,
      ).join("\n"),
      path: `docs/medium-kanban-${index + 1}.md`,
      relevance: 90 - index,
    }));
  }
  return [
    {
      id: "source-budget-large",
      kind: "functional_spec",
      title: "Large budget fixture",
      summary: "Build a small web kanban board while preserving a very large prior rendered-card ledger.",
      path: "docs/large-kanban.md",
      relevance: 98,
    },
  ];
}

function budgetGatePriorCards(count: number): ProposalJsonlRecordArtifact[] {
  return Array.from({ length: count }, (_, index) => ({
    type: "candidate_card",
    sourceId: `synthesis:prior-budget-card-${index}`,
    title: `Prior budget gate card ${index}`,
    description: "Existing rendered card carried forward to test prompt-pressure compaction.",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "Existing",
    labels: ["existing", "budget-gate"],
    blockedBy: [],
    sourceRefs: [{ sourceId: "source-budget-large", range: `prior-${index}` }],
    clarificationQuestions: [],
    acceptanceCriteria: ["Existing card remains represented."],
    testPlan: { unit: ["Existing proof."], integration: [], visual: [], manual: [] },
  }));
}

function budgetGatePlannerResponse(name: string): string {
  const cardId = `synthesis:${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-next-card`;
  const sourceId = name.startsWith("large") ? "source-budget-large" : name === "medium" ? "source-budget-medium-0" : "source-budget-small";
  return JSON.stringify({
    plannerStatus: "planning_complete",
    records: [
      {
        type: "candidate_card",
        sourceId: cardId,
        title: `Plan ${name} next card`,
        description: `Create the next bounded ${name} implementation card from the budget regression gate fixture.`,
        candidateStatus: "ready_to_create",
        priority: 1,
        phase: "Planning",
        labels: ["budget-gate"],
        blockedBy: [],
        sourceRefs: [{ sourceId, range: "full" }],
        clarificationQuestions: [],
        acceptanceCriteria: ["The card is bounded and proof-ready."],
        testPlan: { unit: ["Validate card data shape."], integration: [], visual: [], manual: [] },
      },
      {
        type: "source_coverage",
        sourceId,
        range: "full",
        status: "covered",
        cardIds: [cardId],
        updatedAt: "2026-05-12T00:00:00.000Z",
      },
    ],
  });
}

function stringMetadata(value: unknown, key: string): string | undefined {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return typeof record[key] === "string" ? record[key] : undefined;
}

function progressRecordPlaceholder(): ProposalJsonlRecordArtifact {
  return {
    type: "progress",
    stage: "not_created",
    title: "No compaction record",
    summary: "",
    createdAt: "2026-05-12T00:00:00.000Z",
    metadata: {},
  };
}
