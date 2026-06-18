import type { ChatMessage } from "../../shared/threadTypes";
import type { WorkflowAgentThreadSummary, WorkflowDiscoveryCapabilitySearch, WorkflowDiscoveryCapabilitySearchResult, WorkflowExplorationProgress, WorkflowExplorationTraceSummary, WorkflowRevisionSummary } from "../../shared/workflowTypes";

export interface WorkflowExplorationGateInput {
  requestContext?: boolean;
  chatTurnCount?: number;
  answeredQuestionCount?: number;
  compiledContext?: boolean;
  revisionContext?: boolean;
  capabilitySearch?: WorkflowDiscoveryCapabilitySearch;
  traceCount?: number;
  skipped?: boolean;
  progressStatus?: "running" | "succeeded" | "failed";
  progressMessage?: string;
}

export type WorkflowExplorationGateState = "locked" | "recommended" | "running" | "completed" | "skipped";

export interface WorkflowExplorationGateModel {
  enabled: boolean;
  canRun: boolean;
  canSkip: boolean;
  canCompileFromExploration: boolean;
  canCompileWithoutExploration: boolean;
  state: WorkflowExplorationGateState;
  label: "Locked" | "Recommended" | "Running" | "Completed" | "Skipped";
  title: string;
  detail: string;
  reasonLabels: string[];
}

export interface WorkflowExplorationGateForThreadInput {
  thread: WorkflowAgentThreadSummary;
  revision?: WorkflowRevisionSummary;
  chatMessages?: ChatMessage[];
  traces?: WorkflowExplorationTraceSummary[];
  progress?: WorkflowExplorationProgress;
  skipped?: boolean;
}

export function workflowExplorationGateForThread({
  thread,
  revision,
  chatMessages = [],
  traces = [],
  progress,
  skipped,
}: WorkflowExplorationGateForThreadInput): WorkflowExplorationGateModel {
  const chatTurns = chatMessages.filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim()).length;
  const scopedQuestions = thread.discoveryQuestions.filter((question) => !revision || question.revisionId === revision.id);
  const scopedAnswers = scopedQuestions.filter((question) => Boolean(question.answer)).length;
  const completedTraceCount = traces.filter((trace) => trace.status === undefined || trace.status === "succeeded").length;
  const capabilitySearch = [...scopedQuestions].reverse().find((question) => question.capabilitySearch)?.capabilitySearch;
  return workflowExplorationGateModel({
    requestContext: Boolean(thread.initialRequest.trim()),
    chatTurnCount: chatTurns,
    answeredQuestionCount: scopedAnswers,
    compiledContext: Boolean(thread.activeArtifactId || thread.latestVersion),
    revisionContext: Boolean(revision),
    capabilitySearch,
    traceCount: completedTraceCount,
    skipped,
    progressStatus: progress?.status,
    progressMessage: progress?.message,
  });
}

export function workflowExplorationGateModel(input: WorkflowExplorationGateInput): WorkflowExplorationGateModel {
  const hasContext =
    Boolean(input.requestContext) ||
    (input.chatTurnCount ?? 0) > 0 ||
    (input.answeredQuestionCount ?? 0) > 0 ||
    Boolean(input.compiledContext) ||
    Boolean(input.revisionContext);
  const reasonLabels = explorationReasonLabels(input);
  if (input.progressStatus === "running") {
    return {
      enabled: true,
      canRun: false,
      canSkip: false,
      canCompileFromExploration: false,
      canCompileWithoutExploration: false,
      state: "running",
      label: "Running",
      title: "Exploration is running",
      detail: input.progressMessage || "Pi is exploring the workflow surface and collecting trace evidence.",
      reasonLabels,
    };
  }
  if ((input.traceCount ?? 0) > 0 || input.progressStatus === "succeeded") {
    return {
      enabled: true,
      canRun: true,
      canSkip: false,
      canCompileFromExploration: true,
      canCompileWithoutExploration: false,
      state: "completed",
      label: "Completed",
      title: "Exploration trace is ready",
      detail: "Compile from the retained exploration trace, or rerun exploration if the evidence is stale or incomplete.",
      reasonLabels: [...reasonLabels, `${input.traceCount ?? 1} trace${(input.traceCount ?? 1) === 1 ? "" : "s"}`],
    };
  }
  if (input.skipped && hasContext) {
    return {
      enabled: true,
      canRun: true,
      canSkip: false,
      canCompileFromExploration: false,
      canCompileWithoutExploration: true,
      state: "skipped",
      label: "Skipped",
      title: "Exploration skipped for this compile",
      detail: "Compile directly from the workflow request, discovery answers, and current graph. You can still run exploration before compiling if live evidence becomes useful.",
      reasonLabels: [...reasonLabels, "User skipped"],
    };
  }
  if (!hasContext) {
    return {
      enabled: false,
      canRun: false,
      canSkip: false,
      canCompileFromExploration: false,
      canCompileWithoutExploration: false,
      state: "locked",
      label: "Locked",
      title: "Exploration unlocks after workflow context",
      detail: "Start with a workflow request, workflow chat, or discovery answers so Pi has a scoped objective, budget, and permission surface before it can explore with tools.",
      reasonLabels: ["Needs workflow context"],
    };
  }
  return {
    enabled: true,
    canRun: true,
    canSkip: true,
    canCompileFromExploration: false,
    canCompileWithoutExploration: false,
    state: "recommended",
    label: "Recommended",
    title: input.progressStatus === "failed" ? "Exploration failed; retry or skip" : "Exploration recommended before compile",
    detail:
      input.progressStatus === "failed"
        ? input.progressMessage || "The last exploration attempt failed. Retry after addressing the issue, or skip if current context is enough to compile."
        : capabilityRecommendationDetail(input.capabilitySearch) ??
          "Run a bounded Pi exploration pass when live evidence, tool probing, or data-shape discovery would make the workflow source more reliable.",
    reasonLabels,
  };
}

