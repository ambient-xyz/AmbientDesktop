import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { PermissionAuditEntry } from "../../shared/permissionTypes";
import { getDefaultSubagentRoleProfile, type SubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import type {
  SubagentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
} from "../../shared/subagentTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import {
  AgentRuntimeSubagentChildTurnCoordinator,
  type AgentRuntimeSubagentChildTurnCoordinatorOptions,
} from "./agentRuntimeSubagentChildTurnCoordinator";

type ChildTurnStore = AgentRuntimeSubagentChildTurnCoordinatorOptions["store"];
type ChildRuntimeEvent = Parameters<Parameters<AgentRuntimeSubagentChildTurnCoordinator["completeTurnAfterSend"]>[0]["emitEvent"]>[0];

describe("AgentRuntimeSubagentChildTurnCoordinator", () => {
  it("records tool runtime events and requests a post-tool follow-up when no assistant result follows", () => {
    const emitted: ChildRuntimeEvent[] = [];
    const emitEvent = (event: ChildRuntimeEvent): SubagentRunEventSummary => {
      emitted.push(event);
      return runEvent({
        runId: "child-run",
        type: `runtime.${event.type}`,
        preview: event,
      });
    };
    const appendedRunEvents: Array<Parameters<ChildTurnStore["appendSubagentRunEvent"]>[1]> = [];
    const store = storeDouble({
      getThread: vi.fn(() => thread({
        gitWorktree: {
          threadId: "child-thread",
          projectRoot: "/tmp/workspace",
          worktreePath: "/tmp/workspace",
          branchName: "child-work",
          createdAt: "2026-06-21T00:00:00.000Z",
          updatedAt: "2026-06-21T00:00:00.000Z",
          status: "active",
        },
      })),
      listMessages: vi.fn(() => [
        toolMessage({
          metadata: {
            status: "done",
            toolName: "file_write",
            toolCallId: "tool-call-1",
            artifactPath: "/tmp/workspace/result.txt",
            input: { path: "/tmp/workspace/result.txt" },
          },
        }),
      ]),
      listPermissionAudit: vi.fn(() => [
        permissionAudit({
          threadId: "child-thread",
          toolName: "file_write",
          grantId: "grant-1",
        }),
      ]),
      appendSubagentRunEvent: vi.fn((runId, input) => {
        appendedRunEvents.push(input);
        return runEvent({ runId, ...input });
      }),
    });
    const coordinator = new AgentRuntimeSubagentChildTurnCoordinator({
      store,
      resolveTerminalChildWaitBarriers: vi.fn(),
    });

    const completion = coordinator.completeTurnAfterSend({
      run: subagentRun(),
      role: role({ structuredOutputRequired: false }),
      childMessageCountBeforeSend: 0,
      emitEvent,
    });

    expect(completion).toMatchObject({
      status: "needs_followup",
      followupKind: "post_tool",
    });
    expect(emitted).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolName: "file_write",
        details: expect.objectContaining({
          approvalId: "grant-1",
          approvalSource: "permission_grant",
          worktreeIsolated: true,
        }),
      }),
      expect.objectContaining({
        type: "status",
        source: "child_runtime",
        status: "running",
      }),
    ]);
    expect(appendedRunEvents).toEqual([
      expect.objectContaining({
        type: "subagent.post_tool_followup_required",
      }),
    ]);
  });

  it("records completed child results and resolves terminal child wait barriers", () => {
    const completedRun = subagentRun({ status: "completed", completedAt: "2026-06-21T00:00:03.000Z" });
    const mailboxEvents: Array<Parameters<ChildTurnStore["appendSubagentMailboxEvent"]>[1]> = [];
    const runEvents: Array<Parameters<ChildTurnStore["appendSubagentRunEvent"]>[1]> = [];
    const resolveTerminalChildWaitBarriers = vi.fn();
    const store = storeDouble({
      listMessages: vi.fn(() => [
        assistantMessage({ content: "Finished child work." }),
      ]),
      markSubagentRunStatus: vi.fn(() => completedRun),
      appendSubagentMailboxEvent: vi.fn((runId, input) => {
        mailboxEvents.push(input);
        return mailboxEvent({ runId, ...input });
      }),
      appendSubagentRunEvent: vi.fn((runId, input) => {
        runEvents.push(input);
        return runEvent({ runId, ...input });
      }),
    });
    const coordinator = new AgentRuntimeSubagentChildTurnCoordinator({
      store,
      resolveTerminalChildWaitBarriers,
    });

    const completion = coordinator.completeTurnAfterSend({
      run: subagentRun(),
      role: role({ structuredOutputRequired: false }),
      childMessageCountBeforeSend: 0,
      emitEvent: vi.fn(),
    });

    expect(completion).toEqual({ status: "terminal" });
    expect(store.markSubagentRunStatus).toHaveBeenCalledWith(
      "child-run",
      "completed",
      expect.objectContaining({
        resultArtifact: expect.objectContaining({
          status: "completed",
          summary: "Finished child work.",
          childThreadId: "child-thread",
        }),
      }),
    );
    expect(mailboxEvents).toEqual([
      expect.objectContaining({
        type: "subagent.result",
        payload: expect.objectContaining({
          status: "completed",
          summary: "Finished child work.",
        }),
      }),
    ]);
    expect(runEvents).toEqual([
      expect.objectContaining({
        type: "subagent.result_ready",
      }),
    ]);
    expect(resolveTerminalChildWaitBarriers).toHaveBeenCalledWith(completedRun, "completed");
  });
});

