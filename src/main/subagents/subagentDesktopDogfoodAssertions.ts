import {
  SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE,
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS,
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT,
  type SubagentDesktopDogfoodSeedResult,
} from "./subagentDesktopDogfoodScenario";

export type DesktopVisualAssertionId =
  | "parent_child_placement"
  | "default_collapsed_state"
  | "inline_child_mini_thread_chrome"
  | "blocking_attention_indicators"
  | "approval_runtime_ownership_labels"
  | "denied_scope_explanations"
  | "layout_safety"
  | "mutating_worker_evidence"
  | "workflow_high_load"
  | "pattern_graph_runtime"
  | "workflow_artifact_rehydration"
  | "workflow_task_continuity"
  | "lifecycle_edge_visibility"
  | "parent_stop_cascade_visibility";

export interface DesktopVisualAssertionEvidence {
  id: DesktopVisualAssertionId;
  status: "passed" | "failed";
  evidence: string[];
  artifactRefs: string[];
}

export type DesktopMaturityAssertionId =
  | "desktop_child_visibility"
  | "desktop_approval_forwarding"
  | "desktop_denied_scope_explanations"
  | "desktop_workflow_execution"
  | "desktop_mutating_worker_dogfood"
  | "desktop_workflow_high_load"
  | "desktop_pattern_graph_runtime"
  | "desktop_workflow_artifact_rehydration"
  | "desktop_restart_rehydration"
  | "desktop_workflow_rehydrated_navigation"
  | "desktop_local_runtime_ownership"
  | "desktop_operator_controls"
  | "desktop_visual_layout_safety"
  | "desktop_multi_cluster_stress"
  | "desktop_lifecycle_edges"
  | "desktop_chat_export_child_bundle";

export interface DesktopMaturityAssertionEvidence {
  id: DesktopMaturityAssertionId;
  status: "passed" | "failed";
  capabilities: string[];
  evidence: string[];
  artifactRefs: string[];
}

