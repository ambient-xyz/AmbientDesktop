import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { resolve } from "node:path";

import type {
  EmbeddingProviderCandidate,
  LocalModelHostMemorySnapshot,
  LocalModelResourceRequestedLaunch,
  LocalModelRuntimeLifecycleActionKind,
  LocalModelResourceSettings,
  LocalRuntimeInventoryEntry,
  LocalRuntimeLeaseRecord,
  VoiceProviderCandidate,
  WorkspaceState,
} from "../../shared/types";
import { localRuntimeToolDescriptor } from "../desktopToolRegistry";
import { registerDesktopTool } from "../desktopToolRegistration";
import {
  buildLocalModelRuntimeStatusSnapshot,
  localModelRuntimeStatusText,
} from "./localModelRuntimeStatus";
import { DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS } from "./localRuntimeInventory";
import { localModelRuntimeLifecycleRequestedLaunch } from "./localModelRuntimeLifecycleLaunch";
import {
  localModelRuntimeStartText,
  localModelRuntimeStartToolResult,
  planLocalModelRuntimeStart,
  type LocalModelRuntimeStartRequest,
} from "./localModelRuntimeStart";
import {
  localModelRuntimeRestartText,
  localModelRuntimeRestartToolResult,
  planLocalModelRuntimeRestart,
  type LocalModelRuntimeRestartRequest,
} from "./localModelRuntimeRestart";
import {
  localRuntimeOwnershipResolutionAfterInventoryRefresh,
  localRuntimeOwnershipResolutionBlocked,
  localRuntimeOwnershipResolutionFailed,
  localRuntimeOwnershipResolutionRequest,
  type LocalRuntimeOwnershipResolutionResult,
  type ResolveLocalRuntimeOwnership,
} from "./localRuntimeOwnershipResolution";
import {
  localModelRuntimeStopText,
  localModelRuntimeStopToolResult,
  planLocalModelRuntimeStop,
  type LocalModelRuntimeStopRequest,
} from "./localModelRuntimeStop";
import { LOCAL_TEXT_RUNTIME_STATE_ROOT } from "./localTextDelegation";
import type {
  LocalModelRuntimeRestartInput,
  LocalModelRuntimeRestartResult,
  LocalModelRuntimeStartInput,
  LocalModelRuntimeStartResult,
  LocalModelRuntimeStopInput,
  LocalModelRuntimeStopResult,
} from "./localModelRuntimeManager";
import {
  runLocalRuntimeProviderLifecycleAction,
  type LocalRuntimeProviderLifecycleResult,
} from "./localRuntimeProviderLifecycle";

export interface AgentRuntimeLocalRuntimeToolExtensionOptions {
  workspace: Pick<WorkspaceState, "path">;
  getLocalModelResourceSettings?: () => LocalModelResourceSettings | undefined;
  getHostMemory?: () => LocalModelHostMemorySnapshot | undefined;
  getActiveRuntimeLeases?: () => LocalRuntimeLeaseRecord[];
  getVoiceProviders?: () => Promise<VoiceProviderCandidate[]> | VoiceProviderCandidate[];
  getEmbeddingProviders?: () => Promise<EmbeddingProviderCandidate[]> | EmbeddingProviderCandidate[];
  startRuntime?: (input: LocalModelRuntimeStartInput) => Promise<LocalModelRuntimeStartResult>;
  stopRuntime?: (input: LocalModelRuntimeStopInput) => Promise<LocalModelRuntimeStopResult>;
  restartRuntime?: (input: LocalModelRuntimeRestartInput) => Promise<LocalModelRuntimeRestartResult>;
  resolveLocalRuntimeOwnership?: ResolveLocalRuntimeOwnership;
  runProviderLifecycleAction?: (input: {
    entry: LocalRuntimeInventoryEntry;
    action: LocalModelRuntimeLifecycleActionKind;
  }) => Promise<LocalRuntimeProviderLifecycleResult>;
  now?: () => Date;
}

