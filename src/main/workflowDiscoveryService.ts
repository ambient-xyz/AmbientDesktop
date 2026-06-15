import { randomUUID } from "node:crypto";
import type {
  AnswerWorkflowDiscoveryQuestionInput,
  AmbientPermissionGrant,
  PermissionAuditDecisionSource,
  PermissionGrantScopeKind,
  PermissionGrantTargetKind,
  StartWorkflowDiscoveryInput,
  StartWorkflowRevisionDiscoveryInput,
  ResolveWorkflowDiscoveryAccessRequestInput,
  WorkflowAgentDiscoveryResult,
  WorkflowDiscoveryAccessRequest,
  WorkflowDiscoveryActivityEvent,
  WorkflowDiscoveryContextEvidence,
  WorkflowDiscoveryContextCapability,
  WorkflowDiscoveryQuestion,
  WorkflowDiscoveryQuestionCategory,
  WorkflowDiscoveryGraphPatch,
  WorkflowDiscoveryProgress,
  WorkflowGraphSnapshot,
  WorkflowRevisionSummary,
  PermissionMode,
  SearchRoutingSettings,
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
} from "../shared/types";
import { workflowDiscoveryGraph } from "../shared/workflowDiscovery";
import { applyWorkflowDiscoveryGraphPatch, validateWorkflowDiscoveryGraphPatch } from "../shared/workflowDiscoveryGraphPatch";
import { isRetryableAmbientProviderError } from "./aggressiveRetries";
import { searchAmbientCliCapabilities, type AmbientCliCapabilitySearchResponse } from "./ambientCliPackages";
import type { ProjectStore } from "./projectStore";
import type { PluginMcpToolRegistration } from "./plugins/pluginHost";
import type { WorkflowConnectorDescriptor } from "./workflowConnectors";
import { DefaultWorkflowDiscoveryContextGatherer, type WorkflowDiscoveryContextGatherer } from "./workflowDiscoveryContextGatherer";
import {
  describeWorkflowDiscoveryCapability,
  searchWorkflowDiscoveryCapabilities,
  workflowDiscoveryCapabilityAwarePolicySummary,
} from "./workflowDiscoveryCapabilitySearch";
import {
  buildWorkflowDiscoveryPolicyContext,
  workflowDiscoveryProviderPolicyPayload,
  type WorkflowDiscoveryAmbientCliCapability,
  type WorkflowDiscoveryPolicyContext,
  type WorkflowDiscoveryPolicyDecision,
  type WorkflowDiscoveryRequestedContextAccess,
  type WorkflowDiscoveryStage,
} from "./workflowDiscoveryPolicy";
import {
  DeterministicWorkflowDiscoveryProvider,
  REQUIRED_WORKFLOW_DISCOVERY_CATEGORIES,
  type WorkflowDiscoveryProvider,
  type WorkflowDiscoveryProviderGenerateOptions,
  type WorkflowDiscoveryProviderInput,
  type WorkflowDiscoveryProviderOutput,
} from "./workflowDiscoveryProvider";

export interface WorkflowDiscoveryServiceOptions {
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  provider?: WorkflowDiscoveryProvider;
  fallbackProvider?: WorkflowDiscoveryProvider;
  pluginRegistrations?: PluginMcpToolRegistration[];
  ambientCliCapabilities?: WorkflowDiscoveryAmbientCliCapability[];
  ambientCliCapabilitySearch?: (workspacePath: string, query: string) => Promise<AmbientCliCapabilitySearchResponse> | AmbientCliCapabilitySearchResponse;
  searchRoutingSettings?: SearchRoutingSettings;
  permissionMode?: PermissionMode;
  permissionAuditThreadId?: string;
  workspacePath?: string;
  contextGatherer?: WorkflowDiscoveryContextGatherer;
  onProgress?: (progress: WorkflowDiscoveryProgress) => void;
}

export async function startWorkflowDiscovery(
  store: ProjectStore,
  input: StartWorkflowDiscoveryInput,
  options: WorkflowDiscoveryServiceOptions = {},
): Promise<WorkflowAgentDiscoveryResult> {
  const initialRequest = input.initialRequest.trim();
  if (!initialRequest) throw new Error("Workflow discovery requires an initial request.");
  const workspace = store.getWorkspace();
  const projectPath = input.projectPath || workspace.path;
  const thread = store.createWorkflowAgentThreadSummary({
    title: input.title,
    initialRequest,
    projectPath,
    folderId: input.folderId,
    traceMode: input.traceMode,
    phase: "discovery",
  });
  const policyContext = await discoveryPolicyContextForThread(store, options, {
    workflowThreadId: thread.id,
    projectPath,
    stage: "initial_discovery",
    requestText: initialRequest,
  });
  auditWorkflowDiscoveryPolicyDecisions(store, policyContext, options);
  const providerContext = workflowDiscoveryProviderContext(policyContext, initialRequest);
  let output: WorkflowDiscoveryProviderOutput;
  try {
    output = await appendDiscoveryQuestions(store, options, {
      workflowThreadId: thread.id,
      request: initialRequest,
      projectPath: thread.projectPath,
      policyContext,
      ...providerContext,
      remainingCategories: REQUIRED_WORKFLOW_DISCOVERY_CATEGORIES.slice(0, 3),
    });
  } catch (error) {
    store.updateWorkflowAgentThreadPhase(thread.id, "failed");
    throw error;
  }
  writeDiscoveryGraph(store, thread.id, output.graphPatch);
  return {
    folders: store.listWorkflowAgentFolders(),
    thread: store.getWorkflowAgentThreadSummary(thread.id),
  };
}

