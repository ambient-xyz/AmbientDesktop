import { existsSync, readdirSync, statSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";

const execFileAsync = promisify(execFile);

export const TOOLHIVE_BUNDLED_VERSION = "v0.28.2";
export const TOOLHIVE_BUNDLE_MANIFEST_NAME = "manifest.json";
export const TOOLHIVE_RESOURCE_DIR = "toolhive";
export const TOOLHIVE_NOTICE_RESOURCE_DIR = "third-party-notices/toolhive";

export interface ToolHivePlatformInput {
  platform?: NodeJS.Platform | string;
  arch?: NodeJS.Architecture | string;
}

export interface ToolHiveExecutableResolution {
  source: "bundled" | "dev-override";
  platformId: string;
  executablePath: string;
  version: typeof TOOLHIVE_BUNDLED_VERSION;
}

export interface ResolveToolHiveExecutableOptions extends ToolHivePlatformInput {
  resourcesPath?: string;
  env?: NodeJS.ProcessEnv;
  allowDevOverride?: boolean;
}

export interface ResolveOrExtractToolHiveExecutableOptions extends ResolveToolHiveExecutableOptions {
  extractionRoot?: string;
}

export interface ToolHiveVersionResult {
  executablePath: string;
  stdout: string;
  versionLine: string;
}

export function toolHivePlatformId(input: ToolHivePlatformInput = {}): string {
  const platform = normalizeToolHivePlatform(input.platform ?? process.platform);
  const arch = normalizeToolHiveArch(input.arch ?? process.arch);
  return `${platform}-${arch}`;
}

export function toolHiveExecutableName(platform: NodeJS.Platform | string = process.platform): string {
  return normalizeToolHivePlatform(platform) === "win32" ? "thv.exe" : "thv";
}

export function resolveToolHiveExecutable(options: ResolveToolHiveExecutableOptions = {}): ToolHiveExecutableResolution {
  const platform = normalizeToolHivePlatform(options.platform ?? process.platform);
  const platformId = toolHivePlatformId({ platform, arch: options.arch ?? process.arch });
  const env = options.env ?? process.env;
  const override = env.AMBIENT_TOOLHIVE_BINARY?.trim() || env.TOOLHIVE_DEV_BINARY?.trim();
  if (override && options.allowDevOverride !== false) {
    const executablePath = resolve(override);
    assertExecutableFile(executablePath, "ToolHive dev override");
    return { source: "dev-override", platformId, executablePath, version: TOOLHIVE_BUNDLED_VERSION };
  }

  const executableName = toolHiveExecutableName(platform);
  const candidates = toolHiveResourceRootCandidates(options.resourcesPath).map((root) => join(root, platformId, executableName));
  const executablePath = candidates.find((candidate) => existsAsFile(candidate));
  if (!executablePath) {
    throw new Error(
      `Bundled ToolHive binary is missing for ${platformId}. Checked: ${candidates.join(", ")}. ` +
      "Packaged builds extract thv from the bundled release archive during electron-builder afterPack; development builds can set AMBIENT_TOOLHIVE_BINARY.",
    );
  }
  assertExecutableFile(executablePath, "Bundled ToolHive binary");
  return { source: "bundled", platformId, executablePath, version: TOOLHIVE_BUNDLED_VERSION };
}

export async function resolveOrExtractToolHiveExecutable(options: ResolveOrExtractToolHiveExecutableOptions = {}): Promise<ToolHiveExecutableResolution> {
  try {
    return resolveToolHiveExecutable(options);
  } catch (error) {
    const env = options.env ?? process.env;
    const override = env.AMBIENT_TOOLHIVE_BINARY?.trim() || env.TOOLHIVE_DEV_BINARY?.trim();
    if (override && options.allowDevOverride !== false) throw error;
    if (!options.extractionRoot?.trim()) throw error;

    const platform = normalizeToolHivePlatform(options.platform ?? process.platform);
    const arch = normalizeToolHiveArch(options.arch ?? process.arch);
    const platformId = toolHivePlatformId({ platform, arch });
    const executableName = toolHiveExecutableName(platform);
    const archive = toolHiveArchiveCandidates(options.resourcesPath, platformId, platform, arch).find((candidate) => existsAsFile(candidate));
    if (!archive) throw error;

    const extractionRoot = resolve(options.extractionRoot);
    const destination = join(extractionRoot, platformId);
    const executablePath = join(destination, executableName);
    if (existsAsFile(executablePath)) {
      await chmod(executablePath, 0o755);
      assertExecutableFile(executablePath, "Extracted ToolHive binary");
      return { source: "bundled", platformId, executablePath, version: TOOLHIVE_BUNDLED_VERSION };
    }

    const staging = join(extractionRoot, `${platformId}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    try {
      await extractToolHiveArchive(archive, staging, executableName);
      const extractedExecutable = findToolHiveExecutable(staging, executableName);
      if (!extractedExecutable) throw new Error(`ToolHive archive did not contain ${executableName}: ${archive}`);
      await chmod(extractedExecutable, 0o755);
      const stagingExecutablePath = join(staging, executableName);
      if (extractedExecutable !== stagingExecutablePath) await rename(extractedExecutable, stagingExecutablePath);
      await mkdir(extractionRoot, { recursive: true });
      await rm(destination, { recursive: true, force: true });
      await rename(staging, destination);
    } catch (extractError) {
      await rm(staging, { recursive: true, force: true });
      throw extractError;
    }

    assertExecutableFile(executablePath, "Extracted ToolHive binary");
    return { source: "bundled", platformId, executablePath, version: TOOLHIVE_BUNDLED_VERSION };
  }
}

export async function readBundledToolHiveVersion(options: ResolveOrExtractToolHiveExecutableOptions = {}): Promise<ToolHiveVersionResult> {
  const resolution = await resolveOrExtractToolHiveExecutable(options);
  const { stdout } = await execFileAsync(resolution.executablePath, ["version"], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  const versionLine = stdout.split(/\r?\n/).find((line) => line.trim().startsWith("ToolHive "))?.trim() ?? "";
  if (!versionLine.includes(TOOLHIVE_BUNDLED_VERSION)) {
    throw new Error(`Bundled ToolHive version mismatch. Expected ${TOOLHIVE_BUNDLED_VERSION}, got ${versionLine || "no version line"}.`);
  }
  return {
    executablePath: resolution.executablePath,
    stdout,
    versionLine,
  };
}

export function toolHiveNoticePaths(resourcesPath?: string): { licensePath: string; noticePath: string }[] {
  return resourcesRootCandidates(resourcesPath).map((root) => ({
    licensePath: join(root, TOOLHIVE_NOTICE_RESOURCE_DIR, "LICENSE"),
    noticePath: join(root, TOOLHIVE_NOTICE_RESOURCE_DIR, "NOTICE"),
  }));
}

export function resolveToolHiveNoticePaths(resourcesPath?: string): { licensePath: string; noticePath: string } {
  const found = toolHiveNoticePaths(resourcesPath).find(({ licensePath, noticePath }) => existsAsFile(licensePath) && existsAsFile(noticePath));
  if (!found) {
    throw new Error(`Bundled ToolHive license/notice files are missing. Checked: ${toolHiveNoticePaths(resourcesPath).map((entry) => `${entry.licensePath}, ${entry.noticePath}`).join("; ")}`);
  }
  return found;
}

export function toolHiveManifestPath(resourcesPath?: string): string {
  const candidates = toolHiveResourceRootCandidates(resourcesPath).map((root) => join(root, TOOLHIVE_BUNDLE_MANIFEST_NAME));
  const found = candidates.find((candidate) => existsAsFile(candidate));
  if (!found) throw new Error(`Bundled ToolHive manifest is missing. Checked: ${candidates.join(", ")}`);
  return found;
}

function normalizeToolHivePlatform(platform: NodeJS.Platform | string): string {
  if (platform === "darwin" || platform === "linux" || platform === "win32") return platform;
  throw new Error(`Unsupported ToolHive bundle platform: ${platform}`);
}

function normalizeToolHiveArch(arch: NodeJS.Architecture | string): string {
  if (arch === "arm64") return "arm64";
  if (arch === "x64" || arch === "amd64") return "x64";
  throw new Error(`Unsupported ToolHive bundle architecture: ${arch}`);
}

function toolHiveResourceRootCandidates(resourcesPath?: string): string[] {
  return resourcesRootCandidates(resourcesPath).map((root) => join(root, TOOLHIVE_RESOURCE_DIR));
}

function toolHiveArchiveCandidates(
  resourcesPath: string | undefined,
  platformId: string,
  platform: string,
  arch: string,
): string[] {
  const version = TOOLHIVE_BUNDLED_VERSION.replace(/^v/, "");
  const releaseArch = arch === "x64" ? "amd64" : arch;
  const releasePlatform = platform === "win32" ? "windows" : platform;
  const deterministicName = `toolhive_${version}_${releasePlatform}_${releaseArch}${platform === "win32" ? ".zip" : ".tar.gz"}`;
  const candidates = toolHiveResourceRootCandidates(resourcesPath).flatMap((root) => {
    const platformRoot = join(root, platformId);
    const deterministic = join(platformRoot, deterministicName);
    let discovered: string[] = [];
    try {
      discovered = readdirSync(platformRoot)
        .filter((entry) => entry.endsWith(".tar.gz") || entry.endsWith(".zip"))
        .map((entry) => join(platformRoot, entry));
    } catch {
      discovered = [];
    }
    return [deterministic, ...discovered];
  });
  return [...new Set(candidates.map((candidate) => resolve(candidate)))];
}

async function extractToolHiveArchive(archive: string, destination: string, executableName: string): Promise<void> {
  if (archive.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(await readFile(archive));
    const executableEntry = Object.values(zip.files).find((entry) =>
      !entry.dir && zipPathBasename(entry.name) === executableName
    );
    if (!executableEntry) throw new Error(`ToolHive zip archive did not contain ${executableName}: ${archive}`);
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, executableName), await executableEntry.async("nodebuffer"), { mode: 0o755 });
    return;
  }

  await execFileAsync("tar", ["-xzf", archive, "-C", destination], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
}

function zipPathBasename(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "";
}

function resourcesRootCandidates(resourcesPath?: string): string[] {
  const candidates = [
    resourcesPath,
    typeof process.resourcesPath === "string" ? process.resourcesPath : undefined,
    join(process.cwd(), "resources"),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));
  return [...new Set(candidates.map((candidate) => resolve(candidate)))];
}

function assertExecutableFile(path: string, label: string): void {
  if (!existsAsFile(path)) throw new Error(`${label} does not exist: ${path}`);
  if (process.platform !== "win32" && (statSync(path).mode & 0o111) === 0) {
    throw new Error(`${label} is not executable: ${path}`);
  }
}

function existsAsFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function findToolHiveExecutable(root: string, executableName: string, depth = 0): string | undefined {
  const direct = join(root, executableName);
  if (existsAsFile(direct)) return direct;
  if (depth >= 2) return undefined;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const path = join(root, entry);
    try {
      if (statSync(path).isDirectory()) {
        const found = findToolHiveExecutable(path, executableName, depth + 1);
        if (found) return found;
      }
    } catch {
      // Ignore unreadable archive entries.
    }
  }
  return undefined;
}
