import { useEffect } from "react";
import type { MutableRefObject } from "react";

import type {
  DesktopEvent,
  DesktopState,
  RunStatus,
} from "../../shared/types";
import {
  mcpContainerRuntimeShouldOpenStartupPanel,
} from "./pluginUiModel";

export function appBootstrapRunStatus(state: Pick<DesktopState, "activeThreadId" | "threadRunStatuses">): RunStatus {
  return state.threadRunStatuses?.[state.activeThreadId] ?? "idle";
}

export function shouldRunMcpContainerRuntimeStartupCheck({
  alreadyChecked,
  state,
}: {
  alreadyChecked: boolean;
  state: DesktopState | undefined;
}): boolean {
  return Boolean(state && !alreadyChecked);
}

export function useAppStartupLifecycleEffects({
  loadPendingPermissionRequests,
  loadPermissionAudit,
  loadPermissionGrants,
  mcpContainerRuntimeStartupCheckRef,
  onBootstrapError,
  onBootstrapState,
  onDesktopEvent,
  openMcpRuntimeSettings,
  permissionAuditRevision,
  state,
}: {
  loadPendingPermissionRequests: () => void | Promise<void>;
  loadPermissionAudit: () => void | Promise<void>;
  loadPermissionGrants: () => void | Promise<void>;
  mcpContainerRuntimeStartupCheckRef: MutableRefObject<boolean>;
  onBootstrapError: (error: unknown) => void;
  onBootstrapState: (state: DesktopState) => void;
  onDesktopEvent: (event: DesktopEvent) => void;
  openMcpRuntimeSettings: () => void;
  permissionAuditRevision: number;
  state: DesktopState | undefined;
}): void {
  useEffect(() => {
    void window.ambientDesktop
      .bootstrap()
      .then(onBootstrapState)
      .catch(onBootstrapError);
    return window.ambientDesktop.onEvent((event) => onDesktopEvent(event));
  }, []);

  useEffect(() => {
    if (!state) return;
    void loadPermissionAudit();
    void loadPermissionGrants();
    void loadPendingPermissionRequests();
  }, [state?.workspace.path, permissionAuditRevision]);

  useEffect(() => {
    if (!shouldRunMcpContainerRuntimeStartupCheck({ state, alreadyChecked: mcpContainerRuntimeStartupCheckRef.current })) return;
    mcpContainerRuntimeStartupCheckRef.current = true;
    let disposed = false;
    void window.ambientDesktop.getMcpContainerRuntimeStatus()
      .then((status) => {
        if (disposed) return;
        if (mcpContainerRuntimeShouldOpenStartupPanel(status)) openMcpRuntimeSettings();
      })
      .catch((error) => {
        if (disposed) return;
        console.warn(`[mcp-container-runtime] startup UI check failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => {
      disposed = true;
    };
  }, [state?.workspace.path]);
}
