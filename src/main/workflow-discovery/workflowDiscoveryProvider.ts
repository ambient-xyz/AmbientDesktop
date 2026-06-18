import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { WorkflowDiscoveryCapabilityDescription, WorkflowDiscoveryCapabilitySearch, WorkflowDiscoveryChoice, WorkflowDiscoveryGraphPatch, WorkflowDiscoveryProviderKind, WorkflowDiscoveryQuestion, WorkflowDiscoveryQuestionCategory, WorkflowGraphSnapshot, WorkflowPromptCacheCheckpoint } from "../../shared/workflowTypes";
import { initialWorkflowDiscoveryQuestions, type WorkflowDiscoveryRevisionContext } from "../../shared/workflowDiscovery";
import { validateWorkflowDiscoveryGraphPatch } from "../../shared/workflowDiscoveryGraphPatch";
import { normalizeAmbientBaseUrl } from "../provider/providerStatus";
import {
  ambientRetryPolicyFromLegacyOptions,
  type AmbientRetryPolicy,
} from "../ambient/aggressiveRetries";
import {
  capabilitySearchAmbientCliCapabilityIds,
  capabilitySearchConnectorIds,
  capabilitySearchPluginToolNames,
} from "./workflowDiscoveryCapabilitySearch";
import type { WorkflowDiscoveryPolicyContext } from "./workflowDiscoveryPolicy";
import { workflowDiscoveryProviderPolicyPayload } from "./workflowDiscoveryPolicy";
import { callWorkflowPiText, type WorkflowPiProgress, type WorkflowPiTextCallInput } from "../workflow/workflowPiTransport";
import { workflowPromptParts, type WorkflowPromptParts } from "../workflow/workflowPromptCache";

export const REQUIRED_WORKFLOW_DISCOVERY_CATEGORIES: WorkflowDiscoveryQuestionCategory[] = [
  "scope",
  "data_sources",
  "model_role",
  "side_effects",
  "error_handling",
];

const ALLOWED_WORKFLOW_DISCOVERY_CATEGORIES: WorkflowDiscoveryQuestionCategory[] = [
  ...REQUIRED_WORKFLOW_DISCOVERY_CATEGORIES,
  "schedule",
  "review",
];

const DISCOVERY_BATCH_SIZE = 3;
const DEFAULT_AMBIENT_WORKFLOW_DISCOVERY_TIMEOUT_MS = 120_000;
const DEFAULT_AMBIENT_WORKFLOW_DISCOVERY_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_AMBIENT_WORKFLOW_DISCOVERY_EMPTY_RETRY_LIMIT = 1;

export interface WorkflowDiscoveryProviderInput {
  workflowThreadId: string;
  request: string;
  projectPath: string;
  policyContext: WorkflowDiscoveryPolicyContext;
  policyContextSummary: string;
  remainingCategories?: WorkflowDiscoveryQuestionCategory[];
  existingQuestions?: WorkflowDiscoveryQuestion[];
  currentGraph?: WorkflowGraphSnapshot;
  capabilitySearch?: WorkflowDiscoveryCapabilitySearch;
  capabilityDescriptions?: WorkflowDiscoveryCapabilityDescription[];
  revisionContext?: WorkflowDiscoveryRevisionContext;
}

export interface WorkflowDiscoveryQuestionDraft {
  category: WorkflowDiscoveryQuestionCategory;
  context: string;
  question: string;
  choices: WorkflowDiscoveryChoice[];
  allowFreeform: boolean;
  graphImpact?: string;
  blockedReasons?: string[];
}

export interface WorkflowDiscoveryProviderOutput {
  provider: WorkflowDiscoveryProviderKind;
  providerModel?: string;
  questions: WorkflowDiscoveryQuestionDraft[];
  graphSummary?: string;
  graphPatch?: WorkflowDiscoveryGraphPatch;
  blockedReasons?: string[];
  cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
  telemetry?: {
    responseCharCount?: number;
    durationMs?: number;
    transport?: "pi" | "direct" | "deterministic";
  };
}

export interface WorkflowDiscoveryProviderGenerateOptions {
  onProgress?: (progress: WorkflowPiProgress) => void;
}

