import type { DesktopToolDescriptor } from "./workflowProgramDesktopToolFacade";
import { validateWorkflowCompilerOutput, type WorkflowCompilerOutput } from "../workflow-compiler/workflowCompiler";
import type { WorkflowProgramIR, WorkflowProgramNode } from "../../shared/workflowProgramIr";
import type { WorkflowGraphEdge, WorkflowGraphNode, WorkflowSpec } from "../../shared/workflowTypes";
import {
  connectorOperationDescriptor,
  resolveWorkflowProgramManifest,
  type WorkflowProgramAmbientCliCapability,
  type WorkflowProgramDiagnostic,
} from "./workflowProgramCapabilityResolver";
import {
  emptyWorkflowProgramIncrementalValidationMetrics,
  validateWorkflowProgramStatic,
  type WorkflowProgramIncrementalValidationMetrics,
  type WorkflowProgramNodeValidationCacheEntry,
} from "./workflowProgramTypecheck";
import { lowerWorkflowProgramHandleReferences } from "./workflowProgramPathRegistry";
import {
  emptyWorkflowProgramLoweringMetrics,
  lowerWorkflowProgram,
  type WorkflowProgramLoweredOperation,
  type WorkflowProgramLoweredOperationCacheEntry,
  type WorkflowProgramLoweredOperationKind,
  type WorkflowProgramLoweredOperationPlan,
  type WorkflowProgramLoweringMetrics,
} from "./workflowProgramLowering";
import { generateWorkflowProgramSource } from "./workflowProgramCodegen";
import { dryRunWorkflowProgramOutput, WorkflowProgramDryRunError, type WorkflowProgramDryRunResult } from "./workflowProgramDryRun";
import { parseWorkflowProgramIr } from "./workflowProgramIr";
import { workflowProgramKnownOutputFields } from "./workflowProgramOutputContracts";
import type { WorkflowConnectorDescriptor } from "./workflowProgramWorkflowFacade";
export type { WorkflowProgramAmbientCliCapability, WorkflowProgramDiagnostic } from "./workflowProgramCapabilityResolver";
export type { WorkflowProgramIncrementalValidationMetrics } from "./workflowProgramTypecheck";
export type { WorkflowProgramDryRunCall } from "./workflowProgramDryRun";
export type {
  WorkflowProgramLoweredOperation,
  WorkflowProgramLoweredOperationKind,
  WorkflowProgramLoweredOperationPlan,
  WorkflowProgramLoweringMetrics,
} from "./workflowProgramLowering";


export type WorkflowProgramCompileFailurePhase = "parse" | "static_validation" | "codegen" | "output_validation" | "dry_run";

export interface WorkflowProgramCompileFailureDiagnosticSummary {
  code: string;
  path: string;
  message: string;
  nodeId?: string;
  validatorId?: WorkflowProgramValidatorId;
  repairHint?: string;
  sourceNodeId?: string;
  invalidOutputPath?: string;
  validAlternatives?: string;
  producerOutputContract?: string;
}

export interface WorkflowProgramCompileFailureReport {
  phase: WorkflowProgramCompileFailurePhase;
  totalMs: number;
  parseAndNormalizeMs: number;
  staticValidationMs: number;
  loweringMs: number;
  codegenMs: number;
  outputValidationMs: number;
  dryRunMs: number;
  diagnosticCount: number;
  firstDiagnosticCode?: string;
  firstDiagnosticPath?: string;
  firstDiagnosticNodeId?: string;
  firstDiagnosticMessage?: string;
  firstDiagnosticValidatorId?: WorkflowProgramValidatorId;
  firstDiagnosticRepairHint?: string;
  firstDiagnosticSourceNodeId?: string;
  firstDiagnosticInvalidOutputPath?: string;
  firstDiagnosticValidAlternatives?: string;
  firstDiagnosticProducerOutputContract?: string;
  diagnostics: WorkflowProgramCompileFailureDiagnosticSummary[];
}

export class WorkflowProgramCompileError extends Error {
  constructor(
    readonly diagnostics: WorkflowProgramDiagnostic[],
    readonly failureReport?: WorkflowProgramCompileFailureReport,
  ) {
    super(diagnostics.map(formatWorkflowProgramDiagnostic).join("\n"));
    this.name = "WorkflowProgramCompileError";
  }
}

function formatWorkflowProgramDiagnostic(diagnostic: WorkflowProgramDiagnostic): string {
  const location = [diagnostic.nodeId ? `node ${diagnostic.nodeId}` : undefined, diagnostic.path].filter(Boolean).join(" at ");
  return `${diagnostic.code}${location ? ` (${location})` : ""}: ${diagnostic.message}`;
}

export interface WorkflowProgramCompileMetrics {
  totalMs: number;
  parseAndNormalizeMs: number;
  staticValidationMs: number;
  loweringMs: number;
  codegenMs: number;
  outputValidationMs: number;
  dryRunMs: number;
  diagnosticCount: number;
  incrementalValidation: WorkflowProgramIncrementalValidationMetrics;
  lowering: WorkflowProgramLoweringMetrics;
}

export type WorkflowProgramValidatorId =
  | "workflow.program.parse"
  | "workflow.program.static"
  | "workflow.program.static_budget"
  | "workflow.connector.operation_policy"
  | "workflow.google.read_only_policy"
  | "workflow.staged_mutation_policy"
  | "workflow.large_output_preprocessor"
  | "workflow.browser_intervention_policy"
  | "workflow.program.lowering"
  | "workflow.program.codegen"
  | "workflow.output.schema"
  | "workflow.program.dry_run"
  | "workflow.manifest.connector_policy";

export interface WorkflowProgramValidationReportValidator {
  id: WorkflowProgramValidatorId;
  status: "passed" | "failed";
  diagnosticCodes: string[];
  nodeIds: string[];
}

export interface WorkflowProgramValidationReportConnectorOperation {
  connectorId: string;
  operation: string;
  nodeId: string;
  nodeKind: WorkflowProgramNode["kind"];
  sideEffects: "unknown" | "none" | "read_personal_data" | "write_external";
  mutationPolicy?: "unsupported" | "staged_until_approved" | "apply_after_approval";
  requiredScopes: string[];
}

