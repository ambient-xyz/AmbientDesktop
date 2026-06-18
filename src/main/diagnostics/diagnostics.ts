import { existsSync } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { arch, freemem, platform, release, totalmem } from "node:os";
import { basename, join, relative } from "node:path";
import type { AgentMemoryStorageDiagnostics } from "../../shared/agentMemoryDiagnostics";
import type { AgentMemoryStarterStatus } from "../../shared/agentMemoryStarter";
import type { DiagnosticExportActionSummary, DiagnosticExportCallableWorkflowReplayItem, DiagnosticExportCallableWorkflowRestartIssueItem, DiagnosticExportHealthStatus, DiagnosticExportLocalRuntimeEvidence, DiagnosticExportLocalRuntimeSummary, DiagnosticExportSubagentAttributionIssueSummary, DiagnosticExportSubagentAttributionSummary, DiagnosticExportSubagentCompletionGuardSummary, DiagnosticExportSubagentLifecycleSummary, DiagnosticExportSubagentObservabilitySummary, DiagnosticExportSubagentRepairSummary, DiagnosticExportSubagentReplayEvidence, DiagnosticExportSubagentReplayParentMailboxItem, DiagnosticExportSubagentReplaySummary, DiagnosticExportSubagentReplayTimelineItem, DiagnosticExportSummary } from "../../shared/diagnosticTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { AmbientPermissionGrant, PermissionAuditEntry } from "../../shared/permissionTypes";
import type { AmbientPluginAppAuthSummary, AmbientPluginRegistry, CodexHostedMarketplaceReport, CodexPluginCatalog, PiPackageCatalog, PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import type { SubagentParentMailboxEventSummary, SubagentRepairDiagnosticAction, SubagentRepairDiagnosticsReport, SubagentRunEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import type { ChatMessage, ContextUsageSnapshot, ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary, OrchestrationBoard, WorkflowArtifactSummary, WorkflowRunEvent, WorkflowRunSummary } from "../../shared/workflowTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { AppLogEntry } from "./appLogs";
import type { AmbientCliPackageCatalog } from "../ambient-cli/ambientCliPackages";
import type { LocalModelRuntimeStatusSnapshot } from "../local-runtime/localModelRuntimeStatus";
import { isPathInside } from "../session/sessionPaths";
import { redactSensitiveText, redactSensitiveValue } from "../security/secretRedaction";
import type { SubagentObservabilitySummary } from "../subagents/subagentObservability";
import {
  SUBAGENT_CHILD_SCOPED_PARENT_MAILBOX_TYPES,
  validateSubagentParentMailboxEventAttribution,
  validateSubagentRunEventAttribution,
} from "../subagents/subagentInvariants";
import {
  deniedCategoryIdsFromSubagentToolScopeSnapshot,
  deniedCategoryLabelsFromSubagentToolScopeSnapshot,
  deniedToolIdsFromSubagentToolScopeSnapshot,
  deniedToolLabelsFromSubagentToolScopeSnapshot,
} from "../subagents/subagentToolScopeSnapshot";

const MAX_THREADS = 50;
const MAX_MESSAGES_PER_THREAD = 20;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_LOGS = 200;
const MAX_LOG_CHARS = 2_000;
const MAX_SESSION_FILES = 8;
const MAX_SESSION_BYTES = 256 * 1024;
const MAX_SESSION_LINES = 80;
const MAX_SUBAGENT_REPAIR_ISSUES = 50;
const MAX_SUBAGENT_REPAIR_MESSAGE_CHARS = 280;
const MAX_SUBAGENT_REPAIR_AFFECTED_IDS = 100;
const MAX_SUBAGENT_SUMMARY_ERRORS = 5;
const MAX_SUBAGENT_SUMMARY_ACTIONS = 3;
const MAX_SUBAGENT_ATTRIBUTION_ISSUES = 12;
const MAX_SUBAGENT_REPLAY_RUNS = 50;
const MAX_SUBAGENT_REPLAY_CHILD_THREADS = 50;
const MAX_SUBAGENT_REPLAY_RUN_EVENTS = 200;
const MAX_SUBAGENT_REPLAY_RUNTIME_EVENTS = 120;
const MAX_SUBAGENT_REPLAY_PARENT_MAILBOX_EVENTS = 160;
const MAX_SUBAGENT_REPLAY_TRANSCRIPT_MESSAGES = 80;
const MAX_SUBAGENT_REPLAY_CALLABLE_WORKFLOW_TASKS = 120;
const MAX_SUBAGENT_REPLAY_CALLABLE_WORKFLOW_RESTART_ISSUES = 80;
const MAX_SUBAGENT_REPLAY_WORKFLOW_EVENT_TYPES = 20;
const MAX_SUBAGENT_REPLAY_PREVIEW_CHARS = 280;
const MAX_LOCAL_RUNTIME_EVIDENCE_ROWS = 80;
const MAX_LOCAL_RUNTIME_EVIDENCE_IDS = 80;
const MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS = 500;

export interface DiagnosticDataSource {
  getWorkspace(): WorkspaceState;
  listThreads(): ThreadSummary[];
  listMessages(threadId: string): ChatMessage[];
  listPermissionAudit(limit?: number): PermissionAuditEntry[];
  listPermissionGrants?(input?: { includeRevoked?: boolean }): AmbientPermissionGrant[];
  listContextUsageSnapshots?(limit?: number): ContextUsageSnapshot[];
  getContextDiagnostics?(): unknown;
  listOrchestrationBoard(): OrchestrationBoard;
  getPluginDiagnostics?(): DiagnosticPluginState | Promise<DiagnosticPluginState>;
  getLocalModelRuntimeStatus?(): LocalModelRuntimeStatusSnapshot | Promise<LocalModelRuntimeStatusSnapshot>;
  getSubagentRepairDiagnostics?(options?: {
    now?: string;
    maxIssues?: number;
    maxMessageChars?: number;
    maxAffectedIds?: number;
  }): SubagentRepairDiagnosticsReport | undefined;
  getSubagentObservabilitySummary?(options?: {
    createdAt?: string;
  }): SubagentObservabilitySummary | undefined;
  listAllSubagentRuns?(): SubagentRunSummary[];
  listSubagentRunEvents?(runId: string): SubagentRunEventSummary[];
  listSubagentParentMailboxEventsForParentRun?(parentRunId: string): SubagentParentMailboxEventSummary[];
  listCallableWorkflowTasks?(): CallableWorkflowTaskSummary[];
  listWorkflowArtifacts?(): WorkflowArtifactSummary[];
  listWorkflowRuns?(artifactId?: string, limit?: number): WorkflowRunSummary[];
  listWorkflowRunEvents?(runId: string): WorkflowRunEvent[];
  getFeatureFlagSnapshot?(): AmbientFeatureFlagSnapshot;
  getAgentMemoryDiagnostics?(): AgentMemoryStorageDiagnostics | Promise<AgentMemoryStorageDiagnostics>;
  getAgentMemoryStarterStatus?(): AgentMemoryStarterStatus | Promise<AgentMemoryStarterStatus>;
}

export interface DiagnosticBundleOptions {
  appName: string;
  appVersion: string;
  now?: Date;
}

export interface DiagnosticSessionExcerpt {
  path: string;
  sizeBytes: number;
  includedBytes: number;
  truncated: boolean;
  excerpt: string;
  error?: string;
}

export interface DiagnosticPluginState {
  registry?: AmbientPluginRegistry;
  codexCatalog?: CodexPluginCatalog;
  hostedMarketplace?: CodexHostedMarketplaceReport;
  piPackages?: PiPackageCatalog;
  ambientCliPackages?: AmbientCliPackageCatalog;
  appAuth?: AmbientPluginAppAuthSummary[];
  mcpRuntimes?: PluginMcpRuntimeSnapshot[];
  errors: string[];
}

export interface DiagnosticSubagentState {
  repairDiagnostics?: SubagentRepairDiagnosticsReport;
  observability?: SubagentObservabilitySummary;
  attributionAudit?: DiagnosticExportSubagentAttributionSummary;
  replayEvidence?: DiagnosticExportSubagentReplayEvidence;
  errors: string[];
}

export interface DiagnosticLocalRuntimeState {
  status?: LocalModelRuntimeStatusSnapshot;
  evidence?: DiagnosticExportLocalRuntimeEvidence;
  errors: string[];
}

export interface DiagnosticAgentMemoryState {
  diagnostics?: AgentMemoryStorageDiagnostics;
  starterStatus?: AgentMemoryStarterStatus;
  errors: string[];
}

export interface DiagnosticBundle {
  schemaVersion: 1;
  createdAt: string;
  app: {
    name: string;
    version: string;
  };
  summary: DiagnosticExportSummary;
  environment: {
    platform: string;
    release: string;
    arch: string;
    node: string;
    electron?: string;
    chrome?: string;
    ambientApiKeyEnvPresent: boolean;
    ambientBaseUrlEnvPresent: boolean;
    memory: {
      freeBytes: number;
      totalBytes: number;
    };
  };
  workspace: WorkspaceState;
  sqlite: {
    threads: ThreadSummary[];
    messages: ChatMessage[];
    permissionAudit: PermissionAuditEntry[];
    permissionGrants: AmbientPermissionGrant[];
    contextUsage: ContextUsageSnapshot[];
    orchestration: OrchestrationBoard;
  };
  plugins: DiagnosticPluginState;
  subagents: DiagnosticSubagentState;
  localRuntimes: DiagnosticLocalRuntimeState;
  agentMemory: DiagnosticAgentMemoryState;
  context: {
    diagnostics?: unknown;
  };
  sessions: DiagnosticSessionExcerpt[];
  logs: AppLogEntry[];
}

export interface DiagnosticBundlePayload {
  fileName: string;
  bundle: DiagnosticBundle;
}

export function diagnosticBundleFileName(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `ambient-diagnostics-${stamp}.json`;
}

export async function createDiagnosticBundle(
  store: DiagnosticDataSource,
  logs: AppLogEntry[],
  options: DiagnosticBundleOptions,
): Promise<DiagnosticBundlePayload> {
  const now = options.now ?? new Date();
  const workspace = store.getWorkspace();
  const threads = store.listThreads().slice(0, MAX_THREADS);
  const orchestration = store.listOrchestrationBoard();
  const plugins = await readPluginDiagnostics(store);
  const subagents = readSubagentDiagnostics(store, now.toISOString());
  const localRuntimes = await readLocalRuntimeDiagnostics(store);
  const agentMemory = await readAgentMemoryDiagnostics(store);
  const featureFlags = readFeatureFlagDiagnostics(store, now.toISOString());
  const summary = createDiagnosticExportSummary({ featureFlags, subagents, localRuntimes, agentMemory });
  const messages = threads.flatMap((thread) =>
    store
      .listMessages(thread.id)
      .slice(-MAX_MESSAGES_PER_THREAD)
      .map((message) => ({
        ...message,
        content: truncateText(message.content, MAX_MESSAGE_CHARS),
      })),
  );

  const bundle: DiagnosticBundle = {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    app: {
      name: options.appName,
      version: options.appVersion,
    },
    summary,
    environment: {
      platform: platform(),
      release: release(),
      arch: arch(),
      node: process.versions.node,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      ambientApiKeyEnvPresent: Boolean(process.env.AMBIENT_API_KEY),
      ambientBaseUrlEnvPresent: Boolean(process.env.AMBIENT_BASE_URL),
      memory: {
        freeBytes: freemem(),
        totalBytes: totalmem(),
      },
    },
    workspace,
    sqlite: {
      threads,
      messages,
      permissionAudit: store.listPermissionAudit(100),
      permissionGrants: store.listPermissionGrants?.({ includeRevoked: true }) ?? [],
      contextUsage: store.listContextUsageSnapshots?.(100) ?? [],
      orchestration,
    },
    plugins,
    subagents,
    localRuntimes,
    agentMemory,
    context: {
      diagnostics: store.getContextDiagnostics?.(),
    },
    sessions: await readSessionExcerpts(workspace, threads, orchestration),
    logs: logs.slice(-MAX_LOGS).map((entry) => ({
      ...entry,
      message: truncateText(entry.message, MAX_LOG_CHARS),
    })),
  };

  return {
    fileName: diagnosticBundleFileName(now),
    bundle: redactValue(bundle) as DiagnosticBundle,
  };
}

export function createDiagnosticExportSummary(input: {
  featureFlags?: AmbientFeatureFlagSnapshot;
  subagents: DiagnosticSubagentState;
  localRuntimes?: DiagnosticLocalRuntimeState;
  agentMemory?: DiagnosticAgentMemoryState;
}): DiagnosticExportSummary {
  const repairErrors = input.subagents.errors
    .filter((error) => error.startsWith("Sub-agent diagnostics failed:"))
    .slice(0, MAX_SUBAGENT_SUMMARY_ERRORS);
  const observabilityErrors = input.subagents.errors
    .filter((error) => error.startsWith("Sub-agent observability failed:"))
    .slice(0, MAX_SUBAGENT_SUMMARY_ERRORS);
  const attributionErrors = input.subagents.errors
    .filter((error) => error.startsWith("Sub-agent attribution audit failed:"))
    .slice(0, MAX_SUBAGENT_SUMMARY_ERRORS);
  const replayErrors = input.subagents.errors
    .filter((error) => error.startsWith("Sub-agent replay evidence failed:"))
    .slice(0, MAX_SUBAGENT_SUMMARY_ERRORS);
  const localRuntimeErrors = (input.localRuntimes?.errors ?? [])
    .filter((error) => error.startsWith("Local runtime diagnostics failed:"))
    .slice(0, MAX_SUBAGENT_SUMMARY_ERRORS);
  return {
    ...(input.featureFlags ? { featureFlags: input.featureFlags } : {}),
    ...(input.agentMemory?.diagnostics ? { agentMemory: input.agentMemory.diagnostics } : {}),
    ...(input.agentMemory?.starterStatus ? { agentMemoryStarter: input.agentMemory.starterStatus } : {}),
    subagents: {
      repairDiagnostics: createSubagentRepairExportSummary(input.subagents.repairDiagnostics, repairErrors),
      observability: createSubagentObservabilityExportSummary(input.subagents.observability, observabilityErrors),
      attribution: createSubagentAttributionExportSummary(input.subagents.attributionAudit, attributionErrors),
      replayEvidence: createSubagentReplayExportSummary(input.subagents.replayEvidence, replayErrors),
    },
    localRuntimes: createLocalRuntimeExportSummary(input.localRuntimes?.status, localRuntimeErrors),
  };
}

async function readAgentMemoryDiagnostics(store: DiagnosticDataSource): Promise<DiagnosticAgentMemoryState> {
  const errors: string[] = [];
  let diagnostics: AgentMemoryStorageDiagnostics | undefined;
  let starterStatus: AgentMemoryStarterStatus | undefined;
  if (store.getAgentMemoryDiagnostics) {
    try {
      diagnostics = await store.getAgentMemoryDiagnostics();
    } catch (error) {
      errors.push(`Agent memory diagnostics failed: ${errorMessage(error)}`);
    }
  }
  if (store.getAgentMemoryStarterStatus) {
    try {
      starterStatus = await store.getAgentMemoryStarterStatus();
    } catch (error) {
      errors.push(`Agent memory starter status failed: ${errorMessage(error)}`);
    }
  }
  return {
    ...(diagnostics ? { diagnostics } : {}),
    ...(starterStatus ? { starterStatus } : {}),
    errors,
  };
}

function readFeatureFlagDiagnostics(store: DiagnosticDataSource, generatedAt: string): AmbientFeatureFlagSnapshot {
  try {
    return store.getFeatureFlagSnapshot?.() ?? resolveAmbientFeatureFlags({ generatedAt });
  } catch {
    return resolveAmbientFeatureFlags({ generatedAt });
  }
}

function createLocalRuntimeExportSummary(
  status: LocalModelRuntimeStatusSnapshot | undefined,
  errors: string[],
): DiagnosticExportLocalRuntimeSummary {
  if (errors.length > 0) {
    return emptyLocalRuntimeExportSummary({
      status: "error",
      message: `Local runtime diagnostics failed to collect ${errors.length} error${errors.length === 1 ? "" : "s"}.`,
      errorMessages: errors,
    });
  }
  if (!status) {
    return emptyLocalRuntimeExportSummary({
      status: "unavailable",
      message: "Local runtime diagnostics were not available for this bundle.",
    });
  }
  const attentionSignals = [
    status.summary.stopBlockedCount,
    status.summary.restartBlockedCount,
    status.summary.untrackedCount,
    status.summary.staleLeaseCount,
    status.summary.crashedLeaseCount,
    memoryPolicyNeedsAttention(status.summary.memoryPolicyOutcome) ? 1 : 0,
  ].reduce((total, count) => total + count, 0);
  const runtimeLabel = status.summary.runtimeCount === 1 ? "runtime" : "runtimes";
  const leaseLabel = status.summary.activeLeaseCount === 1 ? "active lease" : "active leases";
  const blockerCount = Math.max(status.summary.stopBlockedCount, status.summary.restartBlockedCount);
  const blockerLabel = blockerCount === 1 ? "lifecycle blocker" : "lifecycle blockers";
  const statusLabel: DiagnosticExportHealthStatus = attentionSignals > 0 ? "needs_attention" : "healthy";
  const message = attentionSignals > 0
    ? `Local runtime diagnostics found ${status.summary.runtimeCount} ${runtimeLabel}, ${status.summary.activeLeaseCount} ${leaseLabel}, and ${blockerCount} ${blockerLabel}.`
    : status.summary.runtimeCount > 0
    ? `Local runtime diagnostics found ${status.summary.runtimeCount} ${runtimeLabel} with no support signals.`
    : "Local runtime diagnostics found no runtime inventory rows.";
  return {
    status: statusLabel,
    message,
    runtimeCount: status.summary.runtimeCount,
    runningCount: status.summary.runningCount,
    activeLeaseCount: status.summary.activeLeaseCount,
    stopBlockedCount: status.summary.stopBlockedCount,
    restartBlockedCount: status.summary.restartBlockedCount,
    untrackedCount: status.summary.untrackedCount,
    staleLeaseCount: status.summary.staleLeaseCount,
    releasedLeaseCount: status.summary.releasedLeaseCount,
    crashedLeaseCount: status.summary.crashedLeaseCount,
    activeEstimatedResidentMemoryBytes: status.summary.activeEstimatedResidentMemoryBytes,
    ...(status.summary.activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes: status.summary.activeActualResidentMemoryBytes } : {}),
    memoryPolicyOutcome: status.summary.memoryPolicyOutcome,
    memoryPolicyReason: status.summary.memoryPolicyReason,
    errorMessages: [],
  };
}

function emptyLocalRuntimeExportSummary(input: {
  status: DiagnosticExportHealthStatus;
  message: string;
  errorMessages?: string[];
}): DiagnosticExportLocalRuntimeSummary {
  return {
    status: input.status,
    message: input.message,
    runtimeCount: 0,
    runningCount: 0,
    activeLeaseCount: 0,
    stopBlockedCount: 0,
    restartBlockedCount: 0,
    untrackedCount: 0,
    staleLeaseCount: 0,
    releasedLeaseCount: 0,
    crashedLeaseCount: 0,
    activeEstimatedResidentMemoryBytes: 0,
    errorMessages: input.errorMessages ?? [],
  };
}

function memoryPolicyNeedsAttention(outcome: string | undefined): boolean {
  return outcome === "refuse" || outcome === "unload-idle" || outcome === "ask-to-exceed";
}

function createSubagentRepairExportSummary(
  report: SubagentRepairDiagnosticsReport | undefined,
  errors: string[],
): DiagnosticExportSubagentRepairSummary {
  if (errors.length > 0) {
    return {
      status: "error",
      message: `Sub-agent diagnostics failed to collect ${errors.length} error${errors.length === 1 ? "" : "s"}.`,
      issueCount: report?.issueCount ?? 0,
      shownIssueCount: report?.shownIssueCount ?? 0,
      errorCount: report?.errorCount ?? errors.length,
      warningCount: report?.warningCount ?? 0,
      infoCount: report?.infoCount ?? 0,
      truncatedIssues: report?.truncatedIssues ?? false,
      affectedRunCount: report?.affectedRunIds.length ?? 0,
      affectedThreadCount: report?.affectedThreadIds.length ?? 0,
      affectedBarrierCount: report?.affectedBarrierIds.length ?? 0,
      topActions: report ? diagnosticActionSummaries(report) : [],
      errorMessages: errors,
    };
  }
  if (!report) {
    return {
      status: "unavailable",
      message: "Sub-agent repair diagnostics were not available for this bundle.",
      issueCount: 0,
      shownIssueCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      truncatedIssues: false,
      affectedRunCount: 0,
      affectedThreadCount: 0,
      affectedBarrierCount: 0,
      topActions: [],
      errorMessages: [],
    };
  }
  const issueLabel = report.issueCount === 1 ? "issue" : "issues";
  const status = report.issueCount > 0 ? "needs_attention" : "healthy";
  const message = report.issueCount > 0
    ? `Sub-agent repair diagnostics found ${report.issueCount} ${issueLabel}.`
    : "Sub-agent repair diagnostics found no child-tree issues.";
  return {
    status,
    message,
    issueCount: report.issueCount,
    shownIssueCount: report.shownIssueCount,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    infoCount: report.infoCount,
    truncatedIssues: report.truncatedIssues,
    affectedRunCount: report.affectedRunIds.length,
    affectedThreadCount: report.affectedThreadIds.length,
    affectedBarrierCount: report.affectedBarrierIds.length,
    topActions: diagnosticActionSummaries(report),
    errorMessages: [],
  };
}

function createSubagentObservabilityExportSummary(
  observability: SubagentObservabilitySummary | undefined,
  errors: string[],
): DiagnosticExportSubagentObservabilitySummary {
  if (errors.length > 0) {
    return emptySubagentObservabilityExportSummary({
      status: "error",
      message: `Sub-agent observability failed to collect ${errors.length} error${errors.length === 1 ? "" : "s"}.`,
      errorMessages: errors,
    });
  }
  if (!observability) {
    return emptySubagentObservabilityExportSummary({
      status: "unavailable",
      message: "Sub-agent observability was not available for this bundle.",
    });
  }
  const failureRate = observability.spawnAttempts > 0 ? observability.failedSpawns / observability.spawnAttempts : null;
  const attentionSignals = [
    observability.failedSpawns,
    observability.cancellationCascades,
    observability.childRuntimeAborts,
    observability.toolDenials.count,
    observability.needsAttentionRequests,
    observability.restartReconciliations,
  ].reduce((total, count) => total + count, 0);
  const hasActivity = observability.spawnAttempts > 0 || observability.groupedCompletions > 0 || observability.batchProgress.notificationCount > 0;
  const status = attentionSignals > 0 ? "needs_attention" : "healthy";
  const message = attentionSignals > 0
    ? `Sub-agent observability recorded ${attentionSignals} support signal${attentionSignals === 1 ? "" : "s"}.`
    : hasActivity
    ? "Sub-agent observability recorded activity with no support signals."
    : "Sub-agent observability found no recorded sub-agent activity.";
  return {
    status,
    message,
    spawnAttempts: observability.spawnAttempts,
    failedSpawns: observability.failedSpawns,
    failureRate,
    waitDurationCount: observability.waitDurations.count,
    waitDurationTotalMs: observability.waitDurations.totalMs,
    waitDurationMaxMs: observability.waitDurations.maxMs,
    childIdleOpenRunCount: observability.childIdle.openRunCount,
    childIdleTotalMs: observability.childIdle.totalMs,
    childIdleMaxMs: observability.childIdle.maxMs,
    cancellationCascades: observability.cancellationCascades,
    childRuntimeAborts: observability.childRuntimeAborts,
    toolDenialCount: observability.toolDenials.count,
    groupedCompletions: observability.groupedCompletions,
    needsAttentionRequests: observability.needsAttentionRequests,
    restartReconciliations: observability.restartReconciliations,
    tokenCount: observability.usage.tokenCount,
    costMicros: observability.usage.costMicros,
    ...(typeof observability.localMemory.peakBytes === "number" ? { localMemoryPeakBytes: observability.localMemory.peakBytes } : {}),
    errorMessages: [],
  };
}

function emptySubagentObservabilityExportSummary(input: {
  status: DiagnosticExportHealthStatus;
  message: string;
  errorMessages?: string[];
}): DiagnosticExportSubagentObservabilitySummary {
  return {
    status: input.status,
    message: input.message,
    spawnAttempts: 0,
    failedSpawns: 0,
    failureRate: null,
    waitDurationCount: 0,
    waitDurationTotalMs: 0,
    waitDurationMaxMs: 0,
    childIdleOpenRunCount: 0,
    childIdleTotalMs: 0,
    childIdleMaxMs: 0,
    cancellationCascades: 0,
    childRuntimeAborts: 0,
    toolDenialCount: 0,
    groupedCompletions: 0,
    needsAttentionRequests: 0,
    restartReconciliations: 0,
    tokenCount: 0,
    costMicros: 0,
    errorMessages: input.errorMessages ?? [],
  };
}

function createSubagentAttributionExportSummary(
  attributionAudit: DiagnosticExportSubagentAttributionSummary | undefined,
  errors: string[],
): DiagnosticExportSubagentAttributionSummary {
  if (errors.length > 0) {
    return emptySubagentAttributionExportSummary({
      status: "error",
      message: `Sub-agent attribution audit failed to collect ${errors.length} error${errors.length === 1 ? "" : "s"}.`,
      errorMessages: errors,
    });
  }
  if (!attributionAudit) {
    return emptySubagentAttributionExportSummary({
      status: "unavailable",
      message: "Sub-agent attribution audit was not available for this bundle.",
    });
  }
  return attributionAudit;
}

function emptySubagentAttributionExportSummary(input: {
  status: DiagnosticExportHealthStatus;
  message: string;
  errorMessages?: string[];
}): DiagnosticExportSubagentAttributionSummary {
  return {
    status: input.status,
    message: input.message,
    auditedRuntimeEventCount: 0,
    auditedParentMailboxEventCount: 0,
    issueCount: 0,
    shownIssueCount: 0,
    truncatedIssues: false,
    missingAttributionCount: 0,
    mismatchedRunIdCount: 0,
    issueSamples: [],
    errorMessages: input.errorMessages ?? [],
  };
}

function createSubagentReplayExportSummary(
  replayEvidence: DiagnosticExportSubagentReplayEvidence | undefined,
  errors: string[],
): DiagnosticExportSubagentReplaySummary {
  if (errors.length > 0) {
    return emptySubagentReplayExportSummary({
      status: "error",
      message: `Sub-agent replay evidence failed to collect ${errors.length} error${errors.length === 1 ? "" : "s"}.`,
      errorMessages: errors,
    });
  }
  if (!replayEvidence) {
    return emptySubagentReplayExportSummary({
      status: "unavailable",
      message: "Sub-agent replay evidence was not available for this bundle.",
    });
  }
  const runLabel = replayEvidence.counts.runs === 1 ? "child run" : "child runs";
  const bounded = replayEvidence.truncated ? "bounded " : "";
  const message = replayEvidence.counts.runs > 0
    ? `Sub-agent replay evidence captured ${bounded}timelines for ${replayEvidence.counts.runs} ${runLabel}.`
    : "Sub-agent replay evidence found no persisted child runs.";
  return {
    status: "healthy",
    message,
    runCount: replayEvidence.counts.runs,
    childThreadCount: replayEvidence.counts.childThreads,
    persistedRunEventCount: replayEvidence.counts.persistedRunEvents,
    runtimeEventCount: replayEvidence.counts.runtimeEvents,
    parentMailboxEventCount: replayEvidence.counts.parentMailboxEvents,
    transcriptMessageCount: replayEvidence.counts.transcriptMessages,
    callableWorkflowTaskCount: replayEvidence.counts.callableWorkflowTasks,
    truncated: replayEvidence.truncated,
    errorMessages: [],
  };
}

function emptySubagentReplayExportSummary(input: {
  status: DiagnosticExportHealthStatus;
  message: string;
  errorMessages?: string[];
}): DiagnosticExportSubagentReplaySummary {
  return {
    status: input.status,
    message: input.message,
    runCount: 0,
    childThreadCount: 0,
    persistedRunEventCount: 0,
    runtimeEventCount: 0,
    parentMailboxEventCount: 0,
    transcriptMessageCount: 0,
    callableWorkflowTaskCount: 0,
    truncated: false,
    errorMessages: input.errorMessages ?? [],
  };
}

function diagnosticActionSummaries(report: SubagentRepairDiagnosticsReport): DiagnosticExportActionSummary[] {
  return (Object.entries(report.actionCounts) as Array<[SubagentRepairDiagnosticAction, number | undefined]>)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .sort(([leftAction, leftCount], [rightAction, rightCount]) =>
      (rightCount ?? 0) - (leftCount ?? 0) || leftAction.localeCompare(rightAction)
    )
    .slice(0, MAX_SUBAGENT_SUMMARY_ACTIONS)
    .map(([action, count]) => ({
      action,
      label: subagentRepairDiagnosticActionLabel(action),
      count: count ?? 0,
    }));
}

function subagentRepairDiagnosticActionLabel(action: SubagentRepairDiagnosticAction): string {
  switch (action) {
    case "auto_reconcile_restart":
      return "Run startup reconciliation";
    case "repair_spawn_edge":
      return "Repair spawn edge";
    case "inspect_child_thread":
      return "Inspect child thread linkage";
    case "inspect_lifecycle_events":
      return "Inspect lifecycle event history";
    case "inspect_run_snapshot":
      return "Inspect run snapshot";
    case "inspect_result_artifact":
      return "Inspect result artifact";
    case "manual_repair_required":
      return "Manual repair required";
  }
}

function readSubagentDiagnostics(store: DiagnosticDataSource, now: string): DiagnosticSubagentState {
  const errors: string[] = [];
  let repairDiagnostics: SubagentRepairDiagnosticsReport | undefined;
  let observability: SubagentObservabilitySummary | undefined;
  let attributionAudit: DiagnosticExportSubagentAttributionSummary | undefined;
  let replayEvidence: DiagnosticExportSubagentReplayEvidence | undefined;

  try {
    repairDiagnostics = store.getSubagentRepairDiagnostics?.({
      now,
      maxIssues: MAX_SUBAGENT_REPAIR_ISSUES,
      maxMessageChars: MAX_SUBAGENT_REPAIR_MESSAGE_CHARS,
      maxAffectedIds: MAX_SUBAGENT_REPAIR_AFFECTED_IDS,
    });
  } catch (error) {
    errors.push(`Sub-agent diagnostics failed: ${errorMessage(error)}`);
  }

  try {
    observability = store.getSubagentObservabilitySummary?.({ createdAt: now });
  } catch (error) {
    errors.push(`Sub-agent observability failed: ${errorMessage(error)}`);
  }

  try {
    attributionAudit = createSubagentAttributionAudit(store);
  } catch (error) {
    errors.push(`Sub-agent attribution audit failed: ${errorMessage(error)}`);
  }

  try {
    replayEvidence = createSubagentDiagnosticReplayEvidence(store, {
      createdAt: now,
      repairDiagnostics,
    });
  } catch (error) {
    errors.push(`Sub-agent replay evidence failed: ${errorMessage(error)}`);
  }

  return {
    ...(repairDiagnostics ? { repairDiagnostics } : {}),
    ...(observability ? { observability } : {}),
    ...(attributionAudit ? { attributionAudit } : {}),
    ...(replayEvidence ? { replayEvidence } : {}),
    errors,
  };
}

async function readLocalRuntimeDiagnostics(store: DiagnosticDataSource): Promise<DiagnosticLocalRuntimeState> {
  const errors: string[] = [];
  let status: LocalModelRuntimeStatusSnapshot | undefined;
  try {
    status = await store.getLocalModelRuntimeStatus?.();
  } catch (error) {
    errors.push(`Local runtime diagnostics failed: ${errorMessage(error)}`);
  }
  return {
    ...(status ? { status } : {}),
    ...(status ? { evidence: createLocalRuntimeDiagnosticEvidence(status) } : {}),
    errors,
  };
}

function createLocalRuntimeDiagnosticEvidence(
  status: LocalModelRuntimeStatusSnapshot,
): DiagnosticExportLocalRuntimeEvidence {
  const runtimeRows = status.inventory.entries;
  const activeOwners = status.policyHandoff.activeOwners;
  const blockedActions = status.policyHandoff.blockedActions;
  const nextSafeActions = status.policyHandoff.nextSafeActions;
  const shownRuntimeRows = runtimeRows.slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS);
  const shownActiveOwners = activeOwners.slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS);
  const shownBlockedActions = blockedActions.slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS);
  const shownNextSafeActions = nextSafeActions.slice(0, MAX_LOCAL_RUNTIME_EVIDENCE_ROWS);
  return {
    schemaVersion: "ambient-local-runtime-diagnostic-evidence-v1",
    source: "diagnostic_export",
    capturedAt: status.capturedAt,
    truncated:
      runtimeRows.length > shownRuntimeRows.length ||
      activeOwners.length > shownActiveOwners.length ||
      blockedActions.length > shownBlockedActions.length ||
      nextSafeActions.length > shownNextSafeActions.length,
    counts: {
      runtimes: runtimeRows.length,
      activeOwners: activeOwners.length,
      blockedActions: blockedActions.length,
      nextSafeActions: nextSafeActions.length,
    },
    shownCounts: {
      runtimes: shownRuntimeRows.length,
      activeOwners: shownActiveOwners.length,
      blockedActions: shownBlockedActions.length,
      nextSafeActions: shownNextSafeActions.length,
    },
    runtimes: shownRuntimeRows.map((entry, index) => ({
      sequence: index + 1,
      runtimeEntryId: entry.id,
      capability: entry.capability,
      trackingStatus: entry.trackingStatus,
      running: entry.running,
      ...(entry.providerId ? { providerId: entry.providerId } : {}),
      ...(entry.modelRuntimeId ? { modelRuntimeId: entry.modelRuntimeId } : {}),
      ...(entry.modelProfileId ? { modelProfileId: entry.modelProfileId } : {}),
      ...(entry.modelId ? { modelId: entry.modelId } : {}),
      ...(entry.pid !== undefined ? { pid: entry.pid } : {}),
      ...(entry.endpoint ? { endpoint: truncateText(entry.endpoint, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS) } : {}),
      ...(entry.estimatedResidentMemoryBytes !== undefined
        ? { estimatedResidentMemoryBytes: entry.estimatedResidentMemoryBytes }
        : {}),
      ...(entry.actualResidentMemoryBytes !== undefined
        ? { actualResidentMemoryBytes: entry.actualResidentMemoryBytes }
        : {}),
      ...(entry.memorySampledAt ? { memorySampledAt: entry.memorySampledAt } : {}),
      ownerLabels: boundedDiagnosticStrings(entry.owners.map((owner) => owner.displayName), MAX_LOCAL_RUNTIME_EVIDENCE_IDS),
      activeLeaseIds: boundedDiagnosticStrings(entry.leaseState.activeLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS),
      staleLeaseIds: boundedDiagnosticStrings(entry.leaseState.staleLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS),
      releasedLeaseIds: boundedDiagnosticStrings(entry.leaseState.releasedLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS),
      crashedLeaseIds: boundedDiagnosticStrings(entry.leaseState.crashedLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS),
      ordinaryStopAllowed: entry.lifecycleDecision.stop.allowed,
      ordinaryRestartAllowed: entry.lifecycleDecision.restart.allowed,
      stopReason: truncateText(entry.lifecycleDecision.stop.reason, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS),
      restartReason: truncateText(entry.lifecycleDecision.restart.reason, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS),
      forceStopAllowed: entry.lifecycleDecision.stop.forceAllowed,
      forceRestartAllowed: entry.lifecycleDecision.restart.forceAllowed,
      forceStopRequiresSubagentCancellation: entry.lifecycleDecision.stop.forceRequiresSubagentCancellation,
      forceRestartRequiresSubagentCancellation: entry.lifecycleDecision.restart.forceRequiresSubagentCancellation,
      untracked: entry.lifecycleDecision.stop.untracked || entry.lifecycleDecision.restart.untracked,
    })),
    activeOwners: shownActiveOwners.map((owner, index) => ({
      sequence: index + 1,
      runtimeEntryId: owner.runtimeEntryId,
      leaseId: owner.leaseId,
      displayName: truncateText(owner.displayName, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS),
      status: owner.status,
      ...(owner.parentThreadId ? { parentThreadId: owner.parentThreadId } : {}),
      ...(owner.subagentThreadId ? { subagentThreadId: owner.subagentThreadId } : {}),
      ...(owner.subagentRunId ? { subagentRunId: owner.subagentRunId } : {}),
      capabilityKind: owner.capabilityKind,
      ...(owner.providerId ? { providerId: owner.providerId } : {}),
      ...(owner.modelRuntimeId ? { modelRuntimeId: owner.modelRuntimeId } : {}),
      ...(owner.modelProfileId ? { modelProfileId: owner.modelProfileId } : {}),
      ...(owner.modelId ? { modelId: owner.modelId } : {}),
      ...(owner.estimatedResidentMemoryBytes !== undefined
        ? { estimatedResidentMemoryBytes: owner.estimatedResidentMemoryBytes }
        : {}),
      ...(owner.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: owner.actualResidentMemoryBytes } : {}),
      ...(owner.pid !== undefined ? { pid: owner.pid } : {}),
      ...(owner.endpoint ? { endpoint: truncateText(owner.endpoint, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS) } : {}),
      acquiredAt: owner.acquiredAt,
      lastHeartbeatAt: owner.lastHeartbeatAt,
    })),
    blockedActions: shownBlockedActions.map((action, index) => ({
      sequence: index + 1,
      runtimeEntryId: action.runtimeEntryId,
      action: action.action,
      reason: truncateText(action.reason, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS),
      blockerLeaseIds: boundedDiagnosticStrings(action.blockerLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS),
      affectedSubagentLabels: boundedDiagnosticStrings(
        action.affectedSubagents.map(diagnosticLocalRuntimeAffectedSubagentLabel),
        MAX_LOCAL_RUNTIME_EVIDENCE_IDS,
      ),
      affectedSubagentThreadIds: boundedDiagnosticStrings(
        action.affectedSubagents.map((subagent) => subagent.subagentThreadId),
        MAX_LOCAL_RUNTIME_EVIDENCE_IDS,
      ),
      forceAllowed: action.forceAllowed,
      forceRequiresSubagentCancellation: action.forceRequiresSubagentCancellation,
      untracked: action.untracked,
    })),
    nextSafeActions: shownNextSafeActions.map((action, index) => ({
      sequence: index + 1,
      action: action.action,
      safety: action.safety,
      reason: truncateText(action.reason, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS),
      ...(action.runtimeEntryId ? { runtimeEntryId: action.runtimeEntryId } : {}),
      ...(action.runtimeId ? { runtimeId: action.runtimeId } : {}),
      ...(action.capability ? { capability: action.capability } : {}),
      ...(action.toolName ? { toolName: action.toolName } : {}),
      ...(action.blockerLeaseIds?.length
        ? { blockerLeaseIds: boundedDiagnosticStrings(action.blockerLeaseIds, MAX_LOCAL_RUNTIME_EVIDENCE_IDS) }
        : {}),
      ...(action.affectedSubagents?.length
        ? {
            affectedSubagentLabels: boundedDiagnosticStrings(
              action.affectedSubagents.map(diagnosticLocalRuntimeAffectedSubagentLabel),
              MAX_LOCAL_RUNTIME_EVIDENCE_IDS,
            ),
          }
        : {}),
      ...(action.ownershipResolution
        ? {
            ownershipResolution: {
              lifecycleAction: action.ownershipResolution.lifecycleAction,
              resolution: action.ownershipResolution.resolution,
              requiresInventoryRefresh: action.ownershipResolution.requiresInventoryRefresh,
              reason: truncateText(action.ownershipResolution.reason, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS),
              blockerLeaseIds: boundedDiagnosticStrings(
                action.ownershipResolution.blockerLeaseIds,
                MAX_LOCAL_RUNTIME_EVIDENCE_IDS,
              ),
              affectedSubagentLabels: boundedDiagnosticStrings(
                action.ownershipResolution.affectedSubagents.map(diagnosticLocalRuntimeAffectedSubagentLabel),
                MAX_LOCAL_RUNTIME_EVIDENCE_IDS,
              ),
            },
          }
        : {}),
      ...(action.untracked !== undefined ? { untracked: action.untracked } : {}),
    })),
    memoryEvidence: {
      ...status.policyHandoff.memoryEvidence,
      uncertaintyReasons: boundedDiagnosticStrings(
        status.policyHandoff.memoryEvidence.uncertaintyReasons,
        MAX_LOCAL_RUNTIME_EVIDENCE_IDS,
      ),
    },
  };
}

