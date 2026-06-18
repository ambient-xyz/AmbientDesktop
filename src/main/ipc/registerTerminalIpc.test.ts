import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  RequestTerminalStartInput,
  ResizeTerminalInput,
  StartTerminalInput,
  StopTerminalInput,
  SubmitTerminalCommandInput,
  TerminalControlInput,
  TerminalSession,
  TerminalStartIntent,
} from "../../shared/terminalTypes";
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
  type RegisterTerminalControlIpcDependencies,
  type RegisterTerminalRequestStartIpcDependencies,
  type RegisterTerminalResizeIpcDependencies,
  type RegisterTerminalStartIpcDependencies,
  type RegisterTerminalStopIpcDependencies,
  type RegisterTerminalSubmitCommandIpcDependencies,
} from "./registerTerminalIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerTerminalRequestStartIpc", () => {
  it("registers the terminal request start channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...terminalRequestStartIpcChannels]);
  });

  it("asserts trust and parses input before requesting terminal start", async () => {
    const { deps, event, invoke, intent } = registerWithFakes();

    await expect(
      invoke("terminal:request-start", {
        threadId: "thread-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(intent);

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.requestTerminalStart).toHaveBeenCalledWith({ threadId: "thread-1" });
  });

  it("rejects untrusted events before parsing or requesting terminal start", () => {
    const error = new Error("untrusted terminal IPC");
    const { deps, invoke } = registerWithFakes({ trustError: error });

    expect(() => invoke("terminal:request-start", { threadId: "thread-1" })).toThrow("untrusted terminal IPC");

    expect(deps.requestTerminalStart).not.toHaveBeenCalled();
  });

  it("rejects invalid input after asserting trust and before requesting terminal start", () => {
    const { deps, event, invoke } = registerWithFakes();

    expect(() => invoke("terminal:request-start", { threadId: "" })).toThrow();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.requestTerminalStart).not.toHaveBeenCalled();
  });

  it("propagates terminal request start errors", async () => {
    const error = new Error("terminal unavailable");
    const { deps, invoke } = registerWithFakes({ error });
    const input: RequestTerminalStartInput = { threadId: "thread-1" };

    await expect(invoke("terminal:request-start", input)).rejects.toThrow("terminal unavailable");

    expect(deps.requestTerminalStart).toHaveBeenCalledWith(input);
  });
});

describe("registerTerminalStartIpc", () => {
  it("registers the terminal start channel", () => {
    const { handlers } = registerStartWithFakes();

    expect([...handlers.keys()]).toEqual([...terminalStartIpcChannels]);
  });

  it("asserts trust and parses input before starting terminal", async () => {
    const { deps, event, invoke, session } = registerStartWithFakes();

    await expect(
      invoke("terminal:start", {
        threadId: "thread-1",
        startToken: "start-token",
        extra: "ignored",
      }),
    ).resolves.toEqual(session);

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.startTerminal).toHaveBeenCalledWith({ threadId: "thread-1", startToken: "start-token" });
  });

  it("rejects untrusted events before parsing or starting terminal", () => {
    const error = new Error("untrusted terminal IPC");
    const { deps, invoke } = registerStartWithFakes({ trustError: error });

    expect(() => invoke("terminal:start", { threadId: "thread-1", startToken: "start-token" })).toThrow("untrusted terminal IPC");

    expect(deps.startTerminal).not.toHaveBeenCalled();
  });

  it("rejects invalid input after asserting trust and before starting terminal", () => {
    const { deps, event, invoke } = registerStartWithFakes();

    expect(() => invoke("terminal:start", { threadId: "thread-1", startToken: "" })).toThrow();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.startTerminal).not.toHaveBeenCalled();
  });

  it("propagates terminal start errors", async () => {
    const error = new Error("terminal project is unavailable");
    const { deps, invoke } = registerStartWithFakes({ error });
    const input: StartTerminalInput = { threadId: "thread-1", startToken: "start-token" };

    await expect(invoke("terminal:start", input)).rejects.toThrow("terminal project is unavailable");

    expect(deps.startTerminal).toHaveBeenCalledWith(input);
  });
});

