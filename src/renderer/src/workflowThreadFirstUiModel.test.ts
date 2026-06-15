import { describe, expect, it } from "vitest";
import { workflowArtifactThreadRoute } from "./workflowThreadFirstUiModel";

describe("workflowThreadFirstUiModel", () => {
  it("routes linked artifacts directly to their loaded Workflow Agent thread", () => {
    expect(
      workflowArtifactThreadRoute({
        artifact: { workflowThreadId: "thread-1", title: "Inbox workflow" },
        workflowThread: { id: "thread-1", title: "Inbox workflow" },
      }),
    ).toMatchObject({
      kind: "workflow_thread",
      actionLabel: "Open Workflow Agent thread",
      workflowThreadId: "thread-1",
      disabled: false,
    });
  });

  it("allows a folder refresh when the artifact has a thread id but the thread is not loaded", () => {
    expect(
      workflowArtifactThreadRoute({
        artifact: { workflowThreadId: "thread-2", title: "Lead triage" },
      }),
    ).toMatchObject({
      kind: "refresh_workflow_threads",
      actionLabel: "Find Workflow Agent thread",
      workflowThreadId: "thread-2",
      disabled: false,
    });
  });

  it("blocks duplicate legacy controls when no Workflow Agent thread exists", () => {
    expect(workflowArtifactThreadRoute({ artifact: { title: "Old artifact" } })).toMatchObject({
      kind: "legacy_only",
      actionLabel: "Workflow thread unavailable",
      disabled: true,
    });
  });
});