export function buildDesktopVisualAssertions(input: {
  artifacts: Record<string, string>;
  checks: Record<string, unknown>;
  seeded?: SubagentDesktopDogfoodSeedResult;
}): Record<DesktopVisualAssertionId, DesktopVisualAssertionEvidence> {
  const collapsed = objectRecord(input.checks.collapsed);
  const expanded = objectRecord(input.checks.expanded);
  const narrow = objectRecord(input.checks.narrow);
  const approvalFlow = objectRecord(expanded.approvalFlow);
  const approvalForwarding = objectRecord(input.checks.approvalForwarding);
  const childTranscript = objectRecord(input.checks.childTranscript);
  const completedChildTranscript = objectRecord(input.checks.completedChildTranscript);
  const standaloneChildThread = objectRecord(input.checks.standaloneChildThread);
  const effectiveRoleSnapshot = objectRecord(input.checks.effectiveRoleSnapshot);
  const workflowExecution = objectRecord(input.checks.workflowExecution);
  const mutatingWorkerDogfood = objectRecord(input.checks.mutatingWorkerDogfood);
  const workflowHighLoad = objectRecord(input.checks.workflowHighLoad);
  const patternGraphRuntime = objectRecord(input.checks.patternGraphRuntime);
  const patternGraphClickThrough = objectRecord(input.checks.patternGraphClickThrough);
  const patternGraphCompletedClickThrough = objectRecord(input.checks.patternGraphCompletedClickThrough);
  const patternGraphKeyboardActivation = objectRecord(input.checks.patternGraphKeyboardActivation);
  const patternGraphApprovalBadgeDialog = objectRecord(input.checks.patternGraphApprovalBadgeDialog);
  const patternGraphOverflowExpansion = objectRecord(input.checks.patternGraphOverflowExpansion);
  const deniedScopeExplanation = objectRecord(input.checks.deniedScopeExplanation);
  const restartRehydration = objectRecord(input.checks.restartRehydration);
  const workflowRehydratedNavigation = objectRecord(input.checks.workflowRehydratedNavigation);
  const workflowArtifactRehydration = objectRecord(input.checks.workflowArtifactRehydration);
  const localRuntimeOwnership = objectRecord(input.checks.localRuntimeOwnership);
  const operatorBehavior = objectRecord(input.checks.operatorBehavior);
  const multiClusterStress = objectRecord(input.checks.multiClusterStress);
  const lifecycleEdgeVisibility = objectRecord(input.checks.lifecycleEdgeVisibility);
  const lifecycleTimeoutChildTranscript = objectRecord(input.checks.lifecycleTimeoutChildTranscript);
  const lifecyclePartialChildTranscript = objectRecord(input.checks.lifecyclePartialChildTranscript);
  const parentStopCascadeVisibility = objectRecord(input.checks.parentStopCascadeVisibility);
  const parentStopRequiredChildTranscript = objectRecord(input.checks.parentStopRequiredChildTranscript);
  const parentStopBackgroundChildTranscript = objectRecord(input.checks.parentStopBackgroundChildTranscript);
  const parentStopCompletedChildTranscript = objectRecord(input.checks.parentStopCompletedChildTranscript);
  const expectedClusterCount = 3 + (input.seeded?.stressParentMessageIds.length ?? 0);

  return {
    parent_child_placement: visualAssertion(
      "parent_child_placement",
      [
        ["primary child cluster rendered with stress clusters", collapsed.clusterCount === expectedClusterCount],
        ["primary child cluster follows the spawning parent message", collapsed.clusterAfterParentMessage === true],
        ["primary child cluster is vertically below the parent message", collapsed.clusterBelowParentMessage === true],
        ["stress clusters follow their spawning parent messages", multiClusterStress.stressClustersAfterParentMessages === true],
        ["expanded child transcript stays attached below its child row", childTranscript.summaryNotObscuringTranscript === true],
        ["expanded child transcript end marker clears the composer", childTranscript.transcriptEndClearsComposer === true],
        [
          "expanded child transcript uses live shell and stream lane",
          childTranscript.liveTranscriptShellVisible === true && childTranscript.liveTranscriptStreamVisible === true,
        ],
        ["completed child transcript stays attached below its child row", completedChildTranscript.summaryNotObscuringTranscript === true],
        ["completed child transcript end cap clears the composer", completedChildTranscript.transcriptEndClearsComposer === true],
        ["completed child terminal summary follows the transcript", completedChildTranscript.completionEndCapAfterMessages === true],
        [
          "pattern graph child click-through opens the attached transcript",
          patternGraphClickThrough.summaryNotObscuringTranscript === true,
        ],
        ["pattern graph child click-through clears the composer", patternGraphClickThrough.transcriptEndClearsComposer === true],
        [
          "pattern graph completed child click-through opens the attached transcript",
          patternGraphCompletedClickThrough.summaryNotObscuringTranscript === true,
        ],
        [
          "pattern graph completed child click-through clears the composer",
          patternGraphCompletedClickThrough.transcriptEndClearsComposer === true,
        ],
        [
          "pattern graph keyboard activation opens the attached transcript",
          patternGraphKeyboardActivation.summaryNotObscuringTranscript === true,
        ],
        ["pattern graph keyboard activation clears the composer", patternGraphKeyboardActivation.transcriptEndClearsComposer === true],
        [
          "timed-out lifecycle child transcript stays attached below its child row",
          lifecycleTimeoutChildTranscript.summaryNotObscuringTranscript === true,
        ],
        [
          "partial lifecycle child transcript stays attached below its child row",
          lifecyclePartialChildTranscript.summaryNotObscuringTranscript === true,
        ],
        [
          "terminal lifecycle child transcripts clear the composer",
          lifecycleTimeoutChildTranscript.transcriptEndClearsComposer === true &&
            lifecyclePartialChildTranscript.transcriptEndClearsComposer === true,
        ],
        [
          "parent-stop required child transcript stays attached below its child row",
          parentStopRequiredChildTranscript.summaryNotObscuringTranscript === true,
        ],
        [
          "parent-stop background child transcript stays attached below its child row",
          parentStopBackgroundChildTranscript.summaryNotObscuringTranscript === true,
        ],
        [
          "parent-stop completed child transcript stays attached below its child row",
          parentStopCompletedChildTranscript.summaryNotObscuringTranscript === true,
        ],
        [
          "parent-stop child transcripts clear the composer",
          parentStopRequiredChildTranscript.transcriptEndClearsComposer === true &&
            parentStopBackgroundChildTranscript.transcriptEndClearsComposer === true &&
            parentStopCompletedChildTranscript.transcriptEndClearsComposer === true,
        ],
        [
          "pattern graph overflow expansion reveals grouped children",
          patternGraphOverflowExpansion.panelVisible === true && patternGraphOverflowExpansion.groupedChildVisible === true,
        ],
        [
          "child inspector shows persisted effective role snapshot",
          effectiveRoleSnapshot.effectiveRoleVisible === true && effectiveRoleSnapshot.overlaysVisible === true,
        ],
        [
          "parent and child thread ids are captured in the report",
          Boolean(input.seeded?.parentThreadId && input.seeded.childThreadIds.length),
        ],
      ],
      [
        input.artifacts.collapsedDesktopScreenshot,
        input.artifacts.expandedDesktopScreenshot,
        input.artifacts.childTranscriptExpandedDesktopScreenshot,
        input.artifacts.completedChildTranscriptDesktopScreenshot,
        input.artifacts.patternGraphClickThroughDesktopScreenshot,
        input.artifacts.patternGraphCompletedClickThroughDesktopScreenshot,
        input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
        input.artifacts.lifecycleTimeoutChildTranscriptDesktopScreenshot,
        input.artifacts.lifecyclePartialChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopRequiredChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopBackgroundChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopCompletedChildTranscriptDesktopScreenshot,
        input.artifacts.patternGraphOverflowExpandedDesktopScreenshot,
        input.artifacts.effectiveRoleSnapshotDesktopScreenshot,
        input.artifacts.multiClusterStressDesktopScreenshot,
      ],
    ),
    default_collapsed_state: visualAssertion(
      "default_collapsed_state",
      [
        ["new child cluster is collapsed before interaction", collapsed.defaultCollapsed === true],
        ["stress clusters are collapsed before interaction", multiClusterStress.allClustersDefaultCollapsed === true],
        ["collapsed summary names sub-agent threads", labelVisible(collapsed, "Sub-agent threads")],
        ["collapsed summary names child count", labelVisible(collapsed, "2 children")],
        ["stress summaries name their child counts", multiClusterStress.stressSummariesVisible === true],
        [
          "expanded state opens without losing the cluster set",
          expanded.defaultCollapsed === false && expanded.clusterCount === expectedClusterCount,
        ],
        ["child transcript expands only after explicit child disclosure interaction", childTranscript.childExpanded === true],
        [
          "completed child transcript expands only after explicit child disclosure interaction",
          completedChildTranscript.childExpanded === true,
        ],
      ],
      [
        input.artifacts.collapsedDesktopScreenshot,
        input.artifacts.expandedDesktopScreenshot,
        input.artifacts.childTranscriptExpandedDesktopScreenshot,
        input.artifacts.completedChildTranscriptDesktopScreenshot,
        input.artifacts.multiClusterStressDesktopScreenshot,
      ],
    ),
    inline_child_mini_thread_chrome: visualAssertion(
      "inline_child_mini_thread_chrome",
      [
        ["running child transcript renders a child-thread header", childTranscript.miniThreadHeaderVisible === true],
        ["running child child-thread header names the child", childTranscript.miniThreadHeaderNamesChild === true],
        [
          "running child exposes an Open full thread action",
          childTranscript.openFullThreadActionVisible === true && childTranscript.openFullThreadActionNamesChild === true,
        ],
        ["running child shows live child run mode", childTranscript.liveTranscriptModeLabelVisible === true],
        [
          "running child shows parent-style live activity",
          childTranscript.liveChildActivityVisible === true &&
            childTranscript.liveChildActivityUsesParentChrome === true &&
            childTranscript.liveChildActivityHasLines === true,
        ],
        [
          "running child activity count matches transcript data",
          childTranscript.liveTranscriptActivityCountVisible === true && childTranscript.liveChildActivityCountMatchesShell === true,
        ],
        [
          "running child renders parent-style tool cards",
          childTranscript.toolCardVisible === true &&
            childTranscript.toolCardUsesParentChrome === true &&
            childTranscript.childRendererUsesToolCards === true,
        ],
        [
          "running child tool-card count matches transcript data",
          childTranscript.liveTranscriptToolCardCountVisible === true && childTranscript.toolCardCountMatchesData === true,
        ],
        [
          "running child renders a runtime timeline title and count",
          childTranscript.runtimeTimelineVisible === true && childTranscript.runtimeTimelineCountVisible === true,
        ],
        ["running child runtime timeline count matches rendered rows", childTranscript.runtimeTimelineRenderedCountMatchesRows === true],
        [
          "running child renders parent-to-child mailbox timeline",
          childTranscript.childMailboxTimelineVisible === true && childTranscript.childMailboxTimelineHasParentFollowup === true,
        ],
        [
          "running child mailbox timeline count matches rendered rows",
          childTranscript.childMailboxTimelineRenderedCountMatchesRows === true,
        ],
        ["completed child transcript renders a child-thread header", completedChildTranscript.miniThreadHeaderVisible === true],
        ["completed child child-thread header names the child", completedChildTranscript.miniThreadHeaderNamesChild === true],
        [
          "completed child exposes an Open full thread action",
          completedChildTranscript.openFullThreadActionVisible === true && completedChildTranscript.openFullThreadActionNamesChild === true,
        ],
        ["completed child shows terminal end-cap mode", completedChildTranscript.liveTranscriptModeLabelVisible === true],
        [
          "completed child renders a runtime timeline before the end cap",
          completedChildTranscript.runtimeTimelineVisible === true && completedChildTranscript.runtimeTimelineCountVisible === true,
        ],
        [
          "completed child terminal end cap is labeled as a completion summary",
          completedChildTranscript.completionEndCapLabelVisible === true,
        ],
        [
          "pattern graph click-through preserves the child-thread header",
          patternGraphClickThrough.miniThreadHeaderVisible === true && patternGraphClickThrough.miniThreadHeaderNamesChild === true,
        ],
        [
          "pattern graph completed click-through preserves terminal child-thread chrome",
          patternGraphCompletedClickThrough.miniThreadHeaderVisible === true &&
            patternGraphCompletedClickThrough.completionEndCapLabelVisible === true,
        ],
        [
          "pattern graph keyboard activation preserves the child-thread header",
          patternGraphKeyboardActivation.miniThreadHeaderVisible === true &&
            patternGraphKeyboardActivation.miniThreadHeaderNamesChild === true,
        ],
        [
          "standalone child thread shows parent blocking banner",
          standaloneChildThread.parentBarrierVisible === true && standaloneChildThread.parentBarrierLabelVisible === true,
        ],
        [
          "standalone child thread exposes parent navigation",
          standaloneChildThread.parentOpenActionVisible === true && standaloneChildThread.parentThreadIdVisible === true,
        ],
        [
          "standalone child thread keeps transcript visible",
          standaloneChildThread.transcriptVisible === true && standaloneChildThread.childAssistantVisible === true,
        ],
        [
          "standalone child thread shows transcript before run details",
          standaloneChildThread.transcriptPrecedesInspector === true &&
            standaloneChildThread.transcriptVerticallyPrecedesInspector === true,
        ],
        [
          "standalone child run details stay collapsed below transcript",
          standaloneChildThread.inspectorCollapsedByDefault === true && standaloneChildThread.transcriptInspectorOverlapFree === true,
        ],
      ],
      [
        input.artifacts.childTranscriptExpandedDesktopScreenshot,
        input.artifacts.completedChildTranscriptDesktopScreenshot,
        input.artifacts.patternGraphClickThroughDesktopScreenshot,
        input.artifacts.patternGraphCompletedClickThroughDesktopScreenshot,
        input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
        input.artifacts.standaloneChildThreadDesktopScreenshot,
      ],
    ),
    blocking_attention_indicators: visualAssertion(
      "blocking_attention_indicators",
      [
        ["collapsed summary shows active blocking work", labelVisible(collapsed, "1 blocking")],
        ["collapsed summary shows workflow blocking work", labelVisible(collapsed, "1 workflow blocked")],
        ["collapsed summary shows attention state", labelVisible(collapsed, "1 attention")],
        ["expanded child row shows approval blocker", labelVisible(expanded, "Blocking: approval")],
        ["expanded workflow row shows workflow blocker", labelVisible(expanded, "Blocking: workflow work")],
        ["parent wait row stays visible", labelVisible(expanded, "Waiting on child")],
        ["warning tone is present for attention/blocking state", Number(expanded.warningToneCount) > 0],
      ],
      [
        input.artifacts.collapsedDesktopScreenshot,
        input.artifacts.expandedDesktopScreenshot,
        input.artifacts.workflowExecutionDesktopScreenshot,
      ],
    ),
    approval_runtime_ownership_labels: visualAssertion(
      "approval_runtime_ownership_labels",
      [
        ["approval prompt identifies the child", approvalFlow.childIdentifierVisible === true],
        ["pattern graph approval badge opens the parent approval dialog", patternGraphApprovalBadgeDialog.dialogOpened === true],
        [
          "pattern graph approval dialog preserves child identity",
          patternGraphApprovalBadgeDialog.dialogNamesChildRun === true && patternGraphApprovalBadgeDialog.dialogNamesChildThread === true,
        ],
        ["approval prompt shows requested tool scope", approvalFlow.toolScopeVisible === true],
        ["approval forwarding keeps child attribution", approvalForwarding.forwardedNamesChild === true],
        [
          "approval forwarding names the same child run/thread/path as the request",
          approvalForwarding.forwardedAndRequestSameChild === true,
        ],
        ["post-forwarding child row still points at the approval child", approvalForwarding.childRowDataMatchesApprovalChild === true],
        ["approval forwarding shows child-thread scoped persistence", approvalForwarding.childScopedPersistenceVisible === true],
        ["approval forwarding shows parent resumes waiting", approvalForwarding.parentResumeAfterApprovalVisible === true],
        ["runtime catalog names the owning sub-agent", localRuntimeOwnership.ownerLabelVisible === true],
        ["ordinary Stop is disabled while the child owns the runtime", localRuntimeOwnership.stopDisabledVisible === true],
        ["forced runtime action consequence is visible", localRuntimeOwnership.forceConsequenceVisible === true],
        ["affected sub-agent is listed in runtime ownership UI", localRuntimeOwnership.affectedSubagentVisible === true],
        ["untracked runtime is visible in the local model catalog", localRuntimeOwnership.untrackedRuntimeVisible === true],
        [
          "untracked runtime has disabled ordinary controls",
          localRuntimeOwnership.untrackedStopDisabledVisible === true && localRuntimeOwnership.untrackedRestartDisabledVisible === true,
        ],
        ["untracked runtime force termination is unavailable", localRuntimeOwnership.untrackedForceUnavailableVisible === true],
      ],
      [
        input.artifacts.approvalDialogScreenshot,
        input.artifacts.patternGraphApprovalBadgeDialogScreenshot,
        input.artifacts.approvalForwardingDesktopScreenshot,
        input.artifacts.localRuntimeOwnershipDesktopScreenshot,
      ],
    ),
    denied_scope_explanations: visualAssertion(
      "denied_scope_explanations",
      [
        ["denied child scope mailbox row is visible", deniedScopeExplanation.spawnFailureVisible === true],
        ["approval-unavailable reason is visible", deniedScopeExplanation.approvalUnavailableVisible === true],
        ["denied connector category is visible", deniedScopeExplanation.deniedCategoryVisible === true],
        ["denied connector tool is visible", deniedScopeExplanation.deniedToolVisible === true],
        ["denied child identity is visible", deniedScopeExplanation.sourceChildVisible === true],
        ["denied non-interactive launch exposes no approval actions", deniedScopeExplanation.noInteractiveApprovalActions === true],
      ],
      [input.artifacts.deniedScopeExplanationDesktopScreenshot, input.artifacts.expandedDesktopScreenshot],
    ),
    mutating_worker_evidence: visualAssertion(
      "mutating_worker_evidence",
      [
        ["mutating workflow task id is captured in the seed", Boolean(input.seeded?.mutatingWorkflowTaskId)],
        ["mutating workflow artifact id is captured in the seed", Boolean(input.seeded?.mutatingWorkflowArtifactId)],
        ["mutating workflow run id is captured in the seed", Boolean(input.seeded?.mutatingWorkflowRunId)],
        ["mutating workflow is visible in the parent cluster", mutatingWorkerDogfood.taskVisible === true],
        [
          "mutating workflow succeeded as a background task",
          mutatingWorkerDogfood.statusSucceededVisible === true && mutatingWorkerDogfood.modeBackgroundVisible === true,
        ],
        [
          "mutating workflow names the child caller",
          mutatingWorkerDogfood.childCallerVisible === true && mutatingWorkerDogfood.childRunVisible === true,
        ],
        ["mutating workflow shows child bridge approval", mutatingWorkerDogfood.approvalBridgeVisible === true],
        ["mutating workflow shows active isolated worktree evidence", mutatingWorkerDogfood.isolatedWorktreeVisible === true],
        ["mutating workflow shows nested fanout grant", mutatingWorkerDogfood.nestedFanoutVisible === true],
        ["mutating workflow shows staged output path", mutatingWorkerDogfood.stagedMutationVisible === true],
        ["mutating workflow shows parent workspace unchanged", mutatingWorkerDogfood.parentWorkspaceUnchangedVisible === true],
        ["mutating workflow shows retained output preview", mutatingWorkerDogfood.outputPreviewRetainedVisible === true],
        ["mutating workflow remains rehydrated after restart", restartRehydration.mutatingWorkflowTaskRehydrated === true],
      ],
      [input.artifacts.mutatingWorkerDogfoodDesktopScreenshot, input.artifacts.restartRehydrationDesktopScreenshot],
    ),
    workflow_high_load: visualAssertion(
      "workflow_high_load",
      [
        ["high-load workflow task ids are captured in the seed", (input.seeded?.workflowHighLoadTaskIds.length ?? 0) >= 4],
        ["all six Symphony presets are visible in the workflow cluster", workflowHighLoad.allPresetLabelsVisible === true],
        ["high-load workflow task ids are visible", workflowHighLoad.highLoadTaskIdsVisible === true],
        ["high-load workflow artifact ids are visible", workflowHighLoad.highLoadArtifactIdsVisible === true],
        ["high-load workflow run ids are visible", workflowHighLoad.highLoadRunIdsVisible === true],
        ["high-load workflow thread ids are visible", workflowHighLoad.highLoadThreadIdsVisible === true],
        [
          "high-load workflow rows are completed background tasks",
          workflowHighLoad.backgroundRowsVisible === true && workflowHighLoad.completedRowsVisible === true,
        ],
        [
          "high-load workflow rows do not expose pause or cancel controls after completion",
          workflowHighLoad.highLoadRowsHaveNoPauseCancel === true,
        ],
        ["high-load workflow rows rehydrate after restart", restartRehydration.workflowHighLoadTasksRehydrated === true],
      ],
      [input.artifacts.workflowHighLoadDesktopScreenshot, input.artifacts.restartRehydrationDesktopScreenshot],
    ),
    pattern_graph_runtime: visualAssertion(
      "pattern_graph_runtime",
      [
        ["parent thread renders six persisted pattern graphs", patternGraphRuntime.graphCountVisible === true],
        ["all Symphony pattern graph labels are visible", patternGraphRuntime.allPatternGraphsVisible === true],
        ["pattern graph nodes carry workflow task runtime ids", patternGraphRuntime.runtimeTaskBindingsVisible === true],
        ["pattern graph nodes carry workflow run runtime ids", patternGraphRuntime.runtimeRunBindingsVisible === true],
        ["Map-Reduce graph binds to the review child thread", patternGraphRuntime.childBindingVisible === true],
        ["Map-Reduce child node advertises click-through", patternGraphRuntime.childClickThroughAdvertised === true],
        ["Map-Reduce child node advertises keyboard activation", patternGraphRuntime.childKeyboardOpenAdvertised === true],
        [
          "Map-Reduce child node opens the inline child transcript",
          patternGraphClickThrough.childExpanded === true && patternGraphClickThrough.transcriptPanelVisible === true,
        ],
        [
          "Map-Reduce child node opens from keyboard activation",
          patternGraphKeyboardActivation.childExpanded === true && patternGraphKeyboardActivation.transcriptPanelVisible === true,
        ],
        ["Map-Reduce approval badge advertises parent approval opening", patternGraphRuntime.approvalBadgeOpenAdvertised === true],
        [
          "Map-Reduce approval badge opens the parent approval dialog",
          patternGraphApprovalBadgeDialog.dialogOpened === true && patternGraphApprovalBadgeDialog.dialogNamesApproval === true,
        ],
        ["Map-Reduce graph binds to the completed reducer child thread", patternGraphRuntime.completedChildBindingVisible === true],
        ["Map-Reduce reducer node advertises click-through", patternGraphRuntime.completedChildClickThroughAdvertised === true],
        ["Map-Reduce reducer node advertises keyboard activation", patternGraphRuntime.completedChildKeyboardOpenAdvertised === true],
        [
          "Map-Reduce reducer node opens the terminal child transcript",
          patternGraphCompletedClickThrough.childExpanded === true && patternGraphCompletedClickThrough.completionEndCapVisible === true,
        ],
        [
          "Map-Reduce overflow node advertises expansion",
          patternGraphRuntime.overflowNodeVisible === true && patternGraphRuntime.overflowNodeExpandableAdvertised === true,
        ],
        [
          "Map-Reduce overflow expansion reveals grouped child identity",
          patternGraphOverflowExpansion.panelVisible === true && patternGraphOverflowExpansion.groupedChildIdentityVisible === true,
        ],
        [
          "blocking and approval badges are visible on graph evidence",
          patternGraphRuntime.blockingBadgeVisible === true && patternGraphRuntime.approvalBadgeVisible === true,
        ],
        [
          "blocking and approval badges are visible on graph nodes",
          patternGraphRuntime.nodeBlockingBadgeVisible === true && patternGraphRuntime.nodeApprovalBadgeVisible === true,
        ],
        ["blocking graph edges expose live runtime status", patternGraphRuntime.blockingEdgeVisible === true],
        ["pattern graphs rehydrate after restart", restartRehydration.patternGraphsRehydrated === true],
        ["pattern graph child binding rehydrates after restart", restartRehydration.patternGraphChildBindingRehydrated === true],
        ["pattern graph runtime bindings rehydrate after restart", restartRehydration.patternGraphRuntimeBindingsRehydrated === true],
      ],
      [
        input.artifacts.expandedDesktopScreenshot,
        input.artifacts.patternGraphClickThroughDesktopScreenshot,
        input.artifacts.patternGraphCompletedClickThroughDesktopScreenshot,
        input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
        input.artifacts.patternGraphOverflowExpandedDesktopScreenshot,
        input.artifacts.patternGraphApprovalBadgeDialogScreenshot,
        input.artifacts.restartRehydrationDesktopScreenshot,
      ],
    ),
    layout_safety: visualAssertion(
      "layout_safety",
      [
        ["collapsed desktop view has no horizontal overflow", collapsed.horizontalOverflowFree === true],
        ["expanded desktop view has no horizontal overflow", expanded.horizontalOverflowFree === true],
        ["workflow view has no horizontal overflow", workflowExecution.horizontalOverflowFree === true],
        ["mutating worker view has no horizontal overflow", mutatingWorkerDogfood.horizontalOverflowFree === true],
        ["workflow high-load view has no horizontal overflow", workflowHighLoad.horizontalOverflowFree === true],
        ["pattern graph view has no horizontal overflow", patternGraphRuntime.horizontalOverflowFree === true],
        ["pattern graph overflow expansion has no horizontal overflow", patternGraphOverflowExpansion.horizontalOverflowFree === true],
        ["standalone child thread has no horizontal overflow", standaloneChildThread.horizontalOverflowFree === true],
        ["denied-scope view has no horizontal overflow", deniedScopeExplanation.horizontalOverflowFree === true],
        ["lifecycle edge view has no horizontal overflow", lifecycleEdgeVisibility.horizontalOverflowFree === true],
        ["lifecycle timeout child transcript has no horizontal overflow", lifecycleTimeoutChildTranscript.horizontalOverflowFree === true],
        ["lifecycle partial child transcript has no horizontal overflow", lifecyclePartialChildTranscript.horizontalOverflowFree === true],
        ["parent-stop cascade view has no horizontal overflow", parentStopCascadeVisibility.horizontalOverflowFree === true],
        [
          "parent-stop required child transcript has no horizontal overflow",
          parentStopRequiredChildTranscript.horizontalOverflowFree === true,
        ],
        [
          "parent-stop background child transcript has no horizontal overflow",
          parentStopBackgroundChildTranscript.horizontalOverflowFree === true,
        ],
        [
          "parent-stop completed child transcript has no horizontal overflow",
          parentStopCompletedChildTranscript.horizontalOverflowFree === true,
        ],
        ["restart view has no horizontal overflow", restartRehydration.horizontalOverflowFree === true],
        ["runtime ownership view has no horizontal overflow", localRuntimeOwnership.horizontalOverflowFree === true],
        ["multi-cluster stress view has no horizontal overflow", multiClusterStress.horizontalOverflowFree === true],
        ["multi-cluster stress view has no critical overlap", multiClusterStress.criticalOverlapCount === 0],
        ["mutating worker view has no critical overlap", mutatingWorkerDogfood.criticalOverlapCount === 0],
        ["workflow high-load view has no critical overlap", workflowHighLoad.criticalOverlapCount === 0],
        ["pattern graph view has no critical overlap", patternGraphRuntime.criticalOverlapCount === 0],
        ["pattern graph overflow expansion has no critical overlap", patternGraphOverflowExpansion.criticalOverlapCount === 0],
        [
          "standalone child thread has no critical overlap",
          standaloneChildThread.criticalOverlapCount === 0 && standaloneChildThread.transcriptInspectorOverlapFree === true,
        ],
        ["denied-scope view has no critical overlap", deniedScopeExplanation.criticalOverlapCount === 0],
        ["lifecycle edge view has no critical overlap", lifecycleEdgeVisibility.criticalOverlapCount === 0],
        ["lifecycle timeout child transcript has no critical overlap", lifecycleTimeoutChildTranscript.criticalOverlapCount === 0],
        ["lifecycle partial child transcript has no critical overlap", lifecyclePartialChildTranscript.criticalOverlapCount === 0],
        ["parent-stop cascade view has no critical overlap", parentStopCascadeVisibility.criticalOverlapCount === 0],
        ["parent-stop required child transcript has no critical overlap", parentStopRequiredChildTranscript.criticalOverlapCount === 0],
        ["parent-stop background child transcript has no critical overlap", parentStopBackgroundChildTranscript.criticalOverlapCount === 0],
        ["parent-stop completed child transcript has no critical overlap", parentStopCompletedChildTranscript.criticalOverlapCount === 0],
        ["narrow view has no horizontal overflow", narrow.horizontalOverflowFree === true],
        ["narrow view has no critical overlap", narrow.criticalOverlapCount === 0],
        ["operator post-action view has no critical overlap", operatorBehavior.criticalOverlapCount === 0],
        ["expanded child transcript has no critical overlap", childTranscript.criticalOverlapCount === 0],
        ["completed child transcript has no critical overlap", completedChildTranscript.criticalOverlapCount === 0],
        ["expanded child transcript end marker clears composer", childTranscript.transcriptEndClearsComposer === true],
        ["completed child transcript end cap clears composer", completedChildTranscript.transcriptEndClearsComposer === true],
        ["pattern graph child transcript end marker clears composer", patternGraphClickThrough.transcriptEndClearsComposer === true],
        [
          "pattern graph completed child transcript end cap clears composer",
          patternGraphCompletedClickThrough.transcriptEndClearsComposer === true,
        ],
        [
          "pattern graph keyboard child transcript end marker clears composer",
          patternGraphKeyboardActivation.transcriptEndClearsComposer === true,
        ],
        [
          "expanded child transcript stream and runtime rail are laid out",
          childTranscript.liveTranscriptStreamVisible === true && childTranscript.runtimeEventRailVisible === true,
        ],
        [
          "completed child transcript stream and terminal end cap are laid out",
          completedChildTranscript.liveTranscriptStreamVisible === true && completedChildTranscript.completionEndCapVisible === true,
        ],
        [
          "timed-out child transcript stream and terminal end cap are laid out",
          lifecycleTimeoutChildTranscript.liveTranscriptStreamVisible === true &&
            lifecycleTimeoutChildTranscript.completionEndCapVisible === true,
        ],
        [
          "partial child transcript stream and terminal end cap are laid out",
          lifecyclePartialChildTranscript.liveTranscriptStreamVisible === true &&
            lifecyclePartialChildTranscript.completionEndCapVisible === true,
        ],
        [
          "parent-stop required child transcript stream and terminal end cap are laid out",
          parentStopRequiredChildTranscript.liveTranscriptStreamVisible === true &&
            parentStopRequiredChildTranscript.completionEndCapVisible === true,
        ],
        [
          "parent-stop background child transcript stream and terminal end cap are laid out",
          parentStopBackgroundChildTranscript.liveTranscriptStreamVisible === true &&
            parentStopBackgroundChildTranscript.completionEndCapVisible === true,
        ],
        [
          "parent-stop completed child transcript stream and terminal end cap are laid out",
          parentStopCompletedChildTranscript.liveTranscriptStreamVisible === true &&
            parentStopCompletedChildTranscript.completionEndCapVisible === true,
        ],
      ],
      [
        input.artifacts.collapsedDesktopScreenshot,
        input.artifacts.expandedDesktopScreenshot,
        input.artifacts.childTranscriptExpandedDesktopScreenshot,
        input.artifacts.completedChildTranscriptDesktopScreenshot,
        input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
        input.artifacts.patternGraphOverflowExpandedDesktopScreenshot,
        input.artifacts.mutatingWorkerDogfoodDesktopScreenshot,
        input.artifacts.workflowHighLoadDesktopScreenshot,
        input.artifacts.deniedScopeExplanationDesktopScreenshot,
        input.artifacts.lifecycleEdgeVisibilityDesktopScreenshot,
        input.artifacts.lifecycleTimeoutChildTranscriptDesktopScreenshot,
        input.artifacts.lifecyclePartialChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopCascadeDesktopScreenshot,
        input.artifacts.parentStopRequiredChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopBackgroundChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopCompletedChildTranscriptDesktopScreenshot,
        input.artifacts.multiClusterStressDesktopScreenshot,
        input.artifacts.expandedNarrowScreenshot,
        input.artifacts.operatorBehaviorDesktopScreenshot,
      ],
    ),
    workflow_artifact_rehydration: visualAssertion(
      "workflow_artifact_rehydration",
      [
        ["workflow artifact source path is captured in the seed", Boolean(input.seeded?.workflowArtifactSourceRelativePath)],
        ["workflow artifact state path is captured in the seed", Boolean(input.seeded?.workflowArtifactStateRelativePath)],
        [
          "workflow artifact source content is captured in the seed",
          input.seeded?.workflowArtifactSourceContent === SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT,
        ],
        ["rehydrated workflow Program panel is selected", workflowArtifactRehydration.sourcePanelSelected === true],
        ["rehydrated workflow source path is visible", workflowArtifactRehydration.sourcePathVisible === true],
        ["rehydrated workflow state path is visible", workflowArtifactRehydration.statePathVisible === true],
        ["rehydrated workflow program body is visible", workflowArtifactRehydration.sourceContentVisible === true],
        ["workflow detail source content matches expected content", workflowArtifactRehydration.sourceContentMatchesExpected === true],
        ["workflow detail reports no source read error", workflowArtifactRehydration.noSourceReadError === true],
        ["workflow artifact rehydration view has no critical overlap", workflowArtifactRehydration.criticalOverlapCount === 0],
      ],
      [input.artifacts.workflowRehydratedNavigationDesktopScreenshot, input.artifacts.workflowArtifactRehydrationDesktopScreenshot],
    ),
    workflow_task_continuity: visualAssertion(
      "workflow_task_continuity",
      [
        ["workflow task row is visible", workflowExecution.taskVisible === true],
        ["workflow task id is visible", workflowExecution.taskIdVisible === true],
        ["workflow artifact id is visible", workflowExecution.artifactIdVisible === true],
        ["workflow run id is visible", workflowExecution.runIdVisible === true],
        ["workflow thread id is visible", workflowExecution.threadIdVisible === true],
        ["workflow blocker remains visible", workflowExecution.parentBlockerVisible === true],
        ["workflow task rehydrates after restart", restartRehydration.workflowTaskRehydrated === true],
        ["mutating worker task rehydrates after restart", restartRehydration.mutatingWorkflowTaskRehydrated === true],
        ["workflow high-load tasks rehydrate after restart", restartRehydration.workflowHighLoadTasksRehydrated === true],
        ["workflow artifact rehydrates after restart", restartRehydration.workflowArtifactRehydrated === true],
        ["mutating worker artifact rehydrates after restart", restartRehydration.mutatingWorkflowArtifactRehydrated === true],
        ["workflow high-load artifacts rehydrate after restart", restartRehydration.workflowHighLoadArtifactsRehydrated === true],
        ["rehydrated workflow thread link opens after restart", workflowRehydratedNavigation.workflowThreadHeaderVisible === true],
        ["rehydrated workflow artifact content opens after restart", workflowArtifactRehydration.sourceContentVisible === true],
      ],
      [
        input.artifacts.workflowExecutionDesktopScreenshot,
        input.artifacts.mutatingWorkerDogfoodDesktopScreenshot,
        input.artifacts.workflowHighLoadDesktopScreenshot,
        input.artifacts.restartRehydrationDesktopScreenshot,
        input.artifacts.workflowRehydratedNavigationDesktopScreenshot,
        input.artifacts.workflowArtifactRehydrationDesktopScreenshot,
        input.artifacts.accessibilitySnapshot,
      ],
    ),
    lifecycle_edge_visibility: visualAssertion(
      "lifecycle_edge_visibility",
      [
        ["lifecycle parent message is visible", lifecycleEdgeVisibility.parentMessageVisible === true],
        ["lifecycle edge cluster is collapsed by default", lifecycleEdgeVisibility.clusterDefaultCollapsedBeforeOpen === true],
        ["lifecycle cluster summary names four child threads", lifecycleEdgeVisibility.summaryVisible === true],
        ["timed-out child remains visible", lifecycleEdgeVisibility.timeoutChildVisible === true],
        [
          "timeout attention choices remain visible",
          lifecycleEdgeVisibility.timeoutAttentionVisible === true && lifecycleEdgeVisibility.timeoutChoicesVisible === true,
        ],
        ["partial continuation decision is visible", lifecycleEdgeVisibility.partialDecisionVisible === true],
        ["partial summary is visible", lifecycleEdgeVisibility.partialSummaryVisible === true],
        [
          "timed-out child opens into a terminal transcript",
          lifecycleTimeoutChildTranscript.childExpanded === true && lifecycleTimeoutChildTranscript.childTranscriptTerminal === true,
        ],
        [
          "timed-out child transcript includes live stream and final status",
          lifecycleTimeoutChildTranscript.liveTranscriptStreamVisible === true &&
            lifecycleTimeoutChildTranscript.finalStatusEndCapLabelVisible === true,
        ],
        [
          "partial child opens into a terminal transcript",
          lifecyclePartialChildTranscript.childExpanded === true && lifecyclePartialChildTranscript.childTranscriptTerminal === true,
        ],
        [
          "partial child transcript includes live stream and final status",
          lifecyclePartialChildTranscript.liveTranscriptStreamVisible === true &&
            lifecyclePartialChildTranscript.finalStatusEndCapLabelVisible === true,
        ],
        [
          "terminal lifecycle transcripts preserve child message bubbles",
          Number(lifecycleTimeoutChildTranscript.messageBubbleCount) >= 2 &&
            Number(lifecyclePartialChildTranscript.messageBubbleCount) >= 2,
        ],
        ["retry child remains visible and parent-blocking", lifecycleEdgeVisibility.retryChildVisible === true],
        [
          "retry decision and effect are visible",
          lifecycleEdgeVisibility.retryDecisionVisible === true && lifecycleEdgeVisibility.retryEffectVisible === true,
        ],
        [
          "accepted retry ownership is visible",
          lifecycleEdgeVisibility.retryAcceptedEffectVisible === true && lifecycleEdgeVisibility.retryMailboxVisible === true,
        ],
        [
          "detached child decision and effect are visible",
          lifecycleEdgeVisibility.detachDecisionVisible === true && lifecycleEdgeVisibility.detachedEffectVisible === true,
        ],
        ["lifecycle child identities are captured", lifecycleEdgeVisibility.edgeIdentityCaptured === true],
        ["lifecycle edge view has no critical overlap", lifecycleEdgeVisibility.criticalOverlapCount === 0],
      ],
      [
        input.artifacts.lifecycleEdgeVisibilityDesktopScreenshot,
        input.artifacts.lifecycleTimeoutChildTranscriptDesktopScreenshot,
        input.artifacts.lifecyclePartialChildTranscriptDesktopScreenshot,
      ],
    ),
    parent_stop_cascade_visibility: visualAssertion(
      "parent_stop_cascade_visibility",
      [
        ["parent-stop parent message is visible", parentStopCascadeVisibility.parentMessageVisible === true],
        ["parent-stop cluster is collapsed by default", parentStopCascadeVisibility.clusterDefaultCollapsedBeforeOpen === true],
        ["parent-stop cluster summary names three child threads", parentStopCascadeVisibility.summaryVisible === true],
        ["required child is shown as cancelled", parentStopCascadeVisibility.requiredChildCancelledVisible === true],
        ["optional child is shown as detached", parentStopCascadeVisibility.optionalChildDetachedVisible === true],
        ["completed child remains visible as unchanged", parentStopCascadeVisibility.completedChildUnchangedVisible === true],
        ["parent-stopped mailbox activity is visible", parentStopCascadeVisibility.parentStoppedMailboxVisible === true],
        ["parent cancellation requested chip is visible", parentStopCascadeVisibility.parentCancellationRequestedVisible === true],
        ["cancelled wait barrier is visible", parentStopCascadeVisibility.cancelledWaitBarrierVisible === true],
        ["cancelled child mailbox work is visible", parentStopCascadeVisibility.cancelledMailboxEventsVisible === true],
        ["parent-stop reason is visible", parentStopCascadeVisibility.cascadeReasonVisible === true],
        ["parent-stop cascade identities are captured", parentStopCascadeVisibility.cascadeIdentityCaptured === true],
        [
          "required parent-stop child opens into a cancelled terminal transcript",
          parentStopRequiredChildTranscript.childExpanded === true &&
            parentStopRequiredChildTranscript.childTranscriptTerminal === true &&
            parentStopRequiredChildTranscript.finalStatusEndCapLabelVisible === true,
        ],
        [
          "background parent-stop child opens into a detached terminal transcript",
          parentStopBackgroundChildTranscript.childExpanded === true &&
            parentStopBackgroundChildTranscript.childTranscriptTerminal === true &&
            parentStopBackgroundChildTranscript.finalStatusEndCapLabelVisible === true,
        ],
        [
          "completed parent-stop child opens into a completion transcript",
          parentStopCompletedChildTranscript.childExpanded === true &&
            parentStopCompletedChildTranscript.childTranscriptTerminal === true &&
            parentStopCompletedChildTranscript.completionEndCapLabelVisible === true,
        ],
        [
          "parent-stop child transcripts preserve child message bubbles",
          Number(parentStopRequiredChildTranscript.messageBubbleCount) >= 2 &&
            Number(parentStopBackgroundChildTranscript.messageBubbleCount) >= 2 &&
            Number(parentStopCompletedChildTranscript.messageBubbleCount) >= 2,
        ],
        [
          "parent-stop child transcript layout is unobscured",
          parentStopRequiredChildTranscript.criticalOverlapCount === 0 &&
            parentStopBackgroundChildTranscript.criticalOverlapCount === 0 &&
            parentStopCompletedChildTranscript.criticalOverlapCount === 0,
        ],
        ["parent-stop cascade view has no critical overlap", parentStopCascadeVisibility.criticalOverlapCount === 0],
      ],
      [
        input.artifacts.parentStopCascadeDesktopScreenshot,
        input.artifacts.parentStopRequiredChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopBackgroundChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopCompletedChildTranscriptDesktopScreenshot,
      ],
    ),
  };
}

