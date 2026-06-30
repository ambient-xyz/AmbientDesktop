import type { PermissionDecision, PermissionPolicyInput } from "./permissionPolicyTypes";
import { getBooleanField, getStringField, permissionGrantHash } from "./permissionPolicyInputFields";

export function classifyWorkflowToolPermission(input: PermissionPolicyInput): PermissionDecision | undefined {
  if (input.toolName === "workflow_apply_revision") {
    const workflowThreadId = getStringField(input.toolInput, "workflowThreadId") ?? "unknown";
    const revisionId = getStringField(input.toolInput, "revisionId") ?? "unknown";
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Apply workflow revision?",
        message: "Ambient wants to activate a proposed Workflow Agent revision and create or select the resulting workflow version.",
        detail: [`Workflow thread: ${workflowThreadId}`, `Revision: ${revisionId}`].join("\n"),
        risk: "workspace-command",
        reusableScopes: ["workflow_thread", "project", "workspace"],
        grantActionKind: "local_file_write",
        grantTargetKind: "tool",
        grantTargetLabel: `workflow_apply_revision:${workflowThreadId}`,
        grantTargetHash: permissionGrantHash("local_file_write", "tool", `workflow.apply_revision\0${workflowThreadId}`),
        grantConditions: {
          provider: "ambient.desktop",
          operation: "workflow_apply_revision",
          workflowThreadId,
        },
      },
    };
  }

  if (input.toolName === "workflow_update_run_settings") {
    const action = getStringField(input.toolInput, "action") ?? "propose_persistent";
    if (action === "preview_foreground") return { action: "allow" };
    const workflowThreadId = getStringField(input.toolInput, "workflowThreadId") ?? "unknown";
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Update workflow run settings?",
        message: "Ambient wants to create or apply a Workflow Agent run-settings revision.",
        detail: [`Workflow thread: ${workflowThreadId}`, `Action: ${action}`].join("\n"),
        risk: "workspace-command",
        reusableScopes: ["workflow_thread", "project", "workspace"],
        grantActionKind: "local_file_write",
        grantTargetKind: "tool",
        grantTargetLabel: `workflow_update_run_settings:${workflowThreadId}`,
        grantTargetHash: permissionGrantHash("local_file_write", "tool", `workflow.update_run_settings\0${workflowThreadId}`),
        grantConditions: {
          provider: "ambient.desktop",
          operation: "workflow_update_run_settings",
          workflowThreadId,
          action,
        },
      },
    };
  }

  if (input.toolName === "workflow_restore_version") {
    const workflowThreadId = getStringField(input.toolInput, "workflowThreadId") ?? "unknown";
    const versionId = getStringField(input.toolInput, "versionId") ?? "unknown";
    const approveRestored = getBooleanField(input.toolInput, "approveRestored") === true;
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Restore workflow version?",
        message: approveRestored
          ? "Ambient wants to restore an older Workflow Agent version and approve it as latest."
          : "Ambient wants to restore an older Workflow Agent version as a new review version.",
        detail: [
          `Workflow thread: ${workflowThreadId}`,
          `Version: ${versionId}`,
          `Approve restored version: ${approveRestored ? "yes" : "no"}`,
        ].join("\n"),
        risk: "workspace-command",
        reusableScopes: ["workflow_thread", "project", "workspace"],
        grantActionKind: "local_file_write",
        grantTargetKind: "tool",
        grantTargetLabel: `workflow_restore_version:${workflowThreadId}`,
        grantTargetHash: permissionGrantHash("local_file_write", "tool", `workflow.restore_version\0${workflowThreadId}`),
        grantConditions: {
          provider: "ambient.desktop",
          operation: "workflow_restore_version",
          workflowThreadId,
          approveRestored,
        },
      },
    };
  }

  if (input.toolName === "workflow_run_preview") {
    const workflowThreadId = getStringField(input.toolInput, "workflowThreadId") ?? "unknown";
    const artifactId = getStringField(input.toolInput, "artifactId") ?? "active";
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Run workflow preview?",
        message: "Ambient wants to start a dry-run Workflow Agent preview and record trace evidence.",
        detail: [`Workflow thread: ${workflowThreadId}`, `Artifact: ${artifactId}`, "Mode: dry_run"].join("\n"),
        risk: "workspace-command",
        reusableScopes: ["workflow_thread", "project", "workspace"],
        grantActionKind: "local_file_write",
        grantTargetKind: "tool",
        grantTargetLabel: `workflow_run_preview:${workflowThreadId}`,
        grantTargetHash: permissionGrantHash("local_file_write", "tool", `workflow.run_preview\0${workflowThreadId}`),
        grantConditions: {
          provider: "ambient.desktop",
          operation: "workflow_run_preview",
          workflowThreadId,
        },
      },
    };
  }

  if (input.toolName === "workflow_run_version") {
    const workflowThreadId = getStringField(input.toolInput, "workflowThreadId") ?? "unknown";
    const artifactId = getStringField(input.toolInput, "artifactId") ?? "active";
    const versionId = getStringField(input.toolInput, "versionId") ?? "latest";
    const allowUnapproved = getBooleanField(input.toolInput, "allowUnapproved") === true;
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: allowUnapproved ? "Run unapproved workflow?" : "Run workflow version?",
        message: allowUnapproved
          ? "Ambient wants to execute an unapproved Workflow Agent once and record an audit trail."
          : "Ambient wants to execute the active approved Workflow Agent version.",
        detail: [
          `Workflow thread: ${workflowThreadId}`,
          `Artifact: ${artifactId}`,
          `Version: ${versionId}`,
          `Allow unapproved: ${allowUnapproved ? "yes" : "no"}`,
        ].join("\n"),
        risk: "workspace-command",
        reusableScopes: ["workflow_thread", "project", "workspace"],
        grantActionKind: "local_file_write",
        grantTargetKind: "tool",
        grantTargetLabel: `workflow_run_version:${workflowThreadId}`,
        grantTargetHash: permissionGrantHash("local_file_write", "tool", `workflow.run_version\0${workflowThreadId}`),
        grantConditions: {
          provider: "ambient.desktop",
          operation: "workflow_run_version",
          workflowThreadId,
          allowUnapproved,
        },
      },
    };
  }

  return undefined;
}
