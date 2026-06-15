import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type {
  AmbientPluginRegistry,
  CodexPluginSummary,
  PermissionMode,
  PermissionRequest,
  SearchRoutingSettings,
  ThreadSummary,
  WorkflowDashboard,
  WorkflowNativeToolInvocationResult,
  WorkflowNativeToolName,
  WorkspaceState,
} from "../shared/types";
import { piToolFieldsFromDescriptor } from "./desktopToolRegistry";
import type { DesktopToolDescriptor } from "./desktopToolRegistry";
import type { ProjectStore } from "./projectStore";
import type {
  AmbientPluginMcpOptions,
  PluginMcpLaunchPlan,
  PluginMcpToolInvocation,
  PluginMcpToolInvocationResult,
  PluginMcpToolRegistration,
} from "./plugins/pluginHost";
import type { RunWorkflowArtifactInput } from "./workflowRunService";
import {
  invokeWorkflowNativeTool as defaultInvokeWorkflowNativeTool,
  workflowNativeToolDescriptors as defaultWorkflowNativeToolDescriptors,
  type WorkflowNativeRunArtifactInput,
  type WorkflowNativeToolRuntime,
} from "./workflowNativeTools";
import type { WorkflowBrowserAdapter } from "./workflowDesktopTools";
import type { WorkflowPlanEditIntentKind } from "../shared/workflowThreadPlanEdit";
import type { WorkflowConnectorAccountAuthorizer, WorkflowConnectorDescriptor, WorkflowConnectorRegistration } from "./workflowConnectors";

export interface WorkflowNativeToolExtensionOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  store: ProjectStore;
  browser?: WorkflowBrowserAdapter;
  getThread: () => Pick<ThreadSummary, "permissionMode" | "model">;
  getProjectPath: () => string;
  getPlanEditIntentKind: () => WorkflowPlanEditIntentKind | undefined;
  getDefaultWorkflowThreadId: () => string | undefined;
  readSearchRoutingSettings: () => SearchRoutingSettings | undefined;
  getProviderStatus: (model: string) => { baseUrl?: string };
  enabledCodexPlugins: (workspacePath: string) => Promise<CodexPluginSummary[]>;
  buildCodexPluginMcpToolRegistrations: (
    plugins: CodexPluginSummary[],
    options: { permissionMode: PermissionMode; workspacePath: string },
  ) => Promise<PluginMcpToolRegistration[]>;
  listPluginRegistry: (workspacePath: string) => Promise<AmbientPluginRegistry>;
  resolvePermission: (
    request: Omit<PermissionRequest, "id">,
    context: {
      permissionMode: PermissionMode;
      threadId: string;
      projectPath: string;
      workspacePath: string;
    },
  ) => Promise<boolean>;
  ensurePluginMcpToolTrusted: (registration: PluginMcpToolRegistration) => Promise<boolean>;
  callCodexPluginMcpTool: (
    plan: PluginMcpLaunchPlan,
    invocation: PluginMcpToolInvocation,
    options?: AmbientPluginMcpOptions,
  ) => Promise<PluginMcpToolInvocationResult>;
  connectorDescriptors?: () => WorkflowConnectorDescriptor[];
  connectorRegistrations?: () => WorkflowConnectorRegistration[] | undefined;
  connectorAccountAuthorizer?: () => WorkflowConnectorAccountAuthorizer | undefined;
  emit: (event: unknown) => void;
  runWorkflowArtifact: (input: RunWorkflowArtifactInput) => Promise<WorkflowDashboard>;
  workflowNativeToolDescriptors?: () => DesktopToolDescriptor[];
  invokeWorkflowNativeTool?: (
    runtime: WorkflowNativeToolRuntime,
    invocation: { toolName: WorkflowNativeToolName; arguments: Record<string, unknown> },
  ) => Promise<WorkflowNativeToolInvocationResult>;
}

