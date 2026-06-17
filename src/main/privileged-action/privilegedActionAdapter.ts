import type {
  PrivilegedActionAdapterExecutionPlan,
  PrivilegedActionAdapterName,
  PrivilegedActionAdapterResultStatus,
  PrivilegedActionAdapterStatus,
  PrivilegedActionCredentialCaptureStatus,
  PrivilegedActionNativeRequest,
  PrivilegedActionNativeResult,
  PrivilegedActionPlatform,
} from "../../shared/types";
import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { credentialPlaceholder, dryRunPrivilegedActionNativeRequest, privilegedActionAdapterStatus, privilegedActionContinuation, redactPrivilegedOutputPreview, successfulPrivilegedActionNativeRequest } from "./privilegedAction";

export interface PrivilegedActionAdapter {
  readonly name: PrivilegedActionAdapterName;
  status(): PrivilegedActionAdapterStatus;
  execute(input: PrivilegedActionAdapterExecuteInput): Promise<PrivilegedActionNativeResult>;
}

export interface PrivilegedActionAdapterExecuteInput {
  request: PrivilegedActionNativeRequest;
  credential?: string;
  credentialCapture?: PrivilegedActionCredentialCaptureStatus;
}

export interface PrivilegedActionAdapterFactoryInput {
  adapter?: PrivilegedActionAdapterName;
  credentialRehearsalAvailable?: boolean;
  platform?: NodeJS.Platform | PrivilegedActionPlatform;
}

export interface PrivilegedActionCommandRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type PrivilegedActionCommandRunner = (input: {
  executable: string;
  args: string[];
  cwd?: string;
  credential?: string;
  timeoutMs: number;
}) => Promise<PrivilegedActionCommandRunResult>;

const privilegedCommandTimeoutMs = 120_000;

export function createPrivilegedActionAdapter(input: PrivilegedActionAdapterFactoryInput = {}): PrivilegedActionAdapter {
  const platform = normalizeAdapterPlatform(input.platform ?? process.platform);
  if (input.adapter === "dry-run") {
    return new DryRunPrivilegedActionAdapter({
      credentialRehearsalAvailable: input.credentialRehearsalAvailable,
      platform,
    });
  }
  if (input.adapter === "macos-authorized-helper" && platform === "darwin") {
    return new MacosAuthorizedHelperAdapter({ credentialRehearsalAvailable: input.credentialRehearsalAvailable });
  }
  if (input.adapter === "linux-polkit-helper" && platform === "linux") {
    return new LinuxPolkitHelperAdapter({ credentialRehearsalAvailable: input.credentialRehearsalAvailable });
  }
  if (input.adapter === "windows-elevated-helper" && platform === "win32") {
    return new WindowsElevatedHelperAdapter({ credentialRehearsalAvailable: input.credentialRehearsalAvailable });
  }
  if (!input.adapter && platform === "darwin") return new MacosAuthorizedHelperAdapter({ credentialRehearsalAvailable: input.credentialRehearsalAvailable });
  if (!input.adapter && platform === "linux") return new LinuxPolkitHelperAdapter({ credentialRehearsalAvailable: input.credentialRehearsalAvailable });
  if (!input.adapter && platform === "win32") return new WindowsElevatedHelperAdapter({ credentialRehearsalAvailable: input.credentialRehearsalAvailable });
  return new DryRunPrivilegedActionAdapter({
    credentialRehearsalAvailable: input.credentialRehearsalAvailable,
    platform,
  });
}

export function privilegedActionAdapterSelectionFromEnv(env: { AMBIENT_PRIVILEGED_ACTION_ADAPTER?: string } = process.env): PrivilegedActionAdapterName | undefined {
  const value = env.AMBIENT_PRIVILEGED_ACTION_ADAPTER;
  if (value === "macos-authorized-helper") return value;
  if (value === "linux-polkit-helper") return value;
  if (value === "windows-elevated-helper") return value;
  if (value === "dry-run") return value;
  return undefined;
}

export class DryRunPrivilegedActionAdapter implements PrivilegedActionAdapter {
  readonly name = "dry-run";

  constructor(private readonly options: { credentialRehearsalAvailable?: boolean; platform?: NodeJS.Platform | PrivilegedActionPlatform } = {}) {}

  status(): PrivilegedActionAdapterStatus {
    return privilegedActionAdapterStatus({ credentialRehearsalAvailable: this.options.credentialRehearsalAvailable, selectedAdapter: this.name });
  }

