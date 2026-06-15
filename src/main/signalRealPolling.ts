import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
} from "../shared/messagingGateway";
import {
  buildSignalRealUnreadWindowPreview,
  signalRealUnreadWindowInput,
  signalRealUnreadWindowPreviewText,
  type SignalRealUnreadWindowApplyResult,
  type SignalRealUnreadWindowInput,
  type SignalRealUnreadWindowPreview,
} from "./signalUnreadWindow";

const SIGNAL_PROVIDER_ID = "signal-cli";
const DEFAULT_POLLING_INTERVAL_MS = 60_000;
const MIN_POLLING_INTERVAL_MS = 30_000;
const MAX_POLLING_INTERVAL_MS = 300_000;

type PollTimerHandle = ReturnType<typeof setInterval> & { unref?: () => void };
type SchedulePollFn = (callback: () => void, intervalMs: number) => PollTimerHandle;
type ClearPollFn = (handle: PollTimerHandle) => void;
type SignalRealPollOnceFn = () => Promise<SignalRealUnreadWindowApplyResult>;

export type SignalRealPollingAction = "start" | "stop";
export type SignalRealPollingRunnerState = "stopped" | "starting" | "running" | "stopping" | "error";
export type SignalRealPollingApplyStatus = "applied" | "blocked" | "denied";

export interface SignalRealPollingControlInput extends SignalRealUnreadWindowInput {
  action: SignalRealPollingAction;
  intervalMs: number;
}

export interface SignalRealPollingBindingSummary {
  bindingId: string;
  profileId: string;
  conversationId: string;
  ownerUserId?: string;
  ambientSurface?: string;
  maxDisclosureLabel?: string;
  realSingleReadReady: boolean;
  blockers: string[];
}

export interface SignalRealPollingResultSummary {
  applyStatus: SignalRealUnreadWindowApplyResult["applyStatus"];
  polled: boolean;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  duplicateMessageCount: number;
  skippedMessageCount: number;
  acceptedDispatchCount: number;
  droppedDispatchCount: number;
  dispatches: Array<{
    messageId: string;
    accepted: boolean;
    queuedProjectionId?: string;
    projectionKind?: string;
    projectionTitle?: string;
    droppedReason?: string;
  }>;
}

export interface SignalRealPollingRuntimeStatus {
  providerId: "signal-cli";
  runnerState: SignalRealPollingRunnerState;
  running: boolean;
  backgroundLoopImplemented: true;
  timersActive: boolean;
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
  selectedBindingCount: number;
  realSingleReadReadyBindingCount: number;
  limit: number;
  intervalMs: number;
  startedAt?: string;
  stoppedAt?: string;
  totalPollCount: number;
  successfulPollCount: number;
  failedPollCount: number;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  acceptedDispatchCount: number;
  droppedDispatchCount: number;
  duplicateMessageCount: number;
  skippedMessageCount: number;
  lastPollStartedAt?: string;
  lastPollFinishedAt?: string;
  lastSuccessfulPollAt?: string;
  nextPollDueAt?: string;
  lastError?: string;
  lastResult?: SignalRealPollingResultSummary;
  selectedBindings: SignalRealPollingBindingSummary[];
  warnings: string[];
  boundaries: string[];
}

export interface SignalRealPollingControlPreview extends SignalRealPollingRuntimeStatus {
  action: SignalRealPollingAction;
  status: "ready" | "blocked";
  canApplyNow: boolean;
  previewOnly: true;
  approvalRequired: boolean;
  applyToolName: "ambient_messaging_signal_real_polling_apply";
  singleReadPreview?: SignalRealUnreadWindowPreview;
  blockers: string[];
  nextSteps: string[];
  safety: {
    requestsApproval: boolean;
    startsTimer: boolean;
    stopsTimer: boolean;
    contactsBridgeUnreadEndpoint: boolean;
    readsProviderUnreadMessages: boolean;
    routesRemoteAmbientSurface: boolean;
    writesDedupeState: boolean;
    sendsProviderMessages: false;
    mutatesBindings: false;
    usesReviewedSingleReadCore: true;
  };
}

export interface SignalRealPollingControlResult extends SignalRealPollingControlPreview {
  applyStatus: SignalRealPollingApplyStatus;
  approvalRecorded: boolean;
  startedTimer: boolean;
  stoppedTimer: boolean;
  immediatePollAttempted: boolean;
  immediatePollResult?: SignalRealUnreadWindowApplyResult;
}

