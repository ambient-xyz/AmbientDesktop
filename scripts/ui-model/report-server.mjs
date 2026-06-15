#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

const root = process.cwd();
const port = Number(firstValueArg("--port") ?? process.env.AMBIENT_UI_MODEL_REPORT_PORT ?? 9597);
const resultsDir = pathArg("--results-dir", join(root, "test-results", "ui-model"));
const reproResultsDir = pathArg("--repro-results-dir", join(root, "test-results", "ui-model-repro"));
const reproFixtureRoot = pathArg("--repro-fixture-root", join(root, "test-results", "ui-model-repro-fixture"));
const reproNonce = randomBytes(16).toString("hex");

let activeRepro;

const server = createServer(async (request, response) => {
  try {
    if (!validateLoopbackRequest(request, response)) return;
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
    if (url.pathname === "/" || url.pathname === "/report") return redirect(response, "/report.html");
    if (url.pathname === "/repro") return handleRepro(url, response);
    if (url.pathname === "/api/repro-status") return json(response, reproStatus());
    if (url.pathname === "/api/stop-repro") return handleStopRepro(response);
    return serveStatic(url.pathname, response);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`UI model report server: http://127.0.0.1:${port}/report.html`);
  console.log(`Serving report files from ${resultsDir}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await stopActiveRepro(`report server received ${signal}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1_000).unref();
  });
}

async function handleRepro(url, response) {
  const scenario = url.searchParams.get("scenario") ?? "";
  const violationId = url.searchParams.get("violation") ?? "";
  if (url.searchParams.get("nonce") !== reproNonce) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid repro nonce");
    return;
  }
  const violation = await findViolation(scenario, violationId);
  if (!violation) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(`No violation found for scenario=${scenario} violation=${violationId}`);
    return;
  }

  await stopActiveRepro("superseded by a new report launch");
  activeRepro = startRepro({ scenario, violationId, violation });
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(reproPage(activeRepro));
}

async function handleStopRepro(response) {
  await stopActiveRepro("stopped from report server");
  return json(response, reproStatus());
}

async function findViolation(scenario, violationId) {
  if (!/^[a-zA-Z0-9_.:-]+$/.test(scenario) || !violationId) return undefined;
  const summary = await readSummary().catch(() => undefined);
  if (!summary?.scenarios?.some((item) => item.scenario === scenario)) return undefined;
  const file = resolve(resultsDir, `${scenario}.json`);
  if (!inside(resultsDir, file)) return undefined;
  const model = JSON.parse(await readFile(file, "utf8"));
  if (model.scenario !== scenario) return undefined;
  return model.violations?.find((violation) => violation.id === violationId);
}

async function readSummary() {
  const file = resolve(resultsDir, "summary.json");
  if (!inside(resultsDir, file)) throw new Error("Resolved summary path escaped the report directory.");
  return JSON.parse(await readFile(file, "utf8"));
}

function startRepro({ scenario, violationId, violation }) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const child = spawn(
    process.execPath,
    [
      "--experimental-websocket",
      "scripts/ui-model/collect-ui-model.mjs",
      `--scenario=${scenario}`,
      `--repro-violation=${violationId}`,
      "--keep-app",
      `--results-dir=${reproResultsDir}`,
      `--fixture-root=${reproFixtureRoot}`,
    ],
    {
      cwd: root,
      env: reportServerChildEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const state = {
    id,
    scenario,
    violationId,
    type: violation.type,
    impact: violation.impact,
    gate: violation.gate,
    startedAt: new Date().toISOString(),
    status: "running",
    pid: child.pid,
    exitCode: undefined,
    signal: undefined,
    log: [],
    child,
  };
  const appendLog = (chunk) => {
    state.log.push(chunk.toString("utf8"));
    const joined = state.log.join("");
    if (joined.length > 40_000) state.log = [joined.slice(-40_000)];
  };
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);
  child.once("exit", (code, signal) => {
    state.status = "exited";
    state.exitCode = code;
    state.signal = signal;
  });
  return state;
}

async function stopActiveRepro(reason) {
  if (!activeRepro?.child || activeRepro.status !== "running") return;
  activeRepro.status = "stopping";
  activeRepro.log.push(`\n[ui-model-report] ${reason}\n`);
  activeRepro.child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3_000);
    activeRepro.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (activeRepro.child.exitCode === null && activeRepro.child.signalCode === null) activeRepro.child.kill("SIGKILL");
}

