import { parseProjectBoardLlmJson } from "./projectBoardLlmJson";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import type {
  ProjectBoardCard,
  ProjectBoardCardProofEvidenceQuality,
  ProjectBoardCardProofRecommendedAction,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardTestPlan,
  ProjectBoardCharter,
  ProjectBoardProofFollowUpSuggestion
} from "../../shared/projectBoardTypes";
import { AmbientStreamFailureError, type AmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { callAmbientChatCompletionTextWithRetries } from "./projectBoardAmbientFacade";
import { readAmbientApiKey } from "./projectBoardSecurityFacade";
import {
  projectBoardTaskToolActionIntegrityIssues,
  projectBoardTaskToolActionsFromProofOfWork,
  projectBoardTaskToolChangedFiles,
  projectBoardTaskToolCommands,
} from "./projectBoardTaskTools";

export interface ProjectBoardProofJudgment {
  status: ProjectBoardCardProofReviewStatus;
  summary: string;
  satisfied: string[];
  missing: string[];
  evidenceQuality: ProjectBoardCardProofEvidenceQuality;
  recommendedAction: ProjectBoardCardProofRecommendedAction;
  confidence: number;
  followUpSuggestion?: ProjectBoardProofFollowUpSuggestion;
}

export interface AmbientProjectBoardProofJudgmentTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
}

export interface AmbientProjectBoardProofJudgmentResult {
  judgment: ProjectBoardProofJudgment;
  telemetry: AmbientProjectBoardProofJudgmentTelemetry;
}

export interface AmbientProjectBoardProofJudgmentProgress {
  responseCharCount: number;
  requestDurationMs: number;
  transientRetry?: boolean;
  retryAttempt?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  retryError?: string;
  aggressiveRetries?: boolean;
  fallbackToNonStream?: boolean;
}

export interface ProjectBoardProofJudgmentContext {
  card: ProjectBoardCard;
  run: OrchestrationRun;
  deterministicReview: ProjectBoardCardProofReview;
  charter?: ProjectBoardCharter;
  onProgress?: (progress: AmbientProjectBoardProofJudgmentProgress) => void;
}

const proofReviewStatuses = new Set<ProjectBoardCardProofReviewStatus>([
  "ready_for_review",
  "needs_follow_up",
  "terminally_blocked",
  "retry_recommended",
  "done",
]);
const evidenceQualities = new Set<ProjectBoardCardProofEvidenceQuality>(["strong", "mixed", "weak"]);
const recommendedActions = new Set<ProjectBoardCardProofRecommendedAction>(["close", "retry", "follow_up", "ask_user", "block"]);
const DEFAULT_PROOF_JUDGMENT_MAX_TOKENS = 2_000;

export class AmbientProjectBoardProofJudgeProvider {
  constructor(
    private readonly input: {
      model: string;
      apiKey?: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      preStreamResponseTimeoutMs?: number;
      streamIdleTimeoutMs?: number;
      streamContentIdleTimeoutMs?: number;
      maxTokens?: number;
      retryPolicy?: AmbientRetryPolicy;
      waitForRetry?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
      signal?: AbortSignal;
    },
  ) {}