export function signalRealPollingControlInput(params: unknown): SignalRealPollingControlInput {
  const raw = params as Record<string, unknown> | undefined;
  const base = signalRealUnreadWindowInput(raw);
  const actionRaw = optionalString(raw?.action)?.toLowerCase();
  const action: SignalRealPollingAction = actionRaw === "stop" ? "stop" : "start";
  return {
    ...base,
    action,
    intervalMs: boundedInteger(raw?.intervalMs, DEFAULT_POLLING_INTERVAL_MS, MIN_POLLING_INTERVAL_MS, MAX_POLLING_INTERVAL_MS),
  };
}

export function buildSignalRealPollingStatus(input: {
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  limit?: number;
  intervalMs?: number;
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
}): SignalRealPollingRuntimeStatus {
  const limit = boundedInteger(input.limit, 10, 1, 25);
  const intervalMs = boundedInteger(input.intervalMs, DEFAULT_POLLING_INTERVAL_MS, MIN_POLLING_INTERVAL_MS, MAX_POLLING_INTERVAL_MS);
  const selectedBindings = activeOwnerSignalBindings(input.bindings.bindings)
    .filter((binding) => input.bindingId ? binding.id === input.bindingId : true)
    .filter((binding) => input.profileId ? binding.authProfileId === input.profileId : true)
    .filter((binding) => input.conversationId ? binding.conversationId === input.conversationId : true)
    .map((binding) => signalPollingBindingSummary({
      binding,
      runtimeStatus: input.runtimeStatus,
      limit,
    }));
  return {
    providerId: SIGNAL_PROVIDER_ID,
    runnerState: "stopped",
    running: false,
    backgroundLoopImplemented: true,
    timersActive: false,
    ...(input.profileId ? { profileId: input.profileId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.bindingId ? { bindingId: input.bindingId } : {}),
    selectedBindingCount: selectedBindings.length,
    realSingleReadReadyBindingCount: selectedBindings.filter((binding) => binding.realSingleReadReady).length,
    limit,
    intervalMs,
    totalPollCount: 0,
    successfulPollCount: 0,
    failedPollCount: 0,
    fetchedMessageCount: 0,
    candidateMessageCount: 0,
    acceptedDispatchCount: 0,
    droppedDispatchCount: 0,
    duplicateMessageCount: 0,
    skippedMessageCount: 0,
    selectedBindings,
    warnings: selectedBindings.length
      ? ["Signal real polling is stopped. Start requires explicit approval for one exact active owner binding."]
      : ["No active owner Remote Ambient Surface Signal bindings match the polling scope."],
    boundaries: signalPollingBoundaries(),
  };
}

export function buildSignalRealPollingControlPreview(input: {
  toolInput: SignalRealPollingControlInput;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
}): SignalRealPollingControlPreview {
  return new SignalRealPollingRunner().preview(input);
}

export class SignalRealPollingRunner {
  private readonly now: () => Date;
  private readonly schedulePoll: SchedulePollFn;
  private readonly clearPoll: ClearPollFn;
  private timer: PollTimerHandle | undefined;
  private pollOnce: SignalRealPollOnceFn | undefined;
  private inFlight = false;
  private runtimeStatus: SignalRealPollingRuntimeStatus;

  constructor(options: {
    now?: () => Date;
    schedulePoll?: SchedulePollFn;
    clearPoll?: ClearPollFn;
  } = {}) {
    this.now = options.now ?? (() => new Date());
    this.schedulePoll = options.schedulePoll ?? ((callback, intervalMs) => {
      const handle = setInterval(callback, intervalMs) as PollTimerHandle;
      handle.unref?.();
      return handle;
    });
    this.clearPoll = options.clearPoll ?? ((handle) => clearInterval(handle));
    this.runtimeStatus = this.emptyStatus();
  }

  status(input?: {
    bindings: MessagingBindingListResult;
    runtimeStatus?: MessagingGatewayRuntimeStatus;
    limit?: number;
    intervalMs?: number;
  }): SignalRealPollingRuntimeStatus {
    const current = clonePollingRuntimeStatus(this.runtimeStatus);
    if (!input) return current;
    const scoped = buildSignalRealPollingStatus({
      bindings: input.bindings,
      runtimeStatus: input.runtimeStatus,
      limit: input.limit ?? current.limit,
      intervalMs: input.intervalMs ?? current.intervalMs,
      profileId: current.profileId,
      conversationId: current.conversationId,
      bindingId: current.bindingId,
    });
    return {
      ...current,
      selectedBindingCount: scoped.selectedBindingCount,
      realSingleReadReadyBindingCount: scoped.realSingleReadReadyBindingCount,
      selectedBindings: scoped.selectedBindings,
      timersActive: Boolean(this.timer),
      warnings: this.statusWarnings(scoped.selectedBindings),
      boundaries: signalPollingBoundaries(),
    };
  }

  preview(input: {
    toolInput: SignalRealPollingControlInput;
    bindings: MessagingBindingListResult;
    runtimeStatus?: MessagingGatewayRuntimeStatus;
  }): SignalRealPollingControlPreview {
    const status = this.status({
      bindings: input.bindings,
      runtimeStatus: input.runtimeStatus,
      limit: input.toolInput.limit,
      intervalMs: input.toolInput.intervalMs,
    });
    const scopedStatus = buildSignalRealPollingStatus({
      bindings: input.bindings,
      runtimeStatus: input.runtimeStatus,
      limit: input.toolInput.limit,
      intervalMs: input.toolInput.intervalMs,
      profileId: input.toolInput.profileId,
      conversationId: input.toolInput.conversationId,
      bindingId: input.toolInput.bindingId,
    });
    const singleReadPreview = input.toolInput.action === "start"
      ? buildSignalRealUnreadWindowPreview({
        toolInput: input.toolInput,
        bindings: input.bindings,
        runtimeStatus: input.runtimeStatus,
      })
      : undefined;
    const blockers: string[] = [];
    if (input.toolInput.action === "start") {
      if (this.runtimeStatus.running) {
        blockers.push("Signal real polling is already running. Stop it before changing scope or interval.");
      }
      if (!input.toolInput.bindingId) {
        blockers.push("Signal real polling requires an exact active bindingId before start can be approved.");
      }
      if (scopedStatus.selectedBindingCount !== 1) {
        blockers.push("Signal real polling start requires exactly one matching active owner Remote Ambient Surface binding.");
      }
      if (singleReadPreview) {
        blockers.push(...singleReadPreview.blockers.map((blocker) => `Single-read gate: ${blocker}`));
      }
    } else if (!this.runtimeStatus.running && !this.timer) {
      blockers.push("Signal real polling is not running.");
    }
    const canApplyNow = blockers.length === 0;
    return {
      ...status,
      ...(input.toolInput.profileId ? { profileId: input.toolInput.profileId } : status.profileId ? { profileId: status.profileId } : {}),
      ...(input.toolInput.conversationId ? { conversationId: input.toolInput.conversationId } : status.conversationId ? { conversationId: status.conversationId } : {}),
      ...(input.toolInput.bindingId ? { bindingId: input.toolInput.bindingId } : status.bindingId ? { bindingId: status.bindingId } : {}),
      action: input.toolInput.action,
      status: canApplyNow ? "ready" : "blocked",
      canApplyNow,
      previewOnly: true,
      approvalRequired: input.toolInput.action === "start" && canApplyNow,
      applyToolName: "ambient_messaging_signal_real_polling_apply",
      ...(singleReadPreview ? { singleReadPreview } : {}),
      selectedBindingCount: scopedStatus.selectedBindingCount,
      realSingleReadReadyBindingCount: scopedStatus.realSingleReadReadyBindingCount,
      selectedBindings: scopedStatus.selectedBindings,
      limit: input.toolInput.limit,
      intervalMs: input.toolInput.intervalMs,
      blockers,
      nextSteps: canApplyNow
        ? input.toolInput.action === "start"
          ? [
            "Ask the user to approve starting Signal polling for this exact binding.",
            "Apply performs one immediate approved poll, then schedules future polls through the same reviewed single-read core.",
            "Inspect status after apply for counters, last result, and next due time.",
          ]
          : [
            "Stop the Signal polling timer.",
            "Inspect status to verify no timer remains active.",
          ]
        : [
          input.toolInput.action === "start"
            ? "Satisfy the exact binding and real single-read readiness gates before starting Signal polling."
            : "Signal polling is already stopped; no timer needs to be stopped.",
        ],
      safety: {
        requestsApproval: input.toolInput.action === "start" && canApplyNow,
        startsTimer: input.toolInput.action === "start" && canApplyNow,
        stopsTimer: input.toolInput.action === "stop" && canApplyNow,
        contactsBridgeUnreadEndpoint: input.toolInput.action === "start" && canApplyNow,
        readsProviderUnreadMessages: input.toolInput.action === "start" && canApplyNow,
        routesRemoteAmbientSurface: input.toolInput.action === "start" && canApplyNow,
        writesDedupeState: input.toolInput.action === "start" && canApplyNow,
        sendsProviderMessages: false,
        mutatesBindings: false,
        usesReviewedSingleReadCore: true,
      },
    };
  }

  async apply(input: {
    preview: SignalRealPollingControlPreview;
    approvalRecorded?: boolean;
    pollOnce: SignalRealPollOnceFn;
  }): Promise<SignalRealPollingControlResult> {
    if (!input.preview.canApplyNow) {
      return this.controlResult(input.preview, "blocked", input.approvalRecorded === true, false, false, false);
    }
    if (input.preview.approvalRequired && input.approvalRecorded !== true) {
      return this.controlResult(input.preview, "denied", false, false, false, false);
    }
    if (input.preview.action === "stop") {
      const wasRunning = this.runtimeStatus.running || Boolean(this.timer);
      this.runtimeStatus = {
        ...this.runtimeStatus,
        runnerState: "stopping",
        running: false,
      };
      this.stopTimer();
      this.runtimeStatus = {
        ...this.runtimeStatus,
        runnerState: "stopped",
        running: false,
        timersActive: false,
        stoppedAt: this.now().toISOString(),
        nextPollDueAt: undefined,
        lastError: undefined,
      };
      return this.controlResult(input.preview, "applied", input.approvalRecorded === true, false, wasRunning, false);
    }

    this.stopTimer();
    this.pollOnce = input.pollOnce;
    this.runtimeStatus = {
      ...this.emptyStatus(),
      runnerState: "starting",
      running: false,
      ...(input.preview.profileId ? { profileId: input.preview.profileId } : {}),
      ...(input.preview.conversationId ? { conversationId: input.preview.conversationId } : {}),
      ...(input.preview.bindingId ? { bindingId: input.preview.bindingId } : {}),
      limit: input.preview.limit,
      intervalMs: input.preview.intervalMs,
      startedAt: this.now().toISOString(),
      selectedBindingCount: input.preview.selectedBindingCount,
      realSingleReadReadyBindingCount: input.preview.realSingleReadReadyBindingCount,
      selectedBindings: input.preview.selectedBindings,
    };

    try {
      const immediatePollResult = await this.runPoll(input.pollOnce);
      if (immediatePollResult.applyStatus !== "applied") {
        this.stopTimer();
        this.runtimeStatus = {
          ...this.runtimeStatus,
          runnerState: "error",
          running: false,
          timersActive: false,
          lastError: immediatePollResult.failureHint ?? immediatePollResult.error ?? `Immediate poll returned ${immediatePollResult.applyStatus}.`,
          nextPollDueAt: undefined,
        };
        return {
          ...this.controlResult(input.preview, "blocked", true, false, false, true),
          immediatePollResult,
        };
      }
      this.runtimeStatus = {
        ...this.runtimeStatus,
        runnerState: "running",
        running: true,
        timersActive: true,
        nextPollDueAt: new Date(this.now().getTime() + input.preview.intervalMs).toISOString(),
      };
      this.timer = this.schedulePoll(() => {
        void this.runScheduledPoll();
      }, input.preview.intervalMs);
      this.timer.unref?.();
      return {
        ...this.controlResult(input.preview, "applied", true, true, false, true),
        immediatePollResult,
      };
    } catch (error) {
      this.stopTimer();
      this.runtimeStatus = {
        ...this.runtimeStatus,
        runnerState: "error",
        running: false,
        timersActive: false,
        failedPollCount: this.runtimeStatus.failedPollCount + 1,
        lastPollFinishedAt: this.now().toISOString(),
        lastError: errorMessage(error),
        nextPollDueAt: undefined,
      };
      return this.controlResult(input.preview, "blocked", true, false, false, true);
    }
  }

  async runScheduledPoll(): Promise<SignalRealUnreadWindowApplyResult | undefined> {
    if (!this.pollOnce || !this.runtimeStatus.running) return undefined;
    if (this.inFlight) {
      this.runtimeStatus = {
        ...this.runtimeStatus,
        lastError: "Previous Signal real poll is still in flight; skipped this tick.",
      };
      return undefined;
    }
    try {
      return await this.runPoll(this.pollOnce);
    } catch {
      return undefined;
    }
  }

  private async runPoll(pollOnce: SignalRealPollOnceFn): Promise<SignalRealUnreadWindowApplyResult> {
    this.inFlight = true;
    this.runtimeStatus = {
      ...this.runtimeStatus,
      lastPollStartedAt: this.now().toISOString(),
    };
    try {
      const result = await pollOnce();
      const finishedAt = this.now().toISOString();
      const successful = result.applyStatus === "applied";
      this.runtimeStatus = {
        ...this.runtimeStatus,
        lastPollFinishedAt: finishedAt,
        ...(successful ? { lastSuccessfulPollAt: finishedAt } : {}),
        nextPollDueAt: this.runtimeStatus.running
          ? new Date(this.now().getTime() + this.runtimeStatus.intervalMs).toISOString()
          : this.runtimeStatus.nextPollDueAt,
        lastError: successful ? undefined : result.failureHint ?? result.error ?? `Poll returned ${result.applyStatus}.`,
        totalPollCount: this.runtimeStatus.totalPollCount + 1,
        successfulPollCount: this.runtimeStatus.successfulPollCount + (successful ? 1 : 0),
        failedPollCount: this.runtimeStatus.failedPollCount + (successful ? 0 : 1),
        fetchedMessageCount: this.runtimeStatus.fetchedMessageCount + result.fetchedMessageCount,
        candidateMessageCount: this.runtimeStatus.candidateMessageCount + result.candidateMessageCount,
        duplicateMessageCount: this.runtimeStatus.duplicateMessageCount + result.duplicateMessageCount,
        skippedMessageCount: this.runtimeStatus.skippedMessageCount + result.skippedMessageCount,
        acceptedDispatchCount: this.runtimeStatus.acceptedDispatchCount + result.acceptedDispatchCount,
        droppedDispatchCount: this.runtimeStatus.droppedDispatchCount + result.droppedDispatchCount,
        lastResult: summarizeSignalPollResult(result),
      };
      return result;
    } catch (error) {
      this.runtimeStatus = {
        ...this.runtimeStatus,
        lastPollFinishedAt: this.now().toISOString(),
        nextPollDueAt: this.runtimeStatus.running
          ? new Date(this.now().getTime() + this.runtimeStatus.intervalMs).toISOString()
          : this.runtimeStatus.nextPollDueAt,
        lastError: errorMessage(error),
        totalPollCount: this.runtimeStatus.totalPollCount + 1,
        failedPollCount: this.runtimeStatus.failedPollCount + 1,
      };
      throw error;
    } finally {
      this.inFlight = false;
    }
  }

  private stopTimer(): void {
    if (this.timer) {
      this.clearPoll(this.timer);
      this.timer = undefined;
    }
    this.pollOnce = undefined;
  }

  private controlResult(
    preview: SignalRealPollingControlPreview,
    applyStatus: SignalRealPollingApplyStatus,
    approvalRecorded: boolean,
    startedTimer: boolean,
    stoppedTimer: boolean,
    immediatePollAttempted: boolean,
  ): SignalRealPollingControlResult {
    const status = this.status();
    return {
      ...preview,
      ...status,
      action: preview.action,
      status: preview.status,
      canApplyNow: preview.canApplyNow,
      previewOnly: true,
      approvalRequired: preview.approvalRequired,
      applyToolName: preview.applyToolName,
      ...(preview.singleReadPreview ? { singleReadPreview: preview.singleReadPreview } : {}),
      blockers: preview.blockers,
      nextSteps: preview.nextSteps,
      safety: preview.safety,
      applyStatus,
      approvalRecorded,
      startedTimer,
      stoppedTimer,
      immediatePollAttempted,
    };
  }

  private emptyStatus(): SignalRealPollingRuntimeStatus {
    return {
      providerId: SIGNAL_PROVIDER_ID,
      runnerState: "stopped",
      running: false,
      backgroundLoopImplemented: true,
      timersActive: false,
      selectedBindingCount: 0,
      realSingleReadReadyBindingCount: 0,
      limit: 10,
      intervalMs: DEFAULT_POLLING_INTERVAL_MS,
      totalPollCount: 0,
      successfulPollCount: 0,
      failedPollCount: 0,
      fetchedMessageCount: 0,
      candidateMessageCount: 0,
      acceptedDispatchCount: 0,
      droppedDispatchCount: 0,
      duplicateMessageCount: 0,
      skippedMessageCount: 0,
      selectedBindings: [],
      warnings: ["Signal real polling is stopped."],
      boundaries: signalPollingBoundaries(),
    };
  }

  private statusWarnings(bindings: SignalRealPollingBindingSummary[]): string[] {
    if (this.runtimeStatus.runnerState === "running") {
      return ["Signal real polling is running for the exact approved binding scope."];
    }
    if (this.runtimeStatus.runnerState === "error") {
      return [
        "Signal real polling stopped in an error state.",
        ...(this.runtimeStatus.lastError ? [this.runtimeStatus.lastError] : []),
      ];
    }
    if (!bindings.length) return ["No active owner Remote Ambient Surface Signal bindings match the polling scope."];
    return ["Signal real polling is stopped. Start requires explicit approval for one exact active owner binding."];
  }
}

export function signalRealPollingBlockedResult(preview: SignalRealPollingControlPreview): SignalRealPollingControlResult {
  return {
    ...preview,
    applyStatus: "blocked",
    approvalRecorded: false,
    startedTimer: false,
    stoppedTimer: false,
    immediatePollAttempted: false,
  };
}

export function signalRealPollingDeniedResult(preview: SignalRealPollingControlPreview): SignalRealPollingControlResult {
  return {
    ...signalRealPollingBlockedResult(preview),
    applyStatus: "denied",
  };
}

export function signalRealPollingApprovalDetail(preview: SignalRealPollingControlPreview): string {
  return [
    `Provider: ${preview.providerId}`,
    `Action: ${preview.action}`,
    `Binding: ${preview.bindingId ?? "missing"}`,
    `Profile: ${preview.profileId ?? "missing"}`,
    `Conversation: ${preview.conversationId ?? "missing"}`,
    `Interval: ${preview.intervalMs}ms`,
    `Limit per poll: ${preview.limit}`,
    `Selected bindings: ${preview.selectedBindingCount}`,
    `Would start timer: ${preview.safety.startsTimer ? "yes" : "no"}`,
    `Would stop timer: ${preview.safety.stopsTimer ? "yes" : "no"}`,
    `Would perform one immediate poll: ${preview.safety.startsTimer ? "yes" : "no"}`,
    `Would contact Signal bridge unread endpoint: ${preview.safety.contactsBridgeUnreadEndpoint ? "yes" : "no"}`,
    `Would read provider unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `Would route Remote Ambient Surface: ${preview.safety.routesRemoteAmbientSurface ? "yes" : "no"}`,
    `Would write dedupe state: ${preview.safety.writesDedupeState ? "yes" : "no"}`,
    `Would send Signal messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    "Provider message bodies are not returned to Pi; only sanitized dispatch metadata is returned.",
    ...preview.boundaries,
  ].join("\n");
}

export function signalRealPollingStatusText(status: SignalRealPollingRuntimeStatus): string {
  const lines = [
    "Signal real polling runner status",
    `Provider: ${status.providerId}`,
    `State: ${status.runnerState}`,
    `Running: ${status.running ? "yes" : "no"}`,
    `Background loop implemented: ${status.backgroundLoopImplemented ? "yes" : "no"}`,
    `Timers active: ${status.timersActive ? "yes" : "no"}`,
    status.profileId ? `Profile: ${status.profileId}` : undefined,
    status.conversationId ? `Conversation: ${status.conversationId}` : undefined,
    status.bindingId ? `Binding: ${status.bindingId}` : undefined,
    `Selected bindings: ${status.selectedBindingCount}`,
    `Real single-read ready bindings: ${status.realSingleReadReadyBindingCount}`,
    `Limit per binding: ${status.limit}`,
    `Interval: ${status.intervalMs}ms`,
    status.startedAt ? `Started: ${status.startedAt}` : undefined,
    status.stoppedAt ? `Stopped: ${status.stoppedAt}` : undefined,
    status.lastPollStartedAt ? `Last poll started: ${status.lastPollStartedAt}` : undefined,
    status.lastPollFinishedAt ? `Last poll finished: ${status.lastPollFinishedAt}` : undefined,
    status.lastSuccessfulPollAt ? `Last successful poll: ${status.lastSuccessfulPollAt}` : undefined,
    status.nextPollDueAt ? `Next poll due: ${status.nextPollDueAt}` : undefined,
    status.lastError ? `Last error: ${status.lastError}` : undefined,
    "",
    "Counters:",
    `- Total polls: ${status.totalPollCount}`,
    `- Successful polls: ${status.successfulPollCount}`,
    `- Failed polls: ${status.failedPollCount}`,
    `- Fetched messages: ${status.fetchedMessageCount}`,
    `- Candidate messages: ${status.candidateMessageCount}`,
    `- Accepted dispatches: ${status.acceptedDispatchCount}`,
    `- Dropped dispatches: ${status.droppedDispatchCount}`,
    `- Duplicate messages: ${status.duplicateMessageCount}`,
    `- Skipped messages: ${status.skippedMessageCount}`,
  ].filter((line): line is string => line !== undefined);
  if (status.lastResult) {
    lines.push("", "Last result:");
    lines.push(`- Apply status: ${status.lastResult.applyStatus}`);
    lines.push(`- Polled: ${status.lastResult.polled ? "yes" : "no"}`);
    lines.push(`- Accepted dispatches: ${status.lastResult.acceptedDispatchCount}`);
    lines.push(`- Dropped dispatches: ${status.lastResult.droppedDispatchCount}`);
    lines.push(`- Duplicates: ${status.lastResult.duplicateMessageCount}`);
  }
  appendPollingBindings(lines, status.selectedBindings);
  lines.push("", "Boundaries:");
  for (const boundary of status.boundaries) lines.push(`- ${boundary}`);
  lines.push("", "Warnings:");
  for (const warning of status.warnings) lines.push(`- ${warning}`);
  return lines.join("\n");
}

export function signalRealPollingControlPreviewText(preview: SignalRealPollingControlPreview): string {
  return signalRealPollingControlTextBase(preview, `Signal real polling ${preview.action} preview`);
}

export function signalRealPollingControlResultText(result: SignalRealPollingControlResult): string {
  const lines = [
    signalRealPollingControlTextBase(result, `Signal real polling ${result.action} apply`),
    "",
    "Apply result:",
    `- Apply status: ${result.applyStatus}`,
    `- Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `- Started timer: ${result.startedTimer ? "yes" : "no"}`,
    `- Stopped timer: ${result.stoppedTimer ? "yes" : "no"}`,
    `- Immediate poll attempted: ${result.immediatePollAttempted ? "yes" : "no"}`,
    "",
    signalRealPollingStatusText(result),
  ];
  if (result.immediatePollResult) {
    lines.push(
      "",
      "Immediate poll:",
      `- Apply status: ${result.immediatePollResult.applyStatus}`,
      `- Polled: ${result.immediatePollResult.polled ? "yes" : "no"}`,
      `- Fetched messages: ${result.immediatePollResult.fetchedMessageCount}`,
      `- Candidate messages: ${result.immediatePollResult.candidateMessageCount}`,
      `- Accepted dispatches: ${result.immediatePollResult.acceptedDispatchCount}`,
      `- Dropped dispatches: ${result.immediatePollResult.droppedDispatchCount}`,
      `- Duplicate messages: ${result.immediatePollResult.duplicateMessageCount}`,
      `- Skipped messages: ${result.immediatePollResult.skippedMessageCount}`,
    );
  }
  return lines.join("\n");
}

function signalRealPollingControlTextBase(
  preview: SignalRealPollingControlPreview,
  title: string,
): string {
  const lines = [
    title,
    `Provider: ${preview.providerId}`,
    `Action: ${preview.action}`,
    `Status: ${preview.status}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Preview only: ${preview.previewOnly ? "yes" : "no"}`,
    `Approval required before apply: ${preview.approvalRequired ? "yes" : "no"}`,
    `Apply tool: ${preview.applyToolName}`,
    `Background loop implemented: ${preview.backgroundLoopImplemented ? "yes" : "no"}`,
    `Starts timer: ${preview.safety.startsTimer ? "yes" : "no"}`,
    `Stops timer: ${preview.safety.stopsTimer ? "yes" : "no"}`,
    `Reads provider unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `Contacts bridge unread endpoint: ${preview.safety.contactsBridgeUnreadEndpoint ? "yes" : "no"}`,
    `Sends provider messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    `Uses reviewed single-read core: ${preview.safety.usesReviewedSingleReadCore ? "yes" : "no"}`,
    `Limit per binding: ${preview.limit}`,
    `Interval: ${preview.intervalMs}ms`,
  ];
  appendPollingBindings(lines, preview.selectedBindings);
  lines.push("", "Blockers:");
  for (const blocker of preview.blockers) lines.push(`- ${blocker}`);
  lines.push("", "Next steps:");
  for (const step of preview.nextSteps) lines.push(`- ${step}`);
  lines.push("", "Boundaries:");
  for (const boundary of preview.boundaries) lines.push(`- ${boundary}`);
  if (preview.singleReadPreview) {
    lines.push("", "Single-read readiness:", signalRealUnreadWindowPreviewText(preview.singleReadPreview));
  }
  return lines.join("\n");
}

function signalPollingBindingSummary(input: {
  binding: MessagingBindingDescriptor;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  limit: number;
}): SignalRealPollingBindingSummary {
  const singleReadPreview = buildSignalRealUnreadWindowPreview({
    toolInput: {
      providerId: SIGNAL_PROVIDER_ID,
      profileId: input.binding.authProfileId,
      conversationId: input.binding.conversationId,
      bindingId: input.binding.id,
      limit: input.limit,
    },
    bindings: {
      bindings: [input.binding],
      bindingCount: 1,
      activeBindingCount: input.binding.status === "active" ? 1 : 0,
      remoteAmbientSurfaceCount: input.binding.purpose === "remote_ambient_surface" ? 1 : 0,
      messagingConnectorCount: input.binding.purpose === "messaging_connector" ? 1 : 0,
      headlessSafeBindingCount: input.binding.headlessSafe ? 1 : 0,
    },
    runtimeStatus: input.runtimeStatus,
  });
  return {
    bindingId: input.binding.id,
    profileId: input.binding.authProfileId,
    conversationId: input.binding.conversationId,
    ...(input.binding.ownerUserId ? { ownerUserId: input.binding.ownerUserId } : {}),
    ...(input.binding.ambientSurface ? { ambientSurface: input.binding.ambientSurface } : {}),
    ...(input.binding.maxDisclosureLabel ? { maxDisclosureLabel: input.binding.maxDisclosureLabel } : {}),
    realSingleReadReady: singleReadPreview.canApplyNow,
    blockers: singleReadPreview.blockers,
  };
}

function appendPollingBindings(lines: string[], bindings: SignalRealPollingBindingSummary[]): void {
  lines.push("", "Selected bindings:");
  if (!bindings.length) {
    lines.push("- None");
    return;
  }
  for (const binding of bindings) {
    lines.push(`- ${binding.bindingId}`);
    lines.push(`  Profile: ${binding.profileId}`);
    lines.push(`  Conversation: ${binding.conversationId}`);
    if (binding.ownerUserId) lines.push(`  Owner: ${binding.ownerUserId}`);
    if (binding.ambientSurface) lines.push(`  Surface: ${binding.ambientSurface}`);
    lines.push(`  Real single-read ready: ${binding.realSingleReadReady ? "yes" : "no"}`);
    for (const blocker of binding.blockers) lines.push(`  Blocker: ${blocker}`);
  }
}

function activeOwnerSignalBindings(bindings: MessagingBindingDescriptor[]): MessagingBindingDescriptor[] {
  return bindings.filter((binding) =>
    binding.status === "active" &&
    binding.providerId === SIGNAL_PROVIDER_ID &&
    binding.purpose === "remote_ambient_surface" &&
    Boolean(binding.ownerUserId?.trim())
  );
}

function signalPollingBoundaries(): string[] {
  return [
    "Signal polling reuses only the reviewed real Signal single-read adapter for each poll.",
    "Polling is scoped to one exact active owner Remote Ambient Surface binding.",
    "Polling does not read broad Signal history, inspect Signal Desktop, run signal-cli directly, or use shell/browser/provider CLI fallbacks.",
    "Polling writes dedupe state through the single-read core before repeated reads are scheduled.",
    "Polling does not send Signal messages; outbound replies require a separate reviewed contract.",
  ];
}

function summarizeSignalPollResult(result: SignalRealUnreadWindowApplyResult): SignalRealPollingResultSummary {
  return {
    applyStatus: result.applyStatus,
    polled: result.polled,
    fetchedMessageCount: result.fetchedMessageCount,
    candidateMessageCount: result.candidateMessageCount,
    duplicateMessageCount: result.duplicateMessageCount,
    skippedMessageCount: result.skippedMessageCount,
    acceptedDispatchCount: result.acceptedDispatchCount,
    droppedDispatchCount: result.droppedDispatchCount,
    dispatches: result.dispatches.slice(0, 10).map((dispatch) => ({
      messageId: dispatch.messageId,
      accepted: dispatch.accepted,
      ...(dispatch.queuedProjectionId ? { queuedProjectionId: dispatch.queuedProjectionId } : {}),
      ...(dispatch.projectionKind ? { projectionKind: dispatch.projectionKind } : {}),
      ...(dispatch.projectionTitle ? { projectionTitle: dispatch.projectionTitle } : {}),
      ...(dispatch.droppedReason ? { droppedReason: dispatch.droppedReason } : {}),
    })),
  };
}

function clonePollingRuntimeStatus(status: SignalRealPollingRuntimeStatus): SignalRealPollingRuntimeStatus {
  return {
    ...status,
    selectedBindings: status.selectedBindings.map((binding) => ({
      ...binding,
      blockers: [...binding.blockers],
    })),
    warnings: [...status.warnings],
    boundaries: [...status.boundaries],
    ...(status.lastResult ? {
      lastResult: {
        ...status.lastResult,
        dispatches: status.lastResult.dispatches.map((dispatch) => ({ ...dispatch })),
      },
    } : {}),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
