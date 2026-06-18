import type { AutomationScheduleExceptionSummary, AutomationSchedulePresetKind, AutomationScheduleSummary } from "../../shared/automationTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionGrantScopeKind, PermissionMode } from "../../shared/permissionTypes";
import type { WorkflowAgentThreadSummary, WorkflowAmbientCliCapabilityGrant, WorkflowArtifactStatus, WorkflowArtifactSummary, WorkflowConnectorManifestGrant, WorkflowDiscoveryAccessRequest, WorkflowGraphNode, WorkflowGraphSnapshot, WorkflowManifest, WorkflowRunDetail, WorkflowRunLimitOverrides, WorkflowRunSummary, WorkflowTraceMode, WorkflowVersionSummary } from "../../shared/workflowTypes";
import {
  workflowAmbientCliScheduleTargetLabel,
  workflowArtifactScheduleAmbientCliGrantUses,
  workflowArtifactScheduleBlockReason,
  workflowScheduleConnectorGrantMatches,
  workflowScheduleConnectorGrantRequirements,
  workflowScheduleMissingAmbientCliGrants,
  type WorkflowScheduleConnectorGrantRequirement,
} from "../../shared/workflowSchedulePolicy";
import { workflowRunLiveness } from "../../shared/workflowRunLiveness";
import {
  workflowPermissionGrantRegistryModel,
  type PermissionGrantRegistryModel,
} from "./permissionGrantRegistryUiModel";
import { workflowTraceRetentionReviewModel } from "./workflowTraceRetentionUiModel";

export type WorkflowReviewTone = "ready" | "review" | "blocked" | "running" | "neutral";

export interface WorkflowReviewSection {
  id:
    | "request"
    | "discovery_context"
    | "diagram"
    | "trace_retention"
    | "connectors"
    | "ambient_cli"
    | "plugins"
    | "mutation_policy"
    | "run_limits"
    | "dry_run"
    | "compile_audit"
    | "source";
  label: string;
  value: string;
  detail: string;
  tone: WorkflowReviewTone;
}

export type WorkflowReviewEvidenceTarget = "permissions" | "source" | "run_console" | "manifest" | "diagram";

export interface WorkflowReviewEvidenceItem {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: WorkflowReviewTone;
  panel: WorkflowReviewEvidenceTarget;
  actionLabel: string;
}

export type WorkflowDiscoveryContextReviewCategory = "files" | "connectors" | "plugins" | "browser" | "shell" | "mutations" | "metadata";
export type WorkflowDiscoveryContextReviewStatus = "inspected" | "withheld" | "denied";

export interface WorkflowDiscoveryContextReviewItem {
  id: string;
  questionId: string;
  questionLabel: string;
  category: WorkflowDiscoveryContextReviewCategory;
  categoryLabel: string;
  capabilityLabel: string;
  targetLabel: string;
  status: WorkflowDiscoveryContextReviewStatus;
  statusLabel: string;
  scopeLabel: string;
  detail: string;
  grantId?: string;
}

export interface WorkflowDiscoveryContextReviewModel {
  items: WorkflowDiscoveryContextReviewItem[];
  inspectedCount: number;
  withheldCount: number;
  deniedCount: number;
  tileValue: string;
  tileDetail: string;
  tone: WorkflowReviewTone;
}

export interface WorkflowReviewWorkspaceModel {
  title: string;
  statusLabel: string;
  phaseLabel: string;
  versionLabel: string;
  summary: string;
  noticeTitle: string;
  noticeDetail: string;
  noticeTone: WorkflowReviewTone;
  badges: string[];
  evidence: WorkflowReviewEvidenceItem[];
  sections: WorkflowReviewSection[];
  discoveryContext: WorkflowDiscoveryContextReviewModel;
}

export interface WorkflowReviewWorkspaceInput {
  thread: Pick<WorkflowAgentThreadSummary, "phase" | "latestVersion" | "graph" | "discoveryQuestions" | "initialRequest" | "traceMode">;
  artifact: WorkflowArtifactSummary;
  latestRun?: WorkflowRunSummary;
  detail?: WorkflowRunDetail;
}

export interface WorkflowReviewWorkspaceViewModelInput {
  thread: WorkflowAgentThreadSummary;
  artifact: WorkflowArtifactSummary;
  runs: WorkflowRunSummary[];
  detail?: WorkflowRunDetail;
  versions: WorkflowVersionSummary[];
  schedules: AutomationScheduleSummary[];
  permissionGrants: AmbientPermissionGrant[];
  permissionAudit: PermissionAuditEntry[];
  permissionMode?: PermissionMode;
  auditThreadId?: string;
  workspacePath?: string;
  selectedWorkflowAgentThreadId?: string;
  selectedWorkflowAgentSourceNode?: WorkflowGraphNode;
  runLimits: WorkflowRunLimitOverrides;
}

export interface WorkflowReviewWorkspaceViewModel {
  latestRun?: WorkflowRunSummary;
  detail?: WorkflowRunDetail;
  review: WorkflowReviewWorkspaceModel;
  runBlocked: boolean;
  runLimits: WorkflowRunLimitOverrides;
  currentVersion?: WorkflowVersionSummary;
  selectedSourceNode?: WorkflowGraphNode;
  sourceNodes?: WorkflowGraphNode[];
  scheduleState: WorkflowThreadScheduleState;
  workflowGrantRegistry: PermissionGrantRegistryModel;
}

export interface WorkflowThreadScheduleItem {
  id: string;
  mode: "latest_approved" | "pinned_version" | "artifact";
  statusLabel: string;
  targetLabel: string;
  cadenceLabel: string;
  nextRunLabel: string;
  versionLabel: string;
  driftLabel: string;
  driftTone: WorkflowReviewTone;
  dispatchLabel: string;
  dispatchTone: WorkflowReviewTone;
  grantLabel?: string;
  grantDetail?: string;
  grantAction?: WorkflowThreadScheduleGrantAction;
  latestRunId?: string;
  latestRunLabel?: string;
  latestRunDetail?: string;
  latestRunTone?: WorkflowReviewTone;
  latestRunActionLabel?: string;
  latestRunActionTitle?: string;
  recentRuns: WorkflowThreadScheduleRunItem[];
}

export interface WorkflowThreadScheduleRunItem {
  id: string;
  statusLabel: string;
  detail: string;
  tone: WorkflowReviewTone;
  actionLabel: string;
  actionTitle: string;
}

export interface WorkflowScheduleRunHistoryItem {
  id: string;
  statusLabel: string;
  detail: string;
  tone: WorkflowReviewTone;
  actionLabel: string;
  actionTitle: string;
}

export interface WorkflowScheduleExceptionLedgerItem {
  id: string;
  title: string;
  occurrenceLabel: string;
  detail: string;
  statusLabel: string;
  tone: WorkflowReviewTone;
}

export interface WorkflowThreadScheduleGrantAction {
  label: string;
  connectorId: string;
  operation?: string;
  accountId?: string;
  targetLabel: string;
  targetIdentity?: string;
  scopeKind: Extract<PermissionGrantScopeKind, "workflow_thread">;
  reason: string;
}

export interface WorkflowThreadScheduleState {
  schedules: WorkflowThreadScheduleItem[];
  canScheduleLatestApproved: boolean;
  latestApprovedVersionLabel?: string;
  latestApprovedBlockReason?: string;
  canPinCurrentVersion: boolean;
  currentVersionId?: string;
  currentVersionLabel?: string;
  pinCurrentBlockReason?: string;
}

export type WorkflowSchedulePanelId = "schedules-overview" | "schedules-history" | "schedules-grants";
export type WorkflowScheduleEditScopeId = "this_occurrence" | "this_and_following" | "all_occurrences";
export type WorkflowScheduleTargetMode = "latest_approved" | "pinned_version";

export interface WorkflowScheduleTargetChoice {
  id: string;
  mode: WorkflowScheduleTargetMode;
  targetKind: "workflow_thread" | "workflow_version";
  targetId: string;
  label: string;
  detail: string;
  badge: string;
  selected: boolean;
  disabled: boolean;
  disabledReason?: string;
}

export interface WorkflowScheduleEditScopeChoice {
  id: WorkflowScheduleEditScopeId;
  label: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
}

export interface WorkflowSchedulePreviewRow {
  label: string;
  value: string;
  detail: string;
  tone: WorkflowReviewTone;
}

export interface WorkflowScheduleCreationModel {
  title: string;
  detail: string;
  targetChoices: WorkflowScheduleTargetChoice[];
  selectedTarget?: WorkflowScheduleTargetChoice;
  recurrenceLabel: string;
  recurrenceDetail: string;
  nextRunLabel: string;
  stateLabel: string;
  timezoneLabel: string;
  runLimitLabel: string;
  runLimitDetail: string;
  editScopeChoices: WorkflowScheduleEditScopeChoice[];
  previewRows: WorkflowSchedulePreviewRow[];
  canSave: boolean;
  saveLabel: string;
  saveTitle: string;
}

export type WorkflowScheduleGrantRowStatus = "ready" | "missing" | "expired" | "revoked" | "full_access" | "no_account" | "none";

export interface WorkflowScheduleGrantReadinessRow {
  id: string;
  kind: "connector" | "ambient_cli";
  connectorId: string;
  operation?: string;
  accountLabel: string;
  targetLabel: string;
  status: WorkflowScheduleGrantRowStatus;
  statusLabel: string;
  detail: string;
  tone: WorkflowReviewTone;
  expiryLabel: string;
  recentUseLabel: string;
  riskLabel: string;
  action?: WorkflowThreadScheduleGrantAction;
}

export interface WorkflowScheduleGrantReadinessTile {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: WorkflowReviewTone;
}

export interface WorkflowScheduleGrantReadinessModel {
  title: string;
  detail: string;
  tone: WorkflowReviewTone;
  summary: string;
  rows: WorkflowScheduleGrantReadinessRow[];
  tiles: WorkflowScheduleGrantReadinessTile[];
  fullAccessReceiptCount: number;
}

export type WorkflowReviewAction = "approve" | "reject" | "dry_run" | "run" | "run_unapproved" | "revalidate";

