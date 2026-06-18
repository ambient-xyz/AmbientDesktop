import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { AMBIENT_SUBAGENTS_FEATURE_FLAG } from "../../shared/featureFlags";
import {
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARENT_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_USER_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ENDPOINT,
  SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE,
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
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS,
  SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT,
  type SubagentDesktopDogfoodSeedResult,
} from "./subagentDesktopDogfoodScenario";

const DOGFOOD_ENABLED = process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD === "1";
const REPO_ROOT = resolve(__dirname, "../../..");
const RESULTS_DIR = join(REPO_ROOT, "test-results/subagent-desktop-dogfood");

interface CdpMessage {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

interface CdpClient {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  close(): void;
}

interface DogfoodReport {
  schemaVersion: "ambient-subagent-desktop-dogfood-v1";
  status: "passed" | "failed";
  classification: "passed" | "failed" | "blocked" | "skipped";
  generatedAt: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  gitCommit: string;
  gitBranch: string;
  provider: string;
  model?: string;
  featureFlag: string;
  headful: boolean;
  cdpPort: number;
  scenarios?: string[];
  parentThreadId?: string;
  parentMessageId?: string;
  childRunIds?: string[];
  childThreadIds?: string[];
  approvalRequestParentMailboxEventId?: string;
  approvalWaitBarrierId?: string;
  approvalId?: string;
  completedChildRunId?: string;
  completedChildThreadId?: string;
  cancelControlChildRunId?: string;
  closeControlChildRunIds?: string[];
  localRuntimeLeaseId?: string;
  localRuntimeId?: string;
  localRuntimePid?: number;
  untrackedRuntimeId?: string;
  untrackedRuntimePid?: number;
  untrackedRuntimeEndpoint?: string;
  untrackedRuntimeModel?: string;
  workflowTaskId?: string;
  workflowArtifactId?: string;
  workflowArtifactSourceRelativePath?: string;
  workflowArtifactStateRelativePath?: string;
  workflowArtifactSourceContent?: string;
  workflowRunId?: string;
  workflowThreadId?: string;
  workflowParentMailboxEventId?: string;
  mutatingWorkflowTaskId?: string;
  mutatingWorkflowArtifactId?: string;
  mutatingWorkflowRunId?: string;
  mutatingWorkflowThreadId?: string;
  mutatingWorkflowChildRunId?: string;
  mutatingWorkflowChildThreadId?: string;
  mutatingWorkflowStagedRelativePath?: string;
  mutatingWorkflowReportRelativePath?: string;
  mutatingWorkflowProgressMessage?: string;
  mutatingWorkflowParentWorkspaceUnchanged?: boolean;
  workflowHighLoadTaskIds?: string[];
  workflowHighLoadArtifactIds?: string[];
  workflowHighLoadRunIds?: string[];
  workflowHighLoadThreadIds?: string[];
  workflowHighLoadPatternLabels?: string[];
  deniedScopeParentMailboxEventId?: string;
  deniedScopeChildRunId?: string;
  deniedScopeChildThreadId?: string;
  lifecycleEdgeParentMessageId?: string;
  lifecycleEdgeChildRunIds?: string[];
  lifecycleEdgeChildThreadIds?: string[];
  lifecycleEdgeWaitBarrierIds?: string[];
  parentStopCascadeParentMessageId?: string;
  parentStopCascadeParentMailboxEventId?: string;
  parentStopCascadeChildRunIds?: string[];
  parentStopCascadeChildThreadIds?: string[];
  parentStopCascadeWaitBarrierIds?: string[];
  parentStopCascadeCancelledRunIds?: string[];
  parentStopCascadeDetachedRunIds?: string[];
  parentStopCascadeUnchangedRunIds?: string[];
  parentStopCascadeCancelledWaitBarrierIds?: string[];
  parentStopCascadeCancelledMailboxEventIds?: string[];
  stressParentMessageIds?: string[];
  stressChildRunIds?: string[];
  stressChildThreadIds?: string[];
  chatExportPath?: string;
  chatExportBytes?: number;
  artifacts: Record<string, string>;
  checks: Record<string, unknown>;
  visualAssertions: Record<DesktopVisualAssertionId, DesktopVisualAssertionEvidence>;
  maturityAssertions: Record<DesktopMaturityAssertionId, DesktopMaturityAssertionEvidence>;
  error?: string;
}

type DesktopVisualAssertionId =
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

interface DesktopVisualAssertionEvidence {
  id: DesktopVisualAssertionId;
  status: "passed" | "failed";
  evidence: string[];
  artifactRefs: string[];
}

type DesktopMaturityAssertionId =
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

interface DesktopMaturityAssertionEvidence {
  id: DesktopMaturityAssertionId;
  status: "passed" | "failed";
  capabilities: string[];
  evidence: string[];
  artifactRefs: string[];
}

const dogfoodIt = DOGFOOD_ENABLED ? it : it.skip;

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
});

function launchDesktop(input: { port: number; workspacePath: string; userDataPath: string; chatExportPath: string }): ChildProcess {
  return spawn("pnpm", [
    "exec",
    "electron-vite",
    "dev",
    "--",
    `--remote-debugging-port=${input.port}`,
    `--enable-feature=${AMBIENT_SUBAGENTS_FEATURE_FLAG}`,
  ], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      AMBIENT_PROVIDER: process.env.AMBIENT_PROVIDER || "ambient",
      AMBIENT_E2E: "1",
      AMBIENT_E2E_CHAT_EXPORT_PATH: input.chatExportPath,
      AMBIENT_DESKTOP_WORKSPACE: input.workspacePath,
      AMBIENT_E2E_USER_DATA: input.userDataPath,
    },
  });
}

async function connectToElectron(port: number, app: ChildProcess): Promise<CdpClient> {
  const started = Date.now();
  let lastOutput = "";
  app.stdout?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });
  app.stderr?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });

  while (Date.now() - started < 45_000) {
    if (app.exitCode !== null) {
      throw new Error(`Electron exited before CDP was available.\n${lastOutput}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json() as Array<{ type?: string; webSocketDebuggerUrl?: string; url?: string }>;
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) return createCdpClient(page.webSocketDebuggerUrl);
      }
    } catch {
      // Keep polling until Electron exposes the debugger endpoint.
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for Electron CDP on port ${port}.\n${lastOutput}`);
}

function createCdpClient(url: string): CdpClient {
  const WebSocketCtor = globalThis.WebSocket as unknown as {
    new(url: string): WebSocket;
  };
  const socket = new WebSocketCtor(url);
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (typeof message.id !== "number") return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || "CDP command failed"));
    else waiter.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) waiter.reject(new Error("CDP socket closed"));
    pending.clear();
  });

  return {
    send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
      const id = nextId++;
      const ready = socket.readyState === WebSocket.OPEN
        ? Promise.resolve()
        : new Promise<void>((resolveReady, rejectReady) => {
          socket.addEventListener("open", () => resolveReady(), { once: true });
          socket.addEventListener("error", () => rejectReady(new Error("CDP socket failed to open")), { once: true });
        });
      return ready.then(() => new Promise<T>((resolveCommand, rejectCommand) => {
        pending.set(id, {
          resolve: (value) => resolveCommand(value as T),
          reject: rejectCommand,
        });
        socket.send(JSON.stringify({ id, method, params }));
      }));
    },
    close() {
      socket.close();
    },
  };
}

async function waitForText(cdp: CdpClient, text: string) {
  await waitFor(cdp, (expected) => document.body.innerText.includes(expected), text);
}

async function waitFor<T extends unknown[]>(
  cdp: CdpClient,
  predicate: (...args: T) => boolean,
  ...args: T
) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    const matched = await evaluate<boolean, T>(cdp, predicate, ...args);
    if (matched) return;
    await delay(100);
  }
  throw new Error("Timed out waiting for Electron UI condition.");
}

async function evaluate<T, TArgs extends unknown[]>(cdp: CdpClient, fn: (...args: TArgs) => T | Promise<T>, ...args: TArgs): Promise<T> {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const result = await cdp.send<{ result?: { value?: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value as T;
}

async function setViewport(cdp: CdpClient, width: number, height: number) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
}

async function clickClusterSummary(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const summary = document.querySelector(".subagent-parent-cluster summary") as HTMLElement | null;
    summary?.click();
  });
}

async function openPrimaryClusterIfClosed(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const details = document.querySelector<HTMLDetailsElement>(".subagent-parent-cluster");
    if (!details) throw new Error("Missing sub-agent parent cluster.");
    if (!details.open) details.querySelector<HTMLElement>("summary")?.click();
  });
}

async function scrollOperatorBarrierConsequenceIntoView(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const consequenceRow = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div")]
      .find((row) => row.innerText.includes("1 wait barrier cancelled"));
    if (consequenceRow) {
      consequenceRow.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }
    const cluster = document.querySelector<HTMLElement>(".subagent-parent-cluster");
    if (!cluster) throw new Error("Missing sub-agent parent cluster.");
    cluster.scrollIntoView({ block: "start", inline: "nearest" });
  });
  await delay(80);
}

async function clickChildTranscriptSummary(cdp: CdpClient, childTitle: string) {
  await evaluate(cdp, (expectedChildTitle) => {
    const summary = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-thread > summary")]
      .find((candidate) => candidate.innerText.includes(expectedChildTitle));
    if (!summary) throw new Error(`Missing child transcript summary for ${expectedChildTitle}`);
    summary.click();
  }, childTitle);
}

async function ensureChildTranscriptOpen(
  cdp: CdpClient,
  input: { childRunId: string; childThreadId: string },
) {
  await evaluate(cdp, (expected) => {
    const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
      .find((candidate) =>
        candidate.dataset.childRunId === expected.childRunId &&
        candidate.dataset.childThreadId === expected.childThreadId
      );
    if (!details) throw new Error(`Missing child transcript details for ${expected.childRunId}.`);
    if (details.open) return;
    const summary = details.querySelector<HTMLElement>("summary");
    if (!summary) throw new Error(`Missing child transcript summary for ${expected.childRunId}.`);
    summary.click();
  }, input);
  await waitFor(cdp, (expected) => {
    const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
      .find((candidate) =>
        candidate.dataset.childRunId === expected.childRunId &&
        candidate.dataset.childThreadId === expected.childThreadId
      );
    return Boolean(details?.open && details.querySelector(".subagent-parent-cluster-child-transcript"));
  }, input);
}

async function collapseChildTranscriptIfOpen(
  cdp: CdpClient,
  input: { childRunId: string; childThreadId: string },
) {
  await evaluate(cdp, (expected) => {
    const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")]
      .find((candidate) =>
        candidate.dataset.childRunId === expected.childRunId &&
        candidate.dataset.childThreadId === expected.childThreadId
      );
    if (!details) throw new Error(`Missing child transcript details for ${expected.childRunId}.`);
    if (!details.open) return;
    const summary = details.querySelector<HTMLElement>("summary");
    if (!summary) throw new Error(`Missing child transcript summary for ${expected.childRunId}.`);
    summary.click();
  }, input);
  await delay(80);
}

async function scrollOpenChildTranscriptIntoView(
  cdp: CdpClient,
  input: { childRunId: string; childThreadId: string },
) {
  await evaluate(cdp, (expected) => {
    const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread[open]")]
      .find((candidate) =>
        candidate.dataset.childRunId === expected.childRunId &&
        candidate.dataset.childThreadId === expected.childThreadId
      );
    const transcript = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript");
    if (!details || !transcript) throw new Error(`Missing open child transcript for ${expected.childRunId}.`);
    transcript.scrollIntoView({ block: "center", inline: "nearest" });
  }, input);
  await delay(80);
}

async function emitChildLiveActivity(
  cdp: CdpClient,
  input: { childThreadId: string; workspacePath: string },
) {
  await evaluate(cdp, async (eventInput) => {
    if (!window.ambientDesktop.emitE2eEvent) throw new Error("Missing E2E desktop event bridge.");
    await window.ambientDesktop.emitE2eEvent({
      type: "run-status",
      workspacePath: eventInput.workspacePath,
      threadId: eventInput.childThreadId,
      status: "tool",
    });
    await window.ambientDesktop.emitE2eEvent({
      type: "runtime-activity",
      workspacePath: eventInput.workspacePath,
      activity: {
        threadId: eventInput.childThreadId,
        kind: "tool",
        status: "running",
        toolName: "Workspace Read",
        message: "Running local tool Workspace Read for visible child transcript.",
        idleElapsedMs: 0,
        idleTimeoutMs: 30_000,
      },
    });
  }, input);
  await delay(80);
}

async function clickPatternGraphChildNode(
  cdp: CdpClient,
  input: { childRunId: string; childThreadId: string },
) {
  await evaluate(cdp, (expected) => {
    const node = [...document.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node")]
      .find((candidate) =>
        candidate.dataset.childRunId === expected.childRunId &&
        candidate.dataset.childThreadId === expected.childThreadId &&
        (candidate.getAttribute("aria-label") ?? "").includes("from Map-Reduce")
      );
    if (!node) throw new Error(`Missing Map-Reduce graph child node for ${expected.childRunId}.`);
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }, input);
}

async function keyboardActivatePatternGraphChildNode(
  cdp: CdpClient,
  input: { childRunId: string; childThreadId: string; key?: "Enter" | " " },
) {
  return evaluate(cdp, (expected) => {
    const node = [...document.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node")]
      .find((candidate) =>
        candidate.dataset.childRunId === expected.childRunId &&
        candidate.dataset.childThreadId === expected.childThreadId &&
        (candidate.getAttribute("aria-label") ?? "").includes("from Map-Reduce")
      );
    if (!node) throw new Error(`Missing Map-Reduce graph child node for ${expected.childRunId}.`);
    node.scrollIntoView({ block: "center", inline: "nearest" });
    node.focus();
    const key = expected.key ?? "Enter";
    const event = new KeyboardEvent("keydown", {
      key,
      code: key === " " ? "Space" : "Enter",
      bubbles: true,
      cancelable: true,
    });
    const dispatchReturned = node.dispatchEvent(event);
    return {
      activeElementIsNode: document.activeElement === node,
      activeElementAriaLabel: document.activeElement?.getAttribute("aria-label") ?? "",
      key,
      role: node.getAttribute("role") ?? "",
      tabIndex: (node as unknown as HTMLElement).tabIndex,
      focusable: node.getAttribute("focusable") ?? "",
      ariaKeyshortcuts: node.getAttribute("aria-keyshortcuts") ?? "",
      keyboardOpenable: node.dataset.keyboardOpenable ?? "",
      keyboardEventDefaultPrevented: event.defaultPrevented,
      keyboardEventDispatchReturned: dispatchReturned,
    };
  }, input);
}

async function clickPatternGraphOverflowNode(
  cdp: CdpClient,
  input: { overflowChildRunId: string; overflowChildThreadId: string },
) {
  return evaluate(cdp, async (expected) => {
    const node = [...document.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node")]
      .find((candidate) =>
        candidate.dataset.graphNodeId === "mapper:overflow" &&
        candidate.dataset.overflowExpandable === "true" &&
        (candidate.getAttribute("aria-label") ?? "").includes("from Map-Reduce")
      );
    if (!node) throw new Error(`Missing Map-Reduce overflow node for ${expected.overflowChildRunId}.`);
    node.scrollIntoView({ block: "center", inline: "nearest" });
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const refreshed = document.querySelector<SVGGElement>(".subagent-pattern-graph-node[data-graph-node-id='mapper:overflow']");
    return {
      role: node.getAttribute("role") ?? "",
      tabIndex: (node as unknown as HTMLElement).tabIndex,
      focusable: node.getAttribute("focusable") ?? "",
      ariaLabel: node.getAttribute("aria-label") ?? "",
      ariaKeyshortcuts: node.getAttribute("aria-keyshortcuts") ?? "",
      keyboardOpenable: node.dataset.keyboardOpenable ?? "",
      overflowExpandable: node.dataset.overflowExpandable ?? "",
      expandedAfterClick: refreshed?.dataset.overflowExpanded ?? refreshed?.getAttribute("aria-expanded") ?? "",
      overflowCount: node.dataset.overflowCount ?? "",
      overflowChildRunId: expected.overflowChildRunId,
      overflowChildThreadId: expected.overflowChildThreadId,
    };
  }, input);
}

async function clickPatternGraphApprovalBadge(
  cdp: CdpClient,
  input: { childRunId: string; childThreadId: string; approvalId: string },
) {
  return evaluate(cdp, (expected) => {
    const badge = [...document.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node .node-badge[data-badge-key='approval']")]
      .find((candidate) =>
        candidate.dataset.approvalChildRunId === expected.childRunId &&
        candidate.dataset.approvalChildThreadId === expected.childThreadId &&
        candidate.dataset.approvalId === expected.approvalId &&
        candidate.dataset.approvalOpenable === "true"
      );
    if (!badge) throw new Error(`Missing openable graph approval badge for ${expected.approvalId}.`);
    badge.scrollIntoView({ block: "center", inline: "nearest" });
    badge.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return {
      role: badge.getAttribute("role") ?? "",
      tabIndex: (badge as unknown as HTMLElement).tabIndex,
      focusable: badge.getAttribute("focusable") ?? "",
      ariaLabel: badge.getAttribute("aria-label") ?? "",
      ariaKeyshortcuts: badge.getAttribute("aria-keyshortcuts") ?? "",
      approvalId: badge.dataset.approvalId ?? "",
      childRunId: badge.dataset.approvalChildRunId ?? "",
      childThreadId: badge.dataset.approvalChildThreadId ?? "",
      openable: badge.dataset.approvalOpenable ?? "",
      busy: badge.dataset.approvalBusy ?? "",
    };
  }, input);
}

async function inspectPatternGraphOverflowPanel(
  cdp: CdpClient,
  input: { overflowChildRunId: string; overflowChildThreadId: string; overflowChildLabel: string },
) {
  return evaluate(cdp, (expected) => {
    const panel = document.querySelector<HTMLElement>(".subagent-pattern-graph-overflow-panel[data-overflow-panel-node-id='mapper:overflow']");
    const child = [...(panel?.querySelectorAll<HTMLButtonElement>(".subagent-pattern-graph-overflow-child") ?? [])]
      .find((candidate) =>
        candidate.dataset.overflowChildRunId === expected.overflowChildRunId &&
        candidate.dataset.overflowChildThreadId === expected.overflowChildThreadId
      );
    const text = panel?.textContent ?? "";
    const childText = child?.textContent ?? "";
    const criticalElements = [panel, child].filter((element): element is HTMLElement => Boolean(element));
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      panelVisible: Boolean(panel && panel.offsetParent !== null),
      panelNamesOverflowNode: text.includes("+1 Mapper") && text.includes("1 grouped"),
      groupedChildVisible: Boolean(child && child.offsetParent !== null) && childText.includes(expected.overflowChildLabel),
      groupedChildIdentityVisible: Boolean(child?.dataset.overflowChildRunId === expected.overflowChildRunId &&
        child.dataset.overflowChildThreadId === expected.overflowChildThreadId),
      groupedChildStatusVisible: Boolean(child?.dataset.overflowChildStatus && childText.includes(child.dataset.overflowChildStatus)),
      groupedChildOpenable: child?.dataset.overflowChildOpenable ?? "",
      groupedChildAriaLabel: child?.getAttribute("aria-label") ?? "",
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      panelText: text,
      childText,
    };
  }, input);
}

async function clickChildAction(cdp: CdpClient, ariaLabel: string) {
  await evaluate(cdp, (expectedAriaLabel) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-child-action")]
      .find((candidate) => candidate.getAttribute("aria-label") === expectedAriaLabel);
    if (!button) throw new Error(`Missing child action ${expectedAriaLabel}`);
    button.click();
  }, ariaLabel);
}

async function clickSidebarThread(cdp: CdpClient, title: string) {
  await evaluate(cdp, (expectedTitle) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".thread-row")]
      .find((candidate) => candidate.getAttribute("title") === expectedTitle);
    if (!button) throw new Error(`Missing sidebar thread ${expectedTitle}`);
    button.click();
  }, title);
}

async function inspectStandaloneChildThread(
  cdp: CdpClient,
  input: {
    parentThreadId: string;
    childThreadId: string;
    childRunId: string;
    expectedParentBarrierLabel: string;
    expectedParentBarrierDetail: string;
    expectedAssistantText: string;
    forbiddenText?: string;
  },
) {
  return evaluate(cdp, (expected) => {
    const inspector = document.querySelector<HTMLElement>(".subagent-thread-inspector");
    const summary = inspector?.querySelector<HTMLElement>(".subagent-thread-inspector-main");
    const parentBarrier = inspector?.querySelector<HTMLElement>(".subagent-thread-parent-barrier");
    const parentAction = inspector?.querySelector<HTMLButtonElement>(".subagent-thread-open-parent");
    const messageScroll = document.querySelector<HTMLElement>(".messages");
    const inspectorDock = inspector?.closest<HTMLElement>(".subagent-thread-inspector-dock") ?? inspector;
    const conversationChildren = [...(messageScroll?.parentElement?.children ?? [])] as HTMLElement[];
    const transcriptText = messageScroll?.innerText ?? document.body.innerText;
    const messageScrollChildren = [...(messageScroll?.children ?? [])] as HTMLElement[];
    const messageScrollChildIndex = conversationChildren.findIndex((element) => element === messageScroll);
    const inspectorChildIndex = conversationChildren.findIndex((element) => element === inspectorDock);
    const transcriptChildIndex = messageScrollChildren.findIndex((element) =>
      element.classList.contains("message") &&
      element.innerText.includes(expected.expectedAssistantText)
    );
    const transcriptElement = transcriptChildIndex >= 0 ? messageScrollChildren[transcriptChildIndex] : undefined;
    const transcriptRect = transcriptElement?.getBoundingClientRect();
    const inspectorRect = inspector?.getBoundingClientRect();
    const transcriptInspectorOverlap = transcriptRect && inspectorRect
      ? Math.max(0, Math.min(transcriptRect.right, inspectorRect.right) - Math.max(transcriptRect.left, inspectorRect.left)) *
        Math.max(0, Math.min(transcriptRect.bottom, inspectorRect.bottom) - Math.max(transcriptRect.top, inspectorRect.top))
      : 0;
    const criticalElements = [
      ...(inspector ? [inspector] : []),
      ...(summary ? [summary] : []),
      ...(parentBarrier ? [parentBarrier] : []),
      ...(parentAction ? [parentAction] : []),
      ...[...document.querySelectorAll<HTMLElement>(".messages > .message")],
    ].filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      inspectorVisible: Boolean(inspector && inspector.offsetParent !== null),
      inspectorCollapsedByDefault: inspector instanceof HTMLDetailsElement && !inspector.open,
      childRunIdVisible: inspector?.dataset.subagentRunId === expected.childRunId ||
        (inspector?.innerText ?? "").includes(expected.childRunId),
      childThreadTranscriptVisible: transcriptText.includes(expected.childThreadId) ||
        transcriptText.includes(expected.expectedAssistantText),
      parentThreadIdVisible: inspector?.dataset.subagentParentThreadId === expected.parentThreadId ||
        (inspector?.innerText ?? "").includes(expected.parentThreadId),
      parentBarrierVisible: inspector?.dataset.subagentParentBarrierVisible === "true" &&
        Boolean(parentBarrier && parentBarrier.offsetParent !== null),
      parentBarrierLabelVisible: (parentBarrier?.innerText ?? "").includes(expected.expectedParentBarrierLabel),
      parentBarrierDetailVisible: (parentBarrier?.getAttribute("title") ?? "").includes(expected.expectedParentBarrierDetail),
      parentOpenActionVisible: Boolean(parentAction && parentAction.offsetParent !== null) &&
        (parentAction?.getAttribute("aria-label") ?? "").includes(expected.parentThreadId),
      transcriptVisible: transcriptText.includes(expected.expectedAssistantText),
      childAssistantVisible: transcriptText.includes(expected.expectedAssistantText),
      transcriptPrecedesInspector: transcriptChildIndex >= 0 && messageScrollChildIndex >= 0 && inspectorChildIndex >= 0 &&
        messageScrollChildIndex < inspectorChildIndex,
      transcriptVerticallyPrecedesInspector: Boolean(transcriptRect && inspectorRect && transcriptRect.top < inspectorRect.top),
      transcriptInspectorOverlapFree: transcriptInspectorOverlap === 0,
      transcriptChildIndex,
      messageScrollChildIndex,
      inspectorChildIndex,
      siblingSummaryNotLeaked: expected.forbiddenText ? !transcriptText.includes(expected.forbiddenText) : true,
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      inspectorText: inspector?.innerText ?? "",
    };
  }, input);
}

async function clickStandaloneChildParentAction(cdp: CdpClient, parentThreadId: string) {
  await evaluate(cdp, (expectedParentThreadId) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-thread-open-parent")]
      .find((candidate) => (candidate.getAttribute("aria-label") ?? "").includes(expectedParentThreadId));
    if (!button) throw new Error(`Missing standalone child parent action for ${expectedParentThreadId}`);
    button.click();
  }, parentThreadId);
}

async function openSubagentThreadInspector(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const details = document.querySelector<HTMLDetailsElement>(".subagent-thread-inspector");
    if (!details) throw new Error("Missing sub-agent thread inspector.");
    if (!details.open) details.querySelector<HTMLElement>("summary")?.click();
  });
}

async function clickMailboxAction(cdp: CdpClient, label: string, titleFragment: string) {
  await evaluate(cdp, (input) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-button")]
      .find((candidate) =>
        candidate.innerText.trim() === input.label &&
        (candidate.getAttribute("title") ?? "").includes(input.titleFragment)
      );
    if (!button) throw new Error(`Missing mailbox action ${input.label} with ${input.titleFragment}`);
    button.click();
  }, { label, titleFragment });
}

async function clickWorkflowTaskAction(cdp: CdpClient, ariaLabel: string) {
  await evaluate(cdp, (expectedAriaLabel) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-workflow-action")]
      .find((candidate) => candidate.getAttribute("aria-label") === expectedAriaLabel);
    if (!button) throw new Error(`Missing workflow task action ${expectedAriaLabel}`);
    button.click();
  }, ariaLabel);
}

