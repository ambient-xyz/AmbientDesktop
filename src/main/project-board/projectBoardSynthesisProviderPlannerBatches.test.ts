import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { createProjectBoardPlannerWorkspace, readProjectBoardPlannerWorkspaceRecords } from "./projectBoardPlannerWorkspace";
import { AmbientProjectBoardSynthesisProvider, type AmbientProjectBoardSynthesisProgress } from "./projectBoardSynthesisProvider";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

function plannerBatchFixtureResponse(cardId: string): string {
  return JSON.stringify({
    plannerStatus: "planning_complete",
    records: [
      {
        type: "candidate_card",
        sourceId: cardId,
        title: "Summarize current kanban gaps",
        description: "Create a focused card from the remaining source after compacting the large planner ledger.",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Planning",
        labels: ["kanban"],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
        clarificationQuestions: [],
        acceptanceCriteria: ["The card identifies remaining board gaps."],
        testPlan: { unit: ["Validate the card model."], integration: [], visual: [], manual: [] },
      },
      {
        type: "source_coverage",
        sourceId: "source-kanban",
        range: "full",
        status: "covered",
        cardIds: [cardId],
        updatedAt: "2026-05-04T12:00:00.000Z",
      },
    ],
  });
}

describe("AmbientProjectBoardSynthesisProvider planner batches", () => {
  it("threads abort signals into planner-batch Pi calls", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      piTextCall: async (input) => {
        requestSignal = input.signal;
        controller.abort(new Error("Planner pause abort"));
        throw input.signal?.reason ?? new Error("Expected planner signal to abort.");
      },
    });

    await expect(
      provider.synthesizePlannerBatchesWithTelemetry({
        projectName: "Planner Abort Board",
        signal: controller.signal,
        sources: [
          {
            id: "source-planner",
            kind: "functional_spec",
            title: "Planner spec",
            summary: "Create a recoverable board.",
            path: "SPEC.md",
            relevance: 95,
          },
        ],
      }),
    ).rejects.toThrow("Planner pause abort");
    expect(requestSignal).toBe(controller.signal);
  });

  it("drives whole-board planning as repeated ledger-backed card batches", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-batches-"));
    tempRoots.push(root);
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-batches",
      projectName: "Batch Board",
      operation: "board_synthesis",
      sources: [
        {
          id: "source-architecture",
          kind: "architecture_artifact",
          title: "Architecture",
          summary: "Create the app shell first.",
          path: "ARCHITECTURE.md",
          relevance: 95,
        },
        {
          id: "source-gameplay",
          kind: "functional_spec",
          title: "Gameplay",
          summary: "Then add movement.",
          path: "GAMEPLAY.md",
          relevance: 90,
        },
      ],
    });
    const prompts: string[] = [];
    const batches: Array<{ records: string[]; accumulated: number }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        prompts.push(prompt);
        const isSecondBatch = prompt.includes("synthesis:app-shell");
        const records = isSecondBatch
          ? [
              {
                type: "candidate_card",
                sourceId: "synthesis:movement",
                title: "Implement movement",
                description: "Add the first movement loop after the app shell exists.",
                candidateStatus: "ready_to_create",
                priority: 2,
                phase: "Gameplay",
                labels: ["movement"],
                blockedBy: ["synthesis:app-shell"],
                sourceRefs: [{ sourceId: "source-gameplay", range: "full" }],
                acceptanceCriteria: ["Movement updates are observable."],
                testPlan: { unit: ["Test movement state updates."], integration: [], visual: [], manual: [] },
              },
              {
                type: "source_coverage",
                sourceId: "source-gameplay",
                range: "full",
                status: "covered",
                cardIds: ["synthesis:movement"],
                updatedAt: "2026-05-04T12:00:00.000Z",
              },
            ]
          : [
              {
                type: "candidate_card",
                sourceId: "synthesis:app-shell",
                title: "Create app shell",
                description: "Create the app shell and initial rendering surface.",
                candidateStatus: "ready_to_create",
                priority: 1,
                phase: "Foundation",
                labels: ["foundation"],
                blockedBy: [],
                sourceRefs: [{ sourceId: "source-architecture", range: "full" }],
                acceptanceCriteria: ["The app shell starts."],
                testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
              },
              {
                type: "source_coverage",
                sourceId: "source-architecture",
                range: "full",
                status: "covered",
                cardIds: ["synthesis:app-shell"],
                updatedAt: "2026-05-04T12:00:00.000Z",
              },
            ];
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    plannerStatus: isSecondBatch ? "planning_complete" : "continue",
                    records,
                    remainingCoverageSummary: isSecondBatch ? "All source work is represented." : "Gameplay still needs movement.",
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Batch Board",
      sources: [
        {
          id: "source-architecture",
          kind: "architecture_artifact",
          title: "Architecture",
          summary: "Create the app shell first.",
          path: "ARCHITECTURE.md",
          relevance: 95,
        },
        {
          id: "source-gameplay",
          kind: "functional_spec",
          title: "Gameplay",
          summary: "Then add movement.",
          path: "GAMEPLAY.md",
          relevance: 90,
        },
      ],
      plannerWorkspace: workspace,
      maxBatches: 4,
      onProgressiveRecords: (batch) =>
        batches.push({ records: batch.records.map((record) => record.type), accumulated: batch.accumulatedRecordCount }),
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("Plan the next small batch");
    expect(prompts[0]).toContain("next 2-3 highest-leverage candidate_card records");
    expect(prompts[1]).toContain("synthesis:app-shell");
    expect(batches).toEqual([
      { records: ["candidate_card", "source_coverage", "progress"], accumulated: 3 },
      { records: ["candidate_card", "source_coverage", "progress"], accumulated: 6 },
    ]);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:app-shell", "synthesis:movement"]);
    expect(result.telemetry).toMatchObject({ plannerBatchCount: 2, batchCardLimit: 3, cardCount: 2 });
    const ledger = JSON.parse(await readFile(workspace.ledgerPath, "utf8")) as Record<string, unknown>;
    expect(ledger).toMatchObject({
      renderedCardLedger: [
        { cardId: "synthesis:app-shell", title: "Create app shell" },
        { cardId: "synthesis:movement", title: "Implement movement" },
      ],
      remainingCoverageLedger: [],
    });
  });

  it("threads lightweight PM Review recommendations into planner-batch board synthesis", async () => {
    const prompts: string[] = [];
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const reviewReport = {
      readiness: "ready_for_card_generation" as const,
      summary: "The charter is coherent enough to generate implementation cards.",
      sourceConfidence: "medium" as const,
      sourceConfidenceNotes: ["The PRD is primary, but scratch notes conflict with collaboration scope."],
      gitState: "git_ready" as const,
      gitStateNotes: ["Board artifacts are ready for remote Git coordination."],
      blockingQuestions: [],
      risks: ["The first board should stay local-first."],
      sourceConflicts: ["Scratch notes mention collaboration, but the PRD excludes collaboration."],
      sourceAuthorityNotes: ["Treat the PRD as primary over scratch notes."],
      recommendedActivationScope: "Generate a local-first editor board and defer collaboration.",
      cardGenerationConstraints: ["Do not generate collaboration cards.", "Start with persistence and editor shell cards."],
    };
    const previousDraft = {
      summary: reviewReport.summary,
      goal: "Build a local-first editor.",
      currentState: "A charter review report is ready.",
      targetUser: "Desktop note taker.",
      qualityBar: "Every generated card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Recommendation: Generate a local-first editor board and defer collaboration."],
      cards: [],
    };
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        prompts.push(body.messages.at(-1)?.content ?? "");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    plannerStatus: "planning_complete",
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:editor-shell",
                        title: "Create local-first editor shell",
                        description: "Build the initial editor shell without collaboration features.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["editor"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-prd", range: "full" }],
                        clarificationQuestions: [],
                        acceptanceCriteria: ["The editor shell runs locally."],
                        testPlan: { unit: ["Validate editor state initialization."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-prd",
                        range: "full",
                        status: "covered",
                        cardIds: ["synthesis:editor-shell"],
                        updatedAt: "2026-05-04T12:00:00.000Z",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Editor Board",
      sources: [
        {
          id: "source-prd",
          kind: "functional_spec",
          title: "PRD",
          summary: "Build a local-first editor.",
          path: "PRD.md",
          relevance: 95,
        },
      ],
      refinement: { previousDraft, answers: [], pmReviewReport: reviewReport },
      maxBatches: 1,
      onProgress: (event) => progress.push(event),
    });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("PM Review activation context");
    expect(prompts[0]).toContain("Generate a local-first editor board and defer collaboration.");
    expect(prompts[0]).toContain("Do not generate collaboration cards.");
    expect(prompts[0]).toContain('"sourceConfidence": "medium"');
    expect(prompts[0]).toContain('"gitState": "git_ready"');
    expect(prompts[0]).toContain("PM Review activation rules");
    expect(progress.find((event) => event.title === "Asked Ambient/Pi for planner batch 1")?.metadata).toMatchObject({
      pmReviewActivation: true,
      pmReviewReadiness: "ready_for_card_generation",
      pmReviewSourceConfidence: "medium",
      pmReviewGitState: "git_ready",
      pmReviewConstraintCount: 2,
    });
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:editor-shell"]);
  });

  it("pauses planner batches after a validated checkpoint", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ambient-planner-pause-"));
    tempRoots.push(workspaceRoot);
    const sources = [
      {
        id: "source-architecture",
        kind: "architecture_artifact" as const,
        title: "Architecture",
        summary: "Create the app shell first.",
        path: "ARCHITECTURE.md",
        relevance: 95,
      },
      {
        id: "source-gameplay",
        kind: "functional_spec" as const,
        title: "Gameplay",
        summary: "Then add movement.",
        path: "GAMEPLAY.md",
        relevance: 90,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: workspaceRoot,
      boardId: "board-pause",
      runId: "run-pause",
      projectName: "Pause Board",
      operation: "board_synthesis",
      sources,
    });
    let fetchCount = 0;
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    plannerStatus: "continue",
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:app-shell",
                        title: "Create app shell",
                        description: "Create the app shell before gameplay work.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["foundation"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-architecture", range: "full" }],
                        acceptanceCriteria: ["The app shell starts."],
                        testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-architecture",
                        range: "full",
                        status: "covered",
                        cardIds: ["synthesis:app-shell"],
                        updatedAt: "2026-05-04T12:00:00.000Z",
                      },
                    ],
                    remainingCoverageSummary: "Gameplay still needs movement.",
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Pause Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 3,
      shouldPause: (checkpoint) => checkpoint.phase === "planner_batch" && checkpoint.batchNumber === 1,
    });

    expect(fetchCount).toBe(1);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:app-shell"]);
    expect(result.telemetry).toMatchObject({
      paused: true,
      pauseReason: "user_cancelled",
      partial: true,
      lastValidRecordId: "source-architecture",
      lastValidRecordType: "source_coverage",
    });
    const progress = result.progressiveRecords?.find((record) => record.type === "progress" && record.stage === "planner_batch_succeeded");
    expect(progress).toMatchObject({
      metadata: expect.objectContaining({
        plannerStatus: "user_cancelled",
        recoverableOutputStop: true,
        stopReason: "pause_requested",
        lastValidRecordId: "source-architecture",
        lastValidRecordType: "source_coverage",
      }),
    });
    const workspaceRecords = await readProjectBoardPlannerWorkspaceRecords(workspace);
    expect(workspaceRecords.some((record) => record.type === "progress" && record.metadata.plannerStatus === "user_cancelled")).toBe(true);
  });

  it("uses a durable Pi session transport for planner batches when no direct fetch implementation is supplied", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-pi-session-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-architecture",
        kind: "architecture_artifact" as const,
        title: "Architecture",
        summary: "Create the app shell first.",
        path: "ARCHITECTURE.md",
        relevance: 95,
      },
      {
        id: "source-gameplay",
        kind: "functional_spec" as const,
        title: "Gameplay",
        summary: "Then add movement.",
        path: "GAMEPLAY.md",
        relevance: 90,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-pi-session",
      projectName: "Pi Session Board",
      operation: "board_synthesis",
      sources,
    });
    const piCalls: Array<{
      sessionId?: string;
      prompt: string;
      maxTokens?: number;
      maxToolRounds?: number;
      responseFormat?: unknown;
      toolNames: string[];
    }> = [];
    const progressTransportModes: unknown[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      maxToolRounds: 6,
      piTextCall: async (callInput) => {
        piCalls.push({
          prompt: callInput.prompt,
          ...(callInput.sessionId ? { sessionId: callInput.sessionId } : {}),
          ...(callInput.maxTokens === undefined ? {} : { maxTokens: callInput.maxTokens }),
          ...(callInput.maxToolRounds === undefined ? {} : { maxToolRounds: callInput.maxToolRounds }),
          ...(callInput.responseFormat === undefined ? {} : { responseFormat: callInput.responseFormat }),
          toolNames: callInput.tools?.map((tool) => tool.name) ?? [],
        });
        callInput.onProgress?.({
          outputChars: 24,
          thinkingChars: 0,
          elapsedMs: 10,
          stage: "streaming",
        });
        return JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:app-shell",
              title: "Create app shell",
              description: "Create the app shell and first movement proof path.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["foundation"],
              blockedBy: [],
              sourceRefs: [
                { sourceId: "source-architecture", range: "full" },
                { sourceId: "source-gameplay", range: "full" },
              ],
              acceptanceCriteria: ["The app shell starts."],
              testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-architecture",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:app-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
            {
              type: "source_coverage",
              sourceId: "source-gameplay",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:app-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
          remainingCoverageSummary: "All source work is represented.",
        });
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Pi Session Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 2,
      onProgress: (progress) => progressTransportModes.push(progress.metadata.transportMode),
    });

    const plannerPiCalls = piCalls.filter((call) => call.prompt.includes("Plan the next small batch"));
    expect(plannerPiCalls).toHaveLength(1);
    expect(plannerPiCalls[0]).toMatchObject({
      sessionId: workspace.sessionId,
      maxTokens: 7200,
      maxToolRounds: 6,
      responseFormat: { type: "json_object" },
      toolNames: [
        "planner_source_manifest",
        "planner_source_search",
        "planner_source_read",
        "planner_source_qa",
        "planner_ledger_read",
        "planner_card_search",
        "planner_records_append",
      ],
    });
    expect(plannerPiCalls[0].prompt).toContain("planner_records_append");
    expect(plannerPiCalls[0].prompt).toContain(workspace.aggregateJsonlPath);
    expect(progressTransportModes).toContain("pi_session_stream");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:app-shell"]);
    expect(result.telemetry).toMatchObject({
      plannerBatchCount: 1,
      batchCardLimit: 3,
      cardCount: 1,
      outputTokenBudget: 7200,
      modelBudgetProfile: { operation: "planner_card_batch", maxOutputTokens: 7200 },
    });
  });

  it("records recoverable planner-batch output-cap stops with last valid record metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-output-cap-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-output-cap",
      projectName: "Output Cap Board",
      operation: "board_synthesis",
      sources,
    });
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        callInput.onProgress?.({
          outputChars: 120,
          thinkingChars: 0,
          elapsedMs: 10,
          stage: "streaming",
        });
        callInput.onCompleted?.({
          finishReason: "length",
          stopReason: "length",
          outputChars: 120,
          thinkingChars: 0,
          maxTokens: callInput.maxTokens,
          toolRound: 0,
        });
        return JSON.stringify({
          plannerStatus: "continue",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:kanban-shell",
              title: "Create kanban shell",
              description: "Create columns and a first card model.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["kanban"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
              acceptanceCriteria: ["The kanban board renders columns."],
              testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-kanban",
              range: "full",
              status: "partial",
              cardIds: ["synthesis:kanban-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Output Cap Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 3,
      onProgress: (event) => progress.push(event),
    });

    expect(result.telemetry).toMatchObject({
      partial: true,
      finishReason: "length",
      plannerBatchFinishReasons: ["length"],
      recoverableOutputStopCount: 1,
      outputTokenBudget: 7200,
      modelBudgetProfile: {
        operation: "planner_card_batch",
        maxOutputTokens: 7200,
        maxCardsPerBatch: 3,
      },
      lastValidRecordId: "source-kanban",
      lastValidRecordType: "source_coverage",
    });
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:kanban-shell"]);
    const batchProgress = (await readProjectBoardPlannerWorkspaceRecords(workspace)).find(
      (record) => record.type === "progress" && record.stage === "planner_batch_succeeded",
    );
    expect(batchProgress).toMatchObject({
      metadata: {
        plannerStatus: "budget_exhausted",
        finishReason: "length",
        recoverableOutputStop: true,
        outputTokenBudget: 7200,
        modelBudgetProfile: {
          operation: "planner_card_batch",
          maxOutputTokens: 7200,
          maxCardsPerBatch: 3,
        },
        lastValidRecordId: "source-kanban",
        lastValidRecordType: "source_coverage",
      },
    });
    expect(progress.some((event) => event.metadata.recoverableOutputStop === true)).toBe(true);
  });

  it("compacts a large planner ledger before asking for the next cards", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-budget-pressure-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Large kanban fixture",
        summary: "Build a small web kanban board and continue planning from an already large rendered-card ledger.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-budget-pressure",
      projectName: "Budget Pressure Board",
      operation: "board_synthesis",
      sources,
    });
    const priorCards = Array.from({ length: 1_500 }, (_, index) => ({
      type: "candidate_card" as const,
      sourceId: `synthesis:prior-card-${index}`,
      title: `Prior rendered card ${index}`,
      description: "Existing rendered card carried forward to test prompt-budget pressure in the planner ledger.",
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Existing",
      labels: ["existing"],
      blockedBy: [],
      sourceRefs: [{ sourceId: "source-kanban", range: `prior-${index}` }],
      clarificationQuestions: [],
      acceptanceCriteria: ["Existing card remains rendered and should not be regenerated."],
      testPlan: { unit: ["Existing proof."], integration: [], visual: [], manual: [] },
    }));
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const prompts: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "unknown-model",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        prompts.push(callInput.prompt);
        if (callInput.systemPrompt?.includes("ledger compaction")) {
          return JSON.stringify({
            summary: "The existing board already covers a long run of prior kanban cards. Continue with source-kanban gaps only.",
            renderedCardThemes: ["Existing: 1500 rendered cards"],
            duplicateAvoidanceNotes: ["Do not recreate prior-card titles; use planner_card_search for exact duplicate checks."],
            remainingCoverage: [
              { sourceId: "source-kanban", title: "Large kanban fixture", status: "uncovered", summary: "Needs one focused gap card." },
            ],
            openQuestions: [],
            dependencyHints: ["New cards should not depend on omitted prior card details unless searched."],
            citations: ["source-kanban", "synthesis:prior-card-1499"],
          });
        }
        return JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:kanban-summary",
              title: "Summarize current kanban gaps",
              description: "Create a focused card from the remaining source after the large ledger warning.",
              candidateStatus: "ready_to_create",
              priority: 2,
              phase: "Planning",
              labels: ["kanban"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["The card identifies remaining board gaps."],
              testPlan: { unit: ["Validate the card model."], integration: [], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-kanban",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:kanban-summary"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Budget Pressure Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 1,
      resumeFromRecords: priorCards,
      onProgress: (event) => progress.push(event),
    });

    const records = await readProjectBoardPlannerWorkspaceRecords(workspace);
    const compaction = records.find((record) => record.type === "progress" && record.stage === "planner_ledger_compacted");
    const plannerRequest = progress.find(
      (event) => event.stage === "model_request" && event.title === "Asked Ambient/Pi for planner batch 1",
    );

    const plannerPrompts = prompts.filter(
      (prompt) => prompt.includes("Compact project-board planner context") || prompt.includes("Plan the next small batch"),
    );
    expect(plannerPrompts).toHaveLength(2);
    expect(plannerPrompts[0]).toContain("Compact project-board planner context");
    expect(plannerPrompts[0]).toContain("Prior rendered card 1499");
    expect(plannerPrompts[1]).toContain("Compacted planner context:");
    expect(plannerPrompts[1]).toContain("The existing board already covers a long run of prior kanban cards");
    expect(plannerPrompts[1].length).toBeLessThan(plannerPrompts[0].length);
    expect(plannerPrompts[1]).not.toContain("Prior rendered card 100");
    expect(compaction).toMatchObject({
      type: "progress",
      stage: "planner_ledger_compacted",
      metadata: {
        plannerBatchIndex: 1,
        plannerLedgerCompaction: {
          source: "pi_rlm",
          cacheHit: false,
          cacheKey: expect.stringMatching(/^planner-ledger-compaction-/),
          renderedCardCount: 1500,
          omittedRenderedCardCount: 1440,
          rawPromptBudgetStatus: expect.stringMatching(/summarization_recommended|soft_prompt_budget_exceeded|context_budget_exceeded/),
        },
        plannerLedgerCompactionCache: {
          source: "pi_rlm",
          cacheHit: false,
          cacheKey: expect.stringMatching(/^planner-ledger-compaction-/),
          summary: "The existing board already covers a long run of prior kanban cards. Continue with source-kanban gaps only.",
          duplicateAvoidanceNotes: ["Do not recreate prior-card titles; use planner_card_search for exact duplicate checks."],
        },
      },
    });
    expect(plannerRequest?.metadata.promptBudgetAssessment).toMatchObject({
      operation: "planner_card_batch",
      summarizationRecommended: false,
    });
    expect(plannerRequest?.metadata.rawPromptBudgetAssessment).toMatchObject({
      operation: "planner_card_batch",
      summarizationRecommended: true,
    });
    expect(plannerRequest?.metadata.plannerLedgerCompaction).toMatchObject({
      source: "pi_rlm",
      renderedCardCount: 1500,
    });
    expect(plannerRequest?.metadata).toMatchObject({
      latestPromptCharCount: plannerPrompts[1].length,
      cumulativePromptCharCount: plannerPrompts[0].length + plannerPrompts[1].length,
      latestEstimatedInputTokens: Math.ceil(plannerPrompts[1].length / 4),
      cumulativeEstimatedInputTokens: Math.ceil((plannerPrompts[0].length + plannerPrompts[1].length) / 4),
      plannerLedgerCompactionStatus: "used",
    });
    expect(result.telemetry).toMatchObject({
      plannerLedgerCompactionCount: 1,
      plannerLedgerCompactionCacheHitCount: 0,
      promptBudgetWarningCount: 0,
      modelBudgetProfile: { operation: "planner_card_batch" },
    });
    expect(result.telemetry.promptBudgetStatus).toBe("within_budget");
    expect(result.telemetry.lastPlannerLedgerCompaction).toMatchObject({
      source: "pi_rlm",
      cacheHit: false,
      renderedCardCount: 1500,
    });
  });

  it("reuses cached planner ledger compaction for unchanged ledger inputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-budget-cache-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Large kanban fixture",
        summary: "Build a small web kanban board with many already rendered cards.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const firstWorkspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-budget-cache",
      runId: "run-budget-cache-1",
      projectName: "Budget Cache Board",
      operation: "board_synthesis",
      sources,
    });
    const priorCards = Array.from({ length: 1_500 }, (_, index) => ({
      type: "candidate_card" as const,
      sourceId: `synthesis:prior-card-${index}`,
      title: `Prior rendered card ${index}`,
      description: "Existing rendered card carried forward to test compaction cache reuse.",
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Existing",
      labels: ["existing"],
      blockedBy: [],
      sourceRefs: [{ sourceId: "source-kanban", range: `prior-${index}` }],
      clarificationQuestions: [],
      acceptanceCriteria: ["Existing card remains rendered and should not be regenerated."],
      testPlan: { unit: ["Existing proof."], integration: [], visual: [], manual: [] },
    }));
    const firstProvider = new AmbientProjectBoardSynthesisProvider({
      model: "unknown-model",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        if (callInput.systemPrompt?.includes("ledger compaction")) {
          return JSON.stringify({
            summary: "Cached compaction summary for the unchanged kanban ledger.",
            renderedCardThemes: ["Existing: 1500 rendered cards"],
            duplicateAvoidanceNotes: ["Avoid the already-rendered prior-card series."],
            remainingCoverage: [
              { sourceId: "source-kanban", title: "Large kanban fixture", status: "uncovered", summary: "One gap remains." },
            ],
            openQuestions: [],
            dependencyHints: ["Search prior cards before adding setup work."],
            citations: ["source-kanban", "synthesis:prior-card-1499"],
          });
        }
        return plannerBatchFixtureResponse("synthesis:first-cache-probe");
      },
    });

    await firstProvider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Budget Cache Board",
      sources,
      plannerWorkspace: firstWorkspace,
      maxBatches: 1,
      resumeFromRecords: priorCards,
    });

    const firstRecords = await readProjectBoardPlannerWorkspaceRecords(firstWorkspace);
    const cachedCompactionRecords = firstRecords.filter(
      (record): record is Extract<ProposalJsonlRecordArtifact, { type: "progress" }> =>
        record.type === "progress" && record.stage === "planner_ledger_compacted",
    );
    expect(cachedCompactionRecords).toHaveLength(1);
    const cachedCompactionMetadata = cachedCompactionRecords[0]?.metadata.plannerLedgerCompaction as { cacheKey: string } | undefined;
    expect(cachedCompactionMetadata?.cacheKey).toMatch(/^planner-ledger-compaction-/);

    const secondWorkspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-budget-cache",
      runId: "run-budget-cache-2",
      projectName: "Budget Cache Board",
      operation: "board_synthesis",
      sources,
    });
    const secondProgress: AmbientProjectBoardSynthesisProgress[] = [];
    const secondPrompts: string[] = [];
    let secondCompactionCalls = 0;
    const secondProvider = new AmbientProjectBoardSynthesisProvider({
      model: "unknown-model",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        secondPrompts.push(callInput.prompt);
        if (callInput.systemPrompt?.includes("ledger compaction")) {
          secondCompactionCalls += 1;
          throw new Error("Second run should reuse the cached ledger compaction.");
        }
        return plannerBatchFixtureResponse("synthesis:second-cache-probe");
      },
    });

    const secondResult = await secondProvider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Budget Cache Board",
      sources,
      plannerWorkspace: secondWorkspace,
      maxBatches: 1,
      resumeFromRecords: [...priorCards, ...cachedCompactionRecords],
      onProgress: (event) => secondProgress.push(event),
    });
    const secondRecords = await readProjectBoardPlannerWorkspaceRecords(secondWorkspace);
    const cacheHitRecord = secondRecords.find(
      (record) =>
        record.type === "progress" &&
        record.stage === "planner_ledger_compacted" &&
        (record.metadata.plannerLedgerCompaction as { cacheHit?: boolean } | undefined)?.cacheHit === true,
    );

    expect(secondCompactionCalls).toBe(0);
    const secondPlannerPrompts = secondPrompts.filter((prompt) => prompt.includes("Plan the next small batch"));
    expect(secondPlannerPrompts).toHaveLength(1);
    expect(secondPlannerPrompts[0]).toContain("Compacted planner context:");
    expect(secondPlannerPrompts[0]).toContain("Cached compaction summary for the unchanged kanban ledger.");
    expect(secondProgress.some((event) => event.title === "Reused cached planner ledger compaction for batch 1")).toBe(true);
    expect(cacheHitRecord).toMatchObject({
      type: "progress",
      stage: "planner_ledger_compacted",
      metadata: {
        plannerLedgerCompaction: {
          cacheHit: true,
          cacheKey: cachedCompactionMetadata?.cacheKey,
          renderedCardCount: 1500,
          omittedRenderedCardCount: 1440,
        },
      },
    });
    expect(secondResult.telemetry).toMatchObject({
      plannerLedgerCompactionCount: 1,
      plannerLedgerCompactionCacheHitCount: 1,
      promptBudgetWarningCount: 0,
    });
    expect(secondResult.telemetry.lastPlannerLedgerCompaction).toMatchObject({
      cacheHit: true,
      cacheKey: cachedCompactionMetadata?.cacheKey,
      renderedCardCount: 1500,
    });
  });

  it("prompts planner-batch retries from an explicit continuation checkpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-continuation-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
      {
        id: "source-dnd",
        kind: "functional_spec" as const,
        title: "Drag and drop",
        summary: "Cards should move between columns.",
        path: "DND.md",
        relevance: 90,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-continuation",
      projectName: "Continuation Board",
      operation: "board_synthesis",
      sources,
    });
    const prompts: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        prompts.push(callInput.prompt);
        return JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:drag-and-drop",
              title: "Add card drag and drop",
              description: "Move cards between columns with accessible status updates.",
              candidateStatus: "ready_to_create",
              priority: 2,
              phase: "Interaction",
              labels: ["kanban"],
              blockedBy: ["synthesis:kanban-shell"],
              sourceRefs: [{ sourceId: "source-dnd", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["Cards can move between columns."],
              testPlan: { unit: [], integration: ["Move a card in a browser test."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-dnd",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:drag-and-drop"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Continuation Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 2,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Create columns and a first card model.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
        {
          type: "source_coverage",
          sourceId: "source-kanban",
          range: "full",
          status: "partial",
          cardIds: ["synthesis:kanban-shell"],
          updatedAt: "2026-05-04T12:00:00.000Z",
        },
      ],
      resumeContinuation: {
        retryOfRunId: "run-output-cap",
        finishReason: "length",
        outputTokenBudget: 6000,
        lastValidRecordId: "source-kanban",
        lastValidRecordType: "source_coverage",
        originalRecordCount: 4,
        retainedRecordCount: 2,
        truncatedToLastValidRecord: true,
      },
    });

    const plannerPrompts = prompts.filter((prompt) => prompt.includes("Plan the next small batch"));
    expect(plannerPrompts).toHaveLength(1);
    expect(plannerPrompts[0]).toContain("Continuation checkpoint:");
    expect(plannerPrompts[0]).toContain("The last valid persisted record was source_coverage source-kanban.");
    expect(plannerPrompts[0]).toContain("Do not stitch partial JSON");
    expect(plannerPrompts[0]).toContain("synthesis:kanban-shell");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:kanban-shell", "synthesis:drag-and-drop"]);
  });

  it("describes paused planner-batch continuations with the pause checkpoint reason", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-paused-continuation-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-paused-continuation",
      projectName: "Paused Continuation Board",
      operation: "board_synthesis",
      sources,
    });
    const prompts: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        prompts.push(callInput.prompt);
        return JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:drag-and-drop",
              title: "Add card drag and drop",
              description: "Move cards between columns with accessible status updates.",
              candidateStatus: "ready_to_create",
              priority: 2,
              phase: "Interaction",
              labels: ["kanban"],
              blockedBy: ["synthesis:kanban-shell"],
              sourceRefs: [{ sourceId: "source-kanban", range: "later" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["Cards can move between columns."],
              testPlan: { unit: [], integration: ["Move a card in a browser test."], visual: [], manual: [] },
            },
          ],
        });
      },
    });

    await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Paused Continuation Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 1,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Create columns and a first card model.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "intro" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
      ],
      resumeContinuation: {
        retryOfRunId: "run-paused",
        finishReason: "user_cancelled",
        stopReason: "pause_requested",
        outputTokenBudget: 7200,
        lastValidRecordId: "synthesis:kanban-shell",
        lastValidRecordType: "candidate_card",
        lastValidRecordIndex: 0,
        plannerBatchIndex: 1,
        plannerBatchCount: 4,
        originalRecordCount: 4,
        retainedRecordCount: 1,
        truncatedToLastValidRecord: true,
      },
    });

    const plannerPrompts = prompts.filter((prompt) => prompt.includes("Plan the next small batch"));
    expect(plannerPrompts).toHaveLength(1);
    expect(plannerPrompts[0]).toContain("Continuation checkpoint:");
    expect(plannerPrompts[0]).toContain("Ambient/Pi previously stopped because of pause_requested.");
    expect(plannerPrompts[0]).not.toContain("previously stopped because of user_cancelled");
    expect(plannerPrompts[0]).toContain("The retry prompt contains 1 validated records through that checkpoint, from 4 prior records.");
  });

  it("keeps resumed planner-batch records recoverable when Pi returns an invalid batch shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-invalid-resume-batch-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-invalid-resume-batch",
      projectName: "Invalid Resume Batch Board",
      operation: "board_synthesis",
      sources,
    });
    const progress: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async () => JSON.stringify({ plannerStatus: "continue", cards: { invalid: true } }),
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Invalid Resume Batch Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 1,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Create columns and a first card model.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "intro" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
      ],
      resumeContinuation: {
        retryOfRunId: "run-paused",
        finishReason: "user_cancelled",
        stopReason: "pause_requested",
        outputTokenBudget: 7200,
        lastValidRecordId: "synthesis:kanban-shell",
        lastValidRecordType: "candidate_card",
        lastValidRecordIndex: 0,
        originalRecordCount: 4,
        retainedRecordCount: 1,
        truncatedToLastValidRecord: true,
      },
      onProgress: (event) => progress.push(`${event.stage}:${event.title}`),
    });

    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:kanban-shell"]);
    expect(result.telemetry.partial).toBe(true);
    expect(result.progressiveRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "progress", stage: "planner_batch_failed" }),
        expect.objectContaining({ type: "error", code: "planner_batch_invalid_response", recoverable: true }),
      ]),
    );
    expect(progress).toContain("schema_validation:Failed planner batch 1");
  });

  it("filters retry planner-batch cards already present in the rendered-card ledger", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-rendered-duplicate-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board.",
        path: "KANBAN.md",
        relevance: 95,
      },
      {
        id: "source-dnd",
        kind: "functional_spec" as const,
        title: "Drag and drop",
        summary: "Cards should move between columns.",
        path: "DND.md",
        relevance: 90,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-rendered-duplicate",
      projectName: "Continuation Board",
      operation: "board_synthesis",
      sources,
    });
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async () =>
        JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:kanban-shell",
              title: "Create kanban shell",
              description: "Duplicate card that Pi should not have re-emitted.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["kanban"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["The kanban board renders columns."],
              testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
            },
            {
              type: "candidate_card",
              sourceId: "synthesis:drag-and-drop",
              title: "Add card drag and drop",
              description: "Move cards between columns with accessible status updates.",
              candidateStatus: "ready_to_create",
              priority: 2,
              phase: "Interaction",
              labels: ["kanban"],
              blockedBy: ["synthesis:kanban-shell"],
              sourceRefs: [{ sourceId: "source-dnd", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["Cards can move between columns."],
              testPlan: { unit: [], integration: ["Move a card in a browser test."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-kanban",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:kanban-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
            {
              type: "source_coverage",
              sourceId: "source-dnd",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:drag-and-drop"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        }),
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Continuation Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 2,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Create columns and a first card model.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
        {
          type: "source_coverage",
          sourceId: "source-kanban",
          range: "full",
          status: "covered",
          cardIds: ["synthesis:kanban-shell"],
          updatedAt: "2026-05-04T12:00:00.000Z",
        },
      ],
      resumeContinuation: {
        retryOfRunId: "run-output-cap",
        finishReason: "length",
        outputTokenBudget: 6000,
        lastValidRecordId: "source-kanban",
        lastValidRecordType: "source_coverage",
        originalRecordCount: 4,
        retainedRecordCount: 2,
        truncatedToLastValidRecord: true,
      },
    });

    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:kanban-shell", "synthesis:drag-and-drop"]);
    expect(result.telemetry).toMatchObject({ renderedCardDuplicateFilterCount: 1 });
    expect(result.progressiveRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "warning",
          code: "planner_batch_rendered_card_duplicate_filtered",
          metadata: expect.objectContaining({
            enforcement: "rendered_card_ledger",
            duplicateCount: 1,
            duplicateCandidates: [
              expect.objectContaining({
                sourceId: "synthesis:kanban-shell",
                matchedCardId: "synthesis:kanban-shell",
                reason: "source_id",
                restartAction: "reuse_rendered_card",
              }),
            ],
          }),
        }),
      ]),
    );
    const workspaceRecords = await readProjectBoardPlannerWorkspaceRecords(workspace);
    expect(
      workspaceRecords.some(
        (record) =>
          record.type === "candidate_card" &&
          record.sourceId === "synthesis:kanban-shell" &&
          record.description === "Duplicate card that Pi should not have re-emitted.",
      ),
    ).toBe(false);
  });

  it("allows planner-batch retry to regenerate rendered cards invalidated by source checksum drift", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-provider-rendered-invalidated-"));
    tempRoots.push(root);
    const sources = [
      {
        id: "source-kanban",
        kind: "functional_spec" as const,
        title: "Kanban fixture",
        summary: "Build a small web kanban board with a refreshed interaction model.",
        path: "KANBAN.md",
        contentHash: "hash-kanban-v2",
        relevance: 95,
      },
    ];
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-1",
      runId: "run-rendered-invalidated",
      projectName: "Continuation Board",
      operation: "board_synthesis",
      sources,
    });
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async () =>
        JSON.stringify({
          plannerStatus: "planning_complete",
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:kanban-shell",
              title: "Create kanban shell",
              description: "Regenerated card from the refreshed kanban source.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["kanban"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-kanban", range: "full" }],
              clarificationQuestions: [],
              acceptanceCriteria: ["The refreshed kanban board renders columns."],
              testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-kanban",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:kanban-shell"],
              updatedAt: "2026-05-04T12:00:00.000Z",
            },
          ],
        }),
    });

    const result = await provider.synthesizePlannerBatchesWithTelemetry({
      projectName: "Continuation Board",
      sources,
      plannerWorkspace: workspace,
      maxBatches: 2,
      resumeFromRecords: [
        {
          type: "candidate_card",
          sourceId: "synthesis:kanban-shell",
          title: "Create kanban shell",
          description: "Stale card from the previous kanban source.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["kanban"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-kanban", range: "full", contentHash: "hash-kanban-v1" }],
          clarificationQuestions: [],
          acceptanceCriteria: ["The old kanban board renders columns."],
          testPlan: { unit: [], integration: ["Run the app."], visual: [], manual: [] },
        },
      ],
    });

    expect(result.draft.cards).toHaveLength(1);
    expect(result.draft.cards[0]).toMatchObject({
      sourceId: "synthesis:kanban-shell",
      description: "Regenerated card from the refreshed kanban source.",
    });
    expect(result.telemetry).toMatchObject({ renderedCardDuplicateFilterCount: 0 });
    expect(result.progressiveRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "warning",
          code: "planner_batch_rendered_card_ledger_invalidated",
          metadata: expect.objectContaining({
            enforcement: "rendered_card_ledger",
            invalidatedCount: 1,
            invalidatedCandidates: [
              expect.objectContaining({
                sourceId: "synthesis:kanban-shell",
                matchedCardId: "synthesis:kanban-shell",
                restartAction: "regenerate_card",
                invalidationReasons: ["source_checksum_changed"],
              }),
            ],
          }),
        }),
      ]),
    );
  });
});
