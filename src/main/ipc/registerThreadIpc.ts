import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  CreateThreadInput,
  DesktopEvent,
  DesktopState,
  ForkThreadInput,
  RequestThreadPermissionModeChangeInput,
  ThreadActionInput,
  UpdateThreadInput,
  UpdateThreadSettingsInput,
} from "../../shared/desktopTypes";
import type {
  PermissionAuditEntry,
  PermissionMode,
} from "../../shared/permissionTypes";
import type {
  ChatMessage,
  ExportChatInput,
  ExportChatPdfInput,
  ExportChatPdfResult,
  ExportChatResult,
  ThreadGoal,
  ThreadGoalClearInput,
  ThreadGoalGetInput,
  ThreadGoalSetInput,
  ThreadSummary,
} from "../../shared/threadTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

type ThreadCreateOptions = Pick<CreateThreadInput, "permissionMode" | "collaborationMode" | "model" | "thinkingLevel">;
export type ThreadCreateThread = Pick<ThreadSummary, "id" | "workspacePath" | "gitWorktree">;

export interface ThreadCreateStore<Thread extends ThreadCreateThread = ThreadCreateThread> {
  getWorkspace(): { path: string };
  findReusableEmptyThread(): Thread | undefined;
  createThread(title?: string, workspacePath?: string, options?: ThreadCreateOptions): Thread;
}

export interface ThreadCreateHost<Store extends ThreadCreateStore = ThreadCreateStore> {
  store: Store;
}

export const threadCreateIpcChannels = ["thread:create"] as const;
export const threadSelectIpcChannels = ["thread:select"] as const;
export const threadUpdateIpcChannels = ["thread:update"] as const;
export const threadArchiveIpcChannels = ["thread:archive"] as const;
export const threadMarkUnreadIpcChannels = ["thread:mark-unread"] as const;
export const threadRevealIpcChannels = ["thread:reveal"] as const;
export const threadForkIpcChannels = ["thread:fork"] as const;
export const threadOpenMiniWindowIpcChannels = ["thread:open-mini-window"] as const;
export const threadExportChatIpcChannels = ["thread:export-chat"] as const;
export const threadExportChatPdfIpcChannels = ["thread:export-chat-pdf"] as const;
export const threadUpdateSettingsIpcChannels = ["thread:update-settings"] as const;
export const threadPermissionModeChangeIpcChannels = ["thread:request-permission-mode-change"] as const;
export const threadGoalIpcChannels = [
  "thread-goal:get",
  "thread-goal:set",
  "thread-goal:clear",
] as const;

export interface RegisterThreadCreateIpcDependencies<
  Thread extends ThreadCreateThread = ThreadCreateThread,
  Store extends ThreadCreateStore<Thread> = ThreadCreateStore<Thread>,
  Host extends ThreadCreateHost<Store> = ThreadCreateHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  setProjectHostActiveThreadId(host: Host, threadId: string): void;
  readStateForProjectHostAction(host: Host, threadId: string): DesktopState;
}

export interface RegisterThreadSelectIpcDependencies<Host = unknown> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForThread(threadId: string): Host;
  setProjectHostActiveThreadId(host: Host, threadId: string): void;
  emitProjectStateIfActive(host: Host, threadId: string): void;
  readStateForProjectHostAction(host: Host, threadId: string): DesktopState;
}

export type ThreadUpdateThread = Pick<ThreadSummary, "id" | "title" | "workspacePath" | "pinned">;

export interface ThreadUpdateStore<Thread extends ThreadUpdateThread = ThreadUpdateThread> {
  getThread(threadId: string): Thread;
  updateThreadTitle(threadId: string, title: string): Thread;
  setThreadPinned(threadId: string, pinned: boolean): Thread;
}

export interface ThreadUpdateHost<Store extends ThreadUpdateStore = ThreadUpdateStore> {
  store: Store;
}

export interface RegisterThreadUpdateIpcDependencies<
  Thread extends ThreadUpdateThread = ThreadUpdateThread,
  Store extends ThreadUpdateStore<Thread> = ThreadUpdateStore<Thread>,
  Host extends ThreadUpdateHost<Store> = ThreadUpdateHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForThreadAction(input: UpdateThreadInput, fallbackHost: Host): Host;
  emitProjectStateIfActive(host: Host): void;
  isActiveProjectRuntimeHost(host: Host): boolean;
  emitThreadUpdated(thread: Thread): void;
  readStateForProjectHostAction(host: Host): DesktopState;
}

