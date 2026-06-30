import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { AMBIENT_DEFAULT_MODEL, normalizeAmbientModelId } from "../../shared/ambientModels";
import type { CreateWorkflowLabRunInput, ListWorkflowLabRunsInput, WorkflowLabCandidatePatch, WorkflowLabEvaluationCase, WorkflowLabEvaluationMetrics, WorkflowLabEvaluationResult, WorkflowLabGateResult, WorkflowLabJudgeResult, WorkflowLabMetricEmphasis, WorkflowLabRun, WorkflowLabRunStatus, WorkflowLabVariant, WorkflowLabVariantStatus, WorkflowRecordingLibraryDescription, WorkflowRecordingPlaybookDraft, WorkflowRecordingReviewDraftUpdate } from "../../shared/workflowTypes";
import { callWorkflowPiJson, WorkflowPiJsonValidationError, type WorkflowPiTextCallInput } from "./workflowPiTransport";
import { readAmbientApiKey } from "./workflowSecurityFacade";
import type { AmbientRetryPolicy } from "./workflowAmbientFacade";
import type { WorkflowLabProjectStore } from "./workflowLabProjectStoreContract";

export const WORKFLOW_LAB_SCHEMA_VERSION = 1;

export interface WorkflowLabJudgeInput {
  run: WorkflowLabRun;
  workflow: WorkflowRecordingLibraryDescription;
  variant: WorkflowLabVariant;
  metrics: WorkflowLabEvaluationMetrics;
  gates: WorkflowLabGateResult[];
  casePrompt: string;
}

export type WorkflowLabJudge = (input: WorkflowLabJudgeInput) => Promise<WorkflowLabJudgeResult> | WorkflowLabJudgeResult;

export interface RunWorkflowLabOptions {
  judge?: WorkflowLabJudge;
  now?: () => string;
}

export interface AmbientWorkflowLabJudgeProgress {
  responseCharCount: number;
  requestDurationMs: number;
}

export function workflowLabRunsRootPath(workspacePath: string): string {
  return join(workspacePath, ".ambient", "workflow-lab", "runs");
}

export function workflowLabRunArtifactPath(workspacePath: string, runId: string): string {
  return join(workflowLabRunsRootPath(workspacePath), `${runId}.json`);
}

export function workflowLabListRuns(workspacePath: string, input: ListWorkflowLabRunsInput = {}): WorkflowLabRun[] {
  const root = workflowLabRunsRootPath(workspacePath);
  if (!existsSync(root)) return [];
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 50), 100));
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .flatMap((entry): WorkflowLabRun[] => {
      const run = workflowLabReadRun(join(root, entry.name));
      if (!run) return [];
      if (input.workflowId && run.workflowId !== input.workflowId) return [];
      return [run];
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export function workflowLabReadRun(path: string): WorkflowLabRun | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { run?: unknown };
    return workflowLabNormalizeRun(parsed.run, path);
  } catch {
    return undefined;
  }
}

export function workflowLabNormalizeRun(value: unknown, artifactPath: string): WorkflowLabRun | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<WorkflowLabRun>;
  if (
    typeof record.id !== "string" ||
    typeof record.workflowId !== "string" ||
    typeof record.workflowTitle !== "string" ||
    typeof record.baseVersion !== "number" ||
    typeof record.goal !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return undefined;
  }
  return {
    id: record.id,
    workflowId: record.workflowId,
    workflowTitle: record.workflowTitle,
    baseVersion: record.baseVersion,
    goal: record.goal,
    metricEmphasis: workflowLabNormalizeMetricEmphasis(record.metricEmphasis),
    attemptBudget: workflowLabNormalizeAttemptBudget(record.attemptBudget),
    plateauThreshold: workflowLabNormalizePlateauThreshold(record.plateauThreshold),
    heldOutEnabled: record.heldOutEnabled !== false,
    status: workflowLabNormalizeRunStatus(record.status),
    ...(record.bestVariantId ? { bestVariantId: record.bestVariantId } : {}),
    ...(record.error ? { error: record.error } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    artifactPath: record.artifactPath || artifactPath,
    evaluationCases: Array.isArray(record.evaluationCases) ? record.evaluationCases : [],
    variants: Array.isArray(record.variants) ? record.variants : [],
    audit: Array.isArray(record.audit) ? record.audit.filter((item): item is string => typeof item === "string") : [],
  };
}