  async execute(input: PrivilegedActionAdapterExecuteInput): Promise<PrivilegedActionNativeResult> {
    validatePrivilegedActionNativeRequestForAdapter(input.request);
    return dryRunPrivilegedActionNativeRequest(input.request, {
      credentialCapture: input.credentialCapture,
      executionPlan: planPrivilegedActionAdapterExecution(input.request, { platform: this.options.platform }),
    });
  }
}

export class MacosAuthorizedHelperAdapter implements PrivilegedActionAdapter {
  readonly name = "macos-authorized-helper";

  constructor(private readonly options: { commandRunner?: PrivilegedActionCommandRunner; credentialRehearsalAvailable?: boolean } = {}) {}

  status(): PrivilegedActionAdapterStatus {
    return privilegedActionAdapterStatus({
      adapterStatus: "available",
      credentialCapture: this.options.credentialRehearsalAvailable ? "available" : "not-implemented",
      execution: "executed",
      selectedAdapter: this.name,
      selectedAdapterExecutesPrivilegedCommands: true,
    });
  }

  async execute(input: PrivilegedActionAdapterExecuteInput): Promise<PrivilegedActionNativeResult> {
    validatePrivilegedActionNativeRequestForAdapter(input.request);
    const executionPlan = planMacosPrivilegedAction(input.request);
    return executePrivilegedCommands(input, executionPlan, this.name, this.options.commandRunner);
  }
}

export { MacosAuthorizedHelperAdapter as MacosAuthorizedHelperUnavailableAdapter };

export class LinuxPolkitHelperAdapter implements PrivilegedActionAdapter {
  readonly name = "linux-polkit-helper";

  constructor(private readonly options: { commandRunner?: PrivilegedActionCommandRunner; credentialRehearsalAvailable?: boolean } = {}) {}

  status(): PrivilegedActionAdapterStatus {
    return privilegedActionAdapterStatus({
      adapterStatus: "available",
      credentialCapture: this.options.credentialRehearsalAvailable ? "available" : "not-implemented",
      execution: "executed",
      selectedAdapter: this.name,
      selectedAdapterExecutesPrivilegedCommands: true,
    });
  }

  async execute(input: PrivilegedActionAdapterExecuteInput): Promise<PrivilegedActionNativeResult> {
    validatePrivilegedActionNativeRequestForAdapter(input.request);
    const executionPlan = planLinuxPrivilegedAction(input.request);
    return executePrivilegedCommands(input, executionPlan, this.name, this.options.commandRunner);
  }
}

export { LinuxPolkitHelperAdapter as LinuxPolkitHelperUnavailableAdapter };

export class WindowsElevatedHelperAdapter implements PrivilegedActionAdapter {
  readonly name = "windows-elevated-helper";

  constructor(private readonly options: { commandRunner?: PrivilegedActionCommandRunner; credentialRehearsalAvailable?: boolean } = {}) {}

  status(): PrivilegedActionAdapterStatus {
    return privilegedActionAdapterStatus({
      adapterStatus: "available",
      credentialCapture: "not-implemented",
      execution: "executed",
      selectedAdapter: this.name,
      selectedAdapterExecutesPrivilegedCommands: true,
    });
  }

  async execute(input: PrivilegedActionAdapterExecuteInput): Promise<PrivilegedActionNativeResult> {
    validatePrivilegedActionNativeRequestForAdapter(input.request);
    const executionPlan = planWindowsPrivilegedAction(input.request);
    return executePrivilegedCommands(input, executionPlan, this.name, this.options.commandRunner ?? runWindowsElevatedCommand);
  }
}

export { WindowsElevatedHelperAdapter as WindowsElevatedHelperUnavailableAdapter };

export function planPrivilegedActionAdapterExecution(
  request: PrivilegedActionNativeRequest,
  options: { platform?: NodeJS.Platform | PrivilegedActionPlatform } = {},
): PrivilegedActionAdapterExecutionPlan {
  validatePrivilegedActionNativeRequestForAdapter(request);
  const platform = normalizeAdapterPlatform(options.platform ?? process.platform);
  if (platform === "darwin") return planMacosPrivilegedAction(request);
  if (platform === "linux") return planLinuxPrivilegedAction(request);
  if (platform === "win32") return planWindowsPrivilegedAction(request);
  return unsupportedAdapterPlan(request, platform, `No ${platform} privileged adapter is implemented yet.`);
}

