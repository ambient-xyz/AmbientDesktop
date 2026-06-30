import type { AmbientFeatureFlagId, AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { CallableWorkflowLaunchCardSummary, CallableWorkflowSourcePreview, WorkflowRecordingPlaybookDraft } from "../../shared/workflowTypes";
import type { SubagentRoleId } from "../../shared/subagentRoles";
import type { SymphonyWorkflowPatternId, SymphonyWorkflowRecipePreset } from "../../shared/symphonyWorkflowRecipes";

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
  requiredFeatureFlag: AmbientFeatureFlagId;
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
