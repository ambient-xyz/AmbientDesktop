import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AmbientMcpContainerRuntimeInstallLaunchInput,
  AmbientMcpContainerRuntimeInstallLaunchResult,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpInstalledServerSummary,
  AmbientMcpInstallPreview,
  AmbientMcpServerDescribeInput,
  AmbientMcpServerInstallInput,
  AmbientMcpServerInstallResult,
  AmbientMcpServerSearchInput,
  AmbientMcpServerSearchResult,
  AmbientMcpServerUninstallInput,
  AmbientMcpServerUninstallResult,
  AmbientMcpToolReviewAcceptInput,
  AmbientMcpToolReviewAcceptResult,
} from "../../shared/pluginTypes";
import {
  mcpContainerRuntimeDeferIpcChannels,
  mcpContainerRuntimeLaunchInstallIpcChannels,
  mcpContainerRuntimeStatusIpcChannels,
  mcpDefaultCapabilityInstallIpcChannels,
  mcpInstalledListIpcChannels,
  mcpRegistryDescribeIpcChannels,
  mcpRegistryInstallIpcChannels,
  mcpRegistrySearchIpcChannels,
  mcpServerUninstallIpcChannels,
  mcpToolReviewAcceptIpcChannels,
  registerMcpContainerRuntimeDeferIpc,
  registerMcpContainerRuntimeLaunchInstallIpc,
  registerMcpContainerRuntimeStatusIpc,
  registerMcpDefaultCapabilityInstallIpc,
  registerMcpInstalledListIpc,
  registerMcpRegistryDescribeIpc,
  registerMcpRegistryInstallIpc,
  registerMcpRegistrySearchIpc,
  registerMcpServerUninstallIpc,
  registerMcpToolReviewAcceptIpc,
  type RegisterMcpContainerRuntimeDeferIpcDependencies,
  type RegisterMcpContainerRuntimeLaunchInstallIpcDependencies,
  type RegisterMcpContainerRuntimeStatusIpcDependencies,
  type RegisterMcpDefaultCapabilityInstallIpcDependencies,
  type RegisterMcpInstalledListIpcDependencies,
  type RegisterMcpRegistryDescribeIpcDependencies,
  type RegisterMcpRegistryInstallIpcDependencies,
  type RegisterMcpRegistrySearchIpcDependencies,
  type RegisterMcpServerUninstallIpcDependencies,
  type RegisterMcpToolReviewAcceptIpcDependencies,
} from "./registerMcpIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerMcpRegistrySearchIpc", () => {
  it("registers the MCP registry search channel", () => {
    const { handlers } = registerRegistrySearchWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpRegistrySearchIpcChannels]);
  });

  it("searches registry servers with parsed input", async () => {
    const { deps, invoke, results } = registerRegistrySearchWithFakes();

    await expect(invoke("mcp:registry-search", { query: "browser", limit: 5, refresh: true, extra: true })).resolves.toEqual(results);

    expect(deps.searchRegistryServers).toHaveBeenCalledWith({
      query: "browser",
      limit: 5,
      refresh: true,
    });
  });

  it("uses an empty search input when none is provided", async () => {
    const { deps, invoke, results } = registerRegistrySearchWithFakes();

    await expect(invoke("mcp:registry-search")).resolves.toEqual(results);

    expect(deps.searchRegistryServers).toHaveBeenCalledWith({});
  });

  it("rejects invalid search input before calling the dependency", () => {
    const { deps, invoke } = registerRegistrySearchWithFakes();

    expect(() => invoke("mcp:registry-search", { limit: 0 })).toThrow();

    expect(deps.searchRegistryServers).not.toHaveBeenCalled();
  });

  it("propagates registry search errors", async () => {
    const error = new Error("registry search unavailable");
    const { deps, invoke } = registerRegistrySearchWithFakes({ error });

    await expect(invoke("mcp:registry-search", { query: "browser" })).rejects.toThrow("registry search unavailable");

    expect(deps.searchRegistryServers).toHaveBeenCalledWith({ query: "browser" });
  });
});

