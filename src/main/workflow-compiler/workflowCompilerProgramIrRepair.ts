import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkflowCompileProgress, WorkflowPromptCacheCheckpoint } from "../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "./workflowCompilerDesktopToolFacade";
import { slugForWorkflowCompilerTitle } from "./workflowCompilerArtifactFiles";
import type { WorkflowCompilerAmbientCliCapability } from "./workflowCompiler";
import type { WorkflowCompileContext } from "./workflowCompilerCapabilityDiscovery";
import {
  applyWorkflowProgramIrPatch,
  buildWorkflowProgramIrRepairPrompt,
  classifyWorkflowProgramIrRepairValidationError,
  parseWorkflowProgramIrRepairResponse,
  WorkflowProgramIrRepairRejectedError,
  type WorkflowProgramIrPatchOperation,
} from "./workflowCompilerIrRepair";
import type { WorkflowCompilerRecipeSelectionResult, WorkflowCompilerSelectedRecipe } from "./workflowCompilerRecipes";
import { workflowPromptParts, type WorkflowPiProgress } from "./workflowCompilerWorkflowFacade";
import type { WorkflowConnectorDescriptor } from "./workflowCompilerWorkflowFacade";
import {
  compileWorkflowProgramIr,
  createWorkflowProgramCompileCache,
  WorkflowProgramCompileError,
  type WorkflowProgramCompileResult,
  type WorkflowProgramDiagnostic,
} from "./workflowCompilerWorkflowProgramFacade";

const DEFAULT_WORKFLOW_PROGRAM_IR_REPAIR_RETRY_LIMIT = 2;
const DEFAULT_WORKFLOW_PROGRAM_IR_REPAIR_RESPONSE_RETRY_LIMIT = 2;

