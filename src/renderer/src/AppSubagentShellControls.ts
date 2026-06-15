import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";

import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import type {
  DesktopState,
  ThreadSummary,
} from "../../shared/types";
import type {
  SubagentApprovalDecisionDialogState,
  SubagentBarrierDecisionDialogState,
} from "./AppModalHost";
import {
  subagentParentClusterModelsByMessageId,
  type SubagentParentClusterModel,
} from "./subagentParentClusterUiModel";
import {
  subagentThreadInspectorModel,
  type SubagentThreadInspectorModel,
} from "./subagentThreadInspectorUiModel";
import {
  symphonyWorkflowBuilderUiModel,
  type SymphonyWorkflowBuilderDraft,
  type SymphonyWorkflowBuilderUiModel,
} from "./symphonyWorkflowBuilderUiModel";

export function subagentUiEnabledForState(
  state: Pick<DesktopState, "featureFlagSnapshot"> | undefined,
): boolean {
  return state ? isAmbientSubagentsEnabled(state.featureFlagSnapshot) : false;
}

export function activeSubagentChildHiddenByFeatureFlag({
  activeThread,
  subagentUiEnabled,
}: {
  activeThread: Pick<ThreadSummary, "kind"> | undefined;
  subagentUiEnabled: boolean;
}): boolean {
  return Boolean(!subagentUiEnabled && activeThread?.kind === "subagent_child");
}

export function disabledSubagentShellCleanupState({
  subagentUiEnabled,
  symphonyBuilderOpen,
}: {
  subagentUiEnabled: boolean;
  symphonyBuilderOpen: boolean;
}): {
  clearSubagentDialogs: boolean;
  closeSymphonyBuilder: boolean;
} {
  return {
    clearSubagentDialogs: !subagentUiEnabled,
    closeSymphonyBuilder: !subagentUiEnabled && symphonyBuilderOpen,
  };
}

export function useAppSubagentShellControls({
  activeThread,
  setSubagentApprovalActionBusy,
  setSubagentApprovalDecisionDialog,
  setSubagentBarrierActionBusy,
  setSubagentBarrierDecisionDialog,
  setSubagentChildCancelBusy,
  setSubagentChildCloseBusy,
  setSymphonyBuilderDraft,
  state,
  symphonyBuilderDraft,
}: {
  activeThread: ThreadSummary | undefined;
  setSubagentApprovalActionBusy: Dispatch<SetStateAction<string | undefined>>;
  setSubagentApprovalDecisionDialog: Dispatch<SetStateAction<SubagentApprovalDecisionDialogState | undefined>>;
  setSubagentBarrierActionBusy: Dispatch<SetStateAction<string | undefined>>;
  setSubagentBarrierDecisionDialog: Dispatch<SetStateAction<SubagentBarrierDecisionDialogState | undefined>>;
  setSubagentChildCancelBusy: Dispatch<SetStateAction<string | undefined>>;
  setSubagentChildCloseBusy: Dispatch<SetStateAction<string | undefined>>;
  setSymphonyBuilderDraft: Dispatch<SetStateAction<SymphonyWorkflowBuilderDraft>>;
  state: DesktopState | undefined;
  symphonyBuilderDraft: SymphonyWorkflowBuilderDraft;
}): {
  activeSubagentChildHiddenByFeatureFlag: boolean;
  activeSubagentInspector: SubagentThreadInspectorModel | undefined;
  subagentParentClustersByMessageId: Map<string, SubagentParentClusterModel>;
  subagentUiEnabled: boolean;
  symphonyBuilderModel: SymphonyWorkflowBuilderUiModel | undefined;
} {
  const subagentUiEnabled = subagentUiEnabledForState(state);
  const activeSubagentChildHidden = activeSubagentChildHiddenByFeatureFlag({
    activeThread,
    subagentUiEnabled,
  });
  const symphonyBuilderModel = useMemo(
    () =>
      state
        ? symphonyWorkflowBuilderUiModel({
            featureFlagSnapshot: state.featureFlagSnapshot,
            draft: symphonyBuilderDraft,
          })
        : undefined,
    [state?.featureFlagSnapshot, symphonyBuilderDraft],
  );
  const activeSubagentInspector = useMemo(
    () =>
      subagentUiEnabled
        ? subagentThreadInspectorModel(
            activeThread,
            state?.subagentRuns ?? [],
            state?.subagentRunEvents ?? [],
            state?.subagentToolScopeSnapshots ?? [],
            state?.subagentWaitBarriers ?? [],
            state?.subagentRepairDiagnostics,
            state?.threads ?? [],
          )
        : undefined,
    [activeThread, state?.subagentRepairDiagnostics, state?.subagentRunEvents, state?.subagentRuns, state?.subagentToolScopeSnapshots, state?.subagentWaitBarriers, state?.threads, subagentUiEnabled],
  );
  const subagentParentClustersByMessageId = useMemo(
    () => (
      subagentUiEnabled
        ? subagentParentClusterModelsByMessageId(
            state?.subagentRuns ?? [],
            state?.threads ?? [],
            state?.subagentWaitBarriers ?? [],
            state?.subagentParentMailboxEvents ?? [],
            state?.callableWorkflowTasks ?? [],
          )
        : new Map<string, SubagentParentClusterModel>()
    ),
    [state?.callableWorkflowTasks, state?.subagentParentMailboxEvents, state?.subagentRuns, state?.subagentWaitBarriers, state?.threads, subagentUiEnabled],
  );

  useEffect(() => {
    const cleanup = disabledSubagentShellCleanupState({
      subagentUiEnabled,
      symphonyBuilderOpen: Boolean(symphonyBuilderDraft.open),
    });
    if (!cleanup.clearSubagentDialogs) return;
    if (cleanup.closeSymphonyBuilder) {
      setSymphonyBuilderDraft((current) => current.open ? { ...current, open: false } : current);
    }
    setSubagentBarrierDecisionDialog(undefined);
    setSubagentApprovalDecisionDialog(undefined);
    setSubagentBarrierActionBusy(undefined);
    setSubagentApprovalActionBusy(undefined);
    setSubagentChildCancelBusy(undefined);
    setSubagentChildCloseBusy(undefined);
  }, [
    setSubagentApprovalActionBusy,
    setSubagentApprovalDecisionDialog,
    setSubagentBarrierActionBusy,
    setSubagentBarrierDecisionDialog,
    setSubagentChildCancelBusy,
    setSubagentChildCloseBusy,
    setSymphonyBuilderDraft,
    subagentUiEnabled,
    symphonyBuilderDraft.open,
  ]);

  return {
    activeSubagentChildHiddenByFeatureFlag: activeSubagentChildHidden,
    activeSubagentInspector,
    subagentParentClustersByMessageId,
    subagentUiEnabled,
    symphonyBuilderModel,
  };
}
