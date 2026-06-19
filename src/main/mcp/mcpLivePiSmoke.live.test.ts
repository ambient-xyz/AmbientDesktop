import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import {
  AmbientStreamFailureError,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./mcpAmbientFacade";
import {
  mcpLivePiSmokePrompt,
  type McpLivePiSmokeInstallPlan,
  runMcpLivePiSmoke,
} from "./mcpLivePiSmoke";
import { MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION } from "./mcpAutowireFacade";
import { createMcpServerPiToolDefinitions } from "./mcpServerPiTools";
import { createMcpToolBridgePiToolDefinitions } from "./mcpToolBridgePiTools";
import { McpToolBridge } from "./mcpToolBridge";
import {
  ToolHiveRuntimeService,
  type ToolHiveCommandExecutor,
  type ToolHiveCommandInvocation,
} from "./mcpToolRuntimeFacade";
import type { WorkflowPiProgress, WorkflowPiToolProgress } from "./mcpWorkflowLivePiSmokeFacade";

const runLive = process.env.AMBIENT_MCP_LIVE_PI_SMOKE === "1";
const liveIt = runLive ? it : it.skip;

async function runLiveMcpPiSmokeWithRetry(
  input: Parameters<typeof runMcpLivePiSmoke>[0],
): Promise<Awaited<ReturnType<typeof runMcpLivePiSmoke>>> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runMcpLivePiSmoke(input);
    } catch (error) {
      // This live fixture is intentionally idempotent: install tools return already-installed
      // state and MCP calls hit a local fake server. Retry interrupted Ambient streams even
      // when a prior attempt reached a tool boundary.
      const canReplay = error instanceof AmbientStreamFailureError && error.kind !== "user_abort" && attempt < maxAttempts;
      if (!canReplay) throw error;
    }
  }
  return runMcpLivePiSmoke(input);
}

