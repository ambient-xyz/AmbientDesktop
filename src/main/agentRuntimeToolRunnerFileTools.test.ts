import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { registerToolRunnerFileTools } from "./agentRuntimeToolRunnerFileTools";

type RegisteredTool = {
  name: string;
  description?: string;
  parameters?: {
    properties?: Record<string, { description?: string }>;
  };
  executionMode?: string;
  execute: (...args: any[]) => Promise<any>;
};

describe("agentRuntimeToolRunnerFileTools", () => {
  it("registers workspace file tools as sequential tools", () => {
    const registeredTools: RegisteredTool[] = [];

    registerToolRunnerFileTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
      workspacePath: "/workspace",
      readOnlyAllowedPaths: vi.fn(() => ["/workspace/.ambient/deps"]),
      readAuthorityRootPaths: vi.fn(() => ["/workspace"]),
      writeAuthorityRootPaths: vi.fn(() => ["/workspace"]),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["read", "write", "edit", "grep", "find", "ls"]);
    expect(registeredTools.map((tool) => tool.executionMode)).toEqual([
      "sequential",
      "sequential",
      "sequential",
      "sequential",
      "sequential",
      "sequential",
    ]);
    const writeTool = toolByName(registeredTools, "write");
    expect(writeTool.description).toContain("Ambient streams long content arguments");
    expect(writeTool.description).toContain("bounded read preview");
    expect(writeTool.parameters?.properties?.path?.description).toContain("resumable large-write tracking");
    expect(writeTool.parameters?.properties?.content?.description).toContain("complete file body");
    expect(writeTool.parameters?.properties?.recoveryMode?.description).toContain("interrupted_write_suffix");
    expect(writeTool.parameters?.properties?.recoverySuffix?.description).toContain("missing suffix");
  });

  it("wires registered read and write tools through the ambient operations", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-runner-files-"));
    const registeredTools: RegisteredTool[] = [];
    try {
      registerToolRunnerFileTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
        workspacePath: workspace,
        readOnlyAllowedPaths: () => [],
        readAuthorityRootPaths: () => [workspace],
        writeAuthorityRootPaths: () => [workspace],
      });

      const writeTool = toolByName(registeredTools, "write");
      const readTool = toolByName(registeredTools, "read");
      await writeTool.execute("call-write", { path: "note.txt", content: "hello from runner\n" }, new AbortController().signal);

      await expect(readFile(join(workspace, "note.txt"), "utf8")).resolves.toBe("hello from runner\n");
      const result = await readTool.execute("call-read", { path: "note.txt" }, new AbortController().signal);
      expect(extractToolText(result)).toContain("hello from runner");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects generic reads of interrupted tool-call recovery artifacts without suggesting unavailable tools", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-runner-recovery-read-"));
    const registeredTools: RegisteredTool[] = [];
    try {
      registerToolRunnerFileTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
        workspacePath: workspace,
        readOnlyAllowedPaths: () => [],
        readAuthorityRootPaths: () => [workspace],
        writeAuthorityRootPaths: () => [workspace],
      });

      const readTool = toolByName(registeredTools, "read");
      const result = await readTool.execute("call-read", {
        path: ".ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt",
      }, new AbortController().signal);

      expect(extractToolText(result)).toContain("recovery continuation turn");
      expect(extractToolText(result)).not.toContain("Suggested recovery_read_interrupted_tool_call input");
      expect(result.details).toMatchObject({
        status: "error",
        toolName: "read",
        recoveryToolsAvailable: false,
        runId: "run-1",
        toolCallId: "call-write",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("points at exact recovery tools when the session activated them", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-runner-recovery-read-active-"));
    const registeredTools: RegisteredTool[] = [];
    try {
      registerToolRunnerFileTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
        workspacePath: workspace,
        readOnlyAllowedPaths: () => [],
        readAuthorityRootPaths: () => [workspace],
        writeAuthorityRootPaths: () => [workspace],
        interruptedToolCallRecoveryToolsAvailable: () => true,
      });

      const readTool = toolByName(registeredTools, "read");
      const result = await readTool.execute("call-read", {
        path: ".ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt",
      }, new AbortController().signal);

      expect(extractToolText(result)).toContain("Suggested recovery_read_interrupted_tool_call input");
      expect(result.details).toMatchObject({
        status: "error",
        toolName: "read",
        recoveryToolsAvailable: true,
        recoveryTool: "recovery_read_interrupted_tool_call",
        runId: "run-1",
        toolCallId: "call-write",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("applies interrupted-write suffixes through normal write recovery mode", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-runner-write-recovery-"));
    const registeredTools: RegisteredTool[] = [];
    try {
      const artifactDir = join(workspace, ".ambient-codex", "interrupted-tool-calls", "run-1");
      const exactArgs = JSON.stringify({ path: "game/index.html", content: "<!doctype html>\n<div>tic" });
      const sha256 = createHash("sha256").update(exactArgs).digest("hex");
      await mkdir(artifactDir, { recursive: true });
      await writeFile(join(artifactDir, "call-write.partial-args.txt"), exactArgs, "utf8");

      registerToolRunnerFileTools({ registerTool: (tool: any) => registeredTools.push(tool) }, {
        workspacePath: workspace,
        readOnlyAllowedPaths: () => [],
        readAuthorityRootPaths: () => [workspace],
        writeAuthorityRootPaths: () => [workspace],
      });

      const writeTool = toolByName(registeredTools, "write");
      const result = await writeTool.execute("call-recovery-write", {
        path: "game/index.html",
        content: "",
        recoveryMode: "interrupted_write_suffix",
        recoveryRunId: "run-1",
        recoveryToolCallId: "call-write",
        recoverySha256: sha256,
        recoverySuffix: "tic tac toe</div>\n",
        recoveryOverlapStrategy: "auto",
      }, new AbortController().signal);

      await expect(readFile(join(workspace, "game", "index.html"), "utf8")).resolves.toBe(
        "<!doctype html>\n<div>tic tac toe</div>\n",
      );
      expect(result.details).toMatchObject({
        status: "done",
        toolName: "recovery_apply_interrupted_write_suffix",
        runId: "run-1",
        toolCallId: "call-write",
        prefixChars: "<!doctype html>\n<div>tic".length,
        overlapChars: "tic".length,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
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
