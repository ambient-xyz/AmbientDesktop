import { execFileSync, spawn, type ChildProcessByStdio, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { basename, delimiter, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { BashOperations } from "@mariozechner/pi-coding-agent";
import type { PermissionMode } from "../../shared/permissionTypes";
import { buildSafeProcessEnv, isSecretEnvName } from "../security/safeProcessEnv";
import { isPathInside } from "../session/sessionPaths";
import { materializeTextOutput, materializedTextNotice } from "./toolOutputArtifacts";

export type ToolRunnerSubject = "pi-bash" | "terminal" | "plugin-mcp" | "workflow-hook" | "workflow-tool";
export type ToolRunnerSandboxKind = "none" | "macos-sandbox-exec" | "policy-only";

export interface ToolRunnerPolicy {
  permissionMode: PermissionMode;
  workspacePath: string;
  authorityRootPaths?: readonly string[];
  includeWorkspaceRootAuthority?: boolean;
  subject: ToolRunnerSubject;
}

export interface ToolRunnerHost {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  sandboxExecPath?: string;
  executableExists?: (path: string) => boolean;
  executableArchitecture?: (path: string) => NodeJS.Architecture | undefined;
  realpath?: (path: string) => string;
}

export interface ToolRunnerInvocation {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  sandbox: {
    kind: ToolRunnerSandboxKind;
    reason?: string;
  };
}

export interface ToolRunnerSandboxCapability {
  platform: NodeJS.Platform;
  kind: ToolRunnerSandboxKind;
  osEnforced: boolean;
  reason: string;
  nextStep?: string;
}

export interface ToolRunnerProcessInput {
  command: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  policy: ToolRunnerPolicy;
  host?: ToolRunnerHost;
}

export interface ToolRunnerShellInput {
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  policy: ToolRunnerPolicy;
  host?: ToolRunnerHost;
}

export interface ToolRunnerRunShellOptions extends ToolRunnerShellInput {
  onData: (data: Buffer) => void;
  signal?: AbortSignal;
  timeout?: number;
  timeoutPolicy?: Partial<Pick<ToolExecutionTimeoutPolicy, "descriptorClass" | "idleTimeoutMs" | "maxRunMs">>;
  maxOutputPreviewChars?: number | null;
  outputArtifactLabel?: string;
}

export type ToolExecutionDescriptorClass = "quick-probe" | "build" | "install" | "dev-server" | "browser" | "mcp";

export interface ToolExecutionTimeoutPolicy {
  descriptorClass: ToolExecutionDescriptorClass;
  idleTimeoutMs: number;
  maxRunMs: number | null;
  requestedTimeoutMs?: number;
  clampedIdleTimeoutMs?: number;
}

export interface ManagedDevServerProcess {
  id: string;
  command: string;
  cwd: string;
  pid?: number;
  startedAt: string;
  readyAt: string;
  sandboxKind: ToolRunnerSandboxKind;
  sandboxReason?: string;
}

const MACOS_SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const TOKENIZER_SPACE_MARKER = "\u0120";
const MACOS_ARM64_HOMEBREW_BIN = "/opt/homebrew/bin";
const MACOS_ARM64_HOMEBREW_SBIN = "/opt/homebrew/sbin";
const MACOS_ARM64_NODE = `${MACOS_ARM64_HOMEBREW_BIN}/node`;
const QUICK_PROBE_IDLE_TIMEOUT_MS = 30_000;
const QUICK_PROBE_MAX_RUN_MS = 120_000;
const BUILD_INSTALL_IDLE_TIMEOUT_MS = 120_000;
const BUILD_INSTALL_MAX_RUN_MS = 30 * 60_000;
const DEV_SERVER_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_SHELL_OUTPUT_PREVIEW_CHARS = 64_000;
const DEV_SERVER_RECENT_OUTPUT_CHARS = 16_000;
export { isSecretEnvName };

interface ManagedDevServerProcessRecord extends ManagedDevServerProcess {
  child: ChildProcessByStdio<null, Readable, Readable>;
}

const managedDevServers = new Map<string, ManagedDevServerProcessRecord>();

export function createToolRunnerBashOperations(getPolicy: () => ToolRunnerPolicy): BashOperations {
  return {
    exec: (command, cwd, options) => {
      assertShellCommandHasNoTokenizerArtifacts(command);
      return runShellCommand({
        command,
        cwd,
        policy: getPolicy(),
        onData: options.onData,
        signal: options.signal,
        timeout: options.timeout,
        env: options.env,
      });
    },
  };
}

export function assertShellCommandHasNoTokenizerArtifacts(command: string): void {
  if (!command.includes(TOKENIZER_SPACE_MARKER)) return;
  throw new Error(
    [
      "Ambient/Pi emitted a shell command containing literal tokenizer-space markers, so the command was not run.",
      "Retry the bash call with normal shell text and spaces, for example `which python3` rather than tokenized fragments like `which Ġpython 3`.",
    ].join(" "),
  );
}

export function buildShellInvocation(input: ToolRunnerShellInput): ToolRunnerInvocation {
  return buildProcessInvocation({
    command: shellBinary(),
    args: shellArgs(input.command),
    cwd: input.cwd,
    env: input.env,
    policy: input.policy,
    host: input.host,
  });
}

export function buildProcessInvocation(input: ToolRunnerProcessInput): ToolRunnerInvocation {
  const workspacePath = realOrResolvedPath(input.policy.workspacePath);
  const authorityRootPaths = toolRunnerAuthorityRootPaths(input.policy);
  const cwd = realOrResolvedPath(input.cwd);
  if (!authorityRootPaths.some((root) => isPathInside(root, cwd))) {
    throw new Error(`Tool runner cwd is outside the current workspace authority: ${input.cwd}`);
  }

  const env = {
    ...normalizeToolRunnerRuntimeEnv(buildToolRunnerEnv(process.env, input.env), input.policy, input.host),
    AMBIENT_TOOL_RUNNER_SUBJECT: input.policy.subject,
    AMBIENT_TOOL_RUNNER_WORKSPACE: workspacePath,
  };

  if (input.policy.permissionMode === "full-access") {
    return {
      command: input.command,
      args: input.args ?? [],
      cwd,
      env: { ...env, AMBIENT_TOOL_RUNNER_SANDBOX: "none" },
      sandbox: { kind: "none", reason: "Full access mode." },
    };
  }

  const workspaceTemp = ensureWorkspaceTemp(workspacePath);
  const workspaceEnv = {
    ...env,
    TMPDIR: workspaceTemp,
    TMP: workspaceTemp,
    TEMP: workspaceTemp,
  };
  const capability = describeWorkspaceSandboxCapability(input.host);

  const incompatibleRuntime = macosSandboxIncompatibleRuntime(input.command, input.args ?? [], capability.platform);
  if (capability.kind === "macos-sandbox-exec" && incompatibleRuntime) {
    return {
      command: input.command,
      args: input.args ?? [],
      cwd,
      env: { ...workspaceEnv, AMBIENT_TOOL_RUNNER_SANDBOX: "policy-only" },
      sandbox: {
        kind: "policy-only",
        reason: `${incompatibleRuntime} currently aborts under the first-pass macOS sandbox-exec profile; using policy-only containment until the helper sandbox is implemented.`,
      },
    };
  }

  if (capability.kind === "macos-sandbox-exec") {
    const sandboxExecPath = input.host?.sandboxExecPath ?? MACOS_SANDBOX_EXEC;
    const profile = buildMacosWorkspaceSandboxProfile(workspacePath, workspaceTemp, authorityRootPaths);
    return {
      command: sandboxExecPath,
      args: ["-p", profile, input.command, ...(input.args ?? [])],
      cwd,
      env: { ...workspaceEnv, AMBIENT_TOOL_RUNNER_SANDBOX: "macos-sandbox-exec" },
      sandbox: { kind: "macos-sandbox-exec", reason: capability.reason },
    };
  }

  return {
    command: input.command,
    args: input.args ?? [],
    cwd,
    env: { ...workspaceEnv, AMBIENT_TOOL_RUNNER_SANDBOX: "policy-only" },
    sandbox: {
      kind: "policy-only",
      reason: capability.reason,
    },
  };
}

export function describeWorkspaceSandboxCapability(host?: ToolRunnerHost): ToolRunnerSandboxCapability {
  const sandboxExecPath = host?.sandboxExecPath ?? MACOS_SANDBOX_EXEC;
  const executableExists = host?.executableExists ?? existsSync;
  const platform = host?.platform ?? process.platform;

  if (platform === "darwin" && executableExists(sandboxExecPath)) {
    return {
      platform,
      kind: "macos-sandbox-exec",
      osEnforced: true,
      reason: "Workspace-scoped macOS sandbox-exec profile.",
    };
  }

  if (platform === "darwin") {
    return {
      platform,
      kind: "policy-only",
      osEnforced: false,
      reason: "macOS workspace mode is using policy-only containment because sandbox-exec is unavailable.",
      nextStep: "Move process execution into a signed helper with App Sandbox entitlements.",
    };
  }

  if (platform === "linux") {
    return {
      platform,
      kind: "policy-only",
      osEnforced: false,
      reason: "Linux workspace mode is using policy-only containment until the namespace helper is implemented.",
      nextStep: "Add an unprivileged user/mount/network namespace helper, with bubblewrap as the likely first implementation target.",
    };
  }

  if (platform === "win32") {
    return {
      platform,
      kind: "policy-only",
      osEnforced: false,
      reason: "Windows workspace mode is using policy-only containment until the restricted-token/job-object helper is implemented.",
      nextStep: "Add a restricted-token runner with a job object and explicit filesystem ACL boundary.",
    };
  }

  return {
    platform,
    kind: "policy-only",
    osEnforced: false,
    reason: `${platform} workspace mode is using policy-only containment because no OS sandbox helper is available.`,
  };
}

export function buildToolRunnerEnv(baseEnv: NodeJS.ProcessEnv = process.env, explicitEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return buildSafeProcessEnv(baseEnv, explicitEnv);
}

export function normalizeToolRunnerRuntimeEnv(env: NodeJS.ProcessEnv, policy: ToolRunnerPolicy, host?: ToolRunnerHost): NodeJS.ProcessEnv {
  if (!shouldPreferNativeMacRuntime(policy.subject, host)) return { ...env };

  const nativeNode = nativeMacArm64Node(host);
  if (!nativeNode) return { ...env };

  const result = { ...env };
  result.PATH = prependPathEntries(result.PATH, [MACOS_ARM64_HOMEBREW_BIN, MACOS_ARM64_HOMEBREW_SBIN]);
  result.npm_node_execpath = nativeNode;
  result.NODE = nativeNode;
  result.AMBIENT_TOOL_RUNNER_NATIVE_NODE = nativeNode;
  result.AMBIENT_TOOL_RUNNER_RUNTIME_FIXUP = "darwin-arm64-native-node";
  return result;
}

export function spawnToolProcess(input: ToolRunnerProcessInput): {
  child: ChildProcessWithoutNullStreams;
  invocation: ToolRunnerInvocation;
} {
  const invocation = buildProcessInvocation(input);
  const child = spawn(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: invocation.env,
    shell: false,
    stdio: "pipe",
    windowsHide: true,
  });
  return { child, invocation };
}

export function runShellCommand(options: ToolRunnerRunShellOptions): Promise<{ exitCode: number | null }> {
  const invocation = buildShellInvocation(options);
  const timeoutPolicy = resolveToolExecutionTimeoutPolicy({
    command: options.command,
    subject: options.policy.subject,
    requestedTimeoutSeconds: options.timeout,
    override: options.timeoutPolicy,
  });
  const stdoutMaterializer = createShellOutputMaterializer(options, "stdout");
  const stderrMaterializer = createShellOutputMaterializer(options, "stderr");
  let outputBytes = 0;
  const onStdout = (data: Buffer) => {
    outputBytes += data.byteLength;
    stdoutMaterializer.record(data);
  };
  const onStderr = (data: Buffer) => {
    outputBytes += data.byteLength;
    stderrMaterializer.record(data);
  };
  if (timeoutPolicy.clampedIdleTimeoutMs !== undefined) {
    options.onData(
      Buffer.from(
        `Ambient tool runner timeout: requested timeout ${timeoutPolicy.requestedTimeoutMs}ms was clamped to ${timeoutPolicy.idleTimeoutMs}ms idle timeout for ${timeoutPolicy.descriptorClass} commands.\n\n`,
      ),
    );
  }
  if (timeoutPolicy.descriptorClass === "dev-server") {
    return runDevServerShellCommand(options, invocation, timeoutPolicy, stdoutMaterializer, stderrMaterializer);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
    });
    let timeoutReason: "idle" | "max-run" | undefined;
    let idleTimeoutHandle: NodeJS.Timeout | undefined;
    let maxRunTimeoutHandle: NodeJS.Timeout | undefined;
    let lastOutputAt = Date.now();
    const clearTimeoutHandles = () => {
      if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
      if (maxRunTimeoutHandle) clearTimeout(maxRunTimeoutHandle);
      idleTimeoutHandle = undefined;
      maxRunTimeoutHandle = undefined;
    };
    const timeoutAndKill = (reason: "idle" | "max-run") => {
      if (timeoutReason) return;
      timeoutReason = reason;
      killToolProcessTree(child.pid);
    };
    const resetIdleTimeout = () => {
      if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
      idleTimeoutHandle = setTimeout(() => timeoutAndKill("idle"), timeoutPolicy.idleTimeoutMs);
    };
    resetIdleTimeout();
    if (timeoutPolicy.maxRunMs !== null) {
      maxRunTimeoutHandle = setTimeout(() => timeoutAndKill("max-run"), timeoutPolicy.maxRunMs);
    }

    const onAbort = () => killToolProcessTree(child.pid);
    const onStdoutProgress = (data: Buffer) => {
      lastOutputAt = Date.now();
      resetIdleTimeout();
      onStdout(data);
    };
    const onStderrProgress = (data: Buffer) => {
      lastOutputAt = Date.now();
      resetIdleTimeout();
      onStderr(data);
    };
    child.stdout.on("data", onStdoutProgress);
    child.stderr.on("data", onStderrProgress);
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }
    waitForToolProcess(child)
      .then(async (exitCode) => {
        clearTimeoutHandles();
        options.signal?.removeEventListener("abort", onAbort);
        if (options.signal?.aborted) {
          reject(new Error("aborted"));
          return;
        }
        if (timeoutReason) {
          const idleElapsedMs = Math.max(0, Date.now() - lastOutputAt);
          await finishShellOutputMaterializers(stdoutMaterializer, stderrMaterializer);
          emitToolRunnerTimeoutDiagnostic(timeoutReason, timeoutPolicy, outputBytes, idleElapsedMs, options.onData);
          reject(new Error(toolRunnerTimeoutErrorMessage(timeoutReason, timeoutPolicy)));
          return;
        }
        await finishShellOutputMaterializers(stdoutMaterializer, stderrMaterializer);
        resolve({ exitCode });
      })
      .catch((error) => {
        clearTimeoutHandles();
        options.signal?.removeEventListener("abort", onAbort);
        reject(error);
      });
  });
}

