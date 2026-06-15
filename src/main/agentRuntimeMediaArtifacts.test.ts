import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  appendMediaArtifactResult,
  mediaArtifactKindFromPath,
  mediaArtifactNotice,
  mediaArtifactResultForPath,
  newestChangedMediaArtifact,
  normalizeWorkspaceArtifactPath,
  snapshotWorkspaceMediaFiles,
  workspaceArtifactPathFromTool,
} from "./agentRuntimeMediaArtifacts";

describe("AgentRuntime media artifact helpers", () => {
  it("detects media artifact paths from tool result shapes", () => {
    const workspacePath = "/tmp/ambient-workspace";

    expect(workspaceArtifactPathFromTool(
      "bash",
      "",
      "Generated output to images/result.png",
      workspacePath,
    )).toBe("images/result.png");

    expect(workspaceArtifactPathFromTool(
      "ambient_cli",
      "",
      `Cwd: ${workspacePath}\n{"artifactPath":"exports/voice.wav"}`,
      workspacePath,
    )).toBe("exports/voice.wav");

    expect(workspaceArtifactPathFromTool(
      "write",
      JSON.stringify({ path: `${workspacePath}/public/generated.webp` }),
      "",
      workspacePath,
    )).toBe("public/generated.webp");
  });

  it("normalizes paths and classifies media artifact kinds", () => {
    const workspacePath = "/tmp/ambient-workspace";

    expect(normalizeWorkspaceArtifactPath(`${workspacePath}/assets/photo.jpg`, workspacePath)).toBe("assets/photo.jpg");
    expect(normalizeWorkspaceArtifactPath(`Wrote ${workspacePath}/assets/photo.jpg`, workspacePath)).toBe("assets/photo.jpg");
    expect(mediaArtifactKindFromPath("assets/photo.jpg")).toBe("image");
    expect(mediaArtifactKindFromPath("audio/output.mp3")).toBe("audio");
    expect(mediaArtifactKindFromPath("video/clip.webm?download=1")).toBe("video");
    expect(mediaArtifactKindFromPath("notes/readme.txt")).toBeUndefined();
  });

  it("snapshots media files and returns the newest changed artifact", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-media-artifacts-"));
    try {
      const before = snapshotWorkspaceMediaFiles(workspacePath);
      await mkdir(join(workspacePath, "assets"), { recursive: true });
      await mkdir(join(workspacePath, "node_modules"), { recursive: true });
      await writeFile(join(workspacePath, "assets", "generated.png"), "image");
      await writeFile(join(workspacePath, "node_modules", "ignored.png"), "ignored");
      await writeFile(join(workspacePath, "notes.txt"), "not media");

      const after = snapshotWorkspaceMediaFiles(workspacePath);

      expect([...after.keys()]).toContain("assets/generated.png");
      expect([...after.keys()]).not.toContain("node_modules/ignored.png");
      expect(newestChangedMediaArtifact(workspacePath, before, after)).toBe("assets/generated.png");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("appends media artifact metadata and user-facing display instructions", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-media-artifact-result-"));
    try {
      await mkdir(join(workspacePath, "out"), { recursive: true });
      await writeFile(join(workspacePath, "out", "image.png"), "png-bytes");

      const mediaArtifact = mediaArtifactResultForPath(workspacePath, "out/image.png");
      expect(mediaArtifact).toMatchObject({
        artifactPath: "out/image.png",
        mediaKind: "image",
        renderedInline: true,
        bytes: 9,
      });
      expect(mediaArtifactNotice(mediaArtifact!)).toContain("Generated media artifact: out/image.png");

      const result = appendMediaArtifactResult({
        content: [{ type: "text", text: "done" }],
        details: { status: "done" },
      }, "out/image.png", workspacePath);

      expect(result.details).toMatchObject({
        status: "done",
        artifactPath: "out/image.png",
        renderedInline: true,
        mediaArtifact: { mediaKind: "image", bytes: 9 },
      });
      expect(result.content.at(-1)?.text).toContain("Ambient Desktop has rendered an inline media preview");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