export interface ThreadArchiveStore {
  archiveThread(threadId: string): void;
}

export interface ThreadArchiveHost<Store extends ThreadArchiveStore = ThreadArchiveStore> {
  store: Store;
  activeThreadId: string;
}

export interface RegisterThreadArchiveIpcDependencies<
  Store extends ThreadArchiveStore = ThreadArchiveStore,
  Host extends ThreadArchiveHost<Store> = ThreadArchiveHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForThreadAction(input: ThreadActionInput, fallbackHost: Host): Host;
  initialActiveThreadIdForStore(store: Store): string;
  setProjectHostActiveThreadId(host: Host, threadId: string): void;
  emitProjectStateIfActive(host: Host): void;
  readStateForProjectHostAction(host: Host): DesktopState;
}

export type ThreadMarkUnreadThread = Pick<ThreadSummary, "id" | "workspacePath">;

export interface ThreadMarkUnreadStore<Thread extends ThreadMarkUnreadThread = ThreadMarkUnreadThread> {
  markThreadUnread(threadId: string): Thread;
}

export interface ThreadMarkUnreadHost<Store extends ThreadMarkUnreadStore = ThreadMarkUnreadStore> {
  store: Store;
}

export interface RegisterThreadMarkUnreadIpcDependencies<
  Thread extends ThreadMarkUnreadThread = ThreadMarkUnreadThread,
  Store extends ThreadMarkUnreadStore<Thread> = ThreadMarkUnreadStore<Thread>,
  Host extends ThreadMarkUnreadHost<Store> = ThreadMarkUnreadHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForThreadAction(input: ThreadActionInput, fallbackHost: Host): Host;
  isActiveProjectRuntimeHost(host: Host): boolean;
  emitThreadUpdated(thread: Thread): void;
  activeThreadIdForHost(host: Host): string;
  readState(threadId?: string, options?: { markActiveRead?: boolean }): DesktopState;
  emitDesktopState(state: DesktopState): void;
}

export type ThreadRevealThread = Pick<ThreadSummary, "id" | "workspacePath" | "gitWorktree">;

export interface ThreadRevealStore<Thread extends ThreadRevealThread = ThreadRevealThread> {
  getThread(threadId: string): Thread;
}

export interface ThreadRevealHost<Store extends ThreadRevealStore = ThreadRevealStore> {
  store: Store;
}

export interface RegisterThreadRevealIpcDependencies<
  Thread extends ThreadRevealThread = ThreadRevealThread,
  Store extends ThreadRevealStore<Thread> = ThreadRevealStore<Thread>,
  Host extends ThreadRevealHost<Store> = ThreadRevealHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForThreadAction(input: ThreadActionInput, fallbackHost: Host): Host;
  threadWorkingDirectory(thread: Thread): string;
  openPath(directory: string): MaybePromise<string>;
  showItemInFolder(directory: string): void;
}

export type ThreadForkThread = Pick<ThreadSummary, "id" | "workspacePath" | "gitWorktree">;

export interface ThreadForkStore<Thread extends ThreadForkThread = ThreadForkThread> {
  getWorkspace(): { path: string };
  forkThread(threadId: string, workspacePath: string): Thread;
}

export interface ThreadForkHost<Store extends ThreadForkStore = ThreadForkStore> {
  store: Store;
}

export interface RegisterThreadForkIpcDependencies<
  Thread extends ThreadForkThread = ThreadForkThread,
  Store extends ThreadForkStore<Thread> = ThreadForkStore<Thread>,
  Host extends ThreadForkHost<Store> = ThreadForkHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForThreadAction(input: ForkThreadInput, fallbackHost: Host): Host;
  prepareWorktreeForThread(thread: Thread, store: Store): MaybePromise<Thread>;
  setProjectHostActiveThreadId(host: Host, threadId: string): void;
  emitProjectStateIfActive(host: Host, threadId: string): void;
  isActiveProjectRuntimeHost(host: Host): boolean;
  emitThreadUpdated(thread: Thread): void;
  readStateForProjectHostAction(host: Host, threadId: string): DesktopState;
}

