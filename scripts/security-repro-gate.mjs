#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateSecurityReproGateResults } from "./security-repro-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jsonOutput = process.argv.includes("--json");
const port = Number(optionValue("--port") ?? (await availableLoopbackPort()));
const timeoutMs = Number(optionValue("--timeout-ms") ?? 180_000);

const server = spawn(process.execPath, ["scripts/security-repro/server.mjs", "--port", String(port)], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
server.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
});
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

try {
  await waitForHealth(port, timeoutMs);
  const response = await fetch(`http://127.0.0.1:${port}/api/run-all`, {
    method: "POST",
    headers: {
      origin: `http://127.0.0.1:${port}`,
    },
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(body?.error ?? `Security repro API returned HTTP ${response.status}`);
  const gate = evaluateSecurityReproGateResults(body?.results);
  const report = {
    status: gate.status,
    gate,
    results: body?.results ?? [],
  };
  writeReport(report);
  if (gate.status !== "passed") process.exitCode = 1;
} catch (error) {
  const report = {
    status: "failed",
    gate: {
      status: "failed",
      checked: 0,
      counts: {},
      issues: [{ id: "security-repro-gate", status: "error", issue: error instanceof Error ? error.message : String(error) }],
    },
    server: {
      stdout: preview(stdout),
      stderr: preview(stderr),
    },
  };
  writeReport(report);
  process.exitCode = 1;
} finally {
  await stopServer(server);
}

function writeReport(report) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Security repro release gate: ${report.status}\n`);
  process.stdout.write(`Checked: ${report.gate.checked}\n`);
  process.stdout.write(`Status counts: ${JSON.stringify(report.gate.counts)}\n`);
  if (report.gate.issues.length > 0) {
    process.stdout.write("Issues:\n");
    for (const issue of report.gate.issues) process.stdout.write(`- ${issue.issue}\n`);
  }
}

async function waitForHealth(portNumber, timeout) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Security repro server exited before health check. stderr=${preview(stderr)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/api/health`, {
        headers: {
          origin: `http://127.0.0.1:${portNumber}`,
        },
      });
      if (response.ok) return;
      lastError = new Error(`health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for security repro server health: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "close"), new Promise((resolveStop) => setTimeout(resolveStop, 1_000))]);
  if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
}

async function availableLoopbackPort() {
  const serverForPort = createServer();
  serverForPort.listen(0, "127.0.0.1");
  await once(serverForPort, "listening");
  const address = serverForPort.address();
  await new Promise((resolveClose) => serverForPort.close(resolveClose));
  if (!address || typeof address === "string") throw new Error("Could not allocate a loopback port.");
  return address.port;
}

function optionValue(name) {
  const arg = process.argv.find((item) => item === name || item.startsWith(`${name}=`));
  if (!arg) return undefined;
  if (arg === name) return process.argv[process.argv.indexOf(arg) + 1];
  return arg.slice(name.length + 1);
}

function preview(value, maxLength = 1_200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
