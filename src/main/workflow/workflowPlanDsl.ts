import { z } from "zod";
import type { WorkflowProgramIR, WorkflowProgramNode, WorkflowProgramReviewChoice, WorkflowProgramValue } from "../../shared/workflowProgramIr";
import type { WorkflowProgramDiagnostic } from "../workflow-program/workflowProgramCapabilityResolver";

export type WorkflowPlanDslStageKind =
  | "model_interaction"
  | "browser_fixed_sources"
  | "current_web_research"
  | "gmail_readonly_categorization"
  | "gmail_metadata_review"
  | "local_file_classification"
  | "visual_batch_classification"
  | "metadata_first_review"
  | "staged_document_export"
  | "unsupported";

export interface WorkflowPlanDslQuestion {
  id: string;
  prompt: string;
  choices?: WorkflowProgramReviewChoice[];
  allowFreeform?: boolean;
}

export interface WorkflowPlanDslStage {
  id: string;
  kind: WorkflowPlanDslStageKind;
  title?: string;
  intent: string;
  inputs?: Record<string, unknown>;
  evidenceNeeded?: string[];
  transformations?: string[];
  outputContract?: WorkflowPlanDslOutputContract;
}

export interface WorkflowPlanDslOutputContract {
  format?: "text" | "html" | "markdown" | "file";
  fields?: string[];
  artifactPath?: string;
}

export interface WorkflowPlanDsl {
  version: 1;
  title: string;
  goal: string;
  summary?: string;
  stages: WorkflowPlanDslStage[];
  evidenceNeeded?: string[];
  transformations?: string[];
  questions?: WorkflowPlanDslQuestion[];
  budgetPolicy?: {
    maxToolCalls?: number;
    maxModelCalls?: number;
    maxConnectorCalls?: number;
    maxRunMs?: number;
    maxItems?: number;
  };
  riskPolicy?: {
    mutation?: "read_only" | "stage_writes" | "unsupported";
    requiresApproval?: boolean;
  };
  outputContract?: WorkflowPlanDslOutputContract;
  unsupportedReason?: string;
}

export type WorkflowPlanDslParseResult =
  | { success: true; plan: WorkflowPlanDsl; diagnostics: WorkflowProgramDiagnostic[] }
  | { success: false; diagnostics: WorkflowProgramDiagnostic[] };

export type WorkflowPlanDslLoweringResult =
  | { success: true; program: WorkflowProgramIR; diagnostics: WorkflowProgramDiagnostic[]; selectedKernel: WorkflowPlanDslStageKind }
  | { success: false; diagnostics: WorkflowProgramDiagnostic[] };

const nodeIdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const choiceSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(240),
  description: z.string().max(1000).optional(),
});
const outputContractSchema = z.object({
  format: z.preprocess(normalizeOutputFormatInput, z.enum(["text", "html", "markdown", "file"])).optional(),
  fields: z.array(z.string().min(1).max(80)).max(20).optional(),
  artifactPath: z.string().min(1).max(500).optional(),
});
const mutationPolicySchema = z.preprocess(normalizeMutationPolicyInput, z.enum(["read_only", "stage_writes", "unsupported"]));
const questionSchema = z.object({
  id: nodeIdSchema,
  prompt: z.string().min(1).max(2000),
  choices: z.array(choiceSchema).min(1).max(12).optional(),
  allowFreeform: z.boolean().optional(),
});
const stageSchema = z.object({
  id: nodeIdSchema,
  kind: z.preprocess(
    normalizeStageKindInput,
    z.enum([
      "model_interaction",
      "browser_fixed_sources",
      "current_web_research",
      "gmail_readonly_categorization",
      "gmail_metadata_review",
      "local_file_classification",
      "visual_batch_classification",
      "metadata_first_review",
      "staged_document_export",
      "unsupported",
    ]),
  ),
  title: z.string().min(1).max(240).optional(),
  intent: z.string().min(1).max(3000),
  inputs: z.record(z.string(), z.unknown()).optional(),
  evidenceNeeded: z.array(z.string().min(1).max(1000)).max(30).optional(),
  transformations: z.array(z.string().min(1).max(1000)).max(30).optional(),
  outputContract: outputContractSchema.optional(),
});
const planDslSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(240),
  goal: z.string().min(1).max(4000),
  summary: z.string().max(4000).optional(),
  stages: z.array(stageSchema).min(1).max(20),
  evidenceNeeded: z.array(z.string().min(1).max(1000)).max(50).optional(),
  transformations: z.array(z.string().min(1).max(1000)).max(50).optional(),
  questions: z.array(questionSchema).max(12).optional(),
  budgetPolicy: z
    .object({
      maxToolCalls: z.number().int().nonnegative().max(1000).optional(),
      maxModelCalls: z.number().int().positive().max(1000).optional(),
      maxConnectorCalls: z.number().int().nonnegative().max(1000).optional(),
      maxRunMs: z.number().int().positive().max(24 * 60 * 60 * 1000).optional(),
      maxItems: z.number().int().positive().max(10000).optional(),
    })
    .optional(),
  riskPolicy: z
    .object({
      mutation: mutationPolicySchema.optional(),
      requiresApproval: z.boolean().optional(),
    })
    .optional(),
  outputContract: outputContractSchema.optional(),
  unsupportedReason: z.string().max(2000).optional(),
});

const WORKFLOW_PLAN_DSL_WRAPPER_KEYS = ["planDsl", "planDSL", "workflowPlanDsl", "workflowPlanDSL", "workflowPlan", "plan", "workflow", "result", "data"];
const RAW_IR_FORBIDDEN_KEYS = new Set(["fromNode", "fromHandle", "nodes", "edges", "dependsOn", "connectorId", "tool"]);
const RAW_IR_NODE_KINDS = new Set([
  "tool.call",
  "tool.paginate",
  "model.call",
  "browser.intervention",
  "connector.call",
  "connector.paginate",
  "connector.map",
  "collection.map",
  "collection.filter",
  "collection.dedupe",
  "collection.chunk",
  "document.render",
  "checkpoint.write",
  "mutation.stage",
  "review.input",
  "approval.required",
  "branch.if",
  "loop.map",
  "model.map",
  "model.reduce",
  "transform.template",
  "error.handle",
  "output.final",
]);

export function parseWorkflowPlanDsl(raw: unknown): WorkflowPlanDslParseResult {
  const normalized = normalizeWorkflowPlanDslInput(raw);
  const parsed = planDslSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      success: false,
      diagnostics: parsed.error.issues.map((issue) =>
        errorDiagnostic("plan_dsl.schema_invalid", `${issue.message} at /${issue.path.join("/")}`, `/${issue.path.join("/")}`),
      ),
    };
  }
  const plan = normalizeWorkflowPlanDsl(parsed.data as WorkflowPlanDsl);
  const diagnostics = validateWorkflowPlanDslNoRawIr(plan);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return { success: false, diagnostics };
  return { success: true, plan, diagnostics };
}

export function lowerWorkflowPlanDslToProgramIr(input: { plan: WorkflowPlanDsl; userRequest?: string }): WorkflowPlanDslLoweringResult {
  const stage = selectWorkflowPlanDslKernelStage(input.plan);
  if (!stage) {
    return {
      success: false,
      diagnostics: [
        errorDiagnostic(
          "plan_dsl.unsupported_kernel",
          "Workflow Plan DSL did not include a supported kernel stage. Supported kernels include model_interaction, browser_fixed_sources, current_web_research, Gmail categorization, local file classification, visual batch classification, and metadata-first review.",
          "/stages",
        ),
      ],
    };
  }
  if (stage.kind === "unsupported") {
    return {
      success: false,
      diagnostics: [errorDiagnostic("plan_dsl.unsupported_workflow", input.plan.unsupportedReason || stage.intent, `/stages/${input.plan.stages.indexOf(stage)}`)],
    };
  }
  if (stage.kind === "model_interaction") return lowerModelInteractionPlan(input.plan, stage);
  if (stage.kind === "browser_fixed_sources") return lowerBrowserFixedSourcesPlan(input.plan, stage);
  if (stage.kind === "current_web_research") return lowerCurrentWebResearchPlan(input.plan, stage, input.userRequest);
  if (stage.kind === "gmail_readonly_categorization") return lowerGmailReadonlyCategorizationPlan(input.plan, stage, input.userRequest);
  if (stage.kind === "gmail_metadata_review") return lowerGmailMetadataReviewPlan(input.plan, stage, input.userRequest);
  if (stage.kind === "visual_batch_classification") return lowerVisualBatchClassificationPlan(input.plan, stage, input.userRequest);
  if (stage.kind === "metadata_first_review" && inferGmailCategorizationTarget(input.plan, stage, input.userRequest, { defaultMaxItems: 1000, maxItemsLimit: 1000 })) {
    return lowerGmailMetadataReviewPlan(input.plan, stage, input.userRequest);
  }
  if (stage.kind === "local_file_classification" || stage.kind === "metadata_first_review") return lowerLocalFileClassificationPlan(input.plan, stage, input.userRequest);
  return {
    success: false,
    diagnostics: [
      errorDiagnostic(
        "plan_dsl.kernel_not_implemented",
        `Workflow Plan DSL kernel ${stage.kind} is valid but not implemented in this compiler slice.`,
        `/stages/${input.plan.stages.indexOf(stage)}/kind`,
      ),
    ],
  };
}

