import { parseLocalDeepResearchToolCall, type LocalDeepResearchToolExecution } from "./localDeepResearchAdapter";
import type {
  LocalDeepResearchChatClient,
  LocalDeepResearchChatMessage,
  LocalDeepResearchCitationValidationResult,
  LocalDeepResearchFinalAnswerDraft,
  LocalDeepResearchRunInput,
  LocalDeepResearchRunProgressEvent,
  LocalDeepResearchRunResult,
} from "./localDeepResearchRunner";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { localDeepResearchToolBudgetState } from "../../shared/localDeepResearchBudget";
import type {
  LocalDeepResearchFinalSynthesisConfig,
  LocalDeepResearchRunBudget,
  LocalDeepResearchToolBudgetState,
} from "../../shared/localRuntimeTypes";

type LocalDeepResearchRunBase = () => Omit<LocalDeepResearchRunResult, "status">;

type LocalDeepResearchReturnResult = {
  action: "return";
  result: LocalDeepResearchRunResult;
};

type LocalDeepResearchFinalAnswerContinueResult = {
  action: "continue";
  finalAnswerRepairAttempts: number;
  citationRepairAttempts: number;
  finalAnswerOnly: boolean;
};

type LocalDeepResearchFinalOnlyToolCallContinueResult = {
  action: "continue";
  finalOnlyToolCallRejections: number;
};

