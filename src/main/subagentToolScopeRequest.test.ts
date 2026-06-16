import { describe, expect, it } from "vitest";

import {
  resolveSubagentToolScopeRequest,
  SUBAGENT_TOOL_SCOPE_REQUEST_SCHEMA_VERSION,
  unavailableRequestedExtensionToolNames,
} from "./subagentToolScopeRequest";

describe("subagentToolScopeRequest", () => {
  it("normalizes launch-time tool-scope requests into the resolver contract", () => {
    const request = resolveSubagentToolScopeRequest({
      requestedCategories: [" workspace.read ", "workspace.read", "", "artifact.read"],
      builtInTools: [{ id: " read ", categoryId: "workspace.read" }],
      extensionLoads: [{ id: "pi-subagents", categoryId: "workspace.read" }],
      surfacedExtensionTools: [{ id: "pi-subagents.search", categoryId: "workspace.read" }],
      directMcpTools: [{ id: "filesystem/read_file", categoryId: "mcp.direct", piVisible: false }],
      connectorTools: [{ id: "gmail.search", categoryId: "connector.read", piVisible: false }],
      callableWorkflowTools: [{ id: "ambient_workflow_symphony_map_reduce", categoryId: "workflow.call", piVisible: true }],
      skills: [{ id: "openai-docs", categoryId: "artifact.read" }],
      fanout: true,
      approvalMode: "non_interactive",
      childAuthority: {
        taskIntent: "file_read",
        rationale: "Read three user-selected files only.",
        readRoots: [" /Users/travis/Downloads/a.pdf ", "/Users/travis/Downloads/a.pdf"],
        writeRoots: ["/Users/travis/Downloads"],
        network: "deny",
        mutation: "deny",
        nestedFanout: "deny",
      },
    });

    expect(SUBAGENT_TOOL_SCOPE_REQUEST_SCHEMA_VERSION).toBe("ambient-subagent-tool-scope-request-v1");
    expect(request).toEqual({
      requestedCategories: ["workspace.read", "artifact.read"],
      requestedSources: [
        { source: "built_in", id: "read", categoryId: "workspace.read" },
        { source: "extension_load", id: "pi-subagents", categoryId: "workspace.read" },
        { source: "extension_tool", id: "pi-subagents.search", categoryId: "workspace.read" },
        { source: "direct_mcp", id: "filesystem/read_file", categoryId: "mcp.direct", piVisible: false },
        { source: "connector_app", id: "gmail.search", categoryId: "connector.read", piVisible: false },
        { source: "callable_workflow", id: "ambient_workflow_symphony_map_reduce", categoryId: "workflow.call", piVisible: true },
        { source: "skill", id: "openai-docs", categoryId: "artifact.read" },
      ],
      requestedFanout: true,
      approvalMode: "non_interactive",
      childAuthority: {
        taskIntent: "file_read",
        rationale: "Read three user-selected files only.",
        readRoots: ["/Users/travis/Downloads/a.pdf"],
        writeRoots: ["/Users/travis/Downloads"],
        network: "deny",
        mutation: "deny",
        nestedFanout: "deny",
      },
    });
  });

  it("rejects unknown categories before launch", () => {
    expect(() => resolveSubagentToolScopeRequest({
      requestedCategories: ["workspace.red"],
    })).toThrow("Unknown sub-agent tool category in toolScope.requestedCategories: workspace.red");

    expect(() => resolveSubagentToolScopeRequest({
      builtInTools: [{ id: "read", categoryId: "workspace.red" }],
    })).toThrow("Unknown sub-agent tool category in toolScope.builtInTools[0].categoryId: workspace.red");
  });

  it("rejects missing, broad, and secret-shaped source ids before launch", () => {
    expect(() => resolveSubagentToolScopeRequest({
      surfacedExtensionTools: [{}],
    })).toThrow("toolScope.surfacedExtensionTools[0].id is required.");

    expect(() => resolveSubagentToolScopeRequest({
      connectorTools: [{ id: "gmail", categoryId: "connector.read" }],
    })).toThrow("Connector tool source ids must use exact connector.operation ids.");

    expect(() => resolveSubagentToolScopeRequest({
      directMcpTools: [{ id: "filesystem", categoryId: "mcp.direct" }],
    })).toThrow("Direct MCP tool source ids must use exact server/tool operation ids.");

    expect(() => resolveSubagentToolScopeRequest({
      callableWorkflowTools: [{ id: "ambient_workflows_search", categoryId: "workflow.call" }],
    })).toThrow("Callable workflow tool source ids must use exact ambient_workflow_symphony_* or ambient_workflow_recorded_* tool names.");

    expect(() => resolveSubagentToolScopeRequest({
      directMcpTools: [{ id: "server/sk-proj-abcdefghijklmnopqrstuvwxyz123456", categoryId: "mcp.direct" }],
    })).toThrow("Sub-agent tool source request id appears to contain secret-like material.");
  });

  it("rejects unknown exact built-in child tools with actionable candidates", () => {
    expect(() => resolveSubagentToolScopeRequest({
      builtInTools: [{ id: "reed", categoryId: "workspace.read" }],
    })).toThrow("Use one of: read, ambient_git_status.");

    expect(() => resolveSubagentToolScopeRequest({
      builtInTools: [{ id: "bash", categoryId: "test.run" }],
    })).toThrow("No exact built-in child tools are currently activatable for test.run");

    expect(() => resolveSubagentToolScopeRequest({
      builtInTools: [{ id: "browser_search", categoryId: "browser.read" }],
    })).toThrow("No exact built-in child tools are currently activatable for browser.read");

    expect(resolveSubagentToolScopeRequest({
      builtInTools: [{ id: "browser_search", categoryId: "browser.interactive" }],
    })).toEqual({
      requestedSources: [{ source: "built_in", id: "browser_search", categoryId: "browser.interactive" }],
    });
  });

  it("reports only unavailable Pi-visible surfaced extension tools", () => {
    const request = resolveSubagentToolScopeRequest({
      surfacedExtensionTools: [
        { id: "pi-subagents.search", categoryId: "workspace.read" },
        { id: "pi-subagents.hidden", categoryId: "workspace.read", piVisible: false },
        { id: "pi-subagents.missing", categoryId: "artifact.read" },
      ],
    });

    expect(unavailableRequestedExtensionToolNames(request, ["pi-subagents.search"])).toEqual([
      { id: "pi-subagents.missing", categoryId: "artifact.read" },
    ]);
    expect(unavailableRequestedExtensionToolNames(request)).toEqual([]);
  });

  it("ignores unknown approval modes instead of widening policy", () => {
    expect(resolveSubagentToolScopeRequest({
      requestedCategories: ["workspace.read"],
      approvalMode: "always",
    })).toEqual({
      requestedCategories: ["workspace.read"],
    });
  });

  it("accepts brokered web research as a narrow child authority intent", () => {
    expect(resolveSubagentToolScopeRequest({
      requestedCategories: ["connector.read"],
      childAuthority: {
        taskIntent: "web_research",
        network: "ask_parent",
        mutation: "deny",
      },
    })).toEqual({
      requestedCategories: ["connector.read"],
      childAuthority: {
        taskIntent: "web_research",
        network: "ask_parent",
        mutation: "deny",
      },
    });
  });

  it("rejects wildcard child authority roots before launch", () => {
    expect(() => resolveSubagentToolScopeRequest({
      childAuthority: {
        taskIntent: "file_read",
        readRoots: ["/Users/travis/Downloads/*"],
      },
    })).toThrow("toolScope.childAuthority.readRoots[0] must not use wildcard grants.");
  });
});
