import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  WorkflowArtifactSummary,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowGraphSnapshot,
  WorkflowManifest,
  WorkflowRevisionSummary,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import {
  diffWorkflowGraphs,
  workflowGraphDiffHasChanges,
  workflowGraphDiffSummary,
  type WorkflowGraphDiff,
} from "../../shared/workflowGraphDiff";
import { assertWorkflowArtifactSourceEditable } from "./workflowArtifactProvenance";
import { buildWorkflowSourceDiff } from "./workflowDebugRewrite";
import {
  type WorkflowArtifactSelection,
  type WorkflowNativeToolRuntime,
  errorMessage,
  isRecord,
  numberValue,
  optionalString,
  positiveInteger,
  requiredString,
  requireWorkflowThreadId,
  selectWorkflowArtifact,
} from "./workflowNativeToolShared";
import type { ProjectStore } from "./workflowProjectStoreFacade";
import { commitWorkflowVersionRepo } from "./workflowVersioning";
import {
  validateWorkflowGraphOutput,
  validateWorkflowSourceConnectorReferences,
  validateWorkflowSourceGraphMappings,
  validateWorkflowSourceReferences,
} from "./workflowWorkflowCompilerFacade";

export interface WorkflowRevisionValidationCheck {
  name: string;
  status: "passed" | "failed" | "warning" | "skipped";
  detail: string;
}

export interface WorkflowRevisionValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: WorkflowRevisionValidationCheck[];
  candidate: {
    hasManifest: boolean;
    hasSource: boolean;
    hasGraph: boolean;
    graphNodeCount?: number;
    graphEdgeCount?: number;
  };
}

export interface WorkflowRevisionCandidate {
  selected: WorkflowArtifactSelection;
  manifest?: WorkflowManifest;
  source?: string;
  graph?: WorkflowGraphSnapshot;
  revision?: WorkflowRevisionSummary;
}

interface MaterializedWorkflowRevisionProposal {
  revision: WorkflowRevisionSummary;
  version: WorkflowVersionSummary;
  artifact: WorkflowArtifactSummary;
  graphSnapshot: WorkflowGraphSnapshot;
}

export async function workflowProposeManifestRevision(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const requestedChange = optionalString(args.requestedChange) ?? manifestRevisionRequestedChange(args);
  const selected = selectWorkflowArtifact(runtime.store, args);
  if (!selected.artifact) {
    return rejectedRevisionProposal(validationFailure("base artifact", "No base workflow artifact is selected."));
  }
  const manifestResult = manifestRevisionCandidate(selected.artifact.manifest, args);
  if (!manifestResult.ok) return rejectedRevisionProposal(validationFailure("manifest patch", manifestResult.error));
  return workflowProposeRevision(
    { ...runtime, planEditIntentKind: undefined },
    {
      workflowThreadId: selected.thread.id,
      artifactId: selected.artifact.id,
      versionId: selected.version?.id,
      requestedChange,
      manifest: manifestResult.manifest,
    },
  );
}

export function manifestRevisionRequestedChange(args: Record<string, unknown>): string {
  const changes: string[] = [];
  if (typeof args.mutationPolicy === "string") changes.push(`set mutationPolicy to ${args.mutationPolicy}`);
  if (typeof args.defaultIdleTimeoutMs === "number") changes.push(`set defaultIdleTimeoutMs to ${args.defaultIdleTimeoutMs}`);
  if (typeof args.maxToolCalls === "number") changes.push(`set maxToolCalls to ${args.maxToolCalls}`);
  if (typeof args.maxModelCalls === "number") changes.push(`set maxModelCalls to ${args.maxModelCalls}`);
  if (typeof args.maxConnectorCalls === "number") changes.push(`set maxConnectorCalls to ${args.maxConnectorCalls}`);
  if (typeof args.maxRunMs === "number") changes.push(`set maxRunMs to ${args.maxRunMs}`);
  if (typeof args.requiresReviewBelowConfidence === "number") {
    changes.push(`set requiresReviewBelowConfidence to ${args.requiresReviewBelowConfidence}`);
  }
  if (args.clearMaxToolCalls === true) changes.push("clear maxToolCalls");
  if (args.clearMaxModelCalls === true) changes.push("clear maxModelCalls");
  if (args.clearMaxConnectorCalls === true) changes.push("clear maxConnectorCalls");
  if (args.clearDefaultIdleTimeoutMs === true) changes.push("clear defaultIdleTimeoutMs");
  if (args.clearMaxRunMs === true) changes.push("clear maxRunMs");
  if (args.clearRequiresReviewBelowConfidence === true) changes.push("clear requiresReviewBelowConfidence");
  return changes.length ? `Manifest-only edit: ${changes.join(", ")}.` : "Manifest-only workflow edit.";
}

