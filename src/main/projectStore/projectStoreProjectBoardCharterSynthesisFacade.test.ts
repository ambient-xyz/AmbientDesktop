import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import {
  GENERATED_REPORT_SOURCE_AUTHORITY_REASON,
  GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON,
} from "./projectStoreProjectBoardFacade";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board charter and initial synthesis facade (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("creates one durable project board with a draft charter", () => {
    expect(store.getActiveProjectBoard()).toBeUndefined();

    const board = store.createProjectBoard({ title: "Launch board", summary: "Coordinate the launch." });
    const duplicate = store.createProjectBoard({ title: "Second board" });

    expect(duplicate.id).toBe(board.id);
    expect(board).toMatchObject({
      projectPath: workspacePath,
      status: "draft",
      title: "Launch board",
      summary: "Coordinate the launch.",
    });
    expect(board.charterId).toBeTruthy();
    const charter = store.getProjectBoardCharter(board.charterId!);
    expect(charter).toMatchObject({
      boardId: board.id,
      version: 1,
      status: "draft",
      testPolicy: expect.objectContaining({ unit: true, integration: true, visual: true }),
      sourcePolicy: expect.objectContaining({ includeThreads: true, includeMarkdown: true }),
    });
    expect(charter.markdown).toContain("Launch board");
    expect(store.getActiveProjectBoard()?.questions).toHaveLength(5);
    expect(store.getActiveProjectBoard()?.events).toEqual([
      expect.objectContaining({
        kind: "board_created",
        title: "Board created",
        entityId: board.id,
        metadata: expect.objectContaining({ status: "draft", charterId: board.charterId }),
      }),
    ]);

    store.close();
    store.openWorkspace(workspacePath);

    expect(store.getActiveProjectBoard()).toMatchObject({ id: board.id, charterId: board.charterId });
  });

  it("records kickoff interview answers on project boards", () => {
    const board = store.createProjectBoard({ title: "Interview board" });
    const question = store.getActiveProjectBoard()?.questions[0];

    expect(question).toMatchObject({ required: true, answer: undefined });
    const answered = store.answerProjectBoardQuestion(question!.id, "Optimize for a reliable first release.");

    expect(answered).toMatchObject({
      id: question!.id,
      answer: "Optimize for a reliable first release.",
    });
    expect(answered.answeredAt).toBeTruthy();
    expect(store.getActiveProjectBoard()?.questions[0].answer).toBe("Optimize for a reliable first release.");
    expect(() => store.answerProjectBoardQuestion(question!.id, "  ")).toThrow("cannot be empty");
    expect(board.id).toBeTruthy();
  });

  it("persists Ambient/Pi kickoff defaults and marks them stale when source context changes", () => {
    const board = store.createProjectBoard({ title: "Kickoff defaults board" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Durable Plan",
        summary: "Primary plan for a browser Asteroids game with gravity weapons.",
        path: ".ambient/board/plans/asteroids.html",
        relevance: 99,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Brainstorm thread",
        summary: "Ignored thread with optional visual ideas.",
        threadId: "thread-brainstorm",
        relevance: 40,
        authorityRole: "ignored",
        includeInSynthesis: false,
      },
    ]);
    const question = store.getActiveProjectBoard()!.questions[0];
    const contextFingerprint = projectBoardKickoffDefaultContextFingerprint({ question: question.question, sources });

    const defaulted = store.applyProjectBoardKickoffDefaultSuggestions({
      boardId: board.id,
      targetQuestionIds: [question.id],
      model: "test-pi",
      telemetry: { promptCharCount: 1200, responseCharCount: 320, requestDurationMs: 44 },
      suggestions: [
        {
          questionId: question.id,
          question: question.question,
          suggestedAnswer: "Ship the source-defined Asteroids gameplay slice from the durable plan.",
          rationale: "The durable plan is the included primary source.",
          confidence: "high",
          sourceIds: [sources[0].id],
          contextFingerprint,
        },
      ],
    });

    expect(defaulted.questions[0]).toMatchObject({
      suggestedAnswer: "Ship the source-defined Asteroids gameplay slice from the durable plan.",
      suggestedAnswerRationale: "The durable plan is the included primary source.",
      suggestedAnswerConfidence: "high",
      suggestedAnswerSourceIds: [sources[0].id],
      suggestedAnswerModel: "test-pi",
      suggestedAnswerStale: false,
      answer: undefined,
    });
    expect(defaulted.events?.find((event) => event.kind === "kickoff_defaults_suggested")?.metadata.kickoffDefaults).toMatchObject({
      appliedAction: "suggest_source_derived_defaults",
      targetQuestionIds: [question.id],
      appliedQuestionIds: [question.id],
      suggestedQuestionCount: 1,
      modelCallRequired: true,
      model: "test-pi",
      promptCharCount: 1200,
    });

    store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Durable Plan",
        summary: "Primary plan changed to prioritize a mobile-first Asteroids game.",
        path: ".ambient/board/plans/asteroids.html",
        relevance: 99,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
    ]);

    expect(store.getActiveProjectBoard()?.questions[0]).toMatchObject({
      suggestedAnswer: "Ship the source-defined Asteroids gameplay slice from the durable plan.",
      suggestedAnswerStale: true,
    });
  });

  it("records kickoff default helper progress without creating planning snapshots", () => {
    const board = store.createProjectBoard({ title: "Kickoff defaults run board" });
    const run = store.createProjectBoardSynthesisRun({
      boardId: board.id,
      model: "test-pi",
      initialStage: "kickoff_defaults",
      initialTitle: "Kickoff default suggestions started",
      initialSummary: "Suggesting editable kickoff defaults one question at a time.",
      initialMetadata: { helper: "kickoff_defaults", sequential: true },
      sourceCount: 4,
      includedSourceCount: 2,
      sourceCharCount: 1200,
    });

    expect(run).toMatchObject({
      status: "running",
      stage: "kickoff_defaults",
      sourceCount: 4,
      includedSourceCount: 2,
      sourceCharCount: 1200,
      events: [
        expect.objectContaining({
          stage: "kickoff_defaults",
          title: "Kickoff default suggestions started",
          metadata: { helper: "kickoff_defaults", sequential: true },
        }),
      ],
    });

    const completed = store.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "kickoff_defaults",
      title: "Kickoff default suggestions finished",
      summary: "Applied 1 of 1 editable kickoff defaults.",
      promptCharCount: 1000,
      responseCharCount: 240,
      questionCount: 1,
      status: "succeeded",
      completedAt: new Date().toISOString(),
      skipPlanningSnapshot: true,
    });

    expect(completed).toMatchObject({
      status: "succeeded",
      stage: "kickoff_defaults",
      promptCharCount: 1000,
      responseCharCount: 240,
      questionCount: 1,
    });
    expect(completed.planningSnapshots).toBeUndefined();
  });

  it("can exclude kickoff default helper runs from the active planning lookup", () => {
    const board = store.createProjectBoard({ title: "Kickoff defaults run board" });
    const kickoffRun = store.createProjectBoardSynthesisRun({
      boardId: board.id,
      model: "test-pi",
      initialStage: "kickoff_defaults",
      initialTitle: "Kickoff default suggestions started",
    });
    const planningRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-pi" });
    store.recordProjectBoardSynthesisRunEvent(kickoffRun.id, {
      stage: "kickoff_defaults",
      title: "Still suggesting kickoff defaults",
      summary: "Retrying one kickoff default.",
    });

    expect(store.getRunningProjectBoardSynthesisRun(board.id, { excludeStages: ["kickoff_defaults"] })?.id).toBe(planningRun.id);
    store.recordProjectBoardSynthesisRunEvent(planningRun.id, {
      stage: "sources_persisted",
      title: "Planning run finished",
      summary: "The real planning run is no longer active.",
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    expect(store.getRunningProjectBoardSynthesisRun(board.id, { excludeStages: ["kickoff_defaults"] })).toBeUndefined();
  });

  it("finalizes kickoff answers into an active project board charter", () => {
    const board = store.createProjectBoard({ title: "Charter board", summary: "Coordinate the first release." });
    store.replaceProjectBoardSources(board.id, [
      {
        kind: "architecture_artifact",
        title: "System architecture",
        summary: "Durable architecture notes.",
        path: "architecture.md",
        relevance: 92,
      },
      {
        kind: "thread",
        title: "Discovery thread",
        summary: "Early project discussion.",
        threadId: "thread-1",
        relevance: 81,
      },
    ]);

    expect(() => store.finalizeProjectBoardKickoff(board.id)).toThrow("Answer required kickoff questions");

    const answers = [
      "Ship a stable project board that turns approved plans into executable work.",
      "Use architecture.md as the highest authority and threads as supporting context.",
      "Ask when scope changes; otherwise choose the simplest durable implementation.",
      "Every card needs focused unit, integration, and visual proof where applicable.",
      "Sequence by dependency order and keep retrying until proof is satisfied or a blocker is explicit.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }

    const finalized = store.finalizeProjectBoardKickoff(board.id);

    expect(finalized.status).toBe("active");
    expect(finalized.summary).toBe(answers[0]);
    expect(finalized.charter).toMatchObject({
      status: "active",
      goal: answers[0],
      qualityBar: answers[3],
      decisionPolicy: { defaultPolicy: answers[2] },
      testPolicy: expect.objectContaining({ defaultProof: answers[3], unit: true, integration: true, visual: true }),
      sourcePolicy: expect.objectContaining({
        policy: answers[1],
        authoritativeSources: ["architecture.md"],
      }),
    });
    expect(finalized.charter?.markdown).toContain("## Source Corpus");
    expect(finalized.charter?.markdown).toContain("System architecture (architecture_artifact: architecture.md)");
    expect(finalized.charter?.projectSummary).toMatchObject({
      generator: "fallback_heuristic",
      summary: expect.stringContaining(answers[0]),
      sourceCoverage: expect.arrayContaining([expect.stringContaining("architecture.md")]),
      citations: expect.arrayContaining([expect.stringContaining("architecture.md")]),
      sourceChecksumSet: expect.arrayContaining([expect.stringContaining(":")]),
      kickoffContextBrief: expect.objectContaining({
        includedSourceCount: 2,
        sourceNotes: expect.arrayContaining([
          expect.objectContaining({
            title: "System architecture",
            path: "architecture.md",
          }),
        ]),
      }),
    });
    expect(finalized.charter?.projectSummary?.charterAnswerChecksum).toHaveLength(64);
    expect(finalized.events?.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["charter_finalized", "question_answered", "sources_refreshed", "board_created"]),
    );
    expect(finalized.events?.[0]).toMatchObject({
      kind: "charter_finalized",
      title: "Charter finalized",
      entityId: finalized.charterId,
      metadata: expect.objectContaining({ sourceCount: 2, projectSummaryGenerator: "fallback_heuristic" }),
    });
  });

  it("refreshes active charter project summary snapshots", () => {
    const board = store.createProjectBoard({ title: "Charter summary board", summary: "Coordinate summary refresh." });
    store.replaceProjectBoardSources(board.id, [
      {
        kind: "functional_spec",
        title: "Product spec",
        summary: "Spec covers persistence, source authority, and validation.",
        path: "product.md",
        relevance: 95,
      },
    ]);
    const answers = [
      "Ship the active charter summary refresh.",
      "Use product.md as the source authority.",
      "Ask for product scope changes.",
      "Require focused persistence proof.",
      "Refresh summaries after source changes.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }
    store.finalizeProjectBoardKickoff(board.id);

    const summary = store.buildActiveProjectBoardCharterProjectSummary(board.id, "2026-06-16T01:00:00.000Z");
    const refreshed = store.updateProjectBoardCharterProjectSummary({
      boardId: board.id,
      summary,
      title: "Summary refreshed",
      eventSummary: "Refreshed active charter summary.",
      metadata: { reason: "source-refresh" },
      createdAt: "2026-06-16T01:01:00.000Z",
    });

    expect(refreshed.charter?.projectSummary).toMatchObject({
      generator: "fallback_heuristic",
      generatedAt: "2026-06-16T01:00:00.000Z",
      charterAnswerChecksum: summary.charterAnswerChecksum,
    });
    expect(refreshed.events?.find((event) => event.kind === "charter_summary_refreshed")).toMatchObject({
      kind: "charter_summary_refreshed",
      title: "Summary refreshed",
      summary: "Refreshed active charter summary.",
      entityId: refreshed.charterId,
      metadata: expect.objectContaining({
        sourceChecksumCount: 1,
        charterAnswerChecksum: summary.charterAnswerChecksum,
        reason: "source-refresh",
      }),
    });
  });

  it("keeps generated workflow scaffolding out of charter authority and Pi classification until promoted", () => {
    const board = store.createProjectBoard({ title: "Unit converter board", summary: "Plan the converter from source files." });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "functional_spec",
        title: "Unit Converter Project",
        summary: "PROJECT.md requires a browser unit converter with length, weight, and temperature conversions.",
        excerpt: "# Unit Converter Project\n\nBuild a browser unit converter for length, weight, and temperature conversions.",
        path: "PROJECT.md",
        relevance: 92,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "workflow_artifact",
        title: "Generated workflow",
        summary: "Generated workflow scaffold says to build an unrelated chat bot.",
        excerpt: "Generated by Ambient.\n\nWorkflow scaffold for unrelated chat bot setup.",
        path: "WORKFLOW.md",
        relevance: 88,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: `${GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON}: WORKFLOW.md.`,
      },
    ]);
    const workflowSource = sources.find((source) => source.path === "WORKFLOW.md")!;

    const piAttempt = store.applyProjectBoardSourceClassifications(board.id, [
      {
        sourceId: workflowSource.id,
        sourceKey: workflowSource.sourceKey,
        kind: "workflow_artifact",
        classificationReason: "Pi attempted to promote the generated workflow scaffold.",
        classificationConfidence: 0.99,
        authorityRole: "primary",
        includeInSynthesis: true,
        model: "zai-org/GLM-5.1-FP8",
      },
    ]);
    expect(piAttempt.find((source) => source.id === workflowSource.id)).toMatchObject({
      authorityRole: "ignored",
      includeInSynthesis: false,
      classifiedBy: "fallback_heuristic",
    });

    const answers = [
      "Build the browser unit converter described by PROJECT.md.",
      "PROJECT.md is the authoritative product source; generated workflow scaffolding stays excluded unless explicitly promoted.",
      "Ask only when PROJECT.md leaves conversion behavior ambiguous.",
      "Require deterministic unit conversion tests and a simple browser smoke proof.",
      "Implement source-grounded cards in dependency order.",
    ];
    for (const [index, question] of store.getActiveProjectBoard()!.questions.entries()) {
      store.answerProjectBoardQuestion(question.id, answers[index]);
    }

    const finalized = store.finalizeProjectBoardKickoff(board.id);

    expect(finalized.charter?.sourcePolicy).toMatchObject({ authoritativeSources: ["PROJECT.md"] });
    expect(finalized.charter?.markdown).toContain("Unit Converter Project (functional_spec: PROJECT.md)");
    expect(finalized.charter?.markdown).not.toContain("Generated workflow (workflow_artifact: WORKFLOW.md)");
    expect(finalized.charter?.projectSummary?.sourceCoverage).toEqual(expect.arrayContaining([expect.stringContaining("PROJECT.md")]));
    expect(finalized.charter?.projectSummary?.sourceCoverage).not.toEqual(expect.arrayContaining([expect.stringContaining("WORKFLOW.md")]));

    const promoted = store.updateProjectBoardSource({ sourceId: workflowSource.id, kind: "workflow_artifact", includeInSynthesis: true });
    expect(promoted).toMatchObject({
      classifiedBy: "user",
      authorityRole: "primary",
      includeInSynthesis: true,
    });
  });

  it("keeps generated report artifacts ignored until explicit promotion records source provenance", () => {
    const board = store.createProjectBoard({ title: "Workspace health board", summary: "Plan work from a generated health report." });
    const [reportSource] = store.replaceProjectBoardSources(board.id, [
      {
        kind: "report_artifact",
        title: "Workspace Health Report",
        summary: "Generated report recommends accessibility, smoke, and cleanup follow-up cards.",
        excerpt: "# Workspace Health Report\n\nGenerated by Ambient.\n\nFindings: add accessibility and smoke coverage.",
        path: "reports/workspace-health-report.md",
        relevance: 78,
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: `${GENERATED_REPORT_SOURCE_AUTHORITY_REASON}: reports/workspace-health-report.md.`,
      },
    ]);

    const piAttempt = store.applyProjectBoardSourceClassifications(board.id, [
      {
        sourceId: reportSource.id,
        sourceKey: reportSource.sourceKey,
        kind: "report_artifact",
        classificationReason: "Pi attempted to promote the generated health report.",
        classificationConfidence: 0.96,
        authorityRole: "primary",
        includeInSynthesis: true,
        model: "zai-org/GLM-5.1-FP8",
      },
    ]);

    expect(piAttempt[0]).toMatchObject({
      authorityRole: "ignored",
      includeInSynthesis: false,
      classifiedBy: "fallback_heuristic",
      classificationReason: expect.stringContaining(GENERATED_REPORT_SOURCE_AUTHORITY_REASON),
    });

    const promoted = store.updateProjectBoardSource({ sourceId: reportSource.id, kind: "report_artifact", includeInSynthesis: true });
    expect(promoted).toMatchObject({
      classifiedBy: "user",
      authorityRole: "supporting",
      includeInSynthesis: true,
      classificationReason: "User included report_artifact source for project-board synthesis.",
    });

    const event = (store.getActiveProjectBoard()!.events ?? []).find((candidate) => candidate.kind === "source_updated");
    expect(event).toMatchObject({
      title: "Source inclusion updated",
      entityId: reportSource.id,
      metadata: expect.objectContaining({
        sourceId: reportSource.id,
        includeInSynthesis: true,
        sourceImpact: expect.objectContaining({
          additiveSynthesisAvailable: true,
          groupSourceIds: [reportSource.id],
        }),
      }),
    });
  });

  it("applies Build Board synthesis to draft charter, questions, and candidate cards idempotently", () => {
    const board = store.createProjectBoard({ title: "Spaceship board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Synthesized WebGL spaceship work.",
      goal: "Build a playable browser-based WebGL spaceship game.",
      currentState: "Scanned mixed-quality project artifacts.",
      targetUser: "Browser game prototype developer.",
      qualityBar: "Every card needs runnable proof and explicit gameplay acceptance criteria.",
      assumptions: ["Three.js/WebGL is the rendering stack.", "Keyboard input is acceptable for the first slice."],
      questions: ["Should ship controls use arcade movement or inertia-based thrust?"],
      sourceNotes: ["architecture artifact: docs/architecture.md - Three.js render loop and game-state reducer."],
      cards: [
        {
          sourceId: "synthesis:webgl-game-shell",
          title: "Create the WebGL game shell",
          description: "Set up the render loop and nonblank canvas.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["webgl", "game"],
          blockedBy: [],
          sourceRefs: ["source-architecture"],
          clarificationQuestions: ["Should the shell use Three.js or another renderer?"],
          acceptanceCriteria: ["Canvas renders a nonblank scene."],
          testPlan: {
            unit: ["Test render-loop helpers."],
            integration: ["Verify the canvas mounts."],
            visual: ["Capture a nonblank canvas screenshot."],
            manual: ["Resize the window and inspect the scene."],
          },
        },
        {
          sourceId: "synthesis:ship-controls",
          title: "Implement ship controls",
          description: "Move the player ship with keyboard input.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Core Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:webgl-game-shell"],
          sourceRefs: ["source-architecture"],
          acceptanceCriteria: ["Keyboard input moves the player ship."],
          testPlan: {
            unit: ["Test input-to-motion updates."],
            integration: ["Verify movement in a local run."],
            visual: [],
            manual: ["Play one short movement pass."],
          },
        },
      ],
    };
    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft);

    expect(synthesized.summary).toBe("Synthesized WebGL spaceship work.");
    expect(synthesized.charter).toMatchObject({
      goal: "Build a playable browser-based WebGL spaceship game.",
      currentState: "Scanned mixed-quality project artifacts.",
      targetUser: "Browser game prototype developer.",
      qualityBar: "Every card needs runnable proof and explicit gameplay acceptance criteria.",
      testPolicy: expect.objectContaining({
        requireProofSpec: true,
        unit: true,
        integration: true,
        visual: true,
        manual: true,
        proofScopeWarningPolicy: "advisory",
      }),
      decisionPolicy: expect.objectContaining({
        default: "ask_when_ambiguous",
        assumptions: ["Three.js/WebGL is the rendering stack.", "Keyboard input is acceptable for the first slice."],
      }),
    });
    expect(synthesized.charter?.markdown).toContain("## Proposed Cards");
    expect(synthesized.charter?.projectSummary).toMatchObject({
      generator: "fallback_heuristic",
      summary: expect.stringContaining("Build a playable browser-based WebGL spaceship game."),
      unresolvedDecisions: expect.arrayContaining(["Should ship controls use arcade movement or inertia-based thrust?"]),
    });
    expect(synthesized.questions.map((question) => question.question)).toEqual(
      expect.arrayContaining(["Should ship controls use arcade movement or inertia-based thrust?"]),
    );
    expect(synthesized.cards).toHaveLength(2);
    expect(synthesized.cards[0]).toMatchObject({
      sourceKind: "board_synthesis",
      sourceId: "synthesis:webgl-game-shell",
      candidateStatus: "needs_clarification",
      labels: ["webgl", "game"],
      sourceRefs: ["source-architecture"],
      clarificationQuestions: ["Should the shell use Three.js or another renderer?"],
      acceptanceCriteria: ["Canvas renders a nonblank scene."],
      testPlan: expect.objectContaining({ visual: ["Capture a nonblank canvas screenshot."] }),
    });
    expect(synthesized.cards[1]).toMatchObject({ blockedBy: ["synthesis:webgl-game-shell"] });
    expect(synthesized.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        cardIds: expect.arrayContaining([synthesized.cards[0].id, synthesized.cards[1].id]),
        questionIds: expect.any(Array),
        cardClarificationQuestions: expect.arrayContaining([
          expect.objectContaining({ sourceId: "synthesis:webgl-game-shell", clarificationQuestions: ["Should the shell use Three.js or another renderer?"] }),
        ]),
      }),
    });
    (store as unknown as { requireDb: () => { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } })
      .requireDb()
      .prepare("UPDATE project_board_charters SET budget_policy_json = ? WHERE id = ?")
      .run(JSON.stringify({ maxPassesPerCard: 3, maxRuntimeMsPerCard: 780_000, pauseOnTerminalBlocker: false, runtimeSplitDogfood: true }), synthesized.charter!.id);

    const duplicate = store.applyProjectBoardSynthesis(board.id, {
      ...synthesisDraft,
      assumptions: ["Duplicate run should not duplicate cards or questions."],
      cards: synthesisDraft.cards.map((card) => ({
        sourceId: card.sourceId,
        title: card.title,
        description: card.description,
        candidateStatus: card.candidateStatus,
        priority: card.priority,
        phase: card.phase,
        labels: card.labels,
        blockedBy: card.blockedBy,
        acceptanceCriteria: card.acceptanceCriteria,
        testPlan: card.testPlan,
        sourceRefs: [],
      })),
      questions: ["Should ship controls use arcade movement or inertia-based thrust?"],
    });

    expect(duplicate.cards.filter((card) => card.sourceKind === "board_synthesis")).toHaveLength(2);
    expect(duplicate.charter?.budgetPolicy).toMatchObject({
      maxPassesPerCard: 3,
      maxRuntimeMsPerCard: 780_000,
      pauseOnTerminalBlocker: false,
      runtimeSplitDogfood: true,
    });
    expect(duplicate.questions.filter((question) => question.question === "Should ship controls use arcade movement or inertia-based thrust?")).toHaveLength(
      1,
    );

    const refined = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...synthesisDraft,
        summary: "Live refined synthesis.",
        cards: [
          {
            sourceId: "synthesis:live-shell",
            title: "Live refined shell card",
            description: "Replace deterministic draft cards with the live refinement.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Foundation",
            labels: ["refined"],
            blockedBy: [],
            sourceRefs: ["source-architecture"],
            acceptanceCriteria: ["Live card is the only unlinked synthesis draft."],
            testPlan: { unit: [], integration: ["Inspect board cards."], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true },
    );

    expect(refined.cards.filter((card) => card.sourceKind === "board_synthesis").map((card) => card.title)).toEqual([
      "Live refined shell card",
    ]);
    expect(refined.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({ replacedDraftCardCount: 2 }),
    });
  });

  it("skips synthesis candidates that only reference ignored or other-thread sources", () => {
    const board = store.createProjectBoard({ title: "Markdown board", sourceThreadId: "markdown-thread" });
    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Markdown durable plan",
        summary: "Single-page markdown previewer.",
        path: ".ambient/board/plans/Markdown-DurablePlan.html",
        threadId: "markdown-thread",
        relevance: 99,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "implementation_plan",
        title: "Unit converter durable plan",
        summary: "Separate unit converter plan from another chat.",
        path: ".ambient/board/plans/Unit-Converter-DurablePlan.html",
        threadId: "unit-thread",
        relevance: 80,
        authorityRole: "ignored",
        includeInSynthesis: false,
      },
    ]);

    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Markdown plan only.",
        goal: "Build the markdown previewer.",
        currentState: "The board has one primary durable plan.",
        targetUser: "Local app user.",
        qualityBar: "Verify realtime markdown preview.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:markdown-preview",
            title: "Implement markdown preview",
            description: "Build the core markdown previewer.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Implementation",
            labels: ["markdown"],
            blockedBy: [],
            sourceRefs: [sources[0].id],
            acceptanceCriteria: ["Markdown renders in realtime."],
            testPlan: { unit: [], integration: [], visual: ["Open preview."], manual: [] },
          },
          {
            sourceId: "synthesis:unit-converter",
            title: "Implement unit conversion",
            description: "This belongs to another thread.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Implementation",
            labels: ["unit"],
            blockedBy: [],
            sourceRefs: [sources[1].id],
            acceptanceCriteria: ["Unit conversion works."],
            testPlan: { unit: ["Conversion math."], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(synthesized.cards.filter((card) => card.sourceKind === "board_synthesis").map((card) => card.sourceId)).toEqual([
      "synthesis:markdown-preview",
    ]);
    expect(synthesized.cards.find((card) => card.sourceId === "synthesis:markdown-preview")).toMatchObject({
      sourceThreadId: "markdown-thread",
    });
  });
});
