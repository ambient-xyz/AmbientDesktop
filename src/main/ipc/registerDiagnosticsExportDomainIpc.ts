import type { IpcMain } from "electron";

import {
  diagnosticsIpcChannels,
  registerDiagnosticsIpc,
} from "./registerDiagnosticsIpc";
import {
  registerThreadExportChatIpc,
  threadExportChatIpcChannels,
} from "./registerThreadIpc";
import type {
  DiagnosticExportResult,
  ExportChatInput,
  ExportChatResult,
} from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const diagnosticsExportDomainIpcChannels = [
  ...diagnosticsIpcChannels,
  ...threadExportChatIpcChannels,
] as const;

export interface DiagnosticsExportDialog {
  showOpenDialog(window: unknown, options: any): MaybePromise<{ canceled: boolean; filePaths: string[] }>;
  showSaveDialog(window: unknown, options: any): MaybePromise<{ canceled: boolean; filePath?: string }>;
}

export interface DiagnosticsExportApp {
  getName(): string;
  getVersion(): string;
  getPath(name: "downloads"): string;
}

export interface DiagnosticBundlePayload {
  fileName: string;
  bundle: {
    createdAt: string;
    summary?: DiagnosticExportResult["summary"];
    subagents: {
      replayEvidence?: NonNullable<DiagnosticExportResult["subagents"]>["replayEvidence"];
    };
  };
}

export interface ChatExportPayload {
  fileName: string;
  archive: Buffer;
  createdAt: string;
  source: ExportChatResult["source"];
  fallbackReason?: string;
}

export interface DiagnosticsExportRuntimeHost<Store = unknown> {
  store: Store;
}

export interface RegisterDiagnosticsExportDomainIpcDependencies<
  ActiveHost extends DiagnosticsExportRuntimeHost = DiagnosticsExportRuntimeHost,
  ThreadHost extends DiagnosticsExportRuntimeHost = DiagnosticsExportRuntimeHost,
> {
  app: DiagnosticsExportApp;
  createChatExportBundle(
    store: ThreadHost["store"],
    threadId: string,
    options: { appName: string; appVersion: string },
  ): MaybePromise<ChatExportPayload>;
  createDiagnosticBundle(
    source: unknown,
    logs: unknown[],
    options: { appName: string; appVersion: string; now: Date },
  ): MaybePromise<DiagnosticBundlePayload>;
  createMainDiagnosticSource(host: ActiveHost): unknown;
  dialog: DiagnosticsExportDialog;
  env?: NodeJS.ProcessEnv;
  getAppLogs(): unknown[];
  handleIpc: HandleIpc;
  importDiagnosticBundleFromFile(filePath: string): MaybePromise<DiagnosticExportResult>;
  join(...paths: string[]): string;
  mainWindow: unknown;
  requireActiveProjectRuntimeHost(): ActiveHost;
  requireProjectRuntimeHostForThread(threadId: string): ThreadHost;
  writeFile(path: string, data: string | Buffer, encoding?: BufferEncoding): MaybePromise<void>;
}

export function registerDiagnosticsExportDomainIpc<
  ActiveHost extends DiagnosticsExportRuntimeHost,
  ThreadHost extends DiagnosticsExportRuntimeHost,
>({
  app,
  createChatExportBundle,
  createDiagnosticBundle,
  createMainDiagnosticSource,
  dialog,
  env = process.env,
  getAppLogs,
  handleIpc,
  importDiagnosticBundleFromFile,
  join,
  mainWindow,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForThread,
  writeFile,
}: RegisterDiagnosticsExportDomainIpcDependencies<ActiveHost, ThreadHost>): void {
  registerDiagnosticsIpc({
    handleIpc,
    exportDiagnosticBundle: async () => {
      const host = requireActiveProjectRuntimeHost();
      const now = new Date();
      const defaultPayload = await createDiagnosticBundle(createMainDiagnosticSource(host), getAppLogs(), {
        appName: app.getName(),
        appVersion: app.getVersion(),
        now,
      });
      const body = `${JSON.stringify(defaultPayload.bundle, null, 2)}\n`;
      const e2eDiagnosticPath = env.AMBIENT_E2E === "1" ? env.AMBIENT_E2E_DIAGNOSTICS_PATH : undefined;
      if (e2eDiagnosticPath) {
        await writeFile(e2eDiagnosticPath, body, "utf8");
        return diagnosticExportResult(e2eDiagnosticPath, body, defaultPayload);
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Export Diagnostic Bundle",
        defaultPath: join(app.getPath("downloads"), defaultPayload.fileName),
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return undefined;

      await writeFile(result.filePath, body, "utf8");
      return diagnosticExportResult(result.filePath, body, defaultPayload);
    },
    importDiagnosticBundle: async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Import Diagnostic Bundle",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      const filePath = result.filePaths[0];
      if (result.canceled || !filePath) return undefined;
      return importDiagnosticBundleFromFile(filePath);
    },
  });

  registerThreadExportChatIpc({
    handleIpc,
    exportChat: async (input: ExportChatInput) => {
      const host = requireProjectRuntimeHostForThread(input.threadId);
      const payload = await createChatExportBundle(host.store, input.threadId, {
        appName: app.getName(),
        appVersion: app.getVersion(),
      });
      const e2eExportPath = env.AMBIENT_E2E === "1" ? env.AMBIENT_E2E_CHAT_EXPORT_PATH : undefined;
      if (e2eExportPath) {
        await writeFile(e2eExportPath, payload.archive);
        return chatExportResult(e2eExportPath, payload);
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Export Chat",
        defaultPath: join(app.getPath("downloads"), payload.fileName),
        filters: [{ name: "Zip Archive", extensions: ["zip"] }],
      });
      if (result.canceled || !result.filePath) return undefined;

      await writeFile(result.filePath, payload.archive);
      return chatExportResult(result.filePath, payload);
    },
  });
}

function diagnosticExportResult(
  path: string,
  body: string,
  payload: DiagnosticBundlePayload,
): DiagnosticExportResult {
  return {
    path,
    bytes: Buffer.byteLength(body),
    createdAt: payload.bundle.createdAt,
    summary: payload.bundle.summary,
    subagents: {
      replayEvidence: payload.bundle.subagents.replayEvidence,
    },
  };
}

function chatExportResult(path: string, payload: ChatExportPayload): ExportChatResult {
  return {
    path,
    bytes: payload.archive.byteLength,
    createdAt: payload.createdAt,
    source: payload.source,
    fallbackReason: payload.fallbackReason,
  };
}
