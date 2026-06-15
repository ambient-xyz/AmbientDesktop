import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { registerToolRunnerBashTool } from "./agentRuntimeToolRunnerBashTool";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<AgentToolResult<Record<string, unknown>>> };

describe("agentRuntimeToolRunnerBashTool", () => {
  it("registers bash as sequential and appends detected media artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-runner-bash-"));
    const registeredTools: RegisteredTool[] = [];
    const snapshots = ["before", "after"];
    const snapshotWorkspaceMediaFiles = vi.fn(() => snapshots.shift() ?? "extra");
    const newestChangedMediaArtifact = vi.fn(() => "generated.png");
    const appendMediaArtifactResultCalls: Array<{ result: unknown; artifactPath: string; workspacePath: string }> = [];
    const appendMediaArtifactResult = <T>(result: T, artifactPath: string, workspacePath: string): T => {
      appendMediaArtifactResultCalls.push({ result, artifactPath, workspacePath });
      const toolResult = result as AgentToolResult<Record<string, unknown>>;
      return {
        ...toolResult,
        details: { ...(toolResult.details ?? {}), artifactPath, renderedInline: true },
      } as T;
    };
    try {
      registerToolRunnerBashTool({ registerTool: (tool: any) => registeredTools.push(tool) }, {
        workspacePath: workspace,
        getPolicy: () => ({
          permissionMode: "full-access",
          workspacePath: workspace,
          subject: "pi-bash",
        }),
        snapshotWorkspaceMediaFiles,
        newestChangedMediaArtifact,
        appendMediaArtifactResult,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual(["bash"]);
      expect(registeredTools[0]!.executionMode).toBe("sequential");

      const result = await registeredTools[0]!.execute(
        "call-bash",
        { command: "printf hello" },
        new AbortController().signal,
        () => undefined,
      );

      expect(snapshotWorkspaceMediaFiles).toHaveBeenCalledTimes(2);
      expect(snapshotWorkspaceMediaFiles).toHaveBeenCalledWith(workspace);
      expect(newestChangedMediaArtifact).toHaveBeenCalledWith(workspace, "before", "after");
      expect(appendMediaArtifactResultCalls).toEqual([{
        result: expect.any(Object),
        artifactPath: "generated.png",
        workspacePath: workspace,
      }]);
      expect(result.details).toMatchObject({ artifactPath: "generated.png", renderedInline: true });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects bash reads of interrupted tool-call recovery artifacts without suggesting unavailable tools", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-runner-bash-recovery-"));
    const registeredTools: RegisteredTool[] = [];
    const snapshotWorkspaceMediaFiles = vi.fn(() => "snapshot");
    try {
      registerToolRunnerBashTool({ registerTool: (tool: any) => registeredTools.push(tool) }, {
        workspacePath: workspace,
        getPolicy: () => ({
          permissionMode: "full-access",
          workspacePath: workspace,
          subject: "pi-bash",
        }),
        snapshotWorkspaceMediaFiles,
        newestChangedMediaArtifact: vi.fn(() => undefined),
        appendMediaArtifactResult: <T>(result: T) => result,
      });

      const result = await registeredTools[0]!.execute(
        "call-bash",
        { command: "cat .ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt" },
        new AbortController().signal,
        () => undefined,
      );

      expect(snapshotWorkspaceMediaFiles).not.toHaveBeenCalled();
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("recovery continuation turn"),
      });
      expect(result.details).toMatchObject({
        status: "error",
        toolName: "bash",
        recoveryToolsAvailable: false,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("points bash recovery-artifact reads at exact recovery tools when active", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-runner-bash-recovery-active-"));
    const registeredTools: RegisteredTool[] = [];
    const snapshotWorkspaceMediaFiles = vi.fn(() => "snapshot");
    try {
      registerToolRunnerBashTool({ registerTool: (tool: any) => registeredTools.push(tool) }, {
        workspacePath: workspace,
        interruptedToolCallRecoveryToolsAvailable: () => true,
        getPolicy: () => ({
          permissionMode: "full-access",
          workspacePath: workspace,
          subject: "pi-bash",
        }),
        snapshotWorkspaceMediaFiles,
        newestChangedMediaArtifact: vi.fn(() => undefined),
        appendMediaArtifactResult: <T>(result: T) => result,
      });

      const result = await registeredTools[0]!.execute(
        "call-bash",
        { command: "cat .ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt" },
        new AbortController().signal,
        () => undefined,
      );

      expect(snapshotWorkspaceMediaFiles).not.toHaveBeenCalled();
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("recovery_read_interrupted_tool_call"),
      });
      expect(result.details).toMatchObject({
        status: "error",
        toolName: "bash",
        recoveryToolsAvailable: true,
        recoveryTool: "recovery_read_interrupted_tool_call",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
