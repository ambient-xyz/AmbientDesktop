import { describe, expect, it, vi } from "vitest";

import type { AmbientWorkflowPlaybookDescription } from "../../ambient/ambientWorkflows";
import {
  registerAmbientWorkflowRestoreTool,
  type AmbientWorkflowRestoreToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowRestoreTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeAmbientWorkflowRestoreTools", () => {
  it("registers workflow restore-version with injected workflow recording services", async () => {
    const registeredTools: RegisteredTool[] = [];
    const restoreVersion = vi.fn(async () => workflowDescriptionFixture({ version: 3 }));
    const markAmbientWorkflowPlaybookDescribed = vi.fn();

    registerAmbientWorkflowRestoreTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { restoreVersion },
      markAmbientWorkflowPlaybookDescribed,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_workflows_restore_version"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("restore", {
      id: "workflow-1",
      version: 1,
    });

    expect(restoreVersion).toHaveBeenCalledWith({
      id: "workflow-1",
      version: 1,
    });
    expect(markAmbientWorkflowPlaybookDescribed).toHaveBeenCalledWith("workflow-1", 3);
    expect(result.content[0].text).toContain("Ambient Workflows playbook version restored");
    expect(result.details).toEqual({
      runtime: "ambient-workflows",
      toolName: "ambient_workflows_restore_version",
      workflowId: "workflow-1",
      title: "Summarize pull requests",
      version: 3,
      restoredFromVersion: 1,
      archived: false,
      enabled: true,
    });
  });

  it("uses local playbook service when feature hook is absent", async () => {
    const registeredTools: RegisteredTool[] = [];
    const store = { marker: "store" } as any;
    const restoreAmbientWorkflowPlaybookVersion = vi.fn(() => workflowDescriptionFixture({ version: 4 }));
    const markAmbientWorkflowPlaybookDescribed = vi.fn();

    registerAmbientWorkflowRestoreTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      store,
      restoreAmbientWorkflowPlaybookVersion,
      markAmbientWorkflowPlaybookDescribed,
    }));

    await registeredTools[0]!.execute("restore", { id: "workflow-1", version: 2 });

    expect(restoreAmbientWorkflowPlaybookVersion).toHaveBeenCalledWith(store, {
      id: "workflow-1",
      version: 2,
    });
    expect(markAmbientWorkflowPlaybookDescribed).toHaveBeenCalledWith("workflow-1", 4);
  });

  it("preserves restore-version input validation", async () => {
    const registeredTools: RegisteredTool[] = [];
    const restoreVersion = vi.fn(async () => workflowDescriptionFixture());

    registerAmbientWorkflowRestoreTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { restoreVersion },
    }));

    await expect(registeredTools[0]!.execute("restore", {
      version: 1,
    })).rejects.toThrow("id is required.");
    await expect(registeredTools[0]!.execute("restore", {
      id: "workflow-1",
      version: 0,
    })).rejects.toThrow("Missing required positive integer: version");
    expect(restoreVersion).not.toHaveBeenCalled();
  });
});

function options(
  overrides: Partial<AmbientWorkflowRestoreToolRegistrationOptions> = {},
): AmbientWorkflowRestoreToolRegistrationOptions {
  return {
    store: {} as any,
    markAmbientWorkflowPlaybookDescribed: () => undefined,
    ...overrides,
  };
}

function workflowDescriptionFixture(
  overrides: Partial<AmbientWorkflowPlaybookDescription> = {},
): AmbientWorkflowPlaybookDescription {
  return {
    id: "workflow-1",
    title: "Summarize pull requests",
    version: 2,
    enabled: true,
    savedAt: "2026-06-10T00:00:00.000Z",
    manifestPath: "/workspace/.ambient/workflows/workflow-1/manifest.json",
    markdownPath: "/workspace/.ambient/workflows/workflow-1/workflow.md",
    sidecarPath: "/workspace/.ambient/workflows/workflow-1/sidecar.json",
    transcriptPath: "/workspace/.ambient/workflows/workflow-1/transcript.jsonl",
    summary: "Summarize pull requests with evidence.",
    toolNames: ["file_read", "shell_exec"],
    outputShape: ["summary"],
    versions: [
      {
        version: 2,
        title: "Summarize pull requests",
        savedAt: "2026-06-10T00:00:00.000Z",
        manifestPath: "/workspace/.ambient/workflows/workflow-1/manifest.json",
        markdownPath: "/workspace/.ambient/workflows/workflow-1/workflow.md",
        sidecarPath: "/workspace/.ambient/workflows/workflow-1/sidecar.json",
        transcriptPath: "/workspace/.ambient/workflows/workflow-1/transcript.jsonl",
      },
    ],
    markdownPreview: "",
    markdownIncluded: false,
    markdownTruncated: false,
    guidance: [],
    ...overrides,
  };
}
