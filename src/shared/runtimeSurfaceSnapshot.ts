import type { MediaPlaybackSettings, SttSettings, VoiceSettings } from "./localRuntimeTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionRequest } from "./permissionTypes";
import type { PlannerSettings } from "./plannerTypes";
import type { ProjectSummary } from "./projectBoardTypes";
import type { ThreadSummary } from "./threadTypes";
import type { SearchRoutingSettings } from "./webResearchTypes";
import type { WorkflowAgentFolderSummary } from "./workflowTypes";
import type { WorkspaceState } from "./workspaceTypes";
import type { RuntimeSurfaceSnapshot, RuntimeSurfaceWorkflowRecoveryEvent } from "./messagingGateway";
import type { RuntimeSurfaceRelaySummary } from "./messagingGateway";
import { buildHeadlessSettingsCatalog } from "./headlessSettingsCatalog";
import { projectIdFromWorkspacePath } from "./projectIdentity";

export type { RuntimeSurfaceSnapshot } from "./messagingGateway";

export interface RuntimeSurfaceSnapshotInput {
  workspace: WorkspaceState;
  activeThreadId?: string;
  threads: ThreadSummary[];
  workflowFolders: WorkflowAgentFolderSummary[];
  settings?: {
    voice?: VoiceSettings;
    stt?: SttSettings;
    search?: SearchRoutingSettings;
    media?: MediaPlaybackSettings;
    planner?: PlannerSettings;
  };
  permissionRequests?: PermissionRequest[];
  permissionGrants?: AmbientPermissionGrant[];
  permissionAudit?: PermissionAuditEntry[];
  workflowRecoveryEvents?: RuntimeSurfaceWorkflowRecoveryEvent[];
  relaySummaries?: RuntimeSurfaceRelaySummary[];
  projects?: ProjectSummary[];
  limit?: number;
}