export interface WorkflowProgramValidationReport {
  schemaVersion: 1;
  compilerMode: "program_ir";
  status: "passed" | "failed";
  validators: WorkflowProgramValidationReportValidator[];
  diagnostics: WorkflowProgramDiagnostic[];
  diagnosticSummary: {
    diagnosticCount: number;
    errorCount: number;
    warningCount: number;
    codes: Record<string, number>;
  };
  metrics: WorkflowProgramCompileMetrics;
  evidence: {
    nodeCount: number;
    loweredOperationCount: number;
    dryRunCallCount: number;
    dryRunCallCounts: Record<string, number>;
    connectorCallCounts: Record<string, number>;
    mutationPolicy?: string;
    maxToolCalls?: number;
    maxConnectorCalls?: number;
    maxModelCalls?: number;
    connectorOperations: WorkflowProgramValidationReportConnectorOperation[];
    connectorWriteOperations: WorkflowProgramValidationReportConnectorOperation[];
  };
}

export interface WorkflowProgramCompileResult {
  program: WorkflowProgramIR;
  loweredPlan: WorkflowProgramLoweredOperationPlan;
  output: WorkflowCompilerOutput;
  dryRun: WorkflowProgramDryRunResult;
  diagnostics: WorkflowProgramDiagnostic[];
  metrics: WorkflowProgramCompileMetrics;
  validationReport: WorkflowProgramValidationReport;
}