export function workflowReviewWorkspaceModel(input: WorkflowReviewWorkspaceInput): WorkflowReviewWorkspaceModel {
  const { artifact, thread, latestRun, detail } = input;
  const versionLabel = thread.latestVersion ? `Version ${thread.latestVersion.version}` : "Unversioned preview";
  const discoveryContext = workflowDiscoveryContextReviewModel(thread);
  return {
    title: artifact.title,
    statusLabel: formatReviewLabel(artifact.status),
    phaseLabel: formatReviewLabel(thread.phase),
    versionLabel,
    summary: artifact.spec.summary?.trim() || artifact.spec.goal || thread.initialRequest,
    ...reviewNotice(artifact.status),
    badges: workflowReviewBadges(artifact.manifest, latestRun, thread.graph, versionLabel),
    evidence: workflowReviewEvidenceItems(input),
    discoveryContext,
    sections: [
      requestSection(thread),
      discoveryContextSection(discoveryContext),
      diagramSection(thread.graph),
      traceRetentionSection(thread, detail),
      connectorSection(artifact),
      ambientCliSection(artifact),
      pluginSection(artifact),
      mutationPolicySection(artifact.manifest),
      runLimitsSection(artifact.manifest),
      dryRunSection(latestRun, detail),
      compileAuditSection(detail?.compileAudit ?? artifact.compileAudit),
      sourceSection(detail),
    ],
  };
}

export function workflowReviewWorkspaceViewModel(input: WorkflowReviewWorkspaceViewModelInput): WorkflowReviewWorkspaceViewModel {
  const latestRun = input.runs.find((run) => run.artifactId === input.artifact.id);
  const currentVersion = input.versions.find((version) => version.artifactId === input.artifact.id);
  const threadVersions = input.versions.filter((version) => version.workflowThreadId === input.thread.id);
  const selectedSourceNode =
    input.thread.id === input.selectedWorkflowAgentThreadId ? input.selectedWorkflowAgentSourceNode : undefined;

  return {
    latestRun,
    detail: input.detail,
    review: workflowReviewWorkspaceModel({
      thread: input.thread,
      artifact: input.artifact,
      latestRun,
      detail: input.detail,
    }),
    runBlocked: workflowReviewArtifactRunBlocked(input.artifact),
    runLimits: input.runLimits,
    currentVersion,
    selectedSourceNode,
    sourceNodes: input.thread.graph?.nodes,
    scheduleState: workflowThreadScheduleState({
      thread: input.thread,
      artifact: input.artifact,
      versions: threadVersions,
      schedules: input.schedules,
      permissionGrants: input.permissionGrants,
      permissionAudit: input.permissionAudit,
      permissionMode: input.permissionMode,
      auditThreadId: input.auditThreadId,
      workspacePath: input.workspacePath,
      runs: input.runs,
    }),
    workflowGrantRegistry: workflowPermissionGrantRegistryModel({
      grants: input.permissionGrants,
      auditEntries: input.permissionAudit,
      workflowThreadId: input.thread.id,
      projectPath: input.thread.projectPath,
      workspacePath: input.workspacePath,
      auditThreadId: input.auditThreadId,
    }),
  };
}

export function workflowReviewArtifactRunBlocked(artifact: Pick<WorkflowArtifactSummary, "status">): boolean {
  return artifact.status === "rejected" || artifact.status === "archived" || artifact.status === "draft";
}

export function workflowReviewEvidenceItems(input: WorkflowReviewWorkspaceInput): WorkflowReviewEvidenceItem[] {
  const items: WorkflowReviewEvidenceItem[] = [];
  const capabilities = input.artifact.manifest.ambientCliCapabilities ?? [];
  if (capabilities.length > 0) {
    const listed = capabilities
      .slice(0, 3)
      .map((capability) => `${capability.packageName}:${capability.command}`)
      .join(", ");
    const extra = capabilities.length > 3 ? `, +${capabilities.length - 3} more` : "";
    items.push({
      id: "ambient-cli-capabilities",
      label: "Ambient CLI grants",
      value: `${capabilities.length} command${capabilities.length === 1 ? "" : "s"}`,
      detail: `${listed}${extra}. Review package, command, and grant provenance before approval or unattended scheduling.`,
      tone: "review",
      panel: "permissions",
      actionLabel: "Review permissions",
    });
  }

  const graphNodes = input.thread.graph?.nodes ?? [];
  const mappedNodes = graphNodes.filter((node) => (node.sourceRanges ?? []).length > 0);
  const sourceRangeCount = mappedNodes.reduce((sum, node) => sum + (node.sourceRanges?.length ?? 0), 0);
  if (sourceRangeCount > 0) {
    items.push({
      id: "source-mapping",
      label: "Program map",
      value: `${mappedNodes.length}/${graphNodes.length} nodes mapped`,
      detail: `${sourceRangeCount} generated-program range${sourceRangeCount === 1 ? "" : "s"} link graph nodes to deterministic code. Open program rows to focus the diagram.`,
      tone: mappedNodes.length === graphNodes.length ? "ready" : "review",
      panel: "source",
      actionLabel: "Open program map",
    });
  } else if (input.thread.graph && input.detail?.sourceContent) {
    items.push({
      id: "source-mapping-missing",
      label: "Program map",
      value: "No mappings",
      detail: "Generated program is loaded, but graph nodes do not include program ranges yet.",
      tone: "review",
      panel: "source",
      actionLabel: "Inspect program",
    });
  }

  const ambientCliEvents =
    input.detail?.events.filter(
      (event) =>
        event.message === "ambient_cli" &&
        (event.type === "desktop-tool.start" || event.type === "desktop-tool.end" || event.type === "desktop-tool.error" || event.type === "desktop-tool.dry_run"),
    ) ?? [];
  if (ambientCliEvents.length > 0) {
    const failedCount = ambientCliEvents.filter((event) => event.type === "desktop-tool.error").length;
    const completedCount = ambientCliEvents.filter((event) => event.type === "desktop-tool.end").length;
    const dryRunCount = ambientCliEvents.filter((event) => event.type === "desktop-tool.dry_run").length;
    const statusParts = [
      completedCount ? `${completedCount} completed` : undefined,
      dryRunCount ? `${dryRunCount} dry-run` : undefined,
      failedCount ? `${failedCount} failed` : undefined,
    ].filter((part): part is string => Boolean(part));
    items.push({
      id: "ambient-cli-run-evidence",
      label: "Ambient CLI run evidence",
      value: `${ambientCliEvents.length} event${ambientCliEvents.length === 1 ? "" : "s"}`,
      detail: statusParts.length ? `${statusParts.join(", ")}. Full stdout/stderr are retained as artifacts, with bounded previews in the audit.` : "Run events retained Ambient CLI provenance.",
      tone: failedCount ? "blocked" : "ready",
      panel: "run_console",
      actionLabel: "Open events",
    });
  }

  const compileAudit = input.detail?.compileAudit ?? input.artifact.compileAudit;
  if (compileAudit) {
    const failedCount = compileAudit.failedValidatorIds.length;
    const policyRefCount = workflowCompileAuditRuleIds(compileAudit).length + compileAudit.policyImplicationIds.length;
    items.push({
      id: "compile-audit",
      label: "Compile audit",
      value: `${compileAudit.promptModuleCount} module${compileAudit.promptModuleCount === 1 ? "" : "s"}`,
      detail: `${compileAudit.selectedRecipeIds.length} selected recipe${compileAudit.selectedRecipeIds.length === 1 ? "" : "s"}, ${policyRefCount} policy ref${policyRefCount === 1 ? "" : "s"}, ${compileAudit.validatorIds.length} validator${compileAudit.validatorIds.length === 1 ? "" : "s"}${failedCount ? `, ${failedCount} failed` : ""}.`,
      tone: failedCount ? "blocked" : compileAudit.validationStatus === "passed" ? "ready" : "review",
      panel: "manifest",
      actionLabel: "Review compile",
    });
  }

  return items;
}

export function workflowDiscoveryContextReviewModel(
  thread: Pick<WorkflowAgentThreadSummary, "discoveryQuestions">,
): WorkflowDiscoveryContextReviewModel {
  const items: WorkflowDiscoveryContextReviewItem[] = [];
  const seenInspectedTargets = new Set<string>();
  for (const question of thread.discoveryQuestions) {
    for (const request of question.accessRequests ?? []) {
      const item = discoveryAccessRequestReviewItem(question.id, question.question, request);
      items.push(item);
      if (item.status === "inspected") seenInspectedTargets.add(`${item.category}:${item.targetLabel}`);
    }
  }
  for (const question of thread.discoveryQuestions) {
    for (const targetLabel of grantedContentExcerptLabels(question.policyContextSummary)) {
      const key = `files:${targetLabel}`;
      if (seenInspectedTargets.has(key)) continue;
      seenInspectedTargets.add(key);
      items.push({
        id: `policy-summary:${question.id}:${targetLabel}`,
        questionId: question.id,
        questionLabel: question.question,
        category: "files",
        categoryLabel: "Files",
        capabilityLabel: "File content",
        targetLabel,
        status: "inspected",
        statusLabel: "Inspected",
        scopeLabel: "Policy summary",
        detail: "Included in Ambient/Pi discovery context after policy evaluation.",
      });
    }
  }
  const inspectedCount = items.filter((item) => item.status === "inspected").length;
  const withheldCount = items.filter((item) => item.status === "withheld").length;
  const deniedCount = items.filter((item) => item.status === "denied").length;
  const tileValue = inspectedCount || withheldCount || deniedCount ? `${inspectedCount} inspected` : "Standard context";
  const tileDetail =
    inspectedCount || withheldCount || deniedCount
      ? [
          inspectedCount ? `${inspectedCount} inspected` : undefined,
          withheldCount ? `${withheldCount} withheld` : undefined,
          deniedCount ? `${deniedCount} denied` : undefined,
        ]
          .filter((part): part is string => Boolean(part))
          .join(", ")
      : "Discovery used request text, answers, graph context, and safe metadata only.";
  return {
    items: items.sort(compareDiscoveryContextItems),
    inspectedCount,
    withheldCount,
    deniedCount,
    tileValue,
    tileDetail,
    tone: withheldCount || deniedCount ? "review" : inspectedCount ? "ready" : "neutral",
  };
}