function explorationReasonLabels(input: WorkflowExplorationGateInput): string[] {
  const labels = [
    input.requestContext ? "Workflow request" : undefined,
    (input.chatTurnCount ?? 0) > 0 ? `${input.chatTurnCount} chat ${input.chatTurnCount === 1 ? "turn" : "turns"}` : undefined,
    (input.answeredQuestionCount ?? 0) > 0 ? `${input.answeredQuestionCount} discovery ${input.answeredQuestionCount === 1 ? "answer" : "answers"}` : undefined,
    input.compiledContext ? "Compiled context" : undefined,
    input.revisionContext ? "Revision context" : undefined,
    ...capabilityReasonLabels(input.capabilitySearch),
  ].filter((label): label is string => Boolean(label));
  return labels.length ? labels : ["Context pending"];
}

function capabilityReasonLabels(search: WorkflowDiscoveryCapabilitySearch | undefined): string[] {
  if (!search?.results.length) return [];
  return search.results.slice(0, 3).map((result) => capabilityResultReasonLabel(result));
}

function capabilityResultReasonLabel(result: WorkflowDiscoveryCapabilitySearchResult): string {
  if (result.kind === "plugin_tool") return `Plugin: ${result.label}`;
  if (result.kind === "ambient_cli") return `Ambient CLI: ${result.label}`;
  if (result.kind === "connector") return `Connector: ${result.label}`;
  if (result.kind === "base_directory") return "Base-directory files";
  if (result.kind === "browser_fallback") return "Browser fallback";
  return result.label;
}

function capabilityRecommendationDetail(search: WorkflowDiscoveryCapabilitySearch | undefined): string | undefined {
  if (!search) return undefined;
  const preferred = search.results.find((result) => result.recommendation === "recommended") ?? search.results.find((result) => result.recommendation === "available");
  if (preferred?.kind === "plugin_tool") {
    return `Capability search found ${preferred.label}. Run exploration to verify the plugin call shape, required grant, retained evidence, and deterministic compile strategy before generating workflow source.`;
  }
  if (preferred?.kind === "ambient_cli") {
    return `Capability search found ${preferred.label}. Run exploration to verify the Ambient CLI command shape, required grant, retained evidence, and deterministic compile strategy before generating workflow source.`;
  }
  if (preferred?.kind === "connector") {
    return `Capability search found ${preferred.label}. Run exploration to verify connector read shape, account/grant requirements, retained evidence, and deterministic compile strategy before generating workflow source.`;
  }
  if (preferred?.kind === "base_directory") {
    return "Capability search found base-directory files. Run exploration to verify file-selection shape, content-read grant needs, retained evidence, and deterministic compile strategy before generating workflow source.";
  }
  const fallback = search.results.find((result) => result.kind === "browser_fallback");
  if (fallback) {
    return `Capability search found no workflow-safe connector or plugin ahead of ${fallback.label}. Run exploration to verify the browser/file fallback path, challenge risk, retained evidence, and deterministic compile strategy before generating workflow source.`;
  }
  if (!search.results.length) {
    return "Capability search found no request-specific connector or plugin matches. Run exploration if browser, file, or manual-input fallback evidence would make the workflow source more reliable.";
  }
  return undefined;
}
