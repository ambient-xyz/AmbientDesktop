import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  MessagingGatewayBridgeSupervisorStatus,
  MessagingGatewayProviderReadiness,
} from "../shared/messagingGateway";
import { redactString } from "./diagnostics";

const PROVIDER_ID = "telegram-tdlib";
const DEFAULT_PORT = "8091";
const DEFAULT_AMBIENT_AGENT_ROOT = "/path/to/ambientAgent";
const MAX_LOG_LINES = 20;

export interface TelegramBridgeSupervisorOptions {
  workspacePath?: string;
  ambientAgentRoot?: string;
  bridgeBaseUrl?: string;
  stateRoot?: string;
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  spawnProcess?: typeof spawn;
  now?: () => Date;
}

export interface TelegramBridgeSupervisorStartInput {
  readiness?: MessagingGatewayProviderReadiness;
}

export interface TelegramBridgeSupervisorSetupStartInput {
  apiCredentialsPresent: boolean;
}

export class TelegramBridgeSupervisor {
  private child?: ChildProcessWithoutNullStreams;
  private state: MessagingGatewayBridgeSupervisorStatus["state"] = "stopped";
  private lastStartedAt: string | undefined;
  private lastStoppedAt: string | undefined;
  private lastError: string | undefined;
  private readonly recentLogs: string[] = [];
  private readonly spawnProcess: typeof spawn;
  private readonly now: () => Date;

  constructor(private readonly options: TelegramBridgeSupervisorOptions = {}) {
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.now = options.now ?? (() => new Date());
  }

