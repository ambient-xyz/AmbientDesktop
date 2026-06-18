import { describe, expect, it } from "vitest";
import type { AmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { fallbackSubagentCapacityLease, resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { effectiveSubagentRoleSnapshot } from "../../shared/subagentPatternGraph";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentRepairDiagnosticsReport, SubagentRunEventSummary, SubagentRunSummary, SubagentToolScopeSnapshotSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { subagentThreadInspectorModel } from "./subagentThreadInspectorUiModel";

const gib = 1024 ** 3;

describe("subagent thread inspector UI model", () => {
  it("stays hidden for normal chat threads", () => {
    expect(subagentThreadInspectorModel(thread({ kind: "chat" }), [run()])).toBeUndefined();
  });

  it("summarizes active child run status, runtime, and tool scope facts", () => {
    expect(subagentThreadInspectorModel(thread(), [run()])).toMatchObject({
      runId: "run-1",
      title: "Summarizer sub-agent",
      status: "Running",
      statusTone: "active",
      badges: ["Required", "Local", "Text-only", "Open"],
      rows: [
        { label: "Task path", value: "root/0:summarizer" },
        { label: "Role", value: "Summarizer (snapshot)" },
        { label: "Memory", value: "Persistent memory disabled" },
        { label: "Retention", value: "Transient; cleanup after close" },
        { label: "Scheduling", value: "Live parent only" },
        { label: "Model", value: "Local Text startup runtime" },
        { label: "Runtime", value: "local / local/text-4b" },
        { label: "Tools", value: "No Pi-visible tools" },
        { label: "Capacity", value: "Reserved (provider 1, local memory unknown)" },
        { label: "Local memory", value: "Unknown allowed - No local-model resident-memory estimate is registered; the local runtime must still pass launch preflight before execution." },
        { label: "Privacy", value: "Local user-managed text runtime" },
        { label: "Parent thread", value: "parent-1" },
      ],
    });
  });

  it("labels role retention defaults in the child inspector", () => {
    expect(subagentThreadInspectorModel(thread(), [run({
      roleId: "explorer",
      roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
    })])).toMatchObject({
      rows: expect.arrayContaining([
        { label: "Retention", value: "Keep until parent pruned" },
      ]),
    });

    expect(subagentThreadInspectorModel(thread(), [run({
      roleProfileSnapshot: {
        ...getDefaultSubagentRoleProfile("summarizer"),
        retentionDefault: "pinned",
      },
    })])).toMatchObject({
      rows: expect.arrayContaining([
        { label: "Retention", value: "Pinned by role" },
      ]),
    });
  });

  it("labels role scheduling policy in the child inspector", () => {
    expect(subagentThreadInspectorModel(thread(), [run({
      roleProfileSnapshot: {
        ...getDefaultSubagentRoleProfile("summarizer"),
        schedulingPolicy: "automation_deferred",
      },
    })])).toMatchObject({
      rows: expect.arrayContaining([
        { label: "Scheduling", value: "Automation deferred; no live parent context" },
      ]),
    });
  });

  it("surfaces persisted effective role snapshots in the child inspector", () => {
    expect(subagentThreadInspectorModel(thread(), [run({
      roleId: "explorer",
      roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
      effectiveRoleSnapshot: effectiveSubagentRoleSnapshot({
        baseRole: "explorer",
        patternRole: "mapper",
        overlayLabels: ["slice assignment", "extraction schema"],
        outputContract: "schema-valid mapped evidence",
      }),
    })])).toMatchObject({
      title: "Explorer + Mapper sub-agent",
      rows: expect.arrayContaining([
        { label: "Role", value: "Explorer (snapshot)" },
        { label: "Effective role", value: "Explorer + Mapper" },
        { label: "Pattern role", value: "Mapper" },
        { label: "Role overlays", value: "slice assignment, extraction schema" },
        { label: "Output contract", value: "schema-valid mapped evidence" },
      ]),
    });
  });

  it("shows local memory capacity details in the child inspector", () => {
    const model = subagentThreadInspectorModel(thread(), [run({
      capacityLeaseSnapshot: resolveSubagentCapacityLease({
        parentThreadId: "parent-1",
        parentRunId: "parent-run-1",
        canonicalTaskPath: "root/0:summarizer",
        roleId: "summarizer",
        model: modelRuntimeSnapshot().profile,
        now: "2026-06-05T00:00:00.000Z",
        localMemory: {
          outcome: "refuse",
          allowed: false,
          reason: "Projected local-model resident memory exceeds the configured ceiling by 4.0 GiB; refusing launch.",
          requestedEstimatedResidentMemoryBytes: 8 * gib,
          activeEstimatedResidentMemoryBytes: 12 * gib,
          activeActualResidentMemoryBytes: 10 * gib,
          projectedEstimatedResidentMemoryBytes: 20 * gib,
          maxResidentMemoryBytes: 16 * gib,
          exceededByBytes: 4 * gib,
          localRuntimeReservation: {
            schemaVersion: "ambient-subagent-local-runtime-reservation-v1",
            status: "requested",
            runtimeId: "local-text-runtime",
            requestedLaunchId: "spawn:local-capacity-denied:root/0:summarizer",
            capabilityKind: "local-text",
            providerId: "local",
            modelId: "local/text-4b",
            modelProfileId: "local:local/text-4b",
            parentThreadId: "parent-1",
            ownerThreadId: "parent-1",
            canonicalTaskPath: "root/0:summarizer",
            idempotencyKey: "spawn:local-capacity-denied",
            endpoint: "http://127.0.0.1:43123/health",
            stateRootPath: "/workspace/.ambient/local-model-runtime",
            contextTokens: 16_384,
            estimatedResidentMemoryBytes: 8 * gib,
            memoryEstimateSource: "launch_descriptor",
          },
          unloadCandidateIds: ["local-text-runtime-a", "local-text-runtime-b"],
        },
      }),
    })]);

    expect(model).toMatchObject({
      rows: expect.arrayContaining([
        { label: "Capacity", value: "Blocked: Projected local-model resident memory exceeds the configured ceiling by 4.0 GiB; refusing launch." },
        { label: "Local memory", value: "Refuse blocked - Projected local-model resident memory exceeds the configured ceiling by 4.0 GiB; refusing launch." },
        { label: "Local memory request", value: "8.0 GiB" },
        { label: "Local memory active", value: "12 GiB estimated; 10 GiB actual" },
        { label: "Local memory projected", value: "20 GiB projected; ceiling 16 GiB; exceeds by 4.0 GiB" },
        { label: "Local memory cleanup", value: "2 idle candidates: local-text-runtime-a, local-text-runtime-b" },
        {
          label: "Local runtime reservation",
          value: "Requested / runtime local-text-runtime / local / local/text-4b / profile local:local/text-4b / owner parent-1",
        },
        {
          label: "Local runtime request",
          value: "root/0:summarizer / spawn:local-capacity-denied / 8.0 GiB estimate from Launch Descriptor / context 16,384",
        },
        { label: "Local runtime endpoint", value: "http://127.0.0.1:43123/health" },
        { label: "Local runtime state root", value: "/workspace/.ambient/local-model-runtime" },
      ]),
    });
  });

  it("surfaces child threads that need repair when the run record is missing", () => {
    expect(subagentThreadInspectorModel(thread(), [])).toMatchObject({
      runId: "run-1",
      status: "Missing run record",
      statusTone: "danger",
      badges: ["Repair needed"],
      rows: [
        { label: "Child thread", value: "child-1" },
        { label: "Parent thread", value: "parent-1" },
      ],
    });
  });

  it("labels supervisor-attention dependencies distinctly", () => {
    expect(subagentThreadInspectorModel(thread(), [run({ dependencyMode: "supervisor_attention" })])).toMatchObject({
      badges: ["Needs attention", "Local", "Text-only", "Open"],
    });
  });

  it("labels child supervisor requests as warning states", () => {
    expect(subagentThreadInspectorModel(thread(), [run({ status: "needs_attention" })])).toMatchObject({
      status: "Needs attention",
      statusTone: "warning",
    });
  });

  it("shows recent run events newest first with compact previews", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [
      event(1, "subagent.reserved", { childThreadId: "child-1" }),
      event(2, "subagent.status_changed", { status: "starting" }),
      event(3, "subagent.runtime_event", { message: "Child prompt prepared and stored." }),
    ])).toMatchObject({
      recentEvents: [
        { key: "run-1:3", label: "Runtime Event", value: "Child prompt prepared and stored." },
        { key: "run-1:2", label: "Status Changed", value: "starting" },
        { key: "run-1:1", label: "Reserved", value: "{\"childThreadId\":\"child-1\"}" },
      ],
    });
  });

  it("shows child tool result approval provenance in recent events", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [
      event(1, "subagent.runtime_event", {
        schemaVersion: "ambient-subagent-runtime-event-v1",
        type: "tool_result",
        source: "child_runtime",
        runId: "run-1",
        parentRunId: "parent-run-1",
        childThreadId: "child-1",
        createdAt: "2026-06-05T00:00:01.000Z",
        toolName: "write",
        details: {
          status: "done",
          category: "workspace.write",
          path: "README.md",
          approvalSource: "permission_grant",
          approvalId: "grant-worker",
          worktreeIsolated: true,
        },
      }),
    ])).toMatchObject({
      recentEvents: [
        {
          key: "run-1:1",
          label: "Runtime Event",
          value: "write completed | Category: Workspace Write | Path: README.md | Approval: Permission Grant (grant-worker) | Worktree: isolated",
        },
      ],
    });
  });

  it("shows local runtime startup failure diagnostics in recent events", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [
      event(1, "subagent.local_text_runtime_failed", localRuntimeStartupFailure()),
      event(2, "subagent.runtime_event", {
        schemaVersion: "ambient-subagent-runtime-event-v1",
        type: "error",
        source: "child_runtime",
        runId: "run-1",
        parentRunId: "parent-run-1",
        childThreadId: "child-1",
        createdAt: "2026-06-05T00:00:02.000Z",
        details: {
          reason: "runtime_startup_failed",
          runtime: "local_text",
          runtimeStartupFailure: localRuntimeStartupFailure({ runtimeId: "wrapped-runtime" }),
        },
      }),
    ])).toMatchObject({
      recentEvents: [
        {
          key: "run-1:2",
          label: "Runtime Event",
          value: "Startup failed | Reason: Startup Timeout | Runtime: wrapped-runtime | Model: local/text-4b | Timeout: 1.5s | Health: http://127.0.0.1:43123/health: status 503: connection refused | Logs: /tmp/out.log, /tmp/err.log",
        },
        {
          key: "run-1:1",
          label: "Local Text Runtime Failed",
          value: "Startup failed | Reason: Startup Timeout | Runtime: local-text-runtime | Model: local/text-4b | Timeout: 1.5s | Health: http://127.0.0.1:43123/health: status 503: connection refused | Logs: /tmp/out.log, /tmp/err.log",
        },
      ],
    });
  });

  it("shows local text output validation evidence in recent events", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [
      event(1, "subagent.local_text_completed", {
        completion: {
          completionUrl: "http://127.0.0.1:43123/completion",
          statusCode: 200,
          latencyMs: 145,
          outputCharCount: 12345,
        },
        outputValidation: {
          schemaVersion: "ambient-local-text-output-validation-v1",
          valid: true,
          contentType: "text/plain",
          outputCharCount: 12345,
          previewCharCount: 1200,
          textPreview: "Local summary ready.",
          requiresFullOutputArtifact: true,
          maxInlineChars: 1200,
        },
        localTextResult: {
          schemaVersion: "ambient-local-text-result-v1",
          runId: "run-1",
          status: "completed",
          partial: false,
          outputCharCount: 12345,
          textPreview: "Local summary ready.",
          fullOutputPath: "/tmp/run-1/local-output.txt",
        },
      }),
    ])).toMatchObject({
      recentEvents: [
        {
          key: "run-1:1",
          label: "Local Text Completed",
          value: "Text output valid | 12,345 chars | 1,200/1,200 inline chars | full artifact required | Full output: /tmp/run-1/local-output.txt | Preview: Local summary ready.",
        },
      ],
    });
  });

  it("shows local text runtime preflight evidence in recent events", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [
      event(1, "subagent.local_text_preflight", {
        allowed: true,
        blockers: [],
        warnings: [],
        resourcePolicy: {
          outcome: "unload-idle",
          reason: "Projected local-model resident memory exceeds the configured ceiling by 2.0 GiB; unload idle local models before launch.",
          requestedEstimatedResidentMemoryBytes: 6 * gib,
          activeEstimatedResidentMemoryBytes: 12 * gib,
          projectedEstimatedResidentMemoryBytes: 18 * gib,
          maxResidentMemoryBytes: 16 * gib,
          exceededByBytes: 2 * gib,
          unloadCandidateIds: ["idle-local-text"],
        },
        resourcePolicyEnforcement: {
          allowed: true,
          outcome: "unloaded-idle",
          reason: "Unloaded 1 idle local model server before launch.",
          unload: {
            attemptedIds: ["idle-local-text"],
            stoppedIds: ["idle-local-text"],
            failed: [],
          },
        },
        launchReadiness: {
          schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
          ready: true,
          blockers: [],
          warnings: [],
          descriptor: {
            runtimeId: "local-text-runtime",
            providerId: "local",
            modelId: "local/text-4b",
            command: "/runtime/local-text",
            args: ["serve"],
            cwd: "/workspace",
            stateRootPath: "/workspace/.ambient/local-model-runtime",
            healthUrl: "http://127.0.0.1:43123/health",
            estimatedResidentMemoryBytes: 6 * gib,
          },
        },
        invocationLimits: {
          schemaVersion: "ambient-local-text-delegation-invocation-limits-v1",
          tokenEstimateMethod: "chars_div_4",
          contextWindowTokens: 8192,
          maxOutputTokens: 2048,
          promptTokenEstimate: 1048,
          outputReserveTokens: 2048,
          projectedContextTokens: 3096,
          contextFits: true,
          structuredOutputRequired: true,
          requireModelNativeStructuredOutput: false,
          structuredOutputSupport: "none",
          structuredOutputMode: "ambient_synthesized",
        },
      }),
    ])).toMatchObject({
      recentEvents: [
        {
          key: "run-1:1",
          label: "Local Text Preflight",
          value: "Local text preflight allowed | Memory: Unload idle 18 GiB/16 GiB +2.0 GiB | Enforcement: stopped 1/1 idle | Runtime: local-text-runtime | Context: 3,096/8,192 fits output 2,048",
        },
      ],
    });
  });

  it("shows local runtime lease state rows from completed local text events", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [
      event(1, "subagent.local_text_completed", {
        runtimeAcquisition: {
          schemaVersion: "ambient-local-model-runtime-acquisition-v1",
          source: "persisted",
          leaseId: "lease-1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          acquiredAt: "2026-06-05T00:00:01.000Z",
          activeLeases: 1,
        },
        runtimeState: {
          schemaVersion: "ambient-local-model-runtime-state-v1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          status: "running",
          stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
          stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
          stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
          startedAt: "2026-06-05T00:00:00.000Z",
          lastUsedAt: "2026-06-05T00:00:01.000Z",
          idleTimeoutMs: 300000,
          healthUrl: "http://127.0.0.1:43123/health",
          estimatedResidentMemoryBytes: 6 * gib,
          actualResidentMemoryBytes: 4 * gib,
          memorySampledAt: "2026-06-05T00:00:01.000Z",
        },
        runtimeRelease: {
          schemaVersion: "ambient-local-model-runtime-release-v1",
          status: "released",
          leaseId: "lease-1",
          pid: 5001,
          remainingLeases: 0,
          releasedAt: "2026-06-05T00:00:00.000Z",
          idleCleanupDueAt: "2026-06-05T00:05:00.000Z",
        },
      }),
    ])).toMatchObject({
      rows: expect.arrayContaining([
        { label: "Local runtime", value: "local-text-runtime / pid 5001 / Running / idle cleanup 300s" },
        {
          label: "Local runtime acquisition",
          value: "Persisted / lease lease-1 / pid 5001 / 1 active / acquired 2026-06-05T00:00:01.000Z",
        },
        { label: "Local runtime memory", value: "4.0 GiB actual; 6.0 GiB estimated; sampled 2026-06-05T00:00:01.000Z" },
        {
          label: "Local runtime release",
          value: "Released / lease lease-1 / pid 5001 / 0 remaining / released 2026-06-05T00:00:00.000Z / cleanup due 2026-06-05T00:05:00.000Z",
        },
        { label: "Local runtime health", value: "http://127.0.0.1:43123/health" },
        {
          label: "Local runtime logs",
          value: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log, /workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
        },
      ]),
    });
  });

  it("shows local runtime release evidence from failed local text events", () => {
    expect(subagentThreadInspectorModel(thread({ childStatus: "failed" }), [run({ status: "failed" })], [
      event(1, "subagent.local_text_release_after_failure", {
        schemaVersion: "ambient-local-text-delegation-failure-v1",
        runtimeAcquisition: {
          schemaVersion: "ambient-local-model-runtime-acquisition-v1",
          source: "started",
          leaseId: "lease-1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          acquiredAt: "2026-06-05T00:00:01.000Z",
          activeLeases: 1,
        },
        runtimeState: {
          schemaVersion: "ambient-local-model-runtime-state-v1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          status: "running",
          stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
          stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
          stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
          startedAt: "2026-06-05T00:00:00.000Z",
          lastUsedAt: "2026-06-05T00:00:01.000Z",
          idleTimeoutMs: 300000,
          estimatedResidentMemoryBytes: 6 * gib,
          actualResidentMemoryBytes: 4 * gib,
          memorySampledAt: "2026-06-05T00:00:01.000Z",
        },
        runtimeRelease: {
          schemaVersion: "ambient-local-model-runtime-release-v1",
          status: "released",
          leaseId: "lease-1",
          pid: 5001,
          remainingLeases: 0,
        },
        outputValidation: {
          schemaVersion: "ambient-local-text-output-validation-v1",
          valid: false,
          contentType: "text/plain",
          outputCharCount: 0,
          previewCharCount: 0,
          textPreview: "",
          requiresFullOutputArtifact: false,
          maxInlineChars: 8000,
          reason: "Local text delegation output is empty.",
        },
      }),
    ])).toMatchObject({
      rows: expect.arrayContaining([
        { label: "Local runtime", value: "local-text-runtime / pid 5001 / Running / idle cleanup 300s" },
        {
          label: "Local runtime acquisition",
          value: "Started / lease lease-1 / pid 5001 / 1 active / acquired 2026-06-05T00:00:01.000Z",
        },
        { label: "Local runtime release", value: "Released / lease lease-1 / pid 5001 / 0 remaining" },
      ]),
      recentEvents: [
        {
          key: "run-1:1",
          label: "Local Text Release After Failure",
          value: "Text output invalid | 0 chars | 0/8,000 inline chars | inline preview | Reason: Local text delegation output is empty.",
        },
      ],
    });
  });

  it("shows local runtime release evidence from cancelled local text events", () => {
    expect(subagentThreadInspectorModel(thread({ childStatus: "cancelled" }), [run({ status: "cancelled" })], [
      event(1, "subagent.local_text_release_after_cancel", {
        schemaVersion: "ambient-local-text-terminal-release-v1",
        terminalStatus: "cancelled",
        summary: "Local text runtime lease released after the child was cancelled.",
        runtimeAcquisition: {
          schemaVersion: "ambient-local-model-runtime-acquisition-v1",
          source: "started",
          leaseId: "lease-1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          acquiredAt: "2026-06-05T00:00:01.000Z",
          activeLeases: 1,
        },
        runtimeState: {
          schemaVersion: "ambient-local-model-runtime-state-v1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          status: "running",
          stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
          stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
          stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
          startedAt: "2026-06-05T00:00:00.000Z",
          lastUsedAt: "2026-06-05T00:00:01.000Z",
          idleTimeoutMs: 300000,
          estimatedResidentMemoryBytes: 6 * gib,
        },
        runtimeRelease: {
          schemaVersion: "ambient-local-model-runtime-release-v1",
          status: "released",
          leaseId: "lease-1",
          pid: 5001,
          remainingLeases: 0,
          releasedAt: "2026-06-05T00:00:02.000Z",
          idleCleanupDueAt: "2026-06-05T00:05:02.000Z",
        },
      }),
    ])).toMatchObject({
      rows: expect.arrayContaining([
        { label: "Local runtime", value: "local-text-runtime / pid 5001 / Running / idle cleanup 300s" },
        {
          label: "Local runtime acquisition",
          value: "Started / lease lease-1 / pid 5001 / 1 active / acquired 2026-06-05T00:00:01.000Z",
        },
        {
          label: "Local runtime release",
          value: "Released / lease lease-1 / pid 5001 / 0 remaining / released 2026-06-05T00:00:02.000Z / cleanup due 2026-06-05T00:05:02.000Z",
        },
      ]),
      recentEvents: [
        {
          key: "run-1:1",
          label: "Local Text Release After Cancel",
          value: "Local text runtime lease released after the child was cancelled.",
        },
      ],
    });
  });

  it("shows terminal local runtime release evidence from strict budget failures", () => {
    expect(subagentThreadInspectorModel(thread({ childStatus: "failed" }), [run({ status: "failed" })], [
      event(1, "subagent.local_text_release_after_failure", {
        schemaVersion: "ambient-local-text-terminal-release-v1",
        terminalStatus: "failed",
        summary: "Local text runtime lease released after the child reached failed.",
        runtimeAcquisition: {
          schemaVersion: "ambient-local-model-runtime-acquisition-v1",
          source: "started",
          leaseId: "lease-1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          acquiredAt: "2026-06-05T00:00:01.000Z",
          activeLeases: 1,
        },
        runtimeState: {
          schemaVersion: "ambient-local-model-runtime-state-v1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          status: "running",
          stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
          stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
          stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
          startedAt: "2026-06-05T00:00:00.000Z",
          lastUsedAt: "2026-06-05T00:00:01.000Z",
          idleTimeoutMs: 300000,
          estimatedResidentMemoryBytes: 6 * gib,
        },
        runtimeRelease: {
          schemaVersion: "ambient-local-model-runtime-release-v1",
          status: "released",
          leaseId: "lease-1",
          pid: 5001,
          remainingLeases: 0,
          releasedAt: "2026-06-05T00:00:02.000Z",
        },
      }),
    ])).toMatchObject({
      rows: expect.arrayContaining([
        { label: "Local runtime", value: "local-text-runtime / pid 5001 / Running / idle cleanup 300s" },
        {
          label: "Local runtime acquisition",
          value: "Started / lease lease-1 / pid 5001 / 1 active / acquired 2026-06-05T00:00:01.000Z",
        },
        {
          label: "Local runtime release",
          value: "Released / lease lease-1 / pid 5001 / 0 remaining / released 2026-06-05T00:00:02.000Z",
        },
      ]),
      recentEvents: [
        {
          key: "run-1:1",
          label: "Local Text Release After Failure",
          value: "Local text runtime lease released after the child reached failed.",
        },
      ],
    });
  });

  it("shows local runtime release failures in inspector rows", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [
      event(1, "subagent.local_text_completed", {
        runtimeState: {
          schemaVersion: "ambient-local-model-runtime-state-v1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          status: "running",
          stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
          stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
          stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
          startedAt: "2026-06-05T00:00:00.000Z",
          lastUsedAt: "2026-06-05T00:00:01.000Z",
          idleTimeoutMs: 300000,
        },
        runtimeRelease: {
          schemaVersion: "ambient-local-model-runtime-release-v1",
          status: "failed",
          leaseId: "lease-1",
          pid: 5001,
          error: "release store unavailable",
        },
      }),
    ])).toMatchObject({
      rows: expect.arrayContaining([
        {
          label: "Local runtime release",
          value: "Failed / lease lease-1 / pid 5001 / Error: release store unavailable",
        },
      ]),
    });
  });

  it("shows still-leased local runtime release evidence in inspector rows", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [
      event(1, "subagent.local_text_completed", {
        runtimeState: {
          schemaVersion: "ambient-local-model-runtime-state-v1",
          runtimeId: "local-text-runtime",
          providerId: "local",
          modelId: "local/text-4b",
          pid: 5001,
          status: "running",
          stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
          stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
          stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
          startedAt: "2026-06-05T00:00:00.000Z",
          lastUsedAt: "2026-06-05T00:00:01.000Z",
          idleTimeoutMs: 300000,
        },
        runtimeRelease: {
          schemaVersion: "ambient-local-model-runtime-release-v1",
          status: "still-leased",
          leaseId: "lease-1",
          pid: 5001,
          remainingLeases: 1,
          releasedAt: "2026-06-05T00:00:00.000Z",
        },
      }),
    ])).toMatchObject({
      rows: expect.arrayContaining([
        {
          label: "Local runtime release",
          value: "Still leased / lease lease-1 / pid 5001 / 1 remaining / released 2026-06-05T00:00:00.000Z",
        },
      ]),
    });
  });

  it("shows the latest resolved tool scope snapshot", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [
      toolScopeSnapshot(1, {
        loadedCategories: ["artifact.read"],
        piVisibleCategories: ["artifact.read"],
        deniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        fanoutAvailable: false,
      }),
      toolScopeSnapshot(2, {
        loadedCategories: ["workspace.read", "test.run"],
        piVisibleCategories: ["workspace.read"],
        deniedCategories: [{ id: "workspace.write", reason: "Mutating child requires an approved isolated worktree." }],
        loadedTools: [{
          source: "built_in",
          id: "workspace.read",
          categoryId: "workspace.read",
          piVisible: true,
          mutatesState: false,
          requiresApproval: false,
        }, {
          source: "extension_tool",
          id: "vitest.run",
          categoryId: "test.run",
          piVisible: false,
          mutatesState: false,
          requiresApproval: false,
        }],
        piVisibleTools: [{
          source: "built_in",
          id: "workspace.read",
          categoryId: "workspace.read",
          piVisible: true,
          mutatesState: false,
          requiresApproval: false,
        }],
        deniedTools: [{
          source: "built_in",
          id: "workspace.write",
          categoryId: "workspace.write",
          reason: "Mutating child requires an approved isolated worktree.",
        }],
        approvalMode: "non_interactive",
        worktreeIsolated: false,
        fanoutAvailable: false,
      }),
    ])).toMatchObject({
      toolScopeRows: [
        { label: "Pi-visible", value: "Workspace Read" },
        { label: "Loaded", value: "Workspace Read, Test Run" },
        { label: "Denied", value: "Workspace Write (workspace.write)" },
        { label: "Source tools", value: "Built In workspace.read / Workspace Read (visible); Extension Tool vitest.run / Test Run (loaded)" },
        { label: "Denied tools", value: "Built In workspace.write / Workspace Write (workspace.write)" },
        {
          label: "Deny reasons",
          value: "Workspace Write (workspace.write): Mutating child requires an approved isolated worktree.; Built In workspace.write: Mutating child requires an approved isolated worktree.",
        },
        { label: "Approval", value: "Non-interactive" },
        { label: "Worktree", value: "Parent workspace" },
        { label: "Fanout", value: "Unavailable" },
      ],
    });
  });

  it("shows callable workflow denial identifiers and reasons in the child inspector", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [
      toolScopeSnapshot(1, {
        loadedCategories: ["artifact.read"],
        piVisibleCategories: ["artifact.read"],
        deniedCategories: [{
          id: "workflow.call",
          reason: "Nested workflow fanout is disabled for this role or workspace.",
        }],
        deniedTools: [{
          source: "callable_workflow",
          id: "ambient_workflow_symphony_map_reduce",
          categoryId: "workflow.call",
          reason: "Callable workflow tools are not Pi-callable in child sessions until Ambient provides an explicit child-safe workflow bridge; keep the exact workflow non-visible or run it from the parent.",
        }],
        approvalMode: "interactive",
        worktreeIsolated: false,
        fanoutAvailable: false,
      }),
    ])).toMatchObject({
      toolScopeRows: expect.arrayContaining([
        { label: "Denied", value: "Workflow Call (workflow.call)" },
        {
          label: "Denied tools",
          value: "Callable Workflow ambient_workflow_symphony_map_reduce / Workflow Call (workflow.call)",
        },
        {
          label: "Deny reasons",
          value: expect.stringContaining("Callable Workflow ambient_workflow_symphony_map_reduce: Callable workflow tools are not Pi-callable in child sessions"),
        },
      ]),
    });
  });

  it("shows child authority profile task intent and resource scopes", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [
      toolScopeSnapshot(1, {
        loadedCategories: ["workspace.read", "artifact.read", "long-context.read"],
        piVisibleCategories: ["workspace.read", "artifact.read", "long-context.read"],
        deniedCategories: [{
          id: "browser.read",
          reason: "Denied by child task intent file_read; allowed categories: workspace.read, artifact.read, long-context.read.",
        }],
        approvalMode: "interactive",
        worktreeIsolated: false,
        fanoutAvailable: false,
      }, {
        childAuthorityProfile: {
          schemaVersion: "ambient-subagent-child-authority-profile-v1",
          taskIntent: "file_read",
          rationale: "Read selected Downloads files only.",
          resourceScopes: {
            filesystem: {
              readRoots: ["/Users/travis/Downloads/a.pdf"],
              writeRoots: [],
              deniedWriteRoots: ["/Users/travis/Downloads"],
              readDecision: "allow",
              writeDecision: "deny",
            },
            browser: { domains: [], networkDecision: "deny" },
            connectors: { methods: [], decision: "deny" },
            nestedFanout: { decision: "deny", remainingFanout: 0 },
          },
          approvalRouting: {
            route: "parent",
            mode: "interactive",
            childThreadId: "child-1",
          },
        },
      }),
    ])).toMatchObject({
      toolScopeRows: expect.arrayContaining([
        {
          label: "Task intent",
          value: "file_read / Read selected Downloads files only.",
        },
        {
          label: "Filesystem scope",
          value: "read: /Users/travis/Downloads/a.pdf / write: deny / denied write: /Users/travis/Downloads",
        },
        {
          label: "External scope",
          value: "network: deny / connectors: deny",
        },
        {
          label: "Approval route",
          value: "parent / interactive / child-1",
        },
      ]),
    });
  });

  it("shows child authority rows from compact display metadata when resolver inputs are absent", () => {
    const snapshot = toolScopeSnapshot(1, {
      loadedCategories: ["workspace.read", "long-context.read"],
      piVisibleCategories: ["workspace.read", "long-context.read"],
      deniedCategories: [],
      approvalMode: "interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
    }, undefined);
    (snapshot.scope as unknown as Record<string, unknown>).displayMetadata = {
      schemaVersion: "ambient-subagent-tool-scope-display-metadata-v1",
      childAuthorityProfile: {
        schemaVersion: "ambient-subagent-child-authority-display-metadata-v1",
        status: "present",
        taskIntent: "file_read",
        rationale: "Read selected Downloads files only.",
        filesystem: {
          readRoots: ["/Users/travis/Downloads/a.pdf"],
          writeRoots: [],
          deniedWriteRoots: ["/Users/travis/Downloads"],
          readRootCount: 1,
          writeRootCount: 0,
          deniedWriteRootCount: 1,
          readDecision: "allow",
          writeDecision: "deny",
        },
        browser: {
          domains: [],
          domainCount: 0,
          networkDecision: "deny",
        },
        connectors: {
          methods: [],
          methodCount: 0,
          decision: "deny",
        },
        nestedFanout: {
          decision: "deny",
          remainingFanout: 0,
        },
        approvalRouting: {
          route: "parent",
          mode: "interactive",
          childThreadId: "child-1",
        },
      },
    };

    expect(subagentThreadInspectorModel(thread(), [run()], [], [snapshot])).toMatchObject({
      toolScopeRows: expect.arrayContaining([
        {
          label: "Task intent",
          value: "file_read / Read selected Downloads files only.",
        },
        {
          label: "Filesystem scope",
          value: "read: /Users/travis/Downloads/a.pdf / write: deny / denied write: /Users/travis/Downloads",
        },
        {
          label: "External scope",
          value: "network: deny / connectors: deny",
        },
        {
          label: "Approval route",
          value: "parent / interactive / child-1",
        },
      ]),
    });
  });

  it("shows callable workflow bridge status and allowed tools in the child inspector", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [
      toolScopeSnapshot(1, {
        loadedCategories: ["workflow.call"],
        piVisibleCategories: ["workflow.call"],
        deniedCategories: [],
        loadedTools: [{
          source: "callable_workflow",
          id: "ambient_workflow_symphony_map_reduce",
          categoryId: "workflow.call",
          piVisible: true,
          mutatesState: false,
          requiresApproval: true,
        }],
        piVisibleTools: [{
          source: "callable_workflow",
          id: "ambient_workflow_symphony_map_reduce",
          categoryId: "workflow.call",
          piVisible: true,
          mutatesState: false,
          requiresApproval: true,
        }],
        approvalMode: "interactive",
        worktreeIsolated: true,
        fanoutAvailable: true,
      }, {
        schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
        workspacePolicy: {
          schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
          callableWorkflowBridge: {
            allowCallableWorkflowTools: true,
            nestedFanoutLimit: 3,
            remainingFanout: 2,
            allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
            reason: "Callable workflow child bridge allowed by role policy with 2 nested fanout slots remaining.",
          },
        },
      }),
    ])).toMatchObject({
      toolScopeRows: expect.arrayContaining([
        { label: "Pi-visible", value: "Workflow Call" },
        { label: "Source tools", value: "Callable Workflow ambient_workflow_symphony_map_reduce / Workflow Call (visible)" },
        { label: "Fanout", value: "Available" },
        {
          label: "Workflow bridge",
          value: "Enabled / 2/3 nested fanout slots remaining / 1 allowed tool / Callable workflow child bridge allowed by role policy with 2 nested fanout slots remaining.",
        },
        { label: "Workflow bridge tools", value: "ambient_workflow_symphony_map_reduce" },
      ]),
    });
  });

  it("shows disabled callable workflow bridge reasons in the child inspector", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [
      toolScopeSnapshot(1, {
        loadedCategories: ["artifact.read"],
        piVisibleCategories: ["artifact.read"],
        deniedCategories: [{
          id: "workflow.call",
          reason: "Callable workflow child bridge is disabled by child role policy.",
        }],
        deniedTools: [{
          source: "callable_workflow",
          id: "ambient_workflow_symphony_map_reduce",
          categoryId: "workflow.call",
          reason: "Callable workflow child bridge is disabled by child role policy.",
        }],
        approvalMode: "interactive",
        worktreeIsolated: false,
        fanoutAvailable: false,
      }, {
        schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
        workspacePolicy: {
          schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
          callableWorkflowBridge: {
            allowCallableWorkflowTools: false,
            nestedFanoutLimit: 0,
            remainingFanout: 0,
            allowedToolNames: [],
            reason: "Callable workflow child bridge is disabled by child role policy.",
          },
        },
      }),
    ])).toMatchObject({
      toolScopeRows: expect.arrayContaining([
        {
          label: "Workflow bridge",
          value: "Disabled / 0/0 nested fanout slots remaining / 0 allowed tools / Callable workflow child bridge is disabled by child role policy.",
        },
        {
          label: "Deny reasons",
          value: expect.stringContaining("Callable Workflow ambient_workflow_symphony_map_reduce: Callable workflow child bridge is disabled by child role policy."),
        },
      ]),
    });
  });

  it("shows prepared child worktree details from the launch snapshot", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [
      toolScopeSnapshot(1, {
        loadedCategories: ["workspace.read", "workspace.write", "artifact.write"],
        piVisibleCategories: ["workspace.read", "workspace.write", "artifact.write"],
        deniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: true,
        fanoutAvailable: false,
      }, {
        schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
        childWorktree: {
          threadId: "child-1",
          status: "active",
          worktreePath: "/repo/.ambient-codex/worktrees/child-1",
          branchName: "ambient/worker-child-1",
          baseRef: "abc1234",
        },
      }),
    ])).toMatchObject({
      toolScopeRows: [
        { label: "Pi-visible", value: "Workspace Read, Workspace Write, Artifact Write" },
        { label: "Loaded", value: "Workspace Read, Workspace Write, Artifact Write" },
        { label: "Denied", value: "None" },
        { label: "Source tools", value: "None" },
        { label: "Denied tools", value: "None" },
        { label: "Approval", value: "Interactive" },
        { label: "Worktree", value: "Isolated" },
        { label: "Worktree status", value: "Active" },
        { label: "Worktree path", value: "/repo/.ambient-codex/worktrees/child-1" },
        { label: "Worktree branch", value: "ambient/worker-child-1" },
        { label: "Worktree base", value: "abc1234" },
        { label: "Fanout", value: "Unavailable" },
      ],
    });
  });

  it("shows unavailable child worktree diagnostics from the launch snapshot", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [
      toolScopeSnapshot(1, {
        loadedCategories: ["workspace.read"],
        piVisibleCategories: ["workspace.read"],
        deniedCategories: [{ id: "workspace.write", reason: "Mutating child requires an approved isolated worktree." }],
        approvalMode: "interactive",
        worktreeIsolated: false,
        fanoutAvailable: false,
      }, {
        schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
        childWorktree: {
          threadId: "child-1",
          status: "failed",
          worktreePath: "/repo",
          error: "Repository has no commits yet. Ambient will create an isolated worktree after the first commit.",
        },
      }),
    ])).toMatchObject({
      toolScopeRows: expect.arrayContaining([
        { label: "Worktree", value: "Parent workspace" },
        { label: "Worktree status", value: "Failed" },
        { label: "Worktree path", value: "/repo" },
        {
          label: "Worktree error",
          value: "Repository has no commits yet. Ambient will create an isolated worktree after the first commit.",
        },
      ]),
    });
  });

  it("shows launch worktree isolation diagnostics from the workspace policy snapshot", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [
      toolScopeSnapshot(1, {
        loadedCategories: ["workspace.read"],
        piVisibleCategories: ["workspace.read"],
        deniedCategories: [{ id: "workspace.write", reason: "Mutating child requires an approved isolated worktree." }],
        approvalMode: "interactive",
        worktreeIsolated: false,
        fanoutAvailable: false,
      }, {
        schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
        workspacePolicy: {
          schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
          hardDeniedCategories: ["secrets.read", "subagent.spawn"],
          approvalMode: "interactive",
          worktreeIsolated: false,
          allowNestedFanout: false,
          parentPermissionMode: "workspace",
          worktreeIsolationStatus: "mismatched_child_thread",
          worktreeIsolationReason: "Active worktree belongs to thread other-child, not expected child thread child-1.",
          expectedChildThreadId: "child-1",
          worktreeThreadId: "other-child",
          worktreePath: "/repo/.ambient-codex/worktrees/other-child",
        },
        childWorktree: {
          threadId: "other-child",
          status: "active",
          worktreePath: "/repo/.ambient-codex/worktrees/other-child",
          branchName: "ambient/worker-other-child",
        },
      }),
    ])).toMatchObject({
      toolScopeRows: expect.arrayContaining([
        { label: "Worktree", value: "Parent workspace" },
        { label: "Isolation status", value: "Mismatched child thread" },
        {
          label: "Isolation reason",
          value: "Active worktree belongs to thread other-child, not expected child thread child-1.",
        },
        { label: "Expected child", value: "child-1" },
        { label: "Worktree owner", value: "other-child" },
        { label: "Worktree status", value: "Active" },
        { label: "Worktree path", value: "/repo/.ambient-codex/worktrees/other-child" },
      ]),
    });
  });

  it("shows resolved model scope candidate diagnostics in the child inspector", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [
      toolScopeSnapshot(1, {
        loadedCategories: ["artifact.read"],
        piVisibleCategories: ["artifact.read"],
        deniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        fanoutAvailable: false,
      }, {
        schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
        modelScope: {
          schemaVersion: "ambient-subagent-model-scope-v1",
          source: "role_default",
          parentModelId: "cloud/chat",
          roleDefaultModelId: "local/text-4b",
          selectedModelId: "local/text-4b",
          profile: {
            profileId: "local:local/text-4b:startup",
            providerId: "local",
            modelId: "local/text-4b",
            label: "Local Text startup runtime",
            locality: "local",
            toolUse: "none",
            structuredOutput: "none",
            supportsVision: false,
            supportsAudio: false,
            contextWindowTokens: 16384,
            maxOutputTokens: 4096,
            costClass: "local",
            trustClass: "local-user-managed",
            privacyLabel: "Local user-managed text runtime",
            memoryClass: "small-local",
            estimatedResidentMemoryBytes: 4 * 1024 * 1024 * 1024,
            available: true,
            selectableAsSubagent: true,
            supportsStreaming: true,
          },
          warnings: ["Parent model cloud/chat is not eligible for sub-agent runs: Model cloud/chat is not selectable for sub-agent delegation."],
          blockingReasons: [],
          candidateDiagnostics: [
            {
              schemaVersion: "ambient-subagent-model-scope-candidate-v1",
              source: "parent_fallback",
              modelId: "cloud/chat",
              profileId: "ambient:cloud/chat:catalog",
              providerId: "ambient",
              label: "Cloud Chat",
              selected: false,
              eligible: false,
              locality: "cloud",
              toolUse: "ambient-tools",
              structuredOutput: "json_schema",
              selectableAsSubagent: false,
              supportsStreaming: true,
              available: true,
              capabilityDiagnostics: [
                { capability: "availability", status: "pass", required: "registered", actual: "available" },
                {
                  capability: "subagent_eligibility",
                  status: "fail",
                  required: "selectableAsSubagent",
                  actual: "false",
                  reason: "Model cloud/chat is not selectable for sub-agent delegation.",
                },
                { capability: "streaming", status: "pass", required: "streaming", actual: "true" },
              ],
              blockingReasons: ["Model cloud/chat is not selectable for sub-agent delegation."],
            },
            {
              schemaVersion: "ambient-subagent-model-scope-candidate-v1",
              source: "role_default",
              modelId: "local/text-4b",
              profileId: "local:local/text-4b:startup",
              providerId: "local",
              label: "Local Text startup runtime",
              selected: true,
              eligible: true,
              locality: "local",
              toolUse: "none",
              structuredOutput: "none",
              selectableAsSubagent: true,
              supportsStreaming: true,
              available: true,
              capabilityDiagnostics: [
                { capability: "availability", status: "pass", required: "registered", actual: "available" },
                { capability: "subagent_eligibility", status: "pass", required: "selectableAsSubagent", actual: "true" },
                { capability: "streaming", status: "pass", required: "streaming", actual: "true" },
              ],
              blockingReasons: [],
            },
          ],
        },
      }),
    ])).toMatchObject({
      modelScopeRows: [
        { label: "Resolution", value: "Role default / Local Text startup runtime selected" },
        { label: "Selected model", value: "local / local/text-4b / Local / No Pi-visible tools / Structured output: none" },
        {
          label: "Model constraints",
          value: "Context 16,384 / Output 4,096 / Cost Local / Trust Local user managed / Local user-managed text runtime / Memory Small local / Resident 4.0 GiB / No vision / No audio",
        },
        {
          label: "Model warnings",
          value: "Parent model cloud/chat is not eligible for sub-agent runs: Model cloud/chat is not selectable for sub-agent delegation.",
        },
        { label: "Model blockers", value: "None" },
        {
          label: "Candidates",
          value: "Parent fallback / Cloud Chat (cloud/chat) / ambient / candidate / blocked / reason: Model cloud/chat is not selectable for sub-agent delegation.; Role default / Local Text startup runtime (local/text-4b) / local / selected / eligible",
        },
      ],
    });
  });

  it("shows the latest wait barrier that includes the child run", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [], [
      waitBarrier({ id: "barrier-old", status: "satisfied", resolvedAt: "2026-06-05T00:00:20.000Z" }),
      waitBarrier({ id: "barrier-new", status: "waiting_on_children", timeoutMs: 45_000, createdAt: "2026-06-05T00:01:00.000Z" }),
    ])).toMatchObject({
      parentThreadId: "parent-1",
      parentWorkspacePath: "/workspace",
      parentBarrier: {
        label: "Parent waiting on this child",
        detail: "Blocking: child running · Required all",
        tone: "active",
      },
      waitBarrierRows: [
        { label: "Parent barrier", value: "Waiting on this child" },
        { label: "This child", value: "Blocking: child running" },
        { label: "Parent dependency", value: "Required all" },
        { label: "Barrier group", value: "1 child" },
        { label: "Parent failure policy", value: "Ask user on failure" },
        { label: "Parent timeout", value: "45s" },
      ],
    });
  });

  it("promotes child barrier outcomes into the standalone child thread summary", () => {
    expect(subagentThreadInspectorModel(thread(), [run({ status: "needs_attention" })], [], [], [
      waitBarrier({ status: "waiting_on_children" }),
    ])).toMatchObject({
      parentBarrier: {
        label: "Parent needs child steering",
        detail: "Blocking: needs steering · Required all",
        tone: "warning",
      },
    });

    expect(subagentThreadInspectorModel(thread(), [run({ status: "failed" })], [], [], [
      waitBarrier({ status: "waiting_on_children" }),
    ])).toMatchObject({
      parentBarrier: {
        label: "Parent blocked by child failure",
        detail: "Blocking: child failed · Required all",
        tone: "danger",
      },
    });

    expect(subagentThreadInspectorModel(thread(), [run({ status: "completed" })], [], [], [
      waitBarrier({ status: "satisfied", resolvedAt: "2026-06-05T00:01:00.000Z" }),
    ])).toMatchObject({
      parentBarrier: {
        label: "Parent barrier satisfied",
        detail: "Completed · Required all · resolved 2026-06-05T00:01:00.000Z",
        tone: "success",
      },
    });
  });

  it("labels active wait-barrier child states distinctly in child thread details", () => {
    const activeStatuses: Array<[SubagentRunSummary["status"], string]> = [
      ["reserved", "Blocking: child queued"],
      ["starting", "Blocking: child starting"],
      ["running", "Blocking: child running"],
      ["waiting", "Blocking: child waiting"],
    ];

    for (const [status, label] of activeStatuses) {
      expect(subagentThreadInspectorModel(thread(), [run({ status })], [], [], [
        waitBarrier({ status: "waiting_on_children" }),
      ])).toMatchObject({
        waitBarrierRows: expect.arrayContaining([
          { label: "This child", value: label },
        ]),
      });
    }
  });

  it("shows this child's own wait-barrier state in child thread details", () => {
    expect(subagentThreadInspectorModel(thread(), [run({ status: "completed" })], [], [], [
      waitBarrier({ status: "waiting_on_children" }),
    ])).toMatchObject({
      waitBarrierRows: expect.arrayContaining([
        { label: "This child", value: "Ready: child complete" },
      ]),
    });

    expect(subagentThreadInspectorModel(thread(), [run({ status: "needs_attention" })], [], [], [
      waitBarrier({ status: "waiting_on_children" }),
    ])).toMatchObject({
      waitBarrierRows: expect.arrayContaining([
        { label: "This child", value: "Blocking: needs steering" },
      ]),
    });

    expect(subagentThreadInspectorModel(thread(), [run({ status: "timed_out" })], [], [], [
      waitBarrier({ status: "waiting_on_children" }),
    ])).toMatchObject({
      waitBarrierRows: expect.arrayContaining([
        { label: "This child", value: "Blocking: child timed out" },
      ]),
    });
  });

  it("shows quorum thresholds and synthesis counts in child thread wait details", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [], [
      waitBarrier({
        dependencyMode: "quorum",
        childRunIds: ["run-1", "run-2", "run-3"],
        quorumThreshold: 2,
        status: "satisfied",
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: ["run-1", "run-2", "run-3"],
          childStatuses: [
            { childRunId: "run-1", status: "completed" },
            { childRunId: "run-2", status: "completed" },
            { childRunId: "run-3", status: "running" },
          ],
          synthesisAllowed: true,
          waitBarrierEvaluation: {
            schemaVersion: "ambient-subagent-wait-barrier-evaluation-v1",
            waitBarrierId: "barrier-1",
            dependencyMode: "quorum",
            childRunIds: ["run-1", "run-2", "run-3"],
            childStatuses: [
              { childRunId: "run-1", status: "completed" },
              { childRunId: "run-2", status: "completed" },
              { childRunId: "run-3", status: "running" },
            ],
            quorumThreshold: 2,
            requiredSynthesisCount: 2,
            validSynthesisCount: 2,
            potentialSynthesisCount: 3,
            synthesisAllowed: true,
            partial: false,
            activeChildRunIds: ["run-3"],
            terminalUnsafeChildRunIds: [],
            reason: "quorum barrier has 2/2 synthesis-safe child results.",
            childResults: [],
          },
        },
      }),
    ])).toMatchObject({
      waitBarrierRows: [
        { label: "Parent barrier", value: "Satisfied" },
        { label: "This child", value: "Running" },
        { label: "Parent dependency", value: "Quorum" },
        { label: "Barrier group", value: "3 children" },
        { label: "Quorum", value: "2/3 children" },
        { label: "Synthesis", value: "2/2 synthesis-safe" },
        { label: "Still running", value: "1 child" },
        { label: "Parent failure policy", value: "Ask user on failure" },
        { label: "Parent timeout", value: "30s" },
      ],
    });
  });

  it("shows blocked completion guard evidence in child thread wait details", () => {
    expect(subagentThreadInspectorModel(thread(), [run({ status: "completed" })], [], [], [
      waitBarrier({
        status: "failed",
        resolvedAt: "2026-06-05T00:01:00.000Z",
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: ["run-1"],
          childStatuses: [{ childRunId: "run-1", status: "completed" }],
          synthesisAllowed: false,
          resultValidation: {
            valid: false,
            synthesisAllowed: false,
            partial: false,
            status: "completed",
            reason: "Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
            completionGuardValidation: {
              valid: false,
              synthesisAllowed: false,
              required: true,
              structuredEvidenceCount: 1,
              ambientEvidenceCount: 1,
              isolatedWorktreeEvidenceCount: 1,
              approvalEvidenceCount: 0,
              reason: "Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
            },
          },
        },
      }),
    ])).toMatchObject({
      waitBarrierRows: expect.arrayContaining([
        { label: "Completion guard", value: "Blocked: synthesis denied" },
        { label: "Mutation evidence", value: "structured 1 / Ambient 1 / isolated worktree 1 / approval 0" },
        {
          label: "Guard reason",
          value: "Implementation roles that mutate require Ambient-recorded isolated worktree and approval provenance before completed synthesis.",
        },
      ]),
    });
  });

  it("shows passed completion guard evidence in child thread wait details", () => {
    expect(subagentThreadInspectorModel(thread(), [run({ status: "completed" })], [], [], [
      waitBarrier({
        status: "satisfied",
        resolvedAt: "2026-06-05T00:01:00.000Z",
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: ["run-1"],
          childStatuses: [{ childRunId: "run-1", status: "completed" }],
          synthesisAllowed: true,
          completionGuardValidation: {
            valid: true,
            synthesisAllowed: true,
            required: true,
            structuredEvidenceCount: 1,
            ambientEvidenceCount: 1,
            isolatedWorktreeEvidenceCount: 1,
            approvalEvidenceCount: 1,
          },
        },
      }),
    ])).toMatchObject({
      waitBarrierRows: expect.arrayContaining([
        { label: "Completion guard", value: "Passed: synthesis allowed" },
        { label: "Mutation evidence", value: "structured 1 / Ambient 1 / isolated worktree 1 / approval 1" },
      ]),
    });
  });

  it("shows explicit wait-barrier decisions in child thread details", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [], [
      waitBarrier({
        status: "satisfied",
        resolvedAt: "2026-06-05T00:01:00.000Z",
        resolutionArtifact: barrierDecisionArtifact({
          decision: "retry_child",
          userDecision: "Retry after tightening the child prompt.",
          retryRequestedRunIds: ["run-1"],
          retryAcceptedRunIds: ["run-1"],
          retryMailboxEventIds: ["mailbox-retry"],
        }),
      }),
    ])).toMatchObject({
      waitBarrierRows: [
        { label: "Parent barrier", value: "Satisfied" },
        { label: "This child", value: "Running" },
        { label: "Parent dependency", value: "Required all" },
        { label: "Barrier group", value: "1 child" },
        { label: "Parent failure policy", value: "Ask user on failure" },
        { label: "Decision", value: "Retry accepted" },
        { label: "Decision detail", value: "Retry after tightening the child prompt." },
        { label: "Retry requested", value: "1 child" },
        { label: "Retry accepted", value: "1 child" },
        { label: "Retry mailbox", value: "1 queued event" },
        { label: "Parent timeout", value: "30s" },
        { label: "Resolved", value: "2026-06-05T00:01:00.000Z" },
      ],
    });
  });

  it("shows detach and parent-cancel barrier decision effects in child thread details", () => {
    expect(subagentThreadInspectorModel(thread(), [run({ status: "detached" })], [], [], [
      waitBarrier({
        status: "failed",
        resolvedAt: "2026-06-05T00:01:00.000Z",
        resolutionArtifact: barrierDecisionArtifact({
          decision: "detach_child",
          userDecision: "Keep this child inspectable as separate work.",
          detachedRunIds: ["run-1"],
        }),
      }),
    ])).toMatchObject({
      waitBarrierRows: expect.arrayContaining([
        { label: "Decision", value: "Child detached" },
        { label: "Decision detail", value: "Keep this child inspectable as separate work." },
        { label: "Detached children", value: "1 child" },
      ]),
    });

    expect(subagentThreadInspectorModel(thread(), [run({ status: "cancelled" })], [], [], [
      waitBarrier({
        status: "cancelled",
        resolvedAt: "2026-06-05T00:01:00.000Z",
        resolutionArtifact: barrierDecisionArtifact({
          decision: "cancel_parent",
          userDecision: "Cancel the parent instead of waiting.",
          cancelledRunIds: ["run-1"],
          cancelledMailboxEventIds: ["mailbox-1", "mailbox-2"],
          parentCancellationRequested: true,
        }),
      }),
    ])).toMatchObject({
      waitBarrierRows: expect.arrayContaining([
        { label: "Decision", value: "Parent cancelled" },
        { label: "Decision detail", value: "Cancel the parent instead of waiting." },
        { label: "Cancelled children", value: "1 child" },
        { label: "Parent cancellation", value: "Requested" },
        { label: "Cancelled mailbox", value: "2 pending events" },
      ]),
    });
  });

  it("shows repair diagnostics for the selected child thread", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [], [], repairDiagnostics())).toMatchObject({
      repairRows: [
        {
          title: "Missing Spawn Edge",
          categoryLabel: "Tree linkage",
          detail: "Run is missing a persisted spawn edge.",
          tone: "danger",
          actionLabel: "Manual repair required",
          meta: "run run-1 / thread child-1",
        },
      ],
    });
  });

  it("badges snapshot repair diagnostics for the selected child thread", () => {
    expect(subagentThreadInspectorModel(thread(), [run()], [], [], [], snapshotRepairDiagnostics())).toMatchObject({
      badges: ["Required", "Local", "Text-only", "Open", "Snapshot repair", "1 repair"],
      repairRows: [
        {
          title: "Prompt Snapshot Mismatch",
          categoryLabel: "Snapshot integrity",
          actionLabel: "Inspect run snapshot",
        },
      ],
    });
  });

  it("routes parent navigation through the parent thread workspace instead of the child worktree", () => {
    const childThread = thread({
      workspacePath: "/workspace/.ambient-codex/worktrees/child-1",
      gitWorktree: {
        threadId: "child-1",
        projectRoot: "/workspace",
        worktreePath: "/workspace/.ambient-codex/worktrees/child-1",
        branchName: "ambient/chat-child-1",
        status: "active",
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
      },
    });

    expect(
      subagentThreadInspectorModel(
        childThread,
        [run()],
        [],
        [],
        [],
        undefined,
        [
          thread({ id: "parent-1", kind: "chat", workspacePath: "/workspace", parentThreadId: undefined, subagentRunId: undefined }),
          childThread,
        ],
      ),
    ).toMatchObject({
      parentThreadId: "parent-1",
      parentWorkspacePath: "/workspace",
    });

    expect(subagentThreadInspectorModel(childThread, [run()])).toMatchObject({
      parentThreadId: "parent-1",
      parentWorkspacePath: "/workspace",
    });
  });
});

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "child-1",
    title: "Child",
    workspacePath: "/workspace",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    messageCount: 0,
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "local/text-4b",
    thinkingLevel: "medium",
    kind: "subagent_child",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    subagentRunId: "run-1",
    collapsedByDefault: true,
    childStatus: "running",
    ...overrides,
  } as ThreadSummary;
}

