import { AgentOs } from "@rivet-dev/agent-os-core";
import common from "@rivet-dev/agent-os-common";
import { createSandboxFs, createSandboxToolkit } from "@rivet-dev/agent-os-sandbox";
import { SandboxAgent } from "sandbox-agent";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import getPort from "get-port";

const execFileAsync = promisify(execFile);
const image = process.env.AMBIENT_SANDBOX_AGENT_IMAGE ?? "rivetdev/sandbox-agent:0.5.0-rc.2-full";
const adapterVersion = process.env.AMBIENT_PI_MCP_ADAPTER_VERSION ?? "2.5.4";
const marker = "__AMBIENT_AGENTOS_SANDBOX_PI_MCP_ADAPTER_EXCEL_SMOKE__";
const timeoutMs = Number(process.env.AMBIENT_AGENTOS_SANDBOX_PI_MCP_TIMEOUT_MS ?? 240_000);
const host = "127.0.0.1";
const port = await getPort({ host });
const containerName = `ambient-agentos-sandbox-pi-mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const hostTemp = await mkdtemp(join(tmpdir(), "ambient-agentos-sandbox-pi-mcp-host-"));
const hostEscapePath = join(hostTemp, "host-escape.xlsx");
const previousParentSecret = process.env.AGENTOS_SANDBOX_PI_MCP_PARENT_SECRET;
process.env.AGENTOS_SANDBOX_PI_MCP_PARENT_SECRET = "HOST_PARENT_ENV_SHOULD_NOT_LEAK";

let vm;
let sandbox;

try {
  await execFileAsync("docker", [
    "run",
    "--rm",
    "-d",
    "--name",
    containerName,
    "-p",
    `${host}:${port}:3000`,
    image,
    "server",
    "--no-token",
    "--host",
    "0.0.0.0",
    "--port",
    "3000",
  ]);

  sandbox = await SandboxAgent.connect({ baseUrl: `http://${host}:${port}` });
  await waitForSandboxHealth(sandbox);
  vm = await AgentOs.create({
    software: [common],
    mounts: [{ path: "/sandbox", driver: createSandboxFs({ client: sandbox }) }],
    toolKits: [createSandboxToolkit({ client: sandbox })],
  });

  await sandbox.writeFsFile(
    { path: "/tmp/pi-mcp-adapter-excel-sandbox-smoke.mjs" },
    new TextEncoder().encode(adapterExcelSandboxSource({ adapterVersion, hostEscapePath, marker })),
  );

  const run = await runSandboxCommandViaAgentOs(vm, {
    command: "node",
    args: ["/tmp/pi-mcp-adapter-excel-sandbox-smoke.mjs"],
    timeoutMs,
  });

  const resultLine = [...String(run.stdout ?? "").split("\n")].reverse().find((line) => line.startsWith(marker));
  if (!resultLine) {
    throw new Error(`Sandboxed adapter Excel smoke did not emit result. exit=${run.exitCode} stdout=${run.stdout} stderr=${run.stderr}`);
  }
  const inner = JSON.parse(resultLine.slice(marker.length));
  const report = {
    ok: inner.ok === true,
    image,
    adapterVersion,
    containerName,
    sandboxBaseUrl: `http://${host}:${port}`,
    run: {
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      stderr: String(run.stderr ?? "").slice(0, 4_000),
      durationMs: run.durationMs,
    },
    inner,
    containmentChecks: {
      hostEscapePath,
      hostEscapeExists: existsSync(hostEscapePath),
    },
  };
  await writeStdout(`${JSON.stringify(report, null, 2)}\n`);

  if (!report.ok) process.exitCode = 1;
  if (report.containmentChecks.hostEscapeExists) process.exitCode = 2;
  if (inner.env?.parentSecret !== null) process.exitCode = 3;
} catch (error) {
  process.exitCode = process.exitCode || 1;
  await writeStdout(
    `${JSON.stringify(
      {
        ok: false,
        image,
        adapterVersion,
        containerName,
        error: error?.stack ?? error?.message ?? String(error),
        containmentChecks: {
          hostEscapePath,
          hostEscapeExists: existsSync(hostEscapePath),
        },
      },
      null,
      2,
    )}\n`,
  ).catch(() => undefined);
} finally {
  await waitWithTimeout(vm?.dispose?.(), 5_000, "AgentOS dispose timed out").catch((error) => console.error(String(error?.message ?? error)));
  await sandbox?.dispose?.().catch(() => undefined);
  await execFileAsync("docker", ["rm", "-f", containerName]).catch(() => undefined);
  await rm(hostTemp, { recursive: true, force: true });
  if (previousParentSecret === undefined) delete process.env.AGENTOS_SANDBOX_PI_MCP_PARENT_SECRET;
  else process.env.AGENTOS_SANDBOX_PI_MCP_PARENT_SECRET = previousParentSecret;
  process.exit(process.exitCode ?? 0);
}

