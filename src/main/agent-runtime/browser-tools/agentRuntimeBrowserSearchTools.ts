import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserSearchInput,
  BrowserSearchResult,
  BrowserUserActionState,
} from "../../../shared/browserTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  browserToolRecoverableFailure,
  browserUnavailableText,
  isBrowserToolRecoverableError,
  isBrowserUnavailableFallback,
  type BrowserToolRecoverableError,
  type BrowserUnavailableFallback,
} from "../agentRuntimeAgentFacade";
import { browserToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  browserMaterializedToolResult,
  browserToolErrorResult,
  browserToolResult,
  browserToolUpdate,
  type BrowserToolTextResult,
} from "./agentRuntimeBrowserToolFormatting";

type BrowserSearchToolUpdate = BrowserToolTextResult;
type BrowserSearchToolUpdateHandler = (update: BrowserSearchToolUpdate) => void;
type BrowserSearchWithActivityInput = BrowserSearchInput & { onActivity?: (activityMessage?: string) => void };
type BrowserSearchResultOrUserAction = BrowserSearchResult[] | BrowserUserActionState;
type BrowserSearchResultOrFallback = BrowserSearchResultOrUserAction | BrowserUnavailableFallback | BrowserToolRecoverableError;

export interface BrowserSearchToolRegistrationOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: BrowserSearchToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserSearch: (input: BrowserSearchWithActivityInput) => Promise<BrowserSearchResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserSearchAudit: (input: { profileMode: BrowserProfileMode; query: string }) => void;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => Promise<void> | void) => Promise<T>,
    onUpdate: BrowserSearchToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
  materializeBrowserToolResult?: typeof browserMaterializedToolResult;
}

export function registerBrowserSearchTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserSearchToolRegistrationOptions,
): void {
  const materializedToolResult = options.materializeBrowserToolResult ?? browserMaterializedToolResult;

  registerDesktopTool(pi, browserToolDescriptor("browser_search"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: BrowserSearchToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const query = requiredString(input, "query");
      const { profileMode, runtime } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
      onUpdate?.(browserToolUpdate("browser_search", `Searching Google for "${query}".`));
      const results: BrowserSearchResultOrFallback = await options.withBrowserToolHeartbeat(
        "browser_search",
        "Browser search is still running. If a CAPTCHA or browser challenge is visible, complete it in the Browser panel.",
        (markActivity) =>
          options.browserSearch({
            query,
            maxResults: optionalNumber(input.maxResults),
            fetchContent: input.fetchContent === true,
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
      if (isBrowserUnavailableFallback(results)) return browserToolResult(browserUnavailableText(results), { toolName: "browser_search", profileMode, runtime });
      if (isBrowserToolRecoverableError(results)) return browserToolErrorResult(results.message, { toolName: "browser_search", profileMode, runtime, query });
      if (!Array.isArray(results)) return browserToolResult(options.formatBrowserUserAction(results), { toolName: "browser_search", profileMode, userAction: results });
      options.recordBrowserSearchAudit({ profileMode, query });
      return materializedToolResult(options.workspace.path, "browser-search", "browser search output", browserSearchText(results), {
        toolName: "browser_search",
        profileMode,
        runtime,
        results,
      });
    },
  });
}

export function browserSearchText(results: BrowserSearchResult[]): string {
  if (results.length === 0) return "No browser search results were extracted.";
  return results
    .map((result, index) =>
      [
        `${index + 1}. ${result.title}`,
        result.url,
        result.snippet ? `Snippet: ${result.snippet}` : "",
        result.content ? `Content:\n${result.content}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
