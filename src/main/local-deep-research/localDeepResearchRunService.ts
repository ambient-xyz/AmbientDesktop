import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type {
  LocalDeepResearchProviderSnapshot,
  LocalDeepResearchRunBudget,
  LocalDeepResearchRunHistoryEntry,
  LocalDeepResearchRunHistoryInput,
  LocalDeepResearchRunHistoryResult,
  LocalModelResourcePolicyDecision,
} from "../../shared/types";
import {
  enforceLocalModelResourceLaunchPolicy,
  type LocalModelResourceLaunchPreflightResult,
} from "../local-runtime/localModelResourceRegistry";
import { createLocalDeepResearchLlamaChatClient, type LocalDeepResearchLlamaChatClientOptions } from "./localDeepResearchLlamaClient";
import { buildLocalDeepResearchLlamaServerAcquireInput } from "./localDeepResearchServerSupervisor";
import {
  localDeepResearchEvidencePacket,
  localDeepResearchObservedEvidenceUrls,
  runLocalDeepResearch,
  type LocalDeepResearchRunProgressEvent,
  type LocalDeepResearchRunResult,
} from "./localDeepResearchRunner";
import {
  localDeepResearchLlamaServerStatus,
  localDeepResearchMemoryStatus,
  sampleLocalDeepResearchHostPressure,
  sampleLocalDeepResearchLlamaServerStatus,
  type LocalDeepResearchRetrievalStatus,
  type LocalDeepResearchStatusSnapshotInput,
} from "./localDeepResearchStatus";
import type { LocalDeepResearchBroker } from "./localDeepResearchAdapter";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { LocalLlamaServerSupervisor, type LocalLlamaServerLease } from "../localLlamaServerSupervisor";
import type { LocalLlamaServerAcquireInput } from "../localLlamaServerSupervisor";
import { writeWorkspaceTextFile } from "../workspaceFiles";
import type { LocalDeepResearchFinalSynthesisConfig } from "../../shared/types";

const localDeepResearchRunArtifactsRoot = ".ambient/local-deep-research/runs";

export interface LocalDeepResearchRunRequest {
  workspacePath: string;
  question: string;
  setup: LocalDeepResearchSetupContract;
  managedAssets: LocalDeepResearchManagedAssetDetection;
  broker: LocalDeepResearchBroker;
  ownerThreadId?: string;
  approveResourceLimitExceed?: (decision: LocalModelResourcePolicyDecision) => Promise<boolean> | boolean;
  killLocalModelProcess?: (pid: number, signal?: NodeJS.Signals) => void;
  supervisor?: LocalLlamaServerSupervisor;
  serverOptions?: Partial<Pick<LocalLlamaServerAcquireInput, "host" | "port" | "gpuLayers" | "startupTimeoutMs" | "idleTimeoutMs" | "offline" | "extraArgs" | "env">>;
  chatOptions?: Partial<Omit<LocalDeepResearchLlamaChatClientOptions, "endpointUrl">>;
  localResearchBudget?: LocalDeepResearchRunBudget;
  maxToolCalls?: number;
  maxTurns?: number;
  finalSynthesis?: Partial<LocalDeepResearchFinalSynthesisConfig>;
  now?: () => Date;
  signal?: AbortSignal;
  onProgress?: (progress: LocalDeepResearchRunServiceProgressEvent) => void;
}

export type LocalDeepResearchRunServiceProgressEvent = Omit<
  LocalDeepResearchStatusSnapshotInput,
  "startedAtMs" | "startedAt" | "nowMs" | "heartbeatCount"
>;

export interface LocalDeepResearchRunArtifactSummary {
  jsonPath: string;
  markdownPath: string;
  jsonBytes: number;
  markdownBytes: number;
}

export interface LocalDeepResearchRunServiceResult {
  schemaVersion: "ambient-local-deep-research-service-result-v1";
  status: LocalDeepResearchRunResult["status"];
  finalText?: string;
  error?: string;
  run: LocalDeepResearchRunResult;
  artifacts: LocalDeepResearchRunArtifactSummary;
  localModelResourcePreflight: LocalModelResourceLaunchPreflightResult;
  llamaServer: {
    endpointUrl: string;
    pid: number;
    profileId: string;
    modelPath: string;
    runtimeBinaryPath: string;
    stateDir: string;
    logPath: string;
    stdoutPath: string;
    stderrPath: string;
  };
  release: {
    status: string;
    remainingLeases?: number;
  };
}

