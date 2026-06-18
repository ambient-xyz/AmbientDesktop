import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";

export function workflowRecordingLibraryFromDesktopState(
  state: Pick<DesktopState, "workflowRecordingLibrary"> | undefined,
): WorkflowRecordingLibraryEntry[] {
  return Array.isArray(state?.workflowRecordingLibrary) ? state.workflowRecordingLibrary : [];
}

export function workflowRecordingLibraryForDisplay({
  defaultLibrary,
  override,
}: {
  defaultLibrary: WorkflowRecordingLibraryEntry[];
  override: WorkflowRecordingLibraryEntry[] | undefined;
}): WorkflowRecordingLibraryEntry[] {
  return override ?? defaultLibrary;
}

export function selectedWorkflowRecordingForLibrary({
  library,
  selectedId,
}: {
  library: WorkflowRecordingLibraryEntry[];
  selectedId: string | undefined;
}): WorkflowRecordingLibraryEntry | undefined {
  if (!selectedId) return undefined;
  return library.find((entry) => entry.id === selectedId);
}

export function workflowRecordingSelectionIsMissing({
  selected,
  selectedId,
}: {
  selected: WorkflowRecordingLibraryEntry | undefined;
  selectedId: string | undefined;
}): boolean {
  return Boolean(selectedId && !selected);
}

export function useAppWorkflowRecordingLibraryControls({
  applyDesktopState,
  setError,
  state,
}: {
  applyDesktopState: (next: DesktopState) => void;
  setError: (message: string | undefined) => void;
  state: DesktopState | undefined;
}): {
  workflowLibraryIncludeArchived: boolean;
  setWorkflowLibraryIncludeArchived: Dispatch<SetStateAction<boolean>>;
  workflowRecordingLibrary: WorkflowRecordingLibraryEntry[];
  selectedWorkflowRecording: WorkflowRecordingLibraryEntry | undefined;
  selectedWorkflowRecordingId: string | undefined;
  setSelectedWorkflowRecordingId: Dispatch<SetStateAction<string | undefined>>;
  refreshWorkflowRecordingLibrary: (includeArchived?: boolean) => Promise<void>;
  refreshWorkflowRecordingLibraryOverride: (includeArchived?: boolean) => Promise<void>;
} {
  const [selectedWorkflowRecordingId, setSelectedWorkflowRecordingId] = useState<string | undefined>();
  const [workflowLibraryIncludeArchived, setWorkflowLibraryIncludeArchived] = useState(false);
  const [workflowRecordingLibraryOverride, setWorkflowRecordingLibraryOverride] = useState<WorkflowRecordingLibraryEntry[] | undefined>();
  const defaultWorkflowRecordingLibrary = useMemo(
    () => workflowRecordingLibraryFromDesktopState(state),
    [state?.workflowRecordingLibrary],
  );
  const workflowRecordingLibrary = useMemo(
    () =>
      workflowRecordingLibraryForDisplay({
        defaultLibrary: defaultWorkflowRecordingLibrary,
        override: workflowRecordingLibraryOverride,
      }),
    [defaultWorkflowRecordingLibrary, workflowRecordingLibraryOverride],
  );
  const selectedWorkflowRecording = useMemo(
    () => selectedWorkflowRecordingForLibrary({ library: workflowRecordingLibrary, selectedId: selectedWorkflowRecordingId }),
    [selectedWorkflowRecordingId, workflowRecordingLibrary],
  );

  async function refreshWorkflowRecordingLibraryOverride(includeArchived = workflowLibraryIncludeArchived) {
    if (!includeArchived) {
      setWorkflowRecordingLibraryOverride(undefined);
      return;
    }
    try {
      const entries = await window.ambientDesktop.searchWorkflowRecordings({
        includeArchived: true,
        includeDisabled: true,
        limit: 100,
      });
      setWorkflowRecordingLibraryOverride(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshWorkflowRecordingLibrary(includeArchived = workflowLibraryIncludeArchived) {
    try {
      setError(undefined);
      const next = await window.ambientDesktop.bootstrap();
      applyDesktopState(next);
      if (includeArchived) await refreshWorkflowRecordingLibraryOverride(true);
      else setWorkflowRecordingLibraryOverride(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    if (!workflowLibraryIncludeArchived) {
      setWorkflowRecordingLibraryOverride(undefined);
      return;
    }
    void refreshWorkflowRecordingLibraryOverride(true);
  }, [workflowLibraryIncludeArchived, state?.workspace.path, state?.workflowRecordingLibrary]);

  useEffect(() => {
    if (workflowRecordingSelectionIsMissing({ selected: selectedWorkflowRecording, selectedId: selectedWorkflowRecordingId })) {
      setSelectedWorkflowRecordingId(undefined);
    }
  }, [selectedWorkflowRecording, selectedWorkflowRecordingId]);

  return {
    workflowLibraryIncludeArchived,
    setWorkflowLibraryIncludeArchived,
    workflowRecordingLibrary,
    selectedWorkflowRecording,
    selectedWorkflowRecordingId,
    setSelectedWorkflowRecordingId,
    refreshWorkflowRecordingLibrary,
    refreshWorkflowRecordingLibraryOverride,
  };
}
