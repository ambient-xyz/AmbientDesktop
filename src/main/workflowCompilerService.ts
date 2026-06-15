import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { normalizeAmbientModelId } from "../shared/ambientModels";
import { workflowGraphFromSpec } from "../shared/workflowAgentGraph";
import type {
  WorkflowAmbientCliCapabilityGrant,
  CallableWorkflowLaunchCardSummary,
  CallableWorkflowTaskSummary,
  WorkflowCompileProgress,
  WorkflowDashboard,
  WorkflowDiscoveryQuestion,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowPromptCacheCheckpoint,
  PermissionMode,
  SearchRoutingSettings,
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
} from "../shared/types";
import { diffWorkflowGraphs } from "../shared/workflowGraphDiff";
import { searchAmbientCliCapabilities } from "./ambientCliPackages";
import type { DesktopToolDescriptor } from "./desktopToolRegistry";
import type { PluginMcpToolRegistration } from "./plugins/pluginHost";
import type { WorkflowConnectorDescriptor } from "./workflowConnectors";
import type { ProjectStore } from "./projectStore";
import { readAmbientApiKey } from "./credentialStore";
import type { AmbientRetryPolicy } from "./aggressiveRetries";
import {
  canonicalizeWorkflowGraphLayout,
  buildWorkflowCompilerCapabilityDiscoveryPrompt,
  selectWorkflowCompilerConnectorDescriptors,
  selectWorkflowCompilerToolDescriptors,
  validateWorkflowCompilerCapabilityDiscoveryOutput,
  workflowCompilerDeniedConnectorIds,
  workflowCompilerRequiredBuiltinToolIntents,
  workflowAmbientCliCapabilitiesFromSearch,
  workflowGraphWithSourceMappings,
  type WorkflowCompilerAmbientCliCapability,
  type WorkflowCompilerCapabilityDiscoveryPlan,
  type WorkflowCompilerRequiredBuiltinToolIntent,
  type WorkflowCompilerOutput,
} from "./workflowCompiler";
import { readWorkflowDashboard } from "./workflowDashboard";
import { enrichWorkflowManifestWithPluginCapabilities } from "./workflowPluginCapabilities";
import { commitWorkflowVersionRepo } from "./workflowVersioning";
import { buildWorkflowSourceDiff } from "./workflowDebugRewrite";
import { callWorkflowPiJson, callWorkflowPiText, type WorkflowPiProgress } from "./workflowPiTransport";
import { workflowPromptParts, type WorkflowPromptParts } from "./workflowPromptCache";
import {
  applyWorkflowProgramIrPatch,
  buildWorkflowProgramIrRepairPrompt,
  classifyWorkflowProgramIrRepairValidationError,
  parseWorkflowProgramIrRepairResponse,
  WorkflowProgramIrRepairRejectedError,
  type WorkflowProgramIrPatchOperation,
} from "./workflowCompilerIrRepair";
import { buildWorkflowCompilerPolicyPromptRules } from "./workflowCompilerPromptInventory";
import {
  assembleWorkflowCompilerPromptModules,
  workflowCompilerPolicyPromptModule,
  workflowCompilerPromptModule,
  type WorkflowCompilerPromptAssemblyRecord,
} from "./workflowCompilerPromptModules";
import {
  selectWorkflowCompilerRecipePlan,
  selectWorkflowCompilerRecipes,
  workflowCompilerRecipeDefinitions,
  type WorkflowCompilerRecipeSelectionResult,
  type WorkflowCompilerSelectedRecipe,
} from "./workflowCompilerRecipes";
import {
  compileWorkflowProgramIr,
  createWorkflowProgramCompileCache,
  WorkflowProgramCompileError,
  type WorkflowProgramCompileResult,
  type WorkflowProgramDiagnostic,
  type WorkflowProgramLoweredOperationPlan,
  type WorkflowProgramValidationReport,
} from "./workflowProgramCompiler";
import {
  lowerWorkflowPlanDslToProgramIr,
  parseWorkflowPlanDsl,
  workflowPlanDslPromptSchemaExample,
  type WorkflowPlanDsl,
} from "./workflowPlanDsl";
import { buildWorkflowDiscoveryPolicyContext, type WorkflowDiscoveryAmbientCliCapability } from "./workflowDiscoveryPolicy";
import {
  describeWorkflowDiscoveryCapability,
  searchWorkflowDiscoveryCapabilities,
  workflowDiscoveryCapabilityAwarePolicySummary,
} from "./workflowDiscoveryCapabilitySearch";
import type { CallableWorkflowSourceContext } from "./callableWorkflowRegistry";
import {
  callableWorkflowExecutionPlanFromTask,
  type CallableWorkflowCompilerHandoffPlan,
} from "./callableWorkflowTaskQueue";
import type { CallableWorkflowCallerProvenance } from "./callableWorkflowExecutionPlan";