export interface WorkflowDiscoveryProvider {
  readonly kind: WorkflowDiscoveryProviderKind;
  generate(input: WorkflowDiscoveryProviderInput, options?: WorkflowDiscoveryProviderGenerateOptions): Promise<WorkflowDiscoveryProviderOutput>;
}

interface AmbientChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    text?: string;
  }>;
}

export class DeterministicWorkflowDiscoveryProvider implements WorkflowDiscoveryProvider {
  readonly kind = "deterministic" as const;

  async generate(input: WorkflowDiscoveryProviderInput): Promise<WorkflowDiscoveryProviderOutput> {
    const remainingCategories = input.remainingCategories?.length ? new Set(input.remainingCategories) : undefined;
    const drafts = initialWorkflowDiscoveryQuestions({
      workflowThreadId: input.workflowThreadId,
      request: input.request,
      projectPath: input.projectPath,
      revisionContext: input.revisionContext,
      intelligence: {
        contextSummary: input.policyContextSummary,
        fileCandidates: input.policyContext.files.map((file) => file.path),
        connectorLabels: capabilityLabels(input, "connector"),
        pluginToolLabels: capabilityLabels(input, "plugin_tool"),
        ambientCliLabels: capabilityLabels(input, "ambient_cli"),
        policyNotes: input.policyContext.policyNotes,
      },
    })
      .filter((question) => !remainingCategories || remainingCategories.has(question.category))
      .slice(0, DISCOVERY_BATCH_SIZE)
      .map((question) => ({
        category: question.category,
        context: question.context,
        question: question.question,
        choices: question.choices,
        allowFreeform: question.allowFreeform,
        graphImpact: question.graphImpact,
      }));

    return {
      provider: this.kind,
      questions: drafts,
      cacheCheckpoint: buildAmbientWorkflowDiscoveryPromptParts(input).cacheCheckpoint,
      telemetry: { transport: "deterministic" },
    };
  }
}

export class AmbientWorkflowDiscoveryProvider implements WorkflowDiscoveryProvider {
  readonly kind = "ambient" as const;

  constructor(
    private readonly input: {
      apiKey?: string;
      baseUrl?: string;
      model: string;
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
      idleTimeoutMs?: number;
      retryPolicy?: AmbientRetryPolicy;
      waitForRetry?: WorkflowPiTextCallInput["waitForRetry"];
      textCall?: typeof callWorkflowPiText;
    },
  ) {}

