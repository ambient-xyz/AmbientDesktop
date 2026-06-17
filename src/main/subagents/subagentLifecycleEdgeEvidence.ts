export const SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_SCHEMA_VERSION =
  "ambient-subagent-lifecycle-edge-evidence-v1" as const;

export const SUBAGENT_LIFECYCLE_EDGE_KINDS = [
  "restart",
  "stop",
  "detach",
  "cancel",
  "retry",
  "timeout",
  "partial_result",
] as const;

export type SubagentLifecycleEdgeKind = typeof SUBAGENT_LIFECYCLE_EDGE_KINDS[number];

export type SubagentLifecycleEdgeEvidenceSource =
  | "deterministic_fixture"
  | "replay_diagnostics"
  | "live_desktop"
  | "live_pi";

export interface SubagentLifecycleEdgeEvidenceInput {
  createdAt?: string;
  source: SubagentLifecycleEdgeEvidenceSource;
  liveTokens: boolean;
  featureFlagSnapshot: {
    ambientSubagentsEnabled: boolean;
    source: string;
  };
  parent: {
    threadId: string;
    runId: string;
    messageId?: string;
  };
  edges: SubagentLifecycleEdgeCase[];
}

export interface SubagentLifecycleEdgeCase {
  id: string;
  kind: SubagentLifecycleEdgeKind;
  label: string;
  parentBlockingStateBefore: string;
  parentBlockingStateAfter: string;
  childRunIds: string[];
  childThreadIds: string[];
  observedEventIds: string[];
  synthesisSafety: {
    parentDidNotSynthesizeUnsafeChild: boolean;
    resultArtifactStateExplicit: boolean;
    affectedChildrenNamed: boolean;
    decisionOrEventAttributed: boolean;
    visibleCollapsedThreadState: boolean;
  };
  restart?: {
    interruptedRunIds: string[];
    diagnosticRunIds: string[];
    restartRepairObserved: boolean;
    nonResumableMarkedInterrupted: boolean;
  };
  stop?: {
    stoppedRunIds: string[];
    siblingRunIdsUnaffected: string[];
    structuredCancellationResult: boolean;
    capacityReleased: boolean;
  };
  detach?: {
    detachedRunIds: string[];
    detachedChildrenExcludedFromSynthesis: boolean;
    parentUnblockedAfterDecision: boolean;
    mailboxCleanupRecorded: boolean;
  };
  cancel?: {
    parentCancellationRequested: boolean;
    cancelledRunIds: string[];
    cancellationCascadeRecorded: boolean;
    parentReturnedCancelledState: boolean;
  };
  retry?: {
    retryRequestedRunIds: string[];
    retryAcceptedRunIds: string[];
    retryMailboxEventIds: string[];
    parentRemainedBlocked: boolean;
    childSessionRestarted: boolean;
  };
  timeout?: {
    barrierStatus: "timed_out";
    failurePolicy: string;
    allowedUserChoiceIds: string[];
    noTimedOutChildSynthesis: boolean;
  };
  partialResult?: {
    decision: "continue_with_partial";
    partialSummaryIncluded: boolean;
    omittedChildRunIds: string[];
    failedChildNotSynthesized: boolean;
    parentMarkedPartial: boolean;
  };
}

export interface SubagentLifecycleEdgeEvidence {
  schemaVersion: typeof SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_SCHEMA_VERSION;
  createdAt: string;
  source: SubagentLifecycleEdgeEvidenceSource;
  liveTokens: boolean;
  featureFlagSnapshot: SubagentLifecycleEdgeEvidenceInput["featureFlagSnapshot"];
  parent: SubagentLifecycleEdgeEvidenceInput["parent"];
  edges: SubagentLifecycleEdgeCase[];
  summary: {
    requiredEdgeKinds: SubagentLifecycleEdgeKind[];
    coveredEdgeKinds: SubagentLifecycleEdgeKind[];
    missingEdgeKinds: SubagentLifecycleEdgeKind[];
    unsafeEdgeIds: string[];
    liveTokens: boolean;
  };
  observations: string[];
}

export interface SubagentLifecycleEdgeEvidenceValidation {
  valid: boolean;
  issues: string[];
}