  async judge(input: ProjectBoardProofJudgmentContext): Promise<AmbientProjectBoardProofJudgmentResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const prompt = buildProjectBoardProofJudgmentPrompt(input);
    const requestStartedAt = Date.now();
    const requestBody = {
      model: normalizeAmbientModelId(this.input.model),
      messages: [
        {
          role: "system",
          content:
            "You are Ambient/Pi acting as a senior project manager judging whether an autonomous coding card is actually complete. Return one JSON object only. Do not use markdown.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.05,
      max_tokens: normalizeProofJudgmentMaxTokens(this.input.maxTokens),
      response_format: { type: "json_object" },
      stream: true,
    };
    const progress = (responseCharCount: number) =>
      input.onProgress?.({ responseCharCount, requestDurationMs: Date.now() - requestStartedAt });
    const retryProgress = (event: {
      responseCharCount: number;
      retryAttempt: number;
      maxRetries: number;
      delayMs: number;
      error: string;
      fallbackToNonStream?: boolean;
    }) =>
      input.onProgress?.({
        responseCharCount: event.responseCharCount,
        requestDurationMs: Date.now() - requestStartedAt,
        transientRetry: true,
        retryAttempt: event.retryAttempt,
        maxRetries: event.maxRetries,
        retryDelayMs: event.delayMs,
        retryError: event.error,
        aggressiveRetries: Boolean(this.input.retryPolicy?.enabled),
        fallbackToNonStream: event.fallbackToNonStream,
      });
    let responseText: string;
    try {
      responseText = await callAmbientChatCompletionTextWithRetries({
        apiKey,
        baseUrl: this.input.baseUrl,
        fetchImpl: this.input.fetchImpl,
        label: "Ambient project-board proof judgment",
        requestBody,
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: true,
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        signal: this.input.signal,
        validateResponseText: validateProjectBoardProofJudgmentResponseText,
        onResponseChars: progress,
        onRetry: retryProgress,
      });
    } catch (error) {
      if (!shouldRetryProofJudgmentWithoutStreaming(error)) throw error;
      responseText = await callAmbientChatCompletionTextWithRetries({
        apiKey,
        baseUrl: this.input.baseUrl,
        fetchImpl: this.input.fetchImpl,
        label: "Ambient project-board proof judgment non-stream fallback",
        requestBody: { ...requestBody, stream: false },
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: false,
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        signal: this.input.signal,
        validateResponseText: validateProjectBoardProofJudgmentResponseText,
        onResponseChars: progress,
        onRetry: retryProgress,
      });
    }
    const requestDurationMs = Date.now() - requestStartedAt;
    return {
      judgment: normalizeProjectBoardProofJudgment(parseProjectBoardProofJudgmentJson(responseText), input.deterministicReview),
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: responseText.length,
        requestDurationMs,
      },
    };
  }
}

function validateProjectBoardProofJudgmentResponseText(text: string): void {
  parseProjectBoardProofJudgmentJson(text);
}

function normalizeProofJudgmentMaxTokens(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PROOF_JUDGMENT_MAX_TOKENS;
  return Math.max(256, Math.floor(value));
}

function shouldRetryProofJudgmentWithoutStreaming(error: unknown): boolean {
  return (
    error instanceof AmbientStreamFailureError &&
    !error.semanticOutputSeen &&
    !error.toolCallSeen &&
    (error.kind === "stream_idle_timeout" || error.kind === "stream_closed_before_done")
  );
}

