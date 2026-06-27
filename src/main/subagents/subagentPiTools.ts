import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
  createAmbientModelRuntimeSnapshot,
  createAmbientModelRuntimeSnapshotFromProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import {
  isAmbientSubagentsEnabled,
  type AmbientFeatureFlagSnapshot,
} from "../../shared/featureFlags";
import {
  type ResolveSubagentCapacityLeaseInput,
  type SubagentCapacityLeaseSnapshot,
} from "../../shared/subagentCapacity";
import {
  type SubagentDependencyMode,
  type SubagentRunStatus,
  type SubagentRuntimeEventSource,
} from "../../shared/subagentProtocol";
import {
  DEFAULT_SUBAGENT_ROLE_PROFILES,
  type SubagentRoleId,
  type SubagentRoleProfile,
} from "../../shared/subagentRoles";
import {
  SUBAGENT_TOOL_CATEGORIES,
} from "../../shared/subagentToolScope";
import {
  SUBAGENT_PATTERN_ROLE_IDS,
  type SubagentEffectiveRoleSnapshot,
} from "../../shared/subagentPatternGraph";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { SymphonyChildLaunchContractBundle } from "../../shared/symphonyFineGrainedContracts";
import type { ThreadWorktreeSummary, ThreadSummary } from "../../shared/threadTypes";
import {
  type SubagentModelScopeResolution,
} from "./subagentModelProviderFacade";
import type {
  SubagentChildRuntimeAdapter,
  SubagentChildRuntimeCancelInput,
  SubagentChildRuntimeCancelResult,
  SubagentChildRuntimeFollowupInput,
  SubagentChildRuntimeStartInput,
  SubagentChildRuntimeStartResult,
  SubagentChildRuntimeWaitInput,
  SubagentChildRuntimeWaitResult,
  SubagentChildWorktreePrepareInput,
  SubagentRuntimeEventEmitter,
} from "./subagentPiRuntimeFacade";
import {
  prepareSubagentChildWorktreeForLaunch,
} from "./subagentChildWorktreePreparer";
import {
  acquireSymphonyMutationWorkspaceLease,
} from "./symphonyMutationWorkspaceLeaseDefaultService";
import { createDefaultModelRuntimeRegistry } from "./subagentModelProviderFacade";
import {
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
  findSubagentRunEventByIdempotencyKey,
} from "./subagentIdempotency";
import {
  enumValue,
  optionalString,
  requiredString,
  resolveSubagentPiToolInput,
  resolveSubagentPiToolWaitTimeoutMs,
} from "./subagentPiToolInput";
import {
  piChildRuntimeEventUpdateDetails,
  piChildRuntimeEventUpdateText,
} from "./subagentPiRuntimeFacade";
import { appendMappedSubagentRuntimeEvent } from "./subagentRuntimeEventPersistence";
import {
  createDefaultAgentRoleRegistry,
  type AgentRoleRegistry,
} from "./subagentAgentFacade";
import {
  compactSubagentToolScopeSnapshot,
} from "./subagentToolScopeSnapshot";
import {
  compactSubagentTurnBudgetStateForPi,
  compactSubagentTurnBudgetPolicyForPi,
  resolveSubagentTurnBudgetPolicy,
} from "../../shared/subagentTurnBudget";
import {
  unavailableRequestedExtensionToolNames,
} from "./subagentToolScopeRequest";
import {
  SUBAGENT_BARRIER_DECISIONS,
  type SubagentBarrierDecision,
  type SubagentParentPolicyResolution,
} from "./subagentParentPolicyResolution";
import {
  compactSubagentWaitBarrier as compactWaitBarrier,
} from "./subagentWaitMailbox";
import {
  buildSubagentBarrierDecisionText,
} from "./subagentBarrierDecision";
import {
  executeSubagentBarrierDecision,
} from "./subagentBarrierDecisionExecutor";
import { executeSubagentCancelAgent } from "./subagentCancelAgentExecutor";
import {
  assertCanCloseSubagentRun,
  buildSubagentCloseAgentReplayText,
  buildSubagentCloseAgentResultText,
} from "./subagentCloseAgent";
import { executeSubagentCloseAgent } from "./subagentCloseAgentExecutor";
import {
  buildSubagentListAgentsText,
  buildSubagentStatusText,
} from "./subagentAgentStatus";
import {
  buildScheduledSubagentSpawnFailureReason,
  buildSubagentExistingRunText,
  buildSubagentSpawnBlockedText,
  buildSubagentSpawnText,
  scheduledSubagentSpawnRequestFields,
} from "./subagentSpawnFailure";
import {
  assertCallableWorkflowPatternGraphCanBind,
  type CallableWorkflowPatternGraphChildBindingRequest,
} from "./subagentCallableWorkflowFacade";
import {
  compactSubagentPiToolCapacityLease as compactCapacityLease,
  compactSubagentPiToolMailboxEvent as compactMailbox,
  compactSubagentPiToolModelScope as compactModelScope,
  compactSubagentPiToolParentMailboxEvent as compactParentMailbox,
  compactSubagentPiToolRun as compactRun,
  compactSubagentPiToolRunEvent as compactEvent,
  compactSubagentPiToolRuntimeLaunchPreflight as compactRuntimeLaunchPreflight,
  compactSubagentPiToolThreadWorktree as compactThreadWorktree,
  previewSubagentPiToolText as previewText,
  subagentPiToolResult as toolResult,
} from "./subagentPiToolResult";
import {
  SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE,
  SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION,
} from "./subagentSupervisorRequest";
import {
  recordScheduledSubagentSpawnPolicyFailure,
  recordSubagentPreRunSpawnFailure,
} from "./subagentPreRunSpawnFailureRecorder";
import {
  executeSubagentSpawnLaunch,
} from "./subagentSpawnLaunchExecutor";
import {
  resolveSubagentSpawnPreRunPlan,
  SUBAGENT_SPAWN_PLANNER_DEPENDENCY_MODES,
  SUBAGENT_SPAWN_PLANNER_FORK_MODES,
  SUBAGENT_SPAWN_PLANNER_PROMPT_MODES,
  type SubagentSpawnPatternGraphBinding,
} from "./subagentSpawnPreRunPlanner";
import {
  buildSubagentSpawnRuntimePreflightInput,
  resolveSubagentSpawnCapacityLease,
  resolveSubagentSpawnRuntimePreflight,
  shouldRecordSubagentPreRunCapacityFailure,
} from "./subagentSpawnPreflightResolver";
import {
  buildSubagentChildMailboxQueuedText,
  buildSubagentChildMailboxReplayText,
  compactSubagentChildMailboxEvent,
  compactSubagentChildRuntimeFollowup,
  type SubagentChildMailboxAction,
} from "./subagentMailboxRequest";
import { executeSubagentChildMailbox } from "./subagentChildMailboxExecutor";
import {
  resolveSubagentWaitContext,
  SUBAGENT_WAIT_CONTEXT_BARRIER_FAILURE_POLICIES,
  SUBAGENT_WAIT_CONTEXT_BARRIER_MODES,
  type SubagentWaitContext,
} from "./subagentWaitContextResolver";
import {
  executeSubagentWaitAgent,
} from "./subagentWaitAgentExecutor";
import { compactSubagentTurnBudgetWrapUpSteeringRecord } from "./subagentTurnBudgetWrapUpRecorder";
import { compactSubagentTurnBudgetExhaustionSettlementRecord } from "./subagentTurnBudgetExhaustionRecorder";
import {
  assertSubagentRunOpenForAction,
  resolveSubagentTargetRun,
  resolveSubagentTargetWaitBarrier,
} from "./subagentTargetResolver";

export const AMBIENT_SUBAGENT_TOOL_NAME = "ambient_subagent" as const;
export const AMBIENT_SUBAGENT_REGISTERED_TOOL_NAMES = [AMBIENT_SUBAGENT_TOOL_NAME] as const;
export const AMBIENT_SUBAGENT_ACTIVE_TOOL_NAMES = [] as const;

const SUBAGENT_RUNTIME = "ambient-subagents";
const SUBAGENT_PHASE = "phase-2-pi-tool-surface";
const DEFAULT_AGENT_ROLE_REGISTRY = createDefaultAgentRoleRegistry();
const DEFAULT_MODEL_RUNTIME_REGISTRY = createDefaultModelRuntimeRegistry();
const DEFAULT_SUBAGENT_ROLE_IDS = DEFAULT_SUBAGENT_ROLE_PROFILES.map((role) => role.id);
const SUBAGENT_ACTIONS = [
  "spawn_agent",
  "send_agent",
  "followup_agent",
  "wait_agent",
  "resolve_barrier",
  "list_agents",
  "status_agent",
  "close_agent",
  "cancel_agent",
] as const;

type SubagentAction = typeof SUBAGENT_ACTIONS[number];
type SubagentToolOnUpdate = Parameters<ToolDefinition<any, any, any>["execute"]>[3];

export interface SubagentPiToolParentRun {
  id: string;
  assistantMessageId?: string;
}

