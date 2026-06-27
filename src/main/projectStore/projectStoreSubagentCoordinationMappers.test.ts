import { describe, expect, it } from "vitest";
import {
  mapSubagentBatchJobRow,
  mapSubagentBatchResultReportRow,
  mapSubagentParentMailboxEventRow,
  mapSubagentPromptSnapshotRow,
  mapSubagentRunEventRow,
  mapSubagentRunRow,
  mapSubagentSpawnEdgeRow,
  mapSubagentToolScopeSnapshotRow,
  mapSubagentWaitBarrierRow,
  resolveSubagentWaitBarrierQuorumThreshold,
  subagentSpawnEdgeRecordForRun,
  type SubagentBatchJobRow,
  type SubagentBatchResultReportRow,
  type SubagentParentMailboxEventRow,
  type SubagentPromptSnapshotRow,
  type SubagentRunEventRow,
  type SubagentRunRow,
  type SubagentSpawnEdgeRow,
  type SubagentToolScopeSnapshotRow,
  type SubagentWaitBarrierRow,
} from "./projectStoreSubagentMappers";
import { AMBIENT_DEFAULT_MODEL, createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import {
  createSubagentBatchJobPlan,
  createSubagentBatchResultLedger,
  createSubagentBatchResultReport,
} from "./projectStoreSubagentsFacade";

describe("project store subagent coordination mappers", () => {
  it("maps subagent parent mailbox event rows without store state", () => {
    const row: SubagentParentMailboxEventRow = {
      id: "parent-mailbox-1",
      parent_thread_id: "parent-thread",
      parent_run_id: "parent-run",
      parent_message_id: null,
      type: "approval.forwarded",
      payload_json: '{"status":"forwarded"}',
      delivery_state: "delivered",
      idempotency_key: "approval.forwarded:parent-run",
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
      delivered_at: null,
    };

    expect(mapSubagentParentMailboxEventRow(row)).toEqual({
      id: "parent-mailbox-1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: undefined,
      type: "approval.forwarded",
      payload: {
        status: "forwarded",
      },
      deliveryState: "delivered",
      idempotencyKey: "approval.forwarded:parent-run",
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
      deliveredAt: undefined,
    });
  });

  it("keeps invalid subagent parent mailbox payloads undefined", () => {
    expect(mapSubagentParentMailboxEventRow({ ...baseSubagentParentMailboxEventRow(), payload_json: "not json" }).payload).toBeUndefined();
    expect(mapSubagentParentMailboxEventRow({ ...baseSubagentParentMailboxEventRow(), payload_json: "[]" }).payload).toBeUndefined();
  });

  it("maps subagent prompt snapshot rows without store state", () => {
    const row: SubagentPromptSnapshotRow = {
      run_id: "run-1",
      sequence: 4,
      created_at: "2026-06-06T19:00:00.000Z",
      prompt_sha256: "sha256:abc",
      prompt_preview: "You are a subagent...",
      snapshot_json: '{"messages":3}',
    };

    expect(mapSubagentPromptSnapshotRow(row)).toEqual({
      runId: "run-1",
      sequence: 4,
      createdAt: "2026-06-06T19:00:00.000Z",
      promptSha256: "sha256:abc",
      promptPreview: "You are a subagent...",
      snapshot: {
        messages: 3,
      },
    });
  });

  it("keeps invalid subagent prompt snapshots undefined", () => {
    expect(mapSubagentPromptSnapshotRow({ ...baseSubagentPromptSnapshotRow(), snapshot_json: "not json" }).snapshot).toBeUndefined();
    expect(mapSubagentPromptSnapshotRow({ ...baseSubagentPromptSnapshotRow(), snapshot_json: "[]" }).snapshot).toBeUndefined();
  });

  it("maps subagent tool scope snapshot rows without store state", () => {
    const row: SubagentToolScopeSnapshotRow = {
      run_id: "run-1",
      sequence: 5,
      created_at: "2026-06-06T19:00:00.000Z",
      scope_json: JSON.stringify(baseSubagentToolScope()),
      resolver_inputs_json: '{"requestedCategories":["workspace.read"]}',
    };

    expect(mapSubagentToolScopeSnapshotRow(row)).toEqual({
      runId: "run-1",
      sequence: 5,
      createdAt: "2026-06-06T19:00:00.000Z",
      scope: baseSubagentToolScope(),
      resolverInputs: {
        requestedCategories: ["workspace.read"],
      },
    });
  });

  it("keeps invalid subagent tool scope snapshots undefined", () => {
    expect(mapSubagentToolScopeSnapshotRow({ ...baseSubagentToolScopeSnapshotRow(), scope_json: "not json" }).scope).toBeUndefined();
    expect(
      mapSubagentToolScopeSnapshotRow({ ...baseSubagentToolScopeSnapshotRow(), resolver_inputs_json: "[]" }).resolverInputs,
    ).toBeUndefined();
  });

  it("maps subagent wait barrier rows without store state", () => {
    const row: SubagentWaitBarrierRow = {
      id: "barrier-1",
      parent_thread_id: "parent-thread",
      parent_run_id: "parent-run",
      child_run_ids_json: '["child-1",7,"child-2"]',
      dependency_mode: "quorum",
      status: "satisfied",
      failure_policy: "degrade_partial",
      quorum_threshold: 2,
      timeout_ms: null,
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
      resolved_at: "2026-06-06T19:02:00.000Z",
      resolution_artifact_json: '{"summary":"Two children completed"}',
    };

    expect(mapSubagentWaitBarrierRow(row)).toEqual({
      id: "barrier-1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childRunIds: ["child-1", "child-2"],
      dependencyMode: "quorum",
      status: "satisfied",
      failurePolicy: "degrade_partial",
      quorumThreshold: 2,
      timeoutMs: undefined,
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
      resolvedAt: "2026-06-06T19:02:00.000Z",
      resolutionArtifact: {
        summary: "Two children completed",
      },
    });
  });

  it("keeps invalid subagent wait barrier JSON fields at their fallbacks", () => {
    expect(mapSubagentWaitBarrierRow({ ...baseSubagentWaitBarrierRow(), child_run_ids_json: "not json" }).childRunIds).toEqual([]);
    expect(mapSubagentWaitBarrierRow({ ...baseSubagentWaitBarrierRow(), child_run_ids_json: "{}" }).childRunIds).toEqual([]);
    expect(
      mapSubagentWaitBarrierRow({ ...baseSubagentWaitBarrierRow(), resolution_artifact_json: "[]" }).resolutionArtifact,
    ).toBeUndefined();
    expect(
      mapSubagentWaitBarrierRow({ ...baseSubagentWaitBarrierRow(), resolution_artifact_json: null }).resolutionArtifact,
    ).toBeUndefined();
  });

  it("resolves subagent wait barrier quorum thresholds", () => {
    expect(
      resolveSubagentWaitBarrierQuorumThreshold({
        dependencyMode: "required_all",
        childCount: 3,
      }),
    ).toBeNull();
    expect(
      resolveSubagentWaitBarrierQuorumThreshold({
        dependencyMode: "quorum",
        childCount: 3,
        quorumThreshold: 2,
      }),
    ).toBe(2);
  });

  it("preserves subagent wait barrier quorum validation behavior", () => {
    expect(() =>
      resolveSubagentWaitBarrierQuorumThreshold({
        dependencyMode: "required_all",
        childCount: 3,
        quorumThreshold: 2,
      }),
    ).toThrow("quorumThreshold is only valid for quorum sub-agent wait barriers.");
    expect(() =>
      resolveSubagentWaitBarrierQuorumThreshold({
        dependencyMode: "quorum",
        childCount: 3,
      }),
    ).toThrow("Quorum sub-agent wait barriers require an explicit integer quorumThreshold.");
    expect(() =>
      resolveSubagentWaitBarrierQuorumThreshold({
        dependencyMode: "quorum",
        childCount: 3,
        quorumThreshold: 1.5,
      }),
    ).toThrow("Quorum sub-agent wait barriers require an explicit integer quorumThreshold.");
    expect(() =>
      resolveSubagentWaitBarrierQuorumThreshold({
        dependencyMode: "quorum",
        childCount: 3,
        quorumThreshold: 0,
      }),
    ).toThrow("Quorum sub-agent wait barrier threshold must be between 1 and 3.");
    expect(() =>
      resolveSubagentWaitBarrierQuorumThreshold({
        dependencyMode: "quorum",
        childCount: 3,
        quorumThreshold: 4,
      }),
    ).toThrow("Quorum sub-agent wait barrier threshold must be between 1 and 3.");
  });

  it("maps subagent run event rows without store state", () => {
    const row: SubagentRunEventRow = {
      run_id: "run-1",
      sequence: 3,
      type: "child.message",
      created_at: "2026-06-06T19:00:00.000Z",
      preview_json: '{"summary":"Child replied"}',
      artifact_path: null,
    };

    expect(mapSubagentRunEventRow(row)).toEqual({
      runId: "run-1",
      sequence: 3,
      type: "child.message",
      createdAt: "2026-06-06T19:00:00.000Z",
      preview: {
        summary: "Child replied",
      },
      artifactPath: undefined,
    });
  });

  it("keeps invalid subagent run event previews undefined", () => {
    expect(mapSubagentRunEventRow({ ...baseSubagentRunEventRow(), preview_json: "not json" }).preview).toBeUndefined();
    expect(mapSubagentRunEventRow({ ...baseSubagentRunEventRow(), preview_json: "[]" }).preview).toBeUndefined();
    expect(mapSubagentRunEventRow({ ...baseSubagentRunEventRow(), preview_json: null }).preview).toBeUndefined();
  });

  it("maps subagent spawn edge rows without store state", () => {
    const row: SubagentSpawnEdgeRow = {
      parent_run_id: "parent-run",
      child_run_id: "child-run",
      parent_thread_id: "parent-thread",
      child_thread_id: "child-thread",
      canonical_task_path: "implementation/tests",
      depth: 2,
      status: "running",
      capacity_released_at: null,
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
    };

    expect(mapSubagentSpawnEdgeRow(row)).toEqual({
      parentRunId: "parent-run",
      childRunId: "child-run",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      canonicalTaskPath: "implementation/tests",
      depth: 2,
      status: "running",
      capacityReleasedAt: undefined,
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
    });
  });

  it("builds subagent spawn edge records from run summaries", () => {
    const run = mapSubagentRunRow(baseSubagentRunRow());

    expect(
      subagentSpawnEdgeRecordForRun(run, {
        now: "2026-06-06T19:05:00.000Z",
        createdAt: "2026-06-06T19:00:00.000Z",
        depth: 3,
      }),
    ).toEqual({
      parentRunId: "parent-run",
      childRunId: "run-1",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      canonicalTaskPath: "implementation/tests",
      depth: 3,
      status: "running",
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:05:00.000Z",
    });

    expect(
      subagentSpawnEdgeRecordForRun(
        {
          ...run,
          status: "completed",
          closedAt: "2026-06-06T19:10:00.000Z",
        },
        {
          now: "2026-06-06T19:11:00.000Z",
          createdAt: "2026-06-06T19:00:00.000Z",
          depth: 4,
        },
      ),
    ).toMatchObject({
      capacityReleasedAt: "2026-06-06T19:10:00.000Z",
      depth: 4,
      status: "completed",
      updatedAt: "2026-06-06T19:11:00.000Z",
    });
  });

  it("maps subagent batch job rows without store state", () => {
    const plan = baseSubagentBatchJobPlan();
    const ledger = createSubagentBatchResultLedger(plan);
    const row: SubagentBatchJobRow = {
      id: plan.jobId,
      parent_thread_id: plan.parentThreadId,
      parent_run_id: plan.parentRunId,
      canonical_task_path: plan.canonicalTaskPath,
      plan_json: JSON.stringify(plan),
      ledger_json: JSON.stringify(ledger),
      created_at: plan.createdAt,
      updated_at: "2026-06-06T19:01:00.000Z",
    };

    expect(mapSubagentBatchJobRow(row)).toEqual({
      plan,
      ledger,
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
    });
  });

  it("maps subagent batch result report rows without store state", () => {
    const plan = baseSubagentBatchJobPlan();
    const report = baseSubagentBatchResultReport(plan);
    const row: SubagentBatchResultReportRow = {
      job_id: report.jobId,
      report_id: report.reportId,
      item_id: report.itemId,
      child_run_id: report.childRunId,
      report_json: JSON.stringify(report),
      created_at: report.createdAt,
    };

    expect(mapSubagentBatchResultReportRow(row)).toEqual(report);
  });

  it("preserves subagent batch mapper JSON fallback behavior", () => {
    expect(mapSubagentBatchJobRow({ ...baseSubagentBatchJobRow(), plan_json: "not json" }).plan).toBeUndefined();
    expect(mapSubagentBatchJobRow({ ...baseSubagentBatchJobRow(), ledger_json: "[]" }).ledger).toBeUndefined();
    expect(mapSubagentBatchResultReportRow({ ...baseSubagentBatchResultReportRow(), report_json: "not json" })).toBeUndefined();
  });
});

function baseSubagentParentMailboxEventRow(): SubagentParentMailboxEventRow {
  return {
    id: "parent-mailbox-1",
    parent_thread_id: "parent-thread",
    parent_run_id: "parent-run",
    parent_message_id: "message-1",
    type: "approval.forwarded",
    payload_json: '{"status":"forwarded"}',
    delivery_state: "delivered",
    idempotency_key: null,
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
    delivered_at: "2026-06-06T19:02:00.000Z",
  };
}

function baseSubagentPromptSnapshotRow(): SubagentPromptSnapshotRow {
  return {
    run_id: "run-1",
    sequence: 4,
    created_at: "2026-06-06T19:00:00.000Z",
    prompt_sha256: "sha256:abc",
    prompt_preview: "You are a subagent...",
    snapshot_json: '{"messages":3}',
  };
}

function baseSubagentToolScopeSnapshotRow(): SubagentToolScopeSnapshotRow {
  return {
    run_id: "run-1",
    sequence: 5,
    created_at: "2026-06-06T19:00:00.000Z",
    scope_json: JSON.stringify(baseSubagentToolScope()),
    resolver_inputs_json: '{"requestedCategories":["workspace.read"]}',
  };
}

function baseSubagentWaitBarrierRow(): SubagentWaitBarrierRow {
  return {
    id: "barrier-1",
    parent_thread_id: "parent-thread",
    parent_run_id: "parent-run",
    child_run_ids_json: '["child-1","child-2"]',
    dependency_mode: "required_all",
    status: "waiting_on_children",
    failure_policy: "fail_parent",
    quorum_threshold: null,
    timeout_ms: 120000,
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
    resolved_at: null,
    resolution_artifact_json: '{"summary":"Waiting"}',
  };
}

function baseSubagentRunEventRow(): SubagentRunEventRow {
  return {
    run_id: "run-1",
    sequence: 3,
    type: "child.message",
    created_at: "2026-06-06T19:00:00.000Z",
    preview_json: '{"summary":"Child replied"}',
    artifact_path: "/tmp/artifact.json",
  };
}

function baseSubagentToolScope() {
  return {
    schemaVersion: "ambient-subagent-tool-scope-v1",
    loadedCategories: ["workspace.read"],
    piVisibleCategories: ["workspace.read"],
    deniedCategories: [],
    loadedTools: [
      {
        source: "built_in",
        id: "file_read",
        categoryId: "workspace.read",
        piVisible: true,
        mutatesState: false,
        requiresApproval: false,
      },
    ],
    piVisibleTools: [
      {
        source: "built_in",
        id: "file_read",
        categoryId: "workspace.read",
        piVisible: true,
        mutatesState: false,
        requiresApproval: false,
      },
    ],
    deniedTools: [],
    approvalMode: "interactive",
    worktreeIsolated: true,
    fanoutAvailable: false,
  };
}

function baseSubagentBatchJobPlan() {
  return createSubagentBatchJobPlan({
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    canonicalTaskPath: "root/4:worker-batch",
    createdAt: "2026-06-06T19:00:00.000Z",
    maxConcurrency: 2,
    items: [
      { itemId: "lint", roleId: "worker", task: "Run lint and fix scoped findings." },
      { itemId: "test", roleId: "reviewer", task: "Review test failures." },
    ],
  });
}

function baseSubagentBatchJobRow(): SubagentBatchJobRow {
  const plan = baseSubagentBatchJobPlan();
  return {
    id: plan.jobId,
    parent_thread_id: plan.parentThreadId,
    parent_run_id: plan.parentRunId,
    canonical_task_path: plan.canonicalTaskPath,
    plan_json: JSON.stringify(plan),
    ledger_json: JSON.stringify(createSubagentBatchResultLedger(plan)),
    created_at: plan.createdAt,
    updated_at: "2026-06-06T19:01:00.000Z",
  };
}

function baseSubagentBatchResultReport(plan = baseSubagentBatchJobPlan()) {
  const item = plan.items[0];
  if (!item) throw new Error("Missing subagent batch fixture item.");
  return createSubagentBatchResultReport({
    plan,
    item,
    childRunId: "child-run-lint",
    status: "completed",
    summary: "Lint completed.",
    createdAt: "2026-06-06T19:02:00.000Z",
    artifactPath: "/tmp/lint-report.json",
  });
}

function baseSubagentBatchResultReportRow(): SubagentBatchResultReportRow {
  const report = baseSubagentBatchResultReport();
  return {
    job_id: report.jobId,
    report_id: report.reportId,
    item_id: report.itemId,
    child_run_id: report.childRunId,
    report_json: JSON.stringify(report),
    created_at: report.createdAt,
  };
}

function baseSubagentRunRow(): SubagentRunRow {
  return {
    id: "run-1",
    protocol_version: "ambient-subagent-v1",
    parent_thread_id: "parent-thread",
    parent_run_id: "parent-run",
    parent_message_id: "parent-message",
    child_thread_id: "child-thread",
    canonical_task_path: "implementation/tests",
    role_id: "worker",
    role_profile_snapshot_json: JSON.stringify(getDefaultSubagentRoleProfile("worker")),
    effective_role_snapshot_json: null,
    dependency_mode: "wait_for_all",
    status: "running",
    feature_flag_snapshot_json: JSON.stringify({ subagents: true }),
    model_runtime_snapshot_json: JSON.stringify(baseModelRuntimeSnapshot()),
    capacity_lease_snapshot_json: null,
    symphony_launch_contract_json: null,
    symphony_mutation_lease_json: null,
    result_artifact_json: JSON.stringify({ summary: "Running" }),
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
    started_at: "2026-06-06T19:00:10.000Z",
    completed_at: null,
    closed_at: null,
  };
}

function baseModelRuntimeSnapshot() {
  return createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL, "2026-06-06T19:00:00.000Z");
}
