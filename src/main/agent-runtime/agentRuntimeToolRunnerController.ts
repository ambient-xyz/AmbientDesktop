import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { AmbientFileAuthorityRequest } from "./agentRuntimePiFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  asyncBashJobTerminal,
  asyncBashSnapshotDetails,
  formatAsyncBashSnapshotForTool,
  type AgentRuntimeAsyncBashJobService,
  type AsyncBashJobSnapshot,
} from "./tools/agentRuntimeAsyncBashJobs";
import type {
  AgentRuntimeThreadWakeToolInput,
  AgentRuntimeThreadWakeToolResult,
} from "./tools/agentRuntimeAsyncBashTools";
import { createAgentRuntimeToolRunnerExtension } from "./tools/agentRuntimeToolRunnerTools";
import { runtimeToolResultMessageUpdate } from "./toolResultUpdates";

export interface AgentRuntimeToolRunnerControllerOptions {
  store: Pick<
    ProjectStore,
    "getThread" | "getProjectBoardDependencyWorkspacePathsForExecutionThread" | "addMessage" | "replaceMessage"
  >;
  asyncBashJobs: () => AgentRuntimeAsyncBashJobService;
  getRunId: (threadId: string) => string | undefined;
  scheduleThreadWake: (input: AgentRuntimeThreadWakeToolInput) => Promise<AgentRuntimeThreadWakeToolResult>;
  fileAuthorityRootPathsForThread: (threadId: string, access: "read" | "write") => string[];
  includeWorkspaceRootAuthorityForThread: (threadId: string) => boolean;
  requestFileAuthorityForThread: (
    threadId: string,
    workspace: WorkspaceState,
    request: AmbientFileAuthorityRequest,
  ) => Promise<boolean>;
  emit: (event: DesktopEvent) => void;
}

export class AgentRuntimeToolRunnerController {
  private readonly asyncBashToolMessageIds = new Map<string, string>();

  constructor(private readonly options: AgentRuntimeToolRunnerControllerOptions) {}

  createToolRunnerExtension(
    threadId: string,
    workspace: WorkspaceState,
    options?: { interruptedToolCallRecoveryToolsAvailable?: boolean },
  ): ExtensionFactory {
    return createAgentRuntimeToolRunnerExtension({
      threadId,
      workspace,
      getRunId: () => this.options.getRunId(threadId),
      asyncBashJobs: this.options.asyncBashJobs(),
      scheduleThreadWake: (input) => this.options.scheduleThreadWake(input),
      getThread: () => this.options.store.getThread(threadId),
      readOnlyAllowedPaths: () => this.options.store.getProjectBoardDependencyWorkspacePathsForExecutionThread(threadId),
      readAuthorityRootPaths: () => this.options.fileAuthorityRootPathsForThread(threadId, "read"),
      writeAuthorityRootPaths: () => this.options.fileAuthorityRootPathsForThread(threadId, "write"),
      includeWorkspaceRootAuthority: () => this.options.includeWorkspaceRootAuthorityForThread(threadId),
      requestFileAuthority: (request) => this.options.requestFileAuthorityForThread(threadId, workspace, request),
      interruptedToolCallRecoveryToolsAvailable: () => options?.interruptedToolCallRecoveryToolsAvailable ?? false,
    });
  }

  upsertAsyncBashToolMessage(snapshot: AsyncBashJobSnapshot): void {
    let thread: ThreadSummary;
    try {
      thread = this.options.store.getThread(snapshot.threadId);
    } catch {
      return;
    }
    const existingMessageId = this.asyncBashToolMessageIds.get(snapshot.jobId);
    const terminal = asyncBashJobTerminal(snapshot.status);
    const errorTerminal = snapshot.status === "failed" ||
      snapshot.status === "timed_out" ||
      (snapshot.status === "exited" && snapshot.exitCode !== 0);
    const messageStatus = terminal ? (errorTerminal ? "error" : "done") : "running";
    const update = runtimeToolResultMessageUpdate({
      toolCallId: `async-bash:${snapshot.jobId}`,
      label: "bash_async",
      inputContent: [
        `job_id: ${snapshot.jobId}`,
        `cwd: ${snapshot.cwd}`,
        `cmd: ${snapshot.command}`,
      ].join("\n"),
      resultContent: formatAsyncBashSnapshotForTool(snapshot),
      workspacePath: thread.workspacePath,
      permissionMode: thread.permissionMode,
      messageStatus,
      statusLabel: snapshot.status,
      eventStatus: messageStatus === "running" ? "running" : messageStatus === "done" ? "completed" : "error",
      ...(existingMessageId ? { existingMessageId } : {}),
      details: {
        jobId: snapshot.jobId,
        status: snapshot.status,
        latestSeq: String(snapshot.latestSeq),
      },
      resultDetails: asyncBashSnapshotDetails(snapshot),
    });
    const message = update.existingMessageId
      ? this.options.store.replaceMessage(update.existingMessageId, update.content, update.metadata)
      : this.options.store.addMessage({
          threadId: snapshot.threadId,
          role: "tool",
          content: update.content,
          metadata: update.metadata,
        });
    if (!existingMessageId) this.asyncBashToolMessageIds.set(snapshot.jobId, message.id);
    this.emitToolMessageUpdate(update.existingMessageId ? "message-updated" : "message-created", message);
    this.options.emit({
      type: "tool-event",
      threadId: snapshot.threadId,
      label: update.toolEventLabel,
      status: messageStatus === "running" ? "running" : messageStatus === "done" ? "done" : "error",
      artifactPath: update.artifactPath,
      details: update.toolEventDetails,
    });
  }

  private emitToolMessageUpdate(type: "message-created" | "message-updated", message: ChatMessage): void {
    this.options.emit({ type, message });
  }
}
