import {
  REQUIRED_DESKTOP_DOGFOOD_SCENARIOS,
  REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS,
  REQUIRED_DESKTOP_VISUAL_ASSERTIONS,
} from "./subagent-desktop-dogfood-evidence-contract.mjs";
import {
  latestArrayItem,
  nonEmptyString,
  nonEmptyStringArray,
  objectValue,
  parentApprovalEventForArtifact,
  prefixIssues,
  safeRelativePath,
} from "./subagent-live-confidence-validator-utils.mjs";

export function validateLiveSmokeArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Live smoke artifact is missing."] };
  if (!artifact.provider) issues.push("Live smoke artifact is missing provider.");
  if (artifact.run?.status !== "completed") issues.push(`Live smoke child run status is ${artifact.run?.status ?? "missing"}.`);
  if (!artifact.run?.childThreadId) issues.push("Live smoke artifact is missing childThreadId.");
  if (!artifact.run?.resultArtifact || artifact.run.resultArtifact.status !== "completed") {
    issues.push("Live smoke artifact is missing a completed child result artifact.");
  }
  const runtimeEvents = Array.isArray(artifact.run?.runtimeEvents) ? artifact.run.runtimeEvents : [];
  if (!runtimeEvents.some((event) => event?.type === "started")) issues.push("Live smoke artifact is missing child runtime started event.");
  if (!runtimeEvents.some((event) => event?.type === "assistant_delta"))
    issues.push("Live smoke artifact is missing child assistant_delta stream event.");
  if (!runtimeEvents.some((event) => event?.type === "completed"))
    issues.push("Live smoke artifact is missing child runtime completed event.");
  if (!String(artifact.childAssistantText ?? "").includes("SUBAGENT_CHILD_DONE")) {
    issues.push("Live smoke artifact is missing the child completion sentinel.");
  }
  if (!String(artifact.assistantText ?? "").includes("SUBAGENT_LIVE_DONE")) {
    issues.push("Live smoke artifact is missing the parent completion sentinel.");
  }
  return { valid: issues.length === 0, issues };
}

export function validateChildAuthorityConfidenceArtifacts(input = {}) {
  const longContext = validateLongContextAuthorityArtifact(input.longContextArtifact);
  const approvalAuthority = validateApprovalAuthorityArtifact(input.approvalAuthorityArtifact);
  const browserApproval = validateBrowserApprovalAuthorityArtifact(input.browserApprovalArtifact);
  const issues = [
    ...prefixIssues("Long-context child authority", longContext.issues),
    ...prefixIssues("Child file approval authority", approvalAuthority.issues),
    ...prefixIssues("Child browser approval authority", browserApproval.issues),
  ];
  return {
    valid: issues.length === 0,
    issues,
    parts: { longContext, approvalAuthority, browserApproval },
  };
}

