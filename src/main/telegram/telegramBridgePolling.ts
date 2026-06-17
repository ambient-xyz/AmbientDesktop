import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
  MessagingInboundEvent,
  RuntimeSurfaceSnapshot,
} from "../../shared/messagingGateway";
import type { MessagingGatewayInboundDispatchResult } from "../messaging/messagingGatewayRunner";
import { messagingInboundEventFromTelegramBridge } from "./telegramBridgeEvents";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";
const DEFAULT_BRIDGE_PORT = "8091";
const MAX_POLL_LIMIT = 25;
const MAX_SEEN_IDS = 500;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const MIN_POLL_INTERVAL_MS = 5_000;
const MAX_POLL_INTERVAL_MS = 5 * 60_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;
type PollTimerHandle = ReturnType<typeof setInterval> & { unref?: () => void };
type SchedulePollFn = (callback: () => void, intervalMs: number) => PollTimerHandle;
type ClearPollFn = (handle: PollTimerHandle) => void;

export interface TelegramBridgePollToolInput {
  profileId?: string;
  bindingId?: string;
  limit: number;
  minReceivedAt?: string;
}

export type TelegramBridgePollingAction = "start" | "stop";

export interface TelegramBridgePollingControlInput extends TelegramBridgePollToolInput {
  action: TelegramBridgePollingAction;
  intervalMs: number;
}

export interface TelegramBridgePollPlan {
  providerId: "telegram-tdlib";
  status: "ready" | "blocked";
  canApplyNow: boolean;
  limit: number;
  minReceivedAt?: string;
  statePath: string;
  selectedBindings: TelegramBridgePollBindingSummary[];
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    readsProviderUnreadMessages: boolean;
    resolvesSenderProfiles: boolean;
    writesDedupeState: boolean;
    startsBridge: false;
    sendsProviderMessages: false;
  };
}

export interface TelegramBridgePollBindingSummary {
  bindingId: string;
  authProfileId: string;
  conversationId: string;
  ownerUserId: string;
  ambientSurface?: string;
  maxDisclosureLabel?: string;
}

export interface TelegramBridgePollResult extends TelegramBridgePollPlan {
  applyStatus: "applied" | "blocked" | "denied";
  approvalRecorded: boolean;
  polled: boolean;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  duplicateMessageCount: number;
  staleMessageCount: number;
  skippedMessageCount: number;
  acceptedDispatchCount: number;
  droppedDispatchCount: number;
  bindingResults: TelegramBridgePollBindingResult[];
}

export interface TelegramBridgePollBindingResult {
  bindingId: string;
  authProfileId: string;
  conversationId: string;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  duplicateMessageCount: number;
  staleMessageCount: number;
  skippedMessageCount: number;
  acceptedDispatchCount: number;
  droppedDispatchCount: number;
  dispatches: MessagingGatewayInboundDispatchResult[];
}

export type TelegramBridgePollingRunnerState = "stopped" | "starting" | "running" | "stopping" | "error";

export interface TelegramBridgePollingRuntimeStatus {
  providerId: "telegram-tdlib";
  state: TelegramBridgePollingRunnerState;
  running: boolean;
  profileId?: string;
  bindingId?: string;
  limit: number;
  intervalMs: number;
  minReceivedAt?: string;
  statePath?: string;
  selectedBindingCount: number;
  startedAt?: string;
  stoppedAt?: string;
  lastPollStartedAt?: string;
  lastPollFinishedAt?: string;
  lastSuccessfulPollAt?: string;
  nextPollDueAt?: string;
  lastError?: string;
  totalPollCount: number;
  successfulPollCount: number;
  failedPollCount: number;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  duplicateMessageCount: number;
  staleMessageCount: number;
  skippedMessageCount: number;
  acceptedDispatchCount: number;
  droppedDispatchCount: number;
  lastResult?: TelegramBridgePollResultSummary;
}

export interface TelegramBridgePollResultSummary {
  applyStatus: TelegramBridgePollResult["applyStatus"];
  polled: boolean;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  duplicateMessageCount: number;
  staleMessageCount: number;
  skippedMessageCount: number;
  acceptedDispatchCount: number;
  droppedDispatchCount: number;
  bindingResults: Array<{
    bindingId: string;
    authProfileId: string;
    conversationId: string;
    fetchedMessageCount: number;
    candidateMessageCount: number;
    duplicateMessageCount: number;
    staleMessageCount: number;
    skippedMessageCount: number;
    acceptedDispatchCount: number;
    droppedDispatchCount: number;
  }>;
}

export interface TelegramBridgePollingControlPreview {
  providerId: "telegram-tdlib";
  action: TelegramBridgePollingAction;
  status: "ready" | "blocked";
  canApplyNow: boolean;
  approvalRequired: boolean;
  intervalMs: number;
  limit: number;
  minReceivedAt?: string;
  profileId?: string;
  bindingId?: string;
  statePath: string;
  selectedBindings: TelegramBridgePollBindingSummary[];
  runtimeStatus: TelegramBridgePollingRuntimeStatus;
  pollPlan: TelegramBridgePollPlan;
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    startsTimer: boolean;
    stopsTimer: boolean;
    readsProviderUnreadMessages: boolean;
    resolvesSenderProfiles: boolean;
    writesDedupeState: boolean;
    startsBridge: false;
    sendsProviderMessages: false;
  };
}

export interface TelegramBridgePollingControlResult extends TelegramBridgePollingControlPreview {
  applyStatus: "applied" | "blocked" | "denied";
  approvalRecorded: boolean;
  runtimeStatus: TelegramBridgePollingRuntimeStatus;
  immediatePollResult?: TelegramBridgePollResult;
}

interface TelegramBridgePollState {
  version: 1;
  bindings: Record<string, TelegramBridgePollBindingState>;
}

interface TelegramBridgePollBindingState {
  seenMessageIds: string[];
  lastPollAt?: string;
  lastAcceptedMessageId?: string;
}