export async function workflowProposeRevision(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  if (runtime.planEditIntentKind === "manifest_limits" || runtime.planEditIntentKind === "run_settings") {
    return rejectedRevisionProposal(
      validationFailure(
        "Plan/Edit intent",
        "This Plan/Edit turn is classified as a manifest or run-limit edit. Use workflow_propose_manifest_revision instead of workflow_propose_revision so graph and source stay unchanged.",
      ),
    );
  }
  const requestedChange = requiredString(args.requestedChange, "requestedChange");
  const candidateResult = await safeWorkflowRevisionCandidate(runtime, args);
  if (!candidateResult.ok) return rejectedRevisionProposal(candidateResult.validation);
  const candidate = candidateResult.candidate;
  const explicitManifest = args.manifest !== undefined;
  const explicitSource = typeof args.source === "string";
  const explicitGraph = args.graph !== undefined || Boolean(optionalString(args.proposedGraphSnapshotId));
  if (!explicitManifest && !explicitSource && !explicitGraph) {
    return rejectedRevisionProposal(
      validationFailure(
        "proposal input",
        "workflow_propose_revision requires at least one explicit candidate manifest, source, graph, or proposedGraphSnapshotId.",
      ),
    );
  }

  const validation = validateWorkflowRevisionCandidate(runtime, candidate, { storedRevisionOnlyWarning: false });
  if (!validation.valid) return rejectedRevisionProposal(validation);

  const graphDiff = workflowRevisionGraphDiff(candidate, { explicitManifest, explicitGraph });
  const sourceDiff = explicitSource ? await workflowRevisionSourceDiff(candidate) : undefined;
  if (!graphDiff && !sourceDiff) {
    return rejectedRevisionProposal(
      validationWithError(validation, "Proposal did not contain any graph, manifest, or source changes versus the selected base workflow."),
    );
  }

  let materialized: MaterializedWorkflowRevisionProposal | undefined;
  if (explicitSource || explicitGraph) {
    try {
      materialized = await materializeWorkflowRevisionProposal(runtime, candidate, {
        requestedChange,
        graphDiff,
        sourceDiff,
      });
    } catch (error) {
      return rejectedRevisionProposal(validationWithError(validation, `Revision materialization failed: ${errorMessage(error)}`));
    }
  }
  const revision =
    materialized?.revision ??
    runtime.store.createWorkflowRevision({
      workflowThreadId: candidate.selected.thread.id,
      requestedChange,
      baseVersionId: candidate.selected.version?.id,
      baseArtifactId: candidate.selected.artifact?.id,
      graphDiff,
      sourceDiff,
      status: "proposed",
    });
  return {
    created: true,
    revision,
    materializedVersion: materialized?.version,
    proposedArtifact: materialized?.artifact,
    proposedGraphSnapshot: materialized?.graphSnapshot,
    validation,
    diff: explainRevisionDiffPayload(revision.graphDiff, revision.sourceDiff),
    note: materialized
      ? "Revision proposal recorded with a materialized review version. It was not applied, activated, or run."
      : "Revision proposal recorded for review. It was not applied, activated, run, or written into generated workflow source.",
  };
}

