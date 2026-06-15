import { describe, expect, it } from "vitest";
import type { ChatMessage, PlannerPlanArtifact } from "../shared/types";
import {
  buildPlannerDurableRepairPrompt,
  PLANNER_DURABLE_REPAIR_PROMPT_MARKER,
  plannerDurableRepairAttemptCount,
  plannerDurableFallbackWarnings,
} from "./plannerDurableRepair";

describe("planner durable repair", () => {
  const artifact: PlannerPlanArtifact = {
    id: "plan-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "durable_generating",
    title: "Planner Mode",
    summary: "Build a durable plan.",
    content: "# Planner Mode\n\nShip the plan.",
    steps: [{ id: "step-1", title: "Validate HTML." }],
    openQuestions: [],
    risks: [],
    verification: [],
    diagrams: [{ id: "architecture", title: "Architecture", kind: "architecture", nodes: [{ id: "ui", label: "UI" }], edges: [] }],
    decisionQuestions: [
      {
        id: "format",
        question: "Which artifact format should be used?",
        recommendedOptionId: "html",
        required: true,
        options: [
          { id: "html", label: "HTML", description: "Previewable." },
          { id: "pdf", label: "PDF", description: "Portable." },
        ],
        answer: { kind: "option", optionId: "html", answeredAt: "2026-05-11T00:00:00.000Z" },
      },
    ],
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
  };

  it("counts existing repair prompts in user-visible thread messages", () => {
    const messages = [
      { role: "user", content: "Plan this" },
      { role: "assistant", content: PLANNER_DURABLE_REPAIR_PROMPT_MARKER },
      { role: "user", content: `${PLANNER_DURABLE_REPAIR_PROMPT_MARKER}\nRepair please.` },
    ] as ChatMessage[];

    expect(plannerDurableRepairAttemptCount(messages)).toBe(1);
  });

  it("builds a focused repair prompt with validation diagnostics and diagram contract", () => {
    const prompt = buildPlannerDurableRepairPrompt({
      artifact,
      validation: {
        ok: false,
        checkedAt: "2026-05-11T00:00:01.000Z",
        errors: [{ code: "browser-svg-zero-size", section: "svg-1", message: "SVG rendered at zero size." }],
        warnings: [{ code: "browser-svg-long-label", section: "svg-1", message: "Label may overflow." }],
      },
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain(PLANNER_DURABLE_REPAIR_PROMPT_MARKER);
    expect(prompt).toContain("attempt 1 of 2");
    expect(prompt).toContain("browser-svg-zero-size (svg-1): SVG rendered at zero size.");
    expect(prompt).toContain("Which artifact format should be used?: HTML - Previewable.");
    expect(prompt).toContain("ambient-planner-diagrams");
    expect(prompt).toContain("Do not implement");
  });

  it("summarizes fallback warnings from validation errors", () => {
    expect(
      plannerDurableFallbackWarnings({
        ok: false,
        checkedAt: "2026-05-11T00:00:01.000Z",
        errors: [{ code: "browser-svg-zero-size", message: "Zero." }],
        warnings: [],
      }),
    ).toEqual([
      {
        code: "pi-diagram-fallback-used",
        section: "diagram-gallery",
        message: "Pi-authored diagram specs were replaced with deterministic fallback diagrams after validation failed: browser-svg-zero-size.",
      },
    ]);
  });
});
