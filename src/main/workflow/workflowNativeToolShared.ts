import type { PermissionMode } from "../../shared/permissionTypes";
import type {
  WorkflowArtifactSummary,
  WorkflowDashboard,
  WorkflowExecutionMode,
  WorkflowGraphSnapshot,
  WorkflowRunDetail,
  WorkflowRunLimitOverrides,
  WorkflowRunRuntime,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { WorkflowPlanEditIntentKind } from "../../shared/workflowThreadPlanEdit";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type { WorkflowConnectorDescriptor } from "./workflowConnectors";
import type { PluginMcpToolRegistration } from "./workflowPluginsFacade";
import type { ProjectStore } from "./workflowProjectStoreFacade";

export interface WorkflowNativeRunArtifactInput {
  artifactId: string;
  mode: WorkflowExecutionMode;
  runtime?: WorkflowRunRuntime;
  allowUnapproved?: boolean;
  runLimits?: WorkflowRunLimitOverrides;
}

export interface WorkflowNativeToolRuntime {
  store: ProjectStore;
  workspacePath: string;
  permissionMode: PermissionMode;
  planEditIntentKind?: WorkflowPlanEditIntentKind;
  defaultWorkflowThreadId?: string;
  runWorkflowArtifact?: (input: WorkflowNativeRunArtifactInput) => Promise<WorkflowDashboard>;
  connectorDescriptors?: () => WorkflowConnectorDescriptor[];
  pluginRegistrationsForWorkspace?: (workspacePath: string) => Promise<PluginMcpToolRegistration[]> | PluginMcpToolRegistration[];
  searchRoutingSettings?: SearchRoutingSettings;
}

export interface WorkflowArtifactSelection {
  thread: ReturnType<ProjectStore["getWorkflowAgentThreadSummary"]>;
  artifact?: WorkflowArtifactSummary;
  graph?: WorkflowGraphSnapshot;
  version?: WorkflowVersionSummary;
}

export function selectWorkflowArtifact(store: ProjectStore, args: Record<string, unknown>): WorkflowArtifactSelection {
  const workflowThreadId = requireWorkflowThreadId(args);
  const thread = store.getWorkflowAgentThreadSummary(workflowThreadId);
  const versionId = optionalString(args.versionId);
  const version = versionId ? store.getWorkflowVersion(versionId) : undefined;
  if (version && version.workflowThreadId !== workflowThreadId)
    throw new Error("Workflow version does not belong to the requested workflow thread.");
  const artifactId = version?.artifactId ?? optionalString(args.artifactId) ?? thread.activeArtifactId ?? thread.latestVersion?.artifactId;
  const artifact = artifactId ? store.getWorkflowArtifact(artifactId) : undefined;
  if (artifact?.workflowThreadId && artifact.workflowThreadId !== workflowThreadId)
    throw new Error("Workflow artifact does not belong to the requested workflow thread.");
  const graph = version?.graphSnapshotId
    ? store.listWorkflowGraphSnapshots(workflowThreadId).find((snapshot) => snapshot.id === version.graphSnapshotId)
    : thread.graph;
  return { thread, artifact, graph, version };
}

export function latestThreadRun(store: ProjectStore, workflowThreadId: string) {
  return latestThreadRuns(store, workflowThreadId, 1)[0];
}

export function latestThreadRuns(store: ProjectStore, workflowThreadId: string, limit: number) {
  const artifactIds = new Set(
    store
      .listWorkflowArtifacts()
      .filter((artifact) => artifact.workflowThreadId === workflowThreadId)
      .map((artifact) => artifact.id),
  );
  return store
    .listWorkflowRuns(undefined, 200)
    .filter((run) => artifactIds.has(run.artifactId))
    .slice(0, limit);
}

export function assertRunBelongsToThread(detail: WorkflowRunDetail, workflowThreadId: string): void {
  if (detail.artifact.workflowThreadId !== workflowThreadId) {
    throw new Error("Workflow run does not belong to the requested workflow thread.");
  }
}

export function summarizeArtifact(artifact: WorkflowArtifactSummary) {
  return {
    id: artifact.id,
    title: artifact.title,
    status: artifact.status,
    sourcePath: artifact.sourcePath,
    statePath: artifact.statePath,
    manifest: artifact.manifest,
    spec: artifact.spec,
    updatedAt: artifact.updatedAt,
  };
}

export function summarizeGraph(graph: WorkflowGraphSnapshot) {
  return {
    id: graph.id,
    version: graph.version,
    source: graph.source,
    summary: graph.summary,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    nodes: graph.nodes.map((node) => ({ id: node.id, type: node.type, label: node.label })),
  };
}

export function discoverySummary(thread: ReturnType<ProjectStore["getWorkflowAgentThreadSummary"]>) {
  return {
    totalQuestions: thread.discoveryQuestions.length,
    answeredQuestions: thread.discoveryQuestions.filter((question) => question.answer).length,
    categories: [...new Set(thread.discoveryQuestions.map((question) => question.category))],
    answers: thread.discoveryQuestions
      .filter((question) => question.answer)
      .map((question) => ({
        id: question.id,
        category: question.category,
        question: question.question,
        answer: question.answer,
      })),
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function requireWorkflowThreadId(args: Record<string, unknown>): string {
  return requiredString(args.workflowThreadId, "workflowThreadId");
}

export function requiredString(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function positiveInteger(value: unknown, label: string): number | string {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return `${label} must be a positive number.`;
  return Math.floor(parsed);
}

export function positiveIntegerValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

export function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
