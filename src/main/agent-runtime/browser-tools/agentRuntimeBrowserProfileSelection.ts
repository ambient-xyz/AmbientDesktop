import type { BrowserCapabilityState, BrowserProfileMode, BrowserRuntimeKind } from "../../../shared/types";
import { selectAgentBrowserRuntime } from "../../agentBrowserRuntime";
import { browserToolUpdate } from "./agentRuntimeBrowserToolFormatting";

export interface AgentRuntimeBrowserProfileSelectionDeps {
  getBrowserState: () => Promise<BrowserCapabilityState>;
  copyChromeProfile: () => Promise<BrowserCapabilityState>;
  emitBrowserState: () => Promise<void>;
  recordBrowserProfileAudit: (detail: string) => void;
}

export interface AgentRuntimeBrowserProfileSelectionInput {
  input: Record<string, unknown>;
  onUpdate?: (update: ReturnType<typeof browserToolUpdate>) => void;
}

export async function prepareAgentRuntimeBrowserToolProfile(
  input: AgentRuntimeBrowserProfileSelectionInput,
  deps: AgentRuntimeBrowserProfileSelectionDeps,
): Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }> {
  const requestedProfileMode = isBrowserProfileMode(input.input.profileMode) ? input.input.profileMode : undefined;
  const requestedRuntime = isBrowserRuntimeKind(input.input.runtime) ? input.input.runtime : undefined;
  if (requestedProfileMode) {
    input.onUpdate?.(browserToolUpdate("browser_profile", `Using requested ${requestedProfileMode} browser profile mode.`));
  }

  const state = await deps.getBrowserState().catch(() => undefined);
  const selection = selectAgentBrowserRuntime({
    requestedProfileMode,
    requestedRuntime,
    browserState: state,
    allowInternalRuntime: input.input.allowInternalRuntime === true,
  });
  if (!requestedProfileMode && state?.running && state.runtime === "internal" && selection.runtime === "chrome") {
    input.onUpdate?.(browserToolUpdate("browser_profile", "Using managed Chrome for agent browser work; the internal browser is reserved for explicit preview/user actions."));
  }
  if (selection.reason === "default-isolated-managed-chrome") {
    input.onUpdate?.(browserToolUpdate("browser_profile", "Using isolated managed Chrome profile for agent browser work."));
    return { profileMode: selection.profileMode, runtime: selection.runtime };
  }

  if (selection.shouldCopyProfile) {
    input.onUpdate?.(browserToolUpdate("browser_profile", "Copying Chrome profile for default browser access."));
    const copied = await deps.copyChromeProfile();
    deps.recordBrowserProfileAudit(
      [
        `Source: ${copied.copiedProfileSourcePath ?? copied.sourceProfilePath ?? state?.sourceProfilePath ?? "unknown"}`,
        `Copy: ${copied.copiedProfilePath ?? "Ambient browser copied profile"}`,
      ].join("\n"),
    );
    await deps.emitBrowserState();
  }
  return { profileMode: selection.profileMode, runtime: selection.runtime };
}

export function isBrowserProfileMode(value: unknown): value is BrowserProfileMode {
  return value === "isolated" || value === "copied";
}

function isBrowserRuntimeKind(value: unknown): value is BrowserRuntimeKind {
  return value === "internal" || value === "chrome";
}