export async function runLocalDeepResearchWithManagedLlama(input: LocalDeepResearchRunRequest): Promise<LocalDeepResearchRunServiceResult> {
  throwIfAborted(input.signal);
  const hostPressure = await sampleLocalDeepResearchHostPressure().catch(() => undefined);
  input.onProgress?.({
    stage: "resource-policy",
    message: localDeepResearchResourcePolicyMessage(input.setup.localModelResources.policyDecision.outcome),
    memory: localDeepResearchMemoryStatus(input.setup.localModelResources, input.setup.warnings, hostPressure),
  });
  const localModelResourcePreflight = await enforceLocalModelResourceLaunchPolicy({
    registry: input.setup.localModelResources,
    approveExceed: input.approveResourceLimitExceed,
    killProcess: input.killLocalModelProcess,
  });
  if (!localModelResourcePreflight.allowed) {
    throw new Error(localModelResourcePreflight.reason);
  }
  const supervisor = input.supervisor ?? new LocalLlamaServerSupervisor();
  input.onProgress?.({
    stage: "acquiring-server",
    message: "Acquiring managed Local Deep Research llama.cpp server.",
    memory: localDeepResearchMemoryStatus(input.setup.localModelResources, input.setup.warnings, hostPressure),
  });
  const lease = await supervisor.acquire(buildLocalDeepResearchLlamaServerAcquireInput({
    workspacePath: input.workspacePath,
    setup: input.setup,
    managedAssets: input.managedAssets,
    ownerThreadId: input.ownerThreadId,
    ...input.serverOptions,
  }));
  try {
    input.onProgress?.({
      stage: "server-ready",
      message: `Using managed llama.cpp server pid ${lease.state.pid} at ${lease.state.endpointUrl}.`,
      llamaServer: await sampleLocalDeepResearchLlamaServerStatus(lease.state).catch(() => localDeepResearchLlamaServerStatus(lease.state)),
      memory: localDeepResearchMemoryStatus(input.setup.localModelResources, input.setup.warnings, hostPressure),
    });
    throwIfAborted(input.signal);
    const chat = createLocalDeepResearchLlamaChatClient({
      endpointUrl: lease.state.endpointUrl,
      modelId: input.setup.modelInstall.selectedProfileId,
      maxTokens: 4096,
      requestTimeoutMs: 120_000,
      signal: input.signal,
      ...input.chatOptions,
    });
    const run = await runLocalDeepResearch({
      question: input.question,
      setup: input.setup,
      chat,
      broker: input.broker,
      localResearchBudget: input.localResearchBudget,
      maxToolCalls: input.maxToolCalls,
      maxTurns: input.maxTurns,
      finalSynthesis: input.finalSynthesis,
      onProgress: (progress) => input.onProgress?.(localDeepResearchRunProgressToStatus(progress)),
    });
    input.onProgress?.({
      stage: "artifact-write",
      message: `Writing Local Deep Research ${run.status} artifacts.`,
      llamaServer: localDeepResearchLlamaServerStatus(lease.state),
      memory: localDeepResearchMemoryStatus(input.setup.localModelResources, input.setup.warnings, hostPressure),
    });
    const artifacts = await persistLocalDeepResearchRunArtifacts(input.workspacePath, {
      run,
      setup: input.setup,
      managedAssets: input.managedAssets,
      lease,
      now: input.now,
    });
    await lease.release();
    input.onProgress?.({
      stage: run.status === "completed" || run.status === "synthesis-deferred" ? "completed" : "failed",
      state: run.status === "completed" || run.status === "synthesis-deferred" ? "completed" : "failed",
      message: run.status === "completed"
        ? "Local Deep Research completed."
        : run.status === "synthesis-deferred"
          ? "Local Deep Research gathered evidence and deferred final synthesis."
          : `Local Deep Research finished with ${run.status}.`,
      artifacts,
      llamaServer: localDeepResearchLlamaServerStatus(lease.state),
      memory: localDeepResearchMemoryStatus(input.setup.localModelResources, input.setup.warnings, hostPressure),
      ...(run.error ? { error: run.error } : {}),
    });
    return {
      schemaVersion: "ambient-local-deep-research-service-result-v1",
      status: run.status,
      ...(run.finalText ? { finalText: run.finalText } : {}),
      ...(run.error ? { error: run.error } : {}),
      run,
      artifacts,
      localModelResourcePreflight,
      llamaServer: llamaServerSummary(lease),
      release: {
        status: "released",
      },
    };
  } catch (error) {
    input.onProgress?.({
      stage: "failed",
      state: "failed",
      message: "Local Deep Research failed while the managed llama.cpp server was running.",
      error: error instanceof Error ? error.message : String(error),
      llamaServer: localDeepResearchLlamaServerStatus(lease.state),
      memory: localDeepResearchMemoryStatus(input.setup.localModelResources, input.setup.warnings, hostPressure),
    });
    try {
      await lease.release();
    } catch {
      // Preserve the original run error; the supervisor will reconcile stale state on the next acquire.
    }
    throw error;
  }
}

