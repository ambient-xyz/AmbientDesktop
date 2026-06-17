export const SUBAGENT_LIVE_CONFIDENCE_EVIDENCE_SCHEMA_VERSION = "ambient-subagent-live-confidence-evidence-v3" as const;

export const SUBAGENT_LIVE_CONFIDENCE_SLICE_KINDS = [
  "pi_tool_prompt",
  "child_authority",
  "workflow_symphony",
  "workflow_symphony_broader",
  "local_runtime",
  "restart_repair",
  "lifecycle_edges",
  "desktop_dogfood",
  "deterministic_only",
] as const;

export const SUBAGENT_LIVE_CONFIDENCE_STATUSES = [
  "passed",
  "blocked",
  "failed",
  "skipped",
] as const;

export type SubagentLiveConfidenceSliceKind = typeof SUBAGENT_LIVE_CONFIDENCE_SLICE_KINDS[number];
export type SubagentLiveConfidenceStatus = typeof SUBAGENT_LIVE_CONFIDENCE_STATUSES[number];
export type SubagentLiveConfidenceAcceptance = "release_usable" | "advisory_only" | "invalid";
export type SubagentLiveConfidenceDelta = "increased" | "unchanged" | "decreased" | "not_applicable";
export type SubagentLiveConfidenceCloseoutKind = "saw_live" | "blocked" | "no_live_surface";
export type SubagentLiveConfidenceMaturityAssertionStatus = "passed" | "failed" | "blocked" | "skipped";

export interface SubagentLiveConfidenceProviderSnapshot {
  kind: "gmi-cloud" | "ambient" | "local" | "custom" | "none";
  providerId?: string;
  modelRuntimeId?: string;
  modelProfileId?: string;
  endpointLabel?: string;
  usingGmiOverride?: boolean;
}

export interface SubagentLiveConfidenceFeatureFlagSnapshot {
  ambientSubagentsEnabled: boolean;
  source?: "settings" | "launch_arg" | "test_override" | "default" | "unknown";
}