function diagnosticLocalRuntimeAffectedSubagentLabel(
  subagent: LocalModelRuntimeStatusSnapshot["policyHandoff"]["blockedActions"][number]["affectedSubagents"][number],
): string {
  const handle = subagent.subagentRunId
    ? `run ${subagent.subagentRunId}, thread ${subagent.subagentThreadId}, lease ${subagent.leaseId}`
    : `thread ${subagent.subagentThreadId}, lease ${subagent.leaseId}`;
  return truncateText(`${subagent.displayName} (${handle})`, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS);
}

function boundedDiagnosticStrings(values: string[], limit: number): string[] {
  return values.slice(0, Math.max(0, limit)).map((value) =>
    truncateText(value, MAX_LOCAL_RUNTIME_EVIDENCE_TEXT_CHARS)
  );
}

function createSubagentDiagnosticReplayEvidence(store: DiagnosticDataSource, input: {
  createdAt: string;
  repairDiagnostics?: SubagentRepairDiagnosticsReport;
}): DiagnosticExportSubagentReplayEvidence | undefined {
  if (!store.listAllSubagentRuns || !store.listSubagentRunEvents) return undefined;

  const runs = store.listAllSubagentRuns();
  const shownRuns = runs.slice(0, MAX_SUBAGENT_REPLAY_RUNS);
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const childThreads = store.listThreads()
    .filter((thread) => thread.kind === "subagent_child")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const shownChildThreads = childThreads.slice(0, MAX_SUBAGENT_REPLAY_CHILD_THREADS);
  const runEvents = shownRuns
    .flatMap((run) => store.listSubagentRunEvents!(run.id).map((event) => ({ run, event })))
    .sort((left, right) =>
      left.event.createdAt.localeCompare(right.event.createdAt) ||
      left.run.id.localeCompare(right.run.id) ||
      left.event.sequence - right.event.sequence
    );
  const runtimeEvents = runEvents.filter(({ event }) => event.type === "subagent.runtime_event");
  const shownRunEvents = runEvents.slice(0, MAX_SUBAGENT_REPLAY_RUN_EVENTS);
  const shownRuntimeEvents = runtimeEvents.slice(0, MAX_SUBAGENT_REPLAY_RUNTIME_EVENTS);
  const parentMailboxEvents = [...new Set(runs.map((run) => run.parentRunId))]
    .flatMap((parentRunId) =>
      store.listSubagentParentMailboxEventsForParentRun?.(parentRunId).map((event) => ({ parentRunId, event })) ?? []
    )
    .sort((left, right) =>
      left.event.createdAt.localeCompare(right.event.createdAt) ||
      left.parentRunId.localeCompare(right.parentRunId) ||
      left.event.id.localeCompare(right.event.id)
    );
  const shownParentMailboxEvents = parentMailboxEvents.slice(0, MAX_SUBAGENT_REPLAY_PARENT_MAILBOX_EVENTS);
  const callableWorkflowTasks = (store.listCallableWorkflowTasks?.() ?? [])
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const shownCallableWorkflowTasks = callableWorkflowTasks.slice(0, MAX_SUBAGENT_REPLAY_CALLABLE_WORKFLOW_TASKS);
  const callableWorkflowTaskRestartIssues = input.repairDiagnostics?.callableWorkflowTasks?.issues ?? [];
  const shownCallableWorkflowTaskRestartIssues = callableWorkflowTaskRestartIssues
    .slice(0, MAX_SUBAGENT_REPLAY_CALLABLE_WORKFLOW_RESTART_ISSUES);
  const workflowArtifactsById = new Map((store.listWorkflowArtifacts?.() ?? []).map((artifact) => [artifact.id, artifact]));
  const workflowRunsById = new Map((store.listWorkflowRuns?.(undefined, 200) ?? []).map((run) => [run.id, run]));
  const transcriptMessages = shownChildThreads
    .flatMap((thread) => store.listMessages(thread.id).map((message) => ({ thread, message })))
    .sort((left, right) =>
      left.message.createdAt.localeCompare(right.message.createdAt) ||
      left.thread.id.localeCompare(right.thread.id) ||
      left.message.id.localeCompare(right.message.id)
    );
  const shownTranscriptMessages = transcriptMessages.slice(0, MAX_SUBAGENT_REPLAY_TRANSCRIPT_MESSAGES);
  const truncated =
    runs.length > shownRuns.length ||
    childThreads.length > shownChildThreads.length ||
    runEvents.length > shownRunEvents.length ||
    runtimeEvents.length > shownRuntimeEvents.length ||
    parentMailboxEvents.length > shownParentMailboxEvents.length ||
    callableWorkflowTasks.length > shownCallableWorkflowTasks.length ||
    callableWorkflowTaskRestartIssues.length > shownCallableWorkflowTaskRestartIssues.length ||
    transcriptMessages.length > shownTranscriptMessages.length;

  return {
    schemaVersion: "ambient-subagent-replay-evidence-v1",
    source: "diagnostic_export",
    createdAt: input.createdAt,
    liveTokens: false,
    truncated,
    counts: {
      runs: runs.length,
      childThreads: childThreads.length,
      persistedRunEvents: runEvents.length,
      runtimeEvents: runtimeEvents.length,
      parentMailboxEvents: parentMailboxEvents.length,
      transcriptMessages: transcriptMessages.length,
      callableWorkflowTasks: callableWorkflowTasks.length,
    },
    shownCounts: {
      runs: shownRuns.length,
      childThreads: shownChildThreads.length,
      persistedRunEvents: shownRunEvents.length,
      runtimeEvents: shownRuntimeEvents.length,
      parentMailboxEvents: shownParentMailboxEvents.length,
      transcriptMessages: shownTranscriptMessages.length,
      callableWorkflowTasks: shownCallableWorkflowTasks.length,
    },
    childThreads: shownChildThreads.map((thread) => ({
      threadId: thread.id,
      runId: thread.subagentRunId,
      parentThreadId: thread.parentThreadId,
      parentRunId: thread.parentRunId,
      canonicalTaskPath: thread.canonicalTaskPath,
      collapsedByDefault: thread.collapsedByDefault,
      status: thread.childStatus,
    })),
    runtimeEventTimeline: shownRuntimeEvents.map(({ run, event }, index) =>
      diagnosticReplayRuntimeTimelineItem(run, event, index + 1)
    ),
    persistedRunEventTimeline: shownRunEvents.map(({ run, event }, index) =>
      diagnosticReplayPersistedTimelineItem(run, event, index + 1)
    ),
    parentMailboxTimeline: shownParentMailboxEvents.map(({ event }, index) =>
      diagnosticReplayParentMailboxTimelineItem(event, index + 1)
    ),
    callableWorkflowTaskTimeline: shownCallableWorkflowTasks.map((task, index) =>
      diagnosticReplayCallableWorkflowTaskTimelineItem({
        task,
        sequence: index + 1,
        workflowArtifact: task.workflowArtifactId ? workflowArtifactsById.get(task.workflowArtifactId) : undefined,
        workflowRun: task.workflowRunId ? workflowRunsById.get(task.workflowRunId) : undefined,
        workflowRunEvents: task.workflowRunId ? (store.listWorkflowRunEvents?.(task.workflowRunId) ?? []) : [],
      })
    ),
    transcriptTimeline: shownTranscriptMessages.map(({ message }, index) => {
      const metadata = objectValue(message.metadata);
      return {
        sequence: index + 1,
        createdAt: message.createdAt,
        threadId: message.threadId,
        role: message.role,
        childRunId: stringValue(metadata.childRunId),
        childThreadId: stringValue(metadata.childThreadId),
        contentPreview: truncateText(message.content, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS),
      };
    }),
    restartRepair: {
      observedIssueKinds: input.repairDiagnostics?.issues.map((issue) => issue.kind) ?? [],
      repairedRunIds: input.repairDiagnostics?.repairedRunIds ?? [],
      repairedBarrierIds: input.repairDiagnostics?.repairedBarrierIds ?? [],
      repairedParentControlBarrierIds: input.repairDiagnostics?.repairedParentControlBarrierIds ?? [],
      repairableSpawnEdgeRunIds: input.repairDiagnostics?.repairedSpawnEdgeRunIds ?? [],
      danglingSpawnEdgeRunIds: input.repairDiagnostics?.prunedDanglingSpawnEdgeRunIds ?? [],
      diagnosticRunIds: input.repairDiagnostics?.diagnosticRunIds ?? [],
      callableWorkflowTaskIssues: shownCallableWorkflowTaskRestartIssues.map((issue, index) =>
        diagnosticReplayCallableWorkflowRestartIssueItem(issue, index + 1)
      ),
    },
  };
}

