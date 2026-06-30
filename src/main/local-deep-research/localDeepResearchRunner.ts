import {
  buildLocalDeepResearchSystemPrompt,
  executeLocalDeepResearchToolCall,
  parseLocalDeepResearchToolCall,
} from "./localDeepResearchAdapter";
import {
  handleLocalDeepResearchFinalAnswer,
  handleLocalDeepResearchFinalOnlyToolCall,
  localDeepResearchBudgetExhaustedResult,
} from "./localDeepResearchFinalAnswer";
import { normalizeLocalDeepResearchFinalSynthesisConfig } from "./localDeepResearchProviderStack";
import type { LocalDeepResearchToolBudgetState } from "../../shared/localRuntimeTypes";
import type {
  LocalDeepResearchChatMessage,
  LocalDeepResearchFinalAnswerDraft,
  LocalDeepResearchRunInput,
  LocalDeepResearchRunProgressEvent,
  LocalDeepResearchRunResult,
  LocalDeepResearchToolExecution,
} from "./localDeepResearchTypes";
import { localDeepResearchToolBudgetState, normalizeLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";

export {
  localDeepResearchEvidencePacket,
  localDeepResearchObservedEvidenceUrls,
  validateLocalDeepResearchCitations,
} from "./localDeepResearchFinalAnswer";

export const LOCAL_DEEP_RESEARCH_FINAL_SYNTHESIS_RESERVE_TURNS = 3;

export type {
  LocalDeepResearchChatClient,
  LocalDeepResearchChatCompletion,
  LocalDeepResearchChatCompletionInput,
  LocalDeepResearchChatMessage,
  LocalDeepResearchCitationValidationResult,
  LocalDeepResearchCitationValidationStatus,
  LocalDeepResearchFinalAnswerDraft,
  LocalDeepResearchMessageRole,
  LocalDeepResearchRunInput,
  LocalDeepResearchRunProgressEvent,
  LocalDeepResearchRunProgressStage,
  LocalDeepResearchRunResult,
  LocalDeepResearchRunStatus,
} from "./localDeepResearchTypes";

export async function runLocalDeepResearch(input: LocalDeepResearchRunInput): Promise<LocalDeepResearchRunResult> {
  const question = input.question.trim();
  const budget = normalizeLocalDeepResearchRunBudget(input.localResearchBudget, {
    maxToolCalls: input.maxToolCalls,
    source: input.localResearchBudget ? input.localResearchBudget.source : "tool_input",
  });
  const maxToolCalls = budget.maxToolCalls;
  const finalSynthesisReserveTurns = LOCAL_DEEP_RESEARCH_FINAL_SYNTHESIS_RESERVE_TURNS;
  const minimumMaxTurns = maxToolCalls + finalSynthesisReserveTurns;
  const requestedMaxTurns = input.maxTurns !== undefined ? Math.max(1, Math.floor(input.maxTurns)) : minimumMaxTurns;
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
    const error = input.setup.blockers.length ? input.setup.blockers.join("\n") : "Local Deep Research setup is not ready.";
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
      const finalAnswerResult = await handleLocalDeepResearchFinalAnswer({
        runInput: input,
        base,
        budget,
        question,
        messages,
        toolExecutions,
        finalAnswerDrafts,
        finalSynthesis,
        text: parsed.text,
        turnIndex: turn,
        maxTurns,
        maxToolCalls,
        finalAnswerRepairAttempts,
        citationRepairAttempts,
      });
      if (finalAnswerResult.action === "return") return finalAnswerResult.result;
      finalAnswerRepairAttempts = finalAnswerResult.finalAnswerRepairAttempts;
      citationRepairAttempts = finalAnswerResult.citationRepairAttempts;
      finalAnswerOnly = finalAnswerResult.finalAnswerOnly;
      continue;
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
      const finalOnlyResult = await handleLocalDeepResearchFinalOnlyToolCall({
        runInput: input,
        base,
        budget,
        question,
        messages,
        toolExecutions,
        finalAnswerDrafts,
        finalSynthesis,
        turnNumber: turn + 1,
        maxTurns,
        maxToolCalls,
        finalOnlyToolCallRejections,
      });
      if (finalOnlyResult.action === "return") return finalOnlyResult.result;
      finalOnlyToolCallRejections = finalOnlyResult.finalOnlyToolCallRejections;
      continue;
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
      content: [execution.observation, "", localDeepResearchToolBudgetObservation(postToolBudget)].join("\n"),
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

function emitLocalDeepResearchRunProgress(input: LocalDeepResearchRunInput, progress: LocalDeepResearchRunProgressEvent): void {
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