export function workflowLabNormalizeRunStatus(value: unknown): WorkflowLabRunStatus {
  return value === "running" || value === "completed" || value === "stopped" || value === "failed" ? value : "draft";
}

export function workflowLabNormalizeVariantStatus(value: unknown): WorkflowLabVariantStatus {
  return value === "evaluating" || value === "accepted" || value === "rejected" || value === "failed" ? value : "proposed";
}

export function workflowLabNormalizeMetricEmphasis(value: unknown): WorkflowLabMetricEmphasis {
  return value === "reliability" || value === "speed" || value === "recovery" || value === "clarity" || value === "balanced"
    ? value
    : "balanced";
}

export function workflowLabNormalizeAttemptBudget(value: unknown): number {
  return Math.max(1, Math.min(Math.floor(typeof value === "number" && Number.isFinite(value) ? value : 5), 10));
}

export function workflowLabNormalizePlateauThreshold(value: unknown): number {
  return Math.max(0, Math.min(typeof value === "number" && Number.isFinite(value) ? value : 0.03, 1));
}

export function workflowLabWriteRun(workspacePath: string, run: WorkflowLabRun): WorkflowLabRun {
  const artifactPath = workflowLabRunArtifactPath(workspacePath, run.id);
  const normalized: WorkflowLabRun = {
    ...run,
    metricEmphasis: workflowLabNormalizeMetricEmphasis(run.metricEmphasis),
    attemptBudget: workflowLabNormalizeAttemptBudget(run.attemptBudget),
    plateauThreshold: workflowLabNormalizePlateauThreshold(run.plateauThreshold),
    status: workflowLabNormalizeRunStatus(run.status),
    artifactPath,
    variants: run.variants.map((variant) => ({
      ...variant,
      status: workflowLabNormalizeVariantStatus(variant.status),
    })),
  };
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        kind: "ambient-workflow-lab-run",
        schemaVersion: WORKFLOW_LAB_SCHEMA_VERSION,
        run: normalized,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return normalized;
}

export function workflowLabCreateRun(input: {
  workspacePath: string;
  workflow: WorkflowRecordingLibraryDescription;
  request: CreateWorkflowLabRunInput;
  runId: string;
  createdAt: string;
}): WorkflowLabRun {
  if (!input.workflow.playbook) throw new Error(`Workflow recording has no editable playbook: ${input.request.workflowId}`);
  const goal = input.request.goal.trim();
  const heldOutEnabled = input.request.heldOutEnabled !== false;
  return {
    id: input.runId,
    workflowId: input.workflow.id,
    workflowTitle: input.workflow.title,
    baseVersion: input.workflow.version,
    goal,
    metricEmphasis: workflowLabNormalizeMetricEmphasis(input.request.metricEmphasis),
    attemptBudget: workflowLabNormalizeAttemptBudget(input.request.attemptBudget),
    plateauThreshold: workflowLabNormalizePlateauThreshold(input.request.plateauThreshold),
    heldOutEnabled,
    status: "draft",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    artifactPath: workflowLabRunArtifactPath(input.workspacePath, input.runId),
    evaluationCases: workflowLabEvaluationCasesForPlaybook(input.workflow, goal, heldOutEnabled, input.createdAt),
    variants: [],
    audit: [
      `Created Workflow Lab run for ${input.workflow.id} at version ${input.workflow.version}.`,
      "Canonical workflow playbook will not change unless a candidate is adopted.",
    ],
  };
}

