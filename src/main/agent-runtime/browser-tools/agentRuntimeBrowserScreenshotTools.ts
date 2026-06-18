import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserScreenshotResult,
  BrowserStartInput,
  BrowserUserActionState,
} from "../../../shared/browserTypes";
import type { MediaArtifactResult } from "../../../shared/desktopTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  browserToolFallback,
  browserUnavailableText,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
  type BrowserUnavailableFallback,
} from "../../agent/agentBrowserRuntime";
import { AMBIENT_TOOL_CALL, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_SEARCH } from "../agentRuntimeAmbientFacade";
import { browserToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  browserToolResult,
  browserToolUpdate,
  type BrowserToolTextResult,
} from "./agentRuntimeBrowserToolFormatting";

export type BrowserScreenshotVisualAnalysisAvailability = "direct" | "routed" | "registered-inactive" | "unavailable";

type BrowserScreenshotToolUpdate = BrowserToolTextResult;
type BrowserScreenshotToolUpdateHandler = (update: BrowserScreenshotToolUpdate) => void;
type BrowserScreenshotWithActivityInput = BrowserStartInput & { onActivity?: (activityMessage?: string) => void };
type BrowserScreenshotResultOrUserAction = BrowserScreenshotResult | BrowserUserActionState;
type BrowserScreenshotResultOrFallback = BrowserScreenshotResultOrUserAction | BrowserUnavailableFallback;

export interface BrowserScreenshotArtifactReference {
  artifactRef: "latest_browser_screenshot";
  artifactPath: string;
  path: string;
  title?: string;
  url?: string;
  bytes: number;
  width?: number;
  height?: number;
  runtime?: BrowserRuntimeKind;
  targetId?: string;
  statePreserved?: boolean;
  sameTargetAsLastBrowserAction?: boolean;
  freshLoad?: boolean;
  evidenceWarning?: string;
}

export interface BrowserScreenshotToolRegistrationOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: BrowserScreenshotToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserScreenshot: (input: BrowserScreenshotWithActivityInput) => Promise<BrowserScreenshotResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserScreenshotAudit: (input: { profileMode: BrowserProfileMode; detail: string | undefined }) => void;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => Promise<void> | void) => Promise<T>,
    onUpdate: BrowserScreenshotToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
  formatMediaArtifactNotice: (result: MediaArtifactResult) => string;
  recordBrowserScreenshotArtifact?: (artifact: BrowserScreenshotArtifactReference) => void;
}

export function registerBrowserScreenshotTool(
  pi: Pick<ExtensionAPI, "registerTool" | "getActiveTools" | "getAllTools">,
  options: BrowserScreenshotToolRegistrationOptions,
): void {
  registerDesktopTool(pi, browserToolDescriptor("browser_screenshot"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: BrowserScreenshotToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const { profileMode, runtime } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
      onUpdate?.(browserToolUpdate("browser_screenshot", "Capturing browser screenshot."));
      const result: BrowserScreenshotResultOrFallback = await options.withBrowserToolHeartbeat(
        "browser_screenshot",
        "Browser screenshot capture is still running.",
        (markActivity) =>
          options.browserScreenshot({
            profileMode,
            runtime,
            artifactWorkspacePath: options.workspace.path,
            onActivity: markActivity,
          }),
        onUpdate,
        { signal },
      )
        .catch((error) => browserToolFallback(error));
      await options.emitBrowserState();
      if (isBrowserUnavailableFallback(result)) return browserToolResult(browserUnavailableText(result), { toolName: "browser_screenshot", profileMode, runtime });
      if (isBrowserUserActionState(result)) return browserToolResult(options.formatBrowserUserAction(result), { toolName: "browser_screenshot", profileMode, userAction: result });
      options.recordBrowserScreenshotAudit({ profileMode, detail: result.url ?? result.path });
      const mediaArtifact = browserScreenshotMediaArtifact(result);
      const screenshotArtifact = browserScreenshotArtifactReference(result);
      if (screenshotArtifact) options.recordBrowserScreenshotArtifact?.(screenshotArtifact);
      const visualAnalysisAvailability = browserScreenshotVisualAnalysisAvailability(pi);
      return browserToolResult(browserScreenshotText(result, {
        formatMediaArtifactNotice: options.formatMediaArtifactNotice,
        mediaArtifact,
        visualAnalysisAvailability,
      }), {
        toolName: "browser_screenshot",
        profileMode,
        runtime,
        ...result,
        ...(mediaArtifact ? { mediaArtifact } : {}),
        visualEvidence: {
          inspected: false,
          analyzer: visualAnalysisAvailability,
          artifactRef: "latest_browser_screenshot",
          analyzeInput: browserScreenshotVisualAnalyzeInput(),
        },
      });
    },
  });
}

export function browserScreenshotVisualAnalysisAvailability(pi: {
  getActiveTools: () => string[];
  getAllTools: () => Array<{ name: string }>;
}): BrowserScreenshotVisualAnalysisAvailability {
  const activeTools = new Set(pi.getActiveTools());
  const registeredTools = new Set(pi.getAllTools().map((tool) => tool.name));
  if (!registeredTools.has("ambient_visual_analyze")) return "unavailable";
  if (activeTools.has("ambient_visual_analyze")) return "direct";
  if (activeTools.has(AMBIENT_TOOL_SEARCH) && activeTools.has(AMBIENT_TOOL_DESCRIBE) && activeTools.has(AMBIENT_TOOL_CALL)) return "routed";
  return "registered-inactive";
}

