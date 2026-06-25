import { AMBIENT_SUBAGENTS_FEATURE_FLAG, isAmbientSubagentsEnabled, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import {
  listSymphonyWorkflowRecipePresets,
  type SymphonyWorkflowPatternId,
  type SymphonyWorkflowRecipePreset,
} from "../../shared/symphonyWorkflowRecipes";
import type { SubagentRoleId } from "../../shared/subagentRoles";
import type {
  CallableWorkflowLaunchCardSummary,
  CallableWorkflowSourcePreview,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingPlaybookDraft,
} from "../../shared/workflowTypes";
import {
  cloneCallableWorkflowTool,
  cloneSourcePreview,
  describeCallableWorkflowCatalogEntryDetails,
  searchCallableWorkflowCatalogEntries,
} from "./callableWorkflowCatalogSearch";
import {
  buildCallableWorkflowLaunchCardFromTool,
  buildCallableWorkflowRunPlanFromTool,
  callableWorkflowInputSchema,
  recordedWorkflowInputSchema,
} from "./callableWorkflowRunPlan";
export { repairCallableWorkflowToolInput, validateCallableWorkflowToolInput } from "./callableWorkflowRunPlan";

export const CALLABLE_WORKFLOW_REGISTRY_SCHEMA_VERSION = "ambient-callable-workflow-registry-v1" as const;
export const CALLABLE_WORKFLOW_TOOL_SCHEMA_VERSION = "ambient-callable-workflow-tool-v1" as const;
export const CALLABLE_WORKFLOW_RUN_PLAN_SCHEMA_VERSION = "ambient-callable-workflow-run-plan-v1" as const;
export const CALLABLE_WORKFLOW_SYMPHONY_INVOCATION_SCHEMA_VERSION = "ambient-callable-workflow-symphony-invocation-v1" as const;
export const CALLABLE_WORKFLOW_CATALOG_STATUS_SCHEMA_VERSION = "ambient-callable-workflow-catalog-status-v1" as const;
export const CALLABLE_WORKFLOW_CATALOG_SEARCH_SCHEMA_VERSION = "ambient-callable-workflow-catalog-search-v1" as const;
export const CALLABLE_WORKFLOW_CATALOG_DESCRIBE_SCHEMA_VERSION = "ambient-callable-workflow-catalog-describe-v1" as const;

export type CallableWorkflowToolSourceKind = "symphony_recipe" | "recorded_workflow";
export type CallableWorkflowToolVisibility = "hidden_feature_disabled" | "parent_pi_visible" | "child_role_policy_required";
export type CallableWorkflowExecutionMode = "visible_background_task";
export type CallableWorkflowCatalogEntryStatus = "parent_pi_visible" | "hidden_feature_disabled" | "excluded_not_callable";
export type CallableWorkflowCatalogChildAccessStatus = "role_policy_required" | "not_available";
export type CallableWorkflowCatalogSearchScope = "parent_pi_visible" | "child_granted" | "diagnostic_all";

export interface CallableWorkflowJsonSchema {
  type: "object";
  additionalProperties: false;
  required: string[];
  properties: Record<string, { type: string; description: string }>;
}

export interface CallableWorkflowSymphonyStepSelection {
  stepId: string;
  question: string;
  selectedChoiceId?: string;
  selectedChoiceLabel?: string;
  selectedChoiceDescription?: string;
  customText?: string;
  resolvedText: string;
}

export interface CallableWorkflowSymphonyMetricCriterion {
  templateId: string;
  kind: string;
  label: string;
  prompt: string;
  value: string;
}

export interface CallableWorkflowSymphonyInvocationCustomization {
  schemaVersion: typeof CALLABLE_WORKFLOW_SYMPHONY_INVOCATION_SCHEMA_VERSION;
  stepSelections: CallableWorkflowSymphonyStepSelection[];
  metricCriteria: CallableWorkflowSymphonyMetricCriterion[];
}

export interface CallableWorkflowToolDescriptor {
  schemaVersion: typeof CALLABLE_WORKFLOW_TOOL_SCHEMA_VERSION;
  id: string;
  name: string;
  label: string;
  description: string;
  source: {
    kind: CallableWorkflowToolSourceKind;
    recipeId?: SymphonyWorkflowPatternId;
    recipeSchemaVersion?: string;
    playbookId?: string;
    playbookVersion?: number;
    playbookStatus?: WorkflowRecordingPlaybookDraft["status"];
  };
  sourceContext: CallableWorkflowSourceContext;
  requiredFeatureFlag: typeof AMBIENT_SUBAGENTS_FEATURE_FLAG;
  visibility: CallableWorkflowToolVisibility;
  inputSchema: CallableWorkflowJsonSchema;
  validationRepair: "json_schema_then_repair";
  execution: {
    mode: CallableWorkflowExecutionMode;
    defaultBlocking: boolean;
    progressVisible: true;
    tokenCostTracking: true;
    pauseResumeCancel: true;
  };
  policySnapshot: {
    parentPiVisible: boolean;
    childAccess: "blocked_by_default";
    childRolePolicyRequired: true;
    nestedFanoutLimitRequired: true;
    defaultCollapsedChildThreads: true;
    launchCardRequirementIds: string[];
    metricTemplateIds: string[];
    maxFanout: number;
    maxDepth: number;
    maxTokenBudget: number;
    maxLocalMemoryBytes: number;
    recorderCompactInvocationByDefault: boolean;
    fullTraceArtifact: boolean;
  };
}

export type CallableWorkflowSourceContext =
  | {
      kind: "symphony_recipe";
      title: string;
      summary: string;
      recipeId: SymphonyWorkflowPatternId;
      recipeSchemaVersion: string;
      defaultRoles: string[];
      sourcePreview?: CallableWorkflowSourcePreview;
      builderSteps: Array<{
        id: string;
        question: string;
        impact: string;
        choices: string[];
      }>;
      metricTemplates: Array<{
        id: string;
        kind: string;
        label: string;
        prompt: string;
      }>;
      invocationCustomization?: CallableWorkflowSymphonyInvocationCustomization;
      hardLimits: SymphonyWorkflowRecipePreset["hardLimits"];
      recorderPolicy: SymphonyWorkflowRecipePreset["recorderPolicy"];
    }
  | {
      kind: "recorded_workflow";
      title: string;
      summary: string;
      playbookId: string;
      playbookVersion: number;
      playbookSource: WorkflowRecordingPlaybookDraft["source"];
      sourcePreview?: CallableWorkflowSourcePreview;
      intent: string;
      inputs: string[];
      successfulExamples: WorkflowRecordingPlaybookDraft["successfulExamples"];
      doNot: WorkflowRecordingPlaybookDraft["doNot"];
      validation: string[];
      outputShape: string[];
      markdownPreview: string;
      recorderCompactInvocationByDefault: true;
      fullTraceArtifact: true;
      callableInvocation?: {
        schemaVersion: "ambient-workflow-recording-callable-invocation-v1";
        mode: "compact_callable_invocation";
        source: "workflow_recorder";
        defaultInvocation: string;
        invocationArtifact: string;
        diagnosticsTraceArtifact: string;
        inputKeys: string[];
        inputSchemaHintKeys: string[];
      };
    };

export interface CallableWorkflowRegistry {
  schemaVersion: typeof CALLABLE_WORKFLOW_REGISTRY_SCHEMA_VERSION;
  featureFlagEnabled: boolean;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  tools: CallableWorkflowToolDescriptor[];
  hiddenToolCount: number;
  catalogStatus: CallableWorkflowCatalogStatus;
}

export interface CallableWorkflowCatalogEntry {
  id: string;
  sourceKind: CallableWorkflowToolSourceKind;
  sourceId: string;
  sourceVersion?: string | number;
  label: string;
  summary: string;
  status: CallableWorkflowCatalogEntryStatus;
  toolId?: string;
  toolName?: string;
  visibility?: CallableWorkflowToolVisibility;
  parentPiVisible: boolean;
  childAccessStatus: CallableWorkflowCatalogChildAccessStatus;
  nestedFanoutLimitRequired: boolean;
  executionMode?: CallableWorkflowExecutionMode;
  defaultBlocking?: boolean;
  inputSchemaRequired: string[];
  launchCardRequirementIds: string[];
  metricTemplateIds: string[];
  sourcePreview?: CallableWorkflowSourcePreview;
  sourceSearchTerms: string[];
  exclusionReasons: string[];
}

export interface CallableWorkflowCatalogStatus {
  schemaVersion: typeof CALLABLE_WORKFLOW_CATALOG_STATUS_SCHEMA_VERSION;
  featureFlagEnabled: boolean;
  callableToolCount: number;
  visibleParentToolCount: number;
  hiddenFeatureDisabledCount: number;
  childRolePolicyRequiredCount: number;
  excludedRecordedWorkflowCount: number;
  symphonyRecipeCount: number;
  recordedWorkflowCount: number;
  entries: CallableWorkflowCatalogEntry[];
}

export interface CallableWorkflowCatalogSearchResult {
  id: string;
  label: string;
  summary: string;
  sourceKind: CallableWorkflowToolSourceKind;
  sourceId: string;
  sourceVersion?: string | number;
  status: CallableWorkflowCatalogEntryStatus;
  toolName?: string;
  parentPiVisible: boolean;
  childAccessStatus: CallableWorkflowCatalogChildAccessStatus;
  nestedFanoutLimitRequired: boolean;
  inputSchemaRequired: string[];
  launchCardRequirementIds: string[];
  metricTemplateIds: string[];
  readinessLabels: string[];
  nextActionLabel: string;
  sourcePreviewLabel?: string;
  sourcePreviewDslStatus?: string;
  sourcePreviewSnippet?: string;
  exclusionReasons: string[];
  score: number;
  searchText: string;
}

export interface CallableWorkflowCatalogSearch {
  schemaVersion: typeof CALLABLE_WORKFLOW_CATALOG_SEARCH_SCHEMA_VERSION;
  query: string;
  scope: CallableWorkflowCatalogSearchScope;
  includeUnavailable: boolean;
  limit: number;
  totalEntryCount: number;
  searchedEntryCount: number;
  resultCount: number;
  results: CallableWorkflowCatalogSearchResult[];
  guidance: string[];
}

export interface CallableWorkflowCatalogEntryDescription extends CallableWorkflowCatalogSearchResult {
  defaultBlocking?: boolean;
  execution?: CallableWorkflowToolDescriptor["execution"];
  inputSchema?: CallableWorkflowJsonSchema;
  policySnapshot?: CallableWorkflowToolDescriptor["policySnapshot"];
  sourceContext?: CallableWorkflowSourceContext;
  sourcePreview?: CallableWorkflowSourcePreview;
}

export interface CallableWorkflowCatalogDescription {
  schemaVersion: typeof CALLABLE_WORKFLOW_CATALOG_DESCRIBE_SCHEMA_VERSION;
  status: "described" | "not_found";
  entryId?: string;
  toolName?: string;
  sourceId?: string;
  query: string;
  scope: CallableWorkflowCatalogSearchScope;
  includeUnavailable: boolean;
  description?: CallableWorkflowCatalogEntryDescription;
  guidance: string[];
}

export interface CallableWorkflowChildRolePolicy {
  roleId: SubagentRoleId;
  allowCallableWorkflowTools: boolean;
  allowedToolNames?: string[];
  nestedFanoutLimit?: number;
}

export interface CallableWorkflowInputValidation {
  valid: boolean;
  value?: Record<string, unknown>;
  errors: string[];
}

export interface CallableWorkflowInputRepair {
  repaired: boolean;
  value?: Record<string, unknown>;
  validation: CallableWorkflowInputValidation;
  repairNotes: string[];
}

export interface CallableWorkflowRunPlan {
  schemaVersion: typeof CALLABLE_WORKFLOW_RUN_PLAN_SCHEMA_VERSION;
  toolName: string;
  toolId: string;
  source: CallableWorkflowToolDescriptor["source"];
  sourceContext: CallableWorkflowSourceContext;
  input: Record<string, unknown>;
  blocking: boolean;
  execution: CallableWorkflowToolDescriptor["execution"];
  policySnapshot: CallableWorkflowToolDescriptor["policySnapshot"];
  launchCard: CallableWorkflowLaunchCardSummary;
}

export function buildCallableWorkflowRegistry(input: {
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  recordedWorkflowPlaybooks?: WorkflowRecordingLibraryDescription[];
  includeHiddenWhenDisabled?: boolean;
}): CallableWorkflowRegistry {
  const featureFlagEnabled = isAmbientSubagentsEnabled(input.featureFlagSnapshot);
  const recordedWorkflowPlaybooks = input.recordedWorkflowPlaybooks ?? [];
  const callableRecordedWorkflowPlaybooks = recordedWorkflowPlaybooks.filter(recordedWorkflowPlaybookIsCallable);
  const excludedRecordedWorkflowPlaybooks = recordedWorkflowPlaybooks.filter((entry) => !recordedWorkflowPlaybookIsCallable(entry));
  const allTools = [
    ...listSymphonyWorkflowRecipePresets().map((recipe) => compileSymphonyRecipeToCallableWorkflowTool(recipe, featureFlagEnabled)),
    ...callableRecordedWorkflowPlaybooks.map((playbook) =>
      compileRecordedWorkflowPlaybookToCallableWorkflowTool(playbook, featureFlagEnabled),
    ),
  ];
  const tools = featureFlagEnabled || input.includeHiddenWhenDisabled ? allTools : [];
  return {
    schemaVersion: CALLABLE_WORKFLOW_REGISTRY_SCHEMA_VERSION,
    featureFlagEnabled,
    featureFlagSnapshot: input.featureFlagSnapshot,
    tools,
    hiddenToolCount: featureFlagEnabled ? 0 : allTools.length,
    catalogStatus: buildCallableWorkflowCatalogStatus({
      featureFlagEnabled,
      tools: allTools,
      excludedRecordedWorkflowPlaybooks,
    }),
  };
}

export function buildCallableWorkflowCatalogStatus(input: {
  featureFlagEnabled: boolean;
  tools: readonly CallableWorkflowToolDescriptor[];
  excludedRecordedWorkflowPlaybooks?: readonly WorkflowRecordingLibraryDescription[];
}): CallableWorkflowCatalogStatus {
  const entries = [
    ...input.tools.map(callableWorkflowCatalogEntryFromTool),
    ...(input.excludedRecordedWorkflowPlaybooks ?? []).map(callableWorkflowCatalogEntryFromExcludedRecordedWorkflow),
  ];
  return {
    schemaVersion: CALLABLE_WORKFLOW_CATALOG_STATUS_SCHEMA_VERSION,
    featureFlagEnabled: input.featureFlagEnabled,
    callableToolCount: input.tools.length,
    visibleParentToolCount: entries.filter((entry) => entry.parentPiVisible).length,
    hiddenFeatureDisabledCount: entries.filter((entry) => entry.status === "hidden_feature_disabled").length,
    childRolePolicyRequiredCount: entries.filter((entry) => entry.childAccessStatus === "role_policy_required").length,
    excludedRecordedWorkflowCount: entries.filter((entry) => entry.status === "excluded_not_callable").length,
    symphonyRecipeCount: entries.filter((entry) => entry.sourceKind === "symphony_recipe").length,
    recordedWorkflowCount: entries.filter((entry) => entry.sourceKind === "recorded_workflow").length,
    entries,
  };
}

export function searchCallableWorkflowCatalog(input: {
  catalogStatus: CallableWorkflowCatalogStatus;
  query?: string;
  scope?: CallableWorkflowCatalogSearchScope;
  childGrantedToolNames?: readonly string[];
  includeUnavailable?: boolean;
  limit?: number;
}): CallableWorkflowCatalogSearch {
  return searchCallableWorkflowCatalogEntries({
    ...input,
    schemaVersion: CALLABLE_WORKFLOW_CATALOG_SEARCH_SCHEMA_VERSION,
  });
}

export function describeCallableWorkflowCatalogEntry(input: {
  registry: CallableWorkflowRegistry;
  entryId?: string;
  toolName?: string;
  sourceId?: string;
  query?: string;
  scope?: CallableWorkflowCatalogSearchScope;
  childGrantedToolNames?: readonly string[];
  includeUnavailable?: boolean;
}): CallableWorkflowCatalogDescription {
  return describeCallableWorkflowCatalogEntryDetails({
    ...input,
    schemaVersion: CALLABLE_WORKFLOW_CATALOG_DESCRIBE_SCHEMA_VERSION,
  });
}

export function parentPiVisibleCallableWorkflowTools(registry: CallableWorkflowRegistry): CallableWorkflowToolDescriptor[] {
  if (!registry.featureFlagEnabled) return [];
  return registry.tools
    .filter((tool) => tool.visibility === "parent_pi_visible" && tool.policySnapshot.parentPiVisible)
    .map(cloneCallableWorkflowTool);
}

export function childVisibleCallableWorkflowTools(
  registry: CallableWorkflowRegistry,
  policy?: CallableWorkflowChildRolePolicy,
): CallableWorkflowToolDescriptor[] {
  if (!registry.featureFlagEnabled || !policy?.allowCallableWorkflowTools || !positiveInteger(policy.nestedFanoutLimit)) return [];
  const allowedNames = policy.allowedToolNames ? new Set(policy.allowedToolNames) : undefined;
  return registry.tools
    .filter((tool) => tool.visibility === "parent_pi_visible")
    .filter((tool) => !allowedNames || allowedNames.has(tool.name))
    .map((tool) => ({
      ...cloneCallableWorkflowTool(tool),
      visibility: "child_role_policy_required",
    }));
}

export function compileSymphonyRecipeToCallableWorkflowTool(
  recipe: SymphonyWorkflowRecipePreset,
  featureFlagEnabled: boolean,
): CallableWorkflowToolDescriptor {
  const name = callableWorkflowToolName(recipe.id);
  return {
    schemaVersion: CALLABLE_WORKFLOW_TOOL_SCHEMA_VERSION,
    id: `symphony:${recipe.id}`,
    name,
    label: `Symphony ${recipe.label}`,
    description: recipe.summary,
    source: {
      kind: "symphony_recipe",
      recipeId: recipe.id,
      recipeSchemaVersion: recipe.schemaVersion,
    },
    sourceContext: symphonyRecipeSourceContext(recipe),
    requiredFeatureFlag: AMBIENT_SUBAGENTS_FEATURE_FLAG,
    visibility: featureFlagEnabled ? "parent_pi_visible" : "hidden_feature_disabled",
    inputSchema: callableWorkflowInputSchema(recipe),
    validationRepair: recipe.callableToolPolicy.validationRepair,
    execution: {
      mode: "visible_background_task",
      defaultBlocking: false,
      progressVisible: true,
      tokenCostTracking: true,
      pauseResumeCancel: true,
    },
    policySnapshot: {
      parentPiVisible: featureFlagEnabled && recipe.callableToolPolicy.parentVisibility === "parent_pi_visible_by_default",
      childAccess: "blocked_by_default",
      childRolePolicyRequired: true,
      nestedFanoutLimitRequired: true,
      defaultCollapsedChildThreads: recipe.defaultCollapsedChildThreads,
      launchCardRequirementIds: recipe.launchCardRequirements.map((requirement) => requirement.id),
      metricTemplateIds: recipe.metricTemplates.map((template) => template.id),
      maxFanout: recipe.hardLimits.maxFanout,
      maxDepth: recipe.hardLimits.maxDepth,
      maxTokenBudget: recipe.hardLimits.maxTokenBudget,
      maxLocalMemoryBytes: recipe.hardLimits.maxLocalMemoryBytes,
      recorderCompactInvocationByDefault: recipe.recorderPolicy.compactInvocationByDefault,
      fullTraceArtifact: recipe.recorderPolicy.fullTraceArtifact,
    },
  };
}

export function compileRecordedWorkflowPlaybookToCallableWorkflowTool(
  entry: WorkflowRecordingLibraryDescription,
  featureFlagEnabled: boolean,
): CallableWorkflowToolDescriptor {
  if (!recordedWorkflowPlaybookIsCallable(entry)) {
    throw new Error(`Recorded workflow playbook is not callable: ${entry.id}`);
  }
  const playbook = entry.playbook;
  const name = recordedWorkflowToolName(entry);
  const inputSchema = recordedWorkflowInputSchema(playbook);
  return {
    schemaVersion: CALLABLE_WORKFLOW_TOOL_SCHEMA_VERSION,
    id: `recorded:${entry.id}:v${entry.version}`,
    name,
    label: `Workflow ${entry.title}`,
    description: entry.summary || playbook.intent,
    source: {
      kind: "recorded_workflow",
      playbookId: entry.id,
      playbookVersion: entry.version,
      playbookStatus: playbook.status,
    },
    sourceContext: recordedWorkflowSourceContext(entry, playbook),
    requiredFeatureFlag: AMBIENT_SUBAGENTS_FEATURE_FLAG,
    visibility: featureFlagEnabled ? "parent_pi_visible" : "hidden_feature_disabled",
    inputSchema,
    validationRepair: "json_schema_then_repair",
    execution: {
      mode: "visible_background_task",
      defaultBlocking: false,
      progressVisible: true,
      tokenCostTracking: true,
      pauseResumeCancel: true,
    },
    policySnapshot: {
      parentPiVisible: featureFlagEnabled,
      childAccess: "blocked_by_default",
      childRolePolicyRequired: true,
      nestedFanoutLimitRequired: true,
      defaultCollapsedChildThreads: true,
      launchCardRequirementIds: ["recorded_playbook_confirmed", "input_schema_confirmed", "trace_diagnostics_artifact"],
      metricTemplateIds: playbook.validation.map((_, index) => `recorded-validation-${index + 1}`),
      maxFanout: 1,
      maxDepth: 1,
      maxTokenBudget: 60_000,
      maxLocalMemoryBytes: 2 * 1024 * 1024 * 1024,
      recorderCompactInvocationByDefault: true,
      fullTraceArtifact: true,
    },
  };
}

function symphonyRecipeSourceContext(recipe: SymphonyWorkflowRecipePreset): CallableWorkflowSourceContext {
  return {
    kind: "symphony_recipe",
    title: `Symphony ${recipe.label}`,
    summary: recipe.summary,
    recipeId: recipe.id,
    recipeSchemaVersion: recipe.schemaVersion,
    defaultRoles: [...recipe.defaultRoles],
    sourcePreview: cloneSourcePreview(recipe.sourcePreview),
    builderSteps: recipe.builderSteps.map((step) => ({
      id: step.id,
      question: step.question,
      impact: step.impact,
      choices: step.choices.map((choice) => `${choice.label}: ${choice.description}`),
    })),
    metricTemplates: recipe.metricTemplates.map((template) => ({
      id: template.id,
      kind: template.kind,
      label: template.label,
      prompt: template.prompt,
    })),
    hardLimits: { ...recipe.hardLimits },
    recorderPolicy: { ...recipe.recorderPolicy },
  };
}

function recordedWorkflowSourceContext(
  entry: WorkflowRecordingLibraryDescription,
  playbook: WorkflowRecordingPlaybookDraft & { status: "confirmed" },
): CallableWorkflowSourceContext {
  const callableInvocation = recordedWorkflowCallableInvocationSourceContext(entry.callableInvocation);
  const sourcePreview = recordedWorkflowSourcePreview(entry, playbook);
  return {
    kind: "recorded_workflow",
    title: entry.title,
    summary: entry.summary || playbook.intent,
    playbookId: entry.id,
    playbookVersion: entry.version,
    playbookSource: playbook.source,
    sourcePreview,
    intent: playbook.intent,
    inputs: playbook.inputs.map((item) => truncate(item, 600)),
    successfulExamples: playbook.successfulExamples.map((example) => ({
      ...example,
      ...(example.inputPreview ? { inputPreview: truncate(example.inputPreview, 600) } : {}),
      ...(example.resultPreview ? { resultPreview: truncate(example.resultPreview, 600) } : {}),
      ...(example.artifactPath ? { artifactPath: truncate(example.artifactPath, 600) } : {}),
    })),
    doNot: playbook.doNot.map((pattern) => ({
      ...pattern,
      reason: truncate(pattern.reason, 600),
    })),
    validation: playbook.validation.map((item) => truncate(item, 600)),
    outputShape: playbook.outputShape.map((item) => truncate(item, 600)),
    markdownPreview: truncate(entry.markdownPreview, 2000),
    recorderCompactInvocationByDefault: true,
    fullTraceArtifact: true,
    ...(callableInvocation ? { callableInvocation } : {}),
  };
}

function recordedWorkflowCallableInvocationSourceContext(
  invocation: WorkflowRecordingLibraryDescription["callableInvocation"],
): Extract<CallableWorkflowSourceContext, { kind: "recorded_workflow" }>["callableInvocation"] | undefined {
  if (!invocation) return undefined;
  return {
    schemaVersion: invocation.schemaVersion,
    mode: invocation.mode,
    source: invocation.source,
    defaultInvocation: invocation.callableWorkflow.defaultInvocation,
    invocationArtifact: invocation.callableWorkflow.invocation,
    diagnosticsTraceArtifact: invocation.callableWorkflow.diagnosticsTrace,
    inputKeys: Object.keys(invocation.input),
    inputSchemaHintKeys: Object.keys(invocation.inputSchemaHints?.properties ?? {}),
  };
}

function callableWorkflowSourcePreview(context: CallableWorkflowSourceContext): CallableWorkflowSourcePreview | undefined {
  return context.sourcePreview ? cloneSourcePreview(context.sourcePreview) : undefined;
}

function recordedWorkflowSourcePreview(
  entry: WorkflowRecordingLibraryDescription,
  playbook: WorkflowRecordingPlaybookDraft & { status: "confirmed" },
): CallableWorkflowSourcePreview {
  return {
    schemaVersion: "ambient-callable-workflow-source-preview-v1",
    label: `Readable source preview for workflow ${entry.title}`,
    format: "recorded_workflow_markdown_preview",
    executable: false,
    dslStatus: "recorded_invocation_preview",
    text: recordedWorkflowSourcePreviewText(entry, playbook),
    searchTerms: recordedWorkflowSourceSearchTerms(entry, playbook),
  };
}

function recordedWorkflowSourcePreviewForEntry(entry: WorkflowRecordingLibraryDescription): CallableWorkflowSourcePreview | undefined {
  if (!entry.playbook) return undefined;
  return {
    schemaVersion: "ambient-callable-workflow-source-preview-v1",
    label: `Readable source preview for workflow ${entry.title}`,
    format: "recorded_workflow_markdown_preview",
    executable: false,
    dslStatus: "recorded_invocation_preview",
    text: recordedWorkflowSourcePreviewText(entry, entry.playbook),
    searchTerms: recordedWorkflowSourceSearchTerms(entry, entry.playbook),
  };
}

function recordedWorkflowSourcePreviewText(entry: WorkflowRecordingLibraryDescription, playbook: WorkflowRecordingPlaybookDraft): string {
  return [
    `recorded_workflow ${entry.id}`,
    `title: ${entry.title}`,
    `version: ${Math.max(1, Math.floor(entry.version || 1))}`,
    `status: ${playbook.status}`,
    "dsl_status: recorded_invocation_preview",
    "executable: false",
    `summary: ${entry.summary || playbook.intent}`,
    `intent: ${playbook.intent}`,
    `inputs: ${playbook.inputs.join(" | ") || "none"}`,
    `validation: ${playbook.validation.join(" | ") || "none"}`,
    `output_shape: ${playbook.outputShape.join(" | ") || "none"}`,
    entry.callableInvocation
      ? `compact_invocation_artifact: ${entry.callableInvocation.callableWorkflow.invocation}`
      : "compact_invocation_artifact: unavailable",
    `markdown_preview: ${truncate(entry.markdownPreview.replace(/\s+/g, " ").trim(), 1200) || "none"}`,
  ].join("\n");
}

function recordedWorkflowSourceSearchTerms(entry: WorkflowRecordingLibraryDescription, playbook: WorkflowRecordingPlaybookDraft): string[] {
  const terms = [
    entry.id,
    entry.title,
    entry.summary,
    entry.markdownPreview,
    playbook.status,
    playbook.source,
    playbook.intent,
    ...playbook.inputs,
    ...playbook.validation,
    ...playbook.outputShape,
    ...(entry.callableInvocation
      ? [
          entry.callableInvocation.callableWorkflow.defaultInvocation,
          entry.callableInvocation.callableWorkflow.invocation,
          entry.callableInvocation.callableWorkflow.diagnosticsTrace,
        ]
      : []),
  ];
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
}

export function buildCallableWorkflowRunPlan(tool: CallableWorkflowToolDescriptor, input: unknown): CallableWorkflowRunPlan {
  return buildCallableWorkflowRunPlanFromTool({
    tool,
    rawInput: input,
    runPlanSchemaVersion: CALLABLE_WORKFLOW_RUN_PLAN_SCHEMA_VERSION,
    invocationSchemaVersion: CALLABLE_WORKFLOW_SYMPHONY_INVOCATION_SCHEMA_VERSION,
  });
}

export function buildCallableWorkflowLaunchCard(
  tool: CallableWorkflowToolDescriptor,
  input: Record<string, unknown>,
  blocking: boolean,
): CallableWorkflowLaunchCardSummary {
  return buildCallableWorkflowLaunchCardFromTool(tool, input, blocking);
}

export function callableWorkflowToolName(patternId: SymphonyWorkflowPatternId): string {
  return `ambient_workflow_symphony_${patternId}`;
}

export function recordedWorkflowToolName(entry: Pick<WorkflowRecordingLibraryDescription, "id" | "version">): string {
  return `ambient_workflow_recorded_${safeToolNameSegment(entry.id)}_v${Math.max(1, Math.floor(entry.version || 1))}`;
}

function recordedWorkflowPlaybookIsCallable(
  entry: WorkflowRecordingLibraryDescription,
): entry is WorkflowRecordingLibraryDescription & { playbook: WorkflowRecordingPlaybookDraft & { status: "confirmed" } } {
  return recordedWorkflowCallableExclusionReasons(entry).length === 0;
}

function recordedWorkflowCallableExclusionReasons(entry: WorkflowRecordingLibraryDescription): string[] {
  const reasons: string[] = [];
  if (!entry.enabled) reasons.push("recorded_workflow_disabled");
  if (entry.archivedAt) reasons.push("recorded_workflow_archived");
  if (!entry.playbook) {
    reasons.push("recorded_playbook_missing");
  } else if (entry.playbook.status !== "confirmed") {
    reasons.push(`recorded_playbook_${entry.playbook.status || "unknown"}_not_confirmed`);
  }
  return reasons;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function safeToolNameSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "playbook";
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function callableWorkflowCatalogEntryFromTool(tool: CallableWorkflowToolDescriptor): CallableWorkflowCatalogEntry {
  const parentPiVisible = tool.visibility === "parent_pi_visible" && tool.policySnapshot.parentPiVisible;
  const sourcePreview = callableWorkflowSourcePreview(tool.sourceContext);
  const sourceId = tool.source.kind === "symphony_recipe" ? (tool.source.recipeId ?? tool.id) : (tool.source.playbookId ?? tool.id);
  const sourceVersion = tool.source.kind === "symphony_recipe" ? tool.source.recipeSchemaVersion : tool.source.playbookVersion;
  return {
    id: tool.id,
    sourceKind: tool.source.kind,
    sourceId,
    ...(sourceVersion !== undefined ? { sourceVersion } : {}),
    label: tool.label,
    summary: tool.description,
    status: tool.visibility === "hidden_feature_disabled" ? "hidden_feature_disabled" : "parent_pi_visible",
    toolId: tool.id,
    toolName: tool.name,
    visibility: tool.visibility,
    parentPiVisible,
    childAccessStatus: parentPiVisible ? "role_policy_required" : "not_available",
    nestedFanoutLimitRequired: parentPiVisible && tool.policySnapshot.nestedFanoutLimitRequired,
    executionMode: tool.execution.mode,
    defaultBlocking: tool.execution.defaultBlocking,
    inputSchemaRequired: [...tool.inputSchema.required],
    launchCardRequirementIds: [...tool.policySnapshot.launchCardRequirementIds],
    metricTemplateIds: [...tool.policySnapshot.metricTemplateIds],
    ...(sourcePreview ? { sourcePreview } : {}),
    sourceSearchTerms: sourcePreview?.searchTerms ? [...sourcePreview.searchTerms] : [],
    exclusionReasons: tool.visibility === "hidden_feature_disabled" ? [AMBIENT_SUBAGENTS_FEATURE_FLAG] : [],
  };
}

function callableWorkflowCatalogEntryFromExcludedRecordedWorkflow(
  entry: WorkflowRecordingLibraryDescription,
): CallableWorkflowCatalogEntry {
  const reasons = recordedWorkflowCallableExclusionReasons(entry);
  const sourceVersion = Math.max(1, Math.floor(entry.version || 1));
  const sourcePreview = recordedWorkflowSourcePreviewForEntry(entry);
  return {
    id: `recorded:${entry.id}:v${sourceVersion}`,
    sourceKind: "recorded_workflow",
    sourceId: entry.id,
    sourceVersion,
    label: `Workflow ${entry.title}`,
    summary: entry.summary || entry.playbook?.intent || "Recorded workflow is not callable yet.",
    status: "excluded_not_callable",
    parentPiVisible: false,
    childAccessStatus: "not_available",
    nestedFanoutLimitRequired: false,
    inputSchemaRequired: [],
    launchCardRequirementIds: [],
    metricTemplateIds: [],
    ...(sourcePreview ? { sourcePreview } : {}),
    sourceSearchTerms: sourcePreview?.searchTerms ? [...sourcePreview.searchTerms] : [],
    exclusionReasons: reasons.length ? reasons : ["recorded_workflow_not_callable"],
  };
}