interface TelegramBridgeMessage {
  id?: unknown;
  chatId?: unknown;
  senderName?: unknown;
  outgoing?: unknown;
  text?: unknown;
  date?: unknown;
}

interface TelegramPeerProfile {
  kind?: unknown;
  user?: {
    userId?: unknown;
    displayName?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    username?: unknown;
  };
  chat?: {
    chatId?: unknown;
    title?: unknown;
  };
}

export function telegramBridgePollToolInput(params: unknown): TelegramBridgePollToolInput {
  const raw = params as Record<string, unknown> | undefined;
  const limit = typeof raw?.limit === "number" && Number.isFinite(raw.limit)
    ? Math.floor(raw.limit)
    : 10;
  return {
    profileId: optionalString(raw?.profileId),
    bindingId: optionalString(raw?.bindingId),
    limit: Math.min(MAX_POLL_LIMIT, Math.max(1, limit)),
    minReceivedAt: normalizeOptionalIsoTimestamp(raw?.minReceivedAt, "minReceivedAt must be an ISO timestamp when supplied."),
  };
}

export function telegramBridgePollingControlInput(params: unknown): TelegramBridgePollingControlInput {
  const raw = params as Record<string, unknown> | undefined;
  const action = raw?.action === "stop" ? "stop" : "start";
  const intervalMs = typeof raw?.intervalMs === "number" && Number.isFinite(raw.intervalMs)
    ? Math.floor(raw.intervalMs)
    : DEFAULT_POLL_INTERVAL_MS;
  return {
    ...telegramBridgePollToolInput(params),
    action,
    intervalMs: Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, intervalMs)),
  };
}

export function buildTelegramBridgePollPlan(input: {
  toolInput: TelegramBridgePollToolInput;
  bindings: MessagingBindingListResult;
  runtimeStatus: MessagingGatewayRuntimeStatus;
  stateRoot: string;
}): TelegramBridgePollPlan {
  const selectedBindings = activeOwnerBindings(input.bindings.bindings)
    .filter((binding) => input.toolInput.profileId ? binding.authProfileId === input.toolInput.profileId : true)
    .filter((binding) => input.toolInput.bindingId ? binding.id === input.toolInput.bindingId : true);
  const runtimeProvider = input.runtimeStatus.providers.find((provider) => provider.providerId === TELEGRAM_PROVIDER_ID);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!selectedBindings.length) {
    blockers.push("No active owner Remote Ambient Surface Telegram bindings match the requested poll scope.");
  }
  if (!runtimeProvider || runtimeProvider.state !== "running" || runtimeProvider.mode !== "real") {
    blockers.push("Telegram provider is not running in real mode.");
  }
  if (runtimeProvider?.readiness && !runtimeProvider.readiness.bridgeReachable) {
    blockers.push("Telegram bridge root is not reachable according to the current readiness state.");
  }
  if (input.bindings.bindings.some((binding) => binding.providerId === TELEGRAM_PROVIDER_ID && binding.status !== "active")) {
    warnings.push("Inactive/revoked Telegram bindings are ignored by polling.");
  }
  const canApplyNow = blockers.length === 0;
  return {
    providerId: TELEGRAM_PROVIDER_ID,
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    limit: input.toolInput.limit,
    ...(input.toolInput.minReceivedAt ? { minReceivedAt: input.toolInput.minReceivedAt } : {}),
    statePath: telegramBridgePollStatePath(input.stateRoot),
    selectedBindings: selectedBindings.map(bindingSummary),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    blockers,
    warnings,
    policyNotes: [
      "Polling is bounded to active owner Remote Ambient Surface bindings only.",
      "The adapter reads only the Telegram unread endpoint for bound conversations, then resolves sender identity before dispatch.",
      "Messages are deduped per binding before dispatch so repeated polls do not re-ingest the same provider message.",
      ...(input.toolInput.minReceivedAt
        ? ["Messages older than minReceivedAt are marked seen and reported as stale instead of being routed into Ambient projections."]
        : []),
      "Outbound Telegram replies remain disabled; this path never sends provider messages.",
    ],
    nextSteps: canApplyNow
      ? [
        "Ask the user to approve one bounded Telegram unread poll.",
        "After apply, inspect accepted/dropped dispatch counts and queued projections.",
      ]
      : [
        "Start/attach the Telegram provider in real mode and create an active owner Remote Ambient Surface binding before polling.",
      ],
    safety: {
      readsProviderUnreadMessages: canApplyNow,
      resolvesSenderProfiles: canApplyNow,
      writesDedupeState: canApplyNow,
      startsBridge: false,
      sendsProviderMessages: false,
    },
  };
}

