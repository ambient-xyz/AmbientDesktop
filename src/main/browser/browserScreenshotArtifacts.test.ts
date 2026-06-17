import { describe, expect, it } from "vitest";
import type { WorkspaceState } from "../../shared/types";
import {
  browserScreenshotArtifactPath,
  browserScreenshotStorageTarget,
  pngImageDimensions,
} from "./browserService";

describe("browser screenshot artifacts", () => {
  const workspace: WorkspaceState = {
    path: "/project",
    name: "project",
    statePath: "/project/.ambient-codex",
    sessionPath: "/project/.ambient-codex/sessions",
  };

  it("stores default screenshots in the project state directory with a workspace-relative artifact path", () => {
    const target = browserScreenshotStorageTarget(workspace);

    expect(target.screenshots).toBe("/project/.ambient-codex/browser/screenshots");
    expect(browserScreenshotArtifactPath(target, "/project/.ambient-codex/browser/screenshots/browser.png")).toBe(
      ".ambient-codex/browser/screenshots/browser.png",
    );
  });

  it("stores local task screenshots in the active artifact workspace", () => {
    const target = browserScreenshotStorageTarget(workspace, {
      artifactWorkspacePath: "/private/tmp/local-task-workspace",
    });

    expect(target.screenshots).toBe("/private/tmp/local-task-workspace/.ambient-codex/browser/screenshots");
    expect(browserScreenshotArtifactPath(target, "/private/tmp/local-task-workspace/.ambient-codex/browser/screenshots/browser.png")).toBe(
      ".ambient-codex/browser/screenshots/browser.png",
    );
  });

  it("reads PNG dimensions from the IHDR chunk", () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(1280, 16);
    png.writeUInt32BE(720, 20);

    expect(pngImageDimensions(png)).toEqual({ width: 1280, height: 720 });
  });
});