export interface CompileWorkflowProgramIrInput {
  program: unknown;
  toolDescriptors: DesktopToolDescriptor[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  ambientCliCapabilities?: WorkflowProgramAmbientCliCapability[];
  validateGoogleReadOnly?: boolean;
  incrementalCache?: WorkflowProgramCompileCache;
}

export interface WorkflowProgramCompileCache {
  nodeValidations: Map<string, WorkflowProgramNodeValidationCacheEntry>;
  loweredOperations: Map<string, WorkflowProgramLoweredOperationCacheEntry>;
}

export function createWorkflowProgramCompileCache(): WorkflowProgramCompileCache {
  return { nodeValidations: new Map(), loweredOperations: new Map() };
}

export async function compileWorkflowProgramIr(input: CompileWorkflowProgramIrInput): Promise<WorkflowProgramCompileResult> {
  const startedAtMs = nowMs();
  const diagnostics: WorkflowProgramDiagnostic[] = [];
  const parseStartedAtMs = nowMs();
  const parsed = parseWorkflowProgramIr(input.program);
  let parseAndNormalizeMs = elapsedMs(parseStartedAtMs);
  let staticValidationMs = 0;
  let loweringMs = 0;
  let codegenMs = 0;
  let outputValidationMs = 0;
  let dryRunMs = 0;
  let incrementalValidationMetrics = emptyWorkflowProgramIncrementalValidationMetrics();
  let loweringMetrics = emptyWorkflowProgramLoweringMetrics();
  if (!parsed.success) {
    throw new WorkflowProgramCompileError(
      parsed.diagnostics,
      workflowProgramFailureReport("parse", parsed.diagnostics, {
        startedAtMs,
        parseAndNormalizeMs,
        staticValidationMs,
        loweringMs,
        codegenMs,
        outputValidationMs,
        dryRunMs,
      }),
    );
  }

  const defaultedProgram = applyDefaultToolPagination(
    applyDefaultConnectorPagination(applyDefaultConnectorAccounts(parsed.program, input.connectorDescriptors ?? []), input.connectorDescriptors ?? []),
    input.toolDescriptors,
  );
  const handleLowering = lowerWorkflowProgramHandleReferences({
    program: defaultedProgram,
    toolDescriptors: input.toolDescriptors,
    connectorDescriptors: input.connectorDescriptors ?? [],
  });
  diagnostics.push(...annotateWorkflowProgramDiagnostics(handleLowering.diagnostics));
  throwIfErrors(
    diagnostics,
    "static_validation",
    {
      startedAtMs,
      parseAndNormalizeMs,
      staticValidationMs,
      loweringMs,
      codegenMs,
      outputValidationMs,
      dryRunMs,
    },
    {
      program: defaultedProgram,
      toolDescriptors: input.toolDescriptors,
      connectorDescriptors: input.connectorDescriptors ?? [],
    },
  );
  const program = applyImplicitReferenceDependencies(handleLowering.program);
  parseAndNormalizeMs = elapsedMs(parseStartedAtMs);
  const validationStartedAtMs = nowMs();
  const staticValidation = await validateWorkflowProgramStatic({
    program,
    toolDescriptors: input.toolDescriptors,
    connectorDescriptors: input.connectorDescriptors ?? [],
    ambientCliCapabilities: input.ambientCliCapabilities ?? [],
    validateGoogleReadOnly: input.validateGoogleReadOnly !== false,
    nodeValidationCache: input.incrementalCache?.nodeValidations,
  });
  diagnostics.push(...annotateWorkflowProgramDiagnostics(staticValidation.diagnostics));
  incrementalValidationMetrics = staticValidation.metrics;
  staticValidationMs = elapsedMs(validationStartedAtMs);
  throwIfErrors(
    diagnostics,
    "static_validation",
    {
      startedAtMs,
      parseAndNormalizeMs,
      staticValidationMs,
      loweringMs,
      codegenMs,
      outputValidationMs,
      dryRunMs,
    },
    {
      program,
      toolDescriptors: input.toolDescriptors,
      connectorDescriptors: input.connectorDescriptors ?? [],
    },
  );

  const loweringStartedAtMs = nowMs();
  let loweredPlan: WorkflowProgramLoweredOperationPlan;
  try {
    const lowered = lowerWorkflowProgram({ program, loweredOperationCache: input.incrementalCache?.loweredOperations });
    loweredPlan = lowered.plan;
    loweringMetrics = lowered.metrics;
    loweringMs = elapsedMs(loweringStartedAtMs);
  } catch (error) {
    loweringMs = elapsedMs(loweringStartedAtMs);
    const loweringDiagnostics = [errorDiagnostic("codegen.lowering_failed", error instanceof Error ? error.message : String(error), "/lowered-plan")];
    throw new WorkflowProgramCompileError(
      annotateWorkflowProgramDiagnostics(loweringDiagnostics),
      workflowProgramFailureReport("codegen", loweringDiagnostics, {
        startedAtMs,
        parseAndNormalizeMs,
        staticValidationMs,
        loweringMs,
        codegenMs,
        outputValidationMs,
        dryRunMs,
      }),
    );
  }

  const codegenStartedAtMs = nowMs();
  let output: WorkflowCompilerOutput;
  try {
    output = workflowCompilerOutputFromProgram(program, loweredPlan, input.toolDescriptors, input.connectorDescriptors ?? [], input.ambientCliCapabilities ?? []);
    codegenMs = elapsedMs(codegenStartedAtMs);
  } catch (error) {
    codegenMs = elapsedMs(codegenStartedAtMs);
    const codegenDiagnostics = [errorDiagnostic("codegen.failed", error instanceof Error ? error.message : String(error), "/source")];
    throw new WorkflowProgramCompileError(
      annotateWorkflowProgramDiagnostics(codegenDiagnostics),
      workflowProgramFailureReport("codegen", codegenDiagnostics, {
        startedAtMs,
        parseAndNormalizeMs,
        staticValidationMs,
        loweringMs,
        codegenMs,
        outputValidationMs,
        dryRunMs,
      }),
    );
  }
  const outputValidationStartedAtMs = nowMs();
  try {
    validateWorkflowCompilerOutput(output, input.toolDescriptors, input.connectorDescriptors ?? []);
    outputValidationMs = elapsedMs(outputValidationStartedAtMs);
  } catch (error) {
    outputValidationMs = elapsedMs(outputValidationStartedAtMs);
    const outputDiagnostics =
      error instanceof WorkflowProgramCompileError
        ? error.diagnostics
        : [errorDiagnostic("output_validation.failed", error instanceof Error ? error.message : String(error), "/output")];
    throw new WorkflowProgramCompileError(
      annotateWorkflowProgramDiagnostics(outputDiagnostics),
      workflowProgramFailureReport("output_validation", outputDiagnostics, {
        startedAtMs,
        parseAndNormalizeMs,
        staticValidationMs,
        loweringMs,
        codegenMs,
        outputValidationMs,
        dryRunMs,
      }),
    );
  }
  const dryRunStartedAtMs = nowMs();
  let dryRun: WorkflowProgramCompileResult["dryRun"];
  try {
    dryRun = await dryRunWorkflowProgramOutput(output, loweredPlan, input.toolDescriptors, input.connectorDescriptors ?? []);
    dryRunMs = elapsedMs(dryRunStartedAtMs);
  } catch (error) {
    dryRunMs = elapsedMs(dryRunStartedAtMs);
    const dryRunDiagnostics =
      error instanceof WorkflowProgramDryRunError
        ? error.diagnostics
        : [errorDiagnostic("dry_run.runtime_error", error instanceof Error ? error.message : String(error), "/source")];
    throw new WorkflowProgramCompileError(
      annotateWorkflowProgramDiagnostics(dryRunDiagnostics),
      workflowProgramFailureReport("dry_run", dryRunDiagnostics, {
        startedAtMs,
        parseAndNormalizeMs,
        staticValidationMs,
        loweringMs,
        codegenMs,
        outputValidationMs,
        dryRunMs,
      }),
    );
  }
  const metrics: WorkflowProgramCompileMetrics = {
    totalMs: elapsedMs(startedAtMs),
    parseAndNormalizeMs,
    staticValidationMs,
    loweringMs,
    codegenMs,
    outputValidationMs,
    dryRunMs,
    diagnosticCount: diagnostics.length,
    incrementalValidation: incrementalValidationMetrics,
    lowering: loweringMetrics,
  };
  const validationReport = buildWorkflowProgramValidationReport({
    program,
    loweredPlan,
    output,
    dryRun,
    diagnostics,
    metrics,
    connectorDescriptors: input.connectorDescriptors ?? [],
  });
  return {
    program,
    loweredPlan,
    output,
    dryRun,
    diagnostics,
    metrics,
    validationReport,
  };
}

export function buildWorkflowProgramValidationReport(input: {
  program: WorkflowProgramIR;
  loweredPlan: WorkflowProgramLoweredOperationPlan;
  output: WorkflowCompilerOutput;
  dryRun: WorkflowProgramDryRunResult;
  diagnostics: WorkflowProgramDiagnostic[];
  metrics: WorkflowProgramCompileMetrics;
  connectorDescriptors: WorkflowConnectorDescriptor[];
}): WorkflowProgramValidationReport {
  const diagnostics = annotateWorkflowProgramDiagnostics(input.diagnostics);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  const connectorOperations = workflowProgramConnectorOperationEvidence(input.program, input.connectorDescriptors);
  const connectorWriteOperations = connectorOperations.filter((operation) => operation.sideEffects === "write_external");
  return {
    schemaVersion: 1,
    compilerMode: "program_ir",
    status: errors.length > 0 ? "failed" : "passed",
    validators: workflowProgramValidationReportValidators(diagnostics),
    diagnostics,
    diagnosticSummary: {
      diagnosticCount: diagnostics.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      codes: countBy(diagnostics.map((diagnostic) => diagnostic.code)),
    },
    metrics: input.metrics,
    evidence: {
      nodeCount: input.program.nodes.length,
      loweredOperationCount: input.loweredPlan.operations.length,
      dryRunCallCount: input.dryRun.calls.length,
      dryRunCallCounts: countBy(input.dryRun.calls.map((call) => call.kind)),
      connectorCallCounts: countBy(input.dryRun.calls.filter((call) => call.kind === "connector").map((call) => call.name)),
      mutationPolicy: input.output.manifest.mutationPolicy,
      maxToolCalls: input.output.manifest.maxToolCalls,
      maxConnectorCalls: input.output.manifest.maxConnectorCalls,
      maxModelCalls: input.output.manifest.maxModelCalls,
      connectorOperations,
      connectorWriteOperations,
    },
  };
}

function annotateWorkflowProgramDiagnostics(diagnostics: WorkflowProgramDiagnostic[]): WorkflowProgramDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    const validatorId = workflowProgramDiagnosticValidatorId(diagnostic);
    const repairHint = diagnostic.repairHint ?? workflowProgramRepairHintForDiagnosticCode(diagnostic.code);
    return {
      ...diagnostic,
      ...(validatorId ? { validatorId } : {}),
      ...(repairHint ? { repairHint } : {}),
    };
  });
}

