import { randomUUID } from "node:crypto";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type {
  WorkflowCompileProgress,
  WorkflowDashboard,
  WorkflowDiscoveryQuestion,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowPromptCacheCheckpoint,
} from "../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "./workflowCompilerDesktopToolFacade";
import { readAmbientApiKey } from "./workflowCompilerSecurityFacade";
import {
  selectWorkflowCompilerConnectorDescriptors,
  selectWorkflowCompilerToolDescriptors,
  workflowCompilerDeniedConnectorIds,
  workflowCompilerRequiredBuiltinToolIntents,
  type WorkflowCompilerAmbientCliCapability,
  type WorkflowCompilerRequiredBuiltinToolIntent,
  type WorkflowCompilerOutput,
} from "./workflowCompiler";
import {
  discoverWorkflowCompilerCapabilities,
  resolveWorkflowCompilerCapabilityDiscovery,
  shouldIncludeWorkflowAmbientCliCapabilities,
  workflowAmbientCliCapabilitiesForCompile,
  workflowCompileContext,
  workflowCompilerWorkspaceSummary,
  type WorkflowCompileContext,
} from "./workflowCompilerCapabilityDiscovery";
import { recordWorkflowCompilerRun } from "./workflowCompilerRunRecorder";
import {
  compileWorkflowProgramIrWithRepair,
  validateCompiledWorkflowProgramRecipeContracts,
  workflowCompilerModelProgress,
  workflowProgramToolDescriptorsForProgram,
  type WorkflowProgramIrRepairHistoryEntry,
} from "./workflowCompilerProgramIrRepair";
import type { WorkflowCompilerPromptAssemblyRecord } from "./workflowCompilerPromptModules";
import { AmbientWorkflowCompilerProvider } from "./workflowCompilerProvider";
import { buildWorkflowPlanDslPromptParts, buildWorkflowProgramIrPromptParts } from "./workflowCompilerPromptParts";
import {
  selectWorkflowCompilerRecipePlan,
  type WorkflowCompilerRecipeSelectionResult,
  type WorkflowCompilerSelectedRecipe,
} from "./workflowCompilerRecipes";
import {
  compileWorkflowProgramIr,
  createWorkflowProgramCompileCache,
  WorkflowProgramCompileError,
  type WorkflowProgramLoweredOperationPlan,
  type WorkflowProgramValidationReport,
} from "./workflowCompilerWorkflowProgramFacade";
import {
  lowerWorkflowPlanDslToProgramIr,
  parseWorkflowPlanDsl,
  type WorkflowConnectorDescriptor,
  type WorkflowPlanDsl,
} from "./workflowCompilerWorkflowFacade";
import type { CompileWorkflowArtifactInput, WorkflowCompilerProvider } from "./workflowCompilerServiceTypes";

export {
  WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
  workflowCompilerCallableInvocationContextFromRunnerInput,
} from "./workflowCompilerCallableInvocationPrompt";
export type { WorkflowCompilerCallableInvocationContext } from "./workflowCompilerCallableInvocationPrompt";
export { AmbientWorkflowCompilerProvider, parseCompilerJson } from "./workflowCompilerProvider";
export { buildWorkflowPlanDslPromptParts, buildWorkflowProgramIrPromptParts } from "./workflowCompilerPromptParts";
export type { WorkflowCompilerPromptParts } from "./workflowCompilerPromptParts";
export type { CompileWorkflowArtifactInput, WorkflowCompilerProvider } from "./workflowCompilerServiceTypes";

const WORKFLOW_COMPILE_PROGRESS_TOTAL = 7;
interface WorkflowCompilerRunResult {
  output: WorkflowCompilerOutput;
  raw: unknown;
  loweredPlan?: WorkflowProgramLoweredOperationPlan;
  validationReport: WorkflowProgramValidationReport;
  repairHistory: WorkflowProgramIrRepairHistoryEntry[];
  planDsl?: WorkflowPlanDsl;
  prompt: string;
  promptAssembly: WorkflowCompilerPromptAssemblyRecord;
  cacheCheckpoint: WorkflowPromptCacheCheckpoint;
  startedAt: string;
  completedAt: string;
}

