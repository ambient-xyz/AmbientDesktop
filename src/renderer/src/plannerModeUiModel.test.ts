import { describe, expect, it } from "vitest";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import {
  parseCollaborationSlashCommand,
  parseSecretSlashCommand,
  PLANNER_DURABLE_REVISION_PROMPT_MARKER,
  plannerAnsweredDecisionCount,
  plannerCanRefineWithAdditionalFeedback,
  plannerDecisionAnswerStatusLabel,
  plannerDecisionFinalizationPrompt,
  plannerDurableRevisionPrompt,
  plannerImplementationGoalMode,
  plannerImplementationPrompt,
  plannerRefinementPrompt,
  plannerShouldAutoFinalizeAfterAnswer,
  plannerWorkflowStateLabel,
} from "./plannerModeUiModel";

describe("parseCollaborationSlashCommand", () => {
  it("switches planner mode without sending when /plan has no prompt", () => {
    expect(parseCollaborationSlashCommand("/plan", "agent")).toEqual({
      content: "",
      mode: "planner",
      settingsOnly: true,
    });
  });

  it("strips planner and agent commands from prompts", () => {
    expect(parseCollaborationSlashCommand("/plan inspect the auth flow", "agent")).toEqual({
      content: "inspect the auth flow",
      mode: "planner",
      settingsOnly: false,
    });
    expect(parseCollaborationSlashCommand("/agent implement it", "planner")).toEqual({
      content: "implement it",
      mode: "agent",
      settingsOnly: false,
    });
  });

  it("leaves normal prompts unchanged", () => {
    expect(parseCollaborationSlashCommand("please plan the change", "agent")).toEqual({
      content: "please plan the change",
      mode: "agent",
      settingsOnly: false,
    });
  });
});

describe("parseSecretSlashCommand", () => {
  it("parses secret dialog slash commands without capturing values", () => {
    expect(parseSecretSlashCommand("/secret brave-search BRAVE_API_KEY")).toEqual({
      isSecretCommand: true,
      packageName: "brave-search",
      envName: "BRAVE_API_KEY",
    });
    expect(parseSecretSlashCommand("/secret BRAVE_API_KEY")).toEqual({
      isSecretCommand: true,
      envName: "BRAVE_API_KEY",
    });
    expect(parseSecretSlashCommand("secret brave-search BRAVE_API_KEY")).toEqual({ isSecretCommand: false });
  });
});

