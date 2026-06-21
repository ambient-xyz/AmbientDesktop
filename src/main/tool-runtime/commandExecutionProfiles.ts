import { spawn } from "node:child_process";
import { redactSensitiveTextWithMetadata } from "./toolRuntimeSecurityFacade";

export const commandTimeoutProfileNames = [
  "healthCheck",
  "quickProbe",
  "dependencyInstall",
  "modelDownload",
  "modelColdStart",
  "liveGeneration",
] as const;

export type CommandTimeoutProfile = typeof commandTimeoutProfileNames[number];

export interface CommandTimeoutProfileConfig {
  timeoutMs: number;
  idleTimeoutMs: number;
  recommendedRetryProfile: CommandTimeoutProfile;
}

export const commandTimeoutProfileConfigs: Record<CommandTimeoutProfile, CommandTimeoutProfileConfig> = {
  healthCheck: {
    timeoutMs: 30_000,
    idleTimeoutMs: 30_000,
    recommendedRetryProfile: "quickProbe",
  },
  quickProbe: {
    timeoutMs: 90_000,
    idleTimeoutMs: 30_000,
    recommendedRetryProfile: "modelColdStart",
  },
  dependencyInstall: {
    timeoutMs: 900_000,
    idleTimeoutMs: 120_000,
    recommendedRetryProfile: "dependencyInstall",
  },
  modelDownload: {
    timeoutMs: 1_200_000,
    idleTimeoutMs: 180_000,
    recommendedRetryProfile: "modelDownload",
  },
  modelColdStart: {
    timeoutMs: 1_200_000,
    idleTimeoutMs: 180_000,
    recommendedRetryProfile: "liveGeneration",
  },
  liveGeneration: {
    timeoutMs: 900_000,
    idleTimeoutMs: 120_000,
    recommendedRetryProfile: "liveGeneration",
  },
};

export interface CommandDevicePolicy {
  prefer?: string[];
  requireReasonWhenCpuForced?: boolean;
  cpuReason?: string;
  forceCpuReason?: string;
  argName?: string;
}

export interface CommandDeviceSelection {
  availableDevices: string[];
  recommendedDevice: string;
  selectedDevice: string;
  argName: string;
  requestedDevice?: string;
  cpuForcedReason?: string;
  cpuOverridePrevented?: boolean;
}

export interface ProfiledCommandInput {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutProfile?: CommandTimeoutProfile;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  maxBuffer?: number;
  phase?: string;
  progressPatterns?: string[];
  devicePolicy?: CommandDevicePolicy;
}

export interface ProfiledCommandResult {
  command: string;
  args: string[];
  cwd?: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  timeoutProfile: CommandTimeoutProfile;
  timeoutMs: number;
  idleTimeoutMs: number;
  phase: string;
  startedAt: string;
  completedAt: string;
  lastProgressAt?: string;
  lastProgressKind?: string;
  matchedProgressPatterns: string[];
  deviceSelection?: CommandDeviceSelection;
}

