import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowRunDetail, WorkflowRunSummary } from "../../shared/types";
import type { WorkflowPersistentStatusModel } from "./workflowPersistentStatusUiModel";
import type { WorkflowRuntimeInputCard } from "./workflowRuntimeInputUiModel";
import {
  WorkflowFocusedRunsPane,
  WorkflowPersistentStatusView,
  WorkflowRunCards,
  WorkflowRunConsole,
  WorkflowThreadRunsWorkspace,
  WorkflowRuntimeInputPanel,
} from "./AutomationsWorkflowRuntimeViews";

describe("Automations workflow runtime views", () => {
  it("renders persistent status actions through the moved owner", () => {
    const model: WorkflowPersistentStatusModel = {
      tone: "blocked",
      title: "Workflow blocked",
      detail: "Runtime input is waiting for a user decision.",
      badges: ["Needs input", "Request input-1"],
      action: {
        label: "Open input",
        title: "Jump to the runtime input panel.",
        target: "runs-input",
      },
    };

    const markup = renderToStaticMarkup(
      <WorkflowPersistentStatusView threadId="workflow-thread-1" model={model} onOpenTarget={() => undefined} />,
    );

    expect(markup).toContain("workflow-persistent-status blocked");
    expect(markup).toContain("Workflow blocked");
    expect(markup).toContain("Runtime input is waiting for a user decision.");
    expect(markup).toContain("Open input");
  });

  it("renders runtime input choices, browser evidence, and attached context", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRuntimeInputPanel
        detail={detail()}
        cards={[runtimeInputCard()]}
        workflowBusy="resume:run-1"
        onAnswerInput={() => undefined}
        onRevealBrowser={() => undefined}
        onPreviewPath={() => undefined}
        onOpenMediaModal={() => undefined}
      />,
    );

    expect(markup).toContain("Workflow needs input");
    expect(markup).toContain("Browser needs user action");
    expect(markup).toContain("Open managed browser");
    expect(markup).toContain("Browser evidence");
    expect(markup).toContain("workflow-runtime-browser-screenshot loading");
    expect(markup).toContain("Attached context");
    expect(markup).toContain("artifacts/input.json");
    expect(markup).toContain("I completed it");
    expect(markup).toContain("Resuming");
  });

  it("renders workflow run cards without owning run commands", () => {
    const artifact = workflowArtifact();
    const markup = renderToStaticMarkup(
      <WorkflowRunCards
        runs={[workflowRun()]}
        artifactById={new Map([[artifact.id, artifact]])}
        workflowBusy="run-1"
        onOpenRunDetail={() => undefined}
        onOpenSchedule={() => undefined}
        onResumeRun={() => undefined}
      />,
    );

    expect(markup).toContain("run-dashboard flush");
    expect(markup).toContain("Nightly workflow");
    expect(markup).toContain("Needs Input");
    expect(markup).toContain("Scheduled");
    expect(markup).toContain("Version version-2");
    expect(markup).toContain("Existing Grant");
    expect(markup).toContain("Runtime stopped for review.");
    expect(markup).toContain("Opening");
    expect(markup).toContain("Schedule");
    expect(markup).toContain("Resume");
  });

  it("renders the workflow run console without owning run commands", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRunConsole
        detail={workflowRunConsoleDetail()}
        compact
        workflowBusy="resume:run-1"
        onCancelRun={() => undefined}
        onResumeRun={() => undefined}
        onClose={() => undefined}
        onResumeTotalRuntimePause={() => undefined}
        onResolveApproval={() => undefined}
      />,
    );

    expect(markup).toContain("Run Console");
    expect(markup).toContain("Paused");
    expect(markup).toContain("1 events");
    expect(markup).toContain("1 checkpoints");
    expect(markup).toContain("1 review items");
    expect(markup).toContain("Resuming");
    expect(markup).toContain("Total runtime limit reached");
    expect(markup).toContain("Resume this run with only the stream-idle timeout active.");
    expect(markup).toContain("Program");
    expect(markup).toContain("source retained");
    expect(markup).toContain("Review Queue");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Reject");
    expect(markup).toContain("checkpoint-output");
    expect(markup).toContain("# Audit");
  });

  it("renders the workflow thread runs workspace through the runtime owner", () => {
    const artifact = workflowArtifact();
    const run = workflowRun();
    const markup = renderToStaticMarkup(
      <WorkflowThreadRunsWorkspace
        thread={workflowThread()}
        artifact={artifact}
        dashboard={{ artifacts: [artifact], runs: [run] }}
        selectedDetail={workflowRunConsoleDetail()}
        activePanelId="runs-events"
        layoutStyle={{ "--workflow-split-primary": "58%" }}
        splitHandle={<div className="split-fixture" />}
        diagramPane={<aside>Diagram fixture</aside>}
        artifactById={new Map([[artifact.id, artifact]])}
        persistentStatus={{
          tone: "running",
          title: "Workflow running",
          detail: "The latest run is still producing evidence.",
          badges: ["Running"],
        }}
        workflowBusy="run-1"
        runLimitsForArtifact={() => ({ idleTimeoutMs: 30_000 })}
        isArtifactRunBlocked={() => false}
        auditReportPreview={(value) => value ?? ""}
        onOpenPersistentStatusTarget={() => undefined}
        onSelectPanel={() => undefined}
        onRunArtifact={() => undefined}
        onOpenRunDetail={() => undefined}
        onOpenSchedule={() => undefined}
        renderRunConsole={() => <div>Console fixture</div>}
        renderRuntimeInputPanel={() => null}
        renderOutputsPanel={() => <div>Outputs fixture</div>}
      />,
    );

    expect(markup).toContain("workflow-runs-workspace");
    expect(markup).toContain("Workflow Agent Runs panels");
    expect(markup).toContain("Workflow running");
    expect(markup).toContain("Nightly reporting thread");
    expect(markup).toContain("1 retained run for this workflow thread.");
    expect(markup).toContain("Dry run");
    expect(markup).toContain("Run");
    expect(markup).toContain("Opening");
    expect(markup).toContain("Outputs");
    expect(markup).toContain("Schedule");
    expect(markup).toContain("Resume");
    expect(markup).toContain("aria-selected=\"true\"");
    expect(markup).toContain("workflow-run-evidence-panel");
    expect(markup).toContain("Events");
    expect(markup).toContain("Diagram fixture");
  });

  it("renders the focused runs pane with owner-computed persistent status", () => {
    const artifact = workflowArtifact();
    const run: WorkflowRunSummary = {
      ...workflowRun(),
      status: "succeeded",
      error: undefined,
      scheduledBy: undefined,
    };
    const markup = renderToStaticMarkup(
      <WorkflowFocusedRunsPane
        thread={workflowThread()}
        artifact={artifact}
        state={{
          dashboard: { artifacts: [artifact], runs: [run] },
          selectedDetail: workflowRunConsoleDetail(),
          activePanelId: "runs-live",
          artifactById: new Map([[artifact.id, artifact]]),
          workflowBusy: undefined,
          workflowCompileThreadId: undefined,
          workflowCompileProgress: [],
          workflowDiscoveryBusy: undefined,
        }}
        slots={{
          layoutStyle: { "--workflow-split-primary": "58%" },
          splitHandle: <div>Split fixture</div>,
          diagramPane: <aside>Diagram fixture</aside>,
        }}
        actions={{
          runLimitsForArtifact: () => ({ idleTimeoutMs: 30_000 }),
          isArtifactRunBlocked: () => false,
          auditReportPreview: (value) => value ?? "",
          onOpenPersistentStatusTarget: () => undefined,
          onSelectPanel: () => undefined,
          onRunArtifact: () => undefined,
          onOpenRunDetail: () => undefined,
          onOpenSchedule: () => undefined,
          renderRunConsole: () => <div>Console fixture</div>,
          renderRuntimeInputPanel: () => null,
          renderOutputsPanel: () => <div>Outputs fixture</div>,
        }}
      />,
    );

    expect(markup).toContain("Workflow is ready");
    expect(markup).toContain("No grants required");
    expect(markup).toContain("Nightly reporting thread");
    expect(markup).toContain("Console fixture");
    expect(markup).toContain("Split fixture");
    expect(markup).toContain("Diagram fixture");
  });
});