export function createLocalRuntimeToolExtension(
  options: AgentRuntimeLocalRuntimeToolExtensionOptions,
): ExtensionFactory {
  return (pi) => {
    const readStatusSnapshot = async (input: {
      includeStopped?: boolean;
      requestedLaunch?: LocalModelResourceRequestedLaunch;
    } = {}) => buildLocalModelRuntimeStatusSnapshot({
      workspacePath: options.workspace.path,
      settings: options.getLocalModelResourceSettings?.(),
      hostMemory: options.getHostMemory?.(),
      requestedLaunch: input.requestedLaunch,
      leases: options.getActiveRuntimeLeases?.() ?? [],
      voiceProviders: await Promise.resolve(options.getVoiceProviders?.() ?? []).catch(() => []),
      embeddingProviders: await Promise.resolve(options.getEmbeddingProviders?.() ?? []).catch(() => []),
      includeStopped: input.includeStopped,
      leaseStaleMs: DEFAULT_LOCAL_RUNTIME_LEASE_STALE_MS,
      now: options.now,
    });

    registerDesktopTool(pi, localRuntimeToolDescriptor("ambient_local_model_runtime_status"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const input = localRuntimeStatusInput(params);
        const snapshot = await readStatusSnapshot({ includeStopped: input.includeStopped });
        return localRuntimeToolResult(localModelRuntimeStatusText(snapshot, { limit: input.limit }), {
          toolName: "ambient_local_model_runtime_status",
          status: "complete",
          ...snapshot,
        });
      },
    });

    registerDesktopTool(pi, localRuntimeToolDescriptor("ambient_local_model_runtime_start"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const input = localRuntimeStartInput(params);
        let before = await readStatusSnapshot({ includeStopped: true });
        let plan = planLocalModelRuntimeStart({
          inventory: before.inventory,
          request: input,
        });
        const requestedLaunch = localModelRuntimeLifecycleRequestedLaunch({
          action: "start",
          entry: plan.entry,
        });
        if (requestedLaunch) {
          before = await readStatusSnapshot({ includeStopped: true, requestedLaunch });
          plan = planLocalModelRuntimeStart({
            inventory: before.inventory,
            request: input,
          });
        }
        const managerResult = plan.status === "ready" && !plan.dryRun && options.startRuntime && plan.entry?.capability === "local-text" && plan.entry.modelRuntimeId
          ? await options.startRuntime({
              runtimeId: plan.entry.modelRuntimeId,
              stateRootPath: resolve(options.workspace.path, LOCAL_TEXT_RUNTIME_STATE_ROOT),
            })
          : undefined;
        const providerResult = plan.status === "ready" && !plan.dryRun && plan.entry?.capability !== "local-text" && plan.entry?.providerLifecycle
          ? await runProviderLifecycle(options, { entry: plan.entry, action: "start" })
          : undefined;
        const result = localModelRuntimeStartToolResult({ plan, startResult: managerResult, providerResult });
        const after = result.status === "started"
          ? await readStatusSnapshot({ includeStopped: true })
          : undefined;
        return localRuntimeToolResult(localModelRuntimeStartText(result), {
          toolName: "ambient_local_model_runtime_start",
          status: result.status,
          before,
          ...(after ? { after } : {}),
          result,
        });
      },
    });

    registerDesktopTool(pi, localRuntimeToolDescriptor("ambient_local_model_runtime_stop"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const input = localRuntimeStopInput(params);
        const before = await readStatusSnapshot({ includeStopped: true });
        let plan = planLocalModelRuntimeStop({
          inventory: before.inventory,
          request: input,
        });
        let ownershipResolution = await resolveForcedStopOwnership({
          plan,
          resolver: options.resolveLocalRuntimeOwnership,
        });
        if (ownershipResolution?.status === "resolved") {
          const updated = await readStatusSnapshot({ includeStopped: true });
          plan = planLocalModelRuntimeStop({
            inventory: updated.inventory,
            request: input,
          });
          ownershipResolution = localRuntimeOwnershipResolutionAfterInventoryRefresh({
            result: ownershipResolution,
            action: "stop",
            entry: plan.entry,
          });
        }
        const managerResult = plan.status === "ready" && !plan.dryRun && options.stopRuntime && plan.entry?.capability === "local-text" && plan.entry.modelRuntimeId
          ? await options.stopRuntime({
              runtimeId: plan.entry.modelRuntimeId,
              stateRootPath: resolve(options.workspace.path, LOCAL_TEXT_RUNTIME_STATE_ROOT),
              force: plan.forceRequested,
            })
          : undefined;
        const providerResult = plan.status === "ready" && !plan.dryRun && plan.entry?.capability !== "local-text" && plan.entry?.providerLifecycle
          ? await runProviderLifecycle(options, { entry: plan.entry, action: "stop" })
          : undefined;
        const result = localModelRuntimeStopToolResult({ plan, stopResult: managerResult, providerResult, ownershipResolution });
        const after = result.status === "stopped"
          ? await readStatusSnapshot({ includeStopped: true })
          : undefined;
        return localRuntimeToolResult(localModelRuntimeStopText(result), {
          toolName: "ambient_local_model_runtime_stop",
          status: result.status,
          before,
          ...(after ? { after } : {}),
          result,
        });
      },
    });

    registerDesktopTool(pi, localRuntimeToolDescriptor("ambient_local_model_runtime_restart"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const input = localRuntimeRestartInput(params);
        let before = await readStatusSnapshot({ includeStopped: true });
        let plan = planLocalModelRuntimeRestart({
          inventory: before.inventory,
          request: input,
        });
        const requestedLaunch = localModelRuntimeLifecycleRequestedLaunch({
          action: "restart",
          entry: plan.entry,
        });
        if (requestedLaunch) {
          before = await readStatusSnapshot({ includeStopped: true, requestedLaunch });
          plan = planLocalModelRuntimeRestart({
            inventory: before.inventory,
            request: input,
          });
        }
        let ownershipResolution = await resolveForcedRestartOwnership({
          plan,
          resolver: options.resolveLocalRuntimeOwnership,
        });
        if (ownershipResolution?.status === "resolved") {
          const updated = await readStatusSnapshot({ includeStopped: true });
          plan = planLocalModelRuntimeRestart({
            inventory: updated.inventory,
            request: input,
          });
          ownershipResolution = localRuntimeOwnershipResolutionAfterInventoryRefresh({
            result: ownershipResolution,
            action: "restart",
            entry: plan.entry,
          });
        }
        const managerResult = plan.status === "ready" && !plan.dryRun && options.restartRuntime && plan.entry?.capability === "local-text" && plan.entry.modelRuntimeId
          ? await options.restartRuntime({
              runtimeId: plan.entry.modelRuntimeId,
              stateRootPath: resolve(options.workspace.path, LOCAL_TEXT_RUNTIME_STATE_ROOT),
              force: plan.forceRequested,
            })
          : undefined;
        const providerResult = plan.status === "ready" && !plan.dryRun && plan.entry?.capability !== "local-text" && plan.entry?.providerLifecycle
          ? await runProviderLifecycle(options, { entry: plan.entry, action: "restart" })
          : undefined;
        const result = localModelRuntimeRestartToolResult({ plan, restartResult: managerResult, providerResult, ownershipResolution });
        const after = result.status === "restarted"
          ? await readStatusSnapshot({ includeStopped: true })
          : undefined;
        return localRuntimeToolResult(localModelRuntimeRestartText(result), {
          toolName: "ambient_local_model_runtime_restart",
          status: result.status,
          before,
          ...(after ? { after } : {}),
          result,
        });
      },
    });
  };
}

