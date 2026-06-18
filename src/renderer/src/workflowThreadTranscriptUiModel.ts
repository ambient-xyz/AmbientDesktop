import type { ChatMessage, RuntimeActivity } from "../../shared/threadTypes";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowCompileProgress, WorkflowDiscoveryQuestion, WorkflowExplorationProgress, WorkflowExplorationTraceSummary, WorkflowNativeToolName, WorkflowRevisionSummary, WorkflowRunDetail, WorkflowRunEvent } from "../../shared/workflowTypes";
import type { WorkflowArtifactPanelId } from "./workflowArtifactPanelUiModel";
import { workflowCompileActivityModel } from "./workflowCompileActivityUiModel";
import { workflowExplorationProgressCard, workflowExplorationTraceCards } from "./workflowExplorationUiModel";
import {
  workflowRevisionCards,
  workflowRevisionGraphDetails,
  workflowRevisionSourcePreview,
  type WorkflowRevisionSourcePreviewLine,
} from "./workflowRevisionUiModel";
import { workflowRunEventDetailLabels } from "./workflowUiModel";

export type WorkflowThreadTranscriptCardKind =
  | "request"
  | "chat"
  | "action"
  | "artifact"
  | "revision"
  | "run"
  | "event"
  | "discovery"
  | "exploration"
  | "compile"
  | "empty";
export type WorkflowThreadTranscriptTone = "neutral" | "active" | "success" | "warning" | "danger";

export interface WorkflowThreadTranscriptCard {
  id: string;
  kind: WorkflowThreadTranscriptCardKind;
  tone: WorkflowThreadTranscriptTone;
  title: string;
  detail: string;
  badges: string[];
  timestamp?: string;
  revisionId?: string;
  revisionCanApply?: boolean;
  revisionCanReject?: boolean;
  detailItems?: string[];
  sourcePreviewLines?: WorkflowRevisionSourcePreviewLine[];
  panelActions?: WorkflowThreadTranscriptPanelAction[];
}

export interface WorkflowThreadTranscriptPanelAction {
  id: string;
  label: string;
  panel: WorkflowArtifactPanelId;
}

export interface WorkflowThreadTranscriptInput {
  thread: Pick<WorkflowAgentThreadSummary, "id" | "initialRequest" | "phase" | "projectName" | "traceMode" | "latestVersion"> & {
    discoveryQuestions?: Pick<WorkflowDiscoveryQuestion, "id" | "category" | "answer" | "provider" | "activityEvents">[];
  };
  artifact?: Pick<WorkflowArtifactSummary, "id" | "title" | "status" | "manifest">;
  detail?: WorkflowRunDetail;
  revisions?: WorkflowRevisionSummary[];
  chatMessages?: ChatMessage[];
  planEditActivity?: RuntimeActivity;
  explorationProgress?: WorkflowExplorationProgress;
  explorationTraces?: WorkflowExplorationTraceSummary[];
  compileActive?: boolean;
  compileProgress?: WorkflowCompileProgress[];
  includeRequestCard?: boolean;
  now?: number;
}

export function workflowThreadTranscriptCards(input: WorkflowThreadTranscriptInput): WorkflowThreadTranscriptCard[] {
  const cards: WorkflowThreadTranscriptCard[] = [];
  if (input.includeRequestCard !== false) {
    cards.push({
      id: `request:${input.thread.id}`,
      kind: "request",
      tone: input.thread.phase === "running" ? "active" : "neutral",
      title: "Workflow request",
      detail: input.thread.initialRequest || "No request text recorded.",
      badges: [formatWorkflowLabel(input.thread.phase), input.thread.projectName, input.thread.traceMode === "debug" ? "Debug traces" : "Production traces"].filter(Boolean),
    });
  }

  const discoveryCard = workflowDiscoveryTranscriptCard(input.thread);
  if (discoveryCard) cards.push(discoveryCard);

  cards.push(...workflowMessageTranscriptCards(input.chatMessages ?? []));
  const planEditActivityCard = workflowPlanEditActivityCard(input.thread.id, input.planEditActivity);
  if (planEditActivityCard) cards.push(planEditActivityCard);
  const explorationProgressCard = workflowExplorationProgressTranscriptCard(input.thread.id, input.explorationProgress);
  if (explorationProgressCard) cards.push(explorationProgressCard);
  const explorationTraceCard = workflowExplorationTraceTranscriptCard(input.thread.id, input.explorationTraces ?? [], input.now);
  if (explorationTraceCard) cards.push(explorationTraceCard);
  const compileActivityCard = workflowCompileTranscriptCard(input.thread.id, Boolean(input.compileActive), input.compileProgress ?? [], input.now);
  if (compileActivityCard) cards.push(compileActivityCard);

  if (input.artifact) {
    cards.push({
      id: `artifact:${input.artifact.id}`,
      kind: "artifact",
      tone: artifactStatusTone(input.artifact.status),
      title: input.artifact.title,
      detail: artifactStatusDetail(input.artifact.status),
      badges: [
        formatWorkflowLabel(input.artifact.status),
        input.thread.latestVersion ? `Version ${input.thread.latestVersion.version}` : undefined,
        `${input.artifact.manifest.tools.length} ${input.artifact.manifest.tools.length === 1 ? "tool" : "tools"}`,
        typeof input.artifact.manifest.maxRunMs === "number" ? `${formatDuration(input.artifact.manifest.maxRunMs)} total cap` : "No total cap",
      ].filter((badge): badge is string => Boolean(badge)),
    });
  } else {
    cards.push({
      id: `artifact:missing:${input.thread.id}`,
      kind: "empty",
      tone: "warning",
      title: "Workflow artifact not loaded",
      detail: "Refresh Workflow Agents to reload the compiled workflow, or continue discovery if this thread has not been compiled yet.",
      badges: ["Needs artifact"],
    });
  }

  for (const revision of workflowRevisionCards(input.revisions ?? [], input.now).slice(0, 3)) {
    cards.push({
      id: `revision:${revision.id}`,
      kind: "revision",
      tone: revisionTone(revision.status),
      title: revision.statusLabel,
      detail: revision.requestedChange,
      badges: [
        revision.updatedLabel,
        revision.baseLabel,
        revision.proposedLabel,
        revision.graphSummary,
        revision.sourceSummary,
      ].filter(Boolean),
      timestamp: revision.updatedAt,
      revisionId: revision.id,
      revisionCanApply: revision.canApply,
      revisionCanReject: revision.canReject,
      detailItems: revision.graphDetails,
      sourcePreviewLines: revision.sourcePreviewLines,
      panelActions: workflowRevisionPanelActions(revision),
    });
  }

  if (input.detail) {
    cards.push(workflowRunTranscriptCard(input.detail));
    cards.push(...workflowRunTouchpointEvents(input.detail.events).map(workflowEventTranscriptCard));
  }

  return cards;
}

