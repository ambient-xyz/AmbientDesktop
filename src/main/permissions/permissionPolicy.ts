import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import type { CollaborationMode, PermissionGrantActionKind, PermissionGrantScopeKind, PermissionMode, PermissionRequest } from "../../shared/types";
import type { GoogleWorkspaceCallInput, GoogleWorkspaceMethodSideEffect, GoogleWorkspaceMethodSummary } from "../../shared/types";
import { googleWorkspaceGrantConditions, googleWorkspaceMethodGrantTarget } from "../../shared/googleWorkspaceGrantTargets";
import { googleWorkspaceMethodApprovalDetail, googleWorkspaceMethodGrantIdentity } from "../google-workspace/googleWorkspaceMethodBroker";
import { isDotEnvPath, isEnvTemplatePath } from "../pathSensitivity";
import { classifyPlannerToolPermission } from "../planner/plannerMode";
import { isPathInside } from "../session/sessionPaths";

type PermissionPrompt = Omit<PermissionRequest, "id">;

export type PermissionDecision =
  | { action: "allow" }
  | {
      action: "prompt";
      request: PermissionPrompt;
    }
  | {
      action: "deny";
      request: PermissionPrompt;
      reason: string;
    };

export type ShellCommandSemanticIntentKind =
  | "proof-command"
  | "scratch-output"
  | "dependency-artifact-import"
  | "local-server-launch"
  | "browser-proof"
  | "project-root-material-write"
  | "unknown";

export interface PermissionPolicyInput {
  threadId: string;
  permissionMode: PermissionMode;
  collaborationMode?: CollaborationMode;
  workspacePath: string;
  projectPath?: string;
  readOnlyAllowedPaths?: string[];
  toolName: string;
  toolInput: unknown;
}

const dangerousCommandPatterns = [
  /\brm\s+(-rf?|--recursive|--force)/i,
  /\bsudo\b/i,
  /\bchmod\b[^\n;&|]*\b777\b/i,
  /\bchown\b/i,
  /\bmkfs\b/i,
  /\bdd\b[^\n;&|]*\bof=/i,
];

const networkCommandPatterns = [/\b(curl|wget|scp|sftp|ssh|rsync|nc|netcat|nmap|rclone)\b/i];
const managedSecretPathPatterns = [
  /(^|\/)\.ambient\/(?:[^/]+\/)*secrets?(?:\/|$)/i,
  /(^|\/)\.ambient-codex\/(?:[^/]+\/)*secrets?(?:\/|$)/i,
  /(^|\/)[^/]+\.secret$/i,
];
const managedAuthorityPathPatterns = [
  /(^|\/)\.ambient-codex\/state\.sqlite(?:-(?:wal|shm))?$/i,
  /(^|\/)\.ambient-codex\/browser\/credentials\.json(?:\.[^/]*)?$/i,
  /(^|\/)\.ambient-codex\/remote-marketplaces\.json$/i,
  /(^|\/)authority-state\/workspaces\/[^/]+\/state\.sqlite(?:-(?:wal|shm))?$/i,
  /(^|\/)authority-state\/workspaces\/[^/]+\/browser\/credentials\.json(?:\.[^/]*)?$/i,
  /(^|\/)mcp\/autowire-candidates(?:\/|$)/i,
  /(^|\/)mcp\/autowire-plan-revisions\.json(?:\.[^/]*)?$/i,
  /(^|\/)mcp\/source-builds(?:\/|$)/i,
  /(^|\/)mcp\/toolhive\/state\.json(?:\.[^/]*)?$/i,
  /(^|\/)mcp\/toolhive\/(?:permission-profiles|runtime-secret-bindings|docker-config|file-exchange)(?:\/|$)/i,
  /(^|\/)mcp-container-runtime\/(?:default-capabilities|setup-state)\.json(?:\.[^/]*)?$/i,
];
const secretPathPatterns = [
  ...managedSecretPathPatterns,
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)secrets?\.(json|ya?ml|toml|env|txt)$/i,
  /(^|\/)credentials?\.(json|ya?ml|toml|env|txt)$/i,
  /(^|\/)\.(ssh|aws|gnupg)(\/|$)/i,
];
const fileToolAliases = new Map([
  ["read", "read"],
  ["write", "write"],
  ["edit", "edit"],
  ["file_read", "read"],
  ["file_write", "write"],
  ["file_edit", "edit"],
  ["local_directory_list", "read"],
  ["local_file_read", "read"],
]);
const localFileToolNames = new Set(["local_directory_list", "local_file_read"]);
const managedSkillInstallPathPatterns = [
  /(^|\/)\.agents\/skills(?:\/|$)/i,
  /(^|\/)\.codex\/skills(?:\/|$)/i,
  /(^|\/)\.ambient\/skills(?:\/|$)/i,
];
const outsideWorkspaceApprovedRoute =
  "Approved path: keep generated files under the active workspace when possible, or approve a scoped path grant here before using file tools or Bash outside the workspace.";
const managedSkillInstallerApprovedRoute =
  "Approved path: use ambient_cli_package_preview, then ambient_cli_package_install to copy descriptor-backed skill packages into Ambient-owned CLI package state; direct managed skill directory writes require this scoped path approval.";
const managedAuthorityApprovedRoute =
  "Approved path: use the capability-specific Ambient API or first-party tool that owns this state instead of reading or mutating Ambient state files directly.";
const unmanagedToolHiveApprovedRoute =
  "Approved path: use Ambient MCP install, repair, diagnostics, or uninstall tools for managed servers. Direct ToolHive CLI use is an unmanaged debugging path and requires explicit user approval.";
const managedSecretApprovedRoute =
  "Approved path: use Ambient-managed secret request or env binding tools so secret values stay out of chat, logs, tool arguments, and filesystem reads.";

export type PermissionPolicyFileToolAccess = "read" | "write" | "edit";

export function permissionPolicyFileToolAccess(toolName: string): PermissionPolicyFileToolAccess | undefined {
  return fileToolAliases.get(toolName) as PermissionPolicyFileToolAccess | undefined;
}