describe("plannerImplementationPrompt", () => {
  it("creates an implementation prompt with tracked steps", () => {
    const artifact: PlannerPlanArtifact = {
      id: "plan-1",
      threadId: "thread-1",
      sourceMessageId: "message-1",
      status: "ready",
      workflowState: "answers_complete",
      title: "Planner Mode",
      summary: "Add planner mode.",
      content: "1. Persist mode.\n2. Gate tools.",
      steps: [
        { id: "step-1", title: "Persist mode." },
        { id: "step-2", title: "Gate tools." },
      ],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: [
        {
          id: "asset-strategy",
          question: "How should v1 handle art assets?",
          recommendedOptionId: "canvas",
          required: false,
          options: [
            { id: "canvas", label: "Canvas primitives", description: "Fastest path for a self-contained v1." },
            { id: "sprites", label: "Generated sprites", description: "More polish with extra asset work." },
          ],
          answer: { kind: "option", optionId: "canvas", answeredAt: "2026-05-01T00:00:00.000Z" },
        },
      ],
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    };

    const prompt = plannerImplementationPrompt(artifact);
    expect(prompt).toContain("Implement the approved Planner Mode plan");
    expect(prompt).toContain("Plan: Planner Mode");
    expect(prompt).toContain("Planner decisions:");
    expect(prompt).toContain("How should v1 handle art assets?: Canvas primitives - Fastest path for a self-contained v1.");
    expect(prompt).toContain("1. Persist mode.");
    expect(prompt).toContain("2. Gate tools.");
    expect(prompt).toContain("Pursue this as a durable implementation goal");
    expect(plannerImplementationGoalMode()).toEqual({ enabled: true });
    expect(plannerDecisionAnswerStatusLabel(artifact)).toBe("Planner decisions answered");
    expect(plannerAnsweredDecisionCount(artifact)).toBe(1);
    expect(plannerCanRefineWithAdditionalFeedback(artifact)).toBe(true);
    expect(plannerCanRefineWithAdditionalFeedback(artifact, true)).toBe(false);
    expect(plannerWorkflowStateLabel(artifact)).toBe("Answers complete");
    expect(plannerRefinementPrompt(artifact)).toContain("Refine the Planner Mode plan");
    expect(plannerRefinementPrompt(artifact)).toContain("Source artifact id: plan-1");
    expect(plannerRefinementPrompt(artifact)).toContain("ambient-planner-diagrams");
    expect(plannerRefinementPrompt(artifact)).toContain("architecture");
  });

  it("allows durable plan revision feedback even without answered decision questions", () => {
    const artifact: PlannerPlanArtifact = {
      id: "plan-2",
      threadId: "thread-1",
      sourceMessageId: "message-2",
      status: "ready",
      workflowState: "durable_ready",
      title: "Scientific Calculator",
      summary: "Build a calculator.",
      content: "Executive Summary\n\nBuild the calculator.\n\nVerification Plan\n\nRun tests.",
      steps: [],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: [],
      durableArtifactPath: ".ambient/board/plans/scientific-calculator-DurablePlan.html",
      durableArtifactGeneratedAt: "2026-05-01T00:00:00.000Z",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    };

    expect(plannerCanRefineWithAdditionalFeedback(artifact)).toBe(true);
    const prompt = plannerDurableRevisionPrompt(artifact, "Add a 55555 display blink easter egg.");
    expect(prompt).toContain(PLANNER_DURABLE_REVISION_PROMPT_MARKER);
    expect(prompt).toContain("Artifact id: plan-2");
    expect(prompt).toContain("Current durable path: .ambient/board/plans/scientific-calculator-DurablePlan.html");
    expect(prompt).toContain("Add a 55555 display blink easter egg.");
    expect(prompt).toContain("ambient-planner-revision");
    expect(prompt).toContain('"mode": "targeted_edit"');
    expect(prompt).toContain('mode: "full_rewrite"');
    expect(prompt).toContain("Prefer `mode: \"targeted_edit\"`");
    expect(prompt).toContain("Do not create a new sibling durable plan");
  });

  it("uses the durable revision contract when answered decisions finalize a plan", () => {
    const artifact: PlannerPlanArtifact = {
      id: "plan-3",
      threadId: "thread-1",
      sourceMessageId: "message-3",
      status: "ready",
      workflowState: "answers_complete",
      title: "Scientific Calculator",
      summary: "Build a calculator.",
      content: "Executive Summary\n\nBuild the calculator.\n\nVerification Plan\n\nRun tests.",
      steps: [],
      openQuestions: [],
      risks: [],
      verification: [],
      decisionQuestions: [
        {
          id: "scope",
          question: "Which scope should the plan use?",
          recommendedOptionId: "narrow",
          required: true,
          options: [
            { id: "narrow", label: "Narrow", description: "Keep the calculator focused." },
            { id: "broad", label: "Broad", description: "Include advanced functions." },
          ],
          answer: { kind: "option", optionId: "narrow", answeredAt: "2026-05-01T00:00:00.000Z" },
        },
      ],
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    };

    const prompt = plannerDecisionFinalizationPrompt(artifact);

    expect(prompt).toContain(PLANNER_DURABLE_REVISION_PROMPT_MARKER);
    expect(prompt).toContain("Artifact id: plan-3");
    expect(prompt).toContain("Apply the answered Planner decisions");
    expect(prompt).toContain("Preserve the current artifact identity");
    expect(prompt).toContain("Which scope should the plan use?: Narrow - Keep the calculator focused.");
    expect(prompt).toContain("ambient-planner-revision");
    expect(prompt).toContain('"mode": "targeted_edit"');
  });
});