export class ProfiledCommandError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly args: string[];
  readonly code?: number | string;
  readonly signal?: NodeJS.Signals | string;
  readonly durationMs: number;
  readonly timeoutProfile: CommandTimeoutProfile;
  readonly timeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly phase: string;
  readonly timeoutPhase?: "process" | "process-idle";
  readonly lastProgressAt?: string;
  readonly lastProgressMs?: number;
  readonly recommendedRetryProfile?: CommandTimeoutProfile;
  readonly deviceSelection?: CommandDeviceSelection;
  readonly matchedProgressPatterns: string[];

  constructor(message: string, input: {
    stdout: string;
    stderr: string;
    args: string[];
    code?: number | string;
    signal?: NodeJS.Signals | string;
    durationMs: number;
    timeoutProfile: CommandTimeoutProfile;
    timeoutMs: number;
    idleTimeoutMs: number;
    phase: string;
    timeoutPhase?: "process" | "process-idle";
    lastProgressAt?: string;
    lastProgressMs?: number;
    recommendedRetryProfile?: CommandTimeoutProfile;
    deviceSelection?: CommandDeviceSelection;
    matchedProgressPatterns?: string[];
  }) {
    super(message);
    this.name = "ProfiledCommandError";
    this.stdout = input.stdout;
    this.stderr = input.stderr;
    this.args = input.args;
    this.code = input.code;
    this.signal = input.signal;
    this.durationMs = input.durationMs;
    this.timeoutProfile = input.timeoutProfile;
    this.timeoutMs = input.timeoutMs;
    this.idleTimeoutMs = input.idleTimeoutMs;
    this.phase = input.phase;
    this.timeoutPhase = input.timeoutPhase;
    this.lastProgressAt = input.lastProgressAt;
    this.lastProgressMs = input.lastProgressMs;
    this.recommendedRetryProfile = input.recommendedRetryProfile;
    this.deviceSelection = input.deviceSelection;
    this.matchedProgressPatterns = input.matchedProgressPatterns ?? [];
  }
}

export function resolveCommandTimeoutProfile(profile: CommandTimeoutProfile | undefined): CommandTimeoutProfile {
  return profile && commandTimeoutProfileNames.includes(profile) ? profile : "quickProbe";
}

export function isCommandTimeoutProfile(value: unknown): value is CommandTimeoutProfile {
  return typeof value === "string" && commandTimeoutProfileNames.includes(value as CommandTimeoutProfile);
}

