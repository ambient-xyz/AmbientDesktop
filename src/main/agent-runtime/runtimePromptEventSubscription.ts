import { normalizePiEvent, type NormalizedPiEvent } from "./agentRuntimePiFacade";

export type RuntimePromptTraceEvent = NormalizedPiEvent | { kind: "assistant-start" };

export interface RuntimePromptEventStreamDispatcher {
  handle(event: NormalizedPiEvent, rawEvent: unknown, input?: { assistantStartEvent?: boolean }): boolean;
}

export interface RuntimePromptEventToolDispatcher {
  handle(event: NormalizedPiEvent, rawEvent: unknown, eventSeq: number): boolean;
}

export interface RuntimePromptEventSubscriptionInput {
  subscribe: (handler: (event: unknown) => void) => () => void;
  markRunActivity: () => boolean;
  incrementRunEventSeq: () => number;
  markPostToolEvent: () => void;
  recordPiStreamTraceEvent: (event: unknown, normalized: RuntimePromptTraceEvent) => void;
  markPiStreamActivity: (forceProgress?: boolean, event?: unknown) => void;
  streamEventDispatcher: RuntimePromptEventStreamDispatcher;
  toolEventDispatcher: RuntimePromptEventToolDispatcher;
}

export function subscribeRuntimePromptEvents(input: RuntimePromptEventSubscriptionInput): () => void {
  return input.subscribe((event: unknown) => {
    if (!input.markRunActivity()) return;
    const runEventSeq = input.incrementRunEventSeq();
    input.markPostToolEvent();
    const normalized = normalizePiEvent(event);
    const assistantStartEvent = isAssistantStartEvent(event);
    const streamActivityEvent = isPiStreamActivityEvent(normalized, assistantStartEvent);
    if (streamActivityEvent) {
      input.recordPiStreamTraceEvent(
        event,
        assistantStartEvent && normalized.kind === "unknown" ? { kind: "assistant-start" } : normalized,
      );
      input.markPiStreamActivity(false, event);
    }

    if (input.streamEventDispatcher.handle(normalized, event, { assistantStartEvent })) return;

    if (input.toolEventDispatcher.handle(normalized, event, runEventSeq)) return;
  });
}

function isAssistantStartEvent(event: unknown): boolean {
  const candidate = event as { type?: unknown; message?: { role?: unknown } } | null | undefined;
  return candidate?.type === "message_start" && candidate.message?.role === "assistant";
}

function isPiStreamActivityEvent(event: NormalizedPiEvent, assistantStartEvent: boolean): boolean {
  if (assistantStartEvent) return true;
  return event.kind !== "unknown";
}
