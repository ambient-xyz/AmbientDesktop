import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeMiniCpmVisionInput,
  installMiniCpmManagedRuntimeFromDownload,
  readMiniCpmVisionValidationMetadata,
  setupMiniCpmVisionProvider,
} from "./miniCpmVisionProvider";

vi.setConfig({ testTimeout: 30_000 });

const missingTestLlamaServer = join(tmpdir(), "ambient-minicpm-v-test-missing-llama-server");

describe("MiniCPM-V vision provider adapter", () => {
  beforeEach(() => {
    process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = missingTestLlamaServer;
  });

  it("installs the bundled provider and persists needs-runtime metadata when llama-server is missing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-setup-missing-"));
    const previousServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    try {
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = join(workspace, "missing-llama-server");
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const result = await setupMiniCpmVisionProvider(
        workspace,
        { provider: "minicpm-v", action: "install", installRuntime: false },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-11T00:00:00.000Z"),
        },
      );

      expect(result.status).toBe("needs-runtime");
      expect(result.installStatuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-minicpm-v-vision",
          status: "installed",
        }),
      ]);
      expect(result.validation).toMatchObject({
        schemaVersion: "ambient-minicpm-v-provider-validation-v1",
        provider: "minicpm-v",
        packageName: "ambient-minicpm-v-vision",
        status: "needs-runtime",
        updatedAt: "2026-05-11T00:00:00.000Z",
        error: expect.stringContaining("llama-server"),
      });
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: "missing-runtime-binary",
          severity: "warning",
        }),
      ]);
      expect(result.nextSteps.join("\n")).toContain("AMBIENT_MINICPM_V_LLAMA_SERVER");
      expect(result.runtimeContract).toMatchObject({
        mode: "user-managed-runtime",
        status: "active",
        runtime: "llama.cpp llama-server",
        ambientManagedDownload: {
          status: "planned",
          cacheRoot: ".ambient/vision/minicpm-v/runtime",
          manifestVerification: {
            status: expect.any(String),
            downloadEnabled: true,
            selectedArtifactId: expect.any(String),
            checks: expect.arrayContaining([
              expect.objectContaining({ id: "artifact-required-fields", status: "passed" }),
              expect.objectContaining({ id: "artifact-checksum-pin", status: "passed" }),
              expect.objectContaining({ id: "download-policy", status: "passed" }),
            ]),
          },
        },
      });
      expect(result.runtimeContract?.preflight).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "runtime-binary-present", status: "failed" }),
        expect.objectContaining({ id: "model-cache-policy", status: "warning" }),
      ]));
      await expect(readMiniCpmVisionValidationMetadata(workspace)).resolves.toMatchObject({
        status: "needs-runtime",
        packageName: "ambient-minicpm-v-vision",
        runtimeContract: {
          mode: "user-managed-runtime",
        },
        diagnostics: [expect.objectContaining({ code: "missing-runtime-binary" })],
      });
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousServer);
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs a pinned runtime archive into Ambient-owned cache before binding it", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-managed-runtime-"));
    const archiveRoot = await mkdtemp(join(tmpdir(), "ambient-minicpm-runtime-archive-"));
    const previousServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    try {
      delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const sourceRoot = join(archiveRoot, "src");
      const runtimeDir = join(sourceRoot, "llama-b9122");
      const runtimeBinary = join(runtimeDir, "llama-server");
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(runtimeBinary, "#!/bin/sh\necho 'version: managed-runtime-test'\n", "utf8");
      await chmod(runtimeBinary, 0o755);
      const binarySha256 = await sha256Path(runtimeBinary);
      const archivePath = join(archiveRoot, "llama-b9122-bin-test.tar.gz");
      const archive = spawnSync("tar", ["-czf", archivePath, "-C", sourceRoot, "llama-b9122"], { encoding: "utf8" });
      expect(archive.status).toBe(0);
      const archiveSha256 = await sha256Path(archivePath);
      const artifactId = "llama-cpp-test-managed-runtime";

      const result = await setupMiniCpmVisionProvider(
        workspace,
        {
          provider: "minicpm-v",
          action: "repair",
          runtimeArchivePath: archivePath,
          runtimeArtifactId: artifactId,
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T03:00:00.000Z"),
          runtimeReleaseManifest: {
            schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
            manifestId: "test-managed-runtime-manifest",
            downloadEnabled: false,
            checksumAlgorithm: "sha256",
            requiredArtifactFields: [
              "id",
              "platform",
              "arch",
              "lane",
              "supportTier",
              "acceleration",
              "releaseTag",
              "sourceUrl",
              "archiveName",
              "archiveFormat",
              "archiveSha256",
              "binaryRelativePath",
              "expectedBinaryNames",
              "cacheSubdir",
              "license",
              "pinStatus",
              "smokeRequirements",
            ],
            artifacts: [
              {
                id: artifactId,
                platform: platform() as "darwin" | "linux" | "win32",
                arch: arch(),
                lane: "test-managed-runtime",
                supportTier: "conditional",
                acceleration: "test",
                defaultDownloadEnabled: false,
                releaseTag: "b9122-test",
                sourceUrl: "https://example.invalid/llama-b9122-bin-test.tar.gz",
                archiveName: "llama-b9122-bin-test.tar.gz",
                archiveFormat: "tar.gz",
                archiveSha256,
                binaryRelativePath: "llama-b9122/llama-server",
                binarySha256,
                expectedBinaryNames: ["llama-server"],
                cacheSubdir: "b9122/test-managed-runtime",
                license: "test",
                pinStatus: "pinned",
                smokeRequirements: ["test"],
              },
            ],
            blockers: ["test blocker keeps download disabled"],
            notes: ["test manifest"],
          },
        },
      );

      expect(result.status).toBe("ready");
      expect(result.runtimeInstall).toMatchObject({
        attempted: true,
        status: "installed",
        source: "local-archive",
        artifactId,
        archiveSha256,
        binarySha256,
        cacheSubdir: "b9122/test-managed-runtime",
        installRoot: ".ambient/vision/minicpm-v/runtime/b9122/test-managed-runtime",
        receiptPath: ".ambient/vision/minicpm-v/runtime/b9122/test-managed-runtime/ambient-runtime-install.json",
        rollback: "not-needed",
      });
      if (platform() === "darwin") {
        expect(result.runtimeInstall?.macosSecurity).toMatchObject({
          platform: "darwin",
          quarantineAfter: "not-present",
          defaultDownloadPromotion: "blocked",
        });
      }
      expect(result.validation).toMatchObject({
        status: "runtime-ready",
        runtimeInstall: expect.objectContaining({
          status: "installed",
          manifestVerification: expect.objectContaining({
            checks: expect.arrayContaining([
              expect.objectContaining({ id: "local-archive-checksum", status: "passed" }),
              expect.objectContaining({ id: "local-binary-checksum", status: "passed" }),
            ]),
          }),
        }),
        runtimeContract: {
          mode: "ambient-managed-runtime",
          binarySource: "ambient-managed-runtime",
          ambientManagedDownload: expect.objectContaining({
            status: "active",
          }),
        },
      });
      const installedBinary = result.runtimeInstall?.binaryPath ?? "";
      expect(installedBinary).toContain(join(workspace, ".ambient/vision/minicpm-v/runtime/b9122/test-managed-runtime/llama-b9122/llama-server"));
      expect(existsSync(installedBinary)).toBe(true);
      expect(await readFile(join(workspace, ".ambient/vision/minicpm-v/env/AMBIENT_MINICPM_V_LLAMA_SERVER.value"), "utf8")).toBe(`${installedBinary}\n`);
      const receipt = JSON.parse(await readFile(join(workspace, result.runtimeInstall?.receiptPath ?? ""), "utf8"));
      expect(receipt).toMatchObject({
        schemaVersion: "ambient-minicpm-v-runtime-install-receipt-v1",
        artifactId,
        archiveSha256,
        binarySha256,
        ownership: {
          ambientOwned: true,
          userManagedRuntimesPreserved: true,
          modelCachesPreserved: true,
        },
      });
      if (platform() === "darwin") {
        expect(receipt.macosSecurity).toMatchObject({
          platform: "darwin",
          quarantineAfter: "not-present",
          defaultDownloadPromotion: "blocked",
        });
        const quarantine = spawnSync("xattr", ["-w", "com.apple.quarantine", "0081;00000000;Ambient;MiniCPMTest", installedBinary], { encoding: "utf8" });
        expect(quarantine.status).toBe(0);
        const reused = await setupMiniCpmVisionProvider(
          workspace,
          {
            provider: "minicpm-v",
            action: "repair",
            runtimeArchivePath: archivePath,
            runtimeArtifactId: artifactId,
          },
          {
            bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
            disableRuntimeAutoDetect: true,
            now: () => new Date("2026-05-12T03:05:00.000Z"),
            runtimeReleaseManifest: {
              schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
              manifestId: "test-managed-runtime-manifest",
              downloadEnabled: false,
              checksumAlgorithm: "sha256",
              requiredArtifactFields: [
                "id",
                "platform",
                "arch",
                "lane",
                "supportTier",
                "acceleration",
                "releaseTag",
                "sourceUrl",
                "archiveName",
                "archiveFormat",
                "archiveSha256",
                "binaryRelativePath",
                "expectedBinaryNames",
                "cacheSubdir",
                "license",
                "pinStatus",
                "smokeRequirements",
              ],
              artifacts: [
                {
                  id: artifactId,
                  platform: platform() as "darwin" | "linux" | "win32",
                  arch: arch(),
                  lane: "test-managed-runtime",
                  supportTier: "conditional",
                  acceleration: "test",
                  defaultDownloadEnabled: false,
                  releaseTag: "b9122-test",
                  sourceUrl: "https://example.invalid/llama-b9122-bin-test.tar.gz",
                  archiveName: "llama-b9122-bin-test.tar.gz",
                  archiveFormat: "tar.gz",
                  archiveSha256,
                  binaryRelativePath: "llama-b9122/llama-server",
                  binarySha256,
                  expectedBinaryNames: ["llama-server"],
                  cacheSubdir: "b9122/test-managed-runtime",
                  license: "test",
                  pinStatus: "pinned",
                  smokeRequirements: ["test"],
                },
              ],
              blockers: ["test blocker keeps download disabled"],
              notes: ["test manifest"],
            },
          },
        );
        expect(reused.runtimeInstall).toMatchObject({
          status: "already-installed",
          macosQuarantine: "not-present",
          macosSecurity: expect.objectContaining({
            quarantineBefore: "present",
            quarantineAction: "removed-after-checksum",
            quarantineAfter: "not-present",
            defaultDownloadPromotion: "blocked",
          }),
        });
      }
      await expect(readMiniCpmVisionValidationMetadata(workspace)).resolves.toMatchObject({
        runtimeInstall: expect.objectContaining({ artifactId }),
      });
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousServer);
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      await rm(workspace, { recursive: true, force: true });
      await rm(archiveRoot, { recursive: true, force: true });
    }
  });

  it("downloads the default managed macOS/Linux runtime archive before binding it", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-managed-download-"));
    const archiveRoot = await mkdtemp(join(tmpdir(), "ambient-minicpm-runtime-download-src-"));
    const previousServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    const previousLocalHttpEgress = process.env.AMBIENT_EGRESS_ALLOW_LOCAL_HTTP;
    let server: Awaited<ReturnType<typeof localRuntimeArchiveServer>> | undefined;
    try {
      delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      process.env.AMBIENT_EGRESS_ALLOW_LOCAL_HTTP = "1";
      const sourceRoot = join(archiveRoot, "src");
      const runtimeDir = join(sourceRoot, "llama-b9122");
      const runtimeBinary = join(runtimeDir, "llama-server");
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(runtimeBinary, "#!/bin/sh\necho 'version: managed-download-test'\n", "utf8");
      await chmod(runtimeBinary, 0o755);
      const binarySha256 = await sha256Path(runtimeBinary);
      const archivePath = join(archiveRoot, "llama-b9122-bin-download-test.tar.gz");
      const archive = spawnSync("tar", ["-czf", archivePath, "-C", sourceRoot, "llama-b9122"], { encoding: "utf8" });
      expect(archive.status).toBe(0);
      const archiveBytes = await readFile(archivePath);
      const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
      server = await localRuntimeArchiveServer(archiveBytes);
      const artifactId = "llama-cpp-test-managed-download-runtime";
      const manifest = {
        schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1" as const,
        manifestId: "test-managed-download-runtime-manifest",
        downloadEnabled: true,
        checksumAlgorithm: "sha256" as const,
        requiredArtifactFields: [
          "id",
          "platform",
          "arch",
          "lane",
          "supportTier",
          "acceleration",
          "defaultDownloadEnabled",
          "releaseTag",
          "sourceUrl",
          "archiveName",
          "archiveFormat",
          "archiveSha256",
          "binaryRelativePath",
          "expectedBinaryNames",
          "cacheSubdir",
          "license",
          "pinStatus",
          "smokeRequirements",
        ],
        artifacts: [
          {
            id: artifactId,
            platform: platform() as "darwin" | "linux" | "win32",
            arch: arch(),
            lane: "test-managed-download-runtime",
            supportTier: "conditional" as const,
            acceleration: "test",
            defaultDownloadEnabled: true,
            releaseTag: "b9122-test",
            sourceUrl: `http://127.0.0.1:${server.port}/llama-b9122-bin-download-test.tar.gz`,
            archiveName: "llama-b9122-bin-download-test.tar.gz",
            archiveFormat: "tar.gz" as const,
            archiveSha256,
            archiveSizeBytes: archiveBytes.length,
            binaryRelativePath: "llama-b9122/llama-server",
            binarySha256,
            expectedBinaryNames: ["llama-server"],
            cacheSubdir: "b9122/test-managed-download-runtime",
            license: "test",
            pinStatus: "pinned" as const,
            smokeRequirements: ["test"],
          },
        ],
        blockers: [],
        notes: ["test manifest"],
      };

      const result = await setupMiniCpmVisionProvider(
        workspace,
        {
          provider: "minicpm-v",
          action: "repair",
          runtimeArtifactId: artifactId,
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T05:00:00.000Z"),
          runtimeReleaseManifest: manifest,
          runtimeDownloadPreResponseTimeoutMs: 5_000,
          runtimeDownloadIdleTimeoutMs: 5_000,
        },
      );

      expect(result.status).toBe("ready");
      expect(result.runtimeInstall).toMatchObject({
        attempted: true,
        status: "installed",
        source: "managed-download",
        artifactId,
        downloadUrl: `http://127.0.0.1:${server.port}/llama-b9122-bin-download-test.tar.gz`,
        downloadStatus: "downloaded",
        downloadBytes: archiveBytes.length,
        archivePath: ".ambient/vision/minicpm-v/runtime/.downloads/b9122/test-managed-download-runtime/llama-b9122-bin-download-test.tar.gz",
        archiveSha256,
        binarySha256,
        cacheSubdir: "b9122/test-managed-download-runtime",
        installRoot: ".ambient/vision/minicpm-v/runtime/b9122/test-managed-download-runtime",
        receiptPath: ".ambient/vision/minicpm-v/runtime/b9122/test-managed-download-runtime/ambient-runtime-install.json",
      });
      expect(result.runtimeContract?.ambientManagedDownload.manifestVerification?.downloadEnabled).toBe(true);
      expect(result.runtimeContract?.ambientManagedDownload.manifestVerification?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "download-policy", status: "passed" }),
      ]));
      expect(server.requests).toBe(1);
      const receipt = JSON.parse(await readFile(join(workspace, result.runtimeInstall?.receiptPath ?? ""), "utf8"));
      expect(receipt).toMatchObject({
        source: "managed-download",
        archivePath: ".ambient/vision/minicpm-v/runtime/.downloads/b9122/test-managed-download-runtime/llama-b9122-bin-download-test.tar.gz",
        download: {
          status: "downloaded",
          bytes: archiveBytes.length,
        },
      });

      const reused = await setupMiniCpmVisionProvider(
        workspace,
        {
          provider: "minicpm-v",
          action: "repair",
          runtimeArtifactId: artifactId,
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T05:05:00.000Z"),
          runtimeReleaseManifest: manifest,
        },
      );
      expect(reused.runtimeInstall).toMatchObject({
        status: "already-installed",
        source: "managed-download",
        downloadStatus: "reused",
      });
      expect(server.requests).toBe(1);
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousServer);
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      restoreEnv("AMBIENT_EGRESS_ALLOW_LOCAL_HTTP", previousLocalHttpEgress);
      const activeServer = server;
      if (activeServer) await new Promise((resolveClose) => activeServer.close(resolveClose));
      await rm(workspace, { recursive: true, force: true });
      await rm(archiveRoot, { recursive: true, force: true });
    }
  });

  it("blocks MiniCPM managed runtime loopback downloads unless local-dev egress is explicit", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-managed-download-blocked-"));
    const server = await localRuntimeArchiveServer(Buffer.from("should not be fetched"));
    try {
      const artifactId = "llama-cpp-test-blocked-loopback-runtime";
      const result = await installMiniCpmManagedRuntimeFromDownload(workspace, {
        artifactId,
        now: () => new Date("2026-05-12T05:10:00.000Z"),
        manifest: {
          schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
          manifestId: "test-managed-download-blocked-runtime-manifest",
          downloadEnabled: true,
          checksumAlgorithm: "sha256",
          requiredArtifactFields: [
            "id",
            "platform",
            "arch",
            "lane",
            "supportTier",
            "acceleration",
            "defaultDownloadEnabled",
            "releaseTag",
            "sourceUrl",
            "archiveName",
            "archiveFormat",
            "archiveSha256",
            "binaryRelativePath",
            "expectedBinaryNames",
            "cacheSubdir",
            "license",
            "pinStatus",
            "smokeRequirements",
          ],
          artifacts: [
            {
              id: artifactId,
              platform: platform() as "darwin" | "linux" | "win32",
              arch: arch(),
              lane: "test-blocked-loopback-runtime",
              supportTier: "conditional",
              acceleration: "test",
              defaultDownloadEnabled: true,
              releaseTag: "b9122-test",
              sourceUrl: `http://127.0.0.1:${server.port}/llama-b9122-bin-download-test.tar.gz`,
              archiveName: "llama-b9122-bin-download-test.tar.gz",
              archiveFormat: "tar.gz",
              archiveSha256: "a".repeat(64),
              binaryRelativePath: "llama-b9122/llama-server",
              binarySha256: "b".repeat(64),
              expectedBinaryNames: ["llama-server"],
              cacheSubdir: "b9122/test-blocked-loopback-runtime",
              license: "test",
              pinStatus: "pinned",
              smokeRequirements: ["test"],
            },
          ],
          blockers: [],
          notes: ["test manifest"],
        },
      });

      expect(result).toMatchObject({
        attempted: true,
        status: "unsupported",
        source: "managed-download",
        artifactId,
      });
      expect(result.error).toMatch(/blocked loopback network target/i);
      expect(server.requests).toBe(0);
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs a pinned Windows zip runtime archive with sibling DLLs", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-managed-zip-runtime-"));
    const archiveRoot = await mkdtemp(join(tmpdir(), "ambient-minicpm-runtime-zip-"));
    const previousServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    try {
      delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const binaryContent = "#!/bin/sh\necho 'version: managed-windows-zip-test'\n";
      const dllContent = "synthetic dll dependency";
      const binarySha256 = createHash("sha256").update(binaryContent).digest("hex");
      const zip = new JSZip();
      zip.file("llama-server.exe", binaryContent);
      zip.file("llama-common.dll", dllContent);
      const archivePath = join(archiveRoot, "llama-b9122-bin-win-cpu-x64.zip");
      await writeFile(archivePath, await zip.generateAsync({ type: "nodebuffer" }));
      const archiveSha256 = await sha256Path(archivePath);
      const artifactId = "llama-cpp-test-windows-zip-runtime";

      const result = await setupMiniCpmVisionProvider(
        workspace,
        {
          provider: "minicpm-v",
          action: "repair",
          runtimeArchivePath: archivePath,
          runtimeArtifactId: artifactId,
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T04:00:00.000Z"),
          runtimeReleaseManifest: {
            schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
            manifestId: "test-managed-zip-runtime-manifest",
            downloadEnabled: false,
            checksumAlgorithm: "sha256",
            requiredArtifactFields: [
              "id",
              "platform",
              "arch",
              "lane",
              "supportTier",
              "acceleration",
              "releaseTag",
              "sourceUrl",
              "archiveName",
              "archiveFormat",
              "archiveSha256",
              "binaryRelativePath",
              "expectedBinaryNames",
              "cacheSubdir",
              "license",
              "pinStatus",
              "smokeRequirements",
            ],
            artifacts: [
              {
                id: artifactId,
                platform: "win32",
                arch: "x64",
                lane: "windows-x64-cpu",
                supportTier: "experimental",
                acceleration: "cpu",
                defaultDownloadEnabled: false,
                releaseTag: "b9122-test",
                sourceUrl: "https://example.invalid/llama-b9122-bin-win-cpu-x64.zip",
                archiveName: "llama-b9122-bin-win-cpu-x64.zip",
                archiveFormat: "zip",
                archiveSha256,
                binaryRelativePath: "llama-server.exe",
                binarySha256,
                expectedBinaryNames: ["llama-server.exe"],
                cacheSubdir: "b9122/test-windows-zip-runtime",
                license: "test",
                pinStatus: "pinned",
                smokeRequirements: ["test"],
              },
            ],
            blockers: ["test blocker keeps download disabled"],
            notes: ["test manifest"],
          },
        },
      );

      expect(result.status).toBe("ready");
      expect(result.runtimeInstall).toMatchObject({
        attempted: true,
        status: "installed",
        source: "local-archive",
        artifactId,
        archiveSha256,
        binarySha256,
        cacheSubdir: "b9122/test-windows-zip-runtime",
        installRoot: ".ambient/vision/minicpm-v/runtime/b9122/test-windows-zip-runtime",
        receiptPath: ".ambient/vision/minicpm-v/runtime/b9122/test-windows-zip-runtime/ambient-runtime-install.json",
      });
      const installedBinary = result.runtimeInstall?.binaryPath ?? "";
      expect(installedBinary).toContain(join(workspace, ".ambient/vision/minicpm-v/runtime/b9122/test-windows-zip-runtime/llama-server.exe"));
      expect(existsSync(installedBinary)).toBe(true);
      expect(existsSync(join(workspace, ".ambient/vision/minicpm-v/runtime/b9122/test-windows-zip-runtime/llama-common.dll"))).toBe(true);
      expect(result.runtimeInstall?.manifestVerification?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "local-archive-checksum", status: "passed" }),
        expect.objectContaining({ id: "local-binary-checksum", status: "passed" }),
      ]));
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousServer);
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      await rm(workspace, { recursive: true, force: true });
      await rm(archiveRoot, { recursive: true, force: true });
    }
  });

  it("rejects unsafe Windows zip runtime archive paths before binding", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-unsafe-zip-runtime-"));
    const archiveRoot = await mkdtemp(join(tmpdir(), "ambient-minicpm-unsafe-runtime-zip-"));
    const previousServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    try {
      delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const binaryContent = "#!/bin/sh\necho 'unsafe zip should not install'\n";
      const zip = new JSZip();
      zip.file("../llama-server.exe", binaryContent);
      const archivePath = join(archiveRoot, "llama-b9122-bin-win-cpu-x64.zip");
      await writeFile(archivePath, await zip.generateAsync({ type: "nodebuffer" }));
      const archiveSha256 = await sha256Path(archivePath);
      const artifactId = "llama-cpp-test-unsafe-windows-zip-runtime";

      const result = await setupMiniCpmVisionProvider(
        workspace,
        {
          provider: "minicpm-v",
          action: "repair",
          runtimeArchivePath: archivePath,
          runtimeArtifactId: artifactId,
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T04:05:00.000Z"),
          runtimeReleaseManifest: {
            schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
            manifestId: "test-unsafe-zip-runtime-manifest",
            downloadEnabled: false,
            checksumAlgorithm: "sha256",
            requiredArtifactFields: [
              "id",
              "platform",
              "arch",
              "lane",
              "supportTier",
              "acceleration",
              "releaseTag",
              "sourceUrl",
              "archiveName",
              "archiveFormat",
              "archiveSha256",
              "binaryRelativePath",
              "expectedBinaryNames",
              "cacheSubdir",
              "license",
              "pinStatus",
              "smokeRequirements",
            ],
            artifacts: [
              {
                id: artifactId,
                platform: "win32",
                arch: "x64",
                lane: "windows-x64-cpu",
                supportTier: "experimental",
                acceleration: "cpu",
                defaultDownloadEnabled: false,
                releaseTag: "b9122-test",
                sourceUrl: "https://example.invalid/llama-b9122-bin-win-cpu-x64.zip",
                archiveName: "llama-b9122-bin-win-cpu-x64.zip",
                archiveFormat: "zip",
                archiveSha256,
                binaryRelativePath: "llama-server.exe",
                binarySha256: createHash("sha256").update(binaryContent).digest("hex"),
                expectedBinaryNames: ["llama-server.exe"],
                cacheSubdir: "b9122/test-unsafe-windows-zip-runtime",
                license: "test",
                pinStatus: "pinned",
                smokeRequirements: ["test"],
              },
            ],
            blockers: ["test blocker keeps download disabled"],
            notes: ["test manifest"],
          },
        },
      );

      expect(result.status).toBe("failed");
      expect(result.runtimeInstall).toMatchObject({
        attempted: true,
        status: "failed",
        source: "local-archive",
        artifactId,
      });
      expect(result.runtimeInstall?.error).toContain("unsafe entry path");
      expect(existsSync(join(workspace, ".ambient/vision/minicpm-v/runtime/b9122/test-unsafe-windows-zip-runtime/llama-server.exe"))).toBe(false);
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousServer);
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      await rm(workspace, { recursive: true, force: true });
      await rm(archiveRoot, { recursive: true, force: true });
    }
  });

  it("uninstalls the Ambient-managed package and cache while preserving user runtimes and model caches", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-uninstall-"));
    const externalRoot = await mkdtemp(join(tmpdir(), "ambient-minicpm-user-assets-"));
    const previousServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    try {
      const userRuntime = join(externalRoot, "llama-server");
      const userModelCache = join(externalRoot, "llama-cache", "model.gguf");
      await mkdir(join(externalRoot, "llama-cache"), { recursive: true });
      await writeFile(userRuntime, "user managed runtime");
      await writeFile(userModelCache, "user managed model cache");
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = join(workspace, "missing-llama-server");
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      await setupMiniCpmVisionProvider(
        workspace,
        { provider: "minicpm-v", action: "install", installRuntime: false },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-11T00:00:00.000Z"),
        },
      );

      const ownedPaths = [
        ".ambient/vision/minicpm-v/state",
        ".ambient/vision/minicpm-v/env",
        ".ambient/vision/minicpm-v/runtime",
        ".ambient/vision/minicpm-v/inputs",
        ".ambient/vision/minicpm-v/frames",
        ".ambient/vision/minicpm-v/analysis",
      ];
      for (const ownedPath of ownedPaths) {
        await mkdir(join(workspace, ownedPath), { recursive: true });
        await writeFile(join(workspace, ownedPath, "owned.txt"), "owned by Ambient");
      }
      await writeFile(join(workspace, ".ambient/vision/minicpm-v/env", "AMBIENT_MINICPM_V_LLAMA_SERVER.value"), `${userRuntime}\n`);
      await mkdir(join(workspace, ".ambient/cli-packages"), { recursive: true });
      await writeFile(
        join(workspace, ".ambient/cli-packages/env-bindings.json"),
        `${JSON.stringify({
          bindings: [
            {
              packageName: "ambient-minicpm-v-vision",
              envName: "AMBIENT_MINICPM_V_LLAMA_SERVER",
              filePath: "./.ambient/vision/minicpm-v/env/AMBIENT_MINICPM_V_LLAMA_SERVER.value",
            },
          ],
        }, null, 2)}\n`,
      );

      const result = await setupMiniCpmVisionProvider(
        workspace,
        { provider: "minicpm-v", action: "uninstall", runtimeBinaryPath: userRuntime },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T00:00:00.000Z"),
        },
      );

      expect(result.status).toBe("uninstalled");
      expect(result.cleanup).toMatchObject({
        packageStatus: "uninstalled",
        stopStatus: expect.stringMatching(/stopped|failed/),
      });
      expect(result.cleanup?.preserved.join("\n")).toContain("llama-server binaries are never removed");
      expect(result.cleanup?.preserved.join("\n")).toContain("model caches are never removed");
      for (const ownedPath of ownedPaths) {
        expect(result.cleanup?.paths).toContainEqual(expect.objectContaining({ path: ownedPath, status: "removed" }));
        expect(existsSync(join(workspace, ownedPath))).toBe(false);
      }
      expect(existsSync(userRuntime)).toBe(true);
      expect(existsSync(userModelCache)).toBe(true);
      const envBindings = JSON.parse(await readFile(join(workspace, ".ambient/cli-packages/env-bindings.json"), "utf8"));
      expect(envBindings.bindings).toEqual([]);
      if (result.cleanup?.packageRootPath) expect(existsSync(result.cleanup.packageRootPath)).toBe(false);
      await expect(readMiniCpmVisionValidationMetadata(workspace)).resolves.toMatchObject({
        status: "uninstalled",
        cleanup: expect.objectContaining({
          packageStatus: "uninstalled",
        }),
      });
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousServer);
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      await rm(workspace, { recursive: true, force: true });
      await rm(externalRoot, { recursive: true, force: true });
    }
  });

  it("stops MiniCPM-V without uninstalling package state or erasing runtime residency metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-stop-"));
    const previousServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    try {
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = join(workspace, "missing-llama-server");
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      await setupMiniCpmVisionProvider(
        workspace,
        { provider: "minicpm-v", action: "install", installRuntime: false },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-11T00:00:00.000Z"),
        },
      );

      const stateDir = join(workspace, ".ambient/vision/minicpm-v/state");
      const statePath = join(stateDir, "server-state.json");
      await mkdir(stateDir, { recursive: true });
      await writeFile(statePath, `${JSON.stringify({
        pid: 4242,
        endpoint: "http://127.0.0.1:39217",
        host: "127.0.0.1",
        port: 39217,
        model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
        startedAt: "2026-05-12T00:00:00.000Z",
        logPath: join(stateDir, "llama-server.log"),
        stderrPath: join(stateDir, "llama-server.stderr.log"),
        command: ["/runtime/llama-server", "--model", "openbmb/MiniCPM-V-4_5-gguf:q4_k_m", "--port", "39217"],
      }, null, 2)}\n`);

      const result = await setupMiniCpmVisionProvider(
        workspace,
        { provider: "minicpm-v", action: "stop" },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T00:02:00.000Z"),
        },
      );

      expect(result).toMatchObject({
        action: "stop",
        status: "stopped",
        validation: {
          status: "stopped",
          endpoint: "http://127.0.0.1:39217",
          runtimeState: {
            status: "stopped",
            running: false,
            pid: 4242,
            previousPid: 4242,
            endpoint: "http://127.0.0.1:39217",
          },
        },
      });
      expect(result.installStatuses).toEqual([
        expect.objectContaining({ packageName: "ambient-minicpm-v-vision", status: "installed" }),
      ]);
      expect(result.nextSteps.join("\n")).toContain("runtime is stopped");
      expect(existsSync(statePath)).toBe(true);
      const stoppedState = JSON.parse(await readFile(statePath, "utf8"));
      expect(stoppedState).toMatchObject({
        pid: 4242,
        previousPid: 4242,
        status: "stopped",
        endpoint: "http://127.0.0.1:39217",
      });
      const validationMetadata = await readMiniCpmVisionValidationMetadata(workspace);
      expect(validationMetadata).toMatchObject({
        status: "stopped",
        runtimeState: {
          status: "stopped",
          running: false,
          previousPid: 4242,
        },
      });
      await writeMiniCpmStopProofArtifact({
        result,
        stoppedState,
        validationMetadata,
      });
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousServer);
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("validates an approved local existing endpoint with a redacted image request", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-existing-endpoint-"));
    const previousServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    const previousEndpoint = process.env.AMBIENT_MINICPM_V_ENDPOINT;
    const requests: Array<{ method?: string; url?: string; body?: any }> = [];
    const server = await localMiniCpmEndpoint(requests);
    try {
      const endpointUrl = `http://127.0.0.1:${server.port}`;
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = join(workspace, "missing-llama-server");
      delete process.env.AMBIENT_MINICPM_V_ENDPOINT;
      await writeFile(join(workspace, "screen.png"), tinyPng());

      const result = await setupMiniCpmVisionProvider(
        workspace,
        {
          provider: "minicpm-v",
          action: "validate",
          endpointUrl,
          validationImagePath: "screen.png",
          validationTask: "ui_review",
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T01:00:00.000Z"),
        },
      );

      expect(result.status).toBe("ready");
      expect(result.runtimeCandidates).toEqual([]);
      expect(result.validation).toMatchObject({
        status: "passed",
        endpoint: endpointUrl,
        endpointMode: "existing-local-endpoint",
        endpointModelIds: ["local-minicpm-v"],
        summary: "local endpoint analyzed the supplied image",
        runtimeContract: {
          mode: "existing-local-endpoint",
          status: "active",
          endpoint: endpointUrl,
        },
      });
      expect(result.runtimeContract?.preflight).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "endpoint-locality", status: "passed" }),
        expect.objectContaining({ id: "endpoint-health", status: "passed" }),
        expect.objectContaining({ id: "endpoint-lifecycle", status: "warning" }),
      ]));
      expect(result.validation.binaryPath).toBeUndefined();
      expect(requests.some((request) => request.url === "/v1/models")).toBe(true);
      const chat = requests.find((request) => request.url === "/v1/chat/completions");
      expect(chat?.body.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
      const artifact = JSON.parse(await readFile(join(workspace, result.validation.artifactPath ?? ""), "utf8"));
      expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
      await expect(readMiniCpmVisionValidationMetadata(workspace)).resolves.toMatchObject({
        status: "passed",
        endpointMode: "existing-local-endpoint",
        endpointModelIds: ["local-minicpm-v"],
      });
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousServer);
      restoreEnv("AMBIENT_MINICPM_V_ENDPOINT", previousEndpoint);
      await new Promise((resolveClose) => server.close(resolveClose));
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps failed or canceled endpoint setup inactive until repair re-validates", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-repair-endpoint-"));
    const previousServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    const previousEndpoint = process.env.AMBIENT_MINICPM_V_ENDPOINT;
    const requests: Array<{ method?: string; url?: string; body?: any }> = [];
    const endpointState = { modelsReady: false };
    const server = await controllableMiniCpmEndpoint(requests, endpointState);
    const endpointUrl = `http://127.0.0.1:${server.port}`;
    const endpointBindingPath = join(workspace, ".ambient/vision/minicpm-v/env/AMBIENT_MINICPM_V_ENDPOINT.value");
    try {
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = join(workspace, "missing-llama-server");
      delete process.env.AMBIENT_MINICPM_V_ENDPOINT;
      await writeFile(join(workspace, "screen.png"), tinyPng());

      const failed = await setupMiniCpmVisionProvider(
        workspace,
        {
          provider: "minicpm-v",
          action: "validate",
          endpointUrl,
          validationImagePath: "screen.png",
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T02:00:00.000Z"),
        },
      );

      expect(failed.status).toBe("needs-runtime");
      expect(failed.validation).toMatchObject({
        status: "needs-runtime",
        endpoint: endpointUrl,
        endpointMode: "existing-local-endpoint",
      });
      expect(existsSync(endpointBindingPath)).toBe(false);
      expect(requests.some((request) => request.url === "/v1/chat/completions")).toBe(false);
      await expect(readMiniCpmVisionValidationMetadata(workspace)).resolves.toMatchObject({
        status: "needs-runtime",
        endpoint: endpointUrl,
      });

      const aborted = new AbortController();
      aborted.abort();
      await expect(
        setupMiniCpmVisionProvider(
          workspace,
          {
            provider: "minicpm-v",
            action: "repair",
            endpointUrl,
            validationImagePath: "screen.png",
          },
          {
            bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
            disableRuntimeAutoDetect: true,
            signal: aborted.signal,
          },
        ),
      ).rejects.toThrow("canceled");
      expect(existsSync(endpointBindingPath)).toBe(false);
      await expect(readMiniCpmVisionValidationMetadata(workspace)).resolves.toMatchObject({
        status: "needs-runtime",
      });

      endpointState.modelsReady = true;
      const repaired = await setupMiniCpmVisionProvider(
        workspace,
        {
          provider: "minicpm-v",
          action: "repair",
          endpointUrl,
          validationImagePath: "screen.png",
          validationTask: "ui_review",
        },
        {
          bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          disableRuntimeAutoDetect: true,
          now: () => new Date("2026-05-12T02:05:00.000Z"),
        },
      );

      expect(repaired.status).toBe("ready");
      expect(repaired.validation).toMatchObject({
        status: "passed",
        endpoint: endpointUrl,
        endpointMode: "existing-local-endpoint",
        endpointModelIds: ["local-minicpm-v"],
        summary: "repaired local endpoint analyzed the supplied image",
      });
      expect(await readFile(endpointBindingPath, "utf8")).toBe(`${endpointUrl}\n`);
      expect(requests.some((request) => request.url === "/v1/chat/completions")).toBe(true);
      await expect(readMiniCpmVisionValidationMetadata(workspace)).resolves.toMatchObject({
        status: "passed",
        endpointMode: "existing-local-endpoint",
      });
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousServer);
      restoreEnv("AMBIENT_MINICPM_V_ENDPOINT", previousEndpoint);
      await new Promise((resolveClose) => server.close(resolveClose));
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects remote existing endpoints before setup", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-remote-endpoint-"));
    try {
      await expect(
        setupMiniCpmVisionProvider(
          workspace,
          { provider: "minicpm-v", action: "validate", endpointUrl: "https://example.com" },
          {
            bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
            disableRuntimeAutoDetect: true,
          },
        ),
      ).rejects.toThrow("local-only");
      await expect(
        setupMiniCpmVisionProvider(
          workspace,
          { provider: "minicpm-v", action: "validate", endpointUrl: "https://example.com" },
          {
            bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
            disableRuntimeAutoDetect: true,
          },
        ),
      ).rejects.toThrow("allowed hosts");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("runs fake deterministic analysis through the typed adapter without raw Ambient CLI args", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-analyze-fake-"));
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    try {
      process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = "fake MiniCPM-V adapter evidence";
      await writeFile(join(workspace, "screen.png"), tinyPng());

      const result = await analyzeMiniCpmVisionInput(
        workspace,
        {
          imagePath: "screen.png",
          task: "ui_review",
          outputJsonPath: ".ambient/vision/minicpm-v/analysis/fake.json",
          startServer: false,
        },
        { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
      );

      expect(result).toMatchObject({
        provider: "minicpm-v",
        status: "passed",
        packageName: "ambient-minicpm-v-vision",
        task: "ui_review",
        summary: "fake MiniCPM-V adapter evidence",
        image: {
          path: "screen.png",
          basename: "screen.png",
        },
        redaction: {
          returnedImagePathIsWorkspaceRelative: true,
          stdoutDoesNotContainAbsoluteImagePath: true,
          artifactPathIsWorkspaceRelative: true,
        },
      });
      expect(result.commands.map((command) => command.command)).toEqual(["analyze"]);
      expect(result.observations[0]).toMatchObject({
        kind: "visual_quality",
        evidence: "screen.png",
      });

      const artifact = JSON.parse(await readFile(join(workspace, result.artifacts.jsonPath), "utf8"));
      expect(artifact.schemaValidation).toMatchObject({ valid: true, errors: [] });
      expect(artifact.parsedOutput.summary).toBe("fake MiniCPM-V adapter evidence");
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("copies approved external images into managed workspace storage before analysis", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-external-workspace-"));
    const externalRoot = await mkdtemp(join(tmpdir(), "ambient-minicpm-external-input-"));
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    try {
      process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = JSON.stringify({
        summary: "external image copied into managed storage",
        observations: [
          {
            kind: "layout",
            description: "The copied image was passed through the typed MiniCPM-V adapter.",
            confidence: "high",
            evidence: "upload.png",
          },
        ],
        limitations: ["Fake analysis mode does not inspect image pixels."],
      });
      const externalImage = join(externalRoot, "upload.png");
      await writeFile(externalImage, tinyPng());

      await expect(
        analyzeMiniCpmVisionInput(
          workspace,
          { imagePath: externalImage, startServer: false },
          { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
        ),
      ).rejects.toThrow("allowExternalImagePaths");

      const result = await analyzeMiniCpmVisionInput(
        workspace,
        {
          imagePath: externalImage,
          allowExternalImagePaths: true,
          startServer: false,
          task: "image_description",
        },
        { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
      );

      expect(result.image).toMatchObject({
        copiedFromExternalPath: true,
        basename: expect.stringContaining("upload.png"),
      });
      expect(result.image.path).toMatch(/^\.ambient\/vision\/minicpm-v\/inputs\//);
      expect(result.redaction.returnedImagePathIsWorkspaceRelative).toBe(true);
      await expect(readFile(join(workspace, result.image.path))).resolves.toEqual(tinyPng());
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      await rm(workspace, { recursive: true, force: true });
      await rm(externalRoot, { recursive: true, force: true });
    }
  });

  it("accepts structured screenshot and attachment references for comparison analysis", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-compare-fake-"));
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    try {
      process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = JSON.stringify({
        summary: "current screenshot compared with reference attachment",
        observations: [
          {
            kind: "defect",
            description: "The current screenshot differs from the reference attachment in the visible top bar spacing.",
            confidence: "medium",
            evidence: "image 1 current vs image 2 reference",
          },
        ],
        limitations: ["Fake analysis mode does not inspect image pixels."],
      });
      await writeFile(join(workspace, "current.png"), tinyPng());
      await writeFile(join(workspace, "reference.png"), tinyPng());

      const result = await analyzeMiniCpmVisionInput(
        workspace,
        {
          image: { path: "current.png", source: "browser_screenshot", label: "current" },
          referenceImage: { path: "reference.png", source: "chat_attachment", label: "reference" },
          task: "design_comparison",
          outputJsonPath: ".ambient/vision/minicpm-v/analysis/compare.json",
          startServer: false,
        },
        { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
      );

      expect(result.task).toBe("design_comparison");
      expect(result.image).toMatchObject({ path: "current.png", role: "primary", source: "browser_screenshot", label: "current" });
      expect(result.referenceImage).toMatchObject({ path: "reference.png", role: "reference", source: "chat_attachment", label: "reference" });
      expect(result.inputImages?.map((image) => image.path)).toEqual(["current.png", "reference.png"]);
      expect(result.prompt).toContain("You will receive two images in order");
      expect(result.commands.map((command) => command.command)).toEqual(["analyze"]);
      const artifact = JSON.parse(await readFile(join(workspace, result.artifacts.jsonPath), "utf8"));
      expect(artifact.images).toHaveLength(2);
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("samples a short video frame into managed storage before analysis", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-video-fake-"));
    const fakeBin = join(workspace, "bin");
    const fakeFrame = join(workspace, "fake-frame.png");
    const fakeFfmpeg = join(fakeBin, process.platform === "win32" ? "ffmpeg.cmd" : "ffmpeg");
    const previousFake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    const previousPath = process.env.PATH;
    const previousFrame = process.env.AMBIENT_FAKE_FFMPEG_FRAME;
    try {
      process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = JSON.stringify({
        summary: "sampled video frame inspected",
        observations: [
          {
            kind: "gameplay",
            description: "The sampled video frame was passed through the typed MiniCPM-V adapter.",
            confidence: "medium",
            evidence: "game clip frame 750ms",
          },
        ],
        limitations: ["Fake analysis mode does not inspect image pixels."],
      });
      process.env.PATH = `${fakeBin}${process.platform === "win32" ? ";" : ":"}${previousPath ?? ""}`;
      process.env.AMBIENT_FAKE_FFMPEG_FRAME = fakeFrame;
      await mkdir(fakeBin, { recursive: true });
      await writeFile(fakeFrame, tinyPng());
      await writeFile(join(workspace, "clip.mp4"), Buffer.from("fake mp4"));
      if (process.platform === "win32") {
        await writeFile(fakeFfmpeg, "@echo off\r\nset last=\r\n:loop\r\nif \"%~1\"==\"\" goto copy\r\nset last=%~1\r\nshift\r\ngoto loop\r\n:copy\r\ncopy /Y \"%AMBIENT_FAKE_FFMPEG_FRAME%\" \"%last%\" >NUL\r\n", "utf8");
      } else {
        await writeFile(fakeFfmpeg, "#!/bin/sh\nlast=\"\"\nfor arg in \"$@\"; do last=\"$arg\"; done\ncp \"$AMBIENT_FAKE_FFMPEG_FRAME\" \"$last\"\n", "utf8");
        await chmod(fakeFfmpeg, 0o755);
      }

      const result = await analyzeMiniCpmVisionInput(
        workspace,
        {
          video: { path: "clip.mp4", source: "chat_attachment", label: "game clip", frameTimestampMs: 750 },
          task: "video_frame_review",
          outputJsonPath: ".ambient/vision/minicpm-v/analysis/video-frame.json",
          startServer: false,
        },
        { bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages") },
      );

      expect(result.task).toBe("video_frame_review");
      expect(result.video).toMatchObject({
        path: "clip.mp4",
        source: "chat_attachment",
        label: "game clip",
        frameTimestampMs: 750,
      });
      expect(result.image).toMatchObject({
        role: "primary",
        source: "video_frame",
        label: "game clip frame 750ms",
      });
      expect(result.image.path).toMatch(/^\.ambient\/vision\/minicpm-v\/frames\//);
      expect(result.video?.frameImagePath).toBe(result.image.path);
      expect(result.sampledFrames?.map((frame) => frame.path)).toEqual([result.image.path]);
      expect(result.prompt).toContain("Frame timestamp: 750ms");
      const artifact = JSON.parse(await readFile(join(workspace, result.artifacts.jsonPath), "utf8"));
      expect(artifact.images).toHaveLength(1);
    } finally {
      restoreEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFake);
      restoreEnv("PATH", previousPath);
      restoreEnv("AMBIENT_FAKE_FFMPEG_FRAME", previousFrame);
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function tinyPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
}

async function localMiniCpmEndpoint(requests: Array<{ method?: string; url?: string; body?: any }>) {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    requests.push({ method: request.method, url: request.url, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/v1/models") {
      response.end(JSON.stringify({ data: [{ id: "local-minicpm-v", object: "model", multimodal: true }] }));
      return;
    }
    if (request.url === "/v1/chat/completions") {
      response.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "local endpoint analyzed the supplied image",
              observations: [{
                kind: "layout",
                description: "The request reached the existing local endpoint.",
                confidence: "high",
                evidence: "local endpoint fixture",
              }],
              limitations: ["Synthetic endpoint does not inspect pixels."],
            }),
          },
        }],
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local MiniCPM endpoint test server did not expose a TCP port.");
  return Object.assign(server, { port: address.port });
}

async function controllableMiniCpmEndpoint(
  requests: Array<{ method?: string; url?: string; body?: any }>,
  state: { modelsReady: boolean },
) {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    requests.push({ method: request.method, url: request.url, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/v1/models") {
      if (!state.modelsReady) {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: "models warming" }));
        return;
      }
      response.end(JSON.stringify({ data: [{ id: "local-minicpm-v", object: "model", multimodal: true }] }));
      return;
    }
    if (request.url === "/v1/chat/completions") {
      response.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "repaired local endpoint analyzed the supplied image",
              observations: [{
                kind: "layout",
                description: "The repaired endpoint accepted the validation request.",
                confidence: "high",
                evidence: "repair validation fixture",
              }],
              limitations: ["Synthetic endpoint does not inspect pixels."],
            }),
          },
        }],
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local MiniCPM endpoint test server did not expose a TCP port.");
  return Object.assign(server, { port: address.port });
}

async function localRuntimeArchiveServer(bytes: Buffer) {
  const state = { requests: 0 };
  const server = createServer((request, response) => {
    state.requests += 1;
    if (request.url !== "/llama-b9122-bin-download-test.tar.gz") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/gzip");
    response.setHeader("Content-Length", String(bytes.length));
    response.end(bytes);
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local runtime archive test server did not expose a TCP port.");
  const serverWithState = Object.assign(server, { port: address.port }) as typeof server & { port: number; requests: number };
  Object.defineProperty(serverWithState, "requests", {
    enumerable: true,
    get: () => state.requests,
  });
  return serverWithState;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function sha256Path(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function writeMiniCpmStopProofArtifact(input: {
  result: Awaited<ReturnType<typeof setupMiniCpmVisionProvider>>;
  stoppedState: any;
  validationMetadata: any;
}): Promise<void> {
  const outputPath = process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_OUT;
  if (!outputPath) return;
  const existing = await readJsonIfExists(outputPath);
  const scenario = {
    status: "passed",
    proofKind: "deterministic-minicpm-stop",
    stopped: input.result.status === "stopped" && input.stoppedState.status === "stopped",
    uninstalled: input.result.status === "uninstalled" || input.validationMetadata.status === "uninstalled",
    packageStatePreserved: Boolean(input.result.installStatuses?.some((status) =>
      status.packageName === "ambient-minicpm-v-vision" && status.status === "installed"
    )),
    running: input.validationMetadata.runtimeState?.running,
    pid: input.validationMetadata.runtimeState?.pid,
    previousPid: input.validationMetadata.runtimeState?.previousPid,
    endpoint: input.validationMetadata.endpoint,
    evidence: "MiniCPM-V stop returned stopped status, preserved installed provider package state, and kept stopped runtime residency metadata.",
  };
  const artifact = {
    schemaVersion: "ambient-local-runtime-control-proof-v1",
    updatedAt: new Date("2026-05-12T00:02:00.000Z").toISOString(),
    scenarios: {
      ...(existing?.scenarios ?? {}),
      "minicpm-nondestructive-stop": scenario,
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(path: string): Promise<any | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") return undefined;
    throw error;
  }
}