export interface SubagentLiveConfidenceProbe {
  label: string;
  command?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SubagentLiveConfidenceArtifactRef {
  label: string;
  path: string;
  kind: "json" | "markdown" | "log" | "screenshot" | "trace" | "diagnostic_bundle" | "other";
  sha256?: string;
}

export interface SubagentLiveConfidenceBlocker {
  kind:
    | "provider_outage"
    | "credential_missing"
    | "network"
    | "local_runtime_unavailable"
    | "untracked_process"
    | "policy"
    | "product_issue"
    | "environment"
    | "other";
  summary: string;
  classifiedAsEnvironmental: boolean;
  nextStep?: string;
}

export interface SubagentLiveConfidenceProductIssue {
  severity: "p0" | "p1" | "p2" | "p3";
  summary: string;
  owner?: string;
  link?: string;
}

export interface SubagentLiveConfidenceObservation {
  label: string;
  result: string;
}

export interface SubagentLiveConfidenceMaturityAssertion {
  id: string;
  label: string;
  status: SubagentLiveConfidenceMaturityAssertionStatus;
  artifactPath?: string;
  capabilities?: string[];
  evidence: string[];
}

export interface SubagentLiveConfidenceCloseoutAnswer {
  kind: SubagentLiveConfidenceCloseoutKind;
  summary: string;
}

export interface SubagentLiveConfidenceEvidence {
  schemaVersion: typeof SUBAGENT_LIVE_CONFIDENCE_EVIDENCE_SCHEMA_VERSION;
  sliceId: string;
  sliceKind: SubagentLiveConfidenceSliceKind;
  status: SubagentLiveConfidenceStatus;
  hypothesis: string;
  expectedObservation: string;
  actualOutcome: string;
  confidenceDelta: SubagentLiveConfidenceDelta;
  followUp: string;
  closeoutAnswer: SubagentLiveConfidenceCloseoutAnswer;
  startedAt: string;
  completedAt: string;
  provider: SubagentLiveConfidenceProviderSnapshot;
  featureFlagSnapshot?: SubagentLiveConfidenceFeatureFlagSnapshot;
  capabilitiesObserved: string[];
  maturityAssertions?: SubagentLiveConfidenceMaturityAssertion[];
  probes: SubagentLiveConfidenceProbe[];
  artifacts: SubagentLiveConfidenceArtifactRef[];
  observations: SubagentLiveConfidenceObservation[];
  classifiedBlockers: SubagentLiveConfidenceBlocker[];
  productIssues: SubagentLiveConfidenceProductIssue[];
  skipReason?: string;
  notes?: string;
}

export interface CreateSubagentLiveConfidenceEvidenceInput {
  sliceId: string;
  sliceKind: SubagentLiveConfidenceSliceKind;
  status: SubagentLiveConfidenceStatus;
  hypothesis: string;
  expectedObservation: string;
  actualOutcome: string;
  confidenceDelta: SubagentLiveConfidenceDelta;
  followUp: string;
  closeoutAnswer: SubagentLiveConfidenceCloseoutAnswer;
  startedAt?: string;
  completedAt?: string;
  provider?: Partial<SubagentLiveConfidenceProviderSnapshot>;
  featureFlagSnapshot?: SubagentLiveConfidenceFeatureFlagSnapshot;
  capabilitiesObserved?: readonly string[];
  maturityAssertions?: readonly SubagentLiveConfidenceMaturityAssertion[];
  probes?: readonly SubagentLiveConfidenceProbe[];
  artifacts?: readonly SubagentLiveConfidenceArtifactRef[];
  observations?: readonly SubagentLiveConfidenceObservation[];
  classifiedBlockers?: readonly SubagentLiveConfidenceBlocker[];
  productIssues?: readonly SubagentLiveConfidenceProductIssue[];
  skipReason?: string;
  notes?: string;
}

export interface SubagentLiveConfidenceValidation {
  valid: boolean;
  acceptance: SubagentLiveConfidenceAcceptance;
  issues: string[];
}

export function createSubagentLiveConfidenceEvidence(input: CreateSubagentLiveConfidenceEvidenceInput): SubagentLiveConfidenceEvidence {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const completedAt = input.completedAt ?? startedAt;
  return {
    schemaVersion: SUBAGENT_LIVE_CONFIDENCE_EVIDENCE_SCHEMA_VERSION,
    sliceId: requiredString(input.sliceId, "sliceId"),
    sliceKind: input.sliceKind,
    status: input.status,
    hypothesis: requiredString(input.hypothesis, "hypothesis"),
    expectedObservation: requiredString(input.expectedObservation, "expectedObservation"),
    actualOutcome: requiredString(input.actualOutcome, "actualOutcome"),
    confidenceDelta: input.confidenceDelta,
    followUp: requiredString(input.followUp, "followUp"),
    closeoutAnswer: normalizedCloseoutAnswer(input.closeoutAnswer),
    startedAt,
    completedAt,
    provider: {
      kind: input.provider?.kind ?? (input.sliceKind === "deterministic_only" ? "none" : "gmi-cloud"),
      ...definedStrings({
        providerId: input.provider?.providerId,
        modelRuntimeId: input.provider?.modelRuntimeId,
        modelProfileId: input.provider?.modelProfileId,
        endpointLabel: input.provider?.endpointLabel,
      }),
      ...(typeof input.provider?.usingGmiOverride === "boolean" ? { usingGmiOverride: input.provider.usingGmiOverride } : {}),
    },
    ...(input.featureFlagSnapshot ? { featureFlagSnapshot: input.featureFlagSnapshot } : {}),
    capabilitiesObserved: normalizedStrings(input.capabilitiesObserved),
    ...(input.maturityAssertions ? { maturityAssertions: normalizedMaturityAssertions(input.maturityAssertions) } : {}),
    probes: [...(input.probes ?? [])],
    artifacts: [...(input.artifacts ?? [])],
    observations: [...(input.observations ?? [])],
    classifiedBlockers: [...(input.classifiedBlockers ?? [])],
    productIssues: [...(input.productIssues ?? [])],
    ...definedStrings({
      skipReason: input.skipReason,
      notes: input.notes,
    }),
  };
}

export function validateSubagentLiveConfidenceEvidence(input: unknown): SubagentLiveConfidenceValidation {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return { valid: false, acceptance: "invalid", issues: ["Live confidence evidence must be an object."] };
  }

