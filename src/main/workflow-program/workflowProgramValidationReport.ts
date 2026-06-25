import type { WorkflowProgramIR, WorkflowProgramNode } from "../../shared/workflowProgramIr";
import { connectorOperationDescriptor, type WorkflowProgramDiagnostic } from "./workflowProgramCapabilityResolver";
import type { WorkflowProgramDryRunResult } from "./workflowProgramDryRun";
import type { WorkflowProgramLoweredOperationPlan, WorkflowProgramLoweringMetrics } from "./workflowProgramLowering";
import type { WorkflowProgramIncrementalValidationMetrics } from "./workflowProgramTypecheck";
import type { WorkflowCompilerOutput } from "./workflowProgramWorkflowCompilerFacade";
import type { WorkflowConnectorDescriptor } from "./workflowProgramWorkflowFacade";

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

export function annotateWorkflowProgramDiagnostics(diagnostics: WorkflowProgramDiagnostic[]): WorkflowProgramDiagnostic[] {
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
      nodeIds: [
        ...new Set(validatorDiagnostics.map((diagnostic) => diagnostic.nodeId).filter((nodeId): nodeId is string => Boolean(nodeId))),
      ].sort(),
    };
  });
}

export function workflowProgramDiagnosticValidatorId(diagnostic: WorkflowProgramDiagnostic): WorkflowProgramValidatorId | undefined {
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
  if (code.startsWith("ir.") || code.startsWith("tool.") || code.startsWith("ambient_cli.") || code.startsWith("model."))
    return "workflow.program.static";
  return undefined;
}

export function workflowProgramRepairHintForDiagnosticCode(code: string): string | undefined {
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
