import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { DiagnosticExportResult } from "../../shared/types";
import {
  diagnosticsIpcChannels,
  registerDiagnosticsIpc,
  type RegisterDiagnosticsIpcDependencies,
} from "./registerDiagnosticsIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerDiagnosticsIpc", () => {
  it("registers the diagnostics channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...diagnosticsIpcChannels]);
  });

  it("exports diagnostic bundles through the dependency", async () => {
    const { deps, invoke, result } = registerWithFakes();

    await expect(invoke("diagnostics:export")).resolves.toEqual(result);

    expect(deps.exportDiagnosticBundle).toHaveBeenCalledOnce();
    expect(deps.importDiagnosticBundle).not.toHaveBeenCalled();
  });

  it("imports diagnostic bundles through the dependency", async () => {
    const { deps, invoke, result } = registerWithFakes();

    await expect(invoke("diagnostics:import")).resolves.toEqual(result);

    expect(deps.importDiagnosticBundle).toHaveBeenCalledOnce();
    expect(deps.exportDiagnosticBundle).not.toHaveBeenCalled();
  });

  it("propagates export errors", async () => {
    const error = new Error("diagnostic export failed");
    const { deps, invoke } = registerWithFakes({ exportError: error });

    await expect(invoke("diagnostics:export")).rejects.toThrow("diagnostic export failed");

    expect(deps.exportDiagnosticBundle).toHaveBeenCalledOnce();
  });

  it("propagates import errors", async () => {
    const error = new Error("diagnostic import failed");
    const { deps, invoke } = registerWithFakes({ importError: error });

    await expect(invoke("diagnostics:import")).rejects.toThrow("diagnostic import failed");

    expect(deps.importDiagnosticBundle).toHaveBeenCalledOnce();
  });
});

function registerWithFakes({
  result = sampleDiagnosticExportResult(),
  exportError,
  importError,
}: {
  result?: DiagnosticExportResult;
  exportError?: Error;
  importError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterDiagnosticsIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    exportDiagnosticBundle: vi.fn(async () => {
      if (exportError) throw exportError;
      return result;
    }),
    importDiagnosticBundle: vi.fn(async () => {
      if (importError) throw importError;
      return result;
    }),
  };
  registerDiagnosticsIpc(deps);

  return {
    deps,
    handlers,
    result,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function sampleDiagnosticExportResult(): DiagnosticExportResult {
  return {
    path: "/tmp/ambient-diagnostics.json",
    bytes: 1024,
    createdAt: "2026-06-06T00:00:00.000Z",
  };
}
