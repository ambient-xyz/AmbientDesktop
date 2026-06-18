import type {
  LocalModelRuntimeLifecycleActionKind,
  LocalRuntimeInventoryEntry,
  LocalRuntimeProviderLifecycleAction,
} from "../../shared/localRuntimeTypes";
import {
  runAmbientCliPackageCommand,
  type AmbientCliRunResult,
  type RunAmbientCliInput,
} from "../ambient-cli/ambientCliPackages";

export type LocalRuntimeProviderLifecycleStatus =
  | "started"
  | "stopped"
  | "restarted"
  | "blocked"
  | "failed";

export interface LocalRuntimeProviderLifecycleResult {
  schemaVersion: "ambient-local-runtime-provider-lifecycle-result-v1";
  action: LocalModelRuntimeLifecycleActionKind;
  status: LocalRuntimeProviderLifecycleStatus;
  runtimeId: string;
  packageId?: string;
  packageName?: string;
  commandName?: string;
  command?: string[];
  cwd?: string;
  durationMs?: number;
  stdoutArtifactPath?: string;
  stderrArtifactPath?: string;
  reason?: string;
  error?: string;
}

export type LocalRuntimeProviderLifecycleRunner = (
  workspacePath: string,
  input: RunAmbientCliInput,
) => Promise<AmbientCliRunResult>;

export async function runLocalRuntimeProviderLifecycleAction(input: {
  workspacePath: string;
  entry: LocalRuntimeInventoryEntry;
  action: LocalModelRuntimeLifecycleActionKind;
  runner?: LocalRuntimeProviderLifecycleRunner;
}): Promise<LocalRuntimeProviderLifecycleResult> {
  const providerAction = providerLifecycleAction(input.entry, input.action);
  if (!providerAction) {
    return {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-result-v1",
      action: input.action,
      status: "blocked",
      runtimeId: input.entry.modelRuntimeId ?? input.entry.id,
      reason: `Runtime row ${input.entry.id} does not declare a provider ${input.action} command.`,
    };
  }
  if (providerAction.providerKind !== "ambient-cli") {
    return {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-result-v1",
      action: input.action,
      status: "blocked",
      runtimeId: input.entry.modelRuntimeId ?? input.entry.id,
      reason: `Provider lifecycle kind ${providerAction.providerKind} is not supported by this runtime.`,
    };
  }
  const packageId = providerAction.packageId ?? input.entry.providerLifecycle?.packageId;
  const packageName = providerAction.packageName ?? input.entry.providerLifecycle?.packageName;
  if (!packageId && !packageName) {
    return {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-result-v1",
      action: input.action,
      status: "blocked",
      runtimeId: input.entry.modelRuntimeId ?? input.entry.id,
      commandName: providerAction.command,
      reason: "Provider lifecycle command is missing package identity, so Ambient cannot run it safely.",
    };
  }
  try {
    const result = await (input.runner ?? runAmbientCliPackageCommand)(input.workspacePath, {
      ...(packageId ? { packageId } : { packageName }),
      command: providerAction.command,
      timeoutMs: providerAction.timeoutMs,
      executionWorkspacePath: input.workspacePath,
    });
    return {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-result-v1",
      action: input.action,
      status: providerLifecycleSuccessStatus(input.action),
      runtimeId: input.entry.modelRuntimeId ?? input.entry.id,
      packageId: result.packageId,
      packageName: result.packageName,
      commandName: result.commandName,
      command: result.command,
      cwd: result.cwd,
      durationMs: result.durationMs,
      ...(result.stdoutOutput?.artifactPath ? { stdoutArtifactPath: result.stdoutOutput.artifactPath } : {}),
      ...(result.stderrOutput?.artifactPath ? { stderrArtifactPath: result.stderrOutput.artifactPath } : {}),
      reason: `Provider-declared ${input.action} command "${result.commandName}" completed.`,
    };
  } catch (error) {
    return {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-result-v1",
      action: input.action,
      status: "failed",
      runtimeId: input.entry.modelRuntimeId ?? input.entry.id,
      ...(packageId ? { packageId } : {}),
      ...(packageName ? { packageName } : {}),
      commandName: providerAction.command,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function providerLifecycleAction(
  entry: LocalRuntimeInventoryEntry,
  action: LocalModelRuntimeLifecycleActionKind,
): LocalRuntimeProviderLifecycleAction | undefined {
  if (action === "start") return entry.providerLifecycle?.start;
  return entry.providerLifecycle?.[action];
}

function providerLifecycleSuccessStatus(
  action: LocalModelRuntimeLifecycleActionKind,
): Extract<LocalRuntimeProviderLifecycleStatus, "started" | "stopped" | "restarted"> {
  if (action === "start") return "started";
  if (action === "stop") return "stopped";
  return "restarted";
}
