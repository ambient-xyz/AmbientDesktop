#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import JSZip from "jszip";

const expectedVersion = "v0.28.2";
const args = parseArgs(process.argv.slice(2));
const resourcesRoot = resolve(args.resources || "resources");
const platform = normalizePlatform(args.platform || process.platform);
const arch = normalizeArch(args.arch || process.arch);
const platformId = `${platform}-${arch}`;
const executableName = platform === "win32" ? "thv.exe" : "thv";
const toolhiveRoot = join(resourcesRoot, "toolhive");
const executable = join(toolhiveRoot, platformId, executableName);
const manifestPath = join(toolhiveRoot, "manifest.json");
const licensePath = join(resourcesRoot, "third-party-notices", "toolhive", "LICENSE");
const noticePath = join(resourcesRoot, "third-party-notices", "toolhive", "NOTICE");

assertFile(manifestPath, "ToolHive manifest");
assertFile(licensePath, "ToolHive license");
assertFile(noticePath, "ToolHive notice");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.schemaVersion !== "ambient-toolhive-bundle-manifest-v1") {
  throw new Error(`Unexpected ToolHive manifest schemaVersion: ${manifest.schemaVersion}`);
}
if (manifest.toolhiveVersion !== expectedVersion) {
  throw new Error(`Unexpected ToolHive manifest version: ${manifest.toolhiveVersion}`);
}
const asset = Array.isArray(manifest.assets) ? manifest.assets.find((entry) => entry.platformId === platformId) : undefined;
if (!asset) throw new Error(`ToolHive manifest does not declare ${platformId}.`);
if (!existsSync(executable)) {
  const archive = join(toolhiveRoot, asset.archivePath || `${platformId}/${asset.archiveName}`);
  assertFile(archive, "ToolHive archive");
  if (asset.archiveSha256 && asset.archiveSha256 !== sha256File(archive)) {
    throw new Error(`ToolHive archive checksum mismatch for ${platformId}.`);
  }
  await extractToolHiveArchive(archive, join(toolhiveRoot, platformId), executableName);
}
assertFile(executable, "ToolHive binary");
if (platform !== "win32") chmodSync(executable, statSync(executable).mode | 0o755);
if (asset.binarySha256 && asset.binarySha256 !== sha256File(executable)) {
  throw new Error(`ToolHive binary checksum mismatch for ${platformId}.`);
}

const version = spawnSync(executable, ["version"], { encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 });
if (version.error) throw version.error;
if (version.status !== 0) throw new Error(`ToolHive version failed with exit code ${version.status}: ${version.stderr || version.stdout}`);
if (!version.stdout.includes(`ToolHive ${expectedVersion}`)) {
  throw new Error(`ToolHive version output did not include ${expectedVersion}: ${version.stdout}`);
}

console.log(`Verified bundled ToolHive ${expectedVersion} for ${platformId}: ${executable}`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--resources") parsed.resources = values[++index];
    else if (value === "--platform") parsed.platform = values[++index];
    else if (value === "--arch") parsed.arch = values[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

function normalizePlatform(platform) {
  if (["darwin", "linux", "win32"].includes(platform)) return platform;
  throw new Error(`Unsupported ToolHive bundle platform: ${platform}`);
}

function normalizeArch(arch) {
  if (arch === "arm64") return "arm64";
  if (arch === "x64" || arch === "amd64") return "x64";
  throw new Error(`Unsupported ToolHive bundle arch: ${arch}`);
}

function assertFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`${label} missing: ${path}`);
}

async function extractToolHiveArchive(archive, destination, executableName) {
  if (archive.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(readFileSync(archive));
    const executableEntry = Object.values(zip.files).find((entry) =>
      !entry.dir && zipPathBasename(entry.name) === executableName
    );
    if (!executableEntry) throw new Error(`ToolHive zip archive did not contain ${executableName}: ${archive}`);
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, executableName), await executableEntry.async("nodebuffer"));
    return;
  }

  const extractor = spawnSync("tar", ["-xzf", archive, "-C", destination, executableName], { encoding: "utf8" });
  if (extractor.error) throw extractor.error;
  if (extractor.status !== 0) {
    throw new Error(`Failed to extract ToolHive archive ${archive}: ${extractor.stderr || extractor.stdout}`);
  }
}

function zipPathBasename(path) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || "";
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
