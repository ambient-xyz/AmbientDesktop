import { describe, expect, it } from "vitest";
import type {
  DiagnosticExportLocalRuntimeEvidence,
  DiagnosticExportLocalRuntimeSummary,
} from "../../shared/types";
import { localRuntimeEvidenceInspectorModel } from "./localRuntimeEvidenceUiModel";

describe("local runtime evidence UI model", () => {
  it("summarizes local runtime diagnostic evidence as inspectable rows", () => {
    expect(localRuntimeEvidenceInspectorModel(evidence(), summary())).toMatchObject({
      statusLabel: "1 active lease",
      statusTone: "warning",
      summary: "Local runtime evidence captured one active owner and blocked ordinary stop.",
      badges: ["Needs Attention", "1 active owner", "1 blocked action", "1 next safe action", "Memory basis Actual RSS"],
      countsRows: [
        { label: "Runtimes", value: "1" },
        { label: "Active owners", value: "1" },
        { label: "Blocked actions", value: "1" },
        { label: "Next safe actions", value: "1" },
      ],
      runtimeRows: [
        {
          key: "runtime:1:local-text:runtime-1:5001",
          title: "local-text:runtime-1:5001 (Running)",
          detail: expect.stringContaining("In use by sub-agent Review worker"),
          meta: expect.stringContaining("active leases lease-review"),
          tone: "warning",
        },
      ],
      ownerRows: [
        {
          key: "owner:1:lease-review",
          title: "sub-agent Review worker (Running)",
          detail: "Owns local-text:runtime-1:5001 / Capability Local Text / 4.0 GiB actual; 6.0 GiB estimated",
          meta: expect.stringContaining("sub-agent thread child-thread"),
          tone: "warning",
        },
      ],
      blockedActionRows: [
        {
          key: "blocked-action:1:local-text:runtime-1:5001:stop",
          title: "Stop blocked for local-text:runtime-1:5001",
          detail: expect.stringContaining("Forced action must cancel or mark affected sub-agents"),
          meta: expect.stringContaining("blockers lease-review"),
          tone: "warning",
        },
      ],
      nextSafeActionRows: [
        {
          key: "next-safe-action:1:wait-for-owner:local-text:runtime-1:5001",
          title: "Wait For Owner (Blocked)",
          detail: expect.stringContaining("Ownership resolution: Cancel Or Mark Affected Subagents"),
          meta: expect.stringContaining("resolution blockers lease-review"),
          tone: "danger",
        },
      ],
      memoryRows: [
        {
          key: "memory:active",
          title: "Active resident memory",
          detail: "6.0 GiB estimated / 4.0 GiB actual / basis Actual RSS",
          meta: "1 actual RSS / 0 estimate-only / 0 unknown",
          tone: "neutral",
        },
        {
          key: "memory:projected",
          title: "Projected memory policy",
          detail: "utilization 62% / free 12 GiB / free ratio 38%",
          meta: "No uncertainty recorded",
          tone: "neutral",
        },
      ],
    });
  });

  it("keeps local runtime ownership and blocker evidence searchable", () => {
    const model = localRuntimeEvidenceInspectorModel(evidence(), summary());

    expect(model?.searchText).toContain("lease-review");
    expect(model?.searchText).toContain("child-thread");
    expect(model?.searchText).toContain("wait-for-owner");
    expect(model?.searchText).toContain("Forced action must cancel or mark affected sub-agents");
    expect(model?.searchText).toContain("Projected memory policy");
  });

  it("marks untracked runtimes and memory uncertainty as unsafe to stop silently", () => {
    const base = evidence();
    const model = localRuntimeEvidenceInspectorModel({
      ...base,
      counts: { ...base.counts, runtimes: 2, blockedActions: 2, nextSafeActions: 2 },
      shownCounts: { ...base.shownCounts, runtimes: 2, blockedActions: 2, nextSafeActions: 2 },
      runtimes: [
        ...base.runtimes,
        {
          sequence: 2,
          runtimeEntryId: "llama.cpp:untracked:8123",
          capability: "local-text",
          trackingStatus: "untracked",
          running: true,
          pid: 8123,
          ownerLabels: [],
          activeLeaseIds: [],
          staleLeaseIds: [],
          releasedLeaseIds: [],
          crashedLeaseIds: [],
          ordinaryStopAllowed: false,
          ordinaryRestartAllowed: false,
          stopReason: "Ambient did not launch this process.",
          restartReason: "Ambient did not launch this process.",
          forceStopAllowed: false,
          forceRestartAllowed: false,
          forceStopRequiresSubagentCancellation: false,
          forceRestartRequiresSubagentCancellation: false,
          untracked: true,
        },
      ],
      blockedActions: [
        ...base.blockedActions,
        {
          sequence: 2,
          runtimeEntryId: "llama.cpp:untracked:8123",
          action: "stop",
          reason: "Unknown llama.cpp process is untracked.",
          blockerLeaseIds: [],
          affectedSubagentLabels: [],
          affectedSubagentThreadIds: [],
          forceAllowed: false,
          forceRequiresSubagentCancellation: false,
          untracked: true,
        },
      ],
      nextSafeActions: [
        ...base.nextSafeActions,
        {
          sequence: 2,
          action: "ask-user-to-stop-untracked",
          safety: "external",
          reason: "Ask the user before stopping an unknown local process.",
          runtimeEntryId: "llama.cpp:untracked:8123",
          capability: "local-text",
          untracked: true,
        },
      ],
      memoryEvidence: {
        ...base.memoryEvidence,
        projectedFreeMemoryRatio: 0.12,
        uncertaintyReasons: ["untracked runtime RSS unknown"],
        entryCountWithUnknownMemory: 1,
      },
    });

    expect(model?.statusTone).toBe("danger");
    expect(model?.badges).toContain("Untracked runtime present");
    expect(model?.badges).toContain("1 memory uncertainty reason");
    expect(model?.runtimeRows[1]).toMatchObject({
      title: "llama.cpp:untracked:8123 (Running)",
      detail: expect.stringContaining("Untracked process; do not assume safe to stop"),
      tone: "danger",
    });
    expect(model?.blockedActionRows[1]).toMatchObject({
      detail: expect.stringContaining("Untracked process; ask user before stopping"),
      tone: "danger",
    });
    expect(model?.nextSafeActionRows[1]).toMatchObject({
      title: "Ask User To Stop Untracked (External)",
      detail: expect.stringContaining("Untracked process remains user-owned"),
      tone: "danger",
    });
    expect(model?.memoryRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "memory:projected",
        detail: expect.stringContaining("free ratio 12%"),
        tone: "danger",
      }),
      expect.objectContaining({
        key: "memory:uncertainty",
        detail: "untracked runtime RSS unknown",
        tone: "warning",
      }),
    ]));
  });

  it("surfaces summary-only unavailable local runtime evidence", () => {
    expect(localRuntimeEvidenceInspectorModel(undefined, {
      ...summary(),
      status: "unavailable",
      message: "Local runtime inventory was not available during export.",
      runtimeCount: 0,
      activeLeaseCount: 0,
      stopBlockedCount: 0,
      restartBlockedCount: 0,
    })).toMatchObject({
      statusLabel: "Local runtime evidence unavailable",
      statusTone: "neutral",
      summary: "Local runtime inventory was not available during export.",
      countsRows: [],
      runtimeRows: [],
      ownerRows: [],
      blockedActionRows: [],
      nextSafeActionRows: [],
      memoryRows: [],
    });
  });
});