function diagnosticReplayCallableWorkflowRestartIssueItem(
  issue: NonNullable<SubagentRepairDiagnosticsReport["callableWorkflowTasks"]>["issues"][number],
  sequence: number,
): DiagnosticExportCallableWorkflowRestartIssueItem {
  return {
    sequence,
    issueId: issue.issueId,
    kind: issue.kind,
    severity: issue.severity,
    messagePreview: truncateText(issue.messagePreview, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS),
    taskId: issue.taskId,
    ...(issue.taskStatus ? { taskStatus: issue.taskStatus } : {}),
    ...(issue.taskStatusLabel ? { taskStatusLabel: issue.taskStatusLabel } : {}),
    ...(issue.blocking !== undefined ? { blocking: issue.blocking } : {}),
    ...(issue.runnerDeferredReason ? { runnerDeferredReason: issue.runnerDeferredReason } : {}),
    parentThreadId: issue.parentThreadId,
    parentRunId: issue.parentRunId,
    ...(issue.workflowArtifactId ? { workflowArtifactId: issue.workflowArtifactId } : {}),
    ...(issue.workflowRunId ? { workflowRunId: issue.workflowRunId } : {}),
    ...(issue.callerKind ? { callerKind: issue.callerKind } : {}),
    ...(issue.callerThreadId ? { callerThreadId: issue.callerThreadId } : {}),
    ...(issue.callerRunId ? { callerRunId: issue.callerRunId } : {}),
    ...(issue.childThreadId ? { childThreadId: issue.childThreadId } : {}),
    ...(issue.childRunId ? { childRunId: issue.childRunId } : {}),
    ...(issue.subagentRunId ? { subagentRunId: issue.subagentRunId } : {}),
    ...(issue.canonicalTaskPath ? { canonicalTaskPath: issue.canonicalTaskPath } : {}),
    ...(issue.childParentThreadId ? { childParentThreadId: issue.childParentThreadId } : {}),
    ...(issue.childParentRunId ? { childParentRunId: issue.childParentRunId } : {}),
    ...(issue.approvalSource ? { approvalSource: issue.approvalSource } : {}),
    ...(issue.approvalScope ? { approvalScope: issue.approvalScope } : {}),
    ...(issue.worktreeRequired !== undefined ? { worktreeRequired: issue.worktreeRequired } : {}),
    ...(issue.worktreeIsolated !== undefined ? { worktreeIsolated: issue.worktreeIsolated } : {}),
    ...(issue.worktreeStatus ? { worktreeStatus: issue.worktreeStatus } : {}),
    ...(issue.nestedFanoutRequired !== undefined ? { nestedFanoutRequired: issue.nestedFanoutRequired } : {}),
    ...(issue.nestedFanoutSource ? { nestedFanoutSource: issue.nestedFanoutSource } : {}),
  };
}

