import { describe, expect, it } from "vitest";

import {
  workflowThreadComposerDraftForSend,
  workflowThreadComposerDraftsAfterSendFailure,
  workflowThreadComposerDraftsAfterSendStart,
  workflowThreadPlanEditActivityAfterRunStatus,
} from "./AutomationsWorkflowThreadController";

describe("Automations workflow thread controller", () => {
  it("selects a trimmed composer draft only when the composer is idle", () => {
    expect(
      workflowThreadComposerDraftForSend({
        drafts: { "thread-1": "  Revise the workflow  " },
        threadId: "thread-1",
      }),
    ).toEqual({ kind: "ready", draft: "Revise the workflow" });

    expect(
      workflowThreadComposerDraftForSend({
        drafts: { "thread-1": "   " },
        threadId: "thread-1",
      }),
    ).toEqual({ kind: "skip" });
    expect(
      workflowThreadComposerDraftForSend({
        drafts: { "thread-1": "Revise" },
        threadId: "thread-1",
        composerBusy: "thread-2",
      }),
    ).toEqual({ kind: "skip" });
    expect(
      workflowThreadComposerDraftForSend({
        drafts: { "thread-1": "Revise" },
        threadId: "thread-1",
        sessionBusy: "thread-1",
      }),
    ).toEqual({ kind: "skip" });
  });

  it("clears the draft on send start and restores it only if the user has not typed a replacement", () => {
    expect(workflowThreadComposerDraftsAfterSendStart({ "thread-1": "Revise", "thread-2": "Other" }, "thread-1")).toEqual({
      "thread-1": "",
      "thread-2": "Other",
    });

    expect(workflowThreadComposerDraftsAfterSendFailure({ "thread-1": "", "thread-2": "Other" }, "thread-1", "Revise")).toEqual({
      "thread-1": "Revise",
      "thread-2": "Other",
    });
    expect(workflowThreadComposerDraftsAfterSendFailure({ "thread-1": "Newer draft" }, "thread-1", "Revise")).toEqual({
      "thread-1": "Newer draft",
    });
  });

  it("clears transient plan-edit activity when the backing chat run reaches an idle or error state", () => {
    const activity = { id: "activity-1", threadId: "chat-1", kind: "plan", title: "Planning" } as never;
    expect(workflowThreadPlanEditActivityAfterRunStatus({ "thread-1": activity }, "thread-1", "running")).toEqual({
      "thread-1": activity,
    });
    expect(workflowThreadPlanEditActivityAfterRunStatus({ "thread-1": activity }, "thread-1", "idle")).toEqual({
      "thread-1": undefined,
    });
    expect(workflowThreadPlanEditActivityAfterRunStatus({ "thread-1": activity }, "thread-1", "error")).toEqual({
      "thread-1": undefined,
    });
  });
});
