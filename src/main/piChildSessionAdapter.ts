import type {
  SubagentDependencyMode,
  SubagentForkMode,
  SubagentPromptMode,
  SubagentRuntimeEventInput,
} from "../shared/subagentProtocol";
import type { SubagentCapacityLocalMemorySnapshot } from "../shared/subagentCapacity";
import type { SubagentRoleProfile } from "../shared/subagentRoles";
import type { resolveSubagentToolScope } from "../shared/subagentToolScope";
import type { SubagentApprovalDecision, SubagentApprovalRequestInput, SubagentApprovalScope } from "./subagents/subagentApprovalBridge";
import type { SubagentSupervisorRequestInput } from "./subagents/subagentSupervisorRequest";
import type { SubagentTurnBudgetPolicy } from "../shared/subagentTurnBudget";
import type {
  SubagentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../shared/types";

export const PI_CHILD_SESSION_ADAPTER_SCHEMA_VERSION = "ambient-pi-child-session-adapter-v1" as const;

export type SubagentRuntimeEventEmitter = (event: SubagentRuntimeEventInput) => SubagentRunEventSummary;

export interface SubagentChildWorktreePrepareInput {
  parentThread: ThreadSummary;
  run: SubagentRunSummary;
  role: SubagentRoleProfile;
  task: string;
  idempotencyKey: string;
}

export interface SubagentChildRuntimeStartInput {
  parentThread: ThreadSummary;
  run: SubagentRunSummary;
  task: string;
  role: SubagentRoleProfile;
  dependencyMode: SubagentDependencyMode;
  forkMode: SubagentForkMode;
  promptMode: SubagentPromptMode;
  toolScope: ReturnType<typeof resolveSubagentToolScope>;
  toolScopeSnapshot: SubagentToolScopeSnapshotSummary;
  turnBudgetPolicy: SubagentTurnBudgetPolicy;
  childWorktree?: ThreadWorktreeSummary;
  idempotencyKey: string;
  emitEvent: SubagentRuntimeEventEmitter;
}

export interface SubagentChildRuntimeLaunchPreflightInput {
  parentThread: ThreadSummary;
  task: string;
  role: SubagentRoleProfile;
  model: SubagentRunSummary["modelRuntimeSnapshot"]["profile"];
  dependencyMode: SubagentDependencyMode;
  forkMode: SubagentForkMode;
  promptMode: SubagentPromptMode;
  canonicalTaskPath: string;
  idempotencyKey: string;
}

export interface SubagentChildRuntimeLaunchPreflightResult {
  schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1";
  runtime: string;
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  capacity?: {
    localMemory?: SubagentCapacityLocalMemorySnapshot;
  };
  details?: Record<string, unknown>;
}

export interface SubagentChildRuntimeStartResult {
  started: boolean;
  run: SubagentRunSummary;
  message?: string;
}

export interface SubagentChildRuntimeWaitInput {
  run: SubagentRunSummary;
  timeoutMs: number;
  emitEvent: SubagentRuntimeEventEmitter;
}

export interface SubagentChildRuntimeApprovalRequest extends SubagentApprovalRequestInput {
  createdAt?: string;
  idempotencyKey?: string;
}

export type SubagentChildRuntimeSupervisorRequest = SubagentSupervisorRequestInput;

export type SubagentChildRuntimeWaitOutcomeKind =
  | "progress_return"
  | "child_terminal"
  | "approval_wait"
  | "supervisor_attention"
  | "child_runtime_timeout"
  | "runtime_detached";

export interface SubagentChildRuntimeWaitOutcome {
  kind: SubagentChildRuntimeWaitOutcomeKind;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface SubagentChildRuntimeWaitResult {
  run: SubagentRunSummary;
  timedOut: boolean;
  outcome?: SubagentChildRuntimeWaitOutcome;
  approvalRequests?: readonly SubagentChildRuntimeApprovalRequest[];
  supervisorRequests?: readonly SubagentChildRuntimeSupervisorRequest[];
}

export interface SubagentChildRuntimeCancelInput {
  run: SubagentRunSummary;
  reason: string;
  idempotencyKey: string;
  emitEvent: SubagentRuntimeEventEmitter;
}

export interface SubagentChildRuntimeCancelResult {
  run: SubagentRunSummary;
  cancelled: boolean;
}

export interface SubagentChildRuntimeFollowupInput {
  run: SubagentRunSummary;
  message: string;
  mailboxEvent: SubagentMailboxEventSummary;
  idempotencyKey: string;
  emitEvent: SubagentRuntimeEventEmitter;
  markMailboxDelivered: (now?: string) => SubagentMailboxEventSummary;
  markMailboxConsumed: (now?: string) => SubagentMailboxEventSummary;
}

export interface SubagentChildRuntimeFollowupResult {
  run: SubagentRunSummary;
  accepted: boolean;
  mailboxEvent?: SubagentMailboxEventSummary;
  message?: string;
}

export interface SubagentChildRuntimeRetryInput {
  run: SubagentRunSummary;
  message: string;
  mailboxEvent: SubagentMailboxEventSummary;
  idempotencyKey: string;
  emitEvent: SubagentRuntimeEventEmitter;
  markMailboxDelivered: (now?: string) => SubagentMailboxEventSummary;
  markMailboxConsumed: (now?: string) => SubagentMailboxEventSummary;
}

export interface SubagentChildRuntimeRetryResult {
  run: SubagentRunSummary;
  accepted: boolean;
  mailboxEvent?: SubagentMailboxEventSummary;
  message?: string;
}

export interface SubagentChildRuntimeApprovalResponseInput {
  run: SubagentRunSummary;
  mailboxEvent: SubagentMailboxEventSummary;
  approvalId: string;
  decision: SubagentApprovalDecision;
  effectiveScope: SubagentApprovalScope;
  idempotencyKey: string;
  emitEvent: SubagentRuntimeEventEmitter;
  markMailboxDelivered: (now?: string) => SubagentMailboxEventSummary;
  markMailboxConsumed: (now?: string) => SubagentMailboxEventSummary;
}

export interface SubagentChildRuntimeApprovalResponseResult {
  run: SubagentRunSummary;
  accepted: boolean;
  mailboxEvent?: SubagentMailboxEventSummary;
  message?: string;
}

export interface SubagentChildRuntimeAdapter {
  preflightChildLaunch?: (input: SubagentChildRuntimeLaunchPreflightInput) => Promise<SubagentChildRuntimeLaunchPreflightResult | undefined> | SubagentChildRuntimeLaunchPreflightResult | undefined;
  startChildRun?: (input: SubagentChildRuntimeStartInput) => Promise<SubagentChildRuntimeStartResult> | SubagentChildRuntimeStartResult;
  waitForChildRun?: (input: SubagentChildRuntimeWaitInput) => Promise<SubagentChildRuntimeWaitResult> | SubagentChildRuntimeWaitResult;
  cancelChildRun?: (input: SubagentChildRuntimeCancelInput) => Promise<SubagentChildRuntimeCancelResult> | SubagentChildRuntimeCancelResult;
  followupChildRun?: (input: SubagentChildRuntimeFollowupInput) => Promise<SubagentChildRuntimeFollowupResult> | SubagentChildRuntimeFollowupResult;
  retryChildRun?: (input: SubagentChildRuntimeRetryInput) => Promise<SubagentChildRuntimeRetryResult> | SubagentChildRuntimeRetryResult;
  resolveChildApprovalResponse?: (input: SubagentChildRuntimeApprovalResponseInput) => Promise<SubagentChildRuntimeApprovalResponseResult> | SubagentChildRuntimeApprovalResponseResult;
}

export const SUBAGENT_CHILD_RUNTIME_ADAPTER_METHODS = [
  "preflightChildLaunch",
  "startChildRun",
  "waitForChildRun",
  "cancelChildRun",
  "followupChildRun",
  "retryChildRun",
  "resolveChildApprovalResponse",
] as const;

export type SubagentChildRuntimeAdapterMethod = typeof SUBAGENT_CHILD_RUNTIME_ADAPTER_METHODS[number];

export interface SubagentChildRuntimeAdapterCapabilities {
  schemaVersion: typeof PI_CHILD_SESSION_ADAPTER_SCHEMA_VERSION;
  availableMethods: SubagentChildRuntimeAdapterMethod[];
  missingMethods: SubagentChildRuntimeAdapterMethod[];
  canStart: boolean;
  canPreflightLaunch: boolean;
  canWait: boolean;
  canCancel: boolean;
  canFollowup: boolean;
  canRetry: boolean;
  canResolveApprovalResponses: boolean;
}

export function describeSubagentChildRuntimeAdapter(
  adapter: SubagentChildRuntimeAdapter | undefined,
): SubagentChildRuntimeAdapterCapabilities {
  const availableMethods = SUBAGENT_CHILD_RUNTIME_ADAPTER_METHODS.filter((method) => typeof adapter?.[method] === "function");
  const missingMethods = SUBAGENT_CHILD_RUNTIME_ADAPTER_METHODS.filter((method) => !availableMethods.includes(method));
  return {
    schemaVersion: PI_CHILD_SESSION_ADAPTER_SCHEMA_VERSION,
    availableMethods,
    missingMethods,
    canPreflightLaunch: availableMethods.includes("preflightChildLaunch"),
    canStart: availableMethods.includes("startChildRun"),
    canWait: availableMethods.includes("waitForChildRun"),
    canCancel: availableMethods.includes("cancelChildRun"),
    canFollowup: availableMethods.includes("followupChildRun"),
    canRetry: availableMethods.includes("retryChildRun"),
    canResolveApprovalResponses: availableMethods.includes("resolveChildApprovalResponse"),
  };
}
