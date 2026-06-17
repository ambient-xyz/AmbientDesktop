import { describe, expect, it } from "vitest";
import { AMBIENT_MODEL_RUNTIME_PROFILES } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { DEFAULT_SUBAGENT_ROLE_PROFILES } from "../../shared/subagentRoles";
import { AMBIENT_SUBAGENT_PROTOCOL_VERSION } from "../../shared/subagentProtocol";
import { materializeSubagentCapacityLeaseForRun, releaseSubagentCapacityLease, resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import type { SubagentRunSummary } from "../../shared/types";
import {
  assertCapacityClosePreservesHistory,
  assertSubagentParentMailboxEventAttribution,
  assertSubagentRunEventAttribution,
  assertSubagentRunLinkage,
  largeOutputPreviewItemsMissingArtifacts,
  validateCapacityClosePreservesHistory,
  validateChildEventAttribution,
  validateLargeOutputArtifact,
  validateLargeOutputPreviewArtifacts,
  validateParentSynthesisSafety,
  validateSubagentParentMailboxEventAttribution,
  validateSubagentRunEventAttribution,
  validateSubagentRunLinkage,
} from "./subagentInvariants";

describe("subagentInvariants", () => {
  it("validates linkage, feature-flag snapshots, and assertion errors before child runs", () => {
    expect(validateSubagentRunLinkage({ runId: "child-run" })).toEqual([
      {
        id: "parent-child-linkage",
        runId: "child-run",
        message: "Sub-agent run is missing required linkage fields: parentRunId, parentThreadId, childThreadId, canonicalPath, featureFlags, capacityLeaseSnapshot.",
      },
    ]);

    const disabledSnapshot = resolveAmbientFeatureFlags({ generatedAt: "2026-06-06T00:00:00.000Z" });
    const violations = validateSubagentRunLinkage({
      runId: "child-run",
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      canonicalPath: "parent/child",
      roleId: "explorer",
      featureFlags: disabledSnapshot,
      capacityLeaseSnapshot: capacityLease(),
    });

    expect(violations).toEqual([
      {
        id: "feature-flag-enabled",
        runId: "child-run",
        message: "ambient.subagents must be enabled in the run snapshot before creating a child run.",
      },
    ]);
    expect(() => assertSubagentRunLinkage({
      runId: "child-run",
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      canonicalPath: "parent/child",
      roleId: "explorer",
      featureFlags: disabledSnapshot,
      capacityLeaseSnapshot: capacityLease(),
    })).toThrow("ambient.subagents must be enabled");
  });

  it("rejects malformed or mismatched capacity lease snapshots", () => {
    const enabledSnapshot = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(validateSubagentRunLinkage({
      runId: "child-run",
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      canonicalPath: "parent/child",
      roleId: "explorer",
      featureFlags: enabledSnapshot,
      capacityLeaseSnapshot: { schemaVersion: "legacy-capacity-lease" },
    })).toEqual([
      {
        id: "parent-child-linkage",
        runId: "child-run",
        message: "Sub-agent run capacity lease snapshot must use schema ambient-subagent-capacity-lease-v1.",
      },
    ]);

    expect(validateSubagentRunLinkage({
      runId: "child-run",
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      canonicalPath: "parent/child",
      roleId: "explorer",
      featureFlags: enabledSnapshot,
      capacityLeaseSnapshot: {
        ...capacityLease(),
        parentThreadId: "other-parent-thread",
        childRunId: "other-child-run",
        childThreadId: "other-child-thread",
        canonicalTaskPath: "other/path",
        roleId: "reviewer",
      },
    })).toEqual([
      {
        id: "parent-child-linkage",
        runId: "child-run",
        message: "Sub-agent run capacity lease snapshot does not match linkage fields: lease parentThreadId other-parent-thread does not match parent-thread; lease childRunId other-child-run does not match child-run; lease childThreadId other-child-thread does not match child-thread; lease canonicalTaskPath other/path does not match parent/child; lease roleId reviewer does not match explorer.",
      },
    ]);
  });

  it("validates parent synthesis safety and large output artifact backing", () => {
    expect(validateParentSynthesisSafety({ runId: "child-run", status: "completed" })).toEqual([]);
    expect(validateParentSynthesisSafety({ runId: "child-run", status: "aborted_partial", partial: true })).toEqual([]);
    expect(validateParentSynthesisSafety({ runId: "child-run", status: "failed" })).toEqual([
      {
        id: "safe-parent-synthesis",
        runId: "child-run",
        message: "Parent synthesis cannot consume child status failed unless it is explicitly marked as a partial result.",
      },
    ]);

    expect(validateLargeOutputArtifact({
      runId: "child-run",
      previewBytes: 240,
      fullOutputBytes: 8192,
      previewLimitBytes: 1024,
    })).toEqual([
      {
        id: "large-output-artifact-backed",
        runId: "child-run",
        message: "Large child output (8192 bytes) needs a full artifact path beyond the 1024 byte preview.",
      },
    ]);
    expect(validateLargeOutputArtifact({
      runId: "child-run",
      previewBytes: 240,
      fullOutputBytes: 8192,
      artifactPath: "artifacts/child-output.txt",
      previewLimitBytes: 1024,
    })).toEqual([]);

    const preview = {
      kind: "large-output" as const,
      summary: "stdout · 17,000 chars · 16,000 preview",
      items: [
        {
          label: "stdout",
          chars: 17_000,
          previewChars: 16_000,
          truncated: true,
        },
        {
          label: "stderr",
          chars: 200,
          previewChars: 200,
          truncated: false,
        },
      ],
    };

    expect(largeOutputPreviewItemsMissingArtifacts({ preview })).toEqual([
      { label: "stdout", chars: 17_000, previewChars: 16_000 },
    ]);
    expect(validateLargeOutputPreviewArtifacts({ runId: "child-run", preview })).toEqual([
      {
        id: "large-output-artifact-backed",
        runId: "child-run",
        message: "Large child output preview needs full artifact paths for truncated items: stdout 17000/16000.",
      },
    ]);
    expect(validateLargeOutputPreviewArtifacts({
      runId: "child-run",
      preview,
      artifactPath: "artifacts/stdout.txt",
    })).toEqual([]);
    expect(validateLargeOutputPreviewArtifacts({
      runId: "child-run",
      preview: {
        ...preview,
        items: preview.items.map((item) => item.label === "stdout" ? { ...item, artifactPath: "artifacts/stdout.txt" } : item),
      },
    })).toEqual([]);
  });

  it("validates that close releases capacity without dropping retained history", () => {
    const before = subagentRun({
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        artifactPath: ".ambient/subagents/child-run/result.json",
      },
    });
    const closed = {
      ...before,
      closedAt: "2026-06-06T12:00:00.000Z",
      capacityLeaseSnapshot: releaseSubagentCapacityLease(before.capacityLeaseSnapshot, {
        releasedAt: "2026-06-06T12:00:00.000Z",
        reason: "close_agent released live sub-agent capacity while preserving transcript history.",
      }),
    };

    expect(validateCapacityClosePreservesHistory({ before, after: closed })).toEqual([]);
    expect(() => assertCapacityClosePreservesHistory({ before, after: closed })).not.toThrow();

    expect(validateCapacityClosePreservesHistory({
      before,
      after: {
        ...before,
        closedAt: "2026-06-06T12:00:00.000Z",
      },
    })).toEqual([
      {
        id: "capacity-close-preserves-history",
        runId: "child-run",
        message: "Closing a sub-agent must release its capacity lease while retaining transcript and artifact history.",
      },
    ]);

    expect(validateCapacityClosePreservesHistory({
      before,
      after: {
        ...closed,
        childThreadId: "other-child-thread",
        resultArtifact: undefined,
      },
    })).toEqual([
      {
        id: "capacity-close-preserves-history",
        runId: "child-run",
        message: "Closing a sub-agent must preserve run/thread history identity: childThreadId other-child-thread does not match child-thread.",
      },
      {
        id: "capacity-close-preserves-history",
        runId: "child-run",
        message: "Closing a sub-agent must preserve the existing result artifact reference.",
      },
      {
        id: "capacity-close-preserves-history",
        runId: "child-run",
        message: "Closed sub-agent capacity lease no longer matches retained run/thread history: lease childThreadId child-thread does not match other-child-thread.",
      },
    ]);
  });

  it("validates runtime event and parent mailbox attribution to child runs", () => {
    expect(validateChildEventAttribution({ eventType: "subagent.status" })).toEqual([
      {
        id: "child-event-attribution",
        message: "Sub-agent event subagent.status must identify the originating child run.",
      },
    ]);

    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.runtime_event",
      preview: {
        schemaVersion: "ambient-subagent-runtime-event-v1",
        runId: "other-child",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent runtime event runId other-child does not match persisted child run child-run.",
      },
    ]);
    expect(() => assertSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.runtime_event",
      preview: { schemaVersion: "ambient-subagent-runtime-event-v1" },
    })).toThrow("missing attribution fields");
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.approval_requested",
      preview: {
        schemaVersion: "ambient-subagent-approval-bridge-v1",
        approvalId: "approval-1",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent approval event subagent.approval_requested is missing attribution fields: childRunId, childThreadId.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.child_approval_forwarded",
      preview: {
        schemaVersion: "ambient-subagent-approval-bridge-v1",
        childRunId: "other-child",
        childThreadId: "child-thread",
        approvalId: "approval-1",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent approval event childRunId other-child does not match persisted child run child-run.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.child_approval_forwarded",
      preview: {
        schemaVersion: "ambient-subagent-approval-bridge-v1",
        childRunId: "child-run",
        childThreadId: "child-thread",
        approvalId: "approval-1",
      },
    })).toEqual([]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.supervisor_request",
      preview: {
        schemaVersion: "ambient-subagent-supervisor-request-v1",
        childRunId: "child-run",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent supervisor request event is missing attribution fields: childThreadId, kind.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.supervisor_request",
      preview: {
        schemaVersion: "ambient-subagent-supervisor-request-v1",
        childRunId: "other-child",
        childThreadId: "child-thread",
        kind: "blocked",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent supervisor request event childRunId other-child does not match persisted child run child-run.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.supervisor_request",
      preview: {
        schemaVersion: "ambient-subagent-supervisor-request-v1",
        childRunId: "child-run",
        childThreadId: "child-thread",
        kind: "need_decision",
      },
    })).toEqual([]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.cancel_requested",
      preview: {
        idempotencyKey: "cancel:branch",
        reason: "Stop this branch.",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent control event subagent.cancel_requested is missing attribution fields: childRunId, childThreadId, parentRunId, parentThreadId, canonicalTaskPath.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.followup_agent.queued",
      preview: {
        childRunId: "other-child",
        childThreadId: "child-thread",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: "root/0:worker",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent control event childRunId other-child does not match persisted child run child-run.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.close_requested",
      preview: {
        childRunId: "child-run",
        childThreadId: "child-thread",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: "root/0:worker",
      },
    })).toEqual([]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.worktree_unavailable",
      preview: {
        reason: "Worktree preparation failed.",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent worktree event subagent.worktree_unavailable is missing attribution fields: childRunId, childThreadId, parentRunId, parentThreadId, canonicalTaskPath.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.worktree_prepared",
      preview: {
        childRunId: "other-child",
        childThreadId: "child-thread",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: "root/0:worker",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent worktree event childRunId other-child does not match persisted child run child-run.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.worktree_prepared",
      preview: {
        childRunId: "child-run",
        childThreadId: "child-thread",
        parentRunId: "parent-run",
        parentThreadId: "parent-thread",
        canonicalTaskPath: "root/0:worker",
      },
    })).toEqual([]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.local_text_runtime_failed",
      preview: {
        schemaVersion: "ambient-local-model-runtime-startup-failure-v1",
        reason: "startup_timeout",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent local text event subagent.local_text_runtime_failed is missing attribution fields: childRunId, childThreadId.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.local_text_failed",
      preview: {
        childRunId: "other-child",
        childThreadId: "child-thread",
        error: "Local text child failed.",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent local text event childRunId other-child does not match persisted child run child-run.",
      },
    ]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.runtime_budget_exceeded",
      preview: {
        childRunId: "child-run",
        childThreadId: "child-thread",
        status: "aborted_partial",
        runtime: "local_text",
      },
    })).toEqual([]);
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.runtime_idle_timeout",
      preview: {
        childRunId: "child-run",
        childThreadId: "child-thread",
        status: "failed",
        reason: "runtime_idle_timeout",
      },
    })).toEqual([]);

    expect(validateSubagentParentMailboxEventAttribution({
      parentRunId: "parent-run",
      type: "subagent.grouped_completion",
      payload: {},
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "parent-run",
        message: "Sub-agent parent mailbox event subagent.grouped_completion must identify at least one originating child run.",
      },
    ]);
    expect(validateSubagentParentMailboxEventAttribution({
      parentRunId: "parent-run",
      type: "subagent.grouped_completion",
      payload: { childRuns: [{ runId: "child-run" }] },
    })).toEqual([]);
    expect(validateSubagentParentMailboxEventAttribution({
      parentRunId: "parent-run",
      type: "subagent.child_approval_requested",
      payload: {
        schemaVersion: "ambient-subagent-approval-bridge-v1",
        approvalId: "approval-1",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "parent-run",
        message: "Sub-agent parent mailbox event subagent.child_approval_requested must identify at least one originating child run.",
      },
    ]);
    expect(validateSubagentParentMailboxEventAttribution({
      parentRunId: "parent-run",
      type: "subagent.child_approval_forwarded",
      payload: {
        schemaVersion: "ambient-subagent-approval-bridge-v1",
        approvalId: "approval-1",
        childRunId: "child-run",
      },
    })).toEqual([]);
    expect(validateSubagentParentMailboxEventAttribution({
      parentRunId: "parent-run",
      type: "subagent.child_supervisor_request",
      payload: {
        schemaVersion: "ambient-subagent-supervisor-request-v1",
        childRunId: "child-run",
      },
    })).toEqual([]);
    expect(validateSubagentParentMailboxEventAttribution({
      parentRunId: "parent-run",
      type: "subagent.spawn_failed",
      payload: {},
    })).toEqual([]);
    expect(() => assertSubagentParentMailboxEventAttribution({
      parentRunId: "parent-run",
      type: "subagent.wait_barrier_attention",
      payload: { waitBarrier: { status: "waiting_on_children" } },
    })).toThrow("must identify at least one originating child run");
  });
});

