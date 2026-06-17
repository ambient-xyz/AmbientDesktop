import type { ChatMessage, PlannerDecisionQuestion, PlannerPlanArtifact } from "../../shared/types";

export const PLANNER_DURABLE_REVISION_PROMPT_MARKER = "[ambient-planner-durable-revision]";

export type PlannerPlanArtifactContentUpdate = Pick<
  PlannerPlanArtifact,
  "sourceMessageId" | "title" | "summary" | "content" | "steps" | "openQuestions" | "risks" | "verification" | "warnings" | "diagrams"
>;

export interface PlannerFinalizationSourceArtifactLookup {
  threadId: string;
  prompt: string;
  getArtifactById: (artifactId: string) => PlannerPlanArtifact;
  listThreadArtifacts: (threadId: string) => PlannerPlanArtifact[];
}

export interface PlannerDecisionQuestionsForFinalArtifactInput {
  threadId: string;
  messages: ChatMessage[];
  sourceMessageId: string;
  parsedQuestions: PlannerDecisionQuestion[];
  listThreadArtifacts: (threadId: string) => PlannerPlanArtifact[];
}

export function plannerFinalizationArtifactIdsFromPrompt(prompt: string): string[] {
  const ids = new Set<string>();
  for (const match of prompt.matchAll(/(?:Source artifact id|Artifact id):\s*([^\s]+)/gi)) {
    const id = match[1]?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

export function plannerDurableRevisionArtifactIdFromPrompt(prompt: string): string | undefined {
  if (!prompt.includes(PLANNER_DURABLE_REVISION_PROMPT_MARKER)) return undefined;
  return prompt.match(/Artifact id:\s*([^\s]+)/i)?.[1]?.trim();
}

export function plannerDurableRevisionArtifactIdForSourceMessage(messages: ChatMessage[], sourceMessageId: string): string | undefined {
  return plannerDurableRevisionArtifactIdFromPrompt(plannerPriorUserPromptForSourceMessage(messages, sourceMessageId));
}

export function isPlannerFinalizationPrompt(prompt: string): boolean {
  return (
    prompt.includes("Durable plan output:") ||
    prompt.includes("Produce the final durable plan") ||
    prompt.startsWith("Refine the Planner Mode plan")
  );
}

export function plannerFinalizationSourceArtifactsFromPrompt(input: PlannerFinalizationSourceArtifactLookup): PlannerPlanArtifact[] {
  if (!isPlannerFinalizationPrompt(input.prompt) && !input.prompt.includes(PLANNER_DURABLE_REVISION_PROMPT_MARKER)) return [];
  const artifactsById = new Map<string, PlannerPlanArtifact>();
  for (const artifactId of plannerFinalizationArtifactIdsFromPrompt(input.prompt)) {
    try {
      const artifact = input.getArtifactById(artifactId);
      if (artifact.threadId === input.threadId && artifact.finalizationAttempt?.status === "running") artifactsById.set(artifact.id, artifact);
    } catch {
      // Ignore stale prompt references; fallback below handles legacy prompts without ids.
    }
  }
  if (artifactsById.size > 0) return [...artifactsById.values()];
  if (!isPlannerFinalizationPrompt(input.prompt)) return [];
  return input
    .listThreadArtifacts(input.threadId)
    .filter((artifact) => artifact.status === "ready" && (artifact.workflowState === "finalizing" || artifact.finalizationAttempt?.status === "running"));
}

export function mergePlannerDecisionQuestionsWithInheritedAnswers(
  parsedQuestions: PlannerDecisionQuestion[],
  inheritedQuestions: PlannerDecisionQuestion[],
): PlannerDecisionQuestion[] {
  if (inheritedQuestions.length === 0) return parsedQuestions;
  if (parsedQuestions.length === 0) return inheritedQuestions;

  const inheritedById = new Map(inheritedQuestions.map((question) => [question.id, question]));
  const inheritedByQuestion = new Map(inheritedQuestions.map((question) => [question.question.trim().toLowerCase(), question]));
  const merged = parsedQuestions.map((question) => {
    const inherited = inheritedById.get(question.id) ?? inheritedByQuestion.get(question.question.trim().toLowerCase());
    return inherited?.answer ? inherited : question;
  });
  const mergedIds = new Set(merged.map((question) => question.id));
  return [...merged, ...inheritedQuestions.filter((question) => question.answer && !mergedIds.has(question.id))];
}

export function plannerDecisionQuestionsForFinalArtifact(input: PlannerDecisionQuestionsForFinalArtifactInput): PlannerDecisionQuestion[] {
  if (!isPlannerFinalizationResponseForSourceMessage(input.messages, input.sourceMessageId)) return input.parsedQuestions;
  const inheritedQuestions =
    input
      .listThreadArtifacts(input.threadId)
      .find((artifact) => artifact.decisionQuestions.some((question) => question.answer))
      ?.decisionQuestions ?? [];
  return mergePlannerDecisionQuestionsWithInheritedAnswers(input.parsedQuestions, inheritedQuestions);
}

export function plannerPriorUserPromptForSourceMessage(messages: ChatMessage[], sourceMessageId: string): string {
  const sourceIndex = messages.findIndex((message) => message.id === sourceMessageId);
  const priorMessages = sourceIndex >= 0 ? messages.slice(0, sourceIndex) : messages;
  return [...priorMessages].reverse().find((message) => message.role === "user")?.content ?? "";
}

export function isPlannerFinalizationResponseForSourceMessage(messages: ChatMessage[], sourceMessageId: string): boolean {
  return isPlannerFinalizationPrompt(plannerPriorUserPromptForSourceMessage(messages, sourceMessageId));
}
