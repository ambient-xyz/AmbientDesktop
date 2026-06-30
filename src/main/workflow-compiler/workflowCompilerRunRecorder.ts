import { readFileSync } from "node:fs";
import type {
  WorkflowCompileProgress,
  WorkflowDashboard,
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowDiscoveryQuestion,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowPromptCacheCheckpoint,
} from "../../shared/workflowTypes";
import { diffWorkflowGraphs } from "../../shared/workflowGraphDiff";
import type { WorkflowCompilerCallableInvocationContext } from "./workflowCompilerCallableInvocationPrompt";
import type { CompileWorkflowArtifactInput } from "./workflowCompilerServiceTypes";
import type { WorkflowCompilerCapabilityDiscoveryPlan, WorkflowCompilerOutput } from "./workflowCompiler";
import { writeWorkflowCompilerArtifactFiles } from "./workflowCompilerArtifactFiles";
import type { WorkflowCompilerPromptAssemblyRecord } from "./workflowCompilerPromptModules";
import type { WorkflowCompilerRecipeSelectionResult, WorkflowCompilerSelectedRecipe } from "./workflowCompilerRecipes";
import { readWorkflowDashboard, buildWorkflowSourceDiff } from "./workflowCompilerWorkflowDashboardFacade";
import { commitWorkflowVersionRepo, enrichWorkflowManifestWithPluginCapabilities } from "./workflowCompilerWorkflowFacade";
import type { WorkflowPlanDsl } from "./workflowCompilerWorkflowFacade";
import type {
  WorkflowProgramDiagnostic,
  WorkflowProgramLoweredOperationPlan,
  WorkflowProgramValidationReport,
} from "./workflowCompilerWorkflowProgramFacade";
import type { WorkflowProgramIrPatchOperation } from "./workflowCompilerIrRepair";
import type { ProjectStore } from "./workflowCompilerProjectStoreFacade";

type WorkflowCompilerProgressEmitter = (progress: Omit<WorkflowCompileProgress, "compileId" | "createdAt" | "total">) => void;

interface WorkflowCompilerRecordContext {
  discoveryQuestions: WorkflowDiscoveryQuestion[];
  explorationTraces: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
  callableWorkflowInvocation?: WorkflowCompilerCallableInvocationContext;
}

interface WorkflowCompilerCapabilityDiscoveryRecord {
  plan?: WorkflowCompilerCapabilityDiscoveryPlan;
  fallback: boolean;
}

interface WorkflowCompilerCapabilityResolutionRecord {
  searches: WorkflowDiscoveryCapabilitySearch[];
  descriptions: WorkflowDiscoveryCapabilityDescription[];
  summary?: string;
}

interface WorkflowCompilerSelectionRecord {
  selectedToolNames: string[];
  availableToolCount: number;
}

interface WorkflowCompilerConnectorSelectionRecord {
  selectedConnectorIds: string[];
  availableConnectorCount: number;
}