function workflowProgramValidationReportValidators(diagnostics: WorkflowProgramDiagnostic[]): WorkflowProgramValidationReportValidator[] {
  const diagnosticByValidator = new Map<WorkflowProgramValidatorId, WorkflowProgramDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const validatorId = workflowProgramDiagnosticValidatorId(diagnostic);
    if (!validatorId) continue;
    const existing = diagnosticByValidator.get(validatorId) ?? [];
    existing.push(diagnostic);
    diagnosticByValidator.set(validatorId, existing);
  }
  const validatorIds: WorkflowProgramValidatorId[] = [
    "workflow.program.parse",
    "workflow.program.static",
    "workflow.program.static_budget",
    "workflow.connector.operation_policy",
    "workflow.google.read_only_policy",
    "workflow.staged_mutation_policy",
    "workflow.large_output_preprocessor",
    "workflow.browser_intervention_policy",
    "workflow.program.lowering",
    "workflow.program.codegen",
    "workflow.output.schema",
    "workflow.program.dry_run",
    "workflow.manifest.connector_policy",
  ];
  return validatorIds.map((id) => {
    const validatorDiagnostics = diagnosticByValidator.get(id) ?? [];
    const failed = validatorDiagnostics.some((diagnostic) => diagnostic.severity === "error");
    return {
      id,
      status: failed ? "failed" : "passed",
      diagnosticCodes: [...new Set(validatorDiagnostics.map((diagnostic) => diagnostic.code))].sort(),
      nodeIds: [...new Set(validatorDiagnostics.map((diagnostic) => diagnostic.nodeId).filter((nodeId): nodeId is string => Boolean(nodeId)))].sort(),
    };
  });
}

function workflowProgramDiagnosticValidatorId(diagnostic: WorkflowProgramDiagnostic): WorkflowProgramValidatorId | undefined {
  const validatorId = diagnostic.validatorId ?? workflowProgramValidatorIdForDiagnosticCode(diagnostic.code);
  return isWorkflowProgramValidatorId(validatorId) ? validatorId : undefined;
}

function isWorkflowProgramValidatorId(value: unknown): value is WorkflowProgramValidatorId {
  return (
    value === "workflow.program.parse" ||
    value === "workflow.program.static" ||
    value === "workflow.program.static_budget" ||
    value === "workflow.connector.operation_policy" ||
    value === "workflow.google.read_only_policy" ||
    value === "workflow.staged_mutation_policy" ||
    value === "workflow.large_output_preprocessor" ||
    value === "workflow.browser_intervention_policy" ||
    value === "workflow.program.lowering" ||
    value === "workflow.program.codegen" ||
    value === "workflow.output.schema" ||
    value === "workflow.program.dry_run" ||
    value === "workflow.manifest.connector_policy"
  );
}

function workflowProgramValidatorIdForDiagnosticCode(code: string): WorkflowProgramValidatorId | undefined {
  if (code.startsWith("budget.")) return "workflow.program.static_budget";
  if (code.startsWith("connector.")) return "workflow.connector.operation_policy";
  if (code.startsWith("google.")) return "workflow.google.read_only_policy";
  if (code === "ir.redundant_stage_approval") return "workflow.staged_mutation_policy";
  if (code === "model.long_context_preprocessor_required") return "workflow.large_output_preprocessor";
  if (code.startsWith("browser.")) return "workflow.browser_intervention_policy";
  if (code.startsWith("codegen.")) return "workflow.program.codegen";
  if (code.startsWith("output_validation.")) return "workflow.output.schema";
  if (code.startsWith("dry_run.")) return "workflow.program.dry_run";
  if (code.startsWith("manifest.") || code.includes("manifest")) return "workflow.manifest.connector_policy";
  if (code.startsWith("ir.") || code.startsWith("tool.") || code.startsWith("ambient_cli.") || code.startsWith("model.")) return "workflow.program.static";
  return undefined;
}

function workflowProgramRepairHintForDiagnosticCode(code: string): string | undefined {
  if (code === "connector.read_only_write_operation_rejected") {
    return "Replace the connector write operation with a read operation plus review.input, or remove the node from a read-only workflow.";
  }
  if (code.startsWith("budget.")) {
    return "Reduce maxItems/maxPages/maxInputItems, chunk and reduce intermediate data, or split the work into a follow-up workflow.";
  }
  if (code === "model.long_context_preprocessor_required") {
    return "Insert long_context_process before sending large raw content to a model.call, model.map, or model.reduce node.";
  }
  if (code === "tool.pagination_page_queries_required") {
    return "Add pageQueries with at least maxPages distinct query strings derived from the original request, or lower maxPages to 1 if multi-page fan-out was not required.";
  }
  if (code === "ambient_cli.capability_required") {
    return "Remove unavailable ambient_cli nodes, or replace them with a selected desktop tool/connector capability. For MiniCPM visual analysis, use ambient_visual_analyze instead of provider status/start/stop CLI nodes.";
  }
  if (code === "ambient_cli.describe_required") {
    return "Add ambient_cli_describe only for selected Ambient CLI capabilities; if the CLI command is not selected, remove the ambient_cli node or replace it with an available desktop tool.";
  }
  if (code === "ambient_cli.secret_value_rejected") {
    return "Remove literal secret values and secret-bearing CLI flags from the workflow IR. Use ambient_cli_secret_request or ambient_cli_env_bind for declared missing env requirements, then run ambient_cli only after Desktop reports the env configured.";
  }
  if (code === "ir.array_reference_path_required") {
    return 'Patch the collection input to a direct concrete array reference such as {"fromNode":"list-node","path":"records"} or {"fromNode":"list-images","path":"entries"}; if a selection/filter node is used, reference its array output path such as items. Do not omit path.';
  }
  if (code === "ir.array_reference_wrapped") {
    return 'Replace the one-element array wrapper with the direct collection reference, such as {"fromNode":"list-node","path":"records"}. Do not wrap fromNode/path references in literal arrays.';
  }
  return undefined;
}

