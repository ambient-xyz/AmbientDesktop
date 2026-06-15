import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeMiniCpmVisionInput, setupMiniCpmVisionProvider } from "./miniCpmVisionProvider";

const maybeDescribe = process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE === "1" ? describe : describe.skip;

maybeDescribe("MiniCPM-V vision provider live adapter smoke", () => {
  it("downloads the default managed runtime into managed cache and validates a real image", async () => {
    if (platform() !== "darwin" && platform() !== "linux") {
      throw new Error(`MiniCPM-V default managed runtime download live smoke is scoped to macOS/Linux, not ${platform()}.`);
    }
    const imagePath = process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_IMAGE?.trim()
      || join(process.cwd(), "test", "visual-baselines", "01-main-shell.png");
    if (!existsSync(imagePath)) throw new Error(`MiniCPM-V live image fixture was not found: ${imagePath}`);

    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-managed-download-live-"));
    const validationImagePath = join(workspace, "validation-image.png");
    await writeFile(validationImagePath, await readFile(imagePath));
    const artifactId = platform() === "darwin" ? "llama-cpp-macos-arm64-metal" : "llama-cpp-linux-x64-vulkan-nvidia";
    const result = await setupMiniCpmVisionProvider(
      workspace,
      {
        provider: "minicpm-v",
        action: "repair",
        installRuntime: true,
        runtimeArtifactId: artifactId,
        validationImagePath,
        validationTask: "ui_review",
      },
      { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
    );

    await writeFile(join(workspace, "live-managed-runtime-download-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    expect(result.status).toBe("ready");
    expect(result.runtimeInstall).toEqual(expect.objectContaining({
      source: "managed-download",
      artifactId,
      status: expect.stringMatching(/installed|already-installed/),
      archiveSha256: expect.any(String),
      binarySha256: expect.any(String),
      receiptPath: expect.any(String),
    }));
    expect(result.runtimeInstall?.manifestVerification?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "download-policy", status: "passed" }),
      expect.objectContaining({ id: "local-archive-checksum", status: "passed" }),
      expect.objectContaining({ id: "local-binary-checksum", status: "passed" }),
    ]));
    if (platform() === "darwin") {
      expect(result.runtimeInstall?.macosSecurity).toEqual(expect.objectContaining({
        quarantineAfter: "not-present",
        codeSignature: "valid",
        defaultDownloadPromotion: "eligible",
        promotionPolicy: expect.stringMatching(/gatekeeper-accepted|ambient-managed-valid-signature/),
      }));
    }
    expect(result.validation.status).toBe("passed");
    expect(result.validation.summary).toEqual(expect.any(String));
  }, 8 * 60 * 1000);

  it("installs a pinned runtime archive into managed cache and validates a real image", async () => {
    const runtimeArchivePath = resolve(process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_ARCHIVE?.trim()
      || join(process.cwd(), "test-results", "minicpm-v", "runtime-artifacts", "b9122", "llama-b9122-bin-macos-arm64.tar.gz"));
    if (!existsSync(runtimeArchivePath)) throw new Error(`MiniCPM-V live runtime archive was not found: ${runtimeArchivePath}`);

    const imagePath = process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_IMAGE?.trim()
      || join(process.cwd(), "test", "visual-baselines", "01-main-shell.png");
    if (!existsSync(imagePath)) throw new Error(`MiniCPM-V live image fixture was not found: ${imagePath}`);

    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-managed-archive-live-"));
    const validationImagePath = join(workspace, "validation-image.png");
    await writeFile(validationImagePath, await readFile(imagePath));
    const result = await setupMiniCpmVisionProvider(
      workspace,
      {
        provider: "minicpm-v",
        action: "repair",
        runtimeArchivePath,
        runtimeArtifactId: "llama-cpp-macos-arm64-metal",
        validationImagePath,
        validationTask: "ui_review",
      },
      { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
    );

    await writeFile(join(workspace, "live-managed-runtime-setup-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    expect(result.status).toBe("ready");
    expect(result.runtimeInstall?.status).toMatch(/installed|already-installed/);
    expect(result.runtimeInstall?.manifestVerification?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "local-archive-checksum", status: "passed" }),
      expect.objectContaining({ id: "local-binary-checksum", status: "passed" }),
    ]));
    expect(result.validation.status).toBe("passed");
    expect(result.validation.summary).toEqual(expect.any(String));
    expect(result.validation.runtimeInstall?.receiptPath).toEqual(expect.any(String));
    if (platform() === "darwin") {
      expect(result.runtimeInstall?.macosSecurity).toEqual(expect.objectContaining({
        quarantineAfter: "not-present",
        defaultDownloadPromotion: expect.any(String),
      }));
      const binaryPath = result.runtimeInstall?.binaryPath;
      if (!binaryPath) throw new Error("MiniCPM-V live managed runtime did not report a binary path.");
      const quarantine = spawnSync("xattr", ["-w", "com.apple.quarantine", "0081;00000000;Ambient;MiniCPMLive", binaryPath], { encoding: "utf8" });
      expect(quarantine.status).toBe(0);
      const reused = await setupMiniCpmVisionProvider(
        workspace,
        {
          provider: "minicpm-v",
          action: "repair",
          runtimeArchivePath,
          runtimeArtifactId: "llama-cpp-macos-arm64-metal",
        },
        { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
      );
      expect(reused.status).toBe("ready");
      expect(reused.runtimeInstall).toEqual(expect.objectContaining({
        status: "already-installed",
        macosQuarantine: "not-present",
        macosSecurity: expect.objectContaining({
          quarantineBefore: "present",
          quarantineAction: "removed-after-checksum",
          quarantineAfter: "not-present",
        }),
      }));
    }
  }, 8 * 60 * 1000);

  it("analyzes a real image through the first-party typed adapter", async () => {
    const runtimeBinaryPath = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER?.trim()
      || "/path/to/local-runtimes/llama.cpp/build/bin/llama-server";
    if (!existsSync(runtimeBinaryPath)) throw new Error(`MiniCPM-V live runtime binary was not found: ${runtimeBinaryPath}`);

    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-adapter-live-"));
    let imagePath = process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_IMAGE?.trim();
    if (!imagePath) {
      imagePath = join(workspace, "fixture.png");
      await writeFile(imagePath, tinyPng());
    }

    const result = await analyzeMiniCpmVisionInput(
      workspace,
      {
        imagePath,
        allowExternalImagePaths: true,
        task: "ui_review",
        runtimeBinaryPath,
        waitMs: Number(process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_WAIT_MS ?? 180_000),
        requestTimeoutMs: Number(process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_REQUEST_TIMEOUT_MS ?? 240_000),
        maxTokens: 900,
      },
      { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
    );

    await writeFile(join(workspace, "live-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    expect(result.status).toBe("passed");
    expect(result.summary).toEqual(expect.any(String));
    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.redaction).toMatchObject({
      returnedImagePathIsWorkspaceRelative: true,
      stdoutDoesNotContainAbsoluteImagePath: true,
      artifactPathIsWorkspaceRelative: true,
    });
  }, 8 * 60 * 1000);

  it("compares two real screenshot references through the typed adapter", async () => {
    const runtimeBinaryPath = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER?.trim()
      || "/path/to/local-runtimes/llama.cpp/build/bin/llama-server";
    if (!existsSync(runtimeBinaryPath)) throw new Error(`MiniCPM-V live runtime binary was not found: ${runtimeBinaryPath}`);

    const current = join(process.cwd(), "test", "visual-baselines", "01-main-shell.png");
    const reference = join(process.cwd(), "test", "visual-baselines", "01a-project-board.png");
    if (!existsSync(current) || !existsSync(reference)) throw new Error("MiniCPM-V comparison live fixtures are missing.");

    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-compare-live-"));
    const result = await analyzeMiniCpmVisionInput(
      workspace,
      {
        image: { path: current, absolute: true, source: "browser_screenshot", label: "main shell" },
        referenceImage: { path: reference, absolute: true, source: "selected_screenshot", label: "project board" },
        allowExternalImagePaths: true,
        task: "design_comparison",
        runtimeBinaryPath,
        waitMs: Number(process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_WAIT_MS ?? 180_000),
        requestTimeoutMs: Number(process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_REQUEST_TIMEOUT_MS ?? 240_000),
        maxTokens: 1100,
      },
      { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
    );

    await writeFile(join(workspace, "live-comparison-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    expect(result.status).toBe("passed");
    expect(result.task).toBe("design_comparison");
    expect(result.referenceImage).toBeDefined();
    expect(result.inputImages).toHaveLength(2);
    expect(result.summary).toEqual(expect.any(String));
    expect(result.observations.length).toBeGreaterThan(0);
  }, 8 * 60 * 1000);

  it("samples a real short video frame through the typed adapter", async () => {
    const runtimeBinaryPath = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER?.trim()
      || "/path/to/local-runtimes/llama.cpp/build/bin/llama-server";
    if (!existsSync(runtimeBinaryPath)) throw new Error(`MiniCPM-V live runtime binary was not found: ${runtimeBinaryPath}`);

    const current = join(process.cwd(), "test", "visual-baselines", "01-main-shell.png");
    if (!existsSync(current)) throw new Error("MiniCPM-V video live fixture is missing.");

    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-video-live-"));
    const videoPath = join(workspace, "main-shell.mp4");
    renderFixtureVideo(current, videoPath);

    const result = await analyzeMiniCpmVisionInput(
      workspace,
      {
        video: { path: videoPath, absolute: true, source: "media_artifact", label: "main shell clip", frameTimestampMs: 500 },
        allowExternalMediaPaths: true,
        task: "video_frame_review",
        runtimeBinaryPath,
        waitMs: Number(process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_WAIT_MS ?? 180_000),
        requestTimeoutMs: Number(process.env.AMBIENT_MINICPM_VISION_PROVIDER_LIVE_REQUEST_TIMEOUT_MS ?? 240_000),
        maxTokens: 900,
      },
      { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
    );

    await writeFile(join(workspace, "live-video-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    expect(result.status).toBe("passed");
    expect(result.task).toBe("video_frame_review");
    expect(result.video).toMatchObject({ frameTimestampMs: 500 });
    expect(result.image.source).toBe("video_frame");
    expect(result.sampledFrames).toHaveLength(1);
    expect(result.summary).toEqual(expect.any(String));
    expect(result.observations.length).toBeGreaterThan(0);
  }, 8 * 60 * 1000);
});

function renderFixtureVideo(imagePath: string, videoPath: string): void {
  const attempts = [
    ["-y", "-loop", "1", "-t", "1", "-i", imagePath, "-vf", "format=yuv420p", "-c:v", "libx264", videoPath],
    ["-y", "-loop", "1", "-t", "1", "-i", imagePath, "-vf", "format=yuv420p", "-c:v", "mpeg4", videoPath],
  ];
  const errors: string[] = [];
  for (const args of attempts) {
    const result = spawnSync("ffmpeg", args, { encoding: "utf8", timeout: 60_000 });
    if (result.status === 0 && existsSync(videoPath)) return;
    errors.push([result.stderr?.trim(), result.stdout?.trim(), result.error?.message].filter(Boolean).join("\n"));
  }
  throw new Error(`Unable to render MiniCPM-V video fixture with ffmpeg:\n${errors.filter(Boolean).join("\n---\n")}`);
}

function tinyPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
}
