#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMcpDefaultRuntimeReleaseGateReport,
  mcpDefaultRuntimeReleaseGatePassed,
  renderMcpDefaultRuntimeReleaseGateMarkdown,
} from "./mcp-default-runtime-release-gate-lib.mjs";
import { runHostPreflight } from "./mcp-container-runtime-host-preflight.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const args = new Set(argv);
const outputPath = resolve(optionValue(argv, "--out") || process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_OUT || join(repoRoot, "test-results", "mcp-default-runtime-release-gate", "latest.json"));
const startedAt = new Date().toISOString();
const runId = optionValue(argv, "--run-id") || process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_RUN_ID || runIdFromTimestamp(startedAt);
const archiveDir = resolve(optionValue(argv, "--archive-dir") || process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_ARCHIVE_DIR || join(dirname(outputPath), "runs", runId));
const archiveJsonPath = resolve(optionValue(argv, "--archive-out") || join(archiveDir, "report.json"));
const markdownPath = resolve(optionValue(argv, "--markdown-out") || process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_MARKDOWN_OUT || markdownPathFor(outputPath));
const archiveMarkdownPath = resolve(optionValue(argv, "--archive-markdown-out") || join(archiveDir, "report.md"));
const liveArtifactDir = resolve(optionValue(argv, "--live-artifact-dir") || process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_LIVE_ARTIFACT_DIR || join(archiveDir, "live-artifacts"));
const requireLive = args.has("--require-live") || process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_REQUIRE_LIVE === "1";
const requiredHostPreflightPlatforms = parseRequiredHostPreflightPlatforms(argv);
const hostPreflightMaxAgeHours = numberOption(argv, "--require-host-preflight-max-age-hours") ??
  positiveNumberEnv("AMBIENT_MCP_DEFAULT_RUNTIME_GATE_REQUIRE_HOST_PREFLIGHT_MAX_AGE_HOURS");
const jsonOutput = args.has("--json");

const packageJson = await readJson("package.json");
const liveResults = [];
for (const command of liveCommands(packageJson.scripts ?? {}, args)) {
  liveResults.push(await runLiveCommand(command, { artifactDir: liveArtifactDir }));
}
const hostPreflightResults = [
  ...await runSelectedHostPreflight(argv),
  ...await readHostPreflightResults(argv),
];

const completedAt = new Date().toISOString();
const report = buildMcpDefaultRuntimeReleaseGateReport({
  runId,
  packageJson,
  descriptors: await readDefaultCatalogDescriptors(),
  dockerInstallPlanHtml: await readText("dockerInstallPlan.html"),
  installerUpdatePlanHtml: await readText("installerUpdatePlan.html"),
  sourceFiles: {
      mcpInstallGateTs: await readText("src/main/mcpInstallGate.ts"),
      agentRuntimeTs: await readText("src/main/agentRuntime.ts"),
      agentRuntimeMcpServerToolsTs: await readText("src/main/agentRuntimeMcpServerTools.ts"),
      mcpServerPiToolsTs: await readText("src/main/mcpServerPiTools.ts"),
    mcpServerPiToolsTestTs: await readText("src/main/mcpServerPiTools.test.ts"),
    containerRuntimeProbeServiceTs: await readText("src/main/containerRuntimeProbeService.ts"),
    containerRuntimeInstallLauncherTs: await readText("src/main/containerRuntimeInstallLauncher.ts"),
    mcpDefaultCapabilityInstallerTs: await readText("src/main/mcpDefaultCapabilityInstaller.ts"),
    ociImageResolverTs: await readText("src/main/ociImageResolver.ts"),
    toolHiveRuntimeServiceTs: await readText("src/main/toolHiveRuntimeService.ts"),
    rendererAppTsx: await readTexts([
      "src/renderer/src/App.tsx",
      "src/renderer/src/AppModalHost.tsx",
      "src/renderer/src/AppDialogs.tsx",
    ]),
  },
  liveResults,
  hostPreflightResults,
  requireLive,
  requiredHostPreflightPlatforms,
  hostPreflightMaxAgeHours,
  generatedAt: completedAt,
  sourceRevision: await readSourceRevision(repoRoot),
  startedAt,
  completedAt,
  artifacts: {
    latestJsonPath: relativePath(repoRoot, outputPath),
    latestMarkdownPath: relativePath(repoRoot, markdownPath),
    archiveJsonPath: relativePath(repoRoot, archiveJsonPath),
    archiveMarkdownPath: relativePath(repoRoot, archiveMarkdownPath),
    liveArtifactDir: relativePath(repoRoot, liveArtifactDir),
  },
});

