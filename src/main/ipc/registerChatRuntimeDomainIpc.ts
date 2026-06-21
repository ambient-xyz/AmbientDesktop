import type { IpcMain } from "electron";

import {
  contextCompactIpcChannels,
  contextRecoverIpcChannels,
  contextUsageIpcChannels,
  registerContextCompactIpc,
  registerContextRecoverIpc,
  registerContextUsageIpc,
} from "./registerContextIpc";
import {
  messageSendIpcChannels,
  registerMessageSendIpc,
  type SendMessageIpcInput,
} from "./registerMessageIpc";
import { registerRunAbortIpc, runAbortIpcChannels } from "./registerRunIpc";
import type {
  CompactThreadInput,
  DesktopEvent,
  RecoverThreadContextInput,
  SendMessageInput,
} from "../../shared/desktopTypes";
import type { SlashCommandSelection } from "../../shared/slashCommandTypes";
import type {
  ChatMessage,
  ContextUsageSnapshot,
  ThreadGoal,
  ThreadSummary,
} from "../../shared/threadTypes";
import { isHiddenTranscriptMessage } from "../../shared/threadPreview";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const chatRuntimeDomainIpcChannels = [
  ...messageSendIpcChannels,
  ...runAbortIpcChannels,
  ...contextUsageIpcChannels,
  ...contextCompactIpcChannels,
  ...contextRecoverIpcChannels,
] as const;

export interface ChatRuntimeStore {
  getThread(threadId: string): ThreadSummary;
  getWorkspace(): { path: string };
  listMessages(threadId: string): ChatMessage[];
  deleteMessagesAfter(threadId: string, messageId: string): unknown;
  getThreadGoal(threadId: string): ThreadGoal | undefined;
  setThreadGoal(input: {
    threadId: string;
    status: "active";
    expectedGoalId: string;
    tokenBudget?: number | null;
    statusReason: null;
  }): ThreadGoal;
  createThreadGoalIfAbsent(input: {
    threadId: string;
    objective: string;
    tokenBudget?: number | null;
  }): ThreadGoal;
  markThreadRead(threadId: string): ThreadSummary;
}

export interface ChatRuntimeAgentRuntime {
  send(input: SendMessageInput): MaybePromise<void>;
  abort(threadId: string): MaybePromise<void>;
  getContextUsage(threadId: string): MaybePromise<ContextUsageSnapshot>;
  compactThread(input: CompactThreadInput): MaybePromise<ContextUsageSnapshot>;
  recoverThreadContext(input: RecoverThreadContextInput): MaybePromise<ContextUsageSnapshot>;
}

export interface ChatRuntimeDomainHost<
  Store extends ChatRuntimeStore = ChatRuntimeStore,
  Runtime extends ChatRuntimeAgentRuntime = ChatRuntimeAgentRuntime,
> {
  store: Store;
  runtime: Runtime;
}

export interface RegisterChatRuntimeDomainIpcDependencies<
  Host extends ChatRuntimeDomainHost = ChatRuntimeDomainHost,
> {
  activeHost: Host | undefined;
  activeThreadId: string;
  activeThreadIdForHost(host: Host): string;
  createAndRecordCheckpoint(
    kind: "pre-run",
    description: string,
    thread: ThreadSummary,
    store: Host["store"],
  ): MaybePromise<unknown>;
  describeWorkspaceContextReferences(
    workspacePath: string,
    context: NonNullable<SendMessageIpcInput["context"]>,
    options: { allowExternal: boolean },
  ): MaybePromise<SendMessageInput["context"]>;
  emitDesktopEvent(event: DesktopEvent): void;
  emitProjectScopedEvent(host: Host, event: { type: "thread-goal-updated"; goal: ThreadGoal }): void;
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  emitThreadUpdated(thread: ThreadSummary): void;
  env?: NodeJS.ProcessEnv;
  handleIpc: HandleIpc;
  isActiveProjectRuntimeHost(host: Host): boolean;
  prepareWorktreeForThread(thread: ThreadSummary, store: Host["store"]): MaybePromise<ThreadSummary>;
  requireProjectRuntimeHostForThread(threadId: string): Host;
  setProjectHostActiveThreadId(host: Host, threadId: string): void;
  validateSlashCommandSelection?(host: Host, selection: SlashCommandSelection): MaybePromise<void>;
}

