import { useAppActionOwnerGraphForApp, type AppActionOwnerGraphForAppInput } from "./AppActionOwnerGraph";
import type { AppShellLayoutProps } from "./AppShellLayout";
import { createAppShellSurfacePropsForApp, type AppShellSurfacePropsForAppInput } from "./AppShellSurfaceProps";

type AppActionOwnerGraphShellSurfaceKey =
  | "agentMemoryControls"
  | "browserActionControls"
  | "capabilityPromptActions"
  | "composerInteractionControls"
  | "composerRetryActions"
  | "contextAttachmentActions"
  | "gitActions"
  | "goalActions"
  | "plannerActions"
  | "settingsActions"
  | "shellCommandActions"
  | "symphonyBuilderControls"
  | "threadMaintenanceActions"
  | "updateActions"
  | "workflowRecordingActions"
  | "workflowRecordingPlaybookActions";

export type AppShellSurfaceGraphForAppInput = AppActionOwnerGraphForAppInput &
  Omit<AppShellSurfacePropsForAppInput, AppActionOwnerGraphShellSurfaceKey | "activeThread" | "state"> & {
    activeThread: AppActionOwnerGraphForAppInput["activeThread"];
    state: AppActionOwnerGraphForAppInput["state"];
  };

export interface AppShellSurfaceGraphForAppResult {
  handleMenuCommand: ReturnType<
    typeof useAppActionOwnerGraphForApp
  >["shellCommandActions"]["handleMenuCommand"];
  shellLayoutProps: AppShellLayoutProps | undefined;
}

export function useAppShellSurfaceGraphForApp(
  input: AppShellSurfaceGraphForAppInput,
): AppShellSurfaceGraphForAppResult {
  const appActionOwnerGraph = useAppActionOwnerGraphForApp(input);
  const { activeThread, state, subagentShellControls } = input;
  const shellLayoutProps =
    state && activeThread && !subagentShellControls.activeSubagentChildHiddenByFeatureFlag
      ? createAppShellSurfacePropsForApp({
          ...input,
          ...appActionOwnerGraph,
          activeThread,
          state,
        })
      : undefined;

  return {
    handleMenuCommand: appActionOwnerGraph.shellCommandActions.handleMenuCommand,
    shellLayoutProps,
  };
}
