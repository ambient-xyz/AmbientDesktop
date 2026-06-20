import { describe, expect, it, vi } from "vitest";

import { createWorkflowActiveRunRegistry } from "./workflowActiveRunRegistry";

describe("createWorkflowActiveRunRegistry", () => {
  it("stores controllers with normalized workspace paths", () => {
    const knownHost = { id: "known" };
    const projectRuntimeHostForKnownWorkspacePath = vi.fn(() => knownHost);
    const projectRuntimeHostForWorkspacePath = vi.fn();
    const registry = createWorkflowActiveRunRegistry({
      normalizeWorkspacePath: (workspacePath) => workspacePath.toUpperCase(),
      projectRuntimeHostForKnownWorkspacePath,
      projectRuntimeHostForWorkspacePath,
    });
    const controller = new AbortController();

    registry.rememberActiveWorkflowRun("run-1", controller, "/workspace/path");

    expect(registry.activeWorkflowRunController("run-1")).toBe(controller);
    expect(registry.activeWorkflowRunHost("run-1")).toBe(knownHost);
    expect(projectRuntimeHostForKnownWorkspacePath).toHaveBeenCalledWith("/WORKSPACE/PATH");
    expect(projectRuntimeHostForWorkspacePath).not.toHaveBeenCalled();
  });

  it("falls back to exact workspace host lookup when no known workspace host owns the run", () => {
    const fallbackHost = { id: "fallback" };
    const registry = createWorkflowActiveRunRegistry({
      normalizeWorkspacePath: (workspacePath) => workspacePath,
      projectRuntimeHostForKnownWorkspacePath: vi.fn(() => undefined),
      projectRuntimeHostForWorkspacePath: vi.fn(() => fallbackHost),
    });

    registry.rememberActiveWorkflowRun("run-1", new AbortController(), "/workspace/path");

    expect(registry.activeWorkflowRunHost("run-1")).toBe(fallbackHost);
  });

  it("forgets one run or every run tied to a finished controller", () => {
    const registry = createWorkflowActiveRunRegistry({
      normalizeWorkspacePath: (workspacePath) => workspacePath,
      projectRuntimeHostForKnownWorkspacePath: vi.fn(),
      projectRuntimeHostForWorkspacePath: vi.fn(),
    });
    const first = new AbortController();
    const second = new AbortController();

    registry.rememberActiveWorkflowRun("run-1", first, "/workspace/one");
    registry.rememberActiveWorkflowRun("run-2", first, "/workspace/two");
    registry.rememberActiveWorkflowRun("run-3", second, "/workspace/three");
    registry.forgetActiveWorkflowRun("run-3");
    registry.forgetActiveWorkflowRunsForController(first);

    expect(registry.activeWorkflowRunController("run-1")).toBeUndefined();
    expect(registry.activeWorkflowRunController("run-2")).toBeUndefined();
    expect(registry.activeWorkflowRunController("run-3")).toBeUndefined();
  });
});