function detail(): WorkflowRunDetail {
  return {
    artifact: workflowArtifact(),
    run: {
      id: "run-1",
      artifactId: "artifact-1",
      status: "paused",
      startedAt: "2026-06-14T10:00:00.000Z",
      updatedAt: "2026-06-14T10:00:30.000Z",
    },
    events: [],
    modelCalls: [],
    checkpoints: [],
    approvals: [],
    auditReport: "",
  };
}

function workflowArtifact(): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "thread-1",
    title: "Nightly workflow",
    status: "approved",
    manifest: {
      tools: [],
      pluginCapabilities: [],
      ambientCliCapabilities: [],
      mutationPolicy: "read_only",
      maxToolCalls: 1,
      maxModelCalls: 0,
      maxConnectorCalls: 0,
      connectors: [],
    },
    spec: {
      goal: "Ask before continuing.",
      summary: "Fixture",
    },
    sourcePath: "/tmp/main.ts",
    statePath: "/tmp/state.json",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  };
}

function workflowThread(): WorkflowAgentThreadSummary {
  return {
    id: "thread-1",
    folderId: "folder-1",
    projectName: "Demo Project",
    projectPath: "/tmp/demo",
    title: "Nightly reporting thread",
    phase: "approved",
    initialRequest: "Run the nightly report.",
    preview: "Nightly report workflow",
    status: "approved",
    traceMode: "production",
    activeArtifactId: "artifact-1",
    discoveryQuestions: [],
    badges: ["Approved"],
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  };
}

