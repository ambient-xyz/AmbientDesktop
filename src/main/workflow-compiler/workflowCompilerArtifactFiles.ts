import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workflowGraphFromSpec } from "../../shared/workflowAgentGraph";
import type {
  WorkflowCompileProgress,
  WorkflowDiscoveryQuestion,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowPromptCacheCheckpoint,
} from "../../shared/workflowTypes";
import { canonicalizeWorkflowGraphLayout, workflowGraphWithSourceMappings, type WorkflowCompilerOutput } from "./workflowCompiler";
import type { WorkflowProgramIrPatchOperation } from "./workflowCompilerIrRepair";
import type { WorkflowCompilerPromptAssemblyRecord } from "./workflowCompilerPromptModules";
import type { WorkflowCompilerRecipeSelectionResult, WorkflowCompilerSelectedRecipe } from "./workflowCompilerRecipes";
import type { WorkflowCompilerCallableInvocationContext } from "./workflowCompilerService";
import type {
  WorkflowProgramDiagnostic,
  WorkflowProgramLoweredOperationPlan,
  WorkflowProgramValidationReport,
} from "./workflowCompilerWorkflowProgramFacade";
import type { WorkflowPlanDsl } from "./workflowCompilerWorkflowFacade";

export interface WorkflowCompileContextArtifactInput {
  discoveryQuestions: WorkflowDiscoveryQuestion[];
  explorationTraces: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
  callableWorkflowInvocation?: WorkflowCompilerCallableInvocationContext;
  recipeSelection?: WorkflowCompilerRecipeSelectionResult;
  selectedRecipes?: WorkflowCompilerSelectedRecipe[];
  capabilityDiscoverySummary?: string;
}

export type WorkflowProgramIrRepairHistoryArtifactInput = {
  attempt: number;
  diagnostics: WorkflowProgramDiagnostic[];
  patch: WorkflowProgramIrPatchOperation[];
  rawPatch: unknown;
};

export interface WorkflowCompilerArtifactFilePaths {
  compileContext: string;
  graph: string;
  loweredPlan?: string;
  manifest: string;
  planDsl?: string;
  preview: string;
  promptAssembly: string;
  repairHistory: string;
  source: string;
  spec: string;
  state: string;
  validationReport: string;
}

export interface WorkflowCompilerArtifactFileResult {
  artifactRoot: string;
  graph: NonNullable<WorkflowCompilerOutput["graph"]>;
  id: string;
  patchOperationCount: number;
  paths: WorkflowCompilerArtifactFilePaths;
  repairAttemptCount: number;
  sourceText: string;
}

