import type { MediaArtifactResult } from "../../shared/desktopTypes";
import { numberField, pathField, recordValue, textField } from "./toolMessageMetadataFields";

export type ArtifactPathHints = Map<string, string>;

export type ArtifactMediaKind = "image" | "audio" | "video";

export type ArtifactPreviewRoute =
  | { kind: "local-file" }
  | { kind: "workspace-file" }
  | { kind: "workspace-media"; mediaKind: Extract<ArtifactMediaKind, "image" | "video"> };

export type ToolManagedFileArtifactPreviewData = {
  filename: string;
  bytes?: number;
  source?: string;
  containerPath?: string;
  hostPath?: string;
  workspacePath?: string;
  copySkippedReason?: string;
};

export function resolveInlineArtifactPath(value: string, hints: ArtifactPathHints | undefined, workspacePath?: string): string | undefined {
  const cleaned = cleanArtifactPath(value)?.replace(/^\.\//, "");
  if (!cleaned || cleaned.endsWith("/") || !/\.[a-z0-9]{1,8}$/i.test(cleaned)) return undefined;
  const hinted = hints?.get(cleaned) ?? hints?.get(`./${cleaned}`);
  if (hinted) return hinted;
  const workspacePathRelative = workspacePath ? workspaceRelativeArtifactPath(cleaned, workspacePath) : undefined;
  if (workspacePathRelative) return workspacePathRelative;
  return workspacePath && isSafeWorkspaceRelativeArtifactPath(cleaned) ? cleaned : undefined;
}

function workspaceRelativeArtifactPath(path: string, workspacePath: string): string | undefined {
  const localPath = fileUrlToLocalPath(path) ?? path;
  const workspace = workspacePath.replace(/\/+$/, "");
  if (!workspace || !localPath.startsWith("/")) return undefined;
  if (localPath === workspace) return ".";
  const prefix = `${workspace}/`;
  return localPath.startsWith(prefix) ? localPath.slice(prefix.length) : undefined;
}

function isSafeWorkspaceRelativeArtifactPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("~")) return false;
  if (/\s/.test(path)) return false;
  if (path.startsWith("../") || path.includes("/../") || path.includes("\\..\\")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || /^[a-z]:[\\/]/i.test(path)) return false;
  return !/[\0\r\n]/.test(path);
}

function fileUrlToLocalPath(value: string): string | undefined {
  if (!/^file:\/\//i.test(value)) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "file:" ? decodeURIComponent(parsed.pathname) : undefined;
  } catch {
    return undefined;
  }
}

