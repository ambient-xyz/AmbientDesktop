import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AutomationScheduleExceptionSummary, AutomationScheduleSummary } from "../../shared/automationTypes";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowRunSummary, WorkflowVersionSummary } from "../../shared/workflowTypes";
import type {
  WorkflowScheduleCreationModel,
  WorkflowScheduleGrantReadinessModel,
  WorkflowThreadScheduleItem,
  WorkflowThreadScheduleState,
} from "./workflowReviewUiModel";
import type { PermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import type { WorkflowPersistentStatusModel } from "./workflowPersistentStatusUiModel";
import {
  AutomationSchedulesFallbackPane,
  AutomationSchedulesPane,
  WorkflowFocusedSchedulesPane,
  WorkflowScheduleHistoryPanel,
  WorkflowScheduleOccurrenceEditor,
  WorkflowSchedulesWorkspace,
  datetimeLocalValueFromIso,
  defaultScheduleReplacementLocal,
  isoFromDatetimeLocalValue,
  scheduleTargetOptionsForType,
  workflowSchedulesPaneRouteModel,
  type AutomationScheduleTargetSources,
  type WorkflowScheduleOccurrenceEditorState,
} from "./AutomationsScheduleViews";

describe("Automations schedule views", () => {
  it("formats schedule occurrence datetime values through the moved helpers", () => {
    expect(datetimeLocalValueFromIso("not-a-date")).toBe("");
    expect(datetimeLocalValueFromIso("2026-06-14T10:00:00.000Z")).toMatch(/^2026-06-14T\d{2}:00$/);
    expect(isoFromDatetimeLocalValue("")).toBeUndefined();
    expect(isoFromDatetimeLocalValue("not-a-date")).toBeUndefined();
    expect(defaultScheduleReplacementLocal("not-a-date")).toBe("");
    expect(defaultScheduleReplacementLocal("2026-06-14T10:00:00.000Z", 60)).toMatch(/^2026-06-14T\d{2}:00$/);
  });

  it("renders the occurrence editor without owning schedule state", () => {
    const markup = renderToStaticMarkup(
      <WorkflowScheduleOccurrenceEditor
        schedule={schedule()}
        editor={occurrenceEditor()}
        scheduleBusy={false}
        onChangeEditor={() => undefined}
        onClose={() => undefined}
        onEditSeriesScope={() => undefined}
        onSave={() => undefined}
        onSkip={() => undefined}
      />,
    );

    expect(markup).toContain("Reschedule occurrence");
    expect(markup).toContain("This and following");
    expect(markup).toContain("One-off exception");
    expect(markup).toContain("Save one-off reschedule");
  });

  it("renders the generic schedule pane through explicit props", () => {
    const markup = renderToStaticMarkup(
      <AutomationSchedulesPane
        projectField={<label className="automation-field">Project field</label>}
        autoDispatchToggle={<button type="button">Auto-dispatch</button>}
        autoDispatchStatus={<p>Auto-dispatch ready</p>}
        scheduleTooltip="Schedule tooltip"
        autoDispatchTooltip="Auto-dispatch tooltip"
        schedules={[schedule()]}
        focusedSchedule={schedule()}
        focusedScheduleId="schedule-1"
        scheduleTargetType="workflow_thread"
        targetOptions={[{ id: "workflow-thread-1", label: "Nightly inbox workflow - latest approved v3" }]}
        selectedTarget={{ id: "workflow-thread-1", label: "Nightly inbox workflow - latest approved v3" }}
        schedulePreset="daily"
        scheduleExpression="0 9 * * *"
        scheduleEnabled
        scheduleBusy={false}
        scheduleError="Schedule warning"
        expandedScheduleHistoryId={undefined}
        workflowRuns={workflowRuns()}
        onScheduleTargetTypeChange={() => undefined}
        onScheduleTargetIdChange={() => undefined}
        onSchedulePresetChange={() => undefined}
        onScheduleExpressionChange={() => undefined}
        onScheduleEnabledChange={() => undefined}
        onSaveSchedule={() => undefined}
        onRefreshSchedules={() => undefined}
        onClearFocusedSchedule={() => undefined}
        onToggleScheduleHistoryExpanded={() => undefined}
        onOpenRunThread={() => undefined}
        onOpenRunDetail={() => undefined}
      />,
    );

    expect(markup).toContain("Schedules control when automation work is eligible");
    expect(markup).toContain("Workflow Agent (latest approved)");
    expect(markup).toContain("Nightly inbox workflow - latest approved v3");
    expect(markup).toContain("Save schedule");
    expect(markup).toContain("Saved Schedules");
    expect(markup).toContain("Focused from scheduled run");
    expect(markup).toContain("Open schedule thread");
    expect(markup).toContain("View 3");
    expect(markup).toContain("Run Failed");
    expect(markup).toContain("Schedule warning");
  });

  it("derives generic schedule targets inside the schedule owner", () => {
    const sources = scheduleTargetSources();

    expect(scheduleTargetOptionsForType("workflow_playbook", sources)).toEqual([
      { id: "playbook-1", label: "Research Recording - current v4" },
    ]);
    expect(scheduleTargetOptionsForType("workflow_thread", sources)).toEqual([
      { id: "workflow-thread-1", label: "Nightly inbox workflow - latest approved v3" },
    ]);
    expect(scheduleTargetOptionsForType("workflow_version", sources)).toEqual([
      { id: "version-3", label: "Nightly inbox workflow - pinned v3 (Approved)" },
    ]);
    expect(scheduleTargetOptionsForType("workflow_artifact", sources)).toEqual([
      { id: "artifact-1", label: "Inbox Workflow Artifact" },
    ]);
    expect(scheduleTargetOptionsForType("folder", sources)).toEqual([
      { id: "folder-1", label: "Ops" },
    ]);
    expect(scheduleTargetOptionsForType("local_task", sources)).toEqual([
      { id: "task-1", label: "LT-1: Review queue" },
    ]);
  });

  it("renders the fallback schedule pane with derived targets and focused schedule lookup", () => {
    const markup = renderToStaticMarkup(
      <AutomationSchedulesFallbackPane
        projectField={<label className="automation-field">Project field</label>}
        autoDispatchToggle={<button type="button">Auto-dispatch</button>}
        autoDispatchStatus={<p>Auto-dispatch ready</p>}
        scheduleTooltip="Schedule tooltip"
        autoDispatchTooltip="Auto-dispatch tooltip"
        schedules={[schedule(), { ...schedule(), id: "schedule-2", targetLabel: "Hidden schedule" }]}
        focusedScheduleId="schedule-1"
        scheduleTargetType="workflow_thread"
        scheduleTargetId="workflow-thread-1"
        targetSources={scheduleTargetSources()}
        schedulePreset="daily"
        scheduleExpression="0 9 * * *"
        scheduleEnabled
        scheduleBusy={false}
        scheduleError={undefined}
        expandedScheduleHistoryId={undefined}
        workflowRuns={workflowRuns()}
        onScheduleTargetTypeChange={() => undefined}
        onScheduleTargetIdChange={() => undefined}
        onSchedulePresetChange={() => undefined}
        onScheduleExpressionChange={() => undefined}
        onScheduleEnabledChange={() => undefined}
        onSaveSchedule={() => undefined}
        onRefreshSchedules={() => undefined}
        onClearFocusedSchedule={() => undefined}
        onToggleScheduleHistoryExpanded={() => undefined}
        onOpenRunThread={() => undefined}
        onOpenRunDetail={() => undefined}
      />,
    );

    expect(markup).toContain("Nightly inbox workflow - latest approved v3");
    expect(markup).toContain("Focused from scheduled run");
    expect(markup).toContain("Nightly inbox workflow");
    expect(markup).not.toContain("Hidden schedule");
  });

  it("routes schedule focus to workflow panes inside the schedule owner", () => {
    const thread = workflowThread();
    const artifact = workflowArtifact();
    const artifactWithoutThreadId = { ...artifact, workflowThreadId: undefined };
    const versionSchedule = { ...schedule(), targetKind: "workflow_version" as const, targetId: "version-3" };
    const versionRoute = workflowSchedulesPaneRouteModel({
      focusedScheduleId: versionSchedule.id,
      schedules: [versionSchedule],
      workflowVersions: workflowVersions(),
      artifactById: new Map([[artifact.id, artifactWithoutThreadId]]),
      workflowThreadById: new Map([[thread.id, thread]]),
      workflowThreadByArtifactId: new Map([[artifact.id, thread]]),
    });

    expect(versionRoute.focusedSchedule?.targetKind).toBe("workflow_version");
    expect(versionRoute.focusedWorkflowVersion?.id).toBe("version-3");
    expect(versionRoute.focusedWorkflowArtifact?.id).toBe(artifact.id);
    expect(versionRoute.focusedWorkflowThread?.id).toBe(thread.id);
    expect(versionRoute.workflowScheduleThread?.id).toBe(thread.id);
    expect(versionRoute.workflowScheduleArtifact?.id).toBe(artifact.id);

    const selectedThread = { ...thread, id: "selected-thread", activeArtifactId: "selected-artifact" };
    const selectedArtifact = { ...artifact, id: "selected-artifact", workflowThreadId: "selected-thread" };
    const selectedRoute = workflowSchedulesPaneRouteModel({
      selectedWorkflowThread: selectedThread,
      selectedWorkflowArtifact: selectedArtifact,
      focusedScheduleId: versionSchedule.id,
      schedules: [versionSchedule],
      workflowVersions: workflowVersions(),
      artifactById: new Map([
        [artifact.id, artifact],
        [selectedArtifact.id, selectedArtifact],
      ]),
      workflowThreadById: new Map([
        [thread.id, thread],
        [selectedThread.id, selectedThread],
      ]),
    });

    expect(selectedRoute.focusedWorkflowThread?.id).toBe(thread.id);
    expect(selectedRoute.workflowScheduleThread?.id).toBe(selectedThread.id);
    expect(selectedRoute.workflowScheduleArtifact?.id).toBe(selectedArtifact.id);
  });

  it("renders the workflow schedules workspace through explicit owner props", () => {
    const markup = renderToStaticMarkup(
      <WorkflowSchedulesWorkspace
        threadId="workflow-thread-1"
        artifactManifest={{ maxRunMs: 600_000 }}
        creation={workflowScheduleCreation()}
        scheduleState={workflowScheduleState()}
        grantReadiness={workflowScheduleGrantReadiness()}
        workflowGrantRegistry={permissionGrantRegistry()}
        persistentStatus={workflowPersistentStatus()}
        activePanel="schedules-overview"
        focusedScheduleId={undefined}
        schedulePreset="daily"
        scheduleExpression="0 9 * * *"
        scheduleEnabled
        scheduleRunIdleTimeoutMs={120_000}
        scheduleRunTotalLimitMode="manifest"
        scheduleBusy={false}
        scheduleError={undefined}
        schedules={[schedule()]}
        scheduleExceptions={[scheduleException()]}
        expandedScheduleHistoryId={undefined}
        workflowBusy={undefined}
        occurrenceEditor={undefined}
        onSetPanel={() => undefined}
        onCreateNewSeries={() => undefined}
        onSetScheduleTarget={() => undefined}
        onSetSchedulePreset={() => undefined}
        onSetScheduleExpression={() => undefined}
        onSetScheduleEnabled={() => undefined}
        onSetScheduleRunIdleTimeoutMs={() => undefined}
        onSetScheduleRunTotalLimitMode={() => undefined}
        onSetScheduleEditScope={() => undefined}
        onSaveSchedule={() => undefined}
        onRefreshSchedules={() => undefined}
        onSetExpandedScheduleHistoryId={() => undefined}
        onCreateScheduleGrant={() => undefined}
        onChangeOccurrenceEditor={() => undefined}
        onCloseOccurrenceEditor={() => undefined}
        onEditOccurrenceSeriesScope={() => undefined}
        onSaveOccurrenceEditor={() => undefined}
        onSkipOccurrence={() => undefined}
        onOpenOccurrenceEditor={() => undefined}
        onDeferOccurrence={() => undefined}
        onUpdateOccurrenceRunLimits={() => undefined}
        onEditSchedule={() => undefined}
        onDuplicateSchedule={() => undefined}
        onOpenRunDetail={() => undefined}
        onCreateGrantAction={() => undefined}
        onOpenPersistentStatusTarget={() => undefined}
      />,
    );

    expect(markup).toContain("Workflow schedules are edited in the context of this thread");
    expect(markup).toContain("Workflow is ready");
    expect(markup).toContain("Latest approved");
    expect(markup).toContain("Use manifest cap");
    expect(markup).toContain("Idle timeout 2 min; manifest total cap 10 min.");
    expect(markup).toContain("Create schedule");
  });

  it("renders the focused workflow schedule pane with owner-computed models", () => {
    const markup = renderToStaticMarkup(
      <WorkflowFocusedSchedulesPane
        thread={workflowThread()}
        artifact={workflowArtifact()}
        state={{
          activePanel: "schedules-overview",
          versions: workflowVersions(),
          workflowRuns: workflowRuns(),
          selectedDetail: undefined,
          schedules: [schedule()],
          scheduleExceptions: [scheduleException()],
          permissionGrants: [],
          permissionAudit: [],
          permissionMode: "workspace",
          auditThreadId: "thread-1",
          workspacePath: "/workspace",
          scheduleTargetType: "workflow_thread",
          scheduleTargetId: "workflow-thread-1",
          schedulePreset: "daily",
          scheduleExpression: "0 9 * * *",
          scheduleEnabled: true,
          scheduleRunIdleTimeoutMs: 120_000,
          scheduleRunTotalLimitMode: "manifest",
          scheduleRunLimits: { idleTimeoutMs: 120_000, maxRunMs: 600_000 },
          scheduleBusy: false,
          scheduleError: undefined,
          focusedScheduleId: undefined,
          scheduleEditScope: "all_occurrences",
          expandedScheduleHistoryId: undefined,
          occurrenceEditor: undefined,
          workflowBusy: undefined,
          workflowCompileThreadId: undefined,
          workflowCompileProgress: [],
          workflowDiscoveryBusy: undefined,
        }}
        slots={{
          layoutStyle: {},
          splitHandle: <div>Split handle slot</div>,
          diagramPane: <section>Diagram pane slot</section>,
        }}
        actions={{
          onSetPanel: () => undefined,
          onCreateNewSeries: () => undefined,
          onSetScheduleTarget: () => undefined,
          onSetSchedulePreset: () => undefined,
          onSetScheduleExpression: () => undefined,
          onSetScheduleEnabled: () => undefined,
          onSetScheduleRunIdleTimeoutMs: () => undefined,
          onSetScheduleRunTotalLimitMode: () => undefined,
          onSetScheduleEditScope: () => undefined,
          onSaveSchedule: () => undefined,
          onRefreshSchedules: () => undefined,
          onSetExpandedScheduleHistoryId: () => undefined,
          onCreateScheduleGrant: () => undefined,
          onChangeOccurrenceEditor: () => undefined,
          onCloseOccurrenceEditor: () => undefined,
          onEditOccurrenceSeriesScope: () => undefined,
          onSaveOccurrenceEditor: () => undefined,
          onSkipOccurrence: () => undefined,
          onOpenOccurrenceEditor: () => undefined,
          onDeferOccurrence: () => undefined,
          onUpdateOccurrenceRunLimits: () => undefined,
          onEditSchedule: () => undefined,
          onDuplicateSchedule: () => undefined,
          onOpenRunDetail: () => undefined,
          onCreateGrantAction: () => undefined,
          onOpenPersistentStatusTarget: () => undefined,
        }}
      />,
    );

    expect(markup).toContain("Workflow schedules are edited in the context of this thread");
    expect(markup).toContain("Workflow is ready");
    expect(markup).toContain("Latest approved");
    expect(markup).toContain("No persistent grants required");
    expect(markup).toContain("Split handle slot");
    expect(markup).toContain("Diagram pane slot");
  });

  it("renders schedule history rows, occurrence editor, and exception ledger", () => {
    const markup = renderToStaticMarkup(
      <WorkflowScheduleHistoryPanel
        schedules={[scheduleItem()]}
        rawSchedules={[schedule()]}
        scheduleExceptions={[scheduleException()]}
        expandedScheduleHistoryId={undefined}
        scheduleBusy={false}
        workflowBusy={undefined}
        scheduleRunIdleTimeoutMs={30_000}
        occurrenceEditor={occurrenceEditor()}
        onSetExpandedScheduleHistoryId={() => undefined}
        onCreateGrant={() => undefined}
        onChangeOccurrenceEditor={() => undefined}
        onCloseOccurrenceEditor={() => undefined}
        onEditOccurrenceSeriesScope={() => undefined}
        onSaveOccurrenceEditor={() => undefined}
        onSkipOccurrence={() => undefined}
        onOpenOccurrenceEditor={() => undefined}
        onDeferOccurrence={() => undefined}
        onUpdateOccurrenceRunLimits={() => undefined}
        onEditSchedule={() => undefined}
        onDuplicateSchedule={() => undefined}
        onOpenRunDetail={() => undefined}
        onRefreshSchedules={() => undefined}
      />,
    );

    expect(markup).toContain("Scheduled run history");
    expect(markup).toContain("Nightly inbox workflow");
    expect(markup).toContain("View 4");
    expect(markup).toContain("Run succeeded");
    expect(markup).toContain("Exception ledger");
    expect(markup).toContain("Skipped occurrence");
    expect(markup).toContain("No cap next");
    expect(markup).toContain("10 min cap next");
  });
});

function schedule(): AutomationScheduleSummary {
  return {
    id: "schedule-1",
    targetKind: "workflow_thread",
    targetId: "workflow-thread-1",
    targetLabel: "Nightly inbox workflow",
    preset: "daily",
    timezone: "America/Phoenix",
    enabled: true,
    skipIfActive: true,
    concurrencyPolicy: "skip_if_active",
    nextRunAt: "2026-06-14T10:00:00.000Z",
    dedicatedThreadId: "thread-1",
    runLimits: { idleTimeoutMs: 30_000, maxRunMs: 600_000 },
    createdAt: "2026-06-13T10:00:00.000Z",
    updatedAt: "2026-06-13T10:00:00.000Z",
  };
}

function scheduleTargetSources(): AutomationScheduleTargetSources {
  return {
    workflowRecordingLibrary: [
      { id: "playbook-1", title: "Research Recording", version: 4, enabled: true },
      { id: "playbook-archived", title: "Archived Recording", version: 2, enabled: false },
    ],
    workflowArtifacts: [{ id: "artifact-1", title: "Inbox Workflow Artifact" }],
    workflowAgentFolders: [
      {
        threads: [
          {
            id: "workflow-thread-1",
            title: "Nightly inbox workflow",
            latestVersion: { id: "version-3", version: 3, status: "approved" },
          },
          {
            id: "workflow-thread-draft",
            title: "Draft workflow",
            latestVersion: { id: "version-draft", version: 1, status: "ready_for_review" },
          },
        ],
      },
    ],
    folders: [{ id: "folder-1", name: "Ops" }],
    tasks: [{ id: "task-1", identifier: "LT-1", title: "Review queue" }],
  };
}

function workflowThread(): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "workflow-folder-1",
    projectName: "Ambient",
    projectPath: "/workspace",
    title: "Nightly inbox workflow",
    phase: "approved",
    initialRequest: "Summarize the inbox every morning.",
    preview: "Inbox summary workflow",
    status: "ready",
    traceMode: "production",
    activeArtifactId: "artifact-1",
    latestVersion: workflowVersions()[0],
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-13T10:00:00.000Z",
    updatedAt: "2026-06-13T10:00:00.000Z",
  };
}