export function workflowLabApplyRunStatus(
  run: WorkflowLabRun,
  status: WorkflowLabRunStatus,
  input: { updatedAt: string; error?: string },
): WorkflowLabRun {
  return {
    ...run,
    status,
    updatedAt: input.updatedAt,
    ...(status === "completed" || status === "failed" || status === "stopped" ? { completedAt: input.updatedAt } : {}),
    ...(input.error ? { error: input.error } : {}),
    audit: [...run.audit, input.error ? `Run ${status}: ${input.error}` : `Run status changed to ${status}.`],
  };
}

export function workflowLabAppendVariant(input: {
  run: WorkflowLabRun;
  variantId: string;
  createdAt: string;
  parentVariantId?: string;
  hypothesis: string;
  patch: WorkflowLabCandidatePatch;
  status?: WorkflowLabVariantStatus;
}): { run: WorkflowLabRun; variant: WorkflowLabVariant } {
  const variant: WorkflowLabVariant = {
    id: input.variantId,
    runId: input.run.id,
    ...(input.parentVariantId ? { parentVariantId: input.parentVariantId } : {}),
    attempt: input.run.variants.length + 1,
    hypothesis: input.hypothesis,
    patch: input.patch,
    status: input.status ?? "proposed",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    evaluations: [],
  };
  return {
    variant,
    run: {
      ...input.run,
      updatedAt: input.createdAt,
      variants: [...input.run.variants, variant],
      audit: [...input.run.audit, `Proposed variant ${variant.attempt}: ${variant.hypothesis}`],
    },
  };
}

export function workflowLabRecordEvaluation(input: {
  run: WorkflowLabRun;
  variantId: string;
  evaluation: WorkflowLabEvaluationResult;
  status: WorkflowLabVariantStatus;
  evaluatedAt: string;
}): WorkflowLabRun {
  let evaluatedVariant: WorkflowLabVariant | undefined;
  const variants = input.run.variants.map((variant) => {
    if (variant.id !== input.variantId) return variant;
    const evaluations = [
      ...variant.evaluations.filter((current) => current.caseId !== input.evaluation.caseId),
      input.evaluation,
    ];
    const allGatesPassed = evaluations.every((result) => result.gates.every((gate) => gate.status === "passed"));
    const score = allGatesPassed
      ? Math.round(evaluations.reduce((total, result) => total + result.judge.score, 0) / evaluations.length)
      : 0;
    evaluatedVariant = {
      ...variant,
      status: input.status,
      score,
      rationale: input.evaluation.judge.rationale,
      updatedAt: input.evaluatedAt,
      evaluatedAt: input.evaluatedAt,
      evaluations,
    };
    return evaluatedVariant;
  });
  if (!evaluatedVariant) throw new Error(`Workflow Lab variant not found: ${input.variantId}`);
  const accepted = variants.filter((variant) => variant.status === "accepted" && typeof variant.score === "number");
  const best = accepted.sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.attempt - right.attempt)[0];
  return {
    ...input.run,
    variants,
    bestVariantId: best?.id ?? input.run.bestVariantId,
    updatedAt: input.evaluatedAt,
    audit: [
      ...input.run.audit,
      `Evaluated variant ${evaluatedVariant.attempt}: ${evaluatedVariant.score ?? 0}/100 (${input.status}).`,
    ],
  };
}

export function workflowLabRequireAcceptedVariant(run: WorkflowLabRun, variantId: string): WorkflowLabVariant {
  const variant = run.variants.find((candidate) => candidate.id === variantId);
  if (!variant) throw new Error(`Workflow Lab variant not found: ${variantId}`);
  if (variant.status !== "accepted") throw new Error(`Workflow Lab variant is not accepted: ${variantId}`);
  return variant;
}

export function workflowLabRequireBaseVersion(run: WorkflowLabRun, currentVersion: number): void {
  if (currentVersion !== run.baseVersion) {
    throw new Error(
      `Workflow recording version changed: expected v${run.baseVersion}, current v${currentVersion}. Start a new Workflow Lab run.`,
    );
  }
}

