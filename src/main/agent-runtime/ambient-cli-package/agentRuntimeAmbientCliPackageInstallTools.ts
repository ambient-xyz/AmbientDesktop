import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  installAmbientCliPackagePiCatalogSource,
  installAmbientCliPackageSource,
  previewAmbientCliPackagePiCatalogSource,
  previewAmbientCliPackageInstallSource,
  type AmbientCliPackageInstallPreview,
  type AmbientCliPackageSummary,
  type AmbientCliPackageSummaryHydrationResult,
  type AmbientCliPiCatalogInstallPreview,
  type InstallAmbientCliPackageInput,
  type PreviewAmbientCliPackageInput,
} from "../agentRuntimeAmbientCliFacade";
import {
  ambientCliPackageInstallApprovalDetail,
  ambientCliPackageInstallInput,
  ambientCliPackageInstallParams,
  ambientCliPackageInstallRequiresPinnedSource,
  ambientCliPackageInstallText,
  ambientCliPackagePiCatalogInstallApprovalDetail,
  ambientCliPackagePiCatalogInstallInput,
  ambientCliPackagePiCatalogInstallText,
  ambientCliSummaryHydrationText,
  cliPackageInstallGrantIdentity,
  cliPackagePiCatalogInstallGrantIdentity,
} from "./agentRuntimeAmbientCliPackageInstallModel";
import { redactGitSourceCredentials } from "../agentRuntimeSecurityFacade";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";

export { ambientCliPackageInstallText, ambientCliSummaryHydrationText } from "./agentRuntimeAmbientCliPackageInstallModel";

type ToolUpdateHandler = (update: { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }) => void;

export interface AmbientCliPackageInstallPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface AmbientCliPackageInstallToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  previewAmbientCliPackageInstallSource?: (
    workspacePath: string,
    input: PreviewAmbientCliPackageInput,
  ) => Promise<AmbientCliPackageInstallPreview> | AmbientCliPackageInstallPreview;
  installAmbientCliPackageSource?: (
    workspacePath: string,
    input: InstallAmbientCliPackageInput,
    approvedPreview?: AmbientCliPackageInstallPreview,
  ) => Promise<AmbientCliPackageSummary> | AmbientCliPackageSummary;
  resolveFirstPartyPluginPermission: (input: AmbientCliPackageInstallPermissionRequest) => Promise<boolean> | boolean;
  markPluginToolsStale: () => void;
  ambientCliPackageInstallText?: (pkg: AmbientCliPackageSummary) => string;
}

export interface AmbientCliPackagePiCatalogInstallToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  previewAmbientCliPackagePiCatalogSource?: (
    workspacePath: string,
    source: string,
  ) => Promise<AmbientCliPiCatalogInstallPreview> | AmbientCliPiCatalogInstallPreview;
  installAmbientCliPackagePiCatalogSource?: (
    workspacePath: string,
    source: string,
    approvedPreview?: AmbientCliPiCatalogInstallPreview,
  ) => Promise<AmbientCliPackageSummary> | AmbientCliPackageSummary;
  hydrateFirstPartyAmbientCliPackageSummaries: (
    packageId: string,
  ) => Promise<AmbientCliPackageSummaryHydrationResult | undefined> | AmbientCliPackageSummaryHydrationResult | undefined;
  resolveFirstPartyPluginPermission: (input: AmbientCliPackageInstallPermissionRequest) => Promise<boolean> | boolean;
  markPluginToolsStale: () => void;
  ambientCliPackageInstallText?: (pkg: AmbientCliPackageSummary) => string;
  ambientCliSummaryHydrationText?: (result: AmbientCliPackageSummaryHydrationResult) => string;
}

export function registerAmbientCliPackageInstallTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientCliPackageInstallToolRegistrationOptions,
): void {
  const { workspace } = options;
  const previewInstallSource = options.previewAmbientCliPackageInstallSource ?? previewAmbientCliPackageInstallSource;
  const installPackageSource = options.installAmbientCliPackageSource ?? installAmbientCliPackageSource;
  const installText = options.ambientCliPackageInstallText ?? ambientCliPackageInstallText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_cli_package_install"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("CLI package installation is blocked in Planner Mode.");

      const input = ambientCliPackageInstallParams(params as Record<string, unknown>);
      const installInput = ambientCliPackageInstallInput(input);

      const preview = await previewInstallSource(workspace.path, installInput);
      if (!preview.installable) throw new Error(`Ambient CLI package source is not installable: ${preview.errors.join("; ")}`);
      if (ambientCliPackageInstallRequiresPinnedSource({ ...input, preview })) {
        throw new Error("Unpinned Ambient CLI package installs that run dependency installation require an immutable sha-pinned source.");
      }

      const detail = ambientCliPackageInstallApprovalDetail(workspace, preview);
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_cli_package_install",
        title: `Install Ambient CLI package "${preview.candidate?.name ?? input.source}"?`,
        message:
          "Ambient wants to install a local descriptor-backed CLI package. Declared commands can be run later through ambient_cli with separate approval.",
        detail,
        grantTargetLabel: `Install Ambient CLI package ${preview.candidate?.name ?? input.source}`,
        grantTargetIdentity: cliPackageInstallGrantIdentity({ ...input, preview }),
        allowedReason: "Ambient CLI package install approved by Ambient permission grant policy.",
        deniedReason: "Ambient CLI package install prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Ambient CLI package install blocked by approval prompt.");

      onUpdate?.({
        content: [{ type: "text", text: `Installing Ambient CLI package from ${redactGitSourceCredentials(input.source)}.` }],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli_package_install",
          source: redactGitSourceCredentials(input.source),
          path: input.path,
          ref: input.ref,
          sha: input.sha,
          descriptorOverlay: Boolean(input.descriptor),
          installDependencies: input.installDependencies,
          status: "installing",
        },
      });

      const pkg = await installPackageSource(workspace.path, installInput, preview);
      options.markPluginToolsStale();
      return {
        content: [{ type: "text" as const, text: installText(pkg) }],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli_package_install",
          packageId: pkg.id,
          packageName: pkg.name,
          commandCount: pkg.commands.length,
          skillCount: pkg.skills.length,
          availability: "next-session-refresh",
        },
      };
    },
  });
}

export function registerAmbientCliPackagePiCatalogInstallTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientCliPackagePiCatalogInstallToolRegistrationOptions,
): void {
  const { workspace } = options;
  const previewCatalogSource = options.previewAmbientCliPackagePiCatalogSource ?? previewAmbientCliPackagePiCatalogSource;
  const installCatalogSource = options.installAmbientCliPackagePiCatalogSource ?? installAmbientCliPackagePiCatalogSource;
  const installText = options.ambientCliPackageInstallText ?? ambientCliPackageInstallText;
  const summaryHydrationText = options.ambientCliSummaryHydrationText ?? ambientCliSummaryHydrationText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_cli_package_install_pi_catalog"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Pi catalog CLI package installation is blocked in Planner Mode.");

      const source = ambientCliPackagePiCatalogInstallInput(params as Record<string, unknown>);
      const preview = await previewCatalogSource(workspace.path, source);
      if (!preview.installable) throw new Error(`Pi catalog package is not installable as Ambient CLI: ${preview.errors.join("; ")}`);

      const detail = ambientCliPackagePiCatalogInstallApprovalDetail(workspace, preview);
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_cli_package_install_pi_catalog",
        title: `Install Pi catalog CLI package "${preview.candidate?.name ?? source}"?`,
        message:
          "Ambient wants to translate a supported Pi catalog package into an Ambient-managed CLI package. Declared commands can be run later through ambient_cli with separate approval.",
        detail,
        grantTargetLabel: `Install Pi catalog CLI package ${preview.candidate?.name ?? source}`,
        grantTargetIdentity: cliPackagePiCatalogInstallGrantIdentity({ source, preview }),
        grantConditions: piCatalogInstallRouteGrantConditions(source, preview),
        allowedReason: "Pi catalog CLI package install approved by Ambient permission grant policy.",
        deniedReason: "Pi catalog CLI package install prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Pi catalog CLI package install blocked by approval prompt.");

      onUpdate?.({
        content: [{ type: "text", text: `Installing Pi catalog package from ${source} as an Ambient CLI package.` }],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli_package_install_pi_catalog",
          source,
          repositoryUrl: preview.resolution?.repositoryUrl,
          sha: preview.resolution?.sha,
          status: "installing",
        },
      });

      const pkg = await installCatalogSource(workspace.path, source, preview);
      const summaryHydration = await options.hydrateFirstPartyAmbientCliPackageSummaries(pkg.id);
      options.markPluginToolsStale();
      return {
        content: [
          {
            type: "text" as const,
            text: ambientCliPackagePiCatalogInstallText({
              pkg,
              summaryHydration,
              resolution: preview.resolution,
              installText,
              summaryHydrationText,
            }),
          },
        ],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli_package_install_pi_catalog",
          packageId: pkg.id,
          packageName: pkg.name,
          commandCount: pkg.commands.length,
          skillCount: pkg.skills.length,
          summaryHydration,
          resolution: preview.resolution,
          availability: "immediate",
        },
      };
    },
  });
}

function piCatalogInstallRouteGrantConditions(source: string, preview: AmbientCliPiCatalogInstallPreview): Record<string, unknown> {
  const targetPackage = preview.candidate?.name ?? preview.resolution?.adapter;
  return {
    installRoute: {
      routeKind: "pi-marketplace-wrapped",
      selectedSource: source,
      ...(targetPackage ? { targetPackage } : {}),
      approvalBoundary: "ambient-permission-grant",
    },
  };
}
