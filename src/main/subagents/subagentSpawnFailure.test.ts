import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL, resolveAmbientModelRuntimeProfile } from "../../shared/ambientModels";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentToolScopeSnapshotSummary } from "../../shared/subagentTypes";
import type { ThreadWorktreeSummary } from "../../shared/threadTypes";
import { resolveSubagentModelScope } from "./subagentModelProviderFacade";
import type { SubagentChildRuntimeLaunchPreflightResult } from "./subagentPiRuntimeFacade";
import {
  buildScheduledSubagentSpawnFailureParentMailboxInput,
  buildScheduledSubagentSpawnFailureReason,
  buildSubagentChildLaunchBlockedMessage,
  buildSubagentChildReservationMessage,
  buildSubagentPostReservationSpawnFailureParentMailboxInput,
  buildSubagentPreRunSpawnFailureParentMailboxInput,
  buildSubagentSpawnBlockedResultArtifact,
  buildSubagentSpawnBlockedText,
  buildSubagentSpawnText,
  compactSubagentModelScopeForPi,
  compactSubagentParentMailboxForPi,
  compactSubagentRuntimeLaunchPreflightForPi,
  compactSubagentThreadWorktreeForPi,
  scheduledSubagentSpawnRequestFields,
  SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION,
} from "./subagentSpawnFailure";

