import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callExaWebFetch, callExaWebSearch, EXA_MCP_ENDPOINT } from "./webResearchBroker";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("webResearchBroker", () => {
  it("calls Exa search through the reviewed remote MCP endpoint", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-web-research-"));
    tempDirs.push(workspacePath);
    const fetchImpl = exaFetchMock("Search result from Exa");

    const result = await callExaWebSearch({
      workspacePath,
      query: "Ambient Desktop",
      maxResults: 3,
      fetchImpl,
    });

    expect(result.providerId).toBe("exa-mcp-default");
    expect(result.tool).toBe("web_search_exa");
    expect(result.text).toContain("Search result from Exa");
    expect(fetchImpl).toHaveBeenCalledWith(EXA_MCP_ENDPOINT, expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toMatchObject({
      method: "tools/call",
      params: {
        name: "web_search_exa",
        arguments: { query: "Ambient Desktop", numResults: 3 },
      },
    });
  });

  it("calls Exa fetch with a URL array", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-web-research-"));
    tempDirs.push(workspacePath);
    const fetchImpl = exaFetchMock("Fetched content from Exa");

    const result = await callExaWebFetch({
      workspacePath,
      url: "https://example.com/",
      maxCharacters: 2000,
      fetchImpl,
    });

    expect(result.tool).toBe("web_fetch_exa");
    expect(result.text).toContain("Fetched content from Exa");
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toMatchObject({
      method: "tools/call",
      params: {
        name: "web_fetch_exa",
        arguments: { urls: ["https://example.com/"], maxCharacters: 2000 },
      },
    });
  });
});

function exaFetchMock(toolText: string) {
  return vi.fn(async (_input: string | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { id?: number; method?: string } : {};
    if (body.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }
    return new Response(
      `event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: body.method === "initialize"
          ? { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "exa-search-server", version: "fixture" } }
          : { content: [{ type: "text", text: toolText }] },
      })}\n\n`,
      {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "mcp-session-id": "fixture-session",
        },
      },
    );
  });
}
