import { describe, expect, it, vi } from "vitest";

import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import {
  AgentRuntimeSubagentToolExtensionController,
  type AgentRuntimeSubagentToolExtensionControllerOptions,
} from "./agentRuntimeSubagentToolExtensionController";
import type { createAgentRuntimeSubagentToolExtension } from "./subagents/agentRuntimeSubagentTools";

type CreateSubagentExtensionInput = Parameters<typeof createAgentRuntimeSubagentToolExtension>[0];

describe("AgentRuntimeSubagentToolExtensionController", () => {
  it("assembles the AgentRuntime subagent tool extension with runtime-owned dependencies", async () => {
    const extension = vi.fn();
    let capturedInput: CreateSubagentExtensionInput | undefined;
    const createExtension = vi.fn((input: CreateSubagentExtensionInput) => {
      capturedInput = input;
      return extension;
    });
    const eventingStore = { getThread: vi.fn() };
    const capacityLease = { leaseId: "lease-1" };
    const featureFlags = { flags: { "ambient.subagents": true } } as unknown as AmbientFeatureFlagSnapshot;
    const resolveSymphonyLaunchContract = vi.fn((contractId: string) => ({ contractId }));
    const resolveModelRuntimeProfile = vi.fn((modelId?: string) => ({ providerId: "provider", modelId: modelId ?? "default" }) as any);
    const router = childRuntimeRouter();
    const controller = createController({
      features: {
        localTextSubagents: { resolveModelRuntimeProfile },
        symphonyLaunchContracts: { resolve: resolveSymphonyLaunchContract },
      } as unknown as AgentRuntimeSubagentToolExtensionControllerOptions["features"],
      subagentActions: { createEventingStore: vi.fn(() => eventingStore as any) },
      subagentCapacity: {
        resolveCapacityLease: vi.fn(async () => capacityLease as any),
      },
      subagentChildRuntimeRouter: router,
      getFeatureFlagSnapshot: () => featureFlags,
      dependencies: {
        createAgentRuntimeSubagentToolExtension: createExtension,
      },
    });

    expect(controller.createToolExtension("thread-1", [{ registeredName: "plugin_alpha" } as any])).toBe(extension);
    expect(createExtension).toHaveBeenCalledOnce();
    if (!capturedInput) throw new Error("Expected subagent extension input to be captured.");
    expect(capturedInput).toMatchObject({
      threadId: "thread-1",
      pluginMcpTools: [{ registeredName: "plugin_alpha" }],
      activeRunIds: controllerOptions.activeRunIds,
      activeRunStore: controllerOptions.store,
      store: eventingStore,
    });
    expect(capturedInput.getFeatureFlagSnapshot()).toBe(featureFlags);
    expect(capturedInput.resolveSymphonyLaunchContract?.("contract-1")).toEqual({ contractId: "contract-1" });
    expect(resolveSymphonyLaunchContract).toHaveBeenCalledWith("contract-1");
    expect(capturedInput.resolveModelRuntimeProfile("model-1")).toEqual({ providerId: "provider", modelId: "model-1" });
    expect(resolveModelRuntimeProfile).toHaveBeenCalledWith("model-1");
    await expect(capturedInput.resolveCapacityLease({} as any)).resolves.toBe(capacityLease);

    const capturedRuntime = capturedInput.runtime;
    if (!capturedRuntime) throw new Error("Expected subagent runtime callbacks to be captured.");
    await capturedRuntime.waitForChildRun!({ run: { id: "child-run" } } as any);
    expect(router.waitForResolvedChildRun).toHaveBeenCalledWith({ run: { id: "child-run" } });
    await capturedRuntime.cancelChildRun!({ run: { id: "child-run" } } as any);
    expect(router.cancelResolvedChildRun).toHaveBeenCalledWith({ run: { id: "child-run" } });
    capturedRuntime.startChildRun!({ run: { id: "child-run" } } as any);
    expect(router.startResolvedChildRun).toHaveBeenCalledWith({ run: { id: "child-run" } });
  });

  it("prepares child worktrees from child, parent, or workspace roots and emits the updated thread", async () => {
    const worktree: ThreadWorktreeSummary = {
      threadId: "child-thread",
      projectRoot: "/parent-root",
      worktreePath: "/parent-root-child",
      branchName: "codex/child",
      status: "active",
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    };
    const childThread = thread("child-thread", "/workspace");
    const parentThread = thread("parent-thread", "/workspace", {
      threadId: "parent-thread",
      projectRoot: "/parent-root",
      worktreePath: "/parent-root",
      branchName: "main",
      status: "shared",
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
    });
    const threads = new Map<string, ThreadSummary>([
      [childThread.id, childThread],
      [parentThread.id, parentThread],
    ]);
    const emit = vi.fn();
    const store = {
      ...controllerOptions.store,
      getThread: vi.fn((threadId: string) => threads.get(threadId)),
      getWorkspace: vi.fn(() => ({ path: "/workspace" })),
      setThreadWorktree: vi.fn((summary: ThreadWorktreeSummary) => {
        const current = threads.get(summary.threadId);
        if (!current) return;
        threads.set(summary.threadId, { ...current, gitWorktree: summary });
      }),
      updateThreadWorkspacePath: vi.fn((threadId: string, workspacePath: string) => {
        const current = threads.get(threadId);
        if (!current) throw new Error(`Missing thread ${threadId}`);
        const updated = { ...current, workspacePath };
        threads.set(threadId, updated);
        return updated;
      }),
    };
    const prepareThreadWorktree = vi.fn(async () => worktree);
    const controller = createController({
      store: store as any,
      emit,
      dependencies: {
        prepareThreadWorktree,
      },
    });

    const result = await controller.prepareChildWorktree({
      childThreadId: childThread.id,
      parentThreadId: parentThread.id,
    } as SubagentRunSummary);

    expect(prepareThreadWorktree).toHaveBeenCalledWith("/parent-root", childThread);
    expect(store.setThreadWorktree).toHaveBeenCalledWith(worktree);
    expect(store.updateThreadWorkspacePath).toHaveBeenCalledWith(childThread.id, worktree.worktreePath);
    expect(emit).toHaveBeenCalledWith({
      type: "thread-updated",
      thread: expect.objectContaining({
        id: childThread.id,
        workspacePath: worktree.worktreePath,
        gitWorktree: worktree,
      }),
    });
    expect(result).toBe(worktree);
  });
});