function workflowExplorationProgressTranscriptCard(
  threadId: string,
  progress: WorkflowExplorationProgress | undefined,
): WorkflowThreadTranscriptCard | undefined {
  const card = workflowExplorationProgressCard(progress);
  if (!card) return undefined;
  return {
    id: `exploration-progress:${threadId}:${progress?.explorationId ?? "active"}`,
    kind: "exploration",
    tone: card.tone === "blocked" ? "danger" : card.tone === "ready" ? "success" : "active",
    title: card.title,
    detail: card.detail,
    badges: ["Exploration", ...card.labels, card.graphNodeId ? `Node ${card.graphNodeId}` : undefined].filter((badge): badge is string => Boolean(badge)),
    timestamp: progress?.updatedAt,
    panelActions: [{ id: "exploration", label: "Open exploration", panel: "exploration" }],
  };
}

function workflowExplorationTraceTranscriptCard(
  threadId: string,
  traces: WorkflowExplorationTraceSummary[],
  now?: number,
): WorkflowThreadTranscriptCard | undefined {
  const trace = workflowExplorationTraceCards(traces, now)[0];
  if (!trace) return undefined;
  return {
    id: `exploration-trace:${threadId}:${trace.id}`,
    kind: "exploration",
    tone: "success",
    title: "Exploration trace ready",
    detail: trace.summary,
    badges: [
      "Exploration",
      trace.createdLabel,
      trace.modelLabel,
      trace.observationLabel,
      trace.graphSummary,
      ...trace.requiredGrantLabels.slice(0, 2).map((label) => `Grant: ${label}`),
      ...trace.dataShapeLabels.slice(0, 2),
    ],
    panelActions: [
      { id: "exploration", label: "Open exploration", panel: "exploration" },
      { id: "source", label: "Inspect source", panel: "source" },
    ],
  };
}

function workflowDiscoveryTranscriptCard(
  thread: Pick<WorkflowAgentThreadSummary, "id" | "phase"> & {
    discoveryQuestions?: Pick<WorkflowDiscoveryQuestion, "id" | "category" | "answer" | "provider" | "activityEvents">[];
  },
): WorkflowThreadTranscriptCard | undefined {
  const questions = thread.discoveryQuestions ?? [];
  if (questions.length === 0) return undefined;
  const answered = questions.filter((question) => question.answer).length;
  const categories = [...new Set(questions.map((question) => question.category))].slice(0, 4);
  const providers = [...new Set(questions.map((question) => question.provider).filter((provider): provider is NonNullable<typeof provider> => Boolean(provider)))].slice(0, 2);
  const activityCount = questions.reduce((total, question) => total + (question.activityEvents?.length ?? 0), 0);
  const complete = answered === questions.length;
  return {
    id: `discovery:${thread.id}`,
    kind: "discovery",
    tone: complete ? "success" : thread.phase === "discovery" ? "active" : "warning",
    title: complete ? "Discovery complete" : "Discovery in progress",
    detail: complete
      ? "Discovery answers are ready for compile, review, or revision planning."
      : "Workflow Discovery is still collecting scope, data source, model-role, policy, and run-shape decisions.",
    badges: [
      "Discovery",
      `${answered}/${questions.length} answered`,
      activityCount ? `${activityCount} activity ${activityCount === 1 ? "event" : "events"}` : undefined,
      ...providers.map((provider) => formatWorkflowLabel(provider)),
      ...categories.map((category) => formatWorkflowLabel(category)),
    ].filter((badge): badge is string => Boolean(badge)),
    panelActions: [{ id: "discovery", label: "Open discovery", panel: "discovery" }],
  };
}

function workflowCompileTranscriptCard(
  threadId: string,
  active: boolean,
  progress: WorkflowCompileProgress[],
  now?: number,
): WorkflowThreadTranscriptCard | undefined {
  const model = workflowCompileActivityModel({ active, progress, nowMs: now });
  if (!model) return undefined;
  const latest = progress.at(-1);
  return {
    id: `compile:${threadId}:${latest?.compileId ?? "active"}`,
    kind: "compile",
    tone: model.tone === "failed" ? "danger" : model.tone === "completed" ? "success" : "active",
    title: model.title,
    detail: model.subtitle,
    badges: [
      "Compile",
      `${model.percent}%`,
      ...model.metrics.slice(0, 6).map((metric) => `${metric.label}: ${metric.value}`),
    ],
    timestamp: latest?.createdAt,
    panelActions: [
      { id: "discovery", label: "Open discovery", panel: "discovery" },
      { id: "source", label: "Inspect source", panel: "source" },
      { id: "manifest", label: "Inspect manifest", panel: "manifest" },
    ],
  };
}

function workflowPlanEditActivityCard(threadId: string, activity: RuntimeActivity | undefined): WorkflowThreadTranscriptCard | undefined {
  if (!activity) return undefined;
  if (activity.kind === "stream") {
    return {
      id: `plan-edit-progress:${threadId}`,
      kind: "chat",
      tone: activity.status === "timeout" ? "danger" : "active",
      title: activity.status === "timeout" ? "Workflow Chat stream stalled" : "Workflow Chat progress",
      detail: activity.status === "timeout" ? (activity.message ?? "Pi stopped streaming in Workflow Chat mode.") : "Pi is working through this workflow request.",
      badges: [
        "Workflow Chat",
        activity.status === "timeout" ? "Stream timeout" : "Streaming",
        `${Math.max(0, Math.round(activity.outputChars)).toLocaleString()} output chars`,
        activity.thinkingChars && activity.thinkingChars > 0 ? `${Math.max(0, Math.round(activity.thinkingChars)).toLocaleString()} thinking chars` : undefined,
        activity.idleElapsedMs !== undefined && activity.idleTimeoutMs !== undefined
          ? `Idle ${formatDuration(activity.idleElapsedMs)} / ${formatDuration(activity.idleTimeoutMs)} timeout`
          : undefined,
      ].filter((badge): badge is string => Boolean(badge)),
    };
  }
  if (activity.kind === "retry") {
    return {
      id: `plan-edit-retry:${threadId}:${activity.attempt}`,
      kind: "chat",
      tone: activity.status === "finished" && !activity.success ? "warning" : "active",
      title: activity.status === "starting" ? "Workflow Chat retrying" : "Workflow Chat retry finished",
      detail:
        activity.status === "starting"
          ? `Pi is retrying attempt ${activity.attempt}/${activity.maxAttempts}: ${activity.message}`
          : activity.success
            ? `Retry attempt ${activity.attempt} recovered.`
            : `Retry attempt ${activity.attempt} failed${activity.message ? `: ${activity.message}` : "."}`,
      badges: ["Workflow Chat", "Provider retry"],
    };
  }
  if (activity.kind === "compaction") {
    return {
      id: `plan-edit-compaction:${threadId}`,
      kind: "chat",
      tone: activity.status === "starting" ? "active" : activity.aborted ? "warning" : "success",
      title: activity.status === "starting" ? "Workflow Chat compacting context" : "Workflow Chat compaction finished",
      detail:
        activity.status === "starting"
          ? `Pi is compacting context before continuing (${activity.reason}).`
          : activity.message ?? `Compaction finished (${activity.reason}).`,
      badges: ["Workflow Chat", "Compaction"],
    };
  }
  if (activity.kind === "browser") {
    return {
      id: `plan-edit-browser:${threadId}`,
      kind: "chat",
      tone: "active",
      title: "Workflow Chat browser activity",
      detail: activity.message,
      badges: ["Workflow Chat", "Browser"],
    };
  }
  if (activity.kind === "permission") {
    return {
      id: `plan-edit-permission:${threadId}`,
      kind: "chat",
      tone: activity.status === "waiting" ? "active" : activity.allowed === false ? "warning" : "success",
      title: activity.status === "waiting" ? "Workflow Chat waiting for approval" : "Workflow Chat approval resolved",
      detail: activity.message,
      badges: ["Workflow Chat", "Permission", activity.toolName],
    };
  }
  if (activity.kind === "tool") {
    return {
      id: `plan-edit-tool:${threadId}:${activity.toolName}`,
      kind: "chat",
      tone: activity.status === "timeout" ? "danger" : "active",
      title: activity.status === "timeout" ? "Workflow Chat tool stalled" : "Workflow Chat tool running",
      detail: activity.message,
      badges: ["Workflow Chat", "Tool", activity.toolName],
    };
  }
  return undefined;
}