export interface SubagentPiToolStore {
  getThread(threadId: string): ThreadSummary;
  createSubagentRun(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    title: string;
    roleId: string;
    roleProfileSnapshot?: SubagentRoleProfile;
    effectiveRoleSnapshot?: SubagentEffectiveRoleSnapshot;
    canonicalTaskPath: string;
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
    modelRuntimeSnapshot: ReturnType<typeof createAmbientModelRuntimeSnapshot>;
    capacityLeaseSnapshot?: SubagentCapacityLeaseSnapshot;
    symphonyLaunchContracts?: SymphonyChildLaunchContractBundle;
    symphonyMutationWorkspaceLease?: SubagentRunSummary["symphonyMutationWorkspaceLease"];
    dependencyMode?: SubagentDependencyMode;
    childOrder?: number;
  }): SubagentRunSummary;
  getSubagentRun(runId: string): SubagentRunSummary;
  updateSubagentRunMutationWorkspaceLease(runId: string, lease: NonNullable<SubagentRunSummary["symphonyMutationWorkspaceLease"]>): SubagentRunSummary;
  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary;
  getSubagentWaitBarrier(id: string): SubagentWaitBarrierSummary;
  listSubagentRunsForParentThread(parentThreadId: string): SubagentRunSummary[];
  assertSubagentCanonicalTaskPathAvailableForSpawn(input: {
    parentThreadId: string;
    parentRunId: string;
    canonicalTaskPath: string;
  }): void;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  appendSubagentRunEvent(runId: string, input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string }): SubagentRunEventSummary;
  recordSubagentToolScopeSnapshot(runId: string, input: {
    scope: SubagentToolScopeSnapshotSummary["scope"];
    resolverInputs?: unknown;
    createdAt?: string;
  }): SubagentToolScopeSnapshotSummary;
  listSubagentToolScopeSnapshots(runId: string): SubagentToolScopeSnapshotSummary[];
  getCallableWorkflowTask?: (id: string) => CallableWorkflowTaskSummary;
  listCallableWorkflowTasksForParentRun?: (parentRunId: string) => CallableWorkflowTaskSummary[];
  bindCallableWorkflowTaskPatternGraphChild?: (input: CallableWorkflowPatternGraphChildBindingRequest) => CallableWorkflowTaskSummary;
  markSubagentRunStatus(runId: string, status: SubagentRunStatus, options?: { resultArtifact?: unknown; now?: string }): SubagentRunSummary;
  closeSubagentRun(runId: string, now?: string): SubagentRunSummary;
  createSubagentWaitBarrier(input: {
    parentThreadId: string;
    parentRunId: string;
    childRunIds: string[];
    dependencyMode: "required_all" | "required_any" | "quorum" | "optional_background";
    failurePolicy: "fail_parent" | "ask_user" | "degrade_partial" | "retry_child";
    ownerKind?: SubagentWaitBarrierSummary["ownerKind"];
    ownerId?: string;
    quorumThreshold?: number;
    timeoutMs?: number;
    createdAt?: string;
  }): SubagentWaitBarrierSummary;
  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[];
  upsertSubagentGroupedCompletionNotification(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    child: {
      runId: string;
      childThreadId: string;
      canonicalTaskPath: string;
      roleId: string;
      status: SubagentRunStatus;
      summary: string;
      completedAt?: string;
    };
    createdAt?: string;
  }): SubagentParentMailboxEventSummary;
  updateSubagentWaitBarrierStatus(
    id: string,
    status: "waiting_on_children" | "satisfied" | "failed" | "timed_out" | "cancelled",
    options?: { resolutionArtifact?: unknown; now?: string },
  ): SubagentWaitBarrierSummary;
  appendSubagentMailboxEvent(runId: string, input: {
    direction: "parent_to_child" | "child_to_parent";
    type: string;
    payload: unknown;
    deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentMailboxEventSummary;
  appendSubagentParentMailboxEvent(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: string;
    payload: unknown;
    deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
    idempotencyKey?: string;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentParentMailboxEventSummary;
  listSubagentParentMailboxEventsForParentRun(parentRunId: string): SubagentParentMailboxEventSummary[];
  getSubagentParentMailboxEvent(id: string): SubagentParentMailboxEventSummary;
  updateSubagentParentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentParentMailboxEventSummary;
  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[];
  updateSubagentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary;
  addMessage(input: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }): unknown;
}

export interface CreateSubagentPiToolDefinitionsOptions {
  store: SubagentPiToolStore;
  threadId: string;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  getParentRun: () => SubagentPiToolParentRun | undefined;
  availableExtensionToolNames?: readonly string[];
  roleRegistry?: AgentRoleRegistry;
  resolveSymphonyLaunchContract?: (contractId: string) => unknown;
  resolveModelRuntimeProfile?: (modelId?: string) => AmbientModelRuntimeProfile;
  resolveCapacityLease?: (input: ResolveSubagentCapacityLeaseInput) => Promise<SubagentCapacityLeaseSnapshot> | SubagentCapacityLeaseSnapshot;
  prepareChildWorktree?: (input: SubagentChildWorktreePrepareInput) => Promise<ThreadWorktreeSummary | undefined> | ThreadWorktreeSummary | undefined;
  trustedWaitBarrierOwner?: Pick<SubagentWaitBarrierSummary, "ownerKind" | "ownerId">;
  runtime?: SubagentChildRuntimeAdapter;
}

export function ambientSubagentActiveToolNamesForThread(
  thread: Pick<ThreadSummary, "kind">,
  featureFlags: AmbientFeatureFlagSnapshot,
): readonly typeof AMBIENT_SUBAGENT_TOOL_NAME[] {
  return [];
}

export function ambientSubagentRegisteredToolNamesForThread(
  thread: Pick<ThreadSummary, "kind">,
  featureFlags: AmbientFeatureFlagSnapshot,
): readonly typeof AMBIENT_SUBAGENT_TOOL_NAME[] {
  if (!isAmbientSubagentsEnabled(featureFlags)) return [];
  if (thread.kind === "subagent_child") return [];
  return AMBIENT_SUBAGENT_REGISTERED_TOOL_NAMES;
}

export function createSubagentPiToolDefinitions(options: CreateSubagentPiToolDefinitionsOptions): ToolDefinition<any, any, any>[] {
  const roleRegistry = options.roleRegistry ?? DEFAULT_AGENT_ROLE_REGISTRY;
  const roleIds = roleRegistry.roleIds();
  return [{
    name: AMBIENT_SUBAGENT_TOOL_NAME,
    label: "Ambient Sub-Agent",
    description:
      "Create and manage Ambient sub-agent child threads. Use this tool directly for explicit delegation, parallel child-agent work, or requests that name Ambient sub-agents.",
    promptSnippet:
      "ambient_subagent: Spawn, list, status, wait, resolve barriers, send/followup, cancel, and close visible Ambient child-thread sub-agents. When the user explicitly asks for delegated/sub-agent/parallel child work or names ambient_subagent, call spawn_agent before giving a final answer. Match the workflow shape: concrete deliverables with ordered outputs use pipeline or imitate-and-verify; alternatives use ensemble; opposing stances use debate.",
    promptGuidelines: [
      "Use spawn_agent to create a visible child thread before delegated work starts; do not substitute a prose plan for an explicit sub-agent request.",
      "If the user supplies roleId, dependencyMode, idempotencyKey, task, or wait timeout values, pass those literal values in the tool arguments.",
      "For Symphony or workflow-pattern children, pass effectiveRole with patternRole, overlayLabels, and any outputContract so Ambient can persist the non-widening composed role snapshot.",
      "When a Symphony/workflow launch gives you a workflowTaskId and graph role node, pass patternGraphBinding so the parent diagram can bind the child to a real graph node.",
      "Choose the workflow shape deliberately: use pipeline for ordered stage handoffs, map-reduce for independent slices plus a reducer, debate only for opposing stances on a decision, imitate-and-verify for draft plus independent check, ensemble for alternate proposals, and self-healing for build/test/repair loops. Do not call ordinary planning, checking, or review work an adversarial debate just because it needs stress testing.",
      "When the user asks to turn constraints into a concrete deliverable with named outputs such as a menu, shopping list, timing plan, itinerary, migration checklist, or implementation sequence, use pipeline or imitate-and-verify. Reviewers/critics in that flow are verification stages, not debate stances.",
      "For a single concrete deliverable request, do not spawn competing Plan A / Plan B proposal children unless the user explicitly asks for alternatives. Prefer stage children such as constraints, draft/menu, shopping/implementation details, verification, and final brief, passing each stage's output forward.",
      "For pipeline work, wait for each required stage before launching the next stage, then pass the prior stage's resultSummaryPreview, draftPreview, reviewOutputPreview, explicit artifact paths, or concise quoted excerpts into the next child task. Children cannot discover sibling outputs from hidden transcripts or guessed workspace files.",
      "For adversarial debate or high-stakes decision requests, spawn at least three distinct stance/perspective children before synthesis whenever the user needs the decision tested from multiple angles. Give each child a different named stance, require evidence used and strongest objection to its own view, then usually spawn a reducer/reviewer evaluator child to compare the stances before the parent synthesizes.",
      "Debate synthesis should include a visible evaluation rubric with at least four criteria and explicit weights that sum to 100, then preserve convergence, dissent or minority objections, and a rubric-driven recommendation.",
      "For reducer, evaluator, or verifier children, include all required upstream child summaries or artifact handles in the task/message. If the necessary upstream output is missing, wait, retry, or ask; do not ask the child to search for invisible sibling context.",
      "Keep intermediate child outputs compact enough for later handoff: prefer structured summaries, constraints checked, risks, decisions, and next-stage inputs over very long prose embedded inside JSON unless the user needs the full draft.",
      "Use roleId worker only for children that mutate files or artifacts in an isolated worktree; use drafter for non-mutating copy, proposals, plans, and textual artifacts.",
      "For read-only explorer, reviewer, drafter, or reducer work, usually omit toolScope and let Ambient apply the role defaults. If you narrow toolScope, request only capabilities the role already allows. For ordinary public web research, use connector.read with childAuthority.taskIntent web_research so the child uses web_research provider tools rather than managed browser search. Do not request browser.read for ordinary search/fetch work; browser.read is policy vocabulary and does not activate child browser tools. Request browser.interactive only when the child truly needs a browser page/session and the parent should review browser authority.",
      "Explorer/reviewer children may request connector.read for exact read-only connector or brokered web-research work; do not request connector.write, browser.interactive, workspace.write, or mutation scopes unless the child task explicitly requires them and the role/isolation policy permits them.",
      "Set dependencyMode required whenever the parent needs the child's result before it can answer; optional_background is only for ignorable background work.",
      "After spawn_agent for required child work, read the returned childRunId and call wait_agent for that child before synthesizing the parent answer.",
      "Treat returned childRunId and canonicalTaskPath as the stable handles for later wait_agent, send_agent, followup_agent, resolve_barrier, cancel_agent, and close_agent calls.",
      "When several children jointly gate the parent, call wait_agent with childRunIds plus waitBarrierMode; quorum waits must include quorumThreshold.",
      "Do not synthesize child work from a reserved, failed, stopped, detached, timed_out, or partial child unless the result is explicitly marked partial.",
      "If wait_agent returns a failed or timed-out required wait and you retry child work, first call resolve_barrier with that waitBarrierId and decision retry_child; do not manually spawn a separate replacement child, because the original failed barrier will keep blocking final synthesis.",
      "If wait_agent returns parentResolution.action ask_user for a policy choice such as partial, detach, cancel, or fail, ask the user first; same-child retry after validation/provider failure should use resolve_barrier decision retry_child.",
      "Do not use parent tools to perform the required child task after a required child fails, and do not close failed required children to bypass a wait barrier. Resolve the barrier with retry_child, ask the user for the policy choice, or cancel/fail the parent.",
      "If wait_agent returns supervisorRequestRecords, ask or decide as appropriate, then pass supervisorRequestParentMailboxEventId to send_agent or followup_agent so the child request is acknowledged while the parent stays blocked until the child is synthesis-safe.",
      "close_agent releases live-agent capacity and never deletes the child transcript or artifacts.",
      "resolve_barrier decision cancel_parent is a final stop/cancel path for the parent run. If your intent is to try the same child again, retry with a different role, respawn replacement work, or keep working toward the same parent objective, use retry_child or ask the user instead.",
      "Child sessions do not receive this parent-facing tool unless a later fanout policy explicitly enables constrained nested fanout.",
      "Do not pass scheduled, recurrence, cron, runAt, scheduleId, automation, or similar timing fields to spawn_agent; scheduled sub-agents are deferred to the automation layer and cannot inherit live parent context.",
    ],
    parameters: subagentToolParameters(roleIds, {
      includeSymphonyLaunchContracts: Boolean(options.resolveSymphonyLaunchContract),
    }),
    executionMode: "sequential",
    execute: async (toolCallId, params, _signal, onUpdate) => {
      const { input, action } = resolveSubagentPiToolInput(params, SUBAGENT_ACTIONS);
      const featureFlags = options.getFeatureFlagSnapshot();
      if (!isAmbientSubagentsEnabled(featureFlags)) {
        throw new Error("ambient.subagents is disabled; ambient_subagent is unavailable.");
      }
      const parentThread = options.store.getThread(options.threadId);
      if (parentThread.kind === "subagent_child") {
        throw new Error("Nested sub-agent fanout is disabled for Phase 2 child sessions.");
      }

      onUpdate?.({
        content: [{ type: "text", text: `Ambient sub-agent ${action.replace(/_/g, " ")} requested.` }],
        details: {
          runtime: SUBAGENT_RUNTIME,
          phase: SUBAGENT_PHASE,
          toolName: AMBIENT_SUBAGENT_TOOL_NAME,
          action,
          threadId: parentThread.id,
        },
      });

      switch (action) {
        case "spawn_agent":
          return spawnAgent(options, parentThread, featureFlags, input, toolCallId, onUpdate);
        case "list_agents":
          return listAgents(options, parentThread, action);
        case "status_agent":
        case "wait_agent":
          return runStatus(options, parentThread, input, action, onUpdate);
        case "resolve_barrier":
          return resolveBarrierDecision(options, parentThread, input, toolCallId, onUpdate);
        case "send_agent":
        case "followup_agent":
          return queueParentToChildMessage(options, parentThread, input, action, toolCallId, onUpdate);
        case "cancel_agent":
          return cancelAgent(options, parentThread, input, toolCallId, onUpdate);
        case "close_agent":
          return closeAgent(options, parentThread, input, toolCallId);
      }
    },
  }];
}

async function spawnAgent(
  options: CreateSubagentPiToolDefinitionsOptions,
  parentThread: ThreadSummary,
  featureFlags: AmbientFeatureFlagSnapshot,
  input: Record<string, unknown>,
  toolCallId: string,
  onUpdate: SubagentToolOnUpdate,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parentRun = options.getParentRun();
  if (!parentRun) {
    throw new Error("Cannot spawn a sub-agent without an active parent run.");
  }
  const roleRegistry = options.roleRegistry ?? DEFAULT_AGENT_ROLE_REGISTRY;
  const existingRuns = options.store.listSubagentRunsForParentThread(parentThread.id);
  const plan = resolveSubagentSpawnPreRunPlan({
    parentThread,
    parentRun,
    request: input,
    featureFlagSnapshot: featureFlags,
    resolveSymphonyLaunchContract: options.resolveSymphonyLaunchContract,
    roleRegistry,
    resolveModelRuntimeProfile: options.resolveModelRuntimeProfile ?? ((modelId) => DEFAULT_MODEL_RUNTIME_REGISTRY.resolveProfile(modelId)),
    existingRuns,
  });
  const {
    task,
    requestedRoleId,
    roleId,
    role,
    scheduledSpawnFields,
    modelScope,
    modelId,
    model,
    dependencyMode,
    forkMode,
    promptMode,
    effectiveRoleSnapshot,
    patternGraphBinding,
    symphonyContracts,
    requestedToolScope,
    canonicalTaskPath,
    idempotencyKey,
    retentionPolicy,
    title,
  } = plan;
  if (scheduledSpawnFields.length > 0) {
    recordScheduledSubagentSpawnPolicyFailure({
      store: options.store,
      parentThread,
      parentRun,
      phase: SUBAGENT_PHASE,
      toolCallId,
      task,
      requestedRoleId,
      roleId,
      role,
      scheduledSpawnFields,
      idempotencyKey: optionalString(input.idempotencyKey),
    });
    throw new Error(buildScheduledSubagentSpawnFailureReason(scheduledSpawnFields));
  }
  if (modelScope.blockingReasons.length > 0) {
    recordSubagentPreRunSpawnFailure({
      store: options.store,
      parentThread,
      parentRun,
      phase: SUBAGENT_PHASE,
      toolCallId,
      task,
      requestedRoleId,
      roleId,
      modelScope,
      idempotencyKey: optionalString(input.idempotencyKey),
      reason: `Selected model is not eligible for sub-agent runs (${modelScope.selectedModelId}): ${modelScope.blockingReasons.join("; ")}`,
    });
  }
  validateSubagentModelScope(modelScope);
  assertSpawnPatternGraphBindingReady(options, parentThread, parentRun, patternGraphBinding);
  const existing = findRunByIdempotencyKey(options.store, parentThread.id, "subagent.spawn_requested", idempotencyKey);
  if (existing) {
    const patternGraphTask = bindSpawnPatternGraphChild(options, patternGraphBinding, existing);
    return toolResult(buildSubagentExistingRunText(existing), {
      runtime: SUBAGENT_RUNTIME,
      phase: SUBAGENT_PHASE,
      toolName: AMBIENT_SUBAGENT_TOOL_NAME,
      action: "spawn_agent",
      status: "idempotent_replay",
      parentThreadId: parentThread.id,
      parentRunId: parentRun.id,
      run: compactRun(existing),
      capacityLease: compactCapacityLease(existing.capacityLeaseSnapshot),
      ...(patternGraphTask ? { patternGraphBinding: compactPatternGraphBinding(patternGraphTask, patternGraphBinding!, existing) } : {}),
      turnBudgetPolicy: compactSubagentTurnBudgetPolicyForPi(resolveSubagentTurnBudgetPolicy(existing.roleProfileSnapshot)),
      orchestrationStarted: false,
    });
  }
  options.store.assertSubagentCanonicalTaskPathAvailableForSpawn({
    parentThreadId: parentThread.id,
    parentRunId: parentRun.id,
    canonicalTaskPath,
  });
  const unavailableExtensionTools = unavailableRequestedExtensionToolNames(requestedToolScope, options.availableExtensionToolNames);
  if (unavailableExtensionTools.length) {
    const names = unavailableExtensionTools
      .map((tool) => `${tool.id}${tool.categoryId ? ` (${tool.categoryId})` : ""}`)
      .join(", ");
    const reason = `Requested sub-agent extension tools are unavailable for this launch: ${names}. Enable the Codex plugin MCP tool or remove it from toolScope.surfacedExtensionTools.`;
    recordSubagentPreRunSpawnFailure({
      store: options.store,
      parentThread,
      parentRun,
      phase: SUBAGENT_PHASE,
      toolCallId,
      task,
      requestedRoleId,
      roleId,
      modelScope,
      idempotencyKey,
      failureStage: "tool_scope",
      reason,
      unavailableExtensionTools,
    });
    throw new Error(reason);
  }
  const runtimeLaunchPreflight = await resolveSubagentSpawnRuntimePreflight({
    runtime: options.runtime,
    preflightInput: buildSubagentSpawnRuntimePreflightInput({
      parentThread,
      task,
      role,
      model,
      dependencyMode,
      forkMode,
      promptMode,
      canonicalTaskPath,
      idempotencyKey,
    }),
  });
  if (runtimeLaunchPreflight && !runtimeLaunchPreflight.allowed) {
    const reason = `Sub-agent runtime launch preflight failed: ${runtimeLaunchPreflight.blockers.join("; ") || "runtime did not allow launch."}`;
    recordSubagentPreRunSpawnFailure({
      store: options.store,
      parentThread,
      parentRun,
      phase: SUBAGENT_PHASE,
      toolCallId,
      task,
      requestedRoleId,
      roleId,
      modelScope,
      idempotencyKey,
      failureStage: "runtime_launch_preflight",
      runtimeLaunchPreflight,
      reason,
    });
    throw new Error(reason);
  }

  const capacityLease = await resolveSubagentSpawnCapacityLease({
    resolveCapacityLease: options.resolveCapacityLease,
    parentThread,
    parentRun,
    canonicalTaskPath,
    roleId,
    model,
    existingRuns,
    ...(runtimeLaunchPreflight ? { runtimeLaunchPreflight } : {}),
  });
  if (shouldRecordSubagentPreRunCapacityFailure(capacityLease, runtimeLaunchPreflight)) {
    const reason = `Sub-agent capacity preflight failed: ${capacityLease.blockingReasons.join("; ") || "capacity was unavailable."}`;
    recordSubagentPreRunSpawnFailure({
      store: options.store,
      parentThread,
      parentRun,
      phase: SUBAGENT_PHASE,
      toolCallId,
      task,
      requestedRoleId,
      roleId,
      modelScope,
      idempotencyKey,
      failureStage: "capacity",
      ...(runtimeLaunchPreflight ? { runtimeLaunchPreflight } : {}),
      capacityLease,
      reason,
    });
    throw new Error(reason);
  }
  let run = options.store.createSubagentRun({
    parentThreadId: parentThread.id,
    parentRunId: parentRun.id,
    parentMessageId: parentRun.assistantMessageId,
    title,
    roleId,
    roleProfileSnapshot: role,
    ...(effectiveRoleSnapshot ? { effectiveRoleSnapshot } : {}),
    canonicalTaskPath,
    featureFlagSnapshot: featureFlags,
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshotFromProfile(modelId, model),
    capacityLeaseSnapshot: capacityLease,
    ...(symphonyContracts ? { symphonyLaunchContracts: symphonyContracts } : {}),
    dependencyMode,
  });
  const patternGraphTask = bindSpawnPatternGraphChild(options, patternGraphBinding, run);
  const symphonyMutationLeaseRequired =
    symphonyContracts?.childLaunchPolicySnapshot.mutation === "lease_required";
  const childWorktree = await prepareSubagentChildWorktreeForLaunch({
    store: options.store,
    prepareChildWorktree: options.prepareChildWorktree,
    requiredBy: symphonyMutationLeaseRequired ? "symphony_mutation_lease" : "role",
    request: {
      parentThread,
      run,
      role,
      task,
      idempotencyKey,
    },
  });
  if (symphonyMutationLeaseRequired && symphonyContracts) {
    const leaseResult = await acquireSymphonyMutationWorkspaceLease({
      store: options.store,
      parentThread,
      run,
      policy: symphonyContracts.childLaunchPolicySnapshot,
      ...(childWorktree ? { childWorktree } : {}),
      requestedWriteRoots: requestedToolScope.childAuthority?.writeRoots ?? [],
    });
    run = leaseResult.run;
  }
  const launchResult = await executeSubagentSpawnLaunch({
    store: options.store,
    runtime: SUBAGENT_RUNTIME,
    phase: SUBAGENT_PHASE,
    parentThread,
    parentRun,
    run,
    task,
    toolCallId,
    requestedRoleId,
    roleId,
    role,
    modelId,
    model,
    modelScope,
    ...(runtimeLaunchPreflight ? { runtimeLaunchPreflight } : {}),
    dependencyMode,
    forkMode,
    promptMode,
    retentionPolicy,
    idempotencyKey,
    requestedToolScope,
    ...(options.availableExtensionToolNames ? { availableExtensionToolNames: options.availableExtensionToolNames } : {}),
    ...(childWorktree ? { childWorktree } : {}),
    startChildRun: options.runtime?.startChildRun,
    createRuntimeSpawnEventEmitter: (childRun) => createRuntimeEventEmitter(options.store, childRun, "spawn_agent", onUpdate),
  });
  const {
    currentRun,
    toolScopeSnapshot,
    waitBarrier,
    spawnBlockDecision,
    blockedWaitBarrier,
    spawnFailureParentMailbox,
    startResult,
    turnBudgetPolicy,
  } = launchResult;
  if (spawnBlockDecision.blocked) {
    return toolResult(buildSubagentSpawnBlockedText(currentRun, spawnBlockDecision.reason), {
      runtime: SUBAGENT_RUNTIME,
      phase: SUBAGENT_PHASE,
      toolName: AMBIENT_SUBAGENT_TOOL_NAME,
      action: "spawn_agent",
      status: currentRun.status,
      parentThreadId: parentThread.id,
      parentRunId: parentRun.id,
      run: compactRun(currentRun),
      idempotencyKey,
      taskPreview: previewText(task),
      modelScope: compactModelScope(modelScope),
      capacityLease: compactCapacityLease(currentRun.capacityLeaseSnapshot),
      ...(patternGraphTask ? { patternGraphBinding: compactPatternGraphBinding(patternGraphTask, patternGraphBinding!, currentRun) } : {}),
      childWorktree: childWorktree ? compactThreadWorktree(childWorktree) : null,
      toolScopeSnapshot: compactSubagentToolScopeSnapshot(toolScopeSnapshot),
      turnBudgetPolicy: compactSubagentTurnBudgetPolicyForPi(turnBudgetPolicy),
      ...(spawnFailureParentMailbox ? { spawnFailureParentMailbox: compactParentMailbox(spawnFailureParentMailbox) } : {}),
      ...(blockedWaitBarrier ? { waitBarrier: compactWaitBarrier(blockedWaitBarrier) } : {}),
      orchestrationStarted: false,
    });
  }

  return toolResult(buildSubagentSpawnText(currentRun, Boolean(startResult?.started)), {
    runtime: SUBAGENT_RUNTIME,
    phase: SUBAGENT_PHASE,
    toolName: AMBIENT_SUBAGENT_TOOL_NAME,
    action: "spawn_agent",
    status: currentRun.status,
    parentThreadId: parentThread.id,
    parentRunId: parentRun.id,
    run: compactRun(currentRun),
    idempotencyKey,
    taskPreview: previewText(task),
    modelScope: compactModelScope(modelScope),
    capacityLease: compactCapacityLease(currentRun.capacityLeaseSnapshot),
    ...(patternGraphTask ? { patternGraphBinding: compactPatternGraphBinding(patternGraphTask, patternGraphBinding!, currentRun) } : {}),
    childWorktree: childWorktree ? compactThreadWorktree(childWorktree) : null,
    toolScopeSnapshot: compactSubagentToolScopeSnapshot(toolScopeSnapshot),
    turnBudgetPolicy: compactSubagentTurnBudgetPolicyForPi(turnBudgetPolicy),
    ...(runtimeLaunchPreflight ? { runtimeLaunchPreflight: compactRuntimeLaunchPreflight(runtimeLaunchPreflight) } : {}),
    ...(waitBarrier ? { waitBarrier: compactWaitBarrier(waitBarrier) } : {}),
    orchestrationStarted: Boolean(startResult?.started || currentRun.startedAt),
    ...(startResult?.message ? { orchestrationMessage: startResult.message } : {}),
  });
}

function listAgents(
  options: CreateSubagentPiToolDefinitionsOptions,
  parentThread: ThreadSummary,
  action: SubagentAction,
): AgentToolResult<Record<string, unknown>> {
  const runs = options.store.listSubagentRunsForParentThread(parentThread.id);
  return toolResult(buildSubagentListAgentsText(runs), {
    runtime: SUBAGENT_RUNTIME,
    phase: SUBAGENT_PHASE,
    toolName: AMBIENT_SUBAGENT_TOOL_NAME,
    action,
    status: "complete",
    parentThreadId: parentThread.id,
    runs: runs.map(compactRun),
  });
}

async function runStatus(
  options: CreateSubagentPiToolDefinitionsOptions,
  parentThread: ThreadSummary,
  input: Record<string, unknown>,
  action: Extract<SubagentAction, "status_agent" | "wait_agent">,
  onUpdate: SubagentToolOnUpdate,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const waitContext = action === "wait_agent" || optionalString(input.waitBarrierId)
    ? resolveWaitContext(options, parentThread, input)
    : undefined;
  const timeoutMs = resolveSubagentPiToolWaitTimeoutMs(input, {
    waitBarrierMode: waitContext?.waitBarrier.dependencyMode,
  });
  const execution = await executeSubagentWaitAgent({
    store: options.store,
    action,
    run: waitContext?.run ?? resolveSubagentTargetRun({ store: options.store, parentThreadId: parentThread.id, request: input }),
    ...(waitContext?.waitBarrier ? { waitBarrier: waitContext.waitBarrier } : {}),
    ...(waitContext?.childRuns ? { waitChildRuns: waitContext.childRuns } : {}),
    timeoutMs,
    explicitIdempotencyKey: optionalString(input.idempotencyKey),
    waitForChildRun: options.runtime?.waitForChildRun,
    resolveChildApprovalResponse: options.runtime?.resolveChildApprovalResponse,
    followupChildRun: options.runtime?.followupChildRun,
    createRuntimeWaitEventEmitter: (run) => createRuntimeEventEmitter(options.store, run, "wait_agent", onUpdate),
  });
  const {
    run,
    events,
    mailboxEvents,
    waitNotice,
    parentResolution,
    waitTimedOut,
    waitSessionExpired,
    waitBarrierTerminalInspection,
    waitOutcome,
    waitSatisfied,
    parentSynthesisAllowed,
    resultValidation,
    waitBarrierEvaluation,
    waitBarrierBlockers,
    waitBarrier,
    waitChildRuns,
    approvalRequestRecords,
    supervisorRequestRecords,
    groupedCompletionNotification,
    waitBarrierAttentionParentMailbox,
    waitCompletionMailbox,
    approvalResponseDeliveries,
    approvalResponsePendingEvents,
    turnBudgetState,
    turnBudgetExhaustionSettlement,
    turnBudgetWrapUpSteering,
    turnBudgetWrapUpDelivery,
  } = execution;
  return toolResult(buildSubagentStatusText({
    run,
    waitChildRuns,
    events,
    mailboxEvents,
    notice: waitNotice,
    parentResolution,
    waitBarrier,
    waitBarrierBlockers,
    turnBudgetState,
  }), {
    runtime: SUBAGENT_RUNTIME,
    phase: SUBAGENT_PHASE,
    toolName: AMBIENT_SUBAGENT_TOOL_NAME,
    action,
    status: run.status,
    parentThreadId: parentThread.id,
    run: compactRun(run),
    ...(waitChildRuns.length > 1 ? { waitChildRuns: waitChildRuns.map(compactRun) } : {}),
    eventCount: events.length,
    mailboxEventCount: mailboxEvents.length,
    orchestrationStarted: Boolean(run.startedAt),
    waitSatisfied,
    waitTimedOut,
    waitSessionExpired,
    waitBarrierTerminalInspection,
    ...(waitOutcome ? { waitOutcome } : {}),
    turnBudgetState: compactSubagentTurnBudgetStateForPi(turnBudgetState),
    ...(turnBudgetExhaustionSettlement ? {
      turnBudgetExhaustionSettlement: compactSubagentTurnBudgetExhaustionSettlementRecord(turnBudgetExhaustionSettlement),
    } : {}),
    ...(turnBudgetWrapUpSteering ? {
      turnBudgetWrapUpSteering: compactSubagentTurnBudgetWrapUpSteeringRecord(turnBudgetWrapUpSteering),
    } : {}),
    ...(turnBudgetWrapUpDelivery ? {
      turnBudgetWrapUpDelivery: {
        accepted: turnBudgetWrapUpDelivery.accepted,
        run: compactRun(turnBudgetWrapUpDelivery.run),
        mailboxEvent: compactMailbox(turnBudgetWrapUpDelivery.mailboxEvent),
        ...(turnBudgetWrapUpDelivery.message ? { message: turnBudgetWrapUpDelivery.message } : {}),
      },
    } : {}),
    ...(waitNotice ? { waitNotice } : {}),
    synthesisAllowed: parentSynthesisAllowed,
    resultValidation,
    ...(waitBarrierEvaluation ? { waitBarrierEvaluation } : {}),
    ...(waitBarrierBlockers.length ? { waitBarrierBlockers } : {}),
    ...(resultValidation.structuredOutputValidation ? { structuredOutputValidation: resultValidation.structuredOutputValidation } : {}),
    ...(resultValidation.completionGuardValidation ? { completionGuardValidation: resultValidation.completionGuardValidation } : {}),
    ...(parentResolution ? { parentResolution } : {}),
    ...(waitBarrier ? { waitBarrier: compactWaitBarrier(waitBarrier) } : {}),
    ...(approvalRequestRecords.length ? {
      approvalRequestRecords: approvalRequestRecords.map((record) => ({
        schemaVersion: record.schemaVersion,
        replay: record.replay,
        idempotencyKey: record.idempotencyKey,
        ...(record.childMailboxEvent ? { childMailboxEvent: compactMailbox(record.childMailboxEvent) } : {}),
        ...(record.parentMailboxEvent ? { parentMailboxEvent: compactParentMailbox(record.parentMailboxEvent) } : {}),
        ...(record.runEvent ? { runEvent: compactEvent(record.runEvent) } : {}),
      })),
    } : {}),
    ...(supervisorRequestRecords.length ? {
      supervisorRequestRecords: supervisorRequestRecords.map((record) => ({
        schemaVersion: record.schemaVersion,
        replay: record.replay,
        idempotencyKey: record.idempotencyKey,
        kind: record.request.kind,
        title: previewText(record.request.title, 160),
        parentRequiresAttention: record.parentRequiresAttention,
        ...(record.childMailboxEvent ? { childMailboxEvent: compactMailbox(record.childMailboxEvent) } : {}),
        ...(record.parentMailboxEvent ? { parentMailboxEvent: compactParentMailbox(record.parentMailboxEvent) } : {}),
        ...(record.runEvent ? { runEvent: compactEvent(record.runEvent) } : {}),
      })),
    } : {}),
    ...(approvalResponseDeliveries.length ? {
      approvalResponseDeliveries: approvalResponseDeliveries.map((record) => ({
        accepted: record.accepted,
        run: compactRun(record.run),
        mailboxEvent: compactMailbox(record.mailboxEvent),
        ...(record.message ? { message: record.message } : {}),
      })),
    } : {}),
    ...(approvalResponsePendingEvents.length ? {
      approvalResponsePendingEvents: approvalResponsePendingEvents.map(compactMailbox),
    } : {}),
    ...(execution.waitChildRuns.length > 1 ? { waitChildRuns: execution.waitChildRuns.map(compactRun) } : {}),
    ...(groupedCompletionNotification ? { groupedCompletionNotification: compactParentMailbox(groupedCompletionNotification) } : {}),
    ...(waitBarrierAttentionParentMailbox ? { waitBarrierAttentionParentMailbox: compactParentMailbox(waitBarrierAttentionParentMailbox) } : {}),
    ...(waitCompletionMailbox ? { waitCompletionMailbox: compactMailbox(waitCompletionMailbox) } : {}),
  });
}

async function queueParentToChildMessage(
  options: CreateSubagentPiToolDefinitionsOptions,
  parentThread: ThreadSummary,
  input: Record<string, unknown>,
  action: SubagentChildMailboxAction,
  toolCallId: string,
  onUpdate: SubagentToolOnUpdate,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const run = resolveSubagentTargetRun({ store: options.store, parentThreadId: parentThread.id, request: input });
  assertSubagentRunOpenForAction(run, action);
  const supervisorRequest = resolveSupervisorRequestForSteering(options.store, run, input);
  const mailboxResult = await executeSubagentChildMailbox({
    store: options.store,
    runtime: options.runtime,
    run,
    action,
    message: requiredString(input, "message"),
    idempotencyKey: optionalString(input.idempotencyKey),
    toolCallId,
    ...(supervisorRequest ? { supervisorRequestParentMailboxEventId: supervisorRequest.event.id } : {}),
    ...(supervisorRequest?.choiceId ? { supervisorChoiceId: supervisorRequest.choiceId } : {}),
    createRuntimeFollowupEventEmitter: (childRun) =>
      createRuntimeEventEmitter(options.store, childRun, "followup_agent", onUpdate),
  });
  const supervisorRequestAcknowledgement = supervisorRequest
    ? consumeSupervisorRequestForSteering(options.store, supervisorRequest.event)
    : undefined;
  const { request } = mailboxResult;
  if (mailboxResult.replay && mailboxResult.runEvent) {
    return toolResult(buildSubagentChildMailboxReplayText({
      request,
      canonicalTaskPath: run.canonicalTaskPath,
    }), {
      runtime: SUBAGENT_RUNTIME,
      phase: SUBAGENT_PHASE,
      toolName: AMBIENT_SUBAGENT_TOOL_NAME,
      action,
      status: "idempotent_replay",
      run: compactRun(mailboxResult.run),
      event: compactEvent(mailboxResult.runEvent),
      ...(mailboxResult.mailboxEvent ? { mailboxEvent: compactMailbox(mailboxResult.mailboxEvent) } : {}),
      ...(supervisorRequestAcknowledgement ? {
        supervisorRequestAcknowledgement: compactParentMailbox(supervisorRequestAcknowledgement),
      } : {}),
      orchestrationStarted: Boolean(mailboxResult.run.startedAt),
    });
  }
  if (!mailboxResult.mailboxEvent || !mailboxResult.runEvent) {
    throw new Error("Sub-agent child mailbox executor did not return queued evidence.");
  }
  return toolResult(buildSubagentChildMailboxQueuedText({
    request,
    canonicalTaskPath: run.canonicalTaskPath,
    runtimeFollowup: mailboxResult.runtimeFollowup,
  }), {
    runtime: SUBAGENT_RUNTIME,
    phase: SUBAGENT_PHASE,
    toolName: AMBIENT_SUBAGENT_TOOL_NAME,
    action,
    status: "queued",
    run: compactRun(mailboxResult.run),
    mailboxEvent: compactSubagentChildMailboxEvent(mailboxResult.mailboxEvent),
    event: compactEvent(mailboxResult.runEvent),
    idempotencyKey: request.idempotencyKey,
    orchestrationStarted: Boolean(mailboxResult.run.startedAt),
    ...(supervisorRequestAcknowledgement ? {
      supervisorRequestAcknowledgement: compactParentMailbox(supervisorRequestAcknowledgement),
      ...(supervisorRequest?.choiceId ? { supervisorChoiceId: supervisorRequest.choiceId } : {}),
    } : {}),
    ...(mailboxResult.runtimeFollowup
      ? { runtimeFollowup: compactSubagentChildRuntimeFollowup(mailboxResult.runtimeFollowup, mailboxResult.mailboxEvent, compactRun) }
      : {}),
  });
}

function resolveSupervisorRequestForSteering(
  store: Pick<SubagentPiToolStore, "getSubagentParentMailboxEvent">,
  run: SubagentRunSummary,
  input: Record<string, unknown>,
): { event: SubagentParentMailboxEventSummary; choiceId?: string } | undefined {
  const eventId = optionalString(input.supervisorRequestParentMailboxEventId);
  const choiceId = optionalString(input.supervisorChoiceId);
  if (!eventId) {
    if (choiceId) throw new Error("supervisorChoiceId requires supervisorRequestParentMailboxEventId.");
    return undefined;
  }
  const event = store.getSubagentParentMailboxEvent(eventId);
  assertSupervisorRequestMatchesSteering(event, run, choiceId);
  return {
    event,
    ...(choiceId ? { choiceId } : {}),
  };
}

function assertSupervisorRequestMatchesSteering(
  event: SubagentParentMailboxEventSummary,
  run: SubagentRunSummary,
  choiceId?: string,
): void {
  if (event.type !== SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE) {
    throw new Error(`Sub-agent supervisor request ${event.id} has unexpected type ${event.type}.`);
  }
  if (event.parentRunId !== run.parentRunId || event.parentThreadId !== run.parentThreadId) {
    throw new Error(`Sub-agent supervisor request ${event.id} does not belong to parent run ${run.parentRunId}.`);
  }
  const payload = recordValue(event.payload);
  if (
    payload?.schemaVersion !== SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION ||
    optionalString(payload.childRunId) !== run.id ||
    optionalString(payload.childThreadId) !== run.childThreadId
  ) {
    throw new Error(`Sub-agent supervisor request ${event.id} does not belong to child run ${run.id}.`);
  }
  if (payload.parentRequiresAttention !== true) {
    throw new Error(`Sub-agent supervisor request ${event.id} does not require parent steering.`);
  }
  if (event.deliveryState !== "queued" && event.deliveryState !== "consumed") {
    throw new Error(`Sub-agent supervisor request ${event.id} is ${event.deliveryState} and cannot be answered.`);
  }
  if (choiceId) {
    const choices = arrayInput(payload.requestedChoices)
      .map((choice) => optionalString(recordValue(choice)?.id))
      .filter((id): id is string => Boolean(id));
    if (!choices.includes(choiceId)) {
      throw new Error(`Sub-agent supervisor request ${event.id} does not include choice ${choiceId}.`);
    }
  }
}

function consumeSupervisorRequestForSteering(
  store: Pick<SubagentPiToolStore, "updateSubagentParentMailboxEventDeliveryState">,
  event: SubagentParentMailboxEventSummary,
): SubagentParentMailboxEventSummary {
  if (event.deliveryState === "consumed") return event;
  const now = new Date().toISOString();
  return store.updateSubagentParentMailboxEventDeliveryState(event.id, "consumed", {
    now,
    deliveredAt: event.deliveredAt ?? now,
  });
}

function assertBarrierDecisionMatchesUserIntent(input: {
  decision: SubagentBarrierDecision;
  userDecision?: string;
}): void {
  if (input.decision !== "cancel_parent" || !input.userDecision) return;
  const normalized = input.userDecision.toLowerCase().replace(/\s+/g, " ").trim();
  const retryIntent = /\b(?:to|then|before|so\s+(?:i|we|the parent)\s+can|so\s+it\s+can)\s+(?:retry|try again|re-?run|re-?spawn|respawn|replace)\b/.test(normalized) ||
    /\b(?:retry|try again|re-?run|re-?spawn|respawn|replace)\b.{0,80}\b(?:different|new|alternate|another)\s+role\b/.test(normalized) ||
    /\b(?:different|new|alternate|another)\s+role\b.{0,80}\b(?:retry|try again|re-?run|re-?spawn|respawn|replace)\b/.test(normalized);
  if (!retryIntent) return;
  throw new Error(
    "cancel_parent is only for actually stopping the parent run. Use decision retry_child when the intent is to retry, rerun, replace, or try a different role before continuing.",
  );
}

async function resolveBarrierDecision(
  options: CreateSubagentPiToolDefinitionsOptions,
  parentThread: ThreadSummary,
  input: Record<string, unknown>,
  toolCallId: string,
  onUpdate: SubagentToolOnUpdate,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const barrier = resolveSubagentTargetWaitBarrier({ store: options.store, parentThreadId: parentThread.id, request: input });
  if (barrier.dependencyMode === "optional_background") {
    throw new Error(`Sub-agent wait barrier ${barrier.id} is optional background work and does not need a user resolution.`);
  }
  const decision = enumValue(input.decision, SUBAGENT_BARRIER_DECISIONS, "decision") as SubagentBarrierDecision;
  const userDecision = optionalString(input.userDecision);
  const partialSummary = optionalString(input.partialSummary);
  if (decision === "continue_with_partial") {
    if (!userDecision) throw new Error("userDecision is required when resolving a barrier with continue_with_partial.");
    if (!partialSummary) throw new Error("partialSummary is required when resolving a barrier with continue_with_partial.");
  }
  if ((decision === "detach_child" || decision === "cancel_parent") && !userDecision) {
    throw new Error(`userDecision is required when resolving a barrier with ${decision}.`);
  }
  assertBarrierDecisionMatchesUserIntent({ decision, userDecision });
  const payloadFingerprint = createSubagentPayloadFingerprint({
    waitBarrierId: barrier.id,
    decision,
    userDecision,
    partialSummary,
  });
  const idempotencyKey = optionalString(input.idempotencyKey) ??
    createSubagentIdempotencyKey({
      operation: "barrier-decision",
      parentRunId: barrier.parentRunId,
      payloadFingerprint,
    });
  const decisionResult = await executeSubagentBarrierDecision({
    store: options.store,
    runtime: options.runtime,
    barrier,
    decision,
    userDecision,
    partialSummary,
    idempotencyKey,
    toolCallId,
    createRuntimeCancelEventEmitter: (run) => createRuntimeEventEmitter(options.store, run, "cancel_agent", onUpdate),
    createRuntimeRetryEventEmitter: (run) => createRuntimeEventEmitter(options.store, run, "retry_child", onUpdate),
  });
  if (decisionResult.replay) {
    return toolResult(buildSubagentBarrierDecisionText({
      barrier: decisionResult.barrier,
      decision,
      replay: true,
    }), {
      runtime: SUBAGENT_RUNTIME,
      phase: SUBAGENT_PHASE,
      toolName: AMBIENT_SUBAGENT_TOOL_NAME,
      action: "resolve_barrier",
      status: "idempotent_replay",
      waitBarrier: compactWaitBarrier(decisionResult.barrier),
      parentResolution: decisionResult.parentResolution,
      parentMailboxEvent: compactParentMailbox(decisionResult.parentMailboxEvent),
      idempotencyKey,
    });
  }
  return toolResult(buildSubagentBarrierDecisionText({
    barrier: decisionResult.barrier,
    decision,
    replay: false,
  }), {
    runtime: SUBAGENT_RUNTIME,
    phase: SUBAGENT_PHASE,
    toolName: AMBIENT_SUBAGENT_TOOL_NAME,
    action: "resolve_barrier",
    status: decisionResult.barrier.status,
    parentThreadId: parentThread.id,
    parentRunId: barrier.parentRunId,
    waitBarrier: compactWaitBarrier(decisionResult.barrier),
    parentResolution: decisionResult.parentResolution,
    parentMailboxEvent: compactParentMailbox(decisionResult.parentMailboxEvent),
    idempotencyKey,
    resolutionArtifact: decisionResult.resolutionArtifact,
  });
}

async function cancelAgent(
  options: CreateSubagentPiToolDefinitionsOptions,
  parentThread: ThreadSummary,
  input: Record<string, unknown>,
  toolCallId: string,
  onUpdate: SubagentToolOnUpdate,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const run = resolveSubagentTargetRun({ store: options.store, parentThreadId: parentThread.id, request: input });
  if (run.closedAt) throw new Error(`Cannot cancel closed sub-agent ${run.id}; close already released capacity.`);
  const cancelResult = await executeSubagentCancelAgent({
    store: options.store,
    runtime: options.runtime,
    run,
    reason: optionalString(input.reason),
    idempotencyKey: optionalString(input.idempotencyKey),
    toolCallId,
    createRuntimeCancelEventEmitter: (targetRun) => createRuntimeEventEmitter(options.store, targetRun, "cancel_agent", onUpdate),
  });
  const { idempotencyKey } = cancelResult;
  if (cancelResult.replay) {
    const current = cancelResult.run;
    return toolResult(`Sub-agent ${current.canonicalTaskPath} is already cancelled.`, {
      runtime: SUBAGENT_RUNTIME,
      phase: SUBAGENT_PHASE,
      toolName: AMBIENT_SUBAGENT_TOOL_NAME,
      action: "cancel_agent",
      status: "idempotent_replay",
      run: compactRun(current),
      orchestrationStarted: Boolean(current.startedAt),
    });
  }
  const cancelled = cancelResult.run;
  return toolResult(`Cancelled sub-agent ${cancelled.canonicalTaskPath}.`, {
    runtime: SUBAGENT_RUNTIME,
    phase: SUBAGENT_PHASE,
    toolName: AMBIENT_SUBAGENT_TOOL_NAME,
    action: "cancel_agent",
    status: cancelled.status,
    run: compactRun(cancelled),
    idempotencyKey,
    orchestrationStarted: Boolean(cancelled.startedAt),
    waitBarriers: cancelResult.waitBarriers.map(compactWaitBarrier),
    ...(cancelResult.cancelledMailbox ? {
      cancelledMailboxEvents: cancelResult.cancelledMailbox.events.map(compactMailbox),
    } : {}),
  });
}

function closeAgent(
  options: CreateSubagentPiToolDefinitionsOptions,
  parentThread: ThreadSummary,
  input: Record<string, unknown>,
  toolCallId: string,
): AgentToolResult<Record<string, unknown>> {
  const run = resolveSubagentTargetRun({ store: options.store, parentThreadId: parentThread.id, request: input });
  assertCanCloseSubagentRun(run);
  const closeResult = executeSubagentCloseAgent({
    store: options.store,
    run,
    reason: optionalString(input.reason),
    idempotencyKey: optionalString(input.idempotencyKey),
    toolCallId,
  });
  const { idempotencyKey } = closeResult;
  if (closeResult.replay) {
    const current = closeResult.run;
    return toolResult(buildSubagentCloseAgentReplayText({ canonicalTaskPath: current.canonicalTaskPath }), {
      runtime: SUBAGENT_RUNTIME,
      phase: SUBAGENT_PHASE,
      toolName: AMBIENT_SUBAGENT_TOOL_NAME,
      action: "close_agent",
      status: "idempotent_replay",
      run: compactRun(current),
      orchestrationStarted: Boolean(current.startedAt),
    });
  }
  const closed = closeResult.run;
  return toolResult(buildSubagentCloseAgentResultText({ canonicalTaskPath: closed.canonicalTaskPath }), {
    runtime: SUBAGENT_RUNTIME,
    phase: SUBAGENT_PHASE,
    toolName: AMBIENT_SUBAGENT_TOOL_NAME,
    action: "close_agent",
    status: "closed",
    run: compactRun(closed),
    idempotencyKey,
    orchestrationStarted: Boolean(closed.startedAt),
  });
}

function subagentToolParameters(
  roleIds: readonly SubagentRoleId[] = DEFAULT_SUBAGENT_ROLE_IDS,
  options: { includeSymphonyLaunchContracts?: boolean } = {},
): Record<string, unknown> {
  const symphonyLaunchContractProperties = options.includeSymphonyLaunchContracts
    ? {
      symphonyMode: {
        type: "boolean",
        description: "Set true only for Symphony-managed child launches with a stored Symphony launch contract bundle.",
      },
      symphonyContractId: {
        type: "string",
        description: "Product-owned stored Symphony launch contract id. Ambient resolves this id to an immutable policy bundle before validating and launching the child.",
      },
    }
    : {};
  return {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: SUBAGENT_ACTIONS,
        description: "Sub-agent operation to perform.",
      },
      task: {
        type: "string",
        description: "Delegated task for spawn_agent. Keep it specific, bounded, and faithful to the parent objective.",
      },
      message: {
        type: "string",
        description: "Message or follow-up to queue for an existing child run.",
      },
      childRunId: {
        type: "string",
        description: "Stable sub-agent run id returned by spawn_agent.",
      },
      childRunIds: {
        type: "array",
        items: { type: "string" },
        description: "Stable sub-agent run ids for an aggregate wait_agent barrier.",
      },
      agentId: {
        type: "string",
        description: "Alias for childRunId, matching Codex-style agent handles.",
      },
      canonicalTaskPath: {
        type: "string",
        description: "Path-addressed child handle such as root/0:explorer.",
      },
      waitBarrierId: {
        type: "string",
        description: "Stable wait barrier id returned by wait_agent for resolve_barrier.",
      },
      decision: {
        type: "string",
        enum: SUBAGENT_BARRIER_DECISIONS,
        description: "User-approved decision for resolve_barrier: continue_with_partial, fail_parent, retry_child, detach_child, or cancel_parent. cancel_parent is final and must not be used when the intent is to retry, respawn, or continue the same parent objective.",
      },
      userDecision: {
        type: "string",
        description: "Short summary of the user's explicit decision for resolve_barrier. Required for continue_with_partial, detach_child, and cancel_parent. For cancel_parent, this must describe stopping/cancelling, not retrying or replacement work.",
      },
      partialSummary: {
        type: "string",
        description: "Parent-visible partial result summary to use only after explicit user approval. Required for continue_with_partial.",
      },
      roleId: {
        type: "string",
        enum: roleIds,
        description: "Role profile for a new child. Defaults to explorer. Use drafter for non-mutating copy/proposals/plans and worker only for isolated workspace mutations.",
      },
      effectiveRole: {
        type: "object",
        description: "Optional workflow role composition for spawn_agent. Ambient builds and persists a non-widening effective role snapshot from this contract.",
        properties: {
          patternRole: {
            type: "string",
            enum: SUBAGENT_PATTERN_ROLE_IDS,
            description: "The child's role inside a Symphony/workflow pattern, such as mapper, verifier, reducer, or arbiter.",
          },
          overlayLabels: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description: "Non-widening role overlays that narrow or structure this child within the selected base role.",
          },
          outputContract: {
            type: "string",
            description: "Optional child output contract for this effective role.",
          },
        },
        required: ["patternRole", "overlayLabels"],
        additionalProperties: false,
      },
      patternGraphBinding: {
        type: "object",
        description: "Optional runtime graph binding for spawn_agent. Use only when a Symphony/callable workflow launch provides a workflow task id and graph role node id.",
        properties: {
          workflowTaskId: {
            type: "string",
            description: "Callable workflow task id whose persisted PatternGraphSnapshot should bind this child.",
          },
          roleNodeId: {
            type: "string",
            description: "Role node id inside the task PatternGraphSnapshot, such as mapper, reducer, verifier, arbiter, proposer, or repair_worker.",
          },
          label: {
            type: "string",
            description: "Optional graph node label for this child. Defaults to the child thread/effective role label.",
          },
          approvalState: {
            type: "string",
            enum: ["none", "pending", "approved", "denied"],
            description: "Optional approval state to show on this graph node.",
          },
          blockingParent: {
            type: "boolean",
            description: "Whether this child node currently blocks the parent. Defaults from the child dependency mode.",
          },
        },
        required: ["workflowTaskId", "roleNodeId"],
        additionalProperties: false,
      },
      ...symphonyLaunchContractProperties,
      title: {
        type: "string",
        description: "Optional visible child-thread title. Ambient will choose a compact title when omitted.",
      },
      modelId: {
        type: "string",
        description: "Optional model preference. Must resolve to an available sub-agent-eligible model registry profile.",
      },
      dependencyMode: {
        type: "string",
        enum: SUBAGENT_SPAWN_PLANNER_DEPENDENCY_MODES,
        description: "Whether the parent needs this child before proceeding. Use required for pattern-critical child work; use optional_background only when the parent can safely ignore the result.",
      },
      waitBarrierMode: {
        type: "string",
        enum: SUBAGENT_WAIT_CONTEXT_BARRIER_MODES,
        description: "Aggregate wait_agent barrier mode for childRunIds: required_all, required_any, quorum, or optional_background.",
      },
      failurePolicy: {
        type: "string",
        enum: SUBAGENT_WAIT_CONTEXT_BARRIER_FAILURE_POLICIES,
        description: "Failure policy for a wait_agent barrier: fail_parent, ask_user, degrade_partial, or retry_child.",
      },
      quorumThreshold: {
        type: "integer",
        minimum: 1,
        description: "Explicit synthesis-safe child result count required when waitBarrierMode is quorum.",
      },
      forkMode: {
        type: "string",
        enum: SUBAGENT_SPAWN_PLANNER_FORK_MODES,
        description: "Requested parent-context fork mode for later child execution.",
      },
      promptMode: {
        type: "string",
        enum: SUBAGENT_SPAWN_PLANNER_PROMPT_MODES,
        description: "Requested prompt construction mode for later child execution.",
      },
      toolScope: {
        type: "object",
        properties: {
          requestedCategories: {
            type: "array",
            items: { type: "string", enum: SUBAGENT_TOOL_CATEGORIES.map((category) => category.id) },
            description: "Requested child tool categories. Ambient applies role/model/workspace policy before launch.",
          },
          builtInTools: {
            type: "array",
            items: toolSourceDescriptorSchema(),
            description: "Exact built-in child tools to resolve and snapshot. Each item must include id and categoryId.",
          },
          extensionLoads: {
            type: "array",
            items: toolSourceDescriptorSchema(),
            description: "Extension packages or bundles the child may load. Loaded extensions are not Pi-callable; use surfacedExtensionTools for exact callable tools.",
          },
          surfacedExtensionTools: {
            type: "array",
            items: toolSourceDescriptorSchema(),
            description: "Exact extension-provided callable tools to surface to the child session.",
          },
          directMcpTools: {
            type: "array",
            items: toolSourceDescriptorSchema(),
            description: "Exact direct MCP tools to allowlist for the child, using server/tool operation ids. Broad extension, connector, or wildcard grants are not enough.",
          },
          connectorTools: {
            type: "array",
            items: toolSourceDescriptorSchema(),
            description: "Exact connector/app tools to allowlist for the child, using connector.operation ids without exposing connector secrets.",
          },
          skills: {
            type: "array",
            items: toolSourceDescriptorSchema({ categoryRequired: false }),
            description: "Exact prompt skills to include as child context. Skills are not callable tools; piVisible true is denied.",
          },
          fanout: {
            type: "boolean",
            description: "Request constrained nested sub-agent fanout. Ambient denies this unless role and workspace policy both allow it.",
          },
          approvalMode: {
            type: "string",
            enum: ["interactive", "non_interactive"],
            description: "Optional launch approval mode. non_interactive narrows the child so approval-requiring capabilities fail before launch.",
          },
          childAuthority: {
            type: "object",
            description: "Optional least-privilege child authority request. Use this to state task intent and resource scope before launch; Ambient will persist and enforce/narrow the child profile.",
            properties: {
              taskIntent: {
                type: "string",
                enum: ["file_read", "analysis", "web_research", "mutation", "workflow", "connector", "custom"],
                description: "The narrow intent for this child. file_read limits visible defaults to workspace/artifact/long-context reads. web_research uses brokered web_research tools and excludes managed browser fallback unless browser authority is explicitly granted.",
              },
              rationale: {
                type: "string",
                description: "Short reason for the child authority profile, visible in diagnostics and exports.",
              },
              readRoots: {
                type: "array",
                items: { type: "string" },
                description: "Exact file paths or directory roots the child may read or summarize. Avoid broad roots when exact files are known.",
              },
              writeRoots: {
                type: "array",
                items: { type: "string" },
                description: "Exact write roots requested for this child. Read-only roles should omit this.",
              },
              browserDomains: {
                type: "array",
                items: { type: "string" },
                description: "Domains the child may access through browser tools when browser read/interactive categories are also allowed.",
              },
              connectorMethods: {
                type: "array",
                items: { type: "string" },
                description: "Exact connector.operation methods requested for this child without secrets.",
              },
              network: {
                type: "string",
                enum: ["allow", "ask_parent", "deny"],
                description: "Network decision for this child.",
              },
              mutation: {
                type: "string",
                enum: ["allow", "ask_parent", "deny", "allow_isolated_worktree"],
                description: "Mutation decision for this child. Use deny for read-only/file-read children.",
              },
              nestedFanout: {
                type: "string",
                enum: ["allow", "ask_parent", "deny"],
                description: "Nested fanout decision for this child. Defaults deny unless role/workflow policy enables it.",
              },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      retentionPolicy: {
        type: "string",
        enum: ["transient", "keep_until_parent_pruned", "pinned"],
        description: "Requested retention policy. Phase 2 records the request in run events; cleanup jobs are introduced later.",
      },
      idempotencyKey: {
        type: "string",
        description: "Stable key for retries of spawn, followup, wait, close, or cancel.",
      },
      reason: {
        type: "string",
        description: "Human-readable reason for cancel_agent or close_agent.",
      },
      supervisorRequestParentMailboxEventId: {
        type: "string",
        description: "Parent mailbox event id from wait_agent supervisorRequestRecords[].parentMailboxEvent.id when this send/followup answers a child supervisor request.",
      },
      supervisorChoiceId: {
        type: "string",
        description: "Optional choice id selected from a child supervisor request. Requires supervisorRequestParentMailboxEventId.",
      },
      wait: {
        type: "object",
        properties: {
          timeoutMs: { type: "integer", minimum: 0 },
        },
        additionalProperties: false,
      },
    },
    required: ["action"],
    additionalProperties: false,
  };
}

function toolSourceDescriptorSchema(options: { categoryRequired?: boolean } = {}): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Exact tool, extension, connector, MCP, or skill id.",
      },
      categoryId: {
        type: "string",
        enum: SUBAGENT_TOOL_CATEGORIES.map((category) => category.id),
        description: "Broad tool category Ambient uses for role/model/workspace policy.",
      },
      piVisible: {
        type: "boolean",
        description: "Whether this exact item should be visible as a Pi-callable child tool after policy checks. Non-callable source types deny piVisible true.",
      },
    },
    required: options.categoryRequired === false ? ["id"] : ["id", "categoryId"],
    additionalProperties: false,
  };
}