await writeGateOutputs({
  report,
  outputPath,
  archiveJsonPath,
  markdownPath,
  archiveMarkdownPath,
});

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanSummary(report);
}

if (!mcpDefaultRuntimeReleaseGatePassed(report, { requireLive })) process.exitCode = 1;

async function readDefaultCatalogDescriptors() {
  const catalogDir = join(repoRoot, "resources", "mcp-catalog", "default");
  const entries = (await readdir(catalogDir)).filter((entry) => entry.endsWith(".json")).sort();
  return Promise.all(entries.map((entry) => readJson(join("resources", "mcp-catalog", "default", entry))));
}

async function readHostPreflightResults(values) {
  const paths = optionValues(values, "--host-preflight");
  const envPaths = (process.env.AMBIENT_MCP_HOST_PREFLIGHT_EVIDENCE ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Promise.all([...paths, ...envPaths].map((path) => readJson(resolve(repoRoot, path))));
}

async function runSelectedHostPreflight(values) {
  const runLocal =
    args.has("--run-host-preflight-local") ||
    process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_RUN_HOST_PREFLIGHT_LOCAL === "1" ||
    args.has("--run-live") ||
    process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_RUN_LIVE === "1";
  if (!runLocal) return [];
  const output = resolve(optionValue(values, "--host-preflight-local-out") || join(repoRoot, "test-results", "mcp-runtime-host-preflight", "local.json"));
  const started = Date.now();
  try {
    const report = await runHostPreflight({
      timeoutMs: numberOption(values, "--host-preflight-timeout-ms") ?? 60_000,
    });
    const withPath = {
      ...report,
      evidencePath: relativePath(repoRoot, output),
      durationMs: Date.now() - started,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(withPath, null, 2)}\n`, "utf8");
    return [withPath];
  } catch (error) {
    const failed = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      target: "local",
      transport: "local",
      platform: process.platform,
      arch: process.arch,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      evidencePath: relativePath(repoRoot, output),
      durationMs: Date.now() - started,
      runtimes: {},
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(failed, null, 2)}\n`, "utf8");
    return [failed];
  }
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function readText(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

async function readTexts(paths) {
  return (await Promise.all(paths.map((path) => readText(path)))).join("\n");
}

function liveCommands(scripts, selectedArgs) {
  const commands = [
    { flag: "--run-live-runtime", name: "runtime", script: "test:mcp-toolhive-runtime:live" },
    { flag: "--run-live-bridge", name: "bridge", script: "test:mcp-tool-bridge:live" },
    { flag: "--run-live-scrapling", name: "scrapling", script: "test:mcp-scrapling-default:live" },
    { flag: "--run-live-pi", name: "pi", script: "test:mcp-live-pi-smoke:live" },
  ];
  const runAll = selectedArgs.has("--run-live") || process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_RUN_LIVE === "1";
  return commands
    .filter((command) => runAll || selectedArgs.has(command.flag))
    .map((command) => ({
      ...command,
      command: "pnpm",
      args: ["run", command.script],
      packageScript: scripts[command.script],
    }));
}

async function runLiveCommand(command, options = {}) {
  const started = Date.now();
  try {
    const output = await runCommand(command.command, command.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        AMBIENT_PROVIDER: command.name === "pi" ? "ambient" : process.env.AMBIENT_PROVIDER,
      },
    });
    const outputArtifacts = await writeLiveCommandArtifacts(command.name, output, options.artifactDir);
    return {
      name: command.name,
      script: command.script,
      packageScript: command.packageScript,
      status: "passed",
      durationMs: Date.now() - started,
      exitCode: 0,
      platform: process.platform,
      arch: process.arch,
      outputArtifacts,
    };
  } catch (error) {
    const outputArtifacts = await writeLiveCommandArtifacts(command.name, {
      stdout: typeof error?.stdout === "string" ? error.stdout : "",
      stderr: typeof error?.stderr === "string" ? error.stderr : "",
    }, options.artifactDir);
    return {
      name: command.name,
      script: command.script,
      packageScript: command.packageScript,
      status: "failed",
      durationMs: Date.now() - started,
      exitCode: typeof error?.code === "number" ? error.code : undefined,
      signal: typeof error?.signal === "string" ? error.signal : undefined,
      platform: process.platform,
      arch: process.arch,
      outputArtifacts,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function writeLiveCommandArtifacts(name, output, artifactDir) {
  const stdout = String(output?.stdout ?? "");
  const stderr = String(output?.stderr ?? "");
  await mkdir(artifactDir, { recursive: true });
  const base = safeName(name);
  const stdoutPath = join(artifactDir, `${base}.stdout.txt`);
  const stderrPath = join(artifactDir, `${base}.stderr.txt`);
  await Promise.all([
    writeFile(stdoutPath, stdout, "utf8"),
    writeFile(stderrPath, stderr, "utf8"),
  ]);
  return {
    stdoutPath: relativePath(repoRoot, stdoutPath),
    stdoutBytes: Buffer.byteLength(stdout, "utf8"),
    stderrPath: relativePath(repoRoot, stderrPath),
    stderrBytes: Buffer.byteLength(stderr, "utf8"),
  };
}

async function writeGateOutputs(input) {
  const json = `${JSON.stringify(input.report, null, 2)}\n`;
  const markdown = renderMcpDefaultRuntimeReleaseGateMarkdown(input.report);
  const outputs = new Map([
    [input.outputPath, json],
    [input.archiveJsonPath, json],
    [input.markdownPath, markdown],
    [input.archiveMarkdownPath, markdown],
  ]);
  for (const [path, contents] of outputs) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, "utf8");
  }
}

function runCommand(command, commandArgs, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = execFile(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
      timeout: 15 * 60_000,
    }, (error, stdout, stderr) => {
      if (!error) {
        if (stdout.trim()) process.stdout.write(stdout);
        if (stderr.trim()) process.stderr.write(stderr);
        resolveRun({ stdout, stderr });
        return;
      }
      if (stdout.trim()) process.stdout.write(stdout);
      if (stderr.trim()) process.stderr.write(stderr);
      error.stdout = stdout;
      error.stderr = stderr;
      rejectRun(error);
    });
    child.on("error", rejectRun);
  });
}

