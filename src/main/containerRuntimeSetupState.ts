import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ContainerRuntimeInstallAction } from "./containerRuntimeInstallLauncher";
import type { ContainerRuntimeProbeResult, ContainerRuntimeProbeStatus } from "./containerRuntimeProbeService";

export type ContainerRuntimeSetupDecision = "none" | "deferred" | "install-launched";

export interface ContainerRuntimeSetupState {
  schemaVersion: "ambient-container-runtime-setup-state-v1";
  appVersion?: string;
  upgradeReconciledAppVersion?: string;
  upgradeReconciledAt?: string;
  lastCheckedAt?: string;
  lastStatus?: ContainerRuntimeProbeStatus;
  lastRuntime?: string;
  lastMessage?: string;
  userDecision: ContainerRuntimeSetupDecision;
  decisionAppVersion?: string;
  decisionAt?: string;
  installActionId?: string;
  installRuntime?: string;
  installUrl?: string;
}

export interface ContainerRuntimeSetupPromptState {
  userDecision: ContainerRuntimeSetupDecision;
  shouldPrompt: boolean;
  promptSuppressed: boolean;
  reason: "runtime-ready" | "runtime-not-missing" | "user-deferred" | "install-launched" | "runtime-missing" | "toolhive-needs-repair";
  lastDecisionAt?: string;
  installActionId?: string;
  installRuntime?: string;
  installUrl?: string;
  upgradeReconciledAppVersion?: string;
}

export interface ContainerRuntimeSetupClock {
  now?: () => Date;
}

export async function readContainerRuntimeSetupState(statePath: string): Promise<ContainerRuntimeSetupState> {
  try {
    return normalizeContainerRuntimeSetupState(JSON.parse(await readFile(statePath, "utf8")));
  } catch (error) {
    if (isMissingFileError(error)) return defaultContainerRuntimeSetupState();
    if (isMalformedJsonError(error)) {
      console.warn(`[mcp-container-runtime] Ignoring malformed setup state at ${statePath}: ${error instanceof Error ? error.message : String(error)}`);
      return defaultContainerRuntimeSetupState();
    }
    throw error;
  }
}

export async function recordContainerRuntimeProbeState(
  statePath: string,
  result: ContainerRuntimeProbeResult,
  options: ContainerRuntimeSetupClock & { appVersion: string },
): Promise<ContainerRuntimeSetupState> {
  const existing = await readContainerRuntimeSetupState(statePath);
  const now = isoNow(options);
  const state: ContainerRuntimeSetupState = {
    ...existing,
    appVersion: options.appVersion,
    lastCheckedAt: now,
    lastStatus: result.status,
    ...(result.runtime ? { lastRuntime: result.runtime } : {}),
    lastMessage: result.message,
  };
  if (state.upgradeReconciledAppVersion !== options.appVersion) {
    state.upgradeReconciledAppVersion = options.appVersion;
    state.upgradeReconciledAt = now;
  }
  if (result.status === "ready") {
    state.userDecision = "none";
    delete state.decisionAppVersion;
    delete state.decisionAt;
    delete state.installActionId;
    delete state.installRuntime;
    delete state.installUrl;
  }
  await writeContainerRuntimeSetupState(statePath, state);
  return state;
}

export async function recordContainerRuntimeDeferred(
  statePath: string,
  options: ContainerRuntimeSetupClock & { appVersion: string },
): Promise<ContainerRuntimeSetupState> {
  const existing = await readContainerRuntimeSetupState(statePath);
  const state: ContainerRuntimeSetupState = {
    ...existing,
    appVersion: options.appVersion,
    userDecision: "deferred",
    decisionAppVersion: options.appVersion,
    decisionAt: isoNow(options),
  };
  await writeContainerRuntimeSetupState(statePath, state);
  return state;
}

export async function recordContainerRuntimeInstallLaunched(
  statePath: string,
  action: ContainerRuntimeInstallAction,
  options: ContainerRuntimeSetupClock & { appVersion: string },
): Promise<ContainerRuntimeSetupState> {
  const existing = await readContainerRuntimeSetupState(statePath);
  const state: ContainerRuntimeSetupState = {
    ...existing,
    appVersion: options.appVersion,
    userDecision: "install-launched",
    decisionAppVersion: options.appVersion,
    decisionAt: isoNow(options),
    installActionId: action.id,
    installRuntime: action.runtime,
    installUrl: action.url,
  };
  await writeContainerRuntimeSetupState(statePath, state);
  return state;
}