export function buildRuntimeSurfaceSnapshot(input: RuntimeSurfaceSnapshotInput): RuntimeSurfaceSnapshot {
  const limit = Math.max(1, Math.min(25, Math.floor(input.limit ?? 10)));
  const activeWorkspacePath = input.workspace.path;
  const fallbackProject = projectSummaryFromSnapshotInput(input);
  const projectSource = input.projects?.length ? input.projects : [fallbackProject];
  const projects = uniqueProjects(projectSource)
    .slice(0, limit)
    .map((project) => ({
      id: project.path,
      name: project.name,
      path: project.path,
      updatedAt: project.updatedAt,
      threadCount: project.threads.length,
      ...(project.pinned ? { pinned: true } : {}),
      active: project.path === activeWorkspacePath,
    }));
  const chats = input.threads
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((thread) => ({
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt,
      permissionMode: thread.permissionMode,
      collaborationMode: thread.collaborationMode,
      model: thread.model,
      thinkingLevel: thread.thinkingLevel,
      ...(input.activeThreadId === thread.id ? { active: true } : {}),
      messagePreview: thread.lastMessagePreview,
    }));
  const workflowAgents = input.workflowFolders
    .flatMap((folder) =>
      folder.threads.map((thread) => {
        const recoveryEvents = (input.workflowRecoveryEvents ?? []).filter((event) => event.runId === thread.latestRun?.id);
        const waitingQuestion = thread.discoveryQuestions.find((question) => !question.answer);
        const answeredDiscoveryQuestionCount = thread.discoveryQuestions.filter((question) => question.answer).length;
        const unansweredDiscoveryQuestionCount = thread.discoveryQuestions.length - answeredDiscoveryQuestionCount;
        return {
          id: thread.id,
          title: thread.title,
          folderId: folder.id,
          projectPath: thread.projectPath,
          phase: thread.phase,
          traceMode: thread.traceMode,
          preview: thread.preview,
          updatedAt: thread.updatedAt,
          latestStatus: thread.status || thread.latestRun?.status,
          ...(thread.activeArtifactId ? { activeArtifactId: thread.activeArtifactId } : {}),
          ...(thread.activeGraphSnapshotId ? { activeGraphSnapshotId: thread.activeGraphSnapshotId } : {}),
          discoveryQuestionCount: thread.discoveryQuestions.length,
          answeredDiscoveryQuestionCount,
          unansweredDiscoveryQuestionCount,
          ...(thread.latestVersion ? {
            latestVersion: {
              id: thread.latestVersion.id,
              version: thread.latestVersion.version,
              status: thread.latestVersion.status,
              createdAt: thread.latestVersion.createdAt,
            },
          } : {}),
          ...(thread.latestRun ? {
            latestRun: {
              id: thread.latestRun.id,
              status: thread.latestRun.status,
              updatedAt: thread.latestRun.updatedAt,
              ...(thread.latestRun.completedAt ? { completedAt: thread.latestRun.completedAt } : {}),
            },
          } : {}),
          ...(thread.graph?.summary ? { graphSummary: thread.graph.summary } : {}),
          ...(recoveryEvents.length ? { recoveryEvents } : {}),
          nextCommands: workflowNextCommands({
            id: thread.id,
            phase: thread.phase,
            unansweredDiscoveryQuestionCount,
            activeArtifactId: thread.activeArtifactId,
            latestRunStatus: thread.latestRun?.status,
            recoveryEvents,
          }),
          ...(waitingQuestion ? {
            waitingQuestionId: waitingQuestion.id,
            waitingQuestion: waitingQuestion.question,
            waitingQuestionChoices: waitingQuestion.choices.map((choice) => ({
              id: choice.id,
              label: choice.label,
              description: choice.description,
              ...(choice.recommended !== undefined ? { recommended: choice.recommended } : {}),
            })),
            waitingQuestionAllowFreeform: waitingQuestion.allowFreeform,
          } : {}),
        };
      }),
    )
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, limit);
  const pendingApprovals = (input.permissionRequests ?? [])
    .slice(0, limit)
    .map((request) => ({
      id: request.id,
      threadId: request.threadId,
      toolName: request.toolName,
      title: request.title,
      message: request.message,
      ...(request.detail ? { detailPreview: truncateApprovalDetail(request.detail) } : {}),
      risk: request.risk,
      ...(request.workspacePath ? { workspacePath: request.workspacePath } : {}),
      ...(request.projectPath ? { projectPath: request.projectPath } : {}),
      ...(request.workflowThreadId ? { workflowThreadId: request.workflowThreadId } : {}),
      responseModes: approvalResponseModes(request),
    }));
  const permissionGrants = (input.permissionGrants ?? [])
    .filter((grant) => !grant.revokedAt)
    .slice(0, limit)
    .map((grant) => ({
      id: grant.id,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt,
      ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
      scopeKind: grant.scopeKind,
      actionKind: grant.actionKind,
      targetKind: grant.targetKind,
      targetLabel: grant.targetLabel,
      source: grant.source,
      reason: grant.reason,
      ...(grant.threadId ? { threadId: grant.threadId } : {}),
      ...(grant.workflowThreadId ? { workflowThreadId: grant.workflowThreadId } : {}),
      ...(grant.projectPath ? { projectPath: grant.projectPath } : {}),
      ...(grant.workspacePath ? { workspacePath: grant.workspacePath } : {}),
    }));
  const permissionAudit = (input.permissionAudit ?? [])
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      threadId: entry.threadId,
      createdAt: entry.createdAt,
      toolName: entry.toolName,
      risk: entry.risk,
      decision: entry.decision,
      reason: entry.reason,
      ...(entry.decisionSource ? { decisionSource: entry.decisionSource } : {}),
      ...(entry.grantId ? { grantId: entry.grantId } : {}),
      ...(entry.detail ? { detailPreview: truncateApprovalDetail(entry.detail) } : {}),
    }));
  const relaySummaries = (input.relaySummaries ?? []).slice(-limit);

  return {
    workspace: {
      name: input.workspace.name,
      path: input.workspace.path,
    },
    ...(input.activeThreadId ? { activeChatId: input.activeThreadId } : {}),
    projects,
    chats,
    workflowAgents,
    pendingApprovals,
    permissionGrants,
    permissionAudit,
    relaySummaries,
    settings: runtimeSurfaceSettings(input),
    limits: {
      projectCount: projectSource.length,
      chatCount: input.threads.length,
      workflowAgentCount: input.workflowFolders.reduce((sum, folder) => sum + folder.threads.length, 0),
      pendingApprovalCount: input.permissionRequests?.length ?? 0,
      permissionGrantCount: (input.permissionGrants ?? []).filter((grant) => !grant.revokedAt).length,
      permissionAuditCount: input.permissionAudit?.length ?? 0,
      relaySummaryCount: input.relaySummaries?.length ?? 0,
      returnedProjectCount: projects.length,
      returnedChatCount: chats.length,
      returnedWorkflowAgentCount: workflowAgents.length,
      returnedPendingApprovalCount: pendingApprovals.length,
      returnedPermissionGrantCount: permissionGrants.length,
      returnedPermissionAuditCount: permissionAudit.length,
      returnedRelaySummaryCount: relaySummaries.length,
    },
  };
}

