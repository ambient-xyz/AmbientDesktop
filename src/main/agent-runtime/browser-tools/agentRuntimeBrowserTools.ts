import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import {
  browserAuditRisk,
  browserContentText,
  browserUserActionText,
  materializeBrowserPageContent,
} from "./agentRuntimeBrowserContentFormatting";
import {
  registerBrowserActionTools,
  type BrowserActionToolName,
  type BrowserActionToolRegistrationOptions,
} from "./agentRuntimeBrowserActionTools";
import {
  registerBrowserContentTool,
  type BrowserContentToolRegistrationOptions,
} from "./agentRuntimeBrowserContentTools";
import {
  registerBrowserEvalTool,
  type BrowserEvalToolRegistrationOptions,
} from "./agentRuntimeBrowserEvalTools";
import {
  registerBrowserKeypressTool,
  type BrowserKeypressToolRegistrationOptions,
} from "./agentRuntimeBrowserKeypressTools";
import {
  registerBrowserLocalPreviewTool,
  type BrowserLocalPreviewToolRegistrationOptions,
} from "./agentRuntimeBrowserLocalPreviewTools";
import {
  registerBrowserLoginTool,
  type BrowserLoginToolRegistrationOptions,
} from "./agentRuntimeBrowserLoginTools";
import {
  registerBrowserNavTool,
  type BrowserNavToolRegistrationOptions,
} from "./agentRuntimeBrowserNavTools";
import {
  registerBrowserPickTool,
  type BrowserPickToolRegistrationOptions,
} from "./agentRuntimeBrowserPickTools";
import {
  registerBrowserScreenshotTool,
  type BrowserScreenshotToolRegistrationOptions,
} from "./agentRuntimeBrowserScreenshotTools";
import {
  registerBrowserSearchTool,
  type BrowserSearchToolRegistrationOptions,
} from "./agentRuntimeBrowserSearchTools";
import { mediaArtifactNotice } from "../../agentRuntimeMediaArtifacts";

export type AgentRuntimeBrowserToolOptions =
  & BrowserSearchToolRegistrationOptions
  & BrowserLocalPreviewToolRegistrationOptions
  & BrowserNavToolRegistrationOptions
  & BrowserContentToolRegistrationOptions
  & BrowserEvalToolRegistrationOptions
  & BrowserActionToolRegistrationOptions
  & BrowserKeypressToolRegistrationOptions
  & BrowserLoginToolRegistrationOptions
  & BrowserScreenshotToolRegistrationOptions
  & BrowserPickToolRegistrationOptions
  & {
    enableBrowserLoginBroker: boolean;
  };

export type AgentRuntimeBrowserAuditRisk = ReturnType<typeof browserAuditRisk> | "browser-login";

export type AgentRuntimeBrowserAuditToolName =
  | "browser_search"
  | "browser_local_preview"
  | "browser_nav"
  | "browser_content"
  | "browser_eval"
  | BrowserActionToolName
  | "browser_keypress"
  | "browser_login"
  | "browser_screenshot"
  | "browser_pick";

export interface AgentRuntimeBrowserToolExtensionOptions {
  threadId: string;
  workspace: AgentRuntimeBrowserToolOptions["workspace"];
  enableBrowserLoginBroker: boolean;
  prepareBrowserToolProfile: AgentRuntimeBrowserToolOptions["prepareBrowserToolProfile"];
  browserSearch: AgentRuntimeBrowserToolOptions["browserSearch"];
  openLocalPreview: AgentRuntimeBrowserToolOptions["openLocalPreview"];
  browserNavigate: AgentRuntimeBrowserToolOptions["browserNavigate"];
  browserContent: AgentRuntimeBrowserToolOptions["browserContent"];
  tryRouteBrowserContentThroughScrapling: AgentRuntimeBrowserToolOptions["tryRouteBrowserContentThroughScrapling"];
  browserEvaluate: AgentRuntimeBrowserToolOptions["browserEvaluate"];
  browserKeypress: AgentRuntimeBrowserToolOptions["browserKeypress"];
  resolveBrowserCredential: AgentRuntimeBrowserToolOptions["resolveBrowserCredential"];
  markBrowserCredentialUsed: AgentRuntimeBrowserToolOptions["markBrowserCredentialUsed"];
  browserLogin: AgentRuntimeBrowserToolOptions["browserLogin"];
  browserScreenshot: AgentRuntimeBrowserToolOptions["browserScreenshot"];
  recordBrowserScreenshotArtifact?: AgentRuntimeBrowserToolOptions["recordBrowserScreenshotArtifact"];
  browserPick: AgentRuntimeBrowserToolOptions["browserPick"];
  emitBrowserState: AgentRuntimeBrowserToolOptions["emitBrowserState"];
  recordBrowserAudit: (
    threadId: string,
    toolName: AgentRuntimeBrowserAuditToolName,
    risk: AgentRuntimeBrowserAuditRisk,
    detail: string | undefined,
  ) => void;
  withBrowserToolHeartbeat: AgentRuntimeBrowserToolOptions["withBrowserToolHeartbeat"];
  formatDiagnosticText: AgentRuntimeBrowserToolOptions["formatDiagnosticText"];
}