function run(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "run-1",
    protocolVersion: "ambient-subagent-protocol-v1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    childThreadId: "child-1",
    canonicalTaskPath: "root/0:summarizer",
    roleId: "summarizer",
    roleProfileSnapshot: getDefaultSubagentRoleProfile("summarizer"),
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "running",
    featureFlagSnapshot: {
      schemaVersion: "ambient-feature-flags-v1",
      generatedAt: "2026-06-05T00:00:00.000Z",
      flags: {
        "ambient.subagents": {
          id: "ambient.subagents",
          enabled: true,
          source: "settings",
          defaultEnabled: false,
          settingsEnabled: true,
        },
      },
    },
    modelRuntimeSnapshot: modelRuntimeSnapshot(),
    capacityLeaseSnapshot: fallbackSubagentCapacityLease({
      parentThreadId: "parent-1",
      parentRunId: "parent-run-1",
      canonicalTaskPath: "root/0:summarizer",
      roleId: "summarizer",
      model: modelRuntimeSnapshot().profile,
      now: "2026-06-05T00:00:00.000Z",
    }),
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  } as SubagentRunSummary;
}

function event(sequence: number, type: string, preview?: unknown): SubagentRunEventSummary {
  return {
    runId: "run-1",
    sequence,
    type,
    createdAt: `2026-06-05T00:00:0${sequence}.000Z`,
    preview,
  };
}

