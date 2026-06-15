import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  localDeepResearchRuntimeInventorySettingsRefreshDecision,
  localDeepResearchSetupResultModel,
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

export function localDeepResearchStatusResultState(
  result: LocalDeepResearchSetupResult,
  current: LocalDeepResearchSetupUiState,
): LocalDeepResearchSetupUiState {
  const model = localDeepResearchSetupResultModel(result);
  return {
    status: model.statusTone === "error" ? "error" : "success",
    action: "status",
    message: model.statusLabel,
    result,
    diagnostics: model.diagnostics,
    progress: current.action === "status" ? current.progress : undefined,
  };
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
  useEffect(() => {
    if (localDeepResearchSetup.result?.localRuntimeInventory) {
      localRuntimeInventorySettingsRefreshKeyRef.current = undefined;
    }
    const decision = localDeepResearchRuntimeInventorySettingsRefreshDecision({
      panel,
      workspacePath,
      setupStatus: localDeepResearchSetup.status,
      hasRuntimeInventory: Boolean(localDeepResearchSetup.result?.localRuntimeInventory),
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
    localDeepResearchSetup.result?.localRuntimeInventory,
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
