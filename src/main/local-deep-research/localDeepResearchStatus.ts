import { execFile as execFileCallback } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

import type { LocalModelResourceRegistrySnapshot } from "../../shared/types";
import {
  probeLocalLlamaServerHealth,
  type LocalLlamaServerHealthProbe,
  type LocalLlamaServerState,
} from "../local-llama/localLlamaServerSupervisor";

const execFile = promisify(execFileCallback);

export type LocalDeepResearchStatusStage =
  | "preparing"
  | "readiness"
  | "resource-policy"
  | "acquiring-server"
  | "server-ready"
  | "model-turn"
  | "model-response"
  | "tool-dispatch"
  | "retrieval"
  | "tool-complete"
  | "final-synthesis"
  | "artifact-write"
  | "completed"
  | "blocked"
  | "failed"
  | "heartbeat";

export type LocalDeepResearchStatusState = "running" | "blocked" | "completed" | "failed";

export interface LocalDeepResearchTurnStatus {
  turn: number;
  maxTurns: number;
  toolCalls: number;
  maxToolCalls: number;
  outputChars?: number;
}

export interface LocalDeepResearchRetrievalStatus {
  role: "search" | "fetch";
  status: "starting" | "succeeded" | "failed" | "skipped";
  providerId?: string;
  providerLabel?: string;
  query?: string;
  url?: string;
  resultCount?: number;
  outputChars?: number;
  durationMs?: number;
  repeatedVisitCount?: number;
  failureReason?: string;
  textOutputPath?: string;
}

export interface LocalDeepResearchMemoryStatus {
  policyOutcome: string;
  policyReason: string;
  activeLocalModelCount: number;
  activeEstimatedResidentMemoryBytes: number;
  activeActualResidentMemoryBytes?: number;
  activeResidentMemoryBasis?: string;
  projectedEstimatedResidentMemoryBytes?: number;
  projectedResidentMemoryBytes?: number;
  projectedSystemMemoryUtilization?: number;
  projectedFreeMemoryBytes?: number;
  projectedFreeMemoryRatio?: number;
  maxProjectedMemoryUtilization?: number;
  hostTotalMemoryBytes?: number;
  hostFreeMemoryBytes?: number;
  hostAvailableMemoryBytes?: number;
  swapUsedBytes?: number;
  compressedMemoryBytes?: number;
  warnings: string[];
}

export interface LocalDeepResearchLlamaServerStatus {
  pid: number;
  endpointUrl: string;
  profileId: string;
  modelPath?: string;
  stateDir?: string;
  logPath?: string;
  startedAt?: string;
  rssBytes?: number;
  healthy?: boolean;
  healthLatencyMs?: number;
  healthStatusCode?: number;
  healthError?: string;
}

export interface LocalDeepResearchArtifactStatus {
  jsonPath?: string;
  markdownPath?: string;
  jsonBytes?: number;
  markdownBytes?: number;
}

export interface LocalDeepResearchStatusSnapshot {
  schemaVersion: "ambient-local-deep-research-status-v1";
  stage: LocalDeepResearchStatusStage;
  state: LocalDeepResearchStatusState;
  message: string;
  activityMessage?: string;
  startedAt?: string;
  updatedAt: string;
  elapsedMs?: number;
  heartbeatCount?: number;
  turn?: LocalDeepResearchTurnStatus;
  retrieval?: LocalDeepResearchRetrievalStatus;
  memory?: LocalDeepResearchMemoryStatus;
  llamaServer?: LocalDeepResearchLlamaServerStatus;
  artifacts?: LocalDeepResearchArtifactStatus;
  error?: string;
}

export interface LocalDeepResearchStatusSnapshotInput {
  stage: LocalDeepResearchStatusStage;
  state?: LocalDeepResearchStatusState;
  message: string;
  activityMessage?: string;
  startedAtMs?: number;
  startedAt?: string;
  nowMs?: number;
  heartbeatCount?: number;
  turn?: LocalDeepResearchTurnStatus;
  retrieval?: LocalDeepResearchRetrievalStatus;
  memory?: LocalDeepResearchMemoryStatus;
  llamaServer?: LocalDeepResearchLlamaServerStatus;
  artifacts?: LocalDeepResearchArtifactStatus;
  error?: string;
}