const controllerOptions = {
  store: {
    getThread: vi.fn((threadId: string) => thread(threadId, "/workspace")),
    getWorkspace: vi.fn(() => ({ path: "/workspace" })),
    getRunRecord: vi.fn(),
    setThreadWorktree: vi.fn(),
    updateThreadWorkspacePath: vi.fn(),
  },
  features: {},
  activeRunIds: new Map([["thread-1", "run-1"]]),
  subagentActions: { createEventingStore: vi.fn(() => ({}) as any) },
  subagentCapacity: { resolveCapacityLease: vi.fn() },
  subagentChildRuntimeRouter: childRuntimeRouter(),
  getFeatureFlagSnapshot: () => ({ flags: {} }) as AmbientFeatureFlagSnapshot,
  emit: vi.fn(),
};

function createController(
  overrides: Partial<AgentRuntimeSubagentToolExtensionControllerOptions> = {},
): AgentRuntimeSubagentToolExtensionController {
  return new AgentRuntimeSubagentToolExtensionController({
    ...controllerOptions,
    ...overrides,
    dependencies: {
      modelRuntimeRegistry: {
        resolveProfile: vi.fn((modelId?: string) => ({ providerId: "default-provider", modelId: modelId ?? "default" })),
      },
      ...overrides.dependencies,
    },
  } as AgentRuntimeSubagentToolExtensionControllerOptions);
}

function childRuntimeRouter(): AgentRuntimeSubagentToolExtensionControllerOptions["subagentChildRuntimeRouter"] {
  return {
    startResolvedChildRun: vi.fn(() => ({ started: true, run: { id: "child-run" } }) as any),
    waitForResolvedChildRun: vi.fn(async () => ({ timedOut: false, run: { id: "child-run" } }) as any),
    cancelResolvedChildRun: vi.fn(async () => ({ cancelled: true, run: { id: "child-run" } }) as any),
    followupResolvedChildRun: vi.fn(async () => ({ accepted: true, run: { id: "child-run" } }) as any),
    retryResolvedChildRun: vi.fn(async () => ({ accepted: true, run: { id: "child-run" } }) as any),
    resolveResolvedChildApprovalResponse: vi.fn(async () => ({ accepted: true, run: { id: "child-run" } }) as any),
  };
}

function thread(id: string, workspacePath: string, gitWorktree?: ThreadWorktreeSummary): ThreadSummary {
  return {
    id,
    title: id,
    workspacePath,
    ...(gitWorktree ? { gitWorktree } : {}),
  } as ThreadSummary;
}
