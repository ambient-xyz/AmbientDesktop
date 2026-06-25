import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { CodexPluginMcpTool, PluginMcpRuntimeEvent, PluginMcpRuntimeSnapshot, PluginMcpRuntimeStatus } from "../../shared/pluginTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import { spawnToolProcess } from "./pluginsToolRuntimeFacade";

const initialRestartBackoffMs = 1_000;
const maxRestartBackoffMs = 30_000;
const maxRecentRuntimeEvents = 20;

export interface PluginMcpLaunchPlan {
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
  pluginFingerprint: string;
  serverName: string;
  cwd: string;
  command?: string;
  args: string[];
  envKeys: string[];
  enabled: boolean;
  startable: boolean;
  reason?: string;
}

export interface ResolvedPluginMcpOptions {
  timeoutMs: number;
  permissionMode: PermissionMode;
  workspacePath?: string;
  signal?: AbortSignal;
}

export interface PluginMcpRuntime {
  key: string;
  plan: PluginMcpLaunchPlan;
  permissionMode: PermissionMode;
  workspacePath: string;
  child: ChildProcessWithoutNullStreams;
  client: JsonRpcLineClient;
  stderrChunks: string[];
  status: PluginMcpRuntimeStatus;
  startedAt: string;
  requestCount: number;
  nextEventSequence: number;
  recentEvents: PluginMcpRuntimeEvent[];
  initialization: Promise<void>;
  tools?: CodexPluginMcpTool[];
  lastError?: string;
  failureCount: number;
  backoffUntil?: string;
  stopping: boolean;
}

export class PluginMcpRuntimeManager {
  private readonly runtimes = new Map<string, PluginMcpRuntime>();

  snapshots(): PluginMcpRuntimeSnapshot[] {
    return Array.from(this.runtimes.values()).map((runtime) => ({
      key: runtime.key,
      pluginId: runtime.plan.pluginId,
      pluginName: runtime.plan.pluginName,
      pluginVersion: runtime.plan.pluginVersion,
      pluginFingerprint: runtime.plan.pluginFingerprint,
      serverName: runtime.plan.serverName,
      status: runtime.status,
      permissionMode: runtime.permissionMode,
      workspacePath: runtime.workspacePath,
      cwd: runtime.plan.cwd,
      ...(runtime.plan.command ? { command: runtime.plan.command } : {}),
      args: runtime.plan.args,
      envKeys: runtime.plan.envKeys,
      ...(runtime.child.pid ? { pid: runtime.child.pid } : {}),
      startedAt: runtime.startedAt,
      requestCount: runtime.requestCount,
      ...(runtime.tools ? { toolCount: runtime.tools.length } : {}),
      ...(runtime.failureCount > 0 ? { failureCount: runtime.failureCount } : {}),
      ...(runtime.backoffUntil ? { backoffUntil: runtime.backoffUntil } : {}),
      ...(runtime.lastError ? { lastError: runtime.lastError } : {}),
      ...(runtime.stderrChunks.length > 0 ? { stderr: truncate(runtime.stderrChunks.join(""), 2_000) } : {}),
      ...(runtime.recentEvents.length > 0 ? { recentEvents: runtime.recentEvents.map((event) => ({ ...event })) } : {}),
    }));
  }