async function clickWorkflowOpenAudit(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".workflow-review-workspace button, .workflow-review-audit-section button")]
      .find((candidate) =>
        candidate.innerText.includes("Open audit") &&
        (candidate.getAttribute("title") ?? "").includes("Open the latest audit trail")
      );
    if (!button) throw new Error("Missing workflow Open audit button.");
    button.click();
  });
}

async function clickWorkflowBuildPanel(cdp: CdpClient, panelTarget: string) {
  await evaluate(cdp, (expectedPanelTarget) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".workflow-build-rail button")]
      .find((candidate) => candidate.dataset.panelTarget === expectedPanelTarget);
    if (!button) throw new Error(`Missing workflow build panel ${expectedPanelTarget}.`);
    button.click();
  }, panelTarget);
}

async function openSettingsPanel(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".sidebar-footer button")]
      .find((candidate) => candidate.innerText.includes("Settings"));
    if (!button) throw new Error("Missing Settings button.");
    button.click();
  });
  await waitFor(cdp, () => Boolean(document.querySelector(".right-panel.settings-panel-host")));
}

async function clickSettingsSection(cdp: CdpClient, label: string) {
  await evaluate(cdp, (expectedLabel) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".settings-nav button")]
      .find((candidate) => candidate.innerText.includes(expectedLabel));
    if (!button) throw new Error(`Missing Settings section ${expectedLabel}.`);
    button.click();
  }, label);
}

async function closeSettingsPanel(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const button = document.querySelector<HTMLButtonElement>("button[aria-label='Close Settings panel']");
    if (!button) throw new Error("Missing close Settings panel button.");
    button.click();
  });
}

async function scrollLocalRuntimeOwnershipIntoView(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const settingsPanel = document.querySelector<HTMLElement>(".right-panel.settings-panel-host");
    const runtimeCard = settingsPanel
      ? [...settingsPanel.querySelectorAll<HTMLElement>(".model-runtime-catalog-profile")]
        .find((card) =>
          card.innerText.includes("In use by sub-agent Review worker") ||
          [...card.querySelectorAll<HTMLElement>("[title]")]
            .some((element) => (element.getAttribute("title") ?? "").includes("In use by sub-agent Review worker"))
        )
      : undefined;
    if (!runtimeCard) throw new Error("Missing owned local runtime card.");
    runtimeCard.scrollIntoView({ block: "start", inline: "nearest" });
  });
}

async function selectApprovalScope(cdp: CdpClient, value: string) {
  await evaluate(cdp, (scopeValue) => {
    const input = document.querySelector<HTMLInputElement>(
      `.subagent-approval-dialog input[name="subagent-approval-scope"][value="${scopeValue}"]`,
    );
    if (!input) throw new Error(`Missing approval scope ${scopeValue}`);
    input.click();
  }, value);
}

async function submitApprovalDialog(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-approval-dialog button[type='submit']")]
      .find((candidate) => candidate.innerText.includes("Approve child request"));
    if (!button) throw new Error("Missing approval dialog submit button");
    button.click();
  });
}

async function dismissApprovalDialog(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const dialog = document.querySelector<HTMLElement>(".subagent-approval-dialog");
    if (!dialog) throw new Error("Missing approval dialog to dismiss");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  await waitFor(cdp, () => !document.querySelector(".subagent-approval-dialog"));
}

async function inspectMultiClusterStress(
  cdp: CdpClient,
  input: {
    expectedClusterCount: number;
    stressParentTextPrefix: string;
    stressParentMessageIds: string[];
    stressChildRunIds: string[];
    stressChildThreadIds: string[];
  },
) {
  return evaluate(cdp, (expected) => {
    document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread[open]")
      .forEach((details) => {
        details.open = false;
      });
    const clusterElements = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster")];
    const summaryElements = clusterElements
      .map((cluster) => cluster.querySelector<HTMLElement>("summary"))
      .filter((summary): summary is HTMLElement => Boolean(summary));
    const parentTextElements = expected.stressParentMessageIds.map((_, index) => {
      const needle = `${expected.stressParentTextPrefix} ${index + 1}`;
      return [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => element.innerText?.includes(needle) && !element.querySelector(".subagent-parent-cluster"))
        .sort((a, b) => {
          const aRect = a.getBoundingClientRect();
          const bRect = b.getBoundingClientRect();
          return (aRect.width * aRect.height) - (bRect.width * bRect.height);
        })[0];
    });
    const parentTextRects = expected.stressParentMessageIds.map((_, index) =>
      textRangeRectFor(`${expected.stressParentTextPrefix} ${index + 1}`)
    );
    const stressClusters = parentTextRects.map((parentRect) => {
      if (!parentRect) return undefined;
      return clusterElements
        .map((cluster) => ({ cluster, rect: cluster.getBoundingClientRect() }))
        .filter(({ rect }) => rect.top >= parentRect.bottom - 2)
        .sort((a, b) => (a.rect.top - parentRect.bottom) - (b.rect.top - parentRect.bottom))[0]?.cluster;
    });
    const stressSummaries = stressClusters
      .map((cluster) => cluster?.querySelector<HTMLElement>("summary"))
      .filter((summary): summary is HTMLElement => Boolean(summary));
    const criticalRects = summaryElements
      .filter((summary) => summary.offsetParent !== null)
      .map((summary) => {
        const rect = summary.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      clusterCount: clusterElements.length,
      expectedClusterCountVisible: clusterElements.length === expected.expectedClusterCount,
      allClustersDefaultCollapsed: clusterElements.every((cluster) => !cluster.hasAttribute("open")),
      stressParentMessagesVisible: parentTextElements.every(Boolean),
      stressSummariesVisible: stressSummaries.length === expected.stressParentMessageIds.length &&
        stressSummaries.every((summary) =>
          summary.innerText.includes("Sub-agent threads") &&
          summary.innerText.includes("3 children")
        ),
      stressChildIdsCaptured: expected.stressChildRunIds.length === 6 &&
        expected.stressChildThreadIds.length === 6 &&
        expected.stressChildRunIds.every((id) => typeof id === "string" && id.length > 0) &&
        expected.stressChildThreadIds.every((id) => typeof id === "string" && id.length > 0),
      stressClustersAfterParentMessages: stressClusters.every((cluster, index) => {
        const parentRect = parentTextRects[index] ?? parentTextElements[index]?.getBoundingClientRect();
        const clusterRect = cluster?.getBoundingClientRect();
        return Boolean(parentRect && clusterRect && clusterRect.top >= parentRect.bottom - 2);
      }),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      summaryTexts: summaryElements.map((summary) => summary.innerText),
    };

    function textRangeRectFor(needle: string): DOMRect | undefined {
      const candidates: DOMRect[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const value = node.textContent ?? "";
        const index = value.indexOf(needle);
        if (index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + needle.length);
          const rect = range.getBoundingClientRect();
          range.detach();
          if (rect.width > 0 && rect.height > 0) candidates.push(rect);
        }
        node = walker.nextNode();
      }
      return candidates.sort((a, b) => a.top - b.top || a.left - b.left)[0];
    }
  }, input);
}

async function inspectLifecycleEdgeVisibility(
  cdp: CdpClient,
  input: {
    parentText: string;
    parentMessageId: string;
    childRunIds: string[];
    childThreadIds: string[];
    waitBarrierIds: string[];
  },
) {
  return evaluate(cdp, async (expected) => {
    const clusterElements = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster")];
    const parentTextElement = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.innerText?.includes(expected.parentText) && !element.querySelector(".subagent-parent-cluster"))
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return (aRect.width * aRect.height) - (bRect.width * bRect.height);
      })[0];
    const cluster = parentTextElement
      ? clusterElements.find((candidate) =>
        Boolean(parentTextElement.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING)
      )
      : undefined;
    const summary = cluster?.querySelector<HTMLElement>("summary");
    const clusterDefaultCollapsedBeforeOpen = !(cluster?.hasAttribute("open") ?? false);
    summary?.scrollIntoView({ block: "center", inline: "nearest" });
    if (summary && !cluster?.hasAttribute("open")) summary.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const text = cluster?.innerText ?? "";
    const titleText = [...(cluster?.querySelectorAll<HTMLElement>("[title]") ?? [])]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const combinedText = `${text}\n${titleText}`;
    const childRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const mailboxRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const barrierRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-barriers > div") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const timeoutRow = childRows.find((row) => row.text.includes("Timeout edge worker") || row.titleText.includes("Timeout edge worker"));
    const partialRow = childRows.find((row) => row.text.includes("Partial recovery worker") || row.titleText.includes("Partial recovery worker"));
    const retryRow = childRows.find((row) => row.text.includes("Retry edge worker") || row.titleText.includes("Retry edge worker"));
    const detachedRow = childRows.find((row) => row.text.includes("Detached edge worker") || row.titleText.includes("Detached edge worker"));
    const timeoutAttention = mailboxRows.find((row) =>
      row.text.includes("Barrier attention") &&
      (row.text.includes("Timed Out") || row.titleText.includes("Timed Out") || row.text.includes("timed out"))
    );
    const partialDecision = mailboxRows.find((row) =>
      row.text.includes("Barrier decision") &&
      row.text.includes("Partial approved")
    );
    const retryDecision = mailboxRows.find((row) =>
      row.text.includes("Barrier decision") &&
      row.text.includes("Retry accepted")
    );
    const detachDecision = mailboxRows.find((row) =>
      row.text.includes("Barrier decision") &&
      row.text.includes("Child detached")
    );
    const criticalElements = [...(cluster?.querySelectorAll<HTMLElement>([
      "summary",
      ".subagent-parent-cluster-child-row",
      ".subagent-parent-cluster-barriers > div",
      ".subagent-parent-cluster-mailbox > div",
      ".subagent-parent-cluster-mailbox-action.is-button",
      ".subagent-parent-cluster-child-blocker-context",
    ].join(",")) ?? [])]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    const messageScrollport = cluster?.closest<HTMLElement>(".messages");
    const conversation = cluster?.closest<HTMLElement>(".conversation");
    const composerRect = conversation?.querySelector<HTMLElement>(".composer")?.getBoundingClientRect();
    const messagesRect = messageScrollport?.getBoundingClientRect();
    const visibleBottom = Math.min(
      messagesRect?.bottom ?? window.innerHeight,
      composerRect?.top ?? window.innerHeight,
    );
    const clusterRect = cluster?.getBoundingClientRect();
    const clusterFrameClearancePx = clusterRect
      ? visibleBottom - clusterRect.bottom
      : Number.NEGATIVE_INFINITY;
    let criticalOverlapCount = 0;
    const criticalOverlapPairs: string[] = [];
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) {
          criticalOverlapCount += 1;
          criticalOverlapPairs.push([
            aElement.className || aElement.tagName,
            bElement.className || bElement.tagName,
          ].join(" overlaps "));
        }
      }
    }

    return {
      parentMessageVisible: document.body.innerText.includes(expected.parentText),
      parentMessageIdCaptured: Boolean(expected.parentMessageId),
      clusterVisible: Boolean(cluster),
      clusterDefaultCollapsedBeforeOpen,
      summaryVisible: Boolean(summary?.innerText.includes("Sub-agent threads") && summary.innerText.includes("4 children")),
      timeoutChildVisible: Boolean(timeoutRow?.text.includes("Timed Out") || timeoutRow?.titleText.includes("Timed Out")),
      partialChildVisible: Boolean(partialRow?.text.includes("Aborted Partial") || partialRow?.titleText.includes("Aborted Partial")),
      retryChildVisible: Boolean(
        retryRow &&
        (retryRow.text.includes("Blocking: child") ||
          retryRow.text.includes("Blocking: needs steering") ||
          retryRow.titleText.includes("Required all")) &&
        ["Running", "Needs attention", "Stopped", "Failed"].some((status) => retryRow.text.includes(status) || retryRow.titleText.includes(status))
      ),
      detachedChildVisible: Boolean(detachedRow?.text.includes("Detached") || detachedRow?.titleText.includes("Detached")),
      timeoutAttentionVisible: Boolean(timeoutAttention),
      timeoutChoicesVisible: ["Continue with partial", "Retry child", "Detach child", "Cancel parent run"]
        .every((choice) => combinedText.includes(choice)),
      partialDecisionVisible: Boolean(partialDecision),
      partialSummaryVisible: combinedText.includes("Use the partial recovery summary") &&
        combinedText.includes("User approved a partial parent continuation"),
      retryDecisionVisible: Boolean(retryDecision) && combinedText.includes("Retry this failed child before parent synthesis"),
      retryEffectVisible: barrierRows.some((row) => row.text.includes("Retry requested") && row.text.includes("Retry requested 1 child")) ||
        combinedText.includes("Retry requested 1 child"),
      retryAcceptedEffectVisible: barrierRows.some((row) => row.text.includes("Retry accepted") && row.text.includes("Retry accepted 1 child")) ||
        combinedText.includes("Retry accepted 1 child"),
      retryMailboxVisible: barrierRows.some((row) => row.text.includes("1 retry mailbox event queued")) ||
        combinedText.includes("1 retry mailbox event queued"),
      detachDecisionVisible: Boolean(detachDecision),
      detachedEffectVisible: barrierRows.some((row) => row.text.includes("Child detached") && row.text.includes("Detached 1 child")) ||
        combinedText.includes("Detached 1 child"),
      edgeIdentityCaptured: expected.childRunIds.length === 4 &&
        expected.childThreadIds.length === 4 &&
        expected.waitBarrierIds.length === 4 &&
        expected.childRunIds.every((id) => combinedText.includes(id)) &&
        expected.childThreadIds.every((id) => typeof id === "string" && id.length > 0) &&
        expected.waitBarrierIds.every((id) => typeof id === "string" && id.length > 0),
      clusterFrameClearsComposer: clusterFrameClearancePx >= 8,
      clusterFrameClearancePx,
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      criticalOverlapPairs,
      summaryText: summary?.innerText ?? "",
      childRows,
      mailboxRows,
      barrierRows,
    };
  }, input);
}

async function inspectParentStopCascadeVisibility(
  cdp: CdpClient,
  input: {
    parentText: string;
    parentMessageId: string;
    parentMailboxEventId: string;
    childRunIds: string[];
    childThreadIds: string[];
    waitBarrierIds: string[];
    cancelledRunIds: string[];
    detachedRunIds: string[];
    unchangedRunIds: string[];
    cancelledWaitBarrierIds: string[];
    cancelledMailboxEventIds: string[];
  },
) {
  return evaluate(cdp, async (expected) => {
    const clusterElements = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster")];
    const parentTextElement = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.innerText?.includes(expected.parentText) && !element.querySelector(".subagent-parent-cluster"))
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return (aRect.width * aRect.height) - (bRect.width * bRect.height);
      })[0];
    const cluster = parentTextElement
      ? clusterElements.find((candidate) =>
        Boolean(parentTextElement.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING)
      )
      : undefined;
    const summary = cluster?.querySelector<HTMLElement>("summary");
    const clusterDefaultCollapsedBeforeOpen = !(cluster?.hasAttribute("open") ?? false);
    summary?.scrollIntoView({ block: "center", inline: "nearest" });
    if (summary && !cluster?.hasAttribute("open")) summary.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const text = cluster?.innerText ?? "";
    const titleText = [...(cluster?.querySelectorAll<HTMLElement>("[title]") ?? [])]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const combinedText = `${text}\n${titleText}`;
    const childRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const mailboxRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const requiredRow = childRows.find((row) =>
      row.text.includes("Parent-stop required worker") || row.titleText.includes("Parent-stop required worker")
    );
    const backgroundRow = childRows.find((row) =>
      row.text.includes("Parent-stop background worker") || row.titleText.includes("Parent-stop background worker")
    );
    const completedRow = childRows.find((row) =>
      row.text.includes("Parent-stop completed worker") || row.titleText.includes("Parent-stop completed worker")
    );
    const parentStoppedMailbox = mailboxRows.find((row) =>
      row.text.includes("Parent stopped") &&
      row.text.includes("1 cancelled") &&
      row.text.includes("1 detached") &&
      row.text.includes("1 unchanged") &&
      row.text.includes("1 wait barrier cancelled")
    );

    const criticalElements = [...(cluster?.querySelectorAll<HTMLElement>([
      "summary",
      ".subagent-parent-cluster-child-row",
      ".subagent-parent-cluster-mailbox > div",
      ".subagent-parent-cluster-lifecycle-effect",
    ].join(",")) ?? [])]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    const messageScrollport = cluster?.closest<HTMLElement>(".messages");
    const conversation = cluster?.closest<HTMLElement>(".conversation");
    const composerRect = conversation?.querySelector<HTMLElement>(".composer")?.getBoundingClientRect();
    const messagesRect = messageScrollport?.getBoundingClientRect();
    const visibleBottom = Math.min(
      messagesRect?.bottom ?? window.innerHeight,
      composerRect?.top ?? window.innerHeight,
    );
    const clusterRect = cluster?.getBoundingClientRect();
    const clusterFrameClearancePx = clusterRect
      ? visibleBottom - clusterRect.bottom
      : Number.NEGATIVE_INFINITY;
    let criticalOverlapCount = 0;
    const criticalOverlapPairs: string[] = [];
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) {
          criticalOverlapCount += 1;
          criticalOverlapPairs.push([
            aElement.className || aElement.tagName,
            bElement.className || bElement.tagName,
          ].join(" overlaps "));
        }
      }
    }

    return {
      parentMessageVisible: document.body.innerText.includes(expected.parentText),
      parentMessageIdCaptured: Boolean(expected.parentMessageId),
      parentMailboxEventIdCaptured: Boolean(expected.parentMailboxEventId),
      clusterVisible: Boolean(cluster),
      clusterDefaultCollapsedBeforeOpen,
      summaryVisible: Boolean(summary?.innerText.includes("Sub-agent threads") && summary.innerText.includes("3 children")),
      requiredChildCancelledVisible: Boolean(requiredRow?.text.includes("Cancelled") || requiredRow?.titleText.includes("Cancelled")),
      optionalChildDetachedVisible: Boolean(backgroundRow?.text.includes("Detached") || backgroundRow?.titleText.includes("Detached")),
      completedChildUnchangedVisible: Boolean(completedRow?.text.includes("Completed") || completedRow?.titleText.includes("Completed")) &&
        combinedText.includes("Unchanged 1 child"),
      parentStoppedMailboxVisible: Boolean(parentStoppedMailbox),
      parentCancellationRequestedVisible: combinedText.includes("Parent cancellation requested"),
      cancelledWaitBarrierVisible: combinedText.includes("1 wait barrier cancelled"),
      cancelledMailboxEventsVisible: combinedText.includes("2 pending mailbox events cancelled"),
      cascadeReasonVisible: combinedText.includes("User stopped the parent turn while child work was still active."),
      cascadeIdentityCaptured: expected.childRunIds.length === 3 &&
        expected.childThreadIds.length === 3 &&
        expected.waitBarrierIds.length === 1 &&
        expected.cancelledRunIds.length === 1 &&
        expected.detachedRunIds.length === 1 &&
        expected.unchangedRunIds.length === 1 &&
        expected.cancelledWaitBarrierIds.length === 1 &&
        expected.cancelledMailboxEventIds.length === 2 &&
        [...expected.cancelledRunIds, ...expected.detachedRunIds, ...expected.unchangedRunIds].every((id) => combinedText.includes(id)) &&
        expected.cancelledWaitBarrierIds.every((id) => combinedText.includes(id)) &&
        expected.cancelledMailboxEventIds.every((id) => combinedText.includes(id)),
      clusterFrameClearsComposer: clusterFrameClearancePx >= 8,
      clusterFrameClearancePx,
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      criticalOverlapPairs,
      summaryText: summary?.innerText ?? "",
      childRows,
      mailboxRows,
    };
  }, input);
}

