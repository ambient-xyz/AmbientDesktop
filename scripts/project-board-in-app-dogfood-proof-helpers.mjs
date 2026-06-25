import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

export function createProjectBoardDogfoodArtifactHelpers({ runRoot }) {
  return { captureDogfoodScreenshot };

  async function captureDogfoodScreenshot(cdp, filename) {
    const screenshotDir = join(runRoot, "screenshots");
    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, filename);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    const screenshotAnalysis = analyzePng(await readFile(screenshotPath));
    assert(
      screenshotAnalysis.width >= 1200 && screenshotAnalysis.height >= 800,
      `Expected large screenshot, got ${screenshotAnalysis.width}x${screenshotAnalysis.height}.`,
    );
    assert(
      screenshotAnalysis.nonBlackRatio > 0.5 && screenshotAnalysis.distinctColorCount > 16,
      `Expected readable nonblank screenshot, got ${JSON.stringify(screenshotAnalysis)}.`,
    );
    return {
      path: screenshotPath.replace(`${runRoot}/`, ""),
      ...screenshotAnalysis,
    };
  }
}

export function expectedCardStatusForReview(status) {
  if (status === "done") return "done";
  if (status === "ready_for_review") return "review";
  return "blocked";
}

export function expectedTaskStateForReview(status) {
  if (status === "done") return "done";
  if (status === "ready_for_review") return "needs_review";
  if (status === "terminally_blocked") return "terminal_blocker";
  return "needs_info";
}

export function isReadableVisualProofArtifact(artifact) {
  return artifact?.width >= 800 && artifact?.height >= 600 && artifact?.nonBlackPixels > 0 && artifact?.distinctColorCount > 1;
}

export function taskActionObservation(proofOfWork) {
  const actions = [proofOfWork?.taskToolActions, proofOfWork?.taskActions, proofOfWork?.modelTaskActions]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((action) => action && typeof action === "object" && typeof action.action === "string" && action.action.startsWith("task_"));
  const countsByAction = {};
  for (const action of actions) countsByAction[action.action] = (countsByAction[action.action] ?? 0) + 1;
  const terminalActionIndex = actions.findIndex((action) =>
    ["task_report_proof", "task_complete", "task_block", "task_create_followup", "task_report_handoff"].includes(action.action),
  );
  const heartbeatIndex = actions.findIndex((action) => action.action === "task_heartbeat");
  const terminalActions = actions.filter((action) =>
    ["task_report_proof", "task_complete", "task_block", "task_create_followup", "task_report_handoff"].includes(action.action),
  );
  const onlyContextAndHeartbeat =
    actions.length > 0 && actions.every((action) => action.action === "task_show" || action.action === "task_heartbeat");
  const protocolMissing = [];
  if (actions.length === 0) protocolMissing.push("any_task_action");
  if ((countsByAction.task_heartbeat ?? 0) <= 0) protocolMissing.push("task_heartbeat");
  if (terminalActions.length === 0) protocolMissing.push("terminal_task_action");
  if (onlyContextAndHeartbeat) protocolMissing.push("proof_block_complete_followup_or_handoff");
  return {
    count: actions.length,
    countsByAction,
    heartbeatCount: countsByAction.task_heartbeat ?? 0,
    proofActionCount: countsByAction.task_report_proof ?? 0,
    completeActionCount: countsByAction.task_complete ?? 0,
    blockActionCount: countsByAction.task_block ?? 0,
    followUpActionCount: countsByAction.task_create_followup ?? 0,
    handoffActionCount: countsByAction.task_report_handoff ?? 0,
    terminalActionCount: terminalActions.length,
    terminalActionNames: [...new Set(terminalActions.map((action) => action.action))],
    firstAction: actions[0]?.action,
    onlyContextAndHeartbeat,
    heartbeatBeforeTerminal: heartbeatIndex >= 0 && terminalActionIndex >= 0 && heartbeatIndex < terminalActionIndex,
    protocolSatisfied: protocolMissing.length === 0,
    protocolMissing,
    actions: actions.map((action) => ({
      actionId: action.actionId,
      action: action.action,
      createdAt: action.createdAt,
      summary: action.summary ?? action.reason ?? action.title,
      changedFiles: Array.isArray(action.changedFiles) ? action.changedFiles.length : 0,
      commands: Array.isArray(action.commands) ? action.commands.length : 0,
      screenshots: Array.isArray(action.screenshots) ? action.screenshots.length : 0,
      visualChecks: Array.isArray(action.visualChecks) ? action.visualChecks.length : 0,
      manualChecks: Array.isArray(action.manualChecks) ? action.manualChecks.length : 0,
    })),
  };
}