async function runProviderLifecycle(
  options: AgentRuntimeLocalRuntimeToolExtensionOptions,
  input: { entry: LocalRuntimeInventoryEntry; action: LocalModelRuntimeLifecycleActionKind },
): Promise<LocalRuntimeProviderLifecycleResult> {
  if (options.runProviderLifecycleAction) return options.runProviderLifecycleAction(input);
  return runLocalRuntimeProviderLifecycleAction({
    workspacePath: options.workspace.path,
    entry: input.entry,
    action: input.action,
  });
}

async function resolveForcedStopOwnership(input: {
  plan: ReturnType<typeof planLocalModelRuntimeStop>;
  resolver?: ResolveLocalRuntimeOwnership;
}): Promise<LocalRuntimeOwnershipResolutionResult | undefined> {
  const decision = input.plan.entry?.lifecycleDecision.stop;
  if (
    input.plan.status !== "blocked" ||
    !input.plan.forceRequested ||
    input.plan.dryRun ||
    !input.plan.entry ||
    !decision?.forceAllowed ||
    !decision.forceRequiresSubagentCancellation
  ) {
    return undefined;
  }
  const request = localRuntimeOwnershipResolutionRequest({
    action: "stop",
    runtimeId: input.plan.runtimeId,
    entry: input.plan.entry,
  });
  if (!input.resolver) return localRuntimeOwnershipResolutionBlocked(request);
  try {
    return await input.resolver(request);
  } catch (error) {
    return localRuntimeOwnershipResolutionFailed(request, error);
  }
}

