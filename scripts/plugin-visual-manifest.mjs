import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export async function writeLiveVisualManifest({ resultsDir, screenshots, now = () => new Date() }) {
  const manifestPath = join(resultsDir, "manifest.json");
  let manifest = {
    version: 1,
    generatedAt: now().toISOString(),
    workspace: "temp-plugin-chat-refresh-live-workspace",
    compareBaselines: false,
    updateBaselines: false,
    screenshots: [],
  };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    // The live smoke can run without a preceding deterministic visual smoke.
  }

  const liveScreenshots = [];
  for (const screenshot of screenshots) {
    const scenario = scenarioFromScreenshotPath(screenshot);
    const filePath = resolveScreenshotPath(screenshot);
    liveScreenshots.push(await screenshotMetadata(filePath, scenario, { liveOnly: true }));
  }

  const nextManifest = {
    ...manifest,
    version: 1,
    generatedAt: now().toISOString(),
    liveScreenshots,
  };
  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  return nextManifest;
}

export async function writeLiveDogfoodSummary({ resultsDir, summary, now = () => new Date() }) {
  const screenshotMetadataEntries = [];
  for (const screenshot of summary.screenshots ?? []) {
    const scenario = scenarioFromScreenshotPath(screenshot);
    const filePath = resolveScreenshotPath(screenshot);
    screenshotMetadataEntries.push(await screenshotMetadata(filePath, scenario, { liveOnly: true }));
  }
  const nextSummary = {
    version: 1,
    generatedAt: now().toISOString(),
    scenarios: [...(summary.scenarios ?? [])],
    eventCounts: {
      pluginCatalogUpdated: Number(summary.pluginCatalogUpdatedCount ?? 0),
      privilegedScanUpdated: Number(summary.privilegedScanUpdatedCount ?? 0),
    },
    tools: {
      observed: [...new Set(summary.toolNames ?? [])],
      counts: countValues(summary.toolNames ?? []),
    },
    screenshots: screenshotMetadataEntries,
  };
  await writeFile(join(resultsDir, "live-dogfood-summary.json"), `${JSON.stringify(nextSummary, null, 2)}\n`, "utf8");
  return nextSummary;
}

export function scenarioFromScreenshotPath(screenshot) {
  return basename(screenshot).replace(/\.png$/i, "");
}

export async function screenshotMetadata(filePath, scenario, options = {}) {
  const [buffer, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
  const { width, height } = pngSize(buffer);
  return {
    scenario,
    file: `${scenario}.png`,
    bytes: fileStat.size,
    width,
    height,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    ...(options.liveOnly ? { liveOnly: true } : {}),
  };
}

export function pngSize(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Not a PNG file.");
  const type = buffer.subarray(12, 16).toString("ascii");
  if (type !== "IHDR") throw new Error("PNG missing IHDR chunk.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function resolveScreenshotPath(screenshot) {
  if (screenshot.startsWith("/")) return screenshot;
  return join(process.cwd(), screenshot);
}

function countValues(values) {
  const counts = {};
  for (const value of values) {
    const key = String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
