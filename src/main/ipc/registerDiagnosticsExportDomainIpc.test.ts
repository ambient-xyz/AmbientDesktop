import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import { diagnosticsIpcChannels } from "./registerDiagnosticsIpc";
import {
  diagnosticsExportDomainIpcChannels,
  registerDiagnosticsExportDomainIpc,
  type ChatExportPayload,
  type ChatPdfExportPayload,
  type DiagnosticBundlePayload,
} from "./registerDiagnosticsExportDomainIpc";
import { threadExportChatIpcChannels, threadExportChatPdfIpcChannels } from "./registerThreadIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerDiagnosticsExportDomainIpc", () => {
  it("registers diagnostics and thread export channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...diagnosticsExportDomainIpcChannels]);
    expect([...diagnosticsExportDomainIpcChannels]).toEqual([
      ...diagnosticsIpcChannels,
      ...threadExportChatIpcChannels,
      ...threadExportChatPdfIpcChannels,
    ]);
  });

  it("exports diagnostics to the E2E path without opening a save dialog", async () => {
    const { deps, diagnosticPayload, invoke } = registerWithFakes({
      env: {
        AMBIENT_E2E: "1",
        AMBIENT_E2E_DIAGNOSTICS_PATH: "/tmp/e2e-diagnostics.json",
      },
    });
    const expectedBody = `${JSON.stringify(diagnosticPayload.bundle, null, 2)}\n`;

    await expect(invoke("diagnostics:export")).resolves.toEqual({
      path: "/tmp/e2e-diagnostics.json",
      bytes: Buffer.byteLength(expectedBody),
      createdAt: diagnosticPayload.bundle.createdAt,
      summary: undefined,
      subagents: {
        replayEvidence: undefined,
      },
    });

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.createMainDiagnosticSource).toHaveBeenCalledWith(deps.activeHost);
    expect(deps.createDiagnosticBundle).toHaveBeenCalledWith(deps.diagnosticSource, deps.logs, {
      appName: "Ambient Test",
      appVersion: "1.2.3",
      now: expect.any(Date),
    });
    expect(deps.writeFile).toHaveBeenCalledWith("/tmp/e2e-diagnostics.json", expectedBody, "utf8");
    expect(deps.dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it("exports diagnostics through the save dialog when E2E export is not configured", async () => {
    const { deps, diagnosticPayload, invoke, mainWindow } = registerWithFakes({
      saveDialogResult: {
        canceled: false,
        filePath: "/downloads/exported-diagnostics.json",
      },
    });
    const expectedBody = `${JSON.stringify(diagnosticPayload.bundle, null, 2)}\n`;

    await expect(invoke("diagnostics:export")).resolves.toEqual({
      path: "/downloads/exported-diagnostics.json",
      bytes: Buffer.byteLength(expectedBody),
      createdAt: diagnosticPayload.bundle.createdAt,
      summary: undefined,
      subagents: {
        replayEvidence: undefined,
      },
    });

    expect(deps.dialog.showSaveDialog).toHaveBeenCalledWith(mainWindow, {
      title: "Export Diagnostic Bundle",
      defaultPath: "/downloads/ambient-diagnostics.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    expect(deps.writeFile).toHaveBeenCalledWith("/downloads/exported-diagnostics.json", expectedBody, "utf8");
  });

  it("imports diagnostics from the selected JSON bundle", async () => {
    const { deps, diagnosticResult, invoke, mainWindow } = registerWithFakes({
      openDialogResult: {
        canceled: false,
        filePaths: ["/downloads/imported-diagnostics.json"],
      },
    });

    await expect(invoke("diagnostics:import")).resolves.toEqual(diagnosticResult);

    expect(deps.dialog.showOpenDialog).toHaveBeenCalledWith(mainWindow, {
      title: "Import Diagnostic Bundle",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    expect(deps.importDiagnosticBundleFromFile).toHaveBeenCalledWith("/downloads/imported-diagnostics.json");
  });

  it("exports chat archives to the E2E path without opening a save dialog", async () => {
    const { chatPayload, deps, invoke } = registerWithFakes({
      env: {
        AMBIENT_E2E: "1",
        AMBIENT_E2E_CHAT_EXPORT_PATH: "/tmp/e2e-chat.zip",
      },
    });

    await expect(invoke("thread:export-chat", { threadId: "thread-1" })).resolves.toEqual({
      path: "/tmp/e2e-chat.zip",
      bytes: chatPayload.archive.byteLength,
      createdAt: chatPayload.createdAt,
      source: chatPayload.source,
      fallbackReason: chatPayload.fallbackReason,
    });

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(deps.createChatExportBundle).toHaveBeenCalledWith(deps.threadHost.store, "thread-1", {
      appName: "Ambient Test",
      appVersion: "1.2.3",
    });
    expect(deps.writeFile).toHaveBeenCalledWith("/tmp/e2e-chat.zip", chatPayload.archive);
    expect(deps.dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it("exports chat archives through the save dialog when E2E export is not configured", async () => {
    const { chatPayload, deps, invoke, mainWindow } = registerWithFakes({
      saveDialogResult: {
        canceled: false,
        filePath: "/downloads/thread-export.zip",
      },
    });

    await expect(invoke("thread:export-chat", { threadId: "thread-1", extra: "ignored" })).resolves.toEqual({
      path: "/downloads/thread-export.zip",
      bytes: chatPayload.archive.byteLength,
      createdAt: chatPayload.createdAt,
      source: chatPayload.source,
      fallbackReason: chatPayload.fallbackReason,
    });

    expect(deps.dialog.showSaveDialog).toHaveBeenCalledWith(mainWindow, {
      title: "Export Chat",
      defaultPath: "/downloads/thread-export.zip",
      filters: [{ name: "Zip Archive", extensions: ["zip"] }],
    });
    expect(deps.writeFile).toHaveBeenCalledWith("/downloads/thread-export.zip", chatPayload.archive);
  });

  it("exports chat PDFs to the E2E path without opening a save dialog", async () => {
    const { chatPdfPayload, deps, invoke } = registerWithFakes({
      env: {
        AMBIENT_E2E: "1",
        AMBIENT_E2E_CHAT_PDF_EXPORT_PATH: "/tmp/e2e-chat",
      },
    });

    await expect(invoke("thread:export-chat-pdf", { threadId: "thread-1" })).resolves.toEqual({
      path: "/tmp/e2e-chat.pdf",
      bytes: chatPdfPayload.pdf.byteLength,
      createdAt: chatPdfPayload.createdAt,
      source: chatPdfPayload.source,
    });

    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(deps.createChatPdfExport).toHaveBeenCalledWith(deps.threadHost.store, "thread-1", {
      appName: "Ambient Test",
      appVersion: "1.2.3",
    });
    expect(deps.writeFile).toHaveBeenCalledWith("/tmp/e2e-chat.pdf", chatPdfPayload.pdf);
    expect(deps.dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it("exports chat PDFs through the save dialog and normalizes the PDF extension", async () => {
    const { chatPdfPayload, deps, invoke, mainWindow } = registerWithFakes({
      saveDialogResult: {
        canceled: false,
        filePath: "/downloads/thread-export",
      },
    });

    await expect(invoke("thread:export-chat-pdf", { threadId: "thread-1", extra: "ignored" })).resolves.toEqual({
      path: "/downloads/thread-export.pdf",
      bytes: chatPdfPayload.pdf.byteLength,
      createdAt: chatPdfPayload.createdAt,
      source: chatPdfPayload.source,
    });

    expect(deps.dialog.showSaveDialog).toHaveBeenCalledWith(mainWindow, {
      title: "Export Chat as PDF",
      defaultPath: "/downloads/thread-export.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    expect(deps.writeFile).toHaveBeenCalledWith("/downloads/thread-export.pdf", chatPdfPayload.pdf);
    expect(deps.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it("confirms before replacing an existing normalized PDF target", async () => {
    const { chatPdfPayload, deps, invoke, mainWindow } = registerWithFakes({
      existingPaths: new Set(["/downloads/thread-export.pdf"]),
      messageBoxResult: { response: 0 },
      saveDialogResult: {
        canceled: false,
        filePath: "/downloads/thread-export",
      },
    });

    await expect(invoke("thread:export-chat-pdf", { threadId: "thread-1" })).resolves.toMatchObject({
      path: "/downloads/thread-export.pdf",
    });

    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(mainWindow, {
      type: "warning",
      buttons: ["Replace", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Replace Existing PDF?",
      message: "A PDF already exists at the normalized export path.",
      detail: "/downloads/thread-export.pdf",
    });
    expect(deps.writeFile).toHaveBeenCalledWith("/downloads/thread-export.pdf", chatPdfPayload.pdf);
  });

  it("does not write a chat PDF when normalized PDF replacement is canceled", async () => {
    const { deps, invoke } = registerWithFakes({
      existingPaths: new Set(["/downloads/thread-export.pdf"]),
      messageBoxResult: { response: 1 },
      saveDialogResult: {
        canceled: false,
        filePath: "/downloads/thread-export",
      },
    });

    await expect(invoke("thread:export-chat-pdf", { threadId: "thread-1" })).resolves.toBeUndefined();

    expect(deps.dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("resolves chat PDF exports through the project-scoped thread action host when project context is provided", async () => {
    const { deps, invoke, mainWindow } = registerWithFakes({
      saveDialogResult: {
        canceled: false,
        filePath: "/downloads/thread-export.pdf",
      },
    });

    await expect(invoke("thread:export-chat-pdf", { threadId: "thread-1", projectId: "project-1" })).resolves.toMatchObject({
      path: "/downloads/thread-export.pdf",
    });

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.requireProjectRuntimeHostForThreadAction).toHaveBeenCalledWith(
      { threadId: "thread-1", projectId: "project-1" },
      deps.activeHost,
    );
    expect(deps.createChatPdfExport).toHaveBeenCalledWith(deps.threadHost.store, "thread-1", {
      appName: "Ambient Test",
      appVersion: "1.2.3",
    });
    expect(deps.dialog.showSaveDialog).toHaveBeenCalledWith(mainWindow, expect.objectContaining({
      title: "Export Chat as PDF",
    }));
  });

  it("does not write a chat PDF when the save dialog is canceled", async () => {
    const { deps, invoke } = registerWithFakes({
      saveDialogResult: {
        canceled: true,
        filePath: "/downloads/ignored.pdf",
      },
    });

    await expect(invoke("thread:export-chat-pdf", { threadId: "thread-1" })).resolves.toBeUndefined();

    expect(deps.createChatPdfExport).toHaveBeenCalledOnce();
    expect(deps.writeFile).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  env = {},
  existingPaths = new Set<string>(),
  messageBoxResult = { response: 1 },
  openDialogResult = { canceled: true, filePaths: [] },
  saveDialogResult = { canceled: true },
}: {
  env?: NodeJS.ProcessEnv;
  existingPaths?: Set<string>;
  messageBoxResult?: { response: number };
  openDialogResult?: { canceled: boolean; filePaths: string[] };
  saveDialogResult?: { canceled: boolean; filePath?: string };
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const mainWindow = { id: "main-window" };
  const activeHost = { store: { id: "active-store" } };
  const threadHost = { store: { id: "thread-store" } };
  const diagnosticSource = { id: "diagnostic-source" };
  const logs = [{ level: "info", message: "hello" }];
  const diagnosticPayload = sampleDiagnosticBundlePayload();
  const diagnosticResult = {
    path: "/downloads/imported-diagnostics.json",
    bytes: 512,
    createdAt: "2026-06-16T00:00:00.000Z",
  };
  const chatPayload = sampleChatExportPayload();
  const chatPdfPayload = sampleChatPdfExportPayload();
  const deps = {
    activeHost,
    app: {
      getName: vi.fn(() => "Ambient Test"),
      getVersion: vi.fn(() => "1.2.3"),
      getPath: vi.fn(() => "/downloads"),
    },
    createChatExportBundle: vi.fn(async () => chatPayload),
    createChatPdfExport: vi.fn(async () => chatPdfPayload),
    createDiagnosticBundle: vi.fn(async () => diagnosticPayload),
    createMainDiagnosticSource: vi.fn(() => diagnosticSource),
    diagnosticSource,
    dialog: {
      showMessageBox: vi.fn(async () => messageBoxResult),
      showOpenDialog: vi.fn(async () => openDialogResult),
      showSaveDialog: vi.fn(async () => saveDialogResult),
    },
    env,
    existsSync: vi.fn((path: string) => existingPaths.has(path)),
    getAppLogs: vi.fn(() => logs),
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    importDiagnosticBundleFromFile: vi.fn(async () => diagnosticResult),
    join: vi.fn((...parts: string[]) => parts.join("/").replace(/\/+/g, "/")),
    logs,
    mainWindow,
    requireActiveProjectRuntimeHost: vi.fn(() => activeHost),
    requireProjectRuntimeHostForThread: vi.fn(() => threadHost),
    requireProjectRuntimeHostForThreadAction: vi.fn(() => threadHost),
    threadHost,
    writeFile: vi.fn(),
  };

  registerDiagnosticsExportDomainIpc(deps);

  return {
    chatPayload,
    chatPdfPayload,
    deps,
    diagnosticPayload,
    diagnosticResult,
    handlers,
    invoke: (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, ...args));
    },
    mainWindow,
  };
}

function sampleDiagnosticBundlePayload(): DiagnosticBundlePayload {
  return {
    fileName: "ambient-diagnostics.json",
    bundle: {
      createdAt: "2026-06-16T00:00:00.000Z",
      subagents: {},
    },
  };
}

function sampleChatExportPayload(): ChatExportPayload {
  return {
    fileName: "thread-export.zip",
    archive: Buffer.from("zip-bytes"),
    createdAt: "2026-06-16T00:00:00.000Z",
    source: "pi-session",
    fallbackReason: "none",
  };
}

function sampleChatPdfExportPayload(): ChatPdfExportPayload {
  return {
    fileName: "thread-export.pdf",
    pdf: Buffer.from("pdf-bytes"),
    createdAt: "2026-06-16T00:00:00.000Z",
    source: "visible-chat-pdf",
  };
}