describe("registerMcpRegistryDescribeIpc", () => {
  it("registers the MCP registry describe channel", () => {
    const { handlers } = registerRegistryDescribeWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpRegistryDescribeIpcChannels]);
  });

  it("describes registry servers with parsed input", async () => {
    const { deps, invoke, preview } = registerRegistryDescribeWithFakes();

    await expect(invoke("mcp:registry-describe", {
      serverId: "browser-tools",
      refresh: true,
      secretBindings: [{ envName: "TOKEN", secretRef: "secret-ref" }],
      extra: true,
    })).resolves.toEqual(preview);

    expect(deps.describeRegistryServer).toHaveBeenCalledWith({
      serverId: "browser-tools",
      refresh: true,
      secretBindings: [{ envName: "TOKEN", secretRef: "secret-ref" }],
    });
  });

  it("rejects invalid describe input before calling the dependency", () => {
    const { deps, invoke } = registerRegistryDescribeWithFakes();

    expect(() => invoke("mcp:registry-describe", { serverId: "" })).toThrow();

    expect(deps.describeRegistryServer).not.toHaveBeenCalled();
  });

  it("propagates registry describe errors", async () => {
    const error = new Error("registry describe unavailable");
    const { deps, invoke } = registerRegistryDescribeWithFakes({ error });

    await expect(invoke("mcp:registry-describe", { serverId: "browser-tools" })).rejects.toThrow("registry describe unavailable");

    expect(deps.describeRegistryServer).toHaveBeenCalledWith({ serverId: "browser-tools" });
  });
});

describe("registerMcpInstalledListIpc", () => {
  it("registers the MCP installed list channel", () => {
    const { handlers } = registerInstalledListWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpInstalledListIpcChannels]);
  });

  it("lists installed MCP servers", async () => {
    const { deps, installed, invoke } = registerInstalledListWithFakes();

    await expect(invoke("mcp:installed-list")).resolves.toEqual(installed);

    expect(deps.listInstalledServers).toHaveBeenCalledOnce();
  });

  it("propagates installed list errors", async () => {
    const error = new Error("installed servers unavailable");
    const { deps, invoke } = registerInstalledListWithFakes({ error });

    await expect(invoke("mcp:installed-list")).rejects.toThrow("installed servers unavailable");

    expect(deps.listInstalledServers).toHaveBeenCalledOnce();
  });
});

describe("registerMcpContainerRuntimeStatusIpc", () => {
  it("registers the MCP container runtime status channel", () => {
    const { handlers } = registerContainerRuntimeStatusWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpContainerRuntimeStatusIpcChannels]);
  });

  it("probes the MCP container runtime status", async () => {
    const { deps, invoke, status } = registerContainerRuntimeStatusWithFakes();

    await expect(invoke("mcp:container-runtime-status")).resolves.toEqual(status);

    expect(deps.probeContainerRuntimeStatus).toHaveBeenCalledOnce();
  });

  it("propagates container runtime status errors", async () => {
    const error = new Error("container runtime probe unavailable");
    const { deps, invoke } = registerContainerRuntimeStatusWithFakes({ error });

    await expect(invoke("mcp:container-runtime-status")).rejects.toThrow("container runtime probe unavailable");

    expect(deps.probeContainerRuntimeStatus).toHaveBeenCalledOnce();
  });
});

