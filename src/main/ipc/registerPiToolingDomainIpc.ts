import type { IpcMain } from "electron";

import {
  piExtensionSandboxClearHistoryIpcChannels,
  piExtensionSandboxInspectIpcChannels,
  piExtensionSandboxInstallIpcChannels,
  piExtensionSandboxPreviewIpcChannels,
  piExtensionSandboxUninstallIpcChannels,
  registerPiExtensionSandboxClearHistoryIpc,
  registerPiExtensionSandboxInspectIpc,
  registerPiExtensionSandboxInstallIpc,
  registerPiExtensionSandboxPreviewIpc,
  registerPiExtensionSandboxUninstallIpc,
} from "./registerPiExtensionSandboxIpc";
import {
  piPackagesInspectIpcChannels,
  piPackagesInstallIpcChannels,
  piPackagesPreviewInstallIpcChannels,
  piPackagesSetEnabledIpcChannels,
  piPackagesUninstallIpcChannels,
  registerPiPackagesInspectIpc,
  registerPiPackagesInstallIpc,
  registerPiPackagesPreviewInstallIpc,
  registerPiPackagesSetEnabledIpc,
  registerPiPackagesUninstallIpc,
} from "./registerPiPackageIpc";
import {
  piPrivilegedClearHistoryIpcChannels,
  piPrivilegedDisableIpcChannels,
  piPrivilegedInspectIpcChannels,
  piPrivilegedInstallIpcChannels,
  piPrivilegedScanIpcChannels,
  piPrivilegedUninstallIpcChannels,
  registerPiPrivilegedClearHistoryIpc,
  registerPiPrivilegedDisableIpc,
  registerPiPrivilegedInspectIpc,
  registerPiPrivilegedInstallIpc,
  registerPiPrivilegedScanIpc,
  registerPiPrivilegedUninstallIpc,
} from "./registerPiPrivilegedIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const piToolingDomainIpcChannels = [
  ...piPackagesInspectIpcChannels,
  ...piPackagesPreviewInstallIpcChannels,
  ...piPackagesInstallIpcChannels,
  ...piPackagesUninstallIpcChannels,
  ...piPackagesSetEnabledIpcChannels,
  ...piExtensionSandboxInspectIpcChannels,
  ...piExtensionSandboxPreviewIpcChannels,
  ...piExtensionSandboxInstallIpcChannels,
  ...piExtensionSandboxUninstallIpcChannels,
  ...piExtensionSandboxClearHistoryIpcChannels,
  ...piPrivilegedInspectIpcChannels,
  ...piPrivilegedScanIpcChannels,
  ...piPrivilegedInstallIpcChannels,
  ...piPrivilegedDisableIpcChannels,
  ...piPrivilegedUninstallIpcChannels,
  ...piPrivilegedClearHistoryIpcChannels,
] as const;

export interface RegisterPiToolingDomainIpcDependencies {
  handleIpc: HandleIpc;
  activeThreadIdForHost: any;
  clearPiExtensionSandboxHistory: any;
  clearPiPrivilegedPackageHistory: any;
  disablePiPrivilegedPackage: any;
  discoverPiExtensionSandboxPackages: any;
  discoverPiPrivilegedPackages: any;
  emitPermissionAuditCreated: any;
  emitPluginCatalogUpdated: any;
  formatPiExtensionSandboxInstallApprovalDetail: any;
  formatPiPrivilegedInstallApprovalDetail: any;
  formatPiResourceCountsForPermission: any;
  installPiExtensionSandboxPackage: any;
  installPiPrivilegedPackage: any;
  permissionGrantTargetHash: any;
  permissions: any;
  pluginHost: any;
  pluginStateReaderForStore: any;
  previewPiExtensionSandboxInstall: any;
  requestPermissionWithGrantRegistry: any;
  requireActiveProjectRuntimeHost: any;
  resetProjectRuntimeAndPluginServers: any;
  revokePluginGrantsForLabels: any;
  scanPiPrivilegedPackage: any;
  uninstallPiExtensionSandboxPackage: any;
  uninstallPiPrivilegedPackage: any;
}

