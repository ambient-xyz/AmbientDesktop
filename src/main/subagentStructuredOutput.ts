import type { SubagentResultArtifact } from "../shared/subagentProtocol";
import type { SubagentRoleId, SubagentRoleProfile } from "../shared/subagentRoles";

export const SUBAGENT_STRUCTURED_RESULT_SCHEMA_VERSION = "ambient-subagent-structured-result-v1" as const;
export const SUBAGENT_RESULT_JSON_MARKER = "SUBAGENT_RESULT_JSON:" as const;

export type SubagentStructuredResultStatus = "complete" | "partial" | "failed" | "needs_attention";

export interface SubagentStructuredResult {
  schemaVersion: typeof SUBAGENT_STRUCTURED_RESULT_SCHEMA_VERSION;
  roleId: SubagentRoleId;
  status: SubagentStructuredResultStatus;
  summary: string;
  evidence: string[];
  artifacts: string[];
  risks: string[];
  nextActions: string[];
  roleOutput: Record<string, unknown>;
}

export interface SubagentStructuredResultValidation {
  valid: boolean;
  synthesisAllowed: boolean;
  required: boolean;
  reason?: string;
  status?: SubagentStructuredResultStatus;
  structuredResult?: SubagentStructuredResult;
}

const REVIEWER_VERDICT_VALUES = new Set([
  "approved",
  "approve",
  "go",
  "no_go",
  "no-go",
  "nogo",
  "passed",
  "pass",
  "risks_found",
  "needs_revision",
  "blocked",
  "selected",
  "selection_made",
  "winner_selected",
  "ranked",
  "recommend",
  "recommended",
]);

export const REVIEWER_VERDICT_HELP =
  "approved, approve, go, no_go, no-go, passed, pass, risks_found, needs_revision, blocked, selected, selection_made, winner_selected, ranked, recommend, or recommended";
export const REVIEWER_FINDINGS_HELP =
  "roleOutput.findings must be an array; put concise reviewer findings there even when rubric, scores, winner, ranking, or recommendation are also present.";

export function subagentStructuredResultTemplate(role: Pick<SubagentRoleProfile, "id">): SubagentStructuredResult {
  return {
    schemaVersion: SUBAGENT_STRUCTURED_RESULT_SCHEMA_VERSION,
    roleId: role.id,
    status: "complete",
    summary: "Concise child result for the parent.",
    evidence: ["Evidence, source, artifact, or transcript pointer."],
    artifacts: [],
    risks: [],
    nextActions: [],
    roleOutput: roleOutputTemplate(role.id),
  };
}

export function subagentStructuredResultTemplateText(role: Pick<SubagentRoleProfile, "id">): string {
  return JSON.stringify(subagentStructuredResultTemplate(role), null, 2);
}

export function extractSubagentStructuredResultFromText(text: string): unknown | undefined {
  const markerIndex = text.lastIndexOf(SUBAGENT_RESULT_JSON_MARKER);
  if (markerIndex < 0) return undefined;
  const afterMarker = text.slice(markerIndex + SUBAGENT_RESULT_JSON_MARKER.length).trimStart();
  const fenced = afterMarker.match(/^```(?:json)?\s*\n([\s\S]*?)\n```/i);
  const candidateText = fenced ? fenced[1] : jsonObjectText(afterMarker);
  if (!candidateText) return undefined;
  try {
    return JSON.parse(candidateText);
  } catch {
    return undefined;
  }
}

