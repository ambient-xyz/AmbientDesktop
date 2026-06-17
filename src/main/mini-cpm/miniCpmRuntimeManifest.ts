import {
  localLlamaRuntimeReleaseRequiredArtifactFields,
  verifyLocalLlamaRuntimeReleaseManifest,
} from "../local-llama/localLlamaRuntimeManifest";
import type {
  MiniCpmVisionRuntimeReleaseArtifact,
  MiniCpmVisionRuntimeReleaseManifest,
  MiniCpmVisionRuntimeReleaseManifestVerification,
} from "../../shared/types";

export const miniCpmRuntimeReleaseRequiredArtifactFields = localLlamaRuntimeReleaseRequiredArtifactFields;

export const miniCpmRuntimeReleaseManifestPrototype: MiniCpmVisionRuntimeReleaseManifest = {
  schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
  manifestId: "minicpm-v-llamacpp-runtime-pinned-b9122-2026-05-12",
  downloadEnabled: true,
  checksumAlgorithm: "sha256",
  requiredArtifactFields: miniCpmRuntimeReleaseRequiredArtifactFields,
  artifacts: [
    {
      id: "llama-cpp-macos-arm64-metal",
      platform: "darwin",
      arch: "arm64",
      lane: "macos-arm64-metal",
      supportTier: "conditional",
      acceleration: "metal",
      defaultDownloadEnabled: true,
      releaseTag: "b9122",
      sourceUrl: "https://github.com/ggml-org/llama.cpp/releases/download/b9122/llama-b9122-bin-macos-arm64.tar.gz",
      archiveName: "llama-b9122-bin-macos-arm64.tar.gz",
      archiveFormat: "tar.gz",
      archiveSha256: "ba89bf2de1275b22d3d24e2fdb34500062b05371cbeb1e8cd6052a918b392de3",
      archiveSizeBytes: 8647910,
      binaryRelativePath: "llama-b9122/llama-server",
      binarySha256: "349688949464db70180658269a03abfbd9fb8e3c46a12f42f9e47174eaa6bddf",
      expectedBinaryNames: ["llama-server"],
      cacheSubdir: "b9122/macos-arm64-metal",
      license: "MIT for llama.cpp runtime; MiniCPM-V model assets remain Apache-2.0 per OpenBMB metadata.",
      pinStatus: "pinned",
      smokeRequirements: [
        "Start llama-server from the extracted archive on Apple Silicon with Metal enabled.",
        "Validate /health and /v1/models before analysis.",
        "Analyze a checked-in Ambient UI fixture and preserve schema-validation artifacts.",
        "Stop the daemon and confirm no stale llama-server process remains.",
        "Verify macOS quarantine removal and notarization/Gatekeeper policy before enabling managed download.",
      ],
    },
    {
      id: "llama-cpp-linux-x64-vulkan-nvidia",
      platform: "linux",
      arch: "x64",
      lane: "linux-x64-nvidia-vulkan",
      supportTier: "conditional",
      acceleration: "vulkan-nvidia",
      defaultDownloadEnabled: true,
      releaseTag: "b9122",
      sourceUrl: "https://github.com/ggml-org/llama.cpp/releases/download/b9122/llama-b9122-bin-ubuntu-vulkan-x64.tar.gz",
      archiveName: "llama-b9122-bin-ubuntu-vulkan-x64.tar.gz",
      archiveFormat: "tar.gz",
      archiveSha256: "484b0b0e66d8f411318464c337e53491412efb744bffdf4f4cd4e977fbc565f8",
      archiveSizeBytes: 31621850,
      binaryRelativePath: "llama-b9122/llama-server",
      binarySha256: "5e8906d07ec5a96e7c437bc83feacc7efa84c8c43c1eb9ee191fc260a20ab855",
      expectedBinaryNames: ["llama-server"],
      cacheSubdir: "b9122/linux-x64-vulkan-nvidia",
      license: "MIT for llama.cpp runtime; MiniCPM-V model assets remain Apache-2.0 per OpenBMB metadata.",
      pinStatus: "pinned",
      smokeRequirements: [
        "Start llama-server from the extracted archive on Ubuntu x64 with the selected GPU backend.",
        "Validate GPU device discovery, /health, and /v1/models before analysis.",
        "Analyze a checked-in Ambient UI fixture and preserve request/response/server-log artifacts.",
        "Stop the daemon and confirm no stale llama-server process or VRAM allocation remains.",
        "Record driver/backend requirements separately from CPU fallback.",
      ],
    },
    {
      id: "llama-cpp-windows-x64-cpu",
      platform: "win32",
      arch: "x64",
      lane: "windows-x64-cpu",
      supportTier: "experimental",
      acceleration: "cpu",
      defaultDownloadEnabled: false,
      releaseTag: "b9122",
      sourceUrl: "https://github.com/ggml-org/llama.cpp/releases/download/b9122/llama-b9122-bin-win-cpu-x64.zip",
      archiveName: "llama-b9122-bin-win-cpu-x64.zip",
      archiveFormat: "zip",
      archiveSha256: "48f35bcb78eb3e50b0b5927f60ac101fd95501a3c14ad39e0ea81444d0da9b40",
      archiveSizeBytes: 16056780,
      binaryRelativePath: "llama-server.exe",
      binarySha256: "819dacfec0b06b67aeac02388957881ce9483cc4326f507856c99d7881285a4a",
      expectedBinaryNames: ["llama-server.exe"],
      cacheSubdir: "b9122/windows-x64-cpu",
      license: "MIT for llama.cpp runtime; MiniCPM-V model assets remain Apache-2.0 per OpenBMB metadata.",
      pinStatus: "pinned",
      smokeRequirements: [
        "Extract the zip on a real Windows x64 host without relying on shell-specific path quoting.",
        "Start llama-server.exe from the extracted archive and record local firewall behavior.",
        "Validate /health and /v1/models before analysis.",
        "Analyze a checked-in Ambient UI fixture and preserve request/response/server-log artifacts.",
        "Stop the daemon and confirm no stale llama-server.exe process remains.",
        "Record CPU fallback latency and model-cache paths before changing Windows support labels.",
      ],
    },
  ],
  blockers: [
    "Windows x64 has a pinned CPU zip artifact, but default download remains disabled and Windows stays experimental until a real lifecycle smoke covers path quoting, firewall prompts, process cleanup, GPU backend selection, model-cache behavior, and valid screenshot analysis.",
  ],
  notes: [
    "Desktop setup can download the manifest-pinned macOS arm64 and Linux x64 runtime archives into .ambient/vision/minicpm-v/runtime, then reuse the reviewed extraction/checksum installer before binding llama-server.",
    "macOS, Linux, and Windows artifact fields are intentionally explicit so Desktop does not ask Pi to infer release shape.",
    "Pinned b9122 macOS arm64 Metal and Linux x64 Vulkan archives passed start/status/analyze/stop lifecycle smoke with checksum verification and clean process shutdown on 2026-05-12.",
    "The b9122 Windows x64 CPU zip has pinned archive and extracted llama-server.exe checksums, but has not passed real-host lifecycle smoke and is disabled for default managed download.",
    "Desktop setup can install either a user-approved local archive or a default managed macOS/Linux download after archive and extracted-binary checksum verification, remove quarantine from the managed macOS copy after checksum verification, write a workspace-local receipt/env binding, and mark macOS default download eligible when the managed copy is quarantine-free with a valid code signature.",
  ],
};

