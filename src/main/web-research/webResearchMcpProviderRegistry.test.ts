import { describe, expect, it } from "vitest";
import type { McpToolDescriptor } from "./webResearchMcpFacade";
import { webResearchProviderConfigFromMcpTool, webResearchProviderConfigsFromMcpTools } from "./webResearchMcpProviderRegistry";

describe("webResearchMcpProviderRegistry", () => {
  it("projects explicit MCP web search tools into search providers", () => {
    const provider = webResearchProviderConfigFromMcpTool(tool({
      serverId: "io.example/brave-search",
      name: "web_search",
      description: "Search the public web with Brave Search.",
      inputSchema: schema("query"),
    }));

    expect(provider).toMatchObject({
      providerId: "mcp:io.example/brave-search/web_search",
      kind: "toolhive-mcp",
      roles: ["search"],
      status: "enabled",
      mcp: {
        serverId: "io.example/brave-search",
        workloadName: "ambient-brave-search",
        toolName: "web_search",
        argumentName: "query",
      },
    });
  });

  it("projects non-default MCP URL retrieval tools into fetch providers", () => {
    const provider = webResearchProviderConfigFromMcpTool(tool({
      serverId: "io.example/page-reader",
      name: "fetch_page",
      description: "Fetch a public HTTPS page as markdown content.",
      inputSchema: schema("url"),
    }));

    expect(provider).toMatchObject({
      providerId: "mcp:io.example/page-reader/fetch_page",
      roles: ["fetch"],
      mcp: expect.objectContaining({ toolName: "fetch_page", argumentName: "url" }),
    });
  });

  it("does not duplicate the built-in Scrapling provider or expose mutating tools", () => {
    const providers = webResearchProviderConfigsFromMcpTools([
      tool({
        serverId: "io.github.d4vinci/scrapling",
        workloadName: "ambient-scrapling",
        name: "get",
        description: "Fetch one public HTTPS page with Scrapling.",
        inputSchema: schema("url"),
      }),
      tool({
        serverId: "io.example/docs",
        name: "delete-docs",
        description: "Delete cached documentation for a library.",
        inputSchema: schema("query"),
      }),
      tool({
        serverId: "io.github.stacklok/context7",
        name: "query-docs",
        description: "Query documentation for a resolved library id.",
        inputSchema: schema("query"),
      }),
    ]);

    expect(providers).toEqual([]);
  });

  it("keeps matching but untrusted MCP providers disabled until review passes", () => {
    const provider = webResearchProviderConfigFromMcpTool(tool({
      serverId: "io.example/tavily",
      name: "search",
      description: "Web search provider.",
      inputSchema: schema("query"),
      reviewStatus: "needs-review",
      reviewReason: "descriptor drift detected",
    }));

    expect(provider).toMatchObject({
      providerId: "mcp:io.example/tavily/search",
      roles: ["search"],
      status: "disabled",
    });
  });
});

function tool(input: Partial<McpToolDescriptor> & Pick<McpToolDescriptor, "serverId" | "name" | "description" | "inputSchema">): McpToolDescriptor {
  return {
    workloadName: input.workloadName ?? `ambient-${input.serverId.split("/").pop() ?? "mcp"}`,
    toolRef: input.toolRef ?? `${input.serverId}/${input.name}`,
    endpoint: input.endpoint ?? "http://127.0.0.1:34567/mcp",
    reviewStatus: input.reviewStatus ?? "trusted",
    workloadStatus: input.workloadStatus ?? "running",
    ...input,
  };
}

function schema(requiredName: string): unknown {
  return {
    type: "object",
    properties: {
      [requiredName]: { type: "string" },
    },
    required: [requiredName],
    additionalProperties: false,
  };
}
