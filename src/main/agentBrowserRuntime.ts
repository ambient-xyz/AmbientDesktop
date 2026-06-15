import type { BrowserCapabilityState, BrowserProfileMode, BrowserRuntimeKind, BrowserUserActionState } from "../shared/types";
import { BrowserUnavailableError, BrowserUserActionCanceledError, BrowserUserActionTimedOutError } from "./browserService";

export interface BrowserUnavailableFallback {
  unavailable: true;
  message: string;
}

export interface BrowserToolRecoverableError {
  toolError: true;
  message: string;
}

export interface AgentBrowserRuntimeSelection {
  profileMode: BrowserProfileMode;
  runtime: BrowserRuntimeKind;
  shouldCopyProfile: boolean;
  reason?: string;
}

export interface AgentBrowserRuntimeSelectionInput {
  requestedProfileMode?: BrowserProfileMode;
  requestedRuntime?: BrowserRuntimeKind;
  browserState?: Pick<
    BrowserCapabilityState,
    "running" | "runtime" | "profileMode" | "copiedProfileAvailable" | "chromeAvailable" | "sourceProfilePath" | "internalAvailable"
  >;
  allowInternalRuntime?: boolean;
}

export function selectAgentBrowserRuntime(input: AgentBrowserRuntimeSelectionInput = {}): AgentBrowserRuntimeSelection {
  const state = input.browserState;
  const requestedProfileMode = input.requestedProfileMode;
  if (input.allowInternalRuntime && input.requestedRuntime === "internal" && state?.internalAvailable !== false && requestedProfileMode !== "copied") {
    return {
      profileMode: "isolated",
      runtime: "internal",
      shouldCopyProfile: false,
      reason: "explicit-internal-runtime",
    };
  }

  if (
    input.allowInternalRuntime &&
    !requestedProfileMode &&
    !input.requestedRuntime &&
    state?.running &&
    state.runtime === "internal" &&
    state.internalAvailable !== false
  ) {
    return {
      profileMode: "isolated",
      runtime: "internal",
      shouldCopyProfile: false,
      reason: "reuse-running-internal-preview",
    };
  }

  if (!requestedProfileMode && state?.running && state.runtime === "chrome" && state.profileMode === "isolated") {
    return {
      profileMode: state.profileMode,
      runtime: "chrome",
      shouldCopyProfile: false,
      reason: "reuse-running-managed-chrome",
    };
  }

  if (requestedProfileMode === "isolated") {
    return {
      profileMode: "isolated",
      runtime: "chrome",
      shouldCopyProfile: false,
      reason: "requested-isolated-profile",
    };
  }

  if (requestedProfileMode === "copied") {
    return {
      profileMode: "copied",
      runtime: "chrome",
      shouldCopyProfile: !state?.copiedProfileAvailable,
      reason: "requested-copied-profile",
    };
  }

  return {
    profileMode: "isolated",
    runtime: "chrome",
    shouldCopyProfile: false,
    reason: "default-isolated-managed-chrome",
  };
}

export function browserRuntimeForAgentProfile(profileMode: BrowserProfileMode): BrowserRuntimeKind | undefined {
  return selectAgentBrowserRuntime({ requestedProfileMode: profileMode }).runtime;
}

export function browserToolFallback(error: unknown): BrowserUserActionState | BrowserUnavailableFallback {
  if (error instanceof BrowserUserActionCanceledError || error instanceof BrowserUserActionTimedOutError) throw error;
  if (error instanceof BrowserUnavailableError) return { unavailable: true, message: error.message };
  throw error;
}

export function browserToolRecoverableFailure(error: unknown): BrowserUnavailableFallback | BrowserToolRecoverableError {
  if (error instanceof BrowserUserActionCanceledError || error instanceof BrowserUserActionTimedOutError) throw error;
  if (error instanceof BrowserUnavailableError) return { unavailable: true, message: error.message };
  return { toolError: true, message: error instanceof Error ? error.message : String(error) };
}

export function isBrowserUnavailableFallback(value: unknown): value is BrowserUnavailableFallback {
  return Boolean(value && typeof value === "object" && "unavailable" in value && (value as BrowserUnavailableFallback).unavailable === true);
}

export function isBrowserToolRecoverableError(value: unknown): value is BrowserToolRecoverableError {
  return Boolean(value && typeof value === "object" && "toolError" in value && (value as BrowserToolRecoverableError).toolError === true);
}

export function isBrowserUserActionState(value: unknown): value is BrowserUserActionState {
  return Boolean(value && typeof value === "object" && "kind" in value && "status" in value);
}

export function browserUnavailableText(state: BrowserUnavailableFallback): string {
  return [
    "Browser unavailable.",
    `Reason: ${state.message}`,
    "Install Chrome/Chromium or set AMBIENT_BROWSER_CHROME_PATH to a Chrome executable.",
  ].join("\n");
}
