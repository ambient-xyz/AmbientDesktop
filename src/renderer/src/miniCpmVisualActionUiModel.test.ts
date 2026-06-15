import { describe, expect, it } from "vitest";
import {
  miniCpmVisualAnalyzeInputForBrowserScreenshot,
  miniCpmVisualAnalyzeInputForContextAttachment,
  miniCpmVisualAnalyzeInputForWorkspaceFile,
  miniCpmVisualMediaKindFromPath,
} from "./miniCpmVisualActionUiModel";

describe("miniCpmVisualActionUiModel", () => {
  it("builds a browser screenshot analyze input from the managed artifact path", () => {
    expect(miniCpmVisualAnalyzeInputForBrowserScreenshot({
      path: "/project/.ambient-codex/browser/screenshots/browser.png",
      artifactPath: ".ambient-codex/browser/screenshots/browser.png",
      bytes: 128,
      title: "Ambient main shell",
    })).toMatchObject({
      image: {
        path: ".ambient-codex/browser/screenshots/browser.png",
        source: "browser_screenshot",
        label: "Ambient main shell",
      },
      task: "ui_review",
    });
  });

  it("allows explicit external browser screenshot paths when no artifact path is available", () => {
    expect(miniCpmVisualAnalyzeInputForBrowserScreenshot({
      path: "/Users/neo/Library/Application Support/Ambient/browser/browser.png",
      bytes: 128,
    })).toMatchObject({
      image: {
        path: "/Users/neo/Library/Application Support/Ambient/browser/browser.png",
        absolute: true,
        source: "browser_screenshot",
      },
      allowExternalMediaPaths: true,
    });
  });

  it("maps selected image and video attachments to structured MiniCPM inputs", () => {
    expect(miniCpmVisualAnalyzeInputForContextAttachment({
      kind: "file",
      path: "uploads/reference.PNG",
      name: "reference.PNG",
      size: 1024,
    })).toMatchObject({
      image: { path: "uploads/reference.PNG", source: "chat_attachment", label: "reference.PNG" },
      task: "image_description",
    });

    expect(miniCpmVisualAnalyzeInputForContextAttachment({
      kind: "file",
      path: "/tmp/playtest.webm",
      name: "playtest.webm",
      absolute: true,
      size: 4096,
    })).toMatchObject({
      video: { path: "/tmp/playtest.webm", absolute: true, source: "chat_attachment", label: "playtest.webm" },
      task: "video_frame_review",
      allowExternalMediaPaths: true,
    });
  });

  it("maps visual workspace files and rejects nonvisual files", () => {
    expect(miniCpmVisualAnalyzeInputForWorkspaceFile({
      path: "screens/main.webp",
      name: "main.webp",
      content: "",
      size: 256,
      truncated: false,
      binary: true,
      kind: "image",
    })).toMatchObject({
      image: { path: "screens/main.webp", source: "workspace_file" },
    });
    expect(miniCpmVisualAnalyzeInputForWorkspaceFile({
      path: "/Users/example/Desktop/Screenshot 2026-05-14 at 3.07.45 pm.png",
      name: "Screenshot 2026-05-14 at 3.07.45 pm.png",
      source: "local",
      absolutePath: "/Users/example/Desktop/Screenshot 2026-05-14 at 3.07.45 pm.png",
      content: "",
      size: 256,
      truncated: false,
      binary: true,
      kind: "image",
    })).toMatchObject({
      image: {
        path: "/Users/example/Desktop/Screenshot 2026-05-14 at 3.07.45 pm.png",
        absolute: true,
        source: "workspace_file",
      },
      allowExternalMediaPaths: true,
    });
    expect(miniCpmVisualAnalyzeInputForContextAttachment({
      kind: "file",
      path: "notes/readme.md",
      name: "readme.md",
    })).toBeUndefined();
  });

  it("recognizes only MiniCPM-supported image and video extensions", () => {
    expect(miniCpmVisualMediaKindFromPath("shot.jpeg")).toBe("image");
    expect(miniCpmVisualMediaKindFromPath("clip.mov")).toBe("video");
    expect(miniCpmVisualMediaKindFromPath("animated.gif")).toBeUndefined();
    expect(miniCpmVisualMediaKindFromPath("diagram.svg")).toBeUndefined();
  });
});
