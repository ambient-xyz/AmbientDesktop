import { describe, expect, it, vi } from "vitest";

import type {
  AmbientWorkflowPlaybookDescription,
  AmbientWorkflowsSearchResponse,
} from "../../ambient/ambientWorkflows";
import {
  registerAmbientWorkflowReadOnlyTools,
  type AmbientWorkflowReadOnlyToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowReadOnlyTools";
import { resolveAmbientFeatureFlags } from "../../../shared/featureFlags";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeAmbientWorkflowReadOnlyTools", () => {
  it("registers workflow search and describe with injected workflow recording services", async () => {
    const registeredTools: RegisteredTool[] = [];
    const markAmbientWorkflowPlaybookDescribed = vi.fn();
    const search = vi.fn(async () => workflowSearchResponseFixture());
    const describeWorkflow = vi.fn(async () => workflowDescriptionFixture());

    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { search, describe: describeWorkflow },
      markAmbientWorkflowPlaybookDescribed,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_workflows_search",
      "ambient_workflows_describe",
      "ambient_workflows_callable_catalog",
      "ambient_workflows_callable_describe",
    ]);
    expect(registeredTools.map((tool) => tool.executionMode)).toEqual(["sequential", "sequential", "sequential", "sequential"]);

    const searchResult = await registeredTools[0]!.execute("search", {
      query: "summarize pull requests",
      limit: 3,
      includeDisabled: true,
      includeArchived: false,
    });

    expect(search).toHaveBeenCalledWith({
      query: "summarize pull requests",
      limit: 3,
      includeDisabled: true,
      includeArchived: false,
    });
    expect(searchResult.content[0].text).toContain("Ambient Workflows playbook search");
    expect(searchResult.details).toEqual({
      runtime: "ambient-workflows",
      toolName: "ambient_workflows_search",
      query: "summarize pull requests",
      resultCount: 1,
      truncated: true,
      workflowIds: ["workflow-1"],
      versions: [2],
      catalogVersion: "catalog-1",
    });

    const describeResult = await registeredTools[1]!.execute("describe", {
      id: "workflow-1",
      version: 2,
      includeMarkdown: true,
      includeArchived: true,
      maxMarkdownChars: 512,
    });

    expect(describeWorkflow).toHaveBeenCalledWith({
      id: "workflow-1",
      version: 2,
      includeMarkdown: true,
      includeArchived: true,
      maxMarkdownChars: 512,
    });
    expect(markAmbientWorkflowPlaybookDescribed).toHaveBeenCalledWith("workflow-1", 2);
    expect(describeResult.content[0].text).toContain("Ambient Workflows playbook description");
    expect(describeResult.details).toEqual({
      runtime: "ambient-workflows",
      toolName: "ambient_workflows_describe",
      workflowId: "workflow-1",
      version: 2,
      enabled: true,
      toolNames: ["file_read", "shell_exec"],
      outputShape: ["summary"],
      markdownIncluded: true,
      markdownTruncated: false,
    });
  });

  it("uses local playbook services when feature hooks are absent", async () => {
    const registeredTools: RegisteredTool[] = [];
    const store = { marker: "store" } as any;
    const searchAmbientWorkflowPlaybooks = vi.fn(() => workflowSearchResponseFixture({ catalogVersion: "catalog-local" }));
    const describeAmbientWorkflowPlaybook = vi.fn(() => workflowDescriptionFixture({ version: 3 }));
    const markAmbientWorkflowPlaybookDescribed = vi.fn();

    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      store,
      searchAmbientWorkflowPlaybooks,
      describeAmbientWorkflowPlaybook,
      markAmbientWorkflowPlaybookDescribed,
    }));

    await registeredTools[0]!.execute("search", { query: "local" });
    await registeredTools[1]!.execute("describe", { id: "workflow-1" });

    expect(searchAmbientWorkflowPlaybooks).toHaveBeenCalledWith(store, { query: "local" });
    expect(describeAmbientWorkflowPlaybook).toHaveBeenCalledWith(store, { id: "workflow-1" });
    expect(markAmbientWorkflowPlaybookDescribed).toHaveBeenCalledWith("workflow-1", 3);
  });

  it("reports callable catalog status without hidden launch tool names while subagents are disabled", async () => {
    const registeredTools: RegisteredTool[] = [];
    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: false } }),
      getCallableWorkflowRecordedPlaybooks: () => [
        workflowDescriptionFixture({
          id: "enabled-workflow",
          title: "Enabled workflow",
          version: 2,
          playbook: confirmedPlaybookFixture(),
        }),
      ],
    }));

    const catalogTool = registeredTools.find((tool) => tool.name === "ambient_workflows_callable_catalog");
    if (!catalogTool) throw new Error("Missing callable catalog tool.");
    const result = await catalogTool.execute("callable-catalog", { limit: 3 });

    expect(result.content[0].text).toContain("Feature flag ambient.subagents: disabled");
    expect(result.content[0].text).toContain("Callable workflow launch tools are not Pi-visible while ambient.subagents is disabled.");
    expect(result.content[0].text).toContain("complete the task through the normal chat/tool loop as a manual playbook-guided run");
    expect(result.content[0].text).not.toContain("ambient_workflow_symphony_map_reduce");
    expect(result.content[0].text).not.toContain("ambient_workflow_recorded_enabled_workflow_v2");
    expect(result.details).toMatchObject({
      runtime: "ambient-workflows",
      toolName: "ambient_workflows_callable_catalog",
      featureFlagEnabled: false,
      visibleParentToolCount: 0,
      hiddenFeatureDisabledCount: 7,
      visibleToolNames: [],
      returnedEntryCount: 3,
      truncated: true,
    });

    const recordedResult = await catalogTool.execute("callable-catalog", {
      sourceKind: "recorded_workflow",
      limit: 3,
    });
    expect(recordedResult.content[0].text).toContain(
      "Manual playbook fallback: call ambient_workflows_describe id=\"enabled-workflow\" version=2",
    );
    expect(recordedResult.content[0].text).toContain("then ambient_workflows_inject for that id/version");
    expect(recordedResult.content[0].text).not.toContain("ambient_workflow_recorded_enabled_workflow_v2");
  });

  it("reports enabled callable catalog tool names, child policy gates, and excluded recorded workflow reasons", async () => {
    const registeredTools: RegisteredTool[] = [];
    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      getCallableWorkflowRecordedPlaybooks: () => [
        workflowDescriptionFixture({
          id: "enabled-workflow",
          title: "Enabled workflow",
          version: 2,
          playbook: confirmedPlaybookFixture(),
        }),
        workflowDescriptionFixture({
          id: "draft-workflow",
          title: "Draft workflow",
          version: 4,
          playbook: confirmedPlaybookFixture({ status: "draft" }),
        }),
      ],
    }));

    const catalogTool = registeredTools.find((tool) => tool.name === "ambient_workflows_callable_catalog");
    if (!catalogTool) throw new Error("Missing callable catalog tool.");
    const result = await catalogTool.execute("callable-catalog", {
      sourceKind: "recorded_workflow",
      includeExcluded: true,
      limit: 5,
    });

    expect(result.content[0].text).toContain("Feature flag ambient.subagents: enabled");
    expect(result.content[0].text).toContain("Tool name: ambient_workflow_recorded_enabled_workflow_v2");
    expect(result.content[0].text).toContain("Child access: role_policy_required with nested fanout policy");
    expect(result.content[0].text).toContain("Source preview: Readable source preview for workflow Enabled workflow");
    expect(result.content[0].text).toContain("recorded_workflow enabled-workflow");
    expect(result.content[0].text).toContain("Reasons: recorded_playbook_draft_not_confirmed");
    expect(result.details).toMatchObject({
      featureFlagEnabled: true,
      visibleToolNames: ["ambient_workflow_recorded_enabled_workflow_v2"],
      excludedEntryIds: ["recorded:draft-workflow:v4"],
      returnedEntryCount: 2,
      truncated: false,
    });
  });

  it("searches callable catalog entries by query while preserving feature-gated tool visibility", async () => {
    const registeredTools: RegisteredTool[] = [];
    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      getCallableWorkflowRecordedPlaybooks: () => [
        workflowDescriptionFixture({
          id: "enabled-workflow",
          title: "Enabled workflow",
          version: 2,
          playbook: confirmedPlaybookFixture(),
        }),
        workflowDescriptionFixture({
          id: "draft-workflow",
          title: "Draft workflow",
          version: 4,
          playbook: confirmedPlaybookFixture({ status: "draft" }),
        }),
      ],
    }));

    const catalogTool = registeredTools.find((tool) => tool.name === "ambient_workflows_callable_catalog");
    if (!catalogTool) throw new Error("Missing callable catalog tool.");
    const result = await catalogTool.execute("callable-catalog", {
      sourceKind: "recorded_workflow",
      query: "draft not confirmed",
      includeExcluded: true,
      limit: 10,
    });

    expect(result.content[0].text).toContain("Query: draft not confirmed");
    expect(result.content[0].text).toContain("Catalog entry: Workflow Draft workflow");
    expect(result.content[0].text).toContain("Reasons: recorded_playbook_draft_not_confirmed");
    expect(result.content[0].text).not.toContain("Catalog entry: Enabled workflow");
    expect(result.details).toMatchObject({
      query: "draft not confirmed",
      matchedEntryCount: 1,
      returnedEntryCount: 1,
      excludedEntryIds: ["recorded:draft-workflow:v4"],
      visibleToolNames: [],
      truncated: false,
    });
  });

  it("searches callable Symphony catalog entries through readable source previews", async () => {
    const registeredTools: RegisteredTool[] = [];
    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      getCallableWorkflowRecordedPlaybooks: () => [],
    }));

    const catalogTool = registeredTools.find((tool) => tool.name === "ambient_workflows_callable_catalog");
    if (!catalogTool) throw new Error("Missing callable catalog tool.");
    const result = await catalogTool.execute("callable-catalog", {
      sourceKind: "symphony_recipe",
      query: "readable dsl reducer",
      includeExcluded: false,
      limit: 10,
    });

    expect(result.content[0].text).toContain("Query: readable dsl reducer");
    expect(result.content[0].text).toContain("Catalog entry: Symphony Map-Reduce");
    expect(result.content[0].text).toContain("Source preview: Readable source preview for Symphony Map-Reduce");
    expect(result.content[0].text).toContain("symphony_recipe map_reduce");
    expect(result.content[0].text).not.toContain("Catalog entry: Symphony Pipeline");
    expect(result.details).toMatchObject({
      query: "readable dsl reducer",
      matchedEntryCount: 1,
      returnedEntryCount: 1,
      visibleToolNames: ["ambient_workflow_symphony_map_reduce"],
      truncated: false,
    });
  });

  it("describes one callable workflow catalog entry with bounded source preview and visible launch name", async () => {
    const registeredTools: RegisteredTool[] = [];
    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      getCallableWorkflowRecordedPlaybooks: () => [],
    }));

    const describeTool = registeredTools.find((tool) => tool.name === "ambient_workflows_callable_describe");
    if (!describeTool) throw new Error("Missing callable describe tool.");
    const result = await describeTool.execute("callable-describe", {
      id: "symphony:map_reduce",
      includeExcluded: false,
      maxSourcePreviewLines: 5,
    });

    expect(result.content[0].text).toContain("Ambient callable workflow catalog entry");
    expect(result.content[0].text).toContain("Selector: id=symphony:map_reduce");
    expect(result.content[0].text).toContain("Catalog entry: Symphony Map-Reduce");
    expect(result.content[0].text).toContain("Tool name: ambient_workflow_symphony_map_reduce");
    expect(result.content[0].text).toContain("Source preview: Readable source preview for Symphony Map-Reduce");
    expect(result.content[0].text).toContain("symphony_recipe map_reduce");
    expect(result.content[0].text).toContain("more source preview lines available");
    expect(result.details).toMatchObject({
      toolName: "ambient_workflows_callable_describe",
      featureFlagEnabled: true,
      found: true,
      entryId: "symphony:map_reduce",
      status: "parent_pi_visible",
      sourceKind: "symphony_recipe",
      sourceId: "map_reduce",
      parentPiVisible: true,
      childAccessStatus: "role_policy_required",
      visibleToolName: "ambient_workflow_symphony_map_reduce",
      sourcePreviewIncluded: true,
      sourcePreviewLineCount: 5,
      sourcePreviewTruncated: true,
    });
  });

  it("describes disabled callable catalog metadata without revealing hidden launch tool names", async () => {
    const registeredTools: RegisteredTool[] = [];
    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: false } }),
      getCallableWorkflowRecordedPlaybooks: () => [],
    }));

    const describeTool = registeredTools.find((tool) => tool.name === "ambient_workflows_callable_describe");
    if (!describeTool) throw new Error("Missing callable describe tool.");
    const result = await describeTool.execute("callable-describe", {
      id: "symphony:map_reduce",
      maxSourcePreviewLines: 3,
    });

    expect(result.content[0].text).toContain("Feature flag ambient.subagents: disabled");
    expect(result.content[0].text).toContain("Hidden launch tool names remain withheld");
    expect(result.content[0].text).toContain("Catalog entry: Symphony Map-Reduce");
    expect(result.content[0].text).not.toContain("Tool name: ambient_workflow_symphony_map_reduce");
    expect(result.details).toMatchObject({
      toolName: "ambient_workflows_callable_describe",
      featureFlagEnabled: false,
      found: true,
      entryId: "symphony:map_reduce",
      parentPiVisible: false,
      sourcePreviewIncluded: true,
      sourcePreviewLineCount: 3,
      sourcePreviewTruncated: true,
    });
    expect(result.details.visibleToolName).toBeUndefined();
  });

  it("validates callable describe selectors and reports exact misses without launching", async () => {
    const registeredTools: RegisteredTool[] = [];
    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      getCallableWorkflowRecordedPlaybooks: () => [],
    }));

    const describeTool = registeredTools.find((tool) => tool.name === "ambient_workflows_callable_describe");
    if (!describeTool) throw new Error("Missing callable describe tool.");

    await expect(describeTool.execute("callable-describe", {})).rejects.toThrow("Provide id, toolName, or sourceId");

    const miss = await describeTool.execute("callable-describe", {
      sourceKind: "recorded_workflow",
      sourceId: "missing-workflow",
      includeExcluded: false,
    });

    expect(miss.content[0].text).toContain("No callable workflow catalog entry matched the exact selector.");
    expect(miss.details).toMatchObject({
      found: false,
      selector: {
        sourceKind: "recorded_workflow",
        sourceId: "missing-workflow",
        includeExcluded: false,
      },
    });
  });

  it("preserves workflow read-only input parsing behavior", async () => {
    const registeredTools: RegisteredTool[] = [];
    const search = vi.fn(async () => workflowSearchResponseFixture());
    const describeWorkflow = vi.fn(async () => workflowDescriptionFixture());

    registerAmbientWorkflowReadOnlyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      workflowRecordings: { search, describe: describeWorkflow },
    }));

    await registeredTools[0]!.execute("search", {
      query: " ",
      limit: 0,
      includeDisabled: "true",
      includeArchived: true,
    });
    expect(search).toHaveBeenCalledWith({ includeArchived: true });

    await expect(registeredTools[1]!.execute("describe", {
      version: 2,
    })).rejects.toThrow("id is required.");
    expect(describeWorkflow).not.toHaveBeenCalled();

    await expect(registeredTools[3]!.execute("callable-describe", {
      sourceVersion: 3,
    })).rejects.toThrow("Provide id, toolName, or sourceId");
  });
});

