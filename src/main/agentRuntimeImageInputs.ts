import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { AmbientModelRuntimeProfile } from "../shared/ambientModels";
import type { SendMessageInput, WorkspaceContextReference } from "../shared/types";

export const AGENT_RUNTIME_IMAGE_INPUT_MAX_COUNT = 8;
export const AGENT_RUNTIME_IMAGE_INPUT_MAX_BYTES = 20 * 1024 * 1024;

const IMAGE_MIME_BY_EXTENSION = new Map([
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export interface AgentRuntimeImageInputResolution {
  images: ImageContent[];
  attachments: AgentRuntimeImageAttachmentSummary[];
}

export interface AgentRuntimeImageAttachmentSummary {
  path: string;
  mimeType: string;
  bytes: number;
}

export async function resolveAgentRuntimeImageInputs(input: {
  sendInput: Pick<SendMessageInput, "context">;
  workspacePath: string;
  modelProfile: AmbientModelRuntimeProfile;
}): Promise<AgentRuntimeImageInputResolution> {
  const candidates = imageContextReferences(input.sendInput.context ?? []);
  if (candidates.length === 0) return { images: [], attachments: [] };

  if (!input.modelProfile.supportsVision) {
    throw new Error(
      `Selected image context ${formatImageContextList(candidates)} requires image input, ` +
        `but ${input.modelProfile.label} does not support images. Choose a vision-capable model or remove the image attachment.`,
    );
  }
  if (candidates.length > AGENT_RUNTIME_IMAGE_INPUT_MAX_COUNT) {
    throw new Error(
      `Attach at most ${AGENT_RUNTIME_IMAGE_INPUT_MAX_COUNT} images for one model turn; ` +
        `${candidates.length} image files were selected.`,
    );
  }

  const images: ImageContent[] = [];
  const attachments: AgentRuntimeImageAttachmentSummary[] = [];
  for (const reference of candidates) {
    const mimeType = imageMimeTypeForPath(reference.path);
    if (!mimeType) continue;
    const absolutePath = contextReferenceAbsolutePath(input.workspacePath, reference);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) continue;
    if (fileStat.size > AGENT_RUNTIME_IMAGE_INPUT_MAX_BYTES) {
      throw new Error(
        `Image attachment ${reference.path} is ${formatImageBytes(fileStat.size)}, which exceeds the ` +
          `${formatImageBytes(AGENT_RUNTIME_IMAGE_INPUT_MAX_BYTES)} per-image limit.`,
      );
    }
    const bytes = await readFile(absolutePath);
    images.push({
      type: "image",
      mimeType,
      data: bytes.toString("base64"),
    });
    attachments.push({
      path: reference.path,
      mimeType,
      bytes: fileStat.size,
    });
  }

  return { images, attachments };
}

export function imageContextReferences(
  references: readonly WorkspaceContextReference[],
): WorkspaceContextReference[] {
  return references.filter((reference) => reference.kind === "file" && Boolean(imageMimeTypeForPath(reference.path)));
}

export function imageMimeTypeForPath(path: string): string | undefined {
  return IMAGE_MIME_BY_EXTENSION.get(extname(path).toLowerCase());
}

export function contextReferenceAbsolutePath(workspacePath: string, reference: Pick<WorkspaceContextReference, "path" | "absolute">): string {
  return reference.absolute ? reference.path : resolve(workspacePath, reference.path);
}

function formatImageContextList(references: readonly WorkspaceContextReference[]): string {
  const names = references.slice(0, 3).map((reference) => basename(reference.path));
  const suffix = references.length > names.length ? ` and ${references.length - names.length} more` : "";
  return names.length === 1 ? names[0] : `${names.join(", ")}${suffix}`;
}

function formatImageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