export async function handleLocalDeepResearchFinalAnswer(input: {
  runInput: LocalDeepResearchRunInput;
  base: LocalDeepResearchRunBase;
  budget: LocalDeepResearchRunBudget;
  question: string;
  messages: LocalDeepResearchChatMessage[];
  toolExecutions: LocalDeepResearchToolExecution[];
  finalAnswerDrafts: LocalDeepResearchFinalAnswerDraft[];
  finalSynthesis: LocalDeepResearchFinalSynthesisConfig;
  text: string;
  turnIndex: number;
  maxTurns: number;
  maxToolCalls: number;
  finalAnswerRepairAttempts: number;
  citationRepairAttempts: number;
}): Promise<LocalDeepResearchReturnResult | LocalDeepResearchFinalAnswerContinueResult> {
  const turnNumber = input.turnIndex + 1;
  emitLocalDeepResearchRunProgress(input.runInput, {
    stage: "final-answer-draft",
    message: `LiteResearcher returned a final answer draft on turn ${turnNumber}/${input.maxTurns}.`,
    turn: turnNumber,
    maxTurns: input.maxTurns,
    toolCalls: input.toolExecutions.length,
    maxToolCalls: input.maxToolCalls,
    outputChars: input.text.length,
  });
  const draft = pushLocalDeepResearchFinalAnswerDraft(input.finalAnswerDrafts, input.text, input.turnIndex);
  const finalAnswerProblem = localDeepResearchFinalAnswerProblem(input.text);
  if (finalAnswerProblem) {
    draft.rejectedReason = finalAnswerProblem;
    emitLocalDeepResearchRunProgress(input.runInput, {
      stage: "final-synthesis-repair",
      message: "LiteResearcher final answer needs a cleanup synthesis pass.",
      turn: turnNumber,
      maxTurns: input.maxTurns,
      toolCalls: input.toolExecutions.length,
      maxToolCalls: input.maxToolCalls,
      error: finalAnswerProblem,
    });
    const synthesized = await synthesizeLocalDeepResearchFinalAnswer({
      chat: input.runInput.chat,
      setup: input.runInput.setup,
      messages: input.messages,
      question: input.question,
      toolExecutions: input.toolExecutions,
      finalAnswerDrafts: input.finalAnswerDrafts,
      finalSynthesis: input.finalSynthesis,
      toolBudget: localDeepResearchToolBudgetState(input.budget, input.toolExecutions.length),
      reason: finalAnswerProblem,
    });
    if (synthesized) {
      emitLocalDeepResearchRunProgress(input.runInput, {
        stage: "completed",
        message: "Local Deep Research completed after final-answer repair.",
        turn: turnNumber,
        maxTurns: input.maxTurns,
        toolCalls: input.toolExecutions.length,
        maxToolCalls: input.maxToolCalls,
        status: "completed",
        outputChars: synthesized.finalText.length,
      });
      return {
        action: "return",
        result: {
          ...input.base(),
          status: "completed",
          finalText: synthesized.finalText,
          citationValidation: synthesized.citationValidation,
        },
      };
    }
    if (input.finalAnswerRepairAttempts < 1 && turnNumber < input.maxTurns) {
      input.messages.push({
        role: "user",
        content: localDeepResearchFinalAnswerRepairPrompt(finalAnswerProblem, input.toolExecutions),
      });
      return {
        action: "continue",
        finalAnswerRepairAttempts: input.finalAnswerRepairAttempts + 1,
        citationRepairAttempts: input.citationRepairAttempts,
        finalAnswerOnly: input.toolExecutions.length > 0,
      };
    }
    emitLocalDeepResearchRunProgress(input.runInput, {
      stage: "invalid-final-answer",
      message: "Local Deep Research stopped because the final answer remained invalid.",
      turn: turnNumber,
      maxTurns: input.maxTurns,
      toolCalls: input.toolExecutions.length,
      maxToolCalls: input.maxToolCalls,
      status: "invalid-final-answer",
      error: finalAnswerProblem,
    });
    return {
      action: "return",
      result: {
        ...input.base(),
        status: "invalid-final-answer",
        error: finalAnswerProblem,
      },
    };
  }

  const citationValidation = validateLocalDeepResearchCitations(input.text, input.toolExecutions);
  draft.citationValidation = citationValidation;
  if (input.finalSynthesis.mode === "evidence_only" && input.toolExecutions.length > 0) {
    emitLocalDeepResearchRunProgress(input.runInput, {
      stage: "synthesis-deferred",
      message: "Local Deep Research gathered evidence and deferred final synthesis.",
      turn: turnNumber,
      maxTurns: input.maxTurns,
      toolCalls: input.toolExecutions.length,
      maxToolCalls: input.maxToolCalls,
      status: "synthesis-deferred",
    });
    return {
      action: "return",
      result: {
        ...input.base(),
        status: "synthesis-deferred",
        finalText: localDeepResearchEvidencePacket({
          question: input.question,
          toolExecutions: input.toolExecutions,
          finalAnswerDrafts: input.finalAnswerDrafts,
          finalSynthesis: input.finalSynthesis,
          reason: "Final synthesis mode is evidence_only.",
        }),
        citationValidation: localDeepResearchEvidencePacketCitationValidation(input.toolExecutions),
      },
    };
  }

  if (citationValidation.status === "failed") {
    const completedCitationText = localDeepResearchCompleteMissingSourcesLine(input.text, citationValidation);
    if (completedCitationText) {
      const completedCitationValidation = validateLocalDeepResearchCitations(completedCitationText, input.toolExecutions);
      if (completedCitationValidation.status !== "failed") {
        emitLocalDeepResearchRunProgress(input.runInput, {
          stage: "completed",
          message: "Local Deep Research completed after completing the Sources line.",
          turn: turnNumber,
          maxTurns: input.maxTurns,
          toolCalls: input.toolExecutions.length,
          maxToolCalls: input.maxToolCalls,
          status: "completed",
          outputChars: completedCitationText.length,
        });
        return {
          action: "return",
          result: {
            ...input.base(),
            status: "completed",
            finalText: completedCitationText,
            citationValidation: completedCitationValidation,
          },
        };
      }
    }
    if (shouldRepairLocalDeepResearchCitations(citationValidation) && input.citationRepairAttempts < 1 && turnNumber < input.maxTurns) {
      emitLocalDeepResearchRunProgress(input.runInput, {
        stage: "citation-repair",
        message: "LiteResearcher final answer cited evidence that needs repair.",
        turn: turnNumber,
        maxTurns: input.maxTurns,
        toolCalls: input.toolExecutions.length,
        maxToolCalls: input.maxToolCalls,
        error: citationValidation.detail,
      });
      input.messages.push({
        role: "user",
        content: localDeepResearchCitationRepairPrompt(citationValidation, input.toolExecutions),
      });
      return {
        action: "continue",
        finalAnswerRepairAttempts: input.finalAnswerRepairAttempts,
        citationRepairAttempts: input.citationRepairAttempts + 1,
        finalAnswerOnly: true,
      };
    }
    emitLocalDeepResearchRunProgress(input.runInput, {
      stage: "citation-validation-failed",
      message: "Local Deep Research stopped because citation validation failed.",
      turn: turnNumber,
      maxTurns: input.maxTurns,
      toolCalls: input.toolExecutions.length,
      maxToolCalls: input.maxToolCalls,
      status: "citation-validation-failed",
      error: citationValidation.detail,
    });
    return {
      action: "return",
      result: {
        ...input.base(),
        status: "citation-validation-failed",
        finalText: input.text,
        citationValidation,
        error: citationValidation.detail,
      },
    };
  }

  emitLocalDeepResearchRunProgress(input.runInput, {
    stage: "completed",
    message: "Local Deep Research completed.",
    turn: turnNumber,
    maxTurns: input.maxTurns,
    toolCalls: input.toolExecutions.length,
    maxToolCalls: input.maxToolCalls,
    status: "completed",
    outputChars: input.text.length,
  });
  return {
    action: "return",
    result: {
      ...input.base(),
      status: "completed",
      finalText: input.text,
      citationValidation,
    },
  };
}