async function inspectLocalRuntimeOwnership(
  cdp: CdpClient,
  input: {
    leaseId: string;
    runtimeId: string;
    pid: number;
    endpoint: string;
    childRunId: string;
    childThreadId: string;
    untrackedRuntime: {
      id: string;
      pid: number;
      endpoint: string;
      model: string;
    };
  },
) {
  return evaluate(cdp, (expected) => {
    const settingsPanel = document.querySelector<HTMLElement>(".right-panel.settings-panel-host");
    const isVisibleInViewport = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight;
    };
    const text = settingsPanel?.innerText ?? "";
    const titleText = settingsPanel
      ? [...settingsPanel.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n")
      : "";
    const localModelsButton = [...document.querySelectorAll<HTMLButtonElement>(".settings-nav button")]
      .find((button) => button.innerText.includes("Local Models"));
    const runtimeCardElements = settingsPanel
      ? [...settingsPanel.querySelectorAll<HTMLElement>(".model-runtime-catalog-profile")]
        .filter((card) => card.offsetParent !== null)
      : [];
    const runtimeCardElement = runtimeCardElements.find((card) =>
      card.innerText.includes("In use by sub-agent Review worker") ||
      [...card.querySelectorAll<HTMLElement>("[title]")]
        .some((element) => (element.getAttribute("title") ?? "").includes("In use by sub-agent Review worker"))
    );
    runtimeCardElement?.scrollIntoView({ block: "start", inline: "nearest" });
    const summarizeRuntimeCard = (card: HTMLElement) => ({
      text: card.innerText,
      titleText: [...card.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n"),
      buttonSummaries: [...card.querySelectorAll<HTMLButtonElement>("button")].map((button) => ({
        text: button.innerText,
        disabled: button.disabled,
        title: button.getAttribute("title") ?? "",
      })),
      rect: (() => {
        const rect = card.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })(),
    });
    const allRuntimeCards = runtimeCardElements.map(summarizeRuntimeCard);
    const runtimeCards = runtimeCardElements
      .filter((card) => isVisibleInViewport(card) || card === runtimeCardElement)
      .map(summarizeRuntimeCard);
    const runtimeCard = allRuntimeCards.find((card) =>
      card.text.includes("In use by sub-agent Review worker") ||
      card.titleText.includes("In use by sub-agent Review worker")
    );
    const untrackedRuntimeCard = allRuntimeCards.find((card) =>
      card.text.includes(expected.untrackedRuntime.id) ||
      card.titleText.includes(expected.untrackedRuntime.id) ||
      card.text.includes(expected.untrackedRuntime.model) ||
      card.titleText.includes(expected.untrackedRuntime.model)
    );
    const runtimeText = `${runtimeCard?.text ?? ""}\n${runtimeCard?.titleText ?? ""}`;
    const untrackedRuntimeText = `${untrackedRuntimeCard?.text ?? ""}\n${untrackedRuntimeCard?.titleText ?? ""}`;
    const stopButton = runtimeCard?.buttonSummaries.find((button) => button.text.includes("Stop"));
    const restartButton = runtimeCard?.buttonSummaries.find((button) => button.text.includes("Restart"));
    const untrackedStopButton = untrackedRuntimeCard?.buttonSummaries.find((button) => button.text.includes("Stop"));
    const untrackedRestartButton = untrackedRuntimeCard?.buttonSummaries.find((button) => button.text.includes("Restart"));
    const criticalElements = runtimeCardElement
      ? [...runtimeCardElement.querySelectorAll<HTMLElement>("button, small, .subagent-thread-badges > *")]
        .filter((element) => element.offsetParent !== null && isVisibleInViewport(element))
      : [];
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    const untrackedCards = allRuntimeCards.filter((card) =>
      card.text.includes("Untracked") || card.titleText.includes("untracked")
    );
    return {
      settingsPanelVisible: Boolean(settingsPanel),
      localModelsSectionVisible: Boolean(localModelsButton?.classList.contains("active") || text.includes("Local Models")),
      runtimeInventoryVisible: text.includes("Runtime inventory"),
      activeLeaseVisible: text.includes("1 active lease"),
      ownerLabelVisible: runtimeText.includes("In use by sub-agent Review worker"),
      managedRunningVisible: runtimeText.includes("Running") && runtimeText.includes("Managed"),
      localTextCapabilityVisible: runtimeText.includes("Local text") || runtimeText.includes("local/text-4b"),
      stopDisabledVisible: Boolean(stopButton?.disabled && stopButton.title.includes("In use by sub-agent Review worker")),
      restartDisabledVisible: Boolean(restartButton?.disabled && restartButton.title.includes("In use by sub-agent Review worker")),
      forceConsequenceVisible: runtimeText.includes("Forced Stop/Restart") &&
        runtimeText.includes("cancel") &&
        runtimeText.includes("affected sub-agent"),
      blockerLeaseVisible: runtimeText.includes(expected.leaseId) && runtimeText.includes("Blockers"),
      affectedSubagentVisible: runtimeText.includes("Affected sub-agents") && runtimeText.includes("Review worker"),
      childRunIdVisible: runtimeText.includes(expected.childRunId),
      childThreadIdVisible: runtimeText.includes(expected.childThreadId),
      runtimeIdVisible: runtimeText.includes(expected.runtimeId),
      pidVisible: runtimeText.includes(`pid ${expected.pid}`),
      endpointVisible: runtimeText.includes(expected.endpoint),
      ordinaryStopReasonVisible: runtimeText.includes("In use by sub-agent Review worker."),
      untrackedRuntimeVisible: Boolean(untrackedRuntimeCard),
      untrackedRuntimeIdVisible: untrackedRuntimeText.includes(expected.untrackedRuntime.id),
      untrackedRuntimePidVisible: untrackedRuntimeText.includes(`pid ${expected.untrackedRuntime.pid}`),
      untrackedRuntimeEndpointVisible: untrackedRuntimeText.includes(expected.untrackedRuntime.endpoint),
      untrackedRuntimeModelVisible: untrackedRuntimeText.includes(expected.untrackedRuntime.model),
      untrackedStopDisabledVisible: Boolean(untrackedStopButton?.disabled &&
        untrackedStopButton.title.includes("untracked") &&
        untrackedStopButton.title.includes("safe to stop")),
      untrackedRestartDisabledVisible: Boolean(untrackedRestartButton?.disabled &&
        untrackedRestartButton.title.includes("untracked") &&
        untrackedRestartButton.title.includes("safe to restart")),
      untrackedForceUnavailableVisible: untrackedRuntimeText.includes("Force termination unavailable") &&
        untrackedRuntimeText.includes("untracked processes"),
      untrackedExternalStopGuidanceVisible: untrackedRuntimeText.includes("ask the owner to stop it outside Ambient") ||
        untrackedRuntimeText.includes("this local runtime is untracked"),
      untrackedGroupSafeVisible: untrackedCards.length > 0 &&
        untrackedCards.every((card) => {
          const cardText = `${card.text}\n${card.titleText}`;
          return cardText.includes("Untracked") &&
            cardText.includes("Force termination unavailable") &&
            card.buttonSummaries
              .filter((button) => button.text.includes("Stop") || button.text.includes("Restart"))
              .every((button) => button.disabled);
        }),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      runtimeCardText: runtimeCard?.text ?? "",
      runtimeCardTitles: runtimeCard?.titleText ?? "",
      untrackedRuntimeCardText: untrackedRuntimeCard?.text ?? "",
      untrackedRuntimeCardTitles: untrackedRuntimeCard?.titleText ?? "",
      runtimeCards,
    };
  }, input);
}

async function inspectWorkflowExecution(
  cdp: CdpClient,
  input: {
    taskId: string;
    artifactId: string;
    runId: string;
    threadId: string;
    mailboxEventId: string;
  },
) {
  return evaluate(cdp, (expected) => {
    const text = document.body.innerText;
    const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const renderedOpenClusterContent = (element: HTMLElement) => {
      const cluster = element.closest<HTMLDetailsElement>("details.subagent-parent-cluster");
      return !cluster || cluster.open || element.tagName.toLowerCase() === "summary";
    };
    const elementTitleText = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>("[title]")]
      .map((item) => item.getAttribute("title") ?? "")
      .join("\n");
    const workflowRowElements = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-workflows > div")]
      .filter((row) => row.offsetParent !== null && renderedOpenClusterContent(row));
    const workflowRows = workflowRowElements
      .map((row) => ({
        text: row.innerText,
        titleText: elementTitleText(row),
        buttonSummaries: [...row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-workflow-action")]
          .map((button) => ({
            ariaLabel: button.getAttribute("aria-label") ?? "",
            title: button.getAttribute("title") ?? "",
            hasIcon: Boolean(button.querySelector("svg")),
            disabled: button.disabled,
          })),
      }));
    const mailboxRows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div")]
      .filter((row) => row.offsetParent !== null && renderedOpenClusterContent(row))
      .map((row) => ({
        text: row.innerText,
        titleText: elementTitleText(row),
      }));
    const workflowRowElement = workflowRowElements.find((row) =>
      row.innerText.includes("Symphony Map-Reduce") ||
      elementTitleText(row).includes("Symphony Map-Reduce")
    );
    const workflowRow = workflowRows.find((row) =>
      row.text.includes("Symphony Map-Reduce") ||
      row.titleText.includes("Symphony Map-Reduce")
    );
    const inspectedCluster = workflowRowElement?.closest<HTMLElement>(".subagent-parent-cluster");
    const workflowText = `${workflowRow?.text ?? ""}\n${workflowRow?.titleText ?? ""}`;
    const mailboxRow = mailboxRows.find((row) =>
      row.text.includes("Workflow blocked") ||
      row.titleText.includes("Workflow blocked") ||
      row.text.includes(expected.taskId) ||
      row.titleText.includes(expected.taskId)
    );
    const mailboxText = `${mailboxRow?.text ?? ""}\n${mailboxRow?.titleText ?? ""}`;
    const allText = `${text}\n${titledText}`;
    const criticalElements = inspectedCluster
      ? [...inspectedCluster.querySelectorAll<HTMLElement>([
        "summary",
        ".subagent-parent-cluster-workflows > div",
        ".subagent-parent-cluster-workflow-action",
        ".subagent-parent-cluster-mailbox > div",
      ].join(","))]
        .filter((element) => element.offsetParent !== null && renderedOpenClusterContent(element))
      : [];
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    const pauseControl = workflowRow?.buttonSummaries.find((button) => button.ariaLabel === "Pause workflow task Symphony Map-Reduce");
    const cancelControl = workflowRow?.buttonSummaries.find((button) => button.ariaLabel === "Cancel workflow task Symphony Map-Reduce");
    const openControl = workflowRow?.buttonSummaries.find((button) => button.ariaLabel === "Open workflow thread for Symphony Map-Reduce");
    return {
      workflowSectionVisible: workflowRows.length >= 2,
      taskVisible: Boolean(workflowRow),
      statusRunningVisible: workflowText.includes("Running"),
      modeBlockingVisible: workflowText.includes("Blocking"),
      sourceSymphonyVisible: workflowText.includes("Symphony recipe"),
      progressVisible: workflowText.includes("Reducer waiting on workflow evidence"),
      telemetryVisible: workflowText.includes("3 events") &&
        workflowText.includes("1 step done") &&
        workflowText.includes("1 model call") &&
        workflowText.includes("~96 tokens"),
      launchCardVisible: workflowText.includes("Risk: High") &&
        workflowText.includes("Up to 12 agents") &&
        workflowText.includes("Budget: 180,000 tokens") &&
        workflowText.includes("Confirmation required") &&
        workflowText.includes("Small slice recommended"),
      parentThreadProvenanceVisible: workflowText.includes("Caller: parent thread") &&
        workflowText.includes("Approval: Launch Card"),
      parentBlockerVisible: workflowText.includes("Blocking: workflow work"),
      mailboxBlockVisible: mailboxText.includes("Workflow blocked") &&
        mailboxText.includes("1 blocking workflow") &&
        mailboxText.includes("1 waiting") &&
        mailboxText.includes("Symphony Map-Reduce"),
      taskIdVisible: allText.includes(expected.taskId),
      artifactIdVisible: allText.includes(expected.artifactId),
      runIdVisible: allText.includes(expected.runId),
      threadIdVisible: allText.includes(expected.threadId),
      mailboxEventIdVisible: expected.mailboxEventId.length > 0,
      pauseControlVisible: Boolean(pauseControl?.hasIcon && !pauseControl.disabled && pauseControl.title.includes("Pause blocking workflow task")),
      cancelControlVisible: Boolean(cancelControl?.hasIcon && !cancelControl.disabled && cancelControl.title.includes("Cancel blocking workflow task")),
      openWorkflowThreadVisible: Boolean(openControl?.hasIcon && !openControl.disabled && openControl.title.includes(expected.threadId)),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      workflowRows,
      mailboxRows,
    };
  }, input);
}

async function inspectMutatingWorkerDogfood(
  cdp: CdpClient,
  input: {
    taskId: string;
    artifactId: string;
    runId: string;
    threadId: string;
    childRunId: string;
    childThreadId: string;
    stagedRelativePath: string;
    reportRelativePath: string;
    progressMessage: string;
  },
) {
  return evaluate(cdp, (expected) => {
    const text = document.body.innerText;
    const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const workflowRows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-workflows > div")]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
        buttonSummaries: [...row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-workflow-action")]
          .map((button) => ({
            ariaLabel: button.getAttribute("aria-label") ?? "",
            title: button.getAttribute("title") ?? "",
            disabled: button.disabled,
          })),
      }));
    const row = workflowRows.find((candidate) =>
      candidate.text.includes("Symphony Self-Healing Loop") ||
      candidate.titleText.includes(expected.artifactId) ||
      candidate.titleText.includes(expected.taskId)
    );
    const rowText = `${row?.text ?? ""}\n${row?.titleText ?? ""}`;
    const allText = `${text}\n${titledText}`;
    const criticalElements = [...document.querySelectorAll<HTMLElement>([
      ".subagent-parent-cluster-workflows > div",
      ".subagent-parent-cluster-workflow-action",
      ".subagent-parent-cluster-workflow-mutation-evidence",
      ".subagent-parent-cluster-workflow-provenance",
    ].join(","))]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      taskVisible: Boolean(row),
      statusSucceededVisible: rowText.includes("Succeeded"),
      modeBackgroundVisible: rowText.includes("Background"),
      sourceSymphonyVisible: rowText.includes("Symphony recipe"),
      childCallerVisible: rowText.includes("Caller: sub-agent child") || rowText.includes("sub-agent child"),
      childRunVisible: rowText.includes(expected.childRunId) || allText.includes(expected.childRunId),
      childThreadVisible: rowText.includes(expected.childThreadId) || allText.includes(expected.childThreadId),
      approvalBridgeVisible: rowText.includes("Approval: Child Bridge Policy") ||
        rowText.includes("Approval: child bridge policy") ||
        rowText.includes("approval child bridge policy"),
      isolatedWorktreeVisible: rowText.includes("Worktree: isolated") ||
        rowText.includes("Isolated worktree active") ||
        rowText.includes("worktree isolated active"),
      nestedFanoutVisible: rowText.includes("Nested fanout: Child Bridge Policy") ||
        rowText.includes("Nested fanout granted"),
      mutatingWorkerLabelVisible: rowText.includes("Mutating child worker"),
      stagedMutationVisible: rowText.includes(`Staged mutation: ${expected.stagedRelativePath}`) ||
        rowText.includes(expected.progressMessage),
      parentWorkspaceUnchangedVisible: rowText.includes("Parent workspace unchanged") ||
        rowText.includes("parent workspace unchanged"),
      outputPreviewRetainedVisible: rowText.includes("Output preview retained") ||
        rowText.includes("output preview retained"),
      reportRelativePathCaptured: expected.reportRelativePath.length > 0,
      taskIdVisible: allText.includes(expected.taskId),
      artifactIdVisible: allText.includes(expected.artifactId),
      runIdVisible: allText.includes(expected.runId),
      threadIdVisible: allText.includes(expected.threadId),
      noPauseControlVisible: !row?.buttonSummaries.some((button) => button.ariaLabel === "Pause workflow task Symphony Self-Healing Loop"),
      noCancelControlVisible: !row?.buttonSummaries.some((button) => button.ariaLabel === "Cancel workflow task Symphony Self-Healing Loop"),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      workflowRows,
    };
  }, input);
}

async function inspectWorkflowHighLoad(
  cdp: CdpClient,
  input: {
    taskIds: string[];
    artifactIds: string[];
    runIds: string[];
    threadIds: string[];
    patternLabels: string[];
  },
) {
  return evaluate(cdp, (expected) => {
    const text = document.body.innerText;
    const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const workflowRows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-workflows > div")]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
        buttonSummaries: [...row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-workflow-action")]
          .map((button) => ({
            ariaLabel: button.getAttribute("aria-label") ?? "",
            title: button.getAttribute("title") ?? "",
            disabled: button.disabled,
          })),
      }));
    const allText = `${text}\n${titledText}`;
    const rowText = workflowRows.map((row) => `${row.text}\n${row.titleText}`).join("\n--- workflow row ---\n");
    const highLoadRows = workflowRows.filter((row) =>
      expected.artifactIds.some((artifactId) => row.text.includes(artifactId) || row.titleText.includes(artifactId)) ||
      expected.taskIds.some((taskId) => row.text.includes(taskId) || row.titleText.includes(taskId))
    );
    const criticalElements = [...document.querySelectorAll<HTMLElement>([
      ".subagent-parent-cluster-workflows > div",
      ".subagent-parent-cluster-workflow-action",
      ".subagent-parent-cluster-workflow-id",
      ".subagent-parent-cluster-workflow-launch-card",
      ".subagent-parent-cluster-workflow-provenance",
      ".subagent-parent-cluster-workflow-mutation-evidence",
    ].join(","))]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      workflowSectionVisible: workflowRows.length >= 6,
      workflowRowCount: workflowRows.length,
      expectedWorkflowRowCountVisible: workflowRows.length >= 6,
      allPresetLabelsVisible: expected.patternLabels.every((label) => rowText.includes(label)),
      highLoadTaskIdsVisible: expected.taskIds.every((id) => allText.includes(id)),
      highLoadArtifactIdsVisible: expected.artifactIds.every((id) => allText.includes(id)),
      highLoadRunIdsVisible: expected.runIds.every((id) => allText.includes(id)),
      highLoadThreadIdsVisible: expected.threadIds.every((id) => allText.includes(id)),
      backgroundRowsVisible: highLoadRows.length === expected.taskIds.length &&
        highLoadRows.every((row) => row.text.includes("Background") || row.titleText.includes("Background")),
      completedRowsVisible: highLoadRows.length === expected.taskIds.length &&
        highLoadRows.every((row) => row.text.includes("Succeeded") || row.titleText.includes("Succeeded")),
      highLoadRowsHaveNoPauseCancel: highLoadRows.every((row) =>
        !row.buttonSummaries.some((button) =>
          button.ariaLabel.startsWith("Pause workflow task ") ||
          button.ariaLabel.startsWith("Cancel workflow task ")
        )
      ),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      workflowRows,
      highLoadRows,
    };
  }, input);
}

async function inspectPatternGraphRuntime(
  cdp: CdpClient,
  input: {
    childRunId: string;
    childThreadId: string;
    completedChildRunId: string;
    completedChildThreadId: string;
    overflowChildRunId: string;
    overflowChildThreadId: string;
    overflowChildLabel: string;
    workflowTaskIds: string[];
    workflowRunIds: string[];
    patternLabels: string[];
  },
) {
  return evaluate(cdp, (expected) => {
    const cluster = document.querySelector(".subagent-parent-cluster") as HTMLElement | null;
    const graphSection = cluster?.querySelector<HTMLElement>(".subagent-parent-cluster-pattern-graphs");
    const graphPanels = [...(graphSection?.querySelectorAll<HTMLElement>(".subagent-pattern-graph") ?? [])]
      .filter((panel) => panel.offsetParent !== null)
      .map((panel) => ({
        ariaLabel: panel.getAttribute("aria-label") ?? "",
        text: panel.textContent ?? "",
        nodeCount: panel.querySelectorAll(".subagent-pattern-graph-node").length,
      }));
    const graphNodes = [...(graphSection?.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node") ?? [])]
      .filter((node) => (node as unknown as HTMLElement).offsetParent !== null)
      .map((node) => ({
        ariaLabel: node.getAttribute("aria-label") ?? "",
        className: node.getAttribute("class") ?? "",
        title: node.querySelector("title")?.textContent ?? "",
        role: node.getAttribute("role") ?? "",
        tabIndex: (node as unknown as HTMLElement).tabIndex,
        focusable: node.getAttribute("focusable") ?? "",
        ariaKeyshortcuts: node.getAttribute("aria-keyshortcuts") ?? "",
        keyboardOpenable: node.dataset.keyboardOpenable ?? "",
        childRunId: node.dataset.childRunId ?? "",
        childThreadId: node.dataset.childThreadId ?? "",
        workflowTaskId: node.dataset.workflowTaskId ?? "",
        workflowRunId: node.dataset.workflowRunId ?? "",
        graphNodeId: node.dataset.graphNodeId ?? "",
        badges: node.dataset.nodeBadges ?? "",
        overflowExpandable: node.dataset.overflowExpandable ?? "",
        overflowExpanded: node.dataset.overflowExpanded ?? "",
        overflowCount: node.dataset.overflowCount ?? "",
        badgeText: [...node.querySelectorAll(".node-badge")]
          .map((badge) => badge.textContent ?? "")
          .join(" "),
        approvalBadges: [...node.querySelectorAll<SVGGElement>(".node-badge[data-badge-key='approval']")]
          .map((badge) => ({
            ariaLabel: badge.getAttribute("aria-label") ?? "",
            role: badge.getAttribute("role") ?? "",
            tabIndex: (badge as unknown as HTMLElement).tabIndex,
            focusable: badge.getAttribute("focusable") ?? "",
            ariaKeyshortcuts: badge.getAttribute("aria-keyshortcuts") ?? "",
            approvalId: badge.dataset.approvalId ?? "",
            childRunId: badge.dataset.approvalChildRunId ?? "",
            childThreadId: badge.dataset.approvalChildThreadId ?? "",
            openable: badge.dataset.approvalOpenable ?? "",
            busy: badge.dataset.approvalBusy ?? "",
          })),
      }));
    const graphEdges = [...(graphSection?.querySelectorAll<SVGGElement>(".subagent-pattern-graph-edge") ?? [])]
      .filter((edge) => (edge as unknown as HTMLElement).offsetParent !== null)
      .map((edge) => ({
        className: edge.getAttribute("class") ?? "",
        title: edge.querySelector("title")?.textContent ?? "",
        status: edge.dataset.edgeStatus ?? "",
        blockingParent: edge.dataset.blockingParent ?? "",
      }));
    const legendText = [...(graphSection?.querySelectorAll<HTMLElement>(".subagent-pattern-graph-legend span") ?? [])]
      .filter((item) => item.offsetParent !== null)
      .map((item) => item.textContent ?? "")
      .join("\n");
    const allGraphText = [
      graphSection?.textContent ?? "",
      ...graphPanels.map((panel) => panel.ariaLabel),
      ...graphNodes.map((node) => `${node.ariaLabel}\n${node.title}\n${node.graphNodeId}`),
      legendText,
    ].join("\n");
    const runtimeTaskIds = new Set(graphNodes.map((node) => node.workflowTaskId).filter(Boolean));
    const runtimeRunIds = new Set(graphNodes.map((node) => node.workflowRunId).filter(Boolean));
    const criticalElements = [...(graphSection?.querySelectorAll<HTMLElement>([
      ".subagent-pattern-graph",
      ".subagent-pattern-graph-legend span",
    ].join(",")) ?? [])]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      graphSectionVisible: Boolean(graphSection),
      graphCount: graphPanels.length,
      graphCountVisible: graphPanels.length >= 6,
      allPatternGraphsVisible: expected.patternLabels.every((label) => allGraphText.includes(label.replace("Symphony ", ""))),
      runtimeTaskBindingsVisible: expected.workflowTaskIds.every((id) => runtimeTaskIds.has(id)),
      runtimeRunBindingsVisible: expected.workflowRunIds.every((id) => runtimeRunIds.has(id)),
      childBindingVisible: graphNodes.some((node) =>
        node.childRunId === expected.childRunId && node.childThreadId === expected.childThreadId
      ),
      childClickThroughAdvertised: graphNodes.some((node) =>
        node.childThreadId === expected.childThreadId &&
        node.ariaLabel.includes("Open Review worker thread from Map-Reduce")
      ),
      childKeyboardOpenAdvertised: graphNodes.some((node) =>
        node.childThreadId === expected.childThreadId &&
        node.ariaLabel.includes("Open Review worker thread from Map-Reduce") &&
        node.role === "button" &&
        node.tabIndex >= 0 &&
        node.focusable === "true" &&
        node.ariaKeyshortcuts.includes("Enter") &&
        node.ariaKeyshortcuts.includes("Space") &&
        node.keyboardOpenable === "true"
      ),
      completedChildBindingVisible: graphNodes.some((node) =>
        node.childRunId === expected.completedChildRunId && node.childThreadId === expected.completedChildThreadId
      ),
      completedChildClickThroughAdvertised: graphNodes.some((node) =>
        node.childThreadId === expected.completedChildThreadId &&
        node.ariaLabel.includes("Open Context summarizer thread from Map-Reduce")
      ),
      completedChildKeyboardOpenAdvertised: graphNodes.some((node) =>
        node.childThreadId === expected.completedChildThreadId &&
        node.ariaLabel.includes("Open Context summarizer thread from Map-Reduce") &&
        node.role === "button" &&
        node.tabIndex >= 0 &&
        node.focusable === "true" &&
        node.ariaKeyshortcuts.includes("Enter") &&
        node.ariaKeyshortcuts.includes("Space") &&
        node.keyboardOpenable === "true"
      ),
      blockingBadgeVisible: legendText.includes("Review worker") && legendText.includes("blocks parent"),
      approvalBadgeVisible: legendText.includes("Approval needed"),
      nodeBlockingBadgeVisible: graphNodes.some((node) =>
        node.badges.split(",").includes("blocking") && node.badgeText.includes("Blocks")
      ),
      nodeApprovalBadgeVisible: graphNodes.some((node) =>
        node.badges.split(",").includes("approval") && node.badgeText.includes("Approval")
      ),
      overflowNodeVisible: graphNodes.some((node) =>
        node.graphNodeId === "mapper:overflow" &&
        node.badges.split(",").includes("overflow") &&
        node.badgeText.includes("1")
      ),
      overflowNodeExpandableAdvertised: graphNodes.some((node) =>
        node.graphNodeId === "mapper:overflow" &&
        node.ariaLabel.includes("Expand 1 grouped from Map-Reduce") &&
        node.role === "button" &&
        node.tabIndex >= 0 &&
        node.focusable === "true" &&
        node.ariaKeyshortcuts.includes("Enter") &&
        node.ariaKeyshortcuts.includes("Space") &&
        node.keyboardOpenable === "true" &&
        node.overflowExpandable === "true" &&
        node.overflowExpanded === "false" &&
        node.overflowCount === "1"
      ),
      overflowPanelInitiallyCollapsed: !Boolean(graphSection?.querySelector(".subagent-pattern-graph-overflow-panel")),
      approvalBadgeOpenAdvertised: graphNodes.some((node) =>
        node.childThreadId === expected.childThreadId &&
        node.approvalBadges.some((badge) =>
          badge.ariaLabel.includes("Open approval request") &&
          badge.role === "button" &&
          badge.tabIndex >= 0 &&
          badge.focusable === "true" &&
          badge.ariaKeyshortcuts.includes("Enter") &&
          badge.ariaKeyshortcuts.includes("Space") &&
          badge.childRunId === expected.childRunId &&
          badge.childThreadId === expected.childThreadId &&
          badge.openable === "true" &&
          badge.busy === "false"
        )
      ),
      blockingEdgeVisible: graphEdges.some((edge) =>
        edge.blockingParent === "true" &&
        edge.className.includes("blocking-parent") &&
        (edge.status.includes("Approval") || edge.status.includes("Blocked") || edge.status.includes("Running") || edge.title.includes("blocks parent"))
      ),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      graphPanels,
      graphNodes,
      graphEdges,
      legendText,
    };
  }, input);
}

async function inspectDeniedScopeExplanation(
  cdp: CdpClient,
  input: {
    parentMailboxEventId: string;
    childRunId: string;
    childThreadId: string;
  },
) {
  return evaluate(cdp, (expected) => {
    const renderedOpenClusterContent = (element: HTMLElement) => {
      const cluster = element.closest<HTMLDetailsElement>("details.subagent-parent-cluster");
      return !cluster || cluster.open || element.tagName.toLowerCase() === "summary";
    };
    const mailboxRows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div")]
      .filter((row) => row.offsetParent !== null && renderedOpenClusterContent(row))
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
        actionCount: row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-button").length,
        element: row,
      }));
    const deniedScopeRow = mailboxRows.find((row) => {
      const rowText = `${row.text}\n${row.titleText}`;
      return rowText.includes("Spawn failed") &&
        rowText.includes("Approval unavailable") &&
        rowText.includes("gmail.search");
    });
    const deniedScopeText = `${deniedScopeRow?.text ?? ""}\n${deniedScopeRow?.titleText ?? ""}`;
    const inspectedCluster = deniedScopeRow?.element.closest<HTMLElement>(".subagent-parent-cluster");
    const criticalElements = inspectedCluster
      ? [...inspectedCluster.querySelectorAll<HTMLElement>([
        ":scope > summary",
        ".subagent-parent-cluster-mailbox > div",
        ".subagent-parent-cluster-mailbox-action",
      ].join(","))]
        .filter((element) => element.offsetParent !== null && renderedOpenClusterContent(element))
      : [];
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      parentMailboxEventIdCaptured: expected.parentMailboxEventId.length > 0,
      spawnFailureVisible: deniedScopeText.includes("Spawn failed"),
      approvalUnavailableVisible: deniedScopeText.includes("Approval unavailable") &&
        deniedScopeText.includes("non-interactive launch cannot surface required approval"),
      deniedCategoryVisible: deniedScopeText.includes("Denied categories: Connector Read (connector.read)"),
      deniedToolVisible: deniedScopeText.includes("Denied tools: Connector App gmail.search / Connector Read (connector.read)"),
      sourceChildVisible: deniedScopeText.includes(expected.childRunId) &&
        deniedScopeText.includes(expected.childThreadId) &&
        deniedScopeText.includes("root/2:connector-denied"),
      noInteractiveApprovalActions: deniedScopeRow?.actionCount === 0,
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      mailboxRows: mailboxRows.map((row) => ({
        text: row.text,
        titleText: row.titleText,
        actionCount: row.actionCount,
      })),
    };
  }, input);
}

async function inspectApprovalDialog(cdp: CdpClient, input: { approvalId: string; childRunId: string; childThreadId: string }) {
  return evaluate(cdp, (expected) => {
    const dialog = document.querySelector<HTMLElement>(".subagent-approval-dialog");
    const text = dialog?.innerText ?? "";
    const selectedScope = dialog
      ?.querySelector<HTMLInputElement>("input[name='subagent-approval-scope']:checked")
      ?.value;
    const scopeLabels = dialog
      ? [...dialog.querySelectorAll<HTMLElement>(".subagent-approval-scope-option")].map((option) => option.innerText)
      : [];
    return {
      dialogOpened: Boolean(dialog),
      dialogNamesApproval: text.includes(expected.approvalId),
      dialogNamesChildRun: text.includes(expected.childRunId),
      dialogNamesChildThread: text.includes(expected.childThreadId),
      dialogNamesBlockingChild: text.includes("root/0:reviewer") && text.includes("Review worker"),
      dialogShowsParentWaitState: text.includes("Approval is sent to this child") &&
        text.includes("parent stays blocked until the child reaches a synthesis-safe result"),
      dialogShowsPrompt: text.includes("Review worker needs permission to edit files in its isolated worktree."),
      dialogShowsStandardScopes: [
        "This action",
        "For this child",
        "Parent thread tree",
        "Project/workspace",
        "Global",
      ].every((label) => scopeLabels.some((scopeLabel) => scopeLabel.includes(label))),
      initialScopeThisAction: selectedScope === "this_action",
      selectedScope,
      text,
    };
  }, input);
}

