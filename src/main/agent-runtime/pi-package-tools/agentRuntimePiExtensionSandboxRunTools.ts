import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk, ThreadSummary, WorkspaceState } from "../../../shared/types";
import { pluginInstallToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  discoverPiExtensionSandboxPackages,
  runPiExtensionSandboxTool,
  selectPiExtensionSandboxPackage,
  type PiExtensionSandboxCatalog,
  type PiExtensionSandboxPackageSummary,
} from "./piExtensionSandboxPackages";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PiExtensionSandboxRunPermissionRequest {
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

export interface PiExtensionSandboxRunToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  discoverPiExtensionSandboxPackages?: (workspacePath: string) => Promise<PiExtensionSandboxCatalog> | PiExtensionSandboxCatalog;
  runPiExtensionSandboxTool?: typeof runPiExtensionSandboxTool;
  resolveFirstPartyPluginPermission: (input: PiExtensionSandboxRunPermissionRequest) => Promise<boolean> | boolean;
}

export function registerPiExtensionSandboxRunTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiExtensionSandboxRunToolRegistrationOptions,
): void {
  const discoverPackages = options.discoverPiExtensionSandboxPackages ?? discoverPiExtensionSandboxPackages;
  const runTool = options.runPiExtensionSandboxTool ?? runPiExtensionSandboxTool;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_extension"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      const input = params as Record<string, unknown>;
      const packageId = optionalString(input.packageId);
      const packageName = optionalString(input.packageName);
      const toolName = requiredString(input, "toolName");
      const toolParams = optionalRecord(input.params) ?? {};
      const catalog = await discoverPackages(options.workspace.path);
      const pkg = selectPiExtensionSandboxPackage(catalog.packages, { packageId, packageName });
      const tool = pkg.tools.find((candidate) => candidate.name === toolName);
      if (!tool) throw new Error(`Sandboxed Pi extension package "${pkg.name}" does not register tool "${toolName}".`);
      const detail = piExtensionSandboxRunApprovalDetail(options.workspace, pkg, toolName, toolParams);
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace: options.workspace,
        toolName: "ambient_pi_extension",
        title: `Run sandboxed Pi extension "${pkg.name}:${toolName}"?`,
        message: "Ambient wants to run a tool from an installed sandboxed Pi extension package.",
        detail,
        grantTargetLabel: `Run sandboxed Pi extension ${pkg.name}:${toolName}`,
        grantTargetIdentity: [
          "ambient_pi_extension",
          pkg.id,
          pkg.sha,
          toolName,
          stableJson(tool.parameters ?? {}),
          pkg.allowedNetworkHosts.join("\0"),
        ].join("\0"),
        allowedReason: "Sandboxed Pi extension execution approved by Ambient permission grant policy.",
        deniedReason: "Sandboxed Pi extension execution prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Sandboxed Pi extension execution blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Running sandboxed Pi extension "${pkg.name}:${toolName}".` }],
        details: { runtime: "pi-extension-sandbox", toolName: "ambient_pi_extension", packageId: pkg.id, packageName: pkg.name, piToolName: toolName, status: "running" },
      });
      const { result } = await runTool(options.workspace.path, { packageId: pkg.id, toolName, params: toolParams });
      return {
        content: result.content as any,
        details: {
          runtime: "pi-extension-sandbox",
          toolName: "ambient_pi_extension",
          packageId: pkg.id,
          packageName: pkg.name,
          piToolName: result.toolName,
          resultDetails: result.details,
          isError: result.isError,
        },
      };
    },
  });
}

function piExtensionSandboxRunApprovalDetail(
  workspace: WorkspaceState,
  pkg: PiExtensionSandboxPackageSummary,
  toolName: string,
  params: Record<string, unknown>,
): string {
  return [
    `Workspace: ${workspace.path}`,
    `Package: ${pkg.name}`,
    `Package id: ${pkg.id}`,
    `Package root: ${pkg.rootPath}`,
    `SHA: ${pkg.sha}`,
    `Tool: ${toolName}`,
    `Allowed network hosts: ${pkg.allowedNetworkHosts.join(", ") || "none"}`,
    `Params: ${stableJson(params)}`,
    "Host policy: filesystem, process, env, eval, Function, unsupported imports, and undeclared network hosts are denied.",
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

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