function validateSubagentModelScope(modelScope: SubagentModelScopeResolution): void {
  if (modelScope.blockingReasons.length === 0) return;
  throw new Error(`Selected model is not eligible for sub-agent runs (${modelScope.selectedModelId}): ${modelScope.blockingReasons.join("; ")}`);
}

function assertSpawnPatternGraphBindingReady(
  options: CreateSubagentPiToolDefinitionsOptions,
  parentThread: ThreadSummary,
  parentRun: SubagentPiToolParentRun,
  binding: SubagentSpawnPatternGraphBinding | undefined,
): void {
  if (!binding) return;
  if (!options.store.getCallableWorkflowTask || !options.store.bindCallableWorkflowTaskPatternGraphChild) {
    throw new Error("patternGraphBinding requires a callable workflow task store with graph binding support.");
  }
  const task = options.store.getCallableWorkflowTask(binding.workflowTaskId);
  assertCallableWorkflowPatternGraphCanBind({
    task,
    parentThreadId: parentThread.id,
    parentRunId: parentRun.id,
    roleNodeId: binding.roleNodeId,
  });
}

function bindSpawnPatternGraphChild(
  options: CreateSubagentPiToolDefinitionsOptions,
  binding: SubagentSpawnPatternGraphBinding | undefined,
  run: SubagentRunSummary,
): CallableWorkflowTaskSummary | undefined {
  if (!binding) return undefined;
  if (!options.store.bindCallableWorkflowTaskPatternGraphChild) {
    throw new Error("patternGraphBinding requires a callable workflow task store with graph binding support.");
  }
  return options.store.bindCallableWorkflowTaskPatternGraphChild({
    workflowTaskId: binding.workflowTaskId,
    roleNodeId: binding.roleNodeId,
    childRunId: run.id,
    ...(binding.label ? { label: binding.label } : {}),
    ...(binding.approvalState ? { approvalState: binding.approvalState } : {}),
    ...(binding.blockingParent !== undefined ? { blockingParent: binding.blockingParent } : {}),
  });
}