export async function classifyToolPermission(input: PermissionPolicyInput): Promise<PermissionDecision> {
  if (input.collaborationMode === "planner") {
    return classifyPlannerModePermission(input);
  }

  if (input.toolName === "browser_login") {
    return classifyBrowserToolPermission(input);
  }

  const managedAuthorityDecision = await classifyManagedAuthorityPathAccess(input);
  if (managedAuthorityDecision) return managedAuthorityDecision;

  const unmanagedToolHiveDecision = classifyUnmanagedToolHiveCommandAccess(input);
  if (unmanagedToolHiveDecision) return unmanagedToolHiveDecision;

  const managedSecretDecision = await classifyManagedSecretPathAccess(input);
  if (managedSecretDecision) return managedSecretDecision;

  if (input.toolName.startsWith("google_workspace_")) {
    return classifyGoogleWorkspaceSetupPermission(input);
  }

  if (input.permissionMode === "full-access") return { action: "allow" };

  if (input.toolName === "media_download") {
    return classifyMediaDownloadPermission(input);
  }

  if (input.toolName === "ambient_visual_minicpm_setup") {
    return classifyMiniCpmVisionSetupPermission(input);
  }

  if (input.toolName === "ambient_local_deep_research_setup") {
    return classifyLocalDeepResearchSetupPermission(input);
  }

  if (input.toolName === "ambient_local_model_runtime_stop") {
    return classifyLocalModelRuntimeStopPermission(input);
  }

  if (input.toolName === "ambient_local_model_runtime_start") {
    return classifyLocalModelRuntimeStartPermission(input);
  }

  if (input.toolName === "ambient_local_model_runtime_restart") {
    return classifyLocalModelRuntimeRestartPermission(input);
  }

  if (input.toolName === "ambient_visual_analyze") {
    return classifyMiniCpmVisionAnalyzePermission(input);
  }

  if (input.toolName === "ambient_cli") {
    const packageName = getStringField(input.toolInput, "packageName") ?? getStringField(input.toolInput, "packageId") ?? "unknown";
    const command = getStringField(input.toolInput, "command") ?? "unknown";
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: `Run Ambient CLI "${packageName}:${command}"?`,
        message: "This workflow wants to run a command declared by an installed Ambient CLI package.",
        detail: `Package: ${packageName}\nCommand: ${command}`,
        risk: "workspace-command",
        reusableScopes: ["workflow_thread", "project", "workspace"],
      },
    };
  }

  if (input.toolName === "ambient_git_status") {
    return { action: "allow" };
  }

  if (input.toolName === "ambient_git_commit" || input.toolName === "ambient_git_finish_to_main") {
    const operation = input.toolName === "ambient_git_commit" ? "commit" : "finish_to_main";
    const targetBranch = getStringField(input.toolInput, "targetBranch") ?? "main";
    const message = getStringField(input.toolInput, "message") ?? getStringField(input.toolInput, "mergeMessage") ?? "";
    const push = getBooleanField(input.toolInput, "push") === true;
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: input.toolName === "ambient_git_commit" ? "Commit thread Git changes?" : `Finish thread Git work to ${targetBranch}?`,
        message: input.toolName === "ambient_git_commit"
          ? "Ambient wants to stage and commit changes in the active thread worktree."
          : "Ambient wants to merge the active thread branch into the target branch through a worktree-aware Git workflow.",
        detail: [
          `Operation: ${operation}`,
          `Workspace: ${input.workspacePath}`,
          input.toolName === "ambient_git_finish_to_main" ? `Target branch: ${targetBranch}` : undefined,
          input.toolName === "ambient_git_finish_to_main" ? `Push after validation: ${push ? "yes" : "no"}` : undefined,
          message ? `Message: ${message}` : undefined,
        ].filter(Boolean).join("\n"),
        risk: "workspace-command",
        reusableScopes: ["thread", "project", "workspace"],
        grantActionKind: "shell_command",
        grantTargetKind: "tool",
        grantTargetLabel: input.toolName,
        grantTargetHash: permissionGrantHash("shell_command", "tool", `${input.toolName}\0${targetBranch}\0${push}\0${message}`),
        grantConditions: {
          provider: "ambient.desktop",
          operation: input.toolName,
          targetBranch,
          push,
        },
      },
    };
  }

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
        detail: [`Workflow thread: ${workflowThreadId}`, `Version: ${versionId}`, `Approve restored version: ${approveRestored ? "yes" : "no"}`].join("\n"),
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
        detail: [`Workflow thread: ${workflowThreadId}`, `Artifact: ${artifactId}`, `Version: ${versionId}`, `Allow unapproved: ${allowUnapproved ? "yes" : "no"}`].join("\n"),
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

  if (input.toolName.startsWith("browser_")) {
    return classifyBrowserToolPermission(input);
  }

  const fileTool = permissionPolicyFileToolAccess(input.toolName);
  if (fileTool) {
    const requestedPath = getStringField(input.toolInput, "path");
    if (!requestedPath) return { action: "allow" };
    const pathCheck = await resolvePolicyPath(input.workspacePath, permissionPolicyPathForTool(input.toolName, requestedPath));
    if (isSecretLikePath(pathCheck.absolutePath)) {
      const envPath = isDotEnvPath(pathCheck.absolutePath);
      return {
        action: "prompt",
        request: {
          threadId: input.threadId,
          toolName: input.toolName,
          title: "Allow access to this sensitive path?",
          message: envPath
            ? `${fileTool} wants to access an environment file. Pi may need this file to configure or run the project, but it can contain secrets.`
            : `${fileTool} wants to access a path that looks like it may contain secrets or credentials.`,
          detail: pathCheck.absolutePath,
          risk: "secret-path",
          ...envPathGrantFields(input, pathCheck.absolutePath, input.toolName),
        },
      };
    }
    const insideProjectPath = await isInsideProjectPath(input.projectPath, pathCheck.absolutePath);
    if (pathCheck.insideWorkspace) return { action: "allow" };
    if (insideProjectPath) return { action: "allow" };
    if (fileTool === "read" && (await isInsideReadOnlyAllowedPath(input.workspacePath, pathCheck.absolutePath, input.readOnlyAllowedPaths ?? []))) {
      return { action: "allow" };
    }
    if ((fileTool === "write" || fileTool === "edit") && isManagedSkillInstallPath(pathCheck.absolutePath)) {
      return {
        action: "prompt",
        request: managedSkillInstallPrompt({
          input,
          path: pathCheck.absolutePath,
          operation: input.toolName,
          commandClass: fileTool,
          reason: "Agent skill install paths live outside the active workspace and must be approved through Ambient's permission broker.",
        }),
      };
    }
    const actionKind = fileTool === "read" ? "file_content_read" : "local_file_write";
    const targetLabel = pathCheck.absolutePath;
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Allow outside-workspace file access?",
        message: insideProjectPath
          ? `${fileTool} wants to access the project root from this thread's internal worktree.`
          : `${fileTool} wants to access a path outside ${input.workspacePath}.`,
        detail: outsideWorkspacePathDetail(pathCheck.absolutePath),
        risk: "outside-workspace",
        reusableScopes: ["thread", "project", "workspace"],
        grantActionKind: actionKind,
        grantTargetKind: "path",
        grantTargetLabel: targetLabel,
        grantTargetHash: permissionGrantHash(actionKind, "path", targetLabel),
        grantConditions: {
          provider: "ambient.desktop",
          operation: input.toolName,
          path: pathCheck.absolutePath,
        },
      },
    };
  }

  if (input.toolName === "long_context_process") {
    return classifyLongContextToolPermission(input);
  }

  if (input.toolName === "bash") {
    const command = getStringField(input.toolInput, "command");
    if (!command) return { action: "allow" };
    const intent = classifyShellCommandSemanticIntent(command);
    const managedSecretPath = await findManagedSecretCommandPath(input.workspacePath, command);
    if (managedSecretPath) {
      return denyManagedSecretPath(input, `${command}\n\nManaged secret path: ${managedSecretPath}`);
    }
    const outsidePath = await findOutsideWorkspaceCommandPath(input.workspacePath, command, input.readOnlyAllowedPaths, input.projectPath);
    if (outsidePath) {
      if (isManagedSkillInstallCommand(command, outsidePath)) {
        return {
          action: "prompt",
          request: managedSkillInstallPrompt({
            input,
            path: outsidePath,
            operation: "bash",
            command,
            commandClass: shellCommandIntentLabel(intent),
            reason: "This shell command appears to install or modify an agent skill under a managed skill directory.",
          }),
        };
      }
      return {
        action: "prompt",
        request: shellCommandPathPrompt(input, command, outsidePath, intent, "outside-workspace"),
      };
    }
    const secretPath = await findSecretCommandPath(input.workspacePath, command);
    if (secretPath) {
      return {
        action: "prompt",
        request: shellCommandPathPrompt(input, command, secretPath, intent, "secret-path"),
      };
    }
    if (isNetworkCommand(command)) {
      return {
        action: "prompt",
        request: {
          threadId: input.threadId,
          toolName: input.toolName,
          title: "Allow this network command?",
          message: "Workspace mode requires approval for shell commands that can send data over the network.",
          detail: command,
          risk: "network-command",
        },
      };
    }
    if (!isDangerousCommand(command)) return { action: "allow" };
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Allow this shell command?",
        message: "Workspace mode requires approval for commands that look destructive or privileged.",
        detail: command,
        risk: "destructive-command",
      },
    };
  }

  return { action: "allow" };
}

async function classifyMediaDownloadPermission(input: PermissionPolicyInput): Promise<PermissionDecision> {
  const url = getStringField(input.toolInput, "url") ?? "unknown";
  const outputPath = getStringField(input.toolInput, "outputPath") ?? "unknown";
  const pathCheck = outputPath === "unknown" ? undefined : await resolvePolicyPath(input.workspacePath, outputPath);
  if (pathCheck && !pathCheck.insideWorkspace) {
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Allow outside-workspace media download?",
        message: "Ambient wants to download remote media to a path outside the current workspace.",
        detail: [`URL: ${url}`, `Output path: ${pathCheck.absolutePath}`].join("\n"),
        risk: "outside-workspace",
      },
    };
  }
  return {
    action: "prompt",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: "Allow media download?",
      message: "Ambient wants to fetch remote media and save a validated artifact into the workspace.",
      detail: [`URL: ${url}`, `Output path: ${pathCheck?.absolutePath ?? outputPath}`].join("\n"),
      risk: "browser-network",
      reusableScopes: ["thread", "project", "workspace"],
      grantActionKind: "local_file_write",
      grantTargetKind: "path",
      grantTargetLabel: `media_download -> ${outputPath}`,
      grantTargetHash: permissionGrantHash("local_file_write", "path", `media_download\0${url}\0${outputPath}`),
      grantConditions: {
        provider: "ambient.desktop",
        operation: "media_download",
        url,
        outputPath,
      },
    },
  };
}

async function classifyMiniCpmVisionAnalyzePermission(input: PermissionPolicyInput): Promise<PermissionDecision> {
  const imagePath = miniCpmVisionImagePath(input.toolInput, "image", "imagePath") ?? "unknown";
  const videoPath = miniCpmVisionImagePath(input.toolInput, "video", "videoPath");
  const referenceImagePath = miniCpmVisionImagePath(input.toolInput, "referenceImage", "referenceImagePath");
  const task = getStringField(input.toolInput, "task") ?? "ui_review";
  const endpointUrl = getStringField(input.toolInput, "endpointUrl");
  const allowExternal = getBooleanField(input.toolInput, "allowExternalImagePaths") === true || getBooleanField(input.toolInput, "allowExternalMediaPaths") === true;
  const pathCheck = imagePath === "unknown" ? undefined : await resolvePolicyPath(input.workspacePath, imagePath);
  const videoPathCheck = videoPath ? await resolvePolicyPath(input.workspacePath, videoPath) : undefined;
  const referencePathCheck = referenceImagePath ? await resolvePolicyPath(input.workspacePath, referenceImagePath) : undefined;
  const outsideWorkspace = Boolean(
    (pathCheck && !pathCheck.insideWorkspace) || (videoPathCheck && !videoPathCheck.insideWorkspace) || (referencePathCheck && !referencePathCheck.insideWorkspace),
  );
  const imageDetail = videoPath
    ? [`Video: ${videoPathCheck?.absolutePath ?? videoPath}`]
    : [`Image: ${pathCheck?.absolutePath ?? imagePath}`];
  if (referenceImagePath) imageDetail.push(`Reference image: ${referencePathCheck?.absolutePath ?? referenceImagePath}`);
  if (endpointUrl) imageDetail.push(`Existing endpoint: ${endpointUrl}`);
  const frameTimestampMs = getNumberField(input.toolInput, "frameTimestampMs") ?? getNumberField(getObjectField(input.toolInput, "video"), "frameTimestampMs");
  if (videoPath && frameTimestampMs !== undefined) imageDetail.push(`Frame timestamp: ${frameTimestampMs}ms`);
  return {
    action: "prompt",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: outsideWorkspace ? "Allow MiniCPM-V to inspect outside-workspace visual media?" : "Run MiniCPM-V visual analysis?",
      message: outsideWorkspace
        ? "Ambient wants to copy approved local visual media into managed workspace storage, then inspect it with the local MiniCPM-V provider."
        : "Ambient wants to inspect workspace visual media with the local MiniCPM-V visual provider.",
      detail: [...imageDetail, `Task: ${task}`, `External media copy allowed: ${allowExternal ? "yes" : "no"}`].join("\n"),
      risk: outsideWorkspace ? "outside-workspace" : "workspace-command",
      reusableScopes: ["thread", "project", "workspace"],
      grantActionKind: outsideWorkspace ? "file_content_read" : "shell_command",
      grantTargetKind: outsideWorkspace ? "path" : "tool",
      grantTargetLabel: outsideWorkspace ? `MiniCPM-V visual media -> ${videoPath ?? imagePath}` : "MiniCPM-V visual analysis",
      grantTargetHash: permissionGrantHash(
        outsideWorkspace ? "file_content_read" : "shell_command",
        outsideWorkspace ? "path" : "tool",
        `minicpm.visual.analyze\0${imagePath}\0${videoPath ?? ""}\0${referenceImagePath ?? ""}\0${task}\0${allowExternal}\0${frameTimestampMs ?? ""}\0${endpointUrl ?? ""}`,
      ),
      grantConditions: {
        provider: "ambient.desktop",
        operation: "minicpm_visual_analyze",
        ...(imagePath !== "unknown" ? { imagePath } : {}),
        ...(videoPath ? { videoPath } : {}),
        ...(referenceImagePath ? { referenceImagePath } : {}),
        ...(frameTimestampMs !== undefined ? { frameTimestampMs } : {}),
        ...(endpointUrl ? { endpointUrl } : {}),
        task,
        allowExternalMediaPaths: allowExternal,
      },
    },
  };
}

function miniCpmVisionImagePath(input: unknown, objectKey: string, pathKey: string): string | undefined {
  return getStringField(getObjectField(input, objectKey), "path") ?? getStringField(input, pathKey);
}