function workflowProgramConnectorOperationEvidence(
  program: WorkflowProgramIR,
  connectorDescriptors: WorkflowConnectorDescriptor[],
): WorkflowProgramValidationReportConnectorOperation[] {
  const connectorsById = new Map(connectorDescriptors.map((connector) => [connector.id, connector]));
  return program.nodes.flatMap((node) => {
    if (node.kind !== "connector.call" && node.kind !== "connector.map" && node.kind !== "connector.paginate") return [];
    const descriptor = connectorsById.get(node.connectorId);
    const operation = descriptor ? connectorOperationDescriptor(descriptor, node.operation) : undefined;
    return [
      {
        connectorId: node.connectorId,
        operation: node.operation,
        nodeId: node.id,
        nodeKind: node.kind,
        sideEffects: operation?.sideEffects ?? "unknown",
        ...(operation?.mutationPolicy ? { mutationPolicy: operation.mutationPolicy } : {}),
        requiredScopes: operation?.requiredScopes ?? [],
      },
    ];
  });
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function applyDefaultConnectorAccounts(program: WorkflowProgramIR, connectorDescriptors: WorkflowConnectorDescriptor[]): WorkflowProgramIR {
  const defaultAccountByConnectorId = new Map(
    connectorDescriptors
      .filter((connector) => connector.accounts.length === 1)
      .map((connector) => [connector.id, connector.accounts[0]!.id]),
  );
  let changed = false;
  const nodes = program.nodes.map((node) => {
    if ((node.kind !== "connector.call" && node.kind !== "connector.map" && node.kind !== "connector.paginate") || node.accountId) return node;
    const accountId = defaultAccountByConnectorId.get(node.connectorId);
    if (!accountId) return node;
    changed = true;
    return { ...node, accountId };
  });
  return changed ? { ...program, nodes } : program;
}

function applyDefaultConnectorPagination(program: WorkflowProgramIR, connectorDescriptors: WorkflowConnectorDescriptor[]): WorkflowProgramIR {
  const connectorById = new Map(connectorDescriptors.map((connector) => [connector.id, connector]));
  let changed = false;
  const nodes = program.nodes.map((node) => {
    if (node.kind !== "connector.paginate") return node;
    const descriptor = connectorById.get(node.connectorId);
    const operation = descriptor?.operations.find((candidate) => candidate.name === node.operation);
    const pagination = operation?.pagination;
    if (!pagination) return node;
    const nextPageTokenPath = node.nextPageTokenPath ?? pagination.nextPageTokenPath ?? pagination.cursorField;
    const pageTokenInputPath = node.pageTokenInputPath ?? pagination.pageTokenInputPath ?? pagination.cursorField;
    const patch = {
      ...(node.itemsPath || !pagination.itemsPath ? {} : { itemsPath: pagination.itemsPath }),
      ...(node.nextPageTokenPath || !nextPageTokenPath ? {} : { nextPageTokenPath }),
      ...(node.pageTokenInputPath || !pageTokenInputPath ? {} : { pageTokenInputPath }),
      ...(node.pageSizeInputPath || !pagination.pageSizeInputPath ? {} : { pageSizeInputPath: pagination.pageSizeInputPath }),
      ...(node.pageSize || !pagination.defaultPageSize ? {} : { pageSize: pagination.defaultPageSize }),
    };
    if (Object.keys(patch).length === 0) return node;
    changed = true;
    return { ...node, ...patch };
  });
  return changed ? { ...program, nodes } : program;
}

function applyDefaultToolPagination(program: WorkflowProgramIR, toolDescriptors: DesktopToolDescriptor[]): WorkflowProgramIR {
  const toolByName = new Map(toolDescriptors.map((tool) => [tool.name, tool]));
  let changed = false;
  const nodes = program.nodes.map((node) => {
    if (node.kind !== "tool.paginate") return node;
    const pagination = toolByName.get(node.tool)?.pagination;
    if (!pagination) return node;
    const patch = {
      ...(node.itemsPath !== undefined || pagination.itemsPath === undefined ? {} : { itemsPath: pagination.itemsPath }),
      ...(node.nextPageTokenPath || !pagination.nextPageTokenPath ? {} : { nextPageTokenPath: pagination.nextPageTokenPath }),
      ...(node.pageTokenInputPath || !pagination.pageTokenInputPath ? {} : { pageTokenInputPath: pagination.pageTokenInputPath }),
      ...(node.pageSizeInputPath || !pagination.pageSizeInputPath ? {} : { pageSizeInputPath: pagination.pageSizeInputPath }),
      ...(node.queryInputPath || !pagination.queryInputPath ? {} : { queryInputPath: pagination.queryInputPath }),
      ...(node.pageSize || !pagination.defaultPageSize ? {} : { pageSize: pagination.defaultPageSize }),
    };
    if (Object.keys(patch).length === 0) return node;
    changed = true;
    return { ...node, ...patch };
  });
  return changed ? { ...program, nodes } : program;
}

function applyImplicitReferenceDependencies(program: WorkflowProgramIR): WorkflowProgramIR {
  const nodeIds = new Set(program.nodes.map((node) => node.id));
  let changed = false;
  const nodes = program.nodes.map((node) => {
    const existing = new Set(node.dependsOn ?? []);
    const merged = [...(node.dependsOn ?? [])];
    for (const referencedNodeId of new Set(nodeValueInputs(node).flatMap(workflowProgramReferencedNodeIds))) {
      if (referencedNodeId === node.id || !nodeIds.has(referencedNodeId) || existing.has(referencedNodeId)) continue;
      existing.add(referencedNodeId);
      merged.push(referencedNodeId);
    }
    if (merged.length === (node.dependsOn ?? []).length) return node;
    changed = true;
    return { ...node, dependsOn: merged };
  });
  return changed ? { ...program, nodes } : program;
}

function workflowProgramReferencedNodeIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(workflowProgramReferencedNodeIds);
  if (isProgramRef(value)) return [value.fromNode];
  return Object.values(value as Record<string, unknown>).flatMap(workflowProgramReferencedNodeIds);
}

