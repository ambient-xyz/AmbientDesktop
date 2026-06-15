import type { CollaborationMode, PlannerDecisionQuestion, PlannerPlanArtifact } from "../../shared/types";

export interface CollaborationCommandResult {
  content: string;
  mode: CollaborationMode;
  settingsOnly: boolean;
}

export interface SecretSlashCommandResult {
  isSecretCommand: boolean;
  packageName?: string;
  envName?: string;
}

export const PLANNER_DURABLE_REVISION_PROMPT_MARKER = "[ambient-planner-durable-revision]";

export function parseCollaborationSlashCommand(raw: string, currentMode: CollaborationMode): CollaborationCommandResult {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\/(plan|planner|agent)(?:\s+([\s\S]*))?$/i);
  if (!match) return { content: trimmed, mode: currentMode, settingsOnly: false };

  const command = match[1].toLowerCase();
  const content = (match[2] ?? "").trim();
  const mode: CollaborationMode = command === "agent" ? "agent" : "planner";
  return {
    content,
    mode,
    settingsOnly: content.length === 0,
  };
}

export function parseSecretSlashCommand(raw: string): SecretSlashCommandResult {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\/secret(?:\s+([^\s]+))?(?:\s+([^\s]+))?\s*$/i);
  if (!match) return { isSecretCommand: false };
  const first = match[1]?.trim();
  const second = match[2]?.trim();
  if (first && second) return { isSecretCommand: true, packageName: first, envName: second };
  if (first) return { isSecretCommand: true, envName: first };
  return { isSecretCommand: true };
}

export function plannerImplementationPrompt(artifact: PlannerPlanArtifact): string {
  const steps = artifact.steps.length
    ? artifact.steps.map((step, index) => `${index + 1}. ${step.title}`).join("\n")
    : "Use the plan below as the implementation source of truth.";
  const decisions = plannerDecisionSummaryLines(artifact);
  return `Implement the approved Planner Mode plan in this same thread. Switch from planning to execution, make the necessary code changes, and run the relevant tests. Pursue this as a durable implementation goal: keep progress aligned to the tracked steps, continue after provider interruptions when safe, and update the user with concrete validation evidence.

Plan: ${artifact.title}

${artifact.content}

${decisions.length ? `Planner decisions:\n${decisions.join("\n")}\n\n` : ""}Tracked steps:
${steps}`;
}

export function plannerImplementationGoalMode(): { enabled: true } {
  return { enabled: true };
}

export function plannerRefinementPrompt(artifact: PlannerPlanArtifact): string {
  const decisions = plannerDecisionSummaryLines(artifact);
  return `Refine the Planner Mode plan in this same thread using the decisions below. Keep planning only; do not implement yet.

Source artifact id: ${artifact.id}
Plan: ${artifact.title}

${artifact.content}

${decisions.length ? `Planner decisions:\n${decisions.join("\n")}` : "No planner decisions have been answered yet."}

Durable plan output:
- Produce the final durable plan only. Do not edit files, run implementation commands, or start coding.
- Include a canonical \`ambient-planner-diagrams\` fenced JSON block with a \`diagrams\` array.
- Include diagram specs for \`architecture\`, \`dependencies\`, \`program_flow\`, \`functional_nonfunctional\`, plus any extra custom diagram you think materially helps.
- Prefer structured diagram specs with \`id\`, \`title\`, \`kind\`, \`purpose\`, \`nodes\`, \`edges\`, \`layoutHint\`, and \`fallbackSummary\`. Optional \`svg\` candidates are allowed, but Ambient will rely on the structured spec unless SVG validation is available.
- Do not include scripts, event handlers, remote assets, secrets, or implementation mutations in the durable plan.`;
}

