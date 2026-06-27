import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { AgentRuntime } from "./agentRuntime";
import type { AgentRuntimePiSession } from "./agentRuntimeSessionFactoryController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

describe("AgentRuntime session warmup", () => {
  it("creates a thread session through the existing session factory", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-session-warmup-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("Warmup");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: vi.fn(),
      });
      const session = sessionLike();
      const getSession = vi
        .spyOn((runtime as any).controllers.sessionFactory, "getSession")
        .mockImplementation(async (targetThread: any) => {
          (runtime as any).sessions.set({ threadId: targetThread.id, session });
          return session;
        });

      await runtime.warmThreadSession(thread.id, { reason: "test" });
      await runtime.warmThreadSession(thread.id, { reason: "already-warm" });

      expect(getSession).toHaveBeenCalledTimes(1);
      expect(getSession).toHaveBeenCalledWith(thread);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("lets the first prompt reuse an in-flight warmup instead of racing another session build", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-session-warmup-coalesce-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("Warmup coalescing");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: vi.fn(),
      });
      const session = sessionLike();
      let finishWarmup: () => void = () => undefined;
      const warmupBlock = new Promise<void>((resolve) => {
        finishWarmup = resolve;
      });
      const getSession = vi
        .spyOn((runtime as any).controllers.sessionFactory, "getSession")
        .mockImplementationOnce(async (targetThread: any) => {
          await warmupBlock;
          (runtime as any).sessions.set({ threadId: targetThread.id, session });
          return session;
        })
        .mockImplementationOnce(async () => {
          return session;
        });

      const warmup = runtime.warmThreadSession(thread.id, { reason: "test" });
      await Promise.resolve();

      const promptSession = (runtime as any).getSession(thread) as Promise<AgentRuntimePiSession>;
      await Promise.resolve();
      expect(getSession).toHaveBeenCalledTimes(1);

      finishWarmup();
      await expect(promptSession).resolves.toBe(session);
      await warmup;
      expect(getSession).toHaveBeenCalledTimes(2);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("disposes a warmed normal session before creating a recovery session", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-session-warmup-recovery-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("Warmup recovery");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: vi.fn(),
      });
      const warmedSession = sessionLike();
      const recoverySession = sessionLike();
      const recovery = {
        kind: "provider_interruption_continuation",
        previousSessionFile: join(workspacePath, "previous-session.jsonl"),
      };
      const getSession = vi
        .spyOn((runtime as any).controllers.sessionFactory, "getSession")
        .mockImplementationOnce(async (targetThread: any) => {
          (runtime as any).sessions.set({ threadId: targetThread.id, session: warmedSession });
          return warmedSession;
        })
        .mockImplementationOnce(async (targetThread: any, runtimeRecovery: unknown) => {
          (runtime as any).sessions.set({ threadId: targetThread.id, session: recoverySession });
          expect(runtimeRecovery).toBe(recovery);
          return recoverySession;
        });

      await runtime.warmThreadSession(thread.id, { reason: "test" });

      await expect((runtime as any).getSession(thread, recovery)).resolves.toBe(recoverySession);
      expect(warmedSession.dispose).toHaveBeenCalledTimes(1);
      expect(getSession).toHaveBeenCalledTimes(2);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("disposes a warmed session when the thread permission mode changes before send", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-session-warmup-permission-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("Warmup permission", workspacePath, { permissionMode: "full-access" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: vi.fn(),
      });
      const warmedSession = sessionLike();
      const workspaceSession = sessionLike();
      const getSession = vi
        .spyOn((runtime as any).controllers.sessionFactory, "getSession")
        .mockImplementationOnce(async (targetThread: any) => {
          (runtime as any).sessions.set({ threadId: targetThread.id, session: warmedSession });
          return warmedSession;
        })
        .mockImplementationOnce(async (targetThread: any) => {
          (runtime as any).sessions.set({ threadId: targetThread.id, session: workspaceSession });
          return workspaceSession;
        });

      await runtime.warmThreadSession(thread.id, { reason: "test" });
      const downgraded = store.updateThreadSettings(thread.id, { permissionMode: "workspace" });

      await expect((runtime as any).getSession(downgraded)).resolves.toBe(workspaceSession);
      expect(warmedSession.dispose).toHaveBeenCalledTimes(1);
      expect(getSession).toHaveBeenCalledTimes(2);
      expect(getSession).toHaveBeenLastCalledWith(downgraded, undefined, undefined, undefined);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("disposes warmed sessions when warmups are invalidated before first send", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-session-warmup-invalidate-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("Warmup invalidation", workspacePath, { permissionMode: "full-access" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: vi.fn(),
      });
      const warmedSession = sessionLike();
      const workspaceSession = sessionLike();
      const getSession = vi
        .spyOn((runtime as any).controllers.sessionFactory, "getSession")
        .mockImplementationOnce(async (targetThread: any) => {
          (runtime as any).sessions.set({ threadId: targetThread.id, session: warmedSession });
          return warmedSession;
        })
        .mockImplementationOnce(async (targetThread: any) => {
          (runtime as any).sessions.set({ threadId: targetThread.id, session: workspaceSession });
          return workspaceSession;
        });

      await runtime.warmThreadSession(thread.id, { reason: "test" });
      (runtime as any).invalidateSessionWarmups();
      const downgraded = store.updateThreadSettings(thread.id, { permissionMode: "workspace" });

      await expect((runtime as any).getSession(downgraded)).resolves.toBe(workspaceSession);
      expect(warmedSession.dispose).toHaveBeenCalledTimes(1);
      expect((runtime as any).sessions.get(thread.id)).toBe(workspaceSession);
      expect(getSession).toHaveBeenCalledTimes(2);
      expect(getSession).toHaveBeenLastCalledWith(downgraded, undefined, undefined, undefined);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("disposes an in-flight warmup session that completes after runtime reset", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-session-warmup-reset-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("Warmup reset");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: vi.fn(),
      });
      const session = sessionLike();
      let finishWarmup: () => void = () => undefined;
      const warmupBlock = new Promise<void>((resolve) => {
        finishWarmup = resolve;
      });
      vi.spyOn((runtime as any).controllers.sessionFactory, "getSession").mockImplementation(async (targetThread: any) => {
        await warmupBlock;
        (runtime as any).sessions.set({ threadId: targetThread.id, session });
        return session;
      });

      const warmup = runtime.warmThreadSession(thread.id, { reason: "test" });
      await Promise.resolve();
      runtime.resetSessions();

      finishWarmup();
      await warmup;
      expect(session.dispose).toHaveBeenCalledTimes(1);
      expect((runtime as any).sessions.get(thread.id)).toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function sessionLike(): AgentRuntimePiSession {
  return {
    model: { id: "example/model-id" },
    setThinkingLevel: vi.fn(),
    setModel: vi.fn(async () => undefined),
    dispose: vi.fn(),
  } as unknown as AgentRuntimePiSession;
}
