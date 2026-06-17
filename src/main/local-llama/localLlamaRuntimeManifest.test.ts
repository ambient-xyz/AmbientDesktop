import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  localLlamaManagedRuntimeDownloadEligibility,
  localLlamaRuntimeReleaseRequiredArtifactFields,
  selectLocalLlamaRuntimeArtifact,
  verifyLocalLlamaRuntimeReleaseManifest,
  type LocalLlamaRuntimeReleaseArtifact,
  type LocalLlamaRuntimeReleaseManifest,
} from "./localLlamaRuntimeManifest";

describe("local llama runtime release manifest", () => {
  it("verifies a pinned artifact with local archive and binary checksums", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-llama-runtime-"));
    try {
      const archivePath = join(workspace, "llama-runtime.tar.gz");
      const binaryPath = join(workspace, "llama-server");
      const archiveContent = Buffer.from("synthetic runtime archive");
      const binaryContent = Buffer.from("synthetic llama-server binary");
      await writeFile(archivePath, archiveContent);
      await writeFile(binaryPath, binaryContent);
      const manifest = fixtureManifest({
        archiveSha256: sha256(archiveContent),
        binarySha256: sha256(binaryContent),
      });

      const verification = verifyLocalLlamaRuntimeReleaseManifest({
        manifest,
        expectedSchemaVersion: "ambient-local-llama-runtime-release-manifest-v1",
        capabilityLabel: "Local Deep Research",
        platform: "darwin",
        arch: "arm64",
        archivePath,
        binaryPath,
      });

      expect(verification).toMatchObject({
        schemaVersion: "ambient-local-llama-runtime-release-manifest-v1",
        status: "passed",
        selectedArtifactId: "llama-cpp-macos-arm64-metal",
        verifiedArchiveSha256: sha256(archiveContent),
        verifiedBinarySha256: sha256(binaryContent),
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "artifact-required-fields", status: "passed" }),
          expect.objectContaining({ id: "artifact-checksum-pin", status: "passed" }),
          expect.objectContaining({ id: "download-policy", status: "passed" }),
          expect.objectContaining({ id: "local-archive-checksum", status: "passed" }),
          expect.objectContaining({ id: "local-binary-checksum", status: "passed" }),
        ]),
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps blocker filtering capability-owned while sharing verifier mechanics", () => {
    const manifest = fixtureManifest({ blockers: ["Windows x64 has no lifecycle smoke.", "Global model mirror is unavailable."] });

    const mac = verifyLocalLlamaRuntimeReleaseManifest({
      manifest,
      expectedSchemaVersion: "ambient-local-llama-runtime-release-manifest-v1",
      capabilityLabel: "Local Deep Research",
      platform: "darwin",
      arch: "arm64",
      blockerAppliesToArtifact: (blocker, artifact) => /Windows x64/i.test(blocker) ? artifact.platform === "win32" : true,
    });
    const windows = verifyLocalLlamaRuntimeReleaseManifest({
      manifest,
      expectedSchemaVersion: "ambient-local-llama-runtime-release-manifest-v1",
      capabilityLabel: "Local Deep Research",
      platform: "win32",
      arch: "x64",
      blockerAppliesToArtifact: (blocker, artifact) => /Windows x64/i.test(blocker) ? artifact.platform === "win32" : true,
    });

    expect(mac.blockers).toEqual(["Global model mirror is unavailable."]);
    expect(windows.blockers).toEqual(["Windows x64 has no lifecycle smoke.", "Global model mirror is unavailable."]);
  });

  it("selects by explicit artifact id before host platform matching", () => {
    const manifest = fixtureManifest();

    expect(selectLocalLlamaRuntimeArtifact(manifest.artifacts, {
      platform: "darwin",
      arch: "arm64",
      artifactId: "llama-cpp-windows-x64-cpu",
    })?.id).toBe("llama-cpp-windows-x64-cpu");
  });

  it("centralizes default managed download eligibility checks", () => {
    const manifest = fixtureManifest();
    const mac = manifest.artifacts[0];
    const windows = manifest.artifacts[1];

    expect(localLlamaManagedRuntimeDownloadEligibility({
      capabilityLabel: "Local Deep Research",
      manifest,
      artifact: mac,
      platform: "darwin",
      arch: "arm64",
    })).toBeUndefined();
    expect(localLlamaManagedRuntimeDownloadEligibility({
      capabilityLabel: "Local Deep Research",
      manifest,
      artifact: mac,
      platform: "linux",
      arch: "x64",
    })).toContain("not this host linux x64");
    expect(localLlamaManagedRuntimeDownloadEligibility({
      capabilityLabel: "Local Deep Research",
      manifest,
      artifact: windows,
      platform: "win32",
      arch: "x64",
    })).toBe("Local Deep Research default managed download is disabled for llama-cpp-windows-x64-cpu.");
  });
});

function fixtureManifest(input: {
  archiveSha256?: string;
  binarySha256?: string;
  blockers?: string[];
} = {}): LocalLlamaRuntimeReleaseManifest {
  const macArtifact: LocalLlamaRuntimeReleaseArtifact = {
    id: "llama-cpp-macos-arm64-metal",
    platform: "darwin",
    arch: "arm64",
    lane: "macos-arm64-metal",
    supportTier: "conditional",
    acceleration: "metal",
    defaultDownloadEnabled: true,
    releaseTag: "b9999",
    sourceUrl: "https://example.com/llama-b9999-bin-macos-arm64.tar.gz",
    archiveName: "llama-b9999-bin-macos-arm64.tar.gz",
    archiveFormat: "tar.gz",
    archiveSha256: input.archiveSha256 ?? sha256("synthetic archive"),
    binaryRelativePath: "llama-b9999/llama-server",
    binarySha256: input.binarySha256 ?? sha256("synthetic binary"),
    expectedBinaryNames: ["llama-server"],
    cacheSubdir: "b9999/macos-arm64-metal",
    license: "MIT",
    pinStatus: "pinned",
    smokeRequirements: ["Start llama-server and validate /health."],
  };
  return {
    schemaVersion: "ambient-local-llama-runtime-release-manifest-v1",
    manifestId: "fixture-local-llama-runtime",
    downloadEnabled: true,
    checksumAlgorithm: "sha256",
    requiredArtifactFields: localLlamaRuntimeReleaseRequiredArtifactFields,
    artifacts: [
      macArtifact,
      {
        ...macArtifact,
        id: "llama-cpp-windows-x64-cpu",
        platform: "win32",
        arch: "x64",
        lane: "windows-x64-cpu",
        acceleration: "cpu",
        supportTier: "experimental",
        defaultDownloadEnabled: false,
        sourceUrl: "https://example.com/llama-b9999-bin-win-cpu-x64.zip",
        archiveName: "llama-b9999-bin-win-cpu-x64.zip",
        archiveFormat: "zip",
        binaryRelativePath: "llama-server.exe",
        expectedBinaryNames: ["llama-server.exe"],
        cacheSubdir: "b9999/windows-x64-cpu",
      },
    ],
    blockers: input.blockers ?? [],
    notes: [],
  };
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
