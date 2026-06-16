import {
  buildLocalDeepResearchSystemPrompt,
  executeLocalDeepResearchToolCall,
  parseLocalDeepResearchToolCall,
  type LocalDeepResearchBroker,
  type LocalDeepResearchToolExecution,
} from "./localDeepResearchAdapter";
import { normalizeLocalDeepResearchFinalSynthesisConfig } from "./localDeepResearchProviderStack";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import type {
  LocalDeepResearchFinalSynthesisConfig,
  LocalDeepResearchRunBudget,
  LocalDeepResearchToolBudgetState,
} from "../shared/types";
import {
  localDeepResearchToolBudgetState,
  normalizeLocalDeepResearchRunBudget,
} from "../shared/localDeepResearchBudget";

export const LOCAL_DEEP_RESEARCH_FINAL_SYNTHESIS_RESERVE_TURNS = 3;

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
  toolBudget: LocalDeepResearchToolBudgetState;
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
  localResearchBudget?: LocalDeepResearchRunBudget;
  maxToolCalls?: number;
  maxTurns?: number;
  finalSynthesis?: Partial<LocalDeepResearchFinalSynthesisConfig>;
  onProgress?: (progress: LocalDeepResearchRunProgressEvent) => void;
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
  finalSynthesisReserveTurns: number;
  toolBudget: LocalDeepResearchToolBudgetState;
  messages: LocalDeepResearchChatMessage[];
  toolExecutions: LocalDeepResearchToolExecution[];
  finalAnswerDrafts?: LocalDeepResearchFinalAnswerDraft[];
  citationValidation?: LocalDeepResearchCitationValidationResult;
  finalText?: string;
  error?: string;
}

export type LocalDeepResearchRunProgressStage =
  | "started"
  | "blocked"
  | "model-turn-started"
  | "model-turn-completed"
  | "tool-dispatch"
  | "tool-completed"
  | "final-answer-draft"
  | "final-synthesis-repair"
  | "citation-repair"
  | "synthesis-deferred"
  | "completed"
  | "invalid-tool-call"
  | "invalid-final-answer"
  | "citation-validation-failed"
  | "tool-budget-exceeded"
  | "turn-budget-exceeded";

export interface LocalDeepResearchRunProgressEvent {
  stage: LocalDeepResearchRunProgressStage;
  message: string;
  turn?: number;
  maxTurns: number;
  toolCalls: number;
  maxToolCalls: number;
  toolName?: LocalDeepResearchToolExecution["call"]["name"];
  query?: string;
  url?: string;
  outputChars?: number;
  providerId?: string;
  durationMs?: number;
  repeatedTargetCount?: number;
  status?: LocalDeepResearchRunStatus;
  error?: string;
}