export function runtimeSurfaceSnapshotText(snapshot: RuntimeSurfaceSnapshot): string {
  const lines = [
    "Ambient runtime surface snapshot",
    `Workspace: ${snapshot.workspace.name}`,
    `Path: ${snapshot.workspace.path}`,
    `Projects: ${snapshot.limits.returnedProjectCount}/${snapshot.limits.projectCount}`,
    `Chats: ${snapshot.limits.returnedChatCount}/${snapshot.limits.chatCount}`,
    `Workflow agents: ${snapshot.limits.returnedWorkflowAgentCount}/${snapshot.limits.workflowAgentCount}`,
    `Pending approvals: ${snapshot.limits.returnedPendingApprovalCount}/${snapshot.limits.pendingApprovalCount}`,
    `Active permission grants: ${snapshot.limits.returnedPermissionGrantCount}/${snapshot.limits.permissionGrantCount}`,
    `Recent permission audit entries: ${snapshot.limits.returnedPermissionAuditCount}/${snapshot.limits.permissionAuditCount}`,
    `Relay summaries: ${snapshot.limits.returnedRelaySummaryCount}/${snapshot.limits.relaySummaryCount}`,
    "",
    "Settings:",
  ];
  for (const setting of snapshot.settings) {
    lines.push(
      `- ${setting.key}: ${setting.label}; status=${setting.headlessStatus ?? "unknown"}; readable=${setting.headlessReadable ? "yes" : "no"}; writable=${setting.headlessWritable ? "yes" : "no"}; configured=${setting.configured ? "yes" : "no"}${setting.valueSummary ? `; ${setting.valueSummary}` : ""}`,
    );
    if (setting.commandExamples?.length) lines.push(`  Examples: ${setting.commandExamples.join("; ")}`);
  }
  lines.push("", "Projects:");
  if (!snapshot.projects.length) {
    lines.push("- none");
  } else {
    for (const project of snapshot.projects) {
      lines.push(`- ${project.name} (${project.active ? "active" : project.id})`);
      lines.push(`  Threads: ${project.threadCount}; updated=${project.updatedAt}`);
    }
  }
  lines.push("", "Recent chats:");
  if (!snapshot.chats.length) {
    lines.push("- none");
  } else {
    for (const chat of snapshot.chats) {
      lines.push(`- ${chat.title} (${chat.id})`);
      lines.push(`  Updated: ${chat.updatedAt}`);
      lines.push(`  Mode: ${chat.collaborationMode}; thinking=${chat.thinkingLevel}; model=${chat.model}; permission=${chat.permissionMode}${chat.active ? "; active=yes" : ""}`);
      if (chat.messagePreview) lines.push(`  Preview: ${chat.messagePreview}`);
    }
  }
  lines.push("", "Workflow agents:");
  if (!snapshot.workflowAgents.length) {
    lines.push("- none");
  } else {
    for (const workflow of snapshot.workflowAgents) {
      lines.push(`- ${workflow.title} (${workflow.id})`);
      if (workflow.phase) lines.push(`  Phase: ${workflow.phase}`);
      if (workflow.latestStatus) lines.push(`  Status: ${workflow.latestStatus}`);
      if (workflow.latestRun) lines.push(`  Latest run: ${workflow.latestRun.status} (${workflow.latestRun.id})`);
      if (workflow.recoveryEvents?.length) {
        lines.push("  Recovery events:");
        for (const [index, event] of workflow.recoveryEvents.entries()) {
          const target = [
            event.graphNodeId ? `node=${event.graphNodeId}${event.graphNodeLabel ? ` (${event.graphNodeLabel})` : ""}` : undefined,
            event.itemKey ? `item=${event.itemKey}` : undefined,
          ].filter(Boolean).join("; ");
          const commands = event.commandExamples?.length ? `; commands=${event.commandExamples.join(", ")}` : "";
          lines.push(`  - ${index + 1}. ${event.type} (${event.id})${target ? `; ${target}` : ""}${commands}`);
        }
      }
      if (workflow.discoveryQuestionCount !== undefined) {
        lines.push(`  Discovery questions: ${workflow.answeredDiscoveryQuestionCount ?? 0}/${workflow.discoveryQuestionCount} answered`);
      }
      if (workflow.nextCommands?.length) lines.push(`  Next commands: ${workflow.nextCommands.join("; ")}`);
      if (workflow.projectPath) lines.push(`  Project path: ${workflow.projectPath}`);
    }
  }
  lines.push("", "Relay summaries:");
  if (!snapshot.relaySummaries.length) {
    lines.push("- none");
  } else {
    for (const summary of snapshot.relaySummaries) {
      lines.push(`- ${summary.title} (${summary.runtimeEventId})`);
      lines.push(`  Event status: ${summary.eventStatus}; relay action=${summary.relayActionStatus}; duplicateBlocked=${summary.duplicateBlocked ? "yes" : "no"}`);
      if (summary.targetProviderId) lines.push(`  Provider: ${summary.targetProviderLabel ?? summary.targetProviderId} (${summary.targetProviderId})`);
      lines.push(`  Next action: ${summary.nextAction}`);
      if (summary.previewCommand) lines.push(`  Preview: ${summary.previewCommand}`);
      if (summary.applyCommand) lines.push(`  Apply: ${summary.applyCommand}`);
      if (summary.diagnosticsCommand) lines.push(`  Diagnostics: ${summary.diagnosticsCommand}`);
      if (summary.repairHint) lines.push(`  Repair: ${summary.repairHint}`);
    }
  }
  lines.push("", "Pending approvals:");
  if (!snapshot.pendingApprovals.length) {
    lines.push("- none");
  } else {
    for (const [index, approval] of snapshot.pendingApprovals.entries()) {
      lines.push(`- ${index + 1}. ${approval.title} (${approval.id})`);
      lines.push(`  Tool: ${approval.toolName}; risk=${approval.risk}; thread=${approval.threadId}`);
      lines.push(`  Responses: ${approval.responseModes.join(", ")}`);
      if (approval.detailPreview) lines.push(`  Detail: ${approval.detailPreview}`);
    }
  }
  lines.push("", "Active permission grants:");
  if (!snapshot.permissionGrants.length) {
    lines.push("- none");
  } else {
    for (const [index, grant] of snapshot.permissionGrants.entries()) {
      lines.push(`- ${index + 1}. ${grant.targetLabel} (${grant.id})`);
      lines.push(`  Scope: ${grant.scopeKind}; action=${grant.actionKind}; target=${grant.targetKind}; source=${grant.source}`);
      if (grant.threadId) lines.push(`  Thread: ${grant.threadId}`);
      if (grant.projectPath) lines.push(`  Project path: ${grant.projectPath}`);
      if (grant.workspacePath) lines.push(`  Workspace path: ${grant.workspacePath}`);
      if (grant.expiresAt) lines.push(`  Expires: ${grant.expiresAt}`);
      lines.push(`  Revoke command: revoke grant ${index + 1}`);
    }
  }
  lines.push("", "Recent permission audit:");
  if (!snapshot.permissionAudit.length) {
    lines.push("- none");
  } else {
    for (const entry of snapshot.permissionAudit) {
      lines.push(`- ${entry.decision}: ${entry.toolName}; risk=${entry.risk}; source=${entry.decisionSource ?? "unknown"}; reason=${entry.reason}`);
    }
  }
  return lines.join("\n");
}