  async generate(input: WorkflowDiscoveryProviderInput, options: WorkflowDiscoveryProviderGenerateOptions = {}): Promise<WorkflowDiscoveryProviderOutput> {
    const apiKey = (this.input.apiKey ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const model = normalizeAmbientModelId(this.input.model);
    const promptParts = buildAmbientWorkflowDiscoveryPromptParts(input);
    const timeoutMs = Math.max(1, Math.floor(this.input.timeoutMs ?? DEFAULT_AMBIENT_WORKFLOW_DISCOVERY_TIMEOUT_MS));
    const idleTimeoutMs = Math.max(1, Math.floor(this.input.idleTimeoutMs ?? DEFAULT_AMBIENT_WORKFLOW_DISCOVERY_IDLE_TIMEOUT_MS));
    const startedAt = Date.now();
    if (!this.input.fetchImpl) {
      const { content, rawOutput } = await this.callPiDiscoveryJson({
        apiKey,
        model,
        prompt: promptParts.prompt,
        workflowThreadId: input.workflowThreadId,
        timeoutMs,
        idleTimeoutMs,
        startedAt,
        onProgress: options.onProgress,
      });
      return normalizeWorkflowDiscoveryProviderOutput(rawOutput, {
        provider: this.kind,
        providerModel: model,
        policyContextSummary: input.policyContextSummary,
        remainingCategories: input.remainingCategories,
        currentGraph: input.currentGraph,
        allowedConnectorIds: input.policyContext.connectors.map((connector) => connector.connectorId),
        allowExternalModelProviderQuestion: workflowDiscoveryAllowsExternalModelProviderQuestion(input.request),
        cacheCheckpoint: promptParts.cacheCheckpoint,
        telemetry: { responseCharCount: content.length, durationMs: Date.now() - startedAt, transport: "pi" },
      });
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);
    let response: Response;
    try {
      response = await (this.input.fetchImpl ?? fetch)(`${normalizeAmbientBaseUrl(this.input.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: abortController.signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You design policy-bounded workflow discovery questions for Ambient Desktop. Return only valid JSON. Never ask tools, read file contents, execute plugins, inspect connector content, or propose mutations during discovery.",
            },
            { role: "user", content: promptParts.prompt },
          ],
          temperature: 0.2,
          max_tokens: 4_000,
          reasoning: { effort: "none", enabled: false, exclude: true },
          enable_thinking: false,
          stream: false,
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Ambient workflow discovery timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").trim();
      throw new Error(
        detail ? `Ambient workflow discovery failed (${response.status}): ${detail.slice(0, 240)}` : `Ambient workflow discovery failed (${response.status}).`,
      );
    }
    const payload = (await response.json()) as AmbientChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? "";
    options.onProgress?.({ outputChars: content.length, thinkingChars: 0, elapsedMs: Date.now() - startedAt, stage: "completed" });
    const rawOutput = parseWorkflowDiscoveryProviderJson(content);
    return normalizeWorkflowDiscoveryProviderOutput(rawOutput, {
      provider: this.kind,
      providerModel: model,
      policyContextSummary: input.policyContextSummary,
      remainingCategories: input.remainingCategories,
      currentGraph: input.currentGraph,
      allowedConnectorIds: input.policyContext.connectors.map((connector) => connector.connectorId),
      allowExternalModelProviderQuestion: workflowDiscoveryAllowsExternalModelProviderQuestion(input.request),
      cacheCheckpoint: promptParts.cacheCheckpoint,
      telemetry: { responseCharCount: content.length, durationMs: Date.now() - startedAt, transport: "direct" },
    });
  }

  private async callPiDiscoveryJson(input: {
    apiKey: string;
    model: string;
    prompt: string;
    workflowThreadId: string;
    timeoutMs: number;
    idleTimeoutMs: number;
    startedAt: number;
    onProgress?: WorkflowDiscoveryProviderGenerateOptions["onProgress"];
  }): Promise<{ content: string; rawOutput: unknown }> {
    const textCall = this.input.textCall ?? callWorkflowPiText;
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= DEFAULT_AMBIENT_WORKFLOW_DISCOVERY_EMPTY_RETRY_LIMIT; attempt += 1) {
      if (attempt > 0) {
        input.onProgress?.({
          outputChars: 0,
          thinkingChars: 0,
          elapsedMs: Date.now() - input.startedAt,
          stage: "retrying",
        });
      }
      const prompt = attempt > 0 ? workflowDiscoveryRetryPrompt(input.prompt, lastError) : input.prompt;
      const content = await textCall({
        apiKey: input.apiKey,
        baseUrl: this.input.baseUrl,
        model: input.model,
        systemPrompt:
          "You design policy-bounded workflow discovery questions for Ambient Desktop. Return only valid JSON. Never ask tools, read file contents, execute plugins, inspect connector content, or propose mutations during discovery.",
        prompt,
        sessionId: input.workflowThreadId,
        temperature: 0.2,
        maxTokens: 4_000,
        reasoning: false,
        idleTimeoutMs: input.idleTimeoutMs,
        absoluteTimeoutMs: input.timeoutMs,
        timeoutMs: input.timeoutMs,
        retryPolicy: this.input.retryPolicy ?? ambientRetryPolicyFromLegacyOptions(),
        waitForRetry: this.input.waitForRetry,
        onProgress: input.onProgress,
      });
      if (!content.trim()) {
        lastError = new Error("Ambient workflow discovery returned an empty response.");
        continue;
      }
      try {
        return { content, rawOutput: parseWorkflowDiscoveryProviderJson(content) };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError ?? new Error("Ambient workflow discovery returned an empty response after retry.");
  }
}

function workflowDiscoveryRetryPrompt(basePrompt: string, error: Error | undefined): string {
  return [
    basePrompt,
    "",
    "Retry instruction:",
    "The previous discovery response failed validation and was not used.",
    `Validation error: ${error?.message ?? "empty response"}`,
    "Return exactly one complete JSON object matching the requested schema.",
    "Use compact JSON if needed. Do not include markdown fences, commentary, trailing commas, comments, or unterminated strings.",
    "Do not omit required arrays or question choice fields.",
  ].join("\n");
}

export function buildAmbientWorkflowDiscoveryPrompt(input: WorkflowDiscoveryProviderInput): string {
  return buildAmbientWorkflowDiscoveryPromptParts(input).prompt;
}

export function buildAmbientWorkflowDiscoveryPromptParts(input: WorkflowDiscoveryProviderInput): WorkflowPromptParts {
  const remainingCategories = input.remainingCategories?.length ? input.remainingCategories : REQUIRED_WORKFLOW_DISCOVERY_CATEGORIES;
  const safePolicyPayload = workflowDiscoveryProviderPolicyPromptPayload(input);
  const existingQuestions = (input.existingQuestions ?? []).map((question) => ({
    id: question.id,
    category: question.category,
    question: question.question,
    answer: question.answer
      ? {
          selectedChoice: question.answer.choiceId ? question.choices.find((choice) => choice.id === question.answer?.choiceId) : undefined,
          freeform: question.answer.freeform,
        }
      : undefined,
  }));
  const graphContext = input.currentGraph
    ? {
        summary: input.currentGraph.summary,
        nodes: input.currentGraph.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          label: node.label,
          description: node.description,
        })),
        edges: input.currentGraph.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          label: edge.label,
        })),
      }
    : undefined;

  const stablePrefix = [
    "Generate the next workflow discovery question batch.",
    input.revisionContext ? "This is Revision Discovery for an existing workflow version. Ask about what changes from the current approved behavior, not how to create the workflow from scratch." : "",
    "",
    "Hard policy boundaries:",
    "- Use only the provided request, safe base-directory metadata, policy-approved content excerpts, approved external context evidence, request-specific capability search results, previous answers, and graph summary.",
    "- Do not infer from hidden file contents. Safe filenames and sizes are available; content excerpts appear only when Full Access or a matching grant allowed them.",
    "- Do not inspect connector content, execute plugin tools, run shell commands, browse, or propose mutations during discovery. Use contextEvidence only when the policy payload includes it.",
    "- Treat blockedAccessSummary as policy facts. When missing context would require a content read or account data read, ask a grant-oriented question and include blockedReasons.",
    "- Capability search results and capability descriptions are safe metadata only, not permission to use a capability. Do not mention connectors/plugins/Ambient CLI commands that are absent from capabilitySearch.results.",
    "- Use capabilityDescriptions for exact permission policy, mutation class, input/output shape, availability, account, and warning details. If a capability is described as blocked or not runnable, ask how to repair or replace it instead of planning to use it.",
    "- Built-in local directory rule: when the request explicitly names local_directory_list or asks for metadata-only local Downloads/Desktop/Documents inventory, do not say local_directory_list is unavailable and do not substitute workspace.inventory. Treat local_directory_list as the built-in workflow tool for bounded local-directory metadata; ask only about grant scope, bounds, skipped metadata, and output policy.",
    "- For data-source questions, prefer matching workflow-safe plugin/tool/Ambient CLI results before browser fallbacks. If a matching result is blocked or not workflow-safe, ask whether to enable/trust/install/repair it instead of pretending it does not exist.",
    "- Ambient Desktop already provides the selected LLM to compiled workflows through model.call / ambient.responses. For model_role questions, ask what the selected Ambient Desktop model should do, what schema it should return, or what confidence/review policy it should follow.",
    "- Do not ask whether to use a generic cloud LLM, GPT-4, Claude, local LLM, Ollama, inference server, API key grant, or extra model provider unless the user's request explicitly asks to choose or configure an external model provider.",
    "",
    "Question rules:",
    "- Return one to three questions.",
    "- Use only the categories listed in the mutable suffix.",
    "- Prefer planner-style multiple choice: two to four complete choices, one recommended choice, and allowFreeform true.",
    "- Include full upfront context for why the question matters.",
    "- Include graphImpact explaining how the answer changes the workflow diagram.",
    "",
    "Graph patch rules:",
    "- graphPatch is optional, but prefer returning one when the workflow picture should change.",
    "- Patch only the explanatory workflow graph; do not generate source code.",
    "- Use stable ids with letters, numbers, hyphens, or underscores.",
    "- Use only known node types: request, data_source, deterministic_step, agent_exploration, model_call, connector_call, review_gate, mutation, output, error_handler.",
    "- Use only known edge types: data_flow, control_flow, condition, retry, resume.",
    "- Edges must point to existing nodes from graphContext or nodes in graphPatch.upsertNodes.",
    "- Connector-call nodes may reference only connector ids shown in the stable workflow-design input.",
    "- Do not imply file-content access beyond policy-approved excerpts, connector content access, plugin execution, or mutations unless the question asks for a grant/review decision.",
    "",
    "Return JSON only with this shape:",
    JSON.stringify(
      {
        graphSummary: "optional concise updated workflow understanding",
        graphPatch: {
          summary: "optional updated graph summary",
          upsertNodes: [
            {
              id: "stable-node-id",
              type: "deterministic_step",
              label: "Short node label",
              description: "What this node means in the proposed workflow plan",
            },
          ],
          upsertEdges: [{ id: "stable-edge-id", source: "request", target: "stable-node-id", type: "control_flow", label: "optional edge label" }],
          removeNodeIds: [],
          removeEdgeIds: [],
          blockedReasons: ["optional graph constraints or missing grants"],
        },
        blockedReasons: ["optional policy or grant constraints"],
        questions: [
          {
            category: "scope",
            context: "why this question is being asked, grounded only in provided metadata",
            question: "the user-facing discovery question",
            choices: [
              { id: "short-id", label: "Choice label", description: "Complete tradeoff-oriented description.", recommended: true },
              { id: "short-id-2", label: "Other label", description: "Complete tradeoff-oriented description." },
            ],
            allowFreeform: true,
            graphImpact: "how the graph should update when answered",
            blockedReasons: ["optional per-question policy constraints"],
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Stable workflow-design input:",
    JSON.stringify(
      {
        workflowThreadId: input.workflowThreadId,
        request: input.request,
        projectPath: input.projectPath,
        revisionContext: input.revisionContext,
        policyContextSummary: input.policyContextSummary,
        policyContext: safePolicyPayload,
        capabilitySearch: input.capabilitySearch,
        capabilityDescriptions: input.capabilityDescriptions,
      },
      null,
      2,
    ),
  ]
    .filter((line) => line !== "")
    .join("\n");

  const mutableSuffix = [
    "Mutable discovery-card input:",
    JSON.stringify(
      {
        remainingCategories,
        existingQuestions,
        graphContext,
      },
      null,
      2,
    ),
  ].join("\n");

  return workflowPromptParts({
    stage: input.revisionContext ? "revision_discovery" : "discovery",
    workflowThreadId: input.workflowThreadId,
    stablePrefix,
    mutableSuffix,
    boundaryLabel: "Workflow discovery cache checkpoint",
  });
}

function workflowDiscoveryProviderPolicyPromptPayload(input: WorkflowDiscoveryProviderInput): ReturnType<typeof workflowDiscoveryProviderPolicyPayload> {
  const payload = workflowDiscoveryProviderPolicyPayload(input.policyContext);
  if (!input.capabilitySearch) return payload;
  const connectorIds = capabilitySearchConnectorIds(input.capabilitySearch) ?? new Set<string>();
  const pluginToolNames = capabilitySearchPluginToolNames(input.capabilitySearch) ?? new Set<string>();
  const ambientCliCapabilityIds = capabilitySearchAmbientCliCapabilityIds(input.capabilitySearch) ?? new Set<string>();
  return {
    ...payload,
    connectors: payload.connectors.filter((connector) => connectorIds.has(connector.connectorId)),
    pluginTools: payload.pluginTools.filter((tool) => pluginToolNames.has(tool.toolName)),
    ambientCliCapabilities: payload.ambientCliCapabilities.filter((capability) => ambientCliCapabilityIds.has(capability.capabilityId)),
  };
}

function capabilityLabels(input: WorkflowDiscoveryProviderInput, kind: "connector" | "plugin_tool" | "ambient_cli"): string[] {
  if (input.capabilitySearch) {
    const labels = input.capabilitySearch.results
      .filter((result) => result.kind === kind)
      .map((result) => result.label);
    if (labels.length) return labels;
  }
  if (kind === "connector") return input.policyContext.connectors.map((connector) => connector.label);
  if (kind === "plugin_tool") return input.policyContext.pluginTools.map((tool) => tool.label);
  return input.policyContext.ambientCliCapabilities.map((capability) => `${capability.packageName}:${capability.command}`);
}

export function parseWorkflowDiscoveryProviderJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Ambient workflow discovery returned an empty response.");
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    throw new Error("Ambient workflow discovery did not return valid JSON.");
  }
}

export function normalizeWorkflowDiscoveryProviderOutput(
  raw: unknown,
  input: {
    provider: WorkflowDiscoveryProviderKind;
    providerModel?: string;
    policyContextSummary: string;
    remainingCategories?: WorkflowDiscoveryQuestionCategory[];
    currentGraph?: WorkflowGraphSnapshot;
    allowedConnectorIds?: string[];
    allowExternalModelProviderQuestion?: boolean;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    telemetry?: WorkflowDiscoveryProviderOutput["telemetry"];
  },
): WorkflowDiscoveryProviderOutput {
  const object = requireRecord(raw, "Workflow discovery response");
  const rawQuestions = Array.isArray(object.questions) ? object.questions : undefined;
  if (!rawQuestions) throw new Error("Workflow discovery response requires a questions array.");
  if (rawQuestions.length < 1 || rawQuestions.length > DISCOVERY_BATCH_SIZE) {
    throw new Error(`Workflow discovery response must include one to ${DISCOVERY_BATCH_SIZE} questions.`);
  }
  const remainingCategories = input.remainingCategories?.length ? new Set(input.remainingCategories) : undefined;
  const questions = rawQuestions.map((question, index) =>
    normalizeQuestionDraft(question, {
      index,
      policyContextSummary: input.policyContextSummary,
      remainingCategories,
      allowExternalModelProviderQuestion: input.allowExternalModelProviderQuestion === true,
    }),
  );
  const patchResult = validateWorkflowDiscoveryGraphPatch(object.graphPatch, {
    currentGraph: input.currentGraph,
    allowedConnectorIds: input.allowedConnectorIds,
  });
  return {
    provider: input.provider,
    providerModel: input.providerModel,
    graphSummary: optionalString(object.graphSummary),
    graphPatch: patchResult.graphPatch,
    blockedReasons: mergeBlockedReasons(normalizeStringArray(object.blockedReasons), patchResult.blockedReasons, patchResult.graphPatch?.blockedReasons),
    cacheCheckpoint: input.cacheCheckpoint,
    telemetry: input.telemetry,
    questions,
  };
}

function normalizeQuestionDraft(
  raw: unknown,
  input: {
    index: number;
    policyContextSummary: string;
    remainingCategories?: Set<WorkflowDiscoveryQuestionCategory>;
    allowExternalModelProviderQuestion: boolean;
  },
): WorkflowDiscoveryQuestionDraft {
  const object = requireRecord(raw, `Workflow discovery question ${input.index + 1}`);
  const category = normalizeCategory(object.category);
  if (input.remainingCategories && !input.remainingCategories.has(category)) {
    throw new Error(`Workflow discovery question used out-of-scope category: ${category}`);
  }
  const question = requiredString(object.question, `question ${input.index + 1}`);
  const context = optionalString(object.context) || input.policyContextSummary;
  const choices = normalizeChoices(object.choices, input.index);
  if (category === "model_role" && !input.allowExternalModelProviderQuestion && isExternalModelProviderQuestion(question, choices, context)) {
    return defaultAmbientModelRoleQuestion({ context });
  }
  return {
    category,
    context,
    question,
    choices,
    allowFreeform: typeof object.allowFreeform === "boolean" ? object.allowFreeform : true,
    graphImpact: optionalString(object.graphImpact),
    blockedReasons: normalizeStringArray(object.blockedReasons),
  };
}

function workflowDiscoveryAllowsExternalModelProviderQuestion(request: string): boolean {
  return /\b(?:choose|select|configure|use|switch|compare)\b[^.\n]{0,120}\b(?:model provider|llm provider|cloud llm|local llm|ollama|openai|gpt-?4|gpt-?5|claude|gemini|api key)\b/i.test(
    request,
  );
}

function isExternalModelProviderQuestion(question: string, choices: WorkflowDiscoveryChoice[], context: string): boolean {
  const text = [question, context, ...choices.flatMap((choice) => [choice.label, choice.description])].join("\n");
  return /\b(?:cloud llm|local llm|gpt-?4|gpt-?5|claude|gemini|ollama|inference server|model provider|api key grant|api key|additional connector or api)\b/i.test(
    text,
  );
}

function defaultAmbientModelRoleQuestion(input: { context: string }): WorkflowDiscoveryQuestionDraft {
  return {
    category: "model_role",
    context: [
      input.context,
      "Ambient Desktop will use its selected model through model.call / ambient.responses; no separate cloud LLM, local LLM, or API-key grant is needed unless explicitly requested.",
    ]
      .filter(Boolean)
      .join("\n"),
    question: "What should the selected Ambient Desktop model do inside this workflow?",
    choices: [
      {
        id: "extract-classify",
        label: "Extract/classify",
        description: "Convert the gathered inputs into typed categories, fields, or labels using a structured model.call output.",
        recommended: true,
      },
      {
        id: "summarize",
        label: "Summarize",
        description: "Synthesize the gathered evidence into a concise report while deterministic workflow code handles control flow.",
      },
      {
        id: "rank-review",
        label: "Rank/review",
        description: "Score or rank candidates and pause for review when confidence is low or evidence is incomplete.",
      },
    ],
    allowFreeform: true,
    graphImpact: "Clarifies the model.call node role, output schema, confidence policy, and review thresholds while using Ambient Desktop's selected LLM.",
  };
}

function normalizeChoices(raw: unknown, questionIndex: number): WorkflowDiscoveryChoice[] {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error(`Workflow discovery question ${questionIndex + 1} requires at least two choices.`);
  }
  const seenIds = new Set<string>();
  const choices = raw.slice(0, 4).map((choice, index) => {
    const object = requireRecord(choice, `choice ${index + 1}`);
    const label = requiredString(object.label, `choice ${index + 1} label`);
    const id = uniqueChoiceId(slugify(optionalString(object.id) || label || `choice-${index + 1}`), seenIds);
    return {
      id,
      label,
      description: optionalString(object.description) || label,
      recommended: object.recommended === true,
    };
  });
  if (!choices.some((choice) => choice.recommended)) choices[0] = { ...choices[0], recommended: true };
  return choices;
}

function normalizeCategory(raw: unknown): WorkflowDiscoveryQuestionCategory {
  const category = requiredString(raw, "category") as WorkflowDiscoveryQuestionCategory;
  if (!ALLOWED_WORKFLOW_DISCOVERY_CATEGORIES.includes(category)) {
    throw new Error(`Unsupported workflow discovery category: ${category}`);
  }
  return category;
}

function requireRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label} must be an object.`);
  return raw as Record<string, unknown>;
}

function requiredString(raw: unknown, label: string): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) throw new Error(`Workflow discovery response requires ${label}.`);
  return value;
}

function optionalString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function normalizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return values.length ? values : undefined;
}

function mergeBlockedReasons(...groups: Array<string[] | undefined>): string[] | undefined {
  const reasons = [...new Set(groups.flatMap((group) => group ?? []).map((reason) => reason.trim()).filter(Boolean))];
  return reasons.length ? reasons : undefined;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "choice";
}

function uniqueChoiceId(baseId: string, seenIds: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (seenIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  seenIds.add(id);
  return id;
}
