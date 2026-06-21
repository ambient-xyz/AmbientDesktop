import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type {
  BrowserProfileMode,
  BrowserRuntimeKind,
} from "../../shared/browserTypes";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  BrowserCredentialStore,
  BrowserService,
  LocalPreviewServerManager,
} from "./agentRuntimeBrowserFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  recordAgentRuntimeBrowserAudit,
  type AgentRuntimeBrowserAuditRisk,
} from "./browser-tools/agentRuntimeBrowserAudit";
import { browserToolUpdate } from "./browser-tools/agentRuntimeBrowserToolFormatting";
import { withBrowserToolHeartbeat } from "./browser-tools/agentRuntimeBrowserToolHeartbeat";
import { prepareAgentRuntimeBrowserToolProfile } from "./browser-tools/agentRuntimeBrowserProfileSelection";
import {
  createAgentRuntimeBrowserToolExtension,
  type AgentRuntimeBrowserToolExtensionOptions,
  type AgentRuntimeBrowserAuditToolName,
} from "./browser-tools/agentRuntimeBrowserTools";
import type { BrowserScreenshotArtifactReference } from "./browser-tools/agentRuntimeBrowserScreenshotTools";
import { truncateDiagnosticText } from "./provider-continuation/agentRuntimeProviderDiagnostics";

export interface AgentRuntimeBrowserToolControllerOptions {
  store: Pick<ProjectStore, "getThread" | "addPermissionAudit">;
  browser: Pick<
    BrowserService,
    "search" | "navigate" | "content" | "evaluate" | "keypress" | "login" | "screenshot" | "pick" | "getState" | "copyChromeProfile"
  >;
  browserCredentials: Pick<BrowserCredentialStore, "resolve" | "markUsed">;
  localPreviewServers: Pick<LocalPreviewServerManager, "open">;
  enableBrowserLoginBroker: () => boolean;
  getRunId: (threadId: string) => string | undefined;
  tryRouteBrowserContentThroughScrapling: AgentRuntimeBrowserToolExtensionOptions["tryRouteBrowserContentThroughScrapling"];
  emit: (event: DesktopEvent) => void;
}

export class AgentRuntimeBrowserToolController {
  private readonly latestBrowserScreenshotArtifacts = new Map<string, BrowserScreenshotArtifactReference>();

  constructor(private readonly options: AgentRuntimeBrowserToolControllerOptions) {}

  createBrowserToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createAgentRuntimeBrowserToolExtension({
      threadId,
      workspace,
      enableBrowserLoginBroker: this.options.enableBrowserLoginBroker(),
      prepareBrowserToolProfile: (input, sourceThreadId, onUpdate) =>
        this.prepareBrowserToolProfile(input, sourceThreadId, onUpdate),
      browserSearch: (input) => this.options.browser.search(input),
      openLocalPreview: (input) => this.options.localPreviewServers.open(input),
      browserNavigate: (input) => this.options.browser.navigate(input),
      browserContent: (input) => this.options.browser.content(input),
      tryRouteBrowserContentThroughScrapling: (input) => this.options.tryRouteBrowserContentThroughScrapling(input),
      browserEvaluate: (input) => this.options.browser.evaluate(input),
      browserKeypress: (input) => this.options.browser.keypress(input),
      resolveBrowserCredential: (credentialId) => this.options.browserCredentials.resolve(credentialId),
      markBrowserCredentialUsed: (credentialId) => {
        this.options.browserCredentials.markUsed(credentialId);
      },
      browserLogin: (input) => this.options.browser.login(input),
      browserScreenshot: (input) => this.options.browser.screenshot(input),
      recordBrowserScreenshotArtifact: (artifact) => {
        this.latestBrowserScreenshotArtifacts.set(threadId, artifact);
      },
      browserPick: (input) => this.options.browser.pick(input),
      emitBrowserState: () => this.emitBrowserState(),
      recordBrowserAudit: (auditThreadId, toolName, risk, detail) =>
        this.recordBrowserAudit(auditThreadId, toolName, risk, detail),
      withBrowserToolHeartbeat,
      formatDiagnosticText: truncateDiagnosticText,
    });
  }

  getLatestBrowserScreenshotArtifact(threadId: string): BrowserScreenshotArtifactReference | undefined {
    return this.latestBrowserScreenshotArtifacts.get(threadId);
  }

  recordBrowserAudit(
    threadId: string,
    toolName: AgentRuntimeBrowserAuditToolName | string,
    risk: AgentRuntimeBrowserAuditRisk,
    detail: string | undefined,
  ): void {
    recordAgentRuntimeBrowserAudit({
      threadId,
      toolName,
      risk,
      detail,
    }, {
      getThread: (id) => this.options.store.getThread(id),
      activeRunIdForThread: (id) => this.options.getRunId(id),
      addPermissionAudit: (input) => this.options.store.addPermissionAudit(input),
      emitPermissionAuditCreated: (entry) => this.options.emit({ type: "permission-audit-created", entry }),
    });
  }

  async emitBrowserState(): Promise<void> {
    this.options.emit({ type: "browser-updated", state: await this.options.browser.getState() });
  }

  async prepareBrowserToolProfile(
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: (update: ReturnType<typeof browserToolUpdate>) => void,
  ): Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }> {
    return prepareAgentRuntimeBrowserToolProfile({ input, onUpdate }, {
      getBrowserState: () => this.options.browser.getState(),
      copyChromeProfile: () => this.options.browser.copyChromeProfile(),
      emitBrowserState: () => this.emitBrowserState(),
      recordBrowserProfileAudit: (detail) =>
        this.recordBrowserAudit(threadId, "browser_profile", "browser-profile", detail),
    });
  }
}