export interface CompileWorkflowArtifactInput {
  store: ProjectStore;
  userRequest: string;
  workflowThreadId?: string;
  revisionId?: string;
  workspaceSummary?: string;
  toolDescriptors: DesktopToolDescriptor[];
  pluginRegistrations?: PluginMcpToolRegistration[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  explorationTraces?: WorkflowExplorationTraceSummary[];
  stateRoot: string;
  model: string;
  permissionMode?: PermissionMode;
  searchRoutingSettings?: SearchRoutingSettings;
  baseUrl?: string;
  retryPolicy?: AmbientRetryPolicy;
  debugRewriteContext?: string;
  callableWorkflowInvocation?: WorkflowCompilerCallableInvocationContext;
  provider?: WorkflowCompilerProvider;
  onProgress?: (progress: WorkflowCompileProgress) => void;
}

export const WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION =
  "ambient-workflow-compiler-callable-invocation-context-v1" as const;

export interface WorkflowCompilerCallableInvocationContext {
  schemaVersion: typeof WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION;
  taskId: string;
  launchId: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  toolName: string;
  toolId: string;
  sourceKind: string;
  blocking: boolean;
  input: Record<string, unknown>;
  launchCard?: CallableWorkflowLaunchCardSummary;
  sourceContext?: CallableWorkflowSourceContext;
  callerProvenance?: CallableWorkflowCallerProvenance;
}

export interface WorkflowCompilerProvider {
  discoverCapabilities?(input: {
    prompt: string;
    model: string;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown>;
  compileProgramIr?(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown>;
  compilePlanDsl?(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown>;
  repairProgramIr?(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    attempt: number;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown>;
}

export function workflowCompilerCallableInvocationContextFromRunnerInput(input: {
  task: CallableWorkflowTaskSummary;
  handoffPlan: CallableWorkflowCompilerHandoffPlan;
}): WorkflowCompilerCallableInvocationContext {
  const executionPlan = callableWorkflowExecutionPlanFromTask(input.task);
  return {
    schemaVersion: WORKFLOW_COMPILER_CALLABLE_INVOCATION_CONTEXT_SCHEMA_VERSION,
    taskId: input.task.id,
    launchId: input.task.launchId,
    parentThreadId: input.handoffPlan.parent.threadId,
    parentRunId: input.handoffPlan.parent.runId,
    ...(input.handoffPlan.parent.messageId ? { parentMessageId: input.handoffPlan.parent.messageId } : {}),
    toolName: input.handoffPlan.compiler.toolName,
    toolId: input.handoffPlan.compiler.toolId,
    sourceKind: input.handoffPlan.compiler.sourceKind,
    blocking: input.handoffPlan.compiler.blocking,
    input: { ...input.handoffPlan.compiler.input },
    launchCard: workflowCompilerJsonClone(input.handoffPlan.compiler.launchCard),
    sourceContext: workflowCompilerJsonClone(executionPlan.workflowRunPlan.sourceContext),
    callerProvenance: workflowCompilerJsonClone(input.handoffPlan.callerProvenance),
  };
}

const WORKFLOW_COMPILE_PROGRESS_TOTAL = 7;
const DEFAULT_WORKFLOW_COMPILER_TIMEOUT_MS = 480_000;
const DEFAULT_WORKFLOW_COMPILER_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_WORKFLOW_COMPILER_DISCOVERY_TIMEOUT_MS = 120_000;
const DEFAULT_WORKFLOW_COMPILER_DISCOVERY_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_TIMEOUT_MS = 240_000;
const DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS = 60_000;
const DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_RETRY_LIMIT = 1;
const DEFAULT_WORKFLOW_COMPILER_PARSE_RETRY_LIMIT = 1;
const DEFAULT_WORKFLOW_COMPILER_TRANSIENT_RETRY_LIMIT = 2;
const DEFAULT_WORKFLOW_PROGRAM_IR_REPAIR_RETRY_LIMIT = 2;
const DEFAULT_WORKFLOW_PROGRAM_IR_REPAIR_RESPONSE_RETRY_LIMIT = 2;

interface WorkflowCompileContext {
  discoveryQuestions: WorkflowDiscoveryQuestion[];
  explorationTraces: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
  callableWorkflowInvocation?: WorkflowCompilerCallableInvocationContext;
  recipeSelection?: WorkflowCompilerRecipeSelectionResult;
  selectedRecipes?: WorkflowCompilerSelectedRecipe[];
  capabilityDiscoverySummary?: string;
}

interface WorkflowCompilerCapabilityDiscoveryResolution {
  capabilityQueries: string[];
  requiredToolNames: string[];
  requiredConnectorIds: string[];
  blockedToolNames: string[];
  searches: WorkflowDiscoveryCapabilitySearch[];
  descriptions: WorkflowDiscoveryCapabilityDescription[];
  summary?: string;
}

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

type WorkflowProgramIrRepairHistoryEntry = {
  attempt: number;
  diagnostics: WorkflowProgramDiagnostic[];
  patch: WorkflowProgramIrPatchOperation[];
  rawPatch: unknown;
};

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
      throw new Error("Workflow compiler requires a WorkflowProgramIR provider; legacy TypeScript/source-block compiler providers are disabled for new workflow compiles.");
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
    const requiredConnectorIds = uniqueStrings([
      ...capabilityResolution.requiredConnectorIds,
      ...requestedKnownConnectorIds,
    ]).filter((connectorId) => !deniedConnectorIds.has(connectorId));
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
    const { prompt, promptAssembly, cacheCheckpoint, raw, startedAt, completedAt, repairHistory, validationReport } = compilerRun;
    const output = compilerRun.output;
    output.manifest = enrichWorkflowManifestWithPluginCapabilities(output.manifest, input.pluginRegistrations);
    const manifestJson = `${JSON.stringify(output.manifest, null, 2)}\n`;
    const specJson = `${JSON.stringify(output.spec, null, 2)}\n`;
    const sourceText = output.source.endsWith("\n") ? output.source : `${output.source}\n`;
    const loweredPlanJson = compilerRun.loweredPlan ? `${JSON.stringify(compilerRun.loweredPlan, null, 2)}\n` : undefined;
    const planDslJson = compilerRun.planDsl ? `${JSON.stringify(compilerRun.planDsl, null, 2)}\n` : undefined;
    const repairHistoryJson = `${JSON.stringify(workflowProgramIrRepairHistoryArtifact(repairHistory), null, 2)}\n`;
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

    const id = `workflow-${slugForTitle(output.title)}-${randomUUID().slice(0, 8)}`;
    const artifactRoot = join(input.stateRoot, "workflows", id);
    emitProgress({
      phase: "persisted",
      status: "running",
      message: "Writing workflow artifact files.",
      detail: artifactRoot,
      current: 5,
    });
    await mkdir(join(artifactRoot, "reports"), { recursive: true });
    await writeFile(join(artifactRoot, "manifest.json"), manifestJson, "utf8");
    await writeFile(join(artifactRoot, "spec.json"), specJson, "utf8");
    await writeFile(join(artifactRoot, "main.ts"), sourceText, "utf8");
    await writeFile(join(artifactRoot, "preview.md"), preview, "utf8");
    await writeFile(join(artifactRoot, "compile-context.json"), `${JSON.stringify(compileContextArtifact(compileContext, cacheCheckpoint, promptAssembly), null, 2)}\n`, "utf8");
    await writeFile(join(artifactRoot, "prompt-assembly.json"), promptAssemblyJson, "utf8");
    await writeFile(join(artifactRoot, "repair-history.json"), repairHistoryJson, "utf8");
    await writeFile(join(artifactRoot, "validation-report.json"), validationReportJson, "utf8");
    await writeFile(join(artifactRoot, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
    if (loweredPlanJson) await writeFile(join(artifactRoot, "lowered-plan.json"), loweredPlanJson, "utf8");
    if (planDslJson) await writeFile(join(artifactRoot, "plan-dsl.json"), planDslJson, "utf8");
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
        repairAttemptCount: repairHistory.length,
        patchOperationCount: repairHistory.reduce((sum, item) => sum + item.patch.length, 0),
        ...(planDslJson ? { planDslBytes: Buffer.byteLength(planDslJson) } : {}),
        ...(loweredPlanJson ? { loweredPlanBytes: Buffer.byteLength(loweredPlanJson) } : {}),
      },
    });

    emitProgress({
      phase: "recorded",
      status: "running",
      message: "Recording the preview run and audit trail.",
      current: 6,
    });
    const artifact = input.store.createWorkflowArtifact({
      id,
      workflowThreadId: input.workflowThreadId,
      title: output.title,
      status: "ready_for_preview",
      manifest: output.manifest,
      spec: output.spec,
      sourcePath: join(artifactRoot, "main.ts"),
      statePath: join(artifactRoot, "state.json"),
    });
    const graphSnapshot = input.store.createWorkflowGraphSnapshot({
      workflowThreadId: artifact.workflowThreadId!,
      source: "compile",
      summary: graph.summary,
      nodes: graph.nodes,
      edges: graph.edges,
      artifactPath: join(artifactRoot, "graph.json"),
    });
    const versionCommit = await commitWorkflowVersionRepo({
      repoPath: artifactRoot,
      message: `Create workflow version for ${output.title}`,
    });
    const version = input.store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      graphSnapshotId: graphSnapshot.id,
      sourcePath: artifact.sourcePath,
      repoPath: artifactRoot,
      gitCommitHash: versionCommit.commitHash,
      status: "ready_for_review",
      createdBy: "compiler",
    });
    if (input.revisionId) {
      updateCompiledWorkflowRevision(input.store, {
        revisionId: input.revisionId,
        proposedArtifactId: artifact.id,
        proposedGraphSnapshot: graphSnapshot,
      });
    }
    const run = input.store.startWorkflowRun({ artifactId: artifact.id, status: "previewed" });
    input.store.appendWorkflowRunEvent({
      runId: run.id,
      type: "workflow.compile",
      message: "Ambient planned a WorkflowProgramIR preview artifact.",
      data: {
        sourcePath: artifact.sourcePath,
        previewPath: join(artifactRoot, "preview.md"),
        graphPath: join(artifactRoot, "graph.json"),
        ...(planDslJson ? { planDslPath: join(artifactRoot, "plan-dsl.json") } : {}),
        ...(loweredPlanJson ? { loweredPlanPath: join(artifactRoot, "lowered-plan.json") } : {}),
        compileContextPath: join(artifactRoot, "compile-context.json"),
        promptAssemblyPath: join(artifactRoot, "prompt-assembly.json"),
        repairHistoryPath: join(artifactRoot, "repair-history.json"),
        validationReportPath: join(artifactRoot, "validation-report.json"),
        repairAttemptCount: repairHistory.length,
        patchOperationCount: repairHistory.reduce((sum, item) => sum + item.patch.length, 0),
        discoveryAnswerCount: compileContext.discoveryQuestions?.filter((question) => question.answer).length ?? 0,
        explorationTraceCount: compileContext.explorationTraces.length,
        inputGraphSnapshotId: compileContext.graphSnapshot?.id,
        selectedRecipeIds: selectedRecipes.map((recipe) => recipe.id),
        rejectedRecipeIds: recipeSelection.rejected.map((recipe) => recipe.id),
        recipePolicyImplicationIds: recipeSelection.policyImplications.map((implication) => implication.id),
        callableWorkflowInvocation: compileContext.callableWorkflowInvocation
          ? workflowCompilerCallableInvocationEventSnapshot(compileContext.callableWorkflowInvocation)
          : undefined,
        cacheCheckpoint,
        versionId: version.id,
        version: version.version,
        gitCommitHash: version.gitCommitHash,
      },
    });
    input.store.appendWorkflowRunEvent({
      runId: run.id,
      type: "workflow.validate",
      message: "WorkflowProgramIR artifact passed deterministic validation.",
      data: {
        tools: output.manifest.tools,
        compilerMode: "program_ir",
        validationMode: "program_ir_artifact",
        validationReportPath: join(artifactRoot, "validation-report.json"),
        validationReportStatus: validationReport.status,
        validatorCount: validationReport.validators.length,
        validationDiagnosticCount: validationReport.diagnosticSummary.diagnosticCount,
        connectorWriteOperationCount: validationReport.evidence.connectorWriteOperations.length,
      },
    });
    input.store.recordWorkflowModelCall({
      runId: run.id,
      task: "workflow.compiler",
      status: "succeeded",
      input: {
        userRequest: input.userRequest,
        workspaceSummary: input.workspaceSummary,
        discoveryQuestions: compileContext.discoveryQuestions,
        explorationTraces: compileContext.explorationTraces,
        graphSnapshot: compileContext.graphSnapshot,
        debugRewriteContext: input.debugRewriteContext,
        capabilityDiscoveryPlan: capabilityDiscovery.plan,
        capabilityDiscoverySearches: capabilityResolution.searches,
        capabilityDiscoveryDescriptions: capabilityResolution.descriptions,
        capabilityDiscoverySummary: capabilityResolution.summary,
        capabilityDiscoveryFallback: capabilityDiscovery.fallback,
        selectedToolNames: capabilitySelection.selectedToolNames,
        availableToolCount: capabilitySelection.availableToolCount,
        selectedConnectorIds: connectorSelection.selectedConnectorIds,
        availableConnectorCount: connectorSelection.availableConnectorCount,
        selectedRecipes,
        recipeSelection,
        callableWorkflowInvocation: compileContext.callableWorkflowInvocation,
        prompt,
        promptAssembly,
      },
      output: raw,
      cacheCheckpoint,
      model,
      startedAt,
      completedAt,
    });
    emitProgress({
      phase: "recorded",
      status: "completed",
      message: "Recorded the workflow preview run.",
      current: 6,
      metrics: { artifactId: artifact.id, runId: run.id },
    });
    emitProgress({
      phase: "completed",
      status: "completed",
      message: "Workflow preview is ready for review.",
      current: 7,
      metrics: { artifactId: artifact.id, runId: run.id },
    });
    return readWorkflowDashboard(input.store);
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

function isWorkflowProgramIrProvider(
  provider: WorkflowCompilerProvider,
): provider is WorkflowCompilerProvider & {
  compileProgramIr: NonNullable<WorkflowCompilerProvider["compileProgramIr"]>;
} {
  return typeof provider.compileProgramIr === "function";
}

function isWorkflowPlanDslProvider(
  provider: WorkflowCompilerProvider,
): provider is WorkflowCompilerProvider & {
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
  provider: CompileWorkflowArtifactFromProgramIrInput["provider"] & { compilePlanDsl: NonNullable<WorkflowCompilerProvider["compilePlanDsl"]> };
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

async function compileWorkflowProgramIrWithRepair(input: {
  program: unknown;
  input: CompileWorkflowArtifactFromProgramIrInput;
}): Promise<{
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
          "Return only JSON in this exact shape: {\"repairOperations\":[...]}",
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

function validateCompiledWorkflowProgramRecipeContracts(
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
  const outputDirs = uniqueStrings([...((input.artifactDirs ?? []).filter(Boolean)), process.env.AMBIENT_WORKFLOW_PROGRAM_IR_FAILURE_ARTIFACT_DIR?.trim() ?? ""]);
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

function workflowProgramIrFailureArtifactDirs(input: CompileWorkflowArtifactFromProgramIrInput): string[] {
  const workflowThreadId = input.input.workflowThreadId ?? input.input.revisionId ?? input.input.userRequest;
  return [join(input.input.stateRoot, "workflow-compile-failures", slugForTitle(workflowThreadId))];
}

function workflowProgramIrFailureArtifactContext(input: CompileWorkflowArtifactFromProgramIrInput): Record<string, unknown> {
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

function workflowProgramToolDescriptorsForProgram(input: {
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
    if (typeof record.tool === "string" && (record.kind === "tool.call" || record.kind === "mutation.stage" || record.kind === "browser.intervention")) {
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
  repairProgramIr: NonNullable<WorkflowCompilerProvider["repairProgramIr"]>;
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
	    patterns: [/\bgoogle\.calendar\b/i, /\bgoogle\s+calendar\b/i, /\bgoogle\s+(?:meet|meeting|meetings)\b/i, /\bgoogle\s+meet\s+transcripts?\b/i],
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
    ...(input.graphSnapshot?.nodes ?? []).flatMap((node) => [node.label, node.inputSummary, node.outputSummary, ...(node.connectorIds ?? [])]),
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

function workflowCompilerCallableInvocationEventSnapshot(
  invocation: WorkflowCompilerCallableInvocationContext,
): Record<string, unknown> {
  return {
    schemaVersion: invocation.schemaVersion,
    taskId: invocation.taskId,
    launchId: invocation.launchId,
    parentThreadId: invocation.parentThreadId,
    parentRunId: invocation.parentRunId,
    ...(invocation.parentMessageId ? { parentMessageId: invocation.parentMessageId } : {}),
    toolName: invocation.toolName,
    toolId: invocation.toolId,
    sourceKind: invocation.sourceKind,
    blocking: invocation.blocking,
    ...(invocation.callerProvenance
      ? {
          callerKind: invocation.callerProvenance.kind,
          callerThreadId: invocation.callerProvenance.threadId,
          callerRunId: invocation.callerProvenance.runId,
          callerWorktreeIsolated: invocation.callerProvenance.worktree.isolated,
          callerApprovalRequired: invocation.callerProvenance.approval.required,
          callerApprovalSource: invocation.callerProvenance.approval.source,
        }
      : {}),
    inputKeys: Object.keys(invocation.input),
    ...(invocation.sourceContext?.kind === "recorded_workflow"
      ? {
          recordedWorkflow: {
            playbookId: invocation.sourceContext.playbookId,
            playbookVersion: invocation.sourceContext.playbookVersion,
            compactInvocationArtifact: invocation.sourceContext.callableInvocation?.invocationArtifact,
            diagnosticsTraceArtifact: invocation.sourceContext.callableInvocation?.diagnosticsTraceArtifact,
          },
        }
      : {}),
    ...(invocation.sourceContext?.kind === "symphony_recipe"
      ? {
          symphonyRecipe: {
            recipeId: invocation.sourceContext.recipeId,
            recipeSchemaVersion: invocation.sourceContext.recipeSchemaVersion,
            stepSelectionCount: invocation.sourceContext.invocationCustomization?.stepSelections.length ?? 0,
            metricCriteriaIds: invocation.sourceContext.invocationCustomization?.metricCriteria.map((criterion) => criterion.templateId) ?? [],
          },
        }
      : {}),
  };
}

function workflowCompilerJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
          ...(report.firstDiagnosticValidAlternatives ? { failureValidAlternatives: compactMetricString(report.firstDiagnosticValidAlternatives) } : {}),
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

function workflowCompilerModelProgress(
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

function streamWorkflowCompilerGraphSnapshot(
  input: CompileWorkflowArtifactInput,
  graph: NonNullable<WorkflowCompilerOutput["graph"]> | undefined,
): void {
  if (!input.workflowThreadId || !graph) return;
  try {
    input.store.createWorkflowGraphSnapshot({
      workflowThreadId: input.workflowThreadId,
      source: "compile",
      summary: graph.summary,
      nodes: graph.nodes,
      edges: graph.edges,
      activate: true,
    });
  } catch {
    // The final artifact persistence path is authoritative; graph streaming is best effort.
  }
}

async function discoverWorkflowCompilerCapabilities(input: {
  provider: WorkflowCompilerProvider;
  model: string;
  input: CompileWorkflowArtifactInput;
  compileContext: WorkflowCompileContext;
  emitProgress: (progress: Omit<WorkflowCompileProgress, "compileId" | "createdAt" | "total">) => void;
}): Promise<{ plan?: WorkflowCompilerCapabilityDiscoveryPlan; fallback: boolean }> {
  if (!input.provider.discoverCapabilities) return { fallback: false };
  input.emitProgress({
    phase: "context",
    status: "running",
    message: "Discovering compiler capability needs.",
    current: 1,
  });
  const prompt = buildWorkflowCompilerCapabilityDiscoveryPrompt({
    userRequest: input.input.userRequest,
    workspaceSummary: input.input.workspaceSummary,
    discoveryQuestions: input.compileContext.discoveryQuestions,
    explorationTraces: input.compileContext.explorationTraces,
    graphSnapshot: input.compileContext.graphSnapshot,
  });
  try {
    const raw = await input.provider.discoverCapabilities({
      prompt,
      model: input.model,
      onProgress: ({ outputChars, thinkingChars = 0, elapsedMs, idleElapsedMs, idleTimeoutMs, absoluteTimeoutMs, timeoutMode, stage }) =>
        input.emitProgress({
          phase: "context",
          status: "running",
          message:
            outputChars > 0
              ? "Receiving compiler capability discovery response."
              : thinkingChars > 0
                ? "Pi is selecting compiler capability queries."
                : "Discovering compiler capability needs.",
          current: 1,
          metrics: {
            capabilityDiscoveryResponseChars: outputChars,
            thinkingChars,
            ...(elapsedMs !== undefined ? { providerElapsedMs: elapsedMs } : {}),
            ...(idleElapsedMs !== undefined ? { idleElapsedMs } : {}),
            ...(idleTimeoutMs !== undefined ? { idleTimeoutMs } : {}),
            ...(absoluteTimeoutMs !== undefined ? { absoluteTimeoutMs } : {}),
            ...(timeoutMode ? { timeoutMode } : {}),
            ...(stage ? { providerStage: stage } : {}),
          },
        }),
    });
    const plan = validateWorkflowCompilerCapabilityDiscoveryOutput(raw);
    input.emitProgress({
      phase: "context",
      status: "running",
      message: "Resolved compiler capability queries.",
      current: 1,
      metrics: {
        capabilityQueryCount: plan.queries.length,
        requiredToolNameCount: plan.requiredToolNames.length,
        requiredConnectorIdCount: plan.requiredConnectorIds.length,
        openQuestionCount: plan.openQuestions.length,
      },
    });
    return { plan, fallback: false };
  } catch (error) {
    input.emitProgress({
      phase: "context",
      status: "running",
      message: "Compiler capability discovery fell back to deterministic selection.",
      current: 1,
      detail: error instanceof Error ? error.message : String(error),
      metrics: { capabilityDiscoveryFallback: true },
    });
    return { fallback: true };
  }
}

async function resolveWorkflowCompilerCapabilityDiscovery(input: {
  input: CompileWorkflowArtifactInput;
  compileContext: WorkflowCompileContext;
  plan?: WorkflowCompilerCapabilityDiscoveryPlan;
}): Promise<WorkflowCompilerCapabilityDiscoveryResolution> {
  const planQueries = input.plan?.queries.map((item) => item.query).filter(Boolean) ?? [];
  const searchQueries = uniqueStrings(planQueries.length ? planQueries : [input.input.userRequest]).slice(0, 6);
  const ambientCliCapabilities = await workflowAmbientCliCapabilitiesForCompile({
    workspacePath: input.input.store.getWorkspace().path,
    userRequest: [input.input.userRequest, ...searchQueries].join("\n"),
    explorationTraces: input.compileContext.explorationTraces,
  });
  const policyContext = buildWorkflowDiscoveryPolicyContext({
    projectPath: input.input.store.getWorkspace().path,
    workspacePath: input.input.store.getWorkspace().path,
    permissionMode: input.input.permissionMode ?? "workspace",
    stage: "initial_discovery",
    ...(input.input.workflowThreadId ? { workflowThreadId: input.input.workflowThreadId, threadId: input.input.workflowThreadId } : {}),
    grants: input.input.store.listPermissionGrants(),
    connectorDescriptors: input.input.connectorDescriptors,
    pluginRegistrations: input.input.pluginRegistrations,
    ambientCliCapabilities: workflowDiscoveryAmbientCliCapabilitiesFromCompiler(ambientCliCapabilities),
    ...(input.input.searchRoutingSettings ? { searchRoutingSettings: input.input.searchRoutingSettings } : {}),
    maxContentFiles: 0,
    maxContentBytes: 0,
  });
  const searches = searchQueries.map((query) => searchWorkflowDiscoveryCapabilities({ query, context: policyContext, limit: 6 }));
  const requiredToolNames = new Set(input.plan?.requiredToolNames ?? []);
  const requiredConnectorIds = new Set(input.plan?.requiredConnectorIds ?? []);
  const blockedToolNames = new Set<string>();

  for (const search of searches) {
    for (const result of search.results) {
      if (result.recommendation === "blocked") {
        if (result.kind === "browser_fallback") {
          blockedToolNames.add("browser_search");
          blockedToolNames.add("browser_nav");
          blockedToolNames.add("browser_content");
          blockedToolNames.add("browser_eval");
          blockedToolNames.add("browser_keypress");
          blockedToolNames.add("browser_login");
          blockedToolNames.add("browser_screenshot");
          blockedToolNames.add("browser_pick");
        }
        continue;
      }
      if (result.kind === "connector" && result.connectorId) requiredConnectorIds.add(result.connectorId);
      if (result.kind === "plugin_tool" && result.registeredToolName) requiredToolNames.add(result.registeredToolName);
      if (result.kind === "ambient_cli") requiredToolNames.add("ambient_cli");
      if (result.kind === "browser_fallback") requiredToolNames.add("browser_search");
      if (result.kind === "base_directory") requiredToolNames.add("local_directory_list");
    }
  }

  const descriptions = workflowCompilerCapabilityDescriptions(policyContext, searches);
  const summary = workflowCompilerCapabilitySearchSummary(policyContext, searches, descriptions);
  return {
    capabilityQueries: uniqueStrings([...planQueries, ...searches.flatMap((search) => search.results.map((result) => result.label))]).slice(0, 12),
    requiredToolNames: uniqueStrings([...requiredToolNames]),
    requiredConnectorIds: uniqueStrings([...requiredConnectorIds]),
    blockedToolNames: uniqueStrings([...blockedToolNames]),
    searches,
    descriptions,
    ...(summary ? { summary } : {}),
  };
}

function workflowCompilerCapabilitySearchSummary(
  policyContext: ReturnType<typeof buildWorkflowDiscoveryPolicyContext>,
  searches: WorkflowDiscoveryCapabilitySearch[],
  descriptions: WorkflowDiscoveryCapabilityDescription[],
): string | undefined {
  if (!searches.length) return undefined;
  const lines = ["Workflow compiler capability search:"];
  for (const search of searches) {
    const results = search.results.length
      ? search.results
          .map((result) => `${result.label} (${result.kind.replace(/_/g, " ")}, ${result.recommendation})`)
          .join("; ")
      : "no request-specific matches";
    lines.push(`- ${search.query}: ${results}.`);
  }
  const firstSearch = searches[0];
  if (firstSearch) lines.push(workflowDiscoveryCapabilityAwarePolicySummary(policyContext, firstSearch));
  if (descriptions.length) lines.push(workflowCompilerCapabilityDescriptionSummary(descriptions));
  return lines.join("\n");
}

function workflowCompilerCapabilityDescriptions(
  policyContext: ReturnType<typeof buildWorkflowDiscoveryPolicyContext>,
  searches: WorkflowDiscoveryCapabilitySearch[],
): WorkflowDiscoveryCapabilityDescription[] {
  const candidates = searches
    .flatMap((search, searchIndex) =>
      search.results.map((result, resultIndex) => ({
        query: search.query,
        result,
        order: searchIndex * 100 + resultIndex,
        priority:
          result.recommendation === "blocked"
            ? 0
            : result.recommendation === "recommended"
              ? 1
              : result.recommendation === "available"
                ? 2
                : 3,
      })),
    )
    .sort((left, right) => left.priority - right.priority || left.order - right.order);
  const descriptions: WorkflowDiscoveryCapabilityDescription[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.result.id)) continue;
    seen.add(candidate.result.id);
    const description = describeWorkflowDiscoveryCapability({
      capabilityId: candidate.result.id,
      query: candidate.query,
      context: policyContext,
    });
    if (description) descriptions.push(description);
    if (descriptions.length >= 4) break;
  }
  return descriptions;
}

function workflowCompilerCapabilityDescriptionSummary(descriptions: WorkflowDiscoveryCapabilityDescription[]): string {
  const lines = ["Workflow compiler capability descriptions:"];
  for (const description of descriptions) {
    const details = [
      `policy: ${description.policy}`,
      description.inputShapeSummary ? `input: ${description.inputShapeSummary}` : undefined,
      description.outputShapeSummary ? `output: ${description.outputShapeSummary}` : undefined,
      description.accountSummary ? `accounts: ${description.accountSummary}` : undefined,
      description.availabilitySummary ? `availability: ${description.availabilitySummary}` : undefined,
      description.warnings.length ? `warnings: ${description.warnings.slice(0, 3).join(" ")}` : undefined,
    ].filter((item): item is string => Boolean(item));
    lines.push(
      `- ${description.label} (${description.kind.replace(/_/g, " ")}, ${description.recommendation}, ${description.mutationClass}): ${details.join(" ")}`,
    );
  }
  return lines.join("\n");
}

function workflowCompilerWorkspaceSummary(base: string | undefined, capabilityDiscoverySummary: string | undefined): string | undefined {
  return [base?.trim(), capabilityDiscoverySummary?.trim()].filter(Boolean).join("\n\n") || undefined;
}

function workflowDiscoveryAmbientCliCapabilitiesFromCompiler(
  capabilities: WorkflowCompilerAmbientCliCapability[],
): WorkflowDiscoveryAmbientCliCapability[] {
  return capabilities.map((capability) => ({
    ...capability,
    availabilityReason:
      capability.availability === "available"
        ? "Installed Ambient CLI package is available; execution still requires ambient_cli approval."
        : "Installed Ambient CLI package matched discovery but is unavailable.",
  }));
}

function workflowCompileContext(
  store: ProjectStore,
  workflowThreadId: string,
): WorkflowCompileContext {
  const discoveryQuestions = store.listWorkflowDiscoveryQuestions(workflowThreadId);
  const explorationTraces = store.listWorkflowExplorationTraces(workflowThreadId).slice(0, 3);
  const graphSnapshot = store.listWorkflowGraphSnapshots(workflowThreadId)[0];
  return { discoveryQuestions, explorationTraces, graphSnapshot };
}

interface WorkflowCompilerPromptPartsInput {
  userRequest: string;
  workspaceSummary?: string;
  toolDescriptors: DesktopToolDescriptor[];
  ambientCliCapabilities?: WorkflowCompilerAmbientCliCapability[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  selectedRecipes?: WorkflowCompilerSelectedRecipe[];
  discoveryQuestions?: WorkflowDiscoveryQuestion[];
  explorationTraces?: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
  debugRewriteContext?: string;
  callableWorkflowInvocation?: WorkflowCompilerCallableInvocationContext;
  workflowThreadId?: string;
  revisionId?: string;
}

export type WorkflowCompilerPromptParts = WorkflowPromptParts & {
  promptAssembly: WorkflowCompilerPromptAssemblyRecord;
  selectedRecipes: WorkflowCompilerSelectedRecipe[];
};

export function buildWorkflowPlanDslPromptParts(input: WorkflowCompilerPromptPartsInput): WorkflowCompilerPromptParts {
  const selectedToolNames = new Set(input.toolDescriptors.map((tool) => tool.name));
  const selectedConnectorIds = new Set((input.connectorDescriptors ?? []).map((connector) => connector.id));
  const selectedRecipes =
    input.selectedRecipes ??
    selectWorkflowCompilerRecipes({
      userRequest: input.userRequest,
      workspaceSummary: input.workspaceSummary,
      selectedToolNames,
      selectedConnectorIds,
      discoveryQuestions: input.discoveryQuestions,
      explorationTraces: input.explorationTraces,
      graphSnapshot: input.graphSnapshot,
    });
  const stableModules = [
    workflowCompilerPromptModule({
      id: "core-workflow-plan-dsl-semantics",
      layer: "core",
      scope: "stable_prefix",
      reason: "Plan DSL is the high-level compiler contract before deterministic kernel lowering.",
      content: [
        "You are drafting an Ambient Desktop Workflow Plan DSL document.",
        "Return only JSON for the Workflow Plan DSL. Do not return WorkflowProgramIR, TypeScript, JavaScript, Markdown, JSON Patch, source code, or prose.",
        "The Plan DSL is high-level intent only. Ambient Desktop owns executable nodes, edges, dataflow paths, handles, tool call shapes, mutation gates, retries, and code generation.",
        "Never include raw IR keys or internals: no nodes, edges, dependsOn, fromNode, fromHandle, tool, connectorId, output.final, model.call, browser.intervention, collection.map, collection.filter, or other WorkflowProgramIR node kinds.",
        "",
        "Allowed stage kinds:",
        "- model_interaction: ask at most one user question, then synthesize a final output with Ambient.",
        "- browser_fixed_sources: read exact user-provided URLs with browser recovery, retain source evidence, optionally ask one user preference question, then synthesize.",
        "- current_web_research: collect bounded current public evidence with browser search, dedupe/map/chunk, synthesize with citations, and optionally stage a local report write.",
        "- gmail_readonly_categorization: use only for bounded read-only Gmail categorization when the user explicitly asks to search Gmail and read thread/message detail with readThread under budget. Put maxMessages/maxItems, pageSize/maxResults, maxPages, maxConcurrency, maxCategories, query, and accountId in stage.inputs when known.",
        "- gmail_metadata_review: use for metadata-only Gmail search/categorization. Do not readThread or attachments. Put maxMessages/maxItems, pageSize/maxResults, maxPages, maxCategories, query, and accountId in stage.inputs when known.",
        "- local_file_classification: classify explicitly named local files or one bounded local directory. Use stage.inputs.paths/files/filePaths for exact workspace files, or stage.inputs.directory plus maxEntries/maxDepth/metadataOnly for metadata-only directory inventory.",
        "- visual_batch_classification: list one local directory, deterministically select visible image entries by extension/name prefix, run bounded ambient_visual_analyze with task image_description, then synthesize categories from visual observations and skipped metadata.",
        "- metadata_first_review: use for metadata-only local directory review when the user explicitly requests local_directory_list, or as an alias for metadata-only Gmail review when Gmail is the source.",
        "- staged_document_export: render and stage a local file write from a prior synthesis; prefer current_web_research inputs.outputPath for current web report export.",
        "- unsupported: use when the request cannot be represented by available high-level kernels without unsafe guessing.",
        "",
        "Output and mutation semantics:",
        "- For a simple in-app HTML page, report, card, preview, or final answer, use model_interaction and an outputContract format such as html, markdown, or text.",
        "- Use staged_document_export only when the user explicitly asks to save, write, export to a local path, or otherwise mutate workspace files.",
        "- Do not infer a local file write merely from words like artifact, report, HTML, card, preview, or output.",
        "",
        "Workflow Plan DSL JSON shape:",
        JSON.stringify(workflowPlanDslPromptSchemaExample(), null, 2),
      ],
    }),
    workflowCompilerPromptModule({
      id: "workflow-plan-dsl-selected-recipes",
      layer: "recipe",
      scope: "stable_prefix",
      reason: "Selected recipes map request intent to high-level Plan DSL kernels without exposing executable IR internals.",
      selectedRecipeIds: selectedRecipes.map((recipe) => recipe.id),
      content: [
        "Selected workflow recipe hints:",
        selectedRecipes.length
          ? selectedRecipes
              .map((recipe) => `- ${recipe.id}: ${recipe.summary} Required shape: ${recipe.requiredNodeKinds.join(", ") || "none"}. Use a high-level stage kind, not raw nodes.`)
              .join("\n")
          : "No typed recipes were selected. Prefer model_interaction for a simple model/user workflow.",
      ],
    }),
    workflowCompilerPromptModule({
      id: "workflow-plan-dsl-selected-capabilities",
      layer: "capability",
      scope: "stable_prefix",
      reason: "Plan DSL can use capability availability for kernel selection without seeing executable call skeletons.",
      selectedToolNames: [...selectedToolNames].sort(),
      selectedConnectorIds: [...selectedConnectorIds].sort(),
      content: [
        "Selected capability summary:",
        workflowPlanDslToolPromptSection(input.toolDescriptors),
        "",
        workflowPlanDslConnectorPromptSection(input.connectorDescriptors),
      ],
    }),
  ];
  const mutableModules = [
    workflowCompilerPromptModule({
      id: "dynamic-workspace-summary",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Request-specific project context changes between compiles.",
      content: ["Workspace summary:", input.workspaceSummary?.trim() || "No workspace summary provided."],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-discovery-answers",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Workflow discovery answers are mutable user context.",
      content: ["", "Workflow discovery answers:", workflowProgramDiscoveryPromptSection(input.discoveryQuestions)],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-exploration-traces",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Exploration traces are request-specific capability and observation context.",
      content: ["", "Workflow exploration traces:", workflowProgramExplorationPromptSection(input.explorationTraces)],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-current-graph-plan-dsl",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Revision compiles may depend on the current graph snapshot, but the plan must stay high-level.",
      content: [
        "",
        "Current workflow graph summary:",
        input.graphSnapshot ? JSON.stringify({ summary: input.graphSnapshot.summary, nodeCount: input.graphSnapshot.nodes.length, edgeCount: input.graphSnapshot.edges.length }, null, 2) : "No workflow graph snapshot was provided.",
      ],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-debug-rewrite-context",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Failed-run rewrite context is only included for targeted debug compiles.",
      content: ["", "Workflow debug rewrite context:", input.debugRewriteContext?.trim() || "No failed-run debug rewrite context was provided."],
    }),
    ...workflowCompilerCallableInvocationPromptModules(input.callableWorkflowInvocation),
    workflowCompilerPromptModule({
      id: "dynamic-user-request",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "The user's current workflow request is the mutable task definition.",
      content: ["", "User request:", input.userRequest],
    }),
  ];
  const { stablePrefix, mutableSuffix, promptAssembly } = assembleWorkflowCompilerPromptModules({
    stableModules,
    mutableModules,
  });
  const promptParts = workflowPromptParts({
    stage: input.revisionId ? "revision_compile" : "compile",
    workflowThreadId: input.workflowThreadId,
    revisionId: input.revisionId,
    graphSnapshotId: input.graphSnapshot?.id,
    stablePrefix,
    mutableSuffix,
    boundaryLabel: "Workflow Plan DSL compiler cache checkpoint",
  });
  return { ...promptParts, promptAssembly, selectedRecipes };
}

export function buildWorkflowProgramIrPromptParts(input: WorkflowCompilerPromptPartsInput): WorkflowCompilerPromptParts {
  const selectedToolNames = new Set(input.toolDescriptors.map((tool) => tool.name));
  const selectedConnectorIds = new Set((input.connectorDescriptors ?? []).map((connector) => connector.id));
  const selectedRecipes =
    input.selectedRecipes ??
    selectWorkflowCompilerRecipes({
      userRequest: input.userRequest,
      workspaceSummary: input.workspaceSummary,
      selectedToolNames,
      selectedConnectorIds,
      discoveryQuestions: input.discoveryQuestions,
      explorationTraces: input.explorationTraces,
      graphSnapshot: input.graphSnapshot,
    });
  const hasGoogleWorkspaceTools = [
    "google_workspace_status",
    "google_workspace_call",
    "google_workspace_materialize_file",
    "google_workspace_search_methods",
  ].some((toolName) => selectedToolNames.has(toolName));
  const mutationStageToolExamples = [
    selectedToolNames.has("file_write") ? "file_write" : undefined,
    hasGoogleWorkspaceTools && selectedToolNames.has("google_workspace_materialize_file") ? "google_workspace_materialize_file" : undefined,
  ].filter((toolName): toolName is string => Boolean(toolName));
  const policyRules = buildWorkflowCompilerPolicyPromptRules({
    selectedToolNames,
    selectedConnectorIds,
    userRequest: input.userRequest,
  });
  const stableModules = [
    workflowCompilerPromptModule({
      id: "core-workflow-program-ir-semantics",
      layer: "core",
      scope: "stable_prefix",
      reason: "Always include the WorkflowProgramIR role, JSON-only contract, and supported node catalog.",
      content: [
    "You are planning an Ambient Desktop workflow as typed WorkflowProgramIR JSON.",
    "Return only JSON. Do not generate TypeScript, JavaScript, Markdown, patches, or prose.",
    "Ambient Desktop will compile, typecheck, code-generate, dry-run, and persist the workflow deterministically.",
    "",
    "Allowed node kinds:",
    "- tool.call: use for tools.* calls with literal tool names from the selected capabilities.",
    "- tool.paginate: use for bounded fan-out over a read-only tool that declares pagination metadata. Include tool, input, pageQueries for non-cursor query fan-out, maxItems, maxPages, optional pageSize, optional itemsPath, optional queryInputPath/pageSizeInputPath, and optional dedupeKeyPath. browser_search returns a root array, so use itemsPath:\"\" plus queryInputPath:\"query\" and pageSizeInputPath:\"maxResults\".",
    "- browser.intervention: use for browser_search/browser_nav/browser_content/browser_login calls that may hit CAPTCHA/login/MFA/consent. Desktop will call the browser tool with waitForUserAction:false, pause only if browser user-action state is returned, and offer completed/skip choices. Search/nav/content retries the same operation with userActionId; browser_login should normally use retry.maxAttempts:0 and let a downstream browser_content step verify the logged-in page. Use skipIf to avoid a later browser read when an earlier browser.intervention was skipped.",
    "- connector.call: use for connectors.call with literal connectorId and operation from selected connector capabilities. Include input, optional accountId, optional idempotencyKey, and optional output schema.",
    "- connector.paginate: use for bounded cursor/page-token retrieval from a connector operation that declares pagination metadata. Include connectorId, operation, input, maxItems, maxPages, optional pageSize, and optional dedupeKeyPath. Use this for requests like 300 Gmail messages rather than inventing loop logic.",
    "- connector.map: use for bounded parallel connector fan-out over an array from a prior node. Include connectorId, operation, items, itemName, input using {\"fromItem\":\"item\",\"path\":\"field\"}, maxItems, and optional maxConcurrency capped at 4 unless there is a specific reason.",
    "- collection.map: use for deterministic bounded reshaping of an array from a prior node. Include items, itemName, map, and maxItems. Use this to strip large connector records down to the fields needed before chunking or model calls.",
    "- collection.filter: use for deterministic bounded selection of an array from a prior node by file extension or file-name rules before downstream fan-out. Include items, maxItems, optional includeExtensions, includeNamePrefixes, excludeNamePrefixes, excludeNameIncludes, and requireFile.",
    "- collection.dedupe: use for deterministic source-quality deduplication before downstream fan-out. Include items, optional keyPath, strategy:\"exact\"|\"url_canonical\", and maxItems. It outputs items/count/sourceCount/duplicateCount/truncated/maxItems/keyPath/strategy.",
    "- collection.chunk: use for deterministic chunking before repeated model reasoning. Include items, chunkSize, and maxChunks. It outputs chunks with {id,index,start,end,count,items}.",
    "- document.render: use for deterministic Markdown, HTML, or PDF report artifacts. Include input, optional title, format:\"markdown\"|\"html\"|\"pdf\", and optional path. It outputs artifactPath/path/content/bytes/mimeType; follow it with mutation.stage file_write when the user asked to store a local file.",
    "- model.call: use for Ambient reasoning. Include output.schema; Desktop will generate ambient.call with outputContract inside input.",
    "- model.map: use for bounded parallel Ambient reasoning over chunks/items. Include items, itemName, task, input using {\"fromItem\":\"item\",\"path\":\"field\"}, output.schema, maxItems, and maxConcurrency capped at 4.",
    "- model.reduce: use for final Ambient synthesis over model.map outputs. Include items, task, input, output.schema, and maxInputItems. For more than one bounded fan-in worth of summaries, set strategy:\"tree\" with maxFanIn 4-16 and maxLevels high enough to converge. Do not feed hundreds of raw connector records into one model.call.",
    "- checkpoint.write: persist named intermediate values.",
    `- mutation.stage: use for workspace-writing selected tools${mutationStageToolExamples.length ? ` such as ${mutationStageToolExamples.join(" or ")}` : ""}. Include tool, args, and optional changeSet; Desktop will generate workflow.stageMutation. Do not add approval.required after mutation.stage; the staged mutation itself is the approval gate.`,
    "- review.input: pause for structured user input with prompt, choices, allowFreeform, and optional bounded data; Desktop will generate workflow.askUser.",
    "- approval.required: pause for approval of a proposed changeSet without applying it; mutation.stage already includes approval for workspace writes, so never chain approval.required to approve a staged mutation output.",
    "- branch.if: select a deterministic value from condition, then, and optional else expressions. Use for conditional data shaping, not arbitrary code.",
    "- loop.map: map deterministic item data through a value/template expression, or perform bounded fan-out over a selected read-only/run-process tool by setting map to a nested tool.call. Use {\"fromItem\":\"item\",\"path\":\"field\"} inside map.args; keep maxItems bounded and maxConcurrency capped at 4.",
    "- transform.template: render deterministic text from prior node outputs.",
    "- error.handle: wrap a risky value reference with a deterministic fallback object for recoverable missing/invalid intermediate data.",
    "- output.final: declare final workflow output.",
    "",
      ],
    }),
    workflowCompilerPromptModule({
      id: "runtime-reference-contracts",
      layer: "runtime",
      scope: "stable_prefix",
      reason: "Always include data-reference and known runtime output path semantics.",
      content: [
    "Prefer compiler-owned output handles for prior outputs: use {\"fromHandle\":\"producerAlias.outputField\"}. The compiler lowers handles deterministically before validation. Producer aliases use camelCase node ids such as askUser.choiceId, searchRecords.items, renderReport.artifactPath, and stageWrite.path; the exact node id is also accepted as a fallback. Add path or subPath only for nested indexing below the declared output field. Use raw {\"fromNode\":\"node-id\",\"path\":\"optional.field.path\"} only for whole-node output or when no declared handle is available; do not invent raw paths.",
    "Known reference path contract: review.input outputs requestId, choiceId, text, and prompt; use choiceId, never choice or selectedChoice. approval.required outputs id, changeSet, and status. document.render outputs artifactPath, path, content, bytes, and mimeType. mutation.stage/file_write outputs path and bytes after the staged write is approved; do not reference mutation.stage changeSet/status or feed a mutation.stage output into approval.required.",
    "Inside loop.map.map, collection.map.map, connector.map.input, and model.map.input only, reference the current item with {\"fromItem\":\"item\",\"path\":\"optional.field.path\"}.",
    "In collection.map, connector.map, model.map, and loop.map, never use bare field-name strings like {\"id\":\"id\"} when you mean to copy a current item value; that emits a literal string. Use {\"id\":{\"fromItem\":\"item\",\"path\":\"id\"}} or wrap intentional constants with {\"literal\": value}.",
    "Use {\"literal\": value} only when an object must be treated as a literal value instead of a data-reference expression.",
      ],
    }),
    ...workflowProgramRecipePromptModules(selectedRecipes),
    workflowCompilerPromptModule({
      id: "core-workflow-program-ir-example",
      layer: "core",
      scope: "stable_prefix",
      reason: "Include only a compact neutral JSON shape; selected capabilities and recipes own concrete tool examples.",
      content: [
    "WorkflowProgramIR JSON shape:",
    JSON.stringify(
      {
        version: 1,
        title: "Short workflow title",
        goal: "Concrete user-facing workflow goal.",
        summary: "One paragraph summary.",
        successCriteria: ["Observable success condition."],
        nodes: [
          {
            id: "ask-user",
            kind: "review.input",
            prompt: "Ask for one bounded user decision before synthesis.",
            choices: [
              { id: "continue", label: "Continue" },
              { id: "revise", label: "Revise" },
            ],
            allowFreeform: true,
          },
          {
            id: "synthesize",
            kind: "model.call",
            dependsOn: ["ask-user"],
            task: "synthesize.workflow.result",
            input: { userDecision: { fromHandle: "askUser.choiceId" } },
            output: { schema: { title: "string", summary: "string", nextSteps: "array" } },
          },
          {
            id: "final",
            kind: "output.final",
            dependsOn: ["synthesize"],
            value: { summary: { fromHandle: "synthesize.summary" }, nextSteps: { fromHandle: "synthesize.nextSteps" } },
          },
        ],
        budgets: { maxModelCalls: 1, maxRunMs: 300000 },
        openQuestions: [],
      },
      null,
      2,
    ),
      ],
    }),
    ...policyRules.map(workflowCompilerPolicyPromptModule),
    ...workflowProgramToolGuidancePromptModules(input.toolDescriptors),
    workflowCompilerPromptModule({
      id: "capability-selected-desktop-tools",
      layer: "capability",
      scope: "stable_prefix",
      reason: "Include only the selected desktop workflow tools for this compile.",
      selectedToolNames: [...selectedToolNames].sort(),
      content: ["", "Selected Desktop workflow capabilities:", workflowProgramToolPromptSection(input.toolDescriptors)],
    }),
    ...(input.ambientCliCapabilities?.length
      ? [
          workflowCompilerPromptModule({
            id: "ambient-cli-selected-capabilities",
            layer: "ambient_cli",
            scope: "stable_prefix",
            reason: "Include installed Ambient CLI commands selected by request and exploration context.",
            selectedToolNames: input.ambientCliCapabilities.map((capability) => capability.capabilityId).sort(),
            content: ["", "Ambient CLI workflow capabilities:", workflowProgramAmbientCliPromptSection(input.ambientCliCapabilities)],
          }),
        ]
      : []),
    workflowCompilerPromptModule({
      id: "connector-selected-workflow-connectors",
      layer: "connector",
      scope: "stable_prefix",
      reason: "Include only selected workflow connector descriptors and operations.",
      selectedConnectorIds: [...selectedConnectorIds].sort(),
      content: ["", workflowProgramConnectorPromptSection(input.connectorDescriptors)],
    }),
  ];
  const mutableModules = [
    workflowCompilerPromptModule({
      id: "dynamic-workspace-summary",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Request-specific project context changes between compiles.",
      content: ["Workspace summary:", input.workspaceSummary?.trim() || "No workspace summary provided."],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-discovery-answers",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Workflow discovery answers are mutable user context.",
      content: ["", "Workflow discovery answers:", workflowProgramDiscoveryPromptSection(input.discoveryQuestions)],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-exploration-traces",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Exploration traces are request-specific capability and observation context.",
      content: ["", "Workflow exploration traces:", workflowProgramExplorationPromptSection(input.explorationTraces)],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-current-graph-ir",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Revision compiles may depend on the current graph snapshot.",
      content: [
        "",
        "Current workflow graph IR:",
        input.graphSnapshot ? JSON.stringify({ summary: input.graphSnapshot.summary, nodes: input.graphSnapshot.nodes, edges: input.graphSnapshot.edges }, null, 2) : "No workflow graph snapshot was provided.",
      ],
    }),
    workflowCompilerPromptModule({
      id: "dynamic-debug-rewrite-context",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Failed-run rewrite context is only included for targeted debug compiles.",
      content: ["", "Workflow debug rewrite context:", input.debugRewriteContext?.trim() || "No failed-run debug rewrite context was provided."],
    }),
    ...workflowCompilerCallableInvocationPromptModules(input.callableWorkflowInvocation),
    workflowCompilerPromptModule({
      id: "dynamic-user-request",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "The user's current workflow request is the mutable task definition.",
      content: ["", "User request:", input.userRequest],
    }),
  ];
  const { stablePrefix, mutableSuffix, promptAssembly } = assembleWorkflowCompilerPromptModules({
    stableModules,
    mutableModules,
  });
  const promptParts = workflowPromptParts({
    stage: input.revisionId ? "revision_compile" : "compile",
    workflowThreadId: input.workflowThreadId,
    revisionId: input.revisionId,
    graphSnapshotId: input.graphSnapshot?.id,
    stablePrefix,
    mutableSuffix,
    boundaryLabel: "WorkflowProgramIR compiler cache checkpoint",
  });
  return { ...promptParts, promptAssembly, selectedRecipes };
}

function workflowCompilerCallableInvocationPromptModules(
  invocation: WorkflowCompilerCallableInvocationContext | undefined,
): ReturnType<typeof workflowCompilerPromptModule>[] {
  if (!invocation) return [];
  return [
    workflowCompilerPromptModule({
      id: "dynamic-callable-workflow-invocation",
      layer: "dynamic_context",
      scope: "mutable_suffix",
      reason: "Callable workflow runs provide task, parent, launch-card, and compact recorder invocation context.",
      content: workflowCompilerCallableInvocationPromptSection(invocation),
    }),
  ];
}

function workflowCompilerCallableInvocationPromptSection(invocation: WorkflowCompilerCallableInvocationContext): string[] {
  const sourceLines = workflowCompilerCallableInvocationSourceContextLines(invocation.sourceContext);
  return [
    "",
    "Callable workflow invocation context:",
    `- Schema: ${invocation.schemaVersion}`,
    `- Task: ${invocation.taskId} / launch ${invocation.launchId}`,
    `- Parent: thread ${invocation.parentThreadId}, run ${invocation.parentRunId}${invocation.parentMessageId ? `, message ${invocation.parentMessageId}` : ""}`,
    ...workflowCompilerCallableInvocationCallerLines(invocation.callerProvenance),
    `- Tool: ${invocation.toolName} (${invocation.toolId})`,
    `- Source kind: ${invocation.sourceKind}`,
    `- Blocking: ${invocation.blocking ? "parent waits for this workflow result" : "background result may arrive later"}`,
    invocation.launchCard
      ? `- Launch card: risk ${invocation.launchCard.riskLevel}, max fanout ${invocation.launchCard.maxFanout}, max depth ${invocation.launchCard.maxDepth}, token budget ${invocation.launchCard.estimatedTokenBudget}`
      : "- Launch card: unavailable",
    ...sourceLines,
    "- Compile a fresh workflow artifact for this invocation. Preserve callable workflow task identity in summaries, checkpoints, and final output.",
    "- For recorded workflows, use the compact invocation and confirmed playbook as reusable guidance. Treat full recorder traces as diagnostics evidence, not replay instructions.",
    "Callable workflow invocation input:",
    JSON.stringify(invocation.input, null, 2),
  ];
}

function workflowCompilerCallableInvocationCallerLines(
  provenance: WorkflowCompilerCallableInvocationContext["callerProvenance"],
): string[] {
  if (!provenance) return ["- Caller provenance: unavailable"];
  return [
    `- Caller: ${provenance.kind} thread ${provenance.threadId}, run ${provenance.runId}${provenance.messageId ? `, message ${provenance.messageId}` : ""}`,
    ...(provenance.kind === "subagent_child_thread"
      ? [
          `- Child bridge: sub-agent run ${provenance.subagentRunId ?? "unknown"}${provenance.canonicalTaskPath ? `, task path ${provenance.canonicalTaskPath}` : ""}`,
          `- Worktree isolation: ${provenance.worktree.required ? "required" : "not required"}, ${provenance.worktree.isolated ? "isolated" : "not isolated"}${provenance.worktree.worktreePath ? `, path ${provenance.worktree.worktreePath}` : ""}`,
          `- Approval provenance: ${provenance.approval.required ? "required" : "not required"} via ${provenance.approval.source}, scope ${provenance.approval.scopeHint ?? "unknown"}, failure handling ${provenance.approval.failureHandling}`,
          `- Nested fanout provenance: ${provenance.nestedFanout.required ? "required" : "not required"} via ${provenance.nestedFanout.source}`,
        ]
      : [
          `- Approval provenance: ${provenance.approval.required ? "required" : "not required"} via ${provenance.approval.source}, failure handling ${provenance.approval.failureHandling}`,
        ]),
  ];
}

function workflowCompilerCallableInvocationSourceContextLines(
  context: WorkflowCompilerCallableInvocationContext["sourceContext"],
): string[] {
  if (!context) return ["- Source context: unavailable"];
  if (context.kind === "recorded_workflow") {
    return [
      `- Recorded playbook: ${context.playbookId} v${context.playbookVersion} (${context.playbookSource})`,
      `- Recorded intent: ${workflowCompilerPromptCompactText(context.intent)}`,
      `- Recorded summary: ${workflowCompilerPromptCompactText(context.summary)}`,
      ...workflowCompilerCallableSourcePreviewLines(context.sourcePreview),
      context.callableInvocation
        ? `- Compact invocation artifact: ${context.callableInvocation.invocationArtifact} (${context.callableInvocation.schemaVersion}; ${context.callableInvocation.mode}; default ${context.callableInvocation.defaultInvocation})`
        : "- Compact invocation artifact: unavailable",
      context.callableInvocation
        ? `- Diagnostics trace artifact: ${context.callableInvocation.diagnosticsTraceArtifact} (diagnostics only)`
        : "- Diagnostics trace artifact: unavailable",
      context.callableInvocation
        ? `- Invocation schema hint keys: ${context.callableInvocation.inputSchemaHintKeys.join(", ") || "none"}`
        : "- Invocation schema hint keys: none",
      context.validation.length
        ? `- Recorded validation: ${context.validation.map(workflowCompilerPromptCompactText).join(" | ")}`
        : "- Recorded validation: none",
      context.outputShape.length
        ? `- Recorded output shape: ${context.outputShape.map(workflowCompilerPromptCompactText).join(" | ")}`
        : "- Recorded output shape: none",
    ];
  }
  return [
    `- Symphony recipe: ${context.recipeId} (${context.recipeSchemaVersion})`,
    `- Recipe summary: ${workflowCompilerPromptCompactText(context.summary)}`,
    ...workflowCompilerCallableSourcePreviewLines(context.sourcePreview),
    `- Default roles: ${context.defaultRoles.join(", ") || "none"}`,
    `- Hard limits: fanout ${context.hardLimits.maxFanout}, depth ${context.hardLimits.maxDepth}, token budget ${context.hardLimits.maxTokenBudget}, local memory ${context.hardLimits.maxLocalMemoryBytes}`,
    context.metricTemplates.length
      ? `- Metric templates: ${context.metricTemplates.map((metric) => `${metric.id}:${metric.kind}`).join(", ")}`
      : "- Metric templates: none",
    ...workflowCompilerSymphonyInvocationLines(context.invocationCustomization),
  ];
}

function workflowCompilerCallableSourcePreviewLines(
  preview: NonNullable<WorkflowCompilerCallableInvocationContext["sourceContext"]>["sourcePreview"],
): string[] {
  if (!preview) return ["- Callable source preview: unavailable"];
  return [
    `- Callable source preview: ${preview.label} (${preview.format}, ${preview.dslStatus}, executable no)`,
    `- Callable source preview text: ${workflowCompilerPromptCompactText(preview.text, 900)}`,
  ];
}

function workflowCompilerSymphonyInvocationLines(
  invocation: Extract<
    NonNullable<WorkflowCompilerCallableInvocationContext["sourceContext"]>,
    { kind: "symphony_recipe" }
  >["invocationCustomization"],
): string[] {
  if (!invocation) return ["- Symphony invocation customization: none"];
  return [
    `- Symphony invocation customization: ${invocation.schemaVersion}`,
    invocation.stepSelections.length
      ? `- Selected builder choices: ${invocation.stepSelections.map((selection) => `${selection.stepId}=${workflowCompilerPromptCompactText(selection.resolvedText)}`).join(" | ")}`
      : "- Selected builder choices: none",
    invocation.metricCriteria.length
      ? `- Required metric criteria: ${invocation.metricCriteria.map((criterion) => `${criterion.templateId}=${workflowCompilerPromptCompactText(criterion.value)}`).join(" | ")}`
      : "- Required metric criteria: none",
  ];
}

function workflowCompilerPromptCompactText(value: string, maxLength = 360): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function workflowProgramToolPromptSection(tools: DesktopToolDescriptor[]): string {
  if (tools.length === 0) return "- none";
  return tools
    .map((tool) =>
      [
        `- ${tool.name}: ${tool.description}`,
        `  scope: ${tool.permissionScope}; sideEffects: ${tool.sideEffects}; dryRun: ${tool.supportsDryRun}`,
        tool.pagination
          ? `  pagination: {itemsPath:${tool.pagination.itemsPath ?? "items"},nextPageTokenPath:${tool.pagination.nextPageTokenPath ?? "none"},pageTokenInputPath:${tool.pagination.pageTokenInputPath ?? "none"},queryInputPath:${tool.pagination.queryInputPath ?? "none"},pageSizeInputPath:${tool.pagination.pageSizeInputPath ?? "none"},defaultPageSize:${tool.pagination.defaultPageSize},maxPageSize:${tool.pagination.maxPageSize},queryFanOut:${tool.pagination.queryFanOut === true}}`
          : undefined,
        `  inputSchema: ${JSON.stringify(tool.inputSchema)}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    )
    .join("\n");
}

function workflowPlanDslToolPromptSection(tools: DesktopToolDescriptor[]): string {
  if (tools.length === 0) return "- none";
  return tools
    .map((tool) => {
      const policy = ` sideEffects=${tool.sideEffects}; scope=${tool.permissionScope}`;
      const outputFields = tool.outputSchema && typeof tool.outputSchema === "object" ? ` outputs=${Object.keys(tool.outputSchema as Record<string, unknown>).slice(0, 8).join(",")}` : "";
      return `- ${tool.name}: ${tool.label || tool.description || "workflow tool"}.${policy}${outputFields}`;
    })
    .join("\n");
}

function workflowPlanDslConnectorPromptSection(connectors: WorkflowConnectorDescriptor[] | undefined): string {
  if (!connectors?.length) return "No workflow connectors were selected.";
  return connectors
    .map((connector) => {
      const operations = connector.operations.map((operation) => `${operation.name}(${operation.sideEffects})`).join(", ");
      return `- ${connector.id}: ${connector.description}; auth=${connector.auth.status}; operations=${operations || "none"}`;
    })
    .join("\n");
}

function workflowProgramRecipePromptModules(selectedRecipes: WorkflowCompilerSelectedRecipe[]) {
  if (selectedRecipes.length === 0) return [];
  const definitionsById = new Map(workflowCompilerRecipeDefinitions().map((recipe) => [recipe.id, recipe]));
  return selectedRecipes.map((selectedRecipe) => {
    const definition = definitionsById.get(selectedRecipe.id);
    return workflowCompilerPromptModule({
      id: `recipe-${selectedRecipe.id}`,
      layer: "recipe",
      scope: "stable_prefix",
      reason: selectedRecipe.reason,
      selectedRecipeIds: [selectedRecipe.id],
      selectedToolNames: selectedRecipe.compatibleToolNames.filter((toolName) => selectedRecipe.matchedSignals.includes(toolName)),
      selectedConnectorIds: selectedRecipe.compatibleConnectorIds.filter((connectorId) => selectedRecipe.matchedSignals.includes(connectorId)),
      content: [
        `Recipe ${selectedRecipe.id}: ${selectedRecipe.title}`,
        selectedRecipe.summary,
        `Why selected: ${selectedRecipe.reason}`,
        `Selection confidence: ${selectedRecipe.confidence}`,
        `Matched signals: ${selectedRecipe.matchedSignals.join(", ") || "none recorded"}`,
        `Applicability tags: ${selectedRecipe.applicabilityTags.join(", ")}`,
        `Required node kinds: ${selectedRecipe.requiredNodeKinds.join(", ") || "none"}`,
        `Preferred node kinds: ${selectedRecipe.preferredNodeKinds.join(", ") || "none"}`,
        `Budget effects: ${selectedRecipe.budgetEffects.join(" ") || "No special budget effects."}`,
        selectedRecipe.policyImplications.length
          ? `Policy implications: ${selectedRecipe.policyImplications.map((implication) => `${implication.id}(${implication.severity})`).join(", ")}`
          : "Policy implications: none",
        `Validators: ${selectedRecipe.validatorRefs.join(", ") || "none"}`,
        definition?.promptGuidance,
        definition ? `Short IR example: ${JSON.stringify(definition.irExample)}` : undefined,
      ].filter((line): line is string => Boolean(line)),
    });
  });
}

function workflowProgramToolGuidancePromptModules(tools: DesktopToolDescriptor[]) {
  const guidanceById = new Map<
    string,
    {
      guidance: NonNullable<DesktopToolDescriptor["workflowGuidance"]>[number];
      toolNames: Set<string>;
    }
  >();
  for (const tool of tools) {
    for (const guidance of tool.workflowGuidance ?? []) {
      const existing = guidanceById.get(guidance.id);
      if (existing) {
        existing.toolNames.add(tool.name);
      } else {
        guidanceById.set(guidance.id, { guidance, toolNames: new Set([tool.name]) });
      }
    }
  }
  return [...guidanceById.values()]
    .sort((left, right) => left.guidance.id.localeCompare(right.guidance.id))
    .map(({ guidance, toolNames }) =>
      workflowCompilerPromptModule({
        id: `capability-guidance-${guidance.id}`,
        layer: "capability",
        scope: "stable_prefix",
        reason: guidance.summary,
        ruleIds: [guidance.id],
        selectedToolNames: [...toolNames].sort(),
        content: [
          `Capability guidance ${guidance.id}: ${guidance.summary}`,
          `risk: ${guidance.risk}; appliesTo: ${guidance.applicabilityTags.join(", ") || "selected capability"}`,
          guidance.validatorRefs.length ? `validators: ${guidance.validatorRefs.join(", ")}` : undefined,
          guidance.text,
        ].filter((line): line is string => Boolean(line)),
      }),
    );
}

function workflowProgramAmbientCliPromptSection(capabilities: WorkflowCompilerAmbientCliCapability[] | undefined): string {
  if (!capabilities?.length) return "No installed Ambient CLI command capabilities were selected.";
  return capabilities
    .slice(0, 12)
    .map((capability) =>
      [
        `- ${capability.packageName}:${capability.command} [${capability.capabilityId}]`,
        capability.description ? `  description: ${capability.description}` : undefined,
        `  availability: ${capability.availability}; risk: ${capability.risk.join(", ") || "none"}`,
        capability.missingEnv.length ? `  missingEnv: ${capability.missingEnv.join(", ")}; setup only until configured` : undefined,
        `  IR describe node: {"kind":"tool.call","tool":"ambient_cli_describe","args":{"packageName":"${capability.packageName}","command":"${capability.command}"}}`,
        `  IR run node: {"kind":"tool.call","tool":"ambient_cli","dependsOn":["<describe-node-id>"],"args":{"packageName":"${capability.packageName}","command":"${capability.command}","args":[]}}`,
        capability.missingEnv.length
          ? `  IR secret setup node: {"kind":"tool.call","tool":"ambient_cli_secret_request","dependsOn":["<describe-node-id>"],"args":{"packageName":"${capability.packageName}","envName":"${capability.missingEnv[0]}"}}`
          : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    )
    .join("\n");
}

function workflowProgramConnectorPromptSection(connectors: WorkflowConnectorDescriptor[] | undefined): string {
  if (!connectors?.length) return "No workflow connectors were selected. Prefer first-party tools when available.";
  return connectors
    .map((connector) =>
      [
        `- ${connector.id}: ${connector.description}`,
        `  auth: ${connector.auth.type}/${connector.auth.status}; accounts: ${connector.accounts.map((account) => account.id).join(", ") || "none"}`,
        `  operations: ${connector.operations.map((operation) => workflowProgramConnectorOperationPromptSummary(operation)).join("; ")}`,
        workflowProgramConnectorSpecificGuidance(connector),
        connector.operations.some((operation) => operation.pagination)
          ? `  IR connector.paginate skeleton: {"kind":"connector.paginate","connectorId":"${connector.id}","operation":"<paginated-operation-from-list-above>","input":{},"maxItems":100,"maxPages":2,"pageSize":50,"dedupeKeyPath":"id","output":{"schema":{"items":"array","pages":"array","count":"number","pageCount":"number","truncated":"boolean"}}}`
          : undefined,
        `  IR connector.call: {"kind":"connector.call","connectorId":"${connector.id}","operation":"${connector.operations[0]?.name ?? "operation"}","input":{},"output":{"schema":{}}}`,
        `  IR connector.map skeleton: {"kind":"connector.map","connectorId":"${connector.id}","operation":"<detail-operation-from-list-above>","items":{"fromHandle":"<listNodeAlias>.items"},"itemName":"item","input":{"<id-field>":{"fromItem":"item","path":"id"}},"maxItems":4,"maxConcurrency":4,"output":{"schema":{"items":"array","count":"number","sourceCount":"number","truncated":"boolean"}}}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    )
    .join("\n");
}

function workflowProgramConnectorSpecificGuidance(connector: WorkflowConnectorDescriptor): string | undefined {
  if (connector.id !== "google.gmail") return undefined;
  const hasSearch = connector.operations.some((operation) => operation.name === "search");
  const hasReadThread = connector.operations.some((operation) => operation.name === "readThread");
  if (!hasSearch || !hasReadThread) return undefined;
  return [
    "  Gmail detail rule: for bounded Gmail categorization/reporting that asks for message/thread detail, action required, urgency, sender/domain, or recurring themes, do not synthesize from search snippets alone.",
    "  Use google.gmail search or connector.paginate search first, then connector.map google.gmail readThread with threadId from each selected search/thread item before Ambient synthesis.",
    "  Use metadata-only search/chunk/reduce instead only when the request explicitly asks for metadata-first, asks to review before full-body reads, or is a very large mailbox batch where full thread reads would exceed the connector budget.",
  ].join("\n");
}

function workflowProgramConnectorOperationPromptSummary(operation: WorkflowConnectorDescriptor["operations"][number]): string {
  const pagination = operation.pagination
    ? `; pagination={itemsPath:${operation.pagination.itemsPath ?? "items"},nextPageTokenPath:${operation.pagination.nextPageTokenPath ?? "nextPageToken"},pageTokenInputPath:${operation.pagination.pageTokenInputPath ?? operation.pagination.cursorField},pageSizeInputPath:${operation.pagination.pageSizeInputPath ?? "none"},defaultPageSize:${operation.pagination.defaultPageSize},maxPageSize:${operation.pagination.maxPageSize}}`
    : "";
  return `${operation.name}(${operation.sideEffects}; scopes=${operation.requiredScopes.join("+") || "none"}${pagination}; inputSchema=${JSON.stringify(operation.inputSchema)})`;
}

function workflowProgramDiscoveryPromptSection(questions: WorkflowDiscoveryQuestion[] | undefined): string {
  if (!questions?.length) return "No workflow discovery answers were provided.";
  return questions
    .map((question) => {
      const selectedChoice = question.answer?.choiceId ? question.choices.find((choice) => choice.id === question.answer?.choiceId) : undefined;
      return [
        `- ${question.category}: ${question.question}`,
        selectedChoice ? `  selected: ${selectedChoice.label} - ${selectedChoice.description}` : undefined,
        question.answer?.freeform ? `  freeform: ${question.answer.freeform}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
    })
    .join("\n");
}

function workflowProgramExplorationPromptSection(traces: WorkflowExplorationTraceSummary[] | undefined): string {
  if (!traces?.length) return "No workflow exploration traces were provided.";
  return JSON.stringify(
    traces.slice(0, 3).map((trace) => ({
      id: trace.id,
      request: trace.request,
      observationCount: trace.observations.length,
      capabilityManifest: trace.capabilityManifest,
      distillation: trace.distillation,
    })),
    null,
    2,
  );
}

async function workflowAmbientCliCapabilitiesForCompile(input: {
  workspacePath: string;
  userRequest: string;
  explorationTraces: WorkflowExplorationTraceSummary[];
}): Promise<WorkflowCompilerAmbientCliCapability[]> {
  const fromExploration = workflowAmbientCliCapabilitiesFromExplorationTraces(input.explorationTraces);
  const fromRequest = await workflowAmbientCliCapabilitiesForRequest(input.workspacePath, input.userRequest);
  const byCapabilityId = new Map<string, WorkflowCompilerAmbientCliCapability>();
  for (const capability of [...fromExploration, ...fromRequest]) {
    if (!byCapabilityId.has(capability.capabilityId)) byCapabilityId.set(capability.capabilityId, capability);
  }
  return [...byCapabilityId.values()].filter((capability) => capability.availability === "available").slice(0, 12);
}

function shouldIncludeWorkflowAmbientCliCapabilities(input: { selectedToolNames: string[]; availableToolNames: string[] }): boolean {
  if (input.selectedToolNames.some((toolName) => toolName.startsWith("ambient_cli"))) return true;
  return input.availableToolNames.length === 0;
}

async function workflowAmbientCliCapabilitiesForRequest(workspacePath: string, userRequest: string): Promise<WorkflowCompilerAmbientCliCapability[]> {
  try {
    const response = await searchAmbientCliCapabilities(workspacePath, {
      query: userRequest,
      kind: "command",
      limit: 6,
      includeHealth: false,
    });
    return workflowAmbientCliCapabilitiesFromSearch(response).filter((capability) => capability.availability === "available").slice(0, 8);
  } catch {
    return [];
  }
}

function workflowAmbientCliCapabilitiesFromExplorationTraces(traces: WorkflowExplorationTraceSummary[]): WorkflowCompilerAmbientCliCapability[] {
  const capabilities: WorkflowCompilerAmbientCliCapability[] = [];
  for (const trace of traces.slice(0, 3)) {
    for (const grant of workflowAmbientCliGrantsFromUnknown(trace.capabilityManifest)) {
      capabilities.push(workflowAmbientCliCapabilityFromGrant(grant, `workflow exploration trace ${trace.explorationId}`));
    }
    for (const grant of workflowAmbientCliGrantsFromUnknown(trace.distillation)) {
      capabilities.push(workflowAmbientCliCapabilityFromGrant(grant, `workflow exploration distillation ${trace.explorationId}`));
    }
  }
  return capabilities;
}

function workflowAmbientCliGrantsFromUnknown(value: unknown): WorkflowAmbientCliCapabilityGrant[] {
  const grants: WorkflowAmbientCliCapabilityGrant[] = [];
  const visit = (candidate: unknown, depth: number) => {
    if (!candidate || depth > 4) return;
    if (Array.isArray(candidate)) {
      if (candidate.every(isWorkflowAmbientCliCapabilityGrant)) {
        grants.push(...candidate);
        return;
      }
      for (const item of candidate) visit(item, depth + 1);
      return;
    }
    if (typeof candidate !== "object") return;
    const record = candidate as Record<string, unknown>;
    if (Array.isArray(record.ambientCliCapabilities)) visit(record.ambientCliCapabilities, depth + 1);
    if (record.recommendedManifest) visit(record.recommendedManifest, depth + 1);
    if (record.manifest) visit(record.manifest, depth + 1);
  };
  visit(value, 0);

  const seen = new Set<string>();
  return grants.filter((grant) => {
    if (seen.has(grant.capabilityId)) return false;
    seen.add(grant.capabilityId);
    return true;
  });
}

function isWorkflowAmbientCliCapabilityGrant(value: unknown): value is WorkflowAmbientCliCapabilityGrant {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.capabilityId === "string" &&
    typeof record.registryPluginId === "string" &&
    typeof record.packageId === "string" &&
    typeof record.packageName === "string" &&
    typeof record.command === "string"
  );
}

function workflowAmbientCliCapabilityFromGrant(grant: WorkflowAmbientCliCapabilityGrant, whyMatched: string): WorkflowCompilerAmbientCliCapability {
  return {
    ...grant,
    availability: "available",
    risk: [],
    missingEnv: [],
    whyMatched: [whyMatched],
  };
}

function updateCompiledWorkflowRevision(
  store: ProjectStore,
  input: { revisionId: string; proposedArtifactId: string; proposedGraphSnapshot: WorkflowGraphSnapshot },
): void {
  const revision = store.getWorkflowRevision(input.revisionId);
  if (revision.workflowThreadId !== input.proposedGraphSnapshot.workflowThreadId) {
    throw new Error(`Workflow revision ${revision.id} does not belong to workflow thread ${input.proposedGraphSnapshot.workflowThreadId}.`);
  }
  const proposedArtifact = store.getWorkflowArtifact(input.proposedArtifactId);
  const baseVersion = revision.baseVersionId ? store.getWorkflowVersion(revision.baseVersionId) : undefined;
  const baseArtifactId = revision.baseArtifactId ?? baseVersion?.artifactId;
  const baseArtifact = baseArtifactId ? store.getWorkflowArtifact(baseArtifactId) : undefined;
  const currentGraph = baseVersion?.graphSnapshotId
    ? store.listWorkflowGraphSnapshots(revision.workflowThreadId).find((snapshot) => snapshot.id === baseVersion.graphSnapshotId)
    : undefined;
  store.updateWorkflowRevision({
    id: revision.id,
    proposedGraphSnapshotId: input.proposedGraphSnapshot.id,
    graphDiff:
      baseArtifact && currentGraph
        ? diffWorkflowGraphs({
            current: currentGraph,
            proposed: input.proposedGraphSnapshot,
            currentManifest: baseArtifact.manifest,
            proposedManifest: proposedArtifact.manifest,
          })
        : undefined,
    sourceDiff: baseArtifact
      ? buildWorkflowSourceDiff(readFileSync(baseArtifact.sourcePath, "utf8"), readFileSync(proposedArtifact.sourcePath, "utf8"), {
          beforeLabel: "base/main.ts",
          afterLabel: "proposed/main.ts",
        })
      : undefined,
    status: "proposed",
  });
}

function compileContextArtifact(
  input: WorkflowCompileContext,
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

function workflowProgramIrRepairHistoryArtifact(repairHistory: WorkflowProgramIrRepairHistoryEntry[]): {
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

const WORKFLOW_COMPILER_CAPABILITY_DISCOVERY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["queries", "requiredToolNames", "requiredConnectorIds", "openQuestions"],
  properties: {
    queries: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 240 },
          reason: { type: "string", maxLength: 500 },
        },
      },
    },
    requiredToolNames: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    requiredConnectorIds: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    openQuestions: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
} as const;

export class AmbientWorkflowCompilerProvider implements WorkflowCompilerProvider {
  constructor(
    private readonly input: {
      apiKey?: string;
      baseUrl?: string;
      timeoutMs?: number;
      idleTimeoutMs?: number;
      textCall?: typeof callWorkflowPiText;
      retryPolicy?: AmbientRetryPolicy;
    },
  ) {}

  async discoverCapabilities(input: {
    prompt: string;
    model: string;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    const apiKey = (this.input.apiKey ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const idleTimeoutMs = Math.max(1, Math.floor(Math.min(this.input.idleTimeoutMs ?? DEFAULT_WORKFLOW_COMPILER_DISCOVERY_IDLE_TIMEOUT_MS, DEFAULT_WORKFLOW_COMPILER_DISCOVERY_IDLE_TIMEOUT_MS)));
    const timeoutMs = Math.max(1, Math.floor(Math.min(this.input.timeoutMs ?? DEFAULT_WORKFLOW_COMPILER_DISCOVERY_TIMEOUT_MS, DEFAULT_WORKFLOW_COMPILER_DISCOVERY_TIMEOUT_MS)));
    return await callWorkflowPiJson<WorkflowCompilerCapabilityDiscoveryPlan>({
      apiKey,
      baseUrl: this.input.baseUrl,
      model: input.model,
      systemPrompt: "You are the Ambient Desktop workflow compiler capability discovery planner. Return only valid JSON.",
      prompt: input.prompt,
      schemaName: "workflow_compiler_capability_discovery",
      responseSchema: WORKFLOW_COMPILER_CAPABILITY_DISCOVERY_JSON_SCHEMA,
      validate: validateWorkflowCompilerCapabilityDiscoveryOutput,
      maxValidationRetries: 1,
      textCall: this.input.textCall,
      temperature: 0.1,
      maxTokens: 1_200,
      idleTimeoutMs,
      absoluteTimeoutMs: timeoutMs,
      timeoutMs,
      onProgress: input.onProgress,
      reasoning: false,
      retryPolicy: this.input.retryPolicy,
    });
  }

  async compileProgramIr(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    return this.callIncrementalCompilerJson({
      prompt: input.prompt,
      model: input.model,
      cacheCheckpoint: input.cacheCheckpoint,
      systemPrompt: "You are the Ambient Desktop WorkflowProgramIR planner. Return only valid JSON for the WorkflowProgramIR schema. Do not generate source code.",
      maxTokens: 6_000,
      reasoning: false,
      onProgress: input.onProgress,
    });
  }

  async compilePlanDsl(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    return this.callIncrementalCompilerJson({
      prompt: input.prompt,
      model: input.model,
      cacheCheckpoint: input.cacheCheckpoint,
      systemPrompt: "You are the Ambient Desktop Workflow Plan DSL planner. Return only valid JSON for the high-level Workflow Plan DSL schema. Do not generate WorkflowProgramIR, source code, or patches.",
      maxTokens: 3_000,
      reasoning: false,
      onProgress: input.onProgress,
    });
  }

  async repairProgramIr(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    attempt: number;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    void input.attempt;
    return this.callIncrementalCompilerJson({
      prompt: input.prompt,
      model: input.model,
      cacheCheckpoint: input.cacheCheckpoint,
      systemPrompt:
        "You are the Ambient Desktop WorkflowProgramIR repairer. Return only valid JSON in the shape {\"repairOperations\":[...]} using typed repair operations: replace_with_alternative, add_semantic_slot, remove_optional_node, or ask_user_for_missing_choice. Do not generate source code.",
      maxTokens: 2_000,
      reasoning: false,
      onProgress: input.onProgress,
    });
  }

  private async callIncrementalCompilerJson(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    systemPrompt: string;
    maxTokens: number;
    reasoning: false;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown> {
    const apiKey = (this.input.apiKey ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const startedAt = Date.now();
    const textCall = this.input.textCall ?? callWorkflowPiText;
    const idleTimeoutMs = Math.max(1, Math.floor(this.input.idleTimeoutMs ?? DEFAULT_WORKFLOW_COMPILER_IDLE_TIMEOUT_MS));
    const timeoutMs = Math.max(1, Math.floor(this.input.timeoutMs ?? DEFAULT_WORKFLOW_COMPILER_TIMEOUT_MS));
    const noOutputThinkingTimeoutMs = positiveEnvNumber(
      "AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_TIMEOUT_MS",
      DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_TIMEOUT_MS,
    );
    const noOutputThinkingChars = positiveEnvNumber(
      "AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS",
      DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS,
    );
    let prompt = input.prompt;
    let noOutputThinkingRetriesUsed = 0;
    let parseRetriesUsed = 0;
    let transientRetriesUsed = 0;
    let attemptIndex = 0;
    while (true) {
      if (attemptIndex > 0) {
        input.onProgress?.({
          outputChars: 0,
          thinkingChars: 0,
          elapsedMs: Date.now() - startedAt,
          idleTimeoutMs,
          absoluteTimeoutMs: timeoutMs,
          timeoutMode: "idle_watchdog",
          stage: "retrying",
        });
      }
      let content: string;
      const attemptAbortController = new AbortController();
      const onProgress = workflowCompilerProgressWithNoOutputThinkingGuard({
        onProgress: input.onProgress,
        abortController: attemptAbortController,
        noOutputThinkingTimeoutMs,
        noOutputThinkingChars,
      });
      try {
        content = await textCall({
          apiKey,
          baseUrl: this.input.baseUrl,
          model: input.model,
          systemPrompt: input.systemPrompt,
          prompt,
          sessionId: input.cacheCheckpoint?.workflowThreadId,
          temperature: 0.1,
          maxTokens: input.maxTokens,
          idleTimeoutMs,
          absoluteTimeoutMs: timeoutMs,
          timeoutMs,
          signal: attemptAbortController.signal,
          onProgress,
          reasoning: input.reasoning,
          responseFormat: { type: "json_object" },
          retryPolicy: this.input.retryPolicy,
        });
      } catch (error) {
        const lastError = error instanceof Error ? error : new Error(String(error));
        if (isWorkflowCompilerNoOutputThinkingError(lastError) && noOutputThinkingRetriesUsed < DEFAULT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_RETRY_LIMIT) {
          noOutputThinkingRetriesUsed += 1;
          attemptIndex += 1;
          prompt = workflowCompilerJsonRetryPrompt(input.prompt, lastError.message);
          continue;
        }
        if (
          !this.input.retryPolicy?.enabled &&
          isTransientWorkflowCompilerProviderError(lastError) &&
          transientRetriesUsed < DEFAULT_WORKFLOW_COMPILER_TRANSIENT_RETRY_LIMIT
        ) {
          transientRetriesUsed += 1;
          attemptIndex += 1;
          continue;
        }
        throw lastError;
      }
      try {
        return parseCompilerJson(content);
      } catch (error) {
        const lastError = error instanceof Error ? error : new Error(String(error));
        if (parseRetriesUsed >= DEFAULT_WORKFLOW_COMPILER_PARSE_RETRY_LIMIT) throw lastError;
        parseRetriesUsed += 1;
        attemptIndex += 1;
        prompt = workflowCompilerJsonRetryPrompt(input.prompt, lastError.message);
      }
    }
  }
}

function workflowCompilerJsonRetryPrompt(originalPrompt: string, validationError: string): string {
  return `${originalPrompt}

Workflow compiler retry instruction:
The previous workflow compiler response failed before it produced valid JSON for this compiler phase.
Validation error: ${validationError}

Return exactly one complete JSON object matching the compiler schema requested above.
Use compact JSON if necessary to fit the response budget.
Do not include markdown fences, commentary, trailing commas, comments, or unterminated strings.
Do not generate TypeScript or JavaScript.`;
}

function workflowCompilerProgressWithNoOutputThinkingGuard(input: {
  onProgress?: (progress: WorkflowPiProgress) => void;
  abortController: AbortController;
  noOutputThinkingTimeoutMs: number;
  noOutputThinkingChars: number;
}): (progress: WorkflowPiProgress) => void {
  return (progress) => {
    input.onProgress?.(progress);
    if (input.abortController.signal.aborted) return;
    if (progress.outputChars > 0 || progress.thinkingChars <= 0) return;
    const elapsedMs = Math.max(0, progress.elapsedMs);
    if (elapsedMs < input.noOutputThinkingTimeoutMs && progress.thinkingChars < input.noOutputThinkingChars) return;
    input.abortController.abort(
      new Error(
        `Ambient/Pi compiler spent ${formatDurationMs(elapsedMs)} thinking without emitting workflow JSON output ` +
          `(${progress.thinkingChars.toLocaleString()} thinking chars, 0 output chars). Retrying with thinking disabled.`,
      ),
    );
  };
}

function isWorkflowCompilerNoOutputThinkingError(error: Error): boolean {
  return /thinking without emitting workflow JSON output/i.test(error.message);
}

function isTransientWorkflowCompilerProviderError(error: Error): boolean {
  if (/api key|unauthori[sz]ed|forbidden|invalid request|schema|validation/i.test(error.message)) return false;
  return /\b(?:408|409|425|429|500|502|503|504)\b|rate limit|temporar|try again|timeout|timed out|upstream|econnreset|socket hang up|without stream activity/i.test(
    error.message,
  );
}

function positiveEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function envFlag(name: string): boolean {
  const raw = process.env[name];
  return raw === "1" || raw?.toLowerCase() === "true" || raw?.toLowerCase() === "yes";
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `${(seconds / 60).toFixed(1)}m`;
}

export function parseCompilerJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Ambient workflow compiler returned an empty response.");
  const firstError = tryParseCompilerJsonCandidate(trimmed);
  if (firstError.ok) return firstError.value;
  const fenced = extractOuterFencedJson(trimmed);
  if (fenced) {
    const fencedResult = tryParseCompilerJsonCandidate(fenced);
    if (fencedResult.ok) return fencedResult.value;
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const bracedResult = tryParseCompilerJsonCandidate(trimmed.slice(firstBrace, lastBrace + 1));
    if (bracedResult.ok) return bracedResult.value;
  }
  throw new Error(`Ambient workflow compiler did not return valid JSON: ${firstError.error.message}`);
}

function extractOuterFencedJson(text: string): string | undefined {
  const open = text.match(/^```(?:json)?\s*/i);
  if (!open) return undefined;
  const closeIndex = text.lastIndexOf("```");
  if (closeIndex <= open[0].length) return undefined;
  return text.slice(open[0].length, closeIndex).trim();
}

function tryParseCompilerJsonCandidate(candidate: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch (jsonError) {
    try {
      const value = YAML.parse(candidate);
      if (value !== null && value !== undefined) return { ok: true, value };
    } catch {
      // Preserve the JSON parser's more useful position information below.
    }
    return { ok: false, error: jsonError instanceof Error ? jsonError : new Error(String(jsonError)) };
  }
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

function roughJsonCharCount(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

function slugForTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "preview";
}
