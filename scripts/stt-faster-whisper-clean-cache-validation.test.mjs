import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertAdapterContract,
  cleanCacheEnv,
  parseArgs,
  renderMarkdownSummary,
  summarizeCacheRoot,
} from "./stt-faster-whisper-clean-cache-validation.mjs";

describe("faster-whisper clean-cache validation helpers", () => {
  it("summarizes isolated cache directories", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "ambient-fw-cache-"));
    const env = cleanCacheEnv(cacheRoot);
    await mkdir(env.UV_CACHE_DIR, { recursive: true });
    await mkdir(env.HF_HOME, { recursive: true });
    await writeFile(join(env.UV_CACHE_DIR, "wheel"), "abc", "utf8");
    await writeFile(join(env.HF_HOME, "model"), "defg", "utf8");

    const summary = await summarizeCacheRoot(cacheRoot);

    expect(summary.totalBytes).toBe(7);
    expect(summary.fileCount).toBe(2);
    expect(summary.topLevel.map((entry) => entry.name)).toEqual(expect.arrayContaining(["uv-cache", "hf-home"]));
  });

  it("enforces adapter-only health and transcript contracts", () => {
    const health = {
      distribution: {
        packageType: "adapter-only",
        bundledRuntimeBinaries: false,
        bundledPythonWheels: false,
        bundledModelWeights: false,
        bundledModelAssets: false,
      },
      installPlan: {
        resolver: "uv",
        packages: ["faster-whisper==1.1.1", "requests"],
      },
    };
    const transcript = {
      text: "He hoped there would be stew for dinner.",
      runtime: { distribution: { packageType: "adapter-only" } },
    };

    expect(() => assertAdapterContract({ health, transcript })).not.toThrow();
    expect(() => assertAdapterContract({ health: { ...health, distribution: { ...health.distribution, bundledModelAssets: true } } })).toThrow(/bundledModelAssets=false/);
  });

  it("renders a compact markdown summary", () => {
    const markdown = renderMarkdownSummary({
      runId: "run-1",
      generatedAt: "2026-05-11T00:00:00.000Z",
      host: { platform: "darwin", arch: "arm64", release: "test" },
      adapterContract: { packageType: "adapter-only", bundledModelAssets: false },
      installPlan: { resolver: "uv", packages: ["faster-whisper==1.1.1", "requests"] },
      cacheSummary: { totalBytes: 7 },
      transcript: { language: "en", text: "He hoped there would be stew." },
      artifacts: { summaryJson: ".ambient/summary.json" },
    });

    expect(markdown).toContain("adapter-only");
    expect(markdown).toContain("faster-whisper==1.1.1");
    expect(markdown).toContain("He hoped there would be stew");
  });

  it("accepts pnpm argument separators", () => {
    expect(parseArgs(["--", "--run-id", "abc"])).toMatchObject({ runId: "abc" });
  });
});