function toolScopeSnapshot(
  sequence: number,
  scope: Omit<SubagentToolScopeSnapshotSummary["scope"], "schemaVersion" | "loadedTools" | "piVisibleTools" | "deniedTools">
    & Partial<Pick<SubagentToolScopeSnapshotSummary["scope"], "loadedTools" | "piVisibleTools" | "deniedTools">>,
  resolverInputs: unknown = { test: "inspector" },
): SubagentToolScopeSnapshotSummary {
  return {
    runId: "run-1",
    sequence,
    createdAt: `2026-06-05T00:00:1${sequence}.000Z`,
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      ...scope,
    },
    resolverInputs,
  };
}

function waitBarrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-1",
    parentRunId: "parent-run-1",
    childRunIds: ["run-1"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    timeoutMs: 30_000,
    createdAt: "2026-06-05T00:00:10.000Z",
    updatedAt: "2026-06-05T00:00:10.000Z",
    ...overrides,
  };
}

function barrierDecisionArtifact(input: {
  decision: "continue_with_partial" | "retry_child" | "detach_child" | "cancel_parent" | "fail_parent";
  userDecision?: string;
  partialSummary?: string;
  retryRequestedRunIds?: string[];
  retryAcceptedRunIds?: string[];
  retryMailboxEventIds?: string[];
  detachedRunIds?: string[];
  cancelledRunIds?: string[];
  cancelledMailboxEventIds?: string[];
  parentCancellationRequested?: boolean;
}): NonNullable<SubagentWaitBarrierSummary["resolutionArtifact"]> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
    childRunIds: ["run-1"],
    childStatuses: [{ childRunId: "run-1", status: "failed" }],
    synthesisAllowed: input.decision === "continue_with_partial",
    explicitPartial: input.decision === "continue_with_partial",
    resultArtifact: null,
    ...(input.retryRequestedRunIds?.length ? { retryRequestedRunIds: input.retryRequestedRunIds } : {}),
    ...(input.retryAcceptedRunIds?.length ? { retryAcceptedRunIds: input.retryAcceptedRunIds } : {}),
    ...(input.retryMailboxEventIds?.length ? { retryMailboxEventIds: input.retryMailboxEventIds } : {}),
    ...(input.detachedRunIds?.length ? { detachedRunIds: input.detachedRunIds } : {}),
    ...(input.cancelledRunIds?.length ? { cancelledRunIds: input.cancelledRunIds } : {}),
    ...(input.cancelledMailboxEventIds?.length ? { cancelledMailboxEventIds: input.cancelledMailboxEventIds } : {}),
    ...(input.parentCancellationRequested ? { parentCancellationRequested: true } : {}),
    userDecision: {
      schemaVersion: "ambient-subagent-user-decision-v1",
      decision: input.decision,
      userDecision: input.userDecision ?? null,
      partialSummary: input.partialSummary ?? null,
      decidedAt: "2026-06-05T00:01:00.000Z",
      toolCallId: "tool-call-1",
      idempotencyKey: "barrier-decision:test",
    },
  };
}

