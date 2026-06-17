import type { AgentToolResult, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type {
  BrowserProfileMode,
  BrowserRuntimeKind,
  SearchRoutingSettings,
  WebResearchProviderRole,
  WorkspaceState,
} from "../shared/types";
import { ambientCliRunText } from "./agent-runtime/ambient-cli-package/agentRuntimeAmbientCliPackageRunTools";
import {
  browserAuditRisk,
  browserContentText,
  browserUserActionText,
  materializeBrowserPageContent,
} from "./agent-runtime/browser-tools/agentRuntimeBrowserContentFormatting";
import { browserSearchText } from "./agent-runtime/browser-tools/agentRuntimeBrowserSearchTools";
import { registerWebResearchFetchTools, type WebResearchFetchToolRegistrationOptions } from "./agentRuntimeWebResearchFetchTools";
import { registerWebResearchProviderDescribeTools } from "./agentRuntimeWebResearchProviderDescribeTools";
import { registerWebResearchProviderSearchTools } from "./agentRuntimeWebResearchProviderSearchTools";
import { registerWebResearchSearchTools, type WebResearchSearchToolRegistrationOptions } from "./agentRuntimeWebResearchSearchTools";
import { registerWebResearchStatusTools, type WebResearchStatusToolRegistrationOptions } from "./agentRuntimeWebResearchStatusTools";
import type { WebResearchProviderRequestPlan } from "./webResearchProviderStack";

type WebResearchToolUpdateHandler = (update: AgentToolResult<Record<string, unknown>>) => void;

export interface AgentRuntimeWebResearchToolExtensionOptions {
  threadId: string;
  workspace: WorkspaceState;
  readSettings: () => SearchRoutingSettings | undefined;
  discoverAmbientCliPackages: WebResearchStatusToolRegistrationOptions["discoverAmbientCliPackages"];
  discoverMcpProviderTools: WebResearchStatusToolRegistrationOptions["discoverMcpProviderTools"];
  webResearchRuntimeSummary: WebResearchStatusToolRegistrationOptions["webResearchRuntimeSummary"];
  webResearchProviderPlanForInput: (
    input: Record<string, unknown>,
    role: WebResearchProviderRole,
    signal?: AbortSignal,
  ) => Promise<WebResearchProviderRequestPlan>;
  webResearchExaApiKey: WebResearchSearchToolRegistrationOptions["webResearchExaApiKey"];
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: WebResearchToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserSearch: WebResearchSearchToolRegistrationOptions["browserSearch"];
  browserContent: WebResearchFetchToolRegistrationOptions["browserContent"];
  emitBrowserState: WebResearchSearchToolRegistrationOptions["emitBrowserState"];
  recordBrowserAudit: (
    toolName: "web_research_search" | "web_research_fetch",
    risk: ReturnType<typeof browserAuditRisk>,
    detail: string,
  ) => void;
  tryRouteBrowserContentThroughScrapling: WebResearchFetchToolRegistrationOptions["tryRouteBrowserContentThroughScrapling"];
  tryCallWebResearchMcpProvider:
    & WebResearchSearchToolRegistrationOptions["tryCallWebResearchMcpProvider"]
    & WebResearchFetchToolRegistrationOptions["tryCallWebResearchMcpProvider"];
  withBrowserToolHeartbeat: WebResearchSearchToolRegistrationOptions["withBrowserToolHeartbeat"];
  formatErrorMessage: WebResearchSearchToolRegistrationOptions["formatErrorMessage"];
}

export function createAgentRuntimeWebResearchToolExtension(
  options: AgentRuntimeWebResearchToolExtensionOptions,
): ExtensionFactory {
  return (pi) => {
    registerWebResearchStatusTools(pi, {
      workspace: options.workspace,
      readSettings: options.readSettings,
      discoverAmbientCliPackages: options.discoverAmbientCliPackages,
      discoverMcpProviderTools: options.discoverMcpProviderTools,
      webResearchRuntimeSummary: options.webResearchRuntimeSummary,
    });

    registerWebResearchProviderSearchTools(pi, {
      workspace: options.workspace,
      readSettings: options.readSettings,
      discoverAmbientCliPackages: options.discoverAmbientCliPackages,
      discoverMcpProviderTools: options.discoverMcpProviderTools,
    });

    registerWebResearchProviderDescribeTools(pi, {
      workspace: options.workspace,
      readSettings: options.readSettings,
      discoverAmbientCliPackages: options.discoverAmbientCliPackages,
      discoverMcpProviderTools: options.discoverMcpProviderTools,
    });

    registerWebResearchSearchTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      webResearchProviderPlanForInput: (input, signal) => options.webResearchProviderPlanForInput(input, "search", signal),
      webResearchExaApiKey: options.webResearchExaApiKey,
      prepareBrowserToolProfile: options.prepareBrowserToolProfile,
      browserSearch: options.browserSearch,
      emitBrowserState: options.emitBrowserState,
      recordBrowserSearchAudit: (input) =>
        options.recordBrowserAudit("web_research_search", browserAuditRisk(input.profileMode, "browser-network"), input.query),
      tryCallWebResearchMcpProvider: options.tryCallWebResearchMcpProvider,
      withBrowserToolHeartbeat: options.withBrowserToolHeartbeat,
      formatAmbientCliRun: ambientCliRunText,
      formatBrowserSearchResults: browserSearchText,
      formatBrowserUserAction: browserUserActionText,
      formatErrorMessage: options.formatErrorMessage,
    });

    registerWebResearchFetchTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      webResearchProviderPlanForInput: (input, signal) => options.webResearchProviderPlanForInput(input, "fetch", signal),
      webResearchExaApiKey: options.webResearchExaApiKey,
      prepareBrowserToolProfile: options.prepareBrowserToolProfile,
      browserContent: options.browserContent,
      emitBrowserState: options.emitBrowserState,
      recordBrowserFetchAudit: (input) =>
        options.recordBrowserAudit("web_research_fetch", browserAuditRisk(input.profileMode, "browser-network"), input.url),
      tryRouteBrowserContentThroughScrapling: options.tryRouteBrowserContentThroughScrapling,
      tryCallWebResearchMcpProvider: options.tryCallWebResearchMcpProvider,
      withBrowserToolHeartbeat: options.withBrowserToolHeartbeat,
      materializeBrowserPageContent,
      formatBrowserContent: browserContentText,
      formatBrowserUserAction: browserUserActionText,
      formatErrorMessage: options.formatErrorMessage,
    });
  };
}
