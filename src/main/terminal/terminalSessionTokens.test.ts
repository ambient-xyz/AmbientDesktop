import { describe, expect, it } from "vitest";
import { TerminalStartTokenStore } from "./terminalSessionTokens";

describe("TerminalStartTokenStore", () => {
  it("issues one-use start tokens bound to a thread", () => {
    let now = 1_000;
    const tokens = new TerminalStartTokenStore(5_000, () => now);
    const issued = tokens.issue({ threadId: "thread-1", workspacePath: "/workspace-a" });

    expect(issued).toMatchObject({ threadId: "thread-1", workspacePath: "/workspace-a", expiresAt: 6_000 });
    expect(() => tokens.consume({ threadId: "thread-2", token: issued.token })).toThrow(/thread/);
    expect(() => tokens.consume({ threadId: "thread-1", token: issued.token })).toThrow(/already used/);

    const second = tokens.issue({ threadId: "thread-1", workspacePath: "/workspace-a" });
    now = 7_000;
    expect(() => tokens.consume({ threadId: "thread-1", token: second.token })).toThrow(/expired/);
  });

  it("consumes valid tokens exactly once", () => {
    const tokens = new TerminalStartTokenStore();
    const issued = tokens.issue({ threadId: "thread-1", workspacePath: "/workspace-a" });

    expect(tokens.consume({ threadId: "thread-1", token: issued.token })).toMatchObject({
      threadId: "thread-1",
      workspacePath: "/workspace-a",
    });
    expect(() => tokens.consume({ threadId: "thread-1", token: issued.token })).toThrow(/already used/);
  });
});