async function executePrivilegedCommands(
  input: PrivilegedActionAdapterExecuteInput,
  executionPlan: PrivilegedActionAdapterExecutionPlan,
  adapter: Exclude<PrivilegedActionAdapterName, "dry-run">,
  commandRunner: PrivilegedActionCommandRunner = runSudoPrivilegedCommand,
): Promise<PrivilegedActionNativeResult> {
  if (!executionPlan.allowedByPolicy) {
    return nativeAdapterBoundaryResult(input.request, {
      status: "blocked",
      adapter,
      message: `${adapter} policy rejected this privileged action: ${executionPlan.policyReason}`,
      credentialCapture: input.credentialCapture ?? "not-requested",
      executionPlan,
    });
  }
  const commandPlans = executionPlan.commands ?? (executionPlan.executable && executionPlan.args ? [{ executable: executionPlan.executable, args: executionPlan.args, cwd: executionPlan.cwd }] : []);
  if (!commandPlans.length) {
    return nativeAdapterBoundaryResult(input.request, {
      status: "blocked",
      adapter,
      message: `${adapter} policy did not produce executable command plans.`,
      credentialCapture: input.credentialCapture ?? "not-requested",
      executionPlan: { ...executionPlan, allowedByPolicy: false, policyReason: `${executionPlan.policyReason}; executable plan missing.` },
    });
  }
  if (executionPlan.requiresCredential && (!input.credential || input.credentialCapture !== "captured-and-discarded")) {
    return nativeAdapterBoundaryResult(input.request, {
      status: "failed",
      adapter,
      message: `${adapter} requires an ephemeral credential captured by Ambient before execution.`,
      credentialCapture: input.credentialCapture ?? "unavailable",
      executionPlan,
    });
  }
  try {
    let stdout = "";
    let stderr = "";
    for (const [index, command] of commandPlans.entries()) {
      const output = await commandRunner({
        executable: command.executable,
        args: command.args,
        cwd: command.cwd,
        credential: input.credential,
        timeoutMs: privilegedCommandTimeoutMs,
      });
      stdout = appendBoundedOutput(stdout, output.stdout);
      stderr = appendBoundedOutput(stderr, output.stderr);
      if (output.exitCode !== 0) {
        return nativeAdapterBoundaryResult(input.request, {
          status: "failed",
          adapter,
          message: `${adapter} command ${index + 1} failed with exit code ${output.exitCode ?? "unknown"}.`,
          credentialCapture: executionPlan.requiresCredential ? "captured-and-discarded" : input.credentialCapture ?? "not-requested",
          executionPlan: {
            ...executionPlan,
            executionMode: "executed",
            executesPrivilegedCommands: true,
            warnings: [...executionPlan.warnings, `Command ${index + 1} failed with exit code ${output.exitCode ?? "unknown"}.`],
          },
          stdoutPreview: stdout,
          stderrPreview: stderr,
        });
      }
    }
      return successfulPrivilegedActionNativeRequest(input.request, {
        adapter,
        credentialCapture: executionPlan.requiresCredential ? "captured-and-discarded" : input.credentialCapture ?? "not-requested",
        executionPlan,
        message: `${adapter} completed the approved privileged action successfully.`,
        stdoutPreview: stdout,
        stderrPreview: stderr,
      });
  } catch (error) {
    return nativeAdapterBoundaryResult(input.request, {
      status: "failed",
      adapter,
      message: `${adapter} command failed: ${error instanceof Error ? error.message : String(error)}`,
      credentialCapture: executionPlan.requiresCredential ? "captured-and-discarded" : input.credentialCapture ?? "not-requested",
      executionPlan: {
        ...executionPlan,
        executionMode: "executed",
        executesPrivilegedCommands: true,
        warnings: [...executionPlan.warnings, "Command execution threw before completion."],
      },
    });
  }
}

