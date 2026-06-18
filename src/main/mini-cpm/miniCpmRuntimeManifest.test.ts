import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  miniCpmRuntimeReleaseManifestPrototype,
  verifyMiniCpmRuntimeReleaseManifest,
} from "./miniCpmRuntimeManifest";
import type { MiniCpmVisionRuntimeReleaseManifest } from "../../shared/localRuntimeTypes";

describe("MiniCPM-V runtime release manifest verifier", () => {
  it("enables default managed download only for the pinned macOS/Linux lanes", () => {
    const verification = verifyMiniCpmRuntimeReleaseManifest({ platform: "darwin", arch: "arm64" });

    expect(verification).toMatchObject({
      schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
      manifestId: "minicpm-v-llamacpp-runtime-pinned-b9122-2026-05-12",
      status: "warning",
      downloadEnabled: true,
      checksumAlgorithm: "sha256",
      selectedArtifactId: "llama-cpp-macos-arm64-metal",
      requiredArtifactFields: expect.arrayContaining(["sourceUrl", "archiveSha256", "binaryRelativePath", "defaultDownloadEnabled", "smokeRequirements"]),
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "artifact-required-fields", status: "passed" }),
        expect.objectContaining({ id: "artifact-checksum-pin", status: "passed" }),
        expect.objectContaining({ id: "download-policy", status: "passed" }),
      ]),
    });
    expect(verification.artifacts[0]).toMatchObject({
      releaseTag: "b9122",
      archiveName: "llama-b9122-bin-macos-arm64.tar.gz",
      archiveSha256: "ba89bf2de1275b22d3d24e2fdb34500062b05371cbeb1e8cd6052a918b392de3",
      binaryRelativePath: "llama-b9122/llama-server",
      binarySha256: "349688949464db70180658269a03abfbd9fb8e3c46a12f42f9e47174eaa6bddf",
      defaultDownloadEnabled: true,
      pinStatus: "pinned",
    });
    expect(verification.artifacts.map((artifact) => artifact.id)).toEqual([
      "llama-cpp-macos-arm64-metal",
      "llama-cpp-linux-x64-vulkan-nvidia",
      "llama-cpp-windows-x64-cpu",
    ]);
    expect(verification.blockers).toEqual([]);
    const linux = verifyMiniCpmRuntimeReleaseManifest({ platform: "linux", arch: "x64" });
    expect(linux).toMatchObject({
      status: "warning",
      downloadEnabled: true,
      selectedArtifactId: "llama-cpp-linux-x64-vulkan-nvidia",
      checks: expect.arrayContaining([expect.objectContaining({ id: "download-policy", status: "passed" })]),
      blockers: [],
    });
  });

  it("can select and verify the pinned Windows CPU zip artifact", () => {
    const verification = verifyMiniCpmRuntimeReleaseManifest({
      platform: "win32",
      arch: "x64",
    });

    expect(verification).toMatchObject({
      status: "blocked",
      downloadEnabled: true,
      selectedArtifactId: "llama-cpp-windows-x64-cpu",
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "artifact-required-fields", status: "passed" }),
        expect.objectContaining({ id: "artifact-checksum-pin", status: "passed" }),
        expect.objectContaining({ id: "download-policy", status: "blocked" }),
      ]),
    });
    expect(verification.artifacts.find((artifact) => artifact.id === "llama-cpp-windows-x64-cpu")).toMatchObject({
      platform: "win32",
      arch: "x64",
      supportTier: "experimental",
      archiveName: "llama-b9122-bin-win-cpu-x64.zip",
      archiveFormat: "zip",
      archiveSha256: "48f35bcb78eb3e50b0b5927f60ac101fd95501a3c14ad39e0ea81444d0da9b40",
      defaultDownloadEnabled: false,
      binaryRelativePath: "llama-server.exe",
      binarySha256: "819dacfec0b06b67aeac02388957881ce9483cc4326f507856c99d7881285a4a",
      pinStatus: "pinned",
    });
  });

  it("can verify a pinned local archive checksum with the managed download policy enabled", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-runtime-manifest-"));
    try {
      const archivePath = join(workspace, "llama-runtime.zip");
      const binaryPath = join(workspace, "llama-server");
      const archiveContent = Buffer.from("synthetic runtime archive");
      const binaryContent = Buffer.from("synthetic llama-server");
      await writeFile(archivePath, archiveContent);
      await writeFile(binaryPath, binaryContent);
      const archiveChecksum = createHash("sha256").update(archiveContent).digest("hex");
      const binaryChecksum = createHash("sha256").update(binaryContent).digest("hex");
      const manifest: MiniCpmVisionRuntimeReleaseManifest = {
        ...miniCpmRuntimeReleaseManifestPrototype,
        manifestId: "synthetic-pinned-runtime-manifest",
        blockers: [],
        artifacts: [{
          ...miniCpmRuntimeReleaseManifestPrototype.artifacts[0],
          id: "synthetic-macos-runtime",
          releaseTag: "b9999",
          sourceUrl: "https://github.com/ggerganov/llama.cpp/releases/download/b9999/llama-b9999-bin-macos-arm64.zip",
          archiveName: "llama-b9999-bin-macos-arm64.zip",
          archiveSha256: archiveChecksum,
          binarySha256: binaryChecksum,
          pinStatus: "pinned",
        }],
      };

      const verification = verifyMiniCpmRuntimeReleaseManifest({
        manifest,
        platform: "darwin",
        arch: "arm64",
        archivePath,
        binaryPath,
      });

      expect(verification).toMatchObject({
        status: "passed",
        downloadEnabled: true,
        selectedArtifactId: "synthetic-macos-runtime",
        verifiedArchivePath: archivePath,
        verifiedArchiveSha256: archiveChecksum,
        verifiedBinaryPath: binaryPath,
        verifiedBinarySha256: binaryChecksum,
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "artifact-checksum-pin", status: "passed" }),
          expect.objectContaining({ id: "local-archive-checksum", status: "passed" }),
          expect.objectContaining({ id: "local-binary-checksum", status: "passed" }),
          expect.objectContaining({ id: "download-policy", status: "passed" }),
        ]),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails a local archive with the wrong checksum", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-runtime-manifest-mismatch-"));
    try {
      const archivePath = join(workspace, "llama-runtime.zip");
      await writeFile(archivePath, "wrong archive bytes");
      const manifest: MiniCpmVisionRuntimeReleaseManifest = {
        ...miniCpmRuntimeReleaseManifestPrototype,
        blockers: [],
        artifacts: [{
          ...miniCpmRuntimeReleaseManifestPrototype.artifacts[0],
          releaseTag: "b9999",
          sourceUrl: "https://github.com/ggerganov/llama.cpp/releases/download/b9999/llama-b9999-bin-macos-arm64.zip",
          archiveName: "llama-b9999-bin-macos-arm64.zip",
          archiveSha256: createHash("sha256").update("different archive bytes").digest("hex"),
          binarySha256: createHash("sha256").update("synthetic llama-server").digest("hex"),
          pinStatus: "pinned",
        }],
      };

      const verification = verifyMiniCpmRuntimeReleaseManifest({
        manifest,
        platform: "darwin",
        arch: "arm64",
        archivePath,
      });

      expect(verification.status).toBe("failed");
      expect(verification.checks).toContainEqual(expect.objectContaining({ id: "local-archive-checksum", status: "failed" }));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