export function plannerDurableRevisionPrompt(artifact: PlannerPlanArtifact, feedback: string): string {
  const decisions = plannerDecisionSummaryLines(artifact);
  const trimmedFeedback = feedback.trim();
  return `${PLANNER_DURABLE_REVISION_PROMPT_MARKER}
Revise the existing durable Planner Mode plan in this same thread.

Artifact id: ${artifact.id}
Current durable path: ${artifact.durableArtifactPath ?? "not generated yet"}
Plan: ${artifact.title}

User feedback:
${trimmedFeedback}

Current plan content:
${artifact.content}

${decisions.length ? `Planner decisions:\n${decisions.join("\n")}\n\n` : ""}Durable revision output:
- Return exactly one \`ambient-planner-revision\` fenced JSON block and no surrounding prose.
- Prefer \`mode: "targeted_edit"\` for local changes. Use \`mode: "full_rewrite"\` only when the feedback materially changes most required sections or a targeted patch cannot preserve coherence.
- Do not create a new sibling durable plan. Ambient Desktop will validate and overwrite the current managed durable artifact path after applying the revision.
- For diagram-only feedback, use \`replace_diagrams\` and only replace the affected diagram kinds. Keep architecture/product/runtime diagrams separate from code/module/program-flow diagrams when requested.
- Targeted operations may use \`replace_section\`, \`replace_diagrams\`, \`replace_summary\`, or \`replace_title\`.
- \`replace_section\` uses a Markdown heading already present in the current plan when possible. \`replace_diagrams\` uses normal planner diagram specs with \`id\`, \`title\`, \`kind\`, \`purpose\`, \`nodes\`, \`edges\`, \`layoutHint\`, and \`fallbackSummary\`.
- If and only if a full rewrite is necessary, include \`mode: "full_rewrite"\`, a concise \`reason\`, and complete revised plan \`content\` containing all required sections and the canonical \`ambient-planner-diagrams\` block.
- Do not include scripts, event handlers, remote assets, external stylesheets, data URLs, secrets, implementation commands, or workspace mutations.

Use this shape for the common targeted path:
\`\`\`ambient-planner-revision
{
  "mode": "targeted_edit",
  "artifactId": "${artifact.id}",
  "summary": "What changed in one sentence.",
  "operations": [
    {
      "op": "replace_diagrams",
      "scope": "provided",
      "diagrams": [
        {
          "id": "architecture",
          "title": "Runtime Architecture",
          "kind": "architecture",
          "purpose": "Show product and runtime boundaries without code-level detail.",
          "nodes": [{ "id": "app", "label": "Application", "role": "User-facing runtime." }],
          "edges": []
        }
      ]
    },
    {
      "op": "replace_section",
      "heading": "Architecture",
      "markdown": "Updated Markdown for this section only."
    }
  ]
}
\`\`\``;
}

export function plannerDecisionFinalizationPrompt(artifact: PlannerPlanArtifact): string {
  return plannerDurableRevisionPrompt(
    artifact,
    [
      "Apply the answered Planner decisions to the current plan and prepare it for durable rendering.",
      "Preserve the current artifact identity; do not create a sibling planner artifact.",
      "Prefer targeted_edit operations that update only the affected sections, title, summary, or diagrams.",
      "Use full_rewrite only when the answered decisions materially change most required sections and targeted edits would make the plan incoherent.",
    ].join("\n"),
  );
}

export function plannerDecisionAnswerText(question: PlannerDecisionQuestion): string | undefined {
  const answer = question.answer;
  if (!answer) return undefined;
  if (answer.kind === "custom") return answer.customText;
  const option = question.options.find((item) => item.id === answer.optionId);
  if (!option) return answer.optionId;
  return option.description ? `${option.label} - ${option.description}` : option.label;
}

export function plannerDecisionSummaryLines(artifact: PlannerPlanArtifact): string[] {
  return artifact.decisionQuestions
    .map((question) => {
      const answer = plannerDecisionAnswerText(question);
      if (!answer) return undefined;
      return `- ${question.question}: ${answer}`;
    })
    .filter((line): line is string => Boolean(line));
}