export async function runLocalDeepResearch(input: LocalDeepResearchRunInput): Promise<LocalDeepResearchRunResult> {
  const question = input.question.trim();
  const budget = normalizeLocalDeepResearchRunBudget(input.localResearchBudget, {
    maxToolCalls: input.maxToolCalls,
    source: input.localResearchBudget ? input.localResearchBudget.source : "tool_input",
  });
  const maxToolCalls = budget.maxToolCalls;
  const finalSynthesisReserveTurns = LOCAL_DEEP_RESEARCH_FINAL_SYNTHESIS_RESERVE_TURNS;
  const minimumMaxTurns = maxToolCalls + finalSynthesisReserveTurns;
  const requestedMaxTurns = input.maxTurns !== undefined
    ? Math.max(1, Math.floor(input.maxTurns))
    : minimumMaxTurns;
  const maxTurns = Math.max(requestedMaxTurns, minimumMaxTurns);
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
        finalSynthesisReserveTurns,
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
    finalSynthesisReserveTurns,
    toolBudget: localDeepResearchToolBudgetState(budget, toolExecutions.length),
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
    emitLocalDeepResearchRunProgress(input, {
      stage: "invalid-tool-call",
      message: "Local Deep Research question is required.",
      maxTurns,
      toolCalls: 0,
      maxToolCalls,
      error: "Local Deep Research question is required.",
    });
    return { ...base(), status: "invalid-tool-call", error: "Local Deep Research question is required." };
  }
  if (input.setup.status !== "ready") {
    const error = input.setup.blockers.length
      ? input.setup.blockers.join("\n")
      : "Local Deep Research setup is not ready.";
    emitLocalDeepResearchRunProgress(input, {
      stage: "blocked",
      message: "Local Deep Research setup is not ready.",
      maxTurns,
      toolCalls: 0,
      maxToolCalls,
      status: "blocked",
      error,
    });
    return {
      ...base(),
      status: "blocked",
      error,
    };
  }
  emitLocalDeepResearchRunProgress(input, {
    stage: "started",
    message: `Local Deep Research started with ${maxToolCalls} evidence tool call(s) and ${finalSynthesisReserveTurns} reserved final-synthesis turn(s) (${maxTurns} model turn(s) total).`,
    maxTurns,
    toolCalls: 0,
    maxToolCalls,
  });

  for (let turn = 0; turn < maxTurns; turn += 1) {
    emitLocalDeepResearchRunProgress(input, {
      stage: "model-turn-started",
      message: `LiteResearcher model turn ${turn + 1}/${maxTurns} is running.`,
      turn: turn + 1,
      maxTurns,
      toolCalls: toolExecutions.length,
      maxToolCalls,
    });
    const completion = await input.chat.complete({
      messages: messages.map((message) => ({ ...message })),
      setup: input.setup,
      toolCallCount: toolExecutions.length,
      toolBudget: localDeepResearchToolBudgetState(budget, toolExecutions.length),
    });
    emitLocalDeepResearchRunProgress(input, {
      stage: "model-turn-completed",
      message: `LiteResearcher model turn ${turn + 1}/${maxTurns} returned ${completion.content.length.toLocaleString()} chars.`,
      turn: turn + 1,
      maxTurns,
      toolCalls: toolExecutions.length,
      maxToolCalls,
      outputChars: completion.content.length,
    });
    messages.push({ role: "assistant", content: completion.content });
    const parsed = parseLocalDeepResearchToolCall(completion.content);
    if (parsed.status === "final") {
      emitLocalDeepResearchRunProgress(input, {
        stage: "final-answer-draft",
        message: `LiteResearcher returned a final answer draft on turn ${turn + 1}/${maxTurns}.`,
        turn: turn + 1,
        maxTurns,
        toolCalls: toolExecutions.length,
        maxToolCalls,
        outputChars: parsed.text.length,
      });
      const draft = pushLocalDeepResearchFinalAnswerDraft(finalAnswerDrafts, parsed.text, turn);
      const finalAnswerProblem = localDeepResearchFinalAnswerProblem(parsed.text);
      if (finalAnswerProblem) {
        draft.rejectedReason = finalAnswerProblem;
        emitLocalDeepResearchRunProgress(input, {
          stage: "final-synthesis-repair",
          message: "LiteResearcher final answer needs a cleanup synthesis pass.",
          turn: turn + 1,
          maxTurns,
          toolCalls: toolExecutions.length,
          maxToolCalls,
          error: finalAnswerProblem,
        });
        const synthesized = await synthesizeLocalDeepResearchFinalAnswer({
          chat: input.chat,
          setup: input.setup,
          messages,
          question,
          toolExecutions,
          finalAnswerDrafts,
          finalSynthesis,
          toolBudget: localDeepResearchToolBudgetState(budget, toolExecutions.length),
          reason: finalAnswerProblem,
        });
        if (synthesized) {
          emitLocalDeepResearchRunProgress(input, {
            stage: "completed",
            message: "Local Deep Research completed after final-answer repair.",
            turn: turn + 1,
            maxTurns,
            toolCalls: toolExecutions.length,
            maxToolCalls,
            status: "completed",
            outputChars: synthesized.finalText.length,
          });
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
        emitLocalDeepResearchRunProgress(input, {
          stage: "invalid-final-answer",
          message: "Local Deep Research stopped because the final answer remained invalid.",
          turn: turn + 1,
          maxTurns,
          toolCalls: toolExecutions.length,
          maxToolCalls,
          status: "invalid-final-answer",
          error: finalAnswerProblem,
        });
        return {
          ...base(),
          status: "invalid-final-answer",
          error: finalAnswerProblem,
        };
      }
      const citationValidation = validateLocalDeepResearchCitations(parsed.text, toolExecutions);
      draft.citationValidation = citationValidation;
      if (finalSynthesis.mode === "evidence_only" && toolExecutions.length > 0) {
        emitLocalDeepResearchRunProgress(input, {
          stage: "synthesis-deferred",
          message: "Local Deep Research gathered evidence and deferred final synthesis.",
          turn: turn + 1,
          maxTurns,
          toolCalls: toolExecutions.length,
          maxToolCalls,
          status: "synthesis-deferred",
        });
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
            emitLocalDeepResearchRunProgress(input, {
              stage: "completed",
              message: "Local Deep Research completed after completing the Sources line.",
              turn: turn + 1,
              maxTurns,
              toolCalls: toolExecutions.length,
              maxToolCalls,
              status: "completed",
              outputChars: completedCitationText.length,
            });
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
          emitLocalDeepResearchRunProgress(input, {
            stage: "citation-repair",
            message: "LiteResearcher final answer cited evidence that needs repair.",
            turn: turn + 1,
            maxTurns,
            toolCalls: toolExecutions.length,
            maxToolCalls,
            error: citationValidation.detail,
          });
          messages.push({
            role: "user",
            content: localDeepResearchCitationRepairPrompt(citationValidation, toolExecutions),
          });
          continue;
        }
        emitLocalDeepResearchRunProgress(input, {
          stage: "citation-validation-failed",
          message: "Local Deep Research stopped because citation validation failed.",
          turn: turn + 1,
          maxTurns,
          toolCalls: toolExecutions.length,
          maxToolCalls,
          status: "citation-validation-failed",
          error: citationValidation.detail,
        });
        return {
          ...base(),
          status: "citation-validation-failed",
          finalText: parsed.text,
          citationValidation,
          error: citationValidation.detail,
        };
      }
      emitLocalDeepResearchRunProgress(input, {
        stage: "completed",
        message: "Local Deep Research completed.",
        turn: turn + 1,
        maxTurns,
        toolCalls: toolExecutions.length,
        maxToolCalls,
        status: "completed",
        outputChars: parsed.text.length,
      });
      return { ...base(), status: "completed", finalText: parsed.text, citationValidation };
    }
    if (parsed.status === "invalid") {
      emitLocalDeepResearchRunProgress(input, {
        stage: "invalid-tool-call",
        message: "LiteResearcher returned an invalid tool call.",
        turn: turn + 1,
        maxTurns,
        toolCalls: toolExecutions.length,
        maxToolCalls,
        status: "invalid-tool-call",
        error: parsed.error,
      });
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
        toolBudget: localDeepResearchToolBudgetState(budget, toolExecutions.length),
        reason: "LiteResearcher attempted another tool call while final synthesis was required.",
      });
      if (synthesized) {
        emitLocalDeepResearchRunProgress(input, {
          stage: "completed",
          message: "Local Deep Research completed after rejecting an extra tool call.",
          turn: turn + 1,
          maxTurns,
          toolCalls: toolExecutions.length,
          maxToolCalls,
          status: "completed",
          outputChars: synthesized.finalText.length,
        });
        return {
          ...base(),
          status: "completed",
          finalText: synthesized.finalText,
          citationValidation: synthesized.citationValidation,
        };
      }
      if (finalOnlyToolCallRejections < 1 && turn + 1 < maxTurns) {
        finalOnlyToolCallRejections += 1;
        emitLocalDeepResearchRunProgress(input, {
          stage: "final-synthesis-repair",
          message: "LiteResearcher tried another tool call while final synthesis was required.",
          turn: turn + 1,
          maxTurns,
          toolCalls: toolExecutions.length,
          maxToolCalls,
        });
        messages.push({
          role: "user",
          content: localDeepResearchFinalOnlyToolCallRejectionPrompt(toolExecutions),
        });
        continue;
      }
      emitLocalDeepResearchRunProgress(input, {
        stage: "invalid-final-answer",
        message: "Local Deep Research stopped because LiteResearcher kept calling tools after final synthesis was required.",
        turn: turn + 1,
        maxTurns,
        toolCalls: toolExecutions.length,
        maxToolCalls,
        status: "invalid-final-answer",
        error: "LiteResearcher attempted another tool call after final-answer repair; Local Deep Research needed a final user-facing answer.",
      });
      return {
        ...base(),
        status: "invalid-final-answer",
        error: "LiteResearcher attempted another tool call after final-answer repair; Local Deep Research needed a final user-facing answer.",
      };
    }
    if (toolExecutions.length >= maxToolCalls) {
      return await localDeepResearchBudgetExhaustedResult({
        input,
        base,
        budget,
        question,
        toolExecutions,
        finalAnswerDrafts,
        finalSynthesis,
        finalSynthesisReserveTurns,
        turn: turn + 1,
        maxTurns,
      });
    }
    emitLocalDeepResearchRunProgress(input, {
      stage: "tool-dispatch",
      message: localDeepResearchToolDispatchMessage(parsed.call, toolExecutions.length + 1, maxToolCalls),
      turn: turn + 1,
      maxTurns,
      toolCalls: toolExecutions.length,
      maxToolCalls,
      toolName: parsed.call.name,
      repeatedTargetCount: localDeepResearchRepeatedTargetCount(toolExecutions, parsed.call),
      ...(parsed.call.name === "search" ? { query: parsed.call.arguments.query } : { url: parsed.call.arguments.url }),
    });
    const toolStartedAt = Date.now();
    const execution = await executeLocalDeepResearchToolCall(parsed.call, input.broker);
    toolExecutions.push(execution);
    const postToolBudget = localDeepResearchToolBudgetState(budget, toolExecutions.length);
    emitLocalDeepResearchRunProgress(input, {
      stage: "tool-completed",
      message: localDeepResearchToolCompletedMessage(execution, toolExecutions.length, maxToolCalls),
      turn: turn + 1,
      maxTurns,
      toolCalls: toolExecutions.length,
      maxToolCalls,
      toolName: execution.call.name,
      repeatedTargetCount: localDeepResearchRepeatedTargetCount(toolExecutions.slice(0, -1), execution.call),
      ...(execution.call.name === "search" ? { query: execution.call.arguments.query } : { url: execution.call.arguments.url }),
      providerId: execution.result.selectedProvider,
      durationMs: Date.now() - toolStartedAt,
      outputChars: execution.result.text.length,
    });
    messages.push({
      role: "tool",
      name: execution.call.name,
      toolCallId: execution.call.id,
      content: [
        execution.observation,
        "",
        localDeepResearchToolBudgetObservation(postToolBudget),
      ].join("\n"),
    });
  }

  emitLocalDeepResearchRunProgress(input, {
    stage: "turn-budget-exceeded",
    message: `Local Deep Research used ${maxTurns}/${maxTurns} turns before final synthesis.`,
    maxTurns,
    toolCalls: toolExecutions.length,
    maxToolCalls,
    status: "turn-budget-exceeded",
    error: `Local Deep Research exceeded its ${maxTurns} turn budget.`,
  });
  return {
    ...base(),
    status: "turn-budget-exceeded",
    error: `Local Deep Research exceeded its ${maxTurns} turn budget.`,
  };
}

