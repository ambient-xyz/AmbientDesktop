import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { PrivilegedActionNativeRequest, PrivilegedActionNativeResult, PrivilegedCredentialPromptResolution } from "../../shared/permissionTypes";
import {
  buildPrivilegedActionNativeRequest,
  credentialPlaceholder,
  dryRunPrivilegedActionNativeRequest,
  planPrivilegedAction,
  planPrivilegedActionAdapterExecution,
  type PrivilegedActionAdapter,
  withPrivilegedActionLogPath,
} from "./containerRuntimePrivilegedActionFacade";
import type {
  ContainerRuntimeInstallAction,
  ContainerRuntimeManagedInstallCommand,
  ContainerRuntimeManagedInstallProgress,
  ContainerRuntimeManagedInstallResult,
} from "./containerRuntimeInstallLauncher";

export interface ContainerRuntimeManagedInstallCommandRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}

export type ContainerRuntimeManagedInstallCommandRunner = (input: {
  executable: string;
  args: string[];
  cwd?: string;
  timeoutMs: number;
}) => Promise<ContainerRuntimeManagedInstallCommandRunResult>;

export interface ExecuteContainerRuntimeManagedInstallOptions {
  workspacePath: string;
  threadId?: string;
  mode?: "execute" | "dry-run";
  requestId?: string;
  timeoutMs?: number;
  commandRunner?: ContainerRuntimeManagedInstallCommandRunner;
  privilegedAdapter: PrivilegedActionAdapter;
  requestCredential: (input: PrivilegedActionNativeRequest) => Promise<PrivilegedCredentialPromptResolution>;
  writeRedactedLog: (result: PrivilegedActionNativeResult) => Promise<string>;
  writeManagedInstallLog?: (result: ContainerRuntimeManagedInstallResult) => Promise<string>;
  onProgress?: (progress: ContainerRuntimeManagedInstallProgress) => void | Promise<void>;
}

const defaultManagedInstallTimeoutMs = 10 * 60 * 1000;

export async function executeContainerRuntimeManagedInstallAction(
  action: ContainerRuntimeInstallAction,
  options: ExecuteContainerRuntimeManagedInstallOptions,
): Promise<ContainerRuntimeManagedInstallResult> {
  const managed = action.managedInstall;
  if (action.kind !== "managed-install" || !managed) {
    throw new Error(`Container runtime action ${action.id} is not a managed install action.`);
  }
  if (!managed.commands.length) throw new Error(`Managed install action ${action.id} has no command plan.`);
  if (managed.execution === "user-command") return executeUserCommandManagedInstall(action, options);
  return executePrivilegedManagedInstall(action, options);
}

async function executeUserCommandManagedInstall(
  action: ContainerRuntimeInstallAction,
  options: ExecuteContainerRuntimeManagedInstallOptions,
): Promise<ContainerRuntimeManagedInstallResult> {
  const managed = action.managedInstall!;
  const requestId = managedInstallRequestId(options);
  if (options.mode === "dry-run") {
    return finalizeUserCommandManagedInstallResult(action, options, {
      status: "not-executed",
      message: `Dry run accepted for ${action.label}. Ambient would run ${managed.commands.length} user command(s); no command was executed.`,
      adapter: "ambient-user-command",
      requestId,
      commandCount: managed.commands.length,
      redactedCommands: managed.commands,
    }, "dry-run-ready");
  }

  const runner = options.commandRunner ?? runManagedInstallCommand;
  let stdoutPreview = "";
  let stderrPreview = "";
  reportManagedInstallProgress(action, options, {
    phase: "starting",
    message: `Starting ${action.label} with ${managed.commands.length} Ambient-authored user command(s).`,
    adapter: "ambient-user-command",
    requestId,
    commandCount: managed.commands.length,
  });
  for (const [index, command] of managed.commands.entries()) {
    reportManagedInstallProgress(action, options, {
      phase: "command-started",
      message: `Running ${action.label} command ${index + 1} of ${managed.commands.length}: ${command.exe}.`,
      adapter: "ambient-user-command",
      requestId,
      commandIndex: index + 1,
      commandCount: managed.commands.length,
      command,
    });
    const output = await runner({
      executable: command.exe,
      args: command.args,
      cwd: command.cwd,
      timeoutMs: options.timeoutMs ?? defaultManagedInstallTimeoutMs,
    });
    stdoutPreview = appendBoundedOutput(stdoutPreview, output.stdout);
    stderrPreview = appendBoundedOutput(stderrPreview, output.stderr);
    if (output.exitCode !== 0) {
      const result: ContainerRuntimeManagedInstallResult = {
        status: "failed",
        message: `${action.label} command ${index + 1} failed with exit code ${output.exitCode ?? "unknown"}${output.errorMessage ? `: ${output.errorMessage}` : "."}`,
        adapter: "ambient-user-command",
        requestId,
        commandCount: managed.commands.length,
        stdoutPreview,
        stderrPreview,
        redactedCommands: managed.commands,
      };
      reportManagedInstallProgress(action, options, {
        phase: "command-failed",
        message: result.message,
        adapter: "ambient-user-command",
        requestId,
        commandIndex: index + 1,
        commandCount: managed.commands.length,
        command,
        status: result.status,
      });
      return finalizeUserCommandManagedInstallResult(action, options, result);
    }
    reportManagedInstallProgress(action, options, {
      phase: "command-succeeded",
      message: `${action.label} command ${index + 1} of ${managed.commands.length} completed.`,
      adapter: "ambient-user-command",
      requestId,
      commandIndex: index + 1,
      commandCount: managed.commands.length,
      command,
      status: "succeeded",
    });
  }
  return finalizeUserCommandManagedInstallResult(action, options, {
    status: "succeeded",
    message: `${action.label} completed. Start the runtime if it did not open automatically, then refresh the MCP runtime check in Ambient.`,
    adapter: "ambient-user-command",
    requestId,
    commandCount: managed.commands.length,
    stdoutPreview,
    stderrPreview,
    redactedCommands: managed.commands,
  });
}

