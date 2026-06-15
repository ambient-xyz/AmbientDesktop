import { describe, expect, it } from "vitest";

import type { SubagentToolCategoryId, SubagentToolScopeGrant } from "../shared/subagentToolScope";
import type { SubagentToolScopeSnapshotSummary } from "../shared/types";
import {
  isSubagentChildActivatableBuiltInTool,
  resolveAgentRuntimeActiveToolNamesForThread,
  resolveSubagentChildActiveToolActivation,
  resolveSubagentChildActiveToolNames,
  subagentChildActivatableBuiltInToolNamesForCategory,
  subagentChildCallableWorkflowToolNamesFromSnapshots,
} from "./subagentChildActiveTools";

describe("resolveAgentRuntimeActiveToolNamesForThread", () => {
  it("preserves the normal parent active tool surface for non-child threads", () => {
    expect(resolveAgentRuntimeActiveToolNamesForThread({
      thread: { kind: "chat" },
      defaultActiveToolNames: ["read", "ambient_tool_search"],
      goalModeToolNames: ["get_goal"],
      subagentToolNames: ["ambient_subagent"],
      callableWorkflowToolNames: ["ambient_workflow_symphony_map_reduce"],
      pluginMcpToolNames: ["plugin_mcp"],
      projectBoardTaskToolNames: ["project_task"],
    })).toEqual([
      "read",
      "ambient_tool_search",
      "get_goal",
      "ambient_subagent",
      "ambient_workflow_symphony_map_reduce",
      "plugin_mcp",
      "project_task",
    ]);
  });

  it("fails closed for child threads without a persisted tool-scope snapshot", () => {
    expect(resolveAgentRuntimeActiveToolNamesForThread({
      thread: { kind: "subagent_child", subagentRunId: "run-1" },
      defaultActiveToolNames: ["read", "write", "ambient_tool_call"],
      goalModeToolNames: ["get_goal"],
      subagentToolNames: ["ambient_subagent"],
      callableWorkflowToolNames: ["ambient_workflow_symphony_map_reduce"],
      pluginMcpToolNames: ["plugin_mcp"],
      projectBoardTaskToolNames: ["project_task"],
      subagentToolScopeSnapshots: [],
    })).toEqual([]);
  });

  it("activates registered extension tools for child threads from the runtime plugin catalog", () => {
    expect(resolveAgentRuntimeActiveToolNamesForThread({
      thread: { kind: "subagent_child", subagentRunId: "run-1" },
      defaultActiveToolNames: ["read", "write", "ambient_tool_call"],
      goalModeToolNames: ["get_goal"],
      subagentToolNames: ["ambient_subagent"],
      pluginMcpToolNames: ["fixture_search"],
      projectBoardTaskToolNames: ["project_task"],
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read"], {
          grants: [extensionGrant("fixture_search", "workspace.read")],
        }),
      ],
    })).toEqual(["read", "ambient_git_status", "fixture_search"]);
  });
});

