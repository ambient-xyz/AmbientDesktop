import type {
  WorkflowAmbientCliCapabilityGrant,
  WorkflowCompileProgress,
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowDiscoveryQuestion,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
} from "../../shared/workflowTypes";
import { searchAmbientCliCapabilities } from "./workflowCompilerAmbientCliFacade";
import type { WorkflowCompilerCallableInvocationContext } from "./workflowCompilerCallableInvocationPrompt";
import {
  buildWorkflowCompilerCapabilityDiscoveryPrompt,
  validateWorkflowCompilerCapabilityDiscoveryOutput,
  workflowAmbientCliCapabilitiesFromSearch,
  type WorkflowCompilerAmbientCliCapability,
  type WorkflowCompilerCapabilityDiscoveryPlan,
} from "./workflowCompiler";
import type { CompileWorkflowArtifactInput, WorkflowCompilerProvider } from "./workflowCompilerService";
import type { ProjectStore } from "./workflowCompilerProjectStoreFacade";
import type { WorkflowCompilerRecipeSelectionResult, WorkflowCompilerSelectedRecipe } from "./workflowCompilerRecipes";
import {
  buildWorkflowDiscoveryPolicyContext,
  describeWorkflowDiscoveryCapability,
  searchWorkflowDiscoveryCapabilities,
  type WorkflowDiscoveryAmbientCliCapability,
  workflowDiscoveryCapabilityAwarePolicySummary,
} from "./workflowCompilerWorkflowDiscoveryFacade";

export interface WorkflowCompileContext {
  discoveryQuestions: WorkflowDiscoveryQuestion[];
  explorationTraces: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
  callableWorkflowInvocation?: WorkflowCompilerCallableInvocationContext;
  recipeSelection?: WorkflowCompilerRecipeSelectionResult;
  selectedRecipes?: WorkflowCompilerSelectedRecipe[];
  capabilityDiscoverySummary?: string;
}

export interface WorkflowCompilerCapabilityDiscoveryResolution {
  capabilityQueries: string[];
  requiredToolNames: string[];
  requiredConnectorIds: string[];
  blockedToolNames: string[];
  searches: WorkflowDiscoveryCapabilitySearch[];
  descriptions: WorkflowDiscoveryCapabilityDescription[];
  summary?: string;
}

export async function discoverWorkflowCompilerCapabilities(input: {
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

export async function resolveWorkflowCompilerCapabilityDiscovery(input: {
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
    capabilityQueries: uniqueStrings([...planQueries, ...searches.flatMap((search) => search.results.map((result) => result.label))]).slice(
      0,
      12,
    ),
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
      ? search.results.map((result) => `${result.label} (${result.kind.replace(/_/g, " ")}, ${result.recommendation})`).join("; ")
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

export function workflowCompilerWorkspaceSummary(
  base: string | undefined,
  capabilityDiscoverySummary: string | undefined,
): string | undefined {
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

export function workflowCompileContext(store: ProjectStore, workflowThreadId: string): WorkflowCompileContext {
  const discoveryQuestions = store.listWorkflowDiscoveryQuestions(workflowThreadId);
  const explorationTraces = store.listWorkflowExplorationTraces(workflowThreadId).slice(0, 3);
  const graphSnapshot = store.listWorkflowGraphSnapshots(workflowThreadId)[0];
  return { discoveryQuestions, explorationTraces, graphSnapshot };
}

export async function workflowAmbientCliCapabilitiesForCompile(input: {
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

export function shouldIncludeWorkflowAmbientCliCapabilities(input: { selectedToolNames: string[]; availableToolNames: string[] }): boolean {
  if (input.selectedToolNames.some((toolName) => toolName.startsWith("ambient_cli"))) return true;
  return input.availableToolNames.length === 0;
}

async function workflowAmbientCliCapabilitiesForRequest(
  workspacePath: string,
  userRequest: string,
): Promise<WorkflowCompilerAmbientCliCapability[]> {
  try {
    const response = await searchAmbientCliCapabilities(workspacePath, {
      query: userRequest,
      kind: "command",
      limit: 6,
      includeHealth: false,
    });
    return workflowAmbientCliCapabilitiesFromSearch(response)
      .filter((capability) => capability.availability === "available")
      .slice(0, 8);
  } catch {
    return [];
  }
}

function workflowAmbientCliCapabilitiesFromExplorationTraces(
  traces: WorkflowExplorationTraceSummary[],
): WorkflowCompilerAmbientCliCapability[] {
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

function workflowAmbientCliCapabilityFromGrant(
  grant: WorkflowAmbientCliCapabilityGrant,
  whyMatched: string,
): WorkflowCompilerAmbientCliCapability {
  return {
    ...grant,
    availability: "available",
    risk: [],
    missingEnv: [],
    whyMatched: [whyMatched],
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
