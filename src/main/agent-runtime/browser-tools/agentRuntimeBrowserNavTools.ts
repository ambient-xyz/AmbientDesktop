import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserNavigateInput,
  BrowserPageContent,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserUserActionState,
} from "../../../shared/browserTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { MaterializedTextOutput } from "../agentRuntimeToolRuntimeFacade";
import {
  browserToolRecoverableFailure,
  browserUnavailableText,
  isBrowserToolRecoverableError,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
  type BrowserToolRecoverableError,
  type BrowserUnavailableFallback,
} from "../agentRuntimeAgentFacade";
import { browserToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  browserToolErrorResult,
  browserToolResult,
  browserToolUpdate,
  type BrowserToolTextResult,
} from "./agentRuntimeBrowserToolFormatting";
import { BrowserToolTimeoutError } from "./agentRuntimeBrowserToolHeartbeat";

type BrowserNavToolUpdate = BrowserToolTextResult;
type BrowserNavToolUpdateHandler = (update: BrowserNavToolUpdate) => void;
type BrowserNavigateWithActivityInput = BrowserNavigateInput & { onActivity?: (activityMessage?: string) => void };
type BrowserNavResultOrUserAction = BrowserPageContent | BrowserUserActionState;
type BrowserNavResultOrFallback = BrowserNavResultOrUserAction | BrowserUnavailableFallback | BrowserToolRecoverableError;
type MaterializedBrowserPageContent = BrowserPageContent & { textOutput?: MaterializedTextOutput };

export interface BrowserNavToolRegistrationOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: BrowserNavToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserNavigate: (input: BrowserNavigateWithActivityInput) => Promise<BrowserNavResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserNavAudit: (input: { profileMode: BrowserProfileMode; url: string | undefined }) => void;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => Promise<void> | void) => Promise<T>,
    onUpdate: BrowserNavToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
  materializeBrowserPageContent: (
    workspacePath: string,
    label: string,
    content: BrowserPageContent,
  ) => Promise<MaterializedBrowserPageContent>;
  formatBrowserContent: (content: BrowserPageContent) => string;
}

export function registerBrowserNavTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserNavToolRegistrationOptions,
): void {
  registerDesktopTool(pi, browserToolDescriptor("browser_nav"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: BrowserNavToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const url = requiredString(input, "url");
      const { profileMode, runtime } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
      onUpdate?.(browserToolUpdate("browser_nav", `Navigating to ${url}.`));
      const content: BrowserNavResultOrFallback = await options.withBrowserToolHeartbeat(
        "browser_nav",
        "Browser navigation is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
        (markActivity) =>
          options.browserNavigate({
            url,
            newTab: input.newTab === true,
            profileMode,
            runtime,
            waitForUserAction: input.waitForUserAction === false ? false : true,
            sourceThreadId: options.threadId,
            onActivity: markActivity,
          }),
        onUpdate,
        { signal },
      )
        .catch((error) => browserToolRecoverableFailure(browserNavErrorForUrl(error, url)));
      await options.emitBrowserState();
      if (isBrowserUnavailableFallback(content)) return browserToolResult(browserUnavailableText(content), { toolName: "browser_nav", profileMode, runtime });
      if (isBrowserToolRecoverableError(content)) return browserToolErrorResult(content.message, { toolName: "browser_nav", profileMode, runtime, url });
      if (isBrowserUserActionState(content)) return browserToolResult(options.formatBrowserUserAction(content), { toolName: "browser_nav", profileMode, userAction: content });
      options.recordBrowserNavAudit({ profileMode, url: content.url ?? url });
      const materialized = await options.materializeBrowserPageContent(options.workspace.path, "browser-nav", content);
      return browserToolResult(options.formatBrowserContent(materialized), {
        toolName: "browser_nav",
        profileMode,
        runtime,
        url: content.url,
        ...(materialized.textOutput ? { textOutput: materialized.textOutput } : {}),
      });
    },
  });
}

function browserNavErrorForUrl(error: unknown, url: string): unknown {
  if (!isLoopbackUrl(url)) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof BrowserToolTimeoutError || /timed out|stalled|not reachable|did not commit/i.test(message)) {
    return new Error([
      `Local preview navigation failed for ${url}.`,
      message,
      "The preview server or active browser target may have expired or been reloaded. Call browser_local_preview again for the workspace file, then use the returned URL/session instead of retrying this stale URL.",
    ].join("\n"));
  }
  return error;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1") && (url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return false;
  }
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}