export async function collectVisualProofArtifacts(roots) {
  const rootList = Array.isArray(roots) ? roots : [roots];
  const fileMap = new Map();
  for (const root of rootList.filter(Boolean)) {
    const screenshotRoot = join(root, ".ambient-codex", "browser", "screenshots");
    for (const file of await listPngFiles(screenshotRoot)) {
      fileMap.set(file.path, { ...file, root });
    }
  }
  const files = [...fileMap.values()];
  const artifacts = [];
  for (const file of files) {
    try {
      artifacts.push({ path: file.path, mtimeMs: file.mtimeMs, ...analyzePng(await readFile(file.path)) });
    } catch (error) {
      artifacts.push({
        path: file.path,
        mtimeMs: file.mtimeMs,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return artifacts
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, 5)
    .map((artifact) => {
      const displayArtifact = { ...artifact };
      delete displayArtifact.mtimeMs;
      const matchingRoot = rootList.find((root) => displayArtifact.path.startsWith(`${root}/`));
      return { ...displayArtifact, path: matchingRoot ? displayArtifact.path.replace(`${matchingRoot}/`, "") : displayArtifact.path };
    });
}

async function listPngFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listPngFiles(path)));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) continue;
    const info = await stat(path);
    files.push({ path, mtimeMs: info.mtimeMs });
  }
  return files;
}

export function analyzePng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Not a PNG file.");
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height) throw new Error("PNG missing IHDR dimensions.");
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}.`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowStride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idatChunks));
  let rawOffset = 0;
  let previousRow = Buffer.alloc(rowStride);
  let nonBlackPixels = 0;
  const distinctColors = new Set();
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const row = Buffer.from(raw.subarray(rawOffset, rawOffset + rowStride));
    rawOffset += rowStride;
    unfilterPngRow(row, previousRow, bytesPerPixel, filter);
    for (let x = 0; x < rowStride; x += bytesPerPixel) {
      const red = row[x];
      const green = row[x + 1];
      const blue = row[x + 2];
      const alpha = bytesPerPixel === 4 ? row[x + 3] : 255;
      if (alpha > 0 && (red > 8 || green > 8 || blue > 8)) nonBlackPixels += 1;
      if (distinctColors.size < 128) distinctColors.add(`${red},${green},${blue},${alpha}`);
    }
    previousRow = row;
  }
  const totalPixels = width * height;
  return {
    width,
    height,
    colorType,
    totalPixels,
    nonBlackPixels,
    nonBlackRatio: Number((nonBlackPixels / totalPixels).toFixed(6)),
    distinctColorCount: distinctColors.size,
  };
}

function unfilterPngRow(row, previousRow, bytesPerPixel, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previousRow[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previousRow[index - bytesPerPixel] : 0;
    if (filter === 0) {
      continue;
    } else if (filter === 1) {
      row[index] = (row[index] + left) & 0xff;
    } else if (filter === 2) {
      row[index] = (row[index] + up) & 0xff;
    } else if (filter === 3) {
      row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      row[index] = (row[index] + paethPredictor(left, up, upLeft)) & 0xff;
    } else {
      throw new Error(`Unsupported PNG row filter: ${filter}.`);
    }
  }
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

export function meaningfulProofChangedPaths(proof) {
  if (!proof || typeof proof !== "object") return [];
  const paths = [];
  const push = (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) paths.push(trimmed.replace(/^[MADRCU?! ]+\s+/, ""));
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    if (typeof value.path === "string") paths.push(value.path.trim());
    else if (typeof value.file === "string") paths.push(value.file.trim());
  };
  if (Array.isArray(proof.changedFiles)) proof.changedFiles.forEach(push);
  if (Array.isArray(proof.gitStatus)) proof.gitStatus.forEach(push);
  if (typeof proof.diff === "string") {
    for (const match of proof.diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) {
      paths.push(match[1], match[2]);
    }
  }
  return [...new Set(paths.filter(isMeaningfulChangedPath))];
}

export async function gitStatusForWorkspace(workspacePath) {
  const { stdout } = await runCommand("git", ["status", "--short"], workspacePath);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function meaningfulPathsFromGitStatus(lines) {
  return [...new Set(lines.map((line) => line.replace(/^[MADRCU?! ]+\s+/, "")).filter(isMeaningfulChangedPath))];
}

function isMeaningfulChangedPath(path) {
  const normalized = path
    .replace(/\\/g, "/")
    .replace(/^"+|"+$/g, "")
    .replace(/^\.\/+/, "");
  if (!normalized) return false;
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) return false;
  if (normalized.includes("/.git/") || normalized.startsWith(".git/")) return false;
  if (normalized.includes("/.ambient/") || normalized.startsWith(".ambient/")) return false;
  if (normalized.includes("/.ambient-codex/") || normalized.startsWith(".ambient-codex/")) return false;
  if (normalized.includes("/.vite/") || normalized.startsWith(".vite/")) return false;
  if (/(^|\/)\.DS_Store$/.test(normalized)) return false;
  return true;
}

async function runCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${code}: ${stderr || stdout}`));
    });
  });
}