export function workflowPlanDslPromptSchemaExample(): WorkflowPlanDsl {
  return {
    version: 1,
    title: "Short workflow title",
    goal: "User-facing goal.",
    summary: "High-level plan only. Do not include WorkflowProgramIR nodes, edges, paths, tools, or fromNode/fromHandle references.",
    stages: [
      {
        id: "collect-evidence",
        kind: "browser_fixed_sources",
        intent: "Read the exact user-provided URLs and retain compact source evidence.",
        inputs: { urls: ["https://example.com"], maxSources: 2 },
      },
      {
        id: "synthesize",
        kind: "model_interaction",
        intent: "Ask one user preference question and synthesize the final output.",
      },
    ],
    questions: [{ id: "tone", prompt: "Choose the report tone.", choices: [{ id: "concise", label: "Concise" }], allowFreeform: true }],
    budgetPolicy: { maxToolCalls: 2, maxModelCalls: 1, maxRunMs: 300000, maxItems: 6 },
    riskPolicy: { mutation: "read_only" },
    outputContract: { format: "html", fields: ["html", "summary"] },
  };
}

function normalizeWorkflowPlanDslInput(raw: unknown): unknown {
  const unwrapped = unwrapWorkflowPlanDslCandidate(raw);
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) return unwrapped;
  const record = unwrapped as Record<string, unknown>;
  const title = stringField(record, "title") ?? stringField(record, "name") ?? stringField(record, "goal") ?? "Workflow plan";
  const goal = stringField(record, "goal") ?? stringField(record, "objective") ?? stringField(record, "summary") ?? title;
  const stages = Array.isArray(record.stages) ? record.stages : Array.isArray(record.steps) ? record.steps : record.stages;
  return {
    ...record,
    version: record.version ?? 1,
    title,
    goal,
    stages,
  };
}

function unwrapWorkflowPlanDslCandidate(raw: unknown, depth = 0): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || depth > 4) return raw;
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.stages)) return raw;
  for (const key of WORKFLOW_PLAN_DSL_WRAPPER_KEYS) {
    const candidate = record[key];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const unwrapped = unwrapWorkflowPlanDslCandidate(candidate, depth + 1);
    if (unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped) && Array.isArray((unwrapped as { stages?: unknown }).stages)) return unwrapped;
  }
  return raw;
}

function normalizeWorkflowPlanDsl(plan: WorkflowPlanDsl): WorkflowPlanDsl {
  return {
    ...plan,
    stages: plan.stages.map(normalizeWorkflowPlanDslStage),
    summary: plan.summary ?? plan.goal,
    evidenceNeeded: plan.evidenceNeeded ?? [],
    transformations: plan.transformations ?? [],
    questions: plan.questions ?? [],
    riskPolicy: { mutation: "read_only", ...(plan.riskPolicy ?? {}) },
    outputContract: plan.outputContract ?? { format: "text", fields: ["summary"] },
  };
}

function normalizeWorkflowPlanDslStage(stage: WorkflowPlanDslStage): WorkflowPlanDslStage {
  if (stage.kind !== "gmail_readonly_categorization" && stage.kind !== "gmail_metadata_review") return stage;
  const inputs = stage.inputs ? { ...stage.inputs } : {};
  const connector = stringInputAny(inputs, ["connectorId", "connector"]);
  if (connector && /^(?:google\.)?gmail$/i.test(connector.trim())) {
    delete inputs.connectorId;
    delete inputs.connector;
  }
  return { ...stage, inputs };
}

function normalizeMutationPolicyInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["read_only", "readonly", "no_writes", "no_write", "none"].includes(normalized)) return "read_only";
  if (
    [
      "stage_write",
      "stage_writes",
      "staged_write",
      "staged_writes",
      "staged_file_write",
      "staged_file_writes",
      "staged_local_file_write",
      "staged_local_file_writes",
      "staged_until_approved",
      "stage_until_approved",
      "write_requires_approval",
      "writes_require_approval",
      "approval_required",
    ].includes(normalized)
  ) {
    return "stage_writes";
  }
  if ((normalized.includes("stage") || normalized.includes("staged") || normalized.includes("approval") || normalized.includes("approve")) && !normalized.includes("read_only")) {
    return "stage_writes";
  }
  if (["unsupported", "blocked", "not_supported"].includes(normalized)) return "unsupported";
  return value;
}

function normalizeOutputFormatInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["text", "plain", "plain_text", "plaintext"].includes(normalized)) return "text";
  if (normalized === "html" || normalized.includes("html")) return "html";
  if (normalized === "md" || normalized.includes("markdown")) return "markdown";
  if (["document", "artifact", "local_file", "file_write"].includes(normalized) || normalized.endsWith("_file") || normalized.includes("file")) return "file";
  if (
    ["json", "structured", "structured_output", "report", "summary", "analysis", "table", "categorization", "classification"].includes(normalized) ||
    normalized.endsWith("_report") ||
    normalized.endsWith("_summary")
  ) {
    return "text";
  }
  return "text";
}

function normalizeStageKindInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    [
      "model_interaction",
      "browser_fixed_sources",
      "current_web_research",
      "gmail_readonly_categorization",
      "gmail_metadata_review",
      "local_file_classification",
      "visual_batch_classification",
      "metadata_first_review",
      "staged_document_export",
      "unsupported",
    ].includes(normalized)
  ) {
    return normalized;
  }
  if (["gmail_categorization", "gmail_readonly", "gmail_readonly_detail", "gmail_thread_categorization", "gmail_detail_categorization"].includes(normalized)) {
    return "gmail_readonly_categorization";
  }
  if (["gmail_metadata", "gmail_metadata_only", "gmail_metadata_first", "gmail_metadata_categorization"].includes(normalized)) return "gmail_metadata_review";
  if (
    [
      "collection_processing",
      "collection_compaction",
      "data_processing",
      "data_compaction",
      "thread_compaction",
      "message_compaction",
      "chunking",
      "chunked_processing",
      "chunked_categorization",
      "category_reduction",
      "categorization_reduce",
      "categorization_synthesis",
      "report_generation",
      "final_report",
    ].includes(normalized)
  ) {
    return "model_interaction";
  }
  if (
    (normalized.includes("categor") ||
      normalized.includes("classif") ||
      normalized.includes("summar") ||
      normalized.includes("synthes") ||
      normalized.includes("report")) &&
    !normalized.includes("connector") &&
    !normalized.includes("tool")
  ) {
    return "model_interaction";
  }
  return value;
}

function validateWorkflowPlanDslNoRawIr(plan: WorkflowPlanDsl): WorkflowProgramDiagnostic[] {
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    const record = value as Record<string, unknown>;
    const kind = typeof record.kind === "string" ? record.kind : undefined;
    if (kind && RAW_IR_NODE_KINDS.has(kind)) {
      diagnostics.push(errorDiagnostic("plan_dsl.raw_ir_leak", `Workflow Plan DSL cannot contain raw WorkflowProgramIR node kind ${JSON.stringify(kind)}. Select a high-level kernel stage instead.`, `${path}/kind`));
    }
    for (const [key, item] of Object.entries(record)) {
      if (RAW_IR_FORBIDDEN_KEYS.has(key)) {
        diagnostics.push(errorDiagnostic("plan_dsl.raw_ir_leak", `Workflow Plan DSL cannot contain raw IR key ${JSON.stringify(key)}. Use high-level stage inputs instead.`, `${path}/${escapeJsonPointerSegment(key)}`));
      }
      visit(item, `${path}/${escapeJsonPointerSegment(key)}`);
    }
  };
  visit(plan, "");
  return diagnostics;
}

function selectWorkflowPlanDslKernelStage(plan: WorkflowPlanDsl): WorkflowPlanDslStage | undefined {
  return (
    plan.stages.find((stage) => stage.kind === "current_web_research") ??
    plan.stages.find((stage) => stage.kind === "browser_fixed_sources") ??
    plan.stages.find((stage) => stage.kind === "gmail_readonly_categorization") ??
    plan.stages.find((stage) => stage.kind === "gmail_metadata_review") ??
    plan.stages.find((stage) => stage.kind === "visual_batch_classification") ??
    plan.stages.find((stage) => stage.kind === "local_file_classification") ??
    plan.stages.find((stage) => stage.kind === "metadata_first_review") ??
    plan.stages.find((stage) => stage.kind === "model_interaction") ??
    plan.stages.find((stage) => stage.kind === "unsupported") ??
    plan.stages[0]
  );
}

function lowerModelInteractionPlan(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage): WorkflowPlanDslLoweringResult {
  const question = plan.questions?.[0] ?? {
    id: "review",
    prompt: "Provide any preference or correction before Ambient synthesizes the final workflow output.",
    allowFreeform: true,
  };
  const outputSchema = outputSchemaForPlan(plan, ["html", "summary"]);
  const finalValue = finalValueForSchema("synthesize", outputSchema);
  return {
    success: true,
    selectedKernel: "model_interaction",
    diagnostics: [],
    program: programWithNodes(plan, [
      {
        id: "ask-user",
        kind: "review.input",
        prompt: question.prompt,
        choices: question.choices,
        allowFreeform: question.allowFreeform ?? true,
        data: { goal: plan.goal, stage: stage.intent },
      },
      {
        id: "synthesize",
        kind: "model.call",
        dependsOn: ["ask-user"],
        task: "plan_dsl.model_interaction.synthesize",
        input: {
          goal: plan.goal,
          summary: plan.summary ?? plan.goal,
          stageIntent: stage.intent,
          evidenceNeeded: plan.evidenceNeeded ?? stage.evidenceNeeded ?? [],
          transformations: plan.transformations ?? stage.transformations ?? [],
          userChoice: { fromHandle: "askUser.choiceId" },
          userText: { fromHandle: "askUser.text" },
          requiredOutput: outputContractValue(plan.outputContract ?? stage.outputContract),
        },
        output: { schema: outputSchema },
      },
      { id: "final-output", kind: "output.final", dependsOn: ["synthesize"], value: finalValue },
    ]),
  };
}

