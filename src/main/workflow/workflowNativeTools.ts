import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type { InvokeWorkflowNativeToolInput, WorkflowArtifactSummary, WorkflowDashboard, WorkflowDiscoveryCapabilityDescription, WorkflowDiscoveryCapabilitySearch, WorkflowExecutionMode, WorkflowGraphEdge, WorkflowGraphNode, WorkflowGraphSnapshot, WorkflowManifest, WorkflowNativeToolInvocationResult, WorkflowNativeToolName, WorkflowRevisionSummary, WorkflowRunDetail, WorkflowRunLimitOverrides, WorkflowRunRuntime, WorkflowVersionStatus, WorkflowVersionSummary } from "../../shared/workflowTypes";
import { diffWorkflowGraphs, workflowGraphDiffHasChanges, workflowGraphDiffSummary, type WorkflowGraphDiff } from "../../shared/workflowGraphDiff";
import { readWorkflowRunDetail } from "./workflowDashboard";
import { assertWorkflowArtifactSourceEditable, workflowArtifactSourceProvenance } from "./workflowArtifactProvenance";
import { buildWorkflowSourceDiff } from "./workflowDebugRewrite";
import { buildWorkflowDiscoveryPolicyContext } from "../workflow-discovery/workflowDiscoveryPolicy";
import { describeWorkflowDiscoveryCapability, searchWorkflowDiscoveryCapabilities } from "../workflow-discovery/workflowDiscoveryCapabilitySearch";
import { searchAmbientCliCapabilities, type AmbientCliCapabilitySearchResponse } from "../ambient-cli/ambientCliPackages";
import {
  validateWorkflowGraphOutput,
  validateWorkflowSourceConnectorReferences,
  validateWorkflowSourceGraphMappings,
  validateWorkflowSourceReferences,
} from "../workflow-compiler/workflowCompiler";
import { restoreWorkflowVersion } from "./workflowVersionRestore";
import { commitWorkflowVersionRepo } from "./workflowVersioning";
import type { DesktopToolDescriptor } from "./workflowDesktopToolFacade";
import type { ProjectStore } from "./workflowProjectStoreFacade";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import type { WorkflowConnectorDescriptor } from "./workflowConnectors";
import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";

export interface WorkflowNativeRunArtifactInput {
  artifactId: string;
  mode: WorkflowExecutionMode;
  runtime?: WorkflowRunRuntime;
  allowUnapproved?: boolean;
  runLimits?: WorkflowRunLimitOverrides;
}

export interface WorkflowNativeToolRuntime {
  store: ProjectStore;
  workspacePath: string;
  permissionMode: PermissionMode;
  planEditIntentKind?: WorkflowPlanEditIntentKind;
  defaultWorkflowThreadId?: string;
  runWorkflowArtifact?: (input: WorkflowNativeRunArtifactInput) => Promise<WorkflowDashboard>;
  connectorDescriptors?: () => WorkflowConnectorDescriptor[];
  pluginRegistrationsForWorkspace?: (workspacePath: string) => Promise<PluginMcpToolRegistration[]> | PluginMcpToolRegistration[];
  searchRoutingSettings?: SearchRoutingSettings;
}

interface WorkflowArtifactSelection {
  thread: ReturnType<ProjectStore["getWorkflowAgentThreadSummary"]>;
  artifact?: WorkflowArtifactSummary;
  graph?: WorkflowGraphSnapshot;
  version?: WorkflowVersionSummary;
}

interface WorkflowRevisionValidationCheck {
  name: string;
  status: "passed" | "failed" | "warning" | "skipped";
  detail: string;
}

interface WorkflowRevisionValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: WorkflowRevisionValidationCheck[];
  candidate: {
    hasManifest: boolean;
    hasSource: boolean;
    hasGraph: boolean;
    graphNodeCount?: number;
    graphEdgeCount?: number;
  };
}

interface WorkflowRevisionCandidate {
  selected: WorkflowArtifactSelection;
  manifest?: WorkflowManifest;
  source?: string;
  graph?: WorkflowGraphSnapshot;
  revision?: WorkflowRevisionSummary;
}

interface MaterializedWorkflowRevisionProposal {
  revision: WorkflowRevisionSummary;
  version: WorkflowVersionSummary;
  artifact: WorkflowArtifactSummary;
  graphSnapshot: WorkflowGraphSnapshot;
}

const workflowNativeToolNames: WorkflowNativeToolName[] = [
  "workflow_current_context",
  "workflow_get_artifact",
  "workflow_get_source",
  "workflow_get_run_trace",
  "workflow_get_versions",
  "workflow_capability_search",
  "workflow_capability_describe",
  "workflow_propose_manifest_revision",
  "workflow_propose_revision",
  "workflow_validate_revision",
  "workflow_explain_revision_diff",
  "workflow_apply_revision",
  "workflow_update_run_settings",
  "workflow_restore_version",
  "workflow_run_preview",
  "workflow_run_version",
];

const DEFAULT_WORKFLOW_NATIVE_IDLE_TIMEOUT_MS = 120_000;

