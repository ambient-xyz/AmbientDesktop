import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { MediaArtifactResult } from "../../shared/desktopTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { mediaToolDescriptor } from "./agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "./agentRuntimeDesktopToolFacade";
import { downloadMediaArtifact, mediaDownloadResultText } from "./agentRuntimeMediaFacade";

export function createMediaToolExtension(workspace: Pick<WorkspaceState, "path">): ExtensionFactory {
  return (pi) => {
    registerDesktopTool(pi, mediaToolDescriptor("media_download"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        onUpdate?.(mediaToolUpdate("media_download", "Downloading and validating media artifact."));
        const result = await downloadMediaArtifact(workspace.path, params, { signal });
        return mediaToolResult(mediaDownloadResultText(result), {
          toolName: "media_download",
          status: "complete",
          mediaArtifact: mediaArtifactResultDetails(result),
          ...result,
        });
      },
    });
  };
}

function mediaToolUpdate(toolName: string, text: string): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-media",
      toolName,
      status: "running",
    },
  };
}

function mediaToolResult(text: string, details: Record<string, unknown>): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-media",
      ...details,
    },
  };
}

function mediaArtifactResultDetails(result: MediaArtifactResult): MediaArtifactResult {
  return {
    artifactPath: result.artifactPath,
    mediaKind: result.mediaKind,
    bytes: result.bytes,
    inlinePreviewEligible: true,
    displayInstruction: result.displayInstruction,
    ...(result.mimeType ? { mimeType: result.mimeType } : {}),
    ...(result.width !== undefined ? { width: result.width } : {}),
    ...(result.height !== undefined ? { height: result.height } : {}),
    ...(result.sourceUrl ? { sourceUrl: result.sourceUrl } : {}),
    ...(result.licenseNote ? { licenseNote: result.licenseNote } : {}),
  };
}