async function inspectSubagentUi(cdp: CdpClient) {
  return evaluate(cdp, (parentText) => {
    const cluster = document.querySelector(".subagent-parent-cluster") as HTMLElement | null;
    const summary = cluster?.querySelector("summary") as HTMLElement | null;
    const parentTextNode = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.innerText?.includes(parentText) && !element.querySelector(".subagent-parent-cluster"))
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return (aRect.width * aRect.height) - (bRect.width * bRect.height);
      })[0];
    const clusterRect = cluster?.getBoundingClientRect();
    const parentRect = textRangeRectFor(parentText, clusterRect) ?? parentTextNode?.getBoundingClientRect();
    const text = document.body.innerText;
    const labels = Object.fromEntries([
      "Sub-agent threads",
      "2 children",
      "6 workflow tasks",
      "1 blocking",
      "1 active",
      "1 workflow blocked",
      "1 attention",
      "1 failed spawn",
      "Approval needed",
      "Needs attention",
      "Review worker",
      "Context summarizer",
      "Blocking: approval",
      "Approval requested",
      "Allow workspace write",
      "workspace.write",
      "This child thread",
      "Approve child",
      "Deny child",
      "Waiting on child",
      "Required all",
      "Ask user on failure",
      "Symphony Map-Reduce",
      "Symphony Self-Healing Loop",
      "Symphony Adversarial Debate",
      "Symphony Imitate and Verify",
      "Symphony Pipeline",
      "Symphony Ensemble",
      "Blocking: workflow work",
      "Workflow blocked",
      "Mutating child worker",
      "Staged mutation: src/feature.txt",
      "Parent workspace unchanged",
    ].map((label) => [label, text.includes(label)]));
    const criticalElements = [...(cluster?.querySelectorAll<HTMLElement>([
      ".subagent-parent-cluster summary",
      ".subagent-parent-cluster-child-row",
      ".subagent-parent-cluster-barriers > div",
      ".subagent-parent-cluster-workflows > div",
      ".subagent-parent-cluster-workflow-action",
      ".subagent-parent-cluster-child-blocker-context",
      ".subagent-parent-cluster-mailbox-action.is-button",
      ".subagent-parent-cluster-child-action",
    ].join(",")) ?? [])]
      .filter((element) => element.offsetParent !== null);
    const approveButtons = [...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-approve") ?? [])]
      .filter((button) => button.innerText.trim() === "Approve child");
    const denyButtons = [...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-danger") ?? [])]
      .filter((button) => button.innerText.trim() === "Deny child");
    const approvalButtons = [...approveButtons, ...denyButtons];
    const approvalButtonTitles = approvalButtons.map((button) => button.getAttribute("title") ?? "");
    const approvalButtonAriaLabels = approvalButtons.map((button) => button.getAttribute("aria-label") ?? "");
    const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const defaultExpandedBlockingChildren = [...(cluster?.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread[open]") ?? [])]
      .filter((details) =>
        details.dataset.childDefaultExpanded === "true" ||
        (
          details.innerText.includes("Child transcript") &&
          (details.innerText.includes("Blocking:") || details.innerText.includes("Needs attention"))
        )
      ).length;
    const firstInlineTranscript = cluster?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live");
    const firstPatternGraph = cluster?.querySelector<HTMLElement>(".subagent-parent-cluster-pattern-graphs");
    const approvalFlow = {
      approvalRequested: text.includes("Approval requested"),
      approvalBlockedChild: text.includes("Blocking: approval"),
      parentStillBlocked: text.includes("Waiting on child") && text.includes("Required all"),
      childIdentifierVisible: text.includes("Review worker") && (text.includes("root/0:reviewer") || titledText.includes("root/0:reviewer")),
      toolScopeVisible: text.includes("workspace.write"),
      approvalScopeVisible: text.includes("This action") || text.includes("This child thread"),
      approvalPromptVisible: text.includes("Review worker needs permission to edit files in its isolated worktree."),
      approveButtonVisible: approveButtons.length >= 1,
      denyButtonVisible: denyButtons.length >= 1,
      approvalButtons: approvalButtons.length,
      approvalButtonsNameChild: approvalButtons.length >= 2 && approvalButtonTitles.every((title) =>
        title.includes("desktop-dogfood-approval-write") &&
        title.includes("Allow workspace write") &&
        title.includes("root/0:reviewer") &&
        title.includes("run ") &&
        title.includes("thread ")
      ) && approvalButtonAriaLabels.every((label) =>
        label.includes("desktop-dogfood-approval-write") &&
        label.includes("root/0:reviewer")
      ),
    };
    const childActionButtons = [...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-child-action") ?? [])];
    const childActionSummaries = childActionButtons.map((button) => {
      const row = button.closest(".subagent-parent-cluster-child-row") as HTMLElement | null;
      return {
        ariaLabel: button.getAttribute("aria-label") ?? "",
        title: button.getAttribute("title") ?? "",
        text: button.innerText.trim(),
        hasIcon: Boolean(button.querySelector("svg")),
        disabled: button.disabled,
        rowText: row?.innerText ?? "",
        isClose: button.classList.contains("is-close"),
      };
    });
    const cancelButtons = childActionSummaries.filter((button) => button.ariaLabel.startsWith("Cancel sub-agent "));
    const closeButtons = childActionSummaries.filter((button) => button.ariaLabel.startsWith("Close sub-agent "));
    const reviewCancel = cancelButtons.filter((button) =>
      button.ariaLabel === "Cancel sub-agent Review worker" &&
      button.title.includes("root/0:reviewer") &&
      button.rowText.includes("Review worker")
    );
    const reviewClose = closeButtons.filter((button) =>
      button.ariaLabel === "Close sub-agent Review worker" &&
      button.title.includes("root/0:reviewer") &&
      button.rowText.includes("Review worker")
    );
    const summarizerClose = closeButtons.filter((button) =>
      button.ariaLabel === "Close sub-agent Context summarizer" &&
      button.title.includes("root/1:summarizer") &&
      button.rowText.includes("Context summarizer")
    );
    const operatorControls = {
      cancelActionVisible: reviewCancel.length === 1,
      closeAttentionChildVisible: reviewClose.length === 1,
      closeCompletedChildVisible: summarizerClose.length === 1,
      cancelScopedToAttentionChild: cancelButtons.length === 1 && reviewCancel.length === 1,
      noCancelForCompletedChild: !cancelButtons.some((button) => button.ariaLabel === "Cancel sub-agent Context summarizer"),
      closeTitlesPreserveTranscripts: closeButtons.length === 2 && closeButtons.every((button) => button.title.includes("transcript and artifacts are retained")),
      controlsUseIconButtons: childActionSummaries.length >= 3 && childActionSummaries.every((button) => button.hasIcon && button.text === ""),
      controlsNameChild: childActionSummaries.length >= 3 && childActionSummaries.every((button) =>
        button.ariaLabel.includes("Review worker") || button.ariaLabel.includes("Context summarizer")
      ),
      controlsNotDisabled: childActionSummaries.length >= 3 && childActionSummaries.every((button) => !button.disabled),
      cancelButtons: cancelButtons.length,
      closeButtons: closeButtons.length,
    };
    const criticalRects = criticalElements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      clusterCount: document.querySelectorAll(".subagent-parent-cluster").length,
      defaultCollapsed: !(cluster?.hasAttribute("open") ?? false),
      clusterAfterParentMessage: Boolean(
        parentTextNode
        && cluster
        && (parentTextNode.compareDocumentPosition(cluster) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
      clusterBelowParentMessage: Boolean(clusterRect && parentRect && clusterRect.top >= parentRect.bottom - 2),
      clusterWithinViewport: Boolean(clusterRect && clusterRect.left >= -1 && clusterRect.right <= window.innerWidth + 1),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      childRows: cluster?.querySelectorAll(".subagent-parent-cluster-child-row").length ?? 0,
      defaultExpandedBlockingChildren,
      inlineTranscriptBeforePatternGraphs: Boolean(
        firstInlineTranscript &&
        firstPatternGraph &&
        (firstInlineTranscript.compareDocumentPosition(firstPatternGraph) & Node.DOCUMENT_POSITION_FOLLOWING)
      ),
      warningToneCount: cluster?.querySelectorAll(".tone-warning").length ?? 0,
      activeToneCount: cluster?.querySelectorAll(".tone-active").length ?? 0,
      criticalOverlapCount,
      labels,
      approvalFlow,
      operatorControls,
      summaryText: summary?.innerText ?? "",
    };

    function textRangeRectFor(needle: string, referenceRect: DOMRect | undefined): DOMRect | undefined {
      const candidates: DOMRect[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const value = node.textContent ?? "";
        const index = value.indexOf(needle);
        if (index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + needle.length);
          const rect = range.getBoundingClientRect();
          range.detach();
          if (rect.width > 0 && rect.height > 0) candidates.push(rect);
        }
        node = walker.nextNode();
      }
      const mainColumnCandidates = referenceRect
        ? candidates.filter((rect) => rect.left >= referenceRect.left - 160)
        : candidates;
      return (mainColumnCandidates.length ? mainColumnCandidates : candidates)
        .sort((a, b) => {
          if (!referenceRect) return a.top - b.top;
          return Math.abs(referenceRect.top - a.bottom) - Math.abs(referenceRect.top - b.bottom);
        })[0];
    }
  }, SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT);
}

async function inspectInlineChildTranscript(
  cdp: CdpClient,
  input: {
    childTitle: string;
    childThreadId: string;
    childRunId: string;
    expectedUserText?: string;
    expectedAssistantText?: string;
    expectedToolText?: string;
    forbiddenText?: string;
  },
) {
  return evaluate(cdp, async (expected) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const details = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-thread")]
      .find((candidate) => candidate.innerText.includes(expected.childTitle));
    const summary = details?.querySelector<HTMLElement>("summary");
    const transcript = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript");
    const liveShell = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live");
    const miniThreadHeader = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-mini-thread-header");
    const openFullThreadAction = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-open-full-thread");
    const liveHeader = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live-header");
    const liveStatus = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live-status");
    const liveActivity = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-run-activity");
    const liveActivityCard = liveActivity?.querySelector<HTMLElement>(".run-activity-card");
    const liveActivityLines = [...(liveActivity?.querySelectorAll<HTMLElement>(".run-activity-line") ?? [])]
      .filter((element) => element.offsetParent !== null);
    const stream = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-stream");
    const runtimeRail = details?.querySelector<HTMLElement>(
      ".subagent-parent-cluster-child-runtime-events:not(.subagent-parent-cluster-child-mailbox-events)",
    );
    const runtimeTimelineTitle = runtimeRail?.querySelector<HTMLElement>(".subagent-parent-cluster-child-runtime-events-title");
    const runtimeRows = [...(runtimeRail?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-runtime-event") ?? [])]
      .filter((element) => element.offsetParent !== null);
    const mailboxRail = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-mailbox-events");
    const mailboxTimelineTitle = mailboxRail?.querySelector<HTMLElement>(".subagent-parent-cluster-child-runtime-events-title");
    const mailboxRows = [...(mailboxRail?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-runtime-event") ?? [])]
      .filter((element) => element.offsetParent !== null);
    const liveMarker = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live-marker");
    const endCap = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-end");
    const terminalSummary = details?.querySelector<HTMLElement>("[data-child-terminal-summary='true']");
    const summaryRect = summary?.getBoundingClientRect();
    const transcriptRect = transcript?.getBoundingClientRect();
    const messageElements = [...(transcript?.querySelectorAll<HTMLElement>(".message") ?? [])]
      .filter((element) => element.offsetParent !== null && !element.classList.contains("run-activity"));
    const toolCardElements = [...(transcript?.querySelectorAll<HTMLElement>(".message.tool .tool-card") ?? [])]
      .filter((element) => element.offsetParent !== null);
    const lastMessage = messageElements.at(-1);
    const lastMessageRect = lastMessage?.getBoundingClientRect();
    const liveMarkerRect = liveMarker?.getBoundingClientRect();
    const endCapRect = endCap?.getBoundingClientRect();
    const messageScrollport = details?.closest<HTMLElement>(".messages");
    const conversation = details?.closest<HTMLElement>(".conversation");
    const composerRect = conversation?.querySelector<HTMLElement>(".composer")?.getBoundingClientRect();
    const messagesRect = messageScrollport?.getBoundingClientRect();
    const visibleBottom = Math.min(
      messagesRect?.bottom ?? window.innerHeight,
      composerRect?.top ?? window.innerHeight,
    );
    const visibleTranscriptText = transcript?.innerText ?? "";
    const titledText = [...(details?.querySelectorAll<HTMLElement>("[title]") ?? [])]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const messageCountFromShell = Number(liveShell?.dataset.childMessageCount ?? NaN);
    const toolMessageCountFromShell = Number(liveShell?.dataset.childToolMessageCount ?? NaN);
    const runtimeEventCountFromShell = Number(liveShell?.dataset.childRuntimeEventCount ?? NaN);
    const runtimeEventRenderedCountFromShell = Number(liveShell?.dataset.childRuntimeEventRenderedCount ?? NaN);
    const runtimeEventRenderedCountFromRail = Number(runtimeRail?.dataset.childRuntimeEventRenderedCount ?? NaN);
    const runtimeEventOmittedCountFromShell = Number(liveShell?.dataset.childRuntimeEventOmittedCount ?? NaN);
    const runtimeEventOmittedCountFromRail = Number(runtimeRail?.dataset.childRuntimeEventOmittedCount ?? NaN);
    const mailboxEventCountFromShell = Number(liveShell?.dataset.childMailboxEventCount ?? NaN);
    const mailboxEventRenderedCountFromShell = Number(liveShell?.dataset.childMailboxEventRenderedCount ?? NaN);
    const mailboxEventRenderedCountFromRail = Number(mailboxRail?.dataset.childMailboxEventRenderedCount ?? NaN);
    const mailboxEventOmittedCountFromShell = Number(liveShell?.dataset.childMailboxEventOmittedCount ?? NaN);
    const mailboxEventOmittedCountFromRail = Number(mailboxRail?.dataset.childMailboxEventOmittedCount ?? NaN);
    const runActivityCountFromShell = Number(liveShell?.dataset.childRunActivityCount ?? NaN);
    const runActivityCountFromRail = Number(liveActivity?.dataset.childRunActivityCount ?? NaN);
    const runActivityVisibleFromShell = liveShell?.dataset.childRunActivityVisible === "true";
    const childTranscriptTerminal = liveShell?.dataset.childTerminal === "true";
    const childTranscriptSynthesisSafe = liveShell?.dataset.childSynthesisSafe === "true";
    const childStreaming = liveShell?.dataset.childStreaming === "true";
    const childRenderer = liveShell?.dataset.childRenderer ?? "";
    const transcriptPrimary = liveShell?.dataset.childTranscriptPrimary === "true";
    const transcriptStreamLive = stream?.dataset.childTranscriptStreamLive === "true";
    const runtimeEventsOpen = liveShell?.dataset.childRuntimeEventsOpen === "true";
    const mailboxEventsOpen = liveShell?.dataset.childMailboxEventsOpen === "true";
    const transcriptEndRect = childTranscriptTerminal ? endCapRect : liveMarkerRect;
    const transcriptEndClearancePx = transcriptEndRect ? visibleBottom - transcriptEndRect.bottom : Number.NEGATIVE_INFINITY;
    const liveHeaderText = liveHeader?.innerText ?? "";
    const miniThreadHeaderText = miniThreadHeader?.innerText ?? "";
    const openFullThreadActionText = openFullThreadAction?.innerText ?? "";
    const runtimeTimelineTitleText = runtimeTimelineTitle?.innerText ?? "";
    const mailboxTimelineTitleText = mailboxTimelineTitle?.innerText ?? "";
    const mailboxText = `${mailboxRail?.innerText ?? ""}\n${[...(mailboxRail?.querySelectorAll<HTMLElement>("[title]") ?? [])]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n")}`;
    const criticalElements = [
      ...(summary ? [summary] : []),
      ...(transcript ? [transcript] : []),
      ...(liveActivity ? [liveActivity] : []),
      ...messageElements,
      ...(mailboxRail ? [mailboxRail] : []),
      ...(liveMarker ? [liveMarker] : []),
      ...(endCap ? [endCap] : []),
    ].filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      childExpanded: details instanceof HTMLDetailsElement && details.open,
      transcriptPanelVisible: Boolean(transcript && transcript.offsetParent !== null),
      liveTranscriptShellVisible: Boolean(liveShell && liveShell.offsetParent !== null),
      liveTranscriptStreamVisible: Boolean(stream && stream.offsetParent !== null),
      liveTranscriptStatusVisible: Boolean(liveStatus && liveStatus.offsetParent !== null && liveStatus.innerText.trim().length > 0),
      miniThreadHeaderVisible: Boolean(miniThreadHeader && miniThreadHeader.offsetParent !== null),
      miniThreadHeaderNamesChild: miniThreadHeaderText.includes("Child thread") && miniThreadHeaderText.includes(expected.childTitle),
      openFullThreadActionVisible: Boolean(openFullThreadAction && openFullThreadAction.offsetParent !== null),
      openFullThreadActionNamesChild: (openFullThreadAction?.getAttribute("aria-label") ?? "").includes(expected.childTitle) ||
        openFullThreadActionText.includes("Open full thread"),
      liveTranscriptMessageCountVisible: /\b\d+ messages?\b/.test(liveHeaderText),
      liveTranscriptToolCardCountVisible: toolMessageCountFromShell > 0
        ? /\b\d+ tool cards?\b/.test(liveHeaderText)
        : true,
      liveTranscriptRuntimeEventCountVisible: /\b\d+ runtime events?\b/.test(liveHeaderText),
      liveTranscriptMailboxEventCountVisible: mailboxEventCountFromShell > 0
        ? /\b\d+ mailbox events?\b/.test(liveHeaderText)
        : true,
      liveTranscriptActivityCountVisible: runActivityVisibleFromShell
        ? /\b\d+ activity lines?\b/.test(liveHeaderText)
        : true,
      liveTranscriptMessageCountMatchesBubbles: Number.isFinite(messageCountFromShell) && messageCountFromShell === messageElements.length,
      liveChildActivityVisible: Boolean(liveActivity && liveActivity.offsetParent !== null),
      liveChildActivityUsesParentChrome: Boolean(liveActivityCard && liveActivityCard.offsetParent !== null),
      liveChildActivityCountMatchesShell: runActivityVisibleFromShell
        ? Number.isFinite(runActivityCountFromShell) &&
          Number.isFinite(runActivityCountFromRail) &&
          runActivityCountFromShell === runActivityCountFromRail &&
          liveActivityLines.length === runActivityCountFromShell
        : true,
      liveChildActivityHasLines: runActivityVisibleFromShell ? liveActivityLines.length > 0 : true,
      toolCardVisible: toolCardElements.length > 0,
      toolCardCountMatchesData: Number.isFinite(toolMessageCountFromShell) && toolMessageCountFromShell === toolCardElements.length,
      toolCardUsesParentChrome: toolCardElements.some((element) =>
        element.querySelector(".tool-status") &&
        element.querySelector(".tool-summary-body") &&
        element.querySelector(".tool-output")
      ),
      toolCardResultVisible: expected.expectedToolText
        ? toolCardElements.some((element) => element.innerText.includes(expected.expectedToolText!))
        : true,
      toolCardInputVisible: toolCardElements.some((element) => element.innerText.includes("README.md")),
      childRendererUsesToolCards: toolMessageCountFromShell > 0
        ? childRenderer.includes("tool-card")
        : true,
      transcriptPrimary,
      transcriptStreamLive,
      runtimeEventsOpen,
      mailboxEventsOpen,
      liveTranscriptRuntimeEventCountPositive: Number.isFinite(runtimeEventCountFromShell) && runtimeEventCountFromShell > 0,
      liveTranscriptModeLabelVisible: childTranscriptTerminal
        ? liveHeaderText.includes("terminal end cap below")
        : liveHeaderText.includes("live child run"),
      childStreaming,
      runtimeEventRailVisible: Boolean(runtimeRail && runtimeRail.offsetParent !== null),
      runtimeEventRailHasRecentEvents: runtimeRows.length > 0,
      runtimeTimelineVisible: Boolean(runtimeTimelineTitle && runtimeTimelineTitle.offsetParent !== null && runtimeTimelineTitleText.includes("Runtime timeline")),
      runtimeTimelineCountVisible: /\b\d+ events?\b/.test(runtimeTimelineTitleText) || /Latest \d+ of \d+ events/.test(runtimeTimelineTitleText),
      runtimeTimelineRenderedCountMatchesRows: Number.isFinite(runtimeEventRenderedCountFromShell) &&
        Number.isFinite(runtimeEventRenderedCountFromRail) &&
        runtimeEventRenderedCountFromShell === runtimeRows.length &&
        runtimeEventRenderedCountFromRail === runtimeRows.length,
      runtimeTimelineOmittedCountConsistent: Number.isFinite(runtimeEventOmittedCountFromShell) &&
        Number.isFinite(runtimeEventOmittedCountFromRail) &&
        runtimeEventOmittedCountFromShell === runtimeEventOmittedCountFromRail,
      runtimeEventRows: runtimeRows.length,
      childMailboxEventCountPositive: Number.isFinite(mailboxEventCountFromShell) && mailboxEventCountFromShell > 0,
      childMailboxTimelineVisible: Boolean(mailboxRail && mailboxRail.offsetParent !== null),
      childMailboxTimelineCountVisible: /\b\d+ events?\b/.test(mailboxTimelineTitleText) || /Latest \d+ of \d+ events/.test(mailboxTimelineTitleText),
      childMailboxTimelineRenderedCountMatchesRows: Number.isFinite(mailboxEventRenderedCountFromShell) &&
        Number.isFinite(mailboxEventRenderedCountFromRail) &&
        mailboxEventRenderedCountFromShell === mailboxRows.length &&
        mailboxEventRenderedCountFromRail === mailboxRows.length,
      childMailboxTimelineOmittedCountConsistent: Number.isFinite(mailboxEventOmittedCountFromShell) &&
        Number.isFinite(mailboxEventOmittedCountFromRail) &&
        mailboxEventOmittedCountFromShell === mailboxEventOmittedCountFromRail,
      childMailboxTimelineHasParentFollowup: mailboxText.includes("Parent follow-up queued") &&
        mailboxText.includes("Parent follow-up delivered while the review worker remains live and inspectable."),
      childMailboxRows: mailboxRows.length,
      userMessageVisible: expected.expectedUserText
        ? visibleTranscriptText.includes(expected.expectedUserText)
        : true,
      assistantMessageVisible: expected.expectedAssistantText
        ? visibleTranscriptText.includes(expected.expectedAssistantText)
        : true,
      siblingSummaryNotLeakedIntoTranscript: expected.forbiddenText
        ? !visibleTranscriptText.includes(expected.forbiddenText)
        : true,
      childRunIdVisible: (details?.innerText ?? "").includes(expected.childRunId) ||
        titledText.includes(expected.childRunId) ||
        details?.dataset.childRunId === expected.childRunId,
      childThreadIdVisible: (details?.innerText ?? "").includes(expected.childThreadId) ||
        titledText.includes(expected.childThreadId) ||
        details?.dataset.childThreadId === expected.childThreadId,
      messageBubbleCount: messageElements.length,
      childTranscriptTerminal,
      childTranscriptSynthesisSafe,
      liveContinuationMarkerVisible: Boolean(liveMarker && liveMarker.offsetParent !== null),
      liveContinuationMarkerAfterMessages: Boolean(
        liveMarker &&
        liveMarker.offsetParent !== null &&
        (!lastMessageRect || (liveMarkerRect && liveMarkerRect.top >= lastMessageRect.bottom - 2))
      ),
      completionEndCapVisible: Boolean(terminalSummary && terminalSummary.offsetParent !== null),
      completionEndCapText: terminalSummary?.innerText ?? "",
      completionEndCapLabelVisible: Boolean(terminalSummary && terminalSummary.innerText.includes("Completion summary")),
      finalStatusEndCapLabelVisible: Boolean(terminalSummary && terminalSummary.innerText.includes("Final child status")),
      terminalEndCapLabelVisible: Boolean(
        terminalSummary &&
        (terminalSummary.innerText.includes("Completion summary") || terminalSummary.innerText.includes("Final child status"))
      ),
      completionEndCapAfterMessages: Boolean(
        terminalSummary &&
        terminalSummary.offsetParent !== null &&
        (!lastMessageRect || (endCapRect && endCapRect.top >= lastMessageRect.bottom - 2))
      ),
      completionSummaryDeferredWhileLive: childTranscriptTerminal
        ? true
        : Boolean(liveMarker && liveMarker.offsetParent !== null && !(terminalSummary && terminalSummary.offsetParent !== null)),
      transcriptEndStateCorrect: childTranscriptTerminal
        ? Boolean(terminalSummary && terminalSummary.offsetParent !== null && (!lastMessageRect || (endCapRect && endCapRect.top >= lastMessageRect.bottom - 2)))
        : Boolean(liveMarker && liveMarker.offsetParent !== null && !(terminalSummary && terminalSummary.offsetParent !== null)),
      transcriptEndClearsComposer: transcriptEndClearancePx >= 8,
      transcriptEndClearancePx,
      summaryNotObscuringTranscript: Boolean(
        summaryRect &&
        transcriptRect &&
        transcriptRect.top >= summaryRect.bottom - 2 &&
        transcriptRect.height > 40
      ),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      transcriptText: visibleTranscriptText,
    };
  }, {
    expectedUserText: input.expectedUserText,
    expectedAssistantText: input.expectedAssistantText,
    expectedToolText: input.expectedToolText,
    forbiddenText: input.forbiddenText,
    ...input,
  });
}

async function inspectEffectiveRoleSnapshot(cdp: CdpClient) {
  return evaluate(cdp, () => {
    const inspector = document.querySelector<HTMLElement>(".subagent-thread-inspector");
    const text = inspector?.innerText ?? "";
    return {
      inspectorVisible: Boolean(inspector && inspector.offsetParent !== null),
      effectiveRoleVisible: text.includes("Effective role") && text.includes("Reviewer + Mapper"),
      patternRoleVisible: text.includes("Pattern role") && text.includes("Mapper"),
      overlaysVisible: text.includes("Role overlays") &&
        text.includes("slice assignment") &&
        text.includes("evidence burden") &&
        text.includes("approval checkpoint"),
      outputContractVisible: text.includes("Output contract") && text.includes("schema-valid mapped review evidence"),
      titleVisible: text.includes("Reviewer + Mapper sub-agent"),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      inspectorText: text,
    };
  });
}

async function inspectApprovalForwarding(
  cdp: CdpClient,
  input: { approvalId: string; childRunId: string; childThreadId: string; canonicalTaskPath: string },
) {
  return evaluate(cdp, (expected) => {
    const cluster = document.querySelector<HTMLElement>(".subagent-parent-cluster");
    const text = document.body.innerText;
    const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const mailboxRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const childRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        childRunId: row.closest<HTMLElement>(".subagent-parent-cluster-child-thread")?.dataset.childRunId ??
          row.dataset.childRunId ?? "",
        childThreadId: row.closest<HTMLElement>(".subagent-parent-cluster-child-thread")?.dataset.childThreadId ??
          row.dataset.childThreadId ?? "",
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const forwarded = mailboxRows.find((row) => row.text.includes("Approval forwarded"));
    const approvalRequest = mailboxRows.find((row) => row.text.includes("Approval requested"));
    const review = childRows.find((row) => row.text.includes("Review worker"));
    const rowText = (row: { text: string; titleText: string } | undefined) => `${row?.text ?? ""}\n${row?.titleText ?? ""}`;
    const rowNamesExpectedChild = (row: { text: string; titleText: string } | undefined) => {
      const haystack = rowText(row);
      return haystack.includes(expected.childRunId) &&
        haystack.includes(expected.childThreadId) &&
        haystack.includes(expected.canonicalTaskPath);
    };
    const approvalActionButtons = [...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-button") ?? [])]
      .filter((button) => ["Approve child", "Deny child"].includes(button.innerText.trim()));
    const criticalElements = [...(cluster?.querySelectorAll<HTMLElement>([
      ".subagent-parent-cluster-child-row",
      ".subagent-parent-cluster-barriers > div",
      ".subagent-parent-cluster-mailbox > div",
      ".subagent-parent-cluster-mailbox-action.is-button",
    ].join(",")) ?? [])]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      forwardedVisible: Boolean(forwarded),
      approvedDecisionVisible: Boolean(forwarded?.text.includes("Approved")),
      childThreadScopeVisible: Boolean(forwarded?.text.includes("This child thread")),
      childScopedPersistenceVisible: Boolean(
        forwarded?.text.includes("Approval grant applies to this child thread") ||
        forwarded?.text.includes("Always defaulted to this child thread")
      ),
      parentResumeAfterApprovalVisible: Boolean(forwarded?.text.includes("Parent returned to waiting on this child")),
      forwardedNamesChild: Boolean(
        forwarded &&
        (forwarded.text.includes("Review worker") || forwarded.titleText.includes("Review worker") || titledText.includes("Review worker")) &&
        (forwarded.text.includes("root/0:reviewer") || forwarded.titleText.includes("root/0:reviewer") || titledText.includes("root/0:reviewer")) &&
        (forwarded.text.includes(expected.childRunId) || forwarded.titleText.includes(expected.childRunId) || titledText.includes(expected.childRunId))
      ),
      forwardedNamesApproval: Boolean(forwarded?.text.includes(expected.approvalId)),
      forwardedMatchesApprovalChild: rowNamesExpectedChild(forwarded),
      approvalRequestMatchesApprovalChild: rowNamesExpectedChild(approvalRequest),
      forwardedAndRequestSameChild: rowNamesExpectedChild(forwarded) && rowNamesExpectedChild(approvalRequest),
      approvalRequestStillVisible: Boolean(approvalRequest),
      approvalRequestActionsRemoved: approvalActionButtons.length === 0,
      parentStillBlockedAfterForward: text.includes("Waiting on child") && text.includes("Required all"),
      childRowDataMatchesApprovalChild: Boolean(
        review?.childRunId === expected.childRunId &&
        review?.childThreadId === expected.childThreadId &&
        (review.text.includes(expected.canonicalTaskPath) || review.titleText.includes(expected.canonicalTaskPath))
      ),
      childRowStillBlocksApprovalChild: Boolean(
        review?.childRunId === expected.childRunId &&
        review?.childThreadId === expected.childThreadId &&
        (review.text.includes("Blocking: needs steering") || review.titleText.includes("Blocking: needs steering"))
      ),
      childReturnedToNeedsSteering: Boolean(
        review &&
        (review.text.includes("Blocking: needs steering") || review.titleText.includes("Blocking: needs steering"))
      ),
      waitBarrierStillVisible: text.includes("Waiting on child") && text.includes("Ask user on failure"),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      mailboxRows,
      childRows,
    };
  }, input);
}

async function inspectRestartRehydration(
  cdp: CdpClient,
  input: {
    approvalId: string;
    childRunId: string;
    childThreadId: string;
    workflowTaskId: string;
    workflowArtifactId: string;
    workflowRunId: string;
    workflowThreadId: string;
    mutatingWorkflowTaskId: string;
    mutatingWorkflowArtifactId: string;
    mutatingWorkflowRunId: string;
    workflowHighLoadTaskIds: string[];
    workflowHighLoadArtifactIds: string[];
    workflowHighLoadRunIds: string[];
    workflowHighLoadPatternLabels: string[];
    defaultCollapsedAfterRelaunch: boolean;
    summarizerAssistantText?: string;
  },
) {
  return evaluate(cdp, (expected) => {
    const cluster = document.querySelector(".subagent-parent-cluster") as HTMLElement | null;
    const text = document.body.innerText;
    const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const mailboxRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const childRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const workflowRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-workflows > div") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => ({
        text: row.innerText,
        titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
          .map((element) => element.getAttribute("title") ?? "")
          .join("\n"),
      }));
    const graphSection = cluster?.querySelector<HTMLElement>(".subagent-parent-cluster-pattern-graphs");
    const graphPanels = [...(graphSection?.querySelectorAll<HTMLElement>(".subagent-pattern-graph") ?? [])]
      .filter((panel) => panel.offsetParent !== null)
      .map((panel) => ({
        ariaLabel: panel.getAttribute("aria-label") ?? "",
        text: panel.textContent ?? "",
      }));
    const graphNodes = [...(graphSection?.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node") ?? [])]
      .map((node) => ({
        ariaLabel: node.getAttribute("aria-label") ?? "",
        childRunId: node.dataset.childRunId ?? "",
        childThreadId: node.dataset.childThreadId ?? "",
        workflowTaskId: node.dataset.workflowTaskId ?? "",
        workflowRunId: node.dataset.workflowRunId ?? "",
      }));
    const forwarded = mailboxRows.find((row) => row.text.includes("Approval forwarded"));
    const approvalRequest = mailboxRows.find((row) => row.text.includes("Approval requested"));
    const workflowBlock = mailboxRows.find((row) =>
      row.text.includes("Workflow blocked") ||
      row.titleText.includes(expected.workflowTaskId)
    );
    const review = childRows.find((row) => row.text.includes("Review worker"));
    const summarizer = childRows.find((row) => row.text.includes("Context summarizer"));
    const workflow = workflowRows.find((row) =>
      row.text.includes("Symphony Map-Reduce") ||
      row.titleText.includes("Symphony Map-Reduce")
    );
    const mutatingWorkflow = workflowRows.find((row) =>
      row.text.includes("Symphony Self-Healing Loop") ||
      row.titleText.includes(expected.mutatingWorkflowArtifactId) ||
      row.titleText.includes(expected.mutatingWorkflowTaskId)
    );
    const workflowText = `${workflow?.text ?? ""}\n${workflow?.titleText ?? ""}`;
    const mutatingWorkflowText = `${mutatingWorkflow?.text ?? ""}\n${mutatingWorkflow?.titleText ?? ""}`;
    const workflowBlockText = `${workflowBlock?.text ?? ""}\n${workflowBlock?.titleText ?? ""}`;
    const approvalActionButtons = [...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-button") ?? [])]
      .filter((button) => ["Approve child", "Deny child"].includes(button.innerText.trim()));
    const criticalElements = [...(cluster?.querySelectorAll<HTMLElement>([
      "summary",
      ".subagent-parent-cluster-child-row",
      ".subagent-parent-cluster-barriers > div",
      ".subagent-parent-cluster-workflows > div",
      ".subagent-parent-cluster-workflow-action",
      ".subagent-parent-cluster-mailbox > div",
      ".subagent-parent-cluster-mailbox-action.is-button",
      ".subagent-parent-cluster-child-action",
    ].join(",")) ?? [])]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      defaultCollapsedAfterRelaunch: expected.defaultCollapsedAfterRelaunch,
      expandedAfterRelaunch: Boolean(cluster?.hasAttribute("open")),
      parentMessageVisible: text.includes("Ambient is coordinating a parent task while required child work stays visible."),
      approvalForwardedRehydrated: Boolean(
        forwarded?.text.includes("Approval forwarded") &&
        forwarded.text.includes("Approved") &&
        forwarded.text.includes(expected.approvalId)
      ),
      approvalRequestRehydrated: Boolean(
        approvalRequest?.text.includes("Approval requested") &&
        approvalRequest.text.includes("Allow workspace write") &&
        approvalRequest.text.includes("workspace.write")
      ),
      approvalActionsStillRemoved: approvalActionButtons.length === 0,
      parentStillBlockedAfterRelaunch: text.includes("Waiting on child") && text.includes("Required all"),
      childBlockerRehydrated: Boolean(
        review &&
        (review.text.includes("Blocking: needs steering") || review.titleText.includes("Blocking: needs steering"))
      ),
      childRunIdRehydrated: text.includes(expected.childRunId) || titledText.includes(expected.childRunId),
      childThreadIdRehydrated: text.includes(expected.childThreadId) || titledText.includes(expected.childThreadId),
      completedChildResultSummaryRehydrated: Boolean(
        summarizer?.text.includes("Context summarizer") &&
        (
          summarizer.text.includes("Background context summary is available.") ||
          summarizer.text.includes(expected.summarizerAssistantText)
        ) &&
        summarizer.text.includes("Completed")
      ),
      workflowTaskRehydrated: workflowText.includes("Symphony Map-Reduce") && workflowText.includes("Running"),
      workflowBlockerRehydrated: workflowText.includes("Blocking: workflow work"),
      workflowMailboxBlockRehydrated: workflowBlockText.includes("Workflow blocked") &&
        workflowBlockText.includes("1 blocking workflow"),
      workflowArtifactRehydrated: text.includes(expected.workflowArtifactId) || titledText.includes(expected.workflowArtifactId),
      workflowRunRehydrated: text.includes(expected.workflowRunId) || titledText.includes(expected.workflowRunId),
      workflowThreadRehydrated: text.includes(expected.workflowThreadId) || titledText.includes(expected.workflowThreadId),
      mutatingWorkflowTaskRehydrated: mutatingWorkflowText.includes("Symphony Self-Healing Loop") &&
        mutatingWorkflowText.includes("Succeeded") &&
        mutatingWorkflowText.includes("Mutating child worker"),
      mutatingWorkflowArtifactRehydrated: text.includes(expected.mutatingWorkflowArtifactId) ||
        titledText.includes(expected.mutatingWorkflowArtifactId),
      mutatingWorkflowRunRehydrated: text.includes(expected.mutatingWorkflowRunId) ||
        titledText.includes(expected.mutatingWorkflowRunId),
      workflowHighLoadTasksRehydrated: expected.workflowHighLoadTaskIds.every((id) => text.includes(id) || titledText.includes(id)) &&
        expected.workflowHighLoadPatternLabels.every((label) => text.includes(label) || titledText.includes(label)),
      workflowHighLoadArtifactsRehydrated: expected.workflowHighLoadArtifactIds.every((id) => text.includes(id) || titledText.includes(id)),
      workflowHighLoadRunsRehydrated: expected.workflowHighLoadRunIds.every((id) => text.includes(id) || titledText.includes(id)),
      patternGraphsRehydrated: graphPanels.length >= 6 &&
        expected.workflowHighLoadPatternLabels.every((label) =>
          graphPanels.some((panel) => `${panel.ariaLabel}\n${panel.text}`.includes(label.replace("Symphony ", "")))
        ),
      patternGraphChildBindingRehydrated: graphNodes.some((node) =>
        node.childRunId === expected.childRunId &&
        node.childThreadId === expected.childThreadId &&
        node.ariaLabel.includes("Open Review worker thread from Map-Reduce")
      ),
      patternGraphRuntimeBindingsRehydrated: [
        expected.workflowTaskId,
        expected.mutatingWorkflowTaskId,
        ...expected.workflowHighLoadTaskIds,
      ].every((id) => graphNodes.some((node) => node.workflowTaskId === id)) &&
        [
          expected.workflowRunId,
          expected.mutatingWorkflowRunId,
          ...expected.workflowHighLoadRunIds,
        ].every((id) => graphNodes.some((node) => node.workflowRunId === id)),
      childRowsRehydrated: childRows.length === 2,
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      mailboxRows,
      childRows,
      workflowRows,
    };
  }, {
    ...input,
    summarizerAssistantText: input.summarizerAssistantText ?? SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
  });
}

async function inspectWorkflowRehydratedNavigation(
  cdp: CdpClient,
  input: {
    workflowTitle: string;
    workflowThreadId: string;
  },
) {
  return evaluate(cdp, async (expected) => {
    const text = document.body.innerText;
    const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const workspace = document.querySelector<HTMLElement>(".automation-workspace");
    const heading = workspace?.querySelector<HTMLElement>(".automation-workspace-header h1");
    const activeThreadRows = [...document.querySelectorAll<HTMLElement>(".automation-thread-row.active")]
      .map((row) => ({
        text: row.innerText,
        title: row.getAttribute("title") ?? "",
      }));
    const activeThreadRow = activeThreadRows.find((row) =>
      row.text.includes(expected.workflowTitle) ||
      row.title.includes(expected.workflowTitle)
    );
    const legacyPane = document.querySelector<HTMLElement>(".workflow-exploration-live-card.blocked");
    const threadPane = document.querySelector<HTMLElement>(
      ".workflow-build-workspace, .workflow-discovery-layout, .workflow-runs-workspace"
    );
    const navigationErrors = [...document.querySelectorAll<HTMLElement>(".sidebar-error, .panel-status.error")]
      .map((element) => element.innerText)
      .filter(Boolean);
    const desktopApi = (window as unknown as {
      ambientDesktop?: {
        listWorkflowAgentFolders?: () => Promise<Array<{ threads?: Array<{ id?: string; title?: string }> }>>;
      };
    }).ambientDesktop;
    const folders = desktopApi?.listWorkflowAgentFolders
      ? await desktopApi.listWorkflowAgentFolders()
      : [];
    const linkedThread = folders.flatMap((folder) => folder.threads ?? [])
      .find((thread) => thread.id === expected.workflowThreadId);
    const linkedThreadSummary = linkedThread
      ? {
        id: linkedThread.id,
        title: linkedThread.title,
        phase: "phase" in linkedThread ? (linkedThread as { phase?: string }).phase : undefined,
        status: "status" in linkedThread ? (linkedThread as { status?: string }).status : undefined,
        activeArtifactId: "activeArtifactId" in linkedThread ? (linkedThread as { activeArtifactId?: string }).activeArtifactId : undefined,
        chatThreadId: "chatThreadId" in linkedThread ? (linkedThread as { chatThreadId?: string }).chatThreadId : undefined,
      }
      : undefined;
    const criticalElements = [...document.querySelectorAll<HTMLElement>([
      ".automation-workspace-header",
      ".automation-thread-row.active",
      ".workflow-exploration-live-card.blocked",
      ".workflow-build-workspace",
      ".workflow-discovery-layout",
      ".workflow-runs-workspace",
    ].join(","))]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      workflowAutomationPaneVisible: Boolean(workspace),
      workflowThreadHeaderVisible: Boolean(
        heading?.innerText.includes(expected.workflowTitle) ||
        (heading?.getAttribute("title") ?? "").includes(expected.workflowTitle)
      ),
      workflowThreadSidebarSelected: Boolean(activeThreadRow),
      workflowThreadTitleVisible: text.includes(expected.workflowTitle) || titledText.includes(expected.workflowTitle),
      workflowThreadFolderLinkPresent: Boolean(linkedThreadSummary),
      workflowThreadMatchesExpectedId: linkedThreadSummary?.id === expected.workflowThreadId &&
        linkedThreadSummary?.title === expected.workflowTitle,
      legacyOrThreadPaneVisible: Boolean(
        (legacyPane && legacyPane.innerText.includes(expected.workflowTitle)) ||
        threadPane
      ),
      navigationErrorAbsent: navigationErrors.length === 0,
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      activeThreadRows,
      linkedThread: linkedThreadSummary,
      navigationErrors,
    };
  }, input);
}

async function inspectWorkflowArtifactRehydration(
  cdp: CdpClient,
  input: {
    workflowTitle: string;
    workflowArtifactId: string;
    workflowRunId: string;
    workflowThreadId: string;
    sourceRelativePath: string;
    stateRelativePath: string;
    sourceContent: string;
  },
) {
  return evaluate(cdp, async (expected) => {
    const text = document.body.innerText;
    const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const workspace = document.querySelector<HTMLElement>(".automation-workspace");
    const buildPanel = document.querySelector<HTMLElement>(".workflow-build-panel-body");
    const sourcePanel = document.querySelector<HTMLElement>(".workflow-artifact-source-panel");
    const sourcePanelText = `${sourcePanel?.innerText ?? ""}\n${[...(sourcePanel?.querySelectorAll<HTMLElement>("[title]") ?? [])]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n")}`;
    const activeThreadRow = [...document.querySelectorAll<HTMLElement>(".automation-thread-row.active")]
      .find((row) => row.innerText.includes(expected.workflowTitle) || (row.getAttribute("title") ?? "").includes(expected.workflowTitle));
    const desktopApi = (window as unknown as {
      ambientDesktop?: {
        listWorkflowAgentFolders?: () => Promise<Array<{ threads?: Array<{ id?: string; title?: string; activeArtifactId?: string }> }>>;
        getWorkflowRunDetail?: (input: { runId: string }) => Promise<{
          artifact?: { id?: string; title?: string; sourcePath?: string; statePath?: string };
          run?: { id?: string };
          sourceContent?: string;
          sourceReadError?: string;
        }>;
      };
    }).ambientDesktop;
    const folders = desktopApi?.listWorkflowAgentFolders
      ? await desktopApi.listWorkflowAgentFolders()
      : [];
    const linkedThread = folders.flatMap((folder) => folder.threads ?? [])
      .find((thread) => thread.id === expected.workflowThreadId);
    const detail: {
      artifact?: { id?: string; title?: string; sourcePath?: string; statePath?: string };
      run?: { id?: string };
      sourceContent?: string;
      sourceReadError?: string;
    } | undefined = desktopApi?.getWorkflowRunDetail
      ? await desktopApi.getWorkflowRunDetail({ runId: expected.workflowRunId }).catch((error: unknown) => ({
          sourceReadError: error instanceof Error ? error.message : String(error),
        }))
      : undefined;
    const allText = `${text}\n${titledText}\n${sourcePanelText}`;
    const criticalElements = [...document.querySelectorAll<HTMLElement>([
      ".automation-workspace-header",
      ".automation-thread-row.active",
      ".workflow-build-rail",
      ".workflow-build-panel-body",
      ".workflow-artifact-source-panel",
      ".workflow-artifact-paths",
      ".workflow-artifact-source-panel pre",
    ].join(","))]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      workflowBuildWorkspaceVisible: Boolean(workspace?.querySelector(".workflow-build-workspace") || document.querySelector(".workflow-build-workspace")),
      sourcePanelSelected: buildPanel?.getAttribute("data-workflow-build-panel") === "build-source" &&
        buildPanel.getAttribute("data-workflow-artifact-panel") === "source",
      artifactTitleVisible: allText.includes(expected.workflowTitle),
      activeWorkflowThreadVisible: Boolean(activeThreadRow),
      artifactIdMatchesLinkedThread: linkedThread?.activeArtifactId === expected.workflowArtifactId,
      runDetailLoaded: detail?.run?.id === expected.workflowRunId && detail?.artifact?.id === expected.workflowArtifactId,
      sourcePathVisible: allText.includes(expected.sourceRelativePath),
      statePathVisible: allText.includes(expected.stateRelativePath),
      sourceContentVisible: sourcePanelText.includes(expected.sourceContent.trim()),
      sourceContentMatchesExpected: detail?.sourceContent === expected.sourceContent,
      noSourceReadError: !sourcePanelText.includes("Read error") && !detail?.sourceReadError,
      detailSourcePathMatches: Boolean(detail?.artifact?.sourcePath?.includes(expected.sourceRelativePath)),
      detailStatePathMatches: Boolean(detail?.artifact?.statePath?.includes(expected.stateRelativePath)),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      linkedThread,
      detail: detail
        ? {
            artifactId: detail.artifact?.id,
            runId: detail.run?.id,
            sourcePath: detail.artifact?.sourcePath,
            statePath: detail.artifact?.statePath,
            sourceReadError: detail.sourceReadError,
          }
        : undefined,
      sourcePanelText: sourcePanelText.slice(0, 2000),
    };
  }, input);
}

async function inspectOperatorBehavior(cdp: CdpClient) {
  return evaluate(cdp, () => {
    const clusters = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster")]
      .filter((candidate) => candidate.offsetParent !== null);
    const cluster = clusters.find((candidate) =>
      candidate.innerText.includes("Review worker") &&
      candidate.innerText.includes("Context summarizer")
    ) ?? clusters[0];
    const rows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => {
        const actions = [...row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-child-action")];
        return {
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")]
            .map((element) => element.getAttribute("title") ?? "")
            .join("\n"),
          cancelActions: actions.filter((button) => button.getAttribute("aria-label")?.startsWith("Cancel sub-agent ")).length,
          closeActions: actions.filter((button) => button.getAttribute("aria-label")?.startsWith("Close sub-agent ")).length,
        };
      });
    const review = rows.find((row) => row.text.includes("Review worker"));
    const summarizer = rows.find((row) => row.text.includes("Context summarizer"));
    const clusterTitleText = [...(cluster?.querySelectorAll<HTMLElement>("[title]") ?? [])]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const text = [
      cluster?.innerText ?? "",
      clusterTitleText,
      rows.map((row) => `${row.text}\n${row.titleText}`).join("\n"),
      document.body.innerText,
    ].join("\n");
    const criticalElements = [...(cluster?.querySelectorAll<HTMLElement>([
      ".subagent-parent-cluster-child-row",
      ".subagent-parent-cluster-barriers > div",
      ".subagent-parent-cluster-mailbox > div",
      ".subagent-parent-cluster-child-action",
    ].join(",")) ?? [])]
      .filter((element) => element.offsetParent !== null);
    const criticalRects = criticalElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    let criticalOverlapCount = 0;
    for (let index = 0; index < criticalRects.length; index += 1) {
      for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
        const aElement = criticalElements[index];
        const bElement = criticalElements[compare];
        if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
        const a = criticalRects[index];
        const b = criticalRects[compare];
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
      }
    }
    return {
      completedChildClosed: Boolean(summarizer?.text.includes("Closed")),
      completedChildStillVisible: Boolean(summarizer?.text.includes("Context summarizer")),
      completedChildControlsReleased: summarizer
        ? summarizer.cancelActions === 0 && summarizer.closeActions === 0
        : false,
      attentionChildCancelled: Boolean(review?.text.includes("Cancelled")),
      attentionChildStillVisible: Boolean(review?.text.includes("Review worker")),
      attentionCancelControlRemoved: review ? review.cancelActions === 0 : false,
      siblingStatePreserved: Boolean(review?.text.includes("Cancelled") && summarizer?.text.includes("Closed")),
      lifecycleInterruptionVisible: text.includes("Child interrupted") &&
        text.includes("Cancelled") &&
        (text.includes("root/0:reviewer") || rows.some((row) => row.titleText.includes("root/0:reviewer"))),
      typedBarrierConsequenceVisible: text.includes("1 wait barrier cancelled") &&
        (text.includes("Child interrupted") || text.includes("Cancelled")),
      rowsStillInspectable: rows.length === 2,
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      rowSummaries: rows,
    };
  });
}

