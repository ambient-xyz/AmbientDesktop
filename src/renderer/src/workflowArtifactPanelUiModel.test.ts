import { describe, expect, it } from "vitest";
import type { WorkflowArtifactSummary, WorkflowRunDetail, WorkflowRunSummary } from "../../shared/types";
import {
  normalizeWorkflowArtifactPanelId,
  normalizeWorkflowBuildPanelId,
  workflowArtifactPanelIdForBuildPanel,
  workflowArtifactPanelTabs,
  workflowBuildPanelIdForArtifactPanel,
  workflowBuildPanelTabs,
} from "./workflowArtifactPanelUiModel";

const artifact: Pick<WorkflowArtifactSummary, "manifest" | "sourcePath"> = {
  sourcePath: "/tmp/workflow/main.ts",
  manifest: {
    tools: ["ambient.responses", "browser_search"],
    pluginCapabilities: [],
    ambientCliCapabilities: [],
    mutationPolicy: "read_only",
    maxToolCalls: 4,
    maxModelCalls: 1,
    maxConnectorCalls: 0,
    connectors: [],
  },
};

const latestRun: Pick<WorkflowRunSummary, "status" | "updatedAt"> = {
  status: "paused",
  updatedAt: "2026-05-10T00:00:10.000Z",
};

const detail: Pick<WorkflowRunDetail, "run" | "events" | "modelCalls" | "sourceContent" | "sourceReadError"> = {
  run: {
    id: "run-1",
    artifactId: "artifact-1",
    status: "paused",
    startedAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:10.000Z",
  },
  events: [
    {
      id: "event-1",
      runId: "run-1",
      artifactId: "artifact-1",
      seq: 1,
      type: "workflow.start",
      createdAt: "2026-05-10T00:00:00.000Z",
    },
    {
      id: "event-2",
      runId: "run-1",
      artifactId: "artifact-1",
      seq: 2,
      type: "ambient.call.progress",
      createdAt: "2026-05-10T00:00:10.000Z",
    },
  ],
  modelCalls: [],
  sourceContent: "export default async function run() {}",
};