function diagnosticReplayCallableWorkflowTaskTimelineItem(input: {
  task: CallableWorkflowTaskSummary;
  sequence: number;
  workflowArtifact?: WorkflowArtifactSummary;
  workflowRun?: WorkflowRunSummary;
  workflowRunEvents: WorkflowRunEvent[];
}): DiagnosticExportCallableWorkflowReplayItem {
  const caller = objectValue(objectValue(input.task.executionPlan).callerProvenance);
  const approval = objectValue(caller.approval);
  const worktree = objectValue(caller.worktree);
  const nestedFanout = objectValue(caller.nestedFanout);
  const workflowRunEventTypes = [...new Set(input.workflowRunEvents.map((event) => event.type))]
    .slice(0, MAX_SUBAGENT_REPLAY_WORKFLOW_EVENT_TYPES);
  const artifactLinkState = !input.task.workflowArtifactId
    ? "not_linked"
    : input.workflowArtifact
    ? "linked"
    : "missing";
  const runLinkState = !input.task.workflowRunId
    ? "not_linked"
    : !input.workflowRun
    ? "missing"
    : input.task.workflowArtifactId && input.workflowRun.artifactId !== input.task.workflowArtifactId
    ? "artifact_mismatch"
    : "linked";
  return {
    sequence: input.sequence,
    taskId: input.task.id,
    launchId: input.task.launchId,
    createdAt: input.task.createdAt,
    updatedAt: input.task.updatedAt,
    parentThreadId: input.task.parentThreadId,
    parentRunId: input.task.parentRunId,
    ...(input.task.parentMessageId ? { parentMessageId: input.task.parentMessageId } : {}),
    toolName: input.task.toolName,
    sourceKind: input.task.sourceKind,
    title: input.task.title,
    status: input.task.status,
    statusLabel: input.task.statusLabel,
    blocking: input.task.blocking,
    runnerDeferredReason: input.task.runnerDeferredReason,
    ...(input.task.workflowThreadId ?? input.workflowArtifact?.workflowThreadId
      ? { workflowThreadId: input.task.workflowThreadId ?? input.workflowArtifact?.workflowThreadId }
      : {}),
    ...(input.task.workflowArtifactId ? { workflowArtifactId: input.task.workflowArtifactId } : {}),
    ...(input.workflowArtifact?.title ? { workflowArtifactTitle: input.workflowArtifact.title } : {}),
    ...(input.workflowArtifact?.status ? { workflowArtifactStatus: input.workflowArtifact.status } : {}),
    ...(input.workflowArtifact?.sourcePath ? { workflowArtifactSourcePath: input.workflowArtifact.sourcePath } : {}),
    ...(input.workflowArtifact?.statePath ? { workflowArtifactStatePath: input.workflowArtifact.statePath } : {}),
    ...(input.workflowArtifact?.manifest?.mutationPolicy
      ? { workflowArtifactMutationPolicy: input.workflowArtifact.manifest.mutationPolicy }
      : {}),
    ...(input.task.workflowRunId ? { workflowRunId: input.task.workflowRunId } : {}),
    ...(input.workflowRun?.status ? { workflowRunStatus: input.workflowRun.status } : {}),
    workflowRunEventTypes,
    artifactLinkState,
    runLinkState,
    ...(stringValue(caller.kind) ? { callerKind: stringValue(caller.kind)! } : {}),
    ...(stringValue(caller.threadId) ? { childThreadId: stringValue(caller.threadId)! } : {}),
    ...(stringValue(caller.runId) ? { childRunId: stringValue(caller.runId)! } : {}),
    ...(stringValue(caller.subagentRunId) ? { subagentRunId: stringValue(caller.subagentRunId)! } : {}),
    ...(stringValue(caller.canonicalTaskPath) ? { canonicalTaskPath: stringValue(caller.canonicalTaskPath)! } : {}),
    ...(stringValue(approval.source) ? { approvalSource: stringValue(approval.source)! } : {}),
    ...(stringValue(approval.scopeHint) ? { approvalScope: stringValue(approval.scopeHint)! } : {}),
    ...(booleanValue(worktree.isolated) !== undefined ? { worktreeIsolated: booleanValue(worktree.isolated)! } : {}),
    ...(stringValue(worktree.status) ? { worktreeStatus: stringValue(worktree.status)! } : {}),
    ...(stringValue(nestedFanout.source) ? { nestedFanoutSource: stringValue(nestedFanout.source)! } : {}),
    ...(input.task.progressSnapshot?.lastEventType ? { lastEventType: input.task.progressSnapshot.lastEventType } : {}),
    ...(input.task.progressSnapshot?.lastEventMessage ? { lastEventMessage: truncateText(input.task.progressSnapshot.lastEventMessage, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS) } : {}),
    ...(input.task.usageSnapshot?.tokenCount !== undefined ? { tokenCount: input.task.usageSnapshot.tokenCount } : {}),
    ...(input.task.usageSnapshot?.costMicros !== undefined ? { costMicros: input.task.usageSnapshot.costMicros } : {}),
  };
}

