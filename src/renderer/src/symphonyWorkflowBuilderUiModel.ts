import {
  isAmbientSubagentsEnabled,
  type AmbientFeatureFlagSnapshot,
} from "../../shared/featureFlags";
import {
  buildCallableWorkflowLaunchCardSummary,
  formatCallableWorkflowLaunchCardBytes,
  formatCallableWorkflowLaunchCardInteger,
} from "../../shared/callableWorkflowLaunchCards";
import {
  listSymphonyWorkflowRecipePresets,
  missingRequiredSymphonyMetricTemplateLabels,
  requiredSymphonyMetricTemplateErrorMessage,
  type SymphonyMetricTemplate,
  type SymphonyWorkflowBuilderStep,
  type SymphonyWorkflowChoice,
  type SymphonyWorkflowPatternId,
  type SymphonyWorkflowRecipePreset,
} from "../../shared/symphonyWorkflowRecipes";
import type { CallableWorkflowLaunchCardSummary } from "../../shared/workflowTypes";

export interface SymphonyWorkflowBuilderDraftChoice {
  choiceId?: string;
  customText?: string;
}

export interface SymphonyWorkflowBuilderDraft {
  open?: boolean;
  patternId?: SymphonyWorkflowPatternId;
  goal?: string;
  blocking?: boolean;
  stepAnswers?: Record<string, SymphonyWorkflowBuilderDraftChoice>;
  metricCustomizations?: Record<string, string>;
}

export interface SymphonyWorkflowBuilderToggleModel {
  visible: boolean;
  disabled: boolean;
  active: boolean;
  green: boolean;
  icon: "symphony";
  label: string;
  ariaLabel: string;
  title: string;
  tone: "hidden" | "inactive" | "active";
}

export interface SymphonyWorkflowBuilderPatternCardModel {
  id: SymphonyWorkflowPatternId;
  label: string;
  summary: string;
  selected: boolean;
  diagramSvg: string;
  roleLabels: string[];
  metricLabel: string;
  riskLabel: string;
  budgetLabel: string;
}

export interface SymphonyWorkflowBuilderChoiceModel extends SymphonyWorkflowChoice {
  selected: boolean;
}

export interface SymphonyWorkflowBuilderStepModel {
  id: string;
  question: string;
  impact: string;
  choices: SymphonyWorkflowBuilderChoiceModel[];
  customChoice: {
    id: "custom";
    label: "Custom";
    selected: boolean;
    value: string;
    title: string;
  };
}

export interface SymphonyWorkflowBuilderMetricModel {
  id: string;
  kind: SymphonyMetricTemplate["kind"];
  label: string;
  prompt: string;
  required: true;
  customizable: true;
  value: string;
  placeholder: string;
}

export interface SymphonyWorkflowBuilderLaunchCardModel {
  card: CallableWorkflowLaunchCardSummary;
  riskLabel: string;
  agentLabel: string;
  tokenBudgetLabel: string;
  memoryLabel: string;
  confirmationLabel: string;
  confirmDisabled: boolean;
  confirmDisabledReason?: string;
  policyWarningLabels: string[];
  requirementLabels: string[];
  metricRequirementLabels: string[];
  missingMetricRequirementLabels: string[];
}

export interface SymphonyWorkflowBuilderUiModel {
  schemaVersion: "ambient-symphony-workflow-builder-ui-v1";
  featureFlagEnabled: boolean;
  visible: boolean;
  toggle: SymphonyWorkflowBuilderToggleModel;
  title: string;
  subtitle: string;
  patternCards: SymphonyWorkflowBuilderPatternCardModel[];
  selectedPattern?: SymphonyWorkflowBuilderPatternCardModel;
  steps: SymphonyWorkflowBuilderStepModel[];
  metrics: SymphonyWorkflowBuilderMetricModel[];
  launchCard?: SymphonyWorkflowBuilderLaunchCardModel;
  catalogAction: {
    saveRecipeLabel: string;
    oneOffRunLabel: string;
    compactRecorderTraceLabel: string;
    diagnosticsTraceLabel: string;
  };
}