export function localDeepResearchStatusSnapshot(
  input: LocalDeepResearchStatusSnapshotInput,
): LocalDeepResearchStatusSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const elapsedMs = input.startedAtMs !== undefined ? Math.max(0, nowMs - input.startedAtMs) : undefined;
  return {
    schemaVersion: "ambient-local-deep-research-status-v1",
    stage: input.stage,
    state: input.state ?? "running",
    message: input.message,
    ...(input.activityMessage ? { activityMessage: input.activityMessage } : {}),
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    updatedAt: new Date(nowMs).toISOString(),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(input.heartbeatCount !== undefined ? { heartbeatCount: input.heartbeatCount } : {}),
    ...(input.turn ? { turn: input.turn } : {}),
    ...(input.retrieval ? { retrieval: input.retrieval } : {}),
    ...(input.memory ? { memory: input.memory } : {}),
    ...(input.llamaServer ? { llamaServer: input.llamaServer } : {}),
    ...(input.artifacts ? { artifacts: input.artifacts } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
}

export function localDeepResearchToolUpdate(
  toolName: string,
  snapshot: LocalDeepResearchStatusSnapshot,
): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: snapshot.message }],
    details: {
      runtime: "ambient-local-deep-research",
      toolName,
      status: snapshot.state,
      stage: snapshot.stage,
      statusMessage: snapshot.message,
      activityMessage: snapshot.activityMessage ?? snapshot.message,
      elapsedMs: snapshot.elapsedMs,
      heartbeatCount: snapshot.heartbeatCount,
      waitingOn: localDeepResearchWaitingOn(snapshot),
      targetUrl: snapshot.retrieval?.url,
      outputChars: snapshot.retrieval?.outputChars ?? snapshot.turn?.outputChars,
      localDeepResearchStatus: snapshot,
    },
  };
}

export function localDeepResearchMemoryStatus(
  registry: LocalModelResourceRegistrySnapshot | undefined,
  warnings: string[] = [],
  hostPressure?: LocalDeepResearchHostPressureSample,
): LocalDeepResearchMemoryStatus | undefined {
  if (!registry) return undefined;
  const decision = registry.policyDecision;
  return {
    policyOutcome: decision.outcome,
    policyReason: decision.reason,
    activeLocalModelCount: registry.activeCount,
    activeEstimatedResidentMemoryBytes: registry.activeEstimatedResidentMemoryBytes,
    ...(registry.activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes: registry.activeActualResidentMemoryBytes } : {}),
    ...(decision.activeResidentMemoryBasis ? { activeResidentMemoryBasis: decision.activeResidentMemoryBasis } : {}),
    projectedEstimatedResidentMemoryBytes: decision.projectedEstimatedResidentMemoryBytes,
    ...(decision.projectedResidentMemoryBytes !== undefined ? { projectedResidentMemoryBytes: decision.projectedResidentMemoryBytes } : {}),
    ...(decision.projectedSystemMemoryUtilization !== undefined ? { projectedSystemMemoryUtilization: decision.projectedSystemMemoryUtilization } : {}),
    ...(decision.projectedFreeMemoryBytes !== undefined ? { projectedFreeMemoryBytes: decision.projectedFreeMemoryBytes } : {}),
    ...(decision.projectedFreeMemoryRatio !== undefined ? { projectedFreeMemoryRatio: decision.projectedFreeMemoryRatio } : {}),
    ...(decision.maxProjectedMemoryUtilization !== undefined ? { maxProjectedMemoryUtilization: decision.maxProjectedMemoryUtilization } : {}),
    hostTotalMemoryBytes: registry.hostMemory?.totalMemoryBytes ?? os.totalmem(),
    hostFreeMemoryBytes: registry.hostMemory?.freeMemoryBytes ?? os.freemem(),
    ...(registry.hostMemory?.availableMemoryBytes !== undefined ? { hostAvailableMemoryBytes: registry.hostMemory.availableMemoryBytes } : {}),
    ...(hostPressure?.swapUsedBytes !== undefined ? { swapUsedBytes: hostPressure.swapUsedBytes } : {}),
    ...(hostPressure?.compressedMemoryBytes !== undefined ? { compressedMemoryBytes: hostPressure.compressedMemoryBytes } : {}),
    warnings: [...new Set(warnings.filter(Boolean))],
  };
}

export function localDeepResearchLlamaServerStatus(
  state: LocalLlamaServerState,
  input: {
    rssBytes?: number;
    health?: LocalLlamaServerHealthProbe;
  } = {},
): LocalDeepResearchLlamaServerStatus {
  return {
    pid: state.pid,
    endpointUrl: state.endpointUrl,
    profileId: state.profileId,
    modelPath: state.modelPath,
    stateDir: state.stateDir,
    logPath: state.logPath,
    startedAt: state.startedAt,
    ...(input.rssBytes !== undefined ? { rssBytes: input.rssBytes } : {}),
    ...(input.health
      ? {
          healthy: input.health.ok,
          ...(input.health.latencyMs !== undefined ? { healthLatencyMs: input.health.latencyMs } : {}),
          ...(input.health.statusCode !== undefined ? { healthStatusCode: input.health.statusCode } : {}),
          ...(input.health.error ? { healthError: input.health.error } : {}),
        }
      : {}),
  };
}

