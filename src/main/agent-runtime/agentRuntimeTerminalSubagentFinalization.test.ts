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

describe("AgentRuntime terminal subagent finalization", () => {
  it("blocks parent finalization while required sub-agent wait barriers are unresolved", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-finalization-barrier-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const thread = store.createThread("subagent finalization barrier");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      let parentRunId = "";
      let childRunId = "";
      let barrierId = "";
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
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
            generatedAt: "2026-06-05T00:00:00.000Z",
          });
          const child = store.createSubagentRun({
            parentThreadId: thread.id,
            parentRunId,
            parentMessageId: parentAssistantMessageId,
            title: "Required unfinished child",
            roleId: "summarizer",
            canonicalTaskPath: "root/0:summarizer",
            featureFlagSnapshot: featureFlags,
            modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(thread.model, "2026-06-05T00:00:00.000Z"),
            dependencyMode: "required",
          });
          childRunId = child.id;
          store.markSubagentRunStatus(child.id, "running");
          const barrier = store.createSubagentWaitBarrier({
            parentThreadId: thread.id,
            parentRunId,
            childRunIds: [child.id],
            dependencyMode: "required_all",
            failurePolicy: "ask_user",
          });
          barrierId = barrier.id;
          emit({ type: "message_start", message: { role: "assistant" } });
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "I am done even though the required child is still running." }],
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
        content: "Use a required child and then summarize.",
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
        .filter((event) => event.type === "subagent.wait_barrier_attention");
      expect(attentionEvents).toHaveLength(1);
      expect(attentionEvents[0]).toMatchObject({
        parentThreadId: thread.id,
        parentRunId,
        parentMessageId: expect.any(String),
        deliveryState: "queued",
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
          parentThreadId: thread.id,
          parentRunId,
          childRunId,
          childRunIds: [childRunId],
          waitBarrierId: barrierId,
          dependencyMode: "required_all",
          barrierStatus: "waiting_on_children",
          failurePolicy: "ask_user",
          parentFinalizationBlocked: true,
          parentResolution: expect.objectContaining({
            action: "wait_for_child",
            canSynthesize: false,
          }),
          allowedUserChoices: expect.arrayContaining([
            expect.objectContaining({ id: "wait_again", toolAction: "wait_agent" }),
            expect.objectContaining({ id: "cancel_parent", decision: "cancel_parent" }),
          ]),
        }),
      });
      expect(finalAssistant).toMatchObject({
        content: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
        metadata: expect.objectContaining({
          status: "error",
          subagentFinalizationBlocked: expect.objectContaining({
            reason: "required_wait_barrier_not_satisfied",
            barrierIds: [barrierId],
            childRunIds: [childRunId],
            parentMailboxEventIds: [attentionEvents[0]!.id],
          }),
        }),
      });
      expect(store.getRunRecord(parentRunId)).toMatchObject({
        status: "error",
        errorMessage: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
      });
      expect(store.getSubagentWaitBarrier(barrierId)).toMatchObject({
        status: "waiting_on_children",
        childRunIds: [childRunId],
      });
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            kind: "stream",
            status: "timeout",
            diagnostic: expect.objectContaining({
              reason: "required_wait_barrier_not_satisfied",
              barrierIds: [barrierId],
              childRunIds: [childRunId],
            }),
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
          threadId: thread.id,
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-parent-mailbox-event-updated",
          mailboxEvent: expect.objectContaining({
            id: attentionEvents[0]!.id,
            type: "subagent.wait_barrier_attention",
          }),
          workspacePath,
        }),
      ]));
      expect(store.listActiveRuns()).toEqual([]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks parent finalization after required sub-agent wait barriers resolve unsafe", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-failed-barrier-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const thread = store.createThread("subagent failed barrier");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      let parentRunId = "";
      let childRunId = "";
      let barrierId = "";
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
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
            generatedAt: "2026-06-05T00:00:00.000Z",
          });
          const child = store.createSubagentRun({
            parentThreadId: thread.id,
            parentRunId,
            parentMessageId: parentAssistantMessageId,
            title: "Required failed child",
            roleId: "reviewer",
            canonicalTaskPath: "root/0:reviewer",
            featureFlagSnapshot: featureFlags,
            modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(thread.model, "2026-06-05T00:00:00.000Z"),
            dependencyMode: "required",
          });
          childRunId = child.id;
          store.markSubagentRunStatus(child.id, "failed", {
            resultArtifact: {
              schemaVersion: "ambient-subagent-result-artifact-v1",
              runId: child.id,
              status: "failed",
              partial: false,
              summary: "child failed",
              childThreadId: child.childThreadId,
            },
          });
          const barrier = store.createSubagentWaitBarrier({
            parentThreadId: thread.id,
            parentRunId,
            childRunIds: [child.id],
            dependencyMode: "required_all",
            failurePolicy: "fail_parent",
          });
          barrierId = barrier.id;
          store.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
            resolutionArtifact: {
              schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
              childRunIds: [child.id],
              childStatuses: [{ childRunId: child.id, status: "failed" }],
              synthesisAllowed: false,
              transitionEvidence: {
                schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
                kind: "child_terminal",
                source: "wait_agent",
                childRunId: child.id,
                childRunIds: [child.id],
                reason: "child failed",
              },
            },
          });
          emit({ type: "message_start", message: { role: "assistant" } });
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "I will pretend the failed child succeeded." }],
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
        content: "Use a required child and then summarize.",
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
        .filter((event) => event.type === "subagent.wait_barrier_attention");
      expect(attentionEvents).toHaveLength(1);
      expect(attentionEvents[0]).toMatchObject({
        parentThreadId: thread.id,
        parentRunId,
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
          childRunId,
          childRunIds: [childRunId],
          waitBarrierId: barrierId,
          dependencyMode: "required_all",
          barrierStatus: "failed",
          failurePolicy: "fail_parent",
          parentFinalizationBlocked: true,
          parentResolution: expect.objectContaining({
            action: "fail_parent",
            canSynthesize: false,
          }),
          allowedUserChoices: expect.arrayContaining([
            expect.objectContaining({ id: "fail_parent", decision: "fail_parent" }),
            expect.objectContaining({ id: "cancel_parent", decision: "cancel_parent" }),
          ]),
        }),
      });
      expect(finalAssistant).toMatchObject({
        content: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
        metadata: expect.objectContaining({
          status: "error",
          subagentFinalizationBlocked: expect.objectContaining({
            reason: "required_wait_barrier_not_satisfied",
            barrierIds: [barrierId],
            childRunIds: [childRunId],
            parentMailboxEventIds: [attentionEvents[0]!.id],
            barriers: [expect.objectContaining({
              id: barrierId,
              status: "failed",
              failurePolicy: "fail_parent",
            })],
          }),
        }),
      });
      expect(store.getRunRecord(parentRunId)).toMatchObject({
        status: "error",
        errorMessage: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("reconciles stale waiting barriers during parent finalization when child results are now safe", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-readonly-finalization-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("readonly finalization barrier");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Late safe child",
        roleId: "summarizer",
        canonicalTaskPath: "root/0:summarizer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "completed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: child.id,
          status: "completed",
          partial: false,
          summary: "Late child result is valid but the barrier has not been resolved.",
          childThreadId: child.childThreadId,
          structuredOutput: {
            schemaVersion: "ambient-subagent-structured-result-v1",
            roleId: "summarizer",
            status: "complete",
            summary: "Late child result is valid but the barrier has not been resolved.",
            evidence: ["child transcript"],
            artifacts: [],
            risks: [],
            nextActions: ["Resolve the barrier before parent synthesis."],
            roleOutput: {
              keyPoints: ["Late child result is valid."],
              sourceRefs: ["child transcript"],
            },
          },
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const block = (runtime as any).subagentFinalizationBarrierBlock(parent.id, parentRun.id);

      expect(block).toBeUndefined();
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "satisfied",
        childRunIds: [child.id],
        resolutionArtifact: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          synthesisAllowed: true,
          transitionEvidence: expect.objectContaining({
            kind: "child_terminal",
            source: "child_runtime",
            childRunId: child.id,
            reason: "finalization_reconciliation:completed",
          }),
          waitBarrierEvaluation: expect.objectContaining({
            synthesisAllowed: true,
            validSynthesisCount: 1,
          }),
        }),
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not block parent finalization after an explicit partial barrier decision", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-partial-barrier-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("partial barrier");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Failed child with partial override",
        roleId: "reviewer",
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: child.id,
          status: "failed",
          partial: false,
          summary: "child failed",
          childThreadId: child.childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "degrade_partial",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "satisfied", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [child.id],
          childStatuses: [{ childRunId: child.id, status: "failed" }],
          synthesisAllowed: true,
          explicitPartial: true,
          transitionEvidence: {
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "explicit_partial",
            source: "barrier_controller",
            childRunIds: [child.id],
            reason: "User approved a partial parent answer.",
            idempotencyKey: "barrier:partial",
          },
          resultArtifact: null,
          userDecision: {
            schemaVersion: "ambient-subagent-user-decision-v1",
            decision: "continue_with_partial",
            userDecision: "User approved a partial parent answer.",
            partialSummary: "Reviewer failed; parent answer must be partial.",
            decidedAt: "2026-06-05T00:00:10.000Z",
            toolCallId: "resolve-partial",
            idempotencyKey: "barrier:partial",
          },
        },
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      expect((runtime as any).subagentFinalizationBarrierBlock(parent.id, parentRun.id)).toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not block parent finalization for optional background wait barriers", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-optional-barrier-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("optional background barrier");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Optional child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.markSubagentRunStatus(child.id, "running");
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "optional_background",
        failurePolicy: "degrade_partial",
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      expect((runtime as any).subagentFinalizationBarrierBlock(parent.id, parentRun.id)).toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