function localDeepResearchRunProgressToStatus(
  progress: LocalDeepResearchRunProgressEvent,
): LocalDeepResearchRunServiceProgressEvent {
  const turn = progress.turn !== undefined
    ? {
        turn: progress.turn,
        maxTurns: progress.maxTurns,
        toolCalls: progress.toolCalls,
        maxToolCalls: progress.maxToolCalls,
        ...(progress.outputChars !== undefined ? { outputChars: progress.outputChars } : {}),
      }
    : undefined;
  const retrieval = localDeepResearchRetrievalStatus(progress);
  const terminalState = progress.status
    ? progress.status === "completed" || progress.status === "synthesis-deferred" ? "completed" : progress.status === "blocked" ? "blocked" : "failed"
    : undefined;
  return {
    stage: localDeepResearchRunProgressStage(progress),
    ...(terminalState ? { state: terminalState } : {}),
    message: progress.message,
    ...(turn ? { turn } : {}),
    ...(retrieval ? { retrieval } : {}),
    ...(progress.error ? { error: progress.error } : {}),
  };
}

function localDeepResearchRunProgressStage(
  progress: LocalDeepResearchRunProgressEvent,
): LocalDeepResearchRunServiceProgressEvent["stage"] {
  if (progress.stage === "model-turn-started") return "model-turn";
  if (progress.stage === "model-turn-completed") return "model-response";
  if (progress.stage === "tool-dispatch") return "tool-dispatch";
  if (progress.stage === "tool-completed") return "tool-complete";
  if (progress.stage === "started") return "model-turn";
  if (progress.stage === "final-answer-draft" || progress.stage === "final-synthesis-repair" || progress.stage === "citation-repair") return "final-synthesis";
  if (progress.stage === "synthesis-deferred" || progress.stage === "completed") return "completed";
  if (progress.stage === "blocked") return "blocked";
  return "failed";
}

function localDeepResearchRetrievalStatus(
  progress: LocalDeepResearchRunProgressEvent,
): LocalDeepResearchRetrievalStatus | undefined {
  if (!progress.toolName) return undefined;
  const role = progress.toolName === "search" ? "search" : "fetch";
  return {
    role,
    status: progress.stage === "tool-completed" ? "succeeded" : "starting",
    ...(progress.providerId ? { providerId: progress.providerId } : {}),
    ...(progress.query ? { query: progress.query } : {}),
    ...(progress.url ? { url: progress.url } : {}),
    ...(progress.outputChars !== undefined ? { outputChars: progress.outputChars } : {}),
    ...(progress.durationMs !== undefined ? { durationMs: progress.durationMs } : {}),
    ...(progress.repeatedTargetCount !== undefined ? { repeatedVisitCount: progress.repeatedTargetCount } : {}),
  };
}

function localDeepResearchResourcePolicyMessage(outcome: string): string {
  if (outcome === "unlimited" || outcome === "within-limit") return "Local Deep Research memory policy is within limits.";
  return `Local Deep Research memory policy is ${outcome}; keeping resource warning visible during the run.`;
}

