import { describe, expect, it, vi } from "vitest";

import type { McpToolDescriptor } from "../mcp/mcpToolBridge";
import {
  NO_CALLABLE_SCRAPLING_TOOL_MESSAGE,
  resolveScraplingBrowserContentDescriptor,
} from "./scraplingMcpDescriptor";
import {
  SCRAPLING_DEFAULT_SERVER_ID,
  SCRAPLING_DEFAULT_WORKLOAD_NAME,
} from "./scraplingBrowserRouting";

describe("scraplingMcpDescriptor", () => {
  it("tries Scrapling candidate tools until one is callable", async () => {
    const signal = new AbortController().signal;
    const callable = scraplingDescriptor({ name: "get" });
    const describeTool = vi
      .fn()
      .mockResolvedValueOnce(scraplingDescriptor({ name: "fetch", reviewStatus: "needs-review", reviewReason: "descriptor drift" }))
      .mockResolvedValueOnce(callable);

    await expect(resolveScraplingBrowserContentDescriptor({ describeTool } as any, signal)).resolves.toEqual({
      descriptor: callable,
      unavailableReason: "",
    });

    expect(describeTool).toHaveBeenNthCalledWith(1, {
      toolName: "fetch",
      serverId: SCRAPLING_DEFAULT_SERVER_ID,
      workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
      refresh: false,
      signal,
    });
    expect(describeTool).toHaveBeenNthCalledWith(2, {
      toolName: "get",
      serverId: SCRAPLING_DEFAULT_SERVER_ID,
      workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
      refresh: false,
      signal,
    });
  });

  it("reports the last descriptor readiness error", async () => {
    const describeTool = vi
      .fn()
      .mockRejectedValueOnce(new Error("lookup failed"))
      .mockResolvedValueOnce(scraplingDescriptor({ name: "get", endpoint: undefined }))
      .mockResolvedValueOnce(scraplingDescriptor({ name: "stealthy_fetch", workloadStatus: "stopped" }));

    await expect(resolveScraplingBrowserContentDescriptor({ describeTool } as any)).resolves.toEqual({
      unavailableReason: "Scrapling workload is stopped, not running.",
    });
  });

  it("reports no-callable lookup failures", async () => {
    const describeTool = vi.fn(async () => {
      throw new Error(NO_CALLABLE_SCRAPLING_TOOL_MESSAGE);
    });

    await expect(resolveScraplingBrowserContentDescriptor({ describeTool } as any)).resolves.toEqual({
      unavailableReason: NO_CALLABLE_SCRAPLING_TOOL_MESSAGE,
    });
  });
});

function scraplingDescriptor(overrides: Partial<McpToolDescriptor> = {}): McpToolDescriptor {
  return {
    serverId: SCRAPLING_DEFAULT_SERVER_ID,
    workloadName: SCRAPLING_DEFAULT_WORKLOAD_NAME,
    toolRef: `io.github.d4vinci/scrapling/${overrides.name ?? "fetch"}`,
    workloadStatus: "running",
    endpoint: "http://127.0.0.1:3030/sse",
    reviewStatus: "trusted",
    name: "fetch",
    ...overrides,
  };
}