function workflowRevisionPanelActions(revision: ReturnType<typeof workflowRevisionCards>[number]): WorkflowThreadTranscriptPanelAction[] {
  const actions: WorkflowThreadTranscriptPanelAction[] = [];
  if (revision.hasGraphDiff) actions.push({ id: "diagram", label: "Inspect diagram", panel: "diagram" });
  if (revision.hasSourceDiff) actions.push({ id: "source", label: "Inspect source", panel: "source" });
  if (revision.hasManifestDiff) actions.push({ id: "manifest", label: "Inspect manifest", panel: "manifest" });
  return actions;
}

function workflowMessageTranscriptCards(messages: ChatMessage[]): WorkflowThreadTranscriptCard[] {
  return messages.flatMap((message) => workflowMessageTranscriptCard(message) ?? []).slice(-8);
}

function workflowMessageTranscriptCard(message: ChatMessage): WorkflowThreadTranscriptCard | undefined {
  const actionCard = workflowNativeActionTranscriptCard(message);
  if (actionCard) return actionCard;
  const revisionDecisionCard = workflowRevisionDecisionTranscriptCard(message);
  if (revisionDecisionCard) return revisionDecisionCard;
  if (!isWorkflowChatMessage(message)) return undefined;
  return workflowChatTranscriptCard(message);
}

function workflowChatTranscriptCard(message: ChatMessage): WorkflowThreadTranscriptCard {
  const status = stringFromRecord(message.metadata, "status");
  const active = status === "streaming" || status === "queued" || status === "sending";
  const roleLabel = message.role === "user" ? "User request" : "Pi response";
  return {
    id: `chat:${message.id}`,
    kind: "chat",
    tone: active ? "active" : message.role === "assistant" ? "success" : "neutral",
    title: message.role === "user" ? "You asked Pi" : "Pi answered",
    detail: compactChatMessageDetail(message.content, message.role, active),
    badges: ["Workflow Chat", roleLabel, status ? formatWorkflowLabel(status) : undefined].filter((badge): badge is string => Boolean(badge)),
    timestamp: message.createdAt,
  };
}

const workflowNativeTranscriptToolNames = new Set<WorkflowNativeToolName>([
  "workflow_current_context",
  "workflow_get_artifact",
  "workflow_get_source",
  "workflow_get_run_trace",
  "workflow_get_versions",
  "workflow_capability_search",
  "workflow_capability_describe",
  "workflow_propose_manifest_revision",
  "workflow_propose_revision",
  "workflow_validate_revision",
  "workflow_explain_revision_diff",
  "workflow_apply_revision",
  "workflow_update_run_settings",
  "workflow_restore_version",
  "workflow_run_preview",
  "workflow_run_version",
]);

function workflowNativeActionTranscriptCard(message: ChatMessage): WorkflowThreadTranscriptCard | undefined {
  if (message.role !== "tool") return undefined;
  const toolName = workflowNativeActionToolName(message.metadata?.toolName);
  if (!toolName) return undefined;
  const status = stringFromRecord(message.metadata, "status");
  const { summary, data } = workflowNativeToolResult(message.content);
  const running = status === "running";
  const action = workflowNativeActionSummary(toolName, status, data, summary);
  const panels = workflowNativeActionPanelActions(toolName, data);
  return {
    id: `workflow-action:${message.id}`,
    kind: "action",
    tone: running ? "active" : action.tone,
    title: running ? `${action.label} in progress` : action.title,
    detail: running ? `Pi is using ${toolName} to update or inspect this workflow.` : action.detail,
    badges: [
      "Workflow action",
      action.label,
      status ? formatWorkflowLabel(status) : undefined,
      ...action.badges,
    ].filter((badge): badge is string => Boolean(badge)),
    timestamp: message.createdAt,
    revisionId: action.revisionId,
    revisionCanApply: action.revisionCanApply,
    revisionCanReject: action.revisionCanReject,
    detailItems: action.detailItems,
    sourcePreviewLines: action.sourcePreviewLines,
    panelActions: panels,
  };
}

function workflowRevisionDecisionTranscriptCard(message: ChatMessage): WorkflowThreadTranscriptCard | undefined {
  if (message.role !== "system") return undefined;
  if (stringFromRecord(message.metadata, "kind") !== "workflow_revision_decision") return undefined;
  const decision = stringFromRecord(message.metadata, "decision");
  const revisionId = stringFromRecord(message.metadata, "revisionId");
  const version = numberValue(message.metadata?.version);
  const applied = decision === "applied";
  return {
    id: `revision-decision:${message.id}`,
    kind: "revision",
    tone: applied ? "success" : decision === "rejected" ? "danger" : "neutral",
    title: applied ? "Workflow revision applied" : decision === "rejected" ? "Workflow revision rejected" : "Workflow revision decision recorded",
    detail: message.content.trim() || "Workflow revision decision recorded.",
    badges: [
      "Workflow Chat",
      revisionId ? `Revision ${revisionId}` : undefined,
      decision ? formatWorkflowLabel(decision) : undefined,
      version !== undefined ? `Version ${version}` : undefined,
    ].filter((badge): badge is string => Boolean(badge)),
    timestamp: message.createdAt,
    revisionId,
    panelActions: [
      { id: "versions", label: "Inspect versions", panel: "versions" },
      { id: "diagram", label: "Inspect diagram", panel: "diagram" },
    ],
  };
}

