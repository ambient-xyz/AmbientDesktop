import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowRunSummary, WorkflowVersionSummary } from "../../shared/workflowTypes";
import {
  WorkflowManifestPanel,
  WorkflowPermissionsPanel,
  WorkflowVersionHistoryPanel,
  workflowArtifactPanelRenderers,
} from "./AutomationsWorkflowArtifactInspectorViews";

describe("Automations workflow artifact inspector views", () => {
  it("renders manifest facts, run limits, declared capabilities, and source JSON through explicit props", () => {
    const markup = renderToStaticMarkup(
      <WorkflowManifestPanel
        artifact={workflowArtifact()}
        latestRun={workflowRun()}
        workflowRunIdleTimeoutMs={30_000}
        workflowRunTotalLimitMode="manifest"
        onWorkflowRunIdleTimeoutChange={() => undefined}
        onWorkflowRunTotalLimitModeChange={() => undefined}
      />,
    );

    expect(markup).toContain("Mutation policy");
    expect(markup).toContain("Read Only");
    expect(markup).toContain("browser_open");
    expect(markup).toContain("Run limits");
    expect(markup).toContain("Use manifest cap");
    expect(markup).toContain("Declared capabilities");
    expect(markup).toContain("1 connectors");
    expect(markup).toContain("gmail_search");
    expect(markup).toContain("Manifest JSON");
    expect(markup).toContain("/repo/.ambient/workflows/invoices/workflow.ts");
  });

  it("renders empty permission requirements and grant registry without owning revocation state", () => {
    const markup = renderToStaticMarkup(
      <WorkflowPermissionsPanel
        thread={workflowThread()}
        artifact={workflowArtifact({ manifest: { ...workflowArtifact().manifest, connectors: [], pluginCapabilities: [], ambientCliCapabilities: [] } })}
        permissionGrants={[]}
        permissionAudit={[]}
        workspacePath="/repo"
        onWorkflowConnectorAccountChange={() => undefined}
        onWorkflowConnectorRetentionChange={() => undefined}
        onRemoveWorkflowConnectorScope={() => undefined}
        onRejectWorkflowConnectorGrant={() => undefined}
        onRevokePermissionGrantIds={async () => undefined}
        onRevokePermissionGrant={async () => undefined}
      />,
    );

    expect(markup).toContain("Connector and plugin requirements");
    expect(markup).toContain("This manifest does not request connector, plugin, or Ambient CLI capability grants.");
    expect(markup).toContain("Persistent grants and receipts");
    expect(markup).toContain("No reusable grants or Full Access receipts are currently relevant to this workflow.");
  });

  it("renders revisions and version history while preserving restore actions as callbacks", () => {
    const markup = renderToStaticMarkup(
      <WorkflowVersionHistoryPanel
        thread={workflowThread({ phase: "revision", activeGraphSnapshotId: "graph-current" })}
        artifact={workflowArtifact({ id: "artifact-current" })}
        versions={[
          workflowVersion({ id: "version-1", artifactId: "artifact-1", graphSnapshotId: "graph-1", version: 1, status: "ready_for_review" }),
          workflowVersion({ id: "version-2", artifactId: "artifact-2", graphSnapshotId: "graph-2", version: 2, status: "approved" }),
        ]}
        revisions={[
          {
            id: "revision-1",
            workflowThreadId: "workflow-thread-1",
            requestedChange: "Add invoice exception handling.",
            status: "proposed",
            sourceDiff: "+ handle exception",
            createdAt: "2026-06-14T09:00:00.000Z",
            updatedAt: "2026-06-14T09:05:00.000Z",
          },
        ]}
        onStartRevision={() => undefined}
        onResolveRevision={() => undefined}
        onRestoreVersionForReview={() => undefined}
      />,
    );

    expect(markup).toContain("Revisions");
    expect(markup).toContain("Add invoice exception handling.");
    expect(markup).toContain("Apply revision");
    expect(markup).toContain("Version history");
    expect(markup).toContain("2 versions");
    expect(markup).toContain("latest approved v2");
    expect(markup).toContain("Version 2");
    expect(markup).toContain("Latest approved baseline");
    expect(markup).toContain("Restore for review");
    expect(markup).toContain("Restore + approve");
  });

  it("builds artifact panel renderers from explicit workspace state and actions", () => {
    const renderers = workflowArtifactPanelRenderers({
      state: {
        workflowBusy: "run-1",
        workflowRunIdleTimeoutMs: 30_000,
        workflowRunTotalLimitMode: "manifest",
        permissionGrants: [],
        permissionAudit: [],
        workspacePath: "/repo",
        workflowSourceDrafts: {},
        workflowVersions: [workflowVersion()],
        workflowRevisions: [],
      },
      actions: {
        onWorkflowRunIdleTimeoutChange: () => undefined,
        onWorkflowRunTotalLimitModeChange: () => undefined,
        onWorkflowConnectorAccountChange: () => undefined,
        onWorkflowConnectorRetentionChange: () => undefined,
        onRemoveWorkflowConnectorScope: () => undefined,
        onRejectWorkflowConnectorGrant: () => undefined,
        onRevokePermissionGrantIds: async () => undefined,
        onRevokePermissionGrant: async () => undefined,
        onOpenRunDetail: () => undefined,
        onCancelRun: () => undefined,
        onRunArtifact: () => undefined,
        runLimitsForArtifact: () => ({ idleTimeoutMs: 30_000, maxRunMs: null }),
        onCloseRunConsole: () => undefined,
        onResumeTotalRuntimePause: () => undefined,
        onSelectSourceNode: () => undefined,
        onSourceDraftChange: () => undefined,
        onSourceDraftClear: () => undefined,
        onSourceSave: () => undefined,
        onResolveApproval: () => undefined,
        onAnswerRuntimeInput: () => undefined,
        onRevealBrowser: () => undefined,
        onPreviewPath: () => undefined,
        onPreviewLocalPath: () => undefined,
        onOpenMediaModal: () => undefined,
        onStartRevision: () => undefined,
        onResolveRevision: () => undefined,
        onRestoreVersionForReview: () => undefined,
      },
    });

    const consoleMarkup = renderToStaticMarkup(<>{renderers.renderRunConsolePanel(workflowArtifact(), workflowRun(), undefined)}</>);
    const manifestMarkup = renderToStaticMarkup(<>{renderers.renderManifestPanel(workflowArtifact(), workflowRun())}</>);
    const permissionsMarkup = renderToStaticMarkup(<>{renderers.renderPermissionsPanel(workflowThread(), workflowArtifact())}</>);
    const outputsMarkup = renderToStaticMarkup(<>{renderers.renderOutputsPanel(workflowArtifact(), workflowRun(), undefined)}</>);
    const historyMarkup = renderToStaticMarkup(<>{renderers.renderVersionHistoryPanel(workflowThread(), workflowArtifact())}</>);

    expect(consoleMarkup).toContain("Run Console");
    expect(consoleMarkup).toContain("Opening");
    expect(manifestMarkup).toContain("Manifest JSON");
    expect(permissionsMarkup).toContain("Persistent grants and receipts");
    expect(outputsMarkup).toContain("Open a run to inspect outputs");
    expect(historyMarkup).toContain("Version history");
  });
});

