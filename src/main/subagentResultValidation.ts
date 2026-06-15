import {
  validateSubagentResultArtifactForSynthesis,
} from "../shared/subagentProtocol";
import type {
  SubagentRunEventSummary,
  SubagentRunSummary,
} from "../shared/types";
import {
  validateSubagentCompletionGuard,
} from "./subagentCompletionGuard";
import {
  previewSubagentSpawnText,
} from "./subagentSpawnFailure";
import {
  validateSubagentStructuredResultArtifactForRole,
} from "./subagentStructuredOutput";

export const SUBAGENT_RESULT_VALIDATION_SCHEMA_VERSION =
  "ambient-subagent-result-validation-v1" as const;

export type SubagentResultValidation = ReturnType<typeof validateSubagentResultArtifactForSynthesis> & {
  artifactValidation: ReturnType<typeof validateSubagentResultArtifactForSynthesis>;
  structuredOutputValidation: Record<string, unknown>;
  completionGuardValidation: Record<string, unknown>;
};

export function validateSubagentResultForRun(
  run: SubagentRunSummary,
  events: readonly SubagentRunEventSummary[],
): SubagentResultValidation {
  const artifactValidation = validateSubagentResultArtifactForSynthesis(run.resultArtifact);
  const role = run.roleProfileSnapshot;
  const structuredOutputValidationRaw = validateSubagentStructuredResultArtifactForRole({
    role,
    artifact: run.resultArtifact,
  });
  const completionGuardValidationRaw = validateSubagentCompletionGuard({ role, run, events });
  const synthesisAllowed = artifactValidation.synthesisAllowed &&
    structuredOutputValidationRaw.synthesisAllowed &&
    completionGuardValidationRaw.synthesisAllowed;
  const reason = artifactValidation.synthesisAllowed
    ? structuredOutputValidationRaw.synthesisAllowed
      ? completionGuardValidationRaw.reason
      : structuredOutputValidationRaw.reason
    : artifactValidation.reason;
  const structuredOutputValidation = compactSubagentStructuredOutputValidation(structuredOutputValidationRaw);
  const completionGuardValidation = compactSubagentCompletionGuardValidation(completionGuardValidationRaw);
  return {
    ...artifactValidation,
    valid: artifactValidation.valid && structuredOutputValidationRaw.valid && completionGuardValidationRaw.valid,
    synthesisAllowed,
    ...(reason ? { reason } : {}),
    artifactValidation,
    structuredOutputValidation,
    completionGuardValidation,
  };
}

export function compactSubagentStructuredOutputValidation(
  validation: ReturnType<typeof validateSubagentStructuredResultArtifactForRole>,
): Record<string, unknown> {
  return {
    valid: validation.valid,
    synthesisAllowed: validation.synthesisAllowed,
    required: validation.required,
    ...(validation.reason ? { reason: validation.reason } : {}),
    ...(validation.status ? { status: validation.status } : {}),
    ...(validation.structuredResult ? {
      structuredResult: {
        schemaVersion: validation.structuredResult.schemaVersion,
        roleId: validation.structuredResult.roleId,
        status: validation.structuredResult.status,
        summary: previewSubagentSpawnText(validation.structuredResult.summary, 240),
        evidenceCount: validation.structuredResult.evidence.length,
        artifactCount: validation.structuredResult.artifacts.length,
        riskCount: validation.structuredResult.risks.length,
        nextActionCount: validation.structuredResult.nextActions.length,
      },
    } : {}),
  };
}

export function compactSubagentCompletionGuardValidation(
  validation: ReturnType<typeof validateSubagentCompletionGuard>,
): Record<string, unknown> {
  return {
    valid: validation.valid,
    synthesisAllowed: validation.synthesisAllowed,
    required: validation.required,
    structuredEvidenceCount: validation.structuredEvidenceCount,
    ambientEvidenceCount: validation.ambientEvidenceCount,
    isolatedWorktreeEvidenceCount: validation.isolatedWorktreeEvidenceCount,
    approvalEvidenceCount: validation.approvalEvidenceCount,
    ...(validation.reason ? { reason: validation.reason } : {}),
  };
}
