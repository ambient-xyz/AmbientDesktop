import type {
  SubagentRepairDiagnosticsReport,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
} from "../../shared/types";
import { subagentRepairRowsForRun, type SubagentRepairDiagnosticRowModel } from "./subagentRepairDiagnosticsUiModel";

export interface SubagentThreadInspectorModel {
  runId: string;
  parentThreadId?: string;
  parentWorkspacePath?: string;
  title: string;
  status: string;
  statusTone: "neutral" | "active" | "success" | "warning" | "danger";
  parentBarrier?: {
    label: string;
    detail: string;
    tone: "neutral" | "active" | "success" | "warning" | "danger";
  };
  badges: string[];
  rows: Array<{
    label: string;
    value: string;
  }>;
  recentEvents: Array<{
    key: string;
    label: string;
    value: string;
  }>;
  toolScopeRows: Array<{
    label: string;
    value: string;
  }>;
  modelScopeRows: Array<{
    label: string;
    value: string;
  }>;
  waitBarrierRows: Array<{
    label: string;
    value: string;
  }>;
  repairRows: SubagentRepairDiagnosticRowModel[];
}

export function subagentThreadInspectorModel(
  thread: ThreadSummary | undefined,
  runs: SubagentRunSummary[],
  events: SubagentRunEventSummary[] = [],
  toolScopeSnapshots: SubagentToolScopeSnapshotSummary[] = [],
  waitBarriers: SubagentWaitBarrierSummary[] = [],
  repairDiagnostics?: SubagentRepairDiagnosticsReport,
  threads: ThreadSummary[] = [],
): SubagentThreadInspectorModel | undefined {
  if (!thread || thread.kind !== "subagent_child") return undefined;
  const run = runs.find((candidate) => candidate.id === thread.subagentRunId || candidate.childThreadId === thread.id);
  const parentWorkspacePath = parentWorkspacePathForThread(thread, run, threads);
  if (!run) {
    return {
      runId: thread.subagentRunId ?? thread.id,
      parentThreadId: thread.parentThreadId,
      parentWorkspacePath,
      title: "Sub-agent child thread",
      status: "Missing run record",
      statusTone: "danger",
      parentBarrier: thread.parentThreadId
        ? {
          label: "Parent link needs repair",
          detail: `Expected parent thread ${thread.parentThreadId}, but this child has no matching run record.`,
          tone: "danger",
        }
        : undefined,
      badges: ["Repair needed"],
      rows: [
        { label: "Child thread", value: thread.id },
        ...(thread.parentThreadId ? [{ label: "Parent thread", value: thread.parentThreadId }] : []),
      ],
      recentEvents: [],
      toolScopeRows: [],
      modelScopeRows: [],
      waitBarrierRows: [],
      repairRows: subagentRepairRowsForRun(repairDiagnostics, thread.subagentRunId, thread.id),
    };
  }

  const profile = run.modelRuntimeSnapshot.profile;
  const recentEvents = events
    .filter((event) => event.runId === run.id)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .slice(-5)
    .reverse()
    .map((event) => ({
      key: `${event.runId}:${event.sequence}`,
      label: eventLabel(event),
      value: eventValue(event),
    }));
  const toolScopeRows = toolScopeRowsForRun(run, toolScopeSnapshots);
  const modelScopeRows = modelScopeRowsForRun(run, events, toolScopeSnapshots);
  const latestBarrier = latestWaitBarrierForRun(run, waitBarriers);
  const waitBarrierRows = waitBarrierRowsForRun(run, waitBarriers, latestBarrier);
  const repairRows = subagentRepairRowsForRun(repairDiagnostics, run.id, run.childThreadId);
  return {
    runId: run.id,
    parentThreadId: run.parentThreadId,
    parentWorkspacePath,
    title: `${run.effectiveRoleSnapshot?.displayLabel || run.roleProfileSnapshot.label || titleCase(run.roleId)} sub-agent`,
    status: statusLabel(run.status),
    statusTone: statusTone(run.status),
    parentBarrier: parentBarrierSummaryForRun(run, latestBarrier),
    badges: [
      dependencyLabel(run.dependencyMode),
      profile.locality === "local" ? "Local" : "Cloud",
      profile.toolUse === "none" ? "Text-only" : "Tool-capable",
      run.closedAt ? "Closed" : "Open",
      ...repairBadges(repairRows),
    ],
    rows: [
      { label: "Task path", value: run.canonicalTaskPath },
      { label: "Role", value: roleSnapshotLabel(run) },
      ...effectiveRoleRows(run),
      { label: "Memory", value: memoryPolicyLabel(run.roleProfileSnapshot.memoryPolicy) },
      { label: "Retention", value: retentionPolicyLabel(run.roleProfileSnapshot.retentionDefault) },
      { label: "Scheduling", value: schedulingPolicyLabel(run.roleProfileSnapshot.schedulingPolicy) },
      { label: "Model", value: profile.label || profile.modelId },
      { label: "Runtime", value: `${profile.providerId} / ${profile.modelId}` },
      { label: "Tools", value: toolUseLabel(profile.toolUse) },
      { label: "Capacity", value: capacityLeaseLabel(run) },
      ...localMemoryRowsForRun(run),
      ...localRuntimeReservationRowsForRun(run),
      ...localRuntimeRowsForRun(run, events),
      { label: "Privacy", value: profile.privacyLabel },
      { label: "Parent thread", value: run.parentThreadId },
    ],
    recentEvents,
    toolScopeRows,
    modelScopeRows,
    waitBarrierRows,
    repairRows,
  };
}

function parentWorkspacePathForThread(
  thread: ThreadSummary,
  run: SubagentRunSummary | undefined,
  threads: ThreadSummary[],
): string | undefined {
  const parentThreadId = run?.parentThreadId ?? thread.parentThreadId;
  if (!parentThreadId) return undefined;
  return threads.find((candidate) => candidate.id === parentThreadId)?.workspacePath ?? thread.gitWorktree?.projectRoot ?? thread.workspacePath;
}

function repairBadges(rows: SubagentRepairDiagnosticRowModel[]): string[] {
  if (rows.length === 0) return [];
  return [
    rows.some((row) => row.categoryLabel === "Snapshot integrity") ? "Snapshot repair" : "Repair needed",
    `${rows.length} ${rows.length === 1 ? "repair" : "repairs"}`,
  ];
}

function waitBarrierRowsForRun(
  run: SubagentRunSummary,
  waitBarriers: SubagentWaitBarrierSummary[],
  latestBarrier = latestWaitBarrierForRun(run, waitBarriers),
): SubagentThreadInspectorModel["waitBarrierRows"] {
  const barrier = latestBarrier;
  if (!barrier) return [];
  return [
    { label: "Parent barrier", value: waitBarrierStatusLabel(barrier.status) },
    { label: "This child", value: waitBarrierChildStateLabel(run, barrier) },
    { label: "Parent dependency", value: waitBarrierDependencyLabel(barrier.dependencyMode) },
    { label: "Barrier group", value: childCountLabel(barrier.childRunIds.length) },
    ...(barrier.quorumThreshold !== undefined ? [{ label: "Quorum", value: quorumThresholdLabel(barrier) }] : []),
    ...waitBarrierEvaluationRows(barrier),
    ...waitBarrierCompletionGuardRows(barrier),
    { label: "Parent failure policy", value: waitBarrierFailurePolicyLabel(barrier.failurePolicy) },
    ...waitBarrierDecisionRows(barrier),
    ...(barrier.timeoutMs !== undefined ? [{ label: "Parent timeout", value: timeoutLabel(barrier.timeoutMs) }] : []),
    ...(barrier.resolvedAt ? [{ label: "Resolved", value: barrier.resolvedAt }] : []),
  ];
}

function latestWaitBarrierForRun(
  run: SubagentRunSummary,
  waitBarriers: SubagentWaitBarrierSummary[],
): SubagentWaitBarrierSummary | undefined {
  return waitBarriers
    .filter((candidate) => candidate.childRunIds.includes(run.id))
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
}