export function workflowReviewActionLabel(action: WorkflowReviewAction, busy: boolean): string {
  if (!busy) {
    if (action === "dry_run") return "Dry run";
    if (action === "run_unapproved") return "Run unapproved";
    if (action === "revalidate") return "Validate version";
    return formatReviewLabel(action);
  }
  if (action === "approve") return "Approving";
  if (action === "reject") return "Rejecting";
  if (action === "dry_run") return "Checking";
  if (action === "run") return "Running";
  if (action === "run_unapproved") return "Running";
  return "Validating";
}

export function workflowReviewActionTitle(action: WorkflowReviewAction): string {
  if (action === "revalidate") {
    return "Re-check the generated workflow, manifest, graph mapping, grants, and run policy before execution.";
  }
  if (action === "dry_run") {
    return "Run the workflow with safe stubs or non-mutating behavior where possible.";
  }
  if (action === "run") {
    return "Run the approved workflow with the selected run limits.";
  }
  if (action === "run_unapproved") {
    return "Run this workflow before approval. Use only when you intentionally want to bypass the review gate.";
  }
  if (action === "approve") {
    return "Approve this workflow version so it can be run normally or scheduled.";
  }
  return "Reject this workflow version and keep it from being approved or scheduled.";
}

export function workflowThreadScheduleState(input: {
  thread: Pick<WorkflowAgentThreadSummary, "id" | "title" | "latestVersion" | "projectPath">;
  artifact: Pick<WorkflowArtifactSummary, "id" | "status" | "manifest">;
  versions: WorkflowVersionSummary[];
  schedules: AutomationScheduleSummary[];
  permissionGrants?: AmbientPermissionGrant[];
  permissionAudit?: PermissionAuditEntry[];
  permissionMode?: "full-access" | "workspace";
  auditThreadId?: string;
  workspacePath?: string;
  runs?: WorkflowRunSummary[];
}): WorkflowThreadScheduleState {
  const latestApproved = input.versions
    .filter((version) => version.workflowThreadId === input.thread.id && version.status === "approved")
    .sort((left, right) => right.version - left.version)[0];
  const currentVersion = input.versions.find((version) => version.artifactId === input.artifact.id);
  const versionById = new Map(input.versions.map((version) => [version.id, version]));
  const versionIds = new Set(input.versions.filter((version) => version.workflowThreadId === input.thread.id).map((version) => version.id));
  const blockOptions = {
    permissionGrants: input.permissionGrants,
    permissionMode: input.permissionMode,
    threadId: input.auditThreadId,
    workflowThreadId: input.thread.id,
    projectPath: input.thread.projectPath,
    workspacePath: input.workspacePath,
  };
  const currentArtifactScheduleBlockReason = workflowArtifactScheduleBlockReason(
    { ...input.artifact, workflowThreadId: input.thread.id },
    blockOptions,
  );
  const latestApprovedBlockReason =
    latestApproved && currentVersion?.id === latestApproved.id ? currentArtifactScheduleBlockReason : latestApproved ? undefined : "Approve a workflow version before scheduling latest approved.";
  const pinCurrentBlockReason =
    currentVersion && currentVersion.status !== "approved"
      ? `Current version is ${formatReviewLabel(currentVersion.status)}.`
      : currentArtifactScheduleBlockReason ?? (currentVersion ? undefined : "No committed version is available to pin.");
  const scheduleItems = input.schedules
    .filter((schedule) => {
      if (schedule.targetKind === "workflow_thread") return schedule.targetId === input.thread.id;
      if (schedule.targetKind === "workflow_version") return versionIds.has(schedule.targetId);
      if (schedule.targetKind === "workflow_artifact") return schedule.targetId === input.artifact.id;
      return false;
    })
    .map((schedule): WorkflowThreadScheduleItem => {
      const mode = schedule.targetKind === "workflow_thread" ? "latest_approved" : schedule.targetKind === "workflow_version" ? "pinned_version" : "artifact";
      const drift = scheduleDriftLabel(schedule, mode, latestApproved, versionById);
      const dispatch = scheduleDispatchLabel(schedule, mode, input.artifact, latestApproved, versionById, {
        ...blockOptions,
      });
      const grantState = scheduleConnectorGrantState({
        artifact: input.artifact,
        permissionGrants: input.permissionGrants,
        permissionAudit: input.permissionAudit,
        permissionMode: input.permissionMode,
        workflowThreadId: input.thread.id,
        threadId: input.auditThreadId,
        projectPath: input.thread.projectPath,
        workspacePath: input.workspacePath,
      });
      const recentRuns = workflowScheduleRunHistoryItems(schedule.id, input.runs ?? [], 8);
      const latestRun = input.runs?.find((run) => run.id === recentRuns[0]?.id);
      return {
        id: schedule.id,
        mode,
        statusLabel: schedule.enabled ? "Active" : "Paused",
        targetLabel: schedule.targetLabel,
        cadenceLabel: scheduleCadenceLabel(schedule),
        nextRunLabel: schedule.nextRunAt ? `Next ${schedule.nextRunAt}` : "No automatic next run",
        versionLabel: scheduleVersionLabel(schedule, mode, latestApproved, versionById),
        driftLabel: drift.label,
        driftTone: drift.tone,
        dispatchLabel: dispatch.label,
        dispatchTone: dispatch.tone,
        grantLabel: grantState.label,
        grantDetail: grantState.detail,
        grantAction: grantState.action,
        latestRunId: latestRun?.id,
        latestRunLabel: latestRun ? `Latest run ${formatReviewLabel(latestRun.status)}` : undefined,
        latestRunDetail: latestRun
          ? `${latestRun.completedAt ? `Completed ${latestRun.completedAt}` : `Updated ${latestRun.updatedAt}`}${latestRun.scheduledBy?.targetVersionId ? ` · version ${latestRun.scheduledBy.targetVersionId}` : ""}`
          : undefined,
        latestRunTone: latestRun ? toneForRunStatus(latestRun.status) : undefined,
        latestRunActionLabel: latestRun ? scheduleRunAction(latestRun).label : undefined,
        latestRunActionTitle: latestRun ? scheduleRunAction(latestRun).title : undefined,
        recentRuns,
      };
    });
  return {
    schedules: scheduleItems,
    canScheduleLatestApproved: Boolean(latestApproved && !latestApprovedBlockReason),
    latestApprovedVersionLabel: latestApproved ? `v${latestApproved.version}` : undefined,
    latestApprovedBlockReason,
    canPinCurrentVersion: Boolean(currentVersion && currentVersion.status === "approved" && !pinCurrentBlockReason),
    currentVersionId: currentVersion?.id,
    currentVersionLabel: currentVersion ? `v${currentVersion.version}` : undefined,
    pinCurrentBlockReason,
  };
}

export function workflowScheduleRunHistoryItems(scheduleId: string, runs: WorkflowRunSummary[], limit = 3): WorkflowScheduleRunHistoryItem[] {
  return runs
    .filter((run) => run.scheduledBy?.scheduleId === scheduleId)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map((run) => ({
      id: run.id,
      statusLabel: run.scheduledBy?.outcome === "skipped" ? "Schedule skipped" : `Run ${formatReviewLabel(run.status)}`,
      detail: `${run.completedAt ? `Completed ${run.completedAt}` : `Updated ${run.updatedAt}`}${run.error ? ` · ${run.error}` : ""}${run.scheduledBy?.targetVersionId ? ` · version ${run.scheduledBy.targetVersionId}` : ""}`,
      tone: toneForRunStatus(run.status),
      actionLabel: scheduleRunAction(run).label,
      actionTitle: scheduleRunAction(run).title,
    }));
}

export function workflowScheduleExceptionLedgerItems(
  exceptions: AutomationScheduleExceptionSummary[],
  limit = 8,
): WorkflowScheduleExceptionLedgerItem[] {
  return [...exceptions]
    .sort((left, right) => (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt))
    .slice(0, limit)
    .map((exception) => {
      const title =
        exception.exceptionKind === "skip"
          ? "Skipped occurrence"
          : exception.exceptionKind === "reschedule"
            ? "Rescheduled occurrence"
            : exception.exceptionKind === "run_limits"
              ? "Run-limit override"
              : "Series edit";
      const replacement = exception.replacementRunAt ? `New time ${formatScheduleDateTime(exception.replacementRunAt)}.` : undefined;
      const runLimits = exception.runLimits ? scheduleRunLimitLabel({ runLimits: exception.runLimits }).detail : undefined;
      const reason = exception.reason ? `Reason: ${exception.reason}` : undefined;
      return {
        id: exception.id,
        title,
        occurrenceLabel: formatScheduleDateTime(exception.occurrenceAt),
        detail: [replacement, runLimits, reason].filter(Boolean).join(" "),
        statusLabel: exception.status === "pending" ? "Pending" : exception.consumedAt ? `Consumed ${formatScheduleDateTime(exception.consumedAt)}` : "Consumed",
        tone: exception.status === "pending" ? "review" : "neutral",
      };
    });
}

