import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowCompileAuditSummary, WorkflowCompileProgress, WorkflowRunDetail, WorkflowRunSummary } from "../../shared/workflowTypes";
import {
  WorkflowCompileActivity,
  WorkflowCompileAuditInlineCard,
  WorkflowCompileAuditReview,
  WorkflowProgramInspector,
  WorkflowReviewWorkspace,
  WorkflowReviewTile,
  formatWorkflowCompileAuditList,
  workflowCompileAuditRuleIds,
} from "./AutomationsWorkflowReviewViews";
import { workflowReviewWorkspaceModel } from "./workflowReviewUiModel";

describe("Automations workflow review views", () => {
  it("renders compile activity progress through the moved owner", () => {
    const progress: WorkflowCompileProgress[] = [
      {
        compileId: "compile-1",
        phase: "completed",
        status: "completed",
        message: "Workflow preview compiled.",
        current: 5,
        total: 5,
        createdAt: "2026-06-14T10:00:00.000Z",
        metrics: { compilerMode: "program_ir" },
      },
    ];

    const markup = renderToStaticMarkup(<WorkflowCompileActivity active={false} progress={progress} />);

    expect(markup).toContain("Preview ready");
    expect(markup).toContain("Workflow preview compiled.");
    expect(markup).toContain("program_ir");
  });

  it("renders compile audit review cards and helper summaries", () => {
    const audit = compileAudit();

    expect(workflowCompileAuditRuleIds(audit)).toEqual(["ambient.rule"]);
    expect(formatWorkflowCompileAuditList(["one", "two", "three"], "None", 2)).toBe("one, two, +1 more");

    const reviewMarkup = renderToStaticMarkup(<WorkflowCompileAuditReview audit={audit} />);
    const inlineMarkup = renderToStaticMarkup(<WorkflowCompileAuditInlineCard audit={audit} />);

    expect(reviewMarkup).toContain("Compile audit");
    expect(reviewMarkup).toContain("recipe.classify");
    expect(reviewMarkup).toContain("ambient.rule");
    expect(inlineMarkup).toContain("2 prompt modules");
    expect(inlineMarkup).toContain("recipe.classify");
  });

  it("renders program inspector source and review tiles", () => {
    const detail = {
      artifact: workflowArtifact(),
      run: { id: "run-1", artifactId: "artifact-1", status: "succeeded", startedAt: "2026-06-14T10:00:00.000Z", updatedAt: "2026-06-14T10:00:05.000Z" },
      events: [],
      modelCalls: [],
      checkpoints: [],
      approvals: [],
      auditReport: "",
      sourceContent: "export async function run() { return 'ok'; }",
    } satisfies WorkflowRunDetail;

    const inspectorMarkup = renderToStaticMarkup(<WorkflowProgramInspector artifact={workflowArtifact()} detail={detail} />);
    const tileMarkup = renderToStaticMarkup(
      <WorkflowReviewTile section={{ id: "plugins", label: "Capabilities", value: "2", detail: "Ready", tone: "ready" }} />,
    );

    expect(inspectorMarkup).toContain("Manifest");
    expect(inspectorMarkup).toContain("Source Program");
    expect(inspectorMarkup).toContain("export async function run()");
    expect(tileMarkup).toContain("Capabilities");
    expect(tileMarkup).toContain("Ready");
  });

  it("renders the workflow review workspace through explicit props", () => {
    const thread = workflowThread();
    const artifact = workflowArtifact();
    const latestRun = workflowRun();
    const detail = workflowRunDetail();
    const review = workflowReviewWorkspaceModel({ thread, artifact, latestRun, detail });

    const markup = renderToStaticMarkup(
      <WorkflowReviewWorkspace
        threadId={thread.id}
        discoveryQuestions={thread.discoveryQuestions}
        artifact={artifact}
        latestRun={latestRun}
        detail={detail}
        review={review}
        runBlocked={false}
        runLimits={{ idleTimeoutMs: 120_000, maxRunMs: null }}
        currentVersion={thread.latestVersion}
        selectedSourceNode={thread.graph?.nodes[1]}
        sourceNodes={thread.graph?.nodes}
        scheduleState={{
          schedules: [],
          canScheduleLatestApproved: true,
          latestApprovedVersionLabel: "v3",
          canPinCurrentVersion: true,
          currentVersionId: "version-1",
          currentVersionLabel: "v3",
        }}
        workflowGrantRegistry={{
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
        }}
        workflowRunIdleTimeoutMs={120_000}
        workflowRunTotalLimitMode="disabled"
        workflowBusy={undefined}
        schedulePreset="daily"
        scheduleExpression="0 9 * * *"
        scheduleEnabled
        scheduleBusy={false}
        scheduleTargetType="workflow_thread"
        scheduleError={undefined}
        expandedScheduleHistoryId={undefined}
        permissionGrantRevoking={undefined}
        workflowSourceDraft={undefined}
        connectorAccounts={{}}
        pluginRegistry={{ plugins: [], capabilities: [], sources: [], errors: [], sourceNotes: [] }}
        connectorGrantsTooltip="Connector grants"
        auditPreviewTooltip="Audit preview"
        reviewQueueTooltip="Review queue"
        renderVersionHistory={() => <section>Version history</section>}
        auditReportPreview={(value) => value ?? "No audit"}
        onOpenPanel={() => undefined}
        onWorkflowRunIdleTimeoutMsChange={() => undefined}
        onWorkflowRunTotalLimitModeChange={() => undefined}
        onRevalidateArtifact={() => undefined}
        onRunArtifact={() => undefined}
        onOpenRunDetail={() => undefined}
        onReviewArtifact={() => undefined}
        onStartRevision={() => undefined}
        onScheduleThread={() => undefined}
        onCancelRun={() => undefined}
        onSchedulePresetChange={() => undefined}
        onScheduleExpressionChange={() => undefined}
        onScheduleEnabledChange={() => undefined}
        onCreateSchedule={() => undefined}
        onCreateScheduleGrant={() => undefined}
        onSetExpandedScheduleHistoryId={() => undefined}
        onConnectorAccountChange={() => undefined}
        onConnectorRetentionChange={() => undefined}
        onConnectorScopeRemove={() => undefined}
        onConnectorReject={() => undefined}
        onRevokePermissionGrantIds={() => undefined}
        onRevokePermissionGrant={() => undefined}
        onSelectSourceNode={() => undefined}
        onSourceDraftChange={() => undefined}
        onSourceDraftClear={() => undefined}
        onSourceSave={() => undefined}
        onResolveApproval={() => undefined}
      />,
    );

    expect(markup).toContain("Review controls");
    expect(markup).toContain("Dry run");
    expect(markup).toContain("Schedule latest approved");
    expect(markup).toContain("Discovery summary");
    expect(markup).toContain("Version history");
    expect(markup).toContain("Program and manifest");
    expect(markup).toContain("Audit preview");
    expect(markup).toContain("Audit OK");
  });
});