describe("resolveSubagentChildActiveToolNames", () => {
  it("identifies exact built-in child tools from the same table used for activation", () => {
    expect(subagentChildActivatableBuiltInToolNamesForCategory("workspace.read")).toEqual(["read", "ambient_git_status"]);
    expect(subagentChildActivatableBuiltInToolNamesForCategory("connector.read")).toEqual([
      "web_research_status",
      "web_research_search",
      "web_research_fetch",
    ]);
    expect(isSubagentChildActivatableBuiltInTool({ toolName: "read", categoryId: "workspace.read" })).toBe(true);
    expect(isSubagentChildActivatableBuiltInTool({ toolName: "web_research_search", categoryId: "connector.read" })).toBe(true);
    expect(isSubagentChildActivatableBuiltInTool({ toolName: "ambient_tool_call", categoryId: "workspace.read" })).toBe(false);
    expect(isSubagentChildActivatableBuiltInTool({ toolName: "bash", categoryId: "test.run" })).toBe(false);
  });

  it("does not inherit parent active tools for read-only child scopes", () => {
    const activeTools = resolveSubagentChildActiveToolNames({
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read", "browser.read", "long-context.read"]),
      ],
    });

    expect(activeTools).toEqual([
      "read",
      "ambient_git_status",
      "browser_search",
      "browser_nav",
      "browser_content",
      "browser_screenshot",
      "long_context_process",
    ]);
    expect(activeTools).not.toContain("bash");
    expect(activeTools).not.toContain("write");
    expect(activeTools).not.toContain("ambient_tool_call");
    expect(activeTools).not.toContain("ambient_subagent");
    expect(activeTools).not.toContain("ambient_workflow_symphony_map_reduce");
    expect(activeTools).not.toContain("plugin_mcp");
    expect(activeTools).not.toContain("project_task");
    expect(activeTools).not.toContain("browser_local_preview");
    expect(activeTools).not.toContain("browser_click");
    expect(activeTools).not.toContain("browser_get_value");
    expect(activeTools).not.toContain("browser_wait_for");
    expect(activeTools).not.toContain("browser_assert");
  });

  it("uses brokered web research for connector-read child scopes without preference mutation tools", () => {
    const activeTools = resolveSubagentChildActiveToolNames({
      subagentToolScopeSnapshots: [
        snapshot(["connector.read"]),
      ],
    });

    expect(activeTools).toEqual([
      "web_research_status",
      "web_research_search",
      "web_research_fetch",
    ]);
    expect(activeTools).not.toContain("web_research_preferences_update");
    expect(activeTools).not.toContain("web_research_provider_search");
    expect(activeTools).not.toContain("web_research_provider_describe");
    expect(activeTools).not.toContain("browser_search");
    expect(activeTools).not.toContain("browser_content");
  });

  it("does not activate callable workflow tools from child snapshots unless registered for the child launch", () => {
    const resolution = resolveSubagentChildActiveToolActivation({
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read", "workflow.call"], {
          grants: [
            {
              source: "callable_workflow",
              id: "ambient_workflow_symphony_map_reduce",
              categoryId: "workflow.call",
              piVisible: true,
              mutatesState: false,
              requiresApproval: true,
            },
          ],
        }),
      ],
    });

    expect(resolution.activeToolNames).toEqual(["read", "ambient_git_status"]);
    expect(resolution.unavailableCallableWorkflowToolNames).toEqual([
      {
        toolName: "ambient_workflow_symphony_map_reduce",
        categoryId: "workflow.call",
        reason: "Requested callable workflow tool is not registered as child-visible for this launch.",
      },
    ]);
    expect(() => resolveSubagentChildActiveToolNames({
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read", "workflow.call"], {
          grants: [callableWorkflowGrant("ambient_workflow_symphony_map_reduce")],
        }),
      ],
    })).toThrow("requested unavailable callable workflow tools before launch");
    expect(() => resolveSubagentChildActiveToolNames({
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read", "workflow.call"], {
          grants: [callableWorkflowGrant("ambient_workflow_symphony_map_reduce")],
        }),
      ],
    })).toThrow("Requested callable workflow tool is not registered as child-visible for this launch.");
  });

  it("activates exact callable workflow tools when the child launch catalog exposes them", () => {
    expect(resolveSubagentChildActiveToolNames({
      availableCallableWorkflowToolNames: ["ambient_workflow_symphony_map_reduce"],
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read", "workflow.call"], {
          grants: [callableWorkflowGrant("ambient_workflow_symphony_map_reduce")],
        }),
      ],
    })).toEqual(["read", "ambient_git_status", "ambient_workflow_symphony_map_reduce"]);

    expect(resolveAgentRuntimeActiveToolNamesForThread({
      thread: { kind: "subagent_child", subagentRunId: "run-1" },
      defaultActiveToolNames: ["read"],
      goalModeToolNames: [],
      subagentToolNames: ["ambient_subagent"],
      callableWorkflowToolNames: ["ambient_workflow_symphony_map_reduce"],
      pluginMcpToolNames: [],
      projectBoardTaskToolNames: [],
      subagentToolScopeSnapshots: [
        snapshot(["workflow.call"], {
          grants: [callableWorkflowGrant("ambient_workflow_symphony_map_reduce")],
        }),
      ],
    })).toEqual(["ambient_workflow_symphony_map_reduce"]);
  });

  it("extracts latest exact callable workflow grants for child callable workflow registration", () => {
    expect(subagentChildCallableWorkflowToolNamesFromSnapshots([
      snapshot(["workflow.call"], {
        sequence: 1,
        grants: [callableWorkflowGrant("ambient_workflow_symphony_map_reduce")],
      }),
      snapshot(["workspace.read"], {
        sequence: 2,
        grants: [callableWorkflowGrant("ambient_workflow_symphony_pipeline")],
      }),
      snapshot(["workflow.call"], {
        sequence: 3,
        grants: [
          callableWorkflowGrant("ambient_workflow_symphony_ensemble"),
          callableWorkflowGrant("ambient_workflow_symphony_ensemble"),
          {
            ...callableWorkflowGrant("ambient_workflow_symphony_pipeline"),
            piVisible: false,
          },
        ],
      }),
    ])).toEqual(["ambient_workflow_symphony_ensemble"]);
  });

  it("exposes worker write tools only from a workspace.write snapshot", () => {
    expect(resolveSubagentChildActiveToolNames({
      subagentToolScopeSnapshots: [snapshot(["workspace.read", "test.run"])],
    })).toEqual(["read", "ambient_git_status"]);

    expect(resolveSubagentChildActiveToolNames({
      subagentToolScopeSnapshots: [snapshot(["workspace.read", "workspace.write", "test.run"])],
    })).toEqual(["read", "ambient_git_status", "bash", "edit", "write"]);
  });

  it("uses the latest child tool-scope snapshot", () => {
    expect(resolveSubagentChildActiveToolNames({
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read", "workspace.write"], { sequence: 1 }),
        snapshot(["workspace.read"], { sequence: 2 }),
      ],
    })).toEqual(["read", "ambient_git_status"]);
  });

  it("does not let exact built-in grants widen beyond visible child categories", () => {
    const activeTools = resolveSubagentChildActiveToolNames({
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read"], {
          grants: [
            builtInGrant("ambient_git_status", "workspace.read"),
            builtInGrant("ambient_tool_call", "workspace.read"),
            builtInGrant("browser_eval", "browser.interactive"),
            builtInGrant("bash", "test.run"),
          ],
        }),
      ],
    });

    expect(activeTools).toEqual(["read", "ambient_git_status"]);
    expect(activeTools).not.toContain("ambient_tool_call");
    expect(activeTools).not.toContain("browser_eval");
    expect(activeTools).not.toContain("bash");
  });

  it("activates snapshotted extension tools only when registered for the child launch", () => {
    const activeTools = resolveSubagentChildActiveToolNames({
      availableExtensionToolNames: ["fixture_search"],
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read"], {
          grants: [extensionGrant("fixture_search", "workspace.read")],
        }),
      ],
    });

    expect(activeTools).toEqual(["read", "ambient_git_status", "fixture_search"]);
  });

  it("fails before launch when a visible extension tool is not registered", () => {
    const resolution = resolveSubagentChildActiveToolActivation({
      availableExtensionToolNames: [],
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read"], {
          grants: [extensionGrant("missing_fixture_search", "workspace.read")],
        }),
      ],
    });

    expect(resolution.unavailableExtensionToolNames).toEqual([
      expect.objectContaining({
        toolName: "missing_fixture_search",
        categoryId: "workspace.read",
      }),
    ]);
    expect(() => resolveSubagentChildActiveToolNames({
      availableExtensionToolNames: [],
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read"], {
          grants: [extensionGrant("missing_fixture_search", "workspace.read")],
        }),
      ],
    })).toThrow("requested unavailable extension tools before launch");
    expect(() => resolveSubagentChildActiveToolNames({
      availableExtensionToolNames: [],
      subagentToolScopeSnapshots: [
        snapshot(["workspace.read"], {
          grants: [extensionGrant("missing_fixture_search", "workspace.read")],
        }),
      ],
    })).toThrow("Requested extension tool is not registered by any enabled Codex plugin MCP server for this child launch.");
  });
});

