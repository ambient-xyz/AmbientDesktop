import type { IpcMain } from "electron";

import type { DiagnosticExportResult } from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const diagnosticsIpcChannels = [
  "diagnostics:export",
  "diagnostics:import",
] as const;

export interface RegisterDiagnosticsIpcDependencies {
  handleIpc: HandleIpc;
  exportDiagnosticBundle(): MaybePromise<DiagnosticExportResult | undefined>;
  importDiagnosticBundle(): MaybePromise<DiagnosticExportResult | undefined>;
}

export function registerDiagnosticsIpc({
  handleIpc,
  exportDiagnosticBundle,
  importDiagnosticBundle,
}: RegisterDiagnosticsIpcDependencies): void {
  handleIpc("diagnostics:export", () => exportDiagnosticBundle());
  handleIpc("diagnostics:import", () => importDiagnosticBundle());
}