export function validateLongContextAuthorityArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["artifact is missing."] };
  if (!artifact.provider) issues.push("artifact is missing provider.");
  const run = objectValue(artifact.run);
  if (run.status !== "completed") issues.push(`child run status is ${run.status ?? "missing"}; expected completed.`);
  if (!nonEmptyString(run.childThreadId)) issues.push("artifact is missing childThreadId.");
  if (objectValue(run.resultArtifact).status !== "completed") {
    issues.push("artifact is missing a completed child result artifact.");
  }
  const childToolNames = Array.isArray(artifact.childToolNames) ? artifact.childToolNames : [];
  if (!childToolNames.includes("read")) issues.push("child tools are missing native read.");
  if (!childToolNames.includes("long_context_process")) issues.push("child tools are missing long_context_process.");
  const transcript = String(artifact.childTranscript ?? "");
  for (const marker of ["TEXT_AUTHORITY_OK", "PDF_AUTHORITY_OK", "OFFICE_AUTHORITY_OK"]) {
    if (!transcript.includes(marker)) issues.push(`child transcript is missing granted-content marker ${marker}.`);
  }
  if (!transcript.includes("outside the current workspace authority")) {
    issues.push("child transcript is missing the denied long_context_process authority explanation.");
  }
  if (artifact.deniedContentLeaked !== false || transcript.includes("DENIED_SIBLING_SECRET_TOKEN")) {
    issues.push("denied sibling content leaked into the child transcript.");
  }
  const latestScope = latestArrayItem(run.toolScopeSnapshots);
  const filesystem = objectValue(
    objectValue(objectValue(objectValue(latestScope?.resolverInputs).childAuthorityProfile).resourceScopes).filesystem,
  );
  if (!Array.isArray(filesystem.readRoots) || filesystem.readRoots.length < 3) {
    issues.push("latest child authority profile is missing the three explicit read roots.");
  }
  if (Array.isArray(filesystem.writeRoots) && filesystem.writeRoots.length > 0) {
    issues.push("latest child authority profile unexpectedly grants write roots.");
  }
  if (filesystem.readDecision !== "allow") issues.push(`readDecision is ${filesystem.readDecision ?? "missing"}; expected allow.`);
  if (filesystem.writeDecision !== "deny") issues.push(`writeDecision is ${filesystem.writeDecision ?? "missing"}; expected deny.`);
  return { valid: issues.length === 0, issues };
}

export function validateApprovalAuthorityArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["artifact is missing."] };
  if (!artifact.provider) issues.push("artifact is missing provider.");
  const run = objectValue(artifact.run);
  if (run.status !== "needs_attention") issues.push(`child run status is ${run.status ?? "missing"}; expected needs_attention.`);
  if (!nonEmptyString(run.childThreadId)) issues.push("artifact is missing childThreadId.");
  const waitDetails = objectValue(artifact.waitDetails);
  if (waitDetails.status !== "needs_attention" || waitDetails.waitSatisfied !== false || waitDetails.synthesisAllowed !== false) {
    issues.push("wait_agent did not leave the parent blocked on a non-synthesizable child approval request.");
  }
  const pendingPermissions = Array.isArray(artifact.pendingPermissions) ? artifact.pendingPermissions : [];
  const permission = pendingPermissions.find(
    (candidate) =>
      candidate?.threadId === run.childThreadId && candidate?.toolName === "read" && candidate?.grantActionKind === "file_content_read",
  );
  if (!permission) issues.push("artifact is missing a pending read permission scoped to the child thread.");
  const approvalEvent = parentApprovalEventForArtifact(artifact, {
    childRunId: run.id,
    childThreadId: run.childThreadId,
    approvalId: permission?.id,
    requestedToolId: "read",
    requestedAction: "file_content_read",
  });
  if (!approvalEvent) issues.push("artifact is missing the queued child approval request in the parent mailbox.");
  const evidenceDetails = objectValue(objectValue(objectValue(artifact.evidence).dogfoodRunEvidence).details);
  if (evidenceDetails.schemaVersion !== "ambient-subagent-live-approval-authority-evidence-v1") {
    issues.push("artifact is missing recorded live approval authority evidence.");
  }
  if (evidenceDetails.childPausedForApproval !== true) issues.push("recorded evidence does not prove childPausedForApproval.");
  if (evidenceDetails.parentRemainedBlocked !== true) issues.push("recorded evidence does not prove parentRemainedBlocked.");
  if (evidenceDetails.approvalForwardedToParent !== true) issues.push("recorded evidence does not prove approvalForwardedToParent.");
  if (artifact.deniedContentLeaked !== false || String(artifact.childTranscript ?? "").includes("APPROVAL_SECRET_TOKEN_SHOULD_NOT_LEAK")) {
    issues.push("denied approval content leaked into the child transcript.");
  }
  return { valid: issues.length === 0, issues };
}

export function validateBrowserApprovalAuthorityArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["artifact is missing."] };
  if (!artifact.provider) issues.push("artifact is missing provider.");
  if (artifact.parentPermissionMode !== "full-access") {
    issues.push(`parentPermissionMode is ${artifact.parentPermissionMode ?? "missing"}; expected full-access.`);
  }
  const run = objectValue(artifact.run);
  if (run.status !== "running") {
    issues.push(`post-approval child run status is ${run.status ?? "missing"}; expected running.`);
  }
  if (!nonEmptyString(run.childThreadId)) issues.push("artifact is missing childThreadId.");
  const waitDetails = objectValue(artifact.waitDetails);
  if (waitDetails.status !== "needs_attention" || waitDetails.waitSatisfied !== false || waitDetails.synthesisAllowed !== false) {
    issues.push("wait_agent did not leave the parent blocked on a child browser approval request.");
  }
  const preApprovalRun = objectValue(waitDetails.run);
  if (preApprovalRun.status !== undefined && preApprovalRun.status !== "needs_attention") {
    issues.push(`pre-approval child run status is ${preApprovalRun.status}; expected needs_attention.`);
  }
  const pendingBeforeApproval = Array.isArray(artifact.pendingBeforeApproval) ? artifact.pendingBeforeApproval : [];
  const permission = pendingBeforeApproval.find(
    (candidate) =>
      candidate?.threadId === run.childThreadId &&
      candidate?.toolName === "browser_content" &&
      candidate?.grantActionKind === "browser_network" &&
      candidate?.grantTargetKind === "browser_origin" &&
      objectValue(candidate.grantConditions).childRunId === run.id,
  );
  if (!permission) issues.push("artifact is missing a pending browser permission scoped to the child run.");
  const approvalEvent = parentApprovalEventForArtifact(artifact, {
    childRunId: run.id,
    childThreadId: run.childThreadId,
    approvalId: permission?.id,
    requestedToolId: "browser_content",
    requestedAction: "browser_network",
    deliveryState: "consumed",
  });
  if (!approvalEvent) issues.push("artifact is missing the parent mailbox browser approval request.");
  const consumedEvent = (Array.isArray(artifact.parentMailboxEvents) ? artifact.parentMailboxEvents : []).find(
    (event) => event?.type === "subagent.child_approval_requested" && event?.deliveryState === "consumed",
  );
  if (!consumedEvent) issues.push("artifact is missing consumed parent mailbox approval after parent decision.");
  const responses = Array.isArray(artifact.permissionResponses) ? artifact.permissionResponses : [];
  if (!responses.some((response) => response?.id === permission?.id && response?.response === "always_thread")) {
    issues.push("artifact is missing child-thread scoped browser approval response.");
  }
  const resumeDetails = objectValue(artifact.resumeDetails);
  if (resumeDetails.status !== undefined && resumeDetails.status !== "running") {
    issues.push(`post-approval wait status is ${resumeDetails.status}; expected running.`);
  }
  if (resumeDetails.synthesisAllowed !== false) {
    issues.push("resume wait should keep parent synthesis blocked until the child reaches a synthesis-safe result.");
  }
  const runEventTypes = (Array.isArray(run.runEvents) ? run.runEvents : []).map((event) => event?.type);
  for (const expected of ["subagent.approval_requested", "subagent.child_approval_forwarded", "subagent.approval_response.consumed"]) {
    if (!runEventTypes.includes(expected)) issues.push(`artifact is missing run event ${expected}.`);
  }
  return { valid: issues.length === 0, issues };
}

export const REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS = REQUIRED_DESKTOP_DOGFOOD_SCENARIOS;
export const REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS = REQUIRED_DESKTOP_VISUAL_ASSERTIONS;
export const REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS = REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS;

