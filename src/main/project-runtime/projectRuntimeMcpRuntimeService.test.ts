import { describe, expect, it, vi } from "vitest";
import type { PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import {
  createProjectRuntimeMcpRuntimeService,
  type ProjectRuntimeMcpRuntimeHost,
} from "./projectRuntimeMcpRuntimeService";

interface FakeHost extends ProjectRuntimeMcpRuntimeHost {
  id: string;
  restartPluginMcpRuntime: ReturnType<typeof vi.fn>;
  stopPluginMcpRuntime: ReturnType<typeof vi.fn>;
}

function createHost(
  id: string,
  snapshots: PluginMcpRuntimeSnapshot[] = [snapshot(`project-${id}`)],
  input: {
    restartSnapshots?: PluginMcpRuntimeSnapshot[] | undefined;
    stopSnapshots?: PluginMcpRuntimeSnapshot[] | undefined;
  } = {},
): FakeHost {
  const restartPluginMcpRuntime = vi.fn(async () => input.restartSnapshots);
  const stopPluginMcpRuntime = vi.fn(async () => input.stopSnapshots);
  return {
    id,
    restartPluginMcpRuntime,
    stopPluginMcpRuntime,
    runtime: {
      pluginMcpRuntimeSnapshots: () => snapshots,
      restartPluginMcpRuntime,
      stopPluginMcpRuntime,
    },
  };
}

function snapshot(key: string): PluginMcpRuntimeSnapshot {
  return {
    key,
    pluginId: `plugin-${key}`,
    pluginName: `Plugin ${key}`,
    pluginVersion: "1.0.0",
    pluginFingerprint: `fingerprint-${key}`,
    serverName: `server-${key}`,
    status: "ready",
    permissionMode: "workspace",
    workspacePath: `/workspace/${key}`,
    cwd: `/workspace/${key}`,
    args: [],
    envKeys: [],
    requestCount: 0,
  };
}

describe("createProjectRuntimeMcpRuntimeService", () => {
  it("lists global plugin snapshots before project runtime snapshots", () => {
    const firstHost = createHost("first", [snapshot("project-first-a"), snapshot("project-first-b")]);
    const secondHost = createHost("second", [snapshot("project-second")]);
    const service = createProjectRuntimeMcpRuntimeService({
      pluginMcpRuntimeSnapshots: () => [snapshot("global")],
      projectRuntimeHosts: () => [firstHost, secondHost],
    });

    expect(service.projectRuntimeMcpRuntimeSnapshots().map((runtime) => runtime.key)).toEqual([
      "project-first-a",
      "project-first-b",
      "project-second",
    ]);
    expect(service.allPluginMcpRuntimeSnapshots().map((runtime) => runtime.key)).toEqual([
      "global",
      "project-first-a",
      "project-first-b",
      "project-second",
    ]);
  });

  it("restarts the first project runtime that handles a key and returns refreshed global and project snapshots", async () => {
    const firstHost = createHost("first");
    const secondHost = createHost("second", [snapshot("project-second")], { restartSnapshots: [] });
    const service = createProjectRuntimeMcpRuntimeService({
      pluginMcpRuntimeSnapshots: () => [snapshot("global-current")],
      projectRuntimeHosts: () => [firstHost, secondHost],
    });

    await expect(service.restartProjectRuntimeMcpRuntime("runtime-key")).resolves.toEqual([
      snapshot("global-current"),
      snapshot("project-first"),
      snapshot("project-second"),
    ]);

    expect(firstHost.restartPluginMcpRuntime).toHaveBeenCalledWith("runtime-key");
    expect(secondHost.restartPluginMcpRuntime).toHaveBeenCalledWith("runtime-key");
    expect(firstHost.stopPluginMcpRuntime).not.toHaveBeenCalled();
  });

  it("stops the first project runtime that handles a key and returns refreshed global and project snapshots", async () => {
    const firstHost = createHost("first", [snapshot("project-first")], { stopSnapshots: [snapshot("stopped-first")] });
    const secondHost = createHost("second", [snapshot("project-second")], { stopSnapshots: [snapshot("stopped-second")] });
    const service = createProjectRuntimeMcpRuntimeService({
      pluginMcpRuntimeSnapshots: () => [snapshot("global-current")],
      projectRuntimeHosts: () => [firstHost, secondHost],
    });

    await expect(service.stopProjectRuntimeMcpRuntime("runtime-key")).resolves.toEqual([
      snapshot("global-current"),
      snapshot("project-first"),
      snapshot("project-second"),
    ]);

    expect(firstHost.stopPluginMcpRuntime).toHaveBeenCalledWith("runtime-key");
    expect(secondHost.stopPluginMcpRuntime).not.toHaveBeenCalled();
    expect(firstHost.restartPluginMcpRuntime).not.toHaveBeenCalled();
  });

  it("returns undefined when no project runtime handles the key", async () => {
    const firstHost = createHost("first");
    const secondHost = createHost("second");
    const service = createProjectRuntimeMcpRuntimeService({
      pluginMcpRuntimeSnapshots: () => [snapshot("global-current")],
      projectRuntimeHosts: () => [firstHost, secondHost],
    });

    await expect(service.restartProjectRuntimeMcpRuntime("missing-runtime")).resolves.toBeUndefined();
    await expect(service.stopProjectRuntimeMcpRuntime("missing-runtime")).resolves.toBeUndefined();

    expect(firstHost.restartPluginMcpRuntime).toHaveBeenCalledWith("missing-runtime");
    expect(secondHost.restartPluginMcpRuntime).toHaveBeenCalledWith("missing-runtime");
    expect(firstHost.stopPluginMcpRuntime).toHaveBeenCalledWith("missing-runtime");
    expect(secondHost.stopPluginMcpRuntime).toHaveBeenCalledWith("missing-runtime");
  });
});
