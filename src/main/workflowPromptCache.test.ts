import { describe, expect, it } from "vitest";
import { workflowPromptParts } from "./workflowPromptCache";

describe("workflowPromptParts", () => {
  it("keeps stable-prefix identity separate from mutable suffix changes", () => {
    const first = workflowPromptParts({
      stage: "compile",
      workflowThreadId: "workflow-thread-1",
      graphSnapshotId: "graph-1",
      stablePrefix: "Stable compiler instructions\nAvailable tools: ambient.responses",
      mutableSuffix: "Discovery answer: classify inbox records",
      boundaryLabel: "Compiler boundary",
      createdAt: "2026-05-02T00:00:00.000Z",
    });
    const second = workflowPromptParts({
      stage: "compile",
      workflowThreadId: "workflow-thread-1",
      graphSnapshotId: "graph-1",
      stablePrefix: "Stable compiler instructions\nAvailable tools: ambient.responses",
      mutableSuffix: "Discovery answer: summarize inbox records",
      boundaryLabel: "Compiler boundary",
      createdAt: "2026-05-02T00:00:00.000Z",
    });

    expect(first.cacheCheckpoint.stablePrefixHash).toBe(second.cacheCheckpoint.stablePrefixHash);
    expect(first.cacheCheckpoint.mutableSuffixHash).not.toBe(second.cacheCheckpoint.mutableSuffixHash);
    expect(first.cacheCheckpoint.requestHash).not.toBe(second.cacheCheckpoint.requestHash);
    expect(first.prompt).toContain("--- Compiler boundary: mutable suffix begins ---");
    expect(first.cacheCheckpoint).toMatchObject({
      id: expect.stringMatching(/^workflow-cache-compile-/),
      stage: "compile",
      workflowThreadId: "workflow-thread-1",
      graphSnapshotId: "graph-1",
      stablePrefixChars: expect.any(Number),
      mutableSuffixEstimatedTokens: expect.any(Number),
    });
  });
});
