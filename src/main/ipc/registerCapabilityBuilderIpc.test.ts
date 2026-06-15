import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { CapabilityBuilderHistoryResult } from "../capabilityBuilder";
import {
  capabilityBuilderHistoryIpcChannels,
  registerCapabilityBuilderHistoryIpc,
  type RegisterCapabilityBuilderHistoryIpcDependencies,
} from "./registerCapabilityBuilderIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerCapabilityBuilderHistoryIpc", () => {
  it("registers the capability builder history channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...capabilityBuilderHistoryIpcChannels]);
  });

  it("discovers capability builder history with default input", async () => {
    const { deps, invoke, result } = registerWithFakes();

    await expect(invoke("capability-builder:history")).resolves.toEqual(result);

    expect(deps.getWorkspacePath).toHaveBeenCalledOnce();
    expect(deps.discoverCapabilityBuilderHistory).toHaveBeenCalledWith("/tmp/workspace", {});
  });

  it("parses history options before discovery", async () => {
    const { deps, invoke, result } = registerWithFakes();

    await expect(
      invoke("capability-builder:history", {
        includeRegistered: true,
        includeDrafts: false,
        packageName: "ambient-example",
        extra: "ignored",
      }),
    ).resolves.toEqual(result);

    expect(deps.discoverCapabilityBuilderHistory).toHaveBeenCalledWith("/tmp/workspace", {
      includeRegistered: true,
      includeDrafts: false,
      packageName: "ambient-example",
    });
  });

  it("rejects invalid input before reading workspace state", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("capability-builder:history", { includeRegistered: "yes" })).toThrow();

    expect(deps.getWorkspacePath).not.toHaveBeenCalled();
    expect(deps.discoverCapabilityBuilderHistory).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  result = sampleCapabilityBuilderHistoryResult(),
}: {
  result?: CapabilityBuilderHistoryResult;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    getWorkspacePath: vi.fn(() => "/tmp/workspace"),
    discoverCapabilityBuilderHistory: vi.fn(async () => result),
  } satisfies RegisterCapabilityBuilderHistoryIpcDependencies;
  registerCapabilityBuilderHistoryIpc(deps);

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

function sampleCapabilityBuilderHistoryResult(): CapabilityBuilderHistoryResult {
  return {
    rootPath: "/tmp/workspace/.ambient/capability-builder",
    relativeRootPath: ".ambient/capability-builder",
    entries: [
      {
        packageName: "ambient-example",
        rootPath: "/tmp/workspace/.ambient/capability-builder/ambient-example",
        relativeRootPath: ".ambient/capability-builder/ambient-example",
        valid: true,
        status: "draft",
        installedPresent: false,
        refs: {},
        commandNames: [],
        envNames: [],
        artifactOutputTypes: [],
        logFiles: [],
        possibleArtifactFiles: [],
        errors: [],
        warnings: [],
      },
    ],
    errors: [],
  };
}
