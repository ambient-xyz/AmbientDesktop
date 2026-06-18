import type { IpcMain, IpcMainInvokeEvent } from "electron";

import {
  registerTerminalControlIpc,
  registerTerminalRequestStartIpc,
  registerTerminalResizeIpc,
  registerTerminalStartIpc,
  registerTerminalStopIpc,
  registerTerminalSubmitCommandIpc,
  terminalControlIpcChannels,
  terminalRequestStartIpcChannels,
  terminalResizeIpcChannels,
  terminalStartIpcChannels,
  terminalStopIpcChannels,
  terminalSubmitCommandIpcChannels,
} from "./registerTerminalIpc";
import type { SubmitTerminalCommandInput } from "../../shared/terminalTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const terminalDomainIpcChannels = [
  ...terminalRequestStartIpcChannels,
  ...terminalStartIpcChannels,
  ...terminalSubmitCommandIpcChannels,
  ...terminalControlIpcChannels,
  ...terminalResizeIpcChannels,
  ...terminalStopIpcChannels,
] as const;

export interface TerminalDomainThread {
  id: string;
  workspacePath: string;
  permissionMode: any;
}

export interface TerminalDomainRuntimeHost {
  workspacePath: string;
  store: {
    getThread(threadId: string): TerminalDomainThread;
    addPermissionAudit(input: any): any;
  };
  terminals: {
    start(workspacePath: string, options: { threadId: string; permissionMode: any }): any;
    write(terminalId: string, data: string, options: { threadId: string; sessionToken: string }): any;
    resize(terminalId: string, cols: number, rows: number, options: { threadId: string; sessionToken: string }): any;
    stop(terminalId: string, options: { threadId: string; sessionToken: string }): any;
  };
}

export interface RegisterTerminalDomainIpcDependencies<Host extends TerminalDomainRuntimeHost = TerminalDomainRuntimeHost> {
  handleIpc: HandleIpc;
  activeThreadIdForHost(host: Host): string;
  assertTrustedTerminalIpc(event: IpcMainInvokeEvent): void;
  classifyToolPermission(input: any): Promise<any>;
  emitPermissionAuditCreated(entry: any, workspacePath: string): void;
  isActiveProjectRuntimeHost(host: Host): boolean;
  projectRuntimeHostForTerminal(terminalId: string): Host | undefined;
  projectRuntimeHostForWorkspacePath(workspacePath: string): Host | undefined;
  requestPermissionWithGrantRegistry(request: any, context: any): Promise<any>;
  requireProjectRuntimeHostForThread(threadId: string): Host;
  terminalStartTokens: {
    issue(input: { threadId: string; workspacePath: string }): any;
    consume(input: { threadId: string; token: string }): { workspacePath: string };
  };
}

