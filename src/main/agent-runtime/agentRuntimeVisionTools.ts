import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type {
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionBrowserScreenshotInputReference,
  MiniCpmVisionImageInputSource,
  MiniCpmVisionSetupInput,
  MiniCpmVisionSetupResult,
  MiniCpmVisionTask,
  MiniCpmVisionVideoInputSource,
} from "../../shared/localRuntimeTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { visionToolDescriptor } from "./agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "./agentRuntimeDesktopToolFacade";
import { miniCpmVisionDiagnosticsForFailure } from "../../shared/miniCpmVisionDiagnostics";
import { analyzeMiniCpmVisionInput, setupMiniCpmVisionProvider } from "../mini-cpm/miniCpmVisionProvider";
import type { AnalyzeMiniCpmVisionInputOptions, MiniCpmVisionProgressEvent, SetupMiniCpmVisionProviderOptions } from "../mini-cpm/miniCpmVisionProvider";
import type { BrowserScreenshotArtifactReference } from "./browser-tools/agentRuntimeBrowserScreenshotTools";

export interface AgentRuntimeVisionToolExtensionOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  getThread: (threadId: string) => Pick<ThreadSummary, "collaborationMode">;
  getLatestBrowserScreenshotArtifact?: () => BrowserScreenshotArtifactReference | undefined;
  vision?: {
    setupMiniCpm?: (
      workspacePath: string,
      input: MiniCpmVisionSetupInput,
      options?: SetupMiniCpmVisionProviderOptions,
    ) => Promise<MiniCpmVisionSetupResult> | MiniCpmVisionSetupResult;
    analyzeMiniCpm?: (
      workspacePath: string,
      input: MiniCpmVisionAnalyzeInput,
      options?: AnalyzeMiniCpmVisionInputOptions,
    ) => Promise<MiniCpmVisionAnalysisResult> | MiniCpmVisionAnalysisResult;
  };
}

export function createVisionToolExtension(options: AgentRuntimeVisionToolExtensionOptions): ExtensionFactory {
  const { threadId, workspace, getThread, getLatestBrowserScreenshotArtifact, vision } = options;
  return (pi) => {
    registerDesktopTool(pi, visionToolDescriptor("ambient_visual_minicpm_setup"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("MiniCPM-V visual provider setup is blocked in Planner Mode.");
        return withVisionToolHeartbeat("ambient_visual_minicpm_setup", "MiniCPM-V provider setup is still running.", onUpdate, signal, async (markActivity) => {
          try {
            const input = miniCpmVisionSetupToolInput(params);
            markActivity("Preparing MiniCPM-V visual provider setup.");
            const result = await (vision?.setupMiniCpm ?? setupMiniCpmVisionProvider)(workspace.path, input, {
              signal,
              onProgress: (progress) => markActivity(progress.message, { progress }),
            });
            return visionToolResult(miniCpmVisionSetupText(result), {
              toolName: "ambient_visual_minicpm_setup",
              status: "complete",
              provider: result.provider,
              setupStatus: result.status,
              action: result.action,
              packageName: result.packageName,
              validation: result.validation,
              diagnostics: result.diagnostics,
              cleanup: result.cleanup,
              runtimeCandidates: result.runtimeCandidates,
              installStatuses: result.installStatuses,
              nextSteps: result.nextSteps,
            });
          } catch (error) {
            if (signal?.aborted) throw error;
            return visionToolFailureResult("ambient_visual_minicpm_setup", error, {
              setupStatus: "failed",
              validationStatus: "failed",
            });
          }
        });
      },
    });

    registerDesktopTool(pi, visionToolDescriptor("ambient_visual_analyze"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        return withVisionToolHeartbeat("ambient_visual_analyze", "MiniCPM-V visual analysis is still running.", onUpdate, signal, async (markActivity) => {
          try {
            const rawInput = miniCpmVisionAnalyzeToolInput(params);
            const input = resolveMiniCpmBrowserScreenshotInput(rawInput, getLatestBrowserScreenshotArtifact?.());
            markActivity(`Analyzing ${miniCpmVisionInputLabel(input, rawInput)} with MiniCPM-V.`);
            const result = await (vision?.analyzeMiniCpm ?? analyzeMiniCpmVisionInput)(workspace.path, input, {
              signal,
              onProgress: (progress) => markActivity(progress.message, { progress }),
            });
            return visionToolResult(miniCpmVisionAnalysisText(result), {
              toolName: "ambient_visual_analyze",
              status: "complete",
              provider: result.provider,
              task: result.task,
              packageName: result.packageName,
              model: result.model,
              endpoint: result.endpoint,
              summary: result.summary,
              observations: result.observations,
              limitations: result.limitations,
              image: result.image,
              video: result.video,
              referenceImage: result.referenceImage,
              inputImages: result.inputImages,
              sampledFrames: result.sampledFrames,
              artifacts: result.artifacts,
              durationMs: result.durationMs,
              latencyMs: result.latencyMs,
              commands: result.commands,
              validation: result.validation,
              redaction: result.redaction,
              ...(rawInput.browserScreenshot ? { browserScreenshot: rawInput.browserScreenshot } : {}),
            });
          } catch (error) {
            if (signal?.aborted) throw error;
            return visionToolFailureResult("ambient_visual_analyze", error, {
              validationStatus: "failed",
            });
          }
        });
      },
    });
  };
}