function classifyMiniCpmVisionSetupPermission(input: PermissionPolicyInput): PermissionDecision {
  const action = getStringField(input.toolInput, "action") ?? "install";
  const runtimeBinaryPath = getStringField(input.toolInput, "runtimeBinaryPath");
  const runtimeArchivePath = getStringField(input.toolInput, "runtimeArchivePath");
  const runtimeArtifactId = getStringField(input.toolInput, "runtimeArtifactId");
  const endpointUrl = getStringField(input.toolInput, "endpointUrl");
  const validationImagePath = getStringField(input.toolInput, "validationImagePath");
  const installRuntime = getBooleanField(input.toolInput, "installRuntime");
  const defaultManagedDownload = action !== "validate" && action !== "uninstall" && !runtimeBinaryPath && !runtimeArchivePath && !endpointUrl && installRuntime !== false;
  return {
    action: "prompt",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: action === "uninstall" ? "Uninstall MiniCPM-V visual provider?" : "Set up MiniCPM-V visual provider?",
      message: action === "uninstall"
        ? "Ambient wants to remove the Ambient-installed MiniCPM-V package copy and managed workspace cache. User-managed llama-server binaries and model caches are preserved."
        : runtimeArchivePath
          ? "Ambient wants to install a pinned MiniCPM-V llama.cpp runtime archive into the workspace-managed runtime cache, verify checksums, and bind the extracted llama-server only after validation."
          : defaultManagedDownload
            ? "Ambient wants to download the pinned MiniCPM-V llama.cpp runtime for this macOS/Linux lane, verify archive and binary checksums, and bind the workspace-managed llama-server only after validation."
          : "Ambient wants to install or validate the first-party MiniCPM-V visual-analysis provider.",
      detail: [
        `Action: ${action}`,
        `Default managed runtime download: ${defaultManagedDownload ? "yes" : "no"}`,
        runtimeBinaryPath ? `Runtime binary: ${runtimeBinaryPath}` : "Runtime binary: auto-detect",
        runtimeArchivePath ? `Runtime archive: ${runtimeArchivePath}` : "Runtime archive: none",
        runtimeArtifactId ? `Runtime artifact: ${runtimeArtifactId}` : "Runtime artifact: auto-select",
        endpointUrl ? `Existing endpoint: ${endpointUrl}` : "Existing endpoint: none",
        validationImagePath ? `Validation image: ${validationImagePath}` : "Validation image: none",
      ].join("\n"),
      risk: "workspace-command",
      reusableScopes: ["thread", "project", "workspace"],
      grantActionKind: "shell_command",
      grantTargetKind: "tool",
      grantTargetLabel: "MiniCPM-V provider setup",
      grantTargetHash: permissionGrantHash("shell_command", "tool", `minicpm.visual.setup\0${action}\0${installRuntime ?? ""}\0${runtimeBinaryPath ?? ""}\0${runtimeArchivePath ?? ""}\0${runtimeArtifactId ?? ""}\0${endpointUrl ?? ""}\0${validationImagePath ?? ""}`),
      grantConditions: {
        provider: "ambient.desktop",
        operation: "minicpm_visual_setup",
        action,
        ...(installRuntime !== undefined ? { installRuntime } : {}),
        ...(runtimeBinaryPath ? { runtimeBinaryPath } : {}),
        ...(runtimeArchivePath ? { runtimeArchivePath } : {}),
        ...(runtimeArtifactId ? { runtimeArtifactId } : {}),
        ...(endpointUrl ? { endpointUrl } : {}),
        ...(validationImagePath ? { validationImagePath } : {}),
      },
    },
  };
}

function classifyLocalModelRuntimeStartPermission(input: PermissionPolicyInput): PermissionDecision {
  const runtimeId = getStringField(input.toolInput, "runtimeId") ?? "unknown";
  const dryRun = getBooleanField(input.toolInput, "dryRun") === true;
  if (dryRun) return { action: "allow" };
  return {
    action: "prompt",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: "Start local model runtime?",
      message: "Ambient wants to start a managed stopped local model runtime from persisted runtime state without installing providers or deleting caches.",
      detail: [
        `Runtime id: ${runtimeId}`,
        "Ambient will re-check runtime inventory load blockers before launching a process.",
      ].join("\n"),
      risk: "workspace-command",
      reusableScopes: ["thread", "project", "workspace"],
      grantActionKind: "shell_command",
      grantTargetKind: "tool",
      grantTargetLabel: `Local model runtime Start: ${runtimeId}`,
      grantTargetHash: permissionGrantHash("shell_command", "tool", `local.model.runtime.start\0${runtimeId}`),
      grantConditions: {
        provider: "ambient.desktop",
        operation: "local_model_runtime_start",
        runtimeId,
      },
    },
  };
}

function classifyLocalModelRuntimeStopPermission(input: PermissionPolicyInput): PermissionDecision {
  const runtimeId = getStringField(input.toolInput, "runtimeId") ?? "unknown";
  const force = getBooleanField(input.toolInput, "force") === true;
  const dryRun = getBooleanField(input.toolInput, "dryRun") === true;
  if (dryRun) return { action: "allow" };
  return {
    action: "prompt",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: force ? "Force local model runtime Stop?" : "Stop local model runtime?",
      message: force
        ? "Ambient wants to force a managed local model runtime stop. Active sub-agent leases still require explicit child cancellation or failure marking before the runtime is killed."
        : "Ambient wants to stop a managed local model runtime without uninstalling models or deleting caches.",
      detail: [
        `Runtime id: ${runtimeId}`,
        `Force requested: ${force ? "yes" : "no"}`,
        "Ambient will re-check runtime inventory stop blockers before terminating a process.",
      ].join("\n"),
      risk: "workspace-command",
      reusableScopes: ["thread", "project", "workspace"],
      grantActionKind: "shell_command",
      grantTargetKind: "tool",
      grantTargetLabel: `Local model runtime Stop: ${runtimeId}`,
      grantTargetHash: permissionGrantHash("shell_command", "tool", `local.model.runtime.stop\0${runtimeId}\0${force}`),
      grantConditions: {
        provider: "ambient.desktop",
        operation: "local_model_runtime_stop",
        runtimeId,
        force,
      },
    },
  };
}

function classifyLocalModelRuntimeRestartPermission(input: PermissionPolicyInput): PermissionDecision {
  const runtimeId = getStringField(input.toolInput, "runtimeId") ?? "unknown";
  const force = getBooleanField(input.toolInput, "force") === true;
  const dryRun = getBooleanField(input.toolInput, "dryRun") === true;
  if (dryRun) return { action: "allow" };
  return {
    action: "prompt",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: force ? "Force local model runtime Restart?" : "Restart local model runtime?",
      message: force
        ? "Ambient wants to force a managed local model runtime restart. Active sub-agent leases still require explicit child cancellation or failure marking before the runtime is killed and relaunched."
        : "Ambient wants to restart a managed local model runtime without reinstalling models or deleting caches.",
      detail: [
        `Runtime id: ${runtimeId}`,
        `Force requested: ${force ? "yes" : "no"}`,
        "Ambient will re-check runtime inventory blockers before stopping and relaunching a process.",
      ].join("\n"),
      risk: "workspace-command",
      reusableScopes: ["thread", "project", "workspace"],
      grantActionKind: "shell_command",
      grantTargetKind: "tool",
      grantTargetLabel: `Local model runtime Restart: ${runtimeId}`,
      grantTargetHash: permissionGrantHash("shell_command", "tool", `local.model.runtime.restart\0${runtimeId}\0${force}`),
      grantConditions: {
        provider: "ambient.desktop",
        operation: "local_model_runtime_restart",
        runtimeId,
        force,
      },
    },
  };
}

async function classifyPlannerModePermission(input: PermissionPolicyInput): Promise<PermissionDecision> {
  const detail = browserToolDetail(input.toolName, input.toolInput) ?? commandToolDetail(input.toolName, input.toolInput);
  const fileTool = permissionPolicyFileToolAccess(input.toolName);
  if (fileTool) {
    const requestedPath = getStringField(input.toolInput, "path");
    if (requestedPath) {
      const pathCheck = await resolvePolicyPath(input.workspacePath, permissionPolicyPathForTool(input.toolName, requestedPath));
      return classifyPlannerToolPermission({
        threadId: input.threadId,
        toolName: input.toolName,
        toolInput: input.toolInput,
        detail: pathCheck.absolutePath,
        outsideWorkspaceDetail: pathCheck.insideWorkspace ? undefined : pathCheck.absolutePath,
        secretPathDetail: isSecretLikePath(pathCheck.absolutePath) ? pathCheck.absolutePath : undefined,
      });
    }
  }

  if (input.toolName === "long_context_process") {
    const paths = getStringArrayField(input.toolInput, "workspacePaths");
    for (const requestedPath of paths) {
      const pathCheck = await resolvePolicyPath(input.workspacePath, requestedPath);
      if (isSecretLikePath(pathCheck.absolutePath) || !pathCheck.insideWorkspace) {
        return classifyPlannerToolPermission({
          threadId: input.threadId,
          toolName: input.toolName,
          toolInput: input.toolInput,
          detail: pathCheck.absolutePath,
          outsideWorkspaceDetail: pathCheck.insideWorkspace ? undefined : pathCheck.absolutePath,
          secretPathDetail: isSecretLikePath(pathCheck.absolutePath) ? pathCheck.absolutePath : undefined,
        });
      }
    }
  }

  if (input.toolName === "bash") {
    const command = getStringField(input.toolInput, "command") ?? "";
    const secretPath = command ? await findSecretCommandPath(input.workspacePath, command) : undefined;
    if (secretPath) {
      return classifyPlannerToolPermission({
        threadId: input.threadId,
        toolName: input.toolName,
        toolInput: input.toolInput,
        detail: `${command}\n\nSensitive path: ${secretPath}`,
        secretPathDetail: secretPath,
      });
    }
    const outsidePath = command ? await findOutsideWorkspaceCommandPath(input.workspacePath, command, input.readOnlyAllowedPaths, input.projectPath) : undefined;
    if (outsidePath) {
      return classifyPlannerToolPermission({
        threadId: input.threadId,
        toolName: input.toolName,
        toolInput: input.toolInput,
        detail: `${command}\n\nOutside path: ${outsidePath}`,
        outsideWorkspaceDetail: outsidePath,
      });
    }
  }

  if (input.toolName === "ambient_visual_analyze") {
    return classifyMiniCpmVisionAnalyzePermission(input);
  }

  return classifyPlannerToolPermission({
    threadId: input.threadId,
    toolName: input.toolName,
    toolInput: input.toolInput,
    detail,
  });
}

