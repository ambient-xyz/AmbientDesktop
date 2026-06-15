import { resolve } from "node:path";
import type {
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
  LocalModelRuntimeLifecycleActionSnapshot,
} from "../shared/types";
import type {
  LocalModelRuntimeRestartInput,
  LocalModelRuntimeRestartResult,
  LocalModelRuntimeStartInput,
  LocalModelRuntimeStartResult,
  LocalModelRuntimeStopInput,
  LocalModelRuntimeStopResult,
} from "./localModelRuntimeManager";
import type { LocalModelRequestedLaunch } from "./localModelResourceRegistry";
import type { LocalModelRuntimeStatusSnapshot } from "./localModelRuntimeStatus";
import { localModelRuntimeLifecycleRequestedLaunch } from "./localModelRuntimeLifecycleLaunch";
import {
  localModelRuntimeStartText,
  localModelRuntimeStartToolResult,
  planLocalModelRuntimeStart,
} from "./localModelRuntimeStart";
import {
  localModelRuntimeRestartText,
  localModelRuntimeRestartToolResult,
  planLocalModelRuntimeRestart,
  type LocalModelRuntimeRestartPlan,
} from "./localModelRuntimeRestart";
import {
  localModelRuntimeStopText,
  localModelRuntimeStopToolResult,
  planLocalModelRuntimeStop,
  type LocalModelRuntimeStopPlan,
} from "./localModelRuntimeStop";
import {
  localRuntimeOwnershipResolutionAfterInventoryRefresh,
  type LocalRuntimeOwnershipResolutionResult,
} from "./localRuntimeOwnershipResolution";
import {
  runLocalRuntimeProviderLifecycleAction,
  type LocalRuntimeProviderLifecycleResult,
} from "./localRuntimeProviderLifecycle";
import { LOCAL_TEXT_RUNTIME_STATE_ROOT } from "./localTextDelegation";

export interface AgentRuntimeLocalRuntimeLifecycleActionOptions {
  input: LocalModelRuntimeLifecycleActionInput;
  workspacePath: string;
  readStatus: (
    workspacePath: string,
    requestedLaunch?: LocalModelRequestedLaunch,
  ) => Promise<LocalModelRuntimeStatusSnapshot>;
  startRuntime: (input: LocalModelRuntimeStartInput) => Promise<LocalModelRuntimeStartResult>;
  stopRuntime: (input: LocalModelRuntimeStopInput) => Promise<LocalModelRuntimeStopResult>;
  restartRuntime: (input: LocalModelRuntimeRestartInput) => Promise<LocalModelRuntimeRestartResult>;
  resolveOwnershipForStopPlan: (
    plan: LocalModelRuntimeStopPlan,
  ) => Promise<LocalRuntimeOwnershipResolutionResult | undefined>;
  resolveOwnershipForRestartPlan: (
    plan: LocalModelRuntimeRestartPlan,
  ) => Promise<LocalRuntimeOwnershipResolutionResult | undefined>;
  runProviderLifecycleAction?: typeof runLocalRuntimeProviderLifecycleAction;
}

