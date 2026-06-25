import { buildCallableWorkflowLaunchCardSummary } from "../../shared/callableWorkflowLaunchCards";
import type { SymphonyWorkflowRecipePreset } from "../../shared/symphonyWorkflowRecipes";
import type { CallableWorkflowLaunchCardSummary, WorkflowRecordingPlaybookDraft } from "../../shared/workflowTypes";
import { clonePolicySnapshot, cloneSourceContext, cloneSourcePreview } from "./callableWorkflowCatalogSearch";
import type {
  CallableWorkflowInputRepair,
  CallableWorkflowInputValidation,
  CallableWorkflowJsonSchema,
  CallableWorkflowRunPlan,
  CallableWorkflowSourceContext,
  CallableWorkflowSymphonyInvocationCustomization,
  CallableWorkflowSymphonyMetricCriterion,
  CallableWorkflowSymphonyStepSelection,
  CallableWorkflowToolDescriptor,
} from "./callableWorkflowRegistry";

export function buildCallableWorkflowRunPlanFromTool(input: {
  tool: CallableWorkflowToolDescriptor;
  rawInput: unknown;
  runPlanSchemaVersion: CallableWorkflowRunPlan["schemaVersion"];
  invocationSchemaVersion: CallableWorkflowSymphonyInvocationCustomization["schemaVersion"];
}): CallableWorkflowRunPlan {
  const repaired = repairCallableWorkflowToolInput(input.tool, input.rawInput);
  if (!repaired.validation.valid || !repaired.value) {
    throw new Error(`Callable workflow input failed validation: ${repaired.validation.errors.join("; ")}`);
  }
  const blocking = typeof repaired.value.blocking === "boolean" ? repaired.value.blocking : input.tool.execution.defaultBlocking;
  const launchCard = buildCallableWorkflowLaunchCardFromTool(input.tool, repaired.value, blocking);
  return {
    schemaVersion: input.runPlanSchemaVersion,
    toolName: input.tool.name,
    toolId: input.tool.id,
    source: { ...input.tool.source },
    sourceContext: callableWorkflowSourceContextForRun(input.tool, repaired.value, input.invocationSchemaVersion),
    input: repaired.value,
    blocking,
    execution: { ...input.tool.execution },
    policySnapshot: clonePolicySnapshot(input.tool.policySnapshot),
    launchCard,
  };
}

export function buildCallableWorkflowLaunchCardFromTool(
  tool: CallableWorkflowToolDescriptor,
  input: Record<string, unknown>,
  blocking: boolean,
): CallableWorkflowLaunchCardSummary {
  return buildCallableWorkflowLaunchCardSummary({
    title: tool.label,
    sourceKind: tool.source.kind,
    policy: tool.policySnapshot,
    input,
    blocking,
    sourcePreview: callableWorkflowSourcePreview(tool.sourceContext),
  });
}

export function validateCallableWorkflowToolInput(tool: CallableWorkflowToolDescriptor, input: unknown): CallableWorkflowInputValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: [`${tool.name} input must be an object.`] };
  }
  const record = input as Record<string, unknown>;
  const errors: string[] = [];
  for (const required of tool.inputSchema.required) {
    if (!(required in record)) errors.push(`${tool.name} input is missing required field: ${required}`);
  }
  for (const key of Object.keys(record)) {
    if (!(key in tool.inputSchema.properties)) errors.push(`${tool.name} input has unexpected field: ${key}`);
  }
  for (const [key, propertySchema] of Object.entries(tool.inputSchema.properties)) {
    if (!(key in record)) continue;
    const expected = propertySchema.type;
    if (expected === "array" && !Array.isArray(record[key])) {
      errors.push(`${tool.name} input field ${key} must be an array.`);
    } else if (expected === "number" && (typeof record[key] !== "number" || !Number.isFinite(record[key]))) {
      errors.push(`${tool.name} input field ${key} must be a number.`);
    } else if (expected !== "array" && expected !== "number" && typeof record[key] !== expected) {
      errors.push(`${tool.name} input field ${key} must be a ${expected}.`);
    }
  }
  errors.push(...requiredSymphonyMetricCriteriaValidationErrors(tool, record));
  return {
    valid: errors.length === 0,
    ...(errors.length === 0 ? { value: { ...record } } : {}),
    errors,
  };
}

