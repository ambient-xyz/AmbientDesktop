import { describe, expect, it, vi } from "vitest";

import type {
  AmbientWorkflowPlaybookDescription,
  AmbientWorkflowPlaybookInjection,
} from "../agentRuntimeAmbientFacade";
import {
  registerAmbientWorkflowInjectTool,
  type AmbientWorkflowInjectToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowInjectTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeAmbientWorkflowInjectTools", () => {
  it("returns a preflight description when the workflow has not been described in the thread", async () => {
    const registeredTools: RegisteredTool[] = [];
    const describeWorkflow = vi.fn(async () => workflowDescriptionFixture({ markdownIncluded: false }));
    const inject = vi.fn(async () => workflowInjectionFixture());
    const isAmbientWorkflowPlaybookDescribed = vi.fn(() => false);
    const markAmbientWorkflowPlaybookDescribed = vi.fn();

    registerAmbientWorkflowInjectTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { describe: describeWorkflow, inject },
      isAmbientWorkflowPlaybookDescribed,
      markAmbientWorkflowPlaybookDescribed,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_workflows_inject"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("inject", {
      id: "workflow-1",
      version: 2,
      maxMarkdownChars: 512,
    });

    expect(describeWorkflow).toHaveBeenCalledWith({
      id: "workflow-1",
      version: 2,
      includeMarkdown: false,
    });
    expect(isAmbientWorkflowPlaybookDescribed).toHaveBeenCalledWith("workflow-1", 2);
    expect(markAmbientWorkflowPlaybookDescribed).toHaveBeenCalledWith("workflow-1", 2);
    expect(inject).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Ambient Workflows preflight description");
    expect(result.details).toEqual({
      runtime: "ambient-workflows",
      toolName: "ambient_workflows_inject",
      workflowId: "workflow-1",
      title: "Summarize pull requests",
      version: 2,
      status: "preflight-description",
      injected: false,
      toolNames: ["file_read", "shell_exec"],
      outputShape: ["summary"],
      markdownTruncated: false,
    });
  });

  it("injects workflow guidance after the workflow has been described", async () => {
    const registeredTools: RegisteredTool[] = [];
    const describeWorkflow = vi.fn(async () => workflowDescriptionFixture({ markdownIncluded: false }));
    const inject = vi.fn(async () => workflowInjectionFixture());
    const markAmbientWorkflowPlaybookDescribed = vi.fn();

    registerAmbientWorkflowInjectTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { describe: describeWorkflow, inject },
      isAmbientWorkflowPlaybookDescribed: () => true,
      markAmbientWorkflowPlaybookDescribed,
    }));

    const result = await registeredTools[0]!.execute("inject", {
      id: "workflow-1",
      version: 2,
      maxMarkdownChars: 512,
    });

    expect(inject).toHaveBeenCalledWith({
      id: "workflow-1",
      version: 2,
      maxMarkdownChars: 512,
    });
    expect(markAmbientWorkflowPlaybookDescribed).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Ambient Workflows playbook injected");
    expect(result.details).toEqual({
      runtime: "ambient-workflows",
      toolName: "ambient_workflows_inject",
      workflowId: "workflow-1",
      title: "Summarize pull requests",
      version: 2,
      status: "injected",
      injected: true,
      toolNames: ["file_read", "shell_exec"],
      outputShape: ["summary"],
      markdownTruncated: false,
    });
  });

  it("uses local playbook services when feature hooks are absent", async () => {
    const registeredTools: RegisteredTool[] = [];
    const store = { marker: "store" } as any;
    const describeAmbientWorkflowPlaybook = vi.fn(() => workflowDescriptionFixture({ version: 3 }));
    const injectAmbientWorkflowPlaybook = vi.fn(() => workflowInjectionFixture({ playbook: workflowDescriptionFixture({ version: 3 }) }));

    registerAmbientWorkflowInjectTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      store,
      describeAmbientWorkflowPlaybook,
      injectAmbientWorkflowPlaybook,
      isAmbientWorkflowPlaybookDescribed: () => true,
    }));

    await registeredTools[0]!.execute("inject", { id: "workflow-1" });

    expect(describeAmbientWorkflowPlaybook).toHaveBeenCalledWith(store, {
      id: "workflow-1",
      includeMarkdown: false,
    });
    expect(injectAmbientWorkflowPlaybook).toHaveBeenCalledWith(store, { id: "workflow-1" });
  });

  it("preserves workflow inject input validation", async () => {
    const registeredTools: RegisteredTool[] = [];
    const describeWorkflow = vi.fn(async () => workflowDescriptionFixture());

    registerAmbientWorkflowInjectTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { describe: describeWorkflow },
    }));

    await expect(registeredTools[0]!.execute("inject", {
      version: 2,
    })).rejects.toThrow("id is required.");
    expect(describeWorkflow).not.toHaveBeenCalled();
  });
});

function options(
  overrides: Partial<AmbientWorkflowInjectToolRegistrationOptions> = {},
): AmbientWorkflowInjectToolRegistrationOptions {
  return {
    store: {} as any,
    isAmbientWorkflowPlaybookDescribed: () => false,
    markAmbientWorkflowPlaybookDescribed: () => undefined,
    ...overrides,
  };
}

function workflowInjectionFixture(
  overrides: Partial<AmbientWorkflowPlaybookInjection> = {},
): AmbientWorkflowPlaybookInjection {
  return {
    playbook: workflowDescriptionFixture(),
    guidanceMarkdown: "# Injected Workflow Playbook\n\nUse this guidance.",
    injectedAt: "2026-06-10T00:00:00.000Z",
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
    markdownPreview: "Workflow markdown.",
    markdownIncluded: true,
    markdownTruncated: false,
    guidance: ["Treat this as recorded guidance."],
    ...overrides,
  };
}
