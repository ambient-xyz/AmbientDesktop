import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { PermissionMode } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  appendMediaArtifactResult as defaultAppendMediaArtifactResult,
  newestChangedMediaArtifact as defaultNewestChangedMediaArtifact,
  snapshotWorkspaceMediaFiles as defaultSnapshotWorkspaceMediaFiles,
} from "../agentRuntimeMediaArtifacts";
import { registerToolRunnerBashTool } from "./agentRuntimeToolRunnerBashTool";
import { registerToolRunnerFileTools } from "./agentRuntimeToolRunnerFileTools";
import {
  registerAgentRuntimeAsyncBashTools,
  type AgentRuntimeThreadWakeToolInput,
  type AgentRuntimeThreadWakeToolResult,
} from "./agentRuntimeAsyncBashTools";
import type { AgentRuntimeAsyncBashJobService } from "./agentRuntimeAsyncBashJobs";
import type { AmbientFileAuthorityRequester } from "../agentRuntimePiFacade";
import type { ToolRunnerPolicy } from "../agentRuntimeToolRuntimeFacade";

export interface AgentRuntimeToolRunnerThreadState {
  collaborationMode: ThreadSummary["collaborationMode"];
  permissionMode: PermissionMode;
}

export interface AgentRuntimeToolRunnerExtensionOptions<MediaSnapshot = ReturnType<typeof defaultSnapshotWorkspaceMediaFiles>> {
  workspace: Pick<WorkspaceState, "path">;
  getThread: () => AgentRuntimeToolRunnerThreadState;
  readOnlyAllowedPaths: () => string[];
  readAuthorityRootPaths: () => string[];
  writeAuthorityRootPaths: () => string[];
  includeWorkspaceRootAuthority?: () => boolean;
  requestFileAuthority?: AmbientFileAuthorityRequester;
  interruptedToolCallRecoveryToolsAvailable?: () => boolean;
  snapshotWorkspaceMediaFiles?: (workspacePath: string) => MediaSnapshot;
  newestChangedMediaArtifact?: (
    workspacePath: string,
    before: MediaSnapshot,
    after: MediaSnapshot,
  ) => string | undefined;
  appendMediaArtifactResult?: <T>(result: T, artifactPath: string, workspacePath: string) => T;
  threadId?: string;
  getRunId?: () => string | undefined;
  asyncBashJobs?: AgentRuntimeAsyncBashJobService;
  scheduleThreadWake?: (input: AgentRuntimeThreadWakeToolInput) => Promise<AgentRuntimeThreadWakeToolResult>;
}

export function createAgentRuntimeToolRunnerExtension<MediaSnapshot = ReturnType<typeof defaultSnapshotWorkspaceMediaFiles>>(
  options: AgentRuntimeToolRunnerExtensionOptions<MediaSnapshot>,
): ExtensionFactory {
  const snapshotWorkspaceMediaFiles =
    options.snapshotWorkspaceMediaFiles ?? (defaultSnapshotWorkspaceMediaFiles as (workspacePath: string) => MediaSnapshot);
  const newestChangedMediaArtifact =
    options.newestChangedMediaArtifact ?? (defaultNewestChangedMediaArtifact as (
      workspacePath: string,
      before: MediaSnapshot,
      after: MediaSnapshot,
    ) => string | undefined);
  const appendMediaArtifactResult = options.appendMediaArtifactResult ?? defaultAppendMediaArtifactResult;

  return (pi) => {
    registerToolRunnerFileTools(pi, {
      workspacePath: options.workspace.path,
      readOnlyAllowedPaths: options.readOnlyAllowedPaths,
      readAuthorityRootPaths: options.readAuthorityRootPaths,
      writeAuthorityRootPaths: options.writeAuthorityRootPaths,
      includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
      requestFileAuthority: options.requestFileAuthority,
      interruptedToolCallRecoveryToolsAvailable: options.interruptedToolCallRecoveryToolsAvailable,
    });
    registerToolRunnerBashTool(pi, {
      workspacePath: options.workspace.path,
      interruptedToolCallRecoveryToolsAvailable: options.interruptedToolCallRecoveryToolsAvailable,
      getPolicy: () => {
        const thread = options.getThread();
        return agentRuntimeToolRunnerPolicy({
          thread,
          workspacePath: options.workspace.path,
          authorityRootPaths: options.writeAuthorityRootPaths(),
          includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority?.() ?? true,
        });
      },
      snapshotWorkspaceMediaFiles,
      newestChangedMediaArtifact,
      appendMediaArtifactResult,
    });
    if (options.threadId && options.asyncBashJobs) {
      registerAgentRuntimeAsyncBashTools(pi, {
        threadId: options.threadId,
        workspacePath: options.workspace.path,
        getRunId: options.getRunId,
        asyncBashJobs: options.asyncBashJobs,
        scheduleThreadWake: options.scheduleThreadWake,
        interruptedToolCallRecoveryToolsAvailable: options.interruptedToolCallRecoveryToolsAvailable,
        getPolicy: () => {
          const thread = options.getThread();
          return agentRuntimeToolRunnerPolicy({
            thread,
            workspacePath: options.workspace.path,
            authorityRootPaths: options.writeAuthorityRootPaths(),
            includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority?.() ?? true,
          });
        },
      });
    }
  };
}

export function agentRuntimeToolRunnerPolicy(input: {
  thread: AgentRuntimeToolRunnerThreadState;
  workspacePath: string;
  authorityRootPaths: string[];
  includeWorkspaceRootAuthority?: boolean;
}): ToolRunnerPolicy {
  return {
    permissionMode: input.thread.collaborationMode === "planner" ? "workspace" : input.thread.permissionMode,
    workspacePath: input.workspacePath,
    authorityRootPaths: input.authorityRootPaths,
    ...(input.includeWorkspaceRootAuthority === undefined
      ? {}
      : { includeWorkspaceRootAuthority: input.includeWorkspaceRootAuthority }),
    subject: "pi-bash",
  };
}
