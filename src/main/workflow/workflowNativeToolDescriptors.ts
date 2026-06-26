import type { WorkflowNativeToolName } from "../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "./workflowDesktopToolFacade";

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

function workflowNativeToolDescriptor(
  name: WorkflowNativeToolName,
  label: string,
  description: string,
  inputSchema: unknown,
  options: Partial<
    Pick<DesktopToolDescriptor, "sideEffects" | "permissionScope" | "supportsDryRun" | "supportsUndo" | "idempotency" | "defaultTimeoutMs">
  > & {
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

function artifactSelectionSchema(): {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: boolean;
} {
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
    source: {
      type: "string",
      description:
        "Optional full proposed workflow source content for legacy source artifacts only. WorkflowProgramIR artifacts reject source edits.",
    },
    graph: {
      type: "object",
      description:
        "Optional full proposed workflow graph with summary, nodes, and edges. This tool computes a diff but does not activate the graph.",
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
        description:
          "preview_foreground returns run overrides only; propose_persistent records a reviewable revision; apply_persistent records and applies the settings revision.",
      },
      idleTimeoutMs: {
        type: "number",
        description: "Stream/progress idle timeout in milliseconds. Persistent actions store this as defaultIdleTimeoutMs.",
      },
      clearIdleTimeoutMs: {
        type: "boolean",
        description:
          "Reset the stream/progress idle timeout to the app default for preview_foreground, or clear the persistent default idle timeout.",
      },
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
      approveRestored: {
        type: "boolean",
        description: "When true, restore and approve the new version as latest. Defaults to restoring for review.",
      },
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
      versionId: {
        type: "string",
        description: "Optional active/latest version id to execute. Older versions must be restored before running.",
      },
      allowUnapproved: { type: "boolean", description: "Allow a one-off execution of an unapproved workflow artifact." },
      idleTimeoutMs: { type: "number", description: "Optional stream/progress idle timeout in milliseconds for this run." },
      maxRunMs: { type: "number", description: "Optional total runtime cap in milliseconds for this run." },
      clearMaxRunMs: { type: "boolean", description: "Disable the manifest total runtime cap for this run." },
    },
    required: ["workflowThreadId"],
    additionalProperties: false,
  };
}
