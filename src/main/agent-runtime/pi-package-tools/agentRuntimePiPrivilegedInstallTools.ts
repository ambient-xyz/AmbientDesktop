import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  previewAmbientCliPackagePiCatalogSource,
  type AmbientCliPiCatalogInstallPreview,
} from "../agentRuntimeAmbientCliFacade";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  installPiPrivilegedPackage,
  scanPiPrivilegedPackage,
  type PiPrivilegedInstallSummary,
  type PiPrivilegedSecurityScan,
} from "./piPrivilegedPackages";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PiPrivilegedInstallPermissionRequest {
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

export interface PiPrivilegedInstallToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  previewAmbientCliPackagePiCatalogSource?: typeof previewAmbientCliPackagePiCatalogSource;
  scanPiPrivilegedPackage?: typeof scanPiPrivilegedPackage;
  installPiPrivilegedPackage?: typeof installPiPrivilegedPackage;
  resolveFirstPartyPluginPermission: (input: PiPrivilegedInstallPermissionRequest) => Promise<boolean> | boolean;
}

export function registerPiPrivilegedInstallTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiPrivilegedInstallToolRegistrationOptions,
): void {
  const previewCliAdapter = options.previewAmbientCliPackagePiCatalogSource ?? previewAmbientCliPackagePiCatalogSource;
  const scanPackage = options.scanPiPrivilegedPackage ?? scanPiPrivilegedPackage;
  const installPackage = options.installPiPrivilegedPackage ?? installPiPrivilegedPackage;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_privileged_install"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Privileged Pi install is blocked in Planner Mode.");
      const input = params as Record<string, unknown>;
      const source = requiredString(input, "source");
      const scanOrigin = optionalPiPrivilegedScanOrigin(input.scanOrigin);
      const cliAdapter = await previewCliAdapter(options.workspace.path, source);
      if (cliAdapter.installable && cliAdapter.resolution) {
        return firstPartyPiCatalogAdapterRedirectResult("ambient_pi_privileged_install", source, cliAdapter);
      }
      const scan = await scanPackage({ source, scanOrigin });
      const detail = piPrivilegedInstallApprovalDetail(options.workspace, scan);
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace: options.workspace,
        toolName: "ambient_pi_privileged_install",
        title: `Install privileged Pi package "${scan.packageName}" as disabled?`,
        message: "Ambient wants to copy a privileged Pi package into managed state. Alpha installs remain disabled and do not activate hooks or mutate Pi settings.",
        detail,
        grantTargetLabel: `Install privileged Pi package ${scan.packageName}`,
        grantTargetIdentity: ["ambient_pi_privileged_install", scan.packageName, scan.fingerprint].join("\0"),
        allowedReason: "Privileged Pi install approved by Ambient permission grant policy.",
        deniedReason: "Privileged Pi install prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Privileged Pi install blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Installing privileged Pi package "${scan.packageName}" as disabled.` }],
        details: { runtime: "pi-privileged", toolName: "ambient_pi_privileged_install", source, scanOrigin: scan.scanOrigin, packageName: scan.packageName, status: "installing" },
      });
      const installed = await installPackage(options.workspace.path, { source, scanOrigin });
      return {
        content: [{ type: "text" as const, text: piPrivilegedInstallText(installed) }],
        details: { runtime: "pi-privileged", toolName: "ambient_pi_privileged_install", packageId: installed.id, packageName: installed.packageName, scanOrigin: installed.scan.scanOrigin, status: installed.status },
      };
    },
  });
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

function piPrivilegedInstallApprovalDetail(workspace: WorkspaceState, scan: PiPrivilegedSecurityScan): string {
  return [
    `Workspace: ${workspace.path}`,
    `Package: ${scan.packageName}`,
    scan.version ? `Version: ${scan.version}` : undefined,
    `Source: ${scan.source}`,
    `Scan origin: ${scan.scanOrigin}`,
    `Fingerprint: ${scan.fingerprint}`,
    `Recommendation: ${scan.recommendation}`,
    `Findings: ${scan.findings.length}`,
    scan.findings.map((finding) => `- [${finding.severity}] ${finding.category}: ${finding.message}`).join("\n"),
    "Effect: copy package into Ambient-managed privileged Pi install state as disabled.",
    "Alpha does not activate hooks, MCP servers, commands, background processes, or Pi settings changes.",
    scan.caveat,
  ]
    .filter(Boolean)
    .join("\n");
}

function piPrivilegedInstallText(pkg: PiPrivilegedInstallSummary): string {
  return [
    "Privileged Pi package installed as disabled",
    `Package: ${pkg.packageName}`,
    `Package id: ${pkg.id}`,
    pkg.version ? `Version: ${pkg.version}` : undefined,
    `Status: ${pkg.status}`,
    `Scan origin: ${pkg.scan.scanOrigin}`,
    `Root: ${pkg.rootPath}`,
    "No hooks, MCP servers, commands, or Pi settings changes were activated.",
    "Use ambient_pi_privileged_uninstall to remove it, or a future activation flow when privileged activation is implemented.",
  ]
    .filter(Boolean)
    .join("\n");
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalPiPrivilegedScanOrigin(value: unknown): "explicit" | "sandbox-fallback" {
  if (value === undefined) return "explicit";
  if (value === "explicit" || value === "sandbox-fallback") return value;
  throw new Error("scanOrigin must be explicit or sandbox-fallback.");
}
