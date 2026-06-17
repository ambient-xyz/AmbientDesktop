import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildAgentMemoryRolloutReviewReportFromFile,
  buildAgentMemoryRolloutReviewReport,
  renderAgentMemoryRolloutReviewMarkdown,
  writeAgentMemoryRolloutReviewReport,
} from "./agentMemoryRolloutReviewEvidence";

const tempRoots: string[] = [];
const itWritesConfiguredArtifact = process.env.AMBIENT_TENCENT_MEMORY_ROLLOUT_REVIEW_OUT ? it : it.skip;

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("agent memory rollout review evidence", () => {
  it("graduates long-term memory when live smoke and privacy language pass", () => {
    const report = buildAgentMemoryRolloutReviewReport({
      checkedAt: "2026-06-13T00:00:00.000Z",
      liveSmokeReportPath: "test-results/tencent-memory-live-smoke/latest.json",
      liveSmokeReport: liveSmokeReport(),
    });

    expect(report.liveSmoke).toMatchObject({
      status: "passed",
      provider: "GMI Cloud",
      l1RowCount: 1,
      rowsAfterDeleteCount: 0,
      inspectToolUsed: true,
      deleteToolUsed: true,
      inspectTableHadTarget: true,
      deletedTargetMissingAfterDelete: true,
      memoryOffControlPassed: true,
    });
    expect(report.review.decision).toBe("graduate_long_term_only");
    expect(report.review.blockers).toEqual([]);
    expect(report.review.blockers.join("\n")).not.toContain("Memory-on/off dogfood comparison");
    expect(report.review.lanes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "memory_on_recall_capture", status: "passed" }),
      expect.objectContaining({ id: "memory_on_off_comparison", status: "passed" }),
      expect.objectContaining({ id: "context_accounting", status: "passed" }),
      expect.objectContaining({ id: "deletion_privacy_language", status: "passed" }),
      expect.objectContaining({ id: "native_preflight", status: "passed" }),
      expect.objectContaining({ id: "short_term_offload", status: "missing" }),
    ]));

    const markdown = renderAgentMemoryRolloutReviewMarkdown(report);
    expect(markdown).toContain("Decision: Graduate long-term only");
    expect(markdown).toContain("Delete tool used: yes");
    expect(markdown).toContain("workspace-local storage");
  });

  it("writes JSON and Markdown rollout review artifacts", async () => {
    const root = await tempDir();
    const jsonPath = join(root, "rollout", "latest.json");
    const markdownPath = join(root, "rollout", "latest.md");
    const report = buildAgentMemoryRolloutReviewReport({
      checkedAt: "2026-06-13T00:00:00.000Z",
      liveSmokeReport: liveSmokeReport(),
    });

    await writeAgentMemoryRolloutReviewReport({ report, jsonPath, markdownPath });

    expect(JSON.parse(await readFile(jsonPath, "utf8"))).toMatchObject({
      schemaVersion: "ambient-agent-memory-rollout-review-report-v1",
      review: { decision: "graduate_long_term_only" },
      liveSmoke: { status: "passed" },
    });
    expect(await readFile(markdownPath, "utf8")).toContain("# TencentDB Agent Memory Rollout Review");
  });

  itWritesConfiguredArtifact("writes configured rollout review artifact from latest live smoke evidence", async () => {
    const jsonPath = process.env.AMBIENT_TENCENT_MEMORY_ROLLOUT_REVIEW_OUT!;
    const markdownPath = jsonPath.replace(/\.json$/i, ".md");
    const liveSmokeReportPath = process.env.AMBIENT_TENCENT_MEMORY_LIVE_SMOKE_REPORT
      ?? "test-results/tencent-memory-live-smoke/latest.json";
    const report = await buildAgentMemoryRolloutReviewReportFromFile({
      checkedAt: "2026-06-13T00:00:00.000Z",
      liveSmokeReportPath,
    });

    await writeAgentMemoryRolloutReviewReport({ report, jsonPath, markdownPath });

    expect(report.review.decision).toBe("graduate_long_term_only");
    expect(report.liveSmoke.status).toBe("passed");
  });
});

function liveSmokeReport() {
  return {
    schemaVersion: "ambient-tencent-memory-live-smoke-v1",
    createdAt: "2026-06-13T00:00:00.000Z",
    provider: "GMI Cloud",
    code: "TENCENT_MEMORY_LIVE_TEST",
    targetMemoryId: "mem_123",
    l1Rows: [{
      id: "mem_123",
      layer: "l1",
      type: "episodic",
      preview: "The Ambient Tencent memory smoke code is TENCENT_MEMORY_LIVE_TEST.",
      updatedAt: "2026-06-13T00:00:00.000Z",
    }],
    rowsAfterDelete: [],
    recallText: "MEMORY_RECALL_CODE: TENCENT_MEMORY_LIVE_TEST",
    memoryOffText: "MEMORY_OFF_NO_MEMORY",
    memoryOffToolNames: [],
    memoryOffRuntimeSnapshotPresent: false,
    inspectToolText: [
      "| ID | Layer | Kind | Updated | Preview |",
      "| --- | --- | --- | --- | --- |",
      "| mem_123 | l1 | episodic | 2026-06-13T00:00:00.000Z | The Ambient Tencent memory smoke code is TENCENT_MEMORY_LIVE_TEST. |",
    ].join("\n"),
    deleteToolText: "ambient_memory_delete completed\n\nResult\nDeleted 1 TencentDB l1 memory.",
    inspectToolNames: ["ambient_memory_inspect"],
    deleteToolNames: ["ambient_memory_delete"],
    runtimeSnapshots: [{
      threadId: "thread-recall",
      lastContextInjection: {
        at: "2026-06-13T00:00:00.000Z",
        messageCount: 1,
        originalUserChars: 42,
        recallContextChars: 128,
        offloadContextChars: 0,
        totalInjectedChars: 128,
        projectedUserMessageChars: 172,
        truncated: false,
      },
    }],
  };
}

async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "ambient-agent-memory-rollout-"));
  tempRoots.push(path);
  return path;
}
