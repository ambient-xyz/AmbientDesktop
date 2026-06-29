import { useRef, useState } from "react";

import { resolveLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
import type { LocalDeepResearchRunBudget } from "../../shared/localRuntimeTypes";
import type {
  WorkflowCompileProgress,
  WorkflowDiscoveryProgress,
  WorkflowExplorationProgress,
} from "../../shared/workflowTypes";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import type { ApiKeyStatus } from "./RightPanel";
import type {
  SubagentApprovalDecisionDialogState,
  SubagentBarrierDecisionDialogState,
} from "./AppModalHost";
import type { GoalBudgetDialogState } from "./AppGoalControls";
import type { PendingSubmittedPrompt } from "./AppConversationDisplayModel";
import type { PendingWorkflowRecordingEditContext } from "./AppComposerSubmitActions";
import type { SymphonyWorkflowBuilderDraft } from "./symphonyWorkflowBuilderUiModel";

export function useAppWorkflowRuntimeState() {
  const [orchestrationRevision, setOrchestrationRevision] = useState(0);
  const [orchestrationAutoRevision, setOrchestrationAutoRevision] = useState(0);
  const [workflowRevision, setWorkflowRevision] = useState(0);
  const [workflowCompileProgress, setWorkflowCompileProgress] = useState<WorkflowCompileProgress[]>([]);
  const [workflowDiscoveryProgress, setWorkflowDiscoveryProgress] =
    useState<WorkflowDiscoveryProgress | undefined>();
  const [workflowExplorationProgressByThreadId, setWorkflowExplorationProgressByThreadId] =
    useState<Record<string, WorkflowExplorationProgress | undefined>>({});
  const [chatExportBusy, setChatExportBusy] = useState(false);
  const [chatExportStatus, setChatExportStatus] = useState<ApiKeyStatus | undefined>();
  const [contextRecoveryBusy, setContextRecoveryBusy] = useState(false);
  const [callableWorkflowTaskCancelBusy, setCallableWorkflowTaskCancelBusy] = useState<string | undefined>();
  const [callableWorkflowTaskPauseBusy, setCallableWorkflowTaskPauseBusy] = useState<string | undefined>();
  const [callableWorkflowTaskResumeBusy, setCallableWorkflowTaskResumeBusy] = useState<string | undefined>();
  const [subagentChildCancelBusy, setSubagentChildCancelBusy] = useState<string | undefined>();
  const [subagentChildCloseBusy, setSubagentChildCloseBusy] = useState<string | undefined>();
  const [subagentBarrierActionBusy, setSubagentBarrierActionBusy] = useState<string | undefined>();
  const [subagentBarrierDecisionDialog, setSubagentBarrierDecisionDialog] =
    useState<SubagentBarrierDecisionDialogState | undefined>();
  const [subagentApprovalActionBusy, setSubagentApprovalActionBusy] = useState<string | undefined>();
  const [subagentApprovalDecisionDialog, setSubagentApprovalDecisionDialog] =
    useState<SubagentApprovalDecisionDialogState | undefined>();
  const [contextAttachments, setContextAttachments] = useState<WorkspaceContextReference[]>([]);
  const [contextError, setContextError] = useState<string | undefined>();
  const [localDeepResearchModeArmed, setLocalDeepResearchModeArmedState] = useState(false);
  const [localDeepResearchBudgetOverride, setLocalDeepResearchBudgetOverride] =
    useState<Partial<Pick<LocalDeepResearchRunBudget, "effort" | "maxToolCalls" | "onExhausted">> | undefined>();
  const [symphonyBuilderDraft, setSymphonyBuilderDraft] = useState<SymphonyWorkflowBuilderDraft>({});
  const [symphonyBuilderActionBusy, setSymphonyBuilderActionBusy] =
    useState<"run-once" | "save-recipe" | undefined>();
  const [goalModeArmed, setGoalModeArmed] = useState(false);
  const [goalMenuOpen, setGoalMenuOpen] = useState(false);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalBudgetDialog, setGoalBudgetDialog] = useState<GoalBudgetDialogState | undefined>();
  const [goalCompletionCelebrationId, setGoalCompletionCelebrationId] = useState<string | undefined>();
  const latestDesktopStateRevisionRef = useRef<number | undefined>(undefined);
  const clearedGoalKeysRef = useRef(new Set<string>());
  const [promptHistoryCursor, setPromptHistoryCursor] = useState<number | undefined>();
  const [draftBeforePromptHistory, setDraftBeforePromptHistory] = useState("");
  const promptHistoryRef = useRef<string[]>([]);
  const localDeepResearchModeArmedRef = useRef(false);
  const localDeepResearchRunBudgetRef = useRef<LocalDeepResearchRunBudget>(
    resolveLocalDeepResearchRunBudget(undefined),
  );
  const localRuntimeInventorySettingsRefreshKeyRef = useRef<string | undefined>(undefined);
  const [pendingSubmittedPrompts, setPendingSubmittedPrompts] = useState<PendingSubmittedPrompt[]>([]);
  const [pendingProjectComposerDraft, setPendingProjectComposerDraft] =
    useState<{ value: string; nonce: number } | undefined>();
  const [pendingWorkflowRecordingEditContext, setPendingWorkflowRecordingEditContext] =
    useState<PendingWorkflowRecordingEditContext | undefined>();
  const goalCompletionCelebrationTimerRef = useRef<number | undefined>(undefined);

  return {
    orchestrationRevision,
    setOrchestrationRevision,
    orchestrationAutoRevision,
    setOrchestrationAutoRevision,
    workflowRevision,
    setWorkflowRevision,
    workflowCompileProgress,
    setWorkflowCompileProgress,
    workflowDiscoveryProgress,
    setWorkflowDiscoveryProgress,
    workflowExplorationProgressByThreadId,
    setWorkflowExplorationProgressByThreadId,
    chatExportBusy,
    setChatExportBusy,
    chatExportStatus,
    setChatExportStatus,
    contextRecoveryBusy,
    setContextRecoveryBusy,
    callableWorkflowTaskCancelBusy,
    setCallableWorkflowTaskCancelBusy,
    callableWorkflowTaskPauseBusy,
    setCallableWorkflowTaskPauseBusy,
    callableWorkflowTaskResumeBusy,
    setCallableWorkflowTaskResumeBusy,
    subagentChildCancelBusy,
    setSubagentChildCancelBusy,
    subagentChildCloseBusy,
    setSubagentChildCloseBusy,
    subagentBarrierActionBusy,
    setSubagentBarrierActionBusy,
    subagentBarrierDecisionDialog,
    setSubagentBarrierDecisionDialog,
    subagentApprovalActionBusy,
    setSubagentApprovalActionBusy,
    subagentApprovalDecisionDialog,
    setSubagentApprovalDecisionDialog,
    contextAttachments,
    setContextAttachments,
    contextError,
    setContextError,
    localDeepResearchModeArmed,
    setLocalDeepResearchModeArmedState,
    localDeepResearchBudgetOverride,
    setLocalDeepResearchBudgetOverride,
    symphonyBuilderDraft,
    setSymphonyBuilderDraft,
    symphonyBuilderActionBusy,
    setSymphonyBuilderActionBusy,
    goalModeArmed,
    setGoalModeArmed,
    goalMenuOpen,
    setGoalMenuOpen,
    goalBusy,
    setGoalBusy,
    goalBudgetDialog,
    setGoalBudgetDialog,
    goalCompletionCelebrationId,
    setGoalCompletionCelebrationId,
    latestDesktopStateRevisionRef,
    clearedGoalKeysRef,
    promptHistoryCursor,
    setPromptHistoryCursor,
    draftBeforePromptHistory,
    setDraftBeforePromptHistory,
    promptHistoryRef,
    localDeepResearchModeArmedRef,
    localDeepResearchRunBudgetRef,
    localRuntimeInventorySettingsRefreshKeyRef,
    pendingSubmittedPrompts,
    setPendingSubmittedPrompts,
    pendingProjectComposerDraft,
    setPendingProjectComposerDraft,
    pendingWorkflowRecordingEditContext,
    setPendingWorkflowRecordingEditContext,
    goalCompletionCelebrationTimerRef,
  };
}