  if (input.schemaVersion !== SUBAGENT_LIVE_CONFIDENCE_EVIDENCE_SCHEMA_VERSION) {
    issues.push(`Live confidence evidence schemaVersion is ${String(input.schemaVersion ?? "missing")}.`);
  }
  const sliceId = stringValue(input.sliceId);
  if (!sliceId) issues.push("Live confidence evidence is missing sliceId.");
  const sliceKind = stringValue(input.sliceKind);
  if (!isLiveConfidenceSliceKind(sliceKind)) {
    issues.push(`Live confidence evidence sliceKind is ${sliceKind ?? "missing"}.`);
  }
  const status = stringValue(input.status);
  if (!isLiveConfidenceStatus(status)) {
    issues.push(`Live confidence evidence status is ${status ?? "missing"}.`);
  }
  if (!stringValue(input.hypothesis)) issues.push("Live confidence evidence is missing hypothesis.");
  if (!stringValue(input.expectedObservation)) issues.push("Live confidence evidence is missing expectedObservation.");
  if (!stringValue(input.actualOutcome)) issues.push("Live confidence evidence is missing actualOutcome.");
  if (!isLiveConfidenceDelta(stringValue(input.confidenceDelta))) {
    issues.push(`Live confidence evidence confidenceDelta is ${String(input.confidenceDelta ?? "missing")}.`);
  }
  if (!stringValue(input.followUp)) issues.push("Live confidence evidence is missing followUp.");
  const closeoutAnswer = isRecord(input.closeoutAnswer) ? input.closeoutAnswer : undefined;
  const closeoutKind = stringValue(closeoutAnswer?.kind);
  if (!closeoutAnswer || !isLiveConfidenceCloseoutKind(closeoutKind)) {
    issues.push(`Live confidence evidence closeoutAnswer.kind is ${closeoutKind ?? "missing"}.`);
  }
  if (!stringValue(closeoutAnswer?.summary)) {
    issues.push("Live confidence evidence closeoutAnswer.summary is missing.");
  }
  const startedAt = stringValue(input.startedAt);
  const completedAt = stringValue(input.completedAt);
  if (!isValidTimestamp(startedAt)) issues.push("Live confidence evidence startedAt is missing or invalid.");
  if (!isValidTimestamp(completedAt)) issues.push("Live confidence evidence completedAt is missing or invalid.");
  if (isValidTimestamp(startedAt) && isValidTimestamp(completedAt) && Date.parse(completedAt) < Date.parse(startedAt)) {
    issues.push("Live confidence evidence completedAt is before startedAt.");
  }

  const deterministicOnly = sliceKind === "deterministic_only";
  const provider = isRecord(input.provider) ? input.provider : undefined;
  const providerKind = stringValue(provider?.kind);
  if (!provider || !isLiveConfidenceProviderKind(providerKind)) {
    issues.push(`Live confidence evidence provider.kind is ${providerKind ?? "missing"}.`);
  } else if (!deterministicOnly && providerKind === "none" && status !== "skipped") {
    issues.push("Non-deterministic live confidence evidence must name the provider/runtime that was exercised or blocked.");
  }

  const featureFlagSnapshot = isRecord(input.featureFlagSnapshot) ? input.featureFlagSnapshot : undefined;
  if (!deterministicOnly && status === "passed" && featureFlagSnapshot?.ambientSubagentsEnabled !== true) {
    issues.push("Passed live confidence evidence must prove ambient.subagents was enabled.");
  }

