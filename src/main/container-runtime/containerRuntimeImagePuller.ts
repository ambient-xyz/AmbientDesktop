import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import {
  containerRuntimeDockerCommandCandidates,
  containerRuntimePodmanCommandCandidates,
  type ContainerRuntimeCommandHint,
} from "./containerRuntimeCommandDiscovery";
import type { OciImagePlatform } from "./ociImageResolver";

export type ContainerRuntimeImagePullRuntime = "docker" | "podman";

export interface ContainerRuntimeImagePullCommandResult {
  runtime: ContainerRuntimeImagePullRuntime;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  errorCode?: string;
}

export interface ContainerRuntimeImagePullResult extends ContainerRuntimeImagePullCommandResult {
  image: string;
  targetPlatform: OciImagePlatform;
}

export type ContainerRuntimeImagePullPreferredRuntime = "docker" | "podman" | "colima" | "unknown";

export type ContainerRuntimeImagePullCommandRunner = (input: {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  runtime: ContainerRuntimeImagePullRuntime;
}) => Promise<ContainerRuntimeImagePullCommandResult>;

export interface PullContainerRuntimeImageInput {
  image: string;
  targetPlatform: OciImagePlatform;
  preferredRuntime?: ContainerRuntimeImagePullPreferredRuntime;
  platform?: NodeJS.Platform | string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  processHints?: ContainerRuntimeCommandHint[];
  commandRunner?: ContainerRuntimeImagePullCommandRunner;
}

const maxOutputBufferBytes = 8 * 1024 * 1024;

export async function pullOciImageWithContainerRuntime(input: PullContainerRuntimeImageInput): Promise<ContainerRuntimeImagePullResult> {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;
  const timeoutMs = Math.max(30_000, Math.floor(input.timeoutMs ?? 600_000));
  const runner = input.commandRunner ?? defaultContainerRuntimeImagePullCommandRunner;
  const attempts: ContainerRuntimeImagePullCommandResult[] = [];

  for (const runtime of runtimeOrder(input.preferredRuntime)) {
    for (const command of commandCandidates(runtime, platform, input.processHints ?? [])) {
      const args = pullArgs(runtime, input.targetPlatform, input.image);
      const result = await runner({ runtime, command, args, env, timeoutMs });
      attempts.push(result);
      if (result.exitCode === 0) {
        return {
          ...result,
          image: input.image,
          targetPlatform: input.targetPlatform,
        };
      }
      if (result.errorCode !== "ENOENT") break;
    }
    if (input.preferredRuntime && input.preferredRuntime !== "unknown") break;
  }

  throw new Error(formatImagePullFailure(input.image, input.targetPlatform, attempts));
}

function runtimeOrder(preferred?: ContainerRuntimeImagePullPreferredRuntime): ContainerRuntimeImagePullRuntime[] {
  if (preferred === "podman") return ["podman"];
  if (preferred === "docker" || preferred === "colima") return ["docker"];
  return ["docker", "podman"];
}

function commandCandidates(
  runtime: ContainerRuntimeImagePullRuntime,
  platform: NodeJS.Platform | string,
  processHints: ContainerRuntimeCommandHint[],
): string[] {
  if (runtime === "docker") return containerRuntimeDockerCommandCandidates(platform, processHints);
  return containerRuntimePodmanCommandCandidates(platform, processHints);
}

function pullArgs(runtime: ContainerRuntimeImagePullRuntime, targetPlatform: OciImagePlatform, image: string): string[] {
  if (runtime === "docker") return ["pull", "--platform", `${targetPlatform.os}/${targetPlatform.architecture}`, image];
  return ["pull", "--arch", targetPlatform.architecture, "--os", targetPlatform.os, image];
}

function defaultContainerRuntimeImagePullCommandRunner(input: {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  runtime: ContainerRuntimeImagePullRuntime;
}): Promise<ContainerRuntimeImagePullCommandResult> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    execFile(input.command, input.args, {
      env: input.env,
      encoding: "utf8",
      timeout: input.timeoutMs,
      maxBuffer: maxOutputBufferBytes,
    }, (error, stdout, stderr) => {
      const typedError = error as (Error & { code?: unknown }) | null;
      const exitCode = typeof typedError?.code === "number" ? typedError.code : typedError ? 1 : 0;
      resolve({
        runtime: input.runtime,
        command: input.command,
        args: input.args,
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
        exitCode,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ...(typedError?.code ? { errorCode: String(typedError.code) } : {}),
      });
    });
  });
}

function formatImagePullFailure(
  image: string,
  targetPlatform: OciImagePlatform,
  attempts: ContainerRuntimeImagePullCommandResult[],
): string {
  if (!attempts.length) return `No container runtime pull command was available for ${image}.`;
  const missing = attempts.every((attempt) => attempt.errorCode === "ENOENT");
  if (missing) {
    const checked = attempts.map((attempt) => attempt.command).join(", ");
    return `Could not pre-pull reviewed OCI image ${image} for ${targetPlatform.os}/${targetPlatform.architecture}: no container runtime CLI was found. Checked: ${checked}.`;
  }
  const last = lastNonMissingAttempt(attempts) ?? attempts[attempts.length - 1]!;
  const output = [last.stderr, last.stdout].join("\n").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 6).join(" ");
  return [
    `Could not pre-pull reviewed OCI image ${image} for ${targetPlatform.os}/${targetPlatform.architecture} with ${last.runtime}.`,
    `Command: ${last.command} ${last.args.join(" ")}`,
    `Exit code: ${last.exitCode}.`,
    output ? `Output: ${output}` : undefined,
  ].filter(Boolean).join(" ");
}

function lastNonMissingAttempt(attempts: ContainerRuntimeImagePullCommandResult[]): ContainerRuntimeImagePullCommandResult | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];
    if (attempt.errorCode !== "ENOENT") return attempt;
  }
  return undefined;
}