function classifyGoogleWorkspaceSetupPermission(input: PermissionPolicyInput): PermissionDecision {
  if (input.toolName === "google_workspace_search_methods") return { action: "allow" };

  if (input.toolName === "google_workspace_materialize_file") {
    if (input.permissionMode === "full-access") return { action: "allow" };
    const handle = getStringField(input.toolInput, "handle") ?? "unknown";
    const requestedPath = getStringField(input.toolInput, "path") ?? `Google Workspace Downloads/${handle}`;
    const overwrite = getBooleanField(input.toolInput, "overwrite") === true;
    const targetLabel = `Google Workspace file -> ${requestedPath}`;
    const actionKind = "local_file_write";
    const targetKind = "path";
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Save Google Workspace file to workspace?",
        message: "Ambient wants to copy a managed Google Workspace file into the current workspace.",
        detail: [`Handle: ${handle}`, `Workspace path: ${requestedPath}`, `Overwrite: ${overwrite ? "yes" : "no"}`].join("\n"),
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantActionKind: actionKind,
        grantTargetKind: targetKind,
        grantTargetLabel: targetLabel,
        grantTargetHash: permissionGrantHash(actionKind, targetKind, `google.workspace.materialize\0${requestedPath}`),
        grantConditions: {
          provider: "google.workspace.cli",
          operation: "materialize_file",
          requestedPath,
          overwrite,
        },
      },
    };
  }

  if (input.toolName === "google_workspace_call") {
    const method = googleWorkspaceMethodFromToolInput(input.toolInput);
    const sideEffect = method?.sideEffect ?? googleWorkspaceSideEffectFromToolInput(input.toolInput);
    if (input.permissionMode === "full-access" && sideEffect === "metadata_read") return { action: "allow" };
    const accountHint = getStringField(input.toolInput, "accountHint");
    const resolvedAccountHint = getStringField(input.toolInput, "resolvedAccountHint");
    const grantAccountHint = resolvedAccountHint ?? accountHint;
    const methodId = getStringField(input.toolInput, "methodId") ?? method?.id ?? "unknown";
    const detail = method
      ? googleWorkspaceMethodApprovalDetail(method, {
          methodId,
          ...(grantAccountHint ? { accountHint: grantAccountHint } : {}),
          params: getObjectField(input.toolInput, "params"),
          body: getUnknownField(input.toolInput, "body"),
          upload: getGoogleWorkspaceUploadField(input.toolInput),
          gmailDraft: getGoogleWorkspaceGmailDraftField(input.toolInput),
          dryRun: getBooleanField(input.toolInput, "dryRun"),
          idempotencyKey: getStringField(input.toolInput, "idempotencyKey"),
        })
      : [
          `Account: ${grantAccountHint ?? "default"}`,
          `Method: ${methodId}`,
          `Side effect: ${sideEffect ?? "unknown"}`,
          `Method metadata: ${googleWorkspaceMethodErrorFromToolInput(input.toolInput) ?? "unavailable"}`,
        ].join("\n");
    const googleTarget = method
      ? googleWorkspaceMethodGrantTarget(method, {
          ...(accountHint ? { accountHint } : {}),
          ...(resolvedAccountHint ? { resolvedAccountHint } : {}),
        })
      : undefined;
    const actionKind = googleTarget?.actionKind ?? (sideEffect === "metadata_read" || sideEffect === "personal_content_read" ? "connector_content_read" : "remote_mutation");
    const targetKind = googleTarget?.targetKind ?? "tool";
    const targetLabel = googleTarget?.label ?? `Google Workspace ${methodId} (${grantAccountHint ?? "default"})`;
    const targetIdentity = googleTarget?.identity ?? (method
      ? googleWorkspaceMethodGrantIdentity(method, { methodId, ...(grantAccountHint ? { accountHint: grantAccountHint } : {}) })
      : `google.workspace.call\0${grantAccountHint ?? "default"}\0${methodId}\0${sideEffect ?? "unknown"}`);
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: googleWorkspaceCallPromptTitle(sideEffect),
        message: googleWorkspaceCallPromptMessage(sideEffect),
        detail,
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantActionKind: actionKind,
        grantTargetKind: targetKind,
        grantTargetLabel: targetLabel,
        grantTargetHash: permissionGrantHash(actionKind, targetKind, targetIdentity),
        grantConditions: googleTarget ? googleWorkspaceGrantConditions(googleTarget, {
          operation: "method_call",
          methodId,
          sideEffect: sideEffect ?? "unknown",
          requestedAccountHint: accountHint ?? "default",
          resolvedAccountHint: resolvedAccountHint ?? grantAccountHint ?? "default",
        }) : {
          provider: "google.workspace.cli",
          accountHint: grantAccountHint ?? "default",
          methodId,
          sideEffect: sideEffect ?? "unknown",
        },
      },
    };
  }

  if (input.toolName === "google_workspace_install_gws") {
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Install Google Workspace CLI?",
        message: "Ambient wants to download and install the pinned Google Workspace CLI sidecar after checksum verification.",
        detail: "This installs an Ambient-managed local binary used for first-party Gmail, Calendar, and Drive integration.",
        risk: "plugin-tool",
      },
    };
  }

  if (input.toolName === "google_workspace_import_oauth_client") {
    const accountHint = getStringField(input.toolInput, "accountHint");
    const sourcePath = getStringField(input.toolInput, "path") ?? getStringField(input.toolInput, "sourcePath") ?? getStringField(input.toolInput, "filePath") ?? "unknown";
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Import Google OAuth client JSON?",
        message: "Ambient wants to validate and copy a downloaded Google Desktop OAuth client JSON into the managed local Google Workspace CLI config.",
        detail: [
          accountHint ? `Account handle: ${accountHint}` : "Account handle: default",
          `Source path: ${sourcePath}`,
          "Secret contents will not be printed in chat or tool results.",
        ].join("\n"),
        risk: "secret-path",
      },
    };
  }

  if (input.toolName === "google_workspace_start_login") {
    const accountHint = getStringField(input.toolInput, "accountHint");
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Start Google sign-in?",
        message: "Ambient wants to open Google OAuth in your browser for the local Google Workspace CLI account.",
        detail: accountHint ? `Account handle: ${accountHint}` : "Account handle: default",
        risk: "browser-network",
      },
    };
  }

  if (input.toolName === "google_workspace_validate_account") {
    const accountHint = getStringField(input.toolInput, "accountHint");
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Validate Google Workspace account?",
        message: "Ambient wants to run Google Workspace read probes through the local CLI to confirm this account is usable.",
        detail: accountHint ? `Account handle: ${accountHint}` : "Account handle: default",
        risk: "plugin-tool",
      },
    };
  }

  return { action: "allow" };
}

function googleWorkspaceCallPromptTitle(sideEffect: GoogleWorkspaceMethodSideEffect | undefined): string {
  if (sideEffect === "external_communication") return "Allow Google Workspace to send external communication?";
  if (sideEffect === "sharing_mutation") return "Allow Google Workspace sharing change?";
  if (sideEffect === "draft_write") return "Allow Google Workspace draft change?";
  if (sideEffect === "data_mutation") return "Allow Google Workspace data mutation?";
  if (sideEffect === "personal_content_read") return "Allow Google Workspace content read?";
  return "Allow Google Workspace API call?";
}

function googleWorkspaceCallPromptMessage(sideEffect: GoogleWorkspaceMethodSideEffect | undefined): string {
  if (sideEffect === "external_communication") return "Ambient wants to call a Google API method that can send external communication.";
  if (sideEffect === "sharing_mutation") return "Ambient wants to call a Google API method that can change sharing or permissions.";
  if (sideEffect === "draft_write") return "Ambient wants to call a Google API method that changes a draft but does not send it.";
  if (sideEffect === "data_mutation") return "Ambient wants to call a Google API method that can mutate Google account data.";
  if (sideEffect === "personal_content_read") return "Ambient wants to call a Google API method that can read personal Google account content.";
  return "Ambient wants to call a mediated Google Workspace API method through the local CLI.";
}

function googleWorkspaceMethodFromToolInput(input: unknown): GoogleWorkspaceMethodSummary | undefined {
  const method = getObjectField(input, "method");
  if (!method || typeof method.error === "string") return undefined;
  if (typeof method.id !== "string" || typeof method.sideEffect !== "string") return undefined;
  return method as unknown as GoogleWorkspaceMethodSummary;
}

function googleWorkspaceSideEffectFromToolInput(input: unknown): GoogleWorkspaceMethodSideEffect | undefined {
  const method = getObjectField(input, "method");
  if (method && typeof method.sideEffect === "string") return method.sideEffect as GoogleWorkspaceMethodSideEffect;
  return undefined;
}

function googleWorkspaceMethodErrorFromToolInput(input: unknown): string | undefined {
  const method = getObjectField(input, "method");
  return typeof method?.error === "string" ? method.error : undefined;
}

async function classifyLongContextToolPermission(input: PermissionPolicyInput): Promise<PermissionDecision> {
  const paths = getStringArrayField(input.toolInput, "workspacePaths");
  if (!paths.length) return { action: "allow" };

  for (const requestedPath of paths) {
    const pathCheck = await resolvePolicyPath(input.workspacePath, requestedPath);
    if (isSecretLikePath(pathCheck.absolutePath)) {
      const envPath = isDotEnvPath(pathCheck.absolutePath);
      return {
        action: "prompt",
        request: {
          threadId: input.threadId,
          toolName: input.toolName,
          title: "Allow long-context access to this sensitive path?",
          message: envPath
            ? "long_context_process wants to read an environment file. Pi may need this file to configure or run the project, but it can contain secrets."
            : "long_context_process wants to read a path that looks like it may contain secrets or credentials.",
          detail: pathCheck.absolutePath,
          risk: "secret-path",
          ...envPathGrantFields(input, pathCheck.absolutePath, input.toolName),
        },
      };
    }
    if (
      !pathCheck.insideWorkspace &&
      !(await isInsideProjectPath(input.projectPath, pathCheck.absolutePath)) &&
      !(await isInsideReadOnlyAllowedPath(input.workspacePath, pathCheck.absolutePath, input.readOnlyAllowedPaths ?? []))
    ) {
      return {
        action: "prompt",
        request: {
          threadId: input.threadId,
          toolName: input.toolName,
          title: "Allow outside-workspace long-context file access?",
          message: `long_context_process wants to read a path outside ${input.workspacePath}.`,
          detail: pathCheck.absolutePath,
          risk: "outside-workspace",
        },
      };
    }
  }

  return { action: "allow" };
}