async function captureFailureArtifacts(cdp: CdpClient, artifacts: Record<string, string>) {
  try {
    artifacts.failureScreenshot = await writeScreenshot(cdp, "failure.png");
  } catch {
    // Best-effort diagnostics only.
  }
  try {
    artifacts.failureDomSnapshot = await writeDomSnapshot(cdp, "failure-dom.json");
  } catch {
    // Best-effort diagnostics only.
  }
}

async function writeScreenshot(cdp: CdpClient, name: string): Promise<string> {
  const outputPath = join(RESULTS_DIR, name);
  const result = await cdp.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
  return relative(REPO_ROOT, outputPath);
}

async function writeAccessibilitySnapshot(cdp: CdpClient, name: string): Promise<string> {
  const outputPath = join(RESULTS_DIR, name);
  const snapshot = await cdp.send("Accessibility.getFullAXTree");
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2), "utf8");
  return relative(REPO_ROOT, outputPath);
}

async function writeDomSnapshot(cdp: CdpClient, name: string): Promise<string> {
  const outputPath = join(RESULTS_DIR, name);
  const snapshot = await evaluate(cdp, () => ({
    title: document.title,
    url: location.href,
    text: document.body.innerText.slice(0, 8000),
    clusterCount: document.querySelectorAll(".subagent-parent-cluster").length,
    childDetails: [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")].map((details) => ({
      childRunId: details.dataset.childRunId,
      childThreadId: details.dataset.childThreadId,
      defaultExpanded: details.dataset.childDefaultExpanded,
      open: details.open,
      hasTranscript: Boolean(details.querySelector(".subagent-parent-cluster-child-transcript")),
      hasLiveTranscript: Boolean(details.querySelector(".subagent-parent-cluster-child-transcript-live")),
      text: details.innerText.slice(0, 1000),
    })),
    activeThreadText: document.body.innerText.match(/Sub-agent Desktop dogfood|New Chat|Instructions/g) ?? [],
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2), "utf8");
  return relative(REPO_ROOT, outputPath);
}