describe("subagentSpawnFailure", () => {
  it("builds scheduled spawn failure mailbox payloads before live child creation", () => {
    const scheduledSpawnFields = scheduledSubagentSpawnRequestFields({
      task: "Report stale TODOs.",
      scheduledAt: "2026-06-06T09:00:00-07:00",
      recurrence: "daily",
    });

    expect(scheduledSpawnFields).toEqual(["scheduledAt", "recurrence"]);
    expect(buildScheduledSubagentSpawnFailureReason(scheduledSpawnFields)).toContain("cannot inherit live parent context");

    expect(buildScheduledSubagentSpawnFailureParentMailboxInput({
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
      phase: "phase-2-pi-tool-surface",
      toolCallId: "spawn-scheduled",
      task: "Report stale TODOs.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      role: getDefaultSubagentRoleProfile("explorer"),
      scheduledSpawnFields,
      idempotencyKey: "spawn:scheduled",
    })).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.spawn_failed",
      deliveryState: "queued",
      idempotencyKey: "spawn:scheduled",
      payload: {
        schemaVersion: SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION,
        phase: "phase-2-pi-tool-surface",
        failureStage: "scheduling_policy",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        parentMessageId: "assistant-message",
        toolCallId: "spawn-scheduled",
        idempotencyKey: "spawn:scheduled",
        requestedRoleId: "explorer",
        roleId: "explorer",
        schedulingPolicy: "live_parent_only",
        scheduledSpawnFields: ["scheduledAt", "recurrence"],
        reason: expect.stringContaining("cannot inherit live parent context"),
        automationGuidance: expect.stringContaining("automation layer"),
      },
    });
  });

  it("compacts model, runtime, and capacity evidence for pre-run spawn failures", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const modelScope = resolveSubagentModelScope({ role, requestedModelId: "custom/unregistered-model" });
    const capacityLease = resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:explorer",
      roleId: "explorer",
      model: resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
      now: "2026-06-06T00:00:00.000Z",
    });
    const runtimeLaunchPreflight = runtimePreflight();

    const input = buildSubagentPreRunSpawnFailureParentMailboxInput({
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run" },
      phase: "phase-2-pi-tool-surface",
      toolCallId: "spawn-local-runtime-denied",
      task: "Launch local worker.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      modelScope,
      failureStage: "runtime_launch_preflight",
      runtimeLaunchPreflight,
      capacityLease,
      unavailableExtensionTools: [{ id: "missing_search", categoryId: "workspace.read" }],
      reason: "Sub-agent runtime launch preflight failed: local runtime is unavailable.",
    });

    expect(input.idempotencyKey).toContain("subagent:spawn-failed:");
    expect(input.payload).toMatchObject({
      schemaVersion: SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION,
      failureStage: "runtime_launch_preflight",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      toolCallId: "spawn-local-runtime-denied",
      modelScope: {
        schemaVersion: "ambient-subagent-model-scope-v1",
        selectedModelId: "custom/unregistered-model",
        profile: {
          profileId: "unknown:custom/unregistered-model",
          providerId: "unknown",
          modelId: "custom/unregistered-model",
          supportsVision: false,
          supportsAudio: false,
          costClass: "metered",
          trustClass: "user-configured",
          privacyLabel: "Unknown provider",
          providerQuirks: ["Preserved from stored settings or transcript; not eligible for new runs until registered."],
        },
        blockingReasons: expect.arrayContaining([
          "Model is not registered in this Ambient Desktop build.",
        ]),
      },
      runtimeLaunchPreflight: {
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
        runtime: "local-text",
        allowed: false,
        capacity: {
          localMemory: {
            outcome: "refuse",
          },
        },
        details: {
          launchReadiness: {
            schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
            ready: false,
            descriptor: {
              runtimeId: "local-text",
              argCount: 2,
            },
          },
        },
      },
      capacityLease: {
        schemaVersion: "ambient-subagent-capacity-lease-v1",
        status: "reserved",
      },
      unavailableExtensionTools: [{ id: "missing_search", categoryId: "workspace.read" }],
      reason: expect.stringContaining("runtime launch preflight failed"),
    });
    expect((input.payload.runtimeLaunchPreflight as any).blockers[0].length).toBeLessThanOrEqual(500);
    expect(compactSubagentRuntimeLaunchPreflightForPi(runtimeLaunchPreflight)).toMatchObject((input.payload as any).runtimeLaunchPreflight);
    expect(compactSubagentModelScopeForPi(modelScope)).toMatchObject((input.payload as any).modelScope);
  });

  it("builds post-reservation failed-child evidence without deleting the visible child thread", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const modelScope = resolveSubagentModelScope({ role, parentModelId: AMBIENT_DEFAULT_MODEL });
    const capacityLease = resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:explorer",
      roleId: "explorer",
      model: resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
      providerConcurrencyLimit: 0,
      now: "2026-06-06T00:00:00.000Z",
    });
    const worktree = childWorktree();
    const input = buildSubagentPostReservationSpawnFailureParentMailboxInput({
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
      phase: "phase-2-pi-tool-surface",
      run: {
        id: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        status: "failed",
      },
      toolCallId: "spawn-tool-scope",
      task: "Use a connector without a child bridge.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      modelScope,
      idempotencyKey: "spawn:tool-scope",
      failureStage: "tool_scope",
      reason: "Pi-visible connector source requires a child-safe bridge.",
      capacityLease,
      toolScopeSnapshot: toolScopeSnapshot(),
      childWorktree: worktree,
      approvalUnavailable: true,
    });

    expect(input).toMatchObject({
      parentMessageId: "assistant-message",
      idempotencyKey: "spawn:tool-scope",
      payload: {
        schemaVersion: SUBAGENT_SPAWN_FAILURE_SCHEMA_VERSION,
        failureStage: "tool_scope",
        childRunId: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        approvalMode: "non_interactive",
        approvalUnavailable: true,
        childWorktree: {
          threadId: "child-thread",
          status: "active",
          worktreePath: "/tmp/ambient-child",
        },
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: "child-run",
          status: "failed",
          partial: false,
          childThreadId: "child-thread",
          summary: expect.stringContaining("Sub-agent launch failed before model execution"),
        },
      },
    });
    expect(compactSubagentThreadWorktreeForPi(worktree)).toEqual((input.payload as any).childWorktree);
    expect(buildSubagentSpawnBlockedResultArtifact({ id: "child-run", childThreadId: "child-thread" }, "blocked")).toMatchObject({
      runId: "child-run",
      status: "failed",
      partial: false,
    });
  });

  it("builds parent and child visible spawn text from the same contract", () => {
    const run = {
      id: "child-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:explorer",
      status: "reserved" as const,
    };

    expect(buildSubagentChildReservationMessage({
      run,
      role: getDefaultSubagentRoleProfile("explorer"),
      task: "Inspect the code.",
      dependencyMode: "required",
    })).toContain("Phase 2 note: this child thread is durable and inspectable");
    expect(buildSubagentChildLaunchBlockedMessage({
      run,
      role: getDefaultSubagentRoleProfile("explorer"),
      task: "Inspect the code.",
      dependencyMode: "required",
      reason: "capacity unavailable",
    })).toContain("No child model session was started.");
    expect(buildSubagentSpawnText(run, true)).toContain("Use wait_agent when the parent needs the result");
    expect(buildSubagentSpawnBlockedText({ ...run, status: "failed" }, "capacity unavailable")).toContain("visible for inspection");
    expect(buildSubagentSpawnBlockedText(
      { ...run, canonicalTaskPath: "root/0:drafter", status: "failed" },
      "Sub-agent role/tool scope is not launchable: workspace.write (Denied by the selected sub-agent role.)",
    )).toContain("retry spawn_agent without workspace.write/toolScope");
    expect(buildSubagentSpawnBlockedText(
      { ...run, canonicalTaskPath: "root/0:worker", status: "failed" },
      "workspace.write (Mutating child requires an approved isolated worktree.)",
    )).toContain("worker children mutate files and require an approved isolated worktree");
  });

  it("compacts parent mailbox event child ids from grouped payloads", () => {
    expect(compactSubagentParentMailboxForPi({
      id: "mailbox-1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.grouped_completion",
      payload: {
        notificationCount: 2,
        childRunIds: ["run-a"],
        childRuns: [{ runId: "run-b" }],
      },
      deliveryState: "queued",
      idempotencyKey: "grouped",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
    })).toMatchObject({
      notificationCount: 2,
      childRunIds: ["run-a", "run-b"],
      idempotencyKey: "grouped",
    });
  });
});