export async function handleLocalDeepResearchFinalOnlyToolCall(input: {
  runInput: LocalDeepResearchRunInput;
  base: LocalDeepResearchRunBase;
  budget: LocalDeepResearchRunBudget;
  question: string;
  messages: LocalDeepResearchChatMessage[];
  toolExecutions: LocalDeepResearchToolExecution[];
  finalAnswerDrafts: LocalDeepResearchFinalAnswerDraft[];
  finalSynthesis: LocalDeepResearchFinalSynthesisConfig;
  turnNumber: number;
  maxTurns: number;
  maxToolCalls: number;
  finalOnlyToolCallRejections: number;
}): Promise<LocalDeepResearchReturnResult | LocalDeepResearchFinalOnlyToolCallContinueResult> {
  const salvaged = salvageLocalDeepResearchFinalAnswerDraft(input.finalAnswerDrafts, input.toolExecutions);
  if (salvaged) {
    return {
      action: "return",
      result: {
        ...input.base(),
        status: "completed",
        finalText: salvaged.finalText,
        citationValidation: salvaged.citationValidation,
      },
    };
  }
  const synthesized = await synthesizeLocalDeepResearchFinalAnswer({
    chat: input.runInput.chat,
    setup: input.runInput.setup,
    messages: input.messages,
    question: input.question,
    toolExecutions: input.toolExecutions,
    finalAnswerDrafts: input.finalAnswerDrafts,
    finalSynthesis: input.finalSynthesis,
    toolBudget: localDeepResearchToolBudgetState(input.budget, input.toolExecutions.length),
    reason: "LiteResearcher attempted another tool call while final synthesis was required.",
  });
  if (synthesized) {
    emitLocalDeepResearchRunProgress(input.runInput, {
      stage: "completed",
      message: "Local Deep Research completed after rejecting an extra tool call.",
      turn: input.turnNumber,
      maxTurns: input.maxTurns,
      toolCalls: input.toolExecutions.length,
      maxToolCalls: input.maxToolCalls,
      status: "completed",
      outputChars: synthesized.finalText.length,
    });
    return {
      action: "return",
      result: {
        ...input.base(),
        status: "completed",
        finalText: synthesized.finalText,
        citationValidation: synthesized.citationValidation,
      },
    };
  }
  if (input.finalOnlyToolCallRejections < 1 && input.turnNumber < input.maxTurns) {
    emitLocalDeepResearchRunProgress(input.runInput, {
      stage: "final-synthesis-repair",
      message: "LiteResearcher tried another tool call while final synthesis was required.",
      turn: input.turnNumber,
      maxTurns: input.maxTurns,
      toolCalls: input.toolExecutions.length,
      maxToolCalls: input.maxToolCalls,
    });
    input.messages.push({
      role: "user",
      content: localDeepResearchFinalOnlyToolCallRejectionPrompt(input.toolExecutions),
    });
    return {
      action: "continue",
      finalOnlyToolCallRejections: input.finalOnlyToolCallRejections + 1,
    };
  }
  emitLocalDeepResearchRunProgress(input.runInput, {
    stage: "invalid-final-answer",
    message: "Local Deep Research stopped because LiteResearcher kept calling tools after final synthesis was required.",
    turn: input.turnNumber,
    maxTurns: input.maxTurns,
    toolCalls: input.toolExecutions.length,
    maxToolCalls: input.maxToolCalls,
    status: "invalid-final-answer",
    error: "LiteResearcher attempted another tool call after final-answer repair; Local Deep Research needed a final user-facing answer.",
  });
  return {
    action: "return",
    result: {
      ...input.base(),
      status: "invalid-final-answer",
      error: "LiteResearcher attempted another tool call after final-answer repair; Local Deep Research needed a final user-facing answer.",
    },
  };
}