  const artifacts = Array.isArray(input.artifacts) ? input.artifacts : [];
  const classifiedBlockers = Array.isArray(input.classifiedBlockers) ? input.classifiedBlockers : [];
  const productIssues = Array.isArray(input.productIssues) ? input.productIssues : [];
  const probes = Array.isArray(input.probes) ? input.probes : [];
  const maturityAssertions = Array.isArray(input.maturityAssertions) ? input.maturityAssertions : [];
  validateArtifactRefs(artifacts, issues);
  validateClassifiedBlockers(classifiedBlockers, issues);
  validateProductIssues(productIssues, issues);
  validateProbes(probes, issues);
  validateMaturityAssertions(maturityAssertions, issues);
  validateChildAuthorityMaturityAssertions({ sliceKind, status, maturityAssertions }, issues);
  validateWorkflowSymphonyMaturityAssertions({ sliceKind, status, maturityAssertions }, issues);
  validateLocalRuntimeMaturityAssertions({ sliceKind, status, maturityAssertions }, issues);
  validateRestartRepairMaturityAssertions({ sliceKind, status, maturityAssertions }, issues);
  validateLifecycleEdgeMaturityAssertions({ sliceKind, status, maturityAssertions }, issues);
  validateDesktopDogfoodMaturityAssertions({ sliceKind, status, maturityAssertions }, issues);

  if ((status === "passed" || status === "failed" || status === "blocked") && artifacts.length === 0) {
    issues.push(`Live confidence evidence with status ${status} must include at least one artifact reference.`);
  }
  if (status === "blocked" && classifiedBlockers.length === 0) {
    issues.push("Blocked live confidence evidence must include at least one classifiedBlocker.");
  }
  if (status === "failed" && productIssues.length === 0) {
    issues.push("Failed live confidence evidence must include at least one productIssue.");
  }
  const criticalIssues = productIssues.filter((issue) => isRecord(issue) && (issue.severity === "p0" || issue.severity === "p1"));
  if (status === "passed" && criticalIssues.length > 0) {
    issues.push("Passed live confidence evidence cannot carry p0/p1 product issues.");
  }
  if (status === "skipped" && !stringValue(input.skipReason)) {
    issues.push("Skipped live confidence evidence must include skipReason.");
  }
  if ((status === "passed" || status === "failed") && closeoutKind && closeoutKind !== "saw_live") {
    issues.push(`Live confidence evidence status ${status} must use closeoutAnswer.kind saw_live.`);
  }
  if (status === "blocked" && closeoutKind && closeoutKind !== "blocked") {
    issues.push("Blocked live confidence evidence must use closeoutAnswer.kind blocked.");
  }
  if (status === "skipped" && closeoutKind && closeoutKind !== "no_live_surface") {
    issues.push("Skipped live confidence evidence must use closeoutAnswer.kind no_live_surface.");
  }

  const secretPaths = findSecretLikeStrings(input);
  if (secretPaths.length > 0) {
    issues.push(`Live confidence evidence appears to contain secret-like material at ${secretPaths.slice(0, 3).join(", ")}.`);
  }

  const valid = issues.length === 0;
  const acceptance: SubagentLiveConfidenceAcceptance = !valid
    ? "invalid"
    : status === "passed"
      ? "release_usable"
      : "advisory_only";
  return { valid, acceptance, issues };
}

export function summarizeSubagentLiveConfidenceEvidence(input: SubagentLiveConfidenceEvidence): string[] {
  const validation = validateSubagentLiveConfidenceEvidence(input);
  const provider = input.provider.kind === "none"
    ? "none"
    : [input.provider.providerId ?? input.provider.kind, input.provider.modelRuntimeId ?? input.provider.modelProfileId].filter(Boolean).join(" / ");
  return [
    `slice: ${input.sliceId}`,
    `kind: ${input.sliceKind}`,
    `status: ${input.status}`,
    `acceptance: ${validation.acceptance}`,
    `confidenceDelta: ${input.confidenceDelta}`,
    `closeoutAnswer: ${input.closeoutAnswer.kind}`,
    `provider: ${provider}`,
    `artifacts: ${input.artifacts.length}`,
    `maturityAssertions: ${input.maturityAssertions?.length ?? 0}`,
    `classifiedBlockers: ${input.classifiedBlockers.length}`,
    `productIssues: ${input.productIssues.length}`,
    ...(input.skipReason ? [`skipReason: ${input.skipReason}`] : []),
    ...(validation.issues.length ? [`issues: ${validation.issues.join("; ")}`] : []),
  ];
}

