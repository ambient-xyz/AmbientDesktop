import {
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  isAmbientSubagentsEnabled,
  type AmbientFeatureFlagSnapshot,
} from "../../shared/featureFlags";
import { buildCallableWorkflowLaunchCardSummary } from "../../shared/callableWorkflowLaunchCards";
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
} from "../../shared/types";

export const CALLABLE_WORKFLOW_REGISTRY_SCHEMA_VERSION = "ambient-callable-workflow-registry-v1" as const;
export const CALLABLE_WORKFLOW_TOOL_SCHEMA_VERSION = "ambient-callable-workflow-tool-v1" as const;
export const CALLABLE_WORKFLOW_RUN_PLAN_SCHEMA_VERSION = "ambient-callable-workflow-run-plan-v1" as const;
export const CALLABLE_WORKFLOW_SYMPHONY_INVOCATION_SCHEMA_VERSION =
  "ambient-callable-workflow-symphony-invocation-v1" as const;
export const CALLABLE_WORKFLOW_CATALOG_STATUS_SCHEMA_VERSION =
  "ambient-callable-workflow-catalog-status-v1" as const;
export const CALLABLE_WORKFLOW_CATALOG_SEARCH_SCHEMA_VERSION =
  "ambient-callable-workflow-catalog-search-v1" as const;
export const CALLABLE_WORKFLOW_CATALOG_DESCRIBE_SCHEMA_VERSION =
  "ambient-callable-workflow-catalog-describe-v1" as const;