describe("workflowArtifactPanelUiModel", () => {
  it("keeps Diagram available before an artifact is loaded", () => {
    const tabs = workflowArtifactPanelTabs({});

    expect(tabs.map((tab) => [tab.id, tab.disabled])).toEqual([
      ["diagram", undefined],
      ["run_console", true],
      ["runtime_input", true],
      ["source", true],
      ["manifest", true],
      ["permissions", true],
      ["discovery", undefined],
      ["exploration", undefined],
      ["outputs", true],
      ["versions", true],
    ]);
  });

  it("summarizes loaded artifact inspectors", () => {
    const tabs = workflowArtifactPanelTabs({
      artifact,
      latestRun,
      detail,
      selectedNodeId: "summarize",
      questionCount: 3,
      answeredQuestionCount: 2,
      explorationTraceCount: 1,
      versionCount: 4,
      outputCount: 2,
    });

    expect(tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "run_console", badge: "2 events", disabled: false }),
        expect.objectContaining({ id: "runtime_input", disabled: false }),
        expect.objectContaining({ id: "source", label: "Program", badge: "mapped node", disabled: false }),
        expect.objectContaining({ id: "manifest", badge: "2 tools", disabled: false }),
        expect.objectContaining({ id: "permissions", badge: "none", disabled: false }),
        expect.objectContaining({ id: "discovery", badge: "2/3" }),
        expect.objectContaining({ id: "exploration", badge: "1 traces" }),
        expect.objectContaining({ id: "outputs", badge: "2 items", disabled: false }),
        expect.objectContaining({ id: "versions", badge: "4 versions", disabled: false }),
      ]),
    );
  });

  it("badges the runtime input evidence panel when the latest run needs input", () => {
    const tabs = workflowArtifactPanelTabs({ artifact, latestRun: { status: "needs_input", updatedAt: "2026-05-10T00:00:10.000Z" } });

    expect(tabs.find((tab) => tab.id === "runtime_input")).toEqual(expect.objectContaining({ badge: "Needs Input", disabled: false }));
  });

  it("surfaces stale running liveness in artifact tabs and the Build rail", () => {
    const staleRun: Pick<WorkflowRunSummary, "status" | "updatedAt"> = {
      status: "running",
      updatedAt: "2026-05-10T00:00:00.000Z",
    };

    expect(workflowArtifactPanelTabs({ artifact, latestRun: staleRun }).find((tab) => tab.id === "run_console")).toMatchObject({
      badge: "Stale",
    });
    expect(workflowBuildPanelTabs({ artifact, latestRun: staleRun }).find((tab) => tab.id === "build-overview")).toMatchObject({
      badge: "Stale",
    });
  });

  it("normalizes disabled or missing panel ids back to Diagram", () => {
    const unloadedTabs = workflowArtifactPanelTabs({});
    const loadedTabs = workflowArtifactPanelTabs({ artifact, latestRun });

    expect(normalizeWorkflowArtifactPanelId("source", unloadedTabs)).toBe("diagram");
    expect(normalizeWorkflowArtifactPanelId("manifest", loadedTabs)).toBe("manifest");
    expect(normalizeWorkflowArtifactPanelId(undefined, loadedTabs)).toBe("diagram");
  });

  it("builds the mock-aligned Workflow Agent Build rail order", () => {
    const tabs = workflowBuildPanelTabs({
      artifact,
      latestRun,
      detail,
      selectedNodeId: "summarize",
      questionCount: 5,
      answeredQuestionCount: 4,
      explorationTraceCount: 2,
      versionCount: 1,
    });

    expect(tabs.map((tab) => [tab.id, tab.label, tab.artifactPanelId])).toEqual([
      ["build-overview", "Workflow Chat", undefined],
      ["build-discovery", "Discovery", "discovery"],
      ["build-exploration", "Exploration", "exploration"],
      ["build-source", "Program", "source"],
      ["build-manifest", "Manifest + Limits", "manifest"],
      ["build-permissions", "Permissions", "permissions"],
      ["build-versions", "Versions", "versions"],
    ]);
    expect(tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "build-discovery", badge: "4/5" }),
        expect.objectContaining({ id: "build-exploration", badge: "2 traces" }),
        expect.objectContaining({ id: "build-source", badge: "mapped node", disabled: false }),
        expect.objectContaining({ id: "build-versions", badge: "1 versions", disabled: false }),
      ]),
    );
  });

  it("maps artifact panels into the Build rail and falls back to Workflow Chat for disabled panels", () => {
    const unloadedBuildTabs = workflowBuildPanelTabs({});
    const loadedBuildTabs = workflowBuildPanelTabs({ artifact, latestRun });

    expect(workflowBuildPanelIdForArtifactPanel("source")).toBe("build-source");
    expect(workflowBuildPanelIdForArtifactPanel("diagram")).toBe("build-overview");
    expect(workflowBuildPanelIdForArtifactPanel("run_console")).toBe("build-overview");
    expect(workflowBuildPanelIdForArtifactPanel("runtime_input")).toBe("build-overview");
    expect(workflowArtifactPanelIdForBuildPanel("build-permissions")).toBe("permissions");
    expect(workflowArtifactPanelIdForBuildPanel("build-overview")).toBeUndefined();
    expect(normalizeWorkflowBuildPanelId("build-source", unloadedBuildTabs)).toBe("build-overview");
    expect(normalizeWorkflowBuildPanelId("build-source", loadedBuildTabs)).toBe("build-source");
  });

  it("lets the Build rail show exploration state instead of only trace count", () => {
    const tabs = workflowBuildPanelTabs({ artifact, explorationTraceCount: 2, explorationStateLabel: "Skipped" });

    expect(tabs.find((tab) => tab.id === "build-exploration")).toEqual(expect.objectContaining({ badge: "Skipped" }));
  });
});