describe("registerTerminalSubmitCommandIpc", () => {
  it("registers the terminal submit command channel", () => {
    const { handlers } = registerSubmitCommandWithFakes();

    expect([...handlers.keys()]).toEqual([...terminalSubmitCommandIpcChannels]);
  });

  it("asserts trust and parses input before submitting the command", async () => {
    const { deps, event, invoke } = registerSubmitCommandWithFakes();

    await expect(
      invoke("terminal:submit-command", {
        threadId: "thread-1",
        terminalId: "terminal-1",
        sessionToken: "session-token",
        command: "pnpm test",
        extra: "ignored",
      }),
    ).resolves.toBeUndefined();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.submitTerminalCommand).toHaveBeenCalledWith({
      threadId: "thread-1",
      terminalId: "terminal-1",
      sessionToken: "session-token",
      command: "pnpm test",
    });
  });

  it("rejects untrusted events before parsing or submitting the command", () => {
    const error = new Error("untrusted terminal IPC");
    const { deps, invoke } = registerSubmitCommandWithFakes({ trustError: error });

    expect(() =>
      invoke("terminal:submit-command", {
        threadId: "thread-1",
        terminalId: "terminal-1",
        sessionToken: "session-token",
        command: "pnpm test",
      }),
    ).toThrow("untrusted terminal IPC");

    expect(deps.submitTerminalCommand).not.toHaveBeenCalled();
  });

  it("rejects invalid command input after asserting trust and before submitting", () => {
    const { deps, event, invoke } = registerSubmitCommandWithFakes();

    expect(() =>
      invoke("terminal:submit-command", {
        threadId: "thread-1",
        terminalId: "terminal-1",
        sessionToken: "session-token",
        command: "",
      }),
    ).toThrow();

    expect(() =>
      invoke("terminal:submit-command", {
        threadId: "thread-1",
        terminalId: "terminal-1",
        sessionToken: "session-token",
        command: "x".repeat(20_001),
      }),
    ).toThrow();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.submitTerminalCommand).not.toHaveBeenCalled();
  });

  it("propagates submit command errors", async () => {
    const error = new Error("Command blocked by workspace permission policy.");
    const { deps, invoke } = registerSubmitCommandWithFakes({ error });
    const input: SubmitTerminalCommandInput = sampleSubmitCommandInput();

    await expect(invoke("terminal:submit-command", input)).rejects.toThrow("Command blocked by workspace permission policy.");

    expect(deps.submitTerminalCommand).toHaveBeenCalledWith(input);
  });
});

describe("registerTerminalControlIpc", () => {
  it("registers the terminal control channel", () => {
    const { handlers } = registerControlWithFakes();

    expect([...handlers.keys()]).toEqual([...terminalControlIpcChannels]);
  });

  it("asserts trust and parses input before controlling the terminal", async () => {
    const { deps, event, invoke } = registerControlWithFakes();

    await expect(
      invoke("terminal:control", {
        threadId: "thread-1",
        terminalId: "terminal-1",
        sessionToken: "session-token",
        action: "interrupt",
        extra: "ignored",
      }),
    ).resolves.toBeUndefined();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.controlTerminal).toHaveBeenCalledWith({
      threadId: "thread-1",
      terminalId: "terminal-1",
      sessionToken: "session-token",
      action: "interrupt",
    });
  });

  it("rejects untrusted events before parsing or controlling the terminal", () => {
    const error = new Error("untrusted terminal IPC");
    const { deps, invoke } = registerControlWithFakes({ trustError: error });

    expect(() => invoke("terminal:control", sampleControlInput())).toThrow("untrusted terminal IPC");

    expect(deps.controlTerminal).not.toHaveBeenCalled();
  });

  it("rejects invalid control input after asserting trust and before controlling the terminal", () => {
    const { deps, event, invoke } = registerControlWithFakes();

    expect(() => invoke("terminal:control", { ...sampleControlInput(), action: "escape" })).toThrow();
    expect(() => invoke("terminal:control", { ...sampleControlInput(), sessionToken: "" })).toThrow();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.controlTerminal).not.toHaveBeenCalled();
  });

  it("propagates terminal control errors", async () => {
    const error = new Error("terminal control rejected");
    const { deps, invoke } = registerControlWithFakes({ error });
    const input: TerminalControlInput = sampleControlInput({ action: "enter" });

    await expect(invoke("terminal:control", input)).rejects.toThrow("terminal control rejected");

    expect(deps.controlTerminal).toHaveBeenCalledWith(input);
  });
});