function workflowArtifact(): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "workflow-thread-1",
    title: "Inbox Workflow Artifact",
    status: "approved",
    manifest: {
      tools: [],
      mutationPolicy: "read_only",
      maxRunMs: 600_000,
      connectors: [],
      ambientCliCapabilities: [],
    },
    spec: {
      goal: "Summarize inbox.",
    },
    sourcePath: "/workspace/inbox.workflow.md",
    statePath: "/workspace/.ambient/workflows/inbox.json",
    createdAt: "2026-06-13T10:00:00.000Z",
    updatedAt: "2026-06-13T10:00:00.000Z",
  };
}

function workflowVersions(): WorkflowVersionSummary[] {
  return [
    {
      id: "version-3",
      workflowThreadId: "workflow-thread-1",
      artifactId: "artifact-1",
      version: 3,
      sourcePath: "/workspace/inbox.workflow.md",
      repoPath: "/workspace",
      status: "approved",
      createdBy: "compiler",
      createdAt: "2026-06-13T10:00:00.000Z",
    },
  ];
}

function workflowScheduleCreation(): WorkflowScheduleCreationModel {
  return {
    title: "Create schedule",
    detail: "Create an unattended schedule for this workflow thread or pin one approved version.",
    targetChoices: [
      {
        id: "latest-approved",
        mode: "latest_approved",
        targetKind: "workflow_thread",
        targetId: "workflow-thread-1",
        label: "Latest approved",
        detail: "Follows future approvals. Currently runs v3.",
        badge: "v3",
        selected: true,
        disabled: false,
      },
      {
        id: "pinned-version",
        mode: "pinned_version",
        targetKind: "workflow_version",
        targetId: "version-3",
        label: "Pin this version",
        detail: "Keeps running v3 until this schedule is edited.",
        badge: "v3",
        selected: false,
        disabled: false,
      },
    ],
    selectedTarget: {
      id: "latest-approved",
      mode: "latest_approved",
      targetKind: "workflow_thread",
      targetId: "workflow-thread-1",
      label: "Latest approved",
      detail: "Follows future approvals. Currently runs v3.",
      badge: "v3",
      selected: true,
      disabled: false,
    },
    recurrenceLabel: "Daily at 9:00",
    recurrenceDetail: "Preset recurrence",
    nextRunLabel: "Next run tomorrow",
    stateLabel: "Enabled",
    timezoneLabel: "America/Phoenix",
    runLimitLabel: "Manifest cap",
    runLimitDetail: "Uses the generated workflow cap.",
    editScopeChoices: [
      {
        id: "all_occurrences",
        label: "All occurrences",
        detail: "Create a new schedule series.",
        selected: true,
        disabled: false,
      },
    ],
    previewRows: [
      {
        label: "Target",
        value: "Latest approved",
        detail: "Follows future approvals. Currently runs v3.",
        tone: "ready",
      },
      {
        label: "Repeats",
        value: "Daily at 9:00",
        detail: "Next run tomorrow",
        tone: "ready",
      },
      {
        label: "Run limits",
        value: "Manifest cap",
        detail: "Uses the generated workflow cap.",
        tone: "neutral",
      },
    ],
    canSave: true,
    saveLabel: "Create schedule",
    saveTitle: "Save this workflow schedule.",
  };
}

