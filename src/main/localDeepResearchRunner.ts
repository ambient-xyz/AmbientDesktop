import {
  buildLocalDeepResearchSystemPrompt,
  executeLocalDeepResearchToolCall,
  parseLocalDeepResearchToolCall,
  type LocalDeepResearchBroker,
  type LocalDeepResearchToolExecution,
} from "./localDeepResearchAdapter";
import { normalizeLocalDeepResearchFinalSynthesisConfig } from "./localDeepResearchProviderStack";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import type { LocalDeepResearchFinalSynthesisConfig } from "../shared/types";

export type LocalDeepResearchMessageRole = "system" | "user" | "assistant" | "tool";

export interface LocalDeepResearchChatMessage {
  role: LocalDeepResearchMessageRole;
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface LocalDeepResearchChatCompletionInput {
  messages: LocalDeepResearchChatMessage[];
  setup: LocalDeepResearchSetupContract;
  toolCallCount: number;
}

export interface LocalDeepResearchChatCompletion {
  content: string;
  raw?: unknown;
}

export interface LocalDeepResearchChatClient {
  complete: (input: LocalDeepResearchChatCompletionInput) => Promise<LocalDeepResearchChatCompletion> | LocalDeepResearchChatCompletion;
}

export type LocalDeepResearchRunStatus =
  | "completed"
  | "blocked"
  | "invalid-tool-call"
  | "invalid-final-answer"
  | "citation-validation-failed"
  | "synthesis-deferred"
  | "tool-budget-exceeded"
  | "turn-budget-exceeded";

export type LocalDeepResearchCitationValidationStatus = "passed" | "failed" | "skipped";

export interface LocalDeepResearchCitationValidationResult {
  status: LocalDeepResearchCitationValidationStatus;
  citationUrls: string[];
  observedUrls: string[];
  unobservedCitationUrls: string[];
  hasSourcesLine: boolean;
  successfulToolEvidenceCount: number;
  detail: string;
}

export interface LocalDeepResearchRunInput {
  question: string;
  setup: LocalDeepResearchSetupContract;
  chat: LocalDeepResearchChatClient;
  broker: LocalDeepResearchBroker;
  maxToolCalls?: number;
  maxTurns?: number;
  finalSynthesis?: Partial<LocalDeepResearchFinalSynthesisConfig>;
}

export interface LocalDeepResearchFinalAnswerDraft {
  text: string;
  turn: number;
  citationValidation?: LocalDeepResearchCitationValidationResult;
  rejectedReason?: string;
}

export interface LocalDeepResearchRunResult {
  schemaVersion: "ambient-local-deep-research-run-v1";
  status: LocalDeepResearchRunStatus;
  question: string;
  setupStatus: LocalDeepResearchSetupContract["status"];
  modelProfileId: string;
  contextTokens: number;
  providerSnapshot: LocalDeepResearchSetupContract["providerSnapshot"];
  finalSynthesis: LocalDeepResearchFinalSynthesisConfig;
  messages: LocalDeepResearchChatMessage[];
  toolExecutions: LocalDeepResearchToolExecution[];
  finalAnswerDrafts?: LocalDeepResearchFinalAnswerDraft[];
  citationValidation?: LocalDeepResearchCitationValidationResult;
  finalText?: string;
  error?: string;
}

export async function runLocalDeepResearch(input: LocalDeepResearchRunInput): Promise<LocalDeepResearchRunResult> {
  const question = input.question.trim();
  const maxToolCalls = Math.max(0, Math.floor(input.maxToolCalls ?? 12));
  const maxTurns = Math.max(1, Math.floor(input.maxTurns ?? maxToolCalls + 2));
  const finalSynthesis = normalizeLocalDeepResearchFinalSynthesisConfig({
    ...input.setup.providerSnapshot.activeProvider?.finalSynthesis,
    ...input.finalSynthesis,
  });
  const messages: LocalDeepResearchChatMessage[] = [
    {
      role: "system",
      content: buildLocalDeepResearchSystemPrompt({
        setup: input.setup,
        maxToolCalls,
      }),
    },
    { role: "user", content: question },
  ];
  const base = (): Omit<LocalDeepResearchRunResult, "status"> => ({
    schemaVersion: "ambient-local-deep-research-run-v1",
    question,
    setupStatus: input.setup.status,
    modelProfileId: input.setup.modelInstall.selectedProfileId,
    contextTokens: input.setup.modelInstall.contextTokens,
    providerSnapshot: input.setup.providerSnapshot,
    finalSynthesis,
    messages,
    toolExecutions,
    ...(finalAnswerDrafts.length ? { finalAnswerDrafts } : {}),
  });
  const toolExecutions: LocalDeepResearchToolExecution[] = [];
  const finalAnswerDrafts: LocalDeepResearchFinalAnswerDraft[] = [];
  let finalAnswerRepairAttempts = 0;
  let citationRepairAttempts = 0;
  let finalOnlyToolCallRejections = 0;
  let finalAnswerOnly = false;

  if (!question) {
    return { ...base(), status: "invalid-tool-call", error: "Local Deep Research question is required." };
  }
  if (input.setup.status !== "ready") {
    return {
      ...base(),
      status: "blocked",
      error: input.setup.blockers.length
        ? input.setup.blockers.join("\n")
        : "Local Deep Research setup is not ready.",
    };
  }

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const completion = await input.chat.complete({
      messages: messages.map((message) => ({ ...message })),
      setup: input.setup,
      toolCallCount: toolExecutions.length,
    });
    messages.push({ role: "assistant", content: completion.content });
    const parsed = parseLocalDeepResearchToolCall(completion.content);
    if (parsed.status === "final") {
      const draft = pushLocalDeepResearchFinalAnswerDraft(finalAnswerDrafts, parsed.text, turn);
      const finalAnswerProblem = localDeepResearchFinalAnswerProblem(parsed.text);
      if (finalAnswerProblem) {
        draft.rejectedReason = finalAnswerProblem;
        const synthesized = await synthesizeLocalDeepResearchFinalAnswer({
          chat: input.chat,
          setup: input.setup,
          messages,
          question,
          toolExecutions,
          finalAnswerDrafts,
          finalSynthesis,
          reason: finalAnswerProblem,
        });
        if (synthesized) {
          return {
            ...base(),
            status: "completed",
            finalText: synthesized.finalText,
            citationValidation: synthesized.citationValidation,
          };
        }
        if (finalAnswerRepairAttempts < 1 && turn + 1 < maxTurns) {
          finalAnswerRepairAttempts += 1;
          finalAnswerOnly = toolExecutions.length > 0;
          messages.push({
            role: "user",
            content: localDeepResearchFinalAnswerRepairPrompt(finalAnswerProblem, toolExecutions),
          });
          continue;
        }
        return {
          ...base(),
          status: "invalid-final-answer",
          error: finalAnswerProblem,
        };
      }
      const citationValidation = validateLocalDeepResearchCitations(parsed.text, toolExecutions);
      draft.citationValidation = citationValidation;
      if (finalSynthesis.mode === "evidence_only" && toolExecutions.length > 0) {
        return {
          ...base(),
          status: "synthesis-deferred",
          finalText: localDeepResearchEvidencePacket({
            question,
            toolExecutions,
            finalAnswerDrafts,
            finalSynthesis,
            reason: "Final synthesis mode is evidence_only.",
          }),
          citationValidation: localDeepResearchEvidencePacketCitationValidation(toolExecutions),
        };
      }
      if (citationValidation.status === "failed") {
        const completedCitationText = localDeepResearchCompleteMissingSourcesLine(parsed.text, citationValidation);
        if (completedCitationText) {
          const completedCitationValidation = validateLocalDeepResearchCitations(completedCitationText, toolExecutions);
          if (completedCitationValidation.status !== "failed") {
            return {
              ...base(),
              status: "completed",
              finalText: completedCitationText,
              citationValidation: completedCitationValidation,
            };
          }
        }
        if (shouldRepairLocalDeepResearchCitations(citationValidation) && citationRepairAttempts < 1 && turn + 1 < maxTurns) {
          citationRepairAttempts += 1;
          finalAnswerOnly = true;
          messages.push({
            role: "user",
            content: localDeepResearchCitationRepairPrompt(citationValidation, toolExecutions),
          });
          continue;
        }
        return {
          ...base(),
          status: "citation-validation-failed",
          finalText: parsed.text,
          citationValidation,
          error: citationValidation.detail,
        };
      }
      return { ...base(), status: "completed", finalText: parsed.text, citationValidation };
    }
    if (parsed.status === "invalid") {
      return { ...base(), status: "invalid-tool-call", error: parsed.error };
    }
    if (finalAnswerOnly) {
      const salvaged = salvageLocalDeepResearchFinalAnswerDraft(finalAnswerDrafts, toolExecutions);
      if (salvaged) {
        return {
          ...base(),
          status: "completed",
          finalText: salvaged.finalText,
          citationValidation: salvaged.citationValidation,
        };
      }
      const synthesized = await synthesizeLocalDeepResearchFinalAnswer({
        chat: input.chat,
        setup: input.setup,
        messages,
        question,
        toolExecutions,
        finalAnswerDrafts,
        finalSynthesis,
        reason: "LiteResearcher attempted another tool call while final synthesis was required.",
      });
      if (synthesized) {
        return {
          ...base(),
          status: "completed",
          finalText: synthesized.finalText,
          citationValidation: synthesized.citationValidation,
        };
      }
      if (finalOnlyToolCallRejections < 1 && turn + 1 < maxTurns) {
        finalOnlyToolCallRejections += 1;
        messages.push({
          role: "user",
          content: localDeepResearchFinalOnlyToolCallRejectionPrompt(toolExecutions),
        });
        continue;
      }
      return {
        ...base(),
        status: "invalid-final-answer",
        error: "LiteResearcher attempted another tool call after final-answer repair; Local Deep Research needed a final user-facing answer.",
      };
    }
    if (toolExecutions.length >= maxToolCalls) {
      if (finalSynthesis.mode === "evidence_only" && toolExecutions.length > 0) {
        return {
          ...base(),
          status: "synthesis-deferred",
          finalText: localDeepResearchEvidencePacket({
            question,
            toolExecutions,
            finalAnswerDrafts,
            finalSynthesis,
            reason: `Local Deep Research reached its ${maxToolCalls} tool-call budget before a local final answer.`,
          }),
          citationValidation: localDeepResearchEvidencePacketCitationValidation(toolExecutions),
        };
      }
      return {
        ...base(),
        status: "tool-budget-exceeded",
        error: `Local Deep Research exceeded its ${maxToolCalls} tool-call budget.`,
      };
    }
    const execution = await executeLocalDeepResearchToolCall(parsed.call, input.broker);
    toolExecutions.push(execution);
    messages.push({
      role: "tool",
      name: execution.call.name,
      toolCallId: execution.call.id,
      content: execution.observation,
    });
  }

