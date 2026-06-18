import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  AMBIENT_PROVIDER_LOCAL,
  ambientModelRuntimeCatalogFromProfiles,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import type { LocalRuntimeAffectedSubagent, LocalRuntimeInventorySnapshot, LocalRuntimeLeaseRecord, LocalRuntimeLeaseStateSummary, LocalRuntimeLifecycleActionDecision, LocalRuntimeLifecycleDecision } from "../../shared/localRuntimeTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { MessageBubble } from "./AppMessages";
import {
  DiagnosticExportHistory,
  LocalRuntimeEvidenceDiagnostics,
  LocalModelsRuntimeInventory,
  SubagentRepairDiagnostics,
  SubagentReplayEvidenceDiagnostics,
} from "./RightPanel";
import { SubagentParentCluster } from "./SubagentParentCluster";
import { subagentParentClusterFixtureModel } from "./SubagentParentCluster.fixture";
import { SubagentThreadInspector } from "./SubagentThreadInspector";
import { modelRuntimeCatalogSettingsModel } from "./modelRuntimeCatalogUiModel";
import type { DiagnosticExportHistoryModel } from "./diagnosticExportHistoryUiModel";
import type { LocalRuntimeEvidenceInspectorModel } from "./localRuntimeEvidenceUiModel";
import type { SubagentRepairDiagnosticsModel } from "./subagentRepairDiagnosticsUiModel";
import type { SubagentReplayEvidenceInspectorModel } from "./subagentReplayEvidenceUiModel";
import type { SubagentThreadInspectorModel } from "./subagentThreadInspectorUiModel";

const resultsDir = join(process.cwd(), "test-results", "subagent-integrated-production-ui");
const requiredLabels = [
  "Ambient is coordinating the parent task while required child work stays inspectable.",
  "Parent waiting on sub-agents",
  "Caller: sub-agent child",
  "Blocking: approval",
  "Cancelled 1 child",
  "Parent cancellation requested",
  "Review worker sub-agent",
  "Required barrier",
  "Denied",
  "connector_app:gmail.search",
  "Workflow bridge",
  "Disabled / 0/0 nested fanout slots remaining / 0 allowed tools",
  "Callable workflow child bridge is disabled by child role policy.",
  "Workflow Call (workflow.call)",
  "ambient_workflow_symphony_map_reduce",
  "Callable workflow tasks",
  "Callable workflow Active Task Interrupted",
  "artifact linked",
  "run linked",
  "child_bridge_policy",
  "Recent diagnostic exports",
  "Replay evidence",
  "Child threads",
  "Parent mailbox events",
  "Repair diagnostics",
  "Snapshot integrity",
  "In use by sub-agent Review worker",
  "Forced Stop/Restart cancels affected sub-agents",
  "Ordinary Stop/Restart blocked by 1 active sub-agent lease: lease-review",
  "Forced Stop/Restart will cancel or mark 1 affected sub-agent",
  "Local runtime evidence",
  "Runtime rows",
  "Active owners",
  "Memory evidence",
];