async function exportChatAndInspectChildBundle(
  cdp: CdpClient,
  input: {
    parentThreadId: string;
    exportPath: string;
    expectedChildRuns: Array<{
      runId: string;
      threadId: string;
      expectedText: string;
      expectedUserText?: string;
      exportCategory?: "primary" | "lifecycle_edge" | "parent_stop";
      patternGraphLinked?: boolean;
    }>;
    workflowTaskId: string;
    approvalId: string;
    approvalParentMailboxEventId: string;
    approvalChildRunId: string;
    approvalChildThreadId: string;
    approvalCanonicalTaskPath: string;
    approvalWaitBarrierId: string;
    approvalRequestedToolId: string;
    approvalRequestedAction: string;
  },
) {
  const result = await evaluate<Promise<{
    path?: string;
    bytes?: number;
    createdAt?: string;
    source?: string;
    fallbackReason?: string;
  } | undefined>, [string]>(cdp, async (threadId) => {
    const desktop = (window as Window & {
      ambientDesktop?: {
        exportChat(input: { threadId: string }): Promise<{
          path?: string;
          bytes?: number;
          createdAt?: string;
          source?: string;
          fallbackReason?: string;
        } | undefined>;
      };
    }).ambientDesktop;
    if (!desktop?.exportChat) throw new Error("Ambient Desktop exportChat API is unavailable.");
    return desktop.exportChat({ threadId });
  }, input.parentThreadId);
  const archive = await readFile(input.exportPath);
  const zip = await JSZip.loadAsync(archive);
  const manifest = await readZipJson<Record<string, any>>(zip, "manifest.json");
  const index = await readZipJson<Record<string, any>>(zip, "child-threads/index.json");
  const children = Array.isArray(index.children) ? index.children as Array<Record<string, any>> : [];
  const childByRunId = new Map(children.map((child) => [child.run?.id, child]));
  const expectedChildren = input.expectedChildRuns.map((expected) => {
    const child = childByRunId.get(expected.runId);
    const dir = typeof child?.dir === "string" ? child.dir : "";
    return {
      expected,
      child,
      dir,
      transcript: dir ? zip.file(`${dir}/visible-transcript.md`) : undefined,
      fullTranscript: dir ? zip.file(`${dir}/full-transcript.md`) : undefined,
      fullTranscriptJson: dir ? zip.file(`${dir}/full-transcript.json`) : undefined,
      runEvents: dir ? zip.file(`${dir}/run-events.json`) : undefined,
      toolScopeSnapshots: dir ? zip.file(`${dir}/tool-scope-snapshots.json`) : undefined,
      waitBarriers: dir ? zip.file(`${dir}/wait-barriers.json`) : undefined,
    };
  });
  const childTranscriptTexts = await Promise.all(
    expectedChildren.map(async (child) => child.transcript ? child.transcript.async("string") : ""),
  );
  const expectedChildrenWithTranscripts = expectedChildren.map((child, index) => ({
    ...child,
    transcriptText: childTranscriptTexts[index] ?? "",
  }));
  const graphLinkedExpectedChildren = input.expectedChildRuns.filter((expected) => expected.patternGraphLinked === true);
  const expectedRunExported = (child: typeof expectedChildrenWithTranscripts[number]) =>
    child.child?.run?.id === child.expected.runId && child.child?.thread?.id === child.expected.threadId;
  const expectedTranscriptHasMessages = (child: typeof expectedChildrenWithTranscripts[number]) =>
    child.transcriptText.includes(child.expected.expectedText) &&
    (!child.expected.expectedUserText || child.transcriptText.includes(child.expected.expectedUserText));
  const expectedChildHasBundleFiles = (child: typeof expectedChildrenWithTranscripts[number]) =>
    Boolean(child.fullTranscript) &&
    Boolean(child.fullTranscriptJson) &&
    Boolean(child.runEvents) &&
    Boolean(child.toolScopeSnapshots) &&
    Boolean(child.waitBarriers);
  const expectedCategoryExported = (category: "lifecycle_edge" | "parent_stop") => {
    const childrenForCategory = expectedChildrenWithTranscripts.filter((child) => child.expected.exportCategory === category);
    return childrenForCategory.length > 0 &&
      childrenForCategory.every((child) =>
        expectedRunExported(child) &&
        expectedTranscriptHasMessages(child) &&
        expectedChildHasBundleFiles(child)
      );
  };
  const parentMailboxBundle = await readZipJson<Record<string, any>>(zip, "child-threads/parent-mailbox-events.json");
  const parentMailboxEvents = Array.isArray(parentMailboxBundle.events)
    ? parentMailboxBundle.events as Array<Record<string, any>>
    : [];
  const approvalParentMailboxEvent = parentMailboxEvents.find((event) => event.id === input.approvalParentMailboxEventId) ??
    parentMailboxEvents.find((event) => {
      const payload = objectRecord(event.payload);
      return event.type === "subagent.child_approval_requested" && payload.approvalId === input.approvalId;
    });
  const approvalForwardedParentMailboxEvent = parentMailboxEvents.find((event) => {
    const payload = objectRecord(event.payload);
    return event.type === "subagent.child_approval_forwarded" && payload.approvalId === input.approvalId;
  });
  const approvalPayload = objectRecord(approvalParentMailboxEvent?.payload);
  const approvalForwardedPayload = objectRecord(approvalForwardedParentMailboxEvent?.payload);
  const approvalParentBlockingState = objectRecord(approvalPayload.parentBlockingState);
  const approvalForwardedParentBlockingState = objectRecord(approvalForwardedPayload.parentBlockingState);
  const approvalWaitBarrier = objectRecord(approvalPayload.waitBarrier);
  const approvalAuthorityContract = {
    requestExported: Boolean(approvalParentMailboxEvent),
    forwardedExported: Boolean(approvalForwardedParentMailboxEvent),
    eventIdMatches: approvalParentMailboxEvent?.id === input.approvalParentMailboxEventId,
    schemaMatches: approvalPayload.schemaVersion === "ambient-subagent-approval-bridge-v1",
    childIdentityMatches:
      approvalPayload.childRunId === input.approvalChildRunId &&
      approvalPayload.childThreadId === input.approvalChildThreadId &&
      approvalPayload.canonicalTaskPath === input.approvalCanonicalTaskPath &&
      approvalForwardedPayload.childRunId === input.approvalChildRunId &&
      approvalForwardedPayload.childThreadId === input.approvalChildThreadId &&
      approvalForwardedPayload.canonicalTaskPath === input.approvalCanonicalTaskPath,
    requestedToolMatches:
      approvalPayload.requestedToolId === input.approvalRequestedToolId &&
      approvalPayload.requestedAction === input.approvalRequestedAction &&
      approvalPayload.requestedToolCategory === "workspace.write",
    requestedScopeThisAction: approvalPayload.requestedScope === "this_action",
    requestEffectiveScopeNarrow: approvalPayload.effectiveScope === "this_action",
    forwardedEffectiveScopeChildThread:
      approvalForwardedPayload.decision === "approved" &&
      approvalForwardedPayload.effectiveScope === "this_child_thread",
    parentBlockingResumeMatches:
      approvalParentBlockingState.action === "forward_child_approval_then_wait" &&
      approvalParentBlockingState.resumeAction === "wait_agent" &&
      approvalParentBlockingState.resumeParentBlocking === true &&
      approvalParentBlockingState.childRunId === input.approvalChildRunId &&
      approvalParentBlockingState.childThreadId === input.approvalChildThreadId &&
      approvalParentBlockingState.waitBarrierId === input.approvalWaitBarrierId,
    forwardedParentBlockingResumeMatches:
      approvalForwardedParentBlockingState.action === "forward_child_approval_then_wait" &&
      approvalForwardedParentBlockingState.resumeAction === "wait_agent" &&
      approvalForwardedParentBlockingState.resumeParentBlocking === true &&
      approvalForwardedParentBlockingState.childRunId === input.approvalChildRunId &&
      approvalForwardedParentBlockingState.childThreadId === input.approvalChildThreadId &&
      approvalForwardedParentBlockingState.waitBarrierId === input.approvalWaitBarrierId,
    waitBarrierMatches:
      approvalPayload.waitBarrierId === input.approvalWaitBarrierId &&
      approvalWaitBarrier.id === input.approvalWaitBarrierId,
    instructionPreservesBlocking: typeof approvalPayload.instruction === "string" &&
      approvalPayload.instruction.includes("return the parent to waiting on this child"),
  };
  const callableWorkflowTasks = await readZipText(zip, "child-threads/callable-workflow-tasks.json");
  const patternGraphs = await readZipText(zip, "child-threads/pattern-graphs.json");
  const evidenceSummary = await readZipJson<Record<string, any>>(zip, "child-threads/evidence-summary.json");
  const evidenceChildren = Array.isArray(evidenceSummary.children) ? evidenceSummary.children as Array<Record<string, any>> : [];
  const evidenceChildByRunId = new Map(evidenceChildren.map((child) => [child.runId, child]));
  const approvalEvidenceChild = objectRecord(evidenceChildByRunId.get(input.approvalChildRunId));
  const approvalEvidenceApprovals = objectRecord(approvalEvidenceChild.approvals);
  const approvalEvidenceAuthority = objectRecord(approvalEvidenceChild.authority);
  const approvalEvidenceLatestToolScope = objectRecord(approvalEvidenceAuthority.latestToolScopeSnapshot);
  const approvalEvidenceDisplay = objectRecord(approvalEvidenceLatestToolScope.displayMetadata);
  const manifestExport = manifest.export && typeof manifest.export === "object" ? manifest.export as Record<string, any> : {};
  const includedFiles = Array.isArray(manifestExport.includedFiles) ? manifestExport.includedFiles as string[] : [];

  return {
    apiReturnedPath: result?.path === input.exportPath,
    apiSource: result?.source,
    apiFallbackReason: result?.fallbackReason,
    zipWritten: archive.byteLength > 0,
    zipBytes: archive.byteLength,
    resultBytesMatchZip: result?.bytes === archive.byteLength,
    manifestIncludesChildThreads:
      Number(manifestExport.childThreadCount) >= input.expectedChildRuns.length &&
      includedFiles.includes("child-threads/index.json"),
    childEvidenceSummaryIncluded:
      Number(evidenceSummary.childThreadCount) >= input.expectedChildRuns.length &&
      includedFiles.includes("child-threads/evidence-summary.json"),
    childEvidenceSummaryCoversExpectedRuns: input.expectedChildRuns.every((expected) =>
      evidenceChildByRunId.get(expected.runId)?.childThreadId === expected.threadId
    ),
    childEvidenceSummaryLinksTranscripts: input.expectedChildRuns.every((expected) => {
      const child = objectRecord(evidenceChildByRunId.get(expected.runId));
      const files = objectRecord(child.files);
      return typeof files.visibleTranscriptMarkdown === "string" &&
        typeof files.visibleTranscriptJson === "string" &&
        typeof files.fullTranscriptMarkdown === "string" &&
        typeof files.fullTranscriptJson === "string" &&
        typeof files.toolScopeSnapshots === "string";
    }),
    childEvidenceSummaryAuthorityIncluded:
      Number(approvalEvidenceAuthority.toolScopeSnapshotCount) > 0 &&
      Array.isArray(approvalEvidenceLatestToolScope.piVisibleCategories) &&
      Array.isArray(approvalEvidenceDisplay.deniedToolIds),
    childEvidenceSummaryApprovalBridgeIncluded:
      Number(approvalEvidenceApprovals.parentApprovalBridgeEventCount) > 0 &&
      Array.isArray(approvalEvidenceApprovals.parentApprovalBridgeEventIds) &&
      approvalEvidenceApprovals.parentApprovalBridgeEventIds.includes(approvalParentMailboxEvent?.id),
    childEvidenceSummaryPatternLinksIncluded: graphLinkedExpectedChildren.length > 0 &&
      graphLinkedExpectedChildren.every((expected) => {
        const child = objectRecord(evidenceChildByRunId.get(expected.runId));
        const links = Array.isArray(child.patternGraphLinks) ? child.patternGraphLinks as Array<Record<string, any>> : [];
        return links.some((link) => link.childRunId === expected.runId && link.transcriptPath?.includes("visible-transcript.md"));
      }),
    childEvidenceSummaryResultArtifactsIncluded: evidenceChildren.some((child) => objectRecord(child.resultArtifact).present === true),
    childEvidenceSummaryGapsBounded: evidenceChildren.every((child) => Array.isArray(child.evidenceGaps)),
    indexContainsExpectedChildren: expectedChildrenWithTranscripts.every((child) =>
      expectedRunExported(child)
    ),
    childTranscriptsContainExpectedMessages: expectedChildrenWithTranscripts.every((child) =>
      expectedTranscriptHasMessages(child)
    ),
    lifecycleEdgeChildrenExported: expectedCategoryExported("lifecycle_edge"),
    parentStopCascadeChildrenExported: expectedCategoryExported("parent_stop"),
    childFullTranscriptsIncluded: expectedChildrenWithTranscripts.every(({ fullTranscript, fullTranscriptJson }) =>
      Boolean(fullTranscript) && Boolean(fullTranscriptJson)
    ),
    childRunEventsIncluded: expectedChildrenWithTranscripts.every(({ runEvents }) => Boolean(runEvents)),
    childToolScopeSnapshotsIncluded: expectedChildrenWithTranscripts.every(({ toolScopeSnapshots }) => Boolean(toolScopeSnapshots)),
    childWaitBarriersIncluded: expectedChildrenWithTranscripts.every(({ waitBarriers }) => Boolean(waitBarriers)),
    parentMailboxIncluded: approvalAuthorityContract.requestExported && approvalAuthorityContract.schemaMatches,
    approvalAuthorityContract,
    callableWorkflowTasksIncluded: callableWorkflowTasks.includes(input.workflowTaskId),
    patternGraphLinksIncluded: graphLinkedExpectedChildren.length > 0 && graphLinkedExpectedChildren.every((expected) =>
      patternGraphs.includes(expected.runId) &&
      patternGraphs.includes(expected.threadId) &&
      patternGraphs.includes("visible-transcript.md")
    ),
    childPiSessionStatusRecorded: expectedChildrenWithTranscripts.every(({ child }) =>
      child?.piSession && typeof child.piSession === "object" &&
      typeof child.piSession.originalPiSessionFileExists === "boolean"
    ),
    exportedChildRunIds: expectedChildren.map(({ expected }) => expected.runId),
  };
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) return "";
  return file.async("string");
}

async function readZipJson<T>(zip: JSZip, path: string): Promise<T> {
  const text = await readZipText(zip, path);
  if (!text) throw new Error(`Missing ${path} in Desktop chat export.`);
  return JSON.parse(text) as T;
}