function lowerBrowserFixedSourcesPlan(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage): WorkflowPlanDslLoweringResult {
  const urls = stringArrayInput(stage.inputs, "urls").slice(0, numberInput(stage.inputs, "maxSources", 5));
  if (!urls.length) {
    return {
      success: false,
      diagnostics: [errorDiagnostic("plan_dsl.browser_urls_required", "browser_fixed_sources requires stage.inputs.urls with at least one URL.", `/stages/${plan.stages.indexOf(stage)}/inputs/urls`)],
    };
  }
  const browserNodes: WorkflowProgramNode[] = urls.map((url, index) => ({
    id: `read-source-${index + 1}`,
    kind: "browser.intervention",
    tool: "browser_nav",
    args: { url, waitForUserAction: false },
    source: { url, title: `Source ${index + 1}` },
    retry: { maxAttempts: 1, onStillBlocked: "return_skipped" },
  }));
  const question = plan.questions?.[0] ?? {
    id: "report-tone",
    prompt: "Choose the report tone before synthesis.",
    choices: [
      { id: "concise", label: "Concise" },
      { id: "detailed", label: "Detailed" },
    ],
    allowFreeform: true,
  };
  const sourceRecords = urls.map((url, index) => {
    const alias = `readSource${index + 1}`;
    return {
      url,
      text: { fromHandle: `${alias}.text` },
      title: { fromHandle: `${alias}.pageTitle` },
      skipped: { fromHandle: `${alias}.skipped` },
    };
  });
  const outputSchema = outputSchemaForPlan(plan, ["html", "summary", "sourceCount"]);
  return {
    success: true,
    selectedKernel: "browser_fixed_sources",
    diagnostics: [],
    program: programWithNodes(plan, [
      ...browserNodes,
      {
        id: "source-evidence",
        kind: "checkpoint.write",
        dependsOn: browserNodes.map((node) => node.id),
        key: "browser-source-evidence",
        value: { sources: sourceRecords, sourceCount: urls.length },
      },
      {
        id: "ask-user",
        kind: "review.input",
        dependsOn: ["source-evidence"],
        prompt: question.prompt,
        choices: question.choices,
        allowFreeform: question.allowFreeform ?? true,
        data: { sourceCount: urls.length },
      },
      {
        id: "synthesize",
        kind: "model.call",
        dependsOn: ["ask-user", "source-evidence"],
        task: "plan_dsl.browser_fixed_sources.synthesize",
        input: {
          goal: plan.goal,
          sources: { fromHandle: "sourceEvidence.sources" },
          sourceCount: { fromHandle: "sourceEvidence.sourceCount" },
          userChoice: { fromHandle: "askUser.choiceId" },
          userText: { fromHandle: "askUser.text" },
          requiredOutput: outputContractValue(plan.outputContract ?? stage.outputContract),
        },
        output: { schema: outputSchema },
      },
      { id: "final-output", kind: "output.final", dependsOn: ["synthesize"], value: finalValueForSchema("synthesize", outputSchema) },
    ]),
  };
}

function lowerCurrentWebResearchPlan(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage, userRequest?: string): WorkflowPlanDslLoweringResult {
  const pageQueries = inferPageQueries(plan, stage, userRequest).slice(0, numberInput(stage.inputs, "maxPages", 4));
  if (!pageQueries.length) {
    return {
      success: false,
      diagnostics: [errorDiagnostic("plan_dsl.page_queries_required", "current_web_research requires stage.inputs.pageQueries with at least one bounded query.", `/stages/${plan.stages.indexOf(stage)}/inputs/pageQueries`)],
    };
  }
  const pageSize = numberInput(stage.inputs, "pageSize", 5);
  const maxPages = Math.max(1, Math.min(numberInput(stage.inputs, "maxPages", pageQueries.length), pageQueries.length));
  const maxItems = numberInput(stage.inputs, "maxItems", pageSize * maxPages);
  const outputPath = inferOutputPath(plan, stage, userRequest);
  const shouldStageWrite = Boolean(outputPath && (plan.riskPolicy?.mutation === "stage_writes" || stage.inputs?.stageWrite === true || isStagedWriteRequested(plan, stage, userRequest)));
  const nodes: WorkflowProgramNode[] = [
    {
      id: "search-sources",
      kind: "tool.paginate",
      tool: "browser_search",
      pageQueries,
      input: {},
      itemsPath: "",
      queryInputPath: "query",
      pageSizeInputPath: "maxResults",
      pageSize,
      maxItems,
      maxPages,
      dedupeKeyPath: "url",
    },
    { id: "dedupe-sources", kind: "collection.dedupe", items: { fromHandle: "searchSources.items" }, keyPath: "url", strategy: "url_canonical", maxItems },
    {
      id: "trim-sources",
      kind: "collection.map",
      items: { fromHandle: "dedupeSources.items" },
      itemName: "source",
      map: {
        title: { fromItem: "source", path: "title" },
        url: { fromItem: "source", path: "url" },
        snippet: { fromItem: "source", path: "snippet" },
        freshness: { fromItem: "source", path: "date" },
        rank: { fromItem: "source", path: "rank" },
      },
      maxItems,
    },
    { id: "chunk-sources", kind: "collection.chunk", items: { fromHandle: "trimSources.items" }, chunkSize: numberInput(stage.inputs, "chunkSize", pageSize), maxChunks: maxPages },
    {
      id: "extract-source-findings",
      kind: "model.map",
      items: { fromHandle: "chunkSources.chunks" },
      itemName: "chunk",
      task: "plan_dsl.current_web_research.extract",
      input: compactWorkflowValueRecord({
        goal: plan.goal,
        runDate: stringInput(stage.inputs, "runDate"),
        timeZone: stringInput(stage.inputs, "timeZone"),
        chunk: { fromItem: "chunk" },
      }),
      output: { schema: { findings: "array", sourceUrls: "array", freshnessNotes: "string" } },
      maxItems: maxPages,
      maxConcurrency: Math.min(4, maxPages),
    },
    {
      id: "synthesize-report",
      kind: "model.reduce",
      items: { fromHandle: "extractSourceFindings.results" },
      task: "plan_dsl.current_web_research.synthesize",
      input: compactWorkflowValueRecord({
        goal: plan.goal,
        sourceCandidateCount: { fromHandle: "searchSources.count" },
        uniqueSourceCount: { fromHandle: "dedupeSources.count" },
        runDate: stringInput(stage.inputs, "runDate"),
        timeZone: stringInput(stage.inputs, "timeZone"),
        requiredOutput: outputContractValue(plan.outputContract ?? stage.outputContract),
      }),
      output: { schema: { markdown: "string", summary: "string", citationUrls: "array", sourceCandidateCount: "number", uniqueSourceCount: "number", freshnessCaveats: "string" } },
      strategy: "tree",
      maxInputItems: maxPages,
      maxFanIn: Math.min(4, maxPages),
      maxLevels: 1,
    },
  ];
  if (outputPath) {
    nodes.push({
      id: "render-report",
      kind: "document.render",
      dependsOn: ["synthesize-report"],
      input: { content: { fromHandle: "synthesizeReport.markdown" } },
      title: plan.title,
      format: "markdown",
      path: outputPath,
    });
    if (shouldStageWrite) {
      nodes.push({
        id: "stage-write",
        kind: "mutation.stage",
        dependsOn: ["render-report"],
        tool: "file_write",
        args: { path: { fromHandle: "renderReport.path" }, content: { fromHandle: "renderReport.content" } },
        changeSet: { action: "write_report", path: { fromHandle: "renderReport.path" }, bytes: { fromHandle: "renderReport.bytes" } },
      });
    }
  }
  nodes.push({
    id: "final-output",
    kind: "output.final",
    dependsOn: shouldStageWrite ? ["stage-write"] : outputPath ? ["render-report"] : ["synthesize-report"],
    value: {
      summary: { fromHandle: "synthesizeReport.summary" },
      markdown: { fromHandle: "synthesizeReport.markdown" },
      citationUrls: { fromHandle: "synthesizeReport.citationUrls" },
      sourceCandidateCount: { fromHandle: "searchSources.count" },
      uniqueSourceCount: { fromHandle: "dedupeSources.count" },
      freshnessCaveats: { fromHandle: "synthesizeReport.freshnessCaveats" },
      ...(outputPath ? { artifactPath: { fromHandle: "renderReport.artifactPath" } } : {}),
      ...(shouldStageWrite ? { stagedWritePath: { fromHandle: "stageWrite.path" } } : {}),
    },
  });
  return { success: true, selectedKernel: "current_web_research", diagnostics: [], program: programWithNodes(plan, nodes) };
}