export async function applyTelegramBridgePoll(input: {
  plan: TelegramBridgePollPlan;
  bindings: MessagingBindingListResult;
  surface?: RuntimeSurfaceSnapshot;
  stateRoot: string;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
  now?: () => Date;
  dispatch: (event: MessagingInboundEvent) => MessagingGatewayInboundDispatchResult;
}): Promise<TelegramBridgePollResult> {
  if (!input.plan.canApplyNow) return telegramBridgePollBlockedResult(input.plan, true);
  const now = input.now ?? (() => new Date());
  const env = input.env ?? process.env;
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  const baseUrl = normalizeBaseUrl(env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL?.trim() || `http://127.0.0.1:${env.AMBIENT_AGENT_TELEGRAM_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT}`);
  const statePath = telegramBridgePollStatePath(input.stateRoot);
  const state = readPollState(statePath);
  const bindingResults: TelegramBridgePollBindingResult[] = [];

  for (const summary of input.plan.selectedBindings) {
    const binding = input.bindings.bindings.find((candidate) => candidate.id === summary.bindingId);
    if (!binding) continue;
    const bindingState = state.bindings[binding.id] ?? { seenMessageIds: [] };
    const initialSeenMessageIds = bindingInitialSeenMessageIds(binding);
    const seen = new Set([...bindingState.seenMessageIds, ...initialSeenMessageIds]);
    const messages = await fetchUnreadMessages({
      baseUrl,
      binding,
      limit: input.plan.limit,
      env,
      fetchFn,
    });
    let candidateMessageCount = 0;
    let duplicateMessageCount = 0;
    let staleMessageCount = 0;
    let skippedMessageCount = 0;
    const dispatches: MessagingGatewayInboundDispatchResult[] = [];
    const newlySeen: string[] = [];

    for (const message of messages) {
      const messageId = stringValue(message.id);
      const text = stringValue(message.text);
      if (!messageId) {
        skippedMessageCount += 1;
        continue;
      }
      if (seen.has(messageId)) {
        duplicateMessageCount += 1;
        continue;
      }
      if (input.plan.minReceivedAt && messageIsBeforeMinReceivedAt(message.date, input.plan.minReceivedAt)) {
        staleMessageCount += 1;
        newlySeen.push(messageId);
        continue;
      }
      if (!text || message.outgoing === true) {
        skippedMessageCount += 1;
        newlySeen.push(messageId);
        continue;
      }
      candidateMessageCount += 1;
      const sender = await fetchMessageSender({
        baseUrl,
        binding,
        messageId,
        env,
        fetchFn,
      });
      if (!sender.id) {
        skippedMessageCount += 1;
        newlySeen.push(messageId);
        continue;
      }
      const event = messagingInboundEventFromTelegramBridge({
        profileId: binding.authProfileId,
        conversationId: binding.conversationId,
        messageId,
        senderId: sender.id,
        senderLabel: sender.label || stringValue(message.senderName),
        text,
        receivedAt: stringValue(message.date) || now().toISOString(),
      });
      dispatches.push(input.dispatch(event));
      newlySeen.push(messageId);
    }

    const acceptedDispatchCount = dispatches.filter((dispatch) => dispatch.accepted).length;
    const droppedDispatchCount = dispatches.length - acceptedDispatchCount;
    state.bindings[binding.id] = {
      seenMessageIds: trimSeenIds([...bindingState.seenMessageIds, ...initialSeenMessageIds, ...newlySeen]),
      lastPollAt: now().toISOString(),
      lastAcceptedMessageId: [...dispatches].reverse().find((dispatch) => dispatch.accepted)?.event.id,
    };
    bindingResults.push({
      bindingId: binding.id,
      authProfileId: binding.authProfileId,
      conversationId: binding.conversationId,
      fetchedMessageCount: messages.length,
      candidateMessageCount,
      duplicateMessageCount,
      staleMessageCount,
      skippedMessageCount,
      acceptedDispatchCount,
      droppedDispatchCount,
      dispatches,
    });
  }

  writePollState(statePath, state);
  const totals = summarizePollBindingResults(bindingResults);
  return {
    ...input.plan,
    applyStatus: "applied",
    approvalRecorded: true,
    polled: true,
    ...totals,
    bindingResults,
  };
}

export class TelegramBridgePollingRunner {
  private readonly now: () => Date;
  private readonly schedulePoll: SchedulePollFn;
  private readonly clearPoll: ClearPollFn;
  private timer: PollTimerHandle | undefined;
  private pollOnce: (() => Promise<TelegramBridgePollResult>) | undefined;
  private inFlight = false;
  private runtimeStatus: TelegramBridgePollingRuntimeStatus;

  constructor(options: {
    now?: () => Date;
    schedulePoll?: SchedulePollFn;
    clearPoll?: ClearPollFn;
  } = {}) {
    this.now = options.now ?? (() => new Date());
    this.schedulePoll = options.schedulePoll ?? ((callback, intervalMs) => setInterval(callback, intervalMs) as PollTimerHandle);
    this.clearPoll = options.clearPoll ?? ((handle) => clearInterval(handle));
    this.runtimeStatus = this.emptyStatus();
  }

  status(): TelegramBridgePollingRuntimeStatus {
    return clonePollingRuntimeStatus(this.runtimeStatus);
  }

  preview(input: TelegramBridgePollingControlInput, pollPlan: TelegramBridgePollPlan): TelegramBridgePollingControlPreview {
    const blockers = [...pollPlan.blockers];
    const warnings = [...pollPlan.warnings];
    if (input.action === "start" && this.runtimeStatus.running) {
      blockers.push("Telegram bridge polling is already running. Stop it before changing scope or interval.");
    }
    if (input.action === "stop" && !this.runtimeStatus.running) {
      blockers.push("Telegram bridge polling is not running.");
    }
    const canApplyNow = blockers.length === 0;
    return {
      providerId: TELEGRAM_PROVIDER_ID,
      action: input.action,
      status: canApplyNow ? "ready" : "blocked",
      canApplyNow,
      approvalRequired: input.action === "start",
      intervalMs: input.intervalMs,
      limit: pollPlan.limit,
      ...(pollPlan.minReceivedAt ? { minReceivedAt: pollPlan.minReceivedAt } : {}),
      ...(input.profileId ? { profileId: input.profileId } : {}),
      ...(input.bindingId ? { bindingId: input.bindingId } : {}),
      statePath: pollPlan.statePath,
      selectedBindings: pollPlan.selectedBindings,
      runtimeStatus: this.status(),
      pollPlan,
      blockers,
      warnings,
      policyNotes: [
        "Periodic polling reuses the bounded Telegram bridge poll adapter; it does not introduce a separate provider read path.",
        "Polling is scoped to active owner Remote Ambient Surface bindings only.",
        ...(pollPlan.minReceivedAt
          ? ["Unread messages older than the configured freshness anchor are counted as stale and marked seen without routing projections."]
          : []),
        "The runner records workspace-local dedupe state and runtime counters; it does not persist provider message bodies outside the existing projection queue.",
        "Outbound Telegram replies remain disabled. Starting the polling runner never sends provider messages.",
      ],
      nextSteps: canApplyNow
        ? input.action === "start"
          ? [
            "Ask the user to approve starting periodic Telegram unread polling.",
            "After apply, inspect polling status and gateway status for last success/error counters.",
          ]
          : [
            "Stop the periodic polling timer.",
            "Inspect polling status to verify the runner is stopped.",
          ]
        : [
          input.action === "start"
            ? "Start/attach Telegram in real mode and create an active owner Remote Ambient Surface binding before starting polling."
            : "Polling is already stopped; no timer needs to be stopped.",
        ],
      safety: {
        startsTimer: input.action === "start" && canApplyNow,
        stopsTimer: input.action === "stop" && canApplyNow,
        readsProviderUnreadMessages: input.action === "start" && canApplyNow,
        resolvesSenderProfiles: input.action === "start" && canApplyNow,
        writesDedupeState: input.action === "start" && canApplyNow,
        startsBridge: false,
        sendsProviderMessages: false,
      },
    };
  }

