import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { appendProjectBoardPlannerWorkspaceRecords, createProjectBoardPlannerWorkspace } from "./projectBoardPlannerWorkspace";
import {
  AmbientProjectBoardSynthesisProvider,
  filterScopeContractCards,
  parseProjectBoardSynthesisJson,
  remainingPlannerCoverageSourceIds,
  type AmbientProjectBoardSynthesisProgress,
} from "./projectBoardSynthesisProvider";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("AmbientProjectBoardSynthesisProvider", () => {
  it("can recover a whole-board draft from planner workspace JSONL artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-workspace-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-1",
      projectName: "Workspace Board",
      operation: "board_synthesis",
      sources: [{ id: "source-gdd", kind: "functional_spec", title: "GDD", summary: "Movement spec.", path: "GDD.md", relevance: 90 }],
    });
    const bodies: Record<string, unknown>[] = [];
    const batches: Array<{ records: string[]; accumulated: number }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        await appendProjectBoardPlannerWorkspaceRecords(workspace, [
          validateProposalJsonlRecordArtifact({
            type: "candidate_card",
            sourceId: "synthesis:workspace-card",
            title: "Implement workspace card",
            description: "Card emitted through the planner workspace.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["workspace"],
            blockedBy: [],
            sourceRefs: [{ sourceId: "source-gdd" }],
            acceptanceCriteria: ["Workspace card is valid."],
            testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          }),
          validateProposalJsonlRecordArtifact({
            type: "proposal_final",
            summary: "Workspace proposal.",
            goal: "Build from workspace artifacts.",
            currentState: "Source material is available in the planner workspace.",
            targetUser: "Board reviewer.",
            qualityBar: "Proof required.",
            assumptions: ["Workspace artifacts are authoritative."],
            questions: [],
            sourceNotes: ["source-gdd was used."],
            createdAt: "2026-05-04T12:00:00.000Z",
          }),
        ]);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records: [] }) } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Workspace Board",
      sources: [{ id: "source-gdd", kind: "functional_spec", title: "GDD", summary: "Movement spec.", path: "GDD.md", relevance: 90 }],
      plannerWorkspace: workspace,
      onProgressiveRecords: (batch) =>
        batches.push({ records: batch.records.map((record) => record.type), accumulated: batch.accumulatedRecordCount }),
    });

    expect(JSON.stringify(bodies[0])).toContain(workspace.aggregateJsonlPath);
    expect(batches).toEqual([{ records: ["candidate_card", "proposal_final"], accumulated: 2 }]);
    expect(result.draft).toMatchObject({
      summary: "Workspace proposal.",
      goal: "Build from workspace artifacts.",
    });
    expect(result.draft.cards.map((card) => card.title)).toEqual(["Implement workspace card"]);
    expect(result.progressiveRecords?.some((record) => record.type === "proposal_final")).toBe(true);
  });

  it("completes the run and warns once when planner workspace polling fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-pollfail-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-pollfail",
      projectName: "Poll Failure Board",
      operation: "board_synthesis",
      sources: [{ id: "source-gdd", kind: "functional_spec", title: "GDD", summary: "Movement spec.", path: "GDD.md", relevance: 90 }],
    });
    // Replace one polled JSONL with a directory so every poll fails with a
    // non-ENOENT error (EISDIR) instead of being treated as "file not written yet".
    // The errors output is never appended to by this run, so only polling breaks.
    await rm(workspace.outputPaths.error, { force: true, recursive: true });
    await mkdir(workspace.outputPaths.error, { recursive: true });

    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Board from the model stream.",
                    goal: "Build the slice without workspace imports.",
                    currentState: "Workspace polling is failing.",
                    targetUser: "Board reviewer.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: ["GDD.md"],
                    cards: [
                      {
                        sourceId: "stream-card",
                        title: "Implement movement",
                        description: "Implement the movement slice from the GDD.",
                        candidateStatus: "ready",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["gameplay"],
                        blockedBy: [],
                        acceptanceCriteria: ["Movement works."],
                        testPlan: { unit: ["Test movement."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["GDD.md"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Poll Failure Board",
      sources: [{ id: "source-gdd", kind: "functional_spec", title: "GDD", summary: "Movement spec.", path: "GDD.md", relevance: 90 }],
      plannerWorkspace: workspace,
      onProgress: (event) => progress.push(event),
    });

    expect(result.draft.cards.some((card) => card.title === "Implement movement")).toBe(true);
    const pollWarnings = progress.filter((event) => event.metadata.workspacePollError === true);
    expect(pollWarnings).toHaveLength(1);
    expect(pollWarnings[0].title).toBe("Planner workspace unavailable");
  });

  it("pauses sectioned planning after a validated section checkpoint", async () => {
    const calls: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        const records = [
          {
            type: "candidate_card",
            sourceId: "synthesis:movement-model",
            title: "Implement movement model",
            description: "Add movement from the movement section.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Movement",
            labels: ["movement"],
            blockedBy: [],
            sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-2" }],
            acceptanceCriteria: ["Ship moves."],
            testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          },
          {
            type: "source_coverage",
            sourceId: "source-gdd",
            range: "lines:1-2",
            status: "covered",
            cardIds: ["synthesis:movement-model"],
            updatedAt: "2026-05-04T00:00:00.000Z",
          },
        ];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records }) } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Sectioned Pause",
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: [
            "## Movement",
            "The ship uses hybrid Newtonian movement.",
            "",
            "## Combat",
            "Enemy ships fire salvos and shields absorb damage.",
          ].join("\n"),
          relevance: 99,
        },
      ],
      shouldPause: (checkpoint) => checkpoint.phase === "section" && checkpoint.sectionIndex === 1,
    });

    expect(calls).toHaveLength(1);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model"]);
    expect(result.telemetry).toMatchObject({
      paused: true,
      pauseReason: "user_cancelled",
      partial: true,
      sectionCount: 2,
    });
    expect(result.progressiveRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "progress",
          stage: "planning_paused",
          metadata: expect.objectContaining({
            sectionIndex: 1,
            sectionCount: 2,
            stopReason: "pause_requested",
          }),
        }),
      ]),
    );
  });

  it("imports sectioned planning records from planner workspace outputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-section-workspace-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-section-1",
      projectName: "Section Workspace",
      operation: "section_elaboration",
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          excerpt: "# Movement\nThe ship uses inertia.",
          path: "GDD.md",
          relevance: 99,
        },
      ],
    });
    const batches: Array<{ records: string[]; accumulated: number }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        expect(String(init?.body)).toContain(workspace.aggregateJsonlPath);
        await appendProjectBoardPlannerWorkspaceRecords(workspace, [
          validateProposalJsonlRecordArtifact({
            type: "candidate_card",
            sourceId: "synthesis:section-workspace-card",
            title: "Implement section workspace card",
            description: "Card emitted through workspace JSONL.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Gameplay",
            labels: ["movement"],
            blockedBy: [],
            sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
            acceptanceCriteria: ["Movement is represented."],
            testPlan: { unit: ["Movement unit proof."], integration: [], visual: [], manual: [] },
          }),
          validateProposalJsonlRecordArtifact({
            type: "source_coverage",
            sourceId: "source-gdd",
            range: "full",
            status: "covered",
            cardIds: ["synthesis:section-workspace-card"],
            updatedAt: "2026-05-04T12:00:00.000Z",
          }),
        ]);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records: [] }) } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Section Workspace",
      sources: workspace.sources.map((source) => ({
        id: source.sourceId,
        kind: source.kind,
        title: source.title,
        summary: source.summary,
        path: source.originalPath,
        relevance: source.relevance,
      })),
      plannerWorkspace: workspace,
      onProgressiveRecords: (batch) =>
        batches.push({ records: batch.records.map((record) => record.type), accumulated: batch.accumulatedRecordCount }),
    });

    expect(batches).toEqual([
      { records: ["candidate_card", "source_coverage"], accumulated: 2 },
      { records: ["progress"], accumulated: 3 },
    ]);
    expect(result.draft.cards.map((card) => card.title)).toEqual(["Implement section workspace card"]);
    expect(result.progressiveRecords?.some((record) => record.type === "proposal_final")).toBe(true);
  });

  it("recovers a draft from progressive JSONL when final proposal JSON is unavailable", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    "```jsonl",
                    JSON.stringify({
                      type: "candidate_card",
                      sourceId: "synthesis:recovered-shell",
                      title: "Recover shell card",
                      description: "Recovered from progressive JSONL.",
                      candidateStatus: "ready_to_create",
                      priority: 1,
                      phase: "Foundation",
                      labels: ["recovered"],
                      blockedBy: [],
                      sourceRefs: [{ path: "GAME_DESIGN_DOCUMENT.md" }],
                      acceptanceCriteria: ["Recovered card has acceptance criteria."],
                      testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
                    }),
                    JSON.stringify({
                      type: "question",
                      questionId: "question-recovered",
                      question: "Which control model should the recovered card assume?",
                      required: true,
                      createdAt: "2026-05-04T00:00:00.000Z",
                    }),
                    "```",
                  ].join("\n"),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Recovery Test",
      sources: [{ kind: "functional_spec", title: "GDD", summary: "Game design.", path: "GAME_DESIGN_DOCUMENT.md", relevance: 99 }],
    });

    expect(result.draft.summary).toContain("Recovered");
    expect(result.draft.cards).toEqual([
      expect.objectContaining({
        sourceId: "synthesis:recovered-shell",
        title: "Recover shell card",
        candidateStatus: "ready_to_create",
      }),
    ]);
    expect(result.draft.questions).toEqual(["Which control model should the recovered card assume?"]);
    expect(result.telemetry.cardCount).toBe(1);
    expect(result.telemetry.questionCount).toBe(1);
  });

  it("parses fenced JSON responses", () => {
    expect(parseProjectBoardSynthesisJson('```json\n{"ok": true}\n```')).toEqual({ ok: true });
  });

  it("includes a bounded redacted preview when synthesis returns non-JSON text", () => {
    const secret = "gmi_1234567890abcdef1234567890abcdef";
    const text = `I cannot produce JSON right now. apiKey=${secret} ${"retry later ".repeat(80)}`;

    expect(() => parseProjectBoardSynthesisJson(text)).toThrow(
      /Ambient project-board synthesis did not return valid JSON\. Parser error: .*Response preview: "I cannot produce JSON right now\./,
    );
    try {
      parseProjectBoardSynthesisJson(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("[redacted-secret]");
      expect(message).not.toContain(secret);
      expect(message.length).toBeLessThan(650);
      expect(message).toContain("...");
    }
  });

  it("includes the same bounded preview when extracted JSON is malformed", () => {
    const text = `Here is the board:\n{"cards":[{"sourceId":"synthesis:ux-mock-approval" "title":"Create UX mock"}]}`;

    expect(() => parseProjectBoardSynthesisJson(text)).toThrow(
      /Ambient project-board synthesis did not return valid JSON\. Parser error: .*Response preview: "Here is the board:/,
    );
  });

  it("defaults unlabeled cards to scope:supporting instead of failing the assembled run", () => {
    const card = (sourceId: string, title: string, labels: string[]) => ({
      sourceId,
      title,
      description: "Card description.",
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Build",
      labels,
      blockedBy: [],
      acceptanceCriteria: ["Done."],
      testPlan: { unit: ["Proof."], integration: [], visual: [], manual: [] },
      sourceRefs: ["PLAN.md"],
    });
    const draft = {
      summary: "Board.",
      goal: "Build it.",
      currentState: "Sources exist.",
      targetUser: "Users.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        card("synthesis:labeled", "Labeled card", ["scope:required"]),
        card("synthesis:unlabeled", "Unlabeled card", ["implementation"]),
        card("synthesis:optional", "Optional extra", ["scope:optional"]),
      ],
    };
    const scopeContract = {
      included: [],
      excluded: [],
      requiredCapabilities: ["core flow"],
      planningDepthHints: [],
      openQuestions: [],
      evidence: [],
    };

    const result = filterScopeContractCards(draft, { sources: [], scopeContract });

    // The unlabeled card survives with a defaulted label; only the explicit
    // scope:optional card is filtered.
    expect(result.draft.cards.map((item) => item.title)).toEqual(["Labeled card", "Unlabeled card"]);
    expect(result.draft.cards[1].labels).toContain("scope:supporting");
    expect(result.diagnostics.map((item) => item.title)).toEqual(["Optional extra"]);
    expect(result.warningRecords.map((record) => (record.type === "warning" ? record.code : record.type))).toEqual([
      "scope_contract_candidate_filtered",
      "scope_contract_unlabeled_candidate_defaulted",
    ]);

    // The hard failure is reserved for runs where every card is explicitly out of scope.
    expect(() =>
      filterScopeContractCards(
        { ...draft, cards: [card("synthesis:optional", "Optional extra", ["scope:optional"])] },
        { sources: [], scopeContract },
      ),
    ).toThrow(/only cards outside explicit scope constraints/);
  });

  it("clears remaining coverage when a later record marks an unresolved source covered", () => {
    const sources = [
      { id: "source-a", kind: "functional_spec" as const, title: "A", summary: "A.", path: "A.md", relevance: 90 },
      { id: "source-b", kind: "functional_spec" as const, title: "B", summary: "B.", path: "B.md", relevance: 80 },
    ];
    const coverage = (sourceId: string, status: "covered" | "unresolved" | "partial") =>
      validateProposalJsonlRecordArtifact({
        type: "source_coverage",
        sourceId,
        range: "full",
        status,
        cardIds: [],
        updatedAt: "2026-05-04T12:00:00.000Z",
      });

    // Unresolved in batch 1, covered in batch 3: the source is complete.
    expect(
      remainingPlannerCoverageSourceIds(sources, [
        coverage("source-a", "unresolved"),
        coverage("source-b", "partial"),
        coverage("source-a", "covered"),
        coverage("source-b", "covered"),
      ]),
    ).toEqual([]);

    // The reverse order still counts as unresolved (last record wins both ways).
    expect(remainingPlannerCoverageSourceIds(sources, [coverage("source-a", "covered"), coverage("source-a", "unresolved")])).toEqual([
      "source-a",
      "source-b",
    ]);
  });
});
