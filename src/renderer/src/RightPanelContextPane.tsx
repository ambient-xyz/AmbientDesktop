import { useState } from "react";
import type {
  MiniCpmVisionDiagnosticItem,
  WorkspaceContextReference,
} from "../../shared/types";
import { ContextPanel } from "./RightPanelDetailPanels";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

type PickWorkspaceContext = (input: {
  kind: WorkspaceContextReference["kind"];
  allowExternal: boolean;
}) => Promise<WorkspaceContextReference[]>;

export async function pickRightPanelWorkspaceContext({
  kind,
  allowExternal,
  pickWorkspaceContext,
  onAddContext,
  onContextError,
  onBusyChange,
  onErrorChange,
}: {
  kind: WorkspaceContextReference["kind"];
  allowExternal: boolean;
  pickWorkspaceContext: PickWorkspaceContext;
  onAddContext: (items: WorkspaceContextReference[]) => void;
  onContextError: (message: string | undefined) => void;
  onBusyChange: (kind: WorkspaceContextReference["kind"] | undefined) => void;
  onErrorChange: (message: string | undefined) => void;
}) {
  onErrorChange(undefined);
  onContextError(undefined);
  onBusyChange(kind);
  try {
    const selected = await pickWorkspaceContext({
      kind,
      allowExternal,
    });
    onAddContext(selected);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onErrorChange(message);
    onContextError(message);
  } finally {
    onBusyChange(undefined);
  }
}

export function RightPanelContextPane({
  attachments,
  allowExternal,
  visualAnalysisBusy,
  visualAnalysisStatus,
  visualAnalysisDiagnostics,
  onAddContext,
  onRemoveContext,
  onClearContext,
  onContextError,
  onAnalyzeVisual,
}: {
  attachments: WorkspaceContextReference[];
  allowExternal: boolean;
  visualAnalysisBusy?: string;
  visualAnalysisStatus?: ApiKeyStatus;
  visualAnalysisDiagnostics?: MiniCpmVisionDiagnosticItem[];
  onAddContext: (items: WorkspaceContextReference[]) => void;
  onRemoveContext: (item: WorkspaceContextReference) => void;
  onClearContext: () => void;
  onContextError: (message: string | undefined) => void;
  onAnalyzeVisual: (item: WorkspaceContextReference) => void;
}) {
  const [contextBusy, setContextBusy] = useState<WorkspaceContextReference["kind"] | undefined>();
  const [contextPanelError, setContextPanelError] = useState<string | undefined>();

  async function pickContext(kind: WorkspaceContextReference["kind"]) {
    await pickRightPanelWorkspaceContext({
      kind,
      allowExternal,
      pickWorkspaceContext: window.ambientDesktop.pickWorkspaceContext,
      onAddContext,
      onContextError,
      onBusyChange: setContextBusy,
      onErrorChange: setContextPanelError,
    });
  }

  return (
    <ContextPanel
      attachments={attachments}
      busy={contextBusy}
      error={contextPanelError}
      visualAnalysisBusy={visualAnalysisBusy}
      visualAnalysisStatus={visualAnalysisStatus}
      visualAnalysisDiagnostics={visualAnalysisDiagnostics}
      onPick={(kind) => void pickContext(kind)}
      onRemove={onRemoveContext}
      onClear={onClearContext}
      onAnalyzeVisual={(item) => onAnalyzeVisual(item)}
    />
  );
}