export function containerRuntimeSetupPromptState(
  result: ContainerRuntimeProbeResult,
  state: ContainerRuntimeSetupState,
): ContainerRuntimeSetupPromptState {
  if (result.status === "ready") return promptState(state, false, false, "runtime-ready");
  if (result.status === "unsupported" && result.nextAction === "repair-toolhive") {
    return promptState(state, false, false, "toolhive-needs-repair");
  }
  if (result.status !== "missing") return promptState(state, false, false, "runtime-not-missing");
  if (state.userDecision === "deferred") return promptState(state, false, true, "user-deferred");
  if (state.userDecision === "install-launched") return promptState(state, false, true, "install-launched");
  return promptState(state, true, false, "runtime-missing");
}

function promptState(
  state: ContainerRuntimeSetupState,
  shouldPrompt: boolean,
  promptSuppressed: boolean,
  reason: ContainerRuntimeSetupPromptState["reason"],
): ContainerRuntimeSetupPromptState {
  return {
    userDecision: state.userDecision,
    shouldPrompt,
    promptSuppressed,
    reason,
    ...(state.decisionAt ? { lastDecisionAt: state.decisionAt } : {}),
    ...(state.userDecision === "install-launched" && state.installActionId ? { installActionId: state.installActionId } : {}),
    ...(state.userDecision === "install-launched" && state.installRuntime ? { installRuntime: state.installRuntime } : {}),
    ...(state.userDecision === "install-launched" && state.installUrl ? { installUrl: state.installUrl } : {}),
    ...(state.upgradeReconciledAppVersion ? { upgradeReconciledAppVersion: state.upgradeReconciledAppVersion } : {}),
  };
}

async function writeContainerRuntimeSetupState(statePath: string, state: ContainerRuntimeSetupState): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(normalizeContainerRuntimeSetupState(state), null, 2)}\n`, "utf8");
  await rename(tmpPath, statePath);
}

function defaultContainerRuntimeSetupState(): ContainerRuntimeSetupState {
  return {
    schemaVersion: "ambient-container-runtime-setup-state-v1",
    userDecision: "none",
  };
}

function normalizeContainerRuntimeSetupState(raw: unknown): ContainerRuntimeSetupState {
  if (!raw || typeof raw !== "object") return defaultContainerRuntimeSetupState();
  const value = raw as Record<string, unknown>;
  const decision = value.userDecision === "deferred" || value.userDecision === "install-launched" ? value.userDecision : "none";
  const status = typeof value.lastStatus === "string" && isRuntimeProbeStatus(value.lastStatus) ? value.lastStatus : undefined;
  return {
    schemaVersion: "ambient-container-runtime-setup-state-v1",
    ...(stringValue(value.appVersion) ? { appVersion: stringValue(value.appVersion) } : {}),
    ...(stringValue(value.upgradeReconciledAppVersion) ? { upgradeReconciledAppVersion: stringValue(value.upgradeReconciledAppVersion) } : {}),
    ...(stringValue(value.upgradeReconciledAt) ? { upgradeReconciledAt: stringValue(value.upgradeReconciledAt) } : {}),
    ...(stringValue(value.lastCheckedAt) ? { lastCheckedAt: stringValue(value.lastCheckedAt) } : {}),
    ...(status ? { lastStatus: status } : {}),
    ...(stringValue(value.lastRuntime) ? { lastRuntime: stringValue(value.lastRuntime) } : {}),
    ...(stringValue(value.lastMessage) ? { lastMessage: stringValue(value.lastMessage) } : {}),
    userDecision: decision,
    ...(stringValue(value.decisionAppVersion) ? { decisionAppVersion: stringValue(value.decisionAppVersion) } : {}),
    ...(stringValue(value.decisionAt) ? { decisionAt: stringValue(value.decisionAt) } : {}),
    ...(stringValue(value.installActionId) ? { installActionId: stringValue(value.installActionId) } : {}),
    ...(stringValue(value.installRuntime) ? { installRuntime: stringValue(value.installRuntime) } : {}),
    ...(stringValue(value.installUrl) ? { installUrl: stringValue(value.installUrl) } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRuntimeProbeStatus(value: string): value is ContainerRuntimeProbeStatus {
  return value === "ready" || value === "installed-not-running" || value === "missing" || value === "unsupported" || value === "blocked-by-permissions" || value === "blocked-by-policy";
}

function isoNow(options: ContainerRuntimeSetupClock): string {
  return (options.now ?? (() => new Date()))().toISOString();
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

function isMalformedJsonError(error: unknown): boolean {
  return error instanceof SyntaxError;
}