function parentBarrierSummaryForRun(
  run: SubagentRunSummary,
  barrier: SubagentWaitBarrierSummary | undefined,
): SubagentThreadInspectorModel["parentBarrier"] {
  if (!barrier) return undefined;
  const childState = waitBarrierChildStateLabel(run, barrier);
  const dependency = waitBarrierDependencyLabel(barrier.dependencyMode);
  const detail = `${childState} · ${dependency}`;
  if (barrier.status === "waiting_on_children") {
    if (run.status === "completed") {
      return {
        label: "Child ready for parent",
        detail,
        tone: "success",
      };
    }
    if (run.status === "failed" || run.status === "timed_out" || run.status === "cancelled" || run.status === "stopped") {
      return {
        label: "Parent blocked by child failure",
        detail,
        tone: "danger",
      };
    }
    if (run.status === "needs_attention" || run.status === "aborted_partial" || run.status === "detached") {
      return {
        label: "Parent needs child steering",
        detail,
        tone: "warning",
      };
    }
    return {
      label: "Parent waiting on this child",
      detail,
      tone: "active",
    };
  }
  if (barrier.status === "satisfied") {
    return {
      label: "Parent barrier satisfied",
      detail: barrier.resolvedAt ? `${detail} · resolved ${barrier.resolvedAt}` : detail,
      tone: run.status === "completed" ? "success" : "warning",
    };
  }
  return {
    label: `Parent barrier ${waitBarrierStatusLabel(barrier.status).toLowerCase()}`,
    detail: barrier.resolvedAt ? `${detail} · resolved ${barrier.resolvedAt}` : detail,
    tone: barrier.status === "cancelled" ? "warning" : "danger",
  };
}

function waitBarrierChildStateLabel(run: SubagentRunSummary, barrier: SubagentWaitBarrierSummary): string {
  if (barrier.status !== "waiting_on_children") return statusLabel(run.status);
  if (run.status === "completed") return "Ready: child complete";
  if (run.status === "needs_attention") return "Blocking: needs steering";
  if (run.status === "timed_out") return "Blocking: child timed out";
  if (run.status === "aborted_partial") return "Blocking: partial child";
  if (["failed", "stopped", "cancelled", "detached"].includes(run.status)) {
    return `Blocking: child ${statusLabel(run.status).toLowerCase()}`;
  }
  const activeBarrierLabel = activeBarrierChildLabel(run.status);
  if (activeBarrierLabel) return activeBarrierLabel;
  return statusLabel(run.status);
}

function activeBarrierChildLabel(status: SubagentRunSummary["status"]): string | undefined {
  if (status === "reserved") return "Blocking: child queued";
  if (status === "starting") return "Blocking: child starting";
  if (status === "running") return "Blocking: child running";
  if (status === "waiting") return "Blocking: child waiting";
  return undefined;
}

function waitBarrierEvaluationRows(barrier: SubagentWaitBarrierSummary): SubagentThreadInspectorModel["waitBarrierRows"] {
  const evaluation = waitBarrierEvaluationRecord(barrier);
  if (!evaluation) return [];
  const required = numberValue(evaluation.requiredSynthesisCount);
  const valid = numberValue(evaluation.validSynthesisCount);
  const activeCount = arrayValue(evaluation.activeChildRunIds).length;
  const unsafeCount = arrayValue(evaluation.terminalUnsafeChildRunIds).length;
  return [
    ...(required !== undefined && valid !== undefined
      ? [{ label: "Synthesis", value: `${valid}/${required} synthesis-safe` }]
      : []),
    ...(activeCount > 0 ? [{ label: "Still running", value: childCountLabel(activeCount) }] : []),
    ...(unsafeCount > 0 ? [{ label: "Unsafe terminal", value: childCountLabel(unsafeCount) }] : []),
  ];
}

function waitBarrierEvaluationRecord(barrier: SubagentWaitBarrierSummary): Record<string, unknown> | undefined {
  const artifact = recordValue(barrier.resolutionArtifact);
  return recordValue(artifact?.waitBarrierEvaluation);
}

function waitBarrierCompletionGuardRows(barrier: SubagentWaitBarrierSummary): SubagentThreadInspectorModel["waitBarrierRows"] {
  const guard = waitBarrierCompletionGuardRecord(barrier);
  if (!guard) return [];
  const required = booleanValue(guard.required);
  const valid = booleanValue(guard.valid);
  const synthesisAllowed = booleanValue(guard.synthesisAllowed);
  if (required === false && valid !== false && synthesisAllowed !== false) return [];
  const evidence = completionGuardEvidenceLabel(guard);
  const reason = stringValue(guard.reason);
  return [
    { label: "Completion guard", value: completionGuardStatusLabel({ required, valid, synthesisAllowed }) },
    ...(evidence ? [{ label: "Mutation evidence", value: evidence }] : []),
    ...(reason ? [{ label: "Guard reason", value: truncate(reason, 220) }] : []),
  ];
}

function waitBarrierCompletionGuardRecord(barrier: SubagentWaitBarrierSummary): Record<string, unknown> | undefined {
  const artifact = recordValue(barrier.resolutionArtifact);
  const resultValidation = recordValue(artifact?.resultValidation);
  return recordValue(resultValidation?.completionGuardValidation) ?? recordValue(artifact?.completionGuardValidation);
}

function completionGuardStatusLabel(input: {
  required?: boolean;
  valid?: boolean;
  synthesisAllowed?: boolean;
}): string {
  if (input.required === false) return "Not required";
  if (input.valid === true && input.synthesisAllowed === true) return "Passed: synthesis allowed";
  if (input.valid === false || input.synthesisAllowed === false) return "Blocked: synthesis denied";
  return "Recorded";
}

