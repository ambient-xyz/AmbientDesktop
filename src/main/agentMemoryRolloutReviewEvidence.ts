import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  reviewAgentMemoryRolloutEvidence,
  type AgentMemoryRolloutEvidenceLane,
  type AgentMemoryRolloutReview,
} from "../shared/agentMemoryRolloutReview";
import { agentMemoryPrivacyLanguageReviewed } from "../shared/agentMemoryPrivacy";

export const AGENT_MEMORY_ROLLOUT_REVIEW_REPORT_SCHEMA_VERSION =
  "ambient-agent-memory-rollout-review-report-v1" as const;

export interface AgentMemoryRolloutReviewReport {
  schemaVersion: typeof AGENT_MEMORY_ROLLOUT_REVIEW_REPORT_SCHEMA_VERSION;
  createdAt: string;
  review: AgentMemoryRolloutReview;
  liveSmoke: AgentMemoryLiveSmokeEvidenceSummary;
  evidenceRefs: string[];
}

export interface AgentMemoryRolloutReviewReportInput {
  liveSmokeReport?: unknown;
  liveSmokeReportPath?: string;
  checkedAt?: string;
  memoryOnOffComparisonPassed?: boolean;
  privacyLanguageReviewed?: boolean;
  shortTermOffloadCandidate?: boolean;
}

export interface AgentMemoryLiveSmokeEvidenceSummary {
  status: "passed" | "missing" | "failed";
  provider?: string;
  reportPath?: string;
  targetMemoryId?: string;
  l1RowCount: number;
  rowsAfterDeleteCount?: number;
  recallHadCode: boolean;
  inspectToolUsed: boolean;
  deleteToolUsed: boolean;
  inspectTableHadTarget: boolean;
  deletedTargetMissingAfterDelete: boolean;
  memoryOffControlObserved: boolean;
  memoryOffControlPassed: boolean;
  memoryOffHadCode: boolean;
  memoryOffMemoryToolUsed: boolean;
  memoryOffRuntimeSnapshotPresent: boolean;
  contextInjectionCount: number;
  issues: string[];
}

export async function buildAgentMemoryRolloutReviewReportFromFile(input: {
  liveSmokeReportPath: string;
  checkedAt?: string;
  memoryOnOffComparisonPassed?: boolean;
  privacyLanguageReviewed?: boolean;
  shortTermOffloadCandidate?: boolean;
}): Promise<AgentMemoryRolloutReviewReport> {
  const liveSmokeReport = JSON.parse(await readFile(input.liveSmokeReportPath, "utf8")) as unknown;
  return buildAgentMemoryRolloutReviewReport({
    ...input,
    liveSmokeReport,
  });
}

export function buildAgentMemoryRolloutReviewReport(
  input: AgentMemoryRolloutReviewReportInput,
): AgentMemoryRolloutReviewReport {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const liveSmoke = summarizeLiveSmoke(input.liveSmokeReport, input.liveSmokeReportPath);
  const privacyLanguageReviewed = input.privacyLanguageReviewed ?? agentMemoryPrivacyLanguageReviewed();
  const lanes = rolloutLanesFromEvidence({
    liveSmoke,
    memoryOnOffComparisonPassed: input.memoryOnOffComparisonPassed,
    privacyLanguageReviewed,
  });
  const review = reviewAgentMemoryRolloutEvidence({
    checkedAt,
    lanes,
    shortTermOffloadCandidate: input.shortTermOffloadCandidate ?? true,
  });
  return {
    schemaVersion: AGENT_MEMORY_ROLLOUT_REVIEW_REPORT_SCHEMA_VERSION,
    createdAt: checkedAt,
    review,
    liveSmoke,
    evidenceRefs: [
      input.liveSmokeReportPath,
      "src/main/tencentMemoryLiveSmoke.live.test.ts",
      "src/main/memory/tencentdb/runtime.test.ts",
      "src/main/memory/tencentdb/piExtension.test.ts",
      privacyLanguageReviewed ? "src/shared/agentMemoryPrivacy.ts" : undefined,
      privacyLanguageReviewed ? "src/renderer/src/RightPanelSettingsCore.tsx" : undefined,
    ].filter((ref): ref is string => Boolean(ref)),
  };
}