function reproStatus() {
  if (!activeRepro) return { status: "idle" };
  return {
    id: activeRepro.id,
    scenario: activeRepro.scenario,
    violationId: activeRepro.violationId,
    type: activeRepro.type,
    impact: activeRepro.impact,
    gate: activeRepro.gate,
    startedAt: activeRepro.startedAt,
    status: activeRepro.status,
    pid: activeRepro.pid,
    exitCode: activeRepro.exitCode,
    signal: activeRepro.signal,
    log: activeRepro.log.join("").slice(-20_000),
  };
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/report.html" : pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Bad path");
    return;
  }
  const file = resolve(resultsDir, `.${decoded}`);
  if (!inside(resultsDir, file)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  const fileStat = await stat(file).catch(() => undefined);
  if (!fileStat?.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": contentType(file) });
  if (basename(file) === "report.html") {
    const report = await readFile(file, "utf8");
    response.end(injectReproNonce(report));
    return;
  }
  createReadStream(file).pipe(response);
}

function injectReproNonce(reportHtml) {
  return reportHtml.replace(/href="\/repro\?/g, `href="/repro?nonce=${encodeURIComponent(reproNonce)}&`);
}

function reproPage(repro) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>UI Model Repro</title>
  <style>
    body { margin: 0; padding: 28px; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f6f7f9; }
    main { max-width: 920px; margin: 0 auto; background: #fff; border: 1px solid #d8dde8; border-radius: 8px; padding: 18px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { margin: 6px 0; color: #475467; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 440px; overflow: auto; padding: 12px; border-radius: 6px; background: #111827; color: #f9fafb; }
    a, button { color: #175cd3; }
    button { min-height: 32px; padding: 4px 10px; border: 1px solid #d8dde8; border-radius: 6px; background: #fff; font: inherit; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>Launching UI Model Repro</h1>
    <p>Scenario: <code>${escapeHtml(repro.scenario)}</code></p>
    <p>Violation: <code>${escapeHtml(repro.violationId)}</code></p>
    <p>Status: <strong id="status">starting</strong></p>
    <p>The app will stay open with the target highlighted. Stop it here before launching another repro.</p>
    <p><button id="stop" type="button">Stop repro app</button> <a href="/report.html">Back to report</a></p>
    <pre id="log"></pre>
  </main>
  <script>
    async function refresh() {
      const result = await fetch("/api/repro-status").then((response) => response.json());
      document.getElementById("status").textContent = result.status + (result.pid ? " pid=" + result.pid : "");
      document.getElementById("log").textContent = result.log || "";
      setTimeout(refresh, result.status === "running" || result.status === "stopping" ? 1000 : 2500);
    }
    document.getElementById("stop").addEventListener("click", async () => {
      await fetch("/api/stop-repro");
      await refresh();
    });
    refresh();
  </script>
</body>
</html>`;
}

function redirect(response, location) {
  response.writeHead(302, { location });
  response.end();
}

function json(response, payload) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function contentType(file) {
  switch (extname(file)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".log":
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function validateLoopbackRequest(request, response) {
  if (!isLoopbackHostHeader(request.headers.host)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden host");
    return false;
  }
  const origin = request.headers.origin;
  if (typeof origin === "string" && origin.length > 0) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("Forbidden origin");
      return false;
    }
    if (!isLoopbackHostname(parsed.hostname) || (parsed.port && parsed.port !== String(port))) {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("Forbidden origin");
      return false;
    }
  }
  return true;
}

function isLoopbackHostHeader(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 && isLoopbackHostname(value.slice(1, end));
  }
  const [hostname] = value.split(":");
  return isLoopbackHostname(hostname);
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1" || normalized === "[::1]";
}

function reportServerChildEnv(overrides = {}) {
  const env = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "PNPM_HOME",
    "COREPACK_HOME",
    "XDG_CACHE_HOME",
  ]) {
    if (typeof process.env[key] === "string") env[key] = process.env[key];
  }
  if (typeof process.env.AMBIENT_DESKTOP_BOOTSTRAP_WATCHDOG_MS === "string") {
    env.AMBIENT_DESKTOP_BOOTSTRAP_WATCHDOG_MS = process.env.AMBIENT_DESKTOP_BOOTSTRAP_WATCHDOG_MS;
  }
  return { ...env, ...overrides };
}

function valueArg(name) {
  const values = [];
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1).trim());
  }
  return values.filter(Boolean);
}

function firstValueArg(name) {
  return valueArg(name)[0];
}

function pathArg(name, fallback) {
  const value = firstValueArg(name);
  if (!value) return fallback;
  return resolve(root, value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
