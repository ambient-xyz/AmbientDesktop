import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import type { MediaArtifactResult } from "../shared/types";
import { isPathInside } from "./session/sessionPaths";

export type MediaKind = "image";

export interface MediaDownloadInput {
  url: string;
  outputPath: string;
  expectedKind?: MediaKind;
  sourceUrl?: string;
  licenseNote?: string;
}

export interface MediaDownloadResult extends MediaArtifactResult {
  sourceUrl?: string;
  licenseNote?: string;
  metadataPath: string;
  finalUrl?: string;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  url?: string;
  headers: {
    get(name: string): string | null;
  };
  arrayBuffer(): Promise<ArrayBuffer>;
}

type FetchLike = (url: string, init: { redirect: "follow"; headers: Record<string, string>; signal?: AbortSignal }) => Promise<FetchResponseLike>;

export const MAX_MEDIA_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const MEDIA_DOWNLOAD_TIMEOUT_MS = 45_000;

export async function downloadMediaArtifact(
  workspacePath: string,
  rawInput: unknown,
  options: { fetch?: FetchLike; now?: () => Date; signal?: AbortSignal } = {},
): Promise<MediaDownloadResult> {
  const input = mediaDownloadInput(rawInput);
  if (input.expectedKind !== undefined && input.expectedKind !== "image") {
    throw new Error("media_download currently supports expectedKind=image only.");
  }
  const url = validatedHttpUrl(input.url);
  const fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) throw new Error("media_download requires fetch support in this runtime.");

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MEDIA_DOWNLOAD_TIMEOUT_MS);
  let response: FetchResponseLike;
  try {
    response = await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AmbientDesktop/1.0 media_download",
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.2",
      },
    });
  } catch (error) {
    if (timedOut) throw new Error(`media_download timed out after ${MEDIA_DOWNLOAD_TIMEOUT_MS} ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }

  if (!response.ok) {
    throw new Error(`media_download failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType && contentType !== "application/octet-stream" && !contentType.startsWith("image/")) {
    throw new Error(`media_download expected image/* but received ${contentType}.`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_DOWNLOAD_BYTES) {
    throw new Error(`media_download refused ${contentLength} bytes; limit is ${MAX_MEDIA_DOWNLOAD_BYTES} bytes.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error("media_download received an empty response body.");
  if (buffer.byteLength > MAX_MEDIA_DOWNLOAD_BYTES) {
    throw new Error(`media_download refused ${buffer.byteLength} bytes; limit is ${MAX_MEDIA_DOWNLOAD_BYTES} bytes.`);
  }

  const detected = detectImage(buffer);
  if (!detected) {
    throw new Error("media_download received bytes that are not a supported image format.");
  }
  const output = resolveOutputPath(workspacePath, outputPathForDetectedMime(input.outputPath, detected.mimeType));

  await mkdir(dirname(output.absolutePath), { recursive: true });
  await writeFile(output.absolutePath, buffer);

  const now = (options.now ?? (() => new Date()))();
  const sidecar = {
    requestedUrl: url,
    finalUrl: response.url || url,
    sourceUrl: input.sourceUrl,
    licenseNote: input.licenseNote,
    mediaKind: "image" as const,
    mimeType: detected.mimeType,
    bytes: buffer.byteLength,
    width: detected.width,
    height: detected.height,
    fetchedAt: now.toISOString(),
    validationStatus: "valid",
  };
  const metadataAbsolutePath = `${output.absolutePath}.ambient-media.json`;
  await writeFile(metadataAbsolutePath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");

  const metadataPath = relative(workspacePath, metadataAbsolutePath);
  return {
    artifactPath: output.relativePath,
    mediaKind: "image",
    mimeType: detected.mimeType,
    bytes: buffer.byteLength,
    ...(detected.width !== undefined ? { width: detected.width } : {}),
    ...(detected.height !== undefined ? { height: detected.height } : {}),
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.licenseNote ? { licenseNote: input.licenseNote } : {}),
    inlinePreviewEligible: true,
    displayInstruction:
      "Ambient Desktop will attempt to render this media inline in the visible chat. Do not claim inline media display is unsupported.",
    metadataPath,
    finalUrl: response.url || url,
  };
}

export function mediaDownloadResultText(result: MediaDownloadResult): string {
  const dimensions = result.width && result.height ? `, ${result.width}x${result.height}` : "";
  const lines = [
    `Generated media artifact: ${result.artifactPath}`,
    `Ambient Desktop will attempt to render an inline media preview for ${result.artifactPath} in the visible chat.`,
    `Media kind: ${result.mediaKind}`,
    `MIME type: ${result.mimeType}`,
    `Size: ${result.bytes} bytes${dimensions}`,
    `Metadata: ${result.metadataPath}`,
  ];
  if (result.sourceUrl) lines.push(`Source URL: ${result.sourceUrl}`);
  if (result.licenseNote) lines.push(`License note: ${result.licenseNote}`);
  lines.push(
    "In your final answer, include the artifact path and refer to the preview only if it is visibly present above. Do not say this interface, model, chat, or environment cannot render or display images inline.",
  );
  return lines.join("\n");
}

function mediaDownloadInput(value: unknown): MediaDownloadInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("media_download input must be an object.");
  const record = value as Record<string, unknown>;
  const url = requiredString(record, "url");
  const outputPath = requiredString(record, "outputPath");
  const expectedKind = optionalString(record, "expectedKind");
  if (expectedKind !== undefined && expectedKind !== "image") throw new Error("expectedKind must be image.");
  return {
    url,
    outputPath,
    ...(expectedKind ? { expectedKind } : {}),
    ...(optionalString(record, "sourceUrl") ? { sourceUrl: optionalString(record, "sourceUrl") } : {}),
    ...(optionalString(record, "licenseNote") ? { licenseNote: optionalString(record, "licenseNote") } : {}),
  };
}

function validatedHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("url must be a valid http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("url must be a valid http(s) URL.");
  return url.toString();
}

function resolveOutputPath(workspacePath: string, outputPath: string): { absolutePath: string; relativePath: string } {
  const absolutePath = resolve(workspacePath, outputPath);
  if (!isPathInside(workspacePath, absolutePath)) throw new Error("outputPath must stay inside the active workspace.");
  const relativePath = relative(workspacePath, absolutePath);
  if (!relativePath || relativePath.startsWith("..")) throw new Error("outputPath must stay inside the active workspace.");
  return { absolutePath, relativePath };
}

function outputPathForDetectedMime(outputPath: string, mimeType: string): string {
  const extension = extensionForImageMime(mimeType);
  if (!extension) return outputPath;
  const currentExtension = extname(outputPath);
  if (currentExtension.toLowerCase() === extension) return outputPath;
  return currentExtension ? `${outputPath.slice(0, -currentExtension.length)}${extension}` : `${outputPath}${extension}`;
}

function extensionForImageMime(mimeType: string): string | undefined {
  if (mimeType === "image/avif") return ".avif";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return undefined;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value.trim();
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function detectImage(buffer: Buffer): { mimeType: string; width?: number; height?: number } | undefined {
  if (isPng(buffer)) return { mimeType: "image/png", ...pngDimensions(buffer) };
  if (isJpeg(buffer)) return { mimeType: "image/jpeg", ...jpegDimensions(buffer) };
  if (isGif(buffer)) return { mimeType: "image/gif", ...gifDimensions(buffer) };
  if (isWebp(buffer)) return { mimeType: "image/webp", ...webpDimensions(buffer) };
  if (isAvif(buffer)) return { mimeType: "image/avif" };
  return undefined;
}

function isPng(buffer: Buffer): boolean {
  return buffer.byteLength >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function pngDimensions(buffer: Buffer): { width?: number; height?: number } {
  if (buffer.byteLength < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") return {};
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function jpegDimensions(buffer: Buffer): { width?: number; height?: number } {
  let offset = 2;
  while (offset + 9 < buffer.byteLength) {
    if (buffer[offset] !== 0xff) return {};
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.byteLength) return {};
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return {};
}

function isGif(buffer: Buffer): boolean {
  const header = buffer.toString("ascii", 0, 6);
  return buffer.byteLength >= 10 && (header === "GIF87a" || header === "GIF89a");
}

function gifDimensions(buffer: Buffer): { width?: number; height?: number } {
  if (buffer.byteLength < 10) return {};
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function isWebp(buffer: Buffer): boolean {
  return buffer.byteLength >= 16 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
}

function webpDimensions(buffer: Buffer): { width?: number; height?: number } {
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.byteLength >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  return {};
}

function isAvif(buffer: Buffer): boolean {
  return buffer.byteLength >= 16 && buffer.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(buffer.toString("ascii", 8, 12));
}
