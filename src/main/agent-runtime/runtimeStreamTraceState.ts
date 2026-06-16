import { createHash } from "node:crypto";

import type { PiStreamTraceEvent } from "../agentRuntimeSendStreamDiagnostics";
import {
  countJsonlEntries,
  type PiStreamTraceReference,
} from "../agentRuntimeProviderDiagnostics";

export interface RuntimeStreamTraceSnapshot {
  recentEvents: PiStreamTraceEvent[];
  traceReference?: PiStreamTraceReference | undefined;
  piPromptStartLine?: number | undefined;
  piPromptUserLine?: number | undefined;
  promptContentSha256?: string | undefined;
  firstToolArgumentAt?: string | undefined;
  firstToolExecutionStartedAt?: string | undefined;
}

export interface RuntimeStreamTraceState {
  recentEvents: () => PiStreamTraceEvent[];
  traceReference: () => PiStreamTraceReference | undefined;
  setTraceReference: (reference: PiStreamTraceReference) => void;
  piPromptStartLine: () => number | undefined;
  piPromptUserLine: () => number | undefined;
  promptContentSha256: () => string | undefined;
  recordPromptStart: (input: { sessionFile?: string | undefined; promptContent: string }) => void;
  firstToolArgumentAt: () => string | undefined;
  markFirstToolArgumentObserved: (at?: string) => void;
  firstToolExecutionStartedAt: () => string | undefined;
  markFirstToolExecutionObserved: (at?: string) => void;
  snapshot: () => RuntimeStreamTraceSnapshot;
}

export function createRuntimeStreamTraceState(): RuntimeStreamTraceState {
  const recentEvents: PiStreamTraceEvent[] = [];
  let traceReference: PiStreamTraceReference | undefined;
  let piPromptStartLine: number | undefined;
  let piPromptUserLine: number | undefined;
  let promptContentSha256: string | undefined;
  let firstToolArgumentAt: string | undefined;
  let firstToolExecutionStartedAt: string | undefined;

  return {
    recentEvents: () => recentEvents,
    traceReference: () => traceReference,
    setTraceReference: (reference) => {
      traceReference = reference;
    },
    piPromptStartLine: () => piPromptStartLine,
    piPromptUserLine: () => piPromptUserLine,
    promptContentSha256: () => promptContentSha256,
    recordPromptStart: (input) => {
      piPromptStartLine = input.sessionFile ? countJsonlEntries(input.sessionFile) : undefined;
      piPromptUserLine = piPromptStartLine === undefined ? undefined : piPromptStartLine + 1;
      promptContentSha256 = createHash("sha256").update(input.promptContent).digest("hex");
    },
    firstToolArgumentAt: () => firstToolArgumentAt,
    markFirstToolArgumentObserved: (at = new Date().toISOString()) => {
      firstToolArgumentAt = firstToolArgumentAt ?? at;
    },
    firstToolExecutionStartedAt: () => firstToolExecutionStartedAt,
    markFirstToolExecutionObserved: (at = new Date().toISOString()) => {
      firstToolExecutionStartedAt = firstToolExecutionStartedAt ?? at;
    },
    snapshot: () => ({
      recentEvents,
      traceReference,
      piPromptStartLine,
      piPromptUserLine,
      promptContentSha256,
      firstToolArgumentAt,
      firstToolExecutionStartedAt,
    }),
  };
}
