import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import type { AmbientInstallRoutePlan } from "../agentRuntimeInstallRouteFacade";
import {
  previewAmbientCliPackagePiCatalogSource,
  type AmbientCliPiCatalogInstallPreview,
} from "../agentRuntimeAmbientCliFacade";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  installPiExtensionSandboxPackage,
  previewPiExtensionSandboxInstall,
  type PiExtensionSandboxInstallInput,
  type PiExtensionSandboxInstallPreview,
  type PiExtensionSandboxPackageSummary,
} from "./piExtensionSandboxPackages";
import {
  scanPiPrivilegedPackage,
  type PiPrivilegedSecurityScan,
} from "./piPrivilegedPackages";
import {
  piRawInstallRouteApprovalDetail,
  piRawInstallRouteGrantConditions,
  requirePiRawInstallRouteMetadata,
} from "./piRawInstallRouteMetadata";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PiExtensionSandboxInstallPermissionRequest {
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

export interface PiExtensionSandboxPrivilegedScanUpdatedEvent {
  type: "pi-privileged-scan-updated";
  source: string;
  scan: PiPrivilegedSecurityScan;
  fallback: PiExtensionSandboxInstallPreview;
}

export interface PiExtensionSandboxInstallToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  latestInstallRouteLane?: () => AmbientInstallRoutePlan["lane"] | undefined;
  previewAmbientCliPackagePiCatalogSource?: typeof previewAmbientCliPackagePiCatalogSource;
  previewPiExtensionSandboxInstall?: typeof previewPiExtensionSandboxInstall;
  installPiExtensionSandboxPackage?: typeof installPiExtensionSandboxPackage;
  scanPiPrivilegedPackage?: typeof scanPiPrivilegedPackage;
  resolveFirstPartyPluginPermission: (input: PiExtensionSandboxInstallPermissionRequest) => Promise<boolean> | boolean;
  emit: (event: PiExtensionSandboxPrivilegedScanUpdatedEvent) => void;
}

export function registerPiExtensionSandboxInstallTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiExtensionSandboxInstallToolRegistrationOptions,
): void {
  const previewCliAdapter = options.previewAmbientCliPackagePiCatalogSource ?? previewAmbientCliPackagePiCatalogSource;
  const previewInstall = options.previewPiExtensionSandboxInstall ?? previewPiExtensionSandboxInstall;
  const installPackage = options.installPiExtensionSandboxPackage ?? installPiExtensionSandboxPackage;
  const scanPrivilegedPackage = options.scanPiPrivilegedPackage ?? scanPiPrivilegedPackage;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_extension_install_sandboxed"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Sandboxed Pi extension installation is blocked in Planner Mode.");
      const input = params as Record<string, unknown>;
      const source = requiredString(input, "source");
      const cliAdapter = await previewCliAdapter(options.workspace.path, source);
      if (cliAdapter.installable && cliAdapter.resolution) {
        return firstPartyPiCatalogAdapterRedirectResult("ambient_pi_extension_install_sandboxed", source, cliAdapter);
      }
      const installRoute = requirePiRawInstallRouteMetadata({
        toolName: "ambient_pi_extension_install_sandboxed",
        params: input,
        source,
        latestInstallRouteLane: options.latestInstallRouteLane,
      });
      const allowedNetworkHosts = optionalStringArray(input.allowedNetworkHosts);
      const installInput = sandboxInstallInput(source, allowedNetworkHosts);
      const preview = await previewInstall(options.workspace.path, installInput);
      if (!preview.installable) {
        onUpdate?.({
          content: [{ type: "text", text: `Sandboxed Pi extension install is blocked for ${source}; scanning privileged fallback instead.` }],
          details: {
            runtime: "pi-extension-sandbox",
            toolName: "ambient_pi_extension_install_sandboxed",
            source,
            packageName: preview.packageName,
            status: "sandbox-blocked",
            errors: preview.errors,
          },
        });
        const scan = await scanPrivilegedPackage({ source, scanOrigin: "sandbox-fallback" });
        options.emit({ type: "pi-privileged-scan-updated", source, scan, fallback: preview });
        return {
          content: [{ type: "text" as const, text: piExtensionSandboxFallbackText(preview, scan) }],
          details: {
            runtime: "pi-privileged",
            toolName: "ambient_pi_extension_install_sandboxed",
            fallbackToolName: "ambient_pi_privileged_install",
            source,
            packageName: scan.packageName,
            scanOrigin: scan.scanOrigin,
            status: "privileged-review-required",
            recommendation: scan.recommendation,
            riskSummary: scan.riskSummary,
            errors: preview.errors,
          },
        };
      }
      const detail = piExtensionSandboxInstallApprovalDetail(options.workspace, preview);
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace: options.workspace,
        toolName: "ambient_pi_extension_install_sandboxed",
        title: `Install sandboxed Pi extension "${preview.packageName ?? source}"?`,
        message: "Ambient wants to install a Pi extension into the sandboxed compatibility host. Tool execution remains mediated by Ambient permissions.",
        detail: [detail, piRawInstallRouteApprovalDetail(installRoute)].join("\n"),
        risk: "privileged-action",
        requireFreshPrompt: true,
        grantTargetLabel: `Install sandboxed Pi extension ${preview.packageName ?? source}`,
        grantTargetIdentity: [
          "ambient_pi_extension_install_sandboxed",
          preview.resolvedSource ?? source,
          preview.packagePath ?? "",
          preview.sha ?? "",
          preview.allowedNetworkHosts.join("\0"),
        ].join("\0"),
        grantConditions: piRawInstallRouteGrantConditions(installRoute),
        allowedReason: "Sandboxed Pi extension install approved by Ambient permission grant policy.",
        deniedReason: "Sandboxed Pi extension install prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Sandboxed Pi extension install blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Installing sandboxed Pi extension from ${source}.` }],
        details: { runtime: "pi-extension-sandbox", toolName: "ambient_pi_extension_install_sandboxed", source, status: "installing" },
      });
      const pkg = await installPackage(options.workspace.path, installInput);
      return {
        content: [{ type: "text" as const, text: piExtensionSandboxInstallText(pkg) }],
        details: {
          runtime: "pi-extension-sandbox",
          toolName: "ambient_pi_extension_install_sandboxed",
          packageId: pkg.id,
          packageName: pkg.name,
          toolCount: pkg.tools.length,
          allowedNetworkHosts: pkg.allowedNetworkHosts,
        },
      };
    },
  });
}

