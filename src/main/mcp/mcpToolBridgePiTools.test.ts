import { describe, expect, it, vi } from "vitest";
import { McpToolRuntimePermissionBlockedError, type McpToolBridge } from "./mcpToolBridge";
import { createMcpToolBridgePiToolDefinitions, mcpToolCallApprovalDetail } from "./mcpToolBridgePiTools";
import { evaluateMcpToolCallPermission } from "./mcpPermissionPolicyService";

describe("MCP tool bridge Pi tools", () => {
  it("searches, describes, and calls installed MCP tools through compact direct tools", async () => {
    const approvals: string[] = [];
    const bridge = {
      searchTools: vi.fn(async () => [descriptor]),
      describeTool: vi.fn(async () => descriptor),
      prepareToolCall: vi.fn(async (input) => preparedToolCall(descriptor, input.arguments as Record<string, unknown>)),
      callTool: vi.fn(async () => ({
        descriptor,
        arguments: { query: "scrapling" },
        originalArguments: { query: "scrapling" },
        stagedFiles: [],
        managedFileArtifacts: [],
        text: "docs result",
        output: {
          text: "docs result",
          truncated: false,
          totalChars: 11,
          previewChars: 11,
          redacted: false,
          redactionCount: 0,
        },
      })),
      reviewToolDescriptors: vi.fn(async () => review),
      acceptToolDescriptorReview: vi.fn(async () => ({
        status: "trusted",
        review: { ...review, reviewStatus: "trusted" },
      })),
    } as unknown as McpToolBridge;

    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizeCall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      authorizeReviewAccept: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
    });

    const search = toolByName(tools, "ambient_mcp_tool_search");
    const describe = toolByName(tools, "ambient_mcp_tool_describe");
    const call = toolByName(tools, "ambient_mcp_tool_call");
    const reviewAccept = toolByName(tools, "ambient_mcp_tool_review_accept");
    const updates: unknown[] = [];

    const searchResult = await callTool(search, { query: "docs" });
    expect(textFromResult(searchResult)).toContain("io.github.stacklok/context7/query-docs");
    expect(searchResult?.details).toMatchObject({
      toolName: "ambient_mcp_tool_search",
      resultCount: 1,
      tools: [expect.objectContaining({
        toolRef: "io.github.stacklok/context7/query-docs",
        timeoutHint: expect.objectContaining({ idleTimeoutMs: 60_000 }),
      })],
    });

    const describeResult = await callTool(describe, { toolName: "query-docs", serverId: "io.github.stacklok/context7" });
    expect(textFromResult(describeResult)).toContain("Input schema:");
    expect(describeResult?.details).toMatchObject({ toolName: "ambient_mcp_tool_describe" });

    const callResult = await callTool(call, {
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { query: "scrapling" },
    }, (update) => updates.push(update));
    expect(textFromResult(callResult)).toContain("docs result");
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        details: expect.objectContaining({
          toolName: "ambient_mcp_tool_call",
          status: "waiting-for-approval",
          approvalRequired: true,
          targetToolName: "query-docs",
        }),
      }),
    ]));
    expect(callResult?.details).toMatchObject({
      toolName: "ambient_mcp_tool_call",
      serverId: "io.github.stacklok/context7",
      targetToolRef: "io.github.stacklok/context7/query-docs",
      targetToolName: "query-docs",
      timeoutHint: expect.objectContaining({ idleTimeoutMs: 60_000 }),
      argumentKeys: ["query"],
      permissionResources: expect.arrayContaining([
        expect.objectContaining({ kind: "local-endpoint", label: "127.0.0.1:4411" }),
        expect.objectContaining({ kind: "tool-call" }),
      ]),
    });
    expect(approvals[0]).toContain("Call Ambient MCP tool io.github.stacklok/context7/query-docs");
    expect(approvals[0]).toContain("MCP permission summary:");
    expect(approvals[0]).toContain("Local endpoint access");
    expect(approvals[0]).toContain("Response and download guardrails");
    expect(approvals[0]).toContain("MCP permission policy:");
    expect(approvals[0]).toContain("local-endpoint:connect 127.0.0.1:4411");
    expect(approvals[0]).toContain("MCP runtime enforcement:");
    expect(approvals[0]).toContain("Profile hash verified: yes");
    expect(bridge.callTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { query: "scrapling" },
      fileInputs: undefined,
    }));

    const acceptResult = await callTool(reviewAccept, {
      serverId: "io.github.stacklok/context7",
      expectedDescriptorHash: "hash123",
    });
    expect(textFromResult(acceptResult)).toContain("Trusted current MCP tool descriptors");
    expect(acceptResult?.details).toMatchObject({
      toolName: "ambient_mcp_tool_review_accept",
      status: "trusted",
      descriptorHash: "hash123",
    });
    expect(approvals[1]).toContain("Expected descriptor hash: hash123");
  });

  it("shows managed file input hints for file-like MCP schema fields", async () => {
    const fileDescriptor = {
      ...descriptor,
      name: "render-csv",
      toolRef: "io.github.stacklok/context7/render-csv",
      inputSchema: {
        type: "object",
        properties: {
          csv_path: {
            type: "string",
            description: "Path to the CSV file to render.",
          },
          title: { type: "string" },
        },
        required: ["csv_path"],
        additionalProperties: false,
      },
    };
    const bridge = {
      describeTool: vi.fn(async () => fileDescriptor),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
    });

    const describeResult = await callTool(toolByName(tools, "ambient_mcp_tool_describe"), {
      toolName: "render-csv",
      serverId: "io.github.stacklok/context7",
    });

    expect(textFromResult(describeResult)).toContain("Managed file input hints:");
    expect(textFromResult(describeResult)).toContain('"argumentPath":"csv_path"');
    expect(textFromResult(describeResult)).toContain("managed ToolHive exchange");
  });

  it("blocks calls in Planner Mode and redacts sensitive approval details", async () => {
    const bridge = {
      describeTool: vi.fn(async () => descriptor),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
    });
    await expect(callTool(toolByName(tools, "ambient_mcp_tool_call"), { toolName: "query-docs" })).rejects.toThrow("Planner Mode");

    const detail = mcpToolCallApprovalDetail({
      descriptor,
      workspace: { path: "/tmp/workspace" },
      arguments: { apiKey: "sk-test-secret-value-1234567890", query: "docs" },
    });
    expect(detail).toContain("apiKey, query");
    expect(detail).toContain("[REDACTED]");
    expect(detail).not.toContain("sk-test-secret-value");
  });

  it("normalizes legacy toolInput JSON strings into canonical MCP call arguments", async () => {
    const authorizeCall = vi.fn(async () => true);
    const bridge = {
      prepareToolCall: vi.fn(async (input) => preparedToolCall(descriptor, input.arguments as Record<string, unknown>)),
      callTool: vi.fn(async () => ({
        descriptor,
        arguments: { query: "scrapling" },
        originalArguments: { query: "scrapling" },
        stagedFiles: [],
        managedFileArtifacts: [],
        text: "docs result",
        output: {
          text: "docs result",
          truncated: false,
          totalChars: 11,
          previewChars: 11,
          redacted: false,
          redactionCount: 0,
        },
      })),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizeCall,
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_tool_call"), {
      toolName: "io.github.stacklok/context7/query-docs",
      toolInput: "{\"query\":\"scrapling\",}",
    });

    expect(textFromResult(result)).toContain("docs result");
    expect(bridge.callTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "io.github.stacklok/context7/query-docs",
      arguments: { query: "scrapling" },
    }));
    expect(authorizeCall).toHaveBeenCalledWith(expect.objectContaining({
      arguments: { query: "scrapling" },
    }));
  });

  it("normalizes canonical arguments JSON strings into MCP call argument objects", async () => {
    const authorizeCall = vi.fn(async () => true);
    const bridge = {
      prepareToolCall: vi.fn(async (input) => preparedToolCall(descriptor, input.arguments as Record<string, unknown>)),
      callTool: vi.fn(async () => ({
        descriptor,
        arguments: { query: "scrapling" },
        originalArguments: { query: "scrapling" },
        stagedFiles: [],
        managedFileArtifacts: [],
        text: "docs result",
        output: {
          text: "docs result",
          truncated: false,
          totalChars: 11,
          previewChars: 11,
          redacted: false,
          redactionCount: 0,
        },
      })),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizeCall,
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_tool_call"), {
      toolName: "io.github.stacklok/context7/query-docs",
      arguments: "{\"query\":\"scrapling\",}",
    });

    expect(textFromResult(result)).toContain("docs result");
    expect(bridge.callTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "io.github.stacklok/context7/query-docs",
      arguments: { query: "scrapling" },
    }));
    expect(authorizeCall).toHaveBeenCalledWith(expect.objectContaining({
      arguments: { query: "scrapling" },
    }));
  });

  it("returns terminal approval-denied results and blocks identical retries without prompting again", async () => {
    const authorizeCall = vi.fn(async () => false);
    const bridge = {
      prepareToolCall: vi.fn(async (input) => preparedToolCall(descriptor, input.arguments as Record<string, unknown>)),
      callTool: vi.fn(),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizeCall,
    });
    const call = toolByName(tools, "ambient_mcp_tool_call");
    const input = {
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { query: "scrapling" },
    };

    const denied = await callTool(call, input);
    const duplicate = await callTool(call, input);

    expect(textFromResult(denied)).toContain("denied by the user");
    expect(denied?.details).toMatchObject({
      toolName: "ambient_mcp_tool_call",
      status: "approval-denied",
      approvalDenied: true,
      approvalDeniedTerminal: true,
      retryAllowed: false,
      duplicateDenied: false,
      targetToolRef: "io.github.stacklok/context7/query-docs",
    });
    expect(textFromResult(duplicate)).toContain("already denied");
    expect(duplicate?.details).toMatchObject({
      toolName: "ambient_mcp_tool_call",
      status: "approval-denied-duplicate",
      approvalDenied: true,
      approvalDeniedTerminal: true,
      retryAllowed: false,
      duplicateDenied: true,
    });
    expect(authorizeCall).toHaveBeenCalledTimes(1);
    expect(bridge.prepareToolCall).toHaveBeenCalledTimes(1);
    expect(bridge.callTool).not.toHaveBeenCalled();
  });

  it("returns compact search details and blocks schema-invalid calls before approval", async () => {
    const authorizeCall = vi.fn(async () => true);
    const longDescription = `Query documentation. ${"Long descriptor sentence. ".repeat(40)}`;
    const verboseDescriptor = { ...descriptor, description: longDescription };
    const bridge = {
      searchTools: vi.fn(async () => [verboseDescriptor]),
      describeTool: vi.fn(async () => verboseDescriptor),
      prepareToolCall: vi.fn(async () => {
        throw new Error("ambient_mcp_tool_call arguments failed schema validation: expected top-level required field: query");
      }),
      callTool: vi.fn(),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizeCall,
    });

    const searchResult = await callTool(toolByName(tools, "ambient_mcp_tool_search"), { query: "docs" });
    expect(textFromResult(searchResult)).toContain("descriptionPreview=");
    expect(searchResult?.details).toMatchObject({
      tools: [expect.objectContaining({
        descriptionPreview: expect.stringContaining("Query documentation"),
        descriptionChars: longDescription.length,
        descriptionTruncated: true,
      })],
    });
    expect(JSON.stringify(searchResult?.details)).not.toContain("Long descriptor sentence. Long descriptor sentence. Long descriptor sentence. Long descriptor sentence. Long descriptor sentence. Long descriptor sentence. Long descriptor sentence. Long descriptor sentence. Long descriptor sentence. Long descriptor sentence.");

    await expect(callTool(toolByName(tools, "ambient_mcp_tool_call"), {
      toolName: "query-docs",
      serverId: "io.github.stacklok/context7",
      arguments: { wrapper: { query: "scrapling" } },
    })).rejects.toThrow("expected top-level required field: query");
    expect(authorizeCall).not.toHaveBeenCalled();
    expect(bridge.callTool).not.toHaveBeenCalled();
  });

  it("rejects malformed toolInput aliases before approval", async () => {
    const authorizeCall = vi.fn(async () => true);
    const bridge = {
      prepareToolCall: vi.fn(),
      callTool: vi.fn(),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizeCall,
    });

    await expect(callTool(toolByName(tools, "ambient_mcp_tool_call"), {
      toolName: "io.github.stacklok/context7/query-docs",
      toolInput: "\"not an object\"",
    })).rejects.toThrow("toolInput compatibility alias must contain a JSON object");
    expect(authorizeCall).not.toHaveBeenCalled();
    expect(bridge.callTool).not.toHaveBeenCalled();
  });

  it("blocks hard-denied MCP tool resources before prompting", async () => {
    const authorizeCall = vi.fn(async () => true);
    const bridge = {
      prepareToolCall: vi.fn(async () => {
        throw new Error("MCP tool call blocked by Ambient MCP permission policy: denied network target");
      }),
      callTool: vi.fn(),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizeCall,
    });

    await expect(callTool(toolByName(tools, "ambient_mcp_tool_call"), {
      toolName: "query-docs",
      arguments: { url: "http://169.254.169.254/latest/meta-data" },
    })).rejects.toThrow("MCP tool call blocked by Ambient MCP permission policy");
    expect(authorizeCall).not.toHaveBeenCalled();
    expect(bridge.callTool).not.toHaveBeenCalled();
  });

  it("blocks runtime permission mismatches before prompting", async () => {
    const authorizeCall = vi.fn(async () => true);
    const bridge = {
      prepareToolCall: vi.fn(async () => {
        throw new McpToolRuntimePermissionBlockedError({
          descriptor: urlDescriptor,
          enforcement: blockedRuntime,
        });
      }),
      callTool: vi.fn(),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizeCall,
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_tool_call"), {
      toolName: "query-docs",
      arguments: { url: "https://docs.python.org/3/library/json.html" },
    });
    expect(textFromResult(result)).toContain("MCP tool call blocked by Ambient runtime permission enforcement");
    expect(textFromResult(result)).toContain("ambient_mcp_runtime_repair_describe");
    expect(result?.details).toMatchObject({
      toolName: "ambient_mcp_tool_call",
      status: "runtime-permission-blocked",
      runtimePermissionBlocked: true,
      approvalRequired: false,
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      targetToolName: "query-docs",
      nextToolName: "ambient_mcp_runtime_repair_describe",
      nextToolInput: {
        serverId: "io.github.stacklok/context7",
        workloadName: "ambient-context7",
        failureText: expect.stringContaining("docs.python.org:443"),
      },
      deniedResources: [
        expect.objectContaining({
          kind: "network",
          host: "docs.python.org",
          port: 443,
        }),
      ],
    });
    expect(authorizeCall).not.toHaveBeenCalled();
    expect(bridge.callTool).not.toHaveBeenCalled();
  });

  it("does not prompt or call when Ambient per-tool policy blocks a tool", async () => {
    const authorizeCall = vi.fn(async () => true);
    const bridge = {
      prepareToolCall: vi.fn(async () => {
        throw new Error("MCP tool io.github.stacklok/context7/query-docs is blocked by Ambient tool policy: Tool disabled by server policy.");
      }),
      callTool: vi.fn(),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizeCall,
    });

    await expect(callTool(toolByName(tools, "ambient_mcp_tool_call"), { toolName: "query-docs" })).rejects.toThrow("blocked by Ambient tool policy");
    expect(authorizeCall).not.toHaveBeenCalled();
    expect(bridge.callTool).not.toHaveBeenCalled();
  });

  it("approval-gates per-tool policy updates and returns the persisted policy", async () => {
    const approvals: string[] = [];
    const preview = {
      descriptor,
      status: "would-update" as const,
      nextPolicy: {
        visibility: "hidden" as const,
        callPolicy: "blocked" as const,
        reason: "Hide destructive tool.",
      },
    };
    const bridge = {
      previewToolPolicyUpdate: vi.fn(async () => preview),
      updateToolPolicy: vi.fn(async () => ({
        descriptor: {
          ...descriptor,
          policy: {
            visibility: "hidden" as const,
            callPolicy: "blocked" as const,
            reason: "Hide destructive tool.",
            updatedAt: "2026-05-22T12:00:00.000Z",
          },
        },
        status: "updated" as const,
        policy: {
          visibility: "hidden" as const,
          callPolicy: "blocked" as const,
          reason: "Hide destructive tool.",
          updatedAt: "2026-05-22T12:00:00.000Z",
        },
      })),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
      authorizePolicyUpdate: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_tool_policy_update"), {
      toolName: "io.github.stacklok/context7/query-docs",
      visibility: "hidden",
      callPolicy: "blocked",
      reason: "Hide destructive tool.",
    });

    expect(textFromResult(result)).toContain("Updated Ambient MCP tool policy");
    expect(result?.details).toMatchObject({
      toolName: "ambient_mcp_tool_policy_update",
      status: "updated",
      targetToolRef: "io.github.stacklok/context7/query-docs",
      policy: expect.objectContaining({
        visibility: "hidden",
        callPolicy: "blocked",
      }),
    });
    expect(approvals[0]).toContain("Update Ambient MCP tool policy");
    expect(approvals[0]).toContain("Next policy: visibility=hidden, callPolicy=blocked");
    expect(bridge.previewToolPolicyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "io.github.stacklok/context7/query-docs",
      visibility: "hidden",
      callPolicy: "blocked",
      reason: "Hide destructive tool.",
    }));
    expect(bridge.updateToolPolicy).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "io.github.stacklok/context7/query-docs",
      visibility: "hidden",
      callPolicy: "blocked",
      refresh: false,
    }));
  });

  it("reports MCP aggregation readiness without creating an aggregator", async () => {
    const bridge = {
      evaluateAggregationReadiness: vi.fn(async () => aggregationReport),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_aggregation_status"), {
      refresh: true,
      minServerCount: 2,
    });

    expect(textFromResult(result)).toContain("MCP aggregation readiness");
    expect(textFromResult(result)).toContain("Aggregation remains disabled");
    expect(result?.details).toMatchObject({
      toolName: "ambient_mcp_aggregation_status",
      status: "ready-for-experiment",
      serverCount: 2,
      callableToolCount: 2,
      namespaceStrategy: "server-prefixed",
    });
    expect(bridge.evaluateAggregationReadiness).toHaveBeenCalledWith(expect.objectContaining({
      refresh: true,
      minServerCount: 2,
    }));
  });

  it("blocks per-tool policy updates in Planner Mode", async () => {
    const bridge = {
      previewToolPolicyUpdate: vi.fn(),
      updateToolPolicy: vi.fn(),
    } as unknown as McpToolBridge;
    const tools = createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace" },
    });

    await expect(callTool(toolByName(tools, "ambient_mcp_tool_policy_update"), {
      toolName: "query-docs",
      callPolicy: "blocked",
    })).rejects.toThrow("Planner Mode");
    expect(bridge.previewToolPolicyUpdate).not.toHaveBeenCalled();
    expect(bridge.updateToolPolicy).not.toHaveBeenCalled();
  });
});

