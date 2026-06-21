import type { AgentToolResult, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/workspaceTypes";
import type {
  SearchRoutingSettings,
  WebResearchProviderRole,
} from "../../shared/webResearchTypes";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { McpToolCallResult } from "./agentRuntimeMcpFacade";
import {
  discoverAmbientCliPackages,
} from "./agentRuntimeAmbientCliFacade";
import {
  createAgentRuntimeLocalDeepResearchWebBroker,
  type LocalDeepResearchProviderSnapshot,
} from "./agentRuntimeLocalDeepResearchFacade";
import {
  tryRouteBrowserContentThroughScrapling as routeBrowserContentThroughScrapling,
  type ScraplingBrowserRouteInput,
  type ScraplingBrowserRoutePermissionRequest,
} from "./agentRuntimeScraplingBrowserRoute";
import { unknownErrorMessage } from "./agentRuntimeUtilityHelpers";
import { withBrowserToolHeartbeat } from "./browser-tools/agentRuntimeBrowserToolHeartbeat";
import { truncateDiagnosticText } from "./provider-continuation/agentRuntimeProviderDiagnostics";
import {
  createAgentRuntimeWebResearchToolExtension,
  type AgentRuntimeWebResearchToolExtensionOptions,
} from "./web-research/agentRuntimeWebResearchToolExtension";
import {
  tryCallWebResearchMcpProvider as callWebResearchMcpProvider,
  type WebResearchMcpProviderPermissionRequest,
  type WebResearchMcpProviderRouteInput,
} from "./web-research/agentRuntimeWebResearchMcpProviderRoute";
import {
  discoverWebResearchMcpProviderTools as discoverMcpProviderToolsForWebResearch,
} from "./web-research/agentRuntimeWebResearchMcpProviderTools";
import {
  webResearchProviderPlanForInput as buildWebResearchProviderPlanForInput,
} from "./web-research/agentRuntimeWebResearchProviderPlan";
import {
  webResearchBrowserFallbackAllowedForThread,
  webResearchSymphonyRoutingForThread,
  type AgentRuntimeWebResearchSymphonyRouting,
} from "./web-research/agentRuntimeWebResearchSymphonyRouting";
import {
  webResearchExaApiKeyFromEnv,
  webResearchRuntimeSummaryForWorkspace as buildWebResearchRuntimeSummary,
  type WebResearchRuntimeSummary,
} from "./web-research/agentRuntimeWebResearchRuntimeSummary";
import type { AgentRuntimeMcpToolOrchestration } from "./mcp/agentRuntimeMcpToolBridge";

export type AgentRuntimeLocalDeepResearchWebBrokerInput = Parameters<
  typeof createAgentRuntimeLocalDeepResearchWebBroker
>[0];

type AgentRuntimeWebResearchStore = Pick<
  ProjectStore,
  "getThread" | "getSubagentRun" | "listSubagentToolScopeSnapshots" | "listPermissionGrants"
>;

type AgentRuntimeWebResearchBrowserAuditRisk =
  | "browser-network"
  | "browser-control"
  | "browser-profile"
  | "browser-login"
  | "browser-credential";

export interface AgentRuntimeWebResearchControllerOptions {
  store: AgentRuntimeWebResearchStore;
  createMcpRuntime: AgentRuntimeMcpToolOrchestration["createMcpRuntime"];
  readSearchSettings: () => SearchRoutingSettings | undefined;
  mcpEnv: () => NodeJS.ProcessEnv | undefined;
  prepareBrowserToolProfile: AgentRuntimeWebResearchToolExtensionOptions["prepareBrowserToolProfile"];
  browserSearch: AgentRuntimeWebResearchToolExtensionOptions["browserSearch"];
  browserContent: AgentRuntimeWebResearchToolExtensionOptions["browserContent"];
  emitBrowserState: AgentRuntimeWebResearchToolExtensionOptions["emitBrowserState"];
  recordBrowserAudit: (
    threadId: string,
    toolName: string,
    risk: AgentRuntimeWebResearchBrowserAuditRisk,
    detail: string | undefined,
  ) => void;
  resolveFirstPartyPluginPermission: (
    input: WebResearchMcpProviderPermissionRequest | ScraplingBrowserRoutePermissionRequest,
  ) => Promise<boolean> | boolean;
  discoverAmbientCliPackages?: typeof discoverAmbientCliPackages;
}

export interface AgentRuntimeWebResearchProviderPlanOptions {
  allowBrowserFallback?: boolean;
  symphonyRouting?: AgentRuntimeWebResearchSymphonyRouting;
}

export class AgentRuntimeWebResearchController {
  private readonly discoverAmbientCliPackages: typeof discoverAmbientCliPackages;

  constructor(private readonly options: AgentRuntimeWebResearchControllerOptions) {
    this.discoverAmbientCliPackages = options.discoverAmbientCliPackages ?? discoverAmbientCliPackages;
  }

  createWebResearchToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createAgentRuntimeWebResearchToolExtension({
      threadId,
      workspace,
      readSettings: () => this.options.readSearchSettings(),
      discoverAmbientCliPackages: this.discoverAmbientCliPackages,
      discoverMcpProviderTools: (signal) => this.discoverWebResearchMcpProviderTools(workspace, signal),
      webResearchRuntimeSummary: (signal) => this.webResearchRuntimeSummary(workspace, signal),
      webResearchProviderPlanForInput: (input, role, signal) =>
        this.webResearchProviderPlanForInput(workspace, input, role, signal, undefined, {
          allowBrowserFallback: webResearchBrowserFallbackAllowedForThread(this.options.store, threadId),
          symphonyRouting: webResearchSymphonyRoutingForThread(this.options.store, threadId),
        }),
      webResearchExaApiKey: () => this.webResearchExaApiKey(),
      prepareBrowserToolProfile: (input, sourceThreadId, onUpdate) =>
        this.options.prepareBrowserToolProfile(input, sourceThreadId, onUpdate),
      browserSearch: (input) => this.options.browserSearch(input),
      browserContent: (input) => this.options.browserContent(input),
      emitBrowserState: () => this.options.emitBrowserState(),
      recordBrowserAudit: (toolName, risk, detail) =>
        this.options.recordBrowserAudit(threadId, toolName, risk, detail),
      tryRouteBrowserContentThroughScrapling: (input) => this.tryRouteBrowserContentThroughScrapling(input),
      tryCallWebResearchMcpProvider: (input) => this.tryCallWebResearchMcpProvider(input),
      withBrowserToolHeartbeat,
      formatErrorMessage: (error, maxChars) => truncateDiagnosticText(unknownErrorMessage(error), maxChars),
    });
  }

  createLocalDeepResearchWebBroker(input: AgentRuntimeLocalDeepResearchWebBrokerInput): ReturnType<
    typeof createAgentRuntimeLocalDeepResearchWebBroker
  > {
    return createAgentRuntimeLocalDeepResearchWebBroker(input, {
      webResearchProviderPlanForInput: (workspace, rawInput, role, signal, providerSnapshot) =>
        this.webResearchProviderPlanForInput(workspace, rawInput, role, signal, providerSnapshot),
      webResearchExaApiKey: () => this.webResearchExaApiKey(),
      prepareBrowserToolProfile: (rawInput, sourceThreadId, onUpdate) =>
        this.options.prepareBrowserToolProfile(rawInput, sourceThreadId, onUpdate),
      browserSearch: (browserInput) => this.options.browserSearch(browserInput),
      browserContent: (browserInput) => this.options.browserContent(browserInput),
      emitBrowserState: () => this.options.emitBrowserState(),
      recordBrowserAudit: (threadId, toolName, risk, detail) =>
        this.options.recordBrowserAudit(threadId, toolName, risk, detail),
      tryRouteBrowserContentThroughScrapling: (routeInput) => this.tryRouteBrowserContentThroughScrapling(routeInput),
      tryCallWebResearchMcpProvider: (routeInput) => this.tryCallWebResearchMcpProvider(routeInput),
      withBrowserToolHeartbeat,
      formatErrorMessage: (error, maxChars) => truncateDiagnosticText(unknownErrorMessage(error), maxChars),
      truncateDiagnosticText,
    });
  }

  webResearchProviderPlanForInput(
    workspace: WorkspaceState,
    input: Record<string, unknown>,
    role: WebResearchProviderRole,
    signal?: AbortSignal,
    providerSnapshot?: LocalDeepResearchProviderSnapshot,
    options: AgentRuntimeWebResearchProviderPlanOptions = {},
  ) {
    return buildWebResearchProviderPlanForInput({
      workspace,
      input,
      role,
      signal,
      providerSnapshot,
      allowBrowserFallback: options.allowBrowserFallback,
      symphonyRouting: options.symphonyRouting,
    }, {
      readSettings: () => this.options.readSearchSettings(),
      discoverAmbientCliPackages: this.discoverAmbientCliPackages,
      discoverMcpProviderTools: (planSignal) => this.discoverWebResearchMcpProviderTools(workspace, planSignal),
    });
  }

  discoverWebResearchMcpProviderTools(workspace: WorkspaceState, signal?: AbortSignal) {
    return discoverMcpProviderToolsForWebResearch(workspace, signal, {
      createMcpRuntime: this.options.createMcpRuntime,
    });
  }

  tryCallWebResearchMcpProvider(
    input: WebResearchMcpProviderRouteInput,
  ): Promise<{ result?: McpToolCallResult; fallbackReason?: string }> {
    return callWebResearchMcpProvider(input, {
      createMcpRuntime: this.options.createMcpRuntime,
      getThread: (threadId) => this.options.store.getThread(threadId),
      listPermissionGrants: () => this.options.store.listPermissionGrants(),
      resolveFirstPartyPluginPermission: (permissionInput) =>
        this.options.resolveFirstPartyPluginPermission(permissionInput),
    });
  }

  webResearchRuntimeSummary(
    workspace: WorkspaceState,
    signal?: AbortSignal,
  ): Promise<WebResearchRuntimeSummary> {
    return buildWebResearchRuntimeSummary(workspace, signal, {
      createMcpRuntime: this.options.createMcpRuntime,
      mcpEnv: this.options.mcpEnv(),
    });
  }

  tryRouteBrowserContentThroughScrapling(
    input: ScraplingBrowserRouteInput,
  ): Promise<{ result?: AgentToolResult<Record<string, unknown>>; fallbackReason?: string }> {
    return routeBrowserContentThroughScrapling(input, {
      createMcpRuntime: this.options.createMcpRuntime,
      getThread: (threadId) => this.options.store.getThread(threadId),
      listPermissionGrants: () => this.options.store.listPermissionGrants(),
      resolveFirstPartyPluginPermission: (permissionInput) =>
        this.options.resolveFirstPartyPluginPermission(permissionInput),
    });
  }

  private webResearchExaApiKey(): string | undefined {
    return webResearchExaApiKeyFromEnv(this.options.mcpEnv());
  }
}