function miniCpmVisionInputLabel(input: MiniCpmVisionAnalyzeInput, rawInput: MiniCpmVisionAnalyzeInput = input): string {
  if (rawInput.browserScreenshot) return "latest browser screenshot";
  const primary = input.image?.path ?? input.imagePath ?? input.video?.path ?? input.videoPath ?? "visual input";
  const reference = input.referenceImage?.path ?? input.referenceImagePath;
  return reference ? `${primary} against ${reference}` : primary;
}

function visionToolUpdate(
  toolName: string,
  text: string,
  details: Record<string, unknown> = {},
): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-vision",
      toolName,
      status: "running",
      ...details,
    },
  };
}

function visionToolResult(text: string, details: Record<string, unknown>): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-vision",
      ...details,
    },
  };
}

function visionToolFailureResult(
  toolName: "ambient_visual_minicpm_setup" | "ambient_visual_analyze",
  error: unknown,
  input: Parameters<typeof miniCpmVisionDiagnosticsForFailure>[0],
): { content: { type: "text"; text: string }[]; details: Record<string, unknown>; isError: true } {
  const message = errorMessage(error);
  const diagnostics = miniCpmVisionDiagnosticsForFailure({
    ...input,
    error: message,
  });
  const heading = toolName === "ambient_visual_minicpm_setup"
    ? "MiniCPM-V visual provider setup failed."
    : "MiniCPM-V visual analysis failed.";
  const diagnosticLines = diagnostics.length
    ? [
        "",
        "Diagnostics:",
        ...diagnostics.map((diagnostic) => `- ${diagnostic.title}: ${diagnostic.detail} Next: ${diagnostic.nextAction}`),
      ]
    : [];
  return {
    ...visionToolResult([
      heading,
      `Error: ${message}`,
      ...diagnosticLines,
    ].join("\n"), {
      toolName,
      status: "failed",
      error: message,
      diagnostics,
    }),
    isError: true,
  };
}

async function withVisionToolHeartbeat<T>(
  toolName: "ambient_visual_minicpm_setup" | "ambient_visual_analyze",
  heartbeatMessage: string,
  onUpdate: ((update: { content: { type: "text"; text: string }[]; details: Record<string, unknown> }) => void) | undefined,
  signal: AbortSignal | undefined,
  operation: (
    markActivity: (activityMessage?: string, details?: Record<string, unknown>) => void,
  ) => Promise<T>,
): Promise<T> {
  let heartbeatCount = 0;
  const markActivity = (activityMessage = heartbeatMessage, details: Record<string, unknown> = {}) => {
    if (signal?.aborted) return;
    onUpdate?.(visionToolUpdate(toolName, activityMessage, details));
  };
  const timer = setInterval(() => {
    heartbeatCount += 1;
    markActivity(heartbeatMessage, { heartbeatCount });
  }, 30_000);
  timer.unref?.();
  try {
    return await operation(markActivity);
  } finally {
    clearInterval(timer);
  }
}

function resolveMiniCpmBrowserScreenshotInput(
  input: MiniCpmVisionAnalyzeInput,
  artifact: BrowserScreenshotArtifactReference | undefined,
): MiniCpmVisionAnalyzeInput {
  if (!input.browserScreenshot) return input;
  if (!artifact?.artifactPath) {
    throw new Error("No latest browser_screenshot artifact is available in this thread. Run browser_screenshot first, or pass image.path for a concrete screenshot artifact.");
  }
  const { browserScreenshot: _browserScreenshot, ...rest } = input;
  return {
    ...rest,
    image: {
      path: artifact.artifactPath,
      source: "browser_screenshot",
      label: input.browserScreenshot.label ?? "browser screenshot",
    },
  };
}

