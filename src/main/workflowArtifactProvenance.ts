import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkflowArtifactSourceProvenance, WorkflowArtifactSummary } from "../shared/types";

export function workflowArtifactSourceProvenance(
  artifact: Pick<WorkflowArtifactSummary, "sourcePath">,
): WorkflowArtifactSourceProvenance {
  const artifactRoot = dirname(artifact.sourcePath);
  const loweredPlanPath = join(artifactRoot, "lowered-plan.json");
  const compileContextPath = join(artifactRoot, "compile-context.json");
  const promptAssemblyPath = join(artifactRoot, "prompt-assembly.json");
  const repairHistoryPath = join(artifactRoot, "repair-history.json");
  const validationReportPath = join(artifactRoot, "validation-report.json");
  const loweredPlan = readLoweredPlan(loweredPlanPath);
  const compileContext = readCompileContext(compileContextPath);
  if (loweredPlan.valid || compileContext.compilerMode === "program_ir") {
    return {
      kind: "program_ir_generated",
      editable: false,
      validationMode: "program_ir_artifact",
      reason: "Generated from WorkflowProgramIR; revise by recompiling or proposing a workflow revision, not by editing the generated program.",
      loweredPlanPath: loweredPlan.valid ? loweredPlanPath : undefined,
      compileContextPath: compileContext.exists ? compileContextPath : undefined,
      promptAssemblyPath: existsSync(promptAssemblyPath) ? promptAssemblyPath : undefined,
      repairHistoryPath: existsSync(repairHistoryPath) ? repairHistoryPath : undefined,
      validationReportPath: existsSync(validationReportPath) ? validationReportPath : undefined,
      compilerMode: "program_ir",
    };
  }
  return {
    kind: "legacy_source",
    editable: true,
    validationMode: "legacy_source",
    reason: "Legacy source artifact; source-level validation is retained for compatibility with existing artifacts.",
    compileContextPath: compileContext.exists ? compileContextPath : undefined,
    promptAssemblyPath: existsSync(promptAssemblyPath) ? promptAssemblyPath : undefined,
    repairHistoryPath: existsSync(repairHistoryPath) ? repairHistoryPath : undefined,
    validationReportPath: existsSync(validationReportPath) ? validationReportPath : undefined,
    compilerMode: compileContext.compilerMode,
  };
}

export function assertWorkflowArtifactSourceEditable(artifact: Pick<WorkflowArtifactSummary, "sourcePath">): void {
  const provenance = workflowArtifactSourceProvenance(artifact);
  if (provenance.editable) return;
  throw new Error(provenance.reason);
}

export function validateWorkflowProgramIrArtifactFiles(artifact: Pick<WorkflowArtifactSummary, "sourcePath">): WorkflowArtifactSourceProvenance {
  const provenance = workflowArtifactSourceProvenance(artifact);
  if (provenance.kind !== "program_ir_generated") return provenance;
  if (!provenance.loweredPlanPath || !existsSync(provenance.loweredPlanPath)) {
    throw new Error("WorkflowProgramIR artifact is missing lowered-plan.json.");
  }
  const loweredPlan = readLoweredPlan(provenance.loweredPlanPath);
  if (!loweredPlan.valid) throw new Error(loweredPlan.error ?? "WorkflowProgramIR lowered plan is invalid.");
  if (!provenance.compileContextPath || !existsSync(provenance.compileContextPath)) {
    throw new Error("WorkflowProgramIR artifact is missing compile-context.json.");
  }
  const compileContext = readCompileContext(provenance.compileContextPath);
  if (!compileContext.valid) throw new Error(compileContext.error ?? "WorkflowProgramIR compile context is invalid.");
  if (!provenance.repairHistoryPath || !existsSync(provenance.repairHistoryPath)) {
    throw new Error("WorkflowProgramIR artifact is missing repair-history.json.");
  }
  const repairHistory = readRepairHistory(provenance.repairHistoryPath);
  if (!repairHistory.valid) throw new Error(repairHistory.error ?? "WorkflowProgramIR repair history is invalid.");
  if (!existsSync(artifact.sourcePath)) throw new Error("WorkflowProgramIR generated program is missing.");
  return provenance;
}

