import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { SubagentMailboxEventSummary, SubagentRunEventSummary } from "../../shared/subagentTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import type { RunActivityLine } from "./AppRunActivity";
import { subagentParentClusterFixtureModel } from "./SubagentParentCluster.fixture";
import { SubagentChildTranscriptLive } from "./SubagentChildTranscriptLive";
import type { SubagentParentClusterChildModel } from "./subagentParentClusterUiModel";

describe("SubagentChildTranscriptLive", () => {
  it("sym-live-ux-export renders a live child transcript shell with runtime event context", () => {
    const child = fixtureChild(0);
    const markup = renderChildTranscript(child, {
      runtimeEvents: [
        event(1, "subagent.session.started", { summary: "Child session started." }),
        event(2, "subagent.approval.blocked", { message: "Needs parent approval." }),
      ],
      runStatus: "streaming",
    });

    expect(markup).toContain("subagent-parent-cluster-child-transcript-live");
    expect(markup).toContain("data-child-run-id=\"child-run-1\"");
    expect(markup).toContain("data-child-terminal=\"false\"");
    expect(markup).toContain("data-child-runtime-event-count=\"2\"");
    expect(markup).toContain("data-child-runtime-event-rendered-count=\"2\"");
    expect(markup).toContain("data-child-transcript-primary=\"false\"");
    expect(markup).toContain("data-child-runtime-events-open=\"true\"");
    expect(markup).toContain("data-child-transcript-stream-live=\"true\"");
    expect(markup).toContain("data-child-streaming=\"false\"");
    expect(markup).toContain("data-child-tool-message-count=\"0\"");
    expect(markup).toContain("data-child-renderer=\"message-bubble\"");
    expect(markup).toContain("data-child-run-activity-count=\"0\"");
    expect(markup).toContain("data-child-run-activity-visible=\"false\"");
    expect(markup).toContain("data-child-run-activity-placement=\"hidden\"");
    expect(markup).toContain("data-child-transcript-flow=\"messages-first\"");
    expect(markup).toContain("data-child-secondary-flow=\"after-transcript-stream\"");
    expect(markup).toContain("Child thread");
    expect(markup).toContain("Open full thread");
    expect(markup).toContain("Live");
    expect(markup).toContain("0 messages");
    expect(markup).toContain("2 runtime events");
    expect(markup).toContain("No child transcript messages have arrived yet.");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-runtime-events\"");
    expect(markup).toContain("open=\"\"");
    expect(markup).toContain("Runtime timeline");
    expect(markup).toContain("2 events");
    expect(markup).toContain("Subagent Approval Blocked");
    expect(markup).toContain("Needs parent approval.");
    expect(markup).toContain("Child is paused for parent action");
    expect(markup).not.toContain("data-child-terminal-summary=\"true\"");
  });

  it("renders parent-style live activity before child messages arrive", () => {
    const child = fixtureChild(0);
    const markup = renderChildTranscript(child, {
      runStatus: "streaming",
      runActivityLines: [
        activityLine("activity-1", "thinking", "Reading delegated files."),
        activityLine("activity-2", "tool", "Workspace Read running for invoice.pdf"),
      ],
    });

    expect(markup).toContain("data-child-message-count=\"0\"");
    expect(markup).toContain("data-child-run-activity-count=\"2\"");
    expect(markup).toContain("data-child-run-activity-visible=\"true\"");
    expect(markup).toContain("data-child-run-activity-placement=\"before-transcript\"");
    expect(markup).toContain("2 activity lines");
    expect(markup).toContain("aria-label=\"Live child activity for Reviewer\"");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-run-activity\"");
    expect(markup).toContain("class=\"message run-activity default\"");
    expect(markup).toContain("<strong>Working</strong>");
    expect(markup).toContain("Reading delegated files.");
    expect(markup).toContain("Workspace Read running for invoice.pdf");
    expect(markup).toContain("No child transcript messages have arrived yet.");
  });

  it("renders queued child mailbox work in the live child timeline", () => {
    const child = fixtureChild(0);
    const markup = renderChildTranscript(child, {
      mailboxEvents: [
        mailboxEvent("mailbox-task", "subagent.task", "queued", {
          task: "Initial task metadata should not become a child mailbox timeline row.",
        }),
        mailboxEvent("mailbox-retry", "subagent.retry", "queued", {
          previousStatus: "failed",
          message: "Retry the original delegated task in this same visible child thread.",
        }),
        mailboxEvent("mailbox-approval", "subagent.approval_response", "delivered", {
          approvalId: "approval-1",
          decision: "approved",
          effectiveScope: "this_child_thread",
        }),
      ],
      runStatus: "streaming",
    });

    expect(markup).toContain("data-child-mailbox-event-count=\"2\"");
    expect(markup).toContain("data-child-mailbox-event-rendered-count=\"2\"");
    expect(markup).toContain("data-child-mailbox-event-omitted-count=\"0\"");
    expect(markup).toContain("data-child-mailbox-events-open=\"true\"");
    expect(markup).toContain("2 mailbox events");
    expect(markup).toContain("Child mailbox");
    expect(markup).not.toContain("Initial task metadata should not become a child mailbox timeline row.");
    expect(markup).toContain("Parent retry request");
    expect(markup).toContain("Delivery: queued / Retry the original delegated task in this same visible child thread.");
    expect(markup).toContain("Parent approval response");
    expect(markup).toContain("Delivery: delivered / Decision: approved / Effective scope: this_child_thread");
  });

  it("keeps live runtime and mailbox rails open after child messages arrive", () => {
    const child = fixtureChild(0);
    const markup = renderChildTranscript(child, {
      messages: [
        message({ id: "child-user-1", role: "user", content: "Review this file." }),
        message({ id: "child-assistant-1", role: "assistant", content: "I am checking the file now." }),
      ],
      runtimeEvents: [
        event(1, "subagent.session.started", { summary: "Child session started." }),
      ],
      mailboxEvents: [
        mailboxEvent("mailbox-followup", "subagent.followup", "delivered", {
          messagePreview: "Parent follow-up delivered while the review worker remains live and inspectable.",
        }),
      ],
      runStatus: "streaming",
    });

    expect(markup).toContain("data-child-transcript-primary=\"true\"");
    expect(markup).toContain("data-child-runtime-events-open=\"true\"");
    expect(markup).toContain("data-child-mailbox-events-open=\"true\"");
    expect(markup).toContain("Parent follow-up queued");
    expect(markup).toContain("Parent follow-up delivered while the review worker remains live and inspectable.");
  });

  it("renders child messages as a mini thread with streaming and tool-call evidence", () => {
    const child = fixtureChild(0);
    const markup = renderChildTranscript(child, {
      messages: [
        message({ id: "child-user-1", role: "user", content: "Read the attached PDF and extract the invoice total." }),
        message({
          id: "child-thinking-1",
          role: "assistant",
          content: "Checking the file before summarizing.",
          metadata: { kind: "thinking", status: "thinking" },
        }),
        message({
          id: "child-tool-1",
          role: "tool",
          content: [
            "Workspace Read done",
            "",
            "Input",
            "{\"path\":\"invoice.pdf\"}",
            "",
            "Result",
            "Tool output from child: invoice total was $42.00.",
          ].join("\n"),
          metadata: { toolName: "Workspace Read", status: "done" },
        }),
        message({
          id: "child-assistant-1",
          role: "assistant",
          content: "The invoice total appears to be $42.00.",
          metadata: { status: "streaming" },
        }),
      ],
      runtimeEvents: Array.from({ length: 30 }, (_, index) =>
        event(index + 1, "subagent.runtime.progress", { summary: `Event ${index + 1}` })
      ),
      runStatus: "streaming",
      thinkingDisplayMode: "full",
      runActivityLines: [
        activityLine("activity-1", "thinking", "Checking the file before summarizing."),
        activityLine("activity-2", "tool", "Workspace Read returned invoice total."),
      ],
    });

    expect(markup).toContain("data-child-message-count=\"4\"");
    expect(markup).toContain("data-child-runtime-event-count=\"30\"");
    expect(markup).toContain("data-child-runtime-event-rendered-count=\"24\"");
    expect(markup).toContain("data-child-runtime-event-omitted-count=\"6\"");
    expect(markup).toContain("data-child-transcript-primary=\"true\"");
    expect(markup).toContain("data-child-runtime-events-open=\"true\"");
    expect(markup).toContain("data-child-transcript-stream-live=\"true\"");
    expect(markup).toContain("data-child-streaming=\"true\"");
    expect(markup).toContain("data-child-tool-message-count=\"1\"");
    expect(markup).toContain("data-child-renderer=\"message-bubble+tool-card\"");
    expect(markup).toContain("data-child-run-activity-visible=\"true\"");
    expect(markup).toContain("data-child-run-activity-placement=\"after-transcript\"");
    expect(markup).toContain("aria-label=\"Child thread messages for Reviewer\"");
    expect(markup).toContain("Open full child thread Reviewer");
    expect(markup).toContain("4 messages");
    expect(markup).toContain("1 tool card");
    expect(markup).toContain("2 streaming messages");
    expect(markup).toContain("2 activity lines");
    expect(markup).toContain("Live child activity for Reviewer");
    expect(markup).toContain("Latest 24 of 30 events");
    expect(markup).toContain("class=\"subagent-parent-cluster-child-runtime-events\"");
    expect(markup).toContain("open=\"\"");
    expect(markup).not.toContain(">Event 1<");
    expect(markup).toContain("Event 30");
    expect(markup).toContain("Read the attached PDF");
    expect(markup).toContain("Thinking");
    expect(markup).toContain("Checking the file before summarizing.");
    expect(markup).toContain("class=\"tool-card\"");
    expect(markup).toContain("status-done");
    expect(markup).toContain("Workspace Read");
    expect(markup).toContain("invoice.pdf");
    expect(markup).toContain("Tool output from child");
    expect(markup).toContain("Workspace Read returned invoice total.");
    expect(markup).toContain("Ambient");
    expect(markup).toContain("The invoice total appears to be $42.00.");
    expectInOrder(markup, "class=\"subagent-parent-cluster-child-transcript-stream\"", "aria-label=\"Live child activity for Reviewer\"");
    expectInOrder(markup, "The invoice total appears to be $42.00.", "Workspace Read returned invoice total.");
    expect(markup).not.toContain("data-child-terminal-summary=\"true\"");
  });

  it("renders a terminal synthesis-safe child result with an end cap below the transcript", () => {
    const child = fixtureChild(1);
    const markup = renderChildTranscript(child, {
      messages: [
        message({
          id: "child-tool-terminal-1",
          role: "tool",
          content: [
            "Workspace Read done",
            "",
            "Input",
            "{\"path\":\"trip-notes.md\"}",
            "",
            "Result",
            "Child verified the notes and extracted three destination candidates.",
          ].join("\n"),
          metadata: { toolName: "Workspace Read", status: "done" },
        }),
        message({
          id: "child-assistant-terminal-1",
          role: "assistant",
          content: "I found three viable destinations and preserved the source notes for the parent.",
          metadata: { status: "done" },
        }),
      ],
      runtimeEvents: [
        event(1, "subagent.session.started", { summary: "Child session started." }),
        event(2, "subagent.result.ready", { summary: "Child result is ready for synthesis." }),
      ],
      runStatus: "idle",
    });

    expect(markup).toContain("data-child-run-id=\"child-run-2\"");
    expect(markup).toContain("data-child-terminal=\"true\"");
    expect(markup).toContain("data-child-synthesis-safe=\"true\"");
    expect(markup).toContain("data-child-message-count=\"2\"");
    expect(markup).toContain("data-child-transcript-primary=\"true\"");
    expect(markup).toContain("data-child-tool-message-count=\"1\"");
    expect(markup).toContain("data-child-renderer=\"message-bubble+tool-card\"");
    expect(markup).toContain("data-child-run-activity-visible=\"false\"");
    expect(markup).toContain("terminal end cap below");
    expect(markup).toContain("data-child-terminal-summary=\"true\"");
    expect(markup).toContain("data-child-transcript-stream-live=\"false\"");
    expect(markup).toContain("Child verified the notes and extracted three destination candidates.");
    expect(markup).toContain("I found three viable destinations");
    expect(markup).toContain("Completion summary");
    expect(markup).toContain("Summary retained for parent synthesis.");
    expect(markup).not.toContain("No child transcript messages have arrived yet.");
    expect(markup).not.toContain("Child is running");
    expectInOrder(markup, "class=\"subagent-parent-cluster-child-transcript-stream\"", "data-child-terminal-summary=\"true\"");
    expectInOrder(markup, "Child verified the notes", "data-child-terminal-summary=\"true\"");
    expectInOrder(markup, "I found three viable destinations", "data-child-terminal-summary=\"true\"");
    expectInOrder(markup, "Runtime timeline", "data-child-terminal-summary=\"true\"");
    expectInOrder(markup, "data-child-terminal-summary=\"true\"", "Summary retained for parent synthesis.");
  });
});