function diagnosticReplayParentMailboxTimelineItem(
  event: SubagentParentMailboxEventSummary,
  sequence: number,
): DiagnosticExportSubagentReplayParentMailboxItem {
  const payloadPreview = parentMailboxPayloadPreview(event);
  const payload = objectValue(event.payload);
  const toolScopeSnapshot = objectValue(payload.toolScopeSnapshot);
  const deniedCategoryIds = deniedCategoryIdsFromSubagentToolScopeSnapshot(toolScopeSnapshot);
  const deniedToolIds = deniedToolIdsFromSubagentToolScopeSnapshot(toolScopeSnapshot);
  const deniedCategoryLabels = deniedCategoryLabelsFromSubagentToolScopeSnapshot(toolScopeSnapshot);
  const deniedToolLabels = deniedToolLabelsFromSubagentToolScopeSnapshot(toolScopeSnapshot);
  const failureStage = stringValue(payload.failureStage);
  const approvalMode = stringValue(payload.approvalMode);
  const approvalUnavailable = booleanValue(payload.approvalUnavailable);
  const completionGuardSummary = diagnosticReplayCompletionGuardSummary(payload);
  const lifecycleSummary = diagnosticReplayLifecycleSummary(event.type, payload);
  const childRunIds = childRunIdsFromParentMailboxPayload(event.payload);
  const childThreadIds = childThreadIdsFromParentMailboxPayload(event.payload);
  const canonicalTaskPaths = canonicalTaskPathsFromParentMailboxPayload(event.payload);
  const childSourceLabels = childSourceLabelsFromParentMailboxPayload(event.payload);
  return {
    sequence,
    id: event.id,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    parentThreadId: event.parentThreadId,
    parentRunId: event.parentRunId,
    ...(event.parentMessageId ? { parentMessageId: event.parentMessageId } : {}),
    type: event.type,
    deliveryState: event.deliveryState,
    childRunIds,
    ...(childThreadIds.length ? { childThreadIds } : {}),
    ...(canonicalTaskPaths.length ? { canonicalTaskPaths } : {}),
    ...(childSourceLabels.length ? { childSourceLabels } : {}),
    ...(event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : {}),
    ...(payloadPreview ? { payloadPreview } : {}),
    ...(failureStage ? { failureStage } : {}),
    ...(approvalMode ? { approvalMode } : {}),
    ...(approvalUnavailable !== undefined ? { approvalUnavailable } : {}),
    ...(deniedCategoryIds.length ? { deniedCategoryIds } : {}),
    ...(deniedToolIds.length ? { deniedToolIds } : {}),
    ...(deniedCategoryLabels.length ? { deniedCategoryLabels } : {}),
    ...(deniedToolLabels.length ? { deniedToolLabels } : {}),
    ...(completionGuardSummary ? { completionGuardSummary } : {}),
    ...(lifecycleSummary ? { lifecycleSummary } : {}),
  };
}

