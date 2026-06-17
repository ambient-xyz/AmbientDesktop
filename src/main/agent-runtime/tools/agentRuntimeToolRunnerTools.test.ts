import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import {
  agentRuntimeToolRunnerPolicy,
  createAgentRuntimeToolRunnerExtension,
} from "./agentRuntimeToolRunnerTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("createAgentRuntimeToolRunnerExtension", () => {
  it("registers file and bash tools with runtime authority callbacks", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-runner-extension-"));
    const registeredTools: RegisteredTool[] = [];
    const readOnlyAllowedPaths = vi.fn(() => [join(workspace, ".ambient/deps")]);
    const readAuthorityRootPaths = vi.fn(() => [workspace]);
    const writeAuthorityRootPaths = vi.fn(() => [workspace]);
    const snapshots = ["before", "after"];
    const snapshotWorkspaceMediaFiles = vi.fn(() => snapshots.shift() ?? "extra");
    const newestChangedMediaArtifact = vi.fn(() => "generated.png");
    const appendMediaArtifactResult = <T>(result: T, artifactPath: string, workspacePath: string): T => {
      const toolResult = result as AgentToolResult<Record<string, unknown>>;
      return {
        ...toolResult,
        details: {
          ...(toolResult.details ?? {}),
          artifactPath,
          workspacePath,
        },
      } as T;
    };

    try {
      createAgentRuntimeToolRunnerExtension({
        workspace: { path: workspace },
        getThread: () => ({ collaborationMode: "agent", permissionMode: "full-access" }),
        readOnlyAllowedPaths,
        readAuthorityRootPaths,
        writeAuthorityRootPaths,
        snapshotWorkspaceMediaFiles,
        newestChangedMediaArtifact,
        appendMediaArtifactResult,
      })({ registerTool: (tool: any) => { registeredTools.push(tool); } } as any);

      expect(registeredTools.map((tool) => tool.name)).toEqual(["read", "write", "edit", "grep", "find", "ls", "bash"]);
      expect(registeredTools.map((tool) => tool.executionMode)).toEqual([
        "sequential",
        "sequential",
        "sequential",
        "sequential",
        "sequential",
        "sequential",
        "sequential",
      ]);

      await toolByName(registeredTools, "write").execute("write-note", { path: "note.txt", content: "hello\n" }, new AbortController().signal);
      await expect(readFile(join(workspace, "note.txt"), "utf8")).resolves.toBe("hello\n");
      const readResult = await toolByName(registeredTools, "read").execute("read-note", { path: "note.txt" }, new AbortController().signal);
      expect(extractToolText(readResult)).toContain("hello");

      const bashResult = await toolByName(registeredTools, "bash").execute(
        "run-bash",
        { command: "printf runner" },
        new AbortController().signal,
        () => undefined,
      );

      expect(snapshotWorkspaceMediaFiles).toHaveBeenCalledTimes(2);
      expect(snapshotWorkspaceMediaFiles).toHaveBeenCalledWith(workspace);
      expect(newestChangedMediaArtifact).toHaveBeenCalledWith(workspace, "before", "after");
      expect(bashResult.details).toMatchObject({ artifactPath: "generated.png", workspacePath: workspace });
      expect(writeAuthorityRootPaths).toHaveBeenCalled();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses workspace bash policy in planner mode", () => {
    expect(agentRuntimeToolRunnerPolicy({
      thread: { collaborationMode: "planner", permissionMode: "full-access" },
      workspacePath: "/workspace",
      authorityRootPaths: ["/workspace"],
    })).toEqual({
      permissionMode: "workspace",
      workspacePath: "/workspace",
      authorityRootPaths: ["/workspace"],
      subject: "pi-bash",
    });
  });

  it("forwards child authority workspace-root narrowing into bash policy", () => {
    expect(agentRuntimeToolRunnerPolicy({
      thread: { collaborationMode: "agent", permissionMode: "workspace" },
      workspacePath: "/workspace",
      authorityRootPaths: ["/allowed"],
      includeWorkspaceRootAuthority: false,
    })).toEqual({
      permissionMode: "workspace",
      workspacePath: "/workspace",
      authorityRootPaths: ["/allowed"],
      includeWorkspaceRootAuthority: false,
      subject: "pi-bash",
    });
  });
});

function toolByName(tools: RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

function extractToolText(result: any): string {
  return (result.content ?? [])
    .filter((item: any) => item.type === "text")
    .map((item: any) => item.text)
    .join("\n");
}