function lowerGmailReadonlyCategorizationPlan(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage, userRequest?: string): WorkflowPlanDslLoweringResult {
  const target = inferGmailCategorizationTarget(plan, stage, userRequest, { defaultMaxItems: 300, maxItemsLimit: 300 });
  if (!target) {
    return {
      success: false,
      diagnostics: [
        errorDiagnostic(
          "plan_dsl.gmail_source_required",
          "gmail_readonly_categorization requires a Gmail request with bounded maxMessages/maxItems and read-only categorization intent.",
          `/stages/${plan.stages.indexOf(stage)}/inputs`,
        ),
      ],
    };
  }
  const outputSchema = outputSchemaForPlan(plan, [
    "html",
    "markdown",
    "summary",
    "categories",
    "coverage",
    "examples",
    "messageCount",
    "threadCount",
    "readOnlyStatement",
  ]);
  const finalValue = finalValueForSchema("reduceCategories", outputSchema) as Record<string, WorkflowProgramValue>;
  return {
    success: true,
    selectedKernel: "gmail_readonly_categorization",
    diagnostics: [],
    program: programWithNodes(plan, [
      {
        id: "gmail-pages",
        kind: "connector.paginate",
        connectorId: "google.gmail",
        operation: "search",
        input: { query: target.query, maxResults: target.pageSize },
        ...(target.accountId ? { accountId: target.accountId } : {}),
        pageSize: target.pageSize,
        maxItems: target.maxItems,
        maxPages: target.maxPages,
        dedupeKeyPath: "threadId",
      },
      {
        id: "read-threads",
        kind: "connector.map",
        dependsOn: ["gmail-pages"],
        connectorId: "google.gmail",
        operation: "readThread",
        items: { fromHandle: "gmailPages.items" },
        itemName: "message",
        input: { threadId: { fromItem: "message", path: "threadId" }, format: target.detailFormat },
        ...(target.accountId ? { accountId: target.accountId } : {}),
        maxItems: target.maxItems,
        maxConcurrency: target.maxConcurrency,
      },
      {
        id: "thread-records",
        kind: "collection.map",
        dependsOn: ["read-threads"],
        items: { fromHandle: "readThreads.items" },
        itemName: "thread",
        maxItems: target.maxItems,
        map: {
          messageId: { fromItem: "thread", path: "item.id" },
          threadId: { fromItem: "thread", path: "item.threadId" },
          searchSnippet: { fromItem: "thread", path: "item.snippet" },
          internalDate: { fromItem: "thread", path: "item.internalDate" },
          labelIds: { fromItem: "thread", path: "item.labelIds" },
          readThreadId: { fromItem: "thread", path: "result.threadId" },
          readSnippet: { fromItem: "thread", path: "result.snippet" },
          messages: { fromItem: "thread", path: "result.messages" },
        },
      },
      {
        id: "gmail-coverage",
        kind: "checkpoint.write",
        dependsOn: ["thread-records"],
        key: "gmail_readonly_categorization_coverage",
        value: {
          searchedCount: { fromHandle: "gmailPages.count" },
          pageCount: { fromHandle: "gmailPages.pageCount" },
          searchTruncated: { fromHandle: "gmailPages.truncated" },
          readThreadCount: { fromHandle: "readThreads.count" },
          compactThreadCount: { fromHandle: "threadRecords.count" },
          maxItems: target.maxItems,
          maxPages: target.maxPages,
          pageSize: target.pageSize,
          maxConcurrency: target.maxConcurrency,
          maxCategories: target.maxCategories,
          readOnly: true,
          mutationPolicy: "read_only",
        },
      },
      {
        id: "thread-chunks",
        kind: "collection.chunk",
        dependsOn: ["gmail-coverage"],
        items: { fromHandle: "threadRecords.items" },
        chunkSize: target.chunkSize,
        maxChunks: target.maxChunks,
      },
      {
        id: "categorize-chunks",
        kind: "model.map",
        dependsOn: ["thread-chunks"],
        items: { fromHandle: "threadChunks.chunks" },
        itemName: "chunk",
        task: "plan_dsl.gmail_readonly_categorization.categorize_chunk",
        input: {
          goal: plan.goal,
          stageIntent: stage.intent,
          chunkId: { fromItem: "chunk", path: "id" },
          count: { fromItem: "chunk", path: "count" },
          threads: { fromItem: "chunk", path: "items" },
          maxCategories: target.maxCategories,
          instruction:
            "Return category candidates, counts, example message/thread metadata, provenance by message or thread id/date, uncertainty, and skipped/partial coverage for this chunk only. This workflow is read-only and must not claim any Gmail mutation.",
        },
        output: { schema: { categories: "array", examples: "array", coverage: "string", uncertainty: "string" } },
        maxItems: target.maxChunks,
        maxConcurrency: target.maxConcurrency,
      },
      {
        id: "reduce-categories",
        kind: "model.reduce",
        dependsOn: ["categorize-chunks", "gmail-coverage"],
        items: { fromHandle: "categorizeChunks.results" },
        task: "plan_dsl.gmail_readonly_categorization.reduce",
        input: {
          goal: plan.goal,
          maxCategories: target.maxCategories,
          requestedMaxMessages: target.maxItems,
          observedSearchCount: { fromHandle: "gmailPages.count" },
          observedThreadCount: { fromHandle: "threadRecords.count" },
          pageCount: { fromHandle: "gmailPages.pageCount" },
          searchTruncated: { fromHandle: "gmailPages.truncated" },
          requiredOutput: outputContractValue(plan.outputContract ?? stage.outputContract),
          instruction:
            "Merge chunk candidates into no more than the requested category count. Include category names, counts, example message or thread metadata, evidence provenance by message/thread id or date, coverage/skipped/partial notes, and an explicit read-only/no-mutation statement.",
        },
        output: { schema: outputSchema },
        strategy: "tree",
        maxInputItems: target.maxChunks,
        maxFanIn: Math.min(8, Math.max(2, target.maxChunks)),
        maxLevels: target.maxChunks > 8 ? 2 : 1,
      },
      {
        id: "gmail-categorization-report",
        kind: "checkpoint.write",
        dependsOn: ["reduce-categories"],
        key: "gmail_readonly_categorization_report",
        value: {
          ...finalValue,
          searchedCount: { fromHandle: "gmailPages.count" },
          readThreadCount: { fromHandle: "readThreads.count" },
          compactThreadCount: { fromHandle: "threadRecords.count" },
          readOnly: true,
        },
      },
      {
        id: "final-output",
        kind: "output.final",
        dependsOn: ["gmail-categorization-report"],
        value: {
          ...finalValue,
          searchedCount: { fromHandle: "gmailPages.count" },
          readThreadCount: { fromHandle: "readThreads.count" },
          compactThreadCount: { fromHandle: "threadRecords.count" },
          pageCount: { fromHandle: "gmailPages.pageCount" },
          readOnlyStatement: { fromHandle: "reduceCategories.readOnlyStatement" },
          mutationPolicy: "read_only",
        },
      },
    ]),
  };
}

