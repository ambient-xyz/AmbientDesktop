import type {
  BrowserScreenshotResult,
  MiniCpmVisionAnalyzeInput,
  WorkspaceContextReference,
  WorkspaceFileContent,
} from "../../shared/types";

export type MiniCpmVisualActionMediaKind = "image" | "video";

export function miniCpmVisualMediaKindFromPath(path: string): MiniCpmVisualActionMediaKind | undefined {
  const normalized = path.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (/\.(png|jpe?g|webp)$/.test(normalized)) return "image";
  if (/\.(mp4|mov|m4v|webm)$/.test(normalized)) return "video";
  return undefined;
}

export function miniCpmVisualAnalyzeInputForBrowserScreenshot(
  screenshot: BrowserScreenshotResult,
): MiniCpmVisionAnalyzeInput {
  const path = screenshot.artifactPath || screenshot.path;
  const absolute = !screenshot.artifactPath && isAbsoluteRendererPath(screenshot.path);
  return {
    image: {
      path,
      ...(absolute ? { absolute: true } : {}),
      source: "browser_screenshot",
      label: browserScreenshotLabel(screenshot),
    },
    task: "ui_review",
    ...(absolute ? { allowExternalMediaPaths: true } : {}),
  };
}

export function miniCpmVisualAnalyzeInputForContextAttachment(
  attachment: WorkspaceContextReference,
): MiniCpmVisionAnalyzeInput | undefined {
  if (attachment.kind !== "file") return undefined;
  return miniCpmVisualAnalyzeInputForPath({
    path: attachment.path,
    name: attachment.name,
    absolute: attachment.absolute === true,
    source: "chat_attachment",
  });
}

export function miniCpmVisualAnalyzeInputForWorkspaceFile(
  file: WorkspaceFileContent,
): MiniCpmVisionAnalyzeInput | undefined {
  const absolute = file.source === "local";
  return miniCpmVisualAnalyzeInputForPath({
    path: absolute ? file.absolutePath ?? file.path : file.path,
    name: file.name,
    absolute,
    source: "workspace_file",
  });
}

function miniCpmVisualAnalyzeInputForPath(input: {
  path: string;
  name: string;
  absolute?: boolean;
  source: "chat_attachment" | "workspace_file";
}): MiniCpmVisionAnalyzeInput | undefined {
  const kind = miniCpmVisualMediaKindFromPath(input.path);
  if (kind === "image") {
    return {
      image: {
        path: input.path,
        ...(input.absolute ? { absolute: true } : {}),
        source: input.source,
        label: input.name || basenameFromPath(input.path),
      },
      task: "image_description",
      ...(input.absolute ? { allowExternalMediaPaths: true } : {}),
    };
  }
  if (kind === "video") {
    return {
      video: {
        path: input.path,
        ...(input.absolute ? { absolute: true } : {}),
        source: input.source === "chat_attachment" ? "chat_attachment" : "workspace_file",
        label: input.name || basenameFromPath(input.path),
      },
      task: "video_frame_review",
      ...(input.absolute ? { allowExternalMediaPaths: true } : {}),
    };
  }
  return undefined;
}

function browserScreenshotLabel(screenshot: BrowserScreenshotResult): string {
  const title = screenshot.title?.trim();
  if (title) return title.length > 80 ? `${title.slice(0, 77)}...` : title;
  const url = screenshot.url?.trim();
  if (url) return url.length > 80 ? `${url.slice(0, 77)}...` : url;
  return "latest browser screenshot";
}

function basenameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function isAbsoluteRendererPath(path: string): boolean {
  return path.startsWith("/") || /^[a-z]:[\\/]/i.test(path);
}
