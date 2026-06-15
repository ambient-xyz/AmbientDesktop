import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AutomationThreadSummary, WorkflowAgentThreadSummary } from "../../shared/types";
import { workflowRecorderStartActionState, workflowRecorderSurfaceModel } from "./workflowRecorderUiModel";
import type { WorkflowThreadTranscriptCard } from "./workflowThreadTranscriptUiModel";
import {
  AutomationFolderPane,
  AutomationHomePane,
  AutomationHomeStatusGrid,
  AutomationRunsReviewsPane,
  AutomationThreadCardGrid,
  AutomationThreadStatusGrid,
  AutomationExplainer,
  WorkflowAgentCompilerStartPane,
  WorkflowLegacyHiddenPane,
  WorkflowRecorderStartPane,
  WorkflowRuntimeBrowserScreenshotPreview,
  WorkflowThreadTranscript,
  automationIndicatorKind,
  automationThreadStatusGroups,
} from "./AutomationsWorkflowUtilityViews";

describe("Automations workflow utility views", () => {
  it("renders automation thread cards with route detail and empty state through explicit props", () => {
    const markup = renderToStaticMarkup(
      <AutomationThreadCardGrid
        threads={[
          automationThread({ id: "workflow-1", kind: "workflow_artifact", title: "Run invoice workflow", status: "running" }),
          automationThread({ id: "task-1", kind: "orchestration_task", title: "Clean workspace", status: "paused" }),
        ]}
        emptyText="No automations yet."
        routeDetailForThread={(thread) => (thread.kind === "workflow_artifact" ? "Open workflow route" : undefined)}
        onOpenThread={() => undefined}
      />,
    );
    const emptyMarkup = renderToStaticMarkup(
      <AutomationThreadCardGrid threads={[]} emptyText="No automations yet." onOpenThread={() => undefined} />,
    );

    expect(markup).toContain("automation-thread-grid");
    expect(markup).toContain("Run invoice workflow");
    expect(markup).toContain("title=\"Open workflow route\"");
    expect(markup).toContain("Running · Project Alpha");
    expect(markup).toContain("Clean workspace");
    expect(markup).toContain("Paused · Project Alpha");
    expect(emptyMarkup).toContain("No automations yet.");
  });

  it("groups automation threads and renders status sections without owning routing state", () => {
    const threads = [
      automationThread({ id: "running", status: "claimed", title: "Claimed task" }),
      automationThread({ id: "review", status: "ready_for_preview", title: "Review task" }),
      automationThread({ id: "review-flag", status: "completed", title: "Manual review", needsReview: true }),
      automationThread({ id: "failed", status: "failed", title: "Failed task" }),
      automationThread({ id: "completed", status: "approved", title: "Approved task" }),
    ];
    const groups = automationThreadStatusGroups(threads);
    const markup = renderToStaticMarkup(
      <AutomationThreadStatusGrid
        sections={[
          { id: "running", label: "Running Now", tooltip: "Running tooltip", threads: groups.running, emptyText: "No running." },
          { id: "review", label: "Needs Review", tooltip: "Review tooltip", threads: groups.review, emptyText: "No review." },
          { id: "failed", label: "Failed", tooltip: "Failed tooltip", threads: groups.failed, emptyText: "No failed." },
          { id: "completed", label: "Completed", tooltip: "Completed tooltip", threads: groups.completed, emptyText: "No completed." },
        ]}
        onOpenThread={() => undefined}
      />,
    );

    expect(groups.running.map((thread) => thread.id)).toEqual(["running"]);
    expect(groups.review.map((thread) => thread.id)).toEqual(["review", "review-flag"]);
    expect(groups.failed.map((thread) => thread.id)).toEqual(["failed"]);
    expect(groups.completed.map((thread) => thread.id)).toEqual(["completed"]);
    expect(markup).toContain("automation-status-grid");
    expect(markup).toContain("Running Now");
    expect(markup).toContain("Needs Review");
    expect(markup).toContain("Failed");
    expect(markup).toContain("Completed");
    expect(markup).toContain("Manual review");
  });

  it("renders the home automation status grid with fixed section copy", () => {
    const groups = automationThreadStatusGroups([
      automationThread({ id: "running", status: "running", title: "Running task" }),
      automationThread({ id: "failed", status: "failed", title: "Failed task" }),
    ]);
    const markup = renderToStaticMarkup(
      <AutomationHomeStatusGrid
        groups={groups}
        reviewTooltip="Review tooltip"
        onOpenThread={() => undefined}
      />,
    );

    expect(markup).toContain("Running Now");
    expect(markup).toContain("Running task");
    expect(markup).toContain("Needs Review");
    expect(markup).toContain("No automations need review.");
    expect(markup).toContain("Recently Failed");
    expect(markup).toContain("Failed task");
    expect(markup).toContain("Recently Completed");
    expect(markup).toContain("No recent completions.");
  });

  it("renders the automation home pane shortcuts, playbook slot, and status grid", () => {
    const groups = automationThreadStatusGroups([
      automationThread({ id: "running", status: "running", title: "Running workflow" }),
      automationThread({ id: "review", status: "needs_input", title: "Needs input workflow" }),
    ]);
    const markup = renderToStaticMarkup(
      <AutomationHomePane
        homeExplainer={["Home explainer one.", "Home explainer two."]}
        legacyCompilerEnabled={false}
        newWorkflowLabel="New Workflow Recording"
        threadGroups={groups}
        reviewTooltip="Review tooltip"
        playbookLibrary={<section className="playbook-slot">Playbook library slot</section>}
        onOpenThread={() => undefined}
        onSelectPane={() => undefined}
      />,
    );

    expect(markup).toContain("Home explainer one.");
    expect(markup).toContain("New Local Task");
    expect(markup).toContain("New Workflow Recording");
    expect(markup).toContain("Workflow Lab");
    expect(markup).toContain("Schedule Work");
    expect(markup).toContain("Runs And Reviews");
    expect(markup).toContain("Playbook library slot");
    expect(markup).toContain("Running Now");
    expect(markup).toContain("Running workflow");
    expect(markup).toContain("Needs Review");
    expect(markup).toContain("Needs input workflow");
  });

  it("renders the runs and reviews pane from grouped threads and run slots", () => {
    const groups = automationThreadStatusGroups([
      automationThread({ id: "running", status: "claimed", title: "Running workflow" }),
      automationThread({ id: "review", status: "ready_for_preview", title: "Review workflow" }),
      automationThread({ id: "failed", status: "failed", title: "Failed workflow" }),
    ]);
    const markup = renderToStaticMarkup(
      <AutomationRunsReviewsPane
        threadGroups={groups}
        reviewTooltip="Review tooltip"
        localTaskRuns={<div className="local-run-slot">Local task run slot</div>}
        workflowRuns={<div className="workflow-run-slot">Workflow run slot</div>}
        workflowConsole={<section className="console-slot">Workflow console slot</section>}
        onOpenThread={() => undefined}
      />,
    );

    expect(markup).toContain("Runs show what actually happened.");
    expect(markup).toContain("Running Now");
    expect(markup).toContain("Running workflow");
    expect(markup).toContain("Needs Review");
    expect(markup).toContain("Review workflow");
    expect(markup).toContain("Local Task Runs");
    expect(markup).toContain("Local task run slot");
    expect(markup).toContain("Workflow Runs");
    expect(markup).toContain("Workflow run slot");
    expect(markup).toContain("Failed");
    expect(markup).toContain("Failed workflow");
    expect(markup).toContain("Workflow console slot");
  });

  it("renders the folder pane shell while delegating task board state", () => {
    const markup = renderToStaticMarkup(
      <AutomationFolderPane
        folderName="Launch"
        legacyCompilerEnabled={false}
        localTasksTooltip="Local task tooltip"
        threads={[automationThread({ id: "workflow-1", kind: "workflow_artifact", title: "Legacy workflow", status: "completed" })]}
        taskBoard={<section className="task-board-slot">Task board slot</section>}
        routeDetailForThread={(thread) => (thread.kind === "workflow_artifact" ? "Open workflow route" : undefined)}
        onOpenThread={() => undefined}
      />,
    );

    expect(markup).toContain("Launch groups workflow and local-task threads");
    expect(markup).toContain("Selecting a legacy workflow thread shows the hidden-legacy notice.");
    expect(markup).toContain("Legacy workflow");
    expect(markup).toContain("title=\"Open workflow route\"");
    expect(markup).toContain("Local Tasks");
    expect(markup).toContain("Local task tooltip");
    expect(markup).toContain("Task board slot");
  });

  it("renders Workflow Agent start surfaces through explicit slots and action props", () => {
    const recorderSurface = workflowRecorderSurfaceModel({ legacyCompilerEnabled: false });
    const compilerSurface = workflowRecorderSurfaceModel({ legacyCompilerEnabled: true });
    const recorderMarkup = renderToStaticMarkup(
      <WorkflowRecorderStartPane
        recorder={recorderSurface.startPane}
        workflowAgentTooltip="Workflow tooltip"
        workflowRequest="Find weekly churn signals"
        workflowError="Recorder error"
        recorderStartBusy={false}
        recorderStartAction={workflowRecorderStartActionState({
          request: "Find weekly churn signals",
          readyTitle: recorderSurface.startPane.disabledStartTitle,
        })}
        projectField={<div className="project-slot">Project slot</div>}
        onWorkflowRequestChange={() => undefined}
        onStartRecording={() => undefined}
      />,
    );
    const hiddenMarkup = renderToStaticMarkup(
      <WorkflowLegacyHiddenPane
        thread={workflowThread({ title: "Legacy workflow", status: "paused", phase: "running" })}
        hidden={recorderSurface.legacyHidden}
        primaryCreateLabel={recorderSurface.primaryCreateLabel}
        workflowAgentTooltip="Workflow tooltip"
      />,
    );
    const compilerMarkup = renderToStaticMarkup(
      <WorkflowAgentCompilerStartPane
        workflowRequest="Compile reports"
        workflowError="Compile error"
        workflowBusy="sample"
        workflowAgentTooltip="Workflow tooltip"
        startDiscoveryBusy={true}
        discoveryDisabled={false}
        compileAction={{ label: "Compile workflow", disabled: false, title: "Compile title" }}
        revisionSourceTitle="Revenue workflow"
        projectField={<div className="project-slot">Project slot</div>}
        compileActivity={<section className="compile-activity-slot">Compile activity slot</section>}
        onWorkflowRequestChange={() => undefined}
        onRefreshDashboard={() => undefined}
        onCreateSample={() => undefined}
        onStartDiscovery={() => undefined}
        onCompile={() => undefined}
        onClearRevision={() => undefined}
      />,
    );

    expect(recorderMarkup).toContain("Recorder default");
    expect(recorderMarkup).toContain("Legacy compiler hidden");
    expect(recorderMarkup).toContain("Project slot");
    expect(recorderMarkup).toContain("Find weekly churn signals");
    expect(recorderMarkup).toContain("Creates a normal chat, marks it recording");
    expect(recorderMarkup).toContain("Recorder error");
    expect(hiddenMarkup).toContain("Legacy workflow");
    expect(hiddenMarkup).toContain("How to inspect legacy artifacts");
    expect(hiddenMarkup).toContain("Recommended path");
    expect(compilerMarkup).toContain("New Workflow");
    expect(compilerMarkup).toContain("Creating");
    expect(compilerMarkup).toContain("Start discovery");
    expect(compilerMarkup).toContain("Compile workflow");
    expect(compilerMarkup).toContain("Revision draft from");
    expect(compilerMarkup).toContain("Revenue workflow");
    expect(compilerMarkup).toContain("Compile activity slot");
    expect(compilerMarkup).toContain("Compile error");
  });

  it("renders workflow transcript cards with panel and revision actions", () => {
    const markup = renderToStaticMarkup(
      <WorkflowThreadTranscript
        cards={[transcriptCard()]}
        workflowBusy="revision:revision-1:applied"
        onOpenPanel={() => undefined}
        onResolveRevision={() => undefined}
      />,
    );

    expect(markup).toContain("Workflow Chat");
    expect(markup).toContain("Review update");
    expect(markup).toContain("Ready for PM review.");
    expect(markup).toContain("data-panel-action-target=\"source\"");
    expect(markup).toContain("Apply revision");
    expect(markup).toContain("Reject proposal");
    expect(markup).toContain("+ Add acceptance criteria");
  });

  it("renders the transcript empty state and explainer paragraphs", () => {
    const transcriptMarkup = renderToStaticMarkup(<WorkflowThreadTranscript cards={[]} emptyDetail="No cards yet." />);
    const explainerMarkup = renderToStaticMarkup(<AutomationExplainer paragraphs={["First paragraph.", "Second paragraph."]} />);

    expect(transcriptMarkup).toContain("No workflow chat yet");
    expect(transcriptMarkup).toContain("No cards yet.");
    expect(explainerMarkup).toContain("First paragraph.");
    expect(explainerMarkup).toContain("Second paragraph.");
  });

  it("renders screenshot preview loading state with explicit artifact path callbacks", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRuntimeBrowserScreenshotPreview
        artifactPath="artifacts/screenshot.png"
        onPreviewPath={() => undefined}
        onOpenMediaModal={() => undefined}
      />,
    );

    expect(markup).toContain("workflow-runtime-browser-screenshot loading");
    expect(markup).toContain("Loading screenshot preview");
  });

  it("maps automation statuses to indicator kinds", () => {
    expect(automationIndicatorKind("running")).toBe("running");
    expect(automationIndicatorKind("failed")).toBe("error");
    expect(automationIndicatorKind("paused")).toBe("awaiting");
    expect(automationIndicatorKind("completed")).toBe("idle");
  });
});