async function materializeWorkflowRevisionProposal(
  runtime: WorkflowNativeToolRuntime,
  candidate: WorkflowRevisionCandidate,
  input: {
    requestedChange: string;
    graphDiff?: WorkflowGraphDiff;
    sourceDiff?: string;
  },
): Promise<MaterializedWorkflowRevisionProposal> {
  const baseArtifact = candidate.selected.artifact;
  if (!baseArtifact) throw new Error("No base workflow artifact is selected.");
  const workflowThreadId = candidate.selected.thread.id;
  const manifest = candidate.manifest;
  if (!manifest) throw new Error("No workflow manifest is available for the proposed version.");
  const graph = candidate.graph;
  if (!graph) throw new Error("No workflow graph is available for the proposed version.");

  const source = candidate.source ?? (await readFile(baseArtifact.sourcePath, "utf8"));
  if (candidate.source !== undefined) assertWorkflowArtifactSourceEditable(baseArtifact);
  validateWorkflowGraphOutput({ summary: graph.summary, nodes: graph.nodes, edges: graph.edges }, manifest);
  validateWorkflowSourceReferences(source, manifest);
  validateWorkflowSourceConnectorReferences(source, manifest, runtime.connectorDescriptors?.() ?? []);
  validateWorkflowSourceGraphMappings(source, { nodes: graph.nodes });

  const id = `workflow-revision-${slugForWorkflowRevisionTitle(baseArtifact.title)}-${randomUUID().slice(0, 8)}`;
  const artifactRoot = join(runtime.store.getWorkspace().statePath, "workflows", id);
  await mkdir(join(artifactRoot, "reports"), { recursive: true });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const specJson = `${JSON.stringify(baseArtifact.spec, null, 2)}\n`;
  const graphJson = `${JSON.stringify({ summary: graph.summary, nodes: graph.nodes, edges: graph.edges }, null, 2)}\n`;
  const preview = [
    `# ${baseArtifact.title}`,
    "",
    baseArtifact.spec.summary ?? baseArtifact.spec.goal,
    "",
    "## Proposed Revision",
    "",
    input.requestedChange,
    "",
  ].join("\n");
  await writeFile(join(artifactRoot, "manifest.json"), manifestJson, "utf8");
  await writeFile(join(artifactRoot, "spec.json"), specJson, "utf8");
  await writeFile(join(artifactRoot, "main.ts"), source, "utf8");
  await writeFile(join(artifactRoot, "graph.json"), graphJson, "utf8");
  await writeFile(join(artifactRoot, "preview.md"), preview, "utf8");
  await writeFile(
    join(artifactRoot, "compile-context.json"),
    `${JSON.stringify(
      {
        source: "workflow_revision",
        workflowThreadId,
        baseArtifactId: baseArtifact.id,
        baseVersionId: candidate.selected.version?.id,
        requestedChange: input.requestedChange,
        graphDiff: input.graphDiff,
        sourceDiff: input.sourceDiff,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const artifact = runtime.store.createWorkflowArtifact({
    id,
    workflowThreadId,
    title: baseArtifact.title,
    status: "ready_for_preview",
    manifest,
    spec: baseArtifact.spec,
    sourcePath: join(artifactRoot, "main.ts"),
    statePath: join(artifactRoot, "state.json"),
    activate: false,
  });
  const graphSnapshot = runtime.store.createWorkflowGraphSnapshot({
    workflowThreadId,
    source: "revision",
    summary: graph.summary,
    nodes: cloneWorkflowGraphNodes(graph.nodes),
    edges: cloneWorkflowGraphEdges(graph.edges),
    artifactPath: join(artifactRoot, "graph.json"),
    activate: false,
  });
  const versionCommit = await commitWorkflowVersionRepo({
    repoPath: artifactRoot,
    message: `Propose workflow revision for ${baseArtifact.title}`,
  });
  const version = runtime.store.createWorkflowVersion({
    workflowThreadId,
    artifactId: artifact.id,
    graphSnapshotId: graphSnapshot.id,
    sourcePath: artifact.sourcePath,
    repoPath: artifactRoot,
    gitCommitHash: versionCommit.commitHash,
    status: "ready_for_review",
    createdBy: "workflow_revision",
  });
  const revision = runtime.store.createWorkflowRevision({
    workflowThreadId,
    requestedChange: input.requestedChange,
    baseVersionId: candidate.selected.version?.id,
    baseArtifactId: baseArtifact.id,
    proposedGraphSnapshotId: graphSnapshot.id,
    graphDiff: input.graphDiff,
    sourceDiff: input.sourceDiff,
    status: "proposed",
  });
  return { revision, version, artifact, graphSnapshot };
}

export async function workflowValidateRevision(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const candidateResult = await safeWorkflowRevisionCandidate(runtime, args);
  if (!candidateResult.ok) return candidateResult.validation;
  const validation = validateWorkflowRevisionCandidate(runtime, candidateResult.candidate, {
    storedRevisionOnlyWarning:
      Boolean(candidateResult.candidate.revision) && args.manifest === undefined && args.source === undefined && args.graph === undefined,
  });
  if (!candidateResult.candidate.revision) return validation;
  return {
    ...validation,
    workflowThreadId: candidateResult.candidate.revision.workflowThreadId,
    revision: candidateResult.candidate.revision,
  };
}

export async function workflowExplainRevisionDiff(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>) {
  const workflowThreadId = requireWorkflowThreadId(args);
  const revisionId = optionalString(args.revisionId);
  if (revisionId) {
    const revision = runtime.store.getWorkflowRevision(revisionId);
    assertRevisionBelongsToThread(revision, workflowThreadId);
    return {
      workflowThreadId,
      revision,
      ...explainRevisionDiffPayload(revision.graphDiff, revision.sourceDiff),
    };
  }

  const candidateResult = await safeWorkflowRevisionCandidate(runtime, args);
  if (!candidateResult.ok) {
    return {
      workflowThreadId,
      validation: candidateResult.validation,
      graphSummary: "No diff available because the candidate could not be parsed.",
      sourceSummary: "No source diff available.",
      bullets: candidateResult.validation.errors,
    };
  }
  const candidate = candidateResult.candidate;
  const currentGraph =
    graphFromUnknown(args.currentGraph, workflowThreadId, candidate.selected.graph, "currentGraph") ?? candidate.selected.graph;
  const currentManifest = manifestFromUnknown(args.currentManifest, "currentManifest") ?? candidate.selected.artifact?.manifest;
  const proposedGraph = candidate.graph ?? currentGraph;
  const proposedManifest = candidate.manifest ?? currentManifest;
  const graphDiff =
    currentGraph && proposedGraph
      ? nullableGraphDiff(
          diffWorkflowGraphs({
            current: currentGraph,
            proposed: proposedGraph,
            currentManifest,
            proposedManifest,
          }),
        )
      : undefined;
  const sourceDiff = typeof args.source === "string" ? await workflowRevisionSourceDiff(candidate) : undefined;
  return {
    workflowThreadId,
    validation: validateWorkflowRevisionCandidate(runtime, candidate, { storedRevisionOnlyWarning: false }),
    ...explainRevisionDiffPayload(graphDiff, sourceDiff),
  };
}

function slugForWorkflowRevisionTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "workflow"
  );
}

function cloneWorkflowGraphNodes(nodes: WorkflowGraphNode[]): WorkflowGraphNode[] {
  return nodes.map((node) => ({
    ...node,
    toolNames: node.toolNames ? [...node.toolNames] : undefined,
    connectorIds: node.connectorIds ? [...node.connectorIds] : undefined,
    sourceRanges: node.sourceRanges ? node.sourceRanges.map((range) => ({ ...range })) : undefined,
  }));
}

function cloneWorkflowGraphEdges(edges: WorkflowGraphEdge[]): WorkflowGraphEdge[] {
  return edges.map((edge) => ({ ...edge }));
}

async function safeWorkflowRevisionCandidate(
  runtime: WorkflowNativeToolRuntime,
  args: Record<string, unknown>,
): Promise<{ ok: true; candidate: WorkflowRevisionCandidate } | { ok: false; validation: WorkflowRevisionValidationReport }> {
  try {
    return { ok: true, candidate: workflowRevisionCandidate(runtime, args) };
  } catch (error) {
    return { ok: false, validation: validationFailure("candidate parsing", errorMessage(error)) };
  }
}

export function workflowRevisionCandidate(runtime: WorkflowNativeToolRuntime, args: Record<string, unknown>): WorkflowRevisionCandidate {
  const workflowThreadId = requireWorkflowThreadId(args);
  const revisionId = optionalString(args.revisionId);
  const revision = revisionId ? runtime.store.getWorkflowRevision(revisionId) : undefined;
  if (revision) assertRevisionBelongsToThread(revision, workflowThreadId);
  const selected = selectWorkflowArtifact(runtime.store, {
    ...args,
    workflowThreadId,
    versionId: optionalString(args.versionId) ?? optionalString(args.baseVersionId) ?? revision?.baseVersionId,
    artifactId: optionalString(args.artifactId) ?? optionalString(args.baseArtifactId) ?? revision?.baseArtifactId,
  });
  const proposedVersion = revision?.proposedVersionId ? runtime.store.getWorkflowVersion(revision.proposedVersionId) : undefined;
  const proposedArtifact = proposedVersion ? runtime.store.getWorkflowArtifact(proposedVersion.artifactId) : undefined;
  const manifest = manifestFromUnknown(args.manifest, "manifest") ?? proposedArtifact?.manifest ?? selected.artifact?.manifest;
  const graph =
    graphFromUnknown(args.graph, workflowThreadId, selected.graph, "graph") ??
    graphSnapshotById(runtime.store, workflowThreadId, optionalString(args.proposedGraphSnapshotId) ?? revision?.proposedGraphSnapshotId) ??
    selected.graph;
  return {
    selected,
    revision,
    manifest,
    source: typeof args.source === "string" ? args.source : undefined,
    graph,
  };
}

export function validateWorkflowRevisionCandidate(
  runtime: WorkflowNativeToolRuntime,
  candidate: WorkflowRevisionCandidate,
  input: { storedRevisionOnlyWarning: boolean },
): WorkflowRevisionValidationReport {
  const checks: WorkflowRevisionValidationCheck[] = [];
  const connectorDescriptors = runtime.connectorDescriptors?.() ?? [];
  addCheck(checks, "workflow thread", () => {
    runtime.store.getWorkflowAgentThreadSummary(candidate.selected.thread.id);
    return `Workflow thread ${candidate.selected.thread.id} exists.`;
  });
  addCheck(checks, "base artifact", () => {
    if (!candidate.selected.artifact) throw new Error("No base workflow artifact is selected.");
    return `Base artifact ${candidate.selected.artifact.id} selected.`;
  });
  addCheck(checks, "manifest shape", () => {
    validateManifestShape(candidate.manifest);
    return `Manifest declares ${candidate.manifest?.tools.length ?? 0} tool${candidate.manifest?.tools.length === 1 ? "" : "s"}.`;
  });
  addCheck(checks, "plugin capability grants", () => {
    validatePluginCapabilityShape(candidate.manifest);
    return "Plugin capability grants align with manifest tools.";
  });
  addCheck(checks, "ambient cli grants", () => {
    validateAmbientCliCapabilityShape(candidate.manifest);
    return "Ambient CLI grants align with manifest tools.";
  });
  addCheck(checks, "run limits", () => {
    validateRunLimitShape(candidate.manifest);
    return "Run limits are positive when provided.";
  });
  if (candidate.graph && candidate.manifest) {
    addCheck(checks, "graph references", () => {
      validateWorkflowGraphOutput(
        {
          summary: candidate.graph?.summary ?? "Workflow graph",
          nodes: candidate.graph?.nodes ?? [],
          edges: candidate.graph?.edges ?? [],
        },
        candidate.manifest!,
      );
      return `Graph validates with ${candidate.graph?.nodes.length ?? 0} node${candidate.graph?.nodes.length === 1 ? "" : "s"}.`;
    });
  } else {
    checks.push({ name: "graph references", status: "skipped", detail: "No graph and manifest pair was available for graph validation." });
  }
  if (candidate.source !== undefined && candidate.manifest) {
    addCheck(checks, "source mutability", () => {
      if (!candidate.selected.artifact) throw new Error("No base workflow artifact is selected.");
      assertWorkflowArtifactSourceEditable(candidate.selected.artifact);
      return "Legacy source candidate may be validated at the source layer.";
    });
    addCheck(checks, "source references", () => {
      validateWorkflowSourceReferences(candidate.source ?? "", candidate.manifest!);
      return "Source references declared workflow tools and Ambient SDK primitives.";
    });
    addCheck(checks, "connector source references", () => {
      validateWorkflowSourceConnectorReferences(candidate.source ?? "", candidate.manifest!, connectorDescriptors);
      return "Connector calls match declared connector grants and available operations.";
    });
    if (candidate.graph) {
      addCheck(checks, "program graph mappings", () => {
        validateWorkflowSourceGraphMappings(candidate.source ?? "", { nodes: candidate.graph?.nodes ?? [] });
        return "Generated program nodeId metadata maps to graph nodes.";
      });
    } else {
      checks.push({ name: "program graph mappings", status: "skipped", detail: "No graph was available for program mapping validation." });
    }
  } else {
    checks.push({
      name: "source references",
      status: "skipped",
      detail: candidate.source === undefined ? "No proposed source was provided." : "No manifest was available for source validation.",
    });
  }
  if (input.storedRevisionOnlyWarning) {
    checks.push({
      name: "stored revision payload",
      status: "warning",
      detail:
        "Stored revision records retain diffs, not full proposed source/manifest. Pass a candidate source, manifest, and graph to revalidate the full proposal.",
    });
  }
  const errors = checks.filter((check) => check.status === "failed").map((check) => `${check.name}: ${check.detail}`);
  const warnings = checks.filter((check) => check.status === "warning").map((check) => `${check.name}: ${check.detail}`);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks,
    candidate: {
      hasManifest: Boolean(candidate.manifest),
      hasSource: candidate.source !== undefined,
      hasGraph: Boolean(candidate.graph),
      graphNodeCount: candidate.graph?.nodes.length,
      graphEdgeCount: candidate.graph?.edges.length,
    },
  };
}

function rejectedRevisionProposal(validation: WorkflowRevisionValidationReport) {
  return {
    created: false,
    validation,
    note: "No workflow revision record was created. Fix the candidate and retry workflow_propose_revision.",
  };
}

function workflowRevisionGraphDiff(
  candidate: WorkflowRevisionCandidate,
  input: { explicitManifest: boolean; explicitGraph: boolean },
): WorkflowGraphDiff | undefined {
  const currentGraph = candidate.selected.graph;
  if (!currentGraph || !candidate.graph) return undefined;
  if (!input.explicitManifest && !input.explicitGraph) return undefined;
  return nullableGraphDiff(
    diffWorkflowGraphs({
      current: currentGraph,
      proposed: candidate.graph,
      currentManifest: candidate.selected.artifact?.manifest,
      proposedManifest: candidate.manifest,
    }),
  );
}

async function workflowRevisionSourceDiff(candidate: WorkflowRevisionCandidate): Promise<string | undefined> {
  if (candidate.source === undefined) return undefined;
  if (!candidate.selected.artifact) throw new Error("Cannot diff proposed source because no base artifact is selected.");
  const baseSource = await readFile(candidate.selected.artifact.sourcePath, "utf8");
  return buildWorkflowSourceDiff(baseSource, candidate.source, {
    beforeLabel: "base/main.ts",
    afterLabel: "proposed/main.ts",
  });
}

function explainRevisionDiffPayload(graphDiff: unknown, sourceDiff: string | undefined) {
  const typedGraphDiff = isWorkflowGraphDiff(graphDiff) ? graphDiff : undefined;
  const graphSummary = typedGraphDiff
    ? workflowGraphDiffSummary(typedGraphDiff)
    : graphDiff
      ? "Stored graph diff is not in a recognized shape."
      : "No graph or manifest diff recorded.";
  const sourceSummary = sourceDiffSummary(sourceDiff);
  const bullets = [typedGraphDiff ? graphSummary : undefined, sourceDiff ? sourceSummary : undefined].filter((line): line is string =>
    Boolean(line),
  );
  return {
    graphSummary,
    sourceSummary,
    bullets,
    graphDiff,
    sourceDiff,
  };
}

function nullableGraphDiff(diff: WorkflowGraphDiff): WorkflowGraphDiff | undefined {
  return workflowGraphDiffHasChanges(diff) ? diff : undefined;
}

function manifestRevisionCandidate(
  current: WorkflowManifest,
  args: Record<string, unknown>,
): { ok: true; manifest: WorkflowManifest } | { ok: false; error: string } {
  const manifest: WorkflowManifest = {
    ...current,
    tools: [...current.tools],
    connectors: current.connectors ? current.connectors.map((connector) => ({ ...connector })) : undefined,
    pluginCapabilities: current.pluginCapabilities ? current.pluginCapabilities.map((capability) => ({ ...capability })) : undefined,
    ambientCliCapabilities: current.ambientCliCapabilities
      ? current.ambientCliCapabilities.map((capability) => ({ ...capability }))
      : undefined,
  };
  let changed = false;

  const mutationPolicy = optionalString(args.mutationPolicy);
  if (mutationPolicy !== undefined) {
    if (!["read_only", "staged_until_approved", "apply_after_approval"].includes(mutationPolicy)) {
      return { ok: false, error: `Unsupported mutationPolicy: ${mutationPolicy}.` };
    }
    manifest.mutationPolicy = mutationPolicy as WorkflowManifest["mutationPolicy"];
    changed = true;
  }

  for (const field of ["defaultIdleTimeoutMs", "maxToolCalls", "maxModelCalls", "maxConnectorCalls", "maxRunMs"] as const) {
    const clearField = args[`clear${field[0].toUpperCase()}${field.slice(1)}`] === true;
    if (clearField) {
      delete manifest[field];
      changed = true;
      continue;
    }
    if (args[field] !== undefined) {
      const value = positiveInteger(args[field], field);
      if (typeof value === "string") return { ok: false, error: value };
      manifest[field] = value;
      changed = true;
    }
  }

  if (args.clearRequiresReviewBelowConfidence === true) {
    delete manifest.requiresReviewBelowConfidence;
    changed = true;
  } else if (args.requiresReviewBelowConfidence !== undefined) {
    const value = numberValue(args.requiresReviewBelowConfidence);
    if (value === undefined || value < 0 || value > 1)
      return { ok: false, error: "requiresReviewBelowConfidence must be between 0 and 1." };
    manifest.requiresReviewBelowConfidence = value;
    changed = true;
  }

  if (!changed) return { ok: false, error: "No manifest limit, budget, review-threshold, or mutation-policy fields were provided." };
  return { ok: true, manifest };
}

export function graphSnapshotById(
  store: ProjectStore,
  workflowThreadId: string,
  graphSnapshotId: string | undefined,
): WorkflowGraphSnapshot | undefined {
  if (!graphSnapshotId) return undefined;
  const snapshot = store.listWorkflowGraphSnapshots(workflowThreadId).find((candidate) => candidate.id === graphSnapshotId);
  if (!snapshot) throw new Error(`Workflow graph snapshot does not belong to the requested workflow thread: ${graphSnapshotId}`);
  return snapshot;
}

function graphFromUnknown(
  value: unknown,
  workflowThreadId: string,
  baseGraph: WorkflowGraphSnapshot | undefined,
  label: string,
): WorkflowGraphSnapshot | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${label} must be an object with summary, nodes, and edges.`);
  if (!Array.isArray(value.nodes)) throw new Error(`${label}.nodes must be an array.`);
  if (!Array.isArray(value.edges)) throw new Error(`${label}.edges must be an array.`);
  return {
    id: optionalString(value.id) ?? `${label}-candidate`,
    workflowThreadId,
    version:
      typeof value.version === "number" && Number.isFinite(value.version) ? Math.floor(value.version) : (baseGraph?.version ?? 0) + 1,
    source: "revision",
    summary: optionalString(value.summary) ?? baseGraph?.summary ?? "Proposed workflow graph",
    nodes: value.nodes as WorkflowGraphNode[],
    edges: value.edges as WorkflowGraphEdge[],
    artifactPath: optionalString(value.artifactPath),
    createdAt: optionalString(value.createdAt) ?? new Date(0).toISOString(),
  };
}