function diagnosticReplayCompletionGuardSummary(
  payload: Record<string, unknown>,
): DiagnosticExportSubagentCompletionGuardSummary | undefined {
  const resultValidation = objectValue(payload.resultValidation);
  const completionGuard = objectValue(resultValidation.completionGuardValidation);
  const valid = booleanValue(completionGuard.valid);
  const synthesisAllowed = booleanValue(completionGuard.synthesisAllowed);
  const required = booleanValue(completionGuard.required);
  const structuredEvidenceCount = nonNegativeNumberValue(completionGuard.structuredEvidenceCount);
  const ambientEvidenceCount = nonNegativeNumberValue(completionGuard.ambientEvidenceCount);
  const isolatedWorktreeEvidenceCount = nonNegativeNumberValue(completionGuard.isolatedWorktreeEvidenceCount);
  const approvalEvidenceCount = nonNegativeNumberValue(completionGuard.approvalEvidenceCount);
  const reason = stringValue(completionGuard.reason);
  const summary: DiagnosticExportSubagentCompletionGuardSummary = {
    ...(valid !== undefined ? { valid } : {}),
    ...(synthesisAllowed !== undefined ? { synthesisAllowed } : {}),
    ...(required !== undefined ? { required } : {}),
    ...(structuredEvidenceCount !== undefined ? { structuredEvidenceCount } : {}),
    ...(ambientEvidenceCount !== undefined ? { ambientEvidenceCount } : {}),
    ...(isolatedWorktreeEvidenceCount !== undefined ? { isolatedWorktreeEvidenceCount } : {}),
    ...(approvalEvidenceCount !== undefined ? { approvalEvidenceCount } : {}),
    ...(reason ? { reason: truncateText(reason, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS) } : {}),
  };
  return Object.keys(summary).length ? summary : undefined;
}

