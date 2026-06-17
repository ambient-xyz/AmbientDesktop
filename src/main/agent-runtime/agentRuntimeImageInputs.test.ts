import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AMBIENT_KIMI_K2_7_CODE_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  resolveAmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import {
  imageContextReferences,
  imageMimeTypeForPath,
  resolveAgentRuntimeImageInputs,
} from "./agentRuntimeImageInputs";

describe("agentRuntimeImageInputs", () => {
  it("detects supported raster image context references", () => {
    expect(imageMimeTypeForPath("screen.PNG")).toBe("image/png");
    expect(imageMimeTypeForPath("photo.jpeg")).toBe("image/jpeg");
    expect(imageMimeTypeForPath("diagram.svg")).toBeUndefined();
    expect(imageContextReferences([
      { kind: "file", path: "screen.png", name: "screen.png" },
      { kind: "file", path: "notes.md", name: "notes.md" },
      { kind: "directory", path: "assets", name: "assets" },
    ])).toEqual([
      { kind: "file", path: "screen.png", name: "screen.png" },
    ]);
  });

  it("converts selected image files to Pi image content for Kimi", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-image-input-"));
    const imagePath = join(workspacePath, "screenshot.png");
    const bytes = Buffer.from("fake png bytes", "utf8");
    await writeFile(imagePath, bytes);

    const result = await resolveAgentRuntimeImageInputs({
      workspacePath,
      modelProfile: resolveAmbientModelRuntimeProfile(AMBIENT_KIMI_K2_7_CODE_MODEL),
      sendInput: {
        context: [
          { kind: "file", path: "screenshot.png", name: "screenshot.png", size: bytes.length },
        ],
      },
    });

    expect(result.attachments).toEqual([
      { path: "screenshot.png", mimeType: "image/png", bytes: bytes.length },
    ]);
    expect(result.images).toEqual([
      { type: "image", mimeType: "image/png", data: bytes.toString("base64") },
    ]);
  });

  it("blocks image inputs for text-only models before a provider call", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-image-input-"));
    await writeFile(join(workspacePath, "screenshot.png"), Buffer.from("fake png bytes", "utf8"));

    await expect(resolveAgentRuntimeImageInputs({
      workspacePath,
      modelProfile: resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
      sendInput: {
        context: [
          { kind: "file", path: "screenshot.png", name: "screenshot.png" },
        ],
      },
    })).rejects.toThrow(/does not support images/);
  });
});
