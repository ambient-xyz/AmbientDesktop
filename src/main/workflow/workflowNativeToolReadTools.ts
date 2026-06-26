import { readFile } from "node:fs/promises";
import type {
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowRunDetail,
} from "../../shared/workflowTypes";
import { searchAmbientCliCapabilities, type AmbientCliCapabilitySearchResponse } from "./workflowAmbientCliFacade";
import { workflowArtifactSourceProvenance } from "./workflowArtifactProvenance";
import { readWorkflowRunDetail } from "./workflowDashboard";
import {
  assertRunBelongsToThread,
  boundedInteger,
  discoverySummary,
  latestThreadRun,
  latestThreadRuns,
  optionalString,
  requireWorkflowThreadId,
  requiredString,
  selectWorkflowArtifact,
  summarizeArtifact,
  summarizeGraph,
  type WorkflowNativeToolRuntime,
} from "./workflowNativeToolShared";
import {
  buildWorkflowDiscoveryPolicyContext,
  describeWorkflowDiscoveryCapability,
  searchWorkflowDiscoveryCapabilities,
} from "./workflowWorkflowDiscoveryFacade";

export function workflowCurrentContext(runtime: WorkflowNativeToolRuntime, workflowThreadId: string) {
  const thread = runtime.store.getWorkflowAgentThreadSummary(workflowThreadId);
  const artifact = thread.activeArtifactId ? runtime.store.getWorkflowArtifact(thread.activeArtifactId) : undefined;
  const versions = runtime.store.listWorkflowVersions(workflowThreadId);
  const runs = artifact ? runtime.store.listWorkflowRuns(artifact.id, 5) : latestThreadRuns(runtime.store, workflowThreadId, 5);
  return {
    thread,
    activeArtifact: artifact ? summarizeArtifact(artifact) : undefined,
    graph: thread.graph ? summarizeGraph(thread.graph) : undefined,
    latestVersion: thread.latestVersion,
    latestRuns: runs,
    counts: {
      discoveryQuestions: thread.discoveryQuestions.length,
      unansweredDiscoveryQuestions: thread.discoveryQuestions.filter((question) => !question.answer).length,
      graphNodes: thread.graph?.nodes.length ?? 0,
      graphEdges: thread.graph?.edges.length ?? 0,
      versions: versions.length,
      runs: runs.length,
    },
    pending: {
      discoveryQuestions: thread.discoveryQuestions
        .filter((question) => !question.answer)
        .map((question) => ({
          id: question.id,
          category: question.category,
          question: question.question,
        })),
      accessRequests: thread.discoveryQuestions.flatMap((question) =>
        (question.accessRequests ?? [])
          .filter((request) => request.status === "pending")
          .map((request) => ({
            questionId: question.id,
            id: request.id,
            capability: request.capability,
            targetLabel: request.targetLabel,
            recommendedResponse: request.recommendedResponse,
          })),
      ),
    },
  };
}

export function workflowArtifactContext(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const selected = selectWorkflowArtifact(runtime.store, args);
  return {
    thread: selected.thread,
    artifact: selected.artifact,
    version: selected.version,
    graph: selected.graph,
    discoverySummary: discoverySummary(selected.thread),
  };
}

export async function workflowSourceContext(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) throw new Error("Workflow source is unavailable because the thread has no selected artifact.");
  const maxChars = boundedInteger(args.maxChars, 1, 100_000, 20_000);
  const content = await readFile(selected.artifact.sourcePath, "utf8");
  return {
    threadId: selected.thread.id,
    artifactId: selected.artifact.id,
    versionId: selected.version?.id,
    sourcePath: selected.artifact.sourcePath,
    sourceProvenance: workflowArtifactSourceProvenance(selected.artifact),
    chars: content.length,
    returnedChars: Math.min(content.length, maxChars),
    truncated: content.length > maxChars,
    content: content.slice(0, maxChars),
  };
}

