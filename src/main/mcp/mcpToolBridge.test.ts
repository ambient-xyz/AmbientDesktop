import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import {
  createMcpHttpClient,
  McpToolBridge,
  mcpAggregationReadinessText,
  mcpToolArgumentValidationErrorText,
  mcpToolCallOutputLooksLikeHtmlError,
  mcpToolCallResultText,
  mcpToolDescribeText,
  mcpToolDescriptorReviewText,
  mcpToolPolicyUpdatePreviewText,
  mcpToolPolicyUpdateResultText,
  mcpToolSearchResultsText,
  mcpToolTimeoutHintForDescriptor,
  type McpToolBridgeOptions,
  validateMcpToolArguments,
} from "./mcpToolBridge";
import {
  TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
  ToolHiveRuntimeService,
  type ToolHiveCommandExecutor,
  type ToolHiveCommandInvocation,
} from "../tool-runtime/toolHiveRuntimeService";
import { mcpManagedFileExchangeForWorkload } from "./mcpManagedFileExchange";

describe("McpToolBridge", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("discovers installed ToolHive MCP tools, snapshots descriptors globally, and calls with schema validation", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [context7Tool],
      callText: (name, args) => `Called ${name} with ${String(args.query)}`,
    });
    servers.push(endpoint);
    const { bridge, service } = await fixtureBridge(endpoint.url);

    const results = await bridge.searchTools({ query: "docs" });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      toolRef: "io.github.stacklok/context7/query-docs",
      name: "query-docs",
      reviewStatus: "trusted",
    });
    expect(mcpToolSearchResultsText(results)).toContain("ambient_mcp_tool_describe");
    const state = await service.readState();
    expect(state.installedServers[0]).toMatchObject({
      workloadName: "ambient-context7",
      toolDescriptorReviewStatus: "trusted",
    });
    expect(state.installedServers[0].lastKnownToolDescriptors).toHaveLength(1);

    const descriptor = await bridge.describeTool({ toolName: "query-docs", serverId: "io.github.stacklok/context7" });
    expect(mcpToolDescribeText(descriptor)).toContain('"query"');
    expect(mcpToolDescribeText(descriptor)).toContain("Tool ref: io.github.stacklok/context7/query-docs");
    const descriptorByShortServerName = await bridge.describeTool({ toolName: "query-docs", serverId: "context7" });
    expect(descriptorByShortServerName.serverId).toBe("io.github.stacklok/context7");
    expect(validateMcpToolArguments(descriptor.inputSchema, {})).toEqual(["$.query is required"]);
    await expect(bridge.callTool({ toolName: "query-docs", serverId: "io.github.stacklok/context7", arguments: {} })).rejects.toThrow("expected top-level required field: query");

    const call = await bridge.callTool({
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { query: "scrapling" },
    });
    expect(call.text).toContain("Called query-docs with scrapling");
    expect(call.text).toContain("Structured content:");
    expect(call.output.truncated).toBe(false);
  });

  it("adds a managed file exchange diagnostic when a staged input exists but the MCP reports it missing", async () => {
    const fileTool = {
      name: "render-csv",
      description: "Render a CSV file.",
      inputSchema: {
        type: "object",
        properties: {
          csv_path: { type: "string" },
        },
        required: ["csv_path"],
        additionalProperties: false,
      },
    };
    const endpoint = await startFakeMcpServer({
      tools: [fileTool],
      callText: (_name, args) => `File not found: ${String(args.csv_path)}`,
      callIsError: true,
    });
    servers.push(endpoint);
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-file-diagnostic-"));
    const exchange = mcpManagedFileExchangeForWorkload(join(root, "state"), "ambient-csvglow-standard-mcp");
    const { bridge, service } = await fixtureBridgeWithInstalledServers([{
      serverId: "csvglow-standard-mcp",
      workloadName: "ambient-csvglow-standard-mcp",
      endpoint: endpoint.url,
      permissionProfile: {
        network: { outbound: { insecure_allow_all: false } },
        filesystem: {
          extraMounts: [{
            path: `${exchange.containerPath}/*`,
            containerPath: exchange.containerPath,
            mode: "read-write",
          }],
        },
      },
    }]);
    const state = await service.readState();
    state.installedServers[0] = {
      ...state.installedServers[0]!,
      registrySource: "standard-mcp-import",
      managedFileExchange: exchange,
      runtimeVolumes: [{
        hostPath: exchange.hostPath,
        containerPath: exchange.containerPath,
        mode: "rw",
        purpose: "ambient-mcp-file-exchange",
      }],
    };
    await service.writeState(state);

    await expect(bridge.callTool({
      toolName: "render-csv",
      serverId: "csvglow-standard-mcp",
      arguments: {},
      fileInputs: [{
        argumentPath: "csv_path",
        filename: "sample.csv",
        content: "name,score\nAda,10\n",
      }],
    })).rejects.toThrow(/managed file exchange visibility issue/);
  });

  it("describes output path hints and surfaces generated managed exchange artifacts", async () => {
    const dashboardTool = {
      name: "generate_dashboard",
      description: "Generate a dashboard from a CSV file.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string" },
          output_path: {
            anyOf: [{ type: "string" }, { type: "null" }],
            default: null,
            title: "Output Path",
          },
        },
        required: ["file_path"],
        additionalProperties: false,
      },
    };
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-file-artifact-"));
    const exchange = mcpManagedFileExchangeForWorkload(join(root, "state"), "ambient-csvglow-standard-mcp");
    const endpoint = await startFakeMcpServer({
      tools: [dashboardTool],
      callText: (_name, args) => {
        const outputPath = String(args.output_path);
        writeFileSync(join(exchange.hostPath, basename(outputPath)), "<html><body>dashboard</body></html>", "utf8");
        return JSON.stringify({ success: true, output_path: outputPath });
      },
    });
    servers.push(endpoint);
    const { bridge, service } = await fixtureBridgeWithInstalledServers([{
      serverId: "csvglow-standard-mcp",
      workloadName: "ambient-csvglow-standard-mcp",
      endpoint: endpoint.url,
      permissionProfile: {
        network: { outbound: { insecure_allow_all: false } },
        filesystem: {
          extraMounts: [{
            path: `${exchange.containerPath}/*`,
            containerPath: exchange.containerPath,
            mode: "read-write",
          }],
        },
      },
    }]);
    const state = await service.readState();
    state.installedServers[0] = {
      ...state.installedServers[0]!,
      registrySource: "standard-mcp-import",
      managedFileExchange: exchange,
      runtimeVolumes: [{
        hostPath: exchange.hostPath,
        containerPath: exchange.containerPath,
        mode: "rw",
        purpose: "ambient-mcp-file-exchange",
      }],
    };
    await service.writeState(state);

    const descriptor = await bridge.describeTool({ toolName: "generate_dashboard", serverId: "csvglow-standard-mcp" });
    expect(mcpToolDescribeText(descriptor)).toContain("Managed output path hints:");
    expect(mcpToolDescribeText(descriptor)).toContain("output_path");

    const result = await bridge.callTool({
      toolName: "generate_dashboard",
      serverId: "csvglow-standard-mcp",
      arguments: {
        file_path: "name,score\nAda,10\n",
        output_path: "dashboard.html",
      },
    });

    expect(result.managedFileArtifacts).toHaveLength(1);
    expect(result.managedFileArtifacts[0]?.workspacePath).toMatch(/^\.ambient\/mcp-outputs\/\d{4}-\d{2}-\d{2}\//);
    expect(mcpToolCallResultText(result)).toContain("Managed MCP file artifacts:");
    expect(mcpToolCallResultText(result)).toContain("dashboard-");
  });

  it("keeps installed MCP tool search compact and defaults to a bounded top set", async () => {
    const verboseTools = Array.from({ length: 12 }, (_, index) => ({
      name: `tool-${String(index + 1).padStart(2, "0")}`,
      description: `Tool ${index + 1}. ${"Very long capability description. ".repeat(30)}`,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    }));
    const endpoint = await startFakeMcpServer({
      tools: verboseTools,
      callText: (name) => `Called ${name}`,
    });
    servers.push(endpoint);
    const { bridge } = await fixtureBridge(endpoint.url);

    const results = await bridge.searchTools({ refresh: true });
    expect(results).toHaveLength(8);
    const text = mcpToolSearchResultsText(results);

    expect(text).toContain("descriptionPreview=");
    expect(text).toContain("Search rows intentionally include only description previews");
    expect(text.length).toBeLessThan(5_000);
    expect(text).not.toContain("Very long capability description. Very long capability description. Very long capability description. Very long capability description. Very long capability description. Very long capability description. Very long capability description. Very long capability description. Very long capability description. Very long capability description.");
  });

  it("adds actionable repair hints for wrapped MCP tool argument objects", () => {
    const rangeTool = {
      toolRef: "gradusmusic-notation-mcp-standard-mcp/theory_validate_ranges",
      inputSchema: {
        type: "object",
        properties: {
          parts: { type: "array", items: { type: "object" } },
          notes: { type: "array", items: { type: "object" } },
        },
        required: ["parts", "notes"],
        additionalProperties: false,
      },
    };

    const text = mcpToolArgumentValidationErrorText(rangeTool, {
      score: {
        parts: [],
        notes: [],
      },
    });

    expect(text).toContain("$.parts is required");
    expect(text).toContain("$.score is not allowed");
    expect(text).toContain("expected top-level required fields: parts, notes");
    expect(text).toContain("move parts, notes out of score");
  });

  it("classifies HTML error page outputs as tool behavior failures", () => {
    const result = {
      descriptor: {
        serverId: "stooq-mcp-source-mcp",
        workloadName: "ambient-stooq-mcp-source-mcp",
        name: "get_stock_data",
      },
      text: "<html><head><title>404 Not Found</title></head><body>Not Found</body></html>",
      output: {
        text: "<html><head><title>404 Not Found</title></head><body>Not Found</body></html>",
        truncated: false,
        totalChars: 78,
        previewChars: 78,
        redacted: false,
        redactionCount: 0,
      },
    } as any;

    expect(mcpToolCallOutputLooksLikeHtmlError(result)).toBe(true);
    expect(mcpToolCallResultText(result)).toContain("looks like an HTML error page");
  });

  it("keeps server-selected tool search useful when prompts include extra task words", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [echoTool],
      callText: (name, args) => `Called ${name} with ${String(args.message)}`,
    });
    servers.push(endpoint);
    const { bridge } = await fixtureBridgeWithInstalledServers([
      {
        serverId: "modelcontextprotocol-server-everything-standard-mcp",
        workloadName: "ambient-modelcontextprotocol-server-everything-standard-mcp-87a99ff6",
        endpoint: endpoint.url,
      },
    ]);

    const results = await bridge.searchTools({
      serverId: "modelcontextprotocol-server-everything-standard-mcp",
      query: "echo diagnostic sample",
    });

    expect(results.map((tool) => tool.name)).toEqual(["echo"]);
  });

  it("resets streamable HTTP MCP idle timeout on response body activity", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [context7Tool],
      callText: (name, args) => `Called ${name} with ${String(args.query)}`,
      callResponseMode: "chunked-json",
      callChunkDelayMs: 20,
    });
    servers.push(endpoint);
    const activities: string[] = [];
    const { bridge } = await fixtureBridge(endpoint.url, {
      timeoutMs: 40,
    });

    const call = await bridge.callTool({
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { query: "scrapling" },
      onActivity: (activity) => activities.push(activity.source),
    });

    expect(call.text).toContain("Called query-docs with scrapling");
    expect(activities).toContain("response-headers");
    expect(activities).toContain("response-body");
  });

  it("fails silent streamable HTTP MCP calls with an idle diagnostic", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [context7Tool],
      callText: (name, args) => `Called ${name} with ${String(args.query)}`,
      callResponseMode: "silent-json",
      callChunkDelayMs: 80,
    });
    servers.push(endpoint);
    const { bridge } = await fixtureBridge(endpoint.url, {
      timeoutMs: 35,
    });

    await expect(bridge.callTool({
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { query: "scrapling" },
    })).rejects.toThrow(/stalled after 35 ms without streamable-http tools\/call activity/);
  });

  it("uses descriptor timeout hints for Scrapling-style public web MCP calls", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [scraplingTool],
      callText: (name, args) => `Called ${name} with ${String(args.url)}`,
      callResponseMode: "silent-json",
      callChunkDelayMs: 80,
    });
    servers.push(endpoint);
    const { bridge } = await fixtureBridgeWithInstalledServers([
      {
        serverId: "io.github.d4vinci/scrapling",
        workloadName: "ambient-scrapling",
        endpoint: endpoint.url,
        permissionProfile: { network: { outbound: { insecure_allow_all: true } } },
      },
    ], {
      timeoutMs: 35,
    });

    const descriptor = await bridge.describeTool({ toolName: "get", serverId: "io.github.d4vinci/scrapling" });
    expect(descriptor.timeoutHint).toMatchObject({
      source: "descriptor",
      idleTimeoutMs: 120_000,
      maxRunMs: 600_000,
      matchedSignals: ["public-web"],
    });
    expect(mcpToolDescribeText(descriptor)).toContain("Timeout hint: idle=120000ms; maxRun=600000ms");

    const call = await bridge.callTool({
      toolName: "get",
      serverId: "io.github.d4vinci/scrapling",
      arguments: { url: "https://example.com" },
    });

    expect(call.text).toContain("Called get with https://example.com");
  });

  it("keeps an MCP max-run cap even when endpoint activity continues", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [context7Tool],
      callText: (name, args) => `Called ${name} with ${String(args.query)}`,
      callResponseMode: "silent-json",
      callChunkDelayMs: 80,
    });
    servers.push(endpoint);
    const client = createMcpHttpClient(endpoint.url, {
      fetchImpl: fetch,
      timeoutMs: 1_000,
      maxRunMs: 35,
    });

    await expect(client.callTool("query-docs", { query: "scrapling" })).rejects.toThrow(/exceeded 35 ms max run/);
  });

  it("classifies MCP timeout hints from descriptors", () => {
    expect(mcpToolTimeoutHintForDescriptor({
      serverId: "io.github.d4vinci/scrapling",
      name: "get",
      description: "Fetch one public HTTPS page with Scrapling.",
      inputSchema: scraplingTool.inputSchema,
    }, 35)).toMatchObject({
      source: "descriptor",
      idleTimeoutMs: 120_000,
      maxRunMs: 600_000,
      matchedSignals: ["public-web"],
    });
    expect(mcpToolTimeoutHintForDescriptor({
      serverId: "ghidramcp-guided-local-bridge",
      name: "list_functions",
      description: "List all functions in the current Ghidra database.",
      inputSchema: ghidraListFunctionsTool.inputSchema,
    }, 35)).toMatchObject({
      source: "descriptor",
      idleTimeoutMs: 180_000,
      maxRunMs: 900_000,
      matchedSignals: ["heavy-analysis"],
    });
    expect(mcpToolTimeoutHintForDescriptor({
      serverId: "io.github.example/meta",
      name: "version",
      description: "Return server version.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    }, 35)).toMatchObject({
      source: "descriptor",
      idleTimeoutMs: 35,
      maxRunMs: 120_000,
      matchedSignals: ["quick-read"],
    });
  });

  it("resets SSE MCP idle timeout on progress events before the final response", async () => {
    const endpoint = await startFakeSseMcpServer({
      tools: [ghidraListFunctionsTool],
      callText: (name) => `Called ${name}`,
      callProgressEvents: 3,
      callProgressDelayMs: 20,
    });
    servers.push(endpoint);
    const activities: string[] = [];
    const { bridge } = await fixtureGuidedBridge(endpoint.url, {
      timeoutMs: 40,
    });

    const call = await bridge.callTool({
      serverId: "ghidramcp-guided-local-bridge",
      toolName: "list_functions",
      arguments: {},
      onActivity: (activity) => activities.push(activity.source),
    });

    expect(call.text).toContain("Called list_functions");
    expect(activities).toContain("sse-event");
    expect(activities).toContain("sse-response");
  });

  it("matches natural-language multi-term tool searches without requiring one contiguous phrase", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [scraplingTool],
      callText: (name, args) => `Called ${name} with ${String(args.url)}`,
    });
    servers.push(endpoint);
    const { bridge } = await fixtureBridge(endpoint.url);

    await expect(bridge.searchTools({ query: "scraping fetch" })).resolves.toMatchObject([{ name: "get" }]);
    await expect(bridge.searchTools({ query: "get fetch scrape" })).resolves.toMatchObject([{ name: "get" }]);
  });

  it("surfaces installed Scrapling for URL and public knowledge retrieval searches", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [scraplingTool],
      callText: (name, args) => `Called ${name} with ${String(args.url)}`,
    });
    servers.push(endpoint);
    const { bridge } = await fixtureBridgeWithInstalledServers([
      {
        serverId: "io.github.d4vinci/scrapling",
        workloadName: "ambient-scrapling",
        endpoint: endpoint.url,
      },
    ]);

    await expect(bridge.searchTools({ query: "https://example.com" })).resolves.toMatchObject([{ name: "get" }]);
    await expect(bridge.searchTools({
      query: "Please retrieve https://example.com with the best installed public page retrieval capability. Prefer installed Scrapling over browser_content if it is available.",
    })).resolves.toMatchObject([{ name: "get" }]);
    await expect(bridge.searchTools({ query: "public web page knowledge retrieval" })).resolves.toMatchObject([{ name: "get" }]);
  });

  it("marks descriptor drift as needs-review and blocks subsequent tool calls", async () => {
    const tools: unknown[] = [context7Tool];
    const endpoint = await startFakeMcpServer({
      tools,
      callText: () => "should not run after drift",
    });
    servers.push(endpoint);
    const descriptorDriftEvents: unknown[] = [];
    const { bridge, service } = await fixtureBridge(endpoint.url, {
      onDescriptorDrift: (event) => {
        descriptorDriftEvents.push(event);
      },
    });

    await bridge.searchTools({ serverId: "io.github.stacklok/context7" });
    const trustedState = (await service.readState()).installedServers[0];
    const previousDescriptorHash = trustedState.lastKnownToolDescriptorHash;
    expect(previousDescriptorHash).toBeTruthy();
    expect(descriptorDriftEvents).toEqual([]);
    tools[0] = {
      ...context7Tool,
      description: "Changed docs lookup contract.",
      inputSchema: {
        type: "object",
        properties: { library: { type: "string" } },
        required: ["library"],
        additionalProperties: false,
      },
    };
    const refreshed = await bridge.searchTools({ serverId: "io.github.stacklok/context7", refresh: true });
    expect(refreshed[0].reviewStatus).toBe("needs-review");
    const driftedState = (await service.readState()).installedServers[0];
    expect(driftedState).toMatchObject({
      toolDescriptorReviewStatus: "needs-review",
    });
    expect(descriptorDriftEvents).toEqual([
      expect.objectContaining({
        serverId: "io.github.stacklok/context7",
        workloadName: "ambient-context7",
        previousDescriptorHash,
        descriptorHash: driftedState.lastKnownToolDescriptorHash,
      }),
    ]);
    await expect(bridge.callTool({
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { library: "scrapling" },
    })).rejects.toThrow("needs descriptor review");

    const review = await bridge.reviewToolDescriptors({ serverId: "io.github.stacklok/context7" });
    expect(review).toMatchObject({
      reviewStatus: "needs-review",
      descriptorHash: driftedState.lastKnownToolDescriptorHash,
    });
    const accepted = await bridge.acceptToolDescriptorReview({
      serverId: "io.github.stacklok/context7",
      expectedDescriptorHash: driftedState.lastKnownToolDescriptorHash,
    });
    expect(accepted.status).toBe("trusted");
    expect(accepted.review.reviewStatus).toBe("trusted");
  });

  it("detects changed text, required-field changes, removed tools, and added tools as descriptor drift", async () => {
    const tools: unknown[] = [context7Tool, deleteDocsTool];
    const endpoint = await startFakeMcpServer({
      tools,
      callText: () => "should not run after descriptor matrix drift",
    });
    servers.push(endpoint);
    const descriptorDriftEvents: unknown[] = [];
    const { bridge, service } = await fixtureBridge(endpoint.url, {
      onDescriptorDrift: (event) => {
        descriptorDriftEvents.push(event);
      },
    });

    const trusted = await bridge.searchTools({ serverId: "io.github.stacklok/context7", refresh: true });
    expect(trusted.map((tool) => tool.name)).toEqual(["delete-docs", "query-docs"]);
    const previousDescriptorHash = (await service.readState()).installedServers[0].lastKnownToolDescriptorHash;
    expect(previousDescriptorHash).toBeTruthy();

    tools.splice(0, tools.length, {
      ...context7Tool,
      description: "Changed docs lookup contract that now requires a library id.",
      inputSchema: {
        type: "object",
        properties: {
          library: { type: "string" },
          query: { type: "string" },
        },
        required: ["library", "query"],
        additionalProperties: false,
      },
    }, summarizeDocsTool);

    const refreshed = await bridge.searchTools({ serverId: "io.github.stacklok/context7", refresh: true });
    expect(refreshed.map((tool) => [tool.name, tool.reviewStatus])).toEqual([
      ["query-docs", "needs-review"],
      ["summarize-docs", "needs-review"],
    ]);
    const driftedState = (await service.readState()).installedServers[0];
    expect(driftedState).toMatchObject({
      toolDescriptorReviewStatus: "needs-review",
      lastKnownToolDescriptors: [
        expect.objectContaining({ name: "query-docs", description: expect.stringContaining("Changed docs lookup") }),
        expect.objectContaining({ name: "summarize-docs" }),
      ],
    });
    expect(driftedState.lastKnownToolDescriptors?.some((tool) => (tool as Record<string, unknown>).name === "delete-docs")).toBe(false);
    expect(descriptorDriftEvents).toEqual([
      expect.objectContaining({
        serverId: "io.github.stacklok/context7",
        workloadName: "ambient-context7",
        previousDescriptorHash,
        descriptorHash: driftedState.lastKnownToolDescriptorHash,
      }),
    ]);

    await expect(bridge.describeTool({ toolName: "delete-docs", serverId: "io.github.stacklok/context7" })).rejects.toThrow("No installed Ambient MCP tool");
    await expect(bridge.callTool({
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { library: "react", query: "hooks" },
    })).rejects.toThrow("needs descriptor review");
    await expect(bridge.callTool({
      toolName: "summarize-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { library: "react" },
    })).rejects.toThrow("needs descriptor review");

    const review = await bridge.reviewToolDescriptors({ serverId: "io.github.stacklok/context7" });
    expect(review.reviewStatus).toBe("needs-review");
    expect(review.tools.map((tool) => tool.name)).toEqual(["query-docs", "summarize-docs"]);
    expect(mcpToolDescriptorReviewText(review)).toContain("summarize-docs");
  });

  it("keeps MCP search, describe, and call identity stable across tool refs and ambiguous short names", async () => {
    const primaryEndpoint = await startFakeMcpServer({
      tools: [context7Tool],
      callText: (name, args) => `Primary called ${name} with ${String(args.query)}`,
    });
    const secondaryEndpoint = await startFakeMcpServer({
      tools: [context7Tool],
      callText: (name, args) => `Secondary called ${name} with ${String(args.query)}`,
    });
    servers.push(primaryEndpoint, secondaryEndpoint);
    const { bridge } = await fixtureBridgeWithInstalledServers([
      {
        serverId: "io.github.stacklok/context7",
        workloadName: "ambient-context7",
        endpoint: primaryEndpoint.url,
      },
      {
        serverId: "io.github.example/context7",
        workloadName: "ambient-example-context7",
        endpoint: secondaryEndpoint.url,
      },
    ]);

    await expect(bridge.searchTools({ serverId: "context7" })).rejects.toThrow("ambiguous");
    await expect(bridge.describeTool({ toolName: "query-docs" })).rejects.toThrow("Multiple installed Ambient MCP tools matched query-docs");

    const descriptor = await bridge.describeTool({ toolName: "io.github.stacklok/context7/query-docs" });
    expect(descriptor).toMatchObject({
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      toolRef: "io.github.stacklok/context7/query-docs",
      name: "query-docs",
    });

    const selectedByWorkloadInServerField = await bridge.describeTool({
      serverId: "ambient-example-context7",
      toolName: "query-docs",
    });
    expect(selectedByWorkloadInServerField.serverId).toBe("io.github.example/context7");

    const call = await bridge.callTool({
      toolName: "io.github.stacklok/context7/query-docs",
      arguments: { query: "scrapling" },
    });
    expect(call.text).toContain("Primary called query-docs with scrapling");
  });

  it("matches natural tokens from installed standard MCP server identifiers", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [{
        name: "read_text_file",
        description: "Read a text file.",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
          additionalProperties: false,
        },
      }],
      callText: (_name, args) => `Read ${String(args.path)}`,
    });
    servers.push(endpoint);
    const { bridge } = await fixtureBridgeWithInstalledServers([
      {
        serverId: "modelcontextprotocol-server-filesystem-standard-mcp",
        workloadName: "ambient-modelcontextprotocol-server-filesystem-standard-mcp-1661132a",
        endpoint: endpoint.url,
      },
    ]);

    const results = await bridge.searchTools({ serverId: "filesystem" });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      serverId: "modelcontextprotocol-server-filesystem-standard-mcp",
      name: "read_text_file",
    });
  });

  it("applies Ambient per-tool visibility and call-blocking policy before MCP calls", async () => {
    let downstreamCalls = 0;
    const endpoint = await startFakeMcpServer({
      tools: [context7Tool, deleteDocsTool],
      callText: (name) => {
        downstreamCalls += 1;
        return `Called ${name}`;
      },
    });
    servers.push(endpoint);
    const { bridge, service } = await fixtureBridge(endpoint.url);
    await service.updateInstalledServerToolPolicy("ambient-context7", "delete-docs", {
      visibility: "hidden",
      callPolicy: "blocked",
      reason: "Destructive tool hidden until per-tool review exists.",
    });
    await service.updateInstalledServerToolPolicy("ambient-context7", "query-docs", {
      callPolicy: "blocked",
      reason: "Documentation calls paused for this server.",
    });

    const results = await bridge.searchTools({ serverId: "io.github.stacklok/context7", refresh: true });
    expect(results.map((tool) => tool.name)).toEqual(["query-docs"]);
    expect(results[0].policy).toMatchObject({
      visibility: "visible",
      callPolicy: "blocked",
      reason: "Documentation calls paused for this server.",
    });
    expect(mcpToolSearchResultsText(results)).toContain("callPolicy=blocked");
    await expect(bridge.describeTool({ toolName: "delete-docs", serverId: "io.github.stacklok/context7" })).rejects.toThrow("No installed Ambient MCP tool");
    await expect(bridge.callTool({
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { query: "scrapling" },
    })).rejects.toThrow("blocked by Ambient tool policy");
    expect(downstreamCalls).toBe(0);

    const review = await bridge.reviewToolDescriptors({ serverId: "io.github.stacklok/context7" });
    expect(review.tools.map((tool) => [tool.name, tool.policy?.visibility, tool.policy?.callPolicy])).toEqual([
      ["delete-docs", "hidden", "blocked"],
      ["query-docs", "visible", "blocked"],
    ]);
  });

  it("updates and clears per-tool policy through the bridge without changing descriptor trust", async () => {
    const endpoint = await startFakeMcpServer({
      tools: [context7Tool, deleteDocsTool],
      callText: (name) => `Called ${name}`,
    });
    servers.push(endpoint);
    const { bridge, service } = await fixtureBridge(endpoint.url);
    await bridge.searchTools({ serverId: "io.github.stacklok/context7", refresh: true });
    const descriptorHash = (await service.readState()).installedServers[0].lastKnownToolDescriptorHash;

    const preview = await bridge.previewToolPolicyUpdate({
      toolName: "delete-docs",
      serverId: "io.github.stacklok/context7",
      visibility: "hidden",
      callPolicy: "blocked",
      reason: "Hide destructive delete tool.",
    });
    expect(preview).toMatchObject({
      status: "would-update",
      nextPolicy: {
        visibility: "hidden",
        callPolicy: "blocked",
        reason: "Hide destructive delete tool.",
      },
    });
    expect(mcpToolPolicyUpdatePreviewText(preview)).toContain("does not trust descriptor drift");

    const updated = await bridge.updateToolPolicy({
      toolName: "delete-docs",
      serverId: "io.github.stacklok/context7",
      visibility: "hidden",
      callPolicy: "blocked",
      reason: "Hide destructive delete tool.",
    });
    expect(updated).toMatchObject({
      status: "updated",
      policy: {
        visibility: "hidden",
        callPolicy: "blocked",
        reason: "Hide destructive delete tool.",
      },
    });
    expect(mcpToolPolicyUpdateResultText(updated)).toContain("Updated Ambient MCP tool policy");
    expect((await service.readState()).installedServers[0]).toMatchObject({
      toolDescriptorReviewStatus: "trusted",
      lastKnownToolDescriptorHash: descriptorHash,
      toolPolicies: {
        "delete-docs": expect.objectContaining({
          visibility: "hidden",
          callPolicy: "blocked",
        }),
      },
    });
    expect((await bridge.searchTools({ serverId: "io.github.stacklok/context7" })).map((tool) => tool.name)).toEqual(["query-docs"]);

    const restored = await bridge.updateToolPolicy({
      toolName: "delete-docs",
      serverId: "io.github.stacklok/context7",
      clear: true,
    });
    expect(restored.status).toBe("cleared");
    expect(restored.policy).toBeUndefined();
    expect((await service.readState()).installedServers[0].toolPolicies).toBeUndefined();
    expect((await bridge.searchTools({ serverId: "io.github.stacklok/context7" })).map((tool) => tool.name)).toEqual(["delete-docs", "query-docs"]);
  });

  it("evaluates vMCP aggregation readiness without enabling aggregation", async () => {
    const primaryEndpoint = await startFakeMcpServer({
      tools: [context7Tool],
      callText: (name) => `Primary called ${name}`,
    });
    const secondaryEndpoint = await startFakeMcpServer({
      tools: [context7Tool, deleteDocsTool],
      callText: (name) => `Secondary called ${name}`,
    });
    servers.push(primaryEndpoint, secondaryEndpoint);
    const { bridge, service } = await fixtureBridgeWithInstalledServers([
      {
        serverId: "io.github.stacklok/context7",
        workloadName: "ambient-context7",
        endpoint: primaryEndpoint.url,
      },
      {
        serverId: "io.github.example/docs",
        workloadName: "ambient-example-docs",
        endpoint: secondaryEndpoint.url,
      },
    ]);

    const ready = await bridge.evaluateAggregationReadiness({ refresh: true });

    expect(ready).toMatchObject({
      schemaVersion: "ambient-mcp-aggregation-readiness-v1",
      status: "ready-for-experiment",
      serverCount: 2,
      duplicateToolNames: ["query-docs"],
      namespaceStrategy: "server-prefixed",
    });
    expect(ready.blockers).toEqual([]);
    expect(ready.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("duplicate MCP tool names require server-prefixed aggregate names"),
    ]));
    expect(ready.namespacePlan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        toolRef: "io.github.stacklok/context7/query-docs",
        aggregateName: "io_github_stacklok_context7__query_docs",
        duplicateName: true,
      }),
      expect.objectContaining({
        toolRef: "io.github.example/docs/delete-docs",
        aggregateName: "io_github_example_docs__delete_docs",
        duplicateName: false,
      }),
    ]));
    expect(mcpAggregationReadinessText(ready)).toContain("Aggregation remains disabled in this build");

    const state = await service.readState();
    state.installedServers[0]!.toolDescriptorReviewStatus = "needs-review";
    state.installedServers[0]!.toolDescriptorReviewReason = "Synthetic drift for aggregation readiness.";
    await service.writeState(state);

    const blocked = await bridge.evaluateAggregationReadiness();
    expect(blocked.status).toBe("blocked");
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("descriptor drift requires review"),
    ]));
  });

  it("discovers tools from registered guided-local SSE bridge endpoints without ToolHive workload rows", async () => {
    const endpoint = await startFakeSseMcpServer({
      tools: [ghidraListFunctionsTool],
      callText: (name) => `Called ${name}`,
    });
    servers.push(endpoint);
    const { bridge, service } = await fixtureGuidedBridge(endpoint.url);

    const results = await bridge.searchTools({ serverId: "ghidramcp-guided-local-bridge", refresh: true });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      serverId: "ghidramcp-guided-local-bridge",
      workloadName: "ambient-ghidramcp-guided-local-bridge",
      workloadStatus: "registered-local-bridge",
      endpoint: endpoint.url,
      name: "list_functions",
      reviewStatus: "trusted",
    });
    const state = await service.readState();
    expect(state.installedServers[0]).toMatchObject({
      registrySource: "guided-local-bridge",
      endpoint: endpoint.url,
      toolDescriptorReviewStatus: "trusted",
      lastKnownToolDescriptors: [expect.objectContaining({ name: "list_functions" })],
    });

    const call = await bridge.callTool({
      serverId: "ghidramcp-guided-local-bridge",
      toolName: "list_functions",
      arguments: {},
    });
    expect(call.text).toContain("Called list_functions");
  });
});