describe("integrated sub-agent production UI visual proof", () => {
  it("captures chat clusters, child inspector, replay, repair, and local runtime ownership together", async () => {
    await mkdir(resultsDir, { recursive: true });
    const fixturePath = join(resultsDir, "fixture.html");
    const runnerPath = join(resultsDir, "capture-runner.cjs");
    const reportPath = join(resultsDir, "latest.json");

    await writeFile(fixturePath, await renderIntegratedFixtureHtml(), "utf8");
    await writeFile(runnerPath, electronCaptureRunnerSource(), "utf8");
    await runElectronCapture(runnerPath, fixturePath, reportPath, resultsDir);

    const report = JSON.parse(await readFile(reportPath, "utf8")) as IntegratedVisualProofReport;
    expect(report.checks.initial.parentClusterOpen).toBe(false);
    expect(report.checks.expanded.parentClusterOpen).toBe(true);
    expect(report.checks.expanded.missingLabels).toEqual([]);
    expect(report.checks.expanded.messageBubbles).toBeGreaterThanOrEqual(1);
    expect(report.checks.expanded.parentClusters).toBeGreaterThanOrEqual(1);
    expect(report.checks.expanded.expandedChildThreads).toBe(1);
    expect(report.checks.expanded.childTranscriptPanels).toBeGreaterThanOrEqual(1);
    expect(report.checks.expanded.inlineChildTranscriptVisible).toBe(true);
    expect(report.checks.expanded.transcriptBeforePatternGraph).toBe(true);
    expect(report.checks.expanded.messageBubbles).toBeGreaterThanOrEqual(2);
    expect(report.checks.expanded.childInspectors).toBeGreaterThanOrEqual(1);
    expect(report.checks.expanded.replayGroups).toBeGreaterThanOrEqual(2);
    expect(report.checks.expanded.runtimeCards).toBeGreaterThanOrEqual(1);
    expect(report.checks.expanded.disabledRuntimeButtons).toBeGreaterThanOrEqual(2);
    expect(report.checks.childExpanded.expandedChildThreads).toBe(1);
    expect(report.checks.childExpanded.childTranscriptPanels).toBeGreaterThanOrEqual(1);
    expect(report.checks.childExpanded.inlineChildTranscriptVisible).toBe(true);
    expect(report.checks.childExpanded.messageBubbles).toBeGreaterThanOrEqual(2);
    expect(report.checks.childExpanded.missingLabels).toEqual([]);
    expect(report.checks.narrow.parentClusterOpen).toBe(true);
    expect(report.checks.narrow.expandedChildThreads).toBe(1);
    expect(report.checks.narrow.horizontalOverflowFree).toBe(true);
    expect(report.checks.narrow.scrollWidth).toBeLessThanOrEqual(report.checks.narrow.innerWidth + 2);

    expect(report.screenshots.map((capture) => capture.name)).toEqual([
      "integrated-collapsed-desktop",
      "integrated-expanded-desktop",
      "integrated-child-expanded-desktop",
      "integrated-expanded-narrow",
    ]);
    for (const capture of report.screenshots) {
      const image = await readFile(capture.path);
      const analysis = analyzePng(image);
      expect(capture.bytes).toBeGreaterThan(1_000);
      expect(analysis.width).toBeGreaterThanOrEqual(capture.name === "integrated-expanded-narrow" ? 430 : 1100);
      expect(analysis.height).toBeGreaterThanOrEqual(capture.name === "integrated-expanded-narrow" ? 860 : 820);
      expect(analysis.nonBlackRatio).toBeGreaterThan(0.5);
      expect(analysis.nonWhiteRatio).toBeGreaterThan(0.03);
      expect(analysis.distinctColorCount).toBeGreaterThan(28);
    }
  }, 60_000);
});

