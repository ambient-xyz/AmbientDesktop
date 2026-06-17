import { randomUUID } from "node:crypto";
import { AMBIENT_DEFAULT_MODEL, normalizeAmbientModelId } from "../../shared/ambientModels";
import type {
  WorkflowConnectorManifestGrant,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowManifest,
  WorkflowPromptCacheCheckpoint,
  PermissionMode,
  PermissionRequest,
  WorkflowExplorationTraceSummary,
  WorkflowExplorationEventSummary,
  WorkflowExplorationProgress,
  WorkflowGraphSnapshot,
  WorkflowAgentThreadSummary,
  WorkflowAmbientCliCapabilityGrant,
  WorkflowExplorationRunStatus,
} from "../../shared/types";
import type { DesktopToolDescriptor } from "../desktopToolRegistry";
import type { WorkflowEventSink, WorkflowToolHandlers } from "./workflowAgentRuntime";
import { readAmbientApiKey } from "../credentialStore";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import type { ProjectStore } from "../projectStore/projectStore";
import type { AmbientRetryPolicy } from "../aggressiveRetries";
import { createWorkflowDesktopToolBridge, type WorkflowBrowserAdapter, type WorkflowDesktopToolBridgeOptions } from "./workflowDesktopTools";
import {
  createWorkflowConnectorBridge,
  type WorkflowConnectorAccountAuthorizer,
  type WorkflowConnectorCallInput,
  type WorkflowConnectorDescriptor,
  type WorkflowConnectorRegistration,
} from "./workflowConnectors";
import { callWorkflowPiText, type WorkflowPiProgress, type WorkflowPiTextCallInput } from "./workflowPiTransport";
import { defaultWorkflowExplorationBudgets, type WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";

export type { WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";

export interface WorkflowExplorationToolCapability {
  name: string;
  label: string;
  description: string;
  source: DesktopToolDescriptor["source"];
  sideEffects: DesktopToolDescriptor["sideEffects"];
  permissionScope: string;
  supportsDryRun: boolean;
  inputSchema: unknown;
}

export interface WorkflowExplorationConnectorCapability {
  connectorId: string;
  label: string;
  description: string;
  authStatus: WorkflowConnectorDescriptor["auth"]["status"];
  accounts: Array<{ id: string; label: string }>;
  defaultDataRetention: WorkflowConnectorManifestGrant["dataRetention"];
  operations: Array<{
    name: string;
    label: string;
    description: string;
    requiredScopes: string[];
    sideEffects: string;
    mutationPolicy: string;
    supportsDryRun: boolean;
    inputSchema: unknown;
  }>;
}

export interface WorkflowExplorationCapabilityManifest {
  version: 1;
  tools: WorkflowExplorationToolCapability[];
  connectors: WorkflowExplorationConnectorCapability[];
  ambientCliCapabilities: WorkflowAmbientCliCapabilityGrant[];
  ambient: {
    enabled: boolean;
    model: string;
    callShape: "structured_json";
  };
  budgets: WorkflowExplorationBudgets;
}

export interface WorkflowExplorationDistillation {
  summary: string;
  observedCalls: Array<{
    kind: "tool" | "connector" | "ambient";
    name: string;
    inputSummary?: string;
    outputSummary?: string;
    status: "succeeded" | "failed";
  }>;
  successfulPatterns: string[];
  dataShapes: string[];
  requiredGrants: string[];
  recommendedGraph?: {
    summary: string;
    nodes: WorkflowGraphNode[];
    edges: WorkflowGraphEdge[];
  };
  recommendedManifest?: Partial<WorkflowManifest>;
  deterministicSourceStrategy: string;
  unresolvedQuestions: string[];
}

export interface WorkflowExplorationObservation {
  id: string;
  turn: number;
  action: WorkflowExplorationAction["action"];
  name: string;
  reason?: string;
  nodeId?: string;
  inputSummary?: string;
  outputSummary?: string;
  output?: unknown;
  status: "succeeded" | "failed";
  error?: string;
  durationMs: number;
}

export interface WorkflowExplorationResult {
  explorationId: string;
  explorationNodeId: string;
  capabilityManifest: WorkflowExplorationCapabilityManifest;
  observations: WorkflowExplorationObservation[];
  distillation: WorkflowExplorationDistillation;
}

export interface WorkflowThreadExplorationResult {
  thread: WorkflowAgentThreadSummary;
  trace: WorkflowExplorationTraceSummary;
  graphSnapshot: WorkflowGraphSnapshot;
  result: WorkflowExplorationResult;
}

export type WorkflowExplorationAction =
  | {
      action: "call_tool";
      toolName: string;
      input?: unknown;
      reason?: string;
      nodeId?: string;
    }
  | {
      action: "call_connector";
      connectorId: string;
      operation: string;
      input?: unknown;
      accountId?: string;
      reason?: string;
      nodeId?: string;
      itemKey?: string;
    }
  | {
      action: "call_ambient";
      task: string;
      input?: unknown;
      reason?: string;
      nodeId?: string;
    }
  | {
      action: "finish";
      distillation: WorkflowExplorationDistillation;
    };

export interface WorkflowExplorationProviderNextInput {
  request: string;
  workflowThreadId?: string;
  explorationNodeId: string;
  turn: number;
  model: string;
  capabilityManifest: WorkflowExplorationCapabilityManifest;
  observations: WorkflowExplorationObservation[];
  cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
  abortSignal?: AbortSignal;
  onProgress?: (progress: WorkflowPiProgress) => void;
}

export interface WorkflowExplorationProvider {
  next(input: WorkflowExplorationProviderNextInput): Promise<WorkflowExplorationAction>;
}

export interface RunWorkflowExplorationInput {
  request: string;
  workflowThreadId?: string;
  explorationId?: string;
  explorationNodeId?: string;
  model?: string;
  capabilityManifest: WorkflowExplorationCapabilityManifest;
  provider?: WorkflowExplorationProvider;
  toolHandlers?: WorkflowToolHandlers;
  connectorCaller?: (input: WorkflowConnectorCallInput) => Promise<unknown> | unknown;
  ambientCaller?: (input: { task: string; input: unknown; nodeId?: string; onProgress?: (progress: WorkflowPiProgress) => void }) => Promise<unknown> | unknown;
  eventSink?: WorkflowEventSink;
  abortSignal?: AbortSignal;
  baseUrl?: string;
  retryPolicy?: AmbientRetryPolicy;
}

export interface RunWorkflowThreadExplorationInput {
  store: ProjectStore;
  workflowThreadId: string;
  toolDescriptors: DesktopToolDescriptor[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  connectorRegistrations?: WorkflowConnectorRegistration[];
  connectorAccountAuthorizer?: WorkflowConnectorAccountAuthorizer;
  pluginRegistrations?: PluginMcpToolRegistration[];
  ambientCliCapabilities?: WorkflowAmbientCliCapabilityGrant[];
  workspacePath?: string;
  permissionMode: PermissionMode;
  model?: string;
  provider?: WorkflowExplorationProvider;
  browser?: WorkflowBrowserAdapter;
  requestPermission?: (request: Omit<PermissionRequest, "id">) => Promise<boolean>;
  ensurePluginTrusted?: WorkflowDesktopToolBridgeOptions["ensurePluginTrusted"];
  pluginCaller?: WorkflowDesktopToolBridgeOptions["pluginCaller"];
  connectorCaller?: RunWorkflowExplorationInput["connectorCaller"];
  ambientCaller?: RunWorkflowExplorationInput["ambientCaller"];
  onProgress?: (progress: WorkflowExplorationProgress) => void;
  budgets?: Partial<WorkflowExplorationBudgets>;
  abortSignal?: AbortSignal;
  baseUrl?: string;
  retryPolicy?: AmbientRetryPolicy;
}

export function buildWorkflowExplorationCapabilityManifest(input: {
  toolDescriptors: DesktopToolDescriptor[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  pluginRegistrations?: PluginMcpToolRegistration[];
  allowedToolNames?: string[];
  allowedConnectorIds?: string[];
  ambientCliCapabilities?: WorkflowAmbientCliCapabilityGrant[];
  model?: string;
  budgets?: Partial<WorkflowExplorationBudgets>;
}): WorkflowExplorationCapabilityManifest {
  const allowedToolNames = input.allowedToolNames?.length ? new Set(input.allowedToolNames) : undefined;
  const allowedConnectorIds = input.allowedConnectorIds?.length ? new Set(input.allowedConnectorIds) : undefined;
  const pluginToolNames = new Set((input.pluginRegistrations ?? []).map((registration) => registration.registeredName));
  return {
    version: 1,
    tools: input.toolDescriptors
      .filter((tool) => !allowedToolNames || allowedToolNames.has(tool.name))
      .map((tool) => ({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        source: pluginToolNames.has(tool.name) ? "plugin-mcp" : tool.source,
        sideEffects: tool.sideEffects,
        permissionScope: tool.permissionScope,
        supportsDryRun: tool.supportsDryRun,
        inputSchema: tool.inputSchema,
      })),
    connectors: (input.connectorDescriptors ?? [])
      .filter((connector) => !allowedConnectorIds || allowedConnectorIds.has(connector.id))
      .map((connector) => ({
        connectorId: connector.id,
        label: connector.label,
        description: connector.description,
        authStatus: connector.auth.status,
        accounts: connector.accounts.map((account) => ({ id: account.id, label: account.label })),
        defaultDataRetention: connector.defaultDataRetention,
        operations: connector.operations.map((operation) => ({
          name: operation.name,
          label: operation.label,
          description: operation.description,
          requiredScopes: operation.requiredScopes,
          sideEffects: operation.sideEffects,
          mutationPolicy: operation.mutationPolicy,
          supportsDryRun: operation.supportsDryRun,
          inputSchema: operation.inputSchema,
        })),
      })),
    ambientCliCapabilities: input.ambientCliCapabilities ?? [],
    ambient: {
      enabled: true,
      model: normalizeAmbientModelId(input.model ?? AMBIENT_DEFAULT_MODEL),
      callShape: "structured_json",
    },
    budgets: defaultWorkflowExplorationBudgets(input.budgets),
  };
}

export function workflowManifestForExplorationCapabilities(
  capabilityManifest: WorkflowExplorationCapabilityManifest,
  overrides: Partial<WorkflowManifest> = {},
): WorkflowManifest {
  return {
    tools: capabilityManifest.tools.map((tool) => tool.name),
    connectors: capabilityManifest.connectors.map((connector) => ({
      connectorId: connector.connectorId,
      accountId: connector.accounts[0]?.id,
      scopes: [...new Set(connector.operations.flatMap((operation) => operation.requiredScopes))],
      operations: connector.operations.map((operation) => operation.name),
      dataRetention: connector.defaultDataRetention,
    })),
    ambientCliCapabilities: capabilityManifest.ambientCliCapabilities,
    mutationPolicy: "read_only",
    maxToolCalls: capabilityManifest.budgets.maxToolCalls,
    maxConnectorCalls: capabilityManifest.budgets.maxConnectorCalls,
    maxModelCalls: capabilityManifest.budgets.maxAmbientCalls,
    maxRunMs: capabilityManifest.budgets.maxElapsedMs,
    ...overrides,
  };
}

export function workflowExplorationGraphNode(input: { id?: string; label?: string; description?: string } = {}): WorkflowGraphNode {
  return {
    id: input.id ?? "agent-exploration",
    type: "agent_exploration",
    label: input.label ?? "Agent exploration",
    description: input.description ?? "Bounded Pi exploration through Ambient Desktop permissions and event logging.",
    retentionPolicy: "debug trace retained as workflow evidence",
  };
}

export function workflowExplorationGraphForThread(thread: Pick<WorkflowAgentThreadSummary, "initialRequest">): {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
} {
  return {
    nodes: [
      { id: "request", type: "request", label: "Workflow request", description: thread.initialRequest },
      workflowExplorationGraphNode(),
      { id: "output", type: "output", label: "Exploration distillation", description: "Structured evidence for deterministic compile." },
    ],
    edges: [
      { id: "request-to-exploration", source: "request", target: "agent-exploration", type: "control_flow" },
      { id: "exploration-to-output", source: "agent-exploration", target: "output", type: "data_flow" },
    ],
  };
}

export async function runWorkflowExploration(input: RunWorkflowExplorationInput): Promise<WorkflowExplorationResult> {
  const request = input.request.trim();
  if (!request) throw new Error("Workflow exploration requires a request.");
  const explorationId = input.explorationId ?? randomUUID();
  const explorationNodeId = input.explorationNodeId ?? "agent-exploration";
  const model = normalizeAmbientModelId(input.model ?? input.capabilityManifest.ambient.model ?? AMBIENT_DEFAULT_MODEL);
  const provider =
    input.provider ??
    new AmbientWorkflowExplorationProvider({
      apiKey: readAmbientApiKey(),
      baseUrl: input.baseUrl,
    });
  const startedAt = Date.now();
  const observations: WorkflowExplorationObservation[] = [];
  let toolCalls = 0;
  let connectorCalls = 0;
  let ambientCalls = 0;

  await input.eventSink?.append({
    type: "exploration.start",
    message: request,
    graphNodeId: explorationNodeId,
    data: {
      explorationId,
      budgets: input.capabilityManifest.budgets,
      toolCount: input.capabilityManifest.tools.length,
      connectorCount: input.capabilityManifest.connectors.length,
      model,
    },
  });

  try {
    for (let turn = 1; turn <= input.capabilityManifest.budgets.maxModelTurns; turn += 1) {
      throwIfAborted(input.abortSignal);
      enforceElapsedBudget(startedAt, input.capabilityManifest.budgets.maxElapsedMs);
      await input.eventSink?.append({
        type: "exploration.provider.start",
        message: `turn ${turn}`,
        graphNodeId: explorationNodeId,
        data: { explorationId, turn, observationCount: observations.length },
      });
      const action = await provider.next({
        request,
        workflowThreadId: input.workflowThreadId,
        explorationNodeId,
        turn,
        model,
        capabilityManifest: input.capabilityManifest,
        observations,
        abortSignal: input.abortSignal,
        onProgress: (progress) => {
          void input.eventSink?.append({
            type: "exploration.provider.progress",
            message: `turn ${turn}`,
            graphNodeId: explorationNodeId,
            data: { explorationId, turn, ...progress },
          });
        },
      });
      await input.eventSink?.append({
        type: "exploration.provider.end",
        message: action.action,
        graphNodeId: explorationNodeId,
        data: { explorationId, turn, action: compactActionForEvent(action) },
      });

      if (action.action === "finish") {
        const distillation = normalizeWorkflowExplorationDistillation(action.distillation);
        await input.eventSink?.append({
          type: "exploration.finish",
          message: distillation.summary,
          graphNodeId: explorationNodeId,
          data: { explorationId, observationCount: observations.length, distillation: compactDistillationForEvent(distillation) },
        });
        return {
          explorationId,
          explorationNodeId,
          capabilityManifest: input.capabilityManifest,
          observations,
          distillation,
        };
      }

      if (action.action === "call_tool") {
        toolCalls += 1;
        enforceCallBudget("tool", toolCalls, input.capabilityManifest.budgets.maxToolCalls);
        observations.push(await runExplorationToolAction({ input, action, turn, explorationId, explorationNodeId }));
        continue;
      }

      if (action.action === "call_connector") {
        connectorCalls += 1;
        enforceCallBudget("connector", connectorCalls, input.capabilityManifest.budgets.maxConnectorCalls);
        observations.push(await runExplorationConnectorAction({ input, action, turn, explorationId, explorationNodeId }));
        continue;
      }

      ambientCalls += 1;
      enforceCallBudget("ambient", ambientCalls, input.capabilityManifest.budgets.maxAmbientCalls);
      observations.push(await runExplorationAmbientAction({ input, action, turn, explorationId, explorationNodeId }));
    }
    throw new Error(`Workflow exploration exceeded max model turns (${input.capabilityManifest.budgets.maxModelTurns}).`);
  } catch (error) {
    await input.eventSink?.append({
      type: "exploration.error",
      message: error instanceof Error ? error.message : String(error),
      graphNodeId: explorationNodeId,
      data: { explorationId, observationCount: observations.length },
    });
    throw error;
  }
}

export async function runWorkflowThreadExploration(input: RunWorkflowThreadExplorationInput): Promise<WorkflowThreadExplorationResult> {
  const thread = input.store.getWorkflowAgentThreadSummary(input.workflowThreadId);
  const explorationNodeId = "agent-exploration";
  const explorationId = randomUUID();
  const model = normalizeAmbientModelId(input.model ?? AMBIENT_DEFAULT_MODEL);
  const capabilityManifest = buildWorkflowExplorationCapabilityManifest({
    toolDescriptors: input.toolDescriptors,
    connectorDescriptors: input.connectorDescriptors,
    pluginRegistrations: input.pluginRegistrations,
    ambientCliCapabilities: input.ambientCliCapabilities,
    model,
    budgets: input.budgets,
  });
  const runtimeManifest = workflowManifestForExplorationCapabilities(capabilityManifest);
  const eventLog: WorkflowExplorationEventSummary[] = [];
  let latestProgress: WorkflowExplorationProgress | undefined;
  let durableTraceId: string | undefined;
  const eventSink: WorkflowEventSink = {
    append: (event) => {
      const createdAt = new Date().toISOString();
      const summary: WorkflowExplorationEventSummary = {
        seq: eventLog.length + 1,
        type: event.type,
        message: event.message,
        graphNodeId: event.graphNodeId,
        graphEdgeId: event.graphEdgeId,
        itemKey: event.itemKey,
        data: event.data,
        createdAt,
      };
      eventLog.push(summary);
      latestProgress = workflowExplorationProgressFromEvent(thread.id, explorationId, summary);
      if (durableTraceId) {
        input.store.updateWorkflowExplorationTrace({
          id: durableTraceId,
          status: workflowExplorationRunStatusFromEvent(summary.type),
          events: eventLog,
          latestProgress,
          providerHealth: workflowExplorationProviderHealthFromEvents(eventLog),
          retryMetadata: workflowExplorationRetryMetadataFromEvents(eventLog),
          completedAt: summary.type === "exploration.finish" || summary.type === "exploration.error" ? createdAt : undefined,
          error: summary.type === "exploration.error" ? summary.message ?? "Workflow exploration failed." : undefined,
        });
      }
      input.onProgress?.(latestProgress);
    },
  };
  const connectorBridge = input.connectorCaller
    ? undefined
    : input.connectorRegistrations?.length
      ? createWorkflowConnectorBridge({
          manifest: runtimeManifest,
          registrations: input.connectorRegistrations,
          eventSink,
          accountAuthorizer: input.connectorAccountAuthorizer,
        })
      : undefined;
  const bridge = createWorkflowDesktopToolBridge({
    manifest: runtimeManifest,
    workspace: { path: input.workspacePath ?? thread.projectPath },
    permissionMode: input.permissionMode,
    runId: `exploration:${randomUUID()}`,
    browser: input.browser,
    requestPermission: input.requestPermission,
    pluginRegistrations: input.pluginRegistrations,
    ensurePluginTrusted: input.ensurePluginTrusted,
    pluginCaller: input.pluginCaller,
    eventSink,
    abortSignal: input.abortSignal,
  });
  const graphSnapshot = input.store.createWorkflowGraphSnapshot({
    workflowThreadId: thread.id,
    source: "exploration",
    summary: `Exploration trace for ${thread.title}`,
    ...workflowExplorationGraphForThread(thread),
  });
  const initialTrace = input.store.createWorkflowExplorationTrace({
    workflowThreadId: thread.id,
    explorationId,
    explorationNodeId,
    request: thread.initialRequest,
    model,
    capabilityManifest,
    observations: [],
    events: [],
    distillation: workflowExplorationPendingDistillation("Workflow exploration is running."),
    status: "running",
    graphSnapshotId: graphSnapshot.id,
  });
  durableTraceId = initialTrace.id;
  let result: WorkflowExplorationResult;
  try {
    result = await runWorkflowExploration({
      request: thread.initialRequest,
      workflowThreadId: thread.id,
      explorationId,
      explorationNodeId,
      model,
      capabilityManifest,
      provider: input.provider,
      toolHandlers: bridge.handlers,
      connectorCaller:
        input.connectorCaller ??
        ((callInput) => {
          if (!connectorBridge) throw new Error("Workflow exploration has no connector caller.");
          return connectorBridge.call(callInput);
        }),
      ambientCaller:
        input.ambientCaller ??
        defaultWorkflowExplorationAmbientCaller({ model, baseUrl: input.baseUrl, workflowThreadId: thread.id, retryPolicy: input.retryPolicy }),
      eventSink,
      abortSignal: input.abortSignal,
      baseUrl: input.baseUrl,
    });
  } catch (error) {
    input.store.updateWorkflowExplorationTrace({
      id: initialTrace.id,
      status: workflowExplorationTerminalStatusFromError(error, input.abortSignal),
      events: eventLog,
      latestProgress,
      providerHealth: workflowExplorationProviderHealthFromEvents(eventLog, error),
      retryMetadata: workflowExplorationRetryMetadataFromEvents(eventLog),
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date().toISOString(),
    });
    throw error;
  }
  const trace = input.store.updateWorkflowExplorationTrace({
    id: initialTrace.id,
    status: "succeeded",
    observations: result.observations,
    events: eventLog,
    distillation: result.distillation,
    latestProgress,
    providerHealth: workflowExplorationProviderHealthFromEvents(eventLog),
    retryMetadata: workflowExplorationRetryMetadataFromEvents(eventLog),
    error: undefined,
    completedAt: new Date().toISOString(),
  });
  return {
    thread: input.store.getWorkflowAgentThreadSummary(thread.id),
    trace,
    graphSnapshot,
    result,
  };
}

function workflowExplorationProgressFromEvent(
  workflowThreadId: string,
  explorationId: string,
  event: WorkflowExplorationEventSummary,
): WorkflowExplorationProgress {
  const data = event.data ?? {};
  return {
    workflowThreadId,
    explorationId,
    graphNodeId: event.graphNodeId,
    eventType: event.type,
    phase: workflowExplorationProgressPhase(event.type),
    status: workflowExplorationProgressStatus(event.type),
    message: workflowExplorationProgressMessage(event),
    turn: numberValue(data.turn),
    outputChars: numberValue(data.outputChars),
    thinkingChars: numberValue(data.thinkingChars),
    elapsedMs: numberValue(data.elapsedMs),
    idleElapsedMs: numberValue(data.idleElapsedMs),
    idleTimeoutMs: numberValue(data.idleTimeoutMs),
    updatedAt: event.createdAt,
  };
}

function workflowExplorationProgressPhase(eventType: string): WorkflowExplorationProgress["phase"] {
  if (eventType === "exploration.start") return "starting";
  if (eventType.startsWith("exploration.provider")) return "provider";
  if (eventType.startsWith("exploration.tool") || eventType.startsWith("desktop-tool")) return "tool";
  if (eventType.startsWith("exploration.connector") || eventType.startsWith("connector.")) return "connector";
  if (eventType.startsWith("exploration.ambient")) return "ambient";
  if (eventType === "exploration.finish") return "finished";
  if (eventType === "exploration.error") return "failed";
  return "provider";
}

function workflowExplorationProgressStatus(eventType: string): WorkflowExplorationProgress["status"] {
  if (eventType.endsWith(".error") || eventType === "exploration.error") return "failed";
  if (eventType.endsWith(".end") || eventType === "exploration.finish") return "succeeded";
  return "running";
}

function workflowExplorationRunStatusFromEvent(eventType: string): WorkflowExplorationRunStatus | undefined {
  if (eventType === "exploration.finish") return "succeeded";
  if (eventType === "exploration.error") return "failed";
  return undefined;
}

function workflowExplorationTerminalStatusFromError(error: unknown, abortSignal?: AbortSignal): WorkflowExplorationRunStatus {
  if (abortSignal?.aborted || (error instanceof Error && error.name === "AbortError")) return "canceled";
  return "failed";
}

function workflowExplorationPendingDistillation(summary: string): WorkflowExplorationDistillation {
  return {
    summary,
    observedCalls: [],
    successfulPatterns: [],
    dataShapes: [],
    requiredGrants: [],
    deterministicSourceStrategy: "Exploration has not produced a deterministic source strategy yet.",
    unresolvedQuestions: [],
  };
}

function workflowExplorationProviderHealthFromEvents(events: WorkflowExplorationEventSummary[], error?: unknown): Record<string, unknown> {
  const providerEvents = events.filter((event) => event.type.startsWith("exploration.provider"));
  const providerProgressEvents = providerEvents.filter((event) => event.type === "exploration.provider.progress");
  const latestProviderEvent = providerEvents.at(-1);
  const errorMessage = error instanceof Error ? error.message : error !== undefined ? String(error) : undefined;
  const providerFailed =
    Boolean(errorMessage && /ambient|pi|gmi|provider|429|rate limit|timeout|timed out|stream|idle|network/i.test(errorMessage)) ||
    providerEvents.some((event) => event.type.endsWith(".error"));
  return {
    status: errorMessage ? (providerFailed ? "provider_degraded" : "product_failed") : "ok",
    providerEventCount: providerEvents.length,
    providerProgressEventCount: providerProgressEvents.length,
    latestProviderEventType: latestProviderEvent?.type,
    latestProviderEventAt: latestProviderEvent?.createdAt,
    ...(errorMessage ? { error: errorMessage } : {}),
  };
}

function workflowExplorationRetryMetadataFromEvents(events: WorkflowExplorationEventSummary[]): Record<string, unknown> {
  const retryEvents = events.filter((event) => {
    const data = event.data ?? {};
    return (
      typeof data.retryAttempt === "number" ||
      typeof data.retryCount === "number" ||
      typeof data.attempt === "number" ||
      /retry/i.test(event.type) ||
      /retry/i.test(event.message ?? "")
    );
  });
  return {
    retryEventCount: retryEvents.length,
    latestRetryEventType: retryEvents.at(-1)?.type,
    latestRetryEventAt: retryEvents.at(-1)?.createdAt,
  };
}

function workflowExplorationProgressMessage(event: WorkflowExplorationEventSummary): string {
  if (event.type === "exploration.provider.progress") {
    const outputChars = numberValue(event.data?.outputChars);
    const thinkingChars = numberValue(event.data?.thinkingChars);
    const parts = [
      outputChars !== undefined ? `output ${outputChars.toLocaleString()} chars` : undefined,
      thinkingChars !== undefined ? `thinking ${thinkingChars.toLocaleString()} chars` : undefined,
    ].filter(Boolean);
    return parts.length ? `Pi is exploring: ${parts.join(", ")}.` : "Pi is exploring.";
  }
  if (event.type === "exploration.ambient.progress") {
    const outputChars = numberValue(event.data?.outputChars);
    return outputChars !== undefined ? `Ambient helper streaming ${outputChars.toLocaleString()} chars.` : "Ambient helper is streaming.";
  }
  if (event.type === "exploration.start") return "Starting workflow exploration.";
  if (event.type === "exploration.finish") return event.message ? `Exploration finished: ${event.message}` : "Exploration finished.";
  if (event.type === "exploration.error") return event.message ? `Exploration failed: ${event.message}` : "Exploration failed.";
  return event.message || event.type;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function defaultWorkflowExplorationAmbientCaller(input: {
  model: string;
  baseUrl?: string;
  workflowThreadId?: string;
  retryPolicy?: AmbientRetryPolicy;
}) {
  return async (call: { task: string; input: unknown; nodeId?: string; onProgress?: (progress: WorkflowPiProgress) => void }) => {
    const apiKey = (readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    return callWorkflowPiText({
      apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
      systemPrompt: "You are an Ambient Desktop workflow exploration helper. Respond with concise structured text only.",
      prompt: [
        "Task:",
        call.task,
        "",
        "Input:",
        JSON.stringify(call.input ?? {}, null, 2),
      ].join("\n"),
      sessionId: input.workflowThreadId,
      temperature: 0.1,
      maxTokens: 2_000,
      reasoning: false,
      timeoutMs: 120_000,
      idleTimeoutMs: 60_000,
      absoluteTimeoutMs: 180_000,
      onProgress: call.onProgress,
      retryPolicy: input.retryPolicy,
    });
  };
}

export class AmbientWorkflowExplorationProvider implements WorkflowExplorationProvider {
  constructor(
    private readonly input: {
      apiKey?: string;
      baseUrl?: string;
      timeoutMs?: number;
      idleTimeoutMs?: number;
      streamFactory?: WorkflowPiTextCallInput["streamFactory"];
      retryPolicy?: AmbientRetryPolicy;
    },
  ) {}

  async next(input: WorkflowExplorationProviderNextInput): Promise<WorkflowExplorationAction> {
    const apiKey = (this.input.apiKey ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const content = await callWorkflowPiText({
      apiKey,
      baseUrl: this.input.baseUrl,
      model: input.model,
      systemPrompt: "You are the Ambient Desktop workflow exploration planner. Return only one valid JSON action. Do not call tools yourself.",
      prompt: buildWorkflowExplorationPrompt(input),
      sessionId: input.workflowThreadId,
      temperature: 0.1,
      maxTokens: 4_000,
      reasoning: false,
      timeoutMs: this.input.timeoutMs ?? 180_000,
      idleTimeoutMs: this.input.idleTimeoutMs ?? 60_000,
      absoluteTimeoutMs: this.input.timeoutMs ?? 180_000,
      signal: input.abortSignal,
      onProgress: input.onProgress,
      streamFactory: this.input.streamFactory,
      retryPolicy: this.input.retryPolicy,
    });
    return normalizeWorkflowExplorationAction(parseJsonObject(content));
  }
}

export function buildWorkflowExplorationPrompt(input: WorkflowExplorationProviderNextInput): string {
  return [
    "Choose the next bounded workflow exploration action.",
    "",
    "Hard boundaries:",
    "- You do not have hidden tool access in this mode.",
    "- Return exactly one JSON object for Ambient Desktop to execute.",
    "- Use only tools, connectors, and Ambient calls listed in capabilityManifest.",
    "- If using Ambient CLI, call toolName \"ambient_cli\" only for packageName/command pairs listed in capabilityManifest.ambientCliCapabilities.",
    "- Prefer reading the smallest useful evidence before finishing when the request depends on local file contents, connector content, or current external facts.",
    "- Do not mutate anything during exploration unless a listed capability and user-approved permission explicitly allows it.",
    "- Finish only when you can provide a useful distillation for deterministic workflow compilation.",
    "",
    "Allowed action shapes:",
    JSON.stringify(
      [
        { action: "call_tool", toolName: "file_read", input: { path: "relative/path.md" }, reason: "why this evidence is needed", nodeId: "optional-nested-node-id" },
        { action: "call_tool", toolName: "ambient_cli", input: { packageName: "listed-package", command: "listed_command", args: ["bounded", "strings"] }, reason: "why this command evidence is needed", nodeId: "optional-nested-node-id" },
        {
          action: "call_connector",
          connectorId: "google.gmail",
          operation: "listMessages",
          input: { limit: 10 },
          accountId: "optional-account-id",
          reason: "why this connector call is needed",
          nodeId: "optional-nested-node-id",
        },
        { action: "call_ambient", task: "exploration.summarize_evidence", input: { evidence: "compact evidence" }, reason: "why this model call is needed" },
        {
          action: "finish",
          distillation: {
            summary: "what exploration learned",
            observedCalls: [{ kind: "tool", name: "file_read", status: "succeeded", inputSummary: "path", outputSummary: "summary" }],
            successfulPatterns: ["repeatable query or file pattern"],
            dataShapes: ["important fields observed"],
            requiredGrants: ["grants needed for production"],
            recommendedGraph: {
              summary: "deterministic graph recommendation",
              nodes: [workflowExplorationGraphNode({ id: input.explorationNodeId })],
              edges: [],
            },
            recommendedManifest: { tools: ["file_read"], mutationPolicy: "read_only" },
            deterministicSourceStrategy: "how deterministic source should use the evidence",
            unresolvedQuestions: [],
          },
        },
      ],
      null,
      2,
    ),
    "",
    "Request:",
    input.request,
    "",
    "Capability manifest:",
    JSON.stringify(compactCapabilityManifest(input.capabilityManifest), null, 2),
    "",
    "Prior observations:",
    JSON.stringify(input.observations.map(compactObservationForPrompt), null, 2),
    "",
    "Turn:",
    String(input.turn),
  ].join("\n");
}

export function normalizeWorkflowExplorationAction(raw: unknown): WorkflowExplorationAction {
  const record = requireRecord(raw, "exploration action");
  const action = stringField(record, "action");
  if (action === "call_tool") {
    return {
      action,
      toolName: stringField(record, "toolName"),
      input: record.input,
      reason: optionalString(record.reason),
      nodeId: optionalString(record.nodeId),
    };
  }
  if (action === "call_connector") {
    return {
      action,
      connectorId: stringField(record, "connectorId"),
      operation: stringField(record, "operation"),
      input: record.input,
      accountId: optionalString(record.accountId),
      reason: optionalString(record.reason),
      nodeId: optionalString(record.nodeId),
      itemKey: optionalString(record.itemKey),
    };
  }
  if (action === "call_ambient") {
    return {
      action,
      task: stringField(record, "task"),
      input: record.input,
      reason: optionalString(record.reason),
      nodeId: optionalString(record.nodeId),
    };
  }
  if (action === "finish") {
    return {
      action,
      distillation: normalizeWorkflowExplorationDistillation(record.distillation),
    };
  }
  throw new Error(`Unsupported workflow exploration action: ${action}`);
}

export function normalizeWorkflowExplorationDistillation(raw: unknown): WorkflowExplorationDistillation {
  const record = requireRecord(raw, "exploration distillation");
  const recommendedGraphResult = maybeNormalizeRecommendedGraph(record.recommendedGraph);
  const unresolvedQuestions = stringArrayField(record.unresolvedQuestions);
  if (recommendedGraphResult.error) unresolvedQuestions.push(`Invalid recommended graph omitted: ${recommendedGraphResult.error}`);
  return {
    summary: stringField(record, "summary"),
    observedCalls: arrayField(record.observedCalls).map((item, index) => {
      const call = requireRecord(item, `observedCalls[${index}]`);
      const kind = stringField(call, "kind");
      if (kind !== "tool" && kind !== "connector" && kind !== "ambient") throw new Error(`observedCalls[${index}].kind is invalid.`);
      const status = stringField(call, "status");
      if (status !== "succeeded" && status !== "failed") throw new Error(`observedCalls[${index}].status is invalid.`);
      return {
        kind,
        name: stringField(call, "name"),
        inputSummary: optionalString(call.inputSummary),
        outputSummary: optionalString(call.outputSummary),
        status,
      };
    }),
    successfulPatterns: stringArrayField(record.successfulPatterns),
    dataShapes: stringArrayField(record.dataShapes),
    requiredGrants: stringArrayField(record.requiredGrants),
    recommendedGraph: recommendedGraphResult.graph,
    recommendedManifest: isRecord(record.recommendedManifest) ? (record.recommendedManifest as Partial<WorkflowManifest>) : undefined,
    deterministicSourceStrategy: stringField(record, "deterministicSourceStrategy"),
    unresolvedQuestions,
  };
}

async function runExplorationToolAction(input: {
  input: RunWorkflowExplorationInput;
  action: Extract<WorkflowExplorationAction, { action: "call_tool" }>;
  turn: number;
  explorationId: string;
  explorationNodeId: string;
}): Promise<WorkflowExplorationObservation> {
  const { action, turn, explorationId, explorationNodeId } = input;
  if (!input.input.capabilityManifest.tools.some((tool) => tool.name === action.toolName)) {
    throw new Error(`Workflow exploration tool is not in capability manifest: ${action.toolName}`);
  }
  const handler = input.input.toolHandlers?.[action.toolName];
  if (!handler) throw new Error(`Workflow exploration has no handler for tool: ${action.toolName}`);
  return recordExplorationCall({
    eventSink: input.input.eventSink,
    explorationId,
    explorationNodeId,
    turn,
    action,
    name: action.toolName,
    eventBaseType: "exploration.tool",
    inputValue: action.input,
    runner: () => handler(action.input ?? {}),
  });
}

async function runExplorationConnectorAction(input: {
  input: RunWorkflowExplorationInput;
  action: Extract<WorkflowExplorationAction, { action: "call_connector" }>;
  turn: number;
  explorationId: string;
  explorationNodeId: string;
}): Promise<WorkflowExplorationObservation> {
  const { action, turn, explorationId, explorationNodeId } = input;
  const connector = input.input.capabilityManifest.connectors.find((candidate) => candidate.connectorId === action.connectorId);
  if (!connector) throw new Error(`Workflow exploration connector is not in capability manifest: ${action.connectorId}`);
  if (!connector.operations.some((operation) => operation.name === action.operation)) {
    throw new Error(`Workflow exploration connector operation is not in capability manifest: ${action.connectorId}.${action.operation}`);
  }
  if (!input.input.connectorCaller) throw new Error("Workflow exploration has no connector caller.");
  return recordExplorationCall({
    eventSink: input.input.eventSink,
    explorationId,
    explorationNodeId,
    turn,
    action,
    name: `${action.connectorId}.${action.operation}`,
    eventBaseType: "exploration.connector",
    inputValue: action.input,
    runner: () =>
      input.input.connectorCaller!({
        connectorId: action.connectorId,
        operation: action.operation,
        input: action.input ?? {},
        accountId: action.accountId,
        nodeId: action.nodeId ?? explorationNodeId,
        itemKey: action.itemKey,
      }),
  });
}

async function runExplorationAmbientAction(input: {
  input: RunWorkflowExplorationInput;
  action: Extract<WorkflowExplorationAction, { action: "call_ambient" }>;
  turn: number;
  explorationId: string;
  explorationNodeId: string;
}): Promise<WorkflowExplorationObservation> {
  const { action, turn, explorationId, explorationNodeId } = input;
  if (!input.input.capabilityManifest.ambient.enabled) throw new Error("Workflow exploration Ambient calls are disabled.");
  if (!input.input.ambientCaller) throw new Error("Workflow exploration has no Ambient caller.");
  return recordExplorationCall({
    eventSink: input.input.eventSink,
    explorationId,
    explorationNodeId,
    turn,
    action,
    name: action.task,
    eventBaseType: "exploration.ambient",
    inputValue: action.input,
    runner: () =>
      input.input.ambientCaller!({
        task: action.task,
        input: action.input ?? {},
        nodeId: action.nodeId ?? explorationNodeId,
        onProgress: (progress) => {
          void input.input.eventSink?.append({
            type: "exploration.ambient.progress",
            message: action.task,
            graphNodeId: explorationNodeId,
            data: { explorationId, turn, task: action.task, ...progress },
          });
        },
      }),
  });
}

async function recordExplorationCall(input: {
  eventSink?: WorkflowEventSink;
  explorationId: string;
  explorationNodeId: string;
  turn: number;
  action: Exclude<WorkflowExplorationAction, { action: "finish" }>;
  name: string;
  eventBaseType: string;
  inputValue: unknown;
  runner: () => Promise<unknown> | unknown;
}): Promise<WorkflowExplorationObservation> {
  const startedAt = Date.now();
  const observationId = randomUUID();
  await input.eventSink?.append({
    type: `${input.eventBaseType}.start`,
    message: input.name,
    graphNodeId: input.explorationNodeId,
    data: {
      explorationId: input.explorationId,
      observationId,
      turn: input.turn,
      reason: "reason" in input.action ? input.action.reason : undefined,
      nestedNodeId: "nodeId" in input.action ? input.action.nodeId : undefined,
      inputSummary: summarizeValue(input.inputValue),
    },
  });
  try {
    const output = await input.runner();
    const durationMs = Date.now() - startedAt;
    const observation: WorkflowExplorationObservation = {
      id: observationId,
      turn: input.turn,
      action: input.action.action,
      name: input.name,
      reason: "reason" in input.action ? input.action.reason : undefined,
      nodeId: "nodeId" in input.action ? input.action.nodeId : undefined,
      inputSummary: summarizeValue(input.inputValue),
      outputSummary: summarizeValue(output),
      output: boundedValue(output),
      status: "succeeded",
      durationMs,
    };
    await input.eventSink?.append({
      type: `${input.eventBaseType}.end`,
      message: input.name,
      graphNodeId: input.explorationNodeId,
      data: {
        explorationId: input.explorationId,
        observationId,
        turn: input.turn,
        durationMs,
        outputSummary: observation.outputSummary,
      },
    });
    return observation;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const observation: WorkflowExplorationObservation = {
      id: observationId,
      turn: input.turn,
      action: input.action.action,
      name: input.name,
      reason: "reason" in input.action ? input.action.reason : undefined,
      nodeId: "nodeId" in input.action ? input.action.nodeId : undefined,
      inputSummary: summarizeValue(input.inputValue),
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    };
    await input.eventSink?.append({
      type: `${input.eventBaseType}.error`,
      message: input.name,
      graphNodeId: input.explorationNodeId,
      data: {
        explorationId: input.explorationId,
        observationId,
        turn: input.turn,
        durationMs,
        error: observation.error,
      },
    });
    return observation;
  }
}

function compactCapabilityManifest(manifest: WorkflowExplorationCapabilityManifest): WorkflowExplorationCapabilityManifest {
  return {
    ...manifest,
    tools: manifest.tools.map((tool) => ({
      ...tool,
      inputSchema: tool.inputSchema,
    })),
    connectors: manifest.connectors.map((connector) => ({
      ...connector,
      operations: connector.operations.map((operation) => ({
        ...operation,
        inputSchema: operation.inputSchema,
      })),
    })),
  };
}

function compactObservationForPrompt(observation: WorkflowExplorationObservation): Omit<WorkflowExplorationObservation, "id"> {
  return {
    turn: observation.turn,
    action: observation.action,
    name: observation.name,
    reason: observation.reason,
    nodeId: observation.nodeId,
    inputSummary: observation.inputSummary,
    outputSummary: observation.outputSummary,
    output: observation.output,
    status: observation.status,
    error: observation.error,
    durationMs: observation.durationMs,
  };
}

function compactActionForEvent(action: WorkflowExplorationAction): Record<string, unknown> {
  if (action.action === "finish") return { action: "finish", summary: action.distillation.summary };
  return {
    ...action,
    input: summarizeValue(action.input),
  };
}

function compactDistillationForEvent(distillation: WorkflowExplorationDistillation): Record<string, unknown> {
  return {
    summary: distillation.summary,
    observedCallCount: distillation.observedCalls.length,
    successfulPatterns: distillation.successfulPatterns.slice(0, 5),
    requiredGrants: distillation.requiredGrants.slice(0, 5),
    unresolvedQuestions: distillation.unresolvedQuestions.slice(0, 5),
  };
}

function enforceCallBudget(kind: string, count: number, max: number): void {
  if (count > max) throw new Error(`Workflow exploration exceeded max ${kind} calls (${max}).`);
}

function enforceElapsedBudget(startedAt: number, maxElapsedMs: number): void {
  const elapsed = Date.now() - startedAt;
  if (elapsed > maxElapsedMs) throw new Error(`Workflow exploration exceeded max elapsed time (${maxElapsedMs}ms).`);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("Workflow exploration canceled.");
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Workflow exploration provider did not return JSON.");
  }
}

function normalizeRecommendedGraph(raw: unknown): WorkflowExplorationDistillation["recommendedGraph"] {
  if (raw === undefined || raw === null) return undefined;
  const record = requireRecord(raw, "recommendedGraph");
  return {
    summary: stringField(record, "summary"),
    nodes: arrayField(record.nodes).map((node, index) => {
      const object = requireRecord(node, `recommendedGraph.nodes[${index}]`);
      return {
        id: stringField(object, "id"),
        type: stringField(object, "type") as WorkflowGraphNode["type"],
        label: stringField(object, "label"),
        description: optionalString(object.description),
        modelRole: optionalString(object.modelRole),
        dataSummary: optionalString(object.dataSummary),
        inputSummary: optionalString(object.inputSummary),
        outputSummary: optionalString(object.outputSummary),
        toolNames: stringArrayField(object.toolNames),
        connectorIds: stringArrayField(object.connectorIds),
        retryPolicy: optionalString(object.retryPolicy),
        retentionPolicy: optionalString(object.retentionPolicy),
        reviewPolicy: optionalString(object.reviewPolicy),
      };
    }),
    edges: arrayField(record.edges).map((edge, index) => {
      const object = requireRecord(edge, `recommendedGraph.edges[${index}]`);
      return {
        id: stringField(object, "id"),
        source: stringField(object, "source"),
        target: stringField(object, "target"),
        type: stringField(object, "type") as WorkflowGraphEdge["type"],
        label: optionalString(object.label),
        dataSummary: optionalString(object.dataSummary),
      };
    }),
  };
}

function maybeNormalizeRecommendedGraph(raw: unknown): {
  graph?: WorkflowExplorationDistillation["recommendedGraph"];
  error?: string;
} {
  if (raw === undefined || raw === null) return {};
  try {
    return { graph: normalizeRecommendedGraph(raw) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function boundedValue(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return value.length > 8_000 ? `${value.slice(0, 8_000)}...` : value;
  try {
    const json = JSON.stringify(value);
    if (json.length <= 8_000) return value;
    return `${json.slice(0, 8_000)}...`;
  } catch {
    return summarizeValue(value);
  }
}

function summarizeValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return truncate(value.replace(/\s+/g, " ").trim(), 320);
  try {
    return truncate(JSON.stringify(value), 320);
  } catch {
    return truncate(String(value), 320);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string.`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArrayField(value: unknown): string[] {
  return arrayField(value).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}