function miniCpmVisionSetupToolInput(params: unknown): MiniCpmVisionSetupInput {
  const input = params && typeof params === "object" && !Array.isArray(params) ? params as Record<string, unknown> : {};
  const action = optionalString(input.action);
  if (action && !["install", "repair", "validate", "stop", "uninstall"].includes(action)) throw new Error("action must be install, repair, validate, stop, or uninstall.");
  const validationTask = miniCpmVisionTaskValue(input.validationTask);
  return {
    provider: "minicpm-v",
    ...(action ? { action: action as MiniCpmVisionSetupInput["action"] } : {}),
    ...(optionalBoolean(input.installRuntime) !== undefined ? { installRuntime: optionalBoolean(input.installRuntime) } : {}),
    ...(optionalString(input.runtimeBinaryPath) ? { runtimeBinaryPath: optionalString(input.runtimeBinaryPath) } : {}),
    ...(optionalString(input.runtimeArchivePath) ? { runtimeArchivePath: optionalString(input.runtimeArchivePath) } : {}),
    ...(optionalString(input.runtimeArtifactId) ? { runtimeArtifactId: optionalString(input.runtimeArtifactId) } : {}),
    ...(optionalString(input.endpointUrl) ? { endpointUrl: optionalString(input.endpointUrl) } : {}),
    ...(optionalString(input.validationImagePath) ? { validationImagePath: optionalString(input.validationImagePath) } : {}),
    ...(validationTask ? { validationTask } : {}),
    ...(optionalString(input.validationPrompt) ? { validationPrompt: optionalString(input.validationPrompt) } : {}),
  };
}

function miniCpmVisionAnalyzeToolInput(params: unknown): MiniCpmVisionAnalyzeInput {
  const input = params && typeof params === "object" && !Array.isArray(params) ? params as Record<string, unknown> : {};
  const task = miniCpmVisionTaskValue(input.task);
  const image = miniCpmVisionImageInputReference(input.image, "image");
  const video = miniCpmVisionVideoInputReference(input.video, "video");
  const browserScreenshot = miniCpmVisionBrowserScreenshotInputReference(input.browserScreenshot);
  const referenceImage = miniCpmVisionImageInputReference(input.referenceImage, "referenceImage");
  const imagePath = optionalString(input.imagePath);
  const videoPath = optionalString(input.videoPath);
  const primaryInputCount = [image || imagePath, video || videoPath, browserScreenshot].filter(Boolean).length;
  if (primaryInputCount > 1) {
    throw new Error("MiniCPM-V visual analysis accepts one primary visual input: use image/imagePath, browserScreenshot, or video/videoPath.");
  }
  if (!image && !imagePath && !browserScreenshot && !video && !videoPath) {
    throw new Error("MiniCPM-V visual analysis requires image.path, imagePath, browserScreenshot, video.path, or videoPath.");
  }
  return {
    ...(imagePath ? { imagePath } : {}),
    ...(image ? { image } : {}),
    ...(browserScreenshot ? { browserScreenshot } : {}),
    ...(videoPath ? { videoPath } : {}),
    ...(video ? { video } : {}),
    ...(optionalNumber(input.frameTimestampMs) !== undefined ? { frameTimestampMs: optionalNumber(input.frameTimestampMs) } : {}),
    ...(optionalString(input.referenceImagePath) ? { referenceImagePath: optionalString(input.referenceImagePath) } : {}),
    ...(referenceImage ? { referenceImage } : {}),
    ...(task ? { task } : {}),
    ...(optionalString(input.prompt) ? { prompt: optionalString(input.prompt) } : {}),
    ...(optionalString(input.outputJsonPath) ? { outputJsonPath: optionalString(input.outputJsonPath) } : {}),
    ...(optionalString(input.runtimeBinaryPath) ? { runtimeBinaryPath: optionalString(input.runtimeBinaryPath) } : {}),
    ...(optionalString(input.endpointUrl) ? { endpointUrl: optionalString(input.endpointUrl) } : {}),
    ...(optionalBoolean(input.allowExternalImagePaths) !== undefined ? { allowExternalImagePaths: optionalBoolean(input.allowExternalImagePaths) } : {}),
    ...(optionalBoolean(input.allowExternalMediaPaths) !== undefined ? { allowExternalMediaPaths: optionalBoolean(input.allowExternalMediaPaths) } : {}),
    ...(optionalBoolean(input.offline) !== undefined ? { offline: optionalBoolean(input.offline) } : {}),
    ...(optionalNumber(input.maxTokens) !== undefined ? { maxTokens: optionalNumber(input.maxTokens) } : {}),
  };
}