async function renderIntegratedFixtureHtml(): Promise<string> {
  const styles = await readFile(join(process.cwd(), "src", "renderer", "src", "styles.css"), "utf8");
  const markup = renderToStaticMarkup(<IntegratedProductionUiFixture />);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sub-agent integrated production UI proof</title>
  <style>${styles}</style>
  <style>
    html,
    body {
      width: 100%;
      min-height: 100%;
      overflow: auto;
    }

    body {
      padding: 24px;
      background: #edf2f5;
    }

    .subagent-integrated-proof {
      width: min(100%, 1280px);
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
      gap: 18px;
      align-items: start;
    }

    .subagent-integrated-proof-chat,
    .subagent-integrated-proof-side {
      min-width: 0;
      display: grid;
      gap: 12px;
    }

    .subagent-integrated-proof-chat .messages {
      height: auto;
      min-height: 0;
      overflow: visible;
      padding: 0;
    }

    .subagent-integrated-proof-chat .subagent-parent-cluster {
      width: 100%;
      margin: -6px 0 18px;
    }

    .subagent-integrated-proof-side .subagent-thread-inspector {
      margin: 0;
    }

    .subagent-integrated-proof-panel {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface-elevated);
      padding: 10px;
      display: grid;
      gap: 8px;
    }

    .subagent-integrated-proof-panel > strong {
      font-size: 12px;
    }

    @media (max-width: 820px) {
      body {
        padding: 12px;
      }

      .subagent-integrated-proof {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  ${markup}
</body>
</html>`;
}

function IntegratedProductionUiFixture() {
  const noop = vi.fn();
  const runtimeModel = modelRuntimeCatalogSettingsModel(
    ambientModelRuntimeCatalogFromProfiles({
      generatedAt: "2026-06-10T19:00:00.000Z",
      profiles: [resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL), configuredLocalTextProfile()],
    }),
    AMBIENT_DEFAULT_MODEL,
    runtimeInventoryFixture(),
  );
  return (
    <main className="subagent-integrated-proof">
      <section className="subagent-integrated-proof-chat" aria-label="Actual chat surface with sub-agent parent cluster">
        <div className="messages">
          <MessageBubble
            message={parentAssistantMessage()}
            voiceProviderLabels={{}}
            streaming={false}
            workspacePath="/workspace"
            onPreviewPath={noop}
            onPreviewLocalPath={noop}
            onOpenUrl={noop}
            onOpenBrowserUrl={noop}
            onOpenBrowserPanel={noop}
            onOpenMediaModal={noop}
            generatedMediaAutoplay={false}
            voiceShouldAutoplay={false}
            onActiveVoiceMessageChange={noop}
            onRegenerateVoice={noop}
            onRevealVoiceArtifact={noop}
            onClearVoiceArtifact={noop}
            artifactPathHints={new Map()}
            runActivityLines={[]}
            runStatus="idle"
            onImplementPlannerPlan={noop}
            onRefinePlannerPlan={noop}
            onRetryPlannerFinalization={noop}
            onAddPlannerPlanToBoard={noop}
            onGeneratePlannerDurableArtifact={noop}
            onAnswerPlannerDecisionQuestion={noop}
            hasProjectBoard={false}
          />
          <SubagentParentCluster
            model={subagentParentClusterFixtureModel()}
            onOpenThread={noop}
            onCancelChild={noop}
            onCloseChild={noop}
            onOpenWorkflowThread={noop}
            onPauseWorkflowTask={noop}
            onResumeWorkflowTask={noop}
            onCancelWorkflowTask={noop}
            onResolveBarrierAction={noop}
            onResolveApprovalAction={noop}
            renderChildTranscript={(child) => (
              <MessageBubble
                message={childAssistantMessage(child.title)}
                voiceProviderLabels={{}}
                streaming={false}
                workspacePath="/workspace"
                onPreviewPath={noop}
                onPreviewLocalPath={noop}
                onOpenUrl={noop}
                onOpenBrowserUrl={noop}
                onOpenBrowserPanel={noop}
                onOpenMediaModal={noop}
                generatedMediaAutoplay={false}
                voiceShouldAutoplay={false}
                onActiveVoiceMessageChange={noop}
                onRegenerateVoice={noop}
                onRevealVoiceArtifact={noop}
                onClearVoiceArtifact={noop}
                artifactPathHints={new Map()}
                runActivityLines={[]}
                runStatus="idle"
                onImplementPlannerPlan={noop}
                onRefinePlannerPlan={noop}
                onRetryPlannerFinalization={noop}
                onAddPlannerPlanToBoard={noop}
                onGeneratePlannerDurableArtifact={noop}
                onAnswerPlannerDecisionQuestion={noop}
                hasProjectBoard={false}
              />
            )}
            pauseWorkflowTaskBusyId="workflow-task-1"
            approvalActionBusyId="child-run-1:approval-1"
          />
        </div>
      </section>
      <aside className="subagent-integrated-proof-side" aria-label="Integrated sub-agent proof surfaces">
        <SubagentThreadInspector model={threadInspectorFixture()} defaultOpen />
        <section className="subagent-integrated-proof-panel">
          <strong>Local runtime ownership</strong>
          <LocalModelsRuntimeInventory
            model={runtimeModel}
            subagentsEnabled={true}
            onRunLifecycleAction={noop}
          />
        </section>
        <section className="subagent-integrated-proof-panel">
          <strong>Diagnostic replay and repair</strong>
          <DiagnosticExportHistory model={diagnosticHistoryFixture()} onSelect={noop} />
          <SubagentReplayEvidenceDiagnostics model={replayEvidenceFixture()} />
          <LocalRuntimeEvidenceDiagnostics model={localRuntimeEvidenceFixture()} />
          <SubagentRepairDiagnostics model={repairDiagnosticsFixture()} />
        </section>
      </aside>
    </main>
  );
}

function parentAssistantMessage(): ChatMessage {
  return {
    id: "message-1",
    threadId: "parent-thread",
    role: "assistant",
    content: "Ambient is coordinating the parent task while required child work stays inspectable.",
    createdAt: "2026-06-10T19:01:00.000Z",
  };
}

function childAssistantMessage(childTitle: string): ChatMessage {
  return {
    id: "child-inline-message-1",
    threadId: "child-thread-1",
    role: "assistant",
    content: `Child transcript rendered inline for ${childTitle}. Tool calls, thinking, and assistant output share the same message renderer as parent threads.`,
    createdAt: "2026-06-10T19:02:00.000Z",
  };
}

function threadInspectorFixture(): SubagentThreadInspectorModel {
  return {
    runId: "run-review",
    title: "Review worker sub-agent",
    status: "Needs attention",
    statusTone: "warning",
    badges: ["Required", "Local", "Tool-capable", "Open", "Snapshot repair"],
    rows: [
      { label: "Task path", value: "root/0:reviewer" },
      { label: "Role", value: "Review worker" },
      { label: "Memory", value: "Run snapshot only" },
      { label: "Retention", value: "Short TTL plus retained summary" },
      { label: "Scheduling", value: "Interactive child" },
      { label: "Model", value: "Local text runtime" },
      { label: "Runtime", value: "local / ambient-local-text" },
      { label: "Tools", value: "Tool-capable with explicit child approvals" },
      { label: "Capacity", value: "lease-review" },
      { label: "Local runtime", value: "In use by sub-agent Review worker" },
      { label: "Parent thread", value: "parent-thread" },
    ],
    recentEvents: [
      { key: "run-review:8", label: "Approval requested", value: "Child approval approval-1 forwarded to parent and parent remains blocked." },
      { key: "run-review:7", label: "Workflow blocked", value: "Blocking callable workflow work is not synthesis safe." },
    ],
    toolScopeRows: [
      { label: "Denied", value: "Workflow Call (workflow.call); connector_app:gmail.search denied by child role policy" },
      { label: "Denied tools", value: "Callable Workflow ambient_workflow_symphony_map_reduce / Workflow Call (workflow.call); connector_app:gmail.search" },
      { label: "Deny reasons", value: "Workflow Call (workflow.call): Callable workflow child bridge is disabled by child role policy." },
      { label: "Approval", value: "Approval unavailable until parent forwards this child request" },
      { label: "Workflow bridge", value: "Disabled / 0/0 nested fanout slots remaining / 0 allowed tools / Callable workflow child bridge is disabled by child role policy." },
      { label: "Task intent", value: "file_read / Read selected workspace files only." },
      { label: "Filesystem scope", value: "read: /repo/specs/plan.md, /repo/docs/context.pdf / write: deny / denied write: /repo/Downloads" },
      { label: "External scope", value: "network: deny / connectors: deny" },
      { label: "Nested fanout policy", value: "deny / 0 remaining" },
      { label: "Approval route", value: "parent / interactive / child-thread" },
    ],
    modelScopeRows: [
      { label: "Selected", value: "Local text runtime" },
      { label: "Capability", value: "streaming, JSON, local memory checked" },
    ],
    waitBarrierRows: [
      { label: "Required barrier", value: "Parent blocked on approval and workflow work" },
      { label: "Failure policy", value: "Fail parent on required failure" },
    ],
    repairRows: [
      {
        key: "repair-1",
        title: "Missing Tool Scope Snapshot",
        categoryLabel: "Snapshot integrity",
        detail: "Replay repaired a stale child tool-scope snapshot.",
        tone: "warning",
        actionLabel: "inspect run snapshot",
        meta: "run run-review / thread child-thread",
      },
    ],
  };
}

function replayEvidenceFixture(): SubagentReplayEvidenceInspectorModel {
  return {
    statusLabel: "1 child run",
    statusTone: "warning",
    summary: "Sub-agent replay evidence captured bounded timelines for 1 child run.",
    badges: ["Token-free", "Bounded timeline", "2 runtime events", "1 parent mailbox event", "1 callable workflow task", "1 lifecycle edge"],
    countsRows: [
      { label: "Runs", value: "1 / 1 shown" },
      { label: "Child threads", value: "1 / 1 shown" },
      { label: "Runtime events", value: "2 / 2 shown" },
      { label: "Parent mailbox events", value: "1 / 1 shown" },
      { label: "Callable workflow tasks", value: "1 / 1 shown" },
    ],
    childThreadRows: [{
      key: "child-thread",
      title: "root/0:reviewer",
      detail: "Status: needs attention / Collapsed by default",
      meta: "run run-review / parent run parent-run / parent thread parent-thread",
      tone: "warning",
    }],
    runtimeEventRows: [{
      key: "runtime-1",
      title: "Approval requested",
      detail: "approval unavailable denied tools connector_app:gmail.search",
      meta: "run run-review / child-thread",
      tone: "warning",
    }],
    persistedEventRows: [{
      key: "persisted-1",
      title: "Child progress",
      detail: "Verifier active while parent remains blocked.",
      meta: "sequence 8",
      tone: "neutral",
    }],
    parentMailboxRows: [{
      key: "mailbox-1",
      title: "Parent mailbox events",
      detail: "Approval request includes child identity and scope this child thread.",
      meta: "approval-1 / run-review",
      tone: "warning",
    }],
    callableWorkflowRows: [{
      key: "callable-workflow:workflow-task-1",
      title: "Callable workflow Active Task Interrupted",
      detail: "Blocking | Needs attention | workflow run terminal task unfinished | artifact linked / run linked | child_bridge_policy denied workflow scope remained visible",
      meta: "task workflow-task-1 / parent run parent-run / workflow thread workflow-thread-1 / artifact workflow-artifact-1 / run workflow-run-1 / child_bridge_policy",
      tone: "warning",
    }],
    transcriptRows: [{
      key: "transcript-1",
      title: "Transcript",
      detail: "Bounded child transcript preview retained.",
      meta: "child-thread",
      tone: "neutral",
    }],
    restartRepairRows: [{
      key: "repair-1",
      title: "Restart repair",
      detail: "Startup repair rehydrated wait barrier ownership.",
      meta: "barrier-1",
      tone: "warning",
    }],
    lifecycleEdgeRows: [{
      key: "lifecycle-edge-1",
      title: "Lifecycle Cancel Parent",
      detail: "Parent cancellation requested while the child remains visible in replay.",
      meta: "parent-run / barrier-1",
      tone: "danger",
    }],
    searchText: "Sub-agent replay connector_app:gmail.search approval unavailable Callable workflow tasks Callable workflow Active Task Interrupted artifact linked run linked child_bridge_policy Parent mailbox events Lifecycle Cancel Parent Restart repair",
  };
}

function repairDiagnosticsFixture(): SubagentRepairDiagnosticsModel {
  return {
    statusLabel: "1 repair issue",
    statusTone: "warning",
    summary: "0 errors, 1 warning",
    badges: ["1 warning", "Snapshot 1 issue", "1 reconciled"],
    searchText: "Repair diagnostics Snapshot integrity missing_tool_scope_snapshot inspect run snapshot",
    affectedRows: [
      { label: "Runs", value: "run-review" },
      { label: "Threads", value: "child-thread" },
    ],
    issueGroups: [{ label: "Snapshot integrity", value: "1 issue" }],
    issueRows: [{
      key: "repair-1",
      title: "Missing Tool Scope Snapshot",
      categoryLabel: "Snapshot integrity",
      detail: "A stale child tool-scope snapshot was repaired during startup reconciliation.",
      tone: "warning",
      actionLabel: "inspect run snapshot",
      meta: "run run-review / thread child-thread",
    }],
  };
}

function diagnosticHistoryFixture(): DiagnosticExportHistoryModel {
  return {
    summary: "2 diagnostic bundles available",
    rows: [
      {
        id: "diagnostics-latest",
        label: "ambient-diagnostics-latest.json",
        detail: "Sub-agent replay evidence captured bounded timelines for 1 child run.",
        replayStatus: "Replay captured",
        replayTone: "warning",
        localRuntimeStatus: "1 active lease",
        localRuntimeTone: "warning",
        selected: true,
        path: "/workspace/.ambient/diagnostics/latest.json",
        searchText: "Replay captured 1 active lease sub-agent replay",
      },
      {
        id: "diagnostics-previous",
        label: "ambient-diagnostics-previous.json",
        detail: "No persisted child runs were present.",
        replayStatus: "No child runs",
        replayTone: "neutral",
        localRuntimeStatus: "No leases",
        localRuntimeTone: "neutral",
        selected: false,
        path: "/workspace/.ambient/diagnostics/previous.json",
        searchText: "No child runs",
      },
    ],
    searchText: "Diagnostic export history Sub-agent replay Replay captured 1 active lease",
  };
}

function localRuntimeEvidenceFixture(): LocalRuntimeEvidenceInspectorModel {
  return {
    statusLabel: "1 active lease",
    statusTone: "warning",
    summary: "Local runtime evidence captured an active owner and blocked ordinary Stop.",
    badges: ["Needs Attention", "1 active owner", "1 blocked action", "Memory basis Actual RSS"],
    countsRows: [
      { label: "Runtimes", value: "1" },
      { label: "Active owners", value: "1" },
      { label: "Blocked actions", value: "1" },
      { label: "Next safe actions", value: "1" },
    ],
    runtimeRows: [{
      key: "runtime:1:local-text-runtime",
      title: "local-text:local-text-runtime:4301 (Running)",
      detail: "Capability Local Text | Tracking Managed | In use by sub-agent Review worker | Stop blocked: Ordinary Stop disabled while sub-agent Review worker owns this runtime. / Forced Stop/Restart cancels affected sub-agents",
      meta: "provider local / runtime local-text-runtime / active leases lease-review / Actual RSS 5.0 GiB / Estimate 6.0 GiB",
      tone: "warning",
    }],
    ownerRows: [{
      key: "owner:1:lease-review",
      title: "sub-agent Review worker (Running)",
      detail: "Owns local-text:local-text-runtime:4301 / Capability Local Text / 5.0 GiB actual; 6.0 GiB estimated",
      meta: "lease lease-review / parent thread parent-thread / sub-agent thread child-thread / sub-agent run child-run",
      tone: "warning",
    }],
    blockedActionRows: [{
      key: "blocked-action:1:local-text-runtime:stop",
      title: "Stop blocked for local-text:local-text-runtime:4301",
      detail: "Ordinary Stop disabled while sub-agent Review worker owns this runtime. / Forced action must cancel or mark affected sub-agents",
      meta: "blockers lease-review / affected sub-agent Review worker",
      tone: "warning",
    }],
    nextSafeActionRows: [{
      key: "next-safe-action:1:wait-for-owner:local-text-runtime",
      title: "Wait For Owner (Blocked)",
      detail: "Wait for sub-agent Review worker to release lease-review before ordinary Stop. / Ownership resolution: Cancel Or Mark Affected Subagents",
      meta: "runtime entry local-text:local-text-runtime:4301 / blockers lease-review / resolution blockers lease-review",
      tone: "danger",
    }],
    memoryRows: [{
      key: "memory:active",
      title: "Active resident memory",
      detail: "6.0 GiB estimated / 5.0 GiB actual / basis Actual RSS",
      meta: "1 actual RSS / 0 estimate-only / 0 unknown",
      tone: "neutral",
    }],
    searchText: "local runtime evidence lease-review child-thread blocked stop memory evidence",
  };
}

function runtimeInventoryFixture(): LocalRuntimeInventorySnapshot {
  const localProfile = configuredLocalTextProfile();
  const lease = runtimeLease(localProfile);
  const affectedSubagent = affectedSubagentForLease(lease);
  return {
    schemaVersion: "ambient-local-runtime-inventory-v1",
    capturedAt: "2026-06-10T19:02:00.000Z",
    activeLeases: [lease],
    entries: [{
      schemaVersion: "ambient-local-runtime-inventory-entry-v1",
      id: "local-text:local-text-runtime:4301",
      capability: "local-text",
      providerId: AMBIENT_PROVIDER_LOCAL,
      modelRuntimeId: "local-text-runtime",
      modelProfileId: localProfile.profileId,
      modelId: AMBIENT_LOCAL_TEXT_MODEL,
      trackingStatus: "managed",
      running: true,
      pid: 4301,
      endpoint: "http://127.0.0.1:43123/health",
      estimatedResidentMemoryBytes: 6 * 1024 * 1024 * 1024,
      actualResidentMemoryBytes: 5 * 1024 * 1024 * 1024,
      owners: [{
        leaseId: lease.leaseId,
        parentThreadId: lease.parentThreadId,
        subagentThreadId: lease.subagentThreadId,
        subagentRunId: lease.subagentRunId,
        displayName: "sub-agent Review worker",
        status: "running",
      }],
      leases: [lease],
      leaseState: leaseState({ activeLeaseIds: [lease.leaseId] }),
      lifecycleDecision: lifecycleDecision({
        stopAllowed: false,
        restartAllowed: false,
        stopReason: "In use by sub-agent Review worker.",
        restartReason: "In use by sub-agent Review worker.",
        blockerLeaseIds: [lease.leaseId],
        affectedSubagents: [affectedSubagent],
        forceAllowed: true,
        forceRequiresSubagentCancellation: true,
      }),
      stopDecision: {
        ordinaryStopAllowed: false,
        reason: "In use by sub-agent Review worker.",
        blockerLeaseIds: [lease.leaseId],
        affectedSubagents: [affectedSubagent],
        forceTerminationAllowed: true,
        forceRequiresSubagentCancellation: true,
        untracked: false,
      },
      startedAt: "2026-06-10T18:30:00.000Z",
      lastUsedAt: "2026-06-10T19:01:00.000Z",
      lastHeartbeatAt: "2026-06-10T19:02:00.000Z",
    }],
  };
}

function configuredLocalTextProfile(): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
    profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:startup`,
    label: "Local text runtime",
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    unavailableReason: undefined,
    estimatedResidentMemoryBytes: 4 * 1024 * 1024 * 1024,
    providerQuirks: ["Resolved from an active local runtime descriptor."],
  };
}