function nodeValueInputs(node: WorkflowProgramNode): unknown[] {
  if (node.kind === "tool.call") return [node.args];
  if (node.kind === "tool.paginate") return [node.input, node.pageQueries];
  if (node.kind === "browser.intervention") return [node.args, node.source, node.skipIf, node.prompt, node.screenshot?.args];
  if (node.kind === "connector.call") return [node.input];
  if (node.kind === "connector.paginate") return [node.input];
  if (node.kind === "connector.map") return [node.items, node.input];
  if (node.kind === "collection.map") return [node.items, node.map];
  if (node.kind === "collection.dedupe") return [node.items];
  if (node.kind === "collection.chunk") return [node.items];
  if (node.kind === "document.render") return [node.input, node.title];
  if (node.kind === "model.call") return [node.input];
  if (node.kind === "model.map") return [node.items, node.input];
  if (node.kind === "model.reduce") return [node.items, node.input];
  if (node.kind === "mutation.stage") return [node.args, node.changeSet];
  if (node.kind === "review.input") return [node.prompt, node.data];
  if (node.kind === "approval.required") return [node.changeSet];
  if (node.kind === "branch.if") return [node.condition, node.then, node.else];
  if (node.kind === "loop.map") return [node.items, node.map];
  if (node.kind === "error.handle") return [node.try, node.fallback];
  if (node.kind === "checkpoint.write") return [node.value];
  if (node.kind === "transform.template") return [node.vars];
  if (node.kind === "output.final") return [node.value];
  return [];
}

function isProgramRef(value: unknown): value is { fromNode: string; path?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fromNode?: unknown }).fromNode === "string");
}

function workflowCompilerOutputFromProgram(
  program: WorkflowProgramIR,
  loweredPlan: WorkflowProgramLoweredOperationPlan,
  toolDescriptors: DesktopToolDescriptor[],
  connectorDescriptors: WorkflowConnectorDescriptor[],
  ambientCliCapabilities: WorkflowProgramAmbientCliCapability[],
): WorkflowCompilerOutput {
  const orderedNodes = loweredPlan.operations.map((operation) => operation.node);
  const manifest = resolveWorkflowProgramManifest({ nodes: orderedNodes, program, toolDescriptors, connectorDescriptors, ambientCliCapabilities });
  const graph = workflowProgramGraph(program, orderedNodes);
  const source = generateWorkflowProgramSource({ nodes: orderedNodes, toolDescriptors, connectorDescriptors });
  const spec: WorkflowSpec = {
    goal: program.goal,
    summary: program.summary ?? program.goal,
    successCriteria: program.successCriteria,
    inputs: program.inputs,
  };
  return {
    title: program.title,
    spec,
    manifest,
    graph,
    source,
    previewSummary: program.summary ?? program.goal,
    dryRunStrategy: "Generated from validated WorkflowProgramIR and executed with mocked workflow/tools/ambient/connectors before preview persistence.",
    openQuestions: program.openQuestions ?? [],
  };
}