function compileAudit(): WorkflowCompileAuditSummary {
  return {
    promptModuleCount: 2,
    stablePrefixModuleCount: 1,
    mutableSuffixModuleCount: 1,
    promptModules: [
      {
        id: "core.instructions",
        layer: "core",
        scope: "workflow",
        reason: "Workflow compile owner.",
        ruleIds: ["ambient.rule"],
        selectedRecipeIds: ["recipe.classify"],
        selectedToolNames: ["ambient.responses"],
        selectedConnectorIds: ["gmail"],
      },
    ],
    selectedRecipeIds: ["recipe.classify"],
    rejectedRecipeIds: ["recipe.skip"],
    policyImplicationIds: ["policy.connector_review"],
    validatorIds: ["validator.static"],
    failedValidatorIds: [],
    validationStatus: "passed",
    diagnosticCount: 0,
  };
}

function workflowArtifact(): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "thread-1",
    title: "Inbox workflow",
    status: "ready_for_preview",
    manifest: {
      tools: ["ambient.responses"],
      connectors: [],
      pluginCapabilities: [],
      mutationPolicy: "staged_until_approved",
      maxToolCalls: 4,
      maxModelCalls: 2,
      maxRunMs: 60_000,
    },
    spec: { goal: "Classify inbox messages.", summary: "Classify inbox messages." },
    sourcePath: "/tmp/workspace/workflow.ts",
    statePath: "/tmp/workspace/state.json",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  };
}

function workflowThread(): WorkflowAgentThreadSummary {
  return {
    id: "thread-1",
    folderId: "home",
    projectName: "Workspace",
    projectPath: "/tmp/workspace",
    title: "Inbox workflow",
    phase: "ready_for_review",
    initialRequest: "Classify inbox messages.",
    preview: "Classify inbox messages.",
    status: "ready_for_review",
    traceMode: "production",
    activeArtifactId: "artifact-1",
    latestVersion: {
      id: "version-1",
      workflowThreadId: "thread-1",
      artifactId: "artifact-1",
      version: 3,
      sourcePath: "/tmp/workspace/.ambient-codex/workflows/inbox/main.ts",
      repoPath: "/tmp/workspace/.ambient-codex/workflows/inbox",
      status: "ready_for_review",
      createdBy: "compiler",
      createdAt: "2026-06-14T10:00:00.000Z",
    },
    graph: {
      id: "graph-1",
      workflowThreadId: "thread-1",
      version: 3,
      source: "compile",
      summary: "Classify inbox messages.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "model", type: "model_call", label: "Classify" },
      ],
      edges: [{ id: "request-model", source: "request", target: "model", type: "control_flow" }],
      createdAt: "2026-06-14T10:00:00.000Z",
    },
    discoveryQuestions: [
      {
        id: "question-1",
        workflowThreadId: "thread-1",
        category: "scope",
        context: "context",
        question: "Scope?",
        choices: [{ id: "manual", label: "Manual", description: "Run manually." }],
        allowFreeform: true,
        answer: { choiceId: "manual", answeredAt: "2026-06-14T10:00:00.000Z" },
        createdAt: "2026-06-14T10:00:00.000Z",
      },
    ],
    badges: [],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
  };
}

function workflowRun(): WorkflowRunSummary {
  return {
    id: "run-1",
    artifactId: "artifact-1",
    status: "succeeded",
    startedAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:05.000Z",
    completedAt: "2026-06-14T10:00:05.000Z",
  };
}

function workflowRunDetail(): WorkflowRunDetail {
  return {
    artifact: workflowArtifact(),
    run: workflowRun(),
    events: [],
    modelCalls: [],
    checkpoints: [],
    approvals: [],
    auditReport: "Audit OK",
    sourceContent: "export async function run() { return 'ok'; }",
  };
}