export function listManagedDevServers(): ManagedDevServerProcess[] {
  return [...managedDevServers.values()].map(({ child: _child, ...server }) => ({ ...server }));
}

export function stopManagedDevServer(id: string): boolean {
  const server = managedDevServers.get(id);
  if (!server) return false;
  managedDevServers.delete(id);
  killToolProcessTree(server.child.pid);
  return true;
}

export function stopAllManagedDevServers(): number {
  const ids = [...managedDevServers.keys()];
  for (const id of ids) stopManagedDevServer(id);
  return ids.length;
}

export function resolveToolExecutionTimeoutPolicy(input: {
  command: string;
  subject: ToolRunnerSubject;
  requestedTimeoutSeconds?: number;
  override?: Partial<Pick<ToolExecutionTimeoutPolicy, "descriptorClass" | "idleTimeoutMs" | "maxRunMs">>;
}): ToolExecutionTimeoutPolicy {
  const descriptorClass = input.override?.descriptorClass ?? classifyShellCommandDescriptor(input.command, input.subject);
  const defaults = defaultTimeoutsForDescriptorClass(descriptorClass);
  const requestedTimeoutMs =
    input.requestedTimeoutSeconds !== undefined && input.requestedTimeoutSeconds > 0
      ? Math.max(1, Math.floor(input.requestedTimeoutSeconds * 1000))
      : undefined;
  const hasExplicitIdleOverride = Boolean(input.override && Object.hasOwn(input.override, "idleTimeoutMs"));
  const requestedOrDefaultIdle = hasExplicitIdleOverride ? input.override!.idleTimeoutMs! : (requestedTimeoutMs ?? defaults.idleTimeoutMs);
  const idleTimeoutMs = Math.max(1, Math.floor(hasExplicitIdleOverride ? requestedOrDefaultIdle : Math.max(requestedOrDefaultIdle, defaults.idleTimeoutMs)));
  const maxRunMs = input.override && Object.hasOwn(input.override, "maxRunMs")
    ? input.override.maxRunMs === null || input.override.maxRunMs === undefined
      ? null
      : Math.max(1, Math.floor(input.override.maxRunMs))
    : defaults.maxRunMs;
  return {
    descriptorClass,
    idleTimeoutMs,
    maxRunMs,
    ...(requestedTimeoutMs !== undefined ? { requestedTimeoutMs } : {}),
    ...(requestedTimeoutMs !== undefined && requestedTimeoutMs < idleTimeoutMs ? { clampedIdleTimeoutMs: idleTimeoutMs } : {}),
  };
}

