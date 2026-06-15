import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowVersionSummary,
} from "../../shared/types";
import { WorkflowBuildWorkspace, workflowBuildWorkspaceViewModel } from "./AutomationsWorkflowBuildViews";
import type { WorkflowExplorationGateModel } from "./workflowExplorationGateUiModel";
import type { WorkflowPersistentStatusModel } from "./workflowPersistentStatusUiModel";
import type { WorkflowThreadTranscriptCard } from "./workflowThreadTranscriptUiModel";

describe("Automations workflow build views", () => {
  it("renders the workflow build overview through the moved owner", () => {
    const markup = renderToStaticMarkup(
      <WorkflowBuildWorkspace
        {...buildWorkspaceProps()}
        transcriptCards={[transcriptCard()]}
        outputCount={2}
      />,
    );

    expect(markup).toContain("workflow-build-workspace");
    expect(markup).toContain("Workflow Agent Build panels");
    expect(markup).toContain("Workflow Chat");
    expect(markup).toContain("Pi session not prepared");
    expect(markup).toContain("Prepare Pi session");
    expect(markup).toContain("Nightly reporting thread");
    expect(markup).toContain("Request editor fixture");
    expect(markup).toContain("Exploration recommended before compile");
    expect(markup).toContain("Run");
    expect(markup).toContain("Skip");
    expect(markup).toContain("Compile from trace");
    expect(markup).toContain("Compile audit");
    expect(markup).toContain("Transcript fixture");
    expect(markup).toContain("Runtime input fixture");
    expect(markup).toContain("Composer fixture");
    expect(markup).toContain("Review fixture");
  });

  it("routes workflow artifact run evidence panels through explicit render callbacks", () => {
    const markup = renderToStaticMarkup(
      <WorkflowBuildWorkspace
        {...buildWorkspaceProps()}
        requestedArtifactPanel="run_console"
      />,
    );

    expect(markup).toContain("data-workflow-build-panel=\"runs-live\"");
    expect(markup).toContain("data-workflow-artifact-panel=\"run_console\"");
    expect(markup).toContain("Run console fixture");
  });

  it("assembles workflow build workspace state through the build owner", () => {
    const thread = workflowThread();
    const artifact = workflowArtifact();
    const detail = workflowRunDetail();
    const latestRun = workflowRun();
    const version = workflowVersion({ workflowThreadId: thread.id, artifactId: artifact.id, version: 4 });
    const selectedNode = thread.graph?.nodes[0];
    const gate = explorationGate();

    const model = workflowBuildWorkspaceViewModel({
      thread,
      artifact,
      selectedDetail: detail,
      runs: [{ ...latestRun, id: "other-run", artifactId: "other-artifact" }, latestRun],
      versions: [version, workflowVersion({ id: "other-version", workflowThreadId: "other-thread" })],
      explorationTraceCount: 2,
      explorationGate: gate,
      selectedWorkflowAgentThreadId: thread.id,
      selectedWorkflowAgentSourceNode: selectedNode,
      workflowBusy: "compile",
      workflowCompileThreadId: thread.id,
      workflowCompileProgress: [],
      workflowDiscoveryBusy: undefined,
      workflowThreadSessionBusy: thread.id,
      workflowThreadComposerBusy: undefined,
      sourceDrafts: { [artifact.id]: "export async function draft() {}" },
    });

    expect(model).toMatchObject({
      detail,
      latestRun,
      versions: [version],
      selectedSourceNode: selectedNode,
      currentVersion: version,
      explorationTraceCount: 2,
      explorationGate: gate,
      sessionPreparing: true,
      sourceDraft: "export async function draft() {}",
      outputCount: 0,
    });
    expect(model.persistentStatus.title).toBe("Compile is running");
  });
});

