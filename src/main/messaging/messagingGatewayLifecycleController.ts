import type {
  MessagingGatewayLifecycleAction,
  MessagingGatewayLifecycleApplyResult,
  MessagingGatewayLifecycleMode,
  MessagingGatewayLifecyclePreview,
  MessagingGatewayProviderReadiness,
  MessagingGatewayRuntimeState,
  MessagingGatewayRuntimeStatus,
} from "../../shared/messagingGateway";
import type {
  AdapterRuntimeRecord,
  MessagingGatewayBridgeSupervisor,
  MessagingGatewayProviderRegistryLike,
} from "./messagingGatewayRunner";

export interface MessagingGatewayLifecycleControllerOptions {
  providers: MessagingGatewayProviderRegistryLike;
  bridgeSupervisors: Record<string, MessagingGatewayBridgeSupervisor>;
  now: () => Date;
  adapterRecord: (providerId: string) => AdapterRuntimeRecord;
  refreshProviderReadiness: (providerId?: string) => Promise<MessagingGatewayProviderReadiness[]>;
  runtimeStatus: () => MessagingGatewayRuntimeStatus;
  recordError: (providerId: string, message: string) => Error;
  setRuntimeState: (status: MessagingGatewayRuntimeState, lastError?: string) => void;
}

export class MessagingGatewayLifecycleController {
  private readonly providers: MessagingGatewayProviderRegistryLike;
  private readonly bridgeSupervisors: Record<string, MessagingGatewayBridgeSupervisor>;
  private readonly now: () => Date;
  private readonly adapterRecord: (providerId: string) => AdapterRuntimeRecord;
  private readonly refreshProviderReadiness: (providerId?: string) => Promise<MessagingGatewayProviderReadiness[]>;
  private readonly runtimeStatus: () => MessagingGatewayRuntimeStatus;
  private readonly recordError: (providerId: string, message: string) => Error;
  private readonly setRuntimeState: (status: MessagingGatewayRuntimeState, lastError?: string) => void;

  constructor(options: MessagingGatewayLifecycleControllerOptions) {
    this.providers = options.providers;
    this.bridgeSupervisors = options.bridgeSupervisors;
    this.now = options.now;
    this.adapterRecord = options.adapterRecord;
    this.refreshProviderReadiness = options.refreshProviderReadiness;
    this.runtimeStatus = options.runtimeStatus;
    this.recordError = options.recordError;
    this.setRuntimeState = options.setRuntimeState;
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
    const canApplyRealStart = Boolean(
      readiness?.configured && readiness.apiCredentialsPresent && (readiness.bridgeReachable || canLaunchBridgeProcess),
    );
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
          : [...realModeNextSteps, "Show the user provider auth/session, storage, network, read, and send consequences before approval."],
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
      return this.blockedLifecycleApply(
        preview,
        `Messaging provider lifecycle is not implemented for ${preview.providerId}.`,
        approvalRecorded,
      );
    }
    if (preview.mode === "real" && !approvalRecorded) {
      return this.blockedLifecycleApply(
        preview,
        "Real provider lifecycle changes require explicit user approval before apply.",
        approvalRecorded,
      );
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
      this.setRuntimeState("idle");
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
          return this.blockedLifecycleApply(
            preview,
            "No reachable Telegram bridge root was found, and no bridge process supervisor is registered.",
            approvalRecorded,
          );
        }
        const supervisorStatus = supervisor.status();
        if (supervisorStatus.state === "missing") {
          return this.blockedLifecycleApply(
            preview,
            supervisorStatus.lastError ?? "Telegram bridge process supervisor is missing its launch target.",
            approvalRecorded,
          );
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
      this.setRuntimeState("idle");
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
    this.setRuntimeState("idle");
    return this.lifecycleApplyResult(preview, {
      applyStatus: "applied",
      applied: true,
      approvalRecorded,
    });
  }

  private blockedLifecycleApply(
    preview: MessagingGatewayLifecyclePreview,
    blockedReason: string,
    approvalRecorded = false,
  ): MessagingGatewayLifecycleApplyResult {
    const record = this.adapterRecord(preview.providerId);
    record.lastActivityAt = this.now().toISOString();
    record.lastError = blockedReason;
    this.setRuntimeState("error", blockedReason);
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
