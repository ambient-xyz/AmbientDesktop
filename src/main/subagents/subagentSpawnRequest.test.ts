import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL, resolveAmbientModelRuntimeProfile } from "../../shared/ambientModels";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import type {
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { ThreadWorktreeSummary } from "../../shared/threadTypes";
import { resolveSubagentModelScope } from "../model-provider/modelScopeResolver";
import type { SubagentChildRuntimeLaunchPreflightResult } from "../pi/piChildSessionAdapter";
import {
  buildSubagentSpawnRequestedRunEventInput,
  buildSubagentTaskMailboxEventInput,
  SUBAGENT_SPAWN_REQUEST_SCHEMA_VERSION,
  SUBAGENT_TASK_MAILBOX_TYPE,
} from "./subagentSpawnRequest";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { resolveSubagentTurnBudgetPolicy, SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION } from "../../shared/subagentTurnBudget";

describe("subagentSpawnRequest", () => {
  it("builds schema-versioned spawn-request run events with bounded launch evidence", () => {
    const defaultProfile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const event = buildSubagentSpawnRequestedRunEventInput(contractInput(longTask()));

    expect(event).toMatchObject({
      type: "subagent.spawn_requested",
      preview: {
        schemaVersion: SUBAGENT_SPAWN_REQUEST_SCHEMA_VERSION,
        phase: "phase-2-pi-tool-surface",
        idempotencyKey: "spawn:explorer",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        parentMessageId: "assistant-message",
        childRunId: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        taskPreview: expect.stringContaining("Inspect a very long branch"),
        roleId: "explorer",
        modelId: AMBIENT_DEFAULT_MODEL,
        modelScope: {
          profile: {
            profileId: `ambient:${AMBIENT_DEFAULT_MODEL}`,
            contextWindowTokens: defaultProfile.contextWindowTokens,
            maxOutputTokens: defaultProfile.maxOutputTokens,
            costClass: "included",
            trustClass: "ambient-managed",
            privacyLabel: "Ambient managed cloud model",
            memoryClass: "remote",
          },
        },
        dependencyMode: "required",
        forkMode: "full_history",
        promptMode: "append",
        retentionPolicy: "transient",
        schedulingPolicy: "live_parent_only",
        turnBudgetPolicy: {
          schemaVersion: SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION,
          maxTurns: 8,
          wrapUpAtTurn: 7,
          graceTurns: 1,
          terminalStatusOnExhaustion: "aborted_partial",
          partialAllowed: true,
        },
        capacityLease: {
          schemaVersion: "ambient-subagent-capacity-lease-v1",
          status: "reserved",
        },
        toolScopeSnapshot: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          piVisibleCategories: ["workspace.read"],
        },
        waitBarrier: {
          id: "barrier-1",
          status: "waiting_on_children",
        },
        childWorktree: {
          threadId: "child-thread",
          status: "active",
        },
        orchestrationStarted: false,
      },
    });
    expect((event.preview.taskPreview as string).length).toBeLessThanOrEqual(240);
    expect((event.preview.runtimeLaunchPreflight as any).details.launchReadiness.descriptor.args).toBeUndefined();
    expect((event.preview.runtimeLaunchPreflight as any).details.launchReadiness.descriptor.argCount).toBe(2);
  });

  it("builds schema-versioned task mailbox payloads with stable parent and child handles", () => {
    const defaultProfile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const task = "Inspect persistence code and report risks.";
    const mailbox = buildSubagentTaskMailboxEventInput(contractInput(task));

    expect(mailbox).toMatchObject({
      direction: "parent_to_child",
      type: SUBAGENT_TASK_MAILBOX_TYPE,
      payload: {
        schemaVersion: SUBAGENT_SPAWN_REQUEST_SCHEMA_VERSION,
        phase: "phase-2-pi-tool-surface",
        idempotencyKey: "spawn:explorer",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        parentMessageId: "assistant-message",
        childRunId: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        task,
        roleId: "explorer",
        modelScope: {
          schemaVersion: "ambient-subagent-model-scope-v1",
          selectedModelId: AMBIENT_DEFAULT_MODEL,
          profile: {
            profileId: `ambient:${AMBIENT_DEFAULT_MODEL}`,
            contextWindowTokens: defaultProfile.contextWindowTokens,
            maxOutputTokens: defaultProfile.maxOutputTokens,
            costClass: "included",
            trustClass: "ambient-managed",
          },
        },
        runtimeLaunchPreflight: {
          schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
          runtime: "pi-child",
          allowed: true,
        },
        capacityLease: {
          canonicalTaskPath: "root/0:explorer",
          roleId: "explorer",
        },
        toolScope: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          piVisibleCategories: ["workspace.read"],
        },
        toolScopeSnapshot: {
          runId: "child-run",
          sequence: 1,
        },
        childWorktree: {
          worktreePath: "/tmp/ambient-child",
        },
        waitBarrier: {
          childRunIds: ["child-run"],
          dependencyMode: "required_all",
        },
        turnBudgetPolicy: {
          schemaVersion: SUBAGENT_TURN_BUDGET_POLICY_SCHEMA_VERSION,
          roleId: "explorer",
          wrapUpMode: "single_steer_then_grace",
          exhaustionReason: "max_turns_exceeded",
          transcriptRetained: true,
        },
      },
    });
  });
});