function repairDiagnostics(): SubagentRepairDiagnosticsReport {
  return {
    schemaVersion: "ambient-subagent-repair-diagnostics-v1",
    createdAt: "2026-06-05T00:00:00.000Z",
    issueCount: 1,
    shownIssueCount: 1,
    truncatedIssues: false,
    affectedIdsTruncated: false,
    errorCount: 1,
    warningCount: 0,
    infoCount: 0,
    repairedRunIds: [],
    repairedBarrierIds: [],
    repairedParentControlBarrierIds: [],
    repairedSpawnEdgeRunIds: [],
    prunedDanglingSpawnEdgeRunIds: [],
    diagnosticRunIds: ["run-1"],
    affectedRunIds: ["run-1"],
    affectedThreadIds: ["child-1"],
    affectedBarrierIds: [],
    actionCounts: {
      manual_repair_required: 1,
    },
    issues: [{
      issueId: "missing_spawn_edge:run-1:child-1:parent-run-1:",
      kind: "missing_spawn_edge",
      severity: "error",
      messagePreview: "Run is missing a persisted spawn edge.",
      runId: "run-1",
      threadId: "child-1",
      parentThreadId: "parent-1",
      parentRunId: "parent-run-1",
      action: "manual_repair_required",
      actionLabel: "Manual repair required",
      destructive: false,
    }],
  };
}

