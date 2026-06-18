import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { localDeepResearchEstimatedResidentMemoryBytes, localDeepResearchProfileById } from "../local-deep-research/localDeepResearchModelProfiles";
import { managedInstallWorkspacePath } from "../setup/managedInstallPaths";
import {
  readLocalLlamaServerState,
  readLocalLlamaServerStateFromDir,
  type LocalLlamaServerState,
} from "./localLlamaServerSupervisor";
import {
  AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
  AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
  ambientMemoryEmbeddingModelProfile,
  ambientMemoryEmbeddingServerStateRoot,
} from "../memory/tencentdb/managedEmbeddingRuntimeMetadata";

const gib = 1024 ** 3;
const localDeepResearchServerRoot = ".ambient/local-deep-research/server";
const miniCpmServerStatePath = ".ambient/vision/minicpm-v/state/server-state.json";
const localTextRuntimeRoot = ".ambient/local-model-runtime";
const miniCpmEstimatedResidentMemoryBytes = 7 * gib;

export type LocalLlamaResidentCapability = "local-deep-research" | "minicpm-v" | "local-text" | "embeddings";

export interface LocalLlamaResidentProcess {
  capability: LocalLlamaResidentCapability;
  id: string;
  pid: number;
  running: boolean;
  statePath: string;
  providerId?: string;
  runtimeId?: string;
  ownerThreadId?: string;
  parentThreadId?: string;
  subagentThreadId?: string;
  ownerDisplayName?: string;
  trackingStatus?: "managed" | "tracked" | "untracked";
  activeLeaseIds?: string[];
  endpointUrl?: string;
  port?: number;
  modelId?: string;
  profileId?: string;
  contextTokens?: number;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  memorySampledAt?: string;
  startedAt?: string;
  lastUsedAt?: string;
  logPath?: string;
  stderrPath?: string;
}

export interface DetectLocalLlamaResidentProcessesInput {
  processAlive?: (pid: number) => boolean;
  includeStopped?: boolean;
  includeUntracked?: boolean;
  listProcesses?: () => Promise<LocalLlamaProcessSnapshot[]>;
  sampleProcessMemory?: boolean;
  processMemorySampler?: (pid: number) => Promise<LocalLlamaResidentMemorySample | undefined>;
  localDeepResearchStateRootPath?: string;
  miniCpmStatePath?: string;
  localTextStateRootPath?: string;
  memoryEmbeddingStateRootPath?: string;
}

export interface LocalLlamaResidentMemorySample {
  residentMemoryBytes: number;
  sampledAt: string;
}

export interface LocalLlamaProcessSnapshot {
  pid: number;
  command: string;
  args?: string;
}

export async function detectLocalLlamaResidentProcesses(
  workspacePath: string,
  input: DetectLocalLlamaResidentProcessesInput = {},
): Promise<LocalLlamaResidentProcess[]> {
  const processAlive = input.processAlive ?? defaultProcessAlive;
  const processMemorySampler = input.sampleProcessMemory === false
    ? undefined
    : input.processMemorySampler ?? sampleProcessResidentMemory;
  const residents = [
    ...await detectLocalDeepResearchResidents(workspacePath, { ...input, processAlive, processMemorySampler }),
    ...await detectMiniCpmResidents(workspacePath, { ...input, processAlive, processMemorySampler }),
    ...await detectLocalTextResidents(workspacePath, { ...input, processAlive, processMemorySampler }),
    ...await detectAmbientMemoryEmbeddingResidents(workspacePath, { ...input, processAlive, processMemorySampler }),
  ];
  const untrackedResidents = input.includeUntracked === false
    ? []
    : await detectUntrackedLlamaResidents(residents, { ...input, processAlive, processMemorySampler }).catch(() => []);
  const allResidents = [
    ...residents,
    ...untrackedResidents,
  ];
  return input.includeStopped ? allResidents : allResidents.filter((resident) => resident.running);
}

async function detectLocalDeepResearchResidents(
  workspacePath: string,
  input: DetectLocalLlamaResidentProcessesInput & {
    processAlive: (pid: number) => boolean;
    processMemorySampler?: (pid: number) => Promise<LocalLlamaResidentMemorySample | undefined>;
  },
): Promise<LocalLlamaResidentProcess[]> {
  const root = resolve(input.localDeepResearchStateRootPath ?? resolve(workspacePath, localDeepResearchServerRoot));
  const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  });
  const residents: LocalLlamaResidentProcess[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stateDir = join(root, entry.name);
    const state = await readLocalLlamaServerStateFromDir(stateDir);
    if (!state?.pid) continue;
    const running = input.processAlive(state.pid);
    residents.push(await localDeepResearchResidentFromState(state, running, input.processMemorySampler));
  }
  return residents;
}

