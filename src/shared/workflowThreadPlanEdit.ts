import type { WorkflowAgentThreadSummary } from "./workflowTypes";

export type WorkflowPlanEditIntentKind =
  | "question"
  | "run_settings"
  | "manifest_limits"
  | "capability_change"
  | "graph_source_change"
  | "recovery"
  | "ambiguous";

export type WorkflowPlanEditIntentConfidence = "high" | "medium" | "low";

export interface WorkflowPlanEditIntent {
  kind: WorkflowPlanEditIntentKind;
  confidence: WorkflowPlanEditIntentConfidence;
  signals: string[];
  guidance: string;
}

export interface WorkflowThreadPlanEditPromptInput {
  thread: Pick<
    WorkflowAgentThreadSummary,
    | "id"
    | "title"
    | "phase"
    | "initialRequest"
    | "projectName"
    | "projectPath"
    | "activeArtifactId"
    | "latestVersion"
    | "graph"
    | "latestRun"
  >;
  userRequest: string;
}

export function workflowThreadPlanEditPrompt(input: WorkflowThreadPlanEditPromptInput): string {
  const { thread } = input;
  const intent = classifyWorkflowPlanEditIntent(input.userRequest);
  const graphSummary = thread.graph
    ? `${thread.graph.nodes.length} nodes, ${thread.graph.edges.length} edges, snapshot ${thread.graph.version}`
    : "no graph snapshot";
  const latestRunSummary = thread.latestRun ? `${thread.latestRun.status} run ${thread.latestRun.id}` : "no latest run";
  const latestVersionSummary = thread.latestVersion ? `version ${thread.latestVersion.version} (${thread.latestVersion.status})` : "no version yet";
  return [
    "You are in Workflow Agent Plan/Edit mode.",
    "",
    "Current workflow context:",
    `- workflowThreadId: ${thread.id}`,
    `- title: ${thread.title}`,
    `- phase: ${thread.phase}`,
    `- project: ${thread.projectName} (${thread.projectPath})`,
    `- activeArtifactId: ${thread.activeArtifactId ?? "none"}`,
    `- latestVersion: ${latestVersionSummary}`,
    `- graph: ${graphSummary}`,
    `- latestRun: ${latestRunSummary}`,
    `- originalRequest: ${thread.initialRequest}`,
    "",
    "Ambient routing hint:",
    `- intent: ${intent.kind}`,
    `- confidence: ${intent.confidence}`,
    `- signals: ${intent.signals.length ? intent.signals.join(", ") : "none"}`,
    `- guidance: ${intent.guidance}`,
    "",
    "Workflow-native tool contract:",
    "- Even when Planner Mode is active, workflow-native inspect/propose/validate/diff tools are available for local review-only revision work.",
    "- In run-settings intent, workflow_update_run_settings may be used only with action preview_foreground to preview one-off foreground run limits; persistent run-setting changes should be proposed as revisions.",
    "- Use workflow_current_context first when you need the current workflow state.",
    "- Use workflow_get_artifact and workflow_get_source before proposing source, manifest, or graph changes.",
    "- Use workflow_get_run_trace when the user asks about a failure, runtime behavior, or recovery.",
    "- Use workflow_get_versions when the user asks to compare, restore, or reason about previous versions.",
    "- Use workflow_capability_search and workflow_capability_describe when a requested edit depends on tools, connectors, plugins, or Ambient CLI capabilities.",
    "- For lightweight manifest or limit edits, call workflow_propose_manifest_revision with explicit fields instead of restarting discovery or rewriting source.",
    "- After workflow_propose_manifest_revision creates a proposal, validate and explain that same revision id; do not call workflow_propose_revision for the same manifest-only edit.",
    "- To change the workflow, call workflow_propose_revision with the exact workflowThreadId above.",
    "- After proposing a revision, call workflow_validate_revision, then workflow_explain_revision_diff so the transcript can show an inspectable proposal.",
    "",
    "Boundaries:",
    "- Do not edit generated workflow files directly.",
    "- Do not apply, reject, approve, run, schedule, restore workflow versions, or persist workflow settings unless the user explicitly asks and the relevant gated tool is available.",
    "- If the request is only a question, answer it from inspected workflow context without creating a revision.",
    "- If the edit is ambiguous, ask concise clarification questions instead of guessing.",
    "",
    "User request:",
    input.userRequest,
  ].join("\n");
}