  status(): MessagingGatewayBridgeSupervisorStatus {
    const spec = this.spec();
    if (!this.packageAvailable()) {
      return {
        ...spec,
        state: "missing",
        managed: false,
        lastError: `Ambient Agent Telegram package was not found at ${this.packagePath()}.`,
        recentLogs: [...this.recentLogs],
      };
    }
    const childRunning = Boolean(this.child && !this.child.killed);
    return {
      ...spec,
      state: childRunning ? this.state : this.state === "running" || this.state === "starting" ? "stopped" : this.state,
      managed: childRunning,
      ...(childRunning && this.child?.pid ? { pid: this.child.pid } : {}),
      ...(this.lastStartedAt ? { lastStartedAt: this.lastStartedAt } : {}),
      ...(this.lastStoppedAt ? { lastStoppedAt: this.lastStoppedAt } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      recentLogs: [...this.recentLogs],
    };
  }

  async start(input: TelegramBridgeSupervisorStartInput = {}): Promise<MessagingGatewayBridgeSupervisorStatus> {
    if (!input.readiness?.configured) {
      throw new Error("Telegram bridge launch requires configured local session metadata.");
    }
    if (!input.readiness.apiCredentialsPresent) {
      throw new Error("Telegram bridge launch requires Telegram API credentials in the runtime environment.");
    }
    return this.launch();
  }

  async startForSetup(input: TelegramBridgeSupervisorSetupStartInput): Promise<MessagingGatewayBridgeSupervisorStatus> {
    if (!input.apiCredentialsPresent) {
      throw new Error("Telegram setup bridge launch requires Telegram API credentials in the runtime environment.");
    }
    return this.launch();
  }

  private async launch(): Promise<MessagingGatewayBridgeSupervisorStatus> {
    if (this.child && !this.child.killed) {
      return this.status();
    }
    if (!this.packageAvailable()) {
      throw new Error(`Ambient Agent Telegram package was not found at ${this.packagePath()}.`);
    }
    const spec = this.spec();
    this.state = "starting";
    this.lastError = undefined;
    this.lastStartedAt = this.now().toISOString();
    const child = this.spawnProcess(spec.command, spec.args, {
      cwd: spec.cwd,
      env: this.bridgeEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.recordLog("stdout", chunk));
    child.stderr.on("data", (chunk: string) => this.recordLog("stderr", chunk));
    child.on("error", (error) => {
      this.state = "error";
      this.lastError = error.message;
      this.recordLog("error", error.message);
      if (this.child === child) this.child = undefined;
    });
    child.on("exit", (code, signal) => {
      this.state = code === 0 ? "stopped" : "error";
      this.lastStoppedAt = this.now().toISOString();
      this.lastError = code === 0 ? undefined : `Telegram bridge exited: code=${code ?? "none"} signal=${signal ?? "none"}`;
      this.recordLog("exit", this.lastError ?? "Telegram bridge stopped.");
      if (this.child === child) this.child = undefined;
    });
    this.state = "running";
    return this.status();
  }

  async stop(): Promise<MessagingGatewayBridgeSupervisorStatus> {
    if (!this.child || this.child.killed) {
      this.state = "stopped";
      this.lastStoppedAt = this.now().toISOString();
      return this.status();
    }
    this.state = "stopping";
    this.child.kill();
    this.child = undefined;
    this.state = "stopped";
    this.lastStoppedAt = this.now().toISOString();
    return this.status();
  }

  dispose(): void {
    if (this.child && !this.child.killed) this.child.kill();
    this.child = undefined;
    this.state = "stopped";
  }

  private spec(): Omit<MessagingGatewayBridgeSupervisorStatus, "state" | "managed" | "pid" | "lastStartedAt" | "lastStoppedAt" | "lastError" | "recentLogs"> {
    const env = this.bridgeEnv();
    return {
      providerId: PROVIDER_ID,
      command: this.options.command ?? "pnpm",
      args: this.options.args ?? ["--dir", this.ambientAgentRoot(), "telegram:bridge"],
      cwd: this.ambientAgentRoot(),
      bridgeBaseUrl: this.bridgeBaseUrl(),
      stateRoot: this.stateRoot(),
      envKeys: Object.keys(env).filter((key) => key.startsWith("AMBIENT_AGENT_TELEGRAM_")).sort(),
      safeRootProbeOnly: true,
    };
  }

  private packageAvailable(): boolean {
    return existsSync(this.packagePath());
  }

  private packagePath(): string {
    return path.join(this.ambientAgentRoot(), "packages", "telegram", "package.json");
  }

  private ambientAgentRoot(): string {
    return path.resolve(this.options.ambientAgentRoot ?? this.options.env?.AMBIENT_AGENT_ROOT ?? DEFAULT_AMBIENT_AGENT_ROOT);
  }

  private bridgeBaseUrl(): string {
    const explicit = this.options.bridgeBaseUrl ?? this.options.env?.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL;
    if (explicit?.trim()) return explicit.trim().replace(/\/+$/, "");
    return `http://127.0.0.1:${this.bridgePort()}`;
  }

  private bridgePort(): string {
    const explicit = this.options.env?.AMBIENT_AGENT_TELEGRAM_BRIDGE_PORT?.trim();
    if (explicit) return explicit;
    const url = this.options.bridgeBaseUrl ?? this.options.env?.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL;
    if (url) {
      try {
        return new URL(url).port || DEFAULT_PORT;
      } catch {
        return DEFAULT_PORT;
      }
    }
    return DEFAULT_PORT;
  }

  private stateRoot(): string {
    return path.resolve(
      this.options.stateRoot
      ?? this.options.env?.AMBIENT_AGENT_TELEGRAM_STATE_ROOT
      ?? path.join(this.options.workspacePath ?? process.cwd(), ".ambient-agent-state", "telegram"),
    );
  }

  private bridgeEnv(): NodeJS.ProcessEnv {
    const base = { ...(this.options.env ?? process.env) };
    base.AMBIENT_AGENT_TELEGRAM_BRIDGE_PORT = this.bridgePort();
    base.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = this.stateRoot();
    return base;
  }

  private recordLog(source: string, chunk: string): void {
    const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      this.recentLogs.push(`${source}: ${this.redactLogLine(line)}`);
    }
    while (this.recentLogs.length > MAX_LOG_LINES) this.recentLogs.shift();
  }

  private redactLogLine(line: string): string {
    let redacted = redactString(line);
    const env = this.bridgeEnv();
    for (const key of ["AMBIENT_AGENT_TELEGRAM_API_ID", "AMBIENT_AGENT_TELEGRAM_API_HASH"]) {
      const value = env[key]?.trim();
      if (!value) continue;
      redacted = redacted.split(value).join("[REDACTED]");
    }
    return redacted;
  }
}
