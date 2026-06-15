import {
  getSymphonyWorkflowRecipePreset,
  missingRequiredSymphonyMetricTemplateLabels,
  requiredSymphonyMetricTemplateErrorMessage,
} from "../shared/symphonyWorkflowRecipes";
import type { SendMessageSymphonyComposerIntent } from "../shared/types";
import { callableWorkflowToolName } from "./callableWorkflowRegistry";

interface SymphonyWorkflowComposerBuilderSelection {
  stepId: string;
  question: string;
  selectedChoiceId?: string;
  selectedChoiceLabel?: string;
  selectedChoiceDescription?: string;
  customText?: string;
  resolvedText: string;
}

interface SymphonyWorkflowComposerMetricCriterion {
  templateId: string;
  kind: string;
  label: string;
  prompt: string;
  value: string;
}

export function localDeepResearchComposerPrompt(userRequest: string): string {
  return [
    "Composer action: Local Deep Research.",
    "Use the first-party ambient_local_deep_research_run tool for the user's research query below.",
    "If readiness is uncertain or the run tool reports blocked, inspect setup with ambient_local_deep_research_setup and explain the blocker or next action.",
    "Do not answer from general knowledge before attempting the Local Deep Research run.",
    "",
    "Research query:",
    userRequest,
  ].join("\n");
}

export function symphonyWorkflowComposerPrompt(
  userRequest: string,
  intent: SendMessageSymphonyComposerIntent,
): string {
  const recipe = getSymphonyWorkflowRecipePreset(intent.patternId);
  const missingMetricLabels = missingRequiredSymphonyMetricTemplateLabels({
    patternId: intent.patternId,
    metricCustomizations: intent.metricCustomizations,
  });
  const metricError = requiredSymphonyMetricTemplateErrorMessage({
    missingLabels: missingMetricLabels,
    actionLabel: intent.action === "run-once" ? "launching the Symphony workflow" : "saving the Symphony recipe",
  });
  if (metricError) throw new Error(metricError);
  const toolName = callableWorkflowToolName(intent.patternId);
  const scope = symphonyWorkflowComposerScope(recipe, intent);
  const builderSelections = symphonyWorkflowComposerBuilderSelections(recipe, intent);
  const metricCriteria = symphonyWorkflowComposerMetricCriteria(recipe, intent);
  const toolInput = {
    goal: userRequest,
    scope,
    blocking: Boolean(intent.blocking),
    builderSelections,
    metricCriteria,
  };
  if (intent.action === "run-once") {
    return [
      "Composer action: Symphony Run Once.",
      `Selected pattern: ${recipe.label}.`,
      `Call the parent-visible callable workflow tool exactly once: ${toolName}.`,
      "Use this JSON input:",
      JSON.stringify(toolInput, null, 2),
      "After the tool queues the visible background workflow task, explain the task status, blocking mode, launch-card risk, and what result artifact is still pending.",
      "Do not spawn child agents directly for this request; the callable workflow task owns visible fanout, progress, pause/resume/cancel, token/cost tracking, and parent blocking semantics.",
    ].join("\n");
  }
  return [
    "Composer action: Symphony Save Recipe.",
    `Selected pattern: ${recipe.label}.`,
    "The user asked to save a reusable Symphony recipe, not to run it yet.",
    `Do not call ${toolName} unless the user explicitly asks to run the recipe after review.`,
    "Prepare a reusable workflow recipe/playbook draft for the searchable workflow catalog. Include the finite JSON Schema parameters, role policy, tool/mutation scope, metric or rubric template, launch-card requirements, nested fanout limits, and recorder policy.",
    "Ask for confirmation if any required recipe field is still ambiguous.",
    "Recipe draft input:",
    JSON.stringify(toolInput, null, 2),
  ].join("\n");
}