describe("registerTerminalResizeIpc", () => {
  it("registers the terminal resize channel", () => {
    const { handlers } = registerResizeWithFakes();

    expect([...handlers.keys()]).toEqual([...terminalResizeIpcChannels]);
  });

  it("asserts trust and parses input before resizing the terminal", async () => {
    const { deps, event, invoke } = registerResizeWithFakes();

    await expect(
      invoke("terminal:resize", {
        threadId: "thread-1",
        terminalId: "terminal-1",
        sessionToken: "session-token",
        cols: 120,
        rows: 32,
        extra: "ignored",
      }),
    ).resolves.toBeUndefined();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.resizeTerminal).toHaveBeenCalledWith({
      threadId: "thread-1",
      terminalId: "terminal-1",
      sessionToken: "session-token",
      cols: 120,
      rows: 32,
    });
  });

  it("rejects untrusted events before parsing or resizing the terminal", () => {
    const error = new Error("untrusted terminal IPC");
    const { deps, invoke } = registerResizeWithFakes({ trustError: error });

    expect(() => invoke("terminal:resize", sampleResizeInput())).toThrow("untrusted terminal IPC");

    expect(deps.resizeTerminal).not.toHaveBeenCalled();
  });

  it("rejects invalid resize input after asserting trust and before resizing the terminal", () => {
    const { deps, event, invoke } = registerResizeWithFakes();

    expect(() => invoke("terminal:resize", { ...sampleResizeInput(), cols: 19 })).toThrow();
    expect(() => invoke("terminal:resize", { ...sampleResizeInput(), rows: 81 })).toThrow();
    expect(() => invoke("terminal:resize", { ...sampleResizeInput(), cols: 120.5 })).toThrow();
    expect(() => invoke("terminal:resize", { ...sampleResizeInput(), sessionToken: "" })).toThrow();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.resizeTerminal).not.toHaveBeenCalled();
  });

  it("propagates terminal resize errors", async () => {
    const error = new Error("terminal resize rejected");
    const { deps, invoke } = registerResizeWithFakes({ error });
    const input: ResizeTerminalInput = sampleResizeInput({ cols: 88, rows: 24 });

    await expect(invoke("terminal:resize", input)).rejects.toThrow("terminal resize rejected");

    expect(deps.resizeTerminal).toHaveBeenCalledWith(input);
  });
});

describe("registerTerminalStopIpc", () => {
  it("registers the terminal stop channel", () => {
    const { handlers } = registerStopWithFakes();

    expect([...handlers.keys()]).toEqual([...terminalStopIpcChannels]);
  });

  it("asserts trust and parses input before stopping the terminal", async () => {
    const { deps, event, invoke } = registerStopWithFakes();

    await expect(
      invoke("terminal:stop", {
        threadId: "thread-1",
        terminalId: "terminal-1",
        sessionToken: "session-token",
        extra: "ignored",
      }),
    ).resolves.toBeUndefined();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.stopTerminal).toHaveBeenCalledWith({
      threadId: "thread-1",
      terminalId: "terminal-1",
      sessionToken: "session-token",
    });
  });

  it("rejects untrusted events before parsing or stopping the terminal", () => {
    const error = new Error("untrusted terminal IPC");
    const { deps, invoke } = registerStopWithFakes({ trustError: error });

    expect(() => invoke("terminal:stop", sampleStopInput())).toThrow("untrusted terminal IPC");

    expect(deps.stopTerminal).not.toHaveBeenCalled();
  });

  it("rejects invalid stop input after asserting trust and before stopping the terminal", () => {
    const { deps, event, invoke } = registerStopWithFakes();

    expect(() => invoke("terminal:stop", { ...sampleStopInput(), terminalId: "" })).toThrow();
    expect(() => invoke("terminal:stop", { ...sampleStopInput(), sessionToken: "" })).toThrow();

    expect(deps.assertTrustedTerminalIpc).toHaveBeenCalledWith(event);
    expect(deps.stopTerminal).not.toHaveBeenCalled();
  });

  it("propagates terminal stop errors", async () => {
    const error = new Error("terminal stop rejected");
    const { deps, invoke } = registerStopWithFakes({ error });
    const input: StopTerminalInput = sampleStopInput();

    await expect(invoke("terminal:stop", input)).rejects.toThrow("terminal stop rejected");

    expect(deps.stopTerminal).toHaveBeenCalledWith(input);
  });
});

