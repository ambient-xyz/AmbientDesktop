import type {
  PermissionPromptResponseMode,
  PermissionRequest,
} from "../../../shared/permissionTypes";
import type { SubagentRunSummary } from "../../../shared/subagentTypes";
import type { ChatMessage } from "../../../shared/threadTypes";
import type { AmbientModelRuntimeProfile } from "../../../shared/ambientModels";
import type {
  SubagentChildRuntimeApprovalRequest,
  SubagentChildRuntimeApprovalResponseInput,
} from "../agentRuntimePiFacade";
export { isSubagentTerminalStatus } from "../agentRuntimeSubagentsFacade";

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim())));
}

export function childSessionErrorShouldPreserveTerminalStatus(status: SubagentRunSummary["status"]): boolean {
  return ["cancelled", "stopped", "timed_out", "aborted_partial"].includes(status);
}

export function permissionPromptResponseModeForSubagentApproval(
  decision: SubagentChildRuntimeApprovalResponseInput["decision"],
  effectiveScope: SubagentChildRuntimeApprovalResponseInput["effectiveScope"],
): PermissionPromptResponseMode {
  if (decision === "denied") return "deny";
  switch (effectiveScope) {
    case "this_action":
      return "allow_once";
    case "this_child_thread":
      return "always_thread";
    case "parent_thread_tree":
      return "always_workflow";
    case "project":
      return "always_project";
    case "global":
      return "always_workspace";
  }
}

export function subagentApprovalRequestFromPermissionRequest(
  run: Pick<SubagentRunSummary, "id">,
  request: PermissionRequest,
): SubagentChildRuntimeApprovalRequest {
  return {
    approvalId: request.id,
    title: request.title || `Approve ${request.toolName}`,
    prompt: permissionRequestApprovalPrompt(request),
    requestedAction: request.grantActionKind ?? request.toolName,
    requestedToolId: request.toolName,
    requestedToolCategory: request.risk,
    requestedScope: subagentRequestedScopeForPermissionRequest(request),
    idempotencyKey: [
      "subagent",
      "native-permission-request",
      run.id,
      request.id,
      request.toolName,
    ].join(":"),
  };
}

function permissionRequestApprovalPrompt(request: PermissionRequest): string {
  return [
    request.message,
    request.detail ? `Detail:\n${request.detail}` : undefined,
  ].filter(Boolean).join("\n\n");
}

function subagentRequestedScopeForPermissionRequest(request: PermissionRequest): string {
  const scopes = request.reusableScopes ?? [];
  if (scopes.includes("workspace")) return "project";
  if (scopes.includes("project")) return "project";
  if (scopes.includes("workflow_thread")) return "parent_thread_tree";
  if (scopes.includes("thread")) return "this_child_thread";
  return "this_action";
}

export function isLocalTextSubagentProfile(profile: AmbientModelRuntimeProfile): boolean {
  return profile.locality === "local" && profile.toolUse === "none" && !profile.supportsVision && !profile.supportsAudio;
}

export function localTextMainAssistantContent(artifact: { textPreview: string; fullOutputPath?: string }): string {
  return [
    artifact.textPreview,
    artifact.fullOutputPath ? `\n\nFull local text output: ${artifact.fullOutputPath}` : undefined,
  ].filter(Boolean).join("");
}

export function latestAssistantMessageForThread(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim());
}

export function latestSubagentAssistantResultMessageForThread(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && hasSubagentResultStatusLine(message.content));
}

function hasSubagentResultStatusLine(text: string): boolean {
  return /^SUBAGENT_RESULT_STATUS(?::|\s*$)/im.test(text);
}

export function previewForSubagentRuntime(text: string, limit: number): string {
  const normalized = normalizedSubagentRuntimeText(text);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

export function normalizedSubagentRuntimeTextLength(text: string): number {
  return normalizedSubagentRuntimeText(text).length;
}

function normalizedSubagentRuntimeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