export function artifactMediaKindFromPath(path: string): ArtifactMediaKind | undefined {
  const extension = path.toLowerCase().match(/\.([a-z0-9]+)(?:[#?].*)?$/)?.[1];
  if (!extension) return undefined;
  if (["apng", "avif", "gif", "jpg", "jpeg", "png", "svg", "webp"].includes(extension)) return "image";
  if (["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba"].includes(extension)) return "audio";
  if (["m4v", "mov", "mp4", "ogv", "webm"].includes(extension)) return "video";
  return undefined;
}

export function isAbsoluteArtifactPath(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export function artifactPreviewRoute(path: string): ArtifactPreviewRoute {
  if (isAbsoluteArtifactPath(path)) return { kind: "local-file" };
  const mediaKind = artifactMediaKindFromPath(path);
  if (mediaKind === "image" || mediaKind === "video") return { kind: "workspace-media", mediaKind };
  return { kind: "workspace-file" };
}

export function mediaPreviewUnavailableMessage(kind: ArtifactMediaKind): string {
  if (kind === "image") return "File is not a valid image.";
  if (kind === "audio") return "Audio playback is not supported by this Electron build or codec.";
  return "Video playback is not supported by this Electron build or codec.";
}

export function mediaArtifactPathFromMetadata(metadata: Record<string, unknown> | undefined): string | undefined {
  const details = recordValue(metadata?.toolResultDetails);
  return (
    mediaArtifactResult(recordValue(metadata?.mediaArtifact))?.artifactPath ??
    mediaArtifactResult(recordValue(details?.mediaArtifact))?.artifactPath ??
    textField(details, ["audioPath"])
  );
}

export function managedFileArtifactsFromMetadata(value: unknown): ToolManagedFileArtifactPreviewData[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const artifacts = value.flatMap((item): ToolManagedFileArtifactPreviewData[] => {
    const record = recordValue(item);
    if (!record) return [];
    const workspacePath = pathField(record, ["workspacePath"]);
    const hostPath = pathField(record, ["hostPath"]);
    const containerPath = pathField(record, ["containerPath"]);
    const filename = textField(record, ["filename"]) ?? fileBaseName(workspacePath ?? hostPath ?? containerPath ?? "");
    const bytes = numberField(record, ["bytes"]);
    const source = textField(record, ["source"]);
    const copySkippedReason = textField(record, ["copySkippedReason"]);
    if (!filename || (!workspacePath && !hostPath && !containerPath)) return [];
    return [
      {
        filename,
        ...(bytes !== undefined ? { bytes } : {}),
        ...(source ? { source } : {}),
        ...(containerPath ? { containerPath } : {}),
        ...(hostPath ? { hostPath } : {}),
        ...(workspacePath ? { workspacePath } : {}),
        ...(copySkippedReason ? { copySkippedReason } : {}),
      },
    ];
  });
  return artifacts.length ? artifacts : undefined;
}

export function mediaArtifactResult(record: Record<string, unknown> | undefined): MediaArtifactResult | undefined {
  if (!record) return undefined;
  const previewEligible = record.inlinePreviewEligible === true || record.renderedInline === true;
  if (!previewEligible) return undefined;
  const artifactPath = textField(record, ["artifactPath"]);
  const mediaKind = textField(record, ["mediaKind"]);
  const bytes = numberField(record, ["bytes"]);
  const displayInstruction = textField(record, ["displayInstruction"]);
  if (!artifactPath || !isMediaArtifactKind(mediaKind) || bytes === undefined || !displayInstruction) return undefined;
  const mimeType = textField(record, ["mimeType"]);
  const width = numberField(record, ["width"]);
  const height = numberField(record, ["height"]);
  const sourceUrl = textField(record, ["sourceUrl"]);
  const licenseNote = textField(record, ["licenseNote"]);
  return {
    artifactPath,
    mediaKind,
    bytes,
    ...(record.inlinePreviewEligible === true ? { inlinePreviewEligible: true } : {}),
    ...(record.renderedInline === true ? { renderedInline: true } : {}),
    displayInstruction,
    ...(mimeType ? { mimeType } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(licenseNote ? { licenseNote } : {}),
  };
}

function isMediaArtifactKind(value: string | undefined): value is MediaArtifactResult["mediaKind"] {
  return value === "image" || value === "audio" || value === "video";
}

export function isArtifactWritingTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return normalized === "write" || normalized === "file_write" || normalized === "edit";
}

export function isShellTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return normalized === "bash" || normalized === "shell";
}

export function isAmbientCliTool(toolName: string): boolean {
  return toolName.toLowerCase() === "ambient_cli";
}

export function isVoiceTool(toolName: string): boolean {
  return toolName.toLowerCase().startsWith("ambient_voice_");
}

export function isSttTool(toolName: string): boolean {
  return toolName.toLowerCase().startsWith("ambient_stt_");
}

const MEDIA_ARTIFACT_EXTENSIONS = "apng|avif|gif|jpe?g|png|svg|webp|aac|flac|m4a|mp3|oga|ogg|opus|wav|weba|m4v|mov|mp4|ogv|webm";
const MEDIA_ARTIFACT_PATH_PATTERN = `[^\\s"'\\\`<>|]+\\.(?:${MEDIA_ARTIFACT_EXTENSIONS})(?:[?#][^\\s"'\\\`<>|]+)?`;
const SHELL_MEDIA_ARTIFACT_LINE_PATTERN = new RegExp(
  `\\b(?:artifact|generated|created|saved|wrote|written|output)\\b[^\\n]*?(?:to|at|:)\\s+(${MEDIA_ARTIFACT_PATH_PATTERN})\\b`,
  "i",
);
const AMBIENT_CLI_EXPLICIT_MEDIA_ARTIFACT_LINE_PATTERN = new RegExp(
  `\\b(?:artifact|generated|created|saved|wrote|written|output(?:\\s+file)?|(?:image|audio|video|wav|mp3|webm|mp4)\\s+file)\\b[^\\n]*?(?:\\s(?:to|at|as|in)|:|\\t|->)\\s*["']?(${MEDIA_ARTIFACT_PATH_PATTERN})["']?\\b`,
  "i",
);
const AMBIENT_CLI_MEDIA_ARTIFACT_PATH_PATTERN = new RegExp(`(${MEDIA_ARTIFACT_PATH_PATTERN})`, "gi");

export function extractShellMediaArtifactPath(result: string): string | undefined {
  for (const line of result.split(/\r?\n/).reverse()) {
    const match = SHELL_MEDIA_ARTIFACT_LINE_PATTERN.exec(line);
    if (match?.[1]) return cleanArtifactPath(match[1]);
  }
  return undefined;
}

export function extractAmbientCliMediaArtifactPath(result: string): string | undefined {
  const jsonPath = extractAmbientCliJsonMediaArtifactPath(result);
  if (jsonPath) return resolveAmbientCliResultPath(jsonPath, result);

  for (const line of result.split(/\r?\n/).reverse()) {
    const match = AMBIENT_CLI_EXPLICIT_MEDIA_ARTIFACT_LINE_PATTERN.exec(line);
    if (match?.[1]) return resolveAmbientCliResultPath(match[1], result);
  }

  AMBIENT_CLI_MEDIA_ARTIFACT_PATH_PATTERN.lastIndex = 0;
  const matches = [...result.matchAll(AMBIENT_CLI_MEDIA_ARTIFACT_PATH_PATTERN)]
    .map((match) => cleanArtifactPath(match[1]))
    .filter((path): path is string => Boolean(path));
  const unique = [...new Set(matches)];
  return unique.length === 1 ? resolveAmbientCliResultPath(unique[0], result) : undefined;
}

function extractAmbientCliJsonMediaArtifactPath(result: string): string | undefined {
  for (const parsed of jsonObjectsFromText(result).reverse()) {
    const path = mediaPathField(parsed);
    if (path) return path;
  }
  return undefined;
}

function mediaPathField(record: Record<string, unknown>): string | undefined {
  const pathKeys = [
    "artifactPath",
    "artifact_path",
    "outputPath",
    "output_path",
    "audioPath",
    "audio_path",
    "imagePath",
    "image_path",
    "videoPath",
    "video_path",
    "output",
    "outputFile",
    "output_file",
    "path",
  ];
  for (const key of pathKeys) {
    const value = record[key];
    if (typeof value === "string" && artifactMediaKindFromPath(value)) return value;
  }
  return undefined;
}

function jsonObjectsFromText(text: string): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, index + 1)) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              objects.push(parsed as Record<string, unknown>);
            }
          } catch {
            // Tool output can contain prose and logs around JSON payloads.
          }
          start = index;
          break;
        }
      }
    }
  }
  return objects;
}

