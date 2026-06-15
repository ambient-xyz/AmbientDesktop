import { describe, expect, it } from "vitest";
import { workflowExplorationProgressCard, workflowExplorationTraceCards } from "./workflowExplorationUiModel";
import type { WorkflowExplorationTraceSummary } from "../../shared/types";

describe("workflowExplorationUiModel", () => {
  it("summarizes the latest exploration trace with distillation evidence", () => {
    const cards = workflowExplorationTraceCards(
      [
        trace({
          id: "older",
          createdAt: "2026-05-05T00:00:00.000Z",
          summary: "Older run",
        }),
        trace({
          id: "latest",
          createdAt: "2026-05-05T00:10:00.000Z",
          summary: "Read Gmail search results and found useful fields.",
          observedCalls: [{ kind: "connector", name: "google.gmail.listMessages", status: "succeeded" }],
          requiredGrants: ["Gmail read"],
          dataShapes: ["message: subject, from, snippet"],
          successfulPatterns: ["listMessages then getMessage for selected IDs"],
          unresolvedQuestions: ["How many emails should production inspect?"],
          graphSummary: "request -> gmail loop -> report",
          deterministicSourceStrategy: "Use a paginated Gmail loop with a connector budget covering the requested message count.",
        }),
      ],
      Date.parse("2026-05-05T00:12:00.000Z"),
    );

    expect(cards[0]).toMatchObject({
      id: "latest",
      title: "Latest exploration trace",
      createdLabel: "Created 2m ago",
      summary: "Read Gmail search results and found useful fields.",
      observationLabel: "1 observation",
      budgetLabels: ["Succeeded", "6 Pi turns", "4 tool calls", "4 connector calls", "2 Ambient calls", "3m wall-clock cap"],
      observedCallLabels: ["connector: google.gmail.listMessages (succeeded)"],
      requiredGrantLabels: ["Gmail read"],
      graphSummary: "request -> gmail loop -> report",
      deterministicSourceStrategy: "Use a paginated Gmail loop with a connector budget covering the requested message count.",
    });
  });

  it("falls back to observation labels when distillation omits observed calls", () => {
    const cards = workflowExplorationTraceCards([
      {
        ...trace({ summary: "" }),
        observations: [{ action: "call_tool", name: "file_read", status: "succeeded" }],
        distillation: { summary: "", observedCalls: [] },
      },
    ]);

    expect(cards[0].summary).toBe("Exploration finished without a written summary.");
    expect(cards[0].observedCallLabels).toEqual(["call_tool: file_read (succeeded)"]);
    expect(cards[0].budgetLabels).toEqual(["Succeeded", "6 Pi turns", "4 tool calls", "4 connector calls", "2 Ambient calls", "3m wall-clock cap"]);
    expect(cards[0].graphSummary).toBe("No recommended graph summary was recorded.");
  });

  it("summarizes retained custom exploration budgets from the trace capability manifest", () => {
    const cards = workflowExplorationTraceCards([
      trace({
        summary: "Custom budget run",
        budgets: { maxModelTurns: 8, maxToolCalls: 6, maxConnectorCalls: 10, maxAmbientCalls: 3, maxElapsedMs: 600_000 },
      }),
    ]);

    expect(cards[0].budgetLabels).toEqual(["Succeeded", "8 Pi turns", "6 tool calls", "10 connector calls", "3 Ambient calls", "10m wall-clock cap"]);
  });

  it("keeps failed durable traces reviewable after refresh", () => {
    const cards = workflowExplorationTraceCards([
      trace({
        status: "failed",
        summary: "Exploration is running.",
        error: "GMI Cloud stream stalled after 60000 ms without activity.",
        updatedAt: "2026-05-05T00:15:00.000Z",
      }),
    ]);

    expect(cards[0]).toMatchObject({
      title: "Failed exploration trace",
      summary: "Exploration failed: GMI Cloud stream stalled after 60000 ms without activity.",
      budgetLabels: expect.arrayContaining(["Failed"]),
    });
  });

  it("summarizes live exploration progress with stream counters", () => {
    expect(
      workflowExplorationProgressCard({
        workflowThreadId: "thread",
        explorationId: "exploration",
        graphNodeId: "agent-exploration",
        eventType: "exploration.provider.progress",
        phase: "provider",
        status: "running",
        message: "Pi is exploring: output 512 chars.",
        turn: 2,
        outputChars: 512,
        thinkingChars: 1024,
        idleElapsedMs: 1_500,
        idleTimeoutMs: 60_000,
        updatedAt: "2026-05-05T00:00:00.000Z",
      }),
    ).toMatchObject({
      title: "Exploration running",
      tone: "running",
      labels: ["Provider", "turn 2", "output 512 chars", "thinking 1,024 chars", "idle 2s / 1m"],
      graphNodeId: "agent-exploration",
    });
  });
});

function trace(input: {
  id?: string;
  createdAt?: string;
  summary?: string;
  observedCalls?: unknown[];
  requiredGrants?: string[];
  dataShapes?: string[];
  successfulPatterns?: string[];
  unresolvedQuestions?: string[];
  graphSummary?: string;
  deterministicSourceStrategy?: string;
  budgets?: Record<string, number>;
  status?: WorkflowExplorationTraceSummary["status"];
  error?: string;
  updatedAt?: string;
}): WorkflowExplorationTraceSummary {
  return {
    id: input.id ?? "trace",
    workflowThreadId: "thread",
    explorationId: "exploration",
    explorationNodeId: "agent-exploration",
    request: "Review the last 100 emails and write a categorized report.",
    model: "zai-org/GLM-5.1-FP8",
    capabilityManifest: {
      budgets: input.budgets ?? {
        maxModelTurns: 6,
        maxToolCalls: 4,
        maxConnectorCalls: 4,
        maxAmbientCalls: 2,
        maxElapsedMs: 180_000,
      },
    },
    observations: [{ action: "call_connector", name: "google.gmail.listMessages", status: "succeeded" }],
    events: [],
    status: input.status ?? "succeeded",
    error: input.error,
    distillation: {
      summary: input.summary ?? "Exploration summary",
      observedCalls: input.observedCalls ?? [],
      requiredGrants: input.requiredGrants ?? [],
      dataShapes: input.dataShapes ?? [],
      successfulPatterns: input.successfulPatterns ?? [],
      unresolvedQuestions: input.unresolvedQuestions ?? [],
      recommendedGraph: { summary: input.graphSummary ?? "" },
      deterministicSourceStrategy: input.deterministicSourceStrategy ?? "",
    },
    createdAt: input.createdAt ?? "2026-05-05T00:00:00.000Z",
    updatedAt: input.updatedAt,
  };
}
