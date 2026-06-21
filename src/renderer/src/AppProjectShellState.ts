import { useState } from "react";

import type { RefineProjectBoardSynthesisInput } from "../../shared/projectBoardTypes";
import type {
  PlannerRevisionDialogState,
  ProjectActionDialogState,
  ProjectBoardResetDialogState,
  ProjectContextMenuState,
  ThreadActionDialogState,
  ThreadContextMenuState,
} from "./AppActionDialogs";
import type { ProjectPopover } from "./AppSidebar";

export function useAppProjectShellState() {
  const [projectPopover, setProjectPopover] = useState<ProjectPopover | undefined>();
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | undefined>();
  const [projectActionDialog, setProjectActionDialog] = useState<ProjectActionDialogState | undefined>();
  const [projectBoardResetDialog, setProjectBoardResetDialog] = useState<ProjectBoardResetDialogState | undefined>();
  const [plannerRevisionDialog, setPlannerRevisionDialog] = useState<PlannerRevisionDialogState | undefined>();
  const [projectBoardBusyProjectIds, setProjectBoardBusyProjectIds] = useState<Set<string>>(() => new Set());
  const [projectBoardSourceBusy, setProjectBoardSourceBusy] = useState(false);
  const [projectBoardSourceImpactBusy, setProjectBoardSourceImpactBusy] = useState(false);
  const [projectBoardKickoffDefaultsBusy, setProjectBoardKickoffDefaultsBusy] = useState(false);
  const [projectBoardRefineBusy, setProjectBoardRefineBusy] = useState(false);
  const [projectBoardRefineMode, setProjectBoardRefineMode] =
    useState<RefineProjectBoardSynthesisInput["mode"]>();
  const [projectBoardProposalAnswerBusy, setProjectBoardProposalAnswerBusy] = useState<string | undefined>();
  const [projectBoardProposalCardReviewBusy, setProjectBoardProposalCardReviewBusy] =
    useState<string | undefined>();
  const [projectBoardProposalApplyBusy, setProjectBoardProposalApplyBusy] = useState(false);
  const [projectBoardFinalizeBusy, setProjectBoardFinalizeBusy] = useState(false);
  const [projectBoardSynthesisRetryBusy, setProjectBoardSynthesisRetryBusy] = useState(false);
  const [projectBoardSynthesisDeferBusy, setProjectBoardSynthesisDeferBusy] = useState(false);
  const [projectBoardSynthesisPauseBusy, setProjectBoardSynthesisPauseBusy] = useState(false);
  const [projectBoardRevisionBusy, setProjectBoardRevisionBusy] = useState(false);
  const [threadContextMenu, setThreadContextMenu] = useState<ThreadContextMenuState | undefined>();
  const [threadActionDialog, setThreadActionDialog] = useState<ThreadActionDialogState | undefined>();
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);

  return {
    projectPopover,
    setProjectPopover,
    projectContextMenu,
    setProjectContextMenu,
    projectActionDialog,
    setProjectActionDialog,
    projectBoardResetDialog,
    setProjectBoardResetDialog,
    plannerRevisionDialog,
    setPlannerRevisionDialog,
    projectBoardBusyProjectIds,
    setProjectBoardBusyProjectIds,
    projectBoardSourceBusy,
    setProjectBoardSourceBusy,
    projectBoardSourceImpactBusy,
    setProjectBoardSourceImpactBusy,
    projectBoardKickoffDefaultsBusy,
    setProjectBoardKickoffDefaultsBusy,
    projectBoardRefineBusy,
    setProjectBoardRefineBusy,
    projectBoardRefineMode,
    setProjectBoardRefineMode,
    projectBoardProposalAnswerBusy,
    setProjectBoardProposalAnswerBusy,
    projectBoardProposalCardReviewBusy,
    setProjectBoardProposalCardReviewBusy,
    projectBoardProposalApplyBusy,
    setProjectBoardProposalApplyBusy,
    projectBoardFinalizeBusy,
    setProjectBoardFinalizeBusy,
    projectBoardSynthesisRetryBusy,
    setProjectBoardSynthesisRetryBusy,
    projectBoardSynthesisDeferBusy,
    setProjectBoardSynthesisDeferBusy,
    projectBoardSynthesisPauseBusy,
    setProjectBoardSynthesisPauseBusy,
    projectBoardRevisionBusy,
    setProjectBoardRevisionBusy,
    threadContextMenu,
    setThreadContextMenu,
    threadActionDialog,
    setThreadActionDialog,
    projectsCollapsed,
    setProjectsCollapsed,
  };
}
