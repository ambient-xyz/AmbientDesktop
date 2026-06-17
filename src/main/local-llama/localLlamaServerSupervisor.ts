import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

export interface LocalLlamaServerAcquireInput {
  profileId: string;
  runtimeBinaryPath: string;
  modelPath: string;
  stateRootPath: string;
  contextTokens: number;
  ownerThreadId?: string;
  host?: string;
  port?: number;
  gpuLayers?: number;
  chatTemplate?: string;
  extraArgs?: string[];
  offline?: boolean;
  startupTimeoutMs?: number;
  idleTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface LocalLlamaServerState {
  schemaVersion: "ambient-local-llama-server-state-v1";
  profileId: string;
  pid: number;
  endpointUrl: string;
  host: string;
  port: number;
  runtimeBinaryPath: string;
  modelPath: string;
  contextTokens: number;
  ownerThreadId?: string;
  gpuLayers: number;
  idleTimeoutMs: number;
  startedAt: string;
  lastUsedAt: string;
  stateDir: string;
  logPath: string;
  stdoutPath: string;
  stderrPath: string;
  command: string[];
}

export interface LocalLlamaServerLease {
  leaseId: string;
  state: LocalLlamaServerState;
  release: () => Promise<void>;
}

export interface LocalLlamaServerHealthProbe {
  ok: boolean;
  endpointUrl: string;
  statusCode?: number;
  latencyMs?: number;
  body?: unknown;
  textPreview?: string;
  error?: string;
}

export interface LocalLlamaServerReleaseResult {
  status: "released" | "still-leased" | "stopped" | "not-found";
  leaseId: string;
  pid?: number;
  remainingLeases?: number;
}

export interface LocalLlamaServerStopProfileInput {
  stateRootPath: string;
  profileId: string;
  force?: boolean;
}

export interface LocalLlamaServerStopProfileResult {
  status: "stopped" | "still-leased" | "not-found";
  profileId: string;
  pid?: number;
  remainingLeases?: number;
}

export interface LocalLlamaServerSupervisorOptions {
  spawnProcess?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  fetchImpl?: typeof fetch;
  portAllocator?: (host: string) => Promise<number>;
  processAlive?: (pid: number) => boolean;
  killProcess?: (pid: number, signal?: NodeJS.Signals) => void;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

interface ActiveServer {
  key: string;
  state: LocalLlamaServerState;
  leases: Set<string>;
  idleTimer?: ReturnType<typeof setTimeout>;
}

interface NormalizedAcquireInput extends Omit<LocalLlamaServerAcquireInput, "host" | "runtimeBinaryPath" | "modelPath" | "stateRootPath" | "contextTokens" | "gpuLayers" | "startupTimeoutMs" | "idleTimeoutMs" | "extraArgs" | "port"> {
  host: string;
  port?: number;
  runtimeBinaryPath: string;
  modelPath: string;
  stateRootPath: string;
  contextTokens: number;
  gpuLayers: number;
  startupTimeoutMs: number;
  idleTimeoutMs: number;
  extraArgs: string[];
}

const defaultHost = "127.0.0.1";
const defaultGpuLayers = 99;
const defaultStartupTimeoutMs = 120_000;
const defaultIdleTimeoutMs = 5 * 60_000;

export class LocalLlamaServerSupervisor {
  private readonly activeServers = new Map<string, ActiveServer>();
  private readonly leases = new Map<string, ActiveServer>();
  private readonly spawnProcess: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  private readonly fetchImpl: typeof fetch;
  private readonly portAllocator: (host: string) => Promise<number>;
  private readonly processAlive: (pid: number) => boolean;
  private readonly killProcess: (pid: number, signal?: NodeJS.Signals) => void;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: LocalLlamaServerSupervisorOptions = {}) {
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.portAllocator = options.portAllocator ?? findAvailableLocalPort;
    this.processAlive = options.processAlive ?? defaultProcessAlive;
    this.killProcess = options.killProcess ?? defaultKillProcess;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)));
  }

  async acquire(input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> {
    const normalized = normalizeAcquireInput(input);
    const existingActive = this.activeServers.get(serverKey(normalized));
    if (existingActive && this.processAlive(existingActive.state.pid)) {
      return this.createLease(existingActive);
    }

    const persistedState = await readLocalLlamaServerState(normalized.stateRootPath, normalized.profileId);
    const port = normalized.port ?? persistedState?.port ?? await this.portAllocator(normalized.host);
    const stateDir = localLlamaServerStateDir(normalized.stateRootPath, normalized.profileId);
    const paths = localLlamaServerLogPaths(stateDir);
    const command = [
      normalized.runtimeBinaryPath,
      ...buildLocalLlamaServerArgs({
        ...normalized,
        port,
        logPath: paths.logPath,
      }),
    ];
    if (persistedState?.pid && this.processAlive(persistedState.pid)) {
      if (sameCommand(persistedState.command, command)) {
        const health = await probeLocalLlamaServerHealth(persistedState.endpointUrl, { fetchImpl: this.fetchImpl, timeoutMs: 2500 });
        if (health.ok) {
          const active = this.rememberActive(serverKey(normalized), {
            ...persistedState,
            idleTimeoutMs: normalized.idleTimeoutMs,
            lastUsedAt: this.now().toISOString(),
          });
          return this.createLease(active);
        }
      }
      this.terminate(persistedState.pid);
      await this.sleep(250);
      if (this.processAlive(persistedState.pid)) {
        try {
          this.killProcess(persistedState.pid, "SIGKILL");
        } catch {
          // The process may have exited after the second liveness check.
        }
      }
    }

    const state = await this.startServer(normalized, { port, stateDir, paths, command });
    const active = this.rememberActive(serverKey(normalized), state);
    return this.createLease(active);
  }

  async release(leaseId: string): Promise<LocalLlamaServerReleaseResult> {
    const active = this.leases.get(leaseId);
    if (!active) return { status: "not-found", leaseId };
    this.leases.delete(leaseId);
    active.leases.delete(leaseId);
    active.state.lastUsedAt = this.now().toISOString();
    await writeLocalLlamaServerState(active.state);
    if (active.leases.size > 0) {
      return { status: "still-leased", leaseId, pid: active.state.pid, remainingLeases: active.leases.size };
    }
    const idleTimeoutMs = activeIdleTimeoutMs(active);
    if (idleTimeoutMs <= 0) {
      await this.stopActive(active);
      return { status: "stopped", leaseId, pid: active.state.pid, remainingLeases: 0 };
    }
    active.idleTimer = setTimeout(() => {
      if (active.leases.size === 0) void this.stopActive(active).catch(() => undefined);
    }, idleTimeoutMs);
    return { status: "released", leaseId, pid: active.state.pid, remainingLeases: 0 };
  }

  async stopProfile(input: LocalLlamaServerStopProfileInput): Promise<LocalLlamaServerStopProfileResult> {
    const stateDir = localLlamaServerStateDir(input.stateRootPath, input.profileId);
    const active = [...this.activeServers.values()].find((candidate) => candidate.state.stateDir === stateDir);
    if (active) {
      if (active.leases.size > 0 && input.force !== true) {
        return {
          status: "still-leased",
          profileId: input.profileId,
          pid: active.state.pid,
          remainingLeases: active.leases.size,
        };
      }
      const pid = active.state.pid;
      await this.stopActive(active);
      return { status: "stopped", profileId: input.profileId, pid, remainingLeases: 0 };
    }

    const state = await readLocalLlamaServerState(input.stateRootPath, input.profileId);
    if (!state) return { status: "not-found", profileId: input.profileId };
    await this.stopState(state);
    return { status: "stopped", profileId: input.profileId, pid: state.pid, remainingLeases: 0 };
  }

  async stopAll(): Promise<void> {
    const servers = [...this.activeServers.values()];
    await Promise.all(servers.map((active) => this.stopActive(active)));
  }

  private async startServer(
    input: NormalizedAcquireInput,
    launch: {
      port: number;
      stateDir: string;
      paths: ReturnType<typeof localLlamaServerLogPaths>;
      command: string[];
    },
  ): Promise<LocalLlamaServerState> {
    if (!existsSync(input.runtimeBinaryPath)) throw new Error(`Local llama runtime binary does not exist: ${input.runtimeBinaryPath}`);
    if (!existsSync(input.modelPath)) throw new Error(`Local llama model does not exist: ${input.modelPath}`);
    await mkdir(launch.stateDir, { recursive: true });
    const stdoutFd = openAppend(launch.paths.stdoutPath);
    const stderrFd = openAppend(launch.paths.stderrPath);
    const child = this.spawnProcess(input.runtimeBinaryPath, launch.command.slice(1), {
      cwd: launch.stateDir,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
      env: { ...process.env, ...input.env, LLAMA_LOG_COLORS: "off" },
    });
    if (!child.pid) throw new Error("Local llama-server process did not expose a process id.");
    child.unref();
    const now = this.now().toISOString();
    const state: LocalLlamaServerState = {
      schemaVersion: "ambient-local-llama-server-state-v1",
      profileId: input.profileId,
      pid: child.pid,
      endpointUrl: `http://${endpointHost(input.host)}:${launch.port}`,
      host: input.host,
      port: launch.port,
      runtimeBinaryPath: input.runtimeBinaryPath,
      modelPath: input.modelPath,
      contextTokens: input.contextTokens,
      ...(input.ownerThreadId ? { ownerThreadId: input.ownerThreadId } : {}),
      gpuLayers: input.gpuLayers,
      idleTimeoutMs: input.idleTimeoutMs,
      startedAt: now,
      lastUsedAt: now,
      stateDir: launch.stateDir,
      logPath: launch.paths.logPath,
      stdoutPath: launch.paths.stdoutPath,
      stderrPath: launch.paths.stderrPath,
      command: launch.command,
    };
    await writeLocalLlamaServerState(state);
    const health = await this.waitForHealth(state.endpointUrl, input.startupTimeoutMs, child.pid);
    if (!health.ok) {
      await this.stopState(state);
      throw new Error(`Local llama-server did not become healthy: ${health.error ?? health.textPreview ?? "unknown health response"}`);
    }
    return state;
  }

  private async waitForHealth(endpointUrl: string, startupTimeoutMs: number, pid: number): Promise<LocalLlamaServerHealthProbe> {
    const started = Date.now();
    let last: LocalLlamaServerHealthProbe | undefined;
    while (Date.now() - started < startupTimeoutMs) {
      if (!this.processAlive(pid)) {
        return { ok: false, endpointUrl, error: "Local llama-server exited during startup." };
      }
      last = await probeLocalLlamaServerHealth(endpointUrl, { fetchImpl: this.fetchImpl, timeoutMs: 3000 });
      if (last.ok) return last;
      await this.sleep(250);
    }
    return last ?? { ok: false, endpointUrl, error: `Local llama-server did not become healthy within ${startupTimeoutMs}ms.` };
  }

  private async createLease(active: ActiveServer): Promise<LocalLlamaServerLease> {
    if (active.idleTimer) {
      clearTimeout(active.idleTimer);
      active.idleTimer = undefined;
    }
    const leaseId = `llama-lease-${this.now().getTime()}-${Math.random().toString(36).slice(2, 10)}`;
    active.leases.add(leaseId);
    this.leases.set(leaseId, active);
    active.state.lastUsedAt = this.now().toISOString();
    await writeLocalLlamaServerState(active.state);
    return {
      leaseId,
      state: active.state,
      release: () => this.release(leaseId).then(() => undefined),
    };
  }

  private rememberActive(key: string, state: LocalLlamaServerState): ActiveServer {
    const active: ActiveServer = { key, state, leases: new Set() };
    this.activeServers.set(key, active);
    return active;
  }

  private async stopActive(active: ActiveServer): Promise<void> {
    if (active.idleTimer) clearTimeout(active.idleTimer);
    for (const leaseId of active.leases) this.leases.delete(leaseId);
    active.leases.clear();
    await this.stopState(active.state);
    this.activeServers.delete(active.key);
  }

  private async stopState(state: LocalLlamaServerState): Promise<void> {
    if (this.processAlive(state.pid)) {
      this.terminate(state.pid);
      await this.sleep(500);
      if (this.processAlive(state.pid)) {
        try {
          this.killProcess(state.pid, "SIGKILL");
        } catch {
          // The process may have exited after the second liveness check.
        }
      }
    }
    await rm(localLlamaServerStatePath(state.stateDir), { force: true });
  }

  private terminate(pid: number): void {
    try {
      this.killProcess(pid, "SIGTERM");
    } catch {
      // The process may have exited between the liveness check and termination.
    }
  }
}

