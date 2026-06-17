import { describe, expect, it } from "vitest";
import {
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
  findSubagentRunEventByIdempotencyKey,
  subagentRunEventPreviewIdempotencyKey,
} from "./subagentIdempotency";

describe("sub-agent idempotency contracts", () => {
  it("creates stable operation-scoped keys for retried child actions", () => {
    const input = {
      operation: "spawn" as const,
      parentRunId: "parent-run",
      childRunId: "child-run",
      canonicalPath: "root/0:explorer",
      payloadFingerprint: "payload-hash",
    };

    expect(createSubagentIdempotencyKey(input)).toBe(createSubagentIdempotencyKey({ ...input }));
    expect(createSubagentIdempotencyKey(input)).toMatch(/^subagent:spawn:[a-f0-9]{24}$/);
  });

  it("separates operations, child paths, and payload fingerprints", () => {
    const base = {
      operation: "followup" as const,
      childRunId: "child-run",
      canonicalPath: "root/0:explorer",
      payloadFingerprint: createSubagentPayloadFingerprint({ message: "Check restart recovery." }),
    };

    expect(createSubagentIdempotencyKey({ ...base, operation: "wait" })).not.toBe(createSubagentIdempotencyKey(base));
    expect(createSubagentIdempotencyKey({ ...base, canonicalPath: "root/1:reviewer" })).not.toBe(createSubagentIdempotencyKey(base));
    expect(createSubagentIdempotencyKey({
      ...base,
      payloadFingerprint: createSubagentPayloadFingerprint({ message: "Check tool scopes." }),
    })).not.toBe(createSubagentIdempotencyKey(base));
  });

  it("fingerprints objects independent of key order while preserving array order", () => {
    const first = createSubagentPayloadFingerprint({
      task: "summarize",
      limits: { maxTurns: 3, timeoutMs: 120_000 },
      children: ["root/0:explorer", "root/1:reviewer"],
    });
    const reordered = createSubagentPayloadFingerprint({
      children: ["root/0:explorer", "root/1:reviewer"],
      limits: { timeoutMs: 120_000, maxTurns: 3 },
      task: "summarize",
    });
    const differentArrayOrder = createSubagentPayloadFingerprint({
      task: "summarize",
      limits: { maxTurns: 3, timeoutMs: 120_000 },
      children: ["root/1:reviewer", "root/0:explorer"],
    });

    expect(first).toBe(reordered);
    expect(first).not.toBe(differentArrayOrder);
  });

  it("fingerprints undefined payload fields deterministically", () => {
    expect(createSubagentPayloadFingerprint(undefined)).toBe(createSubagentPayloadFingerprint(undefined));
    expect(createSubagentPayloadFingerprint({ message: undefined })).toBe(createSubagentPayloadFingerprint({ message: undefined }));
    expect(createSubagentPayloadFingerprint({ message: undefined })).not.toBe(createSubagentPayloadFingerprint({}));
  });

  it("finds run events by typed preview idempotency key without widening event type", () => {
    const matching = {
      type: "subagent.followup_requested",
      preview: { idempotencyKey: " follow:restart " },
      sequence: 2,
    };
    const events = [
      { type: "subagent.followup_requested", preview: { idempotencyKey: "other" }, sequence: 1 },
      matching,
      { type: "subagent.cancel_requested", preview: { idempotencyKey: "follow:restart" }, sequence: 3 },
    ];

    expect(findSubagentRunEventByIdempotencyKey(events, "subagent.followup_requested", "follow:restart")).toBe(matching);
    expect(subagentRunEventPreviewIdempotencyKey(matching)).toBe("follow:restart");
  });

  it("ignores malformed idempotency previews when replaying retried operations", () => {
    const events = [
      { type: "subagent.followup_requested", preview: { idempotencyKey: "" } },
      { type: "subagent.followup_requested", preview: { idempotencyKey: ["follow:restart"] } },
      { type: "subagent.followup_requested", preview: ["follow:restart"] },
    ];

    expect(findSubagentRunEventByIdempotencyKey(events, "subagent.followup_requested", "follow:restart")).toBeUndefined();
    expect(findSubagentRunEventByIdempotencyKey(events, "subagent.followup_requested", " ")).toBeUndefined();
  });
});