interface WorkflowCompilerRunRecord {
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

interface RecordWorkflowCompilerRunInput {
  input: CompileWorkflowArtifactInput;
  compileContext: WorkflowCompilerRecordContext;
  compilerRun: WorkflowCompilerRunRecord;
  capabilityDiscovery: WorkflowCompilerCapabilityDiscoveryRecord;
  capabilityResolution: WorkflowCompilerCapabilityResolutionRecord;
  capabilitySelection: WorkflowCompilerSelectionRecord;
  connectorSelection: WorkflowCompilerConnectorSelectionRecord;
  selectedRecipes: WorkflowCompilerSelectedRecipe[];
  recipeSelection: WorkflowCompilerRecipeSelectionResult;
  model: string;
  emitProgress: WorkflowCompilerProgressEmitter;
}

export async function recordWorkflowCompilerRun(input: RecordWorkflowCompilerRunInput): Promise<WorkflowDashboard> {
  const { cacheCheckpoint, prompt, promptAssembly, raw, startedAt, completedAt, repairHistory, validationReport } = input.compilerRun;
  const output: WorkflowCompilerOutput = {
    ...input.compilerRun.output,
    manifest: enrichWorkflowManifestWithPluginCapabilities(input.compilerRun.output.manifest, input.input.pluginRegistrations),
  };
  const artifactFiles = await writeWorkflowCompilerArtifactFiles({
    cacheCheckpoint,
    compileContext: input.compileContext,
    emitProgress: input.emitProgress,
    loweredPlan: input.compilerRun.loweredPlan,
    output,
    planDsl: input.compilerRun.planDsl,
    promptAssembly,
    repairHistory,
    stateRoot: input.input.stateRoot,
    validationReport,
  });
  const { artifactRoot, graph, id, patchOperationCount, paths: artifactPaths, repairAttemptCount } = artifactFiles;

  input.emitProgress({
    phase: "recorded",
    status: "running",
    message: "Recording the preview run and audit trail.",
    current: 6,
  });
  const artifact = input.input.store.createWorkflowArtifact({
    id,
    workflowThreadId: input.input.workflowThreadId,
    title: output.title,
    status: "ready_for_preview",
    manifest: output.manifest,
    spec: output.spec,
    sourcePath: artifactPaths.source,
    statePath: artifactPaths.state,
  });
  const graphSnapshot = input.input.store.createWorkflowGraphSnapshot({
    workflowThreadId: artifact.workflowThreadId!,
    source: "compile",
    summary: graph.summary,
    nodes: graph.nodes,
    edges: graph.edges,
    artifactPath: artifactPaths.graph,
  });
  const versionCommit = await commitWorkflowVersionRepo({
    repoPath: artifactRoot,
    message: `Create workflow version for ${output.title}`,
  });
  const version = input.input.store.createWorkflowVersion({
    workflowThreadId: artifact.workflowThreadId!,
    artifactId: artifact.id,
    graphSnapshotId: graphSnapshot.id,
    sourcePath: artifact.sourcePath,
    repoPath: artifactRoot,
    gitCommitHash: versionCommit.commitHash,
    status: "ready_for_review",
    createdBy: "compiler",
  });
  if (input.input.revisionId) {
    updateCompiledWorkflowRevision(input.input.store, {
      revisionId: input.input.revisionId,
      proposedArtifactId: artifact.id,
      proposedGraphSnapshot: graphSnapshot,
    });
  }
  const run = input.input.store.startWorkflowRun({ artifactId: artifact.id, status: "previewed" });
  input.input.store.appendWorkflowRunEvent({
    runId: run.id,
    type: "workflow.compile",
    message: "Ambient planned a WorkflowProgramIR preview artifact.",
    data: {
      sourcePath: artifact.sourcePath,
      previewPath: artifactPaths.preview,
      graphPath: artifactPaths.graph,
      ...(artifactPaths.planDsl ? { planDslPath: artifactPaths.planDsl } : {}),
      ...(artifactPaths.loweredPlan ? { loweredPlanPath: artifactPaths.loweredPlan } : {}),
      compileContextPath: artifactPaths.compileContext,
      promptAssemblyPath: artifactPaths.promptAssembly,
      repairHistoryPath: artifactPaths.repairHistory,
      validationReportPath: artifactPaths.validationReport,
      repairAttemptCount,
      patchOperationCount,
      discoveryAnswerCount: input.compileContext.discoveryQuestions?.filter((question) => question.answer).length ?? 0,
      explorationTraceCount: input.compileContext.explorationTraces.length,
      inputGraphSnapshotId: input.compileContext.graphSnapshot?.id,
      selectedRecipeIds: input.selectedRecipes.map((recipe) => recipe.id),
      rejectedRecipeIds: input.recipeSelection.rejected.map((recipe) => recipe.id),
      recipePolicyImplicationIds: input.recipeSelection.policyImplications.map((implication) => implication.id),
      callableWorkflowInvocation: input.compileContext.callableWorkflowInvocation
        ? workflowCompilerCallableInvocationEventSnapshot(input.compileContext.callableWorkflowInvocation)
        : undefined,
      cacheCheckpoint,
      versionId: version.id,
      version: version.version,
      gitCommitHash: version.gitCommitHash,
    },
  });
  input.input.store.appendWorkflowRunEvent({
    runId: run.id,
    type: "workflow.validate",
    message: "WorkflowProgramIR artifact passed deterministic validation.",
    data: {
      tools: output.manifest.tools,
      compilerMode: "program_ir",
      validationMode: "program_ir_artifact",
      validationReportPath: artifactPaths.validationReport,
      validationReportStatus: validationReport.status,
      validatorCount: validationReport.validators.length,
      validationDiagnosticCount: validationReport.diagnosticSummary.diagnosticCount,
      connectorWriteOperationCount: validationReport.evidence.connectorWriteOperations.length,
    },
  });
  input.input.store.recordWorkflowModelCall({
    runId: run.id,
    task: "workflow.compiler",
    status: "succeeded",
    input: {
      userRequest: input.input.userRequest,
      workspaceSummary: input.input.workspaceSummary,
      discoveryQuestions: input.compileContext.discoveryQuestions,
      explorationTraces: input.compileContext.explorationTraces,
      graphSnapshot: input.compileContext.graphSnapshot,
      debugRewriteContext: input.input.debugRewriteContext,
      capabilityDiscoveryPlan: input.capabilityDiscovery.plan,
      capabilityDiscoverySearches: input.capabilityResolution.searches,
      capabilityDiscoveryDescriptions: input.capabilityResolution.descriptions,
      capabilityDiscoverySummary: input.capabilityResolution.summary,
      capabilityDiscoveryFallback: input.capabilityDiscovery.fallback,
      selectedToolNames: input.capabilitySelection.selectedToolNames,
      availableToolCount: input.capabilitySelection.availableToolCount,
      selectedConnectorIds: input.connectorSelection.selectedConnectorIds,
      availableConnectorCount: input.connectorSelection.availableConnectorCount,
      selectedRecipes: input.selectedRecipes,
      recipeSelection: input.recipeSelection,
      callableWorkflowInvocation: input.compileContext.callableWorkflowInvocation,
      prompt,
      promptAssembly,
    },
    output: raw,
    cacheCheckpoint,
    model: input.model,
    startedAt,
    completedAt,
  });
  input.emitProgress({
    phase: "recorded",
    status: "completed",
    message: "Recorded the workflow preview run.",
    current: 6,
    metrics: { artifactId: artifact.id, runId: run.id },
  });
  input.emitProgress({
    phase: "completed",
    status: "completed",
    message: "Workflow preview is ready for review.",
    current: 7,
    metrics: { artifactId: artifact.id, runId: run.id },
  });
  return readWorkflowDashboard(input.input.store);
}

function workflowCompilerCallableInvocationEventSnapshot(invocation: WorkflowCompilerCallableInvocationContext): Record<string, unknown> {
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
            metricCriteriaIds:
              invocation.sourceContext.invocationCustomization?.metricCriteria.map((criterion) => criterion.templateId) ?? [],
          },
        }
      : {}),
    ...(invocation.launchBridgeContract
      ? {
          symphonyLaunchBridge: {
            schemaVersion: invocation.launchBridgeContract.schemaVersion,
            patternId: invocation.launchBridgeContract.pattern.id,
            childRoleNodeIds: invocation.launchBridgeContract.childLaunches.map((child) => child.roleNodeId),
            waitMode: invocation.launchBridgeContract.wait.mode,
            waitFailurePolicy: invocation.launchBridgeContract.wait.failurePolicy,
          },
        }
      : {}),
    ...(invocation.launchBridgeEvidence
      ? { symphonyLaunchBridgeEvidence: workflowCompilerRunRecorderJsonClone(invocation.launchBridgeEvidence) }
      : {}),
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

function workflowCompilerRunRecorderJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