export function buildProjectBoardProofJudgmentPrompt(input: ProjectBoardProofJudgmentContext): string {
  const card = input.card;
  const run = input.run;
  const proof = run.proofOfWork ?? {};
  const taskActions = projectBoardTaskToolActionsFromProofOfWork(proof);
  const taskActionEvidence = {
    actionCount: taskActions.length,
    actions: taskActions.map((action) => action.action),
    changedFiles: projectBoardTaskToolChangedFiles(taskActions),
    commands: projectBoardTaskToolCommands(taskActions),
    integrityIssues: projectBoardTaskToolActionIntegrityIssues(taskActions),
  };
  return [
    "Judge whether this project-board card should close, retry, ask for user input, create follow-up work, or block.",
    "",
    "Return exactly this JSON shape:",
    JSON.stringify(
      {
        status: "done | ready_for_review | needs_follow_up | retry_recommended | terminally_blocked",
        summary: "One concise project-manager judgment.",
        satisfied: ["Evidence or acceptance criteria that are truly satisfied."],
        missing: ["Missing evidence, missing acceptance criteria, or blocker."],
        evidenceQuality: "strong | mixed | weak",
        recommendedAction: "close | retry | follow_up | ask_user | block",
        confidence: 0.82,
        followUpSuggestion: {
          title: "Short draft-card title when recommendedAction is follow_up.",
          description: "Concrete scope for the follow-up card. Omit for close/retry/ask_user/block unless genuinely useful.",
          acceptanceCriteria: ["Specific acceptance or evidence required to close the follow-up."],
          testPlan: {
            unit: ["Unit proof to collect, if relevant."],
            integration: ["Integration proof to collect, if relevant."],
            visual: ["Screenshot, browser, canvas, or viewport proof to collect, if relevant."],
            manual: ["Human inspection required, if relevant."],
          },
          clarificationQuestions: ["Decision needed before this follow-up can be ticketized."],
          labels: ["short-label"],
          rationale: "Why this should be a follow-up instead of retrying or closing.",
        },
      },
      null,
      2,
    ),
    "",
    "Judgment rules:",
    "- Prefer close/done only when the card objective, acceptance criteria, and proof expectations are materially satisfied.",
    "- Use ready_for_review when evidence looks sufficient but a human should inspect before final done.",
    "- Use needs_follow_up when the implementation is useful but incomplete or proof is partial.",
    "- Use retry_recommended when another autonomous pass is likely to finish the card without new user input.",
    "- Use terminally_blocked when credentials, permissions, product decisions, budget, or external access are required.",
    "- For every non-close recommendedAction, put the exact next action in missing: retry must name the missing proof or command, follow_up must name the follow-up card scope, ask_user must include the direct question to ask the user, and block must name the terminal blocker.",
    "- When recommendedAction is follow_up, include followUpSuggestion with a ticket-ready draft card for the smallest concrete missing proof or implementation scope.",
    "- followUpSuggestion must not rewrite the approved parent card; it should create additive follow-up work with explicit acceptance criteria and proof expectations.",
    "- Keep followUpSuggestion small and actionable. Prefer one follow-up card. Use clarificationQuestions only when the card cannot be safely ticketized without user input.",
    "- For ready_for_review with ask_user, missing must still explain what the human should inspect or decide before closing.",
    "- Do not trust narrative proof if changed files, commands, screenshots, or hook output contradict it.",
    "- GLM 5.1 cannot inspect image pixels directly. Treat raw screenshot paths as human artifacts; judge visual proof from textual fields like visualChecks, browserEvidence, dimensions, nonblank pixel counts, color diversity, console errors, canvas metrics, accessibility snapshots, command output, and trace summaries.",
    "- If deterministic review found missing implementation evidence, only override it when the proof packet explains why code changes were not expected.",
    "",
    `Card: ${card.title}`,
    `Status before run: ${card.status}`,
    `Candidate status: ${card.candidateStatus}`,
    card.phase ? `Phase: ${card.phase}` : "",
    card.labels.length ? `Labels: ${card.labels.join(", ")}` : "",
    "",
    "Description:",
    truncate(card.description, 4_000),
    "",
    "Acceptance criteria:",
    card.acceptanceCriteria.length ? card.acceptanceCriteria.map((item) => `- ${item}`).join("\n") : "- None recorded.",
    "",
    "Proof expectations:",
    [
      ...card.testPlan.unit.map((item) => `- Unit: ${item}`),
      ...card.testPlan.integration.map((item) => `- Integration: ${item}`),
      ...card.testPlan.visual.map((item) => `- Visual: ${item}`),
      ...card.testPlan.manual.map((item) => `- Manual: ${item}`),
    ].join("\n") || "- None recorded.",
    "",
    input.charter
      ? [
          "Project charter:",
          `Goal: ${truncate(input.charter.goal, 1_500)}`,
          `Quality bar: ${truncate(input.charter.qualityBar, 1_500)}`,
          `Decision policy: ${truncate(JSON.stringify(input.charter.decisionPolicy), 1_500)}`,
          `Budget policy: ${truncate(JSON.stringify(input.charter.budgetPolicy), 1_500)}`,
        ].join("\n")
      : "",
    "",
    "Run:",
    JSON.stringify(
      {
        id: run.id,
        status: run.status,
        attemptNumber: run.attemptNumber,
        error: run.error,
        workspacePath: run.workspacePath,
      },
      null,
      2,
    ),
    "",
    "Deterministic proof review fallback:",
    JSON.stringify(
      {
        status: input.deterministicReview.status,
        summary: input.deterministicReview.summary,
        satisfied: input.deterministicReview.satisfied,
        missing: input.deterministicReview.missing,
      },
      null,
      2,
    ),
    "",
    "Structured task-action evidence projection:",
    JSON.stringify(taskActionEvidence, null, 2),
    "",
    "Proof packet:",
    truncate(JSON.stringify(proof, null, 2), 16_000),
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeProjectBoardProofJudgment(value: unknown, fallback: ProjectBoardCardProofReview): ProjectBoardProofJudgment {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const status = proofReviewStatuses.has(record.status as ProjectBoardCardProofReviewStatus)
    ? (record.status as ProjectBoardCardProofReviewStatus)
    : fallback.status;
  const evidenceQuality = evidenceQualities.has(record.evidenceQuality as ProjectBoardCardProofEvidenceQuality)
    ? (record.evidenceQuality as ProjectBoardCardProofEvidenceQuality)
    : fallback.missing.length > 0
      ? "mixed"
      : "strong";
  const recommendedAction = recommendedActions.has(record.recommendedAction as ProjectBoardCardProofRecommendedAction)
    ? (record.recommendedAction as ProjectBoardCardProofRecommendedAction)
    : recommendedActionForStatus(status);
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence)
    ? Math.max(0, Math.min(1, record.confidence))
    : 0.5;
  const followUpSuggestion = normalizeProjectBoardProofFollowUpSuggestion(record.followUpSuggestion ?? record.followUp, recommendedAction);
  return {
    status,
    summary: normalizeShortString(record.summary, fallback.summary),
    satisfied: normalizeStringList(record.satisfied, fallback.satisfied, 20),
    missing: normalizeStringList(record.missing, fallback.missing, 20),
    evidenceQuality,
    recommendedAction,
    confidence,
    ...(followUpSuggestion ? { followUpSuggestion } : {}),
  };
}

export function parseProjectBoardProofJudgmentJson(text: string): unknown {
  return parseProjectBoardLlmJson(text, "Ambient project-board proof judgment");
}

function recommendedActionForStatus(status: ProjectBoardCardProofReviewStatus): ProjectBoardCardProofRecommendedAction {
  if (status === "done" || status === "ready_for_review") return "close";
  if (status === "retry_recommended") return "retry";
  if (status === "terminally_blocked") return "block";
  return "follow_up";
}

function normalizeShortString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1_000) : fallback;
}