function diagnosticReplayLifecycleSummary(
  eventType: string,
  payload: Record<string, unknown>,
): DiagnosticExportSubagentLifecycleSummary | undefined {
  if (!isLifecycleReplayParentMailboxType(eventType)) return undefined;
  const detachedRunIds = stringArrayValue(payload.detachedRunIds);
  const cancelledRunIds = stringArrayValue(payload.cancelledRunIds);
  const stoppedChildRunIds = stringArrayValue(payload.stoppedChildRunIds);
  const unchangedRunIds = stringArrayValue(payload.unchangedRunIds);
  const cancelledWaitBarrierIds = stringArrayValue(payload.cancelledWaitBarrierIds);
  const cancelledMailboxEventIds = stringArrayValue(payload.cancelledMailboxEventIds);
  const parentCancellationRequested = booleanValue(payload.parentCancellationRequested);
  const summary: DiagnosticExportSubagentLifecycleSummary = {
    ...(stringValue(payload.decision) ?? stringValue(payload.action)
      ? { action: stringValue(payload.decision) ?? stringValue(payload.action) }
      : {}),
    ...(stringValue(payload.source) ? { source: stringValue(payload.source) } : {}),
    ...(stringValue(payload.status) ? { status: stringValue(payload.status) } : {}),
    ...(stringValue(payload.waitBarrierId) ? { waitBarrierId: stringValue(payload.waitBarrierId) } : {}),
    ...(stringValue(payload.barrierStatus) ? { barrierStatus: stringValue(payload.barrierStatus) } : {}),
    ...(stringValue(payload.reason) ? { reason: truncateText(stringValue(payload.reason)!, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS) } : {}),
    ...(stringValue(payload.userDecisionPreview)
      ? { userDecisionPreview: truncateText(stringValue(payload.userDecisionPreview)!, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS) }
      : {}),
    ...(stringValue(payload.partialSummaryPreview)
      ? { partialSummaryPreview: truncateText(stringValue(payload.partialSummaryPreview)!, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS) }
      : {}),
    ...(detachedRunIds.length ? { detachedRunIds } : {}),
    ...(cancelledRunIds.length ? { cancelledRunIds } : {}),
    ...(stoppedChildRunIds.length ? { stoppedChildRunIds } : {}),
    ...(unchangedRunIds.length ? { unchangedRunIds } : {}),
    ...(cancelledWaitBarrierIds.length ? { cancelledWaitBarrierIds } : {}),
    ...(cancelledMailboxEventIds.length ? { cancelledMailboxEventIds } : {}),
    ...(parentCancellationRequested !== undefined ? { parentCancellationRequested } : {}),
  };
  return Object.keys(summary).length ? summary : undefined;
}

function isLifecycleReplayParentMailboxType(eventType: string): boolean {
  return eventType === "subagent.lifecycle_interrupted" ||
    eventType === "subagent.cancellation_cascade" ||
    eventType === "subagent.wait_barrier_decision" ||
    eventType === "subagent.parent_control_reconciled";
}

function parentMailboxPayloadPreview(event: SubagentParentMailboxEventSummary): string | undefined {
  const payload = objectValue(event.payload);
  if (event.type === "subagent.grouped_completion") {
    const childRuns = Array.isArray(payload.childRuns)
      ? payload.childRuns.flatMap((item) => {
          const child = objectValue(item);
          const summary = stringValue(child.summary);
          const runId = stringValue(child.runId) ?? stringValue(child.childRunId) ?? stringValue(child.id);
          const status = stringValue(child.status);
          const text = [runId, status, summary].filter(Boolean).join(": ");
          return text ? [text] : [];
        })
      : [];
    if (childRuns.length) return truncateText(childRuns.join("; "), MAX_SUBAGENT_REPLAY_PREVIEW_CHARS);
  }
  const summary = stringValue(payload.summary);
  if (summary) return truncateText(summary, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS);
  const reason = stringValue(payload.reason);
  if (reason) return truncateText(reason, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS);
  return previewValue(event.payload);
}

function diagnosticReplayRuntimeTimelineItem(
  run: SubagentRunSummary,
  event: SubagentRunEventSummary,
  sequence: number,
): DiagnosticExportSubagentReplayTimelineItem {
  const preview = objectValue(event.preview);
  const details = objectValue(preview.details);
  return compactDiagnosticReplayTimelineItem({
    sequence,
    createdAt: stringValue(preview.createdAt) ?? event.createdAt,
    runId: run.id,
    parentRunId: run.parentRunId,
    childThreadId: run.childThreadId,
    canonicalTaskPath: run.canonicalTaskPath,
    roleId: run.roleId,
    source: stringValue(preview.source) ?? "child_runtime",
    type: stringValue(preview.type) ?? event.type,
    status: stringValue(preview.status),
    toolName: stringValue(preview.toolName),
    textPreview: stringValue(preview.textPreview),
    messagePreview: stringValue(preview.message),
    artifactPath: event.artifactPath ?? stringValue(preview.artifactPath),
    approvalId:
      stringValue(preview.approvalId) ??
      stringValue(preview.approvalGrantId) ??
      stringValue(preview.permissionGrantId) ??
      stringValue(details.approvalId) ??
      stringValue(details.approvalGrantId) ??
      stringValue(details.permissionGrantId),
    approvalSource: stringValue(preview.approvalSource) ?? stringValue(details.approvalSource),
    worktreeIsolated: booleanValue(preview.worktreeIsolated) ?? booleanValue(details.worktreeIsolated),
    worktreePath: stringValue(preview.worktreePath) ?? stringValue(details.worktreePath),
  });
}

function diagnosticReplayPersistedTimelineItem(
  run: SubagentRunSummary,
  event: SubagentRunEventSummary,
  sequence: number,
): DiagnosticExportSubagentReplayTimelineItem {
  return compactDiagnosticReplayTimelineItem({
    sequence,
    createdAt: event.createdAt,
    runId: run.id,
    parentRunId: run.parentRunId,
    childThreadId: run.childThreadId,
    canonicalTaskPath: run.canonicalTaskPath,
    roleId: run.roleId,
    source: "project_store",
    type: event.type,
    textPreview: previewValue(event.preview),
    artifactPath: event.artifactPath,
  });
}

function compactDiagnosticReplayTimelineItem(
  input: DiagnosticExportSubagentReplayTimelineItem,
): DiagnosticExportSubagentReplayTimelineItem {
  return {
    sequence: input.sequence,
    createdAt: input.createdAt,
    runId: input.runId,
    parentRunId: input.parentRunId,
    childThreadId: input.childThreadId,
    ...(input.canonicalTaskPath ? { canonicalTaskPath: input.canonicalTaskPath } : {}),
    ...(input.roleId ? { roleId: input.roleId } : {}),
    ...(input.source ? { source: input.source } : {}),
    type: input.type,
    ...(input.status ? { status: input.status } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.textPreview ? { textPreview: truncateText(input.textPreview, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS) } : {}),
    ...(input.messagePreview ? { messagePreview: truncateText(input.messagePreview, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS) } : {}),
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    ...(input.approvalSource ? { approvalSource: input.approvalSource } : {}),
    ...(input.worktreeIsolated !== undefined ? { worktreeIsolated: input.worktreeIsolated } : {}),
    ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
  };
}

function childRunIdsFromParentMailboxPayload(payload: unknown): string[] {
  const refs = new Set<string>();
  const record = objectValue(payload);
  addStringRef(refs, record, "childRunId");
  addStringRef(refs, record, "runId");
  addStringArrayRefs(refs, record, "childRunIds");
  addStringArrayRefs(refs, record, "cancelledRunIds");
  addStringArrayRefs(refs, record, "detachedRunIds");
  addStringArrayRefs(refs, record, "unchangedRunIds");
  addStringArrayRefs(refs, record, "stoppedChildRunIds");
  addRecordArrayRefs(refs, record.childRuns, ["runId", "childRunId", "id"]);
  addRecordArrayRefs(refs, record.childStatuses, ["childRunId", "runId"]);
  const waitBarrier = objectValue(record.waitBarrier);
  addStringArrayRefs(refs, waitBarrier, "childRunIds");
  const parentResolution = objectValue(record.parentResolution);
  addStringRef(refs, parentResolution, "childRunId");
  return [...refs].sort();
}