export function registerPiToolingDomainIpc({
  handleIpc,
  activeThreadIdForHost,
  clearPiExtensionSandboxHistory,
  clearPiPrivilegedPackageHistory,
  disablePiPrivilegedPackage,
  discoverPiExtensionSandboxPackages,
  discoverPiPrivilegedPackages,
  emitPermissionAuditCreated,
  emitPluginCatalogUpdated,
  formatPiExtensionSandboxInstallApprovalDetail,
  formatPiPrivilegedInstallApprovalDetail,
  formatPiResourceCountsForPermission,
  installPiExtensionSandboxPackage,
  installPiPrivilegedPackage,
  permissionGrantTargetHash,
  permissions,
  pluginHost,
  pluginStateReaderForStore,
  previewPiExtensionSandboxInstall,
  requestPermissionWithGrantRegistry,
  requireActiveProjectRuntimeHost,
  resetProjectRuntimeAndPluginServers,
  revokePluginGrantsForLabels,
  scanPiPrivilegedPackage,
  uninstallPiExtensionSandboxPackage,
  uninstallPiPrivilegedPackage,
}: RegisterPiToolingDomainIpcDependencies): void {
  registerPiPackagesInspectIpc({
    handleIpc,
    inspectPiPackages: () => {
      const host = requireActiveProjectRuntimeHost();
      return pluginHost.inspectPiPackages(host.workspacePath, pluginStateReaderForStore(host.store));
    },
  });

  registerPiPackagesPreviewInstallIpc({
    handleIpc,
    previewPiPackageInstall: (input) => {
      const host = requireActiveProjectRuntimeHost();
      return pluginHost.previewPiPackageInstall(host.workspacePath, input);
    },
  });

  registerPiPackagesInstallIpc({
    handleIpc,
    installPiPackage: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const targetThreadId = activeThreadIdForHost(host);
      const preview = await pluginHost.previewPiPackageInstall(host.workspacePath, input);
      if (!preview.installable) throw new Error(`Pi package source is not installable: ${preview.errors.join("; ")}`);
      const response = await permissions.request({
        threadId: targetThreadId,
        toolName: "pi_package_install",
        title: `Register Pi package "${preview.candidate?.name ?? preview.normalizedSource}"?`,
        message: "Ambient will record this Pi package source in Ambient-managed state. It will not run package code or install dependencies.",
        detail: [
          `Workspace: ${host.workspacePath}`,
          `Scope: ${preview.scope}`,
          `Source: ${preview.normalizedSource}`,
          preview.candidate ? `Package: ${preview.candidate.name}${preview.candidate.version ? `@${preview.candidate.version}` : ""}` : undefined,
          preview.candidate ? `Resources: ${formatPiResourceCountsForPermission(preview.candidate.resourceCounts)}` : undefined,
          ...preview.notes,
        ].filter((line): line is string => Boolean(line)).join("\n"),
        risk: "plugin-tool",
      });
      if (!response.allowed) throw new Error("Pi package install was not approved.");
      const catalog = await pluginHost.installPiPackage(host.workspacePath, input, pluginStateReaderForStore(host.store));
      resetProjectRuntimeAndPluginServers(host);
      return catalog;
    },
  });

  registerPiPackagesUninstallIpc({
    handleIpc,
    uninstallPiPackage: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const catalog = await pluginHost.uninstallPiPackage(host.workspacePath, input, pluginStateReaderForStore(host.store));
      host.store.clearPiPackageEnabled(input.packageId);
      resetProjectRuntimeAndPluginServers(host);
      return catalog;
    },
  });

  registerPiPackagesSetEnabledIpc({
    handleIpc,
    setPiPackageEnabled: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      await pluginHost.validatePiPackageEnablement(host.workspacePath, input, pluginStateReaderForStore(host.store));
      host.store.setPiPackageEnabled(input.packageId, input.enabled);
      resetProjectRuntimeAndPluginServers(host);
      return pluginHost.inspectPiPackages(host.workspacePath, pluginStateReaderForStore(host.store));
    },
  });

  registerPiExtensionSandboxInspectIpc({
    handleIpc,
    inspectPiExtensionSandboxPackages: () => discoverPiExtensionSandboxPackages(requireActiveProjectRuntimeHost().workspacePath),
  });

  registerPiExtensionSandboxPreviewIpc({
    handleIpc,
    previewPiExtensionSandboxPackage: (input) =>
      previewPiExtensionSandboxInstall(requireActiveProjectRuntimeHost().workspacePath, input),
  });

  registerPiExtensionSandboxInstallIpc({
    handleIpc,
    installPiExtensionSandboxPackage: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      const targetThreadId = activeThreadIdForHost(host);
      const preview = await previewPiExtensionSandboxInstall(host.workspacePath, input);
      if (!preview.installable) throw new Error(`Sandboxed Pi extension package is not installable: ${preview.errors.join("; ")}`);
      const thread = targetStore.getThread(targetThreadId);
      const resolution = await requestPermissionWithGrantRegistry({
        threadId: targetThreadId,
        workspacePath: thread.workspacePath,
        toolName: "ambient_pi_extension_install_sandboxed",
        title: `Install sandboxed Pi extension "${preview.packageName ?? input.source}"?`,
        message: "Ambient will copy this Pi tool package into managed sandbox state and expose only its registered tools through permission-mediated calls.",
        detail: formatPiExtensionSandboxInstallApprovalDetail(preview),
        risk: "plugin-tool",
        grantTargetLabel: `Install sandboxed Pi extension ${preview.packageName ?? input.source}`,
      }, {
        thread,
        permissionMode: thread.permissionMode,
        workspacePath: host.workspacePath,
        store: targetStore,
      });
      const detail = formatPiExtensionSandboxInstallApprovalDetail(preview);
      const entry = targetStore.addPermissionAudit({
        threadId: targetThreadId,
        permissionMode: thread.permissionMode,
        toolName: "ambient_pi_extension_install_sandboxed",
        risk: "plugin-tool",
        decision: resolution.allowed ? "allowed" : "denied",
        detail,
        reason: resolution.allowed ? "Approved sandboxed Pi extension install." : "Denied sandboxed Pi extension install.",
        decisionSource: resolution.decisionSource,
        grantId: resolution.grant?.id,
      });
      emitPermissionAuditCreated(entry, host.workspacePath);
      if (!resolution.allowed) throw new Error("Sandboxed Pi extension install was not approved.");
      await installPiExtensionSandboxPackage(host.workspacePath, input);
      resetProjectRuntimeAndPluginServers(host);
      emitPluginCatalogUpdated(host.workspacePath);
      return discoverPiExtensionSandboxPackages(host.workspacePath);
    },
  });

  registerPiExtensionSandboxUninstallIpc({
    handleIpc,
    uninstallPiExtensionSandboxPackage: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      const targetThreadId = activeThreadIdForHost(host);
      const removed = await uninstallPiExtensionSandboxPackage(host.workspacePath, input);
      const thread = targetStore.getThread(targetThreadId);
      const entry = targetStore.addPermissionAudit({
        threadId: targetThreadId,
        permissionMode: thread.permissionMode,
        toolName: "ambient_pi_extension_uninstall_sandboxed",
        risk: "plugin-tool",
        decision: "allowed",
        detail: [
          `Package: ${removed.removed.name}`,
          `Package id: ${removed.removed.id}`,
          `Source: ${removed.removed.source}`,
          `Root path: ${removed.removed.rootPath}`,
          "Effect: removed Ambient-managed sandbox package state.",
        ].join("\n"),
        reason: "Removed sandboxed Pi extension package.",
        decisionSource: "policy",
      });
      emitPermissionAuditCreated(entry, host.workspacePath);
      revokePluginGrantsForLabels([
        `Run sandboxed Pi extension ${removed.removed.name}:`,
        `Install sandboxed Pi extension ${removed.removed.name}`,
        `Uninstall sandboxed Pi extension ${removed.removed.name}`,
      ], targetStore);
      resetProjectRuntimeAndPluginServers(host);
      emitPluginCatalogUpdated(host.workspacePath);
      return removed.catalog;
    },
  });

  registerPiExtensionSandboxClearHistoryIpc({
    handleIpc,
    clearPiExtensionSandboxHistory: async () => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      const targetThreadId = activeThreadIdForHost(host);
      const previous = await discoverPiExtensionSandboxPackages(host.workspacePath);
      const catalog = await clearPiExtensionSandboxHistory(host.workspacePath);
      const thread = targetStore.getThread(targetThreadId);
      const entry = targetStore.addPermissionAudit({
        threadId: targetThreadId,
        permissionMode: thread.permissionMode,
        toolName: "ambient_pi_extension_clear_history",
        risk: "plugin-tool",
        decision: "allowed",
        detail: [
          `Removed records: ${previous.history.length}`,
          previous.history.length ? `Packages: ${previous.history.map((pkg: any) => pkg.name).join(", ")}` : "Packages: none",
          "Effect: cleared Ambient-managed sandboxed Pi removed-package history.",
        ].join("\n"),
        reason: "Cleared sandboxed Pi package history.",
        decisionSource: "policy",
      });
      emitPermissionAuditCreated(entry, host.workspacePath);
      emitPluginCatalogUpdated(host.workspacePath);
      return catalog;
    },
  });

  registerPiPrivilegedInspectIpc({
    handleIpc,
    inspectPiPrivilegedPackages: () => discoverPiPrivilegedPackages(requireActiveProjectRuntimeHost().workspacePath),
  });

  registerPiPrivilegedScanIpc({
    handleIpc,
    scanPiPrivilegedPackage,
  });

  registerPiPrivilegedInstallIpc({
    handleIpc,
    installPiPrivilegedPackage: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      const targetThreadId = activeThreadIdForHost(host);
      const scan = await scanPiPrivilegedPackage(input);
      const thread = targetStore.getThread(targetThreadId);
      const detail = formatPiPrivilegedInstallApprovalDetail(scan);
      const response = thread.permissionMode === "full-access"
        ? { allowed: true, decisionSource: "allowed_by_full_access" as const, grant: undefined }
        : await requestPermissionWithGrantRegistry({
          threadId: targetThreadId,
          toolName: "pi_privileged_install",
          title: `Install privileged Pi package "${scan.packageName}" as disabled?`,
          message: "Ambient will copy this privileged Pi package into managed state. Alpha installs remain disabled and do not activate hooks or mutate Pi settings.",
          detail,
          risk: "plugin-tool",
          grantActionKind: "plugin_tool_execute",
          grantTargetKind: "tool",
          grantTargetLabel: `Install privileged Pi package ${scan.packageName}`,
          grantTargetHash: permissionGrantTargetHash("plugin_tool_execute", "tool", ["pi_privileged_install", scan.packageName, scan.fingerprint].join("\0")),
        }, {
          thread,
          permissionMode: thread.permissionMode,
          workspacePath: host.workspacePath,
          store: targetStore,
        });
      const entry = targetStore.addPermissionAudit({
        threadId: targetThreadId,
        permissionMode: thread.permissionMode,
        toolName: "pi_privileged_install",
        risk: "plugin-tool",
        decision: response.allowed ? "allowed" : "denied",
        detail,
        reason: response.decisionSource === "allowed_by_full_access"
          ? "Allowed automatically by Full Access mode."
          : response.allowed ? "Approved privileged Pi install." : "Denied privileged Pi install.",
        decisionSource: response.decisionSource,
        grantId: response.grant?.id,
      });
      emitPermissionAuditCreated(entry, host.workspacePath);
      if (!response.allowed) throw new Error("Privileged Pi install was not approved.");
      await installPiPrivilegedPackage(host.workspacePath, { ...input, reviewedScan: scan });
      resetProjectRuntimeAndPluginServers(host);
      emitPluginCatalogUpdated(host.workspacePath);
      return discoverPiPrivilegedPackages(host.workspacePath);
    },
  });

  registerPiPrivilegedDisableIpc({
    handleIpc,
    disablePiPrivilegedPackage: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      const targetThreadId = activeThreadIdForHost(host);
      const disabled = await disablePiPrivilegedPackage(host.workspacePath, input);
      const thread = targetStore.getThread(targetThreadId);
      const entry = targetStore.addPermissionAudit({
        threadId: targetThreadId,
        permissionMode: thread.permissionMode,
        toolName: "pi_privileged_disable",
        risk: "plugin-tool",
        decision: "allowed",
        detail: [
          `Package: ${disabled.packageName}`,
          `Package id: ${disabled.id}`,
          `Source: ${disabled.source}`,
          `Scan origin: ${disabled.scan.scanOrigin}`,
          "Effect: package remains inactive in Ambient-managed privileged state.",
        ].join("\n"),
        reason: "Disabled privileged Pi package.",
        decisionSource: "policy",
      });
      emitPermissionAuditCreated(entry, host.workspacePath);
      resetProjectRuntimeAndPluginServers(host);
      emitPluginCatalogUpdated(host.workspacePath);
      return discoverPiPrivilegedPackages(host.workspacePath);
    },
  });

  registerPiPrivilegedUninstallIpc({
    handleIpc,
    uninstallPiPrivilegedPackage: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      const targetThreadId = activeThreadIdForHost(host);
      const removed = await uninstallPiPrivilegedPackage(host.workspacePath, input);
      const thread = targetStore.getThread(targetThreadId);
      const entry = targetStore.addPermissionAudit({
        threadId: targetThreadId,
        permissionMode: thread.permissionMode,
        toolName: "pi_privileged_uninstall",
        risk: "plugin-tool",
        decision: "allowed",
        detail: [
          `Package: ${removed.removed.packageName}`,
          `Package id: ${removed.removed.id}`,
          `Source: ${removed.removed.source}`,
          `Scan origin: ${removed.removed.scan.scanOrigin}`,
          `Root path: ${removed.removed.rootPath}`,
          "Effect: removed Ambient-managed privileged package manifest/import state.",
          ...removed.manualCleanup.map((note: any) => `Cleanup note: ${note}`),
        ].join("\n"),
        reason: "Removed privileged Pi package.",
        decisionSource: "policy",
      });
      emitPermissionAuditCreated(entry, host.workspacePath);
      revokePluginGrantsForLabels([
        `Install privileged Pi package ${removed.removed.packageName}`,
        `Uninstall privileged Pi package ${removed.removed.packageName}`,
      ], targetStore);
      resetProjectRuntimeAndPluginServers(host);
      emitPluginCatalogUpdated(host.workspacePath);
      return removed.catalog;
    },
  });

  registerPiPrivilegedClearHistoryIpc({
    handleIpc,
    clearPiPrivilegedPackageHistory: async () => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      const targetThreadId = activeThreadIdForHost(host);
      const previous = await discoverPiPrivilegedPackages(host.workspacePath);
      const catalog = await clearPiPrivilegedPackageHistory(host.workspacePath);
      const thread = targetStore.getThread(targetThreadId);
      const entry = targetStore.addPermissionAudit({
        threadId: targetThreadId,
        permissionMode: thread.permissionMode,
        toolName: "pi_privileged_clear_history",
        risk: "plugin-tool",
        decision: "allowed",
        detail: [
          `Removed records: ${previous.history.length}`,
          previous.history.length ? `Packages: ${previous.history.map((pkg: any) => pkg.packageName).join(", ")}` : "Packages: none",
          "Effect: cleared Ambient-managed privileged Pi removed-package history.",
        ].join("\n"),
        reason: "Cleared privileged Pi package history.",
        decisionSource: "policy",
      });
      emitPermissionAuditCreated(entry, host.workspacePath);
      emitPluginCatalogUpdated(host.workspacePath);
      return catalog;
    },
  });
}