export function buildSubagentLifecycleEdgeEvidence(
  input: SubagentLifecycleEdgeEvidenceInput,
): SubagentLifecycleEdgeEvidence {
  const coveredEdgeKinds = uniqueEdgeKinds(input.edges.map((edge) => edge.kind));
  const missingEdgeKinds = SUBAGENT_LIFECYCLE_EDGE_KINDS.filter((kind) => !coveredEdgeKinds.includes(kind));
  const unsafeEdgeIds = input.edges
    .filter((edge) => !edgeSynthesisSafetyValid(edge))
    .map((edge) => edge.id);
  const evidence: SubagentLifecycleEdgeEvidence = {
    schemaVersion: SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_SCHEMA_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    source: input.source,
    liveTokens: input.liveTokens,
    featureFlagSnapshot: input.featureFlagSnapshot,
    parent: input.parent,
    edges: input.edges,
    summary: {
      requiredEdgeKinds: [...SUBAGENT_LIFECYCLE_EDGE_KINDS],
      coveredEdgeKinds,
      missingEdgeKinds,
      unsafeEdgeIds,
      liveTokens: input.liveTokens,
    },
    observations: [
      "Restart, stop, detach, cancel, retry, timeout, and partial-result lifecycle edges are represented as explicit evidence rows.",
      "Each edge names affected child runs, visible child threads, source events, parent blocking state, and synthesis safety.",
      "Parent synthesis remains blocked or explicitly partial until lifecycle decisions and result-artifact states are attributed.",
    ],
  };
  const validation = validateSubagentLifecycleEdgeEvidence(evidence);
  if (!validation.valid) {
    throw new Error(`Sub-agent lifecycle edge evidence is invalid: ${validation.issues.join(" ")}`);
  }
  return evidence;
}

export function validateSubagentLifecycleEdgeEvidence(input: unknown): SubagentLifecycleEdgeEvidenceValidation {
  const issues: string[] = [];
  if (!isRecord(input)) return { valid: false, issues: ["Sub-agent lifecycle edge evidence must be an object."] };
  if (input.schemaVersion !== SUBAGENT_LIFECYCLE_EDGE_EVIDENCE_SCHEMA_VERSION) {
    issues.push(`Sub-agent lifecycle edge schemaVersion is ${String(input.schemaVersion ?? "missing")}.`);
  }
  if (!isValidTimestamp(input.createdAt)) issues.push("Sub-agent lifecycle edge createdAt is missing or invalid.");
  if (!["deterministic_fixture", "replay_diagnostics", "live_desktop", "live_pi"].includes(String(input.source ?? ""))) {
    issues.push(`Sub-agent lifecycle edge source is ${String(input.source ?? "missing")}.`);
  }
  if (typeof input.liveTokens !== "boolean") issues.push("Sub-agent lifecycle edge liveTokens must be boolean.");

  const featureFlagSnapshot = isRecord(input.featureFlagSnapshot) ? input.featureFlagSnapshot : {};
  if (featureFlagSnapshot.ambientSubagentsEnabled !== true) {
    issues.push("Sub-agent lifecycle edge evidence must prove ambient.subagents was enabled.");
  }
  if (!nonEmptyString(featureFlagSnapshot.source)) {
    issues.push("Sub-agent lifecycle edge feature flag source is missing.");
  }

  const parent = isRecord(input.parent) ? input.parent : {};
  if (!nonEmptyString(parent.threadId)) issues.push("Sub-agent lifecycle edge parent.threadId is missing.");
  if (!nonEmptyString(parent.runId)) issues.push("Sub-agent lifecycle edge parent.runId is missing.");

  const edges = Array.isArray(input.edges) ? input.edges : [];
  if (edges.length === 0) issues.push("Sub-agent lifecycle edge evidence must include edges.");
  const coveredEdgeKinds = uniqueEdgeKinds(edges.map((edge) => isRecord(edge) ? edge.kind : undefined));
  for (const kind of SUBAGENT_LIFECYCLE_EDGE_KINDS) {
    if (!coveredEdgeKinds.includes(kind)) issues.push(`Sub-agent lifecycle edge evidence is missing ${kind}.`);
  }
  for (const edge of edges) validateLifecycleEdgeCase(edge, issues);

  const summary = isRecord(input.summary) ? input.summary : {};
  if (!arrayIncludesAll(summary.requiredEdgeKinds, SUBAGENT_LIFECYCLE_EDGE_KINDS)) {
    issues.push("Sub-agent lifecycle edge summary.requiredEdgeKinds is incomplete.");
  }
  if (!arrayIncludesAll(summary.coveredEdgeKinds, SUBAGENT_LIFECYCLE_EDGE_KINDS)) {
    issues.push("Sub-agent lifecycle edge summary.coveredEdgeKinds is incomplete.");
  }
  if (Array.isArray(summary.missingEdgeKinds) && summary.missingEdgeKinds.length > 0) {
    issues.push(`Sub-agent lifecycle edge summary has missing edge kinds: ${summary.missingEdgeKinds.join(", ")}.`);
  }
  if (Array.isArray(summary.unsafeEdgeIds) && summary.unsafeEdgeIds.length > 0) {
    issues.push(`Sub-agent lifecycle edge summary has unsafe edge ids: ${summary.unsafeEdgeIds.join(", ")}.`);
  }
  if (summary.liveTokens !== input.liveTokens) {
    issues.push("Sub-agent lifecycle edge summary liveTokens must match the artifact liveTokens.");
  }

  const secretPaths = findSecretLikeStrings(input);
  if (secretPaths.length) {
    issues.push(`Sub-agent lifecycle edge evidence appears to contain secret-like material at ${secretPaths.slice(0, 3).join(", ")}.`);
  }
  return { valid: issues.length === 0, issues };
}

