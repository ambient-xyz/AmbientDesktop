import { describe, expect, it } from "vitest";
import type { DiagnosticExportResult } from "../../shared/types";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { diagnosticExportStatusMessage, diagnosticImportStatusMessage } from "./diagnosticExportUiModel";

describe("diagnostic export UI model", () => {
  it("preserves the existing saved message when no sub-agent attention is needed", () => {
    expect(diagnosticExportStatusMessage(result({ summary: undefined }))).toBe("Saved ambient-diagnostics.json (2.0 KB).");
    expect(diagnosticExportStatusMessage(result({
      summary: {
        subagents: {
          repairDiagnostics: {
            status: "healthy",
            message: "Sub-agent repair diagnostics found no child-tree issues.",
            issueCount: 0,
            shownIssueCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
            truncatedIssues: false,
            affectedRunCount: 0,
            affectedThreadCount: 0,
            affectedBarrierCount: 0,
            topActions: [],
            errorMessages: [],
          },
          observability: healthyObservability(),
          attribution: healthyAttribution(),
          replayEvidence: healthyReplayEvidence(),
        },
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB).");
  });

  it("uses imported status copy for reopened diagnostic bundles", () => {
    expect(diagnosticImportStatusMessage(result({ summary: undefined }))).toBe("Imported ambient-diagnostics.json (2.0 KB).");
    expect(diagnosticImportStatusMessage(result({
      summary: {
        subagents: {
          repairDiagnostics: {
            status: "healthy",
            message: "Sub-agent repair diagnostics found no child-tree issues.",
            issueCount: 0,
            shownIssueCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
            truncatedIssues: false,
            affectedRunCount: 0,
            affectedThreadCount: 0,
            affectedBarrierCount: 0,
            topActions: [],
            errorMessages: [],
          },
          observability: healthyObservability(),
          attribution: healthyAttribution(),
          replayEvidence: {
            ...healthyReplayEvidence(),
            status: "needs_attention",
            message: "Sub-agent replay evidence captured bounded timelines for 2 child runs.",
            runCount: 2,
            runtimeEventCount: 4,
            truncated: true,
          },
        },
      },
    }))).toBe("Imported ambient-diagnostics.json (2.0 KB). Sub-agent replay evidence captured bounded timelines for 2 child runs. (4 runtime events, bounded timeline)");
  });

  it("surfaces the resolved sub-agent feature flag source in diagnostic status copy", () => {
    expect(diagnosticExportStatusMessage(result({
      summary: {
        featureFlags: resolveAmbientFeatureFlags({
          settings: { subagents: true },
          generatedAt: "2026-06-05T00:00:00.000Z",
        }),
        subagents: healthySubagents(),
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB). ambient.subagents enabled via settings.");
  });

  it("adds bounded sub-agent repair context when the bundle needs support attention", () => {
    expect(diagnosticExportStatusMessage(result({
      summary: {
        subagents: {
          repairDiagnostics: {
            status: "needs_attention",
            message: "Sub-agent repair diagnostics found 12 issues.",
            issueCount: 12,
            shownIssueCount: 3,
            errorCount: 1,
            warningCount: 2,
            infoCount: 9,
            truncatedIssues: true,
            affectedRunCount: 4,
            affectedThreadCount: 4,
            affectedBarrierCount: 1,
            topActions: [{ action: "manual_repair_required", label: "Manual repair required", count: 9 }],
            errorMessages: [],
          },
          observability: healthyObservability(),
          attribution: healthyAttribution(),
          replayEvidence: healthyReplayEvidence(),
        },
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB). Sub-agent repair diagnostics found 12 issues. (1 error, 2 warnings, 3 shown)");
  });

  it("surfaces sub-agent diagnostic collection failures after saving the bundle", () => {
    expect(diagnosticExportStatusMessage(result({
      summary: {
        subagents: {
          repairDiagnostics: {
            status: "error",
            message: "Sub-agent diagnostics failed to collect 1 error.",
            issueCount: 0,
            shownIssueCount: 0,
            errorCount: 1,
            warningCount: 0,
            infoCount: 0,
            truncatedIssues: false,
            affectedRunCount: 0,
            affectedThreadCount: 0,
            affectedBarrierCount: 0,
            topActions: [],
            errorMessages: ["Sub-agent diagnostics failed: permission denied"],
          },
          observability: healthyObservability(),
          attribution: healthyAttribution(),
          replayEvidence: healthyReplayEvidence(),
        },
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB). Sub-agent diagnostics failed to collect 1 error.");
  });

  it("surfaces sub-agent observability support signals after saving the bundle", () => {
    expect(diagnosticExportStatusMessage(result({
      summary: {
        subagents: {
          repairDiagnostics: {
            status: "healthy",
            message: "Sub-agent repair diagnostics found no child-tree issues.",
            issueCount: 0,
            shownIssueCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
            truncatedIssues: false,
            affectedRunCount: 0,
            affectedThreadCount: 0,
            affectedBarrierCount: 0,
            topActions: [],
            errorMessages: [],
          },
          observability: {
            ...healthyObservability(),
            status: "needs_attention",
            message: "Sub-agent observability recorded 4 support signals.",
            spawnAttempts: 3,
            failedSpawns: 1,
            failureRate: 1 / 3,
            toolDenialCount: 2,
            restartReconciliations: 1,
          },
          attribution: healthyAttribution(),
          replayEvidence: healthyReplayEvidence(),
        },
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB). Sub-agent observability recorded 4 support signals. (1 failed spawn, 2 tool denials, 1 restart reconciliation)");
  });

  it("surfaces sub-agent attribution audit support signals after saving the bundle", () => {
    expect(diagnosticExportStatusMessage(result({
      summary: {
        subagents: {
          repairDiagnostics: {
            status: "healthy",
            message: "Sub-agent repair diagnostics found no child-tree issues.",
            issueCount: 0,
            shownIssueCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
            truncatedIssues: false,
            affectedRunCount: 0,
            affectedThreadCount: 0,
            affectedBarrierCount: 0,
            topActions: [],
            errorMessages: [],
          },
          observability: healthyObservability(),
          attribution: {
            ...healthyAttribution(),
            status: "needs_attention",
            message: "Sub-agent attribution audit found 3 issues.",
            issueCount: 3,
            shownIssueCount: 2,
            truncatedIssues: true,
            missingAttributionCount: 2,
            mismatchedRunIdCount: 1,
          },
          replayEvidence: healthyReplayEvidence(),
        },
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB). Sub-agent attribution audit found 3 issues. (2 missing attribution, 1 mismatched run id, 2 shown)");
  });

  it("surfaces sub-agent replay evidence collection failures after saving the bundle", () => {
    expect(diagnosticExportStatusMessage(result({
      summary: {
        subagents: {
          repairDiagnostics: {
            status: "healthy",
            message: "Sub-agent repair diagnostics found no child-tree issues.",
            issueCount: 0,
            shownIssueCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
            truncatedIssues: false,
            affectedRunCount: 0,
            affectedThreadCount: 0,
            affectedBarrierCount: 0,
            topActions: [],
            errorMessages: [],
          },
          observability: healthyObservability(),
          attribution: healthyAttribution(),
          replayEvidence: {
            ...healthyReplayEvidence(),
            status: "error",
            message: "Sub-agent replay evidence failed to collect 1 error.",
            errorMessages: ["Sub-agent replay evidence failed: permission denied"],
          },
        },
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB). Sub-agent replay evidence failed to collect 1 error.");
  });

  it("surfaces local runtime lease blockers after saving the bundle", () => {
    expect(diagnosticExportStatusMessage(result({
      summary: {
        subagents: healthySubagents(),
        localRuntimes: {
          status: "needs_attention",
          message: "Local runtime diagnostics found 1 runtime, 1 active lease, and 1 lifecycle blocker.",
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
          memoryPolicyOutcome: "within-limit",
          memoryPolicyReason: "Projected memory remains within policy.",
          errorMessages: [],
        },
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB). Local runtime diagnostics found 1 runtime, 1 active lease, and 1 lifecycle blocker. (1 active lease, 1 stop blocker, 1 restart blocker)");
  });

  it("surfaces Tencent memory diagnostics when memory needs support attention", () => {
    expect(diagnosticExportStatusMessage(result({
      summary: {
        subagents: healthySubagents(),
        agentMemory: {
          schemaVersion: "ambient-agent-memory-diagnostics-v1",
          adapter: "tencentdb",
          storageScope: "workspace",
          checkedAt: "2026-06-13T00:00:00.000Z",
          status: "needs_attention",
          message: "TencentDB Agent Memory is enabled but the reviewed core module is unavailable.",
          featureEnabled: true,
          settingsEnabled: true,
          defaultThreadEnabled: false,
          embedding: {
            enabled: false,
            status: "disabled",
            message: "TencentDB memory embeddings are disabled.",
          },
          activeThreadCount: 1,
          threadEnabledCount: 1,
          dataDir: "/tmp/ambient-memory/tencentdb",
          dataDirExists: true,
          storageSchemaStatus: "current",
          storageSchemaPath: "/tmp/ambient-memory/tencentdb/ambient-memory-schema.json",
          storageSchemaExpectedVersion: "ambient-tencent-memory-storage-v1",
          storageSchemaVersion: "ambient-tencent-memory-storage-v1",
          storageSchemaMessage: "TencentDB Agent Memory storage schema marker is current.",
          fileCount: 2,
          totalBytes: 128,
          topLevelEntryCount: 1,
          rawContentIncluded: false,
          runtimeSnapshots: [{
            threadId: "thread-1",
            active: true,
            dataDir: "/tmp/ambient-memory/tencentdb",
            sessionKey: "ambient-thread:thread-1",
            lastInitialize: {
              status: "unavailable",
              at: "2026-06-13T00:00:00.000Z",
              message: "missing reviewed package",
            },
          }],
          errors: [],
        },
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB). TencentDB Agent Memory is enabled but the reviewed core module is unavailable. (2 memory files, 1 runtime snapshot)");
  });

  it("surfaces memory starter repair states after saving the bundle", () => {
    expect(diagnosticExportStatusMessage(result({
      summary: {
        subagents: healthySubagents(),
        agentMemoryStarter: agentMemoryStarterSummary("needs_repair"),
      },
    }))).toBe("Saved ambient-diagnostics.json (2.0 KB). Agent memory starter needs repair (next: repair, open_logs, 1 blocker).");
  });
});

function result(input: Pick<DiagnosticExportResult, "summary">): DiagnosticExportResult {
  return {
    path: "/tmp/ambient-diagnostics.json",
    bytes: 2048,
    createdAt: "2026-06-05T00:00:00.000Z",
    ...(input.summary ? { summary: input.summary } : {}),
  };
}

function healthySubagents(): NonNullable<DiagnosticExportResult["summary"]>["subagents"] {
  return {
    repairDiagnostics: {
      status: "healthy",
      message: "Sub-agent repair diagnostics found no child-tree issues.",
      issueCount: 0,
      shownIssueCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      truncatedIssues: false,
      affectedRunCount: 0,
      affectedThreadCount: 0,
      affectedBarrierCount: 0,
      topActions: [],
      errorMessages: [],
    },
    observability: healthyObservability(),
    attribution: healthyAttribution(),
    replayEvidence: healthyReplayEvidence(),
  };
}

function healthyObservability(): NonNullable<DiagnosticExportResult["summary"]>["subagents"]["observability"] {
  return {
    status: "healthy",
    message: "Sub-agent observability found no recorded sub-agent activity.",
    spawnAttempts: 0,
    failedSpawns: 0,
    failureRate: null,
    waitDurationCount: 0,
    waitDurationTotalMs: 0,
    waitDurationMaxMs: 0,
    childIdleOpenRunCount: 0,
    childIdleTotalMs: 0,
    childIdleMaxMs: 0,
    cancellationCascades: 0,
    childRuntimeAborts: 0,
    toolDenialCount: 0,
    groupedCompletions: 0,
    needsAttentionRequests: 0,
    restartReconciliations: 0,
    tokenCount: 0,
    costMicros: 0,
    errorMessages: [],
  };
}

function healthyAttribution(): NonNullable<DiagnosticExportResult["summary"]>["subagents"]["attribution"] {
  return {
    status: "healthy",
    message: "Sub-agent attribution audit found no child-originating events to inspect.",
    auditedRuntimeEventCount: 0,
    auditedParentMailboxEventCount: 0,
    issueCount: 0,
    shownIssueCount: 0,
    truncatedIssues: false,
    missingAttributionCount: 0,
    mismatchedRunIdCount: 0,
    issueSamples: [],
    errorMessages: [],
  };
}

function healthyReplayEvidence(): NonNullable<DiagnosticExportResult["summary"]>["subagents"]["replayEvidence"] {
  return {
    status: "healthy",
    message: "Sub-agent replay evidence found no persisted child runs.",
    runCount: 0,
    childThreadCount: 0,
    persistedRunEventCount: 0,
    runtimeEventCount: 0,
    parentMailboxEventCount: 0,
    transcriptMessageCount: 0,
    callableWorkflowTaskCount: 0,
    truncated: false,
    errorMessages: [],
  };
}

function agentMemoryStarterSummary(
  state: NonNullable<NonNullable<DiagnosticExportResult["summary"]>["agentMemoryStarter"]>["state"],
): NonNullable<NonNullable<DiagnosticExportResult["summary"]>["agentMemoryStarter"]> {
  return {
    schemaVersion: "ambient-agent-memory-starter-status-v1",
    checkedAt: "2026-06-13T00:00:00.000Z",
    state,
    settings: {
      featureFlags: { tencentDbMemory: true },
      memory: {
        enabled: true,
        defaultThreadEnabled: false,
        adapter: "tencentdb",
        shortTermOffloadEnabled: false,
        embeddings: {
          enabled: true,
          providerMode: "ambient-managed",
          autoStartProvider: true,
          modelId: "embeddinggemma-300m",
          dimensions: 768,
          sendDimensions: false,
          maxInputChars: 512,
          timeoutMs: 10_000,
          preflightEnabled: true,
        },
        storageScope: "workspace",
      },
    },
    threadScope: {
      activeThreadId: "thread-1",
      activeThreadMemoryEnabled: true,
      defaultThreadEnabled: false,
      enabledThreadCount: 1,
      activeThreadCount: 1,
    },
    assets: {
      model: {
        state: "present",
        artifactId: "embeddinggemma-300m",
      },
      runtime: {
        state: "missing",
        artifactId: "llama.cpp-darwin-arm64",
      },
    },
    runtime: {
      state: "stopped",
    },
    embedding: {
      enabled: true,
      status: "unavailable",
      message: "Embedding runtime is not running.",
      providerMode: "ambient-managed",
      modelId: "embeddinggemma-300m",
      runtimeStatus: "stopped",
      running: false,
      autoStartProvider: true,
      preflightEnabled: true,
      sendDimensions: false,
      maxInputChars: 512,
      timeoutMs: 10_000,
      reindexStatus: "unknown",
    },
    nativePreflight: {
      schemaVersion: "ambient-agent-memory-native-preflight-v1",
      checkedAt: "2026-06-13T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      coreModuleConfigured: false,
      status: "unavailable",
      message: "Reviewed TencentDB Agent Memory core module is not configured.",
      dependencies: [],
      errors: [],
    },
    blockers: [{
      code: "runtime_missing",
      message: "Shared embedding runtime is missing.",
      retryable: true,
    }],
    nextActions: ["repair", "open_logs"],
  };
}
