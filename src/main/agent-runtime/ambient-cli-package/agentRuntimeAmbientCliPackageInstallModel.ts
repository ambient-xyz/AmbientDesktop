import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type {
  AmbientCliPackageInstallPreview,
  AmbientCliPackageSummary,
  AmbientCliPackageSummaryHydrationResult,
  AmbientCliPiCatalogResolution,
  AmbientCliPiCatalogInstallPreview,
  InstallAmbientCliPackageInput,
  PreviewAmbientCliPackageInput,
} from "../agentRuntimeAmbientCliFacade";

export interface AmbientCliPackageInstallParams {
  source: string;
  path?: string;
  ref?: string;
  sha?: string;
  descriptor?: Record<string, unknown>;
  installDependencies: boolean;
}

export function ambientCliPackageInstallText(pkg: AmbientCliPackageSummary): string {
  return [
    "Ambient CLI package installed",
    `Package: ${pkg.name}`,
    `Package id: ${pkg.id}`,
    pkg.description ? `Description: ${pkg.description}` : undefined,
    `Commands: ${pkg.commands.map((command) => command.name).join(", ") || "none"}`,
    `Skills: ${pkg.skills.map((skill) => skill.name).join(", ") || "none"}`,
    "Declared commands are available immediately through ambient_cli. Use ambient_cli_search and ambient_cli_describe for package instructions; Ambient CLI skills are not mounted into every Pi session by default.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ambientCliSummaryHydrationText(result: AmbientCliPackageSummaryHydrationResult): string {
  return [
    "Ambient CLI summary hydration",
    `Attempted: ${result.attempted ? "yes" : "no"}`,
    result.reason ? `Reason: ${result.reason}` : undefined,
    `Available summaries: ${result.availableCount}/${result.summaryStatuses.length}`,
    result.failedCount ? `Failed summaries: ${result.failedCount}` : undefined,
    ...result.summaryStatuses.map((item) =>
      [
        `- ${item.skillName}: ${item.status}`,
        item.error ? ` (${item.error})` : "",
        item.retryAfter ? ` retry after ${item.retryAfter}` : "",
      ].join(""),
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export function ambientCliPackagePreviewText(preview: AmbientCliPackageInstallPreview): string {
  const pkg = preview.candidate;
  return [
    "Ambient CLI package preview",
    `Source: ${preview.source}`,
    preview.path ? `Path: ${preview.path}` : undefined,
    preview.ref ? `Ref: ${preview.ref}` : undefined,
    preview.sha ? `SHA: ${preview.sha}` : undefined,
    pkg ? `Package: ${pkg.name}` : undefined,
    pkg?.description ? `Description: ${pkg.description}` : undefined,
    pkg ? `Commands: ${pkg.commands.map((command) => command.name).join(", ") || "none"}` : undefined,
    pkg ? `Skills: ${pkg.skills.map((skill) => skill.name).join(", ") || "none"}` : undefined,
    preview.dependencyInstall
      ? `Dependencies: ${preview.dependencyInstall.passed ? preview.dependencyInstall.skipped ? "skipped" : "installed" : "failed"} via ${preview.dependencyInstall.command.join(" ")}`
      : "Dependencies: not requested",
    preview.dependencyInstall?.reason ? `Dependency note: ${preview.dependencyInstall.reason}` : undefined,
    preview.envStatus.length
      ? `Env requirements: ${preview.envStatus.map((env) => `${env.name}=${env.configured ? env.source ?? "configured" : "missing"}`).join(", ")}`
      : "Env requirements: none",
    `Health checks: ${preview.healthChecks.length}`,
    `Installable: ${preview.installable ? "yes" : "no"}`,
    ...preview.errors.slice(0, 8).map((error) => `Error: ${error}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function ambientCliPackageInstallInput(input: {
  source: string;
  path?: string;
  ref?: string;
  sha?: string;
  descriptor?: Record<string, unknown>;
  installDependencies: boolean;
}): InstallAmbientCliPackageInput {
  return {
    source: input.source,
    ...(input.path ? { path: input.path } : {}),
    ...(input.ref ? { ref: input.ref } : {}),
    ...(input.sha ? { sha: input.sha } : {}),
    ...(input.descriptor ? { descriptor: input.descriptor } : {}),
    ...(input.installDependencies ? { installDependencies: input.installDependencies } : {}),
  };
}

export function ambientCliPackageInstallParams(input: Record<string, unknown>): AmbientCliPackageInstallParams {
  const source = requiredString(input, "source");
  const path = optionalString(input.path);
  const ref = optionalString(input.ref);
  const sha = optionalString(input.sha);
  const descriptor = optionalRecord(input.descriptor);
  const installDependencies = optionalBoolean(input.installDependencies) ?? false;
  return {
    source,
    ...(path ? { path } : {}),
    ...(ref ? { ref } : {}),
    ...(sha ? { sha } : {}),
    ...(descriptor ? { descriptor } : {}),
    installDependencies,
  };
}

export function ambientCliPackagePreviewInput(input: Record<string, unknown>): PreviewAmbientCliPackageInput {
  return ambientCliPackageInstallInput(ambientCliPackageInstallParams(input));
}

export function ambientCliPackagePiCatalogInstallInput(input: Record<string, unknown>): string {
  return requiredString(input, "source");
}

export function ambientCliPackageInstallApprovalDetail(
  workspace: WorkspaceState,
  preview: AmbientCliPackageInstallPreview,
): string {
  const pkg = preview.candidate;
  return [
    `Workspace: ${workspace.path}`,
    `Source: ${preview.source}`,
    preview.path ? `Path: ${preview.path}` : undefined,
    preview.ref ? `Ref: ${preview.ref}` : undefined,
    preview.sha ? `SHA: ${preview.sha}` : undefined,
    pkg ? `Package: ${pkg.name}` : undefined,
    pkg ? `Commands: ${pkg.commands.map((command) => command.name).join(", ") || "none"}` : undefined,
    pkg ? `Skills: ${pkg.skills.map((skill) => skill.name).join(", ") || "none"}` : undefined,
    preview.dependencyInstall
      ? `Dependencies: ${preview.dependencyInstall.passed ? preview.dependencyInstall.skipped ? "skipped" : "installed" : "failed"} via ${preview.dependencyInstall.command.join(" ")}`
      : "Dependencies: not requested",
    preview.dependencyInstall?.reason ? `Dependency note: ${preview.dependencyInstall.reason}` : undefined,
    preview.envStatus.length
      ? `Env requirements: ${preview.envStatus.map((env) => `${env.name}=${env.configured ? env.source ?? "configured" : "missing"}`).join(", ")}`
      : "Env requirements: none",
    `Health checks: ${preview.healthChecks.length}`,
    "Effect: copy package into Ambient-managed CLI package state.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ambientCliPackagePiCatalogInstallApprovalDetail(
  workspace: WorkspaceState,
  preview: AmbientCliPiCatalogInstallPreview,
): string {
  const pkg = preview.candidate;
  const resolution = preview.resolution;
  return [
    `Workspace: ${workspace.path}`,
    `Source: ${preview.source}`,
    resolution ? `npm: ${resolution.npmPackageName}@${resolution.npmVersion}` : undefined,
    resolution ? `Repository: ${resolution.repositoryUrl}` : undefined,
    resolution ? `Repository path: ${resolution.repositoryDirectory}` : undefined,
    resolution ? `SHA: ${resolution.sha}` : undefined,
    pkg ? `Package: ${pkg.name}` : undefined,
    pkg ? `Commands: ${pkg.commands.map((command) => command.name).join(", ") || "none"}` : undefined,
    pkg ? `Skills: ${pkg.skills.map((skill) => skill.name).join(", ") || "none"}` : undefined,
    "Dependencies: not installed; the Ambient adapter uses only Node built-ins and fetch.",
    resolution ? `Security scan:\n${resolution.securityScan.map((item) => `- ${item}`).join("\n")}` : undefined,
    `Health checks: ${preview.healthChecks.length}`,
    "Effect: copy reviewed package source plus a first-party Ambient CLI adapter into Ambient-managed CLI package state.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ambientCliPackagePiCatalogInstallText(input: {
  pkg: AmbientCliPackageSummary;
  summaryHydration?: AmbientCliPackageSummaryHydrationResult;
  resolution?: AmbientCliPiCatalogResolution;
  installText?: (pkg: AmbientCliPackageSummary) => string;
  summaryHydrationText?: (result: AmbientCliPackageSummaryHydrationResult) => string;
}): string {
  const { pkg, resolution, summaryHydration } = input;
  const installText = input.installText ?? ambientCliPackageInstallText;
  const summaryHydrationText = input.summaryHydrationText ?? ambientCliSummaryHydrationText;
  return [
    installText(pkg),
    summaryHydration ? summaryHydrationText(summaryHydration) : undefined,
    resolution ? `Security scan:\n${resolution.securityScan.map((item) => `- ${item}`).join("\n")}` : undefined,
    `Use ambient_cli_describe with packageName "${pkg.name}" before first execution, then ambient_cli with one of: ${pkg.commands.map((command) => command.name).join(", ")}.`,
  ].filter(Boolean).join("\n\n");
}

export function cliPackagePiCatalogInstallGrantIdentity(input: {
  source: string;
  preview: AmbientCliPiCatalogInstallPreview;
}): string {
  return ["ambient_cli_package_install_pi_catalog", input.source, input.preview.resolution?.sha ?? "unknown"].join("\0");
}

export function cliPackageInstallGrantIdentity(input: {
  source: string;
  path?: string;
  ref?: string;
  sha?: string;
  descriptor?: Record<string, unknown>;
  installDependencies: boolean;
  preview: AmbientCliPackageInstallPreview;
}): string {
  const pkg = input.preview.candidate;
  return [
    "ambient_cli_package_install",
    input.source,
    input.path ?? "",
    input.ref ?? "",
    input.sha ?? "",
    input.installDependencies ? "install-dependencies" : "no-dependencies",
    pkg?.name ?? "",
    pkg?.version ?? "",
    pkg?.commands.map((command) => `${command.name}:${command.command}:${command.args.join("\u0001")}:${command.cwd}`).join("\u0002") ?? "",
    pkg?.skills.map((skill) => skill.name).join("\u0002") ?? "",
    input.descriptor ? stableJson(input.descriptor) : "",
  ].join("\0");
}

export function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