function contractInput(task: string) {
  const role = getDefaultSubagentRoleProfile("explorer");
  const modelScope = resolveSubagentModelScope({ role, parentModelId: AMBIENT_DEFAULT_MODEL });
  const capacityLeaseSnapshot = resolveSubagentCapacityLease({
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    canonicalTaskPath: "root/0:explorer",
    roleId: "explorer",
    model: resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
    now: "2026-06-06T00:00:00.000Z",
  });
  return {
    phase: "phase-2-pi-tool-surface",
    parentThread: { id: "parent-thread" },
    parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
    run: {
      id: "child-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:explorer",
      capacityLeaseSnapshot,
    },
    task,
    idempotencyKey: "spawn:explorer",
    roleId: "explorer",
    modelId: AMBIENT_DEFAULT_MODEL,
    modelScope,
    runtimeLaunchPreflight: runtimePreflight(),
    dependencyMode: "required" as const,
    forkMode: "full_history" as const,
    promptMode: "append" as const,
    retentionPolicy: "transient",
    schedulingPolicy: "live_parent_only",
    turnBudgetPolicy: resolveSubagentTurnBudgetPolicy(role),
    toolScope: toolScopeSnapshot().scope,
    toolScopeSnapshot: toolScopeSnapshot(),
    childWorktree: childWorktree(),
    waitBarrier: waitBarrier(),
  };
}

function longTask(): string {
  return "Inspect a very long branch and summarize the riskiest persistence behavior. ".repeat(12);
}

function runtimePreflight(): SubagentChildRuntimeLaunchPreflightResult {
  return {
    schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
    runtime: "pi-child",
    allowed: true,
    blockers: [],
    warnings: ["compact only"],
    details: {
      launchReadiness: {
        schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
        ready: true,
        blockers: [],
        warnings: [],
        descriptor: {
          runtimeId: "pi-child",
          providerId: "ambient",
          modelId: AMBIENT_DEFAULT_MODEL,
          profileId: `ambient:${AMBIENT_DEFAULT_MODEL}`,
          command: "node child-runtime.js",
          args: ["--json", "--stream"],
          cwd: "/tmp/ambient",
          stateRootPath: "/tmp/ambient/state",
          healthUrl: "http://127.0.0.1:3123/health",
          startupTimeoutMs: 5000,
          idleTimeoutMs: 30000,
        },
      },
    },
  };
}

function childWorktree(): ThreadWorktreeSummary {
  return {
    threadId: "child-thread",
    projectRoot: "/Users/travis/AmbientDesktop",
    worktreePath: "/tmp/ambient-child",
    branchName: "codex/child",
    baseRef: "main",
    upstream: "origin/main",
    status: "active",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  };
}

function waitBarrier(): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    timeoutMs: 60_000,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
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
      deniedCategories: [],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      approvalMode: "interactive",
      worktreeIsolated: true,
      fanoutAvailable: false,
    },
  };
}