function options(
  overrides: Partial<AmbientWorkflowReadOnlyToolRegistrationOptions> = {},
): AmbientWorkflowReadOnlyToolRegistrationOptions {
  return {
    store: {} as any,
    markAmbientWorkflowPlaybookDescribed: () => undefined,
    ...overrides,
  };
}

function workflowSearchResponseFixture(
  overrides: Partial<AmbientWorkflowsSearchResponse> = {},
): AmbientWorkflowsSearchResponse {
  return {
    results: [workflowDescriptionFixture()],
    truncated: true,
    catalogVersion: "catalog-1",
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

function confirmedPlaybookFixture(
  overrides: Partial<NonNullable<AmbientWorkflowPlaybookDescription["playbook"]>> = {},
): NonNullable<AmbientWorkflowPlaybookDescription["playbook"]> {
  return {
    status: "confirmed",
    source: "user_edit",
    generatedAt: "2026-06-10T00:00:00.000Z",
    confirmedAt: "2026-06-10T00:01:00.000Z",
    sourceCapturedAt: "2026-06-10T00:00:00.000Z",
    intent: "Run a saved workflow.",
    inputs: ["Workflow target."],
    successfulExamples: [],
    doNot: [],
    validation: ["Confirm output."],
    outputShape: ["summary"],
    evidenceSummary: {
      messageCount: 2,
      toolResultCount: 0,
      successfulToolResultCount: 0,
      failedToolResultCount: 0,
      skippedToolResultCount: 0,
      permissionBlockedToolResultCount: 0,
      redactionCount: 0,
    },
    ...overrides,
  };
}