function classifyShellCommandDescriptor(command: string, subject: ToolRunnerSubject): ToolExecutionDescriptorClass {
  const normalized = command.trim().toLowerCase();
  if (subject === "plugin-mcp") return "mcp";
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|build|rebuild|test|run\s+build)\b/.test(normalized)) return "build";
  if (/\b(?:pip|uv|poetry|cargo|go|docker|podman|toolhive|thv)\s+(?:install|build|pull|run|compose|up)\b/.test(normalized)) return "install";
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start)\b|\b(?:vite|next|webpack-dev-server)\b/.test(normalized)) return "dev-server";
  return "quick-probe";
}

function defaultTimeoutsForDescriptorClass(descriptorClass: ToolExecutionDescriptorClass): Pick<ToolExecutionTimeoutPolicy, "idleTimeoutMs" | "maxRunMs"> {
  if (descriptorClass === "build" || descriptorClass === "install") {
    return { idleTimeoutMs: BUILD_INSTALL_IDLE_TIMEOUT_MS, maxRunMs: BUILD_INSTALL_MAX_RUN_MS };
  }
  if (descriptorClass === "dev-server") return { idleTimeoutMs: DEV_SERVER_IDLE_TIMEOUT_MS, maxRunMs: null };
  if (descriptorClass === "browser") return { idleTimeoutMs: 45_000, maxRunMs: 300_000 };
  if (descriptorClass === "mcp") return { idleTimeoutMs: 60_000, maxRunMs: null };
  return { idleTimeoutMs: QUICK_PROBE_IDLE_TIMEOUT_MS, maxRunMs: QUICK_PROBE_MAX_RUN_MS };
}

