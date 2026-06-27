import { BrowserWindow } from "electron";
import { createChatPdfExport, createElectronPrintToPdfRenderer } from "./chat-export/chatPdfExport";
import { registerMainIpc, type RegisterMainIpcDependencies } from "./ipc/registerMainIpc";
import { mainIpcStaticDependencies } from "./mainIpcStaticDependencies";
import {
  createProjectBoardDesktopIpcDependencies,
  type ProjectBoardDesktopIpcHostDependencies,
} from "./project-board/projectBoardDesktopIpcDependencies";
import type { ProjectStore } from "./projectStore/projectStore";

type MainIpcRuntimeDependencyInputs = Omit<
  RegisterMainIpcDependencies,
  keyof typeof mainIpcStaticDependencies | "createChatPdfExport" | "projectBoardDesktopIpcDependencies"
> & {
  projectBoardDesktopIpcHostDependencies: ProjectBoardDesktopIpcHostDependencies;
};

export function registerMainIpcForDesktop(input: MainIpcRuntimeDependencyInputs): void {
  const { projectBoardDesktopIpcHostDependencies } = input;
  const dependencies = {
    ...mainIpcStaticDependencies,
    ...input,
    createChatPdfExport: (store: ProjectStore, threadId: string, options: { appName: string; appVersion: string }) =>
      createChatPdfExport(store, threadId, {
        ...options,
        renderHtmlToPdf: createElectronPrintToPdfRenderer(BrowserWindow),
      }),
    projectBoardDesktopIpcDependencies: createProjectBoardDesktopIpcDependencies(projectBoardDesktopIpcHostDependencies),
  } as unknown as RegisterMainIpcDependencies;
  registerMainIpc(dependencies);
}