  async restartRuntime(key: string, options: { timeoutMs?: number } = {}): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    const existing = this.runtimes.get(key);
    if (!existing) return undefined;
    const plan = existing.plan;
    const resolved = resolvePluginMcpOptions({
      timeoutMs: options.timeoutMs,
      permissionMode: existing.permissionMode,
      workspacePath: existing.workspacePath,
    });
    const previousFailureCount = existing.failureCount;
    await this.stopRuntime(existing, "stopped");
    this.runtimes.delete(key);
    try {
      const restarted = await this.ensureRuntime(plan, resolved, previousFailureCount);
      recordInstantRuntimeEvent(restarted, "restart", "succeeded", "Manual runtime restart completed.");
    } catch {
      // The failed launch leaves a diagnostic snapshot in place.
      const failed = this.runtimes.get(runtimeKey(plan, resolved));
      if (failed) recordInstantRuntimeEvent(failed, "restart", "failed", "Manual runtime restart failed.");
    }
    return this.snapshots();
  }

  async stopRuntimeByKey(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    const existing = this.runtimes.get(key);
    if (!existing) return undefined;
    await this.stopRuntime(existing, "stopped");
    this.runtimes.delete(key);
    return this.snapshots();
  }

  async shutdown(): Promise<void> {
    const runtimes = Array.from(this.runtimes.values());
    this.runtimes.clear();
    await Promise.all(runtimes.map((runtime) => this.stopRuntime(runtime, "stopped")));
  }

  async shutdownWorkspace(workspacePath: string): Promise<void> {
    const runtimes = Array.from(this.runtimes.values()).filter((runtime) => runtime.workspacePath === workspacePath);
    for (const runtime of runtimes) this.runtimes.delete(runtime.key);
    await Promise.all(runtimes.map((runtime) => this.stopRuntime(runtime, "stopped")));
  }

  async listTools(runtime: PluginMcpRuntime, timeoutMs: number): Promise<CodexPluginMcpTool[]> {
    if (runtime.tools) return runtime.tools;

    try {
      runtime.requestCount += 1;
      const finishEvent = startRuntimeEvent(runtime, "tools/list");
      const result = await runtime.client.request("tools/list", {}, timeoutMs);
      finishEvent("succeeded");
      runtime.tools = toolsFromResult(runtime.plan, result);
      return runtime.tools;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const event = runtime.recentEvents.at(-1);
      if (event?.method === "tools/list" && event.status === "started") finishRuntimeEvent(event, "failed", message);
      await this.markRuntimeUnhealthy(runtime, message);
      throw error;
    }
  }

  async ensureRuntime(plan: PluginMcpLaunchPlan, options: ResolvedPluginMcpOptions, failureCountSeed = 0): Promise<PluginMcpRuntime> {
    if (!plan.startable) {
      throw new Error(plan.reason ?? "MCP server is not startable.");
    }

    const key = runtimeKey(plan, options);
    const existing = this.runtimes.get(key);
    if (existing && (existing.status === "starting" || existing.status === "ready")) {
      await existing.initialization;
      return existing;
    }
    await this.stopStalePluginRuntimes(plan, key);
    const previousFailureCount = existing?.failureCount ?? failureCountSeed;
    if (existing) {
      const remainingBackoffMs = runtimeBackoffRemainingMs(existing);
      if (remainingBackoffMs > 0) {
        throw new Error(
          `MCP server is backing off after failure; retry after ${existing.backoffUntil}. ${existing.lastError ?? ""}`.trim(),
        );
      }
      await this.stopRuntime(existing, "stopped");
      this.runtimes.delete(key);
    }

    const workspacePath = options.workspacePath ?? plan.cwd;
    const launched = spawnToolProcess({
      command: plan.command!,
      args: plan.args,
      cwd: plan.cwd,
      env: processEnvForPlugin(plan.envKeys),
      policy: {
        permissionMode: options.permissionMode,
        workspacePath,
        subject: "plugin-mcp",
      },
    });

    const runtime: PluginMcpRuntime = {
      key,
      plan,
      permissionMode: options.permissionMode,
      workspacePath,
      child: launched.child,
      client: new JsonRpcLineClient(launched.child, options.timeoutMs),
      stderrChunks: [],
      status: "starting",
      startedAt: new Date().toISOString(),
      requestCount: 0,
      nextEventSequence: 1,
      recentEvents: [],
      initialization: Promise.resolve(),
      failureCount: previousFailureCount,
      stopping: false,
    };

    launched.child.stderr.on("data", (chunk: Buffer) => {
      const stderr = chunk.toString("utf8");
      runtime.stderrChunks.push(stderr);
      if (runtime.stderrChunks.join("").length > 4_000) {
        runtime.stderrChunks = [truncate(runtime.stderrChunks.join(""), 4_000)];
      }
      recordInstantRuntimeEvent(runtime, "stderr", "succeeded", truncate(stderr.trim() || stderr, 1_000));
    });
    launched.child.once("error", (error) => {
      if (runtime.stopping) return;
      this.recordRuntimeFailure(runtime, "unhealthy", error.message);
    });
    launched.child.once("exit", (code, signal) => {
      if (runtime.stopping) return;
      this.recordRuntimeFailure(runtime, "crashed", `MCP server exited (${code ?? signal ?? "unknown"}).`);
    });

    this.runtimes.set(key, runtime);
    const finishInitialization = startRuntimeEvent(runtime, "initialize");
    runtime.initialization = initializeMcpClient(runtime.client)
      .then(() => {
        finishInitialization("succeeded");
        if (runtime.status === "starting") {
          runtime.status = "ready";
          runtime.failureCount = 0;
          runtime.backoffUntil = undefined;
        }
      })
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        finishInitialization("failed", message);
        await this.markRuntimeUnhealthy(runtime, message);
        throw error;
      });

    await runtime.initialization;
    return runtime;
  }

  async markRuntimeUnhealthy(runtime: PluginMcpRuntime, message: string): Promise<void> {
    const status = runtime.status === "crashed" ? "crashed" : "unhealthy";
    this.recordRuntimeFailure(runtime, status, message);
    await this.stopRuntime(runtime, runtime.status);
  }

  private recordRuntimeFailure(runtime: PluginMcpRuntime, status: "unhealthy" | "crashed", message: string): void {
    if (!runtime.backoffUntil) runtime.failureCount += 1;
    runtime.status = status;
    runtime.lastError = message;
    runtime.backoffUntil = new Date(Date.now() + restartBackoffMs(runtime.failureCount)).toISOString();
    recordInstantRuntimeEvent(runtime, status, "failed", message);
  }

  private async stopRuntime(runtime: PluginMcpRuntime, status: PluginMcpRuntimeStatus): Promise<void> {
    runtime.stopping = true;
    runtime.status = status;
    recordInstantRuntimeEvent(runtime, "stop", "succeeded", `Runtime marked ${status}.`);
    if (runtime.child.killed || runtime.child.exitCode !== null || runtime.child.signalCode !== null) return;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 500);
      runtime.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      runtime.child.kill();
    });
  }

  private async stopStalePluginRuntimes(plan: PluginMcpLaunchPlan, nextKey: string): Promise<void> {
    const stale = Array.from(this.runtimes.values()).filter(
      (runtime) =>
        runtime.key !== nextKey &&
        runtime.plan.pluginId === plan.pluginId &&
        runtime.plan.serverName === plan.serverName &&
        runtime.plan.pluginFingerprint !== plan.pluginFingerprint,
    );
    for (const runtime of stale) {
      await this.stopRuntime(runtime, "stopped");
      this.runtimes.delete(runtime.key);
    }
  }
}