async function localDeepResearchResidentFromState(
  state: LocalLlamaServerState,
  running: boolean,
  processMemorySampler?: (pid: number) => Promise<LocalLlamaResidentMemorySample | undefined>,
): Promise<LocalLlamaResidentProcess> {
  const memory = running ? await processMemorySampler?.(state.pid).catch(() => undefined) : undefined;
  return {
    capability: "local-deep-research",
    id: `local-deep-research:${state.profileId}:${state.pid}`,
    pid: state.pid,
    running,
    statePath: join(state.stateDir, "server-state.json"),
    ...(state.ownerThreadId ? { ownerThreadId: state.ownerThreadId } : {}),
    endpointUrl: state.endpointUrl,
    port: state.port,
    profileId: state.profileId,
    modelId: state.modelPath,
    contextTokens: state.contextTokens,
    estimatedResidentMemoryBytes: localDeepResearchResidentEstimate(state.profileId, state.contextTokens),
    ...(memory ? { actualResidentMemoryBytes: memory.residentMemoryBytes, memorySampledAt: memory.sampledAt } : {}),
    startedAt: state.startedAt,
    lastUsedAt: state.lastUsedAt,
    logPath: state.logPath,
    stderrPath: state.stderrPath,
  };
}

async function detectMiniCpmResidents(
  workspacePath: string,
  input: DetectLocalLlamaResidentProcessesInput & {
    processAlive: (pid: number) => boolean;
    processMemorySampler?: (pid: number) => Promise<LocalLlamaResidentMemorySample | undefined>;
  },
): Promise<LocalLlamaResidentProcess[]> {
  const statePath = resolve(input.miniCpmStatePath ?? resolve(workspacePath, miniCpmServerStatePath));
  const state = await readJsonRecord(statePath);
  const pid = numberValue(state.pid);
  if (!pid) return [];
  const stateStatus = stringValue(state.status);
  const running = stateStatus !== "stopped" && input.processAlive(pid);
  const memory = running ? await input.processMemorySampler?.(pid).catch(() => undefined) : undefined;
  return [{
    capability: "minicpm-v",
    id: `minicpm-v:${pid}`,
    pid,
    running,
    statePath,
    endpointUrl: stringValue(state.endpoint),
    port: portFromEndpoint(stringValue(state.endpoint)),
    modelId: stringValue(state.model),
    contextTokens: miniCpmContextTokens(state.command),
    estimatedResidentMemoryBytes: miniCpmEstimatedResidentMemoryBytes,
    ...(memory ? { actualResidentMemoryBytes: memory.residentMemoryBytes, memorySampledAt: memory.sampledAt } : {}),
    startedAt: stringValue(state.startedAt),
    lastUsedAt: stringValue(state.stoppedAt) ?? stringValue(state.lastUsedAt),
    logPath: stringValue(state.logPath),
    stderrPath: stringValue(state.stderrPath),
  }];
}

async function detectLocalTextResidents(
  workspacePath: string,
  input: DetectLocalLlamaResidentProcessesInput & {
    processAlive: (pid: number) => boolean;
    processMemorySampler?: (pid: number) => Promise<LocalLlamaResidentMemorySample | undefined>;
  },
): Promise<LocalLlamaResidentProcess[]> {
  const root = resolve(input.localTextStateRootPath ?? resolve(workspacePath, localTextRuntimeRoot));
  const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  });
  const residents: LocalLlamaResidentProcess[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const statePath = join(root, entry.name, "runtime-state.json");
    const state = await readJsonRecord(statePath);
    if (state.schemaVersion !== "ambient-local-model-runtime-state-v1") continue;
    const pid = numberValue(state.pid);
    if (!pid) continue;
    const stateStatus = stringValue(state.status);
    const running = stateStatus !== "stopped" && input.processAlive(pid);
    const sampled = running ? await input.processMemorySampler?.(pid).catch(() => undefined) : undefined;
    const runtimeId = stringValue(state.runtimeId) ?? entry.name;
    const providerId = stringValue(state.providerId);
    const ownerThreadId = stringValue(state.ownerThreadId);
    const parentThreadId = stringValue(state.parentThreadId);
    const subagentThreadId = stringValue(state.subagentThreadId);
    const ownerDisplayName = stringValue(state.ownerDisplayName);
    const healthUrl = stringValue(state.healthUrl);
    const actualResidentMemoryBytes = numberValue(state.actualResidentMemoryBytes);
    const memorySampledAt = stringValue(state.memorySampledAt);
    residents.push({
      capability: "local-text",
      id: `local-text:${runtimeId}:${pid}`,
      pid,
      running,
      statePath,
      runtimeId,
      ...(providerId ? { providerId } : {}),
      ...(ownerThreadId ? { ownerThreadId } : {}),
      ...(parentThreadId ? { parentThreadId } : {}),
      ...(subagentThreadId ? { subagentThreadId } : {}),
      ...(ownerDisplayName ? { ownerDisplayName } : {}),
      trackingStatus: "managed",
      ...(healthUrl ? { endpointUrl: healthUrl } : {}),
      port: portFromEndpoint(healthUrl),
      modelId: stringValue(state.modelId),
      profileId: stringValue(state.profileId),
      estimatedResidentMemoryBytes: numberValue(state.estimatedResidentMemoryBytes),
      ...(sampled
        ? { actualResidentMemoryBytes: sampled.residentMemoryBytes, memorySampledAt: sampled.sampledAt }
        : running && actualResidentMemoryBytes !== undefined
        ? {
          actualResidentMemoryBytes,
          ...(memorySampledAt ? { memorySampledAt } : {}),
        }
        : {}),
      startedAt: stringValue(state.startedAt),
      lastUsedAt: stringValue(state.lastUsedAt),
      logPath: stringValue(state.stdoutPath),
      stderrPath: stringValue(state.stderrPath),
    });
  }
  return residents;
}