describe("plannerShouldAutoFinalizeAfterAnswer", () => {
  const baseArtifact: PlannerPlanArtifact = {
    id: "plan-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "questions_pending",
    title: "Planner Mode",
    summary: "Add planner mode.",
    content: "Plan content.",
    steps: [],
    openQuestions: [],
    risks: [],
    verification: [],
    decisionQuestions: [
      {
        id: "scope",
        question: "Which scope should we use?",
        recommendedOptionId: "small",
        required: true,
        options: [
          { id: "small", label: "Small", description: "Fast." },
          { id: "large", label: "Large", description: "Thorough." },
        ],
      },
    ],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };

  it("starts auto-finalization when a required answer completes the decision set", () => {
    const after: PlannerPlanArtifact = {
      ...baseArtifact,
      workflowState: "answers_complete",
      decisionQuestions: [
        {
          ...baseArtifact.decisionQuestions[0],
          answer: { kind: "option", optionId: "small", answeredAt: "2026-05-01T00:00:01.000Z" },
        },
      ],
    };

    expect(plannerShouldAutoFinalizeAfterAnswer(baseArtifact, after, true)).toBe(true);
    expect(plannerShouldAutoFinalizeAfterAnswer(baseArtifact, after, false)).toBe(false);
    expect(
      plannerShouldAutoFinalizeAfterAnswer(
        baseArtifact,
        {
          ...after,
          finalizationAttempt: {
            id: "attempt-1",
            status: "running",
            startedAt: "2026-05-01T00:00:02.000Z",
          },
        },
        true,
      ),
    ).toBe(false);
  });

  it("waits when required questions are still unanswered", () => {
    const before: PlannerPlanArtifact = {
      ...baseArtifact,
      decisionQuestions: [
        ...baseArtifact.decisionQuestions,
        {
          id: "platform",
          question: "Which platform?",
          recommendedOptionId: "desktop",
          required: true,
          options: [
            { id: "desktop", label: "Desktop", description: "Native app." },
            { id: "web", label: "Web", description: "Browser app." },
          ],
        },
      ],
    };
    const after: PlannerPlanArtifact = {
      ...before,
      workflowState: "questions_pending",
      decisionQuestions: [
        {
          ...before.decisionQuestions[0],
          answer: { kind: "option", optionId: "small", answeredAt: "2026-05-01T00:00:01.000Z" },
        },
        before.decisionQuestions[1],
      ],
    };

    expect(plannerShouldAutoFinalizeAfterAnswer(before, after, true)).toBe(false);
  });

  it("allows optional-only decision sets to finalize after the first answer", () => {
    const before: PlannerPlanArtifact = {
      ...baseArtifact,
      workflowState: "answers_complete",
      decisionQuestions: [{ ...baseArtifact.decisionQuestions[0], required: false }],
    };
    const after: PlannerPlanArtifact = {
      ...before,
      workflowState: "answers_complete",
      decisionQuestions: [
        {
          ...before.decisionQuestions[0],
          answer: { kind: "option", optionId: "small", answeredAt: "2026-05-01T00:00:01.000Z" },
        },
      ],
    };

    expect(plannerShouldAutoFinalizeAfterAnswer(before, after, true)).toBe(true);
    expect(plannerShouldAutoFinalizeAfterAnswer(after, after, true)).toBe(false);
  });

  it("labels unanswered optional decisions as skipped while finalization runs", () => {
    const artifact: PlannerPlanArtifact = {
      ...baseArtifact,
      workflowState: "finalizing",
      finalizationAttempt: {
        id: "attempt-1",
        status: "running",
        startedAt: "2026-05-01T00:00:02.000Z",
      },
      decisionQuestions: [
        {
          ...baseArtifact.decisionQuestions[0],
          answer: { kind: "option", optionId: "small", answeredAt: "2026-05-01T00:00:01.000Z" },
        },
        {
          id: "polish",
          question: "How much polish?",
          recommendedOptionId: "standard",
          required: false,
          options: [
            { id: "standard", label: "Standard", description: "Ship the practical baseline." },
            { id: "extra", label: "Extra", description: "Spend more time on polish." },
          ],
        },
      ],
    };

    expect(plannerDecisionAnswerStatusLabel(artifact)).toBe("1 optional planner decision skipped");
  });
});
