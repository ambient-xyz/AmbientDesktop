import { createEventBus } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const adapterVersion = process.env.AMBIENT_PI_MCP_ADAPTER_VERSION ?? "2.5.4";
const smokeRoot = await mkdtemp(join(tmpdir(), "ambient-pi-mcp-adapter-excel-"));
const adapterRoot = join(smokeRoot, "adapter");
const workspaceRoot = join(smokeRoot, "workspace");
const piAgentDir = join(smokeRoot, "pi-agent");
const excelDir = join(workspaceRoot, "excel-files");
const marker = "__AMBIENT_PI_MCP_ADAPTER_EXCEL_SMOKE__";
const previousCwd = process.cwd();
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousDirectTools = process.env.MCP_DIRECT_TOOLS;
const previousPath = process.env.PATH;
const { loadExtensions } = await importPiExtensionLoader();

let exitCode = 0;

try {
  await mkdir(adapterRoot, { recursive: true });
  await mkdir(excelDir, { recursive: true });
  await writeFile(join(adapterRoot, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2), "utf8");
  await execFileAsync("pnpm", ["add", `pi-mcp-adapter@${adapterVersion}`], {
    cwd: adapterRoot,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });

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
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    previousPath ?? "",
  ].join(":");
  process.chdir(workspaceRoot);

  const adapterEntry = join(adapterRoot, "node_modules", "pi-mcp-adapter", "index.ts");
  if (!existsSync(adapterEntry)) throw new Error(`pi-mcp-adapter entrypoint not found at ${adapterEntry}`);

  const eventBus = createEventBus();
  const loaded = await loadExtensions([adapterEntry], workspaceRoot, eventBus);
  if (loaded.errors.length) throw new Error(`Failed to load pi-mcp-adapter: ${JSON.stringify(loaded.errors)}`);
  if (loaded.extensions.length !== 1) throw new Error(`Expected one extension, loaded ${loaded.extensions.length}`);

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
  const candidateTool = firstToolName(search) ?? firstToolName(connected);
  const describe = candidateTool ? await callMcp(mcp, "describe-candidate", { describe: candidateTool }, ctx) : undefined;
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

  const report = {
    ok: true,
    adapterVersion,
    workspaceRoot,
    piAgentDir,
    excelDir,
    proxyTool: summarizeTool(mcp),
    calls: {
      status: summarizeResult(status),
      connect: summarizeResult(connected),
      search: summarizeResult(search),
      ...(describe ? { describe: summarizeResult(describe) } : {}),
      createWorkbook: summarizeResult(createWorkbook),
      writeData: summarizeResult(writeData),
      readData: summarizeResult(readData),
      metadata: summarizeResult(metadata),
    },
    workbook: {
      path: workbookPath,
      exists: existsSync(workbookPath),
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
  console.log(`${marker}${JSON.stringify(report)}`);
  console.log(JSON.stringify(report, null, 2));

  if (!report.calls.connect.text.includes("excel")) {
    throw new Error(`Excel server did not appear in connect result: ${report.calls.connect.text}`);
  }
  if (!report.calls.search.details?.count || report.calls.search.details.count < 1) {
    throw new Error(`Excel tool search returned no matches: ${report.calls.search.text}`);
  }
  if (!report.workbook.exists) {
    throw new Error(`Expected workbook to exist at ${workbookPath}`);
  }
  if (!report.calls.readData.text.includes("profit")) {
    throw new Error(`Expected readback to include written data: ${report.calls.readData.text}`);
  }
} catch (error) {
  exitCode = exitCode || 1;
  const report = {
    ok: false,
    adapterVersion,
    smokeRoot,
    error: error?.stack ?? error?.message ?? String(error),
  };
  console.log(`${marker}${JSON.stringify(report)}`);
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

async function callMcp(mcpTool, toolCallId, params, ctx) {
  const result = await mcpTool.execute(toolCallId, params, undefined, undefined, ctx);
  return result;
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
    .join("\n");
  return {
    text: text.length > 2_000 ? `${text.slice(0, 2_000)}...[truncated]` : text,
    textBytes: Buffer.byteLength(text, "utf8"),
    details: result.details,
  };
}

function firstToolName(result) {
  const matches = result.details?.matches;
  if (Array.isArray(matches)) {
    const first = matches.find((entry) => entry && typeof entry.tool === "string");
    if (first) return first.tool;
  }
  const tools = result.details?.tools;
  if (Array.isArray(tools)) return tools.find((tool) => typeof tool === "string");
  return undefined;
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

async function importPiExtensionLoader() {
  const piIndexPath = fileURLToPath(import.meta.resolve("@mariozechner/pi-coding-agent"));
  const loaderPath = join(dirname(piIndexPath), "core", "extensions", "loader.js");
  return import(pathToFileURL(loaderPath).href);
}