function sandboxInstallInput(source: string, allowedNetworkHosts: string[] | undefined): PiExtensionSandboxInstallInput {
  return {
    source,
    ...(allowedNetworkHosts ? { allowedNetworkHosts } : {}),
  };
}

function firstPartyPiCatalogAdapterRedirectResult(requestedToolName: string, source: string, preview: AmbientCliPiCatalogInstallPreview) {
  const packageName = preview.candidate?.name ?? preview.resolution?.adapter ?? source;
  const commands = preview.candidate?.commands.map((command) => command.name) ?? [];
  return {
    content: [
      {
        type: "text" as const,
        text: [
          "Reviewed Ambient CLI adapter available",
          `Requested tool: ${requestedToolName}`,
          `Source: ${source}`,
          `Package: ${packageName}`,
          commands.length ? `Commands: ${commands.join(", ")}` : undefined,
          "Do not install this first-party capability as a sandboxed or privileged Pi extension.",
          "Next: use ambient_cli_package_install_pi_catalog for this source if it is not already installed. If installed, use ambient_cli_search, then ambient_cli_describe, then ambient_cli.",
        ].filter(Boolean).join("\n"),
      },
    ],
    details: {
      runtime: "ambient-cli",
      toolName: requestedToolName,
      fallbackToolName: "ambient_cli_package_install_pi_catalog",
      source,
      packageName,
      commandNames: commands,
      status: "first-party-cli-adapter-available",
      resolution: preview.resolution,
    },
  };
}

function piExtensionSandboxInstallApprovalDetail(workspace: WorkspaceState, preview: PiExtensionSandboxInstallPreview): string {
  const pkg = preview.candidate;
  return [
    `Workspace: ${workspace.path}`,
    `Source: ${preview.source}`,
    preview.resolvedSource ? `Repository: ${preview.resolvedSource}` : undefined,
    preview.packagePath ? `Package path: ${preview.packagePath}` : undefined,
    preview.sha ? `SHA: ${preview.sha}` : undefined,
    preview.packageName ? `Package: ${preview.packageName}` : undefined,
    preview.version ? `Version: ${preview.version}` : undefined,
    preview.entrypoint ? `Entrypoint: ${preview.entrypoint}` : undefined,
    `Allowed network hosts: ${preview.allowedNetworkHosts.join(", ") || "none"}`,
    pkg ? `Tools: ${pkg.tools.map((tool) => tool.name).join(", ") || "none"}` : undefined,
    "Host policy: filesystem, process, env, eval, Function, unsupported imports, and undeclared network hosts are denied.",
    "Effect: copy the pinned package into Ambient-managed Pi extension sandbox state.",
  ]
    .filter(Boolean)
    .join("\n");
}

function piExtensionSandboxInstallText(pkg: PiExtensionSandboxPackageSummary): string {
  return [
    "Sandboxed Pi extension installed",
    `Package: ${pkg.name}`,
    `Package id: ${pkg.id}`,
    pkg.version ? `Version: ${pkg.version}` : undefined,
    `SHA: ${pkg.sha}`,
    `Entrypoint: ${pkg.entrypoint}`,
    `Allowed network hosts: ${pkg.allowedNetworkHosts.join(", ") || "none"}`,
    `Tools: ${pkg.tools.map((tool) => tool.name).join(", ") || "none"}`,
    "Use ambient_pi_extension with this packageName and one of the listed tool names.",
  ]
    .filter(Boolean)
    .join("\n");
}

function piExtensionSandboxFallbackText(preview: PiExtensionSandboxInstallPreview, scan: PiPrivilegedSecurityScan): string {
  return [
    "Sandboxed Pi extension install blocked",
    `Package: ${scan.packageName}`,
    preview.entrypoint ? `Entrypoint: ${preview.entrypoint}` : undefined,
    `Sandbox errors: ${preview.errors.join("; ") || "unknown"}`,
    "Privileged review required",
    `Scan origin: ${scan.scanOrigin}`,
    `Recommendation: ${scan.recommendation}`,
    `Findings: ${scan.findings.length}`,
    "No package was installed.",
    "If the user approves a disabled privileged install, call ambient_pi_privileged_install with the same source and scanOrigin \"sandbox-fallback\".",
    scan.caveat,
  ]
    .filter(Boolean)
    .join("\n");
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Expected an array of strings.");
  return value.map((item) => {
    if (typeof item !== "string") throw new Error("Expected an array of strings.");
    return item;
  });
}
