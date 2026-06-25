import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PermissionRequest } from "../../shared/permissionTypes";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { appendMappedSubagentRuntimeEvent, resolveSubagentApprovalDecision } from "./agentRuntimeSubagentsFacade";

async function withDiagnosticTimeout<T>(promise: Promise<T>, timeoutMs: number, describeFailure: () => string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(describeFailure())), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

describe("AgentRuntime sub-agent native approval routing", () => {
  it("surfaces native child permission prompts as parent-forwarded approval requests", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-permission-wait-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with child permission wait");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Child write",
        roleId: "worker",
        roleProfileSnapshot: getDefaultSubagentRoleProfile("worker"),
        canonicalTaskPath: "root/0:worker",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      const pendingPermission: PermissionRequest = {
        id: "permission-child-write",
        threadId: running.childThreadId,
        toolName: "write",
        title: "Allow child write?",
        message: "The child wants to write a file.",
        detail: "Target path: /repo/child-output.md",
        risk: "outside-workspace",
        reusableScopes: ["thread", "project"],
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
        grantTargetLabel: "/repo/child-output.md",
        grantTargetHash: "hash-child-output",
      };
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
        listPending: () => [pendingPermission],
      });
      (runtime as any).subagentChildExecutions.set(running.id, {
        childThreadId: running.childThreadId,
        promise: new Promise<void>(() => undefined),
        startedAt: "2026-06-06T00:00:00.000Z",
      });

      const waited = await (runtime as any).controllers.subagentToolExtensions.waitForResolvedChildRun({
        run: running,
        timeoutMs: 60_000,
        emitEvent: (event: any) => {
          const persisted = appendMappedSubagentRuntimeEvent(store, {
            run: store.getSubagentRun(running.id),
            source: "wait_agent",
            event,
          });
          runtimeEvents.push(persisted.runtimeEvent);
          return persisted.runEvent;
        },
      });

      expect(waited).toMatchObject({
        timedOut: false,
        run: {
          id: running.id,
          status: "needs_attention",
        },
        approvalRequests: [
          {
            approvalId: "permission-child-write",
            title: "Allow child write?",
            prompt: expect.stringContaining("Target path: /repo/child-output.md"),
            requestedAction: "local_file_write",
            requestedToolId: "write",
            requestedToolCategory: "outside-workspace",
            requestedScope: "project",
            idempotencyKey: `subagent:native-permission-request:${running.id}:permission-child-write:write`,
          },
        ],
      });
      expect(store.getSubagentRun(running.id).status).toBe("needs_attention");
      expect(runtimeEvents).toEqual([
        expect.objectContaining({
          type: "status",
          source: "wait_agent",
          status: "needs_attention",
          message: "Child runtime is waiting for parent approval.",
          details: {
            approvalIds: ["permission-child-write"],
            pendingApprovalCount: 1,
          },
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("round-trips native child permission prompts through parent approval and child resume", async () => {
    vi.useRealTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-permission-roundtrip-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with child permission roundtrip");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const pendingPermissions: PermissionRequest[] = [];
      const permissionResponses: Array<{ id: string; response: string }> = [];
      const respond = vi.fn((id: string, response: string) => {
        permissionResponses.push({ id, response });
        const index = pendingPermissions.findIndex((request) => request.id === id);
        if (index >= 0) pendingPermissions.splice(index, 1);
      });
      let resolveChildSendStarted!: () => void;
      const childSendStarted = new Promise<void>((resolve) => {
        resolveChildSendStarted = resolve;
      });
      let resolveChildSendFinished!: () => void;
      const childSendFinished = new Promise<void>((resolve) => {
        resolveChildSendFinished = resolve;
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
        listPending: () => pendingPermissions,
        respond,
      });
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (!pendingPermissions.length) {
          pendingPermissions.push({
            id: "permission-child-write",
            threadId: input.threadId,
            toolName: "write",
            title: "Allow child write?",
            message: "The child wants to write a file.",
            detail: "Target path: /repo/child-output.md",
            risk: "outside-workspace",
            reusableScopes: ["thread", "project"],
            grantActionKind: "local_file_write",
            grantTargetKind: "path",
            grantTargetLabel: "/repo/child-output.md",
            grantTargetHash: "hash-child-output",
          });
        }
        resolveChildSendStarted();
        await childSendFinished;
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "summarizer",
          status: "complete",
          summary: "Child native approval response was consumed.",
          evidence: ["permission-child-write"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            keyPoints: ["Native permission response reached the child runtime."],
            sourceRefs: ["permission-child-write"],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Child native approval response was consumed.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).controllers.subagentToolExtensions.createToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await withDiagnosticTimeout<any>(
        subagentTool.execute("spawn-native-approval-roundtrip", {
          action: "spawn_agent",
          roleId: "summarizer",
          task: "Wait for a native child approval prompt before continuing.",
          dependencyMode: "required",
          forkMode: "no_history",
          promptMode: "fresh",
          toolScope: { requestedCategories: ["artifact.read"] },
          idempotencyKey: "spawn:native-approval-roundtrip",
        }),
        1_000,
        () =>
          `Native approval spawn did not return: ${JSON.stringify({
            parentRun,
            runs: store.listSubagentRunsForParentThread(parent.id),
            pendingPermissions,
          })}`,
      );
      expect(spawned.details).toMatchObject({
        orchestrationStarted: true,
        toolScopeSnapshot: {
          loadedCategories: ["artifact.read"],
          piVisibleCategories: ["artifact.read"],
        },
      });
      const runId = spawned.details.run.id as string;
      await Promise.race([
        childSendStarted,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Child permission roundtrip send did not start: ${JSON.stringify(spawned.details)}`)), 1_000),
        ),
      ]);

      const waited = await withDiagnosticTimeout<any>(
        subagentTool.execute("wait-native-approval-roundtrip", {
          action: "wait_agent",
          childRunId: runId,
          wait: { timeoutMs: 5000 },
          idempotencyKey: "wait:native-approval-roundtrip-request",
        }),
        1_000,
        () =>
          `Native approval wait did not return: ${JSON.stringify({
            run: store.getSubagentRun(runId),
            pendingPermissions,
            parentMailbox: store.listSubagentParentMailboxEventsForParentRun(parentRun.id),
            runEvents: store.listSubagentRunEvents(runId).map((event) => event.type),
          })}`,
      );

      expect(waited.details).toMatchObject({
        status: "needs_attention",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice:
          "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
        parentResolution: {
          status: "blocked",
          action: "ask_user",
          canSynthesize: false,
          requiresUserInput: true,
          childRunId: runId,
          childStatus: "needs_attention",
        },
        approvalRequestRecords: [
          {
            idempotencyKey: `subagent:native-permission-request:${runId}:permission-child-write:write`,
            childMailboxEvent: {
              runId,
              direction: "child_to_parent",
              type: "subagent.approval_requested",
              deliveryState: "delivered",
            },
            parentMailboxEvent: {
              parentThreadId: parent.id,
              parentRunId: parentRun.id,
              parentMessageId: assistant.id,
              type: "subagent.child_approval_requested",
              deliveryState: "queued",
              childRunIds: [runId],
            },
          },
        ],
      });
      expect(store.getSubagentRun(runId).status).toBe("needs_attention");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.child_approval_requested",
            deliveryState: "queued",
            payload: expect.objectContaining({
              childRunId: runId,
              childThreadId: store.getSubagentRun(runId).childThreadId,
              approvalId: "permission-child-write",
              requestedToolId: "write",
              requestedScope: "project",
              parentBlockingState: expect.objectContaining({
                action: "forward_child_approval_then_wait",
                childRunId: runId,
                resumeParentBlocking: true,
                resumeAction: "wait_agent",
              }),
            }),
          }),
        ]),
      );

      const decision = resolveSubagentApprovalDecision(
        store,
        {
          childRunId: runId,
          approvalId: "permission-child-write",
          decision: "approved",
          requestedScope: "this_child_thread",
          userDecision: "Approve this child write for the rest of this child thread.",
        },
        { now: "2026-06-06T00:01:00.000Z" },
      );

      expect(decision).toMatchObject({
        approvalId: "permission-child-write",
        decision: "approved",
        requestedScope: "this_child_thread",
        effectiveScope: "this_child_thread",
        parentRemainsBlocked: true,
        approvalRequestParentMailboxEvent: {
          deliveryState: "consumed",
        },
        approvalResponseChildMailboxEvent: {
          type: "subagent.approval_response",
          deliveryState: "queued",
        },
      });
      resolveChildSendFinished();

      const resumed = await withDiagnosticTimeout<any>(
        subagentTool.execute("wait-native-approval-response-roundtrip", {
          action: "wait_agent",
          childRunId: runId,
          wait: { timeoutMs: 5000 },
          idempotencyKey: "wait:native-approval-roundtrip-response",
        }),
        1_000,
        () =>
          `Native approval response wait did not return: ${JSON.stringify({
            run: store.getSubagentRun(runId),
            pendingPermissions,
            permissionResponses,
            childMailbox: store.listSubagentMailboxEvents(runId),
            runEvents: store.listSubagentRunEvents(runId).map((event) => event.type),
          })}`,
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(respond).toHaveBeenCalledWith("permission-child-write", "always_thread");
      expect(permissionResponses).toEqual([{ id: "permission-child-write", response: "always_thread" }]);
      expect(pendingPermissions).toEqual([]);
      expect(resumed.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        waitTimedOut: false,
        waitOutcome: { kind: "child_terminal" },
        synthesisAllowed: true,
        parentResolution: {
          status: "ready",
          action: "synthesize",
          canSynthesize: true,
          requiresUserInput: false,
          childRunId: runId,
          childStatus: "completed",
        },
        approvalResponseDeliveries: [
          {
            accepted: true,
            run: {
              id: runId,
              status: "running",
            },
            mailboxEvent: {
              runId,
              direction: "parent_to_child",
              type: "subagent.approval_response",
              deliveryState: "consumed",
            },
            message:
              "Child approval response was delivered and the parent remains blocked until the child completes or needs more attention.",
          },
        ],
      });
      expect(store.getSubagentRun(runId).status).toBe("completed");
      expect(store.listSubagentRunEvents(runId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "subagent.approval_requested" }),
          expect.objectContaining({ type: "subagent.child_approval_forwarded" }),
          expect.objectContaining({ type: "subagent.approval_response.consumed" }),
          expect.objectContaining({ type: "subagent.result_ready" }),
        ]),
      );
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            parentRunId: parentRun.id,
            childRunIds: [runId],
            status: "satisfied",
          }),
        ]),
      );
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
