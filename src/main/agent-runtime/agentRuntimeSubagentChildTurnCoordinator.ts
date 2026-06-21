import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import {
  classifySubagentAssistantResult,
  subagentTranscriptPath,
} from "./agentRuntimeSubagentsFacade";
import {
  latestSubagentAssistantResultMessageForThread,
  normalizedSubagentRuntimeTextLength,
  previewForSubagentRuntime,
} from "./subagents/agentRuntimeSubagentRuntimeHelpers";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { SubagentRuntimeEventEmitter } from "./agentRuntimePiFacade";
import {
  normalizeWorkspaceArtifactPath,
} from "./agentRuntimeMediaArtifacts";
import {
  subagentMutationCategoryForChildTool,
  subagentToolInputPathFromMessage,
} from "./tools/agentRuntimeToolTranscript";
import {
  stringMetadata,
} from "./tools/agentRuntimeToolMessageMetadata";

const MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS = 3;

export type SubagentChildTurnCompletion =
  | { status: "terminal" }
  | { status: "needs_followup"; message: string; reason: string; followupKind: "post_tool" | "result_contract" };

type AgentRuntimeSubagentChildTurnStore = Pick<
  ProjectStore,
  | "appendSubagentMailboxEvent"
  | "appendSubagentRunEvent"
  | "getSubagentRun"
  | "getThread"
  | "listMessages"
  | "listPermissionAudit"
  | "markSubagentRunStatus"
  | "upsertSubagentGroupedCompletionNotification"
>;

export interface AgentRuntimeSubagentChildTurnCoordinatorOptions {
  store: AgentRuntimeSubagentChildTurnStore;
  resolveTerminalChildWaitBarriers: (run: SubagentRunSummary, reason: string) => void;
}

export class AgentRuntimeSubagentChildTurnCoordinator {
  constructor(private readonly options: AgentRuntimeSubagentChildTurnCoordinatorOptions) {}

  recordFollowupExhausted(input: {
    run: SubagentRunSummary;
    completion: Extract<SubagentChildTurnCompletion, { status: "needs_followup" }>;
  }): void {
    const preview = {
      reason: input.completion.reason,
      followupKind: input.completion.followupKind,
      maxAttempts: MAX_SUBAGENT_POST_TOOL_FINALIZATION_FOLLOWUPS,
      terminalStatus: "failed",
    };
    this.options.store.appendSubagentRunEvent(input.run.id, {
      type: input.completion.followupKind === "result_contract"
        ? "subagent.result_contract_repair_exhausted"
        : "subagent.post_tool_followup_exhausted",
      preview,
    });
  }