describe("registerMcpContainerRuntimeLaunchInstallIpc", () => {
  it("registers the MCP container runtime launch install channel", () => {
    const { handlers } = registerContainerRuntimeLaunchInstallWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpContainerRuntimeLaunchInstallIpcChannels]);
  });

  it("launches container runtime installation with parsed input", async () => {
    const { deps, invoke, result } = registerContainerRuntimeLaunchInstallWithFakes();

    await expect(invoke("mcp:container-runtime-launch-install", {
      actionId: "install-docker",
      mode: "dry-run",
      extra: true,
    })).resolves.toEqual(result);

    expect(deps.launchContainerRuntimeInstall).toHaveBeenCalledWith({
      actionId: "install-docker",
      mode: "dry-run",
    });
  });

  it("uses an empty launch input when none is provided", async () => {
    const { deps, invoke, result } = registerContainerRuntimeLaunchInstallWithFakes();

    await expect(invoke("mcp:container-runtime-launch-install")).resolves.toEqual(result);

    expect(deps.launchContainerRuntimeInstall).toHaveBeenCalledWith({});
  });

  it("rejects invalid launch input before calling the dependency", () => {
    const { deps, invoke } = registerContainerRuntimeLaunchInstallWithFakes();

    expect(() => invoke("mcp:container-runtime-launch-install", { mode: "later" })).toThrow();

    expect(deps.launchContainerRuntimeInstall).not.toHaveBeenCalled();
  });

  it("propagates container runtime launch install errors", async () => {
    const error = new Error("container runtime install unavailable");
    const { deps, invoke } = registerContainerRuntimeLaunchInstallWithFakes({ error });

    await expect(invoke("mcp:container-runtime-launch-install", { actionId: "install-docker" })).rejects.toThrow(
      "container runtime install unavailable",
    );

    expect(deps.launchContainerRuntimeInstall).toHaveBeenCalledWith({ actionId: "install-docker" });
  });
});

describe("registerMcpContainerRuntimeDeferIpc", () => {
  it("registers the MCP container runtime defer channel", () => {
    const { handlers } = registerContainerRuntimeDeferWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpContainerRuntimeDeferIpcChannels]);
  });

  it("defers MCP container runtime setup", async () => {
    const { deps, invoke, status } = registerContainerRuntimeDeferWithFakes();

    await expect(invoke("mcp:container-runtime-defer")).resolves.toEqual(status);

    expect(deps.deferContainerRuntimeSetup).toHaveBeenCalledOnce();
  });

  it("propagates container runtime defer errors", async () => {
    const error = new Error("container runtime defer unavailable");
    const { deps, invoke } = registerContainerRuntimeDeferWithFakes({ error });

    await expect(invoke("mcp:container-runtime-defer")).rejects.toThrow("container runtime defer unavailable");

    expect(deps.deferContainerRuntimeSetup).toHaveBeenCalledOnce();
  });
});

describe("registerMcpDefaultCapabilityInstallIpc", () => {
  it("registers the MCP default capability install channel", () => {
    const { handlers } = registerDefaultCapabilityInstallWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpDefaultCapabilityInstallIpcChannels]);
  });

  it("installs the default MCP capability with parsed input", async () => {
    const { deps, invoke, result } = registerDefaultCapabilityInstallWithFakes();

    await expect(invoke("mcp:default-capability-install", {
      capabilityId: "scrapling",
      extra: true,
    })).resolves.toEqual(result);

    expect(deps.installDefaultCapability).toHaveBeenCalledWith({ capabilityId: "scrapling" });
  });

  it("rejects invalid default capability install input before calling the dependency", () => {
    const { deps, invoke } = registerDefaultCapabilityInstallWithFakes();

    expect(() => invoke("mcp:default-capability-install", { capabilityId: "other" })).toThrow();

    expect(deps.installDefaultCapability).not.toHaveBeenCalled();
  });

  it("propagates default capability install errors", async () => {
    const error = new Error("default capability install unavailable");
    const { deps, invoke } = registerDefaultCapabilityInstallWithFakes({ error });

    await expect(invoke("mcp:default-capability-install", { capabilityId: "scrapling" })).rejects.toThrow(
      "default capability install unavailable",
    );

    expect(deps.installDefaultCapability).toHaveBeenCalledWith({ capabilityId: "scrapling" });
  });
});

