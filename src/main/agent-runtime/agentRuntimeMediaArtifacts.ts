import { readdirSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative } from "node:path";

import type { MediaArtifactResult } from "../../shared/desktopTypes";

const MEDIA_ARTIFACT_EXTENSIONS = "apng|avif|gif|jpe?g|png|svg|webp|aac|flac|m4a|mp3|oga|ogg|opus|wav|weba|m4v|mov|mp4|ogv|webm";
const MEDIA_ARTIFACT_PATH_PATTERN = `[^\\s"'\\\`<>|]+\\.(?:${MEDIA_ARTIFACT_EXTENSIONS})(?:[?#][^\\s"'\\\`<>|]+)?`;
const MEDIA_ARTIFACT_EXTENSION_SET = new Set([
  "apng",
  "avif",
  "gif",
  "jpg",
  "jpeg",
  "png",
  "svg",
  "webp",
  "aac",
  "flac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
  "m4v",
  "mov",
  "mp4",
  "ogv",
  "webm",
]);

export interface WorkspaceMediaSnapshotEntry {
  relativePath: string;
  size: number;
  mtimeMs: number;
}

export function workspaceArtifactPathFromTool(
  label: string,
  input: string,
  result: string,
  workspacePath: string,
): string | undefined {
  const normalized = label.toLowerCase();
  if (normalized === "bash" || normalized === "shell") {
    return normalizeWorkspaceArtifactPath(shellMediaArtifactPathFromResult(result), workspacePath);
  }
  if (normalized === "ambient_cli") {
    return normalizeWorkspaceArtifactPath(ambientCliMediaArtifactPathFromResult(result), workspacePath);
  }
  if (normalized === "media_download") {
    return normalizeWorkspaceArtifactPath(shellMediaArtifactPathFromResult(result), workspacePath);
  }
  if (normalized !== "write" && normalized !== "file_write" && normalized !== "edit") return undefined;
  const parsed = parseToolJsonInput(input);
  const inputPath = stringField(parsed, ["path", "filePath", "file", "targetPath"]);
  const resultPath = result.match(/\b(?:to|in|at)\s+([^\n]+)$/i)?.[1];
  return normalizeWorkspaceArtifactPath(inputPath ?? resultPath, workspacePath);
}

export function shellMediaArtifactPathFromResult(result: string): string | undefined {
  const artifactLine = new RegExp(
    `\\b(?:artifact|generated|created|saved|wrote|written|output)\\b[^\\n]*?(?:to|at|:)\\s+(${MEDIA_ARTIFACT_PATH_PATTERN})\\b`,
    "i",
  );
  for (const line of result.split(/\r?\n/).reverse()) {
    const match = artifactLine.exec(line);
    if (match?.[1]) return cleanToolPath(match[1]);
  }
  return undefined;
}

export function snapshotWorkspaceMediaFiles(workspacePath: string): Map<string, WorkspaceMediaSnapshotEntry> {
  const snapshot = new Map<string, WorkspaceMediaSnapshotEntry>();
  scanWorkspaceMediaFiles(workspacePath, workspacePath, snapshot, 0);
  return snapshot;
}

function scanWorkspaceMediaFiles(
  workspacePath: string,
  directory: string,
  snapshot: Map<string, WorkspaceMediaSnapshotEntry>,
  depth: number,
): void {
  if (depth > 8) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      scanWorkspaceMediaFiles(workspacePath, absolutePath, snapshot, depth + 1);
      continue;
    }
    if (!entry.isFile() || !mediaArtifactKindFromPath(entry.name)) continue;
    try {
      const file = statSync(absolutePath);
      if (!file.isFile()) continue;
      const relativePath = relative(workspacePath, absolutePath);
      if (!relativePath || relativePath.startsWith("..")) continue;
      snapshot.set(relativePath, { relativePath, size: file.size, mtimeMs: file.mtimeMs });
    } catch {
      continue;
    }
  }
}

