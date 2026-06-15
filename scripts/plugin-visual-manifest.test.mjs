import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pngSize, scenarioFromScreenshotPath, writeLiveDogfoodSummary, writeLiveVisualManifest } from "./plugin-visual-manifest.mjs";

describe("plugin visual manifest helpers", () => {
  it("keeps deterministic screenshots separate from live-only screenshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-plugin-visual-manifest-"));
    try {
      const resultsDir = join(root, "plugins");
      await mkdir(resultsDir, { recursive: true });
      await writeFile(join(resultsDir, "01-sandboxed-installed.png"), pngFixture(111, 222));
      await writeFile(join(resultsDir, "07-live-chat-install-refresh.png"), pngFixture(1440, 900));
      await writeFile(
        join(resultsDir, "manifest.json"),
        `${JSON.stringify(
          {
            version: 1,
            generatedAt: "2026-01-01T00:00:00.000Z",
            workspace: "temp-plugin-ui-workspace",
            compareBaselines: true,
            updateBaselines: false,
            screenshots: [
              {
                scenario: "01-sandboxed-installed",
                file: "01-sandboxed-installed.png",
                bytes: 33,
                width: 111,
                height: 222,
                sha256: "deterministic",
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const manifest = await writeLiveVisualManifest({
        resultsDir,
        screenshots: [join(resultsDir, "07-live-chat-install-refresh.png")],
        now: () => new Date("2026-05-05T12:00:00.000Z"),
      });
      const persisted = JSON.parse(await readFile(join(resultsDir, "manifest.json"), "utf8"));

      expect(persisted).toEqual(manifest);
      expect(persisted.generatedAt).toBe("2026-05-05T12:00:00.000Z");
      expect(persisted.workspace).toBe("temp-plugin-ui-workspace");
      expect(persisted.compareBaselines).toBe(true);
      expect(persisted.screenshots).toEqual([
        {
          scenario: "01-sandboxed-installed",
          file: "01-sandboxed-installed.png",
          bytes: 33,
          width: 111,
          height: 222,
          sha256: "deterministic",
        },
      ]);
      expect(persisted.screenshots[0]).not.toHaveProperty("liveOnly");
      expect(persisted.liveScreenshots).toHaveLength(1);
      expect(persisted.liveScreenshots[0]).toMatchObject({
        scenario: "07-live-chat-install-refresh",
        file: "07-live-chat-install-refresh.png",
        width: 1440,
        height: 900,
        liveOnly: true,
      });
      expect(persisted.liveScreenshots[0].sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(persisted.screenshots.map((entry) => entry.scenario)).not.toContain("07-live-chat-install-refresh");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates a live-only manifest when the deterministic smoke has not run first", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-plugin-live-manifest-"));
    try {
      const resultsDir = join(root, "plugins");
      await mkdir(resultsDir, { recursive: true });
      await writeFile(join(resultsDir, "09-live-chat-history-clear-refresh.png"), pngFixture(320, 240));

      const manifest = await writeLiveVisualManifest({
        resultsDir,
        screenshots: [join(resultsDir, "09-live-chat-history-clear-refresh.png")],
        now: () => new Date("2026-05-05T13:00:00.000Z"),
      });

      expect(manifest).toMatchObject({
        version: 1,
        generatedAt: "2026-05-05T13:00:00.000Z",
        workspace: "temp-plugin-chat-refresh-live-workspace",
        compareBaselines: false,
        updateBaselines: false,
        screenshots: [],
      });
      expect(manifest.liveScreenshots).toHaveLength(1);
      expect(manifest.liveScreenshots[0]).toMatchObject({
        scenario: "09-live-chat-history-clear-refresh",
        file: "09-live-chat-history-clear-refresh.png",
        width: 320,
        height: 240,
        liveOnly: true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("parses PNG dimensions and screenshot scenario names", () => {
    expect(pngSize(pngFixture(12, 34))).toEqual({ width: 12, height: 34 });
    expect(scenarioFromScreenshotPath("test-results/plugins/07-live-chat-install-refresh.png")).toBe("07-live-chat-install-refresh");
  });

  it("writes a compact live dogfood summary with tool counts and screenshot hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-plugin-live-summary-"));
    try {
      const resultsDir = join(root, "plugins");
      await mkdir(resultsDir, { recursive: true });
      await writeFile(join(resultsDir, "10-live-chat-ffmpeg-fallback-review.png"), pngFixture(1440, 900));

      const summary = await writeLiveDogfoodSummary({
        resultsDir,
        summary: {
          scenarios: ["ffmpeg"],
          pluginCatalogUpdatedCount: 0,
          privilegedScanUpdatedCount: 1,
          toolNames: ["ambient_pi_extension_install_sandboxed", "ambient_pi_extension_install_sandboxed"],
          screenshots: [join(resultsDir, "10-live-chat-ffmpeg-fallback-review.png")],
        },
        now: () => new Date("2026-05-05T14:00:00.000Z"),
      });
      const persisted = JSON.parse(await readFile(join(resultsDir, "live-dogfood-summary.json"), "utf8"));

      expect(persisted).toEqual(summary);
      expect(persisted).toMatchObject({
        version: 1,
        generatedAt: "2026-05-05T14:00:00.000Z",
        scenarios: ["ffmpeg"],
        eventCounts: {
          pluginCatalogUpdated: 0,
          privilegedScanUpdated: 1,
        },
        tools: {
          observed: ["ambient_pi_extension_install_sandboxed"],
          counts: {
            ambient_pi_extension_install_sandboxed: 2,
          },
        },
      });
      expect(persisted.screenshots[0]).toMatchObject({
        scenario: "10-live-chat-ffmpeg-fallback-review",
        file: "10-live-chat-ffmpeg-fallback-review.png",
        width: 1440,
        height: 900,
        liveOnly: true,
      });
      expect(persisted.screenshots[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function pngFixture(width, height) {
  const buffer = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
}
