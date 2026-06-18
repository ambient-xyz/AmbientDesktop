import { describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { AMBIENT_SUBAGENT_PROTOCOL_VERSION, type SubagentRuntimeEvent } from "../../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentMaturityEvidence } from "../../shared/subagentMaturity";
import type { PermissionRequest } from "../../shared/permissionTypes";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
} from "../../shared/subagentTypes";
import {
  recordSubagentLiveApprovalAuthorityEvidence,
  recordSubagentLiveSmokeEvidence,
  type SubagentLiveSmokeEvidenceStore,
} from "./subagentLiveSmokeEvidence";

describe("sub-agent live smoke evidence", () => {
  it("records dogfood and live Pi smoke evidence only after a completed runtime-backed child run", () => {
    const calls: Array<Parameters<SubagentLiveSmokeEvidenceStore["recordSubagentMaturityEvidence"]>[0]> = [];
    const store = { recordSubagentMaturityEvidence: storeRecord };
    const record = recordSubagentLiveSmokeEvidence(store, {
      run: completedRun(),
      runtimeEvents: [
        runtimeEvent("started"),
        runtimeEvent("assistant_delta"),
        runtimeEvent("completed"),
      ],
      provider: "GMI Cloud",
      parentCompletionText: "SUBAGENT_LIVE_DONE",
      childCompletionText: "SUBAGENT_CHILD_DONE",
      reportPath: "test-results/subagent-live-smoke/latest.json",
      evidenceKey: "nightly:subagent-live-smoke",
      createdAt: "2026-06-05T00:00:00.000Z",
    });

    expect(record).toMatchObject({
      schemaVersion: "ambient-subagent-live-smoke-evidence-v1",
      runId: "child-run",
      provider: "GMI Cloud",
      reportPath: "test-results/subagent-live-smoke/latest.json",
      dogfoodRunEvidence: expect.objectContaining({
        kind: "live_dogfood_run",
        evidenceKey: "dogfood:nightly:subagent-live-smoke",
      }),
      livePiSmokeEvidence: expect.objectContaining({
        kind: "live_pi_smoke",
        evidenceKey: "pi-smoke:nightly:subagent-live-smoke",
      }),
    });
    expect(calls).toEqual([
      expect.objectContaining({
        kind: "live_dogfood_run",
        status: "passed",
        runId: "child-run",
        parentRunId: "parent-run",
        artifactPath: "test-results/subagent-live-smoke/latest.json",
        details: expect.objectContaining({
          schemaVersion: "ambient-subagent-live-smoke-evidence-v1",
          runtimeStarted: true,
          runtimeAssistantDelta: true,
          runtimeCompleted: true,
          parentReturned: true,
          childTranscriptContainsSentinel: true,
          childSummaryReturned: true,
          resultArtifact: expect.objectContaining({ synthesisAllowed: true }),
        }),
      }),
      expect.objectContaining({
        kind: "live_pi_smoke",
        status: "passed",
        runId: "child-run",
        evidenceKey: "pi-smoke:nightly:subagent-live-smoke",
      }),
    ]);

    function storeRecord(input: Parameters<SubagentLiveSmokeEvidenceStore["recordSubagentMaturityEvidence"]>[0]): SubagentMaturityEvidence {
      calls.push(input);
      return {
        schemaVersion: "ambient-subagent-maturity-evidence-v1",
        id: `${input.kind}-evidence`,
        kind: input.kind,
        status: input.status,
        evidenceKey: input.evidenceKey,
        runId: input.runId,
        parentRunId: input.parentRunId,
        artifactPath: input.artifactPath,
        notes: input.notes,
        details: input.details,
        createdAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
        updatedAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
      };
    }
  });

  it("refuses evidence when runtime events or synthesizable completion are missing", () => {
    expect(() => recordSubagentLiveSmokeEvidence(store, {
      run: completedRun(),
      runtimeEvents: [runtimeEvent("started")],
      provider: "Ambient",
      parentCompletionText: "SUBAGENT_LIVE_DONE",
      childCompletionText: "SUBAGENT_CHILD_DONE",
    })).toThrow(/started and completed runtime events/);
    expect(() => recordSubagentLiveSmokeEvidence(store, {
      run: completedRun({ resultArtifact: { schemaVersion: "ambient-subagent-result-artifact-v1" } }),
      runtimeEvents: [runtimeEvent("started"), runtimeEvent("assistant_delta"), runtimeEvent("completed")],
      provider: "Ambient",
      parentCompletionText: "SUBAGENT_LIVE_DONE",
      childCompletionText: "SUBAGENT_CHILD_DONE",
    })).toThrow(/synthesizable child output/);
    expect(() => recordSubagentLiveSmokeEvidence(store, {
      run: completedRun({ status: "failed" }),
      runtimeEvents: [runtimeEvent("started"), runtimeEvent("assistant_delta"), runtimeEvent("completed")],
      provider: "Ambient",
      parentCompletionText: "SUBAGENT_LIVE_DONE",
      childCompletionText: "SUBAGENT_CHILD_DONE",
    })).toThrow(/requires a completed child run/);
    expect(() => recordSubagentLiveSmokeEvidence(store, {
      run: completedRun(),
      runtimeEvents: [runtimeEvent("started"), runtimeEvent("completed")],
      provider: "Ambient",
      parentCompletionText: "SUBAGENT_LIVE_DONE",
      childCompletionText: "SUBAGENT_CHILD_DONE",
    })).toThrow(/assistant_delta runtime event/);
    expect(() => recordSubagentLiveSmokeEvidence(store, {
      run: completedRun(),
      runtimeEvents: [runtimeEvent("started"), runtimeEvent("assistant_delta"), runtimeEvent("completed")],
      provider: "Ambient",
      parentCompletionText: "Parent did not return.",
      childCompletionText: "SUBAGENT_CHILD_DONE",
    })).toThrow(/parent return sentinel SUBAGENT_LIVE_DONE/);
    expect(() => recordSubagentLiveSmokeEvidence(store, {
      run: completedRun(),
      runtimeEvents: [runtimeEvent("started"), runtimeEvent("assistant_delta"), runtimeEvent("completed")],
      provider: "Ambient",
      parentCompletionText: "SUBAGENT_LIVE_DONE",
      childCompletionText: "Child transcript missed it.",
    })).toThrow(/child summary sentinel SUBAGENT_CHILD_DONE/);
    expect(() => recordSubagentLiveSmokeEvidence(store, {
      run: completedRun({
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: "child-run",
          status: "completed",
          partial: false,
          summary: "Child summarized successfully.",
          childThreadId: "child-thread",
        },
      }),
      runtimeEvents: [runtimeEvent("started"), runtimeEvent("assistant_delta"), runtimeEvent("completed")],
      provider: "Ambient",
      parentCompletionText: "SUBAGENT_LIVE_DONE",
      childCompletionText: "SUBAGENT_CHILD_DONE",
    })).toThrow(/child summary sentinel SUBAGENT_CHILD_DONE/);
  });

  it("records live approval authority evidence only when the child is paused and the parent remains blocked", () => {
    const calls: Array<Parameters<SubagentLiveSmokeEvidenceStore["recordSubagentMaturityEvidence"]>[0]> = [];
    const store = { recordSubagentMaturityEvidence: storeRecord };
    const run = approvalRun();
    const record = recordSubagentLiveApprovalAuthorityEvidence(store, {
      run,
      provider: "GMI Cloud",
      waitDetails: {
        status: "needs_attention",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice: "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
      },
      pendingPermissions: [approvalPermission()],
      parentMailboxEvents: [approvalParentMailboxEvent()],
      childTranscript: "Child tried to read a file and is waiting for approval.",
      deniedContentSentinel: "APPROVAL_SECRET_TOKEN_SHOULD_NOT_LEAK",
      expectedToolName: "read",
      expectedAction: "file_content_read",
      reportPath: "test-results/subagent-live-smoke/approval-authority-latest.json",
      evidenceKey: "approval-authority:nightly",
      createdAt: "2026-06-05T00:20:00.000Z",
    });

    expect(record).toMatchObject({
      schemaVersion: "ambient-subagent-live-approval-authority-evidence-v1",
      runId: run.id,
      provider: "GMI Cloud",
      reportPath: "test-results/subagent-live-smoke/approval-authority-latest.json",
      dogfoodRunEvidence: expect.objectContaining({
        kind: "live_dogfood_run",
        evidenceKey: "dogfood:approval-authority:nightly",
      }),
      livePiSmokeEvidence: expect.objectContaining({
        kind: "live_pi_smoke",
        evidenceKey: "pi-smoke:approval-authority:nightly",
      }),
    });
    expect(calls).toEqual([
      expect.objectContaining({
        kind: "live_dogfood_run",
        status: "passed",
        runId: "child-run",
        parentRunId: "parent-run",
        artifactPath: "test-results/subagent-live-smoke/approval-authority-latest.json",
        details: expect.objectContaining({
          schemaVersion: "ambient-subagent-live-approval-authority-evidence-v1",
          childPausedForApproval: true,
          parentRemainedBlocked: true,
          approvalForwardedToParent: true,
          approvalRequestChildThreadId: "child-thread",
          approvalRequestToolName: "read",
          approvalRequestAction: "file_content_read",
          approvalRequestId: "permission-child-read",
          approvalRequestParentMailboxEventId: "parent-mailbox-approval",
          parentMailboxDeliveryState: "queued",
          deniedContentLeaked: false,
          waitDetails: expect.objectContaining({
            status: "needs_attention",
            waitSatisfied: false,
            synthesisAllowed: false,
          }),
        }),
      }),
      expect.objectContaining({
        kind: "live_pi_smoke",
        status: "passed",
        evidenceKey: "pi-smoke:approval-authority:nightly",
      }),
    ]);

    function storeRecord(input: Parameters<SubagentLiveSmokeEvidenceStore["recordSubagentMaturityEvidence"]>[0]): SubagentMaturityEvidence {
      calls.push(input);
      return {
        schemaVersion: "ambient-subagent-maturity-evidence-v1",
        id: `${input.kind}-approval-evidence`,
        kind: input.kind,
        status: input.status,
        evidenceKey: input.evidenceKey,
        runId: input.runId,
        parentRunId: input.parentRunId,
        artifactPath: input.artifactPath,
        notes: input.notes,
        details: input.details,
        createdAt: input.createdAt ?? "2026-06-05T00:20:00.000Z",
        updatedAt: input.createdAt ?? "2026-06-05T00:20:00.000Z",
      };
    }
  });

  it("refuses live approval authority evidence when parent blocking or denied-content proof is missing", () => {
    expect(() => recordSubagentLiveApprovalAuthorityEvidence(store, {
      run: approvalRun({ status: "completed" }),
      provider: "Ambient",
      waitDetails: { status: "needs_attention", waitSatisfied: false, synthesisAllowed: false },
      pendingPermissions: [approvalPermission()],
      parentMailboxEvents: [approvalParentMailboxEvent()],
      childTranscript: "",
      deniedContentSentinel: "SECRET",
      expectedToolName: "read",
      expectedAction: "file_content_read",
    })).toThrow(/paused for attention/);
    expect(() => recordSubagentLiveApprovalAuthorityEvidence(store, {
      run: approvalRun(),
      provider: "Ambient",
      waitDetails: { status: "completed", waitSatisfied: true, synthesisAllowed: true },
      pendingPermissions: [approvalPermission()],
      parentMailboxEvents: [approvalParentMailboxEvent()],
      childTranscript: "",
      deniedContentSentinel: "SECRET",
      expectedToolName: "read",
      expectedAction: "file_content_read",
    })).toThrow(/leave the parent blocked/);
    expect(() => recordSubagentLiveApprovalAuthorityEvidence(store, {
      run: approvalRun(),
      provider: "Ambient",
      waitDetails: { status: "needs_attention", waitSatisfied: false, synthesisAllowed: false },
      pendingPermissions: [approvalPermission({ threadId: "other-thread" })],
      parentMailboxEvents: [approvalParentMailboxEvent()],
      childTranscript: "",
      deniedContentSentinel: "SECRET",
      expectedToolName: "read",
      expectedAction: "file_content_read",
    })).toThrow(/pending permission request scoped to the child thread/);
    expect(() => recordSubagentLiveApprovalAuthorityEvidence(store, {
      run: approvalRun(),
      provider: "Ambient",
      waitDetails: { status: "needs_attention", waitSatisfied: false, synthesisAllowed: false },
      pendingPermissions: [approvalPermission()],
      parentMailboxEvents: [approvalParentMailboxEvent({ deliveryState: "consumed" })],
      childTranscript: "",
      deniedContentSentinel: "SECRET",
      expectedToolName: "read",
      expectedAction: "file_content_read",
    })).toThrow(/queued parent mailbox approval event/);
    expect(() => recordSubagentLiveApprovalAuthorityEvidence(store, {
      run: approvalRun(),
      provider: "Ambient",
      waitDetails: { status: "needs_attention", waitSatisfied: false, synthesisAllowed: false },
      pendingPermissions: [approvalPermission()],
      parentMailboxEvents: [approvalParentMailboxEvent()],
      childTranscript: "SECRET",
      deniedContentSentinel: "SECRET",
      expectedToolName: "read",
      expectedAction: "file_content_read",
    })).toThrow(/denied file content/);
  });
});

const featureFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" });
const modelRuntimeSnapshot = createAmbientModelRuntimeSnapshot("zai-org/GLM-5.1-FP8", "2026-06-05T00:00:00.000Z");
const roleProfileSnapshot = getDefaultSubagentRoleProfile("summarizer");
const capacityLeaseSnapshot = resolveSubagentCapacityLease({
  parentThreadId: "parent-thread",
  parentRunId: "parent-run",
  canonicalTaskPath: "root/0:summarizer",
  roleId: "summarizer",
  model: modelRuntimeSnapshot.profile,
  existingRuns: [],
  now: "2026-06-05T00:00:00.000Z",
});

function completedRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "child-run",
    protocolVersion: AMBIENT_SUBAGENT_PROTOCOL_VERSION,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:summarizer",
    roleId: "summarizer",
    roleProfileSnapshot,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "completed",
    featureFlagSnapshot: featureFlags,
    modelRuntimeSnapshot,
    capacityLeaseSnapshot,
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:10.000Z",
    startedAt: "2026-06-05T00:00:01.000Z",
    completedAt: "2026-06-05T00:00:10.000Z",
    resultArtifact: {
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "completed",
      partial: false,
      summary: "SUBAGENT_CHILD_DONE",
      childThreadId: "child-thread",
    },
    ...overrides,
  };
}

function approvalRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return completedRun({
    status: "needs_attention",
    resultArtifact: undefined,
    completedAt: undefined,
    ...overrides,
  });
}

function approvalPermission(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: "permission-child-read",
    threadId: "child-thread",
    toolName: "read",
    title: "Allow read?",
    message: "The child wants to read a file.",
    risk: "outside-workspace",
    grantActionKind: "file_content_read",
    grantTargetKind: "path",
    grantTargetLabel: "/workspace/approval-needed.txt",
    ...overrides,
  };
}

function approvalParentMailboxEvent(overrides: Partial<SubagentParentMailboxEventSummary> = {}): SubagentParentMailboxEventSummary {
  return {
    id: "parent-mailbox-approval",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    type: "subagent.child_approval_requested",
    payload: {
      childRunId: "child-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:summarizer",
      approvalId: "permission-child-read",
      requestedToolId: "read",
      requestedAction: "file_content_read",
      parentBlockingState: {
        action: "forward_child_approval_then_wait",
        childRunId: "child-run",
        childThreadId: "child-thread",
        resumeParentBlocking: true,
      },
    },
    deliveryState: "queued",
    createdAt: "2026-06-05T00:20:00.000Z",
    updatedAt: "2026-06-05T00:20:00.000Z",
    ...overrides,
  };
}

function runtimeEvent(type: "started" | "assistant_delta" | "completed"): SubagentRuntimeEvent {
  return {
    schemaVersion: "ambient-subagent-runtime-event-v1",
    type,
    source: "child_runtime",
    runId: "child-run",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:summarizer",
    createdAt: "2026-06-05T00:00:00.000Z",
    ...(type === "started" ? { status: "running" } : {}),
    ...(type === "completed" ? { status: "completed" } : {}),
    ...(type === "assistant_delta" ? { textPreview: "SUBAGENT_CHILD_DONE" } : {}),
  };
}

const store = {
  recordSubagentMaturityEvidence(input: Parameters<SubagentLiveSmokeEvidenceStore["recordSubagentMaturityEvidence"]>[0]): SubagentMaturityEvidence {
    return {
      schemaVersion: "ambient-subagent-maturity-evidence-v1",
      id: `${input.kind}-evidence`,
      kind: input.kind,
      status: input.status,
      evidenceKey: input.evidenceKey,
      runId: input.runId,
      parentRunId: input.parentRunId,
      artifactPath: input.artifactPath,
      notes: input.notes,
      details: input.details,
      createdAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
      updatedAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
    };
  },
};