function runtimeLease(profile: AmbientModelRuntimeProfile): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-review",
    ownerDisplayName: "Review worker",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    subagentRunId: "run-review",
    modelRuntimeId: "local-text-runtime",
    modelProfileId: profile.profileId,
    modelId: AMBIENT_LOCAL_TEXT_MODEL,
    providerId: AMBIENT_PROVIDER_LOCAL,
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * 1024 * 1024 * 1024,
    actualResidentMemoryBytes: 5 * 1024 * 1024 * 1024,
    pid: 4301,
    endpoint: "http://127.0.0.1:43123/health",
    acquiredAt: "2026-06-10T18:30:00.000Z",
    lastHeartbeatAt: "2026-06-10T19:02:00.000Z",
    status: "running",
  };
}

function affectedSubagentForLease(lease: LocalRuntimeLeaseRecord): LocalRuntimeAffectedSubagent {
  return {
    leaseId: lease.leaseId,
    parentThreadId: lease.parentThreadId,
    subagentThreadId: lease.subagentThreadId ?? "child-thread",
    subagentRunId: lease.subagentRunId,
    displayName: "sub-agent Review worker",
    status: "running",
    modelRuntimeId: lease.modelRuntimeId,
    modelProfileId: lease.modelProfileId,
    modelId: lease.modelId,
    providerId: lease.providerId,
    capabilityKind: lease.capabilityKind,
  };
}