export async function persistLocalDeepResearchRunArtifacts(
  workspacePath: string,
  input: {
    run: LocalDeepResearchRunResult;
    setup: LocalDeepResearchSetupContract;
    managedAssets: LocalDeepResearchManagedAssetDetection;
    lease: LocalLlamaServerLease;
    now?: () => Date;
  },
): Promise<LocalDeepResearchRunArtifactSummary> {
  const now = input.now ?? (() => new Date());
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const hash = createHash("sha256").update(`${input.run.question}\n${input.run.finalText ?? input.run.error ?? ""}`).digest("hex").slice(0, 12);
  const basePath = `.ambient/local-deep-research/runs/${stamp}-${hash}`;
  const jsonPayload = {
    schemaVersion: "ambient-local-deep-research-run-artifact-v1",
    createdAt: now().toISOString(),
    run: input.run,
    setup: input.setup,
    managedAssets: input.managedAssets,
    llamaServer: llamaServerSummary(input.lease),
  };
  const json = await writeWorkspaceTextFile(workspacePath, `${basePath}.json`, `${JSON.stringify(jsonPayload, null, 2)}\n`);
  const markdown = await writeWorkspaceTextFile(workspacePath, `${basePath}.md`, localDeepResearchRunMarkdown(jsonPayload));
  return {
    jsonPath: json.path,
    markdownPath: markdown.path,
    jsonBytes: json.bytes,
    markdownBytes: markdown.bytes,
  };
}

export function localDeepResearchRunText(result: LocalDeepResearchRunServiceResult): string {
  const activeProvider = result.run.providerSnapshot.activeProvider
    ? `${result.run.providerSnapshot.activeProvider.label} (${result.run.providerSnapshot.activeProvider.providerId})`
    : "none";
  return [
    `Local Deep Research ${result.status}.`,
    result.finalText ? `\n${result.finalText}` : undefined,
    result.error ? `\nError: ${result.error}` : undefined,
    "",
    `Research provider: ${activeProvider}.`,
    `Research provider order: ${result.run.providerSnapshot.providerOrder.join(" -> ") || "none"}.`,
    `Model: ${result.run.modelProfileId}; context: ${result.run.contextTokens}.`,
    `Final synthesis: ${result.run.finalSynthesis.mode}.`,
    `Final synthesis reserve: ${result.run.finalSynthesisReserveTurns} turn(s).`,
    `Tool budget: ${result.run.toolBudget.usedToolCalls}/${result.run.toolBudget.maxToolCalls} used; ${result.run.toolBudget.remainingToolCalls} remaining; effort ${result.run.toolBudget.effort}.`,
    `Local model resource policy: ${result.localModelResourcePreflight.outcome}. ${result.localModelResourcePreflight.reason}`,
    `Search route snapshot: ${result.run.providerSnapshot.searchOrder.join(" -> ") || "none"}.`,
    `Fetch route snapshot: ${result.run.providerSnapshot.fetchOrder.join(" -> ") || "none"}.`,
    `Tool calls: ${result.run.toolExecutions.length}.`,
    result.run.citationValidation ? `Citation validation: ${result.run.citationValidation.status}. ${result.run.citationValidation.detail}` : undefined,
    result.run.finalAnswerDrafts?.length ? `Final answer drafts: ${result.run.finalAnswerDrafts.length}.` : undefined,
    `Artifacts: ${result.artifacts.markdownPath} and ${result.artifacts.jsonPath}.`,
  ].filter((line): line is string => line !== undefined).join("\n");
}

export async function listLocalDeepResearchRunHistory(
  workspacePath: string,
  input: LocalDeepResearchRunHistoryInput = {},
): Promise<LocalDeepResearchRunHistoryResult> {
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 12)));
  const runsRootPath = localDeepResearchRunArtifactsRoot;
  const runsRoot = resolve(workspacePath, runsRootPath);
  const names = await readdir(runsRoot).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  });
  const jsonNames = names
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse();
  const entries: LocalDeepResearchRunHistoryEntry[] = [];
  for (const name of jsonNames.slice(0, limit)) {
    const entry = await localDeepResearchRunHistoryEntry(runsRoot, name).catch(() => undefined);
    if (entry) entries.push(entry);
  }
  return {
    schemaVersion: "ambient-local-deep-research-run-history-v1",
    runsRootPath,
    entries,
    truncated: jsonNames.length > limit,
  };
}

