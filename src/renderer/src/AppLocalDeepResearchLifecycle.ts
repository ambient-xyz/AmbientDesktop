import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  localDeepResearchRuntimeInventorySettingsRefreshDecision,
  localDeepResearchSetupResultModel,
  type LocalDeepResearchSetupAction,
  type LocalDeepResearchSetupResult,
} from "./localDeepResearchUiModel";
import type {
  LocalDeepResearchSetupUiState,
  UtilityPanel,
} from "./RightPanel";

export function localDeepResearchStatusCheckingState(
  current: LocalDeepResearchSetupUiState,
): LocalDeepResearchSetupUiState {
  if (current.status === "running") return current;
  return { status: "running", action: "status", message: "Checking Local Deep Research..." };
}

export function localDeepResearchSetupRunningState(
  current: LocalDeepResearchSetupUiState,
  action: LocalDeepResearchSetupAction,
  message: string,
): LocalDeepResearchSetupUiState {
  if (current.status === "running" && current.action === action && current.message === message) return current;
  return { status: "running", action, message };
}

function setupPayloadsEqual<T>(left: T, right: T): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function localDeepResearchSetupStatesEqual(
  left: LocalDeepResearchSetupUiState,
  right: LocalDeepResearchSetupUiState,
): boolean {
  return left.status === right.status &&
    left.action === right.action &&
    left.message === right.message &&
    setupPayloadsEqual(left.result, right.result) &&
    setupPayloadsEqual(left.diagnostics, right.diagnostics) &&
    setupPayloadsEqual(left.progress, right.progress);
}

export function localDeepResearchInstallProgressState(
  current: LocalDeepResearchSetupUiState,
  progress: NonNullable<LocalDeepResearchSetupUiState["progress"]>,
): LocalDeepResearchSetupUiState {
  const next = current.status === "running" && current.action === progress.action
    ? { ...current, message: progress.message, progress }
    : {
        ...current,
        status: "running" as const,
        action: progress.action,
        message: progress.message,
        progress,
      };
  return localDeepResearchSetupStatesEqual(current, next) ? current : next;
}

export function localDeepResearchSetupResultState(
  result: LocalDeepResearchSetupResult,
  current: LocalDeepResearchSetupUiState,
  action: LocalDeepResearchSetupAction = result.action,
): LocalDeepResearchSetupUiState {
  const model = localDeepResearchSetupResultModel(result);
  const next: LocalDeepResearchSetupUiState = {
    status: model.statusTone === "error" ? "error" : "success",
    action,
    message: model.statusLabel,
    result,
    diagnostics: model.diagnostics,
    progress: current.action === action ? current.progress : undefined,
  };
  return localDeepResearchSetupStatesEqual(current, next) ? current : next;
}

export function localDeepResearchStatusResultState(
  result: LocalDeepResearchSetupResult,
  current: LocalDeepResearchSetupUiState,
): LocalDeepResearchSetupUiState {
  return localDeepResearchSetupResultState(result, current, "status");
}

export function localDeepResearchStatusErrorState(error: unknown): LocalDeepResearchSetupUiState {
  return {
    status: "error",
    action: "status",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function useAppLocalDeepResearchLifecycle({
  localDeepResearchSetup,
  localRuntimeInventorySettingsRefreshKeyRef,
  panel,
  setLocalDeepResearchSetup,
  setupLocalDeepResearchFromSettings,
  workspacePath,
}: {
  localDeepResearchSetup: LocalDeepResearchSetupUiState;
  localRuntimeInventorySettingsRefreshKeyRef: MutableRefObject<string | undefined>;
  panel: UtilityPanel | undefined;
  setLocalDeepResearchSetup: Dispatch<SetStateAction<LocalDeepResearchSetupUiState>>;
  setupLocalDeepResearchFromSettings: (action: "status") => Promise<LocalDeepResearchSetupResult | undefined>;
  workspacePath: string | undefined;
}): void {
  const hasLocalRuntimeInventory = Boolean(localDeepResearchSetup.result?.localRuntimeInventory);

  useEffect(() => {
    if (hasLocalRuntimeInventory) {
      localRuntimeInventorySettingsRefreshKeyRef.current = undefined;
    }
    const decision = localDeepResearchRuntimeInventorySettingsRefreshDecision({
      panel,
      workspacePath,
      setupStatus: localDeepResearchSetup.status,
      hasRuntimeInventory: hasLocalRuntimeInventory,
      lastRefreshKey: localRuntimeInventorySettingsRefreshKeyRef.current,
    });
    if (decision.refreshKey) {
      localRuntimeInventorySettingsRefreshKeyRef.current = decision.refreshKey;
    }
    if (decision.shouldRefresh) {
      void setupLocalDeepResearchFromSettings("status");
    }
  }, [
    panel,
    workspacePath,
    localDeepResearchSetup.status,
    hasLocalRuntimeInventory,
  ]);

  useEffect(() => {
    if (!workspacePath) return;
    let canceled = false;
    setLocalDeepResearchSetup(localDeepResearchStatusCheckingState);
    window.ambientDesktop.setupLocalDeepResearch({ action: "status", q8Override: false })
      .then((result) => {
        if (canceled) return;
        setLocalDeepResearchSetup((current) => localDeepResearchStatusResultState(result, current));
      })
      .catch((error) => {
        if (canceled) return;
        setLocalDeepResearchSetup(localDeepResearchStatusErrorState(error));
      });
    return () => {
      canceled = true;
    };
  }, [workspacePath]);
}