async function fixtureBridge(endpoint: string, bridgeOptions: Partial<Pick<McpToolBridgeOptions, "onDescriptorDrift" | "timeoutMs">> = {}) {
  return fixtureBridgeWithInstalledServers([
    {
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      endpoint,
    },
  ], bridgeOptions);
}

async function fixtureBridgeWithInstalledServers(installedServers: Array<{
  serverId: string;
  workloadName: string;
  endpoint: string;
  permissionProfile?: Record<string, unknown>;
}>, bridgeOptions: Partial<Pick<McpToolBridgeOptions, "onDescriptorDrift" | "timeoutMs">> = {}) {
  const root = await mkdtemp(join(tmpdir(), "ambient-mcp-tool-bridge-"));
  const userData = join(root, "userData");
  await mkdir(userData, { recursive: true });
  const fakeThv = join(root, "thv");
  await writeFile(fakeThv, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(fakeThv, 0o755);
  const calls: ToolHiveCommandInvocation[] = [];
  const executor: ToolHiveCommandExecutor = async (invocation) => {
    calls.push(invocation);
    if (invocation.args[0] === "list") {
      return ok(JSON.stringify(installedServers.map((server) => ({
        name: server.workloadName,
        status: "running",
        group: "ambient",
        proxy_url: server.endpoint,
      }))));
    }
    return ok("[]");
  };
  const service = new ToolHiveRuntimeService({
    userDataPath: userData,
    env: {
      AMBIENT_TOOLHIVE_BINARY: fakeThv,
      PATH: process.env.PATH,
      HOME: root,
    } as NodeJS.ProcessEnv,
    executor,
    now: () => new Date("2026-05-22T00:00:00.000Z"),
  });
  const permissionProfiles = new Map<string, Awaited<ReturnType<ToolHiveRuntimeService["writePermissionProfile"]>>>();
  for (const server of installedServers) {
    permissionProfiles.set(server.workloadName, await service.writePermissionProfile({
      serverId: server.serverId,
      workloadName: server.workloadName,
      profile: server.permissionProfile ?? { network: { outbound: { insecure_allow_all: false } } },
    }));
  }
  await service.writeState({
    schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
    installedServers: installedServers.map((server) => ({
      ...(() => {
        const profile = permissionProfiles.get(server.workloadName);
        if (!profile) throw new Error(`Missing permission profile for ${server.workloadName}`);
        return {
          permissionProfilePath: profile.path,
          permissionProfileSha256: profile.sha256,
        };
      })(),
      serverId: server.serverId,
      workloadName: server.workloadName,
      registrySource: "toolhive-registry",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
    })),
  });
  const catalog = new McpInstallCatalog(service);
  const bridge = new McpToolBridge({ catalog, toolHive: service, workspacePath: join(root, "workspace"), ...bridgeOptions });
  return { bridge, service, calls };
}

async function fixtureGuidedBridge(endpoint: string, bridgeOptions: Partial<Pick<McpToolBridgeOptions, "timeoutMs">> = {}) {
  const root = await mkdtemp(join(tmpdir(), "ambient-mcp-guided-bridge-"));
  const userData = join(root, "userData");
  await mkdir(userData, { recursive: true });
  const fakeThv = join(root, "thv");
  await writeFile(fakeThv, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(fakeThv, 0o755);
  const executor: ToolHiveCommandExecutor = async (invocation) => {
    if (invocation.args[0] === "list") return ok(JSON.stringify([]));
    return ok("[]");
  };
  const service = new ToolHiveRuntimeService({
    userDataPath: userData,
    env: {
      AMBIENT_TOOLHIVE_BINARY: fakeThv,
      PATH: process.env.PATH,
      HOME: root,
    } as NodeJS.ProcessEnv,
    executor,
    now: () => new Date("2026-05-22T00:00:00.000Z"),
  });
  const permissionProfile = await service.writePermissionProfile({
    serverId: "ghidramcp-guided-local-bridge",
    workloadName: "ambient-ghidramcp-guided-local-bridge",
    profile: { network: { outbound: { insecure_allow_all: false } } },
  });
  await service.writeState({
    schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
    installedServers: [
      {
        serverId: "ghidramcp-guided-local-bridge",
        workloadName: "ambient-ghidramcp-guided-local-bridge",
        endpoint,
        registrySource: "guided-local-bridge",
        sourceIdentity: {
          runtimeLane: "guided-local-bridge",
          sourceKind: "local-bridge",
          sourceUrl: "https://github.com/lauriewired/GhidraMCP",
          toolHiveRunSource: endpoint,
          candidateId: "ghidramcp-guided-local-bridge",
          riskLevel: "high",
        },
        permissionProfilePath: permissionProfile.path,
        permissionProfileSha256: permissionProfile.sha256,
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
      },
    ],
  });
  const catalog = new McpInstallCatalog(service);
  const bridge = new McpToolBridge({ catalog, toolHive: service, workspacePath: join(root, "workspace"), ...bridgeOptions });
  return { bridge, service };
}

async function startFakeMcpServer(input: {
  tools: unknown[];
  callText: (name: string, args: Record<string, unknown>) => string;
  callIsError?: boolean;
  callResponseMode?: "chunked-json" | "silent-json";
  callChunkDelayMs?: number;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (request, response) => {
    const body = JSON.parse(await requestBody(request)) as { id?: number; method?: string; params?: Record<string, unknown> };
    if (body.method === "notifications/initialized") {
      response.writeHead(202);
      response.end();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.setHeader("mcp-session-id", "ambient-test-session");
    if (body.method === "initialize") {
      sendJson(response, { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: {} } });
      return;
    }
    if (body.method === "tools/list") {
      sendJson(response, { jsonrpc: "2.0", id: body.id, result: { tools: input.tools } });
      return;
    }
    if (body.method === "tools/call") {
      const name = typeof body.params?.name === "string" ? body.params.name : "";
      const args = body.params?.arguments && typeof body.params.arguments === "object" && !Array.isArray(body.params.arguments)
        ? body.params.arguments as Record<string, unknown>
        : {};
      const message = {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          ...(input.callIsError ? { isError: true } : {}),
          content: [{ type: "text", text: input.callText(name, args) }],
          structuredContent: { ok: true },
        },
      };
      if (input.callResponseMode === "chunked-json") {
        await sendJsonInChunks(response, message, input.callChunkDelayMs ?? 20);
      } else if (input.callResponseMode === "silent-json") {
        response.writeHead(200, { "content-type": "application/json" });
        response.flushHeaders();
        await delay(input.callChunkDelayMs ?? 80);
        response.end(JSON.stringify(message));
      } else {
        sendJson(response, message);
      }
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

async function startFakeSseMcpServer(input: {
  tools: unknown[];
  callText: (name: string, args: Record<string, unknown>) => string;
  callProgressEvents?: number;
  callProgressDelayMs?: number;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const clients = new Set<ServerResponse>();
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/sse") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      clients.add(response);
      response.write("event: endpoint\n");
      response.write("data: /messages?session_id=ambient-test\n\n");
      request.on("close", () => clients.delete(response));
      return;
    }
    if (request.method === "POST" && request.url?.startsWith("/messages")) {
      const body = JSON.parse(await requestBody(request)) as { id?: number; method?: string; params?: Record<string, unknown> };
      response.writeHead(202);
      response.end();
      if (body.method === "notifications/initialized") return;
      const message = (() => {
        if (body.method === "initialize") return { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: {} } };
        if (body.method === "tools/list") return { jsonrpc: "2.0", id: body.id, result: { tools: input.tools } };
        if (body.method === "tools/call") {
          const name = typeof body.params?.name === "string" ? body.params.name : "";
          const args = body.params?.arguments && typeof body.params.arguments === "object" && !Array.isArray(body.params.arguments)
            ? body.params.arguments as Record<string, unknown>
            : {};
          return {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{ type: "text", text: input.callText(name, args) }],
            },
          };
        }
        return { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "not found" } };
      })();
      const sendToClients = (event: string, payload: unknown) => {
        for (const client of clients) {
          client.write(`event: ${event}\n`);
          client.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      };
      if (body.method === "tools/call" && input.callProgressEvents && input.callProgressEvents > 0) {
        for (let index = 0; index < input.callProgressEvents; index += 1) {
          await delay(input.callProgressDelayMs ?? 20);
          sendToClients("progress", { progress: index + 1 });
        }
      }
      sendToClients("message", message);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to start fake SSE MCP server.");
  return {
    url: `http://127.0.0.1:${address.port}/sse`,
    close: () => new Promise((resolve, reject) => {
      for (const client of clients) client.end();
      server.close((error) => error ? reject(error) : resolve());
    }),
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

async function sendJsonInChunks(response: ServerResponse, value: unknown, delayMs: number): Promise<void> {
  const text = JSON.stringify(value);
  response.writeHead(200, { "content-type": "application/json" });
  response.flushHeaders();
  const split = Math.max(1, Math.floor(text.length / 3));
  response.write(text.slice(0, split));
  await delay(delayMs);
  response.write(text.slice(split, split * 2));
  await delay(delayMs);
  response.end(text.slice(split * 2));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ok(stdout: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout, stderr: "", exitCode: 0 };
}

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

const echoTool = {
  name: "echo",
  description: "Echo a message back to the caller.",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
    additionalProperties: false,
  },
};

const deleteDocsTool = {
  name: "delete-docs",
  description: "Delete cached documentation for a library.",
  inputSchema: {
    type: "object",
    properties: {
      libraryId: { type: "string" },
    },
    required: ["libraryId"],
    additionalProperties: false,
  },
};

const summarizeDocsTool = {
  name: "summarize-docs",
  description: "Summarize cached documentation for a resolved library id.",
  inputSchema: {
    type: "object",
    properties: {
      library: { type: "string" },
    },
    required: ["library"],
    additionalProperties: false,
  },
};

const ghidraListFunctionsTool = {
  name: "list_functions",
  description: "List all functions in the current Ghidra database.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};
