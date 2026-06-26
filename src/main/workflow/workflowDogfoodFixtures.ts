import { dirname, join } from "node:path";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { CodexPluginSummary } from "../../shared/pluginTypes";
import type { WorkflowDashboard, WorkflowRunEvent, WorkflowRunSummary } from "../../shared/workflowTypes";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import { liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "./workflowAmbientFacade";
import {
  GoogleWorkspaceCliAdapter,
  googleWorkspaceConnectorRegistrations,
  type GoogleWorkspaceConnectorDescriptorOptions,
} from "./workflowGoogleWorkspaceFacade";
import { type WorkflowExplorationAction, type WorkflowExplorationProvider } from "./workflowExplorationService";
import { workflowApprovalsFromEvents } from "./workflowApprovals";
import { runWorkflowArtifact } from "./workflowRunService";
export * from "./workflowDogfoodPlanEditFixtures";
export * from "./workflowDogfoodBrowserFixtures";
export * from "./workflowDogfoodArtifactWriters";
export {
  dogfoodNodeId,
  createLocalDownloadsFixture,
  createLocalDownloadsImageFixture,
  fakeMiniCpmVision,
  localDirectoryClassificationCompilerOutput,
  localImageCategorizationCompilerOutput,
  localFileReportCompilerOutput,
  scheduledLocalFileTimeoutRecoveryCompilerOutput,
} from "./workflowDogfoodLocalFixtures";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function liveAmbientApiKey(): string {
  return readLiveAmbientProviderApiKey({ purpose: "live Workflow Agent dogfood" });
}

export function liveAmbientBaseUrl(): string | undefined {
  return liveAmbientProviderBaseUrl();
}

export function liveWorkflowModel(preferredModelEnvNames: string[] = ["AMBIENT_WORKFLOW_MODEL", "AMBIENT_LIVE_MODEL"]): string {
  return liveAmbientProviderModel({ preferredModelEnvNames, fallbackModel: AMBIENT_DEFAULT_MODEL });
}

export function liveGmailConnectorOptions(accountHint: string): GoogleWorkspaceConnectorDescriptorOptions {
  return {
    adapter: "gws",
    states: {
      "google.gmail": {
        status: "available",
        accounts: [{ id: accountHint, label: accountHint }],
      },
    },
  };
}

export function liveCalendarConnectorOptions(accountHint: string): GoogleWorkspaceConnectorDescriptorOptions {
  return {
    adapter: "gws",
    states: {
      "google.calendar": {
        status: "available",
        accounts: [{ id: accountHint, label: accountHint }],
      },
    },
  };
}

export function liveDriveConnectorOptions(accountHint: string): GoogleWorkspaceConnectorDescriptorOptions {
  return {
    adapter: "gws",
    states: {
      "google.drive": {
        status: "available",
        accounts: [{ id: accountHint, label: accountHint }],
      },
    },
  };
}

export async function runWorkflowApprovingReviews(input: {
  store: ProjectStore;
  artifactId: string;
  workspacePath: string;
  adapter: GoogleWorkspaceCliAdapter;
  connectorOptions: GoogleWorkspaceConnectorDescriptorOptions;
  apiKey: string;
  model: string;
  baseUrl?: string;
  providerRequestTimeoutMs: number;
  maxApprovalRounds: number;
}): Promise<WorkflowDashboard> {
  const connectorRegistrations = googleWorkspaceConnectorRegistrations({ sidecar: input.adapter }, input.connectorOptions);
  let dashboard = await runWorkflowArtifact({
    store: input.store,
    artifactId: input.artifactId,
    workspacePath: input.workspacePath,
    permissionMode: "full-access",
    connectorRegistrations,
    connectorApprovalDecision: () => "approved",
    model: input.model,
    baseUrl: input.baseUrl,
    ambientProvider: new AmbientWorkflowRunProvider({
      model: input.model,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      workflowThreadId: input.store.getWorkflowArtifact(input.artifactId).workflowThreadId,
      idleTimeoutMs: 90_000,
      absoluteTimeoutMs: input.providerRequestTimeoutMs,
      enforceAbsoluteTimeout: true,
    }),
  });
  for (let round = 0; round < input.maxApprovalRounds; round += 1) {
    const run = latestRunForArtifact(dashboard, input.artifactId);
    if (run.status !== "paused") return dashboard;
    const approved = approvePendingWorkflowReviews(input.store, run.id);
    if (approved === 0) throw new Error(`Workflow paused without pending approvals: ${run.id}`);
    dashboard = await runWorkflowArtifact({
      store: input.store,
      artifactId: input.artifactId,
      workspacePath: input.workspacePath,
      permissionMode: "full-access",
      connectorRegistrations,
      connectorApprovalDecision: () => "approved",
      model: input.model,
      baseUrl: input.baseUrl,
      resumeFromRunId: run.id,
      ambientProvider: new AmbientWorkflowRunProvider({
        model: input.model,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        workflowThreadId: input.store.getWorkflowArtifact(input.artifactId).workflowThreadId,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: input.providerRequestTimeoutMs,
        enforceAbsoluteTimeout: true,
      }),
    });
  }
  return dashboard;
}

export function approvePendingWorkflowReviews(store: ProjectStore, runId: string): number {
  const events = store.listWorkflowRunEvents(runId);
  const requiredById = new Map(
    events
      .filter((event) => event.type === "approval.required" || event.type === "connector.review.required")
      .map((event) => [typeof event.data?.id === "string" ? event.data.id : "", event]),
  );
  const approvals = workflowApprovalsFromEvents(events).filter((approval) => approval.status === "pending");
  for (const approval of approvals) {
    const required = requiredById.get(approval.id);
    const type = required?.type === "approval.required" ? "approval.approved" : "connector.review.approved";
    store.appendWorkflowRunEvent({
      runId,
      type,
      message: approval.id,
      data: { id: approval.id, changeSet: approval.changeSet, source: "live-dogfood" },
    });
  }
  return approvals.length;
}

export function latestRunForArtifact(dashboard: WorkflowDashboard, artifactId: string): WorkflowRunSummary {
  const run = dashboard.runs.find((candidate) => candidate.artifactId === artifactId);
  if (!run) throw new Error(`No workflow run found for artifact ${artifactId}.`);
  return run;
}

export function eventCountsByType(events: WorkflowRunEvent[]): Record<string, number> {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
}

export function requiredWorkflowApprovalId(store: ProjectStore, runId: string): string {
  const id = store
    .listWorkflowRunEvents(runId)
    .find((event) => event.type === "approval.required" || event.type === "connector.review.required")?.data?.id;
  if (typeof id !== "string") throw new Error(`Missing workflow approval event for run ${runId}.`);
  return id;
}

export function fixtureCodexMcpPlugin(rootPath: string): CodexPluginSummary {
  return {
    id: "marketplace:ambient-fixture",
    name: "ambient-fixture",
    version: "0.1.0",
    description: "Fixture plugin used by Workflow Agent MCP dogfood.",
    marketplaceName: "Ambient Fixture",
    marketplacePath: join(dirname(rootPath), ".agents", "plugins", "marketplace.json"),
    rootPath,
    sourceKind: "workspace",
    compatibilityTier: "supported",
    compatibilityNotes: [],
    supportLabels: [],
    skills: [],
    mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    enabled: true,
    trusted: true,
    errors: [],
  };
}

export function sequenceExplorationProvider(actions: WorkflowExplorationAction[]): WorkflowExplorationProvider {
  let index = 0;
  return {
    next: async () => {
      const action = actions[index];
      index += 1;
      if (!action) throw new Error("No more exploration actions.");
      return action;
    },
  };
}

export * from "./workflowDogfoodCompilerFixtures";