  return {
    ...base(),
    status: "turn-budget-exceeded",
    error: `Local Deep Research exceeded its ${maxTurns} turn budget.`,
  };
}

function pushLocalDeepResearchFinalAnswerDraft(
  drafts: LocalDeepResearchFinalAnswerDraft[],
  text: string,
  turn: number,
): LocalDeepResearchFinalAnswerDraft {
  const draft: LocalDeepResearchFinalAnswerDraft = { text, turn };
  drafts.push(draft);
  return draft;
}

function localDeepResearchFinalAnswerProblem(finalText: string): string | undefined {
  const trimmed = finalText.trim();
  if (!trimmed) return "LiteResearcher returned an empty final answer.";
  if (/<\/?think\b/i.test(trimmed)) {
    return "LiteResearcher returned scratch reasoning instead of a user-facing final answer.";
  }
  return undefined;
}

function localDeepResearchFinalAnswerRepairPrompt(
  problem: string,
  toolExecutions: LocalDeepResearchToolExecution[],
): string {
  const observedUrls = localDeepResearchObservedEvidenceUrls(toolExecutions).slice(0, 12);
  return [
    `The previous message is invalid: ${problem}`,
    "Return only the final user-facing answer now.",
    "Do not include <think>, hidden reasoning, analysis notes, JSON, or another tool call.",
    toolExecutions.length ? "Do not call more tools; use the gathered evidence already in this conversation." : "If you still need evidence, return exactly one valid JSON tool call.",
    observedUrls.length
      ? [
          "Include a Sources line using exact URL(s) from this gathered evidence:",
          ...observedUrls.map((url) => `- ${url}`),
        ].join("\n")
      : "If no evidence was gathered, answer without citations.",
  ].join("\n");
}