  completeTurnAfterSend(input: {
    run: SubagentRunSummary;
    role: SubagentRunSummary["roleProfileSnapshot"];
    childMessageCountBeforeSend: number;
    emitEvent: SubagentRuntimeEventEmitter;
  }): SubagentChildTurnCompletion {
    const latest = this.options.store.getSubagentRun(input.run.id);
    if (latest.status === "cancelled" || latest.status === "stopped") return { status: "terminal" };
    const childMessages = this.options.store.listMessages(input.run.childThreadId);
    const sendMessages = childMessages.slice(input.childMessageCountBeforeSend);
    this.recordToolRuntimeEvents({
      childThread: this.options.store.getThread(input.run.childThreadId),
      messages: sendMessages,
      emitEvent: input.emitEvent,
    });
    const postToolFollowup = subagentPostToolFollowupRequest(sendMessages, input.role);
    if (postToolFollowup) {
      input.emitEvent({
        type: "status",
        source: "child_runtime",
        status: "running",
        message: postToolFollowup.reason,
      });
      this.options.store.appendSubagentRunEvent(input.run.id, {
        type: "subagent.post_tool_followup_required",
        preview: {
          reason: postToolFollowup.reason,
          childThreadId: input.run.childThreadId,
        },
      });
      return {
        status: "needs_followup",
        reason: postToolFollowup.reason,
        message: postToolFollowup.message,
        followupKind: "post_tool",
      };
    }
    const latestAssistantMessage =
      latestSubagentAssistantResultMessageForThread(sendMessages) ??
      latestAssistantMessageAfterLastToolForMessages(sendMessages);
    const assistantStatus = latestAssistantMessage?.metadata?.status;
    if (assistantStatus === "error" || assistantStatus === "aborted") {
      throw new Error(latestAssistantMessage?.content.trim() || `Child run ended with assistant status ${assistantStatus}.`);
    }
    const assistantText = latestAssistantMessage?.content ?? "";
    if (assistantText.trim()) {
      const assistantTextArtifactPath = normalizedSubagentRuntimeTextLength(assistantText) > 1200
        ? subagentTranscriptPath(input.run.childThreadId)
        : undefined;
      input.emitEvent({
        type: "assistant_delta",
        source: "child_runtime",
        textPreview: assistantText,
        ...(assistantTextArtifactPath ? { artifactPath: assistantTextArtifactPath } : {}),
      });
    }
    const disposition = classifySubagentAssistantResult(assistantText, input.role);
    const resultContractFollowup = subagentResultContractFollowupRequest(disposition, input.role, assistantText);
    if (resultContractFollowup) {
      input.emitEvent({
        type: "status",
        source: "child_runtime",
        status: "running",
        message: resultContractFollowup.reason,
      });
      this.options.store.appendSubagentRunEvent(input.run.id, {
        type: "subagent.result_contract_followup_required",
        preview: {
          reason: resultContractFollowup.reason,
          childThreadId: input.run.childThreadId,
          hadAssistantText: assistantText.trim().length > 0,
        },
      });
      return {
        status: "needs_followup",
        reason: resultContractFollowup.reason,
        message: resultContractFollowup.message,
        followupKind: "result_contract",
      };
    }
    if (disposition.status === "needs_attention") {
      const needsAttention = this.options.store.markSubagentRunStatus(input.run.id, "needs_attention");
      input.emitEvent({
        type: "status",
        source: "child_runtime",
        status: "needs_attention",
        message: previewForSubagentRuntime(disposition.summary, 600),
      });
      this.options.store.appendSubagentMailboxEvent(needsAttention.id, {
        direction: "child_to_parent",
        type: "subagent.needs_attention",
        payload: {
          status: "needs_attention",
          summary: disposition.summary,
          childThreadId: needsAttention.childThreadId,
          ...(disposition.structuredOutput ? { structuredOutput: disposition.structuredOutput } : {}),
        },
      });
      this.options.store.appendSubagentRunEvent(needsAttention.id, {
        type: "subagent.needs_attention",
        preview: {
          status: "needs_attention",
          summaryPreview: previewForSubagentRuntime(disposition.summary, 500),
          structuredOutputValid: Boolean(disposition.structuredOutput),
        },
      });
      return { status: "terminal" };
    }
    const result = this.options.store.markSubagentRunStatus(input.run.id, disposition.status, {
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: input.run.id,
        status: disposition.status,
        partial: disposition.partial,
        summary: disposition.summary,
        childThreadId: input.run.childThreadId,
        ...(disposition.structuredOutput ? { structuredOutput: disposition.structuredOutput } : {}),
        ...(disposition.reason ? { guardReason: disposition.reason } : {}),
        ...(disposition.explicitStatus ? { explicitStatus: disposition.explicitStatus } : {}),
      },
    });
    input.emitEvent({
      type: result.status === "failed" ? "error" : "completed",
      source: "child_runtime",
      status: result.status,
      message: previewForSubagentRuntime(disposition.summary, 600),
    });
    this.options.store.appendSubagentMailboxEvent(result.id, {
      direction: "child_to_parent",
      type: disposition.status === "failed" ? "subagent.failed" : "subagent.result",
      payload: {
        status: disposition.status,
        partial: disposition.partial,
        summary: disposition.summary,
        childThreadId: result.childThreadId,
        ...(disposition.structuredOutput ? { structuredOutput: disposition.structuredOutput } : {}),
        ...(disposition.reason ? { guardReason: disposition.reason } : {}),
      },
    });
    this.options.store.appendSubagentRunEvent(result.id, {
      type: disposition.status === "failed" ? "subagent.result_failed" : "subagent.result_ready",
      preview: {
        status: disposition.status,
        partial: disposition.partial,
        summaryPreview: previewForSubagentRuntime(disposition.summary, 500),
        structuredOutputValid: Boolean(disposition.structuredOutput),
        ...(disposition.reason ? { guardReason: disposition.reason } : {}),
      },
    });
    this.recordGroupedCompletionIfNeeded(result, disposition.summary);
    this.options.resolveTerminalChildWaitBarriers(result, disposition.status);
    return { status: "terminal" };
  }

  recordGroupedCompletionIfNeeded(run: SubagentRunSummary, summary: string): void {
    if (run.dependencyMode !== "optional_background") return;
    const notification = this.options.store.upsertSubagentGroupedCompletionNotification({
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      parentMessageId: run.parentMessageId,
      child: {
        runId: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        roleId: run.roleId,
        status: run.status,
        summary: previewForSubagentRuntime(summary, 1200),
        completedAt: run.completedAt,
      },
    });
    const payload = notification.payload && typeof notification.payload === "object" && !Array.isArray(notification.payload)
      ? notification.payload as Record<string, unknown>
      : {};
    this.options.store.appendSubagentRunEvent(run.id, {
      type: "subagent.grouped_completion_notified",
      preview: {
        parentMailboxEventId: notification.id,
        notificationCount: typeof payload.notificationCount === "number" ? payload.notificationCount : undefined,
      },
    });
  }

  private recordToolRuntimeEvents(input: {
    childThread: ThreadSummary;
    messages: ChatMessage[];
    emitEvent: SubagentRuntimeEventEmitter;
  }): void {
    for (const message of input.messages) {
      if (message.role !== "tool") continue;
      const metadata = message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
        ? message.metadata as Record<string, unknown>
        : {};
      const toolName = stringMetadata(metadata.toolName) ?? stringMetadata(metadata.registeredName);
      if (!toolName) continue;
      const status = stringMetadata(metadata.status);
      if (status !== "done" && status !== "error") continue;
      const toolCallId = stringMetadata(metadata.toolCallId);
      const rawArtifactPath = stringMetadata(metadata.artifactPath);
      const artifactPath = normalizeWorkspaceArtifactPath(rawArtifactPath, input.childThread.workspacePath);
      const mutatingCategory = status === "done" ? subagentMutationCategoryForChildTool(toolName) : undefined;
      const attemptedCategory = status === "error" ? subagentMutationCategoryForChildTool(toolName) : undefined;
      const path = normalizeWorkspaceArtifactPath(
        subagentToolInputPathFromMessage(message, toolName, input.childThread.workspacePath),
        input.childThread.workspacePath,
      );
      const worktree = input.childThread.gitWorktree;
      const worktreeIsolated = Boolean(
        worktree?.status === "active" &&
          Boolean(worktree.worktreePath) &&
          input.childThread.workspacePath === worktree.worktreePath,
      );
      const approval = mutatingCategory
        ? this.subagentToolApprovalProvenance(input.childThread, toolName, toolCallId)
        : undefined;
      input.emitEvent({
        type: "tool_result",
        source: "child_runtime",
        toolName,
        ...(artifactPath ? { artifactPath } : {}),
        details: {
          status,
          result: status === "done" ? "completed" : "error",
          permissionMode: input.childThread.permissionMode,
          ...(toolCallId ? { toolCallId } : {}),
          ...(artifactPath ? { artifactPath } : {}),
          ...(path ? { path } : {}),
          ...(mutatingCategory ? { category: mutatingCategory } : {}),
          ...(attemptedCategory ? { attemptedCategory } : {}),
          ...(worktree?.worktreePath ? { worktreePath: worktree.worktreePath, worktreeIsolated } : {}),
          ...(approval ? { approvalId: approval.id, approvalSource: approval.source } : {}),
        },
      });
    }
  }

  private subagentToolApprovalProvenance(
    childThread: ThreadSummary,
    toolName: string,
    toolCallId: string | undefined,
  ): { id: string; source: string } {
    const matchingAudit = this.options.store.listPermissionAudit(100).find((entry) =>
      entry.threadId === childThread.id &&
      entry.toolName === toolName &&
      entry.decision === "allowed"
    );
    if (matchingAudit) {
      return {
        id: matchingAudit.grantId ?? matchingAudit.id,
        source: matchingAudit.grantId ? "permission_grant" : matchingAudit.decisionSource ?? "permission_audit",
      };
    }
    return {
      id: [
        "ambient-policy",
        childThread.id,
        childThread.permissionMode,
        toolName,
        toolCallId,
      ].filter(Boolean).join(":"),
      source: "permission_policy",
    };
  }
}