function snapshotRepairDiagnostics(): SubagentRepairDiagnosticsReport {
  return {
    ...repairDiagnostics(),
    actionCounts: {
      inspect_run_snapshot: 1,
    },
    issues: [{
      issueId: "prompt_snapshot_mismatch:run-1:child-1:parent-run-1:",
      kind: "prompt_snapshot_mismatch",
      severity: "error",
      messagePreview: "Prompt snapshot is missing boundary instructions.",
      runId: "run-1",
      threadId: "child-1",
      parentThreadId: "parent-1",
      parentRunId: "parent-run-1",
      action: "inspect_run_snapshot",
      actionLabel: "Inspect run snapshot",
      destructive: false,
    }],
  };
}

function modelRuntimeSnapshot(): AmbientModelRuntimeSnapshot {
  return {
    schemaVersion: "ambient-model-runtime-snapshot-v1",
    resolvedAt: "2026-06-05T00:00:00.000Z",
    requestedModelId: "local/text-4b",
    profile: {
      schemaVersion: "ambient-model-runtime-profile-v1",
      profileId: "local:local/text-4b:startup",
      providerId: "local",
      modelId: "local/text-4b",
      label: "Local Text startup runtime",
      selectableAsMain: false,
      selectableAsSubagent: true,
      available: true,
      contextWindowTokens: 8192,
      maxOutputTokens: 2048,
      supportsStreaming: true,
      toolUse: "none",
      structuredOutput: "none",
      supportsVision: false,
      supportsAudio: false,
      locality: "local",
      costClass: "local",
      trustClass: "local-user-managed",
      privacyLabel: "Local user-managed text runtime",
      memoryClass: "small-local",
      providerQuirks: [],
    },
  };
}

function localRuntimeStartupFailure(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-local-model-runtime-startup-failure-v1",
    reason: "startup_timeout",
    message: "Local model runtime did not become healthy: connection refused",
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: "local/text-4b",
    profileId: "local:local/text-4b:startup",
    pid: 7001,
    startupTimeoutMs: 1500,
    stateDir: "/tmp/state",
    stdoutPath: "/tmp/out.log",
    stderrPath: "/tmp/err.log",
    health: {
      ok: false,
      healthUrl: "http://127.0.0.1:43123/health",
      statusCode: 503,
      error: "connection refused",
    },
    ...overrides,
  };
}