export async function runAgentRuntimeLocalModelRuntimeLifecycleAction(
  options: AgentRuntimeLocalRuntimeLifecycleActionOptions,
): Promise<LocalModelRuntimeLifecycleActionResult> {
  const { input, workspacePath } = options;
  const runtimeId = input.runtimeId.trim();
  let beforeStatus = await options.readStatus(workspacePath);
  const stateRootPath = resolve(workspacePath, LOCAL_TEXT_RUNTIME_STATE_ROOT);
  const dryRun = input.dryRun === true;
  const forceRequested = input.force === true;
  const runProviderLifecycle = options.runProviderLifecycleAction ?? runLocalRuntimeProviderLifecycleAction;

  if (input.action === "start") {
    let plan = planLocalModelRuntimeStart({
      inventory: beforeStatus.inventory,
      request: { runtimeId, dryRun },
    });
    const requestedLaunch = localModelRuntimeLifecycleRequestedLaunch({
      action: "start",
      entry: plan.entry,
    });
    if (requestedLaunch) {
      beforeStatus = await options.readStatus(workspacePath, requestedLaunch);
      plan = planLocalModelRuntimeStart({
        inventory: beforeStatus.inventory,
        request: { runtimeId, dryRun },
      });
    }
    const startResult = plan.status === "ready" && !plan.dryRun && plan.entry?.capability === "local-text" && plan.entry.modelRuntimeId
      ? await options.startRuntime({
        runtimeId: plan.entry.modelRuntimeId,
        stateRootPath,
      })
      : undefined;
    const providerResult = plan.status === "ready" && !plan.dryRun && plan.entry?.capability !== "local-text" && plan.entry?.providerLifecycle
      ? await runProviderLifecycle({
          workspacePath,
          entry: plan.entry,
          action: "start",
        })
      : undefined;
    const result = localModelRuntimeStartToolResult({ plan, startResult, providerResult });
    const afterStatus = result.status === "started"
      ? await options.readStatus(workspacePath)
      : undefined;
    return localModelRuntimeLifecycleActionResult({
      action: "start",
      runtimeId: result.runtimeId,
      status: result.status,
      message: localModelRuntimeStartText(result),
      dryRun: result.dryRun,
      forceRequested: false,
      beforeStatus,
      afterStatus,
    });
  }

  if (input.action === "stop") {
    let plan = planLocalModelRuntimeStop({
      inventory: beforeStatus.inventory,
      request: { runtimeId, dryRun, force: forceRequested },
    });
    let ownershipResolution = await options.resolveOwnershipForStopPlan(plan);
    if (ownershipResolution?.status === "resolved") {
      const updatedStatus = await options.readStatus(workspacePath);
      plan = planLocalModelRuntimeStop({
        inventory: updatedStatus.inventory,
        request: { runtimeId, dryRun, force: forceRequested },
      });
      ownershipResolution = localRuntimeOwnershipResolutionAfterInventoryRefresh({
        result: ownershipResolution,
        action: "stop",
        entry: plan.entry,
      });
    }
    const stopResult = plan.status === "ready" && !plan.dryRun && plan.entry?.capability === "local-text" && plan.entry.modelRuntimeId
      ? await options.stopRuntime({
        runtimeId: plan.entry.modelRuntimeId,
        stateRootPath,
        force: plan.forceRequested,
      })
      : undefined;
    const providerResult = plan.status === "ready" && !plan.dryRun && plan.entry?.capability !== "local-text" && plan.entry?.providerLifecycle
      ? await runProviderLifecycle({
          workspacePath,
          entry: plan.entry,
          action: "stop",
        })
      : undefined;
    const result = localModelRuntimeStopToolResult({ plan, stopResult, providerResult, ownershipResolution });
    const afterStatus = result.status === "stopped"
      ? await options.readStatus(workspacePath)
      : undefined;
    return localModelRuntimeLifecycleActionResult({
      action: "stop",
      runtimeId: result.runtimeId,
      status: result.status,
      message: localModelRuntimeStopText(result),
      dryRun: result.dryRun,
      forceRequested: result.forceRequested,
      beforeStatus,
      afterStatus,
    });
  }

  let plan = planLocalModelRuntimeRestart({
    inventory: beforeStatus.inventory,
    request: { runtimeId, dryRun, force: forceRequested },
  });
  const requestedLaunch = localModelRuntimeLifecycleRequestedLaunch({
    action: "restart",
    entry: plan.entry,
  });
  if (requestedLaunch) {
    beforeStatus = await options.readStatus(workspacePath, requestedLaunch);
    plan = planLocalModelRuntimeRestart({
      inventory: beforeStatus.inventory,
      request: { runtimeId, dryRun, force: forceRequested },
    });
  }
  let ownershipResolution = await options.resolveOwnershipForRestartPlan(plan);
  if (ownershipResolution?.status === "resolved") {
    const updatedStatus = await options.readStatus(workspacePath);
    plan = planLocalModelRuntimeRestart({
      inventory: updatedStatus.inventory,
      request: { runtimeId, dryRun, force: forceRequested },
    });
    ownershipResolution = localRuntimeOwnershipResolutionAfterInventoryRefresh({
      result: ownershipResolution,
      action: "restart",
      entry: plan.entry,
    });
  }
  const restartResult = plan.status === "ready" && !plan.dryRun && plan.entry?.capability === "local-text" && plan.entry.modelRuntimeId
    ? await options.restartRuntime({
      runtimeId: plan.entry.modelRuntimeId,
      stateRootPath,
      force: plan.forceRequested,
    })
    : undefined;
  const providerResult = plan.status === "ready" && !plan.dryRun && plan.entry?.capability !== "local-text" && plan.entry?.providerLifecycle
    ? await runProviderLifecycle({
        workspacePath,
        entry: plan.entry,
        action: "restart",
      })
    : undefined;
  const result = localModelRuntimeRestartToolResult({ plan, restartResult, providerResult, ownershipResolution });
  const afterStatus = result.status === "restarted"
    ? await options.readStatus(workspacePath)
    : undefined;
  return localModelRuntimeLifecycleActionResult({
    action: "restart",
    runtimeId: result.runtimeId,
    status: result.status,
    message: localModelRuntimeRestartText(result),
    dryRun: result.dryRun,
    forceRequested: result.forceRequested,
    beforeStatus,
    afterStatus,
  });
}

function localModelRuntimeLifecycleActionResult(input: {
  action: LocalModelRuntimeLifecycleActionInput["action"];
  runtimeId: string;
  status: LocalModelRuntimeLifecycleActionResult["status"] | LocalRuntimeProviderLifecycleResult["status"];
  message: string;
  dryRun: boolean;
  forceRequested: boolean;
  beforeStatus: LocalModelRuntimeStatusSnapshot;
  afterStatus?: LocalModelRuntimeStatusSnapshot;
}): LocalModelRuntimeLifecycleActionResult {
  return {
    schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1",
    action: input.action,
    runtimeId: input.runtimeId,
    status: input.status,
    message: input.message,
    dryRun: input.dryRun,
    forceRequested: input.forceRequested,
    before: localModelRuntimeLifecycleActionSnapshot(input.beforeStatus),
    ...(input.afterStatus ? { after: localModelRuntimeLifecycleActionSnapshot(input.afterStatus) } : {}),
  };
}

function localModelRuntimeLifecycleActionSnapshot(
  status: LocalModelRuntimeStatusSnapshot,
): LocalModelRuntimeLifecycleActionSnapshot {
  return {
    inventory: status.inventory,
    localModelResources: status.registry,
  };
}
