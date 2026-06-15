import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk, ThreadSummary, WorkspaceState } from "../shared/types";
import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  clearPiExtensionSandboxHistory,
  discoverPiExtensionSandboxPackages,
  type PiExtensionSandboxCatalog,
} from "./piExtensionSandboxPackages";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PiExtensionSandboxClearHistoryPermissionRequest {
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

export interface PiExtensionSandboxClearHistoryToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  discoverPiExtensionSandboxPackages?: (workspacePath: string) => Promise<PiExtensionSandboxCatalog> | PiExtensionSandboxCatalog;
  clearPiExtensionSandboxHistory?: (workspacePath: string) => Promise<PiExtensionSandboxCatalog> | PiExtensionSandboxCatalog;
  resolveFirstPartyPluginPermission: (input: PiExtensionSandboxClearHistoryPermissionRequest) => Promise<boolean> | boolean;
  emit: (event: { type: "plugin-catalog-updated" }) => void;
}

export function registerPiExtensionSandboxClearHistoryTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiExtensionSandboxClearHistoryToolRegistrationOptions,
): void {
  const discoverPackages = options.discoverPiExtensionSandboxPackages ?? discoverPiExtensionSandboxPackages;
  const clearHistory = options.clearPiExtensionSandboxHistory ?? clearPiExtensionSandboxHistory;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_extension_clear_history"), {
    executionMode: "sequential",
    execute: async (_toolCallId, _params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Sandboxed Pi extension history clearing is blocked in Planner Mode.");
      const catalog = await discoverPackages(options.workspace.path);
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace: options.workspace,
        toolName: "ambient_pi_extension_clear_history",
        title: "Clear sandboxed Pi extension history?",
        message: "Ambient wants to clear retained removed-package history for sandboxed Pi extensions. Active installs and audit rows are unchanged.",
        detail: piExtensionSandboxClearHistoryApprovalDetail(options.workspace, catalog),
        grantTargetLabel: "Clear sandboxed Pi extension history",
        grantTargetIdentity: ["ambient_pi_extension_clear_history", options.workspace.path, catalog.history.map((entry) => entry.id).join("\0")].join("\0"),
        allowedReason: "Sandboxed Pi extension history clear approved by Ambient permission grant policy.",
        deniedReason: "Sandboxed Pi extension history clear prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Sandboxed Pi extension history clear blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: "Clearing retained sandboxed Pi extension history." }],
        details: { runtime: "pi-extension-sandbox", toolName: "ambient_pi_extension_clear_history", status: "clearing", historyCount: catalog.history.length },
      });
      const nextCatalog = await clearHistory(options.workspace.path);
      options.emit({ type: "plugin-catalog-updated" });
      return {
        content: [{ type: "text" as const, text: piExtensionSandboxClearHistoryText(catalog.history.length, nextCatalog) }],
        details: {
          runtime: "pi-extension-sandbox",
          toolName: "ambient_pi_extension_clear_history",
          clearedCount: catalog.history.length,
          installedCount: nextCatalog.packages.length,
          historyCount: nextCatalog.history.length,
          errors: nextCatalog.errors,
        },
      };
    },
  });
}

function piExtensionSandboxClearHistoryApprovalDetail(workspace: WorkspaceState, catalog: PiExtensionSandboxCatalog): string {
  return [
    `Workspace: ${workspace.path}`,
    `Retained removed packages: ${catalog.history.length}`,
    catalog.history.length ? catalog.history.map((entry) => `- ${entry.name} (${entry.id}); removedAt: ${entry.removedAt}`).join("\n") : "- none",
    `Active installs preserved: ${catalog.packages.length}`,
    "Effect: remove retained removed-package history for sandboxed Pi extensions.",
    "Audit history, active installs, and permission grants are unchanged.",
  ].join("\n");
}

function piExtensionSandboxClearHistoryText(clearedCount: number, catalog: PiExtensionSandboxCatalog): string {
  return [
    "Sandboxed Pi extension history cleared",
    `Cleared records: ${clearedCount}`,
    `Remaining removed-package history: ${catalog.history.length}`,
    `Active installs preserved: ${catalog.packages.length}`,
    "Audit history is preserved.",
  ].join("\n");
}