export function resolvePluginMcpOptions(options: {
  timeoutMs?: number;
  permissionMode?: PermissionMode;
  workspacePath?: string;
  signal?: AbortSignal;
}): ResolvedPluginMcpOptions {
  return {
    timeoutMs: options.timeoutMs ?? 8_000,
    permissionMode: options.permissionMode ?? "full-access",
    workspacePath: options.workspacePath,
    signal: options.signal,
  };
}

function processEnvForPlugin(envKeys: string[]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of envKeys) {
    if (!(key in env)) env[key] = "";
  }
  return env;
}

async function initializeMcpClient(client: JsonRpcLineClient): Promise<void> {
  await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "Ambient Desktop", version: "0.1.0" },
  });
  client.notify("notifications/initialized", {});
}

function toolsFromResult(plan: PluginMcpLaunchPlan, result: unknown): CodexPluginMcpTool[] {
  if (!result || typeof result !== "object") return [];
  const tools = (result as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];

  return tools
    .map((tool) => {
      if (!tool || typeof tool !== "object") return undefined;
      const record = tool as Record<string, unknown>;
      if (typeof record.name !== "string" || !record.name) return undefined;
      return {
        pluginId: plan.pluginId,
        pluginName: plan.pluginName,
        serverName: plan.serverName,
        name: record.name,
        ...(typeof record.description === "string" ? { description: record.description } : {}),
        ...("inputSchema" in record ? { inputSchema: record.inputSchema } : {}),
      } satisfies CodexPluginMcpTool;
    })
    .filter((tool): tool is CodexPluginMcpTool => Boolean(tool));
}

function runtimeKey(plan: PluginMcpLaunchPlan, options: ResolvedPluginMcpOptions): string {
  return JSON.stringify({
    pluginId: plan.pluginId,
    pluginFingerprint: plan.pluginFingerprint,
    serverName: plan.serverName,
    cwd: plan.cwd,
    command: plan.command,
    args: plan.args,
    envKeys: plan.envKeys,
    permissionMode: options.permissionMode,
    workspacePath: options.workspacePath ?? plan.cwd,
  });
}

function restartBackoffMs(failureCount: number): number {
  return Math.min(maxRestartBackoffMs, initialRestartBackoffMs * 2 ** Math.max(0, failureCount - 1));
}