export function summarizeSubagentLifecycleEdgeEvidence(input: SubagentLifecycleEdgeEvidence): string[] {
  const validation = validateSubagentLifecycleEdgeEvidence(input);
  return [
    `schemaVersion: ${input.schemaVersion}`,
    `source: ${input.source}`,
    `parent: ${input.parent.threadId} / ${input.parent.runId}`,
    `coveredEdges: ${input.summary.coveredEdgeKinds.join(", ")}`,
    `missingEdges: ${input.summary.missingEdgeKinds.join(", ") || "none"}`,
    `unsafeEdges: ${input.summary.unsafeEdgeIds.join(", ") || "none"}`,
    `liveTokens: ${input.liveTokens}`,
    `valid: ${validation.valid}`,
    ...(validation.issues.length ? [`issues: ${validation.issues.join("; ")}`] : []),
  ];
}

function validateLifecycleEdgeCase(input: unknown, issues: string[]): void {
  if (!isRecord(input)) {
    issues.push("Sub-agent lifecycle edge case must be an object.");
    return;
  }
  const id = nonEmptyString(input.id) ? input.id : "unknown";
  if (!nonEmptyString(input.id)) issues.push("Sub-agent lifecycle edge id is missing.");
  if (!SUBAGENT_LIFECYCLE_EDGE_KINDS.includes(input.kind as SubagentLifecycleEdgeKind)) {
    issues.push(`Sub-agent lifecycle edge ${id} has unknown kind ${String(input.kind ?? "missing")}.`);
    return;
  }
  if (!nonEmptyString(input.label)) issues.push(`Sub-agent lifecycle edge ${id} label is missing.`);
  if (!nonEmptyString(input.parentBlockingStateBefore)) {
    issues.push(`Sub-agent lifecycle edge ${id} parentBlockingStateBefore is missing.`);
  }
  if (!nonEmptyString(input.parentBlockingStateAfter)) {
    issues.push(`Sub-agent lifecycle edge ${id} parentBlockingStateAfter is missing.`);
  }
  if (!nonEmptyStringArray(input.childRunIds)) issues.push(`Sub-agent lifecycle edge ${id} childRunIds are missing.`);
  if (!nonEmptyStringArray(input.childThreadIds)) issues.push(`Sub-agent lifecycle edge ${id} childThreadIds are missing.`);
  if (!nonEmptyStringArray(input.observedEventIds)) issues.push(`Sub-agent lifecycle edge ${id} observedEventIds are missing.`);
  if (!edgeSynthesisSafetyValid(input)) {
    issues.push(`Sub-agent lifecycle edge ${id} is missing synthesis-safety proof.`);
  }
  switch (input.kind) {
    case "restart":
      validateRestartEdge(input.restart, id, issues);
      break;
    case "stop":
      validateStopEdge(input.stop, id, issues);
      break;
    case "detach":
      validateDetachEdge(input.detach, id, issues);
      break;
    case "cancel":
      validateCancelEdge(input.cancel, id, issues);
      break;
    case "retry":
      validateRetryEdge(input.retry, id, issues);
      break;
    case "timeout":
      validateTimeoutEdge(input.timeout, id, issues);
      break;
    case "partial_result":
      validatePartialResultEdge(input.partialResult, id, issues);
      break;
  }
}