export async function executeProfiledCommand(input: ProfiledCommandInput): Promise<ProfiledCommandResult> {
  const timeoutProfile = resolveCommandTimeoutProfile(input.timeoutProfile);
  const profile = commandTimeoutProfileConfigs[timeoutProfile];
  const timeoutMs = Math.max(1, Math.floor(input.timeoutMs ?? profile.timeoutMs));
  const idleTimeoutMs = Math.max(1, Math.floor(input.idleTimeoutMs ?? profile.idleTimeoutMs));
  const phase = input.phase ?? "command";
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const progressPatterns = compileProgressPatterns(input.progressPatterns ?? []);
  const matchedProgressPatterns = new Set<string>();
  const prepared = applyCommandDevicePolicy(input.args ?? [], input.devicePolicy, {
    ...process.env,
    ...(input.env ?? {}),
  });
  const maxBuffer = Math.max(1, Math.floor(input.maxBuffer ?? 4 * 1024 * 1024));
  let stdout = "";
  let stderr = "";
  let capturedBytes = 0;
  let lastProgressAtMs: number | undefined;
  let lastProgressKind: string | undefined;
  let settled = false;
  let timeoutPhase: ProfiledCommandError["timeoutPhase"];
  let maxBufferExceeded = false;
  let terminationStarted = false;

  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(input.command, prepared.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"],
      signal: input.signal,
    });

    let idleTimer: NodeJS.Timeout | undefined;
    const overallTimer = setTimeout(() => {
      timeoutPhase = "process";
      killChild();
    }, timeoutMs);

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timeoutPhase = "process-idle";
        killChild();
      }, idleTimeoutMs);
    };

    const finish = (error?: Error, code?: number | null, signal?: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      if (idleTimer) clearTimeout(idleTimer);
      const completedAtMs = Date.now();
      const completedAt = new Date(completedAtMs).toISOString();
      const durationMs = completedAtMs - startedAtMs;
      const base = {
        stdout,
        stderr,
        args: prepared.args,
        durationMs,
        timeoutProfile,
        timeoutMs,
        idleTimeoutMs,
        phase,
        deviceSelection: prepared.deviceSelection,
        matchedProgressPatterns: [...matchedProgressPatterns],
      };
      if (timeoutPhase) {
        const lastProgressMs = lastProgressAtMs === undefined ? undefined : completedAtMs - lastProgressAtMs;
        rejectPromise(new ProfiledCommandError(
          `Command timed out during ${phase}: timeoutProfile=${timeoutProfile}, timeoutPhase=${timeoutPhase}, elapsedMs=${durationMs}, lastProgressMs=${lastProgressMs ?? "never"}, recommendedRetryProfile=${profile.recommendedRetryProfile}.`,
          {
            ...base,
            signal: signal ?? undefined,
            timeoutPhase,
            lastProgressAt: lastProgressAtMs === undefined ? undefined : new Date(lastProgressAtMs).toISOString(),
            lastProgressMs,
            recommendedRetryProfile: profile.recommendedRetryProfile,
          },
        ));
        return;
      }
      if (maxBufferExceeded) {
        rejectPromise(new ProfiledCommandError(
          `Command exceeded output capture limit during ${phase}: maxBuffer=${maxBuffer}.`,
          { ...base, code: "maxBuffer" },
        ));
        return;
      }
      if (error) {
        rejectPromise(new ProfiledCommandError(error.message, { ...base, code: (error as NodeJS.ErrnoException).code }));
        return;
      }
      if (code !== 0) {
        rejectPromise(new ProfiledCommandError(
          `Command exited with ${signal ? `signal ${signal}` : `code ${code}`}.${failureOutputSummary(stdout, stderr)}`,
          { ...base, code: code ?? undefined, signal: signal ?? undefined },
        ));
        return;
      }
      resolvePromise({
        command: input.command,
        args: prepared.args,
        cwd: input.cwd,
        stdout,
        stderr,
        durationMs,
        timeoutProfile,
        timeoutMs,
        idleTimeoutMs,
        phase,
        startedAt,
        completedAt,
        ...(lastProgressAtMs !== undefined ? { lastProgressAt: new Date(lastProgressAtMs).toISOString() } : {}),
        ...(lastProgressKind ? { lastProgressKind } : {}),
        matchedProgressPatterns: [...matchedProgressPatterns],
        ...(prepared.deviceSelection ? { deviceSelection: prepared.deviceSelection } : {}),
      });
    };

    const recordOutput = (kind: "stdout" | "stderr", chunk: Buffer) => {
      const text = chunk.toString("utf8");
      capturedBytes += Buffer.byteLength(text);
      if (capturedBytes > maxBuffer) {
        maxBufferExceeded = true;
        killChild();
        return;
      }
      if (kind === "stdout") stdout += text;
      else stderr += text;
      lastProgressAtMs = Date.now();
      lastProgressKind = kind;
      for (const item of progressPatterns) {
        if (item.regex.test(text)) matchedProgressPatterns.add(item.pattern);
      }
      resetIdleTimer();
    };

    const killChild = () => {
      if (!terminationStarted) {
        terminationStarted = true;
        child.kill("SIGTERM");
      }
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 2_000).unref();
    };

    resetIdleTimer();
    child.stdout.on("data", (chunk) => recordOutput("stdout", chunk));
    child.stderr.on("data", (chunk) => recordOutput("stderr", chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code, signal) => finish(undefined, code, signal));
  });
}

