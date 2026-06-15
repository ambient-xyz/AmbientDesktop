import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { ContextUsageSnapshot } from "../../shared/types";
import {
  contextCompactIpcChannels,
  contextRecoverIpcChannels,
  contextUsageIpcChannels,
  registerContextCompactIpc,
  registerContextRecoverIpc,
  registerContextUsageIpc,
  type RegisterContextCompactIpcDependencies,
  type RegisterContextRecoverIpcDependencies,
  type RegisterContextUsageIpcDependencies,
} from "./registerContextIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerContextUsageIpc", () => {
  it("registers the context usage channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...contextUsageIpcChannels]);
  });

  it("parses the thread id before reading context usage", async () => {
    const { deps, invoke, snapshot } = registerWithFakes();

    await expect(invoke("context:usage", "thread-1")).resolves.toEqual(snapshot);

    expect(deps.getContextUsage).toHaveBeenCalledWith("thread-1");
  });

  it("rejects invalid input before reading context usage", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("context:usage", "")).toThrow();

    expect(deps.getContextUsage).not.toHaveBeenCalled();
  });

  it("propagates context usage errors", async () => {
    const error = new Error("runtime unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("context:usage", "thread-1")).rejects.toThrow("runtime unavailable");

    expect(deps.getContextUsage).toHaveBeenCalledWith("thread-1");
  });
});

describe("registerContextCompactIpc", () => {
  it("registers the context compact channel", () => {
    const { handlers } = registerCompactWithFakes();

    expect([...handlers.keys()]).toEqual([...contextCompactIpcChannels]);
  });

  it("parses input before compacting the thread", async () => {
    const { deps, invoke, snapshot } = registerCompactWithFakes();

    await expect(
      invoke("context:compact", {
        threadId: "thread-1",
        customInstructions: "  Preserve current summary.  ",
        extra: "ignored",
      }),
    ).resolves.toEqual(snapshot);

    expect(deps.compactThread).toHaveBeenCalledWith({
      threadId: "thread-1",
      customInstructions: "Preserve current summary.",
    });
  });

  it("accepts compact input without custom instructions", async () => {
    const { deps, invoke, snapshot } = registerCompactWithFakes();

    await expect(invoke("context:compact", { threadId: "thread-1" })).resolves.toEqual(snapshot);

    expect(deps.compactThread).toHaveBeenCalledWith({ threadId: "thread-1" });
  });

  it("rejects invalid input before compacting the thread", () => {
    const { deps, invoke } = registerCompactWithFakes();

    expect(() => invoke("context:compact", { threadId: "" })).toThrow();
    expect(() => invoke("context:compact", { threadId: "thread-1", customInstructions: "   " })).toThrow();
    expect(() =>
      invoke("context:compact", {
        threadId: "thread-1",
        customInstructions: "x".repeat(20_001),
      }),
    ).toThrow();

    expect(deps.compactThread).not.toHaveBeenCalled();
  });

  it("propagates context compaction errors", async () => {
    const error = new Error("compaction unavailable");
    const { deps, invoke } = registerCompactWithFakes({ error });
    const input = { threadId: "thread-1", customInstructions: "Preserve current summary." };

    await expect(invoke("context:compact", input)).rejects.toThrow("compaction unavailable");

    expect(deps.compactThread).toHaveBeenCalledWith(input);
  });
});

describe("registerContextRecoverIpc", () => {
  it("registers the context recover channel", () => {
    const { handlers } = registerRecoverWithFakes();

    expect([...handlers.keys()]).toEqual([...contextRecoverIpcChannels]);
  });

  it("parses input before recovering thread context", async () => {
    const { deps, invoke, snapshot } = registerRecoverWithFakes();

    await expect(
      invoke("context:recover", {
        threadId: "thread-1",
        reason: "  Rebuild from visible transcript.  ",
        extra: "ignored",
      }),
    ).resolves.toEqual(snapshot);

    expect(deps.recoverThreadContext).toHaveBeenCalledWith({
      threadId: "thread-1",
      reason: "Rebuild from visible transcript.",
    });
  });

  it("accepts recover input without a reason", async () => {
    const { deps, invoke, snapshot } = registerRecoverWithFakes();

    await expect(invoke("context:recover", { threadId: "thread-1" })).resolves.toEqual(snapshot);

    expect(deps.recoverThreadContext).toHaveBeenCalledWith({ threadId: "thread-1" });
  });

  it("rejects invalid input before recovering thread context", () => {
    const { deps, invoke } = registerRecoverWithFakes();

    expect(() => invoke("context:recover", { threadId: "" })).toThrow();
    expect(() => invoke("context:recover", { threadId: "thread-1", reason: "   " })).toThrow();
    expect(() =>
      invoke("context:recover", {
        threadId: "thread-1",
        reason: "x".repeat(20_001),
      }),
    ).toThrow();

    expect(deps.recoverThreadContext).not.toHaveBeenCalled();
  });

  it("propagates context recovery errors", async () => {
    const error = new Error("recovery unavailable");
    const { deps, invoke } = registerRecoverWithFakes({ error });
    const input = { threadId: "thread-1", reason: "Rebuild from visible transcript." };

    await expect(invoke("context:recover", input)).rejects.toThrow("recovery unavailable");

    expect(deps.recoverThreadContext).toHaveBeenCalledWith(input);
  });
});

