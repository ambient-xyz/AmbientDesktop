import { describe, expect, it } from "vitest";

import type { DesktopEvent } from "../../shared/types";
import {
  agentRuntimeThreadWorkspacePath,
  agentRuntimeWorkflowArtifactWorkspacePath,
  desktopEventWithWorkspacePath,
  desktopEventWorkspacePath,
  type AgentRuntimeEventWorkspaceScopeStore,
} from "./agentRuntimeEventWorkspaceScope";

describe("agentRuntimeEventWorkspaceScope", () => {
  it("keeps events that already have a workspace path unchanged", () => {
    const event = {
      type: "browser-updated",
      state: {},
      workspacePath: "/explicit",
    } as DesktopEvent;

    expect(desktopEventWithWorkspacePath(event, store())).toBe(event);
  });

  it("adds thread workspace paths to message events", () => {
    const event = {
      type: "message-created",
      message: { threadId: "thread-1" },
    } as DesktopEvent;

    expect(desktopEventWithWorkspacePath(event, store({
      threads: { "thread-1": "/workspace/thread" },
    }))).toEqual({
      type: "message-created",
      message: { threadId: "thread-1" },
      workspacePath: "/workspace/thread",
    });
  });

  it("falls back to the current workspace when a thread lookup fails", () => {
    expect(agentRuntimeThreadWorkspacePath(store({ currentWorkspacePath: "/workspace/current" }), "missing-thread")).toBe("/workspace/current");
    expect(desktopEventWorkspacePath({
      type: "message-delta",
      messageId: "message-1",
      delta: "hello",
    }, store({ currentWorkspacePath: "/workspace/current" }) as AgentRuntimeEventWorkspaceScopeStore)).toBe("/workspace/current");
  });

  it("uses grant project/workspace paths before thread fallback", () => {
    expect(desktopEventWorkspacePath({
      type: "permission-grant-created",
      grant: {
        projectPath: "/workspace/project",
        workspacePath: "/workspace/thread",
        threadId: "thread-1",
      },
    } as DesktopEvent, store({ threads: { "thread-1": "/workspace/fallback" } }))).toBe("/workspace/project");

    expect(desktopEventWorkspacePath({
      type: "permission-grant-created",
      grant: {
        threadId: "thread-1",
      },
    } as DesktopEvent, store({ threads: { "thread-1": "/workspace/fallback" } }))).toBe("/workspace/fallback");
  });

  it("resolves workflow events through artifact and workflow thread paths", () => {
    const scopeStore = store({
      currentWorkspacePath: "/workspace/current",
      workflowThreads: {
        "workflow-thread-1": "/workspace/workflow",
        "workflow-thread-fallback": "/workspace/fallback",
      },
      workflowArtifacts: {
        "artifact-1": "workflow-thread-1",
      },
    });

    expect(agentRuntimeWorkflowArtifactWorkspacePath(scopeStore, "artifact-1", "workflow-thread-fallback")).toBe("/workspace/workflow");
    expect(desktopEventWorkspacePath({
      type: "workflow-run-started",
      runId: "run-1",
      artifactId: "missing-artifact",
      workflowThreadId: "workflow-thread-fallback",
    } as DesktopEvent, scopeStore)).toBe("/workspace/fallback");
  });

  it("uses the current workspace for global workspace-scoped events", () => {
    expect(desktopEventWorkspacePath({
      type: "plugin-catalog-updated",
    }, store({ currentWorkspacePath: "/workspace/current" }) as AgentRuntimeEventWorkspaceScopeStore)).toBe("/workspace/current");
  });
});

function store(input: {
  currentWorkspacePath?: string;
  threads?: Record<string, string>;
  workflowThreads?: Record<string, string | undefined>;
  workflowArtifacts?: Record<string, string | undefined>;
} = {}): AgentRuntimeEventWorkspaceScopeStore {
  return {
    getThread(threadId) {
      const workspacePath = input.threads?.[threadId];
      if (!workspacePath) throw new Error(`Unknown thread: ${threadId}`);
      return { workspacePath };
    },
    getWorkspace() {
      if (!input.currentWorkspacePath) throw new Error("No workspace.");
      return { path: input.currentWorkspacePath };
    },
    getWorkflowAgentThreadSummary(workflowThreadId) {
      const projectPath = input.workflowThreads?.[workflowThreadId];
      if (projectPath === undefined && !(workflowThreadId in (input.workflowThreads ?? {}))) {
        throw new Error(`Unknown workflow thread: ${workflowThreadId}`);
      }
      return { projectPath };
    },
    getWorkflowArtifact(artifactId) {
      const workflowThreadId = input.workflowArtifacts?.[artifactId];
      if (workflowThreadId === undefined && !(artifactId in (input.workflowArtifacts ?? {}))) {
        throw new Error(`Unknown workflow artifact: ${artifactId}`);
      }
      return { workflowThreadId };
    },
  };
}