export function workflowRunTraceContext(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const runId = optionalString(args.runId) ?? latestThreadRun(runtime.store, workflowThreadId)?.id;
  if (!runId) throw new Error("Workflow run trace is unavailable because this workflow thread has no runs.");
  const detail = readWorkflowRunDetail(runtime.store, runId);
  assertRunBelongsToThread(detail, workflowThreadId);
  const eventLimit = boundedInteger(args.eventLimit, 1, 500, 80);
  return {
    ...detail,
    events: detail.events.slice(-eventLimit),
    eventCount: detail.events.length,
    returnedEventCount: Math.min(detail.events.length, eventLimit),
  } satisfies WorkflowRunDetail & { eventCount: number; returnedEventCount: number };
}

export function workflowVersionsContext(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const limit = boundedInteger(args.limit, 1, 100, 20);
  const versions = runtime.store.listWorkflowVersions(workflowThreadId);
  return {
    workflowThreadId,
    versions: versions.slice(0, limit),
    totalVersions: versions.length,
    returnedVersions: Math.min(versions.length, limit),
  };
}

export async function workflowCapabilitySearch(
  runtime: WorkflowNativeToolRuntime,
  args: Record<string, unknown>,
): Promise<WorkflowDiscoveryCapabilitySearch> {
  const workflowThreadId = requireWorkflowThreadId(args);
  const query = requiredString(args.query, "query");
  const context = await capabilityPolicyContext(runtime, workflowThreadId, query);
  return searchWorkflowDiscoveryCapabilities({
    query,
    context,
    limit: boundedInteger(args.limit, 1, 20, 6),
  });
}

export async function workflowCapabilityDescribe(
  runtime: WorkflowNativeToolRuntime,
  args: Record<string, unknown>,
): Promise<WorkflowDiscoveryCapabilityDescription> {
  const workflowThreadId = requireWorkflowThreadId(args);
  const capabilityId = requiredString(args.capabilityId, "capabilityId");
  const context = await capabilityPolicyContext(runtime, workflowThreadId, optionalString(args.query) ?? capabilityId);
  const description = describeWorkflowDiscoveryCapability({
    capabilityId,
    query: optionalString(args.query),
    context,
  });
  if (!description) throw new Error(`Workflow capability was not found: ${capabilityId}`);
  return description;
}

export async function capabilityPolicyContext(runtime: WorkflowNativeToolRuntime, workflowThreadId: string, query?: string) {
  const thread = runtime.store.getWorkflowAgentThreadSummary(workflowThreadId);
  const pluginRegistrations = await runtime.pluginRegistrationsForWorkspace?.(thread.projectPath);
  return buildWorkflowDiscoveryPolicyContext({
    projectPath: thread.projectPath,
    workspacePath: runtime.workspacePath,
    permissionMode: runtime.permissionMode,
    stage: "initial_discovery",
    workflowThreadId,
    threadId: workflowThreadId,
    grants: runtime.store.listPermissionGrants(),
    connectorDescriptors: runtime.connectorDescriptors?.() ?? [],
    pluginRegistrations,
    ambientCliCapabilities: await workflowNativeAmbientCliCapabilitiesForQuery(runtime.workspacePath, query ?? thread.initialRequest),
    ...(runtime.searchRoutingSettings ? { searchRoutingSettings: runtime.searchRoutingSettings } : {}),
  });
}

export async function workflowNativeAmbientCliCapabilitiesForQuery(workspacePath: string, query: string) {
  try {
    const search = await searchAmbientCliCapabilities(workspacePath, {
      query,
      kind: "command",
      limit: 6,
      includeHealth: false,
    });
    return workflowNativeAmbientCliCapabilitiesFromSearch(search);
  } catch {
    return [];
  }
}

export function workflowNativeAmbientCliCapabilitiesFromSearch(response: AmbientCliCapabilitySearchResponse) {
  return response.results.flatMap((result) =>
    result.commands.map((command) => ({
      capabilityId: command.capabilityId,
      registryPluginId: result.registryPluginId,
      packageId: result.packageId,
      packageName: result.packageName,
      command: command.name,
      ...(command.description ? { description: command.description } : {}),
      availability: result.availability,
      availabilityReason: result.availabilityReason,
      risk: command.risk,
      missingEnv: result.missingEnv,
      whyMatched: result.whyMatched,
    })),
  );
}