function subagentRun(input: { resultArtifact?: unknown } = {}): SubagentRunSummary {
  const model = AMBIENT_MODEL_RUNTIME_PROFILES[0];
  const role = DEFAULT_SUBAGENT_ROLE_PROFILES.find((profile) => profile.id === "explorer") ?? DEFAULT_SUBAGENT_ROLE_PROFILES[0];
  return {
    id: "child-run",
    protocolVersion: AMBIENT_SUBAGENT_PROTOCOL_VERSION,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "parent/child",
    roleId: "explorer",
    roleProfileSnapshot: role,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "completed",
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-06T00:00:00.000Z",
    }),
    modelRuntimeSnapshot: {
      schemaVersion: "ambient-model-runtime-snapshot-v1",
      resolvedAt: "2026-06-06T00:00:00.000Z",
      requestedModelId: model.modelId,
      profile: model,
    },
    capacityLeaseSnapshot: capacityLease(),
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...(input.resultArtifact !== undefined ? { resultArtifact: input.resultArtifact } : {}),
  };
}

function capacityLease() {
  return materializeSubagentCapacityLeaseForRun(
    resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "parent/child",
      roleId: "explorer",
      model: AMBIENT_MODEL_RUNTIME_PROFILES[0],
      now: "2026-06-06T00:00:00.000Z",
    }),
    {
      childRunId: "child-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "parent/child",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      roleId: "explorer",
    },
  );
}
