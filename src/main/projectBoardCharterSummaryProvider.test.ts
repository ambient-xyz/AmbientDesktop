import { describe, expect, it } from "vitest";
import {
  AmbientProjectBoardCharterSummaryProvider,
  buildProjectBoardCharterSummaryPrompt,
  normalizeProjectBoardCharterSummary,
  parseProjectBoardCharterSummaryJson,
  type AmbientProjectBoardCharterSummaryProgress,
} from "./projectBoardCharterSummaryProvider";
import type { ProjectBoardCharter, ProjectBoardCharterProjectSummary, ProjectBoardSource } from "../shared/types";
import { aggressiveAmbientRetryPolicy } from "./aggressiveRetries";

describe("AmbientProjectBoardCharterSummaryProvider", () => {
  it("calls Ambient chat completions and normalizes a grounded charter summary", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const provider = new AmbientProjectBoardCharterSummaryProvider({
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
                    summary: "Build a recoverable project-board planner that turns source scans into restartable implementation cards.",
                    majorSystems: ["Planner workspace", "Project board artifacts", "PM Review"],
                    sourceCoverage: ["recoverabilityWork.html defines the target recovery plan."],
                    risks: ["Provider output can stop mid-run and must not be stitched semantically."],
                    dependencyHints: ["Git bootstrap should land before artifact adoption hardening."],
                    unresolvedDecisions: ["How much retrieval activity should be shown in PM Review?"],
                    citations: ["recoverabilityWork.html", "kanbanImplementationPhasesV3.md"],
                    coverageGaps: ["Live Pi session tool implementation is still future work."],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.summarize({
      projectName: "Ambient Coder",
      charter: charterFixture(),
      sources: sourceFixtures(),
      fallbackSummary: fallbackSummaryFixture(),
      generatedAt: "2026-05-11T12:00:00.000Z",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].body.stream).toBe(true);
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    expect(calls[0].body.reasoning).toEqual({ effort: "low", max_tokens: 900, exclude: true, enabled: true });
    expect(JSON.stringify(calls[0].body)).toContain("project-board planning contract");
    expect(JSON.stringify(calls[0].body)).toContain("Operation overlay: Charter Project Summary");
    expect(JSON.stringify(calls[0].body)).toContain("Project: Ambient Coder");
    expect(JSON.stringify(calls[0].body)).toContain("recoverabilityWork.html");
    expect(result.summary).toMatchObject({
      generator: "ambient_rlm",
      generatedAt: "2026-05-11T12:00:00.000Z",
      sourceChecksumSet: ["hash-plan", "hash-v3"],
      charterAnswerChecksum: "charter-checksum",
      majorSystems: ["Planner workspace", "Project board artifacts", "PM Review"],
    });
    expect(result.telemetry).toMatchObject({
      sourceCount: 2,
      promptCharCount: expect.any(Number),
      responseCharCount: expect.any(Number),
      requestDurationMs: expect.any(Number),
    });
    expect(result.telemetry.promptCharCount).toBeGreaterThan(1000);
  });

  it("uses the aggressive retry schedule for zero-output transient charter summary failures", async () => {
    let calls = 0;
    const retryDelays: number[] = [];
    const progressEvents: AmbientProjectBoardCharterSummaryProgress[] = [];
    const provider = new AmbientProjectBoardCharterSummaryProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      waitForRetry: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls <= 2) return new Response("upstream unavailable", { status: 503, headers: { "Content-Type": "text/plain" } });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Recovered charter summary.",
                    majorSystems: ["Planner recovery"],
                    sourceCoverage: ["Current source scan."],
                    risks: [],
                    dependencyHints: [],
                    unresolvedDecisions: [],
                    citations: ["recoverabilityWork.html"],
                    coverageGaps: [],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.summarize({
      charter: charterFixture(),
      sources: sourceFixtures(),
      fallbackSummary: fallbackSummaryFixture(),
      generatedAt: "2026-05-11T12:00:00.000Z",
      onProgress: (event) => progressEvents.push(event),
    });

    expect(calls).toBe(3);
    expect(retryDelays).toEqual([1_000, 2_000]);
    expect(progressEvents.filter((event) => event.transientRetry)).toEqual([
      expect.objectContaining({
        responseCharCount: 0,
        transientRetry: true,
        retryAttempt: 1,
        maxRetries: 10,
        retryDelayMs: 1_000,
        aggressiveRetries: true,
        retryError: expect.stringContaining("503"),
      }),
      expect.objectContaining({
        responseCharCount: 0,
        transientRetry: true,
        retryAttempt: 2,
        maxRetries: 10,
        retryDelayMs: 2_000,
        aggressiveRetries: true,
        retryError: expect.stringContaining("503"),
      }),
    ]);
    expect(result.summary.summary).toBe("Recovered charter summary.");
  });

  it("streams charter summary output and reports response character progress", async () => {
    const content = JSON.stringify({
      summary: "Summarize the planning recovery work for future planner/card prompts.",
      majorSystems: ["Charter summary"],
      sourceCoverage: ["The plan doc describes Phase 3 summary work."],
      risks: ["Live summary failures need deterministic fallback."],
      dependencyHints: ["Refresh after source classification."],
      unresolvedDecisions: [],
      citations: ["recoverabilityWork.html"],
      coverageGaps: [],
    });
    const progress: number[] = [];
    const provider = new AmbientProjectBoardCharterSummaryProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(0, 45) } }] })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(45) } }] })}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const result = await provider.summarize({
      charter: charterFixture(),
      sources: sourceFixtures().slice(0, 1),
      fallbackSummary: fallbackSummaryFixture(),
      onProgress: (event) => progress.push(event.responseCharCount),
    });

    expect(result.summary.generator).toBe("ambient_rlm");
    expect(result.summary.majorSystems).toEqual(["Charter summary"]);
    expect(progress.at(-1)).toBe(content.length);
    expect(result.telemetry.responseCharCount).toBe(content.length);
  });

  it("forwards abort signals to the Ambient charter summary transport", async () => {
    const controller = new AbortController();
    let transportSignal: AbortSignal | undefined;
    const provider = new AmbientProjectBoardCharterSummaryProvider({
      model: "zai-org/GLM-5.1-FP8",
      apiKey: "ambient-test-key",
      baseUrl: "https://ambient.example/v1",
      fetchImpl: async (_url, init) => {
        transportSignal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          const signal = transportSignal;
          if (!signal) return reject(new Error("missing signal"));
          if (signal.aborted) return reject(signal.reason);
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    });

    const pending = provider.summarize({
      charter: charterFixture(),
      sources: sourceFixtures().slice(0, 1),
      fallbackSummary: fallbackSummaryFixture(),
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort(new Error("pause requested"));

    await expect(pending).rejects.toThrow("pause requested");
    expect(transportSignal).toBeDefined();
    expect(transportSignal?.aborted).toBe(true);
    const abortReason = transportSignal?.reason;
    const abortReasonText =
      abortReason instanceof Error
        ? `${abortReason.message} ${abortReason.cause instanceof Error ? abortReason.cause.message : String(abortReason.cause ?? "")}`
        : String(abortReason);
    expect(abortReasonText).toContain("pause requested");
  });

  it("keeps fallback checksums and fills missing optional summary lists", () => {
    const summary = normalizeProjectBoardCharterSummary(
      {
        summary: "Live summary.",
        majorSystems: ["Planner"],
      },
      fallbackSummaryFixture(),
      "2026-05-11T12:00:00.000Z",
    );

    expect(summary).toMatchObject({
      summary: "Live summary.",
      majorSystems: ["Planner"],
      sourceCoverage: ["Fallback source coverage."],
      sourceChecksumSet: ["hash-plan", "hash-v3"],
      charterAnswerChecksum: "charter-checksum",
      generator: "ambient_rlm",
    });
  });

  it("parses fenced or embedded JSON responses", () => {
    expect(parseProjectBoardCharterSummaryJson("```json\n{\"summary\":\"ok\"}\n```")).toEqual({ summary: "ok" });
    expect(parseProjectBoardCharterSummaryJson("prefix {\"summary\":\"ok\"} suffix")).toEqual({ summary: "ok" });
  });

  it("builds a prompt with the stable contract and compact source evidence", () => {
    const prompt = buildProjectBoardCharterSummaryPrompt({
      projectName: "Ambient Coder",
      charter: charterFixture(),
      sources: sourceFixtures(),
      fallbackSummary: fallbackSummaryFixture(),
    });

    expect(prompt).toContain("Operation overlay: Charter Project Summary");
    expect(prompt).toContain("Create a compact active-charter project summary");
    expect(prompt).toContain("recoverabilityWork.html");
    expect(prompt).toContain("kanbanImplementationPhasesV3.md");
    expect(prompt).toContain("Deterministic fallback summary to improve");
  });
});

function charterFixture(): ProjectBoardCharter {
  return {
    id: "charter-1",
    boardId: "board-1",
    version: 1,
    status: "active",
    goal: "Upgrade planning and board synthesis recoverability.",
    currentState: "The app has progressive board records and planner workspaces.",
    targetUser: "Developers using Ambient project boards.",
    nonGoals: ["Do not rewrite unrelated kanban workflows."],
    qualityBar: "Use live Ambient/Pi validation for product behavior.",
    testPolicy: { default: "unit and live smoke" },
    decisionPolicy: { defaultPolicy: "Ask instead of inventing user preferences." },
    dependencyPolicy: { default: "Preserve source provenance." },
    budgetPolicy: { default: "Avoid giant single model outputs." },
    sourcePolicy: { policy: "Recent source scan plus active charter are authoritative." },
    markdown: "# Charter\n\nUpgrade recovery.",
    projectSummary: fallbackSummaryFixture(),
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
  };
}

function fallbackSummaryFixture(): ProjectBoardCharterProjectSummary {
  return {
    summary: "Fallback project-shape summary.",
    majorSystems: ["Fallback planner system"],
    sourceCoverage: ["Fallback source coverage."],
    risks: ["Fallback risk."],
    dependencyHints: ["Fallback dependency."],
    unresolvedDecisions: ["Fallback decision."],
    citations: ["fallback"],
    coverageGaps: ["Fallback gap."],
    sourceChecksumSet: ["hash-plan", "hash-v3"],
    charterAnswerChecksum: "charter-checksum",
    generatedAt: "2026-05-11T00:00:00.000Z",
    generator: "fallback_heuristic",
  };
}

function sourceFixtures(): ProjectBoardSource[] {
  return [
    {
      id: "source-plan",
      boardId: "board-1",
      kind: "implementation_plan",
      sourceKey: "file:recoverabilityWork.html",
      contentHash: "hash-plan",
      changeState: "new",
      title: "Recoverability Work",
      summary: "The implementation plan for recoverable planning and board synthesis.",
      excerpt: "Phase 3 adds a charter project summary generated by Ambient/Pi and refreshed from source checksums.",
      path: "recoverabilityWork.html",
      classificationReason: "Plan document.",
      classifiedBy: "fallback_heuristic",
      classificationConfidence: 0.8,
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 95,
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    },
    {
      id: "source-v3",
      boardId: "board-1",
      kind: "implementation_plan",
      sourceKey: "file:kanbanImplementationPhasesV3.md",
      contentHash: "hash-v3",
      changeState: "unchanged",
      title: "Kanban V3 Implementation Phases",
      summary: "Current-state notes for existing project-board recovery infrastructure.",
      excerpt: "V3 already has progressive records, planner workspaces, stalled-section recovery, split controls, and source coverage records.",
      path: "kanbanImplementationPhasesV3.md",
      classificationReason: "Implementation plan.",
      classifiedBy: "ambient_pi",
      classificationConfidence: 0.9,
      authorityRole: "supporting",
      includeInSynthesis: true,
      relevance: 89,
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    },
  ];
}
