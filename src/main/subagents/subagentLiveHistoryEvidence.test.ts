import { describe, expect, it } from "vitest";
import type {
  SubagentMaturityEvidence,
  SubagentReleaseGateLiveHistoryEntry,
} from "../../shared/subagentMaturity";
import { SUBAGENT_LIVE_EVIDENCE_LABELS } from "../../shared/subagentLiveEvidenceLanes";
import {
  normalizeReleaseGateLiveHistoryEntry,
  recordSubagentReleaseGateLiveHistoryEvidence,
  type SubagentLiveHistoryEvidenceStore,
} from "./subagentLiveHistoryEvidence";

describe("subagentLiveHistoryEvidence", () => {
  it("records clean required-live release-gate history rows as live dogfood maturity evidence", () => {
    const { store, calls } = captureStore();

    const record = recordSubagentReleaseGateLiveHistoryEvidence(store, {
      entry: liveHistoryEntry(),
      artifactPath: "test-results/subagent-release-gate/latest.json",
      createdAt: "2026-06-12T05:12:30.000Z",
    });

    expect(record).toMatchObject({
      schemaVersion: "ambient-subagent-live-history-evidence-v1",
      status: "passed",
      cleanRequiredLiveRun: true,
      skippedLiveEvidence: [],
      issues: [],
    });
    expect(calls).toEqual([
      expect.objectContaining({
        kind: "live_dogfood_run",
        status: "passed",
        evidenceKey: "live-history:2026-06-12T05-12-30.000Z",
        runId: "2026-06-12T05-12-30.000Z",
        artifactPath: "test-results/subagent-release-gate/latest.json",
        notes: "Required-live sub-agent release-gate history row was clean across all live evidence lanes.",
        details: expect.objectContaining({
          schemaVersion: "ambient-subagent-live-history-evidence-v1",
          evidenceType: "live_dogfood_run",
          releaseGateHistoryEntry: expect.objectContaining({
            schemaVersion: "ambient-subagent-release-gate-live-history-v1",
            ready: true,
            liveRequired: true,
            liveEvidence: Object.fromEntries(SUBAGENT_LIVE_EVIDENCE_LABELS.map((label) => [label, "present"])),
          }),
          skippedLiveEvidence: [],
          issues: [],
        }),
      }),
    ]);
  });

  it("records failed maturity evidence when required-live history skips lanes or has advisories", () => {
    const { store, calls } = captureStore();
    const record = recordSubagentReleaseGateLiveHistoryEvidence(store, {
      entry: liveHistoryEntry({
        ready: true,
        status: "passed",
        advisoryIssueCount: 2,
        skippedLiveEvidence: ["Desktop dogfood confidence"],
        liveEvidence: {
          ...Object.fromEntries(SUBAGENT_LIVE_EVIDENCE_LABELS.map((label) => [label, "present"])),
          "Desktop dogfood": "skipped",
        },
      }),
      createdAt: "2026-06-12T05:13:00.000Z",
    });

    expect(record).toMatchObject({
      status: "failed",
      cleanRequiredLiveRun: false,
      skippedLiveEvidence: ["Desktop dogfood confidence", "Desktop dogfood"],
      issues: [
        "Release-gate live history has 2 advisory issue(s).",
        "Release-gate live history skipped live evidence lanes: Desktop dogfood confidence, Desktop dogfood.",
      ],
    });
    expect(calls[0]).toMatchObject({
      kind: "live_dogfood_run",
      status: "failed",
      notes: "Required-live sub-agent release-gate history row is not clean: Release-gate live history has 2 advisory issue(s); and Release-gate live history skipped live evidence lanes: Desktop dogfood confidence, Desktop dogfood.",
      details: expect.objectContaining({
        releaseGateHistoryEntry: expect.objectContaining({
          advisoryIssueCount: 2,
          skippedLiveEvidence: ["Desktop dogfood confidence"],
        }),
        skippedLiveEvidence: ["Desktop dogfood confidence", "Desktop dogfood"],
      }),
    });
  });

  it("normalizes release-gate history rows before recording", () => {
    expect(normalizeReleaseGateLiveHistoryEntry({
      schemaVersion: " ambient-subagent-release-gate-live-history-v1 ",
      runId: " run-1 ",
      status: " passed ",
      ready: true,
      liveRequired: true,
      checkCounts: { " passed ": 139, invalid: Number.NaN },
      liveEvidence: {
        " Ambient/Pi smoke ": "present",
        "Desktop dogfood": "unexpected",
      },
      skippedLiveEvidence: [" Desktop dogfood "],
      completedAt: " 2026-06-12T05:12:30.000Z ",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-release-gate-live-history-v1",
      runId: "run-1",
      status: "passed",
      ready: true,
      liveRequired: true,
      checkCounts: { passed: 139 },
      liveEvidence: {
        "Ambient/Pi smoke": "present",
        "Desktop dogfood": "skipped",
      },
      skippedLiveEvidence: ["Desktop dogfood"],
      completedAt: "2026-06-12T05:12:30.000Z",
    });
  });
});

function captureStore(): {
  store: SubagentLiveHistoryEvidenceStore;
  calls: Array<Parameters<SubagentLiveHistoryEvidenceStore["recordSubagentMaturityEvidence"]>[0]>;
} {
  const calls: Array<Parameters<SubagentLiveHistoryEvidenceStore["recordSubagentMaturityEvidence"]>[0]> = [];
  return {
    calls,
    store: {
      recordSubagentMaturityEvidence(input): SubagentMaturityEvidence {
        calls.push(input);
        return {
          schemaVersion: "ambient-subagent-maturity-evidence-v1",
          id: `${input.kind}:${input.evidenceKey ?? calls.length}`,
          kind: input.kind,
          status: input.status,
          evidenceKey: input.evidenceKey,
          runId: input.runId,
          artifactPath: input.artifactPath,
          notes: input.notes,
          details: input.details,
          createdAt: input.createdAt ?? "2026-06-12T05:12:30.000Z",
          updatedAt: input.createdAt ?? "2026-06-12T05:12:30.000Z",
        };
      },
    },
  };
}

function liveHistoryEntry(overrides: Partial<SubagentReleaseGateLiveHistoryEntry> = {}): SubagentReleaseGateLiveHistoryEntry {
  return {
    schemaVersion: "ambient-subagent-release-gate-live-history-v1",
    runId: "2026-06-12T05-12-30.000Z",
    reportPath: "test-results/subagent-release-gate/latest.json",
    status: "passed",
    ready: true,
    liveRequired: true,
    startedAt: "2026-06-12T05:00:00.000Z",
    completedAt: "2026-06-12T05:12:30.000Z",
    durationMs: 750000,
    checkCounts: { passed: 139 },
    liveEvidence: Object.fromEntries(SUBAGENT_LIVE_EVIDENCE_LABELS.map((label) => [label, "present"])),
    skippedLiveEvidence: [],
    blockingIssueCount: 0,
    advisoryIssueCount: 0,
    nextSlice: "Continue repeated live dogfood.",
    ...overrides,
  };
}