export function manifestFromUnknown(value: unknown, label: string): WorkflowManifest | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value as unknown as WorkflowManifest;
}

function validateManifestShape(manifest: WorkflowManifest | undefined): asserts manifest is WorkflowManifest {
  if (!manifest) throw new Error("No workflow manifest is available.");
  if (
    !Array.isArray(manifest.tools) ||
    manifest.tools.length === 0 ||
    manifest.tools.some((tool) => typeof tool !== "string" || !tool.trim())
  ) {
    throw new Error("Manifest tools must be a non-empty string array.");
  }
  if (!["read_only", "staged_until_approved", "apply_after_approval"].includes(manifest.mutationPolicy)) {
    throw new Error(`Manifest mutationPolicy is invalid: ${String(manifest.mutationPolicy)}`);
  }
}

function validatePluginCapabilityShape(manifest: WorkflowManifest | undefined): void {
  validateManifestShape(manifest);
  const seen = new Set<string>();
  for (const grant of manifest.pluginCapabilities ?? []) {
    if (!manifest.tools.includes(grant.registeredName)) {
      throw new Error(`Plugin capability ${grant.registeredName} is not listed in manifest.tools.`);
    }
    if (seen.has(grant.registeredName)) throw new Error(`Duplicate plugin capability grant: ${grant.registeredName}`);
    seen.add(grant.registeredName);
  }
}