export async function writeWorkflowCompilerArtifactFiles({
  cacheCheckpoint,
  compileContext,
  emitProgress,
  loweredPlan,
  output,
  planDsl,
  promptAssembly,
  repairHistory,
  stateRoot,
  validationReport,
}: {
  cacheCheckpoint: WorkflowPromptCacheCheckpoint;
  compileContext: WorkflowCompileContextArtifactInput;
  emitProgress: (progress: Omit<WorkflowCompileProgress, "compileId" | "createdAt" | "total">) => void;
  loweredPlan?: WorkflowProgramLoweredOperationPlan;
  output: WorkflowCompilerOutput;
  planDsl?: WorkflowPlanDsl;
  promptAssembly: WorkflowCompilerPromptAssemblyRecord;
  repairHistory: WorkflowProgramIrRepairHistoryArtifactInput[];
  stateRoot: string;
  validationReport: WorkflowProgramValidationReport;
}): Promise<WorkflowCompilerArtifactFileResult> {
  const manifestJson = `${JSON.stringify(output.manifest, null, 2)}\n`;
  const specJson = `${JSON.stringify(output.spec, null, 2)}\n`;
  const sourceText = output.source.endsWith("\n") ? output.source : `${output.source}\n`;
  const loweredPlanJson = loweredPlan ? `${JSON.stringify(loweredPlan, null, 2)}\n` : undefined;
  const planDslJson = planDsl ? `${JSON.stringify(planDsl, null, 2)}\n` : undefined;
  const repairHistoryArtifact = workflowProgramIrRepairHistoryArtifact(repairHistory);
  const repairHistoryJson = `${JSON.stringify(repairHistoryArtifact, null, 2)}\n`;
  const promptAssemblyJson = `${JSON.stringify(promptAssembly, null, 2)}\n`;
  const validationReportJson = `${JSON.stringify(validationReport, null, 2)}\n`;
  const preview = previewMarkdown(output);
  const graph = canonicalizeWorkflowGraphLayout(
    workflowGraphWithSourceMappings(
      sourceText,
      output.graph ?? workflowGraphFromSpec({ title: output.title, spec: output.spec, manifest: output.manifest }),
    ),
  );
  emitProgress({
    phase: "validated",
    status: "completed",
    message: "WorkflowProgramIR artifact passed deterministic validation.",
    current: 4,
    metrics: {
      toolCount: output.manifest.tools.length,
      connectorGrantCount: output.manifest.connectors?.length ?? 0,
      sourceChars: sourceText.length,
    },
  });

  const id = `workflow-${slugForWorkflowCompilerTitle(output.title)}-${randomUUID().slice(0, 8)}`;
  const artifactRoot = join(stateRoot, "workflows", id);
  const paths: WorkflowCompilerArtifactFilePaths = {
    compileContext: join(artifactRoot, "compile-context.json"),
    graph: join(artifactRoot, "graph.json"),
    loweredPlan: loweredPlanJson ? join(artifactRoot, "lowered-plan.json") : undefined,
    manifest: join(artifactRoot, "manifest.json"),
    planDsl: planDslJson ? join(artifactRoot, "plan-dsl.json") : undefined,
    preview: join(artifactRoot, "preview.md"),
    promptAssembly: join(artifactRoot, "prompt-assembly.json"),
    repairHistory: join(artifactRoot, "repair-history.json"),
    source: join(artifactRoot, "main.ts"),
    spec: join(artifactRoot, "spec.json"),
    state: join(artifactRoot, "state.json"),
    validationReport: join(artifactRoot, "validation-report.json"),
  };
  emitProgress({
    phase: "persisted",
    status: "running",
    message: "Writing workflow artifact files.",
    detail: artifactRoot,
    current: 5,
  });
  await mkdir(join(artifactRoot, "reports"), { recursive: true });
  await writeFile(paths.manifest, manifestJson, "utf8");
  await writeFile(paths.spec, specJson, "utf8");
  await writeFile(paths.source, sourceText, "utf8");
  await writeFile(paths.preview, preview, "utf8");
  await writeFile(
    paths.compileContext,
    `${JSON.stringify(compileContextArtifact(compileContext, cacheCheckpoint, promptAssembly), null, 2)}\n`,
    "utf8",
  );
  await writeFile(paths.promptAssembly, promptAssemblyJson, "utf8");
  await writeFile(paths.repairHistory, repairHistoryJson, "utf8");
  await writeFile(paths.validationReport, validationReportJson, "utf8");
  await writeFile(paths.graph, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  if (loweredPlanJson && paths.loweredPlan) await writeFile(paths.loweredPlan, loweredPlanJson, "utf8");
  if (planDslJson && paths.planDsl) await writeFile(paths.planDsl, planDslJson, "utf8");
  emitProgress({
    phase: "persisted",
    status: "completed",
    message: loweredPlanJson
      ? planDslJson
        ? "Wrote manifest, spec, generated program, graph, plan DSL, lowered plan, validation report, repair history, prompt assembly, discovery context, and preview files."
        : "Wrote manifest, spec, generated program, graph, lowered plan, validation report, repair history, prompt assembly, discovery context, and preview files."
      : "Wrote manifest, spec, generated program, graph, validation report, repair history, prompt assembly, discovery context, and preview files.",
    current: 5,
    metrics: {
      artifactId: id,
      manifestBytes: Buffer.byteLength(manifestJson),
      specBytes: Buffer.byteLength(specJson),
      sourceBytes: Buffer.byteLength(sourceText),
      previewBytes: Buffer.byteLength(preview),
      repairHistoryBytes: Buffer.byteLength(repairHistoryJson),
      promptAssemblyBytes: Buffer.byteLength(promptAssemblyJson),
      validationReportBytes: Buffer.byteLength(validationReportJson),
      validationReportStatus: validationReport.status,
      validatorCount: validationReport.validators.length,
      validationDiagnosticCount: validationReport.diagnosticSummary.diagnosticCount,
      connectorWriteOperationCount: validationReport.evidence.connectorWriteOperations.length,
      repairAttemptCount: repairHistoryArtifact.repairAttemptCount,
      patchOperationCount: repairHistoryArtifact.patchOperationCount,
      ...(planDslJson ? { planDslBytes: Buffer.byteLength(planDslJson) } : {}),
      ...(loweredPlanJson ? { loweredPlanBytes: Buffer.byteLength(loweredPlanJson) } : {}),
    },
  });

  return {
    artifactRoot,
    graph,
    id,
    patchOperationCount: repairHistoryArtifact.patchOperationCount,
    paths,
    repairAttemptCount: repairHistoryArtifact.repairAttemptCount,
    sourceText,
  };
}

function compileContextArtifact(
  input: WorkflowCompileContextArtifactInput,
  cacheCheckpoint?: WorkflowPromptCacheCheckpoint,
  promptAssembly?: WorkflowCompilerPromptAssemblyRecord,
): {
  schemaVersion: 1;
  compilerMode: "program_ir";
  cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
  promptAssembly?: WorkflowCompilerPromptAssemblyRecord;
  recipeSelection?: WorkflowCompilerRecipeSelectionResult;
  selectedRecipes?: WorkflowCompilerSelectedRecipe[];
  callableWorkflowInvocation?: WorkflowCompilerCallableInvocationContext;
  discoveryQuestions: Array<{
    id: string;
    revisionId?: string;
    category: string;
    question: string;
    answer?: WorkflowDiscoveryQuestion["answer"];
    selectedChoice?: WorkflowDiscoveryQuestion["choices"][number];
    graphImpact?: string;
  }>;
  explorationTraces: Array<{
    id: string;
    explorationId: string;
    explorationNodeId: string;
    request: string;
    model?: string;
    observationCount: number;
    capabilityManifest: unknown;
    distillation: unknown;
    createdAt: string;
  }>;
  graphSnapshot?: WorkflowGraphSnapshot;
} {
  return {
    schemaVersion: 1,
    compilerMode: "program_ir",
    cacheCheckpoint,
    promptAssembly,
    recipeSelection: input.recipeSelection,
    selectedRecipes: input.selectedRecipes ?? [],
    callableWorkflowInvocation: input.callableWorkflowInvocation,
    discoveryQuestions: (input.discoveryQuestions ?? []).map((question) => ({
      id: question.id,
      revisionId: question.revisionId,
      category: question.category,
      question: question.question,
      answer: question.answer,
      selectedChoice: question.answer?.choiceId ? question.choices.find((choice) => choice.id === question.answer?.choiceId) : undefined,
      graphImpact: question.graphImpact,
    })),
    explorationTraces: input.explorationTraces.map((trace) => ({
      id: trace.id,
      explorationId: trace.explorationId,
      explorationNodeId: trace.explorationNodeId,
      request: trace.request,
      model: trace.model,
      observationCount: trace.observations.length,
      capabilityManifest: trace.capabilityManifest,
      distillation: trace.distillation,
      createdAt: trace.createdAt,
    })),
    graphSnapshot: input.graphSnapshot,
  };
}

function workflowProgramIrRepairHistoryArtifact(repairHistory: WorkflowProgramIrRepairHistoryArtifactInput[]): {
  schemaVersion: 1;
  repairAttemptCount: number;
  patchOperationCount: number;
  attempts: Array<{
    attempt: number;
    diagnosticCount: number;
    diagnostics: WorkflowProgramDiagnostic[];
    patchOperationCount: number;
    patch: WorkflowProgramIrPatchOperation[];
    rawPatch: unknown;
  }>;
} {
  return {
    schemaVersion: 1,
    repairAttemptCount: repairHistory.length,
    patchOperationCount: repairHistory.reduce((sum, item) => sum + item.patch.length, 0),
    attempts: repairHistory.map((item) => ({
      attempt: item.attempt,
      diagnosticCount: item.diagnostics.length,
      diagnostics: item.diagnostics,
      patchOperationCount: item.patch.length,
      patch: item.patch,
      rawPatch: item.rawPatch,
    })),
  };
}

function previewMarkdown(output: { previewSummary: string; dryRunStrategy: string; openQuestions: string[] }): string {
  return [
    "# Workflow Preview",
    "",
    "## Summary",
    "",
    output.previewSummary,
    "",
    "## Dry Run",
    "",
    output.dryRunStrategy,
    "",
    "## Open Questions",
    "",
    ...(output.openQuestions.length > 0 ? output.openQuestions.map((question) => `- ${question}`) : ["None."]),
    "",
  ].join("\n");
}

export function slugForWorkflowCompilerTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "preview";
}