function validateRestartEdge(input: unknown, id: string, issues: string[]): void {
  const restart = isRecord(input) ? input : {};
  if (!nonEmptyStringArray(restart.interruptedRunIds)) issues.push(`Sub-agent lifecycle restart edge ${id} interruptedRunIds are missing.`);
  if (!nonEmptyStringArray(restart.diagnosticRunIds)) issues.push(`Sub-agent lifecycle restart edge ${id} diagnosticRunIds are missing.`);
  if (restart.restartRepairObserved !== true) issues.push(`Sub-agent lifecycle restart edge ${id} must observe restart repair.`);
  if (restart.nonResumableMarkedInterrupted !== true) {
    issues.push(`Sub-agent lifecycle restart edge ${id} must mark non-resumable children interrupted.`);
  }
}

function validateStopEdge(input: unknown, id: string, issues: string[]): void {
  const stop = isRecord(input) ? input : {};
  if (!nonEmptyStringArray(stop.stoppedRunIds)) issues.push(`Sub-agent lifecycle stop edge ${id} stoppedRunIds are missing.`);
  if (!nonEmptyStringArray(stop.siblingRunIdsUnaffected)) {
    issues.push(`Sub-agent lifecycle stop edge ${id} siblingRunIdsUnaffected are missing.`);
  }
  if (stop.structuredCancellationResult !== true) {
    issues.push(`Sub-agent lifecycle stop edge ${id} must include a structured cancellation result.`);
  }
  if (stop.capacityReleased !== true) issues.push(`Sub-agent lifecycle stop edge ${id} must release capacity.`);
}

function validateDetachEdge(input: unknown, id: string, issues: string[]): void {
  const detach = isRecord(input) ? input : {};
  if (!nonEmptyStringArray(detach.detachedRunIds)) issues.push(`Sub-agent lifecycle detach edge ${id} detachedRunIds are missing.`);
  if (detach.detachedChildrenExcludedFromSynthesis !== true) {
    issues.push(`Sub-agent lifecycle detach edge ${id} must exclude detached children from synthesis.`);
  }
  if (detach.parentUnblockedAfterDecision !== true) {
    issues.push(`Sub-agent lifecycle detach edge ${id} must unblock the parent only after the decision.`);
  }
  if (detach.mailboxCleanupRecorded !== true) {
    issues.push(`Sub-agent lifecycle detach edge ${id} must record mailbox cleanup.`);
  }
}

function validateCancelEdge(input: unknown, id: string, issues: string[]): void {
  const cancel = isRecord(input) ? input : {};
  if (cancel.parentCancellationRequested !== true) {
    issues.push(`Sub-agent lifecycle cancel edge ${id} must record parentCancellationRequested.`);
  }
  if (!nonEmptyStringArray(cancel.cancelledRunIds)) issues.push(`Sub-agent lifecycle cancel edge ${id} cancelledRunIds are missing.`);
  if (cancel.cancellationCascadeRecorded !== true) {
    issues.push(`Sub-agent lifecycle cancel edge ${id} must record the cancellation cascade.`);
  }
  if (cancel.parentReturnedCancelledState !== true) {
    issues.push(`Sub-agent lifecycle cancel edge ${id} must return the parent to cancelled state.`);
  }
}

function validateRetryEdge(input: unknown, id: string, issues: string[]): void {
  const retry = isRecord(input) ? input : {};
  if (!nonEmptyStringArray(retry.retryRequestedRunIds)) {
    issues.push(`Sub-agent lifecycle retry edge ${id} retryRequestedRunIds are missing.`);
  }
  if (!nonEmptyStringArray(retry.retryAcceptedRunIds)) {
    issues.push(`Sub-agent lifecycle retry edge ${id} retryAcceptedRunIds are missing.`);
  }
  if (!nonEmptyStringArray(retry.retryMailboxEventIds)) {
    issues.push(`Sub-agent lifecycle retry edge ${id} retryMailboxEventIds are missing.`);
  }
  if (retry.parentRemainedBlocked !== true) {
    issues.push(`Sub-agent lifecycle retry edge ${id} must keep the parent blocked after retry request.`);
  }
  if (retry.childSessionRestarted !== true) {
    issues.push(`Sub-agent lifecycle retry edge ${id} must prove the child session restarted.`);
  }
}

