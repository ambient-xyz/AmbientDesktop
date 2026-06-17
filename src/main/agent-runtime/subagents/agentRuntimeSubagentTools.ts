import type { ToolDefinition, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { AmbientFeatureFlagSnapshot } from "../../../shared/featureFlags";
import type { ThreadSummary } from "../../../shared/types";
import type { PluginMcpToolRegistration } from "../../plugins/pluginHost";
import {
  ambientSubagentActiveToolNamesForThread as defaultAmbientSubagentActiveToolNamesForThread,
  createSubagentPiToolDefinitions as defaultCreateSubagentPiToolDefinitions,
  type CreateSubagentPiToolDefinitionsOptions,
  type SubagentPiToolStore,
} from "../../subagents/subagentPiTools";

export interface SubagentToolExtensionOptions {
  threadId: string;
  pluginMcpTools?: readonly PluginMcpToolRegistration[];
  store: SubagentPiToolStore;
  getThread: () => ThreadSummary;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  getParentRun: CreateSubagentPiToolDefinitionsOptions["getParentRun"];
  resolveSymphonyLaunchContract?: CreateSubagentPiToolDefinitionsOptions["resolveSymphonyLaunchContract"];
  resolveModelRuntimeProfile: NonNullable<CreateSubagentPiToolDefinitionsOptions["resolveModelRuntimeProfile"]>;
  resolveCapacityLease: NonNullable<CreateSubagentPiToolDefinitionsOptions["resolveCapacityLease"]>;
  prepareChildWorktree: NonNullable<CreateSubagentPiToolDefinitionsOptions["prepareChildWorktree"]>;
  runtime: NonNullable<CreateSubagentPiToolDefinitionsOptions["runtime"]>;
  ambientSubagentActiveToolNamesForThread?: typeof defaultAmbientSubagentActiveToolNamesForThread;
  createSubagentPiToolDefinitions?: (options: CreateSubagentPiToolDefinitionsOptions) => ToolDefinition<any, any, any>[];
}

export interface AgentRuntimeSubagentParentRunStore {
  getRunRecord: (runId: string) => { id: string; assistantMessageId?: string };
}

export function createAgentRuntimeSubagentToolExtension(input: {
  threadId: string;
  pluginMcpTools?: readonly PluginMcpToolRegistration[];
  store: SubagentPiToolStore;
  activeRunIds: Pick<Map<string, string>, "get">;
  activeRunStore: AgentRuntimeSubagentParentRunStore;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  resolveSymphonyLaunchContract?: CreateSubagentPiToolDefinitionsOptions["resolveSymphonyLaunchContract"];
  resolveModelRuntimeProfile: NonNullable<CreateSubagentPiToolDefinitionsOptions["resolveModelRuntimeProfile"]>;
  resolveCapacityLease: NonNullable<CreateSubagentPiToolDefinitionsOptions["resolveCapacityLease"]>;
  prepareChildWorktree: NonNullable<CreateSubagentPiToolDefinitionsOptions["prepareChildWorktree"]>;
  runtime: NonNullable<CreateSubagentPiToolDefinitionsOptions["runtime"]>;
  ambientSubagentActiveToolNamesForThread?: typeof defaultAmbientSubagentActiveToolNamesForThread;
  createSubagentPiToolDefinitions?: (options: CreateSubagentPiToolDefinitionsOptions) => ToolDefinition<any, any, any>[];
}): ExtensionFactory {
  return createSubagentToolExtension({
    threadId: input.threadId,
    pluginMcpTools: input.pluginMcpTools,
    store: input.store,
    getThread: () => input.store.getThread(input.threadId),
    getFeatureFlagSnapshot: input.getFeatureFlagSnapshot,
    getParentRun: () => {
      const runId = input.activeRunIds.get(input.threadId);
      if (!runId) return undefined;
      try {
        const run = input.activeRunStore.getRunRecord(runId);
        return { id: run.id, assistantMessageId: run.assistantMessageId };
      } catch {
        return { id: runId };
      }
    },
    resolveSymphonyLaunchContract: input.resolveSymphonyLaunchContract,
    resolveModelRuntimeProfile: input.resolveModelRuntimeProfile,
    resolveCapacityLease: input.resolveCapacityLease,
    prepareChildWorktree: input.prepareChildWorktree,
    runtime: input.runtime,
    ambientSubagentActiveToolNamesForThread: input.ambientSubagentActiveToolNamesForThread,
    createSubagentPiToolDefinitions: input.createSubagentPiToolDefinitions,
  });
}

export function createSubagentToolExtension(options: SubagentToolExtensionOptions): ExtensionFactory {
  return (pi) => {
    const thread = options.getThread();
    const featureFlags = options.getFeatureFlagSnapshot();
    const activeToolNamesForThread = options.ambientSubagentActiveToolNamesForThread ?? defaultAmbientSubagentActiveToolNamesForThread;
    if (!activeToolNamesForThread(thread, featureFlags).length) return;

    const availableExtensionToolNames = (options.pluginMcpTools ?? []).map((tool) => tool.registeredName);
    const createToolDefinitions = options.createSubagentPiToolDefinitions ?? defaultCreateSubagentPiToolDefinitions;
    for (const tool of createToolDefinitions({
      store: options.store,
      threadId: options.threadId,
      getFeatureFlagSnapshot: options.getFeatureFlagSnapshot,
      getParentRun: options.getParentRun,
      availableExtensionToolNames,
      resolveSymphonyLaunchContract: options.resolveSymphonyLaunchContract,
      resolveModelRuntimeProfile: options.resolveModelRuntimeProfile,
      resolveCapacityLease: options.resolveCapacityLease,
      prepareChildWorktree: options.prepareChildWorktree,
      runtime: options.runtime,
    })) {
      pi.registerTool(tool);
    }
  };
}