function buildWorkspaceProps(): Parameters<typeof WorkflowBuildWorkspace>[0] {
  const thread = workflowThread();
  const artifact = workflowArtifact();
  const detail = workflowRunDetail();
  const latestRun = workflowRun();
  return {
    thread,
    artifact,
    detail,
    latestRun,
    versions: [],
    transcriptCards: [],
    selectedNodeId: "node-1",
    selectedSourceNode: thread.graph?.nodes[0],
    currentVersion: undefined,
    persistentStatus: persistentStatus(),
    explorationTraceCount: 1,
    explorationGate: explorationGate(),
    sessionPreparing: false,
    workflowBusy: undefined,
    sourceDraft: "export async function run() {}",
    outputCount: 0,
    onOpenPersistentStatusTarget: () => undefined,
    onSetBuildPanel: () => undefined,
    onPrepareSession: () => undefined,
    onOpenTranscriptPanel: () => undefined,
    onResolveRevision: () => undefined,
    onRunExploration: () => undefined,
    onSkipExploration: () => undefined,
    onCompile: () => undefined,
    onSelectSourceNode: () => undefined,
    onSourceDraftChange: () => undefined,
    onSourceDraftClear: () => undefined,
    onSourceSave: () => undefined,
    renderRequestEditor: () => <div>Request editor fixture</div>,
    renderThreadComposer: () => <div>Composer fixture</div>,
    renderReviewWorkspace: () => <section>Review fixture</section>,
    renderExplorationPanel: () => <section>Exploration fixture</section>,
    renderRunConsolePanel: () => <section>Run console fixture</section>,
    renderRuntimeInputPanel: () => <section>Runtime input fixture</section>,
    renderOutputsPanel: () => <section>Outputs fixture</section>,
    renderManifestPanel: () => <section>Manifest fixture</section>,
    renderPermissionsPanel: () => <section>Permissions fixture</section>,
    renderVersionHistoryPanel: () => <section>Versions fixture</section>,
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
    graph: {
      id: "graph-1",
      workflowThreadId: "thread-1",
      version: 1,
      source: "compile",
      nodes: [
        {
          id: "node-1",
          type: "model_call",
          label: "Summarize",
          description: "Summarize the nightly report.",
        },
      ],
      edges: [],
      summary: "Nightly report workflow graph.",
      createdAt: "2026-06-14T09:00:00.000Z",
    },
    createdAt: "2026-06-14T09:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
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
      goal: "Summarize the nightly report.",
      summary: "Fixture",
    },
    sourcePath: "/tmp/main.ts",
    statePath: "/tmp/state.json",
    compileAudit: {
      promptModuleCount: 1,
      compilerMode: "program_ir",
      promptModules: [],
      selectedRecipeIds: ["recipe.reporting"],
      rejectedRecipeIds: [],
      policyImplicationIds: [],
      validatorIds: ["validator.static"],
      failedValidatorIds: [],
      validationStatus: "passed",
      diagnosticCount: 0,
    },
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
    updatedAt: "2026-06-14T10:00:30.000Z",
  };
}

function workflowVersion(overrides: Partial<WorkflowVersionSummary> = {}): WorkflowVersionSummary {
  return {
    id: "version-1",
    workflowThreadId: "thread-1",
    artifactId: "artifact-1",
    version: 1,
    sourcePath: "/tmp/main.ts",
    repoPath: "/tmp",
    status: "approved",
    createdBy: "compiler",
    createdAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
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
    auditReport: "# Audit",
    sourceContent: "export async function run() {}",
  };
}

function persistentStatus(): WorkflowPersistentStatusModel {
  return {
    tone: "ready",
    title: "Workflow ready",
    detail: "The workflow is ready to run.",
    badges: ["Approved"],
  };
}

function explorationGate(): WorkflowExplorationGateModel {
  return {
    enabled: true,
    canRun: true,
    canSkip: true,
    canCompileFromExploration: true,
    canCompileWithoutExploration: false,
    state: "recommended",
    label: "Recommended",
    title: "Exploration recommended before compile",
    detail: "Run a bounded exploration pass before compiling.",
    reasonLabels: ["Workflow request"],
  };
}

function transcriptCard(): WorkflowThreadTranscriptCard {
  return {
    id: "chat-1",
    kind: "chat",
    tone: "neutral",
    title: "Transcript fixture",
    detail: "Pi suggested a workflow revision.",
    badges: ["Chat"],
  };
}
