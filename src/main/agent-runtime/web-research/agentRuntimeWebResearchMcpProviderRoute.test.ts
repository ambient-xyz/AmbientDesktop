import { describe, expect, it, vi } from "vitest";

import type { WebResearchProviderConfig } from "../../../shared/webResearchTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { McpToolDescriptor } from "../../mcp/mcpToolBridge";
import {
  tryCallWebResearchMcpProvider,
  type WebResearchMcpProviderRouteOptions,
} from "./agentRuntimeWebResearchMcpProviderRoute";

describe("agentRuntimeWebResearchMcpProviderRoute", () => {
  it("returns a fallback reason without creating MCP runtime when provider has no binding", async () => {
    const createMcpRuntime = vi.fn();

    const result = await tryCallWebResearchMcpProvider({
      threadId: "thread-1",
      workspace: workspace(),
      provider: { ...provider(), mcp: undefined },
      role: "search",
      value: "ambient research",
      rawInput: {},
      signal: undefined,
    }, options({ createMcpRuntime }));

    expect(result).toEqual({ fallbackReason: "Provider test-mcp has no MCP tool binding." });
    expect(createMcpRuntime).not.toHaveBeenCalled();
  });

  it("returns a fallback reason when MCP runtime is unavailable", async () => {
    const result = await tryCallWebResearchMcpProvider({
      threadId: "thread-1",
      workspace: workspace(),
      provider: provider(),
      role: "search",
      value: "ambient research",
      rawInput: {},
      signal: undefined,
    }, options({ createMcpRuntime: vi.fn(() => undefined) }));

    expect(result).toEqual({ fallbackReason: "Ambient MCP runtime is not enabled." });
  });

  it("calls a trusted MCP provider with approval and activity updates", async () => {
    const signal = new AbortController().signal;
    const descriptor = descriptorFixture();
    const updates: any[] = [];
    const describeTool = vi.fn(async () => descriptor);
    const evaluateRuntimePermission = vi.fn(async () => runtimeEnforcement());
    const callTool = vi.fn(async (input: any) => {
      input.onActivity?.({
        operation: "search",
        source: "mcp-client",
        endpointOrigin: "http://127.0.0.1:4040",
        bytes: 128,
        requestId: "request-1",
      });
      return {
        descriptor,
        text: "MCP provider result.",
        output: { kind: "inline", text: "MCP provider result." },
        arguments: input.arguments,
        originalArguments: input.arguments,
        stagedFiles: [],
        managedFileArtifacts: [],
      };
    });
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);

    const result = await tryCallWebResearchMcpProvider({
      threadId: "thread-1",
      workspace: workspace(),
      provider: provider(),
      role: "search",
      value: "ambient research",
      rawInput: { query: "ambient research" },
      signal,
      onUpdate: (update) => updates.push(update),
    }, options({
      createMcpRuntime: vi.fn(() => ({
        bridge: {
          describeTool,
          evaluateRuntimePermission,
          callTool,
        } as any,
      })),
      resolveFirstPartyPluginPermission,
    }));

    expect(describeTool).toHaveBeenCalledWith({
      toolName: "search",
      serverId: "test-server",
      workloadName: "test-workload",
      refresh: false,
      signal,
      onActivity: expect.any(Function),
    });
    expect(evaluateRuntimePermission).toHaveBeenCalledWith(expect.objectContaining({ descriptor }));
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "web_research_search",
      title: "Search with Test MCP?",
      message: expect.stringContaining("configured MCP-backed search provider"),
    }));
    expect(callTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "search",
      serverId: "test-server",
      workloadName: "test-workload",
      refresh: false,
      arguments: { query: "ambient research" },
      signal,
      onActivity: expect.any(Function),
    }));
    expect(updates.map((update) => update.content[0].text)).toEqual([
      "Calling MCP-backed web research provider Test MCP.",
      "Test MCP MCP activity: mcp-client.",
    ]);
    expect(result.result?.text).toBe("MCP provider result.");
  });
});

function options(overrides: Partial<WebResearchMcpProviderRouteOptions> = {}): WebResearchMcpProviderRouteOptions {
  const thread = {
    id: "thread-1",
    title: "Thread",
    workspacePath: workspace().path,
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "model",
    thinkingLevel: "medium",
  } as any;
  return {
    createMcpRuntime: vi.fn(() => undefined),
    getThread: vi.fn(() => thread),
    listPermissionGrants: vi.fn(() => []),
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    ...overrides,
  };
}

function workspace(): WorkspaceState {
  return {
    path: "/workspace",
    name: "Workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/sessions",
  };
}

function provider(): WebResearchProviderConfig {
  return {
    providerId: "test-mcp",
    label: "Test MCP",
    kind: "remote-mcp",
    roles: ["search"],
    status: "enabled",
    mcp: {
      serverId: "test-server",
      workloadName: "test-workload",
      toolName: "search",
      argumentName: "query",
    },
  };
}

function descriptorFixture(): McpToolDescriptor {
  return {
    serverId: "test-server",
    workloadName: "test-workload",
    toolRef: "test-server/search",
    workloadStatus: "running",
    endpoint: "http://127.0.0.1:4040/sse",
    reviewStatus: "trusted",
    name: "search",
    policy: {
      visibility: "visible",
      callPolicy: "default",
    },
  };
}

function runtimeEnforcement() {
  return {
    status: "enforced",
    serverId: "test-server",
    workloadName: "test-workload",
    blockers: [],
    warnings: [],
    profilePath: "/tmp/test.permissions.json",
    profileSha256: "sha256",
    expectedProfileSha256: "sha256",
    profileSha256Verified: true,
    networkMode: "allowlist",
    allowHosts: ["example.test"],
    allowPorts: [443],
    filesystemMode: "isolated",
    allowReadPaths: [],
    allowWritePaths: [],
    publicWebEgressGrantEnforced: true,
    deniedResources: [],
  } as any;
}