export function repairCallableWorkflowToolInput(tool: CallableWorkflowToolDescriptor, input: unknown): CallableWorkflowInputRepair {
  const firstPass = validateCallableWorkflowToolInput(tool, input);
  if (firstPass.valid) return { repaired: false, value: firstPass.value, validation: firstPass, repairNotes: [] };

  const repaired = deterministicCallableWorkflowInputRepair(tool, input);
  const validation = validateCallableWorkflowToolInput(tool, repaired);
  return {
    repaired: validation.valid,
    ...(validation.valid ? { value: validation.value } : {}),
    validation,
    repairNotes: validation.valid ? ["Applied deterministic JSON Schema repair for callable workflow tool input."] : firstPass.errors,
  };
}

export function callableWorkflowInputSchema(recipe: SymphonyWorkflowRecipePreset): CallableWorkflowJsonSchema {
  const required = [
    ...recipe.callableToolPolicy.inputSchema.required,
    ...(recipe.metricTemplates.some((template) => template.required) ? ["metricCriteria"] : []),
  ];
  return {
    ...recipe.callableToolPolicy.inputSchema,
    required,
    properties: {
      ...recipe.callableToolPolicy.inputSchema.properties,
      blocking: {
        type: "boolean",
        description: "Whether the parent should block on this visible workflow run before synthesizing.",
      },
      builderSelections: {
        type: "array",
        description: "Structured Symphony builder choices selected by the user or composer for this run.",
      },
      metricCriteria: {
        type: "array",
        description: "Required structured objective metric, rubric, or verifier criteria selected for this Symphony run.",
      },
    },
  };
}

export function recordedWorkflowInputSchema(playbook: WorkflowRecordingPlaybookDraft): CallableWorkflowJsonSchema {
  const properties: CallableWorkflowJsonSchema["properties"] = {
    goal: {
      type: "string",
      description: `Concrete goal for this recorded playbook invocation. Playbook intent: ${truncate(playbook.intent, 180)}`,
    },
    context: {
      type: "string",
      description: "Optional context, target files, source handles, account names, or bounded constraints for this run.",
    },
    blocking: {
      type: "boolean",
      description: "Whether the parent should block on this visible workflow run before synthesizing.",
    },
  };
  playbook.inputs.slice(0, 8).forEach((input, index) => {
    properties[`input${index + 1}`] = {
      type: "string",
      description: truncate(input, 240),
    };
  });
  return {
    type: "object",
    additionalProperties: false,
    required: ["goal"],
    properties,
  };
}

function callableWorkflowSourcePreview(context: CallableWorkflowSourceContext) {
  return context.sourcePreview ? cloneSourcePreview(context.sourcePreview) : undefined;
}

function requiredSymphonyMetricCriteriaValidationErrors(tool: CallableWorkflowToolDescriptor, input: Record<string, unknown>): string[] {
  if (tool.source.kind !== "symphony_recipe" || tool.sourceContext.kind !== "symphony_recipe") return [];
  if (!Array.isArray(input.metricCriteria)) return [];
  const criteria = symphonyMetricCriteriaFromInput(tool.sourceContext, input.metricCriteria);
  const presentTemplateIds = new Set(criteria.map((criterion) => criterion.templateId));
  const missingLabels = tool.sourceContext.metricTemplates
    .filter((template) => !presentTemplateIds.has(template.id))
    .map((template) => template.label);
  if (missingLabels.length === 0) return [];
  return [`${tool.name} input is missing required Symphony metric criteria: ${missingLabels.join(", ")}`];
}