function toolByName(tools: ReturnType<typeof createMcpToolBridgePiToolDefinitions>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

function callTool(
  tool: ReturnType<typeof createMcpToolBridgePiToolDefinitions>[number],
  input: Record<string, unknown>,
  onUpdate?: Parameters<NonNullable<typeof tool.execute>>[3],
) {
  if (!tool.execute) throw new Error(`Tool ${tool.name} has no execute handler.`);
  return tool.execute("call-1", input, undefined, onUpdate, undefined as any);
}

function textFromResult(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> } | undefined)?.content ?? [];
  return content.map((item) => item.text ?? "").join("\n");
}

function preparedToolCall(toolDescriptor: typeof descriptor, args: Record<string, unknown>) {
  return {
    descriptor: toolDescriptor,
    arguments: args,
    originalArguments: args,
    permission: evaluateMcpToolCallPermission({
      descriptor: toolDescriptor,
      toolArguments: args,
      workspacePath: "/tmp/workspace",
      projectPath: "/tmp/workspace",
    }),
    runtimeEnforcement: enforcedRuntime,
    fileExchange: {
      arguments: args,
      stagedFiles: [],
    },
  };
}

const descriptor = {
  serverId: "io.github.stacklok/context7",
  workloadName: "ambient-context7",
  toolRef: "io.github.stacklok/context7/query-docs",
  workloadStatus: "running",
  endpoint: "http://127.0.0.1:4411/mcp",
  reviewStatus: "trusted" as const,
  descriptorHash: "hash123",
  name: "query-docs",
  description: "Query documentation.",
  timeoutHint: {
    descriptorClass: "mcp" as const,
    idleTimeoutMs: 60_000,
    maxRunMs: null,
    source: "default" as const,
    reason: "No per-tool timeout signal matched; Ambient uses the default MCP idle timeout without a hard cap.",
    matchedSignals: [],
  },
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
};

