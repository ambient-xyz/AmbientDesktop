import { REQUIRED_DESKTOP_MATURITY_ASSERTIONS, REQUIRED_DESKTOP_VISUAL_ASSERTIONS } from "./subagent-desktop-dogfood-evidence-contract.mjs";
import { nonEmptyString, nonEmptyStringArray, objectValue, safeRelativePath } from "./subagent-release-gate-validation-helpers.mjs";

export function summarizeDesktopVisualAssertions(visualAssertions) {
  if (!visualAssertions || typeof visualAssertions !== "object" || Array.isArray(visualAssertions)) return "missing";
  return REQUIRED_DESKTOP_VISUAL_ASSERTIONS.map((id) => `${id}:${visualAssertions[id]?.status ?? "missing"}`).join(", ");
}

export function validateDesktopVisualAssertions(visualAssertions, issues) {
  if (!visualAssertions || typeof visualAssertions !== "object" || Array.isArray(visualAssertions)) {
    issues.push("Desktop dogfood artifact is missing semantic visual assertions.");
    return;
  }

  for (const id of REQUIRED_DESKTOP_VISUAL_ASSERTIONS) {
    const assertion = visualAssertions[id];
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      issues.push(`Desktop dogfood visual assertion ${id} is missing.`);
      continue;
    }
    if (assertion.id !== id) {
      issues.push(`Desktop dogfood visual assertion ${id} has mismatched id ${assertion.id ?? "missing"}.`);
    }
    if (assertion.status !== "passed") {
      issues.push(`Desktop dogfood visual assertion ${id} status is ${assertion.status ?? "missing"}; expected passed.`);
    }
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`Desktop dogfood visual assertion ${id} is missing readable evidence.`);
    } else if (!assertion.evidence.every((entry) => typeof entry === "string" && /^passed: .+/.test(entry))) {
      issues.push(`Desktop dogfood visual assertion ${id} must record only passed evidence entries.`);
    }
    if (!Array.isArray(assertion.artifactRefs) || assertion.artifactRefs.length === 0) {
      issues.push(`Desktop dogfood visual assertion ${id} is missing artifactRefs.`);
    } else {
      for (const artifactRef of assertion.artifactRefs) {
        if (!safeRelativePath(artifactRef)) {
          issues.push(`Desktop dogfood visual assertion ${id} artifactRef must be a safe relative path.`);
          break;
        }
      }
    }
  }
}

export function summarizeDesktopMaturityAssertions(maturityAssertions) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) return "missing";
  return REQUIRED_DESKTOP_MATURITY_ASSERTIONS.map(
    (expected) => `${expected.id}:${maturityAssertions[expected.id]?.status ?? "missing"}`,
  ).join(", ");
}