export function workflowScheduleCreationModel(input: {
  thread: Pick<WorkflowAgentThreadSummary, "id" | "title" | "latestVersion">;
  artifact: Pick<WorkflowArtifactSummary, "id" | "status">;
  versions: WorkflowVersionSummary[];
  schedules: AutomationScheduleSummary[];
  selectedTargetKind: "workflow_thread" | "workflow_version";
  selectedTargetId?: string;
  preset: AutomationSchedulePresetKind;
  cronExpression?: string;
  enabled: boolean;
  timezone?: string;
  focusedScheduleId?: string;
  editScope?: WorkflowScheduleEditScopeId;
  runLimits?: WorkflowRunLimitOverrides;
}): WorkflowScheduleCreationModel {
  const latestApproved = input.versions
    .filter((version) => version.workflowThreadId === input.thread.id && version.status === "approved")
    .sort((left, right) => right.version - left.version)[0];
  const currentVersion = input.versions.find((version) => version.artifactId === input.artifact.id);
  const focusedSchedule = input.focusedScheduleId ? input.schedules.find((schedule) => schedule.id === input.focusedScheduleId) : undefined;
  const latestDisabledReason = latestApproved ? undefined : "Approve a workflow version before scheduling latest approved.";
  const pinnedDisabledReason =
    currentVersion && currentVersion.status !== "approved"
      ? `Current version is ${formatReviewLabel(currentVersion.status)}.`
      : input.artifact.status !== "approved"
        ? "Approve this workflow version before pinning it to a schedule."
        : currentVersion
          ? undefined
          : "No committed version is available to pin.";
  const targetChoices: WorkflowScheduleTargetChoice[] = [
    {
      id: "latest-approved",
      mode: "latest_approved",
      targetKind: "workflow_thread",
      targetId: input.thread.id,
      label: "Latest approved",
      detail: latestApproved ? `Follows future approvals. Currently runs v${latestApproved.version}.` : latestDisabledReason ?? "",
      badge: latestApproved ? `v${latestApproved.version}` : "Needs approval",
      selected: input.selectedTargetKind === "workflow_thread",
      disabled: Boolean(latestDisabledReason),
      disabledReason: latestDisabledReason,
    },
    {
      id: "pinned-version",
      mode: "pinned_version",
      targetKind: "workflow_version",
      targetId: currentVersion?.id ?? "",
      label: "Pin this version",
      detail: currentVersion ? `Keeps running v${currentVersion.version} until this schedule is edited.` : pinnedDisabledReason ?? "",
      badge: currentVersion ? `v${currentVersion.version}` : "No version",
      selected: input.selectedTargetKind === "workflow_version" && (!input.selectedTargetId || input.selectedTargetId === currentVersion?.id),
      disabled: Boolean(pinnedDisabledReason),
      disabledReason: pinnedDisabledReason,
    },
  ];
  const selectedTarget = targetChoices.find((choice) => choice.selected && !choice.disabled) ?? targetChoices.find((choice) => !choice.disabled);
  const recurrenceLabel = workflowSchedulePresetLabel(input.preset, input.cronExpression ?? "");
  const nextRunLabel = workflowScheduleNextRunLabel(input.preset, input.cronExpression ?? "", input.enabled);
  const runLimit = scheduleRunLimitLabel(input.runLimits !== undefined ? { runLimits: input.runLimits } : focusedSchedule);
  const editScope = input.editScope ?? "all_occurrences";
  const editScopeChoices: WorkflowScheduleEditScopeChoice[] = [
    {
      id: "this_occurrence",
      label: "This occurrence",
      detail: focusedSchedule
        ? "Use Run History actions for one-off skip or defer changes to the next occurrence."
        : "Available after selecting an existing schedule occurrence.",
      selected: editScope === "this_occurrence",
      disabled: !focusedSchedule,
    },
    {
      id: "this_and_following",
      label: "This and following",
      detail: focusedSchedule
        ? "Apply target, repeat, and state changes beginning with the next occurrence."
        : "Available after selecting an existing schedule occurrence.",
      selected: editScope === "this_and_following",
      disabled: !focusedSchedule,
    },
    {
      id: "all_occurrences",
      label: "All occurrences",
      detail: focusedSchedule ? "Update the whole schedule series." : "Create a new schedule series.",
      selected: editScope === "all_occurrences",
      disabled: false,
    },
  ];
  const canSave = Boolean(selectedTarget && !selectedTarget.disabled && editScope !== "this_occurrence");
  return {
    title: focusedSchedule ? "Edit schedule" : "Create schedule",
    detail: focusedSchedule
      ? "Use calendar-style edit scope before changing this schedule series."
      : "Create an unattended schedule for this workflow thread or pin one approved version.",
    targetChoices,
    selectedTarget,
    recurrenceLabel,
    recurrenceDetail: input.preset === "advanced" ? "Cron-style recurrence" : "Preset recurrence",
    nextRunLabel,
    stateLabel: input.enabled ? "Enabled" : "Paused",
    timezoneLabel: input.timezone || "Local timezone",
    runLimitLabel: runLimit.label,
    runLimitDetail: runLimit.detail,
    editScopeChoices,
    previewRows: [
      {
        label: "Target",
        value: selectedTarget?.label ?? "No schedulable target",
        detail: selectedTarget?.detail ?? latestDisabledReason ?? pinnedDisabledReason ?? "Approve a workflow version before scheduling.",
        tone: selectedTarget ? "ready" : "blocked",
      },
      {
        label: "Repeats",
        value: recurrenceLabel,
        detail: input.preset === "manual" ? "No automatic dispatch." : nextRunLabel,
        tone: input.preset === "manual" ? "neutral" : "ready",
      },
      {
        label: "State",
        value: input.enabled ? "Enabled" : "Paused",
        detail: input.enabled ? "Eligible occurrences can dispatch when policy allows." : "Schedule is saved but will not dispatch.",
        tone: input.enabled ? "ready" : "review",
      },
      {
        label: "Run limits",
        value: runLimit.label,
        detail: runLimit.detail,
        tone: "neutral",
      },
      {
        label: "Concurrency",
        value: "Skip if active",
        detail: "An occurrence will not start if this workflow is already running.",
        tone: "neutral",
      },
      {
        label: "Timezone",
        value: input.timezone || "Local timezone",
        detail: "Calendar preview uses the machine timezone for preset schedules.",
        tone: "neutral",
      },
    ],
    canSave,
    saveLabel: focusedSchedule ? "Save schedule changes" : "Create schedule",
    saveTitle: canSave
      ? "Save this workflow schedule."
      : editScope === "this_occurrence"
        ? "Use Skip next or Defer next in Run History for single-occurrence changes."
        : selectedTarget?.disabledReason ?? "Select an approved workflow target before scheduling.",
  };
}

export function workflowScheduleGrantReadinessModel(input: {
  artifact: Pick<WorkflowArtifactSummary, "id" | "status" | "manifest">;
  permissionGrants?: AmbientPermissionGrant[];
  permissionAudit?: PermissionAuditEntry[];
  permissionMode?: "full-access" | "workspace";
  workflowThreadId: string;
  threadId?: string;
  projectPath?: string;
  workspacePath?: string;
  traceMode?: WorkflowTraceMode;
}): WorkflowScheduleGrantReadinessModel {
  const connectors = input.artifact.manifest.connectors ?? [];
  const ambientCliCapabilities = input.artifact.manifest.ambientCliCapabilities ?? [];
  const fullAccessReceiptCount = (input.permissionAudit ?? []).filter((entry) => entry.decisionSource === "allowed_by_full_access").length;
  if (!connectors.length && !ambientCliCapabilities.length) {
    return {
      title: "Schedule grants",
      detail: "This workflow does not request connector reads or installed Ambient CLI command execution for scheduled runs.",
      tone: "ready",
      summary: "No persistent grants required.",
      fullAccessReceiptCount,
      rows: [
        {
          id: "none",
          kind: "connector",
          connectorId: "none",
          accountLabel: "No connector",
          targetLabel: "No scheduled connector or CLI grant required",
          status: "none",
          statusLabel: "Ready",
          detail: "Scheduled runs can use workflow tools without persistent connector or Ambient CLI grants.",
          tone: "ready",
          expiryLabel: "No expiry",
          recentUseLabel: "No grant audit",
          riskLabel: "No connector read or installed CLI execution",
        },
      ],
      tiles: scheduleGrantReadinessTiles({ ready: 1, missing: 0, expired: 0, fullAccess: 0, fullAccessReceiptCount }),
    };
  }
  const rows = [
    ...connectors.flatMap((connector) => workflowScheduleGrantRowsForConnector(connector, input)),
    ...ambientCliCapabilities.map((capability) => workflowScheduleGrantRowForAmbientCliCapability(capability, input)),
  ];
  const ready = rows.filter((row) => row.status === "ready" || row.status === "none").length;
  const fullAccess = rows.filter((row) => row.status === "full_access").length;
  const missing = rows.filter((row) => row.status === "missing" || row.status === "no_account").length;
  const expired = rows.filter((row) => row.status === "expired" || row.status === "revoked").length;
  const tone: WorkflowReviewTone = missing || expired ? "blocked" : fullAccess ? "review" : "ready";
  return {
    title: "Schedule grants",
    detail:
      input.permissionMode === "full-access"
        ? "Full Access can bypass persistent grants, but scheduled unattended runs should prefer explicit reusable connector and Ambient CLI grants."
        : "Persistent grants let scheduled runs reuse connector reads and installed Ambient CLI command approvals without asking at each occurrence.",
    tone,
    summary:
      missing || expired
        ? `${missing + expired} grant issue${missing + expired === 1 ? "" : "s"} before unattended dispatch.`
        : fullAccess
          ? "Full Access bypass is available; no persistent grant will be created automatically."
          : `${ready} reusable grant${ready === 1 ? "" : "s"} ready.`,
    rows,
    tiles: scheduleGrantReadinessTiles({ ready, missing, expired, fullAccess, fullAccessReceiptCount }),
    fullAccessReceiptCount,
  };
}

function workflowSchedulePresetLabel(preset: AutomationSchedulePresetKind, expression: string): string {
  if (preset === "manual") return "Does not repeat";
  if (preset === "hourly") return "Every hour";
  if (preset === "daily") return "Daily at 9:00";
  if (preset === "weekdays") return "Every weekday at 9:00";
  if (preset === "weekly") return "Weekly on Monday at 9:00";
  return expression.trim() ? `Custom cron ${expression.trim()}` : "Custom recurrence";
}

function workflowScheduleNextRunLabel(preset: AutomationSchedulePresetKind, expression: string, enabled: boolean): string {
  if (!enabled) return "Paused; no occurrences will dispatch.";
  if (preset === "manual") return "No automatic occurrence.";
  if (preset === "hourly") return "Next eligible hourly occurrence.";
  if (preset === "daily") return "Next eligible 9:00 AM occurrence.";
  if (preset === "weekdays") return "Next eligible weekday at 9:00 AM.";
  if (preset === "weekly") return "Next eligible Monday at 9:00 AM.";
  return expression.trim() ? `Next occurrence follows ${expression.trim()}.` : "Enter a cron expression to preview occurrences.";
}