function compactPatternGraphBinding(
  task: CallableWorkflowTaskSummary,
  binding: SubagentSpawnPatternGraphBinding,
  run: SubagentRunSummary,
): Record<string, unknown> {
  const snapshot = task.patternGraphSnapshot;
  return {
    workflowTaskId: task.id,
    roleNodeId: binding.roleNodeId,
    childRunId: run.id,
    childThreadId: run.childThreadId,
    ...(snapshot ? {
      patternId: snapshot.patternId,
      updatedAt: snapshot.updatedAt,
      nodeCount: snapshot.nodes.length,
      edgeCount: snapshot.edges.length,
    } : {}),
  };
}

function resolveWaitContext(
  options: CreateSubagentPiToolDefinitionsOptions,
  parentThread: ThreadSummary,
  input: Record<string, unknown>,
): SubagentWaitContext {
  return resolveSubagentWaitContext({
    store: options.store,
    parentThread,
    request: input,
    trustedWaitBarrierOwner: options.trustedWaitBarrierOwner,
    timeoutMs: resolveSubagentPiToolWaitTimeoutMs(input),
    resolveTimeoutMs: (waitBarrierMode) => resolveSubagentPiToolWaitTimeoutMs(input, { waitBarrierMode }),
    resolveTargetRun: (request) => resolveSubagentTargetRun({ store: options.store, parentThreadId: parentThread.id, request }),
    resolveTargetWaitBarrier: (request) => resolveSubagentTargetWaitBarrier({ store: options.store, parentThreadId: parentThread.id, request }),
  });
}