export type ThreadOpenMiniWindowThread = Pick<ThreadSummary, "id" | "workspacePath" | "gitWorktree">;

export interface ThreadOpenMiniWindowStore<
  Thread extends ThreadOpenMiniWindowThread = ThreadOpenMiniWindowThread,
  Message extends ChatMessage = ChatMessage,
> {
  getThread(threadId: string): Thread;
  listMessages(threadId: string): Message[];
}

export interface ThreadOpenMiniWindowHost<Store extends ThreadOpenMiniWindowStore = ThreadOpenMiniWindowStore> {
  store: Store;
}

export interface RegisterThreadOpenMiniWindowIpcDependencies<
  Thread extends ThreadOpenMiniWindowThread = ThreadOpenMiniWindowThread,
  Message extends ChatMessage = ChatMessage,
  Store extends ThreadOpenMiniWindowStore<Thread, Message> = ThreadOpenMiniWindowStore<Thread, Message>,
  Host extends ThreadOpenMiniWindowHost<Store> = ThreadOpenMiniWindowHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForThreadAction(input: ThreadActionInput, fallbackHost: Host): Host;
  threadWorkingDirectory(thread: Thread): string;
  openThreadMiniWindow(thread: Thread, messages: Message[], workingDirectory: string): MaybePromise<void>;
}

export interface RegisterThreadExportChatIpcDependencies {
  handleIpc: HandleIpc;
  exportChat(input: ExportChatInput): MaybePromise<ExportChatResult | undefined>;
}

export interface RegisterThreadExportChatPdfIpcDependencies {
  handleIpc: HandleIpc;
  exportChatPdf(input: ExportChatPdfInput): MaybePromise<ExportChatPdfResult | undefined>;
}

export type ThreadUpdateSettingsThread = Pick<ThreadSummary, "id" | "workspacePath">;

export interface ThreadUpdateSettingsStore<Thread extends ThreadUpdateSettingsThread = ThreadUpdateSettingsThread> {
  updateThreadSettings(threadId: string, input: UpdateThreadSettingsInput): Thread;
}

export interface ThreadUpdateSettingsHost<Store extends ThreadUpdateSettingsStore = ThreadUpdateSettingsStore> {
  store: Store;
  runtime?: {
    applyThreadMemorySettings(threadId: string): unknown;
    applyThreadModelSettings?(threadId: string): MaybePromise<unknown>;
  };
}

export interface RegisterThreadUpdateSettingsIpcDependencies<
  Thread extends ThreadUpdateSettingsThread = ThreadUpdateSettingsThread,
  Store extends ThreadUpdateSettingsStore<Thread> = ThreadUpdateSettingsStore<Thread>,
  Host extends ThreadUpdateSettingsHost<Store> = ThreadUpdateSettingsHost<Store>,
> {
  handleIpc: HandleIpc;
  parseThreadSettingsUpdate(raw: unknown): UpdateThreadSettingsInput;
  requireProjectRuntimeHostForThread(threadId: string): Host;
}

export type ThreadPermissionModeThread = Pick<ThreadSummary, "id" | "workspacePath" | "permissionMode">;
export type ThreadPermissionModeUpdate = Pick<RequestThreadPermissionModeChangeInput, "permissionMode">;
export type ThreadPermissionAuditInput = Pick<
  PermissionAuditEntry,
  "threadId" | "permissionMode" | "toolName" | "risk" | "decision" | "reason"
> & Partial<Pick<PermissionAuditEntry, "detail" | "decisionSource">>;

export interface ThreadPermissionModeStore<Thread extends ThreadPermissionModeThread = ThreadPermissionModeThread> {
  getThread(threadId: string): Thread;
  updateThreadSettings(threadId: string, input: ThreadPermissionModeUpdate): Thread;
  addPermissionAudit(input: ThreadPermissionAuditInput): PermissionAuditEntry;
}

export interface ThreadPermissionModeHost<Store extends ThreadPermissionModeStore = ThreadPermissionModeStore> {
  store: Store;
}

export interface RegisterThreadPermissionModeChangeIpcDependencies<
  Thread extends ThreadPermissionModeThread = ThreadPermissionModeThread,
  Store extends ThreadPermissionModeStore<Thread> = ThreadPermissionModeStore<Thread>,
  Host extends ThreadPermissionModeHost<Store> = ThreadPermissionModeHost<Store>,
