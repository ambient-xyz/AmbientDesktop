import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserEvaluateInput,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserUserActionState,
} from "../../../shared/browserTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  browserToolFallback,
  browserUnavailableText,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
  type BrowserUnavailableFallback,
} from "../agentRuntimeAgentFacade";
import { browserToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  browserMaterializedToolResult,
  browserToolResult,
  browserToolUpdate,
  type BrowserToolTextResult,
} from "./agentRuntimeBrowserToolFormatting";
import { buildToolLongformInputPreview as defaultBuildToolLongformInputPreview } from "../agentRuntimeToolRuntimeFacade";

type BrowserEvalToolUpdate = BrowserToolTextResult;
type BrowserEvalToolUpdateHandler = (update: BrowserEvalToolUpdate) => void;
type BrowserEvaluateWithActivityInput = BrowserEvaluateInput & { onActivity?: (activityMessage?: string) => void };
type BrowserEvalResultOrFallback = unknown | BrowserUserActionState | BrowserUnavailableFallback;

export interface BrowserEvalToolRegistrationOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: BrowserEvalToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserEvaluate: (input: BrowserEvaluateWithActivityInput) => Promise<unknown | BrowserUserActionState>;
  emitBrowserState: () => Promise<void>;
  recordBrowserEvalAudit: (input: { profileMode: BrowserProfileMode; code: string }) => void;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => Promise<void> | void) => Promise<T>,
    onUpdate: BrowserEvalToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
  buildToolLongformInputPreview?: typeof defaultBuildToolLongformInputPreview;
  materializeBrowserToolResult?: typeof browserMaterializedToolResult;
}

export function registerBrowserEvalTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserEvalToolRegistrationOptions,
): void {
  const buildToolLongformInputPreview = options.buildToolLongformInputPreview ?? defaultBuildToolLongformInputPreview;
  const materializeBrowserToolResult = options.materializeBrowserToolResult ?? browserMaterializedToolResult;

  registerDesktopTool(pi, browserToolDescriptor("browser_eval"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: BrowserEvalToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const code = requiredString(input, "code");
      const { profileMode, runtime } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
      const longformInputPreview = buildToolLongformInputPreview("browser_eval", input);
      onUpdate?.(
        browserToolUpdate(
          "browser_eval",
          "Evaluating JavaScript in the active browser page.",
          longformInputPreview,
        ),
      );
      const result: BrowserEvalResultOrFallback = await options.withBrowserToolHeartbeat(
        "browser_eval",
        "Browser JavaScript evaluation is still running.",
        (markActivity) => options.browserEvaluate({ code, profileMode, runtime, onActivity: markActivity }),
        onUpdate,
        { signal },
      )
        .catch((error) => browserToolFallback(error));
      await options.emitBrowserState();
      if (isBrowserUnavailableFallback(result)) {
        return browserToolResult(browserUnavailableText(result), {
          toolName: "browser_eval",
          profileMode,
          runtime,
          ...(longformInputPreview ? { toolLongformInputPreview: longformInputPreview } : {}),
        });
      }
      if (isBrowserUserActionState(result)) {
        return browserToolResult(options.formatBrowserUserAction(result), {
          toolName: "browser_eval",
          profileMode,
          userAction: result,
          ...(longformInputPreview ? { toolLongformInputPreview: longformInputPreview } : {}),
        });
      }
      options.recordBrowserEvalAudit({ profileMode, code });
      return materializeBrowserToolResult(options.workspace.path, "browser-eval", "browser eval output", formatBrowserEvalValue(result), {
        toolName: "browser_eval",
        profileMode,
        runtime,
        ...(longformInputPreview ? { toolLongformInputPreview: longformInputPreview } : {}),
      });
    },
  });
}

export function formatBrowserEvalValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}