function classifyBrowserToolPermission(input: PermissionPolicyInput): PermissionDecision {
  const detail = browserToolDetail(input.toolName, input.toolInput);
  if (input.toolName === "browser_login") {
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Allow stored browser credential login?",
        message:
          "Ambient wants to fill a stored credential into the active browser page. The password stays in the credential broker and is not shown to Pi.",
        detail,
        risk: "browser-login",
      },
    };
  }
  if (input.toolName !== "browser_local_preview" && browserProfileModeForPolicy(input.toolInput) === "copied") {
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Allow copied Chrome profile access?",
        message: "Workspace mode requires approval before Ambient uses a copied Chrome profile that may include cookies and login sessions.",
        detail,
        risk: "browser-profile",
      },
    };
  }
  if (
    input.toolName === "browser_eval" ||
    input.toolName === "browser_click" ||
    input.toolName === "browser_get_value" ||
    input.toolName === "browser_wait_for" ||
    input.toolName === "browser_assert" ||
    input.toolName === "browser_keypress" ||
    input.toolName === "browser_pick" ||
    input.toolName === "browser_screenshot" ||
    input.toolName === "browser_cookies"
  ) {
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: "Allow browser page control?",
        message: "Workspace mode requires approval before Ambient controls or inspects the active browser page.",
        detail,
        risk: "browser-control",
      },
    };
  }

  if (
    input.toolName === "browser_search" ||
    input.toolName === "browser_nav" ||
    input.toolName === "browser_local_preview" ||
    input.toolName === "browser_content"
  ) {
    const localPreview = input.toolName === "browser_local_preview";
    return {
      action: "prompt",
      request: {
        threadId: input.threadId,
        toolName: input.toolName,
        title: localPreview ? "Allow local browser preview?" : "Allow browser network access?",
        message: localPreview
          ? "Workspace mode requires approval before Ambient serves a workspace file through its managed local browser preview."
          : "Workspace mode requires approval before Ambient browses external web pages.",
        detail,
        risk: "browser-network",
      },
    };
  }

  return { action: "allow" };
}

export function isDangerousCommand(command: string): boolean {
  return dangerousCommandPatterns.some((pattern) => pattern.test(command));
}

export function isNetworkCommand(command: string): boolean {
  return networkCommandPatterns.some((pattern) => pattern.test(command));
}

export function classifyShellCommandSemanticIntent(command: string): ShellCommandSemanticIntentKind {
  const normalized = command.trim();
  if (!normalized) return "unknown";
  const lower = normalized.toLowerCase();

  if (isBrowserProofShellCommand(lower)) return "browser-proof";
  if (isLocalServerLaunchShellCommand(lower)) return "local-server-launch";
  if (isDependencyArtifactImportShellCommand(lower)) return "dependency-artifact-import";
  if (isProjectRootMaterialWriteShellCommand(lower)) return "project-root-material-write";
  if (isScratchOutputShellCommand(lower)) return "scratch-output";
  if (isProofShellCommand(lower)) return "proof-command";
  return "unknown";
}

export function shellCommandAuditReason(command: string | undefined): string {
  if (!command) return "Allowed workspace-scoped shell command.";
  const intent = classifyShellCommandSemanticIntent(command);
  if (intent === "unknown") return "Allowed workspace-scoped shell command.";
  return `Allowed workspace-scoped ${shellCommandIntentLabel(intent)}.`;
}

export function isManagedSecretPath(path: string): boolean {
  return managedSecretPathPatterns.some((pattern) => pattern.test(path));
}

export function isManagedAuthorityPath(path: string): boolean {
  return managedAuthorityPathPatterns.some((pattern) => pattern.test(path));
}

export function isSecretLikePath(path: string): boolean {
  if (isEnvTemplatePath(path)) return false;
  return secretPathPatterns.some((pattern) => pattern.test(path));
}

export async function resolvePolicyPath(
  workspacePath: string,
  requestedPath: string,
): Promise<{ absolutePath: string; insideWorkspace: boolean }> {
  const absolutePath = resolvePolicyRequestedPath(workspacePath, requestedPath);
  if (!existsSync(workspacePath)) {
    const lexicalWorkspace = resolve(workspacePath);
    return { absolutePath, insideWorkspace: isPathInside(lexicalWorkspace, absolutePath) };
  }
  const realWorkspace = await safeRealpath(workspacePath);
  const anchor = nearestExistingPath(absolutePath);
  const realAnchor = anchor ? await safeRealpath(anchor) : absolutePath;
  return {
    absolutePath,
    insideWorkspace: isPathInside(realWorkspace, realAnchor),
  };
}

export function permissionPolicyPathForTool(toolName: string, requestedPath: string): string {
  if (!localFileToolNames.has(toolName)) return requestedPath;
  const trimmed = requestedPath.trim();
  if (trimmed === "Downloads" || trimmed.startsWith("Downloads/")) return resolve(homedir(), trimmed);
  if (trimmed === "Desktop" || trimmed.startsWith("Desktop/")) return resolve(homedir(), trimmed);
  if (trimmed === "Documents" || trimmed.startsWith("Documents/")) return resolve(homedir(), trimmed);
  return requestedPath;
}

export function isManagedSkillInstallPath(path: string): boolean {
  return managedSkillInstallPathPatterns.some((pattern) => pattern.test(path));
}

function resolvePolicyRequestedPath(workspacePath: string, requestedPath: string): string {
  const trimmed = requestedPath.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return resolve(homedir(), trimmed.slice(2));
  return resolve(workspacePath, trimmed);
}

async function classifyManagedSecretPathAccess(input: PermissionPolicyInput): Promise<PermissionDecision | undefined> {
  const fileTool = fileToolAliases.get(input.toolName);
  if (fileTool) {
    const requestedPath = getStringField(input.toolInput, "path");
    const path = requestedPath ? await resolveManagedSecretPath(input.workspacePath, requestedPath) : undefined;
    if (path) return denyManagedSecretPath(input, path);
  }

  if (input.toolName === "bash") {
    const command = getStringField(input.toolInput, "command");
    const path = command ? await findManagedSecretCommandPath(input.workspacePath, command) : undefined;
    if (path) return denyManagedSecretPath(input, `${command}\n\nManaged secret path: ${path}`);
  }

  for (const requestedPath of collectToolPathStrings(input.toolInput)) {
    const path = await resolveManagedSecretPath(input.workspacePath, requestedPath);
    if (path) return denyManagedSecretPath(input, path);
  }

  return undefined;
}

async function classifyManagedAuthorityPathAccess(input: PermissionPolicyInput): Promise<PermissionDecision | undefined> {
  const fileTool = fileToolAliases.get(input.toolName);
  if (fileTool) {
    const requestedPath = getStringField(input.toolInput, "path");
    const path = requestedPath ? await resolveManagedAuthorityPath(input.workspacePath, requestedPath) : undefined;
    if (path) return denyManagedAuthorityPath(input, path);
  }

  if (input.toolName === "bash") {
    const command = getStringField(input.toolInput, "command");
    const path = command ? await findManagedAuthorityCommandPath(input.workspacePath, command) : undefined;
    if (path) return denyManagedAuthorityPath(input, `${command}\n\nManaged authority path: ${path}`);
  }

  for (const requestedPath of collectToolPathStrings(input.toolInput)) {
    const path = await resolveManagedAuthorityPath(input.workspacePath, requestedPath);
    if (path) return denyManagedAuthorityPath(input, path);
  }

  return undefined;
}

function denyManagedAuthorityPath(input: PermissionPolicyInput, detail: string): PermissionDecision {
  return {
    action: "deny",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: "Blocked Ambient authority state path",
      message: "Ambient-managed authority state is not accessible to agent tools. Use approved app APIs instead of reading or mutating state files.",
      detail: [detail, managedAuthorityApprovedRoute].join("\n"),
      risk: "secret-path",
    },
    reason: "Ambient-managed authority state paths are not exposed to agent tools.",
  };
}

function classifyUnmanagedToolHiveCommandAccess(input: PermissionPolicyInput): PermissionDecision | undefined {
  if (input.toolName !== "bash") return undefined;
  const command = getStringField(input.toolInput, "command");
  if (!command || !isUnmanagedToolHiveCommand(command)) return undefined;
  return {
    action: "prompt",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: "Allow unmanaged ToolHive CLI command?",
      message: "Ambient wants to run ToolHive directly from Bash. Managed MCP install, repair, diagnostics, and uninstall tools are the supported path for Ambient-owned MCP servers.",
      detail: [command, unmanagedToolHiveApprovedRoute].join("\n\n"),
      risk: "workspace-command",
      reusableScopes: ["thread"],
      grantActionKind: "shell_command",
      grantTargetKind: "tool",
      grantTargetLabel: "unmanaged-toolhive-cli",
      grantTargetHash: permissionGrantHash("shell_command", "tool", `unmanaged-toolhive-cli\0${command.trim()}`),
      grantConditions: {
        provider: "ambient.desktop",
        operation: "unmanaged_toolhive_cli",
        command,
      },
    },
  };
}