function snapshot(
  piVisibleCategories: SubagentToolCategoryId[],
  options: {
    sequence?: number;
    grants?: SubagentToolScopeGrant[];
  } = {},
): SubagentToolScopeSnapshotSummary {
  return {
    runId: "run-1",
    sequence: options.sequence ?? 1,
    createdAt: "2026-06-06T00:00:00.000Z",
    resolverInputs: null,
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: piVisibleCategories,
      piVisibleCategories,
      deniedCategories: [],
      loadedTools: options.grants ?? [],
      piVisibleTools: options.grants ?? [],
      deniedTools: [],
      approvalMode: "interactive",
      worktreeIsolated: piVisibleCategories.includes("workspace.write"),
      fanoutAvailable: false,
    },
  };
}

function builtInGrant(id: string, categoryId: SubagentToolCategoryId): SubagentToolScopeGrant {
  return {
    source: "built_in",
    id,
    categoryId,
    piVisible: true,
    mutatesState: categoryId === "workspace.write",
    requiresApproval: categoryId === "workspace.write",
  };
}

function extensionGrant(id: string, categoryId: SubagentToolCategoryId): SubagentToolScopeGrant {
  return {
    source: "extension_tool",
    id,
    categoryId,
    piVisible: true,
    mutatesState: categoryId === "workspace.write",
    requiresApproval: categoryId === "workspace.write",
  };
}

function callableWorkflowGrant(id: string): SubagentToolScopeGrant {
  return {
    source: "callable_workflow",
    id,
    categoryId: "workflow.call",
    piVisible: true,
    mutatesState: false,
    requiresApproval: true,
  };
}