function workflowNativeActionToolName(value: unknown): WorkflowNativeToolName | undefined {
  return typeof value === "string" && workflowNativeTranscriptToolNames.has(value as WorkflowNativeToolName) ? (value as WorkflowNativeToolName) : undefined;
}

function workflowNativeToolResult(content: string): { summary?: string; data?: Record<string, unknown> } {
  const resultMarker = "\n\nResult\n";
  const resultStart = content.lastIndexOf(resultMarker);
  if (resultStart < 0) return {};
  const result = content.slice(resultStart + resultMarker.length).trim();
  const jsonStart = result.indexOf("\n\n{");
  const summary = (jsonStart >= 0 ? result.slice(0, jsonStart) : result).replace(/\s+/g, " ").trim();
  const jsonText = jsonStart >= 0 ? result.slice(jsonStart + 2).trim() : undefined;
  if (!jsonText) return { summary };
  try {
    const parsed = JSON.parse(jsonText);
    return isRecord(parsed) ? { summary, data: parsed } : { summary };
  } catch {
    return { summary };
  }
}

function workflowNativeActionSummary(
  toolName: WorkflowNativeToolName,
  status: string | undefined,
  data: Record<string, unknown> | undefined,
  summary: string | undefined,
): {
  label: string;
  title: string;
  detail: string;
  tone: WorkflowThreadTranscriptTone;
  badges: string[];
  revisionId?: string;
  revisionCanApply?: boolean;
  revisionCanReject?: boolean;
  detailItems?: string[];
  sourcePreviewLines?: WorkflowRevisionSourcePreviewLine[];
} {
  const fallbackDetail = summary || `${toolName} completed.`;
  if (!data) {
    return {
      label: workflowNativeActionLabel(toolName),
      title: status === "error" ? `${workflowNativeActionLabel(toolName)} failed` : workflowNativeActionLabel(toolName),
      detail: fallbackDetail,
      tone: status === "error" ? "danger" : "neutral",
      badges: [],
      detailItems: [],
      sourcePreviewLines: [],
    };
  }

  if (toolName === "workflow_current_context") {
    const counts = recordValue(data.counts);
    return {
      label: "Inspect context",
      title: "Pi inspected workflow context",
      detail: fallbackDetail,
      tone: "neutral",
      badges: [
        countBadge(counts, "versions", "version"),
        countBadge(counts, "runs", "run"),
        countBadge(counts, "graphNodes", "graph node"),
        countBadge(counts, "unansweredDiscoveryQuestions", "open question"),
      ].filter((badge): badge is string => Boolean(badge)),
    };
  }

  if (toolName === "workflow_get_artifact") {
    const artifact = recordValue(data.artifact);
    const graph = recordValue(data.graph);
    const manifest = recordValue(artifact?.manifest);
    const tools = Array.isArray(manifest?.tools) ? manifest.tools.length : undefined;
    return {
      label: "Inspect artifact",
      title: "Pi inspected workflow artifact",
      detail: stringValue(artifact?.title) ?? fallbackDetail,
      tone: "neutral",
      badges: [
        stringValue(artifact?.status) ? formatWorkflowLabel(stringValue(artifact?.status)!) : undefined,
        tools !== undefined ? `${tools} ${tools === 1 ? "tool" : "tools"}` : undefined,
        numberValue(graph?.nodeCount) !== undefined ? `${numberValue(graph?.nodeCount)} graph nodes` : undefined,
        numberValue(graph?.edgeCount) !== undefined ? `${numberValue(graph?.edgeCount)} graph edges` : undefined,
      ].filter((badge): badge is string => Boolean(badge)),
    };
  }

  if (toolName === "workflow_get_source") {
    const returnedChars = numberValue(data.returnedChars);
    const chars = numberValue(data.chars);
    return {
      label: "Inspect source",
      title: "Pi inspected workflow source",
      detail: stringValue(data.sourcePath) ?? fallbackDetail,
      tone: data.truncated === true ? "warning" : "neutral",
      badges: [
        returnedChars !== undefined && chars !== undefined ? `${returnedChars.toLocaleString()} / ${chars.toLocaleString()} chars` : undefined,
        data.truncated === true ? "Preview truncated" : "Full source",
      ].filter((badge): badge is string => Boolean(badge)),
    };
  }

  if (toolName === "workflow_get_run_trace") {
    const eventCount = numberValue(data.eventCount);
    const returnedEventCount = numberValue(data.returnedEventCount);
    const modelCalls = Array.isArray(data.modelCalls) ? data.modelCalls.length : undefined;
    const checkpoints = Array.isArray(data.checkpoints) ? data.checkpoints.length : undefined;
    const run = recordValue(data.run);
    return {
      label: "Inspect run trace",
      title: "Pi inspected run trace",
      detail: stringValue(run?.error) ?? fallbackDetail,
      tone: runActionTone(stringValue(run?.status)),
      badges: [
        stringValue(run?.status) ? formatWorkflowLabel(stringValue(run?.status)!) : undefined,
        returnedEventCount !== undefined && eventCount !== undefined ? `${returnedEventCount} / ${eventCount} events` : undefined,
        modelCalls !== undefined ? `${modelCalls} ${modelCalls === 1 ? "model call" : "model calls"}` : undefined,
        checkpoints !== undefined ? `${checkpoints} ${checkpoints === 1 ? "checkpoint" : "checkpoints"}` : undefined,
      ].filter((badge): badge is string => Boolean(badge)),
    };
  }

  if (toolName === "workflow_get_versions") {
    const returnedVersions = numberValue(data.returnedVersions);
    const totalVersions = numberValue(data.totalVersions);
    return {
      label: "Inspect versions",
      title: "Pi inspected workflow versions",
      detail: fallbackDetail,
      tone: "neutral",
      badges: [
        returnedVersions !== undefined && totalVersions !== undefined ? `${returnedVersions} / ${totalVersions} versions` : undefined,
      ].filter((badge): badge is string => Boolean(badge)),
    };
  }

  if (toolName === "workflow_capability_search") {
    const results = Array.isArray(data.results) ? data.results : [];
    return {
      label: "Search capabilities",
      title: "Pi searched workflow capabilities",
      detail: fallbackDetail,
      tone: results.length > 0 ? "success" : "warning",
      badges: [`${results.length} ${results.length === 1 ? "result" : "results"}`],
    };
  }

  if (toolName === "workflow_capability_describe") {
    return {
      label: "Inspect capability",
      title: "Pi inspected workflow capability",
      detail: stringValue(data.label) ?? stringValue(data.id) ?? fallbackDetail,
      tone: "neutral",
      badges: [
        stringValue(data.kind) ? formatWorkflowLabel(stringValue(data.kind)!) : undefined,
        stringValue(data.permissionCapability) ? formatWorkflowLabel(stringValue(data.permissionCapability)!) : undefined,
        stringValue(data.mutationClass) ? formatWorkflowLabel(stringValue(data.mutationClass)!) : undefined,
      ].filter((badge): badge is string => Boolean(badge)),
    };
  }

  if (toolName === "workflow_propose_manifest_revision" || toolName === "workflow_propose_revision") {
    const created = data.created === true;
    const revision = recordValue(data.revision);
    return {
      label: toolName === "workflow_propose_manifest_revision" ? "Propose manifest revision" : "Propose revision",
      title: created ? "Workflow revision proposed" : "Workflow revision rejected",
      detail: stringValue(data.note) ?? fallbackDetail,
      tone: created ? "warning" : "danger",
      badges: [
        stringValue(revision?.id) ? `Revision ${stringValue(revision?.id)}` : undefined,
        toolName === "workflow_propose_manifest_revision" ? "Manifest-only" : "Graph/source",
      ].filter((badge): badge is string => Boolean(badge)),
      revisionId: stringValue(revision?.id),
      revisionCanApply: created && Boolean(stringValue(revision?.id)),
      revisionCanReject: created && Boolean(stringValue(revision?.id)),
      detailItems: [
        ...validationDetailItems(recordValue(data.validation)),
        ...workflowRevisionGraphDetails(revision?.graphDiff),
      ].slice(0, 8),
      sourcePreviewLines: workflowRevisionSourcePreview(stringValue(revision?.sourceDiff), 8),
    };
  }

  if (toolName === "workflow_validate_revision") {
    const valid = data.valid === true;
    const errors = Array.isArray(data.errors) ? data.errors.length : 0;
    const warnings = Array.isArray(data.warnings) ? data.warnings.length : 0;
    const revision = recordValue(data.revision);
    return {
      label: "Validate revision",
      title: valid ? "Workflow revision validation passed" : "Workflow revision validation failed",
      detail: fallbackDetail,
      tone: valid ? "success" : "danger",
      badges: [
        stringValue(revision?.id) ? `Revision ${stringValue(revision?.id)}` : undefined,
        `${errors} ${errors === 1 ? "error" : "errors"}`,
        `${warnings} ${warnings === 1 ? "warning" : "warnings"}`,
      ].filter((badge): badge is string => Boolean(badge)),
      revisionId: stringValue(revision?.id),
      detailItems: validationDetailItems(data).slice(0, 8),
    };
  }

  if (toolName === "workflow_explain_revision_diff") {
    return {
      label: "Explain revision",
      title: "Pi explained workflow revision diff",
      detail: stringValue(data.graphSummary) ?? stringValue(data.sourceSummary) ?? fallbackDetail,
      tone: "neutral",
      badges: [
        stringValue(data.graphSummary),
        stringValue(data.sourceSummary),
      ].filter((badge): badge is string => Boolean(badge)).slice(0, 2),
      detailItems: [
        ...stringArrayValue(data.bullets),
        ...workflowRevisionGraphDetails(data.graphDiff),
      ].slice(0, 8),
      sourcePreviewLines: workflowRevisionSourcePreview(stringValue(data.sourceDiff), 8),
    };
  }

  if (toolName === "workflow_apply_revision") {
    const applied = data.applied === true;
    const revision = recordValue(data.revision);
    return {
      label: "Apply revision",
      title: applied ? "Workflow revision applied" : "Workflow revision not applied",
      detail: stringValue(data.note) ?? stringValue(data.reason) ?? fallbackDetail,
      tone: applied ? "success" : "danger",
      badges: [
        stringValue(revision?.id) ? `Revision ${stringValue(revision?.id)}` : undefined,
        data.alreadyApplied === true ? "Already applied" : undefined,
        stringValue(data.auditId) ? "Full Access audited" : undefined,
        versionBadge(recordValue(data.latestVersion) ?? recordValue(data.materializedVersion)),
      ].filter((badge): badge is string => Boolean(badge)),
      revisionId: stringValue(revision?.id),
    };
  }

  if (toolName === "workflow_update_run_settings") {
    const action = stringValue(data.action) ?? "settings";
    const revision = recordValue(data.revision);
    const updated = data.updated === true;
    const proposed = Boolean(revision) && !updated;
    const preview = action === "preview_foreground";
    return {
      label: "Run settings",
      title: updated ? "Run settings updated" : proposed ? "Run settings revision proposed" : preview ? "Run settings previewed" : "Run settings unchanged",
      detail: stringValue(data.note) ?? stringValue(data.reason) ?? fallbackDetail,
      tone: updated ? "success" : proposed || preview ? "warning" : "danger",
      badges: [
        formatWorkflowLabel(action),
        stringValue(revision?.id) ? `Revision ${stringValue(revision?.id)}` : undefined,
        ...runLimitBadges(recordValue(data.runLimits)),
      ].filter((badge): badge is string => Boolean(badge)),
      revisionId: stringValue(revision?.id),
      revisionCanApply: proposed && Boolean(stringValue(revision?.id)),
      revisionCanReject: proposed && Boolean(stringValue(revision?.id)),
      detailItems: workflowRevisionGraphDetails(revision?.graphDiff).slice(0, 8),
    };
  }

  if (toolName === "workflow_restore_version") {
    const restored = data.restored === true;
    return {
      label: "Restore version",
      title: restored ? "Workflow version restored" : "Workflow version not restored",
      detail: stringValue(data.note) ?? stringValue(data.reason) ?? fallbackDetail,
      tone: restored ? "success" : "danger",
      badges: [
        versionBadge(recordValue(data.targetVersion), "Target"),
        versionBadge(recordValue(data.restoredVersion), "Restored"),
        data.approveRestored === true ? "Approved restored version" : "Review version",
        recordValue(data.audit) ? "Full Access audited" : undefined,
      ].filter((badge): badge is string => Boolean(badge)),
    };
  }

  if (toolName === "workflow_run_preview" || toolName === "workflow_run_version") {
    const started = toolName === "workflow_run_preview" ? data.previewed === true : data.ran === true;
    const run = recordValue(data.run);
    const runStatus = stringValue(run?.status);
    return {
      label: toolName === "workflow_run_preview" ? "Run preview" : "Run workflow",
      title: started ? runActionTitle(toolName, runStatus) : toolName === "workflow_run_preview" ? "Preview run not started" : "Workflow run not started",
      detail: stringValue(data.note) ?? stringValue(data.reason) ?? fallbackDetail,
      tone: started ? runActionTone(runStatus) : "danger",
      badges: [
        runStatus ? formatWorkflowLabel(runStatus) : undefined,
        stringValue(run?.id) ? `Run ${stringValue(run?.id)}` : undefined,
        versionBadge(recordValue(data.version) ?? recordValue(data.targetVersion)),
        data.allowUnapproved === true ? "Unapproved one-off" : undefined,
        ...traceBadges(recordValue(data.trace)),
        ...runLimitBadges(recordValue(data.runLimits)),
        recordValue(data.audit) ? "Full Access audited" : undefined,
      ].filter((badge): badge is string => Boolean(badge)),
    };
  }

  return {
    label: workflowNativeActionLabel(toolName),
    title: workflowNativeActionLabel(toolName),
    detail: fallbackDetail,
    tone: "neutral",
    badges: [],
    detailItems: [],
    sourcePreviewLines: [],
  };
}

