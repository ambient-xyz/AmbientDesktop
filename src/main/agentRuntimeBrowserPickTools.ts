import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserPickInput,
  BrowserPickResult,
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

type BrowserPickToolUpdate = BrowserToolTextResult;
type BrowserPickToolUpdateHandler = (update: BrowserPickToolUpdate) => void;
type BrowserPickResultOrUserAction = BrowserPickResult | BrowserUserActionState;
type BrowserPickResultOrFallback = BrowserPickResultOrUserAction | BrowserUnavailableFallback;

export interface BrowserPickToolRegistrationOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: BrowserPickToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserPick: (input: BrowserPickInput) => Promise<BrowserPickResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserPickAudit: (input: { profileMode: BrowserProfileMode; detail: string }) => void;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
}

export function registerBrowserPickTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserPickToolRegistrationOptions,
): void {
  registerDesktopTool(pi, browserToolDescriptor("browser_pick"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: BrowserPickToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const prompt = requiredString(input, "prompt");
      const { profileMode, runtime } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
      onUpdate?.(browserToolUpdate("browser_pick", `Waiting for browser element selection: ${prompt}`));
      const pick = options.browserPick({ prompt, profileMode, runtime });
      await options.emitBrowserState();
      const result: BrowserPickResultOrFallback = await pick.catch((error) => browserToolFallback(error));
      await options.emitBrowserState();
      if (isBrowserUnavailableFallback(result)) return browserToolResult(browserUnavailableText(result), { toolName: "browser_pick", profileMode, runtime });
      if (isBrowserUserActionState(result)) return browserToolResult(options.formatBrowserUserAction(result), { toolName: "browser_pick", profileMode, userAction: result });
      options.recordBrowserPickAudit({
        profileMode,
        detail: `${result.url ?? options.workspace.path}\n${prompt}`,
      });
      return browserToolResult(browserPickText(result), { toolName: "browser_pick", profileMode, runtime, ...result });
    },
  });
}

export function browserPickText(result: BrowserPickResult): string {
  if (result.canceled) return `Browser picker canceled.\nPrompt: ${result.prompt}`;
  const header = [
    `Browser picker sent ${result.selections.length} selected element(s) to Ambient.`,
    result.title ? `Title: ${result.title}` : "",
    result.url ? `URL: ${result.url}` : "",
    `Prompt: ${result.prompt}`,
  ]
    .filter(Boolean)
    .join("\n");
  const selections = result.selections
    .map((selection, index) =>
      [
        `${index + 1}. ${selection.tagName}${selection.selector ? ` ${selection.selector}` : ""}`,
        selection.text ? `Text: ${selection.text}` : "",
        selection.candidates.length > 0 ? `Candidates: ${selection.candidates.join(", ")}` : "",
        selection.boundingBox
          ? `Bounds: ${selection.boundingBox.x},${selection.boundingBox.y} ${selection.boundingBox.width}x${selection.boundingBox.height}`
          : "",
        selection.html ? `HTML: ${selection.html}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  return `${header}\n\n${selections}`;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}
