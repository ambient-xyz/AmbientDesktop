import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AmbientMcpInstalledServerSummary,
  AmbientMcpInstallPreview,
  AmbientMcpServerSearchResult,
  ManagedDevServerSummary,
} from "../../shared/pluginTypes";
import { createRightPanelMcpServerActions } from "./RightPanelMcpServerActions";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

describe("RightPanelMcpServerActions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches registry servers with a trimmed query and updates status", async () => {
    const results = [mcpServerSearchResult({ serverId: "context7", title: "Context7" })];
    const ambientDesktop = {
      searchMcpRegistryServers: vi.fn(async () => results),
    };
    vi.stubGlobal("window", { ambientDesktop });
    const registryResults = stateCell<AmbientMcpServerSearchResult[]>([]);
    const serverBusy = stateCell<string | undefined>(undefined);
    const serverStatus = stateCell<ApiKeyStatus | undefined>(undefined);
    const serverError = stateCell<string | undefined>("previous error");

    const actions = createRightPanelMcpServerActions({
      serverQuery: "  context7  ",
      setRegistryResults: registryResults.set,
      setInstalledServers: stateCell<AmbientMcpInstalledServerSummary[]>([]).set,
      setSelectedPreview: stateCell<AmbientMcpInstallPreview | undefined>(undefined).set,
      setServerBusy: serverBusy.set,
      setServerStatus: serverStatus.set,
      setServerError: serverError.set,
      setManagedDevServers: stateCell<ManagedDevServerSummary[]>([]).set,
      setManagedDevServerBusy: stateCell<string | undefined>(undefined).set,
      setManagedDevServerError: stateCell<string | undefined>(undefined).set,
      refreshContainerRuntimeStatus: async () => undefined,
    });

    await actions.searchRegistryServers(true);

    expect(ambientDesktop.searchMcpRegistryServers).toHaveBeenCalledWith({
      query: "context7",
      limit: 25,
      refresh: true,
    });
    expect(registryResults.current).toBe(results);
    expect(serverStatus.current).toEqual({ kind: "info", message: "Found 1 ToolHive registry server." });
    expect(serverError.current).toBeUndefined();
    expect(serverBusy.current).toBeUndefined();
  });
});

function mcpServerSearchResult(overrides: Partial<AmbientMcpServerSearchResult> = {}): AmbientMcpServerSearchResult {
  return {
    serverId: "server",
    title: "Server",
    description: "Test server",
    tags: [],
    tools: [],
    installed: false,
    riskHints: [],
    ...overrides,
  };
}

function stateCell<T>(initial: T): { readonly current: T; set: Dispatch<SetStateAction<T>> } {
  let current = initial;
  return {
    get current() {
      return current;
    },
    set(next) {
      current = typeof next === "function" ? (next as (currentValue: T) => T)(current) : next;
    },
  };
}
