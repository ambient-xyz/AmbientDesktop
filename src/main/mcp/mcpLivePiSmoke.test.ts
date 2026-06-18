import type { ToolCall } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import {
  mcpLivePiSmokeDiagnostics,
  mcpLivePiSmokePrompt,
  runMcpLivePiSmoke,
} from "./mcpLivePiSmoke";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFacade";
import type { McpAutowireCandidate } from "./mcpAutowireFacade";

describe("MCP live Pi smoke harness", () => {
  it("records required MCP tool progress and final success text", async () => {
    const toolNames = [
      "ambient_mcp_server_search",
      "ambient_mcp_server_describe",
      "ambient_mcp_server_install",
      "ambient_mcp_server_list",
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ];
    let toolIndex = 0;
    const observedProgress: string[] = [];
    const observedToolProgress: string[] = [];
    const report = await runMcpLivePiSmoke({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: mcpLivePiSmokePrompt({
        install: {
          kind: "registry",
          serverQuery: "context7",
          serverId: "io.github.stacklok/context7",
        },
        toolQuery: "docs",
        toolName: "query-docs",
        toolArguments: { query: "scrapling" },
        successText: "MCP_LIVE_SMOKE_DONE",
      }),
      tools: toolNames.map((name) => fakeTool(name)),
      requiredToolNames: toolNames,
      successText: "MCP_LIVE_SMOKE_DONE",
      onProgress: (event) => observedProgress.push(event.stage),
      onToolProgress: (event) => observedToolProgress.push(`${event.toolName}:${event.status}`),
      waitForRetry: async () => undefined,
      streamFactory: (async function* (_model: unknown, context: { messages: Array<{ role: string }> }) {
        const priorResults = context.messages.filter((message: { role: string }) => message.role === "toolResult").length;
        if (priorResults >= toolNames.length) {
          yield { type: "text_delta", delta: "MCP_LIVE_SMOKE_DONE" };
          yield { type: "done" };
          return;
        }
        const toolName = toolNames[priorResults];
        const toolCall: ToolCall = {
          type: "toolCall",
          id: `tool-${priorResults + 1}`,
          name: toolName,
          arguments: argsForTool(toolName),
        };
        toolIndex += 1;
        yield { type: "toolcall_end", toolCall };
        yield {
          type: "done",
          message: {
            role: "assistant",
            content: [toolCall],
            api: "openai-completions",
            provider: "ambient",
            model: AMBIENT_DEFAULT_MODEL,
            usage: emptyUsage() as never,
            stopReason: "toolUse",
            timestamp: Date.now(),
          },
        };
      }) as never,
    });

    expect(toolIndex).toBe(toolNames.length);
    expect(report.diagnostics).toEqual([]);
    expect(report.observedToolNames).toEqual(toolNames);
    expect(report.finalText).toBe("MCP_LIVE_SMOKE_DONE");
    expect(report.toolProgress.map((event) => `${event.toolName}:${event.status}`)).toEqual(
      toolNames.flatMap((toolName) => [`${toolName}:running`, `${toolName}:done`]),
    );
    expect(observedProgress).toContain("completed");
    expect(observedToolProgress).toEqual(report.toolProgress.map((event) => `${event.toolName}:${event.status}`));
  });

  it("can bound live smoke runs with an absolute progress deadline", async () => {
    const observedProgress: Array<{ stage: string; absoluteTimeoutMs?: number }> = [];
    await expect(runMcpLivePiSmoke({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      prompt: "wait forever",
      tools: [],
      requiredToolNames: [],
      idleTimeoutMs: 5_000,
      absoluteTimeoutMs: 25,
      onProgress: (event) => observedProgress.push({ stage: event.stage, absoluteTimeoutMs: event.absoluteTimeoutMs }),
      streamFactory: (async function* () {
        await new Promise<never>(() => undefined);
      }) as never,
    })).rejects.toThrow("absolute progress deadline");

    expect(observedProgress).toContainEqual({ stage: "waiting", absoluteTimeoutMs: 25 });
  });

  it("prompts registry installs with exact tool names and JSON arguments", () => {
    const prompt = mcpLivePiSmokePrompt({
      install: {
        kind: "registry",
        serverQuery: "context7",
        serverId: "io.github.stacklok/context7",
      },
      toolQuery: "docs",
      toolName: "query-docs",
      toolArguments: { query: "scrapling" },
      successText: "MCP_LIVE_SMOKE_DONE",
    });

    expect(prompt).toContain('ambient_mcp_server_search with JSON arguments {"query":"context7"}');
    expect(prompt).toContain('ambient_mcp_server_describe with JSON arguments {"serverId":"io.github.stacklok/context7"}');
    expect(prompt).toContain('ambient_mcp_server_install with JSON arguments {"serverId":"io.github.stacklok/context7"}');
  });

  it("prompts Pi to use the Standard MCP import lane for reviewed candidates", () => {
    const prompt = mcpLivePiSmokePrompt({
      install: {
        kind: "standard-mcp-import",
        candidate: mcpAutowirePhase0Fixtures.scrapling as unknown as Record<string, unknown>,
        serverId: "scrapling-github-server-json",
        label: "Scrapling",
      },
      toolQuery: "scraping",
      toolName: "get",
      toolArguments: { url: "https://example.com" },
      successText: "MCP_LIVE_SMOKE_DONE",
    });

    expect(prompt).toContain("ambient_mcp_standard_import_describe");
    expect(prompt).toContain("ambient_mcp_standard_import_install");
    expect(prompt).toContain("scrapling-github-server-json");
    expect(prompt).toContain('"recommendedLane":"standard-mcp"');
    expect(prompt).toContain("List installed MCP servers.");
    expect(prompt).toContain("Call installed MCP tool get");
  });

  it("can prompt Standard MCP imports through compact candidate refs", () => {
    const prompt = mcpLivePiSmokePrompt({
      install: {
        kind: "standard-mcp-import",
        candidateRef: "fixture:scrapling",
        serverId: "scrapling-github-server-json",
        label: "Scrapling",
      },
      toolQuery: "scraping",
      toolName: "get",
      toolArguments: { url: "https://example.com" },
      successText: "MCP_LIVE_SMOKE_DONE",
    });

    expect(prompt).toContain('{"candidateRef":"fixture:scrapling"}');
    expect(prompt).not.toContain('"recommendedLane":"standard-mcp"');
  });

  it("prompts source-built custom-image imports through the Standard MCP lane", () => {
    const prompt = mcpLivePiSmokePrompt({
      install: {
        kind: "standard-mcp-import",
        candidate: sourceBuiltCustomImageCandidate() as unknown as Record<string, unknown>,
        serverId: "source-built-katzilla-mcp",
        label: "Source Built Katzilla",
      },
      toolQuery: "katzilla",
      toolName: "query",
      toolArguments: { query: "health" },
      successText: "MCP_LIVE_SMOKE_SOURCE_BUILT_DONE",
    });

    expect(prompt).toContain("ambient_mcp_standard_import_describe");
    expect(prompt).toContain("ambient_mcp_standard_import_install");
    expect(prompt).toContain('"sourceKind":"custom-image"');
    expect(prompt).toContain('"resolvedCommit":"abc1234deadbeef"');
    expect(prompt).toContain('"digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"');
    expect(prompt).toContain("Call installed MCP tool query");
  });

  it("prompts validation-failure live smokes to diagnose ToolHive installs instead of using host fallbacks", () => {
    const prompt = mcpLivePiSmokePrompt({
      install: {
        kind: "standard-mcp-import",
        candidateRef: "fixture:katzilla-replay",
        serverId: "katzilla-mcp-standard-mcp",
        label: "Katzilla",
      },
      expectedOutcome: "validation-failed",
      diagnosticsServerId: "katzilla-mcp-standard-mcp",
      expectedDiagnosticText: "kz.getTools is not a function",
      successText: "MCP_LIVE_SMOKE_FAILURE_DIAGNOSTICS_DONE",
    });

    expect(prompt).toContain("validation-failure smoke");
    expect(prompt).toContain("ambient_mcp_standard_import_install");
    expect(prompt).toContain('ambient_mcp_server_diagnostics with JSON arguments {"serverId":"katzilla-mcp-standard-mcp","logLines":40}');
    expect(prompt).toContain("kz.getTools is not a function");
    expect(prompt).toContain("keep the workload inside ToolHive");
    expect(prompt).toContain("Do not try npm, npx, Docker, Podman, supergateway, local bridge, or host shell fallbacks.");
    expect(prompt).not.toContain("ambient_mcp_tool_call");
  });

  it("reports missing required tools, tool errors, and missing success text", () => {
    const diagnostics = mcpLivePiSmokeDiagnostics({
      finalText: "not done",
      missingRequiredToolNames: ["ambient_mcp_tool_call"],
      toolProgress: [
        {
          toolCallId: "tool-1",
          toolName: "ambient_mcp_server_install",
          status: "error",
          error: "permission denied",
        },
      ],
    }, { successText: "MCP_LIVE_SMOKE_DONE" });

    expect(diagnostics).toEqual([
      "Missing required MCP smoke tools: ambient_mcp_tool_call.",
      "Tool ambient_mcp_server_install failed: permission denied.",
      "Final response did not include required success text MCP_LIVE_SMOKE_DONE.",
    ]);
  });
});

function fakeTool(name: string): ToolDefinition<any, any, any> {
  return {
    name,
    label: name,
    description: `Fixture ${name}`,
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
    execute: async (_toolCallId, params) => ({
      content: [{ type: "text", text: `${name} ok ${JSON.stringify(params ?? {})}` }],
      details: { toolName: name, status: "complete" },
    }),
  };
}

function argsForTool(toolName: string): Record<string, unknown> {
  if (toolName === "ambient_mcp_server_search") return { query: "context7" };
  if (toolName === "ambient_mcp_server_describe" || toolName === "ambient_mcp_server_install") return { serverId: "io.github.stacklok/context7" };
  if (toolName === "ambient_mcp_tool_search") return { query: "docs", serverId: "io.github.stacklok/context7" };
  if (toolName === "ambient_mcp_tool_describe") return { toolName: "query-docs", serverId: "io.github.stacklok/context7" };
  if (toolName === "ambient_mcp_tool_call") return { toolName: "query-docs", serverId: "io.github.stacklok/context7", arguments: { query: "scrapling" } };
  return {};
}

function emptyUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
  };
}

function sourceBuiltCustomImageCandidate(): McpAutowireCandidate {
  return {
    schemaVersion: "ambient-mcp-autowire-v1",
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
  };
}
