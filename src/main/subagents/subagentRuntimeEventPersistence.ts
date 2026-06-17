import type { SubagentRuntimeEvent, SubagentRuntimeEventInput, SubagentRuntimeEventSource } from "../../shared/subagentProtocol";
import type { SubagentRunEventSummary, SubagentRunSummary } from "../../shared/types";
import { mapPiChildRuntimeEvent } from "../pi/piEventMapper";

export interface SubagentRuntimeEventPersistenceStore {
  appendSubagentRunEvent(runId: string, input: {
    type: string;
    preview?: unknown;
    artifactPath?: string;
    createdAt?: string;
  }): SubagentRunEventSummary;
}

export interface PersistedSubagentRuntimeEvent {
  runtimeEvent: SubagentRuntimeEvent;
  runEvent: SubagentRunEventSummary;
}

export function appendMappedSubagentRuntimeEvent(
  store: SubagentRuntimeEventPersistenceStore,
  input: {
    run: SubagentRunSummary;
    source: SubagentRuntimeEventSource;
    event: SubagentRuntimeEventInput;
  },
): PersistedSubagentRuntimeEvent {
  const runtimeEvent = mapPiChildRuntimeEvent({
    run: input.run,
    source: input.source,
    event: input.event,
  });
  const runEvent = store.appendSubagentRunEvent(input.run.id, {
    type: "subagent.runtime_event",
    preview: runtimeEvent,
    artifactPath: runtimeEvent.artifactPath,
    createdAt: runtimeEvent.createdAt,
  });
  return { runtimeEvent, runEvent };
}