const urlDescriptor = {
  ...descriptor,
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
    additionalProperties: false,
  },
};

const review = {
  server: {
    serverId: "io.github.stacklok/context7",
    workloadName: "ambient-context7",
    permissionProfilePath: "/tmp/profile.json",
    permissionProfileSha256: "abc123",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    lastKnownToolCount: 1,
    lastKnownToolDescriptorHash: "hash123",
    toolDescriptorReviewStatus: "needs-review" as const,
  },
  reviewStatus: "needs-review" as const,
  descriptorHash: "hash123",
  tools: [descriptor],
};

const enforcedRuntime = {
  status: "enforced" as const,
  serverId: "io.github.stacklok/context7",
  workloadName: "ambient-context7",
  blockers: [],
  warnings: [],
  profilePath: "/tmp/profile.json",
  profileSha256: "abc123",
  expectedProfileSha256: "abc123",
  profileSha256Verified: true,
  networkMode: "allowlist" as const,
  allowHosts: ["mcp.context7.com"],
  allowPorts: [443],
  filesystemMode: "isolated" as const,
  allowReadPaths: [],
  allowWritePaths: [],
  publicWebEgressGrantEnforced: false,
  deniedResources: [],
};

const blockedRuntime = {
  ...enforcedRuntime,
  status: "blocked" as const,
  blockers: ["Installed ToolHive permission profile does not allow docs.python.org:443. Reinstall or update the MCP server permission profile before calling this tool."],
  allowHosts: ["example.com"],
  deniedResources: [
    {
      kind: "network" as const,
      action: "connect" as const,
      label: "docs.python.org:443",
      identity: "network:https:docs.python.org:443",
      risk: "medium" as const,
      evidence: "argument:url",
      host: "docs.python.org",
      port: 443,
      reason: "Installed ToolHive permission profile does not allow docs.python.org:443.",
    },
  ],
  repairHint: {
    schemaVersion: "ambient-mcp-runtime-repair-hint-v1" as const,
    nextToolName: "ambient_mcp_runtime_repair_describe" as const,
    nextToolInput: {
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      failureText: [
        "MCP runtime permission enforcement blocked io.github.stacklok/context7/ambient-context7.",
        "Blocker: Installed ToolHive permission profile does not allow docs.python.org:443. Reinstall or update the MCP server permission profile before calling this tool.",
        "Denied network: docs.python.org:443 (network:https:docs.python.org:443) host=docs.python.org:443; reason=Installed ToolHive permission profile does not allow docs.python.org:443.",
      ].join("\n"),
      reason: "Repair blocked MCP runtime permission enforcement with typed Autowire plan edits.",
    },
    profileSummary: {
      networkMode: "allowlist" as const,
      allowHosts: ["example.com"],
      allowPorts: [443],
      filesystemMode: "isolated" as const,
      allowReadPaths: [],
      allowWritePaths: [],
      profileSha256Verified: true,
    },
    deniedResources: [
      {
        kind: "network" as const,
        action: "connect" as const,
        label: "docs.python.org:443",
        identity: "network:https:docs.python.org:443",
        risk: "medium" as const,
        evidence: "argument:url",
        host: "docs.python.org",
        port: 443,
        reason: "Installed ToolHive permission profile does not allow docs.python.org:443.",
      },
    ],
    guidance: [
      "Call ambient_mcp_runtime_repair_describe with nextToolInput to preview a typed repair.",
      "If the user approves, call ambient_mcp_runtime_repair_apply with the same selector and evidence.",
      "Do not use ambient_mcp_tool_policy_update, shell, direct ToolHive commands, or raw permission-profile edits for runtime repair.",
    ],
  },
};

