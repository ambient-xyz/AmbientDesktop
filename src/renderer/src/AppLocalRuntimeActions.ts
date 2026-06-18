import type { Dispatch, SetStateAction } from "react";

import type { LocalDeepResearchRunHistoryResult, MiniCpmVisionSetupAction, MiniCpmVisionSetupInput, MiniCpmVisionSetupResult } from "../../shared/localRuntimeTypes";
import { miniCpmVisionDiagnosticsForFailure } from "../../shared/miniCpmVisionDiagnostics";
import type {
  LocalDeepResearchRunHistoryUiState,
  LocalDeepResearchSetupUiState,
  MiniCpmVisionSetupUiState,
} from "./RightPanel";
import {
  type LocalDeepResearchSetupAction,
  type LocalDeepResearchSetupResult,
  localDeepResearchSetupResultModel,
} from "./localDeepResearchUiModel";
import { miniCpmVisionSetupResultModel } from "./miniCpmVisionUiModel";

export function miniCpmVisionSetupRunningMessage(action: MiniCpmVisionSetupAction): string {
  return action === "install"
    ? "Installing MiniCPM-V..."
    : action === "repair"
      ? "Repairing MiniCPM-V..."
      : action === "stop"
        ? "Stopping MiniCPM-V runtime..."
      : action === "uninstall"
        ? "Cleaning up MiniCPM-V..."
        : "Validating MiniCPM-V...";
}

export function miniCpmVisionSetupInputForSettings({
  action,
  endpointUrl,
  runtimePath,
}: {
  action: MiniCpmVisionSetupAction;
  endpointUrl: string;
  runtimePath: string;
}): MiniCpmVisionSetupInput {
  const trimmedEndpointUrl = endpointUrl.trim();
  const runtimeBinaryPath = trimmedEndpointUrl ? "" : runtimePath.trim();
  return {
    provider: "minicpm-v",
    action,
    installRuntime: action !== "validate" && action !== "stop" && !trimmedEndpointUrl && !runtimeBinaryPath,
    ...(trimmedEndpointUrl ? { endpointUrl: trimmedEndpointUrl } : {}),
    ...(runtimeBinaryPath ? { runtimeBinaryPath } : {}),
  };
}

export function localDeepResearchSetupRunningMessage(action: LocalDeepResearchSetupAction): string {
  return action === "install"
    ? "Installing Local Deep Research..."
    : action === "repair"
      ? "Repairing Local Deep Research..."
      : action === "validate"
        ? "Validating Local Deep Research..."
        : action === "smoke"
          ? "Running Local Deep Research smoke..."
          : "Checking Local Deep Research...";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAppLocalRuntimeActions({
  localDeepResearchQ8Override,
  miniCpmVisionEndpointUrl,
  miniCpmVisionRuntimePath,
  setLocalDeepResearchFollowupOpen,
  setLocalDeepResearchRunHistory,
  setLocalDeepResearchSetup,
  setMiniCpmVisionSetup,
}: {
  localDeepResearchQ8Override: boolean;
  miniCpmVisionEndpointUrl: string;
  miniCpmVisionRuntimePath: string;
  setLocalDeepResearchFollowupOpen: Dispatch<SetStateAction<boolean>>;
  setLocalDeepResearchRunHistory: Dispatch<SetStateAction<LocalDeepResearchRunHistoryUiState>>;
  setLocalDeepResearchSetup: Dispatch<SetStateAction<LocalDeepResearchSetupUiState>>;
  setMiniCpmVisionSetup: Dispatch<SetStateAction<MiniCpmVisionSetupUiState>>;
}) {
  async function setupMiniCpmVisionProviderFromSettings(action: MiniCpmVisionSetupAction): Promise<MiniCpmVisionSetupResult | undefined> {
    setMiniCpmVisionSetup({
      status: "running",
      action,
      message: miniCpmVisionSetupRunningMessage(action),
    });
    try {
      const result = await window.ambientDesktop.setupMiniCpmVisionProvider(
        miniCpmVisionSetupInputForSettings({
          action,
          endpointUrl: miniCpmVisionEndpointUrl,
          runtimePath: miniCpmVisionRuntimePath,
        }),
      );
      const model = miniCpmVisionSetupResultModel(result);
      setMiniCpmVisionSetup({
        status: model.statusTone === "error" ? "error" : "success",
        action,
        message: model.statusLabel,
        result,
        diagnostics: model.diagnostics,
      });
      return result;
    } catch (err) {
      const message = errorMessage(err);
      const diagnostics = miniCpmVisionDiagnosticsForFailure({
        setupStatus: "failed",
        validationStatus: "failed",
        error: message,
      });
      setMiniCpmVisionSetup({ status: "error", action, message, diagnostics });
      return undefined;
    }
  }

  async function setupLocalDeepResearchFromSettings(action: LocalDeepResearchSetupAction): Promise<LocalDeepResearchSetupResult | undefined> {
    setLocalDeepResearchSetup({
      status: "running",
      action,
      message: localDeepResearchSetupRunningMessage(action),
    });
    try {
      const result = await window.ambientDesktop.setupLocalDeepResearch({
        action,
        q8Override: localDeepResearchQ8Override,
      });
      const model = localDeepResearchSetupResultModel(result);
      setLocalDeepResearchSetup((current) => ({
        status: model.statusTone === "error" ? "error" : "success",
        action,
        message: model.statusLabel,
        result,
        diagnostics: model.diagnostics,
        progress: current.action === action ? current.progress : undefined,
      }));
      return result;
    } catch (err) {
      const message = errorMessage(err);
      setLocalDeepResearchSetup((current) => ({
        status: "error",
        action,
        message,
        diagnostics: [{
          code: "setup-ipc-failed",
          severity: "error",
          title: "Local Deep Research setup failed",
          detail: message,
          nextAction: "Retry setup after checking the active workspace and managed install state.",
        }],
        progress: current.action === action ? current.progress : undefined,
      }));
      return undefined;
    }
  }

  async function openLocalDeepResearchFollowupIfSetupNeeded(): Promise<void> {
    const result = await setupLocalDeepResearchFromSettings("status");
    if (!result || result.setupStatus !== "ready") setLocalDeepResearchFollowupOpen(true);
  }

  async function loadLocalDeepResearchRunHistory(): Promise<LocalDeepResearchRunHistoryResult | undefined> {
    setLocalDeepResearchRunHistory({ status: "loading", message: "Loading Local Deep Research runs..." });
    try {
      const result = await window.ambientDesktop.listLocalDeepResearchRuns({ limit: 8 });
      setLocalDeepResearchRunHistory({
        status: "success",
        message: result.entries.length
          ? `${result.entries.length} Local Deep Research run${result.entries.length === 1 ? "" : "s"} found`
          : "No Local Deep Research runs yet",
        result,
      });
      return result;
    } catch (err) {
      const message = errorMessage(err);
      setLocalDeepResearchRunHistory({ status: "error", message });
      return undefined;
    }
  }

  return {
    loadLocalDeepResearchRunHistory,
    openLocalDeepResearchFollowupIfSetupNeeded,
    setupLocalDeepResearchFromSettings,
    setupMiniCpmVisionProviderFromSettings,
  };
}