export function createAgentRuntimeBrowserToolExtension(
  options: AgentRuntimeBrowserToolExtensionOptions,
): ExtensionFactory {
  return (pi) => {
    registerAgentRuntimeBrowserTools(pi, agentRuntimeBrowserToolOptions(options));
  };
}

export function agentRuntimeBrowserToolOptions(
  options: AgentRuntimeBrowserToolExtensionOptions,
): AgentRuntimeBrowserToolOptions {
  const { threadId } = options;
  return {
    threadId,
    workspace: options.workspace,
    enableBrowserLoginBroker: options.enableBrowserLoginBroker,
    prepareBrowserToolProfile: options.prepareBrowserToolProfile,
    browserSearch: options.browserSearch,
    openLocalPreview: options.openLocalPreview,
    browserNavigate: options.browserNavigate,
    browserContent: options.browserContent,
    tryRouteBrowserContentThroughScrapling: options.tryRouteBrowserContentThroughScrapling,
    browserEvaluate: options.browserEvaluate,
    browserKeypress: options.browserKeypress,
    resolveBrowserCredential: options.resolveBrowserCredential,
    markBrowserCredentialUsed: options.markBrowserCredentialUsed,
    browserLogin: options.browserLogin,
    browserScreenshot: options.browserScreenshot,
    ...(options.recordBrowserScreenshotArtifact ? { recordBrowserScreenshotArtifact: options.recordBrowserScreenshotArtifact } : {}),
    browserPick: options.browserPick,
    emitBrowserState: options.emitBrowserState,
    recordBrowserSearchAudit: (input) =>
      options.recordBrowserAudit(threadId, "browser_search", browserAuditRisk(input.profileMode, "browser-network"), input.query),
    recordBrowserLocalPreviewAudit: (input) =>
      options.recordBrowserAudit(threadId, "browser_local_preview", "browser-network", input.url),
    recordBrowserNavAudit: (input) =>
      options.recordBrowserAudit(threadId, "browser_nav", browserAuditRisk(input.profileMode, "browser-network"), input.url),
    recordBrowserContentAudit: (input) =>
      options.recordBrowserAudit(threadId, "browser_content", browserAuditRisk(input.profileMode, "browser-network"), input.url),
    recordBrowserEvalAudit: (input) =>
      options.recordBrowserAudit(threadId, "browser_eval", browserAuditRisk(input.profileMode, "browser-control"), input.code),
    recordBrowserActionAudit: (input) =>
      options.recordBrowserAudit(threadId, input.toolName, browserAuditRisk(input.profileMode, "browser-control"), input.detail),
    recordBrowserKeypressAudit: (input) =>
      options.recordBrowserAudit(threadId, "browser_keypress", browserAuditRisk(input.profileMode, "browser-control"), input.detail),
    recordBrowserLoginAudit: (input) =>
      options.recordBrowserAudit(threadId, "browser_login", "browser-login", input.detail),
    recordBrowserScreenshotAudit: (input) =>
      options.recordBrowserAudit(threadId, "browser_screenshot", browserAuditRisk(input.profileMode, "browser-control"), input.detail),
    recordBrowserPickAudit: (input) =>
      options.recordBrowserAudit(threadId, "browser_pick", browserAuditRisk(input.profileMode, "browser-control"), input.detail),
    withBrowserToolHeartbeat: options.withBrowserToolHeartbeat,
    materializeBrowserPageContent,
    formatBrowserContent: browserContentText,
    formatBrowserUserAction: browserUserActionText,
    formatDiagnosticText: options.formatDiagnosticText,
    formatMediaArtifactNotice: mediaArtifactNotice,
  };
}

export function registerAgentRuntimeBrowserTools(
  pi: Pick<ExtensionAPI, "registerTool" | "getActiveTools" | "getAllTools">,
  options: AgentRuntimeBrowserToolOptions,
): void {
  registerBrowserSearchTool(pi, options);
  registerBrowserLocalPreviewTool(pi, options);
  registerBrowserNavTool(pi, options);
  registerBrowserContentTool(pi, options);
  registerBrowserEvalTool(pi, options);
  registerBrowserActionTools(pi, options);
  registerBrowserKeypressTool(pi, options);
  if (options.enableBrowserLoginBroker) registerBrowserLoginTool(pi, options);
  registerBrowserScreenshotTool(pi, options);
  registerBrowserPickTool(pi, options);
}