function resolveAmbientCliResultPath(path: string, result: string): string | undefined {
  const cleaned = cleanArtifactPath(path);
  if (!cleaned) return undefined;
  if (/^(?:[a-z]+:)?[\\/]/i.test(cleaned) || cleaned.startsWith(".")) return cleaned;
  const cwd = result.match(/^Cwd:\s+([^\n]+)$/im)?.[1];
  return cwd ? `${cwd.replace(/\/+$/, "")}/${cleaned}` : cleaned;
}

export function cleanArtifactPath(path: string | undefined): string | undefined {
  return path
    ?.trim()
    .replace(/^["'`]+/, "")
    .replace(/["'`.,;:]+$/, "");
}

export function normalizeArtifactPath(path: string | undefined, workspacePath: string): string | undefined {
  const cleaned = cleanArtifactPath(path);
  if (!cleaned) return undefined;
  const workspace = workspacePath.replace(/\/+$/, "");
  if (cleaned === workspace) return ".";
  const prefix = `${workspace}/`;
  if (cleaned.startsWith(prefix)) return cleaned.slice(prefix.length);
  const slashlessWorkspace = workspace.replace(/^\/+/, "");
  const slashlessPrefix = `${slashlessWorkspace}/`;
  if (cleaned === slashlessWorkspace) return ".";
  if (cleaned.startsWith(slashlessPrefix)) return cleaned.slice(slashlessPrefix.length);
  const embeddedWorkspaceIndex = cleaned.indexOf(prefix);
  if (embeddedWorkspaceIndex >= 0) return cleaned.slice(embeddedWorkspaceIndex + prefix.length);
  const embeddedSlashlessWorkspaceIndex = cleaned.indexOf(slashlessPrefix);
  if (embeddedSlashlessWorkspaceIndex >= 0) return cleaned.slice(embeddedSlashlessWorkspaceIndex + slashlessPrefix.length);
  return cleaned;
}

export function addArtifactHint(hints: ArtifactPathHints, key: string, path: string): void {
  const cleaned = cleanArtifactPath(key)?.replace(/^\.\//, "");
  if (!cleaned || /\s/.test(cleaned)) return;
  hints.set(cleaned, path);
  hints.set(`./${cleaned}`, path);
}

export function fileBaseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function languageFromPath(path: string): string | undefined {
  const extension = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!extension) return undefined;
  const languages: Record<string, string> = {
    css: "css",
    html: "html",
    htm: "html",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    sh: "shell",
    ts: "typescript",
    tsx: "tsx",
    txt: "text",
    yml: "yaml",
    yaml: "yaml",
  };
  return languages[extension];
}