export function registerChatRuntimeDomainIpc<Host extends ChatRuntimeDomainHost>({
  activeHost,
  activeThreadId,
  activeThreadIdForHost,
  createAndRecordCheckpoint,
  describeWorkspaceContextReferences,
  emitDesktopEvent,
  emitProjectScopedEvent,
  emitProjectStateIfActive,
  emitThreadUpdated,
  env = process.env,
  handleIpc,
  isActiveProjectRuntimeHost,
  prepareWorktreeForThread,
  requireProjectRuntimeHostForThread,
  setProjectHostActiveThreadId,
  validateSlashCommandSelection,
}: RegisterChatRuntimeDomainIpcDependencies<Host>): void {
  registerMessageSendIpc({
    handleIpc,
    sendMessage: async (input, raw) => {
      const host = requireProjectRuntimeHostForThread(input.threadId);
      if (input.composerIntent?.kind === "slash-command") {
        await validateSlashCommandSelection?.(host, input.composerIntent.selection);
      }
      const targetStore = host.store;
      const targetRuntime = host.runtime;
      let thread = targetStore.getThread(input.threadId);
      const stateThreadId = input.preserveActiveThread ? activeThreadIdForHost(host) : input.threadId;
      if (!input.preserveActiveThread) {
        setProjectHostActiveThreadId(host, input.threadId);
      }
      if ((!thread.gitWorktree || thread.gitWorktree.status !== "active") && thread.workspacePath === targetStore.getWorkspace().path) {
        thread = await prepareWorktreeForThread(thread, targetStore);
        emitProjectStateIfActive(host, stateThreadId);
        if (!isActiveProjectRuntimeHost(host)) emitThreadUpdated(thread);
      }
      const context = input.context?.length
        ? await describeWorkspaceContextReferences(
            thread.workspacePath,
            input.context,
            { allowExternal: input.permissionMode === "full-access" },
          )
        : undefined;
      if (input.retryOfMessageId) {
        const retryTarget = targetStore
          .listMessages(input.threadId)
          .find((message) => message.id === input.retryOfMessageId);
        if (!retryTarget || !isHiddenTranscriptMessage(retryTarget)) {
          targetStore.deleteMessagesAfter(input.threadId, input.retryOfMessageId);
          emitProjectStateIfActive(host, stateThreadId);
        }
      }
      if (input.goalMode?.enabled) {
        if (input.collaborationMode === "planner") {
          throw new Error("Goal mode is disabled while Planner mode is active.");
        }
        const existingGoal = targetStore.getThreadGoal(input.threadId);
        const goal = existingGoal
          ? targetStore.setThreadGoal({
              threadId: input.threadId,
              status: "active",
              expectedGoalId: existingGoal.goalId,
              tokenBudget: input.goalMode.tokenBudget ?? existingGoal.tokenBudget ?? null,
              statusReason: null,
            })
          : targetStore.createThreadGoalIfAbsent({
              threadId: input.threadId,
              objective: input.content,
              tokenBudget: input.goalMode.tokenBudget ?? null,
            });
        emitProjectScopedEvent(host, { type: "thread-goal-updated", goal });
        emitProjectStateIfActive(host, stateThreadId);
      }
      if (input.delivery === undefined || input.delivery === "prompt") {
        await createAndRecordCheckpoint("pre-run", "Before Ambient run.", thread, targetStore);
      }
      if (env.AMBIENT_E2E_CAPTURE_MESSAGES === "1") {
        emitDesktopEvent({ type: "e2e-message-captured", input: raw } satisfies DesktopEvent);
        return;
      }
      await targetRuntime.send({ ...input, context });
      if (!input.preserveActiveThread && activeHost === host && activeThreadId === input.threadId) {
        emitThreadUpdated(targetStore.markThreadRead(input.threadId));
      }
    },
  });

  registerRunAbortIpc({
    handleIpc,
    abortRun: (threadId) => {
      return requireProjectRuntimeHostForThread(threadId).runtime.abort(threadId);
    },
  });
  registerContextUsageIpc({
    handleIpc,
    getContextUsage: (threadId) => {
      return requireProjectRuntimeHostForThread(threadId).runtime.getContextUsage(threadId);
    },
  });
  registerContextCompactIpc({
    handleIpc,
    compactThread: (input) => {
      return requireProjectRuntimeHostForThread(input.threadId).runtime.compactThread(input);
    },
  });
  registerContextRecoverIpc({
    handleIpc,
    recoverThreadContext: (input) => {
      return requireProjectRuntimeHostForThread(input.threadId).runtime.recoverThreadContext(input);
    },
  });
}
