import { createAssistantVisibleTextFilter } from "./assistantVisibleText";

export interface RuntimeTextOutputSnapshot {
  receivedAnyText: boolean;
  currentAssistantReceivedText: boolean;
  currentAssistantFinalText: string;
  currentThinkingReceivedText: boolean;
  currentThinkingFinalText: string;
  assistantOutputChars: number;
  thinkingOutputChars: number;
  firstAssistantVisibleTextAt?: string | undefined;
}

export interface RuntimeTextOutputState {
  receivedAnyText: () => boolean;
  setReceivedAnyText: (value: boolean) => void;
  currentAssistantReceivedText: () => boolean;
  setCurrentAssistantReceivedText: (value: boolean) => void;
  currentAssistantFinalText: () => string;
  setCurrentAssistantFinalText: (value: string) => void;
  currentThinkingReceivedText: () => boolean;
  setCurrentThinkingReceivedText: (value: boolean) => void;
  currentThinkingFinalText: () => string;
  setCurrentThinkingFinalText: (value: string) => void;
  assistantOutputChars: () => number;
  setAssistantOutputChars: (value: number) => void;
  thinkingOutputChars: () => number;
  setThinkingOutputChars: (value: number) => void;
  firstAssistantVisibleTextAt: () => string | undefined;
  markFirstAssistantVisibleText: (now?: () => string) => void;
  pushAssistantVisibleDelta: (delta: string) => string;
  flushAssistantVisibleText: () => string;
  resetAssistantStreamState: () => void;
  resetThinkingStreamState: () => void;
  hasAssistantText: () => boolean;
  snapshot: () => RuntimeTextOutputSnapshot;
}

export function createRuntimeTextOutputState(): RuntimeTextOutputState {
  let receivedAnyText = false;
  let currentAssistantReceivedText = false;
  let currentAssistantFinalText = "";
  let currentThinkingReceivedText = false;
  let currentThinkingFinalText = "";
  let assistantOutputChars = 0;
  let thinkingOutputChars = 0;
  let firstAssistantVisibleTextAt: string | undefined;
  let assistantVisibleTextFilter = createAssistantVisibleTextFilter();

  const resetAssistantStreamState = () => {
    currentAssistantReceivedText = false;
    currentAssistantFinalText = "";
    assistantVisibleTextFilter = createAssistantVisibleTextFilter();
  };

  const resetThinkingStreamState = () => {
    currentThinkingReceivedText = false;
    currentThinkingFinalText = "";
  };

  return {
    receivedAnyText: () => receivedAnyText,
    setReceivedAnyText: (value) => {
      receivedAnyText = value;
    },
    currentAssistantReceivedText: () => currentAssistantReceivedText,
    setCurrentAssistantReceivedText: (value) => {
      currentAssistantReceivedText = value;
    },
    currentAssistantFinalText: () => currentAssistantFinalText,
    setCurrentAssistantFinalText: (value) => {
      currentAssistantFinalText = value;
    },
    currentThinkingReceivedText: () => currentThinkingReceivedText,
    setCurrentThinkingReceivedText: (value) => {
      currentThinkingReceivedText = value;
    },
    currentThinkingFinalText: () => currentThinkingFinalText,
    setCurrentThinkingFinalText: (value) => {
      currentThinkingFinalText = value;
    },
    assistantOutputChars: () => assistantOutputChars,
    setAssistantOutputChars: (value) => {
      assistantOutputChars = value;
    },
    thinkingOutputChars: () => thinkingOutputChars,
    setThinkingOutputChars: (value) => {
      thinkingOutputChars = value;
    },
    firstAssistantVisibleTextAt: () => firstAssistantVisibleTextAt,
    markFirstAssistantVisibleText: (now = () => new Date().toISOString()) => {
      firstAssistantVisibleTextAt = firstAssistantVisibleTextAt ?? now();
    },
    pushAssistantVisibleDelta: (delta) => assistantVisibleTextFilter.push(delta),
    flushAssistantVisibleText: () => assistantVisibleTextFilter.flush(),
    resetAssistantStreamState,
    resetThinkingStreamState,
    hasAssistantText: () => receivedAnyText || Boolean(currentAssistantFinalText.trim()),
    snapshot: () => ({
      receivedAnyText,
      currentAssistantReceivedText,
      currentAssistantFinalText,
      currentThinkingReceivedText,
      currentThinkingFinalText,
      assistantOutputChars,
      thinkingOutputChars,
      firstAssistantVisibleTextAt,
    }),
  };
}