function workflowRun(): WorkflowRunSummary {
  return {
    id: "run-1",
    artifactId: "artifact-1",
    status: "needs_input",
    startedAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:30.000Z",
    error: "Runtime stopped for review.",
    scheduledBy: {
      scheduleId: "schedule-1",
      outcome: "started",
      targetKind: "workflow_thread",
      targetVersionId: "version-2",
      grantDecisionSource: "existing_grant",
    },
  };
}

function workflowRunConsoleDetail(): WorkflowRunDetail {
  return {
    artifact: workflowArtifact(),
    run: {
      id: "run-1",
      artifactId: "artifact-1",
      status: "paused",
      startedAt: "2026-06-14T10:00:00.000Z",
      updatedAt: "2026-06-14T10:02:00.000Z",
    },
    events: [
      {
        id: "event-timeout",
        runId: "run-1",
        artifactId: "artifact-1",
        seq: 1,
        type: "workflow.timeout",
        createdAt: "2026-06-14T10:02:00.000Z",
        message: "The run reached its manifest cap.",
        data: {
          reason: "total_runtime_limit",
          recoverable: true,
          idleTimeoutMs: 120000,
          maxRunMs: 600000,
          totalRuntimeLimitSource: "manifest",
        },
      },
    ],
    modelCalls: [],
    checkpoints: [
      {
        runId: "run-1",
        key: "checkpoint-output",
        valuePreview: "checkpoint value",
        updatedAt: "2026-06-14T10:01:30.000Z",
      },
    ],
    approvals: [
      {
        id: "approval-1",
        status: "pending",
        createdAt: "2026-06-14T10:01:00.000Z",
        changeSetPreview: "Write workflow output",
      },
    ],
    auditReport: "# Audit\n\nReady for review.",
  };
}

function runtimeInputCard(): WorkflowRuntimeInputCard {
  return {
    id: "workflow-input:input-1",
    eventId: "event-1",
    seq: 1,
    runId: "run-1",
    requestId: "input-1",
    prompt: "Review the browser warning.",
    choices: [
      {
        id: "completed",
        label: "I completed it",
        description: "Continue from the managed browser page.",
      },
    ],
    allowFreeform: true,
    graphNodeId: "browser-review",
    itemKey: "managed-browser",
    browserIntervention: {
      title: "Browser needs user action",
      kind: "captcha",
      provider: "managed-browser",
      status: "Needs input",
      toolName: "browser.click",
      profileMode: "persistent",
      browserUserActionId: "action-1",
      targetId: "target-1",
      url: "https://example.com/review",
      message: "Complete the browser challenge.",
      preview: {
        title: "Browser evidence",
        detail: "Screenshot and page excerpt",
        textExcerpt: "Please confirm you are human.",
        screenshotArtifactPath: "artifacts/browser.png",
        screenshotBytes: 2048,
        screenshotWidth: 1280,
        screenshotHeight: 720,
      },
    },
    contextItems: [
      {
        id: "context-1",
        kind: "artifact",
        label: "Attached context",
        detail: "Runtime payload",
        format: "json",
        value: "{\"ok\":true}",
        artifactPath: "artifacts/input.json",
      },
    ],
  };
}