export function symphonyWorkflowBuilderUiModel(input: {
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  draft?: SymphonyWorkflowBuilderDraft;
}): SymphonyWorkflowBuilderUiModel {
  const featureFlagEnabled = isAmbientSubagentsEnabled(input.featureFlagSnapshot);
  const open = Boolean(input.draft?.open);
  const visible = featureFlagEnabled;
  const presets = visible ? listSymphonyWorkflowRecipePresets() : [];
  const selectedRecipe = selectedSymphonyRecipe(presets, input.draft?.patternId);
  const patternCards = presets.map((preset) => symphonyPatternCard(preset, selectedRecipe?.id));
  const selectedPattern = patternCards.find((card) => card.id === selectedRecipe?.id);
  const steps = selectedRecipe ? selectedRecipe.builderSteps.map((step) => symphonyStepModel(step, input.draft?.stepAnswers?.[step.id])) : [];
  const metrics = selectedRecipe
    ? selectedRecipe.metricTemplates.map((template) => symphonyMetricModel(template, input.draft?.metricCustomizations?.[template.id]))
    : [];
  const launchCard = selectedRecipe ? symphonyLaunchCardModel(selectedRecipe, input.draft) : undefined;
  return {
    schemaVersion: "ambient-symphony-workflow-builder-ui-v1",
    featureFlagEnabled,
    visible,
    toggle: {
      visible,
      disabled: !featureFlagEnabled,
      active: featureFlagEnabled && open,
      green: featureFlagEnabled && open,
      icon: "symphony",
      label: "Symphony",
      ariaLabel: open ? "Close Symphony workflow builder" : "Open Symphony workflow builder",
      title: featureFlagEnabled
        ? "Compose a multi-agent Symphony workflow."
        : "Symphony is hidden until ambient.subagents is enabled.",
      tone: !featureFlagEnabled ? "hidden" : open ? "active" : "inactive",
    },
    title: "Symphony",
    subtitle: "Compose a visible multi-agent workflow from presets, Custom choices, metrics, and a launch card.",
    patternCards,
    ...(selectedPattern ? { selectedPattern } : {}),
    steps: open ? steps : [],
    metrics: open ? metrics : [],
    ...(open && launchCard ? { launchCard } : {}),
    catalogAction: {
      saveRecipeLabel: "Save recipe",
      oneOffRunLabel: "Run once",
      compactRecorderTraceLabel: "Recorder captures compact invocation",
      diagnosticsTraceLabel: "Full trace saved as diagnostics",
    },
  };
}

export function symphonyWorkflowBuilderComposerUiModel(input: {
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  draft?: SymphonyWorkflowBuilderDraft;
  composerGoal: string;
  openOverride?: boolean;
}): SymphonyWorkflowBuilderUiModel {
  return symphonyWorkflowBuilderUiModel({
    featureFlagSnapshot: input.featureFlagSnapshot,
    draft: {
      ...input.draft,
      ...(input.openOverride === undefined ? {} : { open: input.openOverride }),
      goal: input.composerGoal,
    },
  });
}

function selectedSymphonyRecipe(
  presets: SymphonyWorkflowRecipePreset[],
  selectedId: SymphonyWorkflowPatternId | undefined,
): SymphonyWorkflowRecipePreset | undefined {
  return presets.find((preset) => preset.id === selectedId) ?? presets[0];
}

function symphonyPatternCard(
  preset: SymphonyWorkflowRecipePreset,
  selectedId: SymphonyWorkflowPatternId | undefined,
): SymphonyWorkflowBuilderPatternCardModel {
  return {
    id: preset.id,
    label: preset.label,
    summary: preset.summary,
    selected: preset.id === selectedId,
    diagramSvg: preset.diagramSvg,
    roleLabels: preset.defaultRoles.map((role) => roleLabel(role)),
    metricLabel: preset.metricTemplates[0]?.label ?? "Metric",
    riskLabel: preset.hardLimits.maxFanout >= 8 || preset.hardLimits.maxDepth > 1 ? "High review" : "Review",
    budgetLabel: `Up to ${formatCallableWorkflowLaunchCardInteger(preset.hardLimits.maxTokenBudget)} tokens`,
  };
}

