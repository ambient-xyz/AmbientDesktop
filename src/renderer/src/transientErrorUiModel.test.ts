import { describe, expect, it } from "vitest";
import { shouldClearTransientErrorForActiveScope, transientErrorMatchesActiveScope } from "./transientErrorUiModel";

describe("transientErrorMatchesActiveScope", () => {
  it("treats unscoped errors as matching the active view", () => {
    expect(transientErrorMatchesActiveScope(undefined, { threadId: "thread-a", workspacePath: "/workspace" })).toBe(true);
  });

  it("matches errors scoped to the active thread and workspace", () => {
    expect(
      transientErrorMatchesActiveScope(
        { threadId: "thread-a", workspacePath: "/workspace" },
        { threadId: "thread-a", workspacePath: "/workspace" },
      ),
    ).toBe(true);
  });

  it("does not match an error scoped to another thread", () => {
    expect(transientErrorMatchesActiveScope({ threadId: "thread-a" }, { threadId: "thread-b", workspacePath: "/workspace" })).toBe(false);
  });

  it("does not match an error scoped to another workspace", () => {
    expect(transientErrorMatchesActiveScope({ workspacePath: "/workspace-a" }, { threadId: "thread-a", workspacePath: "/workspace-b" })).toBe(false);
  });
});

describe("shouldClearTransientErrorForActiveScope", () => {
  it("clears scoped errors when the active view no longer matches", () => {
    expect(shouldClearTransientErrorForActiveScope({ threadId: "thread-a" }, { threadId: "thread-b", workspacePath: "/workspace" })).toBe(true);
  });

  it("keeps unscoped errors visible until dismissed or replaced", () => {
    expect(shouldClearTransientErrorForActiveScope(undefined, { threadId: "thread-a", workspacePath: "/workspace" })).toBe(false);
  });
});
