import { describe, expect, it, vi } from "vitest";

import { runtimeActiveSessionResetPlan } from "./agentRuntimeActiveSessionReset";

describe("agentRuntimeActiveSessionReset", () => {
  it("plans disposed and deferred sessions in existing session order", () => {
    const idleA = { dispose: vi.fn() };
    const active = { dispose: vi.fn() };
    const idleB = { dispose: vi.fn() };

    const plan = runtimeActiveSessionResetPlan(
      [
        ["idle-a", idleA],
        ["active", active],
        ["idle-b", idleB],
      ],
      new Set(["active"]),
    );

    expect(plan.actions).toEqual([
      { status: "disposed", threadId: "idle-a", session: idleA },
      { status: "deferred", threadId: "active", session: active },
      { status: "disposed", threadId: "idle-b", session: idleB },
    ]);
    expect(plan.result).toEqual({
      disposedSessions: 2,
      deferredSessions: 1,
      disposedThreadIds: ["idle-a", "idle-b"],
      deferredThreadIds: ["active"],
    });
    expect(idleA.dispose).not.toHaveBeenCalled();
    expect(active.dispose).not.toHaveBeenCalled();
    expect(idleB.dispose).not.toHaveBeenCalled();
  });
});
