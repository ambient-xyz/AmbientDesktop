import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionPromptResolution, PermissionRequest } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";
import type {
  AmbientWorkflowPlaybookDescription,
  AmbientWorkflowPlaybookInjection,
  AmbientWorkflowsArchiveInput,
  AmbientWorkflowsDescribeInput,
  AmbientWorkflowsInjectInput,
  AmbientWorkflowsRestoreVersionInput,
  AmbientWorkflowsSearchInput,
  AmbientWorkflowsSearchResponse,
  AmbientWorkflowsUnarchiveInput,
  AmbientWorkflowsUpdateInput,
} from "./agentRuntimeAmbientFacade";
import {
  capabilityBuilderValidationPreviewText,
  previewCapabilityBuilderPackage,
  type CapabilityBuilderValidateInput,
  type CapabilityBuilderValidateResult,
  validateCapabilityBuilderPackage,
} from "./agentRuntimeCapabilityBuilderFacade";
import { registerGoogleWorkspaceSetupTools, type AgentRuntimeGoogleWorkspaceTools } from "./agentRuntimeGoogleWorkspaceFacade";
import { createLambdaRlmToolExtension as createLambdaRlmToolsExtension } from "./agentRuntimeLambdaRlmTools";
import type { AgentRuntimeMcpToolOrchestration } from "./mcp/agentRuntimeMcpToolBridge";
import { getAmbientProviderStatus } from "./agentRuntimeProviderFacade";
import type { ResolveFirstPartyPluginPermissionInput } from "./agentRuntimeFirstPartyPluginPermission";
import { createAgentRuntimePluginInstallApplyCallbacks, createAgentRuntimePluginInstallToolExtension } from "./agentRuntimePluginInstallToolExtension";
import { AmbientPluginHost, createPluginMcpToolExtension as createPluginMcpToolsExtension, pluginStateReaderFromStore, type PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { BrowserService } from "./agentRuntimeBrowserFacade";
import { withBrowserToolHeartbeat } from "./browser-tools/agentRuntimeBrowserToolHeartbeat";
import type { AgentRuntimeInstallRouteGuard } from "./agentRuntimeInstallRouteGuard";
import type { AmbientWorkflowDescriptionState } from "./ambient-workflow/agentRuntimeAmbientWorkflowDescriptionState";
import type { AmbientCliPackageDescriptionState } from "./ambient-cli-package/agentRuntimeAmbientCliPackageDescriptionState";
import { createWorkflowNativeToolExtension as createWorkflowNativeToolsExtension } from "./workflow-support/agentRuntimeWorkflowNativeTools";
import { runWorkflowArtifact, type WorkflowConnectorAccountAuthorizer, type WorkflowConnectorDescriptor, type WorkflowConnectorRegistration } from "./agentRuntimeWorkflowFacade";
import { callableWorkflowRecordedPlaybooks } from "./agentRuntimeCallableWorkflowTools";
import { resolvePermissionWithGrants, type PermissionPromptRequester } from "./agentRuntimePermissionsFacade";
import type { AgentRuntimeProviderRuntimeController } from "./agentRuntimeProviderRuntimeController";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { AmbientFileAuthorityRequest } from "./agentRuntimePiFacade";

interface AgentRuntimePluginSetupFeatures {
  mcp?: {
    appVersion?: string;
  };
  googleWorkspace?: AgentRuntimeGoogleWorkspaceTools;
  workflowNativeTools?: {
    connectorDescriptors?: () => WorkflowConnectorDescriptor[];
    connectorRegistrations?: () => WorkflowConnectorRegistration[];
    connectorAccountAuthorizer?: () => WorkflowConnectorAccountAuthorizer | undefined;
  };
  search?: {
    readSettings?: () => SearchRoutingSettings;
  };
  workflowRecordings?: {
    search?: (input: AmbientWorkflowsSearchInput) => Promise<AmbientWorkflowsSearchResponse> | AmbientWorkflowsSearchResponse;
    describe?: (input: AmbientWorkflowsDescribeInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
    inject?: (input: AmbientWorkflowsInjectInput) => Promise<AmbientWorkflowPlaybookInjection> | AmbientWorkflowPlaybookInjection;
    update?: (input: AmbientWorkflowsUpdateInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
    archive?: (input: AmbientWorkflowsArchiveInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
    unarchive?: (input: AmbientWorkflowsUnarchiveInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
    restoreVersion?: (input: AmbientWorkflowsRestoreVersionInput) => Promise<AmbientWorkflowPlaybookDescription> | AmbientWorkflowPlaybookDescription;
  };
}

export interface AgentRuntimeCapabilityBuilderValidationWithPermissionInput {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  input: CapabilityBuilderValidateInput;
  onUpdate?: (update: {
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
  }) => void;
  reason?: "privileged-action-succeeded";
}

export interface AgentRuntimePluginSetupToolControllerOptions {
  store: ProjectStore;
  browser: BrowserService;
  permissions: PermissionPromptRequester & {
    request: (
      request: Omit<PermissionRequest, "id">,
      options?: { onRequest?: (request: PermissionRequest) => void },
    ) => Promise<PermissionPromptResolution>;
  };
  pluginHost: AmbientPluginHost;
  mcpToolOrchestration: Pick<AgentRuntimeMcpToolOrchestration, "createMcpRuntime">;
  installRouteGuard: AgentRuntimeInstallRouteGuard;
  ambientCliPackageDescriptionState: AmbientCliPackageDescriptionState;
  ambientWorkflowDescriptionState: AmbientWorkflowDescriptionState;
  providerRuntime: Pick<AgentRuntimeProviderRuntimeController, "completeRegisteredVoiceProviderSetup">;
  workflowPlanEditIntentByThreadId: Map<string, WorkflowPlanEditIntentKind>;
  workflowPlanEditWorkflowThreadByThreadId: Map<string, string>;
  features: AgentRuntimePluginSetupFeatures;
  fileAuthorityRootPathsForThread: (threadId: string, access: "read" | "write") => string[];
  includeWorkspaceRootAuthorityForThread: (threadId: string) => boolean;
  requestFileAuthority: (
    threadId: string,
    workspace: WorkspaceState,
    request: AmbientFileAuthorityRequest,
  ) => Promise<boolean>;
  resolveFirstPartyPluginPermission: (input: ResolveFirstPartyPluginPermissionInput) => Promise<boolean>;
  ensurePluginMcpToolTrusted: (
    threadId: string,
    workspace: WorkspaceState,
    registration: PluginMcpToolRegistration,
  ) => Promise<boolean>;
  revokePluginGrantsForLabels: (labelPrefixes: string[]) => number;
  markPluginToolsStale: (threadId: string) => void;
  emitBrowserState: () => Promise<void>;
  recordBrowserAudit: (
    threadId: string,
    toolName: string,
    risk: "browser-network" | "browser-control" | "browser-profile" | "browser-login" | "browser-credential",
    detail: string | undefined,
  ) => void;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  emit: (event: DesktopEvent) => void;
}

export class AgentRuntimePluginSetupToolController {
  constructor(private readonly options: AgentRuntimePluginSetupToolControllerOptions) {}

  createWorkflowNativeToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createWorkflowNativeToolsExtension({
      threadId,
      workspace,
      store: this.options.store,
      browser: this.options.browser,
      getThread: () => this.options.store.getThread(threadId),
      getProjectPath: () => this.options.store.getWorkspace().path,
      getPlanEditIntentKind: () => this.options.workflowPlanEditIntentByThreadId.get(threadId),
      getDefaultWorkflowThreadId: () => this.options.workflowPlanEditWorkflowThreadByThreadId.get(threadId),
      readSearchRoutingSettings: () => this.options.features.search?.readSettings?.(),
      getProviderStatus: (model) => getAmbientProviderStatus(model),
      enabledCodexPlugins: (workspacePath) => this.options.pluginHost.enabledCodexPlugins(workspacePath, pluginStateReaderFromStore(this.options.store)),
      buildCodexPluginMcpToolRegistrations: (plugins, options) => this.options.pluginHost.buildCodexPluginMcpToolRegistrations(plugins, options),
      listPluginRegistry: (workspacePath) => this.options.pluginHost.listRegistry(workspacePath, pluginStateReaderFromStore(this.options.store)),
      resolvePermission: async (request, context) =>
        (
          await resolvePermissionWithGrants({
            store: this.options.store,
            requester: this.options.permissions,
            request,
            context,
          })
        ).allowed,
      ensurePluginMcpToolTrusted: (registration) => this.options.ensurePluginMcpToolTrusted(threadId, workspace, registration),
      callCodexPluginMcpTool: (plan, invocation, options) => this.options.pluginHost.callCodexPluginMcpTool(plan, invocation, options),
      connectorDescriptors: this.options.features.workflowNativeTools?.connectorDescriptors,
      connectorRegistrations: () => this.options.features.workflowNativeTools?.connectorRegistrations?.(),
      connectorAccountAuthorizer: () => this.options.features.workflowNativeTools?.connectorAccountAuthorizer?.(),
      emit: (event) => this.options.emit(event as DesktopEvent),
      runWorkflowArtifact,
    });
  }

  createPluginMcpToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    registrations: PluginMcpToolRegistration[],
  ): ExtensionFactory {
    return createPluginMcpToolsExtension({
      workspace,
      registrations,
      getThread: () => this.options.store.getThread(threadId),
      ensurePluginMcpToolTrusted: (registration) => this.options.ensurePluginMcpToolTrusted(threadId, workspace, registration),
      callCodexPluginMcpTool: (plan, invocation, options) => this.options.pluginHost.callCodexPluginMcpTool(plan, invocation, options),
    });
  }

  createLambdaRlmToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    model: Model<"openai-completions">,
    apiKey: string | undefined,
  ): ExtensionFactory {
    return createLambdaRlmToolsExtension({
      workspace,
      authorityRootPaths: () => this.options.fileAuthorityRootPathsForThread(threadId, "read"),
      includeWorkspaceRootAuthority: () => this.options.includeWorkspaceRootAuthorityForThread(threadId),
      requestFileAuthority: (request) => this.options.requestFileAuthority(threadId, workspace, request),
      model,
      apiKey,
    });
  }

  createPluginInstallToolExtension(
    threadId: string,
    workspace: WorkspaceState,
    model: Model<"openai-completions">,
    apiKey: string | undefined,
  ): ExtensionFactory {
    return createAgentRuntimePluginInstallToolExtension({
      threadId,
      workspace,
      model,
      apiKey,
      mcpAppVersion: this.options.features.mcp?.appVersion,
      getThread: (id) => this.options.store.getThread(id),
      createMcpRuntime: this.options.mcpToolOrchestration.createMcpRuntime,
      recordMcpAutowirePlan: () => this.options.installRouteGuard.recordMcpAutowirePlan(threadId),
      recordInstallRoutePlan: (plan) => this.options.installRouteGuard.recordInstallRoutePlan(threadId, plan),
      browserNavigate: (input) => this.options.browser.navigate(input),
      emitBrowserState: () => this.options.emitBrowserState(),
      recordSetupFinalReportBrowserAudit: (input) =>
        this.options.recordBrowserAudit(threadId, "ambient_setup_final_report", "browser-network", input.url),
      withBrowserToolHeartbeat,
      ...createAgentRuntimePluginInstallApplyCallbacks({
        pluginHost: this.options.pluginHost,
        store: this.options.store,
        markPluginToolsStale: () => this.options.markPluginToolsStale(threadId),
      }),
      resolveFirstPartyPluginPermission: (input) => this.options.resolveFirstPartyPluginPermission(input),
      emitDesktopEvent: (event) => this.options.emit(event),
      latestInstallRouteLane: () => this.options.installRouteGuard.latestInstallRouteLane(threadId),
      mcpAutowirePlanned: () => this.options.installRouteGuard.mcpAutowirePlanned(threadId),
      runCapabilityBuilderValidationWithPermission: (input) => this.runCapabilityBuilderValidationWithPermission(input),
      completeRegisteredVoiceProviderSetup: (thread, workspace, provider) =>
        this.options.providerRuntime.completeRegisteredVoiceProviderSetup(thread, workspace, provider),
      emitAmbientCliSecretRequested: (event) => this.options.emit({ type: "ambient-cli-secret-requested", ...event }),
      isAmbientCliPackageDescribed: (packageId, packageName) =>
        this.options.ambientCliPackageDescriptionState.isDescribed(threadId, packageId, packageName),
      markAmbientCliPackageDescribed: (packageId, packageName) =>
        this.options.ambientCliPackageDescriptionState.markDescribed(threadId, packageId, packageName),
      ambientWorkflowStore: this.options.store,
      workflowRecordings: this.options.features.workflowRecordings,
      markAmbientWorkflowPlaybookDescribed: (id, version) =>
        this.options.ambientWorkflowDescriptionState.markDescribed(threadId, id, version),
      isAmbientWorkflowPlaybookDescribed: (id, version) =>
        this.options.ambientWorkflowDescriptionState.isDescribed(threadId, id, version),
      getFeatureFlagSnapshot: () => this.options.getFeatureFlagSnapshot(),
      getCallableWorkflowRecordedPlaybooks: () => callableWorkflowRecordedPlaybooks(this.options.store),
      revokePluginGrantsForLabels: (labels) => this.options.revokePluginGrantsForLabels(labels),
    });
  }

  async runCapabilityBuilderValidationWithPermission(
    input: AgentRuntimeCapabilityBuilderValidationWithPermissionInput,
  ): Promise<CapabilityBuilderValidateResult> {
    const detail = await capabilityBuilderValidationPreviewText(input.workspace.path, input.input);
    const preview = await previewCapabilityBuilderPackage(input.workspace.path, input.input);
    const allowed = await this.options.resolveFirstPartyPluginPermission({
      thread: input.thread,
      workspace: input.workspace,
      toolName: "ambient_capability_builder_validate",
      title: `Validate Ambient capability "${preview.packageName}"?`,
      message: input.reason === "privileged-action-succeeded"
        ? "Ambient wants to resume validation after a successful privileged action result."
        : "Ambient wants to run health checks and smoke tests for a managed draft capability package.",
      detail,
      grantTargetLabel: `Validate capability ${preview.packageName}`,
      grantTargetIdentity: ["ambient_capability_builder_validate", input.workspace.path, preview.packageName, String(input.input.includeSmokeTests !== false)].join("\0"),
      allowedReason: "Capability Builder validation approved by Ambient permission grant policy.",
      deniedReason: "Capability Builder validation prompt denied or timed out.",
    });
    if (!allowed) throw new Error("Capability Builder validation blocked by approval prompt.");
    input.onUpdate?.({
      content: [{ type: "text", text: `Validating Ambient capability "${preview.packageName}".` }],
      details: {
        runtime: "ambient-capability-builder",
        toolName: "ambient_capability_builder_validate",
        status: "running",
        packageName: preview.packageName,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
    return validateCapabilityBuilderPackage(input.workspace.path, input.input);
  }

  createGoogleWorkspaceSetupToolExtension(workspace: WorkspaceState): ExtensionFactory {
    return (pi) => {
      registerGoogleWorkspaceSetupTools(pi, {
        workspace,
        googleWorkspace: this.options.features.googleWorkspace,
      });
    };
  }
}