function renderChildTranscript(
  child: SubagentParentClusterChildModel,
  {
    runtimeEvents = [],
    runStatus = "idle",
    messages = [],
    thinkingDisplayMode = "transient",
    runActivityLines = [],
    mailboxEvents = [],
  }: {
    runtimeEvents?: SubagentRunEventSummary[];
    mailboxEvents?: SubagentMailboxEventSummary[];
    runStatus?: "idle" | "streaming";
    messages?: ChatMessage[];
    thinkingDisplayMode?: ThinkingDisplayMode;
    runActivityLines?: RunActivityLine[];
  } = {},
): string {
  const callbacks = callbackProps();
  return renderToStaticMarkup(
    <SubagentChildTranscriptLive
      child={child}
      messages={messages}
      workspacePath="/workspace"
      runtimeEvents={runtimeEvents}
      mailboxEvents={mailboxEvents}
      runStatus={runStatus}
      parentRunning={false}
      thinkingDisplayMode={thinkingDisplayMode}
      voiceProviderLabels={{}}
      generatedMediaAutoplay={false}
      runActivityLines={runActivityLines}
      hasProjectBoard={false}
      onPreviewPath={callbacks.onPreviewPath}
      onPreviewLocalPath={callbacks.onPreviewLocalPath}
      onOpenMediaModal={callbacks.onOpenMediaModal}
      onActiveVoiceMessageChange={callbacks.onActiveVoiceMessageChange}
      onRegenerateVoice={callbacks.onRegenerateVoice}
      onRevealVoiceArtifact={callbacks.onRevealVoiceArtifact}
      onClearVoiceArtifact={callbacks.onClearVoiceArtifact}
      onOpenUrl={callbacks.onOpenUrl}
      onOpenBrowserUrl={callbacks.onOpenBrowserUrl}
      onOpenBrowserPanel={callbacks.onOpenBrowserPanel}
      onImplementPlannerPlan={callbacks.onImplementPlannerPlan}
      onRefinePlannerPlan={callbacks.onRefinePlannerPlan}
      onRetryPlannerFinalization={callbacks.onRetryPlannerFinalization}
      onAddPlannerPlanToBoard={callbacks.onAddPlannerPlanToBoard}
      onGeneratePlannerDurableArtifact={callbacks.onGeneratePlannerDurableArtifact}
      onAnswerPlannerDecisionQuestion={callbacks.onAnswerPlannerDecisionQuestion}
      onOpenThread={callbacks.onOpenThread}
    />,
  );
}