> {
  handleIpc: HandleIpc;
  parseThreadPermissionModeChange(raw: unknown): RequestThreadPermissionModeChangeInput;
  requireProjectRuntimeHostForThread(threadId: string): Host;
  permissionModeChangeAuditDetail(input: {
    previousPermissionMode: PermissionMode;
    nextPermissionMode: PermissionMode;
    reason?: string;
  }): string;
  emitPermissionAuditCreated(entry: PermissionAuditEntry, workspacePath: string): void;
}

export interface ThreadGoalStore {
  getThreadGoal(threadId: string): ThreadGoal | undefined;
  setThreadGoal(input: ThreadGoalSetInput): ThreadGoal;
  clearThreadGoal(threadId: string, expectedGoalId?: string): ThreadGoal | undefined;
}

export interface ThreadGoalRuntime {
  continueGoalIfIdle(threadId: string, goalId: string): void;
}

export interface ThreadGoalHost<Store extends ThreadGoalStore = ThreadGoalStore, Runtime extends ThreadGoalRuntime = ThreadGoalRuntime> {
  store: Store;
  runtime: Runtime;
}

export interface RegisterThreadGoalIpcDependencies<
  Store extends ThreadGoalStore = ThreadGoalStore,
  Runtime extends ThreadGoalRuntime = ThreadGoalRuntime,
  Host extends ThreadGoalHost<Store, Runtime> = ThreadGoalHost<Store, Runtime>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForThread(threadId: string): Host;
  emitProjectScopedEvent(host: Host, event: DesktopEvent): void;
  emitProjectStateIfActive(host: Host, threadId: string): void;
}

const createThreadSchema = z.object({
  permissionMode: z.enum(["full-access", "workspace"]).optional(),
  collaborationMode: z.enum(["agent", "planner"]).optional(),
  model: z.string().min(1).optional(),
  thinkingLevel: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
  workspacePath: z.string().min(1).optional(),
}).optional() satisfies z.ZodType<CreateThreadInput | undefined>;
const projectIdSchema = z.string().min(1).max(128);
const threadActionSchema = z.object({
  threadId: z.string().min(1),
  projectId: projectIdSchema.optional(),
}) satisfies z.ZodType<ThreadActionInput>;
const updateThreadSchema = threadActionSchema.extend({
  title: z.string().max(160).optional(),
  pinned: z.boolean().optional(),
}) satisfies z.ZodType<UpdateThreadInput>;
const forkThreadSchema = threadActionSchema.extend({
  mode: z.enum(["local", "worktree"]),
}) satisfies z.ZodType<ForkThreadInput>;
const exportChatSchema = z.object({
  threadId: z.string().min(1),
}) satisfies z.ZodType<ExportChatInput>;
const exportChatPdfSchema = z.object({
  threadId: z.string().min(1),
  projectId: projectIdSchema.optional(),
}) satisfies z.ZodType<ExportChatPdfInput>;
const threadGoalStatusSchema = z.enum([
  "active",
  "paused",
  "blocked",
  "usage_limited",
  "budget_limited",
  "provider_unavailable",
  "complete",
]);
const threadGoalGetSchema = z.object({ threadId: z.string().min(1) });
const threadGoalSetSchema = z.object({
  threadId: z.string().min(1),
  objective: z.string().min(1).max(20_000).optional(),
  status: threadGoalStatusSchema.optional(),
  tokenBudget: z.number().int().positive().nullable().optional(),
  expectedGoalId: z.string().min(1).optional(),
  statusReason: z.string().max(2_000).nullable().optional(),
}) satisfies z.ZodType<ThreadGoalSetInput>;
const threadGoalClearSchema = z.object({
  threadId: z.string().min(1),
  expectedGoalId: z.string().min(1).optional(),
}) satisfies z.ZodType<ThreadGoalClearInput>;