function leaseState(patch: Partial<LocalRuntimeLeaseStateSummary> = {}): LocalRuntimeLeaseStateSummary {
  return {
    activeLeaseIds: [],
    staleLeaseIds: [],
    releasedLeaseIds: [],
    crashedLeaseIds: [],
    inactiveLeaseIds: [],
    ...patch,
  };
}

function lifecycleDecision(input: {
  stopAllowed: boolean;
  restartAllowed: boolean;
  stopReason: string;
  restartReason: string;
  blockerLeaseIds: string[];
  affectedSubagents: LocalRuntimeAffectedSubagent[];
  forceAllowed: boolean;
  forceRequiresSubagentCancellation: boolean;
}): LocalRuntimeLifecycleDecision {
  return {
    schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
    stop: lifecycleActionDecision({
      allowed: input.stopAllowed,
      reason: input.stopReason,
      blockerLeaseIds: input.blockerLeaseIds,
      affectedSubagents: input.affectedSubagents,
      forceAllowed: input.forceAllowed,
      forceRequiresSubagentCancellation: input.forceRequiresSubagentCancellation,
    }),
    restart: lifecycleActionDecision({
      allowed: input.restartAllowed,
      reason: input.restartReason,
      blockerLeaseIds: input.blockerLeaseIds,
      affectedSubagents: input.affectedSubagents,
      forceAllowed: input.forceAllowed,
      forceRequiresSubagentCancellation: input.forceRequiresSubagentCancellation,
    }),
    load: lifecycleActionDecision({
      allowed: false,
      reason: "Runtime is already running.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
    }),
    unload: lifecycleActionDecision({
      allowed: input.stopAllowed,
      reason: input.stopAllowed ? "No active sub-agent local runtime lease blocks ordinary Unload." : input.stopReason,
      blockerLeaseIds: input.blockerLeaseIds,
      affectedSubagents: input.affectedSubagents,
      forceAllowed: input.forceAllowed,
      forceRequiresSubagentCancellation: input.forceRequiresSubagentCancellation,
    }),
  };
}

