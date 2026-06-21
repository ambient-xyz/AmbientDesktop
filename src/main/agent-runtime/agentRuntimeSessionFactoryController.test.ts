import { describe, expect, it, vi } from "vitest";

import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { ThreadSummary } from "../../shared/threadTypes";
import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import {
  AgentRuntimeSessionFactoryController,
  type AgentRuntimePiSession,
  type AgentRuntimeSessionFactoryControllerOptions,
} from "./agentRuntimeSessionFactoryController";

function thread(input: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: input.id ?? "thread-1",
    title: "Session factory",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    workspacePath: "/workspace",
    kind: "chat",
    permissionMode: "workspace",
    model: input.model ?? AMBIENT_DEFAULT_MODEL,
    thinkingLevel: input.thinkingLevel ?? "medium",
    piSessionFile: input.piSessionFile,
  } as ThreadSummary;
}

function session(input: {
  modelId?: string;
  sessionFile?: string;
} = {}): AgentRuntimePiSession {
  return {
    model: input.modelId ? { id: input.modelId } : undefined,
    sessionFile: input.sessionFile,
    setModel: vi.fn(async () => undefined),
    setThinkingLevel: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AgentRuntimePiSession;
}

function controller(input: {
  sessions?: AgentRuntimeSessionRegistry<AgentRuntimePiSession>;
  currentThread?: ThreadSummary;
  commitThreadPiSessionFile?: AgentRuntimeSessionFactoryControllerOptions["commitThreadPiSessionFile"];
} = {}): AgentRuntimeSessionFactoryController {
  const sessions = input.sessions ?? new AgentRuntimeSessionRegistry<AgentRuntimePiSession>();
  const currentThread = input.currentThread ?? thread();
  return new AgentRuntimeSessionFactoryController({
    store: {
      getThread: vi.fn(() => currentThread),
    } as unknown as AgentRuntimeSessionFactoryControllerOptions["store"],
    sessions,
    pluginHost: {} as AgentRuntimeSessionFactoryControllerOptions["pluginHost"],
    extensionAssembly: {} as AgentRuntimeSessionFactoryControllerOptions["extensionAssembly"],
    mcpToolOrchestration: {} as AgentRuntimeSessionFactoryControllerOptions["mcpToolOrchestration"],
    providerRuntime: {} as AgentRuntimeSessionFactoryControllerOptions["providerRuntime"],
    features: {},
    ambientCliSkillMountDiagnostics: new Map(),
    tencentMemoryRuntimeSnapshots: new Map(),
    getFeatureFlagSnapshot: vi.fn(() => ({ flags: {} }) as never),
    commitThreadPiSessionFile: input.commitThreadPiSessionFile ?? vi.fn(async () => undefined),
    recordContextUsageSnapshot: vi.fn(() => ({}) as never),
    recordUnavailableContextUsageSnapshot: vi.fn(() => ({}) as never),
    resolveToolCallPermission: vi.fn(async () => undefined),
    emit: vi.fn(),
  });
}

describe("AgentRuntimeSessionFactoryController", () => {
  it("reuses an unstale session and reapplies thinking level", async () => {
    const sessions = new AgentRuntimeSessionRegistry<AgentRuntimePiSession>();
    const existing = session({ modelId: AMBIENT_DEFAULT_MODEL, sessionFile: "/sessions/thread-1.jsonl" });
    sessions.set({ threadId: "thread-1", session: existing });
    const runtimeSessionFactory = controller({ sessions });

    const resolved = await runtimeSessionFactory.getSession(thread());

    expect(resolved).toBe(existing);
    expect(existing.setModel).not.toHaveBeenCalled();
    expect(existing.setThinkingLevel).toHaveBeenCalledWith("medium");
    expect(existing.dispose).not.toHaveBeenCalled();
  });

  it("switches a reusable session to the thread model and commits the session file", async () => {
    const sessions = new AgentRuntimeSessionRegistry<AgentRuntimePiSession>();
    const existing = session({ modelId: "old-model", sessionFile: "/sessions/thread-1.jsonl" });
    sessions.set({ threadId: "thread-1", session: existing });
    const commitThreadPiSessionFile = vi.fn(async () => undefined);
    const currentThread = thread({ piSessionFile: "/sessions/old.jsonl" });
    const runtimeSessionFactory = controller({ sessions, currentThread, commitThreadPiSessionFile });

    await runtimeSessionFactory.switchSessionToThreadModel(currentThread, existing);

    expect(existing.setModel).toHaveBeenCalledTimes(1);
    expect(existing.setThinkingLevel).toHaveBeenCalledWith("medium");
    expect(commitThreadPiSessionFile).toHaveBeenCalledWith({
      threadId: "thread-1",
      sessionFile: "/sessions/thread-1.jsonl",
      currentPiSessionFile: "/sessions/old.jsonl",
      reason: "model-changed",
      emit: expect.any(Function),
    });
  });
});