function shouldRepairLocalDeepResearchCitations(
  citationValidation: LocalDeepResearchCitationValidationResult,
): boolean {
  return citationValidation.successfulToolEvidenceCount > 0 &&
    (!citationValidation.citationUrls.length || !citationValidation.hasSourcesLine);
}

function localDeepResearchCitationRepairPrompt(
  citationValidation: LocalDeepResearchCitationValidationResult,
  toolExecutions: LocalDeepResearchToolExecution[],
): string {
  const observedUrls = localDeepResearchObservedEvidenceUrls(toolExecutions).slice(0, 12);
  return [
    `The previous final answer failed citation validation: ${citationValidation.detail}`,
    "Return the final user-facing answer again.",
    "Keep the same evidence-grounded conclusions, but include a Sources line with exact URL(s) from the gathered evidence.",
    "Do not include <think>, hidden reasoning, analysis notes, JSON, or another tool call.",
    observedUrls.length
      ? [
          "Use only these observed URLs:",
          ...observedUrls.map((url) => `- ${url}`),
        ].join("\n")
      : "No observed citation URLs are available.",
  ].join("\n");
}

function localDeepResearchFinalOnlyToolCallRejectionPrompt(
  toolExecutions: LocalDeepResearchToolExecution[],
): string {
  const observedUrls = localDeepResearchObservedEvidenceUrls(toolExecutions).slice(0, 12);
  return [
    "Tool calls are closed. Do not search, visit, fetch, browse, or call any tool.",
    "Return exactly one <answer>...</answer> block now.",
    "The answer must be user-facing and must include a Sources line with exact observed URL(s).",
    "Do not include <think>, hidden reasoning, analysis notes, JSON, or tool calls.",
    observedUrls.length
      ? [
          "Use only these observed URLs:",
          ...observedUrls.map((url) => `- ${url}`),
        ].join("\n")
      : "No observed citation URLs are available.",
  ].join("\n");
}