function runtimePreflight(): SubagentChildRuntimeLaunchPreflightResult {
  return {
    schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
    runtime: "local-text",
    allowed: false,
    blockers: ["local runtime is unavailable ".repeat(40)],
    warnings: ["will retry after configuration"],
    capacity: {
      localMemory: {
        outcome: "refuse",
        allowed: false,
        reason: "Projected local-model resident memory exceeds the configured ceiling.",
        requestedEstimatedResidentMemoryBytes: 8,
        activeEstimatedResidentMemoryBytes: 8,
        projectedEstimatedResidentMemoryBytes: 16,
        maxResidentMemoryBytes: 12,
        exceededByBytes: 4,
        unloadCandidateIds: [],
      },
    },
    details: {
      launchReadiness: {
        schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
        ready: false,
        blockers: ["runtime descriptor missing"],
        warnings: [],
        descriptor: {
          runtimeId: "local-text",
          providerId: "local",
          modelId: "local/text-4b",
          profileId: "local:local/text-4b",
          command: "node ./local-runtime.js ".repeat(80),
          args: ["--serve", "--json"],
          cwd: "/tmp/ambient",
          stateRootPath: "/tmp/ambient/state",
          healthUrl: "http://127.0.0.1:3921/health",
          startupTimeoutMs: 5000,
          idleTimeoutMs: 30000,
          estimatedResidentMemoryBytes: 8,
        },
      },
    },
  };
}

function childWorktree(): ThreadWorktreeSummary {
  return {
    threadId: "child-thread",
    projectRoot: "/Users/travis/ambientCoder",
    worktreePath: "/tmp/ambient-child",
    branchName: "codex/child",
    baseRef: "main",
    upstream: "origin/main",
    status: "active",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    lastCheckpointId: "checkpoint-1",
  };
}

function toolScopeSnapshot(): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-run",
    sequence: 1,
    createdAt: "2026-06-06T00:00:00.000Z",
    resolverInputs: {
      schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
    },
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: ["workspace.read"],
      piVisibleCategories: ["workspace.read"],
      deniedCategories: [
        { id: "connector.read", reason: "Capability requires interactive approval, but this launch is non-interactive." },
      ],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [
        {
          source: "connector_app",
          id: "gmail.search",
          categoryId: "connector.read",
          reason: "Capability requires interactive approval, but this launch is non-interactive.",
        },
      ],
      approvalMode: "non_interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
    },
  };
}