describe("registerMcpRegistryInstallIpc", () => {
  it("registers the MCP registry install channel", () => {
    const { handlers } = registerRegistryInstallWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpRegistryInstallIpcChannels]);
  });

  it("installs registry servers with parsed input", async () => {
    const { deps, invoke, result } = registerRegistryInstallWithFakes();

    await expect(invoke("mcp:registry-install", {
      serverId: "browser-tools",
      refresh: true,
      secretBindings: [{ envName: "TOKEN", secretRef: "secret-ref" }],
      extra: true,
    })).resolves.toEqual(result);

    expect(deps.installRegistryServer).toHaveBeenCalledWith({
      serverId: "browser-tools",
      refresh: true,
      secretBindings: [{ envName: "TOKEN", secretRef: "secret-ref" }],
    });
  });

  it("rejects invalid registry install input before calling the dependency", () => {
    const { deps, invoke } = registerRegistryInstallWithFakes();

    expect(() => invoke("mcp:registry-install", { serverId: "" })).toThrow();

    expect(deps.installRegistryServer).not.toHaveBeenCalled();
  });

  it("propagates registry install errors", async () => {
    const error = new Error("registry install unavailable");
    const { deps, invoke } = registerRegistryInstallWithFakes({ error });

    await expect(invoke("mcp:registry-install", { serverId: "browser-tools" })).rejects.toThrow("registry install unavailable");

    expect(deps.installRegistryServer).toHaveBeenCalledWith({ serverId: "browser-tools" });
  });
});

describe("registerMcpServerUninstallIpc", () => {
  it("registers the MCP server uninstall channel", () => {
    const { handlers } = registerServerUninstallWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpServerUninstallIpcChannels]);
  });

  it("uninstalls MCP servers with parsed input", async () => {
    const { deps, invoke, result } = registerServerUninstallWithFakes();

    await expect(invoke("mcp:server-uninstall", {
      serverId: "browser-tools",
      workloadName: "browser-tools-workload",
      extra: true,
    })).resolves.toEqual(result);

    expect(deps.uninstallServer).toHaveBeenCalledWith({
      serverId: "browser-tools",
      workloadName: "browser-tools-workload",
    });
  });

  it("rejects invalid uninstall input before calling the dependency", () => {
    const { deps, invoke } = registerServerUninstallWithFakes();

    expect(() => invoke("mcp:server-uninstall", {})).toThrow();

    expect(deps.uninstallServer).not.toHaveBeenCalled();
  });

  it("propagates uninstall errors", async () => {
    const error = new Error("server uninstall unavailable");
    const { deps, invoke } = registerServerUninstallWithFakes({ error });

    await expect(invoke("mcp:server-uninstall", { workloadName: "browser-tools-workload" })).rejects.toThrow(
      "server uninstall unavailable",
    );

    expect(deps.uninstallServer).toHaveBeenCalledWith({ workloadName: "browser-tools-workload" });
  });
});

describe("registerMcpToolReviewAcceptIpc", () => {
  it("registers the MCP tool review accept channel", () => {
    const { handlers } = registerToolReviewAcceptWithFakes();

    expect([...handlers.keys()]).toEqual([...mcpToolReviewAcceptIpcChannels]);
  });

  it("accepts MCP tool reviews with parsed input", async () => {
    const { deps, invoke, result } = registerToolReviewAcceptWithFakes();

    await expect(invoke("mcp:tool-review-accept", {
      serverId: "browser-tools",
      workloadName: "browser-tools-workload",
      expectedDescriptorHash: "descriptor-hash",
      extra: true,
    })).resolves.toEqual(result);

    expect(deps.acceptToolReview).toHaveBeenCalledWith({
      serverId: "browser-tools",
      workloadName: "browser-tools-workload",
      expectedDescriptorHash: "descriptor-hash",
    });
  });

  it("rejects invalid tool review input before calling the dependency", () => {
    const { deps, invoke } = registerToolReviewAcceptWithFakes();

    expect(() => invoke("mcp:tool-review-accept", {})).toThrow();

    expect(deps.acceptToolReview).not.toHaveBeenCalled();
  });

  it("propagates tool review accept errors", async () => {
    const error = new Error("tool review accept unavailable");
    const { deps, invoke } = registerToolReviewAcceptWithFakes({ error });

    await expect(invoke("mcp:tool-review-accept", { serverId: "browser-tools" })).rejects.toThrow(
      "tool review accept unavailable",
    );

    expect(deps.acceptToolReview).toHaveBeenCalledWith({ serverId: "browser-tools" });
  });
});

function registerRegistrySearchWithFakes({
  results = sampleMcpSearchResults(),
  error,
}: {
  results?: AmbientMcpServerSearchResult[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    searchRegistryServers: vi.fn(async (_input: AmbientMcpServerSearchInput) => {
      if (error) throw error;
      return results;
    }),
  } satisfies RegisterMcpRegistrySearchIpcDependencies;
  registerMcpRegistrySearchIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    results,
  };
}