function workflowScheduleGrantRowsForConnector(
  connector: WorkflowConnectorManifestGrant,
  input: {
    artifact: Pick<WorkflowArtifactSummary, "id" | "status" | "manifest">;
    permissionGrants?: AmbientPermissionGrant[];
    permissionAudit?: PermissionAuditEntry[];
    permissionMode?: "full-access" | "workspace";
    workflowThreadId: string;
    threadId?: string;
    projectPath?: string;
    workspacePath?: string;
  },
): WorkflowScheduleGrantReadinessRow[] {
  const requirements = workflowScheduleConnectorGrantRequirements({
    manifest: { connectors: [connector] },
  } as Pick<WorkflowArtifactSummary, "manifest">);
  return requirements.map((requirement) => {
    const operation = requirement.operation;
    const targetLabel = requirement.targetLabel;
    const grants = (input.permissionGrants ?? []).filter((grant) => connectorGrantMatches(grant, requirement, input));
    const activeGrant = grants.find((grant) => !grant.revokedAt && !grantExpired(grant) && !grant.conditions?.discoveryOnly);
    const revokedGrant = grants.find((grant) => grant.revokedAt);
    const expiredGrant = grants.find((grant) => !grant.revokedAt && grantExpired(grant));
    const audit = activeGrant ? latestAuditForGrant(input.permissionAudit ?? [], activeGrant.id) : undefined;
    const accountLabel = connector.accountId ? `Account ${connector.accountId}` : "No account selected";
    const action: WorkflowThreadScheduleGrantAction | undefined =
      connector.accountId && !activeGrant
        ? {
            label: "Allow scheduled reads",
            connectorId: connector.connectorId,
            operation,
            accountId: connector.accountId,
            targetLabel,
            targetIdentity: requirement.targetIdentity,
            scopeKind: "workflow_thread",
            reason: `Allow scheduled workflow runs to read ${targetLabel}.`,
          }
        : undefined;
    if (!connector.accountId) {
      return {
        id: `${targetLabel}:no-account`,
        kind: "connector",
        connectorId: connector.connectorId,
        operation,
        accountLabel,
        targetLabel,
        status: "no_account",
        statusLabel: "Account needed",
        detail: "Select a connector account before this schedule can dispatch unattended.",
        tone: "blocked",
        expiryLabel: "No grant",
        recentUseLabel: "No reuse audit",
        riskLabel: scheduleGrantRiskLabel(input.artifact.manifest),
      };
    }
    if (activeGrant) {
      return {
        id: activeGrant.id,
        kind: "connector",
        connectorId: connector.connectorId,
        operation,
        accountLabel,
        targetLabel,
        status: "ready",
        statusLabel: "Reusable grant ready",
        detail: `${formatScheduleGrantScope(activeGrant.scopeKind)} grant ${activeGrant.targetLabel} can be reused by scheduled runs.`,
        tone: "ready",
        expiryLabel: activeGrant.expiresAt ? `Expires ${activeGrant.expiresAt}` : "No expiry",
        recentUseLabel: audit ? `Last reused ${audit.createdAt}` : "No visible reuse audit yet",
        riskLabel: scheduleGrantRiskLabel(input.artifact.manifest),
      };
    }
    if (expiredGrant) {
      return {
        id: `${expiredGrant.id}:expired`,
        kind: "connector",
        connectorId: connector.connectorId,
        operation,
        accountLabel,
        targetLabel,
        status: "expired",
        statusLabel: "Grant expired",
        detail: `A matching grant expired${expiredGrant.expiresAt ? ` at ${expiredGrant.expiresAt}` : ""}. Create a fresh scheduled grant.`,
        tone: "blocked",
        expiryLabel: expiredGrant.expiresAt ? `Expired ${expiredGrant.expiresAt}` : "Expired",
        recentUseLabel: "Cannot reuse",
        riskLabel: scheduleGrantRiskLabel(input.artifact.manifest),
        action,
      };
    }
    if (revokedGrant) {
      return {
        id: `${revokedGrant.id}:revoked`,
        kind: "connector",
        connectorId: connector.connectorId,
        operation,
        accountLabel,
        targetLabel,
        status: "revoked",
        statusLabel: "Grant revoked",
        detail: `A matching grant was revoked${revokedGrant.revokedAt ? ` at ${revokedGrant.revokedAt}` : ""}. Create a fresh scheduled grant.`,
        tone: "blocked",
        expiryLabel: "Revoked",
        recentUseLabel: "Cannot reuse",
        riskLabel: scheduleGrantRiskLabel(input.artifact.manifest),
        action,
      };
    }
    return {
      id: `${targetLabel}:missing`,
      kind: "connector",
      connectorId: connector.connectorId,
      operation,
      accountLabel,
      targetLabel,
      status: "missing",
      statusLabel: "Grant needed",
      detail: `Create a workflow-scoped scheduled-read grant for ${targetLabel}.`,
      tone: "blocked",
      expiryLabel: "No grant",
      recentUseLabel: "No reuse audit",
      riskLabel: scheduleGrantRiskLabel(input.artifact.manifest),
      action,
    };
  });
}

function workflowScheduleGrantRowForAmbientCliCapability(
  capability: WorkflowAmbientCliCapabilityGrant,
  input: {
    artifact: Pick<WorkflowArtifactSummary, "id" | "status" | "manifest">;
    permissionGrants?: AmbientPermissionGrant[];
    permissionAudit?: PermissionAuditEntry[];
    permissionMode?: "full-access" | "workspace";
    workflowThreadId: string;
    threadId?: string;
    projectPath?: string;
    workspacePath?: string;
    traceMode?: WorkflowTraceMode;
  },
): WorkflowScheduleGrantReadinessRow {
  const targetLabel = workflowAmbientCliScheduleTargetLabel(capability);
  const operationLabel = `${capability.packageName}:${capability.command}`;
  const matchingUses = workflowArtifactScheduleAmbientCliGrantUses(
    { ...input.artifact, workflowThreadId: input.workflowThreadId },
    input,
  ).filter((use) => use.capabilityId === capability.capabilityId);
  const activeGrant = matchingUses[0]?.grant;
  const matchingGrants = (input.permissionGrants ?? []).filter((grant) => grant.actionKind === "plugin_tool_execute" && grant.targetKind === "tool" && grant.targetLabel === targetLabel);
  const revokedGrant = matchingGrants.find((grant) => grant.revokedAt);
  const expiredGrant = matchingGrants.find((grant) => !grant.revokedAt && grantExpired(grant));
  const audit = activeGrant ? latestAuditForGrant(input.permissionAudit ?? [], activeGrant.id) : undefined;
  const riskLabel = ambientCliScheduleRiskLabel(input.traceMode);
  const baseRow = {
    kind: "ambient_cli" as const,
    connectorId: capability.packageName,
    operation: capability.command,
    accountLabel: `Ambient CLI package ${capability.packageId}`,
    targetLabel,
    riskLabel,
  };
  if (input.permissionMode === "full-access") {
    return {
      ...baseRow,
      id: `${capability.capabilityId}:full-access`,
      status: "full_access",
      statusLabel: "Full Access bypass",
      detail: `Full Access can run ${operationLabel} for scheduled workflows without creating a persistent CLI grant.`,
      tone: "review",
      expiryLabel: "No persistent grant",
      recentUseLabel: "Full Access receipt only",
    };
  }
  if (activeGrant) {
    return {
      ...baseRow,
      id: activeGrant.id,
      status: "ready",
      statusLabel: "CLI grant ready",
      detail: `${formatScheduleGrantScope(activeGrant.scopeKind)} grant can run ${operationLabel} for unattended workflow schedules.`,
      tone: "ready",
      expiryLabel: activeGrant.expiresAt ? `Expires ${activeGrant.expiresAt}` : "No expiry",
      recentUseLabel: audit ? `Last reused ${audit.createdAt}` : "No visible reuse audit yet",
    };
  }
  if (expiredGrant) {
    return {
      ...baseRow,
      id: `${expiredGrant.id}:expired`,
      status: "expired",
      statusLabel: "CLI grant expired",
      detail: `A matching Ambient CLI grant expired${expiredGrant.expiresAt ? ` at ${expiredGrant.expiresAt}` : ""}. Run once with an Always Allow scope before unattended schedules dispatch.`,
      tone: "blocked",
      expiryLabel: expiredGrant.expiresAt ? `Expired ${expiredGrant.expiresAt}` : "Expired",
      recentUseLabel: "Cannot reuse",
    };
  }
  if (revokedGrant) {
    return {
      ...baseRow,
      id: `${revokedGrant.id}:revoked`,
      status: "revoked",
      statusLabel: "CLI grant revoked",
      detail: `A matching Ambient CLI grant was revoked${revokedGrant.revokedAt ? ` at ${revokedGrant.revokedAt}` : ""}. Run once with an Always Allow scope before unattended schedules dispatch.`,
      tone: "blocked",
      expiryLabel: "Revoked",
      recentUseLabel: "Cannot reuse",
    };
  }
  return {
    ...baseRow,
    id: `${capability.capabilityId}:missing`,
    status: "missing",
    statusLabel: "CLI grant needed",
    detail: `Run this workflow once and choose Always Allow for ${operationLabel}, or keep scheduling blocked until a matching reusable Ambient CLI grant exists.`,
    tone: "blocked",
    expiryLabel: "No grant",
    recentUseLabel: "No reuse audit",
  };
}

function scheduleGrantRiskLabel(manifest: WorkflowManifest): string {
  if (manifest.mutationPolicy === "read_only") return "Read-only scheduled connector access";
  if (manifest.mutationPolicy === "staged_until_approved") return "Staged mutation policy; connector read grant only";
  return "Mutation-capable workflow; review before unattended use";
}

function ambientCliScheduleRiskLabel(traceMode: WorkflowTraceMode = "production"): string {
  if (traceMode === "debug") return "Installed CLI execution; stdout/stderr artifact previews retained with debug trace cleanup.";
  return "Installed CLI execution; production trace keeps bounded previews and artifact pointers.";
}

function scheduleGrantReadinessTiles(input: {
  ready: number;
  missing: number;
  expired: number;
  fullAccess: number;
  fullAccessReceiptCount: number;
}): WorkflowScheduleGrantReadinessTile[] {
  return [
    {
      id: "ready",
      label: "Reusable",
      value: String(input.ready),
      detail: "Persistent grants ready for unattended runs.",
      tone: input.ready ? "ready" : "neutral",
    },
    {
      id: "blocked",
      label: "Needs action",
      value: String(input.missing + input.expired),
      detail: "Missing, expired, revoked, or accountless connector/CLI grants.",
      tone: input.missing + input.expired ? "blocked" : "ready",
    },
    {
      id: "full-access",
      label: "Full Access",
      value: String(input.fullAccess),
      detail: "Current bypasses available without persistent grants.",
      tone: input.fullAccess ? "review" : "neutral",
    },
    {
      id: "receipts",
      label: "Receipts",
      value: String(input.fullAccessReceiptCount),
      detail: "Full Access audit receipts retained separately from grants.",
      tone: input.fullAccessReceiptCount ? "review" : "neutral",
    },
  ];
}