function validateMaturityAssertions(assertions: readonly unknown[], issues: string[]): void {
  for (const [index, assertion] of assertions.entries()) {
    if (!isRecord(assertion)) {
      issues.push(`Live confidence maturityAssertion ${index} must be an object.`);
      continue;
    }
    if (!stringValue(assertion.id)) issues.push(`Live confidence maturityAssertion ${index} is missing id.`);
    if (!stringValue(assertion.label)) issues.push(`Live confidence maturityAssertion ${index} is missing label.`);
    if (!["passed", "failed", "blocked", "skipped"].includes(String(assertion.status))) {
      issues.push(`Live confidence maturityAssertion ${index} status is ${String(assertion.status ?? "missing")}.`);
    }
    const evidence = Array.isArray(assertion.evidence) ? assertion.evidence : [];
    if (!evidence.some((entry) => stringValue(entry))) {
      issues.push(`Live confidence maturityAssertion ${stringValue(assertion.id) ?? index} is missing evidence.`);
    }
    const capabilities = Array.isArray(assertion.capabilities) ? assertion.capabilities : [];
    if (!capabilities.some((entry) => stringValue(entry))) {
      issues.push(`Live confidence maturityAssertion ${stringValue(assertion.id) ?? index} is missing capabilities.`);
    }
    if (assertion.artifactPath !== undefined && !safeRelativePath(stringValue(assertion.artifactPath))) {
      issues.push(`Live confidence maturityAssertion ${stringValue(assertion.id) ?? index} artifactPath must be a safe relative path.`);
    }
  }
}

function validateChildAuthorityMaturityAssertions(input: {
  sliceKind: string | undefined;
  status: string | undefined;
  maturityAssertions: readonly unknown[];
}, issues: string[]): void {
  if (input.sliceKind !== "child_authority" || input.status !== "passed") return;
  requirePassedMaturityAssertions(input.maturityAssertions, [
    "child_long_context_authority",
    "child_file_approval_authority",
    "child_browser_approval_authority",
  ], "child_authority", issues);
}

function validateWorkflowSymphonyMaturityAssertions(input: {
  sliceKind: string | undefined;
  status: string | undefined;
  maturityAssertions: readonly unknown[];
}, issues: string[]): void {
  if (!["workflow_symphony", "workflow_symphony_broader"].includes(input.sliceKind ?? "") || input.status !== "passed") return;
  const assertions = input.maturityAssertions.filter(isRecord);
  const requiredIds = [
    "live_workflow_run",
    "broader_workflow_ui_dogfood",
    "child_mutating_workflow",
    "workflow_task_artifact_rehydration",
  ];
  for (const id of requiredIds) {
    const assertion = assertions.find((item) => item.id === id);
    if (!assertion) {
      issues.push(`Passed ${input.sliceKind} live confidence evidence is missing maturityAssertion ${id}.`);
      continue;
    }
    if (assertion.status !== "passed") {
      issues.push(`Passed ${input.sliceKind} maturityAssertion ${id} status is ${String(assertion.status ?? "missing")}.`);
    }
  }
}

function validateLocalRuntimeMaturityAssertions(input: {
  sliceKind: string | undefined;
  status: string | undefined;
  maturityAssertions: readonly unknown[];
}, issues: string[]): void {
  if (input.sliceKind !== "local_runtime" || input.status !== "passed") return;
  const assertions = input.maturityAssertions.filter(isRecord);
  const requiredIds = [
    "local_runtime_active_lease_stop_blocker",
    "local_runtime_untracked_safety",
    "local_runtime_stale_lease_recovery",
    "local_runtime_provider_lifecycle",
    "local_runtime_proof_gate",
  ];
  for (const id of requiredIds) {
    const assertion = assertions.find((item) => item.id === id);
    if (!assertion) {
      issues.push(`Passed local_runtime live confidence evidence is missing maturityAssertion ${id}.`);
      continue;
    }
    if (assertion.status !== "passed") {
      issues.push(`Passed local_runtime maturityAssertion ${id} status is ${String(assertion.status ?? "missing")}.`);
    }
  }
}

