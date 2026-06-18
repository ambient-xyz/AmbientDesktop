import type {
  PermissionPromptResponseMode,
  PermissionRequest,
  PermissionRisk,
} from "../../shared/permissionTypes";
import type { RuntimeActivity } from "../../shared/threadTypes";
import type { ToolResultDetails } from "./agentRuntimePiFacade";

type RuntimePermissionActivity = Extract<RuntimeActivity, { kind: "permission" }>;

export interface FullAccessAllowedToolAudit {
  risk: PermissionRisk;
  detail?: string;
  reason: string;
}

export interface RuntimePermissionWaitToolResultInput {
  wait: {
    toolName: string;
    requestId?: string;
    title?: string;
  };
  finish?: {
    allowed?: boolean;
    error?: string;
  };
  toolName: string;
  elapsedMs: number;
}

export interface RuntimePermissionWaitToolResult {
  resultText: string;
  details: ToolResultDetails;
}

export interface RuntimePermissionWaitActivityMessageInput {
  wait: {
    toolName: string;
    title?: string;
  };
  finish?: {
    allowed?: boolean;
    error?: string;
  };
}

export interface RuntimePermissionWaitActivityInput {
  threadId: string;
  wait: {
    toolName: string;
    requestId?: string;
    title?: string;
    risk?: PermissionRisk;
  };
  finish?: {
    allowed?: boolean;
    mode?: PermissionPromptResponseMode;
    error?: string;
  };
}

export function formatPermissionBlockedMessage(toolName: string, detail: string | undefined): string {
  return detail
    ? `Permission policy blocked ${toolName}.\n\n${detail}`
    : `Permission policy blocked ${toolName}.`;
}

export function runtimePermissionWaitToolResult(
  input: RuntimePermissionWaitToolResultInput,
): RuntimePermissionWaitToolResult {
  const finish = input.finish;
  const waiting = finish === undefined;
  const status = waiting
    ? "awaiting-approval"
    : finish.error
      ? "approval-error"
      : finish.allowed === false
        ? "approval-denied"
        : "approval-resolved";
  const resultText = waiting
    ? [
        `Waiting for Ambient Desktop approval${input.wait.title ? `: ${input.wait.title}` : ` for ${input.wait.toolName}`}.`,
        input.wait.requestId ? `Approval request: ${input.wait.requestId}` : undefined,
      ].filter(Boolean).join("\n")
    : finish.error
      ? `Ambient Desktop approval failed for ${input.wait.toolName}: ${finish.error}`
      : finish.allowed === false
        ? `Ambient Desktop approval denied for ${input.wait.toolName}.`
        : `Ambient Desktop approval resolved for ${input.wait.toolName}.`;
  return {
    resultText,
    details: {
      runtime: "ambient-permission",
      toolName: input.toolName,
      status,
      stage: "approval",
      waitingOn: "desktop-approval",
      elapsedMs: input.elapsedMs,
      heartbeatCount: Math.floor(input.elapsedMs / 5_000) + 1,
      ...(input.wait.requestId ? { approvalRequestId: input.wait.requestId } : {}),
      ...(input.wait.title ? { approvalTitle: input.wait.title } : {}),
    },
  };
}

export function runtimePermissionWaitActivityMessage(
  input: RuntimePermissionWaitActivityMessageInput,
): string {
  const finish = input.finish;
  if (finish === undefined) {
    return `Waiting for permission approval${input.wait.title ? `: ${input.wait.title}` : ` for ${input.wait.toolName}`}.`;
  }
  if (finish.error) return `Permission prompt failed for ${input.wait.toolName}: ${finish.error}`;
  if (finish.allowed === false) return `Permission denied for ${input.wait.toolName}.`;
  return `Permission resolved for ${input.wait.toolName}.`;
}

