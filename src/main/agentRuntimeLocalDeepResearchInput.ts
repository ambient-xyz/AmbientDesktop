import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import {
  localDeepResearchRequestedLaunch,
  type LocalModelRequestedLaunch,
} from "./localModelResourceRegistry";

export type LocalDeepResearchSetupToolAction = "status" | "install" | "repair" | "validate" | "smoke";

export interface LocalDeepResearchSetupToolInput {
  action: LocalDeepResearchSetupToolAction;
  q8Override?: boolean;
}

export function formatLocalDeepResearchBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function localDeepResearchRequestedLaunchFromContract(
  contract: LocalDeepResearchSetupContract,
  ownerThreadId?: string,
): LocalModelRequestedLaunch {
  return localDeepResearchRequestedLaunch({
    ownerThreadId,
    modelId: contract.modelInstall.filename,
    profileId: contract.modelInstall.selectedProfileId,
    contextTokens: contract.modelInstall.contextTokens,
    estimatedResidentMemoryBytes: contract.installerShape.memory.estimatedResidentMemoryBytes,
  });
}

export function localDeepResearchSetupToolInput(params: unknown): LocalDeepResearchSetupToolInput {
  const input = objectRecord(params);
  const action = optionalString(input.action);
  if (action && !["status", "install", "repair", "validate", "smoke"].includes(action)) {
    throw new Error("action must be status, install, repair, validate, or smoke.");
  }
  return {
    action: action === "install" || action === "repair" || action === "validate" || action === "smoke" ? action : "status",
    ...(input.q8Override === true ? { q8Override: true } : {}),
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