function registerWithFakes(options: {
  error?: Error;
} = {}): {
  deps: RegisterContextUsageIpcDependencies;
  handlers: Map<string, IpcListener>;
  event: IpcMainInvokeEvent;
  snapshot: ContextUsageSnapshot;
  invoke(channel: string, raw?: unknown): Promise<unknown>;
} {
  const handlers = new Map<string, IpcListener>();
  const snapshot = sampleContextUsageSnapshot();
  const deps: RegisterContextUsageIpcDependencies = {
    handleIpc: vi.fn((channel, listener) => {
      handlers.set(channel, listener);
    }),
    getContextUsage: vi.fn(async () => {
      if (options.error) throw options.error;
      return snapshot;
    }),
  };
  const event = {} as IpcMainInvokeEvent;

  registerContextUsageIpc(deps);

  return {
    deps,
    handlers,
    event,
    snapshot,
    invoke: (channel, raw) => {
      const listener = handlers.get(channel);
      if (!listener) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(listener(event, raw));
    },
  };
}

function registerCompactWithFakes(options: {
  error?: Error;
} = {}): {
  deps: RegisterContextCompactIpcDependencies;
  handlers: Map<string, IpcListener>;
  event: IpcMainInvokeEvent;
  snapshot: ContextUsageSnapshot;
  invoke(channel: string, raw?: unknown): Promise<unknown>;
} {
  const handlers = new Map<string, IpcListener>();
  const snapshot = sampleContextUsageSnapshot();
  const deps: RegisterContextCompactIpcDependencies = {
    handleIpc: vi.fn((channel, listener) => {
      handlers.set(channel, listener);
    }),
    compactThread: vi.fn(async () => {
      if (options.error) throw options.error;
      return snapshot;
    }),
  };
  const event = {} as IpcMainInvokeEvent;

  registerContextCompactIpc(deps);

  return {
    deps,
    handlers,
    event,
    snapshot,
    invoke: (channel, raw) => {
      const listener = handlers.get(channel);
      if (!listener) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(listener(event, raw));
    },
  };
}

function registerRecoverWithFakes(options: {
  error?: Error;
} = {}): {
  deps: RegisterContextRecoverIpcDependencies;
  handlers: Map<string, IpcListener>;
  event: IpcMainInvokeEvent;
  snapshot: ContextUsageSnapshot;
  invoke(channel: string, raw?: unknown): Promise<unknown>;
} {
  const handlers = new Map<string, IpcListener>();
  const snapshot = sampleContextUsageSnapshot();
  const deps: RegisterContextRecoverIpcDependencies = {
    handleIpc: vi.fn((channel, listener) => {
      handlers.set(channel, listener);
    }),
    recoverThreadContext: vi.fn(async () => {
      if (options.error) throw options.error;
      return snapshot;
    }),
  };
  const event = {} as IpcMainInvokeEvent;

  registerContextRecoverIpc(deps);

  return {
    deps,
    handlers,
    event,
    snapshot,
    invoke: (channel, raw) => {
      const listener = handlers.get(channel);
      if (!listener) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(listener(event, raw));
    },
  };
}

function sampleContextUsageSnapshot(): ContextUsageSnapshot {
  return {
    threadId: "thread-1",
    source: "estimate",
    tokens: 1200,
    contextWindow: 128_000,
    percent: 0.009375,
    compactionCount: 0,
    updatedAt: "2026-06-06T00:00:00.000Z",
    diagnostics: {
      activeSession: false,
      message: "Estimated context usage.",
    },
  };
}
