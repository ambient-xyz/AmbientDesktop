import { describe, expect, it } from "vitest";
import type { PermissionRequest } from "../../../shared/permissionTypes";
import type { SubagentRunSummary } from "../../../shared/subagentTypes";
import type { ChatMessage } from "../../../shared/threadTypes";
import type { AmbientModelRuntimeProfile } from "../../../shared/ambientModels";
import {
  childSessionErrorShouldPreserveTerminalStatus,
  isLocalTextSubagentProfile,
  isSubagentTerminalStatus,
  latestAssistantMessageForThread,
  latestSubagentAssistantResultMessageForThread,
  localTextMainAssistantContent,
  normalizedSubagentRuntimeTextLength,
  permissionPromptResponseModeForSubagentApproval,
  previewForSubagentRuntime,
  subagentApprovalRequestFromPermissionRequest,
  uniqueStrings,
} from "./agentRuntimeSubagentRuntimeHelpers";

describe("agentRuntimeSubagentRuntimeHelpers", () => {
  it("maps child approval decisions and scopes to permission prompt response modes", () => {
    expect(permissionPromptResponseModeForSubagentApproval("denied", "global")).toBe("deny");
    expect(permissionPromptResponseModeForSubagentApproval("approved", "this_action")).toBe("allow_once");
    expect(permissionPromptResponseModeForSubagentApproval("approved", "this_child_thread")).toBe("always_thread");
    expect(permissionPromptResponseModeForSubagentApproval("approved", "parent_thread_tree")).toBe("always_workflow");
    expect(permissionPromptResponseModeForSubagentApproval("approved", "project")).toBe("always_project");
    expect(permissionPromptResponseModeForSubagentApproval("approved", "global")).toBe("always_workspace");
  });

  it("builds parent-facing subagent approval requests from permission prompts", () => {
    const request: PermissionRequest = {
      id: "permission-1",
      threadId: "child-thread-1",
      toolName: "write_file",
      title: "",
      message: "Allow child to write?",
      detail: "Path: notes/todo.md",
      risk: "workspace-command",
      reusableScopes: ["workflow_thread"],
      grantActionKind: "local_file_write",
    };

    expect(subagentApprovalRequestFromPermissionRequest(run("run-1"), request)).toEqual({
      approvalId: "permission-1",
      title: "Approve write_file",
      prompt: "Allow child to write?\n\nDetail:\nPath: notes/todo.md",
      requestedAction: "local_file_write",
      requestedToolId: "write_file",
      requestedToolCategory: "workspace-command",
      requestedScope: "parent_thread_tree",
      idempotencyKey: "subagent:native-permission-request:run-1:permission-1:write_file",
    });
  });

  it("classifies subagent status and local text profiles", () => {
    expect(isSubagentTerminalStatus("completed")).toBe(true);
    expect(isSubagentTerminalStatus("needs_attention")).toBe(false);
    expect(childSessionErrorShouldPreserveTerminalStatus("aborted_partial")).toBe(true);
    expect(childSessionErrorShouldPreserveTerminalStatus("failed")).toBe(false);
    expect(uniqueStrings(["lease-1", "", "lease-2", "lease-1"])).toEqual(["lease-1", "lease-2"]);
    expect(isLocalTextSubagentProfile(profile({ locality: "local", toolUse: "none", supportsVision: false, supportsAudio: false }))).toBe(true);
    expect(isLocalTextSubagentProfile(profile({ locality: "cloud", toolUse: "none", supportsVision: false, supportsAudio: false }))).toBe(false);
    expect(isLocalTextSubagentProfile(profile({ locality: "local", toolUse: "ambient-tools", supportsVision: false, supportsAudio: false }))).toBe(false);
  });

  it("summarizes local text artifacts and finds assistant result messages", () => {
    const messages: ChatMessage[] = [
      message("assistant", "   "),
      message("assistant", "regular answer"),
      message("user", "ignored"),
      message("assistant", "SUBAGENT_RESULT_STATUS: completed\nsummary"),
    ];

    expect(localTextMainAssistantContent({
      textPreview: "Local answer",
      fullOutputPath: "/tmp/full-output.txt",
    })).toBe("Local answer\n\nFull local text output: /tmp/full-output.txt");
    expect(latestAssistantMessageForThread(messages)?.content).toBe("SUBAGENT_RESULT_STATUS: completed\nsummary");
    expect(latestSubagentAssistantResultMessageForThread(messages)?.content).toBe("SUBAGENT_RESULT_STATUS: completed\nsummary");
  });

  it("normalizes and truncates subagent runtime previews", () => {
    expect(previewForSubagentRuntime("  hello\n\nworld  ", 20)).toBe("hello world");
    expect(previewForSubagentRuntime("abcdefghij", 8)).toBe("abcde...");
    expect(normalizedSubagentRuntimeTextLength("  hello\nworld  ")).toBe(11);
  });
});

function run(id: string): Pick<SubagentRunSummary, "id"> {
  return { id };
}

function message(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `${role}-${content.length}`,
    threadId: "thread-1",
    role,
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function profile(input: Pick<AmbientModelRuntimeProfile, "locality" | "toolUse" | "supportsVision" | "supportsAudio">): AmbientModelRuntimeProfile {
  return {
    schemaVersion: "ambient-model-runtime-profile-v1",
    profileId: "local:text",
    providerId: "local",
    modelId: "local-text",
    label: "Local text",
    selectableAsMain: false,
    selectableAsSubagent: true,
    available: true,
    contextWindowTokens: 8192,
    maxOutputTokens: 1024,
    supportsStreaming: true,
    structuredOutput: "none",
    costClass: "local",
    trustClass: "local-user-managed",
    privacyLabel: "Local",
    providerQuirks: [],
    ...input,
  };
}