function readLoweredPlan(path: string): { valid: boolean; error?: string } {
  if (!existsSync(path)) return { valid: false, error: "missing" };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (parsed.schemaVersion !== 1) return { valid: false, error: "lowered-plan.json has an unsupported schemaVersion." };
    if (typeof parsed.operationPlanHash !== "string" || !parsed.operationPlanHash.trim()) {
      return { valid: false, error: "lowered-plan.json is missing operationPlanHash." };
    }
    if (!Array.isArray(parsed.operations)) return { valid: false, error: "lowered-plan.json is missing operations." };
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readCompileContext(path: string): { exists: boolean; valid: boolean; compilerMode?: string; error?: string } {
  if (!existsSync(path)) return { exists: false, valid: false, error: "missing" };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const compilerMode = typeof parsed.compilerMode === "string" ? parsed.compilerMode : undefined;
    if (parsed.schemaVersion !== 1) return { exists: true, valid: false, compilerMode, error: "compile-context.json has an unsupported schemaVersion." };
    if (compilerMode !== "program_ir") return { exists: true, valid: false, compilerMode, error: "compile-context.json has an invalid compilerMode." };
    if (!Array.isArray(parsed.discoveryQuestions)) return { exists: true, valid: false, compilerMode, error: "compile-context.json is missing discoveryQuestions." };
    if (!Array.isArray(parsed.explorationTraces)) return { exists: true, valid: false, compilerMode, error: "compile-context.json is missing explorationTraces." };
    if (parsed.cacheCheckpoint !== undefined && !validCompileContextCacheCheckpoint(parsed.cacheCheckpoint)) {
      return { exists: true, valid: false, compilerMode, error: "compile-context.json has an invalid cacheCheckpoint." };
    }
    return { exists: true, valid: true, compilerMode };
  } catch (error) {
    return { exists: true, valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function validCompileContextCacheCheckpoint(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const checkpoint = value as Record<string, unknown>;
  return (
    typeof checkpoint.stablePrefixEstimatedTokens === "number" &&
    Number.isFinite(checkpoint.stablePrefixEstimatedTokens) &&
    checkpoint.stablePrefixEstimatedTokens >= 0 &&
    typeof checkpoint.mutableSuffixEstimatedTokens === "number" &&
    Number.isFinite(checkpoint.mutableSuffixEstimatedTokens) &&
    checkpoint.mutableSuffixEstimatedTokens >= 0
  );
}

function readRepairHistory(path: string): { valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (parsed.schemaVersion !== 1) return { valid: false, error: "repair-history.json has an unsupported schemaVersion." };
    if (!Number.isInteger(parsed.repairAttemptCount) || Number(parsed.repairAttemptCount) < 0) {
      return { valid: false, error: "repair-history.json has an invalid repairAttemptCount." };
    }
    if (!Number.isInteger(parsed.patchOperationCount) || Number(parsed.patchOperationCount) < 0) {
      return { valid: false, error: "repair-history.json has an invalid patchOperationCount." };
    }
    if (!Array.isArray(parsed.attempts)) return { valid: false, error: "repair-history.json is missing attempts." };
    if (parsed.attempts.length !== parsed.repairAttemptCount) {
      return { valid: false, error: "repair-history.json repairAttemptCount does not match attempts." };
    }
    let patchOperationCount = 0;
    for (const [index, attempt] of parsed.attempts.entries()) {
      const validation = validateRepairHistoryAttempt(attempt, index);
      if (!validation.valid) return validation;
      patchOperationCount += validation.patchOperationCount;
    }
    if (patchOperationCount !== parsed.patchOperationCount) {
      return { valid: false, error: "repair-history.json patchOperationCount does not match attempts." };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function validateRepairHistoryAttempt(value: unknown, index: number): { valid: boolean; patchOperationCount: number; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, patchOperationCount: 0, error: `repair-history.json attempt ${index + 1} is invalid.` };
  }
  const attempt = value as Record<string, unknown>;
  if (!Number.isInteger(attempt.attempt) || Number(attempt.attempt) < 1) {
    return { valid: false, patchOperationCount: 0, error: `repair-history.json attempt ${index + 1} has an invalid attempt number.` };
  }
  if (!Array.isArray(attempt.diagnostics)) {
    return { valid: false, patchOperationCount: 0, error: `repair-history.json attempt ${index + 1} is missing diagnostics.` };
  }
  if (!Number.isInteger(attempt.diagnosticCount) || Number(attempt.diagnosticCount) !== attempt.diagnostics.length) {
    return { valid: false, patchOperationCount: 0, error: `repair-history.json attempt ${index + 1} diagnosticCount does not match diagnostics.` };
  }
  if (!Array.isArray(attempt.patch)) {
    return { valid: false, patchOperationCount: 0, error: `repair-history.json attempt ${index + 1} is missing patch operations.` };
  }
  if (!Number.isInteger(attempt.patchOperationCount) || Number(attempt.patchOperationCount) !== attempt.patch.length) {
    return { valid: false, patchOperationCount: 0, error: `repair-history.json attempt ${index + 1} patchOperationCount does not match patch.` };
  }
  for (const [patchIndex, operation] of attempt.patch.entries()) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
      return { valid: false, patchOperationCount: 0, error: `repair-history.json attempt ${index + 1} patch ${patchIndex + 1} is invalid.` };
    }
    const patch = operation as Record<string, unknown>;
    if (patch.op !== "add" && patch.op !== "replace" && patch.op !== "remove") {
      return { valid: false, patchOperationCount: 0, error: `repair-history.json attempt ${index + 1} patch ${patchIndex + 1} has an invalid op.` };
    }
    if (typeof patch.path !== "string" || !patch.path.startsWith("/")) {
      return { valid: false, patchOperationCount: 0, error: `repair-history.json attempt ${index + 1} patch ${patchIndex + 1} has an invalid path.` };
    }
  }
  return { valid: true, patchOperationCount: attempt.patch.length };
}
