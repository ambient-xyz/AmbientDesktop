import { useState } from "react";

import type { DiagnosticExportResult } from "../../shared/types";
import { diagnosticExportStatusMessage, diagnosticImportStatusMessage } from "./diagnosticExportUiModel";
import {
  decodeDiagnosticExportHistoryStorage,
  DIAGNOSTIC_EXPORT_HISTORY_STORAGE_KEY,
  diagnosticExportHistoryEntryId,
  diagnosticExportHistoryModel,
  encodeDiagnosticExportHistoryStorage,
  recordDiagnosticExportHistory,
  selectedDiagnosticExportFromHistory,
  type DiagnosticExportHistoryStorageState,
} from "./diagnosticExportHistoryUiModel";
import { formatPanelFileSize } from "./RightPanelFilePreview";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";
import { localRuntimeEvidenceInspectorModel } from "./localRuntimeEvidenceUiModel";
import { subagentReplayEvidenceInspectorModel } from "./subagentReplayEvidenceUiModel";

type UseRightPanelDiagnosticsControllerInput = {
  onExportDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
  onImportDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
};

function readInitialDiagnosticExportHistory(): DiagnosticExportHistoryStorageState {
  try {
    return decodeDiagnosticExportHistoryStorage(window.localStorage.getItem(DIAGNOSTIC_EXPORT_HISTORY_STORAGE_KEY));
  } catch {
    return { history: [] };
  }
}

function persistDiagnosticExportHistory(history: DiagnosticExportResult[], selectedId: string | undefined): void {
  try {
    if (history.length === 0) {
      window.localStorage.removeItem(DIAGNOSTIC_EXPORT_HISTORY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      DIAGNOSTIC_EXPORT_HISTORY_STORAGE_KEY,
      encodeDiagnosticExportHistoryStorage({ history, selectedId }),
    );
  } catch {
    // localStorage is best-effort; in-memory diagnostics remain available for this session.
  }
}

export function useRightPanelDiagnosticsController({
  onExportDiagnostics,
  onImportDiagnostics,
}: UseRightPanelDiagnosticsControllerInput) {
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState<ApiKeyStatus | undefined>();
  const [diagnosticExportHistoryState, setDiagnosticExportHistoryState] =
    useState<DiagnosticExportHistoryStorageState>(readInitialDiagnosticExportHistory);

  const diagnosticExportHistory = diagnosticExportHistoryModel(
    diagnosticExportHistoryState.history,
    diagnosticExportHistoryState.selectedId,
  );
  const selectedDiagnosticExport = selectedDiagnosticExportFromHistory(
    diagnosticExportHistoryState.history,
    diagnosticExportHistoryState.selectedId,
  );
  const subagentReplayEvidence = subagentReplayEvidenceInspectorModel(
    selectedDiagnosticExport?.subagents?.replayEvidence,
    selectedDiagnosticExport?.summary?.subagents.replayEvidence,
  );
  const subagentReplayEvidenceValue = subagentReplayEvidence?.statusLabel ?? "Export diagnostics";
  const localRuntimeEvidence = localRuntimeEvidenceInspectorModel(
    selectedDiagnosticExport?.localRuntimes?.evidence,
    selectedDiagnosticExport?.summary?.localRuntimes,
  );
  const localRuntimeEvidenceValue = localRuntimeEvidence?.statusLabel ?? "Export diagnostics";

  function rememberDiagnosticExportResult(result: DiagnosticExportResult) {
    const nextHistory = recordDiagnosticExportHistory(diagnosticExportHistoryState.history, result);
    const selectedId = diagnosticExportHistoryEntryId(result);
    setDiagnosticExportHistoryState({ history: nextHistory, selectedId });
    persistDiagnosticExportHistory(nextHistory, selectedId);
  }

  function selectDiagnosticExportHistoryEntry(id: string) {
    setDiagnosticExportHistoryState((current) => {
      persistDiagnosticExportHistory(current.history, id);
      return { ...current, selectedId: id };
    });
  }

  async function exportDiagnostics() {
    setDiagnosticBusy(true);
    setDiagnosticStatus(undefined);
    try {
      const result = await onExportDiagnostics();
      if (!result) {
        setDiagnosticStatus({ kind: "info", message: "Export canceled." });
        return;
      }
      rememberDiagnosticExportResult(result);
      setDiagnosticStatus({ kind: "success", message: diagnosticExportStatusMessage(result, formatPanelFileSize) });
    } catch (error) {
      setDiagnosticStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setDiagnosticBusy(false);
    }
  }

  async function importDiagnostics() {
    setDiagnosticBusy(true);
    setDiagnosticStatus(undefined);
    try {
      const result = await onImportDiagnostics();
      if (!result) {
        setDiagnosticStatus({ kind: "info", message: "Import canceled." });
        return;
      }
      rememberDiagnosticExportResult(result);
      setDiagnosticStatus({ kind: "success", message: diagnosticImportStatusMessage(result, formatPanelFileSize) });
    } catch (error) {
      setDiagnosticStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setDiagnosticBusy(false);
    }
  }

  return {
    diagnosticBusy,
    diagnosticStatus,
    diagnosticExportHistory,
    selectDiagnosticExportHistoryEntry,
    subagentReplayEvidence,
    subagentReplayEvidenceValue,
    localRuntimeEvidence,
    localRuntimeEvidenceValue,
    exportDiagnostics,
    importDiagnostics,
  };
}

export type RightPanelDiagnosticsController = ReturnType<typeof useRightPanelDiagnosticsController>;