function validateRestartRepairMaturityAssertions(input: {
  sliceKind: string | undefined;
  status: string | undefined;
  maturityAssertions: readonly unknown[];
}, issues: string[]): void {
  if (input.sliceKind !== "restart_repair" || input.status !== "passed") return;
  requirePassedMaturityAssertions(input.maturityAssertions, [
    "restart_repair_runtime_event_replay",
    "restart_repair_child_tree_repair",
    "restart_repair_mailbox_rehydration",
    "restart_repair_artifact_pointer_rehydration",
    "restart_repair_lifecycle_edge_coverage",
    "restart_repair_synthesis_safety",
  ], "restart_repair", issues);
}

function validateLifecycleEdgeMaturityAssertions(input: {
  sliceKind: string | undefined;
  status: string | undefined;
  maturityAssertions: readonly unknown[];
}, issues: string[]): void {
  if (input.sliceKind !== "lifecycle_edges" || input.status !== "passed") return;
  requirePassedMaturityAssertions(input.maturityAssertions, [
    "lifecycle_edge_restart",
    "lifecycle_edge_stop",
    "lifecycle_edge_detach",
    "lifecycle_edge_cancel",
    "lifecycle_edge_retry",
    "lifecycle_edge_timeout",
    "lifecycle_edge_partial_result",
    "lifecycle_edge_synthesis_safety",
  ], "lifecycle_edges", issues);
}

function validateDesktopDogfoodMaturityAssertions(input: {
  sliceKind: string | undefined;
  status: string | undefined;
  maturityAssertions: readonly unknown[];
}, issues: string[]): void {
  if (input.sliceKind !== "desktop_dogfood" || input.status !== "passed") return;
  requirePassedMaturityAssertions(input.maturityAssertions, [
    "desktop_dogfood_scenario_coverage",
    "desktop_dogfood_visual_layout",
    "desktop_dogfood_lifecycle_edges",
    "desktop_dogfood_runtime_and_operator_controls",
  ], "desktop_dogfood", issues);
}

function requirePassedMaturityAssertions(
  maturityAssertions: readonly unknown[],
  requiredIds: readonly string[],
  sliceKind: string,
  issues: string[],
): void {
  const assertions = maturityAssertions.filter(isRecord);
  for (const id of requiredIds) {
    const assertion = assertions.find((item) => item.id === id);
    if (!assertion) {
      issues.push(`Passed ${sliceKind} live confidence evidence is missing maturityAssertion ${id}.`);
      continue;
    }
    if (assertion.status !== "passed") {
      issues.push(`Passed ${sliceKind} maturityAssertion ${id} status is ${String(assertion.status ?? "missing")}.`);
    }
  }
}

function validateArtifactRefs(artifacts: readonly unknown[], issues: string[]): void {
  for (const [index, artifact] of artifacts.entries()) {
    if (!isRecord(artifact)) {
      issues.push(`Live confidence artifact ${index} must be an object.`);
      continue;
    }
    if (!stringValue(artifact.label)) issues.push(`Live confidence artifact ${index} is missing label.`);
    if (!stringValue(artifact.path)) issues.push(`Live confidence artifact ${index} is missing path.`);
  }
}

function validateClassifiedBlockers(blockers: readonly unknown[], issues: string[]): void {
  for (const [index, blocker] of blockers.entries()) {
    if (!isRecord(blocker)) {
      issues.push(`Live confidence classifiedBlocker ${index} must be an object.`);
      continue;
    }
    if (!stringValue(blocker.kind)) issues.push(`Live confidence classifiedBlocker ${index} is missing kind.`);
    if (!stringValue(blocker.summary)) issues.push(`Live confidence classifiedBlocker ${index} is missing summary.`);
    if (typeof blocker.classifiedAsEnvironmental !== "boolean") {
      issues.push(`Live confidence classifiedBlocker ${index} must set classifiedAsEnvironmental.`);
    }
  }
}

