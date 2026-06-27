import type { WorkflowAgentFolderSummary, WorkflowAgentThreadSummary } from "../../shared/workflowTypes";
import type {
  CallableWorkflowTaskRow,
  WorkflowAgentThreadRow,
  WorkflowArtifactRow,
  WorkflowDiscoveryQuestionRow,
  WorkflowExplorationTraceRow,
  WorkflowGraphSnapshotRow,
  WorkflowModelCallRow,
  WorkflowRevisionRow,
  WorkflowRunEventRow,
  WorkflowRunRow,
  WorkflowVersionRow,
} from "./projectStoreWorkflowMappers";

export function baseWorkflowArtifactRow(): WorkflowArtifactRow {
  return {
    id: "artifact-1",
    workflow_thread_id: "workflow-thread-1",
    title: "Daily report workflow",
    status: "draft",
    manifest_json: JSON.stringify({ tools: [], mutationPolicy: "read_only" }),
    spec_json: JSON.stringify({ goal: "Generate a daily report" }),
    source_path: "/tmp/workflow/main.ts",
    state_path: "/tmp/workflow/state.json",
    created_at: "2026-06-06T19:40:00.000Z",
    updated_at: "2026-06-06T19:45:00.000Z",
  };
}

export function baseWorkflowAgentThreadSummary(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "folder-1",
    chatThreadId: "chat-thread-1",
    projectName: "Ambient",
    projectPath: "/workspace",
    title: "Daily report workflow",
    phase: "request",
    initialRequest: "Build a daily report workflow",
    preview: "Workflow Agent thread",
    status: "request",
    traceMode: "production",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-06T19:00:00.000Z",
    updatedAt: "2026-06-06T19:05:00.000Z",
    ...overrides,
  };
}

export function baseWorkflowAgentFolderSummary(overrides: Partial<WorkflowAgentFolderSummary> = {}): WorkflowAgentFolderSummary {
  return {
    id: "folder-1",
    name: "Draft workflows",
    kind: "custom",
    createdAt: "2026-06-06T19:00:00.000Z",
    updatedAt: "2026-06-06T19:05:00.000Z",
    threads: [],
    ...overrides,
  };
}

export function baseWorkflowAgentThreadRow(): WorkflowAgentThreadRow {
  return {
    id: "workflow-thread-1",
    folder_id: "folder-1",
    chat_thread_id: "chat-thread-1",
    project_path: "/project",
    title: "Daily report workflow",
    phase: "request",
    initial_request: "Build a daily report workflow",
    active_artifact_id: null,
    active_graph_snapshot_id: null,
    trace_mode: "production",
    created_at: "2026-06-06T19:10:00.000Z",
    updated_at: "2026-06-06T19:15:00.000Z",
  };
}

export function baseWorkflowRunEventRow(): WorkflowRunEventRow {
  return {
    id: "event-1",
    run_id: "run-1",
    artifact_id: "artifact-1",
    seq: 1,
    event_type: "workflow.started",
    created_at: "2026-06-06T19:50:00.000Z",
    message: "Started",
    graph_node_id: "node-1",
    graph_edge_id: "edge-1",
    item_key: "item-1",
    data_json: JSON.stringify({ started: true }),
  };
}

export function baseWorkflowRunRow(): WorkflowRunRow {
  return {
    id: "run-1",
    artifact_id: "artifact-1",
    status: "created",
    started_at: "2026-06-06T20:10:00.000Z",
    updated_at: "2026-06-06T20:11:00.000Z",
    completed_at: null,
    error: null,
    report_path: null,
    graph_snapshot_id: null,
    provider_health_json: null,
    retry_metadata_json: null,
    recovery_context_json: null,
  };
}

export function baseCallableWorkflowTaskRow(): CallableWorkflowTaskRow {
  return {
    id: "task-1",
    launch_id: "launch-1",
    parent_thread_id: "thread-1",
    parent_run_id: "parent-run-1",
    parent_message_id: null,
    tool_call_id: "tool-call-1",
    tool_id: "callable-workflow",
    tool_name: "run_workflow",
    source_kind: "workflow",
    title: "Daily report workflow",
    status: "running",
    status_label: "Running",
    blocking: 1,
    default_collapsed: 0,
    progress_visible: 1,
    token_cost_tracking: 1,
    pause_resume_cancel: 1,
    cancel_handle: "cancel-1",
    runner_target: "workflow-runner",
    runner_deferred_reason: "none",
    workflow_artifact_id: "artifact-1",
    workflow_run_id: "run-1",
    error_message: null,
    pattern_graph_snapshot_json: null,
    execution_plan_json: JSON.stringify({
      toolName: "run_workflow",
      input: { artifactId: "artifact-1" },
    }),
    created_at: "2026-06-06T20:14:00.000Z",
    updated_at: "2026-06-06T20:15:30.000Z",
    started_at: null,
    completed_at: null,
  };
}