function miniCpmVisionBrowserScreenshotInputReference(value: unknown): MiniCpmVisionBrowserScreenshotInputReference | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("browserScreenshot must be an object with ref:\"latest\" or artifactRef:\"latest_browser_screenshot\".");
  const input = value as Record<string, unknown>;
  const ref = optionalString(input.ref);
  const artifactRef = optionalString(input.artifactRef);
  if (ref && ref !== "latest") throw new Error("browserScreenshot.ref must be latest.");
  if (artifactRef && artifactRef !== "latest_browser_screenshot") throw new Error("browserScreenshot.artifactRef must be latest_browser_screenshot.");
  if (!ref && !artifactRef) throw new Error("browserScreenshot requires ref:\"latest\" or artifactRef:\"latest_browser_screenshot\".");
  return {
    ...(ref ? { ref: "latest" as const } : {}),
    ...(artifactRef ? { artifactRef: "latest_browser_screenshot" as const } : {}),
    ...(optionalString(input.label) ? { label: optionalString(input.label) } : {}),
  };
}

function miniCpmVisionImageInputReference(value: unknown, label: string): MiniCpmVisionAnalyzeInput["image"] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object with a path.`);
  const input = value as Record<string, unknown>;
  const path = optionalString(input.path);
  if (!path) throw new Error(`${label}.path is required.`);
  const source = miniCpmVisionImageSourceValue(input.source);
  return {
    path,
    ...(optionalBoolean(input.absolute) !== undefined ? { absolute: optionalBoolean(input.absolute) } : {}),
    ...(source ? { source } : {}),
    ...(optionalString(input.label) ? { label: optionalString(input.label) } : {}),
  };
}

function miniCpmVisionVideoInputReference(value: unknown, label: string): MiniCpmVisionAnalyzeInput["video"] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object with a path.`);
  const input = value as Record<string, unknown>;
  const path = optionalString(input.path);
  if (!path) throw new Error(`${label}.path is required.`);
  const source = miniCpmVisionVideoSourceValue(input.source);
  return {
    path,
    ...(optionalBoolean(input.absolute) !== undefined ? { absolute: optionalBoolean(input.absolute) } : {}),
    ...(source ? { source } : {}),
    ...(optionalString(input.label) ? { label: optionalString(input.label) } : {}),
    ...(optionalNumber(input.frameTimestampMs) !== undefined ? { frameTimestampMs: optionalNumber(input.frameTimestampMs) } : {}),
  };
}

function miniCpmVisionImageSourceValue(value: unknown): MiniCpmVisionImageInputSource | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const sources = new Set(["workspace_file", "browser_screenshot", "chat_attachment", "media_artifact", "selected_screenshot", "external_file"]);
  if (typeof value !== "string" || !sources.has(value)) {
    throw new Error("MiniCPM-V image source must be one of workspace_file, browser_screenshot, chat_attachment, media_artifact, selected_screenshot, or external_file.");
  }
  return value as MiniCpmVisionImageInputSource;
}

function miniCpmVisionVideoSourceValue(value: unknown): MiniCpmVisionVideoInputSource | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const sources = new Set(["workspace_file", "chat_attachment", "media_artifact", "external_file"]);
  if (typeof value !== "string" || !sources.has(value)) {
    throw new Error("MiniCPM-V video source must be one of workspace_file, chat_attachment, media_artifact, or external_file.");
  }
  return value as MiniCpmVisionVideoInputSource;
}

const miniCpmVisionTasks = new Set<MiniCpmVisionTask>([
  "ui_review",
  "game_visual_review",
  "screenshot_ocr",
  "image_description",
  "design_comparison",
  "video_frame_review",
]);

function miniCpmVisionTaskValue(value: unknown): MiniCpmVisionTask | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (!miniCpmVisionTasks.has(value as MiniCpmVisionTask)) {
    throw new Error("MiniCPM-V task must be one of ui_review, game_visual_review, screenshot_ocr, image_description, design_comparison, or video_frame_review.");
  }
  return value as MiniCpmVisionTask;
}

