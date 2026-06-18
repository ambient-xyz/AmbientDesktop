import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  ResizeTerminalInput,
  StopTerminalInput,
  SubmitTerminalCommandInput,
  TerminalControlInput,
} from "../../shared/terminalTypes";
import {
  terminalControlIpcChannels,
  terminalRequestStartIpcChannels,
  terminalResizeIpcChannels,
  terminalStartIpcChannels,
  terminalStopIpcChannels,
  terminalSubmitCommandIpcChannels,
} from "./registerTerminalIpc";
import {
  registerTerminalDomainIpc,
  terminalDomainIpcChannels,
  type TerminalDomainRuntimeHost,
} from "./registerTerminalDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerTerminalDomainIpc", () => {
  it("registers terminal channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...terminalDomainIpcChannels]);
    expect([...terminalDomainIpcChannels]).toEqual([
      ...terminalRequestStartIpcChannels,
      ...terminalStartIpcChannels,
      ...terminalSubmitCommandIpcChannels,
      ...terminalControlIpcChannels,
      ...terminalResizeIpcChannels,
      ...terminalStopIpcChannels,
    ]);
  });

  it("issues a terminal start token only for the active thread", async () => {
    const { deps, event, host, invoke, startIntent } = registerWithFakes();

    expect(invoke("terminal:request-start", { threadId: "thread-1" })).toEqual(startIntent);

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(host.store.getThread).toHaveBeenCalledWith("thread-1");
    expect(deps.terminalStartTokens.issue).toHaveBeenCalledWith({
      threadId: "thread-1",
      workspacePath: "/workspace",
    });
  });

  it("starts a terminal from a consumed start token and thread workspace", async () => {
    const { deps, host, invoke, terminalSession } = registerWithFakes();

    expect(invoke("terminal:start", { threadId: "thread-1", startToken: "start-token" })).toEqual(terminalSession);

    expect(deps.terminalStartTokens.consume).toHaveBeenCalledWith({
      threadId: "thread-1",
      token: "start-token",
    });
    expect(deps.projectRuntimeHostForWorkspacePath).toHaveBeenCalledWith("/workspace");
    expect(host.terminals.start).toHaveBeenCalledWith("/workspace/thread", {
      threadId: "thread-1",
      permissionMode: "workspace",
    });
  });

  it("records workspace permission audit and writes allowed terminal commands", async () => {
    const { deps, host, invoke, permissionAudit } = registerWithFakes();

    await expect(invoke("terminal:submit-command", sampleSubmitInput())).resolves.toBeUndefined();

    expect(deps.classifyToolPermission).toHaveBeenCalledWith({
      threadId: "thread-1",
      permissionMode: "workspace",
      workspacePath: "/workspace/thread",
      toolName: "bash",
      toolInput: { command: "pnpm test" },
    });
    expect(host.store.addPermissionAudit).toHaveBeenCalledWith({
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "terminal",
      risk: "workspace-command",
      decision: "allowed",
      detail: "pnpm test",
      reason: "Allowed workspace terminal command.",
    });
    expect(deps.emitPermissionAuditCreated).toHaveBeenCalledWith(permissionAudit, "/workspace/thread");
    expect(host.terminals.write).toHaveBeenCalledWith("terminal-1", "pnpm test\r", {
      threadId: "thread-1",
      sessionToken: "session-token",
    });
  });

  it("records denied terminal command decisions and blocks the write", async () => {
    const { deps, host, invoke, permissionAudit } = registerWithFakes({
      permissionDecision: {
        action: "deny",
        reason: "Dangerous command.",
        request: {
          risk: "workspace-command",
          detail: "rm -rf /",
        },
      },
    });

    await expect(invoke("terminal:submit-command", sampleSubmitInput({ command: "rm -rf /" }))).rejects.toThrow(
      "Command blocked by workspace permission policy.",
    );

    expect(host.store.addPermissionAudit).toHaveBeenCalledWith({
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "terminal",
      risk: "workspace-command",
      decision: "denied",
      detail: "rm -rf /",
      reason: "Dangerous command.",
    });
    expect(deps.emitPermissionAuditCreated).toHaveBeenCalledWith(permissionAudit, "/workspace/thread");
    expect(host.terminals.write).not.toHaveBeenCalled();
  });

  it("requests permission, records decision source, and writes approved commands", async () => {
    const permissionRequest = {
      threadId: "thread-1",
      workspacePath: "/workspace/thread",
      toolName: "bash",
      risk: "workspace-command",
      detail: "git status",
    };
    const { deps, host, invoke } = registerWithFakes({
      permissionDecision: {
        action: "request",
        request: permissionRequest,
      },
      permissionResponse: {
        allowed: true,
        decisionSource: "user",
        grant: { id: "grant-1" },
      },
    });

    await expect(invoke("terminal:submit-command", sampleSubmitInput({ command: "git status" }))).resolves.toBeUndefined();

    expect(deps.requestPermissionWithGrantRegistry).toHaveBeenCalledWith(permissionRequest, {
      thread: expect.objectContaining({ id: "thread-1" }),
      permissionMode: "workspace",
      workspacePath: "/workspace/thread",
      store: host.store,
    });
    expect(host.store.addPermissionAudit).toHaveBeenCalledWith({
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "terminal",
      risk: "workspace-command",
      decision: "allowed",
      detail: "git status",
      reason: "Approved terminal command.",
      decisionSource: "user",
      grantId: "grant-1",
    });
    expect(host.terminals.write).toHaveBeenCalledWith("terminal-1", "git status\r", {
      threadId: "thread-1",
      sessionToken: "session-token",
    });
  });

  it("routes terminal control, resize, and stop through terminal host lookup", async () => {
    const { deps, host, invoke } = registerWithFakes();

    expect(invoke("terminal:control", sampleControlInput({ action: "interrupt" }))).toBeUndefined();
    expect(invoke("terminal:resize", sampleResizeInput())).toBeUndefined();
    expect(invoke("terminal:stop", sampleStopInput())).toBeUndefined();

    expect(deps.projectRuntimeHostForTerminal).toHaveBeenCalledWith("terminal-1");
    expect(host.terminals.write).toHaveBeenCalledWith("terminal-1", "\x03", {
      threadId: "thread-1",
      sessionToken: "session-token",
    });
    expect(host.terminals.resize).toHaveBeenCalledWith("terminal-1", 120, 32, {
      threadId: "thread-1",
      sessionToken: "session-token",
    });
    expect(host.terminals.stop).toHaveBeenCalledWith("terminal-1", {
      threadId: "thread-1",
      sessionToken: "session-token",
    });
  });
});