export function plannerRequiredDecisionQuestionsAnswered(artifact: PlannerPlanArtifact): boolean {
  return artifact.decisionQuestions.every((question) => !question.required || Boolean(question.answer));
}

export function plannerUnansweredDecisionCount(artifact: PlannerPlanArtifact): number {
  return artifact.decisionQuestions.filter((question) => !question.answer).length;
}

export function plannerSortedOptions(question: PlannerDecisionQuestion) {
  return [
    ...question.options.filter((option) => option.id === question.recommendedOptionId),
    ...question.options.filter((option) => option.id !== question.recommendedOptionId),
  ];
}

export function plannerNextDecisionQuestion(artifact: PlannerPlanArtifact): PlannerDecisionQuestion | undefined {
  return artifact.decisionQuestions.find((question) => !question.answer);
}

export function plannerDecisionQuestionsComplete(artifact: PlannerPlanArtifact): boolean {
  return artifact.decisionQuestions.length > 0 && artifact.decisionQuestions.every((question) => question.answer);
}

export function plannerAnsweredDecisionCount(artifact: PlannerPlanArtifact): number {
  return artifact.decisionQuestions.filter((question) => question.answer).length;
}

export function plannerCanRefineWithAdditionalFeedback(artifact: PlannerPlanArtifact, isFinalizing = false): boolean {
  return artifact.status === "ready" && !isFinalizing;
}

export function plannerShouldAutoFinalizeAfterAnswer(
  before: PlannerPlanArtifact,
  after: PlannerPlanArtifact,
  autoFinalizeEnabled: boolean,
): boolean {
  if (
    !autoFinalizeEnabled ||
    after.status !== "ready" ||
    after.workflowState === "finalizing" ||
    Boolean(after.finalizationAttempt) ||
    after.decisionQuestions.length === 0
  ) {
    return false;
  }
  const answeredBefore = before.decisionQuestions.filter((question) => question.answer).length;
  const answeredAfter = after.decisionQuestions.filter((question) => question.answer).length;
  if (answeredAfter <= answeredBefore || answeredAfter === 0) return false;
  const requiredCompleteAfter = plannerRequiredDecisionQuestionsAnswered(after);
  if (!requiredCompleteAfter) return false;
  const requiredCompleteBefore = plannerRequiredDecisionQuestionsAnswered(before);
  if (!requiredCompleteBefore) return true;
  const hasRequiredQuestions = after.decisionQuestions.some((question) => question.required);
  return !hasRequiredQuestions && answeredBefore === 0;
}

export function plannerWorkflowStateLabel(artifact: PlannerPlanArtifact): string {
  switch (artifact.workflowState) {
    case "questions_pending":
      return "Questions pending";
    case "answers_complete":
      return "Answers complete";
    case "finalizing":
      return "Finalizing plan";
    case "durable_generating":
      return "Generating durable plan";
    case "validating":
      return "Validating artifact";
    case "repairing":
      return "Repairing artifact";
    case "durable_ready":
      return "Durable plan ready";
    case "durable_ready_with_fallbacks":
      return "Durable plan ready with fallbacks";
    case "failed":
      return "Planner workflow failed";
    case "draft":
    default:
      return "Draft plan";
  }
}

export function plannerDecisionAnswerStatusLabel(artifact: PlannerPlanArtifact): string {
  if (!artifact.decisionQuestions.length) return "No planner decisions";
  const unanswered = plannerUnansweredDecisionCount(artifact);
  if (unanswered === 0) return "Planner decisions answered";
  const unansweredRequired = artifact.decisionQuestions.filter((question) => question.required && !question.answer).length;
  const finalizing = artifact.workflowState === "finalizing" || artifact.finalizationAttempt?.status === "running";
  if (finalizing && unansweredRequired === 0) {
    const unansweredOptional = unanswered - unansweredRequired;
    return `${unansweredOptional} optional planner decision${unansweredOptional === 1 ? "" : "s"} skipped`;
  }
  return `${unanswered} planner decision${unanswered === 1 ? "" : "s"} remaining`;
}