function symphonyStepModel(
  step: SymphonyWorkflowBuilderStep,
  answer: SymphonyWorkflowBuilderDraftChoice | undefined,
): SymphonyWorkflowBuilderStepModel {
  const selectedChoiceId = answer?.customText?.trim() ? undefined : answer?.choiceId;
  return {
    id: step.id,
    question: step.question,
    impact: step.impact,
    choices: step.choices.map((choice) => ({
      ...choice,
      selected: choice.id === selectedChoiceId,
    })),
    customChoice: {
      id: "custom",
      label: "Custom",
      selected: Boolean(answer?.customText?.trim()),
      value: answer?.customText ?? "",
      title: "Write a custom policy or workflow choice for this step.",
    },
  };
}

function symphonyMetricModel(
  template: SymphonyMetricTemplate,
  value: string | undefined,
): SymphonyWorkflowBuilderMetricModel {
  return {
    id: template.id,
    kind: template.kind,
    label: template.label,
    prompt: template.prompt,
    required: template.required,
    customizable: template.customizable,
    value: value ?? "",
    placeholder: metricPlaceholder(template.kind),
  };
}

function symphonyLaunchCardModel(
  preset: SymphonyWorkflowRecipePreset,
  draft: SymphonyWorkflowBuilderDraft | undefined,
): SymphonyWorkflowBuilderLaunchCardModel {
  const goal = draft?.goal?.trim() ?? "";
  const missingMetricRequirementLabels = missingRequiredSymphonyMetricTemplateLabels({
    patternId: preset.id,
    metricCustomizations: draft?.metricCustomizations,
  });
  const confirmDisabledReason = launchCardDisabledReason(goal, missingMetricRequirementLabels);
  const card = buildCallableWorkflowLaunchCardSummary({
    title: `Symphony ${preset.label}`,
    sourceKind: "symphony_recipe",
    policy: {
      launchCardRequirementIds: preset.launchCardRequirements.map((requirement) => requirement.id),
      metricTemplateIds: preset.metricTemplates.map((template) => template.id),
      maxFanout: preset.hardLimits.maxFanout,
      maxDepth: preset.hardLimits.maxDepth,
      maxTokenBudget: preset.hardLimits.maxTokenBudget,
      maxLocalMemoryBytes: preset.hardLimits.maxLocalMemoryBytes,
      defaultCollapsedChildThreads: preset.defaultCollapsedChildThreads,
    },
    input: {
      goal,
      blocking: Boolean(draft?.blocking),
    },
    blocking: Boolean(draft?.blocking),
    sourcePreview: preset.sourcePreview,
  });
  const confirmDisabled = Boolean(confirmDisabledReason);
  return {
    card,
    riskLabel: `${titleCase(card.riskLevel)} risk`,
    agentLabel: `Up to ${card.estimatedAgents.toLocaleString("en-US")} ${card.estimatedAgents === 1 ? "agent" : "agents"}`,
    tokenBudgetLabel: `Budget: ${card.estimatedTokenBudget.toLocaleString("en-US")} tokens`,
    memoryLabel: `Local memory: ${formatCallableWorkflowLaunchCardBytes(card.estimatedLocalMemoryBytes)}`,
    confirmationLabel: card.requireConfirmation ? "Launch card confirmation required" : "Ready for launch",
    confirmDisabled,
    ...(confirmDisabledReason ? { confirmDisabledReason } : {}),
    policyWarningLabels: [...card.policyWarnings],
    requirementLabels: preset.launchCardRequirements.map((requirement) => requirement.label),
    metricRequirementLabels: preset.metricTemplates.filter((template) => template.required).map((template) => template.label),
    missingMetricRequirementLabels,
  };
}

function launchCardDisabledReason(
  goal: string,
  missingMetricRequirementLabels: string[],
): string | undefined {
  if (goal.length === 0) return "Describe the workflow goal before confirming the launch card.";
  return requiredSymphonyMetricTemplateErrorMessage({
    missingLabels: missingMetricRequirementLabels,
    actionLabel: "confirming the launch card",
  });
}

function roleLabel(role: string): string {
  return role.split(/[_-]+/g).map(titleCase).join(" ");
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function metricPlaceholder(kind: SymphonyMetricTemplate["kind"]): string {
  if (kind === "rubric") return "Score criteria, weights, and tie-breakers.";
  if (kind === "verifier_criteria") return "Acceptance checks, tests, or invariants.";
  return "Objective measure, schema, count, or command.";
}