export async function localDeepResearchBudgetExhaustedResult(input: {
  input: LocalDeepResearchRunInput;
  base: LocalDeepResearchRunBase;
  budget: LocalDeepResearchRunBudget;
  question: string;
  toolExecutions: LocalDeepResearchToolExecution[];
  finalAnswerDrafts: LocalDeepResearchFinalAnswerDraft[];
  finalSynthesis: LocalDeepResearchFinalSynthesisConfig;
  finalSynthesisReserveTurns: number;
  turn: number;
  maxTurns: number;
}): Promise<LocalDeepResearchRunResult> {
  const reason = `Local Deep Research used all ${input.budget.maxToolCalls} ${input.budget.maxToolCalls === 1 ? "tool call" : "tool calls"} for this ${input.budget.effort} effort run.`;
  emitLocalDeepResearchRunProgress(input.input, {
    stage: "final-synthesis-repair",
    message: `Local Deep Research exhausted the evidence tool budget; forcing no-tools final synthesis with ${input.finalSynthesisReserveTurns} reserved turn(s).`,
    turn: input.turn,
    maxTurns: input.maxTurns,
    toolCalls: input.toolExecutions.length,
    maxToolCalls: input.budget.maxToolCalls,
  });
  if (!input.toolExecutions.length) {
    const nextAction =
      input.budget.onExhausted === "summarize"
        ? "No gathered evidence is available to summarize."
        : "Ask the user whether to continue with an explicit additional tool-call budget.";
    const error = `${reason} ${nextAction}`;
    emitLocalDeepResearchRunProgress(input.input, {
      stage: "tool-budget-exceeded",
      message: `Local Deep Research used ${input.toolExecutions.length}/${input.budget.maxToolCalls} tool calls before final synthesis.`,
      turn: input.turn,
      maxTurns: input.maxTurns,
      toolCalls: input.toolExecutions.length,
      maxToolCalls: input.budget.maxToolCalls,
      status: "tool-budget-exceeded",
      error: `Local Deep Research exceeded its ${input.budget.maxToolCalls} tool-call budget.`,
    });
    return {
      ...input.base(),
      status: "tool-budget-exceeded",
      error,
    };
  }
  const synthesisReason = `${reason} Final synthesis is using the reserved no-tools turn budget.`;
  if (input.finalSynthesis.mode !== "evidence_only") {
    const synthesized = await synthesizeLocalDeepResearchFinalAnswer({
      chat: input.input.chat,
      setup: input.input.setup,
      messages: input.base().messages,
      question: input.question,
      toolExecutions: input.toolExecutions,
      finalAnswerDrafts: input.finalAnswerDrafts,
      finalSynthesis: input.finalSynthesis,
      toolBudget: localDeepResearchToolBudgetState(input.budget, input.toolExecutions.length),
      reason: synthesisReason,
      maxAttempts: input.finalSynthesisReserveTurns,
    });
    if (synthesized) {
      emitLocalDeepResearchRunProgress(input.input, {
        stage: "completed",
        message: "Local Deep Research completed with reserved final synthesis after exhausting the evidence tool budget.",
        turn: input.turn,
        maxTurns: input.maxTurns,
        toolCalls: input.toolExecutions.length,
        maxToolCalls: input.budget.maxToolCalls,
        status: "completed",
        outputChars: synthesized.finalText.length,
      });
      return {
        ...input.base(),
        status: "completed",
        finalText: synthesized.finalText,
        citationValidation: synthesized.citationValidation,
      };
    }
  }
  emitLocalDeepResearchRunProgress(input.input, {
    stage: "synthesis-deferred",
    message: "Local Deep Research exhausted the evidence tool budget and returned a synthesis-ready evidence packet.",
    turn: input.turn,
    maxTurns: input.maxTurns,
    toolCalls: input.toolExecutions.length,
    maxToolCalls: input.budget.maxToolCalls,
    status: "synthesis-deferred",
  });
  return {
    ...input.base(),
    status: "synthesis-deferred",
    finalText: localDeepResearchEvidencePacket({
      question: input.question,
      toolExecutions: input.toolExecutions,
      finalAnswerDrafts: input.finalAnswerDrafts,
      finalSynthesis: input.finalSynthesis,
      reason:
        input.finalSynthesis.mode === "evidence_only"
          ? `${reason} Final synthesis mode is evidence_only.`
          : `${reason} Reserved local final synthesis did not produce a valid cited answer.`,
    }),
    citationValidation: localDeepResearchEvidencePacketCitationValidation(input.toolExecutions),
  };
}