export function baseCallableWorkflowLaunchCard() {
  return {
    schemaVersion: "ambient-callable-workflow-launch-card-v1",
    title: "Symphony Map-Reduce",
    sourceKind: "symphony_recipe",
    riskLevel: "high",
    estimatedAgents: 12,
    maxFanout: 12,
    maxDepth: 2,
    estimatedTokenBudget: 180_000,
    tokenBudgetEstimated: true,
    estimatedLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
    localMemoryEstimated: true,
    costEstimateLabel: "Budgeted up to 180,000 tokens; provider dollar cost is estimated after runtime pricing is known.",
    toolMutationScope:
      "Recipe and user scope define allowed tools; mutating child actions require approval, child identifiers, and worktree isolation.",
    checkpointResume:
      "Compile to a persisted workflow artifact before running; visible runs must expose progress, pause/resume/cancel, and restart evidence.",
    approvalFailureHandling:
      "Denied, unavailable, or non-interactive approvals leave the workflow blocked or needing attention; the parent must not synthesize it as complete.",
    defaultCollapsed: true,
    blocking: true,
    smallSliceRecommended: true,
    requireConfirmation: true,
    requirementIds: ["estimated_agents", "token_cost_budget"],
    metricTemplateIds: ["map_reduce-metric"],
    policyWarnings: ["May fan out to as many as 12 child threads."],
  } as const;
}

export function baseWorkflowModelCallRow(): WorkflowModelCallRow {
  return {
    id: "call-1",
    run_id: "run-1",
    artifact_id: "artifact-1",
    task: "summarize",
    status: "succeeded",
    input_json: JSON.stringify({ prompt: "Summarize this." }),
    output_json: JSON.stringify({ text: "Summary" }),
    cache_key: "cache-1",
    cache_checkpoint_json: JSON.stringify(baseWorkflowPromptCacheCheckpoint()),
    model: "ambient-test",
    graph_node_id: "node-1",
    graph_edge_id: "edge-1",
    item_key: "item-1",
    validation_error: null,
    started_at: "2026-06-06T19:55:00.000Z",
    completed_at: "2026-06-06T19:55:02.000Z",
    latency_ms: 2000,
  };
}

export function baseWorkflowPromptCacheCheckpoint() {
  return {
    id: "checkpoint-1",
    stage: "runtime_call",
    workflowThreadId: "workflow-thread-1",
    stablePrefixHash: "stable",
    stablePrefixChars: 100,
    stablePrefixEstimatedTokens: 25,
    mutableSuffixHash: "mutable",
    mutableSuffixChars: 40,
    mutableSuffixEstimatedTokens: 10,
    requestHash: "request",
    requestEstimatedTokens: 35,
    boundaryLabel: "Runtime call",
    createdAt: "2026-06-06T19:54:00.000Z",
  };
}

export function baseWorkflowDiscoveryQuestionRow(): WorkflowDiscoveryQuestionRow {
  return {
    id: "question-1",
    workflow_thread_id: "workflow-thread-1",
    revision_id: "revision-1",
    question_order: 1,
    category: "scope",
    context: "Need scope",
    question: "What should this workflow do?",
    choices_json: JSON.stringify([]),
    allow_freeform: 1,
    answer_json: null,
    graph_impact: null,
    provider: "deterministic",
    provider_model: null,
    policy_context_summary: null,
    capability_search_json: null,
    capability_descriptions_json: null,
    blocked_reasons_json: null,
    access_requests_json: null,
    activity_events_json: null,
    cache_checkpoint_json: null,
    graph_patch_json: null,
    created_at: "2026-06-06T19:59:00.000Z",
    answered_at: null,
  };
}

export function baseWorkflowRevisionRow(): WorkflowRevisionRow {
  return {
    id: "revision-1",
    workflow_thread_id: "workflow-thread-1",
    base_version_id: "version-1",
    base_artifact_id: "artifact-1",
    requested_change: "Add retry handling",
    proposed_graph_snapshot_id: "graph-2",
    graph_diff_json: JSON.stringify({ addedNodes: ["retry"] }),
    source_diff: "diff --git a/workflow.ts b/workflow.ts",
    revision_status: "draft",
    created_at: "2026-06-06T20:05:00.000Z",
    updated_at: "2026-06-06T20:06:00.000Z",
  };
}

export function baseWorkflowGraphSnapshotRow(): WorkflowGraphSnapshotRow {
  return {
    id: "graph-1",
    workflow_thread_id: "workflow-thread-1",
    snapshot_version: 1,
    snapshot_source: "discovery",
    summary: "Initial workflow shape",
    graph_json: JSON.stringify({ nodes: [], edges: [] }),
    artifact_path: "/tmp/workflow/graph.json",
    created_at: "2026-06-06T19:30:00.000Z",
  };
}

export function baseWorkflowExplorationTraceRow(): WorkflowExplorationTraceRow {
  return {
    id: "trace-1",
    workflow_thread_id: "workflow-thread-1",
    exploration_id: "exploration-1",
    exploration_node_id: "node-1",
    request_text: "Explore the workflow",
    model: "ambient-test",
    capability_manifest_json: JSON.stringify({ tools: [] }),
    observations_json: JSON.stringify([]),
    events_json: JSON.stringify([]),
    distillation_json: JSON.stringify({ summary: "Draft" }),
    run_status: "succeeded",
    graph_snapshot_id: "graph-1",
    latest_progress_json: null,
    provider_health_json: null,
    retry_metadata_json: null,
    error_message: null,
    created_at: "2026-06-06T19:34:00.000Z",
    updated_at: "2026-06-06T19:34:00.000Z",
    completed_at: null,
  };
}

export function baseWorkflowVersionRow(): WorkflowVersionRow {
  return {
    id: "version-1",
    workflow_thread_id: "workflow-thread-1",
    artifact_id: "artifact-1",
    version_number: 1,
    graph_snapshot_id: "graph-1",
    source_path: "/tmp/workflow/main.ts",
    repo_path: "/tmp/workflow",
    git_commit_hash: "abc123",
    version_status: "ready_for_review",
    created_by: "user_source_edit",
    created_at: "2026-06-06T19:00:00.000Z",
  };
}