function validateAmbientCliCapabilityShape(manifest: WorkflowManifest | undefined): void {
  validateManifestShape(manifest);
  const grants = manifest.ambientCliCapabilities ?? [];
  if (grants.length > 0 && !manifest.tools.includes("ambient_cli"))
    throw new Error("Ambient CLI grants require manifest tool ambient_cli.");
  const seen = new Set<string>();
  for (const grant of grants) {
    if (seen.has(grant.capabilityId)) throw new Error(`Duplicate Ambient CLI capability grant: ${grant.capabilityId}`);
    seen.add(grant.capabilityId);
  }
}

function validateRunLimitShape(manifest: WorkflowManifest | undefined): void {
  validateManifestShape(manifest);
  for (const field of ["defaultIdleTimeoutMs", "maxToolCalls", "maxModelCalls", "maxConnectorCalls", "maxRunMs"] as const) {
    const value = manifest[field];
    if (value !== undefined && (!Number.isFinite(value) || value <= 0))
      throw new Error(`Manifest ${field} must be positive when provided.`);
  }
}

function addCheck(checks: WorkflowRevisionValidationCheck[], name: string, run: () => string): void {
  try {
    checks.push({ name, status: "passed", detail: run() });
  } catch (error) {
    checks.push({ name, status: "failed", detail: errorMessage(error) });
  }
}