function fixtureChild(index: number): SubagentParentClusterChildModel {
  const child = subagentParentClusterFixtureModel().children[index];
  if (!child) {
    throw new Error(`Missing fixture child at index ${index}`);
  }
  return child;
}

function event(
  sequence: number,
  type: string,
  preview?: unknown,
): SubagentRunEventSummary {
  const second = String(sequence).padStart(2, "0");
  return {
    runId: "child-run-1",
    sequence,
    type,
    createdAt: `2026-06-13T00:00:${second}.000Z`,
    ...(preview !== undefined ? { preview } : {}),
  };
}

function mailboxEvent(
  id: string,
  type: string,
  deliveryState: SubagentMailboxEventSummary["deliveryState"],
  payload: unknown,
): SubagentMailboxEventSummary {
  return {
    id,
    runId: "child-run-1",
    direction: "parent_to_child",
    type,
    payload,
    deliveryState,
    createdAt: `2026-06-13T00:01:${id.endsWith("approval") ? "02" : "01"}.000Z`,
  };
}

function message(input: Partial<ChatMessage>): ChatMessage {
  return {
    id: "child-message",
    threadId: "child-thread-1",
    role: "assistant",
    content: "",
    createdAt: "2026-06-13T00:00:00.000Z",
    ...input,
  };
}