function isUnmanagedToolHiveCommand(command: string): boolean {
  const words = splitShellWords(command);
  if (words?.some((word) => unmanagedToolHiveExecutableName(word))) return true;
  return /(?:^|[\s;&|([{])(?:\S*\/)?(?:thv|toolhive)(?:\s|$)/i.test(command);
}

function unmanagedToolHiveExecutableName(token: string): boolean {
  const executable = token.trim().split("/").pop()?.toLowerCase();
  return executable === "thv" || executable === "toolhive" || executable === "thv.exe" || executable === "toolhive.exe";
}

function denyManagedSecretPath(input: PermissionPolicyInput, detail: string): PermissionDecision {
  return {
    action: "deny",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: "Blocked Ambient-managed secret path",
      message: "Ambient-managed secret files are not accessible to agent tools. Use an approved secret broker or capability-specific binding instead.",
      detail: [detail, managedSecretApprovedRoute].join("\n"),
      risk: "secret-path",
    },
    reason: "Ambient-managed secret paths are not exposed to agent tools.",
  };
}

function managedSkillInstallPrompt(input: {
  input: PermissionPolicyInput;
  path: string;
  operation: string;
  commandClass: string;
  reason: string;
  command?: string;
}): PermissionPrompt {
  return {
    threadId: input.input.threadId,
    toolName: input.input.toolName,
    title: "Allow managed skill install write?",
    message: "Ambient wants to write to a managed agent skill directory outside the active workspace.",
    detail: [
      `Path: ${input.path}`,
      `Operation: ${input.operation}`,
      `Command class: ${input.commandClass}`,
      `Reason: ${input.reason}`,
      managedSkillInstallerApprovedRoute,
      input.command ? `Command: ${input.command}` : undefined,
    ].filter(Boolean).join("\n"),
    risk: "outside-workspace",
    reusableScopes: ["thread", "project", "workspace"],
    grantActionKind: "local_file_write",
    grantTargetKind: "path",
    grantTargetLabel: input.path,
    grantTargetHash: permissionGrantHash("local_file_write", "path", input.path),
    grantConditions: {
      provider: "ambient.desktop",
      operation: input.operation,
      path: input.path,
      managedInstallKind: "agent-skill",
      commandClass: input.commandClass,
    },
  };
}

function classifyLocalDeepResearchSetupPermission(input: PermissionPolicyInput): PermissionDecision {
  const action = getStringField(input.toolInput, "action") ?? "status";
  if (action !== "install" && action !== "repair" && action !== "smoke") return { action: "allow" };

  const installerShape = getObjectField(input.toolInput, "installerShape");
  const runtime = getObjectField(installerShape, "runtime");
  const disk = getObjectField(installerShape, "disk");
  const memory = getObjectField(installerShape, "memory");
  const server = getObjectField(installerShape, "server");
  const modelProfileId = getStringField(installerShape, "modelProfileId") ?? "unknown";
  const quantization = getStringField(installerShape, "quantization") ?? "unknown";
  const runtimeArtifactId = getStringField(runtime, "selectedArtifactId") ?? "auto";
  const targetLabel = `Local Deep Research ${action}:${modelProfileId}:${quantization}`;
  const actionKind: PermissionGrantActionKind = "plugin_tool_execute";
  const targetKind = "tool";

  return {
    action: "prompt",
    request: {
      threadId: input.threadId,
      toolName: input.toolName,
      title: localDeepResearchSetupPromptTitle(action),
      message: localDeepResearchSetupPromptMessage(action),
      detail: localDeepResearchSetupPromptDetail({ action, installerShape, runtime, disk, memory, server }),
      risk: "plugin-tool",
      reusableScopes: ["thread", "project", "workspace"],
      grantActionKind: actionKind,
      grantTargetKind: targetKind,
      grantTargetLabel: targetLabel,
      grantTargetHash: permissionGrantHash(actionKind, targetKind, `local.deep-research.setup\0${action}\0${modelProfileId}\0${quantization}\0${runtimeArtifactId}`),
      grantConditions: {
        provider: "ambient.desktop",
        operation: "ambient_local_deep_research_setup",
        action,
        installerShapeSchemaVersion: getStringField(installerShape, "schemaVersion") ?? "unavailable",
        modelProfileId,
        quantization,
        runtimeArtifactId,
        expectedDiskBytes: getNumberField(disk, "expectedDiskBytes"),
        estimatedResidentMemoryBytes: getNumberField(memory, "estimatedResidentMemoryBytes"),
        serverHost: getStringField(server, "host") ?? "127.0.0.1",
        serverPort: getStringField(server, "port") ?? "auto",
      },
    },
  };
}

function localDeepResearchSetupPromptTitle(action: "install" | "repair" | "smoke"): string {
  if (action === "repair") return "Repair Local Deep Research install?";
  if (action === "smoke") return "Run Local Deep Research smoke?";
  return "Install Local Deep Research model?";
}

function localDeepResearchSetupPromptMessage(action: "install" | "repair" | "smoke"): string {
  if (action === "smoke") {
    return "Ambient wants to start the managed local LiteResearcher model through llama.cpp for a smoke-test query.";
  }
  if (action === "repair") {
    return "Ambient wants to verify or redownload managed Local Deep Research model/runtime assets.";
  }
  return "Ambient wants to download and install managed Local Deep Research model/runtime assets.";
}

function localDeepResearchSetupPromptDetail(input: {
  action: "install" | "repair" | "smoke";
  installerShape?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
  disk?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  server?: Record<string, unknown>;
}): string {
  if (!input.installerShape) {
    return [
      `Action: ${input.action}`,
      "Installer shape: unavailable",
      "Run ambient_local_deep_research_setup action=status first if the user needs exact model, disk, memory, or server-port facts before approving.",
    ].join("\n");
  }
  const reasons = getArrayField(getObjectField(input.installerShape, "confirmation"), "reasons")
    .filter((value): value is string => typeof value === "string");
  return [
    `Action: ${input.action}`,
    `Model family: ${getStringField(input.installerShape, "modelFamily") ?? "unknown"}`,
    `Profile: ${getStringField(input.installerShape, "modelProfileId") ?? "unknown"} (${getStringField(input.installerShape, "quantization") ?? "unknown"})`,
    `Expected disk: ${formatPermissionBytes(getNumberField(input.disk, "expectedDiskBytes"))} (model ${formatPermissionBytes(getNumberField(input.disk, "modelDownloadBytes"))}; runtime ${formatPermissionBytes(getNumberField(input.disk, "runtimeDownloadBytes"))})`,
    `Estimated resident memory: ${formatPermissionBytes(getNumberField(input.memory, "estimatedResidentMemoryBytes"))}`,
    `Memory fit: ${getStringField(input.memory, "fit") ?? "unknown"} on ${getStringField(input.memory, "memoryTier") ?? "unknown"} tier`,
    `Active local models: ${getNumberField(input.memory, "activeLocalModelCount") ?? 0} (${formatPermissionBytes(getNumberField(input.memory, "activeLocalModelEstimatedResidentMemoryBytes"))} estimated resident)`,
    `Runtime: ${getStringField(input.runtime, "source") ?? "unknown"} ${getStringField(input.runtime, "selectedArtifactId") ?? "auto"}`,
    `Server: ${getStringField(input.server, "host") ?? "127.0.0.1"}:${getStringField(input.server, "port") ?? "auto"} (${getStringField(input.server, "portAllocation") ?? "loopback-auto-on-launch"})`,
    "Progress: local-deep-research-install-progress events",
    "Cancellation: cancel the tool call; partial model downloads are resumable",
    "Logs: .ambient/local-deep-research/install-jobs and .ambient/local-deep-research/llama-server",
    "Cleanup: Ambient-managed model/runtime cleanup from settings-managed state",
    ...reasons.map((reason) => `Reason: ${reason}`),
  ].join("\n");
}

function formatPermissionBytes(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "unknown";
  const mib = value / (1024 ** 2);
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(2)} GiB`;
}

function isManagedSkillInstallCommand(command: string, path: string): boolean {
  if (!isManagedSkillInstallPath(path)) return false;
  const lower = command.toLowerCase();
  return /\b(?:mkdir|cp|mv|touch|tee|install|unzip|tar)\b/.test(lower) ||
    /\bgit\s+clone\b/.test(lower) ||
    /(?:^|[\s])(?:>|>>)\s*/.test(lower);
}

function shellCommandPathPrompt(
  input: PermissionPolicyInput,
  command: string,
  path: string,
  intent: ShellCommandSemanticIntentKind,
  risk: "outside-workspace" | "secret-path",
): PermissionPrompt {
  const pathLabel = risk === "outside-workspace" ? "Outside path" : "Sensitive path";
  const envPath = risk === "secret-path" && isDotEnvPath(path);
  const envGrantFields = envPath ? envPathGrantFields(input, path, "bash") : {};
  const outsidePathGrantFields =
    risk === "outside-workspace" ? outsideWorkspaceShellPathGrantFields(path, command, intent) : {};
  const approvedRoute = risk === "outside-workspace" ? outsideWorkspaceApprovedRoute : undefined;
  if (intent === "unknown") {
    return {
      threadId: input.threadId,
      toolName: input.toolName,
      title: risk === "outside-workspace" ? "Allow outside-workspace shell access?" : "Allow shell access to this sensitive path?",
      message:
        risk === "outside-workspace"
          ? "Workspace mode requires approval for shell commands that reference paths outside the project."
          : envPath
            ? "Workspace mode requires approval before shell commands access environment files. Pi may need this file to configure or run the project, but it can contain secrets."
            : "Workspace mode requires approval before shell commands access paths that look like secrets or credentials.",
      detail: [command, "", `${pathLabel}: ${path}`, approvedRoute].filter((line) => line !== undefined).join("\n"),
      risk,
      ...envGrantFields,
      ...outsidePathGrantFields,
    };
  }

  return {
    threadId: input.threadId,
    toolName: input.toolName,
    title: risk === "outside-workspace" ? `${shellCommandIntentTitleVerb(intent)} with outside-workspace path?` : `${shellCommandIntentTitleVerb(intent)} with sensitive path?`,
    message:
      risk === "outside-workspace"
        ? `${shellCommandIntentSubject(intent)} references a path outside ${input.workspacePath}.`
        : envPath
          ? `${shellCommandIntentSubject(intent)} references an environment file. Pi may need this file to configure or run the project, but it can contain secrets.`
          : `${shellCommandIntentSubject(intent)} references a path that looks like it may contain secrets or credentials.`,
    detail: [`Intent: ${shellCommandIntentLabel(intent)}`, `Command: ${command}`, `${pathLabel}: ${path}`, approvedRoute].filter(Boolean).join("\n"),
    risk,
    ...envGrantFields,
    ...outsidePathGrantFields,
  };
}

function outsideWorkspacePathDetail(path: string): string {
  return [path, outsideWorkspaceApprovedRoute].join("\n");
}

function outsideWorkspaceShellPathGrantFields(
  path: string,
  command: string,
  intent: ShellCommandSemanticIntentKind,
): Pick<PermissionPrompt, "reusableScopes" | "grantActionKind" | "grantTargetKind" | "grantTargetLabel" | "grantTargetHash" | "grantConditions"> {
  const actionKind: PermissionGrantActionKind = "local_file_write";
  return {
    reusableScopes: ["thread", "project", "workspace"],
    grantActionKind: actionKind,
    grantTargetKind: "path",
    grantTargetLabel: path,
    grantTargetHash: permissionGrantHash(actionKind, "path", path),
    grantConditions: {
      provider: "ambient.desktop",
      operation: "bash",
      path,
      command,
      commandClass: shellCommandIntentLabel(intent),
    },
  };
}

function envPathGrantFields(
  input: PermissionPolicyInput,
  path: string,
  operation: string,
): Pick<PermissionPrompt, "reusableScopes" | "grantActionKind" | "grantTargetKind" | "grantTargetLabel" | "grantTargetHash" | "grantConditions"> {
  const actionKind: PermissionGrantActionKind = "secret_path_read";
  return {
    reusableScopes: standardPathReusableScopes(input),
    grantActionKind: actionKind,
    grantTargetKind: "path",
    grantTargetLabel: path,
    grantTargetHash: permissionGrantHash(actionKind, "path", path),
    grantConditions: {
      provider: "ambient.desktop",
      operation,
      path,
      sensitivePathKind: "dotenv",
    },
  };
}

function standardPathReusableScopes(input: PermissionPolicyInput): PermissionGrantScopeKind[] {
  const scopes: PermissionGrantScopeKind[] = ["thread"];
  if (input.projectPath) scopes.push("project");
  if (input.workspacePath) scopes.push("workspace");
  return scopes;
}

function shellCommandIntentLabel(intent: ShellCommandSemanticIntentKind): string {
  if (intent === "proof-command") return "proof command";
  if (intent === "scratch-output") return "scratch proof output";
  return intent.replace(/-/g, " ");
}

function shellCommandIntentTitleVerb(intent: ShellCommandSemanticIntentKind): string {
  if (intent === "proof-command") return "Run proof command";
  if (intent === "scratch-output") return "Write scratch proof output";
  if (intent === "dependency-artifact-import") return "Import dependency artifacts";
  if (intent === "browser-proof") return "Run browser proof";
  if (intent === "local-server-launch") return "Launch local server";
  if (intent === "project-root-material-write") return "Write project deliverable";
  return "Run shell command";
}

function shellCommandIntentSubject(intent: ShellCommandSemanticIntentKind): string {
  if (intent === "proof-command") return "A proof command";
  if (intent === "scratch-output") return "A scratch proof output command";
  return `A ${shellCommandIntentLabel(intent)}`;
}

function isProofShellCommand(lowerCommand: string): boolean {
  return (
    /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:test|check|lint|typecheck|verify)\b/.test(lowerCommand) ||
    /\b(?:vitest|jest|mocha|ava|tsx|tsc|eslint)\b/.test(lowerCommand) ||
    /\bnode\s+(?:--check|--test)\b/.test(lowerCommand) ||
    /\bnode\b[^\n;&|]*\b(?:tests?|spec|verify|check|proof)[\w./-]*\.(?:mjs|cjs|js|ts)\b/.test(lowerCommand) ||
    /\bnode\s+--input-type=module\s+-e\b/.test(lowerCommand) ||
    /\b(?:verify|check|test|proof)[\w./-]*\.(?:mjs|cjs|js|ts)\b/.test(lowerCommand)
  );
}

function isScratchOutputShellCommand(lowerCommand: string): boolean {
  return (
    /(?:^|[\s])(?:>|1>|2>|&>)\s*(?:\/dev\/null|\/tmp\/|\/var\/tmp\/|\.ambient\/|\.ambient-codex\/|tmp\/|temp\/|test-results\/|reports?\/)/.test(lowerCommand) ||
    /\b(?:tee|cp|mv)\b[^\n;&|]*(?:\/tmp\/|\/var\/tmp\/|\.ambient\/|\.ambient-codex\/|tmp\/|temp\/|test-results\/|reports?\/)/.test(lowerCommand)
  );
}

function isDependencyArtifactImportShellCommand(lowerCommand: string): boolean {
  return lowerCommand.includes(".ambient/dependency-artifacts") || lowerCommand.includes("dependency-artifacts/manifest.json");
}

function isLocalServerLaunchShellCommand(lowerCommand: string): boolean {
  return (
    /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:dev|start|preview|serve)\b/.test(lowerCommand) ||
    /\b(?:vite|next|astro|svelte-kit|webpack-dev-server|http-server|serve)\b/.test(lowerCommand) ||
    /\bpython(?:3)?\s+-m\s+http\.server\b/.test(lowerCommand)
  );
}

function isBrowserProofShellCommand(lowerCommand: string): boolean {
  return /\b(?:playwright|cypress)\b/.test(lowerCommand) || /\bbrowser[-_ ]proof\b/.test(lowerCommand);
}

function isProjectRootMaterialWriteShellCommand(lowerCommand: string): boolean {
  return /\b(?:git\s+apply|git\s+add|apply to root|apply-to-root|integration queue|project-root)\b/.test(lowerCommand);
}

async function resolveManagedAuthorityPath(workspacePath: string, requestedPath: string): Promise<string | undefined> {
  const pathCheck = await resolvePolicyPath(workspacePath, requestedPath);
  return isManagedAuthorityPath(pathCheck.absolutePath) || isManagedAuthorityPath(requestedPath) ? pathCheck.absolutePath : undefined;
}

async function resolveManagedSecretPath(workspacePath: string, requestedPath: string): Promise<string | undefined> {
  const pathCheck = await resolvePolicyPath(workspacePath, requestedPath);
  return isManagedSecretPath(pathCheck.absolutePath) || isManagedSecretPath(requestedPath) ? pathCheck.absolutePath : undefined;
}

async function findOutsideWorkspaceCommandPath(
  workspacePath: string,
  command: string,
  readOnlyAllowedPaths: string[] = [],
  projectPath?: string,
): Promise<string | undefined> {
  const allowReadOnlyOutsidePaths =
    readOnlyAllowedPaths.length > 0 &&
    (isReadOnlyShellInspectionCommand(command) || (await isReadOnlyDependencyImportCommand(workspacePath, command, readOnlyAllowedPaths)));
  for (const candidate of extractCommandPathCandidates(command)) {
    const pathCheck = await resolvePolicyPath(workspacePath, candidate);
    if (!pathCheck.insideWorkspace && (await isInsideProjectPath(projectPath, pathCheck.absolutePath))) continue;
    if (!pathCheck.insideWorkspace && allowReadOnlyOutsidePaths && (await isInsideReadOnlyAllowedPath(workspacePath, pathCheck.absolutePath, readOnlyAllowedPaths))) {
      continue;
    }
    if (!pathCheck.insideWorkspace) return pathCheck.absolutePath;
  }
  return undefined;
}

async function isInsideReadOnlyAllowedPath(workspacePath: string, absolutePath: string, readOnlyAllowedPaths: string[]): Promise<boolean> {
  if (readOnlyAllowedPaths.length === 0) return false;
  const anchor = nearestExistingPath(absolutePath);
  const realAnchor = anchor ? await safeRealpath(anchor) : resolve(absolutePath);
  for (const allowedPath of readOnlyAllowedPaths) {
    const trimmed = allowedPath.trim();
    if (!trimmed) continue;
    const allowedAbsolute = resolvePolicyRequestedPath(workspacePath, trimmed);
    if (isPathInside(allowedAbsolute, absolutePath)) return true;
    if (!existsSync(allowedAbsolute)) continue;
    const realAllowed = await safeRealpath(allowedAbsolute);
    if (isPathInside(realAllowed, realAnchor)) return true;
  }
  return false;
}

async function isInsideProjectPath(projectPath: string | undefined, absolutePath: string): Promise<boolean> {
  if (!projectPath?.trim()) return false;
  const projectAbsolute = resolve(projectPath);
  if (isPathInside(projectAbsolute, absolutePath)) return true;
  if (!existsSync(projectAbsolute)) return false;
  const anchor = nearestExistingPath(absolutePath);
  const realAnchor = anchor ? await safeRealpath(anchor) : resolve(absolutePath);
  const realProject = await safeRealpath(projectAbsolute);
  return isPathInside(realProject, realAnchor);
}

function isReadOnlyShellInspectionCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (/[>|;&`]/.test(trimmed) || /\$\(/.test(trimmed) || /\b(?:-exec|-delete)\b/.test(trimmed)) return false;
  const executable = trimmed.match(/^([^\s]+)/)?.[1]?.split("/").pop() ?? "";
  return new Set(["cat", "ls", "find", "sed", "head", "tail", "wc", "grep", "rg", "file", "stat"]).has(executable);
}

