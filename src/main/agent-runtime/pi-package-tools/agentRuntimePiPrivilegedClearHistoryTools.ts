import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk, ThreadSummary, WorkspaceState } from "../../../shared/types";
import { pluginInstallToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  clearPiPrivilegedPackageHistory,
  discoverPiPrivilegedPackages,
  type PiPrivilegedCatalog,
} from "./piPrivilegedPackages";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PiPrivilegedClearHistoryPermissionRequest {
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

export interface PiPrivilegedClearHistoryToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  discoverPiPrivilegedPackages?: (workspacePath: string) => Promise<PiPrivilegedCatalog> | PiPrivilegedCatalog;
  clearPiPrivilegedPackageHistory?: (workspacePath: string) => Promise<PiPrivilegedCatalog> | PiPrivilegedCatalog;
  resolveFirstPartyPluginPermission: (input: PiPrivilegedClearHistoryPermissionRequest) => Promise<boolean> | boolean;
  emit: (event: { type: "plugin-catalog-updated" }) => void;
}

export function registerPiPrivilegedClearHistoryTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiPrivilegedClearHistoryToolRegistrationOptions,
): void {
  const discoverPackages = options.discoverPiPrivilegedPackages ?? discoverPiPrivilegedPackages;
  const clearHistory = options.clearPiPrivilegedPackageHistory ?? clearPiPrivilegedPackageHistory;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_privileged_clear_history"), {
    executionMode: "sequential",
    execute: async (_toolCallId, _params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Privileged Pi package history clearing is blocked in Planner Mode.");
      const catalog = await discoverPackages(options.workspace.path);
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace: options.workspace,
        toolName: "ambient_pi_privileged_clear_history",
        title: "Clear privileged Pi package history?",
        message: "Ambient wants to clear retained removed-package history for privileged Pi packages. Active installs, grants, and audit rows are unchanged.",
        detail: piPrivilegedClearHistoryApprovalDetail(options.workspace, catalog),
        grantTargetLabel: "Clear privileged Pi package history",
        grantTargetIdentity: ["ambient_pi_privileged_clear_history", options.workspace.path, catalog.history.map((entry) => entry.id).join("\0")].join("\0"),
        allowedReason: "Privileged Pi package history clear approved by Ambient permission grant policy.",
        deniedReason: "Privileged Pi package history clear prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Privileged Pi package history clear blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: "Clearing retained privileged Pi package history." }],
        details: { runtime: "pi-privileged", toolName: "ambient_pi_privileged_clear_history", status: "clearing", historyCount: catalog.history.length },
      });
      const nextCatalog = await clearHistory(options.workspace.path);
      options.emit({ type: "plugin-catalog-updated" });
      return {
        content: [{ type: "text" as const, text: piPrivilegedClearHistoryText(catalog.history.length, nextCatalog) }],
        details: {
          runtime: "pi-privileged",
          toolName: "ambient_pi_privileged_clear_history",
          clearedCount: catalog.history.length,
          installedCount: nextCatalog.packages.length,
          historyCount: nextCatalog.history.length,
          errors: nextCatalog.errors,
        },
      };
    },
  });
}

function piPrivilegedClearHistoryApprovalDetail(workspace: WorkspaceState, catalog: PiPrivilegedCatalog): string {
  return [
    `Workspace: ${workspace.path}`,
    `Retained removed packages: ${catalog.history.length}`,
    catalog.history.length ? catalog.history.map((entry) => `- ${entry.packageName} (${entry.id}); removedAt: ${entry.removedAt}; manualCleanup: ${entry.manualCleanup.length}`).join("\n") : "- none",
    `Active installs preserved: ${catalog.packages.length}`,
    "Effect: remove retained removed-package history for privileged Pi packages.",
    "Audit history, active installs, permission grants, and unmanaged host side effects are unchanged.",
  ].join("\n");
}

function piPrivilegedClearHistoryText(clearedCount: number, catalog: PiPrivilegedCatalog): string {
  return [
    "Privileged Pi package history cleared",
    `Cleared records: ${clearedCount}`,
    `Remaining removed-package history: ${catalog.history.length}`,
    `Active installs preserved: ${catalog.packages.length}`,
    "Audit history is preserved.",
  ].join("\n");
}