interface WorkflowProgramIrRepairProvider {
  repairProgramIr?(input: {
    prompt: string;
    model: string;
    cacheCheckpoint: WorkflowPromptCacheCheckpoint;
    attempt: number;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown>;
}

export interface WorkflowProgramIrCompilerInput {
  input: {
    userRequest: string;
    workflowThreadId?: string;
    revisionId?: string;
    toolDescriptors: DesktopToolDescriptor[];
    stateRoot: string;
  };
  provider: WorkflowProgramIrRepairProvider;
  model: string;
  compileContext: Pick<WorkflowCompileContext, "graphSnapshot">;
  compileToolDescriptors: DesktopToolDescriptor[];
  compileConnectorDescriptors: WorkflowConnectorDescriptor[];
  ambientCliCapabilities: WorkflowCompilerAmbientCliCapability[];
  selectedRecipes: WorkflowCompilerSelectedRecipe[];
  recipeSelection: WorkflowCompilerRecipeSelectionResult;
  capabilitySelection: {
    availableToolCount: number;
    selectedToolNames: string[];
  };
  connectorSelection: {
    selectedOperationCount: number;
    availableConnectorCount: number;
    selectedConnectorIds: string[];
  };
  emitProgress: (progress: Omit<WorkflowCompileProgress, "compileId" | "createdAt" | "total">) => void;
}

export type WorkflowProgramIrRepairHistoryEntry = {
  attempt: number;
  diagnostics: WorkflowProgramDiagnostic[];
  patch: WorkflowProgramIrPatchOperation[];
  rawPatch: unknown;
};

export async function compileWorkflowProgramIrWithRepair(input: { program: unknown; input: WorkflowProgramIrCompilerInput }): Promise<{
  compiled: WorkflowProgramCompileResult;
  program: unknown;
  repairHistory: WorkflowProgramIrRepairHistoryEntry[];
}> {
  let program = input.program;
  const repairHistory: WorkflowProgramIrRepairHistoryEntry[] = [];
  const incrementalCache = createWorkflowProgramCompileCache();
  const maxAttempts = positiveEnvNumber("AMBIENT_WORKFLOW_PROGRAM_IR_REPAIR_RETRY_LIMIT", DEFAULT_WORKFLOW_PROGRAM_IR_REPAIR_RETRY_LIMIT);
  for (let attempt = 0; ; attempt += 1) {
    const compileToolDescriptors = workflowProgramToolDescriptorsForProgram({
      selectedToolDescriptors: input.input.compileToolDescriptors,
      availableToolDescriptors: input.input.input.toolDescriptors,
      program,
    });
    try {
      const compiled = await compileWorkflowProgramIr({
        program,
        toolDescriptors: compileToolDescriptors,
        connectorDescriptors: input.input.compileConnectorDescriptors,
        ambientCliCapabilities: input.input.ambientCliCapabilities,
        validateGoogleReadOnly: true,
        incrementalCache,
      });
      const recipeContractDiagnostics = validateCompiledWorkflowProgramRecipeContracts(compiled, input.input.selectedRecipes);
      if (recipeContractDiagnostics.length > 0) throw new WorkflowProgramCompileError(recipeContractDiagnostics);
      return {
        compiled,
        program,
        repairHistory,
      };
    } catch (error) {
      const repairProgramIr = input.input.provider.repairProgramIr?.bind(input.input.provider);
      if (!(error instanceof WorkflowProgramCompileError) || !repairProgramIr || attempt >= maxAttempts) {
        if (error instanceof WorkflowProgramCompileError) {
          const failureArtifactPaths = await writeWorkflowProgramIrFailureArtifact({
            program,
            originalProgram: input.program,
            diagnostics: error.diagnostics,
            failureReport: error.failureReport,
            repairHistory,
            attempt,
            artifactDirs: workflowProgramIrFailureArtifactDirs(input.input),
            context: workflowProgramIrFailureArtifactContext(input.input),
          });
          input.input.emitProgress({
            phase: "validated",
            status: "failed",
            message: workflowProgramCompileFailureMessage(error),
            current: 4,
            error: error.message,
            metrics: workflowProgramCompileFailureMetrics(error, repairHistory.length, failureArtifactPaths[0]),
          });
        }
        throw error;
      }
      const repairAttempt = attempt + 1;
      const repairPrompt = buildWorkflowProgramIrRepairPrompt({
        program,
        diagnostics: error.diagnostics,
        toolDescriptors: compileToolDescriptors,
        connectorDescriptors: input.input.compileConnectorDescriptors,
        ambientCliCapabilities: input.input.ambientCliCapabilities,
        selectedRecipes: input.input.selectedRecipes,
        userRequest: input.input.input.userRequest,
        attempt: repairAttempt,
        maxAttempts,
      });
      const repairParts = workflowPromptParts({
        stage: input.input.input.revisionId ? "revision_compile" : "compile",
        workflowThreadId: input.input.input.workflowThreadId,
        revisionId: input.input.input.revisionId,
        graphSnapshotId: input.input.compileContext.graphSnapshot?.id,
        stablePrefix: [
          "You are repairing a WorkflowProgramIR document using typed repair operations.",
          'Return only JSON in this exact shape: {"repairOperations":[...]}',
          "Do not generate source code or regenerate the full IR.",
        ].join("\n"),
        mutableSuffix: repairPrompt,
        boundaryLabel: "WorkflowProgramIR repair cache checkpoint",
      });
      input.input.emitProgress({
        phase: "validated",
        status: "running",
        message: "Repairing workflow program IR with typed repair operations.",
        current: 4,
        metrics: {
          compilerMode: "program_ir",
          repairAttempt: repairAttempt,
          repairDiagnosticCount: error.diagnostics.length,
          repairPromptChars: repairParts.prompt.length,
          ...workflowProgramCompileFailureMetrics(error, repairHistory.length),
        },
      });
      let repairResult: Awaited<ReturnType<typeof requestWorkflowProgramIrRepairPatch>>;
      try {
        repairResult = await requestWorkflowProgramIrRepairPatch({
          repairProgramIr,
          program,
          prompt: repairParts.prompt,
          model: input.input.model,
          cacheCheckpoint: repairParts.cacheCheckpoint,
          repairAttempt,
          emitProgress: input.input.emitProgress,
        });
      } catch (repairError) {
        const failureArtifactPaths = await writeWorkflowProgramIrFailureArtifact({
          program,
          originalProgram: input.program,
          diagnostics: error.diagnostics,
          failureReport: error.failureReport,
          repairHistory,
          attempt: repairAttempt,
          artifactDirs: workflowProgramIrFailureArtifactDirs(input.input),
          context: {
            ...workflowProgramIrFailureArtifactContext(input.input),
            repairFailure: workflowProgramIrRepairFailureArtifactContext(repairError),
          },
        });
        input.input.emitProgress({
          phase: "validated",
          status: "failed",
          message: "WorkflowProgramIR repair failed deterministic validation; retained diagnostics.",
          current: 4,
          error: repairError instanceof Error ? repairError.message : String(repairError),
          metrics: {
            ...workflowProgramCompileFailureMetrics(error, repairHistory.length, failureArtifactPaths[0]),
            repairAttempt,
            ...workflowProgramIrRepairFailureMetrics(repairError),
          },
        });
        throw repairError;
      }
      const { rawPatch, patch, repairedProgram, validationRetriesUsed } = repairResult;
      program = repairedProgram;
      repairHistory.push({ attempt: repairAttempt, diagnostics: error.diagnostics, patch, rawPatch });
      input.input.emitProgress({
        phase: "validated",
        status: "running",
        message: "Applied workflow program IR repair operations.",
        current: 4,
        metrics: {
          compilerMode: "program_ir",
          repairAttempt: repairAttempt,
          patchOperationCount: patch.length,
          ...(validationRetriesUsed ? { repairPatchValidationRetriesUsed: validationRetriesUsed } : {}),
        },
      });
    }
  }
}

export function validateCompiledWorkflowProgramRecipeContracts(
  compiled: WorkflowProgramCompileResult,
  selectedRecipes: WorkflowCompilerSelectedRecipe[],
): WorkflowProgramDiagnostic[] {
  const selectedRecipeIds = new Set(selectedRecipes.map((recipe) => recipe.id));
  const manifestTools = new Set(compiled.output.manifest.tools ?? []);
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  if (selectedRecipeIds.has("browser_item_recovery") && ![...manifestTools].some((tool) => tool.startsWith("browser_"))) {
    diagnostics.push({
      code: "recipe.browser_item_recovery_tool_required",
      severity: "error",
      path: "/manifest/tools",
      validatorId: "workflow.program.static",
      message:
        "The browser_item_recovery recipe was selected for a browser/source workflow, but the compiled manifest grants no browser tool. Add browser.intervention or tool nodes using a selected browser read capability such as browser_nav or browser_content, preserve source evidence, then route the result into checkpoints and final output.",
      repairHint:
        "Use the selected browser_nav/browser_content/browser_search capability in WorkflowProgramIR. Do not satisfy browser source evidence with a model-only workflow.",
    });
  }
  return diagnostics;
}

async function writeWorkflowProgramIrFailureArtifact(input: {
  program: unknown;
  originalProgram?: unknown;
  diagnostics: WorkflowProgramDiagnostic[];
  failureReport: WorkflowProgramCompileError["failureReport"];
  repairHistory: WorkflowProgramIrRepairHistoryEntry[];
  attempt: number;
  artifactDirs?: string[];
  context?: Record<string, unknown>;
}): Promise<string[]> {
  const outputDirs = uniqueStrings([
    ...(input.artifactDirs ?? []).filter(Boolean),
    process.env.AMBIENT_WORKFLOW_PROGRAM_IR_FAILURE_ARTIFACT_DIR?.trim() ?? "",
  ]);
  if (!outputDirs.length) return [];
  const safeAttempt = Math.max(0, Math.floor(input.attempt));
  const generatedAt = new Date().toISOString();
  const basename = `workflow-program-ir-failure-${generatedAt.replace(/[:.]/g, "-")}-attempt-${safeAttempt}-${randomUUID().slice(0, 8)}.json`;
  const body = `${JSON.stringify(
    {
      generatedAt,
      attempt: safeAttempt,
      context: input.context ?? {},
      diagnostics: input.diagnostics,
      failureReport: input.failureReport,
      originalProgram: input.originalProgram,
      program: input.program,
      repairHistory: input.repairHistory,
    },
    null,
    2,
  )}\n`;
  const artifactPaths: string[] = [];
  for (const outputDir of outputDirs) {
    await mkdir(outputDir, { recursive: true });
    const artifactPath = join(outputDir, basename);
    await writeFile(artifactPath, body, "utf8");
    artifactPaths.push(artifactPath);
  }
  return artifactPaths;
}

function workflowProgramIrFailureArtifactDirs(input: WorkflowProgramIrCompilerInput): string[] {
  const workflowThreadId = input.input.workflowThreadId ?? input.input.revisionId ?? input.input.userRequest;
  return [join(input.input.stateRoot, "workflow-compile-failures", slugForWorkflowCompilerTitle(workflowThreadId))];
}

function workflowProgramIrFailureArtifactContext(input: WorkflowProgramIrCompilerInput): Record<string, unknown> {
  return {
    workflowThreadId: input.input.workflowThreadId,
    revisionId: input.input.revisionId,
    selectedRecipeIds: input.selectedRecipes.map((recipe) => recipe.id),
    rejectedRecipeIds: input.recipeSelection.rejected.map((recipe) => recipe.id),
    selectedToolNames: input.compileToolDescriptors.map((descriptor) => descriptor.name),
    selectedConnectorIds: input.compileConnectorDescriptors.map((descriptor) => descriptor.id),
    selectedConnectorOperationCount: input.connectorSelection.selectedOperationCount,
    selectedAmbientCliCapabilityIds: input.ambientCliCapabilities.map((capability) => capability.capabilityId),
    availableToolCount: input.capabilitySelection.availableToolCount,
    selectedToolCount: input.capabilitySelection.selectedToolNames.length,
    availableConnectorCount: input.connectorSelection.availableConnectorCount,
    selectedConnectorCount: input.connectorSelection.selectedConnectorIds.length,
  };
}

export function workflowProgramToolDescriptorsForProgram(input: {
  selectedToolDescriptors: DesktopToolDescriptor[];
  availableToolDescriptors: DesktopToolDescriptor[];
  program: unknown;
}): DesktopToolDescriptor[] {
  const selectedByName = new Map(input.selectedToolDescriptors.map((descriptor) => [descriptor.name, descriptor]));
  const availableByName = new Map(input.availableToolDescriptors.map((descriptor) => [descriptor.name, descriptor]));
  for (const toolName of workflowProgramReferencedToolNames(input.program)) {
    if (selectedByName.has(toolName)) continue;
    const descriptor = availableByName.get(toolName);
    if (descriptor) selectedByName.set(toolName, descriptor);
  }
  return [...selectedByName.values()];
}

function workflowProgramReferencedToolNames(program: unknown): Set<string> {
  const names = new Set<string>();
  if (!program || typeof program !== "object" || Array.isArray(program)) return names;
  const nodes = (program as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return names;
  for (const node of nodes) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;
    if (
      typeof record.tool === "string" &&
      (record.kind === "tool.call" || record.kind === "mutation.stage" || record.kind === "browser.intervention")
    ) {
      names.add(record.tool);
    }
    if (record.kind === "browser.intervention" && browserInterventionScreenshotEnabled(record.screenshot)) {
      names.add("browser_screenshot");
    }
  }
  return names;
}

function browserInterventionScreenshotEnabled(screenshot: unknown): boolean {
  if (!screenshot || typeof screenshot !== "object" || Array.isArray(screenshot)) return false;
  return (screenshot as { enabled?: unknown }).enabled !== false;
}

async function requestWorkflowProgramIrRepairPatch(input: {
  repairProgramIr: NonNullable<WorkflowProgramIrRepairProvider["repairProgramIr"]>;
  program: unknown;
  prompt: string;
  model: string;
  cacheCheckpoint: WorkflowPromptCacheCheckpoint;
  repairAttempt: number;
  emitProgress: (progress: Omit<WorkflowCompileProgress, "compileId" | "createdAt" | "total">) => void;
}): Promise<{ rawPatch: unknown; patch: WorkflowProgramIrPatchOperation[]; repairedProgram: unknown; validationRetriesUsed: number }> {
  const maxValidationRetries = positiveEnvNumber(
    "AMBIENT_WORKFLOW_PROGRAM_IR_REPAIR_RESPONSE_RETRY_LIMIT",
    DEFAULT_WORKFLOW_PROGRAM_IR_REPAIR_RESPONSE_RETRY_LIMIT,
  );
  let prompt = input.prompt;
  for (let validationAttempt = 0; ; validationAttempt += 1) {
    const rawPatch = await input.repairProgramIr({
      prompt,
      model: input.model,
      cacheCheckpoint: input.cacheCheckpoint,
      attempt: input.repairAttempt,
      onProgress: workflowCompilerModelProgress(input.emitProgress, {
        runningMessage: "Repairing workflow program IR with typed repair operations.",
        streamingMessage: "Receiving workflow program IR repair operations.",
        thinkingMessage: "Pi is repairing the workflow program IR.",
      }),
    });
    try {
      const patch = parseWorkflowProgramIrRepairResponse(rawPatch, input.program);
      return {
        rawPatch,
        patch,
        repairedProgram: applyWorkflowProgramIrPatch(input.program, patch),
        validationRetriesUsed: validationAttempt,
      };
    } catch (error) {
      const validationFailure = classifyWorkflowProgramIrRepairValidationError(error);
      if (!validationFailure.retryable || validationAttempt >= maxValidationRetries) {
        input.emitProgress({
          phase: "validated",
          status: "running",
          message: "WorkflowProgramIR repair response failed deterministic validation; failing closed.",
          current: 4,
          error: validationFailure.message,
          metrics: {
            compilerMode: "program_ir",
            repairAttempt: input.repairAttempt,
            repairPatchValidationRetry: validationAttempt + 1,
            repairFailureClass: validationFailure.failureClass,
            repairRetryable: validationFailure.retryable,
            repairAlternatives: compactMetricString(validationFailure.alternatives.join(" ")),
          },
        });
        throw new WorkflowProgramIrRepairRejectedError({
          failure: validationFailure,
          rawPatch,
          validationRetriesUsed: validationAttempt,
        });
      }
      input.emitProgress({
        phase: "validated",
        status: "running",
        message: "WorkflowProgramIR repair response failed deterministic validation; retrying.",
        current: 4,
        error: validationFailure.message,
        metrics: {
          compilerMode: "program_ir",
          repairAttempt: input.repairAttempt,
          repairPatchValidationRetry: validationAttempt + 1,
          repairFailureClass: validationFailure.failureClass,
          repairRetryable: validationFailure.retryable,
        },
      });
      prompt = workflowProgramIrRepairResponseRetryPrompt(input.prompt, validationFailure.message);
    }
  }
}

function workflowProgramIrRepairResponseRetryPrompt(originalPrompt: string, validationError: string): string {
  return `${originalPrompt}

WorkflowProgramIR repair response validation error:
${validationError}

The previous repair operation set was applied to the exact Current WorkflowProgramIR above and failed deterministic validation.
Return at most 20 repair operations. Prefer the smallest patch that addresses the reported diagnostics.
Use only JSON Pointer paths that exist for replace_with_alternative. For add_semantic_slot, target a clear semantic owner field.
To remove an invalid optional node, use remove_optional_node with nodeId or a path like /nodes/3; do not invent nested paths under that node.
If the diagnostic is ir.redundant_stage_approval, remove the approval.required node, update downstream dependsOn arrays away from that approval node, and route final output references to the mutation.stage path/bytes or document.render artifactPath/path/content.

Return only one JSON object in this exact shape:
{"repairOperations":[{"kind":"replace_with_alternative|add_semantic_slot|remove_optional_node|ask_user_for_missing_choice","path":"/json/pointer","value":null}]}

Do not use /- with replace_with_alternative or remove_optional_node.
Do not return a full WorkflowProgramIR document. Do not include markdown, explanation, source code, or prose.`;
}

function workflowProgramCompileFailureMessage(error: WorkflowProgramCompileError): string {
  const phase = error.failureReport?.phase;
  if (phase === "parse") return "Workflow program IR failed schema parsing.";
  if (phase === "static_validation") return "Workflow program IR failed static validation.";
  if (phase === "codegen") return "Workflow program IR failed deterministic code generation.";
  if (phase === "output_validation") return "Workflow program IR artifact failed output validation.";
  if (phase === "dry_run") return "Workflow program IR generated program failed sandbox dry-run.";
  return "Workflow program IR failed compilation.";
}

function workflowProgramCompileFailureMetrics(
  error: WorkflowProgramCompileError,
  repairAttemptCount: number,
  failureArtifactPath?: string,
): Record<string, string | number | boolean> {
  const firstDiagnostic = error.diagnostics[0];
  const report = error.failureReport;
  return {
    compilerMode: "program_ir",
    ...(report
      ? {
          compilerFailurePhase: report.phase,
          compilerTotalMs: report.totalMs,
          parseAndNormalizeMs: report.parseAndNormalizeMs,
          staticValidationMs: report.staticValidationMs,
          loweringMs: report.loweringMs,
          codegenMs: report.codegenMs,
          outputValidationMs: report.outputValidationMs,
          dryRunMs: report.dryRunMs,
          compilerDiagnosticCount: report.diagnosticCount,
          ...(report.firstDiagnosticCode ? { failureDiagnosticCode: report.firstDiagnosticCode } : {}),
          ...(report.firstDiagnosticPath ? { failureDiagnosticPath: report.firstDiagnosticPath } : {}),
          ...(report.firstDiagnosticNodeId ? { failureNodeId: report.firstDiagnosticNodeId } : {}),
          ...(report.firstDiagnosticMessage ? { failureDiagnosticMessage: compactMetricString(report.firstDiagnosticMessage) } : {}),
          ...(report.firstDiagnosticValidatorId ? { failureValidatorId: report.firstDiagnosticValidatorId } : {}),
          ...(report.firstDiagnosticRepairHint ? { failureRepairHint: compactMetricString(report.firstDiagnosticRepairHint) } : {}),
          ...(report.firstDiagnosticSourceNodeId ? { failureSourceNodeId: report.firstDiagnosticSourceNodeId } : {}),
          ...(report.firstDiagnosticInvalidOutputPath ? { failureInvalidOutputPath: report.firstDiagnosticInvalidOutputPath } : {}),
          ...(report.firstDiagnosticValidAlternatives
            ? { failureValidAlternatives: compactMetricString(report.firstDiagnosticValidAlternatives) }
            : {}),
          ...(report.firstDiagnosticProducerOutputContract
            ? { failureProducerOutputContract: compactMetricString(report.firstDiagnosticProducerOutputContract) }
            : {}),
        }
      : {
          compilerDiagnosticCount: error.diagnostics.length,
          ...(firstDiagnostic?.code ? { failureDiagnosticCode: firstDiagnostic.code } : {}),
          ...(firstDiagnostic?.path ? { failureDiagnosticPath: firstDiagnostic.path } : {}),
          ...(firstDiagnostic?.nodeId ? { failureNodeId: firstDiagnostic.nodeId } : {}),
          ...(firstDiagnostic?.message ? { failureDiagnosticMessage: compactMetricString(firstDiagnostic.message) } : {}),
        }),
    repairAttemptCount,
    ...(failureArtifactPath ? { failureArtifactPath } : {}),
  };
}

function workflowProgramIrRepairFailureArtifactContext(error: unknown): Record<string, unknown> {
  if (error instanceof WorkflowProgramIrRepairRejectedError) {
    return {
      failureClass: error.failure.failureClass,
      message: error.failure.message,
      retryable: error.failure.retryable,
      alternatives: error.failure.alternatives,
      validationRetriesUsed: error.validationRetriesUsed,
      rawPatch: error.rawPatch,
    };
  }
  return {
    failureClass: "provider_error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function workflowProgramIrRepairFailureMetrics(error: unknown): Record<string, string | number | boolean> {
  if (error instanceof WorkflowProgramIrRepairRejectedError) {
    return {
      repairFailureClass: error.failure.failureClass,
      repairRetryable: error.failure.retryable,
      repairPatchValidationRetriesUsed: error.validationRetriesUsed,
      repairAlternatives: compactMetricString(error.failure.alternatives.join(" ")),
    };
  }
  return {
    repairFailureClass: "provider_error",
  };
}

function compactMetricString(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function workflowCompilerModelProgress(
  emitProgress: (progress: Omit<WorkflowCompileProgress, "compileId" | "createdAt" | "total">) => void,
  input: {
    runningMessage: string;
    streamingMessage: string;
    thinkingMessage: string;
    validationRetriesUsed?: number;
    extraMetrics?: Record<string, string | number | boolean>;
  },
): (progress: WorkflowPiProgress) => void {
  return ({ outputChars, thinkingChars = 0, elapsedMs, idleElapsedMs, idleTimeoutMs, absoluteTimeoutMs, timeoutMode, stage }) =>
    emitProgress({
      phase: "model",
      status: "running",
      message: outputChars > 0 ? input.streamingMessage : thinkingChars > 0 ? input.thinkingMessage : input.runningMessage,
      current: 3,
      metrics: {
        rawResponseChars: outputChars,
        thinkingChars,
        ...(input.validationRetriesUsed ? { validationRetriesUsed: input.validationRetriesUsed } : {}),
        ...(elapsedMs !== undefined ? { providerElapsedMs: elapsedMs } : {}),
        ...(idleElapsedMs !== undefined ? { idleElapsedMs } : {}),
        ...(idleTimeoutMs !== undefined ? { idleTimeoutMs } : {}),
        ...(absoluteTimeoutMs !== undefined ? { absoluteTimeoutMs } : {}),
        ...(timeoutMode ? { timeoutMode } : {}),
        ...(stage ? { providerStage: stage } : {}),
        ...(input.extraMetrics ?? {}),
      },
    });
}

function positiveEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}