function nativeAdapterBoundaryResult(
  request: PrivilegedActionNativeRequest,
  input: {
    status: Exclude<PrivilegedActionAdapterResultStatus, "succeeded" | "not-executed">;
    adapter: Exclude<PrivilegedActionAdapterName, "dry-run">;
    message: string;
    credentialCapture: PrivilegedActionCredentialCaptureStatus;
    executionPlan: PrivilegedActionAdapterExecutionPlan;
    stdoutPreview?: string;
    stderrPreview?: string;
  },
): PrivilegedActionNativeResult {
  return {
    schemaVersion: request.schemaVersion,
    requestId: request.requestId,
    status: input.status,
    adapter: input.adapter,
    message: input.message,
    commandCount: request.template.commands.length,
    redactedCommands: request.uiPrompt.redactedCommands,
    credentialPolicy: request.credentialPolicy,
    adapterReadiness: request.adapterReadiness,
    credentialCapture: input.credentialCapture,
    executionPlan: input.executionPlan,
    continuation: privilegedActionContinuation(request, input.status, input.executionPlan),
    ...(input.stdoutPreview ? { stdoutPreview: redactPrivilegedOutputPreview(input.stdoutPreview) } : {}),
    ...(input.stderrPreview ? { stderrPreview: redactPrivilegedOutputPreview(input.stderrPreview) } : {}),
  };
}

export function planMacosPrivilegedAction(request: PrivilegedActionNativeRequest): PrivilegedActionAdapterExecutionPlan {
  return planArbitraryPrivilegedAction(request, "darwin", "macos-authorized-helper", true, "macOS");
}

export function planLinuxPrivilegedAction(request: PrivilegedActionNativeRequest): PrivilegedActionAdapterExecutionPlan {
  return planArbitraryPrivilegedAction(request, "linux", "linux-polkit-helper", true, "Linux");
}

export function planWindowsPrivilegedAction(request: PrivilegedActionNativeRequest): PrivilegedActionAdapterExecutionPlan {
  return planArbitraryPrivilegedAction(request, "win32", "windows-elevated-helper", false, "Windows");
}

function planArbitraryPrivilegedAction(
  request: PrivilegedActionNativeRequest,
  adapterPlatform: PrivilegedActionPlatform,
  adapter: Exclude<PrivilegedActionAdapterName, "dry-run">,
  requiresCredential: boolean,
  platformLabel: string,
): PrivilegedActionAdapterExecutionPlan {
  validatePrivilegedActionNativeRequestForAdapter(request);
  const platform = request.template.platform ?? "any";
  if (platform !== "any" && platform !== adapterPlatform) {
    return unsupportedAdapterPlan(request, adapterPlatform, `Request targets ${platform}, not ${platformLabel}.`, adapter, "planned-not-executed");
  }
  const commands = request.template.commands.map((command) => ({
    executable: command.exe,
    args: command.args,
    ...(command.cwd ? { cwd: resolveWorkspacePath(request.workspacePath, command.cwd) } : {}),
  }));
  const redactedPlaceholder = commands.find((command) => JSON.stringify(command).includes("[REDACTED]") || JSON.stringify(command).includes("[AMBIENT_PRIVILEGED_AUTH]"));
  if (redactedPlaceholder) {
    return unsupportedAdapterPlan(request, adapterPlatform, `${platformLabel} privileged policy will not execute commands containing redacted secret placeholders.`, adapter, "planned-not-executed");
  }
  const first = commands[0];
  return {
    adapter,
    executionMode: "planned-not-executed",
    allowedByPolicy: true,
    policyReason: `${platformLabel} adapter allows arbitrary structured privileged actions after explicit user approval.`,
    platform: adapterPlatform,
    purpose: request.template.purpose,
    requiresCredential,
    executesPrivilegedCommands: true,
    ...(first ? { executable: first.executable, args: first.args, ...(first.cwd ? { cwd: first.cwd } : {}) } : {}),
    commands,
    warnings: [
      `${platformLabel} adapter can run arbitrary privileged host commands for this typed action after user approval.`,
      requiresCredential
        ? "Execution requires Ambient approval and an ephemeral admin credential. Pi cannot see the credential."
        : "Execution requires Ambient approval and the platform elevation prompt. Pi cannot see any credential entered into the OS prompt.",
      "Review every executable, argument, cwd, and rationale carefully; Ambient cannot guarantee automatic rollback for arbitrary privileged actions.",
    ],
  };
}