const aggregationReport = {
  schemaVersion: "ambient-mcp-aggregation-readiness-v1" as const,
  status: "ready-for-experiment" as const,
  recommendedAction: "Ready for a bounded vMCP aggregation experiment.",
  serverCount: 2,
  minServerCount: 2,
  visibleToolCount: 2,
  callableToolCount: 2,
  hiddenToolCount: 0,
  blockedToolCount: 0,
  approvalRequiredToolCount: 0,
  duplicateToolNames: ["query-docs"],
  namespaceStrategy: "server-prefixed" as const,
  checks: [
    {
      id: "stable-bridge-first",
      label: "Compact bridge remains primary",
      status: "passed" as const,
      detail: "Aggregation status is read-only.",
    },
  ],
  servers: [
    {
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      reviewStatus: "trusted" as const,
      profileSha256Verified: true,
      visibleToolCount: 1,
      hiddenToolCount: 0,
      blockedToolCount: 0,
      approvalRequiredToolCount: 0,
      callableToolCount: 1,
      issues: [],
    },
    {
      serverId: "io.github.example/docs",
      workloadName: "ambient-example-docs",
      reviewStatus: "trusted" as const,
      profileSha256Verified: true,
      visibleToolCount: 1,
      hiddenToolCount: 0,
      blockedToolCount: 0,
      approvalRequiredToolCount: 0,
      callableToolCount: 1,
      issues: [],
    },
  ],
  namespacePlan: [
    {
      toolRef: "io.github.stacklok/context7/query-docs",
      aggregateName: "io_github_stacklok_context7__query_docs",
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      toolName: "query-docs",
      duplicateName: true,
      callPolicy: "default" as const,
    },
  ],
  blockers: [],
  warnings: ["duplicate MCP tool names require server-prefixed aggregate names: query-docs"],
};
