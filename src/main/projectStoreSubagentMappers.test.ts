import { describe, expect, it } from "vitest";
import {
  compactSubagentCapacityLeasePreview,
  compactSubagentMailboxEventForPreview,
  mapSubagentBatchJobRow,
  mapSubagentBatchResultReportRow,
  mapSubagentMailboxEventRow,
  mapSubagentMaturityEvidenceRow,
  mapSubagentParentMailboxEventRow,
  mapSubagentPromptSnapshotRow,
  mapSubagentRunRow,
  mapSubagentRunEventRow,
  mapSubagentSpawnEdgeRow,
  mapSubagentToolScopeSnapshotRow,
  mapSubagentWaitBarrierRow,
  latestSubagentMaturityEvidence,
  normalizeOptionalString,
  normalizeSubagentMaturityEvidenceKind,
  normalizeSubagentMaturityEvidenceStatus,
  passedSubagentMaturityEvidenceCount,
  resolveSubagentWaitBarrierQuorumThreshold,
  subagentBugEvidenceFromAudit,
  subagentLifecycleArtifactPath,
  subagentMaturityEvidencePassed,
  subagentRetentionPolicyIntegrityFromEvidence,
  subagentSecurityReviewFromEvidence,
  subagentToolScopeIntegrityFromEvidence,
  subagentSpawnEdgeRecordForRun,
  subagentRunStatusIsTerminal,
  type SubagentBatchJobRow,
  type SubagentBatchResultReportRow,
  type SubagentMailboxEventRow,
  type SubagentMaturityEvidenceRow,
  type SubagentParentMailboxEventRow,
  type SubagentPromptSnapshotRow,
  type SubagentRunRow,
  type SubagentRunEventRow,
  type SubagentSpawnEdgeRow,
  type SubagentToolScopeSnapshotRow,
  type SubagentWaitBarrierRow,
} from "./projectStoreSubagentMappers";
import { AMBIENT_DEFAULT_MODEL, createAmbientModelRuntimeSnapshot, resolveAmbientModelRuntimeProfile } from "../shared/ambientModels";
import { subagentCapacityProviderProfileSnapshot } from "../shared/subagentCapacity";
import { effectiveSubagentRoleSnapshot } from "../shared/subagentPatternGraph";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import type { SubagentRunStatus, SubagentRunSummary } from "../shared/types";
import {
  createSubagentBatchJobPlan,
  createSubagentBatchResultLedger,
  createSubagentBatchResultReport,
} from "./subagents/subagentBatchJobs";

