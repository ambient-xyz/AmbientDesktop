import { describe, expect, it, vi } from "vitest";

import type { WorkspaceState } from "../../shared/types";
import type { McpToolDescriptor } from "../mcp/mcpToolBridge";
import {
  tryRouteBrowserContentThroughScrapling,
  type ScraplingBrowserRouteOptions,
} from "./agentRuntimeScraplingBrowserRoute";
import {
  SCRAPLING_DEFAULT_SERVER_ID,
  SCRAPLING_DEFAULT_WORKLOAD_NAME,
} from "../scrapling/scraplingBrowserRouting";

describe("agentRuntimeScraplingBrowserRoute", () => {
  it("does not create an MCP runtime for URLs that should stay in the browser", async () => {
    const createMcpRuntime = vi.fn();

    const result = await tryRouteBrowserContentThroughScrapling({
      threadId: "thread-1",
      workspace: workspace(),
      url: "http://localhost:3000",
      rawInput: { url: "http://localhost:3000" },
      signal: undefined,
    }, options({ createMcpRuntime }));

    expect(result).toEqual({});
    expect(createMcpRuntime).not.toHaveBeenCalled();
  });

  it("returns a fallback reason when MCP runtime is unavailable", async () => {
    const result = await tryRouteBrowserContentThroughScrapling({
      threadId: "thread-1",
      workspace: workspace(),
      url: "https://example.test/article",
      rawInput: { url: "https://example.test/article" },
      signal: undefined,
    }, options({ createMcpRuntime: vi.fn(() => undefined) }));

    expect(result).toEqual({ fallbackReason: "Ambient MCP runtime is not enabled." });
  });

  it("routes public HTTPS content through trusted Scrapling MCP with approval", async () => {
    const signal = new AbortController().signal;
    const descriptor = scraplingDescriptor();
    const updates: any[] = [];
    const describeTool = vi.fn(async () => descriptor);
    const evaluateRuntimePermission = vi.fn(async () => runtimeEnforcement());
    const callTool = vi.fn(async (input: any) => {
      input.onActivity?.({
        operation: "fetch",
        source: "mcp-client",
        endpointOrigin: "http://127.0.0.1:3030",
        bytes: 42,
        requestId: "request-1",
      });
      return {
        descriptor,
        text: "Scrapling page text.",
        output: { kind: "inline", text: "Scrapling page text." },
        arguments: input.arguments,
        originalArguments: input.arguments,
        stagedFiles: [],
        managedFileArtifacts: [],
      };
    });
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);

    const result = await tryRouteBrowserContentThroughScrapling({
      threadId: "thread-1",
      workspace: workspace(),
      url: "https://example.test/article",
      rawInput: { url: "https://example.test/article" },
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
      toolName: "fetch",
      serverId: SCRAPLING_DEFAULT_SERVER_ID,
      workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
      refresh: false,
      signal,
    });
    expect(evaluateRuntimePermission).toHaveBeenCalledWith(expect.objectContaining({ descriptor }));
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "ambient_mcp_tool_call",
      title: "Read https://example.test/article with Scrapling?",
      grantTargetLabel: "Call MCP tool io.github.d4vinci/scrapling/fetch",
    }));
    expect(callTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "fetch",
      serverId: SCRAPLING_DEFAULT_SERVER_ID,
      workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
      arguments: {
        url: "https://example.test/article",
        extraction_type: "markdown",
        main_content_only: true,
      },
      signal,
    }));
    expect(updates.map((update) => update.content[0].text)).toEqual([
      "Routing public URL read through installed Scrapling MCP tool fetch.",
      "Scrapling MCP activity: mcp-client.",
    ]);
    const textContent = result.result?.content[0];
    expect(textContent).toMatchObject({
      type: "text",
      text: expect.stringContaining("Scrapling retrieved this public URL through Ambient MCP."),
    });
    expect(result.result?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "browser_content",
      targetToolRef: "io.github.d4vinci/scrapling/fetch",
      routedTo: "ambient-mcp-scrapling",
      status: "complete",
      url: "https://example.test/article",
    });
  });
});

function options(overrides: Partial<ScraplingBrowserRouteOptions> = {}): ScraplingBrowserRouteOptions {
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

function scraplingDescriptor(): McpToolDescriptor {
  return {
    serverId: SCRAPLING_DEFAULT_SERVER_ID,
    workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
    toolRef: "io.github.d4vinci/scrapling/fetch",
    workloadStatus: "running",
    endpoint: "http://127.0.0.1:3030/sse",
    reviewStatus: "trusted",
    name: "fetch",
    policy: {
      visibility: "visible",
      callPolicy: "default",
    },
  };
}

function runtimeEnforcement() {
  return {
    status: "enforced",
    serverId: SCRAPLING_DEFAULT_SERVER_ID,
    workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
    blockers: [],
    warnings: [],
    profilePath: "/tmp/scrapling.permissions.json",
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
