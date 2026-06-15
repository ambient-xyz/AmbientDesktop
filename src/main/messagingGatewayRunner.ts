import type {
  MessagingBindingListResult,
  MessagingGatewayAdapterMode,
  MessagingGatewayAdapterRuntimeStatus,
  MessagingGatewayAdapterState,
  MessagingGatewayBridgeSupervisorStatus,
  MessagingGatewayLifecycleAction,
  MessagingGatewayLifecycleApplyResult,
  MessagingGatewayLifecycleMode,
  MessagingGatewayLifecyclePreview,
  MessagingGatewayOutboundDelivery,
  MessagingGatewayProviderReadiness,
  MessagingGatewayQueuedProjection,
  MessagingGatewayRuntimeState,
  MessagingGatewayRuntimeStatus,
  MessagingInboundEvent,
  MessagingProviderDescriptor,
  MessagingSyntheticRouteResult,
  RuntimeSurfaceSnapshot,
} from "../shared/messagingGateway";
import { messagingProjectionText, routeMessagingInboundEvent, routeSyntheticMessagingEvent } from "./messagingGatewayProjection";
import type { MessagingGatewayReadinessProbe } from "./messagingProviderReadiness";
import { buildRemoteSurfaceRelaySummaries, relaySummaryTextLines } from "./messagingRelayStatus";

export interface MessagingGatewayProviderRegistryLike {
  get(providerId: string): { descriptor: MessagingProviderDescriptor } | undefined;
  descriptors(): MessagingProviderDescriptor[];
}

export interface MessagingGatewayRunnerOptions {
  providers: MessagingGatewayProviderRegistryLike;
  readinessProbes?: Record<string, MessagingGatewayReadinessProbe>;
  bridgeSupervisors?: Record<string, MessagingGatewayBridgeSupervisor>;
  now?: () => Date;
  maxQueuedProjections?: number;
  maxRecentEvents?: number;
}

export type { MessagingGatewayReadinessProbe } from "./messagingProviderReadiness";

export interface MessagingGatewayBridgeSupervisor {
  status(): MessagingGatewayBridgeSupervisorStatus;
  start(input: { readiness?: MessagingGatewayProviderReadiness }): Promise<MessagingGatewayBridgeSupervisorStatus>;
  stop(): Promise<MessagingGatewayBridgeSupervisorStatus>;
}

export interface MessagingGatewaySyntheticDispatchInput {
  event: MessagingInboundEvent;
  bindings: MessagingBindingListResult;
  surface?: RuntimeSurfaceSnapshot;
}

export interface MessagingGatewaySyntheticDispatchResult extends MessagingSyntheticRouteResult {
  queuedProjection: MessagingGatewayQueuedProjection;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}

export interface MessagingGatewayInboundDispatchInput {
  event: MessagingInboundEvent;
  bindings: MessagingBindingListResult;
  surface?: RuntimeSurfaceSnapshot;
  source: "telegram-bridge" | "signal-bridge";
  requireRunning?: boolean;
  redactEventTextInResult?: boolean;
}

export interface MessagingGatewayInboundDispatchResult {
  accepted: boolean;
  droppedReason?: string;
  event: MessagingInboundEvent;
  binding?: MessagingSyntheticRouteResult["binding"];
  projection?: MessagingSyntheticRouteResult["projection"];
  promptContext?: MessagingSyntheticRouteResult["promptContext"];
  queuedProjection?: MessagingGatewayQueuedProjection;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}

interface AdapterRuntimeRecord {
  state: MessagingGatewayAdapterState;
  mode: MessagingGatewayAdapterMode;
  syntheticEventCount: number;
  realEventCount: number;
  queuedProjectionCount: number;
  readiness?: MessagingGatewayProviderReadiness;
  lastActivityAt?: string;
  lastError?: string;
}

export class MessagingGatewayRunner {
  private readonly providers: MessagingGatewayProviderRegistryLike;
  private readonly readinessProbes: Record<string, MessagingGatewayReadinessProbe>;
  private readonly bridgeSupervisors: Record<string, MessagingGatewayBridgeSupervisor>;
  private readonly now: () => Date;
  private readonly maxQueuedProjections: number;
  private readonly maxRecentEvents: number;
  private readonly adapterStates = new Map<string, AdapterRuntimeRecord>();
  private readonly queuedProjections: MessagingGatewayQueuedProjection[] = [];
  private readonly recentOutboundDeliveries: MessagingGatewayOutboundDelivery[] = [];
  private readonly recentEvents: MessagingInboundEvent[] = [];
  private status: MessagingGatewayRuntimeState = "idle";
  private lastError: string | undefined;

  constructor(options: MessagingGatewayRunnerOptions) {
    this.providers = options.providers;
    this.readinessProbes = options.readinessProbes ?? {};
    this.bridgeSupervisors = options.bridgeSupervisors ?? {};
    this.now = options.now ?? (() => new Date());
    this.maxQueuedProjections = Math.max(1, options.maxQueuedProjections ?? 50);
    this.maxRecentEvents = Math.max(1, options.maxRecentEvents ?? 20);
    for (const descriptor of this.providers.descriptors()) {
      this.adapterStates.set(descriptor.providerId, stoppedRecord());
    }
  }

