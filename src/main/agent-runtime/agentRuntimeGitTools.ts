import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { ThreadWorktreeSummary, WorkspaceState } from "../../shared/types";
import {
  ambientGitCommit as defaultAmbientGitCommit,
  ambientGitFinishToMain as defaultAmbientGitFinishToMain,
  ambientGitStatus as defaultAmbientGitStatus,
  type AmbientGitCommitInput,
  type AmbientGitCommitResult,
  type AmbientGitFinishToMainInput,
  type AmbientGitFinishToMainResult,
  type AmbientGitStatusResult,
} from "../ambient/ambientGitTools";
import { gitToolDescriptor } from "../desktopToolRegistry";
import { registerDesktopTool } from "../desktopToolRegistration";

export interface GitToolRegistrationOptions {
  workspace: WorkspaceState;
  projectRoot: () => string;
  threadWorktree: () => ThreadWorktreeSummary | undefined;
  ambientGitStatus?: typeof defaultAmbientGitStatus;
  ambientGitCommit?: typeof defaultAmbientGitCommit;
  ambientGitFinishToMain?: typeof defaultAmbientGitFinishToMain;
}

export function createGitToolExtension(options: GitToolRegistrationOptions): ExtensionFactory {
  return (pi) => {
    registerGitTools(pi, options);
  };
}

export function registerGitTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: GitToolRegistrationOptions,
): void {
  const ambientGitStatus = options.ambientGitStatus ?? defaultAmbientGitStatus;
  const ambientGitCommit = options.ambientGitCommit ?? defaultAmbientGitCommit;
  const ambientGitFinishToMain = options.ambientGitFinishToMain ?? defaultAmbientGitFinishToMain;

  registerDesktopTool(pi, gitToolDescriptor("ambient_git_status"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate) => {
      onUpdate?.(gitToolUpdate("ambient_git_status", "Inspecting Ambient Git worktree topology."));
      const input = objectParams<{ targetBranch?: string }>(params);
      const result = await ambientGitStatus({
        projectRoot: options.projectRoot(),
        threadWorkspacePath: options.workspace.path,
        threadWorktree: options.threadWorktree(),
        targetBranch: input.targetBranch,
      });
      return gitToolResult("Ambient Git status", {
        runtime: "ambient-git",
        toolName: "ambient_git_status",
        ...result,
      });
    },
  });

  registerDesktopTool(pi, gitToolDescriptor("ambient_git_commit"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate) => {
      onUpdate?.(gitToolUpdate("ambient_git_commit", "Preparing Ambient Git thread commit."));
      const input = objectParams<AmbientGitCommitInput>(params);
      const result = await ambientGitCommit({
        projectRoot: options.projectRoot(),
        threadWorkspacePath: options.workspace.path,
        threadWorktree: options.threadWorktree(),
        commit: input,
      });
      return gitToolResult("Ambient Git commit result", {
        runtime: "ambient-git",
        toolName: "ambient_git_commit",
        ...result,
      });
    },
  });

  registerDesktopTool(pi, gitToolDescriptor("ambient_git_finish_to_main"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate) => {
      onUpdate?.(gitToolUpdate("ambient_git_finish_to_main", "Preparing Ambient Git finish-to-main workflow."));
      const input = objectParams<AmbientGitFinishToMainInput>(params);
      const result = await ambientGitFinishToMain({
        projectRoot: options.projectRoot(),
        threadWorkspacePath: options.workspace.path,
        finish: input,
      });
      return gitToolResult("Ambient Git finish-to-main result", {
        runtime: "ambient-git",
        toolName: "ambient_git_finish_to_main",
        ...result,
      });
    },
  });
}

type GitToolResultDetails =
  | (AmbientGitStatusResult & { runtime: "ambient-git"; toolName: "ambient_git_status" })
  | (AmbientGitCommitResult & { runtime: "ambient-git"; toolName: "ambient_git_commit" })
  | (AmbientGitFinishToMainResult & { runtime: "ambient-git"; toolName: "ambient_git_finish_to_main" });

function gitToolResult(
  title: string,
  result: GitToolResultDetails,
): { content: { type: "text"; text: string }[]; details: GitToolResultDetails } {
  return {
    content: [
      {
        type: "text",
        text: [
          title,
          "",
          "```json",
          JSON.stringify(result, null, 2),
          "```",
        ].join("\n"),
      },
    ],
    details: result,
  };
}

function gitToolUpdate(toolName: GitToolResultDetails["toolName"], text: string): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: { runtime: "ambient-git", toolName, status: "running" },
  };
}

function objectParams<T>(params: unknown): T {
  return params && typeof params === "object" && !Array.isArray(params) ? params as T : {} as T;
}
