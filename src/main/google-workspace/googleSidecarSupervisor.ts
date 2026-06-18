import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { arch, platform } from "node:os";
import { join, resolve } from "node:path";
import { redactString } from "./googleWorkspaceDiagnosticsFacade";

export interface GoogleSidecarRequest {
  method: string;
  accessToken?: string;
  accountHint?: string;
  input?: unknown;
  options?: {
    timeoutMs?: number;
    dryRun?: boolean;
    cwd?: string;
  };
}

export interface GoogleSidecarError {
  code: string;
  message: string;
  googleStatus?: number;
  retryable: boolean;
  scopeHint?: string;
}

export interface GoogleSidecarResponse<T = unknown> {
  id?: string;
  ok: boolean;
  result?: T;
  error?: GoogleSidecarError;
}

export interface GoogleSidecarVersion {
  name: string;
  version: string;
  protocolVersion: string;
  methods: string[];
}

export interface GoogleSidecarSupervisorOptions {
  binaryPath?: string;
  resourcesPath?: string;
  appRoot?: string;
  isPackaged?: boolean;
  idleTimeoutMs?: number;
  spawnProcess?: typeof spawn;
  now?: () => number;
  onDiagnostic?: (entry: GoogleSidecarDiagnosticEntry) => void;
}

export interface GoogleSidecarDiagnosticEntry {
  level: "info" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
}

