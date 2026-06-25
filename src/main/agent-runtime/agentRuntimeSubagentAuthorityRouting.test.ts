import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PermissionRequest } from "../../shared/permissionTypes";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { resolveSubagentApprovalDecision, resolveSubagentChildActiveToolNames } from "./agentRuntimeSubagentsFacade";

describe("AgentRuntime sub-agent authority routing", () => {
  it("launches ordinary child web research with brokered tools and without browser fallback", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-web-research-scope-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with brokered child web research");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Brokered web research scope was prepared.",
          evidence: ["tool scope snapshot"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [{ summary: "Child launch uses brokered web research tools.", provenance: ["tool scope snapshot"] }],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Brokered web research scope was prepared.",
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

      const spawned = await subagentTool.execute("spawn-brokered-web-research-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Research current travel details using ordinary web research; do not use an interactive browser.",
        dependencyMode: "required",
        forkMode: "recent_turns",
        promptMode: "fresh",
        toolScope: {
          requestedCategories: ["connector.read", "browser.read"],
          childAuthority: {
            taskIntent: "web_research",
            network: "allow",
            mutation: "deny",
          },
        },
        idempotencyKey: "spawn:brokered-web-research-child",
      });
      const runId = spawned.details.run.id as string;
      const snapshots = store.listSubagentToolScopeSnapshots(runId);

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toMatchObject({
        runId,
        scope: {
          loadedCategories: ["connector.read"],
          piVisibleCategories: ["connector.read"],
          deniedCategories: [
            {
              id: "browser.read",
              reason: "Denied by child task intent web_research; allowed categories: workspace.read, artifact.read, connector.read.",
            },
          ],
        },
      });
      expect(
        resolveSubagentChildActiveToolNames({
          subagentToolScopeSnapshots: snapshots,
        }),
      ).toEqual(["web_research_status", "web_research_search", "web_research_fetch"]);
      expect(JSON.stringify(snapshots[0].scope)).not.toContain("browser_search");
      expect(JSON.stringify(snapshots[0].scope)).not.toContain("browser_content");
      expect(spawned.details).toMatchObject({
        toolScopeSnapshot: {
          loadedCategories: ["connector.read"],
          deniedCategories: [
            {
              id: "browser.read",
              reason: "Denied by child task intent web_research; allowed categories: workspace.read, artifact.read, connector.read.",
            },
          ],
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("round-trips child browser authority prompts through parent approval and child resume", async () => {
    vi.useRealTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-browser-approval-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parentBase = store.createThread("parent with child browser approval");
      const parent = store.updateThreadSettings(parentBase.id, { permissionMode: "full-access" });
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const pendingPermissions: PermissionRequest[] = [];
      const permissionResponses: Array<{ id: string; response: string }> = [];
      const permissionResolvers = new Map<string, (resolution: { allowed: boolean; mode: any }) => void>();
      let resolveBrowserPromptStarted!: () => void;
      const browserPromptStarted = new Promise<void>((resolve) => {
        resolveBrowserPromptStarted = resolve;
      });
      const requestPermission = vi.fn(
        (input: Omit<PermissionRequest, "id">, options?: { onRequest?: (request: PermissionRequest) => void }) =>
          new Promise<{ allowed: boolean; mode: any }>((resolve) => {
            const request = { ...input, id: "permission-child-browser" };
            pendingPermissions.push(request);
            permissionResolvers.set(request.id, resolve);
            options?.onRequest?.(request);
            resolveBrowserPromptStarted();
          }),
      );
      const respond = vi.fn((id: string, response: string) => {
        permissionResponses.push({ id, response });
        const index = pendingPermissions.findIndex((request) => request.id === id);
        if (index >= 0) pendingPermissions.splice(index, 1);
        permissionResolvers.get(id)?.({ allowed: response !== "deny", mode: response });
        permissionResolvers.delete(id);
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
        request: requestPermission,
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
        resolveChildSendStarted();
        await childSendFinished;
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Child browser approval response was consumed.",
          evidence: ["permission-child-browser"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [{ summary: "Browser permission response reached the child runtime.", provenance: ["permission-child-browser"] }],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Child browser approval response was consumed.",
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

      const spawned = await Promise.race([
        subagentTool.execute("spawn-browser-approval-roundtrip", {
          action: "spawn_agent",
          roleId: "explorer",
          task: "Read one browser URL only if the parent approves child browser network access.",
          dependencyMode: "required",
          forkMode: "recent_turns",
          promptMode: "fresh",
          toolScope: {
            requestedCategories: ["browser.interactive"],
            childAuthority: {
              taskIntent: "analysis",
              network: "ask_parent",
              mutation: "deny",
            },
          },
          idempotencyKey: "spawn:browser-approval-roundtrip",
        }),
        new Promise<any>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Browser approval spawn did not return: ${JSON.stringify({
                    parentRun,
                    runs: store.listSubagentRunsForParentThread(parent.id),
                  })}`,
                ),
              ),
            1_000,
          ),
        ),
      ]);
      const runId = spawned.details.run.id as string;
      await childSendStarted;
      const run = store.getSubagentRun(runId);
      store.recordSubagentToolScopeSnapshot(run.id, {
        resolverInputs: {
          childAuthorityProfile: {
            childRunId: run.id,
            childThreadId: run.childThreadId,
            approvalRouting: { mode: "interactive" },
            resourceScopes: {
              browser: {
                networkDecision: "ask_parent",
                domains: ["ambient.test"],
              },
            },
          },
        },
        scope: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          loadedCategories: ["browser.interactive"],
          piVisibleCategories: ["browser.interactive"],
          deniedCategories: [],
          loadedTools: ["browser_content"],
          piVisibleTools: ["browser_content"],
          deniedTools: [],
          approvalMode: "interactive",
          worktreeIsolated: false,
          fanoutAvailable: false,
        } as any,
      });

      const browserPermissionPromise = (runtime as any).controllers.toolPermissions.resolveToolCallPermission(
        run.childThreadId,
        store.getWorkspace(),
        "browser_content",
        { url: "https://ambient.test/current-child-browser-approval-behavior" },
      ) as Promise<{ reason: string } | undefined>;
      await Promise.race([
        browserPromptStarted,
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Browser approval prompt did not start: ${JSON.stringify({
                    run: store.getSubagentRun(run.id),
                    snapshots: store.listSubagentToolScopeSnapshots(run.id),
                    pendingPermissions,
                  })}`,
                ),
              ),
            1_000,
          ),
        ),
      ]);

      expect(pendingPermissions).toEqual([
        expect.objectContaining({
          id: "permission-child-browser",
          threadId: run.childThreadId,
          toolName: "browser_content",
          title: "Allow child browser network access?",
          risk: "browser-network",
          grantActionKind: "browser_network",
          grantTargetKind: "browser_origin",
          grantTargetLabel: "ambient.test",
          grantConditions: expect.objectContaining({
            childRunId: run.id,
            childThreadId: run.childThreadId,
            domain: "ambient.test",
            source: "subagent-child-browser-authority",
          }),
        }),
      ]);

      const waited = await Promise.race([
        subagentTool.execute("wait-browser-approval-roundtrip", {
          action: "wait_agent",
          childRunId: run.id,
          wait: { timeoutMs: 50 },
          idempotencyKey: "wait:browser-approval-roundtrip-request",
        }),
        new Promise<any>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Browser approval wait did not return: ${JSON.stringify({
                    run: store.getSubagentRun(run.id),
                    pendingPermissions,
                    parentMailbox: store.listSubagentParentMailboxEventsForParentRun(parentRun.id),
                    runEvents: store.listSubagentRunEvents(run.id).map((event) => event.type),
                  })}`,
                ),
              ),
            1_000,
          ),
        ),
      ]);

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
          childRunId: run.id,
          childStatus: "needs_attention",
        },
        approvalRequestRecords: [
          {
            idempotencyKey: `subagent:native-permission-request:${run.id}:permission-child-browser:browser_content`,
            parentMailboxEvent: {
              parentThreadId: parent.id,
              parentRunId: parentRun.id,
              parentMessageId: assistant.id,
              type: "subagent.child_approval_requested",
              deliveryState: "queued",
              childRunIds: [run.id],
            },
          },
        ],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.child_approval_requested",
            deliveryState: "queued",
            payload: expect.objectContaining({
              childRunId: run.id,
              childThreadId: run.childThreadId,
              approvalId: "permission-child-browser",
              requestedToolId: "browser_content",
              requestedAction: "browser_network",
              requestedToolCategory: "browser-network",
              parentBlockingState: expect.objectContaining({
                action: "forward_child_approval_then_wait",
                childRunId: run.id,
                childThreadId: run.childThreadId,
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
          childRunId: run.id,
          approvalId: "permission-child-browser",
          decision: "approved",
          requestedScope: "this_child_thread",
          userDecision: "Approve child browser content for the rest of this child thread.",
        },
        { now: "2026-06-06T00:02:00.000Z" },
      );

      expect(decision).toMatchObject({
        approvalId: "permission-child-browser",
        decision: "approved",
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

      const resumed = await Promise.race([
        subagentTool.execute("wait-browser-approval-response-roundtrip", {
          action: "wait_agent",
          childRunId: run.id,
          wait: { timeoutMs: 5000 },
          idempotencyKey: "wait:browser-approval-roundtrip-response",
        }),
        new Promise<any>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Browser approval response wait did not return: ${JSON.stringify({
                    run: store.getSubagentRun(run.id),
                    pendingPermissions,
                    parentMailbox: store.listSubagentParentMailboxEventsForParentRun(parentRun.id),
                    childMailbox: store.listSubagentMailboxEvents(run.id),
                    runEvents: store.listSubagentRunEvents(run.id).map((event) => event.type),
                  })}`,
                ),
              ),
            1_000,
          ),
        ),
      ]);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(respond).toHaveBeenCalledWith("permission-child-browser", "always_thread");
      expect(permissionResponses).toEqual([{ id: "permission-child-browser", response: "always_thread" }]);
      expect(pendingPermissions).toEqual([]);
      await expect(
        Promise.race([
          browserPermissionPromise,
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Browser permission promise did not resolve: ${JSON.stringify({
                      run: store.getSubagentRun(run.id),
                      pendingPermissions,
                      permissionResponses,
                    })}`,
                  ),
                ),
              1_000,
            ),
          ),
        ]),
      ).resolves.toBeUndefined();
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
          childRunId: run.id,
          childStatus: "completed",
        },
      });
      expect(store.listSubagentRunEvents(run.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "subagent.approval_requested" }),
          expect.objectContaining({ type: "subagent.child_approval_forwarded" }),
          expect.objectContaining({ type: "subagent.approval_response.consumed" }),
        ]),
      );
      await Promise.resolve();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
