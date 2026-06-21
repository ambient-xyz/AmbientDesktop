import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { AgentRuntime } from "../agentRuntime";
import { ProjectStore } from "../agentRuntimeProjectStoreFacade";
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

describe("AgentRuntime Ambient workflow playbook tools", () => {
  it("registers workflow management tools through workflowRecording feature hooks", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-management-tools-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("workflow management tools");
      const playbook = {
        id: "date-night",
        title: "Date night theatre finder",
        version: 2,
        enabled: true,
        savedAt: "2026-05-28T01:00:00.000Z",
        manifestPath: join(workspacePath, ".ambient/workflows/date-night/ambient-workflow.json"),
        markdownPath: join(workspacePath, ".ambient/workflows/date-night/workflow.md"),
        sidecarPath: join(workspacePath, ".ambient/workflows/date-night/workflow.json"),
        transcriptPath: join(workspacePath, ".ambient/workflows/date-night/transcript.jsonl"),
        summary: "Find date night theatre.",
        toolNames: ["browser_search"],
        outputShape: ["Shortlist"],
        versions: [],
        markdownPreview: "",
        markdownIncluded: false,
        markdownTruncated: false,
        guidance: [],
      };
      const update = vi.fn(async () => playbook);
      const archive = vi.fn(async () => ({
        ...playbook,
        archivedAt: "2026-05-28T02:00:00.000Z",
        archivedReason: "Superseded.",
      }));
      const unarchive = vi.fn(async () => playbook);
      const restoreVersion = vi.fn(async () => ({ ...playbook, version: 3 }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        workflowRecordings: {
          update,
          archive,
          unarchive,
          restoreVersion,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createPluginInstallToolExtension(thread.id, workspace, {} as any, undefined)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "ambient_workflows_update",
        "ambient_workflows_archive",
        "ambient_workflows_unarchive",
        "ambient_workflows_restore_version",
      ]));

      const updateTool = registeredTools.find((tool) => tool.name === "ambient_workflows_update");
      const archiveTool = registeredTools.find((tool) => tool.name === "ambient_workflows_archive");
      const unarchiveTool = registeredTools.find((tool) => tool.name === "ambient_workflows_unarchive");
      const restoreTool = registeredTools.find((tool) => tool.name === "ambient_workflows_restore_version");
      if (!updateTool || !archiveTool || !unarchiveTool || !restoreTool) throw new Error("Missing workflow management tools.");

      await updateTool.execute("workflow-update", {
        id: "date-night",
        baseVersion: 2,
        draft: {
          intent: "Find date night theatre.",
          inputs: ["Location"],
          successfulExamples: [{ toolName: "browser_search" }],
          doNot: [],
          validation: ["Check current venue pages."],
          outputShape: ["Shortlist"],
        },
      });
      await archiveTool.execute("workflow-archive", { id: "date-night", baseVersion: 2, reason: "Superseded." });
      await unarchiveTool.execute("workflow-unarchive", { id: "date-night", baseVersion: 2 });
      await restoreTool.execute("workflow-restore", { id: "date-night", version: 1 });

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: "date-night", baseVersion: 2 }));
      expect(archive).toHaveBeenCalledWith({ id: "date-night", baseVersion: 2, reason: "Superseded." });
      expect(unarchive).toHaveBeenCalledWith({ id: "date-night", baseVersion: 2 });
      expect(restoreVersion).toHaveBeenCalledWith({ id: "date-night", version: 1 });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
