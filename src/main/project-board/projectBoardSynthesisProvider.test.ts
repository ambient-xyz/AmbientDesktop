import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  createProjectBoardPlannerWorkspace,
  readProjectBoardPlannerWorkspaceRecords,
} from "./projectBoardPlannerWorkspace";
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

describe("AmbientProjectBoardSynthesisProvider", () => {
  it("calls Ambient chat completions and normalizes a synthesis draft", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const progress: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Live refined board.",
                    goal: "Build a playable WebGL spaceship slice.",
                    currentState: "The project has architecture, gameplay notes, and tests.",
                    targetUser: "Browser game prototype developer.",
                    qualityBar: "Each card needs proof.",
                    assumptions: ["Keyboard first."],
                    questions: ["Should mobile touch controls ship in the first slice?"],
                    sourceNotes: ["architecture.md defines state/render separation."],
                    cards: [
                      {
                        sourceId: "shell-bootstrap",
                        title: "Bootstrap Three.js shell",
                        description: "Create a nonblank canvas and render loop.",
                        candidateStatus: "ready",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["webgl"],
                        blockedBy: [],
                        acceptanceCriteria: ["Canvas renders a nonblank scene."],
                        testPlan: {
                          unit: [],
                          integration: ["Run the app."],
                          visual: ["Capture a canvas screenshot."],
                          manual: ["Resize the window."],
                        },
                        sourceRefs: ["docs/architecture.md"],
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

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Starfall Courier",
      sources: [
        {
          kind: "architecture_artifact",
          title: "Architecture",
          summary: "Three.js render loop and state boundaries.",
          path: "docs/architecture.md",
          relevance: 92,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Previous board.",
          goal: "Build a WebGL spaceship game.",
          currentState: "Ambiguous controls and pacing.",
          targetUser: "Browser players.",
          qualityBar: "Proof required.",
          assumptions: ["Controls are undecided."],
          questions: ["Arcade or inertia controls?"],
          sourceNotes: ["gameplay-notes.md conflicts."],
          cards: [
            {
              sourceId: "synthesis:controls",
              title: "Implement controls",
              description: "Choose and implement ship controls.",
              candidateStatus: "needs_clarification",
              priority: 2,
              phase: "Gameplay",
              labels: ["controls"],
              blockedBy: [],
              acceptanceCriteria: ["Ship movement is playable."],
              testPlan: { unit: ["Test controls."], integration: [], visual: [], manual: [] },
              sourceRefs: ["docs/gameplay-notes.md"],
            },
          ],
        },
        answers: [{ question: "Arcade or inertia controls?", answer: "Use arcade controls for the first playable slice." }],
      },
      onProgress: (event) => progress.push(event.stage),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(calls[0].body).not.toHaveProperty("reasoning");
    expect(JSON.stringify(calls[0].body)).toContain("project-board planning contract");
    expect(JSON.stringify(calls[0].body)).toContain("Project: Starfall Courier");
    expect(JSON.stringify(calls[0].body)).toContain("Previous PM Review proposal or deterministic baseline to refine");
    expect(JSON.stringify(calls[0].body)).toContain("Use arcade controls for the first playable slice.");
    expect(JSON.stringify(calls[0].body)).toContain("Operation overlay: Whole Board Synthesis");
    expect(result.draft.cards[0]).toMatchObject({
      sourceId: "synthesis:ux-mock-approval",
      title: "Create UX mock for approval",
      candidateStatus: "ready_to_create",
      testPlan: expect.objectContaining({ visual: ["Capture desktop and narrow viewport screenshots of the mock for review."] }),
    });
    expect(result.draft.cards[1]).toMatchObject({
      sourceId: "synthesis:shell-bootstrap",
      title: "Bootstrap Three.js shell",
      candidateStatus: "needs_clarification",
      blockedBy: expect.arrayContaining(["synthesis:ux-mock-approval"]),
      testPlan: expect.objectContaining({ visual: ["Capture a canvas screenshot."] }),
    });
    expect(progress).toEqual(["model_request", "model_response", "schema_validation"]);
    expect(result.telemetry).toMatchObject({
      promptCharCount: expect.any(Number),
      responseCharCount: expect.any(Number),
      cardCount: 2,
      questionCount: 1,
    });
    expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
    expect(result.telemetry.responseCharCount).toBeGreaterThan(100);
  });

  it("aborts direct-chat compatibility requests from the caller signal", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        requestSignal = init?.signal as AbortSignal | undefined;
        controller.abort(new Error("Direct pause abort"));
        if (requestSignal?.aborted) throw requestSignal.reason;
        throw new Error("Expected direct request signal to abort.");
      },
    });

    await expect(
      provider.synthesizeWithTelemetry({
        projectName: "Abort Board",
        signal: controller.signal,
        sources: [
          {
            kind: "functional_spec",
            title: "Spec",
            summary: "Create a simple board.",
            path: "SPEC.md",
            relevance: 90,
          },
        ],
      }),
    ).rejects.toThrow("Direct pause abort");
    expect(requestSignal?.aborted).toBe(true);
  });

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

  it("streams response character progress before validating the final draft", async () => {
    const draft = JSON.stringify({
      summary: "Streamed board.",
      goal: "Build the game.",
      currentState: "Spec exists.",
      targetUser: "Player.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: ["README contains the design."],
      cards: [
        {
          sourceId: "synthesis:streamed-card",
          title: "Implement streamed card",
          description: "Card arrived over SSE.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["game"],
          blockedBy: [],
          acceptanceCriteria: ["Done condition exists."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          sourceRefs: ["README.md"],
        },
      ],
    });
    const chunks = [draft.slice(0, 80), draft.slice(80)];
    const progress: Array<{ stage: string; chars?: number }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              for (const chunk of chunks) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Stream Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
      onProgress: (event) => progress.push({ stage: event.stage, chars: event.responseCharCount }),
    });

    expect(result.draft.cards[0].title).toBe("Implement streamed card");
    expect(result.telemetry.responseCharCount).toBe(draft.length);
    expect(progress.some((event) => event.stage === "model_response" && event.chars === draft.length)).toBe(true);
  });

  it("can disable Ambient reasoning with the official reasoning configuration", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      reasoning: false,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Fast board.",
                    goal: "Build the game.",
                    currentState: "Spec exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:fast-card",
                        title: "Implement fast card",
                        description: "Card generated without reasoning.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["fast"],
                        blockedBy: [],
                        acceptanceCriteria: ["Done condition exists."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["README.md"],
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

    await provider.synthesizeWithTelemetry({
      projectName: "No Reasoning Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
    });

    expect(bodies[0]).toMatchObject({ reasoning: { effort: "none", enabled: false, exclude: true }, stream: true });
    expect(bodies[0]).not.toHaveProperty("enable_thinking");
  });

  it("can cap Ambient reasoning effort and reasoning tokens for faster board synthesis experiments", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      reasoning: { effort: "low", max_tokens: 750, exclude: true, enabled: true },
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Capped board.",
                    goal: "Build the game.",
                    currentState: "Spec exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:capped-card",
                        title: "Implement capped card",
                        description: "Card generated with capped reasoning.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["fast"],
                        blockedBy: [],
                        acceptanceCriteria: ["Done condition exists."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["README.md"],
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

    await provider.synthesizeWithTelemetry({
      projectName: "Capped Reasoning Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
    });

    expect(bodies[0]).toMatchObject({ reasoning: { effort: "low", max_tokens: 750, exclude: true, enabled: true }, stream: true });
    expect(bodies[0]).not.toHaveProperty("thinking_budget");
  });

  it("treats Ambient streaming activity as the synthesis timeout heartbeat", async () => {
    const draft = JSON.stringify({
      summary: "Idle-timeout board.",
      goal: "Build the game.",
      currentState: "Spec exists.",
      targetUser: "Player.",
      qualityBar: "Proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:heartbeat-card",
          title: "Implement heartbeat card",
          description: "Card arrived across multiple active stream events.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["game"],
          blockedBy: [],
          acceptanceCriteria: ["Done condition exists."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          sourceRefs: ["README.md"],
        },
      ],
    });
    const chunks = [draft.slice(0, 60), draft.slice(60, 120), draft.slice(120)];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 100,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              void (async () => {
                for (const chunk of chunks) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
                  await new Promise((resolve) => setTimeout(resolve, 45));
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
              })().catch((error) => controller.error(error));
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const result = await provider.synthesizeWithTelemetry({
      projectName: "Heartbeat Test",
      sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
    });

    expect(result.draft.cards[0].title).toBe("Implement heartbeat card");
    expect(result.telemetry.responseCharCount).toBe(draft.length);
  });

  it("fails with a clear idle-timeout error when Ambient streaming stalls", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 10,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"summary":' } }] })}\n\n`));
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    await expect(
      provider.synthesizeWithTelemetry({
        projectName: "Stall Test",
        sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
      }),
    ).rejects.toThrow(/stream stalled/);
  });

  it("fails when Ambient never starts a project-board synthesis stream", async () => {
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 10,
      fetchImpl: async () => new Promise<Response>(() => undefined),
    });

    await expect(
      provider.synthesizeWithTelemetry({
        projectName: "No Stream Test",
        sources: [{ kind: "functional_spec", title: "README", summary: "Game spec.", path: "README.md", relevance: 90 }],
      }),
    ).rejects.toThrow(/stalled before streaming began/);
  });

  it("filters exact duplicate cards during additive Add Cards refinement", async () => {
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
                    summary: "Additive board.",
                    goal: "Expand the game.",
                    currentState: "Shell exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:pixijs-game-shell",
                        title: "Create the PixiJS game shell",
                        description: "Duplicate shell card.",
                        candidateStatus: "needs_clarification",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["pixijs"],
                        blockedBy: [],
                        acceptanceCriteria: ["Canvas exists."],
                        testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
                        sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
                      },
                      {
                        sourceId: "synthesis:shield-loop",
                        title: "Implement shield loop",
                        description: "New shield gameplay card.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Combat",
                        labels: ["shield"],
                        blockedBy: ["synthesis:pixijs-game-shell"],
                        acceptanceCriteria: ["Shield absorbs damage."],
                        testPlan: { unit: ["Test shield state."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
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
      projectName: "Last Vector",
      sources: [{ kind: "functional_spec", title: "GDD", summary: "Game design.", path: "GAME_DESIGN_DOCUMENT.md", relevance: 99 }],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Build shell.",
          currentState: "Shell card exists.",
          targetUser: "Player.",
          qualityBar: "Proof.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [
            {
              sourceId: "synthesis:pixijs-game-shell",
              title: "Create the PixiJS game shell",
              description: "Existing card.",
              candidateStatus: "needs_clarification",
              priority: 1,
              phase: "Foundation",
              labels: ["pixijs"],
              blockedBy: [],
              acceptanceCriteria: ["Canvas exists."],
              testPlan: { unit: [], integration: [], visual: [], manual: [] },
              sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
            },
          ],
        },
        answers: [
          {
            question: "Add Cards source scope",
            answer: "This is an additive Add Cards operation. Do not replace or duplicate existing cards.",
          },
        ],
      },
    });

    expect(result.draft.cards.map((card) => card.title)).toEqual(["Implement shield loop"]);
    expect(result.telemetry.cardCount).toBe(1);
    expect(result.progressiveRecords?.filter((record) => record.type === "candidate_card").map((record) => record.title)).toEqual([
      "Implement shield loop",
    ]);
    expect(result.draft.sourceNotes.at(-1)).toContain("Filtered 1 duplicate candidate");
    expect(
      result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered"),
    ).toBe(true);
  });

  it("treats duplicate-only additive Add Cards output as a no-op instead of a failed synthesis", async () => {
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
                    summary: "Additive board.",
                    goal: "Expand the existing board.",
                    currentState: "Implementation card already exists.",
                    targetUser: "Project contributor.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:local-random-picker",
                        title: "Implement Local Random Option Picker",
                        description: "Duplicate of the existing implementation card.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Implementation",
                        labels: ["implementation", "scope:required"],
                        blockedBy: [],
                        acceptanceCriteria: ["Picker displays one random option."],
                        testPlan: { unit: [], integration: ["Open the picker locally."], visual: [], manual: [] },
                        sourceRefs: ["Local-Random-Option-Picker-DurablePlan.html"],
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
      projectName: "Local Random Option Picker",
      sources: [
        {
          kind: "plan_artifact",
          title: "Local Random Option Picker Durable Plan",
          summary: "Simple local picker.",
          path: ".ambient/board/plans/Local-Random-Option-Picker-DurablePlan.html",
          relevance: 99,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Build the picker.",
          currentState: "Implementation card already exists.",
          targetUser: "Local utility user.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [
            {
              sourceId: "synthesis:local-random-picker",
              title: "Implement Local Random Option Picker",
              description: "Existing implementation card.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Implementation",
              labels: ["implementation", "scope:required"],
              blockedBy: [],
              acceptanceCriteria: ["Picker displays one random option."],
              testPlan: { unit: [], integration: ["Open the picker locally."], visual: [], manual: [] },
              sourceRefs: ["Local-Random-Option-Picker-DurablePlan.html"],
            },
          ],
        },
        answers: [
          { question: "Add Cards source scope", answer: "Add Cards from the selected source. Do not replace or duplicate existing cards." },
        ],
        mode: "additive" as const,
      },
    });

    expect(result.draft.cards).toEqual([]);
    expect(result.telemetry.cardCount).toBe(0);
    expect(result.draft.sourceNotes.at(-1)).toContain("No net-new cards remain");
    expect(
      result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered"),
    ).toBe(true);
  });

  it("filters near-duplicate additive cards by source basis and intent", async () => {
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
                    summary: "Additive board.",
                    goal: "Expand the game.",
                    currentState: "A cartography card exists.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:cartography-contract-board",
                        title: "Implement the cartography contracts mission board",
                        description: "Near duplicate of the existing spectral cartography board.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "contracts", "mission-board"],
                        blockedBy: [],
                        acceptanceCriteria: ["Survey contracts are listed."],
                        testPlan: { unit: ["Test contract model."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                      {
                        sourceId: "synthesis:route-risk-overlay",
                        title: "Add route-risk HUD overlay",
                        description: "New route-risk visualization for active survey contracts.",
                        candidateStatus: "needs_clarification",
                        priority: 3,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "hud", "route-risk"],
                        blockedBy: ["synthesis:spectral-cartography-board"],
                        acceptanceCriteria: ["Risk bands are visible in the HUD."],
                        testPlan: { unit: [], integration: ["Run HUD state test."], visual: ["Capture overlay."], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
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
      projectName: "Last Vector",
      sources: [
        {
          kind: "functional_spec",
          title: "Spectral Cartography Contracts",
          summary: "Survey contract board, scan ping, and route-risk overlay.",
          path: "docs/spectral-cartography-contracts.md",
          relevance: 99,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Expand the game.",
          currentState: "A cartography card exists.",
          targetUser: "Player.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [
            {
              sourceId: "synthesis:spectral-cartography-board",
              title: "Build spectral cartography contract board",
              description: "Create the mission board data model for comet-lane survey contracts.",
              candidateStatus: "needs_clarification",
              priority: 2,
              phase: "Spectral Cartography",
              labels: ["cartography", "contracts", "mission-board"],
              blockedBy: [],
              acceptanceCriteria: ["Survey contracts are listed."],
              testPlan: { unit: ["Test contract model."], integration: [], visual: [], manual: [] },
              sourceRefs: ["docs/spectral-cartography-contracts.md"],
            },
          ],
        },
        answers: [
          { question: "Add Cards source scope", answer: "Add Cards from the selected source. Do not replace or duplicate existing cards." },
        ],
        mode: "additive" as const,
      },
    });

    expect(result.draft.cards.map((card) => card.title)).toEqual(["Add route-risk HUD overlay"]);
    expect(result.progressiveRecords?.filter((record) => record.type === "candidate_card").map((record) => record.title)).toEqual([
      "Add route-risk HUD overlay",
    ]);
    expect(result.draft.sourceNotes.at(-1)).toContain("Filtered 1 duplicate candidate");
    const warning = result.progressiveRecords?.find(
      (record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered",
    );
    expect(warning).toMatchObject({
      type: "warning",
      metadata: {
        duplicateCount: 1,
        duplicateCandidates: [
          expect.objectContaining({
            title: "Implement the cartography contracts mission board",
            matchedTitle: "Build spectral cartography contract board",
            reason: "intent_source_basis",
          }),
        ],
      },
    });
  });

  it("keeps same-source additive cards when their intent is distinct", async () => {
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
                    summary: "Additive board.",
                    goal: "Expand the game.",
                    currentState: "No cartography cards exist.",
                    targetUser: "Player.",
                    qualityBar: "Proof required.",
                    assumptions: [],
                    questions: [],
                    sourceNotes: [],
                    cards: [
                      {
                        sourceId: "synthesis:cartography-contract-board",
                        title: "Build cartography contract board",
                        description: "Mission board data model for comet-lane contracts.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "contracts"],
                        blockedBy: [],
                        acceptanceCriteria: ["Contracts are listed."],
                        testPlan: { unit: ["Test contracts."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
                      },
                      {
                        sourceId: "synthesis:scan-ping-state",
                        title: "Implement scan-ping state transition",
                        description: "Reveal spectral beacon echoes and hidden salvage pockets when the player fires a scan ping.",
                        candidateStatus: "needs_clarification",
                        priority: 3,
                        phase: "Spectral Cartography",
                        labels: ["cartography", "scan-ping", "beacons"],
                        blockedBy: ["synthesis:cartography-contract-board"],
                        acceptanceCriteria: ["Scan ping reveals beacons."],
                        testPlan: { unit: ["Test ping reducer."], integration: [], visual: [], manual: [] },
                        sourceRefs: ["docs/spectral-cartography-contracts.md"],
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
      projectName: "Last Vector",
      sources: [
        {
          kind: "functional_spec",
          title: "Spectral Cartography Contracts",
          summary: "Survey contract board, scan ping, and route-risk overlay.",
          path: "docs/spectral-cartography-contracts.md",
          relevance: 99,
        },
      ],
      refinement: {
        previousDraft: {
          summary: "Existing board.",
          goal: "Expand the game.",
          currentState: "No cartography cards exist.",
          targetUser: "Player.",
          qualityBar: "Proof required.",
          assumptions: [],
          questions: [],
          sourceNotes: [],
          cards: [],
        },
        answers: [
          { question: "Add Cards source scope", answer: "Add Cards from the selected source without replacing existing board content." },
        ],
        mode: "additive" as const,
      },
    });

    expect(result.draft.cards.map((card) => card.title)).toEqual([
      "Build cartography contract board",
      "Implement scan-ping state transition",
    ]);
    expect(
      result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "add_cards_duplicate_candidate_filtered"),
    ).toBe(false);
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