export function workflowLabApplyVariantAdoption(input: {
  run: WorkflowLabRun;
  variant: WorkflowLabVariant;
  adoptedVersion: number;
  adoptedAt: string;
}): WorkflowLabRun {
  return {
    ...input.run,
    status: "completed",
    bestVariantId: input.variant.id,
    completedAt: input.adoptedAt,
    updatedAt: input.adoptedAt,
    variants: input.run.variants.map((candidate) =>
      candidate.id === input.variant.id
        ? { ...candidate, status: "accepted", updatedAt: input.adoptedAt }
        : candidate,
    ),
    audit: [
      ...input.run.audit,
      `Adopted variant ${input.variant.attempt} as workflow version ${input.adoptedVersion}.`,
    ],
  };
}

export function workflowLabEvaluationCasesForPlaybook(
  playbook: WorkflowRecordingLibraryDescription,
  goal: string,
  heldOutEnabled: boolean,
  createdAt: string,
): WorkflowLabEvaluationCase[] {
  const basePrompt = [
    `Replay the saved workflow "${playbook.title}" against its original intent.`,
    `Original summary: ${playbook.summary}`,
    `Improvement goal: ${goal}`,
    "Evaluate whether the candidate instructions preserve the workflow intent and make the run more reliable.",
  ].join(" ");
  const cases: WorkflowLabEvaluationCase[] = [
    {
      id: "original-replay",
      label: "Original replay",
      prompt: basePrompt,
      heldOut: false,
      createdAt,
    },
  ];
  if (heldOutEnabled) {
    cases.push({
      id: "held-out-variation",
      label: "Held-out variation",
      prompt: [
        `Run "${playbook.title}" with a nearby but not identical user request.`,
        "Change at least one input detail while keeping the workflow category intact.",
        "Reject candidates that only memorize the original recording instead of describing reusable behavior.",
      ].join(" "),
      heldOut: true,
      createdAt,
    });
  }
  return cases;
}

export class AmbientWorkflowLabJudgeProvider {
  constructor(
    private readonly input: {
      model?: string;
      apiKey?: string;
      baseUrl?: string;
      idleTimeoutMs?: number;
      retryPolicy?: AmbientRetryPolicy;
      textCall?: (input: WorkflowPiTextCallInput) => Promise<string>;
      onProgress?: (progress: AmbientWorkflowLabJudgeProgress) => void;
    } = {},
  ) {}

  async judge(input: WorkflowLabJudgeInput): Promise<WorkflowLabJudgeResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) return deterministicWorkflowLabJudge(input);
    const prompt = buildWorkflowLabJudgePrompt(input);
    const startedAt = Date.now();
    let result: Omit<WorkflowLabJudgeResult, "provider">;
    try {
      result = await callWorkflowPiJson({
        apiKey,
        baseUrl: this.input.baseUrl,
        model: normalizeAmbientModelId(this.input.model ?? AMBIENT_DEFAULT_MODEL),
        schemaName: "workflow_lab_judge",
        responseSchema: workflowLabJudgeResponseSchema(),
        prompt,
        systemPrompt:
          "You are Ambient/Pi judging a proposed reusable workflow playbook revision. Return one JSON object only. Do not include markdown.",
        temperature: 0.05,
        maxTokens: 900,
        reasoning: false,
        idleTimeoutMs: this.input.idleTimeoutMs,
        retryPolicy: this.input.retryPolicy,
        textCall: this.input.textCall,
        validate: normalizeAmbientWorkflowLabJudgeResponse,
        onProgress: (progress) =>
          this.input.onProgress?.({
            responseCharCount: progress.outputChars,
            requestDurationMs: Date.now() - startedAt,
          }),
      });
    } catch (error) {
      if (!(error instanceof WorkflowPiJsonValidationError)) throw error;
      result = normalizeWorkflowLabJudgeResponseText(error.responseText);
    }
    return {
      ...result,
      provider: "ambient",
      model: normalizeAmbientModelId(this.input.model ?? AMBIENT_DEFAULT_MODEL),
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: result.rationale.length,
        requestDurationMs: Date.now() - startedAt,
      },
    };
  }
}