interface PendingRequest {
  id: string;
  resolve: (response: GoogleSidecarResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const SIDECAR_DIR = "google-sidecar";
const SIDECAR_BASENAME = "ambient-google-sidecar";
const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60_000;

export class GoogleSidecarSupervisor {
  private child?: ChildProcessWithoutNullStreams;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private nextRequestId = 1;
  private pending = new Map<string, PendingRequest>();
  private idleTimer?: NodeJS.Timeout;
  private readonly spawnProcess: typeof spawn;
  private readonly now: () => number;

  constructor(private readonly options: GoogleSidecarSupervisorOptions = {}) {
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.now = options.now ?? (() => Date.now());
  }

  binaryPath(): string {
    if (this.options.binaryPath) return resolve(this.options.binaryPath);
    const name = sidecarBinaryName(platform(), arch());
    if (this.options.isPackaged) {
      return join(this.options.resourcesPath ?? process.resourcesPath, SIDECAR_DIR, name);
    }
    return join(this.options.appRoot ?? process.cwd(), "build", SIDECAR_DIR, name);
  }

  status(): { state: "missing" | "stopped" | "running"; binaryPath: string; pending: number } {
    const binaryPath = this.binaryPath();
    if (!existsSync(binaryPath)) return { state: "missing", binaryPath, pending: this.pending.size };
    return { state: this.child ? "running" : "stopped", binaryPath, pending: this.pending.size };
  }

  async version(timeoutMs = 5_000): Promise<GoogleSidecarVersion> {
    return this.invoke<GoogleSidecarVersion>({ method: "sidecar.version", options: { timeoutMs } });
  }

  async invoke<T = unknown>(request: GoogleSidecarRequest): Promise<T> {
    const child = this.ensureStarted();
    const id = `google-sidecar-${this.now()}-${this.nextRequestId++}`;
    const timeoutMs = Math.max(1_000, request.options?.timeoutMs ?? 30_000);
    const payload = {
      id,
      method: request.method,
      accessToken: request.accessToken,
      accountHint: request.accountHint,
      input: request.input ?? {},
      options: request.options,
    };

    const response = await new Promise<GoogleSidecarResponse<T>>((resolveRequest, rejectRequest) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        this.restartAfterFailure(`Google sidecar request timed out: ${request.method}`);
        rejectRequest(new Error(`Google sidecar request timed out: ${request.method}`));
      }, timeoutMs);
      this.pending.set(id, {
        id,
        timeout,
        resolve: (response) => resolveRequest(response as GoogleSidecarResponse<T>),
        reject: rejectRequest,
      });
      child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(id);
        rejectRequest(error);
      });
    });

    this.scheduleIdleShutdown();
    if (!response.ok) {
      const code = response.error?.code ?? "sidecar_internal";
      const message = response.error?.message ?? "Google sidecar request failed.";
      throw Object.assign(new Error(message), { code, sidecarError: response.error });
    }
    return response.result as T;
  }

  dispose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    this.rejectPending(new Error("Google sidecar supervisor disposed."));
    this.child?.kill();
    this.child = undefined;
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) return this.child;
    const binaryPath = this.binaryPath();
    if (!existsSync(binaryPath)) {
      throw new Error(`Google sidecar binary is missing: ${binaryPath}`);
    }
    const child = this.spawnProcess(binaryPath, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: minimalSidecarEnv(process.env),
    });
    this.child = child;
    this.emitDiagnostic("info", "Google sidecar started.", { binaryPath });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    child.stderr.on("data", (chunk: string) => this.handleStderr(chunk));
    child.on("error", (error) => {
      this.emitDiagnostic("error", "Google sidecar process error.", { error: error.message });
      this.rejectPending(error);
      this.child = undefined;
    });
    child.on("exit", (code, signal) => {
      this.emitDiagnostic("warning", "Google sidecar exited.", { code, signal });
      this.rejectPending(new Error(`Google sidecar exited unexpectedly: code=${code ?? "none"} signal=${signal ?? "none"}`));
      if (this.child === child) this.child = undefined;
    });
    return child;
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    for (;;) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let response: GoogleSidecarResponse;
      try {
        response = JSON.parse(line) as GoogleSidecarResponse;
      } catch (error) {
        this.restartAfterFailure(`Google sidecar emitted invalid JSON: ${errorMessage(error)}`);
        return;
      }
      const id = response.id;
      const pending = id ? this.pending.get(id) : undefined;
      if (!pending) {
        this.emitDiagnostic("warning", "Google sidecar emitted response for an unknown request.", { id });
        continue;
      }
      clearTimeout(pending.timeout);
      this.pending.delete(id!);
      pending.resolve(response);
    }
  }

  private handleStderr(chunk: string): void {
    this.stderrBuffer = `${this.stderrBuffer}${chunk}`.slice(-8_000);
    const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      this.emitDiagnostic("warning", "Google sidecar stderr.", { message: redactString(line) });
    }
  }

  private restartAfterFailure(reason: string): void {
    this.emitDiagnostic("error", reason);
    const error = new Error(reason);
    this.rejectPending(error);
    this.child?.kill();
    this.child = undefined;
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private scheduleIdleShutdown(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const idleTimeoutMs = this.options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    if (idleTimeoutMs <= 0) return;
    this.idleTimer = setTimeout(() => {
      if (this.pending.size > 0) return;
      this.emitDiagnostic("info", "Google sidecar stopped after idle timeout.");
      this.child?.kill();
      this.child = undefined;
    }, idleTimeoutMs);
  }

  private emitDiagnostic(level: GoogleSidecarDiagnosticEntry["level"], message: string, details?: Record<string, unknown>): void {
    this.options.onDiagnostic?.({ level, message, details });
  }
}

export function sidecarBinaryName(osPlatform = platform(), osArch = arch()): string {
  const suffix = osPlatform === "win32" ? ".exe" : "";
  return `${SIDECAR_BASENAME}-${normalizedPlatform(osPlatform)}-${normalizedArch(osArch)}${suffix}`;
}

function normalizedPlatform(value: string): string {
  if (value === "darwin") return "darwin";
  if (value === "linux") return "linux";
  if (value === "win32") return "win32";
  return value;
}

function normalizedArch(value: string): string {
  if (value === "x64") return "x64";
  if (value === "arm64") return "arm64";
  return value;
}

function minimalSidecarEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR"]) {
    if (env[key]) next[key] = env[key];
  }
  return next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