export function newestChangedMediaArtifact(
  workspacePath: string,
  before: Map<string, WorkspaceMediaSnapshotEntry>,
  after: Map<string, WorkspaceMediaSnapshotEntry>,
): string | undefined {
  const changed = [...after.values()]
    .filter((entry) => {
      const previous = before.get(entry.relativePath);
      return !previous || previous.size !== entry.size || Math.trunc(previous.mtimeMs) !== Math.trunc(entry.mtimeMs);
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return normalizeWorkspaceArtifactPath(changed[0]?.relativePath, workspacePath);
}

export function appendMediaArtifactResult<T>(result: T, artifactPath: string, workspacePath: string): T {
  const mediaArtifact = mediaArtifactResultForPath(workspacePath, artifactPath);
  const notice = mediaArtifactNotice(mediaArtifact ?? {
    artifactPath,
    mediaKind: "image",
    bytes: 0,
    inlinePreviewEligible: true,
    displayInstruction: "Ambient Desktop will attempt to render this media inline in the visible chat.",
  });

  if (typeof result === "string") return `${result}\n${notice}` as T;
  if (Array.isArray(result)) return [...result, { type: "text", text: notice }] as T;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    const details = record.details && typeof record.details === "object" && !Array.isArray(record.details) ? record.details as Record<string, unknown> : {};
    const nextDetails = {
      ...details,
      artifactPath: mediaArtifact?.artifactPath ?? artifactPath,
      inlinePreviewEligible: true,
      ...(mediaArtifact ? { mediaArtifact } : {}),
    };
    if (Array.isArray(record.content)) {
      return {
        ...record,
        content: [...record.content, { type: "text", text: notice }],
        details: nextDetails,
      } as T;
    }
    return { ...record, details: nextDetails, content: [{ type: "text", text: notice }] } as T;
  }
  return { content: [{ type: "text", text: notice }], details: { artifactPath, inlinePreviewEligible: true, ...(mediaArtifact ? { mediaArtifact } : {}) } } as T;
}

export function mediaArtifactNotice(result: MediaArtifactResult): string {
  return [
    "",
    `Generated media artifact: ${result.artifactPath}`,
    `Ambient Desktop will attempt to render an inline media preview for ${result.artifactPath} in the visible chat.`,
    "In your final answer, include the artifact path and refer to the preview only if it is visibly present above. Do not say this interface, model, chat, or environment cannot render or display images/audio/video inline.",
    "Do not read image/audio/video bytes just to display the artifact; report the artifact path to the user instead.",
  ].join("\n").trim();
}

export function mediaArtifactResultForPath(workspacePath: string, artifactPath: string): MediaArtifactResult | undefined {
  const normalizedPath = normalizeWorkspaceArtifactPath(artifactPath, workspacePath);
  const mediaKind = normalizedPath ? mediaArtifactKindFromPath(normalizedPath) : undefined;
  if (!normalizedPath || !mediaKind) return undefined;
  let bytes = 0;
  try {
    bytes = statSync(join(workspacePath, normalizedPath)).size;
  } catch {
    bytes = 0;
  }
  return {
    artifactPath: normalizedPath,
    mediaKind,
    bytes,
    inlinePreviewEligible: true,
    displayInstruction: "Ambient Desktop will attempt to render this media inline in the visible chat. Do not claim inline media display is unsupported.",
  };
}

export function ambientCliMediaArtifactPathFromResult(result: string): string | undefined {
  const jsonPath = ambientCliJsonMediaArtifactPathFromResult(result);
  if (jsonPath) return resolveAmbientCliResultArtifactPath(jsonPath, result);

  const explicitLine = new RegExp(
    `\\b(?:artifact|generated|created|saved|wrote|written|output(?:\\s+file)?|(?:image|audio|video|wav|mp3|webm|mp4)\\s+file)\\b[^\\n]*?(?:\\s(?:to|at|as|in)|:|\\t|->)\\s*["']?(${MEDIA_ARTIFACT_PATH_PATTERN})["']?\\b`,
    "i",
  );
  for (const line of result.split(/\r?\n/).reverse()) {
    const match = explicitLine.exec(line);
    if (match?.[1]) return resolveAmbientCliResultArtifactPath(match[1], result);
  }

  const mediaPath = new RegExp(`(${MEDIA_ARTIFACT_PATH_PATTERN})`, "gi");
  const matches = [...result.matchAll(mediaPath)]
    .map((match) => cleanToolPath(match[1]))
    .filter((path): path is string => Boolean(path));
  const unique = [...new Set(matches)];
  return unique.length === 1 ? resolveAmbientCliResultArtifactPath(unique[0], result) : undefined;
}

function ambientCliJsonMediaArtifactPathFromResult(result: string): string | undefined {
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
    if (typeof value === "string" && mediaArtifactKindFromPath(value)) return value;
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
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
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
            // Keep scanning; tool output often mixes logs and JSON snippets.
          }
          start = index;
          break;
        }
      }
    }
  }
  return objects;
}

export function mediaArtifactKindFromPath(path: string): "image" | "audio" | "video" | undefined {
  const extension = path.toLowerCase().match(/\.([a-z0-9]+)(?:[#?].*)?$/)?.[1];
  if (!extension) return undefined;
  if (!MEDIA_ARTIFACT_EXTENSION_SET.has(extension)) return undefined;
  if (["apng", "avif", "gif", "jpg", "jpeg", "png", "svg", "webp"].includes(extension)) return "image";
  if (["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba"].includes(extension)) return "audio";
  if (["m4v", "mov", "mp4", "ogv", "webm"].includes(extension)) return "video";
  return undefined;
}

function resolveAmbientCliResultArtifactPath(path: string, result: string): string | undefined {
  const cleaned = cleanToolPath(path);
  if (!cleaned) return undefined;
  if (/^(?:[a-z]+:)?[\\/]/i.test(cleaned) || cleaned.startsWith(".")) return cleaned;
  const cwd = result.match(/^Cwd:\s+([^\n]+)$/im)?.[1];
  return cwd ? join(cwd, cleaned) : cleaned;
}

export function parseToolJsonInput(input: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function stringField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return cleanToolPath(value);
  }
  return undefined;
}

export function normalizeWorkspaceArtifactPath(path: string | undefined, workspacePath: string): string | undefined {
  const cleaned = cleanToolPath(path);
  if (!cleaned) return undefined;
  const workspace = workspacePath.replace(/\/+$/, "");
  const prefix = `${workspace}/`;
  if (cleaned === workspace) return ".";
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

export function cleanToolPath(path: string | undefined): string | undefined {
  return path
    ?.trim()
    .replace(/^["'`]+/, "")
    .replace(/["'`.,;:]+$/, "");
}