function projectSummaryFromSnapshotInput(input: RuntimeSurfaceSnapshotInput): ProjectSummary {
  const timestamps = input.threads.flatMap((thread) => [thread.createdAt, thread.updatedAt]).filter(Boolean);
  const fallbackTime = new Date(0).toISOString();
  return {
    id: projectIdFromWorkspacePath(input.workspace.path),
    path: input.workspace.path,
    name: input.workspace.name,
    statePath: input.workspace.statePath,
    sessionPath: input.workspace.sessionPath,
    createdAt: timestamps.length ? timestamps.reduce((earliest, item) => (item < earliest ? item : earliest)) : fallbackTime,
    updatedAt: timestamps.length ? timestamps.reduce((latest, item) => (item > latest ? item : latest)) : fallbackTime,
    threads: input.threads,
  };
}

function uniqueProjects(projects: ProjectSummary[]): ProjectSummary[] {
  const seen = new Set<string>();
  const result: ProjectSummary[] = [];
  for (const project of projects) {
    if (seen.has(project.path)) continue;
    seen.add(project.path);
    result.push(project);
  }
  return result;
}

function approvalResponseModes(request: PermissionRequest): RuntimeSurfaceSnapshot["pendingApprovals"][number]["responseModes"] {
  const modes: RuntimeSurfaceSnapshot["pendingApprovals"][number]["responseModes"] = ["deny", "allow_once"];
  for (const scope of request.reusableScopes ?? []) {
    if (scope === "thread") modes.push("always_thread");
    if (scope === "workflow_thread") modes.push("always_workflow");
    if (scope === "project") modes.push("always_project");
    if (scope === "workspace") modes.push("always_workspace");
  }
  return [...new Set(modes)];
}