export function workflowNativeToolDescriptors(): DesktopToolDescriptor[] {
  return [
    workflowNativeToolDescriptor(
      "workflow_current_context",
      "Workflow Current Context",
      "Inspect the current Workflow Agent thread state, active artifact, graph, latest version, latest run, and pending discovery/review state.",
      {
        type: "object",
        properties: {
          workflowThreadId: { type: "string", description: "Workflow Agent thread id to inspect." },
        },
        required: ["workflowThreadId"],
        additionalProperties: false,
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_get_artifact",
      "Workflow Artifact",
      "Inspect the selected workflow artifact manifest, spec, graph, generated-program path, version metadata, and discovery summary without reading arbitrary files.",
      artifactSelectionSchema(),
    ),
    workflowNativeToolDescriptor(
      "workflow_get_source",
      "Workflow Source",
      "Read the generated workflow program for audit/debugging only, bounded by maxChars. WorkflowProgramIR artifacts are immutable at the source layer.",
      {
        ...artifactSelectionSchema(),
        properties: {
          ...artifactSelectionSchema().properties,
          maxChars: { type: "number", description: "Maximum source characters to return. Defaults to 20000." },
        },
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_get_run_trace",
      "Workflow Run Trace",
      "Inspect the latest or selected workflow run events, model calls, checkpoints, approvals, source hash, and audit report.",
      {
        type: "object",
        properties: {
          workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
          runId: { type: "string", description: "Optional specific run id. Defaults to the latest run for the thread's active artifact." },
          eventLimit: { type: "number", description: "Maximum recent events to include. Defaults to 80." },
        },
        required: ["workflowThreadId"],
        additionalProperties: false,
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_get_versions",
      "Workflow Versions",
      "List workflow versions, approval states, graph snapshot ids, source paths, repo paths, and commit hashes.",
      {
        type: "object",
        properties: {
          workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
          limit: { type: "number", description: "Maximum versions to return. Defaults to 20." },
        },
        required: ["workflowThreadId"],
        additionalProperties: false,
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_capability_search",
      "Workflow Capability Search",
      "Search safe Workflow Agent capability metadata for relevant connectors, plugin MCP tools, base-directory files, and browser fallback options.",
      {
        type: "object",
        properties: {
          workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
          query: { type: "string", description: "Capability search query derived from the workflow task." },
          limit: { type: "number", description: "Maximum search results. Defaults to 6." },
        },
        required: ["workflowThreadId", "query"],
        additionalProperties: false,
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_capability_describe",
      "Workflow Capability Describe",
      "Describe one workflow capability search result with safe metadata, permission requirements, mutation class, and examples.",
      {
        type: "object",
        properties: {
          workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
          capabilityId: { type: "string", description: "Capability id from workflow_capability_search." },
          query: { type: "string", description: "Optional original search query for describing browser/base-directory fallback hits." },
        },
        required: ["workflowThreadId", "capabilityId"],
        additionalProperties: false,
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_propose_manifest_revision",
      "Workflow Manifest Revision",
      "Create a reviewable manifest-only workflow revision for limits, budgets, review threshold, or mutation policy changes without rediscovery or source edits.",
      manifestRevisionProposalSchema(),
      {
        sideEffects: "write-workspace",
        permissionScope: "workflow-native-proposal",
        supportsDryRun: false,
        promptGuidelines: [
          "Use this for lightweight manifest/limit edits such as max model calls, max tool calls, max connector calls, max run time, review threshold, or mutation policy.",
          "Call workflow_get_artifact first when you need to inspect the current manifest. This tool merges only explicit fields into the current manifest and records a reviewable proposal.",
          "After this tool creates a manifest-only proposal, validate and explain that returned revision id. Do not call workflow_propose_revision again for the same manifest-only edit.",
          "Do not use this for connector/plugin/source/graph behavior changes; use capability search plus workflow_propose_revision instead.",
        ],
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_propose_revision",
      "Workflow Revision Proposal",
      "Create a reviewable workflow revision proposal from explicit candidate manifest or graph changes. Legacy source candidates are accepted only for legacy source artifacts; WorkflowProgramIR artifacts must be changed by recompiling IR.",
      revisionProposalSchema(),
      {
        sideEffects: "write-workspace",
        permissionScope: "workflow-native-proposal",
        supportsDryRun: false,
        promptGuidelines: [
          "Call workflow_current_context and workflow_get_artifact before proposing a revision so the proposal is based on the current workflow.",
          "Pass explicit candidate manifest or graph changes. Source candidates are legacy-only and will be rejected for WorkflowProgramIR artifacts.",
          "Do not use this generic revision tool for pure manifest/limit edits; use workflow_propose_manifest_revision instead.",
          "A proposal is local review state only. It does not apply the revision, run the workflow, call connectors, browse, or mutate external services.",
        ],
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_validate_revision",
      "Workflow Revision Validation",
      "Validate a workflow revision candidate or stored revision record against source, manifest, connector, and graph-mapping rules without applying it.",
      revisionValidationSchema(),
      {
        promptGuidelines: [
          "Use workflow_validate_revision before asking the user to review or apply workflow edits.",
          "If validation fails, improve the candidate input contract and propose again; do not patch invalid output heuristically.",
        ],
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_explain_revision_diff",
      "Workflow Revision Diff",
      "Explain graph, manifest, and source changes for a stored or supplied workflow revision candidate without applying it.",
      revisionDiffSchema(),
      {
        promptGuidelines: [
          "Use workflow_explain_revision_diff to summarize what would change before asking for review.",
          "Prefer concise user-facing explanations backed by graph and source diff counts.",
        ],
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_apply_revision",
      "Workflow Apply Revision",
      "Apply a validated workflow revision and activate the resulting version. This is gated by Ambient permissions or Full Access audit semantics.",
      revisionActionSchema(),
      {
        sideEffects: "write-workspace",
        permissionScope: "workflow-native-apply",
        supportsDryRun: false,
        idempotency: "recommended",
        promptGuidelines: [
          "Use only after a stored workflow revision has been proposed, validated, explained, and the user asks to apply it.",
          "This mutates workflow state by activating the proposed version or materializing a manifest-only revision into a new active version.",
          "Do not use in Planner mode; propose and explain first, then wait for review or Full Access policy to allow apply.",
        ],
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_update_run_settings",
      "Workflow Update Run Settings",
      "Preview, propose, or apply Workflow Agent run settings for idle timeout, optional total runtime, and call budgets.",
      workflowRunSettingsSchema(),
      {
        sideEffects: "write-workspace",
        permissionScope: "workflow-native-run-settings",
        supportsDryRun: true,
        idempotency: "recommended",
        promptGuidelines: [
          "Use action preview_foreground when the user asks about one-off manual run settings; it returns runLimits to use for the next run and does not create a revision.",
          "Use action propose_persistent when the user wants workflow defaults or budgets changed but has not explicitly asked to apply.",
          "Use action apply_persistent only after the user asks to apply/update the workflow settings, or Full Access policy allows the change.",
          "Persistent updates materialize as manifest-only workflow revisions, preserving source and graph.",
        ],
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_restore_version",
      "Workflow Restore Version",
      "Restore an earlier committed Workflow Agent version as a new review version, or restore and approve it as latest.",
      workflowRestoreVersionSchema(),
      {
        sideEffects: "write-workspace",
        permissionScope: "workflow-native-restore",
        supportsDryRun: false,
        idempotency: "recommended",
        promptGuidelines: [
          "Use workflow_get_versions first so the user and Pi can identify the exact version to restore.",
          "By default, restore for review with approveRestored false. Use approveRestored true only when the user explicitly asks to restore and approve.",
          "This mutates workflow state and generated workflow files by creating a new version from the selected historical commit; the original historical version remains in history.",
        ],
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_run_preview",
      "Workflow Run Preview",
      "Run the selected Workflow Agent artifact in dry-run preview mode and return trace evidence for review.",
      workflowRunPreviewSchema(),
      {
        sideEffects: "write-workspace",
        permissionScope: "workflow-native-run-preview",
        supportsDryRun: false,
        idempotency: "recommended",
        defaultTimeoutMs: 10 * 60 * 1000,
        promptGuidelines: [
          "Use workflow_run_preview when the user asks Pi to test, preview, or gather dry-run evidence for the current workflow.",
          "This creates a real workflow run record in dry-run mode. It may still perform read-only data access and ask for connector/tool permissions.",
          "Do not use this for approved production execution; workflow_run_version will own that path.",
        ],
      },
    ),
    workflowNativeToolDescriptor(
      "workflow_run_version",
      "Workflow Run Version",
      "Execute the active Workflow Agent version, or run an unapproved workflow one time with explicit audit.",
      workflowRunVersionSchema(),
      {
        sideEffects: "write-workspace",
        permissionScope: "workflow-native-run-version",
        supportsDryRun: false,
        idempotency: "recommended",
        defaultTimeoutMs: 10 * 60 * 1000,
        promptGuidelines: [
          "Use workflow_run_preview first when the user asks to test or gather dry-run evidence.",
          "Use workflow_run_version only when the user explicitly asks to run the workflow, or Full Access policy allows it.",
          "If running an unapproved workflow one time, set allowUnapproved true and explain that the run is audited but the version is not approved.",
          "If the user wants an older non-active version, restore it first with workflow_restore_version rather than executing stale source paths.",
        ],
      },
    ),
  ];
}

export async function invokeWorkflowNativeTool(
  runtime: WorkflowNativeToolRuntime,
  input: InvokeWorkflowNativeToolInput,
): Promise<WorkflowNativeToolInvocationResult> {
  if (!workflowNativeToolNames.includes(input.toolName)) throw new Error(`Unknown workflow-native tool: ${input.toolName}`);
  const args = workflowToolArgsWithDefaultThread(input.arguments ?? {}, runtime.defaultWorkflowThreadId);
  const data = await workflowNativeToolData(runtime, input.toolName, args);
  return {
    toolName: input.toolName,
    data,
    text: workflowNativeToolText(input.toolName, data),
  };
}

function workflowToolArgsWithDefaultThread(args: Record<string, unknown>, defaultWorkflowThreadId: string | undefined): Record<string, unknown> {
  if (!defaultWorkflowThreadId || (typeof args.workflowThreadId === "string" && args.workflowThreadId.trim())) return args;
  return { ...args, workflowThreadId: defaultWorkflowThreadId };
}

function workflowNativeToolDescriptor(
  name: WorkflowNativeToolName,
  label: string,
  description: string,
  inputSchema: unknown,
  options: Partial<Pick<DesktopToolDescriptor, "sideEffects" | "permissionScope" | "supportsDryRun" | "supportsUndo" | "idempotency" | "defaultTimeoutMs">> & {
    promptGuidelines?: string[];
  } = {},
): DesktopToolDescriptor {
  return {
    name,
    label,
    description,
    promptSnippet: `${name}: ${description}`,
    promptGuidelines: options.promptGuidelines ?? [
      "Use workflow-native tools for Workflow Agent inspection instead of searching packaged app docs, source trees, or generated workflow folders.",
      "Use proposal tools for reviewable workflow edits; never edit generated workflow folders directly from chat.",
      "Capability search and describe expose safe metadata only; they do not read connector content, execute plugin tools, browse, run shell commands, or mutate anything.",
    ],
    inputSchema,
    source: "first-party",
    sideEffects: options.sideEffects ?? "none",
    permissionScope: options.permissionScope ?? "workflow-native-read",
    supportsDryRun: options.supportsDryRun ?? true,
    supportsUndo: options.supportsUndo ?? false,
    idempotency: options.idempotency ?? "not-supported",
    defaultTimeoutMs: options.defaultTimeoutMs ?? 30_000,
    runtimeSupport: ["chat", "workflow"],
  };
}

function artifactSelectionSchema(): { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: boolean } {
  return {
    type: "object",
    properties: {
      workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
      artifactId: { type: "string", description: "Optional artifact id. Defaults to active artifact/latest version artifact." },
      versionId: { type: "string", description: "Optional version id. Overrides artifactId." },
    },
    required: ["workflowThreadId"],
    additionalProperties: false,
  };
}

function candidateSchemaProperties(): Record<string, unknown> {
  return {
    workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
    artifactId: { type: "string", description: "Optional base artifact id. Defaults to active artifact/latest version artifact." },
    versionId: { type: "string", description: "Optional base version id. Overrides artifactId." },
    baseArtifactId: { type: "string", description: "Alias for artifactId when proposing against a specific base artifact." },
    baseVersionId: { type: "string", description: "Alias for versionId when proposing against a specific base version." },
    revisionId: { type: "string", description: "Optional stored workflow revision id to inspect." },
    manifest: { type: "object", description: "Optional full proposed workflow manifest." },
    source: { type: "string", description: "Optional full proposed workflow source content for legacy source artifacts only. WorkflowProgramIR artifacts reject source edits." },
    graph: {
      type: "object",
      description: "Optional full proposed workflow graph with summary, nodes, and edges. This tool computes a diff but does not activate the graph.",
      properties: {
        summary: { type: "string" },
        nodes: { type: "array", items: { type: "object" } },
        edges: { type: "array", items: { type: "object" } },
      },
      additionalProperties: true,
    },
    proposedGraphSnapshotId: { type: "string", description: "Optional existing proposed graph snapshot id to validate or explain." },
  };
}

function revisionProposalSchema() {
  return {
    type: "object",
    properties: {
      ...candidateSchemaProperties(),
      requestedChange: { type: "string", description: "Concise description of the requested workflow edit." },
    },
    required: ["workflowThreadId"],
    additionalProperties: false,
  };
}

function manifestRevisionProposalSchema() {
  return {
    type: "object",
    properties: {
      workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
      artifactId: { type: "string", description: "Optional base artifact id. Defaults to active artifact/latest version artifact." },
      versionId: { type: "string", description: "Optional base version id. Overrides artifactId." },
      requestedChange: { type: "string", description: "Concise description of the requested manifest or limit edit." },
      mutationPolicy: {
        type: "string",
        enum: ["read_only", "staged_until_approved", "apply_after_approval"],
        description: "Optional new mutation policy.",
      },
      maxToolCalls: { type: "number", description: "Optional positive maximum tool-call budget." },
      maxModelCalls: { type: "number", description: "Optional positive maximum model-call budget." },
      maxConnectorCalls: { type: "number", description: "Optional positive maximum connector-call budget." },
      defaultIdleTimeoutMs: { type: "number", description: "Optional positive default stream/progress idle timeout in milliseconds." },
      maxRunMs: { type: "number", description: "Optional positive total runtime cap in milliseconds." },
      requiresReviewBelowConfidence: { type: "number", description: "Optional review threshold between 0 and 1." },
      clearMaxToolCalls: { type: "boolean", description: "Clear the maxToolCalls budget." },
      clearMaxModelCalls: { type: "boolean", description: "Clear the maxModelCalls budget." },
      clearMaxConnectorCalls: { type: "boolean", description: "Clear the maxConnectorCalls budget." },
      clearDefaultIdleTimeoutMs: { type: "boolean", description: "Clear the default stream/progress idle timeout." },
      clearMaxRunMs: { type: "boolean", description: "Clear the total runtime cap." },
      clearRequiresReviewBelowConfidence: { type: "boolean", description: "Clear the review threshold." },
    },
    required: ["workflowThreadId"],
    additionalProperties: false,
  };
}

function revisionValidationSchema() {
  return {
    type: "object",
    properties: candidateSchemaProperties(),
    required: ["workflowThreadId"],
    additionalProperties: false,
  };
}

function revisionDiffSchema() {
  return {
    type: "object",
    properties: {
      ...candidateSchemaProperties(),
      currentGraph: { type: "object", description: "Optional current graph override for a purely virtual diff." },
      currentManifest: { type: "object", description: "Optional current manifest override for a purely virtual diff." },
    },
    required: ["workflowThreadId"],
    additionalProperties: false,
  };
}

function revisionActionSchema() {
  return {
    type: "object",
    properties: {
      workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
      revisionId: { type: "string", description: "Stored workflow revision id to apply." },
    },
    required: ["workflowThreadId", "revisionId"],
    additionalProperties: false,
  };
}

function workflowRunSettingsSchema() {
  return {
    type: "object",
    properties: {
      workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
      artifactId: { type: "string", description: "Optional base artifact id. Defaults to active artifact/latest version artifact." },
      versionId: { type: "string", description: "Optional base version id. Overrides artifactId." },
      action: {
        type: "string",
        enum: ["preview_foreground", "propose_persistent", "apply_persistent"],
        description: "preview_foreground returns run overrides only; propose_persistent records a reviewable revision; apply_persistent records and applies the settings revision.",
      },
      idleTimeoutMs: { type: "number", description: "Stream/progress idle timeout in milliseconds. Persistent actions store this as defaultIdleTimeoutMs." },
      clearIdleTimeoutMs: { type: "boolean", description: "Reset the stream/progress idle timeout to the app default for preview_foreground, or clear the persistent default idle timeout." },
      maxRunMs: { type: "number", description: "Optional positive total runtime cap in milliseconds." },
      clearMaxRunMs: { type: "boolean", description: "Clear the persistent total runtime cap, or disable it for preview_foreground." },
      maxToolCalls: { type: "number", description: "Optional positive maximum tool-call budget." },
      maxModelCalls: { type: "number", description: "Optional positive maximum model-call budget." },
      maxConnectorCalls: { type: "number", description: "Optional positive maximum connector-call budget." },
      clearMaxToolCalls: { type: "boolean", description: "Clear the maxToolCalls budget." },
      clearMaxModelCalls: { type: "boolean", description: "Clear the maxModelCalls budget." },
      clearMaxConnectorCalls: { type: "boolean", description: "Clear the maxConnectorCalls budget." },
      requestedChange: { type: "string", description: "Optional concise description of the settings update." },
    },
    required: ["workflowThreadId"],
    additionalProperties: false,
  };
}

function workflowRestoreVersionSchema() {
  return {
    type: "object",
    properties: {
      workflowThreadId: { type: "string", description: "Workflow Agent thread id that owns the version." },
      versionId: { type: "string", description: "Workflow version id to restore." },
      approveRestored: { type: "boolean", description: "When true, restore and approve the new version as latest. Defaults to restoring for review." },
    },
    required: ["workflowThreadId", "versionId"],
    additionalProperties: false,
  };
}

function workflowRunPreviewSchema() {
  return {
    type: "object",
    properties: {
      workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
      artifactId: { type: "string", description: "Optional artifact id. Defaults to the active artifact for the workflow thread." },
      idleTimeoutMs: { type: "number", description: "Optional stream/progress idle timeout in milliseconds for this preview run." },
      maxRunMs: { type: "number", description: "Optional total runtime cap in milliseconds for this preview run." },
      clearMaxRunMs: { type: "boolean", description: "Disable the manifest total runtime cap for this preview run." },
    },
    required: ["workflowThreadId"],
    additionalProperties: false,
  };
}

function workflowRunVersionSchema() {
  return {
    type: "object",
    properties: {
      workflowThreadId: { type: "string", description: "Workflow Agent thread id." },
      artifactId: { type: "string", description: "Optional artifact id. Defaults to the active artifact for the workflow thread." },
      versionId: { type: "string", description: "Optional active/latest version id to execute. Older versions must be restored before running." },
      allowUnapproved: { type: "boolean", description: "Allow a one-off execution of an unapproved workflow artifact." },
      idleTimeoutMs: { type: "number", description: "Optional stream/progress idle timeout in milliseconds for this run." },
      maxRunMs: { type: "number", description: "Optional total runtime cap in milliseconds for this run." },
      clearMaxRunMs: { type: "boolean", description: "Disable the manifest total runtime cap for this run." },
    },
    required: ["workflowThreadId"],
    additionalProperties: false,
  };
}

async function workflowNativeToolData(
  runtime: WorkflowNativeToolRuntime,
  toolName: WorkflowNativeToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case "workflow_current_context":
      return workflowCurrentContext(runtime, requireWorkflowThreadId(args));
    case "workflow_get_artifact":
      return workflowArtifactContext(runtime, args);
    case "workflow_get_source":
      return workflowSourceContext(runtime, args);
    case "workflow_get_run_trace":
      return workflowRunTraceContext(runtime, args);
    case "workflow_get_versions":
      return workflowVersionsContext(runtime, args);
    case "workflow_capability_search":
      return workflowCapabilitySearch(runtime, args);
    case "workflow_capability_describe":
      return workflowCapabilityDescribe(runtime, args);
    case "workflow_propose_manifest_revision":
      return workflowProposeManifestRevision(runtime, args);
    case "workflow_propose_revision":
      if (runtime.planEditIntentKind === "manifest_limits" || runtime.planEditIntentKind === "run_settings") {
        return rejectedRevisionProposal(
          validationFailure(
            "Plan/Edit intent",
            "This Plan/Edit turn is classified as a manifest or run-limit edit. Use workflow_propose_manifest_revision instead of workflow_propose_revision so graph and source stay unchanged.",
          ),
        );
      }
      return workflowProposeRevision(runtime, args);
    case "workflow_validate_revision":
      return workflowValidateRevision(runtime, args);
    case "workflow_explain_revision_diff":
      return workflowExplainRevisionDiff(runtime, args);
    case "workflow_apply_revision":
      return workflowApplyRevision(runtime, args);
    case "workflow_update_run_settings":
      return workflowUpdateRunSettings(runtime, args);
    case "workflow_restore_version":
      return workflowRestoreVersion(runtime, args);
    case "workflow_run_preview":
      return workflowRunPreview(runtime, args);
    case "workflow_run_version":
      return workflowRunVersion(runtime, args);
  }
}

function workflowCurrentContext(runtime: WorkflowNativeToolRuntime, workflowThreadId: string) {
  const thread = runtime.store.getWorkflowAgentThreadSummary(workflowThreadId);
  const artifact = thread.activeArtifactId ? runtime.store.getWorkflowArtifact(thread.activeArtifactId) : undefined;
  const versions = runtime.store.listWorkflowVersions(workflowThreadId);
  const runs = artifact ? runtime.store.listWorkflowRuns(artifact.id, 5) : latestThreadRuns(runtime.store, workflowThreadId, 5);
  return {
    thread,
    activeArtifact: artifact ? summarizeArtifact(artifact) : undefined,
    graph: thread.graph ? summarizeGraph(thread.graph) : undefined,
    latestVersion: thread.latestVersion,
    latestRuns: runs,
    counts: {
      discoveryQuestions: thread.discoveryQuestions.length,
      unansweredDiscoveryQuestions: thread.discoveryQuestions.filter((question) => !question.answer).length,
      graphNodes: thread.graph?.nodes.length ?? 0,
      graphEdges: thread.graph?.edges.length ?? 0,
      versions: versions.length,
      runs: runs.length,
    },
    pending: {
      discoveryQuestions: thread.discoveryQuestions.filter((question) => !question.answer).map((question) => ({
        id: question.id,
        category: question.category,
        question: question.question,
      })),
      accessRequests: thread.discoveryQuestions.flatMap((question) =>
        (question.accessRequests ?? [])
          .filter((request) => request.status === "pending")
          .map((request) => ({
            questionId: question.id,
            id: request.id,
            capability: request.capability,
            targetLabel: request.targetLabel,
            recommendedResponse: request.recommendedResponse,
          })),
      ),
    },
  };
}

function workflowArtifactContext(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const selected = selectWorkflowArtifact(runtime.store, args);
  return {
    thread: selected.thread,
    artifact: selected.artifact,
    version: selected.version,
    graph: selected.graph,
    discoverySummary: discoverySummary(selected.thread),
  };
}

async function workflowSourceContext(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) throw new Error("Workflow source is unavailable because the thread has no selected artifact.");
  const maxChars = boundedInteger(args.maxChars, 1, 100_000, 20_000);
  const content = await readFile(selected.artifact.sourcePath, "utf8");
  return {
    threadId: selected.thread.id,
    artifactId: selected.artifact.id,
    versionId: selected.version?.id,
    sourcePath: selected.artifact.sourcePath,
    sourceProvenance: workflowArtifactSourceProvenance(selected.artifact),
    chars: content.length,
    returnedChars: Math.min(content.length, maxChars),
    truncated: content.length > maxChars,
    content: content.slice(0, maxChars),
  };
}

function workflowRunTraceContext(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const runId = optionalString(args.runId) ?? latestThreadRun(runtime.store, workflowThreadId)?.id;
  if (!runId) throw new Error("Workflow run trace is unavailable because this workflow thread has no runs.");
  const detail = readWorkflowRunDetail(runtime.store, runId);
  assertRunBelongsToThread(detail, workflowThreadId);
  const eventLimit = boundedInteger(args.eventLimit, 1, 500, 80);
  return {
    ...detail,
    events: detail.events.slice(-eventLimit),
    eventCount: detail.events.length,
    returnedEventCount: Math.min(detail.events.length, eventLimit),
  } satisfies WorkflowRunDetail & { eventCount: number; returnedEventCount: number };
}

function workflowVersionsContext(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const limit = boundedInteger(args.limit, 1, 100, 20);
  const versions = runtime.store.listWorkflowVersions(workflowThreadId);
  return {
    workflowThreadId,
    versions: versions.slice(0, limit),
    totalVersions: versions.length,
    returnedVersions: Math.min(versions.length, limit),
  };
}

async function workflowCapabilitySearch(
  runtime: WorkflowNativeToolRuntime,
  args: Record<string, unknown>,
): Promise<WorkflowDiscoveryCapabilitySearch> {
  const workflowThreadId = requireWorkflowThreadId(args);
  const query = requiredString(args.query, "query");
  const context = await capabilityPolicyContext(runtime, workflowThreadId, query);
  return searchWorkflowDiscoveryCapabilities({
    query,
    context,
    limit: boundedInteger(args.limit, 1, 20, 6),
  });
}

async function workflowCapabilityDescribe(
  runtime: WorkflowNativeToolRuntime,
  args: Record<string, unknown>,
): Promise<WorkflowDiscoveryCapabilityDescription> {
  const workflowThreadId = requireWorkflowThreadId(args);
  const capabilityId = requiredString(args.capabilityId, "capabilityId");
  const context = await capabilityPolicyContext(runtime, workflowThreadId, optionalString(args.query) ?? capabilityId);
  const description = describeWorkflowDiscoveryCapability({
    capabilityId,
    query: optionalString(args.query),
    context,
  });
  if (!description) throw new Error(`Workflow capability was not found: ${capabilityId}`);
  return description;
}

async function workflowProposeManifestRevision(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const requestedChange = optionalString(args.requestedChange) ?? manifestRevisionRequestedChange(args);
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) {
    return rejectedRevisionProposal(validationFailure("base artifact", "No base workflow artifact is selected."));
  }
  const manifestResult = manifestRevisionCandidate(selected.artifact.manifest, args);
  if (!manifestResult.ok) return rejectedRevisionProposal(validationFailure("manifest patch", manifestResult.error));
  return workflowProposeRevision(
    { ...runtime, planEditIntentKind: undefined },
    {
      workflowThreadId: selected.thread.id,
      artifactId: selected.artifact.id,
      versionId: selected.version?.id,
      requestedChange,
      manifest: manifestResult.manifest,
    },
  );
}

function manifestRevisionRequestedChange(args: Record<string, unknown>): string {
  const changes: string[] = [];
  if (typeof args.mutationPolicy === "string") changes.push(`set mutationPolicy to ${args.mutationPolicy}`);
  if (typeof args.defaultIdleTimeoutMs === "number") changes.push(`set defaultIdleTimeoutMs to ${args.defaultIdleTimeoutMs}`);
  if (typeof args.maxToolCalls === "number") changes.push(`set maxToolCalls to ${args.maxToolCalls}`);
  if (typeof args.maxModelCalls === "number") changes.push(`set maxModelCalls to ${args.maxModelCalls}`);
  if (typeof args.maxConnectorCalls === "number") changes.push(`set maxConnectorCalls to ${args.maxConnectorCalls}`);
  if (typeof args.maxRunMs === "number") changes.push(`set maxRunMs to ${args.maxRunMs}`);
  if (typeof args.requiresReviewBelowConfidence === "number") {
    changes.push(`set requiresReviewBelowConfidence to ${args.requiresReviewBelowConfidence}`);
  }
  if (args.clearMaxToolCalls === true) changes.push("clear maxToolCalls");
  if (args.clearMaxModelCalls === true) changes.push("clear maxModelCalls");
  if (args.clearMaxConnectorCalls === true) changes.push("clear maxConnectorCalls");
  if (args.clearDefaultIdleTimeoutMs === true) changes.push("clear defaultIdleTimeoutMs");
  if (args.clearMaxRunMs === true) changes.push("clear maxRunMs");
  if (args.clearRequiresReviewBelowConfidence === true) changes.push("clear requiresReviewBelowConfidence");
  return changes.length ? `Manifest-only edit: ${changes.join(", ")}.` : "Manifest-only workflow edit.";
}

async function workflowProposeRevision(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const requestedChange = requiredString(args.requestedChange, "requestedChange");
  const candidateResult = await safeWorkflowRevisionCandidate(runtime, args);
  if (!candidateResult.ok) return rejectedRevisionProposal(candidateResult.validation);
  const candidate = candidateResult.candidate;
  const explicitManifest = args.manifest !== undefined;
  const explicitSource = typeof args.source === "string";
  const explicitGraph = args.graph !== undefined || Boolean(optionalString(args.proposedGraphSnapshotId));
  if (!explicitManifest && !explicitSource && !explicitGraph) {
    return rejectedRevisionProposal(
      validationFailure("proposal input", "workflow_propose_revision requires at least one explicit candidate manifest, source, graph, or proposedGraphSnapshotId."),
    );
  }

  const validation = validateWorkflowRevisionCandidate(runtime, candidate, { storedRevisionOnlyWarning: false });
  if (!validation.valid) return rejectedRevisionProposal(validation);

  const graphDiff = workflowRevisionGraphDiff(candidate, { explicitManifest, explicitGraph });
  const sourceDiff = explicitSource ? await workflowRevisionSourceDiff(candidate) : undefined;
  if (!graphDiff && !sourceDiff) {
    return rejectedRevisionProposal(validationWithError(validation, "Proposal did not contain any graph, manifest, or source changes versus the selected base workflow."));
  }

  let materialized: MaterializedWorkflowRevisionProposal | undefined;
  if (explicitSource || explicitGraph) {
    try {
      materialized = await materializeWorkflowRevisionProposal(runtime, candidate, {
        requestedChange,
        graphDiff,
        sourceDiff,
      });
    } catch (error) {
      return rejectedRevisionProposal(validationWithError(validation, `Revision materialization failed: ${errorMessage(error)}`));
    }
  }
  const revision =
    materialized?.revision ??
    runtime.store.createWorkflowRevision({
      workflowThreadId: candidate.selected.thread.id,
      requestedChange,
      baseVersionId: candidate.selected.version?.id,
      baseArtifactId: candidate.selected.artifact?.id,
      graphDiff,
      sourceDiff,
      status: "proposed",
    });
  return {
    created: true,
    revision,
    materializedVersion: materialized?.version,
    proposedArtifact: materialized?.artifact,
    proposedGraphSnapshot: materialized?.graphSnapshot,
    validation,
    diff: explainRevisionDiffPayload(revision.graphDiff, revision.sourceDiff),
    note: materialized
      ? "Revision proposal recorded with a materialized review version. It was not applied, activated, or run."
      : "Revision proposal recorded for review. It was not applied, activated, run, or written into generated workflow source.",
  };
}

async function materializeWorkflowRevisionProposal(
  runtime: WorkflowNativeToolRuntime,
  candidate: WorkflowRevisionCandidate,
  input: {
    requestedChange: string;
    graphDiff?: WorkflowGraphDiff;
    sourceDiff?: string;
  },
): Promise<MaterializedWorkflowRevisionProposal> {
  const baseArtifact = candidate.selected.artifact;
  if (!baseArtifact) throw new Error("No base workflow artifact is selected.");
  const workflowThreadId = candidate.selected.thread.id;
  const manifest = candidate.manifest;
  if (!manifest) throw new Error("No workflow manifest is available for the proposed version.");
  const graph = candidate.graph;
  if (!graph) throw new Error("No workflow graph is available for the proposed version.");

  const source = candidate.source ?? (await readFile(baseArtifact.sourcePath, "utf8"));
  if (candidate.source !== undefined) assertWorkflowArtifactSourceEditable(baseArtifact);
  validateWorkflowGraphOutput({ summary: graph.summary, nodes: graph.nodes, edges: graph.edges }, manifest);
  validateWorkflowSourceReferences(source, manifest);
  validateWorkflowSourceConnectorReferences(source, manifest, runtime.connectorDescriptors?.() ?? []);
  validateWorkflowSourceGraphMappings(source, { nodes: graph.nodes });

  const id = `workflow-revision-${slugForWorkflowRevisionTitle(baseArtifact.title)}-${randomUUID().slice(0, 8)}`;
  const artifactRoot = join(runtime.store.getWorkspace().statePath, "workflows", id);
  await mkdir(join(artifactRoot, "reports"), { recursive: true });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const specJson = `${JSON.stringify(baseArtifact.spec, null, 2)}\n`;
  const graphJson = `${JSON.stringify({ summary: graph.summary, nodes: graph.nodes, edges: graph.edges }, null, 2)}\n`;
  const preview = [
    `# ${baseArtifact.title}`,
    "",
    baseArtifact.spec.summary ?? baseArtifact.spec.goal,
    "",
    "## Proposed Revision",
    "",
    input.requestedChange,
    "",
  ].join("\n");
  await writeFile(join(artifactRoot, "manifest.json"), manifestJson, "utf8");
  await writeFile(join(artifactRoot, "spec.json"), specJson, "utf8");
  await writeFile(join(artifactRoot, "main.ts"), source, "utf8");
  await writeFile(join(artifactRoot, "graph.json"), graphJson, "utf8");
  await writeFile(join(artifactRoot, "preview.md"), preview, "utf8");
  await writeFile(
    join(artifactRoot, "compile-context.json"),
    `${JSON.stringify(
      {
        source: "workflow_revision",
        workflowThreadId,
        baseArtifactId: baseArtifact.id,
        baseVersionId: candidate.selected.version?.id,
        requestedChange: input.requestedChange,
        graphDiff: input.graphDiff,
        sourceDiff: input.sourceDiff,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const artifact = runtime.store.createWorkflowArtifact({
    id,
    workflowThreadId,
    title: baseArtifact.title,
    status: "ready_for_preview",
    manifest,
    spec: baseArtifact.spec,
    sourcePath: join(artifactRoot, "main.ts"),
    statePath: join(artifactRoot, "state.json"),
    activate: false,
  });
  const graphSnapshot = runtime.store.createWorkflowGraphSnapshot({
    workflowThreadId,
    source: "revision",
    summary: graph.summary,
    nodes: cloneWorkflowGraphNodes(graph.nodes),
    edges: cloneWorkflowGraphEdges(graph.edges),
    artifactPath: join(artifactRoot, "graph.json"),
    activate: false,
  });
  const versionCommit = await commitWorkflowVersionRepo({
    repoPath: artifactRoot,
    message: `Propose workflow revision for ${baseArtifact.title}`,
  });
  const version = runtime.store.createWorkflowVersion({
    workflowThreadId,
    artifactId: artifact.id,
    graphSnapshotId: graphSnapshot.id,
    sourcePath: artifact.sourcePath,
    repoPath: artifactRoot,
    gitCommitHash: versionCommit.commitHash,
    status: "ready_for_review",
    createdBy: "workflow_revision",
  });
  const revision = runtime.store.createWorkflowRevision({
    workflowThreadId,
    requestedChange: input.requestedChange,
    baseVersionId: candidate.selected.version?.id,
    baseArtifactId: baseArtifact.id,
    proposedGraphSnapshotId: graphSnapshot.id,
    graphDiff: input.graphDiff,
    sourceDiff: input.sourceDiff,
    status: "proposed",
  });
  return { revision, version, artifact, graphSnapshot };
}

async function workflowValidateRevision(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const candidateResult = await safeWorkflowRevisionCandidate(runtime, args);
  if (!candidateResult.ok) return candidateResult.validation;
  const validation = validateWorkflowRevisionCandidate(runtime, candidateResult.candidate, {
    storedRevisionOnlyWarning: Boolean(candidateResult.candidate.revision) && args.manifest === undefined && args.source === undefined && args.graph === undefined,
  });
  if (!candidateResult.candidate.revision) return validation;
  return {
    ...validation,
    workflowThreadId: candidateResult.candidate.revision.workflowThreadId,
    revision: candidateResult.candidate.revision,
  };
}

async function workflowExplainRevisionDiff(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const revisionId = optionalString(args.revisionId);
  if (revisionId) {
    const revision = runtime.store.getWorkflowRevision(revisionId);
    assertRevisionBelongsToThread(revision, workflowThreadId);
    return {
      workflowThreadId,
      revision,
      ...explainRevisionDiffPayload(revision.graphDiff, revision.sourceDiff),
    };
  }

  const candidateResult = await safeWorkflowRevisionCandidate(runtime, args);
  if (!candidateResult.ok) {
    return {
      workflowThreadId,
      validation: candidateResult.validation,
      graphSummary: "No diff available because the candidate could not be parsed.",
      sourceSummary: "No source diff available.",
      bullets: candidateResult.validation.errors,
    };
  }
  const candidate = candidateResult.candidate;
  const currentGraph = graphFromUnknown(args.currentGraph, workflowThreadId, candidate.selected.graph, "currentGraph") ?? candidate.selected.graph;
  const currentManifest = manifestFromUnknown(args.currentManifest, "currentManifest") ?? candidate.selected.artifact?.manifest;
  const proposedGraph = candidate.graph ?? currentGraph;
  const proposedManifest = candidate.manifest ?? currentManifest;
  const graphDiff =
    currentGraph && proposedGraph
      ? nullableGraphDiff(
          diffWorkflowGraphs({
            current: currentGraph,
            proposed: proposedGraph,
            currentManifest,
            proposedManifest,
          }),
        )
      : undefined;
  const sourceDiff = typeof args.source === "string" ? await workflowRevisionSourceDiff(candidate) : undefined;
  return {
    workflowThreadId,
    validation: validateWorkflowRevisionCandidate(runtime, candidate, { storedRevisionOnlyWarning: false }),
    ...explainRevisionDiffPayload(graphDiff, sourceDiff),
  };
}

async function workflowUpdateRunSettings(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const action = workflowRunSettingsAction(args.action);
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) {
    return {
      updated: false,
      action,
      reason: "No active workflow artifact is selected.",
    };
  }
  const normalized = workflowRunSettingsManifestArgs(args);
  if (!normalized.ok) {
    return {
      updated: false,
      action,
      reason: normalized.error,
    };
  }

  if (action === "preview_foreground") {
    return {
      updated: false,
      action,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      runLimits: workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args),
      persistentChange: false,
      note: "Foreground run settings preview only. Pass the returned runLimits to a workflow run action; no workflow revision was created.",
    };
  }

  const proposal = await workflowProposeManifestRevision(runtime, {
    workflowThreadId,
    artifactId: selected.artifact.id,
    versionId: selected.version?.id,
    requestedChange: optionalString(args.requestedChange) ?? workflowRunSettingsRequestedChange(args),
    ...normalized.args,
  });
  const proposalRevisionValue = isRecord(proposal) ? (proposal as { revision?: unknown }).revision : undefined;
  if (!isRecord(proposal) || proposal.created !== true || !isRecord(proposalRevisionValue)) {
    return {
      updated: false,
      action,
      proposal,
      reason: "Run settings proposal was not created.",
    };
  }
  const proposalRevision = proposalRevisionValue as unknown as WorkflowRevisionSummary;

  if (action === "propose_persistent") {
    return {
      updated: false,
      action,
      proposal,
      revision: proposalRevision,
      runLimits: workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args),
      note: "Persistent run settings revision proposed for review. It was not applied.",
    };
  }

  const applied = await workflowApplyRevision(runtime, { workflowThreadId, revisionId: proposalRevision.id });
  return {
    updated: isRecord(applied) && applied.applied === true,
    action,
    proposal,
    applied,
    revision: isRecord(applied) ? applied.revision : proposalRevision,
    runLimits: workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args),
    note: "Persistent run settings revision was proposed and applied.",
  };
}

async function workflowRestoreVersion(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const versionId = requiredString(args.versionId, "versionId");
  const targetVersion = runtime.store.getWorkflowVersion(versionId);
  if (targetVersion.workflowThreadId !== workflowThreadId) {
    throw new Error(`Workflow version ${versionId} does not belong to workflow thread ${workflowThreadId}.`);
  }
  const approveRestored = args.approveRestored === true;
  await restoreWorkflowVersion(
    runtime.store,
    { versionId, approveRestored },
    { connectorDescriptors: runtime.connectorDescriptors?.() ?? [] },
  );
  const restoredVersion = runtime.store.listWorkflowVersions(workflowThreadId)[0];
  const audit = recordWorkflowRestoreFullAccessAudit(runtime, {
    workflowThreadId,
    targetVersion,
    restoredVersion,
    approveRestored,
  });
  return {
    restored: true,
    workflowThreadId,
    targetVersion,
    restoredVersion,
    approveRestored,
    audit,
    note: approveRestored
      ? `Restored workflow version ${targetVersion.version} and approved the new version ${restoredVersion?.version ?? "unknown"} as latest.`
      : `Restored workflow version ${targetVersion.version} as new review version ${restoredVersion?.version ?? "unknown"}.`,
  };
}

async function workflowRunPreview(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) {
    return {
      previewed: false,
      workflowThreadId,
      reason: "No active workflow artifact is selected.",
    };
  }
  if (!runtime.runWorkflowArtifact) {
    return {
      previewed: false,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      reason: "Workflow preview execution is not available in this runtime.",
    };
  }

  const beforeRunIds = new Set(runtime.store.listWorkflowRuns(selected.artifact.id, 100).map((run) => run.id));
  const runLimits = workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args);
  const dashboard = await runtime.runWorkflowArtifact({
    artifactId: selected.artifact.id,
    mode: "dry_run",
    runtime: "workflow",
    allowUnapproved: true,
    runLimits,
  });
  const run =
    runtime.store.listWorkflowRuns(selected.artifact.id, 100).find((candidate) => !beforeRunIds.has(candidate.id)) ??
    dashboard.runs.find((candidate) => candidate.artifactId === selected.artifact?.id);
  const detail = run ? readWorkflowRunDetail(runtime.store, run.id) : undefined;
  const audit = run ? recordWorkflowRunPreviewFullAccessAudit(runtime, { workflowThreadId, artifact: selected.artifact, runId: run.id, runLimits }) : undefined;
  return {
    previewed: true,
    workflowThreadId,
    artifact: summarizeArtifact(selected.artifact),
    run: detail?.run ?? run,
    runLimits,
    trace: detail
      ? {
          eventCount: detail.events.length,
          modelCallCount: detail.modelCalls.length,
          checkpointCount: detail.checkpoints.length,
          approvalCount: detail.approvals.length,
          lastEvent: detail.events.at(-1),
        }
      : undefined,
    audit,
    note: run ? `Dry-run preview completed with run ${run.id}.` : "Dry-run preview completed, but no new run was found in the workflow dashboard.",
  };
}

async function workflowRunVersion(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) {
    return {
      ran: false,
      workflowThreadId,
      reason: "No active workflow artifact is selected.",
    };
  }
  if (!runtime.runWorkflowArtifact) {
    return {
      ran: false,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      reason: "Workflow execution is not available in this runtime.",
    };
  }

  const targetVersion = selected.version ?? latestVersionForArtifact(runtime, selected.artifact.id);
  if (selected.version && selected.thread.latestVersion?.id !== selected.version.id) {
    return {
      ran: false,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      targetVersion: selected.version,
      reason: "workflow_run_version can only execute the active/latest materialized version. Restore the selected version first, then run it.",
    };
  }
  const allowUnapproved = args.allowUnapproved === true;
  const approved = selected.artifact.status === "approved" && (!targetVersion || targetVersion.status === "approved");
  if (!approved && !allowUnapproved) {
    return {
      ran: false,
      workflowThreadId,
      artifact: summarizeArtifact(selected.artifact),
      targetVersion,
      reason: "Approve this workflow before running it, or pass allowUnapproved true for an audited one-off run.",
    };
  }

  const beforeRunIds = new Set(runtime.store.listWorkflowRuns(selected.artifact.id, 100).map((run) => run.id));
  const runLimits = workflowRunLimitOverridesFromSettings(selected.artifact.manifest, args);
  const dashboard = await runtime.runWorkflowArtifact({
    artifactId: selected.artifact.id,
    mode: "execute",
    runtime: "workflow",
    allowUnapproved,
    runLimits,
  });
  const run =
    runtime.store.listWorkflowRuns(selected.artifact.id, 100).find((candidate) => !beforeRunIds.has(candidate.id)) ??
    dashboard.runs.find((candidate) => candidate.artifactId === selected.artifact?.id);
  const detail = run ? readWorkflowRunDetail(runtime.store, run.id) : undefined;
  const audit = run
    ? recordWorkflowRunVersionFullAccessAudit(runtime, {
        workflowThreadId,
        artifact: selected.artifact,
        version: targetVersion,
        runId: run.id,
        allowUnapproved,
        runLimits,
      })
    : undefined;
  return {
    ran: true,
    workflowThreadId,
    artifact: summarizeArtifact(selected.artifact),
    version: targetVersion,
    run: detail?.run ?? run,
    allowUnapproved,
    runLimits,
    trace: detail
      ? {
          eventCount: detail.events.length,
          modelCallCount: detail.modelCalls.length,
          checkpointCount: detail.checkpoints.length,
          approvalCount: detail.approvals.length,
          lastEvent: detail.events.at(-1),
        }
      : undefined,
    audit,
    note: run ? `Workflow execution completed with run ${run.id}.` : "Workflow execution completed, but no new run was found in the workflow dashboard.",
  };
}

function recordWorkflowRunPreviewFullAccessAudit(
  runtime: WorkflowNativeToolRuntime,
  input: {
    workflowThreadId: string;
    artifact: WorkflowArtifactSummary;
    runId: string;
    runLimits: WorkflowRunLimitOverrides;
  },
) {
  if (runtime.permissionMode !== "full-access") return undefined;
  const thread = runtime.store.getWorkflowAgentThreadSummary(input.workflowThreadId);
  if (!thread.chatThreadId) return undefined;
  return runtime.store.addPermissionAudit({
    threadId: thread.chatThreadId,
    permissionMode: runtime.permissionMode,
    toolName: "workflow_run_preview",
    risk: "workspace-command",
    decision: "allowed",
    detail: [
      `Workflow thread: ${input.workflowThreadId}`,
      `Artifact: ${input.artifact.id}`,
      `Run: ${input.runId}`,
      `Idle timeout: ${input.runLimits.idleTimeoutMs ?? "default"}`,
      `Total runtime cap: ${input.runLimits.maxRunMs ?? "none"}`,
    ].join("\n"),
    reason: "Allowed by Full Access workflow-native run-preview policy.",
    decisionSource: "allowed_by_full_access",
  });
}

function recordWorkflowRunVersionFullAccessAudit(
  runtime: WorkflowNativeToolRuntime,
  input: {
    workflowThreadId: string;
    artifact: WorkflowArtifactSummary;
    version?: WorkflowVersionSummary;
    runId: string;
    allowUnapproved: boolean;
    runLimits: WorkflowRunLimitOverrides;
  },
) {
  if (runtime.permissionMode !== "full-access") return undefined;
  const thread = runtime.store.getWorkflowAgentThreadSummary(input.workflowThreadId);
  if (!thread.chatThreadId) return undefined;
  return runtime.store.addPermissionAudit({
    threadId: thread.chatThreadId,
    permissionMode: runtime.permissionMode,
    toolName: "workflow_run_version",
    risk: "workspace-command",
    decision: "allowed",
    detail: [
      `Workflow thread: ${input.workflowThreadId}`,
      `Artifact: ${input.artifact.id}`,
      `Version: ${input.version?.id ?? "unknown"}${input.version ? ` (v${input.version.version})` : ""}`,
      `Run: ${input.runId}`,
      `Allow unapproved: ${input.allowUnapproved ? "yes" : "no"}`,
      `Idle timeout: ${input.runLimits.idleTimeoutMs ?? "default"}`,
      `Total runtime cap: ${input.runLimits.maxRunMs ?? "none"}`,
    ].join("\n"),
    reason: "Allowed by Full Access workflow-native run-version policy.",
    decisionSource: "allowed_by_full_access",
  });
}

function recordWorkflowRestoreFullAccessAudit(
  runtime: WorkflowNativeToolRuntime,
  input: {
    workflowThreadId: string;
    targetVersion: WorkflowVersionSummary;
    restoredVersion?: WorkflowVersionSummary;
    approveRestored: boolean;
  },
) {
  if (runtime.permissionMode !== "full-access") return undefined;
  const thread = runtime.store.getWorkflowAgentThreadSummary(input.workflowThreadId);
  if (!thread.chatThreadId) return undefined;
  return runtime.store.addPermissionAudit({
    threadId: thread.chatThreadId,
    permissionMode: runtime.permissionMode,
    toolName: "workflow_restore_version",
    risk: "workspace-command",
    decision: "allowed",
    detail: [
      `Workflow thread: ${input.workflowThreadId}`,
      `Target version: ${input.targetVersion.id} (v${input.targetVersion.version})`,
      `Restored version: ${input.restoredVersion?.id ?? "unknown"}${input.restoredVersion ? ` (v${input.restoredVersion.version})` : ""}`,
      `Approved restored version: ${input.approveRestored ? "yes" : "no"}`,
    ].join("\n"),
    reason: "Allowed by Full Access workflow-native restore policy.",
    decisionSource: "allowed_by_full_access",
  });
}

function workflowRunSettingsAction(value: unknown): "preview_foreground" | "propose_persistent" | "apply_persistent" {
  if (value === "preview_foreground" || value === "propose_persistent" || value === "apply_persistent") return value;
  return "propose_persistent";
}

function workflowRunSettingsManifestArgs(args: Record<string, unknown>):
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};
  for (const key of [
    "maxToolCalls",
    "maxModelCalls",
    "maxConnectorCalls",
    "maxRunMs",
    "clearMaxToolCalls",
    "clearMaxModelCalls",
    "clearMaxConnectorCalls",
    "clearMaxRunMs",
  ]) {
    if (args[key] !== undefined) patch[key] = args[key];
  }
  if (args.idleTimeoutMs !== undefined && args.defaultIdleTimeoutMs !== undefined) {
    return { ok: false, error: "Pass either idleTimeoutMs or defaultIdleTimeoutMs, not both." };
  }
  if (args.defaultIdleTimeoutMs !== undefined) patch.defaultIdleTimeoutMs = args.defaultIdleTimeoutMs;
  if (args.idleTimeoutMs !== undefined) patch.defaultIdleTimeoutMs = args.idleTimeoutMs;
  if (args.clearDefaultIdleTimeoutMs === true || args.clearIdleTimeoutMs === true) patch.clearDefaultIdleTimeoutMs = true;
  return { ok: true, args: patch };
}

function workflowRunLimitOverridesFromSettings(manifest: WorkflowManifest, args: Record<string, unknown>) {
  const idleTimeoutMs =
    args.clearDefaultIdleTimeoutMs === true || args.clearIdleTimeoutMs === true
      ? DEFAULT_WORKFLOW_NATIVE_IDLE_TIMEOUT_MS
      : positiveIntegerValue(args.idleTimeoutMs) ??
        positiveIntegerValue(args.defaultIdleTimeoutMs) ??
        positiveIntegerValue(manifest.defaultIdleTimeoutMs) ??
        DEFAULT_WORKFLOW_NATIVE_IDLE_TIMEOUT_MS;
  const maxRunMs =
    args.clearMaxRunMs === true
      ? null
      : positiveIntegerValue(args.maxRunMs) ??
        positiveIntegerValue(manifest.maxRunMs) ??
        null;
  return {
    idleTimeoutMs,
    maxRunMs,
  };
}

function workflowRunSettingsRequestedChange(args: Record<string, unknown>): string {
  const next = {
    ...args,
    defaultIdleTimeoutMs: args.defaultIdleTimeoutMs ?? args.idleTimeoutMs,
  };
  return `Update workflow run settings: ${manifestRevisionRequestedChange(next).replace(/^Manifest-only edit:\s*/, "").replace(/\.$/, "")}.`;
}

async function workflowApplyRevision(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const revisionId = requiredString(args.revisionId, "revisionId");
  const revision = runtime.store.getWorkflowRevision(revisionId);
  assertRevisionBelongsToThread(revision, workflowThreadId);

  if (revision.status === "rejected") {
    return {
      applied: false,
      reason: "Rejected workflow revisions cannot be applied. Create a new proposal instead.",
      revision,
    };
  }
  if (revision.status === "applied") {
    return workflowApplyRevisionPayload(runtime, revision, { alreadyApplied: true });
  }

  const materialized = await ensureWorkflowRevisionHasProposedVersion(runtime, revision);
  const validation = validateWorkflowRevisionCandidate(runtime, workflowRevisionCandidate(runtime, { workflowThreadId, revisionId }), {
    storedRevisionOnlyWarning: false,
  });
  if (!validation.valid) {
    return {
      applied: false,
      reason: "Stored workflow revision did not pass validation.",
      revision: materialized.revision,
      validation,
    };
  }

  const applied = runtime.store.resolveWorkflowRevision({ id: materialized.revision.id, decision: "applied" });
  const audit = recordWorkflowApplyFullAccessAudit(runtime, applied, materialized);
  return workflowApplyRevisionPayload(runtime, applied, {
    materializedVersion: materialized.created ? materialized.version : undefined,
    auditId: audit?.id,
  });
}

function workflowApplyRevisionPayload(
  runtime: WorkflowNativeToolRuntime,
  revision: WorkflowRevisionSummary,
  options: { alreadyApplied?: boolean; materializedVersion?: WorkflowVersionSummary; auditId?: string } = {},
) {
  const thread = runtime.store.getWorkflowAgentThreadSummary(revision.workflowThreadId);
  const activeArtifact = thread.activeArtifactId ? runtime.store.getWorkflowArtifact(thread.activeArtifactId) : undefined;
  return {
    applied: true,
    alreadyApplied: options.alreadyApplied ?? false,
    revision,
    thread: {
      id: thread.id,
      phase: thread.phase,
      status: thread.status,
      activeArtifactId: thread.activeArtifactId,
      activeGraphSnapshotId: thread.activeGraphSnapshotId,
    },
    activeArtifact: activeArtifact ? summarizeArtifact(activeArtifact) : undefined,
    latestVersion: thread.latestVersion,
    materializedVersion: options.materializedVersion,
    auditId: options.auditId,
    note: options.alreadyApplied
      ? "Revision was already applied; no workflow state changed."
      : "Revision applied and active workflow state now points at the applied version.",
  };
}

async function ensureWorkflowRevisionHasProposedVersion(
  runtime: WorkflowNativeToolRuntime,
  revision: WorkflowRevisionSummary,
): Promise<{ revision: WorkflowRevisionSummary; created: boolean; version?: WorkflowVersionSummary }> {
  if (revision.proposedVersionId) return { revision, created: false };
  const graphDiff = isWorkflowGraphDiff(revision.graphDiff) ? revision.graphDiff : undefined;
  if (!graphDiff) {
    throw new Error("Cannot apply workflow revision because it has no proposed version and no recognized manifest/graph diff.");
  }
  if (revision.sourceDiff) {
    throw new Error("Cannot apply diff-only source revisions without a materialized proposed workflow version.");
  }
  if (hasStructuralGraphDiff(graphDiff)) {
    throw new Error("Cannot apply diff-only graph revisions without a materialized proposed workflow version.");
  }
  const baseArtifact = revision.baseArtifactId ? runtime.store.getWorkflowArtifact(revision.baseArtifactId) : undefined;
  if (!baseArtifact) throw new Error("Cannot apply manifest-only revision without a base artifact.");
  const baseVersion = revision.baseVersionId ? runtime.store.getWorkflowVersion(revision.baseVersionId) : latestVersionForArtifact(runtime, baseArtifact.id);
  const baseGraph =
    baseVersion?.graphSnapshotId
      ? graphSnapshotById(runtime.store, revision.workflowThreadId, baseVersion.graphSnapshotId)
      : graphSnapshotById(runtime.store, revision.workflowThreadId, graphDiff.currentGraphId);
  if (!baseGraph) throw new Error("Cannot apply manifest-only revision without a base graph snapshot.");

  const manifest = workflowManifestWithDiff(baseArtifact.manifest, graphDiff);
  validateWorkflowGraphOutput({ summary: baseGraph.summary, nodes: baseGraph.nodes, edges: baseGraph.edges }, manifest);
  const baseSource = await readFile(baseArtifact.sourcePath, "utf8");
  validateWorkflowSourceReferences(baseSource, manifest);
  validateWorkflowSourceConnectorReferences(baseSource, manifest, runtime.connectorDescriptors?.() ?? []);
  validateWorkflowSourceGraphMappings(baseSource, { nodes: baseGraph.nodes });

  const artifact = runtime.store.createWorkflowArtifact({
    workflowThreadId: revision.workflowThreadId,
    title: baseArtifact.title,
    status: baseArtifact.status,
    manifest,
    spec: baseArtifact.spec,
    sourcePath: baseArtifact.sourcePath,
    statePath: baseArtifact.statePath,
  });
  const version = runtime.store.createWorkflowVersion({
    workflowThreadId: revision.workflowThreadId,
    artifactId: artifact.id,
    graphSnapshotId: baseGraph.id,
    sourcePath: baseArtifact.sourcePath,
    repoPath: baseVersion?.repoPath ?? dirname(baseArtifact.sourcePath),
    gitCommitHash: baseVersion?.gitCommitHash,
    status: baseVersion?.status ?? workflowVersionStatusForArtifactStatus(artifact.status),
    createdBy: "workflow_revision",
  });
  const updatedRevision = runtime.store.updateWorkflowRevision({
    id: revision.id,
    proposedGraphSnapshotId: baseGraph.id,
    status: "proposed",
  });
  return { revision: updatedRevision, created: true, version };
}

function workflowVersionStatusForArtifactStatus(status: WorkflowArtifactSummary["status"]): WorkflowVersionStatus {
  if (status === "approved" || status === "rejected" || status === "archived") return status;
  return "ready_for_review";
}

function slugForWorkflowRevisionTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "workflow"
  );
}

function cloneWorkflowGraphNodes(nodes: WorkflowGraphNode[]): WorkflowGraphNode[] {
  return nodes.map((node) => ({
    ...node,
    toolNames: node.toolNames ? [...node.toolNames] : undefined,
    connectorIds: node.connectorIds ? [...node.connectorIds] : undefined,
    sourceRanges: node.sourceRanges ? node.sourceRanges.map((range) => ({ ...range })) : undefined,
  }));
}

function cloneWorkflowGraphEdges(edges: WorkflowGraphEdge[]): WorkflowGraphEdge[] {
  return edges.map((edge) => ({ ...edge }));
}

function latestVersionForArtifact(runtime: WorkflowNativeToolRuntime, artifactId: string): WorkflowVersionSummary | undefined {
  for (const folder of runtime.store.listWorkflowAgentFolders()) {
    for (const thread of folder.threads) {
      const version = runtime.store.listWorkflowVersions(thread.id).find((candidate) => candidate.artifactId === artifactId);
      if (version) return version;
    }
  }
  return undefined;
}

function hasStructuralGraphDiff(diff: WorkflowGraphDiff): boolean {
  return (
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.changedNodes.length > 0 ||
    diff.addedEdges.length > 0 ||
    diff.removedEdges.length > 0 ||
    diff.changedEdges.length > 0
  );
}

function workflowManifestWithDiff(base: WorkflowManifest, diff: WorkflowGraphDiff): WorkflowManifest {
  const manifest: WorkflowManifest = cloneWorkflowManifest(base);
  for (const change of diff.manifest.fieldChanges) {
    if (change.field === "manifest") {
      const fullManifest = manifestFromUnknown(change.after, "manifest");
      if (!fullManifest) throw new Error("Manifest diff contains an invalid full manifest replacement.");
      return fullManifest;
    }
    applyManifestFieldChange(manifest, change.field, change.after);
  }
  manifest.connectors = applyManifestGrantDiffs(manifest.connectors ?? [], diff.manifest.addedConnectors, diff.manifest.removedConnectors, diff.manifest.changedConnectors);
  manifest.pluginCapabilities = applyManifestGrantDiffs(
    manifest.pluginCapabilities ?? [],
    diff.manifest.addedPluginCapabilities,
    diff.manifest.removedPluginCapabilities,
    diff.manifest.changedPluginCapabilities,
  );
  if (!manifest.connectors.length) delete manifest.connectors;
  if (!manifest.pluginCapabilities.length) delete manifest.pluginCapabilities;
  return manifest;
}

function cloneWorkflowManifest(manifest: WorkflowManifest): WorkflowManifest {
  return {
    ...manifest,
    tools: [...manifest.tools],
    connectors: manifest.connectors ? manifest.connectors.map((connector) => ({ ...connector })) : undefined,
    pluginCapabilities: manifest.pluginCapabilities ? manifest.pluginCapabilities.map((capability) => ({ ...capability })) : undefined,
    ambientCliCapabilities: manifest.ambientCliCapabilities ? manifest.ambientCliCapabilities.map((capability) => ({ ...capability })) : undefined,
  };
}

function applyManifestFieldChange(manifest: WorkflowManifest, field: string, after: unknown): void {
  if (!["tools", "mutationPolicy", "defaultIdleTimeoutMs", "maxToolCalls", "maxModelCalls", "maxConnectorCalls", "maxRunMs", "requiresReviewBelowConfidence"].includes(field)) {
    throw new Error(`Unsupported manifest diff field: ${field}`);
  }
  const manifestRecord = manifest as unknown as Record<string, unknown>;
  if (after === undefined) {
    delete manifestRecord[field];
    return;
  }
  manifestRecord[field] = after;
}

function applyManifestGrantDiffs<T extends { connectorId?: string; toolName?: string; capabilityId?: string }>(
  current: T[],
  added: Array<{ id: string; after?: unknown }>,
  removed: Array<{ id: string }>,
  changed: Array<{ id: string; after?: unknown }>,
): T[] {
  const byId = new Map(current.map((item) => [manifestGrantId(item), { ...item } as T]));
  for (const diff of removed) byId.delete(diff.id);
  for (const diff of [...added, ...changed]) {
    if (!isRecord(diff.after)) throw new Error(`Manifest grant diff ${diff.id} is missing a valid replacement grant.`);
    byId.set(diff.id, diff.after as T);
  }
  return [...byId.values()];
}

function manifestGrantId(value: { connectorId?: string; toolName?: string; capabilityId?: string }): string {
  return value.connectorId ?? value.toolName ?? value.capabilityId ?? JSON.stringify(value);
}

function recordWorkflowApplyFullAccessAudit(
  runtime: WorkflowNativeToolRuntime,
  revision: WorkflowRevisionSummary,
  materialized: { created: boolean; version?: WorkflowVersionSummary },
) {
  if (runtime.permissionMode !== "full-access") return undefined;
  const thread = runtime.store.getWorkflowAgentThreadSummary(revision.workflowThreadId);
  if (!thread.chatThreadId) return undefined;
  return runtime.store.addPermissionAudit({
    threadId: thread.chatThreadId,
    permissionMode: runtime.permissionMode,
    toolName: "workflow_apply_revision",
    risk: "workspace-command",
    decision: "allowed",
    detail: [
      `Workflow thread: ${revision.workflowThreadId}`,
      `Revision: ${revision.id}`,
      materialized.created ? `Materialized version: ${materialized.version?.id ?? "unknown"}` : "Materialized version: existing",
    ].join("\n"),
    reason: "Allowed by Full Access workflow-native apply policy.",
    decisionSource: "allowed_by_full_access",
  });
}

async function safeWorkflowRevisionCandidate(
  runtime: WorkflowNativeToolRuntime,
  args: Record<string, unknown>,
): Promise<{ ok: true; candidate: WorkflowRevisionCandidate } | { ok: false; validation: WorkflowRevisionValidationReport }> {
  try {
    return { ok: true, candidate: workflowRevisionCandidate(runtime, args) };
  } catch (error) {
    return { ok: false, validation: validationFailure("candidate parsing", errorMessage(error)) };
  }
}

function workflowRevisionCandidate(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>): WorkflowRevisionCandidate {
  const workflowThreadId = requireWorkflowThreadId(args);
  const revisionId = optionalString(args.revisionId);
  const revision = revisionId ? runtime.store.getWorkflowRevision(revisionId) : undefined;
  if (revision) assertRevisionBelongsToThread(revision, workflowThreadId);
  const selected = selectWorkflowArtifact(runtime.store, {
    ...args,
    workflowThreadId,
    versionId: optionalString(args.versionId) ?? optionalString(args.baseVersionId) ?? revision?.baseVersionId,
    artifactId: optionalString(args.artifactId) ?? optionalString(args.baseArtifactId) ?? revision?.baseArtifactId,
  });
  const proposedVersion = revision?.proposedVersionId ? runtime.store.getWorkflowVersion(revision.proposedVersionId) : undefined;
  const proposedArtifact = proposedVersion ? runtime.store.getWorkflowArtifact(proposedVersion.artifactId) : undefined;
  const manifest = manifestFromUnknown(args.manifest, "manifest") ?? proposedArtifact?.manifest ?? selected.artifact?.manifest;
  const graph =
    graphFromUnknown(args.graph, workflowThreadId, selected.graph, "graph") ??
    graphSnapshotById(runtime.store, workflowThreadId, optionalString(args.proposedGraphSnapshotId) ?? revision?.proposedGraphSnapshotId) ??
    selected.graph;
  return {
    selected,
    revision,
    manifest,
    source: typeof args.source === "string" ? args.source : undefined,
    graph,
  };
}

function validateWorkflowRevisionCandidate(
  runtime: WorkflowNativeToolRuntime,
  candidate: WorkflowRevisionCandidate,
  input: { storedRevisionOnlyWarning: boolean },
): WorkflowRevisionValidationReport {
  const checks: WorkflowRevisionValidationCheck[] = [];
  const connectorDescriptors = runtime.connectorDescriptors?.() ?? [];
  addCheck(checks, "workflow thread", () => {
    runtime.store.getWorkflowAgentThreadSummary(candidate.selected.thread.id);
    return `Workflow thread ${candidate.selected.thread.id} exists.`;
  });
  addCheck(checks, "base artifact", () => {
    if (!candidate.selected.artifact) throw new Error("No base workflow artifact is selected.");
    return `Base artifact ${candidate.selected.artifact.id} selected.`;
  });
  addCheck(checks, "manifest shape", () => {
    validateManifestShape(candidate.manifest);
    return `Manifest declares ${candidate.manifest?.tools.length ?? 0} tool${candidate.manifest?.tools.length === 1 ? "" : "s"}.`;
  });
  addCheck(checks, "plugin capability grants", () => {
    validatePluginCapabilityShape(candidate.manifest);
    return "Plugin capability grants align with manifest tools.";
  });
  addCheck(checks, "ambient cli grants", () => {
    validateAmbientCliCapabilityShape(candidate.manifest);
    return "Ambient CLI grants align with manifest tools.";
  });
  addCheck(checks, "run limits", () => {
    validateRunLimitShape(candidate.manifest);
    return "Run limits are positive when provided.";
  });
  if (candidate.graph && candidate.manifest) {
    addCheck(checks, "graph references", () => {
      validateWorkflowGraphOutput(
        {
          summary: candidate.graph?.summary ?? "Workflow graph",
          nodes: candidate.graph?.nodes ?? [],
          edges: candidate.graph?.edges ?? [],
        },
        candidate.manifest!,
      );
      return `Graph validates with ${candidate.graph?.nodes.length ?? 0} node${candidate.graph?.nodes.length === 1 ? "" : "s"}.`;
    });
  } else {
    checks.push({ name: "graph references", status: "skipped", detail: "No graph and manifest pair was available for graph validation." });
  }
  if (candidate.source !== undefined && candidate.manifest) {
    addCheck(checks, "source mutability", () => {
      if (!candidate.selected.artifact) throw new Error("No base workflow artifact is selected.");
      assertWorkflowArtifactSourceEditable(candidate.selected.artifact);
      return "Legacy source candidate may be validated at the source layer.";
    });
    addCheck(checks, "source references", () => {
      validateWorkflowSourceReferences(candidate.source ?? "", candidate.manifest!);
      return "Source references declared workflow tools and Ambient SDK primitives.";
    });
    addCheck(checks, "connector source references", () => {
      validateWorkflowSourceConnectorReferences(candidate.source ?? "", candidate.manifest!, connectorDescriptors);
      return "Connector calls match declared connector grants and available operations.";
    });
    if (candidate.graph) {
      addCheck(checks, "program graph mappings", () => {
        validateWorkflowSourceGraphMappings(candidate.source ?? "", { nodes: candidate.graph?.nodes ?? [] });
        return "Generated program nodeId metadata maps to graph nodes.";
      });
    } else {
      checks.push({ name: "program graph mappings", status: "skipped", detail: "No graph was available for program mapping validation." });
    }
  } else {
    checks.push({
      name: "source references",
      status: "skipped",
      detail: candidate.source === undefined ? "No proposed source was provided." : "No manifest was available for source validation.",
    });
  }
  if (input.storedRevisionOnlyWarning) {
    checks.push({
      name: "stored revision payload",
      status: "warning",
      detail: "Stored revision records retain diffs, not full proposed source/manifest. Pass a candidate source, manifest, and graph to revalidate the full proposal.",
    });
  }
  const errors = checks.filter((check) => check.status === "failed").map((check) => `${check.name}: ${check.detail}`);
  const warnings = checks.filter((check) => check.status === "warning").map((check) => `${check.name}: ${check.detail}`);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks,
    candidate: {
      hasManifest: Boolean(candidate.manifest),
      hasSource: candidate.source !== undefined,
      hasGraph: Boolean(candidate.graph),
      graphNodeCount: candidate.graph?.nodes.length,
      graphEdgeCount: candidate.graph?.edges.length,
    },
  };
}

function rejectedRevisionProposal(validation: WorkflowRevisionValidationReport) {
  return {
    created: false,
    validation,
    note: "No workflow revision record was created. Fix the candidate and retry workflow_propose_revision.",
  };
}

function workflowRevisionGraphDiff(
  candidate: WorkflowRevisionCandidate,
  input: { explicitManifest: boolean; explicitGraph: boolean },
): WorkflowGraphDiff | undefined {
  const currentGraph = candidate.selected.graph;
  if (!currentGraph || !candidate.graph) return undefined;
  if (!input.explicitManifest && !input.explicitGraph) return undefined;
  return nullableGraphDiff(
    diffWorkflowGraphs({
      current: currentGraph,
      proposed: candidate.graph,
      currentManifest: candidate.selected.artifact?.manifest,
      proposedManifest: candidate.manifest,
    }),
  );
}

async function workflowRevisionSourceDiff(candidate: WorkflowRevisionCandidate): Promise<string | undefined> {
  if (candidate.source === undefined) return undefined;
  if (!candidate.selected.artifact) throw new Error("Cannot diff proposed source because no base artifact is selected.");
  const baseSource = await readFile(candidate.selected.artifact.sourcePath, "utf8");
  return buildWorkflowSourceDiff(baseSource, candidate.source, {
    beforeLabel: "base/main.ts",
    afterLabel: "proposed/main.ts",
  });
}

function explainRevisionDiffPayload(graphDiff: unknown, sourceDiff: string | undefined) {
  const typedGraphDiff = isWorkflowGraphDiff(graphDiff) ? graphDiff : undefined;
  const graphSummary = typedGraphDiff ? workflowGraphDiffSummary(typedGraphDiff) : graphDiff ? "Stored graph diff is not in a recognized shape." : "No graph or manifest diff recorded.";
  const sourceSummary = sourceDiffSummary(sourceDiff);
  const bullets = [
    typedGraphDiff ? graphSummary : undefined,
    sourceDiff ? sourceSummary : undefined,
  ].filter((line): line is string => Boolean(line));
  return {
    graphSummary,
    sourceSummary,
    bullets,
    graphDiff,
    sourceDiff,
  };
}

function nullableGraphDiff(diff: WorkflowGraphDiff): WorkflowGraphDiff | undefined {
  return workflowGraphDiffHasChanges(diff) ? diff : undefined;
}

function manifestRevisionCandidate(
  current: WorkflowManifest,
  args: Record<string, unknown>,
): { ok: true; manifest: WorkflowManifest } | { ok: false; error: string } {
  const manifest: WorkflowManifest = {
    ...current,
    tools: [...current.tools],
    connectors: current.connectors ? current.connectors.map((connector) => ({ ...connector })) : undefined,
    pluginCapabilities: current.pluginCapabilities ? current.pluginCapabilities.map((capability) => ({ ...capability })) : undefined,
    ambientCliCapabilities: current.ambientCliCapabilities ? current.ambientCliCapabilities.map((capability) => ({ ...capability })) : undefined,
  };
  let changed = false;

  const mutationPolicy = optionalString(args.mutationPolicy);
  if (mutationPolicy !== undefined) {
    if (!["read_only", "staged_until_approved", "apply_after_approval"].includes(mutationPolicy)) {
      return { ok: false, error: `Unsupported mutationPolicy: ${mutationPolicy}.` };
    }
    manifest.mutationPolicy = mutationPolicy as WorkflowManifest["mutationPolicy"];
    changed = true;
  }

  for (const field of ["defaultIdleTimeoutMs", "maxToolCalls", "maxModelCalls", "maxConnectorCalls", "maxRunMs"] as const) {
    const clearField = args[`clear${field[0].toUpperCase()}${field.slice(1)}`] === true;
    if (clearField) {
      delete manifest[field];
      changed = true;
      continue;
    }
    if (args[field] !== undefined) {
      const value = positiveInteger(args[field], field);
      if (typeof value === "string") return { ok: false, error: value };
      manifest[field] = value;
      changed = true;
    }
  }

  if (args.clearRequiresReviewBelowConfidence === true) {
    delete manifest.requiresReviewBelowConfidence;
    changed = true;
  } else if (args.requiresReviewBelowConfidence !== undefined) {
    const value = numberValue(args.requiresReviewBelowConfidence);
    if (value === undefined || value < 0 || value > 1) return { ok: false, error: "requiresReviewBelowConfidence must be between 0 and 1." };
    manifest.requiresReviewBelowConfidence = value;
    changed = true;
  }

  if (!changed) return { ok: false, error: "No manifest limit, budget, review-threshold, or mutation-policy fields were provided." };
  return { ok: true, manifest };
}

function graphSnapshotById(store: ProjectStore, workflowThreadId: string, graphSnapshotId: string | undefined): WorkflowGraphSnapshot | undefined {
  if (!graphSnapshotId) return undefined;
  const snapshot = store.listWorkflowGraphSnapshots(workflowThreadId).find((candidate) => candidate.id === graphSnapshotId);
  if (!snapshot) throw new Error(`Workflow graph snapshot does not belong to the requested workflow thread: ${graphSnapshotId}`);
  return snapshot;
}

function graphFromUnknown(
  value: unknown,
  workflowThreadId: string,
  baseGraph: WorkflowGraphSnapshot | undefined,
  label: string,
): WorkflowGraphSnapshot | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${label} must be an object with summary, nodes, and edges.`);
  if (!Array.isArray(value.nodes)) throw new Error(`${label}.nodes must be an array.`);
  if (!Array.isArray(value.edges)) throw new Error(`${label}.edges must be an array.`);
  return {
    id: optionalString(value.id) ?? `${label}-candidate`,
    workflowThreadId,
    version: typeof value.version === "number" && Number.isFinite(value.version) ? Math.floor(value.version) : (baseGraph?.version ?? 0) + 1,
    source: "revision",
    summary: optionalString(value.summary) ?? baseGraph?.summary ?? "Proposed workflow graph",
    nodes: value.nodes as WorkflowGraphNode[],
    edges: value.edges as WorkflowGraphEdge[],
    artifactPath: optionalString(value.artifactPath),
    createdAt: optionalString(value.createdAt) ?? new Date(0).toISOString(),
  };
}

function manifestFromUnknown(value: unknown, label: string): WorkflowManifest | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value as unknown as WorkflowManifest;
}

function validateManifestShape(manifest: WorkflowManifest | undefined): asserts manifest is WorkflowManifest {
  if (!manifest) throw new Error("No workflow manifest is available.");
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0 || manifest.tools.some((tool) => typeof tool !== "string" || !tool.trim())) {
    throw new Error("Manifest tools must be a non-empty string array.");
  }
  if (!["read_only", "staged_until_approved", "apply_after_approval"].includes(manifest.mutationPolicy)) {
    throw new Error(`Manifest mutationPolicy is invalid: ${String(manifest.mutationPolicy)}`);
  }
}

function validatePluginCapabilityShape(manifest: WorkflowManifest | undefined): void {
  validateManifestShape(manifest);
  const seen = new Set<string>();
  for (const grant of manifest.pluginCapabilities ?? []) {
    if (!manifest.tools.includes(grant.registeredName)) {
      throw new Error(`Plugin capability ${grant.registeredName} is not listed in manifest.tools.`);
    }
    if (seen.has(grant.registeredName)) throw new Error(`Duplicate plugin capability grant: ${grant.registeredName}`);
    seen.add(grant.registeredName);
  }
}

function validateAmbientCliCapabilityShape(manifest: WorkflowManifest | undefined): void {
  validateManifestShape(manifest);
  const grants = manifest.ambientCliCapabilities ?? [];
  if (grants.length > 0 && !manifest.tools.includes("ambient_cli")) throw new Error("Ambient CLI grants require manifest tool ambient_cli.");
  const seen = new Set<string>();
  for (const grant of grants) {
    if (seen.has(grant.capabilityId)) throw new Error(`Duplicate Ambient CLI capability grant: ${grant.capabilityId}`);
    seen.add(grant.capabilityId);
  }
}

function validateRunLimitShape(manifest: WorkflowManifest | undefined): void {
  validateManifestShape(manifest);
  for (const field of ["defaultIdleTimeoutMs", "maxToolCalls", "maxModelCalls", "maxConnectorCalls", "maxRunMs"] as const) {
    const value = manifest[field];
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(`Manifest ${field} must be positive when provided.`);
  }
}

function addCheck(checks: WorkflowRevisionValidationCheck[], name: string, run: () => string): void {
  try {
    checks.push({ name, status: "passed", detail: run() });
  } catch (error) {
    checks.push({ name, status: "failed", detail: errorMessage(error) });
  }
}

function validationFailure(name: string, detail: string): WorkflowRevisionValidationReport {
  return {
    valid: false,
    errors: [`${name}: ${detail}`],
    warnings: [],
    checks: [{ name, status: "failed", detail }],
    candidate: {
      hasManifest: false,
      hasSource: false,
      hasGraph: false,
    },
  };
}

function validationWithError(report: WorkflowRevisionValidationReport, detail: string): WorkflowRevisionValidationReport {
  return {
    ...report,
    valid: false,
    errors: [...report.errors, `proposal diff: ${detail}`],
    checks: [...report.checks, { name: "proposal diff", status: "failed", detail }],
  };
}

function assertRevisionBelongsToThread(revision: WorkflowRevisionSummary, workflowThreadId: string): void {
  if (revision.workflowThreadId !== workflowThreadId) throw new Error("Workflow revision does not belong to the requested workflow thread.");
}

function isWorkflowGraphDiff(value: unknown): value is WorkflowGraphDiff {
  return (
    isRecord(value) &&
    typeof value.currentGraphId === "string" &&
    typeof value.proposedGraphId === "string" &&
    Array.isArray(value.addedNodes) &&
    Array.isArray(value.removedNodes) &&
    Array.isArray(value.changedNodes) &&
    Array.isArray(value.addedEdges) &&
    Array.isArray(value.removedEdges) &&
    Array.isArray(value.changedEdges) &&
    isRecord(value.manifest)
  );
}

function sourceDiffSummary(diff: string | undefined): string {
  if (!diff) return "No source diff recorded.";
  const added = diff.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = diff.split(/\r?\n/).filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  return `${added} source line${added === 1 ? "" : "s"} added, ${removed} source line${removed === 1 ? "" : "s"} removed.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function capabilityPolicyContext(runtime: WorkflowNativeToolRuntime, workflowThreadId: string, query?: string) {
  const thread = runtime.store.getWorkflowAgentThreadSummary(workflowThreadId);
  const pluginRegistrations = await runtime.pluginRegistrationsForWorkspace?.(thread.projectPath);
  return buildWorkflowDiscoveryPolicyContext({
    projectPath: thread.projectPath,
    workspacePath: runtime.workspacePath,
    permissionMode: runtime.permissionMode,
    stage: "initial_discovery",
    workflowThreadId,
    threadId: workflowThreadId,
    grants: runtime.store.listPermissionGrants(),
    connectorDescriptors: runtime.connectorDescriptors?.() ?? [],
    pluginRegistrations,
    ambientCliCapabilities: await workflowNativeAmbientCliCapabilitiesForQuery(runtime.workspacePath, query ?? thread.initialRequest),
    ...(runtime.searchRoutingSettings ? { searchRoutingSettings: runtime.searchRoutingSettings } : {}),
  });
}

async function workflowNativeAmbientCliCapabilitiesForQuery(
  workspacePath: string,
  query: string,
) {
  try {
    const search = await searchAmbientCliCapabilities(workspacePath, {
      query,
      kind: "command",
      limit: 6,
      includeHealth: false,
    });
    return workflowNativeAmbientCliCapabilitiesFromSearch(search);
  } catch {
    return [];
  }
}

function workflowNativeAmbientCliCapabilitiesFromSearch(response: AmbientCliCapabilitySearchResponse) {
  return response.results.flatMap((result) =>
    result.commands.map((command) => ({
      capabilityId: command.capabilityId,
      registryPluginId: result.registryPluginId,
      packageId: result.packageId,
      packageName: result.packageName,
      command: command.name,
      ...(command.description ? { description: command.description } : {}),
      availability: result.availability,
      availabilityReason: result.availabilityReason,
      risk: command.risk,
      missingEnv: result.missingEnv,
      whyMatched: result.whyMatched,
    })),
  );
}

function selectWorkflowArtifact(store: ProjectStore, args: Record<string, unknown>): WorkflowArtifactSelection {
  const workflowThreadId = requireWorkflowThreadId(args);
  const thread = store.getWorkflowAgentThreadSummary(workflowThreadId);
  const versionId = optionalString(args.versionId);
  const version = versionId
    ? store.getWorkflowVersion(versionId)
    : undefined;
  if (version && version.workflowThreadId !== workflowThreadId) throw new Error("Workflow version does not belong to the requested workflow thread.");
  const artifactId = version?.artifactId ?? optionalString(args.artifactId) ?? thread.activeArtifactId ?? thread.latestVersion?.artifactId;
  const artifact = artifactId ? store.getWorkflowArtifact(artifactId) : undefined;
  if (artifact?.workflowThreadId && artifact.workflowThreadId !== workflowThreadId) throw new Error("Workflow artifact does not belong to the requested workflow thread.");
  const graph = version?.graphSnapshotId
    ? store.listWorkflowGraphSnapshots(workflowThreadId).find((snapshot) => snapshot.id === version.graphSnapshotId)
    : thread.graph;
  return { thread, artifact, graph, version };
}

function latestThreadRun(store: ProjectStore, workflowThreadId: string) {
  return latestThreadRuns(store, workflowThreadId, 1)[0];
}

function latestThreadRuns(store: ProjectStore, workflowThreadId: string, limit: number) {
  const artifactIds = new Set(store.listWorkflowArtifacts().filter((artifact) => artifact.workflowThreadId === workflowThreadId).map((artifact) => artifact.id));
  return store
    .listWorkflowRuns(undefined, 200)
    .filter((run) => artifactIds.has(run.artifactId))
    .slice(0, limit);
}

function assertRunBelongsToThread(detail: WorkflowRunDetail, workflowThreadId: string): void {
  if (detail.artifact.workflowThreadId !== workflowThreadId) {
    throw new Error("Workflow run does not belong to the requested workflow thread.");
  }
}

function summarizeArtifact(artifact: WorkflowArtifactSummary) {
  return {
    id: artifact.id,
    title: artifact.title,
    status: artifact.status,
    sourcePath: artifact.sourcePath,
    statePath: artifact.statePath,
    manifest: artifact.manifest,
    spec: artifact.spec,
    updatedAt: artifact.updatedAt,
  };
}

function summarizeGraph(graph: WorkflowGraphSnapshot) {
  return {
    id: graph.id,
    version: graph.version,
    source: graph.source,
    summary: graph.summary,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    nodes: graph.nodes.map((node) => ({ id: node.id, type: node.type, label: node.label })),
  };
}

function discoverySummary(thread: ReturnType<ProjectStore["getWorkflowAgentThreadSummary"]>) {
  return {
    totalQuestions: thread.discoveryQuestions.length,
    answeredQuestions: thread.discoveryQuestions.filter((question) => question.answer).length,
    categories: [...new Set(thread.discoveryQuestions.map((question) => question.category))],
    answers: thread.discoveryQuestions
      .filter((question) => question.answer)
      .map((question) => ({
        id: question.id,
        category: question.category,
        question: question.question,
        answer: question.answer,
      })),
  };
}

function workflowNativeToolText(toolName: WorkflowNativeToolName, data: unknown): string {
  const summary = toolTextSummary(toolName, data);
  return `${summary}\n\n${JSON.stringify(data, null, 2)}`;
}

function toolTextSummary(toolName: WorkflowNativeToolName, data: unknown): string {
  if (toolName === "workflow_capability_search" && isRecord(data)) {
    const results = Array.isArray(data.results) ? data.results : [];
    return `Workflow capability search returned ${results.length} result${results.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "workflow_get_source" && isRecord(data)) {
    return `Workflow source ${data.truncated ? "preview" : "content"} returned ${String(data.returnedChars ?? 0)} of ${String(data.chars ?? 0)} chars.`;
  }
  if (toolName === "workflow_get_run_trace" && isRecord(data)) {
    return `Workflow run trace returned ${String(data.returnedEventCount ?? 0)} of ${String(data.eventCount ?? 0)} events.`;
  }
  if (toolName === "workflow_get_versions" && isRecord(data)) {
    return `Workflow versions returned ${String(data.returnedVersions ?? 0)} of ${String(data.totalVersions ?? 0)} versions.`;
  }
  if (toolName === "workflow_propose_manifest_revision" && isRecord(data)) {
    return data.created
      ? `Workflow manifest-only revision proposal created: ${String((data.revision as { id?: string } | undefined)?.id ?? "unknown")}. Next, validate and explain this same revision id; do not call workflow_propose_revision for the same manifest-only edit.`
      : "Workflow manifest-only revision proposal was rejected by validation.";
  }
  if (toolName === "workflow_propose_revision" && isRecord(data)) {
    return data.created
      ? `Workflow revision proposal created: ${String((data.revision as { id?: string } | undefined)?.id ?? "unknown")}.`
      : "Workflow revision proposal was rejected by validation.";
  }
  if (toolName === "workflow_validate_revision" && isRecord(data)) {
    return `Workflow revision validation ${data.valid ? "passed" : "failed"} with ${Array.isArray(data.errors) ? data.errors.length : 0} error${Array.isArray(data.errors) && data.errors.length === 1 ? "" : "s"}.`;
  }
  if (toolName === "workflow_explain_revision_diff" && isRecord(data)) {
    return `Workflow revision diff explained: ${String(data.graphSummary ?? "no graph diff")}; ${String(data.sourceSummary ?? "no source diff")}`;
  }
  if (toolName === "workflow_apply_revision" && isRecord(data)) {
    return data.applied
      ? `Workflow revision applied: ${String((data.revision as { id?: string } | undefined)?.id ?? "unknown")}.`
      : `Workflow revision was not applied: ${String(data.reason ?? "see validation details")}`;
  }
  if (toolName === "workflow_update_run_settings" && isRecord(data)) {
    const action = typeof data.action === "string" ? data.action : "unknown";
    if (data.updated) return `Workflow run settings updated with ${action}.`;
    if (isRecord(data.revision)) return `Workflow run settings revision proposed: ${String(data.revision.id ?? "unknown")}.`;
    return `Workflow run settings ${action} completed.`;
  }
  if (toolName === "workflow_restore_version" && isRecord(data)) {
    if (data.restored) {
      const restoredVersion = isRecord(data.restoredVersion) ? data.restoredVersion.version : "unknown";
      return `Workflow version restored as v${String(restoredVersion)}.`;
    }
    return `Workflow version was not restored: ${String(data.reason ?? "see details")}`;
  }
  if (toolName === "workflow_run_preview" && isRecord(data)) {
    if (data.previewed) {
      const run = isRecord(data.run) ? String(data.run.id ?? "unknown") : "unknown";
      return `Workflow run preview completed: ${run}.`;
    }
    return `Workflow run preview was not started: ${String(data.reason ?? "see details")}`;
  }
  if (toolName === "workflow_run_version" && isRecord(data)) {
    if (data.ran) {
      const run = isRecord(data.run) ? String(data.run.id ?? "unknown") : "unknown";
      return `Workflow version run completed: ${run}.`;
    }
    return `Workflow version run was not started: ${String(data.reason ?? "see details")}`;
  }
  return `${toolName} completed.`;
}

function requireWorkflowThreadId(args: Record<string, unknown>): string {
  return requiredString(args.workflowThreadId, "workflowThreadId");
}

function requiredString(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function positiveInteger(value: unknown, label: string): number | string {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return `${label} must be a positive number.`;
  return Math.floor(parsed);
}

function positiveIntegerValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