function completionGuardEvidenceLabel(guard: Record<string, unknown>): string | undefined {
  const structured = numberValue(guard.structuredEvidenceCount);
  const ambient = numberValue(guard.ambientEvidenceCount);
  const isolatedWorktree = numberValue(guard.isolatedWorktreeEvidenceCount);
  const approval = numberValue(guard.approvalEvidenceCount);
  const parts = [
    structured !== undefined ? `structured ${structured}` : undefined,
    ambient !== undefined ? `Ambient ${ambient}` : undefined,
    isolatedWorktree !== undefined ? `isolated worktree ${isolatedWorktree}` : undefined,
    approval !== undefined ? `approval ${approval}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : undefined;
}

function waitBarrierDecisionRows(barrier: SubagentWaitBarrierSummary): SubagentThreadInspectorModel["waitBarrierRows"] {
  const decision = waitBarrierDecisionRecord(barrier);
  if (!decision) return [];
  const decisionValue = typeof decision.decision === "string" ? decision.decision : "";
  const userDecision = typeof decision.userDecision === "string" ? decision.userDecision.trim() : "";
  const partialSummary = typeof decision.partialSummary === "string" ? decision.partialSummary.trim() : "";
  const detail = partialSummary || userDecision;
  const effectRows = waitBarrierDecisionEffectRows(barrier);
  if (decisionValue === "continue_with_partial") {
    return [
      { label: "Decision", value: "Partial approved" },
      ...(detail ? [{ label: "Decision detail", value: truncate(detail, 220) }] : []),
      ...effectRows,
    ];
  }
  if (decisionValue === "retry_child") {
    return [
      { label: "Decision", value: retryAcceptedByRuntime(barrier) ? "Retry accepted" : "Retry requested" },
      ...(userDecision ? [{ label: "Decision detail", value: truncate(userDecision, 220) }] : []),
      ...effectRows,
    ];
  }
  if (decisionValue === "detach_child") {
    return [
      { label: "Decision", value: "Child detached" },
      ...(userDecision ? [{ label: "Decision detail", value: truncate(userDecision, 220) }] : []),
      ...effectRows,
    ];
  }
  if (decisionValue === "cancel_parent") {
    return [
      { label: "Decision", value: "Parent cancelled" },
      ...(userDecision ? [{ label: "Decision detail", value: truncate(userDecision, 220) }] : []),
      ...effectRows,
    ];
  }
  if (decisionValue === "fail_parent") {
    return [
      { label: "Decision", value: "Fail parent" },
      ...(userDecision ? [{ label: "Decision detail", value: truncate(userDecision, 220) }] : []),
      ...effectRows,
    ];
  }
  return [];
}

function waitBarrierDecisionRecord(barrier: SubagentWaitBarrierSummary): Record<string, unknown> | undefined {
  const artifact = recordValue(barrier.resolutionArtifact);
  const decision = recordValue(artifact?.userDecision);
  return decision?.schemaVersion === "ambient-subagent-user-decision-v1" ? decision : undefined;
}

function waitBarrierDecisionEffectRows(barrier: SubagentWaitBarrierSummary): SubagentThreadInspectorModel["waitBarrierRows"] {
  const artifact = recordValue(barrier.resolutionArtifact);
  if (!artifact) return [];
  const retryRequestedRunIds = stringArrayValue(artifact.retryRequestedRunIds);
  const retryAcceptedRunIds = stringArrayValue(artifact.retryAcceptedRunIds);
  const retryMailboxEventIds = stringArrayValue(artifact.retryMailboxEventIds);
  const detachedRunIds = stringArrayValue(artifact.detachedRunIds);
  const cancelledRunIds = stringArrayValue(artifact.cancelledRunIds);
  const cancelledMailboxEventIds = stringArrayValue(artifact.cancelledMailboxEventIds);
  return [
    ...(retryRequestedRunIds.length ? [{ label: "Retry requested", value: childCountLabel(retryRequestedRunIds.length) }] : []),
    ...(retryAcceptedRunIds.length ? [{ label: "Retry accepted", value: childCountLabel(retryAcceptedRunIds.length) }] : []),
    ...(retryMailboxEventIds.length ? [{ label: "Retry mailbox", value: `${retryMailboxEventIds.length} queued ${retryMailboxEventIds.length === 1 ? "event" : "events"}` }] : []),
    ...(detachedRunIds.length ? [{ label: "Detached children", value: childCountLabel(detachedRunIds.length) }] : []),
    ...(cancelledRunIds.length ? [{ label: "Cancelled children", value: childCountLabel(cancelledRunIds.length) }] : []),
    ...(artifact.parentCancellationRequested === true ? [{ label: "Parent cancellation", value: "Requested" }] : []),
    ...(cancelledMailboxEventIds.length ? [{ label: "Cancelled mailbox", value: `${cancelledMailboxEventIds.length} pending ${cancelledMailboxEventIds.length === 1 ? "event" : "events"}` }] : []),
  ];
}

function retryAcceptedByRuntime(barrier: SubagentWaitBarrierSummary): boolean {
  const artifact = recordValue(barrier.resolutionArtifact);
  return stringArrayValue(artifact?.retryAcceptedRunIds).length > 0;
}

function waitBarrierStatusLabel(status: SubagentWaitBarrierSummary["status"]): string {
  if (status === "waiting_on_children") return "Waiting on this child";
  return status.split("_").map(titleCase).join(" ");
}

function waitBarrierDependencyLabel(mode: SubagentWaitBarrierSummary["dependencyMode"]): string {
  if (mode === "required_all") return "Required all";
  if (mode === "required_any") return "Required any";
  if (mode === "optional_background") return "Background";
  return "Quorum";
}

function waitBarrierFailurePolicyLabel(policy: SubagentWaitBarrierSummary["failurePolicy"]): string {
  if (policy === "ask_user") return "Ask user on failure";
  if (policy === "degrade_partial") return "Allow partial";
  if (policy === "retry_child") return "Retry child";
  return "Fail parent";
}

function timeoutLabel(timeoutMs: number): string {
  if (timeoutMs < 1000) return `${timeoutMs}ms`;
  const seconds = Math.round(timeoutMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function childCountLabel(count: number): string {
  return `${count} ${count === 1 ? "child" : "children"}`;
}

function quorumThresholdLabel(barrier: SubagentWaitBarrierSummary): string {
  const count = barrier.childRunIds.length;
  return count > 0 ? `${barrier.quorumThreshold}/${count} children` : `${barrier.quorumThreshold} children`;
}

function toolScopeRowsForRun(
  run: SubagentRunSummary,
  snapshots: SubagentToolScopeSnapshotSummary[],
): SubagentThreadInspectorModel["toolScopeRows"] {
  const snapshot = snapshots
    .filter((candidate) => candidate.runId === run.id)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .at(-1);
  if (!snapshot) return [];
  const scope = snapshot.scope;
  return [
    { label: "Pi-visible", value: categoryList(scope.piVisibleCategories) },
    { label: "Loaded", value: categoryList(scope.loadedCategories) },
    { label: "Denied", value: deniedCategoryList(scope.deniedCategories) },
    { label: "Source tools", value: sourceToolList(scope.loadedTools) },
    { label: "Denied tools", value: deniedSourceToolList(scope.deniedTools) },
    ...deniedReasonRows(scope.deniedCategories, scope.deniedTools),
    { label: "Approval", value: scope.approvalMode === "non_interactive" ? "Non-interactive" : "Interactive" },
    { label: "Worktree", value: scope.worktreeIsolated ? "Isolated" : "Parent workspace" },
    ...worktreeIsolationRowsForSnapshot(snapshot),
    ...worktreeRowsForSnapshot(snapshot),
    { label: "Fanout", value: scope.fanoutAvailable ? "Available" : "Unavailable" },
    ...callableWorkflowBridgeRowsForSnapshot(snapshot),
    ...childAuthorityRowsForSnapshot(snapshot),
  ];
}

function childAuthorityRowsForSnapshot(snapshot: SubagentToolScopeSnapshotSummary): SubagentThreadInspectorModel["toolScopeRows"] {
  const authority = childAuthorityProfileRecord(snapshot);
  if (!authority) return [];
  const resourceScopes = recordValue(authority.resourceScopes);
  const filesystem = recordValue(resourceScopes?.filesystem) ?? recordValue(authority.filesystem);
  const browser = recordValue(resourceScopes?.browser) ?? recordValue(authority.browser);
  const connectors = recordValue(resourceScopes?.connectors) ?? recordValue(authority.connectors);
  const nestedFanout = recordValue(resourceScopes?.nestedFanout) ?? recordValue(authority.nestedFanout);
  const approvalRouting = recordValue(authority.approvalRouting);
  const readRoots = stringArrayValue(filesystem?.readRoots);
  const writeRoots = stringArrayValue(filesystem?.writeRoots);
  const deniedWriteRoots = stringArrayValue(filesystem?.deniedWriteRoots);
  const browserDomains = stringArrayValue(browser?.domains);
  const connectorMethods = stringArrayValue(connectors?.methods);
  return [
    {
      label: "Task intent",
      value: truncate([
        stringValue(authority.taskIntent) ?? "Unknown",
        stringValue(authority.rationale),
      ].filter(Boolean).join(" / "), 260),
    },
    {
      label: "Filesystem scope",
      value: truncate([
        `read: ${readRoots.length ? readRoots.join(", ") : stringValue(filesystem?.readDecision) ?? "ask_parent"}`,
        `write: ${writeRoots.length ? writeRoots.join(", ") : stringValue(filesystem?.writeDecision) ?? "deny"}`,
        deniedWriteRoots.length ? `denied write: ${deniedWriteRoots.join(", ")}` : undefined,
      ].filter(Boolean).join(" / "), 260),
    },
    {
      label: "External scope",
      value: truncate([
        `network: ${stringValue(browser?.networkDecision) ?? "deny"}`,
        browserDomains.length ? `domains: ${browserDomains.join(", ")}` : undefined,
        `connectors: ${stringValue(connectors?.decision) ?? "deny"}`,
        connectorMethods.length ? `methods: ${connectorMethods.join(", ")}` : undefined,
      ].filter(Boolean).join(" / "), 260),
    },
    {
      label: "Nested fanout policy",
      value: truncate([
        stringValue(nestedFanout?.decision) ?? "deny",
        typeof nestedFanout?.remainingFanout === "number" ? `${nestedFanout.remainingFanout} remaining` : undefined,
      ].filter(Boolean).join(" / "), 180),
    },
    {
      label: "Approval route",
      value: truncate([
        stringValue(approvalRouting?.route) ?? "parent",
        stringValue(approvalRouting?.mode),
        stringValue(approvalRouting?.childThreadId),
      ].filter(Boolean).join(" / "), 220),
    },
  ];
}

function childAuthorityProfileRecord(snapshot: SubagentToolScopeSnapshotSummary): Record<string, unknown> | undefined {
  const resolverInputs = recordValue(snapshot.resolverInputs);
  const profile = recordValue(resolverInputs?.childAuthorityProfile);
  if (stringValue(profile?.schemaVersion) === "ambient-subagent-child-authority-profile-v1") return profile;
  const scope = recordValue(snapshot.scope);
  const displayProfile = recordValue(recordValue(scope?.displayMetadata)?.childAuthorityProfile);
  if (stringValue(displayProfile?.schemaVersion) === "ambient-subagent-child-authority-display-metadata-v1") {
    return displayProfile;
  }
  return undefined;
}

function callableWorkflowBridgeRowsForSnapshot(snapshot: SubagentToolScopeSnapshotSummary): SubagentThreadInspectorModel["toolScopeRows"] {
  const bridge = callableWorkflowBridgeRecord(snapshot);
  if (!bridge) return [];
  const allowCallableWorkflowTools = booleanValue(bridge.allowCallableWorkflowTools) ?? false;
  const nestedFanoutLimit = numberValue(bridge.nestedFanoutLimit);
  const remainingFanout = numberValue(bridge.remainingFanout);
  const allowedToolNames = stringArrayValue(bridge.allowedToolNames);
  const reason = stringValue(bridge.reason);
  return [
    {
      label: "Workflow bridge",
      value: truncate([
        allowCallableWorkflowTools ? "Enabled" : "Disabled",
        workflowBridgeFanoutLabel({ nestedFanoutLimit, remainingFanout }),
        `${allowedToolNames.length} ${allowedToolNames.length === 1 ? "allowed tool" : "allowed tools"}`,
        reason,
      ].filter(Boolean).join(" / "), 260),
    },
    ...(allowedToolNames.length > 0
      ? [{ label: "Workflow bridge tools", value: truncate(allowedToolNames.join(", "), 260) }]
      : []),
  ];
}

function callableWorkflowBridgeRecord(snapshot: SubagentToolScopeSnapshotSummary): Record<string, unknown> | undefined {
  const resolverInputs = recordValue(snapshot.resolverInputs);
  const workspacePolicy = recordValue(resolverInputs?.workspacePolicy);
  const launchBridge = recordValue(workspacePolicy?.callableWorkflowBridge);
  if (launchBridge) return launchBridge;
  const scope = recordValue(snapshot.scope);
  const displayBridge = recordValue(recordValue(scope?.displayMetadata)?.callableWorkflowBridge);
  return displayBridge;
}

function workflowBridgeFanoutLabel(input: {
  nestedFanoutLimit?: number;
  remainingFanout?: number;
}): string | undefined {
  if (input.nestedFanoutLimit === undefined && input.remainingFanout === undefined) return undefined;
  if (input.nestedFanoutLimit !== undefined && input.remainingFanout !== undefined) {
    return `${input.remainingFanout}/${input.nestedFanoutLimit} nested fanout slots remaining`;
  }
  if (input.remainingFanout !== undefined) return `${input.remainingFanout} nested fanout slots remaining`;
  return `${input.nestedFanoutLimit} nested fanout slots allowed`;
}

function worktreeIsolationRowsForSnapshot(snapshot: SubagentToolScopeSnapshotSummary): SubagentThreadInspectorModel["toolScopeRows"] {
  const resolverInputs = recordValue(snapshot.resolverInputs);
  const workspacePolicy = recordValue(resolverInputs?.workspacePolicy);
  if (!workspacePolicy) return [];
  const status = stringValue(workspacePolicy.worktreeIsolationStatus);
  const reason = stringValue(workspacePolicy.worktreeIsolationReason);
  const expectedChildThreadId = stringValue(workspacePolicy.expectedChildThreadId);
  const worktreeThreadId = stringValue(workspacePolicy.worktreeThreadId);
  return [
    ...(status ? [{ label: "Isolation status", value: titleCase(status) }] : []),
    ...(reason ? [{ label: "Isolation reason", value: truncate(reason, 180) }] : []),
    ...(expectedChildThreadId ? [{ label: "Expected child", value: expectedChildThreadId }] : []),
    ...(worktreeThreadId ? [{ label: "Worktree owner", value: worktreeThreadId }] : []),
  ];
}

function worktreeRowsForSnapshot(snapshot: SubagentToolScopeSnapshotSummary): SubagentThreadInspectorModel["toolScopeRows"] {
  const resolverInputs = recordValue(snapshot.resolverInputs);
  const worktree = recordValue(resolverInputs?.childWorktree);
  if (!worktree) return [];
  const status = stringValue(worktree.status);
  const path = stringValue(worktree.worktreePath);
  const branchName = stringValue(worktree.branchName);
  const baseRef = stringValue(worktree.baseRef);
  const error = stringValue(worktree.error);
  return [
    ...(status ? [{ label: "Worktree status", value: titleCase(status) }] : []),
    ...(path ? [{ label: "Worktree path", value: path }] : []),
    ...(branchName ? [{ label: "Worktree branch", value: branchName }] : []),
    ...(baseRef ? [{ label: "Worktree base", value: baseRef }] : []),
    ...(error ? [{ label: "Worktree error", value: truncate(error, 180) }] : []),
  ];
}

function modelScopeRowsForRun(
  run: SubagentRunSummary,
  events: SubagentRunEventSummary[],
  snapshots: SubagentToolScopeSnapshotSummary[],
): SubagentThreadInspectorModel["modelScopeRows"] {
  const modelScope = latestModelScopeForRun(run, events, snapshots);
  if (!modelScope) return [];
  const profile = recordValue(modelScope.profile);
  const selectedModelId = stringValue(modelScope.selectedModelId) ?? stringValue(profile?.modelId) ?? run.modelRuntimeSnapshot.profile.modelId;
  const selectedLabel = stringValue(profile?.label) ?? selectedModelId;
  const source = stringValue(modelScope.source);
  const providerId = stringValue(profile?.providerId);
  const locality = stringValue(profile?.locality);
  const toolUse = stringValue(profile?.toolUse);
  const structuredOutput = stringValue(profile?.structuredOutput);
  const warnings = stringArrayValue(modelScope.warnings);
  const blockers = stringArrayValue(modelScope.blockingReasons);
  const candidates = arrayValue(modelScope.candidateDiagnostics)
    .map(recordValue)
    .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate));
  return [
    {
      label: "Resolution",
      value: truncate([
        source ? modelScopeSourceLabel(source) : undefined,
        `${selectedLabel} selected`,
      ].filter(Boolean).join(" / "), 220),
    },
    {
      label: "Selected model",
      value: truncate([
        providerId ? `${providerId} / ${selectedModelId}` : selectedModelId,
        locality ? titleCase(locality) : undefined,
        toolUse ? toolUseLabel(toolUse) : undefined,
        structuredOutput ? `Structured output: ${structuredOutputLabel(structuredOutput)}` : undefined,
      ].filter(Boolean).join(" / "), 260),
    },
    ...modelProfileConstraintRows(profile),
    ...(warnings.length > 0 ? [{ label: "Model warnings", value: truncate(warnings.join("; "), 260) }] : []),
    { label: "Model blockers", value: blockers.length > 0 ? truncate(blockers.join("; "), 260) : "None" },
    ...(candidates.length > 0
      ? [{ label: "Candidates", value: truncate(candidates.map(modelScopeCandidateLabel).join("; "), 320) }]
      : []),
  ];
}

function modelProfileConstraintRows(profile: Record<string, unknown> | undefined): Array<{ label: string; value: string }> {
  if (!profile) return [];
  const contextWindowTokens = numberValue(profile.contextWindowTokens);
  const maxOutputTokens = numberValue(profile.maxOutputTokens);
  const costClass = stringValue(profile.costClass);
  const trustClass = stringValue(profile.trustClass);
  const privacyLabel = stringValue(profile.privacyLabel);
  const memoryClass = stringValue(profile.memoryClass);
  const estimatedResidentMemoryBytes = numberValue(profile.estimatedResidentMemoryBytes);
  const supportsVision = booleanValue(profile.supportsVision);
  const supportsAudio = booleanValue(profile.supportsAudio);
  const parts = [
    contextWindowTokens !== undefined ? `Context ${contextWindowTokens.toLocaleString()}` : undefined,
    maxOutputTokens !== undefined ? `Output ${maxOutputTokens.toLocaleString()}` : undefined,
    costClass ? `Cost ${sourceLabel(costClass)}` : undefined,
    trustClass ? `Trust ${sourceLabel(trustClass)}` : undefined,
    privacyLabel,
    memoryClass ? `Memory ${sourceLabel(memoryClass)}` : undefined,
    estimatedResidentMemoryBytes !== undefined ? `Resident ${formatBytes(estimatedResidentMemoryBytes)}` : undefined,
    supportsVision !== undefined ? (supportsVision ? "Vision" : "No vision") : undefined,
    supportsAudio !== undefined ? (supportsAudio ? "Audio" : "No audio") : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? [{ label: "Model constraints", value: truncate(parts.join(" / "), 320) }] : [];
}

function latestModelScopeForRun(
  run: SubagentRunSummary,
  events: SubagentRunEventSummary[],
  snapshots: SubagentToolScopeSnapshotSummary[],
): Record<string, unknown> | undefined {
  const snapshot = snapshots
    .filter((candidate) => candidate.runId === run.id)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .at(-1);
  const resolverInputs = recordValue(snapshot?.resolverInputs);
  const resolverModelScope = recordValue(resolverInputs?.modelScope);
  if (resolverModelScope) return resolverModelScope;
  return events
    .filter((event) => event.runId === run.id)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .reverse()
    .map((event) => recordValue(recordValue(event.preview)?.modelScope))
    .find((modelScope): modelScope is Record<string, unknown> => Boolean(modelScope));
}

function modelScopeCandidateLabel(candidate: Record<string, unknown>): string {
  const label = stringValue(candidate.label) ?? stringValue(candidate.modelId) ?? "Unknown model";
  const source = stringValue(candidate.source);
  const modelId = stringValue(candidate.modelId);
  const providerId = stringValue(candidate.providerId);
  const selected = candidate.selected === true ? "selected" : "candidate";
  const eligible = candidate.eligible === true ? "eligible" : "blocked";
  const blockers = stringArrayValue(candidate.blockingReasons);
  const failedCapabilities = arrayValue(candidate.capabilityDiagnostics)
    .map(recordValue)
    .filter((capability): capability is Record<string, unknown> => capability?.status === "fail")
    .map(capabilityDiagnosticLabel);
  const reason = blockers[0] ?? failedCapabilities[0];
  return [
    source ? modelScopeSourceLabel(source) : undefined,
    `${label}${modelId && modelId !== label ? ` (${modelId})` : ""}`,
    providerId,
    selected,
    eligible,
    reason ? `reason: ${reason}` : undefined,
  ].filter(Boolean).join(" / ");
}

function capabilityDiagnosticLabel(capability: Record<string, unknown>): string | undefined {
  return stringValue(capability.reason) ?? stringValue(capability.actual) ?? stringValue(capability.capability);
}

function modelScopeSourceLabel(source: string): string {
  if (source === "caller_override") return "Caller override";
  if (source === "parent_fallback") return "Parent fallback";
  if (source === "role_default") return "Role default";
  return sourceLabel(source);
}

function categoryList(categories: string[]): string {
  return categories.length ? categories.map(categoryLabel).join(", ") : "None";
}

function deniedCategoryList(categories: Array<{ id: string; reason: string }>): string {
  if (!categories.length) return "None";
  return truncate(categories.map((category) => `${categoryLabel(category.id)} (${category.id})`).join("; "), 260);
}

function sourceToolList(tools: Array<{ source: string; id: string; categoryId?: string; piVisible: boolean }>): string {
  if (!tools.length) return "None";
  return truncate(tools.map((tool) => {
    const category = tool.categoryId ? ` / ${categoryLabel(tool.categoryId)}` : "";
    const visibility = tool.piVisible ? "visible" : "loaded";
    return `${sourceLabel(tool.source)} ${tool.id}${category} (${visibility})`;
  }).join("; "), 260);
}

function deniedSourceToolList(tools: Array<{ source: string; id: string; categoryId?: string; reason: string }>): string {
  if (!tools.length) return "None";
  return truncate(tools.map((tool) => {
    const category = tool.categoryId ? ` / ${categoryLabel(tool.categoryId)} (${tool.categoryId})` : "";
    return `${sourceLabel(tool.source)} ${tool.id}${category}`;
  }).join("; "), 260);
}

function deniedReasonRows(
  categories: Array<{ id: string; reason: string }>,
  tools: Array<{ source: string; id: string; categoryId?: string; reason: string }>,
): SubagentThreadInspectorModel["toolScopeRows"] {
  const reasons = uniqueStrings([
    ...categories.map((category) => `${categoryLabel(category.id)} (${category.id}): ${category.reason}`),
    ...tools.map((tool) => `${sourceLabel(tool.source)} ${tool.id}: ${tool.reason}`),
  ]);
  return reasons.length ? [{ label: "Deny reasons", value: truncate(reasons.join("; "), 320) }] : [];
}

function sourceLabel(source: string): string {
  return source.split("_").map(titleCase).join(" ");
}

function categoryLabel(category: string): string {
  return category.split(".").map(titleCase).join(" ");
}

function eventLabel(event: SubagentRunEventSummary): string {
  return event.type.replace(/^subagent\./, "").split(/[._-]+/g).map(titleCase).join(" ");
}

function eventValue(event: SubagentRunEventSummary): string {
  const preview = previewValue(event.preview);
  const parts = [preview, event.artifactPath ? `Artifact: ${event.artifactPath}` : undefined].filter(Boolean);
  return parts.join(" | ") || event.createdAt;
}

function previewValue(value: unknown): string | undefined {
  if (typeof value === "string") return truncate(value, 220);
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const toolResult = runtimeToolResultPreview(record);
  if (toolResult) return truncate(toolResult, 220);
  const startupFailure = runtimeStartupFailurePreview(record);
  if (startupFailure) return truncate(startupFailure, 220);
  const localTextValidation = localTextOutputValidationPreview(record);
  if (localTextValidation) return truncate(localTextValidation, 220);
  const localTextPreflight = localTextRuntimePreflightPreview(record);
  if (localTextPreflight) return truncate(localTextPreflight, 220);
  const message = stringRecordValue(record, ["message", "summary", "status", "type", "reason", "error", "textPreview", "taskPreview"]);
  if (message) return truncate(message, 220);
  try {
    return truncate(JSON.stringify(value), 220);
  } catch {
    return undefined;
  }
}

function runtimeToolResultPreview(record: Record<string, unknown>): string | undefined {
  if (record.schemaVersion !== "ambient-subagent-runtime-event-v1" || record.type !== "tool_result") return undefined;
  const details = recordValue(record.details) ?? {};
  const toolName = stringRecordValue(record, ["toolName"]) ?? stringRecordValue(details, ["toolName"]) ?? "Tool";
  const status = stringRecordValue(details, ["status", "result"]) ?? stringRecordValue(record, ["status"]) ?? "";
  const category = stringRecordValue(details, ["category", "attemptedCategory", "toolCategory", "toolCategoryId"]);
  const path = stringRecordValue(details, ["path", "artifactPath"]);
  const approvalSource = stringRecordValue(details, ["approvalSource"]);
  const approvalId = stringRecordValue(details, ["approvalId", "approvalGrantId", "permissionGrantId"]);
  const worktreeIsolated = typeof details.worktreeIsolated === "boolean" ? details.worktreeIsolated : undefined;
  const parts = [
    `${toolName} ${toolResultStatusLabel(status)}`.trim(),
    category ? `Category: ${categoryLabel(category)}` : undefined,
    path ? `Path: ${path}` : undefined,
    approvalSource || approvalId ? `Approval: ${approvalLabel(approvalSource, approvalId)}` : undefined,
    worktreeIsolated !== undefined ? `Worktree: ${worktreeIsolated ? "isolated" : "parent workspace"}` : undefined,
  ].filter(Boolean);
  return parts.join(" | ");
}

function localTextRuntimePreflightPreview(record: Record<string, unknown>): string | undefined {
  const resourcePolicy = recordValue(record.resourcePolicy);
  const launchReadiness = recordValue(record.launchReadiness);
  const invocationLimits = recordValue(record.invocationLimits);
  const enforcement = recordValue(record.resourcePolicyEnforcement);
  if (!resourcePolicy && !launchReadiness && !invocationLimits && !enforcement) return undefined;
  const allowed = typeof record.allowed === "boolean" ? record.allowed : undefined;
  const blockers = stringArrayValue(record.blockers);
  const warnings = stringArrayValue(record.warnings);
  const parts = [
    allowed === undefined ? "Local text runtime preflight" : `Local text preflight ${allowed ? "allowed" : "blocked"}`,
    resourcePolicy ? localTextResourcePolicyLabel(resourcePolicy) : undefined,
    enforcement ? localTextResourcePolicyEnforcementLabel(enforcement) : undefined,
    launchReadiness ? localTextLaunchReadinessLabel(launchReadiness) : undefined,
    invocationLimits ? localTextInvocationLimitsLabel(invocationLimits) : undefined,
    blockers.length ? `Blocker: ${blockers[0]}` : undefined,
    !blockers.length && warnings.length ? `Warning: ${warnings[0]}` : undefined,
  ].filter(Boolean);
  return parts.join(" | ");
}

function localTextResourcePolicyLabel(policy: Record<string, unknown>): string {
  const outcome = stringRecordValue(policy, ["outcome"]);
  const projected = numberValue(policy.projectedEstimatedResidentMemoryBytes);
  const ceiling = numberValue(policy.maxResidentMemoryBytes);
  const exceeded = numberValue(policy.exceededByBytes);
  const memory = projected !== undefined && ceiling !== undefined
    ? `${formatBytes(projected)}/${formatBytes(ceiling)}`
    : projected !== undefined
    ? `${formatBytes(projected)} projected`
    : undefined;
  return [
    "Memory:",
    outcome ? sourceLabel(outcome) : undefined,
    memory,
    exceeded !== undefined ? `+${formatBytes(exceeded)}` : undefined,
  ].filter(Boolean).join(" ");
}

function localTextResourcePolicyEnforcementLabel(enforcement: Record<string, unknown>): string {
  const unload = recordValue(enforcement.unload);
  if (unload) {
    const attempted = stringArrayValue(unload.attemptedIds).length;
    const stopped = stringArrayValue(unload.stoppedIds).length;
    const failed = arrayValue(unload.failed).length;
    return `Enforcement: stopped ${stopped}/${attempted} idle${failed ? `; failed ${failed}` : ""}`;
  }
  const outcome = stringRecordValue(enforcement, ["outcome"]);
  const allowed = typeof enforcement.allowed === "boolean" ? enforcement.allowed : undefined;
  return [
    "Enforcement:",
    outcome ? sourceLabel(outcome) : undefined,
    allowed !== undefined ? (allowed ? "allowed" : "blocked") : undefined,
  ].filter(Boolean).join(" ");
}

function localTextLaunchReadinessLabel(readiness: Record<string, unknown>): string {
  const descriptor = recordValue(readiness.descriptor);
  const runtimeId = stringRecordValue(descriptor ?? {}, ["runtimeId", "modelId"]);
  const blockers = stringArrayValue(readiness.blockers);
  return [
    "Runtime:",
    runtimeId ?? "local text",
    readiness.ready === false && blockers.length ? `${blockers.length} launch ${blockers.length === 1 ? "blocker" : "blockers"}` : undefined,
  ].filter(Boolean).join(" ");
}

function localTextInvocationLimitsLabel(limits: Record<string, unknown>): string {
  const projected = numberValue(limits.projectedContextTokens);
  const contextWindow = numberValue(limits.contextWindowTokens);
  const output = numberValue(limits.outputReserveTokens);
  const fits = typeof limits.contextFits === "boolean" ? limits.contextFits : undefined;
  const context = projected !== undefined && contextWindow !== undefined
    ? `${projected.toLocaleString()}/${contextWindow.toLocaleString()}`
    : projected !== undefined
    ? `${projected.toLocaleString()} projected`
    : undefined;
  return [
    "Context:",
    context,
    fits !== undefined ? (fits ? "fits" : "blocked") : undefined,
    output !== undefined ? `output ${output.toLocaleString()}` : undefined,
  ].filter(Boolean).join(" ");
}

function localTextOutputValidationPreview(record: Record<string, unknown>): string | undefined {
  const validation = localTextOutputValidationRecord(record);
  if (!validation) return undefined;
  const localTextResult = recordValue(record.localTextResult);
  const outputCharCount = numberValue(validation.outputCharCount);
  const previewCharCount = numberValue(validation.previewCharCount);
  const maxInlineChars = numberValue(validation.maxInlineChars);
  const valid = validation.valid === true;
  const fullOutputPath = stringRecordValue(localTextResult ?? {}, ["fullOutputPath"]);
  const preview = stringRecordValue(validation, ["textPreview"]);
  const reason = stringRecordValue(validation, ["reason"]);
  const parts = [
    valid ? "Text output valid" : "Text output invalid",
    outputCharCount !== undefined ? `${outputCharCount.toLocaleString()} chars` : undefined,
    previewCharCount !== undefined && maxInlineChars !== undefined ? `${previewCharCount.toLocaleString()}/${maxInlineChars.toLocaleString()} inline chars` : undefined,
    validation.requiresFullOutputArtifact === true ? "full artifact required" : "inline preview",
    fullOutputPath ? `Full output: ${fullOutputPath}` : undefined,
    reason ? `Reason: ${reason}` : undefined,
    preview ? `Preview: ${truncate(preview, 100)}` : undefined,
  ].filter(Boolean);
  return parts.join(" | ");
}

function localTextOutputValidationRecord(record: Record<string, unknown>): Record<string, unknown> | undefined {
  if (record.schemaVersion === "ambient-local-text-output-validation-v1") return record;
  const direct = recordValue(record.outputValidation);
  if (direct?.schemaVersion === "ambient-local-text-output-validation-v1") return direct;
  const details = recordValue(record.details);
  const nested = recordValue(details?.outputValidation);
  if (nested?.schemaVersion === "ambient-local-text-output-validation-v1") return nested;
  return undefined;
}

function runtimeStartupFailurePreview(record: Record<string, unknown>): string | undefined {
  const failure = localRuntimeStartupFailureRecord(record);
  if (!failure) return undefined;
  const health = recordValue(failure.health);
  const stdoutPath = stringRecordValue(failure, ["stdoutPath"]);
  const stderrPath = stringRecordValue(failure, ["stderrPath"]);
  const parts = [
    "Startup failed",
    stringRecordValue(failure, ["reason"]) ? `Reason: ${sourceLabel(String(stringRecordValue(failure, ["reason"])))}` : undefined,
    stringRecordValue(failure, ["runtimeId"]) ? `Runtime: ${stringRecordValue(failure, ["runtimeId"])}` : undefined,
    stringRecordValue(failure, ["modelId"]) ? `Model: ${stringRecordValue(failure, ["modelId"])}` : undefined,
    numberValue(failure.startupTimeoutMs) !== undefined ? `Timeout: ${durationLabel(numberValue(failure.startupTimeoutMs) ?? 0)}` : undefined,
    health ? localRuntimeHealthLabel(health) : undefined,
    stdoutPath || stderrPath ? `Logs: ${[stdoutPath, stderrPath].filter(Boolean).join(", ")}` : undefined,
  ].filter(Boolean);
  return parts.join(" | ");
}

function localRuntimeStartupFailureRecord(record: Record<string, unknown>): Record<string, unknown> | undefined {
  if (record.schemaVersion === "ambient-local-model-runtime-startup-failure-v1") return record;
  const direct = recordValue(record.runtimeStartupFailure);
  if (direct?.schemaVersion === "ambient-local-model-runtime-startup-failure-v1") return direct;
  const details = recordValue(record.details);
  const nested = recordValue(details?.runtimeStartupFailure);
  if (nested?.schemaVersion === "ambient-local-model-runtime-startup-failure-v1") return nested;
  return undefined;
}

function localRuntimeHealthLabel(health: Record<string, unknown>): string {
  return [
    "Health",
    stringRecordValue(health, ["healthUrl"]) ? stringRecordValue(health, ["healthUrl"]) : undefined,
    numberValue(health.statusCode) !== undefined ? `status ${numberValue(health.statusCode)}` : undefined,
    stringRecordValue(health, ["error", "textPreview"]) ? stringRecordValue(health, ["error", "textPreview"]) : undefined,
  ].filter(Boolean).join(": ");
}

function durationLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)}s`;
}

function toolResultStatusLabel(status: string): string {
  if (status === "done" || status === "completed") return "completed";
  if (status === "error" || status === "failed") return "failed";
  return status || "completed";
}

function approvalLabel(source: string | undefined, id: string | undefined): string {
  const label = source ? source.split("_").map(titleCase).join(" ") : "Recorded";
  return id ? `${label} (${id})` : label;
}

function stringRecordValue(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    const string = stringValue(value);
    if (string) return string;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return arrayValue(value).filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function dependencyLabel(mode: SubagentRunSummary["dependencyMode"]): string {
  if (mode === "required") return "Required";
  if (mode === "supervisor_attention") return "Needs attention";
  return "Background";
}

function roleSnapshotLabel(run: SubagentRunSummary): string {
  const source = run.roleProfileSnapshotSource === "legacy_default" ? "legacy fallback" : "snapshot";
  return `${run.roleProfileSnapshot.label || titleCase(run.roleId)} (${source})`;
}

function effectiveRoleRows(run: SubagentRunSummary): SubagentThreadInspectorModel["rows"] {
  const snapshot = run.effectiveRoleSnapshot;
  if (!snapshot) return [];
  return [
    { label: "Effective role", value: snapshot.displayLabel },
    { label: "Pattern role", value: titleCase(snapshot.patternRole) },
    {
      label: "Role overlays",
      value: snapshot.overlays.map((overlay) => overlay.label || overlay.id).join(", "),
    },
    ...(snapshot.outputContract ? [{ label: "Output contract", value: snapshot.outputContract }] : []),
  ];
}

function memoryPolicyLabel(policy: SubagentRunSummary["roleProfileSnapshot"]["memoryPolicy"]): string {
  if (policy === "explicit_persistent") return "Explicit persistent memory";
  if (policy === "run_snapshot_only") return "Run snapshot only; persistent memory disabled";
  return "Persistent memory disabled";
}

function retentionPolicyLabel(policy: SubagentRunSummary["roleProfileSnapshot"]["retentionDefault"]): string {
  if (policy === "keep_until_parent_pruned") return "Keep until parent pruned";
  if (policy === "pinned") return "Pinned by role";
  return "Transient; cleanup after close";
}

function schedulingPolicyLabel(policy: SubagentRunSummary["roleProfileSnapshot"]["schedulingPolicy"]): string {
  if (policy === "automation_deferred") return "Automation deferred; no live parent context";
  return "Live parent only";
}

function statusLabel(status: SubagentRunSummary["status"]): string {
  if (status === "needs_attention") return "Needs attention";
  return status.split("_").map(titleCase).join(" ");
}

function statusTone(status: SubagentRunSummary["status"]): SubagentThreadInspectorModel["statusTone"] {
  switch (status) {
    case "running":
    case "starting":
      return "active";
    case "completed":
      return "success";
    case "reserved":
    case "detached":
    case "aborted_partial":
    case "timed_out":
    case "needs_attention":
      return "warning";
    case "failed":
    case "stopped":
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

function toolUseLabel(toolUse: string): string {
  if (toolUse === "none") return "No Pi-visible tools";
  if (toolUse === "ambient-tools") return "Ambient tools";
  if (toolUse === "mcp-compatible") return "MCP-compatible tools";
  return toolUse;
}

function structuredOutputLabel(structuredOutput: string): string {
  if (structuredOutput === "none") return "none";
  if (structuredOutput === "json_schema") return "JSON schema";
  if (structuredOutput === "json_mode") return "JSON mode";
  return structuredOutput;
}

function capacityLeaseLabel(run: SubagentRunSummary): string {
  const lease = run.capacityLeaseSnapshot;
  if (lease.status === "blocked") {
    const reason = lease.blockingReasons[0] ? `: ${truncate(lease.blockingReasons[0], 140)}` : "";
    return `Blocked${reason}`;
  }
  if (lease.status === "released") {
    return lease.releasedAt ? `Released ${lease.releasedAt}` : "Released";
  }
  const local = lease.localMemory.outcome === "not_applicable"
    ? ""
    : `, local memory ${lease.localMemory.outcome.replaceAll("_", " ")}`;
  return `Reserved (provider ${lease.provider.projectedOpenRunCount}${local})`;
}

function localMemoryRowsForRun(run: SubagentRunSummary): SubagentThreadInspectorModel["rows"] {
  const memory = run.capacityLeaseSnapshot.localMemory;
  if (memory.outcome === "not_applicable") return [];
  return [
    {
      label: "Local memory",
      value: `${localMemoryOutcomeLabel(memory.outcome)} ${memory.allowed ? "allowed" : "blocked"} - ${truncate(memory.reason, 160)}`,
    },
    ...(memory.requestedEstimatedResidentMemoryBytes !== undefined
      ? [{ label: "Local memory request", value: formatBytes(memory.requestedEstimatedResidentMemoryBytes) }]
      : []),
    ...(memory.activeEstimatedResidentMemoryBytes !== undefined || memory.activeActualResidentMemoryBytes !== undefined
      ? [{
          label: "Local memory active",
          value: [
            memory.activeEstimatedResidentMemoryBytes !== undefined ? `${formatBytes(memory.activeEstimatedResidentMemoryBytes)} estimated` : undefined,
            memory.activeActualResidentMemoryBytes !== undefined ? `${formatBytes(memory.activeActualResidentMemoryBytes)} actual` : undefined,
          ].filter(Boolean).join("; "),
        }]
      : []),
    ...(memory.projectedEstimatedResidentMemoryBytes !== undefined
      ? [{
          label: "Local memory projected",
          value: [
            `${formatBytes(memory.projectedEstimatedResidentMemoryBytes)} projected`,
            memory.maxResidentMemoryBytes !== undefined ? `ceiling ${formatBytes(memory.maxResidentMemoryBytes)}` : undefined,
            memory.exceededByBytes !== undefined ? `exceeds by ${formatBytes(memory.exceededByBytes)}` : undefined,
          ].filter(Boolean).join("; "),
        }]
      : []),
    ...(memory.unloadCandidateIds?.length
      ? [{ label: "Local memory cleanup", value: `${memory.unloadCandidateIds.length} idle ${memory.unloadCandidateIds.length === 1 ? "candidate" : "candidates"}: ${truncate(memory.unloadCandidateIds.join(", "), 120)}` }]
      : []),
  ];
}

function localRuntimeReservationRowsForRun(run: SubagentRunSummary): SubagentThreadInspectorModel["rows"] {
  const reservation = run.capacityLeaseSnapshot.localMemory.localRuntimeReservation;
  if (reservation?.schemaVersion !== "ambient-subagent-local-runtime-reservation-v1") return [];
  return [
    {
      label: "Local runtime reservation",
      value: [
        sourceLabel(reservation.status),
        `runtime ${reservation.runtimeId}`,
        `${reservation.providerId} / ${reservation.modelId}`,
        reservation.modelProfileId ? `profile ${reservation.modelProfileId}` : undefined,
        reservation.ownerThreadId ? `owner ${reservation.ownerThreadId}` : undefined,
      ].filter(Boolean).join(" / "),
    },
    {
      label: "Local runtime request",
      value: [
        reservation.canonicalTaskPath,
        reservation.idempotencyKey,
        reservation.estimatedResidentMemoryBytes !== undefined
          ? `${formatBytes(reservation.estimatedResidentMemoryBytes)} estimate from ${sourceLabel(reservation.memoryEstimateSource)}`
          : `memory estimate ${sourceLabel(reservation.memoryEstimateSource)}`,
        reservation.contextTokens !== undefined ? `context ${reservation.contextTokens.toLocaleString()}` : undefined,
      ].filter(Boolean).join(" / "),
    },
    ...(reservation.endpoint ? [{ label: "Local runtime endpoint", value: reservation.endpoint }] : []),
    ...(reservation.stateRootPath ? [{ label: "Local runtime state root", value: reservation.stateRootPath }] : []),
  ];
}

function localRuntimeRowsForRun(
  run: SubagentRunSummary,
  events: SubagentRunEventSummary[],
): SubagentThreadInspectorModel["rows"] {
  const state = latestLocalRuntimeStateForRun(run, events);
  if (!state) return [];
  const runtimeId = stringRecordValue(state, ["runtimeId"]);
  const status = stringRecordValue(state, ["status"]);
  const pid = numberValue(state.pid);
  const idleTimeoutMs = numberValue(state.idleTimeoutMs);
  const actualMemory = numberValue(state.actualResidentMemoryBytes);
  const estimatedMemory = numberValue(state.estimatedResidentMemoryBytes);
  const stdoutPath = stringRecordValue(state, ["stdoutPath"]);
  const stderrPath = stringRecordValue(state, ["stderrPath"]);
  const healthUrl = stringRecordValue(state, ["healthUrl"]);
  const acquisition = latestLocalRuntimeAcquisitionForRun(run, events);
  const release = latestLocalRuntimeReleaseForRun(run, events);
  return [
    {
      label: "Local runtime",
      value: [
        runtimeId,
        pid !== undefined ? `pid ${pid}` : undefined,
        status ? sourceLabel(status) : undefined,
        idleTimeoutMs !== undefined ? `idle cleanup ${durationLabel(idleTimeoutMs)}` : undefined,
      ].filter(Boolean).join(" / "),
    },
    ...(acquisition ? [{
      label: "Local runtime acquisition",
      value: localRuntimeAcquisitionLabel(acquisition),
    }] : []),
    ...(actualMemory !== undefined || estimatedMemory !== undefined
      ? [{
          label: "Local runtime memory",
          value: [
            actualMemory !== undefined ? `${formatBytes(actualMemory)} actual` : undefined,
            estimatedMemory !== undefined ? `${formatBytes(estimatedMemory)} estimated` : undefined,
            stringRecordValue(state, ["memorySampledAt"]) ? `sampled ${stringRecordValue(state, ["memorySampledAt"])}` : undefined,
          ].filter(Boolean).join("; "),
        }]
      : []),
    ...(release ? [{
      label: "Local runtime release",
      value: localRuntimeReleaseLabel(release),
    }] : []),
    ...(healthUrl ? [{ label: "Local runtime health", value: healthUrl }] : []),
    ...(stdoutPath || stderrPath
      ? [{ label: "Local runtime logs", value: truncate([stdoutPath, stderrPath].filter(Boolean).join(", "), 220) }]
      : []),
  ];
}

function localRuntimeAcquisitionLabel(acquisition: Record<string, unknown>): string {
  const source = stringRecordValue(acquisition, ["source"]);
  const leaseId = stringRecordValue(acquisition, ["leaseId"]);
  const pid = numberValue(acquisition.pid);
  const activeLeases = numberValue(acquisition.activeLeases);
  const acquiredAt = stringRecordValue(acquisition, ["acquiredAt"]);
  return [
    source ? sourceLabel(source) : undefined,
    leaseId ? `lease ${leaseId}` : undefined,
    pid !== undefined ? `pid ${pid}` : undefined,
    activeLeases !== undefined ? `${activeLeases} active` : undefined,
    acquiredAt ? `acquired ${acquiredAt}` : undefined,
  ].filter(Boolean).join(" / ");
}

function localRuntimeReleaseLabel(release: Record<string, unknown>): string {
  const status = stringRecordValue(release, ["status"]);
  const leaseId = stringRecordValue(release, ["leaseId"]);
  const pid = numberValue(release.pid);
  const remainingLeases = numberValue(release.remainingLeases);
  const releasedAt = stringRecordValue(release, ["releasedAt"]);
  const idleCleanupDueAt = stringRecordValue(release, ["idleCleanupDueAt"]);
  const error = stringRecordValue(release, ["error"]);
  return [
    status ? sourceLabel(status) : undefined,
    leaseId ? `lease ${leaseId}` : undefined,
    pid !== undefined ? `pid ${pid}` : undefined,
    remainingLeases !== undefined ? `${remainingLeases} remaining` : undefined,
    releasedAt ? `released ${releasedAt}` : undefined,
    idleCleanupDueAt ? `cleanup due ${idleCleanupDueAt}` : undefined,
    error ? `Error: ${truncate(error, 120)}` : undefined,
  ].filter(Boolean).join(" / ");
}

function latestLocalRuntimeStateForRun(
  run: SubagentRunSummary,
  events: SubagentRunEventSummary[],
): Record<string, unknown> | undefined {
  return events
    .filter((event) => event.runId === run.id)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .reverse()
    .map((event) => recordValue(recordValue(event.preview)?.runtimeState))
    .find((state): state is Record<string, unknown> => state?.schemaVersion === "ambient-local-model-runtime-state-v1");
}

function latestLocalRuntimeAcquisitionForRun(
  run: SubagentRunSummary,
  events: SubagentRunEventSummary[],
): Record<string, unknown> | undefined {
  return events
    .filter((event) => event.runId === run.id)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .reverse()
    .map((event) => recordValue(recordValue(event.preview)?.runtimeAcquisition))
    .find((acquisition): acquisition is Record<string, unknown> => acquisition?.schemaVersion === "ambient-local-model-runtime-acquisition-v1");
}

function latestLocalRuntimeReleaseForRun(
  run: SubagentRunSummary,
  events: SubagentRunEventSummary[],
): Record<string, unknown> | undefined {
  return events
    .filter((event) => event.runId === run.id)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .reverse()
    .map((event) => recordValue(recordValue(event.preview)?.runtimeRelease))
    .find((release): release is Record<string, unknown> => release?.schemaVersion === "ambient-local-model-runtime-release-v1");
}

function localMemoryOutcomeLabel(outcome: string): string {
  return outcome.split(/[-_]+/g).filter(Boolean).map(titleCase).join(" ") || outcome;
}

function formatBytes(bytes: number): string {
  const value = Math.max(0, bytes);
  const gib = value / (1024 ** 3);
  if (gib >= 1) return `${gib >= 10 ? Math.round(gib).toLocaleString() : gib.toFixed(1)} GiB`;
  const mib = value / (1024 ** 2);
  if (mib >= 1) return `${mib >= 10 ? Math.round(mib).toLocaleString() : mib.toFixed(1)} MiB`;
  return `${Math.round(value).toLocaleString()} B`;
}

function titleCase(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  if (!normalized) return value;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
