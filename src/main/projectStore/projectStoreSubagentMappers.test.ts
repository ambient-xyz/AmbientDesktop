import { describe, expect, it } from "vitest";
import {
  compactSubagentCapacityLeasePreview,
  compactSubagentMailboxEventForPreview,
  mapSubagentMailboxEventRow,
  mapSubagentMaturityEvidenceRow,
  mapSubagentRunRow,
  latestSubagentMaturityEvidence,
  normalizeOptionalString,
  normalizeSubagentMaturityEvidenceKind,
  normalizeSubagentMaturityEvidenceStatus,
  passedSubagentMaturityEvidenceCount,
  subagentBugEvidenceFromAudit,
  subagentLifecycleArtifactPath,
  subagentMaturityEvidencePassed,
  subagentRetentionPolicyIntegrityFromEvidence,
  subagentSecurityReviewFromEvidence,
  subagentToolScopeIntegrityFromEvidence,
  subagentRunStatusIsTerminal,
  type SubagentMailboxEventRow,
  type SubagentMaturityEvidenceRow,
  type SubagentRunRow,
} from "./projectStoreSubagentMappers";
import { AMBIENT_DEFAULT_MODEL, createAmbientModelRuntimeSnapshot, resolveAmbientModelRuntimeProfile } from "../../shared/ambientModels";
import { subagentCapacityProviderProfileSnapshot } from "../../shared/subagentCapacity";
import { effectiveSubagentRoleSnapshot } from "../../shared/subagentPatternGraph";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentRunSummary } from "../../shared/subagentTypes";

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
    const activeStatuses: SubagentRunStatus[] = ["reserved", "starting", "running", "waiting", "needs_attention"];

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
      payload_json: '{"question":"Proceed?"}',
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
    expect(
      compactSubagentMailboxEventForPreview({
        ...mapSubagentMailboxEventRow(baseSubagentMailboxEventRow()),
        payload: {
          question: "Proceed?",
          approvalId: "approval-1",
        },
      }),
    ).toEqual({
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
    const { requestedEstimatedResidentMemoryBytes: _requestedEstimatedResidentMemoryBytes, ...localMemoryWithoutRequest } =
      baseLease.localMemory;
    expect(_releasedAt).toBe("2026-06-06T19:05:00.000Z");
    expect(_concurrencyLimit).toBe(3);
    expect(_requestedEstimatedResidentMemoryBytes).toBe(524_288);

    expect(
      compactSubagentCapacityLeasePreview({
        ...leaseWithoutReleasedAt,
        provider: providerWithoutLimit,
        localMemory: localMemoryWithoutRequest,
      }),
    ).toEqual({
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
      details_json: '{"attempts":1}',
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
    expect(
      subagentRetentionPolicyIntegrityFromEvidence(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          kind: "retention_policy_integrity",
          details_json: JSON.stringify({
            closeDoesNotDelete: true,
            capCleanupOldestEligible: true,
            protectedChildrenRetained: false,
            summaryArtifactsRetained: true,
            retainedStateVisible: true,
          }),
        }),
      ),
    ).toEqual({
      closeDoesNotDelete: true,
      capCleanupOldestEligible: true,
      protectedChildrenRetained: false,
      summaryArtifactsRetained: true,
      retainedStateVisible: true,
    });
    expect(
      subagentRetentionPolicyIntegrityFromEvidence(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          kind: "retention_policy_integrity",
          details_json: null,
        }),
      ),
    ).toBeUndefined();
  });

  it("derives subagent tool scope integrity evidence", () => {
    expect(subagentToolScopeIntegrityFromEvidence(undefined)).toBeUndefined();
    expect(
      subagentToolScopeIntegrityFromEvidence(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          kind: "tool_scope_integrity",
          details_json: JSON.stringify({
            hardDenyPrecedence: true,
            roleTaskNarrowing: true,
            exactToolAndExtensionResolution: false,
            childFanoutDefaultBlocked: true,
            snapshotAndInspectorDiagnostics: true,
          }),
        }),
      ),
    ).toEqual({
      hardDenyPrecedence: true,
      roleTaskNarrowing: true,
      exactToolAndExtensionResolution: false,
      childFanoutDefaultBlocked: true,
      snapshotAndInspectorDiagnostics: true,
    });
    expect(
      subagentToolScopeIntegrityFromEvidence(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          kind: "tool_scope_integrity",
          details_json: null,
        }),
      ),
    ).toBeUndefined();
  });

  it("derives subagent maturity bug and security review evidence", () => {
    expect(subagentBugEvidenceFromAudit(undefined)).toBeUndefined();
    expect(
      subagentBugEvidenceFromAudit(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          status: "passed",
        }),
      ),
    ).toEqual({ p0: 0, p1: 0 });
    expect(
      subagentBugEvidenceFromAudit(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          status: "not_started",
        }),
      ),
    ).toBeUndefined();
    expect(
      subagentBugEvidenceFromAudit(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          status: "failed",
          details_json: '{"p0":2.7,"p1":-1}',
        }),
      ),
    ).toEqual({ p0: 2, p1: 0 });
    expect(
      subagentBugEvidenceFromAudit(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          status: "failed",
          details_json: "{}",
        }),
      ),
    ).toEqual({ p0: 0, p1: 1 });

    expect(subagentSecurityReviewFromEvidence(undefined)).toBeUndefined();
    expect(
      subagentSecurityReviewFromEvidence(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          status: "failed",
          reviewer: "codex",
          notes: "Needs review",
          updated_at: "2026-06-06T20:00:00.000Z",
        }),
      ),
    ).toEqual({
      status: "failed",
      reviewedAt: "2026-06-06T20:00:00.000Z",
      reviewer: "codex",
      notes: "Needs review",
    });
    expect(
      subagentSecurityReviewFromEvidence(
        mapSubagentMaturityEvidenceRow({
          ...baseSubagentMaturityEvidenceRow(),
          status: "not_started",
          reviewer: null,
          notes: null,
        }),
      ),
    ).toEqual({
      status: "not_started",
      reviewedAt: "2026-06-06T19:01:00.000Z",
    });
  });
});

function baseSubagentMailboxEventRow(): SubagentMailboxEventRow {
  return {
    id: "mailbox-1",
    run_id: "run-1",
    direction: "parent_to_child",
    type: "approval.request",
    payload_json: '{"question":"Proceed?"}',
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
    details_json: '{"attempts":1}',
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