export async function writeAgentMemoryRolloutReviewReport(input: {
  report: AgentMemoryRolloutReviewReport;
  jsonPath: string;
  markdownPath?: string;
}): Promise<void> {
  await mkdir(dirname(input.jsonPath), { recursive: true });
  await writeFile(input.jsonPath, `${JSON.stringify(input.report, null, 2)}\n`, "utf8");
  if (input.markdownPath) {
    await mkdir(dirname(input.markdownPath), { recursive: true });
    await writeFile(input.markdownPath, renderAgentMemoryRolloutReviewMarkdown(input.report), "utf8");
  }
}

export function renderAgentMemoryRolloutReviewMarkdown(report: AgentMemoryRolloutReviewReport): string {
  return [
    "# TencentDB Agent Memory Rollout Review",
    "",
    `Created: ${report.createdAt}`,
    `Decision: ${report.review.decisionLabel}`,
    `Summary: ${report.review.summary}`,
    "",
    "## Live Smoke",
    "",
    `Status: ${report.liveSmoke.status}`,
    `Provider: ${report.liveSmoke.provider ?? "unknown"}`,
    `Report: ${report.liveSmoke.reportPath ?? "not recorded"}`,
    `L1 rows before delete: ${report.liveSmoke.l1RowCount}`,
    `Rows after delete: ${report.liveSmoke.rowsAfterDeleteCount ?? "unknown"}`,
    `Inspect tool used: ${report.liveSmoke.inspectToolUsed ? "yes" : "no"}`,
    `Delete tool used: ${report.liveSmoke.deleteToolUsed ? "yes" : "no"}`,
    `Memory-off control passed: ${report.liveSmoke.memoryOffControlPassed ? "yes" : "no"}`,
    "",
    "## Lanes",
    "",
    ...report.review.lanes.map((lane) => [
      `### ${lane.id}`,
      "",
      `Status: ${lane.status}`,
      "",
      lane.summary,
      ...(lane.evidenceRefs?.length ? ["", `Evidence: ${lane.evidenceRefs.join(", ")}`] : []),
      "",
    ].join("\n")),
    "## Blockers",
    "",
    ...(report.review.blockers.length ? report.review.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "## Next Actions",
    "",
    ...report.review.nextActions.map((action) => `- ${action}`),
    "",
  ].join("\n");
}

function rolloutLanesFromEvidence(input: {
  liveSmoke: AgentMemoryLiveSmokeEvidenceSummary;
  memoryOnOffComparisonPassed?: boolean;
  privacyLanguageReviewed?: boolean;
}): AgentMemoryRolloutEvidenceLane[] {
  const liveReportAvailable = input.liveSmoke.status !== "missing";
  const missingOrFailed: AgentMemoryRolloutEvidenceLane["status"] = liveReportAvailable ? "failed" : "missing";
  const recallCapturePassed = input.liveSmoke.l1RowCount > 0 && input.liveSmoke.recallHadCode;
  const contextAccountingPassed = input.liveSmoke.contextInjectionCount > 0;
  const nativePreflightPassed = input.liveSmoke.l1RowCount > 0 && input.liveSmoke.inspectToolUsed && input.liveSmoke.deleteToolUsed;
  const memoryOnOffComparisonPassed = input.memoryOnOffComparisonPassed ?? (recallCapturePassed && input.liveSmoke.memoryOffControlPassed);
  const memoryOnOffComparisonStatus: AgentMemoryRolloutEvidenceLane["status"] = memoryOnOffComparisonPassed
    ? "passed"
    : input.liveSmoke.memoryOffControlObserved
      ? "failed"
      : "missing";
  const privacyLanguageReviewed = input.privacyLanguageReviewed === true;
  const deletionPrivacyPassed = privacyLanguageReviewed && input.liveSmoke.deletedTargetMissingAfterDelete;
  const deletionPrivacyEvidenceRefs = [
    ...(input.liveSmoke.reportPath ? [input.liveSmoke.reportPath] : []),
    ...(privacyLanguageReviewed ? ["src/shared/agentMemoryPrivacy.ts", "src/renderer/src/RightPanelSettingsCore.tsx"] : []),
  ];
  return [
    {
      id: "flag_off_isolation",
      status: "passed",
      summary: "Deterministic feature-flag and runtime tests keep Tencent memory inactive unless feature, global setting, thread toggle, and storage health all pass.",
      evidenceRefs: ["src/main/memory/tencentdb/runtime.test.ts", "src/shared/agentMemorySettings.test.ts"],
    },
    {
      id: "memory_on_recall_capture",
      status: recallCapturePassed ? "passed" : missingOrFailed,
      summary: recallCapturePassed
        ? "Live GMI Cloud smoke captured an L1 memory, recalled it from a fresh thread, and preserved the target code in the recall answer."
        : `Live recall/capture evidence is ${input.liveSmoke.status}: ${input.liveSmoke.issues.join("; ") || "no live smoke report"}.`,
      evidenceRefs: input.liveSmoke.reportPath ? [input.liveSmoke.reportPath] : undefined,
    },
    {
      id: "memory_on_off_comparison",
      status: memoryOnOffComparisonStatus,
      summary: memoryOnOffComparisonPassed
        ? "Live memory-off control stayed isolated while memory-on recall succeeded: no memory runtime snapshot, no memory tools, and no recalled code in the disabled thread."
        : input.liveSmoke.memoryOffControlObserved
          ? "Live memory-off control did not stay isolated; inspect the live smoke report before broader rollout."
          : "No bounded memory-on/off dogfood comparison report has been recorded yet.",
      evidenceRefs: input.liveSmoke.reportPath ? [input.liveSmoke.reportPath] : undefined,
    },
    {
      id: "context_accounting",
      status: contextAccountingPassed ? "passed" : missingOrFailed,
      summary: contextAccountingPassed
        ? `Live smoke recorded ${input.liveSmoke.contextInjectionCount} memory context injection snapshot(s).`
        : "No live context accounting snapshot has been recorded.",
      evidenceRefs: input.liveSmoke.reportPath ? [input.liveSmoke.reportPath] : undefined,
    },
    {
      id: "deletion_privacy_language",
      status: deletionPrivacyPassed ? "passed" : "blocked",
      summary: deletionPrivacyPassed
        ? "Live chat inspect/delete works through Tencent's durable store, and reviewed Settings language covers workspace-local storage, raw-content omission, clear-memory behavior, and transcript/file boundaries."
        : input.liveSmoke.deletedTargetMissingAfterDelete
          ? "Live chat inspect/delete works through Tencent's durable store, but final privacy and data-location language still needs review before graduation."
          : "Live chat delete evidence is missing or failed; privacy and data-location language also needs review.",
      evidenceRefs: deletionPrivacyEvidenceRefs.length ? deletionPrivacyEvidenceRefs : undefined,
    },
    {
      id: "native_preflight",
      status: nativePreflightPassed ? "passed" : missingOrFailed,
      summary: nativePreflightPassed
        ? "The reviewed vendored Tencent core and native SQLite/vector dependencies ran through capture, recall, inspect, and delete."
        : "No successful live run has proven the reviewed core and native dependencies in this worktree.",
      evidenceRefs: input.liveSmoke.reportPath ? [input.liveSmoke.reportPath] : undefined,
    },
    {
      id: "short_term_offload",
      status: "missing",
      summary: "Short-term offload has deterministic adapter coverage but no graduation dogfood evidence and remains hidden/off.",
      evidenceRefs: ["src/main/memory/tencentdb/offload.test.ts"],
    },
  ];
}

function summarizeLiveSmoke(input: unknown, reportPath?: string): AgentMemoryLiveSmokeEvidenceSummary {
  const report = objectValue(input);
  if (!report) {
    return {
      status: "missing",
      reportPath,
      l1RowCount: 0,
      recallHadCode: false,
      inspectToolUsed: false,
      deleteToolUsed: false,
      inspectTableHadTarget: false,
      deletedTargetMissingAfterDelete: false,
      memoryOffControlObserved: false,
      memoryOffControlPassed: false,
      memoryOffHadCode: false,
      memoryOffMemoryToolUsed: false,
      memoryOffRuntimeSnapshotPresent: false,
      contextInjectionCount: 0,
      issues: ["Live smoke report was not provided."],
    };
  }
  const code = stringValue(report.code);
  const targetMemoryId = stringValue(report.targetMemoryId);
  const l1Rows = arrayValue(report.l1Rows);
  const rowsAfterDeleteRecorded = Array.isArray(report.rowsAfterDelete);
  const rowsAfterDelete = arrayValue(report.rowsAfterDelete);
  const inspectToolNames = arrayValue(report.inspectToolNames).flatMap((value) => stringValue(value) ? [stringValue(value)!] : []);
  const deleteToolNames = arrayValue(report.deleteToolNames).flatMap((value) => stringValue(value) ? [stringValue(value)!] : []);
  const memoryOffToolNames = arrayValue(report.memoryOffToolNames).flatMap((value) => stringValue(value) ? [stringValue(value)!] : []);
  const inspectToolText = stringValue(report.inspectToolText) ?? "";
  const recallText = stringValue(report.recallText) ?? "";
  const memoryOffText = stringValue(report.memoryOffText) ?? "";
  const runtimeSnapshots = arrayValue(report.runtimeSnapshots);
  const issues: string[] = [];
  const recallHadCode = Boolean(code && recallText.includes(code));
  const inspectToolUsed = inspectToolNames.includes("ambient_memory_inspect");
  const deleteToolUsed = deleteToolNames.includes("ambient_memory_delete");
  const inspectTableHadTarget = Boolean(targetMemoryId && inspectToolText.includes("| ID | Layer | Kind | Updated | Preview |") && inspectToolText.includes(targetMemoryId));
  const deletedTargetMissingAfterDelete = Boolean(
    targetMemoryId &&
    rowsAfterDeleteRecorded &&
    !rowsAfterDelete.some((row) => objectValue(row)?.id === targetMemoryId),
  );
  const memoryOffControlObserved = Boolean(memoryOffText || memoryOffToolNames.length || typeof report.memoryOffRuntimeSnapshotPresent === "boolean");
  const memoryOffHadCode = Boolean(code && memoryOffText.includes(code));
  const memoryOffMemoryToolUsed = memoryOffToolNames.some((toolName) => toolName.includes("memory"));
  const memoryOffRuntimeSnapshotPresent = report.memoryOffRuntimeSnapshotPresent === true;
  const memoryOffControlPassed = Boolean(
    memoryOffControlObserved &&
    memoryOffText.includes("MEMORY_OFF_NO_MEMORY") &&
    !memoryOffHadCode &&
    !memoryOffMemoryToolUsed &&
    !memoryOffRuntimeSnapshotPresent,
  );
  const contextInjectionCount = runtimeSnapshots.filter((snapshot) => Boolean(objectValue(snapshot)?.lastContextInjection)).length;

  if (!l1Rows.length) issues.push("No L1 rows were captured before recall.");
  if (!recallHadCode) issues.push("Recall answer did not include the live code.");
  if (!inspectToolUsed) issues.push("ambient_memory_inspect was not used.");
  if (!inspectTableHadTarget) issues.push("Inspect table did not include the target memory id.");
  if (!deleteToolUsed) issues.push("ambient_memory_delete was not used.");
  if (!rowsAfterDeleteRecorded) issues.push("No post-delete memory inspection was recorded.");
  if (!deletedTargetMissingAfterDelete) issues.push("Target memory id was still present after delete verification.");
  if (!memoryOffControlObserved) issues.push("No memory-off control was recorded.");
  if (memoryOffControlObserved && !memoryOffControlPassed) issues.push("Memory-off control did not stay isolated.");
  if (!contextInjectionCount) issues.push("No memory context injection snapshot was recorded.");

  return {
    status: issues.length ? "failed" : "passed",
    provider: stringValue(report.provider),
    reportPath,
    targetMemoryId,
    l1RowCount: l1Rows.length,
    ...(rowsAfterDeleteRecorded ? { rowsAfterDeleteCount: rowsAfterDelete.length } : {}),
    recallHadCode,
    inspectToolUsed,
    deleteToolUsed,
    inspectTableHadTarget,
    deletedTargetMissingAfterDelete,
    memoryOffControlObserved,
    memoryOffControlPassed,
    memoryOffHadCode,
    memoryOffMemoryToolUsed,
    memoryOffRuntimeSnapshotPresent,
    contextInjectionCount,
    issues,
  };
}

function objectValue(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : undefined;
}

function arrayValue(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function stringValue(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input : undefined;
}