function childThreadIdsFromParentMailboxPayload(payload: unknown): string[] {
  const refs = new Set<string>();
  const record = objectValue(payload);
  addStringRef(refs, record, "childThreadId");
  addStringArrayRefs(refs, record, "childThreadIds");
  addStringArrayRefs(refs, record, "cancelledThreadIds");
  addStringArrayRefs(refs, record, "detachedThreadIds");
  addStringArrayRefs(refs, record, "stoppedChildThreadIds");
  addRecordArrayRefs(refs, record.childRuns, ["childThreadId", "threadId"]);
  addRecordArrayRefs(refs, record.childStatuses, ["childThreadId", "threadId"]);
  const waitBarrier = objectValue(record.waitBarrier);
  addRecordArrayRefs(refs, waitBarrier.childStatuses, ["childThreadId", "threadId"]);
  const parentResolution = objectValue(record.parentResolution);
  addStringRef(refs, parentResolution, "childThreadId");
  return [...refs].sort();
}

function canonicalTaskPathsFromParentMailboxPayload(payload: unknown): string[] {
  const refs = new Set<string>();
  const record = objectValue(payload);
  addStringRef(refs, record, "canonicalTaskPath");
  addStringRef(refs, record, "taskPath");
  addStringArrayRefs(refs, record, "canonicalTaskPaths");
  addStringArrayRefs(refs, record, "taskPaths");
  addRecordArrayRefs(refs, record.childRuns, ["canonicalTaskPath", "taskPath"]);
  addRecordArrayRefs(refs, record.childStatuses, ["canonicalTaskPath", "taskPath"]);
  const waitBarrier = objectValue(record.waitBarrier);
  addRecordArrayRefs(refs, waitBarrier.childStatuses, ["canonicalTaskPath", "taskPath"]);
  const parentResolution = objectValue(record.parentResolution);
  addStringRef(refs, parentResolution, "canonicalTaskPath");
  addStringRef(refs, parentResolution, "taskPath");
  return [...refs].sort();
}

function childSourceLabelsFromParentMailboxPayload(payload: unknown): string[] {
  const labels = new Set<string>();
  const record = objectValue(payload);
  addChildSourceLabel(labels, record);
  addRecordArraySourceLabels(labels, record.childRuns);
  addRecordArraySourceLabels(labels, record.childStatuses);
  const waitBarrier = objectValue(record.waitBarrier);
  addRecordArraySourceLabels(labels, waitBarrier.childStatuses);
  const parentResolution = objectValue(record.parentResolution);
  addChildSourceLabel(labels, parentResolution);
  return [...labels].sort();
}

function addChildSourceLabel(labels: Set<string>, record: Record<string, unknown>): void {
  const path = stringValue(record.canonicalTaskPath) ?? stringValue(record.taskPath);
  const runId = stringValue(record.childRunId) ?? stringValue(record.runId) ?? stringValue(record.id);
  const threadId = stringValue(record.childThreadId) ?? stringValue(record.threadId);
  const parts = [
    path,
    runId ? `run ${runId}` : undefined,
    threadId ? `thread ${threadId}` : undefined,
  ].filter(Boolean);
  if (parts.length) labels.add(parts.join(" / "));
}

function addRecordArraySourceLabels(labels: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) addChildSourceLabel(labels, objectValue(item));
}

function addStringRef(refs: Set<string>, record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (typeof value === "string" && value) refs.add(value);
}

function addStringArrayRefs(refs: Set<string>, record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string" && item) refs.add(item);
  }
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function addRecordArrayRefs(refs: Set<string>, value: unknown, keys: string[]): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const record = objectValue(item);
    for (const key of keys) addStringRef(refs, record, key);
  }
}

function createSubagentAttributionAudit(store: DiagnosticDataSource): DiagnosticExportSubagentAttributionSummary | undefined {
  if (!store.listAllSubagentRuns || !store.listSubagentRunEvents || !store.listSubagentParentMailboxEventsForParentRun) {
    return undefined;
  }

  const childScopedParentMailboxTypes = new Set<string>(SUBAGENT_CHILD_SCOPED_PARENT_MAILBOX_TYPES);
  const runs = store.listAllSubagentRuns();
  const parentRunIds = new Set<string>();
  const issueSamples: DiagnosticExportSubagentAttributionIssueSummary[] = [];
  let auditedRuntimeEventCount = 0;
  let auditedParentMailboxEventCount = 0;
  let issueCount = 0;
  let missingAttributionCount = 0;
  let mismatchedRunIdCount = 0;

  const recordIssue = (issue: DiagnosticExportSubagentAttributionIssueSummary): void => {
    issueCount += 1;
    if (isMismatchedAttributionIssue(issue.message)) mismatchedRunIdCount += 1;
    else missingAttributionCount += 1;
    if (issueSamples.length < MAX_SUBAGENT_ATTRIBUTION_ISSUES) issueSamples.push(issue);
  };

  for (const run of runs) {
    parentRunIds.add(run.parentRunId);
    for (const event of store.listSubagentRunEvents(run.id)) {
      if (event.type !== "subagent.runtime_event") continue;
      auditedRuntimeEventCount += 1;
      for (const violation of validateSubagentRunEventAttribution({
        runId: run.id,
        eventType: event.type,
        preview: event.preview,
      })) {
        recordIssue({
          eventType: event.type,
          runId: run.id,
          parentRunId: run.parentRunId,
          message: violation.message,
        });
      }
    }
  }

  for (const parentRunId of parentRunIds) {
    for (const event of store.listSubagentParentMailboxEventsForParentRun(parentRunId)) {
      if (!childScopedParentMailboxTypes.has(event.type)) continue;
      auditedParentMailboxEventCount += 1;
      for (const violation of validateSubagentParentMailboxEventAttribution({
        parentRunId,
        type: event.type,
        payload: event.payload,
      })) {
        recordIssue({
          eventType: event.type,
          parentRunId,
          message: violation.message,
        });
      }
    }
  }

  const auditedEventCount = auditedRuntimeEventCount + auditedParentMailboxEventCount;
  const status: DiagnosticExportHealthStatus = issueCount > 0 ? "needs_attention" : "healthy";
  const message = issueCount > 0
    ? `Sub-agent attribution audit found ${issueCount} issue${issueCount === 1 ? "" : "s"}.`
    : auditedEventCount > 0
    ? `Sub-agent attribution audit verified ${auditedEventCount} child-originating event${auditedEventCount === 1 ? "" : "s"}.`
    : "Sub-agent attribution audit found no child-originating events to inspect.";
  return {
    status,
    message,
    auditedRuntimeEventCount,
    auditedParentMailboxEventCount,
    issueCount,
    shownIssueCount: issueSamples.length,
    truncatedIssues: issueCount > issueSamples.length,
    missingAttributionCount,
    mismatchedRunIdCount,
    issueSamples,
    errorMessages: [],
  };
}

function isMismatchedAttributionIssue(message: string): boolean {
  return /\bdoes not match\b/i.test(message);
}

export function redactValue(value: unknown, key = ""): unknown {
  return redactSensitiveValue(value, key);
}

export function redactString(value: string): string {
  return redactSensitiveText(value);
}

async function readPluginDiagnostics(store: DiagnosticDataSource): Promise<DiagnosticPluginState> {
  if (!store.getPluginDiagnostics) return { errors: [] };
  try {
    return await store.getPluginDiagnostics();
  } catch (error) {
    return { errors: [`Plugin diagnostics failed: ${errorMessage(error)}`] };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function previewValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return truncateText(value, MAX_SUBAGENT_REPLAY_PREVIEW_CHARS);
  return truncateText(JSON.stringify(value) ?? String(value), MAX_SUBAGENT_REPLAY_PREVIEW_CHARS);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function nonNegativeNumberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function readSessionExcerpts(
  workspace: WorkspaceState,
  threads: ThreadSummary[],
  orchestration: OrchestrationBoard,
): Promise<DiagnosticSessionExcerpt[]> {
  const candidates = new Set<string>();
  for (const thread of threads) {
    if (thread.piSessionFile) candidates.add(thread.piSessionFile);
  }
  for (const run of orchestration.runs) {
    if (run.piSessionFile) candidates.add(run.piSessionFile);
  }

  for (const sessionFile of await newestSessionFiles(workspace.sessionPath, MAX_SESSION_FILES)) {
    candidates.add(sessionFile);
  }

  const excerpts: DiagnosticSessionExcerpt[] = [];
  for (const filePath of [...candidates].filter((filePath) => isSafeSessionPath(workspace, filePath)).slice(0, MAX_SESSION_FILES)) {
    excerpts.push(await readSessionExcerpt(workspace, filePath));
  }
  return excerpts;
}

async function newestSessionFiles(sessionPath: string, limit: number): Promise<string[]> {
  if (!existsSync(sessionPath)) return [];
  const files: Array<{ path: string; mtimeMs: number }> = [];

  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > 3) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const info = await stat(path);
        files.push({ path, mtimeMs: info.mtimeMs });
      }
    }
  }

  await visit(sessionPath, 0);
  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((file) => file.path);
}

function isSafeSessionPath(workspace: WorkspaceState, filePath: string): boolean {
  return isPathInside(workspace.sessionPath, filePath) && existsSync(filePath);
}

async function readSessionExcerpt(workspace: WorkspaceState, filePath: string): Promise<DiagnosticSessionExcerpt> {
  try {
    const info = await stat(filePath);
    const includedBytes = Math.min(info.size, MAX_SESSION_BYTES);
    const handle = await open(filePath, "r");
    try {
      const buffer = Buffer.alloc(includedBytes);
      await handle.read(buffer, 0, includedBytes, Math.max(0, info.size - includedBytes));
      const lines = buffer.toString("utf8").split(/\r?\n/);
      const selectedLines = lines.slice(-MAX_SESSION_LINES);
      return {
        path: displayPath(workspace, filePath),
        sizeBytes: info.size,
        includedBytes,
        truncated: info.size > includedBytes || lines.length > selectedLines.length,
        excerpt: selectedLines.join("\n"),
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    return {
      path: displayPath(workspace, filePath),
      sizeBytes: 0,
      includedBytes: 0,
      truncated: false,
      excerpt: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function displayPath(workspace: WorkspaceState, filePath: string): string {
  if (isPathInside(workspace.path, filePath)) return relative(workspace.path, filePath) || ".";
  return basename(filePath);
}
