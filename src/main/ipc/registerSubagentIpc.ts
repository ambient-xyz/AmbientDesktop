import type { IpcMain } from "electron";
import { z } from "zod";
import { isAmbientSubagentsEnabled, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type {
  CancelSubagentRunInput,
  CloseSubagentRunInput,
  ResolveSubagentApprovalInput,
  ResolveSubagentWaitBarrierInput,
  SubagentApprovalResolutionResult,
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierResolutionResult,
} from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const subagentApprovalIpcChannels = [
  "subagents:resolve-approval",
  "subagents:resolve-wait-barrier",
  "subagents:cancel-run",
  "subagents:close-run",
] as const;

export interface SubagentApprovalHost<Store> {
  store: Store;
  workspacePath: string;
}

export interface RegisterSubagentApprovalIpcDependencies<
  Store,
  Host extends SubagentApprovalHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForSubagentRun(runId: string): Host;
  requireProjectRuntimeHostForSubagentWaitBarrier(waitBarrierId: string): Host;
  getFeatureFlagSnapshot(store: Store): AmbientFeatureFlagSnapshot;
  resolveSubagentApproval(store: Store, input: ResolveSubagentApprovalInput): SubagentApprovalResolutionResult;
  resolveSubagentWaitBarrier(host: Host, input: ResolveSubagentWaitBarrierInput): Promise<SubagentWaitBarrierResolutionResult> | SubagentWaitBarrierResolutionResult;
  cancelSubagentRun(host: Host, input: CancelSubagentRunInput): Promise<SubagentRunSummary> | SubagentRunSummary;
  closeSubagentRun(host: Host, input: CloseSubagentRunInput): Promise<SubagentRunSummary> | SubagentRunSummary;
  emitSubagentParentMailboxEventUpdated(host: Host, event: SubagentParentMailboxEventSummary): void;
  emitProjectStateUpdated(host: Host): void;
}

const resolveSubagentApprovalSchema = z.object({
  childRunId: z.string().trim().min(1),
  approvalId: z.string().trim().min(1),
  decision: z.enum(["approved", "denied"]),
  requestedScope: z.string().trim().min(1).optional(),
  userDecision: z.string().trim().min(1).max(2000).optional(),
  approvalRequestParentMailboxEventId: z.string().trim().min(1).optional(),
  approvalRequestChildMailboxEventId: z.string().trim().min(1).optional(),
}).strict();

const subagentRunControlSchema = z.object({
  childRunId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(2000).optional(),
}).strict();

const resolveSubagentWaitBarrierSchema = z.object({
  waitBarrierId: z.string().trim().min(1),
  decision: z.enum(["continue_with_partial", "fail_parent", "retry_child", "detach_child", "cancel_parent"]),
  userDecision: z.string().trim().min(1).max(2000).optional(),
  partialSummary: z.string().trim().min(1).max(4000).optional(),
  idempotencyKey: z.string().trim().min(1).max(500).optional(),
}).strict();

export function registerSubagentApprovalIpc<
  Store,
  Host extends SubagentApprovalHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForSubagentRun,
  requireProjectRuntimeHostForSubagentWaitBarrier,
  getFeatureFlagSnapshot,
  resolveSubagentApproval,
  resolveSubagentWaitBarrier,
  cancelSubagentRun,
  closeSubagentRun,
  emitSubagentParentMailboxEventUpdated,
  emitProjectStateUpdated,
}: RegisterSubagentApprovalIpcDependencies<Store, Host>): void {
  handleIpc("subagents:resolve-approval", (_event, raw: ResolveSubagentApprovalInput) => {
    const input = resolveSubagentApprovalSchema.parse(raw);
    const host = requireProjectRuntimeHostForSubagentRun(input.childRunId);
    if (!isAmbientSubagentsEnabled(getFeatureFlagSnapshot(host.store))) {
      throw new Error("Sub-agent approvals are disabled because ambient.subagents is off.");
    }
    const result = resolveSubagentApproval(host.store, input);
    if (result.approvalRequestParentMailboxEvent) {
      emitSubagentParentMailboxEventUpdated(host, result.approvalRequestParentMailboxEvent);
    }
    if (result.approvalForwardedParentMailboxEvent) {
      emitSubagentParentMailboxEventUpdated(host, result.approvalForwardedParentMailboxEvent);
    }
    emitProjectStateUpdated(host);
    return result;
  });

  handleIpc("subagents:resolve-wait-barrier", async (_event, raw: ResolveSubagentWaitBarrierInput) => {
    const input = resolveSubagentWaitBarrierSchema.parse(raw);
    const host = requireProjectRuntimeHostForSubagentWaitBarrier(input.waitBarrierId);
    if (!isAmbientSubagentsEnabled(getFeatureFlagSnapshot(host.store))) {
      throw new Error("Sub-agent wait-barrier controls are disabled because ambient.subagents is off.");
    }
    const result = await resolveSubagentWaitBarrier(host, input);
    emitProjectStateUpdated(host);
    return result;
  });

  handleIpc("subagents:cancel-run", async (_event, raw: CancelSubagentRunInput) => {
    const input = subagentRunControlSchema.parse(raw);
    const host = requireProjectRuntimeHostForSubagentRun(input.childRunId);
    if (!isAmbientSubagentsEnabled(getFeatureFlagSnapshot(host.store))) {
      throw new Error("Sub-agent child controls are disabled because ambient.subagents is off.");
    }
    const run = await cancelSubagentRun(host, input);
    emitProjectStateUpdated(host);
    return run;
  });

  handleIpc("subagents:close-run", async (_event, raw: CloseSubagentRunInput) => {
    const input = subagentRunControlSchema.parse(raw);
    const host = requireProjectRuntimeHostForSubagentRun(input.childRunId);
    if (!isAmbientSubagentsEnabled(getFeatureFlagSnapshot(host.store))) {
      throw new Error("Sub-agent child controls are disabled because ambient.subagents is off.");
    }
    const run = await closeSubagentRun(host, input);
    emitProjectStateUpdated(host);
    return run;
  });
}