export function registerThreadCreateIpc<
  Thread extends ThreadCreateThread = ThreadCreateThread,
  Store extends ThreadCreateStore<Thread> = ThreadCreateStore<Thread>,
  Host extends ThreadCreateHost<Store> = ThreadCreateHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  setProjectHostActiveThreadId,
  readStateForProjectHostAction,
}: RegisterThreadCreateIpcDependencies<Thread, Store, Host>): void {
  handleIpc("thread:create", async (_event, raw?: CreateThreadInput) => {
    const input = createThreadSchema.parse(raw);
    const host = requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    const hasExplicitInitialState = Boolean(input && Object.keys(input).length);
    let thread = hasExplicitInitialState
      ? targetStore.createThread("New chat", input?.workspacePath ?? targetStore.getWorkspace().path, {
        ...(input?.permissionMode ? { permissionMode: input.permissionMode } : {}),
        ...(input?.collaborationMode ? { collaborationMode: input.collaborationMode } : {}),
        ...(input?.model ? { model: input.model } : {}),
        ...(input?.thinkingLevel ? { thinkingLevel: input.thinkingLevel } : {}),
      })
      : targetStore.findReusableEmptyThread() ?? targetStore.createThread();
    setProjectHostActiveThreadId(host, thread.id);
    return readStateForProjectHostAction(host, thread.id);
  });
}

export function registerThreadSelectIpc<Host = unknown>({
  handleIpc,
  requireProjectRuntimeHostForThread,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
}: RegisterThreadSelectIpcDependencies<Host>): void {
  handleIpc("thread:select", (_event, threadId: string) => {
    const host = requireProjectRuntimeHostForThread(threadId);
    setProjectHostActiveThreadId(host, threadId);
    emitProjectStateIfActive(host, threadId);
    return readStateForProjectHostAction(host, threadId);
  });
}

export function registerThreadUpdateIpc<
  Thread extends ThreadUpdateThread = ThreadUpdateThread,
  Store extends ThreadUpdateStore<Thread> = ThreadUpdateStore<Thread>,
  Host extends ThreadUpdateHost<Store> = ThreadUpdateHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForThreadAction,
  emitProjectStateIfActive,
  isActiveProjectRuntimeHost,
  emitThreadUpdated,
  readStateForProjectHostAction,
}: RegisterThreadUpdateIpcDependencies<Thread, Store, Host>): void {
  handleIpc("thread:update", (_event, raw: UpdateThreadInput) => {
    const input = updateThreadSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    const targetStore = host.store;
    let thread = targetStore.getThread(input.threadId);
    if (Object.hasOwn(input, "title")) thread = targetStore.updateThreadTitle(input.threadId, input.title ?? "");
    if (Object.hasOwn(input, "pinned")) thread = targetStore.setThreadPinned(input.threadId, Boolean(input.pinned));
    emitProjectStateIfActive(host);
    if (!isActiveProjectRuntimeHost(host)) emitThreadUpdated(thread);
    return readStateForProjectHostAction(host);
  });
}

export function registerThreadArchiveIpc<
  Store extends ThreadArchiveStore = ThreadArchiveStore,
  Host extends ThreadArchiveHost<Store> = ThreadArchiveHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForThreadAction,
  initialActiveThreadIdForStore,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  readStateForProjectHostAction,
}: RegisterThreadArchiveIpcDependencies<Store, Host>): void {
  handleIpc("thread:archive", (_event, raw: ThreadActionInput) => {
    const input = threadActionSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    const targetStore = host.store;
    targetStore.archiveThread(input.threadId);
    if (host.activeThreadId === input.threadId) setProjectHostActiveThreadId(host, initialActiveThreadIdForStore(targetStore));
    emitProjectStateIfActive(host);
    return readStateForProjectHostAction(host);
  });
}

export function registerThreadMarkUnreadIpc<
  Thread extends ThreadMarkUnreadThread = ThreadMarkUnreadThread,
  Store extends ThreadMarkUnreadStore<Thread> = ThreadMarkUnreadStore<Thread>,
  Host extends ThreadMarkUnreadHost<Store> = ThreadMarkUnreadHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForThreadAction,
  isActiveProjectRuntimeHost,
  emitThreadUpdated,
  activeThreadIdForHost,
  readState,
  emitDesktopState,
}: RegisterThreadMarkUnreadIpcDependencies<Thread, Store, Host>): void {
  handleIpc("thread:mark-unread", (_event, raw: ThreadActionInput) => {
    const input = threadActionSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    const thread = host.store.markThreadUnread(input.threadId);
    if (!isActiveProjectRuntimeHost(host)) {
      emitThreadUpdated(thread);
      return readState();
    }
    const hostActiveThreadId = activeThreadIdForHost(host);
    const state = readState(hostActiveThreadId, { markActiveRead: input.threadId !== hostActiveThreadId });
    emitDesktopState(state);
    return state;
  });
}

