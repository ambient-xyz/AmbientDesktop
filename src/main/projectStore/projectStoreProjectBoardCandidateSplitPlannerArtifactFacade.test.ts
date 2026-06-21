import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board candidate split and planner artifact facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("splits a draft candidate into child candidates without creating tasks", () => {
    const thread = store.createThread("Candidate split thread");
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\nSplit the candidate." });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Split candidate",
      summary: "Initial summary.",
      content: message.content,
      steps: [{ id: "step-1", title: "Build and verify the draft board." }],
      openQuestions: [],
      risks: [],
      verification: ["Run unit tests.", "Run visual smoke."],
      decisionQuestions: [],
    });

    store.createProjectBoard({ title: "Split board" });
    const card = store.updateProjectBoardCard({
      cardId: store.promotePlannerPlanToBoard(artifact.id).id,
      acceptanceCriteria: ["Build the draft board.", "Verify the draft board."],
    });
    const children = store.splitProjectBoardCard(card.id);
    const splitAgain = store.splitProjectBoardCard(card.id);

    expect(children.map((item) => item.title)).toEqual(["Build the draft board.", "Verify the draft board."]);
    expect(splitAgain.map((item) => item.id)).toEqual(children.map((item) => item.id));
    expect(children).toEqual([
      expect.objectContaining({
        status: "draft",
        candidateStatus: "ready_to_create",
        sourceKind: "planner_plan",
        sourceThreadId: thread.id,
        sourceMessageId: message.id,
        labels: expect.arrayContaining(["plan", "split"]),
        orchestrationTaskId: undefined,
        acceptanceCriteria: ["Build the draft board."],
      }),
      expect.objectContaining({
        status: "draft",
        candidateStatus: "ready_to_create",
        orchestrationTaskId: undefined,
        acceptanceCriteria: ["Verify the draft board."],
      }),
    ]);
    expect(store.getProjectBoardCard(card.id).candidateStatus).toBe("duplicate");
    expect(store.getActiveProjectBoard()?.cards.filter((item) => item.orchestrationTaskId)).toEqual([]);
    expect(store.getActiveProjectBoard()?.events?.filter((event) => event.kind === "card_split")).toEqual([
      expect.objectContaining({
        title: "Candidate split",
        entityId: card.id,
        metadata: expect.objectContaining({ parentCardId: card.id, childCardIds: children.map((item) => item.id) }),
      }),
    ]);
  });

  it("persists thread collaboration mode and planner plan artifacts", () => {
    const thread = store.createThread("Plan me");
    const plannedThread = store.updateThreadSettings(thread.id, { collaborationMode: "planner" });
    const message = store.addMessage({ threadId: thread.id, role: "assistant", content: "## Plan\n1. Inspect files." });

    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Plan",
      summary: "Inspect first.",
      content: message.content,
      steps: [{ id: "step-1", title: "Inspect files." }],
      openQuestions: [],
      risks: [],
      verification: ["Run tests."],
      warnings: ["Planner question block had one malformed option."],
      diagrams: [
        {
          id: "architecture",
          title: "Architecture",
          kind: "architecture",
          purpose: "Show the UI and store boundary.",
          nodes: [
            { id: "ui", label: "UI", role: "Displays decisions." },
            { id: "store", label: "Store", role: "Persists artifacts." },
          ],
          edges: [{ from: "ui", to: "store", label: "IPC" }],
        },
      ],
      decisionQuestions: [
        {
          id: "asset-strategy",
          question: "How should assets work?",
          recommendedOptionId: "canvas",
          required: true,
          options: [
            { id: "canvas", label: "Canvas", description: "Draw everything in code." },
            { id: "sprites", label: "Sprites", description: "Use image assets." },
          ],
        },
      ],
    });

    expect(plannedThread.collaborationMode).toBe("planner");
    const listedArtifacts = store.listPlannerPlanArtifacts(thread.id);
    expect(listedArtifacts).toEqual([expect.objectContaining({ id: artifact.id, status: "ready", workflowState: "questions_pending" })]);
    expect(listedArtifacts[0].decisionQuestions[0]).toMatchObject({
      id: "asset-strategy",
      recommendedOptionId: "canvas",
      required: true,
    });
    expect(listedArtifacts[0].warnings).toEqual(["Planner question block had one malformed option."]);
    expect(listedArtifacts[0].diagrams).toEqual([
      expect.objectContaining({
        id: "architecture",
        title: "Architecture",
        kind: "architecture",
        nodes: [
          { id: "ui", label: "UI", role: "Displays decisions." },
          { id: "store", label: "Store", role: "Persists artifacts." },
        ],
        edges: [{ from: "ui", to: "store", label: "IPC" }],
      }),
    ]);
    expect(listedArtifacts[0].decisionQuestions[0].answer).toBeUndefined();

    const answered = store.answerPlannerDecisionQuestion(artifact.id, "asset-strategy", {
      kind: "option",
      optionId: "canvas",
    });
    expect(answered.decisionQuestions[0].answer).toEqual(
      expect.objectContaining({
        kind: "option",
        optionId: "canvas",
      }),
    );
    expect(answered.workflowState).toBe("answers_complete");
    const finalizing = store.updatePlannerPlanArtifact(answered.id, { workflowState: "finalizing" });
    expect(finalizing.workflowState).toBe("finalizing");
    expect(finalizing.finalizationAttempt).toEqual(
      expect.objectContaining({
        status: "running",
        id: expect.any(String),
        startedAt: expect.any(String),
      }),
    );
    const repeatedFinalizing = store.updatePlannerPlanArtifact(answered.id, { workflowState: "finalizing" });
    expect(repeatedFinalizing.finalizationAttempt?.id).toBe(finalizing.finalizationAttempt?.id);
    const failedFinalization = store.updatePlannerPlanArtifact(answered.id, { workflowState: "failed" });
    expect(failedFinalization.finalizationAttempt).toEqual(
      expect.objectContaining({
        id: finalizing.finalizationAttempt?.id,
        status: "failed",
        completedAt: expect.any(String),
      }),
    );
    const answeredCopy = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Answered plan copy",
      summary: "",
      content: "1. Preserve answered decisions.",
      steps: [{ id: "step-1", title: "Preserve answered decisions." }],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: answered.decisionQuestions,
    });
    expect(answeredCopy.workflowState).toBe("answers_complete");
    expect(answeredCopy.decisionQuestions[0].answer).toEqual(
      expect.objectContaining({
        kind: "option",
        optionId: "canvas",
      }),
    );
    const copyFinalizing = store.updatePlannerPlanArtifact(answeredCopy.id, { workflowState: "finalizing" });
    const completedFinalization = store.finishPlannerPlanFinalizationAttempt(answeredCopy.id, { status: "completed" });
    expect(completedFinalization.workflowState).toBe("answers_complete");
    expect(completedFinalization.finalizationAttempt).toEqual(
      expect.objectContaining({
        id: copyFinalizing.finalizationAttempt?.id,
        status: "completed",
        completedAt: expect.any(String),
      }),
    );
    const refinalizingCopy = store.updatePlannerPlanArtifact(answeredCopy.id, { workflowState: "finalizing" });
    expect(refinalizingCopy.finalizationAttempt?.id).not.toBe(copyFinalizing.finalizationAttempt?.id);

    const nextArtifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Plan v2",
      summary: "",
      content: "1. Inspect again.",
      steps: [{ id: "step-1", title: "Inspect again." }],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: [],
    });

    expect(store.getPlannerPlanArtifact(artifact.id).status).toBe("superseded");
    expect(nextArtifact.workflowState).toBe("draft");
    const durable = store.setPlannerPlanDurableArtifact(nextArtifact.id, {
      path: ".ambient/board/plans/Plan-DurablePlan.html",
      generatedAt: "2026-05-11T00:00:00.000Z",
      validation: {
        ok: true,
        checkedAt: "2026-05-11T00:00:00.000Z",
        errors: [],
        warnings: [],
      },
    });
    expect(durable.workflowState).toBe("durable_ready");
    expect(durable.durableArtifactPath).toBe(".ambient/board/plans/Plan-DurablePlan.html");
    expect(durable.durableArtifactGeneratedAt).toBe("2026-05-11T00:00:00.000Z");
    expect(durable.durableArtifactValidation).toEqual({
      ok: true,
      checkedAt: "2026-05-11T00:00:00.000Z",
      errors: [],
      warnings: [],
    });
    const fallbackDurable = store.setPlannerPlanDurableArtifact(nextArtifact.id, {
      path: ".ambient/board/plans/Plan-Fallback-DurablePlan.html",
      generatedAt: "2026-05-11T00:00:01.000Z",
      workflowState: "durable_ready_with_fallbacks",
      validation: {
        ok: true,
        checkedAt: "2026-05-11T00:00:01.000Z",
        errors: [],
        warnings: [{ code: "pi-diagram-fallback-used", section: "diagram-gallery", message: "Fallback used." }],
      },
    });
    expect(fallbackDurable.workflowState).toBe("durable_ready_with_fallbacks");
    expect(fallbackDurable.durableArtifactPath).toBe(".ambient/board/plans/Plan-Fallback-DurablePlan.html");
    expect(fallbackDurable.durableArtifactValidation?.warnings[0]).toEqual({
      code: "pi-diagram-fallback-used",
      section: "diagram-gallery",
      message: "Fallback used.",
    });
    const invalidDurable = store.setPlannerPlanDurableArtifactValidation(
      nextArtifact.id,
      {
        ok: false,
        checkedAt: "2026-05-11T00:00:01.000Z",
        errors: [{ code: "missing-section", section: "diagram-gallery", message: "Missing diagram gallery." }],
        warnings: [],
      },
      "failed",
    );
    expect(invalidDurable.workflowState).toBe("failed");
    expect(invalidDurable.durableArtifactValidation?.errors[0]).toEqual({
      code: "missing-section",
      section: "diagram-gallery",
      message: "Missing diagram gallery.",
    });
    expect(store.updatePlannerPlanArtifactStatus(nextArtifact.id, "implemented").status).toBe("implemented");
  });

  it("repairs planner question blocks that were stored as generic json", () => {
    const thread = store.createThread("Broken planner questions");
    const brokenContent = `# Plan

Build the game.

\`\`\`json
<ambient-planner-questions>
{
  "questions": [
    {
      "id": "build-tool",
      "question": "Which build tool should the project use?",
      "recommendedOptionId": "vite-ts",
      "required": true,
      "options": [
        {
          "id": "vite-ts",
          "label": "Vite + TypeScript",
          "description": "Use typed Vite defaults."
        },
        {
          "id": "vite-js",
          "label": "Vite + JavaScript",
          "description": "Use simpler JavaScript defaults."
        }
      ]
    }
  ]
}
</ambient-planner-questions>
\`\`\``;
    const message = store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: brokenContent,
      metadata: { kind: "planner-plan" },
    });
    const artifact = store.createPlannerPlanArtifact({
      threadId: thread.id,
      sourceMessageId: message.id,
      title: "Plan",
      summary: "Build the game.",
      content: brokenContent,
      steps: [],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: [],
    });

    store.close();
    store.openWorkspace(workspacePath);

    const repaired = store.getPlannerPlanArtifact(artifact.id);
    expect(repaired.content).not.toContain("ambient-planner-questions");
    expect(repaired.decisionQuestions).toEqual([
      expect.objectContaining({
        id: "build-tool",
        question: "Which build tool should the project use?",
        recommendedOptionId: "vite-ts",
        required: true,
      }),
    ]);
    expect(store.listMessages(thread.id).at(-1)?.content).not.toContain("ambient-planner-questions");
  });
});
