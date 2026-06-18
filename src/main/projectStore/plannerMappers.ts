import type {
  PlannerDecisionAnswer,
  PlannerDecisionOption,
  PlannerDecisionQuestion,
  PlannerDiagramKind,
  PlannerDiagramSpec,
  PlannerDurableArtifactValidationResult,
  PlannerPlanArtifact,
  PlannerPlanArtifactStatus,
  PlannerPlanFinalizationAttempt,
  PlannerPlanFinalizationAttemptStatus,
  PlannerPlanStep,
  PlannerPlanWorkflowState
} from "../../shared/plannerTypes";

export interface PlannerDecisionQuestionRow {
  id: string;
  artifact_id: string;
  question_order: number;
  question: string;
  recommended_option_id: string;
  required: number;
  options_json: string;
  answer_kind: PlannerDecisionAnswer["kind"] | null;
  answer_option_id: string | null;
  answer_custom_text: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlannerPlanArtifactRow {
  id: string;
  thread_id: string;
  source_message_id: string;
  status: PlannerPlanArtifactStatus;
  workflow_state: PlannerPlanWorkflowState;
  finalization_attempt_json: string | null;
  durable_artifact_path: string | null;
  durable_artifact_generated_at: string | null;
  durable_artifact_validation_json: string | null;
  title: string;
  summary: string;
  content: string;
  steps_json: string;
  open_questions_json: string;
  risks_json: string;
  verification_json: string;
  diagrams_json: string | null;
  warnings_json: string | null;
  created_at: string;
  updated_at: string;
}

const plannerPlanWorkflowStates = new Set<PlannerPlanWorkflowState>([
  "draft",
  "questions_pending",
  "answers_complete",
  "finalizing",
  "durable_generating",
  "validating",
  "repairing",
  "durable_ready",
  "durable_ready_with_fallbacks",
  "failed",
]);
const plannerPlanFinalizationAttemptStatuses = new Set<PlannerPlanFinalizationAttemptStatus>([
  "running",
  "failed",
  "completed",
]);
const plannerDiagramKinds = new Set<PlannerDiagramKind>(["architecture", "dependencies", "program_flow", "functional_nonfunctional", "custom"]);

export function mapPlannerDecisionQuestionRow(row: PlannerDecisionQuestionRow, index: number): PlannerDecisionQuestion {
  const options = parsePlannerDecisionOptions(row.options_json);
  const recommendedOptionId = options.some((option) => option.id === row.recommended_option_id)
    ? row.recommended_option_id
    : options[0]?.id || `option-${index + 1}`;
  return {
    id: row.id,
    question: row.question,
    recommendedOptionId,
    required: row.required === 1,
    options,
    ...(row.answer_kind && row.answered_at
      ? {
          answer:
            row.answer_kind === "custom"
              ? {
                  kind: "custom" as const,
                  customText: row.answer_custom_text ?? "",
                  answeredAt: row.answered_at,
                }
              : {
                  kind: "option" as const,
                  optionId: row.answer_option_id ?? "",
                  answeredAt: row.answered_at,
                },
        }
      : {}),
  };
}

export function mapPlannerPlanArtifactRow(
  row: PlannerPlanArtifactRow,
  decisionQuestions: PlannerDecisionQuestion[],
): PlannerPlanArtifact {
  return {
    id: row.id,
    threadId: row.thread_id,
    sourceMessageId: row.source_message_id,
    status: row.status,
    workflowState: normalizePlannerPlanWorkflowState(row.workflow_state, decisionQuestions),
    finalizationAttempt: normalizePlannerPlanFinalizationAttempt(
      row.finalization_attempt_json ? parseJsonObject<Record<string, unknown>>(row.finalization_attempt_json, {}) : undefined,
    ),
    durableArtifactPath: row.durable_artifact_path ?? undefined,
    durableArtifactGeneratedAt: row.durable_artifact_generated_at ?? undefined,
    durableArtifactValidation: row.durable_artifact_validation_json
      ? parsePlannerDurableArtifactValidation(row.durable_artifact_validation_json)
      : undefined,
    title: row.title,
    summary: row.summary,
    content: row.content,
    steps: parsePlannerPlanSteps(row.steps_json),
    openQuestions: parseStringList(row.open_questions_json),
    risks: parseStringList(row.risks_json),
    verification: parseStringList(row.verification_json),
    diagrams: parsePlannerDiagramSpecs(row.diagrams_json ?? "[]"),
    warnings: parseStringList(row.warnings_json ?? "[]"),
    decisionQuestions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parsePlannerDecisionOptions(value: string): PlannerDecisionOption[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index): PlannerDecisionOption | undefined => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
        const record = item as Record<string, unknown>;
        const label = typeof record.label === "string" ? record.label.trim() : "";
        if (!label) return undefined;
        return {
          id:
            typeof record.id === "string" && record.id.trim()
              ? record.id.trim()
              : label
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "") || `option-${index + 1}`,
          label,
          description: typeof record.description === "string" ? record.description.trim() : "",
        };
      })
      .filter((item): item is PlannerDecisionOption => Boolean(item));
  } catch {
    return [];
  }
}

export function plannerPlanWorkflowStateForQuestions(questions: PlannerDecisionQuestion[]): PlannerPlanWorkflowState {
  if (!questions.length) return "draft";
  return questions.every((question) => !question.required || Boolean(question.answer)) ? "answers_complete" : "questions_pending";
}

function normalizePlannerPlanWorkflowState(value: unknown, questions: PlannerDecisionQuestion[]): PlannerPlanWorkflowState {
  if (typeof value === "string" && plannerPlanWorkflowStates.has(value as PlannerPlanWorkflowState)) {
    if (value !== "draft" || questions.length === 0) return value as PlannerPlanWorkflowState;
  }
  return plannerPlanWorkflowStateForQuestions(questions);
}