async function fixtureMcpTools(endpoint: string) {
  const root = await mkdtemp(join(tmpdir(), "ambient-mcp-live-pi-smoke-"));
  const userDataPath = join(root, "userData");
  await mkdir(userDataPath, { recursive: true });
  const fakeThv = join(root, "thv");
  await writeFile(fakeThv, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(fakeThv, 0o755);
  const calls: ToolHiveCommandInvocation[] = [];
  const workloads = new Map<string, Record<string, unknown>>();
  const executor: ToolHiveCommandExecutor = async (invocation) => {
    calls.push(invocation);
    const command = invocation.args.slice(0, 2).join(" ");
    if (command === "registry list") return ok(JSON.stringify([context7Info]));
    if (command === "registry info") return invocation.args[2] === context7Info.name ? ok(JSON.stringify(context7Info)) : { stdout: "", stderr: "not found", exitCode: 1 };
    if (command === "group list") return ok("NAME\nambient\n");
    if (command === "group create") return ok("");
    if (command === "runtime check") return ok("runtime ok\n");
    if (invocation.args[0] === "run") {
      const workloadName = argAfter(invocation.args, "--name");
      workloads.set(workloadName, { name: workloadName, status: "running", group: "ambient", proxy_url: endpoint });
      return ok("running\n");
    }
    if (invocation.args[0] === "list") return ok(JSON.stringify([...workloads.values()]));
    if (invocation.args[0] === "stop" || invocation.args[0] === "rm") return ok("");
    return ok("[]");
  };
  const toolHive = new ToolHiveRuntimeService({
    userDataPath,
    env: {
      AMBIENT_TOOLHIVE_BINARY: fakeThv,
      PATH: process.env.PATH,
      HOME: root,
    } as NodeJS.ProcessEnv,
    executor,
    now: () => new Date("2026-05-23T00:00:00.000Z"),
  });
  const catalog = new McpInstallCatalog(toolHive);
  const workspace = { path: join(root, "workspace"), name: "workspace" };
  const approvals: string[] = [];
  const toolCallApprovals: string[] = [];
  const serverTools = createMcpServerPiToolDefinitions({
    catalog,
    toolHive,
    getThread: () => ({ id: "mcp-live-smoke-thread", collaborationMode: "agent", permissionMode: "workspace" }),
    workspace,
    resolveCandidateRef: (candidateRef) => {
      if (candidateRef === "fixture:scrapling") return scraplingLiveSmokeCandidate as unknown as Record<string, unknown>;
      if (candidateRef === "fixture:source-built") return sourceBuiltLiveSmokeCandidate as unknown as Record<string, unknown>;
      return undefined;
    },
    authorizeInstall: async ({ detail }) => {
      approvals.push(detail);
      return true;
    },
  });
  const bridge = new McpToolBridge({ catalog, toolHive, workspacePath: workspace.path });
  const toolTools = createMcpToolBridgePiToolDefinitions({
    bridge,
    getThread: () => ({ id: "mcp-live-smoke-thread", collaborationMode: "agent", permissionMode: "workspace" }),
    workspace,
    authorizeCall: async ({ detail }) => {
      toolCallApprovals.push(detail);
      return true;
    },
  });
  return { calls, approvals, toolCallApprovals, serverTools, toolTools };
}

async function startFakeMcpServer(input: {
  tool: FakeMcpToolDescriptor;
  resultText: (args: Record<string, unknown>) => string;
  structuredContent: (args: Record<string, unknown>) => Record<string, unknown>;
  failListTools?: boolean;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (request, response) => {
    const bodyText = await requestBody(request);
    const body = bodyText ? JSON.parse(bodyText) as { id?: number; method?: string; params?: Record<string, unknown> } : {};
    if (body.method === "notifications/initialized") {
      response.writeHead(202);
      response.end();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.setHeader("mcp-session-id", "ambient-live-smoke-session");
    if (body.method === "initialize") {
      sendJson(response, { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: {} } });
      return;
    }
    if (body.method === "tools/list") {
      if (input.failListTools) {
        sendJson(response, { jsonrpc: "2.0", id: body.id, error: { code: -32603, message: "kz.getTools is not a function" } });
        return;
      }
      sendJson(response, { jsonrpc: "2.0", id: body.id, result: { tools: [input.tool] } });
      return;
    }
    if (body.method === "tools/call") {
      const args = body.params?.arguments && typeof body.params.arguments === "object" && !Array.isArray(body.params.arguments)
        ? body.params.arguments as Record<string, unknown>
        : {};
      sendJson(response, {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [{ type: "text", text: input.resultText(args) }],
          structuredContent: input.structuredContent(args),
        },
      });
      return;
    }
    sendJson(response, { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "not found" } });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to start fake MCP server.");
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function requestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.end(JSON.stringify(value));
}

function ok(stdout: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout, stderr: "", exitCode: 0 };
}

function argAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${flag}`);
  return args[index + 1]!;
}

function liveIdleTimeoutMs(): number {
  const value = Number(process.env.AMBIENT_MCP_LIVE_PI_SMOKE_IDLE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 180_000;
}

function liveTestTimeoutMs(): number {
  const value = Number(process.env.AMBIENT_MCP_LIVE_PI_SMOKE_TEST_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 8 * 60_000;
}

function liveAbsoluteTimeoutMs(): number {
  const value = Number(process.env.AMBIENT_MCP_LIVE_PI_SMOKE_ABSOLUTE_TIMEOUT_MS);
  if (Number.isFinite(value) && value > 0) return Math.floor(value);
  return Math.max(1, Math.min(240_000, liveTestTimeoutMs() - 30_000));
}

const context7Info = {
  name: "io.github.stacklok/context7",
  title: "Context7",
  description: "Up-to-date documentation lookup for LLM coding agents.",
  tier: "community",
  status: "active",
  transport: "stdio",
  tools: ["query-docs"],
  repository_url: "https://github.com/upstash/context7",
  tags: ["documentation", "knowledge"],
  image: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
  permissions: {
    network: {
      outbound: {
        allow_host: ["context7.com"],
        allow_port: [443],
      },
    },
  },
  env_vars: [],
};

const context7Tool = {
  name: "query-docs",
  description: "Query documentation for a resolved library id.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const scraplingTool = {
  name: "get",
  description: "Fetch one public HTTPS page with Scrapling.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
    },
    required: ["url"],
    additionalProperties: false,
  },
};

const sourceBuiltTool = {
  name: "query",
  description: "Query the reviewed source-built Katzilla fixture.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const scraplingLiveSmokeCandidate = {
  schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
  id: "scrapling-github-server-json",
  displayName: "Scrapling MCP Server",
  source: {
    kind: "github",
    url: "https://github.com/D4Vinci/Scrapling",
    packageName: "scrapling",
    evidenceRefs: ["scrapling-server-json"],
  },
  recommendedLane: "standard-mcp",
  runtime: {
    provider: "toolhive",
    sourceKind: "server-json",
    transport: "stdio",
    package: {
      registryType: "pypi",
      identifier: "scrapling",
      runtimeHint: "uvx",
      packageArguments: [{ type: "positional", valueHint: "mcp", isFixed: true }],
    },
    updatePolicy: {
      mode: "managed-browser-security",
      reason: "Scrapling may exercise browser-backed scraping behavior, so browser engines follow Ambient's managed security-update lane while the package source remains reviewed separately.",
      evidenceRefs: ["scrapling-server-json"],
    },
    evidenceRefs: ["scrapling-server-json"],
  },
  secrets: [],
  permissions: {
    network: {
      mode: "broad",
      allowHosts: [],
      allowPorts: [80, 443],
      justification: "Scrapling fetches user-selected public web pages, so target hosts are task-dependent.",
    },
    filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
    localApps: [],
    evidenceRefs: ["scrapling-server-json"],
  },
  validationPlan: {
    preflights: ["toolhive-version", "container-runtime", "mcp-tool-discovery"],
    expectedTools: ["get"],
    smokeCall: { tool: "get", arguments: { url: "https://example.com" } },
    evidenceRefs: ["scrapling-server-json"],
  },
  evidence: [
    {
      id: "scrapling-server-json",
      type: "server-json",
      locator: "https://raw.githubusercontent.com/D4Vinci/Scrapling/main/server.json",
      summary: "Official MCP metadata declares the Scrapling PyPI package and stdio command.",
    },
  ],
  openQuestions: [],
  riskSummary: {
    level: "high",
    reasons: ["Scraping tools need explicit user approval for broad or task-dependent web egress."],
    evidenceRefs: ["scrapling-server-json"],
  },
} as const;

const sourceBuiltLiveSmokeCandidate = {
  schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
  id: "source-built-katzilla-mcp",
  displayName: "Source Built Katzilla MCP",
  source: {
    kind: "github",
    url: "https://github.com/codeislaw101/katzilla-sdk",
    resolvedCommit: "abc1234deadbeef",
    packageName: "@katzilla/mcp",
    evidenceRefs: ["source-build-review"],
  },
  recommendedLane: "standard-mcp",
  runtime: {
    provider: "toolhive",
    sourceKind: "custom-image",
    transport: "stdio",
    package: {
      registryType: "oci",
      identifier: "ambient-source-built/katzilla-mcp:abc1234",
      digest: `sha256:${"d".repeat(64)}`,
      packageArguments: [],
    },
    updatePolicy: {
      mode: "pinned",
      reason: "Built from a reviewed source commit into a local OCI image with a recorded digest.",
      evidenceRefs: ["source-build-review"],
    },
    evidenceRefs: ["source-build-review"],
  },
  secrets: [],
  permissions: {
    network: { mode: "allowlist", allowHosts: ["api.katzilla.dev"], allowPorts: [443] },
    filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
    localApps: [],
    evidenceRefs: ["source-build-review"],
  },
  validationPlan: {
    preflights: ["toolhive-runtime", "container-runtime", "source-image-digest", "mcp-tool-discovery"],
    expectedTools: ["query"],
    smokeCall: { tool: "query", arguments: { query: "health" } },
    evidenceRefs: ["source-build-review"],
  },
  evidence: [
    {
      id: "source-build-review",
      type: "other",
      locator: "source-built fixture",
      summary: "Fixture models a reviewed source-built OCI image produced from a pinned commit.",
    },
  ],
  openQuestions: [],
  riskSummary: {
    level: "medium",
    reasons: ["Runs a reviewed local image built from pinned source."],
    evidenceRefs: ["source-build-review"],
  },
} as const;

interface FakeMcpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface LiveScenario {
  label: string;
  install: McpLivePiSmokeInstallPlan;
  endpointTool: FakeMcpToolDescriptor;
  resultText: (args: Record<string, unknown>) => string;
  structuredContent: (args: Record<string, unknown>) => Record<string, unknown>;
  toolQuery: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  successText: string;
  requiredToolNames: string[];
  installApprovalIncludes: string[];
  toolCallApprovalIncludes: string;
  runSourceArg: string;
  maxToolRounds?: number;
}

const liveScenarios: LiveScenario[] = [
  {
    label: "registry Context7 install and tool call",
    install: {
      kind: "registry",
      serverQuery: "context7",
      serverId: "io.github.stacklok/context7",
    },
    endpointTool: context7Tool,
    resultText: (args) => `Fixture docs result for ${String(args.query ?? "")}`,
    structuredContent: (args) => ({ ok: true, query: args.query }),
    toolQuery: "docs",
    toolName: "query-docs",
    toolArguments: { query: "scrapling" },
    successText: "MCP_LIVE_SMOKE_CONTEXT7_DONE",
    requiredToolNames: [
      "ambient_mcp_server_search",
      "ambient_mcp_server_describe",
      "ambient_mcp_server_install",
      "ambient_mcp_server_list",
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ],
    installApprovalIncludes: ["Install Context7", "Command shape: thv run"],
    toolCallApprovalIncludes: "Call Ambient MCP tool io.github.stacklok/context7/query-docs",
    runSourceArg: "io.github.stacklok/context7",
  },
  {
    label: "Standard MCP Scrapling import and tool call",
    install: {
      kind: "standard-mcp-import",
      candidateRef: "fixture:scrapling",
      serverId: "scrapling-github-server-json",
      label: "Scrapling",
    },
    endpointTool: scraplingTool,
    resultText: (args) => `Fixture Scrapling result for ${String(args.url ?? "")}`,
    structuredContent: (args) => ({ ok: true, url: args.url }),
    toolQuery: "scraping fetch",
    toolName: "get",
    toolArguments: { url: "https://example.com" },
    successText: "MCP_LIVE_SMOKE_SCRAPLING_DONE",
    requiredToolNames: [
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
      "ambient_mcp_server_list",
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ],
    installApprovalIncludes: ["Install Scrapling MCP Server", "Catalog source: standard-mcp-import", "uvx://scrapling"],
    toolCallApprovalIncludes: "Call Ambient MCP tool scrapling-github-server-json/get",
    runSourceArg: "uvx://scrapling",
    maxToolRounds: 12,
  },
  {
    label: "source-built Standard MCP import and tool call",
    install: {
      kind: "standard-mcp-import",
      candidateRef: "fixture:source-built",
      serverId: "source-built-katzilla-mcp",
      label: "Source Built Katzilla",
    },
    endpointTool: sourceBuiltTool,
    resultText: (args) => `Fixture source-built result for ${String(args.query ?? "")}`,
    structuredContent: (args) => ({ ok: true, query: args.query }),
    toolQuery: "katzilla query",
    toolName: "query",
    toolArguments: { query: "health" },
    successText: "MCP_LIVE_SMOKE_SOURCE_BUILT_DONE",
    requiredToolNames: [
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
      "ambient_mcp_server_list",
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ],
    installApprovalIncludes: ["Command shape: thv run", "ambient-source-built/katzilla-mcp:abc1234"],
    toolCallApprovalIncludes: "Call Ambient MCP tool source-built-katzilla-mcp/query",
    runSourceArg: "ambient-source-built/katzilla-mcp:abc1234",
    maxToolRounds: 12,
  },
];

describe("MCP live Pi fixture smoke", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  for (const scenario of liveScenarios) {
    liveIt(
      `has live Ambient/Pi drive ${scenario.label}`,
      async () => {
        const endpoint = await startFakeMcpServer({
          tool: scenario.endpointTool,
          resultText: scenario.resultText,
          structuredContent: scenario.structuredContent,
        });
        servers.push(endpoint);
        const fixture = await fixtureMcpTools(endpoint.url);
        const progress: WorkflowPiProgress[] = [];
        const toolProgress: WorkflowPiToolProgress[] = [];
        let report: Awaited<ReturnType<typeof runMcpLivePiSmoke>>;
        try {
          report = await runLiveMcpPiSmokeWithRetry({
            apiKey: readLiveAmbientProviderApiKey({ purpose: "fixture-backed MCP live Pi smoke" }),
            baseUrl: liveAmbientProviderBaseUrl(),
            model: liveAmbientProviderModel({
              preferredModelEnvNames: ["AMBIENT_MCP_LIVE_PI_SMOKE_MODEL", "AMBIENT_LIVE_MODEL"],
              fallbackModel: AMBIENT_DEFAULT_MODEL,
            }),
            prompt: mcpLivePiSmokePrompt({
              install: scenario.install,
              toolQuery: scenario.toolQuery,
              toolName: scenario.toolName,
              toolArguments: scenario.toolArguments,
              successText: scenario.successText,
            }),
            tools: [...fixture.serverTools, ...fixture.toolTools],
            requiredToolNames: scenario.requiredToolNames,
            successText: scenario.successText,
            maxToolRounds: scenario.maxToolRounds ?? 8,
            maxTokens: 2_000,
            idleTimeoutMs: liveIdleTimeoutMs(),
            absoluteTimeoutMs: liveAbsoluteTimeoutMs(),
            onProgress: (event) => progress.push(event),
            onToolProgress: (event) => toolProgress.push(event),
          });
        } catch (error) {
          throw new Error(
            `Live Ambient/Pi MCP smoke failed for ${scenario.label}: ${errorMessage(error)}\n${JSON.stringify(liveSmokeProgressDigest({ progress, toolProgress }), null, 2)}`,
            { cause: error },
          );
        }

        expect(report.diagnostics, JSON.stringify({
          label: scenario.label,
          observedToolNames: report.observedToolNames,
          finalText: report.finalText,
          diagnostics: report.diagnostics,
        }, null, 2)).toEqual([]);
        expect(report.observedToolNames).toEqual(expect.arrayContaining(scenario.requiredToolNames));
        expect(report.finalText).toContain(scenario.successText);
        expect(fixture.approvals.some((approval) => scenario.installApprovalIncludes.every((expected) => approval.includes(expected)))).toBe(true);
        expect(fixture.toolCallApprovals.some((approval) => approval.includes(scenario.toolCallApprovalIncludes))).toBe(true);
        expect(fixture.calls.map((call) => call.args[0])).toEqual(expect.arrayContaining(["run", "list"]));
        expect(fixture.calls.some((call) => call.args[0] === "run" && call.args.includes(scenario.runSourceArg))).toBe(true);
        expect(["Ambient", "GMI Cloud"]).toContain(liveAmbientProviderLabel());
      },
      liveTestTimeoutMs(),
    );
  }

  liveIt(
    "has live Ambient/Pi diagnose a validation_failed Standard MCP import",
    async () => {
      const endpoint = await startFakeMcpServer({
        tool: scraplingTool,
        resultText: (args) => `Fixture Scrapling result for ${String(args.url ?? "")}`,
        structuredContent: (args) => ({ ok: true, url: args.url }),
        failListTools: true,
      });
      servers.push(endpoint);
      const fixture = await fixtureMcpTools(endpoint.url);
      const progress: WorkflowPiProgress[] = [];
      const toolProgress: WorkflowPiToolProgress[] = [];
      let report: Awaited<ReturnType<typeof runMcpLivePiSmoke>>;
      try {
        report = await runLiveMcpPiSmokeWithRetry({
          apiKey: readLiveAmbientProviderApiKey({ purpose: "fixture-backed MCP validation failure live Pi smoke" }),
          baseUrl: liveAmbientProviderBaseUrl(),
          model: liveAmbientProviderModel({
            preferredModelEnvNames: ["AMBIENT_MCP_LIVE_PI_SMOKE_MODEL", "AMBIENT_LIVE_MODEL"],
            fallbackModel: AMBIENT_DEFAULT_MODEL,
          }),
          prompt: mcpLivePiSmokePrompt({
            install: {
              kind: "standard-mcp-import",
              candidateRef: "fixture:scrapling",
              serverId: "scrapling-github-server-json",
              label: "Scrapling",
            },
            expectedOutcome: "validation-failed",
            diagnosticsServerId: "scrapling-github-server-json",
            expectedDiagnosticText: "kz.getTools is not a function",
            successText: "MCP_LIVE_SMOKE_VALIDATION_FAILED_DONE",
          }),
          tools: [...fixture.serverTools, ...fixture.toolTools],
          requiredToolNames: [
            "ambient_mcp_standard_import_describe",
            "ambient_mcp_standard_import_install",
            "ambient_mcp_server_list",
            "ambient_mcp_server_diagnostics",
          ],
          successText: "MCP_LIVE_SMOKE_VALIDATION_FAILED_DONE",
          maxToolRounds: 10,
          maxTokens: 2_000,
          idleTimeoutMs: liveIdleTimeoutMs(),
          absoluteTimeoutMs: liveAbsoluteTimeoutMs(),
          onProgress: (event) => progress.push(event),
          onToolProgress: (event) => toolProgress.push(event),
        });
      } catch (error) {
        throw new Error(
          `Live Ambient/Pi MCP validation-failure smoke failed: ${errorMessage(error)}\n${JSON.stringify(liveSmokeProgressDigest({ progress, toolProgress }), null, 2)}`,
          { cause: error },
        );
      }

      expect(report.diagnostics, JSON.stringify({
        observedToolNames: report.observedToolNames,
        finalText: report.finalText,
        diagnostics: report.diagnostics,
      }, null, 2)).toEqual([]);
      expect(report.observedToolNames).toEqual(expect.arrayContaining([
        "ambient_mcp_standard_import_describe",
        "ambient_mcp_standard_import_install",
        "ambient_mcp_server_list",
        "ambient_mcp_server_diagnostics",
      ]));
      expect(report.finalText).toContain("MCP_LIVE_SMOKE_VALIDATION_FAILED_DONE");
      expect(fixture.calls.some((call) => call.args[0] === "run" && call.args.includes("uvx://scrapling"))).toBe(true);
      expect(fixture.calls.some((call) => call.args[0] === "logs" && call.args.includes("ambient-scrapling-github-server-json"))).toBe(true);
      expect(fixture.calls.map((call) => call.args.join(" ")).join("\n")).not.toContain("supergateway");
      expect(["Ambient", "GMI Cloud"]).toContain(liveAmbientProviderLabel());
    },
    liveTestTimeoutMs(),
  );
});

function liveSmokeProgressDigest(input: { progress: WorkflowPiProgress[]; toolProgress: WorkflowPiToolProgress[] }) {
  return {
    progressEvents: input.progress.length,
    toolEvents: input.toolProgress.length,
    completedTools: [...new Set(input.toolProgress.filter((event) => event.status === "done").map((event) => event.toolName))],
    lastProgress: input.progress.slice(-5).map((event) => ({
      stage: event.stage,
      elapsedMs: event.elapsedMs,
      idleElapsedMs: event.idleElapsedMs,
      outputChars: event.outputChars,
      thinkingChars: event.thinkingChars,
      timeoutMode: event.timeoutMode,
      idleTimeoutMs: event.idleTimeoutMs,
      absoluteTimeoutMs: event.absoluteTimeoutMs,
    })),
    lastToolProgress: input.toolProgress.slice(-12).map((event) => ({
      toolName: event.toolName,
      status: event.status,
      elapsedMs: event.elapsedMs,
      inputSummary: event.inputSummary,
      resultSummary: event.resultSummary,
      error: event.error,
    })),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