function toneForRunStatus(status: WorkflowRunSummary["status"]): WorkflowReviewTone {
  if (status === "succeeded") return "ready";
  if (status === "failed" || status === "canceled") return "blocked";
  if (status === "paused" || status === "needs_input" || status === "running") return "running";
  return "neutral";
}

function scheduleRunAction(run: WorkflowRunSummary): { label: string; title: string } {
  if (run.status === "needs_input") {
    return { label: "Answer input", title: "Open the run console to answer the workflow and resume this occurrence." };
  }
  if (run.status === "paused" && /total runtime limit/i.test(run.error ?? "")) {
    return { label: "Extend run", title: "Open the run console to extend this paused scheduled occurrence." };
  }
  if (run.status === "paused") {
    return { label: "Resume run", title: "Open the run console to resume this paused scheduled occurrence." };
  }
  if (run.status === "running") return { label: "Watch run", title: "Open the live scheduled run console." };
  if (run.status === "failed") return { label: "Inspect failure", title: "Open the failed scheduled run audit trail." };
  return { label: "Open run", title: "Open the scheduled run audit trail." };
}

function scheduleRunLimitLabel(schedule: Pick<AutomationScheduleSummary, "runLimits"> | undefined): { label: string; detail: string } {
  const runLimits = schedule?.runLimits;
  const idle = formatDuration(runLimits?.idleTimeoutMs);
  if (!runLimits) {
    return {
      label: "Manifest default",
      detail: "Scheduled runs use the workflow manifest total cap and the default stream-idle timeout.",
    };
  }
  if (runLimits.maxRunMs === null) {
    return {
      label: "No total cap",
      detail: `Stream-idle timeout ${idle}; total runtime cap disabled for this schedule.`,
    };
  }
  if (typeof runLimits.maxRunMs === "number") {
    return {
      label: formatDuration(runLimits.maxRunMs),
      detail: `Stream-idle timeout ${idle}; total runtime cap overrides the manifest.`,
    };
  }
  return {
    label: "Manifest cap",
    detail: `Stream-idle timeout ${idle}; total runtime cap follows the workflow manifest.`,
  };
}

function scheduleDispatchLabel(
  schedule: AutomationScheduleSummary,
  mode: WorkflowThreadScheduleItem["mode"],
  artifact: Pick<WorkflowArtifactSummary, "status" | "manifest">,
  latestApproved: WorkflowVersionSummary | undefined,
  versionById: Map<string, WorkflowVersionSummary>,
  blockOptions: Parameters<typeof workflowArtifactScheduleBlockReason>[1],
): { label: string; tone: WorkflowReviewTone } {
  if (mode === "latest_approved" && !latestApproved) return { label: "Blocked: no approved workflow version", tone: "blocked" };
  if (mode === "pinned_version") {
    const pinned = versionById.get(schedule.targetId);
    if (!pinned) return { label: "Blocked: pinned version missing", tone: "blocked" };
    if (pinned.status !== "approved") return { label: `Blocked: pinned version is ${formatReviewLabel(pinned.status)}`, tone: "blocked" };
  }
  const blockedReason = workflowArtifactScheduleBlockReason(artifact as WorkflowArtifactSummary, blockOptions);
  if (blockedReason) return { label: `Blocked: ${workflowScheduleUiBlockReason(blockedReason)}`, tone: "blocked" };
  return { label: "Dispatchable", tone: "ready" };
}

function workflowScheduleUiBlockReason(reason: string): string {
  return reason
    .replace(/^Workflow schedule requires reviewed Ambient CLI grant(s)? for /, "reviewed Ambient CLI grant$1 needed for ")
    .replace(/^Workflow schedule requires connector account(s)? for /, "connector account$1 needed for ")
    .replace(/^Workflow schedule requires persistent connector grant(s)? for /, "persistent connector grant$1 needed for ")
    .replace(/^Workflow preview needs approval before scheduled execution\.$/, "workflow needs approval")
    .replace(/^Workflow artifact is (.+) and cannot be scheduled until approved\.$/, "workflow is $1")
    .replace(/\.$/, "");
}