export function verifyMiniCpmRuntimeReleaseManifest(input: {
  manifest?: MiniCpmVisionRuntimeReleaseManifest;
  platform?: string;
  arch?: string;
  artifactId?: string;
  archivePath?: string;
  binaryPath?: string;
} = {}): MiniCpmVisionRuntimeReleaseManifestVerification {
  const manifest = input.manifest ?? miniCpmRuntimeReleaseManifestPrototype;
  const verification = verifyLocalLlamaRuntimeReleaseManifest<MiniCpmVisionRuntimeReleaseArtifact>({
    manifest,
    expectedSchemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
    capabilityLabel: "MiniCPM-V",
    platform: input.platform,
    arch: input.arch,
    artifactId: input.artifactId,
    archivePath: input.archivePath,
    binaryPath: input.binaryPath,
    blockerAppliesToArtifact: miniCpmRuntimeBlockerAppliesToArtifact,
  });
  return {
    ...verification,
    schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
  };
}

function miniCpmRuntimeBlockerAppliesToArtifact(blocker: string, artifact: MiniCpmVisionRuntimeReleaseArtifact): boolean {
  if (/Windows x64/i.test(blocker)) return artifact.platform === "win32";
  if (/macOS/i.test(blocker)) return artifact.platform === "darwin";
  return true;
}