export function applyCommandDevicePolicy(
  inputArgs: string[],
  policy: CommandDevicePolicy | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { args: string[]; deviceSelection?: CommandDeviceSelection } {
  if (!policy) return { args: [...inputArgs] };
  const argName = policy.argName?.trim() || "--device";
  const facts = detectCommandDevices(env);
  const preferred = cleanDeviceNames(policy.prefer);
  const selectedDevice = preferred.find((device) => facts.availableDevices.includes(device))
    ?? facts.recommendedDevice
    ?? facts.availableDevices[0]
    ?? "cpu";
  const args = [...inputArgs];
  const existing = findDeviceArguments(args, argName);
  const effectiveExisting = existing.at(-1);
  const cpuReason = (policy.cpuReason ?? policy.forceCpuReason)?.trim();
  const selection: CommandDeviceSelection = {
    availableDevices: facts.availableDevices,
    recommendedDevice: facts.recommendedDevice,
    selectedDevice: effectiveExisting?.value ?? selectedDevice,
    argName,
    ...(effectiveExisting?.value ? { requestedDevice: effectiveExisting.value } : {}),
    ...(cpuReason ? { cpuForcedReason: cpuReason } : {}),
  };

  if (existing.length) {
    const shouldPreventCpu = facts.recommendedDevice !== "cpu" && policy.requireReasonWhenCpuForced === true && !cpuReason;
    if (shouldPreventCpu) {
      for (const item of existing) {
        if (item.value === "cpu") replaceDeviceArgument(args, item, selectedDevice);
      }
      if (existing.some((item) => item.value === "cpu")) {
        selection.requestedDevice = "cpu";
        selection.cpuOverridePrevented = true;
      }
    }
    const finalExisting = findDeviceArguments(args, argName).at(-1);
    if (finalExisting?.value) {
      selection.selectedDevice = finalExisting.value;
    }
    return { args, deviceSelection: selection };
  }

  args.push(argName, selectedDevice);
  selection.selectedDevice = selectedDevice;
  return { args, deviceSelection: selection };
}

export function detectCommandDevices(env: NodeJS.ProcessEnv = process.env): { availableDevices: string[]; recommendedDevice: string } {
  const overrideDevices = cleanDeviceNames(splitCsv(env.AMBIENT_COMMAND_AVAILABLE_DEVICES ?? env.AMBIENT_AVAILABLE_DEVICES));
  if (overrideDevices.length) {
    const overrideRecommended = normalizeDeviceName(env.AMBIENT_COMMAND_RECOMMENDED_DEVICE ?? env.AMBIENT_RECOMMENDED_DEVICE);
    return {
      availableDevices: overrideDevices,
      recommendedDevice: overrideRecommended && overrideDevices.includes(overrideRecommended)
        ? overrideRecommended
        : overrideDevices.find((device) => device !== "cpu") ?? overrideDevices[0],
    };
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return { availableDevices: ["mps", "cpu"], recommendedDevice: "mps" };
  }
  return { availableDevices: ["cpu"], recommendedDevice: "cpu" };
}

function compileProgressPatterns(patterns: string[]): Array<{ pattern: string; regex: RegExp }> {
  return patterns
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => ({ pattern, regex: new RegExp(pattern, "i") }));
}

function splitCsv(value: string | undefined): string[] {
  return value?.split(",") ?? [];
}

function cleanDeviceNames(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map(normalizeDeviceName).filter((value): value is string => Boolean(value)))];
}

function normalizeDeviceName(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || undefined;
}

function findDeviceArguments(args: string[], argName: string): Array<{ index: number; value: string; inline: boolean }> {
  const results: Array<{ index: number; value: string; inline: boolean }> = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === argName && args[index + 1]) {
      results.push({ index, value: args[index + 1].trim().toLowerCase(), inline: false });
      index += 1;
      continue;
    }
    const prefix = `${argName}=`;
    if (arg.startsWith(prefix)) results.push({ index, value: arg.slice(prefix.length).trim().toLowerCase(), inline: true });
  }
  return results;
}

function replaceDeviceArgument(args: string[], existing: { index: number; inline: boolean }, selectedDevice: string): void {
  if (existing.inline) {
    const [name] = args[existing.index].split("=", 1);
    args[existing.index] = `${name}=${selectedDevice}`;
    return;
  }
  args[existing.index + 1] = selectedDevice;
}

function failureOutputSummary(stdout: string, stderr: string): string {
  const parts: string[] = [];
  if (stderr.trim()) parts.push(`stderr: ${redactSensitiveTextWithMetadata(stderr.trim().slice(-2_000)).text}`);
  if (stdout.trim()) parts.push(`stdout: ${redactSensitiveTextWithMetadata(stdout.trim().slice(-2_000)).text}`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}