function localDeepResearchRunMarkdown(input: {
  createdAt: string;
  run: LocalDeepResearchRunResult;
  setup: LocalDeepResearchSetupContract;
  managedAssets: LocalDeepResearchManagedAssetDetection;
  llamaServer: ReturnType<typeof llamaServerSummary>;
}): string {
  return [
    "# Local Deep Research Run",
    "",
    `Created: ${input.createdAt}`,
    `Status: ${input.run.status}`,
    `Model: ${input.run.modelProfileId}`,
    `Context: ${input.run.contextTokens}`,
    `Final synthesis: ${input.run.finalSynthesis.mode}`,
    `Final synthesis reserve: ${input.run.finalSynthesisReserveTurns} turn(s)`,
    `Tool budget: ${input.run.toolBudget.usedToolCalls}/${input.run.toolBudget.maxToolCalls} used; remaining ${input.run.toolBudget.remainingToolCalls}; effort ${input.run.toolBudget.effort}; exhausted ${input.run.toolBudget.exhausted ? "yes" : "no"}`,
    "",
    "## Question",
    "",
    input.run.question,
    "",
    "## Answer",
    "",
    input.run.finalText ?? input.run.error ?? "No final answer.",
    "",
    "## Citation Validation",
    "",
    input.run.citationValidation
      ? [
          `Status: ${input.run.citationValidation.status}`,
          `Detail: ${input.run.citationValidation.detail}`,
          `Citation URLs: ${input.run.citationValidation.citationUrls.join(", ") || "none"}`,
          `Unobserved citation URLs: ${input.run.citationValidation.unobservedCitationUrls.join(", ") || "none"}`,
          `Observed evidence URLs: ${input.run.citationValidation.observedUrls.join(", ") || "none"}`,
        ].join("\n")
      : "Not run.",
    "",
    "## Evidence",
    "",
    "Observed evidence URLs:",
    localDeepResearchObservedEvidenceUrls(input.run.toolExecutions).length
      ? localDeepResearchObservedEvidenceUrls(input.run.toolExecutions).map((url) => `- ${url}`).join("\n")
      : "- none",
    "",
    "Tool output artifacts:",
    localDeepResearchToolOutputArtifacts(input.run).length
      ? localDeepResearchToolOutputArtifacts(input.run).map((artifactPath) => `- ${artifactPath}`).join("\n")
      : "- none",
    input.run.finalAnswerDrafts?.length ? "" : undefined,
    input.run.finalAnswerDrafts?.length ? "## Final Answer Drafts" : undefined,
    input.run.finalAnswerDrafts?.length
      ? input.run.finalAnswerDrafts.map((draft, index) => [
          `### Draft ${index + 1}`,
          "",
          `Turn: ${draft.turn}`,
          draft.rejectedReason ? `Rejected: ${draft.rejectedReason}` : undefined,
          draft.citationValidation ? `Citation validation: ${draft.citationValidation.status}. ${draft.citationValidation.detail}` : undefined,
          "",
          draft.text,
        ].filter((line): line is string => typeof line === "string").join("\n")).join("\n\n")
      : undefined,
    input.run.status !== "completed" && input.run.toolExecutions.length ? "" : undefined,
    input.run.status !== "completed" && input.run.toolExecutions.length ? "## Recovery Evidence Packet" : undefined,
    input.run.status !== "completed" && input.run.toolExecutions.length
      ? localDeepResearchEvidencePacket({
          question: input.run.question,
          toolExecutions: input.run.toolExecutions,
          finalAnswerDrafts: input.run.finalAnswerDrafts,
          finalSynthesis: input.run.finalSynthesis,
          reason: input.run.error ?? `Run ended with status ${input.run.status}.`,
        })
      : undefined,
    "",
    "## Provider Snapshot",
    "",
    `Active research provider: ${input.run.providerSnapshot.activeProvider ? `${input.run.providerSnapshot.activeProvider.label} (${input.run.providerSnapshot.activeProvider.providerId})` : "none"}`,
    `Research provider order: ${input.run.providerSnapshot.providerOrder.join(" -> ") || "none"}`,
    `Search: ${input.run.providerSnapshot.searchOrder.join(" -> ") || "none"}`,
    `Fetch: ${input.run.providerSnapshot.fetchOrder.join(" -> ") || "none"}`,
    `Browser fallback: ${input.run.providerSnapshot.fallbackPolicy.allowBrowserFallback ? "allowed" : "blocked"}`,
    "",
    "## Tool Calls",
    "",
    input.run.toolExecutions.length
      ? input.run.toolExecutions.map((execution, index) => [
          `${index + 1}. ${execution.call.name}`,
          `   Provider: ${execution.result.selectedProvider ?? "unknown"}`,
          `   Attempts: ${execution.result.attempts.map((attempt) => `${attempt.providerId}:${attempt.status}`).join(", ") || "none"}`,
        ].join("\n")).join("\n")
      : "None.",
    "",
    "## Runtime",
    "",
    `Endpoint: ${input.llamaServer.endpointUrl}`,
    `PID: ${input.llamaServer.pid}`,
    `Runtime: ${input.llamaServer.runtimeBinaryPath}`,
    `Model path: ${input.llamaServer.modelPath}`,
    `Log: ${input.llamaServer.logPath}`,
    "",
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function localDeepResearchToolOutputArtifacts(run: LocalDeepResearchRunResult): string[] {
  const artifacts: string[] = [];
  for (const execution of run.toolExecutions) {
    if (execution.result.textOutputPath) artifacts.push(execution.result.textOutputPath);
    const metadataTextOutput = objectRecord(execution.result.metadata?.textOutput);
    const artifactPath = stringValue(metadataTextOutput.artifactPath);
    if (artifactPath) artifacts.push(artifactPath);
  }
  return [...new Set(artifacts)];
}

async function localDeepResearchRunHistoryEntry(
  runsRoot: string,
  jsonName: string,
): Promise<LocalDeepResearchRunHistoryEntry | undefined> {
  const jsonPath = resolve(runsRoot, jsonName);
  const payload = JSON.parse(await readFile(jsonPath, "utf8")) as unknown;
  const record = objectRecord(payload);
  const run = objectRecord(record.run);
  const setup = objectRecord(record.setup);
  const markdownName = jsonName.replace(/\.json$/, ".md");
  const markdownPath = resolve(runsRoot, markdownName);
  const [jsonStat, markdownStat] = await Promise.all([
    stat(jsonPath),
    stat(markdownPath).catch((error: unknown) => {
      if (isErrno(error, "ENOENT")) return undefined;
      throw error;
    }),
  ]);
  const providerSnapshot = providerSnapshotRecord(run.providerSnapshot);
  const createdAt = stringValue(record.createdAt) ?? stringValue(providerSnapshot?.capturedAt) ?? jsonStat.mtime.toISOString();
  const status = stringValue(run.status) ?? "unknown";
  const question = stringValue(run.question) ?? "Untitled research run";
  return {
    id: basename(jsonName, ".json"),
    createdAt,
    status,
    question,
    ...(stringValue(run.finalText) ? { finalTextPreview: previewText(stringValue(run.finalText)!) } : {}),
    ...(stringValue(run.error) ? { error: stringValue(run.error) } : {}),
    ...(stringValue(run.modelProfileId) ? { modelProfileId: stringValue(run.modelProfileId) } : {}),
    ...(contextTokens(run.contextTokens) ? { contextTokens: contextTokens(run.contextTokens)! } : {}),
    ...(providerSnapshot ? { providerSnapshot } : {}),
    ...(objectRecord(run.finalSynthesis).mode ? { finalSynthesis: objectRecord(run.finalSynthesis) } : {}),
    toolCallCount: Array.isArray(run.toolExecutions) ? run.toolExecutions.length : 0,
    jsonPath: `${localDeepResearchRunArtifactsRoot}/${jsonName}`,
    ...(markdownStat ? { markdownPath: `${localDeepResearchRunArtifactsRoot}/${markdownName}` } : {}),
    jsonBytes: jsonStat.size,
    ...(markdownStat ? { markdownBytes: markdownStat.size } : {}),
    updatedAt: jsonStat.mtime.toISOString(),
    ...(Object.keys(setup).length && !stringValue(run.modelProfileId) && stringValue(objectRecord(setup.modelInstall).selectedProfileId)
      ? { modelProfileId: stringValue(objectRecord(setup.modelInstall).selectedProfileId) }
      : {}),
  };
}

function providerSnapshotRecord(value: unknown): LocalDeepResearchProviderSnapshot | undefined {
  const record = objectRecord(value);
  const capturedAt = stringValue(record.capturedAt);
  const searchOrder = stringArray(record.searchOrder);
  const fetchOrder = stringArray(record.fetchOrder);
  const fallbackPolicy = objectRecord(record.fallbackPolicy);
  if (!capturedAt && !searchOrder.length && !fetchOrder.length) return undefined;
  return {
    schemaVersion: "ambient-local-deep-research-provider-snapshot-v1",
    capturedAt: capturedAt ?? "",
    ...(localDeepResearchProviderConfig(record.activeProvider) ? { activeProvider: localDeepResearchProviderConfig(record.activeProvider)! } : {}),
    providerOrder: stringArray(record.providerOrder),
    skippedProviders: skippedProviders(record.skippedProviders),
    providers: providerConfigs(record.providers),
    searchOrder,
    fetchOrder,
    skippedSearchProviders: skippedProviders(record.skippedSearchProviders),
    skippedFetchProviders: skippedProviders(record.skippedFetchProviders),
    fallbackPolicy: {
      allowBrowserFallback: fallbackPolicy.allowBrowserFallback !== false,
    },
  };
}

function localDeepResearchProviderConfig(value: unknown): LocalDeepResearchProviderSnapshot["activeProvider"] | undefined {
  const record = objectRecord(value);
  const providerId = stringValue(record.providerId);
  const label = stringValue(record.label);
  const kind = stringValue(record.kind);
  if (!providerId || !label || !kind) return undefined;
  if (kind !== "first-party" && kind !== "ambient-cli" && kind !== "mcp" && kind !== "test-adapter") return undefined;
  return {
    providerId,
    label,
    kind,
    roles: ["research"],
    status: record.status === "disabled" ? "disabled" : "enabled",
    ...(stringValue(record.capabilityId) ? { capabilityId: stringValue(record.capabilityId) } : {}),
    ...(stringValue(record.privacyLabel) ? { privacyLabel: stringValue(record.privacyLabel) } : {}),
  };
}

function providerConfigs(value: unknown): LocalDeepResearchProviderSnapshot["providers"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = objectRecord(item);
    const providerId = stringValue(record.providerId);
    const label = stringValue(record.label);
    const kind = stringValue(record.kind);
    const roles = stringArray(record.roles).filter((role) => role === "search" || role === "fetch" || role === "interactive_browser");
    const status = record.status === "disabled" ? "disabled" : "enabled";
    if (!providerId || !label || !kind || !roles.length) return [];
    if (kind !== "remote-mcp" && kind !== "toolhive-mcp" && kind !== "built-in-browser" && kind !== "ambient-cli") return [];
    return [{
      providerId,
      label,
      kind,
      roles,
      status,
      ...(stringValue(record.privacyLabel) ? { privacyLabel: stringValue(record.privacyLabel) } : {}),
    }];
  });
}

function skippedProviders(value: unknown): LocalDeepResearchProviderSnapshot["skippedSearchProviders"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = objectRecord(item);
    const providerId = stringValue(record.providerId);
    const reason = stringValue(record.reason);
    return providerId && reason ? [{ providerId, reason }] : [];
  });
}

function contextTokens(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function previewText(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 280 ? `${collapsed.slice(0, 277)}...` : collapsed;
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code);
}

function llamaServerSummary(lease: LocalLlamaServerLease): LocalDeepResearchRunServiceResult["llamaServer"] {
  return {
    endpointUrl: lease.state.endpointUrl,
    pid: lease.state.pid,
    profileId: lease.state.profileId,
    modelPath: lease.state.modelPath,
    runtimeBinaryPath: lease.state.runtimeBinaryPath,
    stateDir: lease.state.stateDir,
    logPath: lease.state.logPath,
    stdoutPath: lease.state.stdoutPath,
    stderrPath: lease.state.stderrPath,
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("Local Deep Research run was canceled.");
  error.name = "AbortError";
  throw error;
}