describe("project store subagent mappers", () => {
  it("classifies terminal subagent run statuses", () => {
    const terminalStatuses: SubagentRunStatus[] = [
      "completed",
      "failed",
      "stopped",
      "cancelled",
      "timed_out",
      "detached",
      "aborted_partial",
    ];
    const activeStatuses: SubagentRunStatus[] = [
      "reserved",
      "starting",
      "running",
      "waiting",
      "needs_attention",
    ];

    for (const status of terminalStatuses) {
      expect(subagentRunStatusIsTerminal(status)).toBe(true);
    }
    for (const status of activeStatuses) {
      expect(subagentRunStatusIsTerminal(status)).toBe(false);
    }
  });

  it("maps subagent run rows without store state", () => {
    const row = baseSubagentRunRow();
    const effectiveRoleSnapshot = effectiveSubagentRoleSnapshot({
      baseRole: "worker",
      patternRole: "repair_worker",
      overlayLabels: ["mutation limit", "objective check"],
      outputContract: "bounded repair report",
    });
    row.effective_role_snapshot_json = JSON.stringify(effectiveRoleSnapshot);
    row.symphony_launch_contract_json = JSON.stringify({
      schemaVersion: "ambient-symphony-child-launch-contract-bundle-v1",
      childLaunchPolicySnapshot: { childRunId: "run-1", role: "worker" },
    });
    row.symphony_mutation_lease_json = JSON.stringify({
      schemaVersion: "ambient-symphony-mutation-workspace-lease-v1",
      leaseId: "mutation-lease-1",
      childRunId: "run-1",
      childThreadId: "child-thread",
      parentThreadId: "parent-thread",
      status: "active",
    });

    expect(mapSubagentRunRow(row)).toMatchObject({
      id: "run-1",
      protocolVersion: "ambient-subagent-v1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      childThreadId: "child-thread",
      canonicalTaskPath: "implementation/tests",
      roleId: "worker",
      roleProfileSnapshot: getDefaultSubagentRoleProfile("worker"),
      roleProfileSnapshotSource: "resolved",
      effectiveRoleSnapshot,
      dependencyMode: "wait_for_all",
      status: "running",
      featureFlagSnapshot: { subagents: true },
      modelRuntimeSnapshot: baseModelRuntimeSnapshot(),
      capacityLeaseSnapshot: {
        childRunId: "run-1",
        childThreadId: "child-thread",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        canonicalTaskPath: "implementation/tests",
        roleId: "worker",
        provider: expect.objectContaining({
          providerId: "ambient",
          modelId: AMBIENT_DEFAULT_MODEL,
        }),
      },
      symphonyLaunchContracts: {
        schemaVersion: "ambient-symphony-child-launch-contract-bundle-v1",
        childLaunchPolicySnapshot: { childRunId: "run-1", role: "worker" },
      },
      symphonyMutationWorkspaceLease: {
        schemaVersion: "ambient-symphony-mutation-workspace-lease-v1",
        leaseId: "mutation-lease-1",
        childRunId: "run-1",
        childThreadId: "child-thread",
        parentThreadId: "parent-thread",
        status: "active",
      },
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
      startedAt: "2026-06-06T19:00:10.000Z",
      completedAt: undefined,
      closedAt: undefined,
      resultArtifact: { summary: "Running" },
    });
  });

  it("preserves subagent run legacy fallback behavior", () => {
    const mapped = mapSubagentRunRow({
      ...baseSubagentRunRow(),
      parent_message_id: null,
      role_profile_snapshot_json: JSON.stringify({ id: "worker", schedulingPolicy: "unexpected" }),
      effective_role_snapshot_json: JSON.stringify({ schemaVersion: "ambient-subagent-effective-role-v1", baseRole: "reviewer" }),
      capacity_lease_snapshot_json: "not-json",
      result_artifact_json: null,
      started_at: null,
      completed_at: "2026-06-06T19:03:00.000Z",
      closed_at: "2026-06-06T19:04:00.000Z",
    });

    expect(mapped.parentMessageId).toBeUndefined();
    expect(mapped.roleProfileSnapshot).toEqual(getDefaultSubagentRoleProfile("worker"));
    expect(mapped.roleProfileSnapshotSource).toBe("legacy_default");
    expect(mapped.effectiveRoleSnapshot).toBeUndefined();
    expect(mapped.capacityLeaseSnapshot).toMatchObject({
      childRunId: "run-1",
      childThreadId: "child-thread",
      provider: expect.objectContaining({
        providerId: "ambient",
        modelId: AMBIENT_DEFAULT_MODEL,
      }),
    });
    expect(mapped.resultArtifact).toBeUndefined();
    expect(mapped.startedAt).toBeUndefined();
    expect(mapped.completedAt).toBe("2026-06-06T19:03:00.000Z");
    expect(mapped.closedAt).toBe("2026-06-06T19:04:00.000Z");
  });

  it("maps subagent mailbox event rows without store state", () => {
    const row: SubagentMailboxEventRow = {
      id: "mailbox-1",
      run_id: "run-1",
      direction: "parent_to_child",
      type: "approval.request",
      payload_json: "{\"question\":\"Proceed?\"}",
      delivery_state: "queued",
      created_at: "2026-06-06T19:00:00.000Z",
      delivered_at: null,
    };

    expect(mapSubagentMailboxEventRow(row)).toEqual({
      id: "mailbox-1",
      runId: "run-1",
      direction: "parent_to_child",
      type: "approval.request",
      payload: {
        question: "Proceed?",
      },
      deliveryState: "queued",
      createdAt: "2026-06-06T19:00:00.000Z",
      deliveredAt: undefined,
    });
  });

  it("keeps invalid subagent mailbox payloads undefined", () => {
    expect(mapSubagentMailboxEventRow({ ...baseSubagentMailboxEventRow(), payload_json: "not json" }).payload).toBeUndefined();
    expect(mapSubagentMailboxEventRow({ ...baseSubagentMailboxEventRow(), payload_json: "[]" }).payload).toBeUndefined();
  });

  it("compacts subagent mailbox events for run event previews", () => {
    expect(compactSubagentMailboxEventForPreview({
      ...mapSubagentMailboxEventRow(baseSubagentMailboxEventRow()),
      payload: {
        question: "Proceed?",
        approvalId: "approval-1",
      },
    })).toEqual({
      id: "mailbox-1",
      type: "approval.request",
      direction: "parent_to_child",
      deliveryState: "queued",
      createdAt: "2026-06-06T19:00:00.000Z",
      deliveredAt: "2026-06-06T19:01:00.000Z",
    });
  });

  it("extracts subagent lifecycle artifact paths from result artifacts", () => {
    expect(subagentLifecycleArtifactPath({ artifactPath: "/tmp/subagent-result.json" })).toBe("/tmp/subagent-result.json");
    expect(subagentLifecycleArtifactPath({ artifactPath: "" })).toBeUndefined();
    expect(subagentLifecycleArtifactPath({ artifactPath: 7 })).toBeUndefined();
    expect(subagentLifecycleArtifactPath({})).toBeUndefined();
    expect(subagentLifecycleArtifactPath([])).toBeUndefined();
    expect(subagentLifecycleArtifactPath(undefined)).toBeUndefined();
  });

  it("compacts subagent capacity leases for run event previews", () => {
    expect(compactSubagentCapacityLeasePreview(baseSubagentCapacityLeaseSnapshot())).toEqual({
      schemaVersion: "ambient-subagent-capacity-lease-v1",
      leaseId: "lease-1",
      status: "released",
      canonicalTaskPath: "implementation/tests",
      providerId: "ambient",
      modelId: AMBIENT_DEFAULT_MODEL,
      profileId: `ambient:${AMBIENT_DEFAULT_MODEL}`,
      locality: "cloud",
      projectedOpenRunCount: 2,
      concurrencyLimit: 3,
      localMemoryOutcome: "within-limit",
      localMemoryAllowed: true,
      requestedEstimatedResidentMemoryBytes: 524_288,
      blockingReasons: ["Manual review required."],
      releasedAt: "2026-06-06T19:05:00.000Z",
    });
  });

  it("omits optional subagent capacity lease preview fields when absent", () => {
    const baseLease = baseSubagentCapacityLeaseSnapshot();
    const { releasedAt: _releasedAt, ...leaseWithoutReleasedAt } = baseLease;
    const { concurrencyLimit: _concurrencyLimit, ...providerWithoutLimit } = baseLease.provider;
    const {
      requestedEstimatedResidentMemoryBytes: _requestedEstimatedResidentMemoryBytes,
      ...localMemoryWithoutRequest
    } = baseLease.localMemory;

    expect(compactSubagentCapacityLeasePreview({
      ...leaseWithoutReleasedAt,
      provider: providerWithoutLimit,
      localMemory: localMemoryWithoutRequest,
    })).toEqual({
      schemaVersion: "ambient-subagent-capacity-lease-v1",
      leaseId: "lease-1",
      status: "released",
      canonicalTaskPath: "implementation/tests",
      providerId: "ambient",
      modelId: AMBIENT_DEFAULT_MODEL,
      profileId: `ambient:${AMBIENT_DEFAULT_MODEL}`,
      locality: "cloud",
      projectedOpenRunCount: 2,
      localMemoryOutcome: "within-limit",
      localMemoryAllowed: true,
      blockingReasons: ["Manual review required."],
    });
  });

  it("maps subagent maturity evidence rows without store state", () => {
    const row: SubagentMaturityEvidenceRow = {
      id: "evidence-1",
      kind: "live_pi_smoke",
      evidence_key: "smoke:2026-06-06",
      status: "passed",
      run_id: "run-1",
      parent_run_id: null,
      artifact_path: "/tmp/evidence.json",
      reviewer: "codex",
      notes: null,
      details_json: "{\"attempts\":1}",
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
    };

    expect(mapSubagentMaturityEvidenceRow(row)).toEqual({
      schemaVersion: "ambient-subagent-maturity-evidence-v1",
      id: "evidence-1",
      kind: "live_pi_smoke",
      status: "passed",
      evidenceKey: "smoke:2026-06-06",
      runId: "run-1",
      parentRunId: undefined,
      artifactPath: "/tmp/evidence.json",
      reviewer: "codex",
      notes: undefined,
      details: {
        attempts: 1,
      },
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
    });
  });

  it("preserves subagent maturity evidence fallback and validation behavior", () => {
    expect(mapSubagentMaturityEvidenceRow({ ...baseSubagentMaturityEvidenceRow(), details_json: "not json" }).details).toEqual({});
    expect(mapSubagentMaturityEvidenceRow({ ...baseSubagentMaturityEvidenceRow(), details_json: "[]" }).details).toEqual({});
    expect(mapSubagentMaturityEvidenceRow({ ...baseSubagentMaturityEvidenceRow(), details_json: null }).details).toBeUndefined();
    expect(() =>
      mapSubagentMaturityEvidenceRow({
        ...baseSubagentMaturityEvidenceRow(),
        kind: "unknown_kind" as SubagentMaturityEvidenceRow["kind"],
      }),
    ).toThrow("Unsupported sub-agent maturity evidence kind");
    expect(() =>
      mapSubagentMaturityEvidenceRow({
        ...baseSubagentMaturityEvidenceRow(),
        status: "unknown_status" as SubagentMaturityEvidenceRow["status"],
      }),
    ).toThrow("Unsupported sub-agent maturity evidence status");
  });

  it("normalizes subagent maturity evidence kind and status values", () => {
    expect(normalizeSubagentMaturityEvidenceKind("live_pi_smoke")).toBe("live_pi_smoke");
    expect(normalizeSubagentMaturityEvidenceKind("desktop_dogfood_run")).toBe("desktop_dogfood_run");
    expect(normalizeSubagentMaturityEvidenceKind("workflow_jitter_release_profile")).toBe("workflow_jitter_release_profile");
    expect(normalizeSubagentMaturityEvidenceKind("completion_guard_visibility")).toBe("completion_guard_visibility");
    expect(normalizeSubagentMaturityEvidenceKind("approval_routing_visibility")).toBe("approval_routing_visibility");
    expect(normalizeSubagentMaturityEvidenceKind("event_attribution_integrity")).toBe("event_attribution_integrity");
    expect(normalizeSubagentMaturityEvidenceKind("lifecycle_control_integrity")).toBe("lifecycle_control_integrity");
    expect(normalizeSubagentMaturityEvidenceKind("retention_policy_integrity")).toBe("retention_policy_integrity");
    expect(normalizeSubagentMaturityEvidenceKind("tool_scope_integrity")).toBe("tool_scope_integrity");
    expect(normalizeSubagentMaturityEvidenceStatus("passed")).toBe("passed");
    expect(() => normalizeSubagentMaturityEvidenceKind("unknown_kind")).toThrow("Unsupported sub-agent maturity evidence kind");
    expect(() => normalizeSubagentMaturityEvidenceStatus("unknown_status")).toThrow("Unsupported sub-agent maturity evidence status");
  });

  it("normalizes optional subagent evidence strings", () => {
    expect(normalizeOptionalString("  evidence-key  ")).toBe("evidence-key");
    expect(normalizeOptionalString("   ")).toBeUndefined();
    expect(normalizeOptionalString("")).toBeUndefined();
    expect(normalizeOptionalString(undefined)).toBeUndefined();
  });

  it("summarizes subagent maturity evidence history", () => {
    const evidence = [
      mapSubagentMaturityEvidenceRow({
        ...baseSubagentMaturityEvidenceRow(),
        id: "live-smoke-older",
        kind: "live_pi_smoke",
        status: "failed",
        updated_at: "2026-06-06T19:01:00.000Z",
      }),
      mapSubagentMaturityEvidenceRow({
        ...baseSubagentMaturityEvidenceRow(),
        id: "live-smoke-latest",
        kind: "live_pi_smoke",
        status: "passed",
        updated_at: "2026-06-06T19:02:00.000Z",
      }),
      mapSubagentMaturityEvidenceRow({
        ...baseSubagentMaturityEvidenceRow(),
        id: "dogfood-passed",
        kind: "live_dogfood_run",
        status: "passed",
      }),
      mapSubagentMaturityEvidenceRow({
        ...baseSubagentMaturityEvidenceRow(),
        id: "dogfood-failed",
        kind: "live_dogfood_run",
        status: "failed",
      }),
    ];

    expect(latestSubagentMaturityEvidence(evidence, "live_pi_smoke")?.id).toBe("live-smoke-latest");
    expect(latestSubagentMaturityEvidence(evidence, "security_review")).toBeUndefined();
    expect(passedSubagentMaturityEvidenceCount(evidence, "live_dogfood_run")).toBe(1);
    expect(subagentMaturityEvidencePassed(evidence[1])).toBe(true);
    expect(subagentMaturityEvidencePassed(evidence[0])).toBe(false);
    expect(subagentMaturityEvidencePassed(undefined)).toBeUndefined();
  });

  it("derives subagent retention policy integrity evidence", () => {
    expect(subagentRetentionPolicyIntegrityFromEvidence(undefined)).toBeUndefined();
    expect(subagentRetentionPolicyIntegrityFromEvidence(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      kind: "retention_policy_integrity",
      details_json: JSON.stringify({
        closeDoesNotDelete: true,
        capCleanupOldestEligible: true,
        protectedChildrenRetained: false,
        summaryArtifactsRetained: true,
        retainedStateVisible: true,
      }),
    }))).toEqual({
      closeDoesNotDelete: true,
      capCleanupOldestEligible: true,
      protectedChildrenRetained: false,
      summaryArtifactsRetained: true,
      retainedStateVisible: true,
    });
    expect(subagentRetentionPolicyIntegrityFromEvidence(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      kind: "retention_policy_integrity",
      details_json: null,
    }))).toBeUndefined();
  });

  it("derives subagent tool scope integrity evidence", () => {
    expect(subagentToolScopeIntegrityFromEvidence(undefined)).toBeUndefined();
    expect(subagentToolScopeIntegrityFromEvidence(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      kind: "tool_scope_integrity",
      details_json: JSON.stringify({
        hardDenyPrecedence: true,
        roleTaskNarrowing: true,
        exactToolAndExtensionResolution: false,
        childFanoutDefaultBlocked: true,
        snapshotAndInspectorDiagnostics: true,
      }),
    }))).toEqual({
      hardDenyPrecedence: true,
      roleTaskNarrowing: true,
      exactToolAndExtensionResolution: false,
      childFanoutDefaultBlocked: true,
      snapshotAndInspectorDiagnostics: true,
    });
    expect(subagentToolScopeIntegrityFromEvidence(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      kind: "tool_scope_integrity",
      details_json: null,
    }))).toBeUndefined();
  });

  it("derives subagent maturity bug and security review evidence", () => {
    expect(subagentBugEvidenceFromAudit(undefined)).toBeUndefined();
    expect(subagentBugEvidenceFromAudit(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      status: "passed",
    }))).toEqual({ p0: 0, p1: 0 });
    expect(subagentBugEvidenceFromAudit(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      status: "not_started",
    }))).toBeUndefined();
    expect(subagentBugEvidenceFromAudit(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      status: "failed",
      details_json: "{\"p0\":2.7,\"p1\":-1}",
    }))).toEqual({ p0: 2, p1: 0 });
    expect(subagentBugEvidenceFromAudit(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      status: "failed",
      details_json: "{}",
    }))).toEqual({ p0: 0, p1: 1 });

    expect(subagentSecurityReviewFromEvidence(undefined)).toBeUndefined();
    expect(subagentSecurityReviewFromEvidence(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      status: "failed",
      reviewer: "codex",
      notes: "Needs review",
      updated_at: "2026-06-06T20:00:00.000Z",
    }))).toEqual({
      status: "failed",
      reviewedAt: "2026-06-06T20:00:00.000Z",
      reviewer: "codex",
      notes: "Needs review",
    });
    expect(subagentSecurityReviewFromEvidence(mapSubagentMaturityEvidenceRow({
      ...baseSubagentMaturityEvidenceRow(),
      status: "not_started",
      reviewer: null,
      notes: null,
    }))).toEqual({
      status: "not_started",
      reviewedAt: "2026-06-06T19:01:00.000Z",
    });
  });

  it("maps subagent parent mailbox event rows without store state", () => {
    const row: SubagentParentMailboxEventRow = {
      id: "parent-mailbox-1",
      parent_thread_id: "parent-thread",
      parent_run_id: "parent-run",
      parent_message_id: null,
      type: "approval.forwarded",
      payload_json: "{\"status\":\"forwarded\"}",
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
      snapshot_json: "{\"messages\":3}",
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
      resolver_inputs_json: "{\"requestedCategories\":[\"workspace.read\"]}",
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
    expect(mapSubagentToolScopeSnapshotRow({ ...baseSubagentToolScopeSnapshotRow(), resolver_inputs_json: "[]" }).resolverInputs).toBeUndefined();
  });

  it("maps subagent wait barrier rows without store state", () => {
    const row: SubagentWaitBarrierRow = {
      id: "barrier-1",
      parent_thread_id: "parent-thread",
      parent_run_id: "parent-run",
      child_run_ids_json: "[\"child-1\",7,\"child-2\"]",
      dependency_mode: "quorum",
      status: "satisfied",
      failure_policy: "degrade_partial",
      quorum_threshold: 2,
      timeout_ms: null,
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
      resolved_at: "2026-06-06T19:02:00.000Z",
      resolution_artifact_json: "{\"summary\":\"Two children completed\"}",
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
    expect(mapSubagentWaitBarrierRow({ ...baseSubagentWaitBarrierRow(), resolution_artifact_json: "[]" }).resolutionArtifact).toBeUndefined();
    expect(mapSubagentWaitBarrierRow({ ...baseSubagentWaitBarrierRow(), resolution_artifact_json: null }).resolutionArtifact).toBeUndefined();
  });

  it("resolves subagent wait barrier quorum thresholds", () => {
    expect(resolveSubagentWaitBarrierQuorumThreshold({
      dependencyMode: "required_all",
      childCount: 3,
    })).toBeNull();
    expect(resolveSubagentWaitBarrierQuorumThreshold({
      dependencyMode: "quorum",
      childCount: 3,
      quorumThreshold: 2,
    })).toBe(2);
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
      preview_json: "{\"summary\":\"Child replied\"}",
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

    expect(subagentSpawnEdgeRecordForRun(run, {
      now: "2026-06-06T19:05:00.000Z",
      createdAt: "2026-06-06T19:00:00.000Z",
      depth: 3,
    })).toEqual({
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

    expect(subagentSpawnEdgeRecordForRun({
      ...run,
      status: "completed",
      closedAt: "2026-06-06T19:10:00.000Z",
    }, {
      now: "2026-06-06T19:11:00.000Z",
      createdAt: "2026-06-06T19:00:00.000Z",
      depth: 4,
    })).toMatchObject({
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

function baseSubagentMailboxEventRow(): SubagentMailboxEventRow {
  return {
    id: "mailbox-1",
    run_id: "run-1",
    direction: "parent_to_child",
    type: "approval.request",
    payload_json: "{\"question\":\"Proceed?\"}",
    delivery_state: "queued",
    created_at: "2026-06-06T19:00:00.000Z",
    delivered_at: "2026-06-06T19:01:00.000Z",
  };
}

function baseSubagentMaturityEvidenceRow(): SubagentMaturityEvidenceRow {
  return {
    id: "evidence-1",
    kind: "live_pi_smoke",
    evidence_key: "smoke:2026-06-06",
    status: "passed",
    run_id: "run-1",
    parent_run_id: null,
    artifact_path: null,
    reviewer: null,
    notes: null,
    details_json: "{\"attempts\":1}",
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
  };
}

function baseSubagentCapacityLeaseSnapshot(): SubagentRunSummary["capacityLeaseSnapshot"] {
  return {
    schemaVersion: "ambient-subagent-capacity-lease-v1",
    leaseId: "lease-1",
    status: "released",
    resolvedAt: "2026-06-06T19:00:00.000Z",
    releasedAt: "2026-06-06T19:05:00.000Z",
    releaseReason: "close_agent released live sub-agent capacity while preserving transcript history.",
    canonicalTaskPath: "implementation/tests",
    roleId: "worker",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunId: "run-1",
    childThreadId: "child-thread",
    depth: {
      depth: 1,
      maxDepth: 1,
      allowed: true,
      reason: "Within sub-agent depth budget.",
    },
    provider: {
      providerId: "ambient",
      modelId: AMBIENT_DEFAULT_MODEL,
      locality: "cloud",
      profile: subagentCapacityProviderProfileSnapshot(resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL)),
      openRunCount: 1,
      projectedOpenRunCount: 2,
      concurrencyLimit: 3,
      allowed: true,
      reason: "Within provider concurrency limit.",
    },
    localMemory: {
      outcome: "within-limit",
      allowed: true,
      reason: "Within local memory budget.",
      requestedEstimatedResidentMemoryBytes: 524_288,
      activeEstimatedResidentMemoryBytes: 262_144,
    },
    blockingReasons: ["Manual review required."],
  };
}

function baseSubagentParentMailboxEventRow(): SubagentParentMailboxEventRow {
  return {
    id: "parent-mailbox-1",
    parent_thread_id: "parent-thread",
    parent_run_id: "parent-run",
    parent_message_id: "message-1",
    type: "approval.forwarded",
    payload_json: "{\"status\":\"forwarded\"}",
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
    snapshot_json: "{\"messages\":3}",
  };
}

function baseSubagentToolScopeSnapshotRow(): SubagentToolScopeSnapshotRow {
  return {
    run_id: "run-1",
    sequence: 5,
    created_at: "2026-06-06T19:00:00.000Z",
    scope_json: JSON.stringify(baseSubagentToolScope()),
    resolver_inputs_json: "{\"requestedCategories\":[\"workspace.read\"]}",
  };
}

function baseSubagentWaitBarrierRow(): SubagentWaitBarrierRow {
  return {
    id: "barrier-1",
    parent_thread_id: "parent-thread",
    parent_run_id: "parent-run",
    child_run_ids_json: "[\"child-1\",\"child-2\"]",
    dependency_mode: "required_all",
    status: "waiting_on_children",
    failure_policy: "fail_parent",
    quorum_threshold: null,
    timeout_ms: 120000,
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
    resolved_at: null,
    resolution_artifact_json: "{\"summary\":\"Waiting\"}",
  };
}

function baseSubagentRunEventRow(): SubagentRunEventRow {
  return {
    run_id: "run-1",
    sequence: 3,
    type: "child.message",
    created_at: "2026-06-06T19:00:00.000Z",
    preview_json: "{\"summary\":\"Child replied\"}",
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
