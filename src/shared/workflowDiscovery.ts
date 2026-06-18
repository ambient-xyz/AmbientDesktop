import type { WorkflowDiscoveryQuestion, WorkflowDiscoveryQuestionCategory, WorkflowGraphEdge, WorkflowGraphNode, WorkflowGraphSnapshot } from "./workflowTypes";

export interface InitialWorkflowDiscoveryInput {
  workflowThreadId: string;
  request: string;
  projectPath: string;
  intelligence?: WorkflowDiscoveryIntelligence;
  revisionContext?: WorkflowDiscoveryRevisionContext;
}

export interface WorkflowDiscoveryIntelligence {
  contextSummary: string;
  fileCandidates: string[];
  connectorLabels: string[];
  pluginToolLabels: string[];
  ambientCliLabels?: string[];
  policyNotes: string[];
}

export interface WorkflowDiscoveryRevisionContext {
  baseTitle: string;
  baseGoal?: string;
  baseSummary?: string;
  requestedChange: string;
}

export interface WorkflowDiscoveryGraphInput {
  workflowThreadId: string;
  request: string;
  questions: WorkflowDiscoveryQuestion[];
  createdAt?: string;
}

type DiscoveryQuestionDraft = Omit<WorkflowDiscoveryQuestion, "id" | "createdAt" | "workflowThreadId">;