async function waitForSandboxHealth(client) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const health = await client.getHealth();
      if (health?.status === "ok") return;
      lastError = new Error(`health status ${JSON.stringify(health)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError ?? new Error("sandbox-agent health check timed out");
}

async function runSandboxCommandViaAgentOs(vm, request) {
  const command = `node /usr/local/bin/agentos-sandbox run-command --json '${JSON.stringify(request).replace(/'/g, "'\\''")}'`;
  const result = await vm.exec(command, { timeout: (request.timeoutMs ?? timeoutMs) + 10_000 });
  if (result.exitCode !== 0) throw new Error(`agentOS sandbox toolkit failed: ${result.stderr || result.stdout}`);
  const payload = JSON.parse(result.stdout);
  if (!payload.ok) throw new Error(`agentOS sandbox toolkit returned error: ${result.stdout}`);
  return payload.result;
}

function adapterExcelSandboxSource(input) {
  return `
import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const adapterVersion = ${JSON.stringify(input.adapterVersion)};
const marker = ${JSON.stringify(input.marker)};
const hostEscapePath = ${JSON.stringify(input.hostEscapePath)};
const smokeRoot = await mkdtemp(join(tmpdir(), "ambient-agentos-sandbox-pi-mcp-excel-"));
const adapterRoot = join(smokeRoot, "adapter");
const workspaceRoot = join(smokeRoot, "workspace");
const piAgentDir = join(smokeRoot, "pi-agent");
const excelDir = join(workspaceRoot, "excel-files");
const previousCwd = process.cwd();
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousDirectTools = process.env.MCP_DIRECT_TOOLS;
const previousPath = process.env.PATH;

let exitCode = 0;

try {
  await installUv();
  await mkdir(adapterRoot, { recursive: true });
  await mkdir(excelDir, { recursive: true });
  await writeFile(join(adapterRoot, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2), "utf8");
  await execFileAsync("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--fund=false",
    "@mariozechner/pi-coding-agent@0.70.6",
    "pi-mcp-adapter@" + adapterVersion,
  ], { cwd: adapterRoot, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });

  await writeFile(
    join(workspaceRoot, ".mcp.json"),
    JSON.stringify(
      {
        settings: {
          toolPrefix: "server",
          directTools: false,
          idleTimeout: 1,
        },
        mcpServers: {
          excel: {
            command: "uvx",
            args: ["excel-mcp-server", "stdio"],
            lifecycle: "lazy",
            idleTimeout: 1,
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  process.env.PI_CODING_AGENT_DIR = piAgentDir;
  process.env.MCP_DIRECT_TOOLS = "__none__";
  process.env.PATH = [
    dirname(process.execPath),
    join(process.env.HOME || "/home/sandbox", ".local", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    previousPath ?? "",
  ].join(":");
  process.chdir(workspaceRoot);

  const piCodingAgentPath = join(adapterRoot, "node_modules", "@mariozechner", "pi-coding-agent", "dist", "index.js");
  const { createEventBus } = await import(pathToFileURL(piCodingAgentPath).href);
  const { loadExtensions } = await importPiExtensionLoader(piCodingAgentPath);
  const adapterEntry = join(adapterRoot, "node_modules", "pi-mcp-adapter", "index.ts");
  if (!existsSync(adapterEntry)) throw new Error("pi-mcp-adapter entrypoint not found at " + adapterEntry);

  const eventBus = createEventBus();
  const loaded = await loadExtensions([adapterEntry], workspaceRoot, eventBus);
  if (loaded.errors.length) throw new Error("Failed to load pi-mcp-adapter: " + JSON.stringify(loaded.errors));
  if (loaded.extensions.length !== 1) throw new Error("Expected one extension, loaded " + loaded.extensions.length);

  const extension = loaded.extensions[0];
  loaded.runtime.getAllTools = () => [...extension.tools.values()].map((tool) => tool.definition);
  loaded.runtime.getActiveTools = loaded.runtime.getAllTools;

  const ctx = createHeadlessExtensionContext();
  const sessionStartHandlers = extension.handlers.get("session_start") ?? [];
  for (const handler of sessionStartHandlers) {
    await handler({ type: "session_start", cwd: workspaceRoot }, ctx);
  }

  const mcp = extension.tools.get("mcp")?.definition;
  if (!mcp) throw new Error("pi-mcp-adapter did not register the mcp proxy tool.");

  const status = await callMcp(mcp, "status", {}, ctx);
  const connected = await callMcp(mcp, "connect-excel", { connect: "excel" }, ctx);
  const search = await callMcp(mcp, "search-workbook", { search: "workbook worksheet", server: "excel", includeSchemas: false }, ctx);
  const workbookPath = join(excelDir, "bridge-smoke.xlsx");
  const createWorkbook = await callMcp(mcp, "create-workbook", {
    tool: "excel_create_workbook",
    server: "excel",
    args: JSON.stringify({ filepath: workbookPath }),
  }, ctx);
  const writeData = await callMcp(mcp, "write-data", {
    tool: "excel_write_data_to_excel",
    server: "excel",
    args: JSON.stringify({
      filepath: workbookPath,
      sheet_name: "Sheet1",
      data: [
        ["metric", "value"],
        ["revenue", 120],
        ["cost", 45],
        ["profit", 75],
      ],
      start_cell: "A1",
    }),
  }, ctx);
  const readData = await callMcp(mcp, "read-data", {
    tool: "excel_read_data_from_excel",
    server: "excel",
    args: JSON.stringify({
      filepath: workbookPath,
      sheet_name: "Sheet1",
      start_cell: "A1",
      end_cell: "B4",
      preview_only: false,
    }),
  }, ctx);
  const metadata = await callMcp(mcp, "metadata", {
    tool: "excel_get_workbook_metadata",
    server: "excel",
    args: JSON.stringify({ filepath: workbookPath, include_ranges: true }),
  }, ctx);
  const hostEscapeAttempt = await callMcp(mcp, "host-escape-attempt", {
    tool: "excel_create_workbook",
    server: "excel",
    args: JSON.stringify({ filepath: hostEscapePath }),
  }, ctx);

  const report = {
    ok: true,
    adapterVersion,
    smokeRoot,
    workspaceRoot,
    piAgentDir,
    excelDir,
    proxyTool: summarizeTool(mcp),
    calls: {
      status: summarizeResult(status),
      connect: summarizeResult(connected),
      search: summarizeResult(search),
      createWorkbook: summarizeResult(createWorkbook),
      writeData: summarizeResult(writeData),
      readData: summarizeResult(readData),
      metadata: summarizeResult(metadata),
      hostEscapeAttempt: summarizeResult(hostEscapeAttempt),
    },
    workbook: {
      path: workbookPath,
      exists: existsSync(workbookPath),
    },
    containment: {
      hostEscapePath,
      hostEscapeExistsInContainer: existsSync(hostEscapePath),
    },
    env: {
      parentSecret: process.env.AGENTOS_SANDBOX_PI_MCP_PARENT_SECRET ?? null,
    },
    cacheFiles: {
      agentDirExists: existsSync(piAgentDir),
      metadataCacheExists: existsSync(join(piAgentDir, "mcp-cache.json")),
      metadataCachePreview: existsSync(join(piAgentDir, "mcp-cache.json"))
        ? safeJsonPreview(await readFile(join(piAgentDir, "mcp-cache.json"), "utf8"))
        : undefined,
    },
  };

  await shutdownExtension(extension, ctx);

  if (!report.calls.connect.text.includes("excel")) throw new Error("Excel server did not appear in connect result.");
  if (!report.calls.search.details?.count || report.calls.search.details.count < 1) throw new Error("Excel tool search returned no matches.");
  if (!report.workbook.exists) throw new Error("Expected workbook to exist at " + workbookPath);
  if (!report.calls.readData.text.includes("profit")) throw new Error("Expected readback to include written data.");
  if (report.containment.hostEscapeExistsInContainer) throw new Error("Host escape path appeared inside container.");

  console.log(marker + JSON.stringify(report));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  exitCode = 1;
  const report = {
    ok: false,
    adapterVersion,
    smokeRoot,
    error: error?.stack ?? error?.message ?? String(error),
  };
  console.log(marker + JSON.stringify(report));
  console.log(JSON.stringify(report, null, 2));
} finally {
  process.chdir(previousCwd);
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousDirectTools === undefined) delete process.env.MCP_DIRECT_TOOLS;
  else process.env.MCP_DIRECT_TOOLS = previousDirectTools;
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  if (process.env.AMBIENT_KEEP_PI_MCP_ADAPTER_SMOKE !== "1") {
    await rm(smokeRoot, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

async function installUv() {
  const existing = spawnSync("sh", ["-lc", "command -v uvx"], { encoding: "utf8" });
  if (existing.status === 0) return;
  const install = spawnSync("sh", ["-lc", "curl -LsSf https://astral.sh/uv/install.sh | sh"], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (install.status !== 0) {
    throw new Error("uv install failed: " + install.stderr + install.stdout);
  }
}

async function callMcp(mcpTool, toolCallId, params, ctx) {
  return mcpTool.execute(toolCallId, params, undefined, undefined, ctx);
}

async function shutdownExtension(extension, ctx) {
  const handlers = extension.handlers.get("session_shutdown") ?? [];
  for (const handler of handlers) {
    await handler({ type: "session_shutdown" }, ctx).catch(() => undefined);
  }
}

function createHeadlessExtensionContext() {
  const abortController = new AbortController();
  return {
    hasUI: false,
    signal: abortController.signal,
    model: undefined,
    modelRegistry: undefined,
    ui: {
      notify() {},
      setStatus() {},
    },
    reload: async () => {},
  };
}

function summarizeTool(tool) {
  return {
    name: tool.name,
    label: tool.label,
    descriptionBytes: Buffer.byteLength(tool.description ?? "", "utf8"),
    promptSnippet: tool.promptSnippet,
    parameterKeys: Object.keys(tool.parameters?.properties ?? {}),
  };
}

function summarizeResult(result) {
  const text = (result.content ?? [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\\n");
  return {
    text: text.length > 2_000 ? text.slice(0, 2_000) + "...[truncated]" : text,
    textBytes: Buffer.byteLength(text, "utf8"),
    details: result.details,
  };
}

function safeJsonPreview(text) {
  try {
    const parsed = JSON.parse(text);
    const servers = parsed?.servers && typeof parsed.servers === "object" ? Object.keys(parsed.servers) : [];
    return {
      version: parsed?.version,
      servers,
      bytes: Buffer.byteLength(text, "utf8"),
    };
  } catch {
    return { bytes: Buffer.byteLength(text, "utf8") };
  }
}

async function importPiExtensionLoader(piIndexPath) {
  const loaderPath = join(dirname(piIndexPath), "core", "extensions", "loader.js");
  return import(pathToFileURL(loaderPath).href);
}
`;
}

function waitWithTimeout(promise, ms, message) {
  if (!promise) return Promise.resolve();
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function writeStdout(text) {
  return new Promise((resolve, reject) => {
    process.stdout.write(text, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