async function finalizeUserCommandManagedInstallResult(
  action: ContainerRuntimeInstallAction,
  options: ExecuteContainerRuntimeManagedInstallOptions,
  result: ContainerRuntimeManagedInstallResult,
  preLogPhase?: "dry-run-ready",
): Promise<ContainerRuntimeManagedInstallResult> {
  if (preLogPhase) {
    reportManagedInstallProgress(action, options, {
      phase: preLogPhase,
      message: result.message,
      adapter: result.adapter,
      requestId: result.requestId,
      commandCount: result.commandCount,
      status: result.status,
    });
  }
  const logPath = options.writeManagedInstallLog ? await options.writeManagedInstallLog(result) : undefined;
  const finalResult = logPath ? { ...result, logPath } : result;
  if (logPath) {
    reportManagedInstallProgress(action, options, {
      phase: "log-written",
      message: `Wrote redacted managed install log for ${action.label}.`,
      adapter: finalResult.adapter,
      requestId: finalResult.requestId,
      commandCount: finalResult.commandCount,
      status: finalResult.status,
      logPath,
    });
  }
  reportManagedInstallProgress(action, options, {
    phase: "completed",
    message: finalResult.message,
    adapter: finalResult.adapter,
    requestId: finalResult.requestId,
    commandCount: finalResult.commandCount,
    status: finalResult.status,
    ...(finalResult.logPath ? { logPath: finalResult.logPath } : {}),
  });
  return finalResult;
}

function managedInstallRequestId(options: ExecuteContainerRuntimeManagedInstallOptions): string {
  return options.requestId ?? randomUUID();
}

