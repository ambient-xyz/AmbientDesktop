import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import type { PermissionRequest } from "../../shared/permissionTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import {
  AMBIENT_KIMI_K2_7_CODE_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  createAmbientModelRuntimeSnapshot,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { LocalModelRuntimeLease, LocalModelRuntimeReleaseResult } from "./agentRuntimeLocalRuntimeFacade";
import {
  manualTelegramGuidedOwnerLoopSmokeChecklist,
  manualTelegramOwnerLoopSmokeChecklist,
} from "./agentRuntimeManualTelegramSmokeChecklists";
import { resolveSubagentApprovalDecision } from "./agentRuntimeSubagentsFacade";
import { resolveSubagentChildActiveToolNames } from "./agentRuntimeSubagentsFacade";
import { appendMappedSubagentRuntimeEvent } from "./agentRuntimeSubagentsFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const gib = 1024 ** 3;
const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", cwd, ...args]);
}

async function initializeGitWorkspace(workspacePath: string): Promise<void> {
  await git(workspacePath, ["init"]);
  await git(workspacePath, ["config", "user.email", "ambient-test@example.invalid"]);
  await git(workspacePath, ["config", "user.name", "Ambient Test"]);
  await writeFile(join(workspacePath, ".gitignore"), ".ambient/\n", "utf8");
  await writeFile(join(workspacePath, "README.md"), "# Ambient worker worktree test\n", "utf8");
  await git(workspacePath, ["add", ".gitignore", "README.md"]);
  await git(workspacePath, ["commit", "-m", "initial"]);
}

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