function lifecycleActionDecision(input: Omit<LocalRuntimeLifecycleActionDecision, "untracked">): LocalRuntimeLifecycleActionDecision {
  return {
    ...input,
    untracked: false,
  };
}

function electronCaptureRunnerSource(): string {
  return `"use strict";

const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("fs");
const { join } = require("path");

const fixturePath = process.argv[2];
const reportPath = process.argv[3];
const outputDir = process.argv[4];
const requiredLabels = ${JSON.stringify(requiredLabels)};

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");

async function main() {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1180,
    height: 880,
    useContentSize: true,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await win.loadFile(fixturePath);
  await waitForPaint();
  const initial = await collectChecks(win);
  const screenshots = [await capture(win, "integrated-collapsed-desktop")];

  await win.webContents.executeJavaScript(
    'document.querySelector(".subagent-parent-cluster").open = true;',
    true,
  );
  await waitForPaint();
  const expanded = await collectChecks(win);
  screenshots.push(await capture(win, "integrated-expanded-desktop"));

  await win.webContents.executeJavaScript(
    'document.querySelector(".subagent-parent-cluster-child-thread").open = true;',
    true,
  );
  await waitForPaint();
  const childExpanded = await collectChecks(win);
  screenshots.push(await capture(win, "integrated-child-expanded-desktop"));

  win.setContentSize(430, 900);
  await waitForPaint();
  const narrow = await collectChecks(win);
  screenshots.push(await capture(win, "integrated-expanded-narrow"));

  writeFileSync(reportPath, JSON.stringify({
    version: 1,
    fixturePath,
    checks: { initial, expanded, childExpanded, narrow },
    screenshots,
  }, null, 2) + "\\n");

  win.destroy();
  app.quit();
}

async function collectChecks(win) {
  return win.webContents.executeJavaScript(\`
(() => {
  const cluster = document.querySelector(".subagent-parent-cluster");
  const text = document.body.innerText;
  const rootScrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const requiredLabels = \${JSON.stringify(requiredLabels)};
  const transcript = cluster?.querySelector(".subagent-parent-cluster-child-transcript");
  const patternGraph = cluster?.querySelector(".subagent-parent-cluster-pattern-graphs");
  return {
    parentClusterOpen: Boolean(cluster && cluster.open),
    missingLabels: requiredLabels.filter((label) => !text.includes(label)),
    messageBubbles: document.querySelectorAll(".message.assistant").length,
    parentClusters: document.querySelectorAll(".subagent-parent-cluster").length,
    childTranscriptPanels: document.querySelectorAll(".subagent-parent-cluster-child-transcript").length,
    expandedChildThreads: document.querySelectorAll(".subagent-parent-cluster-child-thread[open]").length,
    inlineChildTranscriptVisible: text.includes("Child transcript rendered inline for Reviewer"),
    transcriptBeforePatternGraph: Boolean(transcript && patternGraph && (transcript.compareDocumentPosition(patternGraph) & Node.DOCUMENT_POSITION_FOLLOWING)),
    childInspectors: document.querySelectorAll(".subagent-thread-inspector").length,
    replayGroups: document.querySelectorAll(".subagent-replay-evidence-group").length,
    runtimeCards: document.querySelectorAll(".model-runtime-catalog-profile").length,
    disabledRuntimeButtons: document.querySelectorAll(".model-runtime-catalog-profile button:disabled").length,
    horizontalOverflowFree: rootScrollWidth <= window.innerWidth + 2,
    scrollWidth: rootScrollWidth,
    innerWidth: window.innerWidth,
  };
})()
  \`, true);
}

async function capture(win, name) {
  const image = await win.capturePage();
  const png = image.toPNG();
  const path = join(outputDir, name + ".png");
  writeFileSync(path, png);
  const size = await win.webContents.executeJavaScript("({ width: window.innerWidth, height: window.innerHeight })", true);
  return { name, path, bytes: png.length, width: size.width, height: size.height };
}

function waitForPaint() {
  return new Promise((resolve) => setTimeout(resolve, 140));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  app.quit();
  process.exitCode = 1;
});
`;
}