export function validateSubagentStructuredResult(input: {
  role: SubagentRoleProfile;
  structuredResult: unknown;
  expectedStatus: SubagentStructuredResultStatus;
}): SubagentStructuredResultValidation {
  const record = objectRecord(input.structuredResult);
  if (!record) return invalidStructuredResult("Structured sub-agent result JSON is missing or not an object.", true);
  if (record.schemaVersion !== SUBAGENT_STRUCTURED_RESULT_SCHEMA_VERSION) {
    return invalidStructuredResult(`Structured result schema version must be ${SUBAGENT_STRUCTURED_RESULT_SCHEMA_VERSION}.`, true);
  }
  if (record.roleId !== input.role.id) {
    return invalidStructuredResult(`Structured result roleId must match child role ${input.role.id}.`, true);
  }
  const status = typeof record.status === "string" ? record.status : "";
  if (!isStructuredStatus(status)) {
    return invalidStructuredResult("Structured result status must be complete, partial, failed, or needs_attention.", true);
  }
  if (status !== input.expectedStatus) {
    return invalidStructuredResult(`Structured result status ${status} does not match ${input.expectedStatus}.`, true, status);
  }
  if (typeof record.summary !== "string" || !record.summary.trim()) {
    return invalidStructuredResult("Structured result summary is empty.", true, status);
  }
  for (const key of ["evidence", "artifacts", "risks", "nextActions"] as const) {
    if (!stringArray(record[key])) return invalidStructuredResult(`Structured result ${key} must be an array of strings.`, true, status);
  }
  const roleOutput = objectRecord(record.roleOutput);
  if (!roleOutput) return invalidStructuredResult("Structured result roleOutput is missing or not an object.", true, status);
  const roleValidation = validateRoleOutput(input.role, roleOutput, status);
  if (!roleValidation.valid) return roleValidation;
  const structuredResult = {
    schemaVersion: SUBAGENT_STRUCTURED_RESULT_SCHEMA_VERSION,
    roleId: input.role.id,
    status,
    summary: record.summary.trim(),
    evidence: record.evidence as string[],
    artifacts: record.artifacts as string[],
    risks: record.risks as string[],
    nextActions: record.nextActions as string[],
    roleOutput,
  };
  return {
    valid: true,
    synthesisAllowed: status === "complete" || status === "partial",
    required: true,
    status,
    structuredResult,
  };
}

export function validateSubagentStructuredResultArtifactForRole(input: {
  role: SubagentRoleProfile;
  artifact: unknown;
}): SubagentStructuredResultValidation {
  if (!input.role.guardPolicy.structuredOutputRequired) {
    return { valid: true, synthesisAllowed: true, required: false };
  }
  const artifact = objectRecord(input.artifact);
  if (!artifact) return invalidStructuredResult("Structured result validation needs a result artifact.", true);
  const expectedStatus = structuredStatusFromArtifact(artifact);
  if (!expectedStatus) {
    return {
      valid: true,
      synthesisAllowed: false,
      required: true,
      reason: "Structured output is required only for completed or explicit partial child results.",
    };
  }
  return validateSubagentStructuredResult({
    role: input.role,
    structuredResult: artifact.structuredOutput,
    expectedStatus,
  });
}

export function subagentStructuredOutputForLocalText(input: {
  role: SubagentRoleProfile;
  summary: string;
  artifactPath?: string;
  fullOutputPath?: string;
}): SubagentStructuredResult {
  const summary = input.summary.trim() || "Local text child completed without visible text.";
  const artifacts = [input.artifactPath, input.fullOutputPath].filter((value): value is string => Boolean(value));
  const template = subagentStructuredResultTemplate(input.role);
  return {
    ...template,
    status: "complete",
    summary,
    evidence: artifacts.length ? artifacts : ["Local text runtime output."],
    artifacts,
    roleOutput: roleOutputFromSummary(input.role.id, summary, artifacts),
  };
}

function roleOutputTemplate(roleId: SubagentRoleId): Record<string, unknown> {
  if (roleId === "explorer") return { findings: [{ summary: "Finding with provenance.", provenance: [] }], openQuestions: [] };
  if (roleId === "drafter") return { draft: "Draft text or proposed content.", constraintsChecked: [], rationale: [] };
  if (roleId === "reviewer") return { verdict: "risks_found", findings: [{ summary: "Review finding.", evidence: [] }] };
  if (roleId === "summarizer") return { keyPoints: ["Key point."], sourceRefs: [] };
  return { changes: [], validation: [], mutationEvidence: [] };
}