async function isReadOnlyDependencyImportCommand(workspacePath: string, command: string, readOnlyAllowedPaths: string[]): Promise<boolean> {
  const segments = splitSimpleShellConjunctions(command);
  if (!segments?.length) return false;
  let importsReadOnlyDependency = false;
  for (const segment of segments) {
    if (await isReadOnlyDependencyCopySegmentIntoWorkspace(workspacePath, segment, readOnlyAllowedPaths)) {
      importsReadOnlyDependency = true;
      continue;
    }
    if (await isWorkspaceScopedShellSegment(workspacePath, segment)) continue;
    return false;
  }
  return importsReadOnlyDependency;
}

async function isReadOnlyDependencyCopySegmentIntoWorkspace(
  workspacePath: string,
  command: string,
  readOnlyAllowedPaths: string[],
): Promise<boolean> {
  const tokens = splitShellWords(command);
  if (!tokens?.length || shellExecutableBaseName(tokens[0]) !== "cp") return false;

  const operands: string[] = [];
  let targetDirectory: string | undefined;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--") {
      operands.push(...tokens.slice(index + 1));
      break;
    }
    if (token === "-t" || token === "--target-directory") {
      index += 1;
      targetDirectory = tokens[index];
      continue;
    }
    if (token.startsWith("--target-directory=")) {
      targetDirectory = token.slice("--target-directory=".length);
      continue;
    }
    if (token.startsWith("-")) continue;
    operands.push(token);
  }

  const destination = targetDirectory ?? operands.at(-1);
  const sources = targetDirectory ? operands : operands.slice(0, -1);
  if (!destination || sources.length === 0) return false;
  const destinationCheck = await resolvePolicyPath(workspacePath, destination);
  if (!destinationCheck.insideWorkspace) return false;

  let hasReadOnlyDependencySource = false;
  for (const source of sources) {
    const sourceCheck = await resolvePolicyPath(workspacePath, source);
    if (sourceCheck.insideWorkspace) continue;
    if (!(await isInsideReadOnlyAllowedPath(workspacePath, sourceCheck.absolutePath, readOnlyAllowedPaths))) return false;
    hasReadOnlyDependencySource = true;
  }
  return hasReadOnlyDependencySource;
}

async function isWorkspaceScopedShellSegment(workspacePath: string, command: string): Promise<boolean> {
  if (!command.trim() || isDangerousCommand(command) || isNetworkCommand(command)) return false;
  for (const candidate of extractCommandPathCandidates(command)) {
    const pathCheck = await resolvePolicyPath(workspacePath, candidate);
    if (!pathCheck.insideWorkspace) return false;
  }
  return true;
}