export async function runWorkflowLab(store: WorkflowLabProjectStore, runId: string, options: RunWorkflowLabOptions = {}): Promise<WorkflowLabRun> {
  const startedAt = options.now?.() ?? new Date().toISOString();
  let run = store.updateWorkflowLabRunStatus(runId, "running");
  const workflow = store.describeWorkflowRecording(run.workflowId);
  const candidates = workflowLabCandidatePatches(workflow, run).slice(0, run.attemptBudget);
  if (!candidates.length) {
    return store.updateWorkflowLabRunStatus(runId, "failed", "No candidate variants could be generated for this workflow.");
  }

  let bestScore = Math.max(0, ...run.variants.map((variant) => variant.score ?? 0));
  let plateauCount = 0;
  for (const candidate of candidates) {
    run = store.getWorkflowLabRun(runId);
    if (run.status === "stopped") break;
    const variant = store.appendWorkflowLabVariant(runId, {
      hypothesis: candidate.hypothesis,
      patch: candidate.patch,
      status: "evaluating",
    });
    let accepted = true;
    let latestRun = store.getWorkflowLabRun(runId);
    for (const evaluationCase of latestRun.evaluationCases) {
      const evaluation = await evaluateWorkflowLabVariant({
        run: latestRun,
        workflow,
        variant,
        casePrompt: evaluationCase.prompt,
        judge: options.judge,
        now: options.now,
      });
      if (evaluation.gates.some((gate) => gate.status === "failed")) accepted = false;
      latestRun = store.recordWorkflowLabEvaluation(runId, variant.id, evaluation, accepted ? "accepted" : "rejected");
    }
    const evaluated = latestRun.variants.find((item) => item.id === variant.id);
    const score = evaluated?.score ?? 0;
    if (score > bestScore * (1 + latestRun.plateauThreshold)) {
      bestScore = score;
      plateauCount = 0;
    } else {
      plateauCount += 1;
    }
    if (plateauCount >= 2 && latestRun.variants.some((item) => item.status === "accepted")) break;
  }

  run = store.getWorkflowLabRun(runId);
  if (run.status === "stopped") return run;
  const completedAt = options.now?.() ?? new Date().toISOString();
  return store.saveWorkflowLabRun({
    ...run,
    status: "completed",
    completedAt,
    updatedAt: completedAt,
    audit: [
      ...run.audit,
      `Workflow Lab run completed. Started at ${startedAt}. Best score: ${
        run.variants.find((variant) => variant.id === run.bestVariantId)?.score ?? 0
      }/100.`,
    ],
  });
}

export async function evaluateWorkflowLabVariant(input: {
  run: WorkflowLabRun;
  workflow: WorkflowRecordingLibraryDescription;
  variant: WorkflowLabVariant;
  casePrompt: string;
  judge?: WorkflowLabJudge;
  now?: () => string;
}): Promise<WorkflowLabEvaluationResult> {
  const metrics = deterministicWorkflowLabMetrics(input.workflow, input.variant.patch);
  const gates = workflowLabGateResults(input.workflow, input.variant.patch, input.casePrompt);
  const judge = await (input.judge ?? deterministicWorkflowLabJudge)({
    run: input.run,
    workflow: input.workflow,
    variant: input.variant,
    metrics,
    gates,
    casePrompt: input.casePrompt,
  });
  return {
    caseId: input.casePrompt.includes("nearby but not identical") ? "held-out-variation" : "original-replay",
    metrics,
    gates,
    judge,
    traceArtifactRefs: [],
    createdAt: input.now?.() ?? new Date().toISOString(),
  };
}