async function detectAmbientMemoryEmbeddingResidents(
  workspacePath: string,
  input: DetectLocalLlamaResidentProcessesInput & {
    processAlive: (pid: number) => boolean;
    processMemorySampler?: (pid: number) => Promise<LocalLlamaResidentMemorySample | undefined>;
  },
): Promise<LocalLlamaResidentProcess[]> {
  const stateRootPath = resolve(
    input.memoryEmbeddingStateRootPath ?? ambientMemoryEmbeddingServerStateRoot(managedInstallWorkspacePath(workspacePath)),
  );
  const state = await readLocalLlamaServerState(stateRootPath, AMBIENT_MEMORY_EMBEDDING_PROFILE_ID).catch(() => undefined);
  if (!state?.pid) return [];
  const running = input.processAlive(state.pid);
  const memory = running ? await input.processMemorySampler?.(state.pid).catch(() => undefined) : undefined;
  return [{
    capability: "embeddings",
    id: `embeddings:${AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID}`,
    pid: state.pid,
    running,
    statePath: join(state.stateDir, "server-state.json"),
    providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    runtimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
    trackingStatus: "managed",
    ...(state.ownerThreadId ? { ownerThreadId: state.ownerThreadId } : {}),
    ownerDisplayName: "Ambient memory embeddings",
    endpointUrl: state.endpointUrl,
    port: state.port,
    modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
    profileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
    contextTokens: state.contextTokens,
    estimatedResidentMemoryBytes: ambientMemoryEmbeddingModelProfile.estimatedResidentMemoryBytes,
    ...(memory ? { actualResidentMemoryBytes: memory.residentMemoryBytes, memorySampledAt: memory.sampledAt } : {}),
    startedAt: state.startedAt,
    lastUsedAt: state.lastUsedAt,
    logPath: state.logPath,
    stderrPath: state.stderrPath,
  }];
}

async function detectUntrackedLlamaResidents(
  trackedResidents: LocalLlamaResidentProcess[],
  input: DetectLocalLlamaResidentProcessesInput & {
    processAlive: (pid: number) => boolean;
    processMemorySampler?: (pid: number) => Promise<LocalLlamaResidentMemorySample | undefined>;
  },
): Promise<LocalLlamaResidentProcess[]> {
  const processes = await (input.listProcesses ?? listLocalProcesses)();
  const trackedPids = new Set(trackedResidents.map((resident) => resident.pid));
  const trackedEndpoints = new Set(trackedResidents.map((resident) => resident.endpointUrl).filter((value): value is string => Boolean(value)));
  const residents: LocalLlamaResidentProcess[] = [];
  for (const process of processes) {
    if (!isLlamaServerProcess(process)) continue;
    if (trackedPids.has(process.pid)) continue;
    if (!input.processAlive(process.pid)) continue;
    const args = process.args ?? process.command;
    const endpointUrl = endpointFromLlamaArgs(args);
    if (endpointUrl && trackedEndpoints.has(endpointUrl)) continue;
    const memory = await input.processMemorySampler?.(process.pid).catch(() => undefined);
    residents.push({
      capability: "local-text",
      id: `untracked-llama:${process.pid}`,
      pid: process.pid,
      running: true,
      statePath: `process:${process.pid}`,
      trackingStatus: "untracked",
      ...(endpointUrl ? { endpointUrl, port: portFromEndpoint(endpointUrl) } : {}),
      ...(modelFromLlamaArgs(args) ? { modelId: modelFromLlamaArgs(args) } : {}),
      ...(contextTokensFromLlamaArgs(args) ? { contextTokens: contextTokensFromLlamaArgs(args) } : {}),
      ...(memory ? { actualResidentMemoryBytes: memory.residentMemoryBytes, memorySampledAt: memory.sampledAt } : {}),
    });
  }
  return residents;
}

