import type { PermissionMode } from "../../shared/types";
import { redactSensitiveText } from "../secretRedaction";
import { materializeTextOutput, materializedTextNotice } from "../tool-runtime/toolOutputArtifacts";
import { spawnToolProcess } from "../tool-runtime/toolRunner";

export type WorkflowHookName = "afterCreate" | "beforeRun" | "afterRun" | "beforeRemove";

export interface WorkflowHookResult {
  hook: WorkflowHookName;
  command: string;
  cwd: string;
  exitCode?: number;
  signal?: string;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  stdoutArtifactPath?: string;
  stdoutArtifactBytes?: number;
  stdoutNotice?: string;
  stderrArtifactPath?: string;
  stderrArtifactBytes?: number;
  stderrNotice?: string;
  ok: boolean;
}

export interface WorkflowHookOptions {
  timeoutMs: number;
  maxOutputChars?: number;
  env?: NodeJS.ProcessEnv;
  permissionMode?: PermissionMode;
  workspacePath?: string;
}

export async function runWorkflowHook(
  hook: WorkflowHookName,
  command: string | undefined,
  cwd: string,
  options: WorkflowHookOptions,
): Promise<WorkflowHookResult | undefined> {
  if (!command?.trim()) return undefined;
  const started = Date.now();
  const timeoutMs = options.timeoutMs;
  const maxOutputChars = options.maxOutputChars ?? 8_000;
  let timedOut = false;
  let stdout = "";
  let stderr = "";

  return new Promise<WorkflowHookResult>((resolve) => {
    const { child, invocation } = spawnToolProcess({
      command: shellBinary(),
      args: shellArgs(command),
      cwd,
      env: { ...process.env, ...options.env },
      policy: {
        permissionMode: options.permissionMode ?? "full-access",
        workspacePath: options.workspacePath ?? cwd,
        subject: "workflow-hook",
      },
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      stderr += error.message;
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      void (async () => {
        const sanitizedStdout = sanitizeOutput(stdout);
        const sanitizedStderr = sanitizeOutput(stderr);
        const workspacePath = options.workspacePath ?? cwd;
        const materializedStdout = await materializeTextOutput(workspacePath, {
          label: `workflow-hook-${hook}-stdout`,
          text: sanitizedStdout,
          maxPreviewChars: maxOutputChars,
        });
        const materializedStderr = await materializeTextOutput(workspacePath, {
          label: `workflow-hook-${hook}-stderr`,
          text: sanitizedStderr,
          maxPreviewChars: maxOutputChars,
        });
        resolve({
          hook,
          command: sanitizeOutput(command),
          cwd: invocation.cwd,
          exitCode: exitCode ?? undefined,
          signal: signal ?? undefined,
          timedOut,
          durationMs: Date.now() - started,
          stdout: outputWithNotice(materializedStdout.text, materializedTextNotice("workflow hook stdout", materializedStdout)),
          stderr: outputWithNotice(materializedStderr.text, materializedTextNotice("workflow hook stderr", materializedStderr)),
          truncated: materializedStdout.truncated || materializedStderr.truncated,
          stdoutArtifactPath: materializedStdout.artifactPath,
          stdoutArtifactBytes: materializedStdout.artifactBytes,
          stdoutNotice: materializedTextNotice("workflow hook stdout", materializedStdout),
          stderrArtifactPath: materializedStderr.artifactPath,
          stderrArtifactBytes: materializedStderr.artifactBytes,
          stderrNotice: materializedTextNotice("workflow hook stderr", materializedStderr),
          ok: !timedOut && exitCode === 0,
        });
      })().catch((error) => {
        const clippedStdout = truncateOutput(sanitizeOutput(stdout), maxOutputChars);
        const clippedStderr = truncateOutput(sanitizeOutput(stderr), maxOutputChars);
        resolve({
          hook,
          command: sanitizeOutput(command),
          cwd: invocation.cwd,
          exitCode: exitCode ?? undefined,
          signal: signal ?? undefined,
          timedOut,
          durationMs: Date.now() - started,
          stdout: clippedStdout.value,
          stderr: `${clippedStderr.value}\n${error instanceof Error ? error.message : String(error)}`,
          truncated: true,
          ok: false,
        });
      });
    });
  });
}

export function sanitizeOutput(value: string): string {
  return redactSensitiveText(value).replaceAll("[REDACTED]", "[redacted]");
}

function truncateOutput(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) return { value, truncated: false };
  return { value: `${value.slice(0, maxChars)}\n[truncated]`, truncated: true };
}

function outputWithNotice(value: string, notice: string | undefined): string {
  if (!notice) return value;
  return `${value}\n${notice}`;
}

function shellBinary(): string {
  if (process.platform === "win32") return process.env.ComSpec ?? "cmd.exe";
  return "/bin/sh";
}

function shellArgs(command: string): string[] {
  if (process.platform === "win32") return ["/d", "/s", "/c", command];
  return ["-c", command];
}