function validateProductIssues(productIssues: readonly unknown[], issues: string[]): void {
  for (const [index, productIssue] of productIssues.entries()) {
    if (!isRecord(productIssue)) {
      issues.push(`Live confidence productIssue ${index} must be an object.`);
      continue;
    }
    if (!["p0", "p1", "p2", "p3"].includes(String(productIssue.severity))) {
      issues.push(`Live confidence productIssue ${index} severity is ${String(productIssue.severity ?? "missing")}.`);
    }
    if (!stringValue(productIssue.summary)) issues.push(`Live confidence productIssue ${index} is missing summary.`);
  }
}

function validateProbes(probes: readonly unknown[], issues: string[]): void {
  for (const [index, probe] of probes.entries()) {
    if (!isRecord(probe)) {
      issues.push(`Live confidence probe ${index} must be an object.`);
      continue;
    }
    if (!stringValue(probe.label)) issues.push(`Live confidence probe ${index} is missing label.`);
  }
}

function normalizedCloseoutAnswer(input: SubagentLiveConfidenceCloseoutAnswer): SubagentLiveConfidenceCloseoutAnswer {
  if (!isLiveConfidenceCloseoutKind(input?.kind)) {
    throw new Error("Sub-agent live confidence evidence requires closeoutAnswer.kind.");
  }
  return {
    kind: input.kind,
    summary: requiredString(input.summary, "closeoutAnswer.summary"),
  };
}

function isLiveConfidenceSliceKind(value: string | undefined): value is SubagentLiveConfidenceSliceKind {
  return !!value && SUBAGENT_LIVE_CONFIDENCE_SLICE_KINDS.includes(value as SubagentLiveConfidenceSliceKind);
}

function isLiveConfidenceStatus(value: string | undefined): value is SubagentLiveConfidenceStatus {
  return !!value && SUBAGENT_LIVE_CONFIDENCE_STATUSES.includes(value as SubagentLiveConfidenceStatus);
}

function isLiveConfidenceProviderKind(value: string | undefined): value is SubagentLiveConfidenceProviderSnapshot["kind"] {
  return !!value && ["gmi-cloud", "ambient", "local", "custom", "none"].includes(value);
}

function isLiveConfidenceDelta(value: string | undefined): value is SubagentLiveConfidenceDelta {
  return !!value && ["increased", "unchanged", "decreased", "not_applicable"].includes(value);
}

function isLiveConfidenceCloseoutKind(value: unknown): value is SubagentLiveConfidenceCloseoutKind {
  return typeof value === "string" && ["saw_live", "blocked", "no_live_surface"].includes(value);
}

function isValidTimestamp(value: string | undefined): value is string {
  return !!value && !Number.isNaN(Date.parse(value));
}

function requiredString(value: string | undefined, field: string): string {
  const normalized = stringValue(value);
  if (!normalized) throw new Error(`Sub-agent live confidence evidence requires ${field}.`);
  return normalized;
}

function normalizedStrings(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizedMaturityAssertions(values: readonly SubagentLiveConfidenceMaturityAssertion[]): SubagentLiveConfidenceMaturityAssertion[] {
  return values.map((assertion) => ({
    id: requiredString(assertion.id, "maturityAssertion.id"),
    label: requiredString(assertion.label, "maturityAssertion.label"),
    status: assertion.status,
    ...(stringValue(assertion.artifactPath) ? { artifactPath: stringValue(assertion.artifactPath) } : {}),
    ...(assertion.capabilities ? { capabilities: normalizedStrings(assertion.capabilities) } : {}),
    evidence: normalizedStrings(assertion.evidence),
  }));
}

function definedStrings<T extends Record<string, string | undefined>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => stringValue(value))) as Partial<T>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(value: string | undefined): value is string {
  return !!value && !value.startsWith("/") && !value.split("/").some((part) => part === "" || part === "..");
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