export function runtimePermissionWaitActivity(input: RuntimePermissionWaitActivityInput): RuntimePermissionActivity {
  const finish = input.finish;
  if (finish === undefined) {
    return {
      threadId: input.threadId,
      kind: "permission",
      status: "waiting",
      toolName: input.wait.toolName,
      requestId: input.wait.requestId,
      title: input.wait.title,
      risk: input.wait.risk,
      message: runtimePermissionWaitActivityMessage({ wait: input.wait }),
    };
  }
  return {
    threadId: input.threadId,
    kind: "permission",
    status: "finished",
    toolName: input.wait.toolName,
    requestId: input.wait.requestId,
    title: input.wait.title,
    risk: input.wait.risk,
    allowed: finish.allowed,
    mode: finish.mode,
    message: runtimePermissionWaitActivityMessage({ wait: input.wait, finish }),
  };
}

export function formatPermissionDeniedToolResultReason(toolName: string, request: Omit<PermissionRequest, "id">): string {
  const operation = recordStringField(request.grantConditions, "operation");
  if (toolName === "ambient_visual_minicpm_setup" || operation === "minicpm_visual_setup") {
    const action = recordStringField(request.grantConditions, "action");
    if (action === "stop") return "User denied MiniCPM-V Stop. The provider remains installed and the local MiniCPM-V runtime was not stopped.";
    if (action === "uninstall") return "User denied MiniCPM-V uninstall. No MiniCPM-V package, runtime, or cache files were removed.";
    if (action === "repair") return "User denied MiniCPM-V Repair. No provider package, runtime, or model binding changes were made.";
    if (action === "validate") return "User denied MiniCPM-V validation. No MiniCPM-V runtime validation was run.";
    return "User denied MiniCPM-V setup. No MiniCPM-V provider changes were made.";
  }
  if (toolName === "ambient_local_model_runtime_start" || operation === "local_model_runtime_start") {
    const runtimeId = recordStringField(request.grantConditions, "runtimeId");
    return `User denied local model runtime Start${runtimeId ? ` for ${runtimeId}` : ""}. The runtime was not started.`;
  }
  if (toolName === "ambient_local_model_runtime_stop" || operation === "local_model_runtime_stop") {
    const runtimeId = recordStringField(request.grantConditions, "runtimeId");
    const force = request.grantConditions && typeof request.grantConditions === "object" && !Array.isArray(request.grantConditions)
      ? (request.grantConditions as Record<string, unknown>).force === true
      : false;
    return `User denied local model runtime ${force ? "forced Stop" : "Stop"}${runtimeId ? ` for ${runtimeId}` : ""}. The runtime was not stopped.`;
  }
  if (toolName === "ambient_local_model_runtime_restart" || operation === "local_model_runtime_restart") {
    const runtimeId = recordStringField(request.grantConditions, "runtimeId");
    const force = request.grantConditions && typeof request.grantConditions === "object" && !Array.isArray(request.grantConditions)
      ? (request.grantConditions as Record<string, unknown>).force === true
      : false;
    return `User denied local model runtime ${force ? "forced Restart" : "Restart"}${runtimeId ? ` for ${runtimeId}` : ""}. The runtime was not restarted.`;
  }
  return "Blocked by Ambient Desktop permission policy.";
}

export function fullAccessAllowedToolAudit(
  toolName: string,
  toolInput: unknown,
): FullAccessAllowedToolAudit | undefined {
  if (toolName === "bash") {
    const command = recordStringField(toolInput, "command");
    return {
      risk: "workspace-command",
      detail: command,
      reason: "Allowed by Power User full-access mode after invariant safety checks.",
    };
  }
  if (["write", "edit", "file_write", "file_edit"].includes(toolName)) {
    const path = recordStringField(toolInput, "path");
    return {
      risk: "outside-workspace",
      detail: path,
      reason: "Allowed file mutation by Power User full-access mode after invariant safety checks.",
    };
  }
  return undefined;
}

function recordStringField(value: unknown, key: string): string | undefined {
  return value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>)[key] === "string"
    ? String((value as Record<string, unknown>)[key])
    : undefined;
}
