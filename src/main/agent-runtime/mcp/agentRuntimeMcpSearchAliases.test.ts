import { describe, expect, it, vi } from "vitest";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  installedMcpSearchAliasesForWorkspace,
  installedMcpSearchAliasesFromState,
  type InstalledMcpSearchAliasServer,
} from "./agentRuntimeMcpSearchAliases";

describe("agentRuntimeMcpSearchAliases", () => {
  it("derives aliases from installed server identity and descriptors", () => {
    expect(installedMcpSearchAliasesFromState([installedServer()])).toEqual([
      "brasil-data-mcp-standard-mcp",
      "brasil",
      "data",
      "ambient-brasil-data-mcp-standard-mcp-e9baa907",
      "e9baa907",
      "brasil-data-mcp",
      "@acme/search-tools",
      "acme",
      "csvglow",
      "candidate-123",
      "candidate",
      "generate_dashboard",
      "generate",
      "dashboard",
      "read",
    ]);
  });

  it("returns no aliases when MCP runtime is disabled", async () => {
    const createMcpRuntime = vi.fn(() => undefined);

    await expect(installedMcpSearchAliasesForWorkspace(workspace(), { createMcpRuntime })).resolves.toEqual([]);

    expect(createMcpRuntime).toHaveBeenCalledWith(workspace());
  });

  it("returns no aliases when MCP state cannot be read", async () => {
    const readState = vi.fn(async () => {
      throw new Error("state unavailable");
    });

    await expect(installedMcpSearchAliasesForWorkspace(workspace(), {
      createMcpRuntime: () => ({ toolHive: { readState } }),
    })).resolves.toEqual([]);

    expect(readState).toHaveBeenCalledTimes(1);
  });
});

function installedServer(): InstalledMcpSearchAliasServer {
  return {
    serverId: "brasil-data-mcp-standard-mcp",
    workloadName: "ambient-brasil-data-mcp-standard-mcp-e9baa907",
    sourceIdentity: {
      registryId: "brasil-data-mcp",
      packageName: "@acme/search-tools",
      packageIdentifier: "npx://@acme/Search-Tools",
      toolHiveRunSource: "uvx://csvglow",
      candidateId: "candidate-123",
    },
    lastKnownToolDescriptors: [
      { name: "Generate_Dashboard" },
      { name: "read" },
      { name: 42 },
      ["ignored"],
    ],
  };
}

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}