function reportManagedInstallProgress(
  action: ContainerRuntimeInstallAction,
  options: ExecuteContainerRuntimeManagedInstallOptions,
  progress: Omit<ContainerRuntimeManagedInstallProgress, "schemaVersion" | "actionId" | "actionLabel" | "runtime" | "recordedAt">,
): void {
  const reporter = options.onProgress;
  if (!reporter) return;
  const reported = reporter({
    schemaVersion: "ambient-container-runtime-managed-install-progress-v1",
    actionId: action.id,
    actionLabel: action.label,
    runtime: action.runtime,
    recordedAt: new Date().toISOString(),
    ...progress,
  });
  if (reported && typeof (reported as Promise<void>).catch === "function") {
    void (reported as Promise<void>).catch((error) => {
      console.warn(`[mcp-container-runtime] dropped managed install progress callback error: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

async function executePrivilegedManagedInstall(
  action: ContainerRuntimeInstallAction,
  options: ExecuteContainerRuntimeManagedInstallOptions,
): Promise<ContainerRuntimeManagedInstallResult> {
  const managed = action.managedInstall!;
  const plan = planPrivilegedAction({
    kind: "privileged_action_template",
    purpose: "install_system_package",
    packageName: managed.packageName,
    platform: managed.platform,
    reason: action.reason,
    credential: managed.requiresCredential ? credentialPlaceholder : undefined,
    commands: managed.commands.map((command) => ({
      exe: command.exe,
      args: command.args,
      ...(command.cwd ? { cwd: command.cwd } : {}),
      rationale: command.rationale,
    })),
  });
  const adapterStatus = options.privilegedAdapter.status();
  const nativeRequest = buildPrivilegedActionNativeRequest(plan, {
    workspacePath: options.workspacePath,
    ...(options.threadId ? { threadId: options.threadId } : {}),
    requestId: managedInstallRequestId(options),
    adapterReadiness: {
      execution: adapterStatus.execution,
      adapterStatus: adapterStatus.adapterStatus,
      actionCategory: plan.template.purpose,
      executablePolicy: "template-reviewed-no-shell",
      futureAdapters: ["macos-authorized-helper", "linux-polkit-helper", "windows-elevated-helper"],
    },
  });
  reportManagedInstallProgress(action, options, {
    phase: "privileged-boundary",
    message: `${action.label} is being handed to Ambient's privileged action boundary for ${options.mode === "dry-run" ? "review" : "execution"}.`,
    adapter: adapterStatus.selectedAdapter,
    requestId: nativeRequest.requestId,
    commandCount: managed.commands.length,
  });

  if (options.mode === "dry-run") {
    const dryRun = dryRunPrivilegedActionNativeRequest(nativeRequest, {
      executionPlan: planPrivilegedActionAdapterExecution(nativeRequest, { platform: managed.platform }),
    });
    const nativeResult = withPrivilegedActionLogPath(dryRun, await options.writeRedactedLog(dryRun));
    const result = summarizeNativeManagedInstallResult(nativeResult);
    reportManagedInstallProgress(action, options, {
      phase: "log-written",
      message: `Wrote redacted privileged action review log for ${action.label}.`,
      adapter: result.adapter,
      requestId: result.requestId,
      commandCount: result.commandCount,
      status: result.status,
      ...(result.logPath ? { logPath: result.logPath } : {}),
    });
    reportManagedInstallProgress(action, options, {
      phase: "completed",
      message: result.message,
      adapter: result.adapter,
      requestId: result.requestId,
      commandCount: result.commandCount,
      status: result.status,
      ...(result.logPath ? { logPath: result.logPath } : {}),
    });
    return result;
  }

  let credentialCapture: "not-requested" | "captured-and-discarded" | "denied" | "unavailable" = "not-requested";
  let ephemeralCredential: string | undefined;
  if (managed.requiresCredential && adapterStatus.selectedAdapterExecutesPrivilegedCommands) {
    const credential = await options.requestCredential(nativeRequest);
    if (credential.allowed && credential.credential) {
      credentialCapture = "captured-and-discarded";
      ephemeralCredential = credential.credential;
    } else {
      credentialCapture = "denied";
    }
  }

  let adapterResult: PrivilegedActionNativeResult;
  try {
    adapterResult = await options.privilegedAdapter.execute({
      request: nativeRequest,
      credential: ephemeralCredential,
      credentialCapture,
    });
  } finally {
    ephemeralCredential = undefined;
  }
  const nativeResult = withPrivilegedActionLogPath(adapterResult, adapterResult.logPath ?? await options.writeRedactedLog(adapterResult));
  const result = summarizeNativeManagedInstallResult(nativeResult);
  if (result.logPath) {
    reportManagedInstallProgress(action, options, {
      phase: "log-written",
      message: `Wrote redacted privileged action log for ${action.label}.`,
      adapter: result.adapter,
      requestId: result.requestId,
      commandCount: result.commandCount,
      status: result.status,
      logPath: result.logPath,
    });
  }
  reportManagedInstallProgress(action, options, {
    phase: "completed",
    message: result.message,
    adapter: result.adapter,
    requestId: result.requestId,
    commandCount: result.commandCount,
    status: result.status,
    ...(result.logPath ? { logPath: result.logPath } : {}),
  });
  return result;
}

function summarizeNativeManagedInstallResult(result: PrivilegedActionNativeResult): ContainerRuntimeManagedInstallResult {
  return {
    status: result.status,
    message: result.message,
    adapter: result.adapter,
    requestId: result.requestId,
    commandCount: result.commandCount,
    credentialCapture: result.credentialCapture,
    ...(result.logPath ? { logPath: result.logPath } : {}),
    ...(result.stdoutPreview ? { stdoutPreview: result.stdoutPreview } : {}),
    ...(result.stderrPreview ? { stderrPreview: result.stderrPreview } : {}),
    redactedCommands: result.redactedCommands.map((command): ContainerRuntimeManagedInstallCommand => ({
      exe: command.exe,
      args: command.args,
      ...(command.cwd ? { cwd: command.cwd } : {}),
      rationale: command.rationale ?? "Approved privileged install command.",
    })),
  };
}

function runManagedInstallCommand(input: {
  executable: string;
  args: string[];
  cwd?: string;
  timeoutMs: number;
}): Promise<ContainerRuntimeManagedInstallCommandRunResult> {
  return new Promise((resolve) => {
    execFile(input.executable, input.args, {
      cwd: input.cwd,
      env: process.env,
      timeout: input.timeoutMs,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      const nodeError = error as NodeJS.ErrnoException | null;
      const code = typeof nodeError?.code === "number" ? nodeError.code : error ? 1 : 0;
      resolve({
        exitCode: code,
        stdout: appendBoundedOutput("", stdout),
        stderr: appendBoundedOutput("", stderr),
        ...(nodeError?.message ? { errorMessage: nodeError.message } : {}),
      });
    });
  });
}

function appendBoundedOutput(existing: string, chunk: string | Buffer): string {
  const next = existing + chunk.toString();
  return next.length > 16_000 ? next.slice(-16_000) : next;
}
