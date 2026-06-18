import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { AmbientCliPackageSummary } from "../agentRuntimeAmbientCliFacade";

export interface AmbientCliPackageUninstallToolOutput {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

export interface AmbientCliPackageUninstallParams {
  packageId?: string;
  packageName?: string;
}

export function ambientCliPackageUninstallParams(input: Record<string, unknown>): AmbientCliPackageUninstallParams {
  return {
    packageId: optionalString(input.packageId),
    packageName: optionalString(input.packageName),
  };
}

export function ambientCliPackageUninstallApprovalDetail(input: {
  workspace: WorkspaceState;
  pkg: AmbientCliPackageSummary;
}): string {
  return [
    `Workspace: ${input.workspace.path}`,
    `Package: ${input.pkg.name}`,
    `Package id: ${input.pkg.id}`,
    `Package root: ${input.pkg.rootPath}`,
  ].join("\n");
}

export function ambientCliPackageUninstallGrantIdentity(pkg: AmbientCliPackageSummary): string {
  return ["ambient_cli_package_uninstall", pkg.id].join("\0");
}

export function ambientCliPackageUninstallText(pkg: AmbientCliPackageSummary): string {
  return [
    "Ambient CLI package uninstalled",
    `Package: ${pkg.name}`,
    `Package id: ${pkg.id}`,
    "Declared commands and searchable package instructions are no longer available.",
  ].join("\n");
}

export function ambientCliPackageUninstallingUpdate(pkg: AmbientCliPackageSummary): AmbientCliPackageUninstallToolOutput {
  return {
    content: [{ type: "text", text: `Uninstalling Ambient CLI package "${pkg.name}".` }],
    details: {
      runtime: "ambient-cli",
      toolName: "ambient_cli_package_uninstall",
      packageId: pkg.id,
      packageName: pkg.name,
      status: "uninstalling",
    },
  };
}

export function ambientCliPackageUninstallResult(pkg: AmbientCliPackageSummary): AmbientCliPackageUninstallToolOutput {
  return {
    content: [{ type: "text", text: ambientCliPackageUninstallText(pkg) }],
    details: {
      runtime: "ambient-cli",
      toolName: "ambient_cli_package_uninstall",
      packageId: pkg.id,
      packageName: pkg.name,
      availability: "next-session-refresh",
    },
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