function emitLocalDeepResearchRunProgress(input: LocalDeepResearchRunInput, progress: LocalDeepResearchRunProgressEvent): void {
  input.onProgress?.(progress);
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

function localDeepResearchFinalAnswerRepairPrompt(problem: string, toolExecutions: LocalDeepResearchToolExecution[]): string {
  const observedUrls = localDeepResearchObservedEvidenceUrls(toolExecutions).slice(0, 12);
  return [
    `The previous message is invalid: ${problem}`,
    "Return only the final user-facing answer now.",
    "Do not include <think>, hidden reasoning, analysis notes, JSON, or another tool call.",
    toolExecutions.length
      ? "Do not call more tools; use the gathered evidence already in this conversation."
      : "If you still need evidence, return exactly one valid JSON tool call.",
    observedUrls.length
      ? ["Include a Sources line using exact URL(s) from this gathered evidence:", ...observedUrls.map((url) => `- ${url}`)].join("\n")
      : "If no evidence was gathered, answer without citations.",
  ].join("\n");
}

function shouldRepairLocalDeepResearchCitations(citationValidation: LocalDeepResearchCitationValidationResult): boolean {
  return (
    citationValidation.successfulToolEvidenceCount > 0 && (!citationValidation.citationUrls.length || !citationValidation.hasSourcesLine)
  );
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
      ? ["Use only these observed URLs:", ...observedUrls.map((url) => `- ${url}`)].join("\n")
      : "No observed citation URLs are available.",
  ].join("\n");
}

