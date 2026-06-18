import { describe, expect, it, vi } from "vitest";

import type { AmbientFeatureFlagSnapshot } from "../../../shared/featureFlags";
import type { ThreadSummary } from "../../../shared/threadTypes";
import type { CreateSubagentPiToolDefinitionsOptions } from "../agentRuntimeSubagentsFacade";
import {
  createAgentRuntimeSubagentToolExtension,
  createSubagentToolExtension,
  type AgentRuntimeSubagentParentRunStore,
} from "./agentRuntimeSubagentTools";

type RegisteredTool = { name: string; executionMode?: string };

describe("createSubagentToolExtension", () => {
  it("skips registration when subagent tools are inactive", () => {
    const registeredTools: RegisteredTool[] = [];
    const activeToolNames = vi.fn(() => []);
    const createDefinitions = vi.fn();

    createSubagentToolExtension({
      threadId: "thread-1",
      store: {} as any,
      getThread: () => thread(),
      getFeatureFlagSnapshot: () => featureFlags(),
      getParentRun: () => ({ id: "run-1" }),
      resolveModelRuntimeProfile: () => ({ providerId: "provider", modelId: "model" } as any),
      resolveCapacityLease: () => ({ leaseId: "lease-1" } as any),
      prepareChildWorktree: () => undefined,
      runtime: {} as any,
      ambientSubagentActiveToolNamesForThread: activeToolNames as any,
      createSubagentPiToolDefinitions: createDefinitions,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    expect(activeToolNames).toHaveBeenCalledWith(thread(), featureFlags());
    expect(createDefinitions).not.toHaveBeenCalled();
    expect(registeredTools).toEqual([]);
  });

  it("registers subagent tools and forwards runtime dependencies", async () => {
    const registeredTools: RegisteredTool[] = [];
    let capturedOptions: CreateSubagentPiToolDefinitionsOptions | undefined;
    const runtime = {
      startChildRun: vi.fn(),
      waitForChildRun: vi.fn(),
      cancelChildRun: vi.fn(),
      followupChildRun: vi.fn(),
      resolveChildApprovalResponse: vi.fn(),
    };
    const parentRun = { id: "run-1", assistantMessageId: "message-1" };
    const resolveSymphonyLaunchContract = vi.fn((contractId: string) => ({ contractId }));

    createSubagentToolExtension({
      threadId: "thread-1",
      pluginMcpTools: [
        { registeredName: "plugin_alpha" } as any,
        { registeredName: "plugin_beta" } as any,
      ],
      store: { getThread: () => thread() } as any,
      getThread: () => thread(),
      getFeatureFlagSnapshot: () => featureFlags(),
      getParentRun: () => parentRun,
      resolveSymphonyLaunchContract,
      resolveModelRuntimeProfile: (modelId) => ({ providerId: "provider", modelId: modelId ?? "default-model" } as any),
      resolveCapacityLease: (input) => ({ leaseId: "lease-1", input } as any),
      prepareChildWorktree: (input) => ({ path: `/tmp/${input.run.id}` } as any),
      runtime: runtime as any,
      ambientSubagentActiveToolNamesForThread: () => ["ambient_subagent"] as any,
      createSubagentPiToolDefinitions: (options) => {
        capturedOptions = options;
        return [{
          name: "ambient_subagent",
          label: "Ambient Sub-Agent",
          description: "Fixture subagent tool.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          executionMode: "sequential",
        } as any];
      },
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_subagent"]);
    expect(capturedOptions?.threadId).toBe("thread-1");
    expect(capturedOptions?.store.getThread("thread-1")).toEqual(thread());
    expect(capturedOptions?.getFeatureFlagSnapshot()).toEqual(featureFlags());
    expect(capturedOptions?.getParentRun()).toEqual(parentRun);
    expect(capturedOptions?.resolveSymphonyLaunchContract?.("contract-1")).toEqual({ contractId: "contract-1" });
    expect(resolveSymphonyLaunchContract).toHaveBeenCalledWith("contract-1");
    expect(capturedOptions?.availableExtensionToolNames).toEqual(["plugin_alpha", "plugin_beta"]);
    expect(capturedOptions?.resolveModelRuntimeProfile?.("model-1")).toMatchObject({ providerId: "provider", modelId: "model-1" });
    await expect(Promise.resolve(capturedOptions?.resolveCapacityLease?.({} as any))).resolves.toMatchObject({ leaseId: "lease-1" });
    await expect(Promise.resolve(capturedOptions?.prepareChildWorktree?.({ run: { id: "child-1" } } as any))).resolves.toMatchObject({ path: "/tmp/child-1" });
    expect(capturedOptions?.runtime).toBe(runtime);
  });

  it("exposes stored Symphony launch contract fields through the production wrapper when a resolver exists", () => {
    const registeredTools: any[] = [];

    createSubagentToolExtension({
      threadId: "thread-1",
      store: { getThread: () => thread() } as any,
      getThread: () => thread(),
      getFeatureFlagSnapshot: () => featureFlags(),
      getParentRun: () => ({ id: "run-1" }),
      resolveSymphonyLaunchContract: () => undefined,
      resolveModelRuntimeProfile: () => ({ providerId: "provider", modelId: "model" } as any),
      resolveCapacityLease: () => ({ leaseId: "lease-1" } as any),
      prepareChildWorktree: () => undefined,
      runtime: {} as any,
      ambientSubagentActiveToolNamesForThread: () => ["ambient_subagent"] as any,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    expect(registeredTools).toHaveLength(1);
    expect(registeredTools[0].parameters.properties.symphonyMode).toMatchObject({ type: "boolean" });
    expect(registeredTools[0].parameters.properties.symphonyContractId).toMatchObject({ type: "string" });
    expect(registeredTools[0].parameters.properties.symphony).toBeUndefined();
  });
});

describe("createAgentRuntimeSubagentToolExtension", () => {
  it("assembles AgentRuntime callbacks and falls back when the active run record is unavailable", async () => {
    const registeredTools: RegisteredTool[] = [];
    let capturedOptions: CreateSubagentPiToolDefinitionsOptions | undefined;
    const runtime = {
      startChildRun: vi.fn(),
      waitForChildRun: vi.fn(),
      cancelChildRun: vi.fn(),
      followupChildRun: vi.fn(),
      resolveChildApprovalResponse: vi.fn(),
    };
    const activeRunStore = parentRunStore({
      getRunRecord: vi.fn(() => {
        throw new Error("missing run record");
      }),
    });
    const resolveSymphonyLaunchContract = vi.fn((contractId: string) => ({ contractId }));

    createAgentRuntimeSubagentToolExtension({
      threadId: "thread-1",
      pluginMcpTools: [{ registeredName: "plugin_alpha" } as any],
      store: { getThread: () => thread() } as any,
      activeRunIds: new Map([["thread-1", "run-1"]]),
      activeRunStore,
      getFeatureFlagSnapshot: () => featureFlags(),
      resolveSymphonyLaunchContract,
      resolveModelRuntimeProfile: (modelId) => ({ providerId: "provider", modelId: modelId ?? "default-model" } as any),
      resolveCapacityLease: (input) => ({ leaseId: "lease-1", input } as any),
      prepareChildWorktree: (input) => ({ path: `/tmp/${input.run.id}` } as any),
      runtime: runtime as any,
      ambientSubagentActiveToolNamesForThread: () => ["ambient_subagent"] as any,
      createSubagentPiToolDefinitions: (options) => {
        capturedOptions = options;
        return [{
          name: "ambient_subagent",
          label: "Ambient Sub-Agent",
          description: "Fixture subagent tool.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          executionMode: "sequential",
        } as any];
      },
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_subagent"]);
    expect(capturedOptions?.threadId).toBe("thread-1");
    expect(capturedOptions?.store.getThread("thread-1")).toEqual(thread());
    expect(capturedOptions?.getFeatureFlagSnapshot()).toEqual(featureFlags());
    expect(capturedOptions?.getParentRun()).toEqual({ id: "run-1" });
    expect(activeRunStore.getRunRecord).toHaveBeenCalledWith("run-1");
    expect(capturedOptions?.resolveSymphonyLaunchContract?.("contract-2")).toEqual({ contractId: "contract-2" });
    expect(resolveSymphonyLaunchContract).toHaveBeenCalledWith("contract-2");
    expect(capturedOptions?.availableExtensionToolNames).toEqual(["plugin_alpha"]);
    expect(capturedOptions?.resolveModelRuntimeProfile?.("model-1")).toMatchObject({ providerId: "provider", modelId: "model-1" });
    await expect(Promise.resolve(capturedOptions?.resolveCapacityLease?.({} as any))).resolves.toMatchObject({ leaseId: "lease-1" });
    await expect(Promise.resolve(capturedOptions?.prepareChildWorktree?.({ run: { id: "child-1" } } as any))).resolves.toMatchObject({ path: "/tmp/child-1" });
    expect(capturedOptions?.runtime).toBe(runtime);
  });

  it("returns undefined parent run when there is no active run for the thread", () => {
    let capturedOptions: CreateSubagentPiToolDefinitionsOptions | undefined;
    const activeRunStore = parentRunStore();

    createAgentRuntimeSubagentToolExtension({
      threadId: "thread-1",
      store: { getThread: () => thread() } as any,
      activeRunIds: new Map(),
      activeRunStore,
      getFeatureFlagSnapshot: () => featureFlags(),
      resolveModelRuntimeProfile: () => ({ providerId: "provider", modelId: "model" } as any),
      resolveCapacityLease: () => ({ leaseId: "lease-1" } as any),
      prepareChildWorktree: () => undefined,
      runtime: {} as any,
      ambientSubagentActiveToolNamesForThread: () => ["ambient_subagent"] as any,
      createSubagentPiToolDefinitions: (options) => {
        capturedOptions = options;
        return [{
          name: "ambient_subagent",
          label: "Ambient Sub-Agent",
          description: "Fixture subagent tool.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
          executionMode: "sequential",
        } as any];
      },
    })({
      registerTool: () => undefined,
    } as any);

    expect(capturedOptions?.getParentRun()).toBeUndefined();
    expect(activeRunStore.getRunRecord).not.toHaveBeenCalled();
  });
});

function thread(): ThreadSummary {
  return {
    id: "thread-1",
    kind: "chat",
  } as ThreadSummary;
}

function featureFlags(): AmbientFeatureFlagSnapshot {
  return {
    flags: {
      "ambient.subagents": true,
    },
  } as unknown as AmbientFeatureFlagSnapshot;
}

function parentRunStore(input: Partial<AgentRuntimeSubagentParentRunStore> = {}): AgentRuntimeSubagentParentRunStore {
  return {
    getRunRecord: vi.fn(() => ({ id: "run-1", assistantMessageId: "message-1" })),
    ...input,
  };
}