async function agentRuntimeBudgetOverrunFixture(input: { roleId: "explorer" | "reviewer"; allowPartialResult: boolean }) {
  const workspacePath = await mkdtemp(join(tmpdir(), `ambient-runtime-subagent-budget-${input.allowPartialResult ? "partial" : "failed"}-`));
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  store.setFeatureFlagSettings({ subagents: true });
  const parent = store.createThread("parent with budgeted child");
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
  const baseRoleProfile = getDefaultSubagentRoleProfile(input.roleId);
  const roleProfileSnapshot = {
    ...baseRoleProfile,
    guardPolicy: {
      ...baseRoleProfile.guardPolicy,
      maxRuntimeMs: 0,
      allowPartialResult: input.allowPartialResult,
    },
  };
  const created = store.createSubagentRun({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    parentMessageId: assistant.id,
    title: "Budgeted child",
    roleId: input.roleId,
    roleProfileSnapshot,
    canonicalTaskPath: `root/0:${input.roleId}`,
    featureFlagSnapshot: featureFlags,
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
    dependencyMode: "required",
  });
  const running = store.markSubagentRunStatus(created.id, "running");
  const waitBarrier = store.createSubagentWaitBarrier({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    childRunIds: [running.id],
    dependencyMode: "required_all",
    failurePolicy: input.allowPartialResult ? "degrade_partial" : "ask_user",
    timeoutMs: 60_000,
  });
  const abort = vi.fn(async () => undefined);
  const emitted: any[] = [];
  const runtimeEvents: any[] = [];
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
  (runtime as any).activeRuns.set(running.childThreadId, {
    abort,
    detach: vi.fn(),
    queue: vi.fn(),
  });
  (runtime as any).subagentChildExecutions.set(running.id, {
    childThreadId: running.childThreadId,
    promise: new Promise<void>(() => undefined),
    startedAt: new Date().toISOString(),
  });

  const waited = await (runtime as any).waitForResolvedSubagentChildRun({
    run: running,
    timeoutMs: 1,
    emitEvent: (event: any) => {
      const persisted = appendMappedSubagentRuntimeEvent(store, {
        run: running,
        source: "wait_agent",
        event,
      });
      runtimeEvents.push(persisted.runtimeEvent);
      return persisted.runEvent;
    },
  });

  return {
    workspacePath,
    store,
    assistant,
    waitBarrier,
    running,
    waited,
    run: store.getSubagentRun(running.id),
    abort,
    emitted,
    runtime,
    runtimeEvents,
    close: async () => {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    },
  };
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
      const getSession = vi.spyOn(runtime as any, "getSession");

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
      const getSessionSpy = vi.spyOn(runtime as any, "getSession");

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
      expect(emitted.map((event) => event.type)).toEqual(expect.arrayContaining([
        "message-created",
        "message-updated",
        "run-status",
        "thread-updated",
      ]));
      expect(emitted.filter((event) => event.type === "run-status").map((event) => event.status)).toEqual([
        "starting",
        "streaming",
        "idle",
      ]);
      expect(runtimeManager.acquire).toHaveBeenCalledWith(expect.objectContaining({
        runtimeId: "local-text-runtime",
        ownerThreadId: thread.id,
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
      }));
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
      const getSessionSpy = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

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
          readSnapshot: () => resolveAmbientFeatureFlags({
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
      });
      const sendSpy = vi.spyOn(runtime as any, "send").mockRejectedValue(new Error("Pi child session should not run."));
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
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
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "system",
        "assistant",
      ]);
      const runUpdates = emitted.filter((event) => event.type === "subagent-run-updated");
      expect(runUpdates.map((event) => event.run.status)).toEqual(expect.arrayContaining(["reserved", "starting", "running", "completed"]));
      expect(runUpdates.at(-1)).toMatchObject({
        type: "subagent-run-updated",
        run: expect.objectContaining({ id: runId, status: "completed" }),
        workspacePath,
      });
      const runEventUpdates = emitted.filter((event) => event.type === "subagent-run-event-created");
      expect(runEventUpdates.map((event) => event.event.type)).toEqual(expect.arrayContaining([
        "subagent.reserved",
        "subagent.spawn_requested",
        "subagent.status_changed",
        "subagent.runtime_event",
        "subagent.local_text_completed",
      ]));
      expect(runEventUpdates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent-run-event-created",
          run: expect.objectContaining({ id: runId }),
          event: expect.objectContaining({ runId, type: "subagent.local_text_completed" }),
          workspacePath,
        }),
      ]));
      expect(emitted).toEqual(expect.arrayContaining([
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
      ]));
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
      expect(runtimeManager.acquire).toHaveBeenCalledWith(expect.objectContaining({
        runtimeId: "local-text-runtime",
        ownerThreadId: run.childThreadId,
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
      }));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(sendSpy).not.toHaveBeenCalled();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("uses structured child JSON when the result status marker is present without a colon", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-malformed-status-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("malformed status sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
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
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "summarizer",
          status: "complete",
          summary: "Live child smoke completed with SUBAGENT_CHILD_DONE.",
          evidence: ["SUBAGENT_CHILD_DONE"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            keyPoints: ["SUBAGENT_CHILD_DONE"],
            sourceRefs: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "SUBAGENT_RESULT_JSON:",
            "```json",
            JSON.stringify(structuredOutput, null, 2),
            "```",
            "SUBAGENT_RESULT_STATUS",
            "The model emitted explanatory prose after a malformed status marker.",
          ].join("\n"),
          metadata: { status: "done" },
        });
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: "Trailing assistant prose should not replace the structured child result.",
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-malformed-status-child", {
        action: "spawn_agent",
        roleId: "summarizer",
        task: "Complete the child smoke result.",
        dependencyMode: "required",
        idempotencyKey: "spawn:malformed-status-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-malformed-status-child", {
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
        resultArtifact: {
          status: "completed",
          structuredOutput: {
            roleId: "summarizer",
            status: "complete",
            summary: "Live child smoke completed with SUBAGENT_CHILD_DONE.",
          },
        },
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.result_ready",
      ]));
      expect(store.listMessages(run.childThreadId).filter((message) => message.metadata?.runtime === "ambient-recovery")).toEqual([]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("recovers missing child result contracts without reusing stale assistant output", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-result-contract-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("result contract follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
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
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (sent.length === 1) {
          store.addMessage({
            threadId: input.threadId,
            role: "assistant",
            content: "I found the requested answer, but forgot the structured result contract.",
            metadata: { status: "done" },
          });
          return;
        }
        if (sent.length === 2) {
          return;
        }
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Recovered the child result contract after a blank recovery turn.",
          evidence: ["The first child answer contained useful prose."],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [{ summary: "The child task result was recovered from the visible transcript.", provenance: ["visible child transcript"] }],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Recovered the missing result contract.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-result-contract-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Answer a bounded question and return the child result contract.",
        dependencyMode: "required",
        idempotencyKey: "spawn:result-contract-followup-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-result-contract-followup-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const contractFollowups = store
        .listSubagentRunEvents(runId)
        .filter((event) => event.type === "subagent.result_contract_followup_required")
        .map((event) => event.preview as { hadAssistantText?: boolean; reason?: string });

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: expect.stringContaining("Sub-agent runtime follow-up: Structured-output role result is missing"),
      });
      expect(sent[1].modelContentOverride).toContain("Do not redo long prose unless required");
      expect(sent[2].modelContentOverride).toContain("The previous turn did not leave a usable assistant answer");
      expect(contractFollowups).toMatchObject([
        { hadAssistantText: true, reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line." },
        { hadAssistantText: false, reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line." },
      ]);
      expect(waited.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("Recovered the missing result contract."),
          structuredOutput: {
            roleId: "explorer",
            status: "complete",
          },
        },
      });
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "user",
        "user",
        "assistant",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("repairs invalid structured child result envelopes before terminal policy failure", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-invalid-structured-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("invalid structured follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
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
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (sent.length === 1) {
          store.addMessage({
            threadId: input.threadId,
            role: "assistant",
            content: [
              "The fixture answer is blue, but this envelope uses the wrong role id.",
              `SUBAGENT_RESULT_JSON: ${JSON.stringify({
                schemaVersion: "ambient-subagent-structured-result-v1",
                roleId: "summarizer",
                status: "complete",
                summary: "The fixture answer is blue.",
                evidence: ["visible child transcript"],
                artifacts: [],
                risks: [],
                nextActions: [],
                roleOutput: {
                  keyPoints: ["The fixture answer is blue."],
                  sourceRefs: ["visible child transcript"],
                },
              })}`,
              "SUBAGENT_RESULT_STATUS: complete",
            ].join("\n"),
            metadata: { status: "done" },
          });
          return;
        }
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Recovered the structured envelope with the correct explorer role.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify({
              schemaVersion: "ambient-subagent-structured-result-v1",
              roleId: "explorer",
              status: "complete",
              summary: "The fixture answer is blue.",
              evidence: ["visible child transcript"],
              artifacts: [],
              risks: [],
              nextActions: [],
              roleOutput: {
                findings: [{ summary: "The fixture answer is blue.", provenance: ["visible child transcript"] }],
                openQuestions: [],
              },
            })}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-invalid-structured-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Answer a bounded fixture question and return the child result contract.",
        dependencyMode: "required",
        idempotencyKey: "spawn:invalid-structured-followup-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-invalid-structured-followup-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const contractFollowups = store
        .listSubagentRunEvents(runId)
        .filter((event) => event.type === "subagent.result_contract_followup_required")
        .map((event) => event.preview as { hadAssistantText?: boolean; reason?: string });

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: expect.stringContaining("Sub-agent runtime follow-up: Structured result roleId must match child role explorer."),
      });
      expect(sent[1].modelContentOverride).toContain("summarize that answer in the structured result");
      expect(contractFollowups).toMatchObject([
        { hadAssistantText: true, reason: "Structured result roleId must match child role explorer." },
      ]);
      expect(waited.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("The fixture answer is blue."),
          structuredOutput: {
            roleId: "explorer",
            status: "complete",
          },
        },
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.result_contract_followup_required",
        "subagent.internal_post_tool_followup_started",
        "subagent.result_ready",
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records terminal evidence when structured child result repair is exhausted", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-structured-repair-exhausted-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("structured repair exhausted sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
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
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
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
            "I keep returning the wrong structured envelope.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify({
              schemaVersion: "ambient-subagent-structured-result-v1",
              roleId: "summarizer",
              status: "complete",
              summary: "The fixture answer is blue.",
              evidence: ["visible child transcript"],
              artifacts: [],
              risks: [],
              nextActions: [],
              roleOutput: {
                keyPoints: ["The fixture answer is blue."],
                sourceRefs: ["visible child transcript"],
              },
            })}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-structured-repair-exhausted-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Answer a bounded fixture question and return the child result contract.",
        dependencyMode: "required",
        idempotencyKey: "spawn:structured-repair-exhausted-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-structured-repair-exhausted-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const eventTypes = store.listSubagentRunEvents(runId).map((event) => event.type);

      expect(sendSpy).toHaveBeenCalledTimes(4);
      expect(sent.slice(1).every((input) => input.delivery === "follow-up")).toBe(true);
      expect(eventTypes.filter((type) => type === "subagent.result_contract_followup_required")).toHaveLength(4);
      expect(eventTypes.filter((type) => type === "subagent.internal_post_tool_followup_started")).toHaveLength(3);
      expect(eventTypes).toEqual(expect.arrayContaining([
        "subagent.result_contract_repair_exhausted",
        "subagent.child_session_failed",
      ]));
      expect(run).toMatchObject({
        status: "failed",
        resultArtifact: {
          status: "failed",
          summary: expect.stringContaining("Ambient exhausted automatic child post-tool finalization follow-ups"),
        },
      });
      expect(waited.details).toMatchObject({
        status: "failed",
        waitSatisfied: true,
        synthesisAllowed: false,
        waitBarrier: {
          status: "failed",
        },
        waitBarrierEvaluation: {
          impossible: true,
          terminalUnsafeChildRunIds: [runId],
        },
        waitBarrierBlockers: [
          expect.objectContaining({
            childRunId: runId,
            blockingState: "terminal_unsafe",
            resultRepairState: expect.objectContaining({
              state: "result_contract_repair_exhausted",
              reason: "Structured result roleId must match child role explorer.",
              maxAttempts: 3,
            }),
          }),
        ],
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("continues a child turn that ends after tool results without a structured result", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-post-tool-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("post-tool follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
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
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (sent.length === 1) {
          store.addMessage({
            threadId: input.threadId,
            role: "assistant",
            content: "I'll inspect the granted file first.",
            metadata: { status: "done" },
          });
          store.addMessage({
            threadId: input.threadId,
            role: "tool",
            content: "read completed\n\nResult\nTEXT_AUTHORITY_OK: native text read is allowed.",
            metadata: {
              status: "done",
              toolName: "read",
              registeredName: "read",
              toolCallId: "call-read-1",
            },
          });
          return;
        }
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Recovered after post-tool follow-up.",
          evidence: ["TEXT_AUTHORITY_OK"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [{ summary: "The granted file was readable.", provenance: ["read tool result"] }],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Recovered after post-tool follow-up.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-post-tool-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Read the granted note and report the result.",
        dependencyMode: "required",
        toolScope: { requestedCategories: ["workspace.read"] },
        idempotencyKey: "spawn:post-tool-followup-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-post-tool-followup-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: expect.stringContaining("Sub-agent runtime follow-up: Child produced tool results"),
      });
      expect(sent[1].modelContentOverride).toContain("Continue from the visible child transcript.");
      expect(sent[1].modelContentOverride).toContain("SUBAGENT_RESULT_STATUS: complete");
      expect(waited.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("Recovered after post-tool follow-up."),
          structuredOutput: {
            roleId: "explorer",
            status: "complete",
          },
        },
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.post_tool_followup_required",
        "subagent.internal_post_tool_followup_started",
        "subagent.result_ready",
      ]));
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "tool",
        "user",
        "assistant",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs an idle Pi child follow-up turn through mailbox delivery and wait", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
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
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        const firstTurn = sent.length === 1;
        const completeSummary = `Inspected restart-smoke fixture. ${"Preserved full child output in the transcript artifact. ".repeat(40)}`;
        const structuredOutput = firstTurn
          ? {
            schemaVersion: "ambient-subagent-structured-result-v1",
            roleId: "explorer",
            status: "needs_attention",
            summary: "Need the parent to pick a fixture.",
            evidence: [],
            artifacts: [],
            risks: [],
            nextActions: ["Send the chosen fixture name as a follow-up."],
            roleOutput: { findings: [], openQuestions: ["Which fixture should I inspect?"] },
          }
          : {
            schemaVersion: "ambient-subagent-structured-result-v1",
            roleId: "explorer",
            status: "complete",
            summary: completeSummary,
            evidence: ["Parent follow-up selected restart-smoke."],
            artifacts: [],
            risks: [],
            nextActions: [],
            roleOutput: { findings: [{ summary: "restart-smoke fixture is ready.", provenance: ["parent follow-up"] }], openQuestions: [] },
          };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            structuredOutput.summary,
            `SUBAGENT_RESULT_STATUS: ${firstTurn ? "needs_attention" : "complete"}`,
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Inspect a fixture after asking the parent which one to use.",
        dependencyMode: "required",
        idempotencyKey: "spawn:agent-runtime-followup",
      });
      const runId = spawned.details.run.id as string;
      const firstWait = await subagentTool.execute("wait-needs-attention", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      expect(firstWait.details).toMatchObject({
        status: "needs_attention",
        synthesisAllowed: false,
        parentResolution: {
          action: "ask_user",
          requiresUserInput: true,
        },
      });

      const followed = await subagentTool.execute("followup-idle-child", {
        action: "followup_agent",
        childRunId: runId,
        message: "Use the restart-smoke fixture.",
        idempotencyKey: "follow:restart-smoke",
      });
      expect(followed.details).toMatchObject({
        status: "queued",
        runtimeFollowup: {
          accepted: true,
        },
      });
      expect(["delivered", "consumed"]).toContain(followed.details.mailboxEvent.deliveryState);

      const secondWait = await subagentTool.execute("wait-followup-complete", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const followupMailbox = store.listSubagentMailboxEvents(runId).find((event) => event.type === "subagent.followup");
      const assistantRuntimeEvents = store
        .listSubagentRunEvents(runId)
        .filter((event) => {
          const preview = event.preview as { type?: string } | undefined;
          return preview?.type === "assistant_delta";
        });

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sendSpy.mock.calls[0]?.[1]).toMatchObject({ awaitInternalRetryCompletion: true });
      expect(sendSpy.mock.calls[1]?.[1]).toMatchObject({ awaitInternalRetryCompletion: true });
      expect(sent[0]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "prompt",
        preserveActiveThread: true,
        internal: true,
      });
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: "Child follow-up: Use the restart-smoke fixture.",
      });
      expect(sent[1].modelContentOverride).toContain("Parent follow-up:");
      expect(sent[1].modelContentOverride).toContain("Use the restart-smoke fixture.");
      expect(sent[1].modelContentOverride).toContain("Ambient sub-agent follow-up turn.");
      expect(sent[1].modelContentOverride).toContain("treat the transcript as authoritative");
      expect(sent[1].modelContentOverride).toContain("- childRunId:");
      expect(sent[1].modelContentOverride).toContain("SUBAGENT_RESULT_JSON:");
      expect(sent[1].modelContentOverride).toContain("SUBAGENT_RESULT_STATUS: complete");
      expect(followupMailbox).toMatchObject({
        type: "subagent.followup",
        direction: "parent_to_child",
        deliveryState: "consumed",
      });
      expect(secondWait.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
        resultValidation: {
          valid: true,
          synthesisAllowed: true,
        },
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("Inspected restart-smoke fixture."),
          structuredOutput: {
            status: "complete",
            roleId: "explorer",
          },
        },
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.followup_child_session_starting",
        "subagent.followup_child_session_started",
        "subagent.followup_consumed",
        "subagent.result_ready",
      ]));
      expect(assistantRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
          preview: expect.objectContaining({
            type: "assistant_delta",
            artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
            textPreview: expect.stringMatching(/\.\.\.$/),
          }),
        }),
      ]));
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "system",
        "user",
        "assistant",
      ]);
      expect(store.listMessages(run.childThreadId)[3]).toMatchObject({
        role: "system",
        metadata: {
          status: "queued",
          mailboxEventId: followupMailbox?.id,
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("prepares an isolated git worktree before starting worker child sessions", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-worker-subagent-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      await initializeGitWorkspace(workspacePath);
      store.openWorkspace(workspacePath);
      const parent = store.createThread("worker sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
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
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: Array<{ input: any; childThread: any }> = [];
      let permissionAuditId: string | undefined;
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        const childThread = store.getThread(input.threadId);
        sent.push({ input, childThread });
        const audit = store.addPermissionAudit({
          threadId: input.threadId,
          permissionMode: childThread.permissionMode,
          toolName: "write",
          risk: "workspace-command",
          decision: "allowed",
          detail: "README.md",
          reason: "Allowed by isolated worker worktree policy.",
          decisionSource: "policy",
        });
        permissionAuditId = audit.id;
        store.addMessage({
          threadId: input.threadId,
          role: "tool",
          content: [
            "write done",
            "",
            "Input",
            JSON.stringify({ path: "README.md", content: "Worker update." }),
            "",
            "Result",
            "Wrote README.md",
          ].join("\n"),
          metadata: {
            status: "done",
            toolCallId: "tool-call-worker",
            toolName: "write",
          },
        });
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "worker",
          status: "complete",
          summary: "Worker completed in the isolated worktree.",
          evidence: ["stubbed worker send"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            changes: ["README.md"],
            validation: ["stubbed"],
            mutationEvidence: [{
              toolCallId: "tool-call-worker",
              path: "README.md",
              category: "workspace.write",
              worktreeIsolated: true,
              worktreePath: childThread.workspacePath,
              approvalId: "approval-worker",
            }],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Worker completed in the isolated worktree.",
            "SUBAGENT_RESULT_STATUS: complete",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-worker-worktree", {
        action: "spawn_agent",
        roleId: "worker",
        task: "Make a scoped README change.",
        idempotencyKey: "spawn:agent-runtime-worker-worktree",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-worker-worktree", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const childThread = store.getThread(run.childThreadId);
      const [toolScopeSnapshot] = store.listSubagentToolScopeSnapshots(runId);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0]?.[1]).toMatchObject({ awaitInternalRetryCompletion: true });
      expect(sent[0]).toMatchObject({
        input: {
          threadId: run.childThreadId,
          permissionMode: childThread.permissionMode,
          model: run.modelRuntimeSnapshot.profile.modelId,
          preserveActiveThread: true,
          internal: true,
        },
        childThread: {
          id: run.childThreadId,
          workspacePath: childThread.workspacePath,
          gitWorktree: expect.objectContaining({
            status: "active",
            worktreePath: childThread.workspacePath,
          }),
        },
      });
      expect(childThread.workspacePath).not.toBe(workspacePath);
      expect(childThread.gitWorktree).toMatchObject({
        threadId: run.childThreadId,
        projectRoot: workspacePath,
        worktreePath: childThread.workspacePath,
        status: "active",
      });
      expect(toolScopeSnapshot.scope).toMatchObject({
        worktreeIsolated: true,
        loadedCategories: expect.arrayContaining(["workspace.write", "artifact.write"]),
        deniedCategories: [],
      });
      expect(waited.details).toMatchObject({
        status: "completed",
        synthesisAllowed: true,
        resultValidation: {
          completionGuardValidation: {
            valid: true,
            synthesisAllowed: true,
            ambientEvidenceCount: 1,
            isolatedWorktreeEvidenceCount: 1,
            approvalEvidenceCount: 1,
          },
        },
      });
      expect(store.listSubagentRunEvents(runId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.runtime_event",
          preview: expect.objectContaining({
            type: "tool_result",
            source: "child_runtime",
            runId,
            childThreadId: run.childThreadId,
            toolName: "write",
            details: expect.objectContaining({
              status: "done",
              toolCallId: "tool-call-worker",
              category: "workspace.write",
              path: "README.md",
              worktreeIsolated: true,
              worktreePath: childThread.workspacePath,
              approvalId: permissionAuditId,
              approvalSource: "policy",
            }),
          }),
        }),
      ]));
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.worktree_prepared",
        "subagent.spawn_requested",
        "subagent.child_session_starting",
      ]));
      expect(spawned.details).toMatchObject({
        childWorktree: {
          threadId: run.childThreadId,
          status: "active",
          worktreePath: childThread.workspacePath,
        },
        toolScopeSnapshot: {
          worktreeIsolated: true,
          loadedCategories: expect.arrayContaining(["workspace.write", "artifact.write"]),
        },
      });
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "thread-updated",
          thread: expect.objectContaining({
            id: run.childThreadId,
            workspacePath: childThread.workspacePath,
            gitWorktree: expect.objectContaining({ status: "active" }),
          }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not abort an active child only because the role runtime budget elapsed when partial output is allowed", async () => {
    const fixture = await agentRuntimeBudgetOverrunFixture({ roleId: "explorer", allowPartialResult: true });
    try {
      expect(fixture.waited).toMatchObject({
        timedOut: false,
        outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
        run: {
          status: "running",
        },
      });
      expect(fixture.run).toMatchObject({
        status: "running",
      });
      expect(fixture.run.resultArtifact).toBeUndefined();
      expect(fixture.abort).not.toHaveBeenCalled();
      expect((fixture.runtime as any).activeRuns.has(fixture.running.childThreadId)).toBe(true);
      expect(fixture.runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "status",
          source: "wait_agent",
          status: "running",
          message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
          details: expect.objectContaining({
            childRunId: fixture.running.id,
            childThreadId: fixture.running.childThreadId,
            waitTimeoutMs: 1,
            childIdleTimeoutMs: 600_000,
            childHardTimeoutMs: 600_000,
            lastChildActivityAt: expect.any(String),
            lastChildActivitySource: expect.any(String),
          }),
        }),
      ]));
      expect(fixture.store.listSubagentMailboxEvents(fixture.running.id)).toEqual([]);
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.running.parentRunId)).toEqual([]);
      expect(fixture.emitted).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent-parent-mailbox-event-updated" }),
        expect.objectContaining({ type: "run-status", threadId: fixture.running.childThreadId, status: "idle" }),
      ]));
    } finally {
      await fixture.close();
    }
  });

  it("emits wait heartbeats while a live child runtime is still pending", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-wait-heartbeat-"));
    const store = new ProjectStore();
    store.openWorkspace(workspacePath);
    try {
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent waiting on child heartbeat");
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
      const baseRoleProfile = getDefaultSubagentRoleProfile("explorer");
      const roleProfileSnapshot = {
        ...baseRoleProfile,
        guardPolicy: {
          ...baseRoleProfile.guardPolicy,
          maxRuntimeMs: 120_000,
        },
      };
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Heartbeat child",
        roleId: "explorer",
        roleProfileSnapshot,
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
      try {
        (runtime as any).subagentChildExecutions.set(running.id, {
          childThreadId: running.childThreadId,
          promise: new Promise<void>(() => undefined),
          startedAt: "2026-06-05T00:00:00.000Z",
        });

        const waitedPromise = (runtime as any).waitForResolvedSubagentChildRun({
          run: running,
          timeoutMs: 35_000,
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

        await vi.advanceTimersByTimeAsync(15_000);
        await vi.advanceTimersByTimeAsync(15_000);
        await vi.advanceTimersByTimeAsync(5_000);
        const waited = await waitedPromise;

        expect(waited).toMatchObject({
          timedOut: false,
          outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
          run: {
            id: running.id,
            status: "running",
          },
        });
        expect(runtimeEvents).toEqual(expect.arrayContaining([
          expect.objectContaining({
            type: "status",
            source: "wait_agent",
            status: "running",
            message: "wait_agent is still waiting on the live child runtime.",
            details: expect.objectContaining({
              childRunId: running.id,
              childThreadId: running.childThreadId,
              waitElapsedMs: 15_000,
            }),
          }),
          expect.objectContaining({
            type: "status",
            source: "wait_agent",
            status: "running",
            message: "wait_agent is still waiting on the live child runtime.",
            details: expect.objectContaining({
              waitElapsedMs: 30_000,
            }),
          }),
          expect.objectContaining({
            type: "status",
            source: "wait_agent",
            status: "running",
            message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
          }),
        ]));
      } finally {
        vi.useRealTimers();
      }
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not abort an active child only because the role runtime budget elapsed when partial output is forbidden", async () => {
    const fixture = await agentRuntimeBudgetOverrunFixture({ roleId: "reviewer", allowPartialResult: false });
    try {
      expect(fixture.waited).toMatchObject({
        timedOut: false,
        outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
        run: {
          status: "running",
        },
      });
      expect(fixture.run).toMatchObject({
        status: "running",
      });
      expect(fixture.run.resultArtifact).toBeUndefined();
      expect(fixture.abort).not.toHaveBeenCalled();
      expect((fixture.runtime as any).activeRuns.has(fixture.running.childThreadId)).toBe(true);
      expect(fixture.runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "status",
          source: "wait_agent",
          status: "running",
          message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
          details: expect.objectContaining({
            childRunId: fixture.running.id,
            childThreadId: fixture.running.childThreadId,
            waitTimeoutMs: 1,
            childIdleTimeoutMs: 600_000,
            childHardTimeoutMs: 600_000,
            lastChildActivityAt: expect.any(String),
            lastChildActivitySource: expect.any(String),
          }),
        }),
      ]));
      expect(fixture.store.listSubagentMailboxEvents(fixture.running.id)).toEqual([]);
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.running.parentRunId)).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it("settles a child only after the child activity idle timeout elapses with liveness evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-idle-timeout-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with idle child");
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
      const baseRoleProfile = getDefaultSubagentRoleProfile("reviewer");
      const roleProfileSnapshot = {
        ...baseRoleProfile,
        guardPolicy: {
          ...baseRoleProfile.guardPolicy,
          maxRuntimeMs: 20 * 60_000,
          allowPartialResult: false,
        },
      };
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Idle child",
        roleId: "reviewer",
        roleProfileSnapshot,
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [running.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 12 * 60_000,
      });
      const abort = vi.fn(async () => undefined);
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      (runtime as any).activeRuns.set(running.childThreadId, {
        abort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).subagentChildExecutions.set(running.id, {
        childThreadId: running.childThreadId,
        promise: new Promise<void>(() => undefined),
        startedAt: "2026-06-05T00:00:00.000Z",
      });

      const waitedPromise = (runtime as any).waitForResolvedSubagentChildRun({
        run: running,
        timeoutMs: 12 * 60_000,
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

      await vi.advanceTimersByTimeAsync(10 * 60_000);
      const waited = await waitedPromise;

      expect(waited).toMatchObject({
        timedOut: true,
        outcome: { kind: "child_runtime_timeout", reason: "runtime_idle_timeout" },
        run: {
          id: running.id,
          status: "timed_out",
          resultArtifact: expect.objectContaining({
            status: "timed_out",
            partial: false,
          }),
        },
      });
      expect(abort).toHaveBeenCalledTimes(1);
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          source: "child_runtime",
          status: "timed_out",
          artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          details: expect.objectContaining({
            reason: "runtime_idle_timeout",
            maxRuntimeMs: 600_000,
            idleElapsedMs: 600_000,
            elapsedMs: 600_000,
            lastChildActivityAt: "2026-06-05T00:00:00.000Z",
            lastChildActivitySource: expect.any(String),
          }),
        }),
      ]));
      expect(store.listSubagentMailboxEvents(running.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_idle_timeout",
            idleElapsedMs: 600_000,
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(running.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.runtime_idle_timeout",
          preview: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_idle_timeout",
            maxRuntimeMs: 600_000,
            idleElapsedMs: 600_000,
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]));
      expect(store.listSubagentParentMailboxEventsForParentRun(running.parentRunId)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: running.id,
            childThreadId: running.childThreadId,
            previousStatus: "running",
            status: "timed_out",
            source: "runtime_idle_timeout",
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("settles an active child at the hard cap even when recent activity prevents idle timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-hard-cap-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with hard-cap child");
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
      const baseRoleProfile = getDefaultSubagentRoleProfile("reviewer");
      const roleProfileSnapshot = {
        ...baseRoleProfile,
        guardPolicy: {
          ...baseRoleProfile.guardPolicy,
          maxRuntimeMs: 10 * 60_000,
          allowPartialResult: false,
        },
      };
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Hard cap child",
        roleId: "reviewer",
        roleProfileSnapshot,
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [running.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 12 * 60_000,
      });
      const abort = vi.fn(async () => undefined);
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      (runtime as any).activeRuns.set(running.childThreadId, {
        abort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).subagentChildExecutions.set(running.id, {
        childThreadId: running.childThreadId,
        promise: new Promise<void>(() => undefined),
        startedAt: "2026-06-05T00:00:00.000Z",
      });

      vi.setSystemTime(new Date("2026-06-05T00:09:59.000Z"));
      const activityMessage = store.addMessage({
        threadId: running.childThreadId,
        role: "assistant",
        content: "Still working with fresh activity before the hard cap.",
      });

      const waitedPromise = (runtime as any).waitForResolvedSubagentChildRun({
        run: running,
        timeoutMs: 12 * 60_000,
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

      await vi.advanceTimersByTimeAsync(1_000);
      const waited = await waitedPromise;

      expect(waited).toMatchObject({
        timedOut: true,
        outcome: { kind: "child_runtime_timeout", reason: "runtime_hard_cap_exceeded" },
        run: {
          id: running.id,
          status: "timed_out",
          resultArtifact: expect.objectContaining({
            status: "timed_out",
            partial: false,
          }),
        },
      });
      expect(abort).toHaveBeenCalledTimes(1);
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          source: "child_runtime",
          status: "timed_out",
          artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          details: expect.objectContaining({
            reason: "runtime_hard_cap_exceeded",
            maxRuntimeMs: 600_000,
            elapsedMs: 600_000,
            idleElapsedMs: 1_000,
            lastChildActivityAt: "2026-06-05T00:09:59.000Z",
            lastChildActivitySource: "message:assistant",
            lastChildActivityDetail: `message ${activityMessage.id}`,
          }),
        }),
      ]));
      expect(store.listSubagentMailboxEvents(running.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_hard_cap_exceeded",
            elapsedMs: 600_000,
            idleElapsedMs: 1_000,
            lastChildActivityAt: "2026-06-05T00:09:59.000Z",
            lastChildActivitySource: "message:assistant",
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(running.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.runtime_hard_cap_exceeded",
          preview: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_hard_cap_exceeded",
            maxRuntimeMs: 600_000,
            elapsedMs: 600_000,
            idleElapsedMs: 1_000,
            lastChildActivityAt: "2026-06-05T00:09:59.000Z",
            lastChildActivitySource: "message:assistant",
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]));
      expect(store.listSubagentParentMailboxEventsForParentRun(running.parentRunId)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: running.id,
            childThreadId: running.childThreadId,
            previousStatus: "running",
            status: "timed_out",
            source: "runtime_hard_cap_exceeded",
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

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
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(),
          denyThread: () => undefined,
          listPending: () => [pendingPermission],
        },
      );
      (runtime as any).subagentChildExecutions.set(running.id, {
        childThreadId: running.childThreadId,
        promise: new Promise<void>(() => undefined),
        startedAt: "2026-06-06T00:00:00.000Z",
      });

      const waited = await (runtime as any).waitForResolvedSubagentChildRun({
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
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(),
          denyThread: () => undefined,
          listPending: () => pendingPermissions,
          respond,
        },
      );
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
        await new Promise<void>(() => undefined);
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-native-approval-roundtrip", {
        action: "spawn_agent",
        roleId: "summarizer",
        task: "Wait for a native child approval prompt before continuing.",
        dependencyMode: "required",
        forkMode: "no_history",
        promptMode: "fresh",
        toolScope: { requestedCategories: ["artifact.read"] },
        idempotencyKey: "spawn:native-approval-roundtrip",
      });
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
        new Promise((_, reject) => setTimeout(
          () => reject(new Error(`Child permission roundtrip send did not start: ${JSON.stringify(spawned.details)}`)),
          1_000,
        )),
      ]);

      const waited = await subagentTool.execute("wait-native-approval-roundtrip", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
        idempotencyKey: "wait:native-approval-roundtrip-request",
      });

      expect(waited.details).toMatchObject({
        status: "needs_attention",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice: "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
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
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(expect.arrayContaining([
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
      ]));

      const decision = resolveSubagentApprovalDecision(store, {
        childRunId: runId,
        approvalId: "permission-child-write",
        decision: "approved",
        requestedScope: "this_child_thread",
        userDecision: "Approve this child write for the rest of this child thread.",
      }, { now: "2026-06-06T00:01:00.000Z" });

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

      const resumed = await subagentTool.execute("wait-native-approval-response-roundtrip", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
        idempotencyKey: "wait:native-approval-roundtrip-response",
      });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(respond).toHaveBeenCalledWith("permission-child-write", "always_thread");
      expect(permissionResponses).toEqual([
        { id: "permission-child-write", response: "always_thread" },
      ]);
      expect(pendingPermissions).toEqual([]);
      expect(resumed.details).toMatchObject({
        status: "running",
        waitSatisfied: false,
        waitTimedOut: false,
        waitSessionExpired: true,
        waitOutcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
        synthesisAllowed: false,
        waitNotice: "Child approval response was delivered to the child runtime; the parent remains blocked until the child reaches a synthesis-safe result.",
        parentResolution: {
          status: "blocked",
          action: "wait_for_child",
          canSynthesize: false,
          requiresUserInput: false,
          childRunId: runId,
          childStatus: "running",
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
            message: "Child approval response was delivered and the parent remains blocked until the child completes or needs more attention.",
          },
        ],
      });
      expect(store.getSubagentRun(runId).status).toBe("running");
      expect(store.listSubagentRunEvents(runId)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent.approval_requested" }),
        expect.objectContaining({ type: "subagent.child_approval_forwarded" }),
        expect.objectContaining({ type: "subagent.approval_response.consumed" }),
      ]));
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          parentRunId: parentRun.id,
          childRunIds: [runId],
          status: "waiting_on_children",
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

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
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
      );
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
      (runtime as any).createSubagentToolExtension(parent.id)({
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
      expect(resolveSubagentChildActiveToolNames({
        subagentToolScopeSnapshots: snapshots,
      })).toEqual([
        "web_research_status",
        "web_research_search",
        "web_research_fetch",
      ]);
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
      const requestPermission = vi.fn((
        input: Omit<PermissionRequest, "id">,
        options?: { onRequest?: (request: PermissionRequest) => void },
      ) => new Promise<{ allowed: boolean; mode: any }>((resolve) => {
        const request = { ...input, id: "permission-child-browser" };
        pendingPermissions.push(request);
        permissionResolvers.set(request.id, resolve);
        options?.onRequest?.(request);
        resolveBrowserPromptStarted();
      }));
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
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: requestPermission,
          denyThread: () => undefined,
          listPending: () => pendingPermissions,
          respond,
        },
      );
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
      (runtime as any).createSubagentToolExtension(parent.id)({
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
        new Promise<any>((_, reject) => setTimeout(
          () => reject(new Error(`Browser approval spawn did not return: ${JSON.stringify({
            parentRun,
            runs: store.listSubagentRunsForParentThread(parent.id),
          })}`)),
          1_000,
        )),
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

      const browserPermissionPromise = (runtime as any).resolveToolCallPermission(
        run.childThreadId,
        store.getWorkspace(),
        "browser_content",
        { url: "https://ambient.test/current-child-browser-approval-behavior" },
      ) as Promise<{ reason: string } | undefined>;
      await Promise.race([
        browserPromptStarted,
        new Promise((_, reject) => setTimeout(
          () => reject(new Error(`Browser approval prompt did not start: ${JSON.stringify({
            run: store.getSubagentRun(run.id),
            snapshots: store.listSubagentToolScopeSnapshots(run.id),
            pendingPermissions,
          })}`)),
          1_000,
        )),
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
        new Promise<any>((_, reject) => setTimeout(
          () => reject(new Error(`Browser approval wait did not return: ${JSON.stringify({
            run: store.getSubagentRun(run.id),
            pendingPermissions,
            parentMailbox: store.listSubagentParentMailboxEventsForParentRun(parentRun.id),
            runEvents: store.listSubagentRunEvents(run.id).map((event) => event.type),
          })}`)),
          1_000,
        )),
      ]);

      expect(waited.details).toMatchObject({
        status: "needs_attention",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice: "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
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
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(expect.arrayContaining([
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
      ]));

      const decision = resolveSubagentApprovalDecision(store, {
        childRunId: run.id,
        approvalId: "permission-child-browser",
        decision: "approved",
        requestedScope: "this_child_thread",
        userDecision: "Approve child browser content for the rest of this child thread.",
      }, { now: "2026-06-06T00:02:00.000Z" });

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
        new Promise<any>((_, reject) => setTimeout(
          () => reject(new Error(`Browser approval response wait did not return: ${JSON.stringify({
            run: store.getSubagentRun(run.id),
            pendingPermissions,
            parentMailbox: store.listSubagentParentMailboxEventsForParentRun(parentRun.id),
            childMailbox: store.listSubagentMailboxEvents(run.id),
            runEvents: store.listSubagentRunEvents(run.id).map((event) => event.type),
          })}`)),
          1_000,
        )),
      ]);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(respond).toHaveBeenCalledWith("permission-child-browser", "always_thread");
      expect(permissionResponses).toEqual([
        { id: "permission-child-browser", response: "always_thread" },
      ]);
      expect(pendingPermissions).toEqual([]);
      await expect(Promise.race([
        browserPermissionPromise,
        new Promise((_, reject) => setTimeout(
          () => reject(new Error(`Browser permission promise did not resolve: ${JSON.stringify({
            run: store.getSubagentRun(run.id),
            pendingPermissions,
            permissionResponses,
          })}`)),
          1_000,
        )),
      ])).resolves.toBeUndefined();
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
      expect(store.listSubagentRunEvents(run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent.approval_requested" }),
        expect.objectContaining({ type: "subagent.child_approval_forwarded" }),
        expect.objectContaining({ type: "subagent.approval_response.consumed" }),
      ]));
      await Promise.resolve();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("refuses direct child runtime starts when ambient.subagents is disabled", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-flag-start-"));
    const store = new ProjectStore();
    const runtimeEvents: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with disabled runtime start");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const role = getDefaultSubagentRoleProfile("explorer");
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Disabled child",
        roleId: role.id,
        roleProfileSnapshot: role,
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.setFeatureFlagSettings({ subagents: false });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const started = await (runtime as any).startResolvedSubagentChildRun({
        parentThread: parent,
        run: created,
        task: "This should not start while the feature flag is off.",
        role,
        dependencyMode: "required",
        forkMode: "no_history",
        promptMode: "fresh",
        toolScope: {} as any,
        toolScopeSnapshot: {} as any,
        turnBudgetPolicy: {} as any,
        idempotencyKey: "start:disabled-feature",
        emitEvent: (event: any) => {
          runtimeEvents.push(event);
          return {} as any;
        },
      });

      expect(started).toMatchObject({
        started: false,
        message: "ambient.subagents is disabled; refusing to start sub-agent child runtime.",
        run: {
          id: created.id,
          status: "failed",
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: created.id,
            status: "failed",
            partial: false,
            summary: "ambient.subagents is disabled; refusing to start sub-agent child runtime.",
            childThreadId: created.childThreadId,
          },
        },
      });
      expect(runtimeEvents).toEqual([
        expect.objectContaining({
          type: "error",
          source: "child_runtime",
          status: "failed",
          message: "ambient.subagents is disabled; refusing to start sub-agent child runtime.",
          details: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            featureFlagSnapshot: expect.objectContaining({
              flags: expect.objectContaining({
                [AMBIENT_SUBAGENTS_FEATURE_FLAG]: expect.objectContaining({ enabled: false }),
              }),
            }),
          }),
        }),
      ]);
      expect(store.listSubagentMailboxEvents(created.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "failed",
            reason: "ambient_subagents_disabled",
            childThreadId: created.childThreadId,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(created.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent.status_changed" }),
        expect.objectContaining({ type: "subagent.lifecycle_stopped" }),
        expect.objectContaining({
          type: "subagent.child_runtime_refused",
          preview: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            idempotencyKey: "start:disabled-feature",
          }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps followups and approval responses queued when ambient.subagents is disabled", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-flag-mailbox-"));
    const store = new ProjectStore();
    const runtimeEvents: any[] = [];
    const respond = vi.fn();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with disabled child mailbox");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const role = getDefaultSubagentRoleProfile("reviewer");
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Mailbox child",
        roleId: role.id,
        roleProfileSnapshot: role,
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const waiting = store.markSubagentRunStatus(created.id, "waiting");
      const followupMailbox = store.appendSubagentMailboxEvent(waiting.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Please inspect the retry path." },
      });
      const approvalMailbox = store.appendSubagentMailboxEvent(waiting.id, {
        direction: "parent_to_child",
        type: "subagent.approval_response",
        payload: { approvalId: "approval-disabled", decision: "approved", effectiveScope: "this_child_thread" },
      });
      store.setFeatureFlagSettings({ subagents: false });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
        listPending: () => [{
          id: "approval-disabled",
          threadId: waiting.childThreadId,
          toolName: "read",
          title: "Allow child read?",
          message: "The child wants to read a file.",
          risk: "workspace-command",
        }],
        respond,
      });
      const markFollowupDelivered = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(followupMailbox.id, "delivered"));
      const markFollowupConsumed = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(followupMailbox.id, "consumed"));
      const markApprovalDelivered = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(approvalMailbox.id, "delivered"));
      const markApprovalConsumed = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(approvalMailbox.id, "consumed"));
      const emitEvent = (event: any) => {
        runtimeEvents.push(event);
        return {} as any;
      };

      const followup = await (runtime as any).followupResolvedSubagentChildRun({
        run: waiting,
        message: "Please inspect the retry path.",
        mailboxEvent: followupMailbox,
        idempotencyKey: "followup:disabled-feature",
        emitEvent,
        markMailboxDelivered: markFollowupDelivered,
        markMailboxConsumed: markFollowupConsumed,
      });
      const approval = await (runtime as any).resolveResolvedSubagentChildApprovalResponse({
        run: waiting,
        mailboxEvent: approvalMailbox,
        approvalId: "approval-disabled",
        decision: "approved",
        effectiveScope: "this_child_thread",
        idempotencyKey: "approval:disabled-feature",
        emitEvent,
        markMailboxDelivered: markApprovalDelivered,
        markMailboxConsumed: markApprovalConsumed,
      });

      expect(followup).toMatchObject({
        accepted: false,
        message: "ambient.subagents is disabled; refusing to deliver sub-agent follow-up. The follow-up remains queued.",
        mailboxEvent: {
          id: followupMailbox.id,
          deliveryState: "queued",
        },
      });
      expect(approval).toMatchObject({
        accepted: false,
        message: "ambient.subagents is disabled; refusing to deliver child approval response. The approval response remains queued.",
        mailboxEvent: {
          id: approvalMailbox.id,
          deliveryState: "queued",
        },
      });
      expect(markFollowupDelivered).not.toHaveBeenCalled();
      expect(markFollowupConsumed).not.toHaveBeenCalled();
      expect(markApprovalDelivered).not.toHaveBeenCalled();
      expect(markApprovalConsumed).not.toHaveBeenCalled();
      expect(respond).not.toHaveBeenCalled();
      expect(store.getSubagentMailboxEvent(followupMailbox.id).deliveryState).toBe("queued");
      expect(store.getSubagentMailboxEvent(approvalMailbox.id).deliveryState).toBe("queued");
      expect(store.getSubagentRun(waiting.id).status).toBe("waiting");
      expect(runtimeEvents).toEqual([
        expect.objectContaining({
          type: "status",
          source: "followup_agent",
          status: "waiting",
          details: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: followupMailbox.id,
          }),
        }),
        expect.objectContaining({
          type: "status",
          source: "approval_response",
          status: "waiting",
          details: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: approvalMailbox.id,
            approvalId: "approval-disabled",
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(waiting.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.followup_refused",
          preview: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: followupMailbox.id,
            idempotencyKey: "followup:disabled-feature",
          }),
        }),
        expect.objectContaining({
          type: "subagent.approval_response.refused",
          preview: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: approvalMailbox.id,
            approvalId: "approval-disabled",
            effectiveScope: "this_child_thread",
            idempotencyKey: "approval:disabled-feature",
          }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("stops only the selected child thread and returns a structured cancellation result to the parent", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-child-stop-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent");
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
        title: "Required child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const sibling = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Sibling child",
        roleId: "summarizer",
        canonicalTaskPath: "root/1:summarizer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.markSubagentRunStatus(child.id, "running");
      store.markSubagentRunStatus(sibling.id, "running");
      store.appendSubagentMailboxEvent(child.id, {
        direction: "parent_to_child",
        type: "subagent.task",
        payload: { task: "Inspect this branch." },
      });
      store.appendSubagentMailboxEvent(child.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Also check restart recovery." },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      const childAbort = vi.fn(async () => undefined);
      const siblingAbort = vi.fn(async () => undefined);
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
      (runtime as any).activeRuns.set(child.childThreadId, {
        abort: childAbort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).activeRuns.set(sibling.childThreadId, {
        abort: siblingAbort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).activeRunIds.set(child.childThreadId, "child-runtime-run");
      (runtime as any).activeRunIds.set(sibling.childThreadId, "sibling-runtime-run");

      await runtime.abort(child.childThreadId);

      expect(childAbort).toHaveBeenCalledTimes(1);
      expect(siblingAbort).not.toHaveBeenCalled();
      expect((runtime as any).activeRuns.has(child.childThreadId)).toBe(false);
      expect((runtime as any).activeRuns.has(sibling.childThreadId)).toBe(true);
      expect((runtime as any).activeRunIds.has(child.childThreadId)).toBe(false);
      expect((runtime as any).activeRunIds.has(sibling.childThreadId)).toBe(true);
      expect(store.getSubagentRun(child.id)).toMatchObject({
        status: "cancelled",
        resultArtifact: {
          status: "cancelled",
          partial: false,
          summary: "Sub-agent child thread stopped by user.",
          childThreadId: child.childThreadId,
        },
      });
      expect(store.getSubagentRun(sibling.id).status).toBe("running");
      expect(store.getThread(child.childThreadId).childStatus).toBe("cancelled");
      expect(store.getThread(sibling.childThreadId).childStatus).toBe("running");
      expect(store.listSubagentMailboxEvents(child.id)).toHaveLength(3);
      expect(store.listSubagentMailboxEvents(child.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.task",
          direction: "parent_to_child",
          deliveryState: "cancelled",
        }),
        expect.objectContaining({
          type: "subagent.followup",
          direction: "parent_to_child",
          deliveryState: "cancelled",
        }),
        expect.objectContaining({
          type: "subagent.cancelled",
          direction: "child_to_parent",
          payload: expect.objectContaining({
            status: "cancelled",
            source: "child_stop",
            childThreadId: child.childThreadId,
          }),
        }),
      ]));
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "cancelled",
        resolutionArtifact: expect.objectContaining({
          synthesisAllowed: false,
          childStatuses: [{ childRunId: child.id, status: "cancelled" }],
          transitionEvidence: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_cancelled",
            source: "cancel_agent",
            childRunId: child.id,
            reason: "Sub-agent child thread stopped by user.",
            idempotencyKey: `direct-child-stop:${child.id}`,
          }),
          waitBarrierEvaluation: expect.objectContaining({
            synthesisAllowed: false,
            terminalUnsafeChildRunIds: [child.id],
          }),
          resultArtifact: expect.objectContaining({
            status: "cancelled",
            summary: "Sub-agent child thread stopped by user.",
          }),
        }),
      });
      expect(store.listSubagentRunEvents(child.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.child_stopped",
          preview: expect.objectContaining({
            previousStatus: "running",
            source: "direct_child_stop",
            cancelledMailboxEvents: expect.arrayContaining([
              expect.objectContaining({ type: "subagent.task", deliveryState: "cancelled" }),
              expect.objectContaining({ type: "subagent.followup", deliveryState: "cancelled" }),
            ]),
          }),
        }),
      ]));
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            parentMessageId: assistant.id,
            childRunId: child.id,
            childThreadId: child.childThreadId,
            previousStatus: "running",
            status: "cancelled",
            source: "direct_child_stop",
            waitBarrierIds: [barrier.id],
            resultArtifact: expect.objectContaining({
              status: "cancelled",
              partial: false,
            }),
          }),
        }),
      ]);
      expect(store.listMessages(child.childThreadId)).toEqual([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("Sub-agent stopped by user."),
          metadata: expect.objectContaining({
            status: "cancelled",
            subagentRunId: child.id,
          }),
        }),
      ]);
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent-run-updated",
          run: expect.objectContaining({ id: child.id, status: "cancelled" }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-wait-barrier-updated",
          barrier: expect.objectContaining({ id: barrier.id, status: "cancelled" }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-parent-mailbox-event-updated",
          mailboxEvent: expect.objectContaining({
            type: "subagent.lifecycle_interrupted",
            parentMessageId: assistant.id,
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            threadId: parent.id,
            message: expect.stringContaining("sibling children continue"),
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "run-status",
          threadId: child.childThreadId,
          status: "idle",
          workspacePath,
        }),
      ]));
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