export function validateDesktopMaturityAssertions(maturityAssertions, issues) {
  if (!maturityAssertions || typeof maturityAssertions !== "object" || Array.isArray(maturityAssertions)) {
    issues.push("Desktop dogfood artifact is missing maturityAssertions.");
    return;
  }

  for (const expected of REQUIRED_DESKTOP_MATURITY_ASSERTIONS) {
    const assertion = maturityAssertions[expected.id];
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing.`);
      continue;
    }
    if (assertion.id !== expected.id) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} has mismatched id ${assertion.id ?? "missing"}.`);
    }
    if (assertion.status !== "passed") {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} status is ${assertion.status ?? "missing"}; expected passed.`);
    }
    if (!nonEmptyStringArray(assertion.evidence)) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing readable evidence.`);
    } else if (!assertion.evidence.every((entry) => typeof entry === "string" && /^passed: .+/.test(entry))) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} must record only passed evidence entries.`);
    }
    if (!Array.isArray(assertion.artifactRefs) || assertion.artifactRefs.length === 0) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing artifactRefs.`);
    } else {
      for (const artifactRef of assertion.artifactRefs) {
        if (!safeRelativePath(artifactRef)) {
          issues.push(`Desktop dogfood maturity assertion ${expected.id} artifactRef must be a safe relative path.`);
          break;
        }
      }
    }
    const capabilities = Array.isArray(assertion.capabilities) ? assertion.capabilities : [];
    if (!capabilities.some(nonEmptyString)) {
      issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing capabilities.`);
    }
    for (const capability of expected.capabilities) {
      if (!capabilities.includes(capability)) {
        issues.push(`Desktop dogfood maturity assertion ${expected.id} is missing capability ${capability}.`);
      }
    }
  }
}

export function validateDesktopApprovalFlow(approvalFlow, issues) {
  if (!approvalFlow || typeof approvalFlow !== "object" || Array.isArray(approvalFlow)) {
    issues.push("Desktop dogfood expanded state is missing approvalFlow proof.");
    return;
  }
  for (const field of [
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
  ]) {
    if (approvalFlow[field] !== true) {
      issues.push(`Desktop dogfood approvalFlow ${field} is not true.`);
    }
  }
  if (!Number.isInteger(approvalFlow.approvalButtons) || approvalFlow.approvalButtons < 2) {
    issues.push(`Desktop dogfood approvalFlow approvalButtons is ${approvalFlow.approvalButtons ?? "missing"}; expected at least 2.`);
  }
}

export function validateDesktopApprovalForwarding(approvalForwarding, issues) {
  if (!approvalForwarding || typeof approvalForwarding !== "object" || Array.isArray(approvalForwarding)) {
    issues.push("Desktop dogfood artifact is missing approvalForwarding proof.");
    return;
  }
  for (const field of [
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
  ]) {
    if (approvalForwarding[field] !== true) {
      issues.push(`Desktop dogfood approvalForwarding ${field} is not true.`);
    }
  }
  if (approvalForwarding.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood approvalForwarding reports ${approvalForwarding.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

export function validateDesktopWorkflowExecution(workflowExecution, issues) {
  if (!workflowExecution || typeof workflowExecution !== "object" || Array.isArray(workflowExecution)) {
    issues.push("Desktop dogfood artifact is missing workflowExecution proof.");
    return;
  }
  for (const field of [
    "workflowSectionVisible",
    "taskVisible",
    "statusRunningVisible",
    "modeBlockingVisible",
    "sourceSymphonyVisible",
    "progressVisible",
    "telemetryVisible",
    "launchCardVisible",
    "parentThreadProvenanceVisible",
    "parentBlockerVisible",
    "mailboxBlockVisible",
    "taskIdVisible",
    "artifactIdVisible",
    "runIdVisible",
    "threadIdVisible",
    "pauseControlVisible",
    "cancelControlVisible",
    "openWorkflowThreadVisible",
    "horizontalOverflowFree",
  ]) {
    if (workflowExecution[field] !== true) {
      issues.push(`Desktop dogfood workflowExecution ${field} is not true.`);
    }
  }
  if (workflowExecution.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood workflowExecution reports ${workflowExecution.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

export function validateDesktopMutatingWorkerDogfood(mutatingWorkerDogfood, issues) {
  if (!mutatingWorkerDogfood || typeof mutatingWorkerDogfood !== "object" || Array.isArray(mutatingWorkerDogfood)) {
    issues.push("Desktop dogfood artifact is missing mutatingWorkerDogfood proof.");
    return;
  }
  for (const field of [
    "taskVisible",
    "statusSucceededVisible",
    "modeBackgroundVisible",
    "sourceSymphonyVisible",
    "childCallerVisible",
    "childRunVisible",
    "childThreadVisible",
    "approvalBridgeVisible",
    "isolatedWorktreeVisible",
    "nestedFanoutVisible",
    "mutatingWorkerLabelVisible",
    "stagedMutationVisible",
    "parentWorkspaceUnchangedVisible",
    "outputPreviewRetainedVisible",
    "artifactIdVisible",
    "runIdVisible",
    "threadIdVisible",
    "noPauseControlVisible",
    "noCancelControlVisible",
    "horizontalOverflowFree",
  ]) {
    if (mutatingWorkerDogfood[field] !== true) {
      issues.push(`Desktop dogfood mutatingWorkerDogfood ${field} is not true.`);
    }
  }
  if (mutatingWorkerDogfood.criticalOverlapCount !== 0) {
    issues.push(
      `Desktop dogfood mutatingWorkerDogfood reports ${mutatingWorkerDogfood.criticalOverlapCount ?? "missing"} critical overlaps.`,
    );
  }
}

export function validateDesktopWorkflowHighLoad(workflowHighLoad, issues) {
  if (!workflowHighLoad || typeof workflowHighLoad !== "object" || Array.isArray(workflowHighLoad)) {
    issues.push("Desktop dogfood artifact is missing workflowHighLoad proof.");
    return;
  }
  for (const field of [
    "workflowSectionVisible",
    "expectedWorkflowRowCountVisible",
    "allPresetLabelsVisible",
    "highLoadTaskIdsVisible",
    "highLoadArtifactIdsVisible",
    "highLoadRunIdsVisible",
    "highLoadThreadIdsVisible",
    "backgroundRowsVisible",
    "completedRowsVisible",
    "highLoadRowsHaveNoPauseCancel",
    "horizontalOverflowFree",
  ]) {
    if (workflowHighLoad[field] !== true) {
      issues.push(`Desktop dogfood workflowHighLoad ${field} is not true.`);
    }
  }
  if (!Number.isInteger(workflowHighLoad.workflowRowCount) || workflowHighLoad.workflowRowCount < 6) {
    issues.push(
      `Desktop dogfood workflowHighLoad workflowRowCount is ${workflowHighLoad.workflowRowCount ?? "missing"}; expected at least 6.`,
    );
  }
  if (workflowHighLoad.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood workflowHighLoad reports ${workflowHighLoad.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

export function validateDesktopDeniedScopeExplanation(deniedScopeExplanation, issues) {
  if (!deniedScopeExplanation || typeof deniedScopeExplanation !== "object" || Array.isArray(deniedScopeExplanation)) {
    issues.push("Desktop dogfood artifact is missing deniedScopeExplanation proof.");
    return;
  }
  for (const field of [
    "parentMailboxEventIdCaptured",
    "spawnFailureVisible",
    "approvalUnavailableVisible",
    "deniedCategoryVisible",
    "deniedToolVisible",
    "sourceChildVisible",
    "noInteractiveApprovalActions",
    "horizontalOverflowFree",
  ]) {
    if (deniedScopeExplanation[field] !== true) {
      issues.push(`Desktop dogfood deniedScopeExplanation ${field} is not true.`);
    }
  }
  if (deniedScopeExplanation.criticalOverlapCount !== 0) {
    issues.push(
      `Desktop dogfood deniedScopeExplanation reports ${deniedScopeExplanation.criticalOverlapCount ?? "missing"} critical overlaps.`,
    );
  }
}

export function validateDesktopLifecycleEdgeVisibility(lifecycleEdgeVisibility, issues) {
  if (!lifecycleEdgeVisibility || typeof lifecycleEdgeVisibility !== "object" || Array.isArray(lifecycleEdgeVisibility)) {
    issues.push("Desktop dogfood artifact is missing lifecycleEdgeVisibility proof.");
    return;
  }
  for (const field of [
    "parentMessageVisible",
    "clusterVisible",
    "clusterDefaultCollapsedBeforeOpen",
    "summaryVisible",
    "timeoutChildVisible",
    "partialChildVisible",
    "detachedChildVisible",
    "timeoutAttentionVisible",
    "timeoutChoicesVisible",
    "partialDecisionVisible",
    "partialSummaryVisible",
    "detachDecisionVisible",
    "detachedEffectVisible",
    "edgeIdentityCaptured",
    "horizontalOverflowFree",
  ]) {
    if (lifecycleEdgeVisibility[field] !== true) {
      issues.push(`Desktop dogfood lifecycleEdgeVisibility ${field} is not true.`);
    }
  }
  if (lifecycleEdgeVisibility.criticalOverlapCount !== 0) {
    issues.push(
      `Desktop dogfood lifecycleEdgeVisibility reports ${lifecycleEdgeVisibility.criticalOverlapCount ?? "missing"} critical overlaps.`,
    );
  }
}

export function validateDesktopMultiClusterStress(multiClusterStress, issues) {
  if (!multiClusterStress || typeof multiClusterStress !== "object" || Array.isArray(multiClusterStress)) {
    issues.push("Desktop dogfood artifact is missing multiClusterStress proof.");
    return;
  }
  for (const field of [
    "expectedClusterCountVisible",
    "allClustersDefaultCollapsed",
    "stressParentMessagesVisible",
    "stressSummariesVisible",
    "stressChildIdsCaptured",
    "stressClustersAfterParentMessages",
    "horizontalOverflowFree",
  ]) {
    if (multiClusterStress[field] !== true) {
      issues.push(`Desktop dogfood multiClusterStress ${field} is not true.`);
    }
  }
  if (!Number.isInteger(multiClusterStress.clusterCount) || multiClusterStress.clusterCount < 3) {
    issues.push(`Desktop dogfood multiClusterStress clusterCount is ${multiClusterStress.clusterCount ?? "missing"}; expected at least 3.`);
  }
  if (multiClusterStress.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood multiClusterStress reports ${multiClusterStress.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

export function validateDesktopRestartRehydration(restartRehydration, issues) {
  if (!restartRehydration || typeof restartRehydration !== "object" || Array.isArray(restartRehydration)) {
    issues.push("Desktop dogfood artifact is missing restartRehydration proof.");
    return;
  }
  for (const field of [
    "defaultCollapsedAfterRelaunch",
    "expandedAfterRelaunch",
    "parentMessageVisible",
    "approvalForwardedRehydrated",
    "approvalRequestRehydrated",
    "approvalActionsStillRemoved",
    "parentStillBlockedAfterRelaunch",
    "childBlockerRehydrated",
    "childRunIdRehydrated",
    "childThreadIdRehydrated",
    "completedChildResultSummaryRehydrated",
    "workflowTaskRehydrated",
    "workflowBlockerRehydrated",
    "workflowMailboxBlockRehydrated",
    "workflowArtifactRehydrated",
    "workflowRunRehydrated",
    "workflowThreadRehydrated",
    "mutatingWorkflowTaskRehydrated",
    "mutatingWorkflowArtifactRehydrated",
    "mutatingWorkflowRunRehydrated",
    "workflowHighLoadTasksRehydrated",
    "workflowHighLoadArtifactsRehydrated",
    "workflowHighLoadRunsRehydrated",
    "childRowsRehydrated",
    "horizontalOverflowFree",
  ]) {
    if (restartRehydration[field] !== true) {
      issues.push(`Desktop dogfood restartRehydration ${field} is not true.`);
    }
  }
  if (restartRehydration.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood restartRehydration reports ${restartRehydration.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

export function validateDesktopWorkflowRehydratedNavigation(workflowRehydratedNavigation, issues) {
  if (!workflowRehydratedNavigation || typeof workflowRehydratedNavigation !== "object" || Array.isArray(workflowRehydratedNavigation)) {
    issues.push("Desktop dogfood artifact is missing workflowRehydratedNavigation proof.");
    return;
  }
  for (const field of [
    "workflowAutomationPaneVisible",
    "workflowThreadHeaderVisible",
    "workflowThreadSidebarSelected",
    "workflowThreadTitleVisible",
    "workflowThreadFolderLinkPresent",
    "workflowThreadMatchesExpectedId",
    "legacyOrThreadPaneVisible",
    "navigationErrorAbsent",
    "horizontalOverflowFree",
  ]) {
    if (workflowRehydratedNavigation[field] !== true) {
      issues.push(`Desktop dogfood workflowRehydratedNavigation ${field} is not true.`);
    }
  }
  if (workflowRehydratedNavigation.criticalOverlapCount !== 0) {
    issues.push(
      `Desktop dogfood workflowRehydratedNavigation reports ${workflowRehydratedNavigation.criticalOverlapCount ?? "missing"} critical overlaps.`,
    );
  }
}

export function validateDesktopWorkflowArtifactRehydration(workflowArtifactRehydration, issues) {
  if (!workflowArtifactRehydration || typeof workflowArtifactRehydration !== "object" || Array.isArray(workflowArtifactRehydration)) {
    issues.push("Desktop dogfood artifact is missing workflowArtifactRehydration proof.");
    return;
  }
  for (const field of [
    "workflowBuildWorkspaceVisible",
    "sourcePanelSelected",
    "artifactTitleVisible",
    "activeWorkflowThreadVisible",
    "artifactIdMatchesLinkedThread",
    "runDetailLoaded",
    "sourcePathVisible",
    "statePathVisible",
    "sourceContentVisible",
    "sourceContentMatchesExpected",
    "noSourceReadError",
    "detailSourcePathMatches",
    "detailStatePathMatches",
    "horizontalOverflowFree",
  ]) {
    if (workflowArtifactRehydration[field] !== true) {
      issues.push(`Desktop dogfood workflowArtifactRehydration ${field} is not true.`);
    }
  }
  if (workflowArtifactRehydration.criticalOverlapCount !== 0) {
    issues.push(
      `Desktop dogfood workflowArtifactRehydration reports ${workflowArtifactRehydration.criticalOverlapCount ?? "missing"} critical overlaps.`,
    );
  }
}

export function validateDesktopLocalRuntimeOwnership(localRuntimeOwnership, issues) {
  if (!localRuntimeOwnership || typeof localRuntimeOwnership !== "object" || Array.isArray(localRuntimeOwnership)) {
    issues.push("Desktop dogfood artifact is missing localRuntimeOwnership proof.");
    return;
  }
  for (const field of [
    "settingsPanelVisible",
    "localModelsSectionVisible",
    "runtimeInventoryVisible",
    "activeLeaseVisible",
    "ownerLabelVisible",
    "managedRunningVisible",
    "localTextCapabilityVisible",
    "stopDisabledVisible",
    "restartDisabledVisible",
    "forceConsequenceVisible",
    "blockerLeaseVisible",
    "affectedSubagentVisible",
    "childRunIdVisible",
    "childThreadIdVisible",
    "runtimeIdVisible",
    "pidVisible",
    "endpointVisible",
    "ordinaryStopReasonVisible",
    "untrackedRuntimeVisible",
    "untrackedRuntimeIdVisible",
    "untrackedRuntimePidVisible",
    "untrackedRuntimeEndpointVisible",
    "untrackedRuntimeModelVisible",
    "untrackedStopDisabledVisible",
    "untrackedRestartDisabledVisible",
    "untrackedForceUnavailableVisible",
    "untrackedExternalStopGuidanceVisible",
    "untrackedGroupSafeVisible",
    "horizontalOverflowFree",
  ]) {
    if (localRuntimeOwnership[field] !== true) {
      issues.push(`Desktop dogfood localRuntimeOwnership ${field} is not true.`);
    }
  }
  if (localRuntimeOwnership.criticalOverlapCount !== 0) {
    issues.push(
      `Desktop dogfood localRuntimeOwnership reports ${localRuntimeOwnership.criticalOverlapCount ?? "missing"} critical overlaps.`,
    );
  }
}

export function validateDesktopOperatorControls(operatorControls, state, issues) {
  if (!operatorControls || typeof operatorControls !== "object" || Array.isArray(operatorControls)) {
    issues.push(`Desktop dogfood ${state} state is missing operatorControls proof.`);
    return;
  }
  for (const field of [
    "cancelActionVisible",
    "closeAttentionChildVisible",
    "closeCompletedChildVisible",
    "cancelScopedToAttentionChild",
    "noCancelForCompletedChild",
    "closeTitlesPreserveTranscripts",
    "controlsUseIconButtons",
    "controlsNameChild",
    "controlsNotDisabled",
  ]) {
    if (operatorControls[field] !== true) {
      issues.push(`Desktop dogfood ${state} operatorControls ${field} is not true.`);
    }
  }
  if (operatorControls.cancelButtons !== 1) {
    issues.push(`Desktop dogfood ${state} operatorControls cancelButtons is ${operatorControls.cancelButtons ?? "missing"}; expected 1.`);
  }
  if (operatorControls.closeButtons !== 2) {
    issues.push(`Desktop dogfood ${state} operatorControls closeButtons is ${operatorControls.closeButtons ?? "missing"}; expected 2.`);
  }
}

export function validateDesktopOperatorBehavior(operatorBehavior, issues) {
  if (!operatorBehavior || typeof operatorBehavior !== "object" || Array.isArray(operatorBehavior)) {
    issues.push("Desktop dogfood artifact is missing operatorBehavior proof.");
    return;
  }
  for (const field of [
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
  ]) {
    if (operatorBehavior[field] !== true) {
      issues.push(`Desktop dogfood operatorBehavior ${field} is not true.`);
    }
  }
  if (operatorBehavior.criticalOverlapCount !== 0) {
    issues.push(`Desktop dogfood operatorBehavior reports ${operatorBehavior.criticalOverlapCount ?? "missing"} critical overlaps.`);
  }
}

export function validateDesktopInlineChildTranscripts(checks, issues) {
  validateDesktopRunningChildTranscript(objectValue(checks.childTranscript), issues);
  validateDesktopCompletedChildTranscript(objectValue(checks.completedChildTranscript), issues);
}

function validateDesktopRunningChildTranscript(childTranscript, issues) {
  for (const field of [
    "childExpanded",
    "transcriptPanelVisible",
    "liveTranscriptShellVisible",
    "liveTranscriptStreamVisible",
    "liveTranscriptStatusVisible",
    "liveTranscriptMessageCountVisible",
    "liveTranscriptRuntimeEventCountVisible",
    "liveTranscriptMessageCountMatchesBubbles",
    "liveTranscriptRuntimeEventCountPositive",
    "runtimeEventRailVisible",
    "runtimeEventRailHasRecentEvents",
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
  ]) {
    if (childTranscript[field] !== true) {
      issues.push(`Desktop dogfood childTranscript ${field} is not true.`);
    }
  }
  if (childTranscript.childTranscriptTerminal !== false) {
    issues.push("Desktop dogfood childTranscript childTranscriptTerminal must be false while the child is running.");
  }
  if (childTranscript.completionEndCapVisible !== false) {
    issues.push("Desktop dogfood childTranscript completionEndCapVisible must be false while the child is running.");
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
}

function validateDesktopCompletedChildTranscript(completedChildTranscript, issues) {
  for (const field of [
    "childExpanded",
    "transcriptPanelVisible",
    "liveTranscriptShellVisible",
    "liveTranscriptStreamVisible",
    "liveTranscriptStatusVisible",
    "liveTranscriptMessageCountVisible",
    "liveTranscriptMessageCountMatchesBubbles",
    "assistantMessageVisible",
    "siblingSummaryNotLeakedIntoTranscript",
    "childRunIdVisible",
    "childThreadIdVisible",
    "childTranscriptTerminal",
    "childTranscriptSynthesisSafe",
    "completionEndCapVisible",
    "completionEndCapAfterMessages",
    "completionSummaryDeferredWhileLive",
    "transcriptEndStateCorrect",
    "summaryNotObscuringTranscript",
    "horizontalOverflowFree",
  ]) {
    if (completedChildTranscript[field] !== true) {
      issues.push(`Desktop dogfood completedChildTranscript ${field} is not true.`);
    }
  }
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

export function requireLabels(labels, expected, state, issues) {
  const labelMap = labels && typeof labels === "object" ? labels : {};
  for (const label of expected) {
    if (labelMap[label] !== true) {
      issues.push(`Desktop dogfood ${state} labels are missing ${label}.`);
    }
  }
}