function localDeepResearchFinalOnlyToolCallRejectionPrompt(toolExecutions: LocalDeepResearchToolExecution[]): string {
  const observedUrls = localDeepResearchObservedEvidenceUrls(toolExecutions).slice(0, 12);
  return [
    "Tool calls are closed. Do not search, visit, fetch, browse, or call any tool.",
    "Return exactly one <answer>...</answer> block now.",
    "The answer must be user-facing and must include a Sources line with exact observed URL(s).",
    "Do not include <think>, hidden reasoning, analysis notes, JSON, or tool calls.",
    observedUrls.length
      ? ["Use only these observed URLs:", ...observedUrls.map((url) => `- ${url}`)].join("\n")
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
  toolBudget: LocalDeepResearchToolBudgetState;
  reason: string;
  maxAttempts?: number;
}): Promise<{ finalText: string; citationValidation: LocalDeepResearchCitationValidationResult } | undefined> {
  if (!input.toolExecutions.some(hasSuccessfulEvidence)) return undefined;
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? 1));
  let reason = input.reason;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const prompt = localDeepResearchFinalSynthesisPrompt({ ...input, reason });
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
      toolBudget: input.toolBudget,
    });
    input.messages.push({ role: "assistant", content: completion.content });
    const parsed = parseLocalDeepResearchToolCall(completion.content);
    if (parsed.status !== "final") {
      reason = "The previous no-tools final synthesis attempt did not return a valid final answer.";
      continue;
    }
    const finalAnswerProblem = localDeepResearchFinalAnswerProblem(parsed.text);
    if (finalAnswerProblem) {
      input.finalAnswerDrafts.push({
        text: parsed.text,
        turn: input.messages.length,
        rejectedReason: finalAnswerProblem,
      });
      reason = finalAnswerProblem;
      continue;
    }
    const draft = pushLocalDeepResearchFinalAnswerDraft(input.finalAnswerDrafts, parsed.text, input.messages.length);
    const citationValidation = validateLocalDeepResearchCitations(parsed.text, input.toolExecutions);
    draft.citationValidation = citationValidation;
    if (citationValidation.status !== "failed") return { finalText: parsed.text, citationValidation };
    const completed = localDeepResearchCompleteMissingSourcesLine(parsed.text, citationValidation);
    if (completed) {
      const completedValidation = validateLocalDeepResearchCitations(completed, input.toolExecutions);
      if (completedValidation.status !== "failed") return { finalText: completed, citationValidation: completedValidation };
    }
    reason = citationValidation.detail;
  }
  return undefined;
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
      ? input.toolExecutions
          .map((execution, index) => localDeepResearchEvidencePacketToolNote(execution, index, input.finalSynthesis.evidencePreviewChars))
          .join("\n\n")
      : "No tool calls were executed.",
    input.finalAnswerDrafts?.length ? "" : undefined,
    input.finalAnswerDrafts?.length ? "## Local Drafts" : undefined,
    input.finalAnswerDrafts?.length
      ? input.finalAnswerDrafts
          .map((draft, index) =>
            [
              `Draft ${index + 1} (turn ${draft.turn}${draft.rejectedReason ? `, rejected: ${draft.rejectedReason}` : ""})`,
              draft.text.trim(),
            ].join("\n"),
          )
          .join("\n\n")
      : undefined,
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

function localDeepResearchEvidencePacketToolNote(
  execution: LocalDeepResearchToolExecution,
  index: number,
  evidencePreviewChars: number,
): string {
  const attempts = execution.result.attempts.map((attempt) => `${attempt.providerId}:${attempt.status}`).join(", ") || "none";
  const artifact =
    execution.result.textOutputPath ??
    (typeof execution.result.metadata?.textOutput === "object" &&
    execution.result.metadata.textOutput &&
    "artifactPath" in execution.result.metadata.textOutput
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
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
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
