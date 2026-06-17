import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserContentInput,
  BrowserPageContent,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserUserActionState,
  WorkspaceState,
} from "../../../shared/types";
import type { MaterializedTextOutput } from "../../tool-runtime/toolOutputArtifacts";
import {
  browserToolRecoverableFailure,
  browserUnavailableText,
  isBrowserToolRecoverableError,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
  type BrowserToolRecoverableError,
  type BrowserUnavailableFallback,
} from "../../agent/agentBrowserRuntime";
import { browserToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  browserToolErrorResult,
  browserToolResult,
  browserToolUpdate,
} from "./agentRuntimeBrowserToolFormatting";

type BrowserContentToolUpdate = AgentToolResult<Record<string, unknown>>;
type BrowserContentToolUpdateHandler = (update: BrowserContentToolUpdate) => void;
type BrowserContentWithActivityInput = BrowserContentInput & { onActivity?: (activityMessage?: string) => void };
type BrowserContentResultOrUserAction = BrowserPageContent | BrowserUserActionState;
type BrowserContentResultOrFallback = BrowserContentResultOrUserAction | BrowserUnavailableFallback | BrowserToolRecoverableError;
type MaterializedBrowserPageContent = BrowserPageContent & { textOutput?: MaterializedTextOutput };

export interface BrowserContentScraplingRouteInput {
  threadId: string;
  workspace: WorkspaceState;
  url: string | undefined;
  rawInput: Record<string, unknown>;
  signal: AbortSignal | undefined;
  onUpdate?: BrowserContentToolUpdateHandler;
}

export interface BrowserContentToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: BrowserContentToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserContent: (input: BrowserContentWithActivityInput) => Promise<BrowserContentResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserContentAudit: (input: { profileMode: BrowserProfileMode; url: string | undefined }) => void;
  tryRouteBrowserContentThroughScrapling: (
    input: BrowserContentScraplingRouteInput,
  ) => Promise<{ result?: AgentToolResult<Record<string, unknown>>; fallbackReason?: string }>;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => Promise<void> | void) => Promise<T>,
    onUpdate: BrowserContentToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  materializeBrowserPageContent: (
    workspacePath: string,
    label: string,
    content: BrowserPageContent,
  ) => Promise<MaterializedBrowserPageContent>;
  formatBrowserContent: (content: BrowserPageContent) => string;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
  formatDiagnosticText: (value: string, maxChars: number) => string;
}

export function registerBrowserContentTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserContentToolRegistrationOptions,
): void {
  registerDesktopTool(pi, browserToolDescriptor("browser_content"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: BrowserContentToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const url = typeof input.url === "string" ? input.url : undefined;
      const scraplingRoute = await options.tryRouteBrowserContentThroughScrapling({
        threadId: options.threadId,
        workspace: options.workspace,
        url,
        rawInput: input,
        signal,
        onUpdate,
      });
      if (scraplingRoute.result) return scraplingRoute.result;
      const scraplingFallbackReason = scraplingRoute.fallbackReason
        ? options.formatDiagnosticText(scraplingRoute.fallbackReason, 1_000)
        : undefined;
      if (scraplingFallbackReason) {
        onUpdate?.(browserToolUpdate("browser_content", `Scrapling route unavailable; using Ambient browser content. ${scraplingFallbackReason}`));
      }
      const { profileMode, runtime } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
      onUpdate?.(browserToolUpdate("browser_content", url ? `Reading ${url}.` : "Reading active browser page."));
      const content: BrowserContentResultOrFallback = await options.withBrowserToolHeartbeat(
        "browser_content",
        "Browser page reading is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
        (markActivity) =>
          options.browserContent({
            url,
            profileMode,
            runtime,
            waitForUserAction: input.waitForUserAction === false ? false : true,
            sourceThreadId: options.threadId,
            onActivity: markActivity,
          }),
        onUpdate,
        { signal },
      )
        .catch((error) => browserToolRecoverableFailure(error));
      await options.emitBrowserState();
      if (isBrowserUnavailableFallback(content)) return browserToolResult(browserUnavailableText(content), { toolName: "browser_content", profileMode, runtime });
      if (isBrowserToolRecoverableError(content)) return browserToolErrorResult(content.message, { toolName: "browser_content", profileMode, runtime, url });
      if (isBrowserUserActionState(content)) return browserToolResult(options.formatBrowserUserAction(content), { toolName: "browser_content", profileMode, userAction: content });
      options.recordBrowserContentAudit({ profileMode, url: content.url ?? url });
      const materialized = await options.materializeBrowserPageContent(options.workspace.path, "browser-content", content);
      return browserToolResult(options.formatBrowserContent(materialized), {
        toolName: "browser_content",
        profileMode,
        runtime,
        url: content.url,
        ...(scraplingFallbackReason ? { preferredCapabilityFallback: scraplingFallbackReason } : {}),
        ...(materialized.textOutput ? { textOutput: materialized.textOutput } : {}),
      });
    },
  });
}
