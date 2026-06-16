import type { IpcMain } from "electron";

import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type {
  CancelSubagentRunInput,
  CloseSubagentRunInput,
  DesktopEvent,
  ResolveSubagentApprovalInput,
  ResolveSubagentWaitBarrierInput,
  ResolveWorkflowApprovalInput,
  SubagentApprovalResolutionResult,
  SubagentRunSummary,
  SubagentWaitBarrierResolutionResult,
  WorkflowRunDetail,
} from "../../shared/types";
import {
  registerSubagentApprovalIpc,
  subagentApprovalIpcChannels,
} from "./registerSubagentIpc";
import {
  registerWorkflowApprovalIpc,
  workflowApprovalIpcChannels,
} from "./registerWorkflowIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const approvalDomainIpcChannels = [
  ...workflowApprovalIpcChannels,
  ...subagentApprovalIpcChannels,
] as const;

export interface ApprovalDomainHost<Store> {
  runtime: {
    resolveSubagentWaitBarrier(input: ResolveSubagentWaitBarrierInput): MaybePromise<SubagentWaitBarrierResolutionResult>;
    cancelSubagentRun(input: CancelSubagentRunInput): MaybePromise<SubagentRunSummary>;
    closeSubagentRun(input: CloseSubagentRunInput): MaybePromise<SubagentRunSummary>;
  };
  store: Store;
  workspacePath: string;
}

type SubagentParentMailboxEventUpdated = Extract<
  DesktopEvent,
  { type: "subagent-parent-mailbox-event-updated" }
>;

export interface RegisterApprovalDomainIpcDependencies<
  Store,
  Host extends ApprovalDomainHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowRun(runId: string): Host;
  requireProjectRuntimeHostForSubagentRun(runId: string): Host;
  requireProjectRuntimeHostForSubagentWaitBarrier(waitBarrierId: string): Host;
  getFeatureFlagSnapshot(store: Store): AmbientFeatureFlagSnapshot;
  resolveWorkflowApproval(store: Store, input: ResolveWorkflowApprovalInput): WorkflowRunDetail;
  emitWorkflowUpdated(workspacePath: string): void;
  resolveSubagentApprovalDecision(store: Store, input: ResolveSubagentApprovalInput): SubagentApprovalResolutionResult;
  emitProjectScopedEvent(host: Host, event: SubagentParentMailboxEventUpdated): void;
  emitProjectStateIfActive(host: Host): void;
}

export function registerApprovalDomainIpc<
  Store,
  Host extends ApprovalDomainHost<Store>,
>({
  emitProjectScopedEvent,
  emitProjectStateIfActive,
  emitWorkflowUpdated,
  getFeatureFlagSnapshot,
  handleIpc,
  requireProjectRuntimeHostForSubagentRun,
  requireProjectRuntimeHostForSubagentWaitBarrier,
  requireProjectRuntimeHostForWorkflowRun,
  resolveSubagentApprovalDecision,
  resolveWorkflowApproval,
}: RegisterApprovalDomainIpcDependencies<Store, Host>): void {
  registerWorkflowApprovalIpc({
    emitWorkflowUpdated,
    handleIpc,
    requireProjectRuntimeHostForWorkflowRun,
    resolveWorkflowApproval,
  });

  registerSubagentApprovalIpc({
    cancelSubagentRun: (host, input) => host.runtime.cancelSubagentRun(input),
    closeSubagentRun: (host, input) => host.runtime.closeSubagentRun(input),
    emitProjectStateUpdated: emitProjectStateIfActive,
    emitSubagentParentMailboxEventUpdated: (host, mailboxEvent) =>
      emitProjectScopedEvent(host, {
        type: "subagent-parent-mailbox-event-updated",
        mailboxEvent,
      }),
    getFeatureFlagSnapshot,
    handleIpc,
    requireProjectRuntimeHostForSubagentRun,
    requireProjectRuntimeHostForSubagentWaitBarrier,
    resolveSubagentApproval: resolveSubagentApprovalDecision,
    resolveSubagentWaitBarrier: (host, input) => host.runtime.resolveSubagentWaitBarrier(input),
  });
}