function shouldPreferNativeMacRuntime(subject: ToolRunnerSubject, host?: ToolRunnerHost): boolean {
  const platform = host?.platform ?? process.platform;
  const arch = host?.arch ?? process.arch;
  if (platform !== "darwin" || arch !== "arm64") return false;
  return subject === "pi-bash" || subject === "workflow-hook" || subject === "workflow-tool";
}

function nativeMacArm64Node(host?: ToolRunnerHost): string | undefined {
  const executableExists = host?.executableExists ?? existsSync;
  if (!executableExists(MACOS_ARM64_NODE)) return undefined;
  const architecture = host?.executableArchitecture?.(MACOS_ARM64_NODE) ?? executableArchitecture(MACOS_ARM64_NODE);
  if (architecture !== "arm64") return undefined;
  return realOrResolvedHostPath(MACOS_ARM64_NODE, host);
}

function prependPathEntries(pathValue: string | undefined, entries: string[]): string {
  const existing = (pathValue ?? "").split(delimiter).filter(Boolean);
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of [...entries, ...existing]) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    normalized.push(entry);
  }
  return normalized.join(delimiter);
}

const executableArchitectureCache = new Map<string, NodeJS.Architecture | undefined>();

function executableArchitecture(path: string): NodeJS.Architecture | undefined {
  const resolvedPath = realOrResolvedPath(path);
  if (executableArchitectureCache.has(resolvedPath)) return executableArchitectureCache.get(resolvedPath);
  let architecture: NodeJS.Architecture | undefined;
  try {
    const output = execFileSync("/usr/bin/file", [resolvedPath], {
      encoding: "utf8",
      timeout: 1_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    architecture = executableArchitectureFromFileOutput(output);
  } catch {
    architecture = undefined;
  }
  executableArchitectureCache.set(resolvedPath, architecture);
  return architecture;
}

export function executableArchitectureFromFileOutput(output: string): NodeJS.Architecture | undefined {
  if (/\barm64\b/.test(output)) return "arm64";
  if (/\bx86_64\b/.test(output)) return "x64";
  return undefined;
}

function toolRunnerTimeoutErrorMessage(reason: "idle" | "max-run", policy: ToolExecutionTimeoutPolicy): string {
  return reason === "idle" ? `timeout:idle:${policy.idleTimeoutMs}` : `timeout:max-run:${policy.maxRunMs ?? "none"}`;
}

function emitToolRunnerTimeoutDiagnostic(
  reason: "idle" | "max-run",
  policy: ToolExecutionTimeoutPolicy,
  outputBytes: number,
  idleElapsedMs: number,
  onData: (data: Buffer) => void,
): void {
  const timeoutLabel =
    reason === "idle"
      ? `${policy.idleTimeoutMs}ms without stdout/stderr activity`
      : `${policy.maxRunMs}ms hard cap`;
  const prefix = outputBytes > 0 ? "\n\n" : "";
  onData(
    Buffer.from(
      `${prefix}Ambient tool runner timeout: killed the process tree after ${timeoutLabel}; ${outputBytes} stdout/stderr byte${outputBytes === 1 ? "" : "s"} received before timeout; descriptorClass=${policy.descriptorClass}; idleElapsedMs=${idleElapsedMs}. If this was a dev server, install, build, or first page-load probe, inspect the server logs/runtime architecture and retry with a longer timeout only if the process is still making progress.`,
    ),
  );
}

function createShellOutputMaterializer(options: ToolRunnerRunShellOptions, streamName: "stdout" | "stderr"): {
  record(data: Buffer): void;
  finish(): Promise<void>;
} {
  const maxPreviewChars = options.maxOutputPreviewChars === null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(options.maxOutputPreviewChars ?? DEFAULT_SHELL_OUTPUT_PREVIEW_CHARS));
  if (!Number.isFinite(maxPreviewChars)) {
    return {
      record: options.onData,
      finish: async () => undefined,
    };
  }

  const chunks: string[] = [];
  const decoder = new StringDecoder("utf8");
  let streamedPreviewChars = 0;
  let totalChars = 0;
  let truncated = false;

  const recordText = (text: string) => {
    if (!text) return;
    chunks.push(text);
    totalChars += text.length;
    if (streamedPreviewChars >= maxPreviewChars) {
      truncated = true;
      return;
    }
    const remaining = maxPreviewChars - streamedPreviewChars;
    const preview = text.slice(0, remaining);
    streamedPreviewChars += preview.length;
    if (preview) options.onData(Buffer.from(preview));
    if (preview.length < text.length) truncated = true;
  };

  return {
    record(data: Buffer) {
      recordText(decoder.write(data));
    },
    async finish() {
      recordText(decoder.end());
      if (!truncated && totalChars <= maxPreviewChars) return;
      const output = await materializeTextOutput(options.policy.workspacePath, {
        label: options.outputArtifactLabel ? `${options.outputArtifactLabel}-${streamName}` : `shell-${options.policy.subject}-${streamName}`,
        text: chunks.join(""),
        maxPreviewChars,
      });
      const notice = materializedTextNotice(`shell command ${streamName}`, output);
      if (notice) options.onData(Buffer.from(`${streamedPreviewChars > 0 ? "\n\n" : ""}${notice}\n`));
    },
  };
}

async function finishShellOutputMaterializers(
  stdoutMaterializer: ReturnType<typeof createShellOutputMaterializer>,
  stderrMaterializer: ReturnType<typeof createShellOutputMaterializer>,
): Promise<void> {
  await stdoutMaterializer.finish();
  await stderrMaterializer.finish();
}

function runDevServerShellCommand(
  options: ToolRunnerRunShellOptions,
  invocation: ToolRunnerInvocation,
  timeoutPolicy: ToolExecutionTimeoutPolicy,
  stdoutMaterializer: ReturnType<typeof createShellOutputMaterializer>,
  stderrMaterializer: ReturnType<typeof createShellOutputMaterializer>,
): Promise<{ exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
    });
    let outputBytes = 0;
    let lastOutputAt = Date.now();
    let recentOutput = "";
    let settled = false;
    let idleTimeoutHandle: NodeJS.Timeout | undefined;

    const clearIdleTimeout = () => {
      if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
      idleTimeoutHandle = undefined;
    };
    const finish = async (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearIdleTimeout();
      options.signal?.removeEventListener("abort", onAbort);
      await finishShellOutputMaterializers(stdoutMaterializer, stderrMaterializer);
      callback();
    };
    const failIdle = () => {
      const idleElapsedMs = Math.max(0, Date.now() - lastOutputAt);
      killToolProcessTree(child.pid);
      void finish(() => {
        emitToolRunnerTimeoutDiagnostic("idle", timeoutPolicy, outputBytes, idleElapsedMs, options.onData);
        reject(new Error(toolRunnerTimeoutErrorMessage("idle", timeoutPolicy)));
      });
    };
    const resetIdleTimeout = () => {
      clearIdleTimeout();
      idleTimeoutHandle = setTimeout(failIdle, timeoutPolicy.idleTimeoutMs);
    };
    const markReady = () => {
      const id = randomUUID();
      const server: ManagedDevServerProcessRecord = {
        id,
        command: options.command,
        cwd: invocation.cwd,
        ...(child.pid ? { pid: child.pid } : {}),
        startedAt: new Date().toISOString(),
        readyAt: new Date().toISOString(),
        sandboxKind: invocation.sandbox.kind,
        ...(invocation.sandbox.reason ? { sandboxReason: invocation.sandbox.reason } : {}),
        child,
      };
      managedDevServers.set(id, server);
      child.once("exit", () => {
        managedDevServers.delete(id);
      });
      void finish(() => {
        options.onData(
          Buffer.from(
            [
              "",
              `Ambient tool runner dev-server: readiness detected; command is continuing as managed background process ${id}${child.pid ? ` (pid ${child.pid})` : ""}.`,
              "Ambient will not wait for this command to exit. Stop the process when the dev-server task is finished.",
              "",
            ].join("\n"),
          ),
        );
        resolve({ exitCode: null });
      });
    };
    const onAbort = () => {
      killToolProcessTree(child.pid);
    };
    const onProgress = (data: Buffer) => {
      if (settled) return;
      lastOutputAt = Date.now();
      resetIdleTimeout();
      outputBytes += data.byteLength;
      stdoutMaterializer.record(data);
      recentOutput = `${recentOutput}${data.toString("utf8")}`.slice(-DEV_SERVER_RECENT_OUTPUT_CHARS);
      if (isDevServerReadyOutput(recentOutput)) markReady();
    };
    const onStderrProgress = (data: Buffer) => {
      if (settled) return;
      lastOutputAt = Date.now();
      resetIdleTimeout();
      outputBytes += data.byteLength;
      stderrMaterializer.record(data);
      recentOutput = `${recentOutput}${data.toString("utf8")}`.slice(-DEV_SERVER_RECENT_OUTPUT_CHARS);
      if (isDevServerReadyOutput(recentOutput)) markReady();
    };

    resetIdleTimeout();
    child.stdout.on("data", onProgress);
    child.stderr.on("data", onStderrProgress);
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }
    child.once("error", (error) => {
      void finish(() => reject(error));
    });
    child.once("exit", (exitCode) => {
      void finish(() => resolve({ exitCode }));
    });
  });
}