export function validatePrivilegedActionNativeRequestForAdapter(request: PrivilegedActionNativeRequest): void {
  if (request.schemaVersion !== "ambient-privileged-action-v1") throw new Error("Unsupported privileged action request schema.");
  if (!request.requestId.trim()) throw new Error("Privileged action requestId is required.");
  if (!request.workspacePath.trim()) throw new Error("Privileged action workspacePath is required.");
  if (request.template.kind !== "privileged_action_template") throw new Error("Privileged action template kind is invalid.");
  if (request.template.credential) throw new Error("Privileged action adapter requests must not include credential sentinels or values.");
  if (!request.template.commands.length) throw new Error("Privileged action adapter requests must include at least one redacted command.");
  const serialized = JSON.stringify(request);
  if (serialized.includes(credentialPlaceholder)) throw new Error("Privileged action adapter request still contains the credential sentinel.");
  if (/(password|passwd|pwd|token|secret|credential|authorization|auth[_-]?key|api[_-]?key)=(?!\[REDACTED\])([^&\s"\\]+)/i.test(serialized)) {
    throw new Error("Privileged action adapter request contains unredacted secret-like text.");
  }
}

function normalizeAdapterPlatform(platform: NodeJS.Platform | PrivilegedActionPlatform): PrivilegedActionPlatform {
  if (platform === "darwin" || platform === "linux" || platform === "win32") return platform;
  return "any";
}

function runSudoPrivilegedCommand(input: {
  executable: string;
  args: string[];
  cwd?: string;
  credential?: string;
  timeoutMs: number;
}): Promise<PrivilegedActionCommandRunResult> {
  if (!input.credential) return Promise.reject(new Error("sudo privileged command requires an ephemeral credential."));
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("/usr/bin/sudo", ["-S", "-p", "", "--", input.executable, ...input.args], {
      cwd: input.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(() => rejectPromise(new Error(`Privileged command timed out after ${input.timeoutMs}ms.`)));
    }, input.timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout = appendBoundedOutput(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendBoundedOutput(stderr, chunk);
    });
    child.on("error", (error) => {
      settle(() => rejectPromise(error));
    });
    child.on("close", (exitCode) => {
      settle(() => resolvePromise({ exitCode, stdout, stderr }));
    });
    child.stdin?.write(`${input.credential}\n`);
    child.stdin?.end();
  });
}

function runWindowsElevatedCommand(input: {
  executable: string;
  args: string[];
  cwd?: string;
  timeoutMs: number;
}): Promise<PrivilegedActionCommandRunResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$filePath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64Utf8(input.executable)}'))`,
      `$argumentList = @(${input.args.map((arg) => `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64Utf8(arg)}'))`).join(", ")})`,
      "$startInfo = @{ FilePath = $filePath; ArgumentList = $argumentList; Verb = 'RunAs'; Wait = $true; PassThru = $true }",
      input.cwd ? `$startInfo.WorkingDirectory = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64Utf8(input.cwd)}'))` : "",
      "$process = Start-Process @startInfo",
      "if ($null -ne $process.ExitCode) { exit $process.ExitCode }",
      "exit 0",
    ].filter(Boolean).join("\n");
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill();
      settle(() => rejectPromise(new Error(`Windows elevated command timed out after ${input.timeoutMs}ms.`)));
    }, input.timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout = appendBoundedOutput(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendBoundedOutput(stderr, chunk);
    });
    child.on("error", (error) => {
      settle(() => rejectPromise(error));
    });
    child.on("close", (exitCode) => {
      settle(() => resolvePromise({ exitCode, stdout, stderr }));
    });
  });
}

function base64Utf8(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function appendBoundedOutput(existing: string, chunk: Buffer | string): string {
  const next = existing + chunk.toString();
  return next.length > 16_000 ? next.slice(-16_000) : next;
}

function resolveWorkspacePath(workspacePath: string, candidate: string): string {
  return isAbsolute(candidate) ? resolve(candidate) : resolve(workspacePath, candidate);
}

function unsupportedAdapterPlan(
  request: PrivilegedActionNativeRequest,
  platform: PrivilegedActionPlatform,
  reason: string,
  adapter: PrivilegedActionAdapterName = "dry-run",
  executionMode: PrivilegedActionAdapterExecutionPlan["executionMode"] = "dry-run-only",
): PrivilegedActionAdapterExecutionPlan {
  return {
    adapter,
    executionMode,
    allowedByPolicy: false,
    policyReason: reason,
    platform,
    purpose: request.template.purpose,
    requiresCredential: false,
    executesPrivilegedCommands: false,
    warnings: [reason, "No privileged command was executed."],
  };
}
