import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import { AgentRuntime } from "./agentRuntime";
import {
  buildCallableWorkflowExecutionPlan,
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  callableWorkflowToolName,
  CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
} from "./agentRuntimeCallableWorkflowFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

function fakePiSession(sessionFile: string) {
  return {
    sessionFile,
    sessionManager: {
      getEntries: () => [],
    },
    model: {
      contextWindow: 128_000,
    },
    getContextUsage: () => ({
      tokens: 512,
      contextWindow: 128_000,
      percent: 0.4,
    }),
    sendCustomMessage: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

describe("AgentRuntime terminal callable workflow finalization", () => {
  it("blocks parent finalization while blocking callable workflow tasks are unresolved", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-callable-workflow-block-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const thread = store.createThread("callable workflow parent block");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      let parentRunId = "";
      let taskId = "";
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const emitted: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => emitted.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(async () => {
          parentRunId = (runtime as any).activeRunIds.get(thread.id);
          const parentAssistantMessageId = store
            .listMessages(thread.id)
            .find((message) => message.role === "assistant" && message.metadata?.status === "streaming")?.id;
          const featureFlags = resolveAmbientFeatureFlags({
            settings: store.getFeatureFlagSettings(),
            generatedAt: "2026-06-06T18:00:00.000Z",
          });
          const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot: featureFlags });
          const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
          if (!descriptor) throw new Error("Missing map-reduce callable workflow descriptor");
          const executionPlan = buildCallableWorkflowExecutionPlan({
            descriptor,
            runPlan: buildCallableWorkflowRunPlan(descriptor, {
              goal: "Summarize release notes",
              blocking: true,
              metricCriteria: [
                {
                  templateId: "map_reduce-metric",
                  value: "Every mapped item has reducer evidence.",
                },
              ],
            }),
            parent: {
              threadId: thread.id,
              runId: parentRunId,
              assistantMessageId: parentAssistantMessageId,
            },
            toolCallId: "callable-workflow-tool-call",
            createdAt: "2026-06-06T18:00:00.000Z",
          });
          const task = store.enqueueCallableWorkflowTask({
            executionPlan,
            featureFlagSnapshot: featureFlags,
          });
          taskId = task.id;
          emit({ type: "message_start", message: { role: "assistant" } });
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "I am done even though the blocking workflow has not run yet." }],
            },
          });
        }),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Run a blocking callable workflow and then summarize.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "minimal",
        delivery: "prompt",
        context: [],
      });

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      const attentionEvents = store
        .listSubagentParentMailboxEventsForParentRun(parentRunId)
        .filter((event) => event.type === CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE);
      expect(attentionEvents).toHaveLength(1);
      expect(attentionEvents[0]).toMatchObject({
        parentThreadId: thread.id,
        parentRunId,
        parentMessageId: expect.any(String),
        deliveryState: "queued",
        payload: expect.objectContaining({
          schemaVersion: "ambient-callable-workflow-parent-blocking-v1",
          parentThreadId: thread.id,
          parentRunId,
          parentFinalizationBlocked: true,
          synthesisAllowed: false,
          reason: "blocking_callable_workflow_not_synthesis_safe",
          taskIds: [taskId],
          waitingTaskIds: [taskId],
          attentionTaskIds: [],
          allowedUserChoices: expect.arrayContaining([
            expect.objectContaining({ id: "wait_again", action: "wait_for_workflow" }),
            expect.objectContaining({ id: "cancel_parent", action: "cancel_parent_run" }),
          ]),
          tasks: [expect.objectContaining({
            id: taskId,
            status: "queued",
            statusGroup: "waiting_on_workflow",
            toolName: "ambient_workflow_symphony_map_reduce",
          })],
        }),
      });
      expect(finalAssistant).toMatchObject({
        content: "",
        metadata: expect.objectContaining({
          status: "error",
          callableWorkflowFinalizationBlocked: expect.objectContaining({
            reason: "blocking_callable_workflow_not_synthesis_safe",
            taskIds: [taskId],
            waitingTaskIds: [taskId],
            parentMailboxEventId: attentionEvents[0]!.id,
          }),
        }),
      });
      const task = store.getCallableWorkflowTask(taskId);
      const parentAssistantMessagesAfterTask = store
        .listMessages(thread.id)
        .filter((message) =>
          message.role === "assistant" &&
          message.createdAt >= task.createdAt &&
          message.content.trim().length > 0
        );
      expect(parentAssistantMessagesAfterTask).toEqual([]);
      expect(store.getRunRecord(parentRunId)).toMatchObject({
        status: "error",
        errorMessage: expect.stringContaining("Parent final answer blocked because blocking callable workflow work is not safe for synthesis."),
      });
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            kind: "stream",
            status: "timeout",
            diagnostic: expect.objectContaining({
              reason: "blocking_callable_workflow_not_synthesis_safe",
              taskIds: [taskId],
            }),
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("Parent final answer blocked because blocking callable workflow work is not safe for synthesis."),
          threadId: thread.id,
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-parent-mailbox-event-updated",
          mailboxEvent: expect.objectContaining({
            id: attentionEvents[0]!.id,
            type: CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "thread-updated",
          thread: expect.objectContaining({ id: thread.id }),
          workspacePath,
        }),
      ]));
      expect(store.listActiveRuns()).toEqual([]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("suppresses callable workflow parent chatter by parent message id when the message predates the task", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-callable-workflow-owned-message-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("callable workflow stale parent message");
      const ownedParentMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "Launched the workflow and now I am narrating parent work.",
        metadata: { status: "done", runtime: "pi" },
      });
      const unrelatedEarlierMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "Earlier assistant answer should remain visible.",
        metadata: { status: "done", runtime: "pi" },
      });
      const finalBlockedMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "",
        metadata: { status: "error", runtime: "pi" },
      });
      const emitted: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => emitted.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );

      (runtime as any).suppressCallableWorkflowParentAssistantMessages({
        reason: "blocking_callable_workflow_not_synthesis_safe",
        parentThreadId: thread.id,
        parentMessageId: ownedParentMessage.id,
        taskIds: ["workflow-task-1"],
        tasks: [{
          id: "workflow-task-1",
          parentMessageId: ownedParentMessage.id,
          createdAt: "2999-06-06T18:00:00.000Z",
        }],
      }, { preserveMessageId: finalBlockedMessage.id });

      const messages = () => store.listMessages(thread.id);
      const messageById = (id: string) => messages().find((message) => message.id === id);
      expect(messageById(ownedParentMessage.id)).toMatchObject({
        content: "",
        metadata: expect.objectContaining({
          callableWorkflowParentOutputSuppressed: expect.objectContaining({
            taskIds: ["workflow-task-1"],
            parentMessageId: ownedParentMessage.id,
          }),
        }),
      });
      expect(messageById(unrelatedEarlierMessage.id)?.content).toBe("Earlier assistant answer should remain visible.");
      expect(messageById(finalBlockedMessage.id)?.content).toBe("");
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "message-updated",
          message: expect.objectContaining({ id: ownedParentMessage.id }),
        }),
        expect.objectContaining({
          type: "thread-updated",
          thread: expect.objectContaining({ id: thread.id }),
          workspacePath,
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
