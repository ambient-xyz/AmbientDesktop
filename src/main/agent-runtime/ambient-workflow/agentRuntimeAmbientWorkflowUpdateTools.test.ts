import { describe, expect, it, vi } from "vitest";

import type { AmbientWorkflowPlaybookDescription } from "../agentRuntimeAmbientFacade";
import {
  registerAmbientWorkflowUpdateTool,
  type AmbientWorkflowUpdateToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowUpdateTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeAmbientWorkflowUpdateTools", () => {
  it("registers workflow update with injected workflow recording services", async () => {
    const registeredTools: RegisteredTool[] = [];
    const update = vi.fn(async () => workflowDescriptionFixture({ version: 3 }));
    const markAmbientWorkflowPlaybookDescribed = vi.fn();

    registerAmbientWorkflowUpdateTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { update },
      markAmbientWorkflowPlaybookDescribed,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_workflows_update"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("update", {
      id: "workflow-1",
      baseVersion: 2,
      title: "Summarize PRs",
      draft: draftInput(),
    });

    expect(update).toHaveBeenCalledWith({
      id: "workflow-1",
      baseVersion: 2,
      title: "Summarize PRs",
      draft: {
        intent: "Summarize pull requests.",
        inputs: ["Repository"],
        successfulExamples: [{ toolName: "file_read", inputPreview: "README.md" }],
        doNot: [{ toolName: "shell_exec", status: "permission_blocked", reason: "Needs approval." }],
        validation: ["Check final summary."],
        outputShape: ["summary"],
      },
    });
    expect(markAmbientWorkflowPlaybookDescribed).toHaveBeenCalledWith("workflow-1", 3);
    expect(result.content[0].text).toContain("Ambient Workflows playbook updated");
    expect(result.details).toEqual({
      runtime: "ambient-workflows",
      toolName: "ambient_workflows_update",
      workflowId: "workflow-1",
      title: "Summarize pull requests",
      version: 3,
      baseVersion: 2,
      archived: false,
      enabled: true,
    });
  });

  it("uses local playbook service when feature hook is absent", async () => {
    const registeredTools: RegisteredTool[] = [];
    const store = { marker: "store" } as any;
    const updateAmbientWorkflowPlaybook = vi.fn(() => workflowDescriptionFixture({ version: 4 }));
    const markAmbientWorkflowPlaybookDescribed = vi.fn();

    registerAmbientWorkflowUpdateTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      store,
      updateAmbientWorkflowPlaybook,
      markAmbientWorkflowPlaybookDescribed,
    }));

    await registeredTools[0]!.execute("update", {
      id: "workflow-1",
      baseVersion: 2,
      draft: draftInput(),
    });

    expect(updateAmbientWorkflowPlaybook).toHaveBeenCalledWith(store, expect.objectContaining({
      id: "workflow-1",
      baseVersion: 2,
    }));
    expect(markAmbientWorkflowPlaybookDescribed).toHaveBeenCalledWith("workflow-1", 4);
  });

  it("preserves update input validation and draft parsing behavior", async () => {
    const registeredTools: RegisteredTool[] = [];
    const update = vi.fn(async () => workflowDescriptionFixture());

    registerAmbientWorkflowUpdateTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { update },
    }));

    await registeredTools[0]!.execute("update", {
      id: "workflow-1",
      baseVersion: 2,
      title: " ",
      draft: {
        intent: 123,
        inputs: ["Repository", 42],
        successfulExamples: [{ toolName: "file_read" }, { inputPreview: "missing tool" }],
        doNot: [{ status: "unknown", reason: "Bad approach." }, { status: "skipped", reason: "" }],
        validation: ["Check output.", null],
        outputShape: ["summary", false],
      },
    });

    expect(update).toHaveBeenCalledWith({
      id: "workflow-1",
      baseVersion: 2,
      draft: {
        intent: "",
        inputs: ["Repository"],
        successfulExamples: [{ toolName: "file_read" }],
        doNot: [{ status: "failed", reason: "Bad approach." }],
        validation: ["Check output."],
        outputShape: ["summary"],
      },
    });

    await expect(registeredTools[0]!.execute("update", {
      id: "workflow-1",
      baseVersion: 0,
      draft: draftInput(),
    })).rejects.toThrow("Missing required positive integer: baseVersion");
  });
});

function options(
  overrides: Partial<AmbientWorkflowUpdateToolRegistrationOptions> = {},
): AmbientWorkflowUpdateToolRegistrationOptions {
  return {
    store: {} as any,
    markAmbientWorkflowPlaybookDescribed: () => undefined,
    ...overrides,
  };
}

function draftInput(): Record<string, unknown> {
  return {
    intent: "Summarize pull requests.",
    inputs: ["Repository"],
    successfulExamples: [{ toolName: "file_read", inputPreview: "README.md" }],
    doNot: [{ toolName: "shell_exec", status: "permission_blocked", reason: "Needs approval." }],
    validation: ["Check final summary."],
    outputShape: ["summary"],
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