function roleOutputFromSummary(roleId: SubagentRoleId, summary: string, artifacts: string[]): Record<string, unknown> {
  if (roleId === "explorer") return { findings: [{ summary, provenance: artifacts }], openQuestions: [] };
  if (roleId === "drafter") return { draft: summary, constraintsChecked: artifacts, rationale: [] };
  if (roleId === "reviewer") return { verdict: "risks_found", findings: [], sourceRefs: artifacts };
  if (roleId === "summarizer") return { keyPoints: [summary], sourceRefs: artifacts };
  return { changes: [], validation: [], mutationEvidence: [] };
}

function validateRoleOutput(
  role: SubagentRoleProfile,
  roleOutput: Record<string, unknown>,
  status: SubagentStructuredResultStatus,
): SubagentStructuredResultValidation {
  if (role.id === "explorer") {
    const findings = objectArray(roleOutput.findings);
    if ((status === "complete" || status === "partial") && findings.length === 0) {
      return invalidStructuredResult("Explorer structured output requires at least one finding.", true, status);
    }
    if (findings.some((finding) => typeof finding.summary !== "string" || !finding.summary.trim())) {
      return invalidStructuredResult("Explorer findings require non-empty summary fields.", true, status);
    }
  }
  if (role.id === "drafter") {
    if ((status === "complete" || status === "partial") && (typeof roleOutput.draft !== "string" || !roleOutput.draft.trim())) {
      return invalidStructuredResult("Drafter structured output requires a non-empty draft.", true, status);
    }
    if (roleOutput.constraintsChecked !== undefined && !stringOrStringArray(roleOutput.constraintsChecked)) {
      return invalidStructuredResult("Drafter structured output constraintsChecked must be a string or array of strings.", true, status);
    }
    if (roleOutput.rationale !== undefined && !stringOrStringArray(roleOutput.rationale)) {
      return invalidStructuredResult("Drafter structured output rationale must be a string or array of strings.", true, status);
    }
  }
  if (role.id === "reviewer") {
    if (!REVIEWER_VERDICT_VALUES.has(reviewerVerdictKey(roleOutput.verdict))) {
      return invalidStructuredResult(`Reviewer structured output requires verdict ${REVIEWER_VERDICT_HELP}.`, true, status);
    }
    if (!Array.isArray(roleOutput.findings)) return invalidStructuredResult(`Reviewer structured output requires ${REVIEWER_FINDINGS_HELP}`, true, status);
  }
  if (role.id === "summarizer" && (status === "complete" || status === "partial")) {
    const keyPoints = stringArray(roleOutput.keyPoints);
    if (!keyPoints || keyPoints.length === 0) {
      return invalidStructuredResult("Summarizer structured output requires at least one key point.", true, status);
    }
  }
  if (role.guardPolicy.implementationEvidenceRequired && status === "complete") {
    const evidence = objectArray(roleOutput.mutationEvidence);
    if (evidence.length === 0) {
      return invalidStructuredResult("Implementation roles require mutation evidence before completed synthesis.", true, status);
    }
  }
  return { valid: true, synthesisAllowed: true, required: true, status };
}

function reviewerVerdictKey(verdict: unknown): string {
  return typeof verdict === "string" ? verdict.trim().toLowerCase().replace(/\s+/g, "_") : "";
}

function structuredStatusFromArtifact(artifact: Record<string, unknown>): SubagentStructuredResultStatus | undefined {
  if (artifact.status === "completed" && artifact.partial === false) return "complete";
  if (artifact.status === "aborted_partial" && artifact.partial === true) return "partial";
  return undefined;
}

function invalidStructuredResult(
  reason: string,
  required: boolean,
  status?: SubagentStructuredResultStatus,
): SubagentStructuredResultValidation {
  return {
    valid: false,
    synthesisAllowed: false,
    required,
    reason,
    ...(status ? { status } : {}),
  };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(objectRecord(item))) : [];
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "string") ? value : undefined;
}

function stringOrStringArray(value: unknown): string | string[] | undefined {
  if (typeof value === "string") return value;
  return stringArray(value);
}

function isStructuredStatus(status: string): status is SubagentStructuredResultStatus {
  return status === "complete" || status === "partial" || status === "failed" || status === "needs_attention";
}

function jsonObjectText(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  return text.slice(start, end + 1);
}