function validationFailure(name: string, detail: string): WorkflowRevisionValidationReport {
  return {
    valid: false,
    errors: [`${name}: ${detail}`],
    warnings: [],
    checks: [{ name, status: "failed", detail }],
    candidate: {
      hasManifest: false,
      hasSource: false,
      hasGraph: false,
    },
  };
}

function validationWithError(report: WorkflowRevisionValidationReport, detail: string): WorkflowRevisionValidationReport {
  return {
    ...report,
    valid: false,
    errors: [...report.errors, `proposal diff: ${detail}`],
    checks: [...report.checks, { name: "proposal diff", status: "failed", detail }],
  };
}

export function assertRevisionBelongsToThread(revision: WorkflowRevisionSummary, workflowThreadId: string): void {
  if (revision.workflowThreadId !== workflowThreadId)
    throw new Error("Workflow revision does not belong to the requested workflow thread.");
}

export function isWorkflowGraphDiff(value: unknown): value is WorkflowGraphDiff {
  return (
    isRecord(value) &&
    typeof value.currentGraphId === "string" &&
    typeof value.proposedGraphId === "string" &&
    Array.isArray(value.addedNodes) &&
    Array.isArray(value.removedNodes) &&
    Array.isArray(value.changedNodes) &&
    Array.isArray(value.addedEdges) &&
    Array.isArray(value.removedEdges) &&
    Array.isArray(value.changedEdges) &&
    isRecord(value.manifest)
  );
}

function sourceDiffSummary(diff: string | undefined): string {
  if (!diff) return "No source diff recorded.";
  const added = diff.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = diff.split(/\r?\n/).filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  return `${added} source line${added === 1 ? "" : "s"} added, ${removed} source line${removed === 1 ? "" : "s"} removed.`;
}
