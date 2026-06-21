import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { AgentRuntime } from "./agentRuntime";
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

describe("AgentRuntime post-tool continuation integration", () => {
  it("cancels parent synthesis when resolve_barrier returns cancel_parent", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-parent-control-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const created = store.createThread("cancel parent barrier control");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const desktopEvents: any[] = [];
      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      let childRunId = "";
      let waitBarrierId = "";
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
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
        prompt: vi.fn(
          () =>
            new Promise<never>((_resolve, reject) => {
              rejectPrompt = reject;
              const parentRun = store.listActiveRuns().find((candidate) => candidate.threadId === thread.id);
              if (!parentRun) throw new Error("Expected active parent run before Pi tool execution.");
              const featureFlags = resolveAmbientFeatureFlags({
                settings: store.getFeatureFlagSettings(),
                generatedAt: "2026-06-05T00:00:00.000Z",
              });
              const child = store.createSubagentRun({
                parentThreadId: thread.id,
                parentRunId: parentRun.id,
                parentMessageId: parentRun.assistantMessageId,
                title: "Required child",
                roleId: "explorer",
                canonicalTaskPath: "root/0:explorer",
                featureFlagSnapshot: featureFlags,
                modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(thread.model, "2026-06-05T00:00:00.000Z"),
                dependencyMode: "required",
              });
              store.markSubagentRunStatus(child.id, "running");
              const barrier = store.createSubagentWaitBarrier({
                parentThreadId: thread.id,
                parentRunId: parentRun.id,
                childRunIds: [child.id],
                dependencyMode: "required_all",
                failurePolicy: "ask_user",
              });
              childRunId = child.id;
              waitBarrierId = barrier.id;
              const details = {
                runtime: "ambient-subagents",
                phase: "phase-2-pi-tool-surface",
                toolName: "ambient_subagent",
                action: "resolve_barrier",
                status: "cancelled",
                parentThreadId: thread.id,
                parentRunId: parentRun.id,
                waitBarrier: { id: barrier.id, status: "cancelled" },
                parentResolution: {
                  status: "blocked",
                  action: "cancel_parent",
                  canSynthesize: false,
                  requiresUserInput: false,
                  requiresExplicitPartial: false,
                  reason: "User chose to cancel the parent path while resolving this required child barrier.",
                  instruction: "Do not synthesize child work. Stop or cancel the parent run.",
                },
                resolutionArtifact: {
                  schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
                  childRunIds: [child.id],
                  childStatuses: [{ childRunId: child.id, status: "cancelled" }],
                  synthesisAllowed: false,
                  explicitPartial: false,
                  resultArtifact: null,
                  parentCancellationRequested: true,
                  userDecision: {
                    schemaVersion: "ambient-subagent-user-decision-v1",
                    decision: "cancel_parent",
                    userDecision: "Stop this parent task.",
                    decidedAt: "2026-06-05T00:00:00.000Z",
                    toolCallId: "call-resolve-barrier",
                    idempotencyKey: "barrier:cancel-parent",
                  },
                },
                idempotencyKey: "barrier:cancel-parent",
              };
              emit({
                type: "tool_execution_start",
                toolCallId: "call-resolve-barrier",
                toolName: "ambient_subagent",
                args: {
                  action: "resolve_barrier",
                  waitBarrierId: barrier.id,
                  decision: "cancel_parent",
                  userDecision: "Stop this parent task.",
                },
              });
              emit({
                type: "tool_execution_end",
                toolCallId: "call-resolve-barrier",
                toolName: "ambient_subagent",
                result: [{ type: "text", text: "Recorded wait-barrier decision: cancel_parent." }],
                details,
              });
            }),
        ),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
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
              send: (_channel: string, event: any) => desktopEvents.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: vi.fn(),
        },
      );
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Use a required sub-agent, then respect the cancel-parent barrier decision.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      expect(session.steer).not.toHaveBeenCalled();
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
      expect(finalAssistant).toMatchObject({
        content: expect.stringContaining(`sub-agent wait barrier ${waitBarrierId}`),
        metadata: expect.objectContaining({
          status: "aborted",
          subagentParentControlAbort: expect.objectContaining({
            toolCallId: "call-resolve-barrier",
            parentRunId: expect.any(String),
            waitBarrierId,
            idempotencyKey: "barrier:cancel-parent",
            decision: "cancel_parent",
          }),
        }),
      });
      expect(store.getSubagentRun(childRunId)).toMatchObject({
        status: "cancelled",
        resultArtifact: expect.objectContaining({
          status: "cancelled",
          summary: expect.stringContaining("User chose to cancel the parent path"),
        }),
      });
      expect(store.getSubagentWaitBarrier(waitBarrierId)).toMatchObject({
        status: "cancelled",
        resolutionArtifact: expect.objectContaining({
          parentCancellationRequested: true,
          parentControlReconciledSource: "runtime_parent_abort",
          parentControlReconciliation: expect.objectContaining({
            action: "cancel_parent",
            source: "runtime_parent_abort",
          }),
        }),
      });
      expect(store.listActiveRuns()).toEqual([]);
      expect(desktopEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            diagnostic: expect.objectContaining({
              reason: "subagent_parent_control_cancel_parent",
              waitBarrierId,
            }),
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-run-updated",
          run: expect.objectContaining({ id: childRunId, status: "cancelled" }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-wait-barrier-updated",
          barrier: expect.objectContaining({ id: waitBarrierId, status: "cancelled" }),
          workspacePath,
        }),
      ]));
      expect(store.listMessages(thread.id).map((message) => message.content).join("\n")).not.toContain("Do not synthesize child work");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not steer a stale bash continuation after a later browser_search starts", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-stale-post-tool-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("stale post-tool continuation");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
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
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit({
              type: "tool_execution_start",
              toolCallId: "call-bash-1",
              toolName: "bash",
              args: { command: "echo ready" },
            });
            emit({
              type: "tool_execution_end",
              toolCallId: "call-bash-1",
              toolName: "bash",
              result: [{ type: "text", text: "ready" }],
            });
          }, 0);
          setTimeout(() => {
            emit({
              type: "tool_execution_start",
              toolCallId: "call-browser-search-1",
              toolName: "browser_search",
              args: { query: "OpenCut Classic install troubleshooting" },
            });
          }, 14_900);
          setTimeout(() => {
            emit({
              type: "tool_execution_end",
              toolCallId: "call-browser-search-1",
              toolName: "browser_search",
              result: [{ type: "text", text: "Search results returned." }],
            });
          }, 15_050);
          setTimeout(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: "I found search results and will use them next." }],
              },
            });
          }, 15_100);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [{ type: "text", text: "" }],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Install and run OpenCut Classic.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(14_900);
      expect(session.steer).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(15_000);
      await sendPromise;

      expect(session.steer).not.toHaveBeenCalled();
      const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
      expect(transcript).toContain("bash completed");
      expect(transcript).toContain("browser_search completed");
      expect(transcript).toContain("I found search results and will use them next.");
      expect(transcript).not.toContain("Most recent tool: bash");
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
