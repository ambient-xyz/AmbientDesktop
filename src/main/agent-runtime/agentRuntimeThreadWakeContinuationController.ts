import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  ScheduleThreadWakeContinuationInput,
  ThreadWakeContinuation,
} from "../projectStore/threadWakeRepository";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";

export type ThreadWakeContinuationSendInput = SendMessageInput & {
  internal?: true;
  modelContentOverride?: string;
  visibleUserContent?: string;
  hiddenUserMessage?: true;
};

export interface AgentRuntimeThreadWakeContinuationControllerOptions {
  store: Pick<
    ProjectStore,
    | "getThread"
    | "listPendingThreadWakeContinuations"
    | "markThreadWakeContinuationDelivered"
    | "markThreadWakeContinuationFailed"
    | "scheduleThreadWakeContinuation"
  >;
  hasActiveRun: (threadId: string) => boolean;
  send: (input: ThreadWakeContinuationSendInput) => Promise<void>;
  emit: (event: DesktopEvent) => void;
  asyncBashSnapshotText?: (threadId: string, jobId: string) => string | undefined;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  now?: () => number;
}

const MAX_TIMEOUT_DELAY_MS = 2_147_000_000;
const ACTIVE_RUN_RETRY_MS = 2000;

export class AgentRuntimeThreadWakeContinuationController {
  private readonly timers = new Map<string, unknown>();
  private readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimeout: (handle: unknown) => void;
  private readonly now: () => number;

  constructor(private readonly options: AgentRuntimeThreadWakeContinuationControllerOptions) {
    this.setTimeout = options.setTimeout ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this.clearTimeout = options.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle as NodeJS.Timeout));
    this.now = options.now ?? (() => Date.now());
    this.reconcilePendingWakeContinuations();
  }

  schedule(input: ScheduleThreadWakeContinuationInput): ThreadWakeContinuation {
    const wake = this.options.store.scheduleThreadWakeContinuation(input);
    this.scheduleTimer(wake);
    this.emitThreadUpdated(wake.threadId);
    return wake;
  }

  reconcilePendingWakeContinuations(): void {
    for (const wake of this.options.store.listPendingThreadWakeContinuations()) {
      this.scheduleTimer(wake);
    }
  }

  private scheduleTimer(wake: ThreadWakeContinuation, delayOverrideMs?: number): void {
    const existing = this.timers.get(wake.id);
    if (existing) this.clearTimeout(existing);
    const dueMs = Date.parse(wake.dueAt);
    const delayMs = delayOverrideMs ?? Math.max(0, dueMs - this.now());
    const handle = this.setTimeout(() => {
      this.timers.delete(wake.id);
      void this.deliverWakeIfIdle(wake).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.options.store.markThreadWakeContinuationFailed(wake.id, message);
        this.emitThreadUpdated(wake.threadId);
        this.options.emit({ type: "error", message: `Thread wake continuation failed: ${message}`, threadId: wake.threadId });
      });
    }, Math.min(delayMs, MAX_TIMEOUT_DELAY_MS));
    this.timers.set(wake.id, handle);
  }

  private async deliverWakeIfIdle(wake: ThreadWakeContinuation): Promise<void> {
    const dueMs = Date.parse(wake.dueAt);
    if (dueMs > this.now()) {
      this.scheduleTimer(wake);
      return;
    }
    if (this.options.hasActiveRun(wake.threadId)) {
      this.scheduleTimer(wake, ACTIVE_RUN_RETRY_MS);
      return;
    }

    let thread: ThreadSummary;
    try {
      thread = this.options.store.getThread(wake.threadId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.store.markThreadWakeContinuationFailed(wake.id, message);
      this.emitThreadUpdated(wake.threadId);
      return;
    }

    const prompt = threadWakeContinuationPrompt(wake, {
      thread,
      asyncBashSnapshotText: wake.jobId ? this.options.asyncBashSnapshotText?.(wake.threadId, wake.jobId) : undefined,
    });
    await this.options.send({
      threadId: wake.threadId,
      content: prompt,
      visibleUserContent: `Continuing scheduled check-in: ${wake.reason}`,
      modelContentOverride: prompt,
      hiddenUserMessage: true,
      permissionMode: thread.permissionMode,
      collaborationMode: thread.collaborationMode === "planner" ? "agent" : thread.collaborationMode,
      model: thread.model,
      thinkingLevel: thread.thinkingLevel,
      delivery: "follow-up",
      preserveActiveThread: true,
      internal: true,
    });
    this.options.store.markThreadWakeContinuationDelivered(wake.id);
    this.emitThreadUpdated(wake.threadId);
  }

  private emitThreadUpdated(threadId: string): void {
    try {
      this.options.emit({ type: "thread-updated", thread: this.options.store.getThread(threadId) });
    } catch {
      // Missing threads are handled by the delivery path and should not mask wake lifecycle updates.
    }
  }
}

function threadWakeContinuationPrompt(
  wake: ThreadWakeContinuation,
  context: { thread: ThreadSummary; asyncBashSnapshotText?: string },
): string {
  return [
    "Ambient scheduled this thread to wake and continue.",
    "",
    `wake_id: ${wake.id}`,
    `due_at: ${wake.dueAt}`,
    `reason: ${wake.reason}`,
    wake.jobId ? `job_id: ${wake.jobId}` : undefined,
    wake.payload ? `payload_json: ${JSON.stringify(wake.payload)}` : undefined,
    "",
    context.asyncBashSnapshotText
      ? ["Latest async bash snapshot:", context.asyncBashSnapshotText].join("\n")
      : wake.jobId
        ? "Latest async bash snapshot: unavailable in this process. Treat the job as orphaned unless bash_poll can still find it, and report the limitation clearly."
        : undefined,
    "",
    "Continue from the thread context. If this is for an async bash job, call bash_poll with wait_ms 0 to inspect current status, report meaningful progress, and schedule another thread_wake_schedule only if the job still needs a later check-in.",
  ].filter((line): line is string => line !== undefined).join("\n");
}
