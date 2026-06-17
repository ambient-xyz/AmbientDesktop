import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  createProjectBoardPlannerWorkspaceTailState,
  createProjectBoardPlannerWorkspace,
  pollProjectBoardPlannerWorkspaceRecords,
  projectBoardPlannerWorkspacePromptBlock,
  readProjectBoardPlannerWorkspaceRecordsFromRoot,
  readProjectBoardPlannerWorkspaceRecords,
} from "./projectBoardPlannerWorkspace";
import {
  projectBoardPlannerWorkspaceToolExecutor,
  projectBoardPlannerWorkspaceToolPromptBlock,
} from "./projectBoardPlannerWorkspaceTools";

const now = "2026-05-04T12:00:00.000Z";
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("project board planner workspace", () => {
  it("writes source material, manifest, instructions, and readable JSONL outputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-planner-workspace-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-1",
      projectName: "Starship",
      operation: "board_synthesis",
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "Game Design Document",
          summary: "Hybrid Newtonian movement and shield combat.",
          excerpt: "# Movement\nThe ship has inertia.\n",
          path: "GAME_DESIGN_DOCUMENT.md",
          relevance: 99,
        },
      ],
    });

    const manifest = JSON.parse(await readFile(workspace.manifestPath, "utf8")) as Record<string, unknown>;
    const session = JSON.parse(await readFile(workspace.sessionPath, "utf8")) as Record<string, unknown>;
    const initialLedger = JSON.parse(await readFile(workspace.ledgerPath, "utf8")) as Record<string, unknown>;
    const sourceText = await readFile(workspace.sources[0].workspacePath, "utf8");
    const promptBlock = projectBoardPlannerWorkspacePromptBlock(workspace);

    expect(manifest).toMatchObject({
      boardId: "board-1",
      runId: "run-1",
      operation: "board_synthesis",
      sessionId: workspace.sessionId,
      ledgerPath: workspace.ledgerPath,
      batchPolicy: { minCandidateCardsPerBatch: 2, maxCandidateCardsPerBatch: 3 },
    });
    expect(session).toMatchObject({
      sessionId: workspace.sessionId,
      executionMode: "pi_session_stream",
      compatibilityFallback: "direct_chat_compat",
      batchPolicy: { continuationMode: "same_session_next_cards" },
    });
    expect(initialLedger).toMatchObject({
      sessionId: workspace.sessionId,
      renderedCardLedger: [],
      remainingCoverageLedger: [{ sourceId: "source-gdd", title: "Game Design Document", status: "uncovered" }],
    });
    expect(sourceText).toContain("The ship has inertia.");
    expect(promptBlock).toContain("Planner session id");
    expect(promptBlock).toContain(workspace.ledgerPath);
    expect(promptBlock).toContain("Aggregate JSONL output");
    expect(promptBlock).toContain(workspace.sources[0].workspacePath);

    const records = [
      validateProposalJsonlRecordArtifact({
        type: "candidate_card",
        sourceId: "synthesis:movement",
        title: "Implement movement",
        description: "Implement hybrid Newtonian movement.",
        candidateStatus: "needs_clarification",
        labels: ["movement"],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-2" }],
        clarificationQuestions: ["Should movement use thrust or direct velocity?"],
        acceptanceCriteria: ["Ship inertia is observable."],
        testPlan: { unit: ["Test movement reducer."], integration: [], visual: [], manual: [] },
      }),
      validateProposalJsonlRecordArtifact({
        type: "source_coverage",
        sourceId: "source-gdd",
        range: "lines:1-2",
        status: "partial",
        cardIds: ["synthesis:movement"],
        note: "Movement is covered, but the rest of the source still needs planning.",
        updatedAt: now,
      }),
      validateProposalJsonlRecordArtifact({
        type: "proposal_final",
        summary: "Movement proposal.",
        goal: "Build movement.",
        currentState: "Spec exists.",
        targetUser: "Players.",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: [],
        sourceNotes: ["GDD is authoritative."],
        createdAt: now,
      }),
    ];
    await appendProjectBoardPlannerWorkspaceRecords(workspace, records);

    const updatedLedger = JSON.parse(await readFile(workspace.ledgerPath, "utf8")) as Record<string, unknown>;
    expect(updatedLedger).toMatchObject({
      sessionId: workspace.sessionId,
      renderedCardLedger: [
        {
          cardId: "synthesis:movement",
          title: "Implement movement",
          candidateStatus: "needs_clarification",
          clarificationQuestionCount: 1,
          pendingClarificationCount: 1,
          clarificationState: "pending",
          duplicateDecision: "unique",
          restartAction: "wait_for_clarification",
          renderFingerprint: expect.stringMatching(/^rendered-card-/),
        },
      ],
      renderedCardLedgerChecksum: expect.stringMatching(/^rendered-card-ledger-/),
      renderedCardLedgerSummary: {
        cardCount: 1,
        blockedCardCount: 1,
        duplicateCardCount: 0,
        rejectedCardCount: 0,
        evidenceCardCount: 0,
        splitLineageCount: 0,
      },
      remainingCoverageLedger: [{ sourceId: "source-gdd", title: "Game Design Document", status: "unresolved" }],
      recordFingerprints: [
        { type: "candidate_card", fingerprint: expect.stringMatching(/^candidate-card-record-/) },
        { type: "source_coverage", fingerprint: expect.stringMatching(/^source-coverage-record-/) },
        { type: "proposal_final", fingerprint: expect.stringMatching(/^proposal-final-record-/) },
      ],
    });

    expect(await readProjectBoardPlannerWorkspaceRecords(workspace)).toEqual(records);
    expect(await readProjectBoardPlannerWorkspaceRecordsFromRoot(workspace.rootPath)).toEqual(records);
  });

  it("tails new workspace records and converts complete malformed lines into recoverable errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-planner-workspace-tail-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-tail",
      operation: "board_synthesis",
      sources: [{ id: "source-gdd", kind: "functional_spec", title: "GDD", summary: "Spec.", relevance: 90 }],
    });
    const state = createProjectBoardPlannerWorkspaceTailState();
    const record = validateProposalJsonlRecordArtifact({
      type: "question",
      questionId: "question:controls",
      question: "Which controls?",
      required: true,
      createdAt: now,
    });

    await writeFile(workspace.aggregateJsonlPath, `${JSON.stringify(record)}\n{"type":`, "utf8");
    expect(await pollProjectBoardPlannerWorkspaceRecords({ workspace, state })).toEqual([record]);
    expect(await pollProjectBoardPlannerWorkspaceRecords({ workspace, state })).toEqual([]);

    await writeFile(workspace.aggregateJsonlPath, `${JSON.stringify(record)}\n{"type":\n`, "utf8");
    const malformed = await pollProjectBoardPlannerWorkspaceRecords({ workspace, state });
    expect(malformed).toHaveLength(1);
    expect(malformed[0]).toMatchObject({
      type: "error",
      code: "planner_workspace_invalid_jsonl",
      recoverable: true,
    });
  });

  it("exposes bounded planner workspace tools for source reads, ledger reads, and JSONL appends", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-planner-workspace-tools-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-tools",
      operation: "board_synthesis",
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Spec.",
          excerpt: "0123456789abcdefghijklmnopqrstuvwxyz",
          path: "GDD.md",
          relevance: 90,
        },
      ],
    });
    const runtime = projectBoardPlannerWorkspaceToolExecutor(workspace);
    expect(runtime.tools.map((tool) => tool.name)).toEqual([
      "planner_source_manifest",
      "planner_source_search",
      "planner_source_read",
      "planner_source_qa",
      "planner_ledger_read",
      "planner_card_search",
      "planner_records_append",
    ]);
    expect(projectBoardPlannerWorkspaceToolPromptBlock(workspace)).toContain("planner_records_append");

    const manifest = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-manifest", name: "planner_source_manifest", arguments: {} },
          {},
        )
      ).text,
    ) as { sources: Array<{ sourceId: string }> };
    expect(manifest.sources.map((source) => source.sourceId)).toEqual(["source-gdd"]);

    const searchResult = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-search", name: "planner_source_search", arguments: {} },
          { query: "Spec abc", sourceIds: ["source-gdd"], maxResults: 3, maxSnippetChars: 160 },
        )
      ).text,
    ) as { resultCount: number; results: Array<{ sourceId: string; snippet: string; cacheKey?: string }> };
    expect(searchResult.resultCount).toBe(1);
    expect(searchResult.results[0]).toMatchObject({ sourceId: "source-gdd" });
    expect(searchResult.results[0].snippet).toContain("Spec");

    const sourceRead = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-read", name: "planner_source_read", arguments: { sourceId: "source-gdd" } },
          { sourceId: "source-gdd", offset: 10, maxChars: 5 },
        )
      ).text,
    ) as { text: string; returnedChars: number; sourceChecksum: string; cacheKey: string };
    expect(sourceRead.returnedChars).toBe(5);
    expect(sourceRead.text).toHaveLength(5);
    expect(sourceRead.sourceChecksum).toMatch(/^planner-source-content-/);
    expect(sourceRead.cacheKey).toMatch(/^planner-source-read-/);

    const appendResult = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-append", name: "planner_records_append", arguments: {} },
          {
            records: [
              {
                type: "candidate_card",
                sourceId: "synthesis:tool-card",
                title: "Implement tool card",
                description: "A card written through the planner tool.",
                candidateStatus: "ready_to_create",
                priority: 1,
                phase: "Foundation",
                labels: ["tool"],
                blockedBy: [],
                sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
                clarificationQuestions: [],
                acceptanceCriteria: ["The tool card is represented."],
                testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
              },
            ],
          },
        )
      ).text,
    ) as { appendedRecordCount: number; recordTypes: string[] };
    expect(appendResult).toMatchObject({ appendedRecordCount: 1, recordTypes: ["candidate_card"] });

    const aliasAppendResult = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-append-alias-edge", name: "planner_records_append", arguments: {} },
          {
            records: [
              {
                type: "candidate_card",
                sourceId: "synthesis:dependent-tool-card",
                title: "Implement dependent tool card",
                description: "A card that depends on the first tool card.",
                candidateStatus: "ready_to_create",
                labels: ["tool"],
                blockedBy: ["synthesis:tool-card"],
                sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
                clarificationQuestions: [],
                acceptanceCriteria: ["The dependent tool card is represented."],
                testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
              },
              {
                type: "dependency_edge",
                from: "synthesis:tool-card",
                to: "synthesis:dependent-tool-card",
                rationale: "The first card creates the helper used by the dependent card.",
                updatedAt: now,
              },
            ],
          },
        )
      ).text,
    ) as { appendedRecordCount: number; recordTypes: string[] };
    expect(aliasAppendResult).toMatchObject({
      appendedRecordCount: 2,
      recordTypes: ["candidate_card", "dependency_edge"],
    });

    const records = await readProjectBoardPlannerWorkspaceRecords(workspace);
    expect(records.map((record) => record.type)).toEqual(
      expect.arrayContaining(["progress", "candidate_card", "dependency_edge"]),
    );
    expect(records.find((record) => record.type === "candidate_card")).toMatchObject({
      sourceId: "synthesis:tool-card",
      title: "Implement tool card",
    });
    expect(records.find((record) => record.type === "dependency_edge")).toMatchObject({
      fromCardId: "synthesis:tool-card",
      toCardId: "synthesis:dependent-tool-card",
      reason: "The first card creates the helper used by the dependent card.",
      createdAt: now,
    });

    const cardSearchResult = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-card-search", name: "planner_card_search", arguments: {} },
          { query: "tool card", maxResults: 3 },
        )
      ).text,
    ) as { resultCount: number; results: Array<{ cardId: string; duplicateRisk: string }> };
    expect(cardSearchResult.resultCount).toBe(2);
    expect(cardSearchResult.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "synthesis:tool-card", duplicateRisk: "high" }),
        expect.objectContaining({ cardId: "synthesis:dependent-tool-card", duplicateRisk: "high" }),
      ]),
    );

    const qaResult = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-source-qa", name: "planner_source_qa", arguments: {} },
          { question: "What does the GDD say about abc?", sourceIds: ["source-gdd"], maxEvidenceChars: 1200, maxSnippets: 2 },
        )
      ).text,
    ) as { evidenceRefs: unknown[]; confidence: number; needs_user_decision: boolean; failureKind?: string; cacheKey: string };
    expect(qaResult.evidenceRefs.length).toBeGreaterThan(0);
    expect(qaResult.confidence).toBeGreaterThan(0);
    expect(qaResult.needs_user_decision).toBe(false);
    expect(qaResult.failureKind).toBeUndefined();
    expect(qaResult.cacheKey).toMatch(/^planner-source-qa-/);

    const ledgerRead = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-ledger", name: "planner_ledger_read", arguments: {} },
          { maxChars: 18_000 },
        )
      ).text,
    ) as { text: string; truncated: boolean; ledgerChecksum: string; cacheKey: string };
    expect(ledgerRead.truncated).toBe(false);
    expect(ledgerRead.text).toContain("synthesis:tool-card");
    expect(ledgerRead.ledgerChecksum).toMatch(/^planner-ledger-content-/);
    expect(ledgerRead.cacheKey).toMatch(/^planner-ledger-read-/);
  });

  it("uses an injected source QA answerer once and replays cached QA results on retry", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-planner-qa-cache-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-qa-cache",
      operation: "board_synthesis",
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "Gravity Twist Spec",
          summary: "Gravity twist movement.",
          excerpt: "The gravity twist modifies projectile velocity and must remain bounded so the arena stays readable.",
          path: "GDD.md",
          relevance: 90,
        },
      ],
    });
    let answererCallCount = 0;
    const runtime = projectBoardPlannerWorkspaceToolExecutor(workspace, {
      sourceQaAnswerer: async (input) => {
        answererCallCount += 1;
        expect(input.citedSnippets.length).toBeGreaterThan(0);
        return {
          answer: "The evidence says the gravity twist modifies projectile velocity while keeping the arena readable.",
          confidence: 0.82,
          needs_user_decision: false,
        };
      },
    });

    const first = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-source-qa-1", name: "planner_source_qa", arguments: {} },
          { question: "What does the source say about gravity twist?", sourceIds: ["source-gdd"], maxEvidenceChars: 1200, maxSnippets: 2 },
        )
      ).text,
    ) as { answer: string; answerSource: string; cacheHit: boolean; cacheKey: string };
    const second = JSON.parse(
      (
        await runtime.execute(
          { type: "toolCall", id: "tool-source-qa-2", name: "planner_source_qa", arguments: {} },
          { question: "What does the source say about gravity twist?", sourceIds: ["source-gdd"], maxEvidenceChars: 1200, maxSnippets: 2 },
        )
      ).text,
    ) as { answer: string; answerSource: string; cacheHit: boolean; cacheKey: string };

    expect(answererCallCount).toBe(1);
    expect(first).toMatchObject({ answerSource: "pi_rlm", cacheHit: false });
    expect(second).toMatchObject({ answerSource: "cache", cacheHit: true, cacheKey: first.cacheKey });
    expect(second.answer).toBe(first.answer);

    const records = await readProjectBoardPlannerWorkspaceRecords(workspace);
    const qaProgress = records.filter(
      (record): record is Extract<(typeof records)[number], { type: "progress" }> =>
        record.type === "progress" && record.metadata.toolName === "planner_source_qa",
    );
    expect(qaProgress).toHaveLength(2);
    expect(qaProgress.at(-1)?.metadata).toMatchObject({ cacheHit: true, answerSource: "cache", cacheKey: first.cacheKey });
  });
});
