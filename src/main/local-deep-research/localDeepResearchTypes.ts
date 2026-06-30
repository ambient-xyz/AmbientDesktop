import type { LocalDeepResearchBroker, LocalDeepResearchToolExecution } from "./localDeepResearchAdapter";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import type {
  LocalDeepResearchFinalSynthesisConfig,
  LocalDeepResearchRunBudget,
  LocalDeepResearchToolBudgetState,
} from "../../shared/localRuntimeTypes";

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

export type { LocalDeepResearchBroker, LocalDeepResearchToolExecution } from "./localDeepResearchAdapter";