function latestAssistantMessageAfterLastToolForMessages(messages: ChatMessage[]): ChatMessage | undefined {
  const lastToolIndex = findLastMessageIndex(messages, (message) => message.role === "tool");
  for (let index = messages.length - 1; index > lastToolIndex; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.content.trim()) return message;
  }
  return undefined;
}

function subagentPostToolFollowupRequest(
  messages: ChatMessage[],
  role: SubagentRunSummary["roleProfileSnapshot"],
): { reason: string; message: string } | undefined {
  if (latestSubagentAssistantResultMessageForThread(messages)) return undefined;
  const lastToolIndex = findLastMessageIndex(messages, (message) => message.role === "tool");
  if (lastToolIndex === -1) return undefined;
  if (latestAssistantMessageAfterLastToolForMessages(messages)) return undefined;
  const reason = role.guardPolicy.structuredOutputRequired
    ? "Child produced tool results without a final structured sub-agent result."
    : "Child produced tool results without a final assistant result.";
  return {
    reason,
    message: [
      reason,
      "Continue from the visible child transcript.",
      "Do not repeat completed tool calls unless needed to recover missing evidence.",
      "If required task steps remain, use only the tools and scopes already granted to this child.",
      role.guardPolicy.structuredOutputRequired
        ? "When the task is finished, return the required SUBAGENT_RESULT_JSON block and exactly one SUBAGENT_RESULT_STATUS line."
        : "When the task is finished, return the final child answer.",
    ].join("\n"),
  };
}