export function validateDesktopDogfoodConfidenceArtifact(artifact) {
  const issues = [];
  if (!artifact) return { valid: false, issues: ["Desktop dogfood artifact is missing."] };
  if (artifact.schemaVersion !== "ambient-subagent-desktop-dogfood-v1") {
    issues.push(`Desktop dogfood artifact schemaVersion is ${artifact.schemaVersion ?? "missing"}.`);
  }
  if (artifact.status !== "passed") issues.push(`Desktop dogfood artifact status is ${artifact.status ?? "missing"}; expected passed.`);
  if (artifact.classification !== "passed") {
    issues.push(`Desktop dogfood artifact classification is ${artifact.classification ?? "missing"}; expected passed.`);
  }
  if (!nonEmptyString(artifact.provider)) issues.push("Desktop dogfood artifact is missing provider.");
  if (artifact.featureFlag !== "ambient.subagents") {
    issues.push(`Desktop dogfood artifact featureFlag is ${artifact.featureFlag ?? "missing"}; expected ambient.subagents.`);
  }
  for (const field of [
    "parentThreadId",
    "parentMessageId",
    "approvalId",
    "localRuntimeLeaseId",
    "localRuntimeId",
    "workflowTaskId",
    "workflowRunId",
  ]) {
    if (!nonEmptyString(artifact[field])) issues.push(`Desktop dogfood artifact is missing ${field}.`);
  }
  if (!nonEmptyStringArray(artifact.childRunIds)) issues.push("Desktop dogfood artifact is missing childRunIds.");
  if (!nonEmptyStringArray(artifact.childThreadIds)) issues.push("Desktop dogfood artifact is missing childThreadIds.");
  for (const scenario of REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_SCENARIOS) {
    if (!Array.isArray(artifact.scenarios) || !artifact.scenarios.includes(scenario)) {
      issues.push(`Desktop dogfood artifact must include ${scenario} scenario evidence.`);
    }
  }

  const checks = objectValue(artifact.checks);
  const collapsed = objectValue(checks.collapsed);
  const expanded = objectValue(checks.expanded);
  const narrow = objectValue(checks.narrow);
  if (collapsed.defaultCollapsed !== true) issues.push("Desktop dogfood collapsed state is not default-collapsed.");
  if (collapsed.horizontalOverflowFree !== true) issues.push("Desktop dogfood collapsed state has horizontal overflow.");
  if (expanded.defaultCollapsed !== false) issues.push("Desktop dogfood expanded state did not open the cluster.");
  if (expanded.horizontalOverflowFree !== true) issues.push("Desktop dogfood expanded state has horizontal overflow.");
  if (narrow.horizontalOverflowFree !== true) issues.push("Desktop dogfood narrow view has horizontal overflow.");
  if (narrow.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood narrow view reports ${narrow.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
  validateDesktopInlineChildTranscriptChecks(checks, issues);
  requireTrueFields(
    checks.expanded?.approvalFlow,
    "Desktop dogfood approvalFlow",
    [
      "approvalRequested",
      "approvalBlockedChild",
      "parentStillBlocked",
      "childIdentifierVisible",
      "toolScopeVisible",
      "approvalScopeVisible",
      "approvalPromptVisible",
      "approveButtonVisible",
      "denyButtonVisible",
      "approvalButtonsNameChild",
    ],
    issues,
  );
  requireTrueFields(
    checks.approvalDialog,
    "Desktop dogfood approvalDialog",
    [
      "dialogOpened",
      "dialogNamesApproval",
      "dialogNamesChildRun",
      "dialogNamesChildThread",
      "dialogNamesBlockingChild",
      "dialogShowsParentWaitState",
      "dialogShowsPrompt",
      "dialogShowsStandardScopes",
      "initialScopeThisAction",
    ],
    issues,
  );
  requireTrueFields(
    checks.workflowExecution,
    "Desktop dogfood workflowExecution",
    ["workflowSectionVisible", "parentBlockerVisible", "taskIdVisible", "artifactIdVisible", "horizontalOverflowFree"],
    issues,
  );
  requireTrueFields(
    checks.approvalForwarding,
    "Desktop dogfood approvalForwarding",
    [
      "forwardedVisible",
      "approvedDecisionVisible",
      "childThreadScopeVisible",
      "forwardedNamesChild",
      "forwardedNamesApproval",
      "forwardedMatchesApprovalChild",
      "approvalRequestMatchesApprovalChild",
      "forwardedAndRequestSameChild",
      "approvalRequestStillVisible",
      "approvalRequestActionsRemoved",
      "parentStillBlockedAfterForward",
      "childRowDataMatchesApprovalChild",
      "childRowStillBlocksApprovalChild",
      "childReturnedToNeedsSteering",
      "waitBarrierStillVisible",
      "horizontalOverflowFree",
    ],
    issues,
  );
  requireTrueFields(
    checks.chatExport?.approvalAuthorityContract,
    "Desktop dogfood approvalAuthorityContract",
    [
      "requestExported",
      "forwardedExported",
      "eventIdMatches",
      "schemaMatches",
      "childIdentityMatches",
      "requestedToolMatches",
      "requestedScopeThisAction",
      "requestEffectiveScopeNarrow",
      "forwardedEffectiveScopeChildThread",
      "parentBlockingResumeMatches",
      "forwardedParentBlockingResumeMatches",
      "waitBarrierMatches",
      "instructionPreservesBlocking",
    ],
    issues,
  );
  requireTrueFields(
    checks.localRuntimeOwnership,
    "Desktop dogfood localRuntimeOwnership",
    [
      "runtimeInventoryVisible",
      "activeLeaseVisible",
      "ownerLabelVisible",
      "stopDisabledVisible",
      "affectedSubagentVisible",
      "untrackedRuntimeVisible",
      "untrackedStopDisabledVisible",
      "untrackedRestartDisabledVisible",
      "untrackedExternalStopGuidanceVisible",
      "horizontalOverflowFree",
    ],
    issues,
  );
  requireTrueFields(
    checks.lifecycleEdgeVisibility,
    "Desktop dogfood lifecycleEdgeVisibility",
    [
      "clusterVisible",
      "clusterDefaultCollapsedBeforeOpen",
      "timeoutChildVisible",
      "partialChildVisible",
      "detachedChildVisible",
      "timeoutChoicesVisible",
      "partialDecisionVisible",
      "partialSummaryVisible",
      "detachDecisionVisible",
      "horizontalOverflowFree",
    ],
    issues,
  );
  requireTrueFields(
    checks.parentStopCascadeVisibility,
    "Desktop dogfood parentStopCascadeVisibility",
    [
      "parentMessageVisible",
      "clusterVisible",
      "clusterDefaultCollapsedBeforeOpen",
      "summaryVisible",
      "requiredChildCancelledVisible",
      "optionalChildDetachedVisible",
      "completedChildUnchangedVisible",
      "parentStoppedMailboxVisible",
      "parentCancellationRequestedVisible",
      "cancelledWaitBarrierVisible",
      "cancelledMailboxEventsVisible",
      "cascadeReasonVisible",
      "cascadeIdentityCaptured",
      "horizontalOverflowFree",
    ],
    issues,
  );
  requireTrueFields(
    checks.operatorBehavior,
    "Desktop dogfood operatorBehavior",
    [
      "completedChildClosed",
      "completedChildStillVisible",
      "completedChildControlsReleased",
      "attentionChildCancelled",
      "attentionChildStillVisible",
      "attentionCancelControlRemoved",
      "siblingStatePreserved",
      "lifecycleInterruptionVisible",
      "typedBarrierConsequenceVisible",
      "rowsStillInspectable",
      "horizontalOverflowFree",
    ],
    issues,
  );
  if (checks.workflowHighLoad?.workflowRowCount < 6) {
    issues.push(
      `Desktop dogfood workflowHighLoad workflowRowCount is ${checks.workflowHighLoad?.workflowRowCount ?? "missing"}; expected at least 6.`,
    );
  }
  for (const field of [
    "collapsedDesktopScreenshot",
    "expandedDesktopScreenshot",
    "approvalDialogScreenshot",
    "approvalForwardingDesktopScreenshot",
    "workflowHighLoadDesktopScreenshot",
    "lifecycleEdgeVisibilityDesktopScreenshot",
    "parentStopCascadeDesktopScreenshot",
    "localRuntimeOwnershipDesktopScreenshot",
    "expandedNarrowScreenshot",
    "operatorBehaviorDesktopScreenshot",
    "childTranscriptExpandedDesktopScreenshot",
    "completedChildTranscriptDesktopScreenshot",
    "deniedScopeExplanationDesktopScreenshot",
    "effectiveRoleSnapshotDesktopScreenshot",
    "multiClusterStressDesktopScreenshot",
    "mutatingWorkerDogfoodDesktopScreenshot",
    "patternGraphClickThroughDesktopScreenshot",
    "patternGraphCompletedClickThroughDesktopScreenshot",
    "restartRehydrationDesktopScreenshot",
    "workflowArtifactRehydrationDesktopScreenshot",
    "workflowExecutionDesktopScreenshot",
    "workflowRehydratedNavigationDesktopScreenshot",
    "chatExportZip",
    "accessibilitySnapshot",
  ]) {
    if (!safeRelativePath(artifact.artifacts?.[field])) {
      issues.push(`Desktop dogfood artifact ${field} must be a safe relative path.`);
    }
  }
  validatePassedAssertionObject(
    artifact.visualAssertions,
    REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_VISUAL_ASSERTIONS,
    "Desktop dogfood visual assertion",
    issues,
  );
  validatePassedAssertionObject(
    artifact.maturityAssertions,
    REQUIRED_DESKTOP_DOGFOOD_CONFIDENCE_MATURITY_ASSERTIONS,
    "Desktop dogfood maturity assertion",
    issues,
  );
  return { valid: issues.length === 0, issues };
}

function validateDesktopInlineChildTranscriptChecks(checks, issues) {
  const childTranscript = objectValue(checks.childTranscript);
  const completedChildTranscript = objectValue(checks.completedChildTranscript);
  requireTrueFields(
    childTranscript,
    "Desktop dogfood childTranscript",
    [
      "childExpanded",
      "transcriptPanelVisible",
      "liveTranscriptShellVisible",
      "liveTranscriptStreamVisible",
      "liveTranscriptStatusVisible",
      "miniThreadHeaderVisible",
      "miniThreadHeaderNamesChild",
      "openFullThreadActionVisible",
      "openFullThreadActionNamesChild",
      "liveTranscriptMessageCountVisible",
      "liveTranscriptRuntimeEventCountVisible",
      "liveTranscriptMessageCountMatchesBubbles",
      "liveTranscriptRuntimeEventCountPositive",
      "liveTranscriptModeLabelVisible",
      "runtimeEventRailVisible",
      "runtimeEventRailHasRecentEvents",
      "runtimeTimelineVisible",
      "runtimeTimelineCountVisible",
      "runtimeTimelineRenderedCountMatchesRows",
      "runtimeTimelineOmittedCountConsistent",
      "userMessageVisible",
      "assistantMessageVisible",
      "siblingSummaryNotLeakedIntoTranscript",
      "childRunIdVisible",
      "childThreadIdVisible",
      "liveContinuationMarkerVisible",
      "completionSummaryDeferredWhileLive",
      "transcriptEndStateCorrect",
      "summaryNotObscuringTranscript",
      "horizontalOverflowFree",
    ],
    issues,
  );
  if (childTranscript.childTranscriptTerminal !== false) {
    issues.push("Desktop dogfood childTranscript childTranscriptTerminal must be false while running.");
  }
  if (childTranscript.completionEndCapVisible !== false) {
    issues.push("Desktop dogfood childTranscript completionEndCapVisible must be false while running.");
  }
  if (!Number.isInteger(childTranscript.messageBubbleCount) || childTranscript.messageBubbleCount < 2) {
    issues.push(
      `Desktop dogfood childTranscript messageBubbleCount is ${childTranscript.messageBubbleCount ?? "missing"}; expected at least 2.`,
    );
  }
  if (!Number.isInteger(childTranscript.runtimeEventRows) || childTranscript.runtimeEventRows < 1) {
    issues.push(
      `Desktop dogfood childTranscript runtimeEventRows is ${childTranscript.runtimeEventRows ?? "missing"}; expected at least 1.`,
    );
  }
  if (childTranscript.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood childTranscript reports ${childTranscript.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }

  requireTrueFields(
    completedChildTranscript,
    "Desktop dogfood completedChildTranscript",
    [
      "childExpanded",
      "transcriptPanelVisible",
      "liveTranscriptShellVisible",
      "liveTranscriptStreamVisible",
      "liveTranscriptStatusVisible",
      "miniThreadHeaderVisible",
      "miniThreadHeaderNamesChild",
      "openFullThreadActionVisible",
      "openFullThreadActionNamesChild",
      "liveTranscriptMessageCountVisible",
      "liveTranscriptMessageCountMatchesBubbles",
      "liveTranscriptModeLabelVisible",
      "runtimeEventRailVisible",
      "runtimeEventRailHasRecentEvents",
      "runtimeTimelineVisible",
      "runtimeTimelineCountVisible",
      "runtimeTimelineRenderedCountMatchesRows",
      "runtimeTimelineOmittedCountConsistent",
      "assistantMessageVisible",
      "siblingSummaryNotLeakedIntoTranscript",
      "childRunIdVisible",
      "childThreadIdVisible",
      "childTranscriptTerminal",
      "childTranscriptSynthesisSafe",
      "completionEndCapVisible",
      "completionEndCapLabelVisible",
      "completionEndCapAfterMessages",
      "completionSummaryDeferredWhileLive",
      "transcriptEndStateCorrect",
      "summaryNotObscuringTranscript",
      "horizontalOverflowFree",
    ],
    issues,
  );
  if (completedChildTranscript.liveContinuationMarkerVisible !== false) {
    issues.push("Desktop dogfood completedChildTranscript liveContinuationMarkerVisible must be false after completion.");
  }
  if (!Number.isInteger(completedChildTranscript.messageBubbleCount) || completedChildTranscript.messageBubbleCount < 1) {
    issues.push(
      `Desktop dogfood completedChildTranscript messageBubbleCount is ${completedChildTranscript.messageBubbleCount ?? "missing"}; expected at least 1.`,
    );
  }
  if (completedChildTranscript.criticalOverlapCount !== 0) {
    issues.push(
      `Desktop dogfood completedChildTranscript reports ${completedChildTranscript.criticalOverlapCount ?? "missing"} critical overlaps.`,
    );
  }
  if (
    !nonEmptyString(completedChildTranscript.completionEndCapText) ||
    !completedChildTranscript.completionEndCapText.includes("Completion summary")
  ) {
    issues.push("Desktop dogfood completedChildTranscript completionEndCapText must include Completion summary.");
  }
}

function requireTrueFields(value, label, fields, issues) {
  const object = objectValue(value);
  for (const field of fields) {
    if (object[field] !== true) issues.push(`${label} ${field} is not true.`);
  }
}

function validatePassedAssertionObject(value, expectedIds, label, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${label}s are missing.`);
    return;
  }
  for (const id of expectedIds) {
    const assertion = value[id];
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      issues.push(`${label} ${id} is missing.`);
      continue;
    }
    if (assertion.status !== "passed") {
      issues.push(`${label} ${id} status is ${assertion.status ?? "missing"}; expected passed.`);
    }
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`${label} ${id} is missing readable evidence.`);
    }
  }
}