export function initialWorkflowDiscoveryQuestions(input: InitialWorkflowDiscoveryInput): DiscoveryQuestionDraft[] {
  const context = [
    `Request: ${input.request}`,
    `Base directory: ${input.projectPath}`,
    input.revisionContext
      ? [
          `Revision target: ${input.revisionContext.baseTitle}`,
          input.revisionContext.baseGoal ? `Current goal: ${input.revisionContext.baseGoal}` : undefined,
          input.revisionContext.baseSummary ? `Current summary: ${input.revisionContext.baseSummary}` : undefined,
          `Requested change: ${input.revisionContext.requestedChange}`,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n")
      : undefined,
    input.intelligence?.contextSummary,
    input.intelligence?.policyNotes.length ? `Discovery policy: ${input.intelligence.policyNotes.join(" ")}` : undefined,
  ]
    .filter((line): line is string => Boolean(line?.trim()))
    .join("\n");
  const fileDescription = input.intelligence?.fileCandidates.length
    ? `Use discovered candidate files such as ${input.intelligence.fileCandidates.slice(0, 4).join(", ")}.`
    : "Use files under the workflow project folder as fair-game read-only inputs.";
  const connectorPluginLabels = [
    ...(input.intelligence?.connectorLabels ?? []),
    ...(input.intelligence?.pluginToolLabels ?? []),
    ...(input.intelligence?.ambientCliLabels ?? []),
  ];
  if (input.revisionContext) return revisionWorkflowDiscoveryQuestions(input, context, fileDescription, connectorPluginLabels);
  return [
    {
      category: "scope",
      context,
      question: "What should trigger this workflow and what should count as a successful result?",
      choices: [
        {
          id: "manual-report",
          label: "Manual briefing",
          description: "Run on demand and produce a reviewable report or summary.",
          recommended: true,
        },
        {
          id: "batch-processing",
          label: "Batch processing",
          description: "Process a set of files or records and emit structured results.",
        },
        {
          id: "review-queue",
          label: "Review queue",
          description: "Identify candidates that need user review before anything changes.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Defines the request, deterministic planning step, output node, and review posture.",
    },
    {
      category: "data_sources",
      context,
      question: "Which data sources should Ambient inspect while designing and running the workflow?",
      choices: [
        {
          id: "base-directory",
          label: "Base directory",
          description: fileDescription,
          recommended: true,
        },
        {
          id: "web-browser",
          label: "Web/browser",
          description: "Allow browser search or page inspection during workflow runs.",
        },
        {
          id: "connectors",
          label: "Connectors/plugins",
          description: connectorPluginLabels.length
            ? `Use available capabilities after grants are reviewed: ${connectorPluginLabels.slice(0, 4).join(", ")}.`
            : "Use available connector, plugin, or Ambient CLI capabilities after grants are reviewed.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Adds or changes data-source and connector nodes before compilation.",
    },
    {
      category: "model_role",
      context,
      question: "What should the selected Ambient Desktop model do inside the workflow?",
      choices: [
        {
          id: "summarize",
          label: "Summarization",
          description: "Use Ambient Desktop's selected model to synthesize findings into a concise output while deterministic code handles control flow.",
          recommended: true,
        },
        {
          id: "extract-classify",
          label: "Extract/classify",
          description: "Use Ambient Desktop's selected model to convert unstructured inputs into typed categories or fields.",
        },
        {
          id: "control-flow",
          label: "Control-flow decision",
          description: "Use Ambient Desktop's selected model to choose branches, rankings, or escalation decisions with review gates.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Clarifies the model.call node role, expected inputs/outputs, and retry policy using ambient.responses without extra model-provider grants.",
    },
    {
      category: "side_effects",
      context,
      question: "What side effects should the workflow be allowed to perform after review?",
      choices: [
        {
          id: "read-only",
          label: "Read-only",
          description: "Only inspect inputs and generate reports; no external writes or project mutations.",
          recommended: true,
        },
        {
          id: "staged-changes",
          label: "Stage changes",
          description: "Prepare changes or connector mutations, then pause for approval before applying.",
        },
        {
          id: "approved-automation",
          label: "Apply after approval",
          description: "Allow approved workflow versions to apply bounded mutations during real runs.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Sets mutation policy, approval gates, dry-run expectations, and connector grant posture.",
    },
    {
      category: "error_handling",
      context,
      question: "How should the workflow handle failed steps or uncertain model outputs?",
      choices: [
        {
          id: "pause-debug",
          label: "Pause and debug",
          description: "Stop on failures, preserve trace context, and offer Ambient debug rewrite.",
          recommended: true,
        },
        {
          id: "retry-safe",
          label: "Retry safe steps",
          description: "Retry deterministic or idempotent steps when retained inputs or checkpoints make it safe.",
        },
        {
          id: "skip-item",
          label: "Skip item",
          description: "Skip failed batch items while preserving an audit note for later review.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Defines retry policy, checkpoint placement, failure cards, and debug rewrite behavior.",
    },
  ];
}

function revisionWorkflowDiscoveryQuestions(
  input: InitialWorkflowDiscoveryInput,
  context: string,
  fileDescription: string,
  connectorPluginLabels: string[],
): DiscoveryQuestionDraft[] {
  return [
    {
      category: "scope",
      context,
      question: "What should change about this workflow's functional scope?",
      choices: [
        {
          id: "narrow-adjustment",
          label: "Narrow adjustment",
          description: "Keep the existing workflow shape and update one bounded behavior or success criterion.",
          recommended: true,
        },
        {
          id: "expanded-scope",
          label: "Expanded scope",
          description: "Add new cases, outputs, or branches while preserving the current approved behavior.",
        },
        {
          id: "replace-scope",
          label: "Replace scope",
          description: "Change the main purpose enough that graph structure, source, and review expectations may shift.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Changes the request, scope node, affected branches, and version review summary for the proposed revision.",
    },
    {
      category: "data_sources",
      context,
      question: "Should this revision change the workflow's data sources or connector grants?",
      choices: [
        {
          id: "same-sources",
          label: "Same sources",
          description: "Reuse the current base directory, metadata policy, connectors, and grants.",
          recommended: true,
        },
        {
          id: "more-files",
          label: "More project files",
          description: fileDescription,
        },
        {
          id: "more-connectors",
          label: "Connector/plugin change",
          description: connectorPluginLabels.length
            ? `Add or revise grants for capabilities such as ${connectorPluginLabels.slice(0, 4).join(", ")}.`
            : "Add or revise connector/plugin grants after review.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Changes data-source, connector-call, grant, and retention nodes before compiling the proposed version.",
    },
    {
      category: "model_role",
      context,
      question: "What should Ambient/Pi do differently when the workflow calls the LLM?",
      choices: [
        {
          id: "same-role",
          label: "Same role",
          description: "Keep the model's role stable and only adjust prompts, schemas, or thresholds.",
          recommended: true,
        },
        {
          id: "new-extraction",
          label: "New extraction/classification",
          description: "Have the model produce new structured fields, categories, or scoring decisions.",
        },
        {
          id: "new-control-flow",
          label: "New control flow",
          description: "Let the model select branches, escalation, or review decisions with explicit trace and approval nodes.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Changes model-call nodes, source-to-graph mappings, schemas, and retry expectations.",
    },
    {
      category: "side_effects",
      context,
      question: "Should the revision change side effects or approval gates?",
      choices: [
        {
          id: "read-only",
          label: "Keep read-only",
          description: "Keep the workflow inspection-only and generate reviewable outputs without external mutations.",
          recommended: true,
        },
        {
          id: "stage-only",
          label: "Stage changes",
          description: "Prepare file or connector mutations but require approval before applying them.",
        },
        {
          id: "approved-apply",
          label: "Apply after approval",
          description: "Allow an approved version to perform bounded mutations during real runs.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Changes mutation, review-gate, dry-run, and audit nodes in the proposed graph.",
    },
    {
      category: "error_handling",
      context,
      question: "How should the revised workflow handle failures or uncertain outputs?",
      choices: [
        {
          id: "pause-debug",
          label: "Pause and debug",
          description: "Stop on failure, preserve trace context, and offer Ambient debug rewrite.",
          recommended: true,
        },
        {
          id: "retry-safe",
          label: "Retry safe steps",
          description: "Retry idempotent steps when retained inputs or checkpoints make recovery safe.",
        },
        {
          id: "skip-retain",
          label: "Skip and retain",
          description: "Skip failed batch items while keeping audit evidence and retry context.",
        },
      ],
      allowFreeform: true,
      graphImpact: "Changes retry, checkpoint, failure-card, and debug-rewrite behavior for the proposed version.",
    },
  ];
}

export function workflowDiscoveryGraph(input: WorkflowDiscoveryGraphInput): Omit<WorkflowGraphSnapshot, "id" | "version"> {
  const scope = questionAnswerLabel(input.questions, "scope") ?? "Confirm scope and success criteria.";
  const dataSources = questionAnswerLabel(input.questions, "data_sources") ?? "Confirm data sources.";
  const modelRole = questionAnswerLabel(input.questions, "model_role") ?? "Confirm LLM role.";
  const sideEffects = questionAnswerLabel(input.questions, "side_effects") ?? "Confirm side effects.";
  const errorHandling = questionAnswerLabel(input.questions, "error_handling") ?? "Confirm error handling.";
  const answeredCount = input.questions.filter((question) => question.answer).length;
  const allAnswered = answeredCount === input.questions.length && input.questions.length > 0;
  const nextCategory = input.questions.find((question) => !question.answer)?.category;

  const nodes: WorkflowGraphNode[] = [
    {
      id: "request",
      type: "request",
      label: "Request",
      description: input.request,
      outputSummary: "Workflow design intent",
      runState: "completed",
      x: 0,
      y: 0,
    },
    {
      id: "scope",
      type: "deterministic_step",
      label: "Scope",
      description: scope,
      outputSummary: "Trigger, entities, success criteria",
      runState: runStateForCategory("scope", nextCategory, input.questions),
      x: 260,
      y: 0,
    },
    {
      id: "data-sources",
      type: "data_source",
      label: "Data sources",
      description: dataSources,
      retentionPolicy: "Metadata inspection allowed; content reads require grants.",
      runState: runStateForCategory("data_sources", nextCategory, input.questions),
      x: 520,
      y: -80,
    },
    {
      id: "llm-role",
      type: "model_call",
      label: "LLM role",
      description: modelRole,
      modelRole,
      retryPolicy: "Retry only with retained or reconstructable inputs.",
      runState: runStateForCategory("model_role", nextCategory, input.questions),
      x: 520,
      y: 100,
    },
    {
      id: "review",
      type: "review_gate",
      label: "Review gate",
      description: allAnswered ? "Ready to compile a reviewable workflow preview." : "Discovery must finish before compilation.",
      reviewPolicy: "Approve generated workflow before recurring or mutation-capable runs.",
      runState: allAnswered ? "completed" : "pending",
      x: 780,
      y: -90,
    },
    {
      id: "side-effects",
      type: "mutation",
      label: "Side effects",
      description: sideEffects,
      reviewPolicy: "Mutations require review policy alignment before execution.",
      runState: runStateForCategory("side_effects", nextCategory, input.questions),
      x: 780,
      y: 90,
    },
    {
      id: "error-handling",
      type: "error_handler",
      label: "Error handling",
      description: errorHandling,
      retryPolicy: errorHandling,
      runState: runStateForCategory("error_handling", nextCategory, input.questions),
      x: 1040,
      y: 90,
    },
    {
      id: "output",
      type: "output",
      label: "Workflow program",
      description: allAnswered ? "Compile manifest, source, graph, connector grants, and audit preview." : "Program output pending discovery answers.",
      inputSummary: "request, discovery answers, graph IR",
      runState: allAnswered ? "pending" : "skipped",
      x: 1300,
      y: 0,
    },
  ];
  const edges: WorkflowGraphEdge[] = [
    { id: "request-to-scope", source: "request", target: "scope", type: "control_flow", label: "discover" },
    { id: "scope-to-data", source: "scope", target: "data-sources", type: "data_flow", label: "inputs" },
    { id: "data-to-model", source: "data-sources", target: "llm-role", type: "data_flow", label: "context" },
    { id: "model-to-review", source: "llm-role", target: "review", type: "control_flow", label: "plan" },
    { id: "review-to-side-effects", source: "review", target: "side-effects", type: "control_flow", label: "policy" },
    { id: "side-effects-to-errors", source: "side-effects", target: "error-handling", type: "control_flow", label: "recovery" },
    { id: "errors-to-output", source: "error-handling", target: "output", type: "control_flow", label: "compile context" },
    { id: "review-to-output", source: "review", target: "output", type: "control_flow", label: "compile" },
  ];
  return {
    workflowThreadId: input.workflowThreadId,
    source: "discovery",
    nodes,
    edges,
    summary: allAnswered ? "Discovery complete; workflow is ready to compile." : `Discovery in progress (${answeredCount}/${input.questions.length}).`,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function workflowDiscoveryAnswerText(question: WorkflowDiscoveryQuestion): string {
  if (!question.answer) return "Unanswered";
  const selected = question.answer.choiceId ? question.choices.find((choice) => choice.id === question.answer?.choiceId) : undefined;
  const parts = [selected?.label, question.answer.freeform].filter((part): part is string => Boolean(part?.trim()));
  return parts.join(": ") || "Answered";
}

function questionAnswerLabel(questions: WorkflowDiscoveryQuestion[], category: WorkflowDiscoveryQuestionCategory): string | undefined {
  const question = [...questions].reverse().find((candidate) => candidate.category === category);
  return question?.answer ? workflowDiscoveryAnswerText(question) : undefined;
}

function runStateForCategory(
  category: WorkflowDiscoveryQuestionCategory,
  nextCategory: WorkflowDiscoveryQuestionCategory | undefined,
  questions: WorkflowDiscoveryQuestion[],
): WorkflowGraphNode["runState"] {
  const question = [...questions].reverse().find((candidate) => candidate.category === category);
  if (question?.answer) return "completed";
  if (nextCategory === category) return "active";
  return "pending";
}