function isDevServerReadyOutput(output: string): boolean {
  return /(?:Local:\s*)?https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?|0\.0\.0\.0):\d+/i.test(output) ||
    /\b(?:ready in|compiled successfully|server (?:started|ready)|started server|listening (?:on|at)|running (?:at|on)|accepting connections)\b/i.test(output);
}

function waitForToolProcess(child: ChildProcessByStdio<null, Readable, Readable>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exited = child.exitCode !== null || child.signalCode !== null;
    let exitCode: number | null = child.exitCode;
    let postExitTimer: NodeJS.Timeout | undefined;
    let stdoutEnded = child.stdout.readableEnded || child.stdout.destroyed;
    let stderrEnded = child.stderr.readableEnded || child.stderr.destroyed;

    const cleanup = () => {
      if (postExitTimer) clearTimeout(postExitTimer);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.removeListener("close", onClose);
      child.stdout.removeListener("end", onStdoutEnd);
      child.stderr.removeListener("end", onStderrEnd);
    };

    const finalize = (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      child.stdout.destroy();
      child.stderr.destroy();
      resolve(code);
    };

    const maybeFinalizeAfterExit = () => {
      if (!exited || settled) return;
      if (stdoutEnded && stderrEnded) finalize(exitCode);
    };

    const onStdoutEnd = () => {
      stdoutEnded = true;
      maybeFinalizeAfterExit();
    };
    const onStderrEnd = () => {
      stderrEnded = true;
      maybeFinalizeAfterExit();
    };
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null) => {
      exited = true;
      exitCode = code;
      maybeFinalizeAfterExit();
      if (!settled) {
        postExitTimer = setTimeout(() => finalize(code), 100);
      }
    };
    const onClose = (code: number | null) => finalize(code);

    child.stdout.once("end", onStdoutEnd);
    child.stderr.once("end", onStderrEnd);
    child.once("error", onError);
    child.once("exit", onExit);
    child.once("close", onClose);

    maybeFinalizeAfterExit();
    if (exited && !settled) {
      postExitTimer = setTimeout(() => finalize(exitCode), 100);
    }
  });
}

function killToolProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", detached: true });
    } catch {
      // Ignore cleanup races.
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}

export function buildMacosWorkspaceSandboxProfile(
  workspacePath: string,
  tempPath = join(workspacePath, ".ambient-codex", "tmp"),
  authorityRootPaths: readonly string[] = [workspacePath],
): string {
  const roots = [...new Set([workspacePath, ...authorityRootPaths].map((root) => realOrResolvedPath(root)))];
  const readOnlyRoots = [
    "/bin",
    "/sbin",
    "/usr",
    "/System",
    "/Library",
    "/Applications",
    "/opt/homebrew",
    "/usr/local",
    "/dev",
    "/private/etc",
  ];
  const lines = [
    "(version 1)",
    "(deny default)",
    "(allow process*)",
    "(allow signal (target self))",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "(allow file-read-metadata)",
    ...readOnlyRoots.map((path) => `(allow file-read* (subpath ${sandboxString(path)}))`),
    ...roots.map((root) => `(allow file-read* (subpath ${sandboxString(root)}))`),
    ...roots.map((root) => `(allow file-write* (subpath ${sandboxString(root)}))`),
    `(allow file-read* (subpath ${sandboxString(tempPath)}))`,
    `(allow file-write* (subpath ${sandboxString(tempPath)}))`,
    "(deny network*)",
  ];
  return lines.join("\n");
}