  async apply(input: {
    preview: TelegramBridgePollingControlPreview;
    approvalRecorded?: boolean;
    pollOnce: () => Promise<TelegramBridgePollResult>;
  }): Promise<TelegramBridgePollingControlResult> {
    if (!input.preview.canApplyNow) {
      return this.controlResult(input.preview, "blocked", input.approvalRecorded === true);
    }
    if (input.preview.approvalRequired && input.approvalRecorded !== true) {
      return this.controlResult(input.preview, "denied", false);
    }
    if (input.preview.action === "stop") {
      this.stopTimer();
      const stoppedAt = this.now().toISOString();
      this.runtimeStatus = {
        ...this.runtimeStatus,
        state: "stopped",
        running: false,
        stoppedAt,
        nextPollDueAt: undefined,
        lastError: undefined,
      };
      return this.controlResult(input.preview, "applied", input.approvalRecorded === true);
    }

    this.stopTimer();
    this.pollOnce = input.pollOnce;
    const startedAt = this.now().toISOString();
    this.runtimeStatus = {
      ...this.emptyStatus(),
      state: "starting",
      running: false,
      ...(input.preview.profileId ? { profileId: input.preview.profileId } : {}),
      ...(input.preview.bindingId ? { bindingId: input.preview.bindingId } : {}),
      limit: input.preview.limit,
      intervalMs: input.preview.intervalMs,
      ...(input.preview.minReceivedAt ? { minReceivedAt: input.preview.minReceivedAt } : {}),
      statePath: input.preview.statePath,
      selectedBindingCount: input.preview.selectedBindings.length,
      startedAt,
    };

    try {
      const immediatePollResult = await this.runPoll(input.pollOnce);
      if (immediatePollResult.applyStatus !== "applied") {
        this.stopTimer();
        this.runtimeStatus = {
          ...this.runtimeStatus,
          state: "error",
          running: false,
          lastError: immediatePollResult.blockers.join("; ") || `Immediate poll returned ${immediatePollResult.applyStatus}.`,
          nextPollDueAt: undefined,
        };
        return {
          ...this.controlResult(input.preview, "blocked", true),
          immediatePollResult,
          runtimeStatus: this.status(),
        };
      }
      this.runtimeStatus = {
        ...this.runtimeStatus,
        state: "running",
        running: true,
        nextPollDueAt: new Date(this.now().getTime() + input.preview.intervalMs).toISOString(),
      };
      this.timer = this.schedulePoll(() => {
        void this.runScheduledPoll();
      }, input.preview.intervalMs);
      this.timer.unref?.();
      return {
        ...this.controlResult(input.preview, "applied", true),
        immediatePollResult,
        runtimeStatus: this.status(),
      };
    } catch (error) {
      this.stopTimer();
      this.runtimeStatus = {
        ...this.runtimeStatus,
        state: "error",
        running: false,
        failedPollCount: this.runtimeStatus.failedPollCount + 1,
        lastPollFinishedAt: this.now().toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
        nextPollDueAt: undefined,
      };
      return this.controlResult(input.preview, "blocked", true);
    }
  }

  async runScheduledPoll(): Promise<TelegramBridgePollResult | undefined> {
    const pollOnce = this.pollOnce;
    if (!pollOnce || !this.runtimeStatus.running) return undefined;
    return await this.runPoll(pollOnce);
  }

