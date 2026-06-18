import { describe, expect, it } from "vitest";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./subagentIdempotency";
import {
  assertSubagentRunLinkage,
  validateChildEventAttribution,
  validateLargeOutputArtifact,
  validateParentSynthesisSafety,
  validateSubagentParentMailboxEventAttribution,
  validateSubagentRunEventAttribution,
  validateSubagentRunLinkage,
} from "./subagentInvariants";
import {
  childRunAttributionRequired,
  createSubagentObservabilityEvent,
  summarizeSubagentObservability,
  validateSubagentObservabilityEventAttribution,
} from "./subagentObservability";

describe("sub-agent hardening foundation", () => {
  it("requires linkage fields and enabled feature flag before child creation", () => {
    const disabledFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" });

    expect(validateSubagentRunLinkage({
      runId: "child-run",
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      canonicalPath: "root/0:explorer",
      featureFlags: disabledFlags,
    })).toEqual([
      {
        id: "parent-child-linkage",
        runId: "child-run",
        message: "Sub-agent run is missing required linkage fields: capacityLeaseSnapshot.",
      },
      {
        id: "feature-flag-enabled",
        runId: "child-run",
        message: `${AMBIENT_SUBAGENTS_FEATURE_FLAG} must be enabled in the run snapshot before creating a child run.`,
      },
    ]);

    expect(() => assertSubagentRunLinkage({ runId: "child-run" })).toThrow(/parentRunId/);
  });

  it("rejects unsafe parent synthesis and large output without artifacts", () => {
    expect(validateParentSynthesisSafety({ runId: "child-run", status: "timed_out" })).toEqual([
      {
        id: "safe-parent-synthesis",
        runId: "child-run",
        message: "Parent synthesis cannot consume child status timed_out unless it is explicitly marked as a partial result.",
      },
    ]);

    expect(validateLargeOutputArtifact({
      runId: "child-run",
      previewBytes: 1000,
      fullOutputBytes: 5000,
      previewLimitBytes: 2000,
    })).toEqual([
      {
        id: "large-output-artifact-backed",
        runId: "child-run",
        message: "Large child output (5000 bytes) needs a full artifact path beyond the 2000 byte preview.",
      },
    ]);
  });

  it("requires child attribution for tool and error events", () => {
    expect(validateChildEventAttribution({ eventType: "tool.call" })).toEqual([
      {
        id: "child-event-attribution",
        message: "Sub-agent event tool.call must identify the originating child run.",
      },
    ]);
  });

  it("requires exact child attribution in persisted runtime and parent-mailbox event payloads", () => {
    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.runtime_event",
      preview: {
        schemaVersion: "ambient-subagent-runtime-event-v1",
        type: "tool_call",
        source: "child_runtime",
        runId: "different-child",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        createdAt: "2026-06-05T00:00:00.000Z",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent runtime event runId different-child does not match persisted child run child-run.",
      },
    ]);

    expect(validateSubagentRunEventAttribution({
      runId: "child-run",
      eventType: "subagent.runtime_event",
      preview: {
        schemaVersion: "ambient-subagent-runtime-event-v1",
        type: "error",
        source: "child_runtime",
        runId: "child-run",
        createdAt: "2026-06-05T00:00:00.000Z",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "child-run",
        message: "Sub-agent runtime event is missing attribution fields: parentThreadId, parentRunId, childThreadId, canonicalTaskPath.",
      },
    ]);

    expect(validateSubagentParentMailboxEventAttribution({
      parentRunId: "parent-run",
      type: "subagent.lifecycle_interrupted",
      payload: {
        schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
        parentRunId: "parent-run",
        status: "cancelled",
      },
    })).toEqual([
      {
        id: "child-event-attribution",
        runId: "parent-run",
        message: "Sub-agent parent mailbox event subagent.lifecycle_interrupted must identify at least one originating child run.",
      },
    ]);

    expect(validateSubagentParentMailboxEventAttribution({
      parentRunId: "parent-run",
      type: "subagent.wait_barrier_decision",
      payload: {
        schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
        parentRunId: "parent-run",
        childRunIds: ["child-run"],
      },
    })).toEqual([]);
  });

  it("creates stable idempotency keys from stable payload fingerprints", () => {
    const a = createSubagentPayloadFingerprint({ b: 2, a: 1 });
    const b = createSubagentPayloadFingerprint({ a: 1, b: 2 });

    expect(a).toBe(b);
    expect(createSubagentIdempotencyKey({
      operation: "spawn",
      parentRunId: "parent",
      canonicalPath: "root/0:explorer",
      payloadFingerprint: a,
    })).toBe(createSubagentIdempotencyKey({
      operation: "spawn",
      parentRunId: "parent",
      canonicalPath: "root/0:explorer",
      payloadFingerprint: b,
    }));
  });

  it("creates typed observability events and identifies attribution-sensitive events", () => {
    const event = createSubagentObservabilityEvent({
      type: "subagent.tool_denied",
      runId: "child-run",
      deniedToolCategory: "workspace.write",
      reason: "Mutating child requires an approved isolated worktree.",
      createdAt: "2026-06-05T00:00:00.000Z",
    });

    expect(event).toMatchObject({
      schemaVersion: "ambient-subagent-observability-v1",
      type: "subagent.tool_denied",
      createdAt: "2026-06-05T00:00:00.000Z",
    });
    expect(childRunAttributionRequired(event)).toBe(true);
    expect(childRunAttributionRequired(createSubagentObservabilityEvent({ type: "subagent.spawn_attempt" }))).toBe(false);
  });

  it("rejects child-scoped observability events that omit child run attribution", () => {
    expect(validateSubagentObservabilityEventAttribution({
      schemaVersion: "ambient-subagent-observability-v1",
      type: "subagent.wait_duration",
      createdAt: "2026-06-05T00:00:00.000Z",
      durationMs: 2500,
    })).toEqual([
      {
        id: "child-run-attribution",
        eventType: "subagent.wait_duration",
        message: "Sub-agent observability event subagent.wait_duration must identify the originating child run.",
      },
    ]);

    expect(() => createSubagentObservabilityEvent({
      type: "subagent.tool_denied",
      deniedToolCategory: "workspace.write",
    })).toThrow("must identify the originating child run");

    expect(createSubagentObservabilityEvent({
      type: "subagent.spawn_rejected",
      reason: "feature flag disabled",
    })).toMatchObject({
      type: "subagent.spawn_rejected",
      reason: "feature flag disabled",
    });
  });

  it("summarizes cancellation cascades and active child runtime aborts", () => {
    const summary = summarizeSubagentObservability({
      runs: [
        {
          id: "child-run",
          status: "cancelled",
          updatedAt: "2026-06-05T00:00:05.000Z",
        } as any,
      ],
      runEvents: [
        {
          runId: "child-run",
          type: "subagent.child_runtime_aborted",
          createdAt: "2026-06-05T00:00:06.000Z",
        } as any,
      ],
      waitBarriers: [],
      parentMailboxEvents: [
        {
          type: "subagent.cancellation_cascade",
          updatedAt: "2026-06-05T00:00:06.000Z",
          payload: {
            schemaVersion: "ambient-subagent-cancellation-cascade-v1",
            cancelledRunIds: ["child-run"],
          },
        } as any,
      ],
      createdAt: "2026-06-05T00:00:07.000Z",
    });

    expect(summary).toMatchObject({
      cancellationCascades: 1,
      childRuntimeAborts: 1,
      statusCounts: {
        cancelled: 1,
      },
    });

    expect(summarizeSubagentObservability({
      runs: [],
      waitBarriers: [
        {
          status: "cancelled",
          createdAt: "2026-06-05T00:00:00.000Z",
          resolvedAt: "2026-06-05T00:00:10.000Z",
        } as any,
      ],
    }).cancellationCascades).toBe(1);
  });
});
