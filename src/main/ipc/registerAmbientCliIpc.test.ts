import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AmbientCliSecretSaveResult,
  SaveAmbientCliSecretInput,
} from "../../shared/types";
import {
  ambientCliSaveSecretIpcChannels,
  registerAmbientCliSaveSecretIpc,
  type RegisterAmbientCliSaveSecretIpcDependencies,
} from "./registerAmbientCliIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerAmbientCliSaveSecretIpc", () => {
  it("registers the Ambient CLI save secret channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...ambientCliSaveSecretIpcChannels]);
  });

  it("parses save input before saving the Ambient CLI secret", async () => {
    const { deps, invoke, result } = registerWithFakes();

    await expect(
      invoke("ambient-cli:save-secret", {
        packageId: "package-1",
        packageName: "example-package",
        builderSourcePath: "capabilities/example",
        mcpServerId: "io.github.example/server",
        mcpCandidateId: "example-candidate",
        mcpCandidateRef: "mcp-candidate:abc",
        envName: "EXAMPLE_ENV",
        value: "dummy-value",
        extra: "ignored",
      }),
    ).resolves.toEqual(result);

    expect(deps.saveAmbientCliSecret).toHaveBeenCalledWith({
      packageId: "package-1",
      packageName: "example-package",
      builderSourcePath: "capabilities/example",
      mcpServerId: "io.github.example/server",
      mcpCandidateId: "example-candidate",
      mcpCandidateRef: "mcp-candidate:abc",
      envName: "EXAMPLE_ENV",
      value: "dummy-value",
    });
  });

  it("rejects invalid save input before calling the dependency", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("ambient-cli:save-secret", { envName: "EXAMPLE_ENV", value: "" })).toThrow();
    expect(() => invoke("ambient-cli:save-secret", { packageId: "", envName: "EXAMPLE_ENV", value: "dummy-value" })).toThrow();

    expect(deps.saveAmbientCliSecret).not.toHaveBeenCalled();
  });

  it("propagates save errors", async () => {
    const error = new Error("Ambient CLI save failed");
    const { deps, invoke } = registerWithFakes({ error });
    const input: SaveAmbientCliSecretInput = {
      packageName: "example-package",
      envName: "EXAMPLE_ENV",
      value: "dummy-value",
    };

    await expect(invoke("ambient-cli:save-secret", input)).rejects.toThrow("Ambient CLI save failed");

    expect(deps.saveAmbientCliSecret).toHaveBeenCalledWith(input);
  });
});

function registerWithFakes({
  result = sampleAmbientCliSecretSaveResult(),
  error,
}: {
  result?: AmbientCliSecretSaveResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAmbientCliSaveSecretIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    saveAmbientCliSecret: vi.fn(async (_input: SaveAmbientCliSecretInput) => {
      if (error) throw error;
      return result;
    }),
  };
  registerAmbientCliSaveSecretIpc(deps);

  return {
    deps,
    handlers,
    result,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function sampleAmbientCliSecretSaveResult(): AmbientCliSecretSaveResult {
  return {
    packageId: "package-1",
    packageName: "example-package",
    envName: "EXAMPLE_ENV",
    source: "file",
    filePath: "./example.env",
    configured: true,
  };
}