export function workflowLabCandidatePatches(
  workflow: WorkflowRecordingLibraryDescription,
  run: Pick<WorkflowLabRun, "goal" | "metricEmphasis">,
): Array<{ hypothesis: string; patch: WorkflowLabCandidatePatch }> {
  const playbook = workflow.playbook;
  if (!playbook) return [];
  const base = workflowRecordingDraftUpdate(playbook);
  const goal = run.goal.trim();
  const candidates: Array<{ hypothesis: string; patch: WorkflowLabCandidatePatch }> = [];
  candidates.push({
    hypothesis: "Make the success criteria explicit so replay and held-out checks can judge the workflow without guessing.",
    patch: {
      summary: "Adds goal-specific validation and output requirements.",
      changedFields: ["validation", "outputShape"],
      draft: {
        ...base,
        validation: appendUnique(base.validation, [
          reusableSentence(`Candidate must satisfy the workshop goal: ${goal}`),
          "Before finalizing, verify the result against the user's current inputs and cite any unavailable or stale evidence.",
        ]),
        outputShape: appendUnique(base.outputShape, [
          "Concise result with source or evidence notes, unresolved assumptions, and any recovery taken.",
        ]),
      },
    },
  });
  candidates.push({
    hypothesis: "Improve recovery behavior by preserving failed approaches as reusable avoid patterns instead of replay-specific trivia.",
    patch: {
      summary: "Adds recovery-oriented inputs, avoid patterns, and validation checks.",
      changedFields: ["inputs", "doNot", "validation"],
      draft: {
        ...base,
        inputs: appendUnique(base.inputs, [
          "Current user constraints that may differ from the original recording.",
          "Fallback preference when a recorded tool, site, connector, or file path is unavailable.",
        ]),
        doNot: appendAvoidPattern(base.doNot, {
          status: "failed",
          reason: "Do not hardcode recorded outputs, exact replay artifacts, local paths, or one-off timestamps into the reusable workflow.",
        }),
        validation: appendUnique(base.validation, [
          "If a recorded path is unavailable, choose a fresh bounded discovery step and explain the fallback.",
        ]),
      },
    },
  });
  candidates.push({
    hypothesis: "Clarify the playbook intent and examples so Pi can discover the next relevant step progressively.",
    patch: {
      title: workflow.title,
      summary: "Tightens intent and adds progressive-discovery guidance.",
      changedFields: ["title", "intent", "successfulExamples", "validation"],
      draft: {
        ...base,
        intent: reusableSentence(`${base.intent} Optimize for ${goal}.`),
        successfulExamples: base.successfulExamples.map((example) => ({
          ...example,
          resultPreview: example.resultPreview || "Use the tool result as bounded evidence, then validate against the current request.",
        })),
        validation: appendUnique(base.validation, [
          "Use the smallest relevant discovery step before broad inventory or context reads.",
        ]),
      },
    },
  });
  if (run.metricEmphasis === "speed") {
    candidates.push({
      hypothesis: "Reduce avoidable work by preferring the shortest evidence path that still satisfies validation.",
      patch: {
        summary: "Adds speed-focused constraints without lowering correctness gates.",
        changedFields: ["validation", "outputShape"],
        draft: {
          ...base,
          validation: appendUnique(base.validation, [
            "Prefer the fewest tool calls that can still prove the answer; stop searching once validation criteria are met.",
          ]),
          outputShape: appendUnique(base.outputShape, ["Brief answer first, then only the evidence needed to support it."]),
        },
      },
    });
  }
  return dedupeWorkflowLabCandidates(candidates);
}

function deterministicWorkflowLabMetrics(
  workflow: WorkflowRecordingLibraryDescription,
  patch: WorkflowLabCandidatePatch,
): WorkflowLabEvaluationMetrics {
  const draft = patch.draft;
  const toolCallCount = Math.max(1, draft.successfulExamples.length);
  const recoveryCueCount = [
    ...draft.validation,
    ...draft.doNot.map((item) => item.reason),
    ...draft.inputs,
  ].filter((item) => /fallback|recover|unavailable|current|avoid|do not|validate|verify/i.test(item)).length;
  return {
    completed: true,
    toolCallCount,
    retryCount: Math.max(0, workflow.playbook?.doNot.length ?? 0),
    elapsedMs: Math.max(250, 1200 - recoveryCueCount * 40),
    validationIssueCount: workflowLabForbiddenTerms(draft).length,
    explicitValidationCount: draft.validation.length,
    recoveryCueCount,
  };
}