function runtimeBackoffRemainingMs(runtime: PluginMcpRuntime): number {
  if (!runtime.backoffUntil) return 0;
  return Math.max(0, new Date(runtime.backoffUntil).getTime() - Date.now());
}

export function startRuntimeEvent(
  runtime: PluginMcpRuntime,
  method: string,
  toolName?: string,
): (status: "succeeded" | "failed", error?: string) => void {
  const startedAtMs = Date.now();
  const event: PluginMcpRuntimeEvent = {
    sequence: runtime.nextEventSequence,
    method,
    ...(toolName ? { toolName } : {}),
    status: "started",
    startedAt: new Date(startedAtMs).toISOString(),
  };
  runtime.nextEventSequence += 1;
  runtime.recentEvents.push(event);
  if (runtime.recentEvents.length > maxRecentRuntimeEvents) {
    runtime.recentEvents = runtime.recentEvents.slice(-maxRecentRuntimeEvents);
  }
  return (status, error) => finishRuntimeEvent(event, status, error, startedAtMs);
}

function recordInstantRuntimeEvent(runtime: PluginMcpRuntime, method: string, status: "succeeded" | "failed", message?: string): void {
  const now = new Date().toISOString();
  runtime.recentEvents.push({
    sequence: runtime.nextEventSequence,
    method,
    status,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    ...(message ? { error: truncate(message, 1_000) } : {}),
  });
  runtime.nextEventSequence += 1;
  if (runtime.recentEvents.length > maxRecentRuntimeEvents) {
    runtime.recentEvents = runtime.recentEvents.slice(-maxRecentRuntimeEvents);
  }
}

function finishRuntimeEvent(
  event: PluginMcpRuntimeEvent,
  status: "succeeded" | "failed",
  error?: string,
  startedAtMs = Date.parse(event.startedAt),
): void {
  const finishedAtMs = Date.now();
  event.status = status;
  event.finishedAt = new Date(finishedAtMs).toISOString();
  event.durationMs = Math.max(0, finishedAtMs - startedAtMs);
  if (error) event.error = truncate(error, 1_000);
}

export class JsonRpcLineClient {
  private nextId = 1;
  private buffer = "";
  private readonly pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
      signal?: AbortSignal;
      onAbort?: () => void;
    }
  >();

  constructor(
    private readonly process: ChildProcessWithoutNullStreams,
    private readonly timeoutMs: number,
  ) {
    process.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    process.on("error", (error) => this.rejectAll(error));
    process.on("exit", (code, signal) => {
      if (this.pending.size > 0) this.rejectAll(new Error(`MCP server exited before responding (${code ?? signal ?? "unknown"}).`));
    });
  }

  request(method: string, params: unknown, timeoutMs = this.timeoutMs, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) return Promise.reject(new Error(`MCP ${method} aborted.`));
    const id = this.nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(id);
        if (pending) this.clearPending(id, pending);
        this.notify("notifications/cancelled", { requestId: id, reason: `Timed out waiting for MCP ${method}.` });
        reject(new Error(`Timed out waiting for MCP ${method}.`));
      }, timeoutMs);
      const pending = { resolve, reject, timer, signal };
      const onAbort = signal
        ? () => {
            const pending = this.pending.get(id);
            if (pending) this.clearPending(id, pending);
            this.notify("notifications/cancelled", { requestId: id, reason: "Ambient request aborted." });
            reject(new Error(`MCP ${method} aborted.`));
          }
        : undefined;
      this.pending.set(id, { ...pending, onAbort });
      if (signal && onAbort) {
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }
    });
    if (!this.pending.has(id)) return promise;
    this.write(message);
    return promise;
  }

  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(message: unknown): void {
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline === -1) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      this.onMessage(line);
    }
  }

  private onMessage(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    const response = message as { id?: unknown; result?: unknown; error?: { message?: unknown } };
    if (typeof response.id !== "number") return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.clearPending(response.id, pending);
    if (response.error) {
      pending.reject(new Error(typeof response.error.message === "string" ? response.error.message : "MCP request failed."));
      return;
    }
    pending.resolve(response.result);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.clearPending(id, pending);
      pending.reject(error);
    }
  }

  private clearPending(id: number, pending: { timer: NodeJS.Timeout; signal?: AbortSignal; onAbort?: () => void }): void {
    clearTimeout(pending.timer);
    if (pending.signal && pending.onAbort) pending.signal.removeEventListener("abort", pending.onAbort);
    this.pending.delete(id);
  }
}

export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