function registerWithFakes({
  intent = sampleTerminalStartIntent(),
  trustError,
  error,
}: {
  intent?: TerminalStartIntent;
  trustError?: Error;
  error?: Error;
} = {}) {
  const event = {} as IpcMainInvokeEvent;
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterTerminalRequestStartIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    assertTrustedTerminalIpc: vi.fn((_event: IpcMainInvokeEvent) => {
      if (trustError) throw trustError;
    }),
    requestTerminalStart: vi.fn(async (_input: RequestTerminalStartInput) => {
      if (error) throw error;
      return intent;
    }),
  };
  registerTerminalRequestStartIpc(deps);

  return {
    deps,
    event,
    handlers,
    intent,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler(event, raw));
    },
  };
}

function sampleTerminalStartIntent(): TerminalStartIntent {
  return {
    threadId: "thread-1",
    token: "terminal-start-token",
    expiresAt: 1_800_000_000_000,
  };
}

function registerStartWithFakes({
  session = sampleTerminalSession(),
  trustError,
  error,
}: {
  session?: TerminalSession;
  trustError?: Error;
  error?: Error;
} = {}) {
  const event = {} as IpcMainInvokeEvent;
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterTerminalStartIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    assertTrustedTerminalIpc: vi.fn((_event: IpcMainInvokeEvent) => {
      if (trustError) throw trustError;
    }),
    startTerminal: vi.fn(async (_input: StartTerminalInput) => {
      if (error) throw error;
      return session;
    }),
  };
  registerTerminalStartIpc(deps);

  return {
    deps,
    event,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler(event, raw));
    },
    session,
  };
}

function sampleTerminalSession(): TerminalSession {
  return {
    id: "terminal-1",
    cwd: "/tmp/workspace",
    workspacePath: "/tmp/workspace",
    sessionToken: "session-token",
    threadId: "thread-1",
    permissionMode: "workspace",
  };
}

function registerSubmitCommandWithFakes({
  trustError,
  error,
}: {
  trustError?: Error;
  error?: Error;
} = {}) {
  const event = {} as IpcMainInvokeEvent;
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterTerminalSubmitCommandIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    assertTrustedTerminalIpc: vi.fn((_event: IpcMainInvokeEvent) => {
      if (trustError) throw trustError;
    }),
    submitTerminalCommand: vi.fn(async (_input: SubmitTerminalCommandInput) => {
      if (error) throw error;
    }),
  };
  registerTerminalSubmitCommandIpc(deps);

  return {
    deps,
    event,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler(event, raw));
    },
  };
}

function sampleSubmitCommandInput(): SubmitTerminalCommandInput {
  return {
    threadId: "thread-1",
    terminalId: "terminal-1",
    sessionToken: "session-token",
    command: "pnpm test",
  };
}

function registerControlWithFakes({
  trustError,
  error,
}: {
  trustError?: Error;
  error?: Error;
} = {}) {
  const event = {} as IpcMainInvokeEvent;
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterTerminalControlIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    assertTrustedTerminalIpc: vi.fn((_event: IpcMainInvokeEvent) => {
      if (trustError) throw trustError;
    }),
    controlTerminal: vi.fn(async (_input: TerminalControlInput) => {
      if (error) throw error;
    }),
  };
  registerTerminalControlIpc(deps);

  return {
    deps,
    event,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler(event, raw));
    },
  };
}

function sampleControlInput(overrides: Partial<TerminalControlInput> = {}): TerminalControlInput {
  return {
    threadId: "thread-1",
    terminalId: "terminal-1",
    sessionToken: "session-token",
    action: "interrupt",
    ...overrides,
  };
}

function registerResizeWithFakes({
  trustError,
  error,
}: {
  trustError?: Error;
  error?: Error;
} = {}) {
  const event = {} as IpcMainInvokeEvent;
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterTerminalResizeIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    assertTrustedTerminalIpc: vi.fn((_event: IpcMainInvokeEvent) => {
      if (trustError) throw trustError;
    }),
    resizeTerminal: vi.fn(async (_input: ResizeTerminalInput) => {
      if (error) throw error;
    }),
  };
  registerTerminalResizeIpc(deps);

  return {
    deps,
    event,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler(event, raw));
    },
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

function registerStopWithFakes({
  trustError,
  error,
}: {
  trustError?: Error;
  error?: Error;
} = {}) {
  const event = {} as IpcMainInvokeEvent;
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterTerminalStopIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    assertTrustedTerminalIpc: vi.fn((_event: IpcMainInvokeEvent) => {
      if (trustError) throw trustError;
    }),
    stopTerminal: vi.fn(async (_input: StopTerminalInput) => {
      if (error) throw error;
    }),
  };
  registerTerminalStopIpc(deps);

  return {
    deps,
    event,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler(event, raw));
    },
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