export type CallableWorkflowToolSourceKind = "symphony_recipe" | "recorded_workflow";
export type CallableWorkflowToolVisibility = "hidden_feature_disabled" | "parent_pi_visible" | "child_role_policy_required";
export type CallableWorkflowExecutionMode = "visible_background_task";
export type CallableWorkflowCatalogEntryStatus =
  | "parent_pi_visible"
  | "hidden_feature_disabled"
  | "excluded_not_callable";
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
  const excludedRecordedWorkflowPlaybooks = recordedWorkflowPlaybooks.filter((entry) =>
    !recordedWorkflowPlaybookIsCallable(entry)
  );
  const allTools = [
    ...listSymphonyWorkflowRecipePresets().map((recipe) =>
      compileSymphonyRecipeToCallableWorkflowTool(recipe, featureFlagEnabled)
    ),
    ...callableRecordedWorkflowPlaybooks
      .map((playbook) => compileRecordedWorkflowPlaybookToCallableWorkflowTool(playbook, featureFlagEnabled)),
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
    ...((input.excludedRecordedWorkflowPlaybooks ?? []).map(callableWorkflowCatalogEntryFromExcludedRecordedWorkflow)),
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
  const query = normalizedQuery(input.query);
  const scope = input.scope ?? (input.childGrantedToolNames ? "child_granted" : "parent_pi_visible");
  const includeUnavailable = Boolean(input.includeUnavailable);
  const limit = boundedSearchLimit(input.limit);
  const queryTokens = query ? query.split(/\s+/).filter(Boolean) : [];
  const childGrantedToolNames = new Set(input.childGrantedToolNames ?? []);
  const candidates = input.catalogStatus.entries
    .filter((entry) => callableWorkflowCatalogEntryInSearchScope(entry, { scope, includeUnavailable, childGrantedToolNames }))
    .map((entry) => callableWorkflowCatalogSearchResult(entry, queryTokens))
    .filter((result) => queryTokens.length === 0 || result.score > 0)
    .sort(callableWorkflowCatalogSearchResultSort)
    .slice(0, limit);

  return {
    schemaVersion: CALLABLE_WORKFLOW_CATALOG_SEARCH_SCHEMA_VERSION,
    query,
    scope,
    includeUnavailable,
    limit,
    totalEntryCount: input.catalogStatus.entries.length,
    searchedEntryCount: input.catalogStatus.entries.filter((entry) =>
      callableWorkflowCatalogEntryInSearchScope(entry, { scope, includeUnavailable, childGrantedToolNames })
    ).length,
    resultCount: candidates.length,
    results: candidates,
    guidance: callableWorkflowCatalogSearchGuidance({ scope, includeUnavailable, resultCount: candidates.length }),
  };
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
  const query = normalizedQuery(input.query);
  const scope = input.scope ?? (input.childGrantedToolNames ? "child_granted" : "parent_pi_visible");
  const includeUnavailable = Boolean(input.includeUnavailable);
  const childGrantedToolNames = new Set(input.childGrantedToolNames ?? []);
  const scopedEntries = input.registry.catalogStatus.entries.filter((entry) =>
    callableWorkflowCatalogEntryInSearchScope(entry, { scope, includeUnavailable, childGrantedToolNames })
  );
  const selected = selectCallableWorkflowCatalogEntry(scopedEntries, {
    entryId: optionalString(input.entryId),
    toolName: optionalString(input.toolName),
    sourceId: optionalString(input.sourceId),
    query,
  });

  return {
    schemaVersion: CALLABLE_WORKFLOW_CATALOG_DESCRIBE_SCHEMA_VERSION,
    status: selected ? "described" : "not_found",
    ...(input.entryId ? { entryId: input.entryId } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    query,
    scope,
    includeUnavailable,
    ...(selected ? { description: callableWorkflowCatalogEntryDescription(selected, input.registry) } : {}),
    guidance: callableWorkflowCatalogDescribeGuidance({ entry: selected, scope, includeUnavailable }),
  };
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
      launchCardRequirementIds: [
        "recorded_playbook_confirmed",
        "input_schema_confirmed",
        "trace_diagnostics_artifact",
      ],
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

function recordedWorkflowSourcePreviewForEntry(
  entry: WorkflowRecordingLibraryDescription,
): CallableWorkflowSourcePreview | undefined {
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

function recordedWorkflowSourcePreviewText(
  entry: WorkflowRecordingLibraryDescription,
  playbook: WorkflowRecordingPlaybookDraft,
): string {
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

function recordedWorkflowSourceSearchTerms(
  entry: WorkflowRecordingLibraryDescription,
  playbook: WorkflowRecordingPlaybookDraft,
): string[] {
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
    ...(entry.callableInvocation ? [
      entry.callableInvocation.callableWorkflow.defaultInvocation,
      entry.callableInvocation.callableWorkflow.invocation,
      entry.callableInvocation.callableWorkflow.diagnosticsTrace,
    ] : []),
  ];
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
}

export function buildCallableWorkflowRunPlan(
  tool: CallableWorkflowToolDescriptor,
  input: unknown,
): CallableWorkflowRunPlan {
  const repaired = repairCallableWorkflowToolInput(tool, input);
  if (!repaired.validation.valid || !repaired.value) {
    throw new Error(`Callable workflow input failed validation: ${repaired.validation.errors.join("; ")}`);
  }
  const blocking = typeof repaired.value.blocking === "boolean" ? repaired.value.blocking : tool.execution.defaultBlocking;
  const launchCard = buildCallableWorkflowLaunchCard(tool, repaired.value, blocking);
  return {
    schemaVersion: CALLABLE_WORKFLOW_RUN_PLAN_SCHEMA_VERSION,
    toolName: tool.name,
    toolId: tool.id,
    source: { ...tool.source },
    sourceContext: callableWorkflowSourceContextForRun(tool, repaired.value),
    input: repaired.value,
    blocking,
    execution: { ...tool.execution },
    policySnapshot: clonePolicySnapshot(tool.policySnapshot),
    launchCard,
  };
}

export function buildCallableWorkflowLaunchCard(
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

export function validateCallableWorkflowToolInput(
  tool: CallableWorkflowToolDescriptor,
  input: unknown,
): CallableWorkflowInputValidation {
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

export function repairCallableWorkflowToolInput(
  tool: CallableWorkflowToolDescriptor,
  input: unknown,
): CallableWorkflowInputRepair {
  const firstPass = validateCallableWorkflowToolInput(tool, input);
  if (firstPass.valid) return { repaired: false, value: firstPass.value, validation: firstPass, repairNotes: [] };

  const repaired = deterministicCallableWorkflowInputRepair(tool, input);
  const validation = validateCallableWorkflowToolInput(tool, repaired);
  return {
    repaired: validation.valid,
    ...(validation.valid ? { value: validation.value } : {}),
    validation,
    repairNotes: validation.valid
      ? ["Applied deterministic JSON Schema repair for callable workflow tool input."]
      : firstPass.errors,
  };
}

export function callableWorkflowToolName(patternId: SymphonyWorkflowPatternId): string {
  return `ambient_workflow_symphony_${patternId}`;
}

export function recordedWorkflowToolName(entry: Pick<WorkflowRecordingLibraryDescription, "id" | "version">): string {
  return `ambient_workflow_recorded_${safeToolNameSegment(entry.id)}_v${Math.max(1, Math.floor(entry.version || 1))}`;
}

function callableWorkflowInputSchema(recipe: SymphonyWorkflowRecipePreset): CallableWorkflowJsonSchema {
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

function requiredSymphonyMetricCriteriaValidationErrors(
  tool: CallableWorkflowToolDescriptor,
  input: Record<string, unknown>,
): string[] {
  if (tool.source.kind !== "symphony_recipe" || tool.sourceContext.kind !== "symphony_recipe") return [];
  if (!Array.isArray(input.metricCriteria)) return [];
  const criteria = symphonyMetricCriteriaFromInput(tool.sourceContext, input.metricCriteria);
  const presentTemplateIds = new Set(criteria.map((criterion) => criterion.templateId));
  const missingLabels = tool.sourceContext.metricTemplates
    .filter((template) => !presentTemplateIds.has(template.id))
    .map((template) => template.label);
  if (missingLabels.length === 0) return [];
  return [
    `${tool.name} input is missing required Symphony metric criteria: ${missingLabels.join(", ")}`,
  ];
}

function callableWorkflowSourceContextForRun(
  tool: CallableWorkflowToolDescriptor,
  input: Record<string, unknown>,
): CallableWorkflowSourceContext {
  const sourceContext = cloneSourceContext(tool.sourceContext);
  if (sourceContext.kind !== "symphony_recipe") return sourceContext;
  const invocationCustomization = symphonyInvocationCustomizationFromInput(sourceContext, input);
  if (invocationCustomization.stepSelections.length > 0 || invocationCustomization.metricCriteria.length > 0) {
    sourceContext.invocationCustomization = invocationCustomization;
  }
  return sourceContext;
}

function symphonyInvocationCustomizationFromInput(
  context: Extract<CallableWorkflowSourceContext, { kind: "symphony_recipe" }>,
  input: Record<string, unknown>,
): CallableWorkflowSymphonyInvocationCustomization {
  return {
    schemaVersion: CALLABLE_WORKFLOW_SYMPHONY_INVOCATION_SCHEMA_VERSION,
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
    const resolvedText = optionalString(entry.resolvedText)
      ?? customText
      ?? [selectedChoiceLabel, selectedChoiceDescription].filter(Boolean).join(": ");
    if (!resolvedText) return [];
    return [{
      stepId: step.id,
      question: step.question,
      ...(selectedChoiceId ? { selectedChoiceId } : {}),
      ...(selectedChoiceLabel ? { selectedChoiceLabel } : {}),
      ...(selectedChoiceDescription ? { selectedChoiceDescription } : {}),
      ...(customText ? { customText } : {}),
      resolvedText,
    }];
  });
}

function symphonyMetricCriteriaFromInput(
  context: Extract<CallableWorkflowSourceContext, { kind: "symphony_recipe" }>,
  rawCriteria: unknown,
): CallableWorkflowSymphonyMetricCriterion[] {
  const entries = arrayValue(rawCriteria).map(recordValue);
  return context.metricTemplates.flatMap((template) => {
    const entry = entries.find((candidate) =>
      optionalString(candidate.templateId) === template.id || optionalString(candidate.id) === template.id
    );
    const value = entry ? optionalString(entry.value) ?? optionalString(entry.criteria) : undefined;
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

function recordedWorkflowInputSchema(playbook: WorkflowRecordingPlaybookDraft): CallableWorkflowJsonSchema {
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

function deterministicCallableWorkflowInputRepair(
  tool: CallableWorkflowToolDescriptor,
  input: unknown,
): Record<string, unknown> {
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
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function safeToolNameSegment(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "playbook";
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function callableWorkflowCatalogEntryInSearchScope(
  entry: CallableWorkflowCatalogEntry,
  input: {
    scope: CallableWorkflowCatalogSearchScope;
    includeUnavailable: boolean;
    childGrantedToolNames: Set<string>;
  },
): boolean {
  if (input.scope === "diagnostic_all") return input.includeUnavailable || entry.status === "parent_pi_visible";
  if (input.scope === "child_granted") {
    return Boolean(entry.toolName && input.childGrantedToolNames.has(entry.toolName) && entry.status === "parent_pi_visible");
  }
  if (input.includeUnavailable) return true;
  return entry.status === "parent_pi_visible";
}

function selectCallableWorkflowCatalogEntry(
  entries: readonly CallableWorkflowCatalogEntry[],
  input: {
    entryId?: string;
    toolName?: string;
    sourceId?: string;
    query: string;
  },
): CallableWorkflowCatalogEntry | undefined {
  if (input.entryId) return entries.find((entry) => entry.id === input.entryId);
  if (input.toolName) return entries.find((entry) => entry.toolName === input.toolName);
  if (input.sourceId) return entries.find((entry) => entry.sourceId === input.sourceId);
  if (!input.query) return undefined;
  const queryTokens = input.query.split(/\s+/).filter(Boolean);
  return entries
    .map((entry) => ({
      entry,
      result: callableWorkflowCatalogSearchResult(entry, queryTokens),
    }))
    .filter(({ result }) => result.score > 0)
    .sort((left, right) => callableWorkflowCatalogSearchResultSort(left.result, right.result))
    .map(({ entry }) => entry)[0];
}

function callableWorkflowCatalogEntryDescription(
  entry: CallableWorkflowCatalogEntry,
  registry: CallableWorkflowRegistry,
): CallableWorkflowCatalogEntryDescription {
  const result = callableWorkflowCatalogSearchResult(entry, []);
  const tool = entry.toolId ? registry.tools.find((candidate) => candidate.id === entry.toolId) : undefined;
  return {
    ...result,
    ...(entry.defaultBlocking !== undefined ? { defaultBlocking: entry.defaultBlocking } : {}),
    ...(tool ? { execution: { ...tool.execution } } : {}),
    ...(tool ? { inputSchema: cloneCallableWorkflowJsonSchema(tool.inputSchema) } : {}),
    ...(tool ? { policySnapshot: clonePolicySnapshot(tool.policySnapshot) } : {}),
    ...(tool ? { sourceContext: cloneSourceContext(tool.sourceContext) } : {}),
    ...(entry.sourcePreview ? { sourcePreview: cloneSourcePreview(entry.sourcePreview) } : {}),
  };
}

function callableWorkflowCatalogSearchResult(
  entry: CallableWorkflowCatalogEntry,
  queryTokens: readonly string[],
): CallableWorkflowCatalogSearchResult {
  const searchText = callableWorkflowCatalogSearchText(entry);
  const sourcePreview = entry.sourcePreview;
  return {
    id: entry.id,
    label: entry.label,
    summary: entry.summary,
    sourceKind: entry.sourceKind,
    sourceId: entry.sourceId,
    ...(entry.sourceVersion !== undefined ? { sourceVersion: entry.sourceVersion } : {}),
    status: entry.status,
    ...(entry.toolName ? { toolName: entry.toolName } : {}),
    parentPiVisible: entry.parentPiVisible,
    childAccessStatus: entry.childAccessStatus,
    nestedFanoutLimitRequired: entry.nestedFanoutLimitRequired,
    inputSchemaRequired: [...entry.inputSchemaRequired],
    launchCardRequirementIds: [...entry.launchCardRequirementIds],
    metricTemplateIds: [...entry.metricTemplateIds],
    readinessLabels: callableWorkflowCatalogReadinessLabels(entry),
    nextActionLabel: callableWorkflowCatalogNextActionLabel(entry),
    ...(sourcePreview ? { sourcePreviewLabel: sourcePreview.label } : {}),
    ...(sourcePreview ? { sourcePreviewDslStatus: sourcePreview.dslStatus } : {}),
    ...(sourcePreview ? { sourcePreviewSnippet: truncate(sourcePreview.text.replace(/\s+/g, " ").trim(), 280) } : {}),
    exclusionReasons: [...entry.exclusionReasons],
    score: callableWorkflowCatalogSearchScore(entry, searchText, queryTokens),
    searchText,
  };
}

function callableWorkflowCatalogSearchText(entry: CallableWorkflowCatalogEntry): string {
  return [
    entry.id,
    entry.label,
    entry.summary,
    entry.sourceKind,
    entry.sourceId,
    String(entry.sourceVersion ?? ""),
    entry.status,
    entry.toolName ?? "",
    entry.visibility ?? "",
    entry.childAccessStatus,
    entry.executionMode ?? "",
    ...entry.inputSchemaRequired,
    ...entry.launchCardRequirementIds,
    ...entry.metricTemplateIds,
    ...entry.exclusionReasons,
    ...entry.sourceSearchTerms,
    entry.sourcePreview?.label ?? "",
    entry.sourcePreview?.dslStatus ?? "",
  ].join(" ").replace(/\s+/g, " ").trim();
}

function callableWorkflowCatalogSearchScore(
  entry: CallableWorkflowCatalogEntry,
  searchText: string,
  queryTokens: readonly string[],
): number {
  if (queryTokens.length === 0) return callableWorkflowCatalogBaseScore(entry);
  const lowerSearchText = searchText.toLowerCase();
  const lowerLabel = entry.label.toLowerCase();
  const lowerToolName = (entry.toolName ?? "").toLowerCase();
  const lowerSourceId = entry.sourceId.toLowerCase();
  let score = 0;
  let matched = 0;
  for (const token of queryTokens) {
    if (!lowerSearchText.includes(token)) continue;
    matched += 1;
    score += 1;
    if (lowerLabel.includes(token)) score += 4;
    if (lowerToolName.includes(token)) score += 3;
    if (lowerSourceId.includes(token)) score += 2;
  }
  if (matched === 0) return 0;
  return score + callableWorkflowCatalogBaseScore(entry);
}

function callableWorkflowCatalogBaseScore(entry: CallableWorkflowCatalogEntry): number {
  let score = 0;
  if (entry.status === "parent_pi_visible") score += 10;
  if (entry.sourceKind === "symphony_recipe") score += 2;
  if (entry.metricTemplateIds.length > 0) score += 1;
  if (entry.sourcePreview) score += 1;
  return score;
}

function callableWorkflowCatalogSearchResultSort(
  left: CallableWorkflowCatalogSearchResult,
  right: CallableWorkflowCatalogSearchResult,
): number {
  return right.score - left.score
    || left.label.localeCompare(right.label)
    || left.id.localeCompare(right.id);
}

function callableWorkflowCatalogReadinessLabels(entry: CallableWorkflowCatalogEntry): string[] {
  const labels: string[] = [];
  if (entry.status === "parent_pi_visible") labels.push("Parent Pi visible");
  if (entry.status === "hidden_feature_disabled") labels.push("Hidden until ambient.subagents is enabled");
  if (entry.status === "excluded_not_callable") labels.push("Not callable yet");
  if (entry.childAccessStatus === "role_policy_required") labels.push("Child access requires exact role policy");
  if (entry.nestedFanoutLimitRequired) labels.push("Nested fanout budget required");
  if (entry.inputSchemaRequired.length) labels.push(`Schema requires ${entry.inputSchemaRequired.join(", ")}`);
  if (entry.metricTemplateIds.length) labels.push("Metric/rubric criteria required");
  if (entry.sourcePreview) labels.push("Readable source preview available");
  if (entry.sourceKind === "recorded_workflow" && entry.status === "parent_pi_visible") labels.push("Recorded playbook confirmed");
  if (entry.exclusionReasons.length) labels.push(`Excluded: ${entry.exclusionReasons.join(", ")}`);
  return labels;
}

function callableWorkflowCatalogNextActionLabel(entry: CallableWorkflowCatalogEntry): string {
  if (entry.status === "hidden_feature_disabled") return "Enable ambient.subagents before registering this workflow tool.";
  if (entry.status === "excluded_not_callable") {
    return "Confirm, enable, and unarchive the recorded workflow before it can become a callable tool.";
  }
  if (entry.childAccessStatus === "role_policy_required") {
    return entry.toolName
      ? `Call ${entry.toolName} from a parent, or grant that exact tool through child role policy before child use.`
      : "Grant an exact callable workflow tool name through child role policy before child use.";
  }
  return entry.toolName ? `Call ${entry.toolName} with schema-valid input.` : "Use a callable workflow tool with schema-valid input.";
}

function callableWorkflowCatalogSearchGuidance(input: {
  scope: CallableWorkflowCatalogSearchScope;
  includeUnavailable: boolean;
  resultCount: number;
}): string[] {
  const guidance = [
    "Use callable workflow tools only after validating their JSON Schema input and launch-card requirements.",
  ];
  if (input.scope === "child_granted") {
    guidance.push("Child results list only exact workflow tools granted by launch-time child role policy.");
  } else {
    guidance.push("Child sessions need explicit role policy, nested fanout budget, and exact tool-name grants before using workflow tools.");
  }
  if (input.includeUnavailable) {
    guidance.push("Unavailable entries are diagnostic context only and must not be called.");
  }
  if (input.resultCount === 0) {
    guidance.push("No matching callable workflow catalog entries were found for this scope.");
  }
  return guidance;
}

function callableWorkflowCatalogDescribeGuidance(input: {
  entry?: CallableWorkflowCatalogEntry;
  scope: CallableWorkflowCatalogSearchScope;
  includeUnavailable: boolean;
}): string[] {
  if (!input.entry) {
    return [
      "No callable workflow catalog entry matched this request in the current scope.",
      input.scope === "child_granted"
        ? "Child descriptions are limited to exact workflow tools granted by launch-time child role policy."
        : "Use catalog search first, then describe by toolName or entryId before launching.",
    ];
  }
  const guidance = [
    "This catalog description is read-only and does not queue or start a workflow task.",
    input.entry.toolName
      ? `Launch requires a separate call to ${input.entry.toolName} with schema-valid input.`
      : "This entry is not launchable in the current catalog state.",
  ];
  if (input.entry.metricTemplateIds.length > 0) {
    guidance.push(`Provide metricCriteria for: ${input.entry.metricTemplateIds.join(", ")}.`);
  }
  if (input.scope === "child_granted") {
    guidance.push("This child can describe only exact callable workflow tools granted by its role policy.");
  }
  if (input.entry.status !== "parent_pi_visible" || input.includeUnavailable) {
    guidance.push("Unavailable catalog entries are diagnostic context only and must not be called.");
  }
  return guidance;
}

function normalizedQuery(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/\s+/g, " ").trim() : "";
}

function boundedSearchLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 8;
  return Math.min(25, Math.max(1, Math.floor(value)));
}

function callableWorkflowCatalogEntryFromTool(tool: CallableWorkflowToolDescriptor): CallableWorkflowCatalogEntry {
  const parentPiVisible = tool.visibility === "parent_pi_visible" && tool.policySnapshot.parentPiVisible;
  const sourcePreview = callableWorkflowSourcePreview(tool.sourceContext);
  const sourceId = tool.source.kind === "symphony_recipe"
    ? tool.source.recipeId ?? tool.id
    : tool.source.playbookId ?? tool.id;
  const sourceVersion = tool.source.kind === "symphony_recipe"
    ? tool.source.recipeSchemaVersion
    : tool.source.playbookVersion;
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

function cloneCallableWorkflowTool(tool: CallableWorkflowToolDescriptor): CallableWorkflowToolDescriptor {
  return {
    ...tool,
    source: { ...tool.source },
    sourceContext: cloneSourceContext(tool.sourceContext),
    inputSchema: cloneCallableWorkflowJsonSchema(tool.inputSchema),
    execution: { ...tool.execution },
    policySnapshot: clonePolicySnapshot(tool.policySnapshot),
  };
}

function cloneCallableWorkflowJsonSchema(schema: CallableWorkflowJsonSchema): CallableWorkflowJsonSchema {
  return {
    ...schema,
    required: [...schema.required],
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, { ...value }]),
    ),
  };
}

function cloneSourceContext(context: CallableWorkflowSourceContext): CallableWorkflowSourceContext {
  return JSON.parse(JSON.stringify(context)) as CallableWorkflowSourceContext;
}

function cloneSourcePreview(preview: CallableWorkflowSourcePreview): CallableWorkflowSourcePreview {
  return {
    ...preview,
    searchTerms: [...preview.searchTerms],
  };
}

function clonePolicySnapshot(
  snapshot: CallableWorkflowToolDescriptor["policySnapshot"],
): CallableWorkflowToolDescriptor["policySnapshot"] {
  return {
    ...snapshot,
    launchCardRequirementIds: [...snapshot.launchCardRequirementIds],
    metricTemplateIds: [...snapshot.metricTemplateIds],
  };
}