function normalizePlannerPlanFinalizationAttempt(value: unknown): PlannerPlanFinalizationAttempt | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : undefined;
  const status =
    typeof record.status === "string" && plannerPlanFinalizationAttemptStatuses.has(record.status as PlannerPlanFinalizationAttemptStatus)
      ? (record.status as PlannerPlanFinalizationAttemptStatus)
      : undefined;
  const startedAt = typeof record.startedAt === "string" && record.startedAt.trim() ? record.startedAt.trim() : undefined;
  if (!id || !status || !startedAt) return undefined;
  const completedAt = typeof record.completedAt === "string" && record.completedAt.trim() ? record.completedAt.trim() : undefined;
  const error = typeof record.error === "string" && record.error.trim() ? record.error.trim().slice(0, 1000) : undefined;
  return {
    id,
    status,
    startedAt,
    ...(completedAt ? { completedAt } : {}),
    ...(error ? { error } : {}),
  };
}

function warnCorruptPlannerJson(parser: string, json: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[planner-store] ${parser}: corrupted persisted JSON treated as empty (${reason}): ${json.slice(0, 200)}`);
}

function parseJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch (error) {
    warnCorruptPlannerJson("parseJsonObject", json, error);
    return fallback;
  }
}

function parseStringList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch (error) {
    warnCorruptPlannerJson("parseStringList", value, error);
    return [];
  }
}

function parsePlannerPlanSteps(value: string): PlannerPlanStep[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index): PlannerPlanStep | undefined => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
        const record = item as Record<string, unknown>;
        if (typeof record.title !== "string" || !record.title.trim()) return undefined;
        return {
          id: typeof record.id === "string" && record.id.trim() ? record.id : `step-${index + 1}`,
          title: record.title,
          ...(typeof record.detail === "string" && record.detail.trim() ? { detail: record.detail } : {}),
        };
      })
      .filter((item): item is PlannerPlanStep => Boolean(item));
  } catch {
    return [];
  }
}

function parsePlannerDiagramSpecs(value: string): PlannerDiagramSpec[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): PlannerDiagramSpec | undefined => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
        const record = item as Record<string, unknown>;
        if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.kind !== "string") return undefined;
        const nodes = Array.isArray(record.nodes)
          ? record.nodes
              .map((node): PlannerDiagramSpec["nodes"][number] | undefined => {
                if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;
                const nodeRecord = node as Record<string, unknown>;
                if (typeof nodeRecord.id !== "string" || typeof nodeRecord.label !== "string") return undefined;
                return {
                  id: nodeRecord.id,
                  label: nodeRecord.label,
                  ...(typeof nodeRecord.role === "string" ? { role: nodeRecord.role } : {}),
                };
              })
              .filter((node): node is PlannerDiagramSpec["nodes"][number] => Boolean(node))
          : [];
        if (!nodes.length) return undefined;
        const nodeIds = new Set(nodes.map((node) => node.id));
        const edges = Array.isArray(record.edges)
          ? record.edges
              .map((edge): PlannerDiagramSpec["edges"][number] | undefined => {
                if (!edge || typeof edge !== "object" || Array.isArray(edge)) return undefined;
                const edgeRecord = edge as Record<string, unknown>;
                if (typeof edgeRecord.from !== "string" || typeof edgeRecord.to !== "string") return undefined;
                if (!nodeIds.has(edgeRecord.from) || !nodeIds.has(edgeRecord.to)) return undefined;
                return {
                  from: edgeRecord.from,
                  to: edgeRecord.to,
                  ...(typeof edgeRecord.label === "string" ? { label: edgeRecord.label } : {}),
                };
              })
              .filter((edge): edge is PlannerDiagramSpec["edges"][number] => Boolean(edge))
          : [];
        return {
          id: record.id,
          title: record.title,
          kind: isPlannerDiagramKind(record.kind) ? record.kind : "custom",
          ...(typeof record.purpose === "string" ? { purpose: record.purpose } : {}),
          nodes,
          edges,
          ...(typeof record.layoutHint === "string" ? { layoutHint: record.layoutHint } : {}),
          ...(typeof record.fallbackSummary === "string" ? { fallbackSummary: record.fallbackSummary } : {}),
        };
      })
      .filter((item): item is PlannerDiagramSpec => Boolean(item));
  } catch {
    return [];
  }
}

function parsePlannerDurableArtifactValidation(value: string): PlannerDurableArtifactValidationResult | undefined {
  const parsed = parseJsonObject<Partial<PlannerDurableArtifactValidationResult>>(value, {});
  if (typeof parsed.ok !== "boolean" || typeof parsed.checkedAt !== "string") return undefined;
  return {
    ok: parsed.ok,
    checkedAt: parsed.checkedAt,
    errors: parsePlannerDurableValidationIssues(parsed.errors),
    warnings: parsePlannerDurableValidationIssues(parsed.warnings),
  };
}

function parsePlannerDurableValidationIssues(value: unknown): PlannerDurableArtifactValidationResult["errors"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): PlannerDurableArtifactValidationResult["errors"][number] | undefined => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
      const record = item as Record<string, unknown>;
      if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
      return {
        code: record.code,
        message: record.message,
        ...(typeof record.section === "string" ? { section: record.section } : {}),
      };
    })
    .filter((item): item is PlannerDurableArtifactValidationResult["errors"][number] => Boolean(item));
}

function isPlannerDiagramKind(value: string): value is PlannerDiagramKind {
  return plannerDiagramKinds.has(value as PlannerDiagramKind);
}
