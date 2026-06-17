import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const child = {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
  return {
    child,
    spawn: vi.fn(() => child),
  };
});

vi.mock("node-pty", () => ({
  spawn: mocks.spawn,
}));

import { TerminalService } from "./terminalService";

describe("TerminalService", () => {
  beforeEach(() => {
    mocks.child.onData.mockReset();
    mocks.child.onExit.mockReset();
    mocks.child.write.mockReset();
    mocks.child.resize.mockReset();
    mocks.child.kill.mockReset();
    mocks.spawn.mockClear();
    mocks.spawn.mockReturnValue(mocks.child);
  });

  it("binds terminal sessions to the main-process thread and permission mode", () => {
    const sentEvents: any[] = [];
    const service = new TerminalService(
      () => ({ webContents: { send: (_channel: string, event: any) => sentEvents.push(event) } }) as any,
      process.cwd(),
    );

    const session = service.start(process.cwd(), {
      threadId: "thread-1",
      permissionMode: "workspace",
    });

    expect(session).toMatchObject({
      threadId: "thread-1",
      workspacePath: process.cwd(),
      permissionMode: "workspace",
    });
    expect(session.sessionToken).toEqual(expect.any(String));
    expect(mocks.spawn).toHaveBeenCalled();

    const onData = mocks.child.onData.mock.calls[0]?.[0];
    expect(onData).toBeTypeOf("function");
    onData("hello");
    expect(sentEvents).toContainEqual(
      expect.objectContaining({
        type: "terminal-data",
        terminalId: session.id,
        threadId: "thread-1",
        workspacePath: process.cwd(),
      }),
    );
  });

  it("rejects writes and resizes without the bound thread and session token", () => {
    const service = new TerminalService(() => undefined, process.cwd());
    const session = service.start(process.cwd(), {
      threadId: "thread-1",
      permissionMode: "workspace",
    });

    expect(() => service.write(session.id, "echo unsafe\n", { threadId: "thread-2", sessionToken: session.sessionToken })).toThrow(
      /active thread/,
    );
    expect(() => service.write(session.id, "echo unsafe\n", { threadId: "thread-1", sessionToken: "invalid" })).toThrow(/token/);
    expect(() => service.resize(session.id, 100, 30, { threadId: "thread-2", sessionToken: session.sessionToken })).toThrow(
      /active thread/,
    );
    expect(() => service.resize(session.id, 100, 30, { threadId: "thread-1", sessionToken: "invalid" })).toThrow(/token/);
    expect(mocks.child.write).not.toHaveBeenCalled();
    expect(mocks.child.resize).not.toHaveBeenCalled();

    service.write(session.id, "echo ok\n", { threadId: "thread-1", sessionToken: session.sessionToken });
    service.resize(session.id, 100, 30, { threadId: "thread-1", sessionToken: session.sessionToken });
    expect(mocks.child.write).toHaveBeenCalledWith("echo ok\n");
    expect(mocks.child.resize).toHaveBeenCalledWith(100, 30);
  });
});