function subagentResultContractFollowupRequest(
  disposition: ReturnType<typeof classifySubagentAssistantResult>,
  role: SubagentRunSummary["roleProfileSnapshot"],
  assistantText: string,
): { reason: string; message: string } | undefined {
  if (!role.guardPolicy.structuredOutputRequired) return undefined;
  if (disposition.status !== "failed") return undefined;
  if (disposition.explicitStatus === "failed") return undefined;
  const reason = disposition.reason?.trim();
  if (!reason || !subagentResultContractFailureIsRecoverable(reason)) return undefined;
  return {
    reason,
    message: [
      `Your previous child response did not satisfy Ambient's required result contract: ${reason}`,
      "Continue from the visible child transcript.",
      assistantText.trim()
        ? "Do not redo long prose unless required. If your previous answer contains the correct task work, summarize that answer in the structured result."
        : "The previous turn did not leave a usable assistant answer. Finish the child task from the visible transcript.",
      "Return exactly one SUBAGENT_RESULT_JSON block followed by exactly one SUBAGENT_RESULT_STATUS line.",
      "Use status complete only if the child task is done; use needs_attention if parent/user steering is required; use failed if the task cannot be completed.",
    ].join("\n"),
  };
}

function subagentResultContractFailureIsRecoverable(reason: string): boolean {
  return (
    reason.startsWith("Structured-output role result is missing") ||
    reason.startsWith("Structured-output role result status") ||
    reason.startsWith("Structured sub-agent result is invalid") ||
    reason.startsWith("Structured result ") ||
    reason.includes("must match result status") ||
    reason.includes("must be an array of strings") ||
    reason.includes("must be an array of plain strings") ||
    reason.includes("roleOutput")
  );
}

function findLastMessageIndex(messages: ChatMessage[], predicate: (message: ChatMessage) => boolean): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) return index;
  }
  return -1;
}
