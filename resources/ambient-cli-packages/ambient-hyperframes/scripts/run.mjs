#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { arch, platform } from "node:os";

const packageName = "ambient-hyperframes";
const capabilityId = "hyperframes-authored-motion";
const minNodeMajor = 22;
const defaultDuration = 3;
const defaultFps = 30;
const maxLogPreviewChars = 4000;

main();

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    switch (options.command) {
      case "doctor":
        writeJson(doctorPayload(options));
        return;
      case "setup-plan":
        writeJson(setupPlanPayload(options));
        return;
      case "init":
        writeJson(initProject(options));
        return;
      case "inspect":
        writeJson(inspectComposition(options));
        return;
      case "render":
        writeJson(renderComposition(options));
        return;
      case "help":
        process.stdout.write(helpText());
        return;
      default:
        throw new Error(`Unknown command: ${options.command}`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

function doctorPayload(options = {}) {
  const fakeRender = process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER === "1" || options.fakeRender === true;
  const nodeMajor = Number(process.versions.node.split(".")[0] ?? 0);
  const node = {
    id: "node",
    label: "Node.js",
    required: `>=${minNodeMajor}`,
    status: nodeMajor >= minNodeMajor ? "ready" : "missingNode",
    version: process.version,
    detail: nodeMajor >= minNodeMajor ? "Current Node.js runtime satisfies HyperFrames' documented baseline." : `HyperFrames needs Node.js ${minNodeMajor} or newer.`,
  };
  const npx = commandCheck("npx", ["--version"], { id: "npx", label: "npx", missingStatus: "missingNode" });
  const ffmpeg = commandCheck("ffmpeg", ["-version"], { id: "ffmpeg", label: "FFmpeg", missingStatus: "missingFfmpeg" });
  const ffprobe = commandCheck("ffprobe", ["-version"], { id: "ffprobe", label: "FFprobe", missingStatus: "missingFfmpeg" });
  const checks = [node, npx, ffmpeg, ffprobe];

  if (fakeRender) {
    checks.push({
      id: "test-render-hook",
      label: "Deterministic test render hook",
      status: "ready",
      detail: "AMBIENT_HYPERFRAMES_FAKE_RENDER=1 is set; render writes deterministic test artifacts without host media dependencies.",
    });
  } else if (!options.fast) {
    const hyperframesCli = hyperframesCliCheck();
    checks.push(hyperframesCli);
    checks.push(
      hyperframesCli.status === "ready"
        ? browserCheck()
        : {
            id: "browser-runtime",
            label: "Chrome/headless browser runtime",
            status: "skipped",
            detail: "Browser runtime check requires an installed HyperFrames CLI; resolve the CLI setup action first.",
          },
    );
  } else {
    checks.push({
      id: "hyperframes-cli",
      label: "HyperFrames CLI",
      status: "skipped",
      detail: "Fast health check does not invoke npx hyperframes because npx may resolve packages or inspect caches.",
    });
    checks.push({
      id: "browser-runtime",
      label: "Chrome/headless browser runtime",
      status: "skipped",
      detail: "Fast health check does not inspect or download browser runtime assets.",
    });
  }

  const blocking = checks.filter((check) => blockingStatus(check.status));
  const ready = blocking.length === 0 || fakeRender;
  return {
    packageName,
    capabilityId,
    status: ready ? "ready" : primaryBlockedState(blocking),
    ready,
    nonMutating: true,
    platform: { os: platform(), arch: arch() },
    checks,
    setup: setupActions(blocking.map((check) => check.status)),
    artifactContract: artifactContract(),
  };
}

function setupPlanPayload(options = {}) {
  const doctor = doctorPayload({ ...options, fast: false });
  return {
    packageName,
    capabilityId,
    status: doctor.ready ? "ready" : doctor.status,
    ready: doctor.ready,
    approvalRequired: true,
    mutationPerformed: false,
    reason: doctor.ready
      ? "HyperFrames dependencies appear ready. No setup action is required."
      : "One or more local runtime dependencies are missing or not currently discoverable.",
    checks: doctor.checks,
    actions: setupActions(doctor.checks.map((check) => check.status)),
    safety: [
      "This command never installs dependencies.",
      "Run installer commands only after explicit user approval.",
      "Record installer stdout/stderr as workspace artifacts if a repair command is approved later.",
    ],
  };
}

function initProject(options) {
  const workspace = workspaceRoot();
  const projectDir = ensureInsideWorkspace(resolve(workspace, options.projectDir || "hyperframes-scene"));
  const sourcePath = join(projectDir, "comp.html");
  const metadataPath = join(projectDir, "hyperframes.json");
  const packageJsonPath = join(projectDir, "package.json");
  mkdirSync(projectDir, { recursive: true });
  const title = options.title || "Ambient HyperFrames";
  const subtitle = options.subtitle || "Deterministic HTML motion rendered to video.";
  const duration = positiveNumber(options.duration, "duration", defaultDuration);
  const fps = positiveInteger(options.fps, "fps", defaultFps);
  const width = positiveInteger(options.width, "width", 1280);
  const height = positiveInteger(options.height, "height", 720);
  writeFileSync(sourcePath, scaffoldHtml({ title, subtitle, duration, fps, width, height }), "utf8");
  writeFileSync(
    metadataPath,
    `${JSON.stringify(
      {
        schemaVersion: "ambient-hyperframes-project-v1",
        source: "comp.html",
        createdBy: packageName,
        width,
        height,
        duration,
        fps,
        artifactContract: artifactContract(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify(
      {
        private: true,
        scripts: {
          inspect: "hyperframes inspect comp.html --json",
          render: "hyperframes render comp.html --out renders/output.mp4",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return {
    packageName,
    capabilityId,
    status: "initialized",
    projectDir,
    sourcePath,
    metadataPath,
    packageJsonPath,
    next: [
      "Edit comp.html for the desired authored-motion scene.",
      "Run hyperframes_inspect with --source comp.html.",
      "Run hyperframes_doctor before the first real render.",
      "Run hyperframes_render with --source comp.html --output .ambient/hyperframes/renders/title-card.mp4 after dependencies are ready.",
    ],
  };
}

function inspectComposition(options) {
  const sourcePath = resolveSourcePath(options);
  const source = readFileSync(sourcePath, "utf8");
  const rootTag = firstTagWithDimensions(source);
  const dimensions = rootTag ? dimensionsFromTag(rootTag) : {};
  const checks = [
    {
      id: "source-exists",
      status: "passed",
      detail: `Read ${Buffer.byteLength(source)} bytes from ${sourcePath}.`,
    },
    {
      id: "root-dimensions",
      status: dimensions.width && dimensions.height ? "passed" : "warning",
      detail: dimensions.width && dimensions.height ? `Root declares ${dimensions.width}x${dimensions.height}.` : "No root element with data-width and data-height was found.",
    },
    {
      id: "duration",
      status: dimensions.duration ? "passed" : "warning",
      detail: dimensions.duration ? `Root declares ${dimensions.duration}s duration.` : "No root data-duration found; HyperFrames may infer duration from child tracks.",
    },
  ];
  const inlineSeekHandler = source.includes("hf-seek");
  if (inlineSeekHandler) {
    checks.push({ id: "seek-handler", status: "passed", detail: "Source references the HyperFrames hf-seek event for deterministic animation." });
  }
  return {
    packageName,
    capabilityId,
    status: checks.some((check) => check.status === "warning") ? "warning" : "passed",
    sourcePath,
    projectDir: dirname(sourcePath),
    sourceBytes: Buffer.byteLength(source),
    sha256: createHash("sha256").update(source).digest("hex"),
    composition: {
      width: dimensions.width,
      height: dimensions.height,
      duration: dimensions.duration,
      fps: dimensions.fps,
      rootTag: rootTag ? compactWhitespace(rootTag).slice(0, 400) : undefined,
    },
    checks,
  };
}

function renderComposition(options) {
  const sourcePath = resolveSourcePath(options);
  const workspace = workspaceRoot();
  const outputPath = ensureInsideWorkspace(resolveOutputPath(options, sourcePath));
  const metadataPath = ensureInsideWorkspace(resolve(options.metadataJson || `${outputPath}.metadata.json`));
  const firstFramePath = ensureInsideWorkspace(resolve(options.firstFrame || options.preview || outputPath.replace(/\.[^.]+$/, ".first-frame.png")));
  const logDir = ensureInsideWorkspace(resolve(options.logDir || join(workspace, ".ambient", "hyperframes", "logs")));
  mkdirSync(dirname(outputPath), { recursive: true });
  mkdirSync(dirname(metadataPath), { recursive: true });
  mkdirSync(dirname(firstFramePath), { recursive: true });
  mkdirSync(logDir, { recursive: true });

  const fakeRender = process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER === "1" || options.fakeRender === true;
  if (fakeRender) return fakeRenderPayload({ sourcePath, outputPath, metadataPath, firstFramePath, logDir, options });

  const doctor = doctorPayload({ fast: false });
  if (!doctor.ready) {
    const payload = {
      packageName,
      capabilityId,
      status: "blocked",
      ready: false,
      blockedState: doctor.status,
      reason: "HyperFrames render did not run because local dependencies are not ready.",
      sourcePath,
      outputPath,
      metadataPath,
      firstFramePath,
      doctor,
      setup: setupActions(doctor.checks.map((check) => check.status)),
    };
    writeFileSync(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return payload;
  }

  const startedAt = Date.now();
  const lint = runAndLog("lint", logDir, "npx", ["--no-install", "hyperframes", "lint", sourcePath, "--json"], { cwd: dirname(sourcePath), timeoutMs: timeoutMs(options, 120_000) });
  const inspect = runAndLog("inspect", logDir, "npx", ["--no-install", "hyperframes", "inspect", sourcePath, "--json"], { cwd: dirname(sourcePath), timeoutMs: timeoutMs(options, 120_000) });
  if (lint.status !== 0) {
    const payload = failedRenderPayload({ sourcePath, outputPath, metadataPath, firstFramePath, startedAt, stage: "lint", lint, inspect });
    writeFileSync(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return payload;
  }

  const renderArgs = renderCommandArgs(options, sourcePath, outputPath);
  let render = runAndLog("render", logDir, "npx", renderArgs, { cwd: dirname(sourcePath), timeoutMs: timeoutMs(options, 600_000) });
  if (render.status !== 0 && render.stderr.toLowerCase().includes("unknown option") && renderArgs.includes("--out")) {
    render = runAndLog("render-output-flag", logDir, "npx", renderArgs.map((arg) => arg === "--out" ? "--output" : arg), {
      cwd: dirname(sourcePath),
      timeoutMs: timeoutMs(options, 600_000),
    });
  }
  if (render.status !== 0 || !existsSync(outputPath)) {
    const payload = failedRenderPayload({ sourcePath, outputPath, metadataPath, firstFramePath, startedAt, stage: "render", lint, inspect, render });
    writeFileSync(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return payload;
  }

  const ffprobe = runAndLog("ffprobe", logDir, "ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", outputPath], {
    cwd: dirname(outputPath),
    timeoutMs: 60_000,
  });
  const duration = ffprobeDuration(ffprobe.stdout);
  const midpoint = duration ? Math.max(0, Math.min(duration / 2, Math.max(duration - 0.05, 0))) : 0;
  const frame = runAndLog("first-frame", logDir, "ffmpeg", ["-y", "-ss", String(midpoint), "-i", outputPath, "-vframes", "1", firstFramePath], {
    cwd: dirname(outputPath),
    timeoutMs: 120_000,
  });
  const media = mediaMetadata(outputPath, ffprobe.stdout);
  const payload = {
    packageName,
    capabilityId,
    status: ffprobe.status === 0 && media.bytes > 0 ? "rendered" : "rendered_unverified",
    sourcePath,
    outputPath,
    metadataPath,
    firstFramePath: existsSync(firstFramePath) ? firstFramePath : undefined,
    durationMs: Date.now() - startedAt,
    media,
    commands: { lint, inspect, render, ffprobe, firstFrame: frame },
    artifactContract: artifactContract(),
  };
  writeFileSync(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return previewPayload(payload);
}

function fakeRenderPayload({ sourcePath, outputPath, metadataPath, firstFramePath, logDir, options }) {
  const startedAt = Date.now();
  const sourceInspection = inspectComposition({ source: sourcePath });
  writeFileSync(outputPath, Buffer.from(`ambient-hyperframes-fake-render\nsource=${sourcePath}\n`, "utf8"));
  writeFileSync(firstFramePath, tinyPng());
  const fakeLogPath = join(logDir, "fake-render.stdout.log");
  writeFileSync(fakeLogPath, "Deterministic fake render hook wrote test media bytes.\n", "utf8");
  const payload = {
    packageName,
    capabilityId,
    status: "rendered",
    mode: "fake",
    sourcePath,
    outputPath,
    metadataPath,
    firstFramePath,
    durationMs: Date.now() - startedAt,
    media: {
      path: outputPath,
      bytes: statSync(outputPath).size,
      sha256: fileHash(outputPath),
      format: extname(outputPath).replace(/^\./, "") || "mp4",
      ffprobe: { skipped: true, reason: "AMBIENT_HYPERFRAMES_FAKE_RENDER=1" },
    },
    composition: sourceInspection.composition,
    commands: {
      fakeRender: {
        command: ["node", "./scripts/run.mjs", "render", "--fake-render"],
        cwd: process.cwd(),
        status: 0,
        stdoutPath: fakeLogPath,
        stdoutPreview: "Deterministic fake render hook wrote test media bytes.",
        stderrPath: undefined,
        stderrPreview: "",
      },
    },
    setup: setupActions([]),
    artifactContract: artifactContract(),
  };
  if (options.writeMetadata !== false) writeFileSync(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return previewPayload(payload);
}

function failedRenderPayload({ sourcePath, outputPath, metadataPath, firstFramePath, startedAt, stage, lint, inspect, render }) {
  return {
    packageName,
    capabilityId,
    status: "failed",
    failedStage: stage,
    sourcePath,
    outputPath,
    metadataPath,
    firstFramePath,
    durationMs: Date.now() - startedAt,
    reason: `${stage} failed. Inspect the preserved command logs before retrying.`,
    commands: {
      ...(lint ? { lint } : {}),
      ...(inspect ? { inspect } : {}),
      ...(render ? { render } : {}),
    },
    artifactContract: artifactContract(),
  };
}

function renderCommandArgs(options, sourcePath, outputPath) {
  const args = ["--no-install", "hyperframes", "render", sourcePath, process.env.AMBIENT_HYPERFRAMES_OUTPUT_FLAG || "--out", outputPath];
  if (options.fps) args.push("--fps", String(positiveInteger(options.fps, "fps", defaultFps)));
  if (options.quality) args.push("--quality", String(options.quality));
  if (options.format) args.push("--format", String(options.format));
  if (options.quiet) args.push("--quiet");
  if (options.noCache) args.push("--no-cache");
  if (options.passthrough.length) args.push(...options.passthrough);
  return args;
}

function resolveSourcePath(options) {
  const workspace = workspaceRoot();
  const projectDir = options.projectDir ? ensureInsideWorkspace(resolve(workspace, options.projectDir)) : workspace;
  const candidates = [
    options.source,
    options.file,
    options.input,
    options.dir ? join(options.dir, "comp.html") : undefined,
    options.dir ? join(options.dir, "index.html") : undefined,
    join(projectDir, "comp.html"),
    join(projectDir, "index.html"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const absolute = ensureInsideWorkspace(resolve(workspace, candidate));
    if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  }
  throw new Error(`No HyperFrames source file found. Pass --source <file> or run hyperframes_init first.`);
}

function resolveOutputPath(options, sourcePath) {
  const workspace = workspaceRoot();
  if (options.output) return resolve(workspace, options.output);
  const base = basename(sourcePath, extname(sourcePath)).replace(/[^a-zA-Z0-9._-]+/g, "-") || "composition";
  return join(workspace, ".ambient", "hyperframes", "renders", `${base}.mp4`);
}

function workspaceRoot() {
  return resolve(process.env.AMBIENT_WORKSPACE_PATH || process.env.AMBIENT_DESKTOP_WORKSPACE || process.cwd());
}

function ensureInsideWorkspace(path) {
  const workspace = workspaceRoot();
  const absolute = resolve(path);
  const relativePath = relative(workspace, absolute);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) return absolute;
  throw new Error(`Path must stay inside the workspace: ${path}`);
}

function commandCheck(command, args, { id, label, missingStatus }) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 256 });
  if (result.error) {
    return { id, label, status: missingStatus, command: [command, ...args], detail: result.error.message };
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return {
    id,
    label,
    status: result.status === 0 ? "ready" : missingStatus,
    command: [command, ...args],
    version: output.split(/\r?\n/).find(Boolean),
    detail: result.status === 0 ? `${label} is available.` : output || `${label} exited with status ${result.status}.`,
  };
}

function hyperframesCliCheck() {
  const result = spawnSync("npx", ["--no-install", "hyperframes", "doctor", "--json"], { encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 512 });
  if (result.error) return { id: "hyperframes-cli", label: "HyperFrames CLI", status: "missingHyperframesCli", detail: result.error.message };
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.status === 0) return { id: "hyperframes-cli", label: "HyperFrames CLI", status: "ready", command: ["npx", "--no-install", "hyperframes", "doctor", "--json"], detail: output || "HyperFrames CLI doctor passed." };
  return {
    id: "hyperframes-cli",
    label: "HyperFrames CLI",
    status: missingHyperframesCliOutput(output) ? "missingHyperframesCli" : "doctorFailed",
    command: ["npx", "--no-install", "hyperframes", "doctor", "--json"],
    detail: output || `HyperFrames CLI doctor exited with status ${result.status}.`,
  };
}

function missingHyperframesCliOutput(output) {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("not found") ||
    normalized.includes("could not determine") ||
    normalized.includes("missing packages") ||
    normalized.includes("no yes option") ||
    normalized.includes("canceled due to missing")
  );
}

function browserCheck() {
  const result = spawnSync("npx", ["--no-install", "hyperframes", "browser", "path"], { encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 256 });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.status === 0 && output) {
    return { id: "browser-runtime", label: "Chrome/headless browser runtime", status: "ready", command: ["npx", "--no-install", "hyperframes", "browser", "path"], path: output.split(/\r?\n/)[0], detail: "HyperFrames browser runtime path is available." };
  }
  return { id: "browser-runtime", label: "Chrome/headless browser runtime", status: "missingBrowser", command: ["npx", "--no-install", "hyperframes", "browser", "path"], detail: output || "HyperFrames browser runtime was not found." };
}

function setupActions(statuses) {
  const statusSet = new Set(statuses);
  const actions = [];
  if (statusSet.has("missingNode")) {
    actions.push({
      id: "node-upgrade",
      label: `Install or select Node.js ${minNodeMajor}+`,
      approvalRequired: true,
      automatic: false,
      commands: [],
      detail: "Ambient does not replace the user's Node.js in this HyperFrames V1 path. Install Node 22+ or launch Ambient with a compatible Node runtime.",
    });
  }
  if (statusSet.has("missingFfmpeg")) {
    actions.push({
      id: "install-ffmpeg-macos-homebrew",
      label: "Install FFmpeg with Homebrew",
      approvalRequired: true,
      automatic: false,
      platforms: ["darwin"],
      commands: [["brew", "install", "ffmpeg"]],
      detail: "Only run after explicit approval. Capture stdout/stderr as repair artifacts.",
    });
  }
  if (statusSet.has("missingHyperframesCli")) {
    actions.push({
      id: "install-hyperframes-cli",
      label: "Install HyperFrames CLI",
      approvalRequired: true,
      automatic: false,
      commands: [["npm", "install", "-g", "hyperframes"]],
      detail: "Alternatively run a project-local npm install and keep renders inside that workspace.",
    });
  }
  if (statusSet.has("missingBrowser")) {
    actions.push({
      id: "install-browser-runtime",
      label: "Install HyperFrames browser runtime",
      approvalRequired: true,
      automatic: false,
      commands: [["npx", "--no-install", "hyperframes", "browser", "ensure"]],
      detail: "Only run after disclosing the browser cache path and receiving approval.",
    });
  }
  if (statusSet.has("doctorFailed")) {
    actions.push({
      id: "inspect-doctor-failure",
      label: "Inspect HyperFrames doctor failure",
      approvalRequired: false,
      automatic: false,
      commands: [["npx", "--no-install", "hyperframes", "doctor", "--json"]],
      detail: "Attach doctor stdout/stderr and resolve the exact failed row before rendering.",
    });
  }
  return actions;
}

function primaryBlockedState(blocking) {
  const statuses = blocking.map((check) => check.status);
  for (const status of ["missingNode", "missingFfmpeg", "missingHyperframesCli", "missingBrowser", "doctorFailed"]) {
    if (statuses.includes(status)) return status;
  }
  return "blocked";
}

function blockingStatus(status) {
  return ["missingNode", "missingFfmpeg", "missingHyperframesCli", "missingBrowser", "doctorFailed"].includes(status);
}

function runAndLog(label, logDir, command, args, { cwd, timeoutMs }) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 32,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || (result.error ? result.error.message : "");
  const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "-");
  const stdoutPath = join(logDir, `${Date.now()}-${safeLabel}.stdout.log`);
  const stderrPath = join(logDir, `${Date.now()}-${safeLabel}.stderr.log`);
  writeFileSync(stdoutPath, stdout, "utf8");
  writeFileSync(stderrPath, stderr, "utf8");
  return {
    command: [command, ...args],
    cwd,
    status: typeof result.status === "number" ? result.status : result.error ? 1 : 0,
    signal: result.signal || undefined,
    durationMs: Date.now() - startedAt,
    stdoutPath,
    stderrPath,
    stdout,
    stderr,
    stdoutPreview: truncate(stdout, maxLogPreviewChars),
    stderrPreview: truncate(stderr, maxLogPreviewChars),
  };
}

function mediaMetadata(outputPath, ffprobeStdout) {
  const parsed = parseJsonObject(ffprobeStdout);
  const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  return {
    path: outputPath,
    bytes: statSync(outputPath).size,
    sha256: fileHash(outputPath),
    format: parsed?.format?.format_name,
    durationSeconds: parsed?.format?.duration ? Number(parsed.format.duration) : undefined,
    bitRate: parsed?.format?.bit_rate ? Number(parsed.format.bit_rate) : undefined,
    video: video
      ? {
          codec: video.codec_name,
          width: video.width,
          height: video.height,
          avgFrameRate: video.avg_frame_rate,
          durationSeconds: video.duration ? Number(video.duration) : undefined,
        }
      : undefined,
    ffprobe: parsed || { rawPreview: truncate(ffprobeStdout, maxLogPreviewChars) },
  };
}

function ffprobeDuration(stdout) {
  const parsed = parseJsonObject(stdout);
  const duration = parsed?.format?.duration ? Number(parsed.format.duration) : undefined;
  return Number.isFinite(duration) ? duration : undefined;
}

function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function previewPayload(payload) {
  return {
    packageName: payload.packageName,
    capabilityId: payload.capabilityId,
    status: payload.status,
    mode: payload.mode,
    sourcePath: payload.sourcePath,
    outputPath: payload.outputPath,
    metadataPath: payload.metadataPath,
    firstFramePath: payload.firstFramePath,
    durationMs: payload.durationMs,
    media: payload.media
      ? {
          path: payload.media.path,
          bytes: payload.media.bytes,
          sha256: payload.media.sha256,
          format: payload.media.format,
          durationSeconds: payload.media.durationSeconds,
          video: payload.media.video,
        }
      : undefined,
    commands: Object.fromEntries(
      Object.entries(payload.commands || {}).map(([key, value]) => [
        key,
        {
          command: value.command,
          cwd: value.cwd,
          status: value.status,
          stdoutPath: value.stdoutPath,
          stderrPath: value.stderrPath,
          stdoutPreview: value.stdoutPreview,
          stderrPreview: value.stderrPreview,
        },
      ]),
    ),
    artifactContract: payload.artifactContract,
  };
}

function firstTagWithDimensions(source) {
  return source.match(/<[^>]+data-width=["'][^"']+["'][^>]+data-height=["'][^"']+["'][^>]*>/i)?.[0]
    ?? source.match(/<[^>]+data-height=["'][^"']+["'][^>]+data-width=["'][^"']+["'][^>]*>/i)?.[0];
}

function dimensionsFromTag(tag) {
  return {
    width: numberAttr(tag, "data-width"),
    height: numberAttr(tag, "data-height"),
    duration: numberAttr(tag, "data-duration"),
    fps: numberAttr(tag, "data-fps"),
  };
}

function numberAttr(tag, name) {
  const value = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1];
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function scaffoldHtml({ title, subtitle, duration, fps, width, height }) {
  return `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; background: #111827; font-family: Inter, Arial, sans-serif; }
  .stage { position: relative; overflow: hidden; width: ${width}px; height: ${height}px; background: #101827; color: #ffffff; }
  .bg { position: absolute; inset: 0; background:
    radial-gradient(circle at 22% 22%, rgba(20, 184, 166, 0.45), transparent 30%),
    linear-gradient(135deg, #111827 0%, #1f2937 55%, #0f766e 100%);
  }
  .frame { position: absolute; inset: 72px; display: grid; align-content: center; gap: 18px; }
  .kicker { margin: 0; color: #7dd3fc; font-size: 28px; font-weight: 700; text-transform: uppercase; }
  h1 { margin: 0; max-width: 860px; font-size: 86px; line-height: 0.98; font-weight: 800; }
  .subtitle { margin: 0; max-width: 780px; color: #d1d5db; font-size: 32px; line-height: 1.25; }
  .bar { width: 420px; height: 8px; background: #f97316; border-radius: 0; transform-origin: left center; }
</style>
<div class="stage" data-width="${width}" data-height="${height}" data-duration="${duration}" data-fps="${fps}">
  <div class="bg" data-start="0" data-duration="${duration}"></div>
  <section class="frame" data-start="0" data-duration="${duration}">
    <p class="kicker">Ambient Desktop</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(subtitle)}</p>
    <div class="bar"></div>
  </section>
</div>
<script>
  const frame = document.querySelector(".frame");
  const bar = document.querySelector(".bar");
  const total = ${JSON.stringify(duration)};
  function apply(time) {
    const p = Math.max(0, Math.min(1, time / total));
    frame.style.opacity = String(Math.min(1, p * 1.6));
    frame.style.transform = "translateY(" + ((1 - Math.min(1, p * 1.4)) * 28).toFixed(2) + "px)";
    bar.style.transform = "scaleX(" + Math.min(1, p * 1.8).toFixed(3) + ")";
  }
  window.addEventListener("hf-seek", (event) => apply(event.detail.time || 0));
  apply(0);
</script>
`;
}

function artifactContract() {
  return {
    sourceProjectPath: "HyperFrames project directory in the workspace.",
    renderedMediaPath: "MP4/WebM/MOV output path in the workspace.",
    firstFramePreviewPath: "PNG frame extracted with FFmpeg when available.",
    metadataJsonPath: "Full JSON result with media, command, and verification metadata.",
    logs: "Full command stdout/stderr logs are written as workspace artifacts with bounded stdout previews.",
  };
}

function helpText() {
  return `ambient-hyperframes

Commands:
  doctor --json [--fast]
  setup-plan --json
  init --project-dir <dir> [--title <text>] [--subtitle <text>]
  inspect --source <file> --json
  render --source <file> --output <file> --json
`;
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function parseArgs(args) {
  const options = { command: "help", passthrough: [] };
  if (args.length && !args[0].startsWith("-")) options.command = args.shift();
  let passthrough = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (passthrough) {
      options.passthrough.push(arg);
      continue;
    }
    if (arg === "--") {
      passthrough = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--fast") {
      options.fast = true;
    } else if (arg === "--fake-render") {
      options.fakeRender = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--no-cache") {
      options.noCache = true;
    } else if (arg === "--no-metadata") {
      options.writeMetadata = false;
    } else if (arg.startsWith("--")) {
      const key = camelCase(arg.slice(2));
      const next = args[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      options[key] = next;
      index += 1;
    } else if (!options.source && ["inspect", "render"].includes(options.command)) {
      options.source = arg;
    } else if (!options.projectDir && options.command === "init") {
      options.projectDir = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function positiveNumber(value, name, fallback) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`--${name} must be a positive number.`);
  return number;
}

function positiveInteger(value, name, fallback) {
  const number = positiveNumber(value, name, fallback);
  if (!Number.isInteger(number)) throw new Error(`--${name} must be an integer.`);
  return number;
}

function timeoutMs(options, fallback) {
  return positiveInteger(options.timeoutMs, "timeout-ms", fallback);
}

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function compactWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text, maxChars) {
  if (!text || text.length <= maxChars) return text || "";
  return `${text.slice(0, maxChars)}\n... truncated ${text.length - maxChars} chars; read the log artifact for full output.`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJcWAtmWQAAAABJRU5ErkJggg==",
    "base64",
  );
}