function workflowScheduleState(): WorkflowThreadScheduleState {
  return {
    schedules: [scheduleItem()],
    canScheduleLatestApproved: true,
    latestApprovedVersionLabel: "v3",
    canPinCurrentVersion: true,
    currentVersionId: "version-3",
    currentVersionLabel: "v3",
  };
}

function workflowScheduleGrantReadiness(): WorkflowScheduleGrantReadinessModel {
  return {
    title: "Schedule grants",
    detail: "This workflow does not request connector reads.",
    tone: "ready",
    summary: "No persistent grants required.",
    rows: [],
    tiles: [
      {
        id: "ready",
        label: "Ready",
        value: "1",
        detail: "No grants required.",
        tone: "ready",
      },
    ],
    fullAccessReceiptCount: 0,
  };
}

function permissionGrantRegistry(): PermissionGrantRegistryModel {
  return {
    rows: [],
    groups: [],
    fullAccessReceipts: [],
    activeCount: 0,
    revokedCount: 0,
    expiringCount: 0,
    highRiskCount: 0,
    totalAuditCount: 0,
    fullAccessReceiptCount: 0,
    summary: "No persistent permission grants yet.",
  };
}

function workflowPersistentStatus(): WorkflowPersistentStatusModel {
  return {
    tone: "ready",
    title: "Workflow is ready",
    detail: "Approved workflow can run or be scheduled.",
    badges: ["Approved", "v3"],
  };
}

