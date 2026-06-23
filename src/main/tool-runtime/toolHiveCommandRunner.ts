import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveOrExtractToolHiveExecutable, type ResolveToolHiveExecutableOptions } from "./toolHiveBundle";

const execFileAsync = promisify(execFile);
const defaultTimeoutMs = 30_000;
const maxOutputBufferBytes = 8 * 1024 * 1024;

export type ToolHiveAllowedCommand =
  | "version"
  | "build"
  | "group-list"
  | "group-create"
  | "registry-list"
  | "registry-info"
  | "runtime-check"
  | "run-registry"
  | "run-import"
  | "run-remote"
  | "list"
  | "logs"
  | "stop"
  | "rm";

export interface ToolHiveCommandResult {
  command: ToolHiveAllowedCommand;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ToolHiveCommandInvocation {
  executablePath: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export type ToolHiveCommandExecutor = (invocation: ToolHiveCommandInvocation) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export interface ToolHiveOperationProgress {
  phase: string;
  status: "running" | "complete";
  message: string;
  workloadName?: string;
  command?: ToolHiveAllowedCommand;
  elapsedMs?: number;
}

export interface ToolHiveCommandRunnerOptions extends ResolveToolHiveExecutableOptions {
  userDataPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  executor?: ToolHiveCommandExecutor;
  timeoutMs?: number;
  containerRuntimeEnv(): Promise<NodeJS.ProcessEnv>;
}

export interface ToolHiveRunAllowedOptions {
  throwOnNonZero?: boolean;
  timeoutMs?: number;
}

export interface ToolHiveRunAllowedWithProgressOptions extends ToolHiveRunAllowedOptions {
  onProgress?: (progress: ToolHiveOperationProgress) => void;
  workloadName?: string;
  phase: string;
  message: string;
}

export class ToolHiveCommandRunner {
  constructor(private readonly options: ToolHiveCommandRunnerOptions) {}

  async runAllowed(
    command: ToolHiveAllowedCommand,
    args: string[],
    options: ToolHiveRunAllowedOptions = {},
  ): Promise<ToolHiveCommandResult> {
    assertAllowedCommandShape(command, args);
    const startedAt = Date.now();
    const executablePath = (await resolveOrExtractToolHiveExecutable({
      ...this.options,
      env: this.options.env ?? process.env,
      extractionRoot: join(this.options.userDataPath, "mcp", "toolhive", "bundle"),
    })).executablePath;
    const executor = this.options.executor ?? defaultExecutor;
    const result = await executor({
      executablePath,
      args,
      cwd: this.options.cwd ?? process.cwd(),
      env: await this.options.containerRuntimeEnv(),
      timeoutMs: options.timeoutMs ?? this.timeoutMs(),
    });
    const commandResult: ToolHiveCommandResult = {
      command,
      args,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - startedAt,
    };
    if (result.exitCode !== 0 && options.throwOnNonZero !== false) {
      throw new Error(`ToolHive ${command} failed with exit code ${result.exitCode}: ${redactToolHiveText(result.stderr || result.stdout)}`);
    }
    return commandResult;
  }

  timeoutMs(): number {
    return Math.max(1, Math.floor(this.options.timeoutMs ?? defaultTimeoutMs));
  }

  async runAllowedWithProgress(
    command: ToolHiveAllowedCommand,
    args: string[],
    options: ToolHiveRunAllowedWithProgressOptions,
  ): Promise<ToolHiveCommandResult> {
    const startedAt = Date.now();
    const emit = (status: ToolHiveOperationProgress["status"], message = options.message) => {
      emitToolHiveProgress(options.onProgress, {
        phase: options.phase,
        status,
        message,
        command,
        workloadName: options.workloadName,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      });
    };
    emit("running");
    const heartbeat = setInterval(() => {
      emit("running", `${options.message} (${formatElapsedMs(Date.now() - startedAt)} elapsed).`);
    }, 5_000);
    heartbeat.unref?.();
    try {
      const result = await this.runAllowed(command, args, options);
      emit("complete", `ToolHive ${command} completed for ${options.workloadName ?? "workload"} in ${formatElapsedMs(Date.now() - startedAt)}.`);
      return result;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

function assertAllowedCommandShape(command: ToolHiveAllowedCommand, args: string[]): void {
  const twoPartCommands: ToolHiveAllowedCommand[] = ["group-list", "group-create", "registry-list", "registry-info", "runtime-check"];
  const commandPrefix = args.slice(0, twoPartCommands.includes(command) ? 2 : 1).join(" ");
  const allowed: Record<ToolHiveAllowedCommand, string> = {
    version: "version",
    build: "build",
    "group-list": "group list",
    "group-create": "group create",
    "registry-list": "registry list",
    "registry-info": "registry info",
    "runtime-check": "runtime check",
    "run-registry": "run",
    "run-import": "run",
    "run-remote": "run",
    list: "list",
    logs: "logs",
    stop: "stop",
    rm: "rm",
  };
  if (commandPrefix !== allowed[command]) throw new Error(`ToolHive command ${command} attempted unexpected argv: ${args.join(" ")}`);
  if (args.some((arg) => arg.includes("\0"))) throw new Error("ToolHive command arguments cannot contain NUL bytes.");
}

async function defaultExecutor(invocation: ToolHiveCommandInvocation): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(invocation.executablePath, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      encoding: "utf8",
      timeout: invocation.timeoutMs,
      maxBuffer: maxOutputBufferBytes,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const stdout = execErrorText(error, "stdout");
    const rawStderr = execErrorText(error, "stderr");
    const message = error instanceof Error ? error.message : String(error);
    return {
      stdout,
      stderr: rawStderr || message,
      exitCode: execErrorExitCode(error),
    };
  }
}

function execErrorText(error: unknown, key: "stdout" | "stderr"): string {
  const value = error && typeof error === "object" ? (error as Record<string, unknown>)[key] : undefined;
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function execErrorExitCode(error: unknown): number {
  if (!error || typeof error !== "object") return 1;
  const record = error as Record<string, unknown>;
  if (typeof record.code === "number") return record.code;
  if (typeof record.signal === "string" || record.killed === true) return 124;
  return 1;
}

export function redactToolHiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, "[REDACTED]");
}

function emitToolHiveProgress(
  onProgress: ((progress: ToolHiveOperationProgress) => void) | undefined,
  progress: ToolHiveOperationProgress,
): void {
  if (!onProgress) return;
  try {
    onProgress(progress);
  } catch {
    // Progress observers must not change ToolHive command semantics.
  }
}

function formatElapsedMs(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}