function validateTimeoutEdge(input: unknown, id: string, issues: string[]): void {
  const timeout = isRecord(input) ? input : {};
  if (timeout.barrierStatus !== "timed_out") {
    issues.push(`Sub-agent lifecycle timeout edge ${id} barrierStatus must be timed_out.`);
  }
  if (!nonEmptyString(timeout.failurePolicy)) issues.push(`Sub-agent lifecycle timeout edge ${id} failurePolicy is missing.`);
  if (!arrayIncludesAll(timeout.allowedUserChoiceIds, ["wait_again", "cancel_parent"])) {
    issues.push(`Sub-agent lifecycle timeout edge ${id} must include wait_again and cancel_parent choices.`);
  }
  if (timeout.noTimedOutChildSynthesis !== true) {
    issues.push(`Sub-agent lifecycle timeout edge ${id} must block timed-out child synthesis.`);
  }
}

function validatePartialResultEdge(input: unknown, id: string, issues: string[]): void {
  const partial = isRecord(input) ? input : {};
  if (partial.decision !== "continue_with_partial") {
    issues.push(`Sub-agent lifecycle partial-result edge ${id} decision must be continue_with_partial.`);
  }
  if (partial.partialSummaryIncluded !== true) {
    issues.push(`Sub-agent lifecycle partial-result edge ${id} must include a partial summary.`);
  }
  if (!nonEmptyStringArray(partial.omittedChildRunIds)) {
    issues.push(`Sub-agent lifecycle partial-result edge ${id} omittedChildRunIds are missing.`);
  }
  if (partial.failedChildNotSynthesized !== true) {
    issues.push(`Sub-agent lifecycle partial-result edge ${id} must prove failed child output was not synthesized.`);
  }
  if (partial.parentMarkedPartial !== true) {
    issues.push(`Sub-agent lifecycle partial-result edge ${id} must mark the parent partial.`);
  }
}

function edgeSynthesisSafetyValid(input: unknown): boolean {
  if (!isRecord(input)) return false;
  const safety = isRecord(input.synthesisSafety) ? input.synthesisSafety : {};
  return safety.parentDidNotSynthesizeUnsafeChild === true &&
    safety.resultArtifactStateExplicit === true &&
    safety.affectedChildrenNamed === true &&
    safety.decisionOrEventAttributed === true &&
    safety.visibleCollapsedThreadState === true;
}

function uniqueEdgeKinds(values: unknown[]): SubagentLifecycleEdgeKind[] {
  const kinds = values.filter((value): value is SubagentLifecycleEdgeKind =>
    SUBAGENT_LIFECYCLE_EDGE_KINDS.includes(value as SubagentLifecycleEdgeKind)
  );
  return SUBAGENT_LIFECYCLE_EDGE_KINDS.filter((kind) => kinds.includes(kind));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.some(nonEmptyString);
}

function arrayIncludesAll(value: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(value)) return false;
  return expected.every((item) => value.includes(item));
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function findSecretLikeStrings(value: unknown): string[] {
  const paths: string[] = [];
  const seen = new Set<unknown>();
  visit(value, "$");
  return paths;

  function visit(current: unknown, path: string): void {
    if (!current || paths.length >= 10) return;
    if (typeof current === "string") {
      if (looksSecretLike(current)) paths.push(path);
      return;
    }
    if (typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      visit(child, `${path}.${key}`);
    }
  }
}

function looksSecretLike(value: string): boolean {
  return /\b(?:GMI_CLOUD_API_KEY|GMI_API_KEY|AMBIENT_API_KEY)\b\s*[:=]\s*["']?[^"'\s$]{8,}/i.test(value) ||
    /\bapi[_-]?key\b\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i.test(value) ||
    /\bsk-[A-Za-z0-9_-]{16,}\b/.test(value);
}