  private async runPoll(pollOnce: () => Promise<TelegramBridgePollResult>): Promise<TelegramBridgePollResult> {
    if (this.inFlight) {
      this.runtimeStatus = {
        ...this.runtimeStatus,
        lastError: "Previous Telegram bridge poll is still in flight; skipped this tick.",
      };
      return telegramBridgePollBlockedResult({
        providerId: TELEGRAM_PROVIDER_ID,
        status: "blocked",
        canApplyNow: false,
        limit: this.runtimeStatus.limit,
        ...(this.runtimeStatus.minReceivedAt ? { minReceivedAt: this.runtimeStatus.minReceivedAt } : {}),
        statePath: this.runtimeStatus.statePath ?? "",
        selectedBindings: [],
        blockers: [this.runtimeStatus.lastError ?? "Previous poll still in flight."],
        warnings: [],
        policyNotes: [],
        nextSteps: [],
        safety: {
          readsProviderUnreadMessages: false,
          resolvesSenderProfiles: false,
          writesDedupeState: false,
          startsBridge: false,
          sendsProviderMessages: false,
        },
      });
    }
    this.inFlight = true;
    const startedAt = this.now().toISOString();
    this.runtimeStatus = {
      ...this.runtimeStatus,
      lastPollStartedAt: startedAt,
    };
    try {
      const result = await pollOnce();
      const finishedAt = this.now().toISOString();
      const resultSummary = summarizePollResult(result);
      const successful = result.applyStatus === "applied";
      this.runtimeStatus = {
        ...this.runtimeStatus,
        lastPollFinishedAt: finishedAt,
        ...(successful ? { lastSuccessfulPollAt: finishedAt } : {}),
        nextPollDueAt: this.runtimeStatus.running
          ? new Date(this.now().getTime() + this.runtimeStatus.intervalMs).toISOString()
          : this.runtimeStatus.nextPollDueAt,
        lastError: successful ? undefined : result.blockers.join("; ") || `Poll returned ${result.applyStatus}.`,
        totalPollCount: this.runtimeStatus.totalPollCount + 1,
        successfulPollCount: this.runtimeStatus.successfulPollCount + (successful ? 1 : 0),
        failedPollCount: this.runtimeStatus.failedPollCount + (successful ? 0 : 1),
        fetchedMessageCount: this.runtimeStatus.fetchedMessageCount + result.fetchedMessageCount,
        candidateMessageCount: this.runtimeStatus.candidateMessageCount + result.candidateMessageCount,
        duplicateMessageCount: this.runtimeStatus.duplicateMessageCount + result.duplicateMessageCount,
        staleMessageCount: this.runtimeStatus.staleMessageCount + result.staleMessageCount,
        skippedMessageCount: this.runtimeStatus.skippedMessageCount + result.skippedMessageCount,
        acceptedDispatchCount: this.runtimeStatus.acceptedDispatchCount + result.acceptedDispatchCount,
        droppedDispatchCount: this.runtimeStatus.droppedDispatchCount + result.droppedDispatchCount,
        lastResult: resultSummary,
      };
      return result;
    } catch (error) {
      const finishedAt = this.now().toISOString();
      this.runtimeStatus = {
        ...this.runtimeStatus,
        lastPollFinishedAt: finishedAt,
        nextPollDueAt: this.runtimeStatus.running
          ? new Date(this.now().getTime() + this.runtimeStatus.intervalMs).toISOString()
          : this.runtimeStatus.nextPollDueAt,
        lastError: error instanceof Error ? error.message : String(error),
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
    preview: TelegramBridgePollingControlPreview,
    applyStatus: TelegramBridgePollingControlResult["applyStatus"],
    approvalRecorded: boolean,
  ): TelegramBridgePollingControlResult {
    return {
      ...preview,
      applyStatus,
      approvalRecorded,
      runtimeStatus: this.status(),
    };
  }

  private emptyStatus(): TelegramBridgePollingRuntimeStatus {
    return {
      providerId: TELEGRAM_PROVIDER_ID,
      state: "stopped",
      running: false,
      limit: 10,
      intervalMs: DEFAULT_POLL_INTERVAL_MS,
      selectedBindingCount: 0,
      totalPollCount: 0,
      successfulPollCount: 0,
      failedPollCount: 0,
      fetchedMessageCount: 0,
      candidateMessageCount: 0,
      duplicateMessageCount: 0,
      staleMessageCount: 0,
      skippedMessageCount: 0,
      acceptedDispatchCount: 0,
      droppedDispatchCount: 0,
    };
  }
}

export function telegramBridgePollBlockedResult(plan: TelegramBridgePollPlan, approvalRecorded = false): TelegramBridgePollResult {
  return {
    ...plan,
    applyStatus: "blocked",
    approvalRecorded,
    polled: false,
    fetchedMessageCount: 0,
    candidateMessageCount: 0,
    duplicateMessageCount: 0,
    staleMessageCount: 0,
    skippedMessageCount: 0,
    acceptedDispatchCount: 0,
    droppedDispatchCount: 0,
    bindingResults: [],
  };
}

export function telegramBridgePollDeniedResult(plan: TelegramBridgePollPlan): TelegramBridgePollResult {
  return {
    ...telegramBridgePollBlockedResult(plan, false),
    applyStatus: "denied",
  };
}

export function telegramBridgePollPlanText(plan: TelegramBridgePollPlan): string {
  return telegramBridgePollTextBase(plan, "Telegram bridge poll preview");
}

export function telegramBridgePollResultText(result: TelegramBridgePollResult): string {
  const lines = [
    telegramBridgePollTextBase(result, "Telegram bridge poll apply"),
    "",
    "Poll result:",
    `- Apply status: ${result.applyStatus}`,
    `- Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `- Polled: ${result.polled ? "yes" : "no"}`,
    `- Fetched messages: ${result.fetchedMessageCount}`,
    `- Candidate messages: ${result.candidateMessageCount}`,
    `- Duplicate messages: ${result.duplicateMessageCount}`,
    `- Stale messages before minReceivedAt: ${result.staleMessageCount}`,
    `- Skipped messages: ${result.skippedMessageCount}`,
    `- Accepted dispatches: ${result.acceptedDispatchCount}`,
    `- Dropped dispatches: ${result.droppedDispatchCount}`,
  ];
  if (result.bindingResults.length) {
    lines.push("", "Binding results:");
    for (const binding of result.bindingResults) {
      lines.push(`- ${binding.bindingId}`);
      lines.push(`  Profile: ${binding.authProfileId}`);
      lines.push(`  Conversation: ${binding.conversationId}`);
      lines.push(`  Fetched: ${binding.fetchedMessageCount}`);
      lines.push(`  Accepted: ${binding.acceptedDispatchCount}`);
      lines.push(`  Dropped: ${binding.droppedDispatchCount}`);
      lines.push(`  Duplicates: ${binding.duplicateMessageCount}`);
      lines.push(`  Stale before minReceivedAt: ${binding.staleMessageCount}`);
      lines.push(`  Skipped: ${binding.skippedMessageCount}`);
      const dispatches = binding.dispatches.slice(0, 10);
      if (dispatches.length) {
        lines.push("  Dispatches:");
        for (const dispatch of dispatches) {
          lines.push(`    - Event: ${dispatch.event.id}`);
          lines.push(`      Accepted: ${dispatch.accepted ? "yes" : "no"}`);
          if (dispatch.queuedProjection?.id) lines.push(`      Queued projection: ${dispatch.queuedProjection.id}`);
          if (dispatch.projection?.kind) lines.push(`      Projection kind: ${dispatch.projection.kind}`);
          if (dispatch.projection?.title) lines.push(`      Projection title: ${dispatch.projection.title}`);
          if (dispatch.droppedReason) lines.push(`      Dropped reason: ${dispatch.droppedReason}`);
        }
        if (binding.dispatches.length > dispatches.length) {
          lines.push(`    - ${binding.dispatches.length - dispatches.length} additional dispatches omitted from preview.`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function telegramBridgePollingStatusText(status: TelegramBridgePollingRuntimeStatus): string {
  const lines = [
    "Telegram bridge polling runner status",
    `Provider: ${status.providerId}`,
    `State: ${status.state}`,
    `Running: ${status.running ? "yes" : "no"}`,
    status.profileId ? `Profile: ${status.profileId}` : undefined,
    status.bindingId ? `Binding: ${status.bindingId}` : undefined,
    `Selected bindings: ${status.selectedBindingCount}`,
    `Limit per binding: ${status.limit}`,
    `Interval: ${status.intervalMs}ms`,
    status.minReceivedAt ? `Freshness minReceivedAt: ${status.minReceivedAt}` : undefined,
    status.statePath ? `Dedupe state path: ${status.statePath}` : undefined,
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
    `- Duplicate messages: ${status.duplicateMessageCount}`,
    `- Stale messages before minReceivedAt: ${status.staleMessageCount}`,
    `- Skipped messages: ${status.skippedMessageCount}`,
    `- Accepted dispatches: ${status.acceptedDispatchCount}`,
    `- Dropped dispatches: ${status.droppedDispatchCount}`,
    "",
    "Boundaries:",
    "- Polling uses only the bounded Telegram unread endpoint plus sender-profile resolution.",
    "- Polling is scoped to active owner Remote Ambient Surface bindings.",
    "- Polling never sends Telegram messages.",
    "",
    "Control path:",
    "- For one expected owner command, use ambient_messaging_telegram_bridge_poll_preview then ambient_messaging_telegram_bridge_poll_apply.",
    "- For an ongoing owner Remote Ambient Surface loop, use ambient_messaging_telegram_bridge_polling_preview then ambient_messaging_telegram_bridge_polling_apply.",
    "- When starting after handoff/setup/activation, include minReceivedAt so older unread backlog is counted stale instead of projected.",
    "- After start/stop, call ambient_messaging_telegram_bridge_polling_status and ambient_messaging_gateway_status before reporting the loop state.",
  ].filter((line): line is string => line !== undefined);
  if (status.lastResult) {
    lines.push("", "Last result:");
    lines.push(`- Apply status: ${status.lastResult.applyStatus}`);
    lines.push(`- Polled: ${status.lastResult.polled ? "yes" : "no"}`);
    lines.push(`- Accepted dispatches: ${status.lastResult.acceptedDispatchCount}`);
    lines.push(`- Dropped dispatches: ${status.lastResult.droppedDispatchCount}`);
    lines.push(`- Duplicates: ${status.lastResult.duplicateMessageCount}`);
  }
  return lines.join("\n");
}

export function telegramBridgePollingControlPreviewText(preview: TelegramBridgePollingControlPreview): string {
  return telegramBridgePollingControlTextBase(preview, `Telegram bridge polling ${preview.action} preview`);
}

export function telegramBridgePollingControlResultText(result: TelegramBridgePollingControlResult): string {
  const lines = [
    telegramBridgePollingControlTextBase(result, `Telegram bridge polling ${result.action} apply`),
    "",
    "Apply result:",
    `- Apply status: ${result.applyStatus}`,
    `- Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    "",
    telegramBridgePollingStatusText(result.runtimeStatus),
  ];
  if (result.immediatePollResult) {
    lines.push("", "Immediate poll:", telegramBridgePollResultText(result.immediatePollResult));
  }
  return lines.join("\n");
}

export function telegramBridgePollingApprovalDetail(preview: TelegramBridgePollingControlPreview): string {
  return [
    `Provider: ${preview.providerId}`,
    `Action: ${preview.action}`,
    `Profile: ${preview.profileId ?? "all active owner bindings"}`,
    `Binding: ${preview.bindingId ?? "all matching active owner bindings"}`,
    `Selected bindings: ${preview.selectedBindings.length}`,
    `Interval: ${preview.intervalMs}ms`,
    `Limit per binding: ${preview.limit}`,
    preview.minReceivedAt ? `Freshness minReceivedAt: ${preview.minReceivedAt}` : undefined,
    `State path: ${preview.statePath}`,
    `Would start timer: ${preview.safety.startsTimer ? "yes" : "no"}`,
    `Would stop timer: ${preview.safety.stopsTimer ? "yes" : "no"}`,
    `Would read unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `Would resolve sender profiles: ${preview.safety.resolvesSenderProfiles ? "yes" : "no"}`,
    `Would write dedupe state: ${preview.safety.writesDedupeState ? "yes" : "no"}`,
    `Would start bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    `Would send provider messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    ...preview.selectedBindings.map((binding) =>
      `Binding ${binding.bindingId}: profile=${binding.authProfileId}, conversation=${binding.conversationId}, owner=${binding.ownerUserId}`,
    ),
    ...preview.policyNotes,
  ].join("\n");
}

export function telegramBridgePollApprovalDetail(plan: TelegramBridgePollPlan): string {
  return [
    `Provider: ${plan.providerId}`,
    `Bindings: ${plan.selectedBindings.length}`,
    `Limit per binding: ${plan.limit}`,
    `State path: ${plan.statePath}`,
    `Would read unread messages: ${plan.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `Would resolve sender profiles: ${plan.safety.resolvesSenderProfiles ? "yes" : "no"}`,
    `Would write dedupe state: ${plan.safety.writesDedupeState ? "yes" : "no"}`,
    `Would start bridge: ${plan.safety.startsBridge ? "yes" : "no"}`,
    `Would send provider messages: ${plan.safety.sendsProviderMessages ? "yes" : "no"}`,
    ...plan.selectedBindings.map((binding) =>
      `Binding ${binding.bindingId}: profile=${binding.authProfileId}, conversation=${binding.conversationId}, owner=${binding.ownerUserId}`,
    ),
    ...plan.policyNotes,
  ].join("\n");
}

function telegramBridgePollingControlTextBase(
  preview: TelegramBridgePollingControlPreview,
  title: string,
): string {
  return [
    title,
    `Provider: ${preview.providerId}`,
    `Action: ${preview.action}`,
    `Status: ${preview.status}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    preview.profileId ? `Profile: ${preview.profileId}` : undefined,
    preview.bindingId ? `Binding: ${preview.bindingId}` : undefined,
    `Selected bindings: ${preview.selectedBindings.length}`,
    `Limit per binding: ${preview.limit}`,
    `Interval: ${preview.intervalMs}ms`,
    preview.minReceivedAt ? `Freshness minReceivedAt: ${preview.minReceivedAt}` : undefined,
    `Dedupe state path: ${preview.statePath}`,
    "",
    "Safety:",
    `- Starts timer: ${preview.safety.startsTimer ? "yes" : "no"}`,
    `- Stops timer: ${preview.safety.stopsTimer ? "yes" : "no"}`,
    `- Reads unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Resolves sender profiles: ${preview.safety.resolvesSenderProfiles ? "yes" : "no"}`,
    `- Writes dedupe state: ${preview.safety.writesDedupeState ? "yes" : "no"}`,
    `- Starts bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    `- Sends provider messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    "",
    "Blockers:",
    ...(preview.blockers.length ? preview.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Warnings:",
    ...(preview.warnings.length ? preview.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "Policy notes:",
    ...preview.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...preview.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function telegramBridgePollTextBase(plan: TelegramBridgePollPlan, title: string): string {
  const lines = [
    title,
    `Provider: ${plan.providerId}`,
    `Status: ${plan.status}`,
    `Can apply now: ${plan.canApplyNow ? "yes" : "no"}`,
    `Limit per binding: ${plan.limit}`,
    plan.minReceivedAt ? `Freshness minReceivedAt: ${plan.minReceivedAt}` : undefined,
    `State path: ${plan.statePath}`,
    `Selected bindings: ${plan.selectedBindings.length}`,
    plan.runtimeProvider ? `Runtime state: ${plan.runtimeProvider.state}/${plan.runtimeProvider.mode}` : "Runtime state: unavailable",
    "",
    "Safety:",
    `- Reads unread messages: ${plan.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Resolves sender profiles: ${plan.safety.resolvesSenderProfiles ? "yes" : "no"}`,
    `- Writes dedupe state: ${plan.safety.writesDedupeState ? "yes" : "no"}`,
    `- Starts bridge: ${plan.safety.startsBridge ? "yes" : "no"}`,
    `- Sends provider messages: ${plan.safety.sendsProviderMessages ? "yes" : "no"}`,
    "",
    "Bindings:",
    ...(plan.selectedBindings.length
      ? plan.selectedBindings.flatMap((binding) => [
        `- ${binding.bindingId}`,
        `  Profile: ${binding.authProfileId}`,
        `  Conversation: ${binding.conversationId}`,
        `  Owner: ${binding.ownerUserId}`,
        binding.ambientSurface ? `  Surface: ${binding.ambientSurface}` : undefined,
        binding.maxDisclosureLabel ? `  Max disclosure: ${binding.maxDisclosureLabel}` : undefined,
      ].filter((line): line is string => Boolean(line)))
      : ["- None"]),
    "",
    "Blockers:",
    ...(plan.blockers.length ? plan.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Warnings:",
    ...(plan.warnings.length ? plan.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "Policy notes:",
    ...plan.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...plan.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

function activeOwnerBindings(bindings: MessagingBindingDescriptor[]): MessagingBindingDescriptor[] {
  return bindings.filter((binding) =>
    binding.providerId === TELEGRAM_PROVIDER_ID &&
    binding.purpose === "remote_ambient_surface" &&
    binding.status === "active" &&
    Boolean(binding.ownerUserId?.trim())
  );
}

function bindingSummary(binding: MessagingBindingDescriptor): TelegramBridgePollBindingSummary {
  return {
    bindingId: binding.id,
    authProfileId: binding.authProfileId,
    conversationId: binding.conversationId,
    ownerUserId: binding.ownerUserId ?? "",
    ...(binding.ambientSurface ? { ambientSurface: binding.ambientSurface } : {}),
    ...(binding.maxDisclosureLabel ? { maxDisclosureLabel: binding.maxDisclosureLabel } : {}),
  };
}

function bindingInitialSeenMessageIds(binding: MessagingBindingDescriptor): string[] {
  const metadata = binding.metadata ?? {};
  const ids = [
    stringValue(metadata.ownerHandoffSourceMessageId),
    ...(Array.isArray(metadata.initialSeenMessageIds) ? metadata.initialSeenMessageIds.map(stringValue) : []),
  ].filter(Boolean);
  return [...new Set(ids)];
}

async function fetchUnreadMessages(input: {
  baseUrl: string;
  binding: MessagingBindingDescriptor;
  limit: number;
  env: Record<string, string | undefined>;
  fetchFn: FetchLike;
}): Promise<TelegramBridgeMessage[]> {
  const url = new URL(`${input.baseUrl}/sessions/${encodeURIComponent(input.binding.authProfileId)}/inbox/unread`);
  url.searchParams.set("chatId", input.binding.conversationId);
  url.searchParams.set("limit", String(input.limit));
  const body = await fetchBridgeJson<{ messages?: TelegramBridgeMessage[] }>(url.toString(), input);
  return Array.isArray(body.messages) ? body.messages : [];
}

async function fetchMessageSender(input: {
  baseUrl: string;
  binding: MessagingBindingDescriptor;
  messageId: string;
  env: Record<string, string | undefined>;
  fetchFn: FetchLike;
}): Promise<{ id: string; label?: string }> {
  const url = `${input.baseUrl}/sessions/${encodeURIComponent(input.binding.authProfileId)}/chats/${encodeURIComponent(input.binding.conversationId)}/messages/${encodeURIComponent(input.messageId)}/sender-profile`;
  const body = await fetchBridgeJson<{ sender?: TelegramPeerProfile }>(url, input);
  const sender = body.sender;
  if (sender?.kind === "user") {
    const id = stringValue(sender.user?.userId);
    const label = stringValue(sender.user?.displayName)
      || [stringValue(sender.user?.firstName), stringValue(sender.user?.lastName)].filter(Boolean).join(" ").trim()
      || stringValue(sender.user?.username);
    return { id, ...(label ? { label } : {}) };
  }
  if (sender?.kind === "chat") {
    const id = stringValue(sender.chat?.chatId);
    const label = stringValue(sender.chat?.title);
    return { id, ...(label ? { label } : {}) };
  }
  return { id: "" };
}

async function fetchBridgeJson<T>(
  url: string,
  input: {
    env: Record<string, string | undefined>;
    fetchFn: FetchLike;
  },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (input.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim()) headers["x-telegram-api-id"] = input.env.AMBIENT_AGENT_TELEGRAM_API_ID.trim();
  if (input.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()) headers["x-telegram-api-hash"] = input.env.AMBIENT_AGENT_TELEGRAM_API_HASH.trim();
  const response = await input.fetchFn(url, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(`Telegram bridge request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  }
  return await response.json() as T;
}

function telegramBridgePollStatePath(stateRoot: string): string {
  return join(stateRoot, "messaging-gateway", "telegram-poll-state.json");
}

function readPollState(statePath: string): TelegramBridgePollState {
  if (!existsSync(statePath)) return { version: 1, bindings: {} };
  const raw = JSON.parse(readFileSync(statePath, "utf8")) as TelegramBridgePollState;
  if (raw.version !== 1 || typeof raw.bindings !== "object" || !raw.bindings) {
    throw new Error(`Unsupported Telegram bridge poll state in ${statePath}`);
  }
  return raw;
}

function writePollState(statePath: string, state: TelegramBridgePollState): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function summarizePollBindingResults(bindingResults: TelegramBridgePollBindingResult[]): Pick<TelegramBridgePollResult,
  "fetchedMessageCount" | "candidateMessageCount" | "duplicateMessageCount" | "staleMessageCount" | "skippedMessageCount" | "acceptedDispatchCount" | "droppedDispatchCount"
> {
  return bindingResults.reduce((totals, binding) => ({
    fetchedMessageCount: totals.fetchedMessageCount + binding.fetchedMessageCount,
    candidateMessageCount: totals.candidateMessageCount + binding.candidateMessageCount,
    duplicateMessageCount: totals.duplicateMessageCount + binding.duplicateMessageCount,
    staleMessageCount: totals.staleMessageCount + binding.staleMessageCount,
    skippedMessageCount: totals.skippedMessageCount + binding.skippedMessageCount,
    acceptedDispatchCount: totals.acceptedDispatchCount + binding.acceptedDispatchCount,
    droppedDispatchCount: totals.droppedDispatchCount + binding.droppedDispatchCount,
  }), {
    fetchedMessageCount: 0,
    candidateMessageCount: 0,
    duplicateMessageCount: 0,
    staleMessageCount: 0,
    skippedMessageCount: 0,
    acceptedDispatchCount: 0,
    droppedDispatchCount: 0,
  });
}

function summarizePollResult(result: TelegramBridgePollResult): TelegramBridgePollResultSummary {
  return {
    applyStatus: result.applyStatus,
    polled: result.polled,
    fetchedMessageCount: result.fetchedMessageCount,
    candidateMessageCount: result.candidateMessageCount,
    duplicateMessageCount: result.duplicateMessageCount,
    staleMessageCount: result.staleMessageCount,
    skippedMessageCount: result.skippedMessageCount,
    acceptedDispatchCount: result.acceptedDispatchCount,
    droppedDispatchCount: result.droppedDispatchCount,
    bindingResults: result.bindingResults.map((binding) => ({
      bindingId: binding.bindingId,
      authProfileId: binding.authProfileId,
      conversationId: binding.conversationId,
      fetchedMessageCount: binding.fetchedMessageCount,
      candidateMessageCount: binding.candidateMessageCount,
      duplicateMessageCount: binding.duplicateMessageCount,
      staleMessageCount: binding.staleMessageCount,
      skippedMessageCount: binding.skippedMessageCount,
      acceptedDispatchCount: binding.acceptedDispatchCount,
      droppedDispatchCount: binding.droppedDispatchCount,
    })),
  };
}

function clonePollingRuntimeStatus(status: TelegramBridgePollingRuntimeStatus): TelegramBridgePollingRuntimeStatus {
  return {
    ...status,
    ...(status.lastResult ? {
      lastResult: {
        ...status.lastResult,
        bindingResults: status.lastResult.bindingResults.map((binding) => ({ ...binding })),
      },
    } : {}),
  };
}

function trimSeenIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].slice(-MAX_SEEN_IDS);
}

function normalizeBaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalIsoTimestamp(value: unknown, message: string): string | undefined {
  const raw = optionalString(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(message);
  return parsed.toISOString();
}

function messageIsBeforeMinReceivedAt(messageDate: unknown, minReceivedAt: string): boolean {
  const messageTime = new Date(stringValue(messageDate)).getTime();
  const minTime = new Date(minReceivedAt).getTime();
  return !Number.isNaN(messageTime) && !Number.isNaN(minTime) && messageTime < minTime;
}