export function createWorkflowNativeToolExtension(options: WorkflowNativeToolExtensionOptions): ExtensionFactory {
  return (pi) => {
    for (const descriptor of (options.workflowNativeToolDescriptors ?? defaultWorkflowNativeToolDescriptors)()) {
      const fields = piToolFieldsFromDescriptor(descriptor);
      pi.registerTool({
        ...fields,
        parameters: fields.parameters as any,
        executionMode: "sequential",
        execute: async (_toolCallId, params, _signal, onUpdate) => {
          onUpdate?.({
            content: [{ type: "text", text: `Inspecting workflow with ${descriptor.name}.` }],
            details: {
              runtime: "workflow-native",
              toolName: descriptor.name,
              status: "running",
            },
          });
          const thread = options.getThread();
          const searchRoutingSettings = options.readSearchRoutingSettings();
          const invokeWorkflowNativeTool = options.invokeWorkflowNativeTool ?? defaultInvokeWorkflowNativeTool;
          const result = await invokeWorkflowNativeTool(
            {
              store: options.store,
              workspacePath: options.workspace.path,
              permissionMode: thread.permissionMode,
              planEditIntentKind: options.getPlanEditIntentKind(),
              defaultWorkflowThreadId: options.getDefaultWorkflowThreadId(),
              runWorkflowArtifact: (runInput) => runWorkflowArtifact(runInput, descriptor.name, options, onUpdate),
              connectorDescriptors: options.connectorDescriptors,
              ...(searchRoutingSettings ? { searchRoutingSettings } : {}),
              pluginRegistrationsForWorkspace: async (workspacePath) => {
                const enabledPlugins = await options.enabledCodexPlugins(workspacePath);
                return options.buildCodexPluginMcpToolRegistrations(enabledPlugins, {
                  permissionMode: thread.permissionMode,
                  workspacePath,
                });
              },
            },
            {
              toolName: descriptor.name as WorkflowNativeToolName,
              arguments: params as Record<string, unknown>,
            },
          );
          return {
            content: [{ type: "text", text: result.text }],
            details: {
              runtime: "workflow-native",
              toolName: result.toolName,
              status: "complete",
              data: result.data,
            },
          };
        },
      });
    }
  };
}

async function runWorkflowArtifact(
  runInput: WorkflowNativeRunArtifactInput,
  toolName: string,
  options: WorkflowNativeToolExtensionOptions,
  onUpdate: Parameters<Parameters<ExtensionFactory>[0]["registerTool"]>[0]["execute"] extends (...args: infer Args) => unknown ? Args[3] : never,
): Promise<WorkflowDashboard> {
  const runThread = options.getThread();
  const provider = options.getProviderStatus(runThread.model);
  const enabledPlugins = await options.enabledCodexPlugins(options.workspace.path);
  const pluginRegistrations = await options.buildCodexPluginMcpToolRegistrations(enabledPlugins, {
    permissionMode: runThread.permissionMode,
    workspacePath: options.workspace.path,
  });
  const pluginRegistry = await options.listPluginRegistry(options.workspace.path);
  return options.runWorkflowArtifact({
    store: options.store,
    artifactId: runInput.artifactId,
    workspacePath: options.workspace.path,
    permissionMode: runThread.permissionMode,
    browser: options.browser,
    requestPermission: (request) =>
      options.resolvePermission(request, {
        permissionMode: runThread.permissionMode,
        threadId: options.threadId,
        projectPath: options.getProjectPath(),
        workspacePath: options.workspace.path,
      }),
    pluginRegistrations,
    pluginRegistry,
    ensurePluginTrusted: options.ensurePluginMcpToolTrusted,
    pluginCaller: options.callCodexPluginMcpTool,
    connectorRegistrations: options.connectorRegistrations?.(),
    connectorAccountAuthorizer: options.connectorAccountAuthorizer?.(),
    model: runThread.model,
    baseUrl: provider.baseUrl,
    mode: runInput.mode,
    runtime: runInput.runtime,
    runLimits: runInput.runLimits,
    onRunStarted: (runId) => {
      onUpdate?.({
        content: [{ type: "text", text: `Workflow preview run started: ${runId}.` }],
        details: {
          runtime: "workflow-native",
          toolName,
          status: "running",
          runId,
        },
      });
      options.emit({
        type: "workflow-run-started",
        runId,
        artifactId: runInput.artifactId,
        workflowThreadId: options.getDefaultWorkflowThreadId(),
      });
      options.emit({ type: "workflow-updated" });
    },
    onEvent: () => options.emit({ type: "workflow-updated" }),
  });
}