async function runElectronCapture(
  runnerPath: string,
  fixturePath: string,
  reportPath: string,
  outputDir: string,
): Promise<void> {
  const electronPath = createRequire(import.meta.url)("electron") as string;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(electronPath, [runnerPath, fixturePath, reportPath, outputDir], {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`Electron integrated UI proof timed out. stdout:\\n${stdout}\\nstderr:\\n${stderr}`));
    }, 45_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Electron integrated UI proof exited ${code}. stdout:\\n${stdout}\\nstderr:\\n${stderr}`));
    });
  });
}

function analyzePng(buffer: Buffer): PngAnalysis {
  const decoded = decodePng(buffer);
  const colors = new Set<string>();
  let nonBlack = 0;
  let nonWhite = 0;
  let opaque = 0;
  for (let offset = 0; offset < decoded.data.length; offset += 4) {
    const r = decoded.data[offset];
    const g = decoded.data[offset + 1];
    const b = decoded.data[offset + 2];
    const a = decoded.data[offset + 3];
    if (a === 0) continue;
    opaque += 1;
    if (r > 8 || g > 8 || b > 8) nonBlack += 1;
    if (r < 245 || g < 245 || b < 245) nonWhite += 1;
    colors.add(`${r},${g},${b},${a}`);
  }
  const total = decoded.width * decoded.height;
  return {
    width: decoded.width,
    height: decoded.height,
    opaqueRatio: opaque / total,
    nonBlackRatio: nonBlack / total,
    nonWhiteRatio: nonWhite / total,
    distinctColorCount: colors.size,
  };
}

function decodePng(buffer: Buffer): DecodedPng {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Not a PNG file.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}.`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`Unsupported PNG color type ${colorType}.`);

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rowBytes = width * channels;
  const raw = new Uint8Array(height * rowBytes);
  let readOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    readOffset += 1;
    const rowStart = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const rawByte = inflated[readOffset + x];
      const left = x >= channels ? raw[rowStart + x - channels] : 0;
      const up = y > 0 ? raw[rowStart + x - rowBytes] : 0;
      const upLeft = y > 0 && x >= channels ? raw[rowStart + x - rowBytes - channels] : 0;
      raw[rowStart + x] = (rawByte + pngFilterDelta(filter, left, up, upLeft)) & 0xff;
    }
    readOffset += rowBytes;
  }

  if (channels === 4) return { width, height, data: raw };

  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = raw[pixel * 3];
    rgba[pixel * 4 + 1] = raw[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = raw[pixel * 3 + 2];
    rgba[pixel * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}

function pngFilterDelta(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`Unsupported PNG filter ${filter}.`);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

interface IntegratedVisualProofReport {
  version: 1;
  fixturePath: string;
  checks: {
    initial: IntegratedVisualProofDomChecks;
    expanded: IntegratedVisualProofDomChecks;
    childExpanded: IntegratedVisualProofDomChecks;
    narrow: IntegratedVisualProofDomChecks;
  };
  screenshots: Array<{
    name:
      | "integrated-collapsed-desktop"
      | "integrated-expanded-desktop"
      | "integrated-child-expanded-desktop"
      | "integrated-expanded-narrow";
    path: string;
    bytes: number;
    width: number;
    height: number;
  }>;
}

interface IntegratedVisualProofDomChecks {
  parentClusterOpen: boolean;
  missingLabels: string[];
  messageBubbles: number;
  parentClusters: number;
  childTranscriptPanels: number;
  expandedChildThreads: number;
  inlineChildTranscriptVisible: boolean;
  transcriptBeforePatternGraph: boolean;
  childInspectors: number;
  replayGroups: number;
  runtimeCards: number;
  disabledRuntimeButtons: number;
  horizontalOverflowFree: boolean;
  scrollWidth: number;
  innerWidth: number;
}

interface PngAnalysis {
  width: number;
  height: number;
  opaqueRatio: number;
  nonBlackRatio: number;
  nonWhiteRatio: number;
  distinctColorCount: number;
}

interface DecodedPng {
  width: number;
  height: number;
  data: Uint8Array;
}