function visualAssertion(
  id: DesktopVisualAssertionId,
  checks: Array<[string, boolean]>,
  artifactRefs: Array<string | undefined>,
): DesktopVisualAssertionEvidence {
  return {
    id,
    status: checks.every(([, passed]) => passed) ? "passed" : "failed",
    evidence: checks.map(([label, passed]) => `${passed ? "passed" : "failed"}: ${label}`),
    artifactRefs: artifactRefs.filter((value): value is string => Boolean(value)),
  };
}

export function buildDesktopMaturityAssertions(input: {
  artifacts: Record<string, string>;
  checks: Record<string, unknown>;
  seeded?: SubagentDesktopDogfoodSeedResult;
}): Record<DesktopMaturityAssertionId, DesktopMaturityAssertionEvidence> {
  const collapsed = objectRecord(input.checks.collapsed);
  const expanded = objectRecord(input.checks.expanded);
  const narrow = objectRecord(input.checks.narrow);
  const approvalFlow = objectRecord(expanded.approvalFlow);
  const approvalForwarding = objectRecord(input.checks.approvalForwarding);
  const childTranscript = objectRecord(input.checks.childTranscript);
  const completedChildTranscript = objectRecord(input.checks.completedChildTranscript);
  const standaloneChildThread = objectRecord(input.checks.standaloneChildThread);
  const effectiveRoleSnapshot = objectRecord(input.checks.effectiveRoleSnapshot);
  const workflowExecution = objectRecord(input.checks.workflowExecution);
  const mutatingWorkerDogfood = objectRecord(input.checks.mutatingWorkerDogfood);
  const workflowHighLoad = objectRecord(input.checks.workflowHighLoad);
  const patternGraphRuntime = objectRecord(input.checks.patternGraphRuntime);
  const patternGraphClickThrough = objectRecord(input.checks.patternGraphClickThrough);
  const patternGraphCompletedClickThrough = objectRecord(input.checks.patternGraphCompletedClickThrough);
  const patternGraphKeyboardActivation = objectRecord(input.checks.patternGraphKeyboardActivation);
  const patternGraphApprovalBadgeDialog = objectRecord(input.checks.patternGraphApprovalBadgeDialog);
  const patternGraphOverflowExpansion = objectRecord(input.checks.patternGraphOverflowExpansion);
  const deniedScopeExplanation = objectRecord(input.checks.deniedScopeExplanation);
  const restartRehydration = objectRecord(input.checks.restartRehydration);
  const workflowRehydratedNavigation = objectRecord(input.checks.workflowRehydratedNavigation);
  const workflowArtifactRehydration = objectRecord(input.checks.workflowArtifactRehydration);
  const localRuntimeOwnership = objectRecord(input.checks.localRuntimeOwnership);
  const operatorControls = objectRecord(expanded.operatorControls);
  const operatorBehavior = objectRecord(input.checks.operatorBehavior);
  const multiClusterStress = objectRecord(input.checks.multiClusterStress);
  const lifecycleEdgeVisibility = objectRecord(input.checks.lifecycleEdgeVisibility);
  const lifecycleTimeoutChildTranscript = objectRecord(input.checks.lifecycleTimeoutChildTranscript);
  const lifecyclePartialChildTranscript = objectRecord(input.checks.lifecyclePartialChildTranscript);
  const parentStopCascadeVisibility = objectRecord(input.checks.parentStopCascadeVisibility);
  const parentStopRequiredChildTranscript = objectRecord(input.checks.parentStopRequiredChildTranscript);
  const parentStopBackgroundChildTranscript = objectRecord(input.checks.parentStopBackgroundChildTranscript);
  const parentStopCompletedChildTranscript = objectRecord(input.checks.parentStopCompletedChildTranscript);
  const chatExport = objectRecord(input.checks.chatExport);
  const approvalAuthorityContract = objectRecord(chatExport.approvalAuthorityContract);
  const visualAssertions = buildDesktopVisualAssertions(input);

  return {
    desktop_child_visibility: maturityAssertion(
      "desktop_child_visibility",
      [
        "production_ui_visibility",
        "parent_child_placement",
        "default_collapsed_state",
        "inline_child_mini_thread_chrome",
        "inline_child_tool_card_chrome",
        "inline_child_live_transcript_primary",
        "blocking_attention_indicators",
      ],
      [
        ["parent thread id is captured", Boolean(input.seeded?.parentThreadId)],
        ["child thread ids are captured", Boolean(input.seeded?.childThreadIds.length)],
        ["cluster is default-collapsed before interaction", collapsed.defaultCollapsed === true],
        ["cluster follows the spawning parent message", collapsed.clusterAfterParentMessage === true],
        ["expanded child rows stay inspectable", Number(expanded.childRows) >= 2],
        [
          "child transcript expands inline under the parent cluster",
          childTranscript.childExpanded === true && childTranscript.transcriptPanelVisible === true,
        ],
        [
          "child transcript live shell and stream lane are visible",
          childTranscript.liveTranscriptShellVisible === true && childTranscript.liveTranscriptStreamVisible === true,
        ],
        [
          "child transcript message stream is the primary live surface",
          childTranscript.transcriptPrimary === true && childTranscript.transcriptStreamLive === true,
        ],
        [
          "child transcript uses real child messages",
          childTranscript.userMessageVisible === true && childTranscript.assistantMessageVisible === true,
        ],
        ["child transcript count matches visible message bubbles", childTranscript.liveTranscriptMessageCountMatchesBubbles === true],
        [
          "child transcript shows live activity with parent-style chrome",
          childTranscript.liveChildActivityVisible === true &&
            childTranscript.liveChildActivityUsesParentChrome === true &&
            childTranscript.liveChildActivityHasLines === true,
        ],
        [
          "child transcript activity count matches shell metadata",
          childTranscript.liveTranscriptActivityCountVisible === true && childTranscript.liveChildActivityCountMatchesShell === true,
        ],
        [
          "child transcript renders parent-style tool cards",
          childTranscript.toolCardVisible === true &&
            childTranscript.toolCardUsesParentChrome === true &&
            childTranscript.toolCardResultVisible === true,
        ],
        [
          "child transcript tool-card count matches shell metadata",
          childTranscript.toolCardCountMatchesData === true && childTranscript.childRendererUsesToolCards === true,
        ],
        [
          "child transcript runtime rail shows recent child events",
          childTranscript.runtimeEventRailVisible === true && childTranscript.runtimeEventRailHasRecentEvents === true,
        ],
        [
          "child transcript runtime and mailbox rails stay open while live",
          childTranscript.runtimeEventsOpen === true && childTranscript.mailboxEventsOpen === true,
        ],
        [
          "child transcript mailbox rail shows parent follow-up work",
          childTranscript.childMailboxTimelineVisible === true && childTranscript.childMailboxTimelineHasParentFollowup === true,
        ],
        ["child transcript keeps sibling output isolated", childTranscript.siblingSummaryNotLeakedIntoTranscript === true],
        ["child transcript end state matches run phase", childTranscript.transcriptEndStateCorrect === true],
        ["child transcript end marker clears the composer", childTranscript.transcriptEndClearsComposer === true],
        ["live child transcript defers final summary until terminal", childTranscript.completionSummaryDeferredWhileLive === true],
        [
          "completed child transcript shows terminal end cap after transcript",
          completedChildTranscript.childTranscriptTerminal === true && completedChildTranscript.completionEndCapAfterMessages === true,
        ],
        [
          "completed child transcript is inspectable without live stream status",
          completedChildTranscript.transcriptPrimary === true && completedChildTranscript.transcriptStreamLive === false,
        ],
        ["completed child transcript end cap clears the composer", completedChildTranscript.transcriptEndClearsComposer === true],
        [
          "completed child transcript uses real child messages",
          completedChildTranscript.assistantMessageVisible === true &&
            completedChildTranscript.liveTranscriptMessageCountMatchesBubbles === true,
        ],
        [
          "standalone child thread keeps parent wait context visible",
          standaloneChildThread.parentBarrierVisible === true && standaloneChildThread.parentBarrierDetailVisible === true,
        ],
        [
          "standalone child thread can navigate back to parent",
          standaloneChildThread.parentOpenActionVisible === true && standaloneChildThread.parentThreadIdVisible === true,
        ],
        [
          "standalone child thread keeps child transcript visible",
          standaloneChildThread.transcriptVisible === true && standaloneChildThread.siblingSummaryNotLeaked === true,
        ],
        [
          "standalone child thread is transcript-first with collapsed run details",
          standaloneChildThread.transcriptPrecedesInspector === true && standaloneChildThread.inspectorCollapsedByDefault === true,
        ],
        [
          "standalone child thread transcript is not overlapped by run details",
          standaloneChildThread.transcriptVerticallyPrecedesInspector === true &&
            standaloneChildThread.transcriptInspectorOverlapFree === true,
        ],
        [
          "pattern graph keyboard activation opens a child transcript",
          patternGraphKeyboardActivation.childExpanded === true && patternGraphKeyboardActivation.transcriptPanelVisible === true,
        ],
        ["inline child mini-thread chrome visual assertion passed", visualAssertions.inline_child_mini_thread_chrome.status === "passed"],
        [
          "child inspector shows persisted effective role snapshot",
          effectiveRoleSnapshot.effectiveRoleVisible === true && effectiveRoleSnapshot.outputContractVisible === true,
        ],
        ["blocking and attention labels are visible", labelVisible(collapsed, "1 blocking") && labelVisible(collapsed, "1 attention")],
      ],
      [
        input.artifacts.collapsedDesktopScreenshot,
        input.artifacts.expandedDesktopScreenshot,
        input.artifacts.childTranscriptExpandedDesktopScreenshot,
        input.artifacts.completedChildTranscriptDesktopScreenshot,
        input.artifacts.patternGraphClickThroughDesktopScreenshot,
        input.artifacts.patternGraphCompletedClickThroughDesktopScreenshot,
        input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
        input.artifacts.standaloneChildThreadDesktopScreenshot,
        input.artifacts.effectiveRoleSnapshotDesktopScreenshot,
      ],
    ),
    desktop_approval_forwarding: maturityAssertion(
      "desktop_approval_forwarding",
      ["approval_parent_blocking", "approval_forwarding_behavior", "child_scoped_approval"],
      [
        ["approval id is captured", Boolean(input.seeded?.approvalId)],
        ["approval request parent mailbox event is captured", Boolean(input.seeded?.approvalRequestParentMailboxEventId)],
        ["approval prompt identifies the child", approvalFlow.childIdentifierVisible === true],
        ["pattern graph approval badge opens the same parent approval surface", patternGraphApprovalBadgeDialog.dialogOpened === true],
        [
          "pattern graph approval badge preserves child identity",
          patternGraphApprovalBadgeDialog.dialogNamesChildRun === true && patternGraphApprovalBadgeDialog.dialogNamesChildThread === true,
        ],
        ["approval buttons name the child", approvalFlow.approvalButtonsNameChild === true],
        ["forwarded decision remains attributed to the child", approvalForwarding.forwardedNamesChild === true],
        ["forwarded and original approval request name the same child", approvalForwarding.forwardedAndRequestSameChild === true],
        ["child row data still points to the approved child", approvalForwarding.childRowDataMatchesApprovalChild === true],
        ["forwarded decision shows child-thread scoped persistence", approvalForwarding.childScopedPersistenceVisible === true],
        ["forwarded decision shows parent returns to blocking on child", approvalForwarding.parentResumeAfterApprovalVisible === true],
        ["parent remains blocked after forwarding", approvalForwarding.parentStillBlockedAfterForward === true],
        ["same child remains blocked after forwarding", approvalForwarding.childRowStillBlocksApprovalChild === true],
        ["child returns to needs-steering after approval forwarding", approvalForwarding.childReturnedToNeedsSteering === true],
        [
          "exported approval request preserves child identity",
          approvalAuthorityContract.requestExported === true && approvalAuthorityContract.childIdentityMatches === true,
        ],
        [
          "exported approval request preserves tool/action and wait barrier",
          approvalAuthorityContract.requestedToolMatches === true && approvalAuthorityContract.waitBarrierMatches === true,
        ],
        ["exported approval request tells parent to resume waiting", approvalAuthorityContract.parentBlockingResumeMatches === true],
        [
          "exported forwarded grant is scoped to this child thread",
          approvalAuthorityContract.forwardedExported === true && approvalAuthorityContract.forwardedEffectiveScopeChildThread === true,
        ],
        [
          "exported forwarded grant tells parent to resume waiting",
          approvalAuthorityContract.forwardedParentBlockingResumeMatches === true,
        ],
      ],
      [
        input.artifacts.approvalDialogScreenshot,
        input.artifacts.patternGraphApprovalBadgeDialogScreenshot,
        input.artifacts.approvalForwardingDesktopScreenshot,
        input.artifacts.chatExportZip,
      ],
    ),
    desktop_denied_scope_explanations: maturityAssertion(
      "desktop_denied_scope_explanations",
      ["tool_scope_denial_visibility", "approval_unavailable_visibility", "parent_mailbox_denial_explanation"],
      [
        ["denied-scope parent mailbox event is captured", Boolean(input.seeded?.deniedScopeParentMailboxEventId)],
        ["denied child run id is captured", Boolean(input.seeded?.deniedScopeChildRunId)],
        ["denied child thread id is captured", Boolean(input.seeded?.deniedScopeChildThreadId)],
        ["denied connector category is visible", deniedScopeExplanation.deniedCategoryVisible === true],
        ["denied connector tool is visible", deniedScopeExplanation.deniedToolVisible === true],
        ["approval-unavailable explanation is visible", deniedScopeExplanation.approvalUnavailableVisible === true],
        ["denied child source remains attributed", deniedScopeExplanation.sourceChildVisible === true],
        ["non-interactive denied launch has no approval actions", deniedScopeExplanation.noInteractiveApprovalActions === true],
      ],
      [input.artifacts.deniedScopeExplanationDesktopScreenshot, input.artifacts.expandedDesktopScreenshot],
    ),
    desktop_workflow_execution: maturityAssertion(
      "desktop_workflow_execution",
      ["workflow_execution_parent_blocking", "workflow_task_continuity", "parent_blocking_workflow"],
      [
        ["workflow task id is captured", Boolean(input.seeded?.workflowTaskId)],
        ["workflow run id is captured", Boolean(input.seeded?.workflowRunId)],
        ["workflow thread id is captured", Boolean(input.seeded?.workflowThreadId)],
        ["workflow section is visible", workflowExecution.workflowSectionVisible === true],
        ["workflow task row is visible", workflowExecution.taskVisible === true],
        ["workflow parent blocker remains visible", workflowExecution.parentBlockerVisible === true],
        ["workflow artifact id is visible", workflowExecution.artifactIdVisible === true],
      ],
      [input.artifacts.workflowExecutionDesktopScreenshot, input.artifacts.accessibilitySnapshot],
    ),
    desktop_mutating_worker_dogfood: maturityAssertion(
      "desktop_mutating_worker_dogfood",
      ["mutating_worker_dogfood_behavior", "child_scoped_approval", "isolated_child_worktree", "parent_workspace_unchanged"],
      [
        ["mutating worker task id is captured", Boolean(input.seeded?.mutatingWorkflowTaskId)],
        ["mutating worker artifact id is captured", Boolean(input.seeded?.mutatingWorkflowArtifactId)],
        ["mutating worker run id is captured", Boolean(input.seeded?.mutatingWorkflowRunId)],
        ["mutating worker child run id is captured", Boolean(input.seeded?.mutatingWorkflowChildRunId)],
        ["mutating worker child thread id is captured", Boolean(input.seeded?.mutatingWorkflowChildThreadId)],
        ["mutating worker staged path is captured", Boolean(input.seeded?.mutatingWorkflowStagedRelativePath)],
        ["mutating worker report path is captured", Boolean(input.seeded?.mutatingWorkflowReportRelativePath)],
        [
          "mutating worker progress message matches the seeded proof",
          input.seeded?.mutatingWorkflowProgressMessage === SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE,
        ],
        ["parent workspace unchanged proof is true", input.seeded?.mutatingWorkflowParentWorkspaceUnchanged === true],
        ["mutating worker row is visible", mutatingWorkerDogfood.taskVisible === true],
        ["mutating worker row shows child caller", mutatingWorkerDogfood.childCallerVisible === true],
        ["mutating worker row shows child bridge approval", mutatingWorkerDogfood.approvalBridgeVisible === true],
        ["mutating worker row shows isolated worktree", mutatingWorkerDogfood.isolatedWorktreeVisible === true],
        ["mutating worker row shows staged output", mutatingWorkerDogfood.stagedMutationVisible === true],
        ["mutating worker row shows parent workspace unchanged", mutatingWorkerDogfood.parentWorkspaceUnchangedVisible === true],
        ["mutating worker row rehydrates after restart", restartRehydration.mutatingWorkflowTaskRehydrated === true],
      ],
      [input.artifacts.mutatingWorkerDogfoodDesktopScreenshot, input.artifacts.restartRehydrationDesktopScreenshot],
    ),
    desktop_workflow_high_load: maturityAssertion(
      "desktop_workflow_high_load",
      ["workflow_high_load_dogfood", "symphony_six_patterns", "workflow_task_continuity", "layout_safety"],
      [
        ["high-load workflow task ids are captured", (input.seeded?.workflowHighLoadTaskIds.length ?? 0) >= 4],
        ["high-load workflow artifact ids are captured", (input.seeded?.workflowHighLoadArtifactIds.length ?? 0) >= 4],
        ["high-load workflow run ids are captured", (input.seeded?.workflowHighLoadRunIds.length ?? 0) >= 4],
        [
          "all expected Symphony pattern labels are captured",
          input.seeded?.workflowHighLoadPatternLabels.join("|") ===
            [...SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS].join("|"),
        ],
        ["workflow section contains at least six rows", Number(workflowHighLoad.workflowRowCount) >= 6],
        ["all six Symphony presets are visible", workflowHighLoad.allPresetLabelsVisible === true],
        [
          "high-load workflow ids are visible",
          workflowHighLoad.highLoadTaskIdsVisible === true && workflowHighLoad.highLoadArtifactIdsVisible === true,
        ],
        [
          "high-load workflow run and thread ids are visible",
          workflowHighLoad.highLoadRunIdsVisible === true && workflowHighLoad.highLoadThreadIdsVisible === true,
        ],
        [
          "high-load rows are completed background tasks",
          workflowHighLoad.completedRowsVisible === true && workflowHighLoad.backgroundRowsVisible === true,
        ],
        ["high-load rows rehydrate after restart", restartRehydration.workflowHighLoadTasksRehydrated === true],
      ],
      [input.artifacts.workflowHighLoadDesktopScreenshot, input.artifacts.restartRehydrationDesktopScreenshot],
    ),
    desktop_pattern_graph_runtime: maturityAssertion(
      "desktop_pattern_graph_runtime",
      [
        "pattern_graph_snapshot_persistence",
        "symphony_six_pattern_renderer",
        "child_thread_click_through",
        "child_thread_keyboard_activation",
        "child_approval_badge_dialog",
        "fanout_overflow_expansion",
        "restart_rehydration",
      ],
      [
        ["pattern graph renderer has six visible graphs", patternGraphRuntime.graphCountVisible === true],
        ["all six pattern graph labels are visible", patternGraphRuntime.allPatternGraphsVisible === true],
        ["graph nodes carry workflow task ids", patternGraphRuntime.runtimeTaskBindingsVisible === true],
        ["graph nodes carry workflow run ids", patternGraphRuntime.runtimeRunBindingsVisible === true],
        ["Map-Reduce graph binds to the approval child run", patternGraphRuntime.childBindingVisible === true],
        ["Map-Reduce graph advertises child click-through", patternGraphRuntime.childClickThroughAdvertised === true],
        ["Map-Reduce graph advertises keyboard activation", patternGraphRuntime.childKeyboardOpenAdvertised === true],
        [
          "Map-Reduce graph click opens the inline child transcript",
          patternGraphClickThrough.childExpanded === true && patternGraphClickThrough.transcriptPanelVisible === true,
        ],
        [
          "Map-Reduce graph Enter key opens the inline child transcript",
          patternGraphKeyboardActivation.childExpanded === true && patternGraphKeyboardActivation.transcriptPanelVisible === true,
        ],
        [
          "Map-Reduce graph keyboard activation preserves child-thread chrome",
          patternGraphKeyboardActivation.miniThreadHeaderVisible === true &&
            patternGraphKeyboardActivation.miniThreadHeaderNamesChild === true,
        ],
        ["Map-Reduce approval badge advertises parent approval opening", patternGraphRuntime.approvalBadgeOpenAdvertised === true],
        [
          "Map-Reduce approval badge opens the parent approval dialog",
          patternGraphApprovalBadgeDialog.dialogOpened === true && patternGraphApprovalBadgeDialog.dialogNamesApproval === true,
        ],
        [
          "Map-Reduce approval badge dialog preserves child identity",
          patternGraphApprovalBadgeDialog.dialogNamesChildRun === true && patternGraphApprovalBadgeDialog.dialogNamesChildThread === true,
        ],
        ["Map-Reduce graph binds to the completed reducer child run", patternGraphRuntime.completedChildBindingVisible === true],
        ["Map-Reduce reducer graph advertises keyboard activation", patternGraphRuntime.completedChildKeyboardOpenAdvertised === true],
        [
          "Map-Reduce reducer graph click opens the terminal child transcript",
          patternGraphCompletedClickThrough.childExpanded === true && patternGraphCompletedClickThrough.completionEndCapVisible === true,
        ],
        [
          "Map-Reduce overflow node advertises expansion",
          patternGraphRuntime.overflowNodeVisible === true && patternGraphRuntime.overflowNodeExpandableAdvertised === true,
        ],
        [
          "Map-Reduce overflow expansion reveals grouped child identity",
          patternGraphOverflowExpansion.panelVisible === true && patternGraphOverflowExpansion.groupedChildIdentityVisible === true,
        ],
        [
          "blocking and approval badges are visible",
          patternGraphRuntime.blockingBadgeVisible === true && patternGraphRuntime.approvalBadgeVisible === true,
        ],
        [
          "blocking and approval badges are node-level UI",
          patternGraphRuntime.nodeBlockingBadgeVisible === true && patternGraphRuntime.nodeApprovalBadgeVisible === true,
        ],
        ["blocking edge status is runtime-visible", patternGraphRuntime.blockingEdgeVisible === true],
        [
          "graph nodes and bindings rehydrate after restart",
          restartRehydration.patternGraphsRehydrated === true &&
            restartRehydration.patternGraphChildBindingRehydrated === true &&
            restartRehydration.patternGraphRuntimeBindingsRehydrated === true,
        ],
      ],
      [
        input.artifacts.expandedDesktopScreenshot,
        input.artifacts.patternGraphClickThroughDesktopScreenshot,
        input.artifacts.patternGraphCompletedClickThroughDesktopScreenshot,
        input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
        input.artifacts.patternGraphOverflowExpandedDesktopScreenshot,
        input.artifacts.patternGraphApprovalBadgeDialogScreenshot,
        input.artifacts.restartRehydrationDesktopScreenshot,
      ],
    ),
    desktop_workflow_artifact_rehydration: maturityAssertion(
      "desktop_workflow_artifact_rehydration",
      ["workflow_artifact_rehydration_behavior", "artifact_source_link", "artifact_state_link"],
      [
        ["workflow artifact source path is captured", Boolean(input.seeded?.workflowArtifactSourceRelativePath)],
        ["workflow artifact state path is captured", Boolean(input.seeded?.workflowArtifactStateRelativePath)],
        ["opened workflow thread remains active", workflowArtifactRehydration.activeWorkflowThreadVisible === true],
        ["linked workflow thread still points to the artifact", workflowArtifactRehydration.artifactIdMatchesLinkedThread === true],
        ["run detail reloads for the persisted run", workflowArtifactRehydration.runDetailLoaded === true],
        ["source path is visible in the Program panel", workflowArtifactRehydration.sourcePathVisible === true],
        ["state path is visible in the Program panel", workflowArtifactRehydration.statePathVisible === true],
        ["program source content is visible in the Program panel", workflowArtifactRehydration.sourceContentVisible === true],
        ["program source content matches the retained artifact", workflowArtifactRehydration.sourceContentMatchesExpected === true],
        ["artifact source/state rehydration has no layout overlap", workflowArtifactRehydration.criticalOverlapCount === 0],
      ],
      [input.artifacts.workflowRehydratedNavigationDesktopScreenshot, input.artifacts.workflowArtifactRehydrationDesktopScreenshot],
    ),
    desktop_restart_rehydration: maturityAssertion(
      "desktop_restart_rehydration",
      ["restart_rehydration_behavior", "workflow_task_rehydration", "artifact_link"],
      [
        ["child run id rehydrates after relaunch", restartRehydration.childRunIdRehydrated === true],
        ["child thread id rehydrates after relaunch", restartRehydration.childThreadIdRehydrated === true],
        ["completed child summary rehydrates after relaunch", restartRehydration.completedChildResultSummaryRehydrated === true],
        ["workflow task rehydrates after relaunch", restartRehydration.workflowTaskRehydrated === true],
        ["high-load workflow tasks rehydrate after relaunch", restartRehydration.workflowHighLoadTasksRehydrated === true],
        ["workflow artifact rehydrates after relaunch", restartRehydration.workflowArtifactRehydrated === true],
        ["high-load workflow artifacts rehydrate after relaunch", restartRehydration.workflowHighLoadArtifactsRehydrated === true],
        ["pattern graphs rehydrate after relaunch", restartRehydration.patternGraphsRehydrated === true],
        ["pattern graph child bindings rehydrate after relaunch", restartRehydration.patternGraphChildBindingRehydrated === true],
        ["pattern graph runtime bindings rehydrate after relaunch", restartRehydration.patternGraphRuntimeBindingsRehydrated === true],
        ["parent remains blocked after relaunch", restartRehydration.parentStillBlockedAfterRelaunch === true],
      ],
      [input.artifacts.restartRehydrationDesktopScreenshot],
    ),
    desktop_workflow_rehydrated_navigation: maturityAssertion(
      "desktop_workflow_rehydrated_navigation",
      ["restart_rehydration_behavior", "workflow_thread_navigation", "artifact_link"],
      [
        ["workflow thread id is captured", Boolean(input.seeded?.workflowThreadId)],
        ["rehydrated workflow open control remains actionable", workflowRehydratedNavigation.workflowThreadHeaderVisible === true],
        ["opened workflow thread is selected in the sidebar", workflowRehydratedNavigation.workflowThreadSidebarSelected === true],
        ["opened workflow thread matches the persisted id", workflowRehydratedNavigation.workflowThreadMatchesExpectedId === true],
        ["opened workflow view has no navigation error", workflowRehydratedNavigation.navigationErrorAbsent === true],
        ["opened workflow view has no critical overlap", workflowRehydratedNavigation.criticalOverlapCount === 0],
      ],
      [input.artifacts.restartRehydrationDesktopScreenshot, input.artifacts.workflowRehydratedNavigationDesktopScreenshot],
    ),
    desktop_local_runtime_ownership: maturityAssertion(
      "desktop_local_runtime_ownership",
      ["local_runtime_lease_ownership", "lease_stop_blocker", "untracked_runtime_safety"],
      [
        ["local runtime lease id is captured", Boolean(input.seeded?.localRuntimeLeaseId)],
        ["local runtime id is captured", Boolean(input.seeded?.localRuntimeId)],
        ["local runtime pid is captured", Number(input.seeded?.localRuntimePid) > 0],
        ["runtime catalog names the owning sub-agent", localRuntimeOwnership.ownerLabelVisible === true],
        ["ordinary Stop is disabled while owned by the sub-agent", localRuntimeOwnership.stopDisabledVisible === true],
        ["ordinary Restart is disabled while owned by the sub-agent", localRuntimeOwnership.restartDisabledVisible === true],
        ["force consequence is visible", localRuntimeOwnership.forceConsequenceVisible === true],
        ["untracked runtime is visible", localRuntimeOwnership.untrackedRuntimeVisible === true],
        ["untracked runtime id is visible", localRuntimeOwnership.untrackedRuntimeIdVisible === true],
        ["untracked runtime pid is visible", localRuntimeOwnership.untrackedRuntimePidVisible === true],
        ["untracked runtime endpoint is visible", localRuntimeOwnership.untrackedRuntimeEndpointVisible === true],
        ["untracked runtime model is visible", localRuntimeOwnership.untrackedRuntimeModelVisible === true],
        ["untracked runtime ordinary Stop is disabled", localRuntimeOwnership.untrackedStopDisabledVisible === true],
        ["untracked runtime ordinary Restart is disabled", localRuntimeOwnership.untrackedRestartDisabledVisible === true],
        ["untracked runtime force termination is unavailable", localRuntimeOwnership.untrackedForceUnavailableVisible === true],
        ["untracked runtime external stop guidance is visible", localRuntimeOwnership.untrackedExternalStopGuidanceVisible === true],
        ["untracked runtime group remains external-safe", localRuntimeOwnership.untrackedGroupSafeVisible === true],
      ],
      [input.artifacts.localRuntimeOwnershipDesktopScreenshot],
    ),
    desktop_operator_controls: maturityAssertion(
      "desktop_operator_controls",
      ["operator_child_controls", "operator_control_behavior", "retention_policy_integrity"],
      [
        ["cancel control child run id is captured", Boolean(input.seeded?.cancelControlChildRunId)],
        ["close control child run ids are captured", Boolean(input.seeded?.closeControlChildRunIds.length)],
        [
          "cancel action is visible and scoped",
          operatorControls.cancelActionVisible === true && operatorControls.cancelScopedToAttentionChild === true,
        ],
        ["close controls preserve transcripts", operatorControls.closeTitlesPreserveTranscripts === true],
        [
          "completed child can be closed without deleting history",
          operatorBehavior.completedChildClosed === true && operatorBehavior.completedChildStillVisible === true,
        ],
        [
          "attention child can be cancelled without losing inspectability",
          operatorBehavior.attentionChildCancelled === true && operatorBehavior.attentionChildStillVisible === true,
        ],
        ["sibling state is preserved after operator actions", operatorBehavior.siblingStatePreserved === true],
        ["cancelled child surfaces typed barrier consequence", operatorBehavior.typedBarrierConsequenceVisible === true],
      ],
      [input.artifacts.expandedDesktopScreenshot, input.artifacts.operatorBehaviorDesktopScreenshot],
    ),
    desktop_visual_layout_safety: maturityAssertion(
      "desktop_visual_layout_safety",
      ["production_ui_visibility", "layout_safety", "workflow_task_continuity"],
      [
        ["semantic parent-child placement visual assertion passed", visualAssertions.parent_child_placement.status === "passed"],
        ["semantic blocking indicators visual assertion passed", visualAssertions.blocking_attention_indicators.status === "passed"],
        [
          "semantic approval/runtime labels visual assertion passed",
          visualAssertions.approval_runtime_ownership_labels.status === "passed",
        ],
        ["semantic workflow continuity visual assertion passed", visualAssertions.workflow_task_continuity.status === "passed"],
        ["semantic parent-stop cascade visual assertion passed", visualAssertions.parent_stop_cascade_visibility.status === "passed"],
        ["layout safety visual assertion passed", visualAssertions.layout_safety.status === "passed"],
        ["narrow view has no critical overlap", narrow.criticalOverlapCount === 0],
        ["operator post-action view has no critical overlap", operatorBehavior.criticalOverlapCount === 0],
      ],
      [
        input.artifacts.collapsedDesktopScreenshot,
        input.artifacts.expandedNarrowScreenshot,
        input.artifacts.parentStopCascadeDesktopScreenshot,
        input.artifacts.operatorBehaviorDesktopScreenshot,
      ],
    ),
    desktop_multi_cluster_stress: maturityAssertion(
      "desktop_multi_cluster_stress",
      ["multi_parent_cluster_stress", "default_collapsed_state", "high_load_dogfood"],
      [
        ["stress parent message ids are captured", Boolean(input.seeded?.stressParentMessageIds.length)],
        ["stress child run ids are captured", Boolean(input.seeded?.stressChildRunIds.length)],
        ["stress child thread ids are captured", Boolean(input.seeded?.stressChildThreadIds.length)],
        ["all stress clusters remain collapsed by default", multiClusterStress.allClustersDefaultCollapsed === true],
        ["stress summaries are visible", multiClusterStress.stressSummariesVisible === true],
        ["stress clusters follow their parent messages", multiClusterStress.stressClustersAfterParentMessages === true],
        ["multi-cluster stress view has no critical overlap", multiClusterStress.criticalOverlapCount === 0],
      ],
      [input.artifacts.multiClusterStressDesktopScreenshot],
    ),
    desktop_lifecycle_edges: maturityAssertion(
      "desktop_lifecycle_edges",
      [
        "lifecycle_edge_desktop_behavior",
        "lifecycle_terminal_child_transcript_behavior",
        "timeout_edge",
        "partial_result_edge",
        "retry_edge",
        "detach_edge",
        "parent_stop_cascade",
        "parent_stop_terminal_child_transcript_behavior",
      ],
      [
        ["lifecycle edge parent message id is captured", Boolean(input.seeded?.lifecycleEdgeParentMessageId)],
        ["lifecycle edge child run ids are captured", (input.seeded?.lifecycleEdgeChildRunIds.length ?? 0) === 4],
        ["lifecycle edge child thread ids are captured", (input.seeded?.lifecycleEdgeChildThreadIds.length ?? 0) === 4],
        ["lifecycle edge wait barrier ids are captured", (input.seeded?.lifecycleEdgeWaitBarrierIds.length ?? 0) === 4],
        [
          "timeout child and attention choices are visible",
          lifecycleEdgeVisibility.timeoutChildVisible === true && lifecycleEdgeVisibility.timeoutChoicesVisible === true,
        ],
        [
          "partial decision and summary are visible",
          lifecycleEdgeVisibility.partialDecisionVisible === true && lifecycleEdgeVisibility.partialSummaryVisible === true,
        ],
        [
          "timed-out lifecycle child opens as an inspectable terminal transcript",
          lifecycleTimeoutChildTranscript.childExpanded === true &&
            lifecycleTimeoutChildTranscript.childTranscriptTerminal === true &&
            lifecycleTimeoutChildTranscript.finalStatusEndCapLabelVisible === true,
        ],
        [
          "partial lifecycle child opens as an inspectable terminal transcript",
          lifecyclePartialChildTranscript.childExpanded === true &&
            lifecyclePartialChildTranscript.childTranscriptTerminal === true &&
            lifecyclePartialChildTranscript.finalStatusEndCapLabelVisible === true,
        ],
        [
          "terminal lifecycle child transcripts show real child messages",
          lifecycleTimeoutChildTranscript.userMessageVisible === true &&
            lifecycleTimeoutChildTranscript.assistantMessageVisible === true &&
            lifecyclePartialChildTranscript.userMessageVisible === true &&
            lifecyclePartialChildTranscript.assistantMessageVisible === true,
        ],
        [
          "terminal lifecycle transcript layout is unobscured",
          lifecycleTimeoutChildTranscript.summaryNotObscuringTranscript === true &&
            lifecyclePartialChildTranscript.summaryNotObscuringTranscript === true &&
            lifecycleTimeoutChildTranscript.criticalOverlapCount === 0 &&
            lifecyclePartialChildTranscript.criticalOverlapCount === 0,
        ],
        [
          "retry decision and effect are visible",
          lifecycleEdgeVisibility.retryDecisionVisible === true && lifecycleEdgeVisibility.retryEffectVisible === true,
        ],
        [
          "accepted retry ownership is visible",
          lifecycleEdgeVisibility.retryAcceptedEffectVisible === true && lifecycleEdgeVisibility.retryMailboxVisible === true,
        ],
        [
          "detached child decision and effect are visible",
          lifecycleEdgeVisibility.detachDecisionVisible === true && lifecycleEdgeVisibility.detachedEffectVisible === true,
        ],
        ["parent-stop cascade parent message id is captured", Boolean(input.seeded?.parentStopCascadeParentMessageId)],
        ["parent-stop cascade parent mailbox event id is captured", Boolean(input.seeded?.parentStopCascadeParentMailboxEventId)],
        ["parent-stop cascade child run ids are captured", (input.seeded?.parentStopCascadeChildRunIds.length ?? 0) === 3],
        ["parent-stop cascade wait barrier ids are captured", (input.seeded?.parentStopCascadeWaitBarrierIds.length ?? 0) === 1],
        [
          "parent-stop cascade cancelled mailbox event ids are captured",
          (input.seeded?.parentStopCascadeCancelledMailboxEventIds.length ?? 0) === 2,
        ],
        [
          "parent-stop cascade mailbox and effects are visible",
          parentStopCascadeVisibility.parentStoppedMailboxVisible === true &&
            parentStopCascadeVisibility.parentCancellationRequestedVisible === true,
        ],
        [
          "parent-stop cascade child outcomes are visible",
          parentStopCascadeVisibility.requiredChildCancelledVisible === true &&
            parentStopCascadeVisibility.optionalChildDetachedVisible === true &&
            parentStopCascadeVisibility.completedChildUnchangedVisible === true,
        ],
        [
          "parent-stop cancelled child opens as an inspectable terminal transcript",
          parentStopRequiredChildTranscript.childExpanded === true &&
            parentStopRequiredChildTranscript.childTranscriptTerminal === true &&
            parentStopRequiredChildTranscript.finalStatusEndCapLabelVisible === true,
        ],
        [
          "parent-stop detached child opens as an inspectable terminal transcript",
          parentStopBackgroundChildTranscript.childExpanded === true &&
            parentStopBackgroundChildTranscript.childTranscriptTerminal === true &&
            parentStopBackgroundChildTranscript.finalStatusEndCapLabelVisible === true,
        ],
        [
          "parent-stop unchanged child opens as a synthesis-safe completion transcript",
          parentStopCompletedChildTranscript.childExpanded === true &&
            parentStopCompletedChildTranscript.childTranscriptTerminal === true &&
            parentStopCompletedChildTranscript.childTranscriptSynthesisSafe === true &&
            parentStopCompletedChildTranscript.completionEndCapLabelVisible === true,
        ],
        [
          "parent-stop child transcripts show real child messages",
          parentStopRequiredChildTranscript.userMessageVisible === true &&
            parentStopRequiredChildTranscript.assistantMessageVisible === true &&
            parentStopBackgroundChildTranscript.userMessageVisible === true &&
            parentStopBackgroundChildTranscript.assistantMessageVisible === true &&
            parentStopCompletedChildTranscript.userMessageVisible === true &&
            parentStopCompletedChildTranscript.assistantMessageVisible === true,
        ],
        ["lifecycle visual assertion passed", visualAssertions.lifecycle_edge_visibility.status === "passed"],
        ["parent-stop cascade visual assertion passed", visualAssertions.parent_stop_cascade_visibility.status === "passed"],
      ],
      [
        input.artifacts.lifecycleEdgeVisibilityDesktopScreenshot,
        input.artifacts.lifecycleTimeoutChildTranscriptDesktopScreenshot,
        input.artifacts.lifecyclePartialChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopCascadeDesktopScreenshot,
        input.artifacts.parentStopRequiredChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopBackgroundChildTranscriptDesktopScreenshot,
        input.artifacts.parentStopCompletedChildTranscriptDesktopScreenshot,
      ],
    ),
    desktop_chat_export_child_bundle: maturityAssertion(
      "desktop_chat_export_child_bundle",
      [
        "chat_export_child_bundle",
        "child_transcript_export",
        "child_full_transcript_export",
        "policy_provenance_export",
        "pattern_graph_export_links",
        "parent_mailbox_approval_export",
        "child_pi_session_status_export",
        "wait_barrier_export",
        "result_artifact_export",
        "lifecycle_edge_child_export",
        "parent_stop_child_export",
      ],
      [
        ["chat export zip artifact is captured", Boolean(input.artifacts.chatExportZip)],
        ["export API returned the configured E2E path", chatExport.apiReturnedPath === true],
        ["export zip was written", chatExport.zipWritten === true && Number(chatExport.zipBytes) > 0],
        ["export result byte count matches zip bytes", chatExport.resultBytesMatchZip === true],
        ["manifest includes child thread bundle", chatExport.manifestIncludesChildThreads === true],
        ["child evidence summary is exported", chatExport.childEvidenceSummaryIncluded === true],
        ["child evidence summary covers expected child runs", chatExport.childEvidenceSummaryCoversExpectedRuns === true],
        ["child evidence summary links transcript files", chatExport.childEvidenceSummaryLinksTranscripts === true],
        ["child evidence summary includes latest authority snapshot", chatExport.childEvidenceSummaryAuthorityIncluded === true],
        ["child evidence summary includes approval bridge event ids", chatExport.childEvidenceSummaryApprovalBridgeIncluded === true],
        ["child evidence summary links pattern graph child nodes", chatExport.childEvidenceSummaryPatternLinksIncluded === true],
        ["child evidence summary includes result artifacts", chatExport.childEvidenceSummaryResultArtifactsIncluded === true],
        ["child evidence summary records bounded gap arrays", chatExport.childEvidenceSummaryGapsBounded === true],
        ["child index contains expected child runs", chatExport.indexContainsExpectedChildren === true],
        ["child visible transcripts contain expected messages", chatExport.childTranscriptsContainExpectedMessages === true],
        ["lifecycle edge child transcripts are exported", chatExport.lifecycleEdgeChildrenExported === true],
        ["parent-stop child transcripts are exported", chatExport.parentStopCascadeChildrenExported === true],
        ["child full transcripts are exported", chatExport.childFullTranscriptsIncluded === true],
        ["child runtime events are exported", chatExport.childRunEventsIncluded === true],
        ["child tool-scope snapshots are exported", chatExport.childToolScopeSnapshotsIncluded === true],
        ["child wait barriers are exported", chatExport.childWaitBarriersIncluded === true],
        ["parent mailbox approval evidence is exported", chatExport.parentMailboxIncluded === true],
        [
          "parent mailbox authority contract is exported",
          approvalAuthorityContract.requestExported === true && approvalAuthorityContract.forwardedExported === true,
        ],
        [
          "parent mailbox authority contract preserves parent blocking",
          approvalAuthorityContract.parentBlockingResumeMatches === true &&
            approvalAuthorityContract.forwardedParentBlockingResumeMatches === true,
        ],
        ["callable workflow task evidence is exported", chatExport.callableWorkflowTasksIncluded === true],
        ["pattern graph child transcript links are exported", chatExport.patternGraphLinksIncluded === true],
        ["child Pi session status is recorded", chatExport.childPiSessionStatusRecorded === true],
      ],
      [input.artifacts.chatExportZip],
    ),
  };
}

function maturityAssertion(
  id: DesktopMaturityAssertionId,
  capabilities: string[],
  checks: Array<[string, boolean]>,
  artifactRefs: Array<string | undefined>,
): DesktopMaturityAssertionEvidence {
  return {
    id,
    status: checks.every(([, passed]) => passed) ? "passed" : "failed",
    capabilities,
    evidence: checks.map(([label, passed]) => `${passed ? "passed" : "failed"}: ${label}`),
    artifactRefs: artifactRefs.filter((value): value is string => Boolean(value)),
  };
}

function labelVisible(check: Record<string, unknown>, label: string): boolean {
  const labels = objectRecord(check.labels);
  return labels[label] === true;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
