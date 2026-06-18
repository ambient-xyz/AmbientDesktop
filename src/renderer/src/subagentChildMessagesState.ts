import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import type { DesktopState } from "../../shared/desktopTypes";
import type { ChatMessage } from "../../shared/threadTypes";

export interface MessageDeltaForChildThread {
  messageId: string;
  delta: string;
  threadId?: string;
}

export function childThreadIsVisibleUnderActiveParent(state: DesktopState, threadId: string): boolean {
  if (!isAmbientSubagentsEnabled(state.featureFlagSnapshot)) return false;
  if (threadId === state.activeThreadId) return false;
  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId);
  if (activeThread?.kind === "subagent_child") return false;
  const childThread = state.threads.find((thread) => thread.id === threadId);
  const childThreadEdgeMatches =
    childThread?.kind === "subagent_child" &&
    childThread.parentThreadId === state.activeThreadId &&
    !childThread.archivedAt;
  const runEdgeMatches = state.subagentRuns.some((run) => (
    run.parentThreadId === state.activeThreadId &&
    run.childThreadId === threadId &&
    !childThread?.archivedAt
  ));
  return childThreadEdgeMatches || runEdgeMatches;
}

export function upsertChildThreadMessage(state: DesktopState, message: ChatMessage): DesktopState {
  if (!childThreadIsVisibleUnderActiveParent(state, message.threadId)) return state;
  const existingByThread = state.childMessagesByThreadId ?? {};
  const existingMessages = existingByThread[message.threadId] ?? [];
  const existingIndex = existingMessages.findIndex((candidate) => candidate.id === message.id);
  const nextMessages =
    existingIndex >= 0
      ? existingMessages.map((candidate) => (candidate.id === message.id ? message : candidate))
      : [...existingMessages, message];
  return {
    ...state,
    childMessagesByThreadId: {
      ...existingByThread,
      [message.threadId]: nextMessages,
    },
  };
}

export function applyChildThreadMessageDelta(state: DesktopState, event: MessageDeltaForChildThread): DesktopState {
  if (!isAmbientSubagentsEnabled(state.featureFlagSnapshot)) return state;
  const existingByThread = state.childMessagesByThreadId ?? {};
  const threadId =
    event.threadId && existingByThread[event.threadId]?.some((message) => message.id === event.messageId)
      ? event.threadId
      : Object.entries(existingByThread).find(([, messages]) => messages.some((message) => message.id === event.messageId))?.[0];
  if (!threadId || !childThreadIsVisibleUnderActiveParent(state, threadId)) return state;
  const existingMessages = existingByThread[threadId] ?? [];
  if (!existingMessages.some((message) => message.id === event.messageId)) return state;
  return {
    ...state,
    childMessagesByThreadId: {
      ...existingByThread,
      [threadId]: existingMessages.map((message) =>
        message.id === event.messageId ? { ...message, content: message.content + event.delta } : message,
      ),
    },
  };
}
