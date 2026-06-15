import { describe, expect, it, vi } from "vitest";

import type { WorkspaceState } from "../shared/types";
import type { McpToolDescriptor } from "./mcpToolBridge";
import {
  discoverWebResearchMcpProviderTools,
  type WebResearchMcpProviderToolDiscoveryOptions,
} from "./agentRuntimeWebResearchMcpProviderTools";

describe("agentRuntimeWebResearchMcpProviderTools", () => {
  it("returns no tools when MCP runtime is disabled", async () => {
    const createMcpRuntime = vi.fn(() => undefined);

    await expect(discoverWebResearchMcpProviderTools(workspace(), undefined, options({ createMcpRuntime }))).resolves.toEqual([]);

    expect(createMcpRuntime).toHaveBeenCalledWith(workspace());
  });

  it("searches MCP tools with the web research discovery parameters", async () => {
    const signal = new AbortController().signal;
    const descriptors = [descriptor()];
    const searchTools = vi.fn(async () => descriptors);

    await expect(discoverWebResearchMcpProviderTools(workspace(), signal, options({
      createMcpRuntime: vi.fn(() => ({ bridge: { searchTools } as any })),
    }))).resolves.toBe(descriptors);

    expect(searchTools).toHaveBeenCalledWith({ limit: 50, refresh: false, signal });
  });

  it("returns no tools when MCP discovery fails", async () => {
    const searchTools = vi.fn(async () => {
      throw new Error("ToolHive unavailable");
    });

    await expect(discoverWebResearchMcpProviderTools(workspace(), undefined, options({
      createMcpRuntime: vi.fn(() => ({ bridge: { searchTools } as any })),
    }))).resolves.toEqual([]);
  });
});

function options(
  overrides: Partial<WebResearchMcpProviderToolDiscoveryOptions> = {},
): WebResearchMcpProviderToolDiscoveryOptions {
  return {
    createMcpRuntime: vi.fn(() => undefined),
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

function descriptor(): McpToolDescriptor {
  return {
    serverId: "server-1",
    workloadName: "workload-1",
    toolRef: "server-1/search",
    reviewStatus: "trusted",
    name: "search",
  };
}