async function resolveForcedRestartOwnership(input: {
  plan: ReturnType<typeof planLocalModelRuntimeRestart>;
  resolver?: ResolveLocalRuntimeOwnership;
}): Promise<LocalRuntimeOwnershipResolutionResult | undefined> {
  const decision = input.plan.entry?.lifecycleDecision.restart;
  if (
    input.plan.status !== "blocked" ||
    !input.plan.forceRequested ||
    input.plan.dryRun ||
    !input.plan.entry ||
    !decision?.forceAllowed ||
    !decision.forceRequiresSubagentCancellation
  ) {
    return undefined;
  }
  const request = localRuntimeOwnershipResolutionRequest({
    action: "restart",
    runtimeId: input.plan.runtimeId,
    entry: input.plan.entry,
  });
  if (!input.resolver) return localRuntimeOwnershipResolutionBlocked(request);
  try {
    return await input.resolver(request);
  } catch (error) {
    return localRuntimeOwnershipResolutionFailed(request, error);
  }
}

function localRuntimeStartInput(params: unknown): LocalModelRuntimeStartRequest {
  const record = params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const runtimeId = typeof record.runtimeId === "string" ? record.runtimeId.trim() : "";
  if (!runtimeId) throw new Error("ambient_local_model_runtime_start requires runtimeId.");
  return {
    runtimeId,
    ...(typeof record.dryRun === "boolean" ? { dryRun: record.dryRun } : {}),
  };
}

function localRuntimeStatusInput(params: unknown): { includeStopped?: boolean; limit?: number } {
  const record = params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const includeStopped = typeof record.includeStopped === "boolean" ? record.includeStopped : undefined;
  const rawLimit = typeof record.limit === "number" && Number.isFinite(record.limit) ? record.limit : undefined;
  const limit = rawLimit === undefined ? undefined : Math.max(1, Math.min(50, Math.floor(rawLimit)));
  return {
    ...(includeStopped !== undefined ? { includeStopped } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

function localRuntimeStopInput(params: unknown): LocalModelRuntimeStopRequest {
  const record = params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const runtimeId = typeof record.runtimeId === "string" ? record.runtimeId.trim() : "";
  if (!runtimeId) throw new Error("ambient_local_model_runtime_stop requires runtimeId.");
  return {
    runtimeId,
    ...(typeof record.force === "boolean" ? { force: record.force } : {}),
    ...(typeof record.dryRun === "boolean" ? { dryRun: record.dryRun } : {}),
  };
}

function localRuntimeRestartInput(params: unknown): LocalModelRuntimeRestartRequest {
  const record = params && typeof params === "object" && !Array.isArray(params)
    ? params as Record<string, unknown>
    : {};
  const runtimeId = typeof record.runtimeId === "string" ? record.runtimeId.trim() : "";
  if (!runtimeId) throw new Error("ambient_local_model_runtime_restart requires runtimeId.");
  return {
    runtimeId,
    ...(typeof record.force === "boolean" ? { force: record.force } : {}),
    ...(typeof record.dryRun === "boolean" ? { dryRun: record.dryRun } : {}),
  };
}

function localRuntimeToolResult(text: string, details: Record<string, unknown>): {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
} {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-local-model-runtime",
      ...details,
    },
  };
}