export async function startWorkflowRevisionDiscovery(
  store: ProjectStore,
  input: StartWorkflowRevisionDiscoveryInput,
  options: WorkflowDiscoveryServiceOptions = {},
): Promise<WorkflowAgentDiscoveryResult> {
  const thread = store.getWorkflowAgentThreadSummary(input.workflowThreadId);
  const artifact = store.getWorkflowArtifact(input.artifactId);
  if (artifact.workflowThreadId !== thread.id) {
    throw new Error(`Workflow artifact ${artifact.id} does not belong to workflow thread ${thread.id}.`);
  }
  const requestedChange =
    input.requestedChange?.trim() ||
    [
      `Revise workflow "${artifact.title}".`,
      artifact.spec.goal ? `Current goal: ${artifact.spec.goal}` : undefined,
      "Ask what should change before compiling a proposed revision.",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  const baseVersion = store.listWorkflowVersions(thread.id).find((version) => version.artifactId === artifact.id) ?? thread.latestVersion;
  const revision = store.createWorkflowRevision({
    workflowThreadId: thread.id,
    baseVersionId: baseVersion?.id,
    baseArtifactId: artifact.id,
    requestedChange,
    status: "draft",
  });
  const policyContext = await discoveryPolicyContextForThread(store, options, {
    workflowThreadId: thread.id,
    projectPath: thread.projectPath,
    stage: "revision_discovery",
    requestText: requestedChange,
  });
  auditWorkflowDiscoveryPolicyDecisions(store, policyContext, options);
  const providerContext = workflowDiscoveryProviderContext(policyContext, requestedChange);
  const output = await appendDiscoveryQuestions(store, options, {
    workflowThreadId: thread.id,
    revisionId: revision.id,
    request: requestedChange,
    projectPath: thread.projectPath,
    policyContext,
    ...providerContext,
    remainingCategories: REQUIRED_WORKFLOW_DISCOVERY_CATEGORIES.slice(0, 3),
    currentGraph: latestGraphSnapshot(store, thread.id),
    revisionContext: {
      baseTitle: artifact.title,
      baseGoal: artifact.spec.goal,
      baseSummary: artifact.spec.summary,
      requestedChange,
    },
  });
  writeDiscoveryGraph(store, thread.id, output.graphPatch);
  return {
    folders: store.listWorkflowAgentFolders(),
    thread: store.getWorkflowAgentThreadSummary(thread.id),
  };
}

export async function answerWorkflowDiscoveryQuestion(
  store: ProjectStore,
  input: AnswerWorkflowDiscoveryQuestionInput,
  options: WorkflowDiscoveryServiceOptions = {},
): Promise<WorkflowAgentDiscoveryResult> {
  const question = store.answerWorkflowDiscoveryQuestion(input);
  const questions = store.listWorkflowDiscoveryQuestions(question.workflowThreadId);
  const activeRevision = question.revisionId ? store.getWorkflowRevision(question.revisionId) : undefined;
  const relevantQuestions = question.revisionId ? questions.filter((item) => item.revisionId === question.revisionId) : questions.filter((item) => !item.revisionId);
  const allAnswered = relevantQuestions.length > 0 && relevantQuestions.every((item) => item.answer);
  let graphPatch: WorkflowDiscoveryGraphPatch | undefined;
  if (allAnswered) {
    const remainingCategories = remainingRequiredCategories(relevantQuestions);
    if (remainingCategories.length) {
      const thread = store.getWorkflowAgentThreadSummary(question.workflowThreadId);
      const revisionContext = activeRevision ? revisionDiscoveryContext(store, activeRevision) : undefined;
      const policyContext = await discoveryPolicyContextForThread(store, options, {
        workflowThreadId: question.workflowThreadId,
        projectPath: thread.projectPath,
        stage: activeRevision ? "revision_discovery" : "followup_discovery",
        requestText: activeRevision?.requestedChange ?? thread.initialRequest,
      });
      auditWorkflowDiscoveryPolicyDecisions(store, policyContext, options);
      const providerContext = workflowDiscoveryProviderContext(policyContext, activeRevision?.requestedChange ?? thread.initialRequest);
      try {
        const output = await appendDiscoveryQuestions(store, options, {
          workflowThreadId: question.workflowThreadId,
          revisionId: question.revisionId,
          request: activeRevision?.requestedChange ?? thread.initialRequest,
          projectPath: thread.projectPath,
          policyContext,
          ...providerContext,
          remainingCategories,
          existingQuestions: relevantQuestions,
          currentGraph: latestGraphSnapshot(store, question.workflowThreadId),
          revisionContext,
        });
        graphPatch = output.graphPatch;
      } catch (error) {
        const latestQuestion = store.getWorkflowDiscoveryQuestion(question.id);
        store.updateWorkflowDiscoveryActivityEvents({
          questionId: question.id,
          activityEvents: workflowDiscoveryProviderErrorActivityEvents(latestQuestion.activityEvents, error),
        });
        store.clearWorkflowDiscoveryQuestionAnswer(question.id);
        throw error;
      }
    } else if (question.revisionId) {
      store.updateWorkflowAgentThreadPhase(question.workflowThreadId, "revision");
    } else {
      store.updateWorkflowAgentThreadPhase(question.workflowThreadId, "planned");
    }
  }
  writeDiscoveryGraph(store, question.workflowThreadId, graphPatch);
  return {
    folders: store.listWorkflowAgentFolders(),
    thread: store.getWorkflowAgentThreadSummary(question.workflowThreadId),
  };
}

export async function resolveWorkflowDiscoveryAccessRequest(
  store: ProjectStore,
  input: ResolveWorkflowDiscoveryAccessRequestInput,
  options: WorkflowDiscoveryServiceOptions = {},
): Promise<WorkflowAgentDiscoveryResult> {
  const question = store.getWorkflowDiscoveryQuestion(input.questionId);
  const accessRequest = question.accessRequests?.find((request) => request.id === input.accessRequestId);
  if (!accessRequest) throw new Error(`Workflow discovery access request not found: ${input.accessRequestId}`);
  const thread = store.getWorkflowAgentThreadSummary(question.workflowThreadId);
  const resolvedAt = new Date().toISOString();
  const response = input.response;
  const reusableScope = response === "deny" || response === "allow_once" ? undefined : discoveryGrantScopeKindForResponse(response);
  if (reusableScope && !accessRequest.reusableScopes.includes(reusableScope)) {
    throw new Error(`Workflow discovery access request ${accessRequest.id} does not allow ${reusableScope} grants.`);
  }
  const grant =
    response !== "deny" && response !== "allow_once"
      ? store.createPermissionGrant({
          permissionModeAtCreation: options.permissionMode ?? "workspace",
          scopeKind: reusableScope!,
          threadId: response === "always_thread" ? options.permissionAuditThreadId : undefined,
          workflowThreadId: response === "always_workflow" ? question.workflowThreadId : undefined,
          projectPath: response === "always_project" ? thread.projectPath : undefined,
          workspacePath: response === "always_workspace" ? options.workspacePath ?? store.getWorkspace().path : undefined,
          actionKind: accessRequest.actionKind,
          targetKind: accessRequest.targetKind,
          targetHash: accessRequest.targetHash,
          targetLabel: accessRequest.targetLabel,
          conditions: { discoveryOnly: true, capability: accessRequest.capability },
          source: "workflow_review",
          reason: `Allowed workflow discovery context: ${accessRequest.capability.replace(/_/g, " ")}.`,
        })
      : undefined;
  const resolvedStatus: WorkflowDiscoveryAccessRequest["status"] = response === "deny" ? "denied" : "allowed";
  const evidence =
    response === "deny"
      ? undefined
      : await gatherWorkflowDiscoveryAccessEvidence(store, {
          accessRequest,
          options,
          thread,
        });
  const updatedAccessRequests: WorkflowDiscoveryAccessRequest[] = (question.accessRequests ?? []).map((request) =>
    request.id === accessRequest.id
      ? {
          ...request,
          status: resolvedStatus,
          response,
          grantId: grant?.id,
          resolvedAt,
          evidence,
        }
      : request,
  );
  store.updateWorkflowDiscoveryAccessRequests({ questionId: question.id, accessRequests: updatedAccessRequests });
  store.updateWorkflowDiscoveryActivityEvents({
    questionId: question.id,
    activityEvents: workflowDiscoveryAccessActivityEvents(question.activityEvents, accessRequest, response, evidence, resolvedAt),
  });
  auditWorkflowDiscoveryAccessResolution(store, {
    accessRequest,
    grant,
    options,
    response,
  });
  return {
    folders: store.listWorkflowAgentFolders(),
    thread: store.getWorkflowAgentThreadSummary(thread.id),
  };
}

async function appendDiscoveryQuestions(
  store: ProjectStore,
  options: WorkflowDiscoveryServiceOptions,
  input: WorkflowDiscoveryProviderInput & { revisionId?: string },
): Promise<WorkflowDiscoveryProviderOutput> {
  const operationId = randomUUID();
  const emitProgress = (progress: Omit<WorkflowDiscoveryProgress, "operationId" | "workflowThreadId" | "revisionId" | "createdAt">) => {
    options.onProgress?.({
      operationId,
      workflowThreadId: input.workflowThreadId,
      revisionId: input.revisionId,
      createdAt: new Date().toISOString(),
      ...progress,
    });
  };
  emitProgress({
    phase: "context",
    status: "completed",
    message: "Prepared workflow discovery context.",
    metrics: {
      fileCount: input.policyContext.files.length,
      connectorCount: input.policyContext.connectors.length,
      pluginToolCount: input.policyContext.pluginTools.length,
      evidenceCount: input.policyContext.contextEvidence.length,
      capabilityResultCount: input.capabilitySearch?.results.length ?? 0,
    },
  });
  emitProgress({
    phase: "model",
    status: "running",
    message: "Waiting for the Pi discovery response.",
  });
  const providerStartedAt = Date.now();
  let output: WorkflowDiscoveryProviderOutput;
  try {
    output = await generateDiscoveryQuestions(options, input, {
      onProgress: (progress) =>
        emitProgress({
          phase: "model",
          status: "running",
          message:
            progress.stage === "retrying"
              ? "Retrying Pi discovery after an empty response."
              : progress.outputChars > 0
              ? "Receiving the Pi discovery response."
              : progress.thinkingChars > 0
                ? "Pi is thinking through discovery questions."
                : "Waiting for the Pi discovery response.",
          metrics: {
            responseChars: progress.outputChars,
            thinkingChars: progress.thinkingChars,
            providerElapsedMs: progress.elapsedMs,
            ...(progress.idleElapsedMs !== undefined ? { idleElapsedMs: progress.idleElapsedMs } : {}),
            ...(progress.idleTimeoutMs !== undefined ? { idleTimeoutMs: progress.idleTimeoutMs } : {}),
            ...(progress.absoluteTimeoutMs !== undefined ? { absoluteTimeoutMs: progress.absoluteTimeoutMs } : {}),
            ...(progress.timeoutMode ? { timeoutMode: progress.timeoutMode } : {}),
            providerStage: progress.stage,
          },
        }),
    });
  } catch (error) {
    emitProgress({
      phase: "failed",
      status: "failed",
      message: "Workflow discovery question generation failed.",
      error: errorMessage(error),
    });
    throw error;
  }
  const providerDurationMs = Date.now() - providerStartedAt;
  emitProgress({
    phase: "model",
    status: "completed",
    message: output.provider === "ambient" ? "Received the Pi discovery response." : "Generated deterministic discovery questions.",
    provider: output.provider,
    providerModel: output.providerModel,
    metrics: {
      questionCount: output.questions.length,
      responseChars: output.telemetry?.responseCharCount ?? 0,
      providerElapsedMs: output.telemetry?.durationMs ?? providerDurationMs,
    },
  });
  const patchResult = validateWorkflowDiscoveryGraphPatch(output.graphPatch, {
    currentGraph: input.currentGraph,
    allowedConnectorIds: input.policyContext.connectors.map((connector) => connector.connectorId),
  });
  const blockedReasons = mergeBlockedReasons(
    output.blockedReasons,
    discoveryPolicyBlockedReasons(input.policyContext),
    patchResult.blockedReasons,
    patchResult.graphPatch?.blockedReasons,
  );
  const accessRequests = discoveryAccessRequests(input.policyContext);
  const batchActivityEvents = workflowDiscoveryBatchActivityEvents({
    policyContext: input.policyContext,
    capabilitySearch: input.capabilitySearch,
    capabilityDescriptions: input.capabilityDescriptions,
    output,
    accessRequests,
    providerDurationMs,
    requestedProvider: Boolean(options.provider),
    patchBlockedReasons: patchResult.blockedReasons,
    appliedGraphPatch: patchResult.graphPatch,
  });
  emitProgress({
    phase: "completed",
    status: "completed",
    message: "Workflow discovery question batch is ready.",
    provider: output.provider,
    providerModel: output.providerModel,
    metrics: {
      questionCount: output.questions.length,
      responseChars: output.telemetry?.responseCharCount ?? 0,
      providerElapsedMs: output.telemetry?.durationMs ?? providerDurationMs,
    },
  });
  for (const [index, question] of output.questions.entries()) {
    store.createWorkflowDiscoveryQuestion({
      workflowThreadId: input.workflowThreadId,
      revisionId: input.revisionId,
      category: question.category,
      context: question.context,
      question: question.question,
      choices: question.choices,
      allowFreeform: question.allowFreeform,
      graphImpact: question.graphImpact,
      provider: output.provider,
      providerModel: output.providerModel,
      policyContextSummary: input.policyContextSummary,
      capabilitySearch: input.capabilitySearch,
      capabilityDescriptions: input.capabilityDescriptions,
      blockedReasons: mergeBlockedReasons(blockedReasons, question.blockedReasons),
      accessRequests: index === 0 ? accessRequests : undefined,
      activityEvents: index === 0 ? batchActivityEvents : undefined,
      cacheCheckpoint: output.cacheCheckpoint,
      graphPatch: patchResult.graphPatch,
    });
  }
  return { ...output, blockedReasons, graphPatch: patchResult.graphPatch };
}

function workflowDiscoveryBatchActivityEvents(input: {
  policyContext: WorkflowDiscoveryPolicyContext;
  capabilitySearch?: WorkflowDiscoveryCapabilitySearch;
  capabilityDescriptions?: WorkflowDiscoveryCapabilityDescription[];
  output: WorkflowDiscoveryProviderOutput;
  accessRequests?: WorkflowDiscoveryAccessRequest[];
  providerDurationMs: number;
  requestedProvider: boolean;
  patchBlockedReasons?: string[];
  appliedGraphPatch?: WorkflowDiscoveryGraphPatch;
}): WorkflowDiscoveryActivityEvent[] {
  const now = new Date().toISOString();
  const events: WorkflowDiscoveryActivityEvent[] = [
    discoveryActivityEvent("scan", "completed", "Scanned base directory", {
      detail: `${input.policyContext.files.length} candidate file${input.policyContext.files.length === 1 ? "" : "s"}, ${input.policyContext.skippedPaths.length} skipped path${input.policyContext.skippedPaths.length === 1 ? "" : "s"}.`,
      createdAt: now,
    }),
  ];
  if (input.policyContext.contextEvidence.length) {
    events.push(
      discoveryActivityEvent("evidence_gather", "completed", "Used approved context evidence", {
        detail: `${input.policyContext.contextEvidence.length} evidence receipt${input.policyContext.contextEvidence.length === 1 ? "" : "s"} included in discovery context.`,
        createdAt: now,
      }),
    );
  }
  if (input.capabilitySearch) {
    events.push(
      discoveryActivityEvent("capability_search", "completed", "Searched workflow capabilities", {
        detail: input.capabilitySearch.results.length
          ? `${input.capabilitySearch.results.length} request-specific match${input.capabilitySearch.results.length === 1 ? "" : "es"}: ${input.capabilitySearch.results.map((result) => result.label).slice(0, 4).join(", ")}.`
          : "No request-specific connector or plugin matches found; discovery may ask about browser, files, or manual inputs.",
        createdAt: now,
      }),
    );
  }
  if (input.capabilityDescriptions?.length) {
    events.push(
      discoveryActivityEvent("capability_search", "completed", "Described workflow capabilities", {
        detail: `${input.capabilityDescriptions.length} capability description${input.capabilityDescriptions.length === 1 ? "" : "s"} prepared: ${input.capabilityDescriptions.map((description) => description.label).slice(0, 4).join(", ")}.`,
        createdAt: now,
      }),
    );
  }
  if (input.accessRequests?.length) {
    events.push(
      discoveryActivityEvent("access_request", "pending", "Requested additional context", {
        detail: `${input.accessRequests.length} access request${input.accessRequests.length === 1 ? "" : "s"} surfaced for user review.`,
        createdAt: now,
      }),
    );
  }
  events.push(
    discoveryActivityEvent("provider_wait", "completed", input.output.provider === "ambient" ? "Ambient/Pi generated discovery questions" : "Generated deterministic discovery questions", {
      detail: `${input.output.questions.length} question${input.output.questions.length === 1 ? "" : "s"} returned by ${input.output.provider}${input.output.providerModel ? ` (${input.output.providerModel})` : ""}.${input.output.telemetry?.responseCharCount !== undefined ? ` Response: ${input.output.telemetry.responseCharCount.toLocaleString()} chars.` : ""}`,
      durationMs: input.providerDurationMs,
      createdAt: now,
    }),
  );
  if (input.requestedProvider && input.output.provider === "deterministic" && input.output.blockedReasons?.some((reason) => /fallback|Ambient discovery/i.test(reason))) {
    events.push(
      discoveryActivityEvent("provider_fallback", "completed", "Discovery fallback used", {
        detail: input.output.blockedReasons.find((reason) => /fallback|Ambient discovery/i.test(reason)),
        createdAt: now,
      }),
    );
  }
  events.push(
    discoveryActivityEvent("question_generated", "completed", "Discovery question batch ready", {
      detail: `${input.output.questions.map((question) => question.category.replace(/_/g, " ")).join(", ")}.`,
      createdAt: now,
    }),
  );
  if (input.appliedGraphPatch) {
    events.push(
      discoveryActivityEvent("graph_patch", "completed", "Updated workflow diagram", {
        detail: input.appliedGraphPatch.summary ?? "Applied provider graph patch.",
        createdAt: now,
      }),
    );
  } else if (input.patchBlockedReasons?.length) {
    events.push(
      discoveryActivityEvent("graph_patch", "failed", "Ignored graph patch", {
        detail: input.patchBlockedReasons[0],
        createdAt: now,
      }),
    );
  } else {
    events.push(
      discoveryActivityEvent("graph_patch", "skipped", "No graph patch returned", {
        detail: "The diagram stayed on the deterministic discovery projection for this batch.",
        createdAt: now,
      }),
    );
  }
  return events;
}

function workflowDiscoveryProviderContext(
  policyContext: WorkflowDiscoveryPolicyContext,
  request: string,
): Pick<WorkflowDiscoveryProviderInput, "capabilitySearch" | "capabilityDescriptions" | "policyContextSummary"> {
  const capabilitySearch = searchWorkflowDiscoveryCapabilities({ query: request, context: policyContext });
  const capabilityDescriptions = workflowDiscoveryCapabilityDescriptions(policyContext, capabilitySearch);
  return {
    capabilitySearch,
    capabilityDescriptions,
    policyContextSummary: workflowDiscoveryCapabilityAwarePolicySummary(policyContext, capabilitySearch),
  };
}

function workflowDiscoveryCapabilityDescriptions(
  policyContext: WorkflowDiscoveryPolicyContext,
  capabilitySearch: WorkflowDiscoveryCapabilitySearch,
): WorkflowDiscoveryCapabilityDescription[] {
  const candidates = capabilitySearch.results
    .map((result, index) => ({
      result,
      index,
      priority:
        result.recommendation === "blocked"
          ? 0
          : result.recommendation === "recommended"
            ? 1
            : result.recommendation === "available"
              ? 2
              : 3,
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index);
  const descriptions: WorkflowDiscoveryCapabilityDescription[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.result.id)) continue;
    seen.add(candidate.result.id);
    const description = describeWorkflowDiscoveryCapability({
      capabilityId: candidate.result.id,
      query: capabilitySearch.query,
      context: policyContext,
    });
    if (description) descriptions.push(description);
    if (descriptions.length >= 4) break;
  }
  return descriptions;
}

function workflowDiscoveryAccessActivityEvents(
  existingEvents: WorkflowDiscoveryActivityEvent[] | undefined,
  accessRequest: WorkflowDiscoveryAccessRequest,
  response: ResolveWorkflowDiscoveryAccessRequestInput["response"],
  evidence: WorkflowDiscoveryContextEvidence | undefined,
  createdAt: string,
): WorkflowDiscoveryActivityEvent[] {
  const status: WorkflowDiscoveryActivityEvent["status"] = response === "deny" ? "failed" : "completed";
  const events = [
    ...(existingEvents ?? []),
    discoveryActivityEvent("access_request", status, response === "deny" ? "Context access denied" : "Context access approved", {
      detail:
        response === "deny"
          ? `${accessRequest.targetLabel} was denied for discovery.`
          : `${accessRequest.targetLabel} was approved for discovery with ${discoveryAccessResponseLabel(response)}.`,
      targetLabel: accessRequest.targetLabel,
      createdAt,
    }),
  ];
  if (evidence) {
    events.push(
      discoveryActivityEvent("evidence_gather", evidence.error ? "failed" : "completed", evidence.error ? "Evidence gathering failed" : "Evidence gathered", {
        detail: evidence.error ? `${evidence.summary} ${evidence.error}` : evidence.summary,
        targetLabel: evidence.targetLabel,
        evidenceId: evidence.id,
        durationMs: evidence.timingMs,
        createdAt: evidence.gatheredAt,
      }),
    );
  }
  return events;
}

function workflowDiscoveryProviderErrorActivityEvents(
  existingEvents: WorkflowDiscoveryActivityEvent[] | undefined,
  error: unknown,
): WorkflowDiscoveryActivityEvent[] {
  return [
    ...(existingEvents ?? []),
    discoveryActivityEvent("provider_wait", "failed", "Ambient/Pi discovery paused", {
      detail: `${errorMessage(error)} Fix Ambient access, credits, or provider availability, then answer the question again to retry follow-up generation.`,
      createdAt: new Date().toISOString(),
    }),
  ];
}

function discoveryActivityEvent(
  kind: WorkflowDiscoveryActivityEvent["kind"],
  status: WorkflowDiscoveryActivityEvent["status"],
  label: string,
  input: { detail?: string; targetLabel?: string; evidenceId?: string; durationMs?: number; createdAt: string },
): WorkflowDiscoveryActivityEvent {
  return {
    id: `discovery-activity-${kind}-${input.createdAt.replace(/[^0-9]/g, "")}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}`,
    kind,
    status,
    label,
    detail: input.detail,
    targetLabel: input.targetLabel,
    evidenceId: input.evidenceId,
    durationMs: input.durationMs,
    createdAt: input.createdAt,
  };
}

function discoveryAccessResponseLabel(response: ResolveWorkflowDiscoveryAccessRequestInput["response"]): string {
  if (response === "allow_once") return "allow once";
  if (response === "always_thread") return "always for chat thread";
  if (response === "always_workflow") return "always for workflow";
  if (response === "always_project") return "always for project";
  if (response === "always_workspace") return "always for workspace";
  return "deny";
}

async function discoveryPolicyContextForThread(
  store: ProjectStore,
  options: WorkflowDiscoveryServiceOptions,
  input: { workflowThreadId: string; projectPath: string; stage: WorkflowDiscoveryStage; requestText?: string },
): Promise<WorkflowDiscoveryPolicyContext> {
  const workspacePath = options.workspacePath ?? store.getWorkspace().path;
  const ambientCliCapabilities = await workflowDiscoveryAmbientCliCapabilitiesForRequest(workspacePath, input.requestText, options);
  return buildWorkflowDiscoveryPolicyContext({
    projectPath: input.projectPath,
    workspacePath,
    permissionMode: options.permissionMode ?? "workspace",
    stage: input.stage,
    workflowThreadId: input.workflowThreadId,
    threadId: options.permissionAuditThreadId ?? input.workflowThreadId,
    grants: [
      ...store.listPermissionGrants(),
      ...workflowDiscoveryOneShotGrants(store, input.workflowThreadId, {
        permissionMode: options.permissionMode ?? "workspace",
        projectPath: input.projectPath,
        workspacePath: options.workspacePath ?? store.getWorkspace().path,
      }),
    ],
    connectorDescriptors: options.connectorDescriptors,
    pluginRegistrations: options.pluginRegistrations,
    ambientCliCapabilities,
    ...(options.searchRoutingSettings ? { searchRoutingSettings: options.searchRoutingSettings } : {}),
    requestedContextAccess: workflowDiscoveryRequestedContextAccess(input.requestText, options, ambientCliCapabilities),
    contextEvidence: workflowDiscoveryApprovedContextEvidence(store, input.workflowThreadId),
  });
}

async function workflowDiscoveryAmbientCliCapabilitiesForRequest(
  workspacePath: string,
  requestText: string | undefined,
  options: WorkflowDiscoveryServiceOptions,
): Promise<WorkflowDiscoveryAmbientCliCapability[]> {
  if (options.ambientCliCapabilities) return options.ambientCliCapabilities;
  const query = (requestText ?? "").trim();
  if (!query) return [];
  try {
    const search =
      options.ambientCliCapabilitySearch
        ? await options.ambientCliCapabilitySearch(workspacePath, query)
        : await searchAmbientCliCapabilities(workspacePath, {
            query,
            kind: "command",
            limit: 6,
            includeHealth: false,
          });
    return workflowDiscoveryAmbientCliCapabilitiesFromSearch(search)
      .filter((capability) => capability.availability === "available")
      .slice(0, 8);
  } catch {
    return [];
  }
}

function workflowDiscoveryAmbientCliCapabilitiesFromSearch(
  response: AmbientCliCapabilitySearchResponse,
): WorkflowDiscoveryAmbientCliCapability[] {
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

async function gatherWorkflowDiscoveryAccessEvidence(
  store: ProjectStore,
  input: {
    accessRequest: WorkflowDiscoveryAccessRequest;
    options: WorkflowDiscoveryServiceOptions;
    thread: ReturnType<ProjectStore["getWorkflowAgentThreadSummary"]>;
  },
): Promise<WorkflowDiscoveryContextEvidence | undefined> {
  if (!shouldGatherDiscoveryAccessEvidence(input.accessRequest)) return undefined;
  const gatherer = input.options.contextGatherer ?? new DefaultWorkflowDiscoveryContextGatherer();
  return gatherer.gather({
    workflowThreadId: input.thread.id,
    projectPath: input.thread.projectPath,
    requestText: input.thread.initialRequest,
    accessRequest: input.accessRequest,
    connectorDescriptors: input.options.connectorDescriptors,
    pluginRegistrations: input.options.pluginRegistrations,
  });
}

function workflowDiscoveryApprovedContextEvidence(store: ProjectStore, workflowThreadId: string): WorkflowDiscoveryContextEvidence[] {
  const evidence = new Map<string, WorkflowDiscoveryContextEvidence>();
  for (const question of store.listWorkflowDiscoveryQuestions(workflowThreadId)) {
    for (const request of question.accessRequests ?? []) {
      if (request.status !== "allowed" || !request.evidence) continue;
      evidence.set(request.evidence.id, request.evidence);
    }
  }
  return [...evidence.values()].sort((left, right) => left.gatheredAt.localeCompare(right.gatheredAt));
}

function shouldGatherDiscoveryAccessEvidence(accessRequest: WorkflowDiscoveryAccessRequest): boolean {
  return [
    "connector_account_data",
    "connector_content",
    "plugin_tool_execute",
    "browser_network",
    "browser_control",
    "browser_profile",
    "shell_command",
  ].includes(accessRequest.capability);
}

function workflowDiscoveryRequestedContextAccess(
  requestText: string | undefined,
  options: WorkflowDiscoveryServiceOptions,
  ambientCliCapabilities: WorkflowDiscoveryAmbientCliCapability[] = [],
): WorkflowDiscoveryRequestedContextAccess[] {
  const request = (requestText ?? "").trim();
  if (!request) return [];
  const normalized = request.toLowerCase();
  const requests = new Map<string, WorkflowDiscoveryRequestedContextAccess>();
  const add = (
    capability: WorkflowDiscoveryContextCapability,
    targetLabel: string,
    targetKind: PermissionGrantTargetKind,
  ) => {
    const label = targetLabel.trim().replace(/\s+/g, " ");
    if (!label) return;
    const key = `${capability}\0${targetKind}\0${label.toLowerCase()}`;
    if (!requests.has(key)) requests.set(key, { capability, targetLabel: label, targetKind });
  };

  if (workflowRequestNeedsWebResearch(normalized)) {
    add("browser_network", workflowWebResearchTargetLabel(request), "browser_origin");
  }
  if (workflowRequestNeedsBrowserControl(normalized)) {
    add("browser_control", "browser automation/control requested by workflow discovery", "browser_origin");
  }
  if (workflowRequestNeedsBrowserProfile(normalized)) {
    add("browser_profile", "browser session/profile context requested by workflow discovery", "browser_origin");
  }
  if (workflowRequestNeedsShell(normalized)) {
    add("shell_command", "shell command inspection requested by workflow discovery", "shell_command_prefix");
  }
  for (const targetLabel of workflowRequestLocalFileContentTargets(request)) {
    add("file_content", targetLabel, "path");
  }

  const connectorDisallowPolicy = workflowRequestConnectorDisallowPolicy(normalized);
  for (const connector of options.connectorDescriptors ?? []) {
    if (
      connectorDisallowPolicy.all ||
      (connectorDisallowPolicy.google && /\b(?:google|gmail|calendar|drive|docs|sheets|slides)\b/i.test(connector.id)) ||
      (connectorDisallowPolicy.workspaceInventory && connector.id === "workspace.inventory")
    ) {
      continue;
    }
    if (!workflowConnectorMatchesRequest(connector, normalized)) continue;
    const readOperations = connector.operations.filter((operation) => operation.sideEffects !== "write_external");
    if (readOperations.length) {
      add(
        "connector_content",
        `${connector.label} content (${readOperations.slice(0, 4).map((operation) => operation.label).join(", ")})`,
        "connector",
      );
    }
    if (workflowRequestNeedsConnectorAccountData(connector, normalized)) {
      add("connector_account_data", `${connector.label} account details beyond safe labels`, "connector_account");
    }
  }

  for (const registration of options.pluginRegistrations ?? []) {
    if (!workflowPluginToolMatchesRequest(registration, normalized)) continue;
    add("plugin_tool_execute", `${registration.launchPlan.pluginName}/${registration.label}`, "tool");
  }
  for (const capability of ambientCliCapabilities) {
    if (!workflowAmbientCliCapabilityMatchesRequest(capability, normalized)) continue;
    add("plugin_tool_execute", `Ambient CLI/${capability.packageName}:${capability.command}`, "tool");
  }

  return [...requests.values()];
}

function workflowRequestLocalFileContentTargets(request: string): string[] {
  const normalizedRequest = stripAmbientDesktopProductName(request).toLowerCase();
  const targets: string[] = [];
  if (/\bdownloads?\b/.test(normalizedRequest)) {
    targets.push("local Downloads directory (~/Downloads) contents");
  }
  if (/\bdesktop\b/.test(normalizedRequest)) {
    targets.push("local Desktop directory (~/Desktop) contents");
  }
  if (/\bdocuments folder\b|\bdocuments directory\b|\bmy documents\b/.test(normalizedRequest)) {
    targets.push("local Documents directory (~/Documents) contents");
  }
  for (const match of request.matchAll(/(?:^|\s)((?:~|\/Users\/[^/\s]+)\/[^\s,;:"')]+(?:\s+[^\s,;:"')]+)*)/g)) {
    const candidate = match[1]?.trim();
    if (!candidate || candidate === "~") continue;
    targets.push(`explicit local path ${candidate}`);
  }
  return [...new Set(targets)];
}

function workflowRequestNeedsWebResearch(normalizedRequest: string): boolean {
  return /\b(arxiv|doi|pubmed|semantic scholar|web search|search the web|internet|online|latest|current|recent|news|browser search|upcoming|concerts?|venues?|live music|public events?)\b/.test(normalizedRequest)
    || /https?:\/\//.test(normalizedRequest);
}

function workflowWebResearchTargetLabel(request: string): string {
  const origins = new Set<string>();
  for (const match of request.matchAll(/https?:\/\/[^\s)>,]+/gi)) {
    try {
      origins.add(new URL(match[0]).origin);
    } catch {
      // Ignore malformed pasted URLs; the broad web-research label still applies.
    }
  }
  if (/\barxiv\b/i.test(request)) origins.add("https://arxiv.org");
  if (origins.size) return `web research via ${[...origins].slice(0, 3).join(", ")}`;
  return "general web research requested by workflow discovery";
}

function workflowRequestNeedsBrowserControl(normalizedRequest: string): boolean {
  return /\b(open|navigate|click|fill|scrape|crawl|download|browser control|browser automation)\b/.test(normalizedRequest) && /\b(browser|web page|website|site|url)\b/.test(normalizedRequest);
}

function workflowRequestNeedsBrowserProfile(normalizedRequest: string): boolean {
  return /\b(browser profile|logged[- ]in browser|cookies?|session|history|bookmarks?)\b/.test(normalizedRequest);
}

function workflowRequestNeedsShell(normalizedRequest: string): boolean {
  return /\b(shell|terminal|command line|run command|grep|ripgrep|rg|script|npm|pnpm|python|node script)\b/.test(normalizedRequest);
}

function workflowConnectorMatchesRequest(connector: WorkflowConnectorDescriptor, normalizedRequest: string): boolean {
  if (connector.id.includes("calendar") && !/\b(calendar|meeting|meetings|schedule|free[- ]busy|availability)\b/.test(normalizedRequest)) return false;
  if (connector.id.includes("drive") && workflowRequestNamesExplicitLocalDirectory(normalizedRequest) && !workflowRequestExplicitlyNeedsDrive(normalizedRequest)) return false;
  const terms = workflowConnectorTerms(connector);
  return terms.some((term) => normalizedRequest.includes(term));
}

function workflowRequestNamesExplicitLocalDirectory(normalizedRequest: string): boolean {
  return /\bdownloads?\b|\bdesktop\b|\bdocuments folder\b|\bdocuments directory\b|\bmy documents\b/.test(stripAmbientDesktopProductName(normalizedRequest));
}

function workflowRequestExplicitlyNeedsDrive(normalizedRequest: string): boolean {
  return /\b(google drive|drive|google docs|docs|sheets|slides|spreadsheet)\b/.test(normalizedRequest);
}

function workflowConnectorTerms(connector: WorkflowConnectorDescriptor): string[] {
  const rawTerms = [
    connector.id,
    connector.label,
    connector.description,
    ...connector.scopes.flatMap((scope) => [scope.id, scope.label]),
    ...connector.operations.flatMap((operation) => [operation.name, operation.label]),
  ];
  if (connector.id.includes("gmail")) rawTerms.push("gmail", "email", "mail", "inbox", "mailbox");
  if (connector.id.includes("calendar")) rawTerms.push("calendar", "meeting", "schedule");
  if (connector.id.includes("drive")) rawTerms.push("drive", "docs", "sheets", "slides", "google docs", "google drive");
  if (connector.id.includes("slack")) rawTerms.push("slack", "channel", "messages");
  return rawTerms.map((term) => term.toLowerCase()).filter((term) => term.length >= 4);
}

function workflowRequestNeedsConnectorAccountData(connector: WorkflowConnectorDescriptor, normalizedRequest: string): boolean {
  if (/\b(accounts?|account details|auth|labels?|folders?|shared drives?|channels?|mailboxes?)\b/.test(normalizedRequest)) return true;
  if (connector.id.includes("calendar") && /\b(calendars?|free[- ]busy)\b/.test(normalizedRequest)) return true;
  if (connector.id.includes("drive") && /\b(shared drives?|permissions?)\b/.test(normalizedRequest)) return true;
  return false;
}

function workflowRequestConnectorDisallowPolicy(normalizedRequest: string): { all: boolean; google: boolean; workspaceInventory: boolean } {
  const all =
    /\b(?:do not|don't|dont|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^\n.]{0,140}\bconnectors?\b/.test(normalizedRequest) ||
    /\bconnectors?\b[^\n.]{0,100}\b(?:not|unavailable|off limits|off-limits|out of scope|forbidden|disallowed)\b/.test(normalizedRequest);
  const workspaceInventory =
    /\b(?:do not|don't|dont|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^\n.]{0,140}\bworkspace[\s.]inventory\b/.test(normalizedRequest) ||
    /\bworkspace[\s.]inventory\b[^\n.]{0,100}\b(?:not|unavailable|off limits|off-limits|out of scope|forbidden|disallowed)\b/.test(normalizedRequest);
  const google =
    /\b(?:do not|don't|dont|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^\n.]{0,140}\b(?:google workspace|google drive|google\.drive|gmail|google calendar|calendar|docs|sheets|slides)\b/.test(normalizedRequest) ||
    /\b(?:google workspace|google drive|google\.drive|gmail|google calendar|calendar|docs|sheets|slides)\b[^\n.]{0,100}\b(?:not|unavailable|off limits|off-limits|out of scope|forbidden|disallowed)\b/.test(normalizedRequest);
  return { all, google, workspaceInventory };
}

function stripAmbientDesktopProductName(value: string): string {
  return value.replace(/\bambient\s+desktop(?:'s)?\b/gi, "ambient product");
}

function workflowPluginToolMatchesRequest(registration: PluginMcpToolRegistration, normalizedRequest: string): boolean {
  const terms = [
    registration.registeredName,
    registration.originalName,
    registration.label,
    registration.description,
    registration.launchPlan.pluginName,
    registration.launchPlan.serverName,
  ]
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 4);
  if (terms.some((term) => normalizedRequest.includes(term))) return true;
  return /\b(plugin|mcp tool|tool execution)\b/.test(normalizedRequest) && terms.some((term) => normalizedRequest.includes(term.split(/\s+/)[0]));
}

function workflowAmbientCliCapabilityMatchesRequest(capability: WorkflowDiscoveryAmbientCliCapability, normalizedRequest: string): boolean {
  const terms = [
    capability.capabilityId,
    capability.registryPluginId,
    capability.packageId,
    capability.packageName,
    capability.command,
    capability.description,
    capability.availabilityReason,
    ...capability.whyMatched,
  ]
    .map((term) => (term ?? "").toLowerCase())
    .filter((term) => term.length >= 4);
  if (terms.some((term) => normalizedRequest.includes(term))) return true;
  if (capability.packageName.includes("arxiv") && /\barxiv\b/.test(normalizedRequest)) return true;
  return /\b(ambient cli|plugin|tool execution|cli command)\b/.test(normalizedRequest) && terms.some((term) => normalizedRequest.includes(term.split(/[\s:_-]+/)[0]));
}

function auditWorkflowDiscoveryPolicyDecisions(
  store: ProjectStore,
  policyContext: WorkflowDiscoveryPolicyContext,
  options: WorkflowDiscoveryServiceOptions,
): void {
  const threadId = options.permissionAuditThreadId;
  if (!threadId) return;
  const seen = new Set<string>();
  for (const decision of policyContext.accessDecisions) {
    if (decision.action === "allow") continue;
    const key = `${decision.capability}\0${decision.action}\0${decision.targetHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    store.addPermissionAudit({
      threadId,
      permissionMode: policyContext.permissionMode,
      toolName: `workflow_discovery:${decision.capability}`,
      risk: decision.risk,
      decision: discoveryPolicyAuditDecision(decision),
      detail: decision.auditDetail,
      reason: decision.reason,
      decisionSource: decision.decisionSource,
      grantId: decision.grantId,
    });
  }
}

function discoveryPolicyAuditDecision(decision: WorkflowDiscoveryPolicyDecision): "allowed" | "denied" {
  return decision.action === "allow_by_full_access" || decision.action === "allow_by_persistent_grant" ? "allowed" : "denied";
}

function discoveryAccessRequests(policyContext: WorkflowDiscoveryPolicyContext): WorkflowDiscoveryAccessRequest[] | undefined {
  const requests = new Map<string, WorkflowDiscoveryAccessRequest>();
  for (const decision of policyContext.accessDecisions) {
    if (decision.action !== "prompt") continue;
    const key = `${decision.capability}\0${decision.targetHash}`;
    if (requests.has(key)) continue;
    requests.set(key, {
      id: `discovery-access-${decision.capability.replace(/_/g, "-")}-${decision.targetHash.slice(0, 12)}`,
      capability: decision.capability,
      actionKind: decision.actionKind,
      targetKind: decision.targetKind,
      targetLabel: decision.targetLabel,
      targetHash: decision.targetHash,
      reason: decision.reason,
      auditDetail: decision.auditDetail,
      risk: decision.risk,
      reusableScopes: discoveryReusableScopes(decision, policyContext),
      recommendedResponse: isHighRiskDiscoveryAccess(decision) ? "allow_once" : "always_workflow",
      status: "pending",
    });
  }
  const sortedRequests = [...requests.values()].sort((left, right) => {
    const priorityDelta = discoveryAccessRequestPriority(left) - discoveryAccessRequestPriority(right);
    return priorityDelta || left.capability.localeCompare(right.capability) || left.targetLabel.localeCompare(right.targetLabel);
  });
  return sortedRequests.length ? sortedRequests.slice(0, 6) : undefined;
}

function workflowDiscoveryOneShotGrants(
  store: ProjectStore,
  workflowThreadId: string,
  context: { permissionMode: PermissionMode; projectPath: string; workspacePath: string },
): AmbientPermissionGrant[] {
  return store
    .listWorkflowDiscoveryQuestions(workflowThreadId)
    .flatMap((question) =>
      (question.accessRequests ?? [])
        .filter((request) => request.status === "allowed" && request.response === "allow_once")
        .map((request): AmbientPermissionGrant => {
          const now = request.resolvedAt ?? question.createdAt;
          return {
            id: `discovery-once:${question.id}:${request.id}`,
            createdAt: now,
            updatedAt: now,
            expiresAt: new Date(new Date(now).getTime() + 60 * 60 * 1000).toISOString(),
            createdBy: "user",
            permissionModeAtCreation: context.permissionMode,
            scopeKind: "workflow_thread",
            workflowThreadId,
            projectPath: context.projectPath,
            workspacePath: context.workspacePath,
            actionKind: request.actionKind,
            targetKind: request.targetKind,
            targetHash: request.targetHash,
            targetLabel: request.targetLabel,
            conditions: { discoveryOnly: true, capability: request.capability, oneShot: true },
            source: "workflow_review",
            reason: `Allowed once during workflow discovery: ${request.capability.replace(/_/g, " ")}.`,
          };
        }),
    );
}

function discoveryReusableScopes(
  decision: WorkflowDiscoveryPolicyDecision,
  policyContext: WorkflowDiscoveryPolicyContext,
): PermissionGrantScopeKind[] {
  if (isHighRiskDiscoveryAccess(decision)) return ["workflow_thread"];
  const scopes: PermissionGrantScopeKind[] = ["workflow_thread"];
  if (policyContext.projectPath) scopes.push("project");
  if (policyContext.workspacePath) scopes.push("workspace");
  return scopes;
}

function discoveryAccessRequestPriority(request: WorkflowDiscoveryAccessRequest): number {
  if (request.capability === "plugin_tool_execute") return 0;
  if (request.capability === "connector_content" || request.capability === "browser_network") return 1;
  if (request.capability === "browser_control" || request.capability === "browser_profile" || request.capability === "shell_command") return 2;
  if (request.capability === "connector_account_data" || request.capability === "secret_path_metadata") return 3;
  if (request.capability === "file_content") return 4;
  return 5;
}

function isHighRiskDiscoveryAccess(decision: WorkflowDiscoveryPolicyDecision): boolean {
  return (
    decision.capability === "secret_path_metadata" ||
    decision.capability === "connector_account_data" ||
    decision.capability === "connector_content" ||
    decision.capability === "plugin_tool_execute" ||
    decision.capability === "browser_network" ||
    decision.capability === "browser_control" ||
    decision.capability === "browser_profile" ||
    decision.capability === "shell_command" ||
    decision.risk === "browser-credential" ||
    decision.risk === "browser-login"
  );
}

function discoveryGrantScopeKindForResponse(response: ResolveWorkflowDiscoveryAccessRequestInput["response"]): PermissionGrantScopeKind {
  if (response === "always_thread") return "thread";
  if (response === "always_workflow") return "workflow_thread";
  if (response === "always_project") return "project";
  if (response === "always_workspace") return "workspace";
  throw new Error(`Response ${response} does not create a reusable discovery grant.`);
}

function auditWorkflowDiscoveryAccessResolution(
  store: ProjectStore,
  input: {
    accessRequest: WorkflowDiscoveryAccessRequest;
    grant?: AmbientPermissionGrant;
    options: WorkflowDiscoveryServiceOptions;
    response: ResolveWorkflowDiscoveryAccessRequestInput["response"];
  },
): void {
  const threadId = input.options.permissionAuditThreadId;
  if (!threadId) return;
  const decisionSource = discoveryAccessDecisionSource(input.response);
  store.addPermissionAudit({
    threadId,
    permissionMode: input.options.permissionMode ?? "workspace",
    toolName: `workflow_discovery:${input.accessRequest.capability}`,
    risk: input.accessRequest.risk,
    decision: input.response === "deny" ? "denied" : "allowed",
    detail: input.accessRequest.auditDetail,
    reason: input.response === "deny" ? "User denied workflow discovery context access." : "User allowed workflow discovery context access.",
    decisionSource,
    grantId: input.grant?.id,
  });
}

function discoveryAccessDecisionSource(response: ResolveWorkflowDiscoveryAccessRequestInput["response"]): PermissionAuditDecisionSource {
  if (response === "deny") return "denied_by_user";
  if (response === "allow_once") return "prompt_allow_once";
  if (response === "always_thread") return "prompt_always_thread";
  if (response === "always_workflow") return "prompt_always_workflow";
  if (response === "always_project") return "prompt_always_project";
  return "prompt_always_workspace";
}

function discoveryPolicyBlockedReasons(policyContext: WorkflowDiscoveryPolicyContext): string[] | undefined {
  const payload = workflowDiscoveryProviderPolicyPayload(policyContext);
  const reasons = payload.blockedAccessSummary.map(
    (item) => `${item.count} ${item.capability.replace(/_/g, " ")} request${item.count === 1 ? "" : "s"} ${item.action === "deny" ? "denied" : "withheld pending grants"}: ${item.reason}`,
  );
  return reasons.length ? reasons.slice(0, 8) : undefined;
}

function revisionDiscoveryContext(store: ProjectStore, revision: WorkflowRevisionSummary): WorkflowDiscoveryProviderInput["revisionContext"] | undefined {
  const baseArtifactId = revision.baseArtifactId ?? (revision.baseVersionId ? store.getWorkflowVersion(revision.baseVersionId).artifactId : undefined);
  if (!baseArtifactId) return undefined;
  const artifact = store.getWorkflowArtifact(baseArtifactId);
  return {
    baseTitle: artifact.title,
    baseGoal: artifact.spec.goal,
    baseSummary: artifact.spec.summary,
    requestedChange: revision.requestedChange,
  };
}

async function generateDiscoveryQuestions(
  options: WorkflowDiscoveryServiceOptions,
  input: WorkflowDiscoveryProviderInput,
  providerOptions: WorkflowDiscoveryProviderGenerateOptions = {},
): Promise<WorkflowDiscoveryProviderOutput> {
  const fallbackProvider = options.fallbackProvider ?? new DeterministicWorkflowDiscoveryProvider();
  if (options.provider) {
    try {
      const output = await options.provider.generate(input, providerOptions);
      if (output.questions.length) return output;
      throw new Error("Ambient workflow discovery returned no questions.");
    } catch (error) {
      if (isRetryableAmbientProviderError(error)) {
        const fallbackOutput = await fallbackProvider.generate(input, providerOptions);
        return {
          ...fallbackOutput,
          blockedReasons: mergeBlockedReasons(
            [
              `Ambient discovery provider degraded before usable output: ${errorMessage(error)} Deterministic discovery fallback was used so workflow setup can continue.`,
            ],
            fallbackOutput.blockedReasons,
          ),
        };
      }
      throw new Error(
        `Ambient workflow discovery failed: ${errorMessage(error)} Discovery is paused until Ambient access, credits, or provider availability is fixed.`,
      );
    }
  }
  return fallbackProvider.generate(input, providerOptions);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function remainingRequiredCategories(questions: WorkflowDiscoveryQuestion[]): WorkflowDiscoveryQuestionCategory[] {
  const categories = new Set(questions.map((question) => question.category));
  return REQUIRED_WORKFLOW_DISCOVERY_CATEGORIES.filter((category) => !categories.has(category));
}

function latestGraphSnapshot(store: ProjectStore, workflowThreadId: string): WorkflowGraphSnapshot | undefined {
  return store.listWorkflowGraphSnapshots(workflowThreadId)[0];
}

function mergeBlockedReasons(...groups: Array<string[] | undefined>): string[] | undefined {
  const reasons = [...new Set(groups.flatMap((group) => group ?? []).map((reason) => reason.trim()).filter(Boolean))];
  return reasons.length ? reasons : undefined;
}

function writeDiscoveryGraph(store: ProjectStore, workflowThreadId: string, graphPatch?: WorkflowDiscoveryGraphPatch): void {
  const thread = store.getWorkflowAgentThreadSummary(workflowThreadId);
  const latestRevisionQuestion = [...thread.discoveryQuestions].reverse().find((question) => question.revisionId);
  const revision = latestRevisionQuestion?.revisionId ? store.getWorkflowRevision(latestRevisionQuestion.revisionId) : undefined;
  const graph = workflowDiscoveryGraph({
    workflowThreadId,
    request: revision ? `${thread.initialRequest}\n\nRevision request:\n${revision.requestedChange}` : thread.initialRequest,
    questions: thread.discoveryQuestions,
  });
  const patchedGraph = applyWorkflowDiscoveryGraphPatch({
    workflowThreadId,
    baseGraph: graph,
    graphPatch,
    source: revision ? "revision" : "discovery",
  });
  store.createWorkflowGraphSnapshot({
    workflowThreadId,
    source: revision ? "revision" : "discovery",
    summary: patchedGraph.summary,
    nodes: patchedGraph.nodes,
    edges: patchedGraph.edges,
  });
}