function localDeepResearchCompleteMissingSourcesLine(
  finalText: string,
  citationValidation: LocalDeepResearchCitationValidationResult,
): string | undefined {
  const trimmed = finalText.trim();
  if (!trimmed || citationValidation.hasSourcesLine || citationValidation.unobservedCitationUrls.length) return undefined;
  const sourceUrls = citationValidation.citationUrls.length
    ? citationValidation.citationUrls
    : citationValidation.observedUrls.slice(0, 12);
  if (!sourceUrls.length) return undefined;
  return `${trimmed}\n\nSources: ${sourceUrls.join(", ")}`;
}

function salvageLocalDeepResearchFinalAnswerDraft(
  drafts: LocalDeepResearchFinalAnswerDraft[],
  toolExecutions: LocalDeepResearchToolExecution[],
): { finalText: string; citationValidation: LocalDeepResearchCitationValidationResult } | undefined {
  for (const draft of [...drafts].reverse()) {
    if (draft.rejectedReason) continue;
    const citationValidation = draft.citationValidation ?? validateLocalDeepResearchCitations(draft.text, toolExecutions);
    if (citationValidation.status !== "failed") return { finalText: draft.text, citationValidation };
    const completed = localDeepResearchCompleteMissingSourcesLine(draft.text, citationValidation);
    if (!completed) continue;
    const completedValidation = validateLocalDeepResearchCitations(completed, toolExecutions);
    if (completedValidation.status !== "failed") return { finalText: completed, citationValidation: completedValidation };
  }
  return undefined;
}

async function synthesizeLocalDeepResearchFinalAnswer(input: {
  chat: LocalDeepResearchChatClient;
  setup: LocalDeepResearchSetupContract;
  messages: LocalDeepResearchChatMessage[];
  question: string;
  toolExecutions: LocalDeepResearchToolExecution[];
  finalAnswerDrafts: LocalDeepResearchFinalAnswerDraft[];
  finalSynthesis: LocalDeepResearchFinalSynthesisConfig;
  reason: string;
}): Promise<{ finalText: string; citationValidation: LocalDeepResearchCitationValidationResult } | undefined> {
  if (!input.toolExecutions.some(hasSuccessfulEvidence)) return undefined;
  const prompt = localDeepResearchFinalSynthesisPrompt(input);
  input.messages.push({ role: "user", content: prompt });
  const completion = await input.chat.complete({
    messages: [
      {
        role: "system",
        content: [
          "You are Ambient Local Deep Research final synthesis.",
          "Tools are unavailable in this phase. Write only the final user-facing answer in plain Markdown.",
          "Do not use <think>, <tool_call>, <answer>, JSON, hidden reasoning, or analysis notes.",
          "Include a Sources line with exact URL(s) from the provided evidence packet.",
        ].join("\n"),
      },
      { role: "user", content: prompt },
    ],
    setup: input.setup,
    toolCallCount: input.toolExecutions.length,
  });
  input.messages.push({ role: "assistant", content: completion.content });
  const parsed = parseLocalDeepResearchToolCall(completion.content);
  if (parsed.status !== "final") return undefined;
  const finalAnswerProblem = localDeepResearchFinalAnswerProblem(parsed.text);
  if (finalAnswerProblem) {
    input.finalAnswerDrafts.push({
      text: parsed.text,
      turn: input.messages.length,
      rejectedReason: finalAnswerProblem,
    });
    return undefined;
  }
  const draft = pushLocalDeepResearchFinalAnswerDraft(input.finalAnswerDrafts, parsed.text, input.messages.length);
  const citationValidation = validateLocalDeepResearchCitations(parsed.text, input.toolExecutions);
  draft.citationValidation = citationValidation;
  if (citationValidation.status !== "failed") return { finalText: parsed.text, citationValidation };
  const completed = localDeepResearchCompleteMissingSourcesLine(parsed.text, citationValidation);
  if (!completed) return undefined;
  const completedValidation = validateLocalDeepResearchCitations(completed, input.toolExecutions);
  if (completedValidation.status === "failed") return undefined;
  return { finalText: completed, citationValidation: completedValidation };
}

