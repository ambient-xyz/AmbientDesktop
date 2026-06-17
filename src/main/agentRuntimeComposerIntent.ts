import {
  getSymphonyWorkflowRecipePreset,
  missingRequiredSymphonyMetricTemplateLabels,
  requiredSymphonyMetricTemplateErrorMessage,
} from "../shared/symphonyWorkflowRecipes";
import type {
  SendMessageLocalDeepResearchComposerIntent,
  SendMessageSlashCommandComposerIntent,
  SendMessageSymphonyComposerIntent,
} from "../shared/types";
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

export function localDeepResearchComposerPrompt(
  userRequest: string,
  intent: SendMessageLocalDeepResearchComposerIntent,
): string {
  const runInput = {
    question: userRequest,
    maxToolCalls: intent.localDeepResearch.maxToolCalls,
    localResearchBudget: intent.localDeepResearch,
  };
  return [
    "Composer action: Local Deep Research.",
    "Use the first-party ambient_local_deep_research_run tool for the user's research query below.",
    "Call ambient_local_deep_research_run with this exact run budget contract:",
    JSON.stringify(runInput, null, 2),
    "If readiness is uncertain or the run tool reports blocked, inspect setup with ambient_local_deep_research_setup and explain the blocker or next action.",
    "If the run tool reports the budget exhausted, summarize the gathered evidence or ask whether to continue according to localResearchBudget.onExhausted.",
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

export function slashCommandComposerPrompt(
  userRequest: string,
  intent: SendMessageSlashCommandComposerIntent,
): string {
  const selection = intent.selection;
  const selectionSummary = {
    entryId: selection.entryId,
    command: selection.command,
    title: selection.title,
    kind: selection.kind,
    sourceKind: selection.sourceKind,
    invocationKind: selection.invocationKind,
    sourceId: selection.sourceId,
    sourceName: selection.sourceName,
    sourceVersion: selection.sourceVersion,
  };
  return [
    `Composer action: Slash command ${selection.command}.`,
    "Ambient Desktop validated this slash-command selection immediately before sending. Treat the selection as run-scoped guidance only; do not persist it to future turns unless the user asks.",
    "Selection:",
    JSON.stringify(selectionSummary, null, 2),
    ...slashCommandInvocationGuidance(selection),
    "",
    "User request:",
    userRequest,
  ].join("\n");
}

function slashCommandInvocationGuidance(selection: SendMessageSlashCommandComposerIntent["selection"]): string[] {
  if (selection.invocationKind === "codex-plugin-skill") {
    return [
      "Use the selected Codex skill for this run if it is mounted in the current Pi session.",
      "If the skill instructions are unavailable, state that the skill could not be loaded instead of substituting a different skill.",
      "Respect the normal permission mode and tool approval boundaries for any work the skill asks you to perform.",
    ];
  }
  if (selection.invocationKind === "ambient-cli-skill") {
    return [
      "This is an Ambient CLI lazy skill. Inspect the package with ambient_cli_search or ambient_cli_describe before attempting related execution.",
      "Ambient CLI skills are not mounted eagerly; use the read-only description tools for exact package guidance.",
      "Any process execution must go through ambient_cli and its normal preflight/approval path.",
    ];
  }
  if (selection.invocationKind === "ambient-cli-command") {
    return [
      "This is an Ambient CLI command selection. Call ambient_cli_describe for the selected package/command before any execution.",
      "If execution remains appropriate after the preflight description, use ambient_cli so Ambient Desktop can enforce approval, env, and artifact boundaries.",
    ];
  }
  if (selection.invocationKind === "workflow-playbook") {
    return [
      "Use the selected recorded workflow playbook as bounded guidance for this run.",
      "Do not bypass normal tool permissions, connector grants, or workspace restrictions from the original recording.",
      "If the playbook needs current details, inspect the workflow catalog before applying it.",
    ];
  }
  if (selection.invocationKind === "symphony-recipe" || selection.invocationKind === "callable-workflow") {
    return [
      "Use the callable workflow catalog tools to describe the selected entry, then invoke the parent-visible callable workflow only if its preflight still matches the user request.",
      "The callable workflow owns visible background execution, launch-card risk, pause/resume/cancel, token/cost tracking, and parent blocking semantics.",
      "Do not manually recreate child fanout in the parent unless the callable workflow is unavailable and you explain that fallback.",
    ];
  }
  return [
    "This slash command is not invocable as a model-run skill or workflow. Explain the limitation instead of guessing.",
  ];
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
