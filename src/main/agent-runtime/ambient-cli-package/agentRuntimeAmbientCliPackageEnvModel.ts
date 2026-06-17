import type { WorkspaceState } from "../../../shared/types";
import type {
  AmbientCliPackageEnvStatus,
  AmbientCliPackageSummary,
} from "../../ambientCliPackages";

export interface AmbientCliEnvBindInput {
  packageId?: string;
  packageName?: string;
  envName: string;
  filePath: string;
}

export interface AmbientCliSecretRequestInput {
  packageId?: string;
  packageName?: string;
  envName: string;
}

export function ambientCliEnvBindInput(input: Record<string, unknown>): AmbientCliEnvBindInput {
  const packageId = optionalString(input.packageId);
  const packageName = optionalString(input.packageName);
  const envName = requiredString(input, "envName");
  const filePath = requiredString(input, "filePath");
  return {
    ...(packageId ? { packageId } : {}),
    ...(packageName ? { packageName } : {}),
    envName,
    filePath,
  };
}

export function ambientCliSecretRequestInput(input: Record<string, unknown>): AmbientCliSecretRequestInput {
  const packageId = optionalString(input.packageId);
  const packageName = optionalString(input.packageName);
  const envName = requiredString(input, "envName");
  return {
    ...(packageId ? { packageId } : {}),
    ...(packageName ? { packageName } : {}),
    envName,
  };
}

export function ambientCliEnvBindApprovalDetail(input: {
  workspace: WorkspaceState;
  pkg: AmbientCliPackageSummary;
  envName: string;
  filePath: string;
}): string {
  return [
    `Workspace: ${input.workspace.path}`,
    `Package: ${input.pkg.name}`,
    `Package id: ${input.pkg.id}`,
    `Env name: ${input.envName}`,
    `Secret file: ${input.filePath}`,
    "Secret value: not read into the transcript.",
  ].join("\n");
}

export function ambientCliEnvBindGrantIdentity(input: {
  pkg: AmbientCliPackageSummary;
  envName: string;
  filePath: string;
}): string {
  return ["ambient_cli_env_bind", input.pkg.id, input.envName, input.filePath].join("\0");
}

export function ambientCliEnvBindingSavedText(input: {
  pkg: AmbientCliPackageSummary;
  status: AmbientCliPackageEnvStatus;
}): string {
  return [
    "Ambient CLI env binding saved",
    `Package: ${input.pkg.name}`,
    `Env name: ${input.status.name}`,
    `Source: ${input.status.source}`,
    `File: ${input.status.filePath}`,
    "Secret value: not printed",
  ].join("\n");
}

export function ambientCliSecretRequestText(input: {
  pkg: AmbientCliPackageSummary;
  envName: string;
}): string {
  return [
    "Ambient CLI secret dialog requested",
    `Package: ${input.pkg.name}`,
    `Env name: ${input.envName}`,
    "Secret value: never exposed to Pi",
  ].join("\n");
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