function summary(): DiagnosticExportLocalRuntimeSummary {
  return {
    status: "needs_attention",
    message: "Local runtime evidence captured one active owner and blocked ordinary stop.",
    runtimeCount: 1,
    runningCount: 1,
    activeLeaseCount: 1,
    stopBlockedCount: 1,
    restartBlockedCount: 1,
    untrackedCount: 0,
    staleLeaseCount: 0,
    releasedLeaseCount: 0,
    crashedLeaseCount: 0,
    activeEstimatedResidentMemoryBytes: 6 * 1024 ** 3,
    activeActualResidentMemoryBytes: 4 * 1024 ** 3,
    memoryPolicyOutcome: "allow",
    memoryPolicyReason: "Projected load remains above the free-memory floor.",
    errorMessages: [],
  };
}

function evidence(): DiagnosticExportLocalRuntimeEvidence {
  const createdAt = "2026-06-05T00:00:01.000Z";
  return {
    schemaVersion: "ambient-local-runtime-diagnostic-evidence-v1",
    source: "diagnostic_export",
    capturedAt: createdAt,
    truncated: false,
    counts: {
      runtimes: 1,
      activeOwners: 1,
      blockedActions: 1,
      nextSafeActions: 1,
    },
    shownCounts: {
      runtimes: 1,
      activeOwners: 1,
      blockedActions: 1,
      nextSafeActions: 1,
    },
    runtimes: [{
      sequence: 1,
      runtimeEntryId: "local-text:runtime-1:5001",
      capability: "local-text",
      trackingStatus: "managed",
      running: true,
      providerId: "local",
      modelRuntimeId: "runtime-1",
      modelProfileId: "local-text-4b-q4",
      modelId: "local/text-4b",
      pid: 5001,
      endpoint: "http://127.0.0.1:43123/health",
      estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      actualResidentMemoryBytes: 4 * 1024 ** 3,
      memorySampledAt: createdAt,
      ownerLabels: ["sub-agent Review worker"],
      activeLeaseIds: ["lease-review"],
      staleLeaseIds: [],
      releasedLeaseIds: [],
      crashedLeaseIds: [],
      ordinaryStopAllowed: false,
      ordinaryRestartAllowed: false,
      stopReason: "Ordinary Stop disabled while sub-agent Review worker owns this runtime.",
      restartReason: "Ordinary Restart disabled while sub-agent Review worker owns this runtime.",
      forceStopAllowed: true,
      forceRestartAllowed: true,
      forceStopRequiresSubagentCancellation: true,
      forceRestartRequiresSubagentCancellation: true,
      untracked: false,
    }],
    activeOwners: [{
      sequence: 1,
      runtimeEntryId: "local-text:runtime-1:5001",
      leaseId: "lease-review",
      displayName: "sub-agent Review worker",
      status: "running",
      parentThreadId: "parent-thread",
      subagentThreadId: "child-thread",
      subagentRunId: "child-run",
      capabilityKind: "local-text",
      providerId: "local",
      modelRuntimeId: "runtime-1",
      modelProfileId: "local-text-4b-q4",
      modelId: "local/text-4b",
      estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      actualResidentMemoryBytes: 4 * 1024 ** 3,
      pid: 5001,
      endpoint: "http://127.0.0.1:43123/health",
      acquiredAt: createdAt,
      lastHeartbeatAt: createdAt,
    }],
    blockedActions: [{
      sequence: 1,
      runtimeEntryId: "local-text:runtime-1:5001",
      action: "stop",
      reason: "Ordinary Stop disabled while sub-agent Review worker owns this runtime.",
      blockerLeaseIds: ["lease-review"],
      affectedSubagentLabels: ["sub-agent Review worker (run child-run, thread child-thread, lease lease-review)"],
      affectedSubagentThreadIds: ["child-thread"],
      forceAllowed: true,
      forceRequiresSubagentCancellation: true,
      untracked: false,
    }],
    nextSafeActions: [{
      sequence: 1,
      action: "wait-for-owner",
      safety: "blocked",
      reason: "Wait for sub-agent Review worker to release lease-review before ordinary Stop.",
      runtimeEntryId: "local-text:runtime-1:5001",
      capability: "local-text",
      blockerLeaseIds: ["lease-review"],
      affectedSubagentLabels: ["sub-agent Review worker (run child-run, thread child-thread, lease lease-review)"],
      ownershipResolution: {
        lifecycleAction: "stop",
        resolution: "cancel-or-mark-affected-subagents",
        requiresInventoryRefresh: true,
        reason: "Forced Stop must cancel or mark affected sub-agents first.",
        blockerLeaseIds: ["lease-review"],
        affectedSubagentLabels: ["sub-agent Review worker (run child-run, thread child-thread, lease lease-review)"],
      },
      untracked: false,
    }],
    memoryEvidence: {
      activeEstimatedResidentMemoryBytes: 6 * 1024 ** 3,
      activeActualResidentMemoryBytes: 4 * 1024 ** 3,
      activeResidentMemoryBasis: "actual-rss",
      projectedSystemMemoryUtilization: 0.62,
      projectedFreeMemoryBytes: 12 * 1024 ** 3,
      projectedFreeMemoryRatio: 0.38,
      uncertaintyReasons: [],
      entryCountWithActualRss: 1,
      entryCountWithOnlyEstimate: 0,
      entryCountWithUnknownMemory: 0,
    },
  };
}