function scheduleConnectorGrantState(input: {
  artifact: Pick<WorkflowArtifactSummary, "id" | "status" | "manifest">;
  permissionGrants?: AmbientPermissionGrant[];
  permissionAudit?: PermissionAuditEntry[];
  permissionMode?: "full-access" | "workspace";
  workflowThreadId: string;
  threadId?: string;
  projectPath?: string;
  workspacePath?: string;
}): { label?: string; detail?: string; action?: WorkflowThreadScheduleGrantAction } {
  if (input.artifact.status !== "approved") return {};
  const connectors = input.artifact.manifest.connectors ?? [];
  const artifactWithThread = { ...input.artifact, workflowThreadId: input.workflowThreadId };
  const missingAmbientCliGrants = workflowScheduleMissingAmbientCliGrants(artifactWithThread, input);
  const ambientCliGrantUses = workflowArtifactScheduleAmbientCliGrantUses(artifactWithThread, input);
  if (!connectors.length && !missingAmbientCliGrants.length && !ambientCliGrantUses.length) return {};
  const runtimeGrants = (input.permissionGrants ?? []).filter((grant) => !grant.revokedAt && !grantExpired(grant) && !grant.conditions?.discoveryOnly);
  const connectorStates = workflowScheduleConnectorGrantRequirements(artifactWithThread).map((requirement) => {
    const grant = runtimeGrants.find((candidate) => connectorGrantMatches(candidate, requirement, input));
    return { requirement, grant };
  });
  const missing = connectorStates.find((state) => !state.grant && state.requirement.accountId?.trim());
  if (missing) {
    const { requirement } = missing;
    return {
      label: "Persistent grant needed",
      detail: `Create a workflow-scoped scheduled-read grant for ${requirement.targetLabel}${requirement.accountId ? ` on ${requirement.accountId}` : ""}.`,
      action: {
        label: "Allow scheduled reads",
        connectorId: requirement.connectorId,
        operation: requirement.operation,
        accountId: requirement.accountId,
        targetLabel: requirement.targetLabel,
        targetIdentity: requirement.targetIdentity,
        scopeKind: "workflow_thread",
        reason: `Allow scheduled workflow runs to read ${requirement.targetLabel}.`,
      },
    };
  }
  if (missingAmbientCliGrants.length > 0) {
    return {
      label: "Ambient CLI grant needed",
      detail: `Run once with Always Allow before scheduling ${missingAmbientCliGrants.slice(0, 2).join(", ")}${missingAmbientCliGrants.length > 2 ? `, +${missingAmbientCliGrants.length - 2} more` : ""}.`,
    };
  }
  if (!connectors.length && ambientCliGrantUses.length) {
    const grant = ambientCliGrantUses[0].grant;
    const audit = latestAuditForGrant(input.permissionAudit ?? [], grant.id);
    return {
      label: `Grant: ${formatScheduleGrantScope(grant.scopeKind)} ${ambientCliGrantUses[0].packageName}:${ambientCliGrantUses[0].command}`,
      detail: [
        audit ? `Last reuse ${audit.createdAt}` : "No visible reuse audit yet",
        ambientCliGrantUses.length > 1 ? `${ambientCliGrantUses.length} CLI grants satisfy this schedule` : undefined,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · "),
    };
  }
  const grants = connectorStates.map((state) => state.grant).filter((grant): grant is AmbientPermissionGrant => Boolean(grant));
  if (!grants.length) return {};
  const grant = grants[0];
  const requirement = connectorStates.find((state) => state.grant?.id === grant.id)?.requirement;
  const audit = latestAuditForGrant(input.permissionAudit ?? [], grant.id);
  return {
    label: `Grant: ${formatScheduleGrantScope(grant.scopeKind)} ${grant.targetLabel}`,
    detail: [
      requirement?.accountId ? `Account ${requirement.accountId}` : undefined,
      audit ? `Last reuse ${audit.createdAt}` : "No visible reuse audit yet",
      grants.length > 1 ? `${grants.length} grants satisfy this schedule` : undefined,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · "),
  };
}

function connectorGrantMatches(
  grant: AmbientPermissionGrant,
  requirement: WorkflowScheduleConnectorGrantRequirement,
  input: { workflowThreadId: string; threadId?: string; projectPath?: string; workspacePath?: string },
): boolean {
  if (!workflowScheduleConnectorGrantMatches(grant, requirement, { id: "", workflowThreadId: input.workflowThreadId }, input)) return false;
  if (grant.scopeKind === "thread") return Boolean(input.threadId && grant.threadId === input.threadId);
  if (grant.scopeKind === "workflow_thread") return grant.workflowThreadId === input.workflowThreadId;
  if (grant.scopeKind === "project") return Boolean(input.projectPath && grant.projectPath === input.projectPath);
  if (grant.scopeKind === "workspace") return Boolean(input.workspacePath && grant.workspacePath === input.workspacePath);
  return false;
}

function latestAuditForGrant(entries: PermissionAuditEntry[], grantId: string): PermissionAuditEntry | undefined {
  return entries
    .filter((entry) => entry.grantId === grantId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function grantExpired(grant: AmbientPermissionGrant, now = Date.now()): boolean {
  if (!grant.expiresAt) return false;
  const expiresAt = new Date(grant.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function formatScheduleGrantScope(scope: PermissionGrantScopeKind): string {
  if (scope === "workflow_thread") return "Workflow";
  if (scope === "thread") return "Thread";
  if (scope === "project") return "Project";
  if (scope === "workspace") return "Workspace";
  return "Plugin";
}

function scheduleVersionLabel(
  schedule: AutomationScheduleSummary,
  mode: WorkflowThreadScheduleItem["mode"],
  latestApproved: WorkflowVersionSummary | undefined,
  versionById: Map<string, WorkflowVersionSummary>,
): string {
  if (mode === "latest_approved") return latestApproved ? `Runs latest approved v${latestApproved.version}` : "No approved version";
  if (mode === "pinned_version") {
    const pinned = versionById.get(schedule.targetId);
    return pinned ? `Pinned to v${pinned.version}` : "Pinned version missing";
  }
  return "Artifact target";
}

function scheduleDriftLabel(
  schedule: AutomationScheduleSummary,
  mode: WorkflowThreadScheduleItem["mode"],
  latestApproved: WorkflowVersionSummary | undefined,
  versionById: Map<string, WorkflowVersionSummary>,
): { label: string; tone: WorkflowReviewTone } {
  if (mode !== "latest_approved") return { label: "No latest-approved drift", tone: "neutral" };
  if (!latestApproved) return { label: "Blocked: no approved version", tone: "blocked" };
  if (!schedule.createdTargetVersionId) {
    return { label: `Created before version capture; currently runs v${latestApproved.version}`, tone: "review" };
  }
  const createdVersion = versionById.get(schedule.createdTargetVersionId);
  if (!createdVersion) {
    return { label: `Original approved version is missing; currently runs v${latestApproved.version}`, tone: "review" };
  }
  if (createdVersion.id === latestApproved.id) return { label: `No drift from created v${createdVersion.version}`, tone: "ready" };
  return { label: `Drifted from created v${createdVersion.version} to latest approved v${latestApproved.version}`, tone: "review" };
}

function reviewNotice(status: WorkflowArtifactStatus): Pick<WorkflowReviewWorkspaceModel, "noticeTitle" | "noticeDetail" | "noticeTone"> {
  if (status === "approved") {
    return {
      noticeTitle: "Approved version",
      noticeDetail: "This workflow version can run on demand or from a schedule.",
      noticeTone: "ready",
    };
  }
  if (status === "ready_for_preview") {
    return {
      noticeTitle: "Ready for review",
      noticeDetail: "Review the generated program, graph, grants, mutation policy, and dry-run evidence before approving this version.",
      noticeTone: "review",
    };
  }
  if (status === "rejected") {
    return {
      noticeTitle: "Rejected preview",
      noticeDetail: "Rejected previews cannot run unless they are edited and recompiled.",
      noticeTone: "blocked",
    };
  }
  if (status === "archived") {
    return {
      noticeTitle: "Archived workflow",
      noticeDetail: "Archived workflow versions are retained for audit but are not runnable.",
      noticeTone: "blocked",
    };
  }
  return {
    noticeTitle: "Draft workflow",
    noticeDetail: "Compile or revalidate this draft before review.",
    noticeTone: "neutral",
  };
}

function workflowReviewBadges(
  manifest: WorkflowManifest,
  latestRun: WorkflowRunSummary | undefined,
  graph: WorkflowGraphSnapshot | undefined,
  versionLabel: string,
): string[] {
  return [
    versionLabel,
    formatReviewLabel(manifest.mutationPolicy),
    graph ? `${graph.nodes.length} graph nodes` : "No graph",
    latestRun ? `Latest ${formatReviewLabel(latestRun.status)}` : "No runs",
    ...workflowRunDurabilityBadges(latestRun),
    manifest.connectors?.length ? `${manifest.connectors.length} connector grants` : "No connectors",
    manifest.ambientCliCapabilities?.length ? `${manifest.ambientCliCapabilities.length} CLI capabilities` : "No CLI capabilities",
    manifest.pluginCapabilities?.length ? `${manifest.pluginCapabilities.length} plugin requirements` : "No plugin requirements",
  ];
}

function workflowRunDurabilityBadges(latestRun: WorkflowRunSummary | undefined): string[] {
  if (!latestRun) return [];
  const badges: string[] = [];
  if (workflowRunLiveness(latestRun).stale) badges.push("Run stale");
  if (latestRun.providerHealth?.status && latestRun.providerHealth.status !== "unknown") {
    badges.push(
      latestRun.providerHealth.status === "provider_degraded"
        ? "Provider degraded"
        : latestRun.providerHealth.status === "product_failed"
          ? "Product failure"
          : "Provider ok",
    );
  }
  const recoveryAttemptCount = latestRun.retryMetadata?.recoveryAttemptCount ?? (latestRun.recoveryContext ? 1 : 0);
  if (recoveryAttemptCount > 0) badges.push(`${recoveryAttemptCount} recovery attempt${recoveryAttemptCount === 1 ? "" : "s"}`);
  const providerRetryCount = latestRun.retryMetadata?.providerRetryEventCount ?? 0;
  if (providerRetryCount > 0) badges.push(`${providerRetryCount} provider retry event${providerRetryCount === 1 ? "" : "s"}`);
  return badges;
}

function scheduleCadenceLabel(schedule: AutomationScheduleSummary): string {
  if (schedule.preset === "advanced") return schedule.cronExpression ? `Cron ${schedule.cronExpression}` : "Custom cron";
  return formatReviewLabel(schedule.preset);
}

function formatScheduleDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function requestSection(thread: WorkflowReviewWorkspaceInput["thread"]): WorkflowReviewSection {
  const answered = thread.discoveryQuestions.filter((question) => question.answer).length;
  const total = thread.discoveryQuestions.length;
  return {
    id: "request",
    label: "Request",
    value: total > 0 ? `${answered}/${total} answers` : "Direct compile",
    detail: total > 0 ? "Discovery answers are part of the compile context." : "This workflow was compiled without discovery questions.",
    tone: total > 0 && answered === total ? "ready" : total > 0 ? "review" : "neutral",
  };
}

function discoveryContextSection(model: WorkflowDiscoveryContextReviewModel): WorkflowReviewSection {
  return {
    id: "discovery_context",
    label: "Discovery context",
    value: model.tileValue,
    detail: model.tileDetail,
    tone: model.tone,
  };
}

function diagramSection(graph: WorkflowGraphSnapshot | undefined): WorkflowReviewSection {
  if (!graph) {
    return {
      id: "diagram",
      label: "Diagram",
      value: "Missing graph",
      detail: "Revalidate or compile again to attach a graph snapshot.",
      tone: "blocked",
    };
  }
  const edgeCount = graph.edges.length;
  return {
    id: "diagram",
    label: "Diagram",
    value: `${graph.nodes.length} nodes`,
    detail: `${edgeCount} edge${edgeCount === 1 ? "" : "s"} from ${formatReviewLabel(graph.source)} snapshot ${graph.version}.`,
    tone: "ready",
  };
}

function traceRetentionSection(
  thread: WorkflowReviewWorkspaceInput["thread"],
  detail: WorkflowRunDetail | undefined,
): WorkflowReviewSection {
  const retention = workflowTraceRetentionReviewModel({
    traceMode: thread.traceMode,
    events: detail?.events,
    modelCalls: detail?.modelCalls,
  });
  return {
    id: "trace_retention",
    label: "Trace retention",
    value: retention.windowLabel,
    detail: retention.detail,
    tone: retention.tone,
  };
}

function connectorSection(artifact: WorkflowArtifactSummary): WorkflowReviewSection {
  const connectors = artifact.manifest.connectors ?? [];
  if (artifact.status === "rejected") {
    return {
      id: "connectors",
      label: "Connector grants",
      value: connectors.length ? `${connectors.length} rejected` : "Rejected",
      detail: "A connector or review decision rejected this preview.",
      tone: "blocked",
    };
  }
  if (connectors.length === 0) {
    return {
      id: "connectors",
      label: "Connector grants",
      value: "None",
      detail: "The manifest does not request external connector grants.",
      tone: "ready",
    };
  }
  const rawRetention = connectors.filter((connector) => connector.dataRetention === "run_artifact").length;
  return {
    id: "connectors",
    label: "Connector grants",
    value: `${connectors.length} grant${connectors.length === 1 ? "" : "s"}`,
    detail: rawRetention > 0 ? `${rawRetention} grant${rawRetention === 1 ? "" : "s"} may retain run artifacts.` : "Grant scopes and retention need review.",
    tone: rawRetention > 0 ? "review" : "ready",
  };
}

function pluginSection(artifact: WorkflowArtifactSummary): WorkflowReviewSection {
  const capabilities = artifact.manifest.pluginCapabilities ?? [];
  return {
    id: "plugins",
    label: "Plugin requirements",
    value: capabilities.length ? `${capabilities.length} required` : "None",
    detail: capabilities.length ? "Plugin capability availability is shown below before approval." : "No plugin capability grants are required.",
    tone: capabilities.length ? "review" : "ready",
  };
}

function ambientCliSection(artifact: WorkflowArtifactSummary): WorkflowReviewSection {
  const capabilities = artifact.manifest.ambientCliCapabilities ?? [];
  if (capabilities.length === 0) {
    return {
      id: "ambient_cli",
      label: "Ambient CLI",
      value: "None",
      detail: "The manifest does not request installed Ambient CLI commands.",
      tone: "ready",
    };
  }
  return {
    id: "ambient_cli",
    label: "Ambient CLI",
    value: `${capabilities.length} command${capabilities.length === 1 ? "" : "s"}`,
    detail: `Manual review required for ${capabilities.map((capability) => `${capability.packageName}:${capability.command}`).join(", ")} before unattended scheduling is enabled.`,
    tone: "review",
  };
}

function mutationPolicySection(manifest: WorkflowManifest): WorkflowReviewSection {
  if (manifest.mutationPolicy === "read_only") {
    return {
      id: "mutation_policy",
      label: "Mutation policy",
      value: "Read only",
      detail: "Runs can inspect inputs and produce outputs without external writes.",
      tone: "ready",
    };
  }
  if (manifest.mutationPolicy === "staged_until_approved") {
    return {
      id: "mutation_policy",
      label: "Mutation policy",
      value: "Staged",
      detail: "The workflow can prepare changes, then pause for approval.",
      tone: "review",
    };
  }
  return {
    id: "mutation_policy",
    label: "Mutation policy",
    value: "Apply after approval",
    detail: "Approved versions can perform bounded mutations during real runs.",
    tone: "review",
  };
}

function runLimitsSection(manifest: WorkflowManifest): WorkflowReviewSection {
  const limits = [
    manifest.maxToolCalls !== undefined ? `${manifest.maxToolCalls} tools` : undefined,
    manifest.maxModelCalls !== undefined ? `${manifest.maxModelCalls} model calls` : undefined,
    manifest.maxConnectorCalls !== undefined ? `${manifest.maxConnectorCalls} connector calls` : undefined,
    manifest.maxRunMs !== undefined ? `${Math.round(manifest.maxRunMs / 1000)}s manifest total cap` : undefined,
  ].filter((limit): limit is string => Boolean(limit));
  return {
    id: "run_limits",
    label: "Run limits",
    value: limits.length ? `${limits.length} limits` : "Defaults",
    detail: limits.length ? `${limits.join(", ")}. Foreground runs can disable the total cap.` : "No explicit limits were added to the manifest.",
    tone: limits.length ? "ready" : "review",
  };
}

function dryRunSection(latestRun: WorkflowRunSummary | undefined, detail: WorkflowRunDetail | undefined): WorkflowReviewSection {
  if (!latestRun) {
    return {
      id: "dry_run",
      label: "Dry-run evidence",
      value: "No run",
      detail: "Run a dry run or open an audit before approval.",
      tone: "review",
    };
  }
  const liveness = workflowRunLiveness(latestRun, detail?.events ?? []);
  const staleRunning = liveness.stale;
  const tone: WorkflowReviewTone =
    latestRun.status === "succeeded" || latestRun.status === "previewed"
      ? "ready"
      : staleRunning || latestRun.status === "failed" || latestRun.status === "canceled"
        ? "blocked"
        : latestRun.status === "running"
        ? "running"
        : "review";
  return {
    id: "dry_run",
    label: "Dry-run evidence",
    value: staleRunning ? "Running (stale)" : formatReviewLabel(latestRun.status),
    detail: [
      detail
        ? `${detail.events.length} events, ${detail.modelCalls.length} model calls, ${detail.checkpoints.length} checkpoints.`
        : "Open the latest audit for event and model-call details.",
      staleRunning ? liveness.summary : undefined,
      workflowRunDurabilityDetail(latestRun),
    ]
      .filter((item): item is string => Boolean(item))
      .join(" "),
    tone,
  };
}

function workflowRunDurabilityDetail(latestRun: WorkflowRunSummary): string | undefined {
  const details: string[] = [];
  if (latestRun.graphSnapshotId) details.push(`Graph snapshot ${latestRun.graphSnapshotId} retained.`);
  if (latestRun.providerHealth?.status === "provider_degraded") {
    details.push(
      `Provider health is degraded${latestRun.providerHealth.error ? `: ${truncateReviewDetail(latestRun.providerHealth.error, 160)}` : "."}`,
    );
  } else if (latestRun.providerHealth?.status === "product_failed") {
    details.push("Failure appears product-side rather than provider-side.");
  } else if (latestRun.providerHealth?.status === "ok" && latestRun.providerHealth.providerEventCount > 0) {
    details.push(`${latestRun.providerHealth.providerEventCount} provider events retained.`);
  }
  const retryMetadata = latestRun.retryMetadata;
  if (retryMetadata?.recoveryAttemptCount) {
    details.push(`${retryMetadata.recoveryAttemptCount} recovery attempt${retryMetadata.recoveryAttemptCount === 1 ? "" : "s"} retained.`);
  }
  if (retryMetadata?.providerRetryEventCount) {
    details.push(`${retryMetadata.providerRetryEventCount} provider retry event${retryMetadata.providerRetryEventCount === 1 ? "" : "s"} retained.`);
  }
  return details.length ? details.join(" ") : undefined;
}

function truncateReviewDetail(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, Math.max(0, maxChars - 1))}...` : normalized;
}

function compileAuditSection(audit: WorkflowRunDetail["compileAudit"]): WorkflowReviewSection {
  if (!audit) {
    return {
      id: "compile_audit",
      label: "Compile audit",
      value: "Not loaded",
      detail: "Open the latest audit to load prompt modules, selected recipes, policy snippets, and validator ids.",
      tone: "review",
    };
  }
  const failedCount = audit.failedValidatorIds.length;
  const recipeLabel = audit.selectedRecipeIds.length ? `${audit.selectedRecipeIds.length} recipe${audit.selectedRecipeIds.length === 1 ? "" : "s"}` : "no recipes";
  const policyRefCount = workflowCompileAuditRuleIds(audit).length + audit.policyImplicationIds.length;
  const validatorLabel = audit.validatorIds.length ? `${audit.validatorIds.length} validator${audit.validatorIds.length === 1 ? "" : "s"}` : "no validators";
  const prefixLabel =
    audit.stablePrefixModuleCount !== undefined || audit.mutableSuffixModuleCount !== undefined
      ? `${audit.stablePrefixModuleCount ?? 0} stable, ${audit.mutableSuffixModuleCount ?? 0} dynamic`
      : "prefix split unknown";
  return {
    id: "compile_audit",
    label: "Compile audit",
    value: `${audit.promptModuleCount} modules`,
    detail: `${prefixLabel}; ${recipeLabel}; ${policyRefCount} policy ref${policyRefCount === 1 ? "" : "s"}; ${validatorLabel}${failedCount ? `; ${failedCount} failed` : ""}.`,
    tone: failedCount ? "blocked" : audit.validationStatus === "passed" ? "ready" : "review",
  };
}

function sourceSection(detail: WorkflowRunDetail | undefined): WorkflowReviewSection {
  const provenance = detail?.sourceProvenance;
  const label = provenance?.kind === "program_ir_generated" ? "Generated program" : "Source";
  if (detail?.sourceContent) {
    return {
      id: "source",
      label,
      value: `${detail.sourceContent.length.toLocaleString()} chars`,
      detail:
        provenance?.kind === "program_ir_generated"
          ? "Generated from WorkflowProgramIR. It is inspectable for audit, but source edits are disabled."
          : "Legacy source is loaded and inspectable below.",
      tone: "ready",
    };
  }
  if (detail?.sourceReadError) {
    return {
      id: "source",
      label,
      value: "Read error",
      detail: detail.sourceReadError,
      tone: "blocked",
    };
  }
  return {
    id: "source",
    label,
    value: "Not loaded",
    detail: "Open the latest audit to load the generated program for inspection.",
    tone: "review",
  };
}

function discoveryAccessRequestReviewItem(
  questionId: string,
  questionLabel: string,
  request: WorkflowDiscoveryAccessRequest,
): WorkflowDiscoveryContextReviewItem {
  const status = discoveryAccessRequestReviewStatus(request);
  const category = discoveryContextCategory(request.capability);
  const statusLabel = status === "inspected" ? "Inspected" : status === "denied" ? "Denied" : "Withheld";
  return {
    id: request.id,
    questionId,
    questionLabel,
    category,
    categoryLabel: discoveryContextCategoryLabel(category),
    capabilityLabel: formatReviewLabel(request.capability),
    targetLabel: request.targetLabel,
    status,
    statusLabel,
    scopeLabel: discoveryAccessResponseLabel(request.response),
    detail: discoveryAccessDetail(request, status),
    grantId: request.grantId,
  };
}

function discoveryAccessRequestReviewStatus(request: WorkflowDiscoveryAccessRequest): WorkflowDiscoveryContextReviewStatus {
  if (request.status === "allowed") return "inspected";
  if (request.status === "denied") return "denied";
  return "withheld";
}

function discoveryAccessDetail(
  request: WorkflowDiscoveryAccessRequest,
  status: WorkflowDiscoveryContextReviewStatus,
): string {
  if (status === "inspected") {
    if (request.evidence) {
      const itemLabel = `${request.evidence.items.length} item${request.evidence.items.length === 1 ? "" : "s"}`;
      return `${discoveryAccessResponseLabel(request.response)} for workflow discovery. Evidence: ${request.evidence.summary} (${itemLabel}).`;
    }
    return `${discoveryAccessResponseLabel(request.response)} for workflow discovery.`;
  }
  if (status === "denied") return "User denied this context; discovery proceeded without it.";
  return "Access was withheld while discovery continued with redacted policy facts.";
}

function discoveryAccessResponseLabel(response?: WorkflowDiscoveryAccessRequest["response"]): string {
  if (response === "allow_once") return "Allowed once";
  if (response === "always_thread") return "Always allowed for chat thread";
  if (response === "always_workflow") return "Always allowed for workflow";
  if (response === "always_project") return "Always allowed for project";
  if (response === "always_workspace") return "Always allowed for workspace";
  return "Pending";
}

function discoveryContextCategory(capability: WorkflowDiscoveryAccessRequest["capability"]): WorkflowDiscoveryContextReviewCategory {
  if (capability === "file_content" || capability === "file_metadata" || capability === "secret_path_metadata") return "files";
  if (capability === "connector_metadata" || capability === "connector_account_data" || capability === "connector_content") return "connectors";
  if (capability === "plugin_metadata" || capability === "plugin_tool_execute") return "plugins";
  if (capability === "browser_network" || capability === "browser_control" || capability === "browser_profile") return "browser";
  if (capability === "shell_command") return "shell";
  if (capability === "local_file_write" || capability === "remote_mutation") return "mutations";
  return "metadata";
}

function discoveryContextCategoryLabel(category: WorkflowDiscoveryContextReviewCategory): string {
  if (category === "files") return "Files";
  if (category === "connectors") return "Connectors";
  if (category === "plugins") return "Plugins";
  if (category === "browser") return "Browser";
  if (category === "shell") return "Shell";
  if (category === "mutations") return "Mutations";
  return "Metadata";
}

function grantedContentExcerptLabels(summary?: string): string[] {
  const line = summary
    ?.split("\n")
    .map((part) => part.trim())
    .find((part) => part.startsWith("Granted content excerpts:"));
  if (!line) return [];
  return line
    .replace(/^Granted content excerpts:\s*/, "")
    .replace(/\.$/, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function compareDiscoveryContextItems(left: WorkflowDiscoveryContextReviewItem, right: WorkflowDiscoveryContextReviewItem): number {
  const statusOrder: Record<WorkflowDiscoveryContextReviewStatus, number> = { inspected: 0, withheld: 1, denied: 2 };
  return (
    statusOrder[left.status] - statusOrder[right.status] ||
    left.categoryLabel.localeCompare(right.categoryLabel) ||
    left.targetLabel.localeCompare(right.targetLabel)
  );
}

function formatReviewLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function workflowCompileAuditRuleIds(audit: NonNullable<WorkflowRunDetail["compileAudit"]>): string[] {
  return Array.from(new Set(audit.promptModules.flatMap((module) => module.ruleIds)));
}

function formatDuration(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "default";
  if (ms >= 60_000 && ms % 60_000 === 0) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000 && ms % 1_000 === 0) return `${Math.round(ms / 1_000)} sec`;
  return `${Math.round(ms)} ms`;
}