export function registerTerminalDomainIpc<Host extends TerminalDomainRuntimeHost>({
  handleIpc,
  activeThreadIdForHost,
  assertTrustedTerminalIpc,
  classifyToolPermission,
  emitPermissionAuditCreated,
  isActiveProjectRuntimeHost,
  projectRuntimeHostForTerminal,
  projectRuntimeHostForWorkspacePath,
  requestPermissionWithGrantRegistry,
  requireProjectRuntimeHostForThread,
  terminalStartTokens,
}: RegisterTerminalDomainIpcDependencies<Host>): void {
  const reviewTerminalCommand = async (input: SubmitTerminalCommandInput, host: Host): Promise<boolean> => {
    const targetStore = host.store;
    const thread = targetStore.getThread(input.threadId);
    const permissionMode = thread.permissionMode;
    const decision = await classifyToolPermission({
      threadId: input.threadId,
      permissionMode,
      workspacePath: thread.workspacePath,
      toolName: "bash",
      toolInput: { command: input.command },
    });
    if (decision.action === "allow") {
      if (permissionMode === "workspace") {
        const entry = targetStore.addPermissionAudit({
          threadId: input.threadId,
          permissionMode,
          toolName: "terminal",
          risk: "workspace-command",
          decision: "allowed",
          detail: input.command,
          reason: "Allowed workspace terminal command.",
        });
        emitPermissionAuditCreated(entry, thread.workspacePath);
      }
      return true;
    }

    if (decision.action === "deny") {
      const entry = targetStore.addPermissionAudit({
        threadId: input.threadId,
        permissionMode,
        toolName: "terminal",
        risk: decision.request.risk,
        decision: "denied",
        detail: decision.request.detail,
        reason: decision.reason,
      });
      emitPermissionAuditCreated(entry, thread.workspacePath);
      return false;
    }

    const permission = await requestPermissionWithGrantRegistry(decision.request, {
      thread,
      permissionMode,
      workspacePath: thread.workspacePath,
      store: targetStore,
    });
    const entry = targetStore.addPermissionAudit({
      threadId: input.threadId,
      permissionMode,
      toolName: "terminal",
      risk: decision.request.risk,
      decision: permission.allowed ? "allowed" : "denied",
      detail: decision.request.detail,
      reason: permission.allowed ? "Approved terminal command." : "Denied terminal command.",
      decisionSource: permission.decisionSource,
      grantId: permission.grant?.id,
    });
    emitPermissionAuditCreated(entry, thread.workspacePath);
    return permission.allowed;
  };

  registerTerminalRequestStartIpc({
    handleIpc,
    assertTrustedTerminalIpc,
    requestTerminalStart: (input) => {
      const host = requireProjectRuntimeHostForThread(input.threadId);
      if (!isActiveProjectRuntimeHost(host) || input.threadId !== activeThreadIdForHost(host)) {
        throw new Error("Terminal can only start for the active thread.");
      }
      host.store.getThread(input.threadId);
      return terminalStartTokens.issue({ threadId: input.threadId, workspacePath: host.workspacePath });
    },
  });

  registerTerminalStartIpc({
    handleIpc,
    assertTrustedTerminalIpc,
    startTerminal: (input) => {
      const startToken = terminalStartTokens.consume({ threadId: input.threadId, token: input.startToken });
      const host = projectRuntimeHostForWorkspacePath(startToken.workspacePath);
      if (!host) throw new Error("Terminal project is no longer available.");
      if (input.threadId !== activeThreadIdForHost(host)) throw new Error("Terminal can only start for the active thread.");
      const thread = host.store.getThread(input.threadId);
      return host.terminals.start(thread.workspacePath, {
        threadId: thread.id,
        permissionMode: thread.permissionMode,
      });
    },
  });

  registerTerminalSubmitCommandIpc({
    handleIpc,
    assertTrustedTerminalIpc,
    submitTerminalCommand: async (input) => {
      const host = projectRuntimeHostForTerminal(input.terminalId) ?? requireProjectRuntimeHostForThread(input.threadId);
      const allowed = await reviewTerminalCommand(input, host);
      if (!allowed) throw new Error("Command blocked by workspace permission policy.");
      host.terminals.write(input.terminalId, `${input.command}\r`, {
        threadId: input.threadId,
        sessionToken: input.sessionToken,
      });
    },
  });

  registerTerminalControlIpc({
    handleIpc,
    assertTrustedTerminalIpc,
    controlTerminal: (input) => {
      const host = projectRuntimeHostForTerminal(input.terminalId) ?? requireProjectRuntimeHostForThread(input.threadId);
      const data = input.action === "interrupt" ? "\x03" : "\r";
      host.terminals.write(input.terminalId, data, {
        threadId: input.threadId,
        sessionToken: input.sessionToken,
      });
    },
  });

  registerTerminalResizeIpc({
    handleIpc,
    assertTrustedTerminalIpc,
    resizeTerminal: (input) => {
      const host = projectRuntimeHostForTerminal(input.terminalId) ?? requireProjectRuntimeHostForThread(input.threadId);
      host.terminals.resize(input.terminalId, input.cols, input.rows, {
        threadId: input.threadId,
        sessionToken: input.sessionToken,
      });
    },
  });

  registerTerminalStopIpc({
    handleIpc,
    assertTrustedTerminalIpc,
    stopTerminal: (input) => {
      const host = projectRuntimeHostForTerminal(input.terminalId) ?? requireProjectRuntimeHostForThread(input.threadId);
      host.terminals.stop(input.terminalId, {
        threadId: input.threadId,
        sessionToken: input.sessionToken,
      });
    },
  });
}