export function browserScreenshotText(
  result: BrowserScreenshotResult,
  options: {
    formatMediaArtifactNotice: (result: MediaArtifactResult) => string;
    mediaArtifact?: MediaArtifactResult;
    visualAnalysisAvailability?: BrowserScreenshotVisualAnalysisAvailability;
  },
): string {
  const lines = [
    "Browser screenshot captured.",
    result.title ? `Title: ${result.title}` : "",
    result.url ? `URL: ${result.url}` : "",
    result.runtime ? `Runtime: ${result.runtime}` : "",
    result.targetId ? `Target: ${result.targetId}` : "",
    result.statePreserved !== undefined ? `State preserved: ${result.statePreserved ? "yes" : "no"}` : "",
    result.sameTargetAsLastBrowserAction !== undefined ? `Same target as previous browser action: ${result.sameTargetAsLastBrowserAction ? "yes" : "no"}` : "",
    result.freshLoad !== undefined ? `Fresh page load: ${result.freshLoad ? "yes" : "no"}` : "",
    result.evidenceWarning ? `Evidence warning: ${result.evidenceWarning}` : "",
    result.artifactPath ? `Artifact: ${result.artifactPath}` : "",
    `Path: ${result.path}`,
    result.width !== undefined && result.height !== undefined ? `Dimensions: ${result.width}x${result.height}` : "",
    `Bytes: ${result.bytes}`,
  ].filter(Boolean);
  if (options.mediaArtifact) lines.push(options.formatMediaArtifactNotice(options.mediaArtifact));
  lines.push(browserScreenshotVisualEvidenceNotice(result.artifactPath ?? result.path, options.visualAnalysisAvailability ?? "unavailable"));
  return lines.join("\n");
}

export function browserScreenshotMediaArtifact(result: BrowserScreenshotResult): MediaArtifactResult | undefined {
  if (!result.artifactPath) return undefined;
  return {
    artifactPath: result.artifactPath,
    mediaKind: "image",
    mimeType: result.mimeType ?? "image/png",
    bytes: result.bytes,
    inlinePreviewEligible: true,
    displayInstruction: "Ambient Desktop will attempt to render this browser screenshot inline in the visible chat. Do not claim inline media display is unsupported.",
    ...(result.width !== undefined ? { width: result.width } : {}),
    ...(result.height !== undefined ? { height: result.height } : {}),
    ...(result.url ? { sourceUrl: result.url } : {}),
  };
}

export function browserScreenshotVisualAnalyzeInput(): { browserScreenshot: { ref: "latest"; artifactRef: "latest_browser_screenshot"; label: string }; task: "ui_review" } {
  return {
    browserScreenshot: {
      ref: "latest",
      artifactRef: "latest_browser_screenshot",
      label: "browser screenshot",
    },
    task: "ui_review",
  };
}

function browserScreenshotArtifactReference(result: BrowserScreenshotResult): BrowserScreenshotArtifactReference | undefined {
  if (!result.artifactPath) return undefined;
  return {
    artifactRef: "latest_browser_screenshot",
    artifactPath: result.artifactPath,
    path: result.path,
    bytes: result.bytes,
    ...(result.title ? { title: result.title } : {}),
    ...(result.url ? { url: result.url } : {}),
    ...(result.width !== undefined ? { width: result.width } : {}),
    ...(result.height !== undefined ? { height: result.height } : {}),
    ...(result.runtime ? { runtime: result.runtime } : {}),
    ...(result.targetId ? { targetId: result.targetId } : {}),
    ...(result.statePreserved !== undefined ? { statePreserved: result.statePreserved } : {}),
    ...(result.sameTargetAsLastBrowserAction !== undefined ? { sameTargetAsLastBrowserAction: result.sameTargetAsLastBrowserAction } : {}),
    ...(result.freshLoad !== undefined ? { freshLoad: result.freshLoad } : {}),
    ...(result.evidenceWarning ? { evidenceWarning: result.evidenceWarning } : {}),
  };
}

function browserScreenshotVisualEvidenceNotice(
  artifactPath: string,
  availability: BrowserScreenshotVisualAnalysisAvailability,
): string {
  const stableInput = JSON.stringify(browserScreenshotVisualAnalyzeInput());
  const fallbackImagePathInput = JSON.stringify({
    image: { path: artifactPath, source: "browser_screenshot", label: "browser screenshot" },
    task: "ui_review",
  });
  const lines = [
    "",
    "Visual evidence status: screenshot pixels have not been inspected by the model.",
    "Do not claim visible UI, text, layout, game state, or design quality from this screenshot result alone.",
  ];
  if (availability === "direct") {
    lines.push(`For pixel-level inspection, call ambient_visual_analyze with ${stableInput} or the closest task preset.`);
    lines.push(`If the typed latest-screenshot reference is unavailable, use ${fallbackImagePathInput}.`);
  } else if (availability === "routed") {
    lines.push(`For pixel-level inspection, use ambient_tool_describe/ambient_tool_call to run ambient_visual_analyze with ${stableInput} or the closest task preset.`);
    lines.push(`If the typed latest-screenshot reference is unavailable, use ${fallbackImagePathInput}.`);
  } else if (availability === "registered-inactive") {
    lines.push("ambient_visual_analyze is registered but not active through the current tool route; report visual inspection as unavailable rather than guessing.");
  } else {
    lines.push("No visual-analysis tool is currently registered; treat this as a human-visible proof artifact rather than model-inspected evidence.");
  }
  return lines.join("\n").trim();
}