function registerWithFakes(options: {
  permissionDecision?: any;
  permissionResponse?: any;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const event = {} as IpcMainInvokeEvent;
  const thread = {
    id: "thread-1",
    workspacePath: "/workspace/thread",
    permissionMode: "workspace",
  };
  const permissionAudit = { id: "audit-1" };
  const terminalSession = { id: "terminal-1", threadId: "thread-1", sessionToken: "session-token" };
  const startIntent = { threadId: "thread-1", token: "start-token" };
  const host: TerminalDomainRuntimeHost = {
    workspacePath: "/workspace",
    store: {
      getThread: vi.fn(() => thread),
      addPermissionAudit: vi.fn(() => permissionAudit),
    },
    terminals: {
      start: vi.fn(() => terminalSession),
      write: vi.fn(),
      resize: vi.fn(),
      stop: vi.fn(),
    },
  };
  const deps = {
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    activeThreadIdForHost: vi.fn(() => "thread-1"),
    assertTrustedTerminalIpc: vi.fn(),
    classifyToolPermission: vi.fn(async () => options.permissionDecision ?? { action: "allow" }),
    emitPermissionAuditCreated: vi.fn(),
    isActiveProjectRuntimeHost: vi.fn(() => true),
    projectRuntimeHostForTerminal: vi.fn(() => host),
    projectRuntimeHostForWorkspacePath: vi.fn(() => host),
    requestPermissionWithGrantRegistry: vi.fn(async () => options.permissionResponse ?? { allowed: true }),
    requireProjectRuntimeHostForThread: vi.fn(() => host),
    terminalStartTokens: {
      issue: vi.fn(() => startIntent),
      consume: vi.fn(() => ({ workspacePath: "/workspace" })),
    },
  };

  registerTerminalDomainIpc(deps);

  return {
    deps,
    event,
    handlers,
    host,
    invoke: (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return handler(event, ...args);
    },
    permissionAudit,
    startIntent,
    terminalSession,
  };
}

function sampleSubmitInput(overrides: Partial<SubmitTerminalCommandInput> = {}): SubmitTerminalCommandInput {
  return {
    threadId: "thread-1",
    terminalId: "terminal-1",
    sessionToken: "session-token",
    command: "pnpm test",
    ...overrides,
  };
}

function sampleControlInput(overrides: Partial<TerminalControlInput> = {}): TerminalControlInput {
  return {
    threadId: "thread-1",
    terminalId: "terminal-1",
    sessionToken: "session-token",
    action: "enter" as const,
    ...overrides,
  };
}

function sampleResizeInput(overrides: Partial<ResizeTerminalInput> = {}): ResizeTerminalInput {
  return {
    threadId: "thread-1",
    terminalId: "terminal-1",
    sessionToken: "session-token",
    cols: 120,
    rows: 32,
    ...overrides,
  };
}

function sampleStopInput(overrides: Partial<StopTerminalInput> = {}): StopTerminalInput {
  return {
    threadId: "thread-1",
    terminalId: "terminal-1",
    sessionToken: "session-token",
    ...overrides,
  };
}