function lowerGmailMetadataReviewPlan(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage, userRequest?: string): WorkflowPlanDslLoweringResult {
  const target = inferGmailCategorizationTarget(plan, stage, userRequest, { defaultMaxItems: 1000, maxItemsLimit: 1000 });
  if (!target) {
    return {
      success: false,
      diagnostics: [
        errorDiagnostic(
          "plan_dsl.gmail_source_required",
          "gmail_metadata_review requires a Gmail request with bounded maxMessages/maxItems and metadata-only review intent.",
          `/stages/${plan.stages.indexOf(stage)}/inputs`,
        ),
      ],
    };
  }
  const outputSchema = outputSchemaForPlan(plan, ["html", "markdown", "summary", "categories", "coverage", "examples", "messageCount", "threadCount", "readOnlyStatement"]);
  const metadataNodes: WorkflowProgramNode[] = [
    {
      id: "gmail-pages",
      kind: "connector.paginate",
      connectorId: "google.gmail",
      operation: "search",
      input: { query: target.query, maxResults: target.pageSize },
      ...(target.accountId ? { accountId: target.accountId } : {}),
      pageSize: target.pageSize,
      maxItems: target.maxItems,
      maxPages: target.maxPages,
      dedupeKeyPath: "threadId",
    },
    {
      id: "gmail-metadata",
      kind: "collection.map",
      dependsOn: ["gmail-pages"],
      items: { fromHandle: "gmailPages.items" },
      itemName: "message",
      maxItems: target.maxItems,
      map: {
        id: { fromItem: "message", path: "id" },
        threadId: { fromItem: "message", path: "threadId" },
        snippet: { fromItem: "message", path: "snippet" },
        internalDate: { fromItem: "message", path: "internalDate" },
        labelIds: { fromItem: "message", path: "labelIds" },
      },
    },
    {
      id: "gmail-metadata-coverage",
      kind: "checkpoint.write",
      dependsOn: ["gmail-metadata"],
      key: "gmail_metadata_review_coverage",
      value: {
        metadataCount: { fromHandle: "gmailMetadata.count" },
        pageCount: { fromHandle: "gmailPages.pageCount" },
        searchTruncated: { fromHandle: "gmailPages.truncated" },
        maxItems: target.maxItems,
        maxPages: target.maxPages,
        pageSize: target.pageSize,
        metadataOnly: true,
        readOnly: true,
        mutationPolicy: "read_only",
      },
    },
  ];
  if (target.maxItems <= 50) {
    const finalValue = finalValueForSchema("summarizeMetadata", outputSchema) as Record<string, WorkflowProgramValue>;
    return {
      success: true,
      selectedKernel: stage.kind,
      diagnostics: [],
      program: programWithNodes(plan, [
        ...metadataNodes,
        {
          id: "summarize-metadata",
          kind: "model.call",
          dependsOn: ["gmail-metadata-coverage"],
          task: "plan_dsl.gmail_metadata_review.summarize",
          input: {
            goal: plan.goal,
            stageIntent: stage.intent,
            messages: { fromHandle: "gmailMetadata.items" },
            messageCount: { fromHandle: "gmailMetadata.count" },
            maxCategories: target.maxCategories,
            requiredOutput: outputContractValue(plan.outputContract ?? stage.outputContract),
            instruction:
              "Summarize visible themes from Gmail search metadata only. Include theme names, counts, example message/thread metadata, coverage/skipped/partial notes, and explicit metadata-only and read-only statements. Do not request or imply readThread, attachments, drafts, sends, labels mutation, browser, files, or shell.",
          },
          output: { schema: outputSchema },
        },
        {
          id: "metadata-report",
          kind: "checkpoint.write",
          dependsOn: ["summarize-metadata"],
          key: "gmail_metadata_review_report",
          value: { ...finalValue, metadataOnly: true, readOnly: true, metadataCount: { fromHandle: "gmailMetadata.count" } },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["metadata-report"], value: { ...finalValue, metadataOnly: true, mutationPolicy: "read_only" } },
      ]),
    };
  }

  const finalValue = finalValueForSchema("mergeMetadataCategories", outputSchema) as Record<string, WorkflowProgramValue>;
  return {
    success: true,
    selectedKernel: stage.kind,
    diagnostics: [],
    program: programWithNodes(plan, [
      ...metadataNodes,
      {
        id: "metadata-chunks",
        kind: "collection.chunk",
        dependsOn: ["gmail-metadata-coverage"],
        items: { fromHandle: "gmailMetadata.items" },
        chunkSize: target.chunkSize,
        maxChunks: target.maxChunks,
      },
      {
        id: "categorize-metadata",
        kind: "model.map",
        dependsOn: ["metadata-chunks"],
        items: { fromHandle: "metadataChunks.chunks" },
        itemName: "chunk",
        task: "plan_dsl.gmail_metadata_review.categorize_chunk",
        input: {
          goal: plan.goal,
          chunkId: { fromItem: "chunk", path: "id" },
          count: { fromItem: "chunk", path: "count" },
          messages: { fromItem: "chunk", path: "items" },
          maxCategories: target.maxCategories,
          instruction: "Return category candidates using Gmail metadata only. Include provenance and uncertainty; do not request full bodies or attachments.",
        },
        output: { schema: { categories: "array", examples: "array", coverage: "string", uncertainty: "string" } },
        maxItems: target.maxChunks,
        maxConcurrency: target.maxConcurrency,
      },
      {
        id: "review-detail-followup",
        kind: "review.input",
        dependsOn: ["categorize-metadata"],
        prompt: "Choose whether a separate bounded full-thread follow-up should be planned for low-confidence Gmail examples. This workflow stays metadata-only.",
        choices: [
          { id: "metadata-only", label: "Keep metadata-only" },
          { id: "plan-followup", label: "Plan bounded follow-up" },
        ],
        allowFreeform: true,
        data: {
          metadataCount: { fromHandle: "gmailMetadata.count" },
          chunkCount: { fromHandle: "metadataChunks.count" },
          chunkCategories: { fromHandle: "categorizeMetadata.results" },
        },
      },
      {
        id: "merge-metadata-categories",
        kind: "model.reduce",
        dependsOn: ["categorize-metadata", "review-detail-followup"],
        items: { fromHandle: "categorizeMetadata.results" },
        task: "plan_dsl.gmail_metadata_review.reduce",
        input: {
          goal: plan.goal,
          maxCategories: target.maxCategories,
          metadataCount: { fromHandle: "gmailMetadata.count" },
          followupChoice: { fromHandle: "reviewDetailFollowup.choiceId" },
          followupText: { fromHandle: "reviewDetailFollowup.text" },
          requiredOutput: outputContractValue(plan.outputContract ?? stage.outputContract),
          instruction:
            "Merge metadata-only category candidates into the final report. Include coverage/skipped/partial notes, explicit metadata-only and read-only statements, and bounded follow-up candidates only if the review asks for them.",
        },
        output: { schema: outputSchema },
        strategy: "tree",
        maxInputItems: target.maxChunks,
        maxFanIn: Math.min(8, Math.max(2, target.maxChunks)),
        maxLevels: target.maxChunks > 8 ? 2 : 1,
      },
      {
        id: "metadata-report",
        kind: "checkpoint.write",
        dependsOn: ["merge-metadata-categories"],
        key: "gmail_metadata_review_report",
        value: { ...finalValue, metadataOnly: true, readOnly: true, metadataCount: { fromHandle: "gmailMetadata.count" } },
      },
      { id: "final-output", kind: "output.final", dependsOn: ["metadata-report"], value: { ...finalValue, metadataOnly: true, mutationPolicy: "read_only" } },
    ]),
  };
}

function lowerLocalFileClassificationPlan(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage, userRequest?: string): WorkflowPlanDslLoweringResult {
  const target = inferLocalClassificationTarget(plan, stage, userRequest);
  if (!target) {
    return {
      success: false,
      diagnostics: [
        errorDiagnostic(
          "plan_dsl.local_source_required",
          "local_file_classification requires either explicit file paths or one bounded directory path.",
          `/stages/${plan.stages.indexOf(stage)}/inputs`,
        ),
      ],
    };
  }
  if (target.mode === "directory") {
    return lowerLocalDirectoryMetadataPlan(plan, stage, target);
  }
  return lowerExplicitLocalFilesPlan(plan, stage, target.paths);
}

function lowerVisualBatchClassificationPlan(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage, userRequest?: string): WorkflowPlanDslLoweringResult {
  const target = inferVisualBatchTarget(plan, stage, userRequest);
  if (!target) {
    return {
      success: false,
      diagnostics: [
        errorDiagnostic(
          "plan_dsl.visual_source_required",
          "visual_batch_classification requires one bounded directory path with image selection limits.",
          `/stages/${plan.stages.indexOf(stage)}/inputs`,
        ),
      ],
    };
  }
  const outputSchema = outputSchemaForPlan(plan, ["html", "markdown", "summary", "categories", "assignments", "imageCount", "coverage"]);
  const finalValue = finalValueForSchema("synthesizeVisualCategories", outputSchema) as Record<string, WorkflowProgramValue>;
  return {
    success: true,
    selectedKernel: "visual_batch_classification",
    diagnostics: [],
    program: programWithNodes(plan, [
      {
        id: "list-directory",
        kind: "tool.call",
        tool: "local_directory_list",
        args: { path: target.directory, maxEntries: target.maxEntries, maxDepth: target.maxDepth },
      },
      {
        id: "select-images",
        kind: "collection.filter",
        dependsOn: ["list-directory"],
        items: { fromHandle: "listDirectory.entries" },
        itemName: "entry",
        maxItems: target.maxImages,
        includeExtensions: target.imageExtensions,
        includeNamePrefixes: target.namePrefixes,
        excludeNamePrefixes: ["."],
        excludeNameIncludes: ["credential", "secret"],
        requireFile: true,
      },
      {
        id: "selected-image-evidence",
        kind: "checkpoint.write",
        dependsOn: ["select-images"],
        key: "selected_visual_images",
        value: {
          images: { fromHandle: "selectImages.items" },
          imageCount: { fromHandle: "selectImages.count" },
          matchedCount: { fromHandle: "selectImages.matchedCount" },
          sourceCount: { fromHandle: "selectImages.sourceCount" },
          skippedMetadata: { fromHandle: "listDirectory.skipped" },
          truncated: { fromHandle: "listDirectory.truncated" },
          totalKnownEntries: { fromHandle: "listDirectory.totalKnownEntries" },
          rootPath: { fromHandle: "listDirectory.rootPath" },
        },
      },
      {
        id: "analyze-images",
        kind: "loop.map",
        dependsOn: ["selected-image-evidence"],
        items: { fromHandle: "selectImages.items" },
        itemName: "image",
        maxItems: target.maxImages,
        maxConcurrency: target.maxConcurrency,
        map: {
          kind: "tool.call",
          tool: "ambient_visual_analyze",
          args: {
            image: {
              path: { fromItem: "image", path: "absolutePath" },
              source: "external_file",
              absolute: true,
              label: { fromItem: "image", path: "name" },
            },
            task: "image_description",
            prompt: "Describe the visible subject, document type if visible, safe categorization cues, and uncertainty. Do not infer hidden content.",
            allowExternalMediaPaths: true,
          },
          output: { type: "visualAnalysisResult" },
        },
      },
      {
        id: "visual-evidence",
        kind: "checkpoint.write",
        dependsOn: ["analyze-images"],
        key: "visual_analysis_evidence",
        value: {
          images: { fromHandle: "selectImages.items" },
          visualObservations: { fromHandle: "analyzeImages.items" },
          analyzedImageCount: { fromHandle: "analyzeImages.count" },
          selectedImageCount: { fromHandle: "selectImages.count" },
          skippedMetadata: { fromHandle: "listDirectory.skipped" },
          truncated: { fromHandle: "listDirectory.truncated" },
          totalKnownEntries: { fromHandle: "listDirectory.totalKnownEntries" },
        },
      },
      {
        id: "synthesize-visual-categories",
        kind: "model.call",
        dependsOn: ["visual-evidence"],
        task: "plan_dsl.visual_batch_classification.synthesize",
        input: {
          goal: plan.goal,
          stageIntent: stage.intent,
          selectedImages: { fromHandle: "selectImages.items" },
          selectedImageCount: { fromHandle: "selectImages.count" },
          visualObservations: { fromHandle: "analyzeImages.items" },
          analyzedImageCount: { fromHandle: "analyzeImages.count" },
          skippedMetadata: { fromHandle: "listDirectory.skipped" },
          truncated: { fromHandle: "listDirectory.truncated" },
          totalKnownEntries: { fromHandle: "listDirectory.totalKnownEntries" },
          requiredOutput: outputContractValue(plan.outputContract ?? stage.outputContract),
        },
        output: { schema: outputSchema },
      },
      {
        id: "visual-category-report",
        kind: "checkpoint.write",
        dependsOn: ["synthesize-visual-categories"],
        key: "generated_visual_classification",
        value: {
          ...finalValue,
          selectedImages: { fromHandle: "selectImages.items" },
          visualObservations: { fromHandle: "analyzeImages.items" },
          analyzedImageCount: { fromHandle: "analyzeImages.count" },
          skippedMetadata: { fromHandle: "listDirectory.skipped" },
          totalKnownEntries: { fromHandle: "listDirectory.totalKnownEntries" },
        },
      },
      {
        id: "final-output",
        kind: "output.final",
        dependsOn: ["visual-category-report"],
        value: {
          ...finalValue,
          selectedImages: { fromHandle: "selectImages.items" },
          visualObservations: { fromHandle: "analyzeImages.items" },
          analyzedImageCount: { fromHandle: "analyzeImages.count" },
          skippedMetadata: { fromHandle: "listDirectory.skipped" },
          totalKnownEntries: { fromHandle: "listDirectory.totalKnownEntries" },
          coverageSource: "local_directory_list plus ambient_visual_analyze",
        },
      },
    ]),
  };
}

