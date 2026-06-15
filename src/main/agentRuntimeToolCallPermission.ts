import type {
  DesktopEvent,
  PermissionPromptResolution,
  PermissionPromptResponseMode,
  PermissionRequest,
  PermissionRisk,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import {
  formatInstallRouteGateBlockedMessage,
  formatMcpInstallShellBlockedMessage,
  type InstallRouteGateBlock,
  type McpInstallShellBlock,
} from "./agentRuntimeInstallRouteGuard";
import {
  formatPermissionBlockedMessage,
  formatPermissionDeniedToolResultReason,
  fullAccessAllowedToolAudit,
} from "./agentRuntimePermissionMessages";
import {
  classifyToolPermission,
  shellCommandAuditReason,
} from "./permissionPolicy";
import { resolvePermissionWithGrants } from "./permissionGrants";
import type { ProjectStore } from "./projectStore";
import { classifySubagentBrowserToolAuthority } from "./subagentBrowserAuthority";
import { SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES } from "./subagentWaitBarrierEvaluation";
import { evaluateSubagentWaitBarrierForStore } from "./subagentWaitBarrierResolution";

export type AgentRuntimeToolCallPermissionBlock = { reason: string };

const AMBIENT_SUBAGENT_TOOL_NAME = "ambient_subagent";
const SUBAGENT_BARRIER_MANAGEMENT_ACTIONS = new Set([
  "list_agents",
  "status_agent",
  "wait_agent",
  "send_agent",
  "followup_agent",
  "resolve_barrier",
]);

interface SubagentBarrierToolBlockStore {
  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[];
  getSubagentRun(runId: string): SubagentRunSummary;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
}

export interface SubagentUnsafeBarrierToolBlock {
  reason: string;
  message: string;
  barrier: SubagentWaitBarrierSummary;
  childFacts: string[];
  allowedActions: string[];
}

interface RuntimePermissionWaitStart {
  toolName: string;
  requestId?: string;
  title?: string;
  detail?: string;
  risk?: PermissionRisk;
}

interface RuntimePermissionWaitFinish {
  allowed?: boolean;
  mode?: PermissionPromptResponseMode;
  error?: string;
}

export interface AgentRuntimeToolCallPermissionOptions {
  store: ProjectStore;
  installRouteGateBlockForTool: (threadId: string, toolName: string) => InstallRouteGateBlock | undefined;
  mcpInstallShellBlockForTool: (input: {
    threadId: string;
    toolName: string;
    rawToolInput: unknown;
    latestUserText: string;
  }) => McpInstallShellBlock | undefined;
  permissionToolInput: (toolName: string, toolInput: unknown, workspace: WorkspaceState) => Promise<unknown>;
  requestPermission: (
    request: Omit<PermissionRequest, "id">,
    options?: { onRequest?: (request: PermissionRequest) => void },
  ) => Promise<PermissionPromptResolution>;
  beginPermissionWait: (
    threadId: string,
    input: RuntimePermissionWaitStart,
  ) => ((finish?: RuntimePermissionWaitFinish) => void) | undefined;
  activeRunId: (threadId: string) => string | undefined;
  recordTransientFileAuthorityForAllowedTool: (
    threadId: string,
    workspace: WorkspaceState,
    toolName: string,
    toolInput: unknown,
    reason: string,
  ) => Promise<void>;
  recordTransientFileAuthorityFromPermissionRequest: (
    threadId: string,
    thread: ThreadSummary,
    request: Omit<PermissionRequest, "id">,
    reason: string,
  ) => void;
  emit: (event: DesktopEvent) => void;
}

export async function resolveAgentRuntimeToolCallPermission(
  threadId: string,
  workspace: WorkspaceState,
  toolName: string,
  rawToolInput: unknown,
  options: AgentRuntimeToolCallPermissionOptions,
): Promise<AgentRuntimeToolCallPermissionBlock | undefined> {
  const thread = options.store.getThread(threadId);
  const permissionToolName = toolName;
  const permissionInput = rawToolInput;
  const activeRunId = () => options.activeRunId(threadId);
  const installRouteGateBlock = options.installRouteGateBlockForTool(threadId, permissionToolName);
  if (installRouteGateBlock) {
    const blockedMessage = options.store.addMessage({
      threadId,
      role: "tool",
      content: formatInstallRouteGateBlockedMessage(permissionToolName, installRouteGateBlock.detail),
      metadata: {
        status: "error",
        runtime: "ambient-install-route-gate",
        toolName: permissionToolName,
        runId: activeRunId(),
        lane: installRouteGateBlock.gate.lane,
        blockers: installRouteGateBlock.gate.blockers,
        validationTarget: installRouteGateBlock.gate.validationTarget,
        createdAt: installRouteGateBlock.gate.createdAt,
      },
    });
    options.emit({ type: "message-created", message: blockedMessage });
    return { reason: installRouteGateBlock.reason };
  }

  const latestUserText = options.store
    .listMessages(threadId)
    .filter((message) => message.role === "user")
    .at(-1)?.content ?? "";
  const mcpInstallShellBlock = options.mcpInstallShellBlockForTool({
    threadId,
    toolName: permissionToolName,
    rawToolInput: permissionInput,
    latestUserText,
  });
  if (mcpInstallShellBlock) {
    const blockedMessage = options.store.addMessage({
      threadId,
      role: "tool",
      content: formatMcpInstallShellBlockedMessage(permissionToolName, mcpInstallShellBlock.detail),
      metadata: {
        status: "error",
        runtime: "ambient-mcp-install-shell-guard",
        toolName: permissionToolName,
        runId: activeRunId(),
      },
    });
    options.emit({ type: "message-created", message: blockedMessage });
    return { reason: mcpInstallShellBlock.reason };
  }

  const subagentBarrierToolBlock = subagentUnsafeRequiredBarrierToolBlock({
    store: options.store,
    threadId,
    parentRunId: activeRunId(),
    toolName: permissionToolName,
    rawToolInput: permissionInput,
  });
  if (subagentBarrierToolBlock) {
    const blockedMessage = options.store.addMessage({
      threadId,
      role: "tool",
      content: subagentBarrierToolBlock.message,
      metadata: {
        status: "error",
        runtime: "ambient-subagent-barrier-policy",
        toolName: permissionToolName,
        runId: activeRunId(),
        waitBarrierId: subagentBarrierToolBlock.barrier.id,
        childRunIds: subagentBarrierToolBlock.barrier.childRunIds,
      },
    });
    options.emit({ type: "message-created", message: blockedMessage });
    return { reason: subagentBarrierToolBlock.reason };
  }

  const toolInput = await options.permissionToolInput(permissionToolName, permissionInput, workspace);
  const childBrowserAuthorityDecision = classifySubagentBrowserToolAuthority({
    thread,
    toolName: permissionToolName,
    toolInput,
    snapshots: thread.kind === "subagent_child" && thread.subagentRunId
      ? options.store.listSubagentToolScopeSnapshots(thread.subagentRunId)
      : [],
  });
  const decision = childBrowserAuthorityDecision ?? await classifyToolPermission({
    threadId,
    permissionMode: thread.permissionMode,
    collaborationMode: thread.collaborationMode,
    workspacePath: workspace.path,
    projectPath: options.store.getProjectArtifactWorkspacePath(),
    readOnlyAllowedPaths: options.store.getProjectBoardDependencyWorkspacePathsForExecutionThread(threadId),
    toolName: permissionToolName,
    toolInput,
  });
  if (decision.action === "allow") {
    if (thread.permissionMode === "full-access") {
      await options.recordTransientFileAuthorityForAllowedTool(
        threadId,
        workspace,
        permissionToolName,
        toolInput,
        "Allowed by Power User full-access mode for this tool call.",
      );
    }
    const fullAccessAudit = thread.permissionMode === "full-access"
      ? fullAccessAllowedToolAudit(permissionToolName, permissionInput)
      : undefined;
    if (fullAccessAudit) {
      const auditEntry = options.store.addPermissionAudit({
        runId: activeRunId(),
        threadId,
        permissionMode: thread.permissionMode,
        toolName: permissionToolName,
        risk: fullAccessAudit.risk,
        decision: "allowed",
        detail: fullAccessAudit.detail,
        reason: fullAccessAudit.reason,
        decisionSource: "allowed_by_full_access",
      });
      options.emit({ type: "permission-audit-created", entry: auditEntry });
    } else if (thread.permissionMode === "workspace" && permissionToolName === "bash") {
      const command =
        permissionInput && typeof permissionInput === "object" && typeof (permissionInput as Record<string, unknown>).command === "string"
          ? String((permissionInput as Record<string, unknown>).command)
          : undefined;
      const auditEntry = options.store.addPermissionAudit({
        runId: activeRunId(),
        threadId,
        permissionMode: thread.permissionMode,
        toolName: permissionToolName,
        risk: "workspace-command",
        decision: "allowed",
        detail: command,
        reason: shellCommandAuditReason(command),
      });
      options.emit({ type: "permission-audit-created", entry: auditEntry });
    }
    return undefined;
  }

  if (decision.action === "deny") {
    const auditEntry = options.store.addPermissionAudit({
      runId: activeRunId(),
      threadId,
      permissionMode: thread.permissionMode,
      toolName: permissionToolName,
      risk: decision.request.risk,
      decision: "denied",
      detail: decision.request.detail,
      reason: decision.reason,
    });
    options.emit({ type: "permission-audit-created", entry: auditEntry });
    const blockedMessage = options.store.addMessage({
      threadId,
      role: "tool",
      content: formatPermissionBlockedMessage(permissionToolName, decision.request.detail),
      metadata: {
        status: "error",
        runtime: "permission-policy",
        toolName: permissionToolName,
        runId: activeRunId(),
        risk: decision.request.risk,
        collaborationMode: thread.collaborationMode,
      },
    });
    options.emit({ type: "message-created", message: blockedMessage });
    return { reason: decision.reason };
  }

  const permission = await resolvePermissionWithGrants({
    store: options.store,
    requester: {
      request: async (requestInput: Omit<PermissionRequest, "id">) => {
        let finishPermissionWait: ((finish?: RuntimePermissionWaitFinish) => void) | undefined;
        const beginWait = (createdRequest?: PermissionRequest) => {
          if (finishPermissionWait) return;
          finishPermissionWait = options.beginPermissionWait(threadId, {
            toolName: permissionToolName,
            requestId: createdRequest?.id,
            title: createdRequest?.title ?? requestInput.title,
            detail: createdRequest?.detail ?? requestInput.detail,
            risk: createdRequest?.risk ?? requestInput.risk,
          });
        };
        try {
          const responsePromise = options.requestPermission(requestInput, {
            onRequest: (createdRequest) => {
              beginWait(createdRequest);
            },
          });
          beginWait();
          const response = await responsePromise;
          finishPermissionWait?.({ allowed: response.allowed, mode: response.mode });
          return response;
        } catch (error) {
          finishPermissionWait?.({ error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      },
    },
    request: decision.request,
    context: {
      permissionMode: thread.permissionMode,
      threadId,
      projectPath: options.store.getWorkspace().path,
      workspacePath: workspace.path,
    },
  });
  const auditEntry = options.store.addPermissionAudit({
    runId: activeRunId(),
    threadId,
    permissionMode: thread.permissionMode,
    toolName: permissionToolName,
    risk: decision.request.risk,
    decision: permission.allowed ? "allowed" : "denied",
    detail: decision.request.detail,
    reason: permission.allowed ? "Approved by Ambient permission grant policy." : "Denied by user or timed out.",
    decisionSource: permission.decisionSource,
    grantId: permission.grant?.id,
  });
  options.emit({ type: "permission-audit-created", entry: auditEntry });
  if (permission.grant && permission.decisionSource !== "persistent_grant") {
    options.emit({ type: "permission-grant-created", grant: permission.grant });
  }
  if (permission.allowed) {
    options.recordTransientFileAuthorityFromPermissionRequest(
      threadId,
      thread,
      decision.request,
      permission.decisionSource === "persistent_grant"
        ? "Allowed by matching persistent permission grant."
        : "Allowed by Ambient permission broker for this tool call.",
    );
  }
  if (!permission.allowed) {
    const deniedReason = formatPermissionDeniedToolResultReason(permissionToolName, decision.request);
    const blockedMessage = options.store.addMessage({
      threadId,
      role: "tool",
      content: formatPermissionBlockedMessage(permissionToolName, decision.request.detail),
      metadata: {
        status: "error",
        runtime: "permission-policy",
        toolName: permissionToolName,
        runId: activeRunId(),
        risk: decision.request.risk,
      },
    });
    options.emit({ type: "message-created", message: blockedMessage });
    return { reason: deniedReason };
  }
  return undefined;
}

export function subagentUnsafeRequiredBarrierToolBlock(input: {
  store: SubagentBarrierToolBlockStore;
  threadId: string;
  parentRunId?: string;
  toolName: string;
  rawToolInput: unknown;
}): SubagentUnsafeBarrierToolBlock | undefined {
  if (!input.parentRunId) return undefined;
  if (typeof input.store.listSubagentWaitBarriersForParentRun !== "function") return undefined;
  const barrier = input.store
    .listSubagentWaitBarriersForParentRun(input.parentRunId)
    .find((candidate) =>
      candidate.parentThreadId === input.threadId &&
      candidate.dependencyMode !== "optional_background" &&
      candidate.status !== "satisfied" &&
      isUnsafeRequiredSubagentWaitBarrier(input.store, candidate));
  if (!barrier) return undefined;
  const allowedActions = [...SUBAGENT_BARRIER_MANAGEMENT_ACTIONS];
  if (isAllowedSubagentBarrierManagementTool(input.toolName, input.rawToolInput)) return undefined;
  const childFacts = barrier.childRunIds.map((childRunId) => childFact(input.store, childRunId));
  const attemptedAction = subagentToolAction(input.rawToolInput);
  const reason = [
    `Tool ${input.toolName}${attemptedAction ? ` action ${attemptedAction}` : ""} is blocked by required sub-agent wait barrier ${barrier.id}.`,
    "Resolve the unsafe child barrier before using ordinary parent tools or spawning replacement work.",
  ].join(" ");
  return {
    reason,
    message: [
      "Parent tool call blocked by required sub-agent work that is not safe for synthesis.",
      `Blocked tool: ${input.toolName}${attemptedAction ? ` action=${attemptedAction}` : ""}`,
      `waitBarrierId: ${barrier.id}`,
      `waitBarrierStatus: ${barrier.status}`,
      `waitBarrierDependencyMode: ${barrier.dependencyMode}`,
      `waitBarrierFailurePolicy: ${barrier.failurePolicy}`,
      `Child runs: ${childFacts.join(", ")}.`,
      "Do not use failed, timed-out, cancelled, or otherwise unsafe child output as evidence.",
      `Allowed next actions: use ${AMBIENT_SUBAGENT_TOOL_NAME} with one of ${allowedActions.join(", ")}; for retry, call resolve_barrier with decision retry_child before continuing.`,
    ].join("\n"),
    barrier,
    childFacts,
    allowedActions,
  };
}

function isUnsafeRequiredSubagentWaitBarrier(
  store: SubagentBarrierToolBlockStore,
  barrier: SubagentWaitBarrierSummary,
): boolean {
  if (barrier.status !== "waiting_on_children") return true;
  const childRuns: SubagentRunSummary[] = [];
  for (const childRunId of barrier.childRunIds) {
    try {
      childRuns.push(store.getSubagentRun(childRunId));
    } catch {
      return true;
    }
  }
  if (childRuns.length > 0 && childRuns.every((run) => !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(run.status))) {
    return false;
  }
  try {
    const evaluation = evaluateSubagentWaitBarrierForStore({
      store,
      waitBarrier: barrier,
      timedOut: false,
    });
    return !evaluation.synthesisAllowed &&
      (evaluation.impossible || evaluation.terminalUnsafeChildRunIds.length > 0);
  } catch {
    return true;
  }
}

function isAllowedSubagentBarrierManagementTool(toolName: string, rawToolInput: unknown): boolean {
  if (toolName !== AMBIENT_SUBAGENT_TOOL_NAME) return false;
  const action = subagentToolAction(rawToolInput);
  return Boolean(action && SUBAGENT_BARRIER_MANAGEMENT_ACTIONS.has(action));
}

function subagentToolAction(rawToolInput: unknown): string | undefined {
  const record = rawToolInput && typeof rawToolInput === "object" && !Array.isArray(rawToolInput)
    ? rawToolInput as Record<string, unknown>
    : undefined;
  const action = record?.action;
  return typeof action === "string" && action.trim() ? action.trim() : undefined;
}

function childFact(store: SubagentBarrierToolBlockStore, childRunId: string): string {
  try {
    const run = store.getSubagentRun(childRunId);
    return `${run.id} (${run.status})`;
  } catch {
    return `${childRunId} (missing)`;
  }
}
