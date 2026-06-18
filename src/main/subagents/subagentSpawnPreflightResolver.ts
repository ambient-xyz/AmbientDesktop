import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import {
  resolveSubagentCapacityLease,
  type ResolveSubagentCapacityLeaseInput,
  type SubagentCapacityLeaseSnapshot,
} from "../../shared/subagentCapacity";
import type {
  SubagentDependencyMode,
  SubagentForkMode,
  SubagentPromptMode,
} from "../../shared/subagentProtocol";
import type { SubagentRoleId, SubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  SubagentChildRuntimeAdapter,
  SubagentChildRuntimeLaunchPreflightInput,
  SubagentChildRuntimeLaunchPreflightResult,
} from "../pi/piChildSessionAdapter";

export const SUBAGENT_SPAWN_PREFLIGHT_RESOLVER_SCHEMA_VERSION =
  "ambient-subagent-spawn-preflight-resolver-v1" as const;

export interface BuildSubagentSpawnRuntimePreflightInputInput {
  parentThread: ThreadSummary;
  task: string;
  role: SubagentRoleProfile;
  model: AmbientModelRuntimeProfile;
  dependencyMode: SubagentDependencyMode;
  forkMode: SubagentForkMode;
  promptMode: SubagentPromptMode;
  canonicalTaskPath: string;
  idempotencyKey: string;
}

export interface ResolveSubagentSpawnRuntimePreflightInput {
  runtime?: Pick<SubagentChildRuntimeAdapter, "preflightChildLaunch">;
  preflightInput: SubagentChildRuntimeLaunchPreflightInput;
}

export interface BuildSubagentSpawnCapacityLeaseInputInput {
  parentThread: Pick<ThreadSummary, "id">;
  parentRun: { id: string };
  canonicalTaskPath: string;
  roleId: SubagentRoleId;
  model: AmbientModelRuntimeProfile;
  existingRuns: readonly SubagentRunSummary[];
  runtimeLaunchPreflight?: SubagentChildRuntimeLaunchPreflightResult;
}

export interface ResolveSubagentSpawnCapacityLeaseInput extends BuildSubagentSpawnCapacityLeaseInputInput {
  resolveCapacityLease?: (input: ResolveSubagentCapacityLeaseInput) => Promise<SubagentCapacityLeaseSnapshot> | SubagentCapacityLeaseSnapshot;
}

export function buildSubagentSpawnRuntimePreflightInput(
  input: BuildSubagentSpawnRuntimePreflightInputInput,
): SubagentChildRuntimeLaunchPreflightInput {
  return {
    parentThread: input.parentThread,
    task: input.task,
    role: input.role,
    model: input.model,
    dependencyMode: input.dependencyMode,
    forkMode: input.forkMode,
    promptMode: input.promptMode,
    canonicalTaskPath: input.canonicalTaskPath,
    idempotencyKey: input.idempotencyKey,
  };
}

export async function resolveSubagentSpawnRuntimePreflight(
  input: ResolveSubagentSpawnRuntimePreflightInput,
): Promise<SubagentChildRuntimeLaunchPreflightResult | undefined> {
  if (!input.runtime?.preflightChildLaunch) return undefined;
  return input.runtime.preflightChildLaunch(input.preflightInput);
}

export function buildSubagentSpawnCapacityLeaseInput(
  input: BuildSubagentSpawnCapacityLeaseInputInput,
): ResolveSubagentCapacityLeaseInput {
  return {
    parentThreadId: input.parentThread.id,
    parentRunId: input.parentRun.id,
    canonicalTaskPath: input.canonicalTaskPath,
    roleId: input.roleId,
    model: input.model,
    existingRuns: input.existingRuns.map((run) => ({
      id: run.id,
      status: run.status,
      ...(run.closedAt ? { closedAt: run.closedAt } : {}),
      modelRuntimeSnapshot: {
        profile: {
          profileId: run.modelRuntimeSnapshot.profile.profileId,
          providerId: run.modelRuntimeSnapshot.profile.providerId,
          modelId: run.modelRuntimeSnapshot.profile.modelId,
        },
      },
    })),
    ...(input.runtimeLaunchPreflight?.capacity?.localMemory
      ? { localMemory: input.runtimeLaunchPreflight.capacity.localMemory }
      : {}),
  };
}

export async function resolveSubagentSpawnCapacityLease(
  input: ResolveSubagentSpawnCapacityLeaseInput,
): Promise<SubagentCapacityLeaseSnapshot> {
  const resolverInput = buildSubagentSpawnCapacityLeaseInput(input);
  return input.resolveCapacityLease
    ? input.resolveCapacityLease(resolverInput)
    : resolveSubagentCapacityLease(resolverInput);
}

export function shouldRecordSubagentPreRunCapacityFailure(
  capacityLease: SubagentCapacityLeaseSnapshot,
  runtimeLaunchPreflight?: SubagentChildRuntimeLaunchPreflightResult,
): boolean {
  return capacityLease.status === "blocked" &&
    Boolean(runtimeLaunchPreflight?.capacity?.localMemory) &&
    runtimeLaunchPreflight?.capacity?.localMemory?.allowed === false &&
    capacityLease.localMemory.allowed === false;
}