function callableWorkflowSourceContextForRun(
  tool: CallableWorkflowToolDescriptor,
  input: Record<string, unknown>,
  invocationSchemaVersion: CallableWorkflowSymphonyInvocationCustomization["schemaVersion"],
): CallableWorkflowSourceContext {
  const sourceContext = cloneSourceContext(tool.sourceContext);
  if (sourceContext.kind !== "symphony_recipe") return sourceContext;
  const invocationCustomization = symphonyInvocationCustomizationFromInput(sourceContext, input, invocationSchemaVersion);
  if (invocationCustomization.stepSelections.length > 0 || invocationCustomization.metricCriteria.length > 0) {
    sourceContext.invocationCustomization = invocationCustomization;
  }
  return sourceContext;
}

function symphonyInvocationCustomizationFromInput(
  context: Extract<CallableWorkflowSourceContext, { kind: "symphony_recipe" }>,
  input: Record<string, unknown>,
  schemaVersion: CallableWorkflowSymphonyInvocationCustomization["schemaVersion"],
): CallableWorkflowSymphonyInvocationCustomization {
  return {
    schemaVersion,
    stepSelections: symphonyStepSelectionsFromInput(context, input.builderSelections),
    metricCriteria: symphonyMetricCriteriaFromInput(context, input.metricCriteria),
  };
}

function symphonyStepSelectionsFromInput(
  context: Extract<CallableWorkflowSourceContext, { kind: "symphony_recipe" }>,
  rawSelections: unknown,
): CallableWorkflowSymphonyStepSelection[] {
  const entries = arrayValue(rawSelections).map(recordValue);
  return context.builderSteps.flatMap((step) => {
    const entry = entries.find((candidate) => optionalString(candidate.stepId) === step.id);
    if (!entry) return [];
    const selectedChoiceId = optionalString(entry.selectedChoiceId) ?? optionalString(entry.choiceId);
    const selectedChoiceLabel = optionalString(entry.selectedChoiceLabel) ?? optionalString(entry.choiceLabel);
    const selectedChoiceDescription = optionalString(entry.selectedChoiceDescription) ?? optionalString(entry.choiceDescription);
    const customText = optionalString(entry.customText);
    const resolvedText =
      optionalString(entry.resolvedText) ?? customText ?? [selectedChoiceLabel, selectedChoiceDescription].filter(Boolean).join(": ");
    if (!resolvedText) return [];
    return [
      {
        stepId: step.id,
        question: step.question,
        ...(selectedChoiceId ? { selectedChoiceId } : {}),
        ...(selectedChoiceLabel ? { selectedChoiceLabel } : {}),
        ...(selectedChoiceDescription ? { selectedChoiceDescription } : {}),
        ...(customText ? { customText } : {}),
        resolvedText,
      },
    ];
  });
}

function symphonyMetricCriteriaFromInput(
  context: Extract<CallableWorkflowSourceContext, { kind: "symphony_recipe" }>,
  rawCriteria: unknown,
): CallableWorkflowSymphonyMetricCriterion[] {
  const entries = arrayValue(rawCriteria).map(recordValue);
  return context.metricTemplates.flatMap((template) => {
    const entry = entries.find(
      (candidate) => optionalString(candidate.templateId) === template.id || optionalString(candidate.id) === template.id,
    );
    const value = entry ? (optionalString(entry.value) ?? optionalString(entry.criteria)) : undefined;
    if (!value) return [];
    return [
      {
        templateId: template.id,
        kind: template.kind,
        label: template.label,
        prompt: template.prompt,
        value,
      },
    ];
  });
}

function deterministicCallableWorkflowInputRepair(tool: CallableWorkflowToolDescriptor, input: unknown): Record<string, unknown> {
  if (typeof input === "string" && input.trim()) return { goal: input.trim() };
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  const repaired: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
    const value = record[key];
    if (value === undefined) continue;
    if (schema.type === "string" && typeof value === "string" && value.trim()) repaired[key] = value.trim();
    if (schema.type === "boolean" && typeof value === "boolean") repaired[key] = value;
    if (schema.type === "number" && typeof value === "number" && Number.isFinite(value)) repaired[key] = value;
    if (schema.type === "array" && Array.isArray(value)) repaired[key] = value;
  }
  return repaired;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