function workflowNativeActionLabel(toolName: WorkflowNativeToolName): string {
  if (toolName === "workflow_current_context") return "Inspect context";
  if (toolName === "workflow_get_artifact") return "Inspect artifact";
  if (toolName === "workflow_get_source") return "Inspect source";
  if (toolName === "workflow_get_run_trace") return "Inspect run trace";
  if (toolName === "workflow_get_versions") return "Inspect versions";
  if (toolName === "workflow_capability_search") return "Search capabilities";
  if (toolName === "workflow_capability_describe") return "Inspect capability";
  if (toolName === "workflow_propose_manifest_revision") return "Propose manifest revision";
  if (toolName === "workflow_propose_revision") return "Propose revision";
  if (toolName === "workflow_validate_revision") return "Validate revision";
  if (toolName === "workflow_explain_revision_diff") return "Explain revision";
  if (toolName === "workflow_apply_revision") return "Apply revision";
  if (toolName === "workflow_update_run_settings") return "Run settings";
  if (toolName === "workflow_restore_version") return "Restore version";
  if (toolName === "workflow_run_preview") return "Run preview";
  if (toolName === "workflow_run_version") return "Run workflow";
  return formatWorkflowLabel(toolName);
}

function workflowNativeActionPanelActions(toolName: WorkflowNativeToolName, data: Record<string, unknown> | undefined): WorkflowThreadTranscriptPanelAction[] {
  let actions: WorkflowThreadTranscriptPanelAction[] = [];
  if (toolName === "workflow_current_context") {
    return [
      { id: "discovery", label: "Open discovery", panel: "discovery" },
      { id: "versions", label: "Inspect versions", panel: "versions" },
    ];
  }
  if (toolName === "workflow_get_artifact") {
    return [
      { id: "diagram", label: "Inspect diagram", panel: "diagram" },
      { id: "manifest", label: "Inspect manifest", panel: "manifest" },
    ];
  }
  if (toolName === "workflow_get_source") {
    return [{ id: "source", label: "Inspect source", panel: "source" }];
  }
  if (toolName === "workflow_get_run_trace") {
    return [
      { id: "run_console", label: "Open run console", panel: "run_console" },
      { id: "outputs", label: "Inspect outputs", panel: "outputs" },
    ];
  }
  if (toolName === "workflow_get_versions") {
    return [{ id: "versions", label: "Inspect versions", panel: "versions" }];
  }
  if (toolName === "workflow_capability_search" || toolName === "workflow_capability_describe") {
    return [
      { id: "permissions", label: "Inspect permissions", panel: "permissions" },
      { id: "exploration", label: "Open exploration", panel: "exploration" },
    ];
  }
  if (toolName === "workflow_propose_manifest_revision" || toolName === "workflow_propose_revision" || toolName === "workflow_validate_revision" || toolName === "workflow_explain_revision_diff") {
    return [
      { id: "versions", label: "Inspect revisions", panel: "versions" },
      { id: "diagram", label: "Inspect diagram", panel: "diagram" },
    ];
  }
  if (toolName === "workflow_run_preview" || toolName === "workflow_run_version") {
    actions = [
      { id: "run_console", label: "Open run console", panel: "run_console" },
      { id: "outputs", label: "Inspect outputs", panel: "outputs" },
    ];
    if (workflowNativeActionHasAudit(data)) actions.push({ id: "permissions", label: "Inspect audit", panel: "permissions" });
    return actions;
  }
  if (toolName === "workflow_update_run_settings") {
    actions = [{ id: "manifest", label: "Inspect limits", panel: "manifest" }];
    if (recordValue(data?.revision)) actions.push({ id: "versions", label: "Inspect version", panel: "versions" });
    if (workflowNativeActionHasAudit(data)) actions.push({ id: "permissions", label: "Inspect audit", panel: "permissions" });
    return actions;
  }
  if (toolName === "workflow_apply_revision") {
    actions = [
      { id: "diagram", label: "Inspect diagram", panel: "diagram" },
      { id: "versions", label: "Inspect version", panel: "versions" },
    ];
    if (workflowNativeActionHasAudit(data)) actions.push({ id: "permissions", label: "Inspect audit", panel: "permissions" });
    return actions;
  }
  if (toolName === "workflow_restore_version") {
    actions = [
      { id: "versions", label: "Inspect versions", panel: "versions" },
      { id: "diagram", label: "Inspect diagram", panel: "diagram" },
    ];
    if (workflowNativeActionHasAudit(data)) actions.push({ id: "permissions", label: "Inspect audit", panel: "permissions" });
    return actions;
  }
  return [];
}

