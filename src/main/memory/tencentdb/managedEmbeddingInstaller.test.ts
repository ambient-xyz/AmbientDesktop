import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MiniCpmVisionRuntimeInstallResult } from "../../../shared/types";
import type { AmbientDownloadService } from "../../ambient/ambientDownloadService";
import {
  installAmbientMemoryEmbeddingAssets,
  installAmbientMemoryEmbeddingModel,
  type AmbientMemoryEmbeddingModelInstallProfile,
} from "./managedEmbeddingInstaller";

describe("managed Tencent memory embedding installer", () => {
  it("downloads, verifies, and reuses an Ambient-managed EmbeddingGemma model cache entry", async () => {
    const workspace = await tempWorkspace("model-install");
    const bytes = Buffer.from("tiny embedding model bytes");
    const profile = tinyProfile(bytes);
    const fetchImpl = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-length": String(bytes.length) },
    }));

    const installed = await installAmbientMemoryEmbeddingModel(workspace, { profile, fetchImpl: fetchImpl as typeof fetch });

    expect(installed).toMatchObject({
      status: "installed",
      bytes: bytes.length,
      sha256: profile.sha256,
      downloadStatus: "downloaded",
      missingHints: [],
    });
    await expect(readFile(installed.cachePath)).resolves.toEqual(bytes);
    expect(fetchImpl).toHaveBeenCalledOnce();

    const reuseFetch = vi.fn();
    const reused = await installAmbientMemoryEmbeddingModel(workspace, { profile, fetchImpl: reuseFetch as unknown as typeof fetch });

    expect(reused).toMatchObject({
      status: "already-installed",
      bytes: bytes.length,
      sha256: profile.sha256,
      downloadStatus: "reused",
      missingHints: [],
    });
    expect(reuseFetch).not.toHaveBeenCalled();
  });

  it("rejects downloaded model bytes that do not match the pinned checksum", async () => {
    const workspace = await tempWorkspace("model-mismatch");
    const bytes = Buffer.from("bbbbbbbb");
    const profile = tinyProfile(Buffer.from("aaaaaaaa"));
    const fetchImpl = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-length": String(bytes.length) },
    }));

    const result = await installAmbientMemoryEmbeddingModel(workspace, { profile, fetchImpl: fetchImpl as typeof fetch });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("SHA-256 mismatch");
  });

  it("coalesces concurrent installs for the same managed model cache path", async () => {
    const workspace = await tempWorkspace("model-coalesced");
    const bytes = Buffer.from("tiny concurrent embedding model bytes");
    const profile = tinyProfile(bytes);
    let finishDownload!: (value: {
      status: "completed";
      bytesReceived: number;
      computedSha256: string;
      resumed: boolean;
    }) => void;
    const waitForDownload = new Promise<{
      status: "completed";
      bytesReceived: number;
      computedSha256: string;
      resumed: boolean;
    }>((resolve) => {
      finishDownload = resolve;
    });
    const start = vi.fn(() => ({ jobId: "job-1" }));
    const wait = vi.fn(() => waitForDownload);
    const downloadService = {
      start,
      wait,
    } as unknown as AmbientDownloadService;

    const first = installAmbientMemoryEmbeddingModel(workspace, { profile, downloadService });
    const second = installAmbientMemoryEmbeddingModel(workspace, { profile, downloadService });

    await waitForMockCall(start);
    expect(start).toHaveBeenCalledOnce();
    finishDownload({
      status: "completed",
      bytesReceived: bytes.length,
      computedSha256: profile.sha256,
      resumed: false,
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: "installed", sha256: profile.sha256 }),
      expect.objectContaining({ status: "installed", sha256: profile.sha256 }),
    ]);
    expect(wait).toHaveBeenCalledOnce();
  });

  it("composes runtime install failure into the managed asset result", async () => {
    const workspace = await tempWorkspace("runtime-failed");
    const runtimeInstaller = vi.fn(async (): Promise<MiniCpmVisionRuntimeInstallResult> => ({
      attempted: true,
      status: "failed",
      source: "managed-download",
      artifactId: "test-runtime",
      error: "runtime download failed",
      missingHints: ["Retry runtime install."],
    }));

    const result = await installAmbientMemoryEmbeddingAssets({
      workspacePath: workspace,
      installModel: false,
      runtimeInstaller,
    });

    expect(result.status).toBe("failed");
    expect(result.modelInstall).toMatchObject({ attempted: false, status: "skipped" });
    expect(result.runtimeInstall).toMatchObject({ status: "failed", error: "runtime download failed" });
    expect(result.nextActions.join("\n")).toContain("runtime download failed");
    expect(runtimeInstaller).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: workspace,
      now: expect.any(Function),
    }));
  });

  it("coalesces concurrent shared runtime installs for the same workspace and artifact", async () => {
    const workspace = await tempWorkspace("runtime-coalesced");
    let finishRuntime!: (value: MiniCpmVisionRuntimeInstallResult) => void;
    const waitForRuntime = new Promise<MiniCpmVisionRuntimeInstallResult>((resolve) => {
      finishRuntime = resolve;
    });
    const runtimeInstaller = vi.fn(() => waitForRuntime);

    const first = installAmbientMemoryEmbeddingAssets({
      workspacePath: workspace,
      installModel: false,
      runtimeArtifactId: "runtime-a",
      runtimeInstaller,
    });
    const second = installAmbientMemoryEmbeddingAssets({
      workspacePath: workspace,
      installModel: false,
      runtimeArtifactId: "runtime-a",
      runtimeInstaller,
    });

    await waitForMockCall(runtimeInstaller);
    expect(runtimeInstaller).toHaveBeenCalledOnce();
    finishRuntime({
      attempted: true,
      status: "failed",
      source: "managed-download",
      artifactId: "runtime-a",
      error: "runtime download failed once",
      missingHints: ["Retry runtime install."],
    });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.runtimeInstall).toMatchObject({ status: "failed", error: "runtime download failed once" });
    expect(secondResult.runtimeInstall).toMatchObject({ status: "failed", error: "runtime download failed once" });
  });
});

async function tempWorkspace(label: string): Promise<string> {
  const root = join(tmpdir(), `ambient-memory-embedding-installer-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
}

function tinyProfile(bytes: Buffer): AmbientMemoryEmbeddingModelInstallProfile {
  return {
    id: "tiny-embedding-profile",
    repoId: "ambient-test/tiny-embedding",
    revision: "test-revision",
    filename: "tiny-embedding.gguf",
    sourceUrl: "https://example.invalid/tiny-embedding.gguf",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function waitForMockCall(mock: ReturnType<typeof vi.fn>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (mock.mock.calls.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