async function readSourceRevision(cwd) {
  try {
    const [gitHead, status] = await Promise.all([
      execFileText("git", ["rev-parse", "HEAD"], cwd),
      execFileText("git", ["status", "--short", "--untracked-files=no"], cwd),
    ]);
    return {
      gitHead: gitHead.trim(),
      dirty: status.trim().length > 0,
    };
  } catch {
    return {};
  }
}

function execFileText(commandName, commandArgs, cwd) {
  return new Promise((resolveText, rejectText) => {
    execFile(commandName, commandArgs, { cwd, encoding: "utf8" }, (error, stdout) => {
      if (error) rejectText(error);
      else resolveText(stdout);
    });
  });
}

function optionValue(values, name) {
  const direct = values.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}

function optionValues(values, name) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name && values[index + 1]) {
      output.push(values[index + 1]);
      index += 1;
    } else if (value.startsWith(`${name}=`)) {
      output.push(value.slice(name.length + 1));
    }
  }
  return output;
}

function numberOption(values, name) {
  const raw = optionValue(values, name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function positiveNumberEnv(name) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseRequiredHostPreflightPlatforms(values) {
  const explicit = optionValue(values, "--require-host-preflight-platforms") ||
    process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_REQUIRE_HOST_PREFLIGHT_PLATFORMS;
  if (args.has("--require-cross-platform-host-preflight") ||
    process.env.AMBIENT_MCP_DEFAULT_RUNTIME_GATE_REQUIRE_CROSS_PLATFORM_HOST_PREFLIGHT === "1") {
    return ["darwin", "linux", "win32"];
  }
  if (!explicit) return [];
  return [...new Set(explicit.split(",").map((value) => value.trim()).filter(Boolean))];
}

function relativePath(base, value) {
  const resolvedBase = resolve(base);
  const resolvedValue = resolve(value);
  return resolvedValue.startsWith(`${resolvedBase}/`) ? resolvedValue.slice(resolvedBase.length + 1) : resolvedValue;
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_.-]+/gi, "_").replace(/^_+|_+$/g, "") || "live-command";
}

function markdownPathFor(path) {
  const next = path.replace(/\.json$/i, ".md");
  return next === path ? `${path}.md` : next;
}

function runIdFromTimestamp(value) {
  return String(value).replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

function printHumanSummary(report) {
  const counts = report.checks.reduce(
    (acc, check) => {
      acc[check.status] = (acc[check.status] ?? 0) + 1;
      return acc;
    },
    {},
  );
  console.log(JSON.stringify({
    status: report.status,
    checks: counts,
    live: report.live,
    blockingIssues: report.releaseDecision.blockingIssues,
    advisoryIssues: report.releaseDecision.advisoryIssues,
    nextSlice: report.releaseDecision.nextSlice,
    outputPath,
    markdownPath,
    archiveJsonPath,
    archiveMarkdownPath,
  }, null, 2));
}