  runtimeStatus(): MessagingGatewayRuntimeStatus {
    const providerStatuses = this.providerRuntimeStatuses();
    return {
      status: this.status,
      providerCount: providerStatuses.length,
      activeProviderCount: providerStatuses.filter((provider) => provider.state !== "stopped").length,
      syntheticActiveProviderCount: providerStatuses.filter((provider) => provider.state === "synthetic-active").length,
      queuedProjectionCount: this.queuedProjections.length,
      recentEventCount: this.recentEvents.length,
      outboundDeliveryCount: this.recentOutboundDeliveries.length,
      providers: providerStatuses,
      queuedProjections: this.queuedProjections.map(cloneQueuedProjection),
      recentOutboundDeliveries: this.recentOutboundDeliveries.map(cloneOutboundDelivery),
      recentEvents: this.recentEvents.map(cloneInboundEvent),
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  previewLifecycle(input: {
    action: MessagingGatewayLifecycleAction;
    providerId: string;
    mode?: MessagingGatewayLifecycleMode;
  }): MessagingGatewayLifecyclePreview {
    const action = input.action;
    if (action !== "start" && action !== "stop") throw new Error("action must be start or stop.");
    const providerId = input.providerId.trim();
    const provider = this.providers.get(providerId)?.descriptor;
    if (!provider) throw this.recordError(providerId, `Ambient messaging provider not found: ${input.providerId}`);
    const mode = input.mode ?? "synthetic";
    if (mode !== "synthetic" && mode !== "real") throw new Error("mode must be synthetic or real.");
    const realStart = action === "start" && mode === "real";
    const realStop = action === "stop" && mode === "real";
    const record = this.adapterRecord(provider.providerId);
    const readiness = record.readiness;
    const bridgeSupervisor = this.bridgeSupervisors[provider.providerId]?.status();
    const canLaunchBridgeProcess = Boolean(bridgeSupervisor && bridgeSupervisor.state !== "missing");
    const implementationReady = provider.implementation.runtimeLifecycleEnabled;
    const canApplyRealStart = Boolean(readiness?.configured && readiness.apiCredentialsPresent && (readiness.bridgeReachable || canLaunchBridgeProcess));
    const implementationPolicyNotes = implementationReady
      ? [`Provider implementation status: ${provider.implementation.status}; runtime lifecycle is enabled.`]
      : [
        `Provider implementation status: ${provider.implementation.status}; runtime lifecycle is disabled until a reviewed adapter is implemented.`,
        ...provider.implementation.notes,
      ];
    const readinessPolicyNotes = readiness
      ? [
        `Current readiness: ${readiness.status}; configured=${readiness.configured ? "yes" : "no"}; bridgeReachable=${readiness.bridgeReachable ? "yes" : "no"}; authNeeded=${readiness.authNeeded ? "yes" : "no"}.`,
      ]
      : [
        "Current readiness has not been refreshed in this runner instance; call ambient_messaging_gateway_status before real startup planning.",
      ];
    const realModeNextSteps = readiness
      ? readinessNextSteps(readiness)
      : ["Refresh provider readiness before applying or explaining any real provider bridge startup."];
    return {
      action,
      providerId: provider.providerId,
      label: provider.label,
      mode,
      approvalRequired: mode === "real",
      canApplyNow: implementationReady && (mode === "synthetic" || (mode === "real" && (action === "stop" || canApplyRealStart))),
      wouldStartRealBridge: implementationReady && realStart,
      wouldStopRealBridge: implementationReady && realStop,
      wouldAttachExistingBridge: implementationReady && realStart && readiness?.bridgeReachable === true,
      wouldLaunchBridgeProcess: implementationReady && realStart && readiness?.bridgeReachable !== true && canLaunchBridgeProcess,
      wouldStopBridgeProcess: implementationReady && realStop && bridgeSupervisor?.managed === true,
      wouldDetachRunnerOnly: implementationReady && realStop && bridgeSupervisor?.managed !== true,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
      ...(bridgeSupervisor ? { bridgeSupervisor } : {}),
      ...(readiness ? { readiness } : {}),
      policyNotes: [
        "Provider lifecycle is separate from binding lifecycle; a provider bridge does not grant permission to expose Ambient runtime state.",
        "Real provider bridge startup must be approval-gated and tied to configured auth/session state before later ingestion can read provider messages.",
        "This lifecycle layer starts or attaches bridge process state only; inbound ingestion and outbound sending remain disabled.",
        "Messaging Connector and Remote Ambient Surface sessions remain purpose-isolated even when they share a provider adapter.",
        ...implementationPolicyNotes,
        ...readinessPolicyNotes,
      ],
      nextSteps: !implementationReady
        ? [
          "Treat this provider as metadata-only for now.",
          provider.implementation.bindingLifecycleEnabled
            ? "Only provider-specific binding tools documented in the provider notes may persist metadata; do not start lifecycle, ingest messages, or send replies until implementation status is available."
            : "Do not create bindings, start lifecycle, ingest messages, or send replies for this provider until implementation status is available.",
          "Use ambient_messaging_provider_status to inspect the provider implementation notes and plan the adapter.",
        ]
        : mode === "synthetic"
        ? [
          "Use ambient_messaging_synthetic_route to dogfood normalized inbound routing without provider network access.",
          "Use ambient_messaging_gateway_status to inspect synthetic events and queued projections.",
        ]
        : [
          ...realModeNextSteps,
          "Show the user provider auth/session, storage, network, read, and send consequences before approval.",
        ],
    };
  }

  async applyLifecycle(input: {
    action: MessagingGatewayLifecycleAction;
    providerId: string;
    mode?: MessagingGatewayLifecycleMode;
    approvalRecorded?: boolean;
  }): Promise<MessagingGatewayLifecycleApplyResult> {
    const preview = this.previewLifecycle(input);
    const approvalRecorded = input.approvalRecorded === true;
    const provider = this.providers.get(preview.providerId)?.descriptor;
    if (!provider?.implementation.runtimeLifecycleEnabled) {
      return this.blockedLifecycleApply(preview, `Messaging provider lifecycle is not implemented for ${preview.providerId}.`, approvalRecorded);
    }
    if (preview.mode === "real" && !approvalRecorded) {
      return this.blockedLifecycleApply(preview, "Real provider lifecycle changes require explicit user approval before apply.", approvalRecorded);
    }
    const record = this.adapterRecord(preview.providerId);
    const appliedAt = this.now().toISOString();

    if (preview.mode === "synthetic") {
      if (preview.action === "start") {
        record.state = "synthetic-active";
        record.mode = "synthetic";
        record.lastError = undefined;
      } else {
        record.state = "stopped";
        record.mode = "none";
        record.lastError = undefined;
      }
      record.lastActivityAt = appliedAt;
      this.status = "idle";
      this.lastError = undefined;
      return this.lifecycleApplyResult(preview, {
        applyStatus: "applied",
        applied: true,
        approvalRecorded,
      });
    }

    if (preview.action === "start") {
      const readiness = preview.readiness;
      if (!readiness) {
        return this.blockedLifecycleApply(preview, "Provider readiness must be refreshed before real bridge startup.", approvalRecorded);
      }
      if (!readiness.configured) {
        return this.blockedLifecycleApply(preview, "Telegram session metadata is not configured.", approvalRecorded);
      }
      if (!readiness.apiCredentialsPresent) {
        return this.blockedLifecycleApply(preview, "Telegram API credentials are not available to the runtime.", approvalRecorded);
      }
      if (!readiness.bridgeReachable) {
        const supervisor = this.bridgeSupervisors[preview.providerId];
        if (!supervisor) {
          return this.blockedLifecycleApply(preview, "No reachable Telegram bridge root was found, and no bridge process supervisor is registered.", approvalRecorded);
        }
        const supervisorStatus = supervisor.status();
        if (supervisorStatus.state === "missing") {
          return this.blockedLifecycleApply(preview, supervisorStatus.lastError ?? "Telegram bridge process supervisor is missing its launch target.", approvalRecorded);
        }
        const record = this.adapterRecord(preview.providerId);
        record.state = "starting";
        record.mode = "real";
        record.lastError = undefined;
        record.lastActivityAt = appliedAt;
        await supervisor.start({ readiness });
        const [refreshed] = await this.refreshProviderReadiness(preview.providerId);
        if (!refreshed?.bridgeReachable) {
          return this.blockedLifecycleApply(
            this.previewLifecycle(input),
            "Telegram bridge process was launched, but the safe root health probe is still not reachable.",
            approvalRecorded,
          );
        }
      }
      record.state = "running";
      record.mode = "real";
      record.lastActivityAt = appliedAt;
      record.lastError = undefined;
      this.status = "idle";
      this.lastError = undefined;
      return this.lifecycleApplyResult(preview, {
        applyStatus: "applied",
        applied: true,
        approvalRecorded,
      });
    }

    const supervisor = this.bridgeSupervisors[preview.providerId];
    if (supervisor?.status().managed) {
      await supervisor.stop();
    }
    record.state = "stopped";
    record.mode = "none";
    record.lastActivityAt = appliedAt;
    record.lastError = undefined;
    this.status = "idle";
    this.lastError = undefined;
    return this.lifecycleApplyResult(preview, {
      applyStatus: "applied",
      applied: true,
      approvalRecorded,
    });
  }

  async refreshProviderReadiness(providerId?: string): Promise<MessagingGatewayProviderReadiness[]> {
    const ids = providerId?.trim()
      ? [providerId.trim()]
      : Object.keys(this.readinessProbes);
    const results: MessagingGatewayProviderReadiness[] = [];
    for (const id of ids) {
      const provider = this.providers.get(id)?.descriptor;
      if (!provider) throw this.recordError(id, `Ambient messaging provider not found: ${id}`);
      const probe = this.readinessProbes[id];
      if (!probe) continue;
      const record = this.adapterRecord(id);
      try {
        const readiness = await probe();
        record.readiness = readiness;
        record.lastActivityAt = readiness.checkedAt;
        record.lastError = readiness.status === "unavailable" ? readiness.message : undefined;
        results.push(readiness);
      } catch (error) {
        const checkedAt = this.now().toISOString();
        const readiness: MessagingGatewayProviderReadiness = {
          providerId: id,
          status: "unavailable",
          configured: false,
          bridgeReachable: false,
          authNeeded: true,
          apiCredentialsPresent: false,
          persistedSessionCount: 0,
          checkedAt,
          message: error instanceof Error ? error.message : String(error),
          repairHint: "Fix the provider readiness probe before attempting real provider startup.",
          diagnostics: ["Provider readiness probe threw before completing."],
          sessions: [],
        };
        record.readiness = readiness;
        record.lastActivityAt = checkedAt;
        record.lastError = readiness.message;
        results.push(readiness);
      }
    }
    return results;
  }

  dispatchSynthetic(input: MessagingGatewaySyntheticDispatchInput): MessagingGatewaySyntheticDispatchResult {
    const providerId = input.event.providerId.trim();
    const provider = this.providers.get(providerId)?.descriptor;
    if (!provider) throw this.recordError(providerId, `Ambient messaging provider not found: ${input.event.providerId}`);

    const startedAt = this.now().toISOString();
    this.status = "dispatching";
    this.lastError = undefined;
    this.recentEvents.push(cloneInboundEvent(input.event));
    trimStart(this.recentEvents, this.maxRecentEvents);
    const record = this.adapterRecord(provider.providerId);
    record.state = "synthetic-active";
    record.mode = "synthetic";
    record.syntheticEventCount += 1;
    record.lastActivityAt = startedAt;
    record.lastError = undefined;

    try {
      const result = routeSyntheticMessagingEvent(input);
      const queuedProjection = this.queueProjection(provider.providerId, result);
      record.lastActivityAt = queuedProjection.queuedAt;
      this.status = "idle";
      return {
        ...result,
        queuedProjection,
        runtimeStatus: this.runtimeStatus(),
      };
    } catch (error) {
      throw this.recordError(provider.providerId, error instanceof Error ? error.message : String(error));
    }
  }

  dispatchInbound(input: MessagingGatewayInboundDispatchInput): MessagingGatewayInboundDispatchResult {
    const providerId = input.event.providerId.trim();
    const provider = this.providers.get(providerId)?.descriptor;
    if (!provider) throw this.recordError(providerId, `Ambient messaging provider not found: ${input.event.providerId}`);

    const startedAt = this.now().toISOString();
    const record = this.adapterRecord(provider.providerId);
    this.status = "dispatching";
    this.lastError = undefined;
    record.lastActivityAt = startedAt;
    record.lastError = undefined;

    try {
      if (input.requireRunning !== false && (record.state !== "running" || record.mode !== "real")) {
        return this.droppedInbound(provider.providerId, input.event, "Provider is not running in real inbound mode.");
      }

      const result = routeMessagingInboundEvent(input);
      const droppedReason = inboundDropReason(result);
      const outputResult = input.redactEventTextInResult ? redactRouteResultEventText(result) : result;
      if (droppedReason) {
        return this.droppedInbound(provider.providerId, outputResult.event, droppedReason, outputResult);
      }

      this.recentEvents.push(cloneInboundEvent(outputResult.event));
      trimStart(this.recentEvents, this.maxRecentEvents);
      record.state = "running";
      record.mode = "real";
      record.realEventCount += 1;
      const queuedProjection = this.queueProjection(provider.providerId, outputResult);
      record.lastActivityAt = queuedProjection.queuedAt;
      this.status = "idle";
      return {
        accepted: true,
        ...outputResult,
        queuedProjection,
        runtimeStatus: this.runtimeStatus(),
      };
    } catch (error) {
      throw this.recordError(provider.providerId, error instanceof Error ? error.message : String(error));
    }
  }

  recordOutboundDelivery(delivery: MessagingGatewayOutboundDelivery): MessagingGatewayRuntimeStatus {
    this.recentOutboundDeliveries.push(cloneOutboundDelivery(delivery));
    trimStart(this.recentOutboundDeliveries, this.maxRecentEvents);
    const record = this.adapterRecord(delivery.providerId);
    record.lastActivityAt = delivery.sentAt;
    record.lastError = delivery.status === "failed" || delivery.status === "blocked" ? delivery.error : undefined;
    this.status = delivery.status === "failed" ? "error" : "idle";
    this.lastError = delivery.status === "failed" ? delivery.error : undefined;
    return this.runtimeStatus();
  }

  private droppedInbound(
    providerId: string,
    event: MessagingInboundEvent,
    droppedReason: string,
    result?: MessagingSyntheticRouteResult,
  ): MessagingGatewayInboundDispatchResult {
    const record = this.adapterRecord(providerId);
    record.lastActivityAt = this.now().toISOString();
    record.lastError = droppedReason;
    this.status = "idle";
    this.lastError = undefined;
    return {
      accepted: false,
      droppedReason,
      event: result?.event ?? cloneInboundEvent(event),
      ...(result?.binding ? { binding: result.binding } : {}),
      ...(result?.projection ? { projection: result.projection } : {}),
      ...(result?.promptContext ? { promptContext: result.promptContext } : {}),
      runtimeStatus: this.runtimeStatus(),
    };
  }

  private queueProjection(providerId: string, result: MessagingSyntheticRouteResult): MessagingGatewayQueuedProjection {
    const queuedProjection: MessagingGatewayQueuedProjection = {
      id: `projection-${providerId}-${result.event.id}`,
      providerId,
      ...(result.event.authProfileId ? { authProfileId: result.event.authProfileId } : {}),
      conversationId: result.event.conversationId,
      ...(result.event.threadId ? { threadId: result.event.threadId } : {}),
      sourceEventId: result.event.id,
      ...(result.binding?.id ? { bindingId: result.binding.id } : {}),
      ...(result.projection.purpose ? { purpose: result.projection.purpose } : {}),
      projection: result.projection,
      queuedAt: this.now().toISOString(),
    };
    this.queuedProjections.push(cloneQueuedProjection(queuedProjection));
    trimStart(this.queuedProjections, this.maxQueuedProjections);
    const record = this.adapterRecord(providerId);
    record.queuedProjectionCount = this.queuedProjections.filter((projection) => projection.providerId === providerId).length;
    return queuedProjection;
  }

  private adapterRecord(providerId: string): AdapterRuntimeRecord {
    const existing = this.adapterStates.get(providerId);
    if (existing) return existing;
    const created = stoppedRecord();
    this.adapterStates.set(providerId, created);
    return created;
  }

  private providerRuntimeStatuses(): MessagingGatewayAdapterRuntimeStatus[] {
    const descriptors = this.providers.descriptors();
    const knownProviderIds = new Set(descriptors.map((descriptor) => descriptor.providerId));
    const knownStatuses = descriptors.map((descriptor) => this.statusForProvider(descriptor.providerId, descriptor.label));
    const unknownStatuses = [...this.adapterStates.entries()]
      .filter(([providerId]) => !knownProviderIds.has(providerId))
      .map(([providerId]) => this.statusForProvider(providerId, providerId));
    return [...knownStatuses, ...unknownStatuses].sort((a, b) => this.runtimeProviderSortRank(a.providerId) - this.runtimeProviderSortRank(b.providerId)
      || a.label.localeCompare(b.label)
      || a.providerId.localeCompare(b.providerId));
  }

  private statusForProvider(providerId: string, label: string): MessagingGatewayAdapterRuntimeStatus {
    const record = this.adapterRecord(providerId);
    return {
      providerId,
      label,
      state: record.state,
      mode: record.mode,
      syntheticEventCount: record.syntheticEventCount,
      realEventCount: record.realEventCount,
      queuedProjectionCount: record.queuedProjectionCount,
      ...(record.readiness ? { readiness: record.readiness } : {}),
      ...(record.lastActivityAt ? { lastActivityAt: record.lastActivityAt } : {}),
      ...(record.lastError ? { lastError: record.lastError } : {}),
    };
  }

  private recordError(providerId: string, message: string): Error {
    const providerIdLabel = providerId.trim() || "unknown-provider";
    const record = this.adapterRecord(providerIdLabel);
    record.state = "error";
    record.mode = record.mode === "none" ? "synthetic" : record.mode;
    record.lastError = message;
    record.lastActivityAt = this.now().toISOString();
    this.status = "error";
    this.lastError = message;
    return new Error(message);
  }

  private runtimeProviderSortRank(providerId: string): number {
    return this.providers.get(providerId)?.descriptor.implementation.status === "available" ? 0 : 1;
  }

  private blockedLifecycleApply(preview: MessagingGatewayLifecyclePreview, blockedReason: string, approvalRecorded = false): MessagingGatewayLifecycleApplyResult {
    const record = this.adapterRecord(preview.providerId);
    record.lastActivityAt = this.now().toISOString();
    record.lastError = blockedReason;
    this.status = "error";
    this.lastError = blockedReason;
    return this.lifecycleApplyResult(preview, {
      applyStatus: "blocked",
      applied: false,
      approvalRecorded,
      blockedReason,
    });
  }

  private lifecycleApplyResult(
    preview: MessagingGatewayLifecyclePreview,
    apply: {
      applyStatus: MessagingGatewayLifecycleApplyResult["applyStatus"];
      applied: boolean;
      approvalRecorded: boolean;
      blockedReason?: string;
    },
  ): MessagingGatewayLifecycleApplyResult {
    const bridgeSupervisor = this.bridgeSupervisors[preview.providerId]?.status();
    return {
      ...preview,
      ...(bridgeSupervisor ? { bridgeSupervisor } : {}),
      applyStatus: apply.applyStatus,
      applied: apply.applied,
      approvalRecorded: apply.approvalRecorded,
      ...(apply.blockedReason ? { blockedReason: apply.blockedReason } : {}),
      runtimeStatus: this.runtimeStatus(),
    };
  }
}

export function messagingGatewayRuntimeStatusText(status: MessagingGatewayRuntimeStatus): string {
  const relaySummaries = status.remoteSurfaceRelaySummaries ?? buildRemoteSurfaceRelaySummaries(status);
  const lines = [
    "Ambient messaging gateway runtime",
    `Status: ${status.status}`,
    `Providers: ${status.providerCount}`,
    `Active providers: ${status.activeProviderCount}`,
    `Synthetic-active providers: ${status.syntheticActiveProviderCount}`,
    `Queued projections: ${status.queuedProjectionCount}`,
    `Recent events: ${status.recentEventCount}`,
    `Outbound deliveries: ${status.outboundDeliveryCount}`,
    typeof status.pendingRemoteSurfaceRuntimeEventCount === "number" ? `Pending Remote Ambient Surface runtime events: ${status.pendingRemoteSurfaceRuntimeEventCount}` : undefined,
    typeof status.recentRemoteSurfaceRuntimeEventCount === "number" ? `Recent Remote Ambient Surface runtime events: ${status.recentRemoteSurfaceRuntimeEventCount}` : undefined,
    typeof status.relayableRemoteSurfaceRuntimeEventCount === "number" ? `Relayable Remote Ambient Surface runtime events: ${status.relayableRemoteSurfaceRuntimeEventCount}` : undefined,
    typeof status.alreadyRelayedRemoteSurfaceRuntimeEventCount === "number" ? `Already relayed Remote Ambient Surface runtime events: ${status.alreadyRelayedRemoteSurfaceRuntimeEventCount}` : undefined,
    status.lastError ? `Last error: ${status.lastError}` : undefined,
    "",
    "Providers:",
  ].filter((line): line is string => Boolean(line));
  for (const provider of status.providers) {
    lines.push(`- ${provider.label} (${provider.providerId})`);
    lines.push(`  State: ${provider.state}`);
    lines.push(`  Mode: ${provider.mode}`);
    lines.push(`  Synthetic events: ${provider.syntheticEventCount}`);
    lines.push(`  Real events: ${provider.realEventCount}`);
    lines.push(`  Queued projections: ${provider.queuedProjectionCount}`);
    if (provider.lastActivityAt) lines.push(`  Last activity: ${provider.lastActivityAt}`);
    if (provider.lastError) lines.push(`  Last error: ${provider.lastError}`);
    if (provider.readiness) {
      lines.push(`  Readiness: ${provider.readiness.status}`);
      lines.push(`  Bridge reachable: ${provider.readiness.bridgeReachable ? "yes" : "no"}`);
      lines.push(`  Configured: ${provider.readiness.configured ? "yes" : "no"}`);
      lines.push(`  Auth needed: ${provider.readiness.authNeeded ? "yes" : "no"}`);
      lines.push(`  API credentials present: ${provider.readiness.apiCredentialsPresent ? "yes" : "no"}`);
      lines.push(`  Persisted sessions: ${provider.readiness.persistedSessionCount}`);
      if (typeof provider.readiness.bridgeSessionCount === "number") lines.push(`  Bridge sessions: ${provider.readiness.bridgeSessionCount}`);
      lines.push(`  Readiness message: ${provider.readiness.message}`);
      if (provider.readiness.repairHint) lines.push(`  Readiness repair: ${provider.readiness.repairHint}`);
      if (provider.readiness.diagnostics.length) {
        lines.push("  Readiness diagnostics:");
        for (const diagnostic of provider.readiness.diagnostics) {
          lines.push(`    - ${diagnostic}`);
        }
      }
    }
  }
  if (status.queuedProjections.length) {
    lines.push("", "Queued projection previews:");
    for (const projection of status.queuedProjections.slice(-5)) {
      lines.push(`- ${projection.id}`);
      lines.push(`  Provider: ${projection.providerId}`);
      if (projection.authProfileId) lines.push(`  Profile: ${projection.authProfileId}`);
      lines.push(`  Conversation: ${projection.conversationId}${projection.threadId ? ` / ${projection.threadId}` : ""}`);
      lines.push(`  Source event: ${projection.sourceEventId}`);
      if (projection.bindingId) lines.push(`  Binding: ${projection.bindingId}`);
      if (projection.purpose) lines.push(`  Purpose: ${projection.purpose}`);
      lines.push(`  Projection: ${projection.projection.title} (${projection.projection.kind})`);
      lines.push(`  Summary: ${projection.projection.summary}`);
    }
  }
  if (status.remoteSurfaceRuntimeEvents?.length) {
    lines.push("", "Remote Ambient Surface runtime events:");
    for (const event of status.remoteSurfaceRuntimeEvents.slice(-5)) {
      const relaySummary = relaySummaries.find((summary) => summary.runtimeEventId === event.id);
      lines.push(`- ${event.title}`);
      lines.push(`  Status: ${event.status}`);
      lines.push(`  Summary: ${event.summary}`);
      if (event.projectName) lines.push(`  Project: ${event.projectName}`);
      if (event.queuedProjectionId) lines.push(`  Queued projection: ${event.queuedProjectionId}`);
      if (event.bindingId) lines.push(`  Binding: ${event.bindingId}`);
      lines.push(`  Scheduled: ${event.scheduledAt}`);
      if (event.completedAt) lines.push(`  Completed: ${event.completedAt}`);
      if (event.failedAt) lines.push(`  Failed: ${event.failedAt}`);
      if (event.canceledAt) lines.push(`  Canceled: ${event.canceledAt}`);
      if (event.error) lines.push(`  Error: ${event.error}`);
      lines.push(`  Relay suggested: ${event.relaySuggested ? "yes" : "no"}`);
      lines.push(`  Event id: ${event.id}`);
      if (event.relayStatus) lines.push(`  Relay status: ${event.relayStatus}`);
      if (event.relayProviderId) lines.push(`  Relay provider: ${event.relayProviderId}`);
      if (event.relayDeliveryId) lines.push(`  Relay delivery: ${event.relayDeliveryId}`);
      if (event.relayedAt) lines.push(`  Relayed: ${event.relayedAt}`);
      if (event.relayError) lines.push(`  Relay error: ${event.relayError}`);
      if (relaySummary) lines.push(...relaySummaryTextLines(relaySummary));
    }
  }
  if (status.recentOutboundDeliveries.length) {
    lines.push("", "Recent outbound deliveries:");
    for (const delivery of status.recentOutboundDeliveries.slice(-5)) {
      lines.push(`- ${delivery.id}`);
      lines.push(`  Provider: ${delivery.providerId}`);
      if (delivery.authProfileId) lines.push(`  Profile: ${delivery.authProfileId}`);
      lines.push(`  Conversation: ${delivery.conversationId}${delivery.threadId ? ` / ${delivery.threadId}` : ""}`);
      lines.push(`  Status: ${delivery.status}`);
      if (delivery.sourceProjectionId) lines.push(`  Source projection: ${delivery.sourceProjectionId}`);
      if (delivery.bindingId) lines.push(`  Binding: ${delivery.bindingId}`);
      if (delivery.runtimeEventId) lines.push(`  Runtime event: ${delivery.runtimeEventId}`);
      if (delivery.providerMessageId) lines.push(`  Provider message: ${delivery.providerMessageId}`);
      if (delivery.error) lines.push(`  Error: ${delivery.error}`);
      lines.push(`  Text preview: ${delivery.textPreview}`);
    }
  }
  return lines.join("\n");
}

export function messagingGatewayInboundDispatchText(result: MessagingGatewayInboundDispatchResult): string {
  const lines = [
    "Ambient messaging inbound dispatch",
    `Accepted: ${result.accepted ? "yes" : "no"}`,
    result.droppedReason ? `Dropped reason: ${result.droppedReason}` : undefined,
    `Provider: ${result.event.providerId}`,
    result.event.authProfileId ? `Profile: ${result.event.authProfileId}` : undefined,
    `Conversation: ${result.event.conversationId}${result.event.threadId ? ` / ${result.event.threadId}` : ""}`,
    `Sender: ${result.event.sender.id}${result.event.sender.label ? ` (${result.event.sender.label})` : ""}`,
    `Message: ${result.event.id}`,
    result.binding ? `Binding: ${result.binding.id}` : undefined,
    result.projection ? `Projection: ${result.projection.title} (${result.projection.kind})` : undefined,
    result.queuedProjection ? `Queued projection: ${result.queuedProjection.id}` : undefined,
    "",
    "Boundaries:",
    "- Real inbound dispatch never sends provider messages.",
    "- Events without an active Remote Ambient Surface binding are dropped before queueing.",
    "- Events whose sender does not match the bound owner are dropped before queueing.",
    "",
    "Runtime status:",
    `- Gateway state: ${result.runtimeStatus.status}`,
    `- Queued projections: ${result.runtimeStatus.queuedProjectionCount}`,
    `- Recent events: ${result.runtimeStatus.recentEventCount}`,
  ].filter((line): line is string => line !== undefined);
  if (result.projection) {
    lines.push("", messagingProjectionText(result.projection));
  }
  return lines.join("\n");
}

export function messagingGatewayLifecyclePreviewText(preview: MessagingGatewayLifecyclePreview): string {
  return [
    `Ambient messaging gateway lifecycle ${preview.action} preview`,
    `Provider: ${preview.label} (${preview.providerId})`,
    `Mode: ${preview.mode}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Would start real bridge: ${preview.wouldStartRealBridge ? "yes" : "no"}`,
    `Would stop real bridge: ${preview.wouldStopRealBridge ? "yes" : "no"}`,
    `Would attach existing bridge: ${preview.wouldAttachExistingBridge ? "yes" : "no"}`,
    `Would launch bridge process: ${preview.wouldLaunchBridgeProcess ? "yes" : "no"}`,
    `Would stop bridge process: ${preview.wouldStopBridgeProcess ? "yes" : "no"}`,
    `Would detach runner only: ${preview.wouldDetachRunnerOnly ? "yes" : "no"}`,
    `Would read provider messages: ${preview.wouldReadProviderMessages ? "yes" : "no"}`,
    `Would send provider messages: ${preview.wouldSendProviderMessages ? "yes" : "no"}`,
    preview.bridgeSupervisor ? `Bridge supervisor: ${preview.bridgeSupervisor.state}` : undefined,
    preview.bridgeSupervisor ? `Bridge command: ${preview.bridgeSupervisor.command} ${preview.bridgeSupervisor.args.join(" ")}` : undefined,
    preview.readiness ? `Readiness: ${preview.readiness.status}` : undefined,
    preview.readiness ? `Readiness message: ${preview.readiness.message}` : undefined,
    "",
    "Policy notes:",
    ...preview.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...preview.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function messagingGatewayLifecycleApplyResultText(result: MessagingGatewayLifecycleApplyResult): string {
  return [
    `Ambient messaging gateway lifecycle ${result.action} apply`,
    `Provider: ${result.label} (${result.providerId})`,
    `Mode: ${result.mode}`,
    `Apply status: ${result.applyStatus}`,
    `Applied: ${result.applied ? "yes" : "no"}`,
    `Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    result.blockedReason ? `Blocked reason: ${result.blockedReason}` : undefined,
    result.readiness ? `Readiness: ${result.readiness.status}` : undefined,
    result.readiness ? `Readiness message: ${result.readiness.message}` : undefined,
    result.bridgeSupervisor ? `Bridge supervisor: ${result.bridgeSupervisor.state}` : undefined,
    "",
    "Bridge boundaries:",
    `- Would attach existing bridge: ${result.wouldAttachExistingBridge ? "yes" : "no"}`,
    `- Would launch bridge process: ${result.wouldLaunchBridgeProcess ? "yes" : "no"}`,
    `- Would stop bridge process: ${result.wouldStopBridgeProcess ? "yes" : "no"}`,
    `- Would detach runner only: ${result.wouldDetachRunnerOnly ? "yes" : "no"}`,
    `- Would read provider messages: ${result.wouldReadProviderMessages ? "yes" : "no"}`,
    `- Would send provider messages: ${result.wouldSendProviderMessages ? "yes" : "no"}`,
    "",
    "Runtime status:",
    `- Gateway state: ${result.runtimeStatus.status}`,
    `- Active providers: ${result.runtimeStatus.activeProviderCount}`,
    `- Queued projections: ${result.runtimeStatus.queuedProjectionCount}`,
    "",
    "Policy notes:",
    ...result.policyNotes.map((note) => `- ${note}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function messagingGatewayQueuedProjectionText(projection: MessagingGatewayQueuedProjection): string {
  return [
    `Queued messaging projection: ${projection.id}`,
    `Provider: ${projection.providerId}`,
    `Conversation: ${projection.conversationId}${projection.threadId ? ` / ${projection.threadId}` : ""}`,
    `Source event: ${projection.sourceEventId}`,
    projection.bindingId ? `Binding: ${projection.bindingId}` : undefined,
    projection.purpose ? `Purpose: ${projection.purpose}` : undefined,
    `Queued at: ${projection.queuedAt}`,
    "",
    messagingProjectionText(projection.projection),
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function stoppedRecord(): AdapterRuntimeRecord {
  return {
    state: "stopped",
    mode: "none",
    syntheticEventCount: 0,
    realEventCount: 0,
    queuedProjectionCount: 0,
  };
}

function inboundDropReason(result: MessagingSyntheticRouteResult): string | undefined {
  if (!result.binding) return "No active Remote Ambient Surface binding matches this Telegram event.";
  if (result.binding.purpose !== "remote_ambient_surface") return "Matched binding is not a Remote Ambient Surface binding.";
  if (result.projection.kind === "sender_not_authorized") return "Sender does not match the Remote Ambient Surface owner binding.";
  return undefined;
}

function readinessNextSteps(readiness: MessagingGatewayProviderReadiness): string[] {
  if (!readiness.configured) {
    return [
      "Create or bind a Telegram auth profile/session before real bridge startup.",
      "Keep real inbound ingestion disabled until the approved session exists.",
    ];
  }
  if (!readiness.apiCredentialsPresent) {
    return [
      "Bind Telegram API credentials through Ambient-managed secret/env flow before real bridge startup.",
      "Keep secret values out of chat, tool arguments, logs, descriptors, and artifacts.",
    ];
  }
  if (!readiness.bridgeReachable) {
    return [
      "Preview and approve starting the local Telegram bridge process.",
      "After startup, refresh readiness again before enabling inbound ingestion.",
    ];
  }
  return [
    "Refresh or verify Telegram session status through an approval-gated adapter path before inbound ingestion.",
    "Keep outbound send disabled until a purpose-scoped binding and send approval policy are in place.",
  ];
}

function trimStart<T>(items: T[], max: number): void {
  while (items.length > max) items.shift();
}

function cloneInboundEvent(event: MessagingInboundEvent): MessagingInboundEvent {
  return JSON.parse(JSON.stringify(event)) as MessagingInboundEvent;
}

function redactRouteResultEventText(result: MessagingSyntheticRouteResult): MessagingSyntheticRouteResult {
  return {
    ...result,
    event: {
      ...result.event,
      text: "[provider message text withheld]",
    },
  };
}

function cloneQueuedProjection(projection: MessagingGatewayQueuedProjection): MessagingGatewayQueuedProjection {
  return JSON.parse(JSON.stringify(projection)) as MessagingGatewayQueuedProjection;
}

function cloneOutboundDelivery(delivery: MessagingGatewayOutboundDelivery): MessagingGatewayOutboundDelivery {
  return JSON.parse(JSON.stringify(delivery)) as MessagingGatewayOutboundDelivery;
}