export function classifyWorkflowPlanEditIntent(request: string): WorkflowPlanEditIntent {
  const text = request.trim();
  const normalized = text.toLowerCase();
  if (!normalized) {
    return {
      kind: "ambiguous",
      confidence: "low",
      signals: [],
      guidance: "Ask a concise clarification question before inspecting or proposing workflow changes.",
    };
  }

  const questionSignals = matchedSignals(normalized, [
    ["question mark", /\?/],
    ["explain", /\b(explain|describe|what|why|how|where|when|which)\b/],
    ["compare", /\b(compare|summarize|show me|walk me through)\b/],
  ]);
  const mutationSignals = matchedSignals(normalized, [
    ["edit verb", /\b(change|update|modify|increase|decrease|raise|lower|set|add|remove|switch|use|replace|make|enable|disable)\b/],
  ]);
  const recoverySignals = matchedSignals(normalized, [
    ["failure", /\b(error|failed|failure|bug|debug|fix|crash|stuck)\b/],
    ["recovery action", /\b(retry|resume|skip|recover|checkpoint)\b/],
  ]);
  if (recoverySignals.length > 0) {
    return {
      kind: "recovery",
      confidence: "high",
      signals: recoverySignals,
      guidance: "Inspect the current run trace before proposing recovery, debug rewrite, retry, resume, or skip changes.",
    };
  }

  const runSettingSignals = matchedSignals(normalized, [
    ["idle timeout", /\b(idle|stream|progress|no stream|no progress)\b.{0,32}\b(timeout|watchdog)\b|\b(timeout|watchdog)\b.{0,32}\b(idle|stream|progress|no stream|no progress)\b/],
    ["total runtime", /\b(total runtime|overall runtime|max runtime|run time cap|runtime cap|total cap)\b/],
    ["foreground run settings", /\b(run[- ]settings|manual runs?|foreground runs?|extend run|remove total limit)\b/],
    ["workflow run settings tool", /\bworkflow_update_run_settings\b|\bpreview_foreground\b/],
    ["run settings fields", /\b(idletimeoutms|defaultidletimeoutms|clearmaxrunms|maxrunms)\b/],
  ]);
  if (runSettingSignals.length > 0) {
    return {
      kind: "run_settings",
      confidence: "high",
      signals: runSettingSignals,
      guidance:
        "Treat this as a run-setting request. Explain or adjust foreground run settings when possible; use a manifest-only revision only for persistent workflow limits.",
    };
  }

  const manifestLimitSignals = matchedSignals(normalized, [
    ["tool budget", /\b(max tool calls?|maxtoolcalls|tool calls?|tool budget)\b/],
    ["model budget", /\b(max model calls?|maxmodelcalls|model calls?|model budget)\b/],
    ["connector budget", /\b(max connector calls?|maxconnectorcalls|connector calls?|connector budget)\b/],
    ["mutation policy", /\b(mutation policy|mutationpolicy|read only|staged|full access|review threshold|confidence threshold)\b/],
    ["trace retention", /\b(trace retention|debug mode|prod mode|retain traces|retention schedule)\b/],
  ]);
  if (manifestLimitSignals.length > 0) {
    return {
      kind: "manifest_limits",
      confidence: "high",
      signals: manifestLimitSignals,
      guidance: "Inspect the artifact manifest and propose a manifest-only revision unless source or graph behavior must change.",
    };
  }

  const capabilitySignals = matchedSignals(normalized, [
    ["connector", /\b(connector|gmail|google drive|google calendar|slack|browser|web search|arxiv|plugin|mcp|tool|capability|grant)\b/],
    ["capability edit", /\b(use|switch to|replace with|add|remove|enable|disable)\b.{0,48}\b(connector|plugin|tool|gmail|drive|calendar|browser|arxiv|slack)\b/],
  ]);
  if (capabilitySignals.length > 0 && mutationSignals.length > 0) {
    return {
      kind: "capability_change",
      confidence: "high",
      signals: unique([...capabilitySignals, ...mutationSignals]),
      guidance: "Search and describe relevant capabilities, then propose graph/source/manifest changes with explicit grants and validation.",
    };
  }

  const graphSourceSignals = matchedSignals(normalized, [
    ["workflow step", /\b(step|node|edge|graph|diagram|flow|branch|gate|review gate|checkpoint)\b/],
    ["source behavior", /\b(source|script|code|logic|output|format|schema|prompt|model role|control flow)\b/],
  ]);
  if (graphSourceSignals.length > 0 && mutationSignals.length > 0) {
    return {
      kind: "graph_source_change",
      confidence: "medium",
      signals: unique([...graphSourceSignals, ...mutationSignals]),
      guidance: "Inspect the artifact, source, and graph before proposing source and graph changes; validate and explain the revision diff.",
    };
  }

  if (questionSignals.length > 0 && mutationSignals.length === 0) {
    return {
      kind: "question",
      confidence: "medium",
      signals: questionSignals,
      guidance: "Answer from workflow context and native inspection tools; do not create a revision unless the user asks for a change.",
    };
  }

  return {
    kind: "ambiguous",
    confidence: "low",
    signals: unique([...questionSignals, ...mutationSignals]),
    guidance: "Inspect current context and ask a concise clarification question if the desired workflow change is not explicit.",
  };
}

function matchedSignals(text: string, checks: Array<[string, RegExp]>): string[] {
  return checks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
