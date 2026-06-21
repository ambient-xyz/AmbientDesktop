import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { createVisionToolExtension } from "./agentRuntimeVisionTools";

describe("AgentRuntime MiniCPM-V vision tools", () => {
  it("registers typed setup and analyze tools backed by the MiniCPM adapter surface", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-minicpm-vision-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("vision tools");
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      let latestBrowserScreenshotArtifact: {
        artifactRef: "latest_browser_screenshot";
        artifactPath: string;
        path: string;
        bytes: number;
        width: number;
        height: number;
      } | undefined = {
        artifactRef: "latest_browser_screenshot" as const,
        artifactPath: ".ambient-codex/browser/screenshots/current.png",
        path: join(workspacePath, ".ambient-codex/browser/screenshots/current.png"),
        bytes: 12345,
        width: 1280,
        height: 720,
      };
      createVisionToolExtension({
        threadId: thread.id,
        workspace: store.getWorkspace(),
        getThread: (id) => store.getThread(id),
        getLatestBrowserScreenshotArtifact: () => latestBrowserScreenshotArtifact,
        vision: {
          setupMiniCpm: async (_workspacePath, input) => {
            const stopped = input.action === "stop";
            return {
              provider: "minicpm-v",
              action: input.action ?? "install",
              status: stopped ? "stopped" : "ready",
              packageName: "ambient-minicpm-v-vision",
              installStatuses: [{ packageName: "ambient-minicpm-v-vision", source: "bundled:ambient-minicpm-v-vision", status: "already_installed" }],
              runtimeCandidates: [],
              validation: {
                schemaVersion: "ambient-minicpm-v-provider-validation-v1",
                provider: "minicpm-v",
                packageName: "ambient-minicpm-v-vision",
                status: stopped ? "stopped" : "runtime-ready",
                updatedAt: "2026-05-11T00:00:00.000Z",
                platform: "darwin",
                arch: "arm64",
                lane: "macos-arm64-metal",
                model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
                missingHints: [],
                diagnostics: [],
                ...(stopped
                  ? {
                      runtimeState: {
                        status: "stopped" as const,
                        running: false,
                        recordedAt: "2026-05-11T00:01:00.000Z",
                        previousPid: 4242,
                      },
                    }
                  : {}),
              },
              diagnostics: [],
              nextSteps: stopped ? ["Runtime stopped."] : ["Run visual analysis."],
            };
          },
          analyzeMiniCpm: async (_workspacePath, input) => ({
            provider: "minicpm-v",
            status: "passed",
            packageName: "ambient-minicpm-v-vision",
            task: input.task ?? "ui_review",
            prompt: input.prompt ?? "fixture prompt",
            model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
            durationMs: 42,
            latencyMs: 24,
            summary: "The screenshot shows an Ambient UI fixture.",
            observations: [{
              kind: "layout",
              description: "The sidebar and main content are visible.",
              confidence: "high",
              evidence: "left sidebar and center panel",
            }],
            limitations: ["Fixture mode did not inspect real pixels."],
            image: {
              path: input.image?.path ?? input.imagePath ?? (input.video ? ".ambient/vision/minicpm-v/frames/fake-video-frame.png" : "screen.png"),
              basename: input.video ? "fake-video-frame.png" : "screen.png",
              bytes: 128,
              sha256: "a".repeat(64),
              ...(input.image?.source ? { source: input.image.source } : {}),
              ...(input.video ? { source: "video_frame" as const, label: "fixture clip frame 500ms" } : {}),
            },
            ...(input.video || input.videoPath
              ? {
                  video: {
                    path: input.video?.path ?? input.videoPath ?? "clip.mp4",
                    basename: "clip.mp4",
                    bytes: 4096,
                    sha256: "c".repeat(64),
                    source: input.video?.source ?? "media_artifact",
                    label: input.video?.label ?? "fixture clip",
                    frameTimestampMs: input.video?.frameTimestampMs ?? input.frameTimestampMs ?? 500,
                    frameImagePath: ".ambient/vision/minicpm-v/frames/fake-video-frame.png",
                  },
                  sampledFrames: [{
                    path: ".ambient/vision/minicpm-v/frames/fake-video-frame.png",
                    basename: "fake-video-frame.png",
                    bytes: 128,
                    sha256: "a".repeat(64),
                    source: "video_frame" as const,
                    label: "fixture clip frame 500ms",
                  }],
                }
              : {}),
            ...(input.referenceImage || input.referenceImagePath
              ? {
                  referenceImage: {
                    path: input.referenceImage?.path ?? input.referenceImagePath ?? "reference.png",
                    basename: "reference.png",
                    bytes: 128,
                    sha256: "b".repeat(64),
                  },
                }
              : {}),
            artifacts: { jsonPath: ".ambient/vision/minicpm-v/analysis/fake.json" },
            installStatuses: [{ packageName: "ambient-minicpm-v-vision", source: "bundled:ambient-minicpm-v-vision", status: "already_installed" }],
            commands: [{ command: "analyze", durationMs: 24 }],
            validation: { valid: true, errors: [] },
            redaction: {
              returnedImagePathIsWorkspaceRelative: true,
              stdoutDoesNotContainAbsoluteImagePath: true,
              artifactPathIsWorkspaceRelative: true,
            },
          }),
        },
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const setup = registeredTools.find((tool) => tool.name === "ambient_visual_minicpm_setup")!;
      const analyze = registeredTools.find((tool) => tool.name === "ambient_visual_analyze")!;
      expect(setup).toBeDefined();
      expect(analyze).toBeDefined();

      const setupResult = await setup.execute("setup", { action: "repair" });
      expect(setupResult.content[0].text).toContain("MiniCPM-V visual provider setup completed.");
      expect(setupResult.details).toMatchObject({
        runtime: "ambient-vision",
        toolName: "ambient_visual_minicpm_setup",
        setupStatus: "ready",
      });

      const stopResult = await setup.execute("setup-stop", { action: "stop" });
      expect(stopResult.content[0].text).toContain("Runtime state: stopped previous pid 4242");
      expect(stopResult.details).toMatchObject({
        runtime: "ambient-vision",
        toolName: "ambient_visual_minicpm_setup",
        setupStatus: "stopped",
        action: "stop",
      });

      const analysisResult = await analyze.execute("analyze", { imagePath: "screen.png", task: "ui_review" });
      expect(analysisResult.content[0].text).toContain("MiniCPM-V visual analysis completed.");
      expect(analysisResult.content[0].text).toContain("The screenshot shows an Ambient UI fixture.");
      expect(analysisResult.details).toMatchObject({
        runtime: "ambient-vision",
        toolName: "ambient_visual_analyze",
        status: "complete",
        task: "ui_review",
        artifacts: { jsonPath: ".ambient/vision/minicpm-v/analysis/fake.json" },
      });

      const latestScreenshotResult = await analyze.execute("analyze-latest-browser-screenshot", {
        browserScreenshot: { ref: "latest" },
        task: "ui_review",
      });
      expect(latestScreenshotResult.details).toMatchObject({
        image: { path: ".ambient-codex/browser/screenshots/current.png", source: "browser_screenshot" },
        browserScreenshot: { ref: "latest" },
      });

      latestBrowserScreenshotArtifact = undefined;
      const missingLatestResult = await analyze.execute("analyze-missing-latest-browser-screenshot", {
        browserScreenshot: { ref: "latest" },
        task: "ui_review",
      });
      expect(missingLatestResult.isError).toBe(true);
      expect(missingLatestResult.content[0].text).toContain("No latest browser_screenshot artifact is available");
      expect(missingLatestResult.details.diagnostics).toEqual([
        expect.objectContaining({ code: "input-permission-or-path" }),
      ]);

      const comparisonResult = await analyze.execute("analyze", {
        image: { path: "screens/current.png", source: "browser_screenshot", label: "current" },
        referenceImage: { path: "screens/reference.png", source: "chat_attachment", label: "reference" },
        task: "design_comparison",
      });
      expect(comparisonResult.content[0].text).toContain("Reference image: screens/reference.png");
      expect(comparisonResult.details).toMatchObject({
        image: { path: "screens/current.png" },
        referenceImage: { path: "screens/reference.png" },
      });

      const videoResult = await analyze.execute("analyze", {
        video: { path: "clips/run.mp4", source: "media_artifact", label: "fixture clip", frameTimestampMs: 500 },
        task: "video_frame_review",
      });
      expect(videoResult.content[0].text).toContain("Video: clips/run.mp4");
      expect(videoResult.content[0].text).toContain("frame 500ms");
      expect(videoResult.details).toMatchObject({
        video: { path: "clips/run.mp4", frameTimestampMs: 500 },
        sampledFrames: [{ path: ".ambient/vision/minicpm-v/frames/fake-video-frame.png" }],
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