export function registerThreadRevealIpc<
  Thread extends ThreadRevealThread = ThreadRevealThread,
  Store extends ThreadRevealStore<Thread> = ThreadRevealStore<Thread>,
  Host extends ThreadRevealHost<Store> = ThreadRevealHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForThreadAction,
  threadWorkingDirectory,
  openPath,
  showItemInFolder,
}: RegisterThreadRevealIpcDependencies<Thread, Store, Host>): void {
  handleIpc("thread:reveal", async (_event, raw: ThreadActionInput) => {
    const input = threadActionSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    const directory = threadWorkingDirectory(host.store.getThread(input.threadId));
    const error = await openPath(directory);
    if (error) showItemInFolder(directory);
  });
}

export function registerThreadForkIpc<
  Thread extends ThreadForkThread = ThreadForkThread,
  Store extends ThreadForkStore<Thread> = ThreadForkStore<Thread>,
  Host extends ThreadForkHost<Store> = ThreadForkHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForThreadAction,
  prepareWorktreeForThread,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  isActiveProjectRuntimeHost,
  emitThreadUpdated,
  readStateForProjectHostAction,
}: RegisterThreadForkIpcDependencies<Thread, Store, Host>): void {
  handleIpc("thread:fork", async (_event, raw: ForkThreadInput) => {
    const input = forkThreadSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    const targetStore = host.store;
    const fork = targetStore.forkThread(input.threadId, targetStore.getWorkspace().path);
    const selected = input.mode === "worktree" ? await prepareWorktreeForThread(fork, targetStore) : fork;
    setProjectHostActiveThreadId(host, selected.id);
    emitProjectStateIfActive(host, selected.id);
    if (!isActiveProjectRuntimeHost(host)) emitThreadUpdated(selected);
    return readStateForProjectHostAction(host, selected.id);
  });
}

export function registerThreadOpenMiniWindowIpc<
  Thread extends ThreadOpenMiniWindowThread = ThreadOpenMiniWindowThread,
  Message extends ChatMessage = ChatMessage,
  Store extends ThreadOpenMiniWindowStore<Thread, Message> = ThreadOpenMiniWindowStore<Thread, Message>,
  Host extends ThreadOpenMiniWindowHost<Store> = ThreadOpenMiniWindowHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForThreadAction,
  threadWorkingDirectory,
  openThreadMiniWindow,
}: RegisterThreadOpenMiniWindowIpcDependencies<Thread, Message, Store, Host>): void {
  handleIpc("thread:open-mini-window", async (_event, raw: ThreadActionInput) => {
    const input = threadActionSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    const thread = host.store.getThread(input.threadId);
    const snapshot = {
      thread,
      messages: host.store.listMessages(input.threadId),
      workingDirectory: threadWorkingDirectory(thread),
    };
    await openThreadMiniWindow(snapshot.thread, snapshot.messages, snapshot.workingDirectory);
  });
}

export function registerThreadExportChatIpc({
  handleIpc,
  exportChat,
}: RegisterThreadExportChatIpcDependencies): void {
  handleIpc("thread:export-chat", (_event, raw: unknown) => exportChat(exportChatSchema.parse(raw)));
}

export function registerThreadExportChatPdfIpc({
  handleIpc,
  exportChatPdf,
}: RegisterThreadExportChatPdfIpcDependencies): void {
  handleIpc("thread:export-chat-pdf", (_event, raw: unknown) => exportChatPdf(exportChatPdfSchema.parse(raw)));
}

export function registerThreadUpdateSettingsIpc<
  Thread extends ThreadUpdateSettingsThread = ThreadUpdateSettingsThread,
  Store extends ThreadUpdateSettingsStore<Thread> = ThreadUpdateSettingsStore<Thread>,
  Host extends ThreadUpdateSettingsHost<Store> = ThreadUpdateSettingsHost<Store>,