export function buildLocalLlamaServerArgs(input: {
  modelPath: string;
  host: string;
  port: number;
  contextTokens: number;
  gpuLayers?: number;
  chatTemplate?: string;
  logPath: string;
  offline?: boolean;
  extraArgs?: string[];
}): string[] {
  return [
    "--model",
    input.modelPath,
    "--host",
    input.host,
    "--port",
    String(normalizePort(input.port)),
    "-c",
    String(normalizePositiveInteger(input.contextTokens, "contextTokens")),
    "-ngl",
    String(normalizeNonNegativeInteger(input.gpuLayers ?? defaultGpuLayers, "gpuLayers")),
    "--log-file",
    input.logPath,
    ...(input.chatTemplate?.trim() ? ["--chat-template", input.chatTemplate.trim()] : []),
    ...(input.offline ? ["--offline"] : []),
    ...(input.extraArgs ?? []),
  ];
}

export async function probeLocalLlamaServerHealth(
  endpointUrl: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<LocalLlamaServerHealthProbe> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);
  const started = Date.now();
  try {
    const response = await fetchImpl(`${endpointUrl}/health`, { signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      endpointUrl,
      statusCode: response.status,
      latencyMs: Date.now() - started,
      body: parseJsonLenient(text),
      textPreview: text.length > 2000 ? `${text.slice(0, 2000)}\n...[truncated ${text.length - 2000} chars]` : text,
    };
  } catch (error) {
    return {
      ok: false,
      endpointUrl,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function localLlamaServerStateDir(stateRootPath: string, profileId: string): string {
  return resolve(stateRootPath, sanitizePathSegment(profileId));
}

export async function readLocalLlamaServerState(stateRootPath: string, profileId: string): Promise<LocalLlamaServerState | undefined> {
  return readLocalLlamaServerStateFromDir(localLlamaServerStateDir(stateRootPath, profileId));
}

export async function readLocalLlamaServerStateFromDir(stateDir: string): Promise<LocalLlamaServerState | undefined> {
  try {
    const parsed = JSON.parse(await readFile(localLlamaServerStatePath(stateDir), "utf8")) as LocalLlamaServerState;
    if (parsed.schemaVersion !== "ambient-local-llama-server-state-v1") return undefined;
    return {
      ...parsed,
      idleTimeoutMs: typeof parsed.idleTimeoutMs === "number" ? parsed.idleTimeoutMs : defaultIdleTimeoutMs,
    };
  } catch {
    return undefined;
  }
}

function normalizeAcquireInput(input: LocalLlamaServerAcquireInput): NormalizedAcquireInput {
  const host = normalizeLocalHost(input.host?.trim() || defaultHost);
  if (!isApprovedLocalHost(host)) throw new Error("Local llama-server may only bind to localhost, 127.0.0.1, or [::1].");
  return {
    ...input,
    host,
    runtimeBinaryPath: resolve(input.runtimeBinaryPath),
    modelPath: resolve(input.modelPath),
    stateRootPath: resolve(input.stateRootPath),
    contextTokens: normalizePositiveInteger(input.contextTokens, "contextTokens"),
    gpuLayers: normalizeNonNegativeInteger(input.gpuLayers ?? defaultGpuLayers, "gpuLayers"),
    startupTimeoutMs: normalizeNonNegativeInteger(input.startupTimeoutMs ?? defaultStartupTimeoutMs, "startupTimeoutMs"),
    idleTimeoutMs: normalizeNonNegativeInteger(input.idleTimeoutMs ?? defaultIdleTimeoutMs, "idleTimeoutMs"),
    extraArgs: input.extraArgs ?? [],
    ...(input.port !== undefined ? { port: normalizePort(input.port) } : {}),
  };
}

function localLlamaServerLogPaths(stateDir: string): { logPath: string; stdoutPath: string; stderrPath: string } {
  return {
    logPath: join(stateDir, "llama-server.log"),
    stdoutPath: join(stateDir, "llama-server.stdout.log"),
    stderrPath: join(stateDir, "llama-server.stderr.log"),
  };
}

async function writeLocalLlamaServerState(state: LocalLlamaServerState): Promise<void> {
  await mkdir(state.stateDir, { recursive: true });
  await writeFile(localLlamaServerStatePath(state.stateDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function localLlamaServerStatePath(stateDir: string): string {
  return join(stateDir, "server-state.json");
}

function openAppend(path: string): number {
  return openSync(path, "a");
}

function serverKey(input: NormalizedAcquireInput): string {
  return [
    input.profileId,
    input.runtimeBinaryPath,
    input.modelPath,
    input.contextTokens,
    input.gpuLayers,
    input.host,
    input.port ?? "auto",
    input.chatTemplate ?? "",
    input.offline ? "offline" : "online",
    ...input.extraArgs,
  ].join("\0");
}

function sameCommand(left: string[] | undefined, right: string[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function activeIdleTimeoutMs(active: ActiveServer): number {
  return active.state.idleTimeoutMs;
}

function parseJsonLenient(text: string): unknown {
  try {
    return text.trim() ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "--").replace(/^[.-]+|[.-]+$/g, "") || "llama-server";
}

function normalizePort(value: number): number {
  const port = normalizePositiveInteger(value, "port");
  if (port > 65_535) throw new Error(`Invalid port: ${value}`);
  return port;
}

function normalizePositiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric value for ${name}: ${value}`);
  const normalized = Math.floor(value);
  if (normalized <= 0) throw new Error(`${name} must be greater than zero.`);
  return normalized;
}

function normalizeNonNegativeInteger(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric value for ${name}: ${value}`);
  const normalized = Math.floor(value);
  if (normalized < 0) throw new Error(`${name} must be non-negative.`);
  return normalized;
}

function isApprovedLocalHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function normalizeLocalHost(host: string): string {
  return host === "[::1]" ? "::1" : host;
}

function endpointHost(host: string): string {
  return host === "::1" ? "[::1]" : host;
}

function defaultProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function defaultKillProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  process.kill(pid, signal);
}

function findAvailableLocalPort(host: string): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close((error) => {
        if (error) reject(error);
        else if (typeof port === "number") resolvePort(port);
        else reject(new Error("Could not allocate a managed local llama-server port."));
      });
    });
  });
}
