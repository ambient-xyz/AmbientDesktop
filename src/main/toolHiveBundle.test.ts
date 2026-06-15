import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  TOOLHIVE_BUNDLED_VERSION,
  readBundledToolHiveVersion,
  resolveOrExtractToolHiveExecutable,
  resolveToolHiveExecutable,
  resolveToolHiveNoticePaths,
  toolHiveExecutableName,
  toolHiveManifestPath,
  toolHivePlatformId,
} from "./toolHiveBundle";

const execFileAsync = promisify(execFile);
const itIfHostCanRunPosixShim = process.platform === "win32" ? it.skip : it;

describe("ToolHive bundle resolution", () => {
  it("maps Ambient-supported platforms to resource ids and executable names", () => {
    expect(toolHivePlatformId({ platform: "darwin", arch: "arm64" })).toBe("darwin-arm64");
    expect(toolHivePlatformId({ platform: "darwin", arch: "x64" })).toBe("darwin-x64");
    expect(toolHivePlatformId({ platform: "linux", arch: "amd64" })).toBe("linux-x64");
    expect(toolHiveExecutableName("win32")).toBe("thv.exe");
    expect(toolHiveExecutableName("darwin")).toBe("thv");
  });

  it("resolves bundled binaries, manifest, and notices from a resources root", async () => {
    const resources = await fakeToolHiveResources();

    const resolved = resolveToolHiveExecutable({
      resourcesPath: resources,
      platform: "darwin",
      arch: "arm64",
      allowDevOverride: false,
    });

    expect(resolved).toMatchObject({
      source: "bundled",
      platformId: "darwin-arm64",
      version: TOOLHIVE_BUNDLED_VERSION,
    });
    expect(resolved.executablePath).toBe(join(resources, "toolhive", "darwin-arm64", "thv"));
    expect(toolHiveManifestPath(resources)).toBe(join(resources, "toolhive", "manifest.json"));
    expect(resolveToolHiveNoticePaths(resources)).toEqual({
      licensePath: join(resources, "third-party-notices", "toolhive", "LICENSE"),
      noticePath: join(resources, "third-party-notices", "toolhive", "NOTICE"),
    });
  });

  it("allows an explicit dev override without exposing raw thv lookup", async () => {
    const resources = await fakeToolHiveResources();
    const override = join(resources, "custom-thv");
    await writeFile(override, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
    await chmod(override, 0o755);

    expect(resolveToolHiveExecutable({
      resourcesPath: join(resources, "missing"),
      env: { AMBIENT_TOOLHIVE_BINARY: override } as NodeJS.ProcessEnv,
      platform: "darwin",
      arch: "arm64",
    })).toMatchObject({
      source: "dev-override",
      executablePath: override,
    });
  });

  itIfHostCanRunPosixShim("reads and verifies the bundled ToolHive version", async () => {
    const resources = await fakeToolHiveResources();

    await expect(readBundledToolHiveVersion({
      resourcesPath: resources,
      platform: "darwin",
      arch: "arm64",
      allowDevOverride: false,
    })).resolves.toMatchObject({
      versionLine: `ToolHive ${TOOLHIVE_BUNDLED_VERSION}`,
    });
  });

  itIfHostCanRunPosixShim("extracts bundled release archives for development resources", async () => {
    const resources = await fakeToolHiveArchiveResources();
    const extractionRoot = join(tmpdir(), `ambient-toolhive-extract-${Date.now()}-${Math.random().toString(16).slice(2)}`);

    const resolved = await resolveOrExtractToolHiveExecutable({
      resourcesPath: resources,
      extractionRoot,
      platform: "darwin",
      arch: "arm64",
      allowDevOverride: false,
    });

    expect(resolved).toMatchObject({
      source: "bundled",
      platformId: "darwin-arm64",
      executablePath: join(extractionRoot, "darwin-arm64", "thv"),
    });
    await expect(readBundledToolHiveVersion({
      resourcesPath: join(resources, "missing"),
      extractionRoot,
      platform: "darwin",
      arch: "arm64",
      allowDevOverride: false,
    })).resolves.toMatchObject({
      versionLine: `ToolHive ${TOOLHIVE_BUNDLED_VERSION}`,
    });
  });

  it("extracts pinned Windows zip archives without requiring a checked-in executable", async () => {
    const resources = await fakeToolHiveZipArchiveResources();
    const extractionRoot = join(tmpdir(), `ambient-toolhive-zip-extract-${Date.now()}-${Math.random().toString(16).slice(2)}`);

    const resolved = await resolveOrExtractToolHiveExecutable({
      resourcesPath: resources,
      extractionRoot,
      platform: "win32",
      arch: "x64",
      allowDevOverride: false,
    });

    expect(resolved).toMatchObject({
      source: "bundled",
      platformId: "win32-x64",
      executablePath: join(extractionRoot, "win32-x64", "thv.exe"),
    });
    await expect(readFile(resolved.executablePath, "utf8")).resolves.toContain("ToolHive v0.28.2");
  });
});

async function fakeToolHiveResources(): Promise<string> {
  const root = join(tmpdir(), `ambient-toolhive-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const binDir = join(root, "toolhive", "darwin-arm64");
  const notices = join(root, "third-party-notices", "toolhive");
  await mkdir(binDir, { recursive: true });
  await mkdir(notices, { recursive: true });
  await writeFile(join(root, "toolhive", "manifest.json"), JSON.stringify({ schemaVersion: "ambient-toolhive-bundle-manifest-v1" }), "utf8");
  await writeFile(join(notices, "LICENSE"), "Apache License 2.0\n", "utf8");
  await writeFile(join(notices, "NOTICE"), "ToolHive notice\n", "utf8");
  await writeFile(join(binDir, "thv"), "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(join(binDir, "thv"), 0o755);
  return root;
}

async function fakeToolHiveArchiveResources(): Promise<string> {
  const root = join(tmpdir(), `ambient-toolhive-archive-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const platformDir = join(root, "toolhive", "darwin-arm64");
  const archiveSource = join(root, "archive-source");
  await mkdir(platformDir, { recursive: true });
  await mkdir(archiveSource, { recursive: true });
  await writeFile(join(root, "toolhive", "manifest.json"), JSON.stringify({ schemaVersion: "ambient-toolhive-bundle-manifest-v1" }), "utf8");
  await writeFile(join(archiveSource, "thv"), "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(join(archiveSource, "thv"), 0o755);
  await execFileAsync("tar", ["-czf", join(platformDir, "toolhive_0.28.2_darwin_arm64.tar.gz"), "-C", archiveSource, "thv"]);
  return root;
}

async function fakeToolHiveZipArchiveResources(): Promise<string> {
  const root = join(tmpdir(), `ambient-toolhive-zip-archive-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const platformDir = join(root, "toolhive", "win32-x64");
  await mkdir(platformDir, { recursive: true });
  await writeFile(join(root, "toolhive", "manifest.json"), JSON.stringify({ schemaVersion: "ambient-toolhive-bundle-manifest-v1" }), "utf8");
  const zip = new JSZip();
  zip.file("toolhive/thv.exe", "ToolHive v0.28.2\n");
  await writeFile(join(platformDir, "toolhive_0.28.2_windows_amd64.zip"), await zip.generateAsync({ type: "nodebuffer" }));
  return root;
}