function workflowNativeActionHasAudit(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (stringValue(data.auditId) || recordValue(data.audit)) return true;
  const applied = recordValue(data.applied);
  return Boolean(stringValue(applied?.auditId) || recordValue(applied?.audit));
}

function runActionTitle(toolName: WorkflowNativeToolName, runStatus: string | undefined): string {
  const prefix = toolName === "workflow_run_preview" ? "Preview run" : "Workflow run";
  if (runStatus === "succeeded") return `${prefix} completed`;
  if (runStatus === "failed") return `${prefix} failed`;
  if (runStatus === "paused") return `${prefix} paused`;
  if (runStatus === "needs_input") return `${prefix} needs input`;
  if (runStatus === "running") return `${prefix} running`;
  if (runStatus === "canceled") return `${prefix} canceled`;
  return `${prefix} finished`;
}

function runActionTone(runStatus: string | undefined): WorkflowThreadTranscriptTone {
  if (runStatus === "running") return "active";
  if (runStatus === "succeeded") return "success";
  if (runStatus === "failed" || runStatus === "canceled") return "danger";
  if (runStatus === "paused" || runStatus === "needs_input") return "warning";
  return "neutral";
}

function traceBadges(trace: Record<string, unknown> | undefined): string[] {
  if (!trace) return [];
  const eventCount = numberValue(trace.eventCount);
  const modelCallCount = numberValue(trace.modelCallCount);
  const checkpointCount = numberValue(trace.checkpointCount);
  const approvalCount = numberValue(trace.approvalCount);
  return [
    eventCount !== undefined ? `${eventCount} ${eventCount === 1 ? "event" : "events"}` : undefined,
    modelCallCount !== undefined ? `${modelCallCount} ${modelCallCount === 1 ? "model call" : "model calls"}` : undefined,
    checkpointCount ? `${checkpointCount} ${checkpointCount === 1 ? "checkpoint" : "checkpoints"}` : undefined,
    approvalCount ? `${approvalCount} review ${approvalCount === 1 ? "item" : "items"}` : undefined,
  ].filter((badge): badge is string => Boolean(badge));
}

