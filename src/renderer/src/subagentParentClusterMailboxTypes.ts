import type { SubagentWaitBarrierDecision } from "../../shared/subagentTypes";
import type { SubagentParentClusterTone } from "./subagentParentClusterWorkflowTaskUiModel";

export interface SubagentParentClusterLifecycleEffectModel {
  key: string;
  label: string;
  detail: string;
  statusTone: SubagentParentClusterTone;
}

export interface SubagentParentClusterChildBlockerDraft {
  kind: "approval" | "attention" | "wait_barrier";
  label: string;
  detail: string;
  statusTone: SubagentParentClusterTone;
}

export interface SubagentParentClusterMailboxActivityModel {
  id: string;
  label: string;
  sourceLabel?: string;
  statusTone: SubagentParentClusterTone;
  summary: string;
  detail?: string;
  effectRows?: SubagentParentClusterLifecycleEffectModel[];
  actionLabels?: string[];
  actions?: SubagentParentClusterMailboxActionModel[];
  approvalActions?: SubagentParentClusterApprovalActionModel[];
  updatedAt: string;
}

export interface SubagentParentClusterMailboxActionModel {
  label: string;
  title: string;
  waitBarrierId: string;
  decision: SubagentWaitBarrierDecision;
  requiresUserDecision: boolean;
  requiresPartialSummary: boolean;
  childRunIds?: string[];
  sourceLabel?: string;
}

export interface SubagentParentClusterApprovalActionModel {
  label: string;
  title: string;
  decision: "approved" | "denied";
  childRunId: string;
  childThreadId?: string;
  approvalId: string;
  approvalRequestParentMailboxEventId: string;
  requestedScope?: string;
  effectiveScope?: string;
  prompt?: string;
  toolLabel?: string;
  sourceLabel?: string;
}