function storeDouble(overrides: Partial<ChildTurnStore> = {}): ChildTurnStore {
  const defaults: ChildTurnStore = {
    appendSubagentMailboxEvent: vi.fn((runId, input) => mailboxEvent({ runId, ...input })),
    appendSubagentRunEvent: vi.fn((runId, input) => runEvent({ runId, ...input })),
    getSubagentRun: vi.fn(() => subagentRun()),
    getThread: vi.fn(() => thread()),
    listMessages: vi.fn(() => []),
    listPermissionAudit: vi.fn(() => []),
    markSubagentRunStatus: vi.fn((runId, status) => subagentRun({ id: runId, status })),
    upsertSubagentGroupedCompletionNotification: vi.fn(() => parentMailboxNotification()),
  };
  return { ...defaults, ...overrides };
}

function subagentRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "child-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    childThreadId: "child-thread",
    canonicalTaskPath: "Task",
    roleId: "worker",
    roleProfileSnapshot: role(),
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "running",
    featureFlagSnapshot: resolveAmbientFeatureFlags({ generatedAt: "2026-06-21T00:00:00.000Z" }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot("ambient-test-model", "2026-06-21T00:00:00.000Z"),
    capacityLeaseSnapshot: capacityLeaseSnapshot(),
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:01.000Z",
    ...overrides,
  };
}

function role(guardPolicy: Partial<SubagentRoleProfile["guardPolicy"]> = {}): SubagentRoleProfile {
  const base = getDefaultSubagentRoleProfile("worker");
  return {
    ...base,
    guardPolicy: {
      ...base.guardPolicy,
      ...guardPolicy,
    },
  };
}

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "child-thread",
    title: "Child",
    workspacePath: "/tmp/workspace",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    lastMessagePreview: "",
    model: "ambient-test-model",
    thinkingLevel: "medium",
    permissionMode: "workspace",
    collaborationMode: "agent",
    ...overrides,
  };
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return message({ role: "assistant", ...overrides });
}

function toolMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return message({ role: "tool", ...overrides });
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message",
    threadId: "child-thread",
    role: "assistant",
    content: "",
    createdAt: "2026-06-21T00:00:02.000Z",
    metadata: {},
    ...overrides,
  };
}

function mailboxEvent(
  input: { runId: string } & Parameters<ChildTurnStore["appendSubagentMailboxEvent"]>[1],
): SubagentMailboxEventSummary {
  return {
    id: "mailbox-event",
    runId: input.runId,
    direction: input.direction,
    type: input.type,
    payload: input.payload,
    deliveryState: input.deliveryState ?? "queued",
    createdAt: "2026-06-21T00:00:00.000Z",
    ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
  };
}

function runEvent(input: {
  runId: string;
  type: string;
  preview?: unknown;
  artifactPath?: string;
  createdAt?: string;
}): SubagentRunEventSummary {
  return {
    runId: input.runId,
    sequence: 1,
    type: input.type,
    createdAt: input.createdAt ?? "2026-06-21T00:00:00.000Z",
    ...(input.preview ? { preview: input.preview } : {}),
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
  };
}

function parentMailboxNotification(): ReturnType<ChildTurnStore["upsertSubagentGroupedCompletionNotification"]> {
  return {
    id: "parent-mailbox-event",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    type: "subagent.grouped_completion",
    payload: { notificationCount: 1 },
    deliveryState: "queued",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
}

function permissionAudit(overrides: Partial<PermissionAuditEntry> = {}): PermissionAuditEntry {
  return {
    id: "audit-1",
    threadId: "child-thread",
    createdAt: "2026-06-21T00:00:00.000Z",
    permissionMode: "workspace",
    toolName: "tool",
    risk: "workspace-command",
    decision: "allowed",
    reason: "approved",
    ...overrides,
  };
}

function capacityLeaseSnapshot(): SubagentCapacityLeaseSnapshot {
  const profile = createAmbientModelRuntimeSnapshot("ambient-test-model", "2026-06-21T00:00:00.000Z").profile;
  return {
    schemaVersion: "ambient-subagent-capacity-lease-v1",
    leaseId: "lease-1",
    status: "released",
    resolvedAt: "2026-06-21T00:00:00.000Z",
    releasedAt: "2026-06-21T00:00:03.000Z",
    releaseReason: "completed",
    canonicalTaskPath: "Task",
    roleId: "worker",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunId: "child-run",
    childThreadId: "child-thread",
    depth: {
      depth: 1,
      maxDepth: 3,
      allowed: true,
      reason: "within limit",
    },
    provider: {
      providerId: profile.providerId,
      modelId: profile.modelId,
      locality: profile.locality,
      profile: {
        schemaVersion: "ambient-subagent-capacity-model-profile-v1",
        profileId: profile.profileId,
        label: profile.label,
        available: profile.available,
        selectableAsSubagent: profile.selectableAsSubagent,
        supportsStreaming: profile.supportsStreaming,
        toolUse: profile.toolUse,
        structuredOutput: profile.structuredOutput,
        supportsVision: profile.supportsVision,
        supportsAudio: profile.supportsAudio,
        costClass: profile.costClass,
        trustClass: profile.trustClass,
        privacyLabel: profile.privacyLabel,
      },
      openRunCount: 0,
      projectedOpenRunCount: 1,
      allowed: true,
      reason: "within limit",
    },
    localMemory: {
      outcome: "not_applicable",
      allowed: true,
      reason: "cloud model",
    },
    blockingReasons: [],
  };
}