function splitSimpleShellConjunctions(command: string): string[] | undefined {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "&") {
      if (command[index + 1] !== "&") return undefined;
      const segment = current.trim();
      if (!segment || segment.includes("$(")) return undefined;
      segments.push(segment);
      current = "";
      index += 1;
      continue;
    }
    if (char === "|" || char === ";" || char === "<" || char === ">" || char === "`" || char === "\n" || char === "\r") return undefined;
    current += char;
  }
  if (quote || escaped || current.includes("$(")) return undefined;
  const segment = current.trim();
  if (!segment) return undefined;
  segments.push(segment);
  return segments;
}

function splitShellWords(command: string): string[] | undefined {
  const words: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote || escaped) return undefined;
  if (current) words.push(current);
  return words;
}

function shellExecutableBaseName(executable: string): string {
  return executable.split("/").pop() ?? executable;
}

async function findSecretCommandPath(workspacePath: string, command: string): Promise<string | undefined> {
  for (const candidate of extractCommandPathCandidates(command)) {
    const pathCheck = await resolvePolicyPath(workspacePath, candidate);
    if (isSecretLikePath(pathCheck.absolutePath) || isSecretLikePath(candidate)) return pathCheck.absolutePath;
  }
  return undefined;
}

async function findManagedAuthorityCommandPath(workspacePath: string, command: string): Promise<string | undefined> {
  for (const candidate of extractCommandPathCandidates(command)) {
    const pathCheck = await resolvePolicyPath(workspacePath, candidate);
    if (isManagedAuthorityPath(pathCheck.absolutePath) || isManagedAuthorityPath(candidate)) return pathCheck.absolutePath;
  }
  return undefined;
}

async function findManagedSecretCommandPath(workspacePath: string, command: string): Promise<string | undefined> {
  for (const candidate of extractCommandPathCandidates(command)) {
    const pathCheck = await resolvePolicyPath(workspacePath, candidate);
    if (isManagedSecretPath(pathCheck.absolutePath) || isManagedSecretPath(candidate)) return pathCheck.absolutePath;
  }
  return undefined;
}

export function extractCommandPathCandidates(command: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const addCandidate = (rawToken: string, options: { shellWord?: boolean } = {}) => {
    const token = normalizeCommandPathToken(rawToken);
    if (options.shellWord && !isShellWordPathCandidate(token)) return;
    if (!options.shellWord && isBroadCommandScanPathFalsePositive(token)) return;
    if (!token || !isCommandPathCandidate(token)) return;
    const path = token.startsWith("~/") ? resolve(process.env.HOME ?? "/", token.slice(2)) : token;
    if (seen.has(path)) return;
    seen.add(path);
    candidates.push(path);
  };
  for (const match of command.matchAll(/(?:^|[\s="'`([{<>])([^\s"'`;&|)<>]+)/g)) {
    addCandidate(match[1]);
  }
  for (const word of splitShellWords(command) ?? []) {
    addCandidate(word, { shellWord: true });
  }
  return candidates;
}

function normalizeCommandPathToken(token: string): string {
  return token.trim().replace(/[,\]}]+$/g, "");
}

function isBroadCommandScanPathFalsePositive(token: string): boolean {
  return token === "/";
}

function isShellWordPathCandidate(token: string): boolean {
  return (
    isAbsolute(token) ||
    token.startsWith("~/") ||
    token.startsWith("../") ||
    token.startsWith("./") ||
    token.startsWith(".") ||
    isManagedAuthorityPath(token) ||
    isManagedSecretPath(token) ||
    isSecretLikePath(token)
  );
}

function isCommandPathCandidate(token: string): boolean {
  if (!token || token.startsWith("-")) return false;
  if (isShellNullDevicePath(token)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token)) return false;
  if (isLikelyInlineCodePathFalsePositive(token)) return false;
  return (
    isAbsolute(token) ||
    token.startsWith("~/") ||
    token.startsWith("../") ||
    token.startsWith("./") ||
    token.startsWith(".") ||
    token.includes("/") ||
    isSecretLikePath(token)
  );
}

function isShellNullDevicePath(token: string): boolean {
  return token === "/dev/null";
}

function isLikelyInlineCodePathFalsePositive(token: string): boolean {
  if (token === "//") return true;
  if (/^\/(?:[\^#.[(*+?{\\$])/.test(token)) return true;
  return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\(\/(?:[\^#.[(*+?{\\$])/.test(token);
}

function collectToolPathStrings(input: unknown): string[] {
  const paths: string[] = [];
  collectToolPathStringsInto(input, paths);
  return paths;
}

function collectToolPathStringsInto(input: unknown, paths: string[]): void {
  if (!input || typeof input !== "object") return;
  if (Array.isArray(input)) {
    for (const item of input) collectToolPathStringsInto(item, paths);
    return;
  }
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && managedSecretPathFieldNames.has(key)) {
      paths.push(value);
    } else if (value && typeof value === "object") {
      collectToolPathStringsInto(value, paths);
    }
  }
}

const managedSecretPathFieldNames = new Set([
  "path",
  "outputPath",
  "workspacePath",
  "imagePath",
  "videoPath",
  "referenceImagePath",
  "runtimeBinaryPath",
  "runtimeArchivePath",
  "validationImagePath",
]);

function getStringField(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object" || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function getNumberField(input: unknown, key: string): number | undefined {
  if (!input || typeof input !== "object" || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getObjectField(input: unknown, key: string): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object" || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function getGoogleWorkspaceUploadField(input: unknown): { path: string; mimeType?: string } | undefined {
  const upload = getObjectField(input, "upload");
  const path = getStringField(upload, "path")?.trim();
  if (!path) return undefined;
  const mimeType = getStringField(upload, "mimeType")?.trim();
  return {
    path,
    ...(mimeType ? { mimeType } : {}),
  };
}

function getGoogleWorkspaceGmailDraftField(input: unknown): GoogleWorkspaceCallInput["gmailDraft"] | undefined {
  const draft = getObjectField(input, "gmailDraft");
  if (!draft) return undefined;
  const attachments = getArrayField(draft, "attachments").flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const path = getStringField(item, "path")?.trim();
    if (!path) return [];
    const fileName = getStringField(item, "fileName")?.trim();
    const mimeType = getStringField(item, "mimeType")?.trim();
    return [{
      path,
      ...(fileName ? { fileName } : {}),
      ...(mimeType ? { mimeType } : {}),
    }];
  });
  return {
    ...(getStringOrStringArrayField(draft, "to") ? { to: getStringOrStringArrayField(draft, "to") } : {}),
    ...(getStringOrStringArrayField(draft, "cc") ? { cc: getStringOrStringArrayField(draft, "cc") } : {}),
    ...(getStringOrStringArrayField(draft, "bcc") ? { bcc: getStringOrStringArrayField(draft, "bcc") } : {}),
    ...(getStringOrStringArrayField(draft, "from") ? { from: getStringOrStringArrayField(draft, "from") } : {}),
    ...(getStringOrStringArrayField(draft, "replyTo") ? { replyTo: getStringOrStringArrayField(draft, "replyTo") } : {}),
    ...(getStringField(draft, "subject")?.trim() ? { subject: getStringField(draft, "subject")!.trim() } : {}),
    ...(getStringField(draft, "textBody")?.trim() ? { textBody: getStringField(draft, "textBody")!.trim() } : {}),
    ...(getStringField(draft, "htmlBody")?.trim() ? { htmlBody: getStringField(draft, "htmlBody")!.trim() } : {}),
    ...(getStringField(draft, "body")?.trim() ? { body: getStringField(draft, "body")!.trim() } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
}

function getUnknownField(input: unknown, key: string): unknown {
  if (!input || typeof input !== "object" || !(key in input)) return undefined;
  return (input as Record<string, unknown>)[key];
}

function getStringArrayField(input: unknown, key: string): string[] {
  if (!input || typeof input !== "object" || !(key in input)) return [];
  const value = (input as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getStringOrStringArrayField(input: unknown, key: string): string | string[] | undefined {
  if (!input || typeof input !== "object" || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  return items.length ? items : undefined;
}

function getArrayField(input: unknown, key: string): unknown[] {
  if (!input || typeof input !== "object" || !(key in input)) return [];
  const value = (input as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function getBooleanField(input: unknown, key: string): boolean | undefined {
  if (!input || typeof input !== "object" || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

function permissionGrantHash(actionKind: string, targetKind: string, identity: string): string {
  return createHash("sha256").update(`${actionKind}\0${targetKind}\0${identity}`).digest("hex");
}

function browserProfileModeForPolicy(input: unknown): "isolated" | "copied" {
  return getStringField(input, "profileMode") === "copied" ? "copied" : "isolated";
}

function browserToolDetail(toolName: string, input: unknown): string | undefined {
  if (toolName === "browser_search") return getStringField(input, "query");
  if (toolName === "browser_nav" || toolName === "browser_content") return getStringField(input, "url");
  if (toolName === "browser_local_preview") return getStringField(input, "path") ?? getStringField(input, "filePath");
  if (toolName === "browser_eval") return getStringField(input, "code");
  if (toolName === "browser_click" || toolName === "browser_get_value" || toolName === "browser_wait_for" || toolName === "browser_assert") {
    return getStringField(input, "selector") ?? getStringField(input, "text");
  }
  if (toolName === "browser_pick") return getStringField(input, "prompt");
  if (toolName === "browser_login") {
    const credentialId = getStringField(input, "credentialId") ?? "unknown";
    const credentialLabel = getStringField(input, "credentialLabel");
    const credential = credentialLabel ? `${credentialLabel} (${credentialId})` : credentialId;
    return [
      `Credential: ${credential}`,
      `Origin: ${getStringField(input, "expectedOrigin") ?? "unknown"}`,
      `Current URL: ${getStringField(input, "currentUrl") ?? "unknown"}`,
      `Username: ${getStringField(input, "username") ?? "unknown"}`,
      `Profile: ${browserProfileModeForPolicy(input)}`,
      `Submit: ${getBooleanField(input, "submit") === false ? "no" : "yes"}`,
      `Username selector: ${getStringField(input, "usernameSelector") ?? "auto"}`,
      `Password selector: ${getStringField(input, "passwordSelector") ?? "auto"}`,
      `Submit selector: ${getStringField(input, "submitSelector") ?? "auto"}`,
    ].join("\n");
  }
  return undefined;
}

function commandToolDetail(toolName: string, input: unknown): string | undefined {
  if (toolName === "bash") return getStringField(input, "command");
  return getStringField(input, "path");
}

function nearestExistingPath(path: string): string | undefined {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return current;
}

async function safeRealpath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}