function buildDesktopVisualAssertions(input: {
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
    parent_child_placement: visualAssertion("parent_child_placement", [
      ["primary child cluster rendered with stress clusters", collapsed.clusterCount === expectedClusterCount],
      ["primary child cluster follows the spawning parent message", collapsed.clusterAfterParentMessage === true],
      ["primary child cluster is vertically below the parent message", collapsed.clusterBelowParentMessage === true],
      ["stress clusters follow their spawning parent messages", multiClusterStress.stressClustersAfterParentMessages === true],
      ["expanded child transcript stays attached below its child row", childTranscript.summaryNotObscuringTranscript === true],
      ["expanded child transcript end marker clears the composer", childTranscript.transcriptEndClearsComposer === true],
      ["expanded child transcript uses live shell and stream lane", childTranscript.liveTranscriptShellVisible === true && childTranscript.liveTranscriptStreamVisible === true],
      ["completed child transcript stays attached below its child row", completedChildTranscript.summaryNotObscuringTranscript === true],
      ["completed child transcript end cap clears the composer", completedChildTranscript.transcriptEndClearsComposer === true],
      ["completed child terminal summary follows the transcript", completedChildTranscript.completionEndCapAfterMessages === true],
      ["pattern graph child click-through opens the attached transcript", patternGraphClickThrough.summaryNotObscuringTranscript === true],
      ["pattern graph child click-through clears the composer", patternGraphClickThrough.transcriptEndClearsComposer === true],
      ["pattern graph completed child click-through opens the attached transcript", patternGraphCompletedClickThrough.summaryNotObscuringTranscript === true],
      ["pattern graph completed child click-through clears the composer", patternGraphCompletedClickThrough.transcriptEndClearsComposer === true],
      ["pattern graph keyboard activation opens the attached transcript", patternGraphKeyboardActivation.summaryNotObscuringTranscript === true],
      ["pattern graph keyboard activation clears the composer", patternGraphKeyboardActivation.transcriptEndClearsComposer === true],
      ["timed-out lifecycle child transcript stays attached below its child row", lifecycleTimeoutChildTranscript.summaryNotObscuringTranscript === true],
      ["partial lifecycle child transcript stays attached below its child row", lifecyclePartialChildTranscript.summaryNotObscuringTranscript === true],
      ["terminal lifecycle child transcripts clear the composer", lifecycleTimeoutChildTranscript.transcriptEndClearsComposer === true && lifecyclePartialChildTranscript.transcriptEndClearsComposer === true],
      ["parent-stop required child transcript stays attached below its child row", parentStopRequiredChildTranscript.summaryNotObscuringTranscript === true],
      ["parent-stop background child transcript stays attached below its child row", parentStopBackgroundChildTranscript.summaryNotObscuringTranscript === true],
      ["parent-stop completed child transcript stays attached below its child row", parentStopCompletedChildTranscript.summaryNotObscuringTranscript === true],
      ["parent-stop child transcripts clear the composer", parentStopRequiredChildTranscript.transcriptEndClearsComposer === true && parentStopBackgroundChildTranscript.transcriptEndClearsComposer === true && parentStopCompletedChildTranscript.transcriptEndClearsComposer === true],
      ["pattern graph overflow expansion reveals grouped children", patternGraphOverflowExpansion.panelVisible === true && patternGraphOverflowExpansion.groupedChildVisible === true],
      ["child inspector shows persisted effective role snapshot", effectiveRoleSnapshot.effectiveRoleVisible === true && effectiveRoleSnapshot.overlaysVisible === true],
      ["parent and child thread ids are captured in the report", Boolean(input.seeded?.parentThreadId && input.seeded.childThreadIds.length)],
    ], [
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
    ]),
    default_collapsed_state: visualAssertion("default_collapsed_state", [
      ["new child cluster is collapsed before interaction", collapsed.defaultCollapsed === true],
      ["stress clusters are collapsed before interaction", multiClusterStress.allClustersDefaultCollapsed === true],
      ["collapsed summary names sub-agent threads", labelVisible(collapsed, "Sub-agent threads")],
      ["collapsed summary names child count", labelVisible(collapsed, "2 children")],
      ["stress summaries name their child counts", multiClusterStress.stressSummariesVisible === true],
      ["expanded state opens without losing the cluster set", expanded.defaultCollapsed === false && expanded.clusterCount === expectedClusterCount],
      ["child transcript expands only after explicit child disclosure interaction", childTranscript.childExpanded === true],
      ["completed child transcript expands only after explicit child disclosure interaction", completedChildTranscript.childExpanded === true],
    ], [
      input.artifacts.collapsedDesktopScreenshot,
      input.artifacts.expandedDesktopScreenshot,
      input.artifacts.childTranscriptExpandedDesktopScreenshot,
      input.artifacts.completedChildTranscriptDesktopScreenshot,
      input.artifacts.multiClusterStressDesktopScreenshot,
    ]),
    inline_child_mini_thread_chrome: visualAssertion("inline_child_mini_thread_chrome", [
      ["running child transcript renders a child-thread header", childTranscript.miniThreadHeaderVisible === true],
      ["running child child-thread header names the child", childTranscript.miniThreadHeaderNamesChild === true],
      ["running child exposes an Open full thread action", childTranscript.openFullThreadActionVisible === true && childTranscript.openFullThreadActionNamesChild === true],
      ["running child shows live child run mode", childTranscript.liveTranscriptModeLabelVisible === true],
      ["running child shows parent-style live activity", childTranscript.liveChildActivityVisible === true && childTranscript.liveChildActivityUsesParentChrome === true && childTranscript.liveChildActivityHasLines === true],
      ["running child activity count matches transcript data", childTranscript.liveTranscriptActivityCountVisible === true && childTranscript.liveChildActivityCountMatchesShell === true],
      ["running child renders parent-style tool cards", childTranscript.toolCardVisible === true && childTranscript.toolCardUsesParentChrome === true && childTranscript.childRendererUsesToolCards === true],
      ["running child tool-card count matches transcript data", childTranscript.liveTranscriptToolCardCountVisible === true && childTranscript.toolCardCountMatchesData === true],
      ["running child renders a runtime timeline title and count", childTranscript.runtimeTimelineVisible === true && childTranscript.runtimeTimelineCountVisible === true],
      ["running child runtime timeline count matches rendered rows", childTranscript.runtimeTimelineRenderedCountMatchesRows === true],
      ["running child renders parent-to-child mailbox timeline", childTranscript.childMailboxTimelineVisible === true && childTranscript.childMailboxTimelineHasParentFollowup === true],
      ["running child mailbox timeline count matches rendered rows", childTranscript.childMailboxTimelineRenderedCountMatchesRows === true],
      ["completed child transcript renders a child-thread header", completedChildTranscript.miniThreadHeaderVisible === true],
      ["completed child child-thread header names the child", completedChildTranscript.miniThreadHeaderNamesChild === true],
      ["completed child exposes an Open full thread action", completedChildTranscript.openFullThreadActionVisible === true && completedChildTranscript.openFullThreadActionNamesChild === true],
      ["completed child shows terminal end-cap mode", completedChildTranscript.liveTranscriptModeLabelVisible === true],
      ["completed child renders a runtime timeline before the end cap", completedChildTranscript.runtimeTimelineVisible === true && completedChildTranscript.runtimeTimelineCountVisible === true],
      ["completed child terminal end cap is labeled as a completion summary", completedChildTranscript.completionEndCapLabelVisible === true],
      ["pattern graph click-through preserves the child-thread header", patternGraphClickThrough.miniThreadHeaderVisible === true && patternGraphClickThrough.miniThreadHeaderNamesChild === true],
      ["pattern graph completed click-through preserves terminal child-thread chrome", patternGraphCompletedClickThrough.miniThreadHeaderVisible === true && patternGraphCompletedClickThrough.completionEndCapLabelVisible === true],
      ["pattern graph keyboard activation preserves the child-thread header", patternGraphKeyboardActivation.miniThreadHeaderVisible === true && patternGraphKeyboardActivation.miniThreadHeaderNamesChild === true],
      ["standalone child thread shows parent blocking banner", standaloneChildThread.parentBarrierVisible === true && standaloneChildThread.parentBarrierLabelVisible === true],
      ["standalone child thread exposes parent navigation", standaloneChildThread.parentOpenActionVisible === true && standaloneChildThread.parentThreadIdVisible === true],
      ["standalone child thread keeps transcript visible", standaloneChildThread.transcriptVisible === true && standaloneChildThread.childAssistantVisible === true],
      ["standalone child thread shows transcript before run details", standaloneChildThread.transcriptPrecedesInspector === true && standaloneChildThread.transcriptVerticallyPrecedesInspector === true],
      ["standalone child run details stay collapsed below transcript", standaloneChildThread.inspectorCollapsedByDefault === true && standaloneChildThread.transcriptInspectorOverlapFree === true],
    ], [
      input.artifacts.childTranscriptExpandedDesktopScreenshot,
      input.artifacts.completedChildTranscriptDesktopScreenshot,
      input.artifacts.patternGraphClickThroughDesktopScreenshot,
      input.artifacts.patternGraphCompletedClickThroughDesktopScreenshot,
      input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
      input.artifacts.standaloneChildThreadDesktopScreenshot,
    ]),
    blocking_attention_indicators: visualAssertion("blocking_attention_indicators", [
      ["collapsed summary shows active blocking work", labelVisible(collapsed, "1 blocking")],
      ["collapsed summary shows workflow blocking work", labelVisible(collapsed, "1 workflow blocked")],
      ["collapsed summary shows attention state", labelVisible(collapsed, "1 attention")],
      ["expanded child row shows approval blocker", labelVisible(expanded, "Blocking: approval")],
      ["expanded workflow row shows workflow blocker", labelVisible(expanded, "Blocking: workflow work")],
      ["parent wait row stays visible", labelVisible(expanded, "Waiting on child")],
      ["warning tone is present for attention/blocking state", Number(expanded.warningToneCount) > 0],
    ], [
      input.artifacts.collapsedDesktopScreenshot,
      input.artifacts.expandedDesktopScreenshot,
      input.artifacts.workflowExecutionDesktopScreenshot,
    ]),
    approval_runtime_ownership_labels: visualAssertion("approval_runtime_ownership_labels", [
      ["approval prompt identifies the child", approvalFlow.childIdentifierVisible === true],
      ["pattern graph approval badge opens the parent approval dialog", patternGraphApprovalBadgeDialog.dialogOpened === true],
      ["pattern graph approval dialog preserves child identity", patternGraphApprovalBadgeDialog.dialogNamesChildRun === true && patternGraphApprovalBadgeDialog.dialogNamesChildThread === true],
      ["approval prompt shows requested tool scope", approvalFlow.toolScopeVisible === true],
      ["approval forwarding keeps child attribution", approvalForwarding.forwardedNamesChild === true],
      ["approval forwarding names the same child run/thread/path as the request", approvalForwarding.forwardedAndRequestSameChild === true],
      ["post-forwarding child row still points at the approval child", approvalForwarding.childRowDataMatchesApprovalChild === true],
      ["approval forwarding shows child-thread scoped persistence", approvalForwarding.childScopedPersistenceVisible === true],
      ["approval forwarding shows parent resumes waiting", approvalForwarding.parentResumeAfterApprovalVisible === true],
      ["runtime catalog names the owning sub-agent", localRuntimeOwnership.ownerLabelVisible === true],
      ["ordinary Stop is disabled while the child owns the runtime", localRuntimeOwnership.stopDisabledVisible === true],
      ["forced runtime action consequence is visible", localRuntimeOwnership.forceConsequenceVisible === true],
      ["affected sub-agent is listed in runtime ownership UI", localRuntimeOwnership.affectedSubagentVisible === true],
      ["untracked runtime is visible in the local model catalog", localRuntimeOwnership.untrackedRuntimeVisible === true],
      ["untracked runtime has disabled ordinary controls", localRuntimeOwnership.untrackedStopDisabledVisible === true && localRuntimeOwnership.untrackedRestartDisabledVisible === true],
      ["untracked runtime force termination is unavailable", localRuntimeOwnership.untrackedForceUnavailableVisible === true],
    ], [
      input.artifacts.approvalDialogScreenshot,
      input.artifacts.patternGraphApprovalBadgeDialogScreenshot,
      input.artifacts.approvalForwardingDesktopScreenshot,
      input.artifacts.localRuntimeOwnershipDesktopScreenshot,
    ]),
    denied_scope_explanations: visualAssertion("denied_scope_explanations", [
      ["denied child scope mailbox row is visible", deniedScopeExplanation.spawnFailureVisible === true],
      ["approval-unavailable reason is visible", deniedScopeExplanation.approvalUnavailableVisible === true],
      ["denied connector category is visible", deniedScopeExplanation.deniedCategoryVisible === true],
      ["denied connector tool is visible", deniedScopeExplanation.deniedToolVisible === true],
      ["denied child identity is visible", deniedScopeExplanation.sourceChildVisible === true],
      ["denied non-interactive launch exposes no approval actions", deniedScopeExplanation.noInteractiveApprovalActions === true],
    ], [
      input.artifacts.deniedScopeExplanationDesktopScreenshot,
      input.artifacts.expandedDesktopScreenshot,
    ]),
    mutating_worker_evidence: visualAssertion("mutating_worker_evidence", [
      ["mutating workflow task id is captured in the seed", Boolean(input.seeded?.mutatingWorkflowTaskId)],
      ["mutating workflow artifact id is captured in the seed", Boolean(input.seeded?.mutatingWorkflowArtifactId)],
      ["mutating workflow run id is captured in the seed", Boolean(input.seeded?.mutatingWorkflowRunId)],
      ["mutating workflow is visible in the parent cluster", mutatingWorkerDogfood.taskVisible === true],
      ["mutating workflow succeeded as a background task", mutatingWorkerDogfood.statusSucceededVisible === true && mutatingWorkerDogfood.modeBackgroundVisible === true],
      ["mutating workflow names the child caller", mutatingWorkerDogfood.childCallerVisible === true && mutatingWorkerDogfood.childRunVisible === true],
      ["mutating workflow shows child bridge approval", mutatingWorkerDogfood.approvalBridgeVisible === true],
      ["mutating workflow shows active isolated worktree evidence", mutatingWorkerDogfood.isolatedWorktreeVisible === true],
      ["mutating workflow shows nested fanout grant", mutatingWorkerDogfood.nestedFanoutVisible === true],
      ["mutating workflow shows staged output path", mutatingWorkerDogfood.stagedMutationVisible === true],
      ["mutating workflow shows parent workspace unchanged", mutatingWorkerDogfood.parentWorkspaceUnchangedVisible === true],
      ["mutating workflow shows retained output preview", mutatingWorkerDogfood.outputPreviewRetainedVisible === true],
      ["mutating workflow remains rehydrated after restart", restartRehydration.mutatingWorkflowTaskRehydrated === true],
    ], [
      input.artifacts.mutatingWorkerDogfoodDesktopScreenshot,
      input.artifacts.restartRehydrationDesktopScreenshot,
    ]),
    workflow_high_load: visualAssertion("workflow_high_load", [
      ["high-load workflow task ids are captured in the seed", (input.seeded?.workflowHighLoadTaskIds.length ?? 0) >= 4],
      ["all six Symphony presets are visible in the workflow cluster", workflowHighLoad.allPresetLabelsVisible === true],
      ["high-load workflow task ids are visible", workflowHighLoad.highLoadTaskIdsVisible === true],
      ["high-load workflow artifact ids are visible", workflowHighLoad.highLoadArtifactIdsVisible === true],
      ["high-load workflow run ids are visible", workflowHighLoad.highLoadRunIdsVisible === true],
      ["high-load workflow thread ids are visible", workflowHighLoad.highLoadThreadIdsVisible === true],
      ["high-load workflow rows are completed background tasks", workflowHighLoad.backgroundRowsVisible === true && workflowHighLoad.completedRowsVisible === true],
      ["high-load workflow rows do not expose pause or cancel controls after completion", workflowHighLoad.highLoadRowsHaveNoPauseCancel === true],
      ["high-load workflow rows rehydrate after restart", restartRehydration.workflowHighLoadTasksRehydrated === true],
    ], [
      input.artifacts.workflowHighLoadDesktopScreenshot,
      input.artifacts.restartRehydrationDesktopScreenshot,
    ]),
    pattern_graph_runtime: visualAssertion("pattern_graph_runtime", [
      ["parent thread renders six persisted pattern graphs", patternGraphRuntime.graphCountVisible === true],
      ["all Symphony pattern graph labels are visible", patternGraphRuntime.allPatternGraphsVisible === true],
      ["pattern graph nodes carry workflow task runtime ids", patternGraphRuntime.runtimeTaskBindingsVisible === true],
      ["pattern graph nodes carry workflow run runtime ids", patternGraphRuntime.runtimeRunBindingsVisible === true],
      ["Map-Reduce graph binds to the review child thread", patternGraphRuntime.childBindingVisible === true],
      ["Map-Reduce child node advertises click-through", patternGraphRuntime.childClickThroughAdvertised === true],
      ["Map-Reduce child node advertises keyboard activation", patternGraphRuntime.childKeyboardOpenAdvertised === true],
      ["Map-Reduce child node opens the inline child transcript", patternGraphClickThrough.childExpanded === true && patternGraphClickThrough.transcriptPanelVisible === true],
      ["Map-Reduce child node opens from keyboard activation", patternGraphKeyboardActivation.childExpanded === true && patternGraphKeyboardActivation.transcriptPanelVisible === true],
      ["Map-Reduce approval badge advertises parent approval opening", patternGraphRuntime.approvalBadgeOpenAdvertised === true],
      ["Map-Reduce approval badge opens the parent approval dialog", patternGraphApprovalBadgeDialog.dialogOpened === true && patternGraphApprovalBadgeDialog.dialogNamesApproval === true],
      ["Map-Reduce graph binds to the completed reducer child thread", patternGraphRuntime.completedChildBindingVisible === true],
      ["Map-Reduce reducer node advertises click-through", patternGraphRuntime.completedChildClickThroughAdvertised === true],
      ["Map-Reduce reducer node advertises keyboard activation", patternGraphRuntime.completedChildKeyboardOpenAdvertised === true],
      ["Map-Reduce reducer node opens the terminal child transcript", patternGraphCompletedClickThrough.childExpanded === true && patternGraphCompletedClickThrough.completionEndCapVisible === true],
      ["Map-Reduce overflow node advertises expansion", patternGraphRuntime.overflowNodeVisible === true && patternGraphRuntime.overflowNodeExpandableAdvertised === true],
      ["Map-Reduce overflow expansion reveals grouped child identity", patternGraphOverflowExpansion.panelVisible === true && patternGraphOverflowExpansion.groupedChildIdentityVisible === true],
      ["blocking and approval badges are visible on graph evidence", patternGraphRuntime.blockingBadgeVisible === true && patternGraphRuntime.approvalBadgeVisible === true],
      ["blocking and approval badges are visible on graph nodes", patternGraphRuntime.nodeBlockingBadgeVisible === true && patternGraphRuntime.nodeApprovalBadgeVisible === true],
      ["blocking graph edges expose live runtime status", patternGraphRuntime.blockingEdgeVisible === true],
      ["pattern graphs rehydrate after restart", restartRehydration.patternGraphsRehydrated === true],
      ["pattern graph child binding rehydrates after restart", restartRehydration.patternGraphChildBindingRehydrated === true],
      ["pattern graph runtime bindings rehydrate after restart", restartRehydration.patternGraphRuntimeBindingsRehydrated === true],
    ], [
      input.artifacts.expandedDesktopScreenshot,
      input.artifacts.patternGraphClickThroughDesktopScreenshot,
      input.artifacts.patternGraphCompletedClickThroughDesktopScreenshot,
      input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
      input.artifacts.patternGraphOverflowExpandedDesktopScreenshot,
      input.artifacts.patternGraphApprovalBadgeDialogScreenshot,
      input.artifacts.restartRehydrationDesktopScreenshot,
    ]),
    layout_safety: visualAssertion("layout_safety", [
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
      ["parent-stop required child transcript has no horizontal overflow", parentStopRequiredChildTranscript.horizontalOverflowFree === true],
      ["parent-stop background child transcript has no horizontal overflow", parentStopBackgroundChildTranscript.horizontalOverflowFree === true],
      ["parent-stop completed child transcript has no horizontal overflow", parentStopCompletedChildTranscript.horizontalOverflowFree === true],
      ["restart view has no horizontal overflow", restartRehydration.horizontalOverflowFree === true],
      ["runtime ownership view has no horizontal overflow", localRuntimeOwnership.horizontalOverflowFree === true],
      ["multi-cluster stress view has no horizontal overflow", multiClusterStress.horizontalOverflowFree === true],
      ["multi-cluster stress view has no critical overlap", multiClusterStress.criticalOverlapCount === 0],
      ["mutating worker view has no critical overlap", mutatingWorkerDogfood.criticalOverlapCount === 0],
      ["workflow high-load view has no critical overlap", workflowHighLoad.criticalOverlapCount === 0],
      ["pattern graph view has no critical overlap", patternGraphRuntime.criticalOverlapCount === 0],
      ["pattern graph overflow expansion has no critical overlap", patternGraphOverflowExpansion.criticalOverlapCount === 0],
      ["standalone child thread has no critical overlap", standaloneChildThread.criticalOverlapCount === 0 && standaloneChildThread.transcriptInspectorOverlapFree === true],
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
      ["pattern graph completed child transcript end cap clears composer", patternGraphCompletedClickThrough.transcriptEndClearsComposer === true],
      ["pattern graph keyboard child transcript end marker clears composer", patternGraphKeyboardActivation.transcriptEndClearsComposer === true],
      ["expanded child transcript stream and runtime rail are laid out", childTranscript.liveTranscriptStreamVisible === true && childTranscript.runtimeEventRailVisible === true],
      ["completed child transcript stream and terminal end cap are laid out", completedChildTranscript.liveTranscriptStreamVisible === true && completedChildTranscript.completionEndCapVisible === true],
      ["timed-out child transcript stream and terminal end cap are laid out", lifecycleTimeoutChildTranscript.liveTranscriptStreamVisible === true && lifecycleTimeoutChildTranscript.completionEndCapVisible === true],
      ["partial child transcript stream and terminal end cap are laid out", lifecyclePartialChildTranscript.liveTranscriptStreamVisible === true && lifecyclePartialChildTranscript.completionEndCapVisible === true],
      ["parent-stop required child transcript stream and terminal end cap are laid out", parentStopRequiredChildTranscript.liveTranscriptStreamVisible === true && parentStopRequiredChildTranscript.completionEndCapVisible === true],
      ["parent-stop background child transcript stream and terminal end cap are laid out", parentStopBackgroundChildTranscript.liveTranscriptStreamVisible === true && parentStopBackgroundChildTranscript.completionEndCapVisible === true],
      ["parent-stop completed child transcript stream and terminal end cap are laid out", parentStopCompletedChildTranscript.liveTranscriptStreamVisible === true && parentStopCompletedChildTranscript.completionEndCapVisible === true],
    ], [
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
    ]),
    workflow_artifact_rehydration: visualAssertion("workflow_artifact_rehydration", [
      ["workflow artifact source path is captured in the seed", Boolean(input.seeded?.workflowArtifactSourceRelativePath)],
      ["workflow artifact state path is captured in the seed", Boolean(input.seeded?.workflowArtifactStateRelativePath)],
      ["workflow artifact source content is captured in the seed", input.seeded?.workflowArtifactSourceContent === SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT],
      ["rehydrated workflow Program panel is selected", workflowArtifactRehydration.sourcePanelSelected === true],
      ["rehydrated workflow source path is visible", workflowArtifactRehydration.sourcePathVisible === true],
      ["rehydrated workflow state path is visible", workflowArtifactRehydration.statePathVisible === true],
      ["rehydrated workflow program body is visible", workflowArtifactRehydration.sourceContentVisible === true],
      ["workflow detail source content matches expected content", workflowArtifactRehydration.sourceContentMatchesExpected === true],
      ["workflow detail reports no source read error", workflowArtifactRehydration.noSourceReadError === true],
      ["workflow artifact rehydration view has no critical overlap", workflowArtifactRehydration.criticalOverlapCount === 0],
    ], [
      input.artifacts.workflowRehydratedNavigationDesktopScreenshot,
      input.artifacts.workflowArtifactRehydrationDesktopScreenshot,
    ]),
    workflow_task_continuity: visualAssertion("workflow_task_continuity", [
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
    ], [
      input.artifacts.workflowExecutionDesktopScreenshot,
      input.artifacts.mutatingWorkerDogfoodDesktopScreenshot,
      input.artifacts.workflowHighLoadDesktopScreenshot,
      input.artifacts.restartRehydrationDesktopScreenshot,
      input.artifacts.workflowRehydratedNavigationDesktopScreenshot,
      input.artifacts.workflowArtifactRehydrationDesktopScreenshot,
      input.artifacts.accessibilitySnapshot,
    ]),
    lifecycle_edge_visibility: visualAssertion("lifecycle_edge_visibility", [
      ["lifecycle parent message is visible", lifecycleEdgeVisibility.parentMessageVisible === true],
      ["lifecycle edge cluster is collapsed by default", lifecycleEdgeVisibility.clusterDefaultCollapsedBeforeOpen === true],
      ["lifecycle cluster summary names four child threads", lifecycleEdgeVisibility.summaryVisible === true],
      ["timed-out child remains visible", lifecycleEdgeVisibility.timeoutChildVisible === true],
      ["timeout attention choices remain visible", lifecycleEdgeVisibility.timeoutAttentionVisible === true && lifecycleEdgeVisibility.timeoutChoicesVisible === true],
      ["partial continuation decision is visible", lifecycleEdgeVisibility.partialDecisionVisible === true],
      ["partial summary is visible", lifecycleEdgeVisibility.partialSummaryVisible === true],
      ["timed-out child opens into a terminal transcript", lifecycleTimeoutChildTranscript.childExpanded === true && lifecycleTimeoutChildTranscript.childTranscriptTerminal === true],
      ["timed-out child transcript includes live stream and final status", lifecycleTimeoutChildTranscript.liveTranscriptStreamVisible === true && lifecycleTimeoutChildTranscript.finalStatusEndCapLabelVisible === true],
      ["partial child opens into a terminal transcript", lifecyclePartialChildTranscript.childExpanded === true && lifecyclePartialChildTranscript.childTranscriptTerminal === true],
      ["partial child transcript includes live stream and final status", lifecyclePartialChildTranscript.liveTranscriptStreamVisible === true && lifecyclePartialChildTranscript.finalStatusEndCapLabelVisible === true],
      ["terminal lifecycle transcripts preserve child message bubbles", Number(lifecycleTimeoutChildTranscript.messageBubbleCount) >= 2 && Number(lifecyclePartialChildTranscript.messageBubbleCount) >= 2],
      ["retry child remains visible and parent-blocking", lifecycleEdgeVisibility.retryChildVisible === true],
      ["retry decision and effect are visible", lifecycleEdgeVisibility.retryDecisionVisible === true && lifecycleEdgeVisibility.retryEffectVisible === true],
      ["accepted retry ownership is visible", lifecycleEdgeVisibility.retryAcceptedEffectVisible === true && lifecycleEdgeVisibility.retryMailboxVisible === true],
      ["detached child decision and effect are visible", lifecycleEdgeVisibility.detachDecisionVisible === true && lifecycleEdgeVisibility.detachedEffectVisible === true],
      ["lifecycle child identities are captured", lifecycleEdgeVisibility.edgeIdentityCaptured === true],
      ["lifecycle edge view has no critical overlap", lifecycleEdgeVisibility.criticalOverlapCount === 0],
    ], [
      input.artifacts.lifecycleEdgeVisibilityDesktopScreenshot,
      input.artifacts.lifecycleTimeoutChildTranscriptDesktopScreenshot,
      input.artifacts.lifecyclePartialChildTranscriptDesktopScreenshot,
    ]),
    parent_stop_cascade_visibility: visualAssertion("parent_stop_cascade_visibility", [
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
      ["required parent-stop child opens into a cancelled terminal transcript", parentStopRequiredChildTranscript.childExpanded === true && parentStopRequiredChildTranscript.childTranscriptTerminal === true && parentStopRequiredChildTranscript.finalStatusEndCapLabelVisible === true],
      ["background parent-stop child opens into a detached terminal transcript", parentStopBackgroundChildTranscript.childExpanded === true && parentStopBackgroundChildTranscript.childTranscriptTerminal === true && parentStopBackgroundChildTranscript.finalStatusEndCapLabelVisible === true],
      ["completed parent-stop child opens into a completion transcript", parentStopCompletedChildTranscript.childExpanded === true && parentStopCompletedChildTranscript.childTranscriptTerminal === true && parentStopCompletedChildTranscript.completionEndCapLabelVisible === true],
      ["parent-stop child transcripts preserve child message bubbles", Number(parentStopRequiredChildTranscript.messageBubbleCount) >= 2 && Number(parentStopBackgroundChildTranscript.messageBubbleCount) >= 2 && Number(parentStopCompletedChildTranscript.messageBubbleCount) >= 2],
      ["parent-stop child transcript layout is unobscured", parentStopRequiredChildTranscript.criticalOverlapCount === 0 && parentStopBackgroundChildTranscript.criticalOverlapCount === 0 && parentStopCompletedChildTranscript.criticalOverlapCount === 0],
      ["parent-stop cascade view has no critical overlap", parentStopCascadeVisibility.criticalOverlapCount === 0],
    ], [
      input.artifacts.parentStopCascadeDesktopScreenshot,
      input.artifacts.parentStopRequiredChildTranscriptDesktopScreenshot,
      input.artifacts.parentStopBackgroundChildTranscriptDesktopScreenshot,
      input.artifacts.parentStopCompletedChildTranscriptDesktopScreenshot,
    ]),
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

function buildDesktopMaturityAssertions(input: {
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
    desktop_child_visibility: maturityAssertion("desktop_child_visibility", [
      "production_ui_visibility",
      "parent_child_placement",
      "default_collapsed_state",
      "inline_child_mini_thread_chrome",
      "inline_child_tool_card_chrome",
      "inline_child_live_transcript_primary",
      "blocking_attention_indicators",
    ], [
      ["parent thread id is captured", Boolean(input.seeded?.parentThreadId)],
      ["child thread ids are captured", Boolean(input.seeded?.childThreadIds.length)],
      ["cluster is default-collapsed before interaction", collapsed.defaultCollapsed === true],
      ["cluster follows the spawning parent message", collapsed.clusterAfterParentMessage === true],
      ["expanded child rows stay inspectable", Number(expanded.childRows) >= 2],
      ["child transcript expands inline under the parent cluster", childTranscript.childExpanded === true && childTranscript.transcriptPanelVisible === true],
      ["child transcript live shell and stream lane are visible", childTranscript.liveTranscriptShellVisible === true && childTranscript.liveTranscriptStreamVisible === true],
      ["child transcript message stream is the primary live surface", childTranscript.transcriptPrimary === true && childTranscript.transcriptStreamLive === true],
      ["child transcript uses real child messages", childTranscript.userMessageVisible === true && childTranscript.assistantMessageVisible === true],
      ["child transcript count matches visible message bubbles", childTranscript.liveTranscriptMessageCountMatchesBubbles === true],
      ["child transcript shows live activity with parent-style chrome", childTranscript.liveChildActivityVisible === true && childTranscript.liveChildActivityUsesParentChrome === true && childTranscript.liveChildActivityHasLines === true],
      ["child transcript activity count matches shell metadata", childTranscript.liveTranscriptActivityCountVisible === true && childTranscript.liveChildActivityCountMatchesShell === true],
      ["child transcript renders parent-style tool cards", childTranscript.toolCardVisible === true && childTranscript.toolCardUsesParentChrome === true && childTranscript.toolCardResultVisible === true],
      ["child transcript tool-card count matches shell metadata", childTranscript.toolCardCountMatchesData === true && childTranscript.childRendererUsesToolCards === true],
      ["child transcript runtime rail shows recent child events", childTranscript.runtimeEventRailVisible === true && childTranscript.runtimeEventRailHasRecentEvents === true],
      ["child transcript runtime and mailbox rails stay open while live", childTranscript.runtimeEventsOpen === true && childTranscript.mailboxEventsOpen === true],
      ["child transcript mailbox rail shows parent follow-up work", childTranscript.childMailboxTimelineVisible === true && childTranscript.childMailboxTimelineHasParentFollowup === true],
      ["child transcript keeps sibling output isolated", childTranscript.siblingSummaryNotLeakedIntoTranscript === true],
      ["child transcript end state matches run phase", childTranscript.transcriptEndStateCorrect === true],
      ["child transcript end marker clears the composer", childTranscript.transcriptEndClearsComposer === true],
      ["live child transcript defers final summary until terminal", childTranscript.completionSummaryDeferredWhileLive === true],
      ["completed child transcript shows terminal end cap after transcript", completedChildTranscript.childTranscriptTerminal === true && completedChildTranscript.completionEndCapAfterMessages === true],
      ["completed child transcript is inspectable without live stream status", completedChildTranscript.transcriptPrimary === true && completedChildTranscript.transcriptStreamLive === false],
      ["completed child transcript end cap clears the composer", completedChildTranscript.transcriptEndClearsComposer === true],
      ["completed child transcript uses real child messages", completedChildTranscript.assistantMessageVisible === true && completedChildTranscript.liveTranscriptMessageCountMatchesBubbles === true],
      ["standalone child thread keeps parent wait context visible", standaloneChildThread.parentBarrierVisible === true && standaloneChildThread.parentBarrierDetailVisible === true],
      ["standalone child thread can navigate back to parent", standaloneChildThread.parentOpenActionVisible === true && standaloneChildThread.parentThreadIdVisible === true],
      ["standalone child thread keeps child transcript visible", standaloneChildThread.transcriptVisible === true && standaloneChildThread.siblingSummaryNotLeaked === true],
      ["standalone child thread is transcript-first with collapsed run details", standaloneChildThread.transcriptPrecedesInspector === true && standaloneChildThread.inspectorCollapsedByDefault === true],
      ["standalone child thread transcript is not overlapped by run details", standaloneChildThread.transcriptVerticallyPrecedesInspector === true && standaloneChildThread.transcriptInspectorOverlapFree === true],
      ["pattern graph keyboard activation opens a child transcript", patternGraphKeyboardActivation.childExpanded === true && patternGraphKeyboardActivation.transcriptPanelVisible === true],
      ["inline child mini-thread chrome visual assertion passed", visualAssertions.inline_child_mini_thread_chrome.status === "passed"],
      ["child inspector shows persisted effective role snapshot", effectiveRoleSnapshot.effectiveRoleVisible === true && effectiveRoleSnapshot.outputContractVisible === true],
      ["blocking and attention labels are visible", labelVisible(collapsed, "1 blocking") && labelVisible(collapsed, "1 attention")],
    ], [
      input.artifacts.collapsedDesktopScreenshot,
      input.artifacts.expandedDesktopScreenshot,
      input.artifacts.childTranscriptExpandedDesktopScreenshot,
      input.artifacts.completedChildTranscriptDesktopScreenshot,
      input.artifacts.patternGraphClickThroughDesktopScreenshot,
      input.artifacts.patternGraphCompletedClickThroughDesktopScreenshot,
      input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
      input.artifacts.standaloneChildThreadDesktopScreenshot,
      input.artifacts.effectiveRoleSnapshotDesktopScreenshot,
    ]),
    desktop_approval_forwarding: maturityAssertion("desktop_approval_forwarding", [
      "approval_parent_blocking",
      "approval_forwarding_behavior",
      "child_scoped_approval",
    ], [
      ["approval id is captured", Boolean(input.seeded?.approvalId)],
      ["approval request parent mailbox event is captured", Boolean(input.seeded?.approvalRequestParentMailboxEventId)],
      ["approval prompt identifies the child", approvalFlow.childIdentifierVisible === true],
      ["pattern graph approval badge opens the same parent approval surface", patternGraphApprovalBadgeDialog.dialogOpened === true],
      ["pattern graph approval badge preserves child identity", patternGraphApprovalBadgeDialog.dialogNamesChildRun === true && patternGraphApprovalBadgeDialog.dialogNamesChildThread === true],
      ["approval buttons name the child", approvalFlow.approvalButtonsNameChild === true],
      ["forwarded decision remains attributed to the child", approvalForwarding.forwardedNamesChild === true],
      ["forwarded and original approval request name the same child", approvalForwarding.forwardedAndRequestSameChild === true],
      ["child row data still points to the approved child", approvalForwarding.childRowDataMatchesApprovalChild === true],
      ["forwarded decision shows child-thread scoped persistence", approvalForwarding.childScopedPersistenceVisible === true],
      ["forwarded decision shows parent returns to blocking on child", approvalForwarding.parentResumeAfterApprovalVisible === true],
      ["parent remains blocked after forwarding", approvalForwarding.parentStillBlockedAfterForward === true],
      ["same child remains blocked after forwarding", approvalForwarding.childRowStillBlocksApprovalChild === true],
      ["child returns to needs-steering after approval forwarding", approvalForwarding.childReturnedToNeedsSteering === true],
      ["exported approval request preserves child identity", approvalAuthorityContract.requestExported === true && approvalAuthorityContract.childIdentityMatches === true],
      ["exported approval request preserves tool/action and wait barrier", approvalAuthorityContract.requestedToolMatches === true && approvalAuthorityContract.waitBarrierMatches === true],
      ["exported approval request tells parent to resume waiting", approvalAuthorityContract.parentBlockingResumeMatches === true],
      ["exported forwarded grant is scoped to this child thread", approvalAuthorityContract.forwardedExported === true && approvalAuthorityContract.forwardedEffectiveScopeChildThread === true],
      ["exported forwarded grant tells parent to resume waiting", approvalAuthorityContract.forwardedParentBlockingResumeMatches === true],
    ], [
      input.artifacts.approvalDialogScreenshot,
      input.artifacts.patternGraphApprovalBadgeDialogScreenshot,
      input.artifacts.approvalForwardingDesktopScreenshot,
      input.artifacts.chatExportZip,
    ]),
    desktop_denied_scope_explanations: maturityAssertion("desktop_denied_scope_explanations", [
      "tool_scope_denial_visibility",
      "approval_unavailable_visibility",
      "parent_mailbox_denial_explanation",
    ], [
      ["denied-scope parent mailbox event is captured", Boolean(input.seeded?.deniedScopeParentMailboxEventId)],
      ["denied child run id is captured", Boolean(input.seeded?.deniedScopeChildRunId)],
      ["denied child thread id is captured", Boolean(input.seeded?.deniedScopeChildThreadId)],
      ["denied connector category is visible", deniedScopeExplanation.deniedCategoryVisible === true],
      ["denied connector tool is visible", deniedScopeExplanation.deniedToolVisible === true],
      ["approval-unavailable explanation is visible", deniedScopeExplanation.approvalUnavailableVisible === true],
      ["denied child source remains attributed", deniedScopeExplanation.sourceChildVisible === true],
      ["non-interactive denied launch has no approval actions", deniedScopeExplanation.noInteractiveApprovalActions === true],
    ], [
      input.artifacts.deniedScopeExplanationDesktopScreenshot,
      input.artifacts.expandedDesktopScreenshot,
    ]),
    desktop_workflow_execution: maturityAssertion("desktop_workflow_execution", [
      "workflow_execution_parent_blocking",
      "workflow_task_continuity",
      "parent_blocking_workflow",
    ], [
      ["workflow task id is captured", Boolean(input.seeded?.workflowTaskId)],
      ["workflow run id is captured", Boolean(input.seeded?.workflowRunId)],
      ["workflow thread id is captured", Boolean(input.seeded?.workflowThreadId)],
      ["workflow section is visible", workflowExecution.workflowSectionVisible === true],
      ["workflow task row is visible", workflowExecution.taskVisible === true],
      ["workflow parent blocker remains visible", workflowExecution.parentBlockerVisible === true],
      ["workflow artifact id is visible", workflowExecution.artifactIdVisible === true],
    ], [
      input.artifacts.workflowExecutionDesktopScreenshot,
      input.artifacts.accessibilitySnapshot,
    ]),
    desktop_mutating_worker_dogfood: maturityAssertion("desktop_mutating_worker_dogfood", [
      "mutating_worker_dogfood_behavior",
      "child_scoped_approval",
      "isolated_child_worktree",
      "parent_workspace_unchanged",
    ], [
      ["mutating worker task id is captured", Boolean(input.seeded?.mutatingWorkflowTaskId)],
      ["mutating worker artifact id is captured", Boolean(input.seeded?.mutatingWorkflowArtifactId)],
      ["mutating worker run id is captured", Boolean(input.seeded?.mutatingWorkflowRunId)],
      ["mutating worker child run id is captured", Boolean(input.seeded?.mutatingWorkflowChildRunId)],
      ["mutating worker child thread id is captured", Boolean(input.seeded?.mutatingWorkflowChildThreadId)],
      ["mutating worker staged path is captured", Boolean(input.seeded?.mutatingWorkflowStagedRelativePath)],
      ["mutating worker report path is captured", Boolean(input.seeded?.mutatingWorkflowReportRelativePath)],
      ["mutating worker progress message matches the seeded proof", input.seeded?.mutatingWorkflowProgressMessage === SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE],
      ["parent workspace unchanged proof is true", input.seeded?.mutatingWorkflowParentWorkspaceUnchanged === true],
      ["mutating worker row is visible", mutatingWorkerDogfood.taskVisible === true],
      ["mutating worker row shows child caller", mutatingWorkerDogfood.childCallerVisible === true],
      ["mutating worker row shows child bridge approval", mutatingWorkerDogfood.approvalBridgeVisible === true],
      ["mutating worker row shows isolated worktree", mutatingWorkerDogfood.isolatedWorktreeVisible === true],
      ["mutating worker row shows staged output", mutatingWorkerDogfood.stagedMutationVisible === true],
      ["mutating worker row shows parent workspace unchanged", mutatingWorkerDogfood.parentWorkspaceUnchangedVisible === true],
      ["mutating worker row rehydrates after restart", restartRehydration.mutatingWorkflowTaskRehydrated === true],
    ], [
      input.artifacts.mutatingWorkerDogfoodDesktopScreenshot,
      input.artifacts.restartRehydrationDesktopScreenshot,
    ]),
    desktop_workflow_high_load: maturityAssertion("desktop_workflow_high_load", [
      "workflow_high_load_dogfood",
      "symphony_six_patterns",
      "workflow_task_continuity",
      "layout_safety",
    ], [
      ["high-load workflow task ids are captured", (input.seeded?.workflowHighLoadTaskIds.length ?? 0) >= 4],
      ["high-load workflow artifact ids are captured", (input.seeded?.workflowHighLoadArtifactIds.length ?? 0) >= 4],
      ["high-load workflow run ids are captured", (input.seeded?.workflowHighLoadRunIds.length ?? 0) >= 4],
      ["all expected Symphony pattern labels are captured", input.seeded?.workflowHighLoadPatternLabels.join("|") === [...SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS].join("|")],
      ["workflow section contains at least six rows", Number(workflowHighLoad.workflowRowCount) >= 6],
      ["all six Symphony presets are visible", workflowHighLoad.allPresetLabelsVisible === true],
      ["high-load workflow ids are visible", workflowHighLoad.highLoadTaskIdsVisible === true && workflowHighLoad.highLoadArtifactIdsVisible === true],
      ["high-load workflow run and thread ids are visible", workflowHighLoad.highLoadRunIdsVisible === true && workflowHighLoad.highLoadThreadIdsVisible === true],
      ["high-load rows are completed background tasks", workflowHighLoad.completedRowsVisible === true && workflowHighLoad.backgroundRowsVisible === true],
      ["high-load rows rehydrate after restart", restartRehydration.workflowHighLoadTasksRehydrated === true],
    ], [
      input.artifacts.workflowHighLoadDesktopScreenshot,
      input.artifacts.restartRehydrationDesktopScreenshot,
    ]),
    desktop_pattern_graph_runtime: maturityAssertion("desktop_pattern_graph_runtime", [
      "pattern_graph_snapshot_persistence",
      "symphony_six_pattern_renderer",
      "child_thread_click_through",
      "child_thread_keyboard_activation",
      "child_approval_badge_dialog",
      "fanout_overflow_expansion",
      "restart_rehydration",
    ], [
      ["pattern graph renderer has six visible graphs", patternGraphRuntime.graphCountVisible === true],
      ["all six pattern graph labels are visible", patternGraphRuntime.allPatternGraphsVisible === true],
      ["graph nodes carry workflow task ids", patternGraphRuntime.runtimeTaskBindingsVisible === true],
      ["graph nodes carry workflow run ids", patternGraphRuntime.runtimeRunBindingsVisible === true],
      ["Map-Reduce graph binds to the approval child run", patternGraphRuntime.childBindingVisible === true],
      ["Map-Reduce graph advertises child click-through", patternGraphRuntime.childClickThroughAdvertised === true],
      ["Map-Reduce graph advertises keyboard activation", patternGraphRuntime.childKeyboardOpenAdvertised === true],
      ["Map-Reduce graph click opens the inline child transcript", patternGraphClickThrough.childExpanded === true && patternGraphClickThrough.transcriptPanelVisible === true],
      ["Map-Reduce graph Enter key opens the inline child transcript", patternGraphKeyboardActivation.childExpanded === true && patternGraphKeyboardActivation.transcriptPanelVisible === true],
      ["Map-Reduce graph keyboard activation preserves child-thread chrome", patternGraphKeyboardActivation.miniThreadHeaderVisible === true && patternGraphKeyboardActivation.miniThreadHeaderNamesChild === true],
      ["Map-Reduce approval badge advertises parent approval opening", patternGraphRuntime.approvalBadgeOpenAdvertised === true],
      ["Map-Reduce approval badge opens the parent approval dialog", patternGraphApprovalBadgeDialog.dialogOpened === true && patternGraphApprovalBadgeDialog.dialogNamesApproval === true],
      ["Map-Reduce approval badge dialog preserves child identity", patternGraphApprovalBadgeDialog.dialogNamesChildRun === true && patternGraphApprovalBadgeDialog.dialogNamesChildThread === true],
      ["Map-Reduce graph binds to the completed reducer child run", patternGraphRuntime.completedChildBindingVisible === true],
      ["Map-Reduce reducer graph advertises keyboard activation", patternGraphRuntime.completedChildKeyboardOpenAdvertised === true],
      ["Map-Reduce reducer graph click opens the terminal child transcript", patternGraphCompletedClickThrough.childExpanded === true && patternGraphCompletedClickThrough.completionEndCapVisible === true],
      ["Map-Reduce overflow node advertises expansion", patternGraphRuntime.overflowNodeVisible === true && patternGraphRuntime.overflowNodeExpandableAdvertised === true],
      ["Map-Reduce overflow expansion reveals grouped child identity", patternGraphOverflowExpansion.panelVisible === true && patternGraphOverflowExpansion.groupedChildIdentityVisible === true],
      ["blocking and approval badges are visible", patternGraphRuntime.blockingBadgeVisible === true && patternGraphRuntime.approvalBadgeVisible === true],
      ["blocking and approval badges are node-level UI", patternGraphRuntime.nodeBlockingBadgeVisible === true && patternGraphRuntime.nodeApprovalBadgeVisible === true],
      ["blocking edge status is runtime-visible", patternGraphRuntime.blockingEdgeVisible === true],
      ["graph nodes and bindings rehydrate after restart", restartRehydration.patternGraphsRehydrated === true &&
        restartRehydration.patternGraphChildBindingRehydrated === true &&
        restartRehydration.patternGraphRuntimeBindingsRehydrated === true],
    ], [
      input.artifacts.expandedDesktopScreenshot,
      input.artifacts.patternGraphClickThroughDesktopScreenshot,
      input.artifacts.patternGraphCompletedClickThroughDesktopScreenshot,
      input.artifacts.patternGraphKeyboardActivationDesktopScreenshot,
      input.artifacts.patternGraphOverflowExpandedDesktopScreenshot,
      input.artifacts.patternGraphApprovalBadgeDialogScreenshot,
      input.artifacts.restartRehydrationDesktopScreenshot,
    ]),
    desktop_workflow_artifact_rehydration: maturityAssertion("desktop_workflow_artifact_rehydration", [
      "workflow_artifact_rehydration_behavior",
      "artifact_source_link",
      "artifact_state_link",
    ], [
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
    ], [
      input.artifacts.workflowRehydratedNavigationDesktopScreenshot,
      input.artifacts.workflowArtifactRehydrationDesktopScreenshot,
    ]),
    desktop_restart_rehydration: maturityAssertion("desktop_restart_rehydration", [
      "restart_rehydration_behavior",
      "workflow_task_rehydration",
      "artifact_link",
    ], [
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
    ], [
      input.artifacts.restartRehydrationDesktopScreenshot,
    ]),
    desktop_workflow_rehydrated_navigation: maturityAssertion("desktop_workflow_rehydrated_navigation", [
      "restart_rehydration_behavior",
      "workflow_thread_navigation",
      "artifact_link",
    ], [
      ["workflow thread id is captured", Boolean(input.seeded?.workflowThreadId)],
      ["rehydrated workflow open control remains actionable", workflowRehydratedNavigation.workflowThreadHeaderVisible === true],
      ["opened workflow thread is selected in the sidebar", workflowRehydratedNavigation.workflowThreadSidebarSelected === true],
      ["opened workflow thread matches the persisted id", workflowRehydratedNavigation.workflowThreadMatchesExpectedId === true],
      ["opened workflow view has no navigation error", workflowRehydratedNavigation.navigationErrorAbsent === true],
      ["opened workflow view has no critical overlap", workflowRehydratedNavigation.criticalOverlapCount === 0],
    ], [
      input.artifacts.restartRehydrationDesktopScreenshot,
      input.artifacts.workflowRehydratedNavigationDesktopScreenshot,
    ]),
    desktop_local_runtime_ownership: maturityAssertion("desktop_local_runtime_ownership", [
      "local_runtime_lease_ownership",
      "lease_stop_blocker",
      "untracked_runtime_safety",
    ], [
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
    ], [
      input.artifacts.localRuntimeOwnershipDesktopScreenshot,
    ]),
    desktop_operator_controls: maturityAssertion("desktop_operator_controls", [
      "operator_child_controls",
      "operator_control_behavior",
      "retention_policy_integrity",
    ], [
      ["cancel control child run id is captured", Boolean(input.seeded?.cancelControlChildRunId)],
      ["close control child run ids are captured", Boolean(input.seeded?.closeControlChildRunIds.length)],
      ["cancel action is visible and scoped", operatorControls.cancelActionVisible === true && operatorControls.cancelScopedToAttentionChild === true],
      ["close controls preserve transcripts", operatorControls.closeTitlesPreserveTranscripts === true],
      ["completed child can be closed without deleting history", operatorBehavior.completedChildClosed === true && operatorBehavior.completedChildStillVisible === true],
      ["attention child can be cancelled without losing inspectability", operatorBehavior.attentionChildCancelled === true && operatorBehavior.attentionChildStillVisible === true],
      ["sibling state is preserved after operator actions", operatorBehavior.siblingStatePreserved === true],
      ["cancelled child surfaces typed barrier consequence", operatorBehavior.typedBarrierConsequenceVisible === true],
    ], [
      input.artifacts.expandedDesktopScreenshot,
      input.artifacts.operatorBehaviorDesktopScreenshot,
    ]),
    desktop_visual_layout_safety: maturityAssertion("desktop_visual_layout_safety", [
      "production_ui_visibility",
      "layout_safety",
      "workflow_task_continuity",
    ], [
      ["semantic parent-child placement visual assertion passed", visualAssertions.parent_child_placement.status === "passed"],
      ["semantic blocking indicators visual assertion passed", visualAssertions.blocking_attention_indicators.status === "passed"],
      ["semantic approval/runtime labels visual assertion passed", visualAssertions.approval_runtime_ownership_labels.status === "passed"],
      ["semantic workflow continuity visual assertion passed", visualAssertions.workflow_task_continuity.status === "passed"],
      ["semantic parent-stop cascade visual assertion passed", visualAssertions.parent_stop_cascade_visibility.status === "passed"],
      ["layout safety visual assertion passed", visualAssertions.layout_safety.status === "passed"],
      ["narrow view has no critical overlap", narrow.criticalOverlapCount === 0],
      ["operator post-action view has no critical overlap", operatorBehavior.criticalOverlapCount === 0],
    ], [
      input.artifacts.collapsedDesktopScreenshot,
      input.artifacts.expandedNarrowScreenshot,
      input.artifacts.parentStopCascadeDesktopScreenshot,
      input.artifacts.operatorBehaviorDesktopScreenshot,
    ]),
    desktop_multi_cluster_stress: maturityAssertion("desktop_multi_cluster_stress", [
      "multi_parent_cluster_stress",
      "default_collapsed_state",
      "high_load_dogfood",
    ], [
      ["stress parent message ids are captured", Boolean(input.seeded?.stressParentMessageIds.length)],
      ["stress child run ids are captured", Boolean(input.seeded?.stressChildRunIds.length)],
      ["stress child thread ids are captured", Boolean(input.seeded?.stressChildThreadIds.length)],
      ["all stress clusters remain collapsed by default", multiClusterStress.allClustersDefaultCollapsed === true],
      ["stress summaries are visible", multiClusterStress.stressSummariesVisible === true],
      ["stress clusters follow their parent messages", multiClusterStress.stressClustersAfterParentMessages === true],
      ["multi-cluster stress view has no critical overlap", multiClusterStress.criticalOverlapCount === 0],
    ], [
      input.artifacts.multiClusterStressDesktopScreenshot,
    ]),
    desktop_lifecycle_edges: maturityAssertion("desktop_lifecycle_edges", [
      "lifecycle_edge_desktop_behavior",
      "lifecycle_terminal_child_transcript_behavior",
      "timeout_edge",
      "partial_result_edge",
      "retry_edge",
      "detach_edge",
      "parent_stop_cascade",
      "parent_stop_terminal_child_transcript_behavior",
    ], [
      ["lifecycle edge parent message id is captured", Boolean(input.seeded?.lifecycleEdgeParentMessageId)],
      ["lifecycle edge child run ids are captured", (input.seeded?.lifecycleEdgeChildRunIds.length ?? 0) === 4],
      ["lifecycle edge child thread ids are captured", (input.seeded?.lifecycleEdgeChildThreadIds.length ?? 0) === 4],
      ["lifecycle edge wait barrier ids are captured", (input.seeded?.lifecycleEdgeWaitBarrierIds.length ?? 0) === 4],
      ["timeout child and attention choices are visible", lifecycleEdgeVisibility.timeoutChildVisible === true && lifecycleEdgeVisibility.timeoutChoicesVisible === true],
      ["partial decision and summary are visible", lifecycleEdgeVisibility.partialDecisionVisible === true && lifecycleEdgeVisibility.partialSummaryVisible === true],
      ["timed-out lifecycle child opens as an inspectable terminal transcript", lifecycleTimeoutChildTranscript.childExpanded === true && lifecycleTimeoutChildTranscript.childTranscriptTerminal === true && lifecycleTimeoutChildTranscript.finalStatusEndCapLabelVisible === true],
      ["partial lifecycle child opens as an inspectable terminal transcript", lifecyclePartialChildTranscript.childExpanded === true && lifecyclePartialChildTranscript.childTranscriptTerminal === true && lifecyclePartialChildTranscript.finalStatusEndCapLabelVisible === true],
      ["terminal lifecycle child transcripts show real child messages", lifecycleTimeoutChildTranscript.userMessageVisible === true && lifecycleTimeoutChildTranscript.assistantMessageVisible === true && lifecyclePartialChildTranscript.userMessageVisible === true && lifecyclePartialChildTranscript.assistantMessageVisible === true],
      ["terminal lifecycle transcript layout is unobscured", lifecycleTimeoutChildTranscript.summaryNotObscuringTranscript === true && lifecyclePartialChildTranscript.summaryNotObscuringTranscript === true && lifecycleTimeoutChildTranscript.criticalOverlapCount === 0 && lifecyclePartialChildTranscript.criticalOverlapCount === 0],
      ["retry decision and effect are visible", lifecycleEdgeVisibility.retryDecisionVisible === true && lifecycleEdgeVisibility.retryEffectVisible === true],
      ["accepted retry ownership is visible", lifecycleEdgeVisibility.retryAcceptedEffectVisible === true && lifecycleEdgeVisibility.retryMailboxVisible === true],
      ["detached child decision and effect are visible", lifecycleEdgeVisibility.detachDecisionVisible === true && lifecycleEdgeVisibility.detachedEffectVisible === true],
      ["parent-stop cascade parent message id is captured", Boolean(input.seeded?.parentStopCascadeParentMessageId)],
      ["parent-stop cascade parent mailbox event id is captured", Boolean(input.seeded?.parentStopCascadeParentMailboxEventId)],
      ["parent-stop cascade child run ids are captured", (input.seeded?.parentStopCascadeChildRunIds.length ?? 0) === 3],
      ["parent-stop cascade wait barrier ids are captured", (input.seeded?.parentStopCascadeWaitBarrierIds.length ?? 0) === 1],
      ["parent-stop cascade cancelled mailbox event ids are captured", (input.seeded?.parentStopCascadeCancelledMailboxEventIds.length ?? 0) === 2],
      ["parent-stop cascade mailbox and effects are visible", parentStopCascadeVisibility.parentStoppedMailboxVisible === true && parentStopCascadeVisibility.parentCancellationRequestedVisible === true],
      ["parent-stop cascade child outcomes are visible", parentStopCascadeVisibility.requiredChildCancelledVisible === true && parentStopCascadeVisibility.optionalChildDetachedVisible === true && parentStopCascadeVisibility.completedChildUnchangedVisible === true],
      ["parent-stop cancelled child opens as an inspectable terminal transcript", parentStopRequiredChildTranscript.childExpanded === true && parentStopRequiredChildTranscript.childTranscriptTerminal === true && parentStopRequiredChildTranscript.finalStatusEndCapLabelVisible === true],
      ["parent-stop detached child opens as an inspectable terminal transcript", parentStopBackgroundChildTranscript.childExpanded === true && parentStopBackgroundChildTranscript.childTranscriptTerminal === true && parentStopBackgroundChildTranscript.finalStatusEndCapLabelVisible === true],
      ["parent-stop unchanged child opens as a synthesis-safe completion transcript", parentStopCompletedChildTranscript.childExpanded === true && parentStopCompletedChildTranscript.childTranscriptTerminal === true && parentStopCompletedChildTranscript.childTranscriptSynthesisSafe === true && parentStopCompletedChildTranscript.completionEndCapLabelVisible === true],
      ["parent-stop child transcripts show real child messages", parentStopRequiredChildTranscript.userMessageVisible === true && parentStopRequiredChildTranscript.assistantMessageVisible === true && parentStopBackgroundChildTranscript.userMessageVisible === true && parentStopBackgroundChildTranscript.assistantMessageVisible === true && parentStopCompletedChildTranscript.userMessageVisible === true && parentStopCompletedChildTranscript.assistantMessageVisible === true],
      ["lifecycle visual assertion passed", visualAssertions.lifecycle_edge_visibility.status === "passed"],
      ["parent-stop cascade visual assertion passed", visualAssertions.parent_stop_cascade_visibility.status === "passed"],
    ], [
      input.artifacts.lifecycleEdgeVisibilityDesktopScreenshot,
      input.artifacts.lifecycleTimeoutChildTranscriptDesktopScreenshot,
      input.artifacts.lifecyclePartialChildTranscriptDesktopScreenshot,
      input.artifacts.parentStopCascadeDesktopScreenshot,
      input.artifacts.parentStopRequiredChildTranscriptDesktopScreenshot,
      input.artifacts.parentStopBackgroundChildTranscriptDesktopScreenshot,
      input.artifacts.parentStopCompletedChildTranscriptDesktopScreenshot,
    ]),
    desktop_chat_export_child_bundle: maturityAssertion("desktop_chat_export_child_bundle", [
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
    ], [
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
      ["parent mailbox authority contract is exported", approvalAuthorityContract.requestExported === true && approvalAuthorityContract.forwardedExported === true],
      ["parent mailbox authority contract preserves parent blocking", approvalAuthorityContract.parentBlockingResumeMatches === true && approvalAuthorityContract.forwardedParentBlockingResumeMatches === true],
      ["callable workflow task evidence is exported", chatExport.callableWorkflowTasksIncluded === true],
      ["pattern graph child transcript links are exported", chatExport.patternGraphLinksIncluded === true],
      ["child Pi session status is recorded", chatExport.childPiSessionStatusRecorded === true],
    ], [
      input.artifacts.chatExportZip,
    ]),
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

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function labelVisible(check: Record<string, unknown>, label: string): boolean {
  const labels = objectRecord(check.labels);
  return labels[label] === true;
}

async function writeReport(report: DogfoodReport) {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(join(RESULTS_DIR, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function dogfoodGitCommit(): string {
  return process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_GIT_COMMIT || gitOutput(["rev-parse", "HEAD"]) || "unknown";
}

function dogfoodGitBranch(): string {
  return process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_GIT_BRANCH || gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
}

function gitOutput(args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

async function readSeed(path: string): Promise<SubagentDesktopDogfoodSeedResult> {
  return JSON.parse(await readFile(path, "utf8")) as SubagentDesktopDogfoodSeedResult;
}

function requireDogfoodEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for sub-agent Desktop dogfood.`);
  return value;
}

function requireUntrackedRuntimeDogfoodEnv() {
  const pid = Number(requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_PID"));
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_PID must be a positive integer.");
  }
  return {
    id: requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ID"),
    pid,
    endpoint: requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ENDPOINT"),
    model: requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_MODEL"),
  };
}

async function getAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a local port.");
  const port = address.port;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  return port;
}

function dogfoodCdpPort(): number {
  return cdpPortFromEnv() ?? failMissingCdpPort();
}

function cdpPortFromEnv(): number | undefined {
  const raw = process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT;
  if (!raw) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT must be a TCP port, got ${raw}.`);
  }
  return port;
}

function failMissingCdpPort(): never {
  throw new Error("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT is required; run through scripts/run-electron-dogfood.mjs.");
}

async function terminateApp(app: ChildProcess | undefined) {
  if (!app || app.exitCode !== null || app.signalCode !== null) return;
  signalAppProcess(app, "SIGTERM");
  const exited = await waitForAppExit(app, 5000);
  if (exited) return;
  signalAppProcess(app, "SIGKILL");
  await waitForAppExit(app, 2000);
}

function signalAppProcess(app: ChildProcess, signal: NodeJS.Signals) {
  if (!app.pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-app.pid, signal);
      return;
    } catch {
      // Fall through to the direct child in case the process group is already gone.
    }
  }
  try {
    app.kill(signal);
  } catch {
    // Best effort test cleanup only.
  }
}

async function waitForAppExit(app: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (app.exitCode !== null || app.signalCode !== null) return true;
  return Promise.race([
    once(app, "exit").then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
}