export function buildTerminalShellInvocation(policy: ToolRunnerPolicy, shell: string, cwd: string, env?: NodeJS.ProcessEnv): ToolRunnerInvocation {
  return buildProcessInvocation({
    command: shell,
    args: [],
    cwd,
    env,
    policy,
  });
}

function shellBinary(): string {
  if (process.platform === "win32") return process.env.ComSpec ?? "cmd.exe";
  return "/bin/sh";
}

function shellArgs(command: string): string[] {
  if (process.platform === "win32") return ["/d", "/s", "/c", command];
  return ["-c", command];
}

function macosSandboxIncompatibleRuntime(command: string, args: string[], platform = process.platform): string | undefined {
  const executable = basename(command).toLowerCase();
  if (nodeLikeRuntimes.has(executable)) return executable;
  if (executable === "sh" || executable === "bash" || executable === "zsh") {
    // The first-pass sandbox-exec profile currently aborts macOS shell launches
    // before the child command can produce stdout, which causes agents to loop.
    // Keep shell-based execution policy-only until it moves into a helper sandbox.
    if (platform === "darwin") return "shell command execution";
    const commandIndex = args.findIndex((arg) => arg === "-c");
    const commandText = commandIndex >= 0 ? (args[commandIndex + 1] ?? "") : "";
    const match = commandText.match(/(?:^|[\s;&|()])((?:node|npm|pnpm|npx|bun|deno))(?:$|[\s;&|()])/i);
    return match?.[1]?.toLowerCase();
  }
  return undefined;
}

function realOrResolvedPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function toolRunnerAuthorityRootPaths(policy: ToolRunnerPolicy): string[] {
  return [
    ...new Set([
      ...(policy.includeWorkspaceRootAuthority === false ? [] : [policy.workspacePath]),
      ...(policy.authorityRootPaths ?? []),
    ].map((root) => realOrResolvedPath(root))),
  ];
}

function realOrResolvedHostPath(path: string, host?: ToolRunnerHost): string {
  if (host?.realpath) {
    try {
      return host.realpath(path);
    } catch {
      return resolve(path);
    }
  }
  return realOrResolvedPath(path);
}

function ensureWorkspaceTemp(workspacePath: string): string {
  const tempPath = join(workspacePath, ".ambient-codex", "tmp");
  mkdirSync(tempPath, { recursive: true });
  return realOrResolvedPath(tempPath);
}

function sandboxString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

const nodeLikeRuntimes = new Set(["node", "npm", "pnpm", "npx", "bun", "deno"]);
