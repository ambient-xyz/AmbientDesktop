import { describe, expect, it } from "vitest";

import type { AmbientPluginRegistry, CodexPluginSummary } from "../../../shared/pluginTypes";
import type { PermissionMode } from "../../../shared/permissionTypes";
import type {
  WorkflowDashboard,
  WorkflowNativeToolInvocationResult,
} from "../../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import type { RunWorkflowArtifactInput } from "../agentRuntimeWorkflowFacade";
import type { WorkflowNativeToolRuntime } from "../agentRuntimeWorkflowFacade";
import { createWorkflowNativeToolExtension } from "./agentRuntimeWorkflowNativeTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("createWorkflowNativeToolExtension", () => {
  it("registers workflow-native tools and forwards runtime dependencies", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const events: unknown[] = [];
    const pluginRegistration = { registeredName: "plugin_tool" } as any;
    const enabledPlugins: CodexPluginSummary[] = [{ id: "plugin-1", name: "Fixture" } as CodexPluginSummary];
    const pluginRegistry = { plugins: [], capabilities: [] } as unknown as AmbientPluginRegistry;
    const runInputs: RunWorkflowArtifactInput[] = [];
    const connectorAccountAuthorizer = {} as any;
    const permissionRequests: unknown[] = [];
    const pluginRegistrationRequests: unknown[] = [];
    let capturedRuntime: WorkflowNativeToolRuntime | undefined;

    createWorkflowNativeToolExtension({
      threadId: "thread-1",
      workspace: { path: "/tmp/workspace" },
      store: { getWorkspace: () => ({ path: "/tmp/project" }) } as any,
      browser: { navigate: async () => ({}) } as any,
      getThread: () => ({ permissionMode: "workspace" as PermissionMode, model: "ambient-test-model" }),
      getProjectPath: () => "/tmp/project",
      getPlanEditIntentKind: () => "question",
      getDefaultWorkflowThreadId: () => "workflow-thread-1",
      readSearchRoutingSettings: () => ({ webResearch: { providers: [] } } as any),
      getProviderStatus: (model) => ({ baseUrl: `https://provider.example/${model}` }),
      enabledCodexPlugins: async (workspacePath) => {
        pluginRegistrationRequests.push({ step: "enabled", workspacePath });
        return enabledPlugins;
      },
      buildCodexPluginMcpToolRegistrations: async (plugins, options) => {
        pluginRegistrationRequests.push({ step: "build", plugins, options });
        return [pluginRegistration];
      },
      listPluginRegistry: async (workspacePath) => {
        pluginRegistrationRequests.push({ step: "registry", workspacePath });
        return pluginRegistry;
      },
      resolvePermission: async (request, context) => {
        permissionRequests.push({ request, context });
        return true;
      },
      ensurePluginMcpToolTrusted: async () => true,
      callCodexPluginMcpTool: async () => ({
        content: [{ type: "text", text: "plugin result" }],
        details: {
          pluginId: "plugin-1",
          pluginName: "Fixture",
          serverName: "server",
          toolName: "plugin_tool",
        },
      }),
      connectorDescriptors: () => [{ id: "connector-1" } as any],
      connectorRegistrations: () => [{ descriptor: { id: "connector-registration-1" } } as any],
      connectorAccountAuthorizer: () => connectorAccountAuthorizer,
      emit: (event) => events.push(event),
      runWorkflowArtifact: async (input) => {
        runInputs.push(input);
        const allowed = await input.requestPermission?.({
          threadId: "thread-1",
          toolName: "workflow_tool",
          title: "Allow workflow?",
          message: "Allow workflow.",
          risk: "write-workspace",
        } as any);
        input.onRunStarted?.("run-1");
        input.onEvent?.();
        return { allowed } as unknown as WorkflowDashboard;
      },
      workflowNativeToolDescriptors: () => [descriptor()],
      invokeWorkflowNativeTool: async (runtime, invocation): Promise<WorkflowNativeToolInvocationResult> => {
        capturedRuntime = runtime;
        const pluginRegistrations = await runtime.pluginRegistrationsForWorkspace?.("/tmp/other-workspace");
        const dashboard = await runtime.runWorkflowArtifact?.({
          artifactId: "artifact-1",
          mode: "dry_run",
          runtime: "workflow",
          runLimits: { maxRunMs: 3_000 },
        });
        return {
          text: "Workflow native complete.",
          toolName: invocation.toolName,
          data: {
            invocation,
            pluginRegistrations,
            dashboard,
          },
        };
      },
    })({
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["workflow_fixture"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("workflow-native", { artifactId: "artifact-1" }, undefined, (update: any) => updates.push(update));

    expect(capturedRuntime).toMatchObject({
      workspacePath: "/tmp/workspace",
      permissionMode: "workspace",
      planEditIntentKind: "question",
      defaultWorkflowThreadId: "workflow-thread-1",
    });
    expect(capturedRuntime?.connectorDescriptors?.()).toEqual([{ id: "connector-1" }]);
    expect(pluginRegistrationRequests).toEqual([
      { step: "enabled", workspacePath: "/tmp/other-workspace" },
      {
        step: "build",
        plugins: enabledPlugins,
        options: { permissionMode: "workspace", workspacePath: "/tmp/other-workspace" },
      },
      { step: "enabled", workspacePath: "/tmp/workspace" },
      {
        step: "build",
        plugins: enabledPlugins,
        options: { permissionMode: "workspace", workspacePath: "/tmp/workspace" },
      },
      { step: "registry", workspacePath: "/tmp/workspace" },
    ]);
    expect(runInputs).toHaveLength(1);
    expect(runInputs[0]).toMatchObject({
      artifactId: "artifact-1",
      workspacePath: "/tmp/workspace",
      permissionMode: "workspace",
      model: "ambient-test-model",
      baseUrl: "https://provider.example/ambient-test-model",
      mode: "dry_run",
      runtime: "workflow",
      runLimits: { maxRunMs: 3_000 },
      pluginRegistrations: [pluginRegistration],
      pluginRegistry,
      connectorRegistrations: [{ descriptor: { id: "connector-registration-1" } }],
      connectorAccountAuthorizer,
    });
    expect(permissionRequests).toEqual([
      {
        request: expect.objectContaining({ toolName: "workflow_tool" }),
        context: {
          permissionMode: "workspace",
          threadId: "thread-1",
          projectPath: "/tmp/project",
          workspacePath: "/tmp/workspace",
        },
      },
    ]);
    expect(events).toEqual([
      {
        type: "workflow-run-started",
        runId: "run-1",
        artifactId: "artifact-1",
        workflowThreadId: "workflow-thread-1",
      },
      { type: "workflow-updated" },
      { type: "workflow-updated" },
    ]);
    expect(updates).toEqual([
      {
        content: [{ type: "text", text: "Inspecting workflow with workflow_fixture." }],
        details: {
          runtime: "workflow-native",
          toolName: "workflow_fixture",
          status: "running",
        },
      },
      {
        content: [{ type: "text", text: "Workflow preview run started: run-1." }],
        details: {
          runtime: "workflow-native",
          toolName: "workflow_fixture",
          status: "running",
          runId: "run-1",
        },
      },
    ]);
    expect(result).toMatchObject({
      content: [{ type: "text", text: "Workflow native complete." }],
      details: {
        runtime: "workflow-native",
        toolName: "workflow_fixture",
        status: "complete",
        data: {
          invocation: {
            toolName: "workflow_fixture",
            arguments: { artifactId: "artifact-1" },
          },
          pluginRegistrations: [pluginRegistration],
          dashboard: { allowed: true },
        },
      },
    });
  });
});

function descriptor(): DesktopToolDescriptor {
  return {
    name: "workflow_fixture",
    label: "Workflow Fixture",
    description: "Fixture workflow-native tool.",
    promptSnippet: "workflow_fixture: Fixture workflow-native tool.",
    promptGuidelines: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: true },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "workflow",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "recommended",
    defaultTimeoutMs: 1000,
  };
}