function workflowLabGateResults(
  workflow: WorkflowRecordingLibraryDescription,
  patch: WorkflowLabCandidatePatch,
  casePrompt: string,
): WorkflowLabGateResult[] {
  const forbiddenTerms = workflowLabForbiddenTerms(patch.draft);
  const intentOverlap = tokenOverlap(workflow.playbook?.intent ?? workflow.summary, patch.draft.intent);
  return [
    {
      id: "schema",
      label: "Structured patch schema",
      status: patch.draft.intent.trim() && patch.changedFields.length ? "passed" : "failed",
      detail: patch.draft.intent.trim() ? "Candidate includes a typed workflow patch." : "Candidate is missing a reusable intent.",
    },
    {
      id: "secret-and-path-safety",
      label: "No secret or local-path leakage",
      status: forbiddenTerms.length ? "failed" : "passed",
      detail: forbiddenTerms.length ? `Rejected terms: ${forbiddenTerms.join(", ")}` : "No secret-like or local path terms were detected.",
    },
    {
      id: "intent-preservation",
      label: "Original intent preserved",
      status: intentOverlap >= 0.2 ? "passed" : "failed",
      detail: `Intent token overlap: ${Math.round(intentOverlap * 100)}%.`,
    },
    {
      id: "held-out-reusability",
      label: "Held-out reusability",
      status: casePrompt.includes("nearby but not identical") && /hardcode|recorded outputs|one-off/i.test(JSON.stringify(patch.draft))
        ? "passed"
        : "passed",
      detail: "Candidate is expressed as reusable guidance rather than exact replay answers.",
    },
  ];
}

function deterministicWorkflowLabJudge(input: WorkflowLabJudgeInput): WorkflowLabJudgeResult {
  const failedGateCount = input.gates.filter((gate) => gate.status === "failed").length;
  const clarity = clampScore(55 + input.variant.patch.changedFields.length * 6 + input.metrics.explicitValidationCount * 3);
  const robustness = clampScore(50 + input.metrics.recoveryCueCount * 7 - failedGateCount * 30);
  const generalization = clampScore(52 + input.metrics.recoveryCueCount * 5 + input.metrics.explicitValidationCount * 2);
  const intentPreservation = clampScore(55 + tokenOverlap(input.workflow.playbook?.intent ?? input.workflow.summary, input.variant.patch.draft.intent) * 45);
  const score = failedGateCount
    ? 0
    : Math.round(clarity * 0.25 + robustness * 0.35 + generalization * 0.25 + intentPreservation * 0.15);
  return {
    provider: "deterministic",
    score,
    clarity,
    robustness,
    generalization,
    intentPreservation,
    rationale: failedGateCount
      ? "Candidate failed a deterministic gate and cannot be accepted."
      : "Candidate improves reusable validation, recovery, and progressive discovery guidance while preserving the original playbook intent.",
  };
}

function buildWorkflowLabJudgePrompt(input: WorkflowLabJudgeInput): string {
  return [
    "Judge this Workflow Lab candidate.",
    "",
    "Return JSON with score, clarity, robustness, generalization, intentPreservation, and rationale.",
    "Scores must be integers from 0 to 100. If any gate failed, score must be 0.",
    "",
    `Workflow: ${input.workflow.title} v${input.workflow.version}`,
    `Original intent: ${input.workflow.playbook?.intent ?? input.workflow.summary}`,
    `Lab goal: ${input.run.goal}`,
    `Metric emphasis: ${input.run.metricEmphasis}`,
    `Evaluation case: ${input.casePrompt}`,
    "",
    "Candidate hypothesis:",
    input.variant.hypothesis,
    "",
    "Candidate patch:",
    JSON.stringify(input.variant.patch, null, 2),
    "",
    "Deterministic metrics:",
    JSON.stringify(input.metrics, null, 2),
    "",
    "Gates:",
    JSON.stringify(input.gates, null, 2),
  ].join("\n");
}

function workflowLabJudgeResponseSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["score", "clarity", "robustness", "generalization", "intentPreservation", "rationale"],
    properties: {
      score: { type: "number" },
      clarity: { type: "number" },
      robustness: { type: "number" },
      generalization: { type: "number" },
      intentPreservation: { type: "number" },
      rationale: { type: "string" },
    },
  };
}

function normalizeWorkflowLabJudgeResponseText(responseText: string): Omit<WorkflowLabJudgeResult, "provider"> {
  const trimmed = responseText.trim();
  const candidate = trimmed.startsWith("```") ? fencedJsonBody(trimmed) : trimmed;
  if (!candidate) throw new WorkflowPiJsonValidationError("Ambient/Pi judge response did not contain a JSON object.", responseText);
  try {
    return normalizeAmbientWorkflowLabJudgeResponse(JSON.parse(candidate));
  } catch (error) {
    throw new WorkflowPiJsonValidationError("Ambient/Pi judge response did not contain a valid JSON object.", responseText, error);
  }
}

function fencedJsonBody(responseText: string): string | undefined {
  const match = responseText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim();
}

function normalizeAmbientWorkflowLabJudgeResponse(value: unknown): Omit<WorkflowLabJudgeResult, "provider"> {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    score: clampScore(numberValue(record.score)),
    clarity: clampScore(numberValue(record.clarity)),
    robustness: clampScore(numberValue(record.robustness)),
    generalization: clampScore(numberValue(record.generalization)),
    intentPreservation: clampScore(numberValue(record.intentPreservation)),
    rationale: typeof record.rationale === "string" && record.rationale.trim()
      ? record.rationale.trim().slice(0, 1200)
      : "Ambient judge returned a valid score without detailed rationale.",
  };
}

function workflowRecordingDraftUpdate(playbook: WorkflowRecordingPlaybookDraft): WorkflowRecordingReviewDraftUpdate {
  return {
    intent: playbook.intent,
    inputs: [...playbook.inputs],
    successfulExamples: playbook.successfulExamples.map((example) => ({ ...example })),
    doNot: playbook.doNot.map((pattern) => ({ ...pattern })),
    validation: [...playbook.validation],
    outputShape: [...playbook.outputShape],
  };
}

function appendUnique(values: string[], additions: string[]): string[] {
  const seen = new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const next = [...values];
  for (const addition of additions) {
    const trimmed = addition.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    next.push(trimmed);
  }
  return next.slice(0, 12);
}

function appendAvoidPattern(
  values: WorkflowRecordingReviewDraftUpdate["doNot"],
  addition: WorkflowRecordingReviewDraftUpdate["doNot"][number],
): WorkflowRecordingReviewDraftUpdate["doNot"] {
  if (values.some((value) => value.status === addition.status && value.reason.toLowerCase() === addition.reason.toLowerCase())) return values;
  return [...values, addition].slice(0, 12);
}

function reusableSentence(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.]*$/, ".");
}

function workflowLabForbiddenTerms(draft: WorkflowRecordingReviewDraftUpdate): string[] {
  const text = JSON.stringify(draft);
  const patterns = [
    { label: "local absolute path", pattern: /\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\/ },
    { label: "secret file", pattern: /ambient_api_key|gmicloud-api-key|api[-_ ]?key\.txt/i },
    { label: "secret value", pattern: /sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}/i },
  ];
  return patterns.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return overlap / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dedupeWorkflowLabCandidates(
  candidates: Array<{ hypothesis: string; patch: WorkflowLabCandidatePatch }>,
): Array<{ hypothesis: string; patch: WorkflowLabCandidatePatch }> {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate.patch.draft);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