export async function sampleLocalDeepResearchLlamaServerStatus(
  state: LocalLlamaServerState,
): Promise<LocalDeepResearchLlamaServerStatus> {
  const [rssBytes, health] = await Promise.all([
    sampleProcessRssBytes(state.pid).catch(() => undefined),
    probeLocalLlamaServerHealth(state.endpointUrl, { timeoutMs: 1500 }).catch((error: unknown): LocalLlamaServerHealthProbe => ({
      ok: false,
      endpointUrl: state.endpointUrl,
      error: error instanceof Error ? error.message : String(error),
    })),
  ]);
  return localDeepResearchLlamaServerStatus(state, { rssBytes, health });
}

export async function refreshLocalDeepResearchLlamaServerStatus(
  server: LocalDeepResearchLlamaServerStatus,
): Promise<LocalDeepResearchLlamaServerStatus> {
  const [rssBytes, health] = await Promise.all([
    sampleProcessRssBytes(server.pid).catch(() => server.rssBytes),
    probeLocalLlamaServerHealth(server.endpointUrl, { timeoutMs: 1500 }).catch((error: unknown): LocalLlamaServerHealthProbe => ({
      ok: false,
      endpointUrl: server.endpointUrl,
      error: error instanceof Error ? error.message : String(error),
    })),
  ]);
  return {
    ...server,
    ...(rssBytes !== undefined ? { rssBytes } : {}),
    healthy: health.ok,
    ...(health.latencyMs !== undefined ? { healthLatencyMs: health.latencyMs } : {}),
    ...(health.statusCode !== undefined ? { healthStatusCode: health.statusCode } : {}),
    ...(health.error ? { healthError: health.error } : {}),
  };
}

export interface LocalDeepResearchHostPressureSample {
  swapUsedBytes?: number;
  compressedMemoryBytes?: number;
}

export async function sampleLocalDeepResearchHostPressure(): Promise<LocalDeepResearchHostPressureSample | undefined> {
  if (process.platform !== "darwin") return undefined;
  const [swap, vmStat] = await Promise.all([
    execFile("sysctl", ["-n", "vm.swapusage"], { timeout: 1500 }).then(({ stdout }) => stdout).catch(() => ""),
    execFile("vm_stat", [], { timeout: 1500 }).then(({ stdout }) => stdout).catch(() => ""),
  ]);
  const swapUsedBytes = parseMacOsSwapUsedBytes(swap);
  const compressedMemoryBytes = parseMacOsCompressedMemoryBytes(vmStat);
  if (swapUsedBytes === undefined && compressedMemoryBytes === undefined) return undefined;
  return {
    ...(swapUsedBytes !== undefined ? { swapUsedBytes } : {}),
    ...(compressedMemoryBytes !== undefined ? { compressedMemoryBytes } : {}),
  };
}

export async function sampleProcessRssBytes(pid: number): Promise<number | undefined> {
  if (!Number.isFinite(pid) || pid <= 0) return undefined;
  const { stdout } = await execFile("ps", ["-o", "rss=", "-p", String(Math.trunc(pid))], { timeout: 1500 });
  const rssKiB = Number(stdout.trim());
  return Number.isFinite(rssKiB) && rssKiB >= 0 ? Math.round(rssKiB * 1024) : undefined;
}

export function localDeepResearchStatusMessage(snapshot: LocalDeepResearchStatusSnapshot): string {
  return snapshot.activityMessage ?? snapshot.message;
}

function localDeepResearchWaitingOn(snapshot: LocalDeepResearchStatusSnapshot): string | undefined {
  if (snapshot.stage === "model-turn") return "llama.cpp";
  if (snapshot.stage === "retrieval" || snapshot.stage === "tool-dispatch") {
    return snapshot.retrieval?.providerLabel ?? snapshot.retrieval?.providerId ?? snapshot.retrieval?.role;
  }
  if (snapshot.stage === "acquiring-server") return "llama.cpp server";
  return undefined;
}

function parseMacOsSwapUsedBytes(value: string): number | undefined {
  const match = value.match(/\bused\s*=\s*([0-9.]+)([MGT])\b/i);
  if (!match) return undefined;
  return parseMemoryUnitBytes(match[1], match[2]);
}

function parseMacOsCompressedMemoryBytes(value: string): number | undefined {
  const pageSizeMatch = value.match(/page size of\s+(\d+)\s+bytes/i);
  const pagesMatch = value.match(/Pages occupied by compressor:\s+(\d+)/i);
  const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
  const pages = pagesMatch ? Number(pagesMatch[1]) : undefined;
  if (!Number.isFinite(pageSize) || pageSize <= 0 || pages === undefined || !Number.isFinite(pages) || pages < 0) return undefined;
  return Math.round(pageSize * pages);
}

function parseMemoryUnitBytes(rawNumber: string | undefined, rawUnit: string | undefined): number | undefined {
  const value = Number(rawNumber);
  if (!Number.isFinite(value) || value < 0) return undefined;
  const unit = rawUnit?.toUpperCase();
  const multiplier = unit === "T" ? 1024 ** 4 : unit === "G" ? 1024 ** 3 : unit === "M" ? 1024 ** 2 : undefined;
  return multiplier ? Math.round(value * multiplier) : undefined;
}