function truncateApprovalDetail(detail: string): string {
  const normalized = detail.trim().replace(/\s+/g, " ");
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 237)}...`;
}

function runtimeSurfaceSettings(input: RuntimeSurfaceSnapshotInput): RuntimeSurfaceSnapshot["settings"] {
  return buildHeadlessSettingsCatalog().map((setting) => {
    const value = settingRuntimeValue(setting.key, input);
    const readable = setting.headlessReadable && value.readable;
    const writable = setting.headlessWritable && value.writable;
    return {
      key: setting.key,
      label: setting.label,
      sectionId: setting.sectionId,
      rowId: setting.rowId,
      headlessStatus: setting.headlessStatus,
      headlessReadable: readable,
      headlessWritable: writable,
      requiresApproval: setting.requiresApproval,
      plannerSafe: setting.plannerSafe,
      configured: value.configured,
      ...(value.valueSummary ? { valueSummary: value.valueSummary } : {}),
      ...(value.values ? { values: value.values } : {}),
      ...(setting.commandExamples?.length ? { commandExamples: setting.commandExamples } : {}),
      notes: setting.notes,
    };
  });
}

function settingRuntimeValue(
  key: string,
  input: RuntimeSurfaceSnapshotInput,
): {
  readable: boolean;
  writable: boolean;
  configured: boolean;
  valueSummary?: string;
  values?: Record<string, string | number | boolean>;
} {
  const voice = input.settings?.voice;
  const stt = input.settings?.stt;
  const search = input.settings?.search;
  const media = input.settings?.media;
  const planner = input.settings?.planner;
  const activeThread = activeThreadForSettings(input);

  if (key === "overview.workspace") {
    return {
      readable: true,
      writable: false,
      configured: true,
      valueSummary: `name=${input.workspace.name}; path=${input.workspace.path}`,
      values: {
        name: input.workspace.name,
        path: input.workspace.path,
      },
    };
  }

  if (key === "security.grants") {
    const pendingApprovalCount = input.permissionRequests?.length ?? 0;
    const activeGrantCount = (input.permissionGrants ?? []).filter((grant) => !grant.revokedAt).length;
    return {
      readable: true,
      writable: false,
      configured: pendingApprovalCount > 0 || activeGrantCount > 0,
      valueSummary: `pendingApprovals=${pendingApprovalCount}; activeGrants=${activeGrantCount}`,
      values: {
        pendingApprovalCount,
        activeGrantCount,
      },
    };
  }

  if (key === "security.log") {
    const recentAuditEntryCount = input.permissionAudit?.length ?? 0;
    return {
      readable: true,
      writable: false,
      configured: recentAuditEntryCount > 0,
      valueSummary: `recentAuditEntries=${recentAuditEntryCount}`,
      values: {
        recentAuditEntryCount,
      },
    };
  }

  if (key.startsWith("voice.")) {
    if (!voice) return unavailableSetting();
    if (key === "voice.provider") {
      return {
        readable: true,
        writable: false,
        configured: Boolean(voice.providerCapabilityId),
        valueSummary: voice.providerCapabilityId ? `provider=${voice.providerCapabilityId}` : "provider=none",
        ...(voice.providerCapabilityId ? { values: { providerCapabilityId: voice.providerCapabilityId } } : {}),
      };
    }
    if (key === "voice.voice") {
      return {
        readable: true,
        writable: false,
        configured: Boolean(voice.voiceId),
        valueSummary: voice.voiceId ? `voice=${voice.voiceId}` : "voice=default",
        ...(voice.voiceId ? { values: { voiceId: voice.voiceId } } : {}),
      };
    }
    if (key === "voice.format") {
      return {
        readable: true,
        writable: false,
        configured: true,
        valueSummary: `format=${voice.format}`,
        values: { format: voice.format },
      };
    }
    if (key === "voice.playback") {
      return {
        readable: true,
        writable: true,
        configured: true,
        valueSummary: `enabled=${voice.enabled}; autoplay=${voice.autoplay}`,
        values: { enabled: voice.enabled, autoplay: voice.autoplay },
      };
    }
    if (key === "voice.artifacts") {
      return {
        readable: true,
        writable: false,
        configured: true,
        valueSummary: `artifactCacheMaxMb=${voice.artifactCacheMaxMb}`,
        values: { artifactCacheMaxMb: voice.artifactCacheMaxMb },
      };
    }
    return {
      readable: true,
      writable: true,
      configured: Boolean(voice.providerCapabilityId),
      valueSummary: voiceSettingSummary(voice),
      values: {
        enabled: voice.enabled,
        mode: voice.mode,
        autoplay: voice.autoplay,
        longReply: voice.longReply,
        maxChars: voice.maxChars,
        artifactCacheMaxMb: voice.artifactCacheMaxMb,
        format: voice.format,
        ...(voice.providerCapabilityId ? { providerCapabilityId: voice.providerCapabilityId } : {}),
        ...(voice.voiceId ? { voiceId: voice.voiceId } : {}),
      },
    };
  }

  if (key === "search.preference") {
    return {
      readable: true,
      writable: Boolean(search),
      configured: Boolean(search?.webSearch?.preferredProvider),
      valueSummary: searchSettingSummary(search),
      ...(search?.webSearch ? {
        values: {
          preferredProvider: search.webSearch.preferredProvider,
          mode: search.webSearch.mode,
          fallback: search.webSearch.fallback,
        },
      } : {}),
    };
  }

  if (key === "media.generated") {
    if (!media) return unavailableSetting();
    return {
      readable: true,
      writable: true,
      configured: true,
      valueSummary: `generatedMediaAutoplay=${media.generatedMediaAutoplay}`,
      values: { generatedMediaAutoplay: media.generatedMediaAutoplay },
    };
  }

  if (key === "model-mode.planner") {
    if (!planner) return unavailableSetting();
    return {
      readable: true,
      writable: true,
      configured: true,
      valueSummary: `autoFinalize=${planner.autoFinalize}`,
      values: { autoFinalize: planner.autoFinalize },
    };
  }

  if (key.startsWith("model-mode.")) {
    if (!activeThread) return unavailableSetting();
    if (key === "model-mode.model") {
      return {
        readable: true,
        writable: false,
        configured: Boolean(activeThread.model),
        valueSummary: `thread=${activeThread.title}; model=${activeThread.model}`,
        values: {
          threadId: activeThread.id,
          threadTitle: activeThread.title,
          model: activeThread.model,
        },
      };
    }
    if (key === "model-mode.mode") {
      return {
        readable: true,
        writable: true,
        configured: true,
        valueSummary: `thread=${activeThread.title}; collaborationMode=${activeThread.collaborationMode}`,
        values: {
          threadId: activeThread.id,
          threadTitle: activeThread.title,
          collaborationMode: activeThread.collaborationMode,
        },
      };
    }
    if (key === "model-mode.thinking") {
      return {
        readable: true,
        writable: true,
        configured: true,
        valueSummary: `thread=${activeThread.title}; thinkingLevel=${activeThread.thinkingLevel}`,
        values: {
          threadId: activeThread.id,
          threadTitle: activeThread.title,
          thinkingLevel: activeThread.thinkingLevel,
        },
      };
    }
    if (key === "model-mode.context") {
      return {
        readable: true,
        writable: false,
        configured: true,
        valueSummary: `thread=${activeThread.title}`,
        values: {
          threadId: activeThread.id,
          threadTitle: activeThread.title,
        },
      };
    }
  }

  if (key.startsWith("speech.")) {
    if (!stt) return unavailableSetting();
    const providerSummary = stt.providerCapabilityId ? `provider=${stt.providerCapabilityId}` : "provider=none";
    if (key === "speech.provider") {
      return {
        readable: true,
        writable: false,
        configured: Boolean(stt.providerCapabilityId),
        valueSummary: providerSummary,
        ...(stt.providerCapabilityId ? { values: { providerCapabilityId: stt.providerCapabilityId } } : {}),
      };
    }
    if (key === "speech.language") {
      return {
        readable: true,
        writable: true,
        configured: true,
        valueSummary: `spokenLanguage=${stt.spokenLanguage}`,
        values: { spokenLanguage: stt.spokenLanguage },
      };
    }
    if (key === "speech.shortcut") {
      return {
        readable: true,
        writable: false,
        configured: Boolean(stt.pushToTalkShortcut),
        valueSummary: stt.pushToTalkShortcut ? `shortcut=${stt.pushToTalkShortcut}` : "shortcut=not configured",
        ...(stt.pushToTalkShortcut ? { values: { pushToTalkShortcut: stt.pushToTalkShortcut } } : {}),
      };
    }
    if (key === "speech.behavior") {
      return {
        readable: true,
        writable: true,
        configured: true,
        valueSummary: `enabled=${stt.enabled}; autoSendAfterTranscription=${stt.autoSendAfterTranscription}`,
        values: {
          enabled: stt.enabled,
          autoSendAfterTranscription: stt.autoSendAfterTranscription,
        },
      };
    }
    if (key === "speech.advanced") {
      return {
        readable: true,
        writable: true,
        configured: true,
        valueSummary: `silenceFinalizeSeconds=${stt.silenceFinalizeSeconds}; noSpeechGate=${stt.noSpeechGate.enabled}; bargeInStopTts=${stt.bargeIn.stopTtsOnSpeech}`,
        values: {
          silenceFinalizeSeconds: stt.silenceFinalizeSeconds,
          noSpeechGateEnabled: stt.noSpeechGate.enabled,
          noSpeechGateRmsThresholdDbfs: stt.noSpeechGate.rmsThresholdDbfs,
          bargeInStopTtsOnSpeech: stt.bargeIn.stopTtsOnSpeech,
          bargeInQueueWhileAgentRuns: stt.bargeIn.queueWhileAgentRuns,
        },
      };
    }
    return {
      readable: true,
      writable: key === "speech.input",
      configured: Boolean(stt.providerCapabilityId),
      valueSummary: `${providerSummary}; enabled=${stt.enabled}; mode=${stt.mode}; spokenLanguage=${stt.spokenLanguage}`,
      values: {
        enabled: stt.enabled,
        mode: stt.mode,
        spokenLanguage: stt.spokenLanguage,
        ...(stt.providerCapabilityId ? { providerCapabilityId: stt.providerCapabilityId } : {}),
      },
    };
  }

  return unavailableSetting();
}

function activeThreadForSettings(input: RuntimeSurfaceSnapshotInput): ThreadSummary | undefined {
  if (input.activeThreadId) {
    const exact = input.threads.find((thread) => thread.id === input.activeThreadId);
    if (exact) return exact;
  }
  return input.threads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function unavailableSetting(): {
  readable: false;
  writable: false;
  configured: false;
} {
  return {
    readable: false,
    writable: false,
    configured: false,
  };
}

function voiceSettingSummary(settings: VoiceSettings): string {
  const provider = settings.providerCapabilityId ? `provider=${settings.providerCapabilityId}` : "provider=none";
  const voice = settings.voiceId ? `; voice=${settings.voiceId}` : "";
  return `${provider}${voice}; enabled=${settings.enabled}; mode=${settings.mode}; autoplay=${settings.autoplay}; longReply=${settings.longReply}; maxChars=${settings.maxChars}`;
}

function searchSettingSummary(settings: SearchRoutingSettings | undefined): string {
  const preference = settings?.webSearch;
  if (!preference) return "preference=default";
  return `provider=${preference.preferredProvider}; mode=${preference.mode}; fallback=${preference.fallback}`;
}

function workflowNextCommands(input: {
  id: string;
  phase?: string;
  unansweredDiscoveryQuestionCount: number;
  activeArtifactId?: string;
  latestRunStatus?: string;
  recoveryEvents?: RuntimeSurfaceWorkflowRecoveryEvent[];
}): string[] {
  const commands = [`open workflow ${input.id}`];
  if (input.phase === "running" || input.latestRunStatus === "running") {
    commands.push("cancel workflow");
    return commands;
  }
  if (input.unansweredDiscoveryQuestionCount > 0) {
    commands.push("answer <workflow answer>");
    return commands;
  }
  const recoveryCommands = recoveryNextCommands(input.recoveryEvents ?? []);
  if (recoveryCommands.length) {
    commands.push(...recoveryCommands);
    return commands;
  }
  if (input.phase === "ready_for_review" || input.latestRunStatus === "previewed") {
    commands.push("approve workflow preview", "reject workflow preview");
    return commands;
  }
  if (input.phase !== "running") {
    commands.push("run exploration");
  }
  if (input.phase !== "compiling" && input.phase !== "running") {
    commands.push("compile from exploration");
  }
  if (input.activeArtifactId && input.latestRunStatus !== "running") {
    commands.push("status");
  }
  return commands;
}

function recoveryNextCommands(events: RuntimeSurfaceWorkflowRecoveryEvent[]): string[] {
  const commands: string[] = [];
  const retryable = events.filter((event) => event.retryEligible);
  const resumable = events.filter((event) => event.resumeEligible);
  const skippable = events.filter((event) => event.skipEligible);
  if (retryable.length === 1) commands.push("retry failed step");
  if (retryable.length > 1) commands.push(...retryable.map((_, index) => `retry failed event ${index + 1}`));
  if (resumable.length === 1) commands.push("resume checkpoint");
  if (resumable.length > 1) commands.push(...resumable.map((_, index) => `resume checkpoint ${index + 1}`));
  if (skippable.length === 1) commands.push("skip failed item");
  if (skippable.length > 1) commands.push(...skippable.map((_, index) => `skip failed item ${index + 1}`));
  return commands;
}