function createRuntimeEventEmitter(
  store: SubagentPiToolStore,
  run: SubagentRunSummary,
  source: SubagentRuntimeEventSource,
  onUpdate: SubagentToolOnUpdate,
): SubagentRuntimeEventEmitter {
  return (eventInput) => {
    const { runtimeEvent, runEvent } = appendMappedSubagentRuntimeEvent(store, {
      run,
      source,
      event: eventInput,
    });
    try {
      const updateResult = onUpdate?.({
        content: [{ type: "text", text: piChildRuntimeEventUpdateText(runtimeEvent) }],
        details: piChildRuntimeEventUpdateDetails({
          runtime: SUBAGENT_RUNTIME,
          phase: SUBAGENT_PHASE,
          toolName: AMBIENT_SUBAGENT_TOOL_NAME,
          action: source,
        }, run, runtimeEvent, compactRun(run)),
      });
      if (updateResult && typeof (updateResult as Promise<unknown>).catch === "function") {
        void (updateResult as Promise<unknown>).catch((error) => {
          console.warn(`Sub-agent runtime update could not be delivered to Pi: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    } catch (error) {
      console.warn(`Sub-agent runtime update could not be delivered to Pi: ${error instanceof Error ? error.message : String(error)}`);
    }
    return runEvent;
  };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayInput(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function findRunByIdempotencyKey(
  store: SubagentPiToolStore,
  parentThreadId: string,
  eventType: string,
  idempotencyKey: string,
): SubagentRunSummary | undefined {
  for (const run of store.listSubagentRunsForParentThread(parentThreadId)) {
    if (findSubagentRunEventByIdempotencyKey(
      store.listSubagentRunEvents(run.id),
      eventType,
      idempotencyKey,
    )) return run;
  }
  return undefined;
}