function localDeepResearchResidentEstimate(profileId: string, contextTokens: number): number | undefined {
  try {
    const profile = localDeepResearchProfileById(profileId as never);
    return localDeepResearchEstimatedResidentMemoryBytes(profile, contextTokens);
  } catch {
    return undefined;
  }
}

function miniCpmContextTokens(command: unknown): number | undefined {
  if (!Array.isArray(command)) return undefined;
  const contextIndex = command.findIndex((entry) => entry === "-c" || entry === "--ctx-size" || entry === "--context");
  const raw = contextIndex >= 0 ? command[contextIndex + 1] : undefined;
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : undefined;
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isLlamaServerProcess(process: LocalLlamaProcessSnapshot): boolean {
  const text = `${process.command} ${process.args ?? ""}`.toLowerCase();
  return /\b(llama-server|llama\.cpp|llama-cli|main)\b/.test(text) &&
    (text.includes("--model") || text.includes(" -m ") || text.includes(".gguf") || text.includes("--hf-repo"));
}

function endpointFromLlamaArgs(args: string): string | undefined {
  const host = stringArg(args, ["--host", "--listen-host"]) ?? "127.0.0.1";
  const port = numberArg(args, ["--port"]);
  if (!port) return undefined;
  return `http://${host}:${port}`;
}

function modelFromLlamaArgs(args: string): string | undefined {
  return stringArg(args, ["--model", "-m"]) ?? stringArg(args, ["--hf-repo"]);
}

function contextTokensFromLlamaArgs(args: string): number | undefined {
  return numberArg(args, ["-c", "--ctx-size", "--context"]);
}

function stringArg(args: string, flags: string[]): string | undefined {
  const tokens = shellishTokens(args);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    for (const flag of flags) {
      if (token === flag) {
        return tokens[index + 1]?.trim() || undefined;
      }
      if (token.startsWith(`${flag}=`)) {
        return token.slice(flag.length + 1).trim() || undefined;
      }
    }
  }
  return undefined;
}

function numberArg(args: string, flags: string[]): number | undefined {
  const raw = stringArg(args, flags);
  const parsed = raw ? Number.parseInt(raw, 10) : undefined;
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function shellishTokens(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

async function readJsonRecord(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch (error) {
    if (isErrno(error, "ENOENT")) return {};
    throw error;
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function portFromEndpoint(endpoint: string | undefined): number | undefined {
  if (!endpoint) return undefined;
  try {
    const parsed = new URL(endpoint);
    const port = Number.parseInt(parsed.port, 10);
    return Number.isFinite(port) && port > 0 ? port : undefined;
  } catch {
    return undefined;
  }
}

export function sampleProcessResidentMemory(pid: number): Promise<LocalLlamaResidentMemorySample | undefined> {
  return new Promise((resolveSample) => {
    execFile("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8", timeout: 2500 }, (error, stdout) => {
      if (error) {
        resolveSample(undefined);
        return;
      }
      const rssKib = Number.parseInt(stdout.trim(), 10);
      resolveSample(Number.isFinite(rssKib) && rssKib > 0
        ? { residentMemoryBytes: rssKib * 1024, sampledAt: new Date().toISOString() }
        : undefined);
    });
  });
}

function listLocalProcesses(): Promise<LocalLlamaProcessSnapshot[]> {
  return new Promise((resolveProcesses) => {
    execFile("ps", ["-axo", "pid=,command="], { encoding: "utf8", timeout: 2500, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        resolveProcesses([]);
        return;
      }
      resolveProcesses(stdout.split(/\r?\n/).map(parseProcessLine).filter((process): process is LocalLlamaProcessSnapshot => Boolean(process)));
    });
  });
}

function parseProcessLine(line: string): LocalLlamaProcessSnapshot | undefined {
  const match = line.trim().match(/^(\d+)\s+(.+)$/);
  if (!match) return undefined;
  const pid = Number.parseInt(match[1], 10);
  const args = match[2].trim();
  if (!Number.isFinite(pid) || pid <= 0 || !args) return undefined;
  return {
    pid,
    command: shellishTokens(args)[0] ?? args,
    args,
  };
}

function defaultProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code);
}