function lowerExplicitLocalFilesPlan(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage, paths: string[]): WorkflowPlanDslLoweringResult {
  const boundedPaths = paths.slice(0, Math.min(numberInput(stage.inputs, "maxFiles", plan.budgetPolicy?.maxItems ?? 6), 12));
  const readNodes: WorkflowProgramNode[] = boundedPaths.map((path, index) => ({
    id: `read-file-${index + 1}`,
    kind: "tool.call",
    tool: "file_read",
    args: { path },
  }));
  const fileEvidence = boundedPaths.map((path, index) => {
    const alias = `readFile${index + 1}`;
    return {
      path,
      content: { fromHandle: `${alias}.content` },
      truncated: { fromHandle: `${alias}.truncated` },
      kind: { fromHandle: `${alias}.kind` },
    };
  });
  const question = plan.questions?.[0] ?? {
    id: "classification-feedback",
    prompt: "Review the draft classifications and add any correction or preference before Ambient returns the final labeled document.",
    allowFreeform: true,
  };
  const outputSchema = outputSchemaForPlan(plan, ["html", "summary", "categories", "fileCount"]);
  return {
    success: true,
    selectedKernel: "local_file_classification",
    diagnostics: [],
    program: programWithNodes(plan, [
      ...readNodes,
      {
        id: "file-evidence",
        kind: "checkpoint.write",
        dependsOn: readNodes.map((node) => node.id),
        key: "normalized_file_evidence",
        value: { files: fileEvidence, fileCount: boundedPaths.length },
      },
      {
        id: "draft-classifications",
        kind: "model.call",
        dependsOn: ["file-evidence"],
        task: "plan_dsl.local_file_classification.draft",
        input: {
          goal: plan.goal,
          stageIntent: stage.intent,
          files: { fromHandle: "fileEvidence.files" },
          evidenceNeeded: plan.evidenceNeeded ?? stage.evidenceNeeded ?? [],
          transformations: plan.transformations ?? stage.transformations ?? [],
        },
        output: { schema: { categories: "array", summary: "string", html: "string" } },
      },
      {
        id: "review-classifications",
        kind: "review.input",
        dependsOn: ["draft-classifications"],
        prompt: question.prompt,
        choices: question.choices,
        allowFreeform: question.allowFreeform ?? true,
        data: {
          fileCount: boundedPaths.length,
          summary: { fromHandle: "draftClassifications.summary" },
          categories: { fromHandle: "draftClassifications.categories" },
          html: { fromHandle: "draftClassifications.html" },
        },
      },
      {
        id: "final-report",
        kind: "model.call",
        dependsOn: ["review-classifications", "draft-classifications", "file-evidence"],
        task: "plan_dsl.local_file_classification.final",
        input: {
          goal: plan.goal,
          files: { fromHandle: "fileEvidence.files" },
          draftCategories: { fromHandle: "draftClassifications.categories" },
          draftSummary: { fromHandle: "draftClassifications.summary" },
          userChoice: { fromHandle: "reviewClassifications.choiceId" },
          userText: { fromHandle: "reviewClassifications.text" },
          requiredOutput: outputContractValue(plan.outputContract ?? stage.outputContract),
        },
        output: { schema: outputSchema },
      },
      {
        id: "generated-html",
        kind: "checkpoint.write",
        dependsOn: ["final-report"],
        key: "generated_local_file_classification",
        value: {
          html: { fromHandle: "finalReport.html" },
          summary: { fromHandle: "finalReport.summary" },
          categories: { fromHandle: "finalReport.categories" },
          fileCount: { fromHandle: "finalReport.fileCount" },
        },
      },
      { id: "final-output", kind: "output.final", dependsOn: ["generated-html"], value: finalValueForSchema("finalReport", outputSchema) },
    ]),
  };
}

function lowerLocalDirectoryMetadataPlan(
  plan: WorkflowPlanDsl,
  stage: WorkflowPlanDslStage,
  target: { mode: "directory"; directory: string; maxEntries: number; maxDepth: number },
): WorkflowPlanDslLoweringResult {
  const outputSchema = outputSchemaForPlan(plan, ["html", "markdown", "summary", "categories", "totalKnownEntries"]);
  const finalValue = finalValueForSchema("classifyDirectory", outputSchema) as Record<string, WorkflowProgramValue>;
  return {
    success: true,
    selectedKernel: stage.kind,
    diagnostics: [],
    program: programWithNodes(plan, [
      {
        id: "list-directory",
        kind: "tool.call",
        tool: "local_directory_list",
        args: { path: target.directory, maxEntries: target.maxEntries, maxDepth: target.maxDepth },
      },
      {
        id: "directory-inventory",
        kind: "checkpoint.write",
        dependsOn: ["list-directory"],
        key: "normalized_directory_inventory",
        value: {
          entries: { fromHandle: "listDirectory.entries" },
          skippedMetadata: { fromHandle: "listDirectory.skipped" },
          truncated: { fromHandle: "listDirectory.truncated" },
          totalKnownEntries: { fromHandle: "listDirectory.totalKnownEntries" },
          rootPath: { fromHandle: "listDirectory.rootPath" },
          rootName: { fromHandle: "listDirectory.rootName" },
        },
      },
      {
        id: "classify-directory",
        kind: "model.call",
        dependsOn: ["directory-inventory"],
        task: "plan_dsl.local_directory_metadata_classification.synthesize",
        input: {
          goal: plan.goal,
          stageIntent: stage.intent,
          entries: { fromHandle: "listDirectory.entries" },
          skippedMetadata: { fromHandle: "listDirectory.skipped" },
          truncated: { fromHandle: "listDirectory.truncated" },
          totalKnownEntries: { fromHandle: "listDirectory.totalKnownEntries" },
          rootPath: { fromHandle: "listDirectory.rootPath" },
          rootName: { fromHandle: "listDirectory.rootName" },
          requiredOutput: outputContractValue(plan.outputContract ?? stage.outputContract),
        },
        output: { schema: outputSchema },
      },
      {
        id: "directory-report",
        kind: "checkpoint.write",
        dependsOn: ["classify-directory"],
        key: "generated_directory_classification",
        value: {
          html: { fromHandle: "classifyDirectory.html" },
          markdown: { fromHandle: "classifyDirectory.markdown" },
          summary: { fromHandle: "classifyDirectory.summary" },
          categories: { fromHandle: "classifyDirectory.categories" },
          skippedMetadata: { fromHandle: "listDirectory.skipped" },
          totalKnownEntries: { fromHandle: "listDirectory.totalKnownEntries" },
          truncated: { fromHandle: "listDirectory.truncated" },
        },
      },
      {
        id: "final-output",
        kind: "output.final",
        dependsOn: ["directory-report"],
        value: {
          ...finalValue,
          skippedMetadata: { fromHandle: "listDirectory.skipped" },
          totalKnownEntries: { fromHandle: "listDirectory.totalKnownEntries" },
          truncated: { fromHandle: "listDirectory.truncated" },
          rootPath: { fromHandle: "listDirectory.rootPath" },
        },
      },
    ]),
  };
}

function programWithNodes(plan: WorkflowPlanDsl, nodes: WorkflowProgramNode[]): WorkflowProgramIR {
  return {
    version: 1,
    title: plan.title,
    goal: plan.goal,
    summary: plan.summary,
    successCriteria: plan.outputContract?.fields?.map((field) => `Final output includes ${field}.`) ?? ["Workflow reaches final output."],
    nodes,
    budgets: {
      maxToolCalls: Math.max(plan.budgetPolicy?.maxToolCalls ?? 0, defaultToolCallBudget(nodes)) || undefined,
      maxModelCalls: Math.max(plan.budgetPolicy?.maxModelCalls ?? 0, defaultModelCallBudget(nodes)) || undefined,
      maxConnectorCalls: Math.max(plan.budgetPolicy?.maxConnectorCalls ?? 0, defaultConnectorCallBudget(nodes)),
      maxRunMs: plan.budgetPolicy?.maxRunMs ?? 300000,
    },
    openQuestions: [],
  };
}

function outputSchemaForPlan(plan: WorkflowPlanDsl, fallbackFields: string[]): Record<string, string> {
  const fields = uniqueStrings([...(plan.outputContract?.fields ?? []), ...fallbackFields]).slice(0, 12);
  const schema: Record<string, string> = {};
  for (const field of fields) schema[field] = schemaTypeForField(field);
  return schema;
}

function finalValueForSchema(producerAlias: string, schema: Record<string, string>): WorkflowProgramValue {
  const value: Record<string, WorkflowProgramValue> = {};
  for (const field of Object.keys(schema)) value[field] = { fromHandle: `${producerAlias}.${field}` };
  return value;
}