function runLimitBadges(runLimits: Record<string, unknown> | undefined): string[] {
  if (!runLimits) return [];
  const idleTimeoutMs = numberValue(runLimits.idleTimeoutMs);
  const maxRunMs = numberValue(runLimits.maxRunMs);
  return [
    idleTimeoutMs !== undefined ? `Idle timeout ${formatDuration(idleTimeoutMs)}` : undefined,
    maxRunMs !== undefined ? `Total cap ${formatDuration(maxRunMs)}` : "No total cap",
  ].filter((badge): badge is string => Boolean(badge));
}

function validationDetailItems(validation: Record<string, unknown> | undefined): string[] {
  if (!validation) return [];
  const checks = Array.isArray(validation.checks) ? validation.checks : [];
  return checks.flatMap((check) => {
    const record = recordValue(check);
    if (!record) return [];
    const name = stringValue(record.name);
    const status = stringValue(record.status);
    const detail = stringValue(record.detail);
    if (!name && !detail) return [];
    return [`${status ? `${formatWorkflowLabel(status)} ` : ""}${name || "check"}${detail ? `: ${detail}` : ""}`];
  });
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => stringValue(item) ?? []) : [];
}

function versionBadge(version: Record<string, unknown> | undefined, label = "Version"): string | undefined {
  const versionNumber = numberValue(version?.version);
  if (versionNumber !== undefined) return `${label} ${versionNumber}`;
  const versionId = stringValue(version?.id);
  return versionId ? `${label} ${versionId}` : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function countBadge(counts: Record<string, unknown> | undefined, key: string, label: string): string | undefined {
  const count = numberValue(counts?.[key]);
  return count !== undefined ? `${count} ${label}${count === 1 ? "" : "s"}` : undefined;
}

function isWorkflowChatMessage(message: ChatMessage): boolean {
  if (message.role !== "user" && message.role !== "assistant") return false;
  if (message.role === "assistant" && message.metadata?.kind === "thinking") return false;
  return Boolean(message.content.trim()) || stringFromRecord(message.metadata, "status") === "streaming";
}

function compactChatMessageDetail(content: string, role: ChatMessage["role"], active: boolean): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized) return normalized.length > 1200 ? `${normalized.slice(0, 1197).trimEnd()}...` : normalized;
  if (active && role === "assistant") return "Pi is responding in Workflow Chat.";
  if (active) return "Waiting for this Workflow Agent message to complete.";
  return "No message text recorded.";
}

function revisionTone(status: WorkflowRevisionSummary["status"]): WorkflowThreadTranscriptTone {
  if (status === "applied") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function workflowRunTranscriptCard(detail: WorkflowRunDetail): WorkflowThreadTranscriptCard {
  return {
    id: `run:${detail.run.id}`,
    kind: "run",
    tone: runStatusTone(detail.run.status),
    title: runStatusTitle(detail.run.status),
    detail: detail.run.error || runStatusDetail(detail),
    badges: [
      formatWorkflowLabel(detail.run.status),
      `${detail.events.length} ${detail.events.length === 1 ? "event" : "events"}`,
      `${detail.modelCalls.length} ${detail.modelCalls.length === 1 ? "model call" : "model calls"}`,
      detail.approvals.length ? `${detail.approvals.length} review ${detail.approvals.length === 1 ? "item" : "items"}` : undefined,
    ].filter((badge): badge is string => Boolean(badge)),
    timestamp: detail.run.updatedAt,
    panelActions: workflowRunPanelActions(detail.run.status),
  };
}

function workflowEventTranscriptCard(event: WorkflowRunEvent): WorkflowThreadTranscriptCard {
  const graphLabel = event.graphNodeId ? `Node ${event.graphNodeId}` : "Unmapped event";
  const detailLabels = workflowRunEventDetailLabels(event).slice(0, 4);
  return {
    id: `event:${event.id}`,
    kind: "event",
    tone: eventTone(event),
    title: eventTitle(event),
    detail: eventDetail(event),
    badges: [eventBadge(event), graphLabel, event.itemKey ? `Item ${event.itemKey}` : undefined, ...detailLabels].filter((badge): badge is string => Boolean(badge)),
    timestamp: event.createdAt,
    panelActions: workflowEventPanelActions(event),
  };
}

function workflowRunPanelActions(status: WorkflowRunDetail["run"]["status"]): WorkflowThreadTranscriptPanelAction[] {
  const actions: WorkflowThreadTranscriptPanelAction[] = [];
  if (status === "needs_input") actions.push({ id: "runtime_input", label: "Answer input", panel: "runtime_input" });
  actions.push({ id: "run_console", label: "Open run console", panel: "run_console" });
  if (status === "succeeded" || status === "paused" || status === "needs_input") actions.push({ id: "outputs", label: "Inspect outputs", panel: "outputs" });
  return actions;
}

function workflowEventPanelActions(event: WorkflowRunEvent): WorkflowThreadTranscriptPanelAction[] | undefined {
  if (event.type === "workflow.awaiting_input" || event.type === "workflow.input.required") {
    return [
      { id: "runtime_input", label: "Answer input", panel: "runtime_input" },
      { id: "run_console", label: "Open run console", panel: "run_console" },
    ];
  }
  if (event.type === "workflow.succeeded") return [{ id: "outputs", label: "Inspect outputs", panel: "outputs" }];
  if (event.type === "workflow.timeout" || event.type === "workflow.failed" || event.type.endsWith(".error") || event.type.endsWith(".failed")) {
    return [{ id: "run_console", label: "Open run console", panel: "run_console" }];
  }
  return undefined;
}

function latestMeaningfulEvent(events: WorkflowRunEvent[]): WorkflowRunEvent | undefined {
  return [...events].reverse().find(isMeaningfulEvent);
}

function workflowRunTouchpointEvents(events: WorkflowRunEvent[]): WorkflowRunEvent[] {
  const latest = latestMeaningfulEvent(events);
  const selected = new Map<string, WorkflowRunEvent>();
  if (latest) selected.set(latest.id, latest);
  for (const event of [...events].reverse()) {
    if (!isWorkflowTouchpointEvent(event)) continue;
    selected.set(event.id, event);
    if (selected.size >= 5) break;
  }
  return [...selected.values()].sort((left, right) => left.seq - right.seq || left.createdAt.localeCompare(right.createdAt));
}

function isMeaningfulEvent(event: WorkflowRunEvent): boolean {
  return !["workflow.version", "workflow.mode"].includes(event.type);
}

function isWorkflowTouchpointEvent(event: WorkflowRunEvent): boolean {
  if (!isMeaningfulEvent(event)) return false;
  if (event.type.startsWith("workflow.recovery.")) return true;
  return new Set([
    "workflow.status_update",
    "workflow.milestone",
    "workflow.node_started",
    "workflow.node_completed",
    "workflow.awaiting_input",
    "workflow.input.required",
    "workflow.review_ready",
    "workflow.limit_warning",
    "workflow.recovery_summary",
    "workflow.connector-preflight",
    "workflow.paused",
    "workflow.timeout",
    "workflow.failed",
    "workflow.succeeded",
    "workflow.canceled",
    "approval.required",
    "approval.rejected",
    "ambient.call.error",
    "step.error",
    "tool.error",
    "connector.error",
  ]).has(event.type);
}

function artifactStatusTone(status: WorkflowArtifactSummary["status"]): WorkflowThreadTranscriptTone {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "ready_for_preview") return "warning";
  return "neutral";
}