function normalizeStringList(value: unknown, fallback: string[], limit: number): string[] {
  const items = Array.isArray(value) ? value : fallback;
  return items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeProjectBoardProofFollowUpSuggestion(
  value: unknown,
  recommendedAction: ProjectBoardCardProofRecommendedAction,
): ProjectBoardProofFollowUpSuggestion | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const title = normalizeOptionalString(record.title, 180);
  const description = normalizeOptionalString(record.description, 4_000);
  const acceptanceCriteria = normalizeStringList(record.acceptanceCriteria, [], 30);
  const testPlan = normalizeProjectBoardProofFollowUpTestPlan(record.testPlan);
  const clarificationQuestions = normalizeStringList(record.clarificationQuestions, [], 8).map((item) => item.slice(0, 500));
  const labels = normalizeStringList(record.labels, [], 12).map((item) => item.toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-")).filter(Boolean);
  const rationale = normalizeOptionalString(record.rationale, 1_000);
  const hasScope = Boolean(title || description || acceptanceCriteria.length || testPlan || clarificationQuestions.length);
  if (!hasScope || recommendedAction !== "follow_up") return undefined;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(acceptanceCriteria.length ? { acceptanceCriteria } : {}),
    ...(testPlan ? { testPlan } : {}),
    ...(clarificationQuestions.length ? { clarificationQuestions } : {}),
    ...(labels.length ? { labels: [...new Set(labels)] } : {}),
    ...(rationale ? { rationale } : {}),
  };
}

function normalizeProjectBoardProofFollowUpTestPlan(value: unknown): ProjectBoardCardTestPlan | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const testPlan = {
    unit: normalizeStringList(record.unit, [], 20),
    integration: normalizeStringList(record.integration, [], 20),
    visual: normalizeStringList(record.visual, [], 20),
    manual: normalizeStringList(record.manual, [], 20),
  };
  return testPlan.unit.length || testPlan.integration.length || testPlan.visual.length || testPlan.manual.length ? testPlan : undefined;
}

function normalizeOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}
