import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { ambientModel } from "./agentRuntimeAmbientFacade";
import {
  AgentRuntimeExtensionAssemblyController,
  type AgentRuntimeExtensionAssemblyControllerOptions,
} from "./agentRuntimeExtensionAssemblyController";

describe("AgentRuntimeExtensionAssemblyController", () => {
  it("assembles send-time extensions in the existing order", () => {
    const controller = new AgentRuntimeExtensionAssemblyController(options());
    const actions = registeredActions(controller.createExtensionFactories({
      thread: thread(),
      workspace: workspace(),
      model: model(),
      apiKey: "test-api-key",
      tencentMemoryExtension: marker("tencent-memory"),
      interruptedToolCallRecoveryToolsAvailable: true,
      pluginMcpTools: [],
      callableWorkflowToolNames: ["workflow_one"],
      subagentToolNames: ["ambient_subagent_spawn"],
      initialCallableWorkflowRecordedPlaybooks: [],
      childCallableWorkflowToolNames: ["child_workflow"],
    }));

    expectSubsequence(actions, [
      "tool:model-context",
      "tool:tencent-memory",
      "tool:get_goal",
      "tool:interrupted-recovery",
      "tool:tool-runner",
      "tool:media_download",
      "tool:voice-settings",
      "tool:stt-settings",
      "tool:ambient_visual_minicpm_setup",
      "tool:local-deep-research",
      "tool:local-runtime",
      "tool:ambient_download_start",
      "tool:ambient_provider_catalog",
      "tool:messaging-gateway",
      "tool:web-research",
      "tool:ambient_search_preference_status",
      "tool:ambient_git_status",
      "tool:ambient_privileged_action_status",
      "tool:lambda-rlm",
      "tool:browser",
      "tool:plugin-install",
      "tool:google-workspace",
      "tool:workflow-native",
      "tool:plugin-mcp",
      "tool:callable-workflow",
      "tool:subagent",
      "event:session_start",
      "tool:permission-gate",
    ]);
  });

  it("skips conditional callable-workflow and subagent extensions when no active tool names exist", () => {
    const controller = new AgentRuntimeExtensionAssemblyController(options());
    const actions = registeredActions(controller.createExtensionFactories({
      thread: thread(),
      workspace: workspace(),
      model: model(),
      apiKey: undefined,
      interruptedToolCallRecoveryToolsAvailable: false,
      pluginMcpTools: [],
      callableWorkflowToolNames: [],
      subagentToolNames: [],
      initialCallableWorkflowRecordedPlaybooks: [],
      childCallableWorkflowToolNames: [],
    }));

    expect(actions).not.toContain("tool:callable-workflow");
    expect(actions).not.toContain("tool:subagent");
    expectSubsequence(actions, [
      "tool:plugin-mcp",
      "event:session_start",
      "tool:permission-gate",
    ]);
  });
});

