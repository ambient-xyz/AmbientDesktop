import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserNavigateInput,
  BrowserPageContent,
  BrowserUserActionState,
  WorkspaceState,
} from "../../../shared/types";
import type { LocalPreviewSession } from "../../localPreviewServer";
import type { MaterializedTextOutput } from "../../toolOutputArtifacts";
import {
  browserToolRecoverableFailure,
  browserUnavailableText,
  isBrowserToolRecoverableError,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
  type BrowserToolRecoverableError,
  type BrowserUnavailableFallback,
} from "../../agentBrowserRuntime";
import { browserToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  browserToolErrorResult,
  browserToolResult,
  browserToolUpdate,
  type BrowserToolTextResult,
} from "./agentRuntimeBrowserToolFormatting";
import { localPreviewSummary } from "../../localPreviewServer";

type BrowserLocalPreviewToolUpdate = BrowserToolTextResult;
type BrowserLocalPreviewToolUpdateHandler = (update: BrowserLocalPreviewToolUpdate) => void;
type BrowserNavigateWithActivityInput = BrowserNavigateInput & { onActivity?: (activityMessage?: string) => void };
type BrowserLocalPreviewContentOrUserAction = BrowserPageContent | BrowserUserActionState;
type BrowserLocalPreviewContentOrFallback = BrowserLocalPreviewContentOrUserAction | BrowserUnavailableFallback | BrowserToolRecoverableError;
type MaterializedBrowserPageContent = BrowserPageContent & { textOutput?: MaterializedTextOutput };

export interface BrowserLocalPreviewToolRegistrationOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  openLocalPreview: (input: { workspacePath: string; path: string }) => Promise<LocalPreviewSession>;
  browserNavigate: (input: BrowserNavigateWithActivityInput) => Promise<BrowserLocalPreviewContentOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserLocalPreviewAudit: (input: { url: string }) => void;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => Promise<void> | void) => Promise<T>,
    onUpdate: BrowserLocalPreviewToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  materializeBrowserPageContent: (
    workspacePath: string,
    label: string,
    content: BrowserPageContent,
  ) => Promise<MaterializedBrowserPageContent>;
  formatBrowserContent: (content: BrowserPageContent) => string;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
}

export function registerBrowserLocalPreviewTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserLocalPreviewToolRegistrationOptions,
): void {
  registerDesktopTool(pi, browserToolDescriptor("browser_local_preview"), {
    executionMode: "sequential",
    prepareArguments: (params) => {
      const input = params && typeof params === "object" && !Array.isArray(params)
        ? params as Record<string, unknown>
        : {};
      if (typeof input.path === "string" && input.path.trim()) return input;
      if (typeof input.filePath !== "string" || !input.filePath.trim()) return input;
      const { filePath: _filePath, ...rest } = input;
      return { ...rest, path: input.filePath };
    },
    execute: async (_toolCallId, params, signal, onUpdate?: BrowserLocalPreviewToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const targetPath = requiredString(input, "path");
      onUpdate?.(browserToolUpdate("browser_local_preview", `Starting managed local preview for ${targetPath}.`));
      const preview = await options.openLocalPreview({ workspacePath: options.workspace.path, path: targetPath });
      onUpdate?.(browserToolUpdate("browser_local_preview", `${preview.status === "reused" ? "Reusing" : "Opening"} ${preview.url}.`));
      const content: BrowserLocalPreviewContentOrFallback = await options.withBrowserToolHeartbeat(
        "browser_local_preview",
        "Local preview navigation is still running. If the page is loading assets, Ambient is waiting for the browser to become readable.",
        (markActivity) =>
          options.browserNavigate({
            url: preview.url,
            profileMode: "isolated",
            runtime: "chrome",
            waitForUserAction: input.waitForUserAction === false ? false : true,
            sourceThreadId: options.threadId,
            onActivity: markActivity,
          }),
        onUpdate,
        { signal },
      )
        .catch((error) => browserToolRecoverableFailure(error));
      await options.emitBrowserState();
      if (isBrowserUnavailableFallback(content)) {
        return browserToolResult(browserUnavailableText(content), localPreviewDetails(preview, "browser-unavailable"));
      }
      if (isBrowserToolRecoverableError(content)) {
        return browserToolErrorResult(content.message, localPreviewDetails(preview, "navigation-error"));
      }
      if (isBrowserUserActionState(content)) {
        return browserToolResult(options.formatBrowserUserAction(content), { ...localPreviewDetails(preview, "user-action"), userAction: content });
      }
      options.recordBrowserLocalPreviewAudit({ url: preview.url });
      const materialized = await options.materializeBrowserPageContent(options.workspace.path, "browser-local-preview", content);
      return browserToolResult(`${localPreviewSummary(preview)}\n\n${options.formatBrowserContent(materialized)}`, {
        ...localPreviewDetails(preview, "loaded", content.url),
        ...(materialized.textOutput ? { textOutput: materialized.textOutput } : {}),
      });
    },
  });
}

function localPreviewDetails(preview: LocalPreviewSession, activeTargetStatus: string, contentUrl?: string): Record<string, unknown> {
  return {
    toolName: "browser_local_preview",
    profileMode: "isolated",
    runtime: "chrome",
    url: contentUrl ?? preview.url,
    path: preview.workspaceRelativeRequestedPath,
    previewSessionId: preview.id,
    activeTargetStatus,
    preview,
  };
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}
