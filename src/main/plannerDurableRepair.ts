import type { ChatMessage, PlannerDecisionQuestion, PlannerDurableArtifactValidationResult, PlannerPlanArtifact } from "../shared/types";

export const PLANNER_DURABLE_REPAIR_PROMPT_MARKER = "[ambient-planner-durable-repair]";
export const PLANNER_DURABLE_REPAIR_MAX_ATTEMPTS = 2;

export function plannerDurableRepairAttemptCount(messages: Pick<ChatMessage, "role" | "content">[]): number {
  return messages.filter((message) => message.role === "user" && message.content.includes(PLANNER_DURABLE_REPAIR_PROMPT_MARKER)).length;
}

export function buildPlannerDurableRepairPrompt(input: {
  artifact: PlannerPlanArtifact;
  validation: PlannerDurableArtifactValidationResult;
  attempt: number;
  maxAttempts?: number;
}): string {
  const maxAttempts = input.maxAttempts ?? PLANNER_DURABLE_REPAIR_MAX_ATTEMPTS;
  const answeredDecisions = input.artifact.decisionQuestions
    .map(plannerDecisionSummaryLine)
    .filter((line): line is string => Boolean(line));
  const diagramSummary = (input.artifact.diagrams ?? [])
    .slice(0, 8)
    .map((diagram) => `- ${diagram.kind}: ${diagram.title} (${diagram.nodes.length} nodes, ${diagram.edges.length} edges)`);
  return `${PLANNER_DURABLE_REPAIR_PROMPT_MARKER}
Durable planner artifact repair request (attempt ${input.attempt} of ${maxAttempts}).

Ambient generated a durable HTML candidate from your last Planner Mode response, but validation failed. Produce a complete revised final Planner Mode plan only. Do not implement, edit files, run commands, install dependencies, or mutate the workspace.

Repair target:
- Title: ${input.artifact.title}
- Source artifact id: ${input.artifact.id}
- Workflow state: ${input.artifact.workflowState}

Validation errors:
${formatValidationIssues(input.validation.errors)}

Validation warnings:
${input.validation.warnings.length ? formatValidationIssues(input.validation.warnings) : "- None."}

Planner decisions already answered:
${answeredDecisions.length ? answeredDecisions.join("\n") : "- No explicit planner decisions were answered."}

Previous diagram specs:
${diagramSummary.length ? diagramSummary.join("\n") : "- No structured diagram specs were available."}

Source plan content:
${truncate(input.artifact.content, 12_000)}

Repair instructions:
- Return a complete final durable plan, not a patch or explanation of the validation system.
- Include the required sections: Executive Summary, Key Decisions, Implementation Phases, Architecture, Dependencies, Program Flow, Functional Concerns, Non-Functional Concerns, Risks and Mitigations, Verification Plan, Open Questions, and Diagram Gallery.
- Include a canonical \`ambient-planner-diagrams\` fenced JSON block with structured specs for \`architecture\`, \`dependencies\`, \`program_flow\`, \`functional_nonfunctional\`, plus any useful custom diagram.
- Prefer concise labels that fit inside diagram nodes.
- Do not include scripts, event handlers, remote assets, external stylesheets, data URLs, or secrets.
- Do not ask new questions unless a genuine blocker remains after this repair.`;
}

export function plannerDurableFallbackWarnings(validation: PlannerDurableArtifactValidationResult): PlannerDurableArtifactValidationResult["warnings"] {
  const codes = validation.errors.map((issue) => issue.code).slice(0, 6);
  return [
    {
      code: "pi-diagram-fallback-used",
      section: "diagram-gallery",
      message: codes.length
        ? `Pi-authored diagram specs were replaced with deterministic fallback diagrams after validation failed: ${codes.join(", ")}.`
        : "Pi-authored diagram specs were replaced with deterministic fallback diagrams after durable validation failed.",
    },
  ];
}

function formatValidationIssues(issues: PlannerDurableArtifactValidationResult["errors"]): string {
  if (!issues.length) return "- None.";
  return issues
    .slice(0, 24)
    .map((issue) => `- ${issue.code}${issue.section ? ` (${issue.section})` : ""}: ${issue.message}`)
    .join("\n");
}

function plannerDecisionSummaryLine(question: PlannerDecisionQuestion): string | undefined {
  const answer = question.answer;
  if (!answer) return undefined;
  if (answer.kind === "custom") return `- ${question.question}: ${answer.customText}`;
  const option = question.options.find((item) => item.id === answer.optionId);
  return `- ${question.question}: ${option ? `${option.label}${option.description ? ` - ${option.description}` : ""}` : answer.optionId}`;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 120).trim()}\n\n[truncated ${trimmed.length - maxLength + 120} chars for repair prompt focus]`;
}
