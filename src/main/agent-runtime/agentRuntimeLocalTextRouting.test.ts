import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AMBIENT_KIMI_K2_7_CODE_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { AgentRuntime } from "./agentRuntime";
import type { LocalModelRuntimeLease, LocalModelRuntimeReleaseResult } from "./agentRuntimeLocalRuntimeFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

const gib = 1024 ** 3;

function agentRuntimeLocalTextProfile(overrides: Partial<AmbientModelRuntimeProfile> = {}): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
    profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
    selectableAsSubagent: true,
    available: true,
    unavailableReason: undefined,
    providerQuirks: ["Resolved from an active local runtime descriptor."],
    ...overrides,
  };
}

function agentRuntimeLocalModelLease(
  workspacePath: string,
  options: { release?: () => Promise<LocalModelRuntimeReleaseResult> } = {},
): LocalModelRuntimeLease {
  const state = {
    schemaVersion: "ambient-local-model-runtime-state-v1" as const,
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: AMBIENT_LOCAL_TEXT_MODEL,
    profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
    pid: 5001,
    status: "running" as const,
    command: ["/runtime/local-text", "serve"],
    cwd: workspacePath,
    stateDir: join(workspacePath, ".ambient/local-model-runtime/local-text-runtime"),
    stdoutPath: join(workspacePath, ".ambient/local-model-runtime/local-text-runtime/runtime.stdout.log"),
    stderrPath: join(workspacePath, ".ambient/local-model-runtime/local-text-runtime/runtime.stderr.log"),
    startedAt: "2026-06-05T00:00:00.000Z",
    lastUsedAt: "2026-06-05T00:00:00.000Z",
    idleTimeoutMs: 300000,
    estimatedResidentMemoryBytes: 6 * gib,
    actualResidentMemoryBytes: 4 * gib,
    memorySampledAt: "2026-06-05T00:00:01.000Z",
  };
  const runtimeLeaseRecord = {
    schemaVersion: "ambient-local-runtime-lease-v1" as const,
    leaseId: "lease-1",
    modelRuntimeId: state.runtimeId,
    modelProfileId: state.profileId,
    modelId: state.modelId,
    providerId: state.providerId,
    capabilityKind: "local-text" as const,
    estimatedResidentMemoryBytes: state.estimatedResidentMemoryBytes,
    actualResidentMemoryBytes: state.actualResidentMemoryBytes,
    pid: state.pid,
    acquiredAt: state.lastUsedAt,
    lastHeartbeatAt: state.lastUsedAt,
    status: "running" as const,
  };
  return {
    leaseId: "lease-1",
    state,
    acquisition: {
      schemaVersion: "ambient-local-model-runtime-acquisition-v1",
      source: "started",
      leaseId: "lease-1",
      runtimeId: state.runtimeId,
      providerId: state.providerId,
      modelId: state.modelId,
      ...(state.profileId ? { profileId: state.profileId } : {}),
      pid: state.pid,
      acquiredAt: state.lastUsedAt,
      activeLeases: 1,
      runtimeLease: runtimeLeaseRecord,
    },
    runtimeLease: runtimeLeaseRecord,
    release: options.release ?? (async () => agentRuntimeLocalModelRelease()),
    touch: async () => state,
  };
}

function agentRuntimeLocalModelRelease(overrides: Partial<LocalModelRuntimeReleaseResult> = {}): LocalModelRuntimeReleaseResult {
  return {
    status: "released",
    leaseId: "lease-1",
    pid: 5001,
    remainingLeases: 0,
    ...overrides,
  };
}

function agentRuntimeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AgentRuntime sub-agent local runtime routing", () => {
  it("blocks explicit subagent prompts before opening a Pi session when the feature is disabled", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-preflight-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("subagent feature disabled");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn((runtime as any).controllers.sessionFactory, "getSession");

      await runtime.send({
        threadId: thread.id,
        content: "Use one feedback subagent and one separate judge subagent for this draft.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      const assistant = store.listMessages(thread.id).find((message) => message.role === "assistant");
      expect(getSession).not.toHaveBeenCalled();
      expect(assistant?.metadata).toMatchObject({
        status: "error",
        preflightBlock: "subagent_unavailable",
      });
      expect(assistant?.content).toContain("ambient.subagents is disabled");
      expect(assistant?.content).toContain("I will not simulate sub-agents");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("routes configured local text main chat through the local runtime without Pi", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-main-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("local main").id, {
        model: AMBIENT_LOCAL_TEXT_MODEL,
      });
      const release = vi.fn(async () => agentRuntimeLocalModelRelease());
      const runtimeManager = { acquire: vi.fn(async () => agentRuntimeLocalModelLease(workspacePath, { release })) };
      const fetchImpl = vi.fn(async () => agentRuntimeJsonResponse({ output_text: "Local main answer." }));
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const localProfile = agentRuntimeLocalTextProfile({ selectableAsMain: true });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          localTextSubagents: {
            resolveModelRuntimeProfile: (modelId) => {
              if (modelId === AMBIENT_LOCAL_TEXT_MODEL) return localProfile;
              return resolveAmbientModelRuntimeProfile(modelId);
            },
            resolveRuntimeForMain: ({ thread: mainThread, runId, model }) => ({
              launch: {
                runtimeId: "local-text-runtime",
                command: "/runtime/local-text",
                args: ["serve"],
                cwd: mainThread.workspacePath,
                estimatedResidentMemoryBytes: 6 * gib,
                profileId: model.profileId,
              },
              completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
              artifactRootPath: join(mainThread.workspacePath, ".ambient/local-main", runId),
              maxInlineChars: 1024,
            }),
            runtimeManager,
            fetchImpl: fetchImpl as typeof fetch,
          },
        },
      );
      const getSessionSpy = vi.spyOn((runtime as any).controllers.sessionFactory, "getSession");

      await runtime.send({
        threadId: thread.id,
        content: "Answer locally.",
        permissionMode: thread.permissionMode,
        collaborationMode: thread.collaborationMode,
        model: AMBIENT_LOCAL_TEXT_MODEL,
        thinkingLevel: thread.thinkingLevel,
      });

      const messages = store.listMessages(thread.id);
      const assistant = messages.find((message) => message.role === "assistant");
      expect(assistant).toMatchObject({
        content: "Local main answer.",
        metadata: expect.objectContaining({
          status: "completed",
          runtime: "local_text",
          provider: "local",
          model: AMBIENT_LOCAL_TEXT_MODEL,
          localTextResult: expect.objectContaining({
            schemaVersion: "ambient-local-text-result-v1",
            runId: expect.any(String),
            textPreview: "Local main answer.",
          }),
        }),
      });
      expect(store.listActiveRuns()).toEqual([]);
      expect(emitted.map((event) => event.type)).toEqual(
        expect.arrayContaining(["message-created", "message-updated", "run-status", "thread-updated"]),
      );
      expect(emitted.filter((event) => event.type === "run-status").map((event) => event.status)).toEqual([
        "starting",
        "streaming",
        "idle",
      ]);
      expect(runtimeManager.acquire).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeId: "local-text-runtime",
          ownerThreadId: thread.id,
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
        }),
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(getSessionSpy).not.toHaveBeenCalled();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps Symphony parent mode on the tool-capable Pi path when a local text main model is selected", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-main-symphony-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const threadSessionDir = join(workspace.sessionPath, "local-symphony-session");
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(store.createThread("local main Symphony").id, {
        model: AMBIENT_LOCAL_TEXT_MODEL,
        piSessionFile: sessionFile,
      });
      const release = vi.fn(async () => agentRuntimeLocalModelRelease());
      const runtimeManager = { acquire: vi.fn(async () => agentRuntimeLocalModelLease(workspacePath, { release })) };
      const fetchImpl = vi.fn(async () => agentRuntimeJsonResponse({ output_text: "Local main should not answer." }));
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const localProfile = agentRuntimeLocalTextProfile({ selectableAsMain: true });
      const subscribers: Array<(event: any) => void> = [];
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
        prompt: vi.fn(async () => {
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "I cannot run local text for Symphony." }],
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
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          localTextSubagents: {
            resolveModelRuntimeProfile: (modelId) => {
              if (modelId === AMBIENT_LOCAL_TEXT_MODEL) return localProfile;
              return resolveAmbientModelRuntimeProfile(modelId);
            },
            resolveRuntimeForMain: ({ thread: mainThread, runId, model }) => ({
              launch: {
                runtimeId: "local-text-runtime",
                command: "/runtime/local-text",
                args: ["serve"],
                cwd: mainThread.workspacePath,
                estimatedResidentMemoryBytes: 6 * gib,
                profileId: model.profileId,
              },
              completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
              artifactRootPath: join(mainThread.workspacePath, ".ambient/local-main", runId),
              maxInlineChars: 1024,
            }),
            runtimeManager,
            fetchImpl: fetchImpl as typeof fetch,
          },
        },
      );
      const getSessionSpy = vi.spyOn((runtime as any).controllers.sessionFactory, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Use Symphony to compare these options.",
        permissionMode: thread.permissionMode,
        collaborationMode: thread.collaborationMode,
        model: AMBIENT_LOCAL_TEXT_MODEL,
        thinkingLevel: thread.thinkingLevel,
        composerIntent: {
          kind: "symphony-workflow",
          action: "run-once",
          patternId: "map_reduce",
          metricCustomizations: {
            "map_reduce-metric": "Reducer must cite each child result before synthesis.",
          },
        },
      });

      expect(runtimeManager.acquire).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(getSessionSpy).toHaveBeenCalledTimes(1);
      expect(getSessionSpy.mock.calls[0]?.[0]).toMatchObject({ model: AMBIENT_KIMI_K2_7_CODE_MODEL });
      expect(store.getThread(thread.id).model).toBe(AMBIENT_KIMI_K2_7_CODE_MODEL);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      const prompt = String((session.prompt as any).mock.calls[0]?.[0] ?? "");
      expect(prompt).toContain("ambient_workflow_symphony_map_reduce");
      expect(prompt).not.toContain("Use ambient_subagent");
      expect(prompt).not.toContain("Ambient sub-agent orchestration pattern detected");
      expect(store.listCallableWorkflowTasksForParentThread(thread.id)).toEqual([]);
      expect(store.listMessages(thread.id).at(-1)).toMatchObject({
        metadata: expect.objectContaining({ status: "error", runtime: "pi" }),
      });
      expect(store.listMessages(thread.id).at(-1)?.metadata?.localTextResult).toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("routes configured local text child runs through the local runtime adapter", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-subagent-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("local sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const release = vi.fn(async () => agentRuntimeLocalModelRelease());
      const runtimeManager = { acquire: vi.fn(async () => agentRuntimeLocalModelLease(workspacePath, { release })) };
      const fetchImpl = vi.fn(async () => agentRuntimeJsonResponse({ output_text: "Local sub-agent result." }));
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
                generatedAt: "2026-06-05T00:00:00.000Z",
              }),
          },
          localTextSubagents: {
            resolveModelRuntimeProfile: (modelId) => {
              if (modelId === AMBIENT_LOCAL_TEXT_MODEL) return agentRuntimeLocalTextProfile();
              return resolveAmbientModelRuntimeProfile(modelId);
            },
            resolveRuntime: ({ parentThread, run, model }) => ({
              launch: {
                runtimeId: "local-text-runtime",
                command: "/runtime/local-text",
                args: ["serve"],
                cwd: parentThread.workspacePath,
                estimatedResidentMemoryBytes: 6 * gib,
                profileId: model.profileId,
              },
              completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
              artifactRootPath: join(parentThread.workspacePath, ".ambient/subagents", run.id),
              maxInlineChars: 1024,
            }),
            runtimeManager,
            fetchImpl: fetchImpl as typeof fetch,
            now: () => new Date("2026-06-05T00:00:00.000Z"),
          },
        },
      );
      const sendSpy = vi.spyOn(runtime as any, "send").mockRejectedValue(new Error("Pi child session should not run."));
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).controllers.subagentToolExtensions.createToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-local-text", {
        action: "spawn_agent",
        roleId: "summarizer",
        task: "Summarize the local evidence.",
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        dependencyMode: "required",
        forkMode: "no_history",
        promptMode: "fresh",
        toolScope: { requestedCategories: ["artifact.read"] },
        idempotencyKey: "spawn:agent-runtime-local-text",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-local-text", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);

      expect(waited.details).toMatchObject({
        status: "completed",
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        modelRuntimeSnapshot: {
          requestedModelId: AMBIENT_LOCAL_TEXT_MODEL,
          profile: {
            modelId: AMBIENT_LOCAL_TEXT_MODEL,
            locality: "local",
            available: true,
          },
        },
        resultArtifact: {
          status: "completed",
          summary: "Local sub-agent result.",
        },
      });
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual(["system", "system", "assistant"]);
      const runUpdates = emitted.filter((event) => event.type === "subagent-run-updated");
      expect(runUpdates.map((event) => event.run.status)).toEqual(expect.arrayContaining(["reserved", "starting", "running", "completed"]));
      expect(runUpdates.at(-1)).toMatchObject({
        type: "subagent-run-updated",
        run: expect.objectContaining({ id: runId, status: "completed" }),
        workspacePath,
      });
      const runEventUpdates = emitted.filter((event) => event.type === "subagent-run-event-created");
      expect(runEventUpdates.map((event) => event.event.type)).toEqual(
        expect.arrayContaining([
          "subagent.reserved",
          "subagent.spawn_requested",
          "subagent.status_changed",
          "subagent.runtime_event",
          "subagent.local_text_completed",
        ]),
      );
      expect(runEventUpdates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent-run-event-created",
            run: expect.objectContaining({ id: runId }),
            event: expect.objectContaining({ runId, type: "subagent.local_text_completed" }),
            workspacePath,
          }),
        ]),
      );
      expect(emitted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent-tool-scope-snapshot-recorded",
            run: expect.objectContaining({ id: runId }),
            snapshot: expect.objectContaining({
              runId,
              scope: expect.objectContaining({
                piVisibleCategories: ["artifact.read"],
              }),
            }),
            workspacePath,
          }),
        ]),
      );
      const barrierUpdates = emitted.filter((event) => event.type === "subagent-wait-barrier-updated");
      expect(barrierUpdates.map((event) => event.barrier.status)).toEqual(expect.arrayContaining(["waiting_on_children", "satisfied"]));
      expect(barrierUpdates.at(-1)).toMatchObject({
        type: "subagent-wait-barrier-updated",
        barrier: expect.objectContaining({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          childRunIds: [runId],
          status: "satisfied",
        }),
        workspacePath,
      });
      expect(runtimeManager.acquire).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeId: "local-text-runtime",
          ownerThreadId: run.childThreadId,
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
        }),
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(sendSpy).not.toHaveBeenCalled();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

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