function symphonyWorkflowComposerScope(
  recipe: ReturnType<typeof getSymphonyWorkflowRecipePreset>,
  intent: SendMessageSymphonyComposerIntent,
): string {
  return [
    `Pattern: ${recipe.label}`,
    `Summary: ${recipe.summary}`,
    `Readable source preview: ${recipe.sourcePreview.label} (${recipe.sourcePreview.dslStatus}, executable no)`,
    truncateSymphonyComposerScope(recipe.sourcePreview.text, 1200),
    `Default roles: ${recipe.defaultRoles.join(", ")}`,
    `Blocking: ${intent.blocking ? "parent waits for synthesis-safe completion" : "background result may complete later"}`,
    `Limits: max fanout ${recipe.hardLimits.maxFanout}, max depth ${recipe.hardLimits.maxDepth}, max tokens ${recipe.hardLimits.maxTokenBudget.toLocaleString("en-US")}`,
    "Builder choices:",
    ...symphonyWorkflowComposerStepLines(recipe, intent),
    "Metrics and rubrics:",
    ...symphonyWorkflowComposerMetricLines(intent),
  ].join("\n");
}

function truncateSymphonyComposerScope(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function symphonyWorkflowComposerStepLines(
  recipe: ReturnType<typeof getSymphonyWorkflowRecipePreset>,
  intent: SendMessageSymphonyComposerIntent,
): string[] {
  return recipe.builderSteps.map((step) => {
    const answer = intent.stepAnswers?.[step.id];
    const customText = answer?.customText?.trim();
    if (customText) return `- ${step.question}: Custom: ${customText}`;
    const choice = step.choices.find((candidate) => candidate.id === answer?.choiceId);
    if (choice) return `- ${step.question}: ${choice.label} (${choice.description})`;
    const recommended = step.choices.find((candidate) => candidate.recommended) ?? step.choices[0];
    return recommended
      ? `- ${step.question}: ${recommended.label} (${recommended.description})`
      : `- ${step.question}: unspecified`;
  });
}

function symphonyWorkflowComposerBuilderSelections(
  recipe: ReturnType<typeof getSymphonyWorkflowRecipePreset>,
  intent: SendMessageSymphonyComposerIntent,
): SymphonyWorkflowComposerBuilderSelection[] {
  return recipe.builderSteps
    .map((step): SymphonyWorkflowComposerBuilderSelection | undefined => {
      const answer = intent.stepAnswers?.[step.id];
      const customText = answer?.customText?.trim();
      if (customText) {
        return {
          stepId: step.id,
          question: step.question,
          customText,
          resolvedText: customText,
        };
      }
      const choice = step.choices.find((candidate) => candidate.id === answer?.choiceId)
        ?? step.choices.find((candidate) => candidate.recommended)
        ?? step.choices[0];
      if (!choice) return undefined;
      return {
        stepId: step.id,
        question: step.question,
        selectedChoiceId: choice.id,
        selectedChoiceLabel: choice.label,
        selectedChoiceDescription: choice.description,
        resolvedText: `${choice.label}: ${choice.description}`,
      };
    })
    .filter((selection): selection is SymphonyWorkflowComposerBuilderSelection => Boolean(selection));
}

function symphonyWorkflowComposerMetricLines(intent: SendMessageSymphonyComposerIntent): string[] {
  const entries = Object.entries(intent.metricCustomizations ?? {})
    .map(([id, value]) => [id, value.trim()] as const)
    .filter(([, value]) => Boolean(value));
  return entries.length
    ? entries.map(([id, value]) => `- ${id}: ${value}`)
    : ["- Use the selected pattern's required objective metric or rubric template and ask a follow-up if it is underspecified."];
}

function symphonyWorkflowComposerMetricCriteria(
  recipe: ReturnType<typeof getSymphonyWorkflowRecipePreset>,
  intent: SendMessageSymphonyComposerIntent,
): SymphonyWorkflowComposerMetricCriterion[] {
  return recipe.metricTemplates.flatMap((template) => {
    const value = intent.metricCustomizations?.[template.id]?.trim();
    if (!value) return [];
    return [{
      templateId: template.id,
      kind: template.kind,
      label: template.label,
      prompt: template.prompt,
      value,
    }];
  });
}