function normalizedIsoFromEnv(value: string | undefined, name: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be an ISO timestamp when supplied.`);
  }
  return date.toISOString();
}

describeNative("AgentRuntime messaging gateway tools", () => {
  const itManualTelegramGuidedOwnerLoopSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE === "1" ? it : it.skip;
  const itManualTelegramOwnerLoopSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SMOKE === "1" ? it : it.skip;

  itManualTelegramGuidedOwnerLoopSmoke("manual guided Telegram owner loop smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const setupCode = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE?.trim();
    const directoryQuery = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const directoryLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "10");
    const pollLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT ?? "10");
    const waitSeconds = Number(process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_WAIT_SECONDS ?? "180");
    const pollIntervalMs = Number(process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLL_INTERVAL_MS ?? "5000");
    const waitMs = Math.max(1_000, Number.isFinite(waitSeconds) ? waitSeconds * 1_000 : 180_000);
    const intervalMs = Math.max(500, Number.isFinite(pollIntervalMs) ? pollIntervalMs : 5_000);
    const usePollingRunner = process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER === "1";
    const commandText = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT?.trim()
      || "switch project Manual Relay Smoke";
    const commandNotBefore = normalizedIsoFromEnv(
      process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE,
      "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE",
    );
    const sendReply = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY === "1";
    const ownerLoopOutputPath = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_OUTPUT_PATH?.trim();
    if (
      !profileId ||
      !stateRoot ||
      !conversationId ||
      !setupCode ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()
    ) {
      throw new Error(manualTelegramGuidedOwnerLoopSmokeChecklist({
        profileId,
        stateRoot,
        conversationId,
        setupCode,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-guided-loop-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    let bindingId: string | undefined;
    let pollingRunnerStarted = false;
    let currentStep = "configured";
    const setupCodePreview = setupCode.length <= 16 ? setupCode : `${setupCode.slice(0, 8)}...${setupCode.slice(-4)}`;
    const compactPollingStatus = (status: any) => ({
      state: status?.state,
      running: status?.running,
      totalPollCount: status?.totalPollCount,
      successfulPollCount: status?.successfulPollCount,
      failedPollCount: status?.failedPollCount,
      fetchedMessageCount: status?.fetchedMessageCount,
      candidateMessageCount: status?.candidateMessageCount,
      duplicateMessageCount: status?.duplicateMessageCount,
      staleMessageCount: status?.staleMessageCount,
      acceptedDispatchCount: status?.acceptedDispatchCount,
      droppedDispatchCount: status?.droppedDispatchCount,
      lastSuccessfulPollAt: status?.lastSuccessfulPollAt,
      nextPollDueAt: status?.nextPollDueAt,
      lastError: status?.lastError,
    });
    const compactActivationPlan = (details: any) => ({
      status: details?.status,
      recommendedNextTool: details?.recommendedNextTool,
      selectedProfileId: details?.selectedProfileId,
      selectedConversationId: details?.selectedConversationId,
      selectedBindingId: details?.selectedBinding?.bindingId,
      pollingState: details?.polling?.state,
      pollingRunning: details?.polling?.running,
      phaseStatuses: Array.isArray(details?.phases)
        ? details.phases.map((phase: any) => ({
          id: phase.id,
          status: phase.status,
          toolSequence: phase.toolSequence,
        }))
        : [],
    });
    let activationPlanInitialSummary: ReturnType<typeof compactActivationPlan> | undefined;
    let activationPlanAfterBindingSummary: ReturnType<typeof compactActivationPlan> | undefined;
    const writeGuidedOutput = async (patch: Record<string, unknown>) => {
      if (!ownerLoopOutputPath) return;
      let existing: Record<string, unknown> = {};
      try {
        existing = JSON.parse(await readFile(ownerLoopOutputPath, "utf8"));
      } catch {
        existing = {};
      }
      await writeFile(ownerLoopOutputPath, JSON.stringify({
        generatedAt: existing.generatedAt ?? new Date().toISOString(),
        profileId,
        conversationId,
        setupCodePreview,
        commandText,
        sendReply,
        privacy: {
          providerMessageBodiesReturned: false,
          providerHistoryRead: false,
        },
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
    };
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual guided Telegram owner loop smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_poll_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_polling_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply" ||
            (sendReply && request.toolName === "ambient_messaging_telegram_bridge_reply_apply")
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual guided Telegram owner-loop permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      }, manualTelegramOwnerLoopProjectFeatures(workspacePath));
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (registeredTool: any) => registeredTools.push(registeredTool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      currentStep = "activation_plan_initial";
      await writeGuidedOutput({
        status: "running",
        currentStep,
        waitMs,
        intervalMs,
        usePollingRunner,
      });
      const activationPlanInitial = await tool("ambient_messaging_telegram_owner_loop_activation_plan").execute("manual-guided-owner-loop-activation-plan-initial", {
        profileId,
        conversationId,
        setupCode,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
        intervalMs: Math.max(5_000, intervalMs),
        ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
      });
      expect(activationPlanInitial.details.toolName).toBe("ambient_messaging_telegram_owner_loop_activation_plan");
      expect(Array.isArray(activationPlanInitial.details.phases)).toBe(true);
      activationPlanInitialSummary = compactActivationPlan(activationPlanInitial.details);
      await writeGuidedOutput({
        currentStep,
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
        },
      });

      currentStep = "starting_gateway";
      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-guided-owner-loop-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");
      await writeGuidedOutput({
        currentStep: "gateway_started",
        gateway: {
          providerId: "telegram-tdlib",
          mode: "real",
          status: lifecycle.details.status,
        },
      });

      currentStep = "metadata_directory";
      const directoryInput = {
        profileId,
        limit: Number.isFinite(directoryLimit) ? directoryLimit : 10,
        ...(directoryQuery ? { query: directoryQuery } : {}),
      };
      const directoryPreview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-guided-owner-loop-directory-preview", directoryInput);
      expect(directoryPreview.details.status).toBe("ready");
      const directoryResult = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-guided-owner-loop-directory-apply", directoryInput);
      expect(directoryResult.details.status).toBe("applied");
      expect(directoryResult.details.failureMode).toBe("none");
      expect(JSON.stringify(directoryResult.details.conversations)).not.toContain("lastMessage");
      const directoryConversationIds = (directoryResult.details.conversations as Array<{ conversationId: string; title?: string }>)
        .map((conversation) => conversation.conversationId);
      await writeGuidedOutput({
        currentStep,
        directory: {
          status: directoryResult.details.status,
          failureMode: directoryResult.details.failureMode,
          returnedConversationCount: directoryResult.details.returnedConversationCount,
          selectedConversationPresent: directoryConversationIds.includes(conversationId),
          metadataOnly: true,
        },
      });
      expect(directoryConversationIds).toContain(conversationId);

      currentStep = "owner_handoff";
      const handoffInput = {
        profileId,
        conversationId,
        setupCode,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
      };
      const handoffPreview = await tool("ambient_messaging_telegram_owner_handoff_preview").execute("manual-guided-owner-loop-handoff-preview", handoffInput);
      expect(handoffPreview.details.status).toBe("ready");
      console.info([
        "Manual guided Telegram owner-loop waiting for inbound setup code.",
        JSON.stringify({
          conversationId,
          setupCodePreview,
          waitMs,
          intervalMs,
        }, null, 2),
      ].join("\n"));
      await writeGuidedOutput({
        currentStep,
        handoff: {
          status: "waiting",
          attempts: 0,
        },
      });

      let handoff: any | undefined;
      const handoffDeadline = Date.now() + waitMs;
      let handoffAttempt = 0;
      while (Date.now() <= handoffDeadline) {
        handoffAttempt += 1;
        handoff = await tool("ambient_messaging_telegram_owner_handoff_apply").execute(`manual-guided-owner-loop-handoff-apply-${handoffAttempt}`, handoffInput);
        if (handoff.details.applyStatus !== "applied") {
          throw new Error(`Owner handoff apply returned ${handoff.details.applyStatus}: ${handoff.details.error ?? "no error"}`);
        }
        if (handoff.details.handoffStatus === "matched") {
          await writeGuidedOutput({
            currentStep,
            handoff: {
              status: "matched",
              attempts: handoffAttempt,
              fetchedMessageCount: handoff.details.fetchedMessageCount,
              candidateMessageCount: handoff.details.candidateMessageCount,
              matchedMessageCount: handoff.details.matchedMessageCount,
              ownerUserId: handoff.details.ownerUserId,
              sourceMessageId: handoff.details.sourceMessageId,
            },
          });
          break;
        }
        if (handoff.details.handoffStatus === "ambiguous") {
          await writeGuidedOutput({
            currentStep,
            handoff: {
              status: "ambiguous",
              attempts: handoffAttempt,
              fetchedMessageCount: handoff.details.fetchedMessageCount,
              candidateMessageCount: handoff.details.candidateMessageCount,
              matchedMessageCount: handoff.details.matchedMessageCount,
            },
          });
          throw new Error("Owner handoff became ambiguous; repeat guided smoke with a new setup code.");
        }
        console.info([
          "Manual guided Telegram owner-loop handoff still waiting.",
          JSON.stringify({
            attempt: handoffAttempt,
            fetchedMessageCount: handoff.details.fetchedMessageCount,
            candidateMessageCount: handoff.details.candidateMessageCount,
            matchedMessageCount: handoff.details.matchedMessageCount,
          }, null, 2),
        ].join("\n"));
        await writeGuidedOutput({
          currentStep,
          handoff: {
            status: handoff.details.handoffStatus,
            attempts: handoffAttempt,
            fetchedMessageCount: handoff.details.fetchedMessageCount,
            candidateMessageCount: handoff.details.candidateMessageCount,
            matchedMessageCount: handoff.details.matchedMessageCount,
          },
        });
        await delay(intervalMs);
      }
      if (!handoff) {
        throw new Error("Owner handoff did not run before the guided wait expired.");
      }
      if (handoff.details.handoffStatus !== "matched") {
        throw new Error(`Owner handoff did not match before the guided wait expired: status=${handoff.details.handoffStatus} attempts=${handoffAttempt}. Send the setup code from a separate inbound owner/delegate Telegram account, not from the bridge account.`);
      }
      expect(handoff.details).toMatchObject({
        applyStatus: "applied",
        handoffStatus: "matched",
      });
      const ownerUserId = handoff.details.ownerUserId;
      const ownerHandoffSourceMessageId = handoff.details.sourceMessageId;
      expect(ownerUserId).toBeTruthy();
      expect(ownerHandoffSourceMessageId).toBeTruthy();

      const binding = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-guided-owner-loop-binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId,
        conversationId,
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        ownerHandoffSourceMessageId,
      });
      expect(binding.details.status).toBe("applied");
      bindingId = binding.details.lifecycle.binding.id;
      await writeGuidedOutput({
        currentStep: "binding_created",
        binding: {
          status: binding.details.status,
          bindingId,
          purpose: "remote_ambient_surface",
          ambientSurface: "projects",
        },
      });

      currentStep = "activation_plan_after_binding";
      const activationPlanAfterBinding = await tool("ambient_messaging_telegram_owner_loop_activation_plan").execute("manual-guided-owner-loop-activation-plan-after-binding", {
        profileId,
        conversationId,
        setupCode,
        ownerUserId,
        ownerHandoffSourceMessageId,
        bindingId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
        intervalMs: Math.max(5_000, intervalMs),
        ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
      });
      expect(activationPlanAfterBinding.details.toolName).toBe("ambient_messaging_telegram_owner_loop_activation_plan");
      expect(Array.isArray(activationPlanAfterBinding.details.phases)).toBe(true);
      activationPlanAfterBindingSummary = compactActivationPlan(activationPlanAfterBinding.details);
      await writeGuidedOutput({
        currentStep,
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
          afterBinding: activationPlanAfterBindingSummary,
        },
      });

      let queuedProjectionId: string | undefined;
      if (usePollingRunner) {
        currentStep = "owner_command_polling_runner";
        const pollingIntervalMs = Math.max(5_000, intervalMs);
        console.info([
          "Manual guided Telegram owner-loop starting periodic command polling.",
          JSON.stringify({ conversationId, commandText, waitMs, pollingIntervalMs }, null, 2),
        ].join("\n"));
        const pollingInput = {
          action: "start",
          profileId,
          bindingId,
          limit: Number.isFinite(pollLimit) ? pollLimit : 10,
          intervalMs: pollingIntervalMs,
          ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
        };
        const pollingPreview = await tool("ambient_messaging_telegram_bridge_polling_preview").execute("manual-guided-owner-loop-polling-preview", pollingInput);
        expect(pollingPreview.details.status).toBe("ready");
        const pollingStart = await tool("ambient_messaging_telegram_bridge_polling_apply").execute("manual-guided-owner-loop-polling-start", pollingInput);
        expect(pollingStart.details.status).toBe("applied");
        pollingRunnerStarted = true;
        const immediatePoll = pollingStart.details.immediatePollResult;
        const acceptedDispatch = immediatePoll?.bindingResults
          ?.flatMap((bindingResult: any) => bindingResult.dispatches)
          .find((dispatch: any) => dispatch.accepted && dispatch.queuedProjection?.id && dispatch.event?.text === commandText);
        if (!acceptedDispatch) {
          await writeGuidedOutput({
            currentStep,
            commandPoll: {
              status: "no-match-via-polling-runner",
              attempts: 1,
              fetchedMessageCount: immediatePoll?.fetchedMessageCount,
              candidateMessageCount: immediatePoll?.candidateMessageCount,
              duplicateMessageCount: immediatePoll?.duplicateMessageCount,
              staleMessageCount: immediatePoll?.staleMessageCount,
              acceptedDispatchCount: immediatePoll?.acceptedDispatchCount,
              droppedDispatchCount: immediatePoll?.droppedDispatchCount,
              minReceivedAt: commandNotBefore,
            },
            pollingRunner: {
              startStatus: pollingStart.details.status,
              runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
            },
          });
          throw new Error("Periodic Telegram polling runner started but the immediate poll did not accept the expected owner command.");
        }
        queuedProjectionId = acceptedDispatch.queuedProjection.id;
        await writeGuidedOutput({
          currentStep,
          commandPoll: {
            status: "matched-via-polling-runner",
            attempts: 1,
            fetchedMessageCount: immediatePoll.fetchedMessageCount,
            candidateMessageCount: immediatePoll.candidateMessageCount,
            duplicateMessageCount: immediatePoll.duplicateMessageCount,
            staleMessageCount: immediatePoll.staleMessageCount,
            acceptedDispatchCount: immediatePoll.acceptedDispatchCount,
            droppedDispatchCount: immediatePoll.droppedDispatchCount,
            minReceivedAt: commandNotBefore,
            queuedProjectionId,
            sourceEventId: acceptedDispatch.event?.id,
            sourceReceivedAt: acceptedDispatch.event?.receivedAt,
          },
          pollingRunner: {
            startStatus: pollingStart.details.status,
            intervalMs: pollingIntervalMs,
            runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
          },
        });

        const scheduledDeadline = Date.now() + Math.min(waitMs, pollingIntervalMs * 3 + 2_000);
        let pollingStatus: any | undefined;
        while (Date.now() <= scheduledDeadline) {
          pollingStatus = await tool("ambient_messaging_telegram_bridge_polling_status").execute("manual-guided-owner-loop-polling-status-scheduled", {});
          if ((pollingStatus.details.telegramBridgePolling?.totalPollCount ?? 0) >= 2) {
            break;
          }
          await delay(500);
        }
        const scheduledRuntimeStatus = pollingStatus?.details.telegramBridgePolling;
        if ((scheduledRuntimeStatus?.totalPollCount ?? 0) < 2) {
          throw new Error(`Periodic Telegram polling runner did not complete a scheduled tick before timeout; totalPollCount=${scheduledRuntimeStatus?.totalPollCount ?? 0}.`);
        }
        await writeGuidedOutput({
          currentStep,
          pollingRunner: {
            startStatus: pollingStart.details.status,
            intervalMs: pollingIntervalMs,
            runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
            scheduledStatus: compactPollingStatus(scheduledRuntimeStatus),
          },
        });
        const pollingStop = await tool("ambient_messaging_telegram_bridge_polling_apply").execute("manual-guided-owner-loop-polling-stop", {
          action: "stop",
          profileId,
          bindingId,
          limit: Number.isFinite(pollLimit) ? pollLimit : 10,
          intervalMs: pollingIntervalMs,
          ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
        });
        expect(pollingStop.details.status).toBe("applied");
        pollingRunnerStarted = false;
        await writeGuidedOutput({
          currentStep,
          pollingRunner: {
            startStatus: pollingStart.details.status,
            intervalMs: pollingIntervalMs,
            runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
            scheduledStatus: compactPollingStatus(scheduledRuntimeStatus),
            stopStatus: pollingStop.details.status,
            stoppedStatus: compactPollingStatus(pollingStop.details.runtimeStatus),
          },
        });
      } else {
        currentStep = "owner_command_poll";
        console.info([
          "Manual guided Telegram owner-loop waiting for inbound command.",
          JSON.stringify({ conversationId, commandText, waitMs, intervalMs }, null, 2),
        ].join("\n"));
        await writeGuidedOutput({
          currentStep,
          commandPoll: {
            status: "waiting",
            attempts: 0,
          },
        });

        const pollInput = {
          profileId,
          bindingId,
          limit: Number.isFinite(pollLimit) ? pollLimit : 10,
          ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
        };
        const pollPreview = await tool("ambient_messaging_telegram_bridge_poll_preview").execute("manual-guided-owner-loop-poll-preview", pollInput);
        expect(pollPreview.details.status).toBe("ready");
        let poll: any | undefined;
        let acceptedDispatch: any | undefined;
        const commandDeadline = Date.now() + waitMs;
        let pollAttempt = 0;
        while (Date.now() <= commandDeadline) {
          pollAttempt += 1;
          poll = await tool("ambient_messaging_telegram_bridge_poll_apply").execute(`manual-guided-owner-loop-poll-apply-${pollAttempt}`, pollInput);
          if (poll.details.applyStatus !== "applied") {
            throw new Error(`Telegram bridge poll returned ${poll.details.applyStatus}.`);
          }
          acceptedDispatch = poll.details.bindingResults
            .flatMap((bindingResult: any) => bindingResult.dispatches)
            .find((dispatch: any) => dispatch.accepted && dispatch.queuedProjection?.id && dispatch.event?.text === commandText);
          if (acceptedDispatch) {
            await writeGuidedOutput({
              currentStep,
              commandPoll: {
                status: "matched",
                attempts: pollAttempt,
                fetchedMessageCount: poll.details.fetchedMessageCount,
                candidateMessageCount: poll.details.candidateMessageCount,
                duplicateMessageCount: poll.details.duplicateMessageCount,
                staleMessageCount: poll.details.staleMessageCount,
                acceptedDispatchCount: poll.details.acceptedDispatchCount,
                droppedDispatchCount: poll.details.droppedDispatchCount,
                minReceivedAt: commandNotBefore,
                queuedProjectionId: acceptedDispatch.queuedProjection.id,
                sourceEventId: acceptedDispatch.event?.id,
                sourceReceivedAt: acceptedDispatch.event?.receivedAt,
              },
            });
            break;
          }
          console.info([
            "Manual guided Telegram owner-loop command still waiting.",
            JSON.stringify({
              attempt: pollAttempt,
              fetchedMessageCount: poll.details.fetchedMessageCount,
              candidateMessageCount: poll.details.candidateMessageCount,
              duplicateMessageCount: poll.details.duplicateMessageCount,
              staleMessageCount: poll.details.staleMessageCount,
              acceptedDispatchCount: poll.details.acceptedDispatchCount,
              droppedDispatchCount: poll.details.droppedDispatchCount,
              minReceivedAt: commandNotBefore,
            }, null, 2),
          ].join("\n"));
          await writeGuidedOutput({
            currentStep,
            commandPoll: {
              status: "waiting",
              attempts: pollAttempt,
              fetchedMessageCount: poll.details.fetchedMessageCount,
              candidateMessageCount: poll.details.candidateMessageCount,
              duplicateMessageCount: poll.details.duplicateMessageCount,
              staleMessageCount: poll.details.staleMessageCount,
              acceptedDispatchCount: poll.details.acceptedDispatchCount,
              droppedDispatchCount: poll.details.droppedDispatchCount,
              minReceivedAt: commandNotBefore,
            },
          });
          await delay(intervalMs);
        }
        queuedProjectionId = acceptedDispatch?.queuedProjection?.id;
        if (!queuedProjectionId) {
          throw new Error(`Owner command was not accepted before the guided wait expired: attempts=${pollAttempt}. Send the exact command text after the owner handoff is matched.`);
        }
      }
      if (!queuedProjectionId) {
        throw new Error("Owner command did not produce a queued projection.");
      }
      const matchedQueuedProjectionId = queuedProjectionId;
      expect(matchedQueuedProjectionId).toBeTruthy();

      const commandPreview = await tool("ambient_messaging_remote_surface_command_preview").execute("manual-guided-owner-loop-command-preview", {
        queuedProjectionId: matchedQueuedProjectionId,
      });
      expect(commandPreview.details.status).toBe("ready");
      const commandApplyError = await applyManualOwnerLoopCommand({
        tool,
        toolCallId: "manual-guided-owner-loop-command-apply",
        queuedProjectionId: matchedQueuedProjectionId,
      });
      if (commandApplyError) {
        expect(errorMessage(commandApplyError)).toContain("Ambient active project switching is not available");
      }
      await writeGuidedOutput({
        currentStep: "command_applied",
        queuedProjectionId: matchedQueuedProjectionId,
        commandApply: {
          status: commandApplyError ? "nonfatal-error" : "applied",
          error: commandApplyError ? errorMessage(commandApplyError) : undefined,
        },
      });

      currentStep = "relay_preview";
      await previewManualOwnerLoopRelay({
        tool,
        toolCallIdPrefix: "manual-guided-owner-loop",
        queuedProjectionId: matchedQueuedProjectionId,
        sendReply,
      });

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-guided-owner-loop-binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "manual guided Telegram owner-loop smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");
      bindingId = undefined;

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-guided-owner-loop-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      await writeGuidedOutput({
        status: "completed",
        currentStep: "completed",
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
          afterBinding: activationPlanAfterBindingSummary,
        },
        cleanup: {
          bindingRevoked: true,
          pollingStopped: usePollingRunner ? true : undefined,
          gatewayStopped: true,
        },
      });
    } catch (error) {
      await writeGuidedOutput({
        status: "failed",
        currentStep,
        failure: {
          message: errorMessage(error),
        },
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
          afterBinding: activationPlanAfterBindingSummary,
        },
        cleanup: {
          bindingRevoked: bindingId ? "pending-finally" : true,
          pollingStopped: pollingRunnerStarted ? "pending-finally" : (usePollingRunner ? true : undefined),
          gatewayStopped: "pending-finally",
        },
      });
      throw error;
    } finally {
      if (tool && pollingRunnerStarted) {
        try {
          await tool("ambient_messaging_telegram_bridge_polling_apply").execute("manual-guided-owner-loop-polling-stop-finally", {
            action: "stop",
            profileId,
            bindingId,
            limit: Number.isFinite(pollLimit) ? pollLimit : 10,
            intervalMs: Math.max(5_000, intervalMs),
            ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (tool && bindingId) {
        try {
          await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-guided-owner-loop-binding-revoke-finally", {
            action: "revoke",
            bindingId,
            reason: "manual guided Telegram owner-loop smoke finally cleanup",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-guided-owner-loop-stop-real-finally", {
            action: "stop",
            providerId: "telegram-tdlib",
            mode: "real",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 420_000);

  itManualTelegramOwnerLoopSmoke("manual real Telegram owner loop smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const setupCode = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE?.trim();
    const directoryQuery = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const directoryLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "10");
    const pollLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT ?? "10");
    const commandText = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT?.trim()
      || "switch project Manual Relay Smoke";
    const commandNotBefore = normalizedIsoFromEnv(
      process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE,
      "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE",
    );
    const sendReply = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY === "1";
    if (
      !profileId ||
      !stateRoot ||
      !conversationId ||
      !setupCode ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()
    ) {
      throw new Error(manualTelegramOwnerLoopSmokeChecklist({
        profileId,
        stateRoot,
        conversationId,
        setupCode,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-owner-loop-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    let bindingId: string | undefined;
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram owner loop smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_poll_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_polling_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply" ||
            (sendReply && request.toolName === "ambient_messaging_telegram_bridge_reply_apply")
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram owner-loop permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      }, manualTelegramOwnerLoopProjectFeatures(workspacePath));
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (registeredTool: any) => registeredTools.push(registeredTool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-owner-loop-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const directoryInput = {
        profileId,
        limit: Number.isFinite(directoryLimit) ? directoryLimit : 10,
        ...(directoryQuery ? { query: directoryQuery } : {}),
      };
      const directoryPreview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-owner-loop-directory-preview", directoryInput);
      expect(directoryPreview.details.status).toBe("ready");
      expect(directoryPreview.content[0].text).toContain("metadataOnly=true");
      const directoryResult = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-owner-loop-directory-apply", directoryInput);
      expect(directoryResult.details.status).toBe("applied");
      expect(directoryResult.details.failureMode).toBe("none");
      expect(JSON.stringify(directoryResult.details.conversations)).not.toContain("lastMessage");
      const directoryConversationIds = (directoryResult.details.conversations as Array<{ conversationId: string; title?: string }>)
        .map((conversation) => conversation.conversationId);
      expect(directoryConversationIds).toContain(conversationId);

      const handoffInput = {
        profileId,
        conversationId,
        setupCode,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
      };
      const handoffPreview = await tool("ambient_messaging_telegram_owner_handoff_preview").execute("manual-owner-loop-handoff-preview", handoffInput);
      expect(handoffPreview.details.status).toBe("ready");
      const handoff = await tool("ambient_messaging_telegram_owner_handoff_apply").execute("manual-owner-loop-handoff-apply", handoffInput);
      expect(handoff.details).toMatchObject({
        applyStatus: "applied",
        handoffStatus: "matched",
      });
      const ownerUserId = handoff.details.ownerUserId;
      const ownerHandoffSourceMessageId = handoff.details.sourceMessageId;
      expect(ownerUserId).toBeTruthy();
      expect(ownerHandoffSourceMessageId).toBeTruthy();

      const binding = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-owner-loop-binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId,
        conversationId,
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        ownerHandoffSourceMessageId,
      });
      expect(binding.details.status).toBe("applied");
      expect(binding.details.lifecycle.binding.metadata.ownerHandoffSourceMessageId).toBe(ownerHandoffSourceMessageId);
      bindingId = binding.details.lifecycle.binding.id;

      const pollInput = {
        profileId,
        bindingId,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
        ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
      };
      const pollPreview = await tool("ambient_messaging_telegram_bridge_poll_preview").execute("manual-owner-loop-poll-preview", pollInput);
      expect(pollPreview.details.status).toBe("ready");
      const poll = await tool("ambient_messaging_telegram_bridge_poll_apply").execute("manual-owner-loop-poll-apply", pollInput);
      expect(poll.details.applyStatus).toBe("applied");
      expect(poll.details.duplicateMessageCount).toBeGreaterThanOrEqual(1);
      expect(poll.details.acceptedDispatchCount).toBeGreaterThanOrEqual(1);
      const acceptedDispatch = poll.details.bindingResults
        .flatMap((bindingResult: any) => bindingResult.dispatches)
        .find((dispatch: any) => dispatch.accepted && dispatch.queuedProjection?.id && dispatch.event?.text === commandText);
      const queuedProjectionId = acceptedDispatch?.queuedProjection?.id;
      expect(queuedProjectionId).toBeTruthy();

      const commandPreview = await tool("ambient_messaging_remote_surface_command_preview").execute("manual-owner-loop-command-preview", {
        queuedProjectionId,
      });
      expect(commandPreview.details.status).toBe("ready");
      const commandApplyError = await applyManualOwnerLoopCommand({
        tool,
        toolCallId: "manual-owner-loop-command-apply",
        queuedProjectionId,
      });
      if (commandApplyError) {
        expect(errorMessage(commandApplyError)).toContain("Ambient active project switching is not available");
      }

      await previewManualOwnerLoopRelay({
        tool,
        toolCallIdPrefix: "manual-owner-loop",
        queuedProjectionId,
        sendReply,
      });

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-owner-loop-binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "manual Telegram owner-loop smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");
      bindingId = undefined;

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-owner-loop-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
    } finally {
      if (tool && bindingId) {
        try {
          await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-owner-loop-binding-revoke-finally", {
            action: "revoke",
            bindingId,
            reason: "manual Telegram owner-loop smoke finally cleanup",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-owner-loop-stop-real-finally", {
            action: "stop",
            providerId: "telegram-tdlib",
            mode: "real",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 240_000);
});

function manualTelegramOwnerLoopProjectFeatures(workspacePath: string) {
  const manualRelayProjectPath = join(workspacePath, "manual-relay-smoke-project");
  const project = (path: string, name: string): ProjectSummary => ({
    id: path,
    path,
    name,
    statePath: join(path, ".ambient-codex"),
    sessionPath: join(path, ".ambient-codex", "sessions"),
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:01.000Z",
    threads: [],
  });
  return {
    projects: {
      listProjects: () => [
        project(workspacePath, "Active project"),
        project(manualRelayProjectPath, "Manual Relay Smoke"),
      ],
      switchProject: (input: { workspacePath: string; reason: string }) => {
        if (input.workspacePath !== manualRelayProjectPath) {
          throw new Error(`Unexpected manual Telegram owner-loop project switch target: ${input.workspacePath}`);
        }
      },
    },
  };
}

async function applyManualOwnerLoopCommand(input: {
  tool: (name: string) => { name: string; execute: (...args: any[]) => Promise<any> };
  toolCallId: string;
  queuedProjectionId: string;
}): Promise<unknown | undefined> {
  try {
    const result = await input.tool("ambient_messaging_remote_surface_command_apply").execute(input.toolCallId, {
      queuedProjectionId: input.queuedProjectionId,
    });
    expect(["applied", "noop"]).toContain(result.details.applyStatus);
    return undefined;
  } catch (error) {
    return error;
  }
}

async function previewManualOwnerLoopRelay(input: {
  tool: (name: string) => { name: string; execute: (...args: any[]) => Promise<any> };
  toolCallIdPrefix: string;
  queuedProjectionId: string;
  sendReply: boolean;
}): Promise<void> {
  const status = await input.tool("ambient_messaging_gateway_status").execute(`${input.toolCallIdPrefix}-relay-status`, {});
  const relaySummary = (status.details.remoteSurfaceRelaySummaries as Array<any> | undefined)
    ?.find((candidate) =>
      candidate.queuedProjectionId === input.queuedProjectionId &&
      candidate.relayActionStatus === "preview-ready");
  if (!relaySummary?.runtimeEventId) {
    throw new Error([
      "Manual Telegram owner-loop relay smoke did not produce a preview-ready runtime event.",
      "Use a command that produces a relayable runtime event, for example: switch project Manual Relay Smoke.",
      status.content?.[0]?.text ?? JSON.stringify(status.details, null, 2),
    ].join("\n"));
  }
  expect(relaySummary.previewToolName).toBe("ambient_messaging_remote_surface_reply_preview");
  expect(relaySummary.applyToolName).toBe("ambient_messaging_remote_surface_reply_apply");
  expect(relaySummary.targetProviderId).toBe("telegram-tdlib");

  const replyPreview = await input.tool("ambient_messaging_remote_surface_reply_preview").execute(`${input.toolCallIdPrefix}-reply-preview`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(replyPreview.content[0].text).toContain("Remote Ambient Surface reply preview");
  expect(replyPreview.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
  expect(replyPreview.details).toMatchObject({
    status: "ready",
    delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
    delegatedProviderId: "telegram-tdlib",
  });

  const writeOwnerLoopOutput = async (extra: Record<string, unknown> = {}) => {
    const outputPath = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_OUTPUT_PATH?.trim();
    if (!outputPath) return;
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(await readFile(outputPath, "utf8"));
    } catch {
      existing = {};
    }
    await writeFile(outputPath, JSON.stringify({
      generatedAt: existing.generatedAt ?? new Date().toISOString(),
      ...existing,
      queuedProjectionId: input.queuedProjectionId,
      runtimeEventId: relaySummary.runtimeEventId,
      relayActionStatus: relaySummary.relayActionStatus,
      targetProviderId: relaySummary.targetProviderId,
      previewStatus: replyPreview.details.status,
      delegatedPreviewToolName: replyPreview.details.delegatedToolName,
      delegatedProviderId: replyPreview.details.delegatedProviderId,
      replySent: false,
      privacy: {
        providerMessageBodiesReturned: false,
        providerHistoryRead: false,
      },
      ...extra,
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8");
  };

  if (!input.sendReply) {
    await writeOwnerLoopOutput();
    console.info("Manual Telegram owner-loop relay preview completed without sending; set AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY=1 to send the reviewed reply.");
    return;
  }

  const replyApply = await input.tool("ambient_messaging_remote_surface_reply_apply").execute(`${input.toolCallIdPrefix}-reply-apply`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(replyApply.content[0].text).toContain("Remote Ambient Surface reply apply");
  expect(replyApply.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_apply");
  expect(replyApply.details).toMatchObject({
    status: "sent",
    delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
    delegatedProviderId: "telegram-tdlib",
  });
  const statusAfterSend = await input.tool("ambient_messaging_gateway_status").execute(`${input.toolCallIdPrefix}-status-after-reply`, {});
  const eventAfterSend = (statusAfterSend.details.remoteSurfaceRuntimeEvents as Array<any> | undefined)
    ?.find((candidate) => candidate.id === relaySummary.runtimeEventId);
  const relaySummaryAfterSend = (statusAfterSend.details.remoteSurfaceRelaySummaries as Array<any> | undefined)
    ?.find((candidate) => candidate.runtimeEventId === relaySummary.runtimeEventId);
  expect(eventAfterSend).toMatchObject({
    id: relaySummary.runtimeEventId,
    relayStatus: "sent",
    relaySuggested: false,
  });
  expect(relaySummaryAfterSend).toMatchObject({
    runtimeEventId: relaySummary.runtimeEventId,
    relayActionStatus: "already-relayed",
    duplicateBlocked: true,
  });
  const duplicatePreview = await input.tool("ambient_messaging_remote_surface_reply_preview").execute(`${input.toolCallIdPrefix}-duplicate-reply-preview`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(duplicatePreview.details.status).toBe("blocked");
  expect(duplicatePreview.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
  const duplicateApply = await input.tool("ambient_messaging_remote_surface_reply_apply").execute(`${input.toolCallIdPrefix}-duplicate-reply-apply`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(duplicateApply.details.status).toBe("blocked");
  expect(duplicateApply.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
  await writeOwnerLoopOutput({
    replySent: true,
    replyApplyStatus: replyApply.details.status,
    delegatedApplyToolName: replyApply.details.delegatedToolName,
    deliveryStatus: replyApply.details.delivery?.status,
    providerMessageId: replyApply.details.delivery?.providerMessageId,
    relayStatusAfterSend: eventAfterSend?.relayStatus,
    relayActionStatusAfterSend: relaySummaryAfterSend?.relayActionStatus,
    duplicateBlockedAfterSend: relaySummaryAfterSend?.duplicateBlocked === true,
    duplicatePreviewStatus: duplicatePreview.details.status,
    duplicateApplyStatus: duplicateApply.details.status,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
