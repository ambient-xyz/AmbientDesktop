import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  previewAmbientCliPackagePiCatalogSource,
  type AmbientCliPiCatalogInstallPreview,
} from "../../ambient-cli/ambientCliPackages";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  scanPiPrivilegedPackage,
  type PiPrivilegedSecurityScan,
} from "./piPrivilegedPackages";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PiPrivilegedScanToolRegistrationOptions {
  workspace: WorkspaceState;
  previewAmbientCliPackagePiCatalogSource?: typeof previewAmbientCliPackagePiCatalogSource;
  scanPiPrivilegedPackage?: typeof scanPiPrivilegedPackage;
}

export function registerPiPrivilegedScanTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiPrivilegedScanToolRegistrationOptions,
): void {
  const previewCliAdapter = options.previewAmbientCliPackagePiCatalogSource ?? previewAmbientCliPackagePiCatalogSource;
  const scanPackage = options.scanPiPrivilegedPackage ?? scanPiPrivilegedPackage;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_privileged_scan"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const source = requiredString(input, "source");
      const scanOrigin = optionalPiPrivilegedScanOrigin(input.scanOrigin);
      const cliAdapter = await previewCliAdapter(options.workspace.path, source);
      if (cliAdapter.installable && cliAdapter.resolution) {
        return firstPartyPiCatalogAdapterRedirectResult("ambient_pi_privileged_scan", source, cliAdapter);
      }
      onUpdate?.({
        content: [{ type: "text", text: `Scanning privileged Pi package from ${source}.` }],
        details: { runtime: "pi-privileged", toolName: "ambient_pi_privileged_scan", source, scanOrigin, status: "scanning" },
      });
      const scan = await scanPackage({ source, scanOrigin });
      return {
        content: [{ type: "text" as const, text: piPrivilegedScanText(scan) }],
        details: { runtime: "pi-privileged", toolName: "ambient_pi_privileged_scan", source, scanOrigin: scan.scanOrigin, packageName: scan.packageName, recommendation: scan.recommendation, riskSummary: scan.riskSummary },
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

function piPrivilegedScanText(scan: PiPrivilegedSecurityScan): string {
  const findings = scan.findings.length
    ? scan.findings.map((finding) => `- [${finding.severity}] ${finding.category}: ${finding.message}${finding.files.length ? ` (${finding.files.slice(0, 4).join(", ")})` : ""}`).join("\n")
    : "- No high-risk patterns found by the heuristic scan.";
  return [
    "Privileged Pi package scan",
    `Package: ${scan.packageName}`,
    scan.version ? `Version: ${scan.version}` : undefined,
    scan.repositoryUrl ? `Repository: ${scan.repositoryUrl}` : undefined,
    `Scan origin: ${scan.scanOrigin}`,
    `Fingerprint: ${scan.fingerprint}`,
    `Recommendation: ${scan.recommendation}`,
    `Pi extensions: ${scan.resources.piExtensions.join(", ") || "none"}`,
    `Skills: ${scan.resources.piSkills.join(", ") || "none"}`,
    `Commands/hooks/MCP: ${scan.riskSummary.commands || scan.riskSummary.lifecycleHooks || scan.riskSummary.mcpServers ? "detected" : "not detected"}`,
    "Findings:",
    findings,
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

function optionalPiPrivilegedScanOrigin(value: unknown): "explicit" | "sandbox-fallback" {
  if (value === undefined) return "explicit";
  if (value === "explicit" || value === "sandbox-fallback") return value;
  throw new Error("scanOrigin must be explicit or sandbox-fallback.");
}
