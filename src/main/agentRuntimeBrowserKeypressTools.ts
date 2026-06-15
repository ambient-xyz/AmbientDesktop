import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserKeypressInput,
  BrowserKeypressResult,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserUserActionState,
  WorkspaceState,
} from "../shared/types";
import {
  browserToolFallback,
  browserUnavailableText,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
  type BrowserUnavailableFallback,
} from "./agentBrowserRuntime";
import { browserToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  browserToolResult,
  browserToolUpdate,
  type BrowserToolTextResult,
} from "./agentRuntimeBrowserToolFormatting";

type BrowserKeypressToolUpdate = BrowserToolTextResult;
type BrowserKeypressToolUpdateHandler = (update: BrowserKeypressToolUpdate) => void;
type BrowserKeypressResultOrUserAction = BrowserKeypressResult | BrowserUserActionState;
type BrowserKeypressResultOrFallback = BrowserKeypressResultOrUserAction | BrowserUnavailableFallback;

export interface BrowserKeypressToolRegistrationOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: BrowserKeypressToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserKeypress: (input: BrowserKeypressInput) => Promise<BrowserKeypressResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserKeypressAudit: (input: { profileMode: BrowserProfileMode; detail: string }) => void;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => Promise<void> | void) => Promise<T>,
    onUpdate: BrowserKeypressToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
}

export function registerBrowserKeypressTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserKeypressToolRegistrationOptions,
): void {
  registerDesktopTool(pi, browserToolDescriptor("browser_keypress"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: BrowserKeypressToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const { profileMode, runtime } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
      onUpdate?.(browserToolUpdate("browser_keypress", "Dispatching keyboard input to the active browser page."));
      const result: BrowserKeypressResultOrFallback = await options.withBrowserToolHeartbeat(
        "browser_keypress",
        "Browser keyboard input is still running.",
        () =>
          options.browserKeypress({
            keys: Array.isArray(input.keys) ? input.keys as BrowserKeypressInput["keys"] : [],
            focus: optionalString(input.focus),
            profileMode,
            runtime,
          }),
        onUpdate,
        { signal },
      )
        .catch((error) => browserToolFallback(error));
      await options.emitBrowserState();
      if (isBrowserUnavailableFallback(result)) return browserToolResult(browserUnavailableText(result), { toolName: "browser_keypress", profileMode, runtime });
      if (isBrowserUserActionState(result)) return browserToolResult(options.formatBrowserUserAction(result), { toolName: "browser_keypress", profileMode, userAction: result });
      options.recordBrowserKeypressAudit({
        profileMode,
        detail: `${result.url ?? options.workspace.path}\n${browserKeypressSummary(result)}`,
      });
      return browserToolResult(browserKeypressText(result), { toolName: "browser_keypress", profileMode, runtime, ...result });
    },
  });
}

export function browserKeypressText(result: BrowserKeypressResult): string {
  return [
    "Browser keypress dispatched.",
    result.title ? `Title: ${result.title}` : "",
    result.url ? `URL: ${result.url}` : "",
    `Keys: ${browserKeypressSummary(result)}`,
    `Focus: ${browserKeypressFocusText(result.focus)}`,
    "Capture a screenshot or inspect browser state before claiming the interaction worked.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function browserKeypressSummary(result: BrowserKeypressResult): string {
  return result.keys.map((key) => key.code || (key.key === " " ? "Space" : key.key)).join(", ");
}

function browserKeypressFocusText(focus: BrowserKeypressResult["focus"]): string {
  const label = focus.tagName ? focus.tagName.toLowerCase() : "page";
  const id = focus.id ? `#${focus.id}` : "";
  const className = focus.className ? `.${focus.className.split(/\s+/).filter(Boolean).join(".")}` : "";
  return `${focus.requested}${focus.found ? "" : " (fallback)"} -> ${label}${id}${className}`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
