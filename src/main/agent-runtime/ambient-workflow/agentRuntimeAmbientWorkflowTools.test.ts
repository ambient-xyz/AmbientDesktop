import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { registerAgentRuntimeAmbientWorkflowTools } from "./agentRuntimeAmbientWorkflowTools";

describe("agentRuntimeAmbientWorkflowTools", () => {
  it("registers the Ambient Workflow tool group in the existing order", () => {
    const registeredTools: ToolDefinition<any, any, any>[] = [];

    registerAgentRuntimeAmbientWorkflowTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      store: {
        getFeatureFlagSettings: () => ({}),
      } as any,
      workflowRecordings: {},
      markAmbientWorkflowPlaybookDescribed: vi.fn(),
      isAmbientWorkflowPlaybookDescribed: vi.fn(() => true),
      getFeatureFlagSnapshot: () => ({
        subagents: false,
        callableWorkflows: false,
      }) as any,
      getCallableWorkflowRecordedPlaybooks: () => [],
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_workflows_search",
      "ambient_workflows_describe",
      "ambient_workflows_callable_catalog",
      "ambient_workflows_callable_describe",
      "ambient_workflows_inject",
      "ambient_workflows_update",
      "ambient_workflows_archive",
      "ambient_workflows_unarchive",
      "ambient_workflows_restore_version",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });
});
