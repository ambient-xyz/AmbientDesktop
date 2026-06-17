import { describe, expect, it, vi } from "vitest";

import type { AmbientWorkflowPlaybookDescription } from "../../ambient/ambientWorkflows";
import {
  registerAmbientWorkflowArchiveTools,
  type AmbientWorkflowArchiveToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowArchiveTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeAmbientWorkflowArchiveTools", () => {
  it("registers archive and unarchive workflow tools with injected workflow recording services", async () => {
    const registeredTools: RegisteredTool[] = [];
    const archive = vi.fn(async () => workflowDescriptionFixture({
      archivedAt: "2026-06-10T00:00:00.000Z",
      archivedReason: "Superseded.",
    }));
    const unarchive = vi.fn(async () => workflowDescriptionFixture());

    registerAmbientWorkflowArchiveTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { archive, unarchive },
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_workflows_archive",
      "ambient_workflows_unarchive",
    ]);
    expect(registeredTools.map((tool) => tool.executionMode)).toEqual(["sequential", "sequential"]);

    const archiveResult = await registeredTools[0]!.execute("archive", {
      id: "workflow-1",
      baseVersion: 2,
      reason: "Superseded.",
    });

    expect(archive).toHaveBeenCalledWith({
      id: "workflow-1",
      baseVersion: 2,
      reason: "Superseded.",
    });
    expect(archiveResult.content[0].text).toContain("Ambient Workflows playbook archived");
    expect(archiveResult.details).toEqual({
      runtime: "ambient-workflows",
      toolName: "ambient_workflows_archive",
      workflowId: "workflow-1",
      title: "Summarize pull requests",
      version: 2,
      baseVersion: 2,
      archived: true,
    });

    const unarchiveResult = await registeredTools[1]!.execute("unarchive", {
      id: "workflow-1",
      baseVersion: 2,
    });

    expect(unarchive).toHaveBeenCalledWith({
      id: "workflow-1",
      baseVersion: 2,
    });
    expect(unarchiveResult.content[0].text).toContain("Ambient Workflows playbook unarchived");
    expect(unarchiveResult.details).toEqual({
      runtime: "ambient-workflows",
      toolName: "ambient_workflows_unarchive",
      workflowId: "workflow-1",
      title: "Summarize pull requests",
      version: 2,
      baseVersion: 2,
      archived: false,
    });
  });

  it("uses local playbook services when feature hooks are absent", async () => {
    const registeredTools: RegisteredTool[] = [];
    const store = { marker: "store" } as any;
    const archiveAmbientWorkflowPlaybook = vi.fn(() => workflowDescriptionFixture({ archivedAt: "2026-06-10T00:00:00.000Z" }));
    const unarchiveAmbientWorkflowPlaybook = vi.fn(() => workflowDescriptionFixture());

    registerAmbientWorkflowArchiveTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      store,
      archiveAmbientWorkflowPlaybook,
      unarchiveAmbientWorkflowPlaybook,
    }));

    await registeredTools[0]!.execute("archive", { id: "workflow-1", baseVersion: 2 });
    await registeredTools[1]!.execute("unarchive", { id: "workflow-1", baseVersion: 2 });

    expect(archiveAmbientWorkflowPlaybook).toHaveBeenCalledWith(store, {
      id: "workflow-1",
      baseVersion: 2,
    });
    expect(unarchiveAmbientWorkflowPlaybook).toHaveBeenCalledWith(store, {
      id: "workflow-1",
      baseVersion: 2,
    });
  });

  it("preserves archive and unarchive input validation", async () => {
    const registeredTools: RegisteredTool[] = [];
    const archive = vi.fn(async () => workflowDescriptionFixture());
    const unarchive = vi.fn(async () => workflowDescriptionFixture());

    registerAmbientWorkflowArchiveTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { archive, unarchive },
    }));

    await registeredTools[0]!.execute("archive", {
      id: "workflow-1",
      baseVersion: 2,
      reason: " ",
    });
    expect(archive).toHaveBeenCalledWith({
      id: "workflow-1",
      baseVersion: 2,
    });

    await expect(registeredTools[0]!.execute("archive", {
      id: "workflow-1",
      baseVersion: 0,
    })).rejects.toThrow("Missing required positive integer: baseVersion");
    await expect(registeredTools[1]!.execute("unarchive", {
      baseVersion: 1,
    })).rejects.toThrow("id is required.");
    expect(unarchive).not.toHaveBeenCalled();
  });
});

function options(
  overrides: Partial<AmbientWorkflowArchiveToolRegistrationOptions> = {},
): AmbientWorkflowArchiveToolRegistrationOptions {
  return {
    store: {} as any,
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
