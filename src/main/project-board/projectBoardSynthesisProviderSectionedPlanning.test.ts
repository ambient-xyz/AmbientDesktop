import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AmbientStreamFailureError, aggressiveAmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { createProjectBoardPlannerWorkspace, readProjectBoardPlannerWorkspaceRecords } from "./projectBoardPlannerWorkspace";
import { projectBoardPlanningSectionsFromSources } from "./projectBoardSectionedPlanning";
import { AmbientProjectBoardSynthesisProvider, type AmbientProjectBoardSynthesisProgress } from "./projectBoardSynthesisProvider";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("AmbientProjectBoardSynthesisProvider sectioned planning", () => {
  it("plans large sources section-by-section and emits progressive record batches before final draft assembly", async () => {
    const calls: string[] = [];
    const batches: Array<{ section: string; records: number; accumulated: number }> = [];
    const progress: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        const isMovement = prompt.includes("Section heading: Movement");
        const isCombat = prompt.includes("Section heading: Combat");
        const records =
          !isMovement && !isCombat
            ? [
                {
                  type: "question",
                  questionId: "question:game-scope",
                  question: "Which MVP scope should the intro optimize for?",
                  required: true,
                  createdAt: "2026-05-04T00:00:00.000Z",
                },
                {
                  type: "source_coverage",
                  sourceId: "source-gdd",
                  range: "lines:1-2",
                  status: "partial",
                  cardIds: [],
                  updatedAt: "2026-05-04T00:00:00.000Z",
                },
              ]
            : [
                {
                  type: "candidate_card",
                  sourceId: isMovement ? "synthesis:movement-model" : "synthesis:combat-loop",
                  title: isMovement ? "Implement movement model" : "Implement combat loop",
                  description: isMovement ? "Add movement from the movement section." : "Add combat from the combat section.",
                  candidateStatus: "needs_clarification",
                  priority: isMovement ? 1 : 2,
                  phase: isMovement ? "Movement" : "Combat",
                  labels: isMovement ? ["movement"] : ["combat"],
                  blockedBy: isCombat ? ["synthesis:movement-model"] : [],
                  sourceRefs: [{ sourceId: "source-gdd", range: isMovement ? "lines:4-5" : "lines:7-8" }],
                  acceptanceCriteria: [isMovement ? "Ship moves." : "Combat resolves."],
                  testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                },
                {
                  type: "source_coverage",
                  sourceId: "source-gdd",
                  range: isMovement ? "lines:4-5" : "lines:7-8",
                  status: "covered",
                  cardIds: [isMovement ? "synthesis:movement-model" : "synthesis:combat-loop"],
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
      projectName: "Sectioned Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: [
            "# Game",
            "Overview.",
            "",
            "## Movement",
            "The ship uses hybrid Newtonian movement.",
            "",
            "## Combat",
            "Enemy ships fire salvos and shields absorb damage.",
          ].join("\n"),
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(`${event.stage}:${event.title}`),
      onProgressiveRecords: (batch) =>
        batches.push({ section: batch.section.heading, records: batch.records.length, accumulated: batch.accumulatedRecordCount }),
    });

    expect(calls).toHaveLength(3);
    expect(batches).toEqual([
      { section: "Game", records: 3, accumulated: 3 },
      { section: "Movement", records: 3, accumulated: 6 },
      { section: "Combat", records: 3, accumulated: 9 },
    ]);
    expect(progress.filter((item) => item.startsWith("schema_validation:Validated section"))).toHaveLength(3);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model", "synthesis:combat-loop"]);
    expect(result.telemetry).toMatchObject({
      cardCount: 2,
      sectionCount: 3,
      batchCardLimit: 3,
      progressiveRecordCount: expect.any(Number),
    });
  });

  it("compacts repeated sectioned planner context before long section runs keep accumulating prompt cost", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-section-compaction-"));
    tempRoots.push(root);
    const source = {
      id: "source-long-plan",
      kind: "implementation_plan" as const,
      title: "Long app plan",
      summary: "A long implementation plan with many independent sections.",
      path: "LONG_PLAN.md",
      excerpt: Array.from({ length: 9 }, (_, index) =>
        [`## Feature ${index + 1}`, `Build feature ${index + 1} with source-grounded scope and proof.`].join("\n"),
      ).join("\n\n"),
      relevance: 99,
    };
    const workspace = await createProjectBoardPlannerWorkspace({
      projectPath: root,
      boardId: "board-section-compaction",
      runId: "run-section-compaction",
      projectName: "Section Compaction Board",
      operation: "section_elaboration",
      sources: [source],
    });
    const calls: Array<{ systemPrompt?: string; prompt: string }> = [];
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "unknown-model",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      piTextCall: async (callInput) => {
        calls.push({ systemPrompt: callInput.systemPrompt, prompt: callInput.prompt });
        if (callInput.systemPrompt?.includes("ledger compaction")) {
          return JSON.stringify({
            summary: "Earlier feature sections are already represented; continue planning only the active feature section.",
            renderedCardThemes: ["Feature implementation sections already represented"],
            duplicateAvoidanceNotes: ["Do not recreate cards for earlier Feature sections."],
            remainingCoverage: [
              { sourceId: "source-long-plan", title: "Long app plan", status: "partial", summary: "Later feature sections remain." },
            ],
            openQuestions: [],
            dependencyHints: ["Keep later feature cards dependent on earlier foundations only when source evidence says so."],
            citations: ["source-long-plan"],
          });
        }
        const sectionMatch = /Section:\s+(\d+) of/.exec(callInput.prompt);
        const sectionNumber = Number(sectionMatch?.[1] ?? 1);
        const cardId = `synthesis:feature-${sectionNumber}`;
        return JSON.stringify({
          records: [
            {
              type: "candidate_card",
              sourceId: cardId,
              title: `Implement feature ${sectionNumber}`,
              description: `Implement feature ${sectionNumber} from the active source section.`,
              candidateStatus: "ready_to_create",
              priority: sectionNumber,
              phase: "Implementation",
              labels: ["feature"],
              blockedBy: sectionNumber > 1 ? [`synthesis:feature-${sectionNumber - 1}`] : [],
              sourceRefs: [{ sourceId: "source-long-plan", range: `feature-${sectionNumber}` }],
              clarificationQuestions: [],
              acceptanceCriteria: [`Feature ${sectionNumber} is implemented.`],
              testPlan: { unit: [`Feature ${sectionNumber} unit proof.`], integration: [], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-long-plan",
              range: `feature-${sectionNumber}`,
              status: "covered",
              cardIds: [cardId],
              updatedAt: "2026-05-04T00:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Section Compaction Board",
      sources: [source],
      plannerWorkspace: workspace,
      sectioning: { maxSectionChars: 1000, minSectionChars: 200 },
      onProgress: (event) => progress.push(event),
    });
    const records = await readProjectBoardPlannerWorkspaceRecords(workspace);
    const compactionCalls = calls.filter((call) => call.systemPrompt?.includes("ledger compaction"));
    const sectionCalls = calls.filter((call) => !call.systemPrompt?.includes("ledger compaction"));
    const sectionCompactionRecords = records.filter((record) => record.type === "progress" && record.stage === "section_context_compacted");
    const compactedSectionRequest = progress.find(
      (event) =>
        event.stage === "model_request" &&
        event.title.startsWith("Asked Ambient/Pi for section") &&
        event.metadata.plannerLedgerCompactionStatus === "used",
    );

    expect(compactionCalls.length).toBeGreaterThan(0);
    expect(sectionCalls.some((call) => call.prompt.includes("Compacted planner context:"))).toBe(true);
    expect(sectionCalls.some((call) => call.prompt.includes("Earlier feature sections are already represented"))).toBe(true);
    expect(sectionCompactionRecords.length).toBeGreaterThan(0);
    expect(sectionCompactionRecords[0]).toMatchObject({
      type: "progress",
      stage: "section_context_compacted",
      metadata: {
        sectionContextCompactionReason: expect.stringMatching(
          /section_count_threshold|repeated_stable_context|cumulative_prompt_budget|section_prompt_budget/,
        ),
        plannerLedgerCompaction: {
          source: "pi_rlm",
          cacheHit: false,
        },
      },
    });
    expect(compactedSectionRequest?.metadata).toMatchObject({
      plannerLedgerCompactionStatus: "used",
      sectionContextCompactionReason: expect.stringMatching(
        /section_count_threshold|repeated_stable_context|cumulative_prompt_budget|section_prompt_budget/,
      ),
      plannerLedgerCompaction: { source: "pi_rlm" },
    });
    expect(result.telemetry).toMatchObject({
      sectionCount: 9,
      plannerLedgerCompactionCount: compactionCalls.length,
      plannerLedgerCompactionCacheHitCount: 0,
      lastPlannerLedgerCompaction: { source: "pi_rlm" },
    });
  });

  it("limits each section to a small candidate-card batch", async () => {
    const prompts: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        prompts.push(body.messages.at(-1)?.content ?? "");
        const records: unknown[] = Array.from({ length: 4 }, (_, index) => ({
          type: "candidate_card",
          sourceId: `synthesis:batch-${index + 1}`,
          title: `Implement batch card ${index + 1}`,
          description: `Implement a small batch card ${index + 1}.`,
          candidateStatus: "ready_to_create",
          priority: index + 1,
          phase: "Foundation",
          labels: ["batch"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-gdd", range: "lines:1-5" }],
          acceptanceCriteria: [`Batch card ${index + 1} has proof.`],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }));
        records.push({
          type: "source_coverage",
          sourceId: "source-gdd",
          range: "lines:1-5",
          status: "covered",
          cardIds: ["synthesis:batch-1", "synthesis:batch-2", "synthesis:batch-3", "synthesis:batch-4"],
          updatedAt: "2026-05-04T00:00:00.000Z",
        });
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records }) } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Batch Game",
      maxCardsPerSection: 2,
      sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: "# Game\nThe source contains several candidate systems.",
          relevance: 99,
        },
      ],
    });

    expect(prompts[0]).toContain("Emit at most 2 candidate_card records");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:batch-1", "synthesis:batch-2"]);
    expect(result.progressiveRecords?.some((record) => record.type === "warning" && record.code === "section_batch_card_limit")).toBe(true);
    expect(result.telemetry).toMatchObject({ cardCount: 2, batchCardLimit: 2 });
  });

  it("retries zero-output transient Pi section calls before marking the section failed", async () => {
    const previousAttempts = process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS;
    const previousDelay = process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS;
    process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS = "2";
    process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS = "0";
    let calls = 0;
    try {
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: "zai-org/GLM-5.1-FP8",
        apiKey: "ambient-test-key",
        piTextCall: async () => {
          calls += 1;
          if (calls === 1) throw new Error("429 Upstream request failed after 96ms (0 output chars, 0 thinking chars, idle 0ms).");
          return JSON.stringify({
            records: [
              {
                type: "candidate_card",
                sourceId: "synthesis:transient-retry",
                title: "Implement retry-safe section",
                description: "Use the section result after a transient zero-output retry.",
                candidateStatus: "ready_to_create",
                priority: 1,
                phase: "Foundation",
                labels: ["retry"],
                blockedBy: [],
                sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
                acceptanceCriteria: ["The section succeeds after a transient retry."],
                testPlan: { unit: ["Assert retry behavior."], integration: [], visual: [], manual: [] },
              },
              {
                type: "source_coverage",
                sourceId: "source-gdd",
                range: "full",
                status: "covered",
                cardIds: ["synthesis:transient-retry"],
                updatedAt: "2026-05-04T00:00:00.000Z",
              },
            ],
          });
        },
      });

      const result = await provider.synthesizeSectionedWithTelemetry({
        projectName: "Transient Retry Game",
        sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
        sources: [
          {
            id: "source-gdd",
            kind: "functional_spec",
            title: "GDD",
            summary: "Game design.",
            path: "GAME_DESIGN_DOCUMENT.md",
            excerpt: "# Game\nThe source describes one retry-safe card.",
            relevance: 99,
          },
        ],
      });

      expect(calls).toBe(2);
      expect(result.draft.cards.map((card) => card.title)).toEqual(["Implement retry-safe section"]);
      expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_planning_failed")).toBe(false);
    } finally {
      if (previousAttempts === undefined) delete process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS;
      else process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS = previousAttempts;
      if (previousDelay === undefined) delete process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS;
      else process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS = previousDelay;
    }
  });

  it("uses the aggressive retry schedule for zero-output project-board section transport failures", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      piTextCall: async () => {
        calls += 1;
        if (calls <= 3) throw new Error("429 Upstream request failed after 96ms (0 output chars, 0 thinking chars, idle 0ms).");
        return JSON.stringify({
          records: [
            {
              type: "candidate_card",
              sourceId: "synthesis:aggressive-retry",
              title: "Implement aggressive retry recovery",
              description: "Use the section result after aggressive transient retries.",
              candidateStatus: "ready_to_create",
              priority: 1,
              phase: "Foundation",
              labels: ["retry"],
              blockedBy: [],
              sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
              acceptanceCriteria: ["The section succeeds after aggressive transient retries."],
              testPlan: { unit: ["Assert aggressive retry schedule."], integration: [], visual: [], manual: [] },
            },
            {
              type: "source_coverage",
              sourceId: "source-gdd",
              range: "full",
              status: "covered",
              cardIds: ["synthesis:aggressive-retry"],
              updatedAt: "2026-05-04T00:00:00.000Z",
            },
          ],
        });
      },
    });

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Aggressive Retry Game",
      sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: "# Game\nThe source describes one aggressive retry card.",
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(event),
    });

    expect(calls).toBe(4);
    expect(retryDelays).toEqual([1_000, 2_000, 3_000]);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:aggressive-retry"]);
    expect(progress.filter((event) => event.metadata.transientRetry === true).map((event) => event.metadata.retryDelayMs)).toEqual([
      1_000, 2_000, 3_000,
    ]);
    expect(
      progress.filter((event) => event.metadata.transientRetry === true).every((event) => event.metadata.aggressiveRetries === true),
    ).toBe(true);
  });

  it("does not retry section transport failures after Pi has observed tool activity", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const batches: Array<{ records: ProposalJsonlRecordArtifact[] }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      piTextCall: async () => {
        calls += 1;
        throw new AmbientStreamFailureError("stream_idle_timeout", "Ambient/Pi stream stalled after 120000ms without stream activity.", {
          toolCallSeen: true,
        });
      },
    });

    await expect(
      provider.synthesizeSectionedWithTelemetry({
        projectName: "Tool Side Effect Game",
        sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
        sources: [
          {
            id: "source-gdd",
            kind: "functional_spec",
            title: "GDD",
            summary: "Game design.",
            path: "GAME_DESIGN_DOCUMENT.md",
            excerpt: "# Game\nThe source describes one card.",
            relevance: 99,
          },
        ],
        onProgressiveRecords: (batch) => batches.push({ records: batch.records }),
      }),
    ).rejects.toThrow("did not produce any candidate cards");

    expect(calls).toBe(1);
    expect(retryDelays).toEqual([]);
    const emittedRecords = batches.flatMap((batch) => batch.records);
    expect(emittedRecords.some((record) => record.type === "progress" && record.stage === "section_retry_started")).toBe(false);
    expect(emittedRecords.some((record) => record.type === "error" && record.code === "section_planning_failed")).toBe(true);
  });

  it("retries no-record section attempts inline before moving on", async () => {
    let calls = 0;
    const prompts: string[] = [];
    const batches: Array<{ records: ProposalJsonlRecordArtifact[] }> = [];
    const progress: AmbientProjectBoardSynthesisProgress[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        calls += 1;
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        prompts.push(body.messages.at(-1)?.content ?? "");
        if (calls === 1) {
          return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ records: [] }) } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:inline-retry",
                        title: "Implement inline retry recovery",
                        description: "Use the section retry result instead of deferring recovery.",
                        candidateStatus: "ready_to_create",
                        priority: 1,
                        phase: "Foundation",
                        labels: ["retry"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-gdd", range: "full" }],
                        acceptanceCriteria: ["The active planning run recovers the section."],
                        testPlan: { unit: ["Assert retry records."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: "full",
                        status: "covered",
                        cardIds: ["synthesis:inline-retry"],
                        updatedAt: "2026-05-04T00:00:00.000Z",
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

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Inline Retry Game",
      sectioning: { maxSectionChars: 1000, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: "# Game\nThe source describes one retry-recovered card.",
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(event),
      onProgressiveRecords: (batch) => batches.push({ records: batch.records }),
    });

    const stages = result.progressiveRecords?.filter((record) => record.type === "progress").map((record) => record.stage) ?? [];
    expect(calls).toBe(2);
    expect(prompts[1]).toContain("Section retry context:");
    expect(prompts[1]).toContain("Retry attempt: 1 of 2");
    expect(prompts[1]).toContain("Prior failure kind: no_records");
    expect(progress.find((event) => event.title === "Asked Ambient/Pi for section 1/1")?.metadata).toMatchObject({
      latestPromptCharCount: prompts[0].length,
      cumulativePromptCharCount: prompts[0].length,
      latestEstimatedInputTokens: Math.ceil(prompts[0].length / 4),
      cumulativeEstimatedInputTokens: Math.ceil(prompts[0].length / 4),
      plannerLedgerCompactionStatus: "skipped",
      plannerLedgerCompactionSkipReason: "section_prompt_below_threshold",
    });
    expect(progress.find((event) => event.title === "Asked Ambient/Pi to retry section 1/1")?.metadata).toMatchObject({
      latestPromptCharCount: prompts[1].length,
      cumulativePromptCharCount: prompts[0].length + prompts[1].length,
      latestEstimatedInputTokens: Math.ceil(prompts[1].length / 4),
      cumulativeEstimatedInputTokens: Math.ceil((prompts[0].length + prompts[1].length) / 4),
      plannerLedgerCompactionStatus: "skipped",
      plannerLedgerCompactionSkipReason: "section_prompt_below_threshold",
    });
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:inline-retry"]);
    expect(stages).toEqual(expect.arrayContaining(["section_retry_started", "section_retry_succeeded", "section_succeeded"]));
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_no_records")).toBe(false);
    expect(batches.map((batch) => batch.records.map((record) => (record.type === "progress" ? record.stage : record.type)))).toEqual([
      ["section_retry_started"],
      ["candidate_card", "source_coverage", "section_retry_succeeded", "section_succeeded"],
    ]);
  });

  it("stops sectioned synthesis after exhausting inline retries for a zero-output transient provider failure before any cards", async () => {
    const previousAttempts = process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS;
    process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS = "1";
    let calls = 0;
    const batches: Array<{ records: ProposalJsonlRecordArtifact[] }> = [];
    try {
      const provider = new AmbientProjectBoardSynthesisProvider({
        model: "zai-org/GLM-5.1-FP8",
        apiKey: "ambient-test-key",
        piTextCall: async () => {
          calls += 1;
          throw new Error("429 Upstream request failed after 96ms (0 output chars, 0 thinking chars, idle 0ms).");
        },
      });

      await expect(
        provider.synthesizeSectionedWithTelemetry({
          projectName: "Transient Stop Game",
          sectioning: { maxSectionChars: 60, minSectionChars: 20 },
          sources: [
            {
              id: "source-gdd",
              kind: "functional_spec",
              title: "GDD",
              summary: "Game design.",
              path: "GAME_DESIGN_DOCUMENT.md",
              excerpt: "# Game\n## One\nFirst section.\n## Two\nSecond section.",
              relevance: 99,
            },
          ],
          onProgressiveRecords: (batch) => batches.push({ records: batch.records }),
        }),
      ).rejects.toThrow("transient zero-output provider error");

      const emittedRecords = batches.flatMap((batch) => batch.records);
      expect(calls).toBe(3);
      expect(emittedRecords.filter((record) => record.type === "progress" && record.stage === "section_retry_started")).toHaveLength(2);
      expect(emittedRecords.filter((record) => record.type === "progress" && record.stage === "section_retry_exhausted")).toHaveLength(1);
      expect(emittedRecords.filter((record) => record.type === "error" && record.code === "section_planning_failed")).toHaveLength(1);
    } finally {
      if (previousAttempts === undefined) delete process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS;
      else process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS = previousAttempts;
    }
  });

  it("keeps successful section records usable when a later section fails", async () => {
    const batches: Array<{ section: string; records: string[] }> = [];
    const progress: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        if (prompt.includes("Section heading: Combat")) throw new Error("simulated section failure");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
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
                        sourceRefs: [{ sourceId: "source-gdd", range: "lines:4-5" }],
                        acceptanceCriteria: ["Ship moves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: "lines:4-5",
                        status: "covered",
                        cardIds: ["synthesis:movement-model"],
                        updatedAt: "2026-05-04T00:00:00.000Z",
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

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Recoverable Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: [
            "# Movement",
            "The ship uses hybrid Newtonian movement.",
            "",
            "## Combat",
            "Enemy ships fire salvos and shields absorb damage.",
          ].join("\n"),
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(`${event.title}:${event.summary}`),
      onProgressiveRecords: (batch) =>
        batches.push({ section: batch.section.heading, records: batch.records.map((record) => record.type) }),
    });

    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model"]);
    expect(result.telemetry).toMatchObject({
      cardCount: 1,
      sectionCount: 2,
      failedSectionCount: 1,
      partial: true,
    });
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_planning_failed")).toBe(true);
    expect(batches).toEqual([
      { section: "Movement", records: ["candidate_card", "source_coverage", "progress"] },
      { section: "Combat", records: ["progress"] },
      { section: "Combat", records: ["progress"] },
      { section: "Combat", records: ["progress", "progress", "error", "source_coverage"] },
    ]);
    expect(progress.some((event) => event.includes("Retry exhausted for failed section 2/2"))).toBe(true);
  });

  it("records a retryable section when keepalives continue without semantic content", async () => {
    const batches: Array<{ section: string; records: string[] }> = [];
    const progress: string[] = [];
    let movementStreamCanceled = false;
    let movementKeepalive: ReturnType<typeof setInterval> | undefined;
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      streamIdleTimeoutMs: 25,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        if (prompt.includes("Section heading: Movement")) {
          return new Response(
            new ReadableStream({
              start(controller) {
                const encoder = new TextEncoder();
                movementKeepalive = setInterval(() => {
                  try {
                    controller.enqueue(encoder.encode(": keepalive\n\n"));
                  } catch {
                    if (movementKeepalive) clearInterval(movementKeepalive);
                  }
                }, 5);
              },
              cancel() {
                movementStreamCanceled = true;
                if (movementKeepalive) clearInterval(movementKeepalive);
              },
            }),
            { status: 200, headers: { "Content-Type": "text/event-stream" } },
          );
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:combat-loop",
                        title: "Implement combat loop",
                        description: "Add combat from the combat section.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Combat",
                        labels: ["combat"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-gdd", range: "lines:4-5" }],
                        acceptanceCriteria: ["Combat resolves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: "lines:4-5",
                        status: "covered",
                        cardIds: ["synthesis:combat-loop"],
                        updatedAt: "2026-05-08T00:00:00.000Z",
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

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Content Idle Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [
        {
          id: "source-gdd",
          kind: "functional_spec",
          title: "GDD",
          summary: "Game design.",
          path: "GAME_DESIGN_DOCUMENT.md",
          excerpt: [
            "# Movement",
            "The ship uses hybrid Newtonian movement.",
            "",
            "## Combat",
            "Enemy ships fire salvos and shields absorb damage.",
          ].join("\n"),
          relevance: 99,
        },
      ],
      onProgress: (event) => progress.push(`${event.title}:${event.summary}`),
      onProgressiveRecords: (batch) =>
        batches.push({ section: batch.section.heading, records: batch.records.map((record) => record.type) }),
    });

    expect(movementStreamCanceled).toBe(true);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:combat-loop"]);
    expect(result.telemetry).toMatchObject({ failedSectionCount: 1, semanticIdleSectionCount: 1, partial: true });
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_semantic_idle_timeout")).toBe(
      true,
    );
    expect(
      result.progressiveRecords?.some(
        (record) =>
          record.type === "progress" && record.stage === "section_failed" && record.metadata.failureKind === "semantic_idle_timeout",
      ),
    ).toBe(true);
    expect(batches).toEqual([
      { section: "Movement", records: ["progress"] },
      { section: "Movement", records: ["progress"] },
      { section: "Movement", records: ["progress", "progress", "error", "source_coverage"] },
      { section: "Combat", records: ["candidate_card", "source_coverage", "progress"] },
    ]);
    expect(progress.some((event) => event.includes("Retry exhausted for stalled section 1/2"))).toBe(true);
    expect(progress.some((event) => event.includes("without model content"))).toBe(true);
  });

  it("resumes sectioned planning by skipping previously completed sections", async () => {
    const source = {
      id: "source-gdd",
      kind: "functional_spec" as const,
      title: "GDD",
      summary: "Game design.",
      path: "GAME_DESIGN_DOCUMENT.md",
      excerpt: [
        "# Movement",
        "The ship uses hybrid Newtonian movement.",
        "",
        "## Combat",
        "Enemy ships fire salvos and shields absorb damage.",
      ].join("\n"),
      relevance: 99,
    };
    const sections = projectBoardPlanningSectionsFromSources([source], { maxSectionChars: 130, minSectionChars: 20 });
    const movement = sections.find((section) => section.heading === "Movement");
    expect(movement).toBeDefined();
    const calls: string[] = [];
    const batches: Array<{ section: string; records: string[] }> = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        expect(prompt).toContain("Section heading: Combat");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:combat-loop",
                        title: "Implement combat loop",
                        description: "Add combat from the combat section.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Combat",
                        labels: ["combat"],
                        blockedBy: ["synthesis:movement-model"],
                        sourceRefs: [{ sourceId: "source-gdd", range: "lines:4-5" }],
                        acceptanceCriteria: ["Combat resolves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: "lines:4-5",
                        status: "covered",
                        cardIds: ["synthesis:combat-loop"],
                        updatedAt: "2026-05-04T00:00:00.000Z",
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

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Resumable Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [source],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
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
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 1/2",
          summary: "Movement was completed in a previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sectionStatus: "succeeded" },
        }),
      ],
      onProgressiveRecords: (batch) =>
        batches.push({ section: batch.section.heading, records: batch.records.map((record) => record.type) }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("Section heading: Movement");
    expect(batches).toEqual([
      { section: "Movement", records: ["progress"] },
      { section: "Combat", records: ["candidate_card", "source_coverage", "progress"] },
    ]);
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model", "synthesis:combat-loop"]);
    expect(result.telemetry).toMatchObject({
      skippedSectionCount: 1,
      failedSectionCount: 0,
      partial: false,
    });
  });

  it("retries failed sections without carrying stale failure artifacts into the resumed proposal", async () => {
    const source = {
      id: "source-gdd",
      kind: "functional_spec" as const,
      title: "GDD",
      summary: "Game design.",
      path: "GAME_DESIGN_DOCUMENT.md",
      excerpt: [
        "# Movement",
        "The ship uses hybrid Newtonian movement.",
        "",
        "## Combat",
        "Enemy ships fire salvos and shields absorb damage.",
      ].join("\n"),
      relevance: 99,
    };
    const sections = projectBoardPlanningSectionsFromSources([source], { maxSectionChars: 130, minSectionChars: 20 });
    const movement = sections.find((section) => section.heading === "Movement");
    const combat = sections.find((section) => section.heading === "Combat");
    expect(movement).toBeDefined();
    expect(combat).toBeDefined();
    const calls: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        expect(prompt).toContain("Section heading: Combat");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:combat-loop",
                        title: "Implement combat loop",
                        description: "Add combat from the retried combat section.",
                        candidateStatus: "needs_clarification",
                        priority: 2,
                        phase: "Combat",
                        labels: ["combat"],
                        blockedBy: ["synthesis:movement-model"],
                        sourceRefs: [{ sourceId: "source-gdd", range: combat!.range }],
                        acceptanceCriteria: ["Combat resolves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
                      },
                      {
                        type: "source_coverage",
                        sourceId: "source-gdd",
                        range: combat!.range,
                        status: "covered",
                        cardIds: ["synthesis:combat-loop"],
                        updatedAt: "2026-05-04T00:00:00.000Z",
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

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Retry Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [source],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:movement-model",
          title: "Implement movement model",
          description: "Add movement from the movement section.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Movement",
          labels: ["movement"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-gdd", range: movement!.range }],
          acceptanceCriteria: ["Ship moves."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 1/2",
          summary: "Movement was completed in a previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sectionStatus: "succeeded", sourceId: "source-gdd", sectionRange: movement!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_failed",
          title: "Failed section 2/2",
          summary: "Combat failed in the previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: combat!.id, sectionStatus: "failed", sourceId: "source-gdd", sectionRange: combat!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "error",
          code: "section_planning_failed",
          message: "Combat failed in the previous run.",
          recoverable: true,
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: combat!.id, sourceId: "source-gdd", range: combat!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "source_coverage",
          sourceId: "source-gdd",
          range: combat!.range,
          status: "unresolved",
          cardIds: [],
          note: "Combat was unresolved in the previous run.",
          updatedAt: "2026-05-04T00:00:00.000Z",
        }),
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("Section heading: Movement");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:movement-model", "synthesis:combat-loop"]);
    expect(result.telemetry).toMatchObject({ skippedSectionCount: 1, failedSectionCount: 0, partial: false });
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_planning_failed")).toBe(false);
    expect(
      result.progressiveRecords?.some(
        (record) =>
          record.type === "source_coverage" &&
          record.sourceId === "source-gdd" &&
          record.range === combat!.range &&
          record.status === "unresolved",
      ),
    ).toBe(false);
  });

  it("treats prior semantic-idle section artifacts as retryable even without a matching progress record", async () => {
    const source = {
      id: "source-gdd",
      kind: "functional_spec" as const,
      title: "GDD",
      summary: "Game design.",
      path: "GAME_DESIGN_DOCUMENT.md",
      excerpt: [
        "# Movement",
        "The ship uses hybrid Newtonian movement.",
        "",
        "## Combat",
        "Enemy ships fire salvos and shields absorb damage.",
      ].join("\n"),
      relevance: 99,
    };
    const sections = projectBoardPlanningSectionsFromSources([source], { maxSectionChars: 130, minSectionChars: 20 });
    const movement = sections.find((section) => section.heading === "Movement");
    const combat = sections.find((section) => section.heading === "Combat");
    expect(movement).toBeDefined();
    expect(combat).toBeDefined();
    const calls: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        expect(prompt).toContain("Section heading: Movement");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:movement-model",
                        title: "Implement movement model",
                        description: "Add movement from the retried movement section.",
                        candidateStatus: "needs_clarification",
                        priority: 1,
                        phase: "Movement",
                        labels: ["movement"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-gdd", range: movement!.range }],
                        acceptanceCriteria: ["Ship moves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
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

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Retry Semantic Idle Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [source],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "error",
          code: "section_semantic_idle_timeout",
          message: "Movement stalled after 25ms without model content or planner records.",
          recoverable: true,
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sourceId: "source-gdd", range: movement!.range, failureKind: "semantic_idle_timeout" },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 2/2",
          summary: "Combat was completed in a previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: combat!.id, sectionStatus: "succeeded", sourceId: "source-gdd", sectionRange: combat!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:combat-loop",
          title: "Implement combat loop",
          description: "Add combat from the completed combat section.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Combat",
          labels: ["combat"],
          blockedBy: ["synthesis:movement-model"],
          sourceRefs: [{ sourceId: "source-gdd", range: combat!.range }],
          acceptanceCriteria: ["Combat resolves."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("Section heading: Combat");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:combat-loop", "synthesis:movement-model"]);
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_semantic_idle_timeout")).toBe(
      false,
    );
    expect(result.telemetry).toMatchObject({ skippedSectionCount: 1, failedSectionCount: 0, partial: false });
  });

  it("treats previous no-record section artifacts as retryable even if an older run marked the section succeeded", async () => {
    const source = {
      id: "source-gdd",
      kind: "functional_spec" as const,
      title: "GDD",
      summary: "Game design.",
      path: "GAME_DESIGN_DOCUMENT.md",
      excerpt: [
        "# Movement",
        "The ship uses hybrid Newtonian movement.",
        "",
        "## Combat",
        "Enemy ships fire salvos and shields absorb damage.",
      ].join("\n"),
      relevance: 99,
    };
    const sections = projectBoardPlanningSectionsFromSources([source], { maxSectionChars: 130, minSectionChars: 20 });
    const movement = sections.find((section) => section.heading === "Movement");
    const combat = sections.find((section) => section.heading === "Combat");
    expect(movement).toBeDefined();
    expect(combat).toBeDefined();
    const calls: string[] = [];
    const provider = new AmbientProjectBoardSynthesisProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        calls.push(prompt);
        expect(prompt).toContain("Section heading: Movement");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    records: [
                      {
                        type: "candidate_card",
                        sourceId: "synthesis:movement-model",
                        title: "Implement movement model",
                        description: "Add movement from the retried movement section.",
                        candidateStatus: "needs_clarification",
                        priority: 1,
                        phase: "Movement",
                        labels: ["movement"],
                        blockedBy: [],
                        sourceRefs: [{ sourceId: "source-gdd", range: movement!.range }],
                        acceptanceCriteria: ["Ship moves."],
                        testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
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

    const result = await provider.synthesizeSectionedWithTelemetry({
      projectName: "Retry No Records Game",
      sectioning: { maxSectionChars: 130, minSectionChars: 20 },
      sources: [source],
      resumeFromRecords: [
        validateProposalJsonlRecordArtifact({
          type: "error",
          code: "section_no_records",
          message: "Movement returned no records in the previous run.",
          recoverable: true,
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sourceId: "source-gdd", range: movement!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 1/2",
          summary: "Older run incorrectly treated no records as a completed section.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: movement!.id, sectionStatus: "succeeded", sourceId: "source-gdd", sectionRange: movement!.range },
        }),
        validateProposalJsonlRecordArtifact({
          type: "source_coverage",
          sourceId: "source-gdd",
          range: movement!.range,
          status: "unresolved",
          cardIds: [],
          updatedAt: "2026-05-04T00:00:00.000Z",
        }),
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:combat-loop",
          title: "Implement combat loop",
          description: "Add combat from the completed combat section.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Combat",
          labels: ["combat"],
          blockedBy: ["synthesis:movement-model"],
          sourceRefs: [{ sourceId: "source-gdd", range: combat!.range }],
          acceptanceCriteria: ["Combat resolves."],
          testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
        }),
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_succeeded",
          title: "Completed section 2/2",
          summary: "Combat was completed in a previous run.",
          createdAt: "2026-05-04T00:00:00.000Z",
          metadata: { sectionId: combat!.id, sectionStatus: "succeeded", sourceId: "source-gdd", sectionRange: combat!.range },
        }),
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("Section heading: Combat");
    expect(result.draft.cards.map((card) => card.sourceId)).toEqual(["synthesis:combat-loop", "synthesis:movement-model"]);
    expect(result.telemetry).toMatchObject({ skippedSectionCount: 1, failedSectionCount: 0, partial: false });
    expect(result.progressiveRecords?.some((record) => record.type === "error" && record.code === "section_no_records")).toBe(false);
  });
});