function localDeepResearchFinalSynthesisPrompt(input: {
  question: string;
  toolExecutions: LocalDeepResearchToolExecution[];
  finalAnswerDrafts: LocalDeepResearchFinalAnswerDraft[];
  finalSynthesis: LocalDeepResearchFinalSynthesisConfig;
  reason: string;
}): string {
  return [
    `Reason for this no-tools final synthesis pass: ${input.reason}`,
    "",
    localDeepResearchEvidencePacket(input),
    "",
    "Write the final user-facing answer now. Use only the evidence above. Include a Sources line with exact observed URL(s).",
  ].join("\n");
}

export function localDeepResearchEvidencePacket(input: {
  question: string;
  toolExecutions: LocalDeepResearchToolExecution[];
  finalAnswerDrafts?: LocalDeepResearchFinalAnswerDraft[];
  finalSynthesis: LocalDeepResearchFinalSynthesisConfig;
  reason?: string;
}): string {
  const observedUrls = localDeepResearchObservedEvidenceUrls(input.toolExecutions).slice(0, input.finalSynthesis.sourceLimit);
  return [
    "# Local Deep Research Evidence Packet",
    "",
    input.reason ? `Reason: ${input.reason}` : undefined,
    `Question: ${input.question}`,
    `Final synthesis mode: ${input.finalSynthesis.mode}`,
    "",
    "## Observed URLs",
    observedUrls.length ? observedUrls.map((url) => `- ${url}`).join("\n") : "- none",
    "",
    "## Evidence Notes",
    input.toolExecutions.length
      ? input.toolExecutions.map((execution, index) => localDeepResearchEvidencePacketToolNote(execution, index, input.finalSynthesis.evidencePreviewChars)).join("\n\n")
      : "No tool calls were executed.",
    input.finalAnswerDrafts?.length ? "" : undefined,
    input.finalAnswerDrafts?.length ? "## Local Drafts" : undefined,
    input.finalAnswerDrafts?.length
      ? input.finalAnswerDrafts.map((draft, index) => [
          `Draft ${index + 1} (turn ${draft.turn}${draft.rejectedReason ? `, rejected: ${draft.rejectedReason}` : ""})`,
          draft.text.trim(),
        ].join("\n")).join("\n\n")
      : undefined,
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function localDeepResearchEvidencePacketToolNote(
  execution: LocalDeepResearchToolExecution,
  index: number,
  evidencePreviewChars: number,
): string {
  const attempts = execution.result.attempts.map((attempt) => `${attempt.providerId}:${attempt.status}`).join(", ") || "none";
  const artifact = execution.result.textOutputPath
    ?? (typeof execution.result.metadata?.textOutput === "object" && execution.result.metadata.textOutput && "artifactPath" in execution.result.metadata.textOutput
      ? String((execution.result.metadata.textOutput as Record<string, unknown>).artifactPath ?? "")
      : "");
  const preview = execution.result.text.trim().slice(0, evidencePreviewChars).trim();
  return [
    `### ${index + 1}. ${execution.call.name}`,
    `Provider: ${execution.result.selectedProvider ?? "unknown"}`,
    `Attempts: ${attempts}`,
    execution.call.name === "visit" ? `URL: ${execution.call.arguments.url}` : undefined,
    execution.call.name === "search" ? `Query: ${execution.call.arguments.query}` : undefined,
    artifact ? `Full output artifact: ${artifact}` : undefined,
    "",
    preview || "(empty evidence text)",
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function localDeepResearchEvidencePacketCitationValidation(
  toolExecutions: LocalDeepResearchToolExecution[],
): LocalDeepResearchCitationValidationResult {
  const observedUrls = localDeepResearchObservedEvidenceUrls(toolExecutions);
  return {
    status: observedUrls.length ? "passed" : "skipped",
    citationUrls: observedUrls,
    observedUrls,
    unobservedCitationUrls: [],
    hasSourcesLine: observedUrls.length > 0,
    successfulToolEvidenceCount: toolExecutions.filter(hasSuccessfulEvidence).length,
    detail: observedUrls.length
      ? `${observedUrls.length} observed evidence URL(s) are available for parent final synthesis.`
      : "No observed evidence URLs were available for parent final synthesis.",
  };
}

export function validateLocalDeepResearchCitations(
  finalText: string,
  toolExecutions: LocalDeepResearchToolExecution[],
): LocalDeepResearchCitationValidationResult {
  const citationUrls = extractCitationUrls(finalText);
  const observedUrls = localDeepResearchObservedEvidenceUrls(toolExecutions);
  const observedKeys = new Set(observedUrls.map(comparableCitationUrl));
  const unobservedCitationUrls = citationUrls.filter((url) => !observedKeys.has(comparableCitationUrl(url)));
  const hasSourcesLine = /^sources?\s*:/im.test(finalText);
  const successfulToolEvidenceCount = toolExecutions.filter(hasSuccessfulEvidence).length;

  if (!citationUrls.length && successfulToolEvidenceCount === 0) {
    return {
      status: "skipped",
      citationUrls,
      observedUrls,
      unobservedCitationUrls,
      hasSourcesLine,
      successfulToolEvidenceCount,
      detail: "No tool evidence or citation URLs were present.",
    };
  }
  if (!citationUrls.length) {
    return {
      status: "failed",
      citationUrls,
      observedUrls,
      unobservedCitationUrls,
      hasSourcesLine,
      successfulToolEvidenceCount,
      detail: "Final answer did not include any citation URLs from gathered Local Deep Research evidence.",
    };
  }
  if (unobservedCitationUrls.length) {
    return {
      status: "failed",
      citationUrls,
      observedUrls,
      unobservedCitationUrls,
      hasSourcesLine,
      successfulToolEvidenceCount,
      detail: `Final answer cited URL(s) not observed in successful Local Deep Research tool evidence: ${unobservedCitationUrls.join(", ")}.`,
    };
  }
  if (successfulToolEvidenceCount > 0 && !hasSourcesLine) {
    return {
      status: "failed",
      citationUrls,
      observedUrls,
      unobservedCitationUrls,
      hasSourcesLine,
      successfulToolEvidenceCount,
      detail: "Final answer cited observed URLs but did not include a Source or Sources line.",
    };
  }
  return {
    status: "passed",
    citationUrls,
    observedUrls,
    unobservedCitationUrls,
    hasSourcesLine,
    successfulToolEvidenceCount,
    detail: `${citationUrls.length} citation URL(s) matched successful Local Deep Research tool evidence.`,
  };
}

export function localDeepResearchObservedEvidenceUrls(toolExecutions: LocalDeepResearchToolExecution[]): string[] {
  const urls: string[] = [];
  for (const execution of toolExecutions) {
    if (!hasSuccessfulEvidence(execution)) continue;
    if (execution.call.name === "visit") urls.push(execution.call.arguments.url);
    urls.push(...extractCitationUrls(execution.result.text));
    urls.push(...extractCitationUrls(execution.observation));
  }
  return uniqueUrls(urls);
}

function hasSuccessfulEvidence(execution: LocalDeepResearchToolExecution): boolean {
  return execution.result.attempts.length === 0 || execution.result.attempts.some((attempt) => attempt.status === "succeeded");
}

function extractCitationUrls(text: string): string[] {
  const urls = [...text.matchAll(/https?:\/\/[^\s)\]】}>"']+/gi)]
    .map((match) => normalizeCitationUrl(match[0]))
    .filter((url): url is string => Boolean(url));
  return uniqueUrls(urls);
}

function uniqueUrls(urls: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const url of urls) {
    const key = comparableCitationUrl(url);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, url);
  }
  return [...byKey.values()];
}

function normalizeCitationUrl(value: string): string | undefined {
  const trimmed = value.trim().replace(/[)\]】}>".,;:]+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function comparableCitationUrl(value: string): string {
  return normalizeCitationUrl(value)?.toLowerCase() ?? "";
}
