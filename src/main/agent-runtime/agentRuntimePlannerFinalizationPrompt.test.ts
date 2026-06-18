import { describe, expect, it } from "vitest";
import type { PlannerDecisionQuestion, PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import {
  isPlannerFinalizationPrompt,
  isPlannerFinalizationResponseForSourceMessage,
  mergePlannerDecisionQuestionsWithInheritedAnswers,
  PLANNER_DURABLE_REVISION_PROMPT_MARKER,
  plannerDecisionQuestionsForFinalArtifact,
  plannerDurableRevisionArtifactIdForSourceMessage,
  plannerDurableRevisionArtifactIdFromPrompt,
  plannerFinalizationArtifactIdsFromPrompt,
  plannerFinalizationSourceArtifactsFromPrompt,
  plannerPriorUserPromptForSourceMessage,
} from "./agentRuntimePlannerFinalizationPrompt";

describe("agentRuntimePlannerFinalizationPrompt", () => {
  const message = (id: string, role: ChatMessage["role"], content: string): ChatMessage => ({
    id,
    threadId: "thread-1",
    role,
    content,
    createdAt: "2026-05-01T00:00:00.000Z",
  });

  const decisionQuestion = (
    id: string,
    question: string,
    answer?: PlannerDecisionQuestion["answer"],
  ): PlannerDecisionQuestion => ({
    id,
    question,
    recommendedOptionId: "yes",
    required: true,
    options: [{ id: "yes", label: "Yes", description: "Proceed" }],
    ...(answer ? { answer } : {}),
  });

  const optionAnswer = (optionId = "yes"): PlannerDecisionQuestion["answer"] => ({
    kind: "option",
    optionId,
    answeredAt: "2026-05-01T00:00:00.000Z",
  });

  const plannerArtifact = (id: string, overrides: Partial<PlannerPlanArtifact> = {}): PlannerPlanArtifact => ({
    id,
    threadId: "thread-1",
    sourceMessageId: `message-${id}`,
    status: "ready",
    workflowState: "finalizing",
    finalizationAttempt: {
      id: `attempt-${id}`,
      status: "running",
      startedAt: "2026-05-01T00:00:00.000Z",
    },
    title: id,
    summary: "",
    content: "",
    steps: [],
    openQuestions: [],
    risks: [],
    verification: [],
    decisionQuestions: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  });

  const sourceArtifactsForPrompt = (prompt: string, artifacts: PlannerPlanArtifact[]) => {
    const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    const lookedUpIds: string[] = [];
    const listedThreadIds: string[] = [];
    const result = plannerFinalizationSourceArtifactsFromPrompt({
      threadId: "thread-1",
      prompt,
      getArtifactById: (artifactId) => {
        lookedUpIds.push(artifactId);
        const artifact = artifactsById.get(artifactId);
        if (!artifact) throw new Error("missing artifact");
        return artifact;
      },
      listThreadArtifacts: (threadId) => {
        listedThreadIds.push(threadId);
        return artifacts.filter((artifact) => artifact.threadId === threadId);
      },
    });
    return { result, lookedUpIds, listedThreadIds };
  };

  it("extracts unique source and target artifact ids from finalization prompts", () => {
    expect(plannerFinalizationArtifactIdsFromPrompt([
      "Produce the final durable plan.",
      "Source artifact id: artifact-source",
      "Artifact id: artifact-durable",
      "source artifact id: artifact-source",
    ].join("\n"))).toEqual(["artifact-source", "artifact-durable"]);
  });

  it("preserves the existing token-based artifact id parsing behavior", () => {
    expect(plannerFinalizationArtifactIdsFromPrompt("Artifact id: \nSource artifact id: artifact-source")).toEqual(["Source", "artifact-source"]);
  });

  it("extracts durable revision artifact id only when the marker is present", () => {
    expect(plannerDurableRevisionArtifactIdFromPrompt([
      PLANNER_DURABLE_REVISION_PROMPT_MARKER,
      "Artifact id: artifact-durable",
    ].join("\n"))).toBe("artifact-durable");
    expect(plannerDurableRevisionArtifactIdFromPrompt("Artifact id: artifact-durable")).toBeUndefined();
  });

  it("extracts durable revision artifact ids from the prior user prompt for a source message", () => {
    const messages = [
      message("user-1", "user", "Initial planner prompt"),
      message("assistant-1", "assistant", "Draft plan"),
      message("user-2", "user", [
        PLANNER_DURABLE_REVISION_PROMPT_MARKER,
        "Artifact id: artifact-durable",
      ].join("\n")),
      message("assistant-2", "assistant", "Revision JSON"),
    ];

    expect(plannerDurableRevisionArtifactIdForSourceMessage(messages, "assistant-2")).toBe("artifact-durable");
    expect(plannerDurableRevisionArtifactIdForSourceMessage(messages, "user-1")).toBeUndefined();
    expect(plannerDurableRevisionArtifactIdForSourceMessage(messages, "missing-source-message")).toBe("artifact-durable");
    expect(plannerDurableRevisionArtifactIdForSourceMessage([
      message("user-1", "user", "Artifact id: artifact-durable"),
      message("assistant-1", "assistant", "Not a marked revision"),
    ], "assistant-1")).toBeUndefined();
  });

  it("classifies existing planner finalization prompt markers", () => {
    expect(isPlannerFinalizationPrompt("Durable plan output:\n<html></html>")).toBe(true);
    expect(isPlannerFinalizationPrompt("Please Produce the final durable plan now")).toBe(true);
    expect(isPlannerFinalizationPrompt("Refine the Planner Mode plan with these answers")).toBe(true);
    expect(isPlannerFinalizationPrompt("Before you refine the Planner Mode plan, summarize the thread")).toBe(false);
    expect(isPlannerFinalizationPrompt("Regular planner draft request")).toBe(false);
  });

  it("merges inherited planner decision answers by id and normalized question text", () => {
    const parsedById = decisionQuestion("asset-strategy", "Choose an asset strategy?");
    const parsedByQuestion = decisionQuestion("new-copy-id", "How should copy be reviewed?");
    const parsedUnchanged = decisionQuestion("new-question", "What should happen next?");
    const inheritedById = decisionQuestion("asset-strategy", "Old asset wording?", optionAnswer("yes"));
    const inheritedByQuestion = decisionQuestion("old-copy-id", "  how should copy be reviewed?  ", optionAnswer("yes"));
    const inheritedExtra = decisionQuestion("extra-answer", "Who signs off?", optionAnswer("yes"));
    const inheritedUnanswered = decisionQuestion("extra-unanswered", "What is the backup plan?");

    expect(mergePlannerDecisionQuestionsWithInheritedAnswers(
      [parsedById, parsedByQuestion, parsedUnchanged],
      [inheritedById, inheritedByQuestion, inheritedExtra, inheritedUnanswered],
    )).toEqual([inheritedById, inheritedByQuestion, parsedUnchanged, inheritedExtra]);
  });

  it("preserves existing planner decision merge shortcuts", () => {
    const parsedQuestions = [decisionQuestion("parsed", "Parsed?")];
    const inheritedQuestions = [decisionQuestion("inherited", "Inherited?", optionAnswer())];

    expect(mergePlannerDecisionQuestionsWithInheritedAnswers(parsedQuestions, [])).toBe(parsedQuestions);
    expect(mergePlannerDecisionQuestionsWithInheritedAnswers([], inheritedQuestions)).toBe(inheritedQuestions);
  });

  it("inherits answered planner decision questions for final artifacts", () => {
    const parsedByQuestion = decisionQuestion("new-copy-id", "How should copy be reviewed?");
    const inheritedByQuestion = decisionQuestion("old-copy-id", "how should copy be reviewed?", optionAnswer());
    const messages = [
      message("user-1", "user", "Produce the final durable plan"),
      message("assistant-1", "assistant", "Final durable plan"),
    ];
    const listedThreadIds: string[] = [];

    expect(plannerDecisionQuestionsForFinalArtifact({
      threadId: "thread-1",
      messages,
      sourceMessageId: "assistant-1",
      parsedQuestions: [parsedByQuestion],
      listThreadArtifacts: (threadId) => {
        listedThreadIds.push(threadId);
        return [plannerArtifact("source", { decisionQuestions: [inheritedByQuestion] })];
      },
    })).toEqual([inheritedByQuestion]);
    expect(listedThreadIds).toEqual(["thread-1"]);
  });

  it("does not list planner artifacts for non-finalization decision questions", () => {
    const parsedQuestions = [decisionQuestion("parsed", "Parsed?")];
    const messages = [
      message("user-1", "user", "Regular planner draft request"),
      message("assistant-1", "assistant", "Draft plan"),
    ];
    const listedThreadIds: string[] = [];

    expect(plannerDecisionQuestionsForFinalArtifact({
      threadId: "thread-1",
      messages,
      sourceMessageId: "assistant-1",
      parsedQuestions,
      listThreadArtifacts: (threadId) => {
        listedThreadIds.push(threadId);
        return [plannerArtifact("source")];
      },
    })).toBe(parsedQuestions);
    expect(listedThreadIds).toEqual([]);
  });

  it("selects explicitly referenced running planner finalization source artifacts", () => {
    const source = plannerArtifact("source-artifact");
    const generated = plannerArtifact("generated-artifact", { finalizationAttempt: undefined });
    const otherThread = plannerArtifact("other-thread-artifact", { threadId: "thread-2" });
    const completed = plannerArtifact("completed-artifact", {
      finalizationAttempt: {
        id: "attempt-completed",
        status: "completed",
        startedAt: "2026-05-01T00:00:00.000Z",
      },
    });
    const { result, lookedUpIds, listedThreadIds } = sourceArtifactsForPrompt([
      "Produce the final durable plan.",
      "Source artifact id: source-artifact",
      "Artifact id: generated-artifact",
      "Source artifact id: missing-artifact",
      "Source artifact id: other-thread-artifact",
      "Source artifact id: completed-artifact",
      "source artifact id: source-artifact",
    ].join("\n"), [source, generated, otherThread, completed]);

    expect(result).toEqual([source]);
    expect(lookedUpIds).toEqual(["source-artifact", "generated-artifact", "missing-artifact", "other-thread-artifact", "completed-artifact"]);
    expect(listedThreadIds).toEqual([]);
  });

  it("falls back to active ready artifacts for legacy planner finalization prompts", () => {
    const finalizing = plannerArtifact("finalizing");
    const runningAttempt = plannerArtifact("running-attempt", { workflowState: "draft" });
    const implemented = plannerArtifact("implemented", { status: "implemented" });
    const inactive = plannerArtifact("inactive", { workflowState: "draft", finalizationAttempt: undefined });
    const { result, lookedUpIds, listedThreadIds } = sourceArtifactsForPrompt(
      "Produce the final durable plan.",
      [finalizing, runningAttempt, implemented, inactive],
    );

    expect(result).toEqual([finalizing, runningAttempt]);
    expect(lookedUpIds).toEqual([]);
    expect(listedThreadIds).toEqual(["thread-1"]);
  });

  it("does not fall back from durable revision prompts without valid explicit artifacts", () => {
    const { result, lookedUpIds, listedThreadIds } = sourceArtifactsForPrompt([
      PLANNER_DURABLE_REVISION_PROMPT_MARKER,
      "Artifact id: missing-artifact",
    ].join("\n"), [plannerArtifact("active-artifact")]);

    expect(result).toEqual([]);
    expect(lookedUpIds).toEqual(["missing-artifact"]);
    expect(listedThreadIds).toEqual([]);
  });

  it("does not query artifacts for non-finalization prompts", () => {
    const { result, lookedUpIds, listedThreadIds } = sourceArtifactsForPrompt(
      "Please draft a plan.",
      [plannerArtifact("active-artifact")],
    );

    expect(result).toEqual([]);
    expect(lookedUpIds).toEqual([]);
    expect(listedThreadIds).toEqual([]);
  });

  it("finds the prior user prompt before a planner source message", () => {
    const messages = [
      message("user-1", "user", "Initial planner prompt"),
      message("assistant-1", "assistant", "Draft plan"),
      message("user-2", "user", "Produce the final durable plan"),
      message("assistant-2", "assistant", "Final durable plan"),
    ];

    expect(plannerPriorUserPromptForSourceMessage(messages, "assistant-2")).toBe("Produce the final durable plan");
    expect(plannerPriorUserPromptForSourceMessage(messages, "user-1")).toBe("");
    expect(plannerPriorUserPromptForSourceMessage(messages, "missing-source-message")).toBe("Produce the final durable plan");
  });

  it("classifies planner finalization responses from the prior user prompt", () => {
    const messages = [
      message("user-1", "user", "Initial planner prompt"),
      message("assistant-1", "assistant", "Draft plan"),
      message("user-2", "user", "Produce the final durable plan"),
      message("assistant-2", "assistant", "Final durable plan"),
    ];

    expect(isPlannerFinalizationResponseForSourceMessage(messages, "assistant-2")).toBe(true);
    expect(isPlannerFinalizationResponseForSourceMessage(messages, "user-1")).toBe(false);
    expect(isPlannerFinalizationResponseForSourceMessage(messages, "missing-source-message")).toBe(true);
    expect(isPlannerFinalizationResponseForSourceMessage([
      message("user-1", "user", "Regular planner draft request"),
      message("assistant-1", "assistant", "Draft plan"),
    ], "assistant-1")).toBe(false);
  });
});