function options(): AgentRuntimeExtensionAssemblyControllerOptions {
  const fakeStore = {
    getThread: () => thread(),
    listMessages: () => [],
    getThreadGoal: () => undefined,
    createThreadGoalIfAbsent: vi.fn(),
    markThreadGoalStatus: vi.fn(),
    getWorkspace: () => workspace(),
    getProjectBoardCardForExecutionThread: () => undefined,
    listOrchestrationRuns: () => [],
    recordProjectBoardTaskToolAction: vi.fn(),
  };
  const downloadSnapshot = {
    jobId: "download-1",
    status: "completed",
    url: "https://example.invalid/file.txt",
    destinationPath: "/workspace/file.txt",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
  return {
    store: fakeStore as unknown as AgentRuntimeExtensionAssemblyControllerOptions["store"],
    activeRuns: new Map(),
    finalizeCompletedThreadGoal: (goal) => goal,
    emitGoalUpdated: vi.fn(),
    browser: {
      navigate: vi.fn(),
      evaluate: vi.fn(),
      screenshot: vi.fn(),
    },
    openLocalPreview: vi.fn(),
    workflowPlanEditIntentByThreadId: new Map(),
    downloadService: {
      start: vi.fn(() => downloadSnapshot),
      status: vi.fn(() => downloadSnapshot),
      wait: vi.fn(async () => downloadSnapshot),
      cancel: vi.fn(() => downloadSnapshot),
    } as unknown as AgentRuntimeExtensionAssemblyControllerOptions["downloadService"],
    readSearchSettings: () => ({}),
    updateSearchSettings: undefined,
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    privilegedActionAdapter: {
      status: () => ({ adapter: "dry-run", available: true, label: "Dry run" }),
      request: vi.fn(),
    } as unknown as AgentRuntimeExtensionAssemblyControllerOptions["privilegedActionAdapter"],
    requestPrivilegedCredential: undefined,
    runCapabilityBuilderValidationWithPermission: undefined,
    createModelContextExtensionFactories: () => [marker("model-context")],
    createInterruptedToolCallRecoveryToolExtension: () => marker("interrupted-recovery"),
    createToolRunnerExtension: (_threadId, _workspace, toolRunnerOptions) =>
      marker(toolRunnerOptions?.interruptedToolCallRecoveryToolsAvailable ? "tool-runner" : "tool-runner-no-recovery"),
    createVoiceSettingsToolExtension: () => marker("voice-settings"),
    createSttSettingsToolExtension: () => marker("stt-settings"),
    getThreadForVision: () => ({ collaborationMode: "agent" }),
    getLatestBrowserScreenshotArtifact: () => undefined,
    vision: {
      setupMiniCpm: vi.fn(),
      analyzeMiniCpm: vi.fn(),
    },
    createLocalDeepResearchToolExtension: () => marker("local-deep-research"),
    createLocalRuntimeToolExtension: () => marker("local-runtime"),
    createMessagingGatewayToolExtension: () => marker("messaging-gateway"),
    createWebResearchToolExtension: () => marker("web-research"),
    createLambdaRlmToolExtension: () => marker("lambda-rlm"),
    createBrowserToolExtension: () => marker("browser"),
    createPluginInstallToolExtension: () => marker("plugin-install"),
    createGoogleWorkspaceSetupToolExtension: () => marker("google-workspace"),
    createWorkflowNativeToolExtension: () => marker("workflow-native"),
    createPluginMcpToolExtension: () => marker("plugin-mcp"),
    createCallableWorkflowToolExtension: () => marker("callable-workflow"),
    createSubagentToolExtension: () => marker("subagent"),
    createPermissionGateExtension: () => marker("permission-gate"),
  };
}

function marker(name: string): ExtensionFactory {
  return (pi) => {
    pi.registerTool({ name } as unknown as Parameters<typeof pi.registerTool>[0]);
  };
}

function registeredActions(factories: ExtensionFactory[]): string[] {
  const actions: string[] = [];
  const pi = {
    registerTool: (tool: unknown) => {
      if (tool && typeof tool === "object" && "name" in tool) {
        actions.push(`tool:${String((tool as { name: unknown }).name)}`);
      }
    },
    on: (eventName: string) => {
      actions.push(`event:${eventName}`);
    },
  } as unknown as Parameters<ExtensionFactory>[0];

  for (const factory of factories) {
    factory(pi);
  }
  return actions;
}

function expectSubsequence(values: string[], expected: string[]): void {
  let searchFrom = 0;
  for (const value of expected) {
    const index = values.indexOf(value, searchFrom);
    expect(index, `${value} should appear after index ${searchFrom}`).toBeGreaterThanOrEqual(0);
    searchFrom = index + 1;
  }
}

function thread() {
  return {
    id: "thread-1",
    title: "Thread",
    workspacePath: "/workspace",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-model",
    thinkingLevel: "medium",
  } as const;
}

function workspace() {
  return {
    path: "/workspace",
    name: "Workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/sessions",
  };
}

function model(): Model<"openai-completions"> {
  return ambientModel("ambient-model", "http://ambient.test/v1");
}