function transcriptCard(): WorkflowThreadTranscriptCard {
  return {
    id: "card-1",
    kind: "revision",
    tone: "success",
    title: "Review update",
    detail: "Ready for PM review.",
    timestamp: "2026-06-14T10:00:00.000Z",
    badges: ["v2", "approved"],
    detailItems: ["Evidence captured"],
    sourcePreviewLines: [{ kind: "added", text: "+ Add acceptance criteria" }],
    panelActions: [{ id: "source", label: "Source", panel: "source" }],
    revisionId: "revision-1",
    revisionCanApply: true,
    revisionCanReject: true,
  };
}

function automationThread(overrides: Partial<AutomationThreadSummary> = {}): AutomationThreadSummary {
  return {
    id: "thread-1",
    folderId: "home",
    kind: "orchestration_task",
    sourceId: "task-1",
    title: "Automation thread",
    preview: "Thread preview.",
    status: "running",
    projectName: "Project Alpha",
    projectPath: "/repo/project-alpha",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:05:00.000Z",
    badges: [],
    ...overrides,
  };
}

function workflowThread(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "folder-1",
    projectName: "Project Alpha",
    projectPath: "/tmp/project-alpha",
    title: "Workflow thread",
    phase: "discovery",
    initialRequest: "Build a workflow",
    preview: "Workflow preview.",
    status: "running",
    traceMode: "production",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:05:00.000Z",
    ...overrides,
  };
}