function activityLine(id: string, kind: RunActivityLine["kind"], text: string): RunActivityLine {
  return {
    id,
    kind,
    text,
    timestamp: 1,
  };
}

function expectInOrder(markup: string, earlier: string, later: string): void {
  const earlierIndex = markup.indexOf(earlier);
  const laterIndex = markup.indexOf(later);
  expect(earlierIndex, `Expected markup to include ${earlier}`).toBeGreaterThanOrEqual(0);
  expect(laterIndex, `Expected markup to include ${later}`).toBeGreaterThanOrEqual(0);
  expect(earlierIndex, `Expected ${earlier} to render before ${later}`).toBeLessThan(laterIndex);
}

function callbackProps() {
  return {
    onPreviewPath: vi.fn(),
    onPreviewLocalPath: vi.fn(),
    onOpenMediaModal: vi.fn(),
    onActiveVoiceMessageChange: vi.fn(),
    onRegenerateVoice: vi.fn(),
    onRevealVoiceArtifact: vi.fn(),
    onClearVoiceArtifact: vi.fn(),
    onOpenUrl: vi.fn(),
    onOpenBrowserUrl: vi.fn(),
    onOpenBrowserPanel: vi.fn(),
    onImplementPlannerPlan: vi.fn(),
    onRefinePlannerPlan: vi.fn(),
    onRetryPlannerFinalization: vi.fn(),
    onAddPlannerPlanToBoard: vi.fn(),
    onGeneratePlannerDurableArtifact: vi.fn(),
    onAnswerPlannerDecisionQuestion: vi.fn(),
    onOpenThread: vi.fn(),
  };
}