function workflowProgramGraph(program: WorkflowProgramIR, orderedNodes: WorkflowProgramNode[]): { summary: string; nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } {
  const nodes: WorkflowGraphNode[] = [
    {
      id: "request",
      type: "request",
      label: "Request",
      description: program.goal,
      outputSummary: program.summary,
      x: 0,
      y: 0,
    },
    ...orderedNodes.map((node, index) => workflowGraphNodeForProgramNode(node, index)),
  ];
  const explicitEdges = program.edges ?? [];
  const edges: WorkflowGraphEdge[] = [
    ...orderedNodes
      .filter((node) => (node.dependsOn ?? []).length === 0)
      .map((node) => ({
        id: `request-to-${node.id}`,
        source: "request",
        target: node.id,
        type: "control_flow" as const,
      })),
    ...orderedNodes.flatMap((node) =>
      (node.dependsOn ?? []).map((dependencyId) => ({
        id: `${dependencyId}-to-${node.id}`,
        source: dependencyId,
        target: node.id,
        type: "data_flow" as const,
      })),
    ),
    ...explicitEdges.map((edge) => ({
      id: edge.id ?? `${edge.source}-to-${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: edge.type ?? ("data_flow" as const),
      label: edge.label,
    })),
  ];
  return {
    summary: program.summary ?? program.goal,
    nodes,
    edges: dedupeEdges(edges),
  };
}

function workflowGraphNodeForProgramNode(node: WorkflowProgramNode, index: number): WorkflowGraphNode {
  const base = {
    id: node.id,
    label: node.label ?? humanizeNodeId(node.id),
    description: node.description,
    inputSummary: (node.dependsOn ?? []).join(", ") || "workflow request",
    outputSummary: node.output?.type ?? workflowProgramNodeOutputSummary(node),
    x: 260 + index * 260,
    y: 0,
  };
  if (node.kind === "model.call") {
    return { ...base, type: "model_call", modelRole: node.task, toolNames: ["ambient.responses"], retryPolicy: "schema retry" };
  }
  if (node.kind === "model.map") {
    return { ...base, type: "model_call", modelRole: node.task, toolNames: ["ambient.responses"], retryPolicy: `bounded model fan-out, max ${node.maxItems} items; retry or skip failed chunks/items and continue with partial coverage` };
  }
  if (node.kind === "model.reduce") {
    const reducePolicy =
      node.strategy === "tree"
        ? `tree reduce max ${node.maxInputItems} inputs, fan-in ${node.maxFanIn ?? 8}, levels ${node.maxLevels ?? 8}`
        : `schema retry over max ${node.maxInputItems} reduced inputs`;
    return { ...base, type: "model_call", modelRole: node.task, toolNames: ["ambient.responses"], retryPolicy: reducePolicy };
  }
  if (node.kind === "tool.paginate") return { ...base, type: toolGraphNodeType(node.tool), toolNames: [node.tool], retryPolicy: `read-only bounded tool pagination, max ${node.maxItems} items across ${node.maxPages} pages; checkpointed page retry; continue with partial results after failed page` };
  if (node.kind === "checkpoint.write") return { ...base, type: "deterministic_step", retentionPolicy: "checkpoint" };
  if (node.kind === "review.input") return { ...base, type: "review_gate", reviewPolicy: "Pause for structured user input with workflow.askUser." };
  if (node.kind === "approval.required") return { ...base, type: "review_gate", reviewPolicy: "Pause until the user approves or rejects the proposed change set." };
  if (node.kind === "browser.intervention") {
    const loginIntervention = node.tool === "browser_login";
    return {
      ...base,
      type: "data_source",
      toolNames: node.screenshot && node.screenshot.enabled !== false ? [node.tool, "browser_screenshot"] : [node.tool],
      reviewPolicy: loginIntervention
        ? "Pause only if browser login reports CAPTCHA, MFA, passkey, consent, or another user-action state; then let downstream browser steps verify progress."
        : "Pause only if the browser reports CAPTCHA, login, MFA, consent, or another user-action state; then retry the same browser operation with the preserved userActionId.",
      retryPolicy: loginIntervention ? "user-confirmed handoff; downstream verification" : "single same-session retry after user confirmation",
    };
  }
  if (node.kind === "branch.if") return { ...base, type: "deterministic_step", retryPolicy: "deterministic branch selection" };
  if (node.kind === "loop.map") {
    const mapTool = node.map && typeof node.map === "object" && !Array.isArray(node.map) && (node.map as { kind?: unknown }).kind === "tool.call" ? (node.map as { tool?: unknown }) : undefined;
    const toolName = typeof mapTool?.tool === "string" ? mapTool.tool : undefined;
    return toolName
      ? { ...base, type: toolGraphNodeType(toolName), toolNames: [toolName], retryPolicy: `bounded tool fan-out, max ${node.maxItems ?? 1000} items; retry or skip failed items and continue with partial coverage` }
      : { ...base, type: "deterministic_step", retryPolicy: "deterministic bounded map" };
  }
  if (node.kind === "error.handle") return { ...base, type: "error_handler", retryPolicy: "fallback value on handled errors" };
  if (node.kind === "mutation.stage") return { ...base, type: "mutation", toolNames: [node.tool], reviewPolicy: "Stage mutation until explicit approval." };
  if (node.kind === "connector.call") return { ...base, type: "connector_call", connectorIds: [node.connectorId] };
  if (node.kind === "connector.paginate") return { ...base, type: "connector_call", connectorIds: [node.connectorId], retryPolicy: `read-only bounded pagination, max ${node.maxItems} items across ${node.maxPages} pages; checkpointed page retry; continue with partial results after failed page` };
  if (node.kind === "connector.map") return { ...base, type: "connector_call", connectorIds: [node.connectorId], retryPolicy: `read-only bounded fan-out, max ${node.maxItems ?? 1000} items; retry or skip failed items` };
  if (node.kind === "collection.map") return { ...base, type: "deterministic_step", retryPolicy: `deterministic bounded map, max ${node.maxItems} items; retry or skip failed items` };
  if (node.kind === "collection.filter") return { ...base, type: "deterministic_step", retryPolicy: `deterministic bounded filter, max ${node.maxItems} retained items` };
  if (node.kind === "collection.dedupe") return { ...base, type: "deterministic_step", retryPolicy: `deterministic ${node.strategy ?? "url_canonical"} dedupe, max ${node.maxItems} retained items` };
  if (node.kind === "collection.chunk") return { ...base, type: "deterministic_step", retryPolicy: `deterministic chunks, max ${node.maxChunks} chunks of ${node.chunkSize}` };
  if (node.kind === "document.render") return { ...base, type: "output", retryPolicy: `deterministic ${node.format} render`, retentionPolicy: "artifact content staged only by explicit mutation" };
  if (node.kind === "transform.template") return { ...base, type: "deterministic_step" };
  if (node.kind === "output.final") return { ...base, type: "output" };
  return {
    ...base,
    type: toolGraphNodeType(node.tool),
    toolNames: [node.tool],
  };
}

function workflowProgramNodeOutputSummary(node: WorkflowProgramNode): string {
  if (node.kind === "model.call") return "schema-validated model output";
  if (node.kind === "model.map") return "bounded per-item schema-validated model outputs";
  if (node.kind === "model.reduce") return "schema-validated reduced model output";
  if (node.kind === "tool.call") return `${node.tool} result`;
  if (node.kind === "tool.paginate") return `${node.tool} paginated results`;
  if (node.kind === "connector.call") return `${node.connectorId}.${node.operation} result`;
  if (node.kind === "connector.paginate") return `${node.connectorId}.${node.operation} paginated results`;
  if (node.kind === "connector.map") return `${node.connectorId}.${node.operation} mapped results`;
  if (node.kind === "collection.map") return "deterministically mapped collection";
  if (node.kind === "collection.filter") return "deterministically filtered collection";
  if (node.kind === "collection.dedupe") return "deterministically deduplicated collection";
  if (node.kind === "collection.chunk") return "deterministically chunked collection";
  if (node.kind === "document.render") return "deterministically rendered document";
  if (node.kind === "mutation.stage") return `${node.tool} staged mutation result`;
  if (node.kind === "review.input") return "user input response";
  if (node.kind === "browser.intervention") return "browser result with optional user-action handoff";
  if (node.kind === "approval.required") return "approval decision";
  if (node.kind === "branch.if") return "conditional branch value";
  if (node.kind === "loop.map") return "mapped item values";
  if (node.kind === "error.handle") return "handled value or fallback";
  if (node.kind === "checkpoint.write") return "checkpoint value";
  if (node.kind === "transform.template") return "rendered template value";
  return "final workflow output";
}

function toolGraphNodeType(tool: string): WorkflowGraphNode["type"] {
  if (tool.startsWith("browser_")) return "data_source";
  if (
    tool === "file_read" ||
    tool === "local_directory_list" ||
    tool === "local_file_read" ||
    tool === "ambient_visual_analyze" ||
    tool === "google_workspace_call" ||
    tool === "google_workspace_status" ||
    tool === "google_workspace_search_methods"
  ) return "data_source";
  if (tool === "file_write" || tool === "google_workspace_materialize_file") return "output";
  return "deterministic_step";
}

function dedupeEdges(edges: WorkflowGraphEdge[]): WorkflowGraphEdge[] {
  const byId = new Map<string, WorkflowGraphEdge>();
  for (const edge of edges) byId.set(edge.id, edge);
  return [...byId.values()];
}

function errorDiagnostic(code: string, message: string, path: string, nodeId?: string): WorkflowProgramDiagnostic {
  return { code, severity: "error", message, path, ...(nodeId ? { nodeId } : {}) };
}

function throwIfErrors(
  diagnostics: WorkflowProgramDiagnostic[],
  phase: WorkflowProgramCompileFailurePhase,
  timings: {
    startedAtMs: number;
    parseAndNormalizeMs: number;
    staticValidationMs: number;
    loweringMs: number;
    codegenMs: number;
    outputValidationMs: number;
    dryRunMs: number;
  },
  context?: WorkflowProgramCompileFailureContext,
): void {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) throw new WorkflowProgramCompileError(errors, workflowProgramFailureReport(phase, errors, timings, context));
}

interface WorkflowProgramCompileFailureContext {
  program?: WorkflowProgramIR;
  toolDescriptors?: DesktopToolDescriptor[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
}

function workflowProgramFailureReport(
  phase: WorkflowProgramCompileFailurePhase,
  diagnostics: WorkflowProgramDiagnostic[],
  timings: {
    startedAtMs: number;
    parseAndNormalizeMs: number;
    staticValidationMs: number;
    loweringMs: number;
    codegenMs: number;
    outputValidationMs: number;
    dryRunMs: number;
  },
  context?: WorkflowProgramCompileFailureContext,
): WorkflowProgramCompileFailureReport {
  const summaries = diagnostics.map((diagnostic) => workflowProgramFailureDiagnosticSummary(diagnostic, context));
  const first = summaries[0];
  return {
    phase,
    totalMs: elapsedMs(timings.startedAtMs),
    parseAndNormalizeMs: timings.parseAndNormalizeMs,
    staticValidationMs: timings.staticValidationMs,
    loweringMs: timings.loweringMs,
    codegenMs: timings.codegenMs,
    outputValidationMs: timings.outputValidationMs,
    dryRunMs: timings.dryRunMs,
    diagnosticCount: diagnostics.length,
    ...(first?.code ? { firstDiagnosticCode: first.code } : {}),
    ...(first?.path ? { firstDiagnosticPath: first.path } : {}),
    ...(first?.nodeId ? { firstDiagnosticNodeId: first.nodeId } : {}),
    ...(first?.message ? { firstDiagnosticMessage: first.message } : {}),
    ...(first?.validatorId ? { firstDiagnosticValidatorId: first.validatorId } : {}),
    ...(first?.repairHint ? { firstDiagnosticRepairHint: first.repairHint } : {}),
    ...(first?.sourceNodeId ? { firstDiagnosticSourceNodeId: first.sourceNodeId } : {}),
    ...(first?.invalidOutputPath ? { firstDiagnosticInvalidOutputPath: first.invalidOutputPath } : {}),
    ...(first?.validAlternatives ? { firstDiagnosticValidAlternatives: first.validAlternatives } : {}),
    ...(first?.producerOutputContract ? { firstDiagnosticProducerOutputContract: first.producerOutputContract } : {}),
    diagnostics: summaries,
  };
}

function workflowProgramFailureDiagnosticSummary(
  diagnostic: WorkflowProgramDiagnostic,
  context?: WorkflowProgramCompileFailureContext,
): WorkflowProgramCompileFailureDiagnosticSummary {
  const validatorId = workflowProgramDiagnosticValidatorId(diagnostic);
  const repairHint = diagnostic.repairHint ?? workflowProgramRepairHintForDiagnosticCode(diagnostic.code);
  const outputPathDetails = workflowProgramOutputPathFailureDetails(diagnostic.message);
  const producerOutputContract = workflowProgramProducerOutputContractSummary(outputPathDetails.sourceNodeId, context);
  return {
    code: diagnostic.code,
    path: diagnostic.path,
    message: diagnostic.message,
    ...(diagnostic.nodeId ? { nodeId: diagnostic.nodeId } : {}),
    ...(validatorId ? { validatorId } : {}),
    ...(repairHint ? { repairHint } : {}),
    ...outputPathDetails,
    ...(producerOutputContract ? { producerOutputContract } : {}),
  };
}

function workflowProgramProducerOutputContractSummary(
  sourceNodeId: string | undefined,
  context?: WorkflowProgramCompileFailureContext,
): string | undefined {
  if (!sourceNodeId || !context?.program) return undefined;
  const source = context.program.nodes.find((node) => node.id === sourceNodeId);
  if (!source) return undefined;
  const nodesById = new Map(context.program.nodes.map((node) => [node.id, node]));
  const toolsByName = new Map((context.toolDescriptors ?? []).map((tool) => [tool.name, tool]));
  const connectorsById = new Map((context.connectorDescriptors ?? []).map((connector) => [connector.id, connector]));
  const fields = workflowProgramKnownOutputFields(source, { nodesById, toolsByName, connectorsById });
  const fieldSummary = fields.length ? fields.join(", ") : "whole output only";
  return `${source.id} (${workflowProgramNodeOutputSummary(source)}): ${fieldSummary}`;
}

function workflowProgramOutputPathFailureDetails(message: string): {
  sourceNodeId?: string;
  invalidOutputPath?: string;
  validAlternatives?: string;
} {
  const reference = /references path ([^,\s]+) on ([^,\s.]+)/.exec(message);
  const validFirstSegments = /Known valid first-segment paths: (.+?)(?:\.)?$/.exec(message);
  const knownOutputPaths = /Known output paths on ([^:]+): (.+?)(?:\.)?$/.exec(message);
  const sourceNodeId = reference?.[2] ?? knownOutputPaths?.[1]?.trim();
  return {
    ...(sourceNodeId ? { sourceNodeId } : {}),
    ...(reference?.[1] ? { invalidOutputPath: reference[1] } : {}),
    ...(validFirstSegments?.[1] ? { validAlternatives: validFirstSegments[1].replace(/\.$/, "").trim() } : {}),
    ...(knownOutputPaths?.[2] ? { validAlternatives: knownOutputPaths[2].replace(/\.$/, "").trim() } : {}),
  };
}

function humanizeNodeId(id: string): string {
  return id
    .replace(/[-_.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function elapsedMs(startedAtMs: number): number {
  return Math.max(0, Math.round((nowMs() - startedAtMs) * 100) / 100);
}