function runStatusTone(status: WorkflowRunDetail["run"]["status"]): WorkflowThreadTranscriptTone {
  if (status === "running") return "active";
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "canceled") return "danger";
  if (status === "paused" || status === "needs_input") return "warning";
  return "neutral";
}

function eventTone(event: WorkflowRunEvent): WorkflowThreadTranscriptTone {
  if (event.type === "workflow.connector-preflight") return stringValue(event.data?.status) === "blocked" ? "danger" : "success";
  if (event.type === "workflow.status_update" || event.type === "workflow.milestone" || event.type === "workflow.node_completed") return "success";
  if (event.type === "workflow.awaiting_input" || event.type === "workflow.input.required" || event.type === "workflow.review_ready" || event.type === "workflow.limit_warning") return "warning";
  if (event.type.endsWith(".progress") || event.type.endsWith(".start") || event.type === "workflow.start") return "active";
  if (event.type === "workflow.succeeded" || event.type.endsWith(".end") || event.type === "checkpoint.write") return "success";
  if (event.type === "approval.required" || event.type === "workflow.paused") return "warning";
  if (event.type === "workflow.failed" || event.type.endsWith(".failed") || event.type.endsWith(".error") || event.type.endsWith(".invalid")) return "danger";
  return "neutral";
}

function eventTitle(event: WorkflowRunEvent): string {
  if (event.type === "workflow.status_update") return "Status update";
  if (event.type === "workflow.milestone") return "Milestone";
  if (event.type === "workflow.node_started") return "Node started";
  if (event.type === "workflow.node_completed") return "Node completed";
  if (event.type === "workflow.awaiting_input" || event.type === "workflow.input.required") return "Workflow needs input";
  if (event.type === "workflow.review_ready" || event.type === "approval.required") return "Review required";
  if (event.type === "workflow.limit_warning") return "Limit warning";
  if (event.type === "workflow.recovery_summary") return "Recovery summary";
  if (event.type === "workflow.connector-preflight") return "Connector preflight";
  if (event.type.startsWith("workflow.recovery.")) return formatWorkflowLabel(event.type.replace(/^workflow\.recovery\./, "recovery."));
  if (event.type === "workflow.timeout") return "Run timeout";
  if (event.type === "ambient.call.error") return "Ambient call error";
  if (event.type === "step.error") return "Step failed";
  if (event.type === "tool.error") return "Tool failed";
  if (event.type === "connector.error") return "Connector failed";
  return formatWorkflowLabel(event.type);
}

function eventDetail(event: WorkflowRunEvent): string {
  if (event.message) return event.message;
  const prompt = stringValue(event.data?.prompt);
  if ((event.type === "workflow.input.required" || event.type === "workflow.awaiting_input") && prompt) return prompt;
  const reason = stringValue(event.data?.reason);
  if (reason) return reason;
  return summarizeEventData(event.data) || `Event ${event.seq}`;
}

function eventBadge(event: WorkflowRunEvent): string | undefined {
  if (event.type === "workflow.status_update") return "Status";
  if (event.type === "workflow.milestone") return "Milestone";
  if (event.type === "workflow.node_started" || event.type === "workflow.node_completed") return "Node";
  if (event.type === "workflow.awaiting_input" || event.type === "workflow.input.required") return "Needs input";
  if (event.type === "workflow.review_ready" || event.type === "approval.required") return "Review";
  if (event.type === "workflow.limit_warning" || event.type === "workflow.timeout") return "Limit";
  if (event.type === "workflow.connector-preflight") return "Connectors";
  if (event.type.startsWith("workflow.recovery.")) return "Recovery";
  if (event.type === "ambient.call.error") return "Provider";
  if (event.type.endsWith(".error") || event.type.endsWith(".failed")) return "Failure";
  return undefined;
}

function artifactStatusDetail(status: WorkflowArtifactSummary["status"]): string {
  if (status === "approved") return "This workflow version is approved and can run or be scheduled.";
  if (status === "ready_for_preview") return "Compile output is available for preview before review.";
  if (status === "rejected") return "This workflow version was rejected. Revise it before running.";
  if (status === "archived") return "This workflow artifact is archived and retained for history.";
  return "Workflow artifact is available.";
}

function runStatusTitle(status: WorkflowRunDetail["run"]["status"]): string {
  if (status === "running") return "Workflow run is running";
  if (status === "needs_input") return "Workflow run needs input";
  if (status === "paused") return "Workflow run needs review";
  if (status === "succeeded") return "Workflow run completed";
  if (status === "failed") return "Workflow run failed";
  if (status === "canceled") return "Workflow run canceled";
  return "Workflow run";
}

function runStatusDetail(detail: WorkflowRunDetail): string {
  const latestEvent = latestMeaningfulEvent(detail.events);
  if (!latestEvent && detail.run.status === "needs_input") return "Workflow run is waiting for user input.";
  if (!latestEvent) return "Run has started.";
  return latestEvent.message || summarizeEventData(latestEvent.data) || `${formatWorkflowLabel(latestEvent.type)} recorded.`;
}

function summarizeEventData(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data).slice(0, 4)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") parts.push(`${formatWorkflowLabel(key)}: ${String(value)}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatWorkflowLabel(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}