function miniCpmVisionSetupText(result: MiniCpmVisionSetupResult): string {
  return [
    "MiniCPM-V visual provider setup completed.",
    `Status: ${result.status}`,
    `Action: ${result.action}`,
    `Package: ${result.packageName}`,
    `Validation: ${result.validation.status}`,
    result.validation.model ? `Model: ${result.validation.model}` : undefined,
    result.runtimeInstall ? `Runtime install: ${result.runtimeInstall.status}` : undefined,
    result.runtimeInstall?.artifactId ? `Runtime artifact: ${result.runtimeInstall.artifactId}` : undefined,
    result.runtimeInstall?.receiptPath ? `Runtime receipt: ${result.runtimeInstall.receiptPath}` : undefined,
    result.runtimeInstall?.macosSecurity
      ? `Runtime macOS security: quarantine ${result.runtimeInstall.macosSecurity.quarantineBefore}->${result.runtimeInstall.macosSecurity.quarantineAfter}, Gatekeeper ${result.runtimeInstall.macosSecurity.gatekeeperAssessment}, default download ${result.runtimeInstall.macosSecurity.defaultDownloadPromotion}${result.runtimeInstall.macosSecurity.promotionPolicy ? ` (${result.runtimeInstall.macosSecurity.promotionPolicy})` : ""}`
      : undefined,
    result.validation.binaryPath ? `Runtime: ${result.validation.binaryPath}` : undefined,
    result.validation.endpoint ? `Endpoint: ${result.validation.endpoint}` : undefined,
    result.validation.endpointMode ? `Endpoint mode: ${result.validation.endpointMode}` : undefined,
    result.validation.endpointModelIds?.length ? `Endpoint models: ${result.validation.endpointModelIds.join(", ")}` : undefined,
    result.validation.runtimeState ? `Runtime state: ${result.validation.runtimeState.status}${result.validation.runtimeState.pid ? ` pid ${result.validation.runtimeState.pid}` : result.validation.runtimeState.previousPid ? ` previous pid ${result.validation.runtimeState.previousPid}` : ""}` : undefined,
    result.validation.summary ? `Validation summary: ${result.validation.summary}` : undefined,
    result.validation.artifactPath ? `Validation artifact: ${result.validation.artifactPath}` : undefined,
    result.validation.error ? `Error: ${result.validation.error}` : undefined,
    result.cleanup
      ? [
          "Cleanup:",
          `- Stop: ${result.cleanup.stopStatus}`,
          `- Package: ${result.cleanup.packageStatus}`,
          ...result.cleanup.paths.map((path) => `- ${path.path}: ${path.status}${path.error ? ` (${path.error})` : ""}`),
          ...result.cleanup.preserved.map((item) => `- Preserved: ${item}`),
        ].join("\n")
      : undefined,
    result.diagnostics.length ? ["Diagnostics:", ...result.diagnostics.map((diagnostic) => `- ${diagnostic.code}: ${diagnostic.title}. ${diagnostic.nextAction}`)].join("\n") : undefined,
    result.nextSteps.length ? ["Next steps:", ...result.nextSteps.map((step) => `- ${step}`)].join("\n") : undefined,
  ].filter(Boolean).join("\n");
}

function miniCpmVisionAnalysisText(result: MiniCpmVisionAnalysisResult): string {
  const observations = result.observations.length
    ? result.observations.map((observation, index) => {
        return `${index + 1}. [${observation.kind}, ${observation.confidence}] ${observation.description}\n   Evidence: ${observation.evidence}`;
      }).join("\n")
    : "None returned.";
  const limitations = result.limitations.length
    ? result.limitations.map((limitation) => `- ${limitation}`).join("\n")
    : "- None returned.";
  return [
    "MiniCPM-V visual analysis completed.",
    `Task: ${result.task}`,
    result.model ? `Model: ${result.model}` : undefined,
    result.video ? `Video: ${result.video.path} (${result.video.bytes} bytes, sha256 ${result.video.sha256.slice(0, 12)}..., frame ${result.video.frameTimestampMs}ms)` : undefined,
    `Image: ${result.image.path} (${result.image.bytes} bytes, sha256 ${result.image.sha256.slice(0, 12)}...)`,
    result.referenceImage ? `Reference image: ${result.referenceImage.path} (${result.referenceImage.bytes} bytes, sha256 ${result.referenceImage.sha256.slice(0, 12)}...)` : undefined,
    `Artifact: ${result.artifacts.jsonPath}`,
    `Schema valid: ${result.validation.valid ? "yes" : "no"}`,
    "",
    "Summary:",
    result.summary,
    "",
    "Observations:",
    observations,
    "",
    "Limitations:",
    limitations,
    "",
    "Use these observations only as evidence from the supplied image; do not infer hidden app state or unstated user intent.",
  ].filter((line) => line !== undefined).join("\n");
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