function outputContractValue(contract: WorkflowPlanDslOutputContract | undefined): WorkflowProgramValue {
  if (!contract) return {};
  return compactWorkflowValueRecord({
    format: contract.format,
    fields: contract.fields,
    artifactPath: contract.artifactPath,
  });
}

function inferOutputPath(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage, userRequest?: string): string | undefined {
  return (
    stringInput(stage.inputs, "outputPath") ??
    plan.outputContract?.artifactPath ??
    stage.outputContract?.artifactPath ??
    extractArtifactPath(userRequest) ??
    extractArtifactPath(plan.goal) ??
    extractArtifactPath(plan.summary) ??
    extractArtifactPath(stage.intent)
  );
}

function inferPageQueries(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage, userRequest?: string): string[] {
  const explicit = [
    ...stringArrayInput(stage.inputs, "pageQueries"),
    ...stringArrayInput(stage.inputs, "queries"),
    ...stringArrayInput(stage.inputs, "searchQueries"),
    ...stringArrayInput(stage.inputs, "sourceQueries"),
  ];
  if (explicit.length > 0) return uniqueStrings(explicit);
  const text = [userRequest, plan.goal, plan.summary, stage.intent, ...(plan.evidenceNeeded ?? []), ...(stage.evidenceNeeded ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const queryList = extractCoveredQueries(text);
  if (queryList.length > 0) return queryList;
  const fallback = [plan.goal, stage.intent].map(cleanQuery).filter(Boolean);
  return uniqueStrings(fallback);
}

function inferGmailCategorizationTarget(
  plan: WorkflowPlanDsl,
  stage: WorkflowPlanDslStage,
  userRequest: string | undefined,
  options: { defaultMaxItems: number; maxItemsLimit: number },
):
  | {
      query: string;
      accountId?: string;
      maxItems: number;
      pageSize: number;
      maxPages: number;
      maxConcurrency: number;
      maxCategories: number;
      chunkSize: number;
      maxChunks: number;
      detailFormat: string;
    }
  | undefined {
  const text = [userRequest, plan.goal, plan.summary, stage.intent, ...(plan.evidenceNeeded ?? []), ...(stage.evidenceNeeded ?? []), ...(plan.transformations ?? []), ...(stage.transformations ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const explicitConnector = stringInputAny(stage.inputs, ["connectorId", "connector"]) === "google.gmail";
  if (!explicitConnector && !/\b(?:gmail|mailbox|emails?|messages?|threads?)\b/i.test(text)) return undefined;
  const requestedMaxItems = numberInputAny(
    stage.inputs,
    ["maxMessages", "messageCount", "maxThreads", "threadCount", "maxItems", "limit"],
    extractGmailItemLimit(text) ?? options.defaultMaxItems,
  );
  const maxItems = boundedNumber(Math.min(requestedMaxItems, plan.budgetPolicy?.maxItems ?? requestedMaxItems), 1, options.maxItemsLimit);
  const requestedPageSize = numberInputAny(stage.inputs, ["pageSize", "maxResults"], extractBoundedNumberFromText(text, "pageSize", Math.min(maxItems, 100)));
  const pageSize = boundedNumber(requestedPageSize, 1, Math.min(100, options.maxItemsLimit));
  const requestedMaxPages = numberInputAny(stage.inputs, ["maxPages", "pageCount"], extractBoundedNumberFromText(text, "maxPages", Math.ceil(maxItems / pageSize)));
  const maxPages = boundedNumber(requestedMaxPages, 1, Math.max(1, Math.ceil(maxItems / pageSize)));
  const maxConcurrency = boundedNumber(numberInputAny(stage.inputs, ["maxConcurrency", "concurrency"], extractBoundedNumberFromText(text, "maxConcurrency", 4)), 1, 4);
  const maxCategories = boundedNumber(numberInputAny(stage.inputs, ["maxCategories", "categoryCount", "bucketCount"], extractMaxCategoryCount(text) ?? 7), 1, 12);
  const chunkSize = boundedNumber(numberInputAny(stage.inputs, ["chunkSize"], extractChunkSize(text) ?? 25), 1, Math.max(1, maxItems));
  const maxChunks = boundedNumber(Math.ceil(maxItems / chunkSize), 1, Math.ceil(options.maxItemsLimit / Math.max(1, chunkSize)));
  const query = stringInputAny(stage.inputs, ["query", "gmailQuery", "searchQuery"]) ?? extractGmailQuery(text) ?? "";
  const accountId = stringInputAny(stage.inputs, ["accountId", "account"]) ?? (/\bdefault\s+(?:gmail|google|account)\b/i.test(text) ? "default" : undefined);
  const detailFormat = stringInputAny(stage.inputs, ["format", "detailFormat", "threadFormat"]) ?? (/metadata/i.test(text) ? "metadata" : "metadata");
  return { query, accountId, maxItems, pageSize, maxPages, maxConcurrency, maxCategories, chunkSize, maxChunks, detailFormat };
}

function inferLocalClassificationTarget(
  plan: WorkflowPlanDsl,
  stage: WorkflowPlanDslStage,
  userRequest?: string,
): { mode: "files"; paths: string[] } | { mode: "directory"; directory: string; maxEntries: number; maxDepth: number } | undefined {
  const text = [userRequest, plan.goal, plan.summary, stage.intent, ...(plan.evidenceNeeded ?? []), ...(stage.evidenceNeeded ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const explicitDirectory = stringInputAny(stage.inputs, ["directory", "directoryPath", "folder", "folderPath", "root", "rootPath"]);
  const inferredDirectory = explicitDirectory ?? extractLocalDirectoryPath(text);
  const metadataOnly = booleanInput(stage.inputs, "metadataOnly") === true || /\bmetadata\s+only\b/i.test(text) || /\blocal_directory_list\b/i.test(text);
  if (inferredDirectory && (metadataOnly || !stringArrayInputAny(stage.inputs, ["paths", "files", "filePaths", "sourceFiles"]).length)) {
    return {
      mode: "directory",
      directory: inferredDirectory,
      maxEntries: boundedNumber(numberInputAny(stage.inputs, ["maxEntries", "entryLimit", "maxItems"], extractBoundedNumberFromText(text, "maxEntries", 40)), 1, 500),
      maxDepth: boundedNumber(numberInputAny(stage.inputs, ["maxDepth", "depth"], extractBoundedNumberFromText(text, "maxDepth", 2)), 0, 6),
    };
  }

  const paths = uniqueStrings([
    ...stringArrayInputAny(stage.inputs, ["paths", "files", "filePaths", "sourceFiles"]),
    ...extractLocalFilePaths(text),
  ]);
  return paths.length ? { mode: "files", paths } : undefined;
}

function extractGmailItemLimit(text: string): number | undefined {
  const patterns = [
    /\b(?:latest|last|recent|most\s+recent)\s+(\d{1,4})\s+(?:gmail\s+)?(?:messages?|emails?|threads?)\b/i,
    /\b(\d{1,4})\s+(?:gmail\s+)?(?:messages?|emails?|threads?)\b/i,
    /\bmaxItems\b[^0-9]{0,30}(\d{1,4})\b/i,
    /\bmaxMessages\b[^0-9]{0,30}(\d{1,4})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function extractMaxCategoryCount(text: string): number | undefined {
  const match = text.match(/\b(?:up\s+to|no\s+more\s+than|max(?:imum)?)\s+(\d{1,2})\s+(?:useful\s+)?(?:read-only\s+)?(?:categories|buckets)\b/i);
  return match ? Number(match[1]) : undefined;
}

function extractChunkSize(text: string): number | undefined {
  const match = text.match(/\bchunks?\s+(?:of|with|about|around)?\s*(\d{1,3})\s+(?:records?|messages?|items?)\b/i);
  return match ? Number(match[1]) : undefined;
}

function extractGmailQuery(text: string): string | undefined {
  const quoted = text.match(/\bgmail\s+(?:query|search)\s+(?:is|:)\s+["']([^"']+)["']/i)?.[1];
  if (quoted !== undefined) return quoted.trim();
  const newerThan = text.match(/\bnewer_than:\d+[dwmy]\b/i)?.[0];
  return newerThan;
}

function inferVisualBatchTarget(
  plan: WorkflowPlanDsl,
  stage: WorkflowPlanDslStage,
  userRequest?: string,
): { directory: string; maxEntries: number; maxDepth: number; maxImages: number; maxConcurrency: number; imageExtensions: string[]; namePrefixes: string[] } | undefined {
  const text = [userRequest, plan.goal, plan.summary, stage.intent, ...(plan.evidenceNeeded ?? []), ...(stage.evidenceNeeded ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const directory = stringInputAny(stage.inputs, ["directory", "directoryPath", "folder", "folderPath", "root", "rootPath"]) ?? extractVisualDirectoryPath(text);
  if (!directory) return undefined;
  const maxImages = boundedNumber(
    numberInputAny(stage.inputs, ["maxImages", "imageCount", "maxItems", "limit"], extractExactImageCount(text) ?? extractBoundedNumberFromText(text, "maxItems", 10)),
    1,
    40,
  );
  const maxEntries = boundedNumber(numberInputAny(stage.inputs, ["maxEntries", "entryLimit"], extractBoundedNumberFromText(text, "maxEntries", 40)), maxImages, 500);
  const maxDepth = boundedNumber(numberInputAny(stage.inputs, ["maxDepth", "depth"], extractBoundedNumberFromText(text, "maxDepth", 1)), 0, 6);
  const maxConcurrency = boundedNumber(numberInputAny(stage.inputs, ["maxConcurrency", "concurrency"], 4), 1, 4);
  const explicitExtensions = uniqueStrings([
    ...stringArrayInputAny(stage.inputs, ["imageExtensions", "extensions", "fileExtensions"]),
    ...(stringInputAny(stage.inputs, ["extension", "fileExtension"]) ? [stringInputAny(stage.inputs, ["extension", "fileExtension"])!] : []),
  ]);
  const imageExtensions = explicitExtensions.length ? explicitExtensions.map(normalizeFileExtension) : inferImageExtensions(text);
  const explicitPrefixes = uniqueStrings([
    ...stringArrayInputAny(stage.inputs, ["namePrefixes", "includeNamePrefixes", "prefixes"]),
    ...(stringInputAny(stage.inputs, ["namePrefix", "includeNamePrefix", "prefix"]) ? [stringInputAny(stage.inputs, ["namePrefix", "includeNamePrefix", "prefix"])!] : []),
  ]);
  const namePrefixes = explicitPrefixes.length ? explicitPrefixes : extractImageNamePrefixes(text);
  return {
    directory,
    maxEntries,
    maxDepth,
    maxImages,
    maxConcurrency,
    imageExtensions: imageExtensions.length ? uniqueStrings(imageExtensions.map(normalizeFileExtension)) : [".png", ".jpg", ".jpeg", ".webp"],
    namePrefixes,
  };
}

function extractCoveredQueries(text: string): string[] {
  const coverMatch = text.match(/\b(?:pagequeries|queries|searches|source queries)\b[\s\S]{0,160}?\bcover\s+([^.\n]+)(?:\.|\n|$)/i);
  const source = coverMatch?.[1];
  if (!source) return [];
  return uniqueStrings(
    source
      .replace(/\bdocumentation\b/gi, "")
      .split(/\s+(?:and|or)\s+|[,;]/)
      .map(cleanQuery)
      .filter(Boolean),
  );
}

function extractLocalFilePaths(text: string): string[] {
  const matches = text.matchAll(/(?<![A-Za-z][A-Za-z0-9+.-]*:\/\/)\b((?:\.{1,2}\/|\/|[A-Za-z0-9_.-]+\/)[^\s"'<>`]+?\.(?:md|markdown|txt|json|csv|html|docx|pptx|xlsx))\b/gi);
  return uniqueStrings([...matches].map((match) => trimPathToken(match[1])).filter(Boolean));
}

function extractLocalDirectoryPath(text: string): string | undefined {
  const quoted = text.match(/\b(?:directory|folder)\s+(?:at|path|is|:)\s+["']([^"']+)["']/i)?.[1];
  if (quoted) return trimPathToken(quoted);
  const unquoted = text.match(/\b(?:directory|folder)\s+(?:at|path|is|:)\s+((?:~|\/|\.{1,2}\/)[^\n]+?)(?=\.\s+[A-Z]|\n|$)/i)?.[1];
  if (unquoted) return trimPathToken(unquoted);
  if (/\bDownloads\b/i.test(text) && /\blocal_directory_list\b|\bmetadata\s+only\b/i.test(text)) return "~/Downloads";
  return undefined;
}

function extractVisualDirectoryPath(text: string): string | undefined {
  return extractLocalDirectoryPath(text) ?? (/\bDownloads\b/i.test(text) && /\bimage|png|jpg|jpeg|screenshot|visual/i.test(text) ? "~/Downloads" : undefined);
}

function extractExactImageCount(text: string): number | undefined {
  const exactImage = text.match(/\bexactly\s+(\d{1,3})\s+(?:visible\s+)?(?:png\s+|jpg\s+|jpeg\s+|webp\s+)?images?\b/i);
  if (exactImage) return Number(exactImage[1]);
  const selectedImage = text.match(/\b(\d{1,3})\s+(?:selected\s+)?(?:visible\s+)?(?:png\s+|jpg\s+|jpeg\s+|webp\s+)?images?\b/i);
  return selectedImage ? Number(selectedImage[1]) : undefined;
}

function inferImageExtensions(text: string): string[] {
  const extensions: string[] = [];
  if (/\bpng\b/i.test(text)) extensions.push(".png");
  if (/\bjpe?g\b/i.test(text)) extensions.push(".jpg", ".jpeg");
  if (/\bwebp\b/i.test(text)) extensions.push(".webp");
  return extensions.length ? uniqueStrings(extensions) : [".png", ".jpg", ".jpeg", ".webp"];
}

function extractImageNamePrefixes(text: string): string[] {
  const prefixes = [...text.matchAll(/\b(?:names?|files?)\s+(?:start|starts|starting|begin|begins|beginning)\s+with\s+["']?([A-Za-z0-9_.-]+)["']?/gi)]
    .map((match) => trimPathToken(match[1]))
    .filter(Boolean);
  return uniqueStrings(prefixes);
}

function normalizeFileExtension(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function extractBoundedNumberFromText(text: string, name: string, fallback: number): number {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`\\b${escapedName}\\b[^0-9]{0,30}(\\d{1,5})`, "i"));
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function extractArtifactPath(text: string | undefined): string | undefined {
  const match = text?.match(/\b((?:Documents|Desktop|Downloads|\.\/|\/)[^\s"'<>`]+?\.(?:md|markdown|html|pdf|txt|csv|json))\b/i);
  return match?.[1];
}

function isStagedWriteRequested(plan: WorkflowPlanDsl, stage: WorkflowPlanDslStage, userRequest?: string): boolean {
  const text = [userRequest, plan.goal, plan.summary, stage.intent, ...(plan.transformations ?? []), ...(stage.transformations ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLowerCase();
  return /\bstag(?:e|ed|ing)\b/.test(text) || /\bapproval\b/.test(text) || /\bapprove\b/.test(text);
}

function compactWorkflowValueRecord(record: Record<string, WorkflowProgramValue | undefined>): Record<string, WorkflowProgramValue> {
  const output: Record<string, WorkflowProgramValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) output[key] = value;
  }
  return output;
}

function schemaTypeForField(field: string): string {
  if (/count|total|bytes|chars/i.test(field)) return "number";
  if (/urls|citations|sources|items|steps|sentences|examples|findings|categories|assignments|observations/i.test(field)) return "array";
  if (/ok|approved|complete|succeeded/i.test(field)) return "boolean";
  return "string";
}

function defaultModelCallBudget(nodes: WorkflowProgramNode[]): number {
  return (
    nodes.reduce((sum, node) => {
      if (node.kind === "model.call") return sum + 1;
      if (node.kind === "model.map") return sum + (node.maxItems ?? 1);
      if (node.kind === "model.reduce") return sum + modelReduceCallBudget(node);
      return sum;
    }, 0) || 1
  );
}

function modelReduceCallBudget(node: Extract<WorkflowProgramNode, { kind: "model.reduce" }>): number {
  if (node.strategy !== "tree") return 1;
  const maxFanIn = boundedNumber(node.maxFanIn ?? 8, 2, 64);
  const maxLevels = boundedNumber(node.maxLevels ?? 8, 1, 12);
  let current = Math.max(0, Math.floor(node.maxInputItems));
  let calls = 0;
  let level = 0;
  while (current > maxFanIn && level < maxLevels) {
    const groups = Math.ceil(current / maxFanIn);
    calls += groups;
    current = groups;
    level += 1;
  }
  return calls + 1;
}

function defaultToolCallBudget(nodes: WorkflowProgramNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.kind === "tool.call" || node.kind === "mutation.stage") return sum + 1;
    if (node.kind === "tool.paginate") return sum + node.maxPages;
    if (node.kind === "browser.intervention") return sum + 2 + (node.screenshot && node.screenshot.enabled !== false ? 1 : 0);
    if (node.kind === "loop.map" && typeof node.map === "object" && node.map && !Array.isArray(node.map) && (node.map as { kind?: unknown }).kind === "tool.call") {
      return sum + (node.maxItems ?? 1000);
    }
    return sum;
  }, 0);
}

function defaultConnectorCallBudget(nodes: WorkflowProgramNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.kind === "connector.call") return sum + 1;
    if (node.kind === "connector.paginate") return sum + node.maxPages;
    if (node.kind === "connector.map") return sum + (node.maxItems ?? 1000);
    return sum;
  }, 0);
}

function stringArrayInput(inputs: Record<string, unknown> | undefined, key: string): string[] {
  const value = inputs?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function stringInput(inputs: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = inputs?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanQuery(value: string | undefined): string {
  return (value ?? "")
    .replace(/\b(?:the\s+)?(?:two|three|four|five|six|ten)\s+pagequeries\s+must\s+cover\b/gi, "")
    .replace(/\bdocumentation\b/gi, "")
    .replace(/\b(?:exactly|about|for|covering|cover)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:,-]+|[\s:,-]+$/g, "")
    .trim();
}

function numberInput(inputs: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = inputs?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function numberInputAny(inputs: Record<string, unknown> | undefined, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = inputs?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return fallback;
}

function stringArrayInputAny(inputs: Record<string, unknown> | undefined, keys: string[]): string[] {
  return keys.flatMap((key) => stringArrayInput(inputs, key));
}

function stringInputAny(inputs: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringInput(inputs, key);
    if (value) return value;
  }
  return undefined;
}

function booleanInput(inputs: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = inputs?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function boundedNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function trimPathToken(value: string | undefined): string {
  return (value ?? "").trim().replace(/[),.;:]+$/g, "");
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function errorDiagnostic(code: string, message: string, path: string, nodeId?: string): WorkflowProgramDiagnostic {
  return { code, severity: "error", message, path, ...(nodeId ? { nodeId } : {}) };
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