function registerRegistryDescribeWithFakes({
  preview = sampleMcpInstallPreview(),
  error,
}: {
  preview?: AmbientMcpInstallPreview;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    describeRegistryServer: vi.fn(async (_input: AmbientMcpServerDescribeInput) => {
      if (error) throw error;
      return preview;
    }),
  } satisfies RegisterMcpRegistryDescribeIpcDependencies;
  registerMcpRegistryDescribeIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    preview,
  };
}

function registerInstalledListWithFakes({
  installed = sampleInstalledServers(),
  error,
}: {
  installed?: AmbientMcpInstalledServerSummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    listInstalledServers: vi.fn(async () => {
      if (error) throw error;
      return installed;
    }),
  } satisfies RegisterMcpInstalledListIpcDependencies;
  registerMcpInstalledListIpc(deps);

  return {
    deps,
    handlers,
    installed,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerContainerRuntimeStatusWithFakes({
  status = sampleContainerRuntimeStatus(),
  error,
}: {
  status?: AmbientMcpContainerRuntimeStatus;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    probeContainerRuntimeStatus: vi.fn(async () => {
      if (error) throw error;
      return status;
    }),
  } satisfies RegisterMcpContainerRuntimeStatusIpcDependencies;
  registerMcpContainerRuntimeStatusIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
    status,
  };
}

function registerContainerRuntimeLaunchInstallWithFakes({
  result = sampleContainerRuntimeInstallLaunchResult(),
  error,
}: {
  result?: AmbientMcpContainerRuntimeInstallLaunchResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    launchContainerRuntimeInstall: vi.fn(async (_input: AmbientMcpContainerRuntimeInstallLaunchInput) => {
      if (error) throw error;
      return result;
    }),
  } satisfies RegisterMcpContainerRuntimeLaunchInstallIpcDependencies;
  registerMcpContainerRuntimeLaunchInstallIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    result,
  };
}

function registerContainerRuntimeDeferWithFakes({
  status = sampleContainerRuntimeStatus(),
  error,
}: {
  status?: AmbientMcpContainerRuntimeStatus;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    deferContainerRuntimeSetup: vi.fn(async () => {
      if (error) throw error;
      return status;
    }),
  } satisfies RegisterMcpContainerRuntimeDeferIpcDependencies;
  registerMcpContainerRuntimeDeferIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
    status,
  };
}

function registerDefaultCapabilityInstallWithFakes({
  result = sampleMcpServerInstallResult(),
  error,
}: {
  result?: AmbientMcpServerInstallResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    installDefaultCapability: vi.fn(async (_input: AmbientMcpDefaultCapabilityInstallInput) => {
      if (error) throw error;
      return result;
    }),
  } satisfies RegisterMcpDefaultCapabilityInstallIpcDependencies;
  registerMcpDefaultCapabilityInstallIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    result,
  };
}

function registerRegistryInstallWithFakes({
  result = sampleMcpServerInstallResult(),
  error,
}: {
  result?: AmbientMcpServerInstallResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    installRegistryServer: vi.fn(async (_input: AmbientMcpServerInstallInput) => {
      if (error) throw error;
      return result;
    }),
  } satisfies RegisterMcpRegistryInstallIpcDependencies;
  registerMcpRegistryInstallIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    result,
  };
}

function registerServerUninstallWithFakes({
  result = sampleMcpServerUninstallResult(),
  error,
}: {
  result?: AmbientMcpServerUninstallResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    uninstallServer: vi.fn(async (_input: AmbientMcpServerUninstallInput) => {
      if (error) throw error;
      return result;
    }),
  } satisfies RegisterMcpServerUninstallIpcDependencies;
  registerMcpServerUninstallIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    result,
  };
}

function registerToolReviewAcceptWithFakes({
  result = sampleMcpToolReviewAcceptResult(),
  error,
}: {
  result?: AmbientMcpToolReviewAcceptResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    acceptToolReview: vi.fn(async (_input: AmbientMcpToolReviewAcceptInput) => {
      if (error) throw error;
      return result;
    }),
  } satisfies RegisterMcpToolReviewAcceptIpcDependencies;
  registerMcpToolReviewAcceptIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    result,
  };
}