function workflowRuns(): WorkflowRunSummary[] {
  return Array.from({ length: 3 }, (_, index) => ({
    id: `run-${index + 1}`,
    artifactId: "artifact-1",
    status: index === 0 ? "succeeded" : "failed",
    startedAt: `2026-06-14T10:0${index}:00.000Z`,
    updatedAt: `2026-06-14T10:1${index}:00.000Z`,
    completedAt: `2026-06-14T10:2${index}:00.000Z`,
    error: index === 0 ? undefined : "Provider timeout",
    scheduledBy: {
      scheduleId: "schedule-1",
      targetKind: "workflow_thread",
      targetId: "workflow-thread-1",
      outcome: "started",
    },
  }));
}

function occurrenceEditor(): WorkflowScheduleOccurrenceEditorState {
  return {
    scheduleId: "schedule-1",
    occurrenceAt: "2026-06-14T10:00:00.000Z",
    replacementLocal: "2026-06-14T11:00",
    reason: "Operator delay",
  };
}

function scheduleException(): AutomationScheduleExceptionSummary {
  return {
    id: "exception-1",
    scheduleId: "schedule-1",
    occurrenceAt: "2026-06-14T10:00:00.000Z",
    exceptionKind: "skip",
    status: "pending",
    reason: "Operator delay",
    createdAt: "2026-06-13T10:00:00.000Z",
    updatedAt: "2026-06-13T10:00:00.000Z",
  };
}

function scheduleItem(): WorkflowThreadScheduleItem {
  return {
    id: "schedule-1",
    mode: "latest_approved",
    statusLabel: "Active",
    targetLabel: "Nightly inbox workflow",
    cadenceLabel: "Daily",
    nextRunLabel: "Next 2026-06-14T10:00:00.000Z",
    versionLabel: "v3",
    driftLabel: "Current",
    driftTone: "ready",
    dispatchLabel: "Dispatchable",
    dispatchTone: "ready",
    grantLabel: "Connector grants ready",
    grantDetail: "1 persistent grant",
    recentRuns: Array.from({ length: 4 }, (_, index) => ({
      id: `run-${index + 1}`,
      statusLabel: index === 0 ? "Run succeeded" : "Run failed",
      detail: `Updated 2026-06-14T10:0${index}:00.000Z`,
      tone: index === 0 ? "ready" : "blocked",
      actionLabel: "Open run",
      actionTitle: "Open scheduled run",
    })),
    latestRunId: "run-1",
    latestRunActionLabel: "Open latest run",
    latestRunActionTitle: "Open the latest scheduled run.",
  };
}