async function localDeepResearchBudgetExhaustedResult(input: {
  input: LocalDeepResearchRunInput;
  base: () => Omit<LocalDeepResearchRunResult, "status">;
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
    const nextAction = input.budget.onExhausted === "summarize"
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
      reason: input.finalSynthesis.mode === "evidence_only"
        ? `${reason} Final synthesis mode is evidence_only.`
        : `${reason} Reserved local final synthesis did not produce a valid cited answer.`,
    }),
    citationValidation: localDeepResearchEvidencePacketCitationValidation(input.toolExecutions),
  };
}

function localDeepResearchToolBudgetObservation(toolBudget: LocalDeepResearchToolBudgetState): string {
  return `<budget_state>${JSON.stringify(toolBudget)}</budget_state>`;
}

function localDeepResearchRepeatedTargetCount(
  toolExecutions: LocalDeepResearchToolExecution[],
  call: LocalDeepResearchToolExecution["call"],
): number | undefined {
  const count = toolExecutions.filter((execution) => {
    if (call.name === "search") {
      return execution.call.name === "search" && execution.call.arguments.query === call.arguments.query;
    }
    return execution.call.name === "visit" && execution.call.arguments.url === call.arguments.url;
  }).length;
  return count > 0 ? count + 1 : undefined;
}

function emitLocalDeepResearchRunProgress(
  input: LocalDeepResearchRunInput,
  progress: LocalDeepResearchRunProgressEvent,
): void {
  input.onProgress?.(progress);
}

function localDeepResearchToolDispatchMessage(
  call: LocalDeepResearchToolExecution["call"],
  nextToolCallCount: number,
  maxToolCalls: number,
): string {
  if (call.name === "search") {
    return `Local Deep Research is searching for "${call.arguments.query}" (${nextToolCallCount}/${maxToolCalls} tool calls).`;
  }
  return `Local Deep Research is reading ${call.arguments.url} (${nextToolCallCount}/${maxToolCalls} tool calls).`;
}

function localDeepResearchToolCompletedMessage(
  execution: LocalDeepResearchToolExecution,
  toolCallCount: number,
  maxToolCalls: number,
): string {
  const provider = execution.result.selectedProvider ? ` via ${execution.result.selectedProvider}` : "";
  return `Local Deep Research completed ${execution.call.name}${provider} (${toolCallCount}/${maxToolCalls} tool calls, ${execution.result.text.length.toLocaleString()} chars).`;
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