function sampleMcpSearchResults(): AmbientMcpServerSearchResult[] {
  return [
    {
      serverId: "browser-tools",
      title: "Browser Tools",
      description: "Browser automation tools",
      tags: ["browser"],
      tools: ["open_page"],
      installed: false,
      riskHints: [],
    },
  ];
}

function sampleContainerRuntimeStatus(): AmbientMcpContainerRuntimeStatus {
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: "ready",
    runtime: "docker",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-06-04T12:00:00.000Z",
    durationMs: 42,
    message: "Container runtime ready",
    nextAction: "none",
    toolHive: {
      status: "ready",
      message: "ToolHive ready",
      preflightOk: true,
      versionLine: "toolhive 1.0.0",
    },
    hosts: [
      {
        kind: "docker",
        status: "ready",
        version: "26.0.0",
        message: "Docker ready",
      },
    ],
    setup: {
      userDecision: "none",
      shouldPrompt: false,
      promptSuppressed: false,
      reason: "runtime-ready",
    },
    postInstallQueue: [],
    defaultCapabilities: [],
  };
}

function sampleContainerRuntimeInstallLaunchResult(): AmbientMcpContainerRuntimeInstallLaunchResult {
  const action = {
    id: "install-docker",
    label: "Install Docker",
    kind: "open-installer" as const,
    runtime: "docker" as const,
    url: "https://example.com/docker",
    reason: "Docker is required for isolated MCP servers.",
  };
  return {
    schemaVersion: "ambient-container-runtime-install-launch-v1",
    launched: true,
    action,
    plan: {
      schemaVersion: "ambient-container-runtime-install-plan-v1",
      platform: "darwin",
      arch: "arm64",
      status: "missing",
      preferredRuntime: "docker",
      summary: "Install Docker",
      primaryAction: action,
      alternatives: [],
      prerequisites: [],
      warnings: [],
      postInstallSteps: [],
    },
    message: "Container runtime install launched.",
  };
}

function sampleMcpServerInstallResult(): AmbientMcpServerInstallResult {
  return {
    status: "installed",
    serverId: "scrapling",
    workloadName: "scrapling-workload",
    message: "Scrapling installed.",
  };
}

function sampleMcpServerUninstallResult(): AmbientMcpServerUninstallResult {
  return {
    status: "removed",
    serverId: "browser-tools",
    workloadName: "browser-tools-workload",
    message: "Browser tools removed.",
    installed: sampleInstalledServers(),
  };
}

function sampleMcpToolReviewAcceptResult(): AmbientMcpToolReviewAcceptResult {
  return {
    status: "trusted",
    serverId: "browser-tools",
    workloadName: "browser-tools-workload",
    message: "Tool descriptors trusted.",
    descriptorHash: "descriptor-hash",
    installed: sampleInstalledServers(),
  };
}

function sampleMcpInstallPreview(): AmbientMcpInstallPreview {
  return {
    serverId: "browser-tools",
    title: "Browser Tools",
    summary: "Browser automation tools",
    sourceSummary: "Registry source",
    runtimeSummary: "Container runtime",
    permissionSummary: "Workspace permissions",
    secretSummary: "No secrets required",
    validationSummary: "Ready to install",
    blockers: [],
    warnings: [],
    riskLevel: "low",
    riskReasons: [],
    permissionProfile: {
      path: "/tmp/profile.json",
      sha256: "profile-sha",
    },
    expectedTools: ["open_page"],
    reviewText: "Review browser tools",
  };
}

function sampleInstalledServers(): AmbientMcpInstalledServerSummary[] {
  return [
    {
      serverId: "browser-tools",
      workloadName: "browser-tools-workload",
      permissionProfilePath: "/tmp/profile.json",
      permissionProfileSha256: "profile-sha",
      createdAt: "2026-06-04T12:00:00.000Z",
      updatedAt: "2026-06-04T12:00:00.000Z",
      workloadStatus: "running",
    },
  ];
}