function workflowThread(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "folder-1",
    projectName: "Project Alpha",
    projectPath: "/repo",
    title: "Review invoices",
    phase: "ready_for_review",
    initialRequest: "Review invoices every morning.",
    preview: "Review invoices.",
    status: "ready_for_preview",
    traceMode: "production",
    activeArtifactId: "artifact-current",
    activeGraphSnapshotId: "graph-current",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-14T08:00:00.000Z",
    updatedAt: "2026-06-14T08:05:00.000Z",
    ...overrides,
  };
}

function workflowArtifact(overrides: Partial<WorkflowArtifactSummary> = {}): WorkflowArtifactSummary {
  return {
    id: "artifact-current",
    workflowThreadId: "workflow-thread-1",
    title: "Review invoices",
    status: "ready_for_preview",
    manifest: {
      tools: ["browser_open"],
      connectors: [
        {
          connectorId: "gmail",
          scopes: ["invoices.read"],
          operations: ["search"],
          dataRetention: "redacted_audit",
        },
      ],
      pluginCapabilities: [
        {
          capabilityId: "gmail-search",
          pluginId: "gmail",
          pluginName: "Gmail",
          serverName: "gmail",
          toolName: "search",
          registeredName: "gmail_search",
        },
      ],
      ambientCliCapabilities: [
        {
          capabilityId: "cli-1",
          registryPluginId: "ambient-cli",
          packageId: "ambient-cli",
          packageName: "Ambient CLI",
          command: "gmail_search",
        },
      ],
      mutationPolicy: "read_only",
      maxModelCalls: 4,
      maxConnectorCalls: 2,
      maxRunMs: 120_000,
    },
    spec: {
      goal: "Review invoices.",
      summary: "Find new invoices.",
    },
    sourcePath: "/repo/.ambient/workflows/invoices/workflow.ts",
    statePath: "/repo/.ambient/workflows/invoices/state.json",
    createdAt: "2026-06-14T08:00:00.000Z",
    updatedAt: "2026-06-14T08:05:00.000Z",
    ...overrides,
  };
}

function workflowRun(overrides: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: "run-1",
    artifactId: "artifact-current",
    status: "succeeded",
    startedAt: "2026-06-14T08:30:00.000Z",
    updatedAt: "2026-06-14T08:31:00.000Z",
    completedAt: "2026-06-14T08:31:00.000Z",
    ...overrides,
  };
}

function workflowVersion(overrides: Partial<WorkflowVersionSummary> = {}): WorkflowVersionSummary {
  return {
    id: "version-1",
    workflowThreadId: "workflow-thread-1",
    artifactId: "artifact-1",
    version: 1,
    graphSnapshotId: "graph-1",
    sourcePath: "/repo/.ambient/workflows/invoices/workflow.ts",
    repoPath: "/repo",
    gitCommitHash: "1234567890abcdef",
    status: "approved",
    createdBy: "compiler",
    createdAt: "2026-06-14T08:00:00.000Z",
    ...overrides,
  };
}
