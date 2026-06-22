import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { ContextUsageSnapshot, ThreadSummary } from "../../shared/threadTypes";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  createAgentRuntimeServiceControllerCallbackAdapters,
  createAgentRuntimeSubagentWorkflowCallbackAdapters,
  type AgentRuntimeServiceControllerRuntimeCallbacks,
} from "./agentRuntimeControllerCallbackAdapters";
import type { AgentRuntimeSubagentWorkflowControllerOptions } from "./agentRuntimeSubagentWorkflowControllers";

describe("AgentRuntime controller callback adapters", () => {
  it("keeps service controller callbacks as pass-throughs and adapts unavailable context snapshots", () => {
    const unavailableContextUsageSnapshot = vi.fn((thread: ThreadSummary, message: string) =>
      contextUsageSnapshot(thread.id, message));
    const runtime = serviceRuntimeCallbacks({ unavailableContextUsageSnapshot });
    const store = {
      recordContextUsageSnapshot: vi.fn((snapshot) => ({
        ...snapshot,
        updatedAt: "2026-06-22T00:00:00.000Z",
      })),
    } as unknown as Pick<ProjectStore, "recordContextUsageSnapshot">;

    const callbacks = createAgentRuntimeServiceControllerCallbackAdapters({ store, runtime });
    const recorded = callbacks.recordUnavailableContextUsageSnapshot(thread(), "No active Pi session.");

    expect(callbacks.commitThreadPiSessionFile).toBe(runtime.commitThreadPiSessionFile);
    expect(callbacks.createCallableWorkflowToolExtension).toBe(runtime.createCallableWorkflowToolExtension);
    expect(callbacks.send).toBe(runtime.send);
    expect(unavailableContextUsageSnapshot).toHaveBeenCalledWith(expect.objectContaining({ id: "thread-1" }), "No active Pi session.");
    expect(store.recordContextUsageSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      diagnostics: expect.objectContaining({ message: "No active Pi session." }),
    }));
    expect(recorded.updatedAt).toBe("2026-06-22T00:00:00.000Z");
  });

  it("keeps subagent/workflow callbacks as explicit pass-throughs", () => {
    const callbacks = {
      abortChildThread: vi.fn(async () => undefined),
      currentFeatureFlagSnapshot: vi.fn(() => featureFlagSnapshot()),
      emit: vi.fn(),
      emitCallableWorkflowTaskUpdated: vi.fn(),
      ensurePluginMcpToolTrusted: vi.fn(async () => true),
      prepareChildWorktree: vi.fn(async () => undefined),
      recordContextUsageSnapshot: vi.fn(() => contextUsageSnapshot("thread-1", "recorded")),
      resolveModelRuntimeProfile: vi.fn(() => ({})),
      send: vi.fn(async () => undefined),
    } as unknown as AgentRuntimeSubagentWorkflowControllerOptions["callbacks"];

    expect(createAgentRuntimeSubagentWorkflowCallbackAdapters(callbacks)).toBe(callbacks);
  });
});

function serviceRuntimeCallbacks(input: {
  unavailableContextUsageSnapshot: AgentRuntimeServiceControllerRuntimeCallbacks["unavailableContextUsageSnapshot"];
}): AgentRuntimeServiceControllerRuntimeCallbacks {
  return {
    commitThreadPiSessionFile: vi.fn(async () => undefined),
    createCallableWorkflowToolExtension: vi.fn(() => extensionFactory()),
    createInterruptedToolCallRecoveryToolExtension: vi.fn(() => extensionFactory()),
    createPermissionGateExtension: vi.fn(() => extensionFactory()),
    createSubagentToolExtension: vi.fn(() => extensionFactory()),
    currentFeatureFlagSnapshot: vi.fn(() => featureFlagSnapshot()),
    emit: vi.fn(),
    ensurePluginMcpToolTrusted: vi.fn(async () => true),
    fileAuthorityRootPathsForThread: vi.fn(() => []),
    includeWorkspaceRootAuthorityForThread: vi.fn(() => false),
    markPluginToolsStale: vi.fn(),
    recordContextUsageSnapshot: vi.fn(() => contextUsageSnapshot("thread-1", "recorded")),
    requestFileAuthorityForThread: vi.fn(async () => true),
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    resolveToolCallPermission: vi.fn(async () => undefined),
    revokePluginGrantsForLabels: vi.fn(() => 0),
    runCapabilityBuilderValidationWithPermission: vi.fn(async () => undefined),
    send: vi.fn(async () => undefined),
    tryRouteBrowserContentThroughScrapling: vi.fn(),
    unavailableContextUsageSnapshot: input.unavailableContextUsageSnapshot,
  } as unknown as AgentRuntimeServiceControllerRuntimeCallbacks;
}

function thread(): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    workspacePath: "/workspace",
  } as ThreadSummary;
}

function contextUsageSnapshot(threadId: string, message: string): ContextUsageSnapshot {
  return {
    threadId,
    source: "unavailable",
    compactionCount: 0,
    updatedAt: "2026-06-22T00:00:00.000Z",
    diagnostics: {
      activeSession: false,
      message,
    },
  };
}

function featureFlagSnapshot(): AmbientFeatureFlagSnapshot {
  return {
    flags: {
      "ambient.memory.tencentdb": {
        id: "ambient.memory.tencentdb",
        enabled: true,
        source: "default",
        defaultEnabled: true,
      },
      "ambient.slashCommands": {
        id: "ambient.slashCommands",
        enabled: false,
        source: "default",
        defaultEnabled: false,
      },
      "ambient.subagents": {
        id: "ambient.subagents",
        enabled: false,
        source: "default",
        defaultEnabled: false,
      },
    },
    generatedAt: "2026-06-22T00:00:00.000Z",
    schemaVersion: "ambient-feature-flags-v1",
  };
}

function extensionFactory(): ExtensionFactory {
  return (() => undefined) as unknown as ExtensionFactory;
}