>({
  handleIpc,
  parseThreadSettingsUpdate,
  requireProjectRuntimeHostForThread,
}: RegisterThreadUpdateSettingsIpcDependencies<Thread, Store, Host>): void {
  handleIpc("thread:update-settings", async (_event, raw: UpdateThreadSettingsInput) => {
    const input = parseThreadSettingsUpdate(raw);
    const host = requireProjectRuntimeHostForThread(input.threadId);
    const thread = host.store.updateThreadSettings(input.threadId, input);
    if (input.model !== undefined) await host.runtime?.applyThreadModelSettings?.(input.threadId);
    if (typeof input.memoryEnabled === "boolean") host.runtime?.applyThreadMemorySettings(input.threadId);
    return thread;
  });
}

export function registerThreadPermissionModeChangeIpc<
  Thread extends ThreadPermissionModeThread = ThreadPermissionModeThread,
  Store extends ThreadPermissionModeStore<Thread> = ThreadPermissionModeStore<Thread>,
  Host extends ThreadPermissionModeHost<Store> = ThreadPermissionModeHost<Store>,
>({
  handleIpc,
  parseThreadPermissionModeChange,
  requireProjectRuntimeHostForThread,
  permissionModeChangeAuditDetail,
  emitPermissionAuditCreated,
}: RegisterThreadPermissionModeChangeIpcDependencies<Thread, Store, Host>): void {
  handleIpc("thread:request-permission-mode-change", (_event, raw: RequestThreadPermissionModeChangeInput) => {
    const input = parseThreadPermissionModeChange(raw);
    const host = requireProjectRuntimeHostForThread(input.threadId);
    const targetStore = host.store;
    const current = targetStore.getThread(input.threadId);
    if (current.permissionMode === input.permissionMode) return current;
    const thread = targetStore.updateThreadSettings(input.threadId, { permissionMode: input.permissionMode });
    const entry = targetStore.addPermissionAudit({
      threadId: input.threadId,
      permissionMode: input.permissionMode,
      toolName: "thread-permission-mode",
      risk: "permission-mode-change",
      decision: "allowed",
      detail: permissionModeChangeAuditDetail({
        previousPermissionMode: current.permissionMode,
        nextPermissionMode: input.permissionMode,
        reason: input.reason,
      }),
      reason: input.reason || "User changed thread permission mode through dedicated settings control.",
      decisionSource: "policy",
    });
    emitPermissionAuditCreated(entry, current.workspacePath);
    return thread;
  });
}

export function registerThreadGoalIpc<
  Store extends ThreadGoalStore = ThreadGoalStore,
  Runtime extends ThreadGoalRuntime = ThreadGoalRuntime,
  Host extends ThreadGoalHost<Store, Runtime> = ThreadGoalHost<Store, Runtime>,
>({
  handleIpc,
  requireProjectRuntimeHostForThread,
  emitProjectScopedEvent,
  emitProjectStateIfActive,
}: RegisterThreadGoalIpcDependencies<Store, Runtime, Host>): void {
  handleIpc("thread-goal:get", (_event, raw: ThreadGoalGetInput) => {
    const input = threadGoalGetSchema.parse(raw);
    return requireProjectRuntimeHostForThread(input.threadId).store.getThreadGoal(input.threadId);
  });

  handleIpc("thread-goal:set", (_event, raw: ThreadGoalSetInput) => {
    const input = threadGoalSetSchema.parse(raw);
    const host = requireProjectRuntimeHostForThread(input.threadId);
    const previousGoal = host.store.getThreadGoal(input.threadId);
    const goal = host.store.setThreadGoal(input);
    emitProjectScopedEvent(host, { type: "thread-goal-updated", goal });
    emitProjectStateIfActive(host, input.threadId);
    if (previousGoal && previousGoal.status !== "active" && goal.status === "active") {
      host.runtime.continueGoalIfIdle(input.threadId, goal.goalId);
    }
    return goal;
  });

  handleIpc("thread-goal:clear", (_event, raw: ThreadGoalClearInput) => {
    const input = threadGoalClearSchema.parse(raw);
    const host = requireProjectRuntimeHostForThread(input.threadId);
    const cleared = host.store.clearThreadGoal(input.threadId, input.expectedGoalId);
    emitProjectScopedEvent(host, { type: "thread-goal-cleared", threadId: input.threadId, goalId: cleared?.goalId });
    emitProjectStateIfActive(host, input.threadId);
  });
}