export async function compileWorkflowArtifact(input: CompileWorkflowArtifactInput): Promise<WorkflowDashboard> {
  const compileId = randomUUID();
  const compileContext: WorkflowCompileContext = input.workflowThreadId
    ? workflowCompileContext(input.store, input.workflowThreadId)
    : { discoveryQuestions: [], explorationTraces: [] };
  if (input.callableWorkflowInvocation) {
    compileContext.callableWorkflowInvocation = workflowCompilerJsonClone(input.callableWorkflowInvocation);
  }
  if (input.explorationTraces?.length) {
    compileContext.explorationTraces = [...input.explorationTraces, ...compileContext.explorationTraces].slice(0, 3);
  }
  let lastProgressCurrent = 0;
  const emitProgress = (progress: Omit<WorkflowCompileProgress, "compileId" | "createdAt" | "total">) => {
    lastProgressCurrent = Math.max(lastProgressCurrent, progress.current);
    input.onProgress?.({
      compileId,
      total: WORKFLOW_COMPILE_PROGRESS_TOTAL,
      createdAt: new Date().toISOString(),
      ...progress,
    });
  };

  try {
    if (input.workflowThreadId) input.store.updateWorkflowAgentThreadPhase(input.workflowThreadId, "compiling");
    const model = normalizeAmbientModelId(input.model);
    const provider =
      input.provider ??
      new AmbientWorkflowCompilerProvider({ apiKey: readAmbientApiKey(), baseUrl: input.baseUrl, retryPolicy: input.retryPolicy });
    if (!isWorkflowProgramIrProvider(provider)) {
      throw new Error(
        "Workflow compiler requires a WorkflowProgramIR provider; legacy TypeScript/source-block compiler providers are disabled for new workflow compiles.",
      );
    }
    const capabilityDiscovery = await discoverWorkflowCompilerCapabilities({
      provider,
      model,
      input,
      compileContext,
      emitProgress,
    });
    const capabilityResolution = await resolveWorkflowCompilerCapabilityDiscovery({
      input,
      compileContext,
      plan: capabilityDiscovery.plan,
    });
    compileContext.capabilityDiscoverySummary = capabilityResolution.summary;
    const capabilityQueries = capabilityResolution.capabilityQueries;
    const requestedBuiltinToolIntents = workflowCompilerRequiredBuiltinToolIntents({
      userRequest: input.userRequest,
      workspaceSummary: input.workspaceSummary,
      toolDescriptors: input.toolDescriptors,
      capabilityQueries,
      requiredToolNames: capabilityResolution.requiredToolNames,
      blockedToolNames: capabilityResolution.blockedToolNames,
      discoveryQuestions: compileContext.discoveryQuestions,
      explorationTraces: compileContext.explorationTraces,
      graphSnapshot: compileContext.graphSnapshot,
    });
    const requiredToolNames = uniqueStrings([
      ...capabilityResolution.requiredToolNames,
      ...requestedBuiltinToolIntents.map((intent) => intent.toolName),
    ]);
    const requestedKnownConnectorIds = workflowKnownRequestedConnectorIds({
      userRequest: input.userRequest,
      discoveryQuestions: compileContext.discoveryQuestions,
      graphSnapshot: compileContext.graphSnapshot,
      explorationTraces: compileContext.explorationTraces,
    });
    const deniedConnectorIds = workflowCompilerDeniedConnectorIds({
      userRequest: input.userRequest,
      workspaceSummary: input.workspaceSummary,
      connectorDescriptors: input.connectorDescriptors,
      capabilityQueries,
      requiredConnectorIds: capabilityResolution.requiredConnectorIds,
      discoveryQuestions: compileContext.discoveryQuestions,
      explorationTraces: compileContext.explorationTraces,
      graphSnapshot: compileContext.graphSnapshot,
    });
    const requiredConnectorIds = uniqueStrings([...capabilityResolution.requiredConnectorIds, ...requestedKnownConnectorIds]).filter(
      (connectorId) => !deniedConnectorIds.has(connectorId),
    );
    const capabilitySelection = selectWorkflowCompilerToolDescriptors({
      userRequest: input.userRequest,
      workspaceSummary: input.workspaceSummary,
      toolDescriptors: input.toolDescriptors,
      capabilityQueries,
      requiredToolNames,
      blockedToolNames: capabilityResolution.blockedToolNames,
      discoveryQuestions: compileContext.discoveryQuestions,
      explorationTraces: compileContext.explorationTraces,
      graphSnapshot: compileContext.graphSnapshot,
    });
    const connectorSelection = selectWorkflowCompilerConnectorDescriptors({
      userRequest: input.userRequest,
      workspaceSummary: input.workspaceSummary,
      connectorDescriptors: input.connectorDescriptors,
      capabilityQueries,
      requiredConnectorIds,
      discoveryQuestions: compileContext.discoveryQuestions,
      explorationTraces: compileContext.explorationTraces,
      graphSnapshot: compileContext.graphSnapshot,
    });
    const compileToolDescriptors = capabilitySelection.selectedToolDescriptors;
    const compileConnectorDescriptors = connectorSelection.selectedConnectorDescriptors;
    const recipeSelection = selectWorkflowCompilerRecipePlan({
      userRequest: input.userRequest,
      workspaceSummary: input.workspaceSummary,
      selectedToolNames: capabilitySelection.selectedToolNames,
      selectedConnectorIds: connectorSelection.selectedConnectorIds,
      discoveryQuestions: compileContext.discoveryQuestions,
      explorationTraces: compileContext.explorationTraces,
      graphSnapshot: compileContext.graphSnapshot,
    });
    const selectedRecipes = recipeSelection.selected;
    compileContext.recipeSelection = recipeSelection;
    compileContext.selectedRecipes = selectedRecipes;
    assertRequestedBuiltinToolsAvailable({
      requestedToolIntents: requestedBuiltinToolIntents,
      availableToolDescriptors: input.toolDescriptors,
      selectedToolNames: capabilitySelection.selectedToolNames,
      blockedToolNames: capabilityResolution.blockedToolNames,
    });
    assertRequiredConnectorsAvailable({
      requestedConnectorIds: requiredConnectorIds,
      availableConnectorDescriptors: input.connectorDescriptors ?? [],
      selectedConnectorIds: connectorSelection.selectedConnectorIds,
    });
    emitProgress({
      phase: "context",
      status: "completed",
      message: "Read the workflow request, discovery context, and project context.",
      current: 1,
      metrics: {
        toolCount: capabilitySelection.selectedToolNames.length,
        availableToolCount: capabilitySelection.availableToolCount,
        selectedToolCount: capabilitySelection.selectedToolNames.length,
        capabilityQueryCount: capabilityQueries.length,
        requiredToolNameCount: requiredToolNames.length,
        requestedBuiltinToolCount: requestedBuiltinToolIntents.length,
        requiredConnectorIdCount: requiredConnectorIds.length,
        capabilitySearchCount: capabilityResolution.searches.length,
        capabilitySearchResultCount: capabilityResolution.searches.reduce((sum, search) => sum + search.results.length, 0),
        capabilityDescribeCount: capabilityResolution.descriptions.length,
        blockedToolNameCount: capabilityResolution.blockedToolNames.length,
        ...(capabilityDiscovery.fallback ? { capabilityDiscoveryFallback: true } : {}),
        connectorCount: connectorSelection.selectedConnectorIds.length,
        availableConnectorCount: connectorSelection.availableConnectorCount,
        selectedConnectorCount: connectorSelection.selectedConnectorIds.length,
        selectedConnectorOperationCount: connectorSelection.selectedOperationCount,
        pluginRegistrationCount: input.pluginRegistrations?.length ?? 0,
        discoveryAnswerCount: compileContext.discoveryQuestions?.filter((question) => question.answer).length ?? 0,
        explorationTraceCount: compileContext.explorationTraces.length,
        graphNodeCount: compileContext.graphSnapshot?.nodes.length ?? 0,
        debugRewrite: Boolean(input.debugRewriteContext),
        callableWorkflowInvocation: Boolean(compileContext.callableWorkflowInvocation),
        ...(compileContext.callableWorkflowInvocation
          ? {
              callableWorkflowSourceKind: compileContext.callableWorkflowInvocation.sourceKind,
              callableWorkflowBlocking: compileContext.callableWorkflowInvocation.blocking,
              ...(compileContext.callableWorkflowInvocation.callerProvenance
                ? {
                    callableWorkflowCallerKind: compileContext.callableWorkflowInvocation.callerProvenance.kind,
                    callableWorkflowCallerWorktreeIsolated: compileContext.callableWorkflowInvocation.callerProvenance.worktree.isolated,
                  }
                : {}),
            }
          : {}),
        selectedRecipeCount: selectedRecipes.length,
        selectedRecipeIds: selectedRecipes.map((recipe) => recipe.id).join(","),
        rejectedRecipeCount: recipeSelection.rejected.length,
        rejectedRecipeIds: recipeSelection.rejected.map((recipe) => recipe.id).join(","),
        recipeSelectionConfidence: recipeSelection.summary.confidence,
        recipePolicyImplicationCount: recipeSelection.policyImplications.length,
      },
    });

    const ambientCliCapabilities = shouldIncludeWorkflowAmbientCliCapabilities({
      selectedToolNames: capabilitySelection.selectedToolNames,
      availableToolNames: input.toolDescriptors.map((tool) => tool.name),
    })
      ? await workflowAmbientCliCapabilitiesForCompile({
          workspacePath: input.store.getWorkspace().path,
          userRequest: input.userRequest,
          explorationTraces: compileContext.explorationTraces,
        })
      : [];
    const compilerInput = {
      input,
      provider,
      model,
      compileContext,
      compileToolDescriptors,
      compileConnectorDescriptors,
      ambientCliCapabilities,
      selectedRecipes,
      recipeSelection,
      capabilitySelection,
      connectorSelection,
      emitProgress,
    };
    const compilerRun =
      shouldUseWorkflowPlanDslCompiler(provider) && isWorkflowPlanDslProvider(provider)
        ? await compileWorkflowArtifactFromPlanDsl({ ...compilerInput, provider })
        : await compileWorkflowArtifactFromProgramIr(compilerInput);
    return await recordWorkflowCompilerRun({
      input,
      compileContext,
      compilerRun,
      capabilityDiscovery,
      capabilityResolution,
      capabilitySelection,
      connectorSelection,
      selectedRecipes,
      recipeSelection,
      model,
      emitProgress,
    });
  } catch (error) {
    if (input.workflowThreadId) {
      try {
        input.store.updateWorkflowAgentThreadPhase(input.workflowThreadId, "failed");
      } catch {
        // Preserve the original compiler error if the thread was removed mid-compile.
      }
    }
    emitProgress({
      phase: "failed",
      status: "failed",
      message: "Workflow preview compilation failed.",
      current: Math.max(lastProgressCurrent, 1),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function isWorkflowProgramIrProvider(provider: WorkflowCompilerProvider): provider is WorkflowCompilerProvider & {
  compileProgramIr: NonNullable<WorkflowCompilerProvider["compileProgramIr"]>;
} {
  return typeof provider.compileProgramIr === "function";
}

function isWorkflowPlanDslProvider(provider: WorkflowCompilerProvider): provider is WorkflowCompilerProvider & {
  compileProgramIr: NonNullable<WorkflowCompilerProvider["compileProgramIr"]>;
  compilePlanDsl: NonNullable<WorkflowCompilerProvider["compilePlanDsl"]>;
} {
  return typeof provider.compileProgramIr === "function" && typeof provider.compilePlanDsl === "function";
}

function shouldUseWorkflowPlanDslCompiler(provider: WorkflowCompilerProvider): boolean {
  if (!isWorkflowPlanDslProvider(provider)) return false;
  return envFlag("AMBIENT_WORKFLOW_PLAN_DSL_COMPILER") || envFlag("AMBIENT_WORKFLOW_PLAN_DSL_ENABLED");
}

type CompileWorkflowArtifactFromProgramIrInput = {
  input: CompileWorkflowArtifactInput;
  provider: WorkflowCompilerProvider & { compileProgramIr: NonNullable<WorkflowCompilerProvider["compileProgramIr"]> };
  model: string;
  compileContext: WorkflowCompileContext;
  compileToolDescriptors: DesktopToolDescriptor[];
  compileConnectorDescriptors: WorkflowConnectorDescriptor[];
  ambientCliCapabilities: WorkflowCompilerAmbientCliCapability[];
  selectedRecipes: WorkflowCompilerSelectedRecipe[];
  recipeSelection: WorkflowCompilerRecipeSelectionResult;
  capabilitySelection: ReturnType<typeof selectWorkflowCompilerToolDescriptors>;
  connectorSelection: ReturnType<typeof selectWorkflowCompilerConnectorDescriptors>;
  emitProgress: (progress: Omit<WorkflowCompileProgress, "compileId" | "createdAt" | "total">) => void;
};

type CompileWorkflowArtifactFromPlanDslInput = CompileWorkflowArtifactFromProgramIrInput & {
  provider: CompileWorkflowArtifactFromProgramIrInput["provider"] & {
    compilePlanDsl: NonNullable<WorkflowCompilerProvider["compilePlanDsl"]>;
  };
};

async function compileWorkflowArtifactFromPlanDsl(input: CompileWorkflowArtifactFromPlanDslInput): Promise<WorkflowCompilerRunResult> {
  const promptParts = buildWorkflowPlanDslPromptParts({
    userRequest: input.input.userRequest,
    workspaceSummary: workflowCompilerWorkspaceSummary(input.input.workspaceSummary, input.compileContext.capabilityDiscoverySummary),
    toolDescriptors: input.compileToolDescriptors,
    connectorDescriptors: input.compileConnectorDescriptors,
    selectedRecipes: input.selectedRecipes,
    discoveryQuestions: input.compileContext.discoveryQuestions,
    explorationTraces: input.compileContext.explorationTraces,
    graphSnapshot: input.compileContext.graphSnapshot,
    debugRewriteContext: input.input.debugRewriteContext,
    callableWorkflowInvocation: input.compileContext.callableWorkflowInvocation,
    workflowThreadId: input.input.workflowThreadId,
    revisionId: input.input.revisionId,
  });
  const { prompt, promptAssembly, cacheCheckpoint } = promptParts;
  input.emitProgress({
    phase: "prompt",
    status: "completed",
    message: "Built the Workflow Plan DSL compiler prompt.",
    current: 2,
    metrics: {
      promptChars: prompt.length,
      stablePrefixTokens: cacheCheckpoint.stablePrefixEstimatedTokens,
      mutableSuffixTokens: cacheCheckpoint.mutableSuffixEstimatedTokens,
      availableToolCount: input.capabilitySelection.availableToolCount,
      selectedToolCount: input.capabilitySelection.selectedToolNames.length,
      availableConnectorCount: input.connectorSelection.availableConnectorCount,
      selectedConnectorCount: input.connectorSelection.selectedConnectorIds.length,
      selectedConnectorOperationCount: input.connectorSelection.selectedOperationCount,
      selectedRecipeCount: input.selectedRecipes.length,
      selectedRecipeIds: input.selectedRecipes.map((recipe) => recipe.id).join(","),
      rejectedRecipeCount: input.recipeSelection.rejected.length,
      rejectedRecipeIds: input.recipeSelection.rejected.map((recipe) => recipe.id).join(","),
      recipeSelectionConfidence: input.recipeSelection.summary.confidence,
      recipePolicyImplicationCount: input.recipeSelection.policyImplications.length,
      callableWorkflowInvocation: Boolean(input.compileContext.callableWorkflowInvocation),
      compilerMode: "plan_dsl",
      promptModuleCount: promptAssembly.total.moduleCount,
      promptStableModuleCount: promptAssembly.stablePrefix.moduleCount,
      promptMutableModuleCount: promptAssembly.mutableSuffix.moduleCount,
    },
  });
  const startedAt = new Date().toISOString();
  input.emitProgress({
    phase: "model",
    status: "running",
    message: "Drafting the workflow Plan DSL.",
    detail: input.model,
    current: 3,
    metrics: { compilerMode: "plan_dsl" },
  });
  const rawPlanDsl = await input.provider.compilePlanDsl({
    prompt,
    model: input.model,
    cacheCheckpoint,
    onProgress: workflowCompilerModelProgress(input.emitProgress, {
      runningMessage: "Drafting the workflow Plan DSL.",
      streamingMessage: "Receiving the workflow Plan DSL.",
      thinkingMessage: "Pi is drafting the workflow Plan DSL.",
    }),
  });
  input.emitProgress({
    phase: "model",
    status: "completed",
    message: "Received the workflow Plan DSL.",
    current: 3,
    metrics: { rawResponseChars: roughJsonCharCount(rawPlanDsl), compilerMode: "plan_dsl" },
  });
  const parsedPlan = parseWorkflowPlanDsl(rawPlanDsl);
  if (!parsedPlan.success) throw new WorkflowProgramCompileError(parsedPlan.diagnostics);
  const loweredPlanDsl = lowerWorkflowPlanDslToProgramIr({ plan: parsedPlan.plan, userRequest: input.input.userRequest });
  if (!loweredPlanDsl.success) throw new WorkflowProgramCompileError(loweredPlanDsl.diagnostics);
  input.emitProgress({
    phase: "validated",
    status: "running",
    message: "Lowering Plan DSL through deterministic kernels, code-generating, and dry-running.",
    current: 4,
    metrics: { compilerMode: "plan_dsl", selectedKernel: loweredPlanDsl.selectedKernel },
  });
  const compileToolDescriptors = workflowProgramToolDescriptorsForProgram({
    selectedToolDescriptors: input.compileToolDescriptors,
    availableToolDescriptors: input.input.toolDescriptors,
    program: loweredPlanDsl.program,
  });
  const compiled = await compileWorkflowProgramIr({
    program: loweredPlanDsl.program,
    toolDescriptors: compileToolDescriptors,
    connectorDescriptors: input.compileConnectorDescriptors,
    ambientCliCapabilities: input.ambientCliCapabilities,
    validateGoogleReadOnly: true,
    incrementalCache: createWorkflowProgramCompileCache(),
  });
  const recipeContractDiagnostics = validateCompiledWorkflowProgramRecipeContracts(compiled, input.selectedRecipes);
  if (recipeContractDiagnostics.length > 0) throw new WorkflowProgramCompileError(recipeContractDiagnostics);
  input.emitProgress({
    phase: "validated",
    status: "completed",
    message: "Plan DSL lowered through deterministic kernels and passed static validation, codegen, and dry-run.",
    current: 4,
    metrics: {
      compilerMode: "plan_dsl",
      selectedKernel: loweredPlanDsl.selectedKernel,
      graphNodeCount: compiled.output.graph?.nodes.length ?? 0,
      sourceChars: compiled.output.source.length,
      dryRunCallCount: compiled.dryRun.calls.length,
      repairAttemptCount: 0,
      patchOperationCount: 0,
      compilerTotalMs: compiled.metrics.totalMs,
      staticValidationMs: compiled.metrics.staticValidationMs,
      loweringMs: compiled.metrics.loweringMs,
      codegenMs: compiled.metrics.codegenMs,
      outputValidationMs: compiled.metrics.outputValidationMs,
      dryRunMs: compiled.metrics.dryRunMs,
      validationReportStatus: compiled.validationReport.status,
      validatorCount: compiled.validationReport.validators.length,
      validationDiagnosticCount: compiled.validationReport.diagnosticSummary.diagnosticCount,
      connectorWriteOperationCount: compiled.validationReport.evidence.connectorWriteOperations.length,
      incrementalValidationNodeCount: compiled.metrics.incrementalValidation.nodeCount,
      incrementalValidationLevelCount: compiled.metrics.incrementalValidation.dependencyLevelCount,
      incrementalValidationMaxLevelWidth: compiled.metrics.incrementalValidation.maxDependencyLevelWidth,
      incrementalValidationConcurrency: compiled.metrics.incrementalValidation.validationConcurrency,
      incrementalValidationCacheHits: compiled.metrics.incrementalValidation.validationCacheHits,
      incrementalValidationCacheMisses: compiled.metrics.incrementalValidation.validationCacheMisses,
      loweredOperationCount: compiled.metrics.lowering.operationCount,
      loweringCacheHits: compiled.metrics.lowering.loweringCacheHits,
      loweringCacheMisses: compiled.metrics.lowering.loweringCacheMisses,
    },
  });
  return {
    output: compiled.output,
    raw: {
      planDsl: parsedPlan.plan,
      originalPlanDsl: rawPlanDsl,
      loweredProgram: loweredPlanDsl.program,
      normalizedProgram: compiled.program,
      loweredPlan: compiled.loweredPlan,
      diagnostics: compiled.diagnostics,
      dryRun: compiled.dryRun,
      validationReport: compiled.validationReport,
      repairHistory: [],
    },
    loweredPlan: compiled.loweredPlan,
    validationReport: compiled.validationReport,
    repairHistory: [],
    planDsl: parsedPlan.plan,
    prompt,
    promptAssembly,
    cacheCheckpoint,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function compileWorkflowArtifactFromProgramIr(input: CompileWorkflowArtifactFromProgramIrInput): Promise<WorkflowCompilerRunResult> {
  const promptParts = buildWorkflowProgramIrPromptParts({
    userRequest: input.input.userRequest,
    workspaceSummary: workflowCompilerWorkspaceSummary(input.input.workspaceSummary, input.compileContext.capabilityDiscoverySummary),
    toolDescriptors: input.compileToolDescriptors,
    ambientCliCapabilities: input.ambientCliCapabilities,
    connectorDescriptors: input.compileConnectorDescriptors,
    selectedRecipes: input.selectedRecipes,
    discoveryQuestions: input.compileContext.discoveryQuestions,
    explorationTraces: input.compileContext.explorationTraces,
    graphSnapshot: input.compileContext.graphSnapshot,
    debugRewriteContext: input.input.debugRewriteContext,
    callableWorkflowInvocation: input.compileContext.callableWorkflowInvocation,
    workflowThreadId: input.input.workflowThreadId,
    revisionId: input.input.revisionId,
  });
  const { prompt, promptAssembly, cacheCheckpoint } = promptParts;
  input.emitProgress({
    phase: "prompt",
    status: "completed",
    message: "Built the WorkflowProgramIR compiler prompt.",
    current: 2,
    metrics: {
      promptChars: prompt.length,
      stablePrefixTokens: cacheCheckpoint.stablePrefixEstimatedTokens,
      mutableSuffixTokens: cacheCheckpoint.mutableSuffixEstimatedTokens,
      availableToolCount: input.capabilitySelection.availableToolCount,
      selectedToolCount: input.capabilitySelection.selectedToolNames.length,
      availableConnectorCount: input.connectorSelection.availableConnectorCount,
      selectedConnectorCount: input.connectorSelection.selectedConnectorIds.length,
      selectedConnectorOperationCount: input.connectorSelection.selectedOperationCount,
      selectedRecipeCount: input.selectedRecipes.length,
      selectedRecipeIds: input.selectedRecipes.map((recipe) => recipe.id).join(","),
      rejectedRecipeCount: input.recipeSelection.rejected.length,
      rejectedRecipeIds: input.recipeSelection.rejected.map((recipe) => recipe.id).join(","),
      recipeSelectionConfidence: input.recipeSelection.summary.confidence,
      recipePolicyImplicationCount: input.recipeSelection.policyImplications.length,
      callableWorkflowInvocation: Boolean(input.compileContext.callableWorkflowInvocation),
      compilerMode: "program_ir",
      promptModuleCount: promptAssembly.total.moduleCount,
      promptStableModuleCount: promptAssembly.stablePrefix.moduleCount,
      promptMutableModuleCount: promptAssembly.mutableSuffix.moduleCount,
    },
  });
  const startedAt = new Date().toISOString();
  input.emitProgress({
    phase: "model",
    status: "running",
    message: "Planning the workflow program IR.",
    detail: input.model,
    current: 3,
    metrics: { compilerMode: "program_ir" },
  });
  const rawProgram = await input.provider.compileProgramIr({
    prompt,
    model: input.model,
    cacheCheckpoint,
    onProgress: workflowCompilerModelProgress(input.emitProgress, {
      runningMessage: "Planning the workflow program IR.",
      streamingMessage: "Receiving the workflow program IR.",
      thinkingMessage: "Pi is planning the workflow program IR.",
    }),
  });
  input.emitProgress({
    phase: "model",
    status: "completed",
    message: "Received the workflow program IR.",
    current: 3,
    metrics: { rawResponseChars: roughJsonCharCount(rawProgram), compilerMode: "program_ir" },
  });
  input.emitProgress({
    phase: "validated",
    status: "running",
    message: "Compiling, code-generating, and dry-running the workflow program IR.",
    current: 4,
    metrics: { compilerMode: "program_ir" },
  });
  const { compiled, program, repairHistory } = await compileWorkflowProgramIrWithRepair({
    program: rawProgram,
    input,
  });
  input.emitProgress({
    phase: "validated",
    status: "completed",
    message: "Workflow program IR passed static validation, codegen, and dry-run.",
    current: 4,
    metrics: {
      compilerMode: "program_ir",
      graphNodeCount: compiled.output.graph?.nodes.length ?? 0,
      sourceChars: compiled.output.source.length,
      dryRunCallCount: compiled.dryRun.calls.length,
      repairAttemptCount: repairHistory.length,
      patchOperationCount: repairHistory.reduce((sum, item) => sum + item.patch.length, 0),
      compilerTotalMs: compiled.metrics.totalMs,
      staticValidationMs: compiled.metrics.staticValidationMs,
      loweringMs: compiled.metrics.loweringMs,
      codegenMs: compiled.metrics.codegenMs,
      outputValidationMs: compiled.metrics.outputValidationMs,
      dryRunMs: compiled.metrics.dryRunMs,
      validationReportStatus: compiled.validationReport.status,
      validatorCount: compiled.validationReport.validators.length,
      validationDiagnosticCount: compiled.validationReport.diagnosticSummary.diagnosticCount,
      connectorWriteOperationCount: compiled.validationReport.evidence.connectorWriteOperations.length,
      incrementalValidationNodeCount: compiled.metrics.incrementalValidation.nodeCount,
      incrementalValidationLevelCount: compiled.metrics.incrementalValidation.dependencyLevelCount,
      incrementalValidationMaxLevelWidth: compiled.metrics.incrementalValidation.maxDependencyLevelWidth,
      incrementalValidationConcurrency: compiled.metrics.incrementalValidation.validationConcurrency,
      incrementalValidationCacheHits: compiled.metrics.incrementalValidation.validationCacheHits,
      incrementalValidationCacheMisses: compiled.metrics.incrementalValidation.validationCacheMisses,
      loweredOperationCount: compiled.metrics.lowering.operationCount,
      loweringCacheHits: compiled.metrics.lowering.loweringCacheHits,
      loweringCacheMisses: compiled.metrics.lowering.loweringCacheMisses,
    },
  });
  return {
    output: compiled.output,
    raw: {
      program,
      originalProgram: rawProgram,
      normalizedProgram: compiled.program,
      loweredPlan: compiled.loweredPlan,
      diagnostics: compiled.diagnostics,
      dryRun: compiled.dryRun,
      validationReport: compiled.validationReport,
      repairHistory,
    },
    loweredPlan: compiled.loweredPlan,
    validationReport: compiled.validationReport,
    repairHistory,
    prompt,
    promptAssembly,
    cacheCheckpoint,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

const KNOWN_WORKFLOW_CONNECTOR_INTENTS: Array<{
  connectorId: string;
  label: string;
  patterns: RegExp[];
  denialPatterns: RegExp[];
}> = [
  {
    connectorId: "google.gmail",
    label: "Gmail",
    patterns: [/\bgoogle\.gmail\b/i, /\bgmail\b/i, /\bgoogle\s+mail\b/i],
    denialPatterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^.;\n]{0,120}\b(?:google\.gmail|gmail|google\s+mail|email|inbox)\b/i,
      /\b(?:google\.gmail|gmail|google\s+mail)\b[^.;\n]{0,80}\b(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    connectorId: "google.calendar",
    label: "Google Calendar",
    patterns: [
      /\bgoogle\.calendar\b/i,
      /\bgoogle\s+calendar\b/i,
      /\bgoogle\s+(?:meet|meeting|meetings)\b/i,
      /\bgoogle\s+meet\s+transcripts?\b/i,
    ],
    denialPatterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^.;\n]{0,120}\b(?:google\.calendar|google\s+calendar|calendar)\b/i,
      /\b(?:google\.calendar|google\s+calendar|calendar)\b[^.;\n]{0,80}\b(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    connectorId: "google.drive",
    label: "Google Drive",
    patterns: [
      /\bgoogle\.drive\b/i,
      /\bgoogle\s+drive\b/i,
      /\bgoogle\s+docs\b/i,
      /\bgoogle\s+sheets\b/i,
      /\bgoogle\s+slides\b/i,
      /\bgoogle\s+(?:meet|meeting|meetings)\b/i,
      /\bgoogle\s+meet\s+transcripts?\b/i,
    ],
    denialPatterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^.;\n]{0,120}\b(?:google\.drive|google\s+drive|drive|google\s+docs|docs|sheets|slides)\b/i,
      /\b(?:google\.drive|google\s+drive|drive|google\s+docs|docs|sheets|slides)\b[^.;\n]{0,80}\b(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    connectorId: "slack.workspace",
    label: "Slack",
    patterns: [/\bslack\.workspace\b/i, /\bslack\b/i, /\bslack\s+(?:workspace|channel|channels|message|messages|thread|threads)\b/i],
    denialPatterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^.;\n]{0,120}\b(?:slack\.workspace|slack)\b/i,
      /\b(?:slack\.workspace|slack)\b[^.;\n]{0,80}\b(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
  {
    connectorId: "github.repository",
    label: "GitHub",
    patterns: [
      /\bgithub\.repository\b/i,
      /\bgithub\s+connector\b/i,
      /\bgithub\s+(?:issues?|pull\s+requests?|prs?|notifications?|repositories?|repos?)\b/i,
      /\b(?:issues?|pull\s+requests?|prs?|notifications?)\b[^.;\n]{0,80}\bgithub\b/i,
    ],
    denialPatterns: [
      /\b(?:do\s+not|don't|dont|not|no|without|avoid|exclude|skip|forbid|forbidden|disallow|disallowed)\b[^.;\n]{0,120}\b(?:github\.repository|github)\b/i,
      /\b(?:github\.repository|github)\b[^.;\n]{0,80}\b(?:not|unavailable|out\s+of\s+scope|off\s+limits|forbidden|disallowed)\b/i,
    ],
  },
];

function workflowKnownRequestedConnectorIds(input: {
  userRequest: string;
  discoveryQuestions?: WorkflowDiscoveryQuestion[];
  graphSnapshot?: WorkflowGraphSnapshot;
  explorationTraces?: WorkflowExplorationTraceSummary[];
}): string[] {
  const corpus = [
    input.userRequest,
    ...(input.discoveryQuestions ?? []).flatMap((question) => [
      question.context,
      question.question,
      question.answer?.choiceId,
      question.answer?.freeform,
      question.graphImpact,
    ]),
    ...(input.graphSnapshot?.nodes ?? []).flatMap((node) => [
      node.label,
      node.inputSummary,
      node.outputSummary,
      ...(node.connectorIds ?? []),
    ]),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  const ids = new Set<string>();
  for (const intent of KNOWN_WORKFLOW_CONNECTOR_INTENTS) {
    if (intent.denialPatterns.some((pattern) => pattern.test(corpus))) continue;
    if (intent.patterns.some((pattern) => pattern.test(corpus))) ids.add(intent.connectorId);
  }
  return [...ids];
}

function assertRequiredConnectorsAvailable(input: {
  requestedConnectorIds: string[];
  availableConnectorDescriptors: WorkflowConnectorDescriptor[];
  selectedConnectorIds: string[];
}): void {
  if (!input.requestedConnectorIds.length) return;
  const connectorsById = new Map(input.availableConnectorDescriptors.map((descriptor) => [descriptor.id, descriptor]));
  const selectedConnectorIds = new Set(input.selectedConnectorIds);
  const failures = input.requestedConnectorIds.flatMap((connectorId) => {
    const descriptor = connectorsById.get(connectorId);
    const label = KNOWN_WORKFLOW_CONNECTOR_INTENTS.find((intent) => intent.connectorId === connectorId)?.label ?? connectorId;
    if (!descriptor) return [`${label} (${connectorId}) is not registered in this Desktop session`];
    if (descriptor.auth.status !== "available") return [`${label} (${connectorId}) is ${descriptor.auth.status}`];
    if (descriptor.auth.type !== "none" && descriptor.accounts.length === 0) return [`${label} (${connectorId}) has no connected account`];
    if (!selectedConnectorIds.has(connectorId)) return [`${label} (${connectorId}) was not selected for this compile`];
    return [];
  });
  if (!failures.length) return;
  throw new Error(
    [
      `Workflow connector is not available: ${failures.join("; ")}.`,
      "Connect the requested account or launch with a credentialed snapshot before compiling this workflow.",
      "Ambient Desktop will not substitute workspace.inventory, browser, raw Google Workspace tools, or local files for an explicitly requested first-party connector.",
    ].join(" "),
  );
}

function assertRequestedBuiltinToolsAvailable(input: {
  requestedToolIntents: WorkflowCompilerRequiredBuiltinToolIntent[];
  availableToolDescriptors: DesktopToolDescriptor[];
  selectedToolNames: string[];
  blockedToolNames: string[];
}): void {
  if (!input.requestedToolIntents.length) return;
  const availableToolNames = new Set(input.availableToolDescriptors.map((descriptor) => descriptor.name));
  const selectedToolNames = new Set(input.selectedToolNames);
  const blockedToolNames = new Set(input.blockedToolNames);
  const failures = input.requestedToolIntents.flatMap((intent) => {
    if (blockedToolNames.has(intent.toolName)) return [`${intent.label} (${intent.toolName}) is blocked by current capability policy`];
    if (!availableToolNames.has(intent.toolName)) return [`${intent.label} (${intent.toolName}) is not registered in this Desktop session`];
    if (!selectedToolNames.has(intent.toolName)) return [`${intent.label} (${intent.toolName}) was not selected for this compile`];
    return [];
  });
  if (!failures.length) return;
  const substituteText = uniqueStrings(input.requestedToolIntents.flatMap((intent) => intent.forbiddenSubstitutes));
  const repairHints = uniqueStrings(input.requestedToolIntents.map((intent) => intent.repairHint));
  throw new Error(
    [
      `Workflow capability is not available: ${failures.join("; ")}.`,
      repairHints.join(" "),
      `Ambient Desktop will not substitute ${substituteText.join(", ")} for an explicitly requested built-in workflow capability.`,
    ].join(" "),
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function workflowCompilerJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function envFlag(name: string): boolean {
  const raw = process.env[name];
  return raw === "1" || raw?.toLowerCase() === "true" || raw?.toLowerCase() === "yes";
}

function roughJsonCharCount(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}
