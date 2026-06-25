import type { ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";

import { AMBIENT_SUBAGENTS_FEATURE_FLAG } from "../../shared/featureFlags";
import {
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARENT_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ENDPOINT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_CASCADE_PARENT_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_TOOL_RESULT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX,
  type SubagentDesktopDogfoodSeedResult,
} from "./subagentDesktopDogfoodScenario";
import {
  buildDesktopMaturityAssertions,
  buildDesktopVisualAssertions,
  type DesktopMaturityAssertionEvidence,
  type DesktopMaturityAssertionId,
  type DesktopVisualAssertionEvidence,
  type DesktopVisualAssertionId,
} from "./subagentDesktopDogfoodAssertions";
import {
  captureFailureArtifacts,
  cdpPortFromEnv,
  clickChildAction,
  clickChildTranscriptSummary,
  clickClusterSummary,
  clickMailboxAction,
  clickPatternGraphApprovalBadge,
  clickPatternGraphChildNode,
  clickPatternGraphOverflowNode,
  clickSettingsSection,
  clickSidebarThread,
  clickStandaloneChildParentAction,
  clickWorkflowBuildPanel,
  clickWorkflowOpenAudit,
  clickWorkflowTaskAction,
  closeSettingsPanel,
  collapseChildTranscriptIfOpen,
  connectToElectron,
  dismissApprovalDialog,
  DOGFOOD_ENABLED,
  dogfoodCdpPort,
  dogfoodGitBranch,
  dogfoodGitCommit,
  emitChildLiveActivity,
  ensureChildTranscriptOpen,
  exportChatAndInspectChildBundle,
  getAvailablePort,
  inspectPatternGraphOverflowPanel,
  inspectStandaloneChildThread,
  keyboardActivatePatternGraphChildNode,
  launchDesktop,
  openPrimaryClusterIfClosed,
  openSettingsPanel,
  openSubagentThreadInspector,
  readSeed,
  REPO_ROOT,
  requireDogfoodEnv,
  requireUntrackedRuntimeDogfoodEnv,
  RESULTS_DIR,
  scrollLocalRuntimeOwnershipIntoView,
  scrollOpenChildTranscriptIntoView,
  scrollOperatorBarrierConsequenceIntoView,
  selectApprovalScope,
  setViewport,
  submitApprovalDecisionDialog,
  submitApprovalDialog,
  terminateApp,
  waitFor,
  waitForText,
  writeAccessibilitySnapshot,
  writeReport,
  writeScreenshot,
  type CdpClient,
} from "./subagentDesktopDogfoodE2eSupport";
import {
  inspectApprovalDenial,
  inspectApprovalDialog,
  inspectApprovalForwarding,
  inspectDeniedScopeExplanation,
  inspectEffectiveRoleSnapshot,
  inspectInlineChildTranscript,
  inspectLifecycleEdgeVisibility,
  inspectLocalRuntimeOwnership,
  inspectMultiClusterStress,
  inspectMutatingWorkerDogfood,
  inspectOperatorBehavior,
  inspectParentStopCascadeVisibility,
  inspectPatternGraphRuntime,
  inspectRestartRehydration,
  inspectSubagentUi,
  inspectWorkflowArtifactRehydration,
  inspectWorkflowExecution,
  inspectWorkflowHighLoad,
  inspectWorkflowRehydratedNavigation,
} from "./subagentDesktopDogfoodUiInspectors";

const dogfoodIt = DOGFOOD_ENABLED ? it : it.skip;
const phase5RecoveryDogfoodIt =
  DOGFOOD_ENABLED && process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_PHASE5_RECOVERY === "1" ? it : it.skip;

describe("sub-agent Desktop dogfood", () => {
  dogfoodIt("renders seeded sub-agent clusters in the full Electron app", async () => {
    const artifacts: Record<string, string> = {};
    const checks: Record<string, unknown> = {};
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let app: ChildProcess | undefined;
    let cdp: CdpClient | undefined;
    let seeded: SubagentDesktopDogfoodSeedResult | undefined;

    await mkdir(RESULTS_DIR, { recursive: true });

    try {
      const workspacePath = requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_WORKSPACE");
      const userDataPath = requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_USER_DATA");
      const seedPath = requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED");
      const chatExportPath = join(RESULTS_DIR, "desktop-chat-export.zip");
      seeded = await readSeed(seedPath);
      const untrackedRuntime = requireUntrackedRuntimeDogfoodEnv();

      const port = dogfoodCdpPort();
      app = launchDesktop({ port, workspacePath, userDataPath, chatExportPath });
      cdp = await connectToElectron(port, app);
      await cdp.send("Runtime.enable");
      await cdp.send("Page.enable");

      await setViewport(cdp, 1440, 900);
      await waitFor(cdp, () => Boolean(document.querySelector(".subagent-parent-cluster")));
      await waitForText(cdp, SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT);

      const collapsed = await inspectSubagentUi(cdp);
      checks.collapsed = collapsed;
      expect(collapsed.clusterCount).toBe(3 + seeded.stressParentMessageIds.length);
      expect(collapsed.defaultCollapsed).toBe(true);
      expect(collapsed.labels["Sub-agent threads"]).toBe(true);
      expect(collapsed.labels["2 children"]).toBe(true);
      expect(collapsed.labels["6 workflow tasks"]).toBe(true);
      expect(collapsed.labels["1 blocking"]).toBe(true);
      expect(collapsed.labels["1 workflow blocked"]).toBe(true);
      expect(collapsed.labels["1 attention"]).toBe(true);
      expect(collapsed.labels["1 failed spawn"]).toBe(true);
      expect(collapsed.labels["Needs attention"]).toBe(true);
      expect(collapsed.clusterAfterParentMessage).toBe(true);
      expect(collapsed.horizontalOverflowFree).toBe(true);

      artifacts.collapsedDesktopScreenshot = await writeScreenshot(cdp, "collapsed-desktop.png");
      const multiClusterStress = await inspectMultiClusterStress(cdp, {
        expectedClusterCount: 3 + seeded.stressParentMessageIds.length,
        stressParentTextPrefix: SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX,
        stressParentMessageIds: seeded.stressParentMessageIds,
        stressChildRunIds: seeded.stressChildRunIds,
        stressChildThreadIds: seeded.stressChildThreadIds,
      });
      checks.multiClusterStress = multiClusterStress;
      expect(multiClusterStress).toMatchObject({
        expectedClusterCountVisible: true,
        allClustersDefaultCollapsed: true,
        stressParentMessagesVisible: true,
        stressSummariesVisible: true,
        stressChildIdsCaptured: true,
        stressClustersAfterParentMessages: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.multiClusterStressDesktopScreenshot = await writeScreenshot(cdp, "multi-cluster-stress-desktop.png");

      await clickClusterSummary(cdp);
      await waitFor(cdp, () => document.querySelector(".subagent-parent-cluster")?.hasAttribute("open") ?? false);
      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childRunId === expected.childRunId &&
            candidate.dataset.childThreadId === expected.childThreadId
          );
        return Boolean(details?.open && details.querySelector(".subagent-parent-cluster-child-transcript"));
      }, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });

      const expanded = await inspectSubagentUi(cdp);
      checks.expanded = expanded;
      expect(expanded.defaultCollapsed).toBe(false);
      expect(expanded.labels["Review worker"]).toBe(true);
      expect(expanded.labels["Context summarizer"]).toBe(true);
      expect(expanded.labels["Blocking: approval"]).toBe(true);
      expect(expanded.labels["Approval requested"]).toBe(true);
      expect(expanded.labels["Allow workspace write"]).toBe(true);
      expect(expanded.labels["workspace.write"]).toBe(true);
      expect(expanded.labels["Approve child"]).toBe(true);
      expect(expanded.labels["Deny child"]).toBe(true);
      expect(expanded.labels["Waiting on child"]).toBe(true);
      expect(expanded.labels["Required all"]).toBe(true);
      expect(expanded.labels["Ask user on failure"]).toBe(true);
      expect(expanded.labels["Symphony Map-Reduce"]).toBe(true);
      expect(expanded.labels["Symphony Adversarial Debate"]).toBe(true);
      expect(expanded.labels["Symphony Imitate and Verify"]).toBe(true);
      expect(expanded.labels["Symphony Pipeline"]).toBe(true);
      expect(expanded.labels["Symphony Ensemble"]).toBe(true);
      expect(expanded.labels["Symphony Self-Healing Loop"]).toBe(true);
      expect(expanded.labels["Mutating child worker"]).toBe(true);
      expect(expanded.labels["Staged mutation: src/feature.txt"]).toBe(true);
      expect(expanded.labels["Parent workspace unchanged"]).toBe(true);
      expect(expanded.labels["Blocking: workflow work"]).toBe(true);
      expect(expanded.labels["Workflow blocked"]).toBe(true);
      expect(expanded.approvalFlow).toMatchObject({
        approvalRequested: true,
        approvalBlockedChild: true,
        parentStillBlocked: true,
        childIdentifierVisible: true,
        toolScopeVisible: true,
        approvalPromptVisible: true,
        approveButtonVisible: true,
        denyButtonVisible: true,
        approvalButtonsNameChild: true,
      });
      expect(expanded.approvalFlow.approvalButtons).toBeGreaterThanOrEqual(2);
      expect(expanded.operatorControls).toMatchObject({
        cancelActionVisible: true,
        closeAttentionChildVisible: true,
        closeCompletedChildVisible: true,
        cancelScopedToAttentionChild: true,
        noCancelForCompletedChild: true,
        closeTitlesPreserveTranscripts: true,
        controlsUseIconButtons: true,
        controlsNameChild: true,
        controlsNotDisabled: true,
        cancelButtons: 1,
        closeButtons: 2,
      });
      expect(expanded.warningToneCount).toBeGreaterThan(0);
      expect(expanded.childRows).toBe(2);
      expect(expanded.defaultExpandedBlockingChildren).toBeGreaterThanOrEqual(1);
      expect(expanded.inlineTranscriptBeforePatternGraphs).toBe(true);
      expect(expanded.horizontalOverflowFree).toBe(true);

      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childRunId === expected.childRunId &&
            candidate.dataset.childThreadId === expected.childThreadId
          );
        return Boolean(details?.open && details.querySelector(".subagent-parent-cluster-child-transcript"));
      }, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      await emitChildLiveActivity(cdp, {
        childThreadId: seeded.approvalChildThreadId,
        workspacePath,
      });
      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childThreadId === expected.childThreadId &&
            candidate.querySelector(".subagent-parent-cluster-child-run-activity .run-activity-line")
          );
        return Boolean(details);
      }, { childThreadId: seeded.approvalChildThreadId });
      const childTranscript = await inspectInlineChildTranscript(cdp, {
        childTitle: "Review worker",
        childThreadId: seeded.approvalChildThreadId,
        childRunId: seeded.approvalChildRunId,
        expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_USER_TEXT,
        expectedAssistantText: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_ASSISTANT_TEXT,
        expectedToolText: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_TOOL_RESULT_TEXT,
        forbiddenText: SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
      });
      checks.childTranscript = childTranscript;
      expect(childTranscript).toMatchObject({
        childExpanded: true,
        transcriptPanelVisible: true,
        liveTranscriptShellVisible: true,
        liveTranscriptStreamVisible: true,
        liveTranscriptStatusVisible: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        openFullThreadActionVisible: true,
        openFullThreadActionNamesChild: true,
        liveTranscriptMessageCountVisible: true,
        liveTranscriptRuntimeEventCountVisible: true,
        liveTranscriptMailboxEventCountVisible: true,
        liveTranscriptActivityCountVisible: true,
        liveTranscriptMessageCountMatchesBubbles: true,
        liveChildActivityVisible: true,
        liveChildActivityUsesParentChrome: true,
        liveChildActivityCountMatchesShell: true,
        liveChildActivityHasLines: true,
        liveTranscriptRuntimeEventCountPositive: true,
        liveTranscriptModeLabelVisible: true,
        runtimeEventRailVisible: true,
        runtimeEventRailHasRecentEvents: true,
        runtimeTimelineVisible: true,
        runtimeTimelineCountVisible: true,
        runtimeTimelineRenderedCountMatchesRows: true,
        runtimeTimelineOmittedCountConsistent: true,
        childMailboxEventCountPositive: true,
        childMailboxTimelineVisible: true,
        childMailboxTimelineCountVisible: true,
        childMailboxTimelineRenderedCountMatchesRows: true,
        childMailboxTimelineOmittedCountConsistent: true,
        childMailboxTimelineHasParentFollowup: true,
        userMessageVisible: true,
        assistantMessageVisible: true,
        toolCardVisible: true,
        toolCardCountMatchesData: true,
        toolCardUsesParentChrome: true,
        toolCardResultVisible: true,
        siblingSummaryNotLeakedIntoTranscript: true,
        childRunIdVisible: true,
        childThreadIdVisible: true,
        childTranscriptTerminal: false,
        liveContinuationMarkerVisible: true,
        completionEndCapVisible: false,
        completionSummaryDeferredWhileLive: true,
        transcriptEndStateCorrect: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      expect(childTranscript.messageBubbleCount).toBeGreaterThanOrEqual(2);
      expect(childTranscript.runtimeEventRows).toBeGreaterThan(0);
      expect(childTranscript.childMailboxRows).toBeGreaterThan(0);
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      artifacts.childTranscriptExpandedDesktopScreenshot = await writeScreenshot(cdp, "child-transcript-expanded-desktop.png");

      await clickChildTranscriptSummary(cdp, "Context summarizer");
      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childRunId === expected.childRunId &&
            candidate.dataset.childThreadId === expected.childThreadId
          );
        return Boolean(details?.open && details.querySelector(".subagent-parent-cluster-child-transcript"));
      }, {
        childRunId: seeded.completedChildRunId,
        childThreadId: seeded.completedChildThreadId,
      });
      const completedChildTranscript = await inspectInlineChildTranscript(cdp, {
        childTitle: "Context summarizer",
        childThreadId: seeded.completedChildThreadId,
        childRunId: seeded.completedChildRunId,
        expectedAssistantText: SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
        forbiddenText: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_ASSISTANT_TEXT,
      });
      checks.completedChildTranscript = completedChildTranscript;
      expect(completedChildTranscript).toMatchObject({
        childExpanded: true,
        transcriptPanelVisible: true,
        liveTranscriptShellVisible: true,
        liveTranscriptStreamVisible: true,
        liveTranscriptStatusVisible: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        openFullThreadActionVisible: true,
        openFullThreadActionNamesChild: true,
        liveTranscriptMessageCountVisible: true,
        liveTranscriptMessageCountMatchesBubbles: true,
        liveTranscriptModeLabelVisible: true,
        runtimeEventRailVisible: true,
        runtimeEventRailHasRecentEvents: true,
        runtimeTimelineVisible: true,
        runtimeTimelineCountVisible: true,
        runtimeTimelineRenderedCountMatchesRows: true,
        runtimeTimelineOmittedCountConsistent: true,
        assistantMessageVisible: true,
        siblingSummaryNotLeakedIntoTranscript: true,
        childRunIdVisible: true,
        childThreadIdVisible: true,
        childTranscriptTerminal: true,
        childTranscriptSynthesisSafe: true,
        liveContinuationMarkerVisible: false,
        completionEndCapVisible: true,
        completionEndCapLabelVisible: true,
        completionEndCapAfterMessages: true,
        transcriptEndStateCorrect: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      expect(completedChildTranscript.completionEndCapText).toContain("Completion summary");
      expect(completedChildTranscript.completionEndCapText).toContain("Completed");
      expect(completedChildTranscript.completionEndCapText).toContain("Context summarizer completed");
      expect(completedChildTranscript.messageBubbleCount).toBeGreaterThanOrEqual(1);
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: seeded.completedChildRunId,
        childThreadId: seeded.completedChildThreadId,
      });
      artifacts.completedChildTranscriptDesktopScreenshot = await writeScreenshot(cdp, "completed-child-transcript-desktop.png");
      await clickChildTranscriptSummary(cdp, "Context summarizer");
      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childRunId === expected.childRunId &&
            candidate.dataset.childThreadId === expected.childThreadId
          );
        return Boolean(details && !details.open);
      }, {
        childRunId: seeded.completedChildRunId,
        childThreadId: seeded.completedChildThreadId,
      });

      await clickChildAction(cdp, "Open child thread Review worker");
      await waitForText(cdp, "Reviewer + Mapper sub-agent");
      const standaloneChildThread = await inspectStandaloneChildThread(cdp, {
        parentThreadId: seeded.parentThreadId,
        childThreadId: seeded.approvalChildThreadId,
        childRunId: seeded.approvalChildRunId,
        expectedParentBarrierLabel: "Parent needs child steering",
        expectedParentBarrierDetail: "Blocking: needs steering",
        expectedAssistantText: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_ASSISTANT_TEXT,
        forbiddenText: SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
      });
      checks.standaloneChildThread = standaloneChildThread;
      expect(standaloneChildThread).toMatchObject({
        inspectorVisible: true,
        inspectorCollapsedByDefault: true,
        parentThreadIdVisible: true,
        parentBarrierVisible: true,
        parentBarrierLabelVisible: true,
        parentBarrierDetailVisible: true,
        parentOpenActionVisible: true,
        transcriptVisible: true,
        childAssistantVisible: true,
        transcriptPrecedesInspector: true,
        transcriptVerticallyPrecedesInspector: true,
        transcriptInspectorOverlapFree: true,
        siblingSummaryNotLeaked: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.standaloneChildThreadDesktopScreenshot = await writeScreenshot(cdp, "standalone-child-thread-desktop.png");
      await clickStandaloneChildParentAction(cdp, seeded.parentThreadId);
      await waitForText(cdp, SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT);
      await openPrimaryClusterIfClosed(cdp);
      await clickChildAction(cdp, "Open child thread Review worker");
      await waitForText(cdp, "Reviewer + Mapper sub-agent");
      await openSubagentThreadInspector(cdp);
      const effectiveRoleSnapshot = await inspectEffectiveRoleSnapshot(cdp);
      checks.effectiveRoleSnapshot = effectiveRoleSnapshot;
      expect(effectiveRoleSnapshot).toMatchObject({
        inspectorVisible: true,
        effectiveRoleVisible: true,
        patternRoleVisible: true,
        overlaysVisible: true,
        outputContractVisible: true,
        horizontalOverflowFree: true,
      });
      artifacts.effectiveRoleSnapshotDesktopScreenshot = await writeScreenshot(cdp, "effective-role-snapshot-desktop.png");
      await clickSidebarThread(cdp, "Sub-agent Desktop dogfood");
      await waitForText(cdp, SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT);
      await openPrimaryClusterIfClosed(cdp);

      const workflowExecution = await inspectWorkflowExecution(cdp, {
        taskId: seeded.workflowTaskId,
        artifactId: seeded.workflowArtifactId,
        runId: seeded.workflowRunId,
        threadId: seeded.workflowThreadId,
        mailboxEventId: seeded.workflowParentMailboxEventId,
      });
      checks.workflowExecution = workflowExecution;
      expect(workflowExecution).toMatchObject({
        workflowSectionVisible: true,
        taskVisible: true,
        statusRunningVisible: true,
        modeBlockingVisible: true,
        sourceSymphonyVisible: true,
        progressVisible: true,
        telemetryVisible: true,
        launchCardVisible: true,
        parentThreadProvenanceVisible: true,
        parentBlockerVisible: true,
        mailboxBlockVisible: true,
        taskIdVisible: true,
        artifactIdVisible: true,
        runIdVisible: true,
        threadIdVisible: true,
        pauseControlVisible: true,
        cancelControlVisible: true,
        openWorkflowThreadVisible: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });

      const mutatingWorkerDogfood = await inspectMutatingWorkerDogfood(cdp, {
        taskId: seeded.mutatingWorkflowTaskId,
        artifactId: seeded.mutatingWorkflowArtifactId,
        runId: seeded.mutatingWorkflowRunId,
        threadId: seeded.mutatingWorkflowThreadId,
        childRunId: seeded.mutatingWorkflowChildRunId,
        childThreadId: seeded.mutatingWorkflowChildThreadId,
        stagedRelativePath: seeded.mutatingWorkflowStagedRelativePath,
        reportRelativePath: seeded.mutatingWorkflowReportRelativePath,
        progressMessage: seeded.mutatingWorkflowProgressMessage,
      });
      checks.mutatingWorkerDogfood = mutatingWorkerDogfood;
      expect(mutatingWorkerDogfood).toMatchObject({
        taskVisible: true,
        statusSucceededVisible: true,
        modeBackgroundVisible: true,
        sourceSymphonyVisible: true,
        childCallerVisible: true,
        childRunVisible: true,
        childThreadVisible: true,
        approvalBridgeVisible: true,
        isolatedWorktreeVisible: true,
        nestedFanoutVisible: true,
        mutatingWorkerLabelVisible: true,
        stagedMutationVisible: true,
        parentWorkspaceUnchangedVisible: true,
        outputPreviewRetainedVisible: true,
        artifactIdVisible: true,
        runIdVisible: true,
        threadIdVisible: true,
        noPauseControlVisible: true,
        noCancelControlVisible: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });

      const workflowHighLoad = await inspectWorkflowHighLoad(cdp, {
        taskIds: seeded.workflowHighLoadTaskIds,
        artifactIds: seeded.workflowHighLoadArtifactIds,
        runIds: seeded.workflowHighLoadRunIds,
        threadIds: seeded.workflowHighLoadThreadIds,
        patternLabels: seeded.workflowHighLoadPatternLabels,
      });
      checks.workflowHighLoad = workflowHighLoad;
      expect(workflowHighLoad).toMatchObject({
        workflowSectionVisible: true,
        expectedWorkflowRowCountVisible: true,
        allPresetLabelsVisible: true,
        highLoadTaskIdsVisible: true,
        highLoadArtifactIdsVisible: true,
        highLoadRunIdsVisible: true,
        highLoadThreadIdsVisible: true,
        backgroundRowsVisible: true,
        completedRowsVisible: true,
        highLoadRowsHaveNoPauseCancel: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });

      const patternGraphRuntime = await inspectPatternGraphRuntime(cdp, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
        completedChildRunId: seeded.completedChildRunId,
        completedChildThreadId: seeded.completedChildThreadId,
        overflowChildRunId: seeded.overflowChildRunId,
        overflowChildThreadId: seeded.overflowChildThreadId,
        overflowChildLabel: seeded.overflowChildLabel,
        workflowTaskIds: [
          seeded.workflowTaskId,
          seeded.mutatingWorkflowTaskId,
          ...seeded.workflowHighLoadTaskIds,
        ],
        workflowRunIds: [
          seeded.workflowRunId,
          seeded.mutatingWorkflowRunId,
          ...seeded.workflowHighLoadRunIds,
        ],
        patternLabels: seeded.workflowHighLoadPatternLabels,
      });
      checks.patternGraphRuntime = patternGraphRuntime;
      expect(patternGraphRuntime).toMatchObject({
        graphSectionVisible: true,
        graphCountVisible: true,
        allPatternGraphsVisible: true,
        runtimeTaskBindingsVisible: true,
        runtimeRunBindingsVisible: true,
        childBindingVisible: true,
        childClickThroughAdvertised: true,
        childKeyboardOpenAdvertised: true,
        completedChildBindingVisible: true,
        completedChildClickThroughAdvertised: true,
        completedChildKeyboardOpenAdvertised: true,
        blockingBadgeVisible: true,
        approvalBadgeVisible: true,
        nodeBlockingBadgeVisible: true,
        nodeApprovalBadgeVisible: true,
        approvalBadgeOpenAdvertised: true,
        blockingEdgeVisible: true,
        overflowNodeVisible: true,
        overflowNodeExpandableAdvertised: true,
        overflowPanelInitiallyCollapsed: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });

      const patternGraphOverflowActivation = await clickPatternGraphOverflowNode(cdp, {
        overflowChildRunId: seeded.overflowChildRunId,
        overflowChildThreadId: seeded.overflowChildThreadId,
      });
      await waitFor(cdp, () => Boolean(document.querySelector(".subagent-pattern-graph-overflow-panel")));
      const patternGraphOverflowPanel = await inspectPatternGraphOverflowPanel(cdp, {
        overflowChildRunId: seeded.overflowChildRunId,
        overflowChildThreadId: seeded.overflowChildThreadId,
        overflowChildLabel: seeded.overflowChildLabel,
      });
      const patternGraphOverflowExpansion = {
        ...patternGraphOverflowActivation,
        ...patternGraphOverflowPanel,
      };
      checks.patternGraphOverflowExpansion = patternGraphOverflowExpansion;
      expect(patternGraphOverflowExpansion).toMatchObject({
        role: "button",
        expandedAfterClick: "true",
        keyboardOpenable: "true",
        panelVisible: true,
        panelNamesOverflowNode: true,
        groupedChildVisible: true,
        groupedChildIdentityVisible: true,
        groupedChildStatusVisible: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.patternGraphOverflowExpandedDesktopScreenshot = await writeScreenshot(cdp, "pattern-graph-overflow-expanded-desktop.png");

      await clickPatternGraphChildNode(cdp, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childRunId === expected.childRunId &&
            candidate.dataset.childThreadId === expected.childThreadId
          );
        return Boolean(details?.open && details.querySelector(".subagent-parent-cluster-child-transcript"));
      }, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      const patternGraphClickThrough = await inspectInlineChildTranscript(cdp, {
        childTitle: "Review worker",
        childThreadId: seeded.approvalChildThreadId,
        childRunId: seeded.approvalChildRunId,
      });
      checks.patternGraphClickThrough = patternGraphClickThrough;
      expect(patternGraphClickThrough).toMatchObject({
        childExpanded: true,
        transcriptPanelVisible: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        openFullThreadActionVisible: true,
        runtimeTimelineVisible: true,
        runtimeTimelineCountVisible: true,
        userMessageVisible: true,
        assistantMessageVisible: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      artifacts.patternGraphClickThroughDesktopScreenshot = await writeScreenshot(cdp, "pattern-graph-click-through-desktop.png");

      await clickPatternGraphChildNode(cdp, {
        childRunId: seeded.completedChildRunId,
        childThreadId: seeded.completedChildThreadId,
      });
      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childRunId === expected.childRunId &&
            candidate.dataset.childThreadId === expected.childThreadId
          );
        return Boolean(details?.open && details.querySelector(".subagent-parent-cluster-child-transcript"));
      }, {
        childRunId: seeded.completedChildRunId,
        childThreadId: seeded.completedChildThreadId,
      });
      const patternGraphCompletedClickThrough = await inspectInlineChildTranscript(cdp, {
        childTitle: "Context summarizer",
        childThreadId: seeded.completedChildThreadId,
        childRunId: seeded.completedChildRunId,
        expectedAssistantText: SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
        forbiddenText: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_ASSISTANT_TEXT,
      });
      checks.patternGraphCompletedClickThrough = patternGraphCompletedClickThrough;
      expect(patternGraphCompletedClickThrough).toMatchObject({
        childExpanded: true,
        transcriptPanelVisible: true,
        assistantMessageVisible: true,
        childTranscriptTerminal: true,
        childTranscriptSynthesisSafe: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        openFullThreadActionVisible: true,
        runtimeTimelineVisible: true,
        runtimeTimelineCountVisible: true,
        completionEndCapVisible: true,
        completionEndCapLabelVisible: true,
        completionEndCapAfterMessages: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: seeded.completedChildRunId,
        childThreadId: seeded.completedChildThreadId,
      });
      artifacts.patternGraphCompletedClickThroughDesktopScreenshot = await writeScreenshot(cdp, "pattern-graph-completed-click-through-desktop.png");
      await clickChildTranscriptSummary(cdp, "Context summarizer");
      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childRunId === expected.childRunId &&
            candidate.dataset.childThreadId === expected.childThreadId
          );
        return Boolean(details && !details.open);
      }, {
        childRunId: seeded.completedChildRunId,
        childThreadId: seeded.completedChildThreadId,
      });

      await collapseChildTranscriptIfOpen(cdp, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childRunId === expected.childRunId &&
            candidate.dataset.childThreadId === expected.childThreadId
          );
        return Boolean(details && !details.open);
      }, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      const patternGraphKeyboardActivationControl = await keyboardActivatePatternGraphChildNode(cdp, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
        key: "Enter",
      });
      await waitFor(cdp, (expected) => {
        const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
          .find((candidate) =>
            candidate.dataset.childRunId === expected.childRunId &&
            candidate.dataset.childThreadId === expected.childThreadId
          );
        return Boolean(details?.open && details.querySelector(".subagent-parent-cluster-child-transcript"));
      }, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      const patternGraphKeyboardActivationTranscript = await inspectInlineChildTranscript(cdp, {
        childTitle: "Review worker",
        childThreadId: seeded.approvalChildThreadId,
        childRunId: seeded.approvalChildRunId,
      });
      const patternGraphKeyboardActivation = {
        ...patternGraphKeyboardActivationTranscript,
        ...patternGraphKeyboardActivationControl,
      };
      checks.patternGraphKeyboardActivation = patternGraphKeyboardActivation;
      expect(patternGraphKeyboardActivation).toMatchObject({
        activeElementIsNode: true,
        role: "button",
        tabIndex: 0,
        focusable: "true",
        keyboardOpenable: "true",
        childExpanded: true,
        transcriptPanelVisible: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      expect(String(patternGraphKeyboardActivation.ariaKeyshortcuts)).toContain("Enter");
      expect(String(patternGraphKeyboardActivation.ariaKeyshortcuts)).toContain("Space");
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      artifacts.patternGraphKeyboardActivationDesktopScreenshot = await writeScreenshot(cdp, "pattern-graph-keyboard-activation-desktop.png");

      const deniedScopeExplanation = await inspectDeniedScopeExplanation(cdp, {
        parentMailboxEventId: seeded.deniedScopeParentMailboxEventId,
        childRunId: seeded.deniedScopeChildRunId,
        childThreadId: seeded.deniedScopeChildThreadId,
      });
      checks.deniedScopeExplanation = deniedScopeExplanation;
      expect(deniedScopeExplanation).toMatchObject({
        parentMailboxEventIdCaptured: true,
        spawnFailureVisible: true,
        approvalUnavailableVisible: true,
        deniedCategoryVisible: true,
        deniedToolVisible: true,
        sourceChildVisible: true,
        noInteractiveApprovalActions: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });

      artifacts.expandedDesktopScreenshot = await writeScreenshot(cdp, "expanded-desktop.png");
      artifacts.workflowExecutionDesktopScreenshot = await writeScreenshot(cdp, "workflow-execution-desktop.png");
      artifacts.mutatingWorkerDogfoodDesktopScreenshot = await writeScreenshot(cdp, "mutating-worker-dogfood-desktop.png");
      artifacts.workflowHighLoadDesktopScreenshot = await writeScreenshot(cdp, "workflow-high-load-desktop.png");
      artifacts.deniedScopeExplanationDesktopScreenshot = await writeScreenshot(cdp, "denied-scope-explanation-desktop.png");

      const lifecycleEdgeVisibility = await inspectLifecycleEdgeVisibility(cdp, {
        parentText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARENT_ASSISTANT_TEXT,
        parentMessageId: seeded.lifecycleEdgeParentMessageId,
        childRunIds: seeded.lifecycleEdgeChildRunIds,
        childThreadIds: seeded.lifecycleEdgeChildThreadIds,
        waitBarrierIds: seeded.lifecycleEdgeWaitBarrierIds,
      });
      checks.lifecycleEdgeVisibility = lifecycleEdgeVisibility;
      expect(lifecycleEdgeVisibility).toMatchObject({
        parentMessageVisible: true,
        clusterVisible: true,
        clusterDefaultCollapsedBeforeOpen: true,
        summaryVisible: true,
        timeoutChildVisible: true,
        partialChildVisible: true,
        retryChildVisible: true,
        detachedChildVisible: true,
        timeoutAttentionVisible: true,
        timeoutChoicesVisible: true,
        partialDecisionVisible: true,
        partialSummaryVisible: true,
        retryDecisionVisible: true,
        retryEffectVisible: true,
        retryAcceptedEffectVisible: true,
        retryMailboxVisible: true,
        detachDecisionVisible: true,
        detachedEffectVisible: true,
        edgeIdentityCaptured: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.lifecycleEdgeVisibilityDesktopScreenshot = await writeScreenshot(cdp, "lifecycle-edge-visibility-desktop.png");

      const [
        lifecycleTimeoutChildRunId,
        lifecyclePartialChildRunId,
      ] = seeded.lifecycleEdgeChildRunIds;
      const [
        lifecycleTimeoutChildThreadId,
        lifecyclePartialChildThreadId,
      ] = seeded.lifecycleEdgeChildThreadIds;
      if (!lifecycleTimeoutChildRunId || !lifecycleTimeoutChildThreadId) {
        throw new Error("Desktop dogfood expected a timeout lifecycle child run and thread.");
      }
      if (!lifecyclePartialChildRunId || !lifecyclePartialChildThreadId) {
        throw new Error("Desktop dogfood expected a partial lifecycle child run and thread.");
      }
      await ensureChildTranscriptOpen(cdp, {
        childRunId: lifecycleTimeoutChildRunId,
        childThreadId: lifecycleTimeoutChildThreadId,
      });
      const lifecycleTimeoutChildTranscript = await inspectInlineChildTranscript(cdp, {
        childTitle: "Timeout edge worker",
        childThreadId: lifecycleTimeoutChildThreadId,
        childRunId: lifecycleTimeoutChildRunId,
        expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_USER_TEXT,
        expectedAssistantText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_ASSISTANT_TEXT,
        forbiddenText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_ASSISTANT_TEXT,
      });
      checks.lifecycleTimeoutChildTranscript = lifecycleTimeoutChildTranscript;
      expect(lifecycleTimeoutChildTranscript).toMatchObject({
        childExpanded: true,
        transcriptPanelVisible: true,
        liveTranscriptShellVisible: true,
        liveTranscriptStreamVisible: true,
        liveTranscriptStatusVisible: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        openFullThreadActionVisible: true,
        openFullThreadActionNamesChild: true,
        liveTranscriptMessageCountVisible: true,
        liveTranscriptMessageCountMatchesBubbles: true,
        liveTranscriptModeLabelVisible: true,
        runtimeTimelineVisible: true,
        runtimeTimelineCountVisible: true,
        runtimeTimelineRenderedCountMatchesRows: true,
        runtimeTimelineOmittedCountConsistent: true,
        userMessageVisible: true,
        assistantMessageVisible: true,
        siblingSummaryNotLeakedIntoTranscript: true,
        childRunIdVisible: true,
        childThreadIdVisible: true,
        childTranscriptTerminal: true,
        childTranscriptSynthesisSafe: false,
        liveContinuationMarkerVisible: false,
        completionEndCapVisible: true,
        finalStatusEndCapLabelVisible: true,
        terminalEndCapLabelVisible: true,
        completionEndCapAfterMessages: true,
        transcriptEndStateCorrect: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      expect(lifecycleTimeoutChildTranscript.completionEndCapText).toContain("Final child status");
      expect(lifecycleTimeoutChildTranscript.completionEndCapText).toContain("Timed Out");
      expect(lifecycleTimeoutChildTranscript.completionEndCapText)
        .toContain(SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_ASSISTANT_TEXT);
      expect(lifecycleTimeoutChildTranscript.messageBubbleCount).toBeGreaterThanOrEqual(2);
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: lifecycleTimeoutChildRunId,
        childThreadId: lifecycleTimeoutChildThreadId,
      });
      artifacts.lifecycleTimeoutChildTranscriptDesktopScreenshot =
        await writeScreenshot(cdp, "lifecycle-timeout-child-transcript-desktop.png");
      await collapseChildTranscriptIfOpen(cdp, {
        childRunId: lifecycleTimeoutChildRunId,
        childThreadId: lifecycleTimeoutChildThreadId,
      });

      await ensureChildTranscriptOpen(cdp, {
        childRunId: lifecyclePartialChildRunId,
        childThreadId: lifecyclePartialChildThreadId,
      });
      const lifecyclePartialChildTranscript = await inspectInlineChildTranscript(cdp, {
        childTitle: "Partial recovery worker",
        childThreadId: lifecyclePartialChildThreadId,
        childRunId: lifecyclePartialChildRunId,
        expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_USER_TEXT,
        expectedAssistantText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_ASSISTANT_TEXT,
        forbiddenText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_ASSISTANT_TEXT,
      });
      checks.lifecyclePartialChildTranscript = lifecyclePartialChildTranscript;
      expect(lifecyclePartialChildTranscript).toMatchObject({
        childExpanded: true,
        transcriptPanelVisible: true,
        liveTranscriptShellVisible: true,
        liveTranscriptStreamVisible: true,
        liveTranscriptStatusVisible: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        openFullThreadActionVisible: true,
        openFullThreadActionNamesChild: true,
        liveTranscriptMessageCountVisible: true,
        liveTranscriptMessageCountMatchesBubbles: true,
        liveTranscriptModeLabelVisible: true,
        runtimeTimelineVisible: true,
        runtimeTimelineCountVisible: true,
        runtimeTimelineRenderedCountMatchesRows: true,
        runtimeTimelineOmittedCountConsistent: true,
        userMessageVisible: true,
        assistantMessageVisible: true,
        siblingSummaryNotLeakedIntoTranscript: true,
        childRunIdVisible: true,
        childThreadIdVisible: true,
        childTranscriptTerminal: true,
        childTranscriptSynthesisSafe: false,
        liveContinuationMarkerVisible: false,
        completionEndCapVisible: true,
        finalStatusEndCapLabelVisible: true,
        terminalEndCapLabelVisible: true,
        completionEndCapAfterMessages: true,
        transcriptEndStateCorrect: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      expect(lifecyclePartialChildTranscript.completionEndCapText).toContain("Final child status");
      expect(lifecyclePartialChildTranscript.completionEndCapText).toContain("Aborted Partial");
      expect(lifecyclePartialChildTranscript.completionEndCapText)
        .toContain("Parent recorded a wait-barrier decision: continue_with_partial");
      expect(lifecyclePartialChildTranscript.messageBubbleCount).toBeGreaterThanOrEqual(2);
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: lifecyclePartialChildRunId,
        childThreadId: lifecyclePartialChildThreadId,
      });
      artifacts.lifecyclePartialChildTranscriptDesktopScreenshot =
        await writeScreenshot(cdp, "lifecycle-partial-child-transcript-desktop.png");

      const parentStopCascadeVisibility = await inspectParentStopCascadeVisibility(cdp, {
        parentText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_CASCADE_PARENT_ASSISTANT_TEXT,
        parentMessageId: seeded.parentStopCascadeParentMessageId,
        parentMailboxEventId: seeded.parentStopCascadeParentMailboxEventId,
        childRunIds: seeded.parentStopCascadeChildRunIds,
        childThreadIds: seeded.parentStopCascadeChildThreadIds,
        waitBarrierIds: seeded.parentStopCascadeWaitBarrierIds,
        cancelledRunIds: seeded.parentStopCascadeCancelledRunIds,
        detachedRunIds: seeded.parentStopCascadeDetachedRunIds,
        unchangedRunIds: seeded.parentStopCascadeUnchangedRunIds,
        cancelledWaitBarrierIds: seeded.parentStopCascadeCancelledWaitBarrierIds,
        cancelledMailboxEventIds: seeded.parentStopCascadeCancelledMailboxEventIds,
      });
      checks.parentStopCascadeVisibility = parentStopCascadeVisibility;
      expect(parentStopCascadeVisibility).toMatchObject({
        parentMessageVisible: true,
        clusterVisible: true,
        clusterDefaultCollapsedBeforeOpen: true,
        summaryVisible: true,
        requiredChildCancelledVisible: true,
        optionalChildDetachedVisible: true,
        completedChildUnchangedVisible: true,
        parentStoppedMailboxVisible: true,
        parentCancellationRequestedVisible: true,
        cancelledWaitBarrierVisible: true,
        cancelledMailboxEventsVisible: true,
        cascadeReasonVisible: true,
        cascadeIdentityCaptured: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.parentStopCascadeDesktopScreenshot = await writeScreenshot(cdp, "parent-stop-cascade-desktop.png");

      const [
        parentStopRequiredChildRunId,
        parentStopBackgroundChildRunId,
        parentStopCompletedChildRunId,
      ] = seeded.parentStopCascadeChildRunIds;
      const [
        parentStopRequiredChildThreadId,
        parentStopBackgroundChildThreadId,
        parentStopCompletedChildThreadId,
      ] = seeded.parentStopCascadeChildThreadIds;
      if (!parentStopRequiredChildRunId || !parentStopRequiredChildThreadId) {
        throw new Error("Desktop dogfood expected a required parent-stop child run and thread.");
      }
      if (!parentStopBackgroundChildRunId || !parentStopBackgroundChildThreadId) {
        throw new Error("Desktop dogfood expected a background parent-stop child run and thread.");
      }
      if (!parentStopCompletedChildRunId || !parentStopCompletedChildThreadId) {
        throw new Error("Desktop dogfood expected a completed parent-stop child run and thread.");
      }

      await ensureChildTranscriptOpen(cdp, {
        childRunId: parentStopRequiredChildRunId,
        childThreadId: parentStopRequiredChildThreadId,
      });
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: parentStopRequiredChildRunId,
        childThreadId: parentStopRequiredChildThreadId,
      });
      const parentStopRequiredChildTranscript = await inspectInlineChildTranscript(cdp, {
        childTitle: "Parent-stop required worker",
        childThreadId: parentStopRequiredChildThreadId,
        childRunId: parentStopRequiredChildRunId,
        expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_USER_TEXT,
        expectedAssistantText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_ASSISTANT_TEXT,
        forbiddenText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_ASSISTANT_TEXT,
      });
      checks.parentStopRequiredChildTranscript = parentStopRequiredChildTranscript;
      expect(parentStopRequiredChildTranscript).toMatchObject({
        childExpanded: true,
        transcriptPanelVisible: true,
        liveTranscriptShellVisible: true,
        liveTranscriptStreamVisible: true,
        liveTranscriptStatusVisible: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        openFullThreadActionVisible: true,
        openFullThreadActionNamesChild: true,
        liveTranscriptMessageCountVisible: true,
        liveTranscriptMessageCountMatchesBubbles: true,
        liveTranscriptModeLabelVisible: true,
        runtimeTimelineVisible: true,
        runtimeTimelineCountVisible: true,
        runtimeTimelineRenderedCountMatchesRows: true,
        runtimeTimelineOmittedCountConsistent: true,
        userMessageVisible: true,
        assistantMessageVisible: true,
        siblingSummaryNotLeakedIntoTranscript: true,
        childRunIdVisible: true,
        childThreadIdVisible: true,
        childTranscriptTerminal: true,
        childTranscriptSynthesisSafe: false,
        liveContinuationMarkerVisible: false,
        completionEndCapVisible: true,
        finalStatusEndCapLabelVisible: true,
        terminalEndCapLabelVisible: true,
        completionEndCapAfterMessages: true,
        transcriptEndStateCorrect: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      expect(parentStopRequiredChildTranscript.completionEndCapText).toContain("Final child status");
      expect(parentStopRequiredChildTranscript.completionEndCapText).toContain("Cancelled");
      expect(parentStopRequiredChildTranscript.messageBubbleCount).toBeGreaterThanOrEqual(2);
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: parentStopRequiredChildRunId,
        childThreadId: parentStopRequiredChildThreadId,
      });
      artifacts.parentStopRequiredChildTranscriptDesktopScreenshot =
        await writeScreenshot(cdp, "parent-stop-required-child-transcript-desktop.png");

      await ensureChildTranscriptOpen(cdp, {
        childRunId: parentStopBackgroundChildRunId,
        childThreadId: parentStopBackgroundChildThreadId,
      });
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: parentStopBackgroundChildRunId,
        childThreadId: parentStopBackgroundChildThreadId,
      });
      const parentStopBackgroundChildTranscript = await inspectInlineChildTranscript(cdp, {
        childTitle: "Parent-stop background worker",
        childThreadId: parentStopBackgroundChildThreadId,
        childRunId: parentStopBackgroundChildRunId,
        expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_USER_TEXT,
        expectedAssistantText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_ASSISTANT_TEXT,
        forbiddenText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_ASSISTANT_TEXT,
      });
      checks.parentStopBackgroundChildTranscript = parentStopBackgroundChildTranscript;
      expect(parentStopBackgroundChildTranscript).toMatchObject({
        childExpanded: true,
        transcriptPanelVisible: true,
        liveTranscriptShellVisible: true,
        liveTranscriptStreamVisible: true,
        liveTranscriptStatusVisible: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        openFullThreadActionVisible: true,
        openFullThreadActionNamesChild: true,
        liveTranscriptMessageCountVisible: true,
        liveTranscriptMessageCountMatchesBubbles: true,
        liveTranscriptModeLabelVisible: true,
        runtimeTimelineVisible: true,
        runtimeTimelineCountVisible: true,
        runtimeTimelineRenderedCountMatchesRows: true,
        runtimeTimelineOmittedCountConsistent: true,
        userMessageVisible: true,
        assistantMessageVisible: true,
        siblingSummaryNotLeakedIntoTranscript: true,
        childRunIdVisible: true,
        childThreadIdVisible: true,
        childTranscriptTerminal: true,
        childTranscriptSynthesisSafe: false,
        liveContinuationMarkerVisible: false,
        completionEndCapVisible: true,
        finalStatusEndCapLabelVisible: true,
        terminalEndCapLabelVisible: true,
        completionEndCapAfterMessages: true,
        transcriptEndStateCorrect: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      expect(parentStopBackgroundChildTranscript.completionEndCapText).toContain("Final child status");
      expect(parentStopBackgroundChildTranscript.completionEndCapText).toContain("Detached");
      expect(parentStopBackgroundChildTranscript.messageBubbleCount).toBeGreaterThanOrEqual(2);
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: parentStopBackgroundChildRunId,
        childThreadId: parentStopBackgroundChildThreadId,
      });
      artifacts.parentStopBackgroundChildTranscriptDesktopScreenshot =
        await writeScreenshot(cdp, "parent-stop-background-child-transcript-desktop.png");

      await ensureChildTranscriptOpen(cdp, {
        childRunId: parentStopCompletedChildRunId,
        childThreadId: parentStopCompletedChildThreadId,
      });
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: parentStopCompletedChildRunId,
        childThreadId: parentStopCompletedChildThreadId,
      });
      const parentStopCompletedChildTranscript = await inspectInlineChildTranscript(cdp, {
        childTitle: "Parent-stop completed worker",
        childThreadId: parentStopCompletedChildThreadId,
        childRunId: parentStopCompletedChildRunId,
        expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_USER_TEXT,
        expectedAssistantText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_ASSISTANT_TEXT,
        forbiddenText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_ASSISTANT_TEXT,
      });
      checks.parentStopCompletedChildTranscript = parentStopCompletedChildTranscript;
      expect(parentStopCompletedChildTranscript).toMatchObject({
        childExpanded: true,
        transcriptPanelVisible: true,
        liveTranscriptShellVisible: true,
        liveTranscriptStreamVisible: true,
        liveTranscriptStatusVisible: true,
        miniThreadHeaderVisible: true,
        miniThreadHeaderNamesChild: true,
        openFullThreadActionVisible: true,
        openFullThreadActionNamesChild: true,
        liveTranscriptMessageCountVisible: true,
        liveTranscriptMessageCountMatchesBubbles: true,
        liveTranscriptModeLabelVisible: true,
        runtimeTimelineVisible: true,
        runtimeTimelineCountVisible: true,
        runtimeTimelineRenderedCountMatchesRows: true,
        runtimeTimelineOmittedCountConsistent: true,
        userMessageVisible: true,
        assistantMessageVisible: true,
        siblingSummaryNotLeakedIntoTranscript: true,
        childRunIdVisible: true,
        childThreadIdVisible: true,
        childTranscriptTerminal: true,
        childTranscriptSynthesisSafe: true,
        liveContinuationMarkerVisible: false,
        completionEndCapVisible: true,
        completionEndCapLabelVisible: true,
        terminalEndCapLabelVisible: true,
        completionEndCapAfterMessages: true,
        transcriptEndStateCorrect: true,
        transcriptEndClearsComposer: true,
        summaryNotObscuringTranscript: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      expect(parentStopCompletedChildTranscript.completionEndCapText).toContain("Completion summary");
      expect(parentStopCompletedChildTranscript.completionEndCapText).toContain("Completed");
      expect(parentStopCompletedChildTranscript.messageBubbleCount).toBeGreaterThanOrEqual(2);
      await scrollOpenChildTranscriptIntoView(cdp, {
        childRunId: parentStopCompletedChildRunId,
        childThreadId: parentStopCompletedChildThreadId,
      });
      artifacts.parentStopCompletedChildTranscriptDesktopScreenshot =
        await writeScreenshot(cdp, "parent-stop-completed-child-transcript-desktop.png");

      artifacts.accessibilitySnapshot = await writeAccessibilitySnapshot(cdp, "expanded-accessibility.json");

      const patternGraphApprovalBadgeActivation = await clickPatternGraphApprovalBadge(cdp, {
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
        approvalId: seeded.approvalId,
      });
      await waitFor(cdp, () => Boolean(document.querySelector(".subagent-approval-dialog")));
      const patternGraphApprovalBadgeDialogInspection = await inspectApprovalDialog(cdp, {
        approvalId: seeded.approvalId,
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      const patternGraphApprovalBadgeDialog = {
        ...patternGraphApprovalBadgeDialogInspection,
        badge: patternGraphApprovalBadgeActivation,
      };
      checks.patternGraphApprovalBadgeDialog = patternGraphApprovalBadgeDialog;
      expect(patternGraphApprovalBadgeDialog).toMatchObject({
        dialogOpened: true,
        dialogNamesApproval: true,
        dialogNamesChildRun: true,
        dialogNamesChildThread: true,
        dialogNamesBlockingChild: true,
        dialogShowsParentWaitState: true,
        dialogShowsPrompt: true,
        dialogShowsStandardScopes: true,
        initialScopeThisAction: true,
        badge: {
          role: "button",
          tabIndex: 0,
          focusable: "true",
          approvalId: seeded.approvalId,
          childRunId: seeded.approvalChildRunId,
          childThreadId: seeded.approvalChildThreadId,
          openable: "true",
          busy: "false",
        },
      });
      expect(String(patternGraphApprovalBadgeActivation.ariaLabel)).toContain(seeded.approvalId);
      expect(String(patternGraphApprovalBadgeActivation.ariaLabel)).toContain("Review worker");
      expect(String(patternGraphApprovalBadgeActivation.ariaKeyshortcuts)).toContain("Enter");
      expect(String(patternGraphApprovalBadgeActivation.ariaKeyshortcuts)).toContain("Space");
      artifacts.patternGraphApprovalBadgeDialogScreenshot = await writeScreenshot(cdp, "pattern-graph-approval-badge-dialog.png");
      await dismissApprovalDialog(cdp);

      await clickMailboxAction(cdp, "Approve child", "desktop-dogfood-approval-write");
      await waitFor(cdp, () => Boolean(document.querySelector(".subagent-approval-dialog")));
      const approvalDialog = await inspectApprovalDialog(cdp, {
        approvalId: seeded.approvalId,
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      checks.approvalDialog = approvalDialog;
      expect(approvalDialog).toMatchObject({
        dialogOpened: true,
        dialogNamesApproval: true,
        dialogNamesChildRun: true,
        dialogNamesChildThread: true,
        dialogNamesBlockingChild: true,
        dialogShowsParentWaitState: true,
        dialogShowsPrompt: true,
        dialogShowsStandardScopes: true,
        initialScopeThisAction: true,
      });
      artifacts.approvalDialogScreenshot = await writeScreenshot(cdp, "approval-forwarding-dialog.png");
      await selectApprovalScope(cdp, "this_child_thread");
      await submitApprovalDialog(cdp);
      await waitFor(cdp, () => document.body.innerText.includes("Approval forwarded"));

      const approvalForwarding = await inspectApprovalForwarding(cdp, {
        approvalId: seeded.approvalId,
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
        canonicalTaskPath: "root/0:reviewer",
      });
      checks.approvalForwarding = approvalForwarding;
      expect(approvalForwarding).toMatchObject({
        forwardedVisible: true,
        approvedDecisionVisible: true,
        childThreadScopeVisible: true,
        childScopedPersistenceVisible: true,
        parentResumeAfterApprovalVisible: true,
        forwardedNamesChild: true,
        forwardedNamesApproval: true,
        forwardedMatchesApprovalChild: true,
        approvalRequestMatchesApprovalChild: true,
        forwardedAndRequestSameChild: true,
        approvalRequestStillVisible: true,
        approvalRequestActionsRemoved: true,
        parentStillBlockedAfterForward: true,
        childRowDataMatchesApprovalChild: true,
        childRowStillBlocksApprovalChild: true,
        childReturnedToNeedsSteering: true,
        waitBarrierStillVisible: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.approvalForwardingDesktopScreenshot = await writeScreenshot(cdp, "approval-forwarded-desktop.png");

      cdp.close();
      cdp = undefined;
      await terminateApp(app);
      app = undefined;

      const restartPort = await getAvailablePort();
      app = launchDesktop({ port: restartPort, workspacePath, userDataPath, chatExportPath });
      cdp = await connectToElectron(restartPort, app);
      await cdp.send("Runtime.enable");
      await cdp.send("Page.enable");
      await setViewport(cdp, 1440, 900);
      await waitFor(cdp, () => Boolean(document.querySelector(".subagent-parent-cluster")));
      await waitForText(cdp, SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT);

      const restartCollapsed = await inspectSubagentUi(cdp);
      expect(restartCollapsed.defaultCollapsed).toBe(true);
      expect(restartCollapsed.clusterAfterParentMessage).toBe(true);
      await clickClusterSummary(cdp);
      await waitFor(cdp, () => document.querySelector(".subagent-parent-cluster")?.hasAttribute("open") ?? false);

      const restartRehydration = await inspectRestartRehydration(cdp, {
        approvalId: seeded.approvalId,
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
        workflowTaskId: seeded.workflowTaskId,
        workflowArtifactId: seeded.workflowArtifactId,
        workflowRunId: seeded.workflowRunId,
        workflowThreadId: seeded.workflowThreadId,
        mutatingWorkflowTaskId: seeded.mutatingWorkflowTaskId,
        mutatingWorkflowArtifactId: seeded.mutatingWorkflowArtifactId,
        mutatingWorkflowRunId: seeded.mutatingWorkflowRunId,
        workflowHighLoadTaskIds: seeded.workflowHighLoadTaskIds,
        workflowHighLoadArtifactIds: seeded.workflowHighLoadArtifactIds,
        workflowHighLoadRunIds: seeded.workflowHighLoadRunIds,
        workflowHighLoadPatternLabels: seeded.workflowHighLoadPatternLabels,
        defaultCollapsedAfterRelaunch: restartCollapsed.defaultCollapsed,
      });
      checks.restartRehydration = restartRehydration;
      expect(restartRehydration).toMatchObject({
        defaultCollapsedAfterRelaunch: true,
        expandedAfterRelaunch: true,
        parentMessageVisible: true,
        approvalForwardedRehydrated: true,
        approvalRequestRehydrated: true,
        approvalActionsStillRemoved: true,
        parentStillBlockedAfterRelaunch: true,
        childBlockerRehydrated: true,
        childRunIdRehydrated: true,
        childThreadIdRehydrated: true,
        completedChildResultSummaryRehydrated: true,
        workflowTaskRehydrated: true,
        workflowBlockerRehydrated: true,
        workflowMailboxBlockRehydrated: true,
        workflowArtifactRehydrated: true,
        workflowRunRehydrated: true,
        workflowThreadRehydrated: true,
        mutatingWorkflowTaskRehydrated: true,
        mutatingWorkflowArtifactRehydrated: true,
        mutatingWorkflowRunRehydrated: true,
        workflowHighLoadTasksRehydrated: true,
        workflowHighLoadArtifactsRehydrated: true,
        workflowHighLoadRunsRehydrated: true,
        patternGraphsRehydrated: true,
        patternGraphChildBindingRehydrated: true,
        patternGraphRuntimeBindingsRehydrated: true,
        childRowsRehydrated: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.restartRehydrationDesktopScreenshot = await writeScreenshot(cdp, "restart-rehydration-desktop.png");

      await openSettingsPanel(cdp);
      await clickSettingsSection(cdp, "Local Models");
      await waitForText(cdp, "In use by sub-agent Review worker");
      await scrollLocalRuntimeOwnershipIntoView(cdp);
      await delay(100);
      const localRuntimeOwnership = await inspectLocalRuntimeOwnership(cdp, {
        leaseId: seeded.localRuntimeLeaseId,
        runtimeId: seeded.localRuntimeId,
        pid: seeded.localRuntimePid,
        endpoint: SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ENDPOINT,
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
        untrackedRuntime,
      });
      checks.localRuntimeOwnership = localRuntimeOwnership;
      artifacts.localRuntimeOwnershipDesktopScreenshot = await writeScreenshot(cdp, "local-runtime-ownership-desktop.png");
      expect(localRuntimeOwnership).toMatchObject({
        settingsPanelVisible: true,
        localModelsSectionVisible: true,
        runtimeInventoryVisible: true,
        activeLeaseVisible: true,
        ownerLabelVisible: true,
        managedRunningVisible: true,
        localTextCapabilityVisible: true,
        stopDisabledVisible: true,
        restartDisabledVisible: true,
        forceConsequenceVisible: true,
        blockerLeaseVisible: true,
        affectedSubagentVisible: true,
        childRunIdVisible: true,
        childThreadIdVisible: true,
        runtimeIdVisible: true,
        pidVisible: true,
        endpointVisible: true,
        ordinaryStopReasonVisible: true,
        untrackedRuntimeVisible: true,
        untrackedRuntimeIdVisible: true,
        untrackedRuntimePidVisible: true,
        untrackedRuntimeEndpointVisible: true,
        untrackedRuntimeModelVisible: true,
        untrackedStopDisabledVisible: true,
        untrackedRestartDisabledVisible: true,
        untrackedForceUnavailableVisible: true,
        untrackedExternalStopGuidanceVisible: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      await closeSettingsPanel(cdp);
      await waitFor(cdp, () => !document.querySelector(".right-panel.settings-panel-host"));

      await setViewport(cdp, 520, 900);
      await delay(100);
      const narrow = await inspectSubagentUi(cdp);
      checks.narrow = narrow;
      expect(narrow.horizontalOverflowFree).toBe(true);
      expect(narrow.criticalOverlapCount).toBe(0);
      expect(narrow.clusterWithinViewport).toBe(true);
      expect(narrow.operatorControls).toMatchObject({
        cancelActionVisible: true,
        closeAttentionChildVisible: true,
        closeCompletedChildVisible: true,
        noCancelForCompletedChild: true,
        controlsUseIconButtons: true,
      });

      artifacts.expandedNarrowScreenshot = await writeScreenshot(cdp, "expanded-narrow.png");

      await setViewport(cdp, 1440, 900);
      await delay(100);
      await clickChildAction(cdp, "Close sub-agent Context summarizer");
      await waitFor(cdp, () => {
        const rows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row")]
          .map((row) => row.innerText);
        const summarizer = rows.find((row) => row.includes("Context summarizer"));
        return Boolean(summarizer?.includes("Closed"));
      });
      await clickChildAction(cdp, "Cancel sub-agent Review worker");
      await waitFor(cdp, () => {
        const rows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row")]
          .map((row) => row.innerText);
        const review = rows.find((row) => row.includes("Review worker"));
        return Boolean(review?.includes("Cancelled"));
      });

      const operatorBehavior = await inspectOperatorBehavior(cdp);
      checks.operatorBehavior = operatorBehavior;
      expect(operatorBehavior).toMatchObject({
        completedChildClosed: true,
        completedChildStillVisible: true,
        completedChildControlsReleased: true,
        attentionChildCancelled: true,
        attentionChildStillVisible: true,
        attentionCancelControlRemoved: true,
        siblingStatePreserved: true,
        lifecycleInterruptionVisible: true,
        typedBarrierConsequenceVisible: true,
        rowsStillInspectable: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      await scrollOperatorBarrierConsequenceIntoView(cdp);
      artifacts.operatorBehaviorDesktopScreenshot = await writeScreenshot(cdp, "operator-behavior-desktop.png");

      await clickWorkflowTaskAction(cdp, "Open workflow thread for Symphony Map-Reduce");
      await waitFor(cdp, (expectedTitle) => {
        const activeThreadRow = [...document.querySelectorAll<HTMLElement>(".automation-thread-row.active")]
          .find((row) => row.innerText.includes(expectedTitle) || (row.getAttribute("title") ?? "").includes(expectedTitle));
        const heading = document.querySelector<HTMLElement>(".automation-workspace-header h1");
        return Boolean(
          document.querySelector(".automation-workspace") &&
          activeThreadRow &&
          (heading?.innerText.includes(expectedTitle) || (heading?.getAttribute("title") ?? "").includes(expectedTitle))
        );
      }, "Desktop Dogfood Symphony Map-Reduce");
      const workflowRehydratedNavigation = await inspectWorkflowRehydratedNavigation(cdp, {
        workflowTitle: "Desktop Dogfood Symphony Map-Reduce",
        workflowThreadId: seeded.workflowThreadId,
      });
      checks.workflowRehydratedNavigation = workflowRehydratedNavigation;
      expect(workflowRehydratedNavigation).toMatchObject({
        workflowAutomationPaneVisible: true,
        workflowThreadHeaderVisible: true,
        workflowThreadSidebarSelected: true,
        workflowThreadTitleVisible: true,
        workflowThreadFolderLinkPresent: true,
        workflowThreadMatchesExpectedId: true,
        legacyOrThreadPaneVisible: true,
        navigationErrorAbsent: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.workflowRehydratedNavigationDesktopScreenshot = await writeScreenshot(cdp, "workflow-rehydrated-navigation-desktop.png");

      await clickWorkflowOpenAudit(cdp);
      await waitFor(cdp, (expectedRunId) => document.body.innerText.includes(expectedRunId), seeded.workflowRunId);
      await clickWorkflowBuildPanel(cdp, "build-source");
      await waitFor(
        cdp,
        (expectedSourceContent) =>
          Boolean(document.querySelector(".workflow-artifact-source-panel")) &&
          document.body.innerText.includes(expectedSourceContent.trim()),
        seeded.workflowArtifactSourceContent,
      );
      const workflowArtifactRehydration = await inspectWorkflowArtifactRehydration(cdp, {
        workflowTitle: "Desktop Dogfood Symphony Map-Reduce",
        workflowArtifactId: seeded.workflowArtifactId,
        workflowRunId: seeded.workflowRunId,
        workflowThreadId: seeded.workflowThreadId,
        sourceRelativePath: seeded.workflowArtifactSourceRelativePath,
        stateRelativePath: seeded.workflowArtifactStateRelativePath,
        sourceContent: seeded.workflowArtifactSourceContent,
      });
      checks.workflowArtifactRehydration = workflowArtifactRehydration;
      expect(workflowArtifactRehydration).toMatchObject({
        workflowBuildWorkspaceVisible: true,
        sourcePanelSelected: true,
        artifactTitleVisible: true,
        artifactIdMatchesLinkedThread: true,
        runDetailLoaded: true,
        sourcePathVisible: true,
        statePathVisible: true,
        sourceContentVisible: true,
        sourceContentMatchesExpected: true,
        noSourceReadError: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.workflowArtifactRehydrationDesktopScreenshot = await writeScreenshot(cdp, "workflow-artifact-rehydration-desktop.png");

      const chatExport = await exportChatAndInspectChildBundle(cdp, {
        parentThreadId: seeded.parentThreadId,
        exportPath: chatExportPath,
        expectedChildRuns: [
          {
            runId: seeded.approvalChildRunId,
            threadId: seeded.approvalChildThreadId,
            expectedText: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_ASSISTANT_TEXT,
            expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_USER_TEXT,
            exportCategory: "primary",
            patternGraphLinked: true,
          },
          {
            runId: seeded.completedChildRunId,
            threadId: seeded.completedChildThreadId,
            expectedText: SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
            exportCategory: "primary",
            patternGraphLinked: true,
          },
          {
            runId: seeded.lifecycleEdgeChildRunIds[0],
            threadId: seeded.lifecycleEdgeChildThreadIds[0],
            expectedText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_ASSISTANT_TEXT,
            expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_USER_TEXT,
            exportCategory: "lifecycle_edge",
          },
          {
            runId: seeded.lifecycleEdgeChildRunIds[1],
            threadId: seeded.lifecycleEdgeChildThreadIds[1],
            expectedText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_ASSISTANT_TEXT,
            expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_USER_TEXT,
            exportCategory: "lifecycle_edge",
          },
          {
            runId: seeded.lifecycleEdgeChildRunIds[2],
            threadId: seeded.lifecycleEdgeChildThreadIds[2],
            expectedText: "Parent recorded a wait-barrier decision: retry_child.",
            exportCategory: "lifecycle_edge",
          },
          {
            runId: seeded.lifecycleEdgeChildRunIds[3],
            threadId: seeded.lifecycleEdgeChildThreadIds[3],
            expectedText: "Parent recorded a wait-barrier decision: detach_child.",
            exportCategory: "lifecycle_edge",
          },
          {
            runId: seeded.parentStopCascadeChildRunIds[0],
            threadId: seeded.parentStopCascadeChildThreadIds[0],
            expectedText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_ASSISTANT_TEXT,
            expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_USER_TEXT,
            exportCategory: "parent_stop",
          },
          {
            runId: seeded.parentStopCascadeChildRunIds[1],
            threadId: seeded.parentStopCascadeChildThreadIds[1],
            expectedText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_ASSISTANT_TEXT,
            expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_USER_TEXT,
            exportCategory: "parent_stop",
          },
          {
            runId: seeded.parentStopCascadeChildRunIds[2],
            threadId: seeded.parentStopCascadeChildThreadIds[2],
            expectedText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_ASSISTANT_TEXT,
            expectedUserText: SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_USER_TEXT,
            exportCategory: "parent_stop",
          },
        ],
        workflowTaskId: seeded.workflowTaskId,
        approvalId: seeded.approvalId,
        approvalParentMailboxEventId: seeded.approvalRequestParentMailboxEventId,
        approvalChildRunId: seeded.approvalChildRunId,
        approvalChildThreadId: seeded.approvalChildThreadId,
        approvalCanonicalTaskPath: "root/0:reviewer",
        approvalWaitBarrierId: seeded.approvalWaitBarrierId,
        approvalRequestedToolId: "builtin:write_file",
        approvalRequestedAction: "workspace.write",
      });
      checks.chatExport = chatExport;
      artifacts.chatExportZip = relative(REPO_ROOT, chatExportPath);
      expect(chatExport).toMatchObject({
        apiReturnedPath: true,
        zipWritten: true,
        resultBytesMatchZip: true,
        manifestIncludesChildThreads: true,
        childEvidenceSummaryIncluded: true,
        childEvidenceSummaryCoversExpectedRuns: true,
        childEvidenceSummaryLinksTranscripts: true,
        childEvidenceSummaryAuthorityIncluded: true,
        childEvidenceSummaryApprovalBridgeIncluded: true,
        childEvidenceSummaryPatternLinksIncluded: true,
        childEvidenceSummaryResultArtifactsIncluded: true,
        indexContainsExpectedChildren: true,
        childTranscriptsContainExpectedMessages: true,
        lifecycleEdgeChildrenExported: true,
        parentStopCascadeChildrenExported: true,
        childRunEventsIncluded: true,
        childToolScopeSnapshotsIncluded: true,
        childWaitBarriersIncluded: true,
        parentMailboxIncluded: true,
        approvalAuthorityContract: {
          requestExported: true,
          forwardedExported: true,
          schemaMatches: true,
          childIdentityMatches: true,
          requestedToolMatches: true,
          requestEffectiveScopeNarrow: true,
          forwardedEffectiveScopeChildThread: true,
          parentBlockingResumeMatches: true,
          forwardedParentBlockingResumeMatches: true,
        },
        callableWorkflowTasksIncluded: true,
        patternGraphLinksIncluded: true,
        childPiSessionStatusRecorded: true,
      });

      const visualAssertions = buildDesktopVisualAssertions({ artifacts, checks, seeded });
      const maturityAssertions = buildDesktopMaturityAssertions({ artifacts, checks, seeded });
      expect(Object.values(visualAssertions).map((assertion) => `${assertion.id}:${assertion.status}`)).toEqual(
        Object.values(visualAssertions).map((assertion) => `${assertion.id}:passed`),
      );
      expect(Object.values(maturityAssertions).map((assertion) => `${assertion.id}:${assertion.status}`)).toEqual(
        Object.values(maturityAssertions).map((assertion) => `${assertion.id}:passed`),
      );

      const completedAt = new Date().toISOString();
      await writeReport({
        schemaVersion: "ambient-subagent-desktop-dogfood-v1",
        status: "passed",
        classification: "passed",
        generatedAt: completedAt,
        startedAt,
        completedAt,
        durationMs: Date.now() - startedMs,
        gitCommit: dogfoodGitCommit(),
        gitBranch: dogfoodGitBranch(),
        provider: process.env.AMBIENT_PROVIDER || "ambient",
        model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL,
        featureFlag: AMBIENT_SUBAGENTS_FEATURE_FLAG,
        headful: true,
        cdpPort: port,
        scenarios: [
          "seeded_visible_child_cluster",
          "approval_parent_blocking",
          "workflow_execution_parent_blocking",
          "mutating_worker_dogfood_behavior",
          "workflow_high_load_dogfood",
          "denied_scope_explanation_behavior",
          "approval_forwarding_behavior",
          "restart_rehydration_behavior",
          "workflow_rehydrated_navigation_behavior",
          "workflow_artifact_rehydration_behavior",
          "inline_child_transcript_behavior",
          "completed_child_terminal_transcript_behavior",
          "standalone_child_transcript_first_behavior",
          "pattern_graph_completed_child_clickthrough_behavior",
          "effective_role_snapshot_inspector",
          "local_runtime_ownership_ui",
          "untracked_runtime_safety_behavior",
          "lifecycle_edge_desktop_behavior",
          "lifecycle_terminal_child_transcript_behavior",
          "parent_stop_cascade_desktop_behavior",
          "parent_stop_terminal_child_transcript_behavior",
          "operator_child_controls",
          "operator_control_behavior",
          "multi_parent_cluster_stress",
          "chat_export_child_bundle",
        ],
        parentThreadId: seeded.parentThreadId,
        parentMessageId: seeded.parentMessageId,
        childRunIds: seeded.childRunIds,
        childThreadIds: seeded.childThreadIds,
        approvalRequestParentMailboxEventId: seeded.approvalRequestParentMailboxEventId,
        approvalWaitBarrierId: seeded.approvalWaitBarrierId,
        approvalId: seeded.approvalId,
        completedChildRunId: seeded.completedChildRunId,
        completedChildThreadId: seeded.completedChildThreadId,
        cancelControlChildRunId: seeded.cancelControlChildRunId,
        closeControlChildRunIds: seeded.closeControlChildRunIds,
        localRuntimeLeaseId: seeded.localRuntimeLeaseId,
        localRuntimeId: seeded.localRuntimeId,
        localRuntimePid: seeded.localRuntimePid,
        untrackedRuntimeId: untrackedRuntime.id,
        untrackedRuntimePid: untrackedRuntime.pid,
        untrackedRuntimeEndpoint: untrackedRuntime.endpoint,
        untrackedRuntimeModel: untrackedRuntime.model,
        workflowTaskId: seeded.workflowTaskId,
        workflowArtifactId: seeded.workflowArtifactId,
        workflowArtifactSourceRelativePath: seeded.workflowArtifactSourceRelativePath,
        workflowArtifactStateRelativePath: seeded.workflowArtifactStateRelativePath,
        workflowArtifactSourceContent: seeded.workflowArtifactSourceContent,
        workflowRunId: seeded.workflowRunId,
        workflowThreadId: seeded.workflowThreadId,
        workflowParentMailboxEventId: seeded.workflowParentMailboxEventId,
        mutatingWorkflowTaskId: seeded.mutatingWorkflowTaskId,
        mutatingWorkflowArtifactId: seeded.mutatingWorkflowArtifactId,
        mutatingWorkflowRunId: seeded.mutatingWorkflowRunId,
        mutatingWorkflowThreadId: seeded.mutatingWorkflowThreadId,
        mutatingWorkflowChildRunId: seeded.mutatingWorkflowChildRunId,
        mutatingWorkflowChildThreadId: seeded.mutatingWorkflowChildThreadId,
        mutatingWorkflowStagedRelativePath: seeded.mutatingWorkflowStagedRelativePath,
        mutatingWorkflowReportRelativePath: seeded.mutatingWorkflowReportRelativePath,
        mutatingWorkflowProgressMessage: seeded.mutatingWorkflowProgressMessage,
        mutatingWorkflowParentWorkspaceUnchanged: seeded.mutatingWorkflowParentWorkspaceUnchanged,
        workflowHighLoadTaskIds: seeded.workflowHighLoadTaskIds,
        workflowHighLoadArtifactIds: seeded.workflowHighLoadArtifactIds,
        workflowHighLoadRunIds: seeded.workflowHighLoadRunIds,
        workflowHighLoadThreadIds: seeded.workflowHighLoadThreadIds,
        workflowHighLoadPatternLabels: seeded.workflowHighLoadPatternLabels,
        deniedScopeParentMailboxEventId: seeded.deniedScopeParentMailboxEventId,
        deniedScopeChildRunId: seeded.deniedScopeChildRunId,
        deniedScopeChildThreadId: seeded.deniedScopeChildThreadId,
        lifecycleEdgeParentMessageId: seeded.lifecycleEdgeParentMessageId,
        lifecycleEdgeChildRunIds: seeded.lifecycleEdgeChildRunIds,
        lifecycleEdgeChildThreadIds: seeded.lifecycleEdgeChildThreadIds,
        lifecycleEdgeWaitBarrierIds: seeded.lifecycleEdgeWaitBarrierIds,
        parentStopCascadeParentMessageId: seeded.parentStopCascadeParentMessageId,
        parentStopCascadeParentMailboxEventId: seeded.parentStopCascadeParentMailboxEventId,
        parentStopCascadeChildRunIds: seeded.parentStopCascadeChildRunIds,
        parentStopCascadeChildThreadIds: seeded.parentStopCascadeChildThreadIds,
        parentStopCascadeWaitBarrierIds: seeded.parentStopCascadeWaitBarrierIds,
        parentStopCascadeCancelledRunIds: seeded.parentStopCascadeCancelledRunIds,
        parentStopCascadeDetachedRunIds: seeded.parentStopCascadeDetachedRunIds,
        parentStopCascadeUnchangedRunIds: seeded.parentStopCascadeUnchangedRunIds,
        parentStopCascadeCancelledWaitBarrierIds: seeded.parentStopCascadeCancelledWaitBarrierIds,
        parentStopCascadeCancelledMailboxEventIds: seeded.parentStopCascadeCancelledMailboxEventIds,
        stressParentMessageIds: seeded.stressParentMessageIds,
        stressChildRunIds: seeded.stressChildRunIds,
        stressChildThreadIds: seeded.stressChildThreadIds,
        chatExportPath: artifacts.chatExportZip,
        chatExportBytes: chatExport.zipBytes,
        artifacts,
        checks,
        visualAssertions,
        maturityAssertions,
      });
    } catch (error) {
      if (cdp) await captureFailureArtifacts(cdp, artifacts);
      const completedAt = new Date().toISOString();
      await writeReport({
        schemaVersion: "ambient-subagent-desktop-dogfood-v1",
        status: "failed",
        classification: "failed",
        generatedAt: completedAt,
        startedAt,
        completedAt,
        durationMs: Date.now() - startedMs,
        gitCommit: dogfoodGitCommit(),
        gitBranch: dogfoodGitBranch(),
        provider: process.env.AMBIENT_PROVIDER || "ambient",
        model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL,
        featureFlag: AMBIENT_SUBAGENTS_FEATURE_FLAG,
        headful: true,
        cdpPort: cdpPortFromEnv() ?? -1,
        scenarios: [
          "seeded_visible_child_cluster",
          "approval_parent_blocking",
          "workflow_execution_parent_blocking",
          "mutating_worker_dogfood_behavior",
          "workflow_high_load_dogfood",
          "denied_scope_explanation_behavior",
          "approval_forwarding_behavior",
          "restart_rehydration_behavior",
          "workflow_rehydrated_navigation_behavior",
          "workflow_artifact_rehydration_behavior",
          "standalone_child_transcript_first_behavior",
          "local_runtime_ownership_ui",
          "untracked_runtime_safety_behavior",
          "lifecycle_edge_desktop_behavior",
          "lifecycle_terminal_child_transcript_behavior",
          "parent_stop_cascade_desktop_behavior",
          "parent_stop_terminal_child_transcript_behavior",
          "operator_child_controls",
          "operator_control_behavior",
          "multi_parent_cluster_stress",
          "chat_export_child_bundle",
        ],
        parentThreadId: seeded?.parentThreadId,
        parentMessageId: seeded?.parentMessageId,
        childRunIds: seeded?.childRunIds,
        childThreadIds: seeded?.childThreadIds,
        approvalRequestParentMailboxEventId: seeded?.approvalRequestParentMailboxEventId,
        approvalId: seeded?.approvalId,
        cancelControlChildRunId: seeded?.cancelControlChildRunId,
        closeControlChildRunIds: seeded?.closeControlChildRunIds,
        localRuntimeLeaseId: seeded?.localRuntimeLeaseId,
        localRuntimeId: seeded?.localRuntimeId,
        localRuntimePid: seeded?.localRuntimePid,
        untrackedRuntimeId: process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ID,
        untrackedRuntimePid: Number(process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_PID),
        untrackedRuntimeEndpoint: process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ENDPOINT,
        untrackedRuntimeModel: process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_MODEL,
        workflowTaskId: seeded?.workflowTaskId,
        workflowArtifactId: seeded?.workflowArtifactId,
        workflowArtifactSourceRelativePath: seeded?.workflowArtifactSourceRelativePath,
        workflowArtifactStateRelativePath: seeded?.workflowArtifactStateRelativePath,
        workflowArtifactSourceContent: seeded?.workflowArtifactSourceContent,
        workflowRunId: seeded?.workflowRunId,
        workflowThreadId: seeded?.workflowThreadId,
        workflowParentMailboxEventId: seeded?.workflowParentMailboxEventId,
        mutatingWorkflowTaskId: seeded?.mutatingWorkflowTaskId,
        mutatingWorkflowArtifactId: seeded?.mutatingWorkflowArtifactId,
        mutatingWorkflowRunId: seeded?.mutatingWorkflowRunId,
        mutatingWorkflowThreadId: seeded?.mutatingWorkflowThreadId,
        mutatingWorkflowChildRunId: seeded?.mutatingWorkflowChildRunId,
        mutatingWorkflowChildThreadId: seeded?.mutatingWorkflowChildThreadId,
        mutatingWorkflowStagedRelativePath: seeded?.mutatingWorkflowStagedRelativePath,
        mutatingWorkflowReportRelativePath: seeded?.mutatingWorkflowReportRelativePath,
        mutatingWorkflowProgressMessage: seeded?.mutatingWorkflowProgressMessage,
        mutatingWorkflowParentWorkspaceUnchanged: seeded?.mutatingWorkflowParentWorkspaceUnchanged,
        workflowHighLoadTaskIds: seeded?.workflowHighLoadTaskIds,
        workflowHighLoadArtifactIds: seeded?.workflowHighLoadArtifactIds,
        workflowHighLoadRunIds: seeded?.workflowHighLoadRunIds,
        workflowHighLoadThreadIds: seeded?.workflowHighLoadThreadIds,
        workflowHighLoadPatternLabels: seeded?.workflowHighLoadPatternLabels,
        deniedScopeParentMailboxEventId: seeded?.deniedScopeParentMailboxEventId,
        deniedScopeChildRunId: seeded?.deniedScopeChildRunId,
        deniedScopeChildThreadId: seeded?.deniedScopeChildThreadId,
        lifecycleEdgeParentMessageId: seeded?.lifecycleEdgeParentMessageId,
        lifecycleEdgeChildRunIds: seeded?.lifecycleEdgeChildRunIds,
        lifecycleEdgeChildThreadIds: seeded?.lifecycleEdgeChildThreadIds,
        lifecycleEdgeWaitBarrierIds: seeded?.lifecycleEdgeWaitBarrierIds,
        parentStopCascadeParentMessageId: seeded?.parentStopCascadeParentMessageId,
        parentStopCascadeParentMailboxEventId: seeded?.parentStopCascadeParentMailboxEventId,
        parentStopCascadeChildRunIds: seeded?.parentStopCascadeChildRunIds,
        parentStopCascadeChildThreadIds: seeded?.parentStopCascadeChildThreadIds,
        parentStopCascadeWaitBarrierIds: seeded?.parentStopCascadeWaitBarrierIds,
        parentStopCascadeCancelledRunIds: seeded?.parentStopCascadeCancelledRunIds,
        parentStopCascadeDetachedRunIds: seeded?.parentStopCascadeDetachedRunIds,
        parentStopCascadeUnchangedRunIds: seeded?.parentStopCascadeUnchangedRunIds,
        parentStopCascadeCancelledWaitBarrierIds: seeded?.parentStopCascadeCancelledWaitBarrierIds,
        parentStopCascadeCancelledMailboxEventIds: seeded?.parentStopCascadeCancelledMailboxEventIds,
        stressParentMessageIds: seeded?.stressParentMessageIds,
        stressChildRunIds: seeded?.stressChildRunIds,
        stressChildThreadIds: seeded?.stressChildThreadIds,
        chatExportPath: artifacts.chatExportZip,
        artifacts,
        checks,
        visualAssertions: buildDesktopVisualAssertions({ artifacts, checks, seeded }),
        maturityAssertions: buildDesktopMaturityAssertions({ artifacts, checks, seeded }),
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      throw error;
    } finally {
      cdp?.close();
      await terminateApp(app);
    }
  }, 180_000);

  phase5RecoveryDogfoodIt("denies child approval and rehydrates Symphony recovery state", async () => {
    const artifacts: Record<string, string> = {};
    const checks: Record<string, unknown> = {};
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let app: ChildProcess | undefined;
    let cdp: CdpClient | undefined;
    let seeded: SubagentDesktopDogfoodSeedResult | undefined;
    let port = -1;

    await mkdir(RESULTS_DIR, { recursive: true });

    try {
      const workspacePath = requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_WORKSPACE");
      const userDataPath = requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_USER_DATA");
      const seedPath = requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED");
      const chatExportPath = join(RESULTS_DIR, "desktop-chat-export-phase5.zip");
      seeded = await readSeed(seedPath);
      port = dogfoodCdpPort();
      app = launchDesktop({ port, workspacePath, userDataPath, chatExportPath });
      cdp = await connectToElectron(port, app);
      await cdp.send("Runtime.enable");
      await cdp.send("Page.enable");
      await setViewport(cdp, 1440, 900);
      await waitFor(cdp, () => Boolean(document.querySelector(".subagent-parent-cluster")));
      await waitForText(cdp, SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT);

      const collapsed = await inspectSubagentUi(cdp);
      checks.collapsed = collapsed;
      expect(collapsed.clusterAfterParentMessage).toBe(true);
      expect(collapsed.childRows).toBe(2);
      await openPrimaryClusterIfClosed(cdp);
      await waitFor(cdp, () => document.querySelector(".subagent-parent-cluster")?.hasAttribute("open") ?? false);

      const expanded = await inspectSubagentUi(cdp);
      checks.expanded = expanded;
      expect(expanded.childRows).toBe(2);
      expect(expanded.approvalFlow).toMatchObject({
        approvalRequested: true,
        approvalBlockedChild: true,
        parentStillBlocked: true,
        approveButtonVisible: true,
        denyButtonVisible: true,
        approvalButtonsNameChild: true,
      });
      artifacts.phase5ExpandedBeforeDenialScreenshot = await writeScreenshot(cdp, "phase5-expanded-before-denial.png");

      await clickMailboxAction(cdp, "Deny child", seeded.approvalId);
      await waitFor(cdp, () => Boolean(document.querySelector(".subagent-approval-dialog")));
      const denialDialog = await inspectApprovalDialog(cdp, {
        approvalId: seeded.approvalId,
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
      });
      checks.denialDialog = denialDialog;
      expect(denialDialog).toMatchObject({
        dialogOpened: true,
        dialogNamesApproval: true,
        dialogNamesChildRun: true,
        dialogNamesChildThread: true,
        dialogNamesBlockingChild: true,
        dialogShowsParentWaitState: true,
        dialogShowsPrompt: true,
      });
      expect(denialDialog.text).toContain("Deny child request");
      artifacts.phase5DenialDialogScreenshot = await writeScreenshot(cdp, "phase5-denial-dialog.png");
      await submitApprovalDecisionDialog(cdp, "Deny child request");
      await waitFor(cdp, () => document.body.innerText.includes("Approval forwarded") && document.body.innerText.includes("Denied"));

      const approvalDenial = await inspectApprovalDenial(cdp, {
        approvalId: seeded.approvalId,
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
        canonicalTaskPath: "root/0:reviewer",
      });
      checks.approvalDenial = approvalDenial;
      expect(approvalDenial).toMatchObject({
        forwardedVisible: true,
        deniedDecisionVisible: true,
        denialScopeVisible: true,
        denialReasonVisible: true,
        parentResumeAfterDenialVisible: true,
        forwardedNamesChild: true,
        forwardedNamesApproval: true,
        forwardedMatchesApprovalChild: true,
        approvalRequestMatchesApprovalChild: true,
        forwardedAndRequestSameChild: true,
        approvalRequestStillVisible: true,
        approvalRequestActionsRemoved: true,
        parentStillBlockedAfterForward: true,
        childRowDataMatchesApprovalChild: true,
        childRowStillBlocksApprovalChild: true,
        siblingStillVisible: true,
        waitBarrierStillVisible: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.phase5DeniedDesktopScreenshot = await writeScreenshot(cdp, "phase5-denied-desktop.png");

      cdp.close();
      cdp = undefined;
      await terminateApp(app);
      app = undefined;

      port = await getAvailablePort();
      app = launchDesktop({ port, workspacePath, userDataPath, chatExportPath });
      cdp = await connectToElectron(port, app);
      await cdp.send("Runtime.enable");
      await cdp.send("Page.enable");
      await setViewport(cdp, 1440, 900);
      await waitFor(cdp, () => Boolean(document.querySelector(".subagent-parent-cluster")));
      await waitForText(cdp, SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT);

      const restartCollapsed = await inspectSubagentUi(cdp);
      checks.restartCollapsed = restartCollapsed;
      expect(restartCollapsed.clusterAfterParentMessage).toBe(true);
      expect(restartCollapsed.childRows).toBe(2);
      await openPrimaryClusterIfClosed(cdp);
      await waitFor(cdp, () => document.querySelector(".subagent-parent-cluster")?.hasAttribute("open") ?? false);

      const restartRehydration = await inspectRestartRehydration(cdp, {
        approvalId: seeded.approvalId,
        childRunId: seeded.approvalChildRunId,
        childThreadId: seeded.approvalChildThreadId,
        workflowTaskId: seeded.workflowTaskId,
        workflowArtifactId: seeded.workflowArtifactId,
        workflowRunId: seeded.workflowRunId,
        workflowThreadId: seeded.workflowThreadId,
        mutatingWorkflowTaskId: seeded.mutatingWorkflowTaskId,
        mutatingWorkflowArtifactId: seeded.mutatingWorkflowArtifactId,
        mutatingWorkflowRunId: seeded.mutatingWorkflowRunId,
        workflowHighLoadTaskIds: seeded.workflowHighLoadTaskIds,
        workflowHighLoadArtifactIds: seeded.workflowHighLoadArtifactIds,
        workflowHighLoadRunIds: seeded.workflowHighLoadRunIds,
        workflowHighLoadPatternLabels: seeded.workflowHighLoadPatternLabels,
        defaultCollapsedAfterRelaunch: restartCollapsed.defaultCollapsed,
        approvalDecisionLabel: "Denied",
      });
      checks.restartRehydration = restartRehydration;
      expect(restartRehydration).toMatchObject({
        expandedAfterRelaunch: true,
        parentMessageVisible: true,
        approvalForwardedRehydrated: true,
        approvalRequestRehydrated: true,
        approvalActionsStillRemoved: true,
        parentStillBlockedAfterRelaunch: true,
        childBlockerRehydrated: true,
        childRunIdRehydrated: true,
        childThreadIdRehydrated: true,
        completedChildResultSummaryRehydrated: true,
        workflowTaskRehydrated: true,
        workflowBlockerRehydrated: true,
        workflowMailboxBlockRehydrated: true,
        workflowArtifactRehydrated: true,
        workflowRunRehydrated: true,
        workflowThreadRehydrated: true,
        mutatingWorkflowTaskRehydrated: true,
        mutatingWorkflowArtifactRehydrated: true,
        mutatingWorkflowRunRehydrated: true,
        workflowHighLoadTasksRehydrated: true,
        workflowHighLoadArtifactsRehydrated: true,
        workflowHighLoadRunsRehydrated: true,
        patternGraphsRehydrated: true,
        patternGraphChildBindingRehydrated: true,
        patternGraphRuntimeBindingsRehydrated: true,
        childRowsRehydrated: true,
        horizontalOverflowFree: true,
        criticalOverlapCount: 0,
      });
      artifacts.phase5RestartRehydrationDesktopScreenshot =
        await writeScreenshot(cdp, "phase5-restart-rehydration-desktop.png");

      const completedAt = new Date().toISOString();
      await writeReport({
        schemaVersion: "ambient-subagent-desktop-dogfood-v1",
        status: "passed",
        classification: "passed",
        generatedAt: completedAt,
        startedAt,
        completedAt,
        durationMs: Date.now() - startedMs,
        gitCommit: dogfoodGitCommit(),
        gitBranch: dogfoodGitBranch(),
        provider: process.env.AMBIENT_PROVIDER || "ambient",
        model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL,
        featureFlag: AMBIENT_SUBAGENTS_FEATURE_FLAG,
        headful: true,
        cdpPort: port,
        scenarios: ["symphony_gap_phase5_failure_approval_recovery"],
        parentThreadId: seeded.parentThreadId,
        parentMessageId: seeded.parentMessageId,
        childRunIds: seeded.childRunIds,
        childThreadIds: seeded.childThreadIds,
        approvalRequestParentMailboxEventId: seeded.approvalRequestParentMailboxEventId,
        approvalWaitBarrierId: seeded.approvalWaitBarrierId,
        approvalId: seeded.approvalId,
        completedChildRunId: seeded.completedChildRunId,
        completedChildThreadId: seeded.completedChildThreadId,
        workflowTaskId: seeded.workflowTaskId,
        workflowArtifactId: seeded.workflowArtifactId,
        workflowRunId: seeded.workflowRunId,
        workflowThreadId: seeded.workflowThreadId,
        mutatingWorkflowTaskId: seeded.mutatingWorkflowTaskId,
        mutatingWorkflowArtifactId: seeded.mutatingWorkflowArtifactId,
        mutatingWorkflowRunId: seeded.mutatingWorkflowRunId,
        workflowHighLoadTaskIds: seeded.workflowHighLoadTaskIds,
        workflowHighLoadArtifactIds: seeded.workflowHighLoadArtifactIds,
        workflowHighLoadRunIds: seeded.workflowHighLoadRunIds,
        workflowHighLoadPatternLabels: seeded.workflowHighLoadPatternLabels,
        artifacts,
        checks,
        visualAssertions: {} as Record<DesktopVisualAssertionId, DesktopVisualAssertionEvidence>,
        maturityAssertions: {} as Record<DesktopMaturityAssertionId, DesktopMaturityAssertionEvidence>,
      });
    } catch (error) {
      if (cdp) await captureFailureArtifacts(cdp, artifacts);
      const completedAt = new Date().toISOString();
      await writeReport({
        schemaVersion: "ambient-subagent-desktop-dogfood-v1",
        status: "failed",
        classification: "failed",
        generatedAt: completedAt,
        startedAt,
        completedAt,
        durationMs: Date.now() - startedMs,
        gitCommit: dogfoodGitCommit(),
        gitBranch: dogfoodGitBranch(),
        provider: process.env.AMBIENT_PROVIDER || "ambient",
        model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL,
        featureFlag: AMBIENT_SUBAGENTS_FEATURE_FLAG,
        headful: true,
        cdpPort: port,
        scenarios: ["symphony_gap_phase5_failure_approval_recovery"],
        parentThreadId: seeded?.parentThreadId,
        parentMessageId: seeded?.parentMessageId,
        childRunIds: seeded?.childRunIds,
        childThreadIds: seeded?.childThreadIds,
        approvalRequestParentMailboxEventId: seeded?.approvalRequestParentMailboxEventId,
        approvalWaitBarrierId: seeded?.approvalWaitBarrierId,
        approvalId: seeded?.approvalId,
        artifacts,
        checks,
        visualAssertions: {} as Record<DesktopVisualAssertionId, DesktopVisualAssertionEvidence>,
        maturityAssertions: {} as Record<DesktopMaturityAssertionId, DesktopMaturityAssertionEvidence>,
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      throw error;
    } finally {
      cdp?.close();
      await terminateApp(app);
    }
  }, 180_000);
});
